// Offline start and sync checks for the store app, without a phone. Runs the real bundle (mobile/www) over the
// stand-in native bridge (tools/native-harness.mjs) against a local Worker, and models the phone's network:
// calls that fail at once (aeroplane mode), calls that never answer (no signal), slow calls, and Android WebView
// without connectivity events (the app has no ACCESS_NETWORK_STATE permission, so navigator.onLine stays true).
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-offline.mjs [results.json] [http://localhost:8787]
// Each check states the behaviour the app must have. Exit code 1 when any check fails.
import fs from 'node:fs';
import { harness, net, NO_NETWORK_EVENTS, SITE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-offline.mjs');

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const reset = () => { net.offline = false; net.hang = false; net.delay = 0; net.blocked = false; net.challenge = false; };

// A dummy account made straight against the local Worker, as the app would (Bearer token, native origin).
async function account() {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'Offline', email: `offline${t}@example.com`, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  const j = await r.json();
  if (!token) throw new Error('signup gave no token: ' + JSON.stringify(j));
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  if (!p.ok) throw new Error('profile: ' + JSON.stringify(p));
  return { token, id: p.account.id, email: `offline${t}@example.com`, password: 'Long-password-1' };
}
async function serverEntries(learner) {
  const rows = await fetch(API + '/__dev/entries').then((r) => r.json());
  return rows.filter((r) => r.learner_id === learner && !r.deleted);
}
// A signed-in phone: token in secure storage, one online start so the account is cached for offline starts.
async function phone({ lock = false, noEvents = false, acc = null } = {}) {
  reset();
  acc = acc || await account();
  const { ctx, page } = await newApp(390, 844, { init: noEvents ? [NO_NETWORK_EVENTS] : [] });
  await page.goto('https://localhost/');
  await page.evaluate(([tok, lk]) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); if (lk) localStorage.setItem('__prefs', JSON.stringify({ 'wl-lock': '1' })); }, [acc.token, lock]);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForTimeout(800);
  return { ctx, page, acc };
}
// Close the app and open it again (same phone storage).
async function coldStart(ctx, old) {
  if (old) await old.close();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  const t0 = Date.now();
  await page.goto('https://localhost/');
  return { page, t0 };
}
// Milliseconds from start until fn() is true in the page, or null when it is still false at the limit.
async function timeTo(page, t0, fn, limit) {
  try { await page.waitForFunction(fn, null, { timeout: limit, polling: 50 }); return Date.now() - t0; } catch { return null; }
}
const LOGBOOK = () => !!document.querySelector('nav.tabs');
const PROMPT = () => (window.__calls || []).some((c) => c.plugin === 'NativeBiometric' && c.method === 'verifyIdentity');
async function saveScan(page) {
  await page.evaluate(() => { location.hash = '#/new'; });
  await page.waitForSelector('label[for=t0]');
  await page.click('label[for=t0]');
  await page.waitForSelector('#rest:not([hidden])');
  await page.locator('input[name=supervision]').first().check({ force: true });
  await page.click('form button[type=submit]');
  // 1.0.10: a new scan goes back Home once saved on the device.
  await page.waitForFunction(() => location.hash === '#/' || document.querySelector('.err:not([hidden]), .field.invalid'), null, { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((s) => s.remove()));
}
// Unsynced entries in the phone's logbook database (read from Node, one short look at a time).
function localDirty(page, id) {
  return page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const t = r.result.transaction('entries').objectStore('entries').getAll(); t.onsuccess = () => { r.result.close(); ok(t.result.filter((e) => e._dirty).length); }; }; r.onerror = () => ok(-1); }), id);
}
async function waitServer(learner, n, limit) {
  const end = Date.now() + limit;
  while (Date.now() < end) { if ((await serverEntries(learner)).length >= n) return true; await new Promise((r) => setTimeout(r, 500)); }
  return false;
}

