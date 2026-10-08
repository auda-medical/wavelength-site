// The harder cases of the 1.0.9 test plan, in the store app without a phone: the real bundle over the stand-in
// native bridge (tools/native-harness.mjs) and a local Worker. Dummy accounts and generated media only.
//   R1 damaged cached account   R2 phone storage that will not open   R3 resume after a long time away
//   R4 failed and cancelled fingerprint   R5 editing a scan offline   R6 a large media collection backed up and
//   restored on a fresh phone   R7 a backup from another account   R8 no login token or passphrase in the logs
//   R9 no photo or clip ever sent to the server   R4b phone lock removed   R7b restore question closed with Escape
//
// Setup: WL_APP_VERSION=1.0.9 WL_VERSION_CODE=15 node mobile/scripts/build-www.mjs,
//        then node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-resilience.mjs [results.json] [http://localhost:8787]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness, net, SITE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-resilience.mjs');
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-e2e-res-'));
const PASS = 'violet harbour engine maple';

// Everything the pages log, and every request body sent to the Wavelength server, for R8 and R9.
const logs = [];
const bodies = [];
async function phone(token, { init = [] } = {}) {
  const { ctx, page } = await newApp(390, 844, { init: [`addEventListener('DOMContentLoaded', () => { window.__toasts = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true }); });`, ...init] });
  page.on('console', (m) => logs.push(m.text()));
  page.on('request', (r) => { if (r.url().startsWith(SITE)) { const b = r.postDataBuffer(); if (b) bodies.push({ url: r.url(), b }); } });
  await page.goto('https://localhost/');
  if (token) {
    await page.evaluate((tok) => localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })), token);
    await page.goto('https://localhost/');
  }
  return { ctx, page };
}
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
const t = Date.now();
async function account(tag) {
  const email = `res-${tag}-${t}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: 'Test', lastName: tag, email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  const prof = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], onboarded: true } }) }).then((x) => x.json());
  return { email, token, id: prof.account.id };
}
const serverRows = (id) => fetch(API + '/__dev/entries').then((r) => r.json()).then((rows) => rows.filter((r) => r.learner_id === id && !r.deleted));
const idb = (page, id, store) => page.evaluate(([id, st]) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction(st).objectStore(st).getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map((x) => ({ id: x.id, entryId: x.entryId, size: x.blob ? x.blob.size : undefined, dirty: !!x._dirty, refl: x.reflection }))); }; }; r.onerror = () => ok([]); }), [id, store]);
async function saveScan(page, note) {
  await page.evaluate(() => { location.hash = '#/new'; });
  await page.waitForSelector('label[for=t0]');
  await page.click('label[for=t0]');
  await page.waitForSelector('#rest:not([hidden])');
  await page.locator('input[name=supervision]').first().check({ force: true });
  await page.fill('#refl', note);
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => /#\/entry\//.test(location.hash), null, { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((s) => s.remove()));
  return page.evaluate(() => location.hash.split('/')[2]);
}
const A = await account('a');

// ---------- R1: a damaged cached account on the phone ----------
{
  const { ctx, page } = await phone(A.token);
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.evaluate(() => localStorage.setItem('wl-acc', '{"id": 12, "name": "Test'));
  const t0 = Date.now();
  await page.goto('https://localhost/');
  const ok = await page.waitForSelector('nav.tabs, #app .auth:not([data-boot])', { timeout: 12000 }).then(() => true, () => false);
  const tabs = !!(await page.$('nav.tabs'));
  record('R1', 'A damaged cached account does not stop the app: it checks with the server and opens the logbook', ok && tabs, `opened in ${Date.now() - t0} ms, logbook ${tabs}`);
  await ctx.close();
}

// ---------- R2: phone storage that will not open ----------
{
  const broken = `(() => { const real = indexedDB.open.bind(indexedDB); indexedDB.open = function (name, v) { if (/^wavelength-/.test(name)) { const req = {}; setTimeout(() => { req.error = new DOMException('broken', 'UnknownError'); if (req.onerror) req.onerror({ target: req }); }, 10); return req; } return real(name, v); }; })();`;
  const { ctx, page } = await phone(A.token);
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await ctx.close();
  // A fresh phone context that is signed in (cached account and token) but whose logbook database fails to open.
  const B = await phone(A.token, { init: [broken] });
  await B.page.evaluate(() => { const a = JSON.parse(localStorage.getItem('wl-acc') || 'null'); return a; });
  const acc = await fetch(API + '/api/app/me', { headers: { ...H, Authorization: 'Bearer ' + A.token } }).then((r) => r.json());
  await B.page.evaluate((a) => localStorage.setItem('wl-acc', JSON.stringify(a)), acc.account);
  const t0 = Date.now();
  await B.page.goto('https://localhost/');
  const shown = await B.page.waitForSelector('text=could not open the logbook saved on this phone', { timeout: 9000 }).then(() => Date.now() - t0, () => -1);
  const retry = !!(await B.page.$('[data-retry]'));
  record('R2', 'Storage that will not open: a recovery screen with Try again appears at once, not an endless start screen', shown >= 0 && shown < 5000 && retry, `recovery after ${shown} ms, Try again ${retry}`);
  await B.ctx.close();
}

// ---------- R3 and R4: resume after a long time away; failed and cancelled fingerprint ----------
{
  const { ctx, page } = await phone(A.token);
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); p['wl-lock'] = '1'; localStorage.setItem('__prefs', JSON.stringify(p)); });
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForTimeout(500);
  // Away for 2 minutes (the clock is moved on instead of waiting), with a scan saved while the server was out of reach.
  net.offline = true;
  const id = await saveScan(page, 'Dummy scan before a long break');
  await page.evaluate(() => { window.__fire('App', 'appStateChange', { isActive: false }); const real = Date.now; Date.now = () => real() + 125000; window.__calls.length = 0; });
  net.offline = false;
  await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: true }));
  const asked = await page.waitForFunction(() => window.__calls.some((c) => c.method === 'verifyIdentity'), null, { timeout: 5000 }).then(() => true, () => false);
  let synced = false;
  for (let end = Date.now() + 15000; Date.now() < end && !(synced = (await serverRows(A.id)).some((r) => r.id === id));) await page.waitForTimeout(400);
  record('R3', 'Back after a long time away: asks for the fingerprint again and sends the waiting scan', asked && synced, `prompt ${asked}, scan on server ${synced}`);

  // R4: a failed fingerprint and a cancelled prompt leave it locked; a good one opens it. A new phone session
  // whose fingerprint check fails from the first prompt.
  const R4 = await phone(A.token, { init: ['window.__bio = { pass: false };'] });
  await R4.page.evaluate(() => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); p['wl-lock'] = '1'; localStorage.setItem('__prefs', JSON.stringify(p)); });
  await R4.page.goto('https://localhost/');
  {
  const page = R4.page;
  await page.waitForSelector('.app-lock', { timeout: 8000 });
  await page.waitForTimeout(600);
  const stillLocked = !!(await page.$('.app-lock'));
  await page.click('.app-lock [data-unlock]');
  await page.waitForTimeout(600);
  const lockedAgain = !!(await page.$('.app-lock'));
  await page.evaluate(() => { window.__bio.pass = true; });
  await page.click('.app-lock [data-unlock]');
  await page.waitForTimeout(600);
  const open = !(await page.$('.app-lock'));
  const tries = await page.evaluate(() => window.__calls.filter((c) => c.method === 'verifyIdentity').length);
  record('R4', 'A failed or cancelled fingerprint keeps the logbook locked; the next good one opens it', stillLocked && lockedAgain && open && tries >= 3, `locked after failure ${stillLocked}, after retry ${lockedAgain}, open after success ${open}, prompts ${tries}`);
  }
  await R4.ctx.close();

  // R4b: the phone's own lock was removed while the app lock was on. The logbook stays locked with an explanation
  // (it never switches the lock off by itself); Log out is the way on, and the lock is off after that.
  const R4b = await phone(A.token, { init: ['window.__bio = { available: false };'] });
  await R4b.page.evaluate(() => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); p['wl-lock'] = '1'; localStorage.setItem('__prefs', JSON.stringify(p)); });
  await R4b.page.goto('https://localhost/');
  {
  const page = R4b.page;
  await page.waitForSelector('.app-lock', { timeout: 8000 });
  await page.waitForTimeout(800);
  const locked = !!(await page.$('.app-lock'));
  const msg = await page.$eval('.app-lock [data-lockmsg]', (x) => x.textContent).catch(() => '');
  const lockPref = await page.evaluate(() => JSON.parse(localStorage.getItem('__prefs') || '{}')['wl-lock']);
  const prompts = await page.evaluate(() => window.__calls.filter((c) => c.method === 'verifyIdentity').length);
  await page.click('.app-lock [data-lockout]');
  await page.waitForTimeout(1200);
  const out = !(await page.$('.app-lock')) && !(await page.$('nav.tabs'));
  const lockAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('__prefs') || '{}')['wl-lock']);
  record('R4b', 'Phone lock removed: the logbook stays locked and says why; Log out works and leaves the lock off', locked && /screen lock/.test(msg) && lockPref === '1' && prompts === 0 && out && !lockAfter, `locked ${locked}, message "${msg}", lock setting kept ${lockPref === '1'}, signed out ${out}, lock after log-out ${lockAfter || 'off'}`);
  }
  await R4b.ctx.close();
  // Lock off again for the rest (R5 edits a scan without prompts in the way).
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); delete p['wl-lock']; localStorage.setItem('__prefs', JSON.stringify(p)); });
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });

  // ---------- R5: editing a synced scan while offline ----------
  net.offline = true;
  await page.evaluate((x) => { location.hash = '#/edit/' + x; }, id);
  await page.waitForSelector('#refl');
  await page.fill('#refl', 'Dummy scan edited offline');
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => /#\/entry\//.test(location.hash), null, { timeout: 15000 });
  const before = (await serverRows(A.id)).find((r) => r.id === id);
  const waiting = (await idb(page, A.id, 'entries')).find((e) => e.id === id);
  net.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  let after = before;
  for (let end = Date.now() + 20000; Date.now() < end && !(after && before && after.updated_at > before.updated_at);) { await page.waitForTimeout(500); after = (await serverRows(A.id)).find((r) => r.id === id); }
  const pulled = await fetch(API + '/api/app/sync', { headers: { ...H, Authorization: 'Bearer ' + A.token } }).then((r) => r.json());
  const srv = (pulled.entries || []).find((e) => e.id === id) || {};
  record('R5', 'A scan edited offline waits, then the edit reaches the server as the same record', waiting && waiting.dirty && after.updated_at > before.updated_at && srv.reflection === 'Dummy scan edited offline' && (await serverRows(A.id)).filter((r) => r.id === id).length === 1, `waiting ${waiting && waiting.dirty}, server text "${srv.reflection}"`);
  await ctx.close();
}

// ---------- R6 and R7: a large media collection, a fresh phone, and a backup from another account ----------
let bfile = '';
{
  const { ctx, page } = await phone(A.token);
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  const id = await saveScan(page, 'Dummy scan with many photos');
  // 30 generated files of 2 MB each (60 MB), as photos and clips of a busy logbook.
  await page.evaluate(([acc, eid]) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + acc);
    r.onsuccess = () => { const tx = r.result.transaction('images', 'readwrite'); const st = tx.objectStore('images');
      for (let i = 0; i < 30; i++) { const b = new Uint8Array(2 * 1048576); for (let j = 0; j < b.length; j += 4096) b[j] = (i * 31 + j) & 255; st.put({ id: 'big' + String(i).padStart(3, '0'), entryId: eid, blob: new Blob([b], { type: i % 3 ? 'image/jpeg' : 'video/mp4' }), thumb: new Blob([b.subarray(0, 2000)], { type: 'image/jpeg' }), w: 100, h: 100, kind: i % 3 ? 'image' : 'clip', dur: 3, created: Date.now() }); }
      tx.oncomplete = () => { r.result.close(); ok(); }; };
  }), [A.id, id]);
  await page.evaluate(() => { location.hash = '#/backup'; });
  await page.waitForSelector('#bkf');
  await page.fill('#bkp', PASS); await page.fill('#bkp2', PASS); await page.check('#bkok');
  const t0 = Date.now();
  await page.click('#bk');
  const made = await page.waitForSelector('text=Encrypted backup created', { timeout: 180000 }).then(() => true, () => false);
  const ms = Date.now() - t0;
  const files = await page.evaluate(() => window.__files || {});
  const name = Object.keys(files).find((k) => /\.wlbackup$/.test(k));
  const file = name ? Buffer.concat(files[name].map((b) => Buffer.from(b, 'base64'))) : Buffer.alloc(0);
  bfile = path.join(tmp, 'big.wlbackup'); fs.writeFileSync(bfile, file);
  await ctx.close();

  const B = await phone(A.token);
  await B.page.waitForSelector('nav.tabs', { timeout: 15000 });
  await B.page.evaluate(() => { location.hash = '#/backup'; });
  await B.page.waitForSelector('#rf', { state: 'attached' });
  await B.page.setInputFiles('#rf', bfile);
  await B.page.waitForSelector('#rpf');
  await B.page.fill('#rpp', PASS);
  const t1 = Date.now();
  await B.page.click('#rpf button.teal');
  await B.page.waitForFunction(() => (window.__toasts || []).some((x) => /Restored/.test(x)), null, { timeout: 180000 }).catch(() => {});
  const restored = (await idb(B.page, A.id, 'images')).filter((x) => /^big/.test(x.id));
  record('R6', 'A 60 MB collection (30 photos and clips) backs up and restores on a fresh phone, every file intact', made && file.length > 60 * 1048576 && restored.length === 30 && restored.every((x) => x.size === 2 * 1048576), `backup ${(file.length / 1048576).toFixed(1)} MB in ${ms} ms; restored ${restored.length} files in ${Date.now() - t1} ms`);
  await B.ctx.close();
}
{
  const other = await account('other');
  const { ctx, page } = await phone(other.token);
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.evaluate(() => { location.hash = '#/backup'; });
  await page.waitForSelector('#rf', { state: 'attached' });
  await page.setInputFiles('#rf', bfile);
  await page.waitForSelector('#rpf');
  await page.fill('#rpp', PASS);
  await page.click('#rpf button.teal');
  const asked = await page.waitForSelector('text=Restore into this account?', { timeout: 60000 }).then(() => true, () => false);
  if (asked) await page.click('.sheet [data-no]');
  await page.waitForTimeout(800);
  const imgs = await idb(page, other.id, 'images');
  record('R7', 'A backup from another account asks before restoring; Cancel restores nothing', asked && imgs.length === 0, `asked ${asked}, media restored ${imgs.length}`);
  // R7b: the same question closed with Escape (or Back, or a tap outside) counts as Cancel; asking again and
  // choosing Restore then restores everything.
  await page.setInputFiles('#rf', bfile);
  await page.waitForSelector('#rpf');
  await page.fill('#rpp', PASS);
  await page.click('#rpf button.teal');
  const asked2 = await page.waitForSelector('text=Restore into this account?', { timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const afterEsc = (await idb(page, other.id, 'images')).length;
  const sheetGone = !(await page.$('.sheet-bg'));
  await page.setInputFiles('#rf', bfile);
  await page.waitForSelector('#rpf');
  await page.fill('#rpp', PASS);
  await page.click('#rpf button.teal');
  await page.waitForSelector('text=Restore into this account?', { timeout: 60000 });
  await page.click('.sheet [data-ok]');
  await page.waitForFunction(() => (window.__toasts || []).some((x) => /Restored/.test(x)), null, { timeout: 180000 }).catch(() => {});
  const imgs2 = (await idb(page, other.id, 'images')).filter((x) => /^big/.test(x.id));
  record('R7b', 'Closing that question with Escape restores nothing; asking again and choosing Restore restores all 30 files', asked2 && afterEsc === 0 && sheetGone && imgs2.length === 30, `asked ${asked2}, media after Escape ${afterEsc}, sheet closed ${sheetGone}, media after Restore ${imgs2.length}`);
  await ctx.close();
}

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });

// ---------- R8 and R9: what left the app ----------
const secrets = [A.token, PASS].filter(Boolean);
const leaked = logs.filter((l) => secrets.some((s) => l.includes(s)));
record('R8', 'No login token or backup passphrase appears in anything the app logged', !leaked.length, `${logs.length} log lines checked`);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const media = bodies.filter((x) => x.b.includes(JPEG) || x.b.includes(Buffer.from('ftyp')) || x.b.length > 1048576 || /shared|image/i.test(new URL(x.url).pathname));
record('R9', 'No photo or clip was sent to the server in any request', !media.length, `${bodies.length} request bodies checked${media.length ? '; suspicious: ' + media.map((x) => x.url).join(', ') : ''}`);
const bad = errors.filter((e) => !/internetdisconnected|Failed to fetch|ERR_INTERNET_DISCONNECTED|broken/i.test(e));
record('R10', 'No page errors', !bad.length, bad.slice(0, 3).join(' | ') || 'none');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ run: new Date().toISOString(), results }, null, 2) + '\n');
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? failed + ' checks failed.' : 'All resilience checks passed.');
process.exit(failed ? 1 : 0);
