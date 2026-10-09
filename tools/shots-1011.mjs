// Visual review screenshots for Wavelength 1.0.11: the same synthetic content and the same phone size for any app
// bundle, so a 1.0.10 bundle (before) and a 1.0.11 bundle (after) can be compared side by side.
//
// Setup: node mobile/scripts/build-www.mjs (or keep a copy of an older mobile/www), then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/shots-1011.mjs <outdir> [bundle dir, default mobile/www] [http://localhost:8787]
//
// Screens: Home counts, the sync pill, the connection warnings (server unreachable with one scan waiting and with
// none, offline), the cardiac scan form (top, each section, full length), the photo editor and the clip editor, in
// light and dark themes. Synthetic data only: the image and clip are drawn here and say "SYNTHETIC". Screenshots show
// layout; they are not evidence of performance on a phone.
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, setDevice, DEVICE, serve } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'shots-1011-out');
if (process.argv[3]) serve.dir = path.resolve(process.argv[3]);
const API = process.argv[4] || 'http://localhost:8787';
localOnly(API, 'tools/shots-1011.mjs');
fs.mkdirSync(OUT, { recursive: true });
const CLIP_SECONDS = Number(process.env.CLIP_SECONDS || 22);
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reset = () => Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });

async function account() {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Sam', lastName: 'Synthetic', email: `shots${t}@example.com`, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id };
}
function seed(page, id, entries, kv = {}) {
  return page.evaluate(([id, entries, kv]) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const tx = r.result.transaction(['entries', 'kv'], 'readwrite'); entries.forEach((e) => tx.objectStore('entries').put(e)); Object.entries(kv).forEach(([k, v]) => tx.objectStore('kv').put({ k, v })); tx.oncomplete = () => { r.result.close(); ok(); }; };
  }), [id, entries, kv]);
}
async function phone(theme, acc) {
  reset();
  const init = [`window.__netdev = ${JSON.stringify(DEVICE.wifi)};`, `localStorage.setItem('wl-theme', ${JSON.stringify(theme)});`];
  const { ctx, page } = await newApp(390, 844, { init });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(800);
  return { ctx, page };
}
const reload = async (page) => { await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs', { timeout: 15000 }); };
const shot = (page, name, opt = {}) => page.screenshot({ path: path.join(OUT, name + '.png'), ...opt });

// A synthetic "ultrasound" frame: a fan with speckle, an orientation marker (R at top left, an arrow pointing right)
// so flips and rotations are visible, and a header strip where a machine would show patient details.
const DRAW = `window.__drawFrame = (g, W, H, t) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b2a3a'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#e8edf2'; g.font = '600 15px sans-serif'; g.fillText('SYNTHETIC TEST  NOT A PATIENT  ID 0000000', 12, 23);
  const cx = W / 2, cy = 46, R = H - 70;
  g.save(); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, Math.PI * 0.28, Math.PI * 0.72); g.closePath(); g.clip();
  let s = 7 + Math.floor(t * 9);
  for (let i = 0; i < 2600; i++) { s = (s * 16807) % 2147483647; const a = Math.PI * (0.28 + 0.44 * ((s % 1000) / 1000)); const rr = R * (((s >> 10) % 1000) / 1000); const v = 60 + ((s >> 3) % 150); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, 2); }
  g.fillStyle = '#05070a'; g.beginPath(); g.ellipse(cx - 40 + Math.sin(t * 3) * 6, cy + R * 0.55, 70, 42, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = '#7FC4CC'; g.font = '700 30px sans-serif'; g.fillText('R', 16, 76);
  g.strokeStyle = '#7FC4CC'; g.lineWidth = 4; g.beginPath(); g.moveTo(16, 96); g.lineTo(76, 96); g.lineTo(64, 86); g.moveTo(76, 96); g.lineTo(64, 106); g.stroke();
  g.fillStyle = '#e8edf2'; g.font = '13px sans-serif'; g.fillText('t = ' + t.toFixed(1) + ' s', W - 92, H - 14);
};`;
async function makeMedia(app) {
  // Drawn on a blank page: the app's Content Security Policy rightly refuses inline scripts.
  const page = await app.context().newPage();
  await page.goto('about:blank');
  const imgFile = path.join(OUT, 'synthetic-image.jpg'), vidFile = path.join(OUT, `synthetic-clip-${CLIP_SECONDS}s.webm`);
  await page.addScriptTag({ content: DRAW });
  if (!fs.existsSync(imgFile)) {
    const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; window.__drawFrame(c.getContext('2d'), 800, 600, 0); c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/jpeg', 0.92); }));
    fs.writeFileSync(imgFile, Buffer.from(b64, 'base64'));
  }
  if (!fs.existsSync(vidFile)) {
    const b64 = await page.evaluate((secs) => new Promise((ok) => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1500000 });
      const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const t0 = performance.now(); let raf;
      const tick = () => { const t = (performance.now() - t0) / 1000; window.__drawFrame(g, 640, 480, t); if (t >= secs) { rec.stop(); return; } raf = requestAnimationFrame(tick); };
      rec.onstop = () => { cancelAnimationFrame(raf); const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); };
      rec.start(250); tick();
    }), CLIP_SECONDS);
    fs.writeFileSync(vidFile, Buffer.from(b64, 'base64'));
  }
  await page.close();
  return { imgFile, vidFile };
}

