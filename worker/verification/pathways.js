// Pathway-specific supervision authority (data/supervision-policy.json). One engine for every pathway:
//   capacitiesFor(pathway, module)        the capacities a pathway module recognises (supervisor, trainer, mentor, local)
//   allowedActions(pathway, module, cap)  what a capacity may do there (witness, review, formative, summative, dops, final)
//   actionsForSignoff(basis), actionsForAssessment(kind)
//   authority(approvals, scope, actions)  does a current approval cover this scope in a capacity allowed these actions?
//   credentialState(c)                    the precise display state of a credential (never "verified" from a name match)
//   pathwayReport(env, r)                 aggregate counts per pathway for the business dashboard (no clinical content)
// Credentials issued by outside bodies are evidence for a Wavelength approval; they never grant a permission directly.
import POLICY from '../../data/supervision-policy.json';
import CFG from '../../data/credentials.json';
import LOGBOOK from '../../data/logbook.json';

export const ACTIONS = Object.keys(POLICY.actions);
export const CAPACITIES = Object.keys(POLICY.capacities);
const list = (v) => (v === 'all' ? POLICY.all : Array.isArray(v) ? v : []);

function ruleFor(pathway, module) {
  const pw = POLICY.pathways[pathway];
  if (!pw) return { capacities: POLICY.default, credentialFor: {}, source: null, rule: null, pathway: null };
  const mod = module && pw.modules && pw.modules[module];
  return { capacities: (mod && mod.capacities) || pw.capacities, credentialFor: (mod && mod.credentialFor) || pw.credentialFor || {}, source: (mod && mod.source) || pw.source, rule: (mod && mod.rule) || pw.rule, note: (mod && mod.note) || null, asyncReview: pw.asyncReview || null, pathway: pw };
}
export function capacitiesFor(pathway, module) { return Object.keys(ruleFor(pathway, module).capacities); }
// For an approval of '*' (every module of a pathway), each module's own rule still applies.
export function allowedActions(pathway, module, capacity) {
  if (module === '*') return POLICY.all.filter((a) => (moduleIds(pathway).length ? moduleIds(pathway).every((m) => allowedActions(pathway, m, capacity).includes(a)) : list(ruleFor(pathway, null).capacities[capacity]).includes(a)));
  return list(ruleFor(pathway, module).capacities[capacity || 'supervisor']);
}
const MODULES = Object.fromEntries(LOGBOOK.pathways.map((p) => [p.id, (p.modules || []).map((m) => m.id)]));
const moduleIds = (pathway) => MODULES[pathway] || [];
export const actionsForSignoff = (basis) => (basis === 'witnessed' ? ['witness'] : basis === 'reviewed' ? ['review'] : basis === 'both' ? ['witness', 'review'] : ['review']);
export const actionsForAssessment = (kind) => (ACTIONS.includes(kind) ? [kind] : ['final']);
export const capacityLabel = (c) => (POLICY.capacities[c] || POLICY.capacities.supervisor).label;
export const policySource = (pathway, module) => { const r = ruleFor(pathway, module); return { source: r.source, rule: r.rule, note: r.note, asyncReview: r.asyncReview }; };
// Credential types that can support an approval in this capacity (for the admin's basis check).
export const credentialsForCapacity = (pathway, module, capacity) => ruleFor(pathway, module).credentialFor[capacity] || [];

const covers = (a, scope) => scope === `${a.pathway}:${a.module}` || (a.module === '*' && scope.startsWith(`${a.pathway}:`));
// The approval that authorises these actions for a scope, or null. approvals: current approval rows (with capacity).
export function authority(approvals, scope, actions) {
  const [p, m] = String(scope).split(':');
  for (const a of approvals) {
    if (!covers(a, scope)) continue;
    const cap = a.capacity || 'supervisor';
    if (!capacitiesFor(p, m).includes(cap)) continue;
    const allowed = allowedActions(p, m, cap);
    if (actions.every((x) => allowed.includes(x))) return { approval: a, capacity: cap, allowed };
  }
  return null;
}
// Per scope: the capacity held (if any approval covers it) and whether the actions are allowed. For snapshots.
export function authorityReport(approvals, scopes, actions) {
  return scopes.map((sc) => {
    const [p, m] = sc.split(':');
    const held = approvals.filter((a) => covers(a, sc)).map((a) => a.capacity || 'supervisor');
    const ok = authority(approvals, sc, actions);
    return { scope: sc, actions, capacity: ok ? ok.capacity : held[0] || null, allowed: !!ok, recognised: held.filter((c) => capacitiesFor(p, m).includes(c)) };
  });
}

