// Logbook sync acknowledgements (1.0.9): every entry the app sends gets an answer, saved or refused with a reason,
// so the app never takes silence for success. Plus the store app's offline start and sync status rules, checked in
// the source because the browser checks (tools/e2e-offline.mjs) need a local Worker and Playwright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, ctx, ORIGIN } from './helpers/env.mjs';
import worker from '../worker/index.js';

const PASSWORD = 'Correct horse battery 1!';
function app(env) {
  let token = '';
  const call = async (path, data) => {
    const headers = { Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const init = { headers };
    if (data !== undefined) { init.method = 'POST'; headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(data); }
    const res = await worker.fetch(new Request(ORIGIN + path, init), env, ctx);
    if (res.headers.has('X-Wavelength-Token')) token = res.headers.get('X-Wavelength-Token');
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { call };
}
async function learner(env, email) {
  const c = app(env);
  const r = await c.call('/api/app/signup', { firstName: 'Sync', lastName: 'Test', email, password: PASSWORD, terms: true });
  assert.equal(r.body.ok, true);
  return c;
}
const entry = (id, extra = {}) => ({ id, type: 'efast', date: '2026-10-01', supervision: 'direct', ...extra });

test('sync answers every entry: saved, or rejected with a reason', async () => {
  const env = makeEnv();
  const c = await learner(env, 'ack@example.com');
  const r = await c.call('/api/app/sync', { entries: [
    entry('goodentry01'),
    entry('longentry01', { reflection: 'x'.repeat(21000) }),
    entry('nodateentry', { date: 'yesterday' }),
    entry('bad id!'),
  ] });
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.saved.map((s) => s.id), ['goodentry01']);
  const why = Object.fromEntries(r.body.rejected.map((x) => [x.id, x.reason]));
  assert.match(why.longentry01, /too long/);
  assert.match(why.nodateentry, /missing its application or date/);
  assert.match(why['bad id!'], /invalid identifier/);
});

test('an entry id owned by another account is refused, not silently skipped', async () => {
  const env = makeEnv();
  const a = await learner(env, 'owner@example.com');
  const b = await learner(env, 'other@example.com');
  assert.equal((await a.call('/api/app/sync', { entries: [entry('sharedid001')] })).body.saved.length, 1);
  const r = await b.call('/api/app/sync', { entries: [entry('sharedid001')] });
  assert.equal(r.body.saved.length, 0);
  assert.match(r.body.rejected[0].reason, /another account/);
});

test('more than 200 entries in one call: the rest are named so the app sends them next time', async () => {
  const env = makeEnv();
  const c = await learner(env, 'bulk@example.com');
  const list = Array.from({ length: 203 }, (_, i) => entry('bulkentry' + String(i).padStart(3, '0')));
  const r = await c.call('/api/app/sync', { entries: list });
  assert.equal(r.body.saved.length, 200);
  assert.equal(r.body.rejected.length, 3);
  assert.match(r.body.rejected[0].reason, /next time/);
});

test('sending the same entry twice (answer lost) keeps one copy', async () => {
  const env = makeEnv();
  const c = await learner(env, 'twice@example.com');
  const first = await c.call('/api/app/sync', { entries: [entry('twiceentry1', { updatedAt: 0 })] });
  assert.equal(first.body.saved.length, 1);
  // The app never got the answer, so it sends the same new entry again. The server reports a conflict; the app
  // rebases on the server copy and sends once more, which saves over the same row.
  const again = await c.call('/api/app/sync', { entries: [entry('twiceentry1', { updatedAt: 0 })] });
  assert.equal(again.body.saved[0].conflict, true);
  const rebased = await c.call('/api/app/sync', { entries: [entry('twiceentry1', { updatedAt: again.body.saved[0].server.updatedAt })] });
  assert.equal(rebased.body.saved[0].id, 'twiceentry1');
  const rows = (await env.DB.prepare("SELECT COUNT(*) AS n FROM logbook_entries WHERE id = 'twiceentry1'").first()).n;
  assert.equal(rows, 1);
});

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const NATIVE = readFileSync(new URL('../src/app/native.js', import.meta.url), 'utf8');

test('sync status uses the agreed wording', () => {
  for (const s of [
    "You're offline. Your entries are saved on this device and will sync when you're back online.",
    'Saved on this device. {n} entry awaiting sync.',
    'Saved on this device. {n} entries awaiting sync.',
    'Synchronising {n} entry…',
    'Synchronising {n} entries…',
    'All changes synced.',
    'Unable to sync. Your entries remain saved on this device.',
    'Sign in again to continue synchronising. Your local entries are safe.',
  ]) assert.ok(APP.replace(/\\'/g, "'").includes(s), 'missing status text: ' + s);
});

test('store app start never waits on the network without a limit', () => {
  assert.match(NATIVE, /function timed\(/, 'native.js has no time-limited fetch');
  assert.match(NATIVE, /READY_WAIT/, 'secure storage read has no limit');
  assert.match(APP, /BOOT_WAIT/, 'no start-screen watchdog');
  // The phone opens its own logbook before asking the server, and the lock comes before the logbook is drawn.
  assert.match(APP, /NAT\.on && c && c\.id && NAT\.signedIn\(\)\) \{ diag\('path', 'local'\); return open\(c\); \}/);
  assert.match(APP, /var open = function \(acc\) \{ lockFirst\(\); return signedIn\(acc\)/);
});

test('sync does not depend on navigator.onLine and never swallows a failure without a retry', () => {
  const body = APP.slice(APP.indexOf('  function sync(manual) {'), APP.indexOf('  // The Worker takes at most 200 entries'));
  assert.ok(body.length > 100);
  assert.doesNotMatch(body, /navigator\.onLine/, 'sync() still skips on navigator.onLine');
  assert.match(APP, /scheduleRetry\(\)/);
  assert.doesNotMatch(APP, /\.catch\(function \(\) \{ \/\* offline or server error: try again later \*\/ \}\)/);
});

test('Android manifest lets WebView see connectivity changes', () => {
  const m = readFileSync(new URL('../mobile/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(m, /android\.permission\.ACCESS_NETWORK_STATE/);
});

test('after an offline start, the first good sync loads the account details and supervisor links', () => {
  const ok = APP.slice(APP.indexOf("SY.fail = ''; SY.ran = true; SY.lastOk = Date.now();"), APP.indexOf("return setKv('lastSyncOk'"));
  assert.match(ok, /if \(!S\.me\) loadMe\(\)/);
  assert.match(ok, /if \(!S\.links\) loadLinks\(\)/);
  const sv = APP.slice(APP.indexOf('function viewSupervisors()'), APP.indexOf('function viewSupervisors()') + 4000);
  assert.match(sv, /!S\.links \? /, 'no "No supervisors linked yet" before the links have loaded');
});
