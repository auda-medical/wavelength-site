// Version 4 music: composes the three candidate arrangements (scripts/music-v4/score.mjs) against each film's real
// scene timing (src/v4/plans.js), so the lifts land on the pictures. Each bed is normalised to -20 LUFS (the mix sets
// its level under the voice). Also reports objective checks: low-frequency and harsh-band shares, mono compatibility.
//   node scripts/music-v4.mjs [sample,flagship,short,ad] [A,B,C]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, CANDIDATES } from './music-v4/score.mjs';
import { writeWav, lufs, truePeak, scale, biq, filt } from './music-v4/engine.mjs';
import { timeline4, cues, SAMPLE4 } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
const args = process.argv.slice(2);
const films = (args[0] || 'sample,flagship,short,ad').split(',');
const cands = (args[1] || 'A,B,C').split(',');
export const filmTL = (film) => (film === 'sample' ? timeline4('flagship', T, S, SAMPLE4) : timeline4(film, T, S));

function bands(L, R) {
  const m = Float64Array.from(L, (v, i) => (v + R[i]) / 2), side = Float64Array.from(L, (v, i) => (v - R[i]) / 2);
  const e = (x) => x.reduce((a, v) => a + v * v, 0);
  const low = filt(Float64Array.from(m), biq('lp', 120)), harsh = filt(filt(Float64Array.from(m), biq('hp', 2500)), biq('lp', 6000));
  const tot = e(m);
  let c = 0, a = 0, b = 0; for (let i = 0; i < L.length; i++) { c += L[i] * R[i]; a += L[i] * L[i]; b += R[i] * R[i]; }
  return { lowShare: +(e(low) / tot * 100).toFixed(1), harshShare: +(e(harsh) / tot * 100).toFixed(1), correlation: +(c / Math.sqrt(a * b)).toFixed(2), sideToMidDb: +(10 * Math.log10(e(side) / tot)).toFixed(1) };
}
const report = {};
for (const film of films) {
  const tl = filmTL(film), cue = cues(film === 'sample' ? 'flagship' : film, tl);
  for (const id of cands) {
    const t0 = Date.now();
    const [L, R] = compose(id, cue, { film });
    const g = Math.pow(10, (-20 - lufs(L, R)) / 20); scale(L, R, g);
    const file = path.join(ROOT, `public/audio-v4/music/${id}/${film}.wav`);
    writeWav(file, L, R);
    const r = { candidate: id, name: CANDIDATES[id].name, film, seconds: +(L.length / 48000).toFixed(2), lufs: +lufs(L, R).toFixed(1), truePeak: +truePeak(L, R).toFixed(1), ...bands(L, R), cues: cue.cues.map((c) => `${c.name}@${c.at.toFixed(2)}`).join(' '), ms: Date.now() - t0 };
    report[`${id}/${film}`] = r;
    console.log(JSON.stringify(r));
  }
}
const rf = path.join(ROOT, 'public/audio-v4/music/report.json');
const prev = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : {};
fs.writeFileSync(rf, JSON.stringify({ ...prev, ...report }, null, 1));
