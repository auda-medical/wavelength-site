// 1.0.19 checks: sync after the phone has dropped the app's on-device logbook connection, and the sync attempts list.
// The owner's iPhone, left open on Wavelength for days (19 Oct 2026), failed every sync until the app was closed and
// opened again: WebKit can drop an app's IndexedDB connection while it sleeps. Here that is modelled in the page: once
// told to, the connection the app holds refuses every transaction with the error WebKit gives ("UnknownError:
// Connection to Indexed Database server lost"), and any connection opened afterwards works.
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1019.mjs [results.json] [http://localhost:8787]
// Exit code 1 when any check fails.
import fs from 'node:fs';
import { harness, net } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-1019.mjs');

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });

// Before the app starts: every IDBDatabase the page opens can be "lost" on request (window.__loseDb()).
const LOSABLE = `(() => {
  const open = [];
  const orig = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () {
    if (this.__lost) throw new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');
    return orig.apply(this, arguments);
  };
  const o = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function () { const r = o.apply(this, arguments); r.addEventListener('success', () => open.push(r.result)); window.__opens = (window.__opens || 0) + 1; return r; };
  window.__loseDb = () => { open.forEach((db) => { db.__lost = true; }); return open.length; };
})();`;

async function account() {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'Resume', email: `resume${t}@example.com`, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  if (!p.ok) throw new Error('profile: ' + JSON.stringify(p));
  return { token };
}
async function phone() {
  net.offline = false; net.hang = false; net.delay = 0; net.blocked = false; net.challenge = false;
  const acc = await account();
  const { ctx, page } = await newApp(390, 844, { init: [LOSABLE] });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })), acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const lastLog = (page) => page.evaluate(() => { const a = JSON.parse(localStorage.getItem('wl-synclog') || '[]'); return a[a.length - 1] || null; });
const logLen = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wl-synclog') || '[]').length);
async function settings(page) {
  await page.evaluate(() => { location.hash = '#/settings?sync=1'; });
  await page.waitForSelector('[data-syncpanel] [data-resync]', { timeout: 10000 });
  await page.waitForTimeout(400);
}
// Sync now (the panel's button) and wait for the attempt to be logged.
async function syncNow(page, during) {
  const n = await logLen(page);
  await page.click('[data-syncpanel] [data-resync]');
  if (during) await during();
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem('wl-synclog') || '[]').length > k, n, { timeout: 30000 });
  await page.waitForTimeout(600);
  return lastLog(page);
}

// L: the connection the app holds is lost while the app sleeps; the next sync still works.
{
  const { ctx, page } = await phone();
  await settings(page);
  const before = await syncNow(page);
  const lost = await page.evaluate(() => window.__loseDb());
  const opens0 = await page.evaluate(() => window.__opens);
  const a1 = await syncNow(page);
  const a2 = await syncNow(page);
  const opens1 = await page.evaluate(() => window.__opens);
  record('L1', 'After the logbook connection is lost, the next sync succeeds (the app reopens the logbook on this phone)', before && before.ok && lost >= 1 && a1 && a1.ok && a2 && a2.ok && opens1 === opens0 + 1, JSON.stringify({ before: before && before.ok, lost, a1, a2, reopenedOnce: opens1 - opens0 }));
  const text = await page.evaluate(() => (document.querySelector('[data-syncpanel] .sync-log') || {}).textContent || '');
  record('L2', 'The sync attempts list says the logbook was reopened, on that attempt only', a1.re === 1 && a2.re === 0 && (text.match(/logbook reopened/g) || []).length === 1, text.slice(0, 200));
  // What sync wrote through the reopened connection is on the phone after the app is closed and opened again.
  const okAt = await page.evaluate(() => JSON.parse(localStorage.getItem('wl-synclog')).filter((x) => x.ok).pop().at);
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(800);
  await settings(page);
  const facts = await page.evaluate(() => (document.querySelector('[data-syncpanel] .sync-facts') || {}).textContent || '');
  record('L3', 'Written through the reopened connection: "Last synced" is kept after the app restarts', !/Last synced\s*Not yet/.test(facts) && /Last synced/.test(facts), facts.replace(/\s+/g, ' ').slice(0, 200) + ' okAt ' + okAt);
  await ctx.close();
}

// H: a refusal from the server is logged with its HTTP status; an attempt the phone slept through keeps no duration.
{
  const { ctx, page } = await phone();
  await settings(page);
  await page.route('**/api/app/sync?**', (route) => route.fulfill({ status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://localhost', 'Access-Control-Allow-Credentials': 'true' }, body: JSON.stringify({ ok: false, error: 'Conflict' }) }));
  const f = await syncNow(page);
  await page.waitForTimeout(400);
  const text = await page.evaluate(() => (document.querySelector('[data-syncpanel] .sync-log') || {}).textContent || '');
  record('H1', 'A refused sync is logged with the server\'s HTTP status (a code only) and shown in the list', f && !f.ok && f.kind === 'failed' && f.why === 'HTTP 409' && /HTTP 409/.test(text), JSON.stringify(f));
  await page.unroute('**/api/app/sync?**');
  net.delay = 2500;
  const s = await syncNow(page, async () => { await page.waitForTimeout(400); await page.evaluate(() => window.dispatchEvent(new CustomEvent('wl:pause'))); await page.waitForTimeout(300); await page.evaluate(() => window.dispatchEvent(new CustomEvent('wl:resume', { detail: { away: 300 } }))); });
  net.delay = 0;
  const t = await syncNow(page);
  record('H2', 'An attempt the app was paused during keeps no duration; the next attempt has one', s && s.ok && !s.ms && t && t.ok && t.ms > 0, JSON.stringify({ s, t }));
  await ctx.close();
}

// D: the lists the learner opened in the sync panel stay open when a sync redraws it.
{
  const { ctx, page } = await phone();
  await settings(page);
  await syncNow(page);
  await page.evaluate(() => { document.querySelectorAll('[data-syncpanel] details').forEach((d) => { d.open = true; }); });
  const n = await page.evaluate(() => document.querySelectorAll('[data-syncpanel] details[open]').length);
  await syncNow(page);
  const after = await page.evaluate(() => ({ open: document.querySelectorAll('[data-syncpanel] details[open]').length, all: document.querySelectorAll('[data-syncpanel] details').length }));
  record('D1', 'Opened lists (Recent sync attempts, Start-up details) stay open when a sync redraws the panel', n >= 2 && after.open === after.all && after.all >= 2, JSON.stringify({ openedBefore: n, after }));
  await ctx.close();
}

const errs = errors.filter((e) => !/Failed to load resource|409|Conflict/.test(e));
record('E1', 'No page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
await browser.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
