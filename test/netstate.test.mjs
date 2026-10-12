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

test('banners (1.0.11): short. Title, one line about waiting scans, Retry and Connection details', () => {
  const off = W.banner('offline', 2);
  assert.equal(off.tone, 'red'); assert.equal(off.title, 'You\'re offline'); assert.ok(off.details);
  assert.deepEqual(off.wait, ['{n} scan saved on this device, awaiting sync.', '{n} scans saved on this device, awaiting sync.']);
  const un = W.banner('unreachable', 1);
  assert.equal(un.tone, 'amber'); assert.equal(un.title, 'Can\'t connect to Wavelength');
  assert.ok(un.retry && un.details);
  assert.equal(un.hint, undefined, 'VPN and firewall advice stays in the details panel');
  assert.equal(un.body, undefined);
  for (const b of [off, un, W.banner('failed', 1)]) assert.doesNotMatch(JSON.stringify(b), /backed up|synced to Wavelength|safe in the cloud/i, 'never implies a local scan is backed up or synced');
});

test('banners (1.0.11): nothing waiting gives a quiet one-line note, not a large warning', () => {
  const un = W.banner('unreachable', 0);
  assert.ok(un.compact); assert.equal(un.retry, undefined); assert.ok(un.details);
  assert.equal(un.note, 'Nothing waiting to sync.');
  const off = W.banner('offline', 0);
  assert.ok(off.compact); assert.equal(off.tone, 'red');
});

test('details panel explanations keep the full guidance, never insisting the VPN is switched off', () => {
  const un = W.explain('unreachable', phone());
  assert.match(un.lead, /appears connected/);
  assert.ok(un.steps.some((x) => /VPN, firewall or network restriction may be affecting/.test(x)));
  const alone = W.explain('offline', phone({ vpn: true, transports: ['vpn'], underlying: false }));
  assert.match(alone.lead, /VPN shows as connected, but this device has no Wi-Fi, mobile data/);
  assert.ok(alone.steps.some((x) => /Your VPN can stay on/.test(x)));
  for (const k of ['offline', 'unreachable', 'failed']) assert.doesNotMatch(JSON.stringify(W.explain(k, phone())), /disable|turn off (your|the) VPN/i);
  assert.equal(W.explain('synced', phone()), null);
});

test('banners: pending and syncing wait to settle; "All changes synced." only briefly after a warning', () => {
  assert.equal(W.banner('pending', 2, { settled: false }), null);
  assert.equal(W.banner('pending', 2, { settled: true }).title, 'Scans awaiting sync');
  assert.equal(W.banner('syncing', 0, { settled: true }), null, 'a background pull is not announced');
  assert.equal(W.banner('syncing', 3, { settled: true }).title, 'Synchronising your scans…');
  assert.equal(W.banner('synced', 0, {}), null);
  assert.equal(W.banner('synced', 0, { justSynced: true }).title, 'All changes synced.');
});

