// Supervisor verification QA (October 2026): one authoritative verification state, approval without notes, the
// approval email on every route, the person-page route that used to leave an application "under review", email
// failures and retries, duplicate prevention, the audit record, self-approval safeguards and what a learner sees.
// Every person, number and address here is fictional; email goes to a captured stub, never to a provider.
// Production port (branch wavelength-supervisor-prod-20261010): registrations are checked with the generic
// "Verify registration" (the GMC review is not in production) and approvals are in the supervisor role only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from './helpers/verify.mjs';
import { supervisorsAdminPost, supervisorsAdminHtml, looksLikeSelf } from '../worker/supervisors-admin.js';
import { dailyLifecycle, supervisorEligibility, verificationOf } from '../worker/supervisor-lifecycle.js';
import { verificationView, approvedGroups, groupLine } from '../worker/verification/status.js';
import { render, deliver } from '../worker/notify.js';
import { ukDate, addDays, addMonths } from '../worker/time.js';

// The email stub. mode: 'ok' (provider accepts), 'refuse' (HTTP 500), 'hang' (no answer: a network error).
const mail = [];
let mode = 'ok';
globalThis.fetch = async (u, init) => {
  if (mode === 'hang') throw new TypeError('network');
  mail.push(JSON.parse(init.body));
  return new Response('{}', { status: mode === 'refuse' ? 500 : 200 });
};
const settle = () => new Promise((r) => setTimeout(r, 30));
const to = (addr) => mail.filter((m) => m.to[0].email_address.address === addr);
const approvalMails = (addr) => to(addr).filter((m) => /Supervisor Verification/.test(m.subject));

