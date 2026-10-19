// Asynchronous review states for sign-off and assessment requests sent to a supervisor's dashboard (Phase E,
// migration 0015). A request moves through:
//   pending            sent, not yet opened by the supervisor
//   under_review       the supervisor opened it (accepted_at)
//   declined           the supervisor declined it with a reason; it comes back to the learner (returned_reason 'declined')
//   more_info          the supervisor asked for more information (19 Oct 2026): it comes back to the learner with a note,
//                      returned_from keeps the supervisor, and the learner sends it back to them once updated
//   returned           it came back for another reason (supervision ended, signer unavailable)
//   approved           signed, every scan confirmed (or an assessment signed)
//   revision_requested signed, at least one scan queried: the learner updates the scan and sends it again
//   cancelled          the learner cancelled it
// A review in Wavelength records what the supervisor decided about the record. It does not replace directly supervised
// scanning, observed procedures or any assessment the accrediting body requires, and it never confers accreditation.
import { json, clip, body, lifecycleReady } from './app-util.js';
import { auditStmt } from './audit.js';
import { nowIso } from './time.js';
import { requestDeclined, moreInfoRequested } from './alerts.js';

export const REVIEW_STATES = {
  pending: 'Waiting for the supervisor', under_review: 'Under review', declined: 'Declined by the supervisor', more_info: 'More information requested', returned: 'Came back to you',
  approved: 'Approved', revision_requested: 'Revision requested', cancelled: 'Cancelled', expired: 'Expired',
};
export function reviewState(r, now = Date.now()) {
  if (!r) return 'pending';
  if (r.status === 'cancelled') return 'cancelled';
  if (r.status === 'signed' || r.status === 'superseded') {
    let d = {}; try { d = typeof r.decisions === 'string' ? JSON.parse(r.decisions || '{}') : r.decisions || {}; } catch { d = {}; }
    return Object.values(d).some((x) => x === 'query') ? 'revision_requested' : 'approved';
  }
  if (r.returned_reason === 'more_info' || (r.returned && r.returned.reason === 'more_info')) return 'more_info';
  if (r.returned_at || r.returned) return r.declined_at || r.returned_reason === 'declined' || (r.returned && r.returned.reason === 'declined') ? 'declined' : 'returned';
  if (r.expires_at && r.expires_at < now) return 'expired';
  return r.accepted_at ? 'under_review' : 'pending';
}

const ready = async (env) => { try { await env.DB.prepare('SELECT accepted_at FROM signoffs LIMIT 0').all(); return lifecycleReady(env); } catch { return false; } };
const TABLE = { signoff: 'signoffs', assessment: 'assessments' };
async function own(env, l, d) {
  const t = TABLE[d && d.kind];
  if (!t) return { error: json({ ok: false, error: 'Choose a request.' }, 400) };
  const row = await env.DB.prepare(`SELECT * FROM ${t} WHERE id = ? AND supervisor_id = ? AND status = 'pending'`).bind(clip(d.code, 20), l.id).first();
  if (!row || (row.expires_at && row.expires_at < Date.now())) return { error: json({ ok: false, error: 'This request is no longer open.' }, 404) };
  const link = await env.DB.prepare("SELECT id FROM supervisor_links WHERE supervisor_id = ? AND learner_id = ? AND status = 'active'").bind(l.id, row.learner_id).first();
  if (!link) return { error: json({ ok: false, error: 'You no longer supervise this learner.' }, 404) };
  return { t, row };
}

// POST supervise/request/accept { kind, code }: the supervisor has opened the request. Idempotent.
export async function acceptRequest(env, l, req) {
  if (!(await ready(env))) return json({ ok: true, state: 'pending' });
  const d = await body(req);
  const o = await own(env, l, d);
  if (o.error) return o.error;
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${o.t} SET accepted_at = COALESCE(accepted_at, ?) WHERE id = ? AND status = 'pending'`).bind(nowIso(), o.row.id),
    auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'request.accept', subjectType: d.kind, subjectId: o.row.id, meta: {} }, { ifChanged: true }),
  ]);
  return json({ ok: true, state: 'under_review' });
}

// POST supervise/request/decline { kind, code, reason }: the request goes back to the learner with the reason, who can
// send it to someone else or cancel it (the existing returned-request flow). Nothing is signed or changed in the logbook.
export async function declineRequest(env, l, req, ctx) {
  if (!(await ready(env))) return json({ ok: false, error: 'Not available yet.' }, 404);
  const d = await body(req);
  const reason = clip(d && d.reason, 500);
  if (reason.length < 3) return json({ ok: false, error: 'Tell the learner briefly why, so they can send it to someone else.' }, 400);
  const o = await own(env, l, d);
  if (o.error) return o.error;
  const at = nowIso();
  const out = await env.DB.batch([
    env.DB.prepare(`UPDATE ${o.t} SET returned_from = supervisor_id, supervisor_id = NULL, returned_at = ?, returned_reason = 'declined', declined_at = ?, decline_reason = ?, token_hash = NULL WHERE id = ? AND status = 'pending' AND supervisor_id = ?`).bind(at, at, reason, o.row.id, l.id),
    auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'request.decline', subjectType: d.kind, subjectId: o.row.id, meta: { length: reason.length } }, { ifChanged: true }),
  ]);
  const changed = !!(out[0] && out[0].meta && out[0].meta.changes);
  // 19 Oct 2026: the learner hears at once (alerts.js); the reason stays in the app, never in the email.
  if (changed) await requestDeclined(env, ctx, { what: d.kind === 'assessment' ? 'as' : 'so', code: o.row.id, learnerId: o.row.learner_id, supervisorName: [l.title, l.first_name, l.last_name].filter(Boolean).join(' ') });
  return json({ ok: true, state: 'declined', changed });
}

// POST supervise/request/more { kind, code, note } (19 Oct 2026, owner): the supervisor cannot sign yet (for example the
// scan has no images) and asks for more. Nothing is signed or ticked. The request goes back to the learner with the
// note; returned_from keeps the supervisor, so the learner can update the scans and send it back to the same person.
export async function moreInfoRequest(env, l, req, ctx) {
  if (!(await ready(env))) return json({ ok: false, error: 'Not available yet.' }, 404);
  const d = await body(req);
  const note = clip(d && d.note, 500);
  if (note.length < 3) return json({ ok: false, error: 'Say what you need, for example: please add the images.' }, 400);
  const o = await own(env, l, d);
  if (o.error) return o.error;
  const out = await env.DB.batch([
    env.DB.prepare(`UPDATE ${o.t} SET returned_from = supervisor_id, supervisor_id = NULL, returned_at = ?, returned_reason = 'more_info', declined_at = NULL, decline_reason = ? WHERE id = ? AND status = 'pending' AND supervisor_id = ?`).bind(nowIso(), note, o.row.id, l.id),
    auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'request.more_info', subjectType: d.kind, subjectId: o.row.id, meta: { length: note.length } }, { ifChanged: true }),
  ]);
  const changed = !!(out[0] && out[0].meta && out[0].meta.changes);
  if (changed) await moreInfoRequested(env, ctx, { what: d.kind === 'assessment' ? 'as' : 'so', code: o.row.id, learnerId: o.row.learner_id, supervisorName: [l.title, l.first_name, l.last_name].filter(Boolean).join(' ') });
  return json({ ok: true, state: 'more_info', changed });
}
