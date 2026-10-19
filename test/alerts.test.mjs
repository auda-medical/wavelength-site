// Request and outcome notices (worker/alerts.js, 19 October 2026): a supervisor hears at once when a learner sends a
// sign-off or assessment request to their dashboard, gets one reminder after three days, and a learner hears at once
// when an assessment is signed or a request is declined. Email only names people and counts; nothing clinical; the
// existing setting (profile.notifyEmail = false) stops them; a notice never breaks the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount, idOf, SIG } from './helpers/verify.mjs';
import { requestReminders } from '../worker/alerts.js';
import { deliver } from '../worker/notify.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const mail = [];
globalThis.fetch = async (u, init) => { if (init && init.body) { try { mail.push(JSON.parse(init.body)); } catch { /* not an email */ } } return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 40));
const to = (addr) => mail.filter((m) => m.to && m.to[0].email_address.address === addr);
const pw = LOGBOOK.pathways.find((p) => p.id === 'famus');
const dom = LOGBOOK.assessmentDomains[0].id;

async function linked(env, tag) {
  const learner = await verifiedAccount(env, `learner.${tag}@x.co`, { firstName: 'Sam', lastName: 'Trainee' });
  const sup = await verifiedAccount(env, `sup.${tag}@x.co`);
  await learner.call('/api/app/sync', { entries: [
    { id: `scan${tag}000001`, type: 'efast', date: '2026-09-01', supervision: 'direct', findings: 'free fluid in Morison pouch' },
    { id: `scan${tag}000002`, type: 'lung', date: '2026-09-02', supervision: 'independent' },
  ] });
  await learner.call('/api/app/supervisors/add', { email: `sup.${tag}@x.co` });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  return { learner, sup, linkId: inv.id, lid: await idOf(env, `learner.${tag}@x.co`), sid: await idOf(env, `sup.${tag}@x.co`) };
}
const env0 = () => makeEnv({ ZEPTOMAIL_TOKEN: 'test' });

test('a sign-off request sent to a dashboard emails the supervisor at once, with a link to the dashboard and nothing clinical', async () => {
  const env = env0();
  const { learner, linkId } = await linked(env, 'a');
  const n0 = to('sup.a@x.co').length;
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scana000001', 'scana000002'], supervisorLink: linkId });
  assert.equal(so.status, 200, JSON.stringify(so.body));
  await settle();
  const got = to('sup.a@x.co').slice(n0);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /sent you 2 scans to sign off/);
  assert.match(got[0].htmlbody, /\/app\/#\/supervise/);
  assert.doesNotMatch(got[0].htmlbody + got[0].textbody, /Morison|free fluid|efast|lung/i, 'no findings or scan details');
  // A request by link only (no dashboard) sends nothing: the learner shares the link themselves.
  const n1 = mail.length;
  await learner.call('/api/app/signoff/request', { entryIds: ['scana000001'] });
  await settle();
  assert.equal(mail.length, n1);
});

test('an assessment request emails the supervisor; signing it emails the learner with a link to their assessments', async () => {
  const env = env0();
  const { learner, sup, linkId } = await linked(env, 'b');
  const as = await learner.call('/api/app/assessment/request', { pathway: 'famus', module: pw.modules[0].id, kind: 'formative', supervisorLink: linkId });
  assert.equal(as.body.toDashboard, true);
  await settle();
  assert.match(to('sup.b@x.co').pop().subject, /sent you an assessment to complete/);
  const n0 = to('learner.b@x.co').length;
  const done = await sup.call('/api/app/supervise/assessment', { code: as.body.code, outcome: 'feedback', domains: { [dom]: LOGBOOK.assessmentScale[0] }, name: 'Dr S', role: 'Consultant', confirm: true, signature: SIG });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  await settle();
  const got = to('learner.b@x.co').slice(n0);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /formative assessment has been signed/);
  assert.match(got[0].htmlbody, /\/app\/#\/assess/);
});

test('a declined request emails the learner without the reason; the setting stops the emails', async () => {
  const env = env0();
  const { learner, sup, linkId, sid } = await linked(env, 'c');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scanc000001'], supervisorLink: linkId });
  await settle();
  const n0 = to('learner.c@x.co').length;
  const dec = await sup.call('/api/app/supervise/request/decline', { kind: 'signoff', code: so.body.code, reason: 'I am on leave until December' });
  assert.equal(dec.status, 200, JSON.stringify(dec.body));
  await settle();
  const got = to('learner.c@x.co').slice(n0);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /could not take your sign-off request/);
  assert.doesNotMatch(got[0].htmlbody + got[0].textbody, /leave until December/, 'the reason stays in the app');
  assert.match(got[0].htmlbody, /\/app\/#\/outstanding/);
  // The supervisor turns sign-off emails off: the next request sends nothing to them, and still succeeds.
  await env.DB.prepare("UPDATE learners SET profile = json_set(COALESCE(profile, '{}'), '$.notifyEmail', json('false')) WHERE id = ?").bind(sid).run();
  const n1 = to('sup.c@x.co').length;
  const again = await learner.call('/api/app/signoff/request', { entryIds: ['scanc000002'], supervisorLink: linkId });
  assert.equal(again.status, 200);
  await settle();
  assert.equal(to('sup.c@x.co').length, n1);
});

test('a request still waiting three days on gets one reminder from the daily job, never two', async () => {
  const env = env0();
  const { learner, linkId } = await linked(env, 'd');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scand000001'], supervisorLink: linkId });
  await settle();
  const fresh = await requestReminders(env);
  assert.equal(fresh.queued, 0, 'not yet three days');
  await env.DB.prepare("UPDATE signoffs SET created_at = datetime('now', '-4 days') WHERE id = ?").bind(so.body.code).run();
  const n0 = to('sup.d@x.co').length;
  assert.equal((await requestReminders(env)).queued, 1);
  await deliver(env, null, 100);
  assert.equal((await requestReminders(env)).queued, 0, 'one reminder per request');
  await deliver(env, null, 100);
  const got = to('sup.d@x.co').slice(n0);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /Reminder: .* is waiting for your sign-off/);
});

test('a notice never breaks the request: an outbox failure still returns the request', async () => {
  const env = env0();
  const { learner, linkId } = await linked(env, 'e');
  const prep = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => { if (/notification_log/.test(sql)) throw new Error('outbox down'); return prep(sql); };
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scane000001'], supervisorLink: linkId });
  assert.equal(so.status, 200, JSON.stringify(so.body));
  assert.equal(so.body.toDashboard, true);
});
