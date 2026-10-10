// Caption files for the version 2 films: SRT and WebVTT, timed from the measured narration
// (public/audio-v2/timings.json) and the scene plans, using the same cue splitting as the burned-in captions
// (src/v2/kit2.jsx cuesFor: at most two lines of about 42 characters). Every spoken line is included.
//   node scripts/captions-v2.mjs <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || 'captions');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v2/timings.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v2/script.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

function scenes(film, file) {
  const src = fs.readFileSync(path.join(ROOT, 'src/v2', file), 'utf8');
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
  const words = text.split(' '); const chunks = []; let cur = '';
  for (const w of words) { const next = cur ? cur + ' ' + w : w; if (next.length > max * 2 || (cur.length > max * 0.9 && /[,.?]$/.test(cur))) { chunks.push(cur); cur = w; } else cur = next; }
  if (cur) chunks.push(cur);
  const total = chunks.reduce((a, c) => a + c.length, 0); let at = from;
  return chunks.map((c) => { const d = Math.round(dur * c.length / total); const q = { start: at, end: at + d, text: wrap(c, max) }; at += d; return q; });
}
function wrap(s, max) { if (s.length <= max) return s; const mid = s.length / 2; let best = -1; for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; return best < 0 ? s : s.slice(0, best) + '\n' + s.slice(best + 1); }
const ts = (f, sep) => { const ms = Math.round(f / 30 * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`; };
for (const [film, file, name] of [['flagship', 'Flagship2.jsx', 'wavelength-flagship-film-v2'], ['short', 'Short2.jsx', 'wavelength-free-logbook-short-v2'], ['ad', 'Ad2.jsx', 'wavelength-tailored-training-ad-v2']]) {
  const all = scenes(film, file).flatMap((x) => cues(x.text, x.from, x.dur));
  const srt = all.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
  const vtt = 'WEBVTT\n\n' + all.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n');
  fs.writeFileSync(path.join(OUT, `${name}.en.srt`), srt);
  fs.writeFileSync(path.join(OUT, `${name}.en.vtt`), vtt);
  console.log(name, all.length, 'cues');
}
