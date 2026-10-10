// Wavelength 1.0.14 on an Android emulator (a foldable: Pixel 9 Pro Fold profile): the real Android WebView and
// Capacitor runtime, the real soft keyboard, the real back key and back gesture, folding and unfolding, and the app
// being ended by Android. No server: airplane mode, a synthetic cached account (see tools/emulator-kit.mjs).
//
// Setup (emulator only): a debug build with WebView debugging on, installed; airplane mode on.
// Run:   node tools/e2e-1014-emulator.mjs <outdir> [adb path]
import fs from 'node:fs';
import path from 'node:path';
import { kit, sleep, PKG } from './emulator-kit.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1014-emulator-out');
fs.mkdirSync(OUT, { recursive: true });
const K = kit({ adbPath: process.argv[3] || 'C:/Android/sdk/platform-tools/adb.exe', out: OUT });
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const ACC = { id: 990014, email: 'emulator.test@example.com', name: 'Emulator Test', firstName: 'Emulator', lastName: 'Test', declarationAt: Date.now(), profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true }, emailStatus: 'verified' };

// A fresh app with the synthetic account (no server: airplane mode).
K.adb('shell', 'pm', 'clear', PKG); K.start(); await sleep(8000);
let page = await K.connect();
await page.evaluate(async (acc) => { localStorage.setItem('wl-acc', JSON.stringify(acc)); await window.WLNative.plugin('NativeBiometric').setData({ key: 'wavelength.session', value: 'emulator-test-token-not-valid-anywhere' }); }, ACC);
await page.reload(); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(1500);
await K.calibrate();
console.log('WebView', K.dev, 'offset', K.off);
const go = (h) => page.evaluate((h) => { location.hash = h; }, h);
// A picture, chosen as a person would in the photo picker (the file is made in the page and handed to the input).
const pickPhoto = () => page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#00ff00'; g.fillRect(200, 0, 200, 150); g.fillStyle = '#0000ff'; g.fillRect(0, 150, 200, 150); g.fillStyle = '#ffff00'; g.fillRect(200, 150, 200, 150);
  c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b], 'scan.png', { type: 'image/png' })); const i = document.querySelector('#pick'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); ok(); }, 'image/png'); }));
const state = () => page.evaluate(() => ({ editor: !!document.querySelector('.editor'), pop: !!(document.querySelector('.editor .ed-pop') && !document.querySelector('.editor .ed-pop').hidden), confirm: !!(document.querySelector('.editor .ed-confirm') && !document.querySelector('.editor .ed-confirm').hidden), focused: document.activeElement && document.activeElement.id, text: (document.querySelector('.editor #edtx') || {}).value, chips: [...document.querySelectorAll('.editor [data-pick]')].map((b) => b.textContent), backs: window.__backs || 0, h: innerHeight }));
const countBacks = () => page.evaluate(() => { if (!window.__bc) { window.__bc = 1; window.addEventListener('wl:back', () => { window.__backs = (window.__backs || 0) + 1; }, true); } });

if (process.env.EXPLORE) {
  await go('#/new?type=cardiac'); await sleep(1500);
  await pickPhoto(); await page.waitForSelector('.editor canvas'); await sleep(1200);
  await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-at=text]'); await page.waitForSelector('.editor #edtx'); await sleep(600);
  await countBacks();
  await K.tapSel('.editor #edtx'); await sleep(1200);
  await K.type('Ao');
  console.log('before back', JSON.stringify(await state()), 'ime', K.imeShown());
  K.shot('X1-keyboard-open');
  await K.backKey();
  console.log('after back 1', JSON.stringify(await state()), 'ime', K.imeShown());
  K.shot('X2-after-back');
  await K.backKey();
  console.log('after back 2', JSON.stringify(await state()), 'ime', K.imeShown());
  await K.backKey();
  console.log('after back 3', JSON.stringify(await state()), 'ime', K.imeShown());
  process.exit(0);
}

const fold = async (on) => { K.adb('emu', on ? 'fold' : 'unfold'); await sleep(3500); page = await K.connect(); await K.calibrate(); };
const layout = () => page.evaluate(() => { const st = document.querySelector('.editor .stage').getBoundingClientRect(), bb = document.querySelector('.editor .bar-bot').getBoundingClientRect(); return { vw: innerWidth, stage: Math.round(st.width), side: bb.left >= st.right - 2 }; });
const openEditor = async () => { await go('#/new?type=cardiac'); await sleep(1500); await pickPhoto(); await page.waitForSelector('.editor canvas'); await sleep(1200); };
const canvasPt = (fx, fy) => page.evaluate(([fx, fy]) => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, [fx, fy]);

// ---------- K: the real soft keyboard and the real back key ----------
await openEditor();
await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-at=text]'); await page.waitForSelector('.editor #edtx'); await sleep(600);
await countBacks();
await K.tapSel('.editor #edtx'); await sleep(1200); await K.type('Ao');
const k0 = await state();
K.shot('K0-keyboard-open');
await K.backKey(); const k1 = await state();
record('K1', 'Keyboard open (real soft keyboard), Back: only the keyboard closes; the editor, the text panel and the typed text stay', k1.h > k0.h + 120 && k1.editor && k1.pop && k1.text === 'Ao', JSON.stringify({ before: k0.h, after: k1.h, k1 }));
await K.backKey(); const k2 = await state();
record('K2', 'The next Back closes the text panel at once (no press that seems to do nothing); the editor stays', k2.editor && !k2.pop, JSON.stringify(k2));
await page.click('.editor [data-at=text]'); await page.waitForSelector('.editor #edtx'); await page.evaluate(() => { document.querySelector('.editor #edtx').value = 'Ao'; }); await page.click('.editor .ed-pop button.apply'); await sleep(300);
await page.click('.editor [data-at=dot]'); const dp = await canvasPt(0.3, 0.7); await K.tap(dp.x, dp.y);
const kc = await state();
await K.backKey(); const k3 = await state();
record('K3', 'With changes, the real back key asks first; nothing is closed or lost', k3.editor && k3.confirm && k3.chips.length === 2, JSON.stringify({ before: kc.chips, k3 }));
K.shot('K3-question');
await K.backKey(); const k4 = await state();
record('K4', 'Back on the question keeps editing, with everything still there', k4.editor && !k4.confirm && k4.chips.length === 2, JSON.stringify(k4));
await K.backGesture(); const k5 = await state();
record('K5', 'The back gesture (edge swipe) asks the same question', k5.editor && k5.confirm, JSON.stringify(k5));
await K.tapSel('.editor [data-cf=keep]'); await sleep(400);

