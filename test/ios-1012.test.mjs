// 1.0.12 iPhone: the app's own network plugin (NWPathMonitor), registered by the app's bridge view controller, and an
// honest "cannot tell" for VPN status, which iOS does not report to apps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the iOS project builds the network plugin and the bridge controller that registers it', () => {
  const pbx = read('mobile/ios/App/App.xcodeproj/project.pbxproj');
  for (const f of ['WLNetworkPlugin.swift', 'WLBridgeViewController.swift']) {
    assert.match(pbx, new RegExp(`\\/\\* ${f} in Sources \\*\\/ = \\{isa = PBXBuildFile`), f + ' build file');
    assert.match(pbx, new RegExp(`\\/\\* ${f} \\*\\/ = \\{isa = PBXFileReference; lastKnownFileType = sourcecode\\.swift; path = ${f};`), f + ' file reference');
    assert.equal((pbx.match(new RegExp(`${f.replace('.', '\\.')} in Sources \\*\\/,`, 'g')) || []).length, 1, f + ' in the Sources phase once');
  }
  assert.match(read('mobile/ios/App/App/SceneDelegate.swift'), /rootViewController = WLBridgeViewController\(\)/);
  assert.match(read('mobile/ios/App/App/WLBridgeViewController.swift'), /registerPluginInstance\(WLNetworkPlugin\(\)\)/);
});

test('the iOS plugin only listens, uses the same name and events as Android, and never guesses a VPN', () => {
  const sw = read('mobile/ios/App/App/WLNetworkPlugin.swift');
  assert.match(sw, /jsName = "WLNetwork"/);
  assert.match(sw, /notifyListeners\("networkStatusChange"/);
  assert.match(sw, /NWPathMonitor\(\)/);
  assert.match(sw, /"vpn": NSNull\(\)/);
  assert.match(sw, /"underlying": NSNull\(\)/);
  assert.doesNotMatch(sw, /utun|ipsec|NEVPNManager|requiredInterfaceType|prohibitedInterfaceTypes/, 'no guessing from interface names, no network selection');
});

test('the capacitor config names no Xcode scheme that does not exist', () => {
  const c = JSON.parse(read('mobile/capacitor.config.json'));
  assert.ok(!c.ios.scheme || c.ios.scheme === 'App');
  assert.match(read('.github/workflows/ios.yml'), /-scheme App/);
});

// native.js on a stand-in iPhone: the plugin is used, and vpn null becomes "not known" (vpnKnown false), not "off".
function nativeOn(platform, status) {
  const listeners = {};
  const w = { location: { origin: 'capacitor://localhost' }, navigator: { userAgent: 'iPhone' }, addEventListener() {}, dispatchEvent(e) { (listeners[e.type] || []).forEach((f) => f(e)); }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } };
  w.window = w;
  w.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, registerPlugin: (name) => (name === 'WLNetwork' ? { getStatus: async () => status, addListener: () => Promise.resolve({ remove() {} }) } : null) };
  const el = () => ({ classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: { setProperty() {} }, setAttribute() {}, appendChild() {}, addEventListener() {} });
  w.document = { addEventListener() {}, createElement: el, documentElement: el(), body: el(), querySelector: () => null, querySelectorAll: () => [] };
  Object.assign(w, { setTimeout, clearTimeout, Promise, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  vm.createContext(w);
  vm.runInContext(read('src/app/native.js'), w);
  return w.WLNative;
}
test('on iPhone the app reads the network plugin and keeps VPN status unknown', async () => {
  const ios = nativeOn('ios', { connected: true, validated: true, vpn: null, transports: ['wifi'], id: '5', underlying: null, platform: 'ios' });
  const s = await ios.netStatus();
  assert.deepEqual({ known: s.known, connected: s.connected, vpn: s.vpn, vpnKnown: s.vpnKnown, underlying: s.underlying, transports: s.transports }, { known: true, connected: true, vpn: false, vpnKnown: false, underlying: null, transports: ['wifi'] });
  const android = nativeOn('android', { connected: true, validated: true, vpn: true, transports: ['vpn', 'wifi'], id: '2', underlying: true, underlyingTransports: ['wifi'] });
  const a = await android.netStatus();
  assert.equal(a.vpnKnown, true);
});

test('with VPN status unknown, an unreachable server is explained without claiming there is no VPN', async () => {
  const N = (await import('../src/app/netstate.js')).default;
  const dev = { known: true, connected: true, validated: true, vpn: false, vpnKnown: false, underlying: null, transports: ['wifi'] };
  assert.equal(N.deviceOnline(dev), true, 'unknown never makes the phone look offline');
  assert.equal(N.classify({ network: true }, dev), 'unreachable');
  const e = N.explain('unreachable', dev);
  assert.match(e.lead, /does not tell apps whether a VPN is on/);
  assert.ok(e.steps.some((x) => /If you use a VPN, check that it is connected/.test(x)));
});
