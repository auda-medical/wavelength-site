// Version 4 music engine: original procedural synthesis written for Wavelength (no samples, no sample libraries, no
// third-party presets or loops), so the music is entirely Auda Medical's to use. Instruments are modelled from first
// principles: a felt piano (inharmonic additive partials, two-stage decay), Karplus-Strong plucked strings, mallets
// (marimba and vibraphone partial ratios), soft additive pads in the middle register, short rounded bass notes,
// and light percussion (soft kick, shaker, wooden tap, soft clap). Effects: RBJ biquads, a Freeverb-style stereo
// reverb and a ping-pong delay. Deterministic: the same input always gives the same file.
import fs from 'node:fs';
import path from 'node:path';

export const RATE = 48000;
export const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }
const TAU = 2 * Math.PI;

// ---------- Filters ----------
export function biq(type, f, q = 0.707, gainDb = 0) {
  const w = TAU * f / RATE, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'peak') { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
  else if (type === 'lowshelf') { const r = 2 * Math.sqrt(A) * a; b0 = A * ((A + 1) - (A - 1) * c + r); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - r); a0 = (A + 1) + (A - 1) * c + r; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - r; }
  else if (type === 'highshelf') { const r = 2 * Math.sqrt(A) * a; b0 = A * ((A + 1) + (A - 1) * c + r); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - r); a0 = (A + 1) - (A - 1) * c + r; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - r; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
export function filt(x, k) {
  const [b0, b1, b2, a1, a2] = k; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v; }
  return x;
}

// ---------- Instruments (each returns a mono Float32Array starting at the note-on) ----------
// Felt piano: inharmonic partials (B), strike-position comb, brightness from velocity, two-stage decay, damper.
export function piano(f, dur, vel = 0.7, { felt = 0.5, ring = 1 } = {}) {
  const T1 = Math.min(9, Math.max(1.4, 7 * Math.pow(262 / f, 0.55))) * ring;
  const len = Math.round(Math.min(dur + 0.5, T1 * 0.9 + 0.3) * RATE);
  const out = new Float32Array(len);
  const B = 0.0004, N = Math.min(16, Math.floor(7000 / f));
  const att = 0.0015 + felt * 0.006, rel = 0.16;
  for (let n = 1; n <= N; n++) {
    const fn = n * f * Math.sqrt(1 + B * n * n);
    const amp = Math.pow(n, -(1.05 + felt * 0.9 + (1 - vel) * 0.6)) * Math.abs(Math.sin(Math.PI * n * 0.118));
    if (amp < 0.002) continue;
    const Tn = T1 / (1 + 0.5 * (n - 1));
    const k1 = 6.9 / (Tn * 0.45), k2 = 6.9 / (Tn * 1.6);
    const det = 1 + (n < 4 ? 0.0004 : 0);
    for (let i = 0; i < len; i++) {
      const t = i / RATE;
      let e = (0.62 * Math.exp(-k1 * t) + 0.38 * Math.exp(-k2 * t)) * (1 - Math.exp(-t / att));
      if (t > dur) e *= Math.exp(-(t - dur) / rel);
      out[i] += amp * e * (0.6 * Math.sin(TAU * fn * t) + 0.4 * Math.sin(TAU * fn * det * t + n));
    }
  }
  // A soft felt thump on the attack (low-passed noise, 8 ms).
  const r = rng(Math.round(f * 7)); const th = Math.round(0.008 * RATE); let lp = 0;
  for (let i = 0; i < th && i < len; i++) { lp += 0.08 * (r() - lp); out[i] += lp * 0.25 * vel * (1 - i / th); }
  for (let i = 0; i < len; i++) out[i] *= 0.32 * vel;
  return out;
}

