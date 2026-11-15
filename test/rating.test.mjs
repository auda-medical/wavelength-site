// Store ratings (src/app/rating.js, 1.0.29): when the store apps may ask the phone for its official rating prompt,
// and static checks that the app, native.js and both native projects keep to the store rules (official prompt only,
// no question first, nothing in return, nothing on the website). Tested in Node with a stand-in localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SRC = read('src/app/rating.js');
function load() {
  const win = {};
  new Function('window', SRC.replace(/\}\)\(typeof window[^;]*;\s*$/, '})(window);'))(win);
  return win.WLRating;
}
const R = load();
const DAY = 864e5;
const T0 = Date.UTC(2026, 10, 15, 9);
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const clock = (t) => { const c = { t, now: () => c.t }; return c; };
const good = (o = {}) => ({ native: true, moment: 'signed', scans: 3, signoffs: 0, troubleNow: false, ...o });
// An install first used `days` ago, opened again now (a later session).
function later(days, o = {}) {
  const s = store(), c = clock(T0);
  R.create({ storage: s, now: c.now });
  c.t = T0 + days * DAY;
  return { s, c, r: R.create({ storage: s, now: c.now, ...o }) };
}

test('first use: recorded, and never asks in that session', () => {
  const s = store(), c = clock(T0);
  const r = R.create({ storage: s, now: c.now });
  assert.equal(JSON.parse(s.getItem('wl-rate')).first, T0);
  c.t = T0 + 10 * DAY; // even if the app stayed open for days
  assert.deepEqual(r.check(good()), { ok: false, why: 'first-session' });
});

test('at least 3 days since first use of this install', () => {
  assert.equal(later(2.9).r.check(good()).why, 'too-soon');
  assert.deepEqual(later(3).r.check(good()), { ok: true, why: '' });
});

test('at least 3 scans or at least 1 sign-off', () => {
  const { r } = later(5);
  assert.equal(r.check(good({ scans: 2, signoffs: 0 })).why, 'too-little');
  assert.equal(r.check(good({ scans: 0, signoffs: 1 })).ok, true, 'a signed-off scan is enough');
  assert.equal(r.check(good({ scans: 3 })).ok, true);
  // A supervisor's own completed sign-off counts, and is remembered by the install.
  r.signedOff();
  assert.equal(r.check(good({ scans: 0, signoffs: 0, moment: 'supervised' })).ok, true);
});

test('store app only: nothing on the website or the home-screen web app', () => {
  assert.equal(later(10).r.check(good({ native: false })).why, 'web');
});

test('only the three positive moments', () => {
  const { r } = later(10);
  for (const m of ['signed', 'supervised', 'scan']) assert.equal(r.check(good({ moment: m })).ok, true, m);
  assert.equal(r.check(good({ moment: 'start' })).why, 'moment');
  assert.equal(r.check(good({ moment: undefined })).why, 'moment');
  assert.equal(r.scanMilestone(5), true, 'the 5th scan');
  assert.equal(r.scanMilestone(4), false);
  assert.equal(r.scanMilestone(6), false);
});

test('once per session, then not again for 120 days', () => {
  const { s, c, r } = later(10);
  assert.equal(r.check(good()).ok, true);
  r.asked();
  assert.equal(r.check(good()).why, 'this-session');
  c.t += 119 * DAY;
  assert.equal(R.create({ storage: s, now: c.now }).check(good()).why, 'asked-recently');
  c.t += 1 * DAY;
  assert.equal(R.create({ storage: s, now: c.now }).check(good()).ok, true, '120 days after the last ask');
});

test('at most 3 asks in any 365 days', () => {
  // Stored asks closer together than the app itself would make them (an older record, or a clock change).
  const s = store(), c = clock(T0 + 400 * DAY);
  s.setItem('wl-rate', JSON.stringify({ first: T0, asks: [T0 + 230 * DAY, T0 + 240 * DAY, T0 + 250 * DAY], signoffs: 0 }));
  assert.equal(R.create({ storage: s, now: c.now }).check(good()).why, 'year-cap');
  c.t = T0 + 616 * DAY; // the first of the three is now over 365 days old
  assert.equal(R.create({ storage: s, now: c.now }).check(good()).ok, true);
  // The app's own spacing (120 days) allows three in a year and no more.
  assert.ok(R.RULES.gapDays * 3 < 365 && R.RULES.gapDays * 4 > 365);
});

test('never right after an error or a failed save', () => {
  const { c, r } = later(10);
  assert.equal(r.check(good({ troubleNow: true })).why, 'after-error', 'sync failing now');
  r.trouble();
  assert.equal(r.check(good()).why, 'after-error');
  c.t += 14 * 60e3;
  assert.equal(r.check(good()).why, 'after-error');
  c.t += 2 * 60e3;
  assert.equal(r.check(good()).ok, true, 'fine again 15 minutes later');
});

