// Renders the 3D "move" illustrations for Learn posts.
// Needs: npm i --no-save three@0.169.0 playwright@1.56
// Run:   node tools/learn-3d/render.mjs [lung,subcostal,ivc]
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const f = path.join(process.cwd(), decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(4174);

const scenes = (process.argv[2] || 'lung,subcostal,ivc').split(',');
const out = process.argv[3] || 'content/learn/images';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.error('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.error(m.text()));
for (const s of scenes) {
  await p.goto(`http://localhost:4174/tools/learn-3d/scene.html?scene=${s}`);
  await p.waitForFunction('window.__done === true', null, { timeout: 120000 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${s}-move.png` });
  console.log(`${out}/${s}-move.png`);
}
await b.close(); srv.close();
