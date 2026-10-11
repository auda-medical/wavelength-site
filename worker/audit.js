// Append-only audit trail (audit_events, migration 0012). No route edits or deletes a row; the only deletion is the
// retention job, which writes its own summary event. meta carries field names, counts, scopes and codes only: never
// clinical text, tokens, passwords, email addresses or registration numbers. Unknown meta keys are dropped.
import { nowIso } from './time.js';

const META_KEYS = new Set(['fields', 'count', 'counts', 'scope', 'scopes', 'code', 'kind', 'status', 'from', 'to', 'reason', 'grounds', 'basis', 'method', 'application', 'link', 'links', 'returned', 'version', 'oneOffPermitted', 'mayReapply', 'renewal', 'days', 'job', 'outcome', 'route', 'via', 'amends', 'exempt', 'requests', 'notified', 'evidence', 'pseudonym', 'previous', 'searchable', 'organisation', 'request', 'into', 'alias', 'aliasAdded', 'limit', 'day', 'rotated', 'keepThisDevice', 'existing', 'template', 'capacity', 'credentials', 'selfApproval', 'hasNote']);
function cleanMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (!META_KEYS.has(k) || v === undefined) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 300) : v;
  }
  const text = JSON.stringify(out);
  return text.length > 4000 ? '{"truncated":true}' : text;
}
// A prepared statement, so callers can put the audit row in the same D1 batch as the change it records.
// ifChanged: written only when the statement just before it in the batch changed a row (SQLite changes()), so a guarded
// update and its audit row commit together or not at all.
export function auditStmt(env, { actorType, actorId = null, action, subjectType = null, subjectId = null, requestRef = null, meta = {} }, { ifChanged = false } = {}) {
  return env.DB.prepare('INSERT INTO audit_events (at, actor_type, actor_id, action, subject_type, subject_id, request_ref, meta) ' + (ifChanged ? 'SELECT ?,?,?,?,?,?,?,? WHERE changes() > 0' : 'VALUES (?,?,?,?,?,?,?,?)'))
    .bind(nowIso(), actorType, actorId == null ? null : String(actorId), action, subjectType, subjectId == null ? null : String(subjectId), requestRef, cleanMeta(meta));
}
export async function audit(env, e) {
  try { await auditStmt(env, e).run(); } catch { /* before migration 0012: nothing to write to */ }
}
export const learnerActor = (l) => ({ actorType: 'learner', actorId: l.id });
