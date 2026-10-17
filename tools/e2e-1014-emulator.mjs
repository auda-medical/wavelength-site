// Wavelength 1.0.14 on an Android emulator (a foldable: Pixel 9 Pro Fold profile): the real Android WebView and
// Capacitor runtime, the real soft keyboard, the real back key and back gesture, folding and unfolding, and the app
// being ended by Android. No server: airplane mode, a synthetic cached account (see tools/emulator-kit.mjs).
//
// 1.0.14 review: the typed form after Android ends the app (T), camera photos and clips kept out of shared storage and
// the gallery (M), photos left by earlier versions (L), backup and device-to-device transfer (Y), other apps (O).
// Y and O need a rootable emulator image (google_apis, `adb root`).
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
// What Android does to a background app short of memory. `am kill` only ends an app Android already counts as
// cached; if it will not yet, `am force-stop` ends the process just as abruptly (no chance to save anything more).
let how = 'am kill';
for (let i = 0; i < 4 && K.pid(); i++) { K.adb('shell', 'am', 'kill', PKG); await sleep(2500); }
if (K.pid()) { how = 'am force-stop'; K.adb('shell', 'am', 'force-stop', PKG); await sleep(1500); }
const gone = !K.pid();
console.log('ended by', how);
K.start(); await sleep(8000); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(2500); await K.calibrate();
const card = await page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
record('X1', 'Wavelength ended by Android with the editor open: on reopening, Home says a photo is kept on this phone', gone && /Kept on this phone/.test(card), JSON.stringify({ killed: gone, how, card }));
K.shot('X1-home-kept');
// 1.0.16: the photo comes back with its scan (when the scan form was kept) or waits in the recovery tray, where it is
// chosen for a scan on its own; either way it is never added by itself.
const viaTray = await page.evaluate(() => !!document.querySelector('[data-kepthome] [data-kftray]'));
if (viaTray) {
  await page.click('[data-kepthome] [data-kftray]'); await page.waitForSelector('.tray-it'); await sleep(800);
  await page.evaluate(() => { const i = document.querySelector('.tray-it input'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('[data-tradd]');
} else await page.click('[data-kepthome] [data-kfform]');
await page.waitForSelector('#ef'); await sleep(1500);
if (await page.evaluate(() => document.querySelector('#rest').hidden)) await page.click('label[for=t0]');
await page.waitForSelector('#gal .kept'); await page.click('#gal .kept');
await page.waitForSelector('.editor canvas'); await sleep(1200); await page.click('.editor [data-tab=annotate]');
const x2 = await state();
record('X2', 'Chosen again (recovery tray or its own scan), then the Unfinished tile: the photo comes back with its label and dot', x2.editor && x2.chips.length === 2, JSON.stringify({ viaTray, chips: x2.chips }));
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
    // Sample every frame once the closing copy appears (started by the observer, so the time adb takes is not lost).
    await page.evaluate(() => { window.__fr = []; window.__rm = matchMedia('(prefers-reduced-motion: reduce)').matches; const mo = new MutationObserver(() => { if (!document.querySelector('.sheet-gone')) return; mo.disconnect(); const t0 = performance.now(); const look = () => { document.querySelectorAll('.sheet-gone .sheet-was').forEach((g) => { const cs = getComputedStyle(g); window.__fr.push({ logos: g.querySelectorAll('svg').length, bg: cs.backgroundColor }); }); if (performance.now() - t0 < 400) requestAnimationFrame(look); }; look(); }); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); });
    await K.backKey();
    const fr = await page.evaluate(() => window.__fr || []); frames += fr.length; bare += fr.filter((f) => f.logos && /rgba\(0, 0, 0, 0\)|transparent/.test(f.bg)).length;
    extra += await page.evaluate(() => (document.querySelector('.sheet .about-head') ? 1 : 0) + (location.hash === '#/settings' ? 0 : 1));
  }
  record('A1-' + (folded ? 'folded' : 'unfolded'), `About, then the real back key, four times (${folded ? 'folded' : 'unfolded'}): no bare logo on any closing frame; back on Settings each time`, bare === 0 && extra === 0 && frames > 0, `${frames} closing frames seen, ${bare} bare, ${extra} wrong endings`);
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

// ---------- 1.0.14 data-protection review (unfolded inner screen; synthetic camera scene and pictures only) ----------
const sh = (cmd) => { try { return K.adb('shell', cmd); } catch (e) { return String(e.stdout || ''); } };
const priv = () => sh('run-as ' + PKG + ' ls -la files/wl-captures 2>/dev/null').split('\n').filter((l) => /WL_/.test(l));
const sharedFiles = () => sh('find /sdcard/Android/data/' + PKG + ' -type f 2>/dev/null').split('\n').filter((l) => l.trim());
const galleryRows = (kind) => sh(`content query --uri content://media/external/${kind}/media --projection _data`).split('\n').filter((l) => /_data=/.test(l) && !/\/(wl|s|c\d)\.png$/.test(l));
const relaunchApp = async () => { K.start(); await sleep(8000); page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(2500); await K.calibrate(); };
const killApp = async () => { K.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await sleep(2500); for (let i = 0; i < 4 && K.pid(); i++) { K.adb('shell', 'am', 'kill', PKG); await sleep(2500); } if (K.pid()) { K.adb('shell', 'am', 'force-stop', PKG); await sleep(1500); } return !K.pid(); };
// The emulator camera's shutter and confirm button: centred, near the foot of the unfolded screen.
const SCR = () => { const m = K.adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/); return { w: +m[1], h: +m[2] }; };
const camTap = async () => { const s = SCR(); K.adb('shell', 'input', 'tap', String(Math.round(s.w / 2)), String(Math.round(s.h * 0.902))); await sleep(3500); };
const atForm = async (type = 'cardiac') => { await go('#/new?type=' + type); await sleep(2500); await page.evaluate(() => document.querySelector('#gal').scrollIntoView({ block: 'center' })); await sleep(800); };
const keptCard = () => page.evaluate(() => (document.querySelector('[data-kepthome]') || {}).textContent || '');
await fold(false);
await go('#/'); await sleep(800); await page.evaluate(() => { const d = document.querySelector('.sheet [data-discard]'); if (d) d.click(); }); await sleep(500);

