// 1.0.16 (owner's Fold7 finding, ChatGPT 12 Oct 10:48 and 10:51): photos left by earlier versions are recovered one
// by one. These pin the rules in the source; tools/e2e-1016.mjs and tools/e2e-1016-emulator.mjs prove the behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/app.css', import.meta.url), 'utf8');
const slice = (from, to) => { const a = APP.indexOf(from); const b = APP.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, 'section ' + from); return APP.slice(a, b); };

test('no bulk recovery is left: no "Add to this scan" for a group, no "Added to this scan" claim', () => {
  assert.ok(!/data-addearlier|data-dropearlier/.test(APP));
  assert.ok(!/T\('Add to this scan'\)/.test(APP));
  assert.ok(!/Added to this scan/.test(APP));
});

test('the recovery tray starts with nothing selected and acts only on what is selected', () => {
  const html = slice('  function trayHtml(items, mode) {', '  // opts: { mode:');
  assert.ok(!/checked/.test(html), 'no row is rendered ticked');
  assert.match(html, /data-tradd disabled/); assert.match(html, /data-trdrop disabled/);
  const bind = slice('  function bindTray(root, items, opts) {', '  // One kept photo or clip, full screen');
  assert.match(bind, /c\.checked = false/);
  assert.match(bind, /var c = chosen\(\); if \(c\.length\) opts\.add\(c\)/);
  assert.match(bind, /var c = chosen\(\); if \(c\.length\) discardKept\(c,/);
  assert.match(bind, /deleteAllKept\(items,/);
});

test('discarding asks; deleting everything needs its own tick', () => {
  const d = slice('  function discardKept(list, after, cancelled) {', '  // Deleting every kept photo');
  assert.match(d, /This cannot be undone\./); assert.match(d, /data-gone/);
  const all = slice('  function deleteAllKept(list, after, cancelled) {', '  // #\/kept');
  assert.match(all, /data-allgo disabled/); assert.match(all, /if \(!\$\('\[data-allok\]', root\)\.checked\) return;/);
});

test('kept items belong to one scan form or none; the tray is everything that belongs to no open or kept form', () => {
  assert.match(APP, /tray: function \(exceptInst\)/);
  assert.match(APP, /!\(m\.inst && \(m\.inst === exceptInst \|\| live\[m\.inst\]\)\)/);
  assert.match(APP, /formKey: 'tray', inst: null, legacy: !!legacy/, 'leftovers are imported into the tray');
  const form = slice('    function loadKept() {', '    // Above the form:');
  assert.match(form, /x\.media\.inst && x\.media\.inst === inst/, 'a form shows only its own kept items');
});

test('a chosen photo is not called added until it is finished; Save says unfinished ones will not be saved', () => {
  const a = slice('    function assignToForm(c) {', '    // An Unfinished tile');
  assert.match(a, /not part of it yet: finish each one to add it\./);
  assert.match(a, /12 - count\(\) - kept\.length/, 'never more than a scan holds');
  const s = slice("      if (kept.length && !keptAsked) {", '      var err = $');
  assert.match(s, /they will not be saved in this scan\./); assert.match(s, /Finish them now/); assert.match(s, /Save, and keep them for later/); assert.match(s, /Go back/);
});

test('a saved scan drops exactly what it saved; unfinished go back to the tray; Discard changes never deletes tray photos', () => {
  assert.match(APP, /savedIds\.forEach\(function \(id\) \{ DRAFT\.drop\(id\); \}\);/);
  assert.match(APP, /unfinished\.forEach\(function \(x\) \{ DRAFT\.release\(x\); \}\);/);
  assert.ok(!/DRAFT\.dropForm\(/.test(APP), 'no bulk drop by form key');
  assert.match(APP, /return x\.media\.fromTray \? api\.release\(x\) : x\.state\.stage === 'ready' \? api\.drop\(x\.media\.id\) : null;/);
});

test('a leftover file is removed only once the app holds a whole copy', () => {
  const imp = slice('  function importCaptures(list, legacy) {', '  function refreshKeptCard()');
  assert.match(imp, /if \(f\.size && file\.size !== f\.size\) throw new Error\('incomplete copy'\)/);
  assert.ok(imp.indexOf('incomplete copy') < imp.indexOf('captureRemove'), 'checked before removal');
});

test('the scan form reads Scan / Which scan did you do?; the export keeps Application', () => {
  assert.match(APP, /section\('type', T\('Scan'\), '<div class="field" data-req="type"><span class="lab" id="lab-type">' \+ esc\(T\('Which scan did you do\?'\)\)/);
  assert.ok(!/T\('Application'\)/.test(APP));
  assert.match(APP, /var head = \['Date', 'Application',/, 'CSV export column unchanged');
  assert.match(CSS, /\.tray-bar \{ position: sticky; bottom: calc\(var\(--tab\)/, 'tray actions sit above the tab bar');
});