// Karplus-Strong plucked string (nylon guitar, harp or kalimba-like depending on brightness and decay).
export function pluck(f, vel = 0.7, { bright = 0.5, decay = 2.2, pos = 0.22, seed = 1, len: lenS = null } = {}) {
  const len = Math.round((lenS ?? decay * 0.9 + 0.2) * RATE), out = new Float32Array(len);
  const P = RATE / f, N = Math.floor(P), frac = P - N;
  const buf = new Float32Array(N + 2);
  const r = rng(seed + Math.round(f * 13));
  // Excitation: noise low-passed relative to the note (about 3 to 14 harmonics), so low strings are dark, as real ones are.
  for (let i = 0; i < N; i++) buf[i] = r();
  const fc = Math.min(6000, f * (3 + 11 * bright * vel));
  filt(buf.subarray(0, N), biq('lp', fc, 0.6)); filt(buf.subarray(0, N), biq('lp', fc, 0.6));
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(buf[i])); for (let i = 0; i < N; i++) buf[i] /= pk || 1;
  // Pluck position: subtract a delayed copy (removes harmonics at the node).
  const d = Math.max(1, Math.round(pos * N)); const tmp = Float32Array.from(buf); for (let i = 0; i < N; i++) buf[i] = tmp[i] - tmp[(i - d + N) % N];
  const rho = Math.pow(0.001, 1 / (decay * f));
  const S = Math.min(0.5, 0.5 - 0.3 * bright + (f < 150 ? 0.2 : 0)); // loop low-pass: more averaging is darker
  let idx = 0, prev = buf[N - 1], ap = 0, apIn = 0; const g = (1 - frac) / (1 + frac);
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const y = rho * ((1 - S) * cur + S * prev);
    // First-order all-pass for the fractional part of the delay (tuning).
    const v = g * y + apIn - g * ap; apIn = y; ap = v;
    prev = cur; buf[idx] = v; idx = (idx + 1) % N;
    out[i] = cur;
  }
  const fade = Math.round(0.05 * RATE); for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  const a = Math.round(0.002 * RATE); for (let i = 0; i < a; i++) out[i] *= i / a;
  for (let i = 0; i < len; i++) out[i] *= 0.9 * vel;
  return out;
}

// Mallets: marimba (1 : 3.99 : 10.65, fast upper decay) and vibraphone (1 : 4 : 10, longer, gentle tremolo).
export function mallet(f, vel = 0.7, { kind = 'marimba', decay = null, trem = 0 } = {}) {
  const P = kind === 'vibes' ? [[1, 1, 1], [4, 0.22, 0.32], [10, 0.05, 0.12]] : kind === 'bell' ? [[1, 1, 1], [2, 0.14, 0.5], [3.01, 0.05, 0.3], [5.4, 0.02, 0.12]] : [[1, 1, 1], [3.99, 0.3, 0.2], [10.65, 0.06, 0.06]];
  const T = decay ?? (kind === 'vibes' ? 2.6 : kind === 'bell' ? 1.6 : Math.min(1.6, 0.9 * Math.pow(440 / f, 0.5)));
  const len = Math.round((T * 0.9 + 0.1) * RATE), out = new Float32Array(len);
  for (const [ratio, amp, td] of P) {
    const fr = f * ratio; if (fr > 12000) continue;
    const k = 6.9 / (T * td);
    const a = amp * (ratio > 1 ? 0.6 + 0.6 * vel : 1);
    for (let i = 0; i < len; i++) { const t = i / RATE; out[i] += a * Math.exp(-k * t) * Math.sin(TAU * fr * t); }
  }
  const at = Math.round(0.0015 * RATE);
  for (let i = 0; i < len; i++) { const t = i / RATE; out[i] *= 0.3 * vel * Math.min(1, i / at) * (trem ? 1 - trem * (0.5 - 0.5 * Math.cos(TAU * 5.2 * t)) : 1); }
  return out;
}

