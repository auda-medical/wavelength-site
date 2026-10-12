// Pixel difference between two PNGs of the same size (in a headless browser canvas): count of pixels differing by more
// than 2 levels, the largest difference and the bounding box of the differences. Writes a difference map if asked.
//   node scripts/png-diff.mjs <a.png> <b.png> [diff.png]
import fs from 'node:fs';
import { chromium } from 'playwright';

const [a, b, out] = process.argv.slice(2);
const br = await chromium.launch({ channel: 'chrome' });
const p = await br.newPage();
const r = await p.evaluate(async ({ a, b, wantMap }) => {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  const w = A.width, h = A.height, px = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h); };
  const da = px(A).data, db = px(B).data;
  const m = document.createElement('canvas'); m.width = w; m.height = h; const mg = m.getContext('2d'); const md = mg.createImageData(w, h);
  let n = 0, max = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < da.length; i += 4) { let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(da[i + k] - db[i + k])); if (d > 2) { n++; const x = (i / 4) % w, y = Math.floor(i / 4 / w); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } max = Math.max(max, d); md.data[i] = md.data[i + 1] = md.data[i + 2] = Math.min(255, d * 8); md.data[i + 3] = 255; }
  mg.putImageData(md, 0, 0);
  return { w, h, differing: n, maxDiff: max, box: n ? [x0, y0, x1, y1] : null, map: wantMap ? m.toDataURL('image/png') : null };
}, { a: 'data:image/png;base64,' + fs.readFileSync(a).toString('base64'), b: 'data:image/png;base64,' + fs.readFileSync(b).toString('base64'), wantMap: !!out });
if (out && r.map) fs.writeFileSync(out, Buffer.from(r.map.split(',')[1], 'base64'));
delete r.map;
console.log(JSON.stringify(r));
await br.close();
