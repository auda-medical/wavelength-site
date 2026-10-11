// Logo sound, audition 2 (11 October 2026). The owner's brief: keep the recognisable two-note signature (D5 leading
// cleanly into A5 on the settle), but the second tone ends too sharply. Let it linger and fade with the smoothness the
// single MX glide has, without becoming a chime, an alarm or sonar. "Echo of the second ping" means its own lingering
// resonance, never a second sound. At most three variants, plus TN1 and MX as references.
//
// How: everything is the published two-note (sfx-v4.mjs make: pitches, timbre, attack, felt tick, the first tone, the air
// movement, the room, the level) except the second tone's natural decay:
//   L1 restrained          A5 T60 1.1 s
//   L2 balanced            A5 T60 1.5 s
//   L3 clearly lingering   A5 T60 2.0 s       (the original is 0.75 s)
// and, as in MX, the second tone's upper partials die away sooner relative to the fundamental, so the ring grows purer
// as it fades instead of keeping its brightness to the end. Each tone is one plain exponential decay: no envelope edit,
// no echo, reflection, repeat, retrigger or level rebound. The tone is computed until it is far below audibility and the
// file is trimmed 75 dB below its peak.
//   node scripts/linger-a2.mjs     -> public/audio-v4/linger/{L1,L2,L3}.wav (standalone), L*-reveal(-short).wav (film
//                                     layout, air included), linger.json (measurements)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, midi, rng, biq, filt, reverb, writeWav, readWav, truePeak } from './music-v4/engine.mjs';
import { envelope, fallTime, reRise, trim } from './decay-v4.mjs';
import { momentaryMax } from './sonar-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/audio-v4/linger');
const TAU = 2 * Math.PI, PRE = 0.35;
export const VARIANTS = [
  { id: 'L1', name: 'Two-note, second tone lingers: restrained', T60: 1.1 },
  { id: 'L2', name: 'Two-note, second tone lingers: balanced', T60: 1.5 },
  { id: 'L3', name: 'Two-note, second tone lingers: clearly lingering', T60: 2.0 },
];
// Partials as the published tone ([ratio, amplitude, decay factor]); for the lingering second tone the upper partials'
// decay factors are scaled so their absolute decay times stay close to the original (they do not ring longer), while
// the fundamental rings longer: the tail purifies towards A5, as MX does.
const P = [[1, 1, 1], [2, 0.22, 0.6], [3, 0.06, 0.4], [4.2, 0.025, 0.25]];

