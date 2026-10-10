// Nine original sonar-inspired logo sounds for Wavelength (procedural synthesis written for this project: no samples,
// presets or libraries). Three groups:
//   A Classic sonar      A1 rounded rising ping · A2 higher, delicate ping · A3 fuller, warmer ping
//   B Modern precision   B1 short crisp ping · B2 refined rising glide · B3 crystalline ping with a warm under-layer
//   C Wavelength         C1 rising sweep that lands on the settle · C2 ping resolving to the home chord (D major, as
//                        the music) · C3 ping whose echo returns higher and warmer, locking onto D ("tune in, gain clarity")
// Every rising ping lands on a note of D major (the key of the music). Every file is normalised to the same short-term loudness (maximum momentary loudness -16 LUFS) for fair comparison,
// and records its "hit": the moment that must coincide with the logo settling. Also writes the quiet air movement
// used under the camera pullback in the integrated previews (the same for every candidate).
//   node scripts/sonar-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, rng, biq, filt, reverb, writeWav, truePeak } from './music-v4/engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/audio-v4/sonar');
const TAU = 2 * Math.PI;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12);

// One voice: pitch glide f0 -> f1 over glide s (ease-out), partials [ratio, amp, decay factor], optional slow beating
// (a second oscillator detuned by `beat` Hz, the rounded "underwater" quality of sonar), optional FM transient.
function voice(buf, t0, { f0, f1 = f0, glide = 0, glideShape = 'out', attack = 0.004, T60 = 0.6, partials = [[1, 1, 1]], beat = 0, beatAmp = 0.5, fm = null, gain = 1, pan = 0, swell = 0 }) {
  const [L, R] = buf, s0 = Math.round(t0 * RATE), len = Math.round((T60 * 1.3 + swell) * RATE);
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  let ph = 0, ph2 = 0;
  const phs = partials.map(() => 0);
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    // Pitch: glide over `glide` seconds (from the start of the swell, if any).
    const g = glide > 0 ? Math.min(1, t / glide) : 1;
    const k = glideShape === 'exp' ? (Math.pow(2, g * 6) - 1) / 63 : 1 - Math.pow(1 - g, 3);
    const f = f0 * Math.pow(f1 / f0, k);
    // Envelope: an optional swell (rising into the hit), then attack and exponential decay from the hit.
    let e;
    if (t < swell) e = Math.pow(t / swell, 2.2) * 0.55;
    else { const u = t - swell; e = (swell ? 0.55 + 0.45 * Math.min(1, u / attack) : Math.min(1, u / attack) ** 1.5) * Math.exp(-6.9 * u / T60); }
    let v = 0;
    const mod = fm ? fm.index * Math.exp(-t / fm.decay) * Math.sin(TAU * f * fm.ratio * t) : 0;
    partials.forEach(([r, a, d], j) => { phs[j] += TAU * f * r / RATE; const pe = d === 1 ? 1 : Math.exp(-6.9 * Math.max(0, t - swell) / (T60 * d)) / Math.exp(-6.9 * Math.max(0, t - swell) / T60); v += a * pe * Math.sin(phs[j] + (j === 0 ? mod : 0)); });
    if (beat) { ph2 += TAU * (f + beat) / RATE; v += beatAmp * Math.sin(ph2); }
    v *= e * gain;
    const j = s0 + i; if (j < 0 || j >= L.length) continue;
    L[j] += v * gl; R[j] += v * gr;
  }
}
// The sonar echo: a delayed, softened copy (one or more returns), slightly to one side.
function echo(buf, { delay, gain, lp = 2400, repeats = 1, pan = 0.25 }) {
  const [L, R] = buf, d = Math.round(delay * RATE), m = Float32Array.from(L, (v, i) => (v + R[i]) / 2);
  filt(m, biq('lp', lp, 0.7));
  const gl = Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let r = 1; r <= repeats; r++) { const g = gain * Math.pow(0.5, r - 1); for (let i = 0; i + d * r < L.length; i++) { L[i + d * r] += m[i] * g * gl; R[i + d * r] += m[i] * g * gr; } }
}
function room(buf, mix = 0.12) {
  const [L, R] = buf, [rl, rr] = reverb(Float32Array.from(L), Float32Array.from(R), { room: 0.55, damp: 0.55, pre: 0.006 });
  filt(rl, biq('hp', 350)); filt(rr, biq('hp', 350));
  for (let i = 0; i < L.length; i++) { L[i] += rl[i] * mix; R[i] += rr[i] * mix; }
}

