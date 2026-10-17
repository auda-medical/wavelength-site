// 1.0.17 annotation rotation (ChatGPT 12 Oct 13:01): the model in src/app/editor.js and the Size and Rotation
// controls in src/app/app.js. Browser and device behaviour: tools/e2e-1017.mjs and tools/e2e-1017-emulator.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/app/editor.js';

const E = globalThis.WLEditor;
const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/app.css', import.meta.url), 'utf8');
// A recording canvas: every call and every property set, in order.
const rec = (tw = 40) => { const ops = []; const ctx = new Proxy({ canvas: { width: 1000, height: 800 }, measureText: () => ({ width: tw }) }, { get(t, k) { if (k in t) return t[k]; return (...a) => ops.push([k, ...a]); }, set(t, k, v) { ops.push(['set ' + String(k), v]); return true; } }); return { ops, ctx }; };
const turns = (a) => { const { ops, ctx } = rec(); E.drawAnn(ctx, a, 1000, 800); return ops.filter((o) => o[0] === 'rotate').map((o) => Math.round(o[1] * 180 / Math.PI * 1e6) / 1e6); };

test('normalising: any finite angle becomes a whole degree from -179 to 180; anything else is straight', () => {
  const cases = [[0, 0], [15, 15], [345, -15], [180, 180], [-180, 180], [540, 180], [-190, 170], [361, 1], [-361, -1], [720, 0], [12.4, 12], [12.6, 13], [1e9, ((1e9 % 360) + 360) % 360 > 180 ? ((1e9 % 360) + 360) % 360 - 360 : ((1e9 % 360) + 360) % 360], ['30', 30], ['x', 0], [NaN, 0], [Infinity, 0], [null, 0], [undefined, 0]];
  for (const [v, want] of cases) assert.equal(E.normRot(v), want, String(v));
  assert.deepEqual([E.ROT.min, E.ROT.max], [-180, 180]);
});

test('Straight is easy to find again: within 3° of the centre snaps to 0', () => {
  assert.deepEqual([-3, -2, -1, 0, 1, 2, 3, 4, -4, 179, -179, 180].map(E.snapRot), [0, 0, 0, 0, 0, 0, 0, 4, -4, 179, -179, 180]);
});

test('what can turn: text and labels, pictograms, boxes; not arrows, dots or circles', () => {
  assert.deepEqual(['text', 'picto', 'rect', 'arrow', 'dot', 'circle'].map((type) => E.canRotate({ type })), [true, true, true, false, false, false]);
  assert.equal(E.rotOf({ type: 'arrow', rot: 30 }), 0, 'an arrow never turns (its ends set its angle)');
  assert.equal(E.rotOf({ type: 'circle', rot: 30 }), 0);
});

test('older annotations look exactly as before: none turned when they had no turn, 345 drawn as 15° left', () => {
  assert.deepEqual(turns({ type: 'text', text: 'LV', x: 0.5, y: 0.5 }), [], 'no turn: no rotate call at all');
  assert.deepEqual(turns({ type: 'text', text: 'LV', x: 0.5, y: 0.5, rot: 345 }), [-15]);
  assert.deepEqual(turns({ type: 'text', text: 'LV', x: 0.5, y: 0.5, rot: -15 }), [-15]);
  assert.deepEqual(turns({ type: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.2, rot: 30 }), [30]);
  const { ops, ctx } = rec(); E.drawAnn(ctx, { type: 'picto', picto: 'side-r', x: 0.5, y: 0.5, rot: 90 }, 1000, 800);
  assert.ok(ops.some((o) => o[0] === 'rotate' && Math.abs(o[1] - Math.PI / 2) < 1e-9), 'a pictogram turns by its angle');
  assert.deepEqual(turns({ type: 'circle', x: 0.1, y: 0.1, w: 0.3, h: 0.2, rot: 30 }), [], 'a circle is drawn the same at any angle');
});

test('stored annotations: turns kept and normalised, malformed ones made straight, none on what cannot turn', () => {
  const out = E.cleanAnn([
    { type: 'text', text: 'Old', x: 0.5, y: 0.5 },
    { type: 'text', text: 'Turned', x: 0.5, y: 0.5, rot: 345 },
    { type: 'text', text: 'Bad', x: 0.5, y: 0.5, rot: 'abc' },
    { type: 'text', text: 'Huge', x: 0.5, y: 0.5, rot: 7230 },
    { type: 'picto', picto: 'side-r', x: 0.5, y: 0.5, rot: -180 },
    { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, rot: 0 },
    { type: 'arrow', x: 0.1, y: 0.1, x2: 0.5, y2: 0.5, rot: 45 },
    { type: 'dot', x: 0.2, y: 0.2, rot: 45 },
    { type: 'circle', x: 0.1, y: 0.1, w: 0.2, h: 0.2, rot: 45 },
  ]);
  assert.equal(out.length, 9, 'a bad angle never drops the annotation');
  assert.deepEqual(out.map((a) => a.rot), [undefined, -15, undefined, 30, 180, undefined, undefined, undefined, undefined]);
  assert.ok(!('rot' in out[0]) && !('rot' in out[5]), 'straight is no field at all, as before 1.0.17');
});

