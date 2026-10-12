// Exploration helper: starts the filming world, logs in, and screenshots the given app routes for review.
//   node --import ../test/helpers/register.mjs scripts/explore.mjs <outdir> learner|sup '#/' '#/log' ...
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startWorld, PASSWORD } from './world.mjs';

const [out, who, ...routes] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const w = await startWorld(8799);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London' });
await ctx.addInitScript(() => { try { localStorage.setItem('wl-theme', 'light'); localStorage.setItem('wl-lang', 'en'); } catch (e) { /* ignore */ } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const email = who === 'sup' ? w.SUP.email : w.LEARNER.email;
await page.goto(w.base + '/app/#/login');
await page.waitForTimeout(1200);
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', PASSWORD);
await page.click('form button[type=submit], form .btn.teal');
await page.waitForTimeout(2500);
for (const [i, r] of routes.entries()) {
  await page.goto(w.base + '/app/' + r);
  await page.waitForTimeout(1800);
  const f = path.join(out, `${String(i).padStart(2, '0')}-${r.replace(/[^a-z0-9]+/gi, '_')}.png`);
  await page.screenshot({ path: f, fullPage: false });
  console.log('saved', f);
}
console.log('errors:', errors.slice(0, 10));
await browser.close();
w.server.close();
process.exit(0);
