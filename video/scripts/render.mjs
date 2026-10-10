// Renders every film and masters its soundtrack. Output goes outside the repository (rendered video is never committed):
//   C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final\   (override with WL_VIDEO_OUT)
// For each composition: render H.264 MP4 at the composition size (and 3840 x 2160 for the 16:9 films), decode the
// soundtrack, measure integrated loudness (BS.1770), apply gain to -15 LUFS, limit peaks to -1.5 dBFS with a 5 ms
// look-ahead, and re-mux with the video stream copied (no second video encode). Writes a JSON report beside the files.
//   node scripts/render.mjs [Composition,...] [--no4k]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT = process.env.WL_VIDEO_OUT || path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'final');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const no4k = args.includes('--no4k');
const pick = (args.find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
const JOBS = [
  { id: 'Flagship', name: 'wavelength-flagship-film', k4: true },
  { id: 'Short', name: 'wavelength-free-logbook-short', k4: true },
  { id: 'ShortVertical', name: 'wavelength-free-logbook-short-vertical' },
  { id: 'Ad', name: 'wavelength-tailored-training-ad', k4: true },
  { id: 'AdVertical', name: 'wavelength-tailored-training-ad-vertical' },
  { id: 'Sample', name: 'wavelength-sample' },
].filter((j) => !pick.length || pick.includes(j.id));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (a) => execFileSync(npx, a, { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32', cwd: ROOT });
const q = (s) => (process.platform === 'win32' ? `"${s}"` : s);

function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12, data = null, ch = 2, rate = 48000;
  while (off < b.length) { const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4); if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); } if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; } off += 8 + sz; }
  const n = data.length / (2 * ch), L = new Float64Array(n), R = new Float64Array(n);
  for (let i = 0; i < n; i++) { L[i] = data.readInt16LE(i * 2 * ch) / 32768; R[i] = data.readInt16LE(i * 2 * ch + 2) / 32768; }
  return { L, R, rate };
}
function writeWav(file, L, R, rate) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}
function biquad(x, [b0, b1, b2, a1, a2]) { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
export function integrated(L, R, rate) {
  const S1 = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], S2 = [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621];
  const kL = biquad(biquad(L, S1), S2), kR = biquad(biquad(R, S1), S2);
  const blk = Math.round(0.4 * rate), hop = Math.round(0.1 * rate), blocks = [];
  for (let s = 0; s + blk <= L.length; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += kL[i] * kL[i] + kR[i] * kR[i]; blocks.push(e / blk); }
  const lu = (e) => -0.691 + 10 * Math.log10(e);
  const abs = blocks.filter((e) => lu(e) > -70);
  const rel = lu(abs.reduce((a, e) => a + e, 0) / abs.length) - 10;
  const g = abs.filter((e) => lu(e) > rel);
  return lu(g.reduce((a, e) => a + e, 0) / g.length);
}
function limit(L, R, rate, ceilDb = -1.5) {
  const ceil = Math.pow(10, ceilDb / 20), look = Math.round(0.005 * rate), rel = Math.exp(-1 / (0.08 * rate));
  const n = L.length, need = new Float64Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = p > ceil ? ceil / p : 1; }
  // Minimum gain over the look-ahead window (sliding, simple), then smooth release.
  const g = new Float64Array(n); let cur = 1;
  for (let i = 0; i < n; i++) { let m = 1; for (let j = i; j < Math.min(n, i + look); j += 8) m = Math.min(m, need[j]); cur = m < cur ? m : rel * cur + (1 - rel) * m; g[i] = Math.min(cur, need[i]); }
  for (let i = 0; i < n; i++) { L[i] *= g[i]; R[i] *= g[i]; }
}

const report = [];
for (const j of JOBS) {
  for (const k4 of [false, ...(j.k4 && !no4k ? [true] : [])]) {
    const tag = k4 ? '-4k' : (j.id.endsWith('Vertical') ? '-1080x1920' : '-1080p');
    const raw = path.join(OUT, `${j.name}${tag}.raw.mp4`), fin = path.join(OUT, `${j.name}${tag}.mp4`), wav = path.join(OUT, `${j.name}${tag}.wav`), mwav = path.join(OUT, `${j.name}${tag}.master.wav`);
    const t0 = Date.now();
    run(['remotion', 'render', 'src/index.jsx', j.id, q(raw), '--codec=h264', '--crf=' + (k4 ? 18 : 16), '--audio-bitrate=320k', '--log=error', ...(k4 ? ['--scale=2'] : [])]);
    run(['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', q(raw), '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', q(wav)]);
    const { L, R, rate } = readWav(wav);
    const before = integrated(L, R, rate);
    const gain = Math.pow(10, (-15 - before) / 20);
    for (let i = 0; i < L.length; i++) { L[i] *= gain; R[i] *= gain; }
    limit(L, R, rate, -1.5);
    const after = integrated(L, R, rate);
    let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    writeWav(mwav, L, R, rate);
    run(['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', q(raw), '-i', q(mwav), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', q(fin)]);
    for (const f of [raw, wav, mwav]) fs.rmSync(f, { force: true });
    const r = { file: path.basename(fin), composition: j.id, size: k4 ? '3840x2160' : j.id.endsWith('Vertical') ? '1080x1920' : '1920x1080', loudnessBefore: Math.round(before * 10) / 10, loudnessAfter: Math.round(after * 10) / 10, samplePeakDBFS: Math.round(20 * Math.log10(peak) * 10) / 10, seconds: Math.round(L.length / rate * 100) / 100, renderSeconds: Math.round((Date.now() - t0) / 1000), bytes: fs.statSync(fin).size };
    report.push(r);
    console.log(JSON.stringify(r));
  }
}
const repFile = path.join(OUT, 'render-report.json');
const prev = fs.existsSync(repFile) ? JSON.parse(fs.readFileSync(repFile, 'utf8')) : [];
fs.writeFileSync(repFile, JSON.stringify([...prev.filter((p) => !report.some((r) => r.file === p.file)), ...report], null, 1));
