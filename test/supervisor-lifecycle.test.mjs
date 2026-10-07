// The supervisor lifecycle (migration 0012): invitation, claim, application, admin decisions, renewal and its grace
// period, expiry, lapse, withdrawal, revocation and blocks, returned requests, the email outbox, the daily job and the
// admin console. Both switch states are covered: SUPERVISOR_APPLY and SUPERVISOR_APPROVAL_REQUIRED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, ctx } from './helpers/env.mjs';
import { verifiedAccount, signup, idOf, adminForm, SIG, PASSWORD, gmcCheck } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { supervisorsAdminPost, supervisorsAdminHtml, evidenceFile } from '../worker/supervisors-admin.js';
import { dailyLifecycle, supervisorEligibility } from '../worker/supervisor-lifecycle.js';
import { currentStatus } from '../worker/professional.js';
import { ukDate, addDays, addMonths, inDate, businessDaysSince } from '../worker/time.js';
import { render } from '../worker/notify.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

// Every email the Worker sends in this file goes here.
const mail = [];
globalThis.fetch = async (u, init) => { mail.push(JSON.parse(init.body)); return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 30));
const mailTo = (addr) => mail.filter((m) => m.to[0].email_address.address === addr);
const subjects = (addr) => mailTo(addr).map((m) => m.subject);

