// Typed signatures: a signer who cannot draw types their name instead. The request carries signatureKind 'typed',
// the record keeps it, and verify says so. A missing or unknown kind (older app builds) means drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { handleApp } from '../worker/app.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const PASSWORD = 'Correct horse battery 1!';
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
async function account(env, email) {
  const c = client(handleApp, env);
  const r = await c.call('/api/app/signup', { firstName: 'Test', lastName: email.split('@')[0], email, password: PASSWORD, terms: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const entry = (id) => ({ id, type: 'efast', date: '2026-09-01', supervision: 'direct' });
const pw = LOGBOOK.pathways.find((p) => p.modules && p.modules.length);
const kind = LOGBOOK.assessmentKinds[0].id;
const outcome = LOGBOOK.assessmentOutcomes.find((o) => o.id !== 'feedback' || kind === 'formative').id;
const form = { name: 'Dr Ada Lovelace', role: 'Consultant', confirm: true, signature: SIG, outcome, domains: { [LOGBOOK.assessmentDomains[0].id]: LOGBOOK.assessmentScale[0] } };
async function pulled(c, id) { return (await c.call('/api/app/sync?since=0')).body.entries.find((e) => e.id === id); }
async function verify(env, code) { return (await client(handleApp, env).call('/api/app/verify?code=' + code)).body; }

test('an in-person sign-off records a typed signature, and verify says so', async () => {
  const env = makeEnv();
  const a = await account(env, 'typed@x.co');
  await a.call('/api/app/sync', { entries: [entry('typedentry1')] });
  const r = await a.call('/api/app/signoff/inperson', { entryIds: ['typedentry1'], name: 'Dr Typed', role: 'Consultant', confirm: true, signature: SIG, signatureKind: 'typed', ratings: { typedentry1: { image: 'g' } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await pulled(a, 'typedentry1')).signoff.signatureKind, 'typed');
  const row = (await a.call('/api/app/signoffs')).body.signoffs.find((s) => s.id === r.body.code);
  assert.equal(row.signatureKind, 'typed');
  assert.deepEqual(row.ratings, { typedentry1: { image: 'g' } }, 'the stored kind does not leak into the ratings');
  const v = await verify(env, r.body.code);
  assert.equal(v.signatureKind, 'typed');
  assert.equal(v.handSigned, false, 'a typed name is not described as signed by hand');
});

test('a sign-off without signatureKind (older app builds) is recorded as drawn', async () => {
  const env = makeEnv();
  const a = await account(env, 'drawn@x.co');
  await a.call('/api/app/sync', { entries: [entry('drawnentry1')] });
  const r = await a.call('/api/app/signoff/inperson', { entryIds: ['drawnentry1'], name: 'Dr Drawn', role: 'Consultant', confirm: true, signature: SIG });
  assert.equal(r.status, 200);
  assert.equal((await pulled(a, 'drawnentry1')).signoff.signatureKind, 'drawn');
  assert.equal((await a.call('/api/app/signoffs')).body.signoffs[0].signatureKind, 'drawn');
  const v = await verify(env, r.body.code);
  assert.equal(v.signatureKind, 'drawn');
  assert.equal(v.handSigned, true);
});

test('an unknown kind, or a kind smuggled into ratings, is treated as drawn', async () => {
  const env = makeEnv();
  const a = await account(env, 'odd@x.co');
  await a.call('/api/app/sync', { entries: [entry('oddentry001')] });
  const r = await a.call('/api/app/signoff/inperson', { entryIds: ['oddentry001'], name: 'Dr Odd', role: 'Consultant', confirm: true, signature: SIG, signatureKind: 'stamp', ratings: { $signatureKind: 'typed' } });
  assert.equal(r.status, 200);
  assert.equal((await verify(env, r.body.code)).signatureKind, 'drawn');
  assert.equal((await pulled(a, 'oddentry001')).signoff.signatureKind, 'drawn');
});

test('a link sign-off records a typed signature', async () => {
  const env = makeEnv();
  const a = await account(env, 'linktyped@x.co');
  await a.call('/api/app/sync', { entries: [entry('linkentry01')] });
  const req = await a.call('/api/app/signoff/request', { entryIds: ['linkentry01'] });
  const token = req.body.link.split('#')[1];
  const done = await client(handleApp, env).call('/api/app/signoff/complete', { token, name: 'Dr Link', role: 'Consultant', confirm: true, signature: SIG, signatureKind: 'typed', decisions: { linkentry01: 'confirmed' } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal((await pulled(a, 'linkentry01')).signoff.signatureKind, 'typed');
  assert.equal((await verify(env, done.body.code)).signatureKind, 'typed');
});

test('assessments record the signature kind in person and by link, defaulting to drawn', async () => {
  const env = makeEnv();
  const a = await account(env, 'asmtyped@x.co');
  const typed = await a.call('/api/app/assessment/inperson', { ...form, pathway: pw.id, module: pw.modules[0].id, kind, signatureKind: 'typed' });
  assert.equal(typed.status, 200, JSON.stringify(typed.body));
  const drawn = await a.call('/api/app/assessment/inperson', { ...form, pathway: pw.id, module: pw.modules[0].id, kind });
  assert.equal(drawn.status, 200);
  const req = await a.call('/api/app/assessment/request', { pathway: pw.id, module: pw.modules[0].id, kind });
  const link = await client(handleApp, env).call('/api/app/assessment/complete', { ...form, token: req.body.link.split('#')[1], signatureKind: 'typed' });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  const list = (await a.call('/api/app/assessments')).body.assessments;
  const by = (c) => list.find((x) => x.id === c);
  assert.equal(by(typed.body.code).signatureKind, 'typed');
  assert.equal(by(typed.body.code).data.signatureKind, 'typed');
  assert.equal(by(drawn.body.code).signatureKind, 'drawn');
  assert.equal(by(link.body.code).signatureKind, 'typed');
  const v = await verify(env, typed.body.code);
  assert.equal(v.signatureKind, 'typed');
  assert.equal(v.handSigned, false);
  assert.equal((await verify(env, drawn.body.code)).signatureKind, 'drawn');
});

test('a linked supervisor\'s dashboard sign-off and assessment record a typed signature', async () => {
  const env = makeEnv();
  const learner = await account(env, 'dashl@x.co');
  const sup = await account(env, 'dashs@x.co');
  await learner.call('/api/app/sync', { entries: [entry('dashentry01')] });
  await learner.call('/api/app/supervisors/add', { email: 'dashs@x.co' });
  const invite = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: invite.id })).status, 200);
  const linkId = (await learner.call('/api/app/supervisors')).body.supervisors[0].id;
  const req = await learner.call('/api/app/signoff/request', { entryIds: ['dashentry01'], supervisorLink: linkId });
  assert.equal(req.body.toDashboard, true);
  const so = await sup.call('/api/app/supervise/signoff', { code: req.body.code, name: 'Dr Dash', role: 'Consultant', confirm: true, signature: SIG, signatureKind: 'typed', decisions: { dashentry01: 'confirmed' } });
  assert.equal(so.status, 200, JSON.stringify(so.body));
  assert.equal((await pulled(learner, 'dashentry01')).signoff.signatureKind, 'typed');
  assert.equal((await verify(env, so.body.code)).signatureKind, 'typed');
  const { id: lid } = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind('dashl@x.co').first();
  const as = await sup.call('/api/app/supervise/assessment/new', { ...form, learnerId: lid, pathway: pw.id, module: pw.modules[0].id, kind, signatureKind: 'typed' });
  assert.equal(as.status, 200, JSON.stringify(as.body));
  assert.equal((await verify(env, as.body.code)).signatureKind, 'typed');
});
