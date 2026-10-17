// Shared by tools/e2e-native.mjs and tools/store-shots.mjs: runs mobile/www as the Android app does, from
// https://localhost, with the real Capacitor runtime over a stand-in native bridge, and sends API calls for
// https://thewavelength.co.uk to a local Worker (default http://localhost:8787).
import { chromium } from 'playwright';
import { localOnly } from './local-only.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const WWW = path.resolve('mobile/www');
export const SITE = 'https://thewavelength.co.uk';
// The app bundle the stand-in phone runs. An upgrade test points it at an older release's bundle, then at the new one.
export const serve = { dir: WWW, files: {} };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
if (!fs.existsSync(path.join(WWW, 'index.html'))) throw new Error('Build the bundle first: node mobile/scripts/build-www.mjs');

// A stand-in for the Android native bridge: plugin headers, promise calls and listener callbacks, all recorded.
export const BRIDGE = `(() => {
  window.androidBridge = { postMessage() {} };
  const calls = (window.__calls = []);
  const listeners = {};
  let cbid = 1;
  const prefs = () => JSON.parse(localStorage.getItem('__prefs') || '{}');
  const savePrefs = (p) => localStorage.setItem('__prefs', JSON.stringify(p));
  window.__bio = Object.assign({ available: true, pass: true }, window.__bio); // a test may preset it in an init script
  const impl = {
    Preferences: {
      get: (o) => ({ value: prefs()[o.key] ?? null }),
      set: (o) => { const p = prefs(); p[o.key] = o.value; savePrefs(p); return {}; },
      remove: (o) => { const p = prefs(); delete p[o.key]; savePrefs(p); return {}; },
    },
    Browser: { open: () => ({}) },
    Haptics: { impact: () => ({}), notification: () => ({}) },
    Share: { share: () => ({ activityType: 'test' }) },
    // Files the app writes to its cache, kept as base64 pieces so a test can read them back (window.__files).
    Filesystem: {
      writeFile: (o) => { (window.__files = window.__files || {})[o.path] = [o.data]; return { uri: 'file:///cache/' + o.path }; },
      appendFile: (o) => { const f = (window.__files = window.__files || {}); (f[o.path] = f[o.path] || []).push(o.data); return {}; },
      getUri: (o) => ({ uri: 'file:///cache/' + o.path }),
      rmdir: (o) => { const f = window.__files || {}; for (const k of Object.keys(f)) if (k.startsWith(o.path + '/')) delete f[k]; return {}; },
    },
    // The installed app's metadata (versionName/versionCode, CFBundleShortVersionString/CFBundleVersion). A test can set
    // window.__appInfo before the app loads, or window.__appInfoFail to make the call fail.
    App: { exitApp: () => ({}), getInfo: () => { if (window.__appInfoFail) throw new Error('not available'); return window.__appInfo || { name: 'Wavelength', id: 'uk.co.thewavelength.app', version: '1.0.9', build: '15' }; } },
    // The phone's network (WLNetwork, Android ConnectivityManager). A test sets it with setDevice() below; by
    // default the phone reports Wi-Fi with validated internet access.
    WLNetwork: { getStatus: () => window.__netdev || { connected: true, validated: true, vpn: false, transports: ['wifi'], id: '1' } },
    NativeBiometric: {
      // Secure data store (Keystore / Keychain on a phone), kept apart from Preferences so tests can tell them apart.
      setData: (o) => { const d = JSON.parse(localStorage.getItem('__secure') || '{}'); d[o.key] = o.value; localStorage.setItem('__secure', JSON.stringify(d)); return {}; },
      getData: (o) => { const d = JSON.parse(localStorage.getItem('__secure') || '{}'); if (!(o.key in d)) throw new Error('No data found'); return { value: d[o.key] }; },
      deleteData: (o) => { const d = JSON.parse(localStorage.getItem('__secure') || '{}'); delete d[o.key]; localStorage.setItem('__secure', JSON.stringify(d)); return {}; },
      isAvailable: () => ({ isAvailable: window.__bio.available, biometryType: 3, authenticationStrength: window.__bio.available ? 1 : 0 }),
      verifyIdentity: () => { if (!window.__bio.pass) throw new Error('Authentication failed'); return {}; },
    },
  };
  // 1.0.16: the camera-capture plugin (WLCapture, Android), only when a test sets window.__captures = { files: [{ name,
  // kind, size, modified, legacy, path }] } in an init script. The files themselves are served from serve.files (by
  // path, at https://localhost/_capacitor_file_<path>, as Capacitor serves them). Removed names are remembered across
  // reloads (localStorage), as files deleted on a phone stay deleted.
  if (window.__captures) {
    const gone = () => JSON.parse(localStorage.getItem('__capRemoved') || '[]');
    impl.WLCapture = {
      list: () => ({ files: window.__captures.files.filter((f) => !gone().includes(f.name)) }),
      remove: (o) => { const g = gone(), n = (o.names || []).filter((x) => !g.includes(x)); localStorage.setItem('__capRemoved', JSON.stringify(g.concat(n))); (window.__capCalls = window.__capCalls || []).push(o); return { removed: n.length }; },
    };
  }
  const header = (name, methods, cb = []) => ({ name, methods: methods.map((m) => ({ name: m, rtype: 'promise' })).concat(cb.map((m) => ({ name: m, rtype: 'callback' }))) });
  window.Capacitor = {
    Plugins: {},
    // On a phone the native bridge supplies this: a file path as a URL the WebView can read (Android: _capacitor_file_).
    convertFileSrc: (p) => 'https://localhost/_capacitor_file_' + p,
    PluginHeaders: Object.entries(impl).map(([n, o]) => header(n, Object.keys(o), n === 'App' || n === 'WLNetwork' || n === 'WLCapture' ? ['addListener', 'removeListener'] : [])),
    nativePromise(plugin, method, options) {
      calls.push({ plugin, method, options, t: performance.now() });
      try { return Promise.resolve(impl[plugin][method](options || {})); } catch (e) { return Promise.reject(e); }
    },
    nativeCallback(plugin, method, options, callback) {
      calls.push({ plugin, method, options });
      if (method === 'addListener') { const id = String(cbid++); (listeners[plugin + ':' + options.eventName] = listeners[plugin + ':' + options.eventName] || []).push(callback); return id; }
      return '0';
    },
  };
  window.__fire = (plugin, event, data) => (listeners[plugin + ':' + event] || []).forEach((f) => f(data));
  document.addEventListener('securitypolicyviolation', (e) => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI));
})();`;