// sfx-v4.mjs tone(), with a decay per partial and computed for `seconds`.
function tone(L, R, t0, f, gain, T60, partials, seconds) {
  const s = Math.round(t0 * RATE), len = Math.round(seconds * RATE), k = 6.9 / T60;
  for (let i = 0; i < len && s + i < L.length; i++) {
    const t = i / RATE;
    let v = 0; for (const [r, a, d] of partials) v += a * Math.exp(-k / d * t) * Math.sin(TAU * f * r * t);
    v *= gain * (1 - Math.exp(-t / 0.004));
    L[s + i] += v; R[s + i] += v * 0.97;
  }
  const g = rng(Math.round(f)), tk = new Float32Array(Math.round(0.006 * RATE));
  for (let i = 0; i < tk.length; i++) tk[i] = g() * Math.exp(-i / (0.0012 * RATE));
  filt(tk, biq('bp', 2600, 0.9));
  for (let i = 0; i < tk.length && s + i < L.length; i++) { L[s + i] += tk[i] * gain * 0.18; R[s + i] += tk[i] * gain * 0.18; }
}
// sfx-v4.mjs air(), unchanged.
function air(L, R, settle, gain) {
  const r = rng(11); let a = 0, b = 0;
  for (let i = 0; i < Math.round((settle + 0.25) * RATE); i++) {
    const t = i / RATE, x = t / settle;
    const env = Math.pow(Math.min(1, x), 2.4) * (t > settle ? Math.exp(-(t - settle) * 18) : 1);
    const c = 0.006 + 0.03 * Math.min(1, x);
    a += c * (r() - a); b += c * (r() - b);
    L[i] += a * env * gain; R[i] += b * env * gain;
  }
}
// The published two-note with a lingering second tone. T60 = 0.75 and purify = false reproduce the original exactly
// (apart from being computed longer), which the check below uses.
export function make(settle, airGain, T60, { purify = true, seconds = null } = {}) {
  const total = seconds || settle + Math.max(1.1, T60 * 1.8);
  const n = Math.round(total * RATE), L = new Float32Array(n), R = new Float32Array(n);
  air(L, R, settle, airGain);
  tone(L, R, settle - 0.13, midi(74), 0.38, 0.55, P, 0.55 * 1.5);
  const second = purify ? P.map(([r, a, d], j) => [r, a, j ? d * 0.75 / T60 : d]) : P;
  tone(L, R, settle, midi(81), 0.42, T60, second, total - settle);
  const [rl, rr] = reverb(Float32Array.from(L), Float32Array.from(R), { room: 0.6, damp: 0.5, pre: 0.008 });
  filt(rl, biq('hp', 300)); filt(rr, biq('hp', 300));
  for (let i = 0; i < n; i++) { L[i] += rl[i] * 0.35; R[i] += rr[i] * 0.35; }
  for (const x of [L, R]) filt(x, biq('hp', 120));
  return [L, R];
}
const db = (x) => +x.toFixed(2);
function describe(id, [L, R]) {
  const env = envelope(L, R), r = { id, seconds: db(L.length / RATE) };
  for (const d of [-20, -30, -40, -50, -60]) r[`fallTo${-d}dB`] = fallTime(env, d);
  r.reRiseDb = db(reRise(env)); r.momentaryLUFS = db(momentaryMax(L, R)); r.truePeak = db(truePeak(L, R));
  let clip = 0; for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= 0.999 || Math.abs(R[i]) >= 0.999) clip++; r.clipped = clip;
  // Monotonic: the 10 ms envelope never rises by more than 0.5 dB after the peak (sampling ripple), down to -60 dB.
  const pk = Math.max(...env), pi = env.indexOf(pk); let worst = 0;
  for (let i = pi + 1; i < env.length && env[i] > pk - 60; i++) worst = Math.max(worst, env[i] - env[i - 1]);
  r.largestStepUpDb = db(worst);
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(DIR, { recursive: true });
  // Check: with the original decay and no purifying, this code reproduces the published standalone two-note's start.
  const ref = make(PRE, 0, 0.75, { purify: false, seconds: PRE + 1.1 });
  // Standalone level: the same gain for all three, set from the original two-note at -16 LUFS momentary (as TN0).
  const tn0 = readWav(path.join(ROOT, 'public/audio-v4/decay/TN0.wav'));
  const gain = Math.pow(10, (momentaryMax(tn0.L, tn0.R) - momentaryMax(...ref)) / 20);
  const sc = (b) => b.map((x) => Float32Array.from(x, (v) => v * gain));
  const meta = { method: 'second tone T60 longer, upper partials purify; nothing else changed', reference: { TN1: 'decay/TN1.wav', MX: 'decay/MX.wav' } };
  for (const v of VARIANTS) {
    const b = sc(trim(make(PRE, 0, v.T60)));
    writeWav(path.join(DIR, `${v.id}.wav`), b[0], b[1]);
    // Film files in the published layout (air movement included; settle at 2.0 s and 1.1 s).
    for (const [name, settle, ag] of [['reveal', 2.0, 0.32], ['reveal-short', 1.1, 0.22]]) {
      const f = make(settle, ag, v.T60);
      let pk = 0; for (const x of f) for (const s of x) pk = Math.max(pk, Math.abs(s));
      const g = 0.5 / pk, out = trim(f.map((x) => Float32Array.from(x, (s) => s * g)));
      writeWav(path.join(DIR, `${v.id}-${name}.wav`), out[0], out[1]);
    }
    meta[v.id] = { ...v, ...describe(v.id, b), hit: PRE, pitch: 880, dir: 'linger', family: 'Two-note, lingering second tone', film: { full: `linger/${v.id}-reveal.wav`, short: `linger/${v.id}-reveal-short.wav` } };
    console.log(v.id, JSON.stringify(meta[v.id]));
  }
  for (const k of ['TN0', 'TN1', 'TN2', 'MX']) { const w = readWav(path.join(ROOT, `public/audio-v4/decay/${k}.wav`)); meta[`ref_${k}`] = describe(k, [w.L, w.R]); }
  console.log('references', JSON.stringify({ TN1: meta.ref_TN1, MX: meta.ref_MX }));
  fs.writeFileSync(path.join(DIR, 'linger.json'), JSON.stringify(meta, null, 1));
}
