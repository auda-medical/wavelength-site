// 19 Nov 2026: a learner removed the home screen copy of Wavelength, installed the App Store app and lost the clips of a
// scan that was then signed off. The written record and the sign-off synced; photos and clips never leave the device,
// and the copies shared for sign-off are deleted once it is signed. The web copy on a phone now warns before the move,
// and a scan whose photos are elsewhere says so and points to Back up and restore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const APP = read('src/app/app.js');
const LANGS = ['ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'ru', 'zh'];
const NEW = [
  'Moving to the Wavelength app?',
  'Your photos and clips are saved only in this copy of Wavelength. Removing it from your home screen deletes them, and Wavelength cannot bring them back. Make a backup file first, then restore it in the new app.',
  'Get it on Google Play',
  'Get it on the App Store',
  'Some photos or clips of this scan are not on this device. They stay on the phone or app copy where they were added, and Wavelength cannot bring them back. If you made a backup file there, restore it here.',
];

test('the web copy on a phone warns before moving to the store app, and never shows inside the store apps', () => {
  const fn = APP.slice(APP.indexOf('function movingNudge()'), APP.indexOf('function backupNudge()'));
  assert.match(fn, /if \(NAT\.on \|\|/, 'not in the App Store or Google Play app');
  assert.match(fn, /iphone\|ipad\|ipod\|android/, 'phones and tablets only');
  assert.match(fn, /href="#\/backup"/);
  assert.match(fn, /apps\.apple\.com\/app\/id6822088185/);
  assert.match(fn, /play\.google\.com\/store\/apps\/details\?id=uk\.co\.thewavelength\.app/);
  const nudge = APP.slice(APP.indexOf('function backupNudge()'), APP.indexOf('// ---------- Logbook list'));
  assert.ok(nudge.indexOf('movingNudge()') > nudge.indexOf('if (!withImg) return'), 'only when photos or clips are on this copy');
});

test('a scan with photos on another device explains it once and links to Back up and restore', () => {
  assert.match(APP, /id="gal-away" hidden>/);
  assert.match(APP, /var ga = \$\('#gal-away'\); if \(ga\) ga\.hidden = false;/);
});

test('every new line is translated in all nine languages', () => {
  for (const l of LANGS) {
    const j = JSON.parse(read('src/app/i18n/' + l + '.json'));
    for (const k of NEW) assert.ok(typeof j[k] === 'string' && j[k].trim() && j[k] !== k, l + ': ' + k.slice(0, 40));
    assert.match(j._meta.review, /19 November 2026 strings/, l);
  }
});