// Modern synth pluck: band-limited saw whose upper partials decay faster (a filter envelope, done additively).
export function synthPluck(f, vel = 0.7, { decay = 0.9, bright = 0.6 } = {}) {
  const len = Math.round((decay + 0.15) * RATE), out = new Float32Array(len);
  const N = Math.min(14, Math.floor(9000 / f));
  for (let n = 1; n <= N; n++) {
    const k = (3 + n * (6 - 4 * bright)) * 1.2 / decay;
    const a = 1 / n;
    for (let i = 0; i < len; i++) { const t = i / RATE; out[i] += a * Math.exp(-k * t) * Math.sin(TAU * f * n * t + n * 0.7); }
  }
  for (let i = 0; i < len; i++) { const t = i / RATE; out[i] += 0.5 * Math.exp(-t * 3.2 / decay) * Math.sin(TAU * f * t); }
  const at = Math.round(0.002 * RATE);
  for (let i = 0; i < len; i++) out[i] *= 0.2 * vel * Math.min(1, i / at);
  return out;
}

// Soft pad chord (stereo): three slightly detuned voices per note, gentle harmonic roll-off, slow attack and release.
// Notes stay in the middle register: no low drones.
export function pad(notes, dur, { attack = 1.2, release = 1.8, bright = 0.45, gain = 1, seed = 3 } = {}) {
  const len = Math.round((dur + release) * RATE), L = new Float32Array(len), R = new Float32Array(len);
  const r = rng(seed);
  for (const m of notes) {
    const f = midi(m);
    [-0.07, 0, 0.07].forEach((c, vi) => {
      const fr = f * Math.pow(2, c / 12), ph = r() * Math.PI, panL = [0.85, 0.6, 0.35][vi], panR = 1 - panL;
      const N = Math.min(8, Math.floor(6000 / fr));
      for (let n = 1; n <= N; n++) {
        const a = Math.pow(n, -1) * Math.exp(-(n - 1) / (1 + bright * 4)) / notes.length / 3;
        const w = TAU * fr * n / RATE; let p = ph * n;
        for (let i = 0; i < len; i++) { const v = a * Math.sin(p); p += w; L[i] += v * panL; R[i] += v * panR; }
      }
    });
  }
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    let e = Math.min(1, t / attack); e = e * e * (3 - 2 * e);
    if (t > dur) e *= Math.max(0, 1 - (t - dur) / release) ** 2;
    const lfo = 1 + 0.08 * Math.sin(TAU * 0.13 * t + seed);
    L[i] *= e * lfo * gain; R[i] *= e * lfo * gain;
  }
  return [L, R];
}

// Short, rounded bass note (sine with soft second and third harmonics), never a sustained drone.
export function bass(f, dur, vel = 0.7) {
  const len = Math.round((dur + 0.12) * RATE), out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    let e = Math.min(1, t / 0.006) * (0.45 + 0.55 * Math.exp(-t / 0.22));
    if (t > dur) e *= Math.exp(-(t - dur) / 0.04);
    const v = Math.sin(TAU * f * t) + 0.28 * Math.sin(TAU * 2 * f * t) + 0.08 * Math.sin(TAU * 3 * f * t);
    out[i] = Math.tanh(v * 0.9) * e * 0.34 * vel;
  }
  return out;
}

