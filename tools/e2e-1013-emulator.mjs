// Wavelength 1.0.13 on an Android emulator: the real Android WebView, the real Capacitor runtime and plugins, and
// real Android input for the back button (KEYCODE_BACK), the back gesture (an edge swipe with gesture navigation)
// and one-finger touches (adb input). Pinches are sent as touch events through DevTools, because adb cannot send two
// fingers. Playwright cannot attach to a WebView, so a small DevTools client (below) drives the page. No server: the emulator is in airplane mode and the app opens a synthetic cached account from the phone,
// so nothing reaches thewavelength.co.uk.
//
// Setup (emulator only, never a real phone):
//   - an emulator running, airplane mode on: adb shell cmd connectivity airplane-mode enable
//   - a debug build with WebView debugging on (webContentsDebuggingEnabled true in a scratch copy only), installed
//   - adb forward tcp:9333 localabstract:webview_devtools_remote_<pid of uk.co.thewavelength.app>
// Run:   node tools/e2e-1013-emulator.mjs <outdir> [adb path]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = path.resolve(process.argv[2] || 'e2e-1013-emulator-out');
const ADB = process.argv[3] || 'C:/Android/sdk/platform-tools/adb.exe';
fs.mkdirSync(OUT, { recursive: true });
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const shot = (name) => { adb('shell', 'screencap', '-p', '/sdcard/wl.png'); adb('pull', '/sdcard/wl.png', path.join(OUT, name + '.png')); };

const airplane = adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').trim();
if (airplane !== '1') throw new Error('Turn airplane mode on first: nothing may reach the live server.');