// ---------- Credential display states ----------
// Precise meanings (shown to the holder, the admin and in reports):
//   unverified              claimed, nothing checked yet
//   verification_requested  waiting for the Wavelength team (or for evidence the holder was asked for)
//   directory_match         an administrator found a matching entry in the body's official directory; identity not yet confirmed
//   identity_pending        a confirmation was sent to the contact the directory lists; waiting for the reply
//   manual_review           a person must decide (ambiguous match, conflict, dispute, listing changed)
//   verified                identity confirmed independently and the credential confirmed for the modules shown
//   expired                 was verified; past its expiry or review date
//   revoked                 withdrawn by Wavelength after a change (for example no longer listed)
//   unable_to_verify        rejected, not found, or the holder withdrew it
export const STATES = {
  unverified: 'Unverified', verification_requested: 'Verification requested', directory_match: 'Directory match found', identity_pending: 'Identity confirmation pending',
  manual_review: 'Manual review required', verified: 'Verified', expired: 'Expired', revoked: 'Revoked', unable_to_verify: 'Unable to verify',
};
const today = () => new Date().toISOString().slice(0, 10);
export function credentialState(c, day = today()) {
  if (!c) return 'unverified';
  if (c.active === 0 || c.status === 'withdrawn') return 'unable_to_verify';
  if (c.status === 'verified') return (c.expires_on && c.expires_on < day) || (c.review_on && c.review_on < day) ? 'expired' : 'verified';
  return ({ claimed: 'unverified', pending: 'verification_requested', manual_verification_required: 'verification_requested', evidence_required: 'verification_requested', more_evidence: 'verification_requested', source_unavailable: 'verification_requested', directory_match: 'directory_match', identity_pending: 'identity_pending', manual_review: 'manual_review', expired: 'expired', revoked: 'revoked', rejected: 'unable_to_verify', not_found: 'unable_to_verify', mismatch: 'manual_review' })[c.status] || 'manual_review';
}

// ---------- Reporting ----------
const TYPES = Object.fromEntries(CFG.credentialTypes.map((t) => [t.id, t]));
export async function pathwayReport(env, r) {
  const ok = async (sql) => { try { await env.DB.prepare(sql).all(); return true; } catch { return false; } };
  if (!(await ok('SELECT id FROM credentials LIMIT 0'))) return null;
  const capCol = await ok('SELECT capacity FROM supervisor_approvals LIMIT 0');
  const creds = (await env.DB.prepare('SELECT credential_type, status, expires_on, review_on, active FROM credentials').all()).results || [];
  const appr = (await env.DB.prepare(`SELECT pathway, ${capCol ? 'capacity' : "'supervisor' AS capacity"}, COUNT(*) AS n FROM supervisor_approvals WHERE status = 'approved' AND (review_on IS NULL OR review_on >= date('now')) GROUP BY pathway, capacity`).all()).results || [];
  const asm = (await env.DB.prepare("SELECT pathway, kind, COUNT(*) AS n FROM assessments WHERE status = 'signed' AND substr(signed_at, 1, 10) BETWEEN ? AND ? GROUP BY pathway, kind").bind(r.from, r.to).all()).results || [];
  const byProg = {};
  for (const c of creds) {
    const t = TYPES[c.credential_type] || { programme: 'Other', role: '' };
    const k = `${t.programme} ${t.role}`.trim();
    const s = credentialState(c);
    const row = byProg[k] || (byProg[k] = { k, total: 0, verified: 0, pending: 0, ended: 0 });
    row.total++;
    if (s === 'verified') row.verified++; else if (['expired', 'revoked', 'unable_to_verify'].includes(s)) row.ended++; else row.pending++;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = (head, rows) => (rows.length ? `<div class="biz-tw"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((x) => `<tr>${x.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="biz-empty">None.</p>');
  return `<h4>Credentials by programme and role (all time)</h4>${t(['Programme and role', 'Total', 'Verified', 'In progress', 'Ended or not verified'], Object.values(byProg).sort((a, b) => a.k.localeCompare(b.k)).map((x) => [x.k, x.total, x.verified, x.pending, x.ended]))}
  <h4>Current approvals by pathway and capacity</h4>${t(['Pathway', 'Capacity', 'Approvals'], appr.map((x) => [x.pathway, capacityLabel(x.capacity), x.n]))}
  <h4>Signed assessments in the period, by pathway</h4>${t(['Pathway', 'Kind', 'Count'], asm.map((x) => [x.pathway, x.kind, x.n]))}`;
}
