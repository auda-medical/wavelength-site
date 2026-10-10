// QR codes for the end frames, from the same library the app uses for exports (src/app/vendor/qrcode.js, MIT).
// Writes src/qr.json: { film: { url, size, dark: [[x,y], ...] } }. Error correction M, which survives a small overlay.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const qrcode = require('../../src/app/vendor/qrcode.js');
const S = JSON.parse(fs.readFileSync(new URL('../src/script.json', import.meta.url), 'utf8'));
const out = {};
for (const [film, url] of Object.entries(S.links)) {
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), dark = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) dark.push([x, y]);
  out[film] = { url, size: n, dark };
}
fs.writeFileSync(new URL('../src/qr.json', import.meta.url), JSON.stringify(out));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.size}x${v.size}`).join(', '));
