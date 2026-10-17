// 1.0.17 Size and Rotation on the Android emulator (foldable wlfold), with the real WebView, real finger drags (adb
// input swipe), folding, Android's font size, and Android ending the app. Starts from 1.0.16 with saved turned labels
// (Turn, 15° steps) and leftover photos in the recovery tray, then 1.0.17 is installed over it as an update.
// Emulator only: debug builds of both (same debug key, WebView debugging on in scratch copies), airplane mode, adb root.
//   node tools/e2e-1017-emulator.mjs <outdir> <1.0.16 debug apk> <1.0.17 debug apk>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { kit, sleep, PKG } from './emulator-kit.mjs';

const [OUT, OLD, NEW] = [path.resolve(process.argv[2] || 'e2e-1017-emu'), process.argv[3], process.argv[4]];
fs.mkdirSync(OUT, { recursive: true });
const K = kit({ out: OUT });
const results = [];
const record = (id, name, pass, detail) => { const d = typeof detail === 'string' ? detail : JSON.stringify(detail); results.push({ id, name, pass: !!pass, detail: d }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', d); };
const ACC = { id: 990017, email: 'emulator.rotation@example.com', name: 'Emulator Rotation', firstName: 'Emulator', lastName: 'Rotation', declarationAt: Date.now(), profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true }, emailStatus: 'verified' };
const sh = (cmd) => { try { return K.adb('shell', cmd); } catch (e) { return String(e.stdout || ''); } };
let page = null;
const go = (h) => page.evaluate((h) => { location.hash = h; }, h);
const click = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('no ' + s); e.click(); }, sel);
const relaunch = async () => { K.start(); await sleep(8000); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 40000 }); await sleep(3000); await K.calibrate(); };
const fold = async (on) => { K.adb('emu', on ? 'fold' : 'unfold'); await sleep(4000); page = await K.connect(); await K.calibrate(); };
const pickPhoto = () => page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 800, 600); g.strokeStyle = '#c0c0c0'; g.lineWidth = 8; g.beginPath(); g.moveTo(80, 540); g.lineTo(720, 60); g.stroke(); c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b], 'scan.png', { type: 'image/png' })); const i = document.querySelector('#pick'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); ok(); }, 'image/png'); }));
const addText = async (t) => { await click('.editor [data-at=text]'); await page.waitForSelector('.editor #edtx'); await page.evaluate((t) => { const i = document.querySelector('.editor #edtx'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.editor .ed-pop button.apply').click(); }, t); await sleep(500); };
const rot = () => page.evaluate(() => { const r = document.querySelector('.editor [data-rotr]'), c = document.querySelector('[data-rotctl]'), s = document.querySelector('.ed-size').getBoundingClientRect(), rr = c ? c.getBoundingClientRect() : null; return { shown: !!c && !c.hidden, v: r ? Number(r.value) : null, text: (document.querySelector('[data-rotval]') || {}).textContent, inSlot: !!document.querySelector('[data-ctlslot] [data-ctls]'), side: !!rr && Math.abs(s.top - rr.top) < 4 }; });
// A real finger drag on the Rotation slider, from its thumb to the target value.
async function swipeRot(target) {
  await page.evaluate(() => document.querySelector('.editor [data-rotr]').scrollIntoView({ block: 'center' })); await sleep(400);
  const g = await page.evaluate(() => { const s = document.querySelector('.editor [data-rotr]'); const r = s.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width, v: Number(s.value) }; });
  const xOf = (v) => g.x + 14 + (v + 180) / 360 * (g.w - 28);
  await K.swipe({ x: xOf(g.v), y: g.y }, { x: xOf(target), y: g.y }, 900); await sleep(900);
}
const pickAnn = async (i) => { await click(`.editor [data-pick="${i}"]`); await sleep(400); };

// ---------- 1.0.16: saved labels turned with Turn (15° and 345°), and two leftover photos in the recovery tray ----------
K.adb('uninstall', PKG); K.adb('install', OLD); K.start(); await sleep(8000);
page = await K.connect();
await page.waitForFunction(() => !!(window.WLNative && window.WLNative.plugin), undefined, { timeout: 60000 });
await page.evaluate(async (acc) => { localStorage.setItem('wl-acc', JSON.stringify(acc)); await window.WLNative.plugin('NativeBiometric').setData({ key: 'wavelength.session', value: 'emulator-test-token-not-valid-anywhere' }); }, ACC);
await page.reload(); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 60000 }); await sleep(2500); await K.calibrate();
const v0 = await page.evaluate(() => (window.WL_NATIVE || {}).version);
await go('#/new?type=cardiac'); await sleep(2500); await pickPhoto(); await page.waitForSelector('.editor canvas', { timeout: 20000 }); await sleep(1500);
await click('.editor [data-tab=annotate]'); await sleep(300);
await addText('Ao'); await click('.editor [data-sa=turn]'); await sleep(200); await click('.editor [data-sa=done]');
await addText('LV'); for (let i = 0; i < 23; i++) await click('.editor [data-sa=turn]'); await click('.editor [data-sa=done]'); await sleep(300);
await page.evaluate(() => { const d = document.querySelector('.editor [data-decl]'); d.checked = true; d.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.editor [data-a=save]').click(); });
await page.waitForFunction(() => !document.querySelector('.editor'), undefined, { timeout: 30000 }); await sleep(1500);
await page.evaluate(() => { const s = document.querySelector('input[name=supervision]'); s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form button[type=submit]').click(); }); await sleep(5000);
const LD = '/sdcard/Android/data/' + PKG + '/files/Pictures';
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2000); K.adb('shell', 'am', 'force-stop', PKG);
sh('mkdir -p ' + LD);
{ const b = await chromium.launch(); const p = await b.newPage(); const jp = await p.evaluate(() => [200, 20].map((h) => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = `hsl(${h} 70% 45%)`; g.fillRect(0, 0, 640, 480); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; })); await b.close();
  jp.forEach((d, i) => { const n = `JPEG_20261003_09000${i + 1}_1.jpg`; fs.writeFileSync(path.join(OUT, n), Buffer.from(d, 'base64')); K.adb('push', path.join(OUT, n), '/data/local/tmp/' + n); sh(`cp /data/local/tmp/${n} ${LD}/${n} && rm /data/local/tmp/${n}`); }); }
const uid = (sh(`stat -c %u /sdcard/Android/data/${PKG}`) || '').trim(); if (uid) sh(`chown -R ${uid}:${uid} ${LD}`);
await relaunch();
await page.waitForSelector('.sheet [data-lgrev]', { timeout: 20000 }); await click('.sheet [data-lgrev]'); await sleep(8000);
const before = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map((x) => (x.annot && x.annot.ann || []).map((a) => a.text + ':' + a.rot))); }; }; }), ACC.id);
const trayBefore = await page.evaluate(() => document.querySelectorAll('.tray-it').length);
record('U0', 'In 1.0.16: a saved photo with "Ao" turned 15° and "LV" turned 345° (Turn button), and 2 leftover photos in the recovery tray', v0 === '1.0.16' && JSON.stringify(before) === JSON.stringify([['Ao:15', 'LV:345']]) && trayBefore === 2, { v0, before, trayBefore });

