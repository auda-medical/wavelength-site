// Caption files for the version 4 films: SRT and WebVTT, from the same timeline as the pictures (src/v4/plans.js
// timeline4 with public/audio-v4/timings.json) and the same cues as the burned-in captions (cuesFor in src/v2/kit2.jsx:
// splitCues and wrapAt, a sentence per cue where it fits, two lines of about 42 characters, starting no earlier than
// 16 frames into a scene). The burned-in captions leave out the end scene, whose words are on screen; these files
// include every spoken line, so a player's captions are complete.
// --tagline=<timings key, e.g. tagline-a3/F>: the closing line is played from that take (mix-v4.mjs --tagline), so the
// end-scene cue lasts as long as it does.
//   node scripts/captions-v4.mjs <outdir> [--tagline=tagline-a3/F]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitCues, wrapAt } from '../src/v2/cues.js';
import { timeline4 } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'captions');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8'));
const TAG = (process.argv.find((a) => a.startsWith('--tagline=')) || '').slice(10);
if (TAG && !T[TAG]) throw new Error(`no timing for ${TAG}`);
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

function cues(text, from, dur, max = 42) {
  const chunks = splitCues(text, max); const total = chunks.reduce((a, x) => a + x.length, 0); let at = from;
  return chunks.map((x) => { const d = Math.round(dur * x.length / total); const q = { start: at, end: at + d, text: wrapAt(x, max).join('\n') }; at += d; return q; });
}
const ts = (f, sep) => { const ms = Math.round(f / 30 * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`; };
const report = [];
for (const [film, name] of [['flagship', 'wavelength-flagship-film-v4'], ['short', 'wavelength-free-logbook-short-v4'], ['ad', 'wavelength-tailored-training-ad-v4']]) {
  const tl = timeline4(film, T, S);
  for (const x of tl.scenes) if (x.text && x.estimated) throw new Error(`${film}/${x.id}: no measured narration timing; run the voice pipeline first`);
  const all = tl.scenes.filter((x) => x.text).flatMap((x) => (x.scene === 'end'
    ? cues(x.text, x.voiceFrom, TAG && film !== 'short' ? Math.round(T[TAG].seconds * 30) : x.voiceDur)
    : cues(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || 90)));
  const srt = all.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
  const vtt = 'WEBVTT\n\n' + all.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(OUT, `${name}.en.srt`), srt);
  fs.writeFileSync(path.join(OUT, `${name}.en.vtt`), vtt);
  report.push({ film, name, cues: all.length, lastCueEnds: ts(all[all.length - 1].end, '.'), filmEnds: ts(tl.total, '.') });
}
console.log(JSON.stringify(report, null, 1));
