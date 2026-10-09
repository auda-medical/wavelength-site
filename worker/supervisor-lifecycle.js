// Supervisor lifecycle: eligibility (checked on every supervisor action), standing, blocks, returning open requests,
// link activation and ending, withdrawal, revocation and the daily job. Design: plan sections 7, 10, 11, 35.
//
// Switches (Worker vars, all off by default):
//   SUPERVISOR_APPLY = "true"              supervisors can apply, renew and stop through the app (supervisor-apply.js)
//   SUPERVISOR_APPROVAL_REQUIRED = "true"  dashboard supervision needs a current, in-scope Wavelength approval. Off:
//                                          an accepted link gives dashboard access as before, and the learner sees
//                                          the supervisor labelled "Not yet verified by Wavelength".
// Nothing here runs before migration 0012 (lifecycleReady): every function falls back to today's behaviour.
import LOGBOOK from '../data/logbook.json';
import { lifecycleReady, fullName, SITE } from './app-util.js';
import { currentStatus, scopeLabel, logEvent, PURGE_EVIDENCE_DAYS, recheckDue } from './professional.js';
import { queueStmt, deliver, deliverLater } from './notify.js';
import { auditStmt, audit } from './audit.js';
import { nowIso, ukDate, addDays, daysBetween, parseTs } from './time.js';

const PATHS = Object.fromEntries(LOGBOOK.pathways.map((p) => [p.id, p]));
export const AREAS = LOGBOOK.supervisionAreas || [];
export const approvalRequired = (env) => env.SUPERVISOR_APPROVAL_REQUIRED === 'true';
export const applyOn = (env) => env.SUPERVISOR_APPLY === 'true';
export const LAPSE_NOTIFY_DAYS = 14;
export const NEUTRAL_REFUSAL = "This can't be completed through Wavelength. Contact hello@thewavelength.co.uk.";

// ---------- Scope ----------
// Does an approval row (pathway, module) cover a scope 'pathway:module'? '*' covers every module of its pathway.
const coversScope = (a, sc) => sc === `${a.pathway}:${a.module}` || (a.module === '*' && sc.startsWith(`${a.pathway}:`));
// Scan types an approval covers: the types of its module, or of every module in its pathway for '*'.
export function typesOf(a) {
  const pw = PATHS[a.pathway];
  if (!pw) return [];
  const mods = a.module === '*' ? pw.modules || [] : (pw.modules || []).filter((m) => m.id === a.module);
  return [...new Set(mods.flatMap((m) => m.types || []))];
}
// What a supervisor is approved to supervise, shown under "Approved to supervise:": one label per approval row passed
// in (callers pass only current approvals), naming the exact pathway module, e.g. "Thoracic (FAMUS pathway)". Never
// wider than the approval, and never derived from requested areas or suggested scopes. The pathway names the
// logbook pathway the module belongs to, not an approver: approval is always Wavelength's own.
export function approvedScopeLabel(pathway, module) {
  const pw = PATHS[pathway];
  if (!pw) return scopeLabel(pathway, module);
  if (module === '*') return `All modules (${pw.label} pathway)`;
  const m = (pw.modules || []).find((x) => x.id === module);
  return `${m ? m.label : module} (${pw.label} pathway)`;
}
export function areaLabels(approvals) {
  return [...new Set(approvals.map((a) => approvedScopeLabel(a.pathway, a.module)))];
}
// Pathway modules to pre-tick for requested areas and pathways: every module whose scan types all fall within the
// requested areas (plus an area's explicit modules). The administrator can change the selection.
export function suggestedScopes(areaIds, pathwayIds) {
  const areas = AREAS.filter((a) => areaIds.includes(a.id));
  const types = new Set(areas.flatMap((a) => a.types));
  const out = [];
  for (const pw of LOGBOOK.pathways) {
    if (pathwayIds.length && !pathwayIds.includes(pw.id) && !(pathwayIds.includes('international') && ['eusem', 'eusem2', 'acem', 'cpocus', 'acep'].includes(pw.id))) continue;
    for (const m of pw.modules || []) if ((m.types || []).length && m.types.every((t) => types.has(t))) out.push(`${pw.id}:${m.id}`);
  }
  for (const a of areas) for (const sc of a.modules || []) if (!out.includes(sc)) out.push(sc);
  return out;
}

