// Connection and sync status rules (src/app/netstate.js, 1.0.10). The app tells "no network on this device" from
// "network, but the Wavelength server cannot be reached" (a VPN, firewall or filter), never trusts navigator.onLine
// alone, retries with a capped back-off and jitter, and retries at once when the phone's network changes (a VPN
// reconnecting, Wi-Fi back while aeroplane mode stays on, mobile data restored).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/app/netstate.js', import.meta.url), 'utf8');
const win = {};
new Function('window', SRC.replace(/\}\)\(typeof window[^;]*;\s*$/, '})(window);'))(win);
const W = win.WLNet;

const phone = (o) => Object.assign({ known: true, connected: true, validated: true, vpn: false, transports: ['wifi'], id: '1' }, o);
const netErr = () => Object.assign(new TypeError('Failed to fetch'), { network: true });
const timeoutErr = () => Object.assign(new Error('No answer from the server'), { network: true, timeout: true });

test('a failed request with no network on the phone is offline', () => {
  assert.equal(W.classify(netErr(), phone({ connected: false, validated: false, transports: [] })), 'offline');
  assert.equal(W.classify(netErr(), { known: false, online: false }), 'offline');
});

test('VPN on and connected, but the request fails: server unreachable, not offline', () => {
  assert.equal(W.classify(netErr(), phone({ vpn: true, transports: ['vpn', 'wifi'] })), 'unreachable');
  // Android has not validated the VPN network (tunnel up, traffic not flowing): still not "offline".
  assert.equal(W.classify(netErr(), phone({ vpn: true, validated: false })), 'unreachable');
});

test('navigator.onLine true with no phone signal and a failed request: unreachable, never assumed offline', () => {
  assert.equal(W.classify(netErr(), { known: false, online: true }), 'unreachable');
});

test('a timeout is reported as a timeout, not as offline, while the phone has a network', () => {
  assert.equal(W.classify(timeoutErr(), phone()), 'timeout');
  assert.equal(W.classify(timeoutErr(), phone({ connected: false })), 'offline');
  assert.equal(W.state({ account: true, fail: 'timeout', dev: phone() }), 'unreachable');
});

test('a block page, proxy or gateway answer is unreachable; an API refusal is a failure; 401 asks to sign in', () => {
  assert.equal(W.classify(Object.assign(new Error('x'), { status: 403, nojson: true }), phone()), 'unreachable');
  assert.equal(W.classify(Object.assign(new Error('x'), { status: 502, nojson: true }), phone()), 'unreachable');
  assert.equal(W.classify(Object.assign(new Error('x'), { status: 503 }), phone()), 'unreachable');
  assert.equal(W.classify(Object.assign(new Error('Too large'), { status: 400 }), phone()), 'failed');
  assert.equal(W.classify(Object.assign(new Error('x'), { status: 401, auth: true }), phone()), 'auth', 'the API says the login ended');
  assert.equal(W.classify(Object.assign(new Error('x'), { status: 401, nojson: true }), phone()), 'unreachable', 'a proxy or filter 401 is not about the login');
  assert.equal(W.classify(Object.assign(new Error('x'), { status: 401 }), phone()), 'unreachable');
  assert.equal(W.classify(new TypeError('x is not a function'), phone()), 'failed', 'a coding error is not shown as a network problem');
  assert.equal(W.classify(Object.assign(new Error('signed out'), { stale: true }), phone()), '');
});

test('status: each state from the inputs, in priority order', () => {
  const base = { account: true, dev: phone(), pending: 0, refused: 0, ran: true, fail: '' };
  assert.equal(W.state({ ...base, account: false }), '');
  assert.equal(W.state({ ...base, ran: false }), '');
  assert.equal(W.state(base), 'synced');
  assert.equal(W.state({ ...base, pending: 2 }), 'pending');
  assert.equal(W.state({ ...base, pending: 2, syncing: true }), 'syncing');
  assert.equal(W.state({ ...base, pending: 2, syncing: true, auto: true, fail: 'unreachable' }), 'unreachable', 'quiet automatic retry: no flicker');
  assert.equal(W.state({ ...base, pending: 2, syncing: true, auto: false, fail: 'unreachable' }), 'syncing', 'Retry sync shows Syncing');
  assert.equal(W.state({ ...base, pending: 2, dev: phone({ connected: false }) }), 'offline');
  assert.equal(W.state({ ...base, pending: 2, syncing: true, dev: phone({ connected: false }) }), 'offline', 'no flicker during a quick retry');
  assert.equal(W.state({ ...base, pending: 2, fail: 'unreachable' }), 'unreachable');
  assert.equal(W.state({ ...base, refused: 1, pending: 1 }), 'failed');
  assert.equal(W.state({ ...base, fail: 'failed' }), 'failed');
  assert.equal(W.state({ ...base, fail: 'auth' }), 'auth');
  assert.equal(W.state({ ...base, update: true, syncing: true }), 'update');
  // A phone that reports no network shows Offline even before any request has failed.
  assert.equal(W.state({ ...base, ran: false, dev: phone({ connected: false }) }), 'offline');
});

