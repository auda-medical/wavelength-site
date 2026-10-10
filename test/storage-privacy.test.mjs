// 1.0.14 data-protection review: where unredacted photos and clips can be, and what can copy them off the phone.
// Static checks of the Android project and the app, so a later change cannot quietly undo them. The behaviour itself is
// proved on an emulator by tools/e2e-1014-emulator.mjs (camera, backup and device-transfer, kill and recovery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const MAIN = 'mobile/android/app/src/main/';
const manifest = read(MAIN + 'AndroidManifest.xml');
const rules = read(MAIN + 'res/xml/data_extraction_rules.xml');
const paths = read(MAIN + 'res/xml/file_paths.xml');
const activity = read(MAIN + 'java/uk/co/thewavelength/app/MainActivity.java');
const chrome = read(MAIN + 'java/uk/co/thewavelength/app/WLChromeClient.java');
const capture = read(MAIN + 'java/uk/co/thewavelength/app/CapturePlugin.java');
const app = read('src/app/app.js');
const patch = read('mobile/scripts/patch-native.py');

test('no Google backup (Android 11 and below) and the extraction rules are in force (12 and above)', () => {
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:fullBackupContent="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  // patch-native.py puts them back after `npx cap add`.
  assert.match(patch, /allowBackup="false"/);
  assert.match(patch, /dataExtractionRules/);
});

test('cloud backup and device-to-device transfer exclude every storage domain', () => {
  // allowBackup="false" does not stop device-to-device transfer on Android 12+ (seen on the emulator): these rules do.
  const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
  for (const section of ['cloud-backup', 'device-transfer']) {
    const m = rules.match(new RegExp(`<${section}[^>]*>([\\s\\S]*?)</${section}>`));
    assert.ok(m, section + ' section present');
    for (const d of domains) assert.match(m[1], new RegExp(`<exclude domain="${d}" path="\\." />`), `${section} excludes ${d}`);
    assert.doesNotMatch(m[1], /<include/, section + ' includes nothing');
  }
});

test('camera captures go to private storage through Wavelength\'s own chooser', () => {
  assert.match(activity, /registerPlugin\(CapturePlugin\.class\)/);
  assert.match(activity, /setWebChromeClient\(new WLChromeClient\(bridge\)\)/);
  // Both photo and clip get an output file in files/wl-captures (a clip without one is saved in the gallery).
  assert.match(chrome, /ACTION_VIDEO_CAPTURE : MediaStore\.ACTION_IMAGE_CAPTURE/);
  assert.match(chrome, /putExtra\(MediaStore\.EXTRA_OUTPUT, u\)/);
  assert.match(capture, /new File\(c\.getFilesDir\(\), DIR\)/);
  assert.match(capture, /DIR = "wl-captures"/);
  assert.match(paths, /<files-path name="wl_captures" path="wl-captures\/" \/>/);
  // Only Wavelength's own file names, never a path, can be listed or removed.
  assert.match(capture, /name\.contains\("\/"\) \|\| name\.contains\("\\\\"\) \|\| name\.contains\("\.\."\)/);
});

test('the app removes a capture only after its own copy is kept, and never deletes kept work by itself', () => {
  assert.match(app, /var started = DRAFT\.start\(m\); if \(file\._wlCopy\) started\.then\(function \(\) \{ NAT\.captureRemove\(\[file\._wlCopy\]\); \}/);
  // Captures left behind come back as kept items; leftovers from earlier versions are removed only on request.
  assert.match(app, /\.then\(function \(\) \{ return NAT\.captureRemove\(\[f\.name\], legacy\)/);
  assert.match(app, /data-lgdel[\s\S]{0,400}NAT\.captureRemove\(list\.map/);
  // No timer or age limit deletes drafts.
  assert.doesNotMatch(app, /dropFormDraft\([^)]*\)[^;]*864e5|864e5[^;]*DRAFT\.drop/);
});

test('the drafts counter and the sign-out counter are separate variables', () => {
  // 1.0.14 before this review: `var SESSION = uid()` in the drafts module overwrote the sign-out counter, so after
  // logging out and in again without a restart every sync answer was dropped.
  assert.equal((app.match(/var SESSION\b/g) || []).length, 1);
  assert.match(app, /var RUN = uid\(\);/);
  assert.doesNotMatch(app, /session: SESSION/);
});

test('drafts are per account, and the typed form saves under the id it started with', () => {
  assert.match(app, /return 'wavelength-' \+ S\.account\.id \+ '-drafts'/);
  assert.match(app, /if \(db\) \{ db\.close\(\); db = null; \} \/\/ another account's drafts/);
  assert.match(app, /\{ id: newId, createdAt: Date\.now\(\) \}/);
  // An edit kept from an older version of the scan is never applied.
  assert.match(app, /fresh = !editing \|\| d\.base === baseStamp/);
});
