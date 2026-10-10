// A picture of a soundtrack, for checking structure without listening: a log-frequency spectrogram (40 Hz to 10 kHz),
// the short-term loudness (3 s, BS.1770 K-weighted) as a white line, and the picture cues as vertical lines.
// A supplement to listening, never a substitute.
//   node scripts/music-v4/spectro.mjs <in.wav> <out.png> [cue@seconds ...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { readWav, filt } from './engine.mjs';

const [inp, out, ...cueArgs] = process.argv.slice(2);
const { L, R, rate } = readWav(inp);
const W = 1400, H = 520, top = 40, n = L.length;
const m = Float32Array.from(L, (v, i) => (v + R[i]) / 2);
const N = 4096, hop = Math.max(1, Math.floor(n / W));
const img = Buffer.alloc(W * H * 3, 0);
const px = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
// FFT (radix 2).
function fft(re, im) {
  const n2 = re.length;
  for (let i = 1, j = 0; i < n2; i++) { let bit = n2 >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n2; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n2; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
const fLo = 40, fHi = 10000, rows = H - top - 20;
const yOf = (f) => top + rows - Math.round(Math.log(f / fLo) / Math.log(fHi / fLo) * rows);
const col = (d) => { const t = Math.max(0, Math.min(1, (d + 90) / 70)); return [Math.round(255 * Math.min(1, t * 1.6)), Math.round(255 * Math.max(0, t * 1.4 - 0.4)), Math.round(255 * (t < 0.4 ? t * 1.5 : Math.max(0, 1 - (t - 0.4) * 2)))]; };
for (let x = 0; x < W; x++) {
  const c = x * hop, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = c - N / 2 + i; re[i] = j >= 0 && j < n ? m[j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)) : 0; }
  fft(re, im);
  for (let y = top; y < top + rows; y++) {
    const f = fLo * Math.pow(fHi / fLo, (top + rows - y) / rows), k = Math.round(f / rate * N);
    const k2 = Math.max(k + 1, Math.round(fLo * Math.pow(fHi / fLo, (top + rows - y + 1) / rows) / rate * N));
    let p = 0; for (let q = k; q < k2 && q < N / 2; q++) p = Math.max(p, re[q] * re[q] + im[q] * im[q]);
    px(x, y, col(10 * Math.log10(p / (N * N / 16) + 1e-12)));
  }
}
// Gridlines at 100 Hz, 1 kHz, 5 kHz.
for (const f of [100, 1000, 5000]) for (let x = 0; x < W; x += 6) px(x, yOf(f), [90, 90, 90]);
// Short-term loudness (3 s windows, K-weighted), drawn from -40 (bottom) to -10 LUFS (top of the plot).
const K = (x) => filt(filt(Float64Array.from(x), [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]), [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621]);
const kl = K(L), kr = K(R), win = Math.round(3 * rate);
const cum = new Float64Array(n + 1); for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + kl[i] * kl[i] + kr[i] * kr[i];
let prevY = null;
for (let x = 0; x < W; x++) {
  const c = x * hop, a = Math.max(0, c - win / 2), b = Math.min(n, c + win / 2);
  const lu = -0.691 + 10 * Math.log10((cum[b] - cum[a]) / Math.max(1, b - a) + 1e-12);
  const y = top + Math.round((1 - (Math.max(-40, Math.min(-10, lu)) + 40) / 30) * rows);
  if (prevY != null) for (let yy = Math.min(prevY, y); yy <= Math.max(prevY, y); yy++) px(x, yy, [255, 255, 255]);
  px(x, y, [255, 255, 255]); px(x, y + 1, [255, 255, 255]); prevY = y;
}
// Cues: green vertical lines with a small label block on top (labels listed in the console).
cueArgs.forEach((s, i) => { const [name, t] = s.split('@'); const x = Math.round(+t * rate / hop); for (let y = top - 30; y < H; y++) px(x, y, [80, 220, 120]); for (let yy = 4; yy < 4 + 10 + (i % 3) * 8; yy++) for (let xx = x; xx < x + 6; xx++) px(xx, yy, [80, 220, 120]); console.log('cue', name, t, 'x', x); });
// Seconds ticks along the bottom.
for (let s = 0; s * rate / hop < W; s += 5) { const x = Math.round(s * rate / hop); for (let y = H - 18; y < H; y++) px(x, y, [160, 160, 160]); }
// PNG.
const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