// ---------- Standing (derived, never stored) ----------
// none | applying | active | renewal_review (current only through the grace period) | paused (approved but a
// registration, credential or email lapse, or a renewal still under review after the grace period) | expired |
// withdrawn | revoked
export async function standingOf(env, learnerId, st = null) {
  if (!(await lifecycleReady(env))) return { standing: 'none', current: [] };
  st = st || await currentStatus(env, learnerId);
  const current = st.approvals.filter((a) => a.current);
  const open = await env.DB.prepare("SELECT id, kind, status FROM supervisor_applications WHERE learner_id = ? AND status IN ('draft', 'submitted', 'more_info') ORDER BY id DESC LIMIT 1").bind(learnerId).first();
  let standing;
  if (current.length) standing = current.every((a) => a.grace) ? 'renewal_review' : 'active';
  else if (st.approvals.length) standing = 'paused';
  else {
    const last = await env.DB.prepare("SELECT status FROM supervisor_approvals WHERE learner_id = ? AND status != 'approved' ORDER BY COALESCE(ended_at, created_at) DESC, id DESC LIMIT 1").bind(learnerId).first();
    if (open && open.kind === 'renewal' && open.status !== 'draft' && last && last.status === 'expired') standing = 'paused';
    else if (open && open.status !== 'draft') standing = 'applying';
    else standing = last ? last.status : open ? 'applying' : 'none';
  }
  const lapse = !current.length && st.approvals.length ? (st.approvals.find((a) => a.lapse) || {}).lapse || 'review' : null;
  return { standing, current, lapse, open: open || null, block: st.block, status: st };
}

// ---------- Eligibility: every supervisor action asks this, on the server, at request time ----------
// scopes: ['pathway:module'] all needed (assessments); types: scan types all needed (sign-offs). Neither: any scope.
// An old 'active' row in supervisor_links is necessary but never sufficient.
// force: check even when SUPERVISOR_APPROVAL_REQUIRED is off (supervisor search must only ever show people who are
// approved now). With force, callers must also require enforced to be true: before migration 0012 nothing is checked.
export async function supervisorEligibility(env, accountId, { scopes = [], types = [], force = false } = {}) {
  if ((!approvalRequired(env) && !force) || !(await lifecycleReady(env))) return { ok: true, enforced: false, reasons: [], approvedFor: [] };
  const st = await currentStatus(env, accountId);
  const current = st.approvals.filter((a) => a.current);
  const reasons = [];
  if (!st.learner) reasons.push('no_account');
  else if (st.learner.email_status !== 'verified') reasons.push('email');
  if (!current.length) reasons.push(st.approvals.length ? 'paused' : 'not_approved');
  const missingScopes = scopes.filter((sc) => !current.some((a) => coversScope(a, sc)));
  const coveredTypes = new Set(current.flatMap(typesOf));
  const missingTypes = [...new Set(types)].filter((t) => !coveredTypes.has(t));
  if (current.length && (missingScopes.length || missingTypes.length)) reasons.push('out_of_scope');
  return { ok: !reasons.length, enforced: true, reasons, missingScopes, missingTypes, approvedFor: current.map((a) => `${a.pathway}:${a.module}`), areas: areaLabels(current) };
}
export function eligibilityError(el) {
  if (el.reasons.includes('out_of_scope')) return `You are not approved by Wavelength to supervise ${el.missingTypes && el.missingTypes.length ? 'every scan in this request' : 'this module'}. Ask the learner to send it to another supervisor or a one-off assessor.`;
  if (el.reasons.includes('email')) return 'Confirm your email address first.';
  if (el.reasons.includes('paused')) return 'Your Wavelength supervisor status is paused or has expired, so you cannot complete supervisor actions at present. Open Me, Supervisor, to see why.';
  return 'You need a current Wavelength supervisor approval to do this. Apply from Me, Supervisor.';
}