const ON = { SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'true', ZEPTOMAIL_TOKEN: 'test' };
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength', ctx);
const html = (env, q) => supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/${q}`), 'wavelength');
const EXPLAIN = 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.';
const kind = LOGBOOK.assessmentKinds[0].id;

// A learner who invites sup@x.co, and that supervisor's verified account, which has claimed the invitation.
async function invitedSupervisor(env, email = 'sup@x.co') {
  const learner = await verifiedAccount(env, `trainee.${email}`);
  await learner.call('/api/app/supervisors/add', { email });
  const sup = await verifiedAccount(env, email, { organisation: 'Darent Valley Hospital' });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  const acc = await sup.call('/api/app/supervisors/accept', { id: inv.id });
  return { learner, sup, acc, inv, sid: await idOf(env, email), lid: await idOf(env, `trainee.${email}`) };
}
// A complete draft: a GMC registration (manual check), experience, an explanation and requested areas.
let gmc = 1234567;
async function fillDraft(sup, extra = {}) {
  const r = await sup.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Darent Valley Hospital',
    registration: { regulator: 'gmc', number: String(gmc++), profession: 'Doctor', organisation: 'Darent Valley Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: EXPLAIN, evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'], ...extra,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.application;
}
const appOf = async (env, sid) => env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(sid).first();
async function verifyReg(env, sid) {
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(sid).first();
  const r = await admin(env, { action: 'reg_gmc_check', learner: sid, sid: reg.id, ...gmcCheck() });
  assert.equal(r.m, 'GMC registration verified.');
}
// Applies, gets the registration verified and is approved for FAMUS Thoracic.
async function approvedSupervisor(env, email = 'sup@x.co') {
  const p = await invitedSupervisor(env, email);
  await fillDraft(p.sup);
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  await verifyReg(env, p.sid);
  const a = await appOf(env, p.sid);
  const r = await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'Six years leading the department programme.' });
  assert.match(r.m, /^Approved until/, r.m);
  await settle();
  return { ...p, app: a };
}

test('the time helpers use UK dates, and an approval is current to the end of its review day', () => {
  assert.equal(ukDate(Date.UTC(2026, 5, 30, 23, 30)), '2026-07-01', 'BST: 23:30 UTC is the next UK day');
  assert.equal(ukDate(Date.UTC(2026, 11, 31, 23, 30)), '2026-12-31', 'GMT in winter');
  assert.equal(addMonths('2026-10-06', 12), '2027-10-06');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28', 'a leap day rolls back, never forward');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(inDate('2026-10-06', '2026-10-06') && !inDate('2026-10-05', '2026-10-06'));
  assert.equal(businessDaysSince('2026-10-02T09:00:00Z', Date.UTC(2026, 9, 6, 9)), 2, 'Friday to Tuesday is two business days');
});

test('without migration 0012 nothing changes: the endpoints say not yet, and accepting an invitation activates the link', async () => {
  const env = makeEnv(ON, { skipMigrations: ['0012_supervisor_lifecycle.sql'] });
  const p = await invitedSupervisor(env);
  assert.equal(p.acc.status, 200);
  assert.equal((await p.learner.call('/api/app/supervisors')).body.supervisors[0].status, 'active');
  assert.equal((await p.sup.call('/api/app/supervisor')).status, 503);
  assert.equal((await p.sup.call('/api/app/supervisor/application', { role: 'x' })).status, 503);
  assert.match(await html(env, ''), /Needs a decision/);
  assert.deepEqual(await dailyLifecycle(env), { skipped: 'migration 0012 not applied' });
});

test('with both switches off, an accepted link works as before and is labelled "Not yet verified by Wavelength"', async () => {
  const env = makeEnv({ SUPERVISOR_APPLY: 'false', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: 'test' });
  const p = await invitedSupervisor(env, 'off@x.co');
  assert.equal(p.acc.body.next, 'dashboard');
  const link = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(link.state, 'not_verified');
  assert.equal(link.stateLabel, 'Not yet verified by Wavelength');
  assert.equal((await p.sup.call('/api/app/supervise/learner?id=' + p.lid)).status, 200, 'dashboard access as today');
  const me = (await p.sup.call('/api/app/supervisor')).body;
  assert.equal(me.available, false, 'the application journey stays closed');
  assert.equal((await p.sup.call('/api/app/supervisor/application', { role: 'x' })).status, 503);
  assert.equal((await supervisorEligibility(env, p.sid)).enforced, false);
});

// The production configuration from Step 3a (7 October 2026), read from wrangler.jsonc: applications open, approval
// enforcement and search off. Existing links behave as before, an unconfirmed email cannot apply, and starting,
// cancelling or sending an application never makes anyone approved.
test('production configuration: applications open, enforcement and search off', async () => {
  const mailsBefore = mail.length;
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  assert.equal(env.SUPERVISOR_APPLY, 'true');
  assert.equal(env.SUPERVISOR_APPROVAL_REQUIRED, 'false');
  assert.equal(env.SUPERVISOR_SEARCH, 'false');
  assert.equal(env.PROFESSIONAL_VERIFY, undefined);
  assert.equal(env.DIRECTORY_PUBLIC, undefined);
  assert.equal(env.APP_MIN_VERSION, '');
  assert.equal(env.APP_RECOMMENDED_VERSION, '');

  const p = await invitedSupervisor(env, 'prod@x.co');
  assert.equal(p.acc.body.next, 'dashboard', 'accepting an invitation still activates the link');
  const link = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(link.state, 'not_verified');
  assert.equal((await p.sup.call('/api/app/supervise/learner?id=' + p.lid)).status, 200, 'dashboard access as before');
  assert.equal((await supervisorEligibility(env, p.sid)).enforced, false);
  const me = (await p.sup.call('/api/app/me')).body.supervisor;
  assert.equal(me.apply, true);
  assert.equal(me.required, false);
  assert.equal(me.search, false);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.available, true, 'the application journey is open');

  // An account whose email is not confirmed sees the journey but cannot save or send anything.
  const unconfirmed = await signup(env, 'unconfirmed@x.co');
  const ov = (await unconfirmed.call('/api/app/supervisor')).body;
  assert.equal(ov.available, true);
  assert.equal(ov.emailVerified, false);
  for (const path of ['/api/app/supervisor/application', '/api/app/supervisor/submit']) {
    const r = await unconfirmed.call(path, { role: 'x', declaration: true });
    assert.equal(r.status, 403, path);
    assert.equal(r.body.needVerify, true);
  }
  const uid = await idOf(env, 'unconfirmed@x.co');
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_applications WHERE learner_id = ?').bind(uid).first('n'), 0);

  // A draft, then cancelled: no approval, standing back to none.
  await fillDraft(p.sup);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.standing, 'applying');
  assert.equal((await p.sup.call('/api/app/supervisor/application/cancel', {})).status, 200);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.application, null);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_applications WHERE learner_id = ? AND status IN ('draft', 'submitted', 'more_info')").bind(p.sid).first('n'), 0);

  // Sent: waiting for review, still not approved, link and dashboard unchanged.
  await fillDraft(p.sup);
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals').first('n'), 0, 'nobody is approved by applying');
  const after = await supervisorEligibility(env, p.sid, { force: true });
  assert.equal(after.ok, false, 'not approved when checked as if enforcement were on');
  assert.deepEqual(after.approvedFor, []);
  assert.equal((await supervisorEligibility(env, p.sid)).enforced, false);
  assert.notEqual((await p.sup.call('/api/app/supervisor')).body.standing, 'active');
  assert.equal((await p.learner.call('/api/app/supervisors')).body.supervisors[0].state, 'not_verified');
  assert.equal((await p.sup.call('/api/app/supervise/learner?id=' + p.lid)).status, 200);

  // Search stays closed, for searching and for opting in.
  assert.equal((await p.learner.call('/api/app/supervisors/search?q=smi')).status, 503);
  assert.equal((await p.sup.call('/api/app/supervisor/searchable', { on: true })).status, 503);
  assert.match(await html(env, ''), /Needs a decision|New/);
  await settle();
  mail.length = mailsBefore; // later tests count the admin alerts they cause
});

test('an invited supervisor claims the link, applies, and is approved for a subset of scopes; emails go once', async () => {
  const env = makeEnv(ON);
  const p = await invitedSupervisor(env);
  assert.equal(p.acc.body.next, 'apply', 'not approved yet: the invitation is claimed, not activated');
  let link = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(link.state, 'verifying');
  assert.equal(link.stateLabel, 'Supervisor verification in progress');
  assert.equal((await p.sup.call('/api/app/supervise/learner?id=' + p.lid)).status, 404, 'no access while claimed');

  // A draft with no documents and too short an explanation cannot be sent.
  await fillDraft(p.sup, { justification: 'Short.' });
  const bad = await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.step, 'evidence');
  await fillDraft(p.sup);
  assert.equal((await p.sup.call('/api/app/supervisor/submit', {})).body.step, 'declaration');
  const sent = await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 404, 'a second submit finds nothing to send');
  await settle();
  const life = () => subjects('sup@x.co').filter((x) => /supervisor (application|status)/.test(x));
  assert.deepEqual(life(), ['Wavelength supervisor application received']);
  const adminMail = mailTo('hello@thewavelength.co.uk');
  assert.equal(adminMail.length, 1);
  assert.ok(!/sup@x\.co|1234567|Smith/.test(JSON.stringify(adminMail[0])), 'the admin alert carries no personal details');
  assert.equal((await p.sup.call('/api/app/supervisor')).body.standing, 'applying');

  // The console lists it with its basis.
  const a = await appOf(env, p.sid);
  assert.match(await html(env, '?tab=new'), /Self-declared experience, no documents/);
  const page = await html(env, `?app=${a.id}`);
  assert.match(page, /The registration is not verified yet/);
  assert.ok(page.includes('value="famus:famus-thoracic" checked'), 'scopes pre-ticked from the requested areas');

  // Approval needs a verified registration (or an exemption), and lasts 12 months at most.
  assert.match((await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'Basis' })).m, /registration is not verified/);
  await verifyReg(env, p.sid);
  assert.match((await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'Basis', review_on: addMonths(ukDate(), 13) })).m, /no later than/);
  const ok = await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'Basis' });
  assert.match(ok.m, /Approved until .*1 scope.*1 waiting learner link/);
  assert.match((await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'Basis' })).m, /already been decided/, 'two reviewers cannot both decide');
  await settle();
  const row = await env.DB.prepare("SELECT * FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(p.sid).first();
  assert.equal(row.review_on, addMonths(ukDate(), 12));
  assert.equal(row.application_id, a.id);
  assert.deepEqual(life(), ['Wavelength supervisor application received', 'Your Wavelength supervisor status has been approved']);
  assert.deepEqual(subjects('trainee.sup@x.co').filter((s) => /active/.test(s)), ['Your supervisor is now active']);

  link = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(link.state, 'active');
  assert.equal(link.stateLabel, 'Wavelength Verified ✓');
  assert.ok(link.areas.length);
  assert.equal((await p.sup.call('/api/app/supervise/learner?id=' + p.lid)).status, 200);

  // Requests are checked against the approved scope on the server.
  const inScope = await p.learner.call('/api/app/assessment/request', { pathway: 'famus', module: 'famus-thoracic', kind, supervisorLink: link.id });
  assert.equal(inScope.status, 200, JSON.stringify(inScope.body));
  const outScope = await p.learner.call('/api/app/assessment/request', { pathway: 'fusic', module: 'fusic-heart', kind, supervisorLink: link.id });
  assert.equal(outScope.status, 400);
  assert.match(outScope.body.error, /not approved by Wavelength for everything/);

  // Every notification row was sent once; none is left pending.
  const counts = (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM notification_log GROUP BY status').all()).results;
  assert.deepEqual(counts.map((c) => c.status), ['sent']);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notification_log WHERE payload IS NOT NULL').first()).n, 0, 'addresses are cleared once sent');
});

test('more information: the application goes back to the applicant, and comes back to the queue when sent again', async () => {
  const env = makeEnv(ON);
  const p = await invitedSupervisor(env, 'more@x.co');
  await fillDraft(p.sup);
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  const a = await appOf(env, p.sid);
  assert.match((await admin(env, { action: 'app_more', app: a.id, notes: '' })).m, /Say what information/);
  assert.match((await admin(env, { action: 'app_more', app: a.id, notes: 'Please upload your FAMUS supervisor certificate.' })).m, /More information requested/);
  await settle();
  assert.ok(subjects('more@x.co').includes('More information needed for your supervisor application'));
  const me = (await p.sup.call('/api/app/supervisor')).body;
  assert.equal(me.application.status, 'more_info');
  assert.equal(me.application.moreInfo, 'Please upload your FAMUS supervisor certificate.');
  assert.match(await html(env, '?tab=more'), new RegExp(`#${a.id}`));
  await fillDraft(p.sup, { justification: EXPLAIN + ' Certificate to follow by email.' });
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  assert.equal((await appOf(env, p.sid)).status, 'submitted');
});

