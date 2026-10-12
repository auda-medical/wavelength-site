// Version 4 rendering: each composition is rendered once, silent (the picture does not depend on the music), then
// muxed with each requested soundtrack from scripts/mix-v4.mjs. The video stream is copied, never re-encoded.
// Output goes outside the repository: wavelength-video-output/<dir>/ (default comparison-v4).
//   node scripts/render-v4.mjs <Composition>[,...] <film> <A,B,C> [--dir=comparison-v4] [--name=wavelength-v4-sample] [--4k]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readWav, lufs, truePeak } from './music-v4/engine.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--'));
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const [ids, film, cands = 'A,B,C'] = pos;
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', opt('dir', 'comparison-v4'));
fs.mkdirSync(OUT, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (a) => execFileSync(npx, a, { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32', cwd: ROOT });
const q = (s) => (process.platform === 'win32' ? `"${s}"` : s);
const report = [];
for (const id of ids.split(',')) {
  for (const k4 of [false, ...(args.includes('--4k') && !/Vertical/.test(id) ? [true] : [])]) {
    const size = k4 ? '-4k' : /Vertical/.test(id) ? '-1080x1920' : '-1080p';
    const base = opt('name', 'wavelength-' + id.toLowerCase()) + size;
    const silent = path.join(OUT, `${base}.silent.mp4`);
    const t0 = Date.now();
    run(['remotion', 'render', 'src/index.jsx', id, q(silent), '--codec=h264', '--crf=' + (k4 ? 18 : 16), '--muted', '--log=error', ...(k4 ? ['--scale=2'] : [])]);
    for (const c of cands.split(',')) {
      const wav = path.join(ROOT, `public/audio-v4/mix/${c}/${film}.wav`);
      const fin = path.join(OUT, `${base.replace(size, '')}${cands.includes(',') ? '-' + c : ''}${size}.mp4`);
      run(['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', q(silent), '-i', q(wav), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', q(fin)]);
      // Measure what a viewer gets: decode the encoded audio again.
      const chk = path.join(OUT, '_check.wav');
      run(['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', q(fin), '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', q(chk)]);
      const { L, R } = readWav(chk); fs.rmSync(chk);
      const r = { file: path.basename(fin), composition: id, soundtrack: `${c}/${film}`, seconds: +(L.length / 48000).toFixed(2), lufs: +lufs(L, R).toFixed(1), truePeakDBTP: +truePeak(L, R).toFixed(2), bytes: fs.statSync(fin).size, renderSeconds: Math.round((Date.now() - t0) / 1000) };
      report.push(r); console.log(JSON.stringify(r));
    }
    fs.rmSync(silent, { force: true });
  }
}
const rf = path.join(OUT, 'render-report.json');
const prev = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : [];
fs.writeFileSync(rf, JSON.stringify([...prev.filter((p) => !report.some((r) => r.file === p.file)), ...report], null, 1));
