// Encrypted backup format (src/app/backup.js, docs/backup-format.md) and the streaming ZIP it carries
// (src/app/zip.js). Runs the app's own scripts in Node, which has the same Web Crypto API as the phones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

globalThis.window = globalThis;
window.WLBackupArgon2 = await import('../src/app/vendor/noble-hashes/argon2.js');
for (const f of ['zip.js', 'backup.js']) new Function(readFileSync(new URL('../src/app/' + f, import.meta.url), 'utf8'))();
const { WLBackup, WLZip } = window;
const FAST = { m: 8192, t: 1, p: 1 }; // test-only Argon2id cost; the app uses WLBackup.ARGON

async function encrypt(data, pw = 'correct horse battery staple', opts = { test: FAST }) {
  const parts = [];
  const e = WLBackup.encryptor(pw, (p) => { parts.push(p); }, opts);
  for (let at = 0; at < data.length; at += 300000) await e.write(data.subarray(at, at + 300000));
  await e.finish();
  return Buffer.concat(parts);
}
async function decrypt(file, pw = 'correct horse battery staple') {
  const out = [];
  await WLBackup.decrypt(pw, async (o, n) => new Uint8Array(file.subarray(o, o + n)), file.length, (p) => { out.push(Buffer.from(p)); });
  return Buffer.concat(out);
}
const bytes = (n, seed = 1) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 255; return b; };
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code || e.message; } };