test('rejection: the applicant and waiting learners are told; "do not reapply" stops a new application', async () => {
  const env = makeEnv(ON);
  const p = await invitedSupervisor(env, 'rej@x.co');
  await fillDraft(p.sup);
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  const a = await appOf(env, p.sid);
  const r = await admin(env, { action: 'app_reject', app: a.id, grounds: 'insufficient_evidence', notes: 'No supervision experience', message: 'We need evidence of supervising scans.' });
  assert.match(r.m, /Application rejected.*1 waiting learner has been told/);
  await settle();
  const rej = mailTo('rej@x.co').find((m) => /Update on your/.test(m.subject));
  assert.match(rej.textbody, /We need evidence of supervising scans/);
  assert.match(rej.textbody, /Please contact us before applying again/, 'may_reapply was not ticked');
  assert.ok(subjects('trainee.rej@x.co').includes('Your supervisor request'));
  assert.equal((await p.learner.call('/api/app/supervisors')).body.supervisors.length, 0, 'the claimed link has ended');
  assert.equal((await p.sup.call('/api/app/supervisor/apply-again', {})).status, 403);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.canApplyAgain, false);
});

test('rejection on verification or safety grounds blocks one-off assessor signing until the block is lifted', async () => {
  const env = makeEnv(ON);
  const p = await invitedSupervisor(env, 'unsafe@x.co');
  await fillDraft(p.sup);
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  const a = await appOf(env, p.sid);
  const r = await admin(env, { action: 'app_reject', app: a.id, grounds: 'verification_or_safety', notes: 'Registration belongs to someone else', may_reapply: '1' });
  assert.match(r.m, /One-off assessor signing is blocked/);
  const block = await env.DB.prepare('SELECT * FROM supervisor_blocks WHERE learner_id = ?').bind(p.sid).first();
  assert.equal(block.kind, 'rejected_safety');
  // Another learner sends this person a one-off sign-off link: signing is refused with the neutral wording.
  const other = await verifiedAccount(env, 'other@x.co');
  await other.call('/api/app/sync', { entries: [{ id: 'blockentry1', type: 'lung', date: '2026-09-01', supervision: 'direct' }] });
  const req = await other.call('/api/app/signoff/request', { entryIds: ['blockentry1'], supervisorName: 'Dr X', supervisorEmail: 'unsafe@x.co' });
  const token = req.body.link.split('#')[1];
  const signed = await client(handleApp, env).call('/api/app/signoff/complete', { token, name: 'Dr X', role: 'Consultant', email: 'unsafe@x.co', confirm: true, signature: SIG, decisions: { blockentry1: 'confirmed' } });
  assert.equal(signed.status, 403);
  assert.equal(signed.body.error, "This can't be completed through Wavelength. Contact hello@thewavelength.co.uk.");
  const back = await env.DB.prepare('SELECT status, returned_reason, token_hash FROM signoffs WHERE id = ?').bind(req.body.code).first();
  assert.equal(back.status, 'pending', 'the learner keeps the request');
  assert.equal(back.returned_reason, 'signer_unavailable');
  assert.equal(back.token_hash, null, 'the old link no longer works');
  assert.equal((await p.sup.call('/api/app/supervisor/apply-again', {})).status, 403, 'a blocked account cannot reapply');
  assert.match(await html(env, `?id=${p.sid}`), /One-off assessor signing through Wavelength is blocked/);
  assert.match((await admin(env, { action: 'block_lift', learner: p.sid, sid: block.id, notes: 'Identity confirmed by the trust' })).m, /Block lifted/);
  assert.equal((await p.sup.call('/api/app/supervisor/apply-again', {})).status, 200);
});