test('pill: colour, icon and label say the same thing, and the waiting label carries the count', () => {
  assert.deepEqual(W.pill('synced'), { cls: 'ok', icon: 'check', label: 'Synced' });
  assert.deepEqual(W.pill('pending'), { cls: 'warn', icon: 'clock', label: '{n} waiting' });
  assert.deepEqual(W.pill('syncing'), { cls: 'busy', icon: 'sync', label: 'Syncing' });
  assert.deepEqual(W.pill('offline'), { cls: 'bad', icon: 'offline', label: 'Offline' });
  assert.deepEqual(W.pill('unreachable'), { cls: 'warn', icon: 'alert', label: 'Can\'t sync' });
  assert.deepEqual(W.pill('failed'), { cls: 'bad', icon: 'alert', label: 'Sync failed' });
  assert.deepEqual(W.pill('auth'), { cls: 'bad', icon: 'lock', label: 'Sign in' });
});

test('banners: red offline, amber server unreachable with VPN guidance, retry and details', () => {
  const off = W.banner('offline', 2);
  assert.equal(off.tone, 'red'); assert.equal(off.title, 'You\'re offline'); assert.equal(off.pending, 2);
  assert.match(off.body, /saved on this device but haven't yet synced/);
  const un = W.banner('unreachable', 1);
  assert.equal(un.tone, 'amber'); assert.equal(un.title, 'Can\'t connect to Wavelength');
  assert.match(un.body, /appears connected/);
  assert.match(un.hint, /VPN, firewall or network restriction may be affecting/);
  assert.doesNotMatch(un.hint + un.body, /disable|turn off your VPN/i, 'never insists the VPN is switched off');
  assert.ok(un.retry && un.details);
});

test('banners: pending and syncing wait to settle; "All changes synced." only briefly after a warning', () => {
  assert.equal(W.banner('pending', 2, { settled: false }), null);
  assert.equal(W.banner('pending', 2, { settled: true }).title, 'Scans awaiting sync');
  assert.equal(W.banner('syncing', 0, { settled: true }), null, 'a background pull is not announced');
  assert.equal(W.banner('syncing', 3, { settled: true }).title, 'Synchronising your scans…');
  assert.equal(W.banner('synced', 0, {}), null);
  assert.equal(W.banner('synced', 0, { justSynced: true }).title, 'All changes synced.');
});

test('back-off grows, is capped at 2 minutes and has jitter', () => {
  const d = (t, r) => W.retryDelay(t, r);
  assert.equal(d(1, 0.5), 2000);
  assert.ok(d(2, 0.5) > d(1, 0.5) && d(4, 0.5) > d(2, 0.5));
  assert.equal(d(50, 0.5), 120000, 'never more than 2 minutes while the phone has a network');
  assert.equal(d(1, 0), 1600); assert.equal(d(1, 0.9999), 2400);
  assert.equal(W.retryDelay(50, 0.5, 'failed'), 300000, 'a refusal waits up to 5 minutes');
});

test('network changes worth a retry: VPN up or down, Wi-Fi back in aeroplane mode, mobile data, validation', () => {
  const wifi = phone(), none = phone({ connected: false, validated: false, transports: [], id: '' });
  assert.equal(W.netChanged(none, wifi), true, 'Wi-Fi restored while aeroplane mode stays on');
  assert.equal(W.netChanged(none, phone({ transports: ['cellular'], id: '2' })), true, 'mobile data restored');
  assert.equal(W.netChanged(wifi, phone({ vpn: true, transports: ['vpn', 'wifi'], id: '3' })), true, 'VPN connected');
  assert.equal(W.netChanged(phone({ vpn: true, validated: false }), phone({ vpn: true })), true, 'VPN tunnel now passes traffic');
  assert.equal(W.netChanged(phone({ vpn: true, id: '3' }), phone({ vpn: true, id: '4' })), true, 'VPN reconnected on a new network');
  assert.equal(W.netChanged(wifi, phone()), false, 'same network: no retry storm');
  assert.equal(W.netChanged(null, wifi), true);
});

test('error words carry no server text or entry content', () => {
  for (const k of ['offline', 'unreachable', 'timeout', 'failed', 'auth', 'update']) assert.ok(W.errorText(k).length > 10, k);
  assert.equal(W.errorText('anything else'), '');
});
