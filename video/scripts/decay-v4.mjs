// Final logo-sound comparison, round 2: natural decay instead of a reflection.
//   TN0 TN1 TN2  the original two-note signature: unchanged, then its decay extended by about 0.12 s and 0.25 s
//   SW0 SW1 SW2  the C1 rising sweep: unchanged, then extended the same way
//   MX           one intermediate sound: C1's fluid glide with the two-note's musical arrival (D5 rising to A5 on the
//                settle, as one continuous tone with the two-note's timbre), no third note
// How the decay is extended: each sound is computed exactly as the original (same code, same pitches, timbre and
// attack) but for longer, and then, once it has fallen 12 dB below its peak, its rate of decay is eased (over 80 ms) to
// a slower rate. The slower rate is found by search so that the moment the sound falls to -40 dB moves later by the
// target. Before that point the extended files are sample-identical to the original. There is no delayed copy, no
// second attack and nothing that can return after fading; C1's slow 0.8 Hz beating is faded out in the extended
// tail only, so the longer ring cannot swell back up.
//   node scripts/decay-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, biq, filt, reverb, writeWav, readWav, truePeak } from './music-v4/engine.mjs';
import { make as makeTwoNote } from './sfx-v4.mjs';
import { voice, room, momentaryMax } from './sonar-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/audio-v4/decay');
const PRE = 0.35, LONG = 3.5, TAU = 2 * Math.PI;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12);
export const TARGETS = [0, 0.12, 0.25];

// 10 ms RMS envelope in dB.
export function envelope(L, R) { const w = 480, o = []; for (let s = 0; s + w <= L.length; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += L[i] * L[i] + R[i] * R[i]; o.push(10 * Math.log10(a / (2 * w) + 1e-30)); } return o; }
// Seconds after the peak at which the envelope first falls below peak + dB (and stays there for 30 ms).
export function fallTime(env, dB) { const pk = Math.max(...env), pi = env.indexOf(pk); for (let i = pi; i < env.length - 3; i++) if (env[i] < pk + dB && env[i + 1] < pk + dB && env[i + 2] < pk + dB) return (i - pi) / 100; return null; }
// Largest rise in level after the sound has started to fade (dB), above the -60 dB floor.
export function reRise(env) { const pk = Math.max(...env), pi = env.indexOf(pk); let lo = pk, r = 0; for (let i = pi; i < env.length; i++) { if (env[i] < pk - 60) break; lo = Math.min(lo, env[i]); r = Math.max(r, env[i] - lo); } return r; }

// The decay-rate change: 0 dB until tk, then the extra gain grows at dr dB/s, eased in over 80 ms, and eased out again
// by tEnd (where the extended sound has fallen 65 dB), after which it holds: nothing that was already inaudible is ever
// brought back up, and the sound keeps fading at its own rate to silence.
export function extend([L, R], hit, tk, dr, tEnd = Infinity) {
  const ramp = 0.08, o = [Float32Array.from(L), Float32Array.from(R)];
  let g = 0;
  for (let i = 0; i < L.length; i++) {
    const t = i / RATE - hit - tk, te = tEnd - tk;
    if (t > 0) { const s = (t < ramp ? 0.5 - 0.5 * Math.cos(Math.PI * t / ramp) : 1) * (t > te - ramp ? Math.max(0, 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (t - te + ramp) / ramp))) : 1); g += dr * s / RATE; }
    const k = Math.pow(10, g / 20); o[0][i] *= k; o[1][i] *= k;
  }
  return o;
}
// Trim where the sound has fallen 75 dB below its peak (inaudible), with a 30 ms fade there.
export function trim([L, R]) {
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  let end = L.length - 1; const floor = pk * Math.pow(10, -75 / 20);
  while (end > 0 && Math.max(Math.abs(L[end]), Math.abs(R[end])) < floor) end--;
  end = Math.min(L.length, end + Math.round(0.03 * RATE));
  const o = [L.slice(0, end), R.slice(0, end)], fo = Math.round(0.03 * RATE);
  for (let i = 0; i < fo; i++) { const k = i / fo; o[0][end - 1 - i] *= k; o[1][end - 1 - i] *= k; }
  return o;
}
// Find dr so that the -40 dB point moves by `target` seconds; tk = where the original has fallen 12 dB.
function fit(src, hit, target) {
  const env0 = envelope(...src), t40 = fallTime(env0, -40), pk = Math.max(...env0), pi = env0.indexOf(pk);
  let tk = fallTime(env0, -12); tk = (pi / 100 + tk) - hit;
  const tEnd = pi / 100 + fallTime(env0, -65) - hit;
  if (!target) return { dr: 0, tk, t40, tEnd };
  let lo = 0, hi = 120, best = null;
  // The rate change stops where the extended sound itself reaches -65 dB, so the whole tail falls at one even rate.
  const endFor = (dr) => { const e1 = envelope(...extend(src, hit, tk, dr)), p1 = e1.indexOf(Math.max(...e1)), f65 = fallTime(e1, -65); return f65 == null ? tEnd : p1 / 100 + f65 - hit; };
  let bestEnd = tEnd;
  for (let it = 0; it < 26; it++) { const mid = (lo + hi) / 2, te = endFor(mid), e = envelope(...extend(src, hit, tk, mid, te)), f = fallTime(e, -40), d = f == null ? Infinity : f - t40; best = mid; bestEnd = te; if (d < target) lo = mid; else hi = mid; }
  return { dr: best, tk, t40, tEnd: bestEnd };
}