// Light percussion. The kick is a soft, short 64 Hz tap (felt more than heard), never a club thump.
export function kick(vel = 0.6) {
  const len = Math.round(0.32 * RATE), out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) { const t = i / RATE; const f = 64 + 70 * Math.exp(-t * 40); ph += TAU * f / RATE; out[i] = Math.sin(ph) * Math.exp(-t * 16) * 0.55 * vel; }
  return out;
}
export function shaker(vel = 0.5, seed = 1) {
  const len = Math.round(0.11 * RATE), out = new Float32Array(len), r = rng(seed);
  for (let i = 0; i < len; i++) out[i] = r();
  filt(out, biq('bp', 5200, 0.8)); filt(out, biq('lp', 9000));
  for (let i = 0; i < len; i++) { const t = i / RATE; out[i] *= Math.min(1, t / 0.012) * Math.exp(-t * 38) * 0.5 * vel; }
  return out;
}
export function tap(vel = 0.5, seed = 2) {
  const len = Math.round(0.09 * RATE), out = new Float32Array(len), r = rng(seed);
  for (let i = 0; i < len; i++) out[i] = r();
  filt(out, biq('bp', 1700, 1.6));
  for (let i = 0; i < len; i++) { const t = i / RATE; out[i] = out[i] * Math.exp(-t * 70) * 0.6 + 0.35 * Math.sin(TAU * 420 * t) * Math.exp(-t * 55); out[i] *= vel; }
  return out;
}
export function clap(vel = 0.5, seed = 4) {
  const len = Math.round(0.16 * RATE), out = new Float32Array(len), r = rng(seed);
  for (let i = 0; i < len; i++) out[i] = r();
  filt(out, biq('bp', 1500, 0.9));
  for (let i = 0; i < len; i++) { const t = i / RATE; const burst = t < 0.024 ? Math.exp(-((t * 1000) % 8) / 2.2) : Math.exp(-(t - 0.024) * 30); out[i] *= burst * 0.42 * vel; }
  return out;
}
// A gentle rise into a lift: filtered noise opening up, ending at the cue (start = cue - dur).
export function riser(dur = 1.6, gain = 0.5, seed = 9) {
  const len = Math.round(dur * RATE), out = new Float32Array(len), r = rng(seed);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < len; i++) { const t = i / len; const c = 0.01 + 0.18 * t * t; lp += c * (r() - lp); lp2 += c * (lp - lp2); out[i] = lp2 * Math.pow(t, 2.2) * gain * 2.2; }
  const fo = Math.round(0.04 * RATE); for (let i = 0; i < fo; i++) out[len - 1 - i] *= i / fo;
  return out;
}

// ---------- Effects ----------
// Freeverb-style stereo reverb (8 damped combs, 4 all-passes per side), with pre-delay.
export function reverb(L, R, { room = 0.82, damp = 0.35, pre = 0.02 } = {}) {
  const sc = RATE / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
  const side = (x, spread) => {
    const out = new Float32Array(x.length), pd = Math.round(pre * RATE);
    const cs = combs.map((d) => ({ b: new Float32Array(Math.round((d + spread) * sc)), i: 0, s: 0 }));
    const as = aps.map((d) => ({ b: new Float32Array(Math.round((d + spread) * sc)), i: 0 }));
    for (let n = 0; n < x.length; n++) {
      const inp = (n >= pd ? x[n - pd] : 0) * 0.015;
      let s = 0;
      for (const c of cs) { const y = c.b[c.i]; c.s = y * (1 - damp) + c.s * damp; c.b[c.i] = inp + c.s * room; c.i = (c.i + 1) % c.b.length; s += y; }
      for (const a of as) { const y = a.b[a.i]; a.b[a.i] = s + y * 0.5; a.i = (a.i + 1) % a.b.length; s = y - s; }
      out[n] = s;
    }
    return out;
  };
  return [side(L, 0), side(R, 23)];
}
export function pingpong(L, R, { time = 0.375, fb = 0.32, tone = 3500 } = {}) {
  const d = Math.round(time * RATE), n = L.length, oL = new Float32Array(n), oR = new Float32Array(n);
  const k = Math.exp(-TAU * tone / RATE); let zl = 0, zr = 0;
  // Echoes alternate: left at d, right at 2d, left at 3d (each repeat darker and quieter).
  for (let i = d; i < n; i++) {
    const inL = (L[i - d] + R[i - d]) * 0.5 + oR[i - d] * fb, inR = oL[i - d] * fb;
    zl = (1 - k) * inL + k * zl; zr = (1 - k) * inR + k * zr;
    oL[i] = zl; oR[i] = zr;
  }
  return [oL, oR];
}