const PRE = 0.35; // every file starts 0.35 s before its hit (room for C1's sweep; silence for the others)
export const SONAR = {
  A1: { group: 'A', name: 'Rounded rising ping', desc: 'A smooth, rounded sonar ping that rises gently onto A5, with one soft echo.', make: (b) => { voice(b, PRE, { f0: note(80.3), f1: note(81), glide: 0.07, attack: 0.006, T60: 0.75, partials: [[1, 1, 1], [2, 0.07, 0.5]], beat: 0.9, beatAmp: 0.45 }); echo(b, { delay: 0.19, gain: 0.18 }); room(b, 0.1); } },
  A2: { group: 'A', name: 'Delicate high ping', desc: 'Higher and more delicate (E6), almost a pure tone, a quick soft decay and a faint echo.', make: (b) => { voice(b, PRE, { f0: note(87.7), f1: note(88), glide: 0.05, attack: 0.003, T60: 0.5, partials: [[1, 1, 1], [3, 0.025, 0.4]], beat: 1.4, beatAmp: 0.35 }); echo(b, { delay: 0.14, gain: 0.1, lp: 3000 }); room(b, 0.08); } },
  A3: { group: 'A', name: 'Warm full ping', desc: 'Fuller and warmer (D5 with a soft octave below and gentle harmonics), depth without heavy bass or long ringing.', make: (b) => { voice(b, PRE, { f0: note(73.7), f1: note(74), glide: 0.06, attack: 0.008, T60: 0.7, partials: [[1, 1, 1], [0.5, 0.28, 0.55], [2, 0.16, 0.6], [3, 0.05, 0.4]], beat: 0.7, beatAmp: 0.35 }); echo(b, { delay: 0.21, gain: 0.14, lp: 1800 }); room(b, 0.12); } },
  B1: { group: 'B', name: 'Crisp precision ping', desc: 'Short and crisp (A6) with a quick defining transient, no echo; over in about a third of a second.', make: (b) => { voice(b, PRE, { f0: note(93), attack: 0.0015, T60: 0.3, partials: [[1, 1, 1], [2, 0.05, 0.3]], fm: { ratio: 1, index: 1.1, decay: 0.012 } }); room(b, 0.06); } },
  B2: { group: 'B', name: 'Refined rising glide', desc: 'A bright, elegant glide up a fifth (A5 to E6) with a soft octave shimmer at the finish.', make: (b) => { voice(b, PRE, { f0: note(81), f1: note(88), glide: 0.11, attack: 0.004, T60: 0.55, partials: [[1, 1, 1], [2, 0.1, 0.5], [3, 0.035, 0.3]] }); voice(b, PRE + 0.09, { f0: note(100), attack: 0.06, T60: 0.35, gain: 0.07, pan: -0.2 }); room(b, 0.1); } },
  B3: { group: 'B', name: 'Crystalline ping', desc: 'Minimal and precise: a glass-like D6 with faint inharmonic partials, warmed by a soft D5 underneath.', make: (b) => { voice(b, PRE, { f0: note(86), attack: 0.0025, T60: 0.6, partials: [[1, 1, 1], [2.756, 0.1, 0.45], [5.404, 0.03, 0.25]] }); voice(b, PRE, { f0: note(74), attack: 0.006, T60: 0.5, gain: 0.24 }); room(b, 0.09); } },
  C1: { group: 'C', name: 'Rising sweep', desc: 'A rising sonar sweep (an octave, A4 to A5) that climbs with the logo and lands on the settle, then rings briefly.', make: (b) => { voice(b, PRE - 0.32, { f0: note(69), f1: note(81), glide: 0.32, glideShape: 'exp', swell: 0.32, attack: 0.01, T60: 0.5, partials: [[1, 1, 1], [2, 0.08, 0.5]], beat: 0.8, beatAmp: 0.3 }); room(b, 0.1); } }, // no echo: an echo would repeat the sweep after it lands
  C2: { group: 'C', name: 'Ping with musical resolution', desc: 'A rounded ping on A5 that resolves into a soft D major colour (D5 and F#5), the home chord of the music.', make: (b) => { voice(b, PRE, { f0: note(80.6), f1: note(81), glide: 0.05, attack: 0.005, T60: 0.55, partials: [[1, 1, 1], [2, 0.06, 0.5]], beat: 0.9, beatAmp: 0.4 }); for (const [m, p] of [[74, -0.15], [78, 0.15]]) voice(b, PRE + 0.11, { f0: note(m), attack: 0.012, T60: 0.6, gain: 0.32, partials: [[1, 1, 1], [3.99, 0.12, 0.25]], pan: p }); room(b, 0.12); } },
  C3: { group: 'C', name: 'Wavelength signature: ping and returning echo', desc: 'A sonar ping on A5 whose echo returns higher and warmer, gliding up to lock onto D6: "tune in, gain clarity".', make: (b) => { voice(b, PRE, { f0: note(81), attack: 0.005, T60: 0.32, partials: [[1, 1, 1], [2, 0.05, 0.5]], beat: 1.1, beatAmp: 0.4 }); voice(b, PRE + 0.17, { f0: note(84.6), f1: note(86), glide: 0.06, attack: 0.012, T60: 0.6, gain: 0.85, partials: [[1, 1, 1], [2, 0.14, 0.6], [0.5, 0.1, 0.5]], beat: 0.6, beatAmp: 0.3, pan: 0.1 }); voice(b, PRE + 0.34, { f0: note(86), attack: 0.01, T60: 0.4, gain: 0.16, pan: 0.3 }); room(b, 0.1); } },
};