test('a dashboard request comes back to the learner when the supervisor becomes unavailable, and can be sent on', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'gone@x.co');
  const link = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  await p.learner.call('/api/app/sync', { entries: [{ id: 'returnent01', type: 'lung', date: '2026-09-01', supervision: 'direct' }] });
  const so = await p.learner.call('/api/app/signoff/request', { entryIds: ['returnent01'], supervisorLink: link.id });
  assert.equal(so.status, 200, JSON.stringify(so.body));
  // The supervisor stops (voluntary withdrawal): at once, with Fero's wording.
  assert.equal((await p.sup.call('/api/app/supervisor/stop', {})).status, 400, 'needs confirming');
  const stop = await p.sup.call('/api/app/supervisor/stop', { confirm: true, reason: 'role_change' });
  assert.equal(stop.status, 200, JSON.stringify(stop.body));
  await settle();
  const ended = mailTo('gone@x.co').find((m) => m.subject === 'Your Wavelength supervisor status has ended');
  assert.match(ended.textbody, /remain part of your trainees’ historical portfolios/);
  const told = mailTo('trainee.gone@x.co').find((m) => /no longer available/.test(m.subject));
  assert.match(told.textbody, /1 open request has come back to you/);
  assert.ok(!/role/.test(told.textbody), 'the learner is never told the reason');
  const row = await env.DB.prepare('SELECT supervisor_id, returned_from, returned_reason FROM signoffs WHERE id = ?').bind(so.body.code).first();
  assert.deepEqual({ ...row }, { supervisor_id: null, returned_from: p.sid, returned_reason: 'supervisor_withdrew' });
  assert.equal((await p.sup.call('/api/app/supervise/signoff', { code: so.body.code, name: 'x', role: 'x', confirm: true, signature: SIG, decisions: { returnent01: 'confirmed' } })).status, 404);
  const list = (await p.learner.call('/api/app/signoffs')).body.signoffs.find((s) => s.id === so.body.code);
  assert.ok(list.returned, 'the app can offer reassign, one-off link or cancel');
  assert.equal((await p.learner.call('/api/app/signoff/reassign', { code: so.body.code, supervisorLink: link.id })).status, 400, 'not to an ended link');
  const relink = await p.learner.call('/api/app/signoff/relink', { code: so.body.code, supervisorName: 'Dr One Off' });
  assert.equal(relink.status, 200);
  assert.match(relink.body.link, /\/app\/sign\/#/);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.standing, 'withdrawn');
});

