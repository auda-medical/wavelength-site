// 1.0.12 media editor model (src/app/editor.js): geometry, redaction placement through transforms, annotations that
// move with the picture, label sets per scan type, pictogram laterality, and what annotation data may be stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/app/editor.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const E = globalThis.WLEditor;
const ORIENTS = [0, 1, 2, 3].flatMap((r) => [{ r, m: false }, { r, m: true }]);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('toOut and toSrc are inverse for every orientation and crop', () => {
  const crop = { x: 37, y: 11, w: 400, h: 300 };
  for (const o of ORIENTS) {
    for (const p of [{ x: 37, y: 11 }, { x: 437, y: 311 }, { x: 100, y: 200 }, { x: 236.5, y: 12.25 }]) {
      const q = E.toSrc(E.toOut(p, crop, o), crop, o);
      assert.ok(close(q.x, p.x) && close(q.y, p.y), `${JSON.stringify(o)} ${JSON.stringify(p)} -> ${JSON.stringify(q)}`);
    }
    const s = E.outSize(crop, o, 1);
    assert.deepEqual([s.w, s.h], o.r % 2 ? [300, 400] : [400, 300]);
  }
});

test('the orientation words follow the order of operations (as in 1.0.11)', () => {
  let o = { r: 0, m: false };
  o = E.orientAfter(o, 'rotate'); o = E.orientAfter(o, 'fliph');
  assert.deepEqual(o, { r: 3, m: true });
  o = E.orientAfter(E.orientAfter({ r: 0, m: false }, 'fliph'), 'flipv');
  assert.deepEqual(o, { r: 2, m: false }, 'two flips equal a half turn');
});

test('a redaction drawn on the preview lands on the same source pixels whatever the orientation', () => {
  const crop = { x: 0, y: 0, w: 400, h: 300 };
  // The identifier occupies source pixels (10..110, 5..35). Draw over it in each orientation, in output coordinates.
  const id = { x: 10, y: 5, w: 100, h: 30 };
  for (const o of ORIENTS) {
    const a = E.toOut({ x: id.x, y: id.y }, crop, o), b = E.toOut({ x: id.x + id.w, y: id.y + id.h }, crop, o);
    const drawn = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    const src = E.rectToSrc(drawn, crop, o);
    assert.ok(close(src.x, id.x) && close(src.y, id.y) && close(src.w, id.w) && close(src.h, id.h), `${JSON.stringify(o)}: ${JSON.stringify(src)}`);
  }
});

test('a redaction is clamped to the crop and is never empty-extended outside it', () => {
  const r = E.rectToSrc({ x: -50, y: -50, w: 500, h: 60 }, { x: 0, y: 0, w: 400, h: 300 }, { r: 0, m: false });
  assert.deepEqual(r, { x: 0, y: 0, w: 400, h: 10 });
});

test('annotations move with the picture through turns, flips and crops', () => {
  const crop = { x: 0, y: 0, w: 400, h: 200 };
  // An arrow pointing from the top-left quarter to the centre, and a label in the top-right corner.
  const ann = [{ type: 'arrow', x: 0.1, y: 0.1, x2: 0.5, y2: 0.5 }, { type: 'text', text: 'LV', x: 0.9, y: 0.1 }, { type: 'rect', x: 0.1, y: 0.6, w: 0.2, h: 0.2 }];
  const srcOf = (a, fr) => { const s = E.outSize(fr.crop, fr.orient, 1); return E.toSrc({ x: a.x * s.w, y: a.y * s.h }, fr.crop, fr.orient); };
  let fr = { crop, orient: { r: 0, m: false } }, cur = ann;
  const before = cur.map((a) => srcOf(a, fr));
  for (const act of ['rotate', 'fliph', 'rotate', 'flipv', 'rotate']) {
    const nf = { crop: fr.crop, orient: E.orientAfter(fr.orient, act) };
    const r = E.mapAnnotations(cur, fr, nf);
    assert.equal(r.dropped, 0);
    cur = r.ann; fr = nf;
    cur.forEach((a, i) => { if (a.type === 'rect') return; const p = srcOf(a, fr); assert.ok(close(p.x, before[i].x, 1e-6) && close(p.y, before[i].y, 1e-6), `${act}: ${a.type} moved to ${JSON.stringify(p)}`); });
  }
  // A crop that keeps the left half drops the label in the top-right corner, and says so.
  const r2 = E.mapAnnotations(ann, { crop, orient: { r: 0, m: false } }, { crop: { x: 0, y: 0, w: 200, h: 200 }, orient: { r: 0, m: false } });
  assert.equal(r2.dropped, 1);
  assert.deepEqual(r2.ann.map((a) => a.type), ['arrow', 'rect']);
  assert.ok(close(r2.ann[0].x, 0.2) && close(r2.ann[0].x2, 1));
});

test('clip annotations show only within their time range', () => {
  assert.equal(E.annAt({}, 3), true);
  assert.equal(E.annAt({ t0: 2 }, 1.9), false);
  assert.equal(E.annAt({ t0: 2 }, 2), true);
  assert.equal(E.annAt({ t1: 4 }, 4.5), false);
  assert.equal(E.annAt({ t0: 1, t1: 2 }, 1.5), true);
  assert.equal(E.annAt({ t0: 1, t1: 2 }, null), true, 'a photo ignores times');
});