// Long renders of the two families (identical to the originals until the originals' own computation would stop).
const twoNote = (seconds, settle, airGain) => makeTwoNote(seconds, settle, 'signature', airGain, { lenMul: 6 });
function sweep() {
  const n = Math.round((PRE + LONG) * RATE), b = [new Float32Array(n), new Float32Array(n)];
  voice(b, PRE - 0.32, { f0: note(69), f1: note(81), glide: 0.32, glideShape: 'exp', swell: 0.32, attack: 0.01, T60: 0.5, partials: [[1, 1, 1], [2, 0.08, 0.5]], beat: 0.8, beatAmp: 0.3, len: LONG, beatFadeAfter: 0.12 });
  room(b, 0.1);
  for (const x of b) filt(x, biq('hp', 150, 0.7));
  return b;
}
// The intermediate sound: one continuous tone. It begins softly on D5 when the two-note's first note would, holds for
// a moment, glides (eased) up to A5, arriving exactly on the settle with a gentle swell, then decays with the two-note's
// timbre (soft second and third partials, a faint glassy partial) and its short room. No second attack, no third note.
export function intermediate() {
  const n = Math.round((PRE + LONG) * RATE), L = new Float32Array(n), R = new Float32Array(n);
  const start = PRE - 0.24, hold = 0.07, glide = 0.17, T60 = 0.82, P = [[1, 1, 1], [2, 0.22, 0.6], [3, 0.06, 0.4], [4.2, 0.02, 0.25]];
  const ph = P.map(() => 0);
  for (let i = Math.round(start * RATE); i < n; i++) {
    const t = i / RATE - start, u = t - hold;
    const g = u <= 0 ? 0 : Math.min(1, u / glide), k = g * g * (3 - 2 * g);
    const f = note(74) * Math.pow(note(81) / note(74), k);
    // Level: a soft onset (25 ms) to 0.7, swelling to 1 at the arrival, then a natural exponential decay.
    const arrive = hold + glide;
    let e = t < arrive ? (1 - Math.exp(-t / 0.025)) * (0.7 + 0.3 * Math.pow(Math.min(1, t / arrive), 3)) : Math.exp(-6.9 * (t - arrive) / T60);
    let v = 0; P.forEach(([r, a, d], j) => { ph[j] += TAU * f * r / RATE; const pe = t < arrive ? 1 : Math.exp(-6.9 * (t - arrive) / (T60 * d)) / Math.exp(-6.9 * (t - arrive) / T60); v += a * pe * Math.sin(ph[j]); });
    v *= e * 0.42; L[i] = v; R[i] = v * 0.97;
  }
  const [rl, rr] = reverb(Float32Array.from(L), Float32Array.from(R), { room: 0.6, damp: 0.5, pre: 0.008 });
  filt(rl, biq('hp', 300)); filt(rr, biq('hp', 300));
  for (let i = 0; i < n; i++) { L[i] += rl[i] * 0.35; R[i] += rr[i] * 0.35; }
  for (const x of [L, R]) filt(x, biq('hp', 150, 0.7));
  return [L, R];
}

