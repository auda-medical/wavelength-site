// The owner's Fold7 sequence on the emulator, through the real Android file path (WLCapture), then an in-place update
// to 1.0.16 (ChatGPT 12 Oct 10:48). 17 leftover photos in the folder earlier versions used (Android/data/.../files/
// Pictures, JPEG_*.jpg), each a different colour and number (synthetic, no patient). In 1.0.15: Review them first, the
// bulk Add to this scan, a scan saved without them. Then 1.0.16 installed over it: all 17 kept, separate, unattached;
// chosen one by one into separate scans, each saved once; Wavelength ended by Android and reopened; new leftovers
// found by 1.0.16 itself; nothing in the gallery or shared storage at any point.
// Emulator only: debug builds of both (same debug key, WebView debugging on in scratch copies), airplane mode,
// adb root (to place the leftover files). Run:
//   node tools/e2e-1016-emulator.mjs <outdir> <1.0.15 debug apk> <1.0.16 debug apk>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { kit, sleep, PKG } from './emulator-kit.mjs';

const [OUT, OLD, NEW] = [path.resolve(process.argv[2] || 'e2e-1016-emu'), process.argv[3], process.argv[4]];
fs.mkdirSync(OUT, { recursive: true });
const K = kit({ out: OUT });
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', typeof detail === 'string' ? detail : JSON.stringify(detail)); };
const ACC = { id: 990016, email: 'emulator.recovery@example.com', name: 'Emulator Recovery', firstName: 'Emulator', lastName: 'Recovery', declarationAt: Date.now(), profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true }, emailStatus: 'verified' };
const sh = (cmd) => { try { return K.adb('shell', cmd); } catch (e) { return String(e.stdout || ''); } };
const LD = '/sdcard/Android/data/' + PKG + '/files/Pictures';
const sharedFiles = () => sh('find /sdcard/Android/data/' + PKG + ' -type f 2>/dev/null').split('\n').filter((l) => l.trim());
const galleryRows = () => sh('content query --uri content://media/external/images/media --projection _data').split('\n').filter((l) => /_data=/.test(l));

