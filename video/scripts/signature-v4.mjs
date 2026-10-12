// Final Wavelength logo-sound comparison: four options, with a subtle sonar-like reflection on options 2 to 4.
//   S1   the original two-note signature (D5 then A5 on the settle), unchanged: its own code in sfx-v4.mjs
//   S2   refined two-note: warmer and cleaner tones (no glassy partial, no tick, softer attack, less room)
//   S3   C1, the single rising sonar sweep (sonar-v4.mjs, unchanged)
//   S4   sonar-musical hybrid: a rounded sonar ping on A5, then a soft tonal resolution that locks onto D6 on the settle
// Options 2 to 4 come dry (d) and with the reflection (e). The reflection is one quiet, softened copy of the arrival
// tone only: delayed about 150 ms, about 18 dB down, low-passed (warm), its attack rounded off so it reads as a
// returning wave rather than a second ping, and given a short decay of its own. Its level is set per option so that
// its loudest moment sits about 18 to 19 dB under the main tone's (the low-pass and soft onset take some level away). It never repeats the sweep or the
// first note and never adds a new pitch. Also written: the reflection layer alone, at exactly the level it has inside
// the echo version (quiet by design), so it can be heard and identified without making anything louder.
// All files: the hit (the settle) at 0.35 s, normalised to the same maximum momentary loudness (-16 LUFS).
//   node scripts/signature-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, biq, filt, reverb, writeWav, readWav, truePeak } from './music-v4/engine.mjs';
import { make as makeOriginal } from './sfx-v4.mjs';
import { SONAR, voice, room, momentaryMax, TARGET_MOMENTARY } from './sonar-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/audio-v4/signature');
const PRE = 0.35, LEN = PRE + 1.15, TAU = 2 * Math.PI;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12);
export const ECHO = { delay: 0.15, db: -18, lp: 2200, soften: 0.022, decay: 0.24, pan: 0.3 };
const buf = () => [new Float32Array(Math.round(LEN * RATE)), new Float32Array(Math.round(LEN * RATE))];

// The reflection of an arrival layer that starts at `from` seconds.
function reflect([L, R], from, o = ECHO) {
  const n = L.length, m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (L[i] + R[i]) / 2;
  filt(m, biq('lp', o.lp, 0.6)); filt(m, biq('lp', o.lp * 1.4, 0.6)); filt(m, biq('hp', 300, 0.7));
  const d = Math.round(o.delay * RATE), s0 = Math.round(from * RATE), g = Math.pow(10, o.db / 20);
  const gl = Math.cos((o.pan + 1) * Math.PI / 4) * Math.SQRT2, gr = Math.sin((o.pan + 1) * Math.PI / 4) * Math.SQRT2;
  const eL = new Float32Array(n), eR = new Float32Array(n);
  for (let i = s0; i + d < n; i++) {
    const t = (i - s0) / RATE;
    const env = Math.min(1, t / o.soften) ** 2 * Math.exp(-t / o.decay);
    const v = m[i] * g * env; eL[i + d] = v * gl; eR[i + d] = v * gr;
  }
  return [eL, eR];
}
const add = (a, b, k = 1) => { for (let c = 0; c < 2; c++) for (let i = 0; i < a[c].length; i++) a[c][i] += b[c][i] * k; return a; };

// S2: warmer, cleaner two-note tones.
function warmTone([L, R], t0, f, gain, decay) {
  const s = Math.round(t0 * RATE), len = Math.round(decay * 1.5 * RATE), k = 6.9 / decay;
  const P = [[1, 1, 1], [2, 0.16, 0.55], [3, 0.03, 0.35]];
  for (let i = 0; i < len && s + i < L.length; i++) {
    const t = i / RATE; let v = 0;
    for (const [r, a, dd] of P) v += a * Math.exp(-k / dd * t) * Math.sin(TAU * f * r * t);
    v *= gain * (1 - Math.exp(-t / 0.006));
    L[s + i] += v; R[s + i] += v * 0.98;
  }
}
function smallRoom(b, mix) { const [rl, rr] = reverb(Float32Array.from(b[0]), Float32Array.from(b[1]), { room: 0.55, damp: 0.6, pre: 0.008 }); filt(rl, biq('hp', 350)); filt(rr, biq('hp', 350)); for (let i = 0; i < b[0].length; i++) { b[0][i] += rl[i] * mix; b[1][i] += rr[i] * mix; } }