// ---------- F: fold and unfold with the editor open ----------
const l0 = await layout();
await fold(true);
const f1 = await state(), l1 = await layout();
record('F1', 'Folding with the editor open: still open with all its work; cover screen layout (picture above the tools)', f1.editor && f1.chips.length === 2 && !l1.side, JSON.stringify({ unfolded: l0, folded: l1, chips: f1.chips }));
K.shot('F1-folded');
await fold(false);
const f2 = await state(), l2 = await layout();
record('F2', 'Unfolding again: still open with all its work; the picture first, tools beside it (about 62%)', f2.editor && f2.chips.length === 2 && l2.side && l2.stage / l2.vw > 0.55 && l2.stage / l2.vw < 0.68, JSON.stringify({ unfolded: l2, chips: f2.chips }));
K.shot('F2-unfolded');

// ---------- X: Android ends Wavelength while the editor is open ----------
K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2500); // leaving the app keeps the work at once
K.adb('shell', 'am', 'kill', PKG); await sleep(1500);                  // what Android does to a background app short of memory
const gone = !K.pid();
K.start(); await sleep(8000); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(2500); await K.calibrate();
const card = await page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
record('X1', 'Wavelength ended by Android with the editor open: on reopening, Home says a photo is kept on this phone', gone && /Kept on this phone/.test(card), JSON.stringify({ killed: gone, card }));
K.shot('X1-home-kept');
await page.click('[data-kepthome] a'); await page.waitForSelector('[data-addearlier]'); await page.click('[data-addearlier]'); await sleep(600);
await page.click('label[for=t0]'); await page.waitForSelector('#gal .kept'); await page.click('#gal .kept');
await page.waitForSelector('.editor canvas'); await sleep(1200); await page.click('.editor [data-tab=annotate]');
const x2 = await state();
record('X2', 'Add to this scan, then the Unfinished tile: the photo comes back with its label and dot', x2.editor && x2.chips.length === 2, JSON.stringify(x2.chips));
await page.click('.editor [data-a=cancel]'); await sleep(300); await page.click('.editor [data-cf=discard]').catch(() => {}); await sleep(400);
await go('#/'); await sleep(600); await page.evaluate(() => { const d = document.querySelector('.sheet [data-discard]'); if (d) d.click(); }); await sleep(600);

// ---------- A: About closes cleanly (real back key, folded and unfolded) ----------
for (const folded of [false, true]) {
  if (folded) await fold(true);
  await go('#/settings'); await sleep(900);
  let bare = 0, frames = 0, extra = 0;
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => { [...document.querySelectorAll('button, a')].find((x) => /About Wavelength/.test(x.textContent)).click(); });
    await page.waitForSelector('.sheet .about-head'); await sleep(500);
    await page.evaluate(() => { window.__fr = []; const t0 = performance.now(); const look = () => { document.querySelectorAll('.sheet-was').forEach((g) => { const cs = getComputedStyle(g); window.__fr.push({ logos: g.querySelectorAll('svg').length, bg: cs.backgroundColor }); }); if (performance.now() - t0 < 400) requestAnimationFrame(look); }; requestAnimationFrame(look); });
    await K.backKey();
    const fr = await page.evaluate(() => window.__fr || []); frames += fr.length; bare += fr.filter((f) => f.logos && /rgba\(0, 0, 0, 0\)|transparent/.test(f.bg)).length;
    extra += await page.evaluate(() => (document.querySelector('.sheet .about-head') ? 1 : 0) + (location.hash === '#/settings' ? 0 : 1));
  }
  record('A1-' + (folded ? 'folded' : 'unfolded'), `About, then the real back key, four times (${folded ? 'folded' : 'unfolded'}): no bare logo on any closing frame; back on Settings each time`, bare === 0 && extra === 0, `${frames} closing frames seen, ${bare} bare, ${extra} wrong endings`);
  if (folded) await fold(false);
}

// ---------- G: Progress, Guides and accreditation ----------
await go('#/progress'); await sleep(1200);
await K.tapSel('.guide-links a[data-guides=all]'); await sleep(1500);
record('G1', 'Progress > Guides and accreditation (real tap, RCEM learner): the catalogue', await page.evaluate(() => location.hash === '#/guides' && !!document.querySelector('a.guide-card')), await page.evaluate(() => location.hash));
await K.backKey();
record('G2', 'Back from the catalogue returns to Progress', await page.evaluate(() => location.hash === '#/progress'), await page.evaluate(() => location.hash));
await K.tapSel('.guide-links a[data-guides=mine]'); await sleep(1500);
record('G3', 'Progress > My accreditation pathway: the RCEM guide', await page.evaluate(() => /^#\/guides\/.*rcem/.test(location.hash)), await page.evaluate(() => location.hash));

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ device: K.dev, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed on the emulator`);
process.exit(failed.length ? 1 : 0);
