// Phone notifications (worker/push.js, 1.0.20): off unless PUSH_NOTIFY is 'true' and the Firebase service account is
// set; the same events as the emails; names and counts only; tokens dropped when Firebase says they are gone; the
// phone switch independent of the email switch; devices removed with the account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount, idOf, PASSWORD } from './helpers/verify.mjs';
import { pushText } from '../worker/push.js';

// A throwaway service account (a key made for this test only).
const kp = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pk = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
const SA = JSON.stringify({ project_id: 'wavelength-test', client_email: 'push@wavelength-test.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pk.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n` });

const sent = [], mail = [];
let gone = new Set();
globalThis.fetch = async (u, init) => {
  const url = String(u);
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    assert.match(String(init.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=[\w-]+\.[\w-]+\.[\w-]+$/);
    return new Response(JSON.stringify({ access_token: 'test-access', expires_in: 3600 }));
  }
  if (url.startsWith('https://fcm.googleapis.com/v1/projects/wavelength-test/messages:send')) {
    const m = JSON.parse(init.body).message;
    assert.equal(init.headers.Authorization, 'Bearer test-access');
    if (gone.has(m.token)) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 });
    sent.push(m); return new Response('{"name":"projects/x/messages/1"}');
  }
  if (init && init.body) { try { mail.push(JSON.parse(init.body)); } catch { /* other */ } }
  return new Response('{}');
};
const settle = () => new Promise((r) => setTimeout(r, 50));
const ON = { ZEPTOMAIL_TOKEN: 'test', PUSH_NOTIFY: 'true', FCM_SERVICE_ACCOUNT: SA };

async function linked(env, tag) {
  const learner = await verifiedAccount(env, `learner.${tag}@x.co`, { firstName: 'Sam', lastName: 'Trainee' });
  const sup = await verifiedAccount(env, `sup.${tag}@x.co`);
  await learner.call('/api/app/sync', { entries: [{ id: `scan${tag}000001`, type: 'efast', date: '2026-09-01', supervision: 'direct', findings: 'free fluid in Morison pouch' }] });
  await learner.call('/api/app/supervisors/add', { email: `sup.${tag}@x.co` });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  await sup.call('/api/app/supervisors/accept', { id: inv.id });
  return { learner, sup, linkId: inv.id, lid: await idOf(env, `learner.${tag}@x.co`), sid: await idOf(env, `sup.${tag}@x.co`) };
}

test('off by default: no device registered and nothing sent until switched on', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const { learner, sup, linkId } = await linked(env, 'a');
  assert.equal((await sup.call('/api/app/push/register', { token: 'tok-a:sup', platform: 'android' })).status, 200);
  const n0 = sent.length;
  await learner.call('/api/app/signoff/request', { entryIds: ['scana000001'], supervisorLink: linkId });
  await settle();
  assert.equal(sent.length, n0, 'PUSH_NOTIFY is off');
});

test('a request reaches the supervisor\'s phone with names only and the learner page (as from Home) as the screen to open', async () => {
  const env = makeEnv(ON);
  const { learner, sup, linkId, lid } = await linked(env, 'b');
  assert.equal((await sup.call('/api/app/push/register', { token: 'tok-b:sup', platform: 'ios', version: '1.0.20' })).body.ok, true);
  assert.equal((await sup.call('/api/app/push/register', { token: 'bad token!', platform: 'android' })).body.ok, false);
  const n0 = sent.length;
  await learner.call('/api/app/signoff/request', { entryIds: ['scanb000001'], supervisorLink: linkId });
  await settle();
  const m = sent.slice(n0);
  assert.equal(m.length, 1);
  assert.equal(m[0].token, 'tok-b:sup');
  assert.equal(m[0].notification.title, 'Sign-off request');
  assert.equal(m[0].notification.body, 'Sam Trainee sent you a scan to sign off.');
  assert.equal(m[0].data.url, `/app/#/supervise/${lid}`);
  assert.doesNotMatch(JSON.stringify(m[0]), /Morison|free fluid|efast/i, 'nothing clinical');
  // The email button opens the same screen.
  assert.match(mail.filter((x) => x.to && x.to[0].email_address.address === 'sup.b@x.co').pop().htmlbody, new RegExp(`/app/#/supervise/${lid}`));
});

test('sign-off outcomes reach the learner\'s phone even with sign-off emails off; a gone token is forgotten', async () => {
  const env = makeEnv(ON);
  const { learner, sup, linkId, lid } = await linked(env, 'c');
  await learner.call('/api/app/push/register', { token: 'tok-c:old', platform: 'android' });
  await learner.call('/api/app/push/register', { token: 'tok-c:new', platform: 'android' });
  await learner.call('/api/app/profile', { profile: { notifyEmail: false } });
  gone = new Set(['tok-c:old']);
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scanc000001'], supervisorLink: linkId });
  const n0 = sent.length, m0 = mail.length;
  const SIG = 'data:image/png;base64,' + Buffer.from('sig').toString('base64');
  const done = await sup.call('/api/app/supervise/signoff', { code: so.body.code, decisions: { scanc000001: 'query' }, name: 'Dr S', role: 'Consultant', confirm: true, signature: SIG, basis: 'reviewed' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  await settle();
  const m = sent.slice(n0).filter((x) => x.token.startsWith('tok-c'));
  assert.deepEqual(m.map((x) => [x.token, x.notification.title]), [['tok-c:new', 'Scan queried']]);
  assert.equal(m[0].data.url, '/app/#/log?s=todo');
  assert.equal(mail.slice(m0).filter((x) => x.to && x.to[0].email_address.address === 'learner.c@x.co').length, 0, 'email off');
  const left = await env.DB.prepare('SELECT token FROM push_devices WHERE learner_id = ? ORDER BY token').bind(lid).all();
  assert.deepEqual(left.results.map((r) => r.token), ['tok-c:new'], 'the token Firebase no longer knows is deleted');
});

test('signing out on a phone, and deleting the account, remove its devices', async () => {
  const env = makeEnv(ON);
  const { learner, lid } = await linked(env, 'd');
  await learner.call('/api/app/push/register', { token: 'tok-d:1', platform: 'android' });
  await learner.call('/api/app/push/register', { token: 'tok-d:2', platform: 'ios' });
  await learner.call('/api/app/push/unregister', { token: 'tok-d:1' });
  const n = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_devices WHERE learner_id = ?').bind(lid).first()).n;
  assert.equal(await n(), 1);
  const del = await learner.call('/api/app/account/delete', { password: PASSWORD });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(await n(), 0);
});

test('without migration 0018 nothing breaks: registering says not yet, account deletion still works', async () => {
  const env = makeEnv(ON, { skipMigrations: ['0018_push_devices.sql'] });
  const { learner } = await linked(env, 'e');
  const r = await learner.call('/api/app/push/register', { token: 'tok-e:1', platform: 'android' });
  assert.equal(r.body.ok, false);
  assert.equal((await learner.call('/api/app/account/delete', { password: PASSWORD })).status, 200);
});

test('every notice has a short text with names only', () => {
  for (const k of ['req_signoff', 'req_assess', 'rem_signoff', 'rem_assess', 'req_resent', 'as_signed', 'req_declined', 'req_more', 'so_done']) {
    const t = pushText(k, { learner: 'Sam Trainee', supervisor: 'Dr S', count: 2, kind: 'Formative assessment', what: 'so', lid: 7 });
    assert.ok(t && t.title && t.body.length <= 120 && /^\/app\/#\//.test(t.url), k);
  }
});
