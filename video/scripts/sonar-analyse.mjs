// Technical analysis of the sonar logo sounds (public/audio-v4/sonar/*.wav): pitch and frequency content, attack,
// decay, harshness, loudness, distortion indicators, mono compatibility and potential masking of the narration (which
// starts 0.5 s after the logo settles). Measurements support listening; they do not decide what sounds best.
//   node scripts/sonar-analyse.mjs [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { RATE, readWav, biq, filt, truePeak } from './music-v4/engine.mjs';
import { momentaryMax } from './sonar-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/audio-v4/sonar');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '..', '..', 'wavelength-video-output', 'v4-qa', 'sonar'));
fs.mkdirSync(OUT, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(DIR, 'sonar.json'), 'utf8'));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (f) => { const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m); return `${NAMES[r % 12]}${Math.floor(r / 12) - 1}${Math.abs(m - r) > 0.25 ? (m > r ? '+' : '-') : ''}`; };
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
function spectrum(x, at, N = 8192) {
  const re = new Float64Array(N), im = new Float64Array(N), s = Math.round(at * RATE);
  for (let i = 0; i < N; i++) { const j = s + i; re[i] = j < x.length ? x[j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)) : 0; }
  fft(re, im); const p = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}
const peakFreq = (p, N = 8192) => { let k = 1; for (let i = 2; i < p.length; i++) if (p[i] > p[k]) k = i; const a = p[k - 1], b = p[k], c = p[k + 1] || 0; const d = 0.5 * (Math.log(a + 1e-30) - Math.log(c + 1e-30)) / (Math.log(a + 1e-30) - 2 * Math.log(b + 1e-30) + Math.log(c + 1e-30)); return (k + d) * RATE / N; };
const e = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return s; };
const band = (m, lo, hi) => { const y = Float64Array.from(m); if (lo) filt(y, biq('hp', lo, 0.7)); if (hi) filt(y, biq('lp', hi, 0.7)); return e(y); };
const db = (x) => +(10 * Math.log10(x)).toFixed(1);
const rows = {};
for (const id of Object.keys(meta)) {
  const { L, R } = readWav(path.join(DIR, `${id}.wav`)), hit = meta[id].hit, n = L.length;
  const m = Float64Array.from(L, (v, i) => (v + R[i]) / 2);
  // Envelope: 2 ms RMS.
  const w = Math.round(0.002 * RATE), env = []; for (let s = 0; s + w <= n; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += m[i] * m[i]; env.push(Math.sqrt(a / w)); }
  const pkI = env.reduce((b, v, i) => (v > env[b] ? i : b), 0), pk = env[pkI];
  const t = (i) => i * w / RATE;
  const onset = env.findIndex((v) => v > pk * 0.1), rise = env.findIndex((v) => v > pk * 0.9);
  const after = (lv) => { const i = env.findIndex((v, j) => j > pkI && v < pk * Math.pow(10, lv / 20)); return i < 0 ? null : +(t(i) - t(pkI)).toFixed(3); };
  // Spectra at the hit (+20 ms) and later (+250 ms): pitch and its movement; centroid over the whole sound.
  const p0 = spectrum(m, hit + 0.02), p1 = spectrum(m, hit + 0.25);
  const f0 = peakFreq(p0), f1 = peakFreq(p1);
  const pAll = spectrum(m, Math.max(0, hit - 0.3), 65536 > n ? 1 << Math.ceil(Math.log2(n)) : 65536);
  let num = 0, den = 0; for (let k = 1; k < pAll.length; k++) { const f = k * RATE / (pAll.length * 2); num += f * pAll[k]; den += pAll[k]; }
  const tot = e(m);
  // Masking: what is left when the narration starts (0.5 s after the settle), in the speech band 300 Hz to 3.4 kHz,
  // relative to the sound's own loudest 50 ms in that band.
  const sp = Float64Array.from(m); filt(sp, biq('hp', 300, 0.7)); filt(sp, biq('lp', 3400, 0.7));
  const win = (a, b) => { const s = Math.round(a * RATE), z = Math.min(n, Math.round(b * RATE)); let x = 0; for (let i = s; i < z; i++) x += sp[i] * sp[i]; return x / Math.max(1, z - s); };
  let spk = 0; for (let a = 0; a + 0.05 < n / RATE; a += 0.01) spk = Math.max(spk, win(a, a + 0.05));
  const tail = win(hit + 0.5, hit + 0.6);
  let c = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { c += L[i] * R[i]; aa += L[i] * L[i]; bb += R[i] * R[i]; }
  const mono = Float32Array.from(m);
  let clip = 0; for (let i = 0; i < n; i++) if (Math.abs(L[i]) >= 0.999 || Math.abs(R[i]) >= 0.999) clip++;
  rows[id] = {
    name: meta[id].name,
    pitchAtHit: `${Math.round(f0)} Hz (${noteName(f0)})`, pitchAfter250ms: `${Math.round(f1)} Hz (${noteName(f1)})`,
    centroidHz: Math.round(num / den),
    attackMs: +((t(rise) - t(onset)) * 1000).toFixed(1),
    decayTo20dB: after(-20), decayTo40dB: after(-40), afterHitSeconds: meta[id].afterHit,
    harsh2500to6000pct: +(band(m, 2500, 6000) / tot * 100).toFixed(2), above6000pct: +(band(m, 6000, 0) / tot * 100).toFixed(3),
    above16kHzDb: db(band(m, 16000, 0) / tot), below200pct: +(band(m, 0, 200) / tot * 100).toFixed(2),
    momentaryMaxLUFS: +momentaryMax(L, R).toFixed(1), truePeakDBTP: +truePeak(L, R).toFixed(2), clippedSamples: clip,
    stereoCorrelation: +(c / Math.sqrt(aa * bb)).toFixed(3), monoMinusStereoDb: +(momentaryMax(mono, mono) - momentaryMax(L, R)).toFixed(2),
    speechBandShare: +(band(m, 300, 3400) / tot * 100).toFixed(1), tailAtNarrationDb: db(tail / spk),
  };
  console.log(id, JSON.stringify(rows[id]));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/music-v4/spectro.mjs'), path.join(DIR, `${id}.wav`), path.join(OUT, `spectrum-${id}.png`), `hit@${hit}`], { stdio: 'ignore' });
}
fs.writeFileSync(path.join(OUT, 'sonar-analysis.json'), JSON.stringify(rows, null, 1));
fs.writeFileSync(path.join(DIR, 'analysis.json'), JSON.stringify(rows, null, 1));
