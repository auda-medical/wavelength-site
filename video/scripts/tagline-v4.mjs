// Assembles the closing-tagline auditions in voice 4. Each take keeps the approved "Wavelength." (and its pause) from the
// current closing line f13, followed by a newly generated "Tune in. Gain clarity." (tts-lab/tagline_v4.py: natural
// generation only). The only edit is the length of the silent pause after "Tune in.", set by cutting or adding silence
// in the middle of the existing pause (10 ms fades, no change to the voice itself). Writes raw files to
// public/audio-v4/raw/tagline/; then run `node scripts/voice-v2.mjs --v4 tagline` (the same trim, gentle compression
// and level as every narration line) and this script again with --meta to write public/audio-v4/tagline/tagline.json.
//   node scripts/tagline-v4.mjs           (assemble)
//   node scripts/tagline-v4.mjs --meta    (after processing: write the take list with measurements)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = path.resolve(ROOT, '..', '..', 'tts-lab', 'takes', 'v4', 'tagline');
export const TAKES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/tagline-takes.json'), 'utf8'));

function read(file) {
  const b = fs.readFileSync(file); let off = 12, fmt = null, data = null;
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
// Silent runs (10 ms frames below the speech level minus 35 dB), longest first or in order.
function silences(x, rate, min = 0.15) {
  const h = Math.round(rate * 0.01), n = Math.floor(x.length / h), db = [];
  for (let i = 0; i < n; i++) { let s = 0; for (let k = i * h; k < (i + 1) * h; k++) s += x[k] * x[k]; db.push(10 * Math.log10(s / h + 1e-12)); }
  const top = [...db].sort((a, b) => b - a)[Math.floor(n * 0.03)], thr = top - 35;
  const runs = []; let s = null;
  for (let i = 0; i <= n; i++) { const q = i < n && db[i] < thr; if (q && s == null) s = i; if (!q && s != null) { if ((i - s) * 0.01 >= min) runs.push([s * h, i * h]); s = null; } }
  return runs;
}
const fadeOut = (x, n) => { for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n; return x; };
const fadeIn = (x, n) => { for (let i = 0; i < n; i++) x[i] *= i / n; return x; };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.argv.includes('--meta')) {
    const f13 = read(path.join(ROOT, 'public/audio-v4/raw/flagship/f13.wav'));
    const rate = f13.rate, f = Math.round(0.01 * rate);
    // "Wavelength." and the pause after it, as approved: from the start to the end of the first pause (minus 20 ms).
    const sil = silences(f13.x, rate).filter((r) => r[0] > 0.2 * rate);
    const first = sil[0];
    const wavelength = fadeOut(f13.x.slice(0, first[1] - Math.round(0.02 * rate)), f);
    for (const t of TAKES.filter((t) => t.src)) {
      const tk = read(path.join(LAB, `${t.src}.wav`));
      if (tk.rate !== rate) throw new Error('rate mismatch');
      // Trim the take's leading and trailing silence (keep 40 ms), then set the pause after "Tune in.".
      const runs = silences(tk.x, rate, 0.05);
      let a = 0, b = tk.x.length; if (runs.length && runs[0][0] === 0) a = Math.max(0, runs[0][1] - Math.round(0.04 * rate)); const last = runs[runs.length - 1]; if (last && last[1] >= tk.x.length - f) b = Math.min(tk.x.length, last[0] + Math.round(0.04 * rate));
      const y = tk.x.slice(a, b), inner = silences(y, rate, 0.15).filter((r) => r[0] > 0.1 * rate && r[1] < y.length - 0.1 * rate).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
      let out;
      if (inner && t.pause) {
        const mid = Math.round((inner[0] + inner[1]) / 2), cur = (inner[1] - inner[0]) / rate, change = Math.round((t.pause - cur) * rate);
        const head = fadeOut(y.slice(0, change < 0 ? mid + Math.floor(change / 2) : mid), f), tail = fadeIn(y.slice(change < 0 ? mid - Math.ceil(change / 2) : mid), f);
        out = Float64Array.from([...head, ...(change > 0 ? new Float64Array(change) : []), ...tail]);
        t.pauseWas = +cur.toFixed(2);
      } else out = y;
      const all = Float64Array.from([...wavelength, ...fadeIn(out, f)]);
      write(path.join(ROOT, `public/audio-v4/raw/tagline/${t.id}.wav`), all, rate);
      console.log(t.id, t.src, 'pause after "Tune in."', t.pauseWas, '->', t.pause, 's; length', (all.length / rate).toFixed(2), 's');
    }
  } else {
    const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8'));
    const takes = TAKES.map((t) => ({ id: t.id, label: t.label, desc: t.desc, src: t.src || null, pause: t.pause || null, file: t.src ? `audio-v4/tagline/${t.id}.wav` : 'audio-v4/flagship/f13.wav', seconds: t.src ? T[`tagline/${t.id}`].seconds : T['flagship/f13'].seconds, measure: t.measure || '' }));
    fs.mkdirSync(path.join(ROOT, 'public/audio-v4/tagline'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'public/audio-v4/tagline/tagline.json'), JSON.stringify({ takes }, null, 1));
    console.log('wrote tagline.json', takes.map((t) => `${t.id} ${t.seconds}s`).join(', '));
  }
}