test('a turned label is picked up by its letters, and not by the empty corners of an upright box', () => {
  const ctx = { measureText: (s) => ({ width: s.length * 40 }), set font(v) {} };
  const a = { type: 'text', text: 'Common femoral vein', x: 0.5, y: 0.5, size: 0.058, rot: 45 }, W = 1000, H = 800;
  // 300 px along the text, from its centre: on the letters when turned 45°.
  const along = { x: 500 + 300 * Math.cos(Math.PI / 4), y: 400 + 300 * Math.sin(Math.PI / 4) };
  assert.equal(E.hit(ctx, [a], W, H, along.x, along.y, null), 0, 'on the turned letters');
  assert.equal(E.hit(ctx, [a], W, H, 500 + 300, 400, null), -1, 'where the letters would be if it were straight');
  assert.equal(E.hit(ctx, [{ ...a, rot: 0 }], W, H, 500 + 300, 400, null), 0, 'straight: as before');
  // Near the picture's edge it is still picked up.
  assert.equal(E.hit(ctx, [{ ...a, x: 0.97, y: 0.05 }], W, H, 970, 40, null), 0);
});

test('turning or mirroring the picture: text and pictograms keep their turn on screen; a box keeps covering its area', () => {
  const crop = { x: 0, y: 0, w: 800, h: 600 };
  const ann = [{ type: 'text', text: 'Ao', x: 0.5, y: 0.5, rot: 20 }, { type: 'picto', picto: 'side-r', x: 0.3, y: 0.3, rot: -40 }, { type: 'rect', x: 0.2, y: 0.2, w: 0.4, h: 0.2, rot: 30 }];
  const from = { crop, orient: { r: 0, m: false } };
  const quarter = E.mapAnnotations(ann, from, { crop, orient: { r: 1, m: false } }).ann;
  assert.deepEqual(quarter.map((a) => a.rot), [20, -40, 30], 'a quarter turn: angles unchanged (the box swaps its sides instead)');
  // 320 x 120 px on the 800 x 600 picture becomes 120 x 320 px on the turned 600 x 800 one.
  assert.ok(Math.abs(quarter[2].w - 120 / 600) < 1e-9 && Math.abs(quarter[2].h - 320 / 800) < 1e-9, 'the box swapped its sides');
  const mirror = E.mapAnnotations(ann, from, { crop, orient: E.orientAfter({ r: 0, m: false }, 'fliph') }).ann;
  assert.deepEqual(mirror.map((a) => a.rot), [20, -40, -30], 'a mirror: text and pictogram as they were on screen, the box mirrored');
  const back = E.mapAnnotations(mirror, { crop, orient: E.orientAfter({ r: 0, m: false }, 'fliph') }, from).ann;
  assert.deepEqual(back.map((a) => a.rot), [20, -40, 30], 'mirroring back restores the box');
});

test('the editor: Size and Rotation together, Rotation live and one Undo step per drag, Turn removed', () => {
  assert.ok(!/data-sa="turn"|sa === 'turn'/.test(APP), 'the coarse 15° Turn button is gone');
  assert.match(APP, /role="group" aria-label="' \+ esc\(T\('Annotation controls'\)\)/);
  assert.match(APP, /<input type="range" id="edrot" data-rotr min="' \+ EDT\.ROT\.min \+ '" max="' \+ EDT\.ROT\.max \+ '" step="1"/);
  assert.match(APP, /T\('Straight'\) : n < 0 \? T\('\{n\}° left', \{ n: -n \}\) : T\('\{n\}° right', \{ n: n \}\)/);
  assert.match(APP, /rotIn\.setAttribute\('aria-valuetext', rotWords\(n\)\)/);
  assert.match(APP, /\$\('\[data-rotctl\]', el\)\.hidden = !can;/, 'no Rotation for arrows, dots and circles');
  const commit = APP.slice(APP.indexOf('function commitRot()'), APP.indexOf('rotIn.addEventListener'));
  assert.match(commit, /if \(rotBefore !== null && rotBefore !== snap\(\)\) \{ undo\.push\(rotBefore\);/, 'one drag, one Undo step');
  assert.match(APP, /if \(n\) a\.rot = n; else delete a\.rot;/, 'Straight stores no turn');
  // Where the controls go follows the same rule as the editor's layout.
  assert.match(APP, /matchMedia\('\(min-width: 700px\) and \(min-aspect-ratio: 4\/5\)'\)/);
  assert.match(CSS, /@media \(min-width: 700px\) and \(min-aspect-ratio: 4\/5\) \{\n  \.editor \{ grid-template-rows: auto minmax\(0, 1fr\) auto auto; \}/);
  assert.match(CSS, /\.editor \.ed-ctls\.wide \.ed-ctlgrid:not\(\.one\) \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/, 'side by side only when marked wide');
  // Wide is measured at the text size actually shown (Android's font size enlarges text without changing CSS em).
  assert.match(APP, /ctls\.classList\.toggle\('wide', w >= 30 \* f\)/, 'side by side only when the group is wide enough for its rendered text size');
  assert.doesNotMatch(CSS, /@container/, 'no container query left to disagree with the measurement');
  assert.match(CSS, /\.editor \.ed-rot input\[type=range\] \{[^}]*height: 44px/, 'a full-size touch target');
});
