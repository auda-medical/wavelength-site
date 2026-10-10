// Original music and sound effects for the films, synthesised from scratch in this script (no samples, no licensed
// material): a warm pad, a soft plucked arpeggio with ping-pong delay, a sine bass, a gentle pulse after the intro,
// and a small reverb. Writes 48 kHz stereo WAVs to public/audio/music/ and public/audio/sfx/.
//   node scripts/music.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 48000;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// D major colour: Dmaj9, Bm11, Gmaj9, Asus2 (MIDI notes, low to high).
const CHORDS = [[50, 57, 61, 64, 66, 69], [47, 54, 57, 62, 64, 66], [43, 50, 54, 57, 62, 66], [45, 52, 57, 59, 64, 69]];
const TONIC = [50, 57, 62, 64, 66, 69, 74];

export function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
// Deterministic noise, so every render is identical.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

// Schroeder reverb (four combs, two all-passes) per channel.
function reverb(x, { mix = 0.22, size = 1 } = {}) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d: Math.round(d * size * RATE / 44100), buf: null, i: 0 }));
  const aps = [225, 556].map((d) => ({ d: Math.round(d * RATE / 44100), buf: null, i: 0 }));
  combs.forEach((c) => { c.buf = new Float32Array(c.d); }); aps.forEach((a) => { a.buf = new Float32Array(a.d); });
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) { const y = c.buf[c.i]; c.buf[c.i] = x[n] + y * 0.82; c.i = (c.i + 1) % c.d; s += y; }
    s *= 0.25;
    for (const a of aps) { const y = a.buf[a.i]; const v = s + y * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; s = y - v * 0.5; }
    out[n] = x[n] * (1 - mix) + s * mix;
  }
  return out;
}

// sections: [{ at: seconds, pulse: bool, energy: 0..1 }]; ends on the tonic, held and faded.
export function compose(seconds, { bpm = 72, sections = [], seed = 7, endHold = 5 } = {}) {
  const N = Math.round(seconds * RATE), L = new Float32Array(N), R = new Float32Array(N);
  const beat = 60 / bpm, bar = beat * 4, chordLen = bar * 2;
  const rand = rng(seed);
  const sec = (t) => { let s = { pulse: false, energy: 0.5 }; for (const x of sections) if (t >= x.at) s = x; return s; };
  const endAt = seconds - endHold - 1.5;
  const chordAt = (t) => (t >= endAt ? TONIC : CHORDS[Math.floor(t / chordLen) % CHORDS.length]);
  // Pad: additive, slightly detuned partials with slow crossfades between chords.
  const step = 64; // compute envelope every 64 samples
  for (let n = 0; n < N; n += step) {
    const t = n / RATE;
    const ch = chordAt(t);
    const phaseInChord = t >= endAt ? (t - endAt) : (t % chordLen);
    const fadeIn = Math.min(1, phaseInChord / 1.6);
    const e = sec(t).energy;
    const master = Math.min(1, t / 4) * Math.min(1, (seconds - t) / 3.5);
    for (let k = 0; k < step && n + k < N; k++) {
      const tt = (n + k) / RATE;
      let l = 0, r = 0;
      for (let j = 0; j < ch.length; j++) {
        const f = midi(ch[j] + 12);
        for (let h = 1; h <= 4; h++) {
          const a = 1 / Math.pow(h, 1.6) / ch.length;
          l += a * Math.sin(2 * Math.PI * f * h * 0.9985 * tt + j);
          r += a * Math.sin(2 * Math.PI * f * h * 1.0015 * tt + j * 1.3);
        }
      }
      const g = 0.16 * (0.55 + 0.45 * e) * fadeIn * master;
      L[n + k] += l * g; R[n + k] += r * g;
    }
  }
  // Pluck arpeggio (eighth notes) from chord tones an octave up, with ping-pong delay.
  const pl = new Float32Array(N), pr = new Float32Array(N);
  const eighth = beat / 2;
  for (let t = bar * 2; t < seconds - endHold; t += eighth) {
    const ch = chordAt(t);
    const idx = Math.floor(t / eighth);
    const pattern = [1, 3, 4, 2, 5, 3, 4, 2];
    const note = ch[pattern[idx % 8] % ch.length] + 12;
    const f = midi(note), start = Math.round(t * RATE), len = Math.round(1.4 * RATE);
    const e = sec(t).energy;
    const vel = (0.05 + 0.05 * e) * (idx % 2 ? 0.75 : 1) * (1 + rand() * 0.08);
    for (let i = 0; i < len && start + i < N; i++) {
      const tt = i / RATE, env = Math.exp(-tt * 4.2) * Math.min(1, tt * 400);
      const v = vel * env * (Math.sin(2 * Math.PI * f * tt) + 0.35 * Math.sin(4 * Math.PI * f * tt) * Math.exp(-tt * 9));
      const pan = 0.5 + 0.3 * Math.sin(idx * 0.9);
      pl[start + i] += v * (1 - pan); pr[start + i] += v * pan;
    }
  }
  const d = Math.round(beat * 0.75 * RATE);
  for (let i = d; i < N; i++) { pl[i] += pr[i - d] * 0.32; pr[i] += pl[i - d] * 0.32; }
  for (let i = 0; i < N; i++) { L[i] += pl[i]; R[i] += pr[i]; }
  // Bass: the chord root, soft sine with a slow swell.
  for (let n = 0; n < N; n++) {
    const t = n / RATE, ch = chordAt(t), f = midi(ch[0] - 12);
    const ph = t >= endAt ? t - endAt : t % chordLen;
    const env = Math.min(1, ph / 0.8) * Math.min(1, (seconds - t) / 3) * Math.min(1, t / 6);
    const v = 0.11 * env * Math.sin(2 * Math.PI * f * t) * (0.6 + 0.4 * sec(t).energy);
    L[n] += v; R[n] += v;
  }
  // Pulse: a soft low thump on each beat where a section asks for it.
  for (let t = 0; t < seconds - endHold; t += beat) {
    if (!sec(t).pulse) continue;
    const start = Math.round(t * RATE);
    for (let i = 0; i < RATE * 0.35 && start + i < N; i++) {
      const tt = i / RATE, f = 55 + 40 * Math.exp(-tt * 30);
      const v = 0.12 * sec(t).energy * Math.exp(-tt * 9) * Math.sin(2 * Math.PI * f * tt);
      L[start + i] += v; R[start + i] += v;
    }
  }
  const RL = reverb(L, { mix: 0.28 }), RR = reverb(R, { mix: 0.28, size: 1.04 });
  // Normalise to a -16 dBFS RMS bed (narration sits on top), with a soft limiter.
  let s = 0; for (let i = 0; i < N; i++) s += RL[i] * RL[i] + RR[i] * RR[i];
  const g = Math.pow(10, -16 / 20) / Math.sqrt(s / (2 * N));
  for (let i = 0; i < N; i++) { RL[i] = Math.tanh(RL[i] * g * 1.1) / 1.1; RR[i] = Math.tanh(RR[i] * g * 1.1) / 1.1; }
  return [RL, RR];
}

