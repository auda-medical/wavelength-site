// One authoritative reading of a supervisor's Wavelength verification (October 2026 supervisor QA), shared by the
// supervisor's own status screen (GET /api/app/supervisor), the learner's view of each linked supervisor
// (GET /api/app/supervisors), supervisor search and the admin console. Every caller reads it from here, so the same
// records can never be described two ways.
//
// What it reads (nothing is stored): currentStatus() from professional.js (approvals derived on every read: email,
// registration, required credentials, review date and grace) and standingOf() from supervisor-lifecycle.js, plus the
// person's open and last decided application.
//
// state (one word, precedence top to bottom):
//   verified        at least one current approval (a renewal inside its 30-day grace is 'renewal_review')
//   renewal_review  every current approval is inside a renewal's grace period
//   paused          approvals exist, none current (a registration, credential or email lapse)
//   more_info       an open application the team asked more information about
//   pending         an open, submitted application
//   revoked | expired | withdrawn   the last approval ended this way, nothing open
//   rejected        the last application was rejected, nothing open
//   none            never applied, or only an unsent draft
// A verified supervisor can also have genuine pending items (a renewal, a further application or a credential still
// being checked): they are listed in `pending`, separately, and never mixed into the approved groups.
//
// Audiences: 'self' (the supervisor), 'learner' (a learner linked to them, or searching), 'admin'. A learner sees
// only the state, the approved groups and dates: never pending items, lapse reasons, blocks, credentials, notes,
// registration numbers or evidence.
import LOGBOOK from '../../data/logbook.json';
import CFG from '../../data/credentials.json';
import { ukDate } from '../time.js';
// Approval roles: production approves supervisors only; the other labels are ready for migration 0015's roles.
const ROLE = { supervisor: 'Supervisor', trainer: 'Trainer', mentor: 'Mentor', local_supervisor: 'Locally approved supervisor' };
const capacityLabel = (c) => ROLE[c] || ROLE.supervisor;

const PATHS = Object.fromEntries(LOGBOOK.pathways.map((p) => [p.id, p]));
const TYPES = Object.fromEntries(CFG.credentialTypes.map((t) => [t.id, t]));
const BODIES = Object.fromEntries(CFG.bodies.map((b) => [b.id, b]));
const list = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
// The UK calendar date of a stored time (ISO, or SQLite's 'YYYY-MM-DD HH:MM:SS' in UTC): an approval at 23:30 UTC in
// summer is the next day in the UK. A bare date is kept as it is.
const day = (v) => {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? ukDate(t) : s.slice(0, 10);
};

// Current approval rows grouped by pathway and role, in logbook order. Each group: the pathway, the verified role
// (capacity), the approved modules (or every module), the date Wavelength last verified it (approval or renewal) and
// the earliest "approved until" date in the group.
export function approvedGroups(approvals) {
  const order = LOGBOOK.pathways.map((p) => p.id);
  const by = new Map();
  for (const a of approvals) {
    const role = a.capacity || 'supervisor';
    const k = `${a.pathway}|${role}`;
    if (!by.has(k)) by.set(k, { pathway: a.pathway, pathwayLabel: (PATHS[a.pathway] || {}).label || a.pathway, role, roleLabel: capacityLabel(role), allModules: false, modules: [], verifiedOn: null, reviewOn: null, grace: false });
    const g = by.get(k);
    if (a.module === '*') g.allModules = true;
    else if (!g.modules.some((m) => m.id === a.module)) {
      const m = ((PATHS[a.pathway] || {}).modules || []).find((x) => x.id === a.module);
      g.modules.push({ id: a.module, label: m ? m.label : a.module });
    }
    const v = day(a.last_renewed_at || a.approved_at);
    if (v && (!g.verifiedOn || v > g.verifiedOn)) g.verifiedOn = v;
    if (a.review_on && (!g.reviewOn || a.review_on < g.reviewOn)) g.reviewOn = a.review_on;
    if (a.grace) g.grace = true;
  }
  const mods = (p) => ((PATHS[p] || {}).modules || []).map((m) => m.id);
  return [...by.values()]
    .map((g) => ({ ...g, modules: g.allModules ? [] : g.modules.sort((x, y) => mods(g.pathway).indexOf(x.id) - mods(g.pathway).indexOf(y.id)) }))
    .sort((x, y) => order.indexOf(x.pathway) - order.indexOf(y.pathway) || x.roleLabel.localeCompare(y.roleLabel));
}
// One line per group, for emails and the admin console: "FAMUS pathway, supervisor: Thoracic and DVT". Module
// names that hold a comma or "and" themselves ("Chest, advanced", "Chest: heart and lung") are kept apart with
// semicolons, so the list cannot be misread.
export function groupLine(g) {
  const labels = g.modules.map((m) => m.label);
  const semi = labels.some((x) => /,| and /.test(x));
  const mods = g.allModules ? `all ${g.pathwayLabel} modules` : semi ? labels.join('; ') : labels.reduce((s, x, i, a) => (i === 0 ? x : i === a.length - 1 ? `${s} and ${x}` : `${s}, ${x}`), '');
  return `${g.pathwayLabel} pathway, ${g.roleLabel.toLowerCase()}: ${mods}`;
}

