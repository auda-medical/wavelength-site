// 1.0.13 (19) directly to 1.0.15 (21) as an in-place Android update (the owner's phone has 1.0.13; 1.0.14 was never
// installed there), adapted from e2e-1014-upgrade-emulator.mjs. Also checks a setting made in 1.0.13 (dark theme) survives.
// Original note: an in-place Android update on the emulator, with local data made in 1.0.13: a scan
// with a photo saved offline (not yet synced). Uses the emulator-only debug builds of both (same debug key, WebView
// debugging on in scratch copies only). Airplane mode; a synthetic cached account; synthetic picture only.
// Run:   node tools/e2e-1015-upgrade-emulator.mjs <outdir> <1.0.13 debug apk> <1.0.15 debug apk>
import fs from 'node:fs';
import path from 'node:path';
import { kit, sleep, PKG } from './emulator-kit.mjs';

const [OUT, OLD, NEW] = [path.resolve(process.argv[2] || 'e2e-upgrade-emu'), process.argv[3], process.argv[4]];
fs.mkdirSync(OUT, { recursive: true });
const K = kit({ out: OUT });
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const ACC = { id: 990015, email: 'emulator.upgrade@example.com', name: 'Emulator Upgrade', firstName: 'Emulator', lastName: 'Upgrade', declarationAt: Date.now(), profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true }, emailStatus: 'verified' };
const state = (page) => page.evaluate((id) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id);
  r.onsuccess = () => { const d = r.result; const t = d.transaction(['entries', 'images']); const o = {}; t.objectStore('entries').getAll().onsuccess = (e) => { o.e = e.target.result; }; t.objectStore('images').getAll().onsuccess = (e) => { o.i = e.target.result; }; t.oncomplete = () => { d.close(); ok({ entries: o.e.map((x) => ({ id: x.id, type: x.type, ind: x.indication, dirty: !!x._dirty, images: (x.images || []).length })), images: o.i.map((x) => ({ id: x.id, entry: x.entryId, bytes: x.blob ? x.blob.size : 0, sha: x.sha256 || '' })) }); }; };
  r.onerror = () => ok(null);
}), ACC.id);

K.adb('uninstall', PKG); K.adb('install', OLD); K.start(); await sleep(8000);
let page = await K.connect();
await page.evaluate(async (acc) => { localStorage.setItem('wl-acc', JSON.stringify(acc)); await window.WLNative.plugin('NativeBiometric').setData({ key: 'wavelength.session', value: 'emulator-test-token-not-valid-anywhere' }); }, ACC);
await page.reload(); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(1500);
const v0 = await page.evaluate(() => (window.WL_NATIVE || {}).version);
// A scan with a photo, saved in 1.0.13 while offline.
await page.evaluate(() => { location.hash = '#/new?type=cardiac'; }); await sleep(2000);
await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#204060'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#e0e0e0'; g.fillRect(150, 100, 100, 100);
  c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b], 'scan.png', { type: 'image/png' })); const i = document.querySelector('#pick'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); ok(); }, 'image/png'); }));
await page.waitForSelector('.editor canvas'); await sleep(1200);
await page.evaluate(() => { const d = document.querySelector('.editor [data-decl]'); d.checked = true; d.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.editor [data-a=save]').click(); }); await sleep(3000);
await page.evaluate(() => { const d = document.querySelector('.sheet [data-ok], .sheet .btn.teal'); if (d) d.click(); }); await sleep(800);
await page.evaluate(() => { document.querySelector('#ind').value = 'Made in 1.0.13'; document.querySelector('#ind').dispatchEvent(new Event('input', { bubbles: true })); const s = document.querySelector('input[name=supervision]'); s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form#ef button[type=submit]').click(); });
await sleep(4000);
const before = await state(page);
const first = K.adb('shell', 'dumpsys', 'package', PKG).match(/firstInstallTime=([^\r\n]+)/)[1];
record('U0', 'In 1.0.13: a scan with a photo saved offline (not yet synced)', v0 === '1.0.13' && before.entries.length === 1 && before.entries[0].images === 1 && before.images.length === 1 && before.entries[0].dirty, JSON.stringify({ v0, before }));

// A setting made in 1.0.13: the dark theme.
await page.evaluate(() => { localStorage.setItem('wl-theme', 'dark'); }); await sleep(500);
// Update in place (no uninstall), as Android does from the signed APK.
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(1500);
const inst = K.adb('install', '-r', NEW);
const after1 = K.adb('shell', 'dumpsys', 'package', PKG);
K.start(); await sleep(9000);
page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(2500);
const v1 = await page.evaluate(() => (window.WLNative && window.WLNative.appInfo ? window.WLNative.appInfo() : Promise.resolve({})).then((x) => x.version || (window.WL_NATIVE || {}).version));
const after = await state(page);
record('U1', 'Installed over 1.0.13 as an update: same install, version 1.0.15 (21), still signed in, no sign-in screen', /Success/.test(inst) && /versionCode=21/.test(after1) && after1.includes('firstInstallTime=' + first) && v1 === '1.0.15' && !!(await page.evaluate(() => document.querySelector('nav.tabs'))), JSON.stringify({ v1, first }));
record('U4', 'A setting made in 1.0.13 (dark theme) is kept', (await page.evaluate(() => localStorage.getItem('wl-theme'))) === 'dark');
record('U2', 'The scan, its photo (same bytes and fingerprint) and its unsynced state are unchanged', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
// The 1.0.14 additions (in 1.0.15) work on top of 1.0.13 data: a typed form is kept and offered after Android ends the app.
await page.evaluate(() => { location.hash = '#/new?type=lung'; }); await sleep(2000);
await page.evaluate(() => { const i = document.querySelector('#ind'); i.value = 'Typed after the update'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(1200);
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2500);
for (let i = 0; i < 4 && K.pid(); i++) { K.adb('shell', 'am', 'kill', PKG); await sleep(2000); }
K.start(); await sleep(8000); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(2500);
const card = await page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
const after2 = await state(page);
record('U3', 'After the update, an unfinished scan survives Android ending the app; the 1.0.13 scan is untouched', /1 unfinished scan/.test(card) && JSON.stringify(after2) === JSON.stringify(before), card);

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
