// Encrypted backup and restore in the store app, without a phone: the real bundle over the stand-in native bridge
// (tools/native-harness.mjs) and a local Worker. Dummy data only. Checks that the file the app writes is
// encrypted, decrypts to the logbook and media, restores on a second phone without duplicates, refuses a wrong
// passphrase and a changed file, and that an old unencrypted ZIP still restores after a warning.
//
// Setup: node mobile/scripts/build-www.mjs, then node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-backup.mjs [results.json] [http://localhost:8787]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-backup.mjs');
globalThis.window = globalThis;
window.WLBackupArgon2 = await import('../src/app/vendor/noble-hashes/argon2.js');
for (const f of ['zip.js', 'backup.js']) new Function(fs.readFileSync(new URL('../src/app/' + f, import.meta.url), 'utf8'))();

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-e2e-backup-'));
const PASS = 'orange tiger lamp river';
const NOTE = 'Dummy reflection text for the encryption check 7Q4';

const t = Date.now();
const email = `backup${t}@example.com`;
const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
const su = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'Backup', email, password: 'Long-password-1', terms: true }) });
const token = su.headers.get('X-Wavelength-Token');
const prof = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], onboarded: true } }) }).then((r) => r.json());
const accId = prof.account.id;

// Every toast the app shows, kept in window.__toasts (toasts vanish after a few seconds).
const TOASTS = `addEventListener('DOMContentLoaded', () => { window.__toasts = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true }); });`;
const toasts = (page) => page.evaluate(() => (window.__toasts || []).join(' / '));
async function phone() {
  const { ctx, page } = await newApp(390, 844, { init: [TOASTS] });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })), token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}
const idb = (page, store) => page.evaluate(([id, st]) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction(st).objectStore(st).getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map((x) => ({ id: x.id, entryId: x.entryId, size: x.blob ? x.blob.size : undefined, kind: x.kind, sha256: x.sha256 }))); }; }; }), [accId, store]);

// ---------- Phone A: a scan with a photo and a clip, then an encrypted backup ----------
const A = await phone();
await A.page.evaluate(() => { location.hash = '#/new'; });
await A.page.waitForSelector('label[for=t0]');
await A.page.click('label[for=t0]');
await A.page.waitForSelector('#rest:not([hidden])');
await A.page.locator('input[name=supervision]').first().check({ force: true });
await A.page.fill('#refl', NOTE);
await A.page.click('form button[type=submit]');
await A.page.waitForFunction(() => location.hash === '#/' && document.querySelector('.toast.act a[href^="#/entry/"]'), null, { timeout: 15000 });
const entryId = await A.page.evaluate(() => document.querySelector('.toast.act a[href^="#/entry/"]').getAttribute('href').split('/')[2]);
// Media as the camera hand-off would leave it (dummy bytes, not a patient image).
await A.page.evaluate(([id, eid]) => new Promise((ok) => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#0A1526'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#5FB3B3'; g.fillRect(10, 10, 20, 20);
  c.toBlob((jpg) => {
    const clip = new Blob([new Uint8Array(250000).map((_, i) => (i * 7) & 255)], { type: 'video/mp4' });
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const tx = r.result.transaction('images', 'readwrite'); const st = tx.objectStore('images');
      st.put({ id: 'imgdummy01', entryId: eid, blob: jpg, thumb: jpg, w: 64, h: 48, kind: 'image', created: Date.now() });
      st.put({ id: 'clipdummy1', entryId: eid, blob: clip, thumb: jpg, w: 64, h: 48, kind: 'clip', dur: 3, created: Date.now() });
      tx.oncomplete = () => { r.result.close(); ok(); }; };
  }, 'image/jpeg', 0.8);
}), [accId, entryId]);
await A.page.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((s) => s.remove()));
await A.page.waitForTimeout(1500);