const OPTIONS = {
  S1: { pitch: 880, name: 'Original two-note signature', desc: 'Unchanged reference: D5 rising to A5 on the settle.', build: () => { const [L, R] = makeOriginal(LEN, PRE, 'signature', 0); return { main: [L, R] }; } },
  S2: { pitch: 880, name: 'Refined two-note signature', desc: 'The same rising D5 to A5, warmer and cleaner; the reflection follows the arrival note.', build: () => {
    const first = buf(), second = buf();
    warmTone(first, PRE - 0.13, note(74), 0.34, 0.45); warmTone(second, PRE, note(81), 0.42, 0.75);
    const main = add(add(buf(), first), second); smallRoom(main, 0.16);
    return { main, echo: reflect(second, PRE, { ...ECHO, db: -13.2 }) };
  } },
  S3: { pitch: 880, name: 'Rising sonar sweep (C1)', desc: 'One clean rising sweep onto A5; the reflection is of the ring after it lands, never the sweep itself.', build: () => {
    const main = buf(); SONAR.C1.make([main[0], main[1]]);
    // Source for the reflection: only what sounds from the settle onwards (a 10 ms fade in), so the sweep is not repeated.
    const ring = [Float32Array.from(main[0]), Float32Array.from(main[1])], s0 = Math.round(PRE * RATE), f = Math.round(0.01 * RATE);
    for (let c = 0; c < 2; c++) for (let i = 0; i < s0 + f; i++) ring[c][i] *= i < s0 ? 0 : (i - s0) / f;
    return { main, echo: reflect(ring, PRE, { ...ECHO, db: -12.4 }) };
  } },
  S4: { pitch: 1174.66, name: 'Sonar-musical hybrid', desc: 'A rounded sonar ping on A5, then a soft tonal resolution that locks onto D6 on the settle; the reflection follows the resolution.', build: () => {
    const ping = buf(), res = buf();
    voice(ping, PRE - 0.12, { f0: note(80.6), f1: note(81), glide: 0.05, attack: 0.005, T60: 0.42, partials: [[1, 1, 1], [2, 0.06, 0.5]], beat: 0.9, beatAmp: 0.4, gain: 0.9 });
    voice(res, PRE, { f0: note(85.7), f1: note(86), glide: 0.04, attack: 0.012, T60: 0.7, partials: [[1, 1, 1], [2, 0.14, 0.6], [0.5, 0.08, 0.5]], beat: 0.5, beatAmp: 0.2, gain: 0.8 });
    const main = add(add(buf(), ping), res); room(main, 0.08);
    return { main, echo: reflect(res, PRE, { ...ECHO, db: -11.1 }) };
  } },
};

function finish(L, R) {
  for (const x of [L, R]) filt(x, biq('hp', 150, 0.7));
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  let end = L.length - 1; while (end > 0 && Math.max(Math.abs(L[end]), Math.abs(R[end])) < pk * 0.001) end--;
  end = Math.min(L.length, end + Math.round(0.03 * RATE));
  return end;
}
const dbRatio = (a, b) => +(momentaryMax(...a) - momentaryMax(...b)).toFixed(1);
const speechTail = ([L, R], at) => { const m = Float32Array.from(L, (v, i) => (v + R[i]) / 2); filt(m, biq('hp', 300)); filt(m, biq('lp', 3400)); const w = (a, b) => { let s = 0, n = 0; for (let i = Math.round(a * RATE); i < Math.min(m.length, Math.round(b * RATE)); i++) { s += m[i] * m[i]; n++; } return n ? s / n : 0; }; let pk = 0; for (let a = 0; a + 0.05 < m.length / RATE; a += 0.01) pk = Math.max(pk, w(a, a + 0.05)); const t = w(at, at + 0.1); return t ? +(10 * Math.log10(t / pk)).toFixed(1) : null; };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.mkdirSync(DIR, { recursive: true });
  const meta = {};
  for (const [id, o] of Object.entries(OPTIONS)) {
    const { main, echo } = o.build();
    const versions = echo ? { [`${id}d`]: main, [`${id}e`]: add([Float32Array.from(main[0]), Float32Array.from(main[1])], echo) } : { [id]: main };
    for (const [vid, v] of Object.entries(versions)) {
      const end = finish(v[0], v[1]);
      let [L, R] = v.map((x) => x.slice(0, end));
      const fo = Math.round(0.03 * RATE); for (let i = 0; i < fo; i++) { const k = i / fo; L[L.length - 1 - i] *= k; R[R.length - 1 - i] *= k; }
      const g = Math.pow(10, (TARGET_MOMENTARY - momentaryMax(L, R)) / 20); for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
      writeWav(path.join(DIR, `${vid}.wav`), L, R);
      const r = { option: id, name: o.name, desc: o.desc, echo: vid.endsWith('e'), hit: PRE, pitch: o.pitch, seconds: +(L.length / RATE).toFixed(3), afterHit: +(L.length / RATE - PRE).toFixed(3), truePeak: +truePeak(L, R).toFixed(2), gain: +(20 * Math.log10(g)).toFixed(2), leftAtNarrationDb: speechTail([L, R], PRE + 0.5) };
      if (vid.endsWith('e')) {
        // The reflection layer alone, at exactly its level inside the echo version.
        const e = echo.map((x) => Float32Array.from(x.slice(0, end), (s) => s * g)); for (const x of e) filt(x, biq('hp', 150, 0.7));
        writeWav(path.join(DIR, `${id}-reflection-only.wav`), e[0], e[1]);
        const mainOnly = main.map((x) => Float32Array.from(x.slice(0, end), (s) => s * g));
        r.reflectionBelowMainDb = dbRatio(mainOnly, e); // momentary peaks: how far the reflection sits under the main tone
        r.reflectionDelayMs = Math.round(ECHO.delay * 1000);
        r.loudnessCostDb = +(meta[`${id}d`].gain - r.gain).toFixed(2); // how much the echo version was turned down to match
      }
      meta[vid] = r; console.log(vid, JSON.stringify(r));
    }
  }
  fs.writeFileSync(path.join(DIR, 'signature.json'), JSON.stringify(meta, null, 1));
}