// ---------- Blocks: administrative revocation and rejection on verification or safety grounds ----------
export async function activeBlock(env, learnerId) {
  if (!learnerId || !(await lifecycleReady(env))) return null;
  return env.DB.prepare('SELECT * FROM supervisor_blocks WHERE learner_id = ? AND lifted_at IS NULL ORDER BY id DESC LIMIT 1').bind(learnerId).first();
}
// Is this signer barred from signing as a one-off assessor? Matches the logged-in account (when the signing page is
// opened while logged in), the email the request was addressed to or the signer typed, and a registration number the
// signer typed. A block with "one-off assessment remains permitted" never bars. Limitation, stated in the plan: a
// signer who types a different name, email and number cannot be recognised.
export async function signerBlocked(env, { accountId = null, emails = [], reg = '' } = {}) {
  if (!(await lifecycleReady(env))) return null;
  const ids = new Set();
  if (accountId) ids.add(Number(accountId));
  for (const e of emails.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)) {
    const r = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind(e).first();
    if (r) ids.add(r.id);
  }
  const n = String(reg || '').toUpperCase().replace(/[\s.]/g, '');
  if (n.length >= 4) {
    const { results = [] } = await env.DB.prepare('SELECT DISTINCT learner_id FROM professional_registrations WHERE registration_number = ?').bind(n).all();
    for (const r of results) ids.add(r.learner_id);
  }
  for (const id of ids) {
    const b = await env.DB.prepare('SELECT * FROM supervisor_blocks WHERE learner_id = ? AND lifted_at IS NULL AND one_off_permitted = 0 ORDER BY id DESC LIMIT 1').bind(id).first();
    if (b) return { learnerId: id, block: b };
  }
  return null;
}

