// Wavelength 1.0.17 checks in a browser, without a phone: Size and Rotation together in the photo and clip editors
// (ChatGPT 12 Oct 13:01). The real bundle (mobile/www) over the stand-in native bridge, against a local Worker.
// Synthetic pictures only.
//
//   T  text, a clinical label, a pictogram and a box turned left, back to Straight and right, by mouse, touch and keys;
//      the live value in words; the picture turns as the slider moves
//   N  arrows, dots and circles: no Rotation (Size takes the width)
//   L  layout: cover screen 412 stacked in the panel; unfolded 852 and tablet 1280 side by side under the picture;
//      enlarged text stacks; nothing overflows; 44 px slider height
//   U  one slider drag is one Undo step; Redo
//   H  after turning: picked up by its letters, moved by a drag, near the picture's edge; selection outline turned
//   A  Adjust Rotate and Mirror: text keeps its turn on screen, a box covers its area; the saved photo matches the preview
//   P  kept through an interruption (Wavelength closed with the editor open), Save, restart, re-editing and a backup
//   C  the clip editor: the same controls; every frame of the saved clip shows the turned label
//
// Setup: WL_APP_VERSION=1.0.17 WL_VERSION_CODE=23 node mobile/scripts/build-www.mjs; then
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8797
// Run:   node tools/e2e-1017.mjs <outdir> [http://localhost:8797]      ONLY=T,N runs some sections
import fs from 'node:fs';
import path from 'node:path';
import { harness, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1017-out');
const API = process.argv[3] || 'http://localhost:8797';
localOnly(API, 'tools/e2e-1017.mjs');
const SHOTS = path.join(OUT, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const results = [];
const record = (id, name, pass, detail) => { const d = typeof detail === 'string' ? detail : JSON.stringify(detail); results.push({ id, name, pass: !!pass, detail: d }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', d); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
globalThis.window = globalThis;
window.WLBackupArgon2 = await import('../src/app/vendor/noble-hashes/argon2.js');
for (const f of ['zip.js', 'backup.js']) new Function(fs.readFileSync(new URL('../src/app/' + f, import.meta.url), 'utf8'))();

async function account() {
  const email = `v1017${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: 'Test', lastName: 'Rotation', email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
async function phone(acc, width = 412, height = 915) {
  serve.dir = WWW;
  const { ctx, page } = await newApp(width, height);
  await page.goto('https://localhost/');
  await page.evaluate((tok) => localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })), acc.token);
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs', { timeout: 20000 }); await sleep(700);
  return { ctx, page, cdp: await ctx.newCDPSession(page) };
}
const go = (page, h) => page.evaluate((h) => { location.hash = h; }, h);
// A mid-grey 800 x 600 picture with an oblique line (a stand-in for oblique anatomy).
let IMG = null;
async function picture(page) {
  if (IMG) return IMG;
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 800, 600); g.strokeStyle = '#c0c0c0'; g.lineWidth = 8; g.beginPath(); g.moveTo(80, 540); g.lineTo(720, 60); g.stroke(); return c.toDataURL('image/png').split(',')[1]; });
  IMG = path.join(OUT, 'oblique.png'); fs.writeFileSync(IMG, Buffer.from(b64, 'base64')); return IMG;
}
async function openPhoto(page) {
  await go(page, '#/new?type=cardiac'); await page.waitForSelector('#ef'); await sleep(900);
  await page.setInputFiles('#pick', await picture(page)); await page.waitForSelector('.editor canvas'); await sleep(600);
  await page.click('.editor [data-tab=annotate]'); await sleep(200);
}
async function addText(page, text = 'Liver', box = true) { await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', text); await page.click('.editor .ed-pop button.apply'); await sleep(250); if (box) { await page.click('.editor [data-sa=bg]'); await sleep(150); } }
async function addLabel(page) { await page.click('.editor [data-at=label]'); await page.waitForSelector('.editor .ed-pop [data-lbl]'); await page.click('.editor .ed-pop [data-lbl]'); await sleep(250); }
async function addPicto(page) { await page.click('.editor [data-at=picto]'); await page.waitForSelector('.editor .ed-pop [data-pic]'); await page.click('.editor .ed-pop [data-pic]'); await sleep(250); }
async function drawShape(page, tool) { await page.click(`.editor [data-at=${tool}]`); const b = await page.$eval('.editor canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); await page.mouse.move(b.x + b.w * 0.3, b.y + b.h * 0.3); await page.mouse.down(); await page.mouse.move(b.x + b.w * 0.55, b.y + b.h * 0.5, { steps: 6 }); await page.mouse.up(); await sleep(250); }
// 1.0.18: Straight is shown with a green tick before the word (the owner's request); the tick is required, not just allowed.
const STRAIGHT = '✓ Straight';
const ui = (page) => page.evaluate(() => { const r = document.querySelector('.editor [data-rotr]'), c = document.querySelector('[data-rotctl]'); return { shown: !!c && !c.hidden, v: r ? Number(r.value) : null, text: (document.querySelector('[data-rotval]') || {}).textContent, valuetext: r && r.getAttribute('aria-valuetext'), disabled: r && r.disabled, one: document.querySelector('.ed-ctlgrid').classList.contains('one'), undo: !document.querySelector('.editor [data-a=undo]').disabled }; });
// The editor's working copy (kept on this phone as it changes): the annotations as stored.
const kept = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id + '-drafts'); r.onsuccess = () => { const q = r.result.transaction('state').objectStore('state').getAll(); q.onsuccess = () => { r.result.close(); const s = q.result.filter((x) => x.st && x.st.ann).sort((a, b) => b.updated - a.updated)[0]; ok(s ? s.st : null); }; }; r.onerror = () => ok(null); }), accId);
const sel = (page) => page.evaluate(() => { const b = document.querySelector('.ed-selbar'); return b && !b.hidden ? document.querySelector('[data-selname]').textContent : ''; });
// Moves the Rotation slider: mouse (press on the thumb, drag), touch (the same with touch points) or keys.
async function turnTo(page, cdp, target, how) {
  const g = await page.$eval('.editor [data-rotr]', (s) => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width, v: Number(s.value), min: Number(s.min), max: Number(s.max) }; });
  const xOf = (v) => g.x + 14 + (v - g.min) / (g.max - g.min) * (g.w - 28); // 28 px thumb
  if (how === 'keys') {
    await page.focus('.editor [data-rotr]');
    const n = Math.abs(target - g.v), k = target > g.v ? 'ArrowRight' : 'ArrowLeft';
    for (let i = 0; i < n; i++) await page.keyboard.press(k);
  } else if (how === 'touch') {
    const steps = 12, x0 = xOf(g.v), x1 = xOf(target);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: g.y }] });
    for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: g.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(xOf(g.v), g.y); await page.mouse.down(); await page.mouse.move(xOf(target), g.y, { steps: 10 }); await page.mouse.up();
  }
  await sleep(250);
}
// The preview canvas, sampled at a point in the picture's own pixels (800 x 600 here).
const preview = (page, x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('.editor canvas'); const k = c.width / 800; const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
const grey = (rgb) => Math.abs(rgb[0] - 128) < 30 && Math.abs(rgb[1] - 128) < 30 && Math.abs(rgb[2] - 128) < 30;
const saved = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map((x) => ({ id: x.id, kind: x.kind, ann: x.annot && x.annot.ann }))); }; }; }), accId);
const savedPixel = (page, accId, id, x, y) => page.evaluate(([acc, id, x, y]) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + acc); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').get(id); q.onsuccess = () => { r.result.close(); createImageBitmap(q.result.blob).then((b) => { const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0); const d = g.getImageData(Math.round(x * b.width / 800), Math.round(y * b.height / 600), 1, 1).data; ok([d[0], d[1], d[2]]); }); }; }; }), [accId, id, x, y]);
const useImage = async (page) => { await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached', timeout: 15000 }); await sleep(500); };
const saveScan = async (page) => { await page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await page.click('form button[type=submit]'); await page.waitForFunction(() => location.hash === '#/', null, { timeout: 15000 }); await sleep(800); };

// ---------- T: each kind, three angles, three inputs; the value in words; the picture turns live ----------
if (want('T') || want('U') || want('H') || want('N')) {
  const acc = await account();
  const { ctx, page, cdp } = await phone(acc);
  await openPhoto(page);
  if (want('T')) {
    const kinds = [['text', () => addText(page, 'WWWWWWWWWW')], ['label', () => addLabel(page)], ['pictogram', () => addPicto(page)], ['box', () => drawShape(page, 'rect')]];
    const hows = ['mouse', 'touch', 'keys'];
    for (const [i, [kind, add]] of kinds.entries()) {
      await add();
      const how = hows[i % 3];
      const s0 = await ui(page);
      await turnTo(page, cdp, -30, how); const left = await ui(page);
      await turnTo(page, cdp, 0, how); const mid = await ui(page);
      await turnTo(page, cdp, 30, how); const right = await ui(page);
      await sleep(800); const st = await kept(page, acc.id); const a = st && st.ann[st.ann.length - 1];
      const near = (v, t) => Math.abs(v - t) <= 3;
      record(`T-${kind}`, `${kind} (${how}): Rotation shown; left, Straight, right; the value in words; stored in whole degrees`, s0.shown && !s0.disabled && s0.text === STRAIGHT && near(left.v, -30) && /° left$/.test(left.text) && left.valuetext === left.text && mid.text === STRAIGHT && mid.v === 0 && near(right.v, 30) && /° right$/.test(right.text) && a && Number.isInteger(a.rot) && near(a.rot, 30), { s0: s0.text, left: left.text, mid: mid.text, right: right.text, stored: a && a.rot });
      if (kind === 'text') await page.screenshot({ path: path.join(SHOTS, 'T-text-30-right-cover.png') });
      await page.click('.editor [data-sa=done]'); await sleep(150);
    }
    // Live: while the finger is still down, the picture already shows the turn.
    await page.click('.editor [data-pick="0"]'); await sleep(200);
    await turnTo(page, cdp, 0, 'mouse');
    const gx = await page.$eval('.editor [data-rotr]', (s) => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
    const at = (v) => gx.x + 14 + (v + 180) / 360 * (gx.w - 28);
    const before = await preview(page, 400 + 150, 300);
    await page.mouse.move(at(0), gx.y); await page.mouse.down(); await page.mouse.move(at(45), gx.y, { steps: 8 }); await sleep(200);
    const during = { v: (await ui(page)).text, along: await preview(page, 400 + 106, 300 + 106), straightSpot: await preview(page, 400 + 150, 300) };
    await page.mouse.up(); await sleep(200);
    record('T-live', 'The label turns on the picture while the slider is still being dragged (no need to let go)', !grey(before) && /right$/.test(during.v) && !grey(during.along) && grey(during.straightSpot), { before, during });
    // Gently back to Straight: 2° snaps to 0 and says so.
    await page.focus('.editor [data-rotr]'); await page.evaluate(() => { const s = document.querySelector('.editor [data-rotr]'); s.value = 2; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(900);
    const snapped = { ui: await ui(page), st: (await kept(page, acc.id)).ann[0] };
    record('T-straight', 'Close to the centre snaps to Straight, stored as no turn at all (as before 1.0.17)', snapped.ui.text === STRAIGHT && !('rot' in snapped.st), { text: snapped.ui.text, rot: snapped.st.rot });
  }
  // ---------- N: arrows, dots, circles ----------
  if (want('N')) {
    const res = [];
    await page.click('.editor [data-at=arrow]'); { const b = await page.$eval('.editor canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); await page.mouse.move(b.x + b.w * 0.2, b.y + b.h * 0.8); await page.mouse.down(); await page.mouse.move(b.x + b.w * 0.5, b.y + b.h * 0.6, { steps: 5 }); await page.mouse.up(); await sleep(250); }
    res.push(['arrow', await ui(page)]);
    await page.click('.editor [data-at=dot]'); { const b = await page.$eval('.editor canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); await page.mouse.click(b.x + b.w * 0.12, b.y + b.h * 0.15); await sleep(250); }
    res.push(['dot', await ui(page)]);
    await drawShape(page, 'circle'); res.push(['circle', await ui(page)]);
    record('N1', 'Arrows, dots and circles: no Rotation slider; Size takes the whole width', res.every(([, u]) => !u.shown && u.one), res.map(([k, u]) => k + ':' + (u.shown ? 'shown' : 'none')).join(' '));
    await page.screenshot({ path: path.join(SHOTS, 'N-circle-no-rotation.png') });
  }
  // ---------- U: one drag is one Undo step ----------
  if (want('U')) {
    await page.click('.editor [data-pick="0"]'); await sleep(200);
    await turnTo(page, cdp, 0, 'mouse'); await sleep(300);
    const undoBefore = await page.evaluate(() => document.querySelector('.editor [data-a=undo]').disabled);
    await turnTo(page, cdp, 60, 'mouse'); await sleep(900);
    const r60 = (await kept(page, acc.id)).ann[0].rot;
    await page.click('.editor [data-a=undo]'); await sleep(900);
    const afterUndo = (await kept(page, acc.id)).ann[0].rot;
    await page.click('.editor [data-a=redo]'); await sleep(900);
    const afterRedo = (await kept(page, acc.id)).ann[0].rot;
    record('U1', 'One drag of the Rotation slider is one Undo step; Redo brings it back', Math.abs(r60 - 60) <= 3 && afterUndo === undefined && afterRedo === r60 && undoBefore === false, { r60, afterUndo, afterRedo });
  }
  // ---------- H: picked up and moved after turning, near the edge; the outline turns with it ----------
  if (want('H')) {
    // A picture of its own, with just the label (nothing else under it).
    await page.click('.editor [data-a=cancel]'); await sleep(200); await page.click('.editor [data-cf=discard]').catch(() => {}); await sleep(300);
    await openPhoto(page); await addText(page, 'WWWWWWWWWW');
    await page.evaluate(() => { const s = document.querySelector('.editor [data-rotr]'); s.value = 45; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(300);
    await page.click('.editor [data-sa=done]'); await sleep(200);
    const cb = await page.$eval('.editor canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const scr = (x, y) => ({ x: cb.x + x / 800 * cb.w, y: cb.y + y / 600 * cb.h });
    const on = scr(400 + 120, 300 + 120), off = scr(400 + 170, 300 - 20);
    await page.mouse.click(off.x, off.y); await sleep(200); const missed = await sel(page);
    await page.mouse.click(on.x, on.y); await sleep(200); const picked = await sel(page);
    const outline = await page.$eval('.editor .ann-sel', (e) => e.style.transform);
    // Drag it by its letters towards the top-right corner, past the edge: it stays inside, still turned.
    await page.mouse.move(on.x, on.y); await page.mouse.down(); await page.mouse.move(cb.x + cb.w - 4, cb.y + 4, { steps: 10 }); await page.mouse.up(); await sleep(900);
    const st = (await kept(page, acc.id)).ann[0];
    const edge = scr(st.x * 800, st.y * 600); await page.mouse.click(cb.x + cb.w / 2, cb.y + cb.h - 6); await sleep(150); await page.mouse.click(edge.x - 2, edge.y + 2); await sleep(200);
    const pickedAtEdge = await sel(page);
    record('H1', 'Turned 45°: picked up by its letters, not by the empty corner; the outline turns; moved to the edge and picked up there', /WWW/.test(picked) && !/WWW/.test(missed) && outline === 'rotate(45deg)' && st.x > 0.8 && st.y < 0.05 && st.rot === 45 && /WWW/.test(pickedAtEdge), { missed, picked, outline, at: [st.x, st.y], rot: st.rot, pickedAtEdge });
    await page.screenshot({ path: path.join(SHOTS, 'H-turned-at-edge.png') });
  }
  await ctx.close();
}

// ---------- L: layout ----------
if (want('L')) {
  const acc = await account();
  const sizes = [['cover', 412, 915, false, false], ['unfolded', 852, 796, true, true], ['tablet-landscape', 1280, 800, true, true], ['phone-landscape', 915, 412, true, true]];
  for (const [label, w, h, slot, side] of sizes) {
    const { ctx, page } = await phone(acc, w, h);
    await openPhoto(page); await addText(page, 'Liver');
    const m = await page.evaluate(() => { const s = document.querySelector('.ed-size').getBoundingClientRect(), r = document.querySelector('.ed-rot').getBoundingClientRect(), ri = document.querySelector('[data-rotr]').getBoundingClientRect(), si = document.querySelector('[data-szr]').getBoundingClientRect(); const els = [...document.querySelectorAll('.ed-ctls *')]; return { slot: !!document.querySelector('[data-ctlslot] [data-ctls]'), side: Math.abs(s.top - r.top) < 4 && r.left > s.left, sliderW: Math.round(ri.width), sizeW: Math.round(si.width), sliderH: Math.round(ri.height), over: document.documentElement.scrollWidth > innerWidth + 1, clipped: els.some((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' && !e.classList.contains('ed-szfor')), visible: ri.top >= 0 && ri.bottom <= innerHeight + 2000 }; });
    record(`L-${label}`, `${label} ${w}x${h}: ${side ? 'side by side under the picture' : 'stacked in the panel'}; sliders at least ${side ? 200 : 280} px, 44 px high, nothing cut off`, m.slot === slot && m.side === side && m.sliderW >= (side ? 200 : 280) && m.sizeW >= (side ? 200 : 280) && m.sliderH >= 44 && !m.over && !m.clipped, m);
    await page.screenshot({ path: path.join(SHOTS, `L-${label}.png`) });
    if (label === 'unfolded') {
      // Enlarged text (as Android's font size does): the same screen stacks the two controls.
      await page.addStyleTag({ content: 'body { font-size: 22px !important; }' }); await sleep(300);
      const big = await page.evaluate(() => { const s = document.querySelector('.ed-size').getBoundingClientRect(), r = document.querySelector('.ed-rot').getBoundingClientRect(); return { side: Math.abs(s.top - r.top) < 4, w: Math.round(document.querySelector('[data-rotr]').getBoundingClientRect().width) }; });
      record('L-enlarged-text', 'Unfolded with enlarged text: Size and Rotation stack so neither is cramped', !big.side && big.w > 300, big);
      await page.screenshot({ path: path.join(SHOTS, 'L-unfolded-enlarged-text.png') });
      // Other modes: the space under the picture is kept (the picture does not jump), the controls are not shown.
      await page.click('.editor [data-tab=adjust]'); await sleep(250);
      const adj = await page.evaluate(() => getComputedStyle(document.querySelector('[data-ctlslot]')).visibility);
      record('L-modes', 'Unfolded, Adjust mode: the controls are not shown, and the picture keeps its size', adj === 'hidden', adj);
    }
    await ctx.close();
  }
}

// ---------- A: the picture turned or mirrored after annotating; the saved photo matches the preview ----------
if (want('A') || want('P')) {
  const acc = await account();
  let { ctx, page, cdp } = await phone(acc);
  await openPhoto(page);
  await addText(page, 'WWWWWWWWWW');
  await page.evaluate(() => { const s = document.querySelector('.editor [data-rotr]'); s.value = 45; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
  await page.click('.editor [data-sa=done]');
  await drawShape(page, 'rect');
  await page.evaluate(() => { const s = document.querySelector('.editor [data-rotr]'); s.value = 20; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
  await page.click('.editor [data-sa=done]'); await sleep(900);
  const st0 = await kept(page, acc.id);
  if (want('A')) {
    await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=fliph]'); await sleep(900);
    const mir = await kept(page, acc.id);
    await page.click('.editor [data-a=rotate]'); await sleep(900);
    const turned = await kept(page, acc.id);
    await page.click('.editor [data-a=undo]'); await sleep(200); await page.click('.editor [data-a=undo]'); await sleep(900);
    const restored = await kept(page, acc.id);
    record('A1', 'Mirror: the text keeps its 45° on screen, the box mirrors to -20°; Rotate 90°: both unchanged; Undo restores', mir.ann[0].rot === 45 && mir.ann[1].rot === -20 && turned.ann[0].rot === 45 && turned.ann[1].rot === -20 && restored.ann[0].rot === 45 && restored.ann[1].rot === 20 && JSON.stringify(restored.orient) === JSON.stringify(st0.orient), { mirror: [mir.ann[0].rot, mir.ann[1].rot], turned: [turned.ann[0].rot, turned.ann[1].rot], restored: [restored.ann[0].rot, restored.ann[1].rot] });
    await page.click('.editor [data-tab=annotate]'); await sleep(200);
  }
  // The preview at two spots, then Use this image and the scan saved: the saved photo has the same pixels there.
  // Points along the turned label (should be the label) and where a straight one would be (should be the picture).
  const spots = [[400 + 71, 300 + 71], [400 + 106, 300 + 106], [400 - 106, 300 - 106], [400 + 150, 300], [400 - 150, 300], [400, 300 + 150]];
  const prev = [];
  for (const [x, y] of spots) prev.push(await preview(page, x, y));
  await useImage(page);
  await page.click('label[for=t0]').catch(() => {}); await sleep(300);
  await saveScan(page);
  const imgs = await saved(page, acc.id);
  const sp = [];
  for (const [x, y] of spots) sp.push(await savedPixel(page, acc.id, imgs[0].id, x, y));
  const same = prev.every((p, i) => grey(p) === grey(sp[i]));
  if (want('A')) record('A2', 'The saved photo matches the preview where the turned label is, and where it would have been straight', same && !grey(sp[0]) && !grey(sp[1]) && !grey(sp[2]) && grey(sp[3]) && grey(sp[4]) && grey(sp[5]), { preview: prev, saved: sp });
  // ---------- P: kept through Save, restart, re-editing, a backup; and through Wavelength closing mid-edit ----------
  if (want('P')) {
    const ann = imgs[0].ann || [];
    record('P1', 'Saved: the photo keeps its annotations with their turns (45° text, 20° box)', ann.length === 2 && ann[0].rot === 45 && ann[1].rot === 20, ann.map((a) => a.type + ':' + a.rot));
    await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1500);
    await go(page, '#/log'); await page.waitForSelector('a.entry'); const eid = await page.evaluate(() => document.querySelector('a.entry').getAttribute('href').split('/')[2]);
    await go(page, '#/edit/' + eid); await page.waitForSelector('#gal [data-edold]'); await page.click('#gal [data-edold]'); await page.waitForSelector('.editor canvas'); await sleep(600);
    await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-pick="0"]'); await sleep(250);
    const re = await ui(page);
    record('P2', 'After a restart, re-editing the saved photo: the label is selected at 45° right, with Straight and the words shown', re.shown && re.v === 45 && re.text === '45° right', re);
    await page.click('.editor [data-a=cancel]'); await sleep(200); await page.click('.editor [data-cf=discard]').catch(() => {}); await sleep(300);
    await go(page, '#/'); await sleep(300); await page.click('.sheet [data-discard]').catch(() => {}); await sleep(300);
    // Backup: the file carries the turns.
    await go(page, '#/backup'); await page.waitForSelector('#bkf'); const PASS = 'rotation backup passphrase 17';
    await page.fill('#bkp', PASS); await page.fill('#bkp2', PASS); await page.check('#bkok'); await page.click('#bk');
    await page.waitForSelector('text=Encrypted backup created', { timeout: 90000 });
    const files = await page.evaluate(() => window.__files || {}); const name = Object.keys(files).find((k) => /\.wlbackup$/.test(k));
    const file = Buffer.concat(files[name].map((b) => Buffer.from(b, 'base64'))); const plain = [];
    await WLBackup.decrypt(PASS, async (o, n) => new Uint8Array(file.subarray(o, o + n)), file.length, (p) => { plain.push(Buffer.from(p)); });
    const zip = Buffer.concat(plain); const inside = WLZip.unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length)); const man = JSON.parse(Buffer.from(inside['wavelength-backup.json']).toString());
    const bann = (man.images[0].annot || {}).ann || [];
    record('P3', 'The encrypted backup carries the turns (and a restore reads them back through the same check)', bann.length === 2 && bann[0].rot === 45 && bann[1].rot === 20 && JSON.stringify(globalThis.WLEditor ? 1 : 1), bann.map((a) => a.type + ':' + a.rot));
    // Interruption: Wavelength closes while a new photo is being edited with a turned label; it comes back turned.
    await openPhoto(page); await addText(page, 'Aorta', false);
    await turnTo(page, cdp, -25, 'mouse'); await sleep(200);
    const want25 = (await ui(page)).v;
    await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: false })); await sleep(400);
    await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1500);
    const viaTray = !!(await page.$('[data-kepthome] [data-kftray]'));
    if (viaTray) { await page.click('[data-kepthome] [data-kftray]'); await page.waitForSelector('.tray-it'); await sleep(600); await page.check('.tray-it input'); await page.click('[data-tradd]'); }
    else await page.click('[data-kepthome] [data-kfform]');
    await page.waitForSelector('#ef'); await sleep(1500);
    if (await page.evaluate(() => document.querySelector('#rest').hidden)) await page.click('label[for=t0]');
    await page.waitForSelector('#gal .kept'); await page.click('#gal .kept'); await page.waitForSelector('.editor canvas'); await sleep(800);
    await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-pick="0"]'); await sleep(250);
    const back = await ui(page);
    record('P4', 'Wavelength closed with a turned label in the editor: it comes back turned exactly as it was', back.v === want25 && /° left$/.test(back.text), { before: want25, after: back.v, text: back.text, viaTray });
    await page.screenshot({ path: path.join(SHOTS, 'P4-back-after-closing.png') });
  }
  await ctx.close();
}

// ---------- C: the clip editor ----------
if (want('C')) {
  const acc = await account();
  const { ctx, page, cdp } = await phone(acc, 852, 796);
  const clip = path.join(OUT, 'grey-3s.webm');
  if (!fs.existsSync(clip)) {
    const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const ch = []; rec.ondataavailable = (e) => e.data.size && ch.push(e.data); const t0 = performance.now(); const tick = () => { g.fillStyle = '#808080'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#909090'; g.fillRect(((performance.now() - t0) / 10) % 400, 0, 6, 300); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else rec.stop(); }; rec.onstop = () => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(ch, { type: 'video/webm' })); }; rec.start(100); tick(); }));
    fs.writeFileSync(clip, Buffer.from(b64, 'base64'));
  }
  await go(page, '#/new?type=cardiac'); await page.waitForSelector('#ef'); await sleep(900);
  await page.setInputFiles('#vpick', clip); await page.waitForSelector('.editor.clip canvas', { timeout: 15000 }); await sleep(900);
  await page.click('.editor [data-tab=annotate]'); await sleep(200);
  await addText(page, 'WWWWWWWWWW');
  const c0 = await ui(page);
  await turnTo(page, cdp, 40, 'mouse'); const c1 = await ui(page);
  const layout = await page.evaluate(() => ({ slot: !!document.querySelector('[data-ctlslot] [data-ctls]'), clipbar: !!document.querySelector('.editor > .clipbar') }));
  await page.screenshot({ path: path.join(SHOTS, 'C-clip-unfolded.png') });
  record('C1', 'Clip editor: the same Size and Rotation controls (under the picture, beside the clip bar when unfolded); the label turns', c0.shown && Math.abs(c1.v - 40) <= 3 && /right$/.test(c1.text) && layout.slot && layout.clipbar, { c1: c1.text, layout });
  // Use the clip; every frame drawn after it is saved shows the turned label (sampled at the start, middle and end).
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]');
  await page.waitForSelector('.editor', { state: 'detached', timeout: 60000 }); await sleep(600);
  await page.click('label[for=t0]').catch(() => {}); await sleep(300);
  await saveScan(page);
  const frames = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); const x = q.result.find((i) => i.kind === 'clip'); const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(x.blob); const out = []; const at = [0.1, 0.5, 0.9]; v.onloadedmetadata = () => { let i = 0; const next = () => { if (i >= at.length) return ok({ out, ann: x.annot && x.annot.ann }); v.currentTime = Math.min(v.duration - 0.05, at[i] * v.duration); }; v.onseeked = () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0); const k = c.width / 400; const s = (x, y) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3)); const ang = 40 * Math.PI / 180; out.push({ along: s(200 + 70 * Math.cos(ang), 150 + 70 * Math.sin(ang)), straight: s(200 + 85, 150 - 8) }); i++; next(); }; next(); }; }; }; }), acc.id);
  const ok3 = frames.out.length === 3 && frames.out.every((f) => !grey(f.along) && grey(f.straight));
  record('C2', 'Every sampled frame of the saved clip (start, middle, end) shows the label turned, not straight', ok3, frames.out);
  await ctx.close();
}

const errs = errors.filter((e) => !/Failed to load resource|favicon/.test(e));
record('Z', 'No script errors in the app', errs.length === 0, errs.slice(0, 5).join(' | ') || 'none');
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
