// Admin: professional and supervisor verification (/admin/supervisors/, admin login only).
// Lists what needs a person (manual checks, ambiguous matches, evidence, rechecks), and for each professional shows
// registrations, credentials, evidence, supervisor approvals and the full verification history. Every decision is
// written to verification_events with the reviewer's name, the scope and the evidence it relied on. Routine work never
// needs SQL. Submitted text is always escaped and never placed inside a script or handler (see CLAUDE.md).
//
// After migration 0012 (supervisor lifecycle) the page also has queues (new applications, more information, renewals,
// needs attention, registration and credential checks, ended, people, system), an applicant view with the basis of
// the application, and the lifecycle decisions: approve (or confirm a renewal in one step), ask for more information,
// reject, end a renewal's grace period, revoke, reinstate and lift a block. Decisions also go to audit_events.
import LOGBOOK from '../data/logbook.json';
import { REG, TYPE, BODY, logEvent, checkRegistration, currentStatus, badgesFrom, scopeLabel, parseList, isCurrentCred } from './professional.js';
import { sendMail } from './academy.js';
import { verificationReady, lifecycleReady, fullName } from './app-util.js';
import { standingOf, suggestedScopes, areaLabels, activateClaimedLinks, supervisorUnavailable, AREAS, verificationOf } from './supervisor-lifecycle.js';
import { approvedGroups, groupLine } from './verification/status.js';
import { matchNames } from './verification/names.js';
import { queueStmt, deliver, deliverLater } from './notify.js';
import { receiptKey, receiptFor } from './supervisor-apply.js';
import { auditStmt, audit } from './audit.js';
import { ukDate, addDays, addMonths, businessDaysSince, longDate } from './time.js';
import { isGmc, gmcRegisterUrl, gmcReview, restrictionDecision, GMC_SOURCE, RESTRICTION_STATE, MAX_CHECK_AGE_DAYS } from './verification/register-review.js';
import { directoryOf, directoryPanel, directoryPost } from './verification/directory-admin.js';
import { capacitiesFor, capacityLabel, CAPACITIES } from './verification/pathways.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const date = (v) => (ISO.test(String(v || '')) ? String(v) : null);
const nowIso = () => new Date().toISOString();
const BASE = '/admin/supervisors/';
const PATHS = LOGBOOK.pathways.filter((p) => p.modules && p.modules.length);
// True once migration 0015 (approval capacity) is applied.
async function hasCapacity(env) { try { await env.DB.prepare('SELECT capacity FROM supervisor_approvals LIMIT 0').all(); return true; } catch { return false; } }
const REG_QUEUE = ['pending', 'manual_verification_required', 'manual_review', 'mismatch', 'source_unavailable'];
const CRED_QUEUE = ['claimed', 'evidence_required', 'manual_review', 'more_evidence', 'not_found', 'source_unavailable', 'directory_match', 'identity_pending'];
const NAV = `<a class="text-link" href="/admin/volunteers/">Volunteers</a> · <a class="text-link" href="/admin/academy/">Academy</a> · <a class="text-link" href="${BASE}">Supervisor verification</a> · <a class="text-link" href="/admin/organisations/">Organisations</a>`;
const name = (l) => [l.title, l.first_name, l.last_name].filter(Boolean).join(' ');
// Who decided. With Cloudflare Access the verified email is recorded instead (worker/index.js), and the field is
// replaced by a line saying so; without it the name typed once is remembered for the session (wl_reviewer cookie).
const REVIEWER_INPUT = '<input name="reviewer" autocomplete="name" maxlength="80" required>';
const reviewerField = `<label>Your name (recorded with the decision)${REVIEWER_INPUT}</label>`;
const form = (action, hidden, inner, button, confirmText) => `<form class="form sv-form" method="post"${confirmText ? ` onsubmit="return confirm(this.dataset.confirm)" data-confirm="${esc(confirmText)}"` : ''}><input type="hidden" name="action" value="${action}">${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}${inner}${reviewerField}<button class="btn btn-ghost small" type="submit">${esc(button)}</button></form>`;
const STYLE = '<style>.sv-more{margin:4px 0 8px}.sv-more summary{cursor:pointer;font-size:14px;font-weight:600;padding:4px 0}.sv-list{margin:6px 0 0;padding-left:0;list-style:none;display:grid;gap:4px}.sv-ok-i{color:#2E7D5B;font-weight:700;margin-right:6px}.sv-no-i{color:#B4453A;font-weight:700;margin-right:6px}.sv-form button[disabled]{opacity:.6;cursor:progress}.sv-grid{display:grid;gap:18px}.sv-card{background:#fff;border:1px solid #E4E0D7;border-radius:12px;padding:18px;overflow-wrap:anywhere}.sv-card h4{margin:0 0 6px}.sv-form{display:grid;gap:8px;margin:10px 0;padding:12px;border:1px dashed #E4E0D7;border-radius:10px}.sv-form label{display:grid;gap:4px;font-size:14px}.sv-actions{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.sv-status{display:inline-block;padding:2px 10px;border-radius:99px;background:#EDEAE3;font-size:13px}.sv-ok{background:#DDEFE9}.sv-bad{background:#F6DEDA}.sv-checks{display:flex;flex-wrap:wrap;gap:6px 14px;border:0;padding:0;margin:0 0 8px}.sv-checks legend{font-weight:600;font-size:14px;margin-bottom:4px}.sv-form .sv-checks label,.sv-form label.consent{display:inline-flex;flex-direction:row;gap:6px;align-items:center}.sv-form input[type=checkbox]{width:18px;height:18px;min-height:0;flex:none;margin:0}.sv-actions{align-items:start}.sv-form button{justify-self:start;align-self:start;width:auto;height:auto;min-height:0}.sv-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.sv-tabs a{padding:6px 12px;border-radius:99px;border:1px solid #E4E0D7;text-decoration:none;color:inherit;font-size:14px}.sv-tabs a[aria-current=page]{background:#0F1E33;color:#fff;border-color:#0F1E33}.sv-banner{padding:12px 14px;border-radius:10px;background:#EDEAE3;margin:10px 0}.sv-warn{background:#F6DEDA}.sv-good{background:#DDEFE9}.sv-text{white-space:pre-wrap;overflow-wrap:anywhere;background:#F7F5F0;border-radius:8px;padding:10px;margin:6px 0}.sv-dl{display:grid;grid-template-columns:minmax(120px,220px) 1fr;gap:6px 14px;margin:8px 0}.sv-dl dt{font-weight:600}.sv-dl dd{margin:0;overflow-wrap:anywhere}@media(max-width:600px){.sv-dl{grid-template-columns:1fr}}</style>';
const pill = (s) => `<span class="sv-status ${s === 'verified' || s === 'approved' ? 'sv-ok' : ['rejected', 'revoked', 'mismatch', 'not_current', 'expired'].includes(s) ? 'sv-bad' : ''}">${esc(String(s).replace(/_/g, ' '))}</span>`;