// ---------- Links and requests ----------
// Activates every claimed, pending link of a newly approved supervisor and queues "your supervisor is now active".
export async function activateClaimedLinks(env, supervisorId) {
  const { results = [] } = await env.DB.prepare("SELECT s.id, s.learner_id, t.email, t.first_name, t.title, t.last_name, t.test_account FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.status = 'pending' AND s.claimed_at IS NOT NULL").bind(supervisorId).all();
  if (!results.length) return { stmts: [], learners: [], keys: [] };
  const sup = await env.DB.prepare('SELECT title, first_name, last_name FROM learners WHERE id = ?').bind(supervisorId).first();
  const stmts = [], keys = [];
  for (const r of results) {
    stmts.push(env.DB.prepare("UPDATE supervisor_links SET status = 'active', accepted_at = COALESCE(accepted_at, datetime('now')) WHERE id = ? AND status = 'pending'").bind(r.id));
    const key = `link_active:${r.id}`;
    keys.push(key);
    stmts.push(queueStmt(env, { key, learnerId: r.learner_id, kind: 'link_active', to: r.email, toName: fullName(r), data: { firstName: r.first_name, supervisor: fullName(sup || {}) } }));
  }
  return { stmts, learners: results.map((r) => fullName(r)), keys };
}
// Returns every open sign-off and assessment request addressed to a supervisor's dashboard to the learner (decision 3).
// The request keeps its scans and details. Its old link stops working, so nothing is left actionable by the supervisor;
// the learner can reassign it, send it to a one-off assessor (a fresh link) or cancel it. learnerId: one learner only.
export async function returnRequestsStmts(env, supervisorId, reason, learnerId = null) {
  const at = nowIso();
  const w = learnerId ? ' AND learner_id = ?' : '';
  const args = learnerId ? [supervisorId, learnerId] : [supervisorId];
  const so = await env.DB.prepare(`SELECT learner_id, COUNT(*) AS n FROM signoffs WHERE supervisor_id = ? AND status = 'pending'${w} GROUP BY learner_id`).bind(...args).all();
  const as = await env.DB.prepare(`SELECT learner_id, COUNT(*) AS n FROM assessments WHERE supervisor_id = ? AND status = 'pending'${w} GROUP BY learner_id`).bind(...args).all();
  const counts = {};
  for (const r of [...(so.results || []), ...(as.results || [])]) counts[r.learner_id] = (counts[r.learner_id] || 0) + r.n;
  const stmts = [
    env.DB.prepare(`UPDATE signoffs SET returned_from = supervisor_id, supervisor_id = NULL, returned_at = ?, returned_reason = ?, token_hash = NULL WHERE supervisor_id = ? AND status = 'pending'${w}`).bind(at, reason, ...args),
    env.DB.prepare(`UPDATE assessments SET returned_from = supervisor_id, supervisor_id = NULL, returned_at = ?, returned_reason = ?, token_hash = NULL WHERE supervisor_id = ? AND status = 'pending'${w}`).bind(at, reason, ...args),
  ];
  return { stmts, counts };
}
// Tell each actively linked learner that a supervisor is no longer available (no reason given), and return their open
// requests. end: also end the links (withdrawal, full revocation); otherwise they stay 'active' but grant nothing.
export async function supervisorUnavailable(env, supervisorId, { event, reason, end = false, endedReason = null, actor = 'system' }) {
  const sup = await env.DB.prepare('SELECT title, first_name, last_name FROM learners WHERE id = ?').bind(supervisorId).first();
  const { results: links = [] } = await env.DB.prepare("SELECT s.id, s.learner_id, s.status, t.email, t.title, t.first_name, t.last_name, t.test_account FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.status IN ('active', 'pending')").bind(supervisorId).all();
  const ret = await returnRequestsStmts(env, supervisorId, reason);
  const stmts = [...ret.stmts], keys = [];
  for (const k of links) {
    if (end) stmts.push(env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now'), ended_reason = ?, ended_by = ? WHERE id = ?").bind(endedReason, actor, k.id));
    if (k.status !== 'active') continue; // a learner whose invitation was never active hears through the link list
    const key = `unavailable:${k.id}:${event}`;
    keys.push(key);
    stmts.push(queueStmt(env, { key, learnerId: k.learner_id, kind: 'unavailable', to: k.email, toName: fullName(k), data: { firstName: k.first_name, supervisor: fullName(sup || {}), returned: ret.counts[k.learner_id] || 0 } }));
  }
  return { stmts, keys, links: links.length, returned: Object.values(ret.counts).reduce((a, b) => a + b, 0) };
}

// ---------- Voluntary withdrawal ("Stop being a Wavelength supervisor") ----------
export const WITHDRAW_REASONS = ['no_longer_supervising', 'role_change', 'organisation_change', 'no_longer_practising', 'break', 'no_longer_wavelength', 'other', 'prefer_not_to_say'];
export async function withdrawSupervisor(env, l, { reason = 'prefer_not_to_say', note = '' } = {}, ctx = null) {
  const at = nowIso();
  const event = `w${Date.now().toString(36)}`;
  const approvals = (await env.DB.prepare("SELECT id, pathway, module FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(l.id).all()).results || [];
  const open = await env.DB.prepare("SELECT id FROM supervisor_applications WHERE learner_id = ? AND status IN ('draft', 'submitted', 'more_info')").bind(l.id).first();
  if (!approvals.length && !open) return { ok: false, error: 'You are not a Wavelength supervisor at present.' };
  const un = await supervisorUnavailable(env, l.id, { event, reason: 'supervisor_withdrew', end: true, endedReason: 'supervisor_withdrew', actor: 'self' });
  const stmts = [
    // The reason is kept for the audit only, never shown to trainees.
    env.DB.prepare("UPDATE supervisor_approvals SET status = 'withdrawn', ended_by = 'self', ended_at = ?, ended_reason = ? WHERE learner_id = ? AND status = 'approved'").bind(at, `voluntary withdrawal: ${reason}`, l.id),
    env.DB.prepare("UPDATE supervisor_applications SET status = 'withdrawn', decided_at = ?, decided_by = 'self', updated_at = datetime('now') WHERE learner_id = ? AND status IN ('draft', 'submitted', 'more_info')").bind(at, l.id),
    env.DB.prepare('UPDATE learners SET supervisor_searchable = 0 WHERE id = ?').bind(l.id),
    env.DB.prepare('UPDATE directory_profiles SET listed = 0 WHERE learner_id = ?').bind(l.id),
    ...un.stmts,
    auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'supervisor.withdraw', subjectType: 'learner', subjectId: l.id, meta: { reason, scopes: approvals.map((a) => `${a.pathway}:${a.module}`), links: un.links, returned: un.returned } }),
  ];
  const key = `withdrawn:${l.id}:${event}`;
  if (approvals.length) stmts.push(queueStmt(env, { key, learnerId: l.id, kind: 'withdrawn', to: l.email, toName: fullName(l), data: { firstName: l.first_name } }));
  await env.DB.batch(stmts);
  for (const a of approvals) await logEvent(env, { learnerId: l.id, subjectType: 'approval', subjectId: a.id, action: 'withdrawn', outcome: 'withdrawn', actor: 'learner', scope: `${a.pathway}:${a.module}`, notes: `Voluntary withdrawal (${reason})${note ? ': ' + note.slice(0, 500) : ''}` });
  deliverLater(env, ctx, [...(approvals.length ? [key] : []), ...un.keys]);
  return { ok: true, ended: approvals.length, links: un.links, returned: un.returned };
}

// ---------- The daily job ----------
// Runs from its own daily cron, never from the Tuesday newsletter cron. Every step is a guarded update or an
// INSERT OR IGNORE into the outbox, so running it twice changes nothing and sends nothing twice. Expiry is also
// enforced on every read (currentStatus), so a missed run never extends anyone's approval.
export async function dailyLifecycle(env) {
  if (!(await lifecycleReady(env))) return { skipped: 'migration 0012 not applied' };
  const started = nowIso();
  const run = await env.DB.prepare("INSERT INTO job_runs (job, started_at) VALUES ('supervisor-daily', ?)").bind(started).run();
  const runId = run.meta && run.meta.last_row_id;
  const counts = {};
  const step = async (name, fn) => { try { counts[name] = await fn(); } catch (e) { counts[name] = { error: String(e && e.message || e).slice(0, 200) }; } };
  await step('expiry', () => expireApprovals(env));
  await step('reminders', () => renewalReminders(env));
  await step('lapses', () => watchLapses(env));
  await step('purge', () => purgeEvidence(env));
  await step('drafts', () => dropStaleDrafts(env));
  await step('recheck', () => recheckDue(env));
  await step('stuck', () => markStuckSends(env));
  await step('email', () => deliver(env, null, 100));
  await step('retention', () => retention(env));
  const failed = Object.values(counts).some((c) => c && c.error);
  if (runId) await env.DB.prepare('UPDATE job_runs SET finished_at = ?, outcome = ?, counts = ?, error = ? WHERE id = ?').bind(nowIso(), failed ? 'error' : 'ok', JSON.stringify(counts).slice(0, 4000), failed ? Object.entries(counts).filter(([, c]) => c && c.error).map(([k, c]) => `${k}: ${c.error}`).join('; ').slice(0, 1000) : null, runId).run();
  return counts;
}

// Approvals past their review date, and not inside a renewal's grace period, become 'expired'. The supervisor is
// emailed once; if no current scope is left, their learners are told and open requests come back to them.
export async function expireApprovals(env) {
  const day = ukDate();
  const { results: due = [] } = await env.DB.prepare("SELECT DISTINCT learner_id FROM supervisor_approvals WHERE status = 'approved' AND review_on IS NOT NULL AND review_on < ?").bind(day).all();
  let expired = 0, people = 0;
  for (const { learner_id: id } of due) {
    const st = await currentStatus(env, id);
    const ending = st.approvals.filter((a) => a.review_on && a.review_on < day && !a.grace);
    if (!ending.length) continue; // every past-date scope is inside a grace period
    const l = st.learner;
    const stmts = ending.map((a) => env.DB.prepare("UPDATE supervisor_approvals SET status = 'expired', ended_by = 'system', ended_at = ?, ended_reason = 'review date passed' WHERE id = ? AND status = 'approved'").bind(nowIso(), a.id));
    const reviewOn = ending.map((a) => a.review_on).sort()[0];
    const underReview = !!(st.renewal && ['submitted', 'more_info'].includes(st.renewal.status));
    const keys = [];
    if (l) { const key = `expired:${id}:${reviewOn}`; keys.push(key); stmts.push(queueStmt(env, { key, learnerId: id, kind: 'expired', to: l.email, toName: fullName(l), data: { firstName: l.first_name, reviewOn, underReview } })); }
    const left = st.approvals.filter((a) => a.current && !ending.includes(a));
    if (!left.length) {
      const un = await supervisorUnavailable(env, id, { event: `expired-${reviewOn}`, reason: 'supervisor_expired' });
      stmts.push(...un.stmts); keys.push(...un.keys);
    }
    stmts.push(auditStmt(env, { actorType: 'system', actorId: 'cron:supervisor-daily', action: 'approval.expire', subjectType: 'learner', subjectId: id, meta: { scopes: ending.map((a) => `${a.pathway}:${a.module}`), renewal: underReview } }));
    await env.DB.batch(stmts);
    for (const a of ending) await logEvent(env, { learnerId: id, subjectType: 'approval', subjectId: a.id, action: 'expired', outcome: 'expired', actor: 'system', scope: `${a.pathway}:${a.module}`, notes: underReview ? 'Renewal still under review after the grace period' : 'Review date passed without renewal' });
    expired += ending.length; people++;
  }
  return { expired, people };
}

// 60, 30 and 7 days before the review date (UK days), unless a renewal has been submitted. Only the nearest
// threshold is sent, once: an approval with 25 days left gets the 30-day email, never a late 60-day one.
export async function renewalReminders(env) {
  const day = ukDate();
  const until = addDays(day, 60);
  const { results = [] } = await env.DB.prepare(`SELECT a.learner_id, MIN(a.review_on) AS review_on, l.email, l.title, l.first_name, l.last_name, l.test_account,
      (SELECT COUNT(*) FROM supervisor_applications s WHERE s.learner_id = a.learner_id AND s.kind = 'renewal' AND s.status IN ('submitted', 'more_info', 'approved') AND s.created_at >= COALESCE(a.last_renewed_at, a.approved_at, a.created_at)) AS renewing
    FROM supervisor_approvals a JOIN learners l ON l.id = a.learner_id WHERE a.status = 'approved' AND a.review_on IS NOT NULL AND a.review_on >= ? AND a.review_on <= ? GROUP BY a.learner_id`).bind(day, until).all();
  let queued = 0;
  const keys = [];
  for (const r of results) {
    if (r.renewing) continue;
    const left = daysBetween(day, r.review_on);
    const bucket = left <= 7 ? 7 : left <= 30 ? 30 : 60;
    const key = `renew${bucket}:${r.learner_id}:${r.review_on}`;
    const res = await queueStmt(env, { key, learnerId: r.learner_id, kind: 'renew', to: r.email, toName: fullName(r), data: { firstName: r.first_name, reviewOn: r.review_on, days: bucket } }).run();
    if (res.meta && res.meta.changes) { queued++; keys.push(key); }
  }
  return { queued };
}

// A supervisor whose approvals are in date but not current because a registration, credential or email lapsed:
// email them on the first day, and their learners (with open requests returned) only if it lasts 14 days.
export async function watchLapses(env) {
  const { results = [] } = await env.DB.prepare("SELECT DISTINCT learner_id FROM supervisor_approvals WHERE status = 'approved'").all();
  const watched = (await env.DB.prepare('SELECT * FROM supervisor_watch WHERE lapse_since IS NOT NULL').all()).results || [];
  const ids = new Set([...results.map((r) => r.learner_id), ...watched.map((w) => w.learner_id)]);
  const day = ukDate();
  let started = 0, cleared = 0, escalated = 0;
  for (const id of ids) {
    const st = await currentStatus(env, id);
    const lapsed = st.approvals.length && !st.approvals.some((a) => a.current) && st.approvals.some((a) => a.lapse);
    const w = watched.find((x) => x.learner_id === id);
    if (!lapsed) {
      if (w) { await env.DB.prepare('UPDATE supervisor_watch SET lapse_since = NULL, lapse_reason = NULL, updated_at = ? WHERE learner_id = ?').bind(nowIso(), id).run(); cleared++; }
      continue;
    }
    const why = st.approvals.find((a) => a.lapse).lapse;
    const words = { registration: 'your professional registration is no longer verified as current.', credential: 'a credential your approval relies on has expired or been withdrawn.', email: 'your email address is not confirmed.' }[why];
    if (!w) {
      const since = day;
      const key = `lapse:${id}:${since}`;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO supervisor_watch (learner_id, lapse_since, lapse_reason, updated_at) VALUES (?,?,?,?) ON CONFLICT (learner_id) DO UPDATE SET lapse_since = excluded.lapse_since, lapse_reason = excluded.lapse_reason, updated_at = excluded.updated_at').bind(id, since, why, nowIso()),
        queueStmt(env, { key, learnerId: id, kind: 'lapse', to: st.learner.email, toName: fullName(st.learner), data: { firstName: st.learner.first_name, reason: words } }),
        auditStmt(env, { actorType: 'system', actorId: 'cron:supervisor-daily', action: 'approval.lapse', subjectType: 'learner', subjectId: id, meta: { reason: why } }),
      ]);
      started++;
      continue;
    }
    if (daysBetween(w.lapse_since, day) >= LAPSE_NOTIFY_DAYS) {
      const un = await supervisorUnavailable(env, id, { event: `lapse-${w.lapse_since}`, reason: 'supervisor_unavailable' });
      if (un.stmts.length) await env.DB.batch([...un.stmts]);
      if (un.keys.length || un.returned) escalated++;
    }
  }
  return { started, cleared, escalated };
}

