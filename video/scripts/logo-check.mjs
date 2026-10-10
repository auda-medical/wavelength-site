// Checks that the logo at the end of the version 3 reveal is the approved artwork. Writes the website's own mark
// (build.js mark(), on-dark colours: ring #F7F5F0, wave #7FC4CC, as the site header shows on dark) to
// src/v3/site-mark.json, renders the reveal's final frame twice (V3LogoReveal with the film's Mark, V3LogoRevealCheck
// with the website's markup in its place) and compares the logo region pixel by pixel.
//   node scripts/logo-check.mjs [frame] [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const frame = Number(process.argv[2] || 119), out = path.resolve(process.argv[3] || 'logo-check');
fs.mkdirSync(out, { recursive: true });
const build = fs.readFileSync(path.join(ROOT, '..', 'build.js'), 'utf8');
const start = build.indexOf('function mark({');
const mark = (0, eval)(`(${build.slice(start, build.indexOf('\n}', start) + 2)})`);
const svg = mark({ size: 150, ring: '#F7F5F0' }).replace('class="mark-wave"', 'class="mark-wave" stroke="#7FC4CC"');
fs.writeFileSync(path.join(ROOT, 'src/v3/site-mark.json'), JSON.stringify({ source: 'build.js mark(), on-dark colours', svg }, null, 1));
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.jsx') });
const files = {};
for (const id of ['V3LogoReveal', 'V3LogoRevealCheck']) {
  const composition = await selectComposition({ serveUrl, id });
  files[id] = path.join(out, `${id}-${frame}.png`);
  await renderStill({ serveUrl, composition, frame, output: files[id] });
}
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
const r = await p.evaluate(async ({ a, c }) => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const px = async (src) => { const im = await load(src); const cv = document.createElement('canvas'); cv.width = 190; cv.height = 190; const g = cv.getContext('2d'); g.drawImage(im, 960 - 95, 420 - 95, 190, 190, 0, 0, 190, 190); return g.getImageData(0, 0, 190, 190).data; };
  const A = await px(a), B = await px(c);
  let sum = 0, max = 0, n = 0, diff = 0;
  for (let i = 0; i < A.length; i += 4) { let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A[i + k] - B[i + k])); sum += d; max = Math.max(max, d); if (d > 2) diff++; n++; }
  return { pixels: n, pixelsDifferingOver2: diff, meanDiff: +(sum / n).toFixed(4), maxDiff: max };
}, { a: 'data:image/png;base64,' + fs.readFileSync(files.V3LogoReveal).toString('base64'), c: 'data:image/png;base64,' + fs.readFileSync(files.V3LogoRevealCheck).toString('base64') });
console.log(JSON.stringify({ frame, ...r }));
fs.writeFileSync(path.join(out, 'logo-check.json'), JSON.stringify({ frame, ...r, markup: svg }, null, 1));
await b.close();