test('expiry: derived at once on the review date, then the daily job ends it, emails once and returns requests', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'exp@x.co');
  const link = (await p.learner.call('/api/app/supervisors')).body.supervisors[0];
  const as = await p.learner.call('/api/app/assessment/request', { pathway: 'famus', module: 'famus-thoracic', kind, supervisorLink: link.id });
  assert.equal(as.status, 200);
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(ukDate(), p.sid).run();
  assert.equal((await supervisorEligibility(env, p.sid)).ok, true, 'current to the end of the review day');
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), -1), p.sid).run();
  assert.equal((await supervisorEligibility(env, p.sid)).ok, false, 'not current the day after, before any job runs');
  assert.equal((await p.sup.call('/api/app/supervise/learner?id=' + p.lid)).status, 403);
  const first = await dailyLifecycle(env);
  assert.equal(first.expiry.expired, 1);
  await settle();
  const again = await dailyLifecycle(env);
  assert.equal(again.expiry.expired, 0, 'a second run changes nothing');
  await settle();
  assert.equal(subjects('exp@x.co').filter((s) => /expired/.test(s)).length, 1);
  assert.equal(subjects('trainee.exp@x.co').filter((s) => /no longer available/.test(s)).length, 1);
  const a = await env.DB.prepare('SELECT supervisor_id, returned_reason FROM assessments WHERE id = ?').bind(as.body.code).first();
  assert.deepEqual({ ...a }, { supervisor_id: null, returned_reason: 'supervisor_expired' });
  assert.equal((await p.sup.call('/api/app/supervisor')).body.standing, 'expired');
  const runs = (await env.DB.prepare("SELECT outcome FROM job_runs WHERE job = 'supervisor-daily'").all()).results;
  assert.deepEqual(runs.map((r) => r.outcome), ['ok', 'ok']);
});

test('renewal reminders: only the nearest of 60, 30 and 7 days, each once', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'rem@x.co');
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), 25), p.sid).run();
  assert.equal((await dailyLifecycle(env)).reminders.queued, 1);
  assert.equal((await dailyLifecycle(env)).reminders.queued, 0);
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), 6), p.sid).run();
  assert.equal((await dailyLifecycle(env)).reminders.queued, 1, 'the 7-day reminder is a new email');
  await settle();
  assert.deepEqual(subjects('rem@x.co').filter((s) => /renewal|ends in a week/.test(s)), ['Your Wavelength supervisor status is due for renewal', 'Your Wavelength supervisor status ends in a week']);
});

test('renewal grace: a complete renewal sent on time holds status for 30 days, never through a request for information', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'renew@x.co');
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), 10), p.sid).run();
  assert.equal((await p.sup.call('/api/app/supervisor')).body.canRenew, true);
  const start = await p.sup.call('/api/app/supervisor/renew', {});
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.application.kind, 'renewal');
  assert.equal(start.body.application.justification, EXPLAIN, 'pre-filled from the approved application');
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).body.step, 'changes');
  await p.sup.call('/api/app/supervisor/application', { nothingChanged: true });
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  const r = await appOf(env, p.sid);
  assert.equal(r.current_at_submit, 1);
  // Two weeks pass: it was sent before the review date, which has now gone by while the renewal waits.
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), -3), p.sid).run();
  await env.DB.prepare('UPDATE supervisor_applications SET submitted_at = ? WHERE id = ?').bind(new Date(Date.now() - 14 * 864e5).toISOString(), r.id).run();
  let st = await currentStatus(env, p.sid);
  assert.equal(st.approvals[0].current, true);
  assert.equal(st.approvals[0].grace, true);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.standing, 'renewal_review');
  assert.equal((await dailyLifecycle(env)).expiry.expired, 0, 'not expired inside the grace period');
  // Asking for more information ends the grace at once.
  await admin(env, { action: 'app_more', app: r.id, notes: 'Confirm your current employer.' });
  st = await currentStatus(env, p.sid);
  assert.equal(st.approvals[0].current, false);
  await p.sup.call('/api/app/supervisor/application', { changesNote: 'Same employer.' });
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  assert.equal((await appOf(env, p.sid)).current_at_submit, 0, 'resent after the review date: no grace');
  assert.equal((await currentStatus(env, p.sid)).approvals[0].current, false);
  // One-step confirmation is refused for a lapsed approval only when something it relies on is not current; here the
  // approval is past its date, so the reviewer approves with scopes, which renews from today.
  const ok = await admin(env, { action: 'app_approve', app: r.id, scope: ['famus:famus-thoracic'], notes: 'Renewed' });
  assert.match(ok.m, /Renewal approved until/);
  const row = await env.DB.prepare("SELECT review_on, last_renewed_at FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(p.sid).first();
  assert.equal(row.review_on, addMonths(ukDate(), 12));
  assert.ok(row.last_renewed_at);
});

