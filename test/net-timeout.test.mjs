// Time limits on calls to the Wavelength server (src/app/native.js timed): a call with no answer fails as offline,
// an upload gets time for its size, a response body that stalls is aborted instead of holding sync for ever, and a
// slow secure-storage read at start never replaces a login made in the meantime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/app/native.js', import.meta.url), 'utf8');
// Loads native.js with a recorded setTimeout (nothing fires unless the test runs it) and a controllable fetch.
function load({ native = false, secure } = {}) {
  const timers = [], fetches = [];
  const fakeTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const fetch = (url, o) => new Promise((ok, no) => { fetches.push({ url, o, ok, no }); o.signal && o.signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const events = [];
  const win = { addEventListener() {}, dispatchEvent(e) { events.push(e.type); return true; } };
  if (native) {
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: (n) => n === 'NativeBiometric' ? secure : n === 'Preferences' ? { get: () => Promise.resolve({ value: '1' }), set: () => Promise.resolve(), remove: () => Promise.resolve() } : null };
    win.WL_NATIVE = { site: 'https://thewavelength.co.uk', version: '1.0.9' };
  }
  const doc = { addEventListener() {}, documentElement: { classList: { add() {} } } };
  new Function('window', 'document', 'navigator', 'location', 'fetch', 'Headers', 'CustomEvent', 'setTimeout', 'clearTimeout', 'AbortController', SRC)(
    win, doc, { userAgent: 'Android 14' }, { origin: 'https://thewavelength.co.uk' }, fetch, Headers, function (t) { this.type = t; }, fakeTimeout, () => {}, AbortController);
  return { N: win.WLNative, timers, fetches, events };
}

test('a call with no answer fails as offline after 20 seconds', async () => {
  const { N, timers } = load();
  const p = N.net('/api/app/me', {});
  assert.equal(timers[0].ms, 20000);
  timers[0].fn();
  await assert.rejects(p, (e) => e.timeout && e.network);
});

test('an upload gets extra time for its size (16 KB/s), so a slow ward connection can finish a clip', () => {
  const { N, timers } = load();
  N.net('/api/app/signoff/image', { method: 'POST', body: new Uint8Array(12 * 1048576) });
  assert.equal(timers[0].ms, 20000 + 768000);
  N.net('/api/app/sync', { method: 'POST', body: 'x'.repeat(400000), timeout: 30000 });
  assert.ok(timers[1].ms > 30000 + 24000 && timers[1].ms < 30000 + 25000);
});

test('a response body that stalls after the headers is aborted, so reading it fails instead of hanging', async () => {
  const { N, timers, fetches } = load();
  const p = N.net('/api/app/sync?since=0', {});
  const signal = fetches[0].o.signal;
  fetches[0].ok({ headers: { get: () => null } });
  await p;
  const body = timers.find((t) => t.ms === 60000);
  assert.ok(body, 'a body limit is set once the headers arrive');
  assert.equal(signal.aborted, false);
  body.fn();
  assert.equal(signal.aborted, true);
});

test('a slow secure-storage read never replaces a login made while it was pending', async () => {
  let answer;
  const secure = { getData: () => new Promise((ok) => { answer = ok; }), setData: () => Promise.resolve(), deleteData: () => Promise.resolve() };
  const { N, timers, events } = load({ native: true, secure });
  timers.find((t) => t.ms === 4000).fn(); // READY_WAIT passes
  await N.ready;
  assert.equal(N.readFailed(), true);
  const req = N.net('/api/app/login', {}); // the learner logs in; the server sends a new token
  await new Promise((r) => setImmediate(r));
  N.clearToken(); // stands in for setToken from a login answer
  answer({ value: 'old-token-from-storage' });
  await new Promise((r) => setImmediate(r));
  assert.equal(N.signedIn(), false, 'the stale stored token was not put back');
  assert.ok(events.includes('wl:lock'), 'a lock setting read late asks the app to lock now');
  req.catch(() => {});
});