test('stored annotation data keeps only what is needed to draw it again', () => {
  const out = E.cleanAnn([
    { type: 'text', text: 'x'.repeat(200), x: 0.123456789, y: 0.5, color: 'magenta', extra: 'nope', bg: 'box', rot: 375.4 },
    { type: 'script', x: 0, y: 0 },
    { type: 'picto', picto: 'not-a-picto', x: 0, y: 0 },
    { type: 'picto', picto: 'body-ruq', x: 0.8, y: 0.2, size: 0.24, flip: true, t0: 1.234, t1: 5.678 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].text.length, 80);
  assert.equal(out[0].x, 0.1235);
  assert.equal(out[0].color, 'white', 'unknown colours fall back to white');
  assert.equal(out[0].rot, 15);
  assert.ok(!('extra' in out[0]));
  assert.deepEqual(out[1], { type: 'picto', x: 0.8, y: 0.2, color: 'white', picto: 'body-ruq', flip: true, size: 0.24, t0: 1.23, t1: 5.68 });
  assert.equal(E.cleanAnn(new Array(100).fill({ type: 'dot', x: 0, y: 0 })).length, 60, 'at most 60 annotations');
});

test('every scan type has a short, relevant label set, plus free text, and pictograms', () => {
  for (const t of LOGBOOK.types) {
    const groups = E.groupsFor(t.id);
    assert.ok(groups.includes('general'), t.id);
    for (const g of groups) { assert.ok(E.PRESETS[g] && E.PRESETS[g].length <= 15, `${t.id}: ${g}`); assert.ok(E.GROUP_LABEL[g], g); }
    assert.equal(E.pictosFor(t.id).length, E.PICTOS.length, 'every pictogram is reachable');
  }
  assert.deepEqual(E.groupsFor('cardiac').slice(0, 1), ['cardiac']);
  assert.ok(E.PRESETS.cardiac.includes('LV') && E.PRESETS.cardiac.includes('IVC') && E.PRESETS.cardiac.includes('Pericardium'));
  assert.ok(E.PRESETS.aaa.includes('Proximal') && E.PRESETS.aaa.includes('Distal'));
  assert.ok(E.PRESETS.vascular.includes('CFV') && E.PRESETS.vascular.includes('GSV') && E.PRESETS.vascular.includes('Thrombus'));
  assert.ok(E.PRESETS.lung.includes('Pleura') && E.PRESETS.lung.includes('Consolidation'));
  assert.ok(E.PRESETS.abdominal.includes('GB') && E.PRESETS.abdominal.includes('CBD'));
  assert.equal(E.groupsFor('aaa')[0], 'aaa');
  assert.equal(E.groupsFor('dvt')[0], 'vascular');
});

test('pictograms show laterality explicitly and put regions on the correct side', () => {
  // Figures face the viewer: the patient's right is on the viewer's left, and an R marks that side.
  for (const p of E.PICTOS.filter((x) => x.group === 'Body')) {
    assert.ok(p.labels.some((l) => l[0] === 'R' && l[1] < 50), p.id + ' has R on the viewer\'s left');
  }
  const x = (id) => E.PICTO[id].spot[0];
  assert.ok(x('body-ruq') < 50 && x('body-luq') > 50);
  assert.ok(x('body-chest-r') < 50 && x('body-chest-l') > 50);
  assert.ok(x('body-leg-r') < 50 && x('body-leg-l') > 50);
  assert.ok(x('body-heart') > 50, 'the heart sits to the patient\'s left');
  // Apical four-chamber in the usual screen layout (apex at top, LV on the right of the screen).
  const a4c = Object.fromEntries(E.PICTO['heart-a4c'].labels.map((l) => [l[0], l]));
  assert.ok(a4c.LV[1] > 50 && a4c.RV[1] < 50 && a4c.LA[2] > a4c.LV[2]);
  // Every pictogram is drawn from its own path data: no image files, nothing fetched.
  for (const p of E.PICTOS) assert.ok(p.parts.every((d) => /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(d)), p.id);
});

test('no em dashes in labels or pictogram names, and no measurement tools', () => {
  const words = [...Object.values(E.PRESETS).flat(), ...E.PICTOS.map((p) => p.label), ...Object.values(E.GROUP_LABEL)];
  for (const w of words) assert.ok(!w.includes('—'), w);
  const src = readFileSync(new URL('../src/app/editor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /calibrat(e|ion)\s*[:=(]|mm\/px|pixelsPerMm|measureDistance/i);
});

test('drawFrame paints redactions after the picture and annotations last, in the same transform as the picture', () => {
  // A recording 2D context: the order of operations is what matters.
  const ops = [];
  const ctx = new Proxy({ canvas: { width: 400, height: 300 } }, { get(t, k) { if (k in t) return t[k]; return (...a) => ops.push([k, ...a]); }, set(t, k, v) { ops.push(['set ' + String(k), v]); t[k] = v; return true; } });
  const st = { crop: { x: 0, y: 0, w: 400, h: 300 }, orient: { r: 1, m: false }, redact: [{ x: 10, y: 5, w: 100, h: 30, c: 'black' }], ann: [{ type: 'dot', x: 0.5, y: 0.5, color: 'red' }] };
  E.drawFrame(ctx, {}, st, 1, null, true);
  const names = ops.map((o) => o[0]);
  const img = names.indexOf('drawImage'), fill = names.indexOf('fillRect', img), reset = names.indexOf('setTransform', fill), arc = names.indexOf('arc');
  assert.ok(img >= 0 && fill > img && reset > fill && arc > reset, names.join(','));
  assert.equal(ops.filter((o) => o[0] === 'set fillStyle' && o[1] === '#000').length >= 2, true, 'black background and black redaction');
  const ops2 = []; ops.length = 0;
  E.drawFrame(ctx, {}, st, 1, null, false);
  assert.ok(!ops.some((o) => o[0] === 'arc'), 'the copy without annotations has none');
  assert.ok(ops.some((o) => o[0] === 'fillRect'), 'but keeps the redaction');
  assert.equal(ops2.length, 0);
});