// ---------- Mixer ----------
// Named buses with sends to a shared reverb and delay; a master high-pass (no sub rumble) and gentle low shelf.
export class Mixer {
  constructor(seconds) { this.n = Math.ceil(seconds * RATE); this.buses = {}; }
  // level: the bus's RMS (dBFS) while it plays, set before effects, so the balance between instruments is deliberate.
  bus(name, { verb = 0.2, delay = 0, gain = 1, hp = 0, lp = 0, level = null } = {}) {
    if (!this.buses[name]) this.buses[name] = { L: new Float32Array(this.n), R: new Float32Array(this.n), verb, delay, gain, hp, lp, level };
    return this.buses[name];
  }
  add(name, t, mono, { gain = 1, pan = 0 } = {}) {
    const b = this.buses[name], s = Math.round(t * RATE);
    const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2 * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2 * gain;
    for (let i = 0; i < mono.length; i++) { const j = s + i; if (j < 0) continue; if (j >= this.n) break; b.L[j] += mono[i] * gl; b.R[j] += mono[i] * gr; }
  }
  addStereo(name, t, [l, r], gain = 1) {
    const b = this.buses[name], s = Math.round(t * RATE);
    for (let i = 0; i < l.length; i++) { const j = s + i; if (j < 0) continue; if (j >= this.n) break; b.L[j] += l[i] * gain; b.R[j] += r[i] * gain; }
  }
  render({ room = 0.82, damp = 0.35, delayTime = 0.375, verbGain = 1 } = {}) {
    const n = this.n, L = new Float32Array(n), R = new Float32Array(n);
    const vL = new Float32Array(n), vR = new Float32Array(n), dL = new Float32Array(n), dR = new Float32Array(n);
    for (const [name, b] of Object.entries(this.buses)) {
      if (b.hp) { filt(b.L, biq('hp', b.hp)); filt(b.R, biq('hp', b.hp)); }
      if (b.lp) { filt(b.L, biq('lp', b.lp)); filt(b.R, biq('lp', b.lp)); }
      if (b.level != null) {
        // RMS over 50 ms blocks where the bus is sounding (above -60 dBFS).
        const blk = Math.round(0.05 * RATE); let e = 0, cnt = 0;
        for (let s0 = 0; s0 + blk <= n; s0 += blk) { let x = 0; for (let i = s0; i < s0 + blk; i++) x += b.L[i] * b.L[i] + b.R[i] * b.R[i]; x /= 2 * blk; if (x > 1e-6) { e += x; cnt++; } }
        if (cnt) b.gain = Math.pow(10, (b.level - 10 * Math.log10(e / cnt)) / 20);
        this.stats = { ...(this.stats || {}), [name]: +(10 * Math.log10(e / Math.max(1, cnt))).toFixed(1) };
      }
      for (let i = 0; i < n; i++) {
        const l = b.L[i] * b.gain, r = b.R[i] * b.gain;
        L[i] += l; R[i] += r; vL[i] += l * b.verb; vR[i] += r * b.verb; dL[i] += l * b.delay; dR[i] += r * b.delay;
      }
    }
    const [eL, eR] = pingpong(dL, dR, { time: delayTime });
    for (let i = 0; i < n; i++) { L[i] += eL[i]; R[i] += eR[i]; vL[i] += eL[i] * 0.5; vR[i] += eR[i] * 0.5; }
    // The reverb return is high-passed so it never adds low-frequency mud.
    const [rL, rR] = reverb(vL, vR, { room, damp });
    filt(rL, biq('hp', 220)); filt(rR, biq('hp', 220));
    for (let i = 0; i < n; i++) { L[i] += rL[i] * verbGain; R[i] += rR[i] * verbGain; }
    for (const x of [L, R]) { filt(x, biq('hp', 38, 0.7)); filt(x, biq('lowshelf', 140, 0.7, -2)); }
    return [L, R];
  }
}

