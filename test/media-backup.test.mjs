// D-118 (owner, 19 Nov 2026): automatic, end-to-end encrypted backup of photos and clips (worker/media-backup.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN, R2 } from './helpers/env.mjs';
import { verifiedAccount, idOf } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';

globalThis.fetch = async () => new Response('{}');
const SHA = 'a'.repeat(64);
const PW = 'Correct horse battery 1!';
const KID = '0123456789abcdef';
const KEY = (o = {}) => ({ salt: 'c2FsdA', iter: 600000, wrapped: 'AAAA', kid: KID, password: PW, ...o });
const on = () => makeEnv({ MEDIA_BACKUP: 'true', MEDIA: new R2() });
const raw = (env, who, path, { method = 'GET', body } = {}) => handleApp(new Request(ORIGIN + path, { method, headers: { Cookie: who.cookie, ...(method === 'POST' ? { Origin: ORIGIN, 'Content-Type': 'application/octet-stream' } : {}) }, body }), env, ctx);
const BYTES = new Uint8Array(100).map((_, i) => i);
async function withScan(env, email, images = [{ id: 'img0000001', w: 1, h: 1, declared: true }]) {
  const c = await verifiedAccount(env, email);
  await c.call('/api/app/sync', { entries: [{ id: 'scan00000001', type: 'efast', date: '2026-11-19', images }] });
  if (env.MEDIA_BACKUP === 'true') assert.equal((await c.call('/api/app/media/key', KEY())).status, 200);
  return c;
}

test('switched off unless MEDIA_BACKUP is true and the bucket exists; the account says which', async () => {
  const env = makeEnv({ MEDIA: new R2() });
  const c = await verifiedAccount(env, 'off@x.co');
  assert.equal((await c.call('/api/app/media/list')).status, 404);
  assert.equal((await c.call('/api/app/me')).body.mediaBackup, false);
  const env2 = on(); const c2 = await verifiedAccount(env2, 'on@x.co');
  assert.equal((await c2.call('/api/app/me')).body.mediaBackup, true);
});

test('the wrapped key is stored only with the account password; a different key needs reset and clears the backups', async () => {
  const env = on(); const c = await verifiedAccount(env, 'key@x.co');
  assert.equal((await c.call('/api/app/media/key')).body.key, null);
  assert.equal((await c.call('/api/app/media/key', KEY({ password: 'wrong' }))).status, 400, 'a mistyped password is refused');
  assert.equal((await c.call('/api/app/media/check', { password: 'wrong' })).status, 400);
  assert.equal((await c.call('/api/app/media/check', { password: PW })).status, 200);
  assert.equal((await c.call('/api/app/media/key', KEY())).status, 200);
  assert.deepEqual((await c.call('/api/app/media/key')).body.key, { salt: 'c2FsdA', iter: 600000, wrapped: 'AAAA', kid: KID });
  await c.call('/api/app/media/key', KEY({ salt: 'bmV3', wrapped: 'BBBB' })); // the same key under a new password
  const r = (await c.call('/api/app/media/key')).body;
  assert.equal(r.key.wrapped, 'BBBB'); assert.equal(r.prev.wrapped, 'AAAA');
  await c.call('/api/app/media/key', KEY({ salt: 'bmV3', wrapped: 'BBBB' })); // the same again keeps prev
  assert.equal((await c.call('/api/app/media/key')).body.prev.wrapped, 'AAAA');
  assert.equal((await c.call('/api/app/media/key', KEY({ iter: 10 }))).status, 400);
  // A phone with a different key cannot replace it by accident, nor upload with it.
  await c.call('/api/app/sync', { entries: [{ id: 'scan00000001', type: 'efast', date: '2026-11-19', images: [{ id: 'img0000001' }] }] });
  assert.equal((await raw(env, c, `/api/app/media?id=img0000001&entry=scan00000001&sha=${SHA}&kid=fedcba9876543210`, { method: 'POST', body: BYTES })).status, 409);
  assert.equal((await raw(env, c, `/api/app/media?id=img0000001&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES })).status, 200);
  const other = await c.call('/api/app/media/key', KEY({ kid: 'fedcba9876543210', wrapped: 'CCCC' }));
  assert.equal(other.status, 409); assert.equal(other.body.rekey, true);
  assert.equal((await c.call('/api/app/media/key', KEY({ kid: 'fedcba9876543210', wrapped: 'CCCC', reset: true }))).status, 200);
  assert.deepEqual((await c.call('/api/app/media/list')).body.items, [], 'a new key removes what the old key made');
  assert.equal(env.MEDIA.m.size, 0);
});

test('upload only for a photo the synced scan lists; list and download return it to the owner only', async () => {
  const env = on(); const c = await withScan(env, 'up@x.co');
  const other = await verifiedAccount(env, 'other@x.co');
  assert.equal((await raw(env, c, `/api/app/media?id=img0000001&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES })).status, 200);
  assert.equal((await raw(env, c, `/api/app/media?id=imgNOTHERE1&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES })).status, 409);
  const notSynced = await raw(env, c, `/api/app/media?id=img0000001&entry=scanNOTSYNC1&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES });
  assert.equal(notSynced.status, 409); assert.equal((await notSynced.json()).retry, true);
  const l = (await c.call('/api/app/media/list')).body;
  assert.deepEqual(l.items, [{ id: 'img0000001', entry: 'scan00000001', sha: SHA, bytes: 100 }]);
  const dl = await raw(env, c, '/api/app/media?id=img0000001');
  assert.equal(dl.status, 200); assert.equal(dl.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()), BYTES);
  assert.equal((await raw(env, other, '/api/app/media?id=img0000001')).status, 404, 'another account gets nothing');
  assert.equal((await raw(env, other, `/api/app/media?id=img0000001&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES })).status, 409, 'nor can it write into this scan');
});

test('the quota is enforced, counting a replaced photo once', async () => {
  const env = makeEnv({ MEDIA_BACKUP: 'true', MEDIA: new R2(), MEDIA_QUOTA_MB: '0.0002' }); // about 210 bytes
  const c = await withScan(env, 'q@x.co', [{ id: 'img0000001' }, { id: 'img0000002' }, { id: 'img0000003' }]);
  for (const id of ['img0000001', 'img0000002']) assert.equal((await raw(env, c, `/api/app/media?id=${id}&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES })).status, 200);
  const full = await raw(env, c, `/api/app/media?id=img0000003&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES });
  assert.equal(full.status, 413); assert.equal((await full.json()).full, true);
  assert.equal((await raw(env, c, `/api/app/media?id=img0000002&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES })).status, 200, 'replacing one does not count it twice');
});

