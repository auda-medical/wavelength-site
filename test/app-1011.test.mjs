// 1.0.11 rules in the app source that the browser checks (tools/e2e-1011.mjs) cover end to end, kept here so a
// change that breaks them fails `npm test` without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/app.css', import.meta.url), 'utf8');
const slice = (from, to) => APP.slice(APP.indexOf(from), APP.indexOf(to, APP.indexOf(from)));

test('retries never stop and pause while the app is in the background', () => {
  const sched = slice('  function scheduleRetry() {', '  // Back in the app');
  assert.match(sched, /if \(SY\.paused\) \{ SY\.due = true; return; \}/, 'a retry due while paused is remembered, not dropped');
  assert.match(APP, /window\.addEventListener\('wl:pause', pauseRetries\);/);
  const rs = slice('  function resumeSync(away) {', "  // The phone's network changed");
  assert.match(rs, /SY\.paused = false;/, 'returning always clears the pause');
  assert.match(rs, /else if \(SY\.due \|\| SY\.fail \|\| pendingList\(\)\.length\) \{ SY\.due = false; scheduleRetry\(\); \}/, 'a return that does not retry at once still schedules the next try');
  assert.doesNotMatch(APP, /tries\s*>=?\s*\d+\)\s*return/, 'no fixed retry limit');
});

test('the photo editor offers both flips with full spoken names, and the declaration stays mandatory', () => {
  const fr = slice('  function editorFrame(', '  // Shared by both editors');
  for (const k of ['crop', 'cover', 'trim', 'rotate', 'fliph', 'flipv']) assert.match(fr, new RegExp("tool\\('" + k + "'"));
  assert.match(fr, /T\('Flip horizontally'\)/);
  assert.match(fr, /T\('Flip vertically'\)/);
  assert.match(fr, /data-a="save" disabled/, 'Use this image starts disabled');
  assert.match(APP, /decl\.addEventListener\('change', function \(\) \{ save\.disabled = !decl\.checked; \}\);/);
  assert.match(fr, /\$\$\('\.toast'\)\.forEach\(function \(t\) \{ t\.remove\(\); \}\);/, 'no note may cover the declaration');
  assert.match(CSS, /\.editor \{ z-index: 80; \}/);
});

