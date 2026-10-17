// 1.0.18 fixes from the iPhone XS device checks of 13 and 14 October 2026 (ios-1.0.17\DEVICE-CHECK-NOTES.md in HQ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/app/editor.js';

const E = globalThis.WLEditor;
const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/app.css', import.meta.url), 'utf8');

// A canvas stand-in whose text is 0.55 of the font height per character, like DM Sans 600.
const ctx = () => { let px = 10; return { set font(f) { px = Number(/(\d+)px/.exec(f)[1]); }, get font() { return px + 'px'; }, measureText: (s) => ({ width: s.length * 0.55 * px }) }; };

test('a larger Size never gives a smaller label: the label grows, then holds at the widest that fits', () => {
  const W = 1000, H = 800, c = ctx();
  let last = 0, capped = 0;
  for (let p = 0; p <= 100; p++) {
    const fs = E.textSize(c, { type: 'text', text: 'Pericardial effusion', size: E.sizeAt('text', p) }, W, H);
    assert.ok(fs >= last - 1, `position ${p}: ${fs} after ${last}`); // Math.round in the font string allows 1 px
    if (fs < E.sizeAt('text', p) * Math.min(W, H) - 1) capped++;
    last = fs;
  }
  assert.ok(capped > 0, 'the long label reaches the width cap at the top of the slider');
  const top = E.textSize(c, { type: 'text', text: 'Pericardial effusion', size: E.sizeAt('text', 100) }, W, H);
  const width = 'Pericardial effusion'.length * 0.55 * Math.round(top) + top * 0.8;
  assert.ok(width <= W * 0.96 + 12, 'and still fits inside the picture: ' + width);
});

test('short labels are never capped', () => {
  const c = ctx();
  const a = { type: 'text', text: 'IVC', size: E.sizeAt('text', 60) };
  assert.equal(E.textSize(c, a, 1000, 800), a.size * 800);
});

test('Straight shows a green tick beside the word, not only the haptic', () => {
  assert.match(APP, /n === 0 \? '<span class="rot-ok" aria-hidden="true">✓<\/span> '/);
  assert.match(CSS, /\.ed-rotval \.rot-ok \{ color: #62C79A;/);
  assert.match(APP, /rotIn\.setAttribute\('aria-valuetext', rotWords\(n\)\)/, 'screen readers still hear just the word');
});

test('a sync that ends while a sheet is open redraws the screen when the sheet closes', () => {
  assert.match(APP, /S\.syncRedraw = true; redrawSynced\(\);/);
  assert.match(APP, /function redrawSynced\(\) \{\n    if \(!S\.syncRedraw/);
  assert.match(APP, /setTimeout\(redrawSynced, 0\); \/\/ after any sheet opened in its place/);
  assert.match(APP, /S\.syncRedraw = false; \/\/ this draw shows whatever the last sync brought/);
});

test('an open guide asks for its source status again when the connection returns', () => {
  assert.match(APP, /window\.dispatchEvent\(new CustomEvent\('wl:synced'\)\)/);
  assert.match(APP, /window\.addEventListener\('online', again\); window\.addEventListener\('wl:synced', again\);/);
  assert.match(APP, /var again = function \(\) \{ window\.removeEventListener\('online', again\); window\.removeEventListener\('wl:synced', again\); if \(here\(\)\) ask\(\); \};/, 'once, and only while that guide is still open');
});

test('the Kept on this phone card is drawn at once from the last one, inert, and forgotten on any account change', () => {
  assert.match(APP, /ghost\.setAttribute\('data-keptghost', ''\); ghost\.inert = true;/);
  assert.match(APP, /if \(g\) main\.replaceChild\(card, g\); else keptPlace\(main, card\);/);
  assert.match(APP, /function signedIn\(acc\) \{\n    keptLast = null;/);
  assert.match(APP, /function signedOut\(to\) \{ SESSION\+\+; keptLast = null;/);
});

test('one failed attempt in the first 20 s after start or sign-in shows no warning while the retry runs', () => {
  assert.match(APP, /if \(bst === 'unreachable' && SY\.tries <= 1 && grace > 0 && !SY\.userWaiting\) \{/);
  assert.match(APP, /SYNC_GRACE_FROM = Date\.now\(\);\n    S\.account = acc;/);
  assert.match(APP, /clearTimeout\(SY\.graceTimer\); SY = \{ lastOk/);
});
