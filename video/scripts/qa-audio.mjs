// Objective audio checks for a rendered film: decodes the soundtrack with Remotion's bundled ffmpeg, then measures
// integrated loudness (ITU-R BS.1770: K-weighting, 400 ms blocks, absolute and relative gates), sample peak, an
// approximate true peak (4x linear interpolation), clipped samples and the share of silence; and draws a waveform PNG
// (via a small SVG rendered by Chrome) so ducking under narration can be checked by eye.
//   node scripts/qa-audio.mjs <film.mp4> [out-prefix]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const file = process.argv[2], prefix = process.argv[3] || file.replace(/\.mp4$/, '');
const wav = prefix + '-audio.wav';
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav], { stdio: 'inherit', shell: process.platform === 'win32' });
const b = fs.readFileSync(wav);
let off = 12, data = null, ch = 2, rate = 48000;
while (off < b.length) { const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4); if (id === 'fmt ') { ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); } if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; } off += 8 + sz; }
const n = data.length / (2 * ch), L = new Float64Array(n), R = new Float64Array(n);
for (let i = 0; i < n; i++) { L[i] = data.readInt16LE(i * 2 * ch) / 32768; R[i] = data.readInt16LE(i * 2 * ch + 2) / 32768; }
// K-weighting biquads (48 kHz coefficients from BS.1770-4).
function biquad(x, [b0, b1, b2, a1, a2]) { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
const S1 = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], S2 = [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621];
const kL = biquad(biquad(L, S1), S2), kR = biquad(biquad(R, S1), S2);
const blk = Math.round(0.4 * rate), hop = Math.round(0.1 * rate), blocks = [];
for (let s = 0; s + blk <= n; s += hop) { let e = 0; for (let i = s; i < s + blk; i++) e += kL[i] * kL[i] + kR[i] * kR[i]; blocks.push(e / blk); }
const lufs = (e) => -0.691 + 10 * Math.log10(e);
const abs = blocks.filter((e) => lufs(e) > -70);
const rel = lufs(abs.reduce((a, e) => a + e, 0) / abs.length) - 10;
const gated = abs.filter((e) => lufs(e) > rel);
const I = lufs(gated.reduce((a, e) => a + e, 0) / gated.length);
let peak = 0, tp = 0, clip = 0, quiet = 0;
for (const x of [L, R]) for (let i = 1; i < n; i++) { const a = Math.abs(x[i]); peak = Math.max(peak, a); if (a >= 0.999) clip++; for (let k = 1; k < 4; k++) tp = Math.max(tp, Math.abs(x[i - 1] + (x[i] - x[i - 1]) * k / 4)); }
for (let i = 0; i < n; i++) if (Math.abs(L[i]) < 0.001 && Math.abs(R[i]) < 0.001) quiet++;
const out = { file: path.basename(file), seconds: Math.round(n / rate * 100) / 100, integratedLUFS: Math.round(I * 10) / 10, samplePeakDBFS: Math.round(20 * Math.log10(peak) * 10) / 10, truePeakApproxDBTP: Math.round(20 * Math.log10(Math.max(tp, peak)) * 10) / 10, clippedSamples: clip, silentShare: Math.round(quiet / n * 1000) / 10 + '%' };
console.log(JSON.stringify(out));
// Waveform: short-term loudness every 100 ms.
const st = []; for (let s = 0; s + Math.round(3 * rate) <= n; s += hop * 2) { let e = 0; const w = Math.round(3 * rate); for (let i = s; i < s + w; i += 4) e += kL[i] * kL[i] + kR[i] * kR[i]; st.push(lufs(e / (w / 4))); }
const W = 1600, H = 300;
const pts = st.map((v, i) => `${(i / (st.length - 1)) * W},${H - Math.max(0, Math.min(1, (v + 50) / 45)) * H}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 30}" style="background:#0A1526;font:14px sans-serif"><polyline points="${pts}" fill="none" stroke="#7FC4CC" stroke-width="2"/>${[-14, -23, -35].map((d) => `<line x1="0" x2="${W}" y1="${H - (d + 50) / 45 * H}" y2="${H - (d + 50) / 45 * H}" stroke="#555" stroke-dasharray="4 4"/><text x="6" y="${H - (d + 50) / 45 * H - 4}" fill="#9FB0C2">${d} LUFS</text>`).join('')}<text x="6" y="${H + 22}" fill="#9FB0C2">Short-term loudness (3 s) of ${path.basename(file)}, ${out.seconds} s. Integrated ${out.integratedLUFS} LUFS.</text></svg>`;
fs.writeFileSync(prefix + '-loudness.svg', svg);
const browser = await chromium.launch({ channel: 'chrome' }); const page = await browser.newPage({ viewport: { width: W, height: H + 30 } });
await page.setContent(svg); await page.screenshot({ path: prefix + '-loudness.png' }); await browser.close();
fs.writeFileSync(prefix + '-audio.json', JSON.stringify(out, null, 1));
fs.rmSync(wav);
