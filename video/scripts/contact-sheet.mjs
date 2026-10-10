// Puts a folder of stills on one contact sheet (Chrome renders a simple grid) for quick review.
//   node scripts/contact-sheet.mjs <folder> <out.png> [columns]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const [dir, out, cols = 3] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px;font:14px sans-serif;color:#ccc">${files.map((f) => `<figure style="margin:0"><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}"><figcaption>${f}</figcaption></figure>`).join('')}</body>`;
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 1800, height: 1000 } });
await p.setContent(html); await p.waitForTimeout(300); await p.screenshot({ path: out, fullPage: true }); await b.close();
