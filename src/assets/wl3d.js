/* Wavelength 3D: the ultrasound field, curved-array probe and floating logo on the homepage hero, and the slim
   field band on Pearl pages. Plain WebGL 1, no library. WL3D.hero(canvas, opts) and WL3D.band(canvas, opts). */
(function () {
  'use strict';

  // ---------- vectors and matrices (column-major) ----------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  // Perspective with a lens shift (sx, sy in screen halves) so the scene can sit off centre behind the text.
  function persp(fov, asp, n, f, sx, sy) {
    var t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
    return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, -sx, -sy, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
  }
  function lookAt(e, c, u) {
    var z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  }
  function basis(X, Y, Z, p, s) {
    return new Float32Array([X[0] * s, X[1] * s, X[2] * s, 0, Y[0] * s, Y[1] * s, Y[2] * s, 0, Z[0] * s, Z[1] * s, Z[2] * s, 0, p[0], p[1], p[2], 1]);
  }

  // ---------- geometry ----------
  // A closed grid: rings of U points each. Normals from the faces, turned to point away from each ring's centre.
  function grid(rings, centres, mats) {
    var U = rings[0].length, V = rings.length, pos = [], mat = [], idx = [], i, j;
    for (j = 0; j < V; j++) for (i = 0; i < U; i++) { pos.push(rings[j][i][0], rings[j][i][1], rings[j][i][2]); mat.push(mats[j]); }
    for (j = 0; j < V - 1; j++) for (i = 0; i < U; i++) {
      var a = j * U + i, b = j * U + (i + 1) % U, c = a + U, d = b + U;
      idx.push(a, b, d, a, d, c);
    }
    var nrm = normals(pos, idx);
    for (j = 0; j < V; j++) for (i = 0; i < U; i++) {
      var k = (j * U + i) * 3, out = sub([pos[k], pos[k + 1], pos[k + 2]], centres[j]);
      if (dot(out, [nrm[k], nrm[k + 1], nrm[k + 2]]) < 0) { nrm[k] = -nrm[k]; nrm[k + 1] = -nrm[k + 1]; nrm[k + 2] = -nrm[k + 2]; }
    }
    return { pos: pos, nrm: nrm, mat: mat, idx: idx };
  }
  function normals(pos, idx) {
    var n = new Array(pos.length).fill(0);
    for (var f = 0; f < idx.length; f += 3) {
      var a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      var fn = cross(sub([pos[b], pos[b + 1], pos[b + 2]], [pos[a], pos[a + 1], pos[a + 2]]), sub([pos[c], pos[c + 1], pos[c + 2]], [pos[a], pos[a + 1], pos[a + 2]]));
      for (var q = 0; q < 3; q++) { var v = idx[f + q] * 3; n[v] += fn[0]; n[v + 1] += fn[1]; n[v + 2] += fn[2]; }
    }
    for (var i = 0; i < n.length; i += 3) { var m = norm([n[i], n[i + 1], n[i + 2]]); n[i] = m[0]; n[i + 1] = m[1]; n[i + 2] = m[2]; }
    return n;
  }
  function merge(parts) {
    var out = { pos: [], nrm: [], mat: [], idx: [] };
    parts.forEach(function (p) {
      var base = out.pos.length / 3;
      Array.prototype.push.apply(out.pos, p.pos); Array.prototype.push.apply(out.nrm, p.nrm); Array.prototype.push.apply(out.mat, p.mat);
      for (var i = 0; i < p.idx.length; i++) out.idx.push(p.idx[i] + base);
    });
    return out;
  }
  // Catmull-Rom through station values.
  function station(ys, vs, y) {
    var i = 0; while (i < ys.length - 2 && y > ys[i + 1]) i++;
    var t = Math.max(0, Math.min(1, (y - ys[i]) / (ys[i + 1] - ys[i])));
    var p0 = vs[Math.max(0, i - 1)], p1 = vs[i], p2 = vs[i + 1], p3 = vs[Math.min(vs.length - 1, i + 2)];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  // Tube along a list of points, with frames carried along the curve.
  function tube(pts, radius, U, matId) {
    var rings = [], centres = [], mats = [], N = null;
    for (var j = 0; j < pts.length; j++) {
      var T = norm(sub(pts[Math.min(pts.length - 1, j + 1)], pts[Math.max(0, j - 1)]));
      if (!N) N = norm(cross(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      N = norm(sub(N, mul(T, dot(N, T))));
      var B = cross(T, N), r = typeof radius === 'function' ? radius(j / (pts.length - 1)) : radius, ring = [];
      for (var i = 0; i < U; i++) { var a = i / U * Math.PI * 2; ring.push(add(pts[j], add(mul(N, Math.cos(a) * r), mul(B, Math.sin(a) * r)))); }
      rings.push(ring); centres.push(pts[j]); mats.push(matId);
    }
    return grid(rings, centres, mats);
  }
  function bezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return [0, 1, 2].map(function (k) { return u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]; });
  }

  // Material ids: 0 shell, 1 lens rubber, 2 cable and strain relief, 3 teal band, 4 orientation marker, 5 groove,
  // 6 logo wave, 7 logo ring.
  var SAG = 0.2, A0 = 0.78;
  function probe(small) {
    var U = small ? 48 : 72;
    // Local frame: y runs from the curved lens (0) to the tail; x is the long axis of the lens; z the thickness.
    var ys = [0, 0.3, 0.58, 0.98, 1.3, 1.72, 2.16, 2.5, 2.74, 2.9];
    var as = [0.78, 0.8, 0.77, 0.52, 0.41, 0.37, 0.4, 0.34, 0.23, 0.17];
    var bs = [0.25, 0.26, 0.265, 0.27, 0.275, 0.265, 0.275, 0.25, 0.2, 0.165];
    var ns = [3.4, 3.4, 3.2, 2.8, 2.5, 2.4, 2.4, 2.3, 2.1, 2];
    var RB = 0.07, rings = [], centres = [], mats = [], rows = [], j;
    for (j = 0; j <= 8; j++) { var th = j / 8 * Math.PI / 2; rows.push([RB * (1 - Math.cos(th)), RB * (1 - Math.sin(th))]); }
    var NV = small ? 90 : 140;
    for (j = 1; j <= NV; j++) rows.push([RB + (2.9 - RB) * j / NV, 0]);
    rows.forEach(function (r) {
      var y = r[0], a = station(ys, as, y) - r[1], b = station(ys, bs, y) - r[1], n = station(ys, ns, y), ring = [];
      var fade = 1 - smooth(0, 0.62, y);
      for (var i = 0; i < U; i++) {
        var ph = i / U * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph);
        var x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), z = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
        // The orientation marker: a small raised ridge on one side of the head.
        var bump = Math.exp(-Math.pow((y - 0.36) / 0.07, 2)) * Math.pow(Math.max(0, c), 24) * 0.035;
        x += bump;
        ring.push([x, y + SAG * Math.pow(x / A0, 2) * fade, z]);
      }
      rings.push(ring); centres.push([0, y + 0.1, 0]);
      mats.push(y < 0.11 ? 1 : y < 0.132 ? 5 : (y > 2.53 && y < 2.6) ? 3 : 0);
    });
    var body = grid(rings, centres, mats);
    // The marker ridge gets its own colour.
    for (var v = 0; v < body.pos.length / 3; v++) {
      var px = body.pos[v * 3], py = body.pos[v * 3 + 1] - SAG * Math.pow(px / A0, 2) * (1 - smooth(0, 0.62, body.pos[v * 3 + 1]));
      if (Math.abs(py - 0.36) < 0.06 && px > station(ys, as, 0.36) - 0.01 && Math.abs(body.pos[v * 3 + 2]) < 0.12) body.mat[v] = 4;
    }
    // The lens face: convex along x, slightly domed across z, closing the bottom ring.
    var K = 10, cap = [], cc = [], cm = [], bottom = rings[0];
    for (var k = K; k >= 0; k--) {
      var sc = k / K, ring2 = [];
      for (var i2 = 0; i2 < U; i2++) {
        var bx = bottom[i2][0] * sc, bz = bottom[i2][2] * sc;
        ring2.push([bx, SAG * Math.pow(bx / A0, 2) - 0.035 * (1 - sc * sc), bz]);
      }
      cap.push(ring2); cc.push([0, 0.6, 0]); cm.push(1);
    }
    var lens = grid(cap, cc, cm);
    for (var q = 0; q < lens.nrm.length; q += 3) if (lens.nrm[q + 1] > 0) { lens.nrm[q] *= -1; lens.nrm[q + 1] *= -1; lens.nrm[q + 2] *= -1; }
    // Strain relief: a ribbed taper from the tail into the cable.
    var sr = [], sc2 = [], sm = [], NS = small ? 40 : 70;
    for (j = 0; j <= NS; j++) {
      var yy = 2.84 + 0.72 * j / NS, f = j / NS;
      var rad = 0.168 - 0.088 * smooth(0, 1, f) + 0.011 * Math.pow(0.5 + 0.5 * Math.cos(f * Math.PI * 2 * 9), 3) * (f > 0.12 ? 1 : 0), ring3 = [];
      for (var i3 = 0; i3 < U; i3++) { var a3 = i3 / U * Math.PI * 2; ring3.push([Math.cos(a3) * rad, yy, Math.sin(a3) * rad]); }
      sr.push(ring3); sc2.push([0, yy, 0]); sm.push(2);
    }
    var relief = grid(sr, sc2, sm);
    // Cable: leaves the tail, drops towards the floor and runs out of frame.
    var ctrl = [[0, 3.5, 0], [0.02, 4.3, -0.1], [0.3, 5.2, -0.3], [1.6, 6.4, -0.6], [2.9, 6.8, -0.8], [4.7, 7.2, -1], [6.4, 7.6, -1.1], [9, 8, -1.2]], cp = [];
    for (var s = 0; s < ctrl.length - 1; s++) for (var t = 0; t < 1; t += 0.05) {
      cp.push([0, 1, 2].map(function (k2) {
        var p0 = ctrl[Math.max(0, s - 1)][k2], p1 = ctrl[s][k2], p2 = ctrl[s + 1][k2], p3 = ctrl[Math.min(ctrl.length - 1, s + 2)][k2];
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      }));
    }
    var cable = tube(cp, 0.075, small ? 12 : 16, 2);
    return merge([body, lens, relief, cable]);
  }
  // The Wavelength mark: the logo wave as a tube inside a thin ring (SVG path from the site logo, 64 units wide).
  function mark() {
    var P = function (x, y) { return [(x - 32) / 10, -(y - 32) / 10, 0]; };
    var segs = [[P(12.5, 20.5), P(14, 31), P(15.5, 44), P(19, 44)], [P(19, 44), P(24, 44), P(26.5, 22.5), P(32, 22.5)],
      [P(32, 22.5), P(37.5, 22.5), P(40, 44), P(45, 44)], [P(45, 44), P(48.5, 44), P(50, 31), P(51.5, 20.5)]];
    var pts = [];
    segs.forEach(function (sg, si) { for (var i = si ? 1 : 0; i <= 60; i++) pts.push(bezier(sg[0], sg[1], sg[2], sg[3], i / 60)); });
    var wave = tube(pts, function (t) { var e = Math.min(t, 1 - t); return 0.13 * Math.sqrt(Math.min(1, e / 0.012)); }, 14, 6);
    var ring = [], rc = [], rm = [], R = 3.0, r = 0.045;
    for (var j = 0; j <= 160; j++) {
      var a = j / 160 * Math.PI * 2, c = [Math.cos(a) * R, Math.sin(a) * R, 0], out = [Math.cos(a), Math.sin(a), 0], rr = [];
      for (var i = 0; i < 10; i++) { var b = i / 10 * Math.PI * 2; rr.push(add(c, add(mul(out, Math.cos(b) * r), [0, 0, Math.sin(b) * r]))); }
      ring.push(rr); rc.push(c); rm.push(7);
    }
    return merge([wave, grid(ring, rc, rm)]);
  }

  // ---------- shaders ----------
  var MESH_VS = [
    'attribute vec3 aPos; attribute vec3 aNrm; attribute float aMat;',
    'uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj;',
    'varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying float vM;',
    'void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = (uModel * vec4(aNrm, 0.0)).xyz;',
    '  vL = aPos; vLN = aNrm; vM = aMat; gl_Position = uProj * uView * w; }'
  ].join('\n');
  var MESH_FS = [
    'precision highp float;',
    'uniform vec3 uCam; uniform sampler2D uDecal; uniform float uGlow;',
    'varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying float vM;',
    // A dark studio: a large softbox overhead, a tall strip light on the left, a teal glow rising from the field.
    'vec3 env(vec3 r, float ro){',
    '  float w = 0.04 + ro * 0.45;',
    '  vec3 c = mix(vec3(0.012, 0.02, 0.035), vec3(0.07, 0.09, 0.13), smoothstep(-0.3, 0.9, r.y));',
    '  float box = smoothstep(0.80 - w, 0.80 + w, dot(r, normalize(vec3(-0.25, 1.0, 0.35))));',
    '  float az = atan(r.x, r.z);',
    '  float strip = smoothstep(0.16 + w, 0.10 - w * 0.5, abs(az + 1.25)) * smoothstep(-0.45 - w, -0.25, r.y) * smoothstep(0.75 + w, 0.55, r.y);',
    '  float rim = smoothstep(0.14 + w, 0.06, abs(az - 2.3)) * smoothstep(-0.3, 0.1, r.y) * smoothstep(0.6, 0.3, r.y);',
    '  c += vec3(1.0, 0.98, 0.95) * box * 3.2 + vec3(0.95, 0.97, 1.0) * strip * 2.2 + vec3(0.45, 0.85, 0.9) * rim * 1.4;',
    '  c += vec3(0.08, 0.32, 0.36) * smoothstep(-0.1, -0.7, r.y) * (0.6 + uGlow);',
    '  return c; }',
    'void main(){',
    '  vec3 N = normalize(vN); vec3 V = normalize(uCam - vW); if (dot(N, V) < 0.0) N = -N;',
    '  vec3 base = vec3(0.80, 0.80, 0.78); float ro = 0.22; float f0 = 0.05; vec3 em = vec3(0.0); float spec = 1.0;',
    '  if (vM > 0.5 && vM < 1.5) { base = vec3(0.035, 0.045, 0.06); ro = 0.55; f0 = 0.04; }',
    '  else if (vM > 1.5 && vM < 2.5) { base = vec3(0.03, 0.033, 0.04); ro = 0.42; f0 = 0.04; }',
    '  else if (vM > 2.5 && vM < 3.5) { base = vec3(0.05, 0.36, 0.40); ro = 0.25; }',
    '  else if (vM > 3.5 && vM < 4.5) { base = vec3(0.06, 0.4, 0.45); em = vec3(0.10, 0.45, 0.5) * 0.9; ro = 0.3; }',
    '  else if (vM > 4.5 && vM < 5.5) { base = vec3(0.12, 0.13, 0.14); ro = 0.5; }',
    '  else if (vM > 5.5 && vM < 6.5) { base = vec3(0.10, 0.45, 0.50); em = vec3(0.12, 0.42, 0.46) * 0.75; ro = 0.18; }',
    '  else if (vM > 6.5) { base = vec3(0.0); em = vec3(0.55, 0.54, 0.52); spec = 0.0; }',
    '  if (vM < 0.5 && vLN.z > 0.55) {',
    '    vec2 uv = vec2(vL.x / 0.44 + 0.5, 0.5 - (vL.y - 1.56) / 0.44);',
    '    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) { vec4 d = texture2D(uDecal, uv); base = mix(base, d.rgb, d.a); }',
    '  }',
    '  float ndv = max(dot(N, V), 0.0); vec3 R = reflect(-V, N);',
    '  vec3 L = normalize(vec3(-0.5, 0.95, 0.55)); float dif = max(dot(N, L), 0.0);',
    '  vec3 hemi = mix(vec3(0.03, 0.10, 0.12), vec3(0.20, 0.23, 0.28), N.y * 0.5 + 0.5);',
    '  vec3 col = base * (hemi + dif * vec3(1.0, 0.97, 0.93) * 1.05) + em;',
    '  float F = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);',
    '  col += env(R, ro) * F * spec;',
    '  vec3 H = normalize(L + V); col += pow(max(dot(N, H), 0.0), mix(600.0, 30.0, ro)) * (1.0 - ro) * 0.9 * spec;',
    '  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);',
    '  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.4545)), 1.0);',
    '}'
  ].join('\n');
  var PTS_VS = [
    'uniform mat4 uView; uniform mat4 uProj; uniform float uTime; uniform vec2 uSrc; uniform float uAng; uniform float uPix;',
    'uniform float uWidth; uniform float uReach;',
    'attribute vec3 aPos; attribute float aRand; varying float vB; varying float vH; varying float vR; varying float vF;',
    'void main(){',
    '  vec3 p = aPos; vec2 d = p.xz - uSrc; float r = length(d);',
    '  float a = atan(d.x, d.y);',
    '  float da = abs(mod(a - uAng + 3.14159265, 6.2831853) - 3.14159265);',
    '  float beam = smoothstep(uWidth, uWidth * 0.68, da) * smoothstep(0.3, 1.3, r) * smoothstep(uReach, uReach * 0.6, r);',
    '  float wave = sin(r * 2.1 - uTime * 2.6) * exp(-r * 0.075) * 0.85;',
    '  float speckle = (sin(p.x * 1.7 + uTime * 0.9 + aRand * 6.28) * 0.5 + sin(p.z * 2.3 - uTime * 0.6 + aRand * 3.1) * 0.5) * 0.16;',
    '  float h = mix(speckle, wave, beam);',
    '  p.y += h; vB = beam; vH = h; vR = aRand;',
    '  vec4 mv = uView * vec4(p, 1.0);',
    '  vF = smoothstep(30.0, 12.0, -mv.z) + exp(-r * r * 0.9) * 1.4;',
    '  gl_PointSize = uPix * (0.9 + beam * 1.3) * (9.0 / -mv.z);',
    '  gl_Position = uProj * mv;',
    '}'
  ].join('\n');
  var PTS_FS = [
    'precision mediump float;',
    'uniform vec3 cDim; uniform vec3 cBeam; uniform vec3 cCrest;',
    'varying float vB; varying float vH; varying float vR; varying float vF;',
    'void main(){',
    '  float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;',
    '  float soft = smoothstep(0.5, 0.05, d);',
    '  vec3 col = mix(cDim, mix(cBeam, cCrest, smoothstep(-0.1, 0.75, vH)), vB);',
    '  float alpha = mix(0.18 + vR * 0.22, 0.95, vB) * vF;',
    '  vec3 c = col * alpha * soft; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));',
    '}'
  ].join('\n');

  // ---------- GL plumbing ----------
  function context(canvas, transparent) {
    var o = { antialias: true, alpha: !!transparent, powerPreference: 'low-power' };
    try { return canvas.getContext('webgl', o) || canvas.getContext('experimental-webgl', o); } catch (e) { return null; }
  }
  function program(gl, vs, fs) {
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }
  function buffer(gl, data, el) {
    var b = gl.createBuffer(), t = el ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    gl.bindBuffer(t, b); gl.bufferData(t, data, gl.STATIC_DRAW); return b;
  }
  function attrib(gl, prog, name, buf, size) {
    var loc = gl.getAttribLocation(prog.p, name); if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function meshBuffers(gl, g) {
    var big = g.pos.length / 3 > 65535;
    return { pos: buffer(gl, new Float32Array(g.pos)), nrm: buffer(gl, new Float32Array(g.nrm)), mat: buffer(gl, new Float32Array(g.mat)),
      idx: buffer(gl, big ? new Uint32Array(g.idx) : new Uint16Array(g.idx), true), n: g.idx.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
  function drawMesh(gl, prog, m, model) {
    attrib(gl, prog, 'aPos', m.pos, 3); attrib(gl, prog, 'aNrm', m.nrm, 3); attrib(gl, prog, 'aMat', m.mat, 1);
    gl.uniformMatrix4fv(prog.u.uModel, false, model);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx); gl.drawElements(gl.TRIANGLES, m.n, m.type, 0);
  }
  function field(gl, NX, NZ, W, D, z0) {
    var n = NX * NZ, pos = new Float32Array(n * 3), rnd = new Float32Array(n), k = 0;
    for (var z = 0; z < NZ; z++) for (var x = 0; x < NX; x++) {
      pos[k * 3] = (x / (NX - 1) - 0.5) * W + (Math.random() - 0.5) * W / NX * 0.5; pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = z0 - (z / (NZ - 1)) * D; rnd[k] = Math.random(); k++;
    }
    return { pos: buffer(gl, pos), rnd: buffer(gl, rnd), n: n };
  }
  function decal() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d');
    x.lineCap = 'round'; x.strokeStyle = '#2A4A6B'; x.lineWidth = 7;
    x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.stroke();
    x.save(); x.translate(128, 128); x.scale(3.7, 3.7); x.translate(-32, -32);
    x.strokeStyle = '#2A7F8A'; x.lineWidth = 3.6;
    if (window.Path2D) x.stroke(new Path2D('M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5'));
    x.restore();
    return c;
  }
  function texture(gl, img) {
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function hex(h) { var n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

  // Runs frame(t) while the canvas is on screen and the tab is visible; one still frame with reduced motion.
  function run(canvas, resize, frame) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var visible = true, t0 = performance.now(), queued = false;
    function tick(now) { queued = false; if (!visible || document.hidden) return; frame((now - t0) / 1000); queue(); }
    function queue() { if (!queued && !reduce) { queued = true; requestAnimationFrame(tick); } }
    resize();
    function again() { resize(); if (reduce) frame(2.4); }
    if ('ResizeObserver' in window) new ResizeObserver(again).observe(canvas); else window.addEventListener('resize', again);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);
    if (reduce) { frame(2.4); return; }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) queue(); }).observe(canvas);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) queue(); });
    queue();
  }
  function sizeCanvas(gl, canvas, cap) {
    var dpr = Math.min(window.devicePixelRatio || 1, cap), w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    return { w: w, h: h, dpr: dpr };
  }

  // ---------- the homepage hero ----------
  // opts: pointer (element that steers the beam), onAngle(deg, depthCm). Returns false when WebGL is unavailable.
  function hero(canvas, opts) {
    opts = opts || {};
    var gl = context(canvas); if (!gl) return false;
    var big = gl.getExtension('OES_element_index_uint');
    var meshProg, ptsProg;
    try { meshProg = program(gl, MESH_VS, MESH_FS); ptsProg = program(gl, PTS_VS, PTS_FS); } catch (e) { return false; }
    var small = window.innerWidth < 760;
    var probeG = probe(small);
    if (probeG.pos.length / 3 > 65535 && !big) return false;
    var probeM = meshBuffers(gl, probeG), markM = meshBuffers(gl, mark());
    var pts = small ? field(gl, 110, 80, 26, 17, 2.6) : field(gl, 180, 120, 28, 18, 2.6);
    var tex = texture(gl, decal());
    var SRC = [0, 0.3], ang = Math.PI, target = Math.PI, lastMove = -1e9, layout = {}, dpr = 1;

    function resize() {
      var s = sizeCanvas(gl, canvas, 2); dpr = s.dpr;
      var narrow = s.w < 760;
      // Frame the scene inside the stage element (the right-hand column, or the space under the words on a phone).
      var cr = canvas.getBoundingClientRect(), st = (opts.stage || canvas).getBoundingClientRect();
      var cx = (st.left + st.width / 2 - cr.left) / cr.width * 2 - 1, cy = 1 - (st.top + st.height / 2 - cr.top) / cr.height * 2;
      var zoom = cr.height / Math.max(1, st.height);
      layout = narrow
        ? { fov: 0.78, az: -0.08, el: 0.42, dist: 14, at: [1.4, 1.4, -2.4], mark: [-0.4, 3.6, -6.8], ms: 0.4, tilt: 0.75, ps: 1.0 }
        : { fov: 0.58, az: -0.08, el: 0.38, dist: 14, at: [1.6, 1.5, -2.2], mark: [0.2, 3.5, -6.8], ms: 0.42, tilt: 0.75, ps: 0.92 };
      layout.asp = s.w / s.h; layout.sx = cx; layout.sy = cy; layout.fov = 2 * Math.atan(Math.tan(layout.fov / 2) * zoom);
    }
    function steer(e) {
      var r = canvas.getBoundingClientRect();
      var cx = r.left + r.width * (layout.sx + 1) / 2;
      var nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 0.35)));
      target = Math.PI + nx * 0.75; lastMove = performance.now();
    }
    var el = opts.pointer || canvas;
    el.addEventListener('pointermove', steer); el.addEventListener('pointerdown', steer);

    var lastDeg = null;
    function frame(t) {
      if (performance.now() - lastMove > 2600) target = Math.PI + Math.sin(t * 0.35) * 0.55;
      ang += (target - ang) * 0.06;
      var off = ang - Math.PI;
      var scroll = Math.min(1, (window.scrollY || 0) / Math.max(1, canvas.clientHeight));
      var az = layout.az + off * 0.35, el = layout.el + scroll * 0.25, at = layout.at;
      var eye = [at[0] + Math.sin(az) * Math.cos(el) * layout.dist, at[1] + Math.sin(el) * layout.dist, at[2] + Math.cos(az) * Math.cos(el) * layout.dist];
      var view = lookAt(eye, at, [0, 1, 0]);
      var proj = persp(layout.fov, layout.asp, 0.1, 80, layout.sx, layout.sy);

      gl.clearColor(0.039, 0.082, 0.149, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);

      gl.useProgram(meshProg.p);
      gl.uniformMatrix4fv(meshProg.u.uView, false, view); gl.uniformMatrix4fv(meshProg.u.uProj, false, proj);
      gl.uniform3fv(meshProg.u.uCam, eye); gl.uniform1f(meshProg.u.uGlow, 0.5 + 0.5 * Math.sin(t * 2.6));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(meshProg.u.uDecal, 0);
      // The probe is held as a hand would hold it: lens on the field at the apex of the beam, body leaning out to the
      // side so it is seen in profile, the logo face towards the viewer.
      var dir = [Math.sin(ang), 0, Math.cos(ang)], side = [-Math.cos(ang), 0, Math.sin(ang)], tilt = layout.tilt + Math.sin(t * 0.8) * 0.025;
      var Y = norm(add(mul(side, Math.cos(tilt)), [0, Math.sin(tilt), 0]));
      var back = mul(dir, -1), Z = norm(sub(back, mul(Y, dot(back, Y)))), X = cross(Y, Z);
      var roll = Math.sin(t * 0.6) * 0.06; Z = norm(add(Z, mul(X, roll))); X = cross(Y, Z);
      var lens = [SRC[0] - X[0] * 0.05, 0.12 + Math.sin(t * 1.1) * 0.015, SRC[1] - X[2] * 0.05];
      drawMesh(gl, meshProg, probeM, basis(X, Y, Z, lens, layout.ps));
      var ma = Math.sin(t * 0.3) * 0.45, mc = Math.cos(ma), ms = Math.sin(ma), mp = layout.mark;
      drawMesh(gl, meshProg, markM, basis([mc, 0, -ms], [0, 1, 0], [ms, 0, mc], [mp[0], mp[1] + Math.sin(t * 0.9) * 0.08, mp[2]], layout.ms));

      gl.useProgram(ptsProg.p); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(ptsProg.u.uView, false, view); gl.uniformMatrix4fv(ptsProg.u.uProj, false, proj);
      gl.uniform1f(ptsProg.u.uTime, t); gl.uniform2fv(ptsProg.u.uSrc, SRC); gl.uniform1f(ptsProg.u.uAng, ang);
      gl.uniform1f(ptsProg.u.uPix, 1.7 * dpr * layout.dist / 11); gl.uniform1f(ptsProg.u.uWidth, 0.44); gl.uniform1f(ptsProg.u.uReach, 15);
      gl.uniform3fv(ptsProg.u.cDim, [0.227, 0.337, 0.447]); gl.uniform3fv(ptsProg.u.cBeam, [0.165, 0.498, 0.541]); gl.uniform3fv(ptsProg.u.cCrest, [0.81, 0.937, 0.949]);
      attrib(gl, ptsProg, 'aPos', pts.pos, 3); attrib(gl, ptsProg, 'aRand', pts.rnd, 1);
      gl.drawArrays(gl.POINTS, 0, pts.n);

      var deg = Math.round(off * 57.3);
      if (opts.onAngle && deg !== lastDeg) { lastDeg = deg; opts.onAngle(deg, 4 + Math.abs(off) * 1.5); }
    }
    run(canvas, resize, frame);
    return true;
  }

  // ---------- the Pearl band: the field only, seen low and side on, tinted by topic ----------
  function band(canvas, opts) {
    opts = opts || {};
    var gl = context(canvas, true); if (!gl) return false;
    var prog; try { prog = program(gl, PTS_VS, PTS_FS); } catch (e) { return false; }
    var pts = field(gl, 170, 34, 34, 9, 3), dpr = 1, asp = 1, ang = Math.PI / 2;
    var tint = hex(opts.tint || '#2A7F8A'), crest = hex(opts.crest || '#CFEFF2');
    function resize() { var s = sizeCanvas(gl, canvas, 2); dpr = s.dpr; asp = s.w / s.h; }
    function frame(t) {
      ang = Math.PI / 2 + Math.sin(t * 0.3) * 0.12;
      var view = lookAt([0, 2.2, 7.5], [0, 0, -1.2], [0, 1, 0]), proj = persp(0.5, asp, 0.1, 60, 0, 0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(prog.u.uView, false, view); gl.uniformMatrix4fv(prog.u.uProj, false, proj);
      gl.uniform1f(prog.u.uTime, t); gl.uniform2fv(prog.u.uSrc, [-17, -1.5]); gl.uniform1f(prog.u.uAng, ang);
      gl.uniform1f(prog.u.uPix, 1.5 * dpr); gl.uniform1f(prog.u.uWidth, 0.5); gl.uniform1f(prog.u.uReach, 40);
      gl.uniform3fv(prog.u.cDim, [0.2, 0.29, 0.39]); gl.uniform3fv(prog.u.cBeam, tint); gl.uniform3fv(prog.u.cCrest, crest);
      attrib(gl, prog, 'aPos', pts.pos, 3); attrib(gl, prog, 'aRand', pts.rnd, 1);
      gl.drawArrays(gl.POINTS, 0, pts.n);
    }
    run(canvas, resize, frame);
    return true;
  }

  window.WL3D = { hero: hero, band: band };
})();
