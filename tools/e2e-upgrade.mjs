// Upgrade from the released 1.0.8 (version code 14) to 1.0.9 without a phone: the stand-in phone first runs the
// logbook bundle taken from the signed 1.0.8 APK, is set up the way the test phone is (signed in, app lock on, two
// supervisors, two trainees, photos, a scan saved offline and not yet synced, dark theme), then runs the new bundle
// on the same storage, as an in-place update does. Checks nothing is lost and nobody has to sign in again.
// Dummy accounts and generated images only.
//
// What this covers: the logbook's own storage (IndexedDB, localStorage, Preferences, the secure token store) carried
// across the bundle change. What it cannot cover: Android's own update (same package and signing key, versionCode
// 14 to 15), which the physical-device checklist covers.
//
// Setup: unzip the 1.0.8 APK's assets/public into a folder (read-only copy), then
//        WL_APP_VERSION=1.0.9 WL_VERSION_CODE=15 node mobile/scripts/build-www.mjs
//        node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-upgrade.mjs <1.0.8 assets/public folder> [results.json] [http://localhost:8787]
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const LOGBOOK = JSON.parse(fs.readFileSync(new URL('../data/logbook.json', import.meta.url), 'utf8'));
const SIG = 'data:image/png;base64,iVBORw0KGgo=';

const OLD = path.resolve(process.argv[2] || '');
const OUT = process.argv[3] || '';
const API = process.argv[4] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-upgrade.mjs');
if (!fs.existsSync(path.join(OLD, 'app/native-config.js'))) { console.error('Give the folder holding the 1.0.8 bundle (assets/public from the APK).'); process.exit(2); }
const oldVersion = (fs.readFileSync(path.join(OLD, 'app/native-config.js'), 'utf8').match(/"version":"([^"]*)"/) || [])[1];
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });

// ---------- Accounts on the server: the phone's account, two supervisors and two trainees ----------
const t = Date.now();
const PW = 'Long-password-1';
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
async function account(tag) {
  const email = `upg-${tag}-${t}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: 'Test', lastName: tag, email, password: PW, terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  const call = (p, body) => fetch(API + p, { method: body ? 'POST' : 'GET', headers: { ...H, Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined }).then((x) => x.json());
  const prof = await call('/api/app/profile', { declaration: true, profile: { pathways: ['rcem'], onboarded: true } });
  return { email, token, call, id: prof.account.id };
}
const A = await account('phone'), S1 = await account('sup1'), S2 = await account('sup2'), T1 = await account('trainee1'), T2 = await account('trainee2');
for (const s of [S1, S2]) { await A.call('/api/app/supervisors/add', { email: s.email }); const inv = (await s.call('/api/app/supervisors')).invites[0]; await s.call('/api/app/supervisors/accept', { id: inv.id }); }
for (const tr of [T1, T2]) { await tr.call('/api/app/supervisors/add', { email: A.email }); }
for (const inv of (await A.call('/api/app/supervisors')).invites || []) await A.call('/api/app/supervisors/accept', { id: inv.id });
const links = await A.call('/api/app/supervisors');
const supCount = (links.supervisors || []).filter((x) => x.status === 'active' || x.accepted || x.acceptedAt || x.accepted_at).length || (links.supervisors || []).length;
record('U0', 'Set-up: the phone account has two supervisors and supervises two trainees', supCount === 2 && (links.learners || []).length === 2, `supervisors ${supCount}, trainees ${(links.learners || []).length}`);

const serverEntries = () => fetch(API + '/__dev/entries').then((r) => r.json()).then((rows) => rows.filter((r) => r.learner_id === A.id && !r.deleted));
const local = (page) => page.evaluate((id) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id);
  r.onsuccess = () => { const db = r.result; const out = {}; const tx = db.transaction(['entries', 'images', 'kv']);
    tx.objectStore('entries').getAll().onsuccess = (e) => { out.entries = e.target.result.map((x) => ({ id: x.id, dirty: !!x._dirty, deleted: !!x.deleted, signoff: x.signoff && x.signoff.code || '' })); };
    tx.objectStore('kv').get('assessments').onsuccess = (e) => { const v = e.target.result; out.assessments = v && Array.isArray(v.v) ? v.v.map((a) => a.code || a.id) : []; };
    tx.objectStore('images').getAll().onsuccess = (e) => { out.images = e.target.result.map((x) => ({ id: x.id, entryId: x.entryId, size: x.blob && x.blob.size })); };
    tx.oncomplete = () => { out.version = db.version; db.close(); ok(out); }; };
  r.onerror = () => ok(null);
}), A.id);
async function saveScan(page, note) {
  await page.evaluate(() => { location.hash = '#/new'; });
  await page.waitForSelector('label[for=t0]');
  await page.click('label[for=t0]');
  await page.waitForSelector('#rest:not([hidden])');
  await page.locator('input[name=supervision]').first().check({ force: true });
  await page.fill('#refl', note);
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => /#\/entry\//.test(location.hash), null, { timeout: 15000 });
  const id = await page.evaluate(() => location.hash.split('/')[2]);
  await page.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((s) => s.remove()));
  // A photo as the camera hand-off leaves it (generated, not a patient image).
  await page.evaluate(([acc, eid]) => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 80; c.height = 60; const g = c.getContext('2d'); g.fillStyle = '#0A1526'; g.fillRect(0, 0, 80, 60); g.fillStyle = '#7FC4CC'; g.fillRect(8, 8, 30, 30);
    c.toBlob((jpg) => { const r = indexedDB.open('wavelength-' + acc); r.onsuccess = () => { const tx = r.result.transaction('images', 'readwrite'); tx.objectStore('images').put({ id: 'img' + eid.slice(0, 9), entryId: eid, blob: jpg, thumb: jpg, w: 80, h: 60, kind: 'image', created: Date.now() }); tx.oncomplete = () => { r.result.close(); ok(); }; }; }, 'image/jpeg', 0.8);
  }), [A.id, id]);
  return id;
}

// ---------- 1.0.8: sign in, set up the phone ----------
serve.dir = OLD;
const { ctx, page } = await newApp(390, 844);
await page.goto('https://localhost/');
await page.waitForFunction(() => document.querySelector('#app') && document.querySelector('#app').children.length, null, { timeout: 15000 });
await page.evaluate(() => { location.hash = '#/login'; });
await page.waitForSelector('#em');
await page.fill('#em', A.email);
await page.fill('#pw', PW);
await page.click('#f button[type=submit]');
await page.waitForSelector('nav.tabs', { timeout: 15000 });
const token108 = await page.evaluate(() => JSON.parse(localStorage.getItem('__secure') || '{}')['wavelength.session'] || '');
const ver108 = await page.evaluate(() => window.WL_NATIVE && window.WL_NATIVE.version);
// Dark theme and app lock on, as a learner sets them in 1.0.8 (Settings stores both on the device).
await page.evaluate(() => { localStorage.setItem('wl-theme', 'dark'); });
await page.evaluate(() => window.Capacitor.Plugins.Preferences ? null : null);
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); p['wl-lock'] = '1'; localStorage.setItem('__prefs', JSON.stringify(p)); });
const synced = await saveScan(page, 'Dummy synced scan before the upgrade');
for (let end = Date.now() + 15000; Date.now() < end && !(await serverEntries()).some((r) => r.id === synced);) await page.waitForTimeout(400);
// A supervisor signs that scan off from their dashboard and records an assessment, then 1.0.8 syncs them in.
const s1link = ((await A.call('/api/app/supervisors')).supervisors || []).find((x) => x.email === S1.email);
const req = await A.call('/api/app/signoff/request', { entryIds: [synced], supervisorLink: s1link && s1link.id });
const so = await S1.call('/api/app/supervise/signoff', { code: req.code, name: 'Dr Dummy One', role: 'Consultant', confirm: true, signature: SIG, decisions: { [synced]: 'confirmed' } });
const pw = LOGBOOK.pathways.find((x) => x.modules && x.modules.length);
const as = await S1.call('/api/app/supervise/assessment/new', { learnerId: A.id, pathway: pw.id, module: pw.modules[0].id, kind: LOGBOOK.assessmentKinds[0].id, name: 'Dr Dummy One', role: 'Consultant', confirm: true, signature: SIG, outcome: 'competent', domains: { [LOGBOOK.assessmentDomains[0].id]: LOGBOOK.assessmentScale[0] } });
await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: true }));
for (let end = Date.now() + 15000; Date.now() < end;) { const l = await local(page); if (l.entries.some((e) => e.id === synced && e.signoff) && l.assessments.length) break; await page.waitForTimeout(500); }
net.offline = true;
const pending = await saveScan(page, 'Dummy scan saved offline in 1.0.8');
await page.waitForTimeout(1500);
const before = await local(page);
const prefsBefore = await page.evaluate(() => ({ prefs: localStorage.getItem('__prefs'), theme: localStorage.getItem('wl-theme'), acc: !!localStorage.getItem('wl-acc'), lang: localStorage.getItem('wl-lang') }));
record('U1', 'In ' + ver108 + ': signed in, a signed-off scan, an assessment, a scan saved offline and waiting, two photos', ver108 === oldVersion && token108 && (await serverEntries()).some((r) => r.id === synced) && before.entries.find((e) => e.id === pending && e.dirty) && before.images.length === 2 && before.entries.find((e) => e.id === synced && e.signoff === so.code) && before.assessments.includes(as.code),
  `version ${ver108}, entries ${before.entries.length} (waiting ${before.entries.filter((e) => e.dirty).length}), photos ${before.images.length}, sign-off ${so.code}, assessment ${as.code}, database v${before.version}`);

// ---------- The update: same storage, new bundle, first start with no network ----------
await page.goto('about:blank');
serve.dir = WWW;
await page.evaluate(() => { window.__calls = []; }).catch(() => {});
const t0 = Date.now();
await page.goto('https://localhost/');
const prompt = await page.waitForFunction(() => (window.__calls || []).some((c) => c.plugin === 'NativeBiometric' && c.method === 'verifyIdentity'), null, { timeout: 8000 }).then(() => Date.now() - t0, () => -1);
await page.waitForSelector('nav.tabs', { timeout: 15000 });
const ver109 = await page.evaluate(() => window.WL_NATIVE && window.WL_NATIVE.version);
const verify = await page.evaluate(() => ((window.__calls || []).find((c) => c.method === 'verifyIdentity') || {}).options || null);
record('U2', 'First start of 1.0.9 offline: app lock still on, asks with the phone prompt, then opens the logbook', ver109 === '1.0.9' && prompt >= 0 && prompt < 3000 && verify && JSON.stringify(verify.allowedBiometryTypes) === '[3,7]',
  `version ${ver109}, prompt after ${prompt} ms, allowed ${verify && JSON.stringify(verify.allowedBiometryTypes)}`);
const login = await page.evaluate(() => ({ auth: !!document.querySelector('#app .auth, #em'), token: JSON.parse(localStorage.getItem('__secure') || '{}')['wavelength.session'] || '' }));
record('U3', 'Still signed in with the same login: no sign-in screen, token unchanged in secure storage', !login.auth && login.token === token108, `sign-in screen ${login.auth}, same token ${login.token === token108}`);
const after = await local(page);
const kept = before.entries.every((b) => after.entries.some((a) => a.id === b.id)) && before.images.every((b) => after.images.some((a) => a.id === b.id && a.size === b.size));
record('U4', 'Every entry, photo, sign-off and assessment is still on the device, and the offline scan is still waiting', kept && after.entries.find((e) => e.id === pending && e.dirty) && after.version === before.version && after.entries.find((e) => e.id === synced && e.signoff === so.code) && after.assessments.includes(as.code),
  `entries ${after.entries.length}/${before.entries.length}, photos ${after.images.length}/${before.images.length}, sign-off kept ${!!after.entries.find((e) => e.id === synced && e.signoff === so.code)}, assessments ${after.assessments.length}, database v${after.version}`);
const prefsAfter = await page.evaluate(() => ({ prefs: localStorage.getItem('__prefs'), theme: localStorage.getItem('wl-theme'), acc: !!localStorage.getItem('wl-acc'), lang: localStorage.getItem('wl-lang'), dark: document.documentElement.dataset.theme }));
record('U5', 'Preferences kept: dark theme, app lock setting, cached account', prefsAfter.theme === 'dark' && prefsAfter.dark === 'dark' && prefsAfter.prefs === prefsBefore.prefs && prefsAfter.acc, JSON.stringify(prefsAfter));
const st = await page.evaluate(() => (document.querySelector('.sync-ind') || {}).getAttribute && document.querySelector('.sync-ind').getAttribute('aria-label'));
record('U6', 'Offline status says the scan is saved on this device', /saved on this device/i.test(st || ''), st);

// ---------- Network back ----------
net.offline = false;
await page.evaluate(() => window.dispatchEvent(new Event('online')));
let up = false;
for (let end = Date.now() + 30000; Date.now() < end && !(up = (await serverEntries()).some((r) => r.id === pending));) await page.waitForTimeout(500);
for (let end = Date.now() + 5000; Date.now() < end && (await local(page)).entries.some((e) => e.dirty);) await page.waitForTimeout(300);
const final = await local(page);
const rows = await serverEntries();
record('U7', 'Back online: the scan saved in 1.0.8 reaches the server once, and nothing is left waiting', up && rows.filter((r) => r.id === pending).length === 1 && !final.entries.some((e) => e.dirty) && rows.length === 2, `server copies ${rows.length}, waiting on device ${final.entries.filter((e) => e.dirty).length}`);
await page.evaluate(() => { location.hash = '#/supervisors'; });
await page.waitForTimeout(1500);
const supText = await page.evaluate(() => document.querySelector('#app').innerText);
if (process.env.DEBUG) console.log(supText);
await page.evaluate(() => { location.hash = '#/supervise'; });
await page.waitForTimeout(1500);
const trText = await page.evaluate(() => document.querySelector('#app').innerText);
record('U8', 'Both supervisors and both trainees are still linked and shown', [S1, S2].every((s) => supText.includes(s.email) || supText.includes(s.email.split('@')[0]) || supText.includes('sup' + (s === S1 ? '1' : '2'))) && [T1, T2].every((x) => trText.includes(x === T1 ? 'trainee1' : 'trainee2')),
  'supervisors page mentions ' + [S1, S2].filter((s) => supText.includes(s.email)).length + ' emails; trainees page mentions ' + ['trainee1', 'trainee2'].filter((x) => trText.includes(x)).length);
await page.evaluate(() => { location.hash = '#/me'; });
await page.waitForSelector('.about-foot [data-appver]');
await page.waitForTimeout(400);
const foot = await page.evaluate(() => document.querySelector('.about-foot [data-appver]').textContent);
record('U9', 'Me shows Version 1.0.9 (15)', foot === 'Version 1.0.9 (15)', foot);
await ctx.close();

// ---------- A second signed-in session (another phone) sees the scan that was saved offline ----------
{
  const lg = await fetch(API + '/api/app/login', { method: 'POST', headers: H, body: JSON.stringify({ email: A.email, password: PW }) });
  const tok2 = lg.headers.get('X-Wavelength-Token');
  const B = await newApp(390, 844);
  await B.page.goto('https://localhost/');
  await B.page.evaluate((tok) => localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })), tok2);
  await B.page.goto('https://localhost/');
  await B.page.waitForSelector('nav.tabs', { timeout: 15000 });
  let seen = null;
  for (let end = Date.now() + 15000; Date.now() < end && !(seen = (await local(B.page)).entries.find((e) => e.id === pending));) await B.page.waitForTimeout(500);
  await B.page.evaluate((id) => { location.hash = '#/entry/' + id; }, pending);
  await B.page.waitForTimeout(800);
  const shown = await B.page.evaluate(() => document.querySelector('#app').innerText);
  record('U11', 'A second signed-in session on another device shows the scan saved offline in 1.0.8', !!seen && tok2 && tok2 !== token108 && /Dummy scan saved offline in 1\.0\.8/.test(shown), `found ${!!seen}, separate login ${tok2 !== token108}`);
  await B.ctx.close();
}
await browser.close();
const bad = errors.filter((e) => !/internetdisconnected|Failed to fetch|ERR_INTERNET_DISCONNECTED/i.test(e));
record('U10', 'No page errors in either version', !bad.length, bad.slice(0, 3).join(' | ') || 'none');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ run: new Date().toISOString(), from: oldVersion, results }, null, 2) + '\n');
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? failed + ' checks failed.' : 'All upgrade checks passed.');
process.exit(failed ? 1 : 0);