// Evidence files are needed only until a decision. The 30-day clock starts at the decision (decided_at), so later
// edits or rechecks do not restart it. Files on drafts or claims with no activity for 90 days go too.
export async function purgeEvidence(env) {
  const cut = `-${PURGE_EVIDENCE_DAYS} days`;
  const r = await env.DB.prepare(`UPDATE credential_evidence SET file_data = NULL, purged_at = datetime('now') WHERE file_data IS NOT NULL AND (
      (subject_type = 'application' AND subject_id IN (SELECT id FROM supervisor_applications WHERE status IN ('approved', 'rejected', 'withdrawn') AND COALESCE(decided_at, updated_at) < datetime('now', ?)))
   OR (subject_type = 'application' AND subject_id IN (SELECT id FROM supervisor_applications WHERE status IN ('draft', 'more_info') AND updated_at < datetime('now', '-90 days')))
   OR (subject_type = 'credential' AND subject_id IN (SELECT id FROM credentials WHERE status IN ('verified', 'rejected', 'revoked', 'withdrawn', 'expired') AND COALESCE(decided_at, updated_at) < datetime('now', ?)))
   OR (subject_type = 'credential' AND subject_id IN (SELECT id FROM credentials WHERE status NOT IN ('verified', 'rejected', 'revoked', 'withdrawn', 'expired') AND updated_at < datetime('now', '-90 days')))
   OR (subject_type = 'registration' AND subject_id IN (SELECT id FROM professional_registrations WHERE status IN ('verified', 'rejected', 'withdrawn', 'not_current') AND COALESCE(decided_at, updated_at) < datetime('now', ?)))
   OR (subject_type = 'registration' AND subject_id IN (SELECT id FROM professional_registrations WHERE status NOT IN ('verified', 'rejected', 'withdrawn', 'not_current') AND updated_at < datetime('now', '-90 days'))))`).bind(cut, cut, cut).run();
  return { purged: (r.meta && r.meta.changes) || 0 };
}
// Application drafts with no activity for 90 days are deleted (their evidence rows go with them).
export async function dropStaleDrafts(env) {
  const { results = [] } = await env.DB.prepare("SELECT id, learner_id FROM supervisor_applications WHERE status = 'draft' AND updated_at < datetime('now', '-90 days')").all();
  for (const d of results) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM credential_evidence WHERE subject_type = 'application' AND subject_id = ?").bind(d.id),
      env.DB.prepare("DELETE FROM supervisor_applications WHERE id = ? AND status = 'draft'").bind(d.id),
      auditStmt(env, { actorType: 'system', actorId: 'cron:supervisor-daily', action: 'application.draft_expired', subjectType: 'application', subjectId: d.id, meta: {} }),
    ]);
  }
  return { deleted: results.length };
}
// A send that was claimed but never finished (the Worker stopped mid-send) may or may not have gone: 'unknown'.
async function markStuckSends(env) {
  const cut = new Date(Date.now() - 3600e3).toISOString();
  const r = await env.DB.prepare("UPDATE notification_log SET status = 'unknown', last_error = 'interrupted while sending' WHERE status = 'sending' AND created_at < ?").bind(cut).run();
  return { unknown: (r.meta && r.meta.changes) || 0 };
}
// Retention (plan section 26, decision 12): pseudonymised approval decision records are kept 6 years; security audit
// events 2 years; sent outbox rows 1 year; job runs 1 year.
async function retention(env) {
  const out = {};
  out.events = ((await env.DB.prepare("DELETE FROM verification_events WHERE learner_id IS NULL AND at < datetime('now', '-6 years')").run()).meta || {}).changes || 0;
  out.audit = ((await env.DB.prepare("DELETE FROM audit_events WHERE at < ? AND action NOT LIKE 'approval.%' AND action NOT LIKE 'application.%' AND action NOT IN ('account.delete')").bind(new Date(Date.now() - 730 * 864e5).toISOString()).run()).meta || {}).changes || 0;
  out.outbox = ((await env.DB.prepare("DELETE FROM notification_log WHERE status = 'sent' AND sent_at < ?").bind(new Date(Date.now() - 365 * 864e5).toISOString()).run()).meta || {}).changes || 0;
  out.jobs = ((await env.DB.prepare("DELETE FROM job_runs WHERE started_at < ?").bind(new Date(Date.now() - 365 * 864e5).toISOString()).run()).meta || {}).changes || 0;
  if (out.audit) await audit(env, { actorType: 'system', actorId: 'cron:supervisor-daily', action: 'audit.retention', meta: { count: out.audit } });
  return out;
}

