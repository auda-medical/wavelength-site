// Template walkthrough at phone width (companion to tools/mobile-audit.mjs): one page of every layout, with the
// interactive parts exercised: menu, accordions (<details>), embedded films, the language control, anchor links,
// the sticky topic bar, long tables and forms. Saves a full-page screenshot per template and step and writes
// <outdir>/templates.json. Exits 1 on any problem.
//
// Run (after node build.js): node tools/mobile-templates.mjs <outdir> [--port 8824] [--width 360]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';

const out = path.resolve(process.argv[2] || 'mobile-templates');
const opt = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const PORT = Number(opt('port', 8824)), WIDTH = Number(opt('width', 360));
fs.mkdirSync(out, { recursive: true });
const firstDir = (d) => fs.readdirSync(path.join('dist', d), { withFileTypes: true }).filter((f) => f.isDirectory() && fs.existsSync(path.join('dist', d, f.name, 'index.html'))).map((f) => f.name).sort()[0];
const pearl = firstDir('learn/') && fs.readdirSync('dist/learn').find((n) => fs.existsSync(`dist/learn/${n}/test/index.html`));
const guide = 'pocus-accreditation';
const glance = fs.readdirSync('dist/guides').find((n) => fs.existsSync(`dist/guides/${n}/at-a-glance/index.html`));
const module_ = fs.readdirSync('dist/elearning').find((n) => fs.existsSync(`dist/elearning/${n}/index.html`) && !['account', 'certificate', 'verify'].includes(n));
const topic = fs.readdirSync('dist/learn').find((n) => /topic|^heart|^lung|^abdomen|^fundamentals|^soft|^eye/.test(n) && !fs.existsSync(`dist/learn/${n}/test/index.html`) && fs.existsSync(`dist/learn/${n}/index.html`));
const TEMPLATES = [
  ['home', '/'], ['courses', '/courses/'], ['course', '/courses/core-emergency-ultrasound/'], ['training', '/training/'],
  ['learn-index', '/learn/'], ['pearl', `/learn/${pearl}/`], ['pearl-test', `/learn/${pearl}/test/`], ['question-bank', '/learn/test/'],
  ['topic', topic ? `/learn/${topic}/` : null], ['guides-index', '/guides/'], ['guide', `/guides/${guide}/`],
  ['at-a-glance', glance ? `/guides/${glance}/at-a-glance/` : null], ['academy', '/elearning/'], ['academy-module', `/elearning/${module_}/`],
  ['logbook-landing', '/pocus-logbook/'], ['app-get', '/app/get/'], ['app-delete', '/app/delete-account/'], ['app-shell', '/app/'],
  ['faculty', '/faculty/'], ['about', '/about/'], ['contact', '/contact/'], ['privacy', '/privacy/'], ['terms', '/terms/'],
  ['subscribe', '/subscribe/'], ['verify', '/verify/'], ['booked', '/booked/'],
  ['french-home', '/fr/'], ['arabic-home', '/ar/'], ['not-found', '/this-page-does-not-exist/'],
].filter(([, r]) => r);

const server = spawn(process.execPath, ['--import', './test/helpers/register.mjs', 'tools/dev-worker.mjs', String(PORT), '--site'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, bad) => { server.stdout.on('data', (d) => { if (/dev worker on/.test(d)) ok(); }); server.on('exit', () => bad(new Error('dev worker stopped'))); });
const BASE = `http://localhost:${PORT}`;
const browser = await chromium.launch();
const report = [];