// ---------- 1.0.17 installed over it ----------
const first = (K.adb('shell', 'dumpsys', 'package', PKG).match(/firstInstallTime=([^\r\n]+)/) || [])[1];
K.adb('install', '-r', NEW); await sleep(2000);
const first2 = (K.adb('shell', 'dumpsys', 'package', PKG).match(/firstInstallTime=([^\r\n]+)/) || [])[1];
await relaunch();
const v1 = await page.evaluate(() => (window.WL_NATIVE || {}).version);
const card = await page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
record('U1', 'Updated in place to 1.0.17 (same first-install time); the 2 kept photos are still in the recovery tray', v1 === '1.0.17' && first === first2 && /2 photos/.test(card) && /Review photos and clips/.test(card), { v1, first, first2, card });
await go('#/log'); await page.waitForSelector('a.entry', { timeout: 20000 }); const eid = await page.evaluate(() => document.querySelector('a.entry').getAttribute('href').split('/')[2]);
await go('#/edit/' + eid); await page.waitForSelector('#gal [data-edold]', { timeout: 20000 }); await click('#gal [data-edold]'); await page.waitForSelector('.editor canvas', { timeout: 20000 }); await sleep(1500);
await click('.editor [data-tab=annotate]'); await sleep(300);
await pickAnn(0); const ao = await rot(); await pickAnn(1); const lv = await rot();
const turnGone = await page.evaluate(() => !document.querySelector('[data-sa=turn]'));
record('U2', 'Re-editing the 1.0.16 photo: "Ao" shows 15° right and "LV" (345°) shows 15° left, exactly as they looked; no Turn button', ao.v === 15 && ao.text === '15° right' && lv.v === -15 && lv.text === '15° left' && turnGone, { ao, lv, turnGone });
K.shot('U2-reedit-unfolded');
// ---------- D: a real finger on the Rotation slider, unfolded then folded ----------
await pickAnn(0); await swipeRot(-30); const d1 = await rot();
record('D1', 'Unfolded: Size and Rotation side by side under the picture; a real finger drag turns "Ao" to about 30° left', d1.inSlot && d1.side && d1.v <= -24 && d1.v >= -36 && /° left$/.test(d1.text), d1);
K.shot('D1-finger-unfolded');
await click('.editor [data-a=undo]'); await sleep(600); await pickAnn(0); const undone = await rot();
record('D2', 'One finger drag is one Undo step', undone.v === 15, { after: undone.v });
await fold(true);
await pickAnn(0); await swipeRot(40); const d3 = await rot();
record('D3', 'Folded (cover screen): the editor and its work are still there; the controls stack in the panel; a finger drag turns it to about 40° right', !d3.inSlot && !d3.side && d3.v >= 36 && d3.v <= 44 && /° right$/.test(d3.text), d3);
K.shot('D3-finger-folded');
await fold(false);
const d4 = await rot();
record('D4', 'Unfolded again: the controls move back under the picture, side by side, the turn unchanged', d4.inSlot && d4.side && d4.v === d3.v, d4);
await click('.editor [data-a=cancel]'); await sleep(400); await page.evaluate(() => { const b = document.querySelector('.editor [data-cf=discard]'); if (b) b.click(); }); await sleep(600);
await go('#/'); await sleep(800); await page.evaluate(() => { const d = document.querySelector('.sheet [data-discard]'); if (d) d.click(); }); await sleep(600);
// ---------- I: Android ends Wavelength while a turned label is being edited ----------
await go('#/new?type=cardiac'); await sleep(2500); await pickPhoto(); await page.waitForSelector('.editor canvas', { timeout: 20000 }); await sleep(1500);
await click('.editor [data-tab=annotate]'); await sleep(300); await addText('IVC'); await swipeRot(-25); const i0 = await rot();
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2500);
for (let i = 0; i < 4 && K.pid(); i++) { K.adb('shell', 'am', 'kill', PKG); await sleep(2000); }
if (K.pid()) K.adb('shell', 'am', 'force-stop', PKG);
await relaunch();
const viaTray = await page.evaluate(() => !!document.querySelector('[data-kepthome] [data-kftray]'));
if (await page.evaluate(() => !!document.querySelector('[data-kepthome] [data-kfform]'))) await click('[data-kepthome] [data-kfform]');
else { await click('[data-kepthome] [data-kftray]'); await page.waitForSelector('.tray-it'); await sleep(1500); await page.evaluate(() => { const its = [...document.querySelectorAll('.tray-it')]; const it = its.find((li) => /Kept for later/.test(li.textContent)) || its[its.length - 1]; const i = it.querySelector('input'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await click('[data-tradd]'); }
await page.waitForSelector('#ef', { timeout: 20000 }); await sleep(2000);
if (await page.evaluate(() => document.querySelector('#rest').hidden)) await click('label[for=t0]');
await page.waitForSelector('#gal .kept', { timeout: 20000 }); await click('#gal .kept'); await page.waitForSelector('.editor canvas', { timeout: 20000 }); await sleep(1500);
await click('.editor [data-tab=annotate]'); await sleep(300); await pickAnn(0); const i1 = await rot();
record('I1', 'Android ended Wavelength with a turned label in the editor: on reopening it comes back turned exactly as it was', i1.v === i0.v && i1.text === i0.text && i0.v < -20, { before: i0.v, after: i1.v, text: i1.text, viaTray });
await click('.editor [data-a=cancel]'); await sleep(400); await page.evaluate(() => { const b = document.querySelector('.editor [data-cf=discard]'); if (b) b.click(); }); await sleep(600);
await go('#/'); await sleep(800); await page.evaluate(() => { const d = document.querySelector('.sheet [data-discard]'); if (d) d.click(); }); await sleep(600);
// ---------- F: Android's font size enlarged: the controls stack even unfolded ----------
const fs0 = sh('settings get system font_scale').trim();
sh('settings put system font_scale 1.3'); K.adb('shell', 'am', 'force-stop', PKG); await relaunch();
await go('#/new?type=cardiac'); await sleep(2500); await pickPhoto(); await page.waitForSelector('.editor canvas', { timeout: 20000 }); await sleep(1500);
await click('.editor [data-tab=annotate]'); await sleep(300); await addText('Ao'); const f1 = await rot();
const fsize = await page.evaluate(() => getComputedStyle(document.querySelector('.ed-ctls')).fontSize);
K.shot('F1-font-1.3-unfolded');
record('F1', 'Android font size 1.3, unfolded: the text is larger and Size and Rotation stack, so neither is cramped', f1.shown && !f1.side && parseFloat(fsize) > 16.5, { ...f1, fontSize: fsize });
await click('.editor [data-a=cancel]'); await sleep(400); await page.evaluate(() => { const b = document.querySelector('.editor [data-cf=discard]'); if (b) b.click(); }); await sleep(600);
// The font size goes back only with Wavelength closed (changing it while open restarts the activity).
K.adb('shell', 'am', 'force-stop', PKG); sh('settings put system font_scale ' + (fs0 && fs0 !== 'null' ? fs0 : '1.0')); await sleep(1500); await relaunch();
// ---------- C: the clip editor on the phone ----------
// The emulator has no H.264 encoder for the WebView: MP4 recording is offered but fails as it starts (as in 1.0.16).
// For this check only, the page is told MP4 recording is unavailable, so the app prepares the clip as WebM (VP8/VP9),
// which the emulator can encode. Phones have hardware H.264 encoders; the owner checks a clip on the Fold7.
await go('#/new?type=cardiac'); await sleep(2500);
await page.evaluate(() => { const f = MediaRecorder.isTypeSupported.bind(MediaRecorder); MediaRecorder.isTypeSupported = (t) => !t.startsWith('video/mp4') && f(t); });
await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm' }); const ch = []; rec.ondataavailable = (e) => e.data.size && ch.push(e.data); const t0 = performance.now(); const tick = () => { g.fillStyle = '#808080'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#a0a0a0'; g.fillRect(((performance.now() - t0) / 10) % 400, 0, 6, 300); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else rec.stop(); }; rec.onstop = () => { const dt = new DataTransfer(); dt.items.add(new File([new Blob(ch, { type: 'video/webm' })], 'clip.webm', { type: 'video/webm' })); const i = document.querySelector('#vpick'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); ok(); }; rec.start(100); tick(); }));
await page.waitForSelector('.editor.clip canvas', { timeout: 30000 }); await sleep(2000);
await click('.editor [data-tab=annotate]'); await sleep(300); await addText('Ao'); await swipeRot(35); const c1 = await rot();
K.shot('C1-clip-unfolded');
// A real tap on Use this clip: Android's WebView plays the clip (to prepare it) only after a real touch.
await page.evaluate(() => { const d = document.querySelector('.editor [data-decl]'); d.checked = true; d.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.editor [data-a=save]').scrollIntoView({ block: 'center' }); }); await sleep(500);
await K.tapSel('.editor [data-a=save]');
await page.waitForFunction(() => !document.querySelector('.editor'), undefined, { timeout: 90000 }); await sleep(1500);
await page.evaluate(() => { const s = document.querySelector('input[name=supervision]'); s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('form button[type=submit]').click(); }); await sleep(5000);
const clipAnn = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); const x = q.result.find((i) => i.kind === 'clip'); ok(x && x.annot ? x.annot.ann.map((a) => a.text + ':' + a.rot) : null); }; }; }), ACC.id);
record('C1', 'Clip editor on the phone: a finger drag turns the label (about 35° right); the saved clip keeps that turn', c1.shown && c1.v >= 31 && c1.v <= 39 && clipAnn && clipAnn.length === 1 && clipAnn[0] === 'Ao:' + c1.v, { c1, clipAnn });
const fails = results.filter((r) => !r.pass);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
