// Browser check of source monitoring (October 2026): a guide page's dates before and after the daily check and with a
// change awaiting review; name autocomplete for learners and supervisors (keyboard, touch, no contact details); the
// admin dashboard. Self-contained and local: the real Worker in process over the test database, synthetic source
// pages and a synthetic directory (MONITOR_FETCH), email captured. Nothing is fetched from the internet.
// Run: node build.js && node --import ./test/helpers/register.mjs tools/e2e-monitor.mjs <outdir>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import { verifiedAccount } from '../test/helpers/verify.mjs';
import worker from '../worker/index.js';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };
import { monitorRun, seedSources } from '../worker/monitor/run.js';
import { ukDate, longDate } from '../worker/time.js';

const out = process.argv[2] || 'shots-monitor';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) errors.push(m); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => { const url = String(u && u.url || u); if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(u, init); return new Response('{}'); };
if (typeof globalThis.HTMLRewriter === 'undefined') globalThis.HTMLRewriter = class { constructor() { this.h = []; } on(s, h) { this.h.push([s, h]); return this; } transform(res) { const h = this.h; return new Response(new ReadableStream({ async start(c) { let t = await res.text(); for (const [s, x] of h) { let inner = null; x.element({ setInnerContent: (v) => { inner = v; } }); if (inner != null) t = t.replace(new RegExp(`(<[^>]+id="${s.slice(1)}"[^>]*>)(</div>)`), (m, a, b) => a + inner + b); } c.enqueue(new TextEncoder().encode(t)); c.close(); } }), res); } };

// Synthetic sources: every guidance URL answers with a stand-in page; the FUSIC directory with a synthetic feed.
const pages = new Map();
const BODY = '<p>Accreditation requires a logbook of 50 supervised scans, reviewed by a mentor.</p><p>Training should be completed within 12 months of the first logbook scan.</p><p>The triggered assessment is conducted by a supervisor once the logbook is complete.</p><p>Candidates are encouraged to attend a recognised course and to reflect on each study.</p>';
const page = (b, t) => `<html><head><title>${t}</title></head><body><nav>Menu</nav><main><h1>${t}</h1>${b}</main></body></html>`;
for (const s of SOURCES.sources.filter((x) => x.mode === 'auto')) pages.set(s.url, { body: page(BODY, s.name) });
const DIR = SOURCES.sources.find((s) => s.id === 'dir:fusic').url;
const person = (name, organisation, modules, role) => ({ name, organisation, roles: modules.map((m) => ({ role, module: m })) });
pages.set(DIR, { body: JSON.stringify({ entries: [person('Sam Patel', 'Westfield Royal Infirmary', ['fusic-heart'], 'mentor'), person('Sam Patel', 'Eastbridge University Hospital', ['fusic-lung'], 'trainer'), person('Alex Example', 'Northtown General Hospital', ['fusic-heart'], 'supervisor'), person('Jo Rivers', 'Northtown General Hospital', ['fusic-lung', 'fusic-dvt'], 'trainer')] }), type: 'application/json' });
const MONITOR_FETCH = async (url) => { const p = pages.get(url); return p ? new Response(p.body, { headers: { 'Content-Type': p.type || 'text/html' } }) : new Response('nf', { status: 404 }); };

