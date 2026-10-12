// Version 3 sound accents for the logo reveal (original, synthesised, no samples): a soft air movement under the camera
// pullback and a quiet, warm bell tone at the moment the emblem settles. Full reveal: settle at 2.0 s; short: 1.1 s.
//   node scripts/sfx-v3.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeWav } from './music.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 48000;
function make(seconds, settle) {
  const n = Math.round(seconds * RATE), L = new Float64Array(n), R = new Float64Array(n);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // Air: noise through a gentle low-pass whose cut-off rises then falls with the move; swells into the settle.
  let lpL = 0, lpR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.pow(Math.min(1, t / (settle * 0.8)), 2) * Math.exp(-Math.max(0, t - settle * 0.8) * 4.5);
    const cut = 0.008 + 0.05 * Math.min(1, t / settle);
    lpL += cut * (rnd() - lpL); lpR += cut * (rnd() - lpR);
    L[i] += lpL * env * 0.55; R[i] += lpR * env * 0.55;
  }
  // Bell at the settle: a few soft partials with gentle attack and long decay, and a warm low tone beneath.
  const partials = [[392, 0.09, 1.6], [784, 0.045, 1.1], [1176.6, 0.022, 0.8], [1568, 0.012, 0.6], [98, 0.05, 1.4]];
  for (let i = Math.round(settle * RATE); i < n; i++) {
    const t = i / RATE - settle; const a = Math.min(1, t / 0.012);
    let v = 0; for (const [fq, amp, dec] of partials) v += Math.sin(2 * Math.PI * fq * t) * amp * Math.exp(-t / dec);
    L[i] += v * a; R[i] += v * a * 0.96;
  }
  // A short, soft room: two feedback delays per side.
  for (const [B, d1, d2] of [[L, 0.031, 0.047], [R, 0.037, 0.053]]) {
    const a = Math.round(d1 * RATE), b = Math.round(d2 * RATE);
    for (let i = b; i < n; i++) B[i] += 0.28 * B[i - a] + 0.2 * B[i - b];
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.5 / peak; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  const fade = Math.round(0.3 * RATE); for (let i = 0; i < fade; i++) { const k = i / fade; L[n - 1 - i] *= k; R[n - 1 - i] *= k; }
  return [L, R];
}
fs.mkdirSync(path.join(ROOT, 'public/audio-v3/sfx'), { recursive: true });
for (const [name, secs, settle] of [['reveal', 4.2, 2.0], ['reveal-short', 3.0, 1.1]]) {
  const [L, R] = make(secs, settle);
  writeWav(path.join(ROOT, `public/audio-v3/sfx/${name}.wav`), L, R);
  console.log('sfx', name, secs, 's, settle at', settle, 's');
}
