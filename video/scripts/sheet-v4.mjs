// Contact sheets for visual review of the version 4 films: renders frames at chosen points of each scene (start, middle
// and end by default) and lays them out in a labelled grid. Also reports mean brightness per frame.
//   node scripts/sheet-v4.mjs <outdir> [V4Sample,V4Flagship,...] [--at=0.15,0.5,0.85]
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { chromium } from 'playwright';
import { timeline4, SAMPLE4 } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const args = process.argv.slice(2);
const out = path.resolve(args[0]);
const ids = (args.find((a, i) => i > 0 && !a.startsWith('--')) || 'V4Sample').split(',');
const at = (args.find((a) => a.startsWith('--at=')) || '--at=0.2,0.55,0.9').slice(5).split(',').map(Number);
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
const film = (id) => (/Flagship|Sample/.test(id) ? 'flagship' : /Short/.test(id) ? 'short' : 'ad');
fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.jsx') });
const br = await chromium.launch({ channel: 'chrome' });
const page = await br.newPage();
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id });
  const tl = timeline4(film(id), T, S, id === 'V4Sample' ? SAMPLE4 : null);
  const shots = [];
  for (const sc of tl.scenes) for (const k of at) {
    const fr = Math.min(composition.durationInFrames - 1, sc.from + Math.round(sc.dur * k));
    const file = path.join(out, `${id}-${sc.scene}-${fr}.png`);
    await renderStill({ serveUrl, composition, frame: fr, output: file });
    shots.push({ file, label: `${sc.scene} f${fr}` });
  }
  const V = composition.height > composition.width, cols = V ? 6 : 3, tw = V ? 270 : 600, th = Math.round(tw * composition.height / composition.width);
  const res = await page.evaluate(async ({ shots, cols, tw, th }) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const rows = Math.ceil(shots.length / cols), c = document.createElement('canvas'); c.width = cols * (tw + 10) + 10; c.height = rows * (th + 34) + 10;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    const lum = [];
    for (let i = 0; i < shots.length; i++) {
      const im = await load(shots[i].data), x = 10 + (i % cols) * (tw + 10), y = 10 + Math.floor(i / cols) * (th + 34);
      g.drawImage(im, x, y, tw, th);
      const d = g.getImageData(x, y, tw, th).data; let s = 0; for (let j = 0; j < d.length; j += 16) s += 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
      const L = s / (d.length / 16); lum.push(Math.round(L));
      g.fillStyle = '#ddd'; g.font = '15px sans-serif'; g.fillText(`${shots[i].label}  ·  luminance ${Math.round(L)}`, x, y + th + 20);
    }
    return { png: c.toDataURL('image/png'), lum };
  }, { shots: shots.map((s) => ({ label: s.label, data: 'data:image/png;base64,' + fs.readFileSync(s.file).toString('base64') })), cols, tw, th });
  fs.writeFileSync(path.join(out, `sheet-${id}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
  console.log(id, 'mean luminance', Math.round(res.lum.reduce((a, b) => a + b, 0) / res.lum.length), JSON.stringify(shots.map((s, i) => `${s.label}:${res.lum[i]}`)));
}
await br.close();
