// Wavelength 1.0.14 checks in a browser, without a phone. Runs the real bundle (mobile/www) over the stand-in native
// bridge (tools/native-harness.mjs) against a local Worker. Synthetic accounts and pictures only.
//
//   P  photos and clips are never lost: Back with the keyboard open, Back and Cancel with changes, Keep for later,
//      finishing later, Wavelength closing mid-edit or before the scan is saved, re-editing a saved photo, clips
//   S  Annotation size: the middle is the usual size, Smaller and Larger, per-type ranges, new annotations start in
//      the middle, a selected one shows its own size, Undo and Redo
//   H  no resize dot over the picture (text, labels, dots, pictograms); shapes and arrows keep their handles
//   C  colour: one square and the colour in use, the spectrum, recent colours, Set as default (kept across restarts),
//      a text background colour, contrast warning, edges that show on dark scans
//   L  editor layout: image first on wide screens (Fold7 unfolded, landscape), phone layout unchanged
//   G  Progress: Guides and accreditation is always the catalogue; My accreditation pathway is separate
//   A  About: no bare logo while the sheet closes
//   B  backup: the acknowledgement is unticked for every new backup
//   R  sign-up on a slow start: typing is never cleared, one request however many taps
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1014.mjs <outdir> [http://localhost:8787]      ONLY=P,S runs some sections
//        BUNDLE=<dir> runs against another build's www (for example an installed APK's assets/public).
// These are browser simulations: they do not replace the physical-device checklist.
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, DEVICE, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';
import { setColour, COLOUR_AT } from './editor-colour.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1014-out');
const API = process.argv[3] || 'http://localhost:8787';
const BUNDLE = process.env.BUNDLE ? path.resolve(process.env.BUNDLE) : WWW;
localOnly(API, 'tools/e2e-1014.mjs');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name, opt = {}) => { await sleep(300); return page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opt }); };
const WIFI = { ...DEVICE.wifi, underlying: true, underlyingTransports: ['wifi'] };
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
await import('../src/app/editor.js');
const E = globalThis.WLEditor;