// The network as the phone sees it. offline: every call fails at once (aeroplane mode on most phones). hang: calls
// never answer (no signal, a captive portal, a stalled connection). delay: milliseconds before each answer.
export const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 WavelengthApp';
// blocked: the phone has a network but the Wavelength server cannot be reached through it (a VPN or filter that
// drops the traffic). challenge: something on the way answers with its own page (403, no CORS headers), which the
// app's WebView sees as a failed request.
export const net = { offline: false, hang: false, delay: 0, blocked: false, challenge: false };
// What the phone reports about its network (WLNetwork), and a change event as Android sends it.
export const DEVICE = {
  wifi: { connected: true, validated: true, vpn: false, transports: ['wifi'], id: '1' },
  none: { connected: false, validated: false, vpn: false, transports: [], id: '' },
  vpn: { connected: true, validated: true, vpn: true, transports: ['vpn', 'wifi'], id: '2' },
  vpnStale: { connected: true, validated: false, vpn: true, transports: ['vpn'], id: '2' },
  cellular: { connected: true, validated: true, vpn: false, transports: ['cellular'], id: '3' },
};
export function setDevice(page, status) {
  return page.evaluate((s) => { window.__netdev = s; if (window.__fire) window.__fire('WLNetwork', 'networkStatusChange', s); }, status);
}
// Android WebView reports connectivity changes only when the app holds ACCESS_NETWORK_STATE. Without it,
// navigator.onLine stays true and the online and offline events never fire. Add this init script to model that.
export const NO_NETWORK_EVENTS = `(() => {
  Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true });
  const stop = (e) => e.stopImmediatePropagation();
  window.addEventListener('online', stop, true); window.addEventListener('offline', stop, true);
})();`;
export async function harness({ api = 'http://localhost:8787', errors = [] } = {}) {
  localOnly(api, 'The native harness');
  const browser = await chromium.launch();
  async function newApp(width = 390, height = 844, { init = [], video = null } = {}) {
    // An Android 14 WebView user agent, as the app sees on a current phone (native.js reads the Android version).
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block', userAgent: ANDROID_UA, ...(video ? { recordVideo: video } : {}) });
    for (const s of init) await ctx.addInitScript(s);
    await ctx.addInitScript(BRIDGE);
    // The bundle, served as Capacitor serves it from the phone. Paths without a file fall back to index.html.
    await ctx.route('https://localhost/**', async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith('/_capacitor_file_')) { const b = serve.files[decodeURIComponent(u.pathname.slice('/_capacitor_file_'.length))]; return b ? route.fulfill({ status: 200, headers: { 'Content-Type': 'image/jpeg' }, body: b }) : route.fulfill({ status: 404, body: '' }); }
      const root = serve.dir;
      let f = path.join(root, decodeURIComponent(u.pathname));
      if (!f.startsWith(root)) return route.fulfill({ status: 403, body: '' });
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
      return route.fulfill({ status: 200, headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, body: fs.readFileSync(f) });
    });
    // The Wavelength server, played by the local Worker. Offline mode drops every call.
    await ctx.route(SITE + '/**', async (route) => {
      if (net.offline) return route.abort('internetdisconnected');
      if (net.blocked) return route.abort('connectionrefused');
      if (net.challenge) return route.fulfill({ status: 403, headers: { 'Content-Type': 'text/html' }, body: '<html>Access denied</html>' });
      if (net.hang) return new Promise(() => {});
      if (net.delay) await new Promise((r) => setTimeout(r, net.delay));
      const req = route.request();
      // The app may be closed while a slow call is still in flight; that call simply goes nowhere.
      try { return await route.fulfill({ response: await route.fetch({ url: req.url().replace(SITE, api) }) }); } catch { return undefined; }
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    return { ctx, page };
  }
  return { browser, newApp };
}