test('confirm renewal renews the same scopes for 12 months from the current review date; a material change ends grace', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'conf@x.co');
  const review = addDays(ukDate(), 20);
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(review, p.sid).run();
  await p.sup.call('/api/app/supervisor/renew', {});
  await p.sup.call('/api/app/supervisor/application', { nothingChanged: true });
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  const r = await appOf(env, p.sid);
  assert.match(await html(env, '?tab=renewals'), new RegExp(`#${r.id}`));
  assert.match(await html(env, `?app=${r.id}`), /Confirm renewal/);
  assert.match((await admin(env, { action: 'grace_block', app: r.id, notes: 'Moved to a trust where they do not scan' })).m, /Grace period ended/);
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), -1), p.sid).run();
  assert.equal((await currentStatus(env, p.sid)).approvals[0].current, false, 'no grace after a material change');
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(review, p.sid).run();
  const ok = await admin(env, { action: 'app_confirm_renewal', app: r.id });
  assert.match(ok.m, /Renewal approved until/);
  const row = await env.DB.prepare("SELECT review_on FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(p.sid).first();
  assert.equal(row.review_on, addMonths(review, 12));
  await settle();
  assert.ok(subjects('conf@x.co').includes('Your Wavelength supervisor status has been renewed'));
});

test('a registration lapse pauses status at once; the supervisor is told the first day and learners only after 14 days', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'lapse@x.co');
  await env.DB.prepare("UPDATE professional_registrations SET status = 'not_current' WHERE learner_id = ?").bind(p.sid).run();
  assert.equal((await supervisorEligibility(env, p.sid)).ok, false);
  assert.equal((await dailyLifecycle(env)).lapses.started, 1);
  assert.equal((await dailyLifecycle(env)).lapses.started, 0);
  await settle();
  assert.equal(subjects('lapse@x.co').filter((s) => /paused/.test(s)).length, 1);
  assert.equal(subjects('trainee.lapse@x.co').filter((s) => /no longer available/.test(s)).length, 0);
  await env.DB.prepare('UPDATE supervisor_watch SET lapse_since = ? WHERE learner_id = ?').bind(addDays(ukDate(), -15), p.sid).run();
  await dailyLifecycle(env);
  await settle();
  assert.equal(subjects('trainee.lapse@x.co').filter((s) => /no longer available/.test(s)).length, 1);
  // Put right, it resumes on its own.
  await env.DB.prepare("UPDATE professional_registrations SET status = 'verified' WHERE learner_id = ?").bind(p.sid).run();
  assert.equal((await supervisorEligibility(env, p.sid)).ok, true);
  assert.equal((await dailyLifecycle(env)).lapses.cleared, 1);
});

test('administrative revocation of all status ends links and blocks one-off signing, unless recorded as permitted', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'rev@x.co');
  const r = await admin(env, { action: 'appr_revoke_all', learner: p.sid, notes: 'Fitness to practise concern', message: 'Your approval has been ended pending review.' });
  assert.match(r.m, /All supervisor status revoked.*1 learner link ended.*blocked/);
  await settle();
  assert.match(mailTo('rev@x.co').find((m) => /Change to your/.test(m.subject)).textbody, /pending review/);
  assert.equal((await p.learner.call('/api/app/supervisors')).body.supervisors.length, 0);
  assert.equal((await p.sup.call('/api/app/supervisor')).body.blocked, true);
  // Reinstating a scope lifts the block.
  const row = await env.DB.prepare("SELECT id FROM supervisor_approvals WHERE learner_id = ? AND status = 'revoked'").bind(p.sid).first();
  assert.match((await admin(env, { action: 'appr_reinstate', learner: p.sid, sid: row.id, notes: 'Concern resolved' })).m, /reinstated/);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_blocks WHERE learner_id = ? AND lifted_at IS NULL').bind(p.sid).first('n'), 0);

  // With one-off assessment recorded as permitted, no block applies to one-off links.
  const q = await approvedSupervisor(env, 'rev2@x.co');
  assert.match((await admin(env, { action: 'appr_revoke_all', learner: q.sid, notes: 'Left the trust', one_off: '1' })).m, /Say why/);
  assert.match((await admin(env, { action: 'appr_revoke_all', learner: q.sid, notes: 'Left the trust', one_off: '1', one_off_note: 'No concern about practice' })).m, /still permitted/);
  const other = await verifiedAccount(env, 'other2@x.co');
  await other.call('/api/app/sync', { entries: [{ id: 'oneoffent01', type: 'lung', date: '2026-09-01', supervision: 'direct' }] });
  const req = await other.call('/api/app/signoff/request', { entryIds: ['oneoffent01'], supervisorName: 'Dr Y', supervisorEmail: 'rev2@x.co' });
  const signed = await client(handleApp, env).call('/api/app/signoff/complete', { token: req.body.link.split('#')[1], name: 'Dr Y', role: 'Consultant', email: 'rev2@x.co', confirm: true, signature: SIG, decisions: { oneoffent01: 'confirmed' } });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  const v = (await client(handleApp, env).call('/api/app/verify?code=' + signed.body.code)).body;
  assert.match(JSON.stringify(v), /Self-declared \(not verified by Wavelength\)/);
});

