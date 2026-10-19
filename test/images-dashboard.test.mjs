// 1.0.21 (owner, 19 October 2026): a supervisor sees the images of a dashboard request in the app. The learner's app
// encrypts them as before and, for a request sent to a linked supervisor's dashboard, also sends the key; only that
// supervisor, signed in, gets the key and the encrypted files, and everything is deleted when the request closes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, ctx, ORIGIN } from './helpers/env.mjs';
import { verifiedAccount } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';

globalThis.fetch = async () => new Response('{}');
const KEY = 'A'.repeat(43);
const CIPHER = new Uint8Array(64).map((_, i) => i);

async function linked(env, tag) {
  const learner = await verifiedAccount(env, `learner.${tag}@x.co`, { firstName: 'Sam', lastName: 'Trainee' });
  const sup = await verifiedAccount(env, `sup.${tag}@x.co`);
  const other = await verifiedAccount(env, `other.${tag}@x.co`);
  await learner.call('/api/app/sync', { entries: [{ id: `scan${tag}000001`, type: 'efast', date: '2026-09-01', supervision: 'mentored', findings: 'no free fluid', images: [{ id: 'i1', w: 10, h: 10, declared: true }] }] });
  await learner.call('/api/app/supervisors/add', { email: `sup.${tag}@x.co` });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  return { learner, sup, other, linkId: inv.id };
}
const raw = (who, path, body) => handleApp(new Request(ORIGIN + path, { method: body ? 'POST' : 'GET', headers: { Cookie: who.cookie, ...(body ? { Origin: ORIGIN, 'Content-Type': 'application/octet-stream' } : {}) }, body }), globalThis.__env, ctx);

async function sendWithImage(env, t, opts = {}) {
  globalThis.__env = env;
  const so = await t.learner.call('/api/app/signoff/request', { entryIds: [`scan${opts.tag}000001`], supervisorLink: opts.dash === false ? null : t.linkId });
  assert.equal(so.status, 200, JSON.stringify(so.body));
  const up = await raw(t.learner, `/api/app/signoff/image?code=${so.body.code}&entry=scan${opts.tag}000001&n=0`, CIPHER);
  assert.equal(up.status, 200);
  const done = await t.learner.call('/api/app/signoff/images', { code: so.body.code, images: [{ entry: `scan${opts.tag}000001`, n: 0, w: 10, h: 10 }], declared: true, key: opts.key === undefined ? KEY : opts.key });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return { code: so.body.code, done: done.body };
}

test('the addressed supervisor gets the images and the key in the app; nobody else does', async () => {
  const env = makeEnv();
  const t = await linked(env, 'a');
  const { code, done } = await sendWithImage(env, t, { tag: 'a' });
  assert.equal(done.dashboard, true);
  const view = await t.sup.call('/api/app/supervise/signoff?code=' + code);
  assert.equal(view.status, 200);
  assert.equal(view.body.imageKey, KEY);
  assert.deepEqual(view.body.images.map((i) => [i.entry, i.n]), [['scana000001', 0]]);
  const img = await raw(t.sup, `/api/app/supervise/signoff/image?code=${code}&entry=scana000001&n=0`);
  assert.equal(img.status, 200);
  assert.deepEqual(new Uint8Array(await img.arrayBuffer()), CIPHER, 'the encrypted bytes, unchanged');
  assert.equal(img.headers.get('Cache-Control'), 'no-store');
  // Another signed-in account, or the learner, cannot fetch them through the supervisor route.
  assert.equal((await raw(t.other, `/api/app/supervise/signoff/image?code=${code}&entry=scana000001&n=0`)).status, 410);
  assert.equal((await raw(t.learner, `/api/app/supervise/signoff/image?code=${code}&entry=scana000001&n=0`)).status, 410);
  assert.equal((await t.other.call('/api/app/supervise/signoff?code=' + code)).status, 404);
});

test('signing deletes the images and the key', async () => {
  const env = makeEnv();
  const t = await linked(env, 'b');
  const { code } = await sendWithImage(env, t, { tag: 'b' });
  assert.ok(await env.SHARED_IMAGES.get(`so:${code}:k`));
  const sig = 'data:image/png;base64,' + Buffer.from('sig').toString('base64');
  const s = await t.sup.call('/api/app/supervise/signoff', { code, name: 'Dr Sup', role: 'Consultant', basis: 'reviewed', confirm: true, signature: sig, decisions: { scanb000001: 'confirmed' } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(await env.SHARED_IMAGES.get(`so:${code}:k`), null);
  assert.equal(await env.SHARED_IMAGES.get(`so:${code}:m`), null);
  assert.equal(await env.SHARED_IMAGES.get(`so:${code}:scanb000001:0`), null);
});

test('cancelling deletes the key too; a link-only request never stores one', async () => {
  const env = makeEnv();
  const t = await linked(env, 'c');
  const { code } = await sendWithImage(env, t, { tag: 'c' });
  assert.equal((await t.learner.call('/api/app/signoff/cancel', { code })).status, 200);
  assert.equal(await env.SHARED_IMAGES.get(`so:${code}:k`), null);
  const link = await sendWithImage(env, t, { tag: 'c', dash: false });
  assert.equal(link.done.dashboard, false);
  assert.equal(await env.SHARED_IMAGES.get(`so:${link.code}:k`), null, 'a link the learner sends keeps the key in the link only');
});

test('an older app that sends no key: the supervisor is told the images came by link only', async () => {
  const env = makeEnv();
  const t = await linked(env, 'd');
  const { code } = await sendWithImage(env, t, { tag: 'd', key: null });
  const view = await t.sup.call('/api/app/supervise/signoff?code=' + code);
  assert.equal(view.body.imageKey, null);
  assert.equal(view.body.images.length, 1);
  const app = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
  assert.match(app, /The learner shared images by link only/);
  assert.match(app, /key: q\.dash \? b64u\(q\.raw\) : undefined/, 'the app sends the key only for a dashboard request');
});

test('the app: Cancel on Ask for more information goes back to the request; saving says what happens next', () => {
  const app = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
  assert.match(app, /bindDecline\(root, function \(\) \{ dashSignoff\(code, learnerId\); \}\)/);
  assert.match(app, /bindDecline\(root, function \(\) \{ dashAssess\(a, learnerId\); \}\)/);
  assert.match(app, /'Save and sign now: supervisor is with me'/);
  assert.match(app, /'Save as draft'/);
  assert.match(app, /name="suppick"/);
  assert.doesNotMatch(app, /<datalist id="supl">/, 'no plain browser list for the supervisor');
  assert.match(app, /id="melo"/, 'Log out on Me as well');
  assert.match(app, /timeout: 45000/);
});

test('privacy notice says plainly that Wavelength holds the key for dashboard requests', () => {
  const b = readFileSync(new URL('../build.js', import.meta.url), 'utf8');
  assert.match(b, /In a request sent to a linked supervisor's dashboard, we also hold the key/);
  assert.doesNotMatch(b, /We never see your scan photos/);
});
