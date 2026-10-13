// Mobile loading and rendering audit for every public page of the built site (October 2026, after the blank
// POCUS guide on Android). Serves dist/ through the real Worker (tools/dev-worker.mjs --site), opens every route in
// mobile Chromium and checks that content is visible and usable. Writes <outdir>/results.json (one record per route,
// width and scenario) and <outdir>/summary.json, and exits 1 if anything fails.
//
// Run (after node build.js): node tools/mobile-audit.mjs <outdir> [--routes a,b] [--concurrency 6] [--port 8823]
//
// Checks, per route:
//   at 320, 360, 390 and 412 px, fresh load at the top: HTTP 200 on the canonical path; readable text on the first
//     screen; nothing laid out but invisible (opacity 0) after scrolling through the page; no sideways scrolling; no
//     first-party request that fails or returns 4xx/5xx; no uncaught error or console error; header, menu (opens and
//     closes) and footer present; page height plausible; no long empty stretch inside <main>.
//   at 360 px: reload at the top, reload part-way down, back/forward, cached reload, slow network, reduced motion,
//     main.js blocked and JavaScript off: the text on screen must be visible in every case.
//   at 412 px: the fresh load runs twice, to catch intermittent faults.
// Routes: every index.html in dist/ except /admin/ and /volunteer/ (staff only, behind a login) and /email/ (newsletter templates), and every URL in
// sitemap.xml must be among them. The audit fails, rather than passes quietly, if a selector or route disappears.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, webkit, devices } from 'playwright';

const out = path.resolve(process.argv[2] || 'mobile-audit');
const opt = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const CONC = Number(opt('concurrency', 6));
const PORT = Number(opt('port', 8823));
// --engine webkit: iPhone Safari's engine with an iPhone profile (npx playwright install webkit); default chromium,
// Android Chrome with a Pixel profile. Same widths either way.
const ENGINE = opt('engine', 'chromium');
const DEVICE = ENGINE === 'webkit' ? devices['iPhone 15'] : devices['Pixel 7'];
const DIST = path.resolve('dist');
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('Run node build.js first'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

// ---- Route inventory ----
const routes = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name === 'index.html') {
      const r = '/' + path.relative(DIST, path.dirname(p)).split(path.sep).join('/') + '/';
      routes.push(r === '//' ? '/' : r.replace(/^\/\.\//, '/'));
    }
  }
})(DIST);
const PRIVATE = /^\/(admin|email|volunteer)\//;
// Pages the local Worker cannot render because they use a Cloudflare-only API (HTMLRewriter): check these on the
// live site after a release instead.
const CLOUDFLARE_ONLY = { '/elearning/account/': 'uses HTMLRewriter (Cloudflare runtime only)' };
const audited = routes.filter((r) => !PRIVATE.test(r) && !CLOUDFLARE_ONLY[r]).sort();
const sitemap = [...fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
const notBuilt = sitemap.filter((u) => !audited.includes(u));
const only = opt('routes', '');
const targets = only ? only.split(',') : audited;

// ---- Server: the real Worker over dist/ ----
const server = spawn(process.execPath, ['--import', './test/helpers/register.mjs', 'tools/dev-worker.mjs', String(PORT), '--site'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, bad) => { server.stdout.on('data', (d) => { if (/dev worker on/.test(d)) ok(); }); server.on('exit', () => bad(new Error('dev worker stopped'))); });
const BASE = `http://localhost:${PORT}`;
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch();

// ---- In-page measurements ----
const MEASURE = () => {
  const vh = innerHeight, vw = innerWidth;
  const shown = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const opacity = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const main = document.querySelector('main');
  const root = main || document.body;
  let onScreen = 0; const hidden = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    const t = n.textContent.trim(); if (!t || !n.parentElement || !shown(n.parentElement)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const op = opacity(n.parentElement);
    if (op < 0.1) { const box = n.parentElement.closest('[class]'); hidden.push((box ? box.tagName.toLowerCase() + '.' + box.className.toString().split(' ').join('.') : n.parentElement.tagName) + ': ' + t.slice(0, 40)); }
    else if (r.bottom > 0 && r.top < vh) onScreen += t.length;
  }
  // Long empty stretches inside <main>: 100 px bands with no visible text, image, video or form control.
  let gap = 0;
  if (main) {
    const mr = main.getBoundingClientRect(), top = mr.top + scrollY, bottom = mr.bottom + scrollY;
    const filled = new Set();
    main.querySelectorAll('*').forEach((el) => {
      if (el.children.length && !/^(IMG|VIDEO|IFRAME|CANVAS|SVG|INPUT|SELECT|TEXTAREA|BUTTON|PICTURE)$/i.test(el.tagName)) {
        if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return;
      }
      const r = el.getBoundingClientRect(); if (!r.height || !r.width || opacity(el) < 0.1 || !shown(el)) return;
      for (let y = Math.floor((r.top + scrollY - top) / 100); y <= Math.floor((r.bottom + scrollY - top) / 100); y++) filled.add(y);
    });
    let run = 0; const bands = Math.ceil((bottom - top) / 100);
    for (let b = 0; b < bands; b++) { if (filled.has(b)) run = 0; else { run++; gap = Math.max(gap, run * 100); } }
  }
  const wide = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed' && shown(el); })
    .filter((el, i, a) => !a.some((p) => p !== el && p.contains(el))).slice(0, 5).map((el) => el.tagName.toLowerCase() + (el.className ? '.' + el.className.toString().split(' ').join('.') : '') + ' right=' + Math.round(el.getBoundingClientRect().right));
  return {
    onScreen, hidden: hidden.slice(0, 8), hiddenCount: hidden.length, gap,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide,
    height: document.documentElement.scrollHeight, vh, y: Math.round(scrollY),
    header: !!document.querySelector('.site-header'), footer: !!document.querySelector('.site-footer'),
    toggle: (() => { const t = document.querySelector('.menu-toggle'); return !!t && shown(t) && t.getBoundingClientRect().width > 0; })(),
    main: !!main, title: document.title, canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
  };
};

async function scrollThrough(page) {
  // Instant scrolling: the site sets scroll-behavior:smooth, which would leave short steps unfinished. The final
  // wait covers the 1 s reveal transition.
  await page.evaluate(async () => { const go = (y) => scrollTo({ top: y, behavior: 'instant' }); const step = innerHeight * 0.8; for (let y = 0; y < document.documentElement.scrollHeight; y += step) { go(y); await new Promise((r) => setTimeout(r, 80)); } go(document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, 1400)); go(0); await new Promise((r) => setTimeout(r, 300)); });
}