// ---------- Startup ----------
{
  // S1: no answer from the server at all (no signal). The logbook must open from the device within 3 s.
  const { ctx, page } = await phone();
  net.hang = true;
  const { page: p2, t0 } = await coldStart(ctx, page);
  const t = await timeTo(p2, t0, LOGBOOK, 15000);
  const stuck = await p2.evaluate(() => !!document.querySelector('.auth-head') && !document.querySelector('nav.tabs'));
  record('S1', 'Cold start, server never answers: logbook opens within 3 s', t !== null && t <= 3000, t === null ? `still on the start screen after 15 s (start screen showing: ${stuck})` : `logbook after ${t} ms`);
  await ctx.close();
}
{
  // S2: slow network (6 s per answer), app lock on. The fingerprint prompt must not wait for the network.
  const { ctx, page } = await phone({ lock: true });
  net.delay = 6000;
  const { page: p2, t0 } = await coldStart(ctx, page);
  const t = await timeTo(p2, t0, PROMPT, 15000);
  record('S2', 'Cold start, slow network, app lock on: fingerprint prompt within 2 s', t !== null && t <= 2000, t === null ? 'no prompt within 15 s' : `prompt after ${t} ms`);
  await ctx.close();
}
{
  // S3: aeroplane mode where calls fail at once. Control case: shows how a fast failure behaves.
  const { ctx, page } = await phone({ lock: true });
  net.offline = true;
  const { page: p2, t0 } = await coldStart(ctx, page);
  const t = await timeTo(p2, t0, PROMPT, 15000);
  const tl = await timeTo(p2, t0, LOGBOOK, 15000);
  record('S3', 'Cold start, calls fail at once, app lock on: prompt and logbook within 2 s', t !== null && t <= 2000 && tl !== null && tl <= 2000, `prompt ${t === null ? 'never' : t + ' ms'}, logbook ${tl === null ? 'never' : tl + ' ms'}`);
  await ctx.close();
}
{
  // S4: server never answers, app lock on: the prompt must still come, and quickly.
  const { ctx, page } = await phone({ lock: true });
  net.hang = true;
  const { page: p2, t0 } = await coldStart(ctx, page);
  const t = await timeTo(p2, t0, PROMPT, 15000);
  record('S4', 'Cold start, server never answers, app lock on: fingerprint prompt within 2 s', t !== null && t <= 2000, t === null ? 'no prompt within 15 s' : `prompt after ${t} ms`);
  await ctx.close();
}

