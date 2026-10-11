// Closing tagline audition 2: assembles the three finalists chosen by select-tagline-a2.mjs from the natural whole-line
// takes in tts-lab/takes/v4/tagline-a2 ("Wavelength. Tune in. Gain clarity." generated as one line in voice 4). The only
// edit: where the pause after "Tune in." is shorter than 0.65 s (the pause the owner liked in Take 2), silence is added in
// the middle of the existing pause (10 ms fades inside the silence; the voice itself is untouched: no pitch shifting,
// no time-stretching). Writes public/audio-v4/raw/tagline-a2/T<n>.wav; then `node scripts/voice-v2.mjs --v4 tagline-a2`
// gives them the same trim, gentle compression and level as every narration line.
//   node scripts/tagline-a2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = path.resolve(ROOT, '..', '..', 'tts-lab', 'takes', 'v4', 'tagline-a2');
const OUT = path.join(ROOT, 'public/audio-v4/raw/tagline-a2');
export const FINALISTS = [
  { id: 'T1', src: 'tag-light-0.wav', label: 'Take 1: brighter resolution', desc: '"Gain clarity" lifts slightly above "Tune in" and is brighter, then settles gently.' },
  { id: 'T2', src: 'full-plain-1.wav', label: 'Take 2: warm and steady', desc: 'Calm "Tune in"; "Gain clarity" warmer and brighter, settling a little further.' },
  { id: 'T3', src: 'full-light-2.wav', label: 'Take 3: lighter and quicker', desc: 'A lighter, quicker reading; "Gain clarity" brighter with a clear settle.' },
];
const PAUSE = 0.65;

// 16-bit or float WAV reader/writer for mono takes (tts-lab writes 24 kHz PCM16).
function read(f) {
  const b = fs.readFileSync(f); let o = 12, rate = 24000, bits = 16, fmt = 1, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') { fmt = b.readUInt16LE(o + 8); rate = b.readUInt32LE(o + 12); bits = b.readUInt16LE(o + 22); } if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data.length / (bits / 8), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = fmt === 3 ? data.readFloatLE(i * 4) : data.readInt16LE(i * 2) / 32768;
  return { x, rate };
}
function write(f, x, rate) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b);
}
// Silent runs inside the speech: 10 ms frames more than 35 dB below the loudest frame, at least 150 ms long.
function pauses(x, rate) {
  const w = Math.round(0.01 * rate), lv = [];
  for (let s = 0; s + w <= x.length; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += x[i] * x[i]; lv.push(10 * Math.log10(a / w + 1e-12)); }
  const top = Math.max(...lv), quiet = lv.map((v) => v < top - 35);
  const first = quiet.indexOf(false), last = quiet.lastIndexOf(false), out = [];
  for (let i = first; i <= last; i++) if (quiet[i]) { let j = i; while (j <= last && quiet[j]) j++; if (j - i >= 15) out.push([i * w, j * w]); i = j; }
  return out;
}
const report = [];
for (const t of FINALISTS) {
  const { x, rate } = read(path.join(LAB, t.src));
  const ps = pauses(x, rate);
  if (ps.length !== 2) throw new Error(`${t.src}: expected two pauses, found ${ps.length}`);
  const [a, b] = ps[1], have = (b - a) / rate;
  let y = x, added = 0;
  if (have < PAUSE) {
    const mid = Math.round((a + b) / 2), add = Math.round((PAUSE - have) * rate), f = Math.round(0.01 * rate);
    const head = Float32Array.from(x.subarray(0, mid)), tail = Float32Array.from(x.subarray(mid));
    for (let i = 0; i < f; i++) { head[head.length - 1 - i] *= i / f; tail[i] *= i / f; }
    y = new Float32Array(x.length + add); y.set(head, 0); y.set(tail, head.length + add); added = +(add / rate).toFixed(3);
  }
  write(path.join(OUT, `${t.id}.wav`), y, rate);
  report.push({ ...t, pauseAfterTuneIn: +have.toFixed(2), silenceAdded: added, seconds: +(y.length / rate).toFixed(2) });
}
fs.writeFileSync(path.join(OUT, 'finalists.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