// ---------- Self-approval (supervisor QA, October 2026) ----------
// Does the person recording a decision look like the person it is about? With Access, the verified email decides.
// Without it the typed name is compared with the account name: a full match, a near match (initials, middle names)
// or a single word that is the person's first or family name. False alarms only ask for an acknowledgement.
export function looksLikeSelf(l, reviewer) {
  const r = String(reviewer || '').trim();
  if (!l || !r) return false;
  if (r.includes('@')) return r.toLowerCase() === String(l.email || '').toLowerCase();
  const fold = (x) => String(x || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z\s'-]/g, ' ');
  const words = fold(r).replace(/^\s*(dr|prof|professor|mr|mrs|ms|miss|mx)\b/, ' ').split(/[\s-]+/).filter(Boolean);
  const own = new Set(fold(`${l.first_name} ${l.last_name}`).split(/[\s-]+/).filter(Boolean));
  if (words.length === 1) return own.has(words[0]);
  const m = matchNames({ given: l.first_name, family: l.last_name }, words.join(' '));
  return m.result === 'match' || (m.result === 'review' && m.method !== 'incomplete');
}
// The reviewer part of an actor id ("admin:wavelength:Firas" or "admin:access:x@y" → the name or email).
const reviewerOf = (actor) => String(actor || '').split(':').slice(2).join(':');

// ---------- Approval email status (one indicator for administrators) ----------
// notification_log statuses, said exactly: 'sent' means ZeptoMail accepted the message for sending. Wavelength gets
// no delivery or bounce reports, so nothing here ever says delivered.
const EMAIL_WORDS = {
  none: ['Not generated', 'No approval email exists for this decision.'],
  pending: ['Queued', 'Waiting to be handed to the email provider.'],
  sending: ['Submitting', 'Being handed to the email provider now.'],
  sent: ['Accepted by the email provider', 'ZeptoMail accepted it for sending. Delivery to the inbox is not confirmed: Wavelength receives no delivery or bounce reports.'],
  failed: ['Failed', 'The email provider refused it, or email sending is not set up. It is retried by the daily job, up to three attempts.'],
  unknown: ['Unknown', 'The email provider did not answer. It may or may not have gone, so it is never retried on its own.'],
};
export async function approvalEmailRow(env, { key = null, learnerId = null } = {}) {
  if (key) return env.DB.prepare('SELECT key, status, attempts, last_error, created_at, sent_at, payload IS NOT NULL AS resendable FROM notification_log WHERE key = ?').bind(key).first();
  return env.DB.prepare("SELECT key, status, attempts, last_error, created_at, sent_at, payload IS NOT NULL AS resendable FROM notification_log WHERE learner_id = ? AND kind = 'app_approved' ORDER BY created_at DESC LIMIT 1").bind(learnerId).first();
}
function emailStatusHtml(row, back = {}) {
  const st = row ? row.status : 'none';
  const [word, help] = EMAIL_WORDS[st] || [st, ''];
  const when = row ? (row.sent_at || row.created_at || '').slice(0, 16).replace('T', ' ') : '';
  const cls = st === 'sent' ? 'sv-good' : ['failed', 'unknown'].includes(st) ? 'sv-warn' : '';
  const retry = row && ['failed', 'unknown'].includes(st) && row.resendable ? form('notif_resend', { key: row.key, ...back }, '', 'Send again', 'Send the approval email again? If the first one did arrive, the supervisor gets it twice.') : '';
  return `<div class="sv-banner ${cls}" data-email-status="${esc(st)}"><b>Approval email: ${esc(word)}</b>${when ? ` <small>(${esc(when)} UTC${row.attempts ? `, ${row.attempts} attempt${row.attempts === 1 ? '' : 's'}` : ''})</small>` : ''}<br><small>${esc(help)}${row && row.last_error && st !== 'sent' ? ` Last error: ${esc(row.last_error)}.` : ''}</small>${retry}</div>`;
}

// opts.reviewer: the name remembered from this administrator's last decision; opts.access: their Access email.
export async function supervisorsAdminHtml(env, url, admin = '', opts = {}) {
  const html = await adminPage(env, url, admin, opts);
  const who = opts.access ? `<p class="form-note">Recorded as ${esc(opts.access)} (Cloudflare Access).</p><input type="hidden" name="reviewer" value="access">` : null;
  // Repeated clicks: the static admin shell (build.js) disables a sent .sv-form's button at once; the server's guarded
  // updates and outbox keys are the real protection.
  return (who ? html.split(reviewerField).join(who) : opts.reviewer ? html.split(REVIEWER_INPUT).join(REVIEWER_INPUT.replace(' required', ` value="${esc(clip(opts.reviewer, 80))}" required`)) : html);
}
async function adminPage(env, url, admin = '', opts = {}) {
  if (!(await verificationReady(env))) return `${STYLE}<h2 class="display" style="font-size:34px;margin:0 0 8px">Supervisor verification</h2><p class="admin-summary">Not available yet: apply migrations/0011_verification.sql to the database first. ${NAV}</p>`;
  const m = url.searchParams.get('m') || '';
  const id = Number(url.searchParams.get('id'));
  const appId = Number(url.searchParams.get('app'));
  const note = m ? `<p class="form-note" style="font-weight:600">${esc(m)}</p>` : '';
  const life = await lifecycleReady(env);
  const me = opts.access || opts.reviewer || '';
  if (life && appId) return STYLE + await applicationDetail(env, appId, note, me);
  if (id) return STYLE + await detail(env, id, note, life, me);
  return STYLE + (life ? await queues(env, url.searchParams.get('tab') || 'new', note) : await list(env, note));
}

async function claimsQueue(env) {
  const regs = await env.DB.prepare(`SELECT r.*, l.title, l.first_name, l.last_name, l.email FROM professional_registrations r JOIN learners l ON l.id = r.learner_id WHERE r.active = 1 AND (r.status IN (${REG_QUEUE.map(() => '?').join(',')}) OR r.failure_state = 'recheck_due') ORDER BY r.updated_at`).bind(...REG_QUEUE).all();
  const creds = await env.DB.prepare(`SELECT c.*, l.title, l.first_name, l.last_name, l.email FROM credentials c JOIN learners l ON l.id = c.learner_id WHERE c.active = 1 AND (c.status IN (${CRED_QUEUE.map(() => '?').join(',')}) OR c.failure_state = 'recheck_due') ORDER BY c.updated_at`).bind(...CRED_QUEUE).all();
  return [
    ...(regs.results || []).map((r) => `<tr><td>${esc(r.updated_at.slice(0, 10))}</td><td><a class="text-link" href="${BASE}?id=${r.learner_id}">${esc(name(r))}</a><br>${esc(r.email)}</td><td>Registration: ${esc((REG[r.regulator] || {}).short || r.regulator)} ${esc(r.registration_number)}</td><td>${pill(r.failure_state === 'recheck_due' ? 'recheck due' : r.status)}${r.failure_state && r.failure_state !== 'recheck_due' ? `<br><small>${esc(r.failure_state)}</small>` : ''}</td></tr>`),
    ...(creds.results || []).map((c) => `<tr><td>${esc(c.updated_at.slice(0, 10))}</td><td><a class="text-link" href="${BASE}?id=${c.learner_id}">${esc(name(c))}</a><br>${esc(c.email)}</td><td>${esc((TYPE[c.credential_type] || {}).label || c.credential_type)}: ${esc(parseList(c.modules).join(', '))}</td><td>${pill(c.failure_state === 'recheck_due' ? 'recheck due' : c.status)}</td></tr>`),
  ];
}
const claimsTable = (q) => (q.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Updated</th><th scope="col">Person</th><th scope="col">Claim</th><th scope="col">Status</th></tr></thead><tbody>${q.join('')}</tbody></table></div>` : '<p class="admin-summary">Nothing waiting.</p>');
async function peopleTable(env, life = false) {
  const people = await env.DB.prepare(`SELECT l.id, l.title, l.first_name, l.last_name, l.email, l.email_status${life ? ', l.test_account' : ''},
      (SELECT GROUP_CONCAT(regulator || ' ' || status, ', ') FROM professional_registrations WHERE learner_id = l.id AND active = 1) AS regs,
      (SELECT COUNT(*) FROM credentials WHERE learner_id = l.id AND active = 1) AS creds,
      (SELECT COUNT(*) FROM supervisor_approvals WHERE learner_id = l.id AND status = 'approved') AS approvals
      ${life ? ", (SELECT COUNT(*) FROM supervisor_blocks WHERE learner_id = l.id AND lifted_at IS NULL) AS blocked" : ''}
    FROM learners l WHERE l.id IN (SELECT learner_id FROM professional_registrations UNION SELECT learner_id FROM credentials UNION SELECT learner_id FROM supervisor_approvals${life ? ' UNION SELECT learner_id FROM supervisor_applications UNION SELECT learner_id FROM supervisor_blocks' : ''}) ORDER BY l.last_name LIMIT 500`).all();
  return (people.results || []).length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Registrations</th><th scope="col">Credentials</th><th scope="col">Approvals</th></tr></thead><tbody>${people.results.map((p) => `<tr><td><a class="text-link" href="${BASE}?id=${p.id}">${esc(name(p))}</a>${p.test_account ? ' <small>(test account)</small>' : ''}${p.blocked ? ` ${pill('blocked')}` : ''}</td><td>${esc(p.email)}<br><small>${esc(String(p.email_status || '').replace(/_/g, ' '))}</small></td><td>${esc(p.regs || 'None')}</td><td>${p.creds}</td><td>${p.approvals}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No professional claims yet.</p>';
}

async function list(env, note) {
  const q = await claimsQueue(env);
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Supervisor verification</h2>
  <p class="admin-summary">Professional registrations, external credentials and Wavelength supervisor approvals. Registration and credential checks are separate from supervisor approval: approve a supervisor only for the pathway modules the evidence supports. ${NAV}</p>${note}
  <h3 style="margin:28px 0 10px">Needs a decision (${q.length})</h3>
  ${claimsTable(q)}
  <h3 style="margin:28px 0 10px">Professionals</h3>
  ${await peopleTable(env)}`;
}

// ---------- Lifecycle queues (migration 0012) ----------
const KIND = { initial: 'New application', reapplication: 'Reapplication', renewal: 'Renewal' };
const jsonList = (v) => { try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
const jsonObj = (v) => { try { const x = JSON.parse(v || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
const areaNames = (ids) => ids.map((id) => (AREAS.find((a) => a.id === id) || { label: id }).label);
// What the application rests on, so the reviewer sees at a glance whether there are documents.
function basisOf(a) {
  if (a.files) return { text: `Uploaded evidence (${a.files} ${a.files === 1 ? 'file' : 'files'})`, cls: 'sv-good' };
  if (a.kind === 'renewal' && a.nothing_changed) return { text: 'Renewal: nothing material has changed', cls: '' };
  return { text: 'Self-declared experience, no documents', cls: 'sv-warn' };
}
function regText(a) {
  if (a.no_registration) return `Not on a statutory register${a.other_regulator ? ` (${a.other_regulator})` : ''}`;
  if (!a.reg_regulator) return 'No registration given';
  return `${(REG[a.reg_regulator] || {}).short || a.reg_regulator} ${a.reg_status === 'verified' ? 'verified' : String(a.reg_status || '').replace(/_/g, ' ')}`;
}
const APP_SQL = `SELECT a.*, l.title, l.first_name, l.last_name, l.email, l.test_account, r.regulator AS reg_regulator, r.status AS reg_status,
    (SELECT COUNT(*) FROM credential_evidence e WHERE e.subject_type = 'application' AND e.subject_id = a.id) AS files,
    (SELECT t.title || ' ' || t.first_name || ' ' || t.last_name FROM supervisor_links k JOIN learners t ON t.id = k.learner_id WHERE k.id = a.link_id) AS invited_by
  FROM supervisor_applications a JOIN learners l ON l.id = a.learner_id LEFT JOIN professional_registrations r ON r.id = a.registration_id`;
function appTable(rows, { waiting = true } = {}) {
  if (!rows.length) return '<p class="admin-summary">Nothing waiting.</p>';
  return `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Application</th><th scope="col">${waiting ? 'Waiting' : 'Decided'}</th><th scope="col">Applicant</th><th scope="col">Basis</th><th scope="col">Areas requested</th></tr></thead><tbody>${rows.map((a) => {
    const days = businessDaysSince(a.submitted_at);
    const b = basisOf(a);
    return `<tr><td><a class="text-link" href="${BASE}?app=${a.id}">#${a.id} ${esc(KIND[a.kind] || a.kind)}</a><br>${pill(a.status)}</td>
      <td>${waiting ? `${esc((a.submitted_at || '').slice(0, 10))}<br>${days >= 3 ? `<b>${days} business days</b>` : `${days} business day${days === 1 ? '' : 's'}`}` : `${esc((a.decided_at || '').slice(0, 10))}<br><small>${esc(a.decided_by || '')}</small>`}</td>
      <td>${esc(name(a))}${a.test_account ? ' <small>(test account)</small>' : ''}<br><small>${esc([a.role, a.organisation].filter(Boolean).join(', '))}</small>${a.invited_by ? `<br><small>Invited by ${esc(a.invited_by)}</small>` : ''}</td>
      <td><span class="sv-status ${b.cls === 'sv-good' ? 'sv-ok' : b.cls === 'sv-warn' ? 'sv-bad' : ''}">${esc(b.text)}</span><br><small>${esc(regText(a))}</small></td>
      <td>${esc(areaNames(jsonList(a.requested_areas)).join(', ') || 'None chosen')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

async function queues(env, tab, note) {
  const day = ukDate();
  const fresh = (await env.DB.prepare(`${APP_SQL} WHERE a.status = 'submitted' AND a.kind != 'renewal' ORDER BY a.submitted_at`).all()).results || [];
  const more = (await env.DB.prepare(`${APP_SQL} WHERE a.status = 'more_info' ORDER BY a.more_info_at`).all()).results || [];
  const renewals = (await env.DB.prepare(`${APP_SQL} WHERE a.status = 'submitted' AND a.kind = 'renewal' ORDER BY a.submitted_at`).all()).results || [];
  const claims = await claimsQueue(env);
  const lapses = (await env.DB.prepare('SELECT w.*, l.title, l.first_name, l.last_name FROM supervisor_watch w JOIN learners l ON l.id = w.learner_id WHERE w.lapse_since IS NOT NULL ORDER BY w.lapse_since').all()).results || [];
  const pastDate = (await env.DB.prepare("SELECT a.learner_id, MIN(a.review_on) AS review_on, l.title, l.first_name, l.last_name FROM supervisor_approvals a JOIN learners l ON l.id = a.learner_id WHERE a.status = 'approved' AND a.review_on < ? GROUP BY a.learner_id ORDER BY review_on").bind(day).all()).results || [];
  const dueSoon = (await env.DB.prepare(`SELECT a.learner_id, MIN(a.review_on) AS review_on, l.title, l.first_name, l.last_name FROM supervisor_approvals a JOIN learners l ON l.id = a.learner_id WHERE a.status = 'approved' AND a.review_on >= ? AND a.review_on <= ?
      AND NOT EXISTS (SELECT 1 FROM supervisor_applications s WHERE s.learner_id = a.learner_id AND s.kind = 'renewal' AND s.status IN ('draft', 'submitted', 'more_info')) GROUP BY a.learner_id ORDER BY review_on`).bind(day, addDays(day, 14)).all()).results || [];
  const notif = (await env.DB.prepare("SELECT COUNT(*) AS n FROM notification_log WHERE status IN ('unknown') OR (status = 'failed' AND attempts >= 3)").first()).n;
  // Approval emails that have not been accepted by the provider, at any attempt: the supervisor may not know.
  const approvalMail = (await env.DB.prepare("SELECT n.key, n.learner_id, n.status, n.last_error, l.title, l.first_name, l.last_name FROM notification_log n LEFT JOIN learners l ON l.id = n.learner_id WHERE n.kind = 'app_approved' AND n.status IN ('failed', 'unknown') ORDER BY n.created_at DESC LIMIT 50").all()).results || [];
  // Open applications of people who already hold a current approval (approved from the person page before October
  // 2026, or a genuine further application): each needs a decision so the app does not say "under review".
  const staleOpen = (await env.DB.prepare(`${APP_SQL} WHERE a.status IN ('submitted', 'more_info') AND a.kind != 'renewal' AND EXISTS (SELECT 1 FROM supervisor_approvals x WHERE x.learner_id = a.learner_id AND x.status = 'approved') ORDER BY a.submitted_at`).all()).results || [];
  const selfRows = await selfApprovals(env);
  const attention = lapses.length + pastDate.length + dueSoon.length + (notif ? 1 : 0) + approvalMail.length + staleOpen.length + selfRows.length;
  const tabs = [['new', `New applications (${fresh.length})`], ['more', `Waiting for information (${more.length})`], ['renewals', `Renewals (${renewals.length})`], ['attention', `Needs attention (${attention})`], ['claims', `Registration and credential checks (${claims.length})`], ['ended', 'Decided and ended'], ['people', 'People'], ['system', 'System']];
  if (!tabs.some(([k]) => k === tab)) tab = 'new';
  const nav = `<nav class="sv-tabs" aria-label="Queues">${tabs.map(([k, label]) => `<a href="${BASE}?tab=${k}"${k === tab ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>`;
  let body = '';
  if (tab === 'new') body = `<p class="admin-summary">Applications sent by the applicant. Applicants are told to allow up to 3 business days; anything waiting longer is in bold.</p>${appTable(fresh)}`;
  if (tab === 'more') body = `<p class="admin-summary">You asked these applicants for more information. They return to New applications or Renewals when the applicant sends the application again. A renewal waiting here has no grace period.</p>${appTable(more)}`;
  if (tab === 'renewals') body = `<p class="admin-summary">Every renewal needs a decision here. "Confirm renewal" renews the same scopes for 12 months in one step. A complete renewal sent on time keeps the supervisor active for up to 30 days after their review date while it waits ("Renewal under review").</p>${appTable(renewals)}`;
  if (tab === 'claims') body = `<p class="admin-summary">Registration and credential claims that need a person. These are separate from supervisor approval.</p>${claimsTable(claims)}`;
  if (tab === 'attention') {
    const row = (r, what) => `<tr><td><a class="text-link" href="${BASE}?id=${r.learner_id}">${esc(name(r))}</a></td><td>${what}</td></tr>`;
    const rows = [
      ...lapses.map((w) => row(w, `Paused since ${esc(w.lapse_since)}: ${esc({ registration: 'registration not current', credential: 'a required credential is not current', email: 'email not confirmed' }[w.lapse_reason] || w.lapse_reason)}. Learners are told after 14 days.`)),
      ...pastDate.map((r) => row(r, `Review date ${esc(r.review_on)} has passed: renewal under review (grace until ${esc(addDays(r.review_on, 30))}), or waiting for the daily job to end it.`)),
      ...dueSoon.map((r) => row(r, `Review date ${esc(r.review_on)} within 14 days and no renewal started.`)),
      ...staleOpen.map((a) => row(a, `Application <a class="text-link" href="${BASE}?app=${a.id}">#${a.id}</a> is still open although they hold a current approval, so their app also says it is under review. Record it as approved or decide it.`)),
      ...selfRows.map((r) => row(r, `Approved by ${esc(reviewerOf(r.approved_by) || 'an administrator')} on ${esc((r.approved_at || '').slice(0, 10))}, who appears to be the supervisor. An independent review by another administrator is recommended.`)),
      ...approvalMail.map((n) => row(n, `Approval email ${esc(n.status)}${n.last_error ? ` (${esc(n.last_error)})` : ''}: the supervisor may not know they were approved. Resend it from their page or the System tab.`)),
    ];
    body = `${notif ? `<p class="sv-banner sv-warn">${notif} email${notif === 1 ? '' : 's'} may not have gone. See <a class="text-link" href="${BASE}?tab=system">System</a>.</p>` : ''}${rows.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Supervisor</th><th scope="col">What needs attention</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<p class="admin-summary">Nothing needs attention.</p>'}`;
  }
  if (tab === 'ended') {
    const decided = (await env.DB.prepare(`${APP_SQL} WHERE a.status IN ('approved', 'rejected', 'withdrawn') AND a.decided_at >= ? ORDER BY a.decided_at DESC LIMIT 200`).bind(new Date(Date.now() - 180 * 864e5).toISOString()).all()).results || [];
    const ended = (await env.DB.prepare("SELECT a.*, l.title, l.first_name, l.last_name FROM supervisor_approvals a JOIN learners l ON l.id = a.learner_id WHERE a.status != 'approved' ORDER BY COALESCE(a.ended_at, a.created_at) DESC LIMIT 200").all()).results || [];
    body = `<h3 style="margin:18px 0 10px">Applications decided in the last 180 days</h3>${appTable(decided, { waiting: false })}
    <h3 style="margin:28px 0 10px">Approvals that have ended</h3>${ended.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Supervisor</th><th scope="col">Scope</th><th scope="col">Status</th><th scope="col">Ended</th><th scope="col">Reason</th></tr></thead><tbody>${ended.map((a) => `<tr><td><a class="text-link" href="${BASE}?id=${a.learner_id}">${esc(name(a))}</a></td><td>${esc(scopeLabel(a.pathway, a.module))}</td><td>${pill(a.status)}</td><td>${esc((a.ended_at || '').slice(0, 10))} ${esc(a.ended_by || '')}</td><td>${esc(a.ended_reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">None.</p>'}`;
  }
  if (tab === 'people') body = await peopleTable(env, true);
  if (tab === 'system') body = await systemTab(env);
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Supervisor verification</h2>
  <p class="admin-summary">Supervisor applications, renewals, registrations, credentials and Wavelength supervisor approvals. Approve a supervisor only for the pathway modules the evidence supports. Wavelength approval is not an accreditation by RCEM, FAMUS, FUSIC or any other body. ${NAV}</p>${note}${nav}${body}`;
}

async function systemTab(env) {
  const runs = (await env.DB.prepare('SELECT * FROM job_runs ORDER BY id DESC LIMIT 15').all()).results || [];
  const notes = (await env.DB.prepare("SELECT key, learner_id, kind, status, attempts, last_error, created_at FROM notification_log WHERE status IN ('failed', 'unknown', 'sending') ORDER BY created_at DESC LIMIT 100").all()).results || [];
  const counts = (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM notification_log GROUP BY status').all()).results || [];
  const blocks = (await env.DB.prepare('SELECT b.*, l.title, l.first_name, l.last_name FROM supervisor_blocks b JOIN learners l ON l.id = b.learner_id WHERE b.lifted_at IS NULL ORDER BY b.blocked_at DESC').all()).results || [];
  const last = runs.find((r) => r.job === 'supervisor-daily');
  return `<h3 style="margin:18px 0 10px">Daily supervisor job</h3>
  <p class="sv-banner ${last && last.outcome === 'ok' ? 'sv-good' : 'sv-warn'}">${last ? `Last run started ${esc(last.started_at)}: ${esc(last.outcome || 'still running or stopped')}.` : "The daily job has not run yet. It needs its own daily cron trigger in wrangler.jsonc, which is added only with the owner's approval. Expiry is still enforced on every request."}</p>
  ${runs.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Started</th><th scope="col">Job</th><th scope="col">Outcome</th><th scope="col">Counts</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${esc(r.started_at)}</td><td>${esc(r.job)}</td><td>${pill(r.outcome || 'running')}${r.error ? `<br><small>${esc(r.error)}</small>` : ''}</td><td><small>${esc(r.counts || '')}</small></td></tr>`).join('')}</tbody></table></div>` : ''}
  <h3 style="margin:28px 0 10px">Emails</h3>
  <p class="admin-summary">${counts.map((c) => `${esc(c.status)}: ${c.n}`).join(' · ') || 'None queued yet.'}</p>
  <p class="admin-summary">Each email has one row, so routine retries never send it twice. "Unknown" means the provider did not answer: it may or may not have gone, so it is never retried on its own. Check with the recipient or the ZeptoMail log, then resend or mark it sent.</p>
  ${notes.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Queued</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>${notes.map((n) => `<tr><td>${esc(n.created_at)}</td><td>${esc(n.kind)}${n.learner_id ? ` · <a class="text-link" href="${BASE}?id=${n.learner_id}">account</a>` : ''}</td><td>${pill(n.status)} attempts ${n.attempts}${n.last_error ? `<br><small>${esc(n.last_error)}</small>` : ''}</td><td>${n.status === 'sending' ? '' : `${form('notif_resend', { key: n.key }, '', 'Send again', 'Send this email again? If the first one did arrive, the recipient gets it twice.')}${form('notif_mark_sent', { key: n.key }, '', 'Mark as sent')}`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No emails need attention.</p>'}
  <h3 style="margin:28px 0 10px">Active blocks</h3>
  ${blocks.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Person</th><th scope="col">Kind</th><th scope="col">Since</th><th scope="col">One-off assessment</th></tr></thead><tbody>${blocks.map((b) => `<tr><td><a class="text-link" href="${BASE}?id=${b.learner_id}">${esc(name(b))}</a></td><td>${esc(b.kind === 'revoked' ? 'Supervisor status revoked' : 'Rejected on verification or safety grounds')}</td><td>${esc((b.blocked_at || '').slice(0, 10))} ${esc(b.blocked_by)}</td><td>${b.one_off_permitted ? `Permitted: ${esc(b.one_off_note || '')}` : 'Blocked'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No active blocks.</p>'}`;
}

// ---------- One application ----------
const PATHWAY_NAMES = { rcem: 'RCEM', famus: 'FAMUS', fusic: 'FUSIC', international: 'International pathways and frameworks', general: 'General or local logbooks' };
const pathwayBox = (p, ticked) => `<fieldset class="sv-checks"><legend>${esc(p.label)}</legend><label><input type="checkbox" name="scope" value="${p.id}:*"${ticked.includes(`${p.id}:*`) ? ' checked' : ''}>All modules</label>${p.modules.map((m) => `<label><input type="checkbox" name="scope" value="${p.id}:${m.id}"${ticked.includes(`${p.id}:${m.id}`) ? ' checked' : ''}>${esc(m.label)}</label>`).join('')}</fieldset>`;
// The pathways that matter for this decision (requested, or already ticked) open; every other pathway one tap away.
const INTERNATIONAL = ['eusem', 'eusem2', 'acem', 'cpocus', 'acep'];
function scopeBoxes(ticked, requested = []) {
  const focus = new Set([...ticked.map((s) => s.split(':')[0]), ...requested.flatMap((p) => (p === 'international' ? INTERNATIONAL : [p]))]);
  const shown = PATHS.filter((p) => focus.has(p.id)), rest = PATHS.filter((p) => !focus.has(p.id));
  if (!shown.length) return PATHS.map((p) => pathwayBox(p, ticked)).join('');
  return shown.map((p) => pathwayBox(p, ticked)).join('') + (rest.length ? `<details class="sv-more"><summary>Other pathways (${rest.length})</summary>${rest.map((p) => pathwayBox(p, ticked)).join('')}</details>` : '');
}
const roleSelect = () => `<label>Verified role<select name="capacity">${CAPACITIES.map((k) => `<option value="${k}"${k === 'supervisor' ? ' selected' : ''}>${esc(capacityLabel(k))}</option>`).join('')}</select></label>`;
const basisBoxes = (creds, ticked = []) => (creds.length ? `<fieldset class="sv-checks"><legend>Credentials this approval relies on</legend>${creds.map((c) => `<label><input type="checkbox" name="basis" value="${c.id}"${ticked.includes(c.id) ? ' checked' : ''}>${esc((TYPE[c.credential_type] || {}).label || c.credential_type)}: ${esc(parseList(c.modules).join(', '))}</label>`).join('')}<small class="form-note">If one of these expires or is withdrawn, supervisor status pauses until it is current again.</small></fieldset>` : '<p class="form-note">No verified credentials. The approval rests on the registration and the application.</p>');
const optionalNote = '<details class="sv-more"><summary>Add a note (optional)</summary><label>Note (internal, not sent)<textarea name="notes" maxlength="1000"></textarea></label></details>';
const selfBox = '<div class="sv-banner sv-warn"><b>This looks like your own application.</b> Wavelength recommends that another administrator decides it. If you approve it yourself, it is recorded as a self-approval and listed for an independent review.<label class="consent"><input type="checkbox" name="self_ack" value="1"><span>I am approving my own supervisor status</span></label><label>What independent evidence supports it (required, recorded)<textarea name="self_reason" maxlength="1000"></textarea></label></div>';
// "Before approving": the three things a reviewer checks, read from the records.
function checklist(st, creds) {
  const tick = (ok) => (ok ? '<span class="sv-ok-i" aria-label="Done">✓</span>' : '<span class="sv-no-i" aria-label="Not yet">✗</span>');
  const reg = st.registrations.find((r) => r.active && r.status === 'verified');
  const pending = st.registrations.find((r) => r.active && r.status !== 'verified');
  return `<div class="sv-banner"><b>Before approving</b><ul class="sv-list">
    <li>${tick(st.learner && st.learner.email_status === 'verified')} Email ${st.learner && st.learner.email_status === 'verified' ? 'confirmed' : 'not confirmed: an approval would not count'}</li>
    <li>${tick(!!reg)} Professional registration ${reg ? `${esc((REG[reg.regulator] || {}).short || reg.regulator)} verified ${esc((reg.verified_at || '').slice(0, 10))}` : pending ? `${esc((REG[pending.regulator] || {}).short || pending.regulator)} ${esc(String(pending.status).replace(/_/g, ' '))}` : 'none given'}</li>
    <li>${tick(creds.some((c) => isCurrentCred(c)))} Credentials ${creds.length ? creds.map((c) => `${esc((TYPE[c.credential_type] || {}).label || c.credential_type)} (${esc(isCurrentCred(c) ? 'verified' : String(c.status).replace(/_/g, ' '))})`).join(', ') : 'none claimed'}</li>
  </ul></div>`;
}
// The new "approved until" date: 12 months from today, or from the current review date for an early renewal.
const renewBase = (approvals, day) => { const cur = approvals.map((a) => a.review_on).filter(Boolean).sort()[0]; return cur && cur > day ? cur : day; };

async function applicationDetail(env, appId, note, me = '') {
  const a = await env.DB.prepare(`${APP_SQL} WHERE a.id = ?`).bind(appId).first();
  if (!a) return `<p class="admin-summary">Application not found. <a class="text-link" href="${BASE}">Back to the queues</a></p>`;
  const st = await currentStatus(env, a.learner_id);
  const standing = await standingOf(env, a.learner_id, st);
  const day = ukDate();
  const reg = a.registration_id ? await env.DB.prepare('SELECT * FROM professional_registrations WHERE id = ?').bind(a.registration_id).first() : null;
  const credIds = jsonList(a.credential_ids).map(Number);
  const creds = credIds.length ? ((await env.DB.prepare(`SELECT * FROM credentials WHERE learner_id = ? AND id IN (${credIds.map(() => '?').join(',')})`).bind(a.learner_id, ...credIds).all()).results || []) : [];
  const evid = (await env.DB.prepare("SELECT id, kind, description, url, file_name, file_size, file_sha256, purged_at, created_at FROM credential_evidence WHERE learner_id = ? AND ((subject_type = 'application' AND subject_id = ?) OR subject_type = 'credential') ORDER BY id").bind(a.learner_id, a.id).all()).results || [];
  const evRow = (x) => `<li>#${x.id} ${esc(x.kind)}: ${esc(x.description || '')}${x.url ? ` <a class="text-link" href="${esc(x.url)}" rel="noopener noreferrer" target="_blank">link</a>` : ''}${x.file_name ? (x.purged_at ? ` · file ${esc(x.file_name)} (deleted; SHA-256 ${esc(String(x.file_sha256).slice(0, 16))}…)` : ` · <a class="text-link" href="${BASE}evidence/?id=${x.id}">${esc(x.file_name)}</a> (${Math.round((x.file_size || 0) / 1024)} KB)`) : ''}</li>`;
  const appFiles = (await env.DB.prepare("SELECT id FROM credential_evidence WHERE subject_type = 'application' AND subject_id = ?").bind(a.id).all()).results.map((r) => r.id);
  const ex = jsonObj(a.experience);
  const areas = jsonList(a.requested_areas), pathways = jsonList(a.requested_pathways);
  const b = basisOf(a);
  const history = (await env.DB.prepare("SELECT * FROM audit_events WHERE subject_type = 'application' AND subject_id = ? ORDER BY id").bind(String(a.id)).all()).results || [];
  const previous = (await env.DB.prepare("SELECT id, kind, status, submitted_at, decided_at FROM supervisor_applications WHERE learner_id = ? AND id != ? ORDER BY id DESC").bind(a.learner_id, a.id).all()).results || [];
  const link = a.link_id ? await env.DB.prepare('SELECT s.status, s.claimed_at, s.created_at, t.title, t.first_name, t.last_name FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.id = ?').bind(a.link_id).first() : null;
  const waitingLinks = (await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_links WHERE supervisor_id = ? AND status = 'pending' AND claimed_at IS NOT NULL").bind(a.learner_id).first()).n;
  const open = ['submitted', 'more_info'].includes(a.status);
  const renewal = a.kind === 'renewal';
  const live = st.approvals;
  const lastApproved = await env.DB.prepare("SELECT approved_scopes FROM supervisor_applications WHERE learner_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1").bind(a.learner_id).first();
  const ticked = live.length ? live.map((x) => `${x.pathway}:${x.module}`) : lastApproved && jsonList(lastApproved.approved_scopes).length ? jsonList(lastApproved.approved_scopes) : suggestedScopes(areas, pathways);
  const until = addMonths(renewBase(renewal ? live : [], day), 12);
  const verifiedCreds = st.credentials.filter(isCurrentCred);
  const H = { app: a.id };
  const banner = [checklist(st, creds)];
  // An application left open after the person was approved from the person page (the cause of "Verified" and "under
  // review" together in the app, October 2026). Record it as decided, without changing any approval.
  const currentNow = live.filter((x) => x.current);
  if (open && !renewal && currentNow.length) banner.push(`<div class="sv-banner sv-warn"><b>Already approved:</b> ${esc(approvedGroups(currentNow).map(groupLine).join('; '))}. This application is still open, so the supervisor's app also says it is under review. If nothing else was asked for, record it as approved. Otherwise decide it below.
    ${form('app_close_approved', H, '<label class="consent"><input type="checkbox" name="send_email" value="1"><span>Also email the supervisor their approval confirmation (leave unticked if they already know)</span></label>', 'Record as approved (no change to approvals)')}</div>`);
  if (a.status === 'approved') banner.push(emailStatusHtml(await approvalEmailRow(env, { key: `app_approved:${a.id}` }), H));
  if (st.block) banner.push(`<p class="sv-banner sv-warn">This account is blocked (${esc(st.block.kind === 'revoked' ? 'supervisor status revoked' : 'rejected on verification or safety grounds')}, ${esc((st.block.blocked_at || '').slice(0, 10))}). Lift the block on the <a class="text-link" href="${BASE}?id=${a.learner_id}">person page</a> before approving.</p>`);
  if (!st.learner || st.learner.email_status !== 'verified') banner.push('<p class="sv-banner sv-warn">The email address is not confirmed. An approval would not count until it is.</p>');
  if (!st.hasReg) banner.push(`<p class="sv-banner sv-warn">${a.no_registration ? 'The applicant says they are not on a statutory register.' : 'The registration is not verified yet.'} Verify it on the <a class="text-link" href="${BASE}?id=${a.learner_id}">person page</a>, or record a registration exemption with your reason below. An exemption covers the registration only: you must still be satisfied about identity and experience.</p>`);
  if (renewal && open) {
    const cur = live.map((x) => x.review_on).filter(Boolean).sort()[0];
    banner.push(`<p class="sv-banner">${cur ? `Current approval runs until ${esc(longDate(cur))}. ` : 'No approval is live (it may have expired). '}${a.current_at_submit ? 'Sent on time while fully approved' : 'Not sent while fully approved and current'}${a.grace_blocked ? '; grace ended by an administrator' : ''}. Standing now: <b>${esc(standing.standing.replace(/_/g, ' '))}</b>.</p>`);
  }
  const dl = (rows) => `<dl class="sv-dl">${rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const actions = !open ? '' : `<h3 style="margin:28px 0 10px">Decision</h3><div class="sv-actions">
    ${renewal && live.length ? form('app_confirm_renewal', H, `<p class="form-note">Renews the same scopes (${esc(live.map((x) => scopeLabel(x.pathway, x.module)).join(', '))}) until ${esc(longDate(until))}, keeping their basis. Use "Approve" instead to change scopes or basis.</p><label>Note (optional)<input name="notes" maxlength="500"></label>`, 'Confirm renewal') : ''}
    ${form('app_approve', H, `<p class="form-note">Modules: pre-ticked from what was requested${live.length ? ' and the current approval' : ''}. Tick only what the evidence supports.</p>${scopeBoxes(ticked, pathways)}${roleSelect()}
      ${basisBoxes(verifiedCreds, credIds)}
      <label>Approved until (12 months at most)<input type="date" name="review_on" value="${esc(until)}" max="${esc(until)}" required></label>
      ${st.hasReg ? '' : '<label class="consent"><input type="checkbox" name="exempt" value="1"><span>Registration exemption: approve without a verified registration</span></label><label>Reason for the exemption, and how you checked identity and experience instead<textarea name="exempt_reason" maxlength="1000"></textarea></label>'}
      ${me && looksLikeSelf(st.learner, me) ? selfBox : ''}${optionalNote}
      <p class="form-note">Recorded automatically: who decided and when, the modules, role, credentials and evidence, and the status before and after. The supervisor is emailed once the approval is saved.</p>`, renewal ? 'Approve renewal' : 'Approve')}
    ${a.status === 'submitted' ? form('app_receipt', H, '<p class="form-note">Sends the applicant the normal receipt for their current submission if it was never sent. It never sends a second copy and changes nothing in the application.</p>', 'Send submission receipt') : ''}
    ${a.status === 'submitted' ? form('app_more', H, '<label>What you need (emailed to the applicant)<textarea name="notes" required maxlength="800"></textarea></label>', 'Ask for more information') : ''}
    ${form('app_reject', H, `<label>Grounds<select name="grounds" required><option value="insufficient_evidence">Not enough evidence or experience</option><option value="verification_or_safety">Verification or safety grounds (blocks one-off assessor signing)</option></select></label>
      <label>Internal note (not sent)<textarea name="notes" required maxlength="1000"></textarea></label>
      <label>Message to the applicant (optional, included in the email)<textarea name="message" maxlength="1000"></textarea></label>
      <label class="consent"><input type="checkbox" name="may_reapply" value="1" checked><span>They may apply again</span></label>
      <label class="consent"><input type="checkbox" name="one_off" value="1"><span>Verification or safety grounds only: one-off assessment through Wavelength remains permitted</span></label>
      <label>Why one-off assessment remains permitted<input name="one_off_note" maxlength="500"></label>`, 'Reject', 'Reject this application? The applicant is emailed and any learners waiting on them are told.')}
    ${renewal && a.status === 'submitted' && !a.grace_blocked ? form('grace_block', H, '<label>Material change found (ends the 30-day grace period)<textarea name="notes" required maxlength="800"></textarea></label>', 'End the grace period', 'End the grace period? If the review date has passed, supervisor status pauses at once.') : ''}
  </div>`;
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">${esc(KIND[a.kind] || a.kind)} #${a.id}: ${esc(name(a))}</h2>
  <p class="admin-summary">${pill(a.status)} · ${a.submitted_at ? `Sent ${esc(a.submitted_at.slice(0, 10))}, waiting ${businessDaysSince(a.submitted_at)} business days` : 'Not sent yet'} · <a class="text-link" href="${BASE}?id=${a.learner_id}">Person page</a> · <a class="text-link" href="${BASE}?tab=${renewal ? 'renewals' : 'new'}">Back to the queue</a></p>${note}
  <p class="sv-banner ${b.cls}"><b>Basis:</b> ${esc(b.text)}. ${esc(regText(a))}.${a.justification ? ` Written explanation: ${String(a.justification).length} characters.` : ''}</p>${banner.join('')}
  <h3 style="margin:28px 0 10px">Answers</h3>
  ${dl([
    ['Name', esc(a.full_name || name(a))], ['Email', `${esc(a.email)} (${esc(String((st.learner || {}).email_status || '').replace(/_/g, ' '))})`], ['Role or grade', esc(a.role || '')], ['Organisation', esc(a.organisation || '')],
    ['Registration', reg ? `${esc((REG[reg.regulator] || {}).name || reg.regulator)} ${esc(reg.registration_number)} ${pill(reg.status)}${reg.failure_state === RESTRICTION_STATE ? ' <small>held for a decision</small>' : ''}${gmcRegisterUrl(reg.regulator, reg.registration_number) ? ` <a class="btn btn-ghost small" href="${esc(gmcRegisterUrl(reg.regulator, reg.registration_number))}" target="_blank" rel="noopener noreferrer">Open GMC register</a> <small>Record the result on the <a class="text-link" href="${BASE}?id=${a.learner_id}">person page</a>.</small>` : ''}` : a.no_registration ? `Not on a statutory register${a.other_regulator ? `: ${esc(a.other_regulator)}` : ''}<div class="sv-text">${esc(a.no_registration_reason || '')}</div>` : 'None given'],
    ['Credentials', creds.length ? creds.map((c) => { const t = TYPE[c.credential_type] || { label: c.credential_type, modules: [] }; const mods = parseList(c.modules).map((m) => (t.modules.find((x) => x.id === m) || { label: m }).label); return `${esc(t.label)}${mods.length ? `: ${esc(mods.join(', '))}` : ''} ${pill(c.status)}`; }).join('<br>') : 'None claimed'],
    ['Years of ultrasound', esc(ex.years || '')], ['Scans (approx.)', esc(ex.scans || '')], ['Teaches ultrasound', ex.teaching == null ? '' : ex.teaching ? 'Yes' : 'No'], ['Supervises now', ex.supervision == null ? '' : ex.supervision ? 'Yes' : 'No'], ['Departmental role', esc(ex.deptRole || '')],
    ['Areas requested', esc(areaNames(areas).join(', '))], ['Pathways requested', esc(pathways.map((x) => PATHWAY_NAMES[x] || x).join(', '))],
    ['Evidence route', esc(a.evidence_mode || '')],
    ['Explanation', a.justification ? `<div class="sv-text">${esc(a.justification)}</div>` : ''],
    ...(renewal ? [['What changed', a.nothing_changed ? 'Nothing material has changed (declared)' : `<div class="sv-text">${esc(a.changes_note || '')}</div>`]] : []),
    ['Declaration', a.declared_at ? `${esc(a.declaration_version)} at ${esc(a.declared_at)}` : 'Not made yet'],
    ['More information asked', a.more_info_note ? `<div class="sv-text">${esc(a.more_info_note)}</div>` : ''],
    ['Decision', a.decided_at ? `${esc(a.decided_at)} by ${esc(a.decided_by || '')}${a.decision_note ? `<div class="sv-text">${esc(a.decision_note)}</div>` : ''}${a.reject_grounds ? `Grounds: ${esc(a.reject_grounds.replace(/_/g, ' '))}` : ''}` : ''],
  ])}
  <h3 style="margin:28px 0 10px">Evidence</h3>
  ${appFiles.length || creds.length ? `<ul>${evid.filter((x) => appFiles.includes(x.id)).map(evRow).join('')}${evid.filter((x) => !appFiles.includes(x.id) && creds.length).map(evRow).join('')}</ul>` : '<p class="admin-summary">No documents. The applicant relies on their written explanation.</p>'}
  <h3 style="margin:28px 0 10px">Invitation</h3>
  <p class="admin-summary">${link ? `Invited by ${esc(name(link))} on ${esc((link.created_at || '').slice(0, 10))}; link ${esc(link.status)}${link.claimed_at ? `, claimed ${esc(link.claimed_at.slice(0, 10))}` : ''}.` : 'Applied without an invitation.'} ${waitingLinks ? `${waitingLinks} learner${waitingLinks === 1 ? ' is' : 's are'} waiting for this decision; approval activates their links.` : ''}</p>
  ${actions}
  <h3 style="margin:28px 0 10px">History</h3>
  ${history.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Details</th></tr></thead><tbody>${history.map((h) => `<tr><td>${esc(h.at)}</td><td>${esc(h.actor_type)} ${esc(h.actor_id || '')}</td><td>${esc(h.action)}</td><td><small>${esc(h.meta)}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No history.</p>'}
  ${previous.length ? `<h3 style="margin:28px 0 10px">Other applications</h3><ul>${previous.map((x) => `<li><a class="text-link" href="${BASE}?app=${x.id}">#${x.id} ${esc(KIND[x.kind] || x.kind)}</a> ${pill(x.status)} ${esc((x.decided_at || x.submitted_at || '').slice(0, 10))}</li>`).join('')}</ul>` : ''}`;
}

async function detail(env, id, note, life = false, me = '') {
  const st = await currentStatus(env, id);
  const l = st.learner;
  if (!l) return `<p class="admin-summary">Not found. ${NAV}</p>`;
  const evid = (await env.DB.prepare('SELECT id, subject_type, subject_id, kind, description, url, file_name, file_type, file_size, file_sha256, purged_at, created_at FROM credential_evidence WHERE learner_id = ? ORDER BY id').bind(id).all()).results || [];
  const history = (await env.DB.prepare('SELECT * FROM verification_events WHERE learner_id = ? ORDER BY id DESC LIMIT 300').bind(id).all()).results || [];
  const allCreds = (await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? ORDER BY active DESC, id').bind(id).all()).results || [];
  const allApps = (await env.DB.prepare('SELECT * FROM supervisor_approvals WHERE learner_id = ? ORDER BY id DESC').bind(id).all()).results || [];
  const evList = (type, sid) => {
    const e = evid.filter((x) => x.subject_type === type && x.subject_id === sid);
    return e.length ? `<ul>${e.map((x) => `<li>#${x.id} ${esc(x.kind)}: ${esc(x.description || '')}${x.url ? ` <a class="text-link" href="${esc(x.url)}" rel="noopener noreferrer" target="_blank">link</a>` : ''}${x.file_name ? (x.purged_at ? ` · file ${esc(x.file_name)} (deleted after the decision; SHA-256 ${esc(String(x.file_sha256).slice(0, 16))}…)` : ` · <a class="text-link" href="${BASE}evidence/?id=${x.id}">${esc(x.file_name)}</a> (${Math.round(x.file_size / 1024)} KB)`) : ''}</li>`).join('')}</ul>` : '<p class="admin-summary">No evidence.</p>';
  };
  const H = { learner: id };
  const regCards = st.registrations.map((r) => {
    const reg = REG[r.regulator] || {};
    let fields = {}; try { fields = JSON.parse(r.register_fields || '{}'); } catch { /* none */ }
    return `<div class="sv-card"><h4>${esc(reg.name || r.regulator)} ${pill(r.status)}</h4>
    <p>Number <b>${esc(r.registration_number)}</b> · ${esc(r.profession || '')} · ${esc(r.organisation || '')} ${esc(r.role || '')}<br>
    Claimed name: ${esc(r.claimed_name)} · Register name: ${esc(r.register_name || 'not returned')} · Register status: ${esc(r.register_status || 'unknown')}<br>
    Source: ${esc(r.verification_source || 'none')} · Method: ${esc(r.verification_method || 'none')} · Name match: ${esc(r.match_result || 'n/a')} (${esc(r.match_method || '')} ${esc(r.match_version || '')})<br>
    Verified: ${esc(r.verified_at || 'no')} · Last checked: ${esc(r.last_checked_at || 'never')}${r.failure_state ? ` · <b>${esc(r.failure_state.replace(/_/g, ' '))}</b>` : ''}${Object.keys(fields).length && fields.source !== 'GMC register' ? `<br>Register fields: ${esc(JSON.stringify(fields))}` : ''}
    ${isGmc(r.regulator) ? '' : `<br><a class="text-link" href="${esc(reg.registerUrl || '#')}" target="_blank" rel="noopener noreferrer">Open the official ${esc(reg.short || '')} register</a> (search the number by hand: never script it)`}</p>
    ${isGmc(r.regulator) ? gmcSection(r, fields, history, H) : ''}
    ${evList('registration', r.id)}
    <div class="sv-actions">
    ${isGmc(r.regulator) ? '' : form('reg_verify', { ...H, sid: r.id }, `<label>Name exactly as the register shows it<input name="register_name" required maxlength="160" value="${esc(r.register_name || '')}"></label><label class="consent"><input type="checkbox" name="checked" value="1" required><span>I checked this number and name on the official register today, and the registration is current.</span></label><label>Notes<input name="notes" maxlength="500"></label>`, 'Verify registration')}
    ${form('reg_reject', { ...H, sid: r.id }, '<label>Reason (shown in the audit trail)<input name="notes" required maxlength="500"></label>', 'Reject')}
    ${form('reg_not_current', { ...H, sid: r.id }, '<label>What the register shows<input name="notes" required maxlength="500"></label>', 'Mark not current')}
    ${isGmc(r.regulator) ? '' : form('reg_recheck', { ...H, sid: r.id }, '', 'Run the automatic check again')}
    </div></div>`;
  }).join('') || '<p class="admin-summary">No registrations.</p>';
  const credCards = allCreds.map((c) => {
    const t = TYPE[c.credential_type] || { label: c.credential_type, modules: [] };
    const claimed = parseList(c.modules);
    const checks = t.modules.map((m) => `<label><input type="checkbox" name="modules" value="${esc(m.id)}"${claimed.includes(m.id) ? ' checked' : ''}>${esc(m.label)}</label>`).join('');
    const evOpts = evid.filter((x) => x.subject_type === 'credential' && x.subject_id === c.id).map((x) => `<option value="${x.id}">#${x.id} ${esc(x.kind)}</option>`).join('');
    return `<div class="sv-card"><h4>${esc(t.label)} (${esc((BODY[c.issuer] || {}).name || c.issuer)}) ${pill(c.active ? c.status : 'withdrawn')}</h4>
    <p>Modules claimed: ${esc(claimed.join(', '))} · Reference: ${esc(c.reference || 'none')} · Issued: ${esc(c.issued_on || '?')} · Expires: ${esc(c.expires_on || 'n/a')} · Review: ${esc(c.review_on || 'n/a')}<br>
    Automatic result: ${esc(c.match_result || 'n/a')} (${esc(c.match_method || '')} ${esc(c.match_version || '')}) · Source: ${esc(c.verification_source || 'none')} · Method: ${esc(c.verification_method || 'none')} · Verified by: ${esc(c.verified_by || 'n/a')} ${esc(c.verified_at || '')}${c.failure_state ? ` · <b>${esc(c.failure_state.replace(/_/g, ' '))}</b>` : ''}<br>
    Holder's note: ${esc(c.claim_note || 'none')}<br><small>${esc(t.access || '')}</small></p>
    ${evList('credential', c.id)}
    ${c.active && directoryOf(c.credential_type) ? directoryPanel(c, { H, evid, form, esc }) : ''}
    ${c.active ? `<div class="sv-actions">
    ${form('cred_approve', { ...H, sid: c.id }, `<div class="sv-checks">${checks}</div><label>How you checked<select name="method"><option value="manual_evidence">From the evidence provided</option><option value="manual_register">Against the body's own public list</option></select></label><label>Evidence relied on<select name="evidence"><option value="">None listed</option>${evOpts}</select></label><label>Issued on<input type="date" name="issued_on" value="${esc(c.issued_on || '')}"></label><label>Expires on<input type="date" name="expires_on" value="${esc(c.expires_on || '')}"></label><label>Review on<input type="date" name="review_on" value="${esc(c.review_on || '')}"></label><label>Notes<input name="notes" required maxlength="500"></label>`, 'Approve credential')}
    ${form('cred_more', { ...H, sid: c.id }, '<label>What evidence you need (emailed to the holder)<textarea name="notes" required maxlength="800"></textarea></label>', 'Request more evidence')}
    ${form('cred_reject', { ...H, sid: c.id }, '<label>Reason<input name="notes" required maxlength="500"></label>', 'Reject')}
    ${form('cred_revoke', { ...H, sid: c.id }, '<label>Reason<input name="notes" required maxlength="500"></label>', 'Revoke', 'Revoke this credential? Badges and directory listings that rely on it disappear at once.')}
    ${['revoked', 'rejected', 'expired'].includes(c.status) ? form('cred_reinstate', { ...H, sid: c.id }, '<label>Why it is valid again<input name="notes" required maxlength="500"></label><label>Expires on<input type="date" name="expires_on"></label>', 'Reinstate') : ''}
    </div>` : ''}</div>`;
  }).join('') || '<p class="admin-summary">No credentials claimed.</p>';
  const appRows = allApps.map((a) => `<tr><td>${esc(scopeLabel(a.pathway, a.module))}<br><small>${esc(capacityLabel(a.capacity || 'supervisor'))}</small></td><td>${pill(a.status)}${a.status === 'approved' && !st.hasReg ? '<br><small>Not current: no verified registration</small>' : ''}</td><td>${esc(a.approved_by || '')} ${esc((a.approved_at || '').slice(0, 10))}</td><td>${esc(a.review_on || '')}</td><td>${esc(a.notes || '')}${a.ended_reason ? `<br>Ended: ${esc(a.ended_reason)} (${esc(a.ended_by || '')})` : ''}</td><td>${a.status === 'approved' ? form('appr_revoke', { ...H, sid: a.id }, `<label>Reason (internal)<input name="notes" required maxlength="500"></label>${life ? `<label>Message to the supervisor (optional, emailed)<input name="message" maxlength="500"></label>${allApps.filter((x) => x.status === 'approved').length === 1 ? '<p class="form-note">This is their last scope: revoking it blocks one-off assessor signing through Wavelength unless you tick the box.</p><label class="consent"><input type="checkbox" name="one_off" value="1"><span>One-off assessment remains permitted</span></label><label>Why<input name="one_off_note" maxlength="500"></label>' : ''}` : ''}`, 'Revoke', 'Revoke this supervisor approval? It stops counting at once. Past sign-offs keep what was true when they were signed.') : form('appr_reinstate', { ...H, sid: a.id }, `<label>Why<input name="notes" required maxlength="500"></label><label>Approved until${life ? ' (12 months at most)' : ''}<input type="date" name="review_on"${life ? ` value="${esc(addMonths(ukDate(), 12))}" required` : ''}></label>${life ? '<p class="form-note">Reinstating also lifts an active block.</p>' : ''}`, 'Reinstate')}</td></tr>`).join('');
  const verifiedCreds = allCreds.filter((c) => c.active && isCurrentCred(c));
  // An open application is decided by an approval here (grantApprovals), and the form says so.
  const openApp = life ? await env.DB.prepare("SELECT id, kind, status, requested_pathways FROM supervisor_applications WHERE learner_id = ? AND status IN ('submitted', 'more_info') ORDER BY id DESC LIMIT 1").bind(id).first() : null;
  const addApproval = form('appr_add', H, `${openApp ? `<p class="sv-banner">Application <a class="text-link" href="${BASE}?app=${openApp.id}">#${openApp.id}</a> is open. Approving here also decides it, and the supervisor is emailed.</p>` : ''}<p class="form-note">Tick only the modules the evidence supports. "All modules" is recorded as its own scope.</p>
    ${scopeBoxes([], openApp ? jsonList(openApp.requested_pathways) : [...new Set(verifiedCreds.flatMap((c) => ((TYPE[c.credential_type] || {}).modules || []).map((m) => String(m.scope || '').split(':')[0]).filter(Boolean)))])}
    ${roleSelect()}
    <details class="sv-more"><summary>What each role may sign</summary><p class="form-note">The role decides what they may sign for each module (data/supervision-policy.json). FAMUS and FUSIC Heart mentors review scans and give feedback but never sign the final or triggered assessment; FUSIC modules other than Heart use trainers, one module at a time; FAMUS peripheral access is approved locally. A module that does not recognise the role is refused.</p></details>
    ${basisBoxes(verifiedCreds)}
    <label>${life ? 'Approved until (12 months at most)' : 'Review on'}<input type="date" name="review_on"${life ? ` value="${esc(addMonths(ukDate(), 12))}"` : ''}></label>
    ${me && looksLikeSelf(l, me) ? selfBox : ''}${optionalNote}`, 'Approve as Wavelength supervisor');
  const selfRows = life ? await selfApprovals(env, id) : [];
  const review = selfRows.length ? `<div class="sv-banner sv-warn"><b>Independent review recommended.</b> The current approval was recorded by ${esc(reviewerOf(selfRows[0].approved_by) || 'an administrator')} on ${esc((selfRows[0].approved_at || '').slice(0, 10))}, who appears to be this supervisor. Another administrator should check the identity, registration and credentials and record the result. Nothing is revoked automatically.
    ${form('appr_independent_review', H, '<fieldset><legend>Outcome</legend><label class="consent"><input type="radio" name="outcome" value="confirmed" required><span>Confirmed: identity, registration and the approved modules are supported by independent evidence</span></label><label class="consent"><input type="radio" name="outcome" value="concerns"><span>Concerns: I will revoke or change the approval</span></label></fieldset><label>Note (required for concerns)<textarea name="notes" maxlength="1000"></textarea></label>', 'Record independent review')}</div>` : '';
  const mailRow = life ? await approvalEmailRow(env, { learnerId: id }) : null;
  const badges = badgesFrom(env, st);
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">${esc(name(l))}</h2>
  <p class="admin-summary">${esc(l.email)} · Email: ${pill(l.email_status || 'legacy_unverified')} ${esc(l.email_verified_at || '')} · ${esc(l.organisation || '')} ${esc(l.role || '')} · <a class="text-link" href="${BASE}">Back to the queue</a></p>${note}
  <p class="admin-summary">Badges shown today: ${badges.length ? badges.map((b) => esc(b.label + (b.modules ? ` (${b.modules.join(', ')})` : '') + (b.scopes ? ` (${b.scopes.map((s) => s.label).join(', ')})` : ''))).join(' · ') : 'none'}</p>
  ${life ? await lifecyclePanel(env, id, st, H) : ''}
  <h3 style="margin:28px 0 10px">Professional registration</h3><div class="sv-grid">${regCards}</div>
  <h3 style="margin:28px 0 10px">External credentials</h3><div class="sv-grid">${credCards}</div>
  <h3 style="margin:28px 0 10px">Wavelength supervisor approvals</h3>
  ${appRows ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Scope</th><th scope="col">Status</th><th scope="col">Approved</th><th scope="col">Review</th><th scope="col">Notes</th><th scope="col">Action</th></tr></thead><tbody>${appRows}</tbody></table></div>` : '<p class="admin-summary">No approvals.</p>'}
  ${review}${mailRow || st.approvals.length ? emailStatusHtml(mailRow, H) : ''}
  ${st.hasReg ? addApproval : '<p class="admin-summary">Verify a professional registration before approving this person as a supervisor.</p>'}
  <h3 style="margin:28px 0 10px">History</h3>
  ${history.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Outcome</th><th scope="col">Who</th><th scope="col">Details</th></tr></thead><tbody>${history.map((h) => `<tr><td>${esc(h.at)}</td><td>${esc(h.subject_type)} #${esc(h.subject_id)}: ${esc(h.action)}</td><td>${esc(h.outcome || '')}</td><td>${esc(h.actor)}</td><td>${esc([h.source, h.method, h.match_result && `match ${h.match_result} (${h.match_method} ${h.match_version})`, h.scope && `scope ${h.scope}`, h.evidence_id && `evidence #${h.evidence_id}`, h.notes].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No history.</p>'}
  ${life ? await auditTable(env, id) : ''}`;
}

async function lifecyclePanel(env, id, st, H) {
  const s = await standingOf(env, id, st);
  const apps = (await env.DB.prepare('SELECT id, kind, status, submitted_at, decided_at FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(id).all()).results || [];
  const links = (await env.DB.prepare("SELECT status, COUNT(*) AS n, SUM(claimed_at IS NOT NULL) AS claimed FROM supervisor_links WHERE supervisor_id = ? GROUP BY status").bind(id).all()).results || [];
  const blocks = (await env.DB.prepare('SELECT * FROM supervisor_blocks WHERE learner_id = ? ORDER BY id DESC').bind(id).all()).results || [];
  const watch = await env.DB.prepare('SELECT * FROM supervisor_watch WHERE learner_id = ?').bind(id).first();
  const words = { none: 'Not a supervisor', applying: 'Application in progress', active: 'Active', renewal_review: 'Renewal under review (grace period)', paused: 'Paused', expired: 'Expired', withdrawn: 'Withdrew', revoked: 'Revoked' };
  const live = st.approvals.length;
  const active = blocks.find((b) => !b.lifted_at);
  return `<h3 style="margin:28px 0 10px">Supervisor standing</h3>
  <p class="sv-banner ${s.standing === 'active' ? 'sv-good' : ['paused', 'revoked'].includes(s.standing) ? 'sv-warn' : ''}"><b>${esc(words[s.standing] || s.standing)}</b>${s.lapse ? `: ${esc({ email: 'email not confirmed', registration: 'registration not current', credential: 'a required credential is not current', review: 'review date passed' }[s.lapse] || s.lapse)}` : ''}${watch && watch.lapse_since ? ` (since ${esc(watch.lapse_since)})` : ''}. Approved areas: ${esc(areaLabels(s.current).join(', ') || 'none')}. Links as supervisor: ${esc(links.map((k) => `${k.status} ${k.n}${k.status === 'pending' && k.claimed ? ` (${k.claimed} claimed)` : ''}`).join(', ') || 'none')}.</p>
  ${active ? `<div class="sv-card"><h4>Blocked ${pill('blocked')}</h4><p>${esc(active.kind === 'revoked' ? 'Supervisor status revoked' : 'Rejected on verification or safety grounds')} on ${esc((active.blocked_at || '').slice(0, 10))} by ${esc(active.blocked_by)}. ${active.one_off_permitted ? `One-off assessment remains permitted: ${esc(active.one_off_note || '')}` : 'One-off assessor signing through Wavelength is blocked.'}</p><div class="sv-text">${esc(active.reason)}</div>
    ${form('block_lift', { ...H, sid: active.id }, '<label>Why the block can be lifted<textarea name="notes" required maxlength="800"></textarea></label>', 'Lift the block', 'Lift this block? It does not restore any approval.')}</div>` : ''}
  <div class="sv-actions">
  ${live ? form('appr_revoke_all', H, '<label>Reason (internal)<textarea name="notes" required maxlength="800"></textarea></label><label>Message to the supervisor (optional, emailed)<input name="message" maxlength="500"></label><label class="consent"><input type="checkbox" name="one_off" value="1"><span>One-off assessment remains permitted</span></label><label>Why<input name="one_off_note" maxlength="500"></label>', 'Revoke all supervisor status', 'Revoke all of this person’s supervisor approvals? Their learners are told, open requests go back to the learners, and one-off assessor signing is blocked unless you ticked the box.') : ''}
  ${form('test_account', { ...H, value: st.learner && st.learner.test_account ? '0' : '1' }, `<p class="form-note">${st.learner && st.learner.test_account ? 'This is marked as a test or review account.' : 'Test and review accounts are left out of supervisor search and statistics.'}</p>`, st.learner && st.learner.test_account ? 'Unmark test account' : 'Mark as test account')}
  </div>
  ${apps.length ? `<p class="admin-summary">Applications: ${apps.map((x) => `<a class="text-link" href="${BASE}?app=${x.id}">#${x.id} ${esc(KIND[x.kind] || x.kind)}</a> ${pill(x.status)}`).join(' · ')}</p>` : ''}
  ${blocks.filter((b) => b.lifted_at).length ? `<p class="admin-summary">Lifted blocks: ${blocks.filter((b) => b.lifted_at).map((b) => `${esc(b.kind)} ${esc((b.blocked_at || '').slice(0, 10))} to ${esc(b.lifted_at.slice(0, 10))} (${esc(b.lifted_by || '')})`).join('; ')}</p>` : ''}`;
}
// GMC registrations only: the official entry link, the last recorded check, any hold for a decision, and the form
// that records a manual check. Opening the link changes nothing: only the form below records a result.
function gmcSection(r, fields, history, H) {
  const url = gmcRegisterUrl(r.regulator, r.registration_number);
  const link = url
    ? `<p><a class="btn btn-ghost small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open GMC register</a> <small>Opens the doctor's entry on gmc-uk.org in a new tab. Opening it changes nothing here: record what you saw below.</small></p>`
    : '<p class="sv-banner sv-warn">This GMC number is not 7 digits, so no register link is built. Reject the registration, or ask the applicant to correct the number.</p>';
  const rec = fields && fields.source === 'GMC register'
    ? `<p class="admin-summary">Last GMC check recorded: ${esc(fields.checkedOn || '')} by ${esc(fields.reviewer || 'unknown')}. Number matched: ${fields.numberMatched ? 'yes' : 'no'} · Registration current: ${fields.registrationCurrent ? 'yes' : 'no'} · Licence to practise current: ${fields.licenceCurrent ? 'yes' : 'no'} · Warning, condition, undertaking or restriction needing consideration: ${fields.restrictionShown ? 'shown' : 'none shown'}. Source: GMC register.</p>` : '';
  let held = '';
  if (r.failure_state === RESTRICTION_STATE) {
    const e = history.find((x) => x.subject_type === 'registration' && x.subject_id === r.id && x.action === 'admin_gmc_held');
    held = `<div class="sv-banner sv-warn"><b>Held for a decision.</b> The GMC register shows a warning, condition, undertaking or restriction that needs further consideration${e ? ` (recorded by ${esc(String(e.actor || '').split(':').slice(2).join(':') || e.actor)} on ${esc(String(e.at || e.created_at || '').slice(0, 10))})` : ''}. The registration is not verified until someone records a decision.${e && e.notes ? `<br>Note: ${esc(e.notes)}` : ''}</div>
    ${form('reg_gmc_decide', { ...H, sid: r.id }, `<fieldset><legend>Decision</legend><label class="consent"><input type="radio" name="decision" value="verify" required><span>Verify: I have considered what the register shows and it does not prevent this person supervising</span></label><label class="consent"><input type="radio" name="decision" value="not_current"><span>Mark not current</span></label><label class="consent"><input type="radio" name="decision" value="reject"><span>Reject</span></label></fieldset><label>Reason for the decision (internal, 20 characters or more)<textarea name="notes" required minlength="20" maxlength="1000"></textarea></label>`, 'Record decision', 'Record this decision about the GMC registration?')}`;
  }
  const today = ukDate();
  const check = r.failure_state === RESTRICTION_STATE ? '' : form('reg_gmc_check', { ...H, sid: r.id }, `<h5 style="margin:0">Record a GMC register check</h5>
    <label>Name shown on the GMC register<input name="register_name" required maxlength="160" value="${esc(r.register_name || '')}"></label>
    <label class="consent"><input type="checkbox" name="number_matched" value="1" required><span>The GMC number on the register matches ${esc(r.registration_number)}</span></label>
    <label class="consent"><input type="checkbox" name="registration_current" value="1" required><span>The registration is current</span></label>
    <label class="consent"><input type="checkbox" name="licence_current" value="1" required><span>The licence to practise is current</span></label>
    <fieldset><legend>Does the register show a warning, condition, undertaking or restriction that needs further consideration?</legend><label class="consent"><input type="radio" name="restriction" value="none" required><span>No, nothing is shown that needs consideration</span></label><label class="consent"><input type="radio" name="restriction" value="shown"><span>Yes: hold the registration for a decision</span></label></fieldset>
    <label>Date checked<input type="date" name="checked_on" required value="${esc(today)}" max="${esc(today)}" min="${esc(addDays(today, -MAX_CHECK_AGE_DAYS))}"></label>
    <label>Internal verification note (required if something is shown)<input name="notes" maxlength="500"></label>
    <p class="form-note">Source: GMC register. Only these answers are stored, never the register page.</p>`, 'Record GMC check');
  return `<div class="sv-gmc">${link}${rec}${held}${check}</div>`;
}

async function auditTable(env, id) {
  const apps = ((await env.DB.prepare('SELECT id FROM supervisor_applications WHERE learner_id = ?').bind(id).all()).results || []).map((r) => String(r.id));
  const rows = (await env.DB.prepare(`SELECT * FROM audit_events WHERE (subject_type = 'learner' AND subject_id = ?) OR (actor_type IN ('learner', 'supervisor') AND actor_id = ?)${apps.length ? ` OR (subject_type = 'application' AND subject_id IN (${apps.map(() => '?').join(',')}))` : ''} ORDER BY id DESC LIMIT 300`).bind(String(id), String(id), ...apps).all()).results || [];
  return `<h3 style="margin:28px 0 10px">Audit trail</h3>${rows.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Subject</th><th scope="col">Details</th></tr></thead><tbody>${rows.map((h) => `<tr><td>${esc(h.at)}</td><td>${esc(h.actor_type)} ${esc(h.actor_id || '')}</td><td>${esc(h.action)}</td><td>${esc(h.subject_type || '')} ${esc(h.subject_id || '')}</td><td><small>${esc(h.meta)}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No audit events.</p>'}`;
}

// GMC manual review (worker/verification/register-review.js). Only for a registration whose regulator is GMC. A
// check that shows something needing consideration holds the registration in manual review (never verified) until a
// deliberate decision is recorded. Every step goes to verification_events with the reviewer, source and outcome.
async function gmcPost(env, f, action, r, { reviewer, back, ev, decided }) {
  if (!isGmc(r.regulator)) return back('The GMC check applies only to GMC registrations.');
  const reg = REG[r.regulator] || {};
  const nextCheck = Date.now() + (reg.recheckDays || 30) * 864e5;
  const verify = (name, fields) => env.DB.prepare("UPDATE professional_registrations SET status = 'verified', register_name = ?, register_status = 'registered', register_fields = ?, verification_method = 'manual_register', verification_source = ?, verified_at = ?, last_checked_at = ?, next_check_at = ?, failure_state = NULL, failure_count = 0, match_method = 'admin', match_version = NULL, match_result = 'match', updated_at = datetime('now') WHERE id = ?")
    .bind(name, fields, GMC_SOURCE, nowIso(), nowIso(), nextCheck, r.id).run();
  const taken = 'Another account already holds this registration number as verified. Resolve that account first.';
  if (action === 'reg_gmc_check') {
    if (r.failure_state === RESTRICTION_STATE) return back('This registration is held for a decision. Record the decision first.');
    if (!gmcRegisterUrl(r.regulator, r.registration_number)) return back('This GMC number is not 7 digits. Reject the registration, or ask the applicant to correct it.');
    const out = gmcReview(f);
    if (out.error) return back(out.error);
    const fields = JSON.stringify({ ...out.fields, reviewer });
    if (out.outcome === 'verified') {
      try { await verify(out.registerName, fields); } catch { return back(taken); }
      await decided('professional_registrations', r.id);
      await ev({ subjectType: 'registration', subjectId: r.id, action: 'admin_verified', outcome: 'verified', source: GMC_SOURCE, method: 'manual_register', notes: [out.summary, out.note].filter(Boolean).join(' ') });
      return back('GMC registration verified.');
    }
    await env.DB.prepare("UPDATE professional_registrations SET status = 'manual_review', failure_state = ?, register_name = ?, register_status = 'registered', register_fields = ?, verification_source = ?, verification_method = NULL, verified_at = NULL, match_method = NULL, match_version = NULL, match_result = NULL, last_checked_at = ?, next_check_at = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(RESTRICTION_STATE, out.registerName, fields, GMC_SOURCE, nowIso(), r.id).run();
    await ev({ subjectType: 'registration', subjectId: r.id, action: 'admin_gmc_held', outcome: 'manual_review', source: GMC_SOURCE, method: 'manual_register', notes: `${out.summary} ${out.note}` });
    return back('Held for a decision: the GMC register shows something that needs consideration. The registration is not verified.');
  }
  // reg_gmc_decide
  if (r.failure_state !== RESTRICTION_STATE) return back('This registration is not held for a decision.');
  const d = restrictionDecision(f);
  if (d.error) return back(d.error);
  if (d.decision === 'verify') {
    let fields = {}; try { fields = JSON.parse(r.register_fields || '{}'); } catch { /* none */ }
    try { await verify(r.register_name, JSON.stringify({ ...fields, decidedBy: reviewer })); } catch { return back(taken); }
    await decided('professional_registrations', r.id);
    await ev({ subjectType: 'registration', subjectId: r.id, action: 'admin_verified_after_consideration', outcome: 'verified', source: GMC_SOURCE, method: 'manual_register', notes: d.reason });
    return back('GMC registration verified after consideration.');
  }
  const s = d.decision === 'reject' ? 'rejected' : 'not_current';
  await env.DB.prepare("UPDATE professional_registrations SET status = ?, failure_state = NULL, last_checked_at = ?, updated_at = datetime('now') WHERE id = ?").bind(s, nowIso(), r.id).run();
  await decided('professional_registrations', r.id);
  await ev({ subjectType: 'registration', subjectId: r.id, action: `admin_${s}`, outcome: s, source: GMC_SOURCE, method: 'manual_register', notes: d.reason });
  return back(s === 'rejected' ? 'Registration rejected.' : 'Registration marked not current.');
}

// Returns the message to show after the redirect.
export async function supervisorsAdminPost(env, f, admin, ctx) {
  if (!(await verificationReady(env))) return { id: 0, m: 'Apply migration 0011 first.' };
  const action = String(f.get('action') || '');
  const learnerId = Number(f.get('learner')), sid = Number(f.get('sid'));
  const reviewer = clip(f.get('reviewer'), 80);
  const notes = clip(f.get('notes'), 1000);
  const back = (m) => ({ id: learnerId, m });
  const NAME = 'Enter your name: every decision records who made it.';
  if (!reviewer) return action.startsWith('app_') || action === 'grace_block' ? { app: Number(f.get('app')), m: NAME } : action.startsWith('notif_') ? notifBack(f, NAME) : back(NAME);
  const actor = `admin:${clip(admin, 40)}:${reviewer}`;
  const ev = (e) => logEvent(env, { learnerId, actor, ...e });
  const life = await lifecycleReady(env);
  const adminAudit = (e) => auditStmt(env, { actorType: 'admin', actorId: `${clip(admin, 40)}:${reviewer}`, ...e });
  // Registration and credential decisions start the 30-day evidence purge clock (migration 0012).
  const decided = async (table, rowId) => { if (life) await env.DB.prepare(`UPDATE ${table} SET decided_at = ? WHERE id = ?`).bind(nowIso(), rowId).run(); };
  if (life && (action.startsWith('app_') || action === 'grace_block')) return applicationPost(env, f, action, { actor, adminAudit, notes, ctx });
  if (life && action.startsWith('notif_')) return notificationPost(env, f, action, { adminAudit, ctx });

  if (action.startsWith('reg_')) {
    const r = await env.DB.prepare('SELECT * FROM professional_registrations WHERE id = ? AND learner_id = ?').bind(sid, learnerId).first();
    if (!r) return back('Registration not found.');
    const reg = REG[r.regulator] || {};
    if (action === 'reg_verify') {
      if (isGmc(r.regulator)) return back('GMC registrations are verified with "Record GMC check".');
      if (!f.get('checked')) return back('Tick the box to confirm you checked the official register.');
      try {
        await env.DB.prepare("UPDATE professional_registrations SET status = 'verified', register_name = ?, register_status = 'registered', verification_method = 'manual_register', verification_source = ?, verified_at = ?, last_checked_at = ?, next_check_at = ?, failure_state = NULL, failure_count = 0, match_method = 'admin', match_version = NULL, match_result = 'match', updated_at = datetime('now') WHERE id = ?")
          .bind(clip(f.get('register_name'), 160), `${r.regulator}-public-register`, nowIso(), nowIso(), Date.now() + (reg.recheckDays || 30) * 864e5, r.id).run();
      } catch { return back('Another account already holds this registration number as verified. Resolve that account first.'); }
      await decided('professional_registrations', r.id);
      await ev({ subjectType: 'registration', subjectId: r.id, action: 'admin_verified', outcome: 'verified', source: `${r.regulator}-public-register`, method: 'manual_register', notes });
      return back('Registration verified.');
    }
    if (action === 'reg_reject' || action === 'reg_not_current') {
      if (!notes) return back('Give a reason.');
      const s = action === 'reg_reject' ? 'rejected' : 'not_current';
      await env.DB.prepare("UPDATE professional_registrations SET status = ?, last_checked_at = ?, failure_state = NULL, updated_at = datetime('now') WHERE id = ?").bind(s, nowIso(), r.id).run();
      await decided('professional_registrations', r.id);
      await ev({ subjectType: 'registration', subjectId: r.id, action: `admin_${s}`, outcome: s, notes });
      return back(s === 'rejected' ? 'Registration rejected.' : 'Registration marked not current.');
    }
    if (action === 'reg_gmc_check' || action === 'reg_gmc_decide') return gmcPost(env, f, action, r, { reviewer, back, ev, decided });
    if (action === 'reg_recheck') {
      if (isGmc(r.regulator)) return back('GMC registrations have no automatic check. Record a GMC register check instead.');
      const out = await checkRegistration(env, r, 'admin', actor); return back(`Automatic check: ${out.status.replace(/_/g, ' ')}.`); }
  }

  if (action.startsWith('cred_')) {
    const c = await env.DB.prepare('SELECT * FROM credentials WHERE id = ? AND learner_id = ?').bind(sid, learnerId).first();
    if (!c) return back('Credential not found.');
    const t = TYPE[c.credential_type] || { modules: [] };
    if (action === 'cred_directory_check' || action === 'cred_listing_send') return directoryPost(env, f, action, c, { reviewer, actor, back, ev, decided, ctx });
    // Approving a credential needs no note: the method, modules, dates, evidence and reviewer are recorded.
    if (!notes && action !== 'cred_approve') return back('Add notes or a reason.');
    if (action === 'cred_approve') {
      // A credential the body lists in an official directory is verified through the directory check, which also
      // needs identity confirmed separately. Approving from evidence (for example the body's own letter) needs that
      // evidence named.
      if (directoryOf(c.credential_type) && f.get('method') === 'manual_register') return back('This credential has an official directory: use "Record directory check", which also needs identity confirmed separately.');
      if (directoryOf(c.credential_type) && !Number(f.get('evidence'))) return back("Approving from evidence needs the evidence you relied on, such as the body's confirmation or certificate.");
      const modules = f.getAll('modules').map(String).filter((m) => t.modules.some((x) => x.id === m));
      if (!modules.length) return back('Tick at least one module.');
      const method = f.get('method') === 'manual_register' ? 'manual_register' : 'manual_evidence';
      const evidenceId = Number(f.get('evidence')) || null;
      const review = date(f.get('review_on'));
      await env.DB.prepare("UPDATE credentials SET status = 'verified', modules = ?, issued_on = COALESCE(?, issued_on), expires_on = ?, review_on = ?, verification_method = ?, verification_source = ?, verified_at = ?, verified_by = ?, failure_state = NULL, next_check_at = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(modules), date(f.get('issued_on')), date(f.get('expires_on')), review, method, method === 'manual_register' ? `${c.issuer}-public-list` : 'evidence', nowIso(), actor, review ? new Date(review + 'T00:00:00Z').getTime() : Date.now() + (t.recheckDays || 365) * 864e5, c.id).run();
      await decided('credentials', c.id);
      await ev({ subjectType: 'credential', subjectId: c.id, action: 'admin_approved', outcome: 'verified', method, source: method === 'manual_register' ? `${c.issuer}-public-list` : 'evidence', scope: modules.join(','), evidenceId, notes });
      return back('Credential approved.');
    }
    if (action === 'cred_more') {
      await env.DB.prepare("UPDATE credentials SET status = 'more_evidence', updated_at = datetime('now') WHERE id = ?").bind(c.id).run();
      await ev({ subjectType: 'credential', subjectId: c.id, action: 'admin_more_evidence', outcome: 'more_evidence', notes });
      const l = await env.DB.prepare('SELECT email, first_name, last_name, title FROM learners WHERE id = ?').bind(learnerId).first();
      if (l && env.ZEPTOMAIL_TOKEN) {
        const mail = sendMail(env, { to: l.email, toName: name(l), subject: 'Wavelength: more evidence needed', heading: 'More evidence needed', paragraphs: [`Hello ${l.first_name},`, `We are checking your ${t.label || 'credential'}. ${notes}`, 'Add it in the Wavelength app under Me, Professional verification.'], button: { href: 'https://thewavelength.co.uk/app/#/professional', label: 'Open the app' } }).catch(() => false);
        if (ctx && ctx.waitUntil) ctx.waitUntil(mail); else await mail;
      }
      return back('More evidence requested.');
    }
    if (action === 'cred_reject' || action === 'cred_revoke') {
      const s = action === 'cred_reject' ? 'rejected' : 'revoked';
      await env.DB.prepare("UPDATE credentials SET status = ?, verified_by = ?, failure_state = NULL, updated_at = datetime('now') WHERE id = ?").bind(s, actor, c.id).run();
      await decided('credentials', c.id);
      await ev({ subjectType: 'credential', subjectId: c.id, action: `admin_${s}`, outcome: s, notes });
      return back(s === 'rejected' ? 'Credential rejected.' : 'Credential revoked.');
    }
    if (action === 'cred_reinstate') {
      await env.DB.prepare("UPDATE credentials SET status = 'verified', active = 1, expires_on = COALESCE(?, expires_on), verified_at = ?, verified_by = ?, updated_at = datetime('now') WHERE id = ?").bind(date(f.get('expires_on')), nowIso(), actor, c.id).run();
      await ev({ subjectType: 'credential', subjectId: c.id, action: 'admin_reinstated', outcome: 'verified', notes });
      return back('Credential reinstated.');
    }
  }

  if (life && action === 'block_lift') {
    if (!notes) return back('Give a reason for lifting the block.');
    const r = await env.DB.prepare('UPDATE supervisor_blocks SET lifted_at = ?, lifted_by = ?, lift_note = ? WHERE id = ? AND learner_id = ? AND lifted_at IS NULL').bind(nowIso(), actor, notes, sid, learnerId).run();
    if (!(r.meta && r.meta.changes)) return back('That block is not active.');
    await adminAudit({ action: 'block.lift', subjectType: 'learner', subjectId: learnerId, meta: {} }).run();
    await ev({ subjectType: 'block', subjectId: sid, action: 'admin_block_lifted', outcome: 'lifted', notes });
    return back('Block lifted. No approval was restored.');
  }
  if (life && action === 'test_account') {
    const v = f.get('value') === '1' ? 1 : 0;
    await env.DB.batch([
      env.DB.prepare('UPDATE learners SET test_account = ?, supervisor_searchable = CASE WHEN ? = 1 THEN 0 ELSE supervisor_searchable END WHERE id = ?').bind(v, v, learnerId),
      adminAudit({ action: v ? 'account.mark_test' : 'account.unmark_test', subjectType: 'learner', subjectId: learnerId, meta: {} }),
    ]);
    return back(v ? 'Marked as a test account.' : 'No longer a test account.');
  }

  if (action === 'appr_add') {
    // The person page's approval: the same routine as an application decision. An application that is still open
    // (sent, or waiting for information) is decided by it, so the app never shows an approved supervisor as under
    // review. Without migration 0012 there are no applications or outbox: the earlier direct insert applies.
    const st = await currentStatus(env, learnerId);
    if (life) {
      if (!st.learner) return back('Account not found.');
      const open = await env.DB.prepare("SELECT * FROM supervisor_applications WHERE learner_id = ? AND status IN ('submitted', 'more_info') ORDER BY id DESC LIMIT 1").bind(learnerId).first();
      return back(await grantApprovals(env, { st, l: st.learner, application: open || null, input: approvalInput(f, st), actor, adminAudit, notes, ctx, route: 'direct' }));
    }
    if (!st.hasReg) return back('Verify a professional registration first.');
    const scopes = validScopes(f);
    if (!scopes.length) return back('Tick at least one module scope.');
    const reviewOn = date(f.get('review_on'));
    const basis = f.getAll('basis').map(Number).filter((x) => st.credentials.some((c) => c.id === x));
    let added = 0;
    for (const sc of scopes) {
      const [p, m] = sc.split(':');
      try {
        await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes) VALUES (?,?,?,'approved',?,?,?,?,?)").bind(learnerId, p, m, JSON.stringify(basis), reviewOn, actor, nowIso(), notes || 'Approved from the person page').run();
        added++;
        await ev({ subjectType: 'approval', action: 'admin_approved', outcome: 'approved', scope: sc, notes: `${notes || 'Approved from the person page'} | basis credentials: ${basis.join(',') || 'none'}` });
      } catch { /* already approved for this scope */ }
    }
    return back(`${added} scope${added === 1 ? '' : 's'} approved.`);
  }
  if (life && action === 'appr_independent_review') return back(await independentReview(env, f, learnerId, { actor, adminAudit, ev, notes }));
  if (action.startsWith('appr_')) {
    if (!notes) return back('Add notes or a reason.');
    const day = ukDate(), maxUntil = addMonths(day, 12);
    // After migration 0012 every approval has an "approved until" date, at most 12 months away (decision 1).
    const until = () => { const v = date(f.get('review_on')) || (life ? maxUntil : null); return life && (!v || v <= day || v > maxUntil) ? false : v; };
    if (life && action === 'appr_revoke_all') {
      const r = await revokeAll(env, learnerId, { actor, adminAudit, reason: notes, message: clip(f.get('message'), 500), oneOff: !!f.get('one_off'), oneOffNote: clip(f.get('one_off_note'), 500), kind: 'revoked', ctx });
      return back(r);
    }
    const a = await env.DB.prepare('SELECT * FROM supervisor_approvals WHERE id = ? AND learner_id = ?').bind(sid, learnerId).first();
    if (!a) return back('Approval not found.');
    if (action === 'appr_revoke') {
      if (life) {
        const others = (await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved' AND id != ?").bind(learnerId, a.id).first()).n;
        // The last scope: a full administrative revocation, with the block rule.
        if (!others && a.status === 'approved') return back(await revokeAll(env, learnerId, { actor, adminAudit, reason: notes, message: clip(f.get('message'), 500), oneOff: !!f.get('one_off'), oneOffNote: clip(f.get('one_off_note'), 500), kind: 'revoked', ctx }));
      }
      const res = await env.DB.prepare("UPDATE supervisor_approvals SET status = 'revoked', ended_by = ?, ended_at = ?, ended_reason = ? WHERE id = ? AND status = 'approved'").bind(actor, nowIso(), notes, a.id).run();
      await ev({ subjectType: 'approval', subjectId: a.id, action: 'admin_revoked', outcome: 'revoked', scope: `${a.pathway}:${a.module}`, notes });
      if (life && res.meta && res.meta.changes) {
        const l = await env.DB.prepare('SELECT email, title, first_name, last_name FROM learners WHERE id = ?').bind(learnerId).first();
        const key = `revoked:${learnerId}:${a.id}`;
        await env.DB.batch([
          adminAudit({ action: 'approval.revoke', subjectType: 'learner', subjectId: learnerId, meta: { scope: `${a.pathway}:${a.module}` } }),
          queueStmt(env, { key, learnerId, kind: 'revoked', to: l.email, toName: fullName(l), data: { firstName: l.first_name, all: false, areas: [scopeLabel(a.pathway, a.module)], reason: clip(f.get('message'), 500) || null } }),
        ]);
        deliverLater(env, ctx, [key]);
      }
      return back('Approval revoked.');
    }
    if (action === 'appr_reinstate') {
      const reviewOn = until();
      if (reviewOn === false) return back('The approved-until date must be after today and no more than 12 months away.');
      // A new row, so the revoked one and its reason stay in the record.
      try {
        const capCol = await hasCapacity(env);
        await env.DB.prepare(`INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes${life ? ', required_basis, registration_exempt, exempt_reason, application_id' : ''}${capCol ? ', capacity' : ''}) VALUES (?,?,?,'approved',?,?,?,?,?${life ? ',?,?,?,?' : ''}${capCol ? ',?' : ''})`)
          .bind(learnerId, a.pathway, a.module, a.basis, reviewOn, actor, nowIso(), `Reinstated from #${a.id}: ${notes}`, ...(life ? [a.required_basis || '[]', a.registration_exempt || 0, a.exempt_reason || null, a.application_id || null] : []), ...(capCol ? [a.capacity || 'supervisor'] : [])).run();
      } catch { return back('This scope is already approved.'); }
      await ev({ subjectType: 'approval', subjectId: a.id, action: 'admin_reinstated', outcome: 'approved', scope: `${a.pathway}:${a.module}`, notes });
      if (life) {
        // Reinstatement ends an administrative block (Fero, 6 October 2026: blocked "until reinstated").
        const act = await activateClaimedLinks(env, learnerId);
        await env.DB.batch([
          env.DB.prepare("UPDATE supervisor_blocks SET lifted_at = ?, lifted_by = ?, lift_note = ? WHERE learner_id = ? AND lifted_at IS NULL").bind(nowIso(), actor, `Reinstated: ${notes}`, learnerId),
          ...act.stmts,
          adminAudit({ action: 'approval.reinstate', subjectType: 'learner', subjectId: learnerId, meta: { scope: `${a.pathway}:${a.module}`, links: act.keys.length } }),
        ]);
        deliverLater(env, ctx, act.keys);
      }
      return back('Approval reinstated.');
    }
  }
  return back('Nothing changed.');
}

const validScopes = (f) => [...new Set(f.getAll('scope').map(String))].filter((s) => { const [p, m] = s.split(':'); const pw = PATHS.find((x) => x.id === p); return pw && (m === '*' || pw.modules.some((x) => x.id === m)); });

// Ends every current approval of one person: administrative revocation, or rejection on verification or safety
// grounds. Learners are told without a reason, open requests return to them, links end, and (Fero's rule) the account
// is blocked from one-off assessor signing unless the administrator records that it remains permitted.
async function revokeAll(env, learnerId, { actor, adminAudit, reason, message = '', oneOff = false, oneOffNote = '', kind = 'revoked', ctx, email = true }) {
  if (oneOff && !oneOffNote) return 'Say why one-off assessment remains permitted.';
  const at = nowIso();
  const l = await env.DB.prepare('SELECT id, email, title, first_name, last_name FROM learners WHERE id = ?').bind(learnerId).first();
  if (!l) return 'Account not found.';
  const live = (await env.DB.prepare("SELECT id, pathway, module FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(learnerId).all()).results || [];
  const event = `r${Date.now().toString(36)}`;
  const un = await supervisorUnavailable(env, learnerId, { event, reason: 'supervisor_revoked', end: true, endedReason: kind === 'revoked' ? 'supervisor_revoked' : 'supervisor_not_approved', actor });
  const keys = [...un.keys];
  const stmts = [
    env.DB.prepare("UPDATE supervisor_approvals SET status = 'revoked', ended_by = ?, ended_at = ?, ended_reason = ? WHERE learner_id = ? AND status = 'approved'").bind(actor, at, reason, learnerId),
    env.DB.prepare("UPDATE supervisor_applications SET status = 'withdrawn', decided_at = ?, decided_by = ?, decision_note = 'Closed: supervisor status revoked', updated_at = datetime('now') WHERE learner_id = ? AND status IN ('draft', 'submitted', 'more_info')").bind(at, actor, learnerId),
    env.DB.prepare('UPDATE learners SET supervisor_searchable = 0 WHERE id = ?').bind(learnerId),
    env.DB.prepare('UPDATE directory_profiles SET listed = 0 WHERE learner_id = ?').bind(learnerId),
    env.DB.prepare("UPDATE supervisor_blocks SET lifted_at = ?, lifted_by = ?, lift_note = 'Replaced by a later block' WHERE learner_id = ? AND lifted_at IS NULL").bind(at, actor, learnerId),
    env.DB.prepare('INSERT INTO supervisor_blocks (learner_id, kind, reason, one_off_permitted, one_off_note, blocked_by, blocked_at) VALUES (?,?,?,?,?,?,?)').bind(learnerId, kind, reason, oneOff ? 1 : 0, oneOff ? oneOffNote : null, actor, at),
    ...un.stmts,
    adminAudit({ action: kind === 'revoked' ? 'approval.revoke_all' : 'application.reject_safety', subjectType: 'learner', subjectId: learnerId, meta: { scopes: live.map((a) => `${a.pathway}:${a.module}`), links: un.links, returned: un.returned, oneOffPermitted: oneOff } }),
  ];
  if (email && live.length) {
    const key = `revoked:${learnerId}:${event}`;
    keys.push(key);
    stmts.push(queueStmt(env, { key, learnerId, kind: 'revoked', to: l.email, toName: fullName(l), data: { firstName: l.first_name, all: true, reason: message || null } }));
  }
  await env.DB.batch(stmts);
  for (const a of live) await logEvent(env, { learnerId, subjectType: 'approval', subjectId: a.id, action: 'admin_revoked', outcome: 'revoked', actor, scope: `${a.pathway}:${a.module}`, notes: reason });
  await logEvent(env, { learnerId, subjectType: 'block', action: 'admin_blocked', outcome: oneOff ? 'one_off_permitted' : 'blocked', actor, notes: reason });
  deliverLater(env, ctx, keys);
  return `${live.length ? 'All supervisor status revoked' : 'Blocked'}. ${un.links ? `${un.links} learner link${un.links === 1 ? '' : 's'} ended` : 'No learner links'}${un.returned ? `, ${un.returned} open request${un.returned === 1 ? '' : 's'} returned` : ''}. One-off assessor signing is ${oneOff ? 'still permitted' : 'blocked'}.`;
}

// ---------- Application decisions ----------
async function applicationPost(env, f, action, { actor, adminAudit, notes, ctx }) {
  const appId = Number(f.get('app'));
  const back = (m) => ({ app: appId, m });
  const a = await env.DB.prepare('SELECT * FROM supervisor_applications WHERE id = ?').bind(appId).first();
  if (!a) return { tab: 'new', m: 'Application not found.' };
  if (!['submitted', 'more_info'].includes(a.status)) return back('This application has already been decided or withdrawn.');
  const lid = a.learner_id;
  const l = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(lid).first();
  const at = nowIso(), day = ukDate();
  const renewal = a.kind === 'renewal';
  // A guarded update, so two administrators deciding at once cannot both win.
  const decide = (status, extra = {}) => {
    const cols = { status, decided_at: at, decided_by: actor, ...extra };
    const k = Object.keys(cols);
    return env.DB.prepare(`UPDATE supervisor_applications SET ${k.map((x) => `${x} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND status IN ('submitted', 'more_info')`).bind(...k.map((x) => cols[x]), a.id);
  };

  // Recovery for a receipt that was never queued (the resubmission receipt bug fixed in October 2026). It rebuilds the
  // exact key the submit code uses for the current submission and goes through the outbox like any other email, so a
  // receipt already sent, or already queued, is never sent twice. Application data is only read.
  if (action === 'app_receipt') {
    if (a.status !== 'submitted') return back('A receipt can be sent only while the application is submitted.');
    const r = receiptKey(a);
    const row = await env.DB.prepare('SELECT status FROM notification_log WHERE key = ?').bind(r.key).first();
    const record = (outcome) => adminAudit({ action: 'application.receipt', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind, template: r.kind, outcome } });
    if (row && row.status === 'sent') { await record('already_sent').run(); return back('Receipt already sent'); }
    if (row && row.status !== 'pending') { await record(`exists_${row.status}`).run(); return back(`This receipt is already in the email outbox with status "${row.status}". Nothing was sent. Check it on the System tab.`); }
    if (!row) {
      if (!l) return back('The applicant account no longer exists.');
      await env.DB.batch([(await receiptFor(env, l, a)).stmt, record('queued')]);
    } else await record('pending_delivered').run();
    await deliver(env, [r.key]);
    const now = await env.DB.prepare('SELECT status FROM notification_log WHERE key = ?').bind(r.key).first();
    const label = r.resubmit ? 'updated submission receipt' : 'submission receipt';
    return back(now && now.status === 'sent' ? `The ${label} was sent.` : `The ${label} is in the email outbox (status "${now ? now.status : 'missing'}"). Check it on the System tab.`);
  }

  if (action === 'app_more') {
    if (a.status !== 'submitted') return back('This application is already waiting for information.');
    if (!notes) return back('Say what information you need.');
    const key = `app_more:${a.id}:${at}`;
    const res = await env.DB.batch([
      env.DB.prepare("UPDATE supervisor_applications SET status = 'more_info', more_info_at = ?, more_info_note = ?, updated_at = datetime('now') WHERE id = ? AND status = 'submitted'").bind(at, notes, a.id),
      queueStmt(env, { key, learnerId: lid, kind: 'app_more', to: l.email, toName: fullName(l), data: { firstName: l.first_name, note: notes } }),
      adminAudit({ action: 'application.more_info', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind } }),
    ]);
    if (!(res[0].meta && res[0].meta.changes)) return back('Nothing changed.');
    await logEvent(env, { learnerId: lid, subjectType: 'application', subjectId: a.id, action: 'admin_more_info', outcome: 'more_info', actor, notes });
    deliverLater(env, ctx, [key]);
    return back('More information requested. The applicant has been emailed.');
  }

  if (action === 'grace_block') {
    if (!renewal) return back('Only a renewal has a grace period.');
    if (!notes) return back('Say what changed.');
    await env.DB.batch([
      env.DB.prepare("UPDATE supervisor_applications SET grace_blocked = 1, grace_note = ?, updated_at = datetime('now') WHERE id = ?").bind(notes, a.id),
      adminAudit({ action: 'application.grace_end', subjectType: 'application', subjectId: a.id, meta: {} }),
    ]);
    await logEvent(env, { learnerId: lid, subjectType: 'application', subjectId: a.id, action: 'admin_grace_ended', outcome: 'grace_blocked', actor, notes });
    return back('Grace period ended. If the review date has passed, supervisor status is paused until the renewal is decided.');
  }

  if (action === 'app_reject') {
    const grounds = ['insufficient_evidence', 'verification_or_safety'].includes(f.get('grounds')) ? f.get('grounds') : null;
    if (!grounds) return back('Choose the grounds.');
    if (!notes) return back('Add an internal note.');
    const message = clip(f.get('message'), 1000);
    const mayReapply = f.get('may_reapply') ? 1 : 0;
    const oneOff = !!f.get('one_off'), oneOffNote = clip(f.get('one_off_note'), 500);
    if (grounds === 'verification_or_safety' && oneOff && !oneOffNote) return back('Say why one-off assessment remains permitted.');
    const res = await decide('rejected', { reject_grounds: grounds, decision_note: notes, applicant_message: message || null, may_reapply: mayReapply }).run();
    if (!(res.meta && res.meta.changes)) return back('This application has already been decided.');
    // Learners whose invitation this person claimed are told the request has ended.
    const claimed = (await env.DB.prepare("SELECT s.id, s.learner_id, t.email, t.title, t.first_name, t.last_name FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.status = 'pending' AND s.claimed_at IS NOT NULL").bind(lid).all()).results || [];
    const keys = [`app_rejected:${a.id}`];
    const stmts = [
      queueStmt(env, { key: keys[0], learnerId: lid, kind: 'app_rejected', to: l.email, toName: fullName(l), data: { firstName: l.first_name, reason: message || null, mayReapply: !!mayReapply } }),
      adminAudit({ action: 'application.reject', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind, grounds, mayReapply: !!mayReapply, links: claimed.length } }),
    ];
    for (const k of claimed) {
      stmts.push(env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now'), ended_reason = 'supervisor_not_approved', ended_by = ? WHERE id = ? AND status = 'pending'").bind(actor, k.id));
      const key = `link_ended:${k.id}`;
      keys.push(key);
      stmts.push(queueStmt(env, { key, learnerId: k.learner_id, kind: 'link_ended', to: k.email, toName: fullName(k), data: { firstName: k.first_name, supervisor: fullName(l) } }));
    }
    await env.DB.batch(stmts);
    await logEvent(env, { learnerId: lid, subjectType: 'application', subjectId: a.id, action: 'admin_rejected', outcome: 'rejected', actor, notes: `${grounds}: ${notes}` });
    deliverLater(env, ctx, keys);
    // Verification or safety grounds: the block rule, and any current approval ends (no second email: the rejection
    // email has gone).
    if (grounds === 'verification_or_safety') {
      const m = await revokeAll(env, lid, { actor, adminAudit, reason: `Application #${a.id} rejected on verification or safety grounds: ${notes}`, oneOff, oneOffNote, kind: 'rejected_safety', ctx, email: false });
      return back(`Application rejected. ${m}`);
    }
    return back(`Application rejected. The applicant has been emailed${claimed.length ? `, and ${claimed.length} waiting learner${claimed.length === 1 ? ' has' : 's have'} been told` : ''}.`);
  }

  if (action === 'app_approve' || action === 'app_confirm_renewal') {
    const st = await currentStatus(env, lid);
    const live = st.approvals;
    let input;
    if (action === 'app_confirm_renewal') {
      if (!renewal) return back('Only a renewal can be confirmed in one step.');
      if (!live.length) return back('There is no live approval to renew (it may have expired). Use Approve and tick the scopes.');
      const lapsed = live.find((x) => x.lapse);
      if (lapsed) return back(`Something the approval relies on is not current (${lapsed.lapse}). Check the person page, or use Approve to change the basis.`);
      input = { scopes: live.map((x) => `${x.pathway}:${x.module}`), confirmRenewal: true };
    } else input = approvalInput(f, st);
    return back(await grantApprovals(env, { f, st, l, application: a, input, actor, adminAudit, notes, ctx, route: 'application' }));
  }
  if (action === 'app_close_approved') {
    // Repair for an application left open after the person was approved from the person page (fixed October 2026):
    // records the decision the console already made, with the scopes that are current now. No approval changes. The
    // approval email goes only if the administrator ticks the box.
    const st = await currentStatus(env, lid);
    const current = st.approvals.filter((x) => x.current);
    if (!current.length) return back('This person has no current approval, so there is nothing to record. Decide the application instead.');
    const scopes = current.map((x) => `${x.pathway}:${x.module}`);
    const res = await decide('approved', { decision_note: notes || 'Closed: already approved from the person page', approved_scopes: JSON.stringify(scopes) }).run();
    if (!(res.meta && res.meta.changes)) return back('This application has already been decided.');
    const key = `app_approved:${a.id}`;
    const stmts = [adminAudit({ action: 'application.close_approved', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind, scopes, previous: a.status, status: 'approved', notified: !!f.get('send_email') } })];
    if (f.get('send_email')) stmts.push(queueStmt(env, { key, learnerId: lid, kind: 'app_approved', to: l.email, toName: fullName(l), data: { firstName: l.first_name, renewal, groups: approvedGroups(current).map(groupLine), reviewOn: current.map((x) => x.review_on).filter(Boolean).sort()[0] || null, learners: [] } }));
    await env.DB.batch(stmts);
    await logEvent(env, { learnerId: lid, subjectType: 'application', subjectId: a.id, action: 'admin_closed_approved', outcome: 'approved', actor, scope: scopes.join(','), notes: notes || 'Already approved from the person page' });
    if (f.get('send_email')) { await deliver(env, [key]); const row = await approvalEmailRow(env, { key }); return back(`Application recorded as approved. Approval email: ${(EMAIL_WORDS[row ? row.status : 'none'] || [''])[0].toLowerCase()}.`); }
    return back('Application recorded as approved. No email was sent.');
  }
  return back('Nothing changed.');
}

// ---------- One approval routine for every route ----------
// The application decision (Approve, Confirm renewal) and the person page's direct approval both come here, so an
// approval always: writes the approval rows; decides the open application in the same step (a person approved from
// the person page while an application was open no longer keeps an application "under review"); activates links
// waiting for the decision; queues the approval email in the same D1 batch, so it exists only if the approval was
// saved and a repeated click cannot queue a second one; and records who decided, when, what was approved, on which
// credentials and evidence, and the standing before and after. A note is optional and never carries the audit.
function approvalInput(f, st) {
  return {
    scopes: validScopes(f),
    reviewOn: date(f.get('review_on')),
    basis: f.getAll('basis').map(Number).filter((x) => st.credentials.some((c) => c.id === x && isCurrentCred(c))),
    capacity: CAPACITIES.includes(f.get('capacity')) ? String(f.get('capacity')) : 'supervisor',
    exempt: !!f.get('exempt'), exemptReason: clip(f.get('exempt_reason'), 1000),
    selfAck: !!f.get('self_ack'), selfReason: clip(f.get('self_reason'), 1000),
  };
}
// Evidence the decision rested on: files and links on the application, and on the credentials ticked as its basis.
async function evidenceRefs(env, learnerId, a, basis) {
  const rows = (await env.DB.prepare('SELECT id, subject_type, subject_id FROM credential_evidence WHERE learner_id = ? ORDER BY id').bind(learnerId).all()).results || [];
  return rows.filter((e) => (a && e.subject_type === 'application' && e.subject_id === a.id) || (e.subject_type === 'credential' && basis.includes(e.subject_id))).map((e) => e.id).slice(0, 40);
}
async function grantApprovals(env, { st, l, application: a = null, input, actor, adminAudit, notes = '', ctx, route }) {
  const lid = l.id, at = nowIso(), day = ukDate();
  const renewal = !!(a && a.kind === 'renewal');
  if (st.block) return route === 'direct' ? 'This account is blocked. Lift the block first.' : 'This account is blocked. Lift the block on the person page first.';
  if (!st.learner || st.learner.email_status !== 'verified') return 'The applicant has not confirmed their email address. An approval would not count until they do.';
  if (route === 'direct' && !st.hasReg) return 'Verify a professional registration first.';
  const live = st.approvals;
  const base = renewal && live.length ? (live.map((x) => x.review_on).filter(Boolean).sort()[0] || day) : day;
  const maxUntil = addMonths(base > day ? base : day, 12);
  const capCol = await hasCapacity(env);
  const { scopes, confirmRenewal = false } = input;
  const basis = confirmRenewal ? [] : input.basis || [];
  const capacity = input.capacity || 'supervisor';
  let reviewOn = maxUntil, exempt = 0, exemptReason = null;
  if (!confirmRenewal) {
    if (!scopes.length) return 'Tick at least one module scope.';
    reviewOn = input.reviewOn || maxUntil;
    if (reviewOn <= day || reviewOn > maxUntil) return `The approved-until date must be after today and no later than ${maxUntil}.`;
    if (capacity !== 'supervisor' && !capCol) return 'Approving in a capacity other than supervisor needs migration 0015.';
    const unfit = scopes.filter((sc) => { const [p, m] = sc.split(':'); return m === '*' ? !(PATHS.find((x) => x.id === p) || { modules: [] }).modules.every((mm) => capacitiesFor(p, mm.id).includes(capacity)) : !capacitiesFor(p, m).includes(capacity); });
    if (unfit.length) return `${capacityLabel(capacity)} is not a role for ${unfit.map((sc) => scopeLabel(...sc.split(':'))).join(', ')}. Choose another role or untick those modules.`;
    if (!st.hasReg) {
      if (!input.exempt) return 'The registration is not verified. Verify it on the person page, or tick the registration exemption and give your reason.';
      if (input.exemptReason.length < 20) return 'Give the reason for the registration exemption, and how you checked identity and experience instead.';
      exempt = 1; exemptReason = input.exemptReason;
    }
  }
  // Someone approving their own application: allowed (a small team may have no one else), but never silently. The
  // acknowledgement and reason are recorded, and the approval waits for an independent review (Needs attention).
  const self = looksLikeSelf(l, reviewerOf(actor));
  if (self && (!input.selfAck || (input.selfReason || '').length < 20)) return 'This looks like your own application. Wavelength recommends that another administrator decides it. To approve it yourself, tick the self-approval box and say what independent evidence supports it (20 characters or more).';
  const stmts = [], renewed = [], added = [], ended = [], capOf = {};
  for (const sc of scopes) {
    const [p, m] = sc.split(':');
    const row = live.find((x) => x.pathway === p && x.module === m);
    if (row && confirmRenewal) {
      stmts.push(env.DB.prepare('UPDATE supervisor_approvals SET review_on = ?, last_renewed_at = ?, application_id = ? WHERE id = ? AND status = ?').bind(reviewOn, at, a.id, row.id, 'approved'));
      renewed.push(sc); capOf[sc] = row.capacity || 'supervisor';
    } else if (row && a) {
      stmts.push(env.DB.prepare('UPDATE supervisor_approvals SET review_on = ?, last_renewed_at = ?, application_id = ?, basis = ?, required_basis = ?, registration_exempt = ?, exempt_reason = ?, notes = ? WHERE id = ? AND status = ?').bind(reviewOn, at, a.id, JSON.stringify(basis), JSON.stringify(basis), exempt, exemptReason, notes || null, row.id, 'approved'));
      renewed.push(sc); capOf[sc] = row.capacity || 'supervisor';
    } else if (!row) {
      stmts.push(env.DB.prepare(`INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes, application_id, registration_exempt, exempt_reason, required_basis${capCol ? ', capacity' : ''}) VALUES (?,?,?,'approved',?,?,?,?,?,?,?,?,?${capCol ? ',?' : ''})`)
        .bind(lid, p, m, JSON.stringify(basis), reviewOn, actor, at, notes || (a ? `Approved with application #${a.id}` : 'Approved from the person page'), a ? a.id : null, exempt, exemptReason, JSON.stringify(basis), ...(capCol ? [capacity] : [])));
      added.push(sc); capOf[sc] = capacity;
    }
  }
  // An application approved with fewer scopes than are live ends the ones left out (a renewal that drops a module).
  // A direct approval only ever adds.
  if (a) for (const x of live) {
    const sc = `${x.pathway}:${x.module}`;
    if (!scopes.includes(sc)) { stmts.push(env.DB.prepare("UPDATE supervisor_approvals SET status = 'expired', ended_by = ?, ended_at = ?, ended_reason = 'not included in the renewal' WHERE id = ? AND status = 'approved'").bind(actor, at, x.id)); ended.push(sc); }
  }
  if (!a && !added.length) return 'Already approved for these modules: nothing changed, and no email was sent.';
  const before = (await standingOf(env, lid, st)).standing;
  // A guarded update, so two administrators deciding at once cannot both win.
  if (a) {
    const first = await env.DB.prepare("UPDATE supervisor_applications SET status = 'approved', decided_at = ?, decided_by = ?, decision_note = ?, approved_scopes = ?, updated_at = datetime('now') WHERE id = ? AND status IN ('submitted', 'more_info')")
      .bind(at, actor, notes || (confirmRenewal ? 'Renewal confirmed' : route === 'direct' ? 'Approved from the person page' : null), JSON.stringify(scopes), a.id).run();
    if (!(first.meta && first.meta.changes)) return 'This application has already been decided.';
  }
  const act = await activateClaimedLinks(env, lid);
  const key = a ? `app_approved:${a.id}` : `app_approved:direct:${lid}:${at}`;
  const decidedRows = [...added, ...renewed].map((sc) => { const [pathway, module] = sc.split(':'); return { pathway, module, capacity: capOf[sc], approved_at: at, review_on: reviewOn }; });
  const groups = approvedGroups(decidedRows);
  const evidence = await evidenceRefs(env, lid, a, basis);
  stmts.push(...act.stmts,
    queueStmt(env, { key, learnerId: lid, kind: 'app_approved', to: l.email, toName: fullName(l), data: { firstName: l.first_name, renewal, groups: groups.map(groupLine), reviewOn, learners: act.learners } }),
    adminAudit({ action: confirmRenewal ? 'application.confirm_renewal' : a ? 'application.approve' : 'approval.grant', subjectType: a ? 'application' : 'learner', subjectId: a ? a.id : lid, meta: { kind: a ? a.kind : 'direct', route, scopes, capacity: confirmRenewal ? null : capacity, basis: basis.length, credentials: basis, evidence, exempt: !!exempt, links: act.keys.length, to: reviewOn, previous: before, status: 'active', selfApproval: self, hasNote: !!notes, notified: true } }));
  try { await env.DB.batch(stmts); }
  catch (e) {
    // Undo the decision so the reviewer can try again: nothing else was written, and no email was queued.
    if (a) await env.DB.prepare('UPDATE supervisor_applications SET status = ?, decided_at = NULL, decided_by = NULL, approved_scopes = NULL WHERE id = ?').bind(a.status, a.id).run();
    return 'Could not save the approval. Nothing was changed and no email was sent. Please try again.';
  }
  const tag = `${a ? `Application #${a.id}` : 'Person page'}${exempt ? ' (registration exemption)' : ''}${self ? ` (self-approval: ${input.selfReason})` : ''}`;
  for (const sc of [...added, ...renewed]) await logEvent(env, { learnerId: lid, subjectType: 'approval', action: added.includes(sc) ? 'admin_approved' : 'admin_renewed', outcome: 'approved', actor, scope: sc, evidenceId: evidence[0] || null, notes: `${tag} | role: ${capOf[sc]} | basis credentials: ${basis.join(',') || 'none'}${notes ? ` | ${notes}` : ''}` });
  for (const sc of ended) await logEvent(env, { learnerId: lid, subjectType: 'approval', action: 'not_renewed', outcome: 'expired', actor, scope: sc, notes: `Left out of renewal #${a.id}` });
  // The approval email goes now, so the reviewer sees what happened to it; the learners' emails go in the background.
  await deliver(env, [key]).catch(() => null);
  deliverLater(env, ctx, act.keys);
  const row = await approvalEmailRow(env, { key });
  const mail = ` Approval email: ${(EMAIL_WORDS[row ? row.status : 'none'] || ['unknown'])[0].toLowerCase()}.${self ? ' Recorded as a self-approval: an independent review is listed under Needs attention.' : ''}`;
  if (!a) return `${added.length} scope${added.length === 1 ? '' : 's'} approved${act.keys.length ? `, ${act.keys.length} waiting learner link${act.keys.length === 1 ? '' : 's'} activated` : ''}.${mail}`;
  return `${renewal ? 'Renewal approved' : 'Approved'} until ${reviewOn}: ${groups.map(groupLine).join('; ')}${ended.length ? `; ${ended.length} ended` : ''}${act.keys.length ? `; ${act.keys.length} waiting learner link${act.keys.length === 1 ? '' : 's'} activated` : ''}.${mail}`;
}

// ---------- Emails that need a person ----------
// Back to where the button was: an application, a person page, or the System tab.
const notifBack = (f, m) => (Number(f.get('app')) ? { app: Number(f.get('app')), m } : Number(f.get('learner')) ? { id: Number(f.get('learner')), m } : { tab: 'system', m });
async function notificationPost(env, f, action, { adminAudit, ctx }) {
  const key = clip(f.get('key'), 200);
  const row = await env.DB.prepare('SELECT key, kind, status FROM notification_log WHERE key = ?').bind(key).first();
  if (!row) return notifBack(f, 'Email not found.');
  if (action === 'notif_resend') {
    // Only an email that failed or whose result is unknown, and only while its payload is kept. A sent email is never
    // resent from here, so a click cannot send a confirmed email twice.
    const r = await env.DB.prepare("UPDATE notification_log SET status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = 'resent by an administrator' WHERE key = ? AND status IN ('failed', 'unknown') AND payload IS NOT NULL").bind(key).run();
    if (!(r.meta && r.meta.changes)) return notifBack(f, 'That email cannot be resent.');
    await adminAudit({ action: 'email.resend', subjectType: 'notification', subjectId: row.kind, meta: { kind: row.kind, from: row.status } }).run();
    const out = await deliver(env, [key]);
    const now = await env.DB.prepare('SELECT status FROM notification_log WHERE key = ?').bind(key).first();
    return notifBack(f, out.sent ? 'Sent: accepted by the email provider.' : `Not sent: status "${now ? now.status : 'unknown'}". It is shown below.`);
  }
  if (action === 'notif_mark_sent') {
    await env.DB.batch([
      env.DB.prepare("UPDATE notification_log SET status = 'sent', sent_at = ?, payload = NULL, last_error = 'marked sent by an administrator' WHERE key = ? AND status IN ('failed', 'unknown')").bind(nowIso(), key),
      adminAudit({ action: 'email.mark_sent', subjectType: 'notification', subjectId: row.kind, meta: { kind: row.kind, from: row.status } }),
    ]);
    return notifBack(f, 'Marked as sent.');
  }
  return notifBack(f, 'Nothing changed.');
}

// An approval its holder may have decided themselves (looksLikeSelf) waits for a review by someone else. The review
// is recorded, never inferred; concerns leave the approval in place for a deliberate revocation.
async function independentReview(env, f, learnerId, { actor, adminAudit, ev, notes }) {
  const st = await currentStatus(env, learnerId);
  const l = st.learner;
  if (!l) return 'Account not found.';
  const current = st.approvals.filter((x) => x.current);
  if (!current.length) return 'There is no current approval to review.';
  const me = reviewerOf(actor).trim().toLowerCase();
  if (looksLikeSelf(l, me)) return 'An independent review must be recorded by someone other than the supervisor.';
  if (current.some((x) => reviewerOf(x.approved_by).trim().toLowerCase() === me)) return 'An independent review must be recorded by someone other than the administrator who approved it.';
  const outcome = ['confirmed', 'concerns'].includes(f.get('outcome')) ? String(f.get('outcome')) : null;
  if (!outcome) return 'Choose the outcome of your review.';
  if (outcome === 'concerns' && notes.length < 20) return 'Describe the concern (20 characters or more).';
  const scopes = current.map((x) => `${x.pathway}:${x.module}`);
  await adminAudit({ action: 'approval.independent_review', subjectType: 'learner', subjectId: learnerId, meta: { outcome, scopes, hasNote: !!notes } }).run();
  await ev({ subjectType: 'approval', action: 'independent_review', outcome, scope: scopes.join(','), notes: notes || 'Identity, registration and credentials confirmed independently' });
  return outcome === 'confirmed' ? 'Independent review recorded.' : 'Concerns recorded. Revoke the approval below if it should not stand.';
}
// Current approvals that look self-approved and have no confirmed independent review since. For Needs attention and
// the person page. Works on records made before this check existed too: approved_by holds the reviewer's name.
async function selfApprovals(env, learnerId = null) {
  const rows = (await env.DB.prepare(`SELECT a.learner_id, a.approved_by, a.approved_at, l.email, l.title, l.first_name, l.last_name FROM supervisor_approvals a JOIN learners l ON l.id = a.learner_id WHERE a.status = 'approved'${learnerId ? ' AND a.learner_id = ?' : ''} ORDER BY a.approved_at`).bind(...(learnerId ? [learnerId] : [])).all()).results || [];
  const out = new Map();
  for (const r of rows) {
    if (!looksLikeSelf(r, reviewerOf(r.approved_by))) continue;
    const prev = out.get(r.learner_id);
    if (!prev || (r.approved_at || '') > (prev.approved_at || '')) out.set(r.learner_id, r);
  }
  for (const [id, r] of [...out]) {
    const { results: revs = [] } = await env.DB.prepare("SELECT at, meta FROM audit_events WHERE action = 'approval.independent_review' AND subject_type = 'learner' AND subject_id = ? ORDER BY id DESC LIMIT 5").bind(String(id)).all();
    if (revs.some((x) => x.at >= (r.approved_at || '') && /"outcome":"confirmed"/.test(x.meta || ''))) out.delete(id);
  }
  return [...out.values()];
}

// Evidence file download for administrators. Served as an attachment with a locked-down content type.
export async function evidenceFile(env, id, admin = '') {
  const e = await env.DB.prepare('SELECT learner_id, subject_type, file_name, file_type, file_data FROM credential_evidence WHERE id = ? AND file_data IS NOT NULL').bind(Number(id)).first();
  if (!e) return null;
  // Every download of someone's evidence is recorded (after migration 0012; a no-op before it).
  await audit(env, { actorType: 'admin', actorId: clip(admin, 40) || 'admin', action: 'evidence.view', subjectType: 'learner', subjectId: e.learner_id, meta: { evidence: Number(id), kind: e.subject_type } });
  const type = ['application/pdf', 'image/png', 'image/jpeg'].includes(e.file_type) ? e.file_type : 'application/octet-stream';
  // D1 may return a BLOB as an ArrayBuffer or as an array of byte values.
  return new Response(new Uint8Array(e.file_data), { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${String(e.file_name || 'evidence').replace(/[^\w .()-]/g, '_')}"`, 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}
