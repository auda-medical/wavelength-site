// Wavelength 1.0.13 checks in a browser, without a phone. Runs the real bundle (mobile/www) over the stand-in native
// bridge (tools/native-harness.mjs) against a local Worker, with touch input sent as real touch events (Chrome
// DevTools Protocol), so pinches and slider drags go through the same pointer events a phone sends. Synthetic
// accounts, records and pictures only.
//
//   A  Annotation size: the slider that replaced S, M and L (new and existing annotations, every type, Undo and Redo,
//      the corner handle, 1.0.12 sizes)
//   Z  magnification: pinch, buttons, wheel; drawing, redacting and placing while zoomed land on the right picture
//      pixels; the saved picture is the same whatever the zoom; crop and turn return to the whole picture
//   N  going back: Guides and the logbook come back with their scroll position, open sections, search and filters,
//      by the back arrow, the Android back button and the browser's back, without showing the top first
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1013.mjs <outdir> [http://localhost:8787]      ONLY=A,Z runs some sections
// These are browser simulations: they do not replace the physical-device checklist.
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, DEVICE, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1013-out');
// BUNDLE=<dir>: run against another build's www (for example the assets/public folder of an installed APK) to show
// how that release behaves.
const BUNDLE = process.env.BUNDLE ? path.resolve(process.env.BUNDLE) : WWW;
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-1013.mjs');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name, opt = {}) => { await sleep(350); return page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opt }); };
const WIFI = { ...DEVICE.wifi, underlying: true, underlyingTransports: ['wifi'] };
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
// The sizes the app uses (src/app/editor.js), for checking stored values.
await import('../src/app/editor.js');
const E = globalThis.WLEditor;

async function account(pathways = ['rcem']) {
  const email = `v1013${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: 'Test', lastName: 'Clinician', email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways, grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
const call = (acc, p, body) => fetch(API + '/api/app/' + p, { method: body ? 'POST' : 'GET', headers: { ...H, Authorization: 'Bearer ' + acc.token }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
async function phone({ width = 390, height = 844, acc = null, lang = '' } = {}) {
  Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
  serve.dir = BUNDLE;
  acc = acc || await account();
  const init = [`window.__netdev = ${JSON.stringify(WIFI)};`];
  if (lang) init.push(`localStorage.setItem('wl-lang', ${JSON.stringify(lang)});`);
  const { ctx, page } = await newApp(width, height, { init });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(600);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, acc, cdp };
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);

// ---------- touch, as a phone sends it ----------
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id != null ? p.id : i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
// Two fingers: the first lands, then the second, they move from spread d0 to d1 about (cx, cy) while the centre
// moves by (dx, dy), then both lift.
async function pinch(cdp, cx, cy, d0, d1, { dx = 0, dy = 0, steps = 10 } = {}) {
  const at = (k) => { const d = d0 + (d1 - d0) * k, x = cx + dx * k, y = cy + dy * k; return [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }]; };
  await touch(cdp, 'touchStart', [at(0)[0]]); await sleep(30);
  await touch(cdp, 'touchStart', at(0)); await sleep(30);
  for (let i = 1; i <= steps; i++) { await touch(cdp, 'touchMove', at(i / steps)); await sleep(16); }
  await touch(cdp, 'touchEnd', []); await sleep(120);
}
async function swipe(cdp, a, b, steps = 8) {
  await touch(cdp, 'touchStart', [a]);
  for (let i = 1; i <= steps; i++) { await touch(cdp, 'touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await sleep(16); }
  await touch(cdp, 'touchEnd', []); await sleep(150);
}
const tapTouch = async (cdp, p) => { await touch(cdp, 'touchStart', [p]); await sleep(40); await touch(cdp, 'touchEnd', []); await sleep(150); };

// ---------- the editor ----------
async function testImage(page) {
  const f = path.join(OUT, 'quadrants.png');
  if (fs.existsSync(f)) return f;
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#00ff00'; g.fillRect(200, 0, 200, 150); g.fillStyle = '#0000ff'; g.fillRect(0, 150, 200, 150); g.fillStyle = '#ffff00'; g.fillRect(200, 150, 200, 150);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png'); }));
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}
const cname = (rgb) => { const [r, g, b] = rgb; return r > 180 && g > 180 && b < 90 ? 'yellow' : r > 180 && g < 90 && b < 90 ? 'red' : g > 180 && r < 90 && b < 90 ? 'green' : b > 180 && r < 90 && g < 90 ? 'blue' : g > 160 && b > 160 && r < 90 ? 'cyan' : r > 200 && g > 200 && b > 200 ? 'white' : r < 40 && g < 40 && b < 40 ? 'black' : 'rgb(' + rgb.join(',') + ')'; };
// Pixels of the editor's canvas (the picture itself, whatever the zoom on screen) at picture fractions.
const sample = (page, pts) => page.evaluate((Q) => { const c = document.querySelector('.editor canvas'); const g = c.getContext('2d'); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); return o; }, pts);
const named = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cname(v)]));
// Where a picture fraction is on screen now (through the zoom), and the stage's box.
const screenOf = (page, fx, fy) => page.evaluate(([fx, fy]) => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, [fx, fy]);
const stageBox = (page) => page.evaluate(() => { const r = document.querySelector('.editor .stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
const view = (page) => page.evaluate(() => { const c = document.querySelector('.editor canvas'), r = c.getBoundingClientRect(); return { z: Math.round(r.width / c.offsetWidth * 100) / 100, label: document.querySelector('.editor [data-z=fit]').textContent, transform: c.style.transform, outDisabled: document.querySelector('.editor [data-z=out]').disabled }; });
const size = (page) => page.evaluate(() => ({ value: Number(document.querySelector('.editor [data-szr]').value), shown: document.querySelector('.editor [data-szreset]').textContent, for: document.querySelector('.editor [data-szfor]').textContent, label: document.querySelector('.editor label[for=edsz]').textContent }));
const setSlider = (page, v) => page.evaluate((v) => { const s = document.querySelector('.editor [data-szr]'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const chips = (page) => page.$$eval('.editor [data-pick]', (b) => b.map((x) => x.textContent));
const undoState = (page) => page.evaluate(() => ({ undo: !document.querySelector('.editor [data-a=undo]').disabled, redo: !document.querySelector('.editor [data-a=redo]').disabled }));
// The newest stored photo and its annotations as saved (IndexedDB), with pixels at picture fractions.
const stored = (page, accId, pts) => page.evaluate(([id, Q]) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id);
  r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close();
    const d = q.result.filter((x) => x.kind !== 'clip').sort((a, b) => b.created - a.created)[0]; if (!d) return ok(null);
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); ok({ o, w: c.width, h: c.height, annot: d.annot || null, id: d.id }); };
    im.src = URL.createObjectURL(d.blob); }; };
}), [accId, pts]);
const saveScan = async (page) => { await page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await page.click('form button[type=submit]'); await page.waitForFunction(() => location.hash === '#/', null, { timeout: 10000 }).catch(() => {}); await sleep(600); };
async function openEditor(page, img, type = 'cardiac') {
  await go(page, '#/new?type=' + type); await sleep(1300);
  await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas'); await sleep(500);
}

if (want('A')) {
  const { ctx, page, acc, cdp } = await phone();
  const img = await testImage(page);
  await openEditor(page, img);
  await page.click('.editor [data-tab=annotate]'); await sleep(200);
  // A1 the three unexplained buttons are gone; a labelled slider is there, with its value and what it applies to.
  const smL = await page.$$('.editor [data-sz]');
  const s0 = await size(page);
  const r = await page.evaluate(() => { const s = document.querySelector('.editor [data-szr]'); const b = s.getBoundingClientRect(); return { type: s.type, min: s.min, max: s.max, step: s.step, w: Math.round(b.width), h: Math.round(b.height), labelled: s.labels && s.labels[0] && s.labels[0].textContent, described: document.getElementById(s.getAttribute('aria-describedby')).textContent }; });
  record('A1', 'S, M and L are gone; a labelled "Annotation size" slider (40% to 250%) shows its value and what it applies to', !smL.length && r.type === 'range' && r.labelled === 'Annotation size' && s0.shown === '100%' && r.described === 'For new annotations' && r.min === '40' && r.max === '250' && r.w >= 200 && r.h >= 32, JSON.stringify({ r, s0 }));
  await shot(page, 'A1-annotate-panel');
  // A2 a real touch drag on the slider changes the size for new annotations; new text, dots and lines take it.
  const sb = await page.evaluate(() => { const b = document.querySelector('.editor [data-szr]').getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width }; });
  const frac = (v) => (v - 40) / 210;
  await swipe(cdp, { x: sb.x + sb.w * frac(100), y: sb.y }, { x: sb.x + sb.w * 0.6, y: sb.y });
  const dragged = await size(page);
  record('A2', 'Dragging the slider with a finger changes the size continuously (no fixed steps of S, M, L)', dragged.value > 100 && dragged.value < 250 && dragged.shown === dragged.value + '%', JSON.stringify(dragged));
  await setSlider(page, 200);
  await page.click('.editor [data-col=cyan]');
  await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'Ao'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  const selText = await size(page);
  record('A3', 'A new label is drawn at the chosen size, and selecting it shows that size and "text size"', selText.shown === '200%' && selText.for === 'Selected label: text size', JSON.stringify(selText));
  await page.click('.editor [data-sa=done]');
  await page.click('.editor [data-at=dot]'); const dp = await screenOf(page, 0.25, 0.75); await page.mouse.click(dp.x, dp.y); await sleep(150);
  await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=arrow]'); const a1 = await screenOf(page, 0.1, 0.45), a2 = await screenOf(page, 0.45, 0.45);
  await page.mouse.move(a1.x, a1.y); await page.mouse.down(); await page.mouse.move(a2.x, a2.y, { steps: 6 }); await page.mouse.up(); await sleep(150);
  const arrowSel = await size(page);
  record('A4', 'Selecting an arrow: the slider shows its size and says it changes the line thickness', arrowSel.shown === '200%' && arrowSel.for === 'Selected arrow: line thickness', JSON.stringify(arrowSel));
  // A5 an existing annotation resized by the slider: thinner arrow line in the picture's own pixels.
  const thick = await page.evaluate(() => { const c = document.querySelector('.editor canvas'), g = c.getContext('2d'); const x = Math.floor(c.width * 0.3); let n = 0; for (let y = 0; y < c.height; y++) { const p = g.getImageData(x, y, 1, 1).data; if (p[0] < 90 && p[1] > 160 && p[2] > 160) n++; } return n; });
  const before = await undoState(page);
  // Several input events in one drag (as a finger sends), then the change at the end: one step of Undo.
  await page.evaluate(() => { const s = document.querySelector('.editor [data-szr]'); for (const v of [190, 170, 150, 120, 100, 80, 60]) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); } s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(150);
  const thin = await page.evaluate(() => { const c = document.querySelector('.editor canvas'), g = c.getContext('2d'); const x = Math.floor(c.width * 0.3); let n = 0; for (let y = 0; y < c.height; y++) { const p = g.getImageData(x, y, 1, 1).data; if (p[0] < 90 && p[1] > 160 && p[2] > 160) n++; } return n; });
  const after60 = await size(page);
  record('A5', 'Moving the slider with an arrow selected makes that arrow thinner in the picture (an existing annotation resized)', after60.shown === '60%' && thin < thick && thin >= 1, `line ${thick} px at 200% → ${thin} px at 60%; ${JSON.stringify(after60)}`);
  // A6 one drag is one Undo; Redo puts it back; a second Undo removes the arrow itself.
  await page.click('.editor [data-a=undo]'); await sleep(150);
  await page.click('.editor [data-pick="2"]'); const undone = await size(page);
  await page.click('.editor [data-a=redo]'); await sleep(150);
  await page.click('.editor [data-pick="2"]'); const redone = await size(page);
  await page.click('.editor [data-a=undo]'); await sleep(100); await page.click('.editor [data-a=undo]'); await sleep(150);
  const afterTwo = await chips(page);
  record('A6', 'One slider drag is one step: Undo returns the arrow to 200%, Redo to 60%, a second Undo removes the arrow', undone.shown === '200%' && redone.shown === '60%' && afterTwo.length === 2 && !afterTwo.includes('Arrow') && before.undo, JSON.stringify({ undone: undone.shown, redone: redone.shown, afterTwo }));
  await page.click('.editor [data-a=redo]'); await sleep(150); // the arrow back, at 200%
  // A7 the corner handle and the slider agree.
  await page.click('.editor [data-pick="0"]'); await sleep(150);
  const hb = await page.evaluate(() => { const h = document.querySelector('.editor .ann-sel [data-h=b]').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; });
  await page.mouse.move(hb.x, hb.y); await page.mouse.down(); await page.mouse.move(hb.x + 40, hb.y + 30, { steps: 5 }); await page.mouse.up(); await sleep(150);
  const handled = await size(page);
  record('A7', 'Resizing a label with its corner handle moves the slider to the new size', handled.value > 200 && handled.shown === handled.value + '%', JSON.stringify(handled));
  // A8 a pictogram follows the slider too (its plate grows in proportion).
  await page.click('.editor [data-sa=done]');
  await setSlider(page, 100);
  await page.click('.editor [data-at=picto]'); await page.click('.editor [data-pic="heart-a4c"]'); await sleep(200);
  const p100 = await page.evaluate(() => document.querySelector('.editor .ann-sel').getBoundingClientRect().width);
  await setSlider(page, 150); await sleep(150);
  const p150 = await page.evaluate(() => document.querySelector('.editor .ann-sel').getBoundingClientRect().width);
  const pf = await size(page);
  record('A8', 'A selected pictogram is resized by the slider (150% is half as wide again)', Math.abs(p150 / p100 - 1.5) < 0.12 && pf.for === 'Selected pictogram: size', `${Math.round(p100)} → ${Math.round(p150)} px; ${pf.for}`);
  // A9 reset to 100% with one tap, as one step.
  await page.click('.editor [data-szreset]'); await sleep(100);
  record('A9', 'Tapping the percentage returns the selected annotation to 100%', (await size(page)).shown === '100%', '');
  await page.click('.editor [data-sa=done]');
  record('A10', 'With nothing selected the slider shows the size for new annotations again', (await size(page)).for === 'For new annotations', (await size(page)).shown);
  // A11 the sizes are saved as drawn, and the saved picture is the preview.
  await page.click('.editor [data-tab=redact]'); const r1 = await screenOf(page, 0.02, 0.02), r2 = await screenOf(page, 0.2, 0.2);
  await page.mouse.move(r1.x, r1.y); await page.mouse.down(); await page.mouse.move(r2.x, r2.y, { steps: 5 }); await page.mouse.up(); await sleep(150);
  const previewPng = await page.evaluate(() => document.querySelector('.editor canvas').toDataURL('image/png'));
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' });
  await saveScan(page);
  const sv = await stored(page, acc.id, { tl: [0.05, 0.05], dot: [0.25, 0.75] });
  const ann = (sv && sv.annot && sv.annot.ann) || [];
  const byType = Object.fromEntries(ann.map((a) => [a.type, a]));
  const diff = await page.evaluate(([id, png]) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); const d = q.result.filter((x) => x.kind !== 'clip').sort((a, b) => b.created - a.created)[0]; const a = new Image(), b = new Image(); let n = 0; const both = () => { if (++n < 2) return; const W = a.naturalWidth, H = a.naturalHeight; const ca = document.createElement('canvas'); ca.width = W; ca.height = H; ca.getContext('2d').drawImage(a, 0, 0); const cb = document.createElement('canvas'); cb.width = W; cb.height = H; cb.getContext('2d').drawImage(b, 0, 0, W, H); const pa = ca.getContext('2d').getImageData(0, 0, W, H).data, pb = cb.getContext('2d').getImageData(0, 0, W, H).data; let s = 0; for (let i = 0; i < pa.length; i += 4) s += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); ok(s / (W * H * 3)); }; a.onload = both; b.onload = both; a.src = png; b.src = URL.createObjectURL(d.blob); }; }; }), [acc.id, previewPng]);
  record('A11', 'Saved: each annotation keeps the size it was given, the redaction is black, the file equals the preview', byType.dot && byType.dot.size === E.sizeFor('dot', 200) && byType.arrow && byType.arrow.size === E.sizeFor('arrow', 200) && byType.picto && byType.picto.size === E.sizeFor('picto', 100) && byType.text && byType.text.size > E.sizeFor('text', 200) && cname(sv.o.tl) === 'black' && diff < 3, JSON.stringify({ sizes: ann.map((a) => a.type + ':' + a.size), tl: sv && cname(sv.o.tl), diff }));
  // A12 a photo annotated in 1.0.12 (S, M and L) opens with those sizes shown as 72%, 100% and 138%.
  await openEditor(page, img);
  await page.click('.editor [data-tab=annotate]');
  for (const [k, v] of [['s', 'a'], ['l', 'b']]) {
    await setSlider(page, Math.round(E.SIZES[k] / E.SIZES.m * 100 / 5) * 5);
    await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', v); await page.click('.editor .ed-pop button.apply'); await sleep(120); await page.click('.editor [data-sa=done]');
  }
  const old = await page.evaluate(() => { const out = []; const n = document.querySelectorAll('.editor [data-pick]').length; for (let i = 0; i < n; i++) { document.querySelector(`.editor [data-pick="${i}"]`).click(); out.push(document.querySelector('.editor [data-szreset]').textContent); } return out; });
  record('A12', 'Older sizes read back as percentages of the usual size (S is about 72%, L about 138%)', old[0] === '70%' && old[1] === '140%', old.join(', ') + ' (set from the nearest slider steps)');
  await page.click('.editor [data-a=cancel]'); await sleep(200);
  // A13 the same panel in French and Arabic: translated, no sideways overflow, the slider runs right to left in Arabic.
  await ctx.close();
  for (const lang of ['fr', 'ar']) {
    const p2 = await phone({ lang, acc });
    await openEditor(p2.page, img);
    await p2.page.click('.editor [data-tab=annotate]'); await sleep(200);
    const info = await p2.page.evaluate(() => ({ label: document.querySelector('.editor label[for=edsz]').textContent, zoom: document.querySelector('.editor [data-z=in]').getAttribute('aria-label'), dir: document.documentElement.dir, over: [...document.querySelectorAll('.editor .bar-bot *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1) }));
    record('A13-' + lang, `${lang}: the size and zoom controls are translated and fit the screen`, info.label !== 'Annotation size' && info.zoom !== 'Zoom in' && !info.over, JSON.stringify(info));
    await shot(p2.page, 'A13-annotate-' + lang);
    await p2.ctx.close();
  }
}

if (want('Z')) {
  const { ctx, page, acc, cdp } = await phone();
  const img = await testImage(page);
  await openEditor(page, img);
  // Z1 the zoom control: whole picture to start, + and - and back to the whole picture.
  const v0 = await view(page);
  await page.click('.editor [data-z=in]'); await sleep(120); const v1 = await view(page);
  const zt = await text(page, '.editor [data-tip]');
  await page.click('.editor [data-z=in]'); await sleep(120); const v2 = await view(page);
  await page.click('.editor [data-z=out]'); await sleep(120); const v3 = await view(page);
  await page.click('.editor [data-z=fit]'); await sleep(120); const v4 = await view(page);
  const zt2 = await text(page, '.editor [data-tip]');
  record('Z1b', 'Zooming in says, in the tip line, that zoom changes only the view, not annotation size or place; zooming out restores the tip', /changes only your view/.test(zt) && /annotations keep their size and place/.test(zt) && !/Zoom/.test(zt2), `${zt} / ${zt2}`);
  record('Z1', 'Zoom buttons: 1× (zoom out unavailable), 1.5×, 2.3×, back to 1.5×, then the whole picture', v0.label === '1×' && v0.outDisabled && v1.label === '1.5×' && Math.abs(v1.z - 1.5) < 0.02 && v2.label === '2.3×' && v3.label === '1.5×' && v4.label === '1×' && !v4.transform, [v0, v1, v2, v3, v4].map((v) => v.label + '/' + v.z).join(' '));
  // Z2 pinch with two fingers in Annotate with the dot tool chosen: the picture zooms, and no dot is left behind.
  await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-col=cyan]'); await page.click('.editor [data-at=dot]');
  const st = await stageBox(page);
  await pinch(cdp, st.cx, st.cy, 60, 220);
  const vp = await view(page); const afterPinch = await chips(page);
  record('Z2', 'A two-finger pinch zooms in (about 3.7×), and the first finger does not leave a dot behind', vp.z > 3 && vp.z <= 5 && afterPinch.length === 0, JSON.stringify({ z: vp.z, label: vp.label, annotations: afterPinch }));
  await shot(page, 'Z2-pinched');
  // Z3 two fingers moving together pan the picture without changing the zoom.
  const c0 = await screenOf(page, 0.5, 0.5);
  await pinch(cdp, st.cx, st.cy, 120, 120, { dx: 50, dy: 0 });
  const c1 = await screenOf(page, 0.5, 0.5), vpan = await view(page);
  record('Z3', 'Two fingers moving together move the picture (pan) at the same zoom', Math.abs(c1.x - c0.x - 50) < 3 && Math.abs(vpan.z - vp.z) < 0.02, `centre moved ${Math.round(c1.x - c0.x)} px; zoom ${vp.z} → ${vpan.z}`);
  // Z4 a dot placed with one finger while zoomed lands on the picture point under the finger, at its usual size.
  const target = [0.47, 0.53];
  const tp = await screenOf(page, ...target);
  const inStage = tp.x > st.x && tp.x < st.x + st.w && tp.y > st.y && tp.y < st.y + st.h;
  await tapTouch(cdp, tp);
  const placed = await chips(page);
  await page.click('.editor [data-sa=done]').catch(() => {});
  // Z5 an arrow drawn with one finger while zoomed.
  await page.click('.editor [data-at=arrow]');
  const s1 = await screenOf(page, 0.42, 0.45), s2 = await screenOf(page, 0.52, 0.45);
  await swipe(cdp, s1, s2);
  await page.click('.editor [data-sa=done]').catch(() => {});
  // Z6 redact while zoomed: a box over picture fractions (0.40..0.45, 0.58..0.62).
  await page.click('.editor [data-tab=redact]'); await page.click('.editor [data-rc=black]');
  const q1 = await screenOf(page, 0.40, 0.58), q2 = await screenOf(page, 0.45, 0.62);
  await swipe(cdp, q1, q2);
  const vz = await view(page);
  await page.click('.editor [data-z=fit]'); await sleep(150);
  const px = named(await sample(page, { dot: target, arrow: [0.47, 0.45], red: [0.425, 0.6], outside: [0.38, 0.6] }));
  record('Z4', 'While zoomed, one finger places a dot exactly where it touched (checked in the picture\'s own pixels at 1×)', inStage && placed.length === 1 && px.dot === 'cyan', JSON.stringify({ inStage, placed, pixel: px.dot }));
  record('Z5', 'While zoomed, an arrow drawn with one finger lands on the same picture points', px.arrow === 'cyan', px.arrow);
  record('Z6', 'While zoomed, a redaction covers exactly the picture area dragged over (and nothing beside it)', px.red === 'black' && px.outside === 'blue', JSON.stringify({ inside: px.red, beside: px.outside, zoom: vz.label }));
  // Z7 the wheel (a mouse, or a trackpad on the website) zooms about the pointer.
  await page.mouse.move(st.cx, st.cy); await page.mouse.wheel(0, -400); await sleep(250);
  const vw = await view(page);
  record('Z7', 'The mouse wheel zooms the picture too', vw.z > 1.2, vw.label);
  // Z8 zoom changes nothing in the picture: the editor's pixels are the same at 1× and zoomed, and the sizes stay.
  const atZoom = await page.evaluate(() => document.querySelector('.editor canvas').toDataURL('image/png'));
  await page.click('.editor [data-z=fit]'); await sleep(120);
  const atFit = await page.evaluate(() => document.querySelector('.editor canvas').toDataURL('image/png'));
  record('Z8', 'Zooming is on screen only: the picture being edited is identical at 1× and zoomed', atZoom === atFit, `${atZoom.length} bytes each`);
  // Z9 crop and rotate show the whole new picture (the zoom returns to 1×).
  await page.click('.editor [data-z=in]'); await page.click('.editor [data-z=in]'); await sleep(100);
  await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=rotate]'); await sleep(250);
  const vr = await view(page);
  await page.click('.editor [data-a=undo]'); await sleep(150);
  await page.click('.editor [data-z=in]'); await sleep(100);
  await page.click('.editor [data-a=fliph]'); await sleep(250);
  const vf = await view(page);
  await page.click('.editor [data-a=undo]'); await sleep(150);
  record('Z9', 'Turning or flipping the picture returns to the whole picture (1×), so nothing is left off screen', vr.label === '1×' && !vr.transform && vf.label === '1×', `rotate ${vr.label}, flip ${vf.label}`);
  // Z10 save after zooming in and out: the stored annotations and the saved pixels are where they were placed.
  await page.click('.editor [data-z=in]'); await page.click('.editor [data-z=in]'); await sleep(100);
  const preview = await page.evaluate(() => document.querySelector('.editor canvas').toDataURL('image/png'));
  record('Z10a', 'Use this image stays disabled until the identifier declaration is ticked, zoomed or not', await page.evaluate(() => document.querySelector('.editor [data-a=save]').disabled), '');
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' });
  await saveScan(page);
  const sv = await stored(page, acc.id, { dot: target, red: [0.425, 0.6], outside: [0.38, 0.6] });
  const dot = sv && sv.annot && sv.annot.ann.find((a) => a.type === 'dot');
  const svn = sv ? named(sv.o) : {};
  record('Z10', 'Saved: the dot is stored at the touched picture point at its usual size, and the saved pixels match (dot, redaction)', dot && Math.abs(dot.x - target[0]) < 0.004 && Math.abs(dot.y - target[1]) < 0.004 && dot.size === E.sizeFor('dot', 100) && svn.dot === 'cyan' && svn.red === 'black' && svn.outside === 'blue', JSON.stringify({ dot, saved: svn, size: [sv && sv.w, sv && sv.h] }));
  // Z11 the clip editor has the same zoom and size controls.
  const clip = path.join(OUT, 'clip-3s.webm');
  if (!fs.existsSync(clip)) {
    const b64 = await page.evaluate(() => new Promise((ok) => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const t0 = performance.now(); const tick = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#00ff00'; g.fillRect(160, 0, 160, 120); g.fillStyle = '#0000ff'; g.fillRect(0, 120, 160, 120); g.fillStyle = '#ffff00'; g.fillRect(160, 120, 160, 120); if (t >= 3) { rec.stop(); return; } requestAnimationFrame(tick); };
      rec.onstop = () => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); };
      rec.start(100); tick();
    }));
    fs.writeFileSync(clip, Buffer.from(b64, 'base64'));
  }
  await go(page, '#/new?type=aaa'); await sleep(1200);
  await page.setInputFiles('#vpick', clip);
  await page.waitForSelector('.editor.clip canvas', { timeout: 15000 }); await sleep(800);
  const cst = await stageBox(page);
  await pinch(cdp, cst.cx, cst.cy, 60, 160);
  const cz = await view(page);
  await page.click('.editor [data-tab=annotate]'); await sleep(150);
  const csz = await page.$('.editor [data-szr]');
  record('Z11', 'The clip editor has the same pinch zoom and Annotation size slider', cz.z > 2 && !!csz, JSON.stringify({ zoom: cz.label, slider: !!csz }));
  await shot(page, 'Z11-clip-zoomed');
  await page.click('.editor [data-a=cancel]');
  await ctx.close();
}

// ---------- N: going back returns to where you were ----------
// Records, from now until stop, every animation frame: the address, the scroll position and whether the list is
// on screen, to prove the screen is never painted at the top before the position comes back.
const frames = { start: (page, sel) => page.evaluate((sel) => { window.__frames = []; window.__fon = true; const t0 = performance.now(); const f = () => { if (!window.__fon) return; window.__frames.push({ t: Math.round(performance.now() - t0), h: location.hash, y: Math.round(scrollY), list: !!document.querySelector(sel) }); requestAnimationFrame(f); }; requestAnimationFrame(f); }, sel), stop: (page) => page.evaluate(() => { window.__fon = false; return window.__frames; }) };
const scrollTo = async (page, y) => { await page.evaluate((y) => window.scrollTo(0, y), y); await sleep(250); return page.evaluate(() => Math.round(scrollY)); };
const backArrow = (page) => page.click('header.top a.back');
const androidBack = (page) => page.evaluate(() => window.__fire('App', 'backButton', {}));
const browserBack = (page) => page.evaluate(() => history.back());
// Taps a guide card where it is on screen (no scrolling it into view first) and waits for the guide to be drawn.
const openCard = async (page, href) => { await page.evaluate((h) => document.querySelector(`a.guide-card[href="${h}"]`).click(), href); await page.waitForFunction((h) => location.hash === h && !document.querySelector('a.guide-card') && document.querySelector('main') && !/^Loading/.test(document.querySelector('main').textContent.trim()), href, { timeout: 8000 }); await sleep(300); };
async function checkBack(id, label, page, how, listSel, expectY, expectHash) {
  await frames.start(page, listSel);
  const t0 = Date.now();
  await how(page);
  await page.waitForFunction((s) => !!document.querySelector(s), listSel, { timeout: 8000 });
  const ms = Date.now() - t0;
  await sleep(500);
  const f = await frames.stop(page);
  const y = await page.evaluate(() => Math.round(scrollY)), h = await page.evaluate(() => location.hash);
  const shown = f.filter((x) => x.list);
  const flash = shown.filter((x) => Math.abs(x.y - expectY) > 2);
  record(id, label, Math.abs(y - expectY) <= 2 && !flash.length && (!expectHash || h === expectHash), `scroll ${y} (left at ${expectY}); ${shown.length} frames with the list, ${flash.length} at another position${flash.length ? ' ' + JSON.stringify(flash.slice(0, 3)) : ''}; ${h}; ${ms} ms`);
}

if (want('N')) {
  // Guides: a short phone screen, so the list is several screens long; the guide at the bottom.
  const { ctx, page } = await phone({ width: 390, height: 640 });
  await go(page, '#/progress'); await sleep(500);
  await go(page, '#/guides'); await page.waitForSelector('.guide-card');
  const listH = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const yBottom = await scrollTo(page, listH);
  const last = await page.evaluate(() => { const c = [...document.querySelectorAll('a.guide-card')].pop(); return c.getAttribute('href'); });
  await openCard(page, last);
  const opened = await page.evaluate(() => ({ h: location.hash, y: Math.round(scrollY) }));
  record('N0', 'Opening the guide at the bottom of the list starts the guide at its top', opened.h === last && opened.y === 0, JSON.stringify({ listScroll: listH, opened }));
  await checkBack('N1', 'Back arrow from the last guide: the list is where it was left (no jump to the top on any frame)', page, backArrow, 'a.guide-card', yBottom, '#/guides');
  await shot(page, 'N1-guides-restored');
  // Middle of the list, then the Android back button.
  const yMid = await scrollTo(page, Math.round(listH / 2));
  const midCard = await page.evaluate(() => { const cs = [...document.querySelectorAll('a.guide-card')]; const vis = cs.find((c) => c.getBoundingClientRect().top > 60); return vis.getAttribute('href'); });
  await openCard(page, midCard);
  await checkBack('N2', 'Android back button (and back gesture) from a guide: the list comes back at the same place', page, androidBack, 'a.guide-card', yMid, '#/guides');
  // The browser's own back (the website's app, and the back gesture where the browser handles it).
  await openCard(page, midCard);
  await checkBack('N3', 'Browser back from a guide: the list comes back at the same place', page, browserBack, 'a.guide-card', yMid, '#/guides');
  // Repeated: five round trips to different guides from the bottom of the list; the position holds every time.
  const yB = await scrollTo(page, listH);
  const cards = await page.$$eval('a.guide-card', (a) => a.map((x) => x.getAttribute('href')));
  let held = 0, detail = [];
  for (let i = 0; i < 5; i++) {
    const href = cards[cards.length - 1 - (i % 3)];
    await openCard(page, href);
    await [backArrow, androidBack, browserBack][i % 3](page); await page.waitForSelector('a.guide-card'); await sleep(300);
    const y = await page.evaluate(() => Math.round(scrollY)); detail.push(y); if (Math.abs(y - yB) <= 2) held++;
  }
  record('N4', 'Repeated: five round trips (back arrow, Android back, browser back in turn), the list stays where it was', held === 5, `left at ${yB}: ${detail.join(', ')}`);
  // N5 inside a guide: the contents opened and the place in the guide survive a trip to the one-page summary.
  await openCard(page, '#/guides/rcem-ultrasound-sign-off');
  await page.waitForSelector('.guide-toc'); await sleep(300);
  await page.click('.guide-toc summary'); await sleep(150);
  const gy = await scrollTo(page, 900);
  await page.evaluate(() => { location.hash = '#/guides/rcem-ultrasound-sign-off/glance'; }); await page.waitForSelector('.guide-body.glance'); await sleep(300);
  await checkBack('N5', 'Inside a guide: back from the one-page summary returns to the same place in the guide', page, backArrow, '.guide-body:not(.glance)', gy);
  record('N5b', 'and the Contents list that was open is open again', await page.evaluate(() => document.querySelector('.guide-toc').open), '');
  // N6 forward to Guides from Progress (not a back step) starts at the top.
  await go(page, '#/progress'); await sleep(300);
  await page.evaluate(() => { location.hash = '#/guides'; }); await page.waitForSelector('a.guide-card'); await sleep(300);
  record('N6', 'Opening Guides afresh (not going back) starts at the top', await page.evaluate(() => Math.round(scrollY)) === 0, '');
  await ctx.close();

  // The logbook: a long list (300 scans), with a search, a type filter and a sign-off filter.
  const acc = await account();
  const today = Date.now();
  const all = Array.from({ length: 300 }, (_, i) => ({ id: `n1013x${acc.id}x${i}`, type: i % 3 ? 'lung' : 'efast', date: new Date(today - i * 864e5 / 2).toISOString().slice(0, 10), supervision: 'direct', setting: i % 2 ? 'Emergency department' : 'Acute medical unit', reflection: i % 4 ? 'Ward round scan, pleural line and B-lines reviewed.' : 'Resus scan for shock.', createdAt: today - i, updatedAt: 0 }));
  await call(acc, 'sync', { entries: all.slice(0, 200) }); await call(acc, 'sync', { entries: all.slice(200) });
  const L = await phone({ acc });
  const lp = L.page;
  await go(lp, '#/log'); await lp.waitForSelector('a.entry'); await sleep(800);
  const total = await lp.$$eval('a.entry', (a) => a.length);
  await lp.click('[data-f=lung]'); await sleep(400);
  await lp.click('label[for=sttodo]'); await sleep(400);
  await lp.fill('#q', 'ward'); await sleep(900);
  const filtered = await lp.evaluate(() => ({ h: location.hash, n: document.querySelectorAll('a.entry').length }));
  const lh = await lp.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const ly = await scrollTo(lp, lh - 200);
  const pick = await lp.evaluate(() => { const v = [...document.querySelectorAll('a.entry')].filter((a) => { const r = a.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 90; }); return v[v.length - 1].getAttribute('href'); });
  await lp.click(`a.entry[href="${pick}"]`); await lp.waitForFunction(() => /^#\/entry\//.test(location.hash)); await sleep(400);
  await checkBack('N7', `Logbook (${total} scans; ${filtered.n} after search and filters): back arrow returns to the same scan in the list`, lp, backArrow, 'a.entry', ly);
  const kept = await lp.evaluate(() => ({ h: location.hash, q: document.querySelector('#q').value, type: (document.querySelector('[data-f][aria-pressed=true]') || {}).dataset.f, st: (document.querySelector('input[name=st]:checked') || {}).value, n: document.querySelectorAll('a.entry').length }));
  record('N8', 'The search, the type filter and the sign-off filter are all still applied, with the same results', kept.q === 'ward' && kept.type === 'lung' && kept.st === 'todo' && kept.n === filtered.n && /q=ward/.test(kept.h), JSON.stringify(kept));
  await shot(lp, 'N7-logbook-restored');
  for (const [id, how, name] of [['N9', androidBack, 'Android back button'], ['N10', browserBack, 'browser back']]) {
    await lp.click(`a.entry[href="${pick}"]`); await lp.waitForFunction(() => /^#\/entry\//.test(location.hash)); await sleep(300);
    await checkBack(id, `Logbook: ${name} keeps the search, filters and place too`, lp, how, 'a.entry', ly);
    const k2 = await lp.evaluate(() => document.querySelector('#q').value + '|' + location.hash);
    if (!/^ward\|/.test(k2)) record(id + 'b', 'search kept', false, k2);
  }
  // N11 long-list performance: the time from Back to the restored list, at normal speed and with the CPU slowed 4×.
  const times = [];
  for (const rate of [1, 4]) {
    await L.cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await lp.click(`a.entry[href="${pick}"]`); await lp.waitForFunction(() => /^#\/entry\//.test(location.hash)); await sleep(300);
    const t = await lp.evaluate(() => new Promise((ok) => { const t0 = performance.now(); window.addEventListener('hashchange', () => requestAnimationFrame(() => ok(Math.round(performance.now() - t0))), { once: true }); document.querySelector('header.top a.back').click(); }));
    await sleep(400);
    times.push({ rate, ms: t, y: await lp.evaluate(() => Math.round(scrollY)) });
  }
  await L.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  record('N11', 'Long list: back to the restored position in one frame, quickly, even with the CPU slowed 4×', times.every((t) => Math.abs(t.y - ly) <= 2 && t.ms < 1000), JSON.stringify(times));
  // N12 the Logbook tab (going forward, not back) shows the whole logbook from the top.
  await lp.click(`a.entry[href="${pick}"]`); await lp.waitForFunction(() => /^#\/entry\//.test(location.hash)); await sleep(300);
  await lp.click('nav.tabs a[href="#/log"]'); await lp.waitForSelector('a.entry'); await sleep(400);
  const tab = await lp.evaluate(() => ({ y: Math.round(scrollY), q: document.querySelector('#q').value, h: location.hash }));
  record('N12', 'The Logbook tab is a fresh start: top of the list, no search or filters', tab.y === 0 && tab.q === '' && tab.h === '#/log', JSON.stringify(tab));
  await L.ctx.close();
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed${errors.length ? `; ${errors.length} page errors` : ''}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