test('vendored Argon2id matches the RFC 9106 test vector', async () => {
  const tag = window.WLBackupArgon2.argon2id(new Uint8Array(32).fill(1), new Uint8Array(16).fill(2), { t: 3, m: 32, p: 4, dkLen: 32, key: new Uint8Array(8).fill(3), personalization: new Uint8Array(12).fill(4) });
  assert.equal(Buffer.from(tag).toString('hex'), '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
});

test('the app uses Argon2id at 64 MiB, 3 passes, and 1 MiB chunks', () => {
  assert.deepEqual(WLBackup.ARGON, { m: 65536, t: 3, p: 1 });
  assert.equal(WLBackup.CHUNK, 1048576);
});

test('round trip: small, empty, multi-chunk and an exact multiple of the chunk size', async () => {
  for (const n of [0, 1, 1000, 2.5 * 1048576, 2 * 1048576]) {
    const data = bytes(n);
    const file = await encrypt(data);
    assert.equal(file.subarray(0, 8).toString(), 'WLBACKUP');
    assert.ok(!file.includes(Buffer.from('correct horse')), 'passphrase in the file');
    assert.equal((await decrypt(file)).compare(data), 0, 'round trip of ' + n + ' bytes');
  }
});

test('same data and passphrase give a different file each time (fresh salt and nonces)', async () => {
  const a = await encrypt(bytes(5000)), b = await encrypt(bytes(5000));
  assert.notEqual(a.toString('hex'), b.toString('hex'));
});

test('wrong passphrase, tampering, truncation, extension and reordering are all refused', async () => {
  const file = await encrypt(bytes(3 * 1048576 + 100));
  assert.equal(await code(decrypt(file, 'wrong passphrase')), 'auth');
  const flip = (at) => { const c = Buffer.from(file); c[at] ^= 1; return c; };
  assert.equal(await code(decrypt(flip(48 + 1048576 + 16 + 500))), 'auth', 'changed byte in chunk 2');
  assert.equal(await code(decrypt(flip(20))), 'auth', 'changed salt');
  assert.equal(await code(decrypt(flip(36))), 'auth', 'changed nonce prefix');
  assert.equal(await code(decrypt(flip(file.length - 1))), 'auth', 'changed tag of the last chunk');
  const step = 1048576 + 16;
  assert.equal(await code(decrypt(file.subarray(0, 48 + 2 * step))), 'auth', 'cut at a chunk boundary');
  assert.equal(await code(decrypt(file.subarray(0, file.length - 7))), 'auth', 'cut mid-chunk');
  assert.equal(await code(decrypt(Buffer.concat([file, Buffer.alloc(32)]))), 'auth', 'extra bytes');
  const swapped = Buffer.concat([file.subarray(0, 48), file.subarray(48 + step, 48 + 2 * step), file.subarray(48, 48 + step), file.subarray(48 + 2 * step)]);
  assert.equal(await code(decrypt(swapped)), 'auth', 'chunks swapped');
});

test('nothing reaches the output before its chunk is verified', async () => {
  const file = Buffer.from(await encrypt(bytes(2 * 1048576 + 10)));
  file[48 + 3] ^= 1; // first chunk changed
  const got = [];
  await assert.rejects(WLBackup.decrypt('correct horse battery staple', async (o, n) => new Uint8Array(file.subarray(o, o + n)), file.length, (p) => { got.push(p); }));
  assert.equal(got.length, 0);
});

test('a newer format version, an unknown key derivation or extreme costs are refused before any work', async () => {
  const file = await encrypt(bytes(100));
  const v2 = Buffer.from(file); v2[8] = 2;
  assert.equal(await code(decrypt(v2)), 'version');
  const kdf = Buffer.from(file); kdf[9] = 9;
  assert.equal(await code(decrypt(kdf)), 'format');
  const huge = Buffer.from(file); huge.writeUInt32BE(4194304, 10); // 4 GiB of Argon2 memory
  assert.equal(await code(decrypt(huge)), 'format');
  assert.equal(await code(decrypt(Buffer.from('PK\x03\x04 not a backup at all, a zip'.padEnd(80)))), 'format');
});

test('PBKDF2 files (allowed by the format) also round trip', async () => {
  const data = bytes(70000);
  const parts = [];
  const e = WLBackup.encryptor('pass phrase', (p) => { parts.push(p); }, { kdf: 'pbkdf2', test: { iter: 100000 } });
  await e.write(data); await e.finish();
  const file = Buffer.concat(parts);
  assert.equal(file[9], 2);
  assert.equal((await decrypt(file, 'pass phrase')).compare(data), 0);
});

test('the app default cost (64 MiB Argon2id) works end to end', async () => {
  const data = bytes(4000);
  const file = await encrypt(data, 'a long passphrase for the default cost', {});
  assert.equal(file.readUInt32BE(10), 65536);
  assert.equal((await decrypt(file, 'a long passphrase for the default cost')).compare(data), 0);
});

test('passphrases are compared after Unicode normalisation (NFC)', async () => {
  const data = bytes(10);
  const file = await encrypt(data, 'café vert');
  assert.equal((await decrypt(file, 'café vert')).compare(data), 0);
});

test('the independent Python reader decrypts a file the app made', async (t) => {
  try { execFileSync('python3', ['-I', '-c', 'from cryptography.hazmat.primitives.kdf.argon2 import Argon2id'], { stdio: 'ignore' }); }
  catch { t.skip('python3 with cryptography 44+ (Argon2id) is not installed'); return; }
  const dir = mkdtempSync(path.join(tmpdir(), 'wlb-'));
  try {
    const data = bytes(1048576 + 4321);
    writeFileSync(path.join(dir, 'b.wlbackup'), await encrypt(data, 'python can read this'));
    const script = path.resolve('tools/backup-decrypt.py');
    execFileSync('python3', ['-I', '-c', `import getpass, runpy, sys; getpass.getpass = lambda p='': 'python can read this'; sys.argv = ['x', sys.argv[1], sys.argv[2]]; runpy.run_path(${JSON.stringify(script)}, run_name='__main__')`, path.join(dir, 'b.wlbackup'), path.join(dir, 'out.bin')], { stdio: 'pipe' });
    assert.equal(readFileSync(path.join(dir, 'out.bin')).compare(data), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('streaming ZIP: written a file at a time, read back as it arrives, with CRC checks', async () => {
  const parts = [];
  const w = WLZip.zipWriter((p) => { parts.push(Buffer.from(p)); });
  await w.add('wavelength-backup.json', JSON.stringify({ app: 'wavelength-logbook', version: 3 }));
  await w.add('images/a.jpg', bytes(300000, 7));
  await w.add('images/b.mp4', bytes(10, 9));
  await w.finish();
  const zip = Buffer.concat(parts);
  // The in-memory reader used for old backups reads it too.
  const old = WLZip.unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
  assert.deepEqual(Object.keys(old), ['wavelength-backup.json', 'images/a.jpg', 'images/b.mp4']);
  const got = {};
  const r = WLZip.unzipReader((name, data) => { got[name] = Buffer.from(data); });
  for (let at = 0; at < zip.length; at += 65536) await r.push(new Uint8Array(zip.subarray(at, at + 65536)));
  await r.end();
  assert.equal(got['images/a.jpg'].compare(bytes(300000, 7)), 0);
  assert.equal(got['images/b.mp4'].length, 10);
  const bad = Buffer.from(zip); bad[200] ^= 1; // inside images/a.jpg
  const r2 = WLZip.unzipReader(() => {});
  await assert.rejects(async () => { await r2.push(new Uint8Array(bad)); await r2.end(); }, /damaged/);
  const cut = WLZip.unzipReader(() => {});
  await assert.rejects(async () => { await cut.push(new Uint8Array(zip.subarray(0, 1000))); await cut.end(); }, /incomplete/);
});