// 17 synthetic JPEGs, made on this computer (headless Chromium), each a colour and a number standing for one scan.
const HUES = Array.from({ length: 17 }, (_, i) => Math.round(i * 360 / 17));
async function makeJpegs(dir, tag) {
  const b = await chromium.launch(); const p = await b.newPage();
  const list = await p.evaluate((hues) => Promise.all(hues.map((h, i) => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = `hsl(${h} 80% 50%)`; g.fillRect(0, 0, 640, 480); g.fillStyle = '#000'; g.font = 'bold 160px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), 320, 300); c.toBlob((bl) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(bl); }, 'image/jpeg', 0.9); }))), HUES);
  await b.close();
  fs.mkdirSync(dir, { recursive: true });
  return list.map((d, i) => { const n = `JPEG_202610${String(1 + Math.floor(i / 3)).padStart(2, '0')}_${String(80000 + i * 1111).padStart(6, '0')}_${tag}${i}.jpg`; fs.writeFileSync(path.join(dir, n), Buffer.from(d, 'base64')); return n; });
}
function placeLegacy(dir, names) {
  sh('mkdir -p ' + LD);
  for (const n of names) { K.adb('push', path.join(dir, n), '/data/local/tmp/' + n); sh(`cp /data/local/tmp/${n} ${LD}/${n} && rm /data/local/tmp/${n}`); }
  // Owned by the app, as files the app wrote itself would be.
  const uid = (sh(`stat -c %u /sdcard/Android/data/${PKG}`) || '').trim();
  if (uid) sh(`chown -R ${uid}:${uid} ${LD}`);
}
const drafts = (page) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id + '-drafts'); r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('media')) { d.close(); return ok([]); } const t = d.transaction(['media', 'state']); const o = {}; t.objectStore('media').getAll().onsuccess = (e) => { o.m = e.target.result; }; t.objectStore('state').getAll().onsuccess = (e) => { o.s = e.target.result; }; t.oncomplete = () => { d.close(); const st = {}; o.s.forEach((x) => { st[x.id] = x; }); ok(o.m.map((m) => ({ id: m.id, name: m.name || '', formKey: m.formKey, inst: m.inst || null, legacy: !!m.legacy, file: m.file ? m.file.size : 0, result: !!m.result, stage: (st[m.id] || {}).stage }))); }; }; r.onerror = () => ok([]); }), ACC.id);
const logbook = (page) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const d = r.result; const t = d.transaction(['entries', 'images']); const o = {}; t.objectStore('entries').getAll().onsuccess = (e) => { o.e = e.target.result.filter((x) => !x.deleted).map((x) => ({ id: x.id, images: (x.images || []).map((i) => i.id) })); }; t.objectStore('images').getAll().onsuccess = (e) => { o.i = e.target.result.map((x) => ({ id: x.id, entryId: x.entryId, blob: x.blob })); }; t.oncomplete = () => { Promise.all(o.i.map((x) => createImageBitmap(x.blob).then((b) => { const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0); const p = g.getImageData(Math.round(b.width * 0.12), Math.round(b.height * 0.12), 1, 1).data; return { id: x.id, entryId: x.entryId, rgb: [p[0], p[1], p[2]] }; }))).then((imgs) => { d.close(); ok({ entries: o.e, images: imgs }); }); }; }; }), ACC.id);
function whichPhoto(rgb) {
  const [r, g, b] = rgb.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  let best = 0; HUES.forEach((x, i) => { const dd = Math.min(Math.abs(x - h), 360 - Math.abs(x - h)); if (dd < Math.min(Math.abs(HUES[best] - h), 360 - Math.abs(HUES[best] - h))) best = i; });
  return best + 1;
}
let page = null;
const go = (h) => page.evaluate((h) => { location.hash = h; }, h);
const relaunch = async () => { K.start(); await sleep(8000); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(3000); };
const click = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.click(); }, sel);
const check = (id) => page.evaluate((id) => { const li = document.querySelector(`.tray-it[data-trit="${id}"]`); const i = li.querySelector('input'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }, id);
const finishTile = async () => { await click('#gal .kept'); await page.waitForSelector('.editor canvas', { timeout: 20000 }); await sleep(1500); await page.evaluate(() => { const d = document.querySelector('.editor [data-decl]'); d.checked = true; d.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.editor [data-a=save]').click(); }); await page.waitForFunction(() => !document.querySelector('.editor'), null, { timeout: 30000 }); await sleep(1200); };
const supervision = () => page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
const chooseType = async () => { if (await page.evaluate(() => document.querySelector('#rest').hidden)) { await click('label[for=t0]'); await sleep(800); } };

const src = path.join(OUT, 'legacy');
const names = await makeJpegs(src, 'a');
const numOf = (n) => names.indexOf(n) + 1;
const gallery0 = galleryRows().length;

// ---------- 1.0.15, as on the owner's Fold7 ----------
K.adb('uninstall', PKG); K.adb('install', OLD); K.start(); await sleep(8000);
page = await K.connect();
await page.waitForFunction(() => !!(window.WLNative && window.WLNative.plugin), undefined, { timeout: 60000 });
await page.evaluate(async (acc) => { localStorage.setItem('wl-acc', JSON.stringify(acc)); await window.WLNative.plugin('NativeBiometric').setData({ key: 'wavelength.session', value: 'emulator-test-token-not-valid-anywhere' }); }, ACC);
// The account is in place once Home has drawn with it (and the WebView has written its storage).
await page.reload(); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 60000 }); await sleep(3000);
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(3000);
K.adb('shell', 'am', 'force-stop', PKG);
placeLegacy(src, names);
const placed = sharedFiles().filter((f) => /JPEG_/.test(f)).length;
await relaunch();
await page.waitForSelector('.sheet [data-lgrev]', { timeout: 20000 });
const v0 = await page.evaluate(() => (window.WL_NATIVE || {}).version);
const sheet0 = await page.evaluate(() => document.querySelector('.sheet').textContent);
await click('.sheet [data-lgrev]'); await sleep(12000);
const imported = (await drafts(page)).length;
await page.waitForSelector('[data-kepthome] a', { timeout: 20000 }); await click('[data-kepthome] a');
await page.waitForSelector('[data-addearlier]', { timeout: 20000 }); await click('[data-addearlier]'); await sleep(1500);
await click('label[for=t0]'); await page.waitForSelector('#gal .kept'); await sleep(800);
const tiles15 = await page.evaluate(() => document.querySelectorAll('#gal .kept').length);
K.shot('O1-1015-seventeen-in-one-scan');
await supervision(); await click('form button[type=submit]'); await page.waitForSelector('.sheet [data-anyway]'); await click('.sheet [data-anyway]'); await sleep(4000);
const lb0 = await logbook(page), d0 = await drafts(page);
record('O1', '1.0.15 on the emulator reproduces the Fold7: 17 leftovers imported and removed from the folder, added in bulk, a scan saved with no images', v0 === '1.0.15' && placed === 17 && /17 photos/.test(sheet0) && imported === 17 && tiles15 === 17 && lb0.entries.length === 1 && lb0.entries[0].images.length === 0 && d0.length === 17 && sharedFiles().filter((f) => /JPEG_/.test(f)).length === 0, { v0, placed, imported, tiles15, entries: lb0.entries.length, drafts: d0.length });
const ids0 = d0.map((x) => x.id).sort();

// ---------- 1.0.16 installed over it ----------
const first = (K.adb('shell', 'dumpsys', 'package', PKG).match(/firstInstallTime=([^\r\n]+)/) || [])[1];
K.adb('install', '-r', NEW); await sleep(2000);
const first2 = (K.adb('shell', 'dumpsys', 'package', PKG).match(/firstInstallTime=([^\r\n]+)/) || [])[1];
await relaunch();
const v1 = await page.evaluate(() => (window.WL_NATIVE || {}).version);
const card1 = await page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
const d1 = await drafts(page), lb1 = await logbook(page);
record('O2', 'Updated in place to 1.0.16 (same first-install time): all 17 kept, the same ones, none attached; the empty scan unchanged', v1 === '1.0.16' && first && first === first2 && d1.length === 17 && d1.map((x) => x.id).sort().join() === ids0.join() && d1.every((x) => x.file > 0) && lb1.entries.length === 1 && lb1.entries[0].images.length === 0 && lb1.images.length === 0 && /17 photos/.test(card1) && /Review photos and clips/.test(card1), { v1, first, first2, drafts: d1.length, card1 });
K.shot('O2-home-after-update');
await click('[data-kepthome] [data-kftray]'); await page.waitForSelector('.tray-it', { timeout: 20000 }); await sleep(4000);
const rows = await page.evaluate(() => [...document.querySelectorAll('.tray-it')].map((li) => ({ id: li.dataset.trit, checked: li.querySelector('input').checked, img: (li.querySelector('img') || {}).naturalWidth || 0, origin: /Left by an earlier version/.test(li.textContent) })));
record('O3', 'The recovery tray on the phone: 17 rows, each with its preview, none selected, each said to be left by an earlier version', rows.length === 17 && rows.every((r) => !r.checked && r.img > 0 && r.origin), { rows: rows.length, previews: rows.filter((r) => r.img > 0).length, saysEarlierVersion: rows.filter((r) => r.origin).length });
K.shot('O3-tray');
// Photos 1 to 3 for scan A (by file name), finish two, keep the third for later.
const byNum = (n) => d1.find((x) => numOf(x.name) === n).id;
for (const n of [1, 2, 3]) await check(byNum(n));
await click('[data-tradd]'); await page.waitForSelector('#ef', { timeout: 20000 }); await sleep(3000); await chooseType();
const tA = await page.evaluate(() => ({ kept: document.querySelectorAll('#gal .kept').length, note: (document.querySelector('[data-earlier]') || {}).textContent || '' }));
await finishTile(); await finishTile();
await supervision(); await click('form button[type=submit]'); await page.waitForSelector('.sheet [data-anyway]'); await click('.sheet [data-anyway]'); await sleep(4000);
// Photos 4 and 5 for scan B, from the scan form.
await go('#/new'); await page.waitForSelector('#ef'); await sleep(2500); await chooseType();
await click('[data-opentray]'); await page.waitForSelector('.sheet .tray-it'); await sleep(3000);
for (const n of [4, 5]) await check(byNum(n));
await click('.sheet [data-tradd]'); await sleep(2500);
await finishTile(); await finishTile();
await supervision(); await click('form button[type=submit]'); await sleep(5000);
const lb2 = await logbook(page), d2 = await drafts(page);
const scans = {}; lb2.images.forEach((i) => { (scans[i.entryId] = scans[i.entryId] || []).push(whichPhoto(i.rgb)); });
const sets = Object.values(scans).map((l) => l.sort((a, b) => a - b).join(',')).sort();
record('O4', 'On the phone: scan A gets two of photos 1 to 3, scan B photos 4 and 5, each saved once; the unfinished third and the other 12 stay kept', tA.kept === 3 && /Not finished yet: 3 photos/.test(tA.note) && lb2.images.length === 4 && sets.length === 2 && sets.some((s) => s === '4,5') && sets.some((s) => /^[123],[123]$/.test(s)) && d2.length === 13 && d2.every((x) => !x.inst), { sets, drafts: d2.length });
// Android ends Wavelength (as when short of memory) and it is opened again.
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2000);
for (let i = 0; i < 4 && K.pid(); i++) { K.adb('shell', 'am', 'kill', PKG); await sleep(2000); }
if (K.pid()) K.adb('shell', 'am', 'force-stop', PKG);
await relaunch();
const d3 = await drafts(page), lb3 = await logbook(page), card3 = await page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
record('O5', 'Ended by Android and reopened: the same 13 kept, unattached; the two scans unchanged', d3.length === 13 && d3.every((x) => !x.inst) && lb3.images.length === 4 && /13 photos/.test(card3), { drafts: d3.length, images: lb3.images.length, card3 });
// New leftovers found by 1.0.16 itself: straight into the tray, one by one, the folder emptied only after the copies.
const names2 = await makeJpegs(path.join(OUT, 'legacy2'), 'b');
K.adb('shell', 'am', 'force-stop', PKG); placeLegacy(path.join(OUT, 'legacy2'), names2.slice(0, 4));
await relaunch();
await page.waitForSelector('.sheet [data-lgrev]', { timeout: 20000 }); await click('.sheet [data-lgrev]');
await page.waitForFunction(() => location.hash === '#/kept' && document.querySelectorAll('.tray-it').length === 17, null, { timeout: 60000 }); await sleep(2000);
const d4 = await drafts(page);
record('O6', '1.0.16 finding 4 more leftovers: Review them first opens the tray with all 17 (13 + 4), none selected; the 4 files are removed only after the copies', d4.length === 17 && d4.filter((x) => x.legacy).length === 4 && d4.filter((x) => /^JPEG_/.test(x.name)).length === 17 && sharedFiles().filter((f) => /JPEG_/.test(f)).length === 0 && (await page.evaluate(() => [...document.querySelectorAll('.tray-it input')].every((i) => !i.checked))), { drafts: d4.length });
K.shot('O6-tray-with-new-leftovers');
record('O7', 'Nothing reached the phone\'s gallery or shared storage at any point', galleryRows().length === gallery0 && sharedFiles().length === 0, { gallery: galleryRows().length - gallery0, shared: sharedFiles() });
const fails = results.filter((r) => !r.pass);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