test('revoking one scope of several leaves the rest and creates no block', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'part@x.co');
  await admin(env, { action: 'appr_add', learner: p.sid, scope: ['famus:famus-dvt'], notes: 'DVT too' });
  const dvt = await env.DB.prepare("SELECT id FROM supervisor_approvals WHERE learner_id = ? AND module = 'famus-dvt'").bind(p.sid).first();
  assert.equal((await admin(env, { action: 'appr_revoke', learner: p.sid, sid: dvt.id, notes: 'No DVT logbook' })).m, 'Approval revoked.');
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_blocks').first('n'), 0);
  assert.equal((await supervisorEligibility(env, p.sid)).ok, true);
  await settle();
  assert.match(mailTo('part@x.co').find((m) => /Change to your/.test(m.subject)).textbody, /Your approval for other areas is not affected/);
});

test('a registration exemption needs a recorded reason and is not a verification exemption', async () => {
  const env = makeEnv(ON);
  const p = await invitedSupervisor(env, 'exempt@x.co');
  await fillDraft(p.sup, { registration: undefined, noRegistration: { reason: 'Clinical scientist, not on a statutory register in this role', otherRegulator: '' } });
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  const a = await appOf(env, p.sid);
  assert.match((await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'x' })).m, /tick the registration exemption/);
  assert.match((await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'x', exempt: '1', exempt_reason: 'short' })).m, /Give the reason/);
  await env.DB.prepare("UPDATE learners SET email_status = 'unverified' WHERE id = ?").bind(p.sid).run();
  assert.match((await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'x', exempt: '1', exempt_reason: 'Checked employment with the head of department by phone.' })).m, /not confirmed their email/);
  await env.DB.prepare("UPDATE learners SET email_status = 'verified' WHERE id = ?").bind(p.sid).run();
  const ok = await admin(env, { action: 'app_approve', app: a.id, scope: ['famus:famus-thoracic'], notes: 'x', exempt: '1', exempt_reason: 'Checked employment with the head of department by phone.' });
  assert.match(ok.m, /Approved until/);
  const row = await env.DB.prepare("SELECT registration_exempt, exempt_reason FROM supervisor_approvals WHERE learner_id = ?").bind(p.sid).first();
  assert.equal(row.registration_exempt, 1);
  assert.equal((await supervisorEligibility(env, p.sid)).ok, true);
});

test('the admin console escapes everything an applicant typed, and records evidence downloads', async () => {
  const env = makeEnv(ON);
  const EVIL = '"><img src=x onerror=alert(1)>';
  const p = await invitedSupervisor(env, 'evil@x.co');
  await fillDraft(p.sup, { role: EVIL, organisation: EVIL, justification: EVIL + EXPLAIN, experience: { years: '2 to 5 years', scans: '100 to 500', deptRole: EVIL } });
  await p.sup.call('/api/app/supervisor/evidence', { kind: 'letter', description: EVIL, url: 'javascript:alert(1)' });
  await p.sup.call('/api/app/supervisor/submit', { declaration: true });
  const a = await appOf(env, p.sid);
  await admin(env, { action: 'app_more', app: a.id, notes: EVIL });
  let out = await html(env, `?app=${a.id}`) + await html(env, `?id=${p.sid}`);
  for (const t of ['new', 'more', 'renewals', 'attention', 'claims', 'ended', 'people', 'system']) out += await html(env, `?tab=${t}`);
  assert.ok(!out.includes('<img src=x'));
  assert.ok(!out.includes('javascript:'));
  assert.ok(!/<script/i.test(out));

  const bytes = new TextEncoder().encode('%PDF-1.4\n% test\n');
  const up = await handleApp(new Request(`https://thewavelength.co.uk/api/app/supervisor/evidence?subject=application&id=${a.id}&kind=certificate&description=Cert&name=cert.pdf&uploadId=u1`, { method: 'POST', headers: { Origin: 'https://thewavelength.co.uk', Cookie: p.sup.cookie, 'Content-Type': 'application/pdf' }, body: bytes }), env, ctx);
  assert.equal(up.status, 200, await up.clone().text());
  const ev = await env.DB.prepare("SELECT id FROM credential_evidence WHERE subject_type = 'application' AND file_name = 'cert.pdf'").first();
  assert.ok(await evidenceFile(env, ev.id, 'wavelength'));
  const audit = await env.DB.prepare("SELECT * FROM audit_events WHERE action = 'evidence.view'").first();
  assert.equal(audit.actor_type, 'admin');
  assert.equal(Number(audit.subject_id), p.sid);
});