test('back-off grows, is capped at 2 minutes, then 5 minutes after sustained failure, and has jitter', () => {
  const d = (t, r) => W.retryDelay(t, r);
  assert.equal(d(1, 0.5), 2000);
  assert.ok(d(2, 0.5) > d(1, 0.5) && d(4, 0.5) > d(2, 0.5));
  assert.equal(d(W.IDLE_AFTER - 1, 0.5), 120000, '2 minutes apart for the first 20 minutes or so');
  assert.equal(d(50, 0.5), 300000, '1.0.11: 5 minutes apart after sustained failure (battery), never stops');
  assert.equal(d(100000, 0.5), 300000, 'no retry limit: a saved scan is always retried');
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

// ---------- 1.0.11: a VPN interface with nothing under it ----------
test('VPN connected with no Wi-Fi, mobile data or Ethernet under it (Flight mode, NordVPN still up): Offline', () => {
  const vpnAlone = phone({ vpn: true, validated: false, transports: ['vpn'], underlying: false, underlyingTransports: [] });
  assert.equal(W.deviceOnline(vpnAlone), false);
  assert.equal(W.vpnOnly(vpnAlone), true);
  assert.equal(W.classify(netErr(), vpnAlone), 'offline');
  assert.equal(W.classify(timeoutErr(), vpnAlone), 'offline');
  assert.equal(W.state({ account: true, dev: vpnAlone, pending: 1, ran: true, fail: 'unreachable' }), 'offline', 'red Offline even after an earlier "unreachable"');
  assert.equal(W.state({ account: true, dev: { ...vpnAlone, validated: true }, pending: 1, ran: false, fail: '' }), 'offline', 'a VPN still marked validated is not proof of a network');
});

test('Flight mode with Wi-Fi switched back on, VPN on: a real network, so a failure is "Can\'t sync", not Offline', () => {
  const dev = phone({ vpn: true, transports: ['vpn', 'wifi'], underlying: true, underlyingTransports: ['wifi'] });
  assert.equal(W.deviceOnline(dev), true);
  assert.equal(W.classify(netErr(), dev), 'unreachable');
});

test('Flight mode with Wi-Fi off and no VPN: no default network, Offline', () => {
  const dev = phone({ connected: false, validated: false, transports: [], id: '', underlying: false, underlyingTransports: [] });
  assert.equal(W.classify(netErr(), dev), 'offline');
});

test('Wi-Fi or mobile data with the VPN on or off: online; server answers decide the rest', () => {
  for (const dev of [
    phone({ underlying: true, underlyingTransports: ['wifi'] }),
    phone({ vpn: true, transports: ['vpn', 'wifi'], underlying: true, underlyingTransports: ['wifi'] }),
    phone({ vpn: true, transports: ['cellular', 'vpn'], underlying: true, underlyingTransports: ['cellular'] }),
    phone({ transports: ['cellular'], underlying: true, underlyingTransports: ['cellular'] }),
  ]) {
    assert.equal(W.deviceOnline(dev), true, JSON.stringify(dev));
    assert.equal(W.classify(netErr(), dev), 'unreachable');
    assert.equal(W.state({ account: true, dev, pending: 0, ran: true, fail: '' }), 'synced');
  }
});

test('underlying unknown (older app build, or Android would not say): conservative, never invented Offline', () => {
  assert.equal(W.deviceOnline(phone({ vpn: true, transports: ['vpn'], validated: false })), true);
  assert.equal(W.deviceOnline(phone({ vpn: true, transports: ['vpn'], underlying: null })), true);
  assert.equal(W.classify(netErr(), phone({ vpn: true, transports: ['vpn'], underlying: null })), 'unreachable');
  // "No underlying network" without a VPN cannot happen on a phone; the default network's own state decides.
  assert.equal(W.deviceOnline(phone({ underlying: false })), true);
});

test('the network under the VPN coming back or going away is a change worth a retry', () => {
  const alone = phone({ vpn: true, transports: ['vpn'], underlying: false, underlyingTransports: [] });
  const back = phone({ vpn: true, transports: ['vpn'], underlying: true, underlyingTransports: ['wifi'] });
  assert.equal(W.netChanged(alone, back), true);
  assert.equal(W.netChanged(back, alone), true);
  assert.equal(W.netChanged(back, { ...back }), false, 'repeated identical callbacks: no retry');
  assert.equal(W.netChanged(back, phone({ vpn: true, transports: ['vpn'], underlying: true, underlyingTransports: ['cellular'] })), true, 'Wi-Fi to mobile data under the VPN');
  assert.equal(W.netChanged(phone({ underlying: null }), phone({})), false, 'unknown and absent are the same');
});

// ---------- 1.0.11: returning to the app does not start a burst of requests ----------
test('resume: a quick return soon after an attempt does not retry again or reset the back-off', () => {
  const r = W.resumePlan({ away: 4000, sinceTry: 3000, sinceOk: 1e9, failing: true, pending: 1, netChanged: false });
  assert.deepEqual(r, { sync: false, reset: false });
});
test('resume: a return after the last attempt has aged retries, keeping the back-off', () => {
  assert.deepEqual(W.resumePlan({ away: 15000, sinceTry: 20000, sinceOk: 1e9, failing: true, pending: 1, netChanged: false }), { sync: true, reset: false });
});
test('resume: a long time away, or a new network, retries at once from the start of the back-off', () => {
  assert.deepEqual(W.resumePlan({ away: 120000, sinceTry: 1000, sinceOk: 1e9, failing: true, pending: 1, netChanged: false }), { sync: true, reset: true });
  assert.deepEqual(W.resumePlan({ away: 2000, sinceTry: 1000, sinceOk: 1e9, failing: true, pending: 1, netChanged: true }), { sync: true, reset: true });
});
test('resume: all synced, pulls supervisor sign-offs at most every 30 seconds', () => {
  assert.equal(W.resumePlan({ away: 5000, sinceTry: 5000, sinceOk: 5000, failing: false, pending: 0, netChanged: false }).sync, false);
  assert.equal(W.resumePlan({ away: 5000, sinceTry: 40000, sinceOk: 40000, failing: false, pending: 0, netChanged: false }).sync, true);
});