const ON = { SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: 'test' };
const admin = (env, o, reviewer = 'Alex Reviewer') => supervisorsAdminPost(env, adminForm({ reviewer, ...o }), 'wavelength', ctx);
const page = (env, q, opts) => supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/${q}`), 'wavelength', opts);
const EXPLAIN = 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.';
let gmc = 7100001;

// A verified supervisor account (fictional "Jordan Example") with an application sent and its GMC registration
// recorded as checked. Optionally invited by a learner first.
async function applicant(env, email, { invitedBy = null, pathways = ['famus'], areas = ['lung'] } = {}) {
  let learner = null;
  if (invitedBy) {
    learner = await verifiedAccount(env, invitedBy);
    await learner.call('/api/app/supervisors/add', { email });
  }
  const sup = await verifiedAccount(env, email, { firstName: 'Jordan', lastName: 'Example', organisation: 'Example General Hospital' });
  if (invitedBy) {
    const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
    await sup.call('/api/app/supervisors/accept', { id: inv.id });
  }
  const d = await sup.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Example General Hospital',
    registration: { regulator: 'gmc', number: String(gmc++), profession: 'Doctor', organisation: 'Example General Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: EXPLAIN, evidenceMode: 'explanation', areas, pathways,
  });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal((await sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  const sid = await idOf(env, email);
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(sid).first();
  assert.equal((await admin(env, { action: 'reg_verify', learner: sid, sid: reg.id, register_name: 'Jordan Example', checked: '1' })).m, 'Registration verified.');
  const app = await env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(sid).first();
  return { sup, learner, sid, app };
}
// A verified credential row for the supervisor (as the admin's "Approve credential" leaves it).
async function credential(env, sid, type = 'famus-supervisor', modules = ['thoracic', 'dvt'], expires = null) {
  const r = await env.DB.prepare("INSERT INTO credentials (learner_id, credential_type, issuer, programme, role, modules, status, verified_at, verified_by, verification_method, expires_on) VALUES (?,?,?,?,?,?,'verified',?, 'admin:wavelength:Alex Reviewer', 'manual_evidence', ?)")
    .bind(sid, type, type.startsWith('fusic') ? 'ics' : 'sam', type.split('-')[0], type.split('-')[1], JSON.stringify(modules), new Date().toISOString(), expires).run();
  return r.meta.last_row_id;
}

test('approval without a note: saved, the application decided, one email with the approved pathway and modules', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'nonote@example.test');
  const r = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic', 'famus:famus-dvt'] });
  assert.match(r.m, /^Approved until \d{4}-\d{2}-\d{2}: FAMUS pathway, supervisor: Thoracic and DVT\. Approval email: accepted by the email provider\.$/, r.m);
  const a = await env.DB.prepare('SELECT status, decision_note, decided_by FROM supervisor_applications WHERE id = ?').bind(p.app.id).first();
  assert.equal(a.status, 'approved');
  assert.equal(a.decision_note, null, 'no note was typed and none is invented');
  assert.equal(a.decided_by, 'admin:wavelength:Alex Reviewer');
  await settle();
  const m = approvalMails('nonote@example.test');
  assert.equal(m.length, 1);
  assert.equal(m[0].subject, 'Wavelength | Supervisor Verification Approved');
  assert.match(m[0].textbody, /Your supervisor verification has been approved by Wavelength\./);
  assert.match(m[0].textbody, /Your approved pathway and modules are:\n\nFAMUS pathway, supervisor: Thoracic and DVT\./);
  assert.match(m[0].textbody, /You may review eligible supervision requests in accordance with the relevant training requirements\./);
  assert.match(m[0].textbody, /not accreditation or endorsement by RCEM, FAMUS, FUSIC, the GMC/);
  assert.match(m[0].textbody, /Tune In · Gain Clarity/);
  assert.ok(!/accredited by Wavelength|GMC verified|Verified by GMC|approved by (FAMUS|FUSIC|RCEM)/i.test(m[0].textbody));
  // The supervisor's own app: verified, nothing under review.
  const P = (await p.sup.call('/api/app/supervisor')).body;
  assert.equal(P.verification.state, 'verified');
  assert.equal(P.verification.verified, true);
  assert.equal(P.application, null);
  assert.deepEqual(P.verification.pending, []);
  assert.deepEqual(P.verification.approved.map((g) => [g.pathway, g.role, g.modules.map((x) => x.id)]), [['famus', 'supervisor', ['famus-thoracic', 'famus-dvt']]]);
  assert.equal(P.verification.approved[0].verifiedOn, ukDate());
});

test('approval with a note keeps the note, and the audit records everything the note no longer has to carry', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'note@example.test');
  const cred = await credential(env, p.sid);
  await env.DB.prepare("INSERT INTO credential_evidence (learner_id, subject_type, subject_id, kind, description) VALUES (?, 'credential', ?, 'certificate', 'FAMUS supervisor certificate')").bind(p.sid, cred).run();
  const r = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'], basis: String(cred), notes: 'Unusual: certificate reissued after a name change.' });
  assert.match(r.m, /^Approved until/);
  assert.equal((await env.DB.prepare('SELECT decision_note FROM supervisor_applications WHERE id = ?').bind(p.app.id).first()).decision_note, 'Unusual: certificate reissued after a name change.');
  const au = await env.DB.prepare("SELECT * FROM audit_events WHERE action = 'application.approve' AND subject_id = ?").bind(String(p.app.id)).first();
  const meta = JSON.parse(au.meta);
  assert.equal(au.actor_type, 'admin');
  assert.equal(au.actor_id, 'wavelength:Alex Reviewer', 'administrator identity');
  assert.ok(au.at, 'timestamp');
  assert.deepEqual(meta.scopes, ['famus:famus-thoracic'], 'approved modules');
  assert.equal(meta.capacity, 'supervisor');
  assert.deepEqual(meta.credentials, [cred], 'credential relied on');
  assert.equal(meta.evidence.length, 1, 'evidence reference');
  assert.equal(meta.previous, 'applying', 'status before');
  assert.equal(meta.status, 'active', 'status after');
  assert.equal(meta.hasNote, true);
  assert.equal(meta.selfApproval, false);
  assert.ok(!JSON.stringify(meta).includes('name change'), 'the note text stays out of the audit metadata');
  const ev = await env.DB.prepare("SELECT * FROM verification_events WHERE learner_id = ? AND subject_type = 'approval'").bind(p.sid).all();
  assert.equal(ev.results.length, 1);
  assert.match(ev.results[0].notes, /role: supervisor \| basis credentials: \d+ \| Unusual/);
});

test('the reported defect: approving from the person page decides the open application and emails the supervisor', async () => {
  mail.length = 0; mode = 'ok';
  // With approval required, the learner's link waits for the decision, so the "now active" email is part of it too.
  const env = makeEnv({ ...ON, SUPERVISOR_APPROVAL_REQUIRED: 'true' });
  const p = await applicant(env, 'direct@example.test', { invitedBy: 'trainee.direct@example.test' });
  // Before October 2026 this route inserted approvals only: the application stayed "submitted" and no email went.
  const r = await admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-thoracic'] });
  assert.match(r.m, /^Approved until \d{4}-\d{2}-\d{2}: FAMUS pathway, supervisor: Thoracic; 1 waiting learner link activated\. Approval email: accepted by the email provider\.$/, r.m);
  const a = await env.DB.prepare('SELECT status, approved_scopes, decision_note FROM supervisor_applications WHERE id = ?').bind(p.app.id).first();
  assert.equal(a.status, 'approved');
  assert.equal(a.approved_scopes, '["famus:famus-thoracic"]');
  assert.equal(a.decision_note, 'Approved from the person page');
  await settle();
  assert.equal(approvalMails('direct@example.test').length, 1);
  const P = (await p.sup.call('/api/app/supervisor')).body;
  assert.equal(P.verification.state, 'verified');
  assert.equal(P.application, null, 'nothing left "under review"');
  // The admin queues agree: nothing waiting.
  assert.match(await page(env, '?tab=new'), /Nothing waiting/);
  // The learner who invited them sees a verified supervisor, and the "now active" email went to them.
  const L = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(L.state, 'active');
  assert.equal(L.verification.state, 'verified');
  assert.equal(to('trainee.direct@example.test').filter((m) => /now active/.test(m.subject)).length, 1);
});

test('records left inconsistent by the old route: verified with the application shown separately, then repaired by the admin', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'legacy@example.test');
  // Exactly what production holds after the old person-page approval: an approval row, the application still open.
  await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes) VALUES (?, 'famus', 'famus-thoracic', 'approved', '[]', ?, 'admin:wavelength:Alex Reviewer', ?, 'old route')").bind(p.sid, addMonths(ukDate(), 12), new Date().toISOString()).run();
  const P = (await p.sup.call('/api/app/supervisor')).body;
  assert.equal(P.verification.state, 'verified', 'the approval is real and current');
  assert.deepEqual(P.verification.pending.map((x) => [x.kind, x.status]), [['application', 'submitted']], 'the open application is real too: listed separately, never hidden');
  // The admin sees why, in two places, and can record the decision without touching the approval.
  assert.match(await page(env, `?app=${p.app.id}`), /Already approved:<\/b> FAMUS pathway, supervisor: Thoracic/);
  assert.match(await page(env, '?tab=attention'), /is still open although they hold a current approval/);
  const r = await admin(env, { action: 'app_close_approved', app: p.app.id });
  assert.equal(r.m, 'Application recorded as approved. No email was sent.');
  assert.equal(approvalMails('legacy@example.test').length, 0, 'no corrective email unless the administrator ticks the box');
  const after = (await p.sup.call('/api/app/supervisor')).body;
  assert.equal(after.application, null);
  assert.deepEqual(after.verification.pending, []);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(p.sid).first()).n, 1, 'approvals unchanged');
  assert.match((await admin(env, { action: 'app_close_approved', app: p.app.id })).m, /already been decided/);
});

test('the repair can send the confirmation once, when the administrator chooses to', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'repairmail@example.test');
  await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at) VALUES (?, 'fusic', 'fusic-heart', 'approved', '[]', ?, 'admin:wavelength:Alex Reviewer', ?)").bind(p.sid, addMonths(ukDate(), 12), new Date().toISOString()).run();
  const r = await admin(env, { action: 'app_close_approved', app: p.app.id, send_email: '1' });
  assert.equal(r.m, 'Application recorded as approved. Approval email: accepted by the email provider.');
  await deliver(env);
  assert.equal(approvalMails('repairmail@example.test').length, 1);
  assert.match(approvalMails('repairmail@example.test')[0].textbody, /FUSIC pathway, supervisor: Heart/);
});

test('partial approval, several pathways and roles, and a genuine further application beside a verified status', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'multi@example.test', { pathways: ['famus', 'fusic'], areas: ['lung', 'heart'] });
  // Requested more than the evidence supports: approved for FAMUS Thoracic only.
  await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  let v = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.deepEqual(v.approved.map((g) => g.modules.map((m) => m.label)), [['Thoracic']]);
  // Later a FUSIC Heart approval from the person page: a second pathway.
  await admin(env, { action: 'appr_add', learner: p.sid, scope: ['fusic:fusic-heart'] });
  v = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.deepEqual(v.approved.map((g) => [g.pathwayLabel, g.roleLabel, g.modules.map((m) => m.label)]), [['FAMUS', 'Supervisor', ['Thoracic']], ['FUSIC', 'Supervisor', ['Heart']]]);
  // A credential still being checked is pending, kept apart from what is approved.
  await env.DB.prepare("INSERT INTO credentials (learner_id, credential_type, issuer, programme, role, modules, status) VALUES (?, 'fusic-trainer', 'ics', 'fusic', 'trainer', '[\"lung\"]', 'manual_review')").bind(p.sid).run();
  v = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.equal(v.state, 'verified');
  assert.deepEqual(v.pending.map((x) => [x.kind, x.label]), [['credential', 'FUSIC trainer']]);
  assert.ok(!v.approved.some((g) => g.modules.some((m) => /Lung/.test(m.label))), 'pending modules never join approved ones');
  // Two approval emails, each naming only what that decision approved.
  await settle();
  const m = approvalMails('multi@example.test');
  assert.equal(m.length, 2);
  assert.match(m[0].textbody, /FAMUS pathway, supervisor: Thoracic\./);
  assert.match(m[1].textbody, /FUSIC pathway, supervisor: Heart\./);
  assert.ok(!/Heart/.test(m[0].textbody));
});

test('a renewal under review stays verified, with the renewal shown as pending to the supervisor only', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'renewing@example.test', { invitedBy: 'trainee.renewing@example.test' });
  await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  await env.DB.prepare("UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?").bind(addDays(ukDate(), 20), p.sid).run();
  assert.equal((await p.sup.call('/api/app/supervisor/renew', {})).status, 200);
  assert.equal((await p.sup.call('/api/app/supervisor/application', { nothingChanged: true })).status, 200);
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200, 'renewal sent');
  const v = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.equal(v.state, 'verified');
  assert.deepEqual(v.pending.map((x) => x.kind), ['renewal']);
  const L = (await p.learner.call('/api/app/supervisors')).body.supervisors[0].verification;
  assert.equal(L.state, 'verified');
  for (const k of ['pending', 'credentials', 'lapse', 'blocked', 'graceUntil']) assert.ok(!(k in L), `a learner never receives ${k}`);
});

test('expired credential, rejection and revocation each read correctly, and a learner sees only "not verified"', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  // Expired credential: the approval relied on it, so it pauses (derived on read, nothing stored).
  const p = await applicant(env, 'lapsed@example.test', { invitedBy: 'trainee.lapsed@example.test' });
  const cred = await credential(env, p.sid, 'famus-supervisor', ['thoracic'], addDays(ukDate(), 30));
  await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'], basis: String(cred) });
  assert.equal((await p.sup.call('/api/app/supervisor')).body.verification.state, 'verified');
  await env.DB.prepare('UPDATE credentials SET expires_on = ? WHERE id = ?').bind(addDays(ukDate(), -1), cred).run();
  let v = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.equal(v.state, 'paused');
  assert.equal(v.verified, false);
  assert.equal(v.lapse, 'credential');
  assert.deepEqual(v.approved, []);
  const L = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.notEqual(L.state, 'active');
  assert.equal(L.verification, null, 'no approval detail for a supervisor who is not verified now');
  // Rejected.
  const q = await applicant(env, 'rejected@example.test');
  await admin(env, { action: 'app_reject', app: q.app.id, grounds: 'insufficient_evidence', notes: 'No supervision experience described.' });
  assert.equal((await q.sup.call('/api/app/supervisor')).body.verification.state, 'rejected');
  // Revoked.
  const s = await applicant(env, 'revoked@example.test');
  await admin(env, { action: 'app_approve', app: s.app.id, scope: ['famus:famus-thoracic'] });
  await admin(env, { action: 'appr_revoke_all', learner: s.sid, notes: 'Registration concern reported.' });
  v = (await s.sup.call('/api/app/supervisor')).body.verification;
  assert.equal(v.state, 'revoked');
  assert.equal(v.verified, false);
});

test('a learner sees the compact verification of a linked supervisor: pathways, modules, role and dates only', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'shown@example.test', { invitedBy: 'trainee.shown@example.test' });
  const cred = await credential(env, p.sid, 'famus-supervisor', ['thoracic'], '2030-01-01');
  await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'], basis: String(cred), notes: 'PRIVATE ADMIN NOTE' });
  const res = (await p.learner.call('/api/app/supervisors')).body;
  const v = res.supervisors[0].verification;
  assert.deepEqual(Object.keys(v).sort(), ['approved', 'reviewOn', 'state', 'v', 'verified']);
  assert.deepEqual(v.approved.map((g) => [g.pathwayLabel, g.roleLabel, g.modules.map((m) => m.label), g.verifiedOn, g.reviewOn]), [['FAMUS', 'Supervisor', ['Thoracic'], ukDate(), addMonths(ukDate(), 12)]]);
  const all = JSON.stringify(res);
  assert.ok(!all.includes('PRIVATE ADMIN NOTE'), 'no administration notes');
  const reg = await env.DB.prepare('SELECT registration_number FROM professional_registrations WHERE learner_id = ?').bind(p.sid).first();
  assert.ok(!all.includes(reg.registration_number), 'no registration number');
  assert.ok(!/evidence|certificate/i.test(all), 'no evidence');
  // The supervisor's own view adds the credential relied on and its expiry.
  const own = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.deepEqual(own.credentials, [{ label: 'FAMUS supervisor', issuer: 'Society for Acute Medicine', expiresOn: '2030-01-01', reviewOn: null }]);
});

test('a GMC registration alone, or an unrelated credential, never makes anyone verified or eligible', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv({ ...ON, SUPERVISOR_APPROVAL_REQUIRED: 'true' });
  const p = await applicant(env, 'gmconly@example.test');
  await credential(env, p.sid, 'fusic-supervisor', ['heart']);
  const v = (await p.sup.call('/api/app/supervisor')).body.verification;
  assert.equal(v.state, 'pending');
  assert.equal(v.verified, false);
  const el = await supervisorEligibility(env, p.sid, { scopes: ['fusic:fusic-heart'] });
  assert.equal(el.ok, false);
  assert.deepEqual(el.reasons, ['not_approved']);
  // Approved for FAMUS Thoracic only: still not eligible for FUSIC Heart, or for scans outside the module.
  await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  assert.equal((await supervisorEligibility(env, p.sid, { scopes: ['famus:famus-thoracic'] })).ok, true);
  assert.deepEqual((await supervisorEligibility(env, p.sid, { scopes: ['fusic:fusic-heart'] })).reasons, ['out_of_scope']);
  await admin(env, { action: 'appr_add', learner: p.sid, scope: ['fusic:fusic-heart'] });
  assert.equal((await supervisorEligibility(env, p.sid, { scopes: ['fusic:fusic-heart'] })).ok, true);
});

test('email delivery failure: the approval stands, the failure is shown, retried by the daily job, and resent once', async () => {
  mail.length = 0; mode = 'refuse';
  const env = makeEnv(ON);
  const p = await applicant(env, 'bounce@example.test');
  mail.length = 0;
  const r = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  assert.match(r.m, /Approval email: failed\.$/);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.verification.state, 'verified', 'the approval is saved whatever happens to the email');
  const row = await env.DB.prepare('SELECT * FROM notification_log WHERE key = ?').bind(`app_approved:${p.app.id}`).first();
  assert.equal(row.status, 'failed');
  assert.equal(row.last_error, 'refused by the email provider');
  assert.match(await page(env, `?app=${p.app.id}`), /data-email-status="failed"[\s\S]*Approval email: Failed/);
  assert.match(await page(env, '?tab=attention'), /Approval email failed/);
  assert.match(await page(env, `?id=${p.sid}`), /Approval email: Failed/);
  // The daily job retries a refusal (after its back-off), up to three attempts in all.
  await env.DB.prepare('UPDATE notification_log SET next_attempt_at = NULL WHERE key = ?').bind(row.key).run();
  mode = 'ok';
  await dailyLifecycle(env);
  const after = await env.DB.prepare('SELECT status, attempts FROM notification_log WHERE key = ?').bind(row.key).first();
  assert.deepEqual([after.status, after.attempts], ['sent', 2]);
  assert.equal(approvalMails('bounce@example.test').length, 2, 'the refused attempt reached the stub, then the accepted one');
  // A sent email is never resent from the console.
  assert.equal((await admin(env, { action: 'notif_resend', key: row.key, app: p.app.id })).m, 'That email cannot be resent.');
});

test('no answer from the provider is "unknown": never retried on its own; an administrator resends it once', async () => {
  mail.length = 0; mode = 'hang';
  const env = makeEnv(ON);
  mode = 'ok';
  const p = await applicant(env, 'unknown@example.test');
  mode = 'hang';
  const r = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  assert.match(r.m, /Approval email: unknown\.$/);
  const key = `app_approved:${p.app.id}`;
  mode = 'ok';
  await dailyLifecycle(env);
  assert.equal((await env.DB.prepare('SELECT status FROM notification_log WHERE key = ?').bind(key).first()).status, 'unknown', 'not retried automatically');
  assert.equal(approvalMails('unknown@example.test').length, 0);
  const res = await admin(env, { action: 'notif_resend', key, app: p.app.id });
  assert.deepEqual(res, { app: p.app.id, m: 'Sent: accepted by the email provider.' }, 'back to the application page');
  assert.equal(approvalMails('unknown@example.test').length, 1);
  const au = await env.DB.prepare("SELECT * FROM audit_events WHERE action = 'email.resend'").first();
  assert.ok(au && /"from":"unknown"/.test(au.meta));
});

test('without an email token the approval is saved and the email waits as failed ("not set up"), never as sent', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv({ ...ON, ZEPTOMAIL_TOKEN: '' });
  const p = await applicant(env, 'notoken@example.test');
  const r = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  assert.match(r.m, /Approval email: failed\.$/);
  const row = await env.DB.prepare('SELECT status, last_error FROM notification_log WHERE key = ?').bind(`app_approved:${p.app.id}`).first();
  assert.deepEqual([row.status, row.last_error], ['failed', 'email sending is not set up']);
});

test('a failed save writes no approval, queues no email and leaves the application as it was', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'dbfail@example.test');
  mail.length = 0;
  const real = env.DB.batch.bind(env.DB);
  env.DB.batch = async () => { throw new Error('D1_ERROR: simulated failure'); };
  const r = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] });
  env.DB.batch = real;
  assert.equal(r.m, 'Could not save the approval. Nothing was changed and no email was sent. Please try again.');
  assert.equal((await env.DB.prepare('SELECT status, decided_at FROM supervisor_applications WHERE id = ?').bind(p.app.id).first()).status, 'submitted');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?").bind(p.sid).first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM notification_log WHERE kind = 'app_approved'").first()).n, 0);
  await settle();
  assert.equal(approvalMails('dbfail@example.test').length, 0);
  // Trying again works, once.
  assert.match((await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] })).m, /^Approved until/);
  assert.equal(approvalMails('dbfail@example.test').length, 1);
});

test('duplicates: repeat clicks, a second administrator and two requests at once queue one email and one approval', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'twice@example.test');
  const [a, b] = await Promise.all([
    admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] }),
    admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] }, 'Sam Second'),
  ]);
  assert.equal([a.m, b.m].filter((m) => /^Approved until/.test(m)).length, 1, [a.m, b.m].join(' | '));
  assert.match((await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] })).m, /already been decided/);
  // The same direct approval twice: the second changes nothing and sends nothing.
  const d1 = await admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-dvt'] });
  const d2 = await admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-dvt'] });
  assert.match(d1.m, /^1 scope approved/);
  assert.equal(d2.m, 'Already approved for these modules: nothing changed, and no email was sent.');
  const [c1, c2] = await Promise.all([
    admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-abdo'] }),
    admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-abdo'] }),
  ]);
  assert.equal([c1.m, c2.m].filter((m) => /^1 scope approved/.test(m)).length, 1, [c1.m, c2.m].join(' | '));
  await settle();
  assert.equal(approvalMails('twice@example.test').length, 3, 'one per approval decision, never two');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(p.sid).first()).n, 3);
});

test('self-approval: recognised, refused without an acknowledgement, recorded, and listed for independent review', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'self@example.test');
  // The applicant's own name (any of these forms) in the reviewer field.
  const html = await page(env, `?app=${p.app.id}`, { reviewer: 'Dr Jordan Example' });
  assert.match(html, /This looks like your own application/);
  assert.match((await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] }, 'Jordan')).m, /looks like your own application/);
  assert.match((await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'], self_ack: '1', self_reason: 'short' }, 'Jordan Example')).m, /20 characters or more/);
  const ok = await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'], self_ack: '1', self_reason: 'FAMUS supervisor certificate and GMC entry checked against the originals.' }, 'Jordan Example');
  assert.match(ok.m, /Recorded as a self-approval/);
  const meta = JSON.parse((await env.DB.prepare("SELECT meta FROM audit_events WHERE action = 'application.approve'").first()).meta);
  assert.equal(meta.selfApproval, true);
  assert.match((await env.DB.prepare("SELECT notes FROM verification_events WHERE subject_type = 'approval'").first()).notes, /self-approval: FAMUS supervisor certificate/);
  // Listed until someone else reviews it. The supervisor cannot review themselves, nor can the approver.
  assert.match(await page(env, '?tab=attention'), /who appears to be the supervisor/);
  assert.match(await page(env, `?id=${p.sid}`), /Independent review recommended/);
  assert.match((await admin(env, { action: 'appr_independent_review', learner: p.sid, outcome: 'confirmed' }, 'J Example')).m, /someone other than the supervisor/);
  assert.match((await admin(env, { action: 'appr_independent_review', learner: p.sid, outcome: 'concerns', notes: 'too short' }, 'Sam Second')).m, /20 characters/);
  assert.equal((await admin(env, { action: 'appr_independent_review', learner: p.sid, outcome: 'confirmed' }, 'Sam Second')).m, 'Independent review recorded.');
  assert.doesNotMatch(await page(env, '?tab=attention'), /who appears to be the supervisor/);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.verification.state, 'verified', 'nothing was revoked automatically');
});

test('SUPERVISOR_SELF_APPROVAL = "refuse": nobody approves themselves, even with an acknowledgement; another administrator can', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv({ ...ON, SUPERVISOR_SELF_APPROVAL: 'refuse' });
  const p = await applicant(env, 'refuse@example.test');
  assert.match(await page(env, `?app=${p.app.id}`, { reviewer: 'Jordan Example' }), /Another administrator must decide it/);
  const ack = { self_ack: '1', self_reason: 'FAMUS supervisor certificate and GMC entry checked against the originals.' };
  assert.equal((await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'], ...ack }, 'Jordan Example')).m, 'This looks like your own application. Another administrator must decide it.');
  assert.equal((await admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-thoracic'], ...ack }, 'J Example')).m, 'This looks like your own application. Another administrator must decide it.');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?").bind(p.sid).first()).n, 0, 'nothing written');
  assert.equal(approvalMails('refuse@example.test').length, 0, 'no email');
  assert.match((await admin(env, { action: 'app_approve', app: p.app.id, scope: ['famus:famus-thoracic'] }, 'Sam Second')).m, /^Approved until/);
});

test('self-approvals made before the check existed are found from the approval record', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'oldself@example.test');
  await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at) VALUES (?, 'famus', 'famus-thoracic', 'approved', '[]', ?, 'admin:wavelength:Jordan', ?)").bind(p.sid, addMonths(ukDate(), 12), new Date().toISOString()).run();
  assert.match(await page(env, '?tab=attention'), /Approved by Jordan on .*who appears to be the supervisor/);
});

test('looksLikeSelf: full names, initials, titles, single names and Access emails', () => {
  const l = { first_name: 'Jordan', last_name: 'Example', email: 'jordan@example.test' };
  for (const r of ['Jordan Example', 'Dr Jordan Example', 'J Example', 'jordan', 'EXAMPLE', 'jordan@example.test', 'Jordan-Example']) assert.equal(looksLikeSelf(l, r), true, r);
  for (const r of ['Sam Second', 'Alex Reviewer', 'other@example.test', '', 'Jordana Smith']) assert.equal(looksLikeSelf(l, r), false, r);
});

test('the verification view: precedence, grouping and the learner audience', () => {
  const st = (o = {}) => ({ learner: { email_status: 'verified' }, registrations: [], credentials: [], approvals: [], block: null, ...o });
  const ap = (pathway, module, o = {}) => ({ pathway, module, current: true, capacity: 'supervisor', approved_at: '2026-10-01T10:00:00Z', review_on: '2027-10-01', required_basis: '[]', ...o });
  assert.equal(verificationView(st(), { standing: 'none' }).state, 'none');
  assert.equal(verificationView(st(), { standing: 'applying' }, { open: { status: 'submitted', kind: 'initial' } }).state, 'pending');
  assert.equal(verificationView(st(), { standing: 'applying' }, { open: { status: 'more_info', kind: 'initial' } }).state, 'more_info');
  assert.equal(verificationView(st(), { standing: 'applying' }, { open: { status: 'draft', kind: 'initial' } }).state, 'none', 'an unsent draft is not under review');
  assert.equal(verificationView(st({ approvals: [ap('famus', 'famus-thoracic', { current: false, lapse: 'registration' })] }), { standing: 'paused', lapse: 'registration' }).state, 'paused');
  assert.equal(verificationView(st({ approvals: [ap('famus', '*', { grace: true, graceUntil: '2026-11-01' })] }), { standing: 'renewal_review' }).state, 'renewal_review');
  assert.equal(verificationView(st(), { standing: 'none' }, { last: { status: 'rejected' } }).state, 'rejected');
  // Verified and an open application at once: verified, and the application listed, never merged.
  const v = verificationView(st({ approvals: [ap('famus', 'famus-thoracic'), ap('famus', 'famus-dvt', { approved_at: '2026-10-05T09:00:00Z' }), ap('fusic', 'fusic-heart', { capacity: 'mentor' })] }), { standing: 'active' }, { open: { id: 9, status: 'submitted', kind: 'reapplication', submitted_at: '2026-10-06T08:00:00Z', requested_areas: '["msk"]' } });
  assert.equal(v.state, 'verified');
  assert.deepEqual(v.approved.map((g) => [g.pathway, g.role, g.modules.map((m) => m.id), g.verifiedOn]), [['famus', 'supervisor', ['famus-thoracic', 'famus-dvt'], '2026-10-05'], ['fusic', 'mentor', ['fusic-heart'], '2026-10-01']]);
  assert.deepEqual(v.pending, [{ kind: 'application', status: 'submitted', since: '2026-10-06', application: 9, areas: ['msk'], pathways: [] }]);
  const lv = verificationView(st({ approvals: [ap('famus', 'famus-thoracic')] }), { standing: 'active' }, { open: { status: 'submitted', kind: 'renewal' }, audience: 'learner' });
  assert.deepEqual(Object.keys(lv).sort(), ['approved', 'reviewOn', 'state', 'v', 'verified']);
  assert.equal(verificationView(st(), { standing: 'revoked' }, { audience: 'learner' }).state, 'not_verified');
  assert.equal(groupLine(approvedGroups([ap('famus', '*')])[0]), 'FAMUS pathway, supervisor: all FAMUS modules');
  assert.equal(groupLine(approvedGroups([ap('eusem2', 'eusem2-chest'), ap('eusem2', 'eusem2-ocular'), ap('eusem2', 'eusem2-proc')])[0]), 'EUSEM advanced pathway, supervisor: Chest, advanced; Ocular, advanced; Procedures, advanced', 'names holding commas are kept apart');
  assert.equal(groupLine(approvedGroups([ap('eusem', 'eusem-chest'), ap('eusem', 'eusem-ocular')])[0]), 'EUSEM pathway, supervisor: Chest: heart and lung; Ocular');
  assert.equal(groupLine(approvedGroups([ap('fusic', 'fusic-heart', { capacity: 'mentor' }), ap('fusic', 'fusic-lung', { capacity: 'mentor' }), ap('fusic', 'fusic-dvt', { capacity: 'mentor' })])[0]), 'FUSIC pathway, mentor: Heart, Lung and DVT');
});

test('approval notes are optional on every approval form, and required where a reason matters', async () => {
  mail.length = 0; mode = 'ok';
  const env = makeEnv(ON);
  const p = await applicant(env, 'forms@example.test');
  const app = await page(env, `?app=${p.app.id}`);
  const approveForm = app.slice(app.indexOf('value="app_approve"'), app.indexOf('</form>', app.indexOf('value="app_approve"')));
  assert.ok(!/name="notes" required/.test(approveForm), 'Approve: note optional');
  assert.match(approveForm, /Add a note \(optional\)/);
  assert.match(approveForm, /Recorded automatically/);
  const rejectForm = app.slice(app.indexOf('value="app_reject"'), app.indexOf('</form>', app.indexOf('value="app_reject"')));
  assert.match(rejectForm, /name="notes" required/, 'Reject: reason required');
  assert.match((await admin(env, { action: 'app_reject', app: p.app.id, grounds: 'insufficient_evidence' })).m, /internal note/);
  const person = await page(env, `?id=${p.sid}`);
  const addForm = person.slice(person.indexOf('value="appr_add"'), person.indexOf('</form>', person.indexOf('value="appr_add"')));
  assert.ok(!/name="notes" required/.test(addForm), 'person page approval: note optional');
  assert.match(addForm, /Approving here also decides it, and the supervisor is emailed/);
  // The reviewer's name is filled in once remembered, and Access replaces it with the verified email.
  assert.match(await page(env, `?app=${p.app.id}`, { reviewer: 'Alex Reviewer' }), /name="reviewer" autocomplete="name" maxlength="80" value="Alex Reviewer" required/);
  const acc = await page(env, `?app=${p.app.id}`, { access: 'alex@example.test' });
  assert.match(acc, /Recorded as alex@example\.test \(Cloudflare Access\)/);
  assert.ok(!/name="reviewer" autocomplete/.test(acc));
});

test('the approval email template: renewal wording, older queued rows, and nothing private', () => {
  const m = render('app_approved', { firstName: 'Jordan', renewal: true, groups: ['FAMUS pathway, supervisor: Thoracic'], reviewOn: '2027-10-10', learners: ['Dr Casey Learner'] });
  assert.equal(m.subject, 'Wavelength | Supervisor Verification Renewed');
  assert.match(m.text, /renewed by Wavelength/);
  assert.match(m.text, /Your approval runs until 10 October 2027/);
  assert.match(m.text, /Dr Casey Learner is waiting: your supervision is now active/);
  assert.match(m.text, /Open your Wavelength profile: https:\/\/thewavelength\.co\.uk\/app\/#\/supervisor/);
  // A row queued before October 2026 carries areas, not groups.
  const old = render('app_approved', { firstName: 'Jordan', areas: ['Thoracic (FAMUS pathway)'] });
  assert.match(old.text, /Approved to supervise: Thoracic \(FAMUS pathway\)\./);
});

test('verificationOf before migration 0012 is null, and the supervisor endpoint still answers as before', async () => {
  const env = makeEnv(ON, { skipMigrations: ['0012_supervisor_lifecycle.sql'] });
  assert.equal(await verificationOf(env, 1), null);
});