test('an update from an older version counts from the earliest recorded start, not the update', () => {
  const s = store(), c = clock(T0);
  const r = R.create({ storage: s, now: c.now, earliest: T0 - 5 * DAY });
  assert.equal(JSON.parse(s.getItem('wl-rate')).first, T0 - 5 * DAY);
  assert.equal(r.check(good()).ok, true, 'not a first launch: it has been opened before');
  const s2 = store();
  const r2 = R.create({ storage: s2, now: c.now, earliest: T0 - 1 * DAY });
  assert.equal(r2.check(good()).why, 'too-soon', 'opened before, but first used under 3 days ago');
  assert.equal(R.create({ storage: store(), now: c.now, earliest: T0 + DAY }).state().first, T0, 'a future start is ignored');
});

test('the record survives damage and blocked storage', () => {
  const s = store(); s.setItem('wl-rate', '{oops');
  const c = clock(T0);
  assert.equal(R.create({ storage: s, now: c.now }).state().firstSession, true, 'damaged: starts again');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const r = R.create({ storage: blocked, now: c.now });
  assert.doesNotThrow(() => { r.asked(); r.signedOff(); r.trouble(); });
  assert.equal(R.create({ now: c.now }).check(good()).why, 'first-session', 'no storage at all');
});

test('the app asks only through the official prompt, at the right moments, and offers Rate Wavelength', () => {
  const app = read('src/app/app.js'), nat = read('src/app/native.js');
  // The official prompt, from the StoreReview plugin, only in the store apps.
  assert.match(nat, /var Review = on && \(PLATFORM === 'ios' \|\| PLATFORM === 'android'\) \? plugin\('StoreReview'\) : null;/);
  assert.match(nat, /Review\.requestReview\(\)/);
  assert.match(nat, /https:\/\/apps\.apple\.com\/app\/id6822088185\?action=write-review/);
  assert.match(nat, /https:\/\/play\.google\.com\/store\/apps\/details\?id=uk\.co\.thewavelength\.app/);
  assert.match(read('mobile/android/app/build.gradle'), /applicationId "uk\.co\.thewavelength\.app"/);
  assert.match(app, /if \(!NAT\.on \|\| !NAT\.review \|\| !window\.WLRating\) return null;/);
  // The moments.
  assert.match(app, /if \(fresh\.some\(function \(f\) \{ return f\.status === 'confirmed'; \}\)\) rateMoment\('signed'\);/);
  assert.match(app, /if \(news\(\)\.some\(function \(n\) \{ return n\.status === 'confirmed'; \}\)\) rateMoment\('signed'\);/);
  assert.match(app, /RATE\.signedOff\(\); if \(!r2\.skipped\) rateMoment\('supervised'\);/);
  assert.match(app, /if \(!editing && RATE && RATE\.scanMilestone\(nScans\)\) rateMoment\('scan'\);/);
  // Failures hold it back.
  assert.match(app, /saving = false; busy\(btn, false\); rateTrouble\(\);/);
  assert.match(app, /logAttempt\(false, SY\.fail, failWhy\(ex\)\); rateTrouble\(\);/);
  // Never over a sheet or the lock; no question of our own; nothing offered for a rating.
  assert.match(app, /document\.querySelector\('\.sheet-bg'\) \|\| document\.querySelector\('\.app-lock'\) \|\| userBusy\(\)/);
  const fn = app.slice(app.indexOf('  function rateMoment(kind) {'), app.indexOf("  window.addEventListener('wl:open'"));
  assert.doesNotMatch(fn, /sheet\(|toast\(|confirm\(/, 'no dialog of our own before the phone\'s prompt');
  assert.doesNotMatch(app + nat, /(enjoy|like|love) (using )?Wavelength\?|rate us|stars? for/i);
  // Rate Wavelength in Settings, store apps only, next to About.
  assert.match(app, /\(NAT\.openStore \? '<button type="button" class="about-link" data-rate>' \+ esc\(T\('Rate Wavelength'\)\) \+ '<\/button>' : ''\)/);
  assert.match(app, /var rt = \$\('\[data-rate\]'\); if \(rt\) rt\.onclick = function \(\) \{ NAT\.openStore\(\); \};/);
  // Loaded by the app page and kept offline by the website's service worker.
  assert.match(read('src/app/index.html'), /<script src="\/app\/rating\.js\?v=__V__"><\/script>\n<script src="\/app\/native\.js/);
  assert.match(read('src/app/sw.js'), /'\/app\/rating\.js\?v=__V__'/);
});

test('both phones carry the StoreReview plugin, registered as the app\'s own', () => {
  const swift = read('mobile/ios/App/App/StoreReviewPlugin.swift');
  assert.match(swift, /public let jsName = "StoreReview"/);
  assert.match(swift, /AppStore\.requestReview\(in: scene\)/);
  assert.match(swift, /SKStoreReviewController\.requestReview\(in: scene\)/);
  assert.match(swift, /url\.host == "apps\.apple\.com"/);
  assert.match(read('mobile/ios/App/App/WLBridgeViewController.swift'), /bridge\?\.registerPluginInstance\(StoreReviewPlugin\(\)\)/);
  assert.match(read('mobile/ios/App/App/SceneDelegate.swift'), /window\?\.rootViewController = WLBridgeViewController\(\)/);
  // The Swift file is in the Xcode project: file reference, build file, group and Sources phase, IDs used once.
  const pbx = read('mobile/ios/App/App.xcodeproj/project.pbxproj');
  const ref = '5A1C0DE1A0E40000000000D2', build = '5A1C0DE1A0E40000000000D1';
  assert.match(pbx, new RegExp(`\\t\\t${build} /\\* StoreReviewPlugin\\.swift in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref} /\\* StoreReviewPlugin\\.swift \\*/; \\};`));
  assert.match(pbx, new RegExp(`\\t\\t${ref} /\\* StoreReviewPlugin\\.swift \\*/ = \\{isa = PBXFileReference; lastKnownFileType = sourcecode\\.swift; path = StoreReviewPlugin\\.swift; sourceTree = "<group>"; \\};`));
  const section = (name) => pbx.slice(pbx.indexOf(`/* Begin ${name} section */`), pbx.indexOf(`/* End ${name} section */`));
  assert.match(section('PBXGroup'), new RegExp(`${ref} /\\* StoreReviewPlugin\\.swift \\*/,`));
  assert.match(section('PBXSourcesBuildPhase'), new RegExp(`${build} /\\* StoreReviewPlugin\\.swift in Sources \\*/,`));
  assert.equal(pbx.split(ref).length - 1, 3, 'file reference: defined, in the build file, in the group');
  assert.equal(pbx.split(build).length - 1, 2, 'build file: defined, in Sources');
  // Android.
  const java = read('mobile/android/app/src/main/java/uk/co/thewavelength/app/StoreReviewPlugin.java');
  assert.match(java, /@CapacitorPlugin\(name = "StoreReview"\)/);
  assert.match(java, /ReviewManagerFactory\.create\(activity\)/);
  assert.match(java, /"play\.google\.com"\.equals\(uri\.getHost\(\)\)/);
  const main = read('mobile/android/app/src/main/java/uk/co/thewavelength/app/MainActivity.java');
  assert.ok(main.indexOf('registerPlugin(StoreReviewPlugin.class)') > 0 && main.indexOf('registerPlugin(StoreReviewPlugin.class)') < main.indexOf('super.onCreate'), 'registered before the bridge starts');
  assert.match(read('mobile/android/app/build.gradle'), /implementation "com\.google\.android\.play:review:2\.0\.2"/);
  assert.match(read('mobile/android/build.gradle'), /allprojects \{\s*repositories \{\s*google\(\)/, 'Google Maven repository');
  assert.doesNotMatch(read('mobile/package.json'), /review|rating|rate-app/i, 'no npm package for it');
});

// Release checks move with each version (1.0.30 replaced the 1.0.29 one; the 1.0.29 notes stay in STORE.md).
test('release 1.0.30 (37): iPhone project version and store notes', () => {
  const pbx = read('mobile/ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((pbx.match(/MARKETING_VERSION = 1\.0\.30;/g) || []).length, 2);
  assert.equal((pbx.match(/CURRENT_PROJECT_VERSION = 37;/g) || []).length, 2);
  assert.doesNotMatch(pbx, /MARKETING_VERSION = (?!1\.0\.30;)|CURRENT_PROJECT_VERSION = (?!37;)/);
  const md = read('mobile/STORE.md');
  const at = md.indexOf("## Release 1.0.30 (37): what's new");
  assert.ok(at > 0 && at < md.indexOf('## Export compliance (Apple) and encryption'));
  const notes = md.slice(at, md.indexOf('## Export compliance')).trim().split('\n\n').pop();
  assert.ok(notes.length < 500, 'under 500 characters');
  assert.match(notes, /update/);
  assert.doesNotMatch(notes, /premium|department|subscription|price/i, 'no paid features in the store apps');
});