// The learner's view of one link: a state and a label. Never the supervisor's private reasons.
export function linkState(link, sup, enforced) {
  if (link.status === 'ended') return { state: 'ended', label: 'Ended' };
  if (link.status === 'pending') {
    if (!link.supervisor_id || !link.claimed_at) return { state: 'invited', label: 'Invitation sent' };
    if (sup && sup.block) return { state: 'unavailable', label: 'Not available for supervision through Wavelength at present' };
    return { state: 'verifying', label: 'Supervisor verification in progress' };
  }
  // active
  if (sup && sup.current.length) return { state: 'active', label: 'Wavelength Verified ✓', areas: areaLabels(sup.current), renewal: sup.standing === 'renewal_review' };
  if (!enforced) return { state: 'not_verified', label: 'Not yet verified by Wavelength' };
  if (sup && sup.open && sup.open.status !== 'draft') return { state: 'verifying', label: 'Supervisor verification in progress' };
  return { state: 'unavailable', label: 'Not available for new supervision' };
}
// 1.0.12: the stage of one supervision relationship, finer than linkState's label, so the app can say what is
// happening and what comes next. Derived on every read from the link and the supervisor's standing; never stored.
// It keeps the relationship (invitation, acceptance, ended) apart from the supervisor's verification (application,
// professional registration check, Wavelength approval, pause). Private reasons are never exposed: a block, a
// revocation or a rejection all read as 'unavailable'.
//   awaiting_acceptance                 invitation sent, the supervisor has not accepted
//   verification_not_submitted          accepted (approval required), no supervisor application sent yet
//   awaiting_professional_verification  application sent, professional registration not yet verified
//   awaiting_approval                   application sent, registration verified (or not needed), decision pending
//   approved                            active link, current Wavelength approval
//   not_verified                        active link without approval while approval is not enforced
//   paused                              reserved (sent by no current Worker: a lapse reads as not_verified or unavailable)
//   unavailable                         not available for supervision through Wavelength at present
//   ended                               the relationship has ended
export function relationshipStage(link, sup, enforced) {
  if (link.status === 'ended') return 'ended';
  if (link.status === 'pending' && (!link.supervisor_id || !link.claimed_at)) return 'awaiting_acceptance';
  if (sup && sup.block) return 'unavailable';
  if (sup && sup.current.length) return link.status === 'active' ? 'approved' : 'awaiting_approval';
  const open = sup && sup.open && sup.open.status !== 'draft' ? sup.open : null;
  if (open) return sup.status && !sup.status.hasReg ? 'awaiting_professional_verification' : 'awaiting_approval';
  // A lapse is the supervisor's own business: the learner sees what linkState showed (not verified, or unavailable).
  if (sup && sup.standing === 'paused') return enforced || link.status === 'pending' ? 'unavailable' : 'not_verified';
  if (sup && ['expired', 'withdrawn', 'revoked'].includes(sup.standing) && (enforced || link.status === 'pending')) return 'unavailable';
  if (link.status === 'pending') return 'verification_not_submitted';
  return enforced ? 'unavailable' : 'not_verified';
}
export const SITE_APP = `${SITE}/app/#`;
export { parseTs };
