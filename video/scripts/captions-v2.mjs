// Caption files for the version 2 films: SRT and WebVTT, timed from the measured narration
// (public/audio-v2/timings.json) and the scene plans, using the same cue splitting as the burned-in captions
// (src/v2/cues.js: a sentence per cue where it fits, two lines of about 42 characters). Every spoken line is included.
//   node scripts/captions-v2.mjs <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitCues, wrapAt } from '../src/v2/cues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V3 = process.argv.includes('--v3');
const VER = V3 ? 'v3' : 'v2';
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'captions');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, `public/audio-${VER}/timings.json`), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, `src/${VER}/script.json`), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

function scenes(film, file) {
  const src = fs.readFileSync(path.join(ROOT, 'src', VER, file), 'utf8');
  const plan = Function(`return ${src.match(/[A-Z0-9]+_PLAN = (\[[\s\S]*?\]);/)[1]}`)();
  let at = 0; const out = [];
  for (const p of plan) {
    const line = S.films[film].find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`];
    if (!t) throw new Error(`no narration timing for ${film}/${line.id}: run the voice pipeline first`);
    const lead = p.lead ?? 0.4, tail = p.tail ?? 0.6;
    const dur = Math.round(Math.max(p.min || 0, t.seconds + lead + tail) * 30);
    out.push({ text: line.text, from: at + Math.round(lead * 30), dur: Math.round(t.seconds * 30) });
    at += dur - (p.overlap ? Math.round(p.overlap * 30) : 0);
  }
  return out;
}
function cues(text, from, dur, max = 42) {
  const chunks = splitCues(text, max); const total = chunks.reduce((a, x) => a + x.length, 0); let at = from;
  return chunks.map((x) => { const d = Math.round(dur * x.length / total); const q = { start: at, end: at + d, text: wrapAt(x, max).join('\n') }; at += d; return q; });
}
const ts = (f, sep) => { const ms = Math.round(f / 30 * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`; };
for (const [film, file, name] of (V3 ? [['flagship', 'Flagship3.jsx', 'wavelength-flagship-film-v3'], ['short', 'Short3.jsx', 'wavelength-free-logbook-short-v3'], ['ad', 'Ad3.jsx', 'wavelength-tailored-training-ad-v3']] : [['flagship', 'Flagship2.jsx', 'wavelength-flagship-film-v2'], ['short', 'Short2.jsx', 'wavelength-free-logbook-short-v2'], ['ad', 'Ad2.jsx', 'wavelength-tailored-training-ad-v2']])) {
  const all = scenes(film, file).flatMap((x) => cues(x.text, x.from, x.dur));
  const srt = all.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
  const vtt = 'WEBVTT\n\n' + all.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(OUT, `${name}.en.srt`), srt);
  fs.writeFileSync(path.join(OUT, `${name}.en.vtt`), vtt);
  console.log(name, all.length, 'cues');
}