test('removing a photo from its scan, deleting the scan, or deleting the account removes the backups', async () => {
  const env = on(); const c = await withScan(env, 'del@x.co', [{ id: 'img0000001' }, { id: 'img0000002' }]);
  const id = await idOf(env, 'del@x.co');
  for (const m of ['img0000001', 'img0000002']) await raw(env, c, `/api/app/media?id=${m}&entry=scan00000001&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES });
  const srv = (await c.call('/api/app/sync?since=0')).body.entries[0];
  await c.call('/api/app/sync', { entries: [{ id: 'scan00000001', type: 'efast', date: '2026-11-19', images: [{ id: 'img0000002' }], updatedAt: srv.updatedAt }] });
  assert.deepEqual((await c.call('/api/app/media/list')).body.items.map((x) => x.id), ['img0000002']);
  assert.equal(env.MEDIA.m.has(`m/${id}/img0000001`), false);
  const srv2 = (await c.call('/api/app/sync?since=0')).body.entries[0];
  await c.call('/api/app/sync', { entries: [{ id: 'scan00000001', deleted: true, updatedAt: srv2.updatedAt }] });
  assert.deepEqual((await c.call('/api/app/media/list')).body.items, []);
  assert.equal(env.MEDIA.m.size, 0);
  // Account deletion: a fresh scan and photo, the wrapped key, and a stray object never recorded.
  await c.call('/api/app/sync', { entries: [{ id: 'scan00000002', type: 'efast', date: '2026-11-19', images: [{ id: 'img0000009' }] }] });
  await raw(env, c, `/api/app/media?id=img0000009&entry=scan00000002&sha=${SHA}&kid=${KID}`, { method: 'POST', body: BYTES });
  await env.MEDIA.put(`m/${id}/stray000001`, BYTES);
  assert.equal((await c.call('/api/app/account/delete', { password: 'Correct horse battery 1!' })).status, 200);
  assert.equal(env.MEDIA.m.size, 0);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM media_keys').first('n'), 0);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM media_backups').first('n'), 0);
});
