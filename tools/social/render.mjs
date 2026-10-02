// Renders social posts from tools/social/ad.html. Run: node tools/social/render.mjs <outdir>
import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
const types = { '.html': 'text/html', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { const f = path.join(process.cwd(), decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(4175);
const out = process.argv[2] || 'social-out'; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [f, w, h, name] of [['ig', 1080, 1350, 'wavelength-21dec-instagram-post'], ['story', 1080, 1920, 'wavelength-21dec-instagram-story'], ['li', 1200, 1200, 'wavelength-21dec-linkedin'], ['og', 1200, 630, 'og-core-21dec']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(`http://localhost:4175/tools/social/ad.html?f=${f}`); await p.waitForFunction('window.__done === true'); await p.waitForTimeout(200);
  const over = await p.evaluate(() => { const i = document.getElementById('in'); return i.scrollHeight > i.clientHeight + 1; });
  if (over) console.log('OVERFLOW', f);
  await p.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: w, height: h } }); await p.close();
}
await b.close(); srv.close(); console.log('done');