await A.page.evaluate(() => { location.hash = '#/backup'; });
await A.page.waitForSelector('#bkf');
await A.page.fill('#bkp', 'short');
await A.page.fill('#bkp2', 'short');
await A.page.check('#bkok');
await A.page.click('#bk');
const shortErr = await A.page.evaluate(() => (document.querySelector('#bkf .err:not([hidden])') || {}).textContent || '');
record('B1', 'A passphrase under 10 characters is refused', /at least 10/i.test(shortErr), `message: "${shortErr}"`);
await A.page.fill('#bkp', PASS);
await A.page.fill('#bkp2', PASS);
const t0 = Date.now();
await A.page.click('#bk');
const made = await A.page.waitForSelector('text=Encrypted backup created', { timeout: 60000 }).then(() => true, () => false);
const ms = Date.now() - t0;
const files = await A.page.evaluate(() => window.__files || {});
const name = Object.keys(files).find((k) => /^backup\/Wavelength-backup-.*\.wlbackup$/.test(k));
const file = name ? Buffer.concat(files[name].map((b) => Buffer.from(b, 'base64'))) : Buffer.alloc(0);
record('B2', 'Backup created in the app cache as one .wlbackup file, without claiming it was saved', made && !!name && file.length > 250000, `${name || 'no file'}, ${file.length} bytes, ${ms} ms in headless Chromium (64 MiB Argon2id)`);
record('B3', 'The file is encrypted: no logbook text or media bytes in it', file.subarray(0, 8).toString() === 'WLBACKUP' && !file.includes(Buffer.from(NOTE)) && !file.includes(Buffer.from('wavelength-backup.json')) && file.readUInt32BE(10) === 65536, `magic ${file.subarray(0, 8).toString()}, Argon2id memory ${file.readUInt32BE(10)} KiB`);
const plain = [];
await WLBackup.decrypt(PASS, async (o, n) => new Uint8Array(file.subarray(o, o + n)), file.length, (p) => { plain.push(Buffer.from(p)); });
const zip = Buffer.concat(plain);
const inside = WLZip.unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
const man = JSON.parse(Buffer.from(inside['wavelength-backup.json']).toString());
const clipFile = man.images.find((i) => i.id === 'clipdummy1');
record('B4', 'Decrypted with the passphrase: the scan, its photo and its clip are all inside', man.version === 3 && man.entries.some((e) => e.id === entryId && e.reflection === NOTE) && inside['images/imgdummy01.jpg'] && clipFile && inside[clipFile.file].length === 250000, `entries ${man.entries.length}, files ${Object.keys(inside).length}`);
const bfile = path.join(tmp, name.split('/')[1]);
fs.writeFileSync(bfile, file);
const homeNudge = await A.page.evaluate(() => { location.hash = '#/'; return new Promise((r) => setTimeout(() => r(document.body.innerText), 600)); });
record('B5', 'Home no longer shows the amber backup warning once a backup file exists', !/Photos and clips are only on this phone/.test(homeNudge), 'home checked');
await A.ctx.close();