// Academy lessons, assessments and the learner account need a registered learner: each context registers an invented
// one in the local Worker's in-memory database (example.invalid addresses), as a real learner does on a module page.
const GATED = /^\/elearning\/([^/]+)\/(learn|assessment)\/|^\/elearning\/account\//;
// Pages that redirect by design when opened without their link: the certificate page needs a certificate code.
const EXPECTED_REDIRECT = { '/elearning/certificate/': '/elearning/' };
let learners = 0;
async function asLearner(ctx, route) {
  const slug = (route.match(GATED) || [])[1] || 'lung';
  const res = await ctx.request.post(BASE + '/api/academy/register', { headers: { Accept: 'application/json', Origin: BASE, 'Content-Type': 'application/json' }, data: { module: slug, first_name: 'Audit', last_name: 'Learner' + (++learners), email: `audit${learners}.${Date.now()}@example.invalid`, privacy: true } });
  if (!res.ok()) throw new Error('learner registration ' + res.status() + ' ' + (await res.text()).slice(0, 120));
  // WebKit keeps no Secure cookie on http://localhost (Chromium treats localhost as secure): copy the login cookie in
  // without that flag, for this local test only.
  if (ENGINE === 'webkit') {
    const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value.split(';')[0].split('='));
    await ctx.addCookies(cookies.map(([name, ...v]) => ({ name, value: v.join('='), url: BASE })));
  }
}

async function open(width, { reducedMotion = 'no-preference', javaScriptEnabled = true, route = '' } = {}) {
  const ctx = await browser.newContext({ ...DEVICE, viewport: { width, height: 740 }, reducedMotion, javaScriptEnabled });
  if (GATED.test(route)) await asLearner(ctx, route);
  const page = await ctx.newPage();
  const log = { errors: [], failed: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + String(e.message || e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) log.errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(BASE) && !/net::ERR_ABORTED/.test(r.failure()?.errorText || '')) log.failed.push(r.url().slice(BASE.length) + ' ' + (r.failure()?.errorText || '')); });
  page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400 && r.request().resourceType() !== 'document') log.failed.push(r.url().slice(BASE.length) + ' ' + r.status()); });
  return { ctx, page, log };
}

const results = [];
function record(route, width, scenario, ok, problems, m, log) {
  results.push({ route, width, scenario, ok, problems, metrics: m && { onScreen: m.onScreen, hiddenCount: m.hiddenCount, gap: m.gap, overflow: m.overflow, height: m.height, y: m.y }, hidden: m?.hidden, wide: m?.wide, errors: log?.errors, failed: log?.failed });
}
const MIN_TEXT = 30;