const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).toISOString().slice(0, 10);
const mk = (acc, i, date, extra = {}) => ({ id: 'shot' + i + 'x' + acc.id, type: ['aaa', 'efast', 'cardiac', 'lung', 'dvt'][i % 5], date, supervision: 'direct', createdAt: Date.now() - i, updatedAt: 1000 + i, ...extra });

for (const theme of ['light', 'dark']) {
  const acc = await account();
  const { ctx, page } = await phone(theme, acc);
  const T = (n) => theme + '-' + n;
  // Home with a settled logbook: five scans, two signed off, one signed assessment.
  net.offline = true; await setDevice(page, DEVICE.none);
  const signed = { signoff: { status: 'confirmed', code: 'SO-TEST-0001', name: 'Dr Synthetic', method: 'link' } };
  const ents = [mk(acc, 1, today, signed), mk(acc, 2, month + '-01'), mk(acc, 3, prev, signed), mk(acc, 4, prev), mk(acc, 5, prev)];
  await seed(page, acc.id, ents, { assessments: [{ id: 'as1', status: 'signed', kind: 'formative', outcome: 'competent', assessed_on: today, pathway: 'rcem', module: 'rcem-aaa' }] });
  reset(); await page.evaluate(() => { window.__netdev = { connected: true, validated: true, vpn: false, transports: ['wifi'], id: '1' }; });
  await reload(page); await sleep(1500);
  await shot(page, T('01-home'));
  await shot(page, T('02-pill-synced'), { clip: { x: 0, y: 0, width: 390, height: 90 } });
  // Server unreachable (a VPN or filter drops the traffic) with one scan waiting.
  await seed(page, acc.id, [mk(acc, 6, today, { _dirty: true, _new: true, updatedAt: 0 })]);
  net.blocked = true; await page.evaluate(() => { window.__netdev = { connected: true, validated: true, vpn: true, transports: ['vpn', 'wifi'], id: '2' }; });
  await reload(page); await sleep(4500);
  await shot(page, T('03-warning-unreachable-1-waiting'));
  await shot(page, T('03b-pill-cant-sync'), { clip: { x: 0, y: 0, width: 390, height: 90 } });
  await page.click('button.sync-pill'); await sleep(500);
  await shot(page, T('03c-sync-details'));
  await page.keyboard.press('Escape'); await sleep(200);
  // Nothing waiting, server still unreachable.
  net.blocked = false; await page.evaluate(() => { document.querySelector('[data-sbretry]') && document.querySelector('[data-sbretry]').click(); });
  await sleep(2500); net.blocked = true;
  await reload(page); await sleep(4500);
  await shot(page, T('04-warning-unreachable-0-waiting'));
  // VPN interface left up with nothing under it (Flight mode, Wi-Fi off, NordVPN still "connected").
  await seed(page, acc.id, [mk(acc, 7, today, { _dirty: true, _new: true, updatedAt: 0 })]);
  net.blocked = false; net.offline = true;
  await page.evaluate(() => { window.__netdev = { connected: true, validated: false, vpn: true, transports: ['vpn'], id: '2', underlying: false, underlyingTransports: [] }; });
  await reload(page); await sleep(4500);
  await shot(page, T('05-vpn-without-network-1-waiting'));
  reset(); await setDevice(page, DEVICE.wifi); await sleep(3000);

  // The cardiac scan form, filled with synthetic answers.
  await page.evaluate(() => { location.hash = '#/new?type=cardiac'; }); await sleep(1600);
  await shot(page, T('06-form-log-one-cardiac'));
  const pick = (name, value) => page.evaluate(([n, v]) => { const i = [...document.querySelectorAll('input[name="' + n + '"]')].find((x) => x.value === v); if (i) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } }, [name, value]);
  for (const v of ['PLAX', 'A4C', 'Subcostal']) await pick('f.views', v);
  await pick('f.lv', 'Reduced'); await pick('f.rv', 'No'); await pick('f.pericardial', 'None'); await pick('f.ivc', 'Plethoric');
  await pick('overall', 'Abnormal'); await pick('quality', 'Adequate');
  await page.fill('#ind', 'Breathless, hypotensive. Synthetic case.');
  await page.fill('#interp', 'Globally reduced LV function, no pericardial effusion, plethoric IVC. Synthetic text.');
  await page.selectOption('#setting', { index: 1 });
  await page.selectOption('#conf', { index: 2 }); await page.selectOption('#conc', { index: 1 });
  await page.fill('#impact', 'Started inotrope discussion, referred to cardiology.');
  await page.fill('#refl', 'Synthetic reflection: obtain the subcostal view earlier.');
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  await shot(page, T('07-form-full'), { fullPage: true });
  const scrollShot = async (sel, name) => {
    await page.evaluate((s) => { const el = document.querySelector(s); if (el) { const top = document.querySelector('.top'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - (top ? top.getBoundingClientRect().height : 0) - 12); } }, sel); await sleep(350);
    await shot(page, T(name));
  };
  await scrollShot('#findings', '08-form-findings');
  await scrollShot('input[name=overall]', '09-form-overall-quality');
  await scrollShot('input[name=supervision]', '10-form-supervision');
  await scrollShot('#gal', '11-form-images-reflection');
  await scrollShot('#counts', '12-form-counts-towards');

  // Photo and clip editors, with synthetic media.
  const { imgFile, vidFile } = await makeMedia(page);
  await page.setInputFiles('#pick', imgFile); await sleep(1200);
  await shot(page, T('13-photo-editor'));
  await page.evaluate(() => { const c = document.querySelector('.editor [data-a=cancel]'); c && c.click(); }); await sleep(300);
  await page.setInputFiles('#vpick', vidFile); await sleep(2500);
  await shot(page, T('14-clip-editor'));
  // Slide the start to the end of the source clip, as a learner exploring the controls would.
  await page.evaluate(() => { const s = document.querySelector('.editor [data-start], .editor input[type=range]'); if (s) { s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); } }); await sleep(1200);
  await shot(page, T('15-clip-editor-start-moved'));
  await page.evaluate(() => { const c = document.querySelector('.editor [data-a=cancel]'); c && c.click(); }); await sleep(300);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
console.log('Screenshots in', OUT, errors.length ? `(${errors.length} page errors, see errors.txt)` : '(no page errors)');