for (const [name, route] of TEMPLATES) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: WIDTH, height: 740 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 150)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  const steps = [], problems = [];
  const shot = async (step) => { const f = `${name}-${step}.png`; await page.screenshot({ path: path.join(out, f), fullPage: step === 'full' }); steps.push(f); };
  try {
    const res = await page.goto(BASE + route, { waitUntil: 'load' });
    if (name !== 'not-found' && res.status() !== 200) problems.push('HTTP ' + res.status());
    if (name === 'not-found' && res.status() !== 404) problems.push('missing page returned ' + res.status());
    await page.waitForTimeout(1500); await shot('first-screen');
    // scroll through so reveals run, then the full page
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 80)); } await new Promise((r) => setTimeout(r, 1300)); scrollTo({ top: 0, behavior: 'instant' }); });
    await shot('full');
    // menu
    if (await page.locator('.menu-toggle').isVisible().catch(() => false)) {
      await page.click('.menu-toggle'); await page.waitForTimeout(500); await shot('menu');
      const ok = await page.evaluate(() => document.documentElement.classList.contains('menu-open'));
      if (!ok) problems.push('menu did not open');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    }
    // accordions
    const det = page.locator('main details summary');
    const nd = await det.count();
    for (let i = 0; i < Math.min(nd, 3); i++) {
      const s = det.nth(i); await s.scrollIntoViewIfNeeded(); await s.click(); await page.waitForTimeout(200);
      const open = await s.evaluate((el) => el.parentElement.open);
      if (!open) problems.push('accordion ' + i + ' did not open');
    }
    if (nd) await shot('accordions');
    // films: the poster or video element is laid out and its source answers
    const vids = await page.evaluate(() => [...document.querySelectorAll('main video')].map((v) => ({ w: v.getBoundingClientRect().width, src: v.currentSrc || (v.querySelector('source') || {}).src || '', poster: v.poster })));
    for (const v of vids) {
      if (!v.w) problems.push('film not laid out');
      for (const u of [v.src, v.poster].filter(Boolean)) { const r = await page.request.get(u); if (r.status() >= 400) problems.push('film asset ' + r.status() + ' ' + u.replace(BASE, '')); }
    }
    // language control
    const lang = page.locator('.lang select, .lang button, .lang a').first();
    if (await lang.count()) { if (!(await lang.isVisible().catch(() => false)) && !(await page.locator('.menu-toggle').isVisible())) problems.push('language control not reachable'); }
    // in-page anchor (guide contents or topic links): follow the first and check the target shows
    const anchor = await page.evaluate(() => { const a = [...document.querySelectorAll('main a[href^="#"]')].find((x) => x.getAttribute('href').length > 1 && document.getElementById(x.getAttribute('href').slice(1)) && ![...x.attributes].some((at) => at.name.startsWith('data-'))); return a && a.getAttribute('href'); });
    if (anchor) {
      await page.evaluate((h) => { const a = document.querySelector(`main a[href="${h}"]`); a.scrollIntoView(); a.click(); }, anchor);
      await page.waitForTimeout(1600);
      const vis = await page.evaluate((h) => { const t = document.getElementById(h.slice(1)); const r = t.getBoundingClientRect(); let o = 1; for (let e = t; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return { top: Math.round(r.top), opacity: o }; }, anchor);
      if (vis.top < -5 || vis.top > 400 || vis.opacity < 0.9) problems.push('anchor ' + anchor + ' target not shown: ' + JSON.stringify(vis));
      await shot('anchor');
    }
    // sticky elements must not cover the reading area: anything fixed/sticky taller than a third of the screen
    const sticky = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => { const cs = getComputedStyle(el); return (cs.position === 'fixed' || cs.position === 'sticky') && el.getBoundingClientRect().height > innerHeight / 3 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.1; }).map((el) => el.className || el.tagName));
    if (sticky.filter((c) => !/mobile-menu|menu/.test(String(c))).length) problems.push('tall fixed/sticky element: ' + sticky.join(', '));
    // long tables scroll inside their wrapper, not the page
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) problems.push('page scrolls sideways by ' + overflow + 'px');
    if (name === 'not-found') errors.splice(0, errors.length, ...errors.filter((e) => !/status of 404/.test(e)));
    if (errors.length) problems.push(errors.length + ' browser errors: ' + errors[0]);
  } catch (e) { problems.push('exception: ' + String(e.message).slice(0, 160)); }
  report.push({ name, route, ok: !problems.length, problems, steps });
  console.log((problems.length ? 'FAIL ' : 'ok   ') + name.padEnd(16) + route + (problems.length ? '  ' + problems.join('; ') : ''));
  await ctx.close();
}
await browser.close(); server.kill();
fs.writeFileSync(path.join(out, 'templates.json'), JSON.stringify({ width: WIDTH, when: new Date().toISOString(), templates: report }, null, 1));
process.exit(report.some((r) => !r.ok) ? 1 : 0);
