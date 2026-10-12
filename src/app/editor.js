// Wavelength media editor (1.0.12): one editor for photos and clips, with three modes.
//   Annotate  free text, clinical labels for the scan type, arrows, dots, circles, boxes and pictograms
//   Adjust    crop, trim the top strip, rotate, flip
//   Redact    solid black or grey boxes over patient identifiers
// Plain script (window.WLEditor), like progress.js, so its drawing and geometry also run in Node tests.
//
// The model, the same for photos and clips:
//   crop    {x, y, w, h} in source pixels
//   orient  {r, m}: quarter turns clockwise (r) after an optional left-right mirror (m), relative to the source
//   redact  [{x, y, w, h, c}] in source pixels, so a redaction stays on the identifier through crop, turns and flips
//   ann     annotations in the output frame (after crop and orientation), as fractions of its width and height, so
//           they draw the same at any size: preview, saved image and every recorded clip frame
// One drawing function (drawFrame) makes the preview and the saved pixels. Redactions are drawn into the pixels
// before anything else is drawn over them, and a redacted area is solid (never blurred or see-through).
// Nothing here measures anything: there are no calibrated distance or area tools.
(function (root) {
  'use strict';

  // ---------- Geometry ----------
  function orientAfter(o, act) {
    if (act === 'rotate') return { r: (o.r + 1) % 4, m: o.m };
    if (act === 'fliph') return { r: (4 - o.r) % 4, m: !o.m };
    if (act === 'flipv') return { r: (6 - o.r) % 4, m: !o.m };
    return o;
  }
  // The orientation of a picture turned by prior and then, in a later session, by o (each a mirror first, then turns):
  // what a re-edited image reports as the change from the original photo.
  function composeOrient(prior, o) {
    var t = prior && (prior.r || prior.m) ? { r: ((Number(prior.r) || 0) % 4 + 4) % 4, m: !!prior.m } : { r: 0, m: false };
    if (o.m) t = orientAfter(t, 'fliph');
    for (var i = 0; i < o.r; i++) t = orientAfter(t, 'rotate');
    return t;
  }
  // Output size for a crop and orientation at scale k.
  function outSize(crop, orient, k) { var w = crop.w * k, h = crop.h * k; return orient.r % 2 ? { w: h, h: w } : { w: w, h: h }; }
  // The canvas transform that draws the cropped frame (at scale k) turned and mirrored.
  function setOrient(ctx, crop, orient, k) {
    var w = crop.w * k, h = crop.h * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (orient.r === 1) ctx.setTransform(0, 1, -1, 0, h, 0);
    if (orient.r === 2) ctx.setTransform(-1, 0, 0, -1, w, h);
    if (orient.r === 3) ctx.setTransform(0, -1, 1, 0, 0, w);
    if (orient.m) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  }
  // A point in the output (k = 1) back to source pixels, and source pixels forward to the output.
  function toSrc(p, crop, orient) {
    var u = p.x, v = p.y, w = crop.w, h = crop.h, x, y;
    if (orient.r === 0) { x = u; y = v; } else if (orient.r === 1) { x = v; y = h - u; } else if (orient.r === 2) { x = w - u; y = h - v; } else { x = w - v; y = u; }
    if (orient.m) x = w - x;
    return { x: crop.x + x, y: crop.y + y };
  }
  function toOut(p, crop, orient) {
    var w = crop.w, h = crop.h, u = p.x - crop.x, v = p.y - crop.y;
    if (orient.m) u = w - u;
    if (orient.r === 1) return { x: h - v, y: u };
    if (orient.r === 2) return { x: w - u, y: h - v };
    if (orient.r === 3) return { x: v, y: w - u };
    return { x: u, y: v };
  }
  function clampRect(r, bound) {
    var x = Math.max(bound.x, Math.min(r.x, bound.x + bound.w)), y = Math.max(bound.y, Math.min(r.y, bound.y + bound.h));
    var x2 = Math.max(bound.x, Math.min(r.x + r.w, bound.x + bound.w)), y2 = Math.max(bound.y, Math.min(r.y + r.h, bound.y + bound.h));
    return { x: x, y: y, w: x2 - x, h: y2 - y };
  }
  // A rectangle drawn on the output (k = 1) as a rectangle in source pixels, kept inside the crop.
  function rectToSrc(s, crop, orient) {
    var a = toSrc({ x: s.x, y: s.y }, crop, orient), b = toSrc({ x: s.x + s.w, y: s.y + s.h }, crop, orient);
    return clampRect({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, crop);
  }

  // ---------- Magnification (1.0.13) ----------
  // The preview is enlarged on screen only, with a CSS transform translate(tx, ty) scale(z) from the canvas's top-left
  // corner. Every pointer position is read back through the transformed box, so drawing, moving and redacting land on
  // the same picture pixels at any zoom, and nothing saved depends on it. b: the canvas's unzoomed box inside the stage
  // (L, T, w, h) and the stage size (SW, SH), all in CSS pixels.
  var ZOOM = { min: 1, max: 5 };
  // Keeps the picture filling the stage when it is larger than it, and centred when it is smaller.
  function clampView(v, b) {
    var z = Math.max(ZOOM.min, Math.min(ZOOM.max, Number(v.z) || 1));
    var ax = function (t, size, at, room) { var s = size * z; return s <= room ? (room - s) / 2 - at : Math.max(room - s - at, Math.min(-at, t)); };
    return { z: z, tx: ax(Number(v.tx) || 0, b.w, b.L, b.SW), ty: ax(Number(v.ty) || 0, b.h, b.T, b.SH) };
  }
  // Zoom to z with the picture point that was under m0 (stage coordinates) at view v0 moved to m: a pinch whose
  // fingers also move pans as it zooms. With m0 equal to m it zooms about that point (buttons, the wheel).
  function pinchView(v0, m0, m, z, b) {
    var ux = (m0.x - b.L - v0.tx) / v0.z, uy = (m0.y - b.T - v0.ty) / v0.z;
    return clampView({ z: z, tx: m.x - b.L - z * ux, ty: m.y - b.T - z * uy }, b);
  }

  // ---------- Annotations ----------
  var COLOURS = { white: '#FFFFFF', yellow: '#FFD60A', cyan: '#22D3EE', red: '#FF453A' };
  var SIZES = { s: 0.042, m: 0.058, l: 0.08 };
  var TYPES = ['text', 'arrow', 'dot', 'circle', 'rect', 'picto'];
  // a.size is the stored value, a fraction of the picture's shorter side: the font height of text and labels, a dot's
  // size, the line thickness and arrowhead of arrows, circles and boxes (their extent is drawn, not sized), and the
  // plate of a pictogram. Zooming the editor never changes it: sizes are fractions of the picture, not the screen.
  //
  // 1.0.14: the Annotation size slider runs from -100 (Smaller) through 0 (the usual size, the exact middle) to 100
  // (Larger), on a curve: fine steps near the middle, strong ones towards the ends. Each kind has its own range, so a
  // line can be a hairline or bold and a label can be a footnote or a heading, without either running off the picture.
  // 1.0.16 (owner's Fold7 check, 12 Oct): the ends are about twice as far apart, the middle unchanged: the usual size
  // is still the exact middle and the curve keeps fine steps around it. Stored sizes never change; only where an
  // older size sits on the slider does. Every end stays usable: text at least 1.2% of the picture's shorter side, a
  // line at least a pixel, a pictogram no larger than the picture (drawPicto caps it at 0.96).
  var POS = { min: -100, max: 100, snap: 3, curve: 1.7 };
  var RANGE = {
    text: { base: 0.058, lo: 0.012, hi: 0.42 },  // font height (1.0.14: 0.016 to 0.3)
    dot: { base: 0.058, lo: 0.01, hi: 0.4 },     // dot radius is 0.32 of this (1.0.14: 0.014 to 0.26)
    line: { base: 0.058, lo: 0.01, hi: 0.46 },   // arrows, circles, boxes: line thickness 0.17x to 7.9x the usual (1.0.14: 0.016 to 0.32)
    picto: { base: 0.24, lo: 0.045, hi: 0.96 }   // the plate's side (1.0.14: 0.07 to 0.92)
  };
  function rangeOf(type) { return RANGE[type === 'arrow' || type === 'circle' || type === 'rect' ? 'line' : type] || RANGE.text; }
  function sizeBase(type) { return rangeOf(type).base; }
  function sizeOf(a) { return a && a.size ? a.size : sizeBase(a && a.type); }
  // The stored size for a slider position, and the slider position of a stored size (1.0.12 and 1.0.13 sizes included).
  function sizeAt(type, pos) {
    var r = rangeOf(type), p = Number(pos); if (!isFinite(p)) p = 0;
    p = Math.max(POS.min, Math.min(POS.max, p));
    var e = Math.pow(Math.abs(p) / 100, POS.curve);
    return Math.round(r.base * Math.pow((p >= 0 ? r.hi : r.lo) / r.base, e) * 1e4) / 1e4;
  }
  function posOf(a) {
    var r = rangeOf(a && a.type), v = sizeOf(a) / r.base;
    if (Math.abs(v - 1) < 1e-6) return 0;
    var end = v > 1 ? r.hi / r.base : r.lo / r.base, t = Math.log(v) / Math.log(end);
    return Math.round(Math.max(0, Math.min(1, Math.pow(Math.max(0, t), 1 / POS.curve))) * 100) * (v > 1 ? 1 : -1);
  }
  // A position close enough to the middle is the middle, so the usual size is easy to find again by feel.
  function snapPos(pos) { pos = Math.round(Number(pos) || 0); return Math.abs(pos) <= POS.snap ? 0 : Math.max(POS.min, Math.min(POS.max, pos)); }

  // ---------- Colours (1.0.14) ----------
  // An annotation's colour is one of the named colours of 1.0.12 or any #rrggbb from the colour picker. Marks are
  // edged in the opposite tone, so a dark colour still shows on a dark ultrasound background and a light one on a
  // bright area.
  function hexOf(c) { if (typeof c !== 'string') return null; if (Object.prototype.hasOwnProperty.call(COLOURS, c)) return COLOURS[c]; return /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : null; }
  function rgbOf(c) { var h = hexOf(c) || '#FFFFFF'; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function luminance(c) { return rgbOf(c).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function contrast(a, b) { var x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function edgeFor(c) { return luminance(c) < 0.18 ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.85)'; }
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function (n) { return Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))); };
    return '#' + [f(0), f(8), f(4)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('').toUpperCase();
  }
  var BOX = '#050B14'; // the usual background box behind text
  // The points that carry an annotation's position, in output fractions (for mapping through a crop or turn).
  function annPoints(a) {
    if (a.type === 'arrow') return [{ x: a.x, y: a.y }, { x: a.x2, y: a.y2 }];
    if (a.type === 'circle' || a.type === 'rect') return [{ x: a.x, y: a.y }, { x: a.x + a.w, y: a.y + a.h }];
    return [{ x: a.x, y: a.y }];
  }
  // Moves annotations with the picture when the crop or orientation changes: each point goes back to source pixels
  // under the old frame and forward under the new one. Text stays upright. Returns { ann, dropped }: annotations whose
  // anchor falls outside the new crop are dropped (the caller says so, and Undo brings them back).
  function mapAnnotations(ann, from, to) {
    var fo = outSize(from.crop, from.orient, 1), no = outSize(to.crop, to.orient, 1), out = [], dropped = 0;
    (ann || []).forEach(function (a) {
      var pts = annPoints(a).map(function (p) {
        var s = toSrc({ x: p.x * fo.w, y: p.y * fo.h }, from.crop, from.orient), o = toOut(s, to.crop, to.orient);
        return { x: o.x / no.w, y: o.y / no.h };
      });
      var inside = function (p) { return p.x >= -0.001 && p.x <= 1.001 && p.y >= -0.001 && p.y <= 1.001; };
      if (!inside(pts[0]) && !(pts[1] && inside(pts[1]))) { dropped++; return; }
      var c = JSON.parse(JSON.stringify(a)), cl = function (v) { return Math.max(0, Math.min(1, v)); };
      if (a.type === 'arrow') { c.x = cl(pts[0].x); c.y = cl(pts[0].y); c.x2 = cl(pts[1].x); c.y2 = cl(pts[1].y); }
      else if (a.type === 'circle' || a.type === 'rect') { var x1 = cl(Math.min(pts[0].x, pts[1].x)), y1 = cl(Math.min(pts[0].y, pts[1].y)), x2 = cl(Math.max(pts[0].x, pts[1].x)), y2 = cl(Math.max(pts[0].y, pts[1].y)); c.x = x1; c.y = y1; c.w = x2 - x1; c.h = y2 - y1; }
      else { c.x = cl(pts[0].x); c.y = cl(pts[0].y); }
      out.push(c);
    });
    return { ann: out, dropped: dropped };
  }
  // Is annotation a shown at clip time t (seconds from the start of the kept selection)? Photos pass t = null.
  function annAt(a, t) { return t == null || ((a.t0 == null || t >= a.t0 - 1e-6) && (a.t1 == null || t <= a.t1 + 1e-6)); }
  function fontFor(px) { return '600 ' + Math.round(px) + 'px "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; }

  // ---------- Pictograms: original line drawings (100 x 100), not copied from any machine maker ----------
  // parts: SVG path data drawn with the annotation's colour; spot: a filled marker; labels: upright text at
  // positions that follow a mirror. Body figures face the viewer, so the patient's right is on the viewer's left:
  // each carries an "R" on that side so laterality is never implied silently.
  var BODY = 'M50 5a7 7 0 1 0 .01 0M41 21q9-4 18 0l8 5 7 25-5 2-6-20v24l-2 37h-8l-2-28h-2l-2 28h-8l-2-37V33l-6 20-5-2 7-25z';
  var PICTOS = [
    { id: 'body-ruq', group: 'Body', label: 'Right upper quadrant', parts: [BODY], spot: [43, 41], labels: [['R', 9, 14]] },
    { id: 'body-luq', group: 'Body', label: 'Left upper quadrant', parts: [BODY], spot: [57, 41], labels: [['R', 9, 14]] },
    { id: 'body-epi', group: 'Body', label: 'Epigastrium', parts: [BODY], spot: [50, 36], labels: [['R', 9, 14]] },
    { id: 'body-pelvis', group: 'Body', label: 'Pelvis', parts: [BODY], spot: [50, 55], labels: [['R', 9, 14]] },
    { id: 'body-chest-r', group: 'Body', label: 'Right chest', parts: [BODY], spot: [44, 28], labels: [['R', 9, 14]] },
    { id: 'body-chest-l', group: 'Body', label: 'Left chest', parts: [BODY], spot: [56, 28], labels: [['R', 9, 14]] },
    { id: 'body-heart', group: 'Body', label: 'Heart', parts: [BODY], spot: [53, 31], labels: [['R', 9, 14]] },
    { id: 'body-neck', group: 'Body', label: 'Neck', parts: [BODY], spot: [50, 17], labels: [['R', 9, 14]] },
    { id: 'body-leg-r', group: 'Body', label: 'Right leg', parts: [BODY], spot: [44, 72], labels: [['R', 9, 14]] },
    { id: 'body-leg-l', group: 'Body', label: 'Left leg', parts: [BODY], spot: [56, 72], labels: [['R', 9, 14]] },
    { id: 'probe-trv', group: 'Probe', label: 'Probe, transverse', parts: ['M18 43h64a7 7 0 0 1 0 14H18a7 7 0 0 1 0-14z'], spot: [11, 50], labels: [['TRV', 50, 82]] },
    { id: 'probe-long', group: 'Probe', label: 'Probe, longitudinal', parts: ['M43 22v56a7 7 0 0 0 14 0V22a7 7 0 0 0-14 0z'], spot: [50, 12], labels: [['LONG', 78, 52]] },
    { id: 'probe-obl', group: 'Probe', label: 'Probe, oblique', parts: ['M27 68l41-41a7 7 0 0 1 10 10L37 78a7 7 0 0 1-10-10z'], spot: [79, 21], labels: [['OBL', 26, 30]] },
    { id: 'side-r', group: 'Side', label: 'Right', parts: ['M50 12a38 38 0 1 0 .01 0'], labels: [['R', 50, 52, 1.9]] },
    { id: 'side-l', group: 'Side', label: 'Left', parts: ['M50 12a38 38 0 1 0 .01 0'], labels: [['L', 50, 52, 1.9]] },
    { id: 'heart-a4c', group: 'Heart', label: 'Apical four-chamber (apex at top)', parts: ['M50 10C30 26 16 48 18 70q2 18 32 20q30-2 32-20C84 48 70 26 50 10z', 'M50 12v76', 'M19 62h62'], labels: [['RV', 36, 44], ['LV', 64, 44], ['RA', 36, 78], ['LA', 64, 78]] },
    { id: 'heart-plax', group: 'Heart', label: 'Parasternal long axis', parts: ['M8 16q42-8 84 0', 'M8 30q42-6 84 0', 'M8 38q26-4 56 0v26q-28 6-56 0z', 'M64 38h28v14H64', 'M78 58a10 10 0 1 0 .01 0'], labels: [['RV', 34, 24], ['LV', 34, 51], ['Ao', 80, 45], ['LA', 78, 69]] },
    { id: 'heart-psax', group: 'Heart', label: 'Parasternal short axis', parts: ['M62 24a26 26 0 1 0 .01 0', 'M62 36a14 14 0 1 0 .01 0', 'M36 28q-20 24 0 48'], labels: [['LV', 62, 50], ['RV', 15, 52]] }
  ];
  var PICTO = {}; PICTOS.forEach(function (p) { PICTO[p.id] = p; });
  var pathCache = {};
  function path2d(d) { if (!root.Path2D) return null; return pathCache[d] || (pathCache[d] = new root.Path2D(d)); }

  // ---------- Clinical labels: a short set per scan type, always editable, always with free text ----------
  var PRESETS = {
    cardiac: ['LV', 'RV', 'LA', 'RA', 'IVS', 'IVC', 'Ao', 'MV', 'AV', 'TV', 'Pericardium', 'Pericardial effusion'],
    aaa: ['Ao', 'IVC', 'Proximal', 'Mid', 'Distal', 'Bifurcation', 'SMA', 'Vertebral body', 'Thrombus'],
    vascular: ['CFA', 'CFV', 'SFA', 'GSV', 'SFJ', 'Femoral vein', 'Popliteal vein', 'Popliteal artery', 'Vein', 'Artery', 'Thrombus', 'Compressed', 'Not compressible'],
    access: ['IJV', 'CCA', 'Basilic vein', 'Cephalic vein', 'Brachial artery', 'Vein', 'Artery', 'Needle', 'Needle tip', 'Guidewire', 'Catheter'],
    lung: ['Pleura', 'Pleural line', 'A-lines', 'B-lines', 'Lung sliding', 'Lung point', 'Diaphragm', 'Effusion', 'Consolidation', 'Rib shadow'],
    efast: ['Liver', 'Kidney', "Morison's pouch", 'Spleen', 'Splenorenal recess', 'Bladder', 'Pericardium', 'Pleura', 'Free fluid'],
    abdominal: ['Liver', 'GB', 'CBD', 'Portal vein', 'Kidney', 'Spleen', 'Bladder', 'Bowel', 'Free fluid'],
    renal: ['Kidney', 'Renal cortex', 'Renal pelvis', 'Hydronephrosis', 'Calculus', 'Bladder', 'Ureteric jet'],
    pelvic: ['Uterus', 'Bladder', 'Gestational sac', 'Yolk sac', 'Fetal pole', 'Ovary', 'Adnexa', 'Free fluid'],
    ocular: ['Globe', 'Lens', 'Vitreous', 'Retina', 'Optic nerve sheath', 'Retinal detachment', 'Vitreous haemorrhage'],
    testicular: ['Testis', 'Epididymis', 'Hydrocele', 'Spermatic cord', 'Right', 'Left'],
    msk: ['Tendon', 'Muscle', 'Bone cortex', 'Joint', 'Effusion', 'Collection', 'Cortical step'],
    procedural: ['Needle', 'Needle tip', 'Nerve', 'Artery', 'Vein', 'Fascia', 'LA spread'],
    lp: ['Spinous process', 'Interspinous space', 'Midline', 'Needle'],
    fib: ['Fascia iliaca', 'Iliacus', 'Femoral nerve', 'Femoral artery', 'Femoral vein', 'Needle', 'LA spread'],
    general: ['Right', 'Left', 'Fluid', 'Artery', 'Vein', 'Needle']
  };
  var GROUP_LABEL = { cardiac: 'Cardiac', aaa: 'AAA', vascular: 'Vascular', access: 'Vascular access', lung: 'Lung and thoracic', efast: 'eFAST', abdominal: 'Abdominal', renal: 'Renal', pelvic: 'Pelvic', ocular: 'Ocular', testicular: 'Testicular', msk: 'MSK', procedural: 'Procedural', lp: 'Lumbar puncture', fib: 'Fascia iliaca block', general: 'General' };
  var TYPE_GROUPS = { aaa: ['aaa'], efast: ['efast', 'lung'], els: ['cardiac'], cardiac: ['cardiac'], shock: ['cardiac', 'lung', 'aaa'], lung: ['lung'], abdo: ['abdominal', 'renal'], biliary: ['abdominal'], bowel: ['abdominal'], dvt: ['vascular'], cvc: ['access'], picc: ['access'], pva: ['access'], fib: ['fib'], block: ['procedural'], lp: ['lp'], msk: ['msk'], ocular: ['ocular'], preg: ['pelvic'], procedure: ['procedural'], other: ['testicular'] };
  var TYPE_PICTOS = { aaa: ['body-epi', 'probe-trv', 'probe-long'], efast: ['body-ruq', 'body-luq', 'body-pelvis', 'body-heart', 'body-chest-r', 'body-chest-l'], els: ['heart-a4c', 'heart-plax', 'heart-psax', 'body-heart'], cardiac: ['heart-a4c', 'heart-plax', 'heart-psax', 'body-heart'], shock: ['heart-a4c', 'heart-plax', 'body-epi', 'body-chest-r', 'body-chest-l'], lung: ['body-chest-r', 'body-chest-l', 'probe-long'], abdo: ['body-ruq', 'body-luq', 'body-epi'], biliary: ['body-ruq'], dvt: ['body-leg-r', 'body-leg-l', 'probe-trv'], cvc: ['body-neck', 'probe-trv', 'probe-long'], preg: ['body-pelvis', 'probe-trv', 'probe-long'] };
  function groupsFor(type) { var g = (TYPE_GROUPS[type] || []).slice(); if (g.indexOf('general') < 0) g.push('general'); return g; }
  function pictosFor(type) { var first = TYPE_PICTOS[type] || []; return first.concat(PICTOS.map(function (p) { return p.id; }).filter(function (id) { return first.indexOf(id) < 0; })); }

  // ---------- Drawing ----------
  function drawPicto(ctx, a, W, H) {
    var p = PICTO[a.picto]; if (!p) return;
    var m = Math.min(W, H), size = Math.min(sizeOf(a), 0.96) * m, col = hexOf(a.color) || '#FFFFFF';
    ctx.save();
    ctx.translate(a.x * W, a.y * H);
    if (a.rot) ctx.rotate(a.rot * Math.PI / 180);
    var s = size / 100;
    // A dark rounded plate: a pictogram is a label laid over the picture, never part of the image data.
    ctx.fillStyle = 'rgba(5,11,20,.78)'; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1, size * 0.012);
    var r = size * 0.12, hw = size / 2;
    ctx.beginPath(); ctx.moveTo(-hw + r, -hw); ctx.arcTo(hw, -hw, hw, hw, r); ctx.arcTo(hw, hw, -hw, hw, r); ctx.arcTo(-hw, hw, -hw, -hw, r); ctx.arcTo(-hw, -hw, hw, -hw, r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.scale(a.flip ? -s : s, s); ctx.translate(-50, -50);
    ctx.strokeStyle = luminance(col) < 0.05 ? '#9DABBA' : col; ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    p.parts.forEach(function (d) { var pp = path2d(d); if (pp) ctx.stroke(pp); });
    // The spot is yellow, or red when the drawing itself is yellowish, so it always stands out from the outline.
    if (p.spot) { var c = rgbOf(col); ctx.fillStyle = c[0] > 170 && c[1] > 150 && c[2] < 120 ? '#FF453A' : '#FFD60A'; ctx.beginPath(); ctx.arc(p.spot[0], p.spot[1], 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // Labels upright, at mirrored positions when the drawing is flipped.
    (p.labels || []).forEach(function (l) {
      var lx = (a.flip ? 100 - l[1] : l[1]) - 50, ly = l[2] - 50, fs = 11 * (l[3] || 1) * s;
      ctx.font = fontFor(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = luminance(col) < 0.05 ? '#DCE4EC' : col;
      ctx.fillText(l[0], lx * s, ly * s);
    });
    ctx.restore();
  }
  function arrowHead(ctx, x1, y1, x2, y2, len) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(ang - 0.45), y2 - len * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - len * Math.cos(ang + 0.45), y2 - len * Math.sin(ang + 0.45));
    ctx.closePath();
  }
  // The font height of a text annotation on a W x H frame: its size, made smaller only if the text would otherwise
  // run past the picture's width, so a large label never overflows the image.
  function textSize(ctx, a, W, H) {
    var fs = sizeOf(a) * Math.min(W, H);
    ctx.font = fontFor(fs);
    var tw = ctx.measureText(a.text || '').width, room = W * 0.96 - fs * 0.8;
    return tw > room && tw > 0 ? Math.max(4, fs * Math.max(0.05, room) / tw) : fs;
  }
  // One annotation on an output frame W x H. Every mark has an edge in the opposite tone, so it reads on greyscale
  // ultrasound whatever its colour.
  function drawAnn(ctx, a, W, H) {
    var m = Math.min(W, H), col = hexOf(a.color) || '#FFFFFF', edge = edgeFor(col), k = sizeOf(a) / RANGE.line.base;
    var lw = Math.max(1, m * 0.0065 * k);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (a.type === 'text') {
      var fs = textSize(ctx, a, W, H);
      ctx.translate(a.x * W, a.y * H); if (a.rot) ctx.rotate(a.rot * Math.PI / 180);
      ctx.font = fontFor(fs); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var tw = ctx.measureText(a.text || '').width;
      if (a.bg === 'box') {
        var px = fs * 0.35, py = fs * 0.22;
        ctx.globalAlpha = 0.85; ctx.fillStyle = hexOf(a.bgc) || BOX;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-tw / 2 - px, -fs / 2 - py, tw + px * 2, fs + py * 2, fs * 0.25); else ctx.rect(-tw / 2 - px, -fs / 2 - py, tw + px * 2, fs + py * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else { ctx.strokeStyle = edge; ctx.lineWidth = Math.max(2, fs * 0.2); ctx.strokeText(a.text || '', 0, 0); }
      ctx.fillStyle = col; ctx.fillText(a.text || '', 0, 0);
    } else if (a.type === 'arrow') {
      // The head follows the line: a hairline arrow has a small head, a bold one a large head.
      var x1 = a.x * W, y1 = a.y * H, x2 = a.x2 * W, y2 = a.y2 * H, head = Math.max(lw * 3.4, m * 0.03 * Math.min(1, Math.sqrt(k)));
      var ang = Math.atan2(y2 - y1, x2 - x1), sx = x2 - Math.cos(ang) * head * 0.8, sy = y2 - Math.sin(ang) * head * 0.8;
      ctx.strokeStyle = edge; ctx.lineWidth = lw + 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(sx, sy); ctx.stroke();
      arrowHead(ctx, x1, y1, x2, y2, head + 2); ctx.fillStyle = edge; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(sx, sy); ctx.stroke();
      arrowHead(ctx, x1, y1, x2, y2, head); ctx.fillStyle = col; ctx.fill();
    } else if (a.type === 'dot') {
      var rr = sizeOf(a) * m * 0.32;
      ctx.beginPath(); ctx.arc(a.x * W, a.y * H, rr + 2, 0, Math.PI * 2); ctx.fillStyle = edge; ctx.fill();
      ctx.beginPath(); ctx.arc(a.x * W, a.y * H, rr, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    } else if (a.type === 'circle' || a.type === 'rect') {
      var bx = a.x * W, by = a.y * H, bw = a.w * W, bh = a.h * H;
      var shape = function () { ctx.beginPath(); if (a.type === 'circle') ctx.ellipse(bx + bw / 2, by + bh / 2, Math.max(1, bw / 2), Math.max(1, bh / 2), 0, 0, Math.PI * 2); else ctx.rect(bx, by, bw, bh); };
      ctx.translate(bx + bw / 2, by + bh / 2); if (a.rot && a.type === 'rect') ctx.rotate(a.rot * Math.PI / 180); ctx.translate(-(bx + bw / 2), -(by + bh / 2));
      shape(); ctx.strokeStyle = edge; ctx.lineWidth = lw + 3; ctx.stroke();
      shape(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
    } else if (a.type === 'picto') {
      ctx.restore(); drawPicto(ctx, a, W, H); return;
    }
    ctx.restore();
  }
  // The one drawing function: source (an image, a canvas or a video frame) cropped, redacted, turned and mirrored at
  // scale k, then the annotations shown at time t. withAnn false draws the picture without annotations (the copy kept
  // for editing them later).
  function drawFrame(ctx, source, st, k, t, withAnn) {
    var c = st.crop;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    setOrient(ctx, c, st.orient, k);
    ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, c.w * k, c.h * k);
    // Redactions: opaque fills in the same transform, so they land exactly where they were drawn on the source.
    (st.redact || []).forEach(function (r) {
      var q = clampRect(r, c); if (q.w <= 0 || q.h <= 0) return;
      ctx.fillStyle = r.c === 'grey' ? '#7A7A7A' : '#000';
      // Half a pixel wider on every side at the output scale, so no anti-aliased edge of the identifier survives.
      ctx.fillRect((q.x - c.x) * k - 0.5, (q.y - c.y) * k - 0.5, q.w * k + 1, q.h * k + 1);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (withAnn === false) return;
    var W = ctx.canvas.width, H = ctx.canvas.height;
    (st.ann || []).forEach(function (a) { if (annAt(a, t)) drawAnn(ctx, a, W, H); });
  }
  // Bounds of an annotation in output pixels (W x H), for selection and hit testing.
  function annBounds(ctx, a, W, H) {
    var m = Math.min(W, H);
    // A small annotation still has a finger-sized area to pick it up by (about 6% of the picture's shorter side).
    var grow = function (b) { var need = m * 0.06; if (b.w < need) { b.x -= (need - b.w) / 2; b.w = need; } if (b.h < need) { b.y -= (need - b.h) / 2; b.h = need; } return b; };
    if (a.type === 'text') { var fs = textSize(ctx, a, W, H); ctx.font = fontFor(fs); var tw = ctx.measureText(a.text || '').width; return grow({ x: a.x * W - tw / 2 - fs * 0.4, y: a.y * H - fs * 0.75, w: tw + fs * 0.8, h: fs * 1.5 }); }
    if (a.type === 'dot') { var r = sizeOf(a) * m * 0.32 + m * 0.02; return grow({ x: a.x * W - r, y: a.y * H - r, w: r * 2, h: r * 2 }); }
    if (a.type === 'picto') { var s = Math.min(sizeOf(a), 0.96) * m; return grow({ x: a.x * W - s / 2, y: a.y * H - s / 2, w: s, h: s }); }
    if (a.type === 'arrow') { var pad = m * 0.03, x1 = Math.min(a.x, a.x2) * W, y1 = Math.min(a.y, a.y2) * H; return { x: x1 - pad, y: y1 - pad, w: Math.abs(a.x2 - a.x) * W + pad * 2, h: Math.abs(a.y2 - a.y) * H + pad * 2 }; }
    var p2 = m * 0.02; return { x: a.x * W - p2, y: a.y * H - p2, w: a.w * W + p2 * 2, h: a.h * H + p2 * 2 };
  }
  function distToSeg(px, py, x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0; return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
  // The topmost annotation under output point (x, y) at time t, or -1.
  function hit(ctx, ann, W, H, x, y, t) {
    var m = Math.min(W, H);
    for (var i = ann.length - 1; i >= 0; i--) {
      var a = ann[i]; if (!annAt(a, t)) continue;
      if (a.type === 'arrow') { if (distToSeg(x, y, a.x * W, a.y * H, a.x2 * W, a.y2 * H) < m * 0.04) return i; continue; }
      var b = annBounds(ctx, a, W, H);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  }
  function describe(a, T) {
    T = T || function (x) { return x; };
    if (a.type === 'text') return '“' + a.text + '”';
    if (a.type === 'picto') return T((PICTO[a.picto] || {}).label || 'Pictogram');
    return T({ arrow: 'Arrow', dot: 'Dot', circle: 'Circle', rect: 'Box' }[a.type] || a.type);
  }
  // Annotation data kept with a saved photo or clip: only what is needed to draw them again. Text is clipped, numbers
  // are rounded, unknown fields are dropped (so nothing else can ride along into backups).
  // Annotations from storage or a backup file: only known shapes and fields, every number finite and within range, so
  // a damaged or hand-made file cannot throw or draw something absurd.
  function cleanAnn(list) {
    var num = function (v, lo, hi) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 1e4) / 1e4)) : null; };
    var bad = false;
    var out = (Array.isArray(list) ? list : []).slice(0, 60).map(function (a) {
      if (!a || typeof a !== 'object' || TYPES.indexOf(a.type) < 0) return null;
      bad = false;
      var n = function (v, lo, hi) { var r = num(v, lo, hi); if (r === null) bad = true; return r; };
      // A named colour (1.0.12, 1.0.13) or a #rrggbb from the colour picker (1.0.14); anything else is white.
      var o = { type: a.type, x: n(a.x, 0, 1), y: n(a.y, 0, 1), color: typeof a.color === 'string' && COLOURS.hasOwnProperty(a.color) ? a.color : hexOf(a.color) || 'white' };
      if (a.type === 'text') { o.text = String(a.text == null ? '' : a.text).slice(0, 80); o.bg = a.bg === 'box' ? 'box' : 'outline'; if (o.bg === 'box' && hexOf(a.bgc)) o.bgc = hexOf(a.bgc); }
      if (a.type === 'arrow') { o.x2 = n(a.x2, 0, 1); o.y2 = n(a.y2, 0, 1); }
      if (a.type === 'circle' || a.type === 'rect') { o.w = n(a.w, -1, 1); o.h = n(a.h, -1, 1); }
      if (a.type === 'picto') { if (typeof a.picto !== 'string' || !PICTO.hasOwnProperty(a.picto)) return null; o.picto = a.picto; if (a.flip) o.flip = true; }
      if (a.size != null && a.size !== 0) o.size = n(a.size, 0.01, 1);
      if (a.rot) { var rt = num(a.rot, -3600, 3600); if (rt !== null) o.rot = Math.round(rt) % 360; }
      if (a.t0 != null) { var t0 = num(a.t0, 0, 600); if (t0 !== null) o.t0 = Math.round(t0 * 100) / 100; }
      if (a.t1 != null) { var t1 = num(a.t1, 0, 600); if (t1 !== null) o.t1 = Math.round(t1 * 100) / 100; }
      return bad ? null : o;
    });
    return out.filter(Boolean);
  }

  root.WLEditor = {
    orientAfter: orientAfter, composeOrient: composeOrient, outSize: outSize, setOrient: setOrient, toSrc: toSrc, toOut: toOut, rectToSrc: rectToSrc, clampRect: clampRect,
    mapAnnotations: mapAnnotations, annAt: annAt, drawFrame: drawFrame, drawAnn: drawAnn, annBounds: annBounds, hit: hit, describe: describe, cleanAnn: cleanAnn,
    COLOURS: COLOURS, SIZES: SIZES, POS: POS, RANGE: RANGE, sizeBase: sizeBase, sizeOf: sizeOf, sizeAt: sizeAt, posOf: posOf, snapPos: snapPos, textSize: textSize,
    hexOf: hexOf, luminance: luminance, contrast: contrast, edgeFor: edgeFor, hslHex: hslHex, BOX: BOX, ZOOM: ZOOM, clampView: clampView, pinchView: pinchView, PICTOS: PICTOS, PICTO: PICTO, PRESETS: PRESETS, GROUP_LABEL: GROUP_LABEL, groupsFor: groupsFor, pictosFor: pictosFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