// T: what is typed into a scan form survives Android ending Wavelength.
await go('#/new?type=lung'); await page.waitForSelector('#ef'); await sleep(1500);
await K.tapSel('#ind'); await sleep(1200); await K.type('Synthetic case typed on emulator');
await K.backKey(); // closes the keyboard only
const t0 = await page.evaluate(() => document.querySelector('#ind').value);
const killedT = await killApp();
await relaunchApp();
const tCard = await keptCard();
await page.click('[data-kepthome] a'); await page.waitForSelector('#ef'); await sleep(1800);
const t1 = await page.evaluate(() => ({ ind: document.querySelector('#ind').value, type: (document.querySelector('input[name=type]:checked') || {}).value }));
record('T1', 'Typed into a new scan (real keyboard), then Android ends Wavelength: Home offers the unfinished scan and Review brings the text back', killedT && /1 unfinished scan/.test(tCard) && t1.ind === t0 && t1.ind === 'Synthetic case typed on emulator' && t1.type === 'lung', JSON.stringify({ killedT, tCard, t0, t1 }));
K.shot('T1-continued');
await go('#/'); await sleep(600); await page.evaluate(() => { const d = document.querySelector('.sheet [data-discard]'); if (d) d.click(); }); await sleep(800);

// M: camera photos and clips stay in Wavelength's private storage, never shared storage or the gallery.
const gal0 = { img: galleryRows('images').length, vid: galleryRows('video').length };
await atForm(); await K.tapSel('#addcam'); await sleep(5000);
const camOpen = /camera2/.test(K.focus());
await camTap(); const during = priv(); await camTap(); await sleep(5000);
const m1 = { camOpen, during: during.length, editor: await page.evaluate(() => { const c = document.querySelector('.editor canvas'); return c ? c.width + 'x' + c.height : null; }).catch(() => null), after: priv().length, shared: sharedFiles(), gallery: galleryRows('images').length - gal0.img };
record('M1', 'Take photo: the camera writes into Wavelength\'s private folder; once the app has its copy the file is gone; nothing in shared storage or the gallery', m1.camOpen && m1.during === 1 && m1.editor && m1.after === 0 && m1.shared.length === 0 && m1.gallery === 0, JSON.stringify(m1));
await page.click('.editor [data-a=cancel]').catch(() => {}); await sleep(400); await page.click('.editor [data-cf=discard]').catch(() => {}); await sleep(600);
await atForm(); await K.tapSel('#addclip'); await sleep(900); await K.tapSel('.sheet [data-v=vcam]'); await sleep(5000);
await camTap(); await sleep(2500); await camTap(); await sleep(1500); const duringV = priv(); await camTap(); await sleep(8000);
const m2 = { during: duringV.length, editor: await page.evaluate(() => !!document.querySelector('.editor.clip')).catch(() => false), after: priv().length, shared: sharedFiles(), gallery: galleryRows('video').length - gal0.vid, movies: sh('ls /sdcard/Movies 2>/dev/null').trim() };
record('M2', 'Record a clip: the clip is written to Wavelength\'s private folder, not the phone\'s gallery; removed once the app has its copy', m2.during === 1 && m2.editor && m2.after === 0 && m2.shared.length === 0 && m2.gallery === 0 && !m2.movies, JSON.stringify(m2));
await page.click('.editor [data-a=cancel]').catch(() => {}); await sleep(400); await page.click('.editor [data-cf=discard]').catch(() => {}); await sleep(600);
// M3 Android ends Wavelength while the camera is open: the photo comes back as kept.
await go('#/'); await sleep(600); await page.evaluate(() => { const d = document.querySelector('.sheet [data-discard]'); if (d) d.click(); }); await sleep(600);
await atForm(); await K.tapSel('#addcam'); await sleep(5000); await camTap();
for (let i = 0; i < 4 && K.pid(); i++) { K.adb('shell', 'am', 'kill', PKG); await sleep(2000); }
const killedM = !K.pid();
await camTap(); await sleep(10000);
page = await K.connect(); await page.waitForSelector('nav.tabs', { timeout: 30000 }); await sleep(3000); await K.calibrate();
const m3 = { killedM, card: await keptCard(), left: priv().length };
record('M3', 'Android ends Wavelength while the camera is open: on return the photo is kept on this phone (Home) and the camera file is removed', killedM && /1 photo/.test(m3.card) && m3.left === 0, JSON.stringify(m3));