async function fresh(route, width, label = 'fresh') {
  const problems = [];
  let ctx, page, log;
  try {
    ({ ctx, page, log } = await open(width, { route }));
    const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 });
    if (!res || res.status() !== 200) problems.push('HTTP ' + (res && res.status()));
    const landed = new URL(page.url()).pathname;
    if (landed !== route && EXPECTED_REDIRECT[route] !== landed) problems.push('ended at ' + landed);
    await page.waitForTimeout(1500);
    const first = await page.evaluate(MEASURE);
    if (first.onScreen < MIN_TEXT) problems.push(`little visible text on the first screen (${first.onScreen} chars)`);
    await scrollThrough(page);
    const m = await page.evaluate(MEASURE);
    if (m.hiddenCount) problems.push(`${m.hiddenCount} text blocks laid out but invisible after scrolling`);
    if (m.overflow > 1) problems.push(`sideways scroll ${m.overflow}px`);
    // The web app screens under /app/ (the logbook, supervisor sign-off, assessment and verification) have their own
    // layout with no site header, footer or menu; they must still show readable text and stay within the screen.
    const appScreen = /^\/app\//.test(route) && !m.header;
    if (!appScreen) {
      if (!m.main) problems.push('no <main>');
      if (!m.header) problems.push('no .site-header');
      if (!m.footer) problems.push('no .site-footer');
      if (!m.toggle) problems.push('menu button missing or hidden');
    }
    if (m.height < m.vh * 0.8 || m.height > 80000) problems.push('implausible height ' + m.height);
    if (m.gap > m.vh * 1.5) problems.push(`empty stretch of ${m.gap}px inside <main>`);
    if (m.toggle) {
      await page.click('.menu-toggle');
      await page.waitForTimeout(500);
      const menu = await page.evaluate(() => { const mm = document.getElementById('mobile-menu'); const r = mm && mm.getBoundingClientRect(); return { open: document.documentElement.classList.contains('menu-open'), expanded: document.querySelector('.menu-toggle').getAttribute('aria-expanded'), links: mm ? [...mm.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().height > 0).length : 0, visible: !!r && r.height > 0 && getComputedStyle(mm).visibility !== 'hidden' }; });
      if (!menu.open || menu.expanded !== 'true' || !menu.links || !menu.visible) problems.push('menu did not open: ' + JSON.stringify(menu));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      if (await page.evaluate(() => document.documentElement.classList.contains('menu-open'))) problems.push('menu did not close on Escape');
    }
    if (log.errors.length) problems.push(log.errors.length + ' browser errors');
    if (log.failed.length) problems.push(log.failed.length + ' failed first-party requests');
    record(route, width, label, !problems.length, problems, { ...m, onScreen: first.onScreen }, log);
  } catch (e) { problems.push('exception: ' + String(e.message).slice(0, 160)); record(route, width, label, false, problems, null, log); }
  if (ctx) await ctx.close();
}