// Maximum momentary loudness (400 ms K-weighted windows, 10 ms hop): the right measure for very short sounds.
export function momentaryMax(L, R) {
  const K = (x) => filt(filt(Float64Array.from(x), [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]), [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]);
  const kl = K(L), kr = K(R), w = Math.round(0.4 * RATE), hop = Math.round(0.01 * RATE);
  const c = new Float64Array(kl.length + 1); for (let i = 0; i < kl.length; i++) c[i + 1] = c[i] + kl[i] * kl[i] + kr[i] * kr[i];
  let m = -Infinity; for (let s = 0; s + w <= kl.length; s += hop) m = Math.max(m, -0.691 + 10 * Math.log10((c[s + w] - c[s]) / w + 1e-20));
  if (kl.length < w) m = -0.691 + 10 * Math.log10(c[kl.length] / w + 1e-20);
  return m;
}
export const TARGET_MOMENTARY = -16;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(DIR, { recursive: true });
  const meta = {};
  for (const [id, s] of Object.entries(SONAR)) {
    const n = Math.round((PRE + 1.6) * RATE), b = [new Float32Array(n), new Float32Array(n)];
    s.make(b);
    for (const x of b) filt(x, biq('hp', 150, 0.7)); // no low rumble
    // Trim where the sound has fallen 60 dB below its peak (plus 30 ms), with a 30 ms fade: it ends naturally.
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(b[0][i]), Math.abs(b[1][i]));
    let end = n - 1; while (end > 0 && Math.max(Math.abs(b[0][end]), Math.abs(b[1][end])) < pk * 0.001) end--;
    end = Math.min(n, end + Math.round(0.03 * RATE));
    let [L, R] = b.map((x) => x.slice(0, end));
    const fo = Math.round(0.03 * RATE); for (let i = 0; i < fo; i++) { const k = i / fo; L[L.length - 1 - i] *= k; R[R.length - 1 - i] *= k; }
    const g = Math.pow(10, (TARGET_MOMENTARY - momentaryMax(L, R)) / 20); for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
    writeWav(path.join(DIR, `${id}.wav`), L, R);
    meta[id] = { group: s.group, name: s.name, desc: s.desc, hit: PRE, seconds: +(L.length / RATE).toFixed(3), afterHit: +(L.length / RATE - PRE).toFixed(3), truePeak: +truePeak(L, R).toFixed(2) };
    console.log(id, JSON.stringify(meta[id]));
  }
  fs.writeFileSync(path.join(DIR, 'sonar.json'), JSON.stringify(meta, null, 1));
  // The air movement under the pullback, alone (identical under every candidate in the integrated previews).
  const air = (settle, gain, len) => { const n = Math.round(len * RATE), L = new Float32Array(n), R = new Float32Array(n), r = rng(11); let a = 0, c = 0; for (let i = 0; i < Math.round((settle + 0.25) * RATE) && i < n; i++) { const t = i / RATE, x = t / settle; const env = Math.pow(Math.min(1, x), 2.4) * (t > settle ? Math.exp(-(t - settle) * 18) : 1); const k = 0.006 + 0.03 * Math.min(1, x); a += k * (r() - a); c += k * (r() - c); L[i] = a * env * gain; R[i] = c * env * gain; } for (const x of [L, R]) filt(x, biq('hp', 120)); return [L, R]; };
  writeWav(path.join(DIR, 'air-full.wav'), ...air(2.0, 0.32, 2.4));
  writeWav(path.join(DIR, 'air-short.wav'), ...air(1.1, 0.22, 1.5));
}
