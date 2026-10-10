// Regression check for earlier versions: renders a fixed set of frames and compares them with a saved reference.
// Used to prove that shared-component changes for version 4 leave versions 2 and 3 pixel-identical.
//   node scripts/stills-check.mjs save <dir>     (render the reference)
//   node scripts/stills-check.mjs compare <dir>  (render again and compare byte for byte; PNG output is deterministic)
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const [mode, dirArg] = process.argv.slice(2);
const dir = path.resolve(dirArg);
const FRAMES = [['V3Flagship', [40, 300, 560, 760, 1000, 1500, 2100, 2650, 2950, 3200]], ['V3ShortVertical', [60, 300, 700, 880]], ['V3Ad', [60, 300, 560]], ['V3LogoReveal', [30, 119]], ['V2Flagship', [200, 1200]]];
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.jsx') });
const sub = mode === 'save' ? 'ref' : 'now';
fs.mkdirSync(path.join(dir, sub), { recursive: true });
let same = 0, diff = [];
for (const [id, frames] of FRAMES) {
  const composition = await selectComposition({ serveUrl, id });
  for (const frame of frames) {
    if (frame >= composition.durationInFrames) continue;
    const file = path.join(dir, sub, `${id}-${frame}.png`);
    await renderStill({ serveUrl, composition, frame, output: file });
    if (mode !== 'save') { const a = fs.readFileSync(path.join(dir, 'ref', `${id}-${frame}.png`)), b = fs.readFileSync(file); if (a.equals(b)) same++; else diff.push(`${id}-${frame}`); }
  }
}
console.log(mode === 'save' ? 'reference saved' : JSON.stringify({ identical: same, different: diff }));