const db = (x) => +x.toFixed(2);
function describe(id, [L, R], base) {
  const env = envelope(L, R);
  const r = { id, seconds: db(L.length / RATE), afterHit: db(L.length / RATE - PRE) };
  for (const d of [-20, -30, -40, -50]) r[`fallTo${-d}dB`] = fallTime(env, d);
  r.reRiseDb = db(reRise(env)); r.momentaryLUFS = db(momentaryMax(L, R)); r.truePeak = db(truePeak(L, R));
  let clip = 0; for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= 0.999 || Math.abs(R[i]) >= 0.999) clip++; r.clipped = clip;
  // Tail colour: spectral centroid while the sound falls from -20 to -40 dB (does the longer tail expose new colours?).
  const pk = Math.max(...env), pi = env.indexOf(pk), a = pi + Math.round(fallTime(env, -20) * 100), b2 = pi + Math.round(fallTime(env, -40) * 100);
  const seg = Float32Array.from(L.subarray(a * 480, b2 * 480), (v, i) => (v + R[a * 480 + i]) / 2);
  const N = 1 << Math.ceil(Math.log2(Math.max(2048, seg.length))), re = new Float64Array(N), im = new Float64Array(N); re.set(seg);
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const an = -2 * Math.PI / len, wr = Math.cos(an), wi = Math.sin(an); for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const tt = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = tt; } } }
  let nu = 0, de = 0; for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k], f = k * RATE / N; nu += f * p; de += p; }
  r.tailCentroidHz = Math.round(nu / de);
  if (base) { const n0 = Math.round((PRE + base.tk * 0.9) * RATE); let mx = 0; for (let i = 0; i < Math.min(n0, base.L.length); i++) mx = Math.max(mx, Math.abs(L[i] - base.L[i])); r.identicalToOriginalUntil = `${db(base.tk * 0.9)} s after the settle (max difference ${mx.toExponential(1)})`; }
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(DIR, { recursive: true });
  const meta = {};
  const save = (id, b, info) => { writeWav(path.join(DIR, `${id}.wav`), b[0], b[1]); meta[id] = { ...info, ...describe(id, b, info.base), hit: PRE, pitch: 880, dir: 'decay' }; delete meta[id].base; console.log(id, JSON.stringify(meta[id])); };
  // Two-note family. Standalone (no air) normalised once from the original, so all three share the same start.
  const tnSrc = twoNote(PRE + LONG, PRE, 0); for (const x of tnSrc) filt(x, biq('hp', 150, 0.7));
  const tn0 = trim(tnSrc), gTN = Math.pow(10, (-16 - momentaryMax(...tn0)) / 20);
  const sc = (b, g) => b.map((x) => Float32Array.from(x, (v) => v * g));
  const fitTN = TARGETS.map((t) => fit(tnSrc, PRE, t));
  TARGETS.forEach((t, j) => {
    const b = sc(trim(j ? extend(tnSrc, PRE, fitTN[j].tk, fitTN[j].dr, fitTN[j].tEnd) : tnSrc), gTN);
    save(`TN${j}`, b, { family: 'Two-note signature', name: j ? `Two-note, decay ${t === 0.12 ? 'slightly' : 'moderately'} longer` : 'Two-note, original', target: t, decayChangeDbPerSecond: db(fitTN[j].dr), changeFrom: db(fitTN[j].tk), base: j ? { tk: fitTN[j].tk, L: sc(tnSrc, gTN)[0] } : null });
    // Film files in the published layout (air movement included; settle at 2.0 s and 1.1 s), for TN1 and TN2.
    if (j) for (const [name, settle, ag] of [['reveal', 2.0, 0.32], ['reveal-short', 1.1, 0.22]]) {
      const src = twoNote(settle + LONG, settle, ag);
      const ff = trim(extend(src, settle, fitTN[j].tk, fitTN[j].dr, fitTN[j].tEnd));
      writeWav(path.join(DIR, `TN${j}-${name}.wav`), ff[0], ff[1]);
    }
  });
  meta.TN1.film = { full: 'decay/TN1-reveal.wav', short: 'decay/TN1-reveal-short.wav' }; meta.TN2.film = { full: 'decay/TN2-reveal.wav', short: 'decay/TN2-reveal-short.wav' };
  // C1 family. SW0 is the published C1 file; SW1 and SW2 are matched to its start.
  const c1 = readWav(path.join(ROOT, 'public/audio-v4/sonar/C1.wav'));
  const swSrc = sweep();
  const head = (x, n) => { let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i]; return s; }, hn = Math.round((PRE + 0.05) * RATE);
  const gSW = Math.sqrt(head(c1.L, hn) / head(swSrc[0], hn));
  save('SW0', [c1.L, c1.R], { family: 'C1 rising sweep', name: 'C1 sweep, original', target: 0, decayChangeDbPerSecond: 0, base: null });
  const fitSW = TARGETS.map((t) => fit(swSrc, PRE, t));
  [1, 2].forEach((j) => save(`SW${j}`, sc(trim(extend(swSrc, PRE, fitSW[j].tk, fitSW[j].dr, fitSW[j].tEnd)), gSW), { family: 'C1 rising sweep', name: `C1 sweep, decay ${j === 1 ? 'slightly' : 'moderately'} longer`, target: TARGETS[j], decayChangeDbPerSecond: db(fitSW[j].dr), changeFrom: db(fitSW[j].tk), base: { tk: fitSW[j].tk, L: sc(swSrc, gSW)[0] } }));
  // The intermediate sound, at the same perceived level as the two-note original.
  const tn0f = readWav(path.join(DIR, 'TN0.wav')), mx = trim(intermediate()), gMX = Math.pow(10, (momentaryMax(tn0f.L, tn0f.R) - momentaryMax(...mx)) / 20);
  save('MX', sc(mx, gMX), { family: 'Intermediate', name: 'Intermediate: one gliding tone arriving on A5', target: null, base: null });
  fs.writeFileSync(path.join(DIR, 'decay.json'), JSON.stringify(meta, null, 1));
}