// L: photos versions before 1.0.14 left in shared storage are offered, and deleted only on request.
const LD = '/sdcard/Android/data/' + PKG + '/files/Pictures';
sh('mkdir -p ' + LD); for (const n of [1, 2]) sh(`cp /sdcard/wl.png ${LD}/JPEG_20261001_10000${n}_1.jpg`);
K.adb('shell', 'am', 'force-stop', PKG); await relaunchApp();
const lSheet = await page.evaluate(() => (document.querySelector('.sheet') || {}).textContent || '');
const lBefore = sharedFiles().length;
await page.evaluate(() => document.querySelector('.sheet [data-lgdel]').click()); await sleep(2500);
record('L1', 'Photos left by earlier versions: offered with Delete, Review or Not now; Delete removes them', /Photos left by earlier versions/.test(lSheet) && /2 photos/.test(lSheet) && lBefore === 2 && sharedFiles().length === 0, JSON.stringify({ lBefore, after: sharedFiles().length }));

// Y: Android backup and device-to-device transfer (the system's own test transport).
const P0 = sh('settings get secure backup_local_transport_parameters').trim();
sh('bmgr enable true'); sh('bmgr transport com.android.localtransport/.LocalTransport');
sh('settings put secure backup_local_transport_parameters is_encrypted=true');
const cloud = sh('bmgr backupnow ' + PKG);
sh('rm -f /data/user/0/com.android.localtransport/files/1/_full/' + PKG);
sh('settings put secure backup_local_transport_parameters is_encrypted=true,is_device_transfer=true');
const d2d = sh('bmgr backupnow ' + PKG);
const stored = sh('ls /data/user/0/com.android.localtransport/files/1/_full/ 2>/dev/null').includes(PKG);
const keptHere = sh('run-as ' + PKG + ' find app_webview/Default/IndexedDB -path "*blob*" -type f').split('\n').filter((l) => l.trim()).length;
sh('settings put secure backup_local_transport_parameters ' + (P0 && P0 !== 'null' ? P0 : '""'));
record('Y1', 'Cloud backup refuses Wavelength (Backup is not allowed)', /Backup is not allowed/.test(cloud), cloud.trim().split('\n').pop());
record('Y2', 'Device-to-device transfer copies nothing of Wavelength although kept photos are on the phone', !stored && keptHere > 0, JSON.stringify({ result: (d2d.match(/uk\.co\.thewavelength\.app with result: [^\n]*/) || [''])[0], stored, blobFilesOnPhone: keptHere }));

// O: other apps (the shell user stands in for any other app) cannot read Wavelength's storage.
const other = sh('su 2000 ls /data/data/' + PKG + ' 2>&1; su 2000 ls /data/data/' + PKG + '/files/wl-captures 2>&1');
const modes = sh('run-as ' + PKG + ' stat -c "%A %n" app_webview files files/wl-captures').trim();
record('O1', 'Another app\'s user id cannot list Wavelength\'s storage; its folders are owner-only', /Permission denied/.test(other) && !/WL_/.test(other) && modes.split('\n').every((l) => /^drwx(------|--x--x|rwx--x)/.test(l)), JSON.stringify({ other: other.trim().split('\n'), modes }));

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ device: K.dev, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed on the emulator`);
process.exit(failed.length ? 1 : 0);