// ---------- Measurement and files ----------
function kfilt(x) { return filt(filt(Float64Array.from(x), [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]), [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]); }
// Integrated loudness (ITU-R BS.1770 gated), optionally only over [from, to) seconds.
export function lufs(L, R, from = 0, to = null) {
  const a = Math.round(from * RATE), b = Math.round((to ?? L.length / RATE) * RATE);
  const kL = kfilt(L.subarray(a, b)), kR = kfilt(R.subarray(a, b));
  const blk = Math.round(0.4 * RATE), hop = Math.round(0.1 * RATE), blocks = [];
  for (let s = 0; s + blk <= kL.length; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += kL[i] * kL[i] + kR[i] * kR[i]; blocks.push(e / blk); }
  const lu = (e) => -0.691 + 10 * Math.log10(e);
  const abs = blocks.filter((e) => lu(e) > -70); if (!abs.length) return -Infinity;
  const rel = lu(abs.reduce((x, e) => x + e, 0) / abs.length) - 10;
  const g = abs.filter((e) => lu(e) > rel);
  return lu(g.reduce((x, e) => x + e, 0) / g.length);
}
// True peak estimate by 4x oversampling (windowed-sinc interpolation), in dBTP.
export function truePeak(L, R) {
  const taps = 12, os = 4; let pk = 0;
  const h = []; for (let p = 0; p < os; p++) { const row = []; for (let k = -taps; k < taps; k++) { const x = k - p / os; const w = 0.5 + 0.5 * Math.cos(Math.PI * x / taps); row.push(x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x) * w); } h.push(row); }
  for (const x of [L, R]) for (let i = taps; i < x.length - taps; i++) {
    const a = Math.abs(x[i]); if (a > pk) pk = a;
    if (a < pk * 0.7) continue;
    for (let p = 1; p < os; p++) { let s = 0; const row = h[p]; for (let k = 0; k < 2 * taps; k++) s += row[k] * x[i - taps + k + 1]; if (Math.abs(s) > pk) pk = Math.abs(s); }
  }
  return 20 * Math.log10(pk);
}
export function scale(L, R, g) { for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; } }
// Look-ahead peak limiter with a smooth release (applied to the sample peak with headroom for true peaks).
export function limiter(L, R, ceilDb = -2) {
  const ceil = Math.pow(10, ceilDb / 20), look = Math.round(0.006 * RATE), rel = Math.exp(-1 / (0.12 * RATE)), n = L.length;
  const need = new Float32Array(n); for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = p > ceil ? ceil / p : 1; }
  let cur = 1;
  for (let i = 0; i < n; i++) { let m = 1; for (let j = i; j < Math.min(n, i + look); j += 4) if (need[j] < m) m = need[j]; cur = m < cur ? m : rel * cur + (1 - rel) * m; const g = Math.min(cur, need[i]); L[i] *= g; R[i] *= g; }
}
export function writeWav(file, L, R, bits = 24) {
  const n = L.length, by = bits / 8, buf = Buffer.alloc(44 + n * 2 * by);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2 * by, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2 * by, 28); buf.writeUInt16LE(2 * by, 32); buf.writeUInt16LE(bits, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2 * by, 40);
  const max = Math.pow(2, bits - 1) - 1;
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) { const v = Math.round(Math.max(-1, Math.min(1, (c ? R : L)[i])) * max); const o = 44 + (i * 2 + c) * by; if (bits === 24) buf.writeIntLE(v, o, 3); else buf.writeInt16LE(v, o); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
export function readWav(file) {
  const b = fs.readFileSync(file); let off = 12, data = null, ch = 2, rate = 48000, bits = 16;
  while (off < b.length) { const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4); if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); } if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; } off += 8 + sz + (sz % 2); }
  const by = bits / 8, n = Math.floor(data.length / (by * ch)), L = new Float32Array(n), R = new Float32Array(n), max = Math.pow(2, bits - 1);
  const rd = (o) => (bits === 24 ? data.readIntLE(o, 3) : bits === 32 ? data.readInt32LE(o) : data.readInt16LE(o)) / max;
  for (let i = 0; i < n; i++) { L[i] = rd(i * by * ch); R[i] = ch > 1 ? rd(i * by * ch + by) : L[i]; }
  return { L, R, rate };
}
