// Measures the logo-sound options inside the logo preview mixes (public/audio-v4/mix/<option>/stems): how far the logo
// sound stands above the music just after each settle, how far the reflection (echo version minus dry version) sits
// relative to the music (broadband and within a third of an octave of its pitch), and how far the narration stands above the reflection where they overlap. K-weighted RMS over
// short windows (too short for gated loudness). Writes public/audio-v4/signature/integration.json.
//   node scripts/signature-measure.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, filt, biq, RATE } from './music-v4/engine.mjs';
import { timeline4, SUBSETS, FPS, SETTLE } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8')), S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
const tl = timeline4('flagship', T, S, SUBSETS.logo);
const settles = { brand: (tl.byScene.brand.from + SETTLE.full) / FPS, end: (tl.byScene.end.from + SETTLE.short) / FPS };
const narration = { brand: tl.byScene.brand.voiceFrom / FPS, end: tl.byScene.end.voiceFrom / FPS };
const K = (x) => filt(filt(Float64Array.from(x), [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]), [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]);
const kr = (w, a, b) => { const l = K(w.L), r = K(w.R); let s = 0, n = 0; for (let i = Math.round(a * RATE); i < Math.round(b * RATE); i++) { s += l[i] * l[i] + r[i] * r[i]; n++; } return 10 * Math.log10(s / n + 1e-20); };
const stem = (k, f) => readWav(path.join(ROOT, `public/audio-v4/mix/${k}/stems/logo-${f}.wav`));
const results = {};
for (const k of ['signature', 'S2d', 'S2e', 'S3d', 'S3e', 'S4d', 'S4e']) {
  const lg = stem(k, 'logo'), mu = stem(k, 'music'), vc = stem(k, 'voice'), r = {};
  for (const p of ['brand', 'end']) {
    const s = settles[p];
    r[`${p}LogoOverMusic`] = +(kr(lg, s - 0.05, s + 0.45) - kr(mu, s - 0.05, s + 0.45)).toFixed(1);
    if (/^S\de$/.test(k)) {
      const d = stem(k.slice(0, 2) + 'd', 'logo'), ref = { L: Float32Array.from(lg.L, (v, i) => v - d.L[i]), R: Float32Array.from(lg.R, (v, i) => v - d.R[i]) };
      r[`${p}ReflectionOverMusic`] = +(kr(ref, s + 0.15, s + 0.4) - kr(mu, s + 0.15, s + 0.4)).toFixed(1);
      // In-band: within a third of an octave of the reflection's pitch, where masking actually happens.
      const pitch = k === 'S4e' ? 1174.66 : 880, bp = (w) => ({ L: filt(filt(Float32Array.from(w.L), biq('bp', pitch, 4.3)), biq('bp', pitch, 4.3)), R: filt(filt(Float32Array.from(w.R), biq('bp', pitch, 4.3)), biq('bp', pitch, 4.3)) });
      const rms = (w, a2, b2) => { let q = 0, m = 0; for (let i = Math.round(a2 * RATE); i < Math.round(b2 * RATE); i++) { q += w.L[i] * w.L[i] + w.R[i] * w.R[i]; m++; } return 10 * Math.log10(q / m + 1e-20); };
      r[`${p}ReflectionOverMusicInBand`] = +(rms(bp(ref), s + 0.15, s + 0.4) - rms(bp(mu), s + 0.15, s + 0.4)).toFixed(1);
      const a = Math.max(narration[p], s + 0.15), b = s + 0.6;
      r[`${p}VoiceOverReflection`] = b > a ? +(kr(vc, a, b) - kr(ref, a, b)).toFixed(1) : null;
    }
  }
  results[k] = r; console.log(k, JSON.stringify(r));
}
fs.writeFileSync(path.join(ROOT, 'public/audio-v4/signature/integration.json'), JSON.stringify({ settles, narration, results }, null, 1));
