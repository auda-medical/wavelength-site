// The phone's network in the store app (1.0.10): src/app/native.js reads the WLNetwork plugin (Android
// ConnectivityManager, mobile/android/.../NetworkPlugin.java) and passes each change to the logbook as wl:net. The
// plugin is read-only and the website and iPhone fall back to navigator.onLine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/app/native.js', import.meta.url), 'utf8');
function load({ platform = 'android', net } = {}) {
  const events = [];
  const win = { addEventListener() {}, dispatchEvent(e) { events.push(e); return true; } };
  if (platform) {
    win.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, registerPlugin: (n) => n === 'WLNetwork' ? net : n === 'Preferences' ? { get: () => Promise.resolve({ value: '' }), set: () => Promise.resolve(), remove: () => Promise.resolve() } : null };
    win.WL_NATIVE = { site: 'https://thewavelength.co.uk', version: '1.0.10' };
  }
  const doc = { addEventListener() {}, documentElement: { classList: { add() {} } } };
  new Function('window', 'document', 'navigator', 'location', 'fetch', 'Headers', 'CustomEvent', 'setTimeout', 'clearTimeout', 'AbortController', SRC)(
    win, doc, { userAgent: 'Android 14' }, { origin: 'https://localhost' }, () => Promise.reject(new Error('no')), Headers, function (t, o) { this.type = t; this.detail = o && o.detail; }, () => 0, () => {}, AbortController);
  return { N: win.WLNative, events };
}
function fakePlugin(status) {
  const p = { listeners: {}, status,
    getStatus: () => Promise.resolve(p.status),
    addListener: (name, fn) => { p.listeners[name] = fn; return Promise.resolve({ remove() {} }); } };
  return p;
}

test('Android: netStatus reports connected, validated, VPN and transports', async () => {
  const plug = fakePlugin({ connected: true, validated: false, vpn: true, transports: ['wifi', 'vpn'], id: '42' });
  const { N } = load({ net: plug });
  assert.deepEqual(await N.netStatus(), { known: true, connected: true, validated: false, vpn: true, vpnKnown: true, transports: ['vpn', 'wifi'], id: '42', underlying: null, underlyingTransports: [] });
});

test('Android (1.0.11): the network under a VPN is passed on, and only a definite answer counts', async () => {
  const alone = fakePlugin({ connected: true, validated: false, vpn: true, transports: ['vpn'], id: '9', underlying: false, underlyingTransports: [] });
  assert.deepEqual(await load({ net: alone }).N.netStatus(), { known: true, connected: true, validated: false, vpn: true, vpnKnown: true, transports: ['vpn'], id: '9', underlying: false, underlyingTransports: [] });
  const wifi = fakePlugin({ connected: true, validated: true, vpn: true, transports: ['wifi', 'vpn'], id: '9', underlying: true, underlyingTransports: ['wifi'] });
  assert.equal((await load({ net: wifi }).N.netStatus()).underlying, true);
  const odd = fakePlugin({ connected: true, vpn: true, transports: ['vpn'], id: '9', underlying: 'no', underlyingTransports: ['x'] });
  const v = await load({ net: odd }).N.netStatus();
  assert.equal(v.underlying, null, 'anything but true or false is unknown');
  assert.deepEqual(v.underlyingTransports, []);
});

test('Android: a network change (VPN reconnect, Wi-Fi back) reaches the logbook as wl:net', () => {
  const plug = fakePlugin({ connected: false });
  const { events } = load({ net: plug });
  plug.listeners.networkStatusChange({ connected: true, validated: true, vpn: true, transports: ['vpn', 'cellular'], id: '7' });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'wl:net');
  assert.equal(events[0].detail.connected, true);
  assert.equal(events[0].detail.vpn, true);
  // Malformed answers are ignored, never treated as "offline".
  plug.listeners.networkStatusChange({});
  assert.equal(events.length, 1);
});

test('no plugin (website, older build) or a failing plugin: netStatus is null, app uses navigator.onLine', async () => {
  // 1.0.12: iPhone has its own plugin (test/ios-1012.test.mjs). An iPhone build without it answers UNIMPLEMENTED.
  const ios = await load({ platform: 'ios', net: fakePlugin({ connected: true, vpn: null }) }).N.netStatus();
  assert.deepEqual([ios.known, ios.vpnKnown], [true, false]);
  assert.equal(await load({ platform: 'ios', net: { getStatus: () => Promise.reject(new Error('UNIMPLEMENTED')), addListener: () => Promise.reject(new Error('UNIMPLEMENTED')) } }).N.netStatus(), null);
  assert.equal(await load({ platform: null }).N.netStatus(), null);
  const broken = { getStatus: () => Promise.reject(new Error('UNIMPLEMENTED')), addListener: () => Promise.reject(new Error('UNIMPLEMENTED')) };
  assert.equal(await load({ net: broken }).N.netStatus(), null);
});

test('the Android plugin is registered, read-only and needs only ACCESS_NETWORK_STATE', () => {
  const dir = new URL('../mobile/android/app/src/main/java/uk/co/thewavelength/app/', import.meta.url);
  const main = readFileSync(new URL('MainActivity.java', dir), 'utf8');
  const plug = readFileSync(new URL('NetworkPlugin.java', dir), 'utf8');
  // Registered before the bridge starts (1.0.14 also registers WLCapture there).
  assert.match(main, /registerPlugin\(NetworkPlugin\.class\);(\s*registerPlugin\(\w+\.class\);)*\s*super\.onCreate/);
  assert.match(plug, /@CapacitorPlugin\(name = "WLNetwork"\)/);
  assert.match(plug, /registerDefaultNetworkCallback/);
  assert.match(plug, /NET_CAPABILITY_VALIDATED/);
  assert.match(plug, /TRANSPORT_VPN/);
  // 1.0.11: a passive listener for networks that are not VPNs, so a VPN with nothing under it is not "connected".
  assert.match(plug, /registerNetworkCallback\(req, underCallback\)/);
  assert.match(plug, /NET_CAPABILITY_NOT_VPN/);
  assert.match(plug, /"underlying"/);
  assert.doesNotMatch(plug, /AIRPLANE|airplane|isAirplaneMode/, 'Flight mode is never read: Wi-Fi can be on in Flight mode');
  // Nothing that changes routing, binds the process to a network or touches VPN settings.
  assert.doesNotMatch(plug, /bindProcessToNetwork|setProcessDefaultNetwork|requestNetwork|VpnService|startActivity|Settings\./);
  const m = readFileSync(new URL('../mobile/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(m, /ACCESS_NETWORK_STATE/);
  assert.doesNotMatch(m, /CHANGE_NETWORK_STATE|BIND_VPN_SERVICE|usesCleartextTraffic="true"/);
});