// The text on screen must be visible: after load, in every scenario.
async function check(route, scenario, page, log, problems) {
  await page.waitForTimeout(1600);
  const m = await page.evaluate(MEASURE);
  const hiddenOnScreen = await page.evaluate(() => { let n = 0; document.querySelectorAll('main *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight && r.height && [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); if (o < 0.1) n++; } }); return n; });
  if (hiddenOnScreen) problems.push(`${hiddenOnScreen} invisible text blocks on screen`);
  // On a short page reloaded part-way down, the screen can hold mostly the footer, outside <main>: that is fine as
  // long as nothing on screen is invisible.
  const mainOnScreen = await page.evaluate(() => { const mn = document.querySelector('main'); if (!mn) return true; const r = mn.getBoundingClientRect(); return r.bottom > innerHeight * 0.5; });
  if (m.onScreen < MIN_TEXT && mainOnScreen) problems.push(`little visible text on screen (${m.onScreen} chars) at y=${m.y}`);
  record(route, 360, scenario, !problems.length, problems, m, log);
}

async function scenarios(route) {
  const W = 360;
  // reload at the top, then part-way down, then cached reload (same context keeps the cache)
  { const { ctx, page, log } = await open(W, { route }); try {
      await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(400);
      await page.reload({ waitUntil: 'load' }); await check(route, 'reload-top', page, log, []);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), Math.floor(h * 0.5)); await page.waitForTimeout(500);
      await page.reload({ waitUntil: 'load' }); await check(route, 'reload-mid', page, log, []);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.reload({ waitUntil: 'load' }); await check(route, 'cached-reload', page, log, []);
    } catch (e) { record(route, W, 'reload', false, ['exception: ' + e.message.slice(0, 160)]); } await ctx.close(); }
  // back/forward with a restored scroll position
  { const { ctx, page, log } = await open(W, { route }); try {
      await page.goto(BASE + route, { waitUntil: 'load' });
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), Math.floor(h * 0.4)); await page.waitForTimeout(500);
      await page.goto(BASE + (route === '/' ? '/contact/' : '/'), { waitUntil: 'load' });
      await page.goBack({ waitUntil: 'load' }); await check(route, 'back-forward', page, log, []);
    } catch (e) { record(route, W, 'back-forward', false, ['exception: ' + e.message.slice(0, 160)]); } await ctx.close(); }
  // slow network (Chromium: about 400 kbit/s and 400 ms latency; WebKit has no throttling, so every request waits 400 ms)
  { const { ctx, page, log } = await open(W, { route }); try {
      if (ENGINE === 'webkit') await page.route('**/*', (r) => setTimeout(() => r.continue().catch(() => {}), 400));
      else {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 20000 });
      }
      await page.goto(BASE + route, { waitUntil: 'load', timeout: 90000 }); await check(route, 'slow-network', page, log, []);
    } catch (e) { record(route, W, 'slow-network', false, ['exception: ' + e.message.slice(0, 160)]); } await ctx.close(); }
  // reduced motion: nothing invisible anywhere
  { const { ctx, page, log } = await open(W, { reducedMotion: 'reduce', route }); try {
      await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(800);
      const m = await page.evaluate(MEASURE); const p = [];
      if (m.hiddenCount) p.push(`${m.hiddenCount} invisible text blocks with reduced motion`);
      if (m.onScreen < MIN_TEXT) p.push('little visible text on screen');
      record(route, W, 'reduced-motion', !p.length, p, m, log);
    } catch (e) { record(route, W, 'reduced-motion', false, ['exception: ' + e.message.slice(0, 160)]); } await ctx.close(); }
  // main.js blocked (a failed or slow script): content must show without it
  { const { ctx, page, log } = await open(W, { route }); try {
      await page.route('**/assets/main.js*', (r) => r.abort());
      await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(3000);
      const m = await page.evaluate(MEASURE); const p = [];
      if (m.hiddenCount) p.push(`${m.hiddenCount} invisible text blocks without main.js`);
      if (m.onScreen < MIN_TEXT) p.push('little visible text on screen without main.js');
      record(route, W, 'no-main-js', !p.length, p, m, null);
    } catch (e) { record(route, W, 'no-main-js', false, ['exception: ' + e.message.slice(0, 160)]); } await ctx.close(); }
  // JavaScript off
  { const { ctx, page } = await open(W, { javaScriptEnabled: false, route }); try {
      await page.goto(BASE + route, { waitUntil: 'load' });
      const m = await page.evaluate(MEASURE).catch(() => null);
      // evaluate needs JS; with it off, read the server-rendered text instead
      const text = m ? m.onScreen : (await page.locator('main').innerText().catch(() => '')).trim().length;
      const p = text < MIN_TEXT ? ['no server-rendered text in <main> with JavaScript off'] : [];
      record(route, W, 'js-off', !p.length, p, null, null);
    } catch (e) { record(route, W, 'js-off', false, ['exception: ' + e.message.slice(0, 160)]); } await ctx.close(); }
}

// ---- Run ----
const jobs = [];
for (const r of targets) {
  for (const w of [320, 360, 390, 412]) jobs.push(() => fresh(r, w));
  jobs.push(() => fresh(r, 412, 'fresh-repeat'));
  jobs.push(() => scenarios(r));
}
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) { const j = jobs[next++]; await j(); if (++done % 50 === 0) console.log(`${done}/${jobs.length} jobs, ${Math.round((Date.now() - t0) / 1000)} s`); } }));
await browser.close();
server.kill();

const failures = results.filter((r) => !r.ok);
const summary = {
  when: new Date().toISOString(), engine: ENGINE, device: ENGINE === 'webkit' ? 'iPhone 15 profile' : 'Pixel 7 profile', routesInDist: routes.length, routesAudited: targets.length, excluded: routes.filter((r) => PRIVATE.test(r)), notAuditedLocally: CLOUDFLARE_ONLY,
  sitemapUrls: sitemap.length, sitemapNotBuilt: notBuilt, widths: [320, 360, 390, 412], checks: results.length, failed: failures.length,
  byScenario: Object.fromEntries([...new Set(results.map((r) => r.scenario))].map((s) => [s, { checks: results.filter((r) => r.scenario === s).length, failed: failures.filter((r) => r.scenario === s).length }])),
  failingRoutes: [...new Set(failures.map((r) => r.route))].sort(),
  problems: Object.entries(failures.flatMap((r) => r.problems.map((p) => p.replace(/\d+/g, 'N'))).reduce((a, p) => (a[p] = (a[p] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]),
  seconds: Math.round((Date.now() - t0) / 1000),
};
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, failingRoutes: summary.failingRoutes.slice(0, 40) }, null, 1));
if (notBuilt.length && !only) { console.error('Sitemap URLs with no built page: ' + notBuilt.join(', ')); process.exit(1); }
process.exit(failures.length ? 1 : 0);