// The credentials current approvals rely on (required basis), for the supervisor's own More info: label, issuer and
// expiry. Never the reference, evidence or anything the body did not publish.
function basisCredentials(st, current) {
  const ids = new Set(current.flatMap((a) => list(a.required_basis).map(Number)));
  return st.credentials.filter((c) => ids.has(c.id)).map((c) => ({ label: (TYPES[c.credential_type] || {}).label || c.credential_type, issuer: (BODIES[c.issuer] || {}).name || c.issuer, expiresOn: c.expires_on || null, reviewOn: c.review_on || null }));
}
const CRED_PENDING = ['claimed', 'evidence_required', 'manual_review', 'more_evidence', 'not_found', 'source_unavailable', 'directory_match', 'identity_pending'];

// st: currentStatus(); s: standingOf(); open: the open application row or null; last: the last decided application or
// null. Pure: callers read the rows.
export function verificationView(st, s, { open = null, last = null, audience = 'self' } = {}) {
  const current = st.approvals.filter((a) => a.current);
  const sent = open && open.status !== 'draft' ? open : null;
  let state;
  if (current.length) state = current.every((a) => a.grace) ? 'renewal_review' : 'verified';
  else if (st.approvals.length) state = 'paused';
  else if (sent) state = sent.status === 'more_info' ? 'more_info' : 'pending';
  else if (['expired', 'withdrawn', 'revoked'].includes(s && s.standing)) state = s.standing;
  else if (last && last.status === 'rejected') state = 'rejected';
  else if (st.block) state = 'revoked';
  else state = 'none';
  const verified = state === 'verified' || state === 'renewal_review';
  const groups = verified ? approvedGroups(current) : [];
  const out = { v: 1, state, verified, approved: groups, reviewOn: groups.map((g) => g.reviewOn).filter(Boolean).sort()[0] || null };
  if (audience === 'learner') {
    // A learner sees whether the supervisor is verified now, and for what. Anything else reads as not verified: a
    // lapse, a block, a rejection or an ending is the supervisor's own business.
    if (!verified) { out.state = state === 'pending' || state === 'more_info' ? 'pending' : 'not_verified'; out.reviewOn = null; }
    return out;
  }
  // Genuine pending items, never merged into the approved groups.
  const pending = [];
  if (sent) pending.push({ kind: sent.kind === 'renewal' ? 'renewal' : 'application', status: sent.status, since: day(sent.submitted_at), application: sent.id, areas: list(sent.requested_areas), pathways: list(sent.requested_pathways) });
  else if (open && open.status === 'draft') pending.push({ kind: 'draft', status: 'draft', since: day(open.updated_at || open.created_at), application: open.id });
  for (const c of st.credentials) if (CRED_PENDING.includes(c.status)) pending.push({ kind: 'credential', status: c.status, label: (TYPES[c.credential_type] || {}).label || c.credential_type });
  out.pending = pending;
  out.lapse = s && s.lapse ? s.lapse : null;
  out.blocked = !!(st.block && !st.block.one_off_permitted);
  out.credentials = verified ? basisCredentials(st, current) : [];
  if (state === 'renewal_review') out.graceUntil = current.map((a) => a.graceUntil).filter(Boolean).sort()[0] || null;
  return out;
}
