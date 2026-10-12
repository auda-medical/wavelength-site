// Version 2 music: the version 1 composer (scripts/music.mjs, original synthesised music, no samples) re-cued to the
// version 2 timelines. Energy rises at the brand reveal, the free logbook and the education close. Lengths follow the
// narration (public/audio-v2/timings.json) or the estimates in src/v2/timeline2.js.
//   node scripts/music-v2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, writeWav } from './music.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V3 = process.argv.includes('--v3');
const VER = V3 ? 'v3' : 'v2';
const T = JSON.parse(fs.readFileSync(path.join(ROOT, `public/audio-${VER}/timings.json`), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, `src/${VER}/script.json`), 'utf8'));
function starts(film, file) {
  const src = fs.readFileSync(path.join(ROOT, 'src', VER, file), 'utf8');
  const plan = Function(`return ${src.match(/[A-Z0-9]+_PLAN = (\[[\s\S]*?\]);/)[1]}`)();
  let at = 0; const out = {};
  for (const p of plan) {
    const line = S.films[film].find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`] || { seconds: line.text ? line.text.split(/\s+/).length / 147 * 60 : 0 };
    const dur = Math.round(Math.max(p.min || 0, t.seconds ? t.seconds + (p.lead ?? 0.4) + (p.tail ?? 0.6) : 0) * 30);
    out[p.scene] = at / 30; at += dur - (p.overlap ? Math.round(p.overlap * 30) : 0);
  }
  out.total = at / 30;
  return out;
}
const fl = starts('flagship', V3 ? 'Flagship3.jsx' : 'Flagship2.jsx'), sh = starts('short', V3 ? 'Short3.jsx' : 'Short2.jsx'), ad = starts('ad', V3 ? 'Ad3.jsx' : 'Ad2.jsx');
const TRACKS = {
  flagship: { seconds: fl.total + 4, bpm: 74, sections: [{ at: 0, pulse: false, energy: 0.34 }, { at: fl.brand, pulse: true, energy: 0.55 }, ...(V3 ? [{ at: fl.request, pulse: true, energy: 0.64 }] : []), { at: fl.free - 0.4, pulse: true, energy: 0.72 }, { at: fl.education, pulse: true, energy: 0.82 }] },
  short: { seconds: sh.total + 4, bpm: 86, sections: [{ at: 0, pulse: false, energy: 0.5 }, { at: (V3 ? sh.log : sh.free) - 0.3, pulse: true, energy: 0.72 }, ...(V3 ? [{ at: sh.free - 0.3, pulse: true, energy: 0.8 }] : []), { at: sh.end, pulse: true, energy: 0.88 }] },
  ad: { seconds: ad.total + 4, bpm: 80, sections: [{ at: 0, pulse: true, energy: 0.62 }, { at: ad.offer, pulse: true, energy: 0.8 }] },
};
fs.mkdirSync(path.join(ROOT, `public/audio-${VER}/music`), { recursive: true });
for (const [name, o] of Object.entries(TRACKS)) {
  const [L, R] = compose(o.seconds, o);
  writeWav(path.join(ROOT, `public/audio-${VER}/music/${name}.wav`), L, R);
  console.log('music', VER, name, o.seconds.toFixed(1), 's');
}