// ---------- Sync ----------
{
  // Y1: WebView without connectivity events. Save offline, reconnect, do nothing: the scan must reach the server.
  const { ctx, page, acc } = await phone({ noEvents: true });
  net.offline = true;
  await saveScan(page);
  await page.waitForTimeout(1500);
  const dot = await page.evaluate(() => { const d = document.querySelector('button.sync-pill'); return d ? d.getAttribute('aria-label') : '(no indicator)'; });
  const line = await page.evaluate(() => { const l = document.querySelector('[data-syncbanner]'); return l && !l.hidden ? l.textContent : ''; });
  net.offline = false;
  const ok = await waitServer(acc.id, 1, 25000);
  record('Y1', 'Saved offline, reconnected with no connectivity event: scan reaches the server within 25 s', ok, ok ? 'synced' : 'not on the server after 25 s');
  record('Y2', 'While a sync is failing, the indicator says the entries are saved here, not "Synced"', /offline|awaiting|unable|can't connect/i.test(dot), `indicator said: "${dot}"; logbook line: "${line}"`);
  await ctx.close();
}
{
  // Y3: the app comes back to the front while the network is still reconnecting (leaving aeroplane mode).
  const { ctx, page, acc } = await phone({ noEvents: true });
  net.offline = true;
  await saveScan(page);
  await page.evaluate(() => { window.__fire('App', 'appStateChange', { isActive: false }); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__fire('App', 'appStateChange', { isActive: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1000);
  net.offline = false; // the radio comes up a second after the app returned
  const ok = await waitServer(acc.id, 1, 25000);
  record('Y3', 'Resumed while still offline, network back a second later: scan reaches the server within 25 s', ok, ok ? 'synced' : 'not on the server after 25 s');
  await ctx.close();
}
{
  // Y4 (control): the browser does report reconnecting (Chrome, or WebView with the permission).
  const { ctx, page, acc } = await phone();
  net.offline = true; await ctx.setOffline(true);
  await saveScan(page);
  await page.waitForTimeout(1000);
  net.offline = false; await ctx.setOffline(false);
  const ok = await waitServer(acc.id, 1, 10000);
  record('Y4', 'Control: saved offline, reconnect event fires: scan reaches the server', ok, ok ? 'synced' : 'not on the server after 10 s');
  await ctx.close();
}
{
  // Y5: the server leaves an entry out of its answer (it failed validation). The app must not report success
  // and the Worker must say which entry it refused and why.
  const acc = await account();
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app', Authorization: 'Bearer ' + acc.token };
  const big = { id: 'testentry' + Date.now(), type: 'efast', date: '2026-10-01', reflection: 'x'.repeat(21000), updatedAt: 0 };
  const r = await fetch(API + '/api/app/sync', { method: 'POST', headers: h, body: JSON.stringify({ entries: [big] }) }).then((x) => x.json());
  const acked = (r.saved || []).some((s) => s.id === big.id);
  const refused = (r.rejected || []).some((s) => s.id === big.id && s.reason);
  record('Y5', 'Server refuses an entry: the answer names it with a reason (not a silent ok)', refused, `ok=${r.ok}, saved=${acked}, rejected=${JSON.stringify(r.rejected || null)}`);
}

{
  // Y6: the login ends on the server (logged out from another device) while a scan waits on the phone. The app
  // asks to sign in again, says the local entries are safe, keeps the scan, and sends it after signing in.
  const { ctx, page, acc } = await phone({ noEvents: true });
  net.offline = true;
  await saveScan(page);
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app', Authorization: 'Bearer ' + acc.token };
  await new Promise((r) => setTimeout(r, 1100)); // sessions_after has millisecond precision; keep clear of the token's issue time
  const lo = await fetch(API + '/api/app/logout-all', { method: 'POST', headers: h, body: '{}' }).then((x) => x.json());
  net.offline = false;
  const asked = await page.waitForFunction(() => /#\/login/.test(location.hash) && /Sign in again to continue synchronising/.test(document.body.textContent), null, { timeout: 25000 }).then(() => true, () => false);
  const note = await page.evaluate(() => (document.querySelector('.warn') || {}).textContent || '');
  const kept = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const t = r.result.transaction('entries').objectStore('entries').getAll(); t.onsuccess = () => ok(t.result.filter((e) => e._dirty).length); }; r.onerror = () => ok(-1); }), acc.id);
  record('Y6a', 'Login ended on the server: app asks to sign in again and says local entries are safe', lo.ok && asked, `logout-all ok=${lo.ok}; note: "${note.trim()}"`);
  record('Y6b', 'Login ended on the server: the unsynced scan is still on the device', kept === 1, `unsynced entries in the local database: ${kept}`);
  if (asked) {
    await page.fill('#em', acc.email); await page.fill('#pw', acc.password);
    await page.click('#f button[type=submit]');
  }
  const ok = await waitServer(acc.id, 1, 20000);
  record('Y6c', 'After signing in again with the same account, the waiting scan reaches the server', ok, ok ? 'synced' : 'not on the server after 20 s');
  await ctx.close();
}
{
  // Y7: the server saves a scan but its answer is lost on the way back. The retry must not make a duplicate.
  const { ctx, page, acc } = await phone();
  let dropped = 0;
  await ctx.route(SITE + '/api/app/sync', async (route) => {
    if (route.request().method() === 'POST' && !dropped) { dropped++; try { await route.fetch({ url: route.request().url().replace(SITE, API) }); } catch {} return route.abort('connectionreset'); }
    return route.fallback();
  });
  await saveScan(page);
  for (let end = Date.now() + 25000; Date.now() < end && (await localDirty(page, acc.id)) !== 0;) await page.waitForTimeout(500);
  const rows = await serverEntries(acc.id);
  const dirty = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const t = r.result.transaction('entries').objectStore('entries').getAll(); t.onsuccess = () => ok(t.result.filter((e) => e._dirty).length); }; }), acc.id);
  record('Y7', 'Answer lost after the server saved: retry leaves exactly one copy and the scan marked synced', dropped === 1 && rows.length === 1 && dirty === 0, `answers dropped ${dropped}, copies on server ${rows.length}, unsynced on device ${dirty}`);
  await ctx.close();
}
{
  // Y8: the server leaves a scan out of its answer (as the live Worker does for an entry it refuses). The scan stays
  // unsynced, the status says sync failed, Settings lists it, and Retry sync sends it again.
  const { ctx, page, acc } = await phone();
  let silent = true;
  await ctx.route(SITE + '/api/app/sync', async (route) => {
    if (route.request().method() === 'POST' && silent) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, now: Date.now(), saved: [] }) });
    return route.fallback();
  });
  await saveScan(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { location.hash = '#/settings?sync=1'; });
  await page.waitForSelector('#syncpanel [data-resync]');
  const panel = await page.evaluate(() => document.querySelector('#syncpanel').textContent);
  const st = await page.evaluate(() => (document.querySelector('button.sync-pill') || {}).getAttribute && document.querySelector('button.sync-pill').getAttribute('aria-label'));
  record('Y8a', 'Scan left out of the server answer: status says unable to sync, Settings lists it', /Unable to sync/.test(st || '') && /Not accepted by the server/.test(panel) && /Entries awaiting sync\s*1/.test(panel), `status "${st}"; panel: "${panel.replace(/\s+/g, ' ').slice(0, 220)}"`);
  silent = false;
  await page.click('#syncpanel [data-resync]');
  const ok = await waitServer(acc.id, 1, 15000);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => document.querySelector('#syncpanel').textContent);
  record('Y8b', 'Retry sync sends it; the panel then says all changes synced', ok && /All changes synced\./.test(after) && /Entries awaiting sync\s*0/.test(after), `server ${ok ? 'has it' : 'does not have it'}; panel: "${after.replace(/\s+/g, ' ').slice(0, 160)}"`);
  await ctx.close();
}
{
  // Y9: 130 waiting entries (a restored backup, a long time offline) go up in several smaller calls, all acknowledged.
  const { ctx, page, acc } = await phone();
  const sizes = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/app/sync') && r.method() === 'POST') sizes.push(JSON.parse(r.postData()).entries.length); });
  net.offline = true;
  await page.evaluate((id) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const tx = r.result.transaction('entries', 'readwrite'); const st = tx.objectStore('entries'); for (let i = 0; i < 130; i++) st.put({ id: 'bulk' + String(i).padStart(4, '0') + 'x' + String(id), type: 'efast', date: '2026-09-01', supervision: 'direct', reflection: 'x'.repeat(3000), createdAt: Date.now(), updatedAt: 0, _dirty: true, _new: true }); tx.oncomplete = () => ok(); };
  }), acc.id);
  const { page: p2 } = await coldStart(ctx, page);
  p2.on('request', (r) => { if (r.url().endsWith('/api/app/sync') && r.method() === 'POST') sizes.push(JSON.parse(r.postData()).entries.length); });
  await p2.waitForSelector('nav.tabs');
  net.offline = false;
  const ok = await waitServer(acc.id, 130, 25000);
  record('Y9', '130 waiting entries sync in batches of at most 50, all on the server', ok && sizes.length >= 3 && Math.max(...sizes) <= 50, `server has ${(await serverEntries(acc.id)).length}; batch sizes ${JSON.stringify(sizes)}`);
  await ctx.close();
}

await browser.close();
if (errors.length) console.log('page errors:', errors.slice(0, 10));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), api: API, site: SITE, results, errors }, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