// ---------- A minimal DevTools client for the WebView ----------
function client(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } };
  const send = (method, params = {}) => new Promise((ok, no) => { const i = ++id; wait[i] = (d) => (d.error ? no(new Error(method + ': ' + d.error.message)) : ok(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise((ok) => { ws.onopen = () => ok({ send, close: () => ws.close() }); });
}
let C = null;
for (const t of await fetch('http://localhost:9333/json').then((r) => r.json())) {
  if (t.type !== 'page' || !t.url.startsWith('https://localhost')) continue;
  const c = await client(t.webSocketDebuggerUrl);
  const r = await c.send('Runtime.evaluate', { expression: '!!document.querySelector("#app")', returnByValue: true });
  if (r.result.value) { C = c; break; } c.close();
}
if (!C) throw new Error('No Wavelength page in the WebView');
const page = {
  evaluate: async (fn, arg) => { const r = await C.send('Runtime.evaluate', { expression: `(${fn})(${arg === undefined ? '' : JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; },
  waitForFunction: async (fn, arg, { timeout = 8000 } = {}) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(150); } throw new Error('timeout: ' + String(fn).slice(0, 80)); },
  waitForSelector: (sel, o) => page.waitForFunction((s) => !!document.querySelector(s), sel, o),
  click: async (sel) => { await page.waitForSelector(sel); await page.evaluate((s) => document.querySelector(s).click(), sel); },
  fill: (sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]),
  reload: async () => { await C.send('Page.reload', {}); await sleep(2500); },
};
const cdp = C;
const browser = { close: async () => C.close() };
const ua = await page.evaluate(() => navigator.userAgent);
const dev = await page.evaluate(() => ({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight, native: !!(window.WLNative && window.WLNative.on) }));
console.log('WebView:', ua.match(/Chrome\/[\d.]+/)[0], JSON.stringify(dev));
// Screen pixels of a CSS point. Where the WebView sits on the screen is measured once with a real tap on a blank
// overlay (the status and navigation bars may or may not overlap it).
// Before real input: the app's window must have the focus (the emulator's System UI sometimes shows a "not
// responding" dialog under software rendering, which takes the input instead).
const appFocused = async () => { for (let i = 0; i < 10; i++) { const w = adb('shell', 'dumpsys', 'window'); if (/mCurrentFocus=.*uk\.co\.thewavelength\.app/.test(w)) return true; if (/mCurrentFocus=.*Not Responding/.test(w)) adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); await sleep(1500); } return false; };
const CAL = { x: 540, y: 420 };
// A transparent cover over the whole page takes the calibration tap, so it cannot press anything (the header logo,
// for one, opens the website in the in-app browser).
await page.evaluate(() => { window.__calp = null; const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent'; d.addEventListener('pointerdown', (e) => { window.__calp = { x: e.clientX, y: e.clientY }; e.preventDefault(); e.stopPropagation(); }, true); d.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTimeout(() => d.remove(), 50); }, true); document.documentElement.appendChild(d); });
await appFocused();
adb('shell', 'input', 'tap', String(CAL.x), String(CAL.y)); await sleep(1000);
const calp = await page.evaluate(() => window.__calp || null);
if (!calp) throw new Error('calibration tap not seen');
const off = { x: CAL.x - calp.x * dev.dpr, y: CAL.y - calp.y * dev.dpr };
console.log('WebView offset on screen (px):', JSON.stringify(off));
const scr = (x, y) => [String(Math.round(x * dev.dpr + off.x)), String(Math.round(y * dev.dpr + off.y))];
const tapReal = async (x, y) => { await appFocused(); adb('shell', 'input', 'tap', ...scr(x, y)); await sleep(500); };
const swipeReal = async (a, b, ms = 400) => { await appFocused(); adb('shell', 'input', 'swipe', ...scr(a.x, a.y), ...scr(b.x, b.y), String(ms)); await sleep(600); };
const backKey = async () => { await appFocused(); adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await sleep(900); };
// The system back gesture: a swipe in from the left edge, mid-screen.
const backGesture = async () => { await appFocused(); const W = dev.w * dev.dpr, H = dev.h * dev.dpr; adb('shell', 'input', 'swipe', '2', String(Math.round(H / 2)), String(Math.round(W * 0.45)), String(Math.round(H / 2)), '250'); await sleep(1000); };

// ---------- A synthetic signed-in learner with 300 scans, on the phone only ----------
const ACC = { id: 990013, email: 'emulator.test@example.com', name: 'Emulator Test', firstName: 'Emulator', lastName: 'Test', declarationAt: Date.now(), profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true }, emailStatus: 'verified' };
await page.evaluate(async (acc) => {
  localStorage.setItem('wl-acc', JSON.stringify(acc));
  await window.WLNative.plugin('NativeBiometric').setData({ key: 'wavelength.session', value: 'emulator-test-token-not-valid-anywhere' });
}, ACC);
await page.reload(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(1500);
const now = Date.now();
const entries = Array.from({ length: 300 }, (_, i) => ({ id: `emu1013x${i}`, type: i % 3 ? 'lung' : 'efast', date: new Date(now - i * 864e5 / 2).toISOString().slice(0, 10), supervision: 'direct', setting: 'Emergency department', reflection: i % 4 ? 'Ward round scan, pleural line and B-lines reviewed.' : 'Resus scan for shock.', createdAt: now - i, updatedAt: now - i }));
await page.evaluate(([id, list]) => new Promise((ok, no) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const tx = r.result.transaction(['entries'], 'readwrite'); list.forEach((e) => tx.objectStore('entries').put(e)); tx.oncomplete = () => { r.result.close(); ok(); }; tx.onerror = () => no(tx.error); }; r.onerror = () => no(r.error); }), [ACC.id, entries]);
await page.reload(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(1500);
record('M0', 'The app opens offline on the emulator with the synthetic account', await page.evaluate(() => !!document.querySelector('nav.tabs')), dev.native ? 'native bridge on' : 'native bridge OFF');

// ---------- Guides: back button, back gesture, back arrow ----------
const go = (h) => page.evaluate((h) => { location.hash = h; }, h);
const y = () => page.evaluate(() => Math.round(scrollY));
// What the learner sees: the first list item whose top is on screen, and how far down the screen it is.
const anchor = (sel) => page.evaluate((sel) => { const hb = (document.querySelector('header.top') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom; const a = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().bottom > hb + 4); return a ? { key: a.getAttribute('href'), top: Math.round(a.getBoundingClientRect().top), banner: !!document.querySelector('[data-syncbanner]:not([hidden])') } : null; }, sel);
const scrollTo = async (v) => { await page.evaluate((v) => scrollTo(0, v), v); await sleep(400); return y(); };
await go('#/progress'); await sleep(800);
await go('#/guides'); await page.waitForSelector('a.guide-card'); await sleep(800);
const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
async function roundTrip(id, label, how, at) {
  const left = await scrollTo(at); const seen = await anchor('a.guide-card');
  const card = await page.evaluate(() => { const c = [...document.querySelectorAll('a.guide-card')].filter((a) => { const r = a.getBoundingClientRect(); return r.top > 70 && r.bottom < innerHeight - 80; }).pop(); const r = c.getBoundingClientRect(); return { href: c.getAttribute('href'), x: r.left + r.width / 2, y: r.top + Math.min(40, r.height / 2) }; });
  await tapReal(card.x, card.y);
  // The emulator's own System UI sometimes stops answering under software rendering, and its dialog takes the tap:
  // dismiss it and tap once more. (Emulator only; nothing to do with the app.)
  if (!(await page.waitForFunction((h) => location.hash === h, card.href, { timeout: 3000 }).catch(() => false))) {
    if (/mCurrentFocus.*Not Responding/.test(adb('shell', 'dumpsys', 'window'))) { adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); await sleep(1500); }
    await tapReal(card.x, card.y);
  }
  await page.waitForFunction((h) => location.hash === h, card.href, { timeout: 8000 }).catch(() => {});
  await sleep(800);
  const opened = await page.evaluate(() => location.hash);
  await how();
  await page.waitForSelector('a.guide-card', { timeout: 8000 }).catch(() => {});
  await sleep(600);
  const back = await page.evaluate(() => ({ h: location.hash, y: Math.round(scrollY) })); const now = await anchor('a.guide-card');
  record(id, label, opened === card.href && back.h === '#/guides' && now && seen && now.key === seen.key && Math.abs(now.top - seen.top) <= 3, `opened ${opened} by a real tap; on screen before: ${JSON.stringify(seen)}, after: ${JSON.stringify(now)}; scrollY ${left} → ${back.y}`);
}
await roundTrip('E1', 'Guides: the Android back button (real key event) returns to the same place in the list', backKey, maxY);
shot('E1-guides-after-back-button');
await roundTrip('E2', 'Guides: the Android back gesture (real edge swipe) returns to the same place in the list', backGesture, Math.round(maxY / 2));
shot('E2-guides-after-back-gesture');
await roundTrip('E3', 'Guides: the app\'s back arrow (real tap) returns to the same place', async () => { const b = await page.evaluate(() => { const r = document.querySelector('header.top a.back').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await tapReal(b.x, b.y); }, maxY);
let held = 0; const ys = [];
for (let i = 0; i < 4; i++) { const before = results.length; await roundTrip('E4.' + i, 'repeat', i % 2 ? backGesture : backKey, maxY); if (results[before].pass) held++; ys.push(results[before].detail.replace(/^.*after: /, '')); results.pop(); }
record('E4', 'Guides: four more round trips (button and gesture in turn), the position holds every time', held === 4, ys.join(', '));

// ---------- Logbook: search and filters kept, by the back button and gesture ----------
await go('#/log'); await page.waitForSelector('a.entry', { timeout: 20000 }); await sleep(800);
await page.click('[data-f=lung]'); await sleep(600);
await page.click('label[for=sttodo]'); await sleep(600);
await page.fill('#q', 'ward'); await sleep(1200);
const want = await page.evaluate(() => ({ h: location.hash, n: document.querySelectorAll('a.entry').length }));
const lmax = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
for (const [id, how, name] of [['E5', backKey, 'back button'], ['E6', backGesture, 'back gesture']]) {
  const left = await scrollTo(Math.round(lmax * 0.8)); const seen = await anchor('a.entry');
  const row = await page.evaluate(() => { const a = [...document.querySelectorAll('a.entry')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 90; }).pop(); const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await tapReal(row.x, row.y); await page.waitForFunction(() => /^#\/entry\//.test(location.hash), null, { timeout: 8000 }).catch(() => {}); await sleep(700);
  await how(); await page.waitForSelector('a.entry', { timeout: 8000 }).catch(() => {}); await sleep(800);
  const s = await page.evaluate(() => ({ h: location.hash, y: Math.round(scrollY), q: document.querySelector('#q').value, n: document.querySelectorAll('a.entry').length }));
  const now = await anchor('a.entry');
  record(id, `Logbook (300 scans): the ${name} returns to the same scan with the search and both filters kept`, s.h === want.h && s.q === 'ward' && s.n === want.n && now && seen && now.key === seen.key && Math.abs(now.top - seen.top) <= 3, `${s.h}, ${s.n} shown; on screen before: ${JSON.stringify(seen)}, after: ${JSON.stringify(now)}; scrollY ${left} → ${s.y}`);
}
shot('E5-logbook-after-back');

// ---------- The editor: slider by real touch, pinch, placement, save ----------
await go('#/new?type=cardiac'); await sleep(1500);
await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#00ff00'; g.fillRect(200, 0, 200, 150); g.fillStyle = '#0000ff'; g.fillRect(0, 150, 200, 150); g.fillStyle = '#ffff00'; g.fillRect(200, 150, 200, 150);
  c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b], 'quadrants.png', { type: 'image/png' })); const i = document.querySelector('#pick'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); ok(); }, 'image/png'); }));
await page.waitForSelector('.editor canvas', { timeout: 15000 }); await sleep(1200);
await page.click('.editor [data-tab=annotate]'); await sleep(400);
shot('E7-annotate-panel');
const slider = await page.evaluate(() => { const r = document.querySelector('.editor [data-szr]').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
const f = (v) => (v - 40) / 210;
await swipeReal({ x: slider.x + slider.w * f(100), y: slider.y }, { x: slider.x + slider.w * f(200), y: slider.y }, 600);
const sv = await page.evaluate(() => ({ v: Number(document.querySelector('.editor [data-szr]').value), shown: document.querySelector('.editor [data-szreset]').textContent }));
record('E7', 'Annotation size slider: a real finger drag moves it (Android WebView range input)', sv.v > 150 && sv.shown === sv.v + '%', JSON.stringify(sv));
await page.click('.editor [data-col=cyan]'); await page.click('.editor [data-at=dot]');
const stage = await page.evaluate(() => { const r = document.querySelector('.editor .stage').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
const at = (k) => { const d = 60 + 180 * k; return [{ x: stage.cx - d / 2, y: stage.cy }, { x: stage.cx + d / 2, y: stage.cy }]; };
await touch('touchStart', [at(0)[0]]); await sleep(40); await touch('touchStart', at(0)); await sleep(40);
for (let i = 1; i <= 10; i++) { await touch('touchMove', at(i / 10)); await sleep(30); }
await touch('touchEnd', []); await sleep(800);
const z = await page.evaluate(() => ({ label: document.querySelector('.editor [data-z=fit]').textContent, n: document.querySelectorAll('.editor [data-pick]').length }));
record('E8', 'Pinch in the Android WebView zooms the picture, with no stray dot from the first finger', parseFloat(z.label) > 2 && z.n === 0, JSON.stringify(z));
shot('E8-zoomed');
const p = await page.evaluate(() => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.47, y: r.top + r.height * 0.53 }; });
await tapReal(p.x, p.y);
await page.click('.editor [data-z=fit]'); await sleep(500);
const px = await page.evaluate(() => { const c = document.querySelector('.editor canvas'), g = c.getContext('2d'); return [...g.getImageData(Math.floor(c.width * 0.47), Math.floor(c.height * 0.53), 1, 1).data].slice(0, 3); });
record('E9', 'A real tap while zoomed places the dot on the picture point under the finger (checked at 1×)', px[0] < 90 && px[1] > 160 && px[2] > 160, `pixel ${px.join(',')} (cyan expected)`);
// Back closes the editor without adding anything (as in 1.0.12).
await backKey();
const closed = await page.evaluate(() => !document.querySelector('.editor'));
record('E10', 'The Android back button closes the editor without adding the picture', closed, '');

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ webview: ua, device: dev, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed on the emulator`);
await browser.close();
process.exit(failed.length ? 1 : 0);
