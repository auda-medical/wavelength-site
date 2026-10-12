// Version 4 logo sound (original, synthesised; replaces the long version 3 bell). A short, warm, soft-edged tone that
// lands exactly as the emblem settles, with a natural decay of about 0.7 s:
// - signature (default): two notes rising a fifth, D5 then A5 (the last leap of the music's "W" motif), the second on
//   the settle;
// - single: one tone (A5 over a soft D5) on the settle, for comparison.
// Each tone: a sine fundamental with soft second and third partials and a faint glassy partial, a 4 ms attack (soft,
// not a click), a light felt tick for definition and a short room. A quiet air movement under the camera pullback.
// No sustained resonance, nothing above about 4 kHz of note, nothing like a monitor beep.
//   node scripts/sfx-v4.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, midi, rng, biq, filt, reverb, writeWav, lufs, truePeak } from './music-v4/engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAU = 2 * Math.PI;

// lenMul: how long the tone is computed, in multiples of its decay time (1.5 by default, as in every published file;
// longer only for the extended-decay versions, which need the tone to continue below audibility).
export function tone(L, R, t0, f, gain, decay = 0.7, lenMul = 1.5) {
  const s = Math.round(t0 * RATE), len = Math.round((decay * lenMul) * RATE), k = 6.9 / decay;
  const P = [[1, 1, 1], [2, 0.22, 0.6], [3, 0.06, 0.4], [4.2, 0.025, 0.25]];
  for (let i = 0; i < len && s + i < L.length; i++) {
    const t = i / RATE;
    let v = 0; for (const [r, a, d] of P) v += a * Math.exp(-k / d * t) * Math.sin(TAU * f * r * t);
    v *= gain * (1 - Math.exp(-t / 0.004));
    L[s + i] += v; R[s + i] += v * 0.97;
  }
  // Felt tick: 3 ms of band-passed noise, very quiet, gives the attack definition without a click.
  const r = rng(Math.round(f)), tk = new Float32Array(Math.round(0.006 * RATE));
  for (let i = 0; i < tk.length; i++) tk[i] = r() * Math.exp(-i / (0.0012 * RATE));
  filt(tk, biq('bp', 2600, 0.9));
  for (let i = 0; i < tk.length && s + i < L.length; i++) { L[s + i] += tk[i] * gain * 0.18; R[s + i] += tk[i] * gain * 0.18; }
}
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
export function make(seconds, settle, kind, airGain, { lenMul = 1.5, normalise = true } = {}) {
  const n = Math.round(seconds * RATE), L = new Float32Array(n), R = new Float32Array(n);
  air(L, R, settle, airGain);
  if (kind === 'signature') { tone(L, R, settle - 0.13, midi(74), 0.38, 0.55, lenMul); tone(L, R, settle, midi(81), 0.42, 0.75, lenMul); }
  else { tone(L, R, settle, midi(74), 0.22, 0.7, lenMul); tone(L, R, settle, midi(81), 0.4, 0.75, lenMul); }
  // Short room: a small reverb, mostly dry.
  const [rl, rr] = reverb(Float32Array.from(L), Float32Array.from(R), { room: 0.6, damp: 0.5, pre: 0.008 });
  filt(rl, biq('hp', 300)); filt(rr, biq('hp', 300));
  for (let i = 0; i < n; i++) { L[i] += rl[i] * 0.35; R[i] += rr[i] * 0.35; }
  for (const x of [L, R]) filt(x, biq('hp', 120));
  // Level: peaks at -6 dBFS; the mix sets the level under the narration and music.
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.5 / pk; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
  // The tail has already decayed: a 50 ms fade only removes the last of the room.
  const fo = Math.round(0.05 * RATE); for (let i = 0; i < fo; i++) { const k = i / fo; L[n - 1 - i] *= k; R[n - 1 - i] *= k; }
  return [L, R];
}
// Full reveal: settle at 2.0 s (frame 60); short reveal: 1.1 s (frame 33). Files end 1.1 s after the settle.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) for (const [name, settle, kind, ag] of [['reveal', 2.0, 'signature', 0.32], ['reveal-short', 1.1, 'signature', 0.22], ['reveal-single', 2.0, 'single', 0.32], ['reveal-short-single', 1.1, 'single', 0.22]]) {
  const [L, R] = make(settle + 1.1, settle, kind, ag);
  // Decay check: level of the last 100 ms relative to the peak.
  const tail = (() => { let p = 0, q = 0; const s = L.length - Math.round(0.1 * RATE); for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]); if (i >= s) q = Math.max(q, a); else p = Math.max(p, a); } return 20 * Math.log10(q / p); })();
  writeWav(path.join(ROOT, `public/audio-v4/sfx/${name}.wav`), L, R);
  console.log('sfx', name, (L.length / RATE).toFixed(2), 's, settle', settle, 's, tail', tail.toFixed(1), 'dB below peak, LUFS', lufs(L, R).toFixed(1), 'TP', truePeak(L, R).toFixed(1));
}
