// Checks the decay comparison mixes (public/audio-v4/mix/d-<sound>/stems, logo preview excerpt):
// - the music automation around each settle (mixed music divided by the composed music: a flat line means the music
//   level does not change while the logo sounds);
// - how long each logo sound stays audible above the music within its pitch band after the settle (the audible tail
//   in context, so the longer versions can be shown to be genuinely longer);
// - how far the logo tail sits under the narration when the next line begins;
// - any rise in the logo stem after it has started to fade (a second attack or return).
//   node scripts/decay-measure.mjs [prefix=d-] [sounds]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, filt, biq, RATE } from './music-v4/engine.mjs';
import { timeline4, SUBSETS, FPS, SETTLE } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = process.argv[2] || 'd-';
const sounds = (process.argv[3] || 'signature,TN1,TN2,C1,SW1,SW2,MX').split(',');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8')), S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
const tl = timeline4('flagship', T, S, SUBSETS.logo);
const settles = { brand: (tl.byScene.brand.from + SETTLE.full) / FPS, end: (tl.byScene.end.from + SETTLE.short) / FPS };
const voiceAt = { brand: tl.byScene.brand.voiceFrom / FPS, end: tl.byScene.end.voiceFrom / FPS };
const raw = readWav(path.join(ROOT, 'public/audio-v4/music/A/logo.wav'));
const e = (w, a, b) => { let s = 0; for (let i = Math.max(0, Math.round(a * RATE)); i < Math.round(b * RATE); i++) s += w.L[i] * w.L[i] + w.R[i] * w.R[i]; return s / Math.max(1, Math.round((b - a) * RATE)); };
const band = (w) => ({ L: filt(filt(Float32Array.from(w.L), biq('bp', 880, 4.3)), biq('bp', 880, 4.3)), R: filt(filt(Float32Array.from(w.R), biq('bp', 880, 4.3)), biq('bp', 880, 4.3)) });
const out = { settles, narration: voiceAt, results: {} };
for (const k of sounds) {
  const dir = path.join(ROOT, `public/audio-v4/mix/${prefix}${k}/stems`);
  const mu = readWav(path.join(dir, 'logo-music.wav')), lg = readWav(path.join(dir, 'logo-logo.wav')), vc = readWav(path.join(dir, 'logo-voice.wav'));
  const lb = band(lg), mb = band(mu), r = {};
  for (const p of ['brand', 'end']) {
    const s = settles[p];
    // Automation: 100 ms steps from 0.5 s before to 1.2 s after the settle, relative to the first step.
    const steps = []; for (let t = -0.5; t < 1.2; t += 0.1) steps.push(10 * Math.log10(e(mu, s + t, s + t + 0.1) / e(raw, s + t, s + t + 0.1)));
    r[`${p}MusicAutomationDb`] = steps.map((v) => +(v - steps[0]).toFixed(1));
    // Audible tail in context: last 20 ms step (within 1.5 s) at which the logo is still above the music in its band.
    let last = 0; for (let t = 0; t < 1.5; t += 0.02) if (e(lb, s + t, s + t + 0.02) > e(mb, s + t, s + t + 0.02)) last = t + 0.02;
    r[`${p}AboveMusicInBandFor`] = +last.toFixed(2);
    // Logo under the voice when the next line starts (first 300 ms of speech).
    r[`${p}VoiceOverLogoTailDb`] = +(10 * Math.log10(e(vc, voiceAt[p], voiceAt[p] + 0.3) / e(lg, voiceAt[p], voiceAt[p] + 0.3))).toFixed(1);
    // Any rise in the logo after its peak (10 ms steps, down to 60 dB below).
    const lv = []; for (let t = s - 0.05; t < s + 1.5; t += 0.01) lv.push(10 * Math.log10(e(lg, t, t + 0.01) + 1e-30));
    const pk = Math.max(...lv), pi = lv.indexOf(pk); let lo = pk, rise = 0; for (let i = pi; i < lv.length && lv[i] > pk - 60; i++) { lo = Math.min(lo, lv[i]); rise = Math.max(rise, lv[i] - lo); }
    r[`${p}LogoReRiseDb`] = +rise.toFixed(1);
  }
  out.results[k] = r; console.log(k.padEnd(9), JSON.stringify(r));
}
fs.writeFileSync(path.join(ROOT, `public/audio-v4/decay/integration-${prefix.replace(/-$/, '') || 'd'}.json`), JSON.stringify(out, null, 1));
