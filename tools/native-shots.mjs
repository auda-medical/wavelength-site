// Screenshots of store-app screens in light, dark and Arabic (right to left) at 390px, using the real bundle over the
// stand-in native bridge (tools/native-harness.mjs). Also reports horizontal overflow and page errors. Dummy account.
//
// Setup: node mobile/scripts/build-www.mjs, then node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/native-shots.mjs <outdir> [route ...]      (routes like '#/backup' '#/settings?sync=1')
import fs from 'node:fs';
import path from 'node:path';
import { harness } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || 'native-shots';
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : ['#/backup', '#/settings', '#/me'];
const API = process.env.WL_API || 'http://localhost:8787';
localOnly(API, 'tools/native-shots.mjs');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
const su = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'Shots', email: `shots${Date.now()}@example.com`, password: 'Long-password-1', terms: true }) });
const token = su.headers.get('X-Wavelength-Token');
await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], onboarded: true } }) });

const problems = [];
for (const [variant, theme, lang] of [['light', 'light', 'en'], ['dark', 'dark', 'en'], ['ar', 'light', 'ar']]) {
  const { ctx, page } = await newApp(390, 844);
  await page.goto('https://localhost/');
  await page.evaluate(([tok, theme, lang]) => {
    localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok }));
    localStorage.setItem('wl-theme', theme); localStorage.setItem('wl-lang', lang);
  }, [token, theme, lang]);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  for (const route of ROUTES) {
    await page.evaluate((r) => { location.hash = r; }, route);
    await page.waitForTimeout(900);
    const name = route.replace(/^#\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || 'home';
    await page.screenshot({ path: path.join(OUT, `${name}-${variant}.png`), fullPage: true });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (wide > 1) problems.push(`${route} ${variant}: ${wide}px horizontal overflow`);
  }
  await ctx.close();
}
await browser.close();
for (const p of problems.concat(errors)) console.log('PROBLEM', p);
console.log(problems.length + errors.length ? 'Problems found.' : 'Screens saved to ' + OUT + ', no overflow, no page errors.');
process.exit(problems.length + errors.length ? 1 : 0);
