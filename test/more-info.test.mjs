// "Ask for more information" (Release M, 19 October 2026, owner): a supervisor who cannot sign yet sends a dashboard
// request back without signing or ticking anything; the learner updates it and sends it back to the same supervisor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount, idOf } from './helpers/verify.mjs';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const mail = [];
globalThis.fetch = async (u, init) => { if (init && init.body) { try { mail.push(JSON.parse(init.body)); } catch { /* not an email */ } } return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 40));
const to = (addr) => mail.filter((m) => m.to && m.to[0].email_address.address === addr);
const pw = LOGBOOK.pathways.find((p) => p.id === 'famus');

async function linked(env, tag) {
  const learner = await verifiedAccount(env, `learner.${tag}@x.co`, { firstName: 'Sam', lastName: 'Trainee' });
  const sup = await verifiedAccount(env, `sup.${tag}@x.co`);
  await learner.call('/api/app/sync', { entries: [{ id: `scan${tag}000001`, type: 'efast', date: '2026-09-01', supervision: 'direct', findings: 'no free fluid' }] });
  await learner.call('/api/app/supervisors/add', { email: `sup.${tag}@x.co` });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  return { learner, sup, linkId: inv.id, lid: await idOf(env, `learner.${tag}@x.co`), sid: await idOf(env, `sup.${tag}@x.co`) };
}
const env0 = () => makeEnv({ ZEPTOMAIL_TOKEN: 'test' });

test('a supervisor asks for more information: nothing signed, back to the learner with the note, the learner hears', async () => {
  const env = env0();
  const { learner, sup, linkId, sid } = await linked(env, 'a');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scana000001'], supervisorLink: linkId });
  await settle();
  assert.equal((await sup.call('/api/app/supervise/request/more', { kind: 'signoff', code: so.body.code, note: 'ok' })).status, 400, 'a note is needed');
  const n0 = to('learner.a@x.co').length;
  const more = await sup.call('/api/app/supervise/request/more', { kind: 'signoff', code: so.body.code, note: 'Please add the images of each view.' });
  assert.equal(more.status, 200, JSON.stringify(more.body));
  assert.equal(more.body.state, 'more_info');
  const row = await env.DB.prepare('SELECT status, supervisor_id, returned_from, returned_reason, signature, decisions FROM signoffs WHERE id = ?').bind(so.body.code).first();
  assert.deepEqual([row.status, row.supervisor_id, row.returned_from, row.returned_reason, row.signature], ['pending', null, sid, 'more_info', null], 'nothing is signed');
  // The learner sees who asked and what for; their supervisor list carries the supervisor's account id to send it back.
  const list = (await learner.call('/api/app/signoffs')).body.signoffs.find((s) => s.id === so.body.code);
  assert.deepEqual([list.returned.reason, list.returned.note, list.returned.from, list.reviewState], ['more_info', 'Please add the images of each view.', sid, 'more_info']);
  const sups = (await learner.call('/api/app/supervisors')).body.supervisors;
  assert.equal(sups[0].supervisorId, sid);
  await settle();
  const got = to('learner.a@x.co').slice(n0);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /needs more information/);
  assert.doesNotMatch(got[0].htmlbody + got[0].textbody, /images of each view/, 'the note stays in the app');
  assert.match(got[0].htmlbody, /\/app\/#\/signoff/);
  // The request is off the supervisor's dashboard until it comes back.
  assert.equal((await sup.call('/api/app/supervise/signoff?code=' + so.body.code)).status, 404);
});

test('the learner sends it back to the same supervisor: a fresh request with the updated scan, the old one closes', async () => {
  const env = env0();
  const { learner, sup, linkId, sid } = await linked(env, 'b');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scanb000001'], supervisorLink: linkId });
  await sup.call('/api/app/supervise/request/more', { kind: 'signoff', code: so.body.code, note: 'Please add the images.' });
  // The learner updates the scan, then sends it back.
  await learner.call('/api/app/sync', { entries: [{ id: 'scanb000001', type: 'efast', date: '2026-09-01', supervision: 'direct', findings: 'no free fluid; images added' }] });
  await settle();
  const n0 = to('sup.b@x.co').length;
  const back = await learner.call('/api/app/signoff/request', { entryIds: ['scanb000001'], supervisorLink: linkId, replaces: so.body.code });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.toDashboard, true);
  const old = await env.DB.prepare('SELECT status FROM signoffs WHERE id = ?').bind(so.body.code).first();
  assert.equal(old.status, 'cancelled');
  const view = await sup.call('/api/app/supervise/signoff?code=' + back.body.code);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.match(JSON.stringify(view.body.entries), /images added/, 'the supervisor sees the updated scan');
  await settle();
  const got = to('sup.b@x.co').slice(n0);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /sent back the scans you asked about/);
  // A request that was not sent back for more information cannot be replaced.
  const r = await learner.call('/api/app/signoff/request', { entryIds: ['scanb000001'], supervisorLink: linkId, replaces: back.body.code });
  assert.equal(r.status, 404);
});

test('an assessment sent back for more information returns to the same supervisor with one tap', async () => {
  const env = env0();
  const { learner, sup, linkId, sid } = await linked(env, 'c');
  const as = await learner.call('/api/app/assessment/request', { pathway: 'famus', module: pw.modules[0].id, kind: 'formative', supervisorLink: linkId });
  assert.equal(as.body.toDashboard, true);
  const more = await sup.call('/api/app/supervise/request/more', { kind: 'assessment', code: as.body.code, note: 'Please add a reflection first.' });
  assert.equal(more.status, 200, JSON.stringify(more.body));
  const listed = (await learner.call('/api/app/assessments')).body.assessments.find((a) => a.id === as.body.code);
  assert.deepEqual([listed.returned.reason, listed.returned.from], ['more_info', sid]);
  await settle();
  const n0 = to('sup.c@x.co').length;
  const back = await learner.call('/api/app/assessment/resend', { code: as.body.code });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  const row = await env.DB.prepare('SELECT supervisor_id, returned_reason, returned_from FROM assessments WHERE id = ?').bind(as.body.code).first();
  assert.deepEqual([row.supervisor_id, row.returned_reason, row.returned_from], [sid, null, null]);
  await settle();
  assert.match(to('sup.c@x.co').slice(n0)[0].subject, /sent back the assessment you asked about/);
  assert.equal((await learner.call('/api/app/assessment/resend', { code: as.body.code })).status, 404, 'only once it was sent back');
});

test('only the supervisor it is addressed to can ask for more information', async () => {
  const env = env0();
  const { learner, linkId } = await linked(env, 'd');
  const other = await verifiedAccount(env, 'other.d@x.co');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scand000001'], supervisorLink: linkId });
  assert.equal((await other.call('/api/app/supervise/request/more', { kind: 'signoff', code: so.body.code, note: 'Please add images.' })).status, 404);
});