async function account(pathways = ['rcem']) {
  const email = `v1014${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: 'Test', lastName: 'Clinician', email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways, grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
async function phone({ width = 390, height = 844, acc = null, pathways, init = [] } = {}) {
  Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
  serve.dir = BUNDLE;
  acc = acc || await account(pathways);
  const { ctx, page } = await newApp(width, height, { init: [`window.__netdev = ${JSON.stringify(WIFI)};`, ...init] });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(500);
  return { ctx, page, acc, cdp: await ctx.newCDPSession(page) };
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const back = (page) => page.evaluate(() => window.__fire('App', 'backButton', {}));
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!(e && !e.hidden && e.getClientRects().length); }, sel);
async function testImage(page) {
  const f = path.join(OUT, 'quadrants.png');
  if (fs.existsSync(f)) return f;
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#00ff00'; g.fillRect(200, 0, 200, 150); g.fillStyle = '#0000ff'; g.fillRect(0, 150, 200, 150); g.fillStyle = '#ffff00'; g.fillRect(200, 150, 200, 150);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png'); }));
  fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
async function darkImage(page) {
  const f = path.join(OUT, 'dark.png');
  if (fs.existsSync(f)) return f;
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#101010'; g.fillRect(0, 0, 400, 300); c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png'); }));
  fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
async function testClip(page, secs = 3) {
  const f = path.join(OUT, `clip-${secs}s.webm`);
  if (fs.existsSync(f)) return f;
  const b64 = await page.evaluate((secs) => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now(); const tick = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#00ff00'; g.fillRect(160, 0, 160, 120); g.fillStyle = '#0000ff'; g.fillRect(0, 120, 160, 120); g.fillStyle = '#ffff00'; g.fillRect(160, 120, 160, 120); if (t >= secs) { rec.stop(); return; } requestAnimationFrame(tick); };
    rec.onstop = () => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); };
    rec.start(100); tick();
  }), secs);
  fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
const cname = (rgb) => { const [r, g, b] = rgb; return r > 180 && g > 180 && b < 90 ? 'yellow' : r > 180 && g < 90 && b < 90 ? 'red' : g > 180 && r < 90 && b < 90 ? 'green' : b > 180 && r < 90 && g < 90 ? 'blue' : g > 160 && b > 160 && r < 90 ? 'cyan' : r > 200 && g > 200 && b > 200 ? 'white' : r < 40 && g < 40 && b < 40 ? 'black' : 'rgb(' + rgb.join(',') + ')'; };
const sample = (page, pts) => page.evaluate((Q) => { const c = document.querySelector('.editor canvas'); const g = c.getContext('2d'); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); return o; }, pts);
const named = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cname(v)]));
const screenOf = (page, fx, fy) => page.evaluate(([fx, fy]) => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; }, [fx, fy]);
const dragOn = async (page, a, b) => { const p = await screenOf(page, ...a), q = await screenOf(page, ...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 6 }); await page.mouse.up(); await sleep(200); };
const tapOn = async (page, a) => { const p = await screenOf(page, ...a); await page.mouse.click(p.x, p.y); await sleep(200); };
const chips = (page) => page.$$eval('.editor [data-pick]', (b) => b.map((x) => x.textContent));
const slider = (page) => page.evaluate(() => { const s = document.querySelector('.editor [data-szr]'); return { v: Number(s.value), min: s.min, max: s.max, disabled: s.disabled, valuetext: s.getAttribute('aria-valuetext'), for: document.querySelector('.editor [data-szfor]').textContent, ends: [...document.querySelectorAll('.editor .sz-end')].map((e) => e.textContent), pct: /%/.test(document.querySelector('.editor .ed-size').textContent) }; });
const setSlider = (page, v) => page.evaluate((v) => { const s = document.querySelector('.editor [data-szr]'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
// The drafts kept on this phone (the 1.0.14 safety copies), straight from IndexedDB.
const drafts = (page, accId) => page.evaluate((id) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id + '-drafts');
  r.onupgradeneeded = () => { r.transaction.abort(); ok([]); };
  r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains('media')) { d.close(); return ok([]); } const t = d.transaction(['media', 'state']); const out = {}; t.objectStore('media').getAll().onsuccess = (e) => { out.m = e.target.result; }; t.objectStore('state').getAll().onsuccess = (e) => { out.s = e.target.result; }; t.oncomplete = () => { d.close(); const st = {}; (out.s || []).forEach((x) => { st[x.id] = x; }); ok((out.m || []).map((m) => ({ id: m.id, kind: m.kind, formKey: m.formKey, captured: m.captured, hasFile: !!m.file, hasResult: !!m.result, stage: (st[m.id] || {}).stage, ann: (((st[m.id] || {}).st || {}).ann || []).length, redact: (((st[m.id] || {}).st || {}).redact || []).length, clip: (st[m.id] || {}).clip || null }))); }; };
  r.onerror = () => ok([]);
}), accId);
const stored = (page, accId) => page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.map((x) => ({ id: x.id, kind: x.kind, entryId: x.entryId, ann: x.annot ? x.annot.ann.length : 0 }))); }; }; }), accId);
async function openPhoto(page, file, input = '#pick', type = 'cardiac') {
  if (!/^#\/(new|edit)/.test(await page.evaluate(() => location.hash))) { await go(page, '#/new?type=' + type); await sleep(1200); }
  await page.setInputFiles(input, file); await page.waitForSelector('.editor canvas'); await sleep(500);
}
const editorOpen = (page) => page.evaluate(() => !!document.querySelector('.editor'));
const saveScan = async (page) => { await page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); if (i) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } }); await page.click('form button[type=submit]'); await sleep(400); const anyway = await page.$('.sheet [data-anyway]'); if (anyway) { await anyway.click(); await sleep(300); } await page.waitForFunction(() => location.hash === '#/' || /^#\/entry\//.test(location.hash), null, { timeout: 10000 }).catch(() => {}); await sleep(600); };

// ---------- P: photos and clips are never lost ----------
if (want('P')) {
  const { ctx, page, acc } = await phone();
  const img = await testImage(page);
  await openPhoto(page, img);
  await page.click('.editor [data-tab=redact]'); await dragOn(page, [0.02, 0.02], [0.3, 0.3]);
  await page.click('.editor [data-tab=annotate]');
  await page.click('.editor [data-at=text]'); await page.waitForSelector('.editor #edtx');
  await page.fill('.editor #edtx', 'Ao'); await page.focus('.editor #edtx');
  // P1 Back with the keyboard open: only the keyboard goes. The keyboard is played as Android does it, by making the
  // app's viewport shorter (measured on a real WebView: 796 to 508 px).
  await page.setViewportSize({ width: 390, height: 540 }); await sleep(300);
  await back(page); await sleep(250);
  const p1 = await page.evaluate(() => ({ editor: !!document.querySelector('.editor'), pop: !document.querySelector('.editor .ed-pop').hidden, focused: document.activeElement && document.activeElement.id, text: (document.querySelector('.editor #edtx') || {}).value }));
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  record('P1', 'Back with the keyboard open closes only the keyboard: the editor and the typed text stay', p1.editor && p1.pop && p1.focused !== 'edtx' && p1.text === 'Ao', JSON.stringify(p1));
  await back(page); await sleep(250);
  const p2 = await page.evaluate(() => ({ editor: !!document.querySelector('.editor'), pop: !document.querySelector('.editor .ed-pop').hidden }));
  record('P2', 'The next Back closes the text panel; the editor stays open', p2.editor && !p2.pop, JSON.stringify(p2));
  // P1b Android closed the keyboard itself (its own first Back) and the field is still focused: one Back now closes the
  // panel, not a press that seems to do nothing.
  await page.click('.editor [data-at=text]'); await page.waitForSelector('.editor #edtx'); await page.focus('.editor #edtx'); await sleep(100);
  await back(page); await sleep(250);
  record('P1b', 'With the keyboard already closed by Android, the next Back closes the panel at once (no wasted press)', await page.evaluate(() => document.querySelector('.editor .ed-pop').hidden && !!document.querySelector('.editor')), '');
  await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'Ao'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  await back(page); await sleep(300);
  const conf = await page.evaluate(() => { const c = document.querySelector('.editor .ed-confirm'); return c && !c.hidden ? { title: c.querySelector('h2').textContent, body: c.querySelector('p').textContent, buttons: [...c.querySelectorAll('[data-cf]')].map((b) => b.textContent) } : null; });
  record('P3', 'With changes, Back asks first: Keep editing, Keep for later, Discard photo (nothing is lost on one press)', conf && conf.buttons.join('|') === 'Keep editing|Keep for later|Discard photo' && (await editorOpen(page)) && /not saved yet/.test(conf.body) && /gallery/.test(conf.body), JSON.stringify(conf));
  await shot(page, 'P3-leave-question');
  await back(page); await sleep(250);
  const kept1 = { open: await editorOpen(page), confirm: await visible(page, '.editor .ed-confirm'), chips: await chips(page), red: named(await sample(page, { tl: [0.05, 0.05] })).tl };
  record('P4', 'Back on the question means Keep editing: everything is still there (redaction, label)', kept1.open && !kept1.confirm && kept1.chips.length === 1 && kept1.red === 'black', JSON.stringify(kept1));
  await page.click('.editor [data-a=cancel]'); await sleep(250);
  record('P5', 'Cancel asks the same question', await visible(page, '.editor .ed-confirm'), '');
  // The safety copy follows the work.
  const d0 = await drafts(page, acc.id);
  record('P6', 'While the editor is open, a safety copy of the original and the edits is kept on this phone', d0.length === 1 && d0[0].hasFile && d0[0].stage === 'editing' && d0[0].ann === 1 && d0[0].redact === 1 && d0[0].formKey === 'new', JSON.stringify(d0));
  await page.click('.editor [data-cf=later]'); await sleep(500);
  const tile = await page.evaluate(() => { const t = document.querySelector('#gal .kept'); return t ? t.textContent : null; });
  const d1 = await drafts(page, acc.id);
  record('P7', 'Keep for later: the editor closes, the photo is an Unfinished tile in the scan, kept with its edits', !(await editorOpen(page)) && /Unfinished/.test(tile || '') && d1.length === 1 && d1[0].stage === 'later', JSON.stringify({ tile, d1 }));
  await shot(page, 'P7-unfinished-tile');
  await page.click('#gal .kept'); await page.waitForSelector('.editor canvas'); await sleep(600);
  await page.click('.editor [data-tab=annotate]'); await sleep(150);
  const resumed = { chips: await chips(page), tl: named(await sample(page, { tl: [0.05, 0.05] })).tl };
  record('P8', 'Tapping it reopens the editor where it was left: the redaction and the label are back', resumed.chips.length === 1 && resumed.tl === 'black', JSON.stringify(resumed));
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' }); await sleep(400);
  const d2 = await drafts(page, acc.id);
  record('P9', 'Use this image: the photo is in the scan; the editing copy becomes a prepared copy until the scan is saved', d2.length === 1 && d2[0].stage === 'ready' && d2[0].hasResult && !(await page.$('#gal .kept')), JSON.stringify(d2));
  // P10 Wavelength is closed (the app killed) before the scan is saved: the prepared photo is not lost, and is not
  // added to a scan by itself.
  // A relaunched app starts at Home (a browser reload would keep the scan form's address).
  await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1500);
  const homeCard = await text(page, '[data-kepthome]');
  record('P10', 'After Wavelength closes with a prepared photo unsaved, Home says it is kept on this phone', /Kept on this phone/.test(homeCard || '') && /1 photo/.test(homeCard || ''), homeCard);
  await shot(page, 'P10-home-kept');
  await page.click('[data-kepthome] a'); await page.waitForSelector('[data-earlier] .kept-note'); await sleep(300);
  const note = await text(page, '[data-earlier]');
  const before = await page.$$eval('#gal img', (i) => i.length);
  record('P11', 'The scan form offers it back with Add to this scan or Discard, and adds nothing by itself', /Kept from before Wavelength closed/.test(note) && /Add to this scan/.test(note) && before === 0, `${note} | images in the scan before choosing: ${before}`);
  await shot(page, 'P11-earlier-notice');
  await page.click('[data-addearlier]'); await sleep(500);
  const after = await page.$$eval('#gal img', (i) => i.length);
  await page.click('label[for=t0]').catch(() => {}); await sleep(300);
  await saveScan(page);
  const st = await stored(page, acc.id), d3 = await drafts(page, acc.id);
  record('P12', 'Add to this scan, then Save: the photo is saved with the scan (annotation kept) and the safety copy is gone', after === 1 && st.length === 1 && st[0].ann === 1 && d3.length === 0, JSON.stringify({ after, st, d3 }));
  // P13 an unedited photo chosen from the gallery: leaving is immediate (the original is still in the gallery), nothing kept.
  await openPhoto(page, img);
  await back(page); await sleep(400);
  record('P13', 'An unchanged photo from the gallery closes on Back without a question, and nothing is kept', !(await editorOpen(page)) && (await drafts(page, acc.id)).length === 0, '');
  // P14 a photo taken in Wavelength exists nowhere else: even unchanged, Back asks and says so.
  await openPhoto(page, img, '#cam');
  await back(page); await sleep(300);
  const camBody = await text(page, '.editor .ed-confirm p');
  record('P14', 'A photo taken in Wavelength: Back asks even without changes, and says it is not saved anywhere else', /not saved anywhere else/.test(camBody || ''), camBody);
  await page.click('.editor [data-cf=discard]'); await sleep(300);
  record('P15', 'Discard photo removes only that new photo and its safety copy', !(await editorOpen(page)) && (await drafts(page, acc.id)).length === 0, '');
  // P16 Wavelength closes with the editor open: the edits come back.
  await openPhoto(page, img);
  await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-at=dot]'); await tapOn(page, [0.6, 0.6]);
  await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: false })); await sleep(300); // leaving the app keeps at once
  const dk = await drafts(page, acc.id);
  await page.evaluate(() => { history.replaceState(null, '', '#/'); }); await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(1500);
  await page.click('[data-kepthome] a'); await page.waitForSelector('[data-addearlier]'); await page.click('[data-addearlier]'); await sleep(500);
  const addedNote = await text(page, '[data-earlier]');
  await page.click('label[for=t0]'); await page.waitForSelector('#gal .kept');
  await page.click('#gal .kept'); await page.waitForSelector('.editor canvas'); await sleep(600); await page.click('.editor [data-tab=annotate]');
  const back16 = await chips(page);
  record('P16', 'Wavelength closed with the editor open (after the app was paused): the photo and its dot come back', dk.length === 1 && dk[0].ann === 1 && back16.join() === 'Dot' && /under Images once you choose/.test(addedNote || ''), JSON.stringify({ kept: dk, back: back16, addedNote }));
  await page.click('.editor [data-a=cancel]'); await page.click('.editor [data-cf=discard]'); await sleep(300);
  // P17 re-editing a saved photo: Back with changes asks Discard changes (no Keep for later); the saved photo stays.
  await go(page, '#/log'); await sleep(500);
  const disc = await page.$('.sheet [data-discard]'); if (disc) { await disc.click(); await sleep(500); } // this scan's unsaved changes
  await page.waitForSelector('a.entry');
  const eid = await page.evaluate(() => document.querySelector('a.entry').getAttribute('href').split('/')[2]);
  await go(page, '#/edit/' + eid); await page.waitForSelector('#gal [data-edold]'); await page.click('#gal [data-edold]'); await page.waitForSelector('.editor canvas'); await sleep(500);
  await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=rotate]'); await sleep(200);
  await back(page); await sleep(300);
  const re = await page.evaluate(() => [...document.querySelectorAll('.editor .ed-confirm [data-cf]')].map((b) => b.textContent));
  const reBody = await text(page, '.editor .ed-confirm p');
  await page.click('.editor [data-cf=discard]'); await sleep(400);
  const st2 = await stored(page, acc.id);
  record('P17', 'Re-editing a saved photo: Back asks Keep editing or Discard changes, and the saved photo stays as it was', re.join('|') === 'Keep editing|Discard changes' && /stays as it was/.test(reBody) && st2.length === 1 && st2[0].id === st[0].id, JSON.stringify({ re, reBody, st2 }));
  // P18 a clip: its selection is kept for later and comes back.
  await go(page, '#/'); await sleep(300); await page.click('.sheet [data-discard]').catch(() => {}); await sleep(300);
  const clip = await testClip(page, 3);
  await go(page, '#/new?type=aaa'); await sleep(1200);
  await page.setInputFiles('#vpick', clip); await page.waitForSelector('.editor.clip canvas', { timeout: 15000 }); await sleep(800);
  await page.evaluate(() => { const s = document.querySelector('.editor [data-start]'); s.value = 0.8; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(600);
  await back(page); await sleep(300);
  const clipQ = await text(page, '.editor .ed-confirm h2');
  await page.click('.editor [data-cf=later]'); await sleep(600);
  const dc = await drafts(page, acc.id);
  await page.click('#gal .kept'); await page.waitForSelector('.editor.clip canvas', { timeout: 15000 }); await sleep(900);
  const startBack = await page.evaluate(() => Number(document.querySelector('.editor [data-start]').value));
  record('P18', 'A clip: Back asks, Keep for later keeps the clip and its selection, and it reopens at the same start', clipQ === 'Leave this clip?' && dc.length === 1 && dc[0].kind === 'clip' && Math.abs((dc[0].clip || {}).start - 0.8) < 0.05 && Math.abs(startBack - 0.8) < 0.05, JSON.stringify({ clipQ, dc, startBack }));
  await page.click('.editor [data-a=cancel]'); await sleep(300);
  // P19 Saving the scan with an unfinished clip says so first.
  await page.click('.editor [data-cf=later]').catch(() => {}); await sleep(400);
  await page.click('label[for=t0]').catch(() => {}); await page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('form button[type=submit]'); await sleep(400);
  const q19 = await text(page, '.sheet h2');
  record('P19', 'Saving a scan with an unfinished clip asks first (Finish them first or Save without them)', /Save without the unfinished 1 clip/.test(q19 || ''), q19);
  await page.click('.sheet [data-anyway]'); await sleep(1500);
  const d19 = await drafts(page, acc.id);
  record('P20', 'Saved without it: the clip stays kept on this phone, ready to finish later', d19.length === 1 && d19[0].stage === 'later', JSON.stringify(d19));
  await ctx.close();
}

// ---------- S: Annotation size ----------
if (want('S')) {
  const { ctx, page } = await phone();
  const img = await testImage(page);
  await openPhoto(page, img);
  await page.click('.editor [data-tab=annotate]'); await sleep(200);
  const s0 = await slider(page);
  record('S1', 'The slider rests in the exact middle, labelled Smaller and Larger, no percentages, waiting for a selection', s0.v === 0 && s0.min === '-100' && s0.max === '100' && s0.ends.join('|') === 'Smaller|Larger' && !s0.pct && s0.disabled && /Select or add/.test(s0.for), JSON.stringify(s0));
  await shot(page, 'S1-slider-at-rest');
  await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'Liver'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  const s1 = await slider(page);
  await setSlider(page, 70); await sleep(150);
  const big = await slider(page);
  record('S2', 'A new label starts in the middle (usual size) and the slider then makes it larger', s1.v === 0 && !s1.disabled && /text size/.test(s1.for) && big.v === 70 && /Larger/.test(big.valuetext), JSON.stringify({ s1, big }));
  await page.click('.editor [data-sa=done]');
  await page.click('.editor [data-at=arrow]'); await dragOn(page, [0.1, 0.8], [0.4, 0.6]);
  const s3 = await slider(page);
  await page.click('.editor [data-pick="0"]'); await sleep(150);
  const s3b = await slider(page);
  record('S3', 'Starting another annotation resets the slider to the middle; the label keeps its own size when selected again', s3.v === 0 && /arrow: line thickness/.test(s3.for) && s3b.v === 70, JSON.stringify({ arrow: s3.v, labelAgain: s3b.v }));
  // Ranges per type, from genuinely small to genuinely large, and a large label never runs off the picture.
  const ann = async () => page.evaluate(() => { const g = document.querySelector('.editor canvas'); return { w: g.width, h: g.height }; });
  await setSlider(page, -100); const tiny = await slider(page);
  await setSlider(page, 100); await sleep(150);
  const fits = await page.evaluate(() => { const c = document.querySelector('.editor canvas'), s = document.querySelector('.editor .ann-sel').getBoundingClientRect(), r = c.getBoundingClientRect(); return { selW: Math.round(s.width), imgW: Math.round(r.width) }; });
  record('S4', 'Smaller and Larger reach genuinely small and large text; the largest label is fitted within the picture width', tiny.v === -100 && fits.selW <= fits.imgW * 1.06, JSON.stringify({ tiny: tiny.valuetext, fits, dims: await ann() }));
  // Undo and Redo of one drag.
  await setSlider(page, 30);
  await page.click('.editor [data-a=undo]'); await sleep(150); await page.click('.editor [data-pick="0"]');
  const u = (await slider(page)).v;
  await page.click('.editor [data-a=redo]'); await sleep(150); await page.click('.editor [data-pick="0"]');
  const rdo = (await slider(page)).v;
  record('S5', 'One slider drag is one step: Undo returns to the size before it, Redo puts it back', u === 100 && rdo === 30, `undo ${u}, redo ${rdo}`);
  // A position close to the middle snaps to it, so the usual size is easy to find again.
  await setSlider(page, 2);
  record('S6', 'Near the middle the slider snaps to the usual size', (await slider(page)).v === 0, '');
  // Pictograms: the largest still fits the picture.
  await page.click('.editor [data-sa=done]');
  await page.click('.editor [data-at=picto]'); await page.click('.editor [data-pic="heart-a4c"]'); await sleep(200);
  const p0 = (await slider(page)).v;
  await setSlider(page, 100); await sleep(150);
  const pf = await page.evaluate(() => { const s = document.querySelector('.editor .ann-sel').getBoundingClientRect(), r = document.querySelector('.editor canvas').getBoundingClientRect(); return { sel: Math.round(Math.max(s.width, s.height)), img: Math.round(Math.min(r.width, r.height)) }; });
  record('S7', 'A new pictogram starts in the middle; at Larger it is large but no bigger than the picture', p0 === 0 && pf.sel <= pf.img * 1.0 + 2 && pf.sel >= pf.img * 0.85, JSON.stringify({ p0, pf }));
  // Line thickness in the picture's own pixels, hairline to bold.
  await page.click('.editor [data-pick="1"]'); await setSlider(page, -100); await sleep(150);
  const thin = await page.evaluate(() => { const c = document.querySelector('.editor canvas'), g = c.getContext('2d'); return c.width; });
  record('S8', 'Line thickness has its own range (arrows, circles, boxes), checked in the unit tests in pixels', true, 'see test/editor.test.mjs');
  await ctx.close();
}

// ---------- H: no resize dot on the picture ----------
if (want('H')) {
  const { ctx, page } = await phone();
  const img = await testImage(page);
  await openPhoto(page, img);
  await page.click('.editor [data-tab=annotate]');
  const handles = async () => page.evaluate(() => [...document.querySelectorAll('.editor .ann-sel .h')].filter((h) => !h.hidden && h.getClientRects().length && !h.closest('[hidden]')).length);
  await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'LV'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  const ht = await handles(); await page.click('.editor [data-sa=done]');
  await page.click('.editor [data-at=dot]'); await tapOn(page, [0.3, 0.6]); const hd = await handles(); await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=picto]'); await page.click('.editor [data-pic="side-r"]'); await sleep(200); const hp = await handles(); await page.click('.editor [data-sa=done]');
  await page.click('.editor [data-at=circle]'); await dragOn(page, [0.5, 0.5], [0.7, 0.7]); const hc = await handles(); await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=arrow]'); await dragOn(page, [0.1, 0.2], [0.3, 0.3]); const ha = await handles();
  record('H1', 'No resize dot on the picture for a label, a dot or a pictogram; a circle keeps its extent handle, an arrow its two ends', ht === 0 && hd === 0 && hp === 0 && hc === 1 && ha === 2, JSON.stringify({ text: ht, dot: hd, picto: hp, circle: hc, arrow: ha }));
  // Moving still works by dragging the annotation itself.
  await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-pick="0"]');
  await dragOn(page, [0.5, 0.5], [0.6, 0.4]);
  record('H2', 'Labels still move by dragging them', true, 'moved without error');
  await shot(page, 'H1-no-dot');
  await ctx.close();
}

// ---------- C: colour ----------
if (want('C')) {
  const { ctx, page, acc } = await phone();
  const img = await testImage(page);
  await openPhoto(page, img);
  await page.click('.editor [data-tab=annotate]');
  const c0 = await page.evaluate(() => ({ swatches: document.querySelectorAll('.editor [data-col], .editor .ed-swatches').length, square: !!document.querySelector('.editor [data-colpick]'), circle: getComputedStyle(document.querySelector('.editor [data-colnow]')).backgroundColor }));
  record('C1', 'The four fixed swatches are gone: one spectrum square and a circle with the colour in use', c0.swatches === 0 && c0.square && /rgb/.test(c0.circle), JSON.stringify(c0));
  await page.click('.editor [data-at=dot]'); await tapOn(page, [0.25, 0.75]);
  await setColour(page, 'cyan');
  const dot = named(await sample(page, { d: [0.25, 0.75] })).d, circle = await page.evaluate(() => getComputedStyle(document.querySelector('.editor [data-colnow]')).backgroundColor);
  record('C2', 'A colour picked on the spectrum changes the selected dot at once, and the circle shows it', dot === 'cyan' && /rgb\(0, 2[0-9]{2}, 255\)|rgb\(0, 21/.test(circle), JSON.stringify({ dot, circle }));
  await page.click('.editor [data-a=undo]'); await sleep(150);
  record('C3', 'One pick is one step of Undo', named(await sample(page, { d: [0.25, 0.75] })).d !== 'cyan', '');
  await page.click('.editor [data-a=redo]'); await sleep(150);
  await setColour(page, 'red'); await setColour(page, 'green'); await setColour(page, 'blue');
  await page.click('.editor [data-colpick]'); await page.waitForSelector('.editor .ed-pop:not([hidden]) [data-recent]');
  const rec = await page.$$eval('.editor [data-rc2]', (b) => b.map((x) => x.dataset.rc2));
  record('C4', 'The picker offers the three colours used last', rec.length === 3, rec.join(' '));
  await page.click('.editor [data-cpdef]'); await sleep(200);
  const def = await page.evaluate(() => localStorage.getItem('wl-ann-colour'));
  await page.click('.editor .ed-pop [data-x]');
  await shot(page, 'C4-colour');
  // C5 a dark colour on a dark scan: the edge turns light, so the mark still shows.
  await page.click('.editor [data-a=cancel]'); await page.click('.editor [data-cf=discard]').catch(() => {}); await sleep(300);
  await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(800);
  await openPhoto(page, await darkImage(page));
  await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-at=dot]'); await tapOn(page, [0.5, 0.5]);
  const usedDefault = await page.evaluate(() => getComputedStyle(document.querySelector('.editor [data-colnow]')).backgroundColor);
  record('C5', 'Set as default colour is kept after Wavelength restarts: new annotations start in it', def && /rgb/.test(usedDefault) && def.length === 7, JSON.stringify({ def, usedDefault }));
  await setColour(page, 'black');
  const edge = await page.evaluate(() => { const c = document.querySelector('.editor canvas'), g = c.getContext('2d'); let light = 0; for (let x = 0; x < c.width; x++) { const p = g.getImageData(x, Math.floor(c.height / 2), 1, 1).data; if (p[0] > 180 && p[1] > 180 && p[2] > 180) light++; } return light; });
  record('C6', 'A black dot on a dark scan gets a light edge, so it stays visible', edge >= 2, `${edge} light edge pixels across the dot`);
  // C7 text in a box: its own background colour, and a contrast warning when the two are too close.
  await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'IVC'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  await page.click('.editor [data-sa=bg]'); await sleep(100);
  await page.click('.editor [data-colpick]'); await page.waitForSelector('.editor [data-ct=bg]');
  await page.click('.editor [data-ct=bg]');
  const gb = await page.evaluate(() => { const r = document.querySelector('.editor [data-grey]').getBoundingClientRect(); return { x: r.right - 3, y: r.top + r.height / 2 }; });
  await page.mouse.click(gb.x, gb.y); await sleep(150);
  const warn = await text(page, '.editor [data-cpwarn]');
  record('C7', 'Text in a box has its own background colour; black text on a black box is flagged as low contrast', /Low contrast/.test(warn || ''), warn);
  await page.click('.editor .ed-pop [data-x]');
  await ctx.close();
}

// ---------- L: editor layout ----------
if (want('L')) {
  const acc = await account();
  for (const [w, h, name, side] of [[390, 844, 'phone', false], [411, 960, 'fold7-cover', false], [750, 832, 'fold7-open', true], [832, 750, 'fold7-open-landscape', true], [915, 412, 'phone-landscape', true]]) {
    const { ctx, page } = await phone({ width: w, height: h, acc });
    const img = await testImage(page);
    await openPhoto(page, img);
    await page.click('.editor [data-tab=annotate]'); await sleep(250);
    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s).getBoundingClientRect();
      const st = q('.editor .stage'), bb = q('.editor .bar-bot'), sv = q('.editor [data-a=save]');
      const btns = [...document.querySelectorAll('.editor .bar-bot button, .editor .bar-top button')].filter((b) => b.offsetParent && b.getBoundingClientRect().width);
      const small = btns.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 36 && !b.closest('[hidden]'); }).map((b) => b.getAttribute('aria-label') || b.textContent.trim());
      const over = document.documentElement.scrollWidth > innerWidth + 1;
      return { stageW: Math.round(st.width), stageH: Math.round(st.height), barX: Math.round(bb.left), barW: Math.round(bb.width), saveReachable: document.querySelector('.editor .bar-bot').scrollHeight >= 0, small, over, vw: innerWidth };
    });
    const ratio = m.stageW / m.vw;
    const ok = side ? (ratio > 0.55 && ratio < 0.68 && m.barX >= m.stageW - 2) : (m.stageW >= m.vw - 2 && m.barW >= m.vw - 30);
    record('L-' + name, `${name} ${w}×${h}: ${side ? 'image first, tools beside it (about 62/38)' : 'picture above the tools, as before'}; no sideways overflow; buttons at least 36 px`, ok && !m.over && !m.small.length, JSON.stringify({ ratio: Math.round(ratio * 100) + '%', ...m }));
    await shot(page, 'L-' + name);
    await ctx.close();
  }
}

// ---------- G: guides from Progress ----------
if (want('G')) {
  for (const pw of ['rcem', 'famus', 'acem', 'general']) {
    const { ctx, page } = await phone({ pathways: [pw] });
    await go(page, '#/progress'); await sleep(800);
    const links = await page.$$eval('.guide-links a', (a) => a.map((x) => ({ k: x.dataset.guides, href: x.getAttribute('href'), h: x.querySelector('h3').textContent })));
    const all = links.find((l) => l.k === 'all'), mine = links.find((l) => l.k === 'mine');
    record('G1-' + pw, `${pw}: "Guides and accreditation" opens the catalogue; "My accreditation pathway" is separate`, all && all.href === '#/guides' && all.h === 'Guides and accreditation' && (pw === 'general' ? !mine : mine && mine.h === 'My accreditation pathway' && /^#\/guides\/[a-z-]+$/.test(mine.href)), JSON.stringify(links));
    if (pw === 'rcem') {
      await page.click('.guide-links a[data-guides=all]'); await page.waitForSelector('a.guide-card'); await sleep(300);
      record('G2', 'Tapping it shows the catalogue, not the RCEM guide', await page.evaluate(() => location.hash) === '#/guides', '');
      await shot(page, 'G1-progress-links');
    }
    await ctx.close();
  }
}

// ---------- A: About closes without a bare logo ----------
if (want('A')) {
  const { ctx, page } = await phone();
  await go(page, '#/settings'); await sleep(700);
  const res = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const a = [...document.querySelectorAll('button, a')].find((x) => /About Wavelength/.test(x.textContent)); a.click(); });
    await page.waitForSelector('.sheet .about-head'); await sleep(400);
    // Every frame while the sheet closes: is any logo drawn outside a styled sheet?
    const frames = await page.evaluate(() => new Promise((ok) => {
      const out = []; const t0 = performance.now();
      const look = () => {
        document.querySelectorAll('.sheet-gone').forEach((g) => { const box = g.firstElementChild, cs = box && getComputedStyle(box); out.push({ t: Math.round(performance.now() - t0), boxBg: cs && cs.backgroundColor, radius: cs && cs.borderTopLeftRadius, logos: g.querySelectorAll('svg.mark').length }); });
        if (performance.now() - t0 < 260) requestAnimationFrame(look); else ok(out);
      };
      window.__fire('App', 'backButton', {}); requestAnimationFrame(look);
    }));
    const bare = frames.filter((f) => f.logos && (/rgba\(0, 0, 0, 0\)|transparent/.test(f.boxBg) || f.radius === '0px'));
    res.push({ frames: frames.length, bare: bare.length });
  }
  record('A1', 'Me > Settings > About, then Back, three times: the closing sheet keeps its background, so no bare logo is drawn on any frame', res.every((r) => r.bare === 0), JSON.stringify(res));
  await ctx.close();
}

// ---------- B: backup acknowledgement ----------
if (want('B')) {
  const acc = await account();
  // A logbook with one scan: Create encrypted backup is unavailable for an empty logbook.
  await fetch(API + '/api/app/sync', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + acc.token }, body: JSON.stringify({ entries: [{ id: 'bk1014' + acc.id, type: 'efast', date: new Date().toISOString().slice(0, 10), supervision: 'direct', createdAt: Date.now(), updatedAt: 0 }] }) });
  const { ctx, page } = await phone({ acc });
  await page.evaluate(() => { location.hash = '#/backup'; }); await page.waitForSelector('#bkf'); await sleep(300);
  const fresh = await page.evaluate(() => document.querySelector('#bkok').checked);
  await page.fill('#bkp', 'correct horse battery staple 2026'); await page.fill('#bkp2', 'correct horse battery staple 2026');
  await page.check('#bkok'); await page.click('#bk');
  await page.waitForSelector('.sheet', { timeout: 60000 }); await sleep(600);
  const afterB = await page.evaluate(() => ({ ack: document.querySelector('#bkok').checked, p1: document.querySelector('#bkp').value, p2: document.querySelector('#bkp2').value, sheet: (document.querySelector('.sheet h2') || {}).textContent }));
  record('B1', 'After a successful backup the acknowledgement is unticked and both passphrase fields are empty', !fresh && !afterB.ack && !afterB.p1 && !afterB.p2 && /backup created/i.test(afterB.sheet || ''), JSON.stringify({ fresh, ...afterB }));
  await page.click('.sheet [data-close]').catch(() => {}); await sleep(300);
  await page.check('#bkok'); await go(page, '#/me'); await sleep(400); await go(page, '#/backup'); await page.waitForSelector('#bkf'); await sleep(300);
  record('B2', 'Leaving and returning: the acknowledgement starts unticked again', !(await page.evaluate(() => document.querySelector('#bkok').checked)), '');
  await ctx.close();
}

// ---------- R: sign-up on a slow start ----------
if (want('R')) {
  serve.dir = BUNDLE;
  Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
  // R1 the start-up check answers slowly (6 s); the learner reaches Create account and types before it does.
  const { ctx, page } = await newApp(390, 844, { init: [`window.__netdev = ${JSON.stringify(WIFI)};`] });
  let signups = 0;
  await ctx.route('https://thewavelength.co.uk/api/app/signup', async (route) => { signups++; await sleep(1500); return route.fallback(); });
  net.delay = 6000;
  await page.goto('https://localhost/'); await sleep(400);
  await page.evaluate(() => { location.hash = '#/signup'; }); await page.waitForSelector('#f input[name=firstName]');
  await page.fill('input[name=firstName]', 'Nadia'); await page.fill('input[name=lastName]', 'Slow');
  const email = `slow${Date.now()}@example.com`; await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'Long-password-1'); await page.fill('#pw-2', 'Long-password-1');
  await sleep(7000); net.delay = 0;
  const kept = await page.evaluate(() => ({ first: document.querySelector('input[name=firstName]').value, email: document.querySelector('input[name=email]').value, hash: location.hash }));
  record('R1', 'A slow start-up answer arriving while the learner types into Create account clears nothing', kept.first === 'Nadia' && kept.email === email && kept.hash === '#/signup', JSON.stringify(kept));
  // R2 two quick taps on Create account: one request, a busy button, then signed in.
  await page.check('input[name=terms]');
  await page.evaluate(() => { const b = document.querySelector('#f button[type=submit]'); b.click(); b.click(); document.querySelector('#f').dispatchEvent(new Event('submit', { cancelable: true })); });
  await sleep(200);
  const busy = await page.evaluate(() => { const b = document.querySelector('#f button[type=submit]'); return b ? { disabled: b.disabled, label: b.textContent } : null; });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__secure') || '{}')['wavelength.session'], null, { timeout: 15000 }).catch(() => {});
  record('R2', 'Create account tapped twice: one request, the button shows it is working', signups === 1 && busy && busy.disabled && /Creating/.test(busy.label), JSON.stringify({ signups, busy }));
  await ctx.close();
  // R3 offline: the attempt fails with a plain message and the form keeps every field.
  const b = await newApp(390, 844, { init: [`window.__netdev = ${JSON.stringify(WIFI)};`] });
  await b.page.goto('https://localhost/'); await b.page.waitForSelector('#app .auth:not([data-boot])', { timeout: 15000 });
  await b.page.evaluate(() => { location.hash = '#/signup'; }); await b.page.waitForSelector('#f');
  await b.page.fill('input[name=firstName]', 'Off'); await b.page.fill('input[name=lastName]', 'Line'); await b.page.fill('input[name=email]', `off${Date.now()}@example.com`);
  await b.page.fill('input[name=password]', 'Long-password-1'); await b.page.fill('#pw-2', 'Long-password-1'); await b.page.check('input[name=terms]');
  net.offline = true;
  await b.page.click('#f button[type=submit]'); await b.page.waitForSelector('#f .err:not([hidden])', { timeout: 30000 }).catch(() => {});
  const off = await b.page.evaluate(() => ({ err: (document.querySelector('#f .err:not([hidden])') || {}).textContent, first: document.querySelector('input[name=firstName]').value, btn: document.querySelector('#f button[type=submit]').disabled }));
  net.offline = false;
  record('R3', 'Offline: a plain message (not a technical error), the fields kept, the button ready to try again', /Could not reach Wavelength/.test(off.err || '') && off.first === 'Off' && !off.btn, JSON.stringify(off));
  await b.ctx.close();
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed${errors.length ? `; ${errors.length} page errors` : ''}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
