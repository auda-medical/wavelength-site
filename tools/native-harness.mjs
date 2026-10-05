// Shared by tools/e2e-native.mjs and tools/store-shots.mjs: runs mobile/www as the Android app does, from
// https://localhost, with the real Capacitor runtime over a stand-in native bridge, and sends API calls for
// https://thewavelength.co.uk to a local Worker (default http://localhost:8787).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const WWW = path.resolve('mobile/www');
export const SITE = 'https://thewavelength.co.uk';
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
  window.__bio = { available: true, pass: true };
  const impl = {
    Preferences: {
      get: (o) => ({ value: prefs()[o.key] ?? null }),
      set: (o) => { const p = prefs(); p[o.key] = o.value; savePrefs(p); return {}; },
      remove: (o) => { const p = prefs(); delete p[o.key]; savePrefs(p); return {}; },
    },
    Browser: { open: () => ({}) },
    Haptics: { impact: () => ({}), notification: () => ({}) },
    Share: { share: () => ({ activityType: 'test' }) },
    Filesystem: { writeFile: (o) => ({ uri: 'file:///cache/' + o.path }) },
    App: { exitApp: () => ({}) },
    NativeBiometric: {
      // Secure data store (Keystore / Keychain on a phone), kept apart from Preferences so tests can tell them apart.
      setData: (o) => { const d = JSON.parse(localStorage.getItem('__secure') || '{}'); d[o.key] = o.value; localStorage.setItem('__secure', JSON.stringify(d)); return {}; },
      getData: (o) => { const d = JSON.parse(localStorage.getItem('__secure') || '{}'); if (!(o.key in d)) throw new Error('No data found'); return { value: d[o.key] }; },
      deleteData: (o) => { const d = JSON.parse(localStorage.getItem('__secure') || '{}'); delete d[o.key]; localStorage.setItem('__secure', JSON.stringify(d)); return {}; },
      isAvailable: () => ({ isAvailable: window.__bio.available, biometryType: 3 }),
      verifyIdentity: () => { if (!window.__bio.pass) throw new Error('Authentication failed'); return {}; },
    },
  };
  const header = (name, methods, cb = []) => ({ name, methods: methods.map((m) => ({ name: m, rtype: 'promise' })).concat(cb.map((m) => ({ name: m, rtype: 'callback' }))) });
  window.Capacitor = {
    Plugins: {},
    PluginHeaders: Object.entries(impl).map(([n, o]) => header(n, Object.keys(o), n === 'App' ? ['addListener', 'removeListener'] : [])),
    nativePromise(plugin, method, options) {
      calls.push({ plugin, method, options });
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

export const net = { offline: false };
export async function harness({ api = 'http://localhost:8787', errors = [] } = {}) {
  const browser = await chromium.launch();
  async function newApp(width = 390, height = 844) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
    await ctx.addInitScript(BRIDGE);
    // The bundle, served as Capacitor serves it from the phone. Paths without a file fall back to index.html.
    await ctx.route('https://localhost/**', async (route) => {
      const u = new URL(route.request().url());
      let f = path.join(WWW, decodeURIComponent(u.pathname));
      if (!f.startsWith(WWW)) return route.fulfill({ status: 403, body: '' });
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(WWW, 'index.html');
      return route.fulfill({ status: 200, headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, body: fs.readFileSync(f) });
    });
    // The Wavelength server, played by the local Worker. Offline mode drops every call.
    await ctx.route(SITE + '/**', async (route) => {
      if (net.offline) return route.abort('internetdisconnected');
      const req = route.request();
      const res = await route.fetch({ url: req.url().replace(SITE, api) });
      return route.fulfill({ response: res });
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    return { ctx, page };
  }
  return { browser, newApp };
}
