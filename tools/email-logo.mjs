// Renders the email header logo (PNG) from the brand lockup, using the self-hosted fonts.
// Usage: npm i --no-save playwright@1.56 && node tools/email-logo.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join('src/assets/fonts', f)).toString('base64');
const out = 'src/assets/email';
fs.mkdirSync(out, { recursive: true });

const html = `<!doctype html><html><head><style>
@font-face{font-family:DM;src:url(${font('dm-sans-latin-500-normal.woff2')});font-weight:500}
html,body{margin:0;background:#0F1E33}
.lock{display:inline-flex;align-items:center;gap:18px;padding:0;background:#0F1E33;font-family:DM}
svg{width:56px;height:56px;flex:none}
.wm{display:flex;flex-direction:column;color:#F7F5F0}
b{font-weight:500;font-size:23px;letter-spacing:.32em;line-height:1}
small{font-size:11px;font-weight:500;letter-spacing:.26em;color:#7FC4CC;margin-top:9px}
</style></head><body><div class="lock" id="lock">
<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" stroke="#F7F5F0" stroke-width="2"/><path d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke="#7FC4CC" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
<span class="wm"><b>WAVELENGTH</b><small>TUNE IN · GAIN CLARITY</small></span></div></body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 2 });
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
await p.locator('#lock').screenshot({ path: path.join(out, 'logo-header.png') });
const box = await p.locator('#lock').boundingBox();
console.log('logo css size', Math.round(box.width), 'x', Math.round(box.height));
await b.close();