test('emails that may not have gone are shown on the System tab and can be resent or marked sent', async () => {
  const env = makeEnv({ ...ON });
  await env.DB.prepare("INSERT INTO notification_log (key, kind, payload, status, attempts, created_at) VALUES ('k1', 'lapse', ?, 'unknown', 1, ?)").bind(JSON.stringify({ to: 'x@x.co', data: { firstName: 'X' } }), new Date().toISOString()).run();
  await env.DB.prepare("INSERT INTO notification_log (key, kind, payload, status, attempts, created_at) VALUES ('k2', 'lapse', ?, 'unknown', 1, ?)").bind(JSON.stringify({ to: 'y@x.co', data: {} }), new Date().toISOString()).run();
  assert.match(await html(env, '?tab=system'), /The daily job has not run yet/);
  assert.match(await html(env, '?tab=attention'), /2 emails may not have gone/);
  assert.equal((await admin(env, { action: 'notif_resend', key: 'k1' })).m, 'Sent.');
  assert.equal((await admin(env, { action: 'notif_mark_sent', key: 'k2' })).m, 'Marked as sent.');
  const rows = (await env.DB.prepare('SELECT status FROM notification_log ORDER BY key').all()).results.map((r) => r.status);
  assert.deepEqual(rows, ['sent', 'sent']);
  // An "unknown" row is never retried by the daily job.
  await env.DB.prepare("INSERT INTO notification_log (key, kind, payload, status, attempts, created_at) VALUES ('k3', 'lapse', ?, 'unknown', 1, ?)").bind(JSON.stringify({ to: 'z@x.co', data: {} }), new Date().toISOString()).run();
  await dailyLifecycle(env);
  assert.equal(await env.DB.prepare("SELECT status FROM notification_log WHERE key = 'k3'").first('status'), 'unknown');
});

test('an assessment can be amended once within 30 days; the old version stays and verify says it was superseded', async () => {
  const env = makeEnv(ON);
  const p = await approvedSupervisor(env, 'amend@x.co');
  const domain = LOGBOOK.assessmentDomains[0].id;
  const outcome = LOGBOOK.assessmentOutcomes.find((o) => o.id !== 'feedback' || kind === 'formative').id;
  const form = { name: 'Dr John Smith', role: 'Consultant', confirm: true, signature: SIG, outcome, domains: { [domain]: LOGBOOK.assessmentScale[0] } };
  const made = await p.sup.call('/api/app/supervise/assessment/new', { learnerId: p.lid, pathway: 'famus', module: 'famus-thoracic', kind, ...form });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal((await p.sup.call('/api/app/supervise/assessment/amend', { code: made.body.code, ...form })).status, 400, 'a reason is required');
  const am = await p.sup.call('/api/app/supervise/assessment/amend', { code: made.body.code, reason: 'Wrong outcome recorded', ...form });
  assert.equal(am.status, 200, JSON.stringify(am.body));
  assert.equal((await p.sup.call('/api/app/supervise/assessment/amend', { code: made.body.code, reason: 'Again', ...form })).status, 404);
  const old = (await client(handleApp, env).call('/api/app/verify?code=' + made.body.code)).body;
  assert.ok(old.superseded || /superseded/i.test(JSON.stringify(old)), JSON.stringify(old));
  await env.DB.prepare("UPDATE assessments SET signed_at = datetime('now', '-31 days') WHERE id = ?").bind(am.body.code).run();
  assert.equal((await p.sup.call('/api/app/supervise/assessment/amend', { code: am.body.code, reason: 'Late', ...form })).status, 400);
});

test('a deleted account leaves tombstones, so its codes verify as withdrawn by their owner', async () => {
  const env = makeEnv(ON);
  const l = await verifiedAccount(env, 'tomb@x.co');
  await l.call('/api/app/sync', { entries: [{ id: 'tombentry01', type: 'lung', date: '2026-09-01', supervision: 'direct' }] });
  const req = await l.call('/api/app/signoff/request', { entryIds: ['tombentry01'], supervisorName: 'Dr Z' });
  const done = await client(handleApp, env).call('/api/app/signoff/complete', { token: req.body.link.split('#')[1], name: 'Dr Z', role: 'Consultant', confirm: true, signature: SIG, decisions: { tombentry01: 'confirmed' } });
  assert.equal(done.status, 200);
  assert.equal((await l.call('/api/app/account/delete', { password: PASSWORD })).status, 200);
  const v = await client(handleApp, env).call('/api/app/verify?code=' + done.body.code);
  assert.match(JSON.stringify(v.body), /withdrawn/i);
  assert.ok(!JSON.stringify(v.body).includes('Dr Z'));
});

test('every lifecycle email renders without em dashes and without naming a body as the approver', () => {
  for (const k of ['app_received', 'renew_received', 'app_admin', 'app_more', 'app_approved', 'app_rejected', 'link_active', 'link_ended', 'renew', 'expired', 'withdrawn', 'revoked', 'lapse', 'unavailable', 'search_request']) {
    const m = render(k, { firstName: 'Ann', supervisor: 'Dr B', learner: 'Dr C', reviewOn: '2027-10-06', days: 30, areas: ['Lung'], returned: 2, note: 'x', reason: 'y', application: 1 });
    assert.ok(m && m.subject && m.text, k);
    assert.ok(!/—/.test(m.text + m.subject), `${k}: no em dashes`);
    assert.ok(!/(approved|accredited) by (RCEM|FAMUS|FUSIC)/.test(m.text), k);
  }
});