function sfx() {
  const rand = rng(3);
  const make = (sec) => [new Float32Array(Math.round(sec * RATE)), new Float32Array(Math.round(sec * RATE))];
  // Whoosh: noise through a sweeping one-pole band.
  { const [l, r] = make(1.1); let lp = 0, hp = 0; for (let i = 0; i < l.length; i++) { const t = i / RATE, x = rand(); const c = 0.02 + 0.25 * Math.sin(Math.PI * t / 1.1); lp += c * (x - lp); hp = lp - hp * 0.0; const env = Math.sin(Math.PI * Math.min(1, t / 1.1)) ** 2; l[i] = lp * env * 0.5; r[i] = lp * env * 0.5 * (0.7 + 0.3 * Math.sin(t * 6)); } writeWav(path.join(ROOT, 'public/audio/sfx/whoosh.wav'), l, r); }
  // Tap: a short, soft click.
  { const [l, r] = make(0.12); for (let i = 0; i < l.length; i++) { const t = i / RATE, v = 0.35 * Math.exp(-t * 90) * Math.sin(2 * Math.PI * 1800 * t * Math.exp(-t * 8)); l[i] = v; r[i] = v; } writeWav(path.join(ROOT, 'public/audio/sfx/tap.wav'), l, r); }
  // Swell: a rising chord into the "free" moment and the end frame.
  { const [l, r] = make(2.4); for (let i = 0; i < l.length; i++) { const t = i / RATE; let v = 0; for (const n of [62, 66, 69, 74]) v += Math.sin(2 * Math.PI * midi(n) * t) * 0.06; const env = Math.pow(t / 2.4, 2.2) * Math.min(1, (2.4 - t) * 12); l[i] = v * env; r[i] = v * env; } const RL = reverb(l, { mix: 0.4 }), RR = reverb(r, { mix: 0.4, size: 1.05 }); writeWav(path.join(ROOT, 'public/audio/sfx/swell.wav'), RL, RR); }
}

// Version 1 tracks: written only when this script is run directly (version 2 imports compose and writeWav).
const TRACKS = {
  flagship: { seconds: 142, sections: [{ at: 0, pulse: false, energy: 0.35 }, { at: 24, pulse: true, energy: 0.55 }, { at: 98, pulse: true, energy: 0.7 }, { at: 112, pulse: true, energy: 0.85 }] },
  short: { seconds: 46, bpm: 84, sections: [{ at: 0, pulse: false, energy: 0.5 }, { at: 4, pulse: true, energy: 0.75 }, { at: 32, pulse: true, energy: 0.9 }] },
  ad: { seconds: 24, bpm: 80, sections: [{ at: 0, pulse: false, energy: 0.55 }, { at: 3, pulse: true, energy: 0.8 }] },
  sample: { seconds: 22, sections: [{ at: 0, pulse: true, energy: 0.6 }] },
};
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) for (const [name, o] of Object.entries(TRACKS)) {
  const [L, R] = compose(o.seconds, o);
  writeWav(path.join(ROOT, `public/audio/music/${name}.wav`), L, R);
  console.log('music', name, o.seconds, 's');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) { sfx(); console.log('sfx whoosh, tap, swell'); }
