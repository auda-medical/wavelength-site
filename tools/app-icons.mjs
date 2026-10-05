// Android launcher icons for the store app, drawn from the Wavelength mark so the installed icon matches the
// website's installed icon (ring about 85% of the visible tile). Writes mobile/assets/icon-foreground.png and every
// mipmap in mobile/android/app/src/main/res: adaptive foreground, background and monochrome (themed icons) layers
// at 108 dp, and legacy square and round icons at 48 dp. The adaptive XML uses the layers with no inset.
// Run: node tools/app-icons.mjs   (needs Playwright: npm i --no-save playwright@1.56). `npm run assets` in mobile/
// runs it after capacitor-assets, which on its own would put back small, inset icons.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'mobile/android/app/src/main/res');
const NAVY = '#0A1526';
// Same mark as the app and website: thin cream ring, teal amplitude W.
const mark = (ring) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" fill="none"><circle cx="32" cy="32" r="30.4" stroke="${ring}" stroke-width="1.15"/><path d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke="${ring === '#FFFFFF' ? '#FFFFFF' : '#7FC4CC'}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Adaptive layers are 108 dp; launchers show the middle 72 dp. The ring spans 57% of 108 dp, about 85% of what shows.
const ADAPTIVE_MARK = 0.57;
const LEGACY_MARK = 0.8;
const DENS = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(size, { bg = 'transparent', markScale, ring = '#F7F5F0', shape = 'square' }, out) {
  await page.setViewportSize({ width: size, height: size });
  const m = Math.round(size * markScale);
  const radius = shape === 'round' ? '50%' : shape === 'rounded' ? '22%' : '0';
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;background:${bg};border-radius:${radius};display:grid;place-items:center"><div style="width:${m}px;height:${m}px">${mark(ring)}</div></div></body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

await render(1024, { markScale: ADAPTIVE_MARK }, path.join(ROOT, 'mobile/assets/icon-foreground.png'));
for (const [d, k] of Object.entries(DENS)) {
  const dir = path.join(RES, 'mipmap-' + d);
  fs.mkdirSync(dir, { recursive: true });
  const a = Math.round(108 * k), l = Math.round(48 * k);
  await render(a, { markScale: ADAPTIVE_MARK }, path.join(dir, 'ic_launcher_foreground.png'));
  await render(a, { bg: NAVY, markScale: 0 }, path.join(dir, 'ic_launcher_background.png'));
  await render(a, { markScale: ADAPTIVE_MARK, ring: '#FFFFFF' }, path.join(dir, 'ic_launcher_monochrome.png'));
  await render(l, { bg: NAVY, markScale: LEGACY_MARK, shape: 'rounded' }, path.join(dir, 'ic_launcher.png'));
  await render(l, { bg: NAVY, markScale: LEGACY_MARK, shape: 'round' }, path.join(dir, 'ic_launcher_round.png'));
}
const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Made by tools/app-icons.mjs: full-size layers, no inset, so the mark matches the website's installed icon. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), xml);
fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), xml);
await browser.close();
console.log('Android launcher icons written');
