// D-118: the phone-side encryption of the photo backup (src/app/mediabackup.js), run as the app runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/app/mediabackup.js', import.meta.url), 'utf8');
const root = { crypto: globalThis.crypto };
new Function('window', src)(root);
const MB = root.WLMB;
const FAST = 100000; // fewer rounds in tests; the app uses MB.ITER

test('the app wraps with 600,000 PBKDF2 rounds', () => assert.equal(MB.ITER, 600000));

test('the backup key unwraps only with the password it was wrapped with; kid names it without revealing it', async () => {
  const raw = MB.newKey();
  assert.equal(raw.length, 32);
  const w = await MB.wrap(raw, 'Correct horse battery 1!', FAST);
  assert.equal(w.iter, FAST);
  assert.match(w.kid, /^[0-9a-f]{16}$/);
  assert.equal(w.kid, await MB.kid(raw));
  assert.deepEqual(await MB.unwrap(w, 'Correct horse battery 1!'), raw);
  await assert.rejects(MB.unwrap(w, 'Correct horse battery 2!'));
  const again = await MB.wrap(raw, 'Correct horse battery 1!', FAST);
  assert.notEqual(again.wrapped, w.wrapped, 'a fresh salt and IV each time');
  assert.equal(again.kid, w.kid);
});

test('a photo record round-trips: every field, the picture, the preview and the edit base', async () => {
  const raw = MB.newKey();
  const rec = { id: 'img0000001', entryId: 'scan00000001', kind: 'image', w: 720, h: 1280, sha256: 'ab'.repeat(32), edits: { r: 1, m: false }, annot: { v: 1, ann: [{ t: 'arrow' }], burnt: true }, created: 1795075629096,
    blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' }), thumb: new Blob([new Uint8Array([9, 8])], { type: 'image/jpeg' }), base: new Blob([new Uint8Array([7])], { type: 'image/png' }) };
  const sealed = await MB.seal(raw, rec);
  const bytes = new Uint8Array(sealed);
  assert.deepEqual([...bytes.slice(0, 4)], [87, 76, 69, 49]);
  assert.ok(!Buffer.from(bytes).includes(Buffer.from('scan00000001')), 'nothing readable in what is uploaded');
  const back = await MB.open(raw, sealed, 'img0000001');
  for (const k of ['id', 'entryId', 'kind', 'w', 'h', 'sha256', 'created']) assert.equal(back[k], rec[k], k);
  assert.deepEqual(back.edits, rec.edits); assert.deepEqual(back.annot, rec.annot);
  assert.deepEqual(new Uint8Array(await back.blob.arrayBuffer()), new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(back.blob.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await back.thumb.arrayBuffer()), new Uint8Array([9, 8]));
  assert.equal(back.base.type, 'image/png');
});

test('a copy cannot be opened with another key, or passed off as another photo', async () => {
  const raw = MB.newKey();
  const sealed = await MB.seal(raw, { id: 'img0000001', blob: new Blob([new Uint8Array([1])]) });
  await assert.rejects(MB.open(MB.newKey(), sealed, 'img0000001'));
  await assert.rejects(MB.open(raw, sealed, 'img0000002'));
  const tampered = new Uint8Array(sealed.slice(0)); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(MB.open(raw, tampered.buffer, 'img0000001'));
});

test('sha is the hex SHA-256 of the picture', async () => {
  assert.equal(await MB.sha(new Blob([new TextEncoder().encode('abc')])), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
