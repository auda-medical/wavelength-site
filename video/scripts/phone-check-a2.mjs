// Audition 2: how long each logo sound is heard above the music, on headphones (full band) and on a phone speaker
// (simulated: mono, nothing below 350 Hz or above 7 kHz, a small speaker's presence peak at 2.5 kHz). Uses the stems of
// the a2-* mixes (logo and music, scaled exactly as in the master). "Heard" = the logo's 10 ms level above the music's
// in the same band; reported from each settle until it falls below for good. Also writes a phone-simulated copy of each
// preview soundtrack for listening (public/audio-v4/mix/a2-<id>/logo-phone.wav).
//   node scripts/phone-check-a2.mjs [ids]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, biq, filt, readWav, writeWav } from './music-v4/engine.mjs';
import { timeline4, SUBSETS, SETTLE, FPS } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = (process.argv[2] || 'TN1,MX,L1,L2,L3').split(',');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8')), S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
const tl = timeline4('flagship', T, S, SUBSETS.logo);
const settles = { brand: (tl.byScene.brand.from + SETTLE.full) / FPS, end: (tl.byScene.end.from + SETTLE.short) / FPS };
const phone = (L, R) => { const m = Float32Array.from(L, (v, i) => (v + R[i]) / 2); filt(m, biq('hp', 350, 0.8)); filt(m, biq('hp', 350, 0.8)); filt(m, biq('lp', 7000, 0.7)); filt(m, biq('peak', 2500, 1.2, 4)); return m; };
const env = (x) => { const w = 480, o = []; for (let s = 0; s + w <= x.length; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += x[i] * x[i]; o.push(10 * Math.log10(a / w + 1e-30)); } return o; };
function heardFor(logo, music, settle) {
  const a = Math.round(settle * 100);
  let last = a;
  for (let i = a; i < Math.min(logo.length, a + 300); i++) if (logo[i] > music[i]) last = i;
  return +((last - a) / 100).toFixed(2);
}
const out = {};
for (const id of ids) {
  const dir = path.join(ROOT, 'public/audio-v4/mix', `a2-${id}`);
  const lg = readWav(path.join(dir, 'stems/logo-logo.wav')), mu = readWav(path.join(dir, 'stems/logo-music.wav')), mix = readWav(path.join(dir, 'logo.wav'));
  const full = (w) => Float32Array.from(w.L, (v, i) => (v + w.R[i]) / 2);
  const eLf = env(full(lg)), eMf = env(full(mu)), eLp = env(phone(lg.L, lg.R)), eMp = env(phone(mu.L, mu.R));
  out[id] = {};
  for (const [k, s] of Object.entries(settles)) out[id][k] = { headphonesHeardFor: heardFor(eLf, eMf, s), phoneHeardFor: heardFor(eLp, eMp, s) };
  const p = phone(mix.L, mix.R); writeWav(path.join(dir, 'logo-phone.wav'), p, p);
  console.log(id, JSON.stringify(out[id]));
}
fs.writeFileSync(path.join(ROOT, 'public/audio-v4/linger/phone-check.json'), JSON.stringify({ settles, results: out }, null, 1));
