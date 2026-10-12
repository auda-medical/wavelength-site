// Wavelength 1.0.16 checks in a browser, without a phone: the recovery of photos left by earlier versions, after the
// owner's Fold7 finding (ChatGPT 12 Oct 10:48 and 10:51). Runs the real bundle (mobile/www) over the stand-in native
// bridge (tools/native-harness.mjs, with its camera-capture plugin) against a local Worker. Synthetic accounts and
// pictures only: 17 coloured, numbered squares stand for the leftover photos, each colour standing for one scan.
//
//   R  recovery tray: 17 leftovers become 17 separate items, none selected; each opens on its own; only selected
//      ones are chosen for a scan, and only once finished are they in it; unfinished ones are never claimed as
//      saved; separate scans get exactly their own photos, once each; Back, restart, discard (one and all),
//      Discard changes, too many, account separation, no sync or upload of images, backups
//   U  the owner's phone: 1.0.15 imported the 17 and added them in bulk to a scan saved without images; installing
//      1.0.16 over it keeps all 17, separate, none attached, nothing deleted or duplicated, the scan unchanged
//   W  wording: the scan form's first section is Scan, with the question Which scan did you do?
//   S  annotation size on a Fold7, folded and unfolded: the wider ends, the usual size in the middle
//
// Setup: WL_APP_VERSION=1.0.16 WL_VERSION_CODE=22 node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8796
// Run:   node tools/e2e-1016.mjs <outdir> [http://localhost:8796]     OLD_WWW=<1.0.15 mobile/www> for U
// These are browser simulations: they do not replace the emulator and Fold7 checks.
import fs from 'node:fs';
import path from 'node:path';
import { harness, serve, WWW, SITE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1016-out');
const API = process.argv[3] || 'http://localhost:8796';
const OLD_WWW = process.env.OLD_WWW ? path.resolve(process.env.OLD_WWW) : path.resolve('../wavelength-1.0.15/mobile/www');
localOnly(API, 'tools/e2e-1016.mjs');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', typeof detail === 'string' ? detail : JSON.stringify(detail)); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name, opt = {}) => { await sleep(250); return page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opt }); };
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
const globalThisWindow = globalThis; globalThisWindow.window = globalThis;
window.WLBackupArgon2 = await import('../src/app/vendor/noble-hashes/argon2.js');
for (const f of ['zip.js', 'backup.js']) new Function(fs.readFileSync(new URL('../src/app/' + f, import.meta.url), 'utf8'))();
await import('../src/app/editor.js');
const E = globalThis.WLEditor;

async function account() {
  const email = `v1016${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: 'Test', lastName: 'Clinician', email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
// 17 leftover photos, as 1.0.13 left them in Android/data/.../files/Pictures: JPEG_<date>_<n>.jpg, a few days apart.
// Colours by scan: three for scan A, two for scan B, two for scan C, ten more.
const HUES = Array.from({ length: 17 }, (_, i) => Math.round(i * 360 / 17));
const T0 = Date.UTC(2026, 9, 1, 8, 0);
const LEGACY = HUES.map((h, i) => ({ name: `JPEG_${new Date(T0 + i * 7 * 36e5).toISOString().slice(0, 10).replace(/-/g, '')}_${1000 + i}.jpg`, kind: 'image', size: 0, modified: T0 + i * 7 * 36e5, legacy: true, path: `/storage/emulated/0/Android/data/uk.co.thewavelength.app/files/Pictures/legacy-${i}.jpg` }));
async function makeLegacyFiles(page) {
  const bufs = await page.evaluate((hues) => Promise.all(hues.map((h, i) => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360; const g = c.getContext('2d');
    g.fillStyle = `hsl(${h} 80% 50%)`; g.fillRect(0, 0, 480, 360); g.fillStyle = '#000'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), 240, 220);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/jpeg', 0.9);
  }))), HUES);
  bufs.forEach((b, i) => { const buf = Buffer.from(b, 'base64'); serve.files[LEGACY[i].path] = buf; LEGACY[i].size = buf.length; });
}
const CAPTURES = (files) => `window.__captures = ${JSON.stringify({ files })};`;
// Every toast the app shows (they vanish after a few seconds), and every request to the server with its body size.
const TOASTS = `addEventListener('DOMContentLoaded', () => { window.__toasts = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true }); });`;
const sent = [];
async function phone({ width = 390, height = 844, acc, captures = null, dir = WWW } = {}) {
  serve.dir = dir;
  const { ctx, page } = await newApp(width, height, { init: [TOASTS, ...(captures ? [CAPTURES(captures)] : [])] });
  page.on('request', (rq) => { if (rq.url().startsWith(SITE)) { const b = rq.postDataBuffer(); sent.push({ url: rq.url().replace(SITE, ''), bytes: b ? b.length : 0, jpeg: !!(b && (b.includes(Buffer.from([0xff, 0xd8, 0xff])) || b.includes(Buffer.from('/9j/')))) }); } });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(600);
  return { ctx, page, acc };
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const back = (page) => page.evaluate(() => window.__fire('App', 'backButton', {}));
const toasts = (page) => page.evaluate(() => (window.__toasts || []).join(' / '));
const drafts = (page, accId) => page.evaluate((id) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id + '-drafts');
  r.onupgradeneeded = () => { r.transaction.abort(); ok([]); };
  r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('media')) { d.close(); return ok([]); } const t = d.transaction(['media', 'state']); const out = {}; t.objectStore('media').getAll().onsuccess = (e) => { out.m = e.target.result; }; t.objectStore('state').getAll().onsuccess = (e) => { out.s = e.target.result; }; t.oncomplete = () => { d.close(); const st = {}; out.s.forEach((x) => { st[x.id] = x; }); ok(out.m.map((m) => ({ id: m.id, name: m.name || '', formKey: m.formKey, inst: m.inst || null, legacy: !!m.legacy, fromTray: !!m.fromTray, hasFile: !!m.file, hasResult: !!m.result, stage: (st[m.id] || {}).stage, session: (st[m.id] || {}).session }))); }; };
  r.onerror = () => ok([]);
}), accId);
const forms = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id + '-drafts'); r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('forms')) { d.close(); return ok([]); } const q = d.transaction('forms').objectStore('forms').getAll(); q.onsuccess = () => { d.close(); ok(q.result); }; }; r.onerror = () => ok([]); }), accId);
// The logbook's saved images, with the colour at the centre of each (which leftover photo it was).
const stored = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); Promise.all(q.result.map((x) => createImageBitmap(x.blob).then((b) => { const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0); const p = g.getImageData(Math.round(b.width * 0.15), Math.round(b.height * 0.15), 1, 1).data; return { id: x.id, entryId: x.entryId, rgb: [p[0], p[1], p[2]] }; }))).then(ok); }; }; }), accId);
const entries = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.filter((e) => !e.deleted).map((e) => ({ id: e.id, type: e.type, images: (e.images || []).map((i) => i.id) }))); }; }; }), accId);
// Which of the 17 a colour is: the nearest hue.
function whichPhoto(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  let best = 0; HUES.forEach((x, i) => { const dd = Math.min(Math.abs(x - h), 360 - Math.abs(x - h)); if (dd < Math.min(Math.abs(HUES[best] - h), 360 - Math.abs(HUES[best] - h))) best = i; });
  return best + 1;
}
const trayRows = (page) => page.$$eval('.tray-it', (l) => l.map((li) => ({ id: li.dataset.trit, checked: li.querySelector('input').checked, text: li.textContent.replace(/\s+/g, ' ').trim() })));
// Selecting leftover photos by which of the 17 they are (their file name), wherever they are in the list: the tray
// numbers its rows by position, so the numbers change as photos leave it.
const numOf = (name) => LEGACY.findIndex((f) => f.name === name) + 1;
async function selectPhotos(page, nums, accId) { const d = await drafts(page, accId); const rows = await trayRows(page); for (const n of nums) { const x = d.find((y) => numOf(y.name) === n); const i = x ? rows.findIndex((r) => r.id === x.id) : -1; if (i < 0) throw new Error('photo ' + n + ' is not in the tray'); await page.check(`.tray-it:nth-child(${i + 1}) input`); } }
// The sizes of the annotations in the photo being edited, from its safety copy.
const annSizes = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id + '-drafts'); r.onsuccess = () => { const q = r.result.transaction('state').objectStore('state').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.flatMap((s) => (s.st && s.st.ann ? s.st.ann : []).map((a) => a.size))); }; }; r.onerror = () => ok([]); }), accId);
async function chooseType(page) { if (await page.evaluate(() => !document.querySelector('#rest').hidden)) return; await page.click('label[for=t0]'); await page.waitForSelector('#rest:not([hidden])'); await sleep(300); }
async function finishTile(page) { await page.click('#gal .kept'); await page.waitForSelector('.editor canvas'); await sleep(500); await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached', timeout: 15000 }); await sleep(500); }
async function pickSupervision(page) { await page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); if (i) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } }); }
async function logOut(page) {
  await go(page, '#/settings'); await page.waitForSelector('#lo'); await page.click('#lo'); await sleep(800);
  if (await page.$('.sheet')) { await page.evaluate(() => { const b = [...document.querySelectorAll('.sheet .btns button')].pop(); if (b) b.click(); }); await sleep(1500); }
  await page.waitForFunction(() => !document.querySelector('nav.tabs'), null, { timeout: 15000 }).catch(() => {});
}
async function logIn(page, who) {
  await go(page, '#/login'); await page.waitForSelector('#f #em'); await page.fill('#em', who.email); await page.fill('#pw', 'Long-password-1'); await page.click('#f button[type=submit]');
  await page.waitForSelector('nav.tabs', { timeout: 15000 }); await sleep(2500);
}
const savedTo = (page) => page.waitForFunction(() => location.hash === '#/' || /^#\/entry\//.test(location.hash), null, { timeout: 15000 }).then(() => true, () => false);

// ---------- R: the recovery tray ----------
let A = null, tray0 = [], scanA = null, scanB = null;
if (want('R')) {
  const acc = await account();
  const boot = await phone({ acc });
  await makeLegacyFiles(boot.page);
  await boot.ctx.close();
  A = await phone({ acc, captures: LEGACY });
  const { page } = A;
  await page.waitForSelector('.sheet [data-lgrev]', { timeout: 10000 });
  const sheetText = await text(page, '.sheet');
  record('R1', 'Opening 1.0.16: the 17 leftover photos are found and explained, with Review them first', /found 17 photos/.test(sheetText) && /Review them first/.test(sheetText), sheetText.slice(0, 160));
  await page.click('.sheet [data-lgrev]');
  await page.waitForFunction(() => location.hash === '#/kept' && document.querySelectorAll('.tray-it').length === 17, null, { timeout: 30000 });
  await sleep(1500);
  const rows = await trayRows(page), d1 = await drafts(page, acc.id), removed = await page.evaluate(() => JSON.parse(localStorage.getItem('__capRemoved') || '[]'));
  const btns = await page.evaluate(() => ({ add: document.querySelector('[data-tradd]').disabled, addText: document.querySelector('[data-tradd]').textContent, drop: document.querySelector('[data-trdrop]').disabled, count: document.querySelector('[data-trcount]').textContent, warn: document.querySelector('.tray-warn').textContent, thumbs: [...document.querySelectorAll('.tray-it img')].filter((i) => i.complete && i.naturalWidth > 0).length }));
  record('R2', 'Review them first opens the recovery tray: 17 separate items, each with a preview, date and origin, none selected', rows.length === 17 && rows.every((r) => !r.checked) && rows.every((r) => /^Photo, \d+ Oct 2026, \d\d:\d\d/.test(r.text) && /Left by an earlier version/.test(r.text)) && btns.thumbs === 17 && btns.add && btns.drop && btns.count === 'None selected', { rows: rows.length, checked: rows.filter((r) => r.checked).length, sample: rows[0].text, btns });
  record('R3', 'The tray says plainly they may belong to different patients and scans, and nothing is added by itself', /different patients and scans/.test(btns.warn) && /never adds them to a scan by itself/.test(btns.warn), btns.warn);
  record('R4', 'Each leftover file is removed from the shared folder only after the app holds its own copy (17 kept, 17 removed)', d1.length === 17 && d1.every((x) => x.legacy && x.formKey === 'tray' && !x.inst && x.hasFile && x.stage === 'later') && removed.length === 17, { drafts: d1.length, removed: removed.length });
  tray0 = d1.map((x) => x.id);
  await shot(page, 'R2-tray-phone');
  // R5 one photo, full screen.
  await page.click('.tray-it:nth-child(3) .tray-th'); await page.waitForSelector('.tray-view img'); await sleep(400);
  const v = await page.evaluate(() => { const i = document.querySelector('.tray-view img'); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const p = g.getImageData(20, 20, 1, 1).data; return { w: i.naturalWidth, rgb: [p[0], p[1], p[2]], label: document.querySelector('.tray-view-tx').textContent }; });
  await shot(page, 'R5-one-photo');
  await back(page); await sleep(300);
  const after5 = { open: await page.evaluate(() => !!document.querySelector('.tray-view')), checked: (await trayRows(page)).filter((r) => r.checked).length, hash: await page.evaluate(() => location.hash) };
  record('R5', 'Each photo opens on its own, full size, to check it; Back closes it and returns to the list with nothing selected', v.w === 480 && whichPhoto(v.rgb) === 3 && /^Photo, 1 Oct 2026, 23:00 · Left by an earlier version$/.test(v.label) && !after5.open && after5.checked === 0 && after5.hash === '#/kept', { v, after5 });
  // R6 three for scan A: the count and the action say exactly what is selected.
  await selectPhotos(page, [1, 2, 3], acc.id); await sleep(200);
  const sel = await page.evaluate(() => ({ count: document.querySelector('[data-trcount]').textContent, add: document.querySelector('[data-tradd]').textContent, enabled: !document.querySelector('[data-tradd]').disabled }));
  record('R6', 'Selecting three shows "3 selected" and "Start a scan with the selected (3)"', sel.count === '3 selected' && sel.add === 'Start a scan with the selected (3)' && sel.enabled, sel);
  await shot(page, 'R6-three-selected');
  await page.click('[data-tradd]');
  await page.waitForSelector('#ef'); await sleep(1500);
  const before = { note: await text(page, '[data-earlier]'), tiles: await page.$$eval('#gal .kept', (l) => l.length), images: await page.$$eval('#gal img:not(.kept img)', (l) => l.length) };
  await chooseType(page); await sleep(500);
  const formState = { tiles: await page.$$eval('#gal .kept', (l) => l.length), imageTiles: await page.$$eval('#gal button:not(.kept):not(.add)', (l) => l.length), note: await text(page, '[data-earlier]'), toast: await toasts(page) };
  record('R7', 'The new scan gets only the three, as Unfinished: not part of the scan yet, and the other 14 stay in the tray', formState.tiles === 3 && formState.imageTiles === 0 && /Not finished yet: 3 photos/.test(formState.note) && /14 photos/.test(formState.note) && /chosen for this scan, not part of it yet/.test(formState.toast) && !/Added to this scan/.test(formState.toast + formState.note), { before, formState });
  await shot(page, 'R7-three-unfinished');
  // R8 Save with all three unfinished: it says they will not be saved in this scan.
  await pickSupervision(page);
  await page.click('form button[type=submit]'); await page.waitForSelector('.sheet [data-anyway]'); await sleep(200);
  const q = { title: await text(page, '.sheet h2'), body: await text(page, '.sheet p'), buttons: await page.$$eval('.sheet .btns button', (b) => b.map((x) => x.textContent)) };
  record('R8', 'Save with unfinished photos: "will not be saved in this scan", with Finish them now, Save and keep them for later, Go back', q.title === 'Not finished: 3 photos' && /will not be saved in this scan/.test(q.body) && q.buttons.join('|') === 'Finish them now|Save, and keep them for later|Go back', q);
  await shot(page, 'R8-not-finished');
  await page.click('.sheet [data-close]'); await sleep(400);
  record('R9', 'Go back leaves the scan unsaved with its three unfinished photos', (await page.evaluate(() => location.hash)) === '#/new' && (await page.$$eval('#gal .kept', (l) => l.length)) === 3 && (await entries(page, acc.id)).length === 0, '');
  // R10 finish two of them, then save keeping the third for later.
  await finishTile(page); await finishTile(page);
  const g2 = { tiles: await page.$$eval('#gal .kept', (l) => l.length), imageTiles: await page.$$eval('#gal button:not(.kept):not(.add)', (l) => l.length) };
  await page.click('form button[type=submit]'); await page.waitForSelector('.sheet [data-anyway]'); await page.click('.sheet [data-anyway]');
  const saved1 = await savedTo(page); await sleep(1200);
  const st1 = await stored(page, acc.id), en1 = await entries(page, acc.id), d2 = await drafts(page, acc.id);
  scanA = en1[0];
  const photosA = st1.map((s) => whichPhoto(s.rgb)).sort();
  record('R10', 'Two finished, one not: the scan saves exactly the two finished photos, once each, from photos 1 to 3', saved1 && g2.tiles === 1 && g2.imageTiles === 2 && en1.length === 1 && scanA.images.length === 2 && st1.length === 2 && photosA.every((n) => n <= 3) && new Set(photosA).size === 2, { g2, photosA, images: scanA && scanA.images.length });
  const back3 = d2.filter((x) => x.formKey === 'tray' && !x.inst);
  record('R11', 'The unfinished third goes back to the tray (not in the scan, not deleted); no prepared copy is left to offer again', d2.length === 15 && back3.length === 15 && d2.every((x) => !x.hasResult) && d2.every((x) => tray0.includes(x.id)), { drafts: d2.length, inTray: back3.length });
  // R12 a second scan, from the scan form: Choose from them.
  await go(page, '#/new'); await page.waitForSelector('#ef'); await sleep(1200); await chooseType(page);
  const note2 = await text(page, '[data-traynote]');
  await page.click('[data-opentray]'); await page.waitForSelector('.sheet .tray-it'); await sleep(1200);
  const sheetRows = await trayRows(page);
  record('R12', 'In a new scan, Choose from them lists the 15 kept ones, none selected, with Add selected to this scan', /15 photos/.test(note2 || '') && sheetRows.length === 15 && sheetRows.every((r) => !r.checked) && (await text(page, '.sheet [data-tradd]')) === 'Add selected to this scan (0)', { note2, rows: sheetRows.length });
  await shot(page, 'R12-choose-from-them');
  await selectPhotos(page, [4, 5], acc.id); await page.click('.sheet [data-tradd]'); await sleep(1200);
  const f2 = { tiles: await page.$$eval('#gal .kept', (l) => l.length), note: await text(page, '[data-earlier]') };
  record('R13', 'Add selected to this scan (2): exactly those two, as Unfinished; the other 13 stay in the tray', f2.tiles === 2 && /13 photos/.test(f2.note), f2);
  // R14 an Unfinished tile's x: put it back, or discard.
  await page.click('#gal .kept [data-rmk]'); await page.waitForSelector('.sheet [data-putback]');
  const rmq = await page.$$eval('.sheet .btns button', (b) => b.map((x) => x.textContent));
  await page.click('.sheet [data-putback]'); await sleep(800);
  const f3 = { tiles: await page.$$eval('#gal .kept', (l) => l.length), note: await text(page, '[data-traynote]') };
  record('R14', 'An unfinished photo can be taken out again: Put it back returns it to the tray, nothing deleted', rmq.join('|') === 'Put it back with the kept ones|Discard it|Cancel' && f3.tiles === 1 && /14 photos/.test(f3.note || ''), { rmq, f3 });
  // The one put back is in the tray again and can be chosen again (the other is still in the scan).
  await page.click('[data-opentray]'); await page.waitForSelector('.sheet .tray-it'); await sleep(800);
  const inScan = (await drafts(page, acc.id)).filter((x) => x.inst).map((x) => numOf(x.name));
  const putBack = [4, 5].find((n) => !inScan.includes(n));
  await selectPhotos(page, [putBack], acc.id); await page.click('.sheet [data-tradd]'); await sleep(1000);
  await finishTile(page); await finishTile(page);
  await pickSupervision(page);
  await page.click('form button[type=submit]');
  const saved2 = await savedTo(page); await sleep(1200);
  const st2 = await stored(page, acc.id), en2 = await entries(page, acc.id), d3 = await drafts(page, acc.id);
  scanB = en2.find((e) => e.id !== scanA.id);
  const byScan = {}; st2.forEach((s) => { (byScan[s.entryId] = byScan[s.entryId] || []).push(whichPhoto(s.rgb)); });
  const allPhotos = st2.map((s) => whichPhoto(s.rgb));
  record('R15', 'Two scans, each with only its own photos, each saved exactly once (no bulk duplication)', saved2 && scanB && byScan[scanA.id].every((n) => n <= 3) && byScan[scanB.id].sort().join() === '4,5' && allPhotos.length === new Set(allPhotos).size && st2.length === 4, { byScan, stored: st2.length });
  record('R16', 'Unselected photos never entered any scan: the 13 others are still in the tray, untouched', d3.length === 13 && d3.every((x) => x.formKey === 'tray' && !x.inst && x.hasFile && tray0.includes(x.id)) && !allPhotos.some((n) => n >= 6), { tray: d3.length });
  // R17 forced close and restart.
  await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1800);
  const card = await text(page, '[data-kepthome]');
  const d4 = await drafts(page, acc.id), en4 = await entries(page, acc.id), fm4 = await forms(page, acc.id);
  record('R17', 'After Wavelength is closed and opened again: Home says 13 photos are kept, with Review photos and clips; nothing attached', /Kept on this phone/.test(card || '') && /13 photos/.test(card || '') && /Review photos and clips/.test(card || '') && d4.length === 13 && d4.every((x) => !x.inst) && en4.length === 2 && en4.find((e) => e.id === scanA.id).images.length === 2 && fm4.length === 0, { card, drafts: d4.length, forms: fm4.length });
  await shot(page, 'R17-home-after-restart');
  // A new scan after the restart: nothing comes in by itself.
  await go(page, '#/new'); await page.waitForSelector('#ef'); await sleep(1200); await chooseType(page);
  record('R18', 'A new scan after the restart starts empty: no kept photo is shown or added unless chosen', (await page.$$eval('#gal .kept', (l) => l.length)) === 0 && (await page.$$eval('#gal button:not(.add)', (l) => l.length)) === 0 && /13 photos/.test((await text(page, '[data-traynote]')) || ''), '');
  // R19 Discard changes: chosen ones go back to the tray as they were (one finished: as a prepared photo).
  await page.click('[data-opentray]'); await page.waitForSelector('.sheet .tray-it'); await sleep(800);
  await selectPhotos(page, [6, 7], acc.id); await page.click('.sheet [data-tradd]'); await sleep(1000);
  await finishTile(page);
  await page.click('nav.tabs a[href="#/"]'); await page.waitForSelector('.sheet [data-discard]'); await page.click('.sheet [data-discard]'); await sleep(1500);
  const d5 = await drafts(page, acc.id);
  record('R19', 'Leaving the scan with Discard changes: the two chosen photos go back to the tray (one as prepared), none deleted', d5.length === 13 && d5.every((x) => x.formKey === 'tray' && !x.inst) && d5.filter((x) => x.hasResult && x.stage === 'ready').length === 1, { drafts: d5.length, prepared: d5.filter((x) => x.hasResult).length });
  await go(page, '#/kept'); await page.waitForSelector('.tray-it'); await sleep(800);
  const prepRow = (await trayRows(page)).find((r) => /Prepared, not saved in a scan/.test(r.text));
  record('R20', 'The tray says which one was prepared and not saved in a scan', !!prepRow, prepRow ? prepRow.text : 'none');
  // R21 Too many for one scan: a scan holds 12.
  await page.evaluate(() => { document.querySelectorAll('.tray-it input').forEach((i) => { i.checked = true; i.dispatchEvent(new Event('change')); }); }); await sleep(200);
  await page.click('[data-tradd]'); await page.waitForSelector('#ef'); await sleep(1500);
  const tm = { sheet: await text(page, '.sheet h2'), tiles: await page.$$eval('#gal .kept', (l) => l.length), d: (await drafts(page, acc.id)).filter((x) => x.inst).length };
  record('R21', 'Selecting 13 for one scan: "Too many for one scan", and none is assigned', tm.sheet === 'Too many for one scan' && tm.tiles === 0 && tm.d === 0, tm);
  await page.click('.sheet [data-close]'); await sleep(200);
  // R22 discarding selected ones asks, and Keep them keeps them.
  await go(page, '#/kept'); await page.waitForSelector('.tray-it'); await sleep(800);
  await selectPhotos(page, [8], acc.id); await page.click('[data-trdrop]'); await page.waitForSelector('.sheet [data-gone]');
  const dq = { title: await text(page, '.sheet h2'), body: await text(page, '.sheet p') };
  await page.click('.sheet [data-close]'); await sleep(500);
  const kept22 = (await drafts(page, acc.id)).length;
  await go(page, '#/'); await sleep(200); await go(page, '#/kept'); await page.waitForSelector('.tray-it'); await sleep(800);
  await selectPhotos(page, [8], acc.id); await page.click('[data-trdrop]'); await page.waitForSelector('.sheet [data-gone]'); await page.click('.sheet [data-gone]'); await sleep(1000);
  const d6 = await drafts(page, acc.id);
  record('R22', 'Discard selected (1) asks first ("not saved anywhere else", "cannot be undone"); Keep them keeps it; Discard removes only that one', dq.title === 'Discard 1 photo?' && /not saved anywhere else/.test(dq.body) && /cannot be undone/.test(dq.body) && kept22 === 13 && d6.length === 12, { dq, kept22, after: d6.length });
  // R23 account separation: logged out, another account on this phone sees none of them; back in, all are there.
  const other = await account();
  await logOut(page); await logIn(page, other);
  const oc = { card: await text(page, '[data-kepthome]'), drafts: (await drafts(page, other.id)).length };
  await go(page, '#/kept'); await sleep(1200);
  oc.tray = await text(page, 'main');
  await logOut(page); await logIn(page, acc);
  const backA = (await drafts(page, acc.id)).length;
  record('R23', 'Another account on the same phone sees none of them; back in the first account all 12 are still there', !oc.card && oc.drafts === 0 && /Nothing is kept on this phone/.test(oc.tray || '') && backA === 12, { ...oc, tray: (oc.tray || '').slice(0, 60), backA });
  // R24 no image left the phone: the server never received a photo.
  const big = sent.filter((s) => s.jpeg || s.bytes > 60000);
  record('R24', 'No photo was sent to the server at any point (sync carries the logbook, never kept or saved images)', sent.length > 5 && big.length === 0, { requests: sent.length, withImageData: big.length, largest: Math.max(...sent.map((s) => s.bytes)) });
  record('R25', 'Nothing was shared or written to the phone\'s files during recovery (no Share, no Filesystem writes)', !(await page.evaluate(() => (window.__calls || []).some((c) => c.plugin === 'Share' || (c.plugin === 'Filesystem' && /write|append/.test(c.method))))), '');
  // R26 an encrypted backup holds the saved scans' photos and none of the kept ones.
  await go(page, '#/backup'); await page.waitForSelector('#bkf');
  const PASS = 'orange tiger lamp river 1016';
  await page.fill('#bkp', PASS); await page.fill('#bkp2', PASS); await page.check('#bkok'); await page.click('#bk');
  const made = await page.waitForSelector('text=Encrypted backup created', { timeout: 90000 }).then(() => true, () => false);
  const files = await page.evaluate(() => window.__files || {});
  const name = Object.keys(files).find((k) => /\.wlbackup$/.test(k));
  const file = name ? Buffer.concat(files[name].map((b) => Buffer.from(b, 'base64'))) : Buffer.alloc(0);
  let man = null;
  if (file.length) { const plain = []; await WLBackup.decrypt(PASS, async (o, n) => new Uint8Array(file.subarray(o, o + n)), file.length, (p) => { plain.push(Buffer.from(p)); }); const zip = Buffer.concat(plain); const inside = WLZip.unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length)); man = JSON.parse(Buffer.from(inside['wavelength-backup.json']).toString()); }
  const d7 = await drafts(page, acc.id), ids = (man ? man.images : []).map((i) => i.id);
  record('R26', 'Encrypted backup: the 4 saved photos are in it, none of the 12 kept ones; the kept ones stay on the phone', made && man && st2.every((s) => ids.includes(s.id)) && !d7.some((x) => ids.includes(x.id)) && ids.length === 4 && d7.length === 12 && !file.includes(Buffer.from('Left by an earlier version')), { made, images: ids.length, kept: d7.length, entries: man ? man.entries.length : -1, storedNow: (await stored(page, acc.id)).length, account: man && man.account === acc.email });
  await A.ctx.close();
}

// ---------- U: the owner's phone, 1.0.15 then 1.0.16 ----------
if (want('U') && fs.existsSync(path.join(OLD_WWW, 'app', 'app.js'))) {
  const acc = await account();
  const boot = await phone({ acc });
  if (!Object.keys(serve.files).length) await makeLegacyFiles(boot.page);
  await boot.ctx.close();
  // 1.0.15 exactly as on the Fold7: Review them first, Review on Home, Add to this scan, a scan type, Save without them.
  const P = await phone({ acc, captures: LEGACY, dir: OLD_WWW });
  const { page } = P;
  await page.waitForSelector('.sheet [data-lgrev]', { timeout: 10000 }); await page.click('.sheet [data-lgrev]');
  await page.waitForFunction(() => document.querySelector('[data-kepthome]'), null, { timeout: 30000 }); await sleep(800);
  await page.click('[data-kepthome] a'); await page.waitForSelector('[data-addearlier]'); await page.click('[data-addearlier]'); await sleep(800);
  await page.click('label[for=t0]'); await page.waitForSelector('#gal .kept'); await sleep(400);
  const oldTiles = await page.$$eval('#gal .kept', (l) => l.length);
  await shot(page, 'U1-1015-seventeen-unfinished');
  await pickSupervision(page); await page.click('form button[type=submit]'); await page.waitForSelector('.sheet [data-anyway]'); await page.click('.sheet [data-anyway]');
  await savedTo(page); await sleep(1200);
  const e0 = await entries(page, acc.id), d0 = await drafts(page, acc.id);
  record('U1', '1.0.15 reproduced: 17 photos added in bulk to one scan as unfinished, and the scan saved with no images', oldTiles === 17 && e0.length === 1 && e0[0].images.length === 0 && d0.length === 17, { oldTiles, entries: e0.length, images: e0[0] && e0[0].images.length, drafts: d0.length });
  const ids0 = d0.map((x) => x.id).sort();
  // Installing 1.0.16 over it: the same app data, the new bundle, Wavelength started afresh.
  serve.dir = WWW;
  await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1800);
  const card = await text(page, '[data-kepthome]'), d1 = await drafts(page, acc.id), e1 = await entries(page, acc.id);
  record('U2', 'After the update: all 17 kept, the same ones (no duplicate, none deleted), and Home offers them for review one by one', d1.length === 17 && d1.map((x) => x.id).sort().join() === ids0.join() && /17 photos/.test(card || '') && /Review photos and clips/.test(card || ''), { drafts: d1.length, card });
  record('U3', 'The scan 1.0.15 saved without images is unchanged; none of the 17 is attached to it', e1.length === 1 && e1[0].id === e0[0].id && e1[0].images.length === 0 && (await stored(page, acc.id)).length === 0, e1);
  await go(page, '#/new'); await page.waitForSelector('#ef'); await sleep(1200); await chooseType(page);
  const nf = { tiles: await page.$$eval('#gal .kept', (l) => l.length), note: await text(page, '[data-traynote]') };
  record('U4', 'A new scan does not get the 17 as Unfinished any more: they are offered, never added', nf.tiles === 0 && /17 photos/.test(nf.note || ''), nf);
  await go(page, '#/'); await sleep(400); if (await page.$('.sheet [data-discard]')) { await page.click('.sheet [data-discard]'); await sleep(600); }
  await go(page, '#/kept'); await page.waitForSelector('.tray-it'); await sleep(1500);
  const rows = await trayRows(page);
  record('U5', 'The recovery tray lists all 17 separately, none selected, each with a preview', rows.length === 17 && rows.every((r) => !r.checked) && (await page.$$eval('.tray-it img', (l) => l.filter((i) => i.complete && i.naturalWidth > 0).length)) === 17, { rows: rows.length });
  await shot(page, 'U5-tray-after-update');
  await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1500);
  const d2 = await drafts(page, acc.id);
  record('U6', 'Closed and opened again: still the same 17, unattached', d2.length === 17 && d2.map((x) => x.id).sort().join() === ids0.join() && d2.every((x) => !x.inst), { drafts: d2.length });
  // U7 the scan 1.0.15 saved without images can be repaired: Edit, Choose from them, the photo that belongs to it.
  await go(page, '#/edit/' + e0[0].id); await page.waitForSelector('#ef'); await sleep(1500);
  await page.click('[data-opentray]'); await page.waitForSelector('.sheet .tray-it'); await sleep(1200);
  await selectPhotos(page, [9], acc.id); await page.click('.sheet [data-tradd]'); await sleep(1200);
  await finishTile(page);
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => /^#\/entry\//.test(location.hash), null, { timeout: 15000 }).catch(() => {}); await sleep(1500);
  const e7 = await entries(page, acc.id), st7 = await stored(page, acc.id), d7 = await drafts(page, acc.id);
  record('U7', 'The scan 1.0.15 saved without images can be repaired: Edit, Choose from them, finish the right photo, Save changes', e7.length === 1 && e7[0].id === e0[0].id && e7[0].images.length === 1 && st7.length === 1 && whichPhoto(st7[0].rgb) === 9 && d7.length === 16, { images: e7[0] && e7[0].images.length, photo: st7[0] && whichPhoto(st7[0].rgb), kept: d7.length });
  await P.ctx.close();
} else if (want('U')) record('U0', 'The 1.0.15 bundle is needed for the upgrade check', false, OLD_WWW);

// ---------- W: wording ----------
if (want('W')) {
  const acc = await account();
  const W = await phone({ acc });
  const { page } = W;
  await go(page, '#/new'); await page.waitForSelector('#ef'); await sleep(800);
  const w = await page.evaluate(() => ({ h: document.querySelector('#fsh-type').textContent, q: document.querySelector('#lab-type').textContent.replace('Required', '').trim(), form: document.querySelector('#fs-type').textContent }));
  // Save is shown only once a scan is chosen; submitting the form without one shows the message where the choice is.
  await pickSupervision(page); await page.evaluate(() => document.querySelector('#ef').requestSubmit()); await sleep(500);
  const miss = await text(page, '[data-req="type"] .field-err, [data-req="type"] .msg, [data-req="type"] [role=alert]') || await page.evaluate(() => document.querySelector('[data-req="type"]').textContent);
  record('W1', 'The scan form\'s first section is "Scan", asking "Which scan did you do?"; Application, Scan type and What scan? are gone', w.h === 'Scan' && w.q === 'Which scan did you do?' && !/Application|Scan type|What scan\?/.test(w.form), w);
  record('W2', 'Saving without choosing says "Choose which scan you did."', /Choose which scan you did\./.test(miss || ''), (miss || '').slice(0, 120));
  await shot(page, 'W1-scan-heading');
  await W.ctx.close();
}

// ---------- S: annotation size on a Fold7, folded and unfolded ----------
if (want('S')) {
  const acc = await account();
  for (const [label, w, h] of [['folded', 412, 915], ['unfolded', 884, 1032]]) {
    const S = await phone({ acc, width: w, height: h });
    const { page } = S;
    const img = path.join(OUT, 'size-test.png');
    if (!fs.existsSync(img)) { const b = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, 800, 600); return c.toDataURL('image/png').split(',')[1]; }); fs.writeFileSync(img, Buffer.from(b, 'base64')); }
    await go(page, '#/new?type=cardiac'); await sleep(1200);
    await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas'); await sleep(500);
    await page.click('.editor [data-tab=annotate]').catch(() => {}); await sleep(150);
    await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'LV'); await page.click('.editor .ed-pop button.apply'); await sleep(250);
    const setS = (v) => page.evaluate((v) => { const s = document.querySelector('.editor [data-szr]'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    const sz = () => page.evaluate(() => { const s = document.querySelector('.editor [data-szr]'); return { v: Number(s.value), min: Number(s.min), max: Number(s.max), mid: (Number(s.min) + Number(s.max)) / 2 }; });
    const s0 = await sz();
    await setS(-100); await sleep(150); await shot(page, `S-${label}-smallest`);
    await sleep(900); const lo = (await annSizes(page, acc.id)).pop();
    await setS(100); await sleep(150); await shot(page, `S-${label}-largest`); await sleep(900); const hi = (await annSizes(page, acc.id)).pop();
    await setS(0); await sleep(1000); const mid = (await annSizes(page, acc.id)).pop();
    const vis = await page.evaluate(() => { const s = document.querySelector('.editor [data-szr]'); const r = s.getBoundingClientRect(); return { w: r.width, inView: r.top >= 0 && r.bottom <= innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
    record(`S-${label}`, `Fold7 ${label} (${w}x${h}): the size slider runs -100 to 100 with the usual size at the exact middle, fully on screen`, s0.v === 0 && s0.min === -100 && s0.max === 100 && s0.mid === 0 && vis.w > 120 && vis.inView && !vis.overflow && lo === 0.012 && hi === 0.42 && mid === 0.058, { s0, vis, lo, mid, hi });
    await S.ctx.close();
  }
  record('S-range', 'The ends are further apart than in 1.0.14 (text 1.2% to 42% of the shorter side; 1.6% to 30% before)', E.sizeAt('text', -100) === 0.012 && E.sizeAt('text', 100) === 0.42 && E.sizeAt('text', 0) === 0.058 && E.sizeAt('dot', 100) === 0.4 && E.sizeAt('arrow', -100) === 0.01, { text: [E.sizeAt('text', -100), E.sizeAt('text', 0), E.sizeAt('text', 100)], dot: [E.sizeAt('dot', -100), E.sizeAt('dot', 100)], line: [E.sizeAt('arrow', -100), E.sizeAt('arrow', 100)], picto: [E.sizeAt('picto', -100), E.sizeAt('picto', 100)] });
}

const errs = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
record('Z', 'No script errors in the app', errs.length === 0, errs.slice(0, 5).join(' | ') || 'none');
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