const DIST = path.resolve('dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const ASSETS = { fetch: async (req) => { const u = new URL(req.url || req); let f = path.join(DIST, decodeURIComponent(u.pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!f.startsWith(DIST) || !fs.existsSync(f)) return new Response('Not found', { status: 404 }); return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } }); } };
const env = makeEnv({ ASSETS, MONITOR_FETCH, DIRECTORY_SYNC: 'true', SUPERVISOR_APPLY: 'true', MONITOR_ON_DEMAND: 'false' });
const b64 = (u8) => Buffer.from(u8).toString('base64');
async function hash(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']); return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256)))}`; }
const ADMIN_PW = 'Local only admin 1!';
for (const [k, v] of [['admin_username', 'wavelength'], ['admin_hash', await hash(ADMIN_PW)], ['volunteer_username', 'volunteer'], ['volunteer_hash', await hash('Local only volunteer 1!')], ['session_secret', b64(crypto.getRandomValues(new Uint8Array(32)))]]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'); const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    for (const k of ['origin', 'referer']) { const v = headers.get(k); if (v) headers.set(k, v.replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+/, ORIGIN)); }
    const init = { method: req.method, headers }; if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await worker.fetch(new Request(ORIGIN + url.pathname + url.search, init), env, wctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = k === 'location' ? v.replace(ORIGIN, '') : v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;

await seedSources(env);
await env.DB.prepare("UPDATE monitor_sources SET mode = 'auto', adapter = 'fixture', status = 'never' WHERE id = 'dir:fusic'").run(); // as if ICS had agreed
await monitorRun(env, wctx, { trigger: 'cron', ids: ['dir:fusic'], force: true });
const ready = (c) => c.call('/api/app/profile', { profile: { pathways: ['fusic'], onboarded: true, grade: 'Consultant', supervisor: true }, declaration: true });
const learner = await verifiedAccount(env, 'casey.monitor@example.test', { firstName: 'Casey', lastName: 'Trainee' }); await ready(learner);
const sup = await verifiedAccount(env, 'jo.monitor@example.test', { firstName: 'Jo', lastName: 'Rivers' }); await ready(sup);

const browser = await chromium.launch();
async function open(name, client, w = 390) {
  const cx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'en-GB', hasTouch: w < 760 });
  if (client) { const [n, ...v] = client.cookie.split('='); await cx.addCookies([{ name: n, value: v.join('='), domain: 'localhost', path: '/' }]); }
  const page = await cx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { cx, page };
}
const shot = (p, f) => p.screenshot({ path: path.join(out, f) });
const ukToday = longDate(ukDate());
const slug = 'fusic-accreditation';
const g = SOURCES.guides.find((x) => x.slug === slug);

// 1. Before any check: reviewed and updated dates from the guide, no claim of a source check.
for (const w of [390, 1440]) {
  const { cx, page } = await open(`guide-before ${w}`, null, w);
  await page.goto(`${BASE}/guides/${slug}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const t = await page.locator('.guide-dates').innerText();
  check(/Last clinically reviewed: 4 October 2026/.test(t) && /Guidance last updated: 5 October 2026/.test(t), `guide ${w}: reviewed and updated dates from the guide`);
  check(/Official sources not yet checked automatically\./.test(t) && !/Source checked:/.test(t), `guide ${w}: no source-check date before any check`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `guide ${w}: no horizontal overflow`);
  await shot(page, `guide-before-${w}.png`);
  await cx.close();
}
// 2. After the day's checks: today's date and "no changes".
await monitorRun(env, wctx, { trigger: 'cron', ids: g.sources, limit: g.sources.length, force: true });
{
  const { cx, page } = await open('guide-after', null, 1440);
  await page.goto(`${BASE}/guides/${slug}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-source-checked]:not([hidden])');
  const t = await page.locator('.guide-dates').innerText();
  check(t.includes(`Source checked: ${ukToday}. No changes detected during the latest check.`), `guide after: "${t.replace(/\n/g, ' | ')}"`);
  check(/Last clinically reviewed: 4 October 2026/.test(t), 'guide after: the review date did not move');
  check(await page.locator('[data-source-notice]').isHidden(), 'guide after: no notice');
  await shot(page, 'guide-after.png');
  await cx.close();
}
// 3. An important source change: the notice, with a link to the original.
const heart = SOURCES.sources.find((s) => s.name === 'FUSIC Heart');
pages.set(heart.url, { body: page(BODY.replace('50 supervised scans', '40 supervised scans'), heart.name) });
await monitorRun(env, wctx, { trigger: 'manual', ids: [heart.id], force: true });
for (const w of [390, 1440]) {
  const { cx, page } = await open(`guide-change ${w}`, null, w);
  await page.goto(`${BASE}/guides/${slug}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-source-notice]:not([hidden])');
  const t = await page.locator('[data-source-notice]').innerText();
  check(t.includes(`An official source for this guide changed on ${ukToday}. This Wavelength summary is being reviewed.`) && t.includes('FUSIC Heart'), `guide change ${w}: notice`);
  check((await page.locator('[data-source-notice] a').getAttribute('href')) === heart.url, `guide change ${w}: links to the original`);
  check(!/No changes detected/.test(await page.locator('.guide-dates').innerText()), `guide change ${w}: does not say "no changes"`);
  await shot(page, `guide-change-${w}.png`);
  await cx.close();
}
// 4. Learner autocomplete: keyboard and touch, two Sam Patels told apart, no contact details.
for (const w of [390, 1440]) {
  const { cx, page } = await open(`learner ${w}`, learner, w);
  await page.goto(`${BASE}/app/#/supervisors`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-listing="svfind2"]:not([hidden])', { timeout: 15000 });
  const box = page.locator('#svfind2');
  check((await box.getAttribute('role')) === 'combobox' && (await box.getAttribute('aria-controls')) === 'svfind2-list', `learner ${w}: combobox semantics`);
  await box.fill('sa');
  await page.waitForTimeout(500);
  check(await page.locator('#svfind2-list').isHidden(), `learner ${w}: nothing under three letters`);
  await box.fill('sam pat');
  await page.waitForSelector('#svfind2-list li');
  const items = await page.locator('#svfind2-list li').allInnerTexts();
  check(items.length === 2 && items.some((t) => /Westfield/.test(t)) && items.some((t) => /Eastbridge/.test(t)), `learner ${w}: two Sam Patels by hospital`);
  check(!items.join(' ').includes('@'), `learner ${w}: no contact details`);
  const h = (await page.locator('#svfind2-list li').first().boundingBox()).height;
  check(h >= 44, `learner ${w}: option target ${Math.round(h)} px`);
  await shot(page, `learner-autocomplete-${w}.png`);
  if (w === 1440) { await box.press('ArrowDown'); await box.press('ArrowDown'); await box.press('Enter'); }
  else await page.locator('#svfind2-list li').nth(1).tap();
  await page.waitForSelector('#svpicked p');
  check(/Selected: Sam Patel/.test(await page.locator('#svpicked').innerText()), `learner ${w}: picked`);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'se2'), `learner ${w}: focus moves to the email field`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `learner ${w}: no horizontal overflow`);
  await shot(page, `learner-picked-${w}.png`);
  await cx.close();
}
// 5. Supervisor application: "Find your listing", "This is me", credentials ticked, claim recorded.
{
  const { cx, page } = await open('supervisor', sup, 390);
  await sup.call('/api/app/supervisor/application', { role: 'Consultant' });
  await page.goto(`${BASE}/app/#/supervisor/apply/experience`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-listing="svlst"]:not([hidden])', { timeout: 15000 });
  await page.locator('#svlst').fill('jo riv');
  await page.waitForSelector('#svlst-list li');
  await page.locator('#svlst-list li').first().tap();
  await page.waitForSelector('[data-claim]');
  check(/Is this you\?/.test(await page.locator('#svclaim').innerText()), 'supervisor: asked "Is this you?"');
  await page.locator('[data-claim]').tap();
  await page.waitForSelector('#svclaim .ok');
  check(/will confirm it is you/.test(await page.locator('#svclaim').innerText()), 'supervisor: claim recorded, confirmation pending');
  const ticked = await page.evaluate(() => ({ type: !!document.querySelector('input[name=credType][value="fusic-trainer"]:checked'), mods: [...document.querySelectorAll('input[name="mod-fusic-trainer"]:checked')].map((x) => x.value).sort() }));
  check(ticked.type && ticked.mods.join() === 'dvt,lung', `supervisor: listed credential ticked (${JSON.stringify(ticked)})`);
  check((await env.DB.prepare("SELECT status FROM directory_links").first()).status === 'claimed', 'supervisor: a claim only, not confirmed');
  await shot(page, 'supervisor-claim.png');
  await cx.close();
}
// 6. Admin dashboard.
{
  const { cx, page } = await open('admin', null, 1440);
  await page.goto(`${BASE}/admin/login/`);
  await page.fill('input[name=username]', 'wavelength'); await page.fill('input[name=password]', ADMIN_PW);
  await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]);
  await page.goto(`${BASE}/admin/sources/`);
  const t = await page.locator('#admin-root').innerText();
  check(/Needs review \(1\)/.test(t) && /FUSIC Heart/.test(t), 'admin: the change waits for review');
  await page.locator('#admin-root').screenshot({ path: path.join(out, 'admin-review.png') });
  await page.goto(`${BASE}/admin/sources/?tab=sources`);
  check((await page.locator('#admin-root table tr').count()) > 40, 'admin: every source listed');
  await page.goto(`${BASE}/admin/sources/?tab=directories`);
  check(/FUSIC TMS directory/.test(await page.locator('#admin-root').innerText()), 'admin: directory state');
  await cx.close();
}
await browser.close(); server.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nAll monitoring browser checks passed.');
process.exit(errors.length ? 1 : 0);
