// Renders each one-page guide (/guides/<slug>/at-a-glance/) to an A4 PDF with the print styles,
// checks it fits on one page, and records a hash of the Markdown source so the build only links
// a PDF that matches the current text. Run after `node build.js` whenever a file in
// content/guides/at-a-glance/ changes, then build again and commit the PDFs and at-a-glance.json.
//   npm i --no-save playwright@1.56 && node build.js && node tools/glance-pdf.mjs && node build.js
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // fileURLToPath: also right on Windows
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'content/guides/at-a-glance');
const OUT = path.join(ROOT, 'src/assets/guides');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  let f = path.join(DIST, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(4175);

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
const browser = await chromium.launch();
const page = await browser.newPage();
let failed = false;
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.md')).sort()) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const guide = (src.match(/^guide:\s*(.+)$/m) || [])[1]?.trim() || f.replace(/\.md$/, '');
  await page.goto(`http://localhost:4175/guides/${guide}/at-a-glance/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pages !== 1) { console.error(`${guide}: ${pages} pages, expected 1. Shorten the summary or tighten the print styles.`); failed = true; continue; }
  fs.writeFileSync(path.join(OUT, `${guide}-at-a-glance.pdf`), pdf);
  manifest[guide] = crypto.createHash('sha256').update(src).digest('hex').slice(0, 16);
  console.log(`${guide}: 1 page, ${Math.round(pdf.length / 1024)} KB`);
}
await browser.close(); srv.close();
fs.writeFileSync(path.join(OUT, 'at-a-glance.json'), JSON.stringify(manifest, null, 2) + '\n');
if (failed) process.exit(1);
