// Version 2 narration post-processing. Reads public/audio-v2/raw/<film>/<id>.wav (from tts-lab/narrate_v2.py), trims
// leading and trailing silence (keeping 60 ms), applies a gentle compressor (2:1 above -24 dBFS, slow release) so lines
// sit at a steady level, normalises speech to -18 dBFS RMS, keeps peaks under -1.5 dBFS, and writes
// public/audio-v2/<film>/<id>.wav plus public/audio-v2/timings.json (seconds and file per line).
//   node scripts/voice-v2.mjs [film ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'public/audio-v2');
const films = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(BASE, 'raw'));

function read(file) {
  const b = fs.readFileSync(file);
  let off = 12, fmt = null, data = null;
  while (off < b.length) { const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22), tag: b.readUInt16LE(off + 8) }; if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; } off += 8 + sz + (sz % 2); }
  const n = data.length / (fmt.bits / 8) / fmt.ch, x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (let c = 0; c < fmt.ch; c++) { const o = (i * fmt.ch + c) * (fmt.bits / 8); v += fmt.bits === 16 ? data.readInt16LE(o) / 32768 : fmt.tag === 3 ? data.readFloatLE(o) : data.readInt32LE(o) / 2147483648; } x[i] = v / fmt.ch; }
  return { x, rate: fmt.rate };
}
function write(file, x, rate) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf);
}
function trim(x, rate) {
  const win = Math.round(rate * 0.02), thr = 10 ** (-48 / 20);
  const loud = (i) => { let s = 0; for (let k = i; k < Math.min(x.length, i + win); k++) s += x[k] * x[k]; return Math.sqrt(s / win) > thr; };
  let a = 0; while (a < x.length && !loud(a)) a += win;
  let b = x.length - win; while (b > a && !loud(b)) b -= win;
  const pad = Math.round(rate * 0.06);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + win + pad));
}
function compress(x, rate) {
  const att = Math.exp(-1 / (rate * 0.008)), rel = Math.exp(-1 / (rate * 0.25)), thr = -24, ratio = 2;
  let env = 0; const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a; const db = 20 * Math.log10(env + 1e-9); const g = db > thr ? (thr + (db - thr) / ratio) - db : 0; y[i] = x[i] * 10 ** (g / 20); }
  return y;
}
function speechRms(x, rate) {
  const win = Math.round(rate * 0.05); const r = [];
  for (let i = 0; i + win < x.length; i += win) { let s = 0; for (let k = i; k < i + win; k++) s += x[k] * x[k]; r.push(Math.sqrt(s / win)); }
  let top = 0; for (const q of r) top = Math.max(top, q);
  const gate = top * 10 ** (-30 / 20); const v = r.filter((q) => q > gate);
  return Math.sqrt(v.reduce((a, q) => a + q * q, 0) / Math.max(1, v.length));
}
const T = fs.existsSync(path.join(BASE, 'timings.json')) ? JSON.parse(fs.readFileSync(path.join(BASE, 'timings.json'), 'utf8')) : {};
for (const film of films) {
  for (const f of fs.readdirSync(path.join(BASE, 'raw', film)).filter((n) => n.endsWith('.wav'))) {
    const id = f.replace('.wav', '');
    const { x, rate } = read(path.join(BASE, 'raw', film, f));
    let y = compress(trim(x, rate), rate);
    const g = 10 ** (-18 / 20) / speechRms(y, rate);
    y = y.map((v) => v * g);
    let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
    const lim = 10 ** (-1.5 / 20);
    if (peak > lim) y = y.map((v) => (Math.abs(v) > lim * 0.9 ? Math.sign(v) * (lim * 0.9 + (Math.abs(v) - lim * 0.9) * (lim * 0.1) / (peak - lim * 0.9)) : v));
    write(path.join(BASE, film, f), y, rate);
    T[`${film}/${id}`] = { seconds: +(y.length / rate).toFixed(3), file: `audio-v2/${film}/${f}` };
    console.log(`${film}/${id}: ${(y.length / rate).toFixed(2)} s`);
  }
}
fs.writeFileSync(path.join(BASE, 'timings.json'), JSON.stringify(T, null, 1));