// ---------- Phone B: same account, a new phone. Restore the encrypted file. ----------
const B = await phone();
const before = await idb(B.page, 'images');
await B.page.evaluate(() => { location.hash = '#/backup'; });
await B.page.waitForSelector('#rf', { state: 'attached' });
await B.page.setInputFiles('#rf', bfile);
await B.page.waitForSelector('#rpf');
await B.page.fill('#rpp', 'not the passphrase');
await B.page.click('#rpf button.teal');
const wrong = await B.page.waitForSelector('#rpf .err:not([hidden])', { timeout: 60000 }).then((e) => e.textContent(), () => '');
record('B6', 'Wrong passphrase: refused with a clear message, nothing restored', /Wrong passphrase/.test(wrong) && (await idb(B.page, 'images')).length === before.length, `message: "${wrong}"`);
await B.page.fill('#rpp', PASS);
await B.page.click('#rpf button.teal');
await B.page.waitForFunction(() => (window.__toasts || []).some((x) => /Restored/.test(x)), null, { timeout: 60000 }).catch(() => {});
const toast1 = await toasts(B.page);
await B.page.evaluate(() => { window.__toasts = []; });
const after = await idb(B.page, 'images');
record('B7', 'Correct passphrase: photo and clip restored to their scan', after.some((x) => x.id === 'imgdummy01' && x.entryId === entryId) && after.some((x) => x.id === 'clipdummy1' && x.size === 250000), `media on phone B: ${after.length}; toast: "${toast1}"`);
// Restore the same file again: nothing duplicated, nothing overwritten.
await B.page.evaluate(() => { location.hash = '#/backup'; });
await B.page.waitForSelector('#rf', { state: 'attached' });
await B.page.setInputFiles('#rf', bfile);
await B.page.waitForSelector('#rpf');
await B.page.fill('#rpp', PASS);
await B.page.click('#rpf button.teal');
await B.page.waitForFunction(() => (window.__toasts || []).some((x) => /Restored/.test(x)), null, { timeout: 60000 }).catch(() => {});
const toast2 = await toasts(B.page);
const again = await idb(B.page, 'images');
const entriesB = await idb(B.page, 'entries');
record('B8', 'Restoring the same backup twice adds nothing twice', again.length === after.length && entriesB.filter((e) => e.id === entryId).length === 1 && /already on this device/.test(toast2), `media ${again.length}, copies of the scan ${entriesB.filter((e) => e.id === entryId).length}; toast: "${toast2}"`);
// A changed file is refused.
const bad = Buffer.from(file); bad[bad.length - 100] ^= 1;
const badFile = path.join(tmp, 'changed.wlbackup'); fs.writeFileSync(badFile, bad);
await B.page.evaluate(() => { location.hash = '#/backup'; });
await B.page.waitForSelector('#rf', { state: 'attached' });
await B.page.setInputFiles('#rf', badFile);
await B.page.waitForSelector('#rpf');
await B.page.fill('#rpp', PASS);
await B.page.click('#rpf button.teal');
const tam = await B.page.waitForSelector('#rpf .err:not([hidden])', { timeout: 60000 }).then((e) => e.textContent(), () => toasts(B.page));
record('B9', 'A changed backup file is refused as changed or damaged', /changed or damaged/.test(tam), `message: "${tam}"`);
await B.ctx.close();

// ---------- Phone C: an old unencrypted ZIP (version 2, as 1.0.8 made) ----------
const C = await phone();
const legacyMan = { app: 'wavelength-logbook', version: 2, created: new Date().toISOString(), account: email, entries: [], images: [{ id: 'legacyimg1', entryId, w: 10, h: 10, kind: 'image', type: 'image/jpeg', file: 'images/legacyimg1.jpg', thumb: null }] };
const legacy = await WLZip.zip([{ name: 'wavelength-backup.json', data: JSON.stringify(legacyMan) }, { name: 'images/legacyimg1.jpg', data: inside['images/imgdummy01.jpg'] }]).arrayBuffer();
const lfile = path.join(tmp, 'Wavelength-logbook-backup-old.zip'); fs.writeFileSync(lfile, Buffer.from(legacy));
await C.page.evaluate(() => { location.hash = '#/backup'; });
await C.page.waitForSelector('#rf', { state: 'attached' });
await C.page.setInputFiles('#rf', lfile);
const warned = await C.page.waitForSelector('text=This backup is not encrypted', { timeout: 10000 }).then(() => true, () => false);
if (warned) await C.page.click('.sheet [data-ok]');
await C.page.waitForFunction(() => (window.__toasts || []).some((x) => /Restored/.test(x)), null, { timeout: 20000 }).catch(() => {});
const cimgs = await idb(C.page, 'images');
record('B10', 'An old unencrypted ZIP restores after a warning to replace it with an encrypted backup', warned && cimgs.some((x) => x.id === 'legacyimg1'), `warning shown: ${warned}; media: ${cimgs.map((x) => x.id).join(', ')}`);
// Not a backup at all.
const junk = path.join(tmp, 'notes.txt'); fs.writeFileSync(junk, 'just some text');
await C.page.evaluate(() => { window.__toasts = []; location.hash = '#/backup'; });
await C.page.waitForSelector('#rf', { state: 'attached' });
await C.page.setInputFiles('#rf', junk);
await C.page.waitForFunction(() => (window.__toasts || []).length, null, { timeout: 5000 }).catch(() => {});
const junkMsg = await toasts(C.page);
record('B11', 'Any other file is refused as not a Wavelength backup', /not a Wavelength backup/.test(junkMsg), `toast: "${junkMsg}"`);
await C.ctx.close();

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
if (errors.length) console.log('page errors:', errors.slice(0, 10));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 2));
process.exit(results.every((r) => r.pass) && !errors.length ? 0 : 1);