test('editors keep media on the phone: no network call, nothing stored until the scan is saved', () => {
  const ed = slice('  // ---------- Image and clip editors (1.0.11)', '  // ---------- Entry detail');
  assert.doesNotMatch(ed, /api\(|NAT\.net\(|fetch\(|put\('images'/);
  // A failed clip resolves nothing: the editor stays open with an error.
  assert.match(ed, /Nothing is kept from a failed or stopped preparation/);
  assert.match(ed, /rec\.onerror = function \(\) \{ aborted = true;/);
});

test('one drawing function makes the clip preview and every recorded frame', () => {
  const ed = slice('  function editClip(file) {', '  // ---------- Entry detail');
  assert.match(ed, /var paint = function \(\) \{[^\n]*frame\(g, 1\); \};/);
  assert.match(ed, /frame\(og, k\);/);
  assert.match(ed, /var CLIP_MAX = 10|CLIP_MAX/);
  assert.match(APP, /var CLIP_MAX = 10, CLIP_MIN = 1;/);
});

test('the Android back button cancels an open editor before anything else', () => {
  const back = slice("  window.addEventListener('wl:back'", '  var LOCK_AFTER');
  assert.ok(back.indexOf(".editor [data-a=cancel]") > 0 && back.indexOf('.editor [data-a=cancel]') < back.indexOf('.sheet-bg'));
});

test('About Wavelength appears once, in Settings', () => {
  const me = slice('  function viewMe(r) {', '  // ---------- Sync panel');
  const set = slice('  function viewSettings() {', '  // ---------- About Wavelength');
  assert.doesNotMatch(me, /aboutFooter\(\)/);
  assert.match(set, /aboutFooter\(\)/);
});

test('the scan form keeps its field names (presentation-only redesign)', () => {
  const form = slice('  function viewEdit(r) {', '  // A SHA-256 of each image');
  for (const n of ['type', 'date', 'setting', 'age', 'sex', 'indication', 'overall', 'quality', 'interpretation', 'confirmation', 'concordant', 'impact', 'supervision', 'supervisor', 'noSignoff', 'reflection', 'count']) assert.match(form, new RegExp('name="' + n + '"|name=\\\\"' + n + '|seg\\(\'' + n + "'"), n);
  assert.match(form, /\['type', 'date', 'setting', 'age', 'sex', 'indication', 'overall', 'quality', 'interpretation', 'confirmation', 'concordant', 'impact', 'supervision', 'supervisor', 'reflection'\]\.forEach/);
});

test('every app string has a translation in all eight languages (machine-drafted ones marked for review)', () => {
  execFileSync(process.execPath, ['tools/i18n-extract.mjs'], { cwd: new URL('..', import.meta.url) });
  const S = JSON.parse(readFileSync(new URL('../tools/i18n/strings.json', import.meta.url), 'utf8'));
  const dir = new URL('../src/app/i18n/', import.meta.url);
  const langs = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.equal(langs.length, 8);
  for (const f of langs) {
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const miss = S.strings.filter((k) => !(k in d)).concat(Object.keys(S.plurals).filter((k) => !(k in d)));
    assert.deepEqual(miss, [], f + ' is missing ' + miss.slice(0, 5).join(' | '));
    assert.match(d._meta.review || '', /Machine-drafted.*native speaker/, f);
    for (const k of S.strings) {
      const t = d[k]; if (typeof t !== 'string') continue;
      assert.deepEqual((t.match(/\{\w+\}/g) || []).sort(), (k.match(/\{\w+\}/g) || []).sort(), f + ': placeholders differ for ' + k);
    }
  }
});

// Independent review fixes (1.0.11).
test('review: the photo saved is the one shown when Save was pressed (tools locked while encoding)', () => {
  const ed = slice('  function editImage(file) {', '  // ---------- Clip editor');
  assert.match(ed, /var fin = work, fo = orient;/);
  assert.match(ed, /if \(saving\) return;/);
  assert.doesNotMatch(ed.slice(ed.indexOf("if (act === 'save')")), /drawImage\(work,/, 'encoding never reads the live canvas');
});
test('review: a successful sync overrides a "nothing under the VPN" reading', () => {
  assert.match(APP, /if \(!SY\.fail && S\.net && NETR\.vpnOnly\(S\.net\)\) S\.net = Object\.assign\(\{\}, S\.net, \{ underlying: null \}\);/);
});
test('review: an error joins, and never replaces, a control\'s existing description', () => {
  const mf = slice('  function markField(fl, msg) {', '  // The note after saving');
  assert.match(mf, /ds\.unshift\(id\)/);
  assert.doesNotMatch(mf, /c\.setAttribute\('aria-describedby', id\)/);
});
test('review: a clip recorder is released on every path and an empty clip is refused', () => {
  const ed = slice('  function editClip(file) {', '  // ---------- Entry detail');
  assert.match(ed, /busyRec = null; release\(\);/);
  assert.match(ed, /busyRec = null; chunks = \[\]; release\(\);/);
  assert.match(ed, /if \(got < 0\.5\)/);
  assert.match(ed, /if \(busyRec\) \{ picker\.clear\(\); return; \}/, 'no covers drawn mid-recording');
});
test('review: the Android plugin seeds the networks under a VPN before it reports anything', () => {
  const plug = readFileSync(new URL('../mobile/android/app/src/main/java/uk/co/thewavelength/app/NetworkPlugin.java', import.meta.url), 'utf8');
  const i = plug.indexOf('seedUnder();'), j = plug.indexOf('registerNetworkCallback(req, underCallback)'), k = plug.indexOf('registerDefaultNetworkCallback(callback)');
  assert.ok(i > 0 && i < j && j < k, 'seed, then listen underneath, then listen to the default network');
});
