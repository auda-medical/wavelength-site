// Notices about sign-off and assessment requests (19 October 2026). The owner, as a supervisor, received a request on
// his dashboard and heard nothing for two days: a request was only seen when the app was opened. Now:
//   supervisor  a learner sends scans or an assessment to their dashboard (or passes a returned one to them): at once
//               still waiting three days later: one reminder (daily job)
//   learner     an assessment is signed, or a request is declined: at once
//               (scans signed off or queried: notifyLearner in app.js, as before)
// Email goes through the notification outbox (notify.js): one row per event key, so a retried request or a second run
// of the daily job never sends a second copy. Nothing clinical is ever in a notice: names, counts and a link only.
// Everyone can turn these emails off with the existing setting (Me, Settings: profile.notifyEmail = false).
// A notice must never break the request that caused it: every failure here is swallowed.
import { queueStmt, deliver } from './notify.js';
import { pushPerson } from './push.js';
import LOGBOOK from '../data/logbook.json';

const KIND_LABEL = Object.fromEntries((LOGBOOK.assessmentKinds || []).map((k) => [k.id, k.label]));
export const kindLabel = (k) => KIND_LABEL[k] || 'Assessment';
const nameOf = (r) => [r && r.title, r && r.first_name, r && r.last_name].filter(Boolean).join(' ').trim();
const profileOf = (r) => { try { return JSON.parse((r && r.profile) || '{}') || {}; } catch { return {}; } };

// Queues one notice for a Wavelength account and sends it now (in the background when the runtime allows).
// 1.0.20: the same notice also goes to the person's phones (worker/push.js, its own switch: profile.notifyPush, and
// only phones where they turned notifications on). Email off does not turn the phone off, nor the other way round.
export async function notice(env, ctx, personId, kind, key, data = {}) {
  if (personId) { const ph = pushPerson(env, personId, kind, data).catch(() => 0); if (ctx && ctx.waitUntil) ctx.waitUntil(ph); else await ph; }
  return emailNotice(env, ctx, personId, kind, key, data);
}
async function emailNotice(env, ctx, personId, kind, key, data) {
  try {
    if (!personId) return false;
    const p = await env.DB.prepare('SELECT email, first_name, profile FROM learners WHERE id = ?').bind(personId).first();
    if (!p || !p.email || profileOf(p).notifyEmail === false) return false;
    const r = await queueStmt(env, { key, learnerId: personId, kind, to: p.email, toName: p.first_name || '', data: { firstName: p.first_name || '', ...data } }).run();
    if (!(r.meta && r.meta.changes)) return false; // already queued for this event
    const send = deliver(env, [String(key).slice(0, 200)]).catch(() => null);
    if (ctx && ctx.waitUntil) ctx.waitUntil(send); else await send;
    return true;
  } catch { return false; }
}

// A learner's name as the supervisor knows it.
export async function learnerName(env, id) {
  try { return nameOf(await env.DB.prepare('SELECT title, first_name, last_name FROM learners WHERE id = ?').bind(id).first()) || 'A learner'; } catch { return 'A learner'; }
}

// ---------- Supervisor ----------
export async function signoffRequested(env, ctx, { code, learnerId, supervisorId, count }) {
  return notice(env, ctx, supervisorId, 'req_signoff', `req:so:${code}:${supervisorId}`, { learner: await learnerName(env, learnerId), count: count || 1, lid: learnerId });
}
export async function assessmentRequested(env, ctx, { code, learnerId, supervisorId, kind }) {
  return notice(env, ctx, supervisorId, 'req_assess', `req:as:${code}:${supervisorId}`, { learner: await learnerName(env, learnerId), kind: kindLabel(kind), lid: learnerId });
}

// Daily job: requests still waiting for their supervisor three days after they were sent get one reminder each.
export async function requestReminders(env, now = Date.now()) {
  const before = new Date(now - 3 * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const out = { queued: 0 };
  for (const [t, prefix, kind] of [['signoffs', 'so', 'rem_signoff'], ['assessments', 'as', 'rem_assess']]) {
    const { results = [] } = await env.DB.prepare(`SELECT id, learner_id, supervisor_id FROM ${t} WHERE status = 'pending' AND supervisor_id IS NOT NULL AND returned_at IS NULL AND expires_at > ? AND REPLACE(created_at, 'T', ' ') <= ? LIMIT 200`).bind(now, before).all();
    for (const r of results) {
      const key = `rem:${prefix}:${r.id}:${r.supervisor_id}`;
      const seen = await env.DB.prepare('SELECT 1 FROM notification_log WHERE key = ?').bind(key).first();
      if (seen) continue;
      const p = await env.DB.prepare('SELECT email, first_name, profile FROM learners WHERE id = ?').bind(r.supervisor_id).first();
      if (!p) continue;
      const data = { firstName: p.first_name || '', learner: await learnerName(env, r.learner_id), lid: r.learner_id };
      // The outbox row is also the marker that this request has had its reminder (one only), so it is written even
      // when email is off for this person; it is then marked done without sending.
      const mail = !!p.email && profileOf(p).notifyEmail !== false;
      await queueStmt(env, { key, learnerId: r.supervisor_id, kind, to: mail ? p.email : '', toName: p.first_name || '', data }).run();
      if (!mail) await env.DB.prepare("UPDATE notification_log SET status = 'sent', sent_at = datetime('now'), payload = NULL, last_error = 'email off: phone only' WHERE key = ?").bind(key).run();
      await pushPerson(env, r.supervisor_id, kind, data);
      out.queued++;
    }
  }
  return out; // sent by the daily job's email step, which runs after this one
}

// ---------- Learner ----------
export async function assessmentSigned(env, ctx, { code, learnerId, supervisorName, kind }) {
  return notice(env, ctx, learnerId, 'as_signed', `done:as:${code}`, { supervisor: supervisorName || 'Your assessor', kind: kindLabel(kind) });
}
export async function moreInfoRequested(env, ctx, { what, code, learnerId, supervisorName }) {
  return notice(env, ctx, learnerId, 'req_more', `more:${what}:${code}:${Date.now()}`, { supervisor: supervisorName || 'Your supervisor', what });
}
export async function requestResent(env, ctx, { what, code, learnerId, supervisorId, count }) {
  return notice(env, ctx, supervisorId, 'req_resent', `resent:${what}:${code}:${supervisorId}`, { learner: await learnerName(env, learnerId), what, count: count || 1, lid: learnerId });
}
export async function requestDeclined(env, ctx, { what, code, learnerId, supervisorName }) {
  return notice(env, ctx, learnerId, 'req_declined', `declined:${what}:${code}:${Date.now()}`, { supervisor: supervisorName || 'Your supervisor', what: what === 'as' ? 'assessment' : 'sign-off request', where: what === 'as' ? 'assess' : 'signoff' });
}
