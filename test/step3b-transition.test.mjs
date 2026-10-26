// Rehearsal of Step 3b (SUPERVISOR_APPROVAL_REQUIRED from "false" to "true") on a database shaped like production on
// 7 October 2026: six accounts, one supervisor with two active links (accepted while enforcement was off), two signed
// one-off link sign-offs, logbook entries, no approvals, applications, assessments or pending requests. Records what
// the linked supervisor and their learners see before and after the switch, which actions stop, what keeps working,
// that the switch itself writes nothing, and that switching back restores everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { verifiedAccount, signup, SIG } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { dailyLifecycle } from '../worker/supervisor-lifecycle.js';
import { weeklySummary } from '../worker/weekly-summary.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const sent = [];
globalThis.fetch = async (u, init) => { sent.push(JSON.parse(init.body)); return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 30));
const kind = LOGBOOK.assessmentKinds[0].id;
const mod = LOGBOOK.pathways.find((p) => p.id === 'famus').modules[0];

function dump(env) {
  const db = env.DB.db;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  return Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all().map((r) => ({ ...r }))]));
}

async function productionShape() {
  const env = makeEnv({ SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', SUPERVISOR_SEARCH: 'false', ZEPTOMAIL_TOKEN: 'test' });
  // Three accounts with older, unconfirmed emails and three confirmed, as in production.
  for (const e of ['a1@x.co', 'a2@x.co', 'a4@x.co']) { await signup(env, e); await env.DB.prepare("UPDATE learners SET email_status = 'legacy_unverified' WHERE email = ?").bind(e).run(); }
  const learnerA = await verifiedAccount(env, 'a3@x.co');
  const learnerB = await verifiedAccount(env, 'a5@x.co');
  const sup = await verifiedAccount(env, 'sup@x.co');
  const ids = Object.fromEntries((await env.DB.prepare('SELECT id, email FROM learners').all()).results.map((r) => [r.email, r.id]));
  // Both learners invite the supervisor, who accepts while enforcement is off: two active links.
  for (const l of [learnerA, learnerB]) assert.equal((await l.call('/api/app/supervisors/add', { email: 'sup@x.co' })).status, 200);
  for (const inv of (await sup.call('/api/app/supervisors')).body.invites) assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).body.next, 'dashboard');
  // Logbook entries and two one-off link sign-offs, already signed.
  await learnerA.call('/api/app/sync', { entries: [{ id: 'prodentry01', type: 'lung', date: '2026-10-01', supervision: 'direct' }, { id: 'prodentry02', type: 'lung', date: '2026-10-02', supervision: 'direct' }] });
  await learnerB.call('/api/app/sync', { entries: [{ id: 'prodentry03', type: 'efast', date: '2026-10-03', supervision: 'direct' }] });
  const codes = [];
  for (const [l, entry] of [[learnerA, 'prodentry01'], [learnerA, 'prodentry02']]) {
    const r = await l.call('/api/app/signoff/request', { entryIds: [entry], supervisorName: 'Dr One Off' });
    assert.equal(r.status, 200);
    const done = await client(handleApp, env).call('/api/app/signoff/complete', { token: r.body.link.split('#')[1], name: 'Dr One Off', role: 'Consultant', confirm: true, signature: SIG, decisions: { [entry]: 'confirmed' } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    codes.push(r.body.code);
  }
  await settle();
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_links WHERE status = 'active'").first('n'), 2);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals').first('n'), 0);
  return { env, learnerA, learnerB, sup, ids, codes };
}

// Everything the two learners and the supervisor see, and whether each supervision action is allowed.
async function observe(p) {
  const { env, learnerA, learnerB, sup, ids, codes } = p;
  const a = (await learnerA.call('/api/app/supervisors')).body;
  const b = (await learnerB.call('/api/app/supervisors')).body;
  const s = (await sup.call('/api/app/supervisors')).body;
  const linkA = a.supervisors[0];
  return {
    learnerSees: [a, b].map((x) => ({ state: x.supervisors[0].state, label: x.supervisors[0].stateLabel, status: x.supervisors[0].status })),
    supervisorSees: { learners: s.learners.map((x) => ({ available: x.available })), me: s.me },
    supervisorMe: (await sup.call('/api/app/me')).body.supervisor,
    supervisorApplication: (await sup.call('/api/app/supervisor')).body.available,
    dashboardView: (await sup.call('/api/app/supervise/learner?id=' + ids['a3@x.co'])).status,
    dashboardViewError: (await sup.call('/api/app/supervise/learner?id=' + ids['a3@x.co'])).body.error || null,
    dashboardNewAssessment: (await sup.call('/api/app/supervise/assessment/new', { learnerId: ids['a3@x.co'], pathway: 'famus', module: mod.id, kind })).status,
    learnerDashboardSignoff: await learnerA.call('/api/app/signoff/request', { entryIds: ['prodentry01'], supervisorLink: linkA.id }).then((r) => ({ status: r.status, error: r.body.error || null })),
    learnerDashboardAssessment: await learnerA.call('/api/app/assessment/request', { pathway: 'famus', module: mod.id, kind, supervisorLink: linkA.id }).then((r) => ({ status: r.status, error: r.body.error || null })),
    learnerOneOffLink: (await learnerB.call('/api/app/signoff/request', { entryIds: ['prodentry03'], supervisorName: 'Dr Elsewhere' })).status,
    verifyExisting: await Promise.all(codes.map(async (c) => (await client(handleApp, env).call('/api/app/verify?code=' + c)).status)),
  };
}

test('Step 3b rehearsal: what the two linked learners and their supervisor see before and after enforcement', async () => {
  const p = await productionShape();
  const { env } = p;

  const before = await observe(p);
  assert.deepEqual(before.learnerSees, [
    { state: 'not_verified', label: 'Not yet verified by Wavelength', status: 'active' },
    { state: 'not_verified', label: 'Not yet verified by Wavelength', status: 'active' },
  ]);
  assert.deepEqual(before.supervisorSees.learners, [{ available: true }, { available: true }]);
  assert.equal(before.dashboardView, 200);
  assert.equal(before.learnerDashboardSignoff.status, 200);
  assert.equal(before.learnerDashboardAssessment.status, 200);

  // The requests the "before" pass created are cancelled, so the after pass starts from production's state again.
  await env.DB.prepare("DELETE FROM signoffs WHERE status = 'pending'").run();
  await env.DB.prepare("DELETE FROM assessments WHERE status = 'pending'").run();
  await env.DB.prepare("DELETE FROM rate_counters").run();
  const snapshot = dump(env);
  const mails = sent.length;

  // The switch. Nothing is written by flipping it: every effect is derived on read.
  env.SUPERVISOR_APPROVAL_REQUIRED = 'true';
  assert.deepEqual(dump(env), snapshot, 'turning enforcement on writes nothing');
  const after = await observe(p);

  // Learners: the link stays (status active), its label changes, and dashboard requests to it are refused with a
  // pointer to another supervisor or a one-off link. One-off links keep working, and old sign-offs still verify.
  assert.deepEqual(after.learnerSees, [
    { state: 'unavailable', label: 'Not available for new supervision', status: 'active' },
    { state: 'unavailable', label: 'Not available for new supervision', status: 'active' },
  ]);
  assert.deepEqual(after.learnerDashboardSignoff, { status: 400, error: 'This supervisor is not available for Wavelength supervision at present. Choose another supervisor, or send a one-off link.' });
  assert.deepEqual(after.learnerDashboardAssessment, { status: 400, error: 'This supervisor is not available for Wavelength supervision at present. Choose another supervisor, or send a one-off link.' });
  assert.equal(after.learnerOneOffLink, 200);
  assert.deepEqual(after.verifyExisting, [200, 200]);

  // Supervisor: both learners are listed but unavailable; the dashboard view and new dashboard assessments are refused;
  // the application journey is open and their standing is "none".
  assert.deepEqual(after.supervisorSees.learners, [{ available: false }, { available: false }]);
  assert.equal(after.supervisorSees.me.enforced, true);
  assert.equal(after.supervisorSees.me.standing, 'none');
  assert.equal(after.supervisorMe.required, true);
  assert.equal(after.supervisorMe.apply, true);
  assert.equal(after.supervisorMe.search, false);
  assert.equal(after.supervisorApplication, true);
  assert.equal(after.dashboardView, 403);
  assert.ok(after.dashboardViewError, 'a reason is shown');
  assert.equal(after.dashboardNewAssessment, 403);

  // While the supervisor's application is under review, the learners see "verification in progress".
  await p.sup.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Test Hospital',
    registration: { regulator: 'gmc', number: '7000001', profession: 'Doctor', organisation: 'Test Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: 'I have led the emergency department ultrasound programme for six years and supervise lung scans weekly.', evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'],
  });
  assert.equal((await p.sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  assert.equal((await p.learnerA.call('/api/app/supervisors')).body.supervisors[0].stateLabel, 'Supervisor verification in progress');
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals').first('n'), 0, 'applying approves nobody');
  await env.DB.prepare('DELETE FROM supervisor_applications').run();
  await env.DB.prepare("DELETE FROM professional_registrations").run();
  for (const t of ['notification_log', 'audit_events', 'verification_events', 'credential_evidence']) await env.DB.prepare(`DELETE FROM ${t}`).run();
  const appMails = sent.slice(mails).map((m) => m.subject);
  assert.ok(appMails.every((x) => /application/i.test(x)), 'only the application emails: ' + JSON.stringify(appMails));

  // The daily job with enforcement on: it records its run and changes nothing else. No links end, nothing is
  // returned, nobody is emailed. This week's owner summary (Monday to Wednesday) is sent first, so the job's
  // weekly-summary step finds it already sent on any day the test runs.
  await weeklySummary(env);
  await settle();
  const beforeJob = dump(env); delete beforeJob.job_runs;
  const mailsBeforeJob = sent.length;
  await dailyLifecycle(env);
  await settle();
  const afterJob = dump(env); delete afterJob.job_runs;
  assert.deepEqual(afterJob, beforeJob, 'the daily job changes nothing');
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_links WHERE status = 'active'").first('n'), 2, 'links are not ended by enforcement');
  assert.equal(sent.length, mailsBeforeJob, 'no emails from the daily job');

  // Switching back restores the earlier behaviour at once.
  env.SUPERVISOR_APPROVAL_REQUIRED = 'false';
  const back = await observe(p);
  assert.deepEqual(back.learnerSees, before.learnerSees);
  assert.equal(back.dashboardView, 200);
  assert.equal(back.learnerDashboardSignoff.status, 200);
});
