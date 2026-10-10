// Renders chosen frames of a composition as PNGs for review, bundling once (much faster than one CLI call per frame).
// Frames are numbers, or scene:offset pairs (offset in frames from the scene's start; vscene:offset from its narration).
//   node scripts/stills.mjs <Composition> <outdir> <frame|scene:offset>,...
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const [id, outDir, list = '0'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

// Scene starts for scene:offset, computed as src/timeline.js does (that module imports JSON, so it is mirrored here).
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/timings.json')));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/script.json')));
function sceneStarts(film, plan) {
  let at = 0; const out = {};
  for (const p of plan) {
    const line = (S.films[film] || []).find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`] || { seconds: 0 };
    const lead = p.lead ?? 0.7, tail = p.tail ?? 0.9;
    const dur = Math.round(Math.max(p.min || 0, t.seconds ? t.seconds + lead + tail : 0) * 30);
    out[p.scene] = { from: at, voice: at + Math.round(lead * 30) };
    at += dur - (p.overlap ? Math.round(p.overlap * 30) : 0);
  }
  return out;
}
const PLAN = {
  Flagship: ['flagship', 'Flagship.jsx'],
  Short: ['short', 'Short.jsx'], ShortVertical: ['short', 'Short.jsx'],
  Ad: ['ad', 'Ad.jsx'], AdVertical: ['ad', 'Ad.jsx'],
};
let starts = {};
if (PLAN[id]) {
  const src = fs.readFileSync(path.join(ROOT, 'src', PLAN[id][1]), 'utf8');
  const m = src.match(/[A-Z]+_PLAN = (\[[\s\S]*?\]);/);
  const plan = Function(`return ${m[1]}`)();
  starts = sceneStarts(PLAN[id][0], plan);
}
const frames = list.split(',').map((x) => {
  const [a, b] = x.split(':');
  if (b === undefined) return Number(a);
  const [base, key] = a.startsWith('v') ? [a.slice(1), 'voice'] : [a, 'from'];
  return starts[base][key] + Number(b);
});

const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.jsx') });
const composition = await selectComposition({ serveUrl, id });
for (const frame of frames) {
  const output = path.join(outDir, `${id}-${String(frame).padStart(5, '0')}.png`);
  await renderStill({ serveUrl, composition, frame, output });
  console.log(output);
}
