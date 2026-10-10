// Browser check of guide source status in the phone apps (October 2026): an Android-line app build (DIST, with the
// android-integration source-status patch) against this branch's Worker. The guide shows its own review and update
// dates at once, "Source checked" only from the server, a pending-review notice with the original's link, and offline
// the stored status labelled with the day it arrived. Synthetic sources, local only.
// Run: DIST=<patched Android-line dist> node --import ./test/helpers/register.mjs tools/e2e-app-guides.mjs <outdir>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import { verifiedAccount } from '../test/helpers/verify.mjs';
import worker from '../worker/index.js';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };
import { monitorRun, seedSources } from '../worker/monitor/run.js';
import { ukDate } from '../worker/time.js';

const out = process.argv[2] || 'shots-app-guides';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) errors.push(m); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => { const url = String(u && u.url || u); if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(u, init); return new Response('{}'); };
const pages = new Map();
const BODY = '<p>Accreditation requires a logbook of 50 supervised scans, reviewed by a mentor.</p><p>Training should be completed within 12 months of the first logbook scan.</p><p>The triggered assessment is conducted by a supervisor once the logbook is complete.</p><p>Candidates are encouraged to attend a recognised course.</p>';
const page = (b, t) => `<html><head><title>${t}</title></head><body><main><h1>${t}</h1>${b}</main></body></html>`;
for (const s of SOURCES.sources.filter((x) => x.mode === 'auto')) pages.set(s.url, page(BODY, s.name));
const MONITOR_FETCH = async (url) => (pages.has(url) ? new Response(pages.get(url), { headers: { 'Content-Type': 'text/html' } }) : new Response('nf', { status: 404 }));
const DIST = path.resolve(process.env.DIST || 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const ASSETS = { fetch: async (req) => { const u = new URL(req.url || req); let f = path.join(DIST, decodeURIComponent(u.pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!f.startsWith(DIST) || !fs.existsSync(f)) return new Response('Not found', { status: 404 }); return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } }); } };
const env = makeEnv({ ASSETS, MONITOR_FETCH, MONITOR_ON_DEMAND: 'false' });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'); const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    for (const k of ['origin', 'referer']) { const v = headers.get(k); if (v) headers.set(k, v.replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+/, ORIGIN)); }
    const init = { method: req.method, headers }; if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await worker.fetch(new Request(ORIGIN + url.pathname + url.search, init), env, wctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;
await seedSources(env);
const learner = await verifiedAccount(env, 'casey.guides@example.test', { firstName: 'Casey', lastName: 'Trainee' });
await learner.call('/api/app/profile', { profile: { pathways: ['fusic'], onboarded: true, grade: 'ST3' }, declaration: true });

const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const short = (d) => { const [y, m, dd] = d.split('-').map(Number); return new RegExp(`${dd} (${M[m - 1].slice(0, 3)}|${M[m - 1]}) ${y}`); };
const slug = 'fusic-accreditation', g = SOURCES.guides.find((x) => x.slug === slug);
const browser = await chromium.launch();
const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: true });
const [n, ...v] = learner.cookie.split('='); await cx.addCookies([{ name: n, value: v.join('='), domain: 'localhost', path: '/' }]);
const pg = await cx.newPage();
pg.on('pageerror', (e) => errors.push(String(e)));
pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
// Routing the status calls keeps the browser's HTTP cache (the route allows five minutes) out of the way between runs.
await cx.route('**/api/app/sources/**', (r) => r.continue());
const openGuide = async () => { await pg.goto('about:blank'); await pg.goto(`${BASE}/app/#/guides/${slug}`, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('.guide-note'); await pg.waitForTimeout(700); return pg.locator('.guide-note').first().innerText(); };

let t = await openGuide();
check(/Last clinically reviewed: 4 Oct(ober)? 2026/.test(t) && /Guidance last updated: 5 Oct(ober)? 2026/.test(t), 'app guide: its own review and update dates');
check(/Official sources not yet checked automatically\./.test(t) && !/Source checked:/.test(t), 'app guide: no check claimed before the first check');
await pg.screenshot({ path: path.join(out, 'app-guide-before.png') });
await monitorRun(env, wctx, { trigger: 'cron', ids: g.sources, limit: g.sources.length, force: true });
t = await openGuide();
check(short(ukDate()).test(t) && /Source checked:/.test(t) && /No changes detected during the latest check\./.test(t) && !/last connection/.test(t), `app guide: today's source check, live (${t.replace(/\n/g, ' | ')})`);
// Offline: the same guide again (the app and its guides are already loaded): the stored answer, labelled.
await cx.setOffline(true);
await pg.evaluate(() => { location.hash = '#/guides'; });
await pg.waitForTimeout(300);
await pg.evaluate((s) => { location.hash = `#/guides/${s}`; }, slug);
await pg.waitForSelector('.guide-note'); await pg.waitForTimeout(700);
t = await pg.locator('.guide-note').first().innerText();
check(/Source checked:/.test(t) && /Shown from this device's last connection/.test(t), `app guide offline: stored status, labelled (${t.replace(/\n/g, ' | ')})`);
await pg.screenshot({ path: path.join(out, 'app-guide-offline.png') });
await cx.setOffline(false);
// An important change at a source: the notice and the original's link.
const heart = SOURCES.sources.find((s) => s.name === 'FUSIC Heart');
pages.set(heart.url, page(BODY.replace('50 supervised', '40 supervised'), heart.name));
await monitorRun(env, wctx, { trigger: 'manual', ids: [heart.id], force: true });
await openGuide();
await pg.waitForSelector('[data-srcnotice]:not([hidden])');
const note = await pg.locator('[data-srcnotice]').innerText();
check(/An official source for this guide changed on/.test(note) && /being reviewed/.test(note) && /FUSIC Heart/.test(note), 'app guide: pending-review notice');
check((await pg.locator('[data-srcnotice] a').getAttribute('href')) === heart.url, 'app guide: links to the original');
check(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'app guide: no horizontal overflow');
await pg.screenshot({ path: path.join(out, 'app-guide-change.png') });
await browser.close(); server.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nApp guide checks passed.');
process.exit(errors.length ? 1 : 0);
