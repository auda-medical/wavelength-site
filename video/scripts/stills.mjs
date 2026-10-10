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
const VER = (process.argv[2] || '').startsWith('V3') ? 'v3' : (process.argv[2] || '').startsWith('V2') ? 'v2' : '';
const V2 = !!VER; // version 2 and 3 share the timing rules
const T = JSON.parse(fs.readFileSync(path.join(ROOT, VER ? `public/audio-${VER}/timings.json` : 'public/audio/timings.json')));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, VER ? `src/${VER}/script.json` : 'src/script.json')));
function sceneStarts(film, plan) {
  let at = 0; const out = {};
  for (const p of plan) {
    const line = (S.films[film] || []).find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`] || { seconds: V2 && line.text ? line.text.split(/\s+/).length / 147 * 60 : 0 };
    const lead = p.lead ?? (V2 ? 0.4 : 0.7), tail = p.tail ?? (V2 ? 0.6 : 0.9);
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
  V2Flagship: ['flagship', 'v2/Flagship2.jsx'], V2FlagshipCaptioned: ['flagship', 'v2/Flagship2.jsx'],
  V2Short: ['short', 'v2/Short2.jsx'], V2ShortVertical: ['short', 'v2/Short2.jsx'], V2ShortCaptioned: ['short', 'v2/Short2.jsx'], V2ShortVerticalCaptioned: ['short', 'v2/Short2.jsx'],
  V3Flagship: ['flagship', 'v3/Flagship3.jsx'], V3FlagshipCaptioned: ['flagship', 'v3/Flagship3.jsx'],
  V3Short: ['short', 'v3/Short3.jsx'], V3ShortVertical: ['short', 'v3/Short3.jsx'], V3ShortCaptioned: ['short', 'v3/Short3.jsx'], V3ShortVerticalCaptioned: ['short', 'v3/Short3.jsx'],
  V3Ad: ['ad', 'v3/Ad3.jsx'], V3AdVertical: ['ad', 'v3/Ad3.jsx'], V3AdCaptioned: ['ad', 'v3/Ad3.jsx'], V3AdVerticalCaptioned: ['ad', 'v3/Ad3.jsx'],
  V2Ad: ['ad', 'v2/Ad2.jsx'], V2AdVertical: ['ad', 'v2/Ad2.jsx'], V2AdCaptioned: ['ad', 'v2/Ad2.jsx'], V2AdVerticalCaptioned: ['ad', 'v2/Ad2.jsx'],
};
let starts = {};
if (PLAN[id]) {
  const src = fs.readFileSync(path.join(ROOT, 'src', PLAN[id][1]), 'utf8');
  const m = src.match(/[A-Z0-9]+_PLAN = (\[[\s\S]*?\]);/);
  const plan = Function(`return ${m[1]}`)();
  starts = sceneStarts(PLAN[id][0], plan);
}
const frames = list.split(',').map((x) => {
  const [a, b] = x.split(':');
  if (b === undefined) return Number(a);
  const [base, key] = a.startsWith('v') && !starts[a] && starts[a.slice(1)] ? [a.slice(1), 'voice'] : [a, 'from'];
  return starts[base][key] + Number(b);
});

const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.jsx') });
const composition = await selectComposition({ serveUrl, id });
for (const frame of frames) {
  const output = path.join(outDir, `${id}-${String(frame).padStart(5, '0')}.png`);
  await renderStill({ serveUrl, composition, frame, output });
  console.log(output);
}
