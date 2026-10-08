// About Wavelength (src/app/app.js aboutSheet, src/app/licences.js): the licence list covers everything the app
// ships, the version never sits in the source, and every new string is translated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const win = {};
new Function('window', read('src/app/licences.js'))(win);
const L = win.WL_LICENCES;
const listed = L.components.map((c) => c.name).join('\n');

test('every runtime dependency of the store app is in the open-source licences', () => {
  const deps = Object.keys(JSON.parse(read('mobile/package.json')).dependencies);
  // Capacitor's core, Android and iOS packages share one entry.
  const missing = deps.filter((d) => !(/^@capacitor\/(core|android|ios)$/.test(d) ? /^Capacitor \(core, Android, iOS\)/m.test(listed) : listed.includes(d)));
  assert.deepEqual(missing, [], 'add these to src/app/licences.js');
  const pkg = (d) => JSON.parse(read('mobile/node_modules/' + d + '/package.json'));
  for (const d of deps) {
    let p; try { p = pkg(d); } catch { continue; } // node_modules not installed: the name check above still runs
    const c = L.components.find((x) => x.name.includes(d) || (/^@capacitor\/(core|android|ios)$/.test(d) && x.name.startsWith('Capacitor')));
    assert.equal(c.licence, p.license, d + ' licence');
    assert.equal(c.version, p.version, d + ' version');
  }
});

test('every bundled vendor library and font is in the open-source licences', () => {
  const vendor = { 'jspdf.umd.min.js': 'jsPDF', 'jspdf.plugin.autotable.min.js': 'jsPDF-AutoTable', 'qrcode.js': 'QR Code Generator', 'noble-hashes': '@noble/hashes', 'LICENSES.txt': null };
  for (const f of readdirSync(new URL('../src/app/vendor/', import.meta.url))) {
    assert.ok(f in vendor, 'new vendor file ' + f + ': add it to src/app/licences.js and to this test');
    if (vendor[f]) assert.ok(listed.includes(vendor[f]), f);
  }
  for (const m of read('src/app/app.css').matchAll(/fonts\/([a-z-]+?)-latin/g)) {
    const name = m[1] === 'dm-sans' ? 'DM Sans' : m[1] === 'cormorant-garamond' ? 'Cormorant Garamond' : m[1];
    assert.ok(listed.includes(name), 'font ' + name);
  }
  for (const c of L.components) assert.ok(L.texts[c.licence] && L.texts[c.licence].length > 900, 'full text for ' + c.licence);
  assert.match(L.components.find((c) => c.licence === 'MPL-2.0').note, /https:\/\/github\.com\/Cap-go\/capacitor-native-biometric/, 'MPL needs the source link');
});

test('the version and build are never written into the app source', () => {
  for (const f of ['app.js', 'native.js', 'licences.js', 'index.html']) assert.doesNotMatch(read('src/app/' + f), /['"]1\.0\.\d+['"]|Version 1\.0/, f);
  assert.match(read('src/app/native.js'), /App\.getInfo\(\)/);
  assert.match(read('mobile/scripts/build-www.mjs'), /WL_VERSION_CODE/);
});

test('About strings are translated in all eight languages', () => {
  const keys = ['About Wavelength', 'Version {version} ({build})', 'Contact support', 'Privacy policy', 'Terms of use', 'Open-source licences', 'Developer', 'Website', 'Build', 'Web app'];
  for (const lang of ['fr', 'es', 'de', 'it', 'pl', 'ru', 'ar', 'zh']) {
    const d = JSON.parse(read('src/app/i18n/' + lang + '.json'));
    for (const k of keys) assert.ok(d[k], lang + ': ' + k);
    assert.ok(d['Version {version} ({build})'].includes('{version}') && d['Version {version} ({build})'].includes('{build}'), lang + ' placeholders');
  }
});

test('the support email carries no account details', () => {
  const src = read('src/app/app.js');
  const fn = src.slice(src.indexOf('function aboutSheet()'), src.indexOf('function loadLicences()'));
  assert.doesNotMatch(fn.split('var mail')[0], /S\.account|email|profile\(/, 'only version, platform and language go in the body');
});
