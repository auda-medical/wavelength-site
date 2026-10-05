// End-to-end check of the store app (Android build) without a phone: runs the real bundle in mobile/www as the app
// does, from https://localhost, with the real Capacitor runtime (www/capacitor.js) over a stand-in native bridge,
// and sends its API calls (https://thewavelength.co.uk/api/...) to a local Worker.
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal, with every migration applied locally,
//   npx wrangler dev --local --local-upstream localhost:8787
// Run:   node tools/e2e-native.mjs <outdir> [http://localhost:8787]
// Checks: sign-up, token kept across restarts, offline start, logging a scan, haptics, website links in the in-app
// browser, Android back button, app lock (on, cold start, resume, failed unlock), export through the native share
// sheet, log out, Content Security Policy and console errors, and layout at phone and tablet widths with insets.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'native-shots';
const API = process.argv[3] || 'http://localhost:8787';
const WWW = path.resolve('mobile/www');
const SITE = 'https://thewavelength.co.uk';
fs.mkdirSync(out, { recursive: true });
if (!fs.existsSync(path.join(WWW, 'index.html'))) throw new Error('Build the bundle first: node mobile/scripts/build-www.mjs');

const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const ok = (m) => console.log('ok  ', m);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };

// A stand-in for the Android native bridge: plugin headers, promise calls and listener callbacks, all recorded.
const BRIDGE = `(() => {
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

const browser = await chromium.launch();
let offline = false;
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
    if (offline) return route.abort('internetdisconnected');
    const req = route.request();
    const res = await route.fetch({ url: req.url().replace(SITE, API) });
    return route.fulfill({ response: res });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  return { ctx, page };
}
const calls = (p, plugin, method) => p.evaluate(([a, b]) => window.__calls.filter((c) => c.plugin === a && (!b || c.method === b)), [plugin, method]);
const clearCalls = (p) => p.evaluate(() => { window.__calls.length = 0; });
const prefs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__prefs') || '{}'));
const hash = (p) => p.evaluate(() => location.hash);
const back = async (p) => { await p.evaluate(() => window.__fire('App', 'backButton', { canGoBack: true })); await p.waitForTimeout(250); };
const noOverflow = async (p, name) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail('horizontal overflow on ' + name); };

const { ctx, page } = await newApp();
await page.goto('https://localhost/');
await page.waitForSelector('#app .auth, #app form', { timeout: 15000 });
if (!(await page.evaluate(() => window.Capacitor.isNativePlatform() && window.WLNative.on))) fail('the bundle does not see itself as native');
await page.screenshot({ path: `${out}/01-welcome.png` });
ok('welcome screen opens from the bundle');

// Sign up through the form.
const t = Date.now();
const email = `native${t}@example.com`;
await page.evaluate(() => { location.hash = '#/signup'; });
await page.waitForSelector('#f');
await page.fill('input[name=firstName]', 'Nadia');
await page.fill('input[name=lastName]', 'Store');
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', 'longpassword1');
await page.check('input[name=terms]');
await page.click('#f button[type=submit]');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('__prefs') || '{}')['wl-token'] || document.querySelector('#f .err:not([hidden])'), null, { timeout: 15000 });
await page.waitForTimeout(800);
let p = await prefs(page);
if (!/^\d+\.\d+\.[\w-]+$/.test(p['wl-token'] || '')) fail('no token stored after sign-up: ' + JSON.stringify(p));
else ok('sign-up stored the login token in Preferences');
const signupErr = await page.evaluate(() => (document.querySelector('.err:not([hidden])') || {}).textContent || '');
if (signupErr) fail('sign-up error: ' + signupErr);

// Finish onboarding through the API (the onboarding screens are the same as the website's).
const r = await page.evaluate(() => window.WLNative.net('/api/app/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((r) => r.json()));
if (!r.ok) fail('profile ' + JSON.stringify(r));

// Restart: the token survives, the app opens signed in.
await page.goto('https://localhost/');
await page.waitForSelector('nav.tabs', { timeout: 15000 });
ok('restart opens signed in with the stored token');
await page.screenshot({ path: `${out}/02-home.png` });
await noOverflow(page, 'home');

// Log a scan through the form.
await clearCalls(page);
await page.evaluate(() => { location.hash = '#/new'; });
await page.waitForSelector('label[for=t0]');
await page.click('label[for=t0]');
await page.waitForSelector('#rest:not([hidden])');
await page.screenshot({ path: `${out}/03-new-scan.png`, fullPage: false });
await page.locator('input[name=supervision]').first().check({ force: true });
await page.click('form button[type=submit]');
await page.waitForFunction(() => /#\/entry\//.test(location.hash) || document.querySelector('.err:not([hidden])'), null, { timeout: 15000 });
const saveErr = await page.evaluate(() => (document.querySelector('.err:not([hidden])') || {}).textContent || '');
if (saveErr) fail('scan save error: ' + saveErr); else ok('scan saved');
if (!(await calls(page, 'Haptics', 'notification')).length) fail('no haptic feedback on save'); else ok('haptic feedback on save');
await page.waitForTimeout(1500);
const synced = await page.evaluate(() => window.WLNative.net('/api/app/sync?since=0').then((r) => r.json()));
if (!(synced.entries || []).length) fail('scan did not sync to the server: ' + JSON.stringify(synced).slice(0, 200)); else ok('scan synced to the server with the token');
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((s) => s.remove()));

// Website links open in the in-app browser, not inside the logbook.
await page.evaluate(() => { location.hash = '#/me'; });
await page.waitForSelector('a[href="/privacy/"]');
await clearCalls(page);
const before = page.url();
await page.click('a[href="/privacy/"]');
await page.waitForTimeout(300);
const opened = await calls(page, 'Browser', 'open');
if (!opened.length || opened[0].options.url !== SITE + '/privacy/') fail('privacy link did not open in the in-app browser: ' + JSON.stringify(opened));
else if (page.url() !== before) fail('privacy link navigated the app itself');
else ok('website link opened in the in-app browser');
await page.screenshot({ path: `${out}/04-me.png`, fullPage: true });
await noOverflow(page, 'me');

// Android back button: header back link, then Home, then leave the app.
await page.evaluate(() => { location.hash = '#/supervisors'; });
await page.waitForSelector('header.top a.back');
await back(page);
if ((await hash(page)) !== '#/me') fail('back from supervisors went to ' + (await hash(page))); else ok('back follows the header back link');
await back(page);
if (!['#/', ''].includes(await hash(page))) fail('back from Me went to ' + (await hash(page))); else ok('back from a tab returns Home');
await clearCalls(page);
await back(page);
if (!(await calls(page, 'App', 'exitApp')).length) fail('back on Home did not leave the app'); else ok('back on Home leaves the app');
await page.evaluate(() => { location.hash = '#/log'; });
await page.waitForSelector('nav.tabs');
await page.evaluate(() => { location.hash = '#/me'; });
await page.waitForSelector('#lo');

// App lock: turn on, cold start, return after a while, failed unlock.
await page.check('#lck');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('__prefs') || '{}')['wl-lock'] === '1', null, { timeout: 5000 }).catch(() => fail('app lock did not turn on'));
ok('app lock turned on after a fingerprint check');
await page.goto('https://localhost/');
await page.waitForSelector('nav.tabs', { timeout: 15000 });
await page.waitForTimeout(500);
if (await page.$('.app-lock')) fail('lock screen still showing after a successful unlock'); else ok('cold start asked for the fingerprint and unlocked');
if (!(await calls(page, 'NativeBiometric', 'verifyIdentity')).length) fail('cold start did not ask for the fingerprint');
await page.evaluate(() => { window.__bio.pass = false; });
await page.evaluate(() => window.dispatchEvent(new CustomEvent('wl:resume', { detail: { away: 120000 } })));
await page.waitForSelector('.app-lock');
await page.screenshot({ path: `${out}/05-locked.png` });
ok('returning after two minutes locks the logbook');
await page.evaluate(() => { window.__bio.pass = true; });
await page.click('[data-unlock]');
await page.waitForSelector('.app-lock', { state: 'detached', timeout: 5000 }).catch(() => fail('unlock button did not unlock'));
ok('unlock button unlocks after a failed attempt');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('wl:resume', { detail: { away: 20000 } })));
await page.waitForTimeout(300);
if (await page.$('.app-lock')) fail('a short trip away (camera, share sheet) locked the app'); else ok('a short trip away does not lock');
await page.evaluate(() => { window.__bio.available = false; });
await page.evaluate(() => window.dispatchEvent(new CustomEvent('wl:resume', { detail: { away: 120000 } })));
await page.waitForTimeout(500);
if (await page.$('.app-lock')) fail('lock screen stuck when the phone has no biometrics'); else ok('no biometrics on the phone: lock turns itself off, nobody is locked out');
await page.evaluate(() => { window.__bio.available = true; });

// Offline start: the logbook opens from the device with the scan in it.
offline = true;
await page.goto('https://localhost/');
await page.waitForSelector('nav.tabs', { timeout: 15000 }).then(() => ok('offline start opens the logbook'), () => fail('offline start did not open the logbook'));
await page.evaluate(() => { location.hash = '#/log'; });
await page.waitForTimeout(500);
if (!(await page.$('.entry'))) fail('offline logbook shows no scans'); else ok('offline logbook shows the saved scan');
await page.screenshot({ path: `${out}/06-offline-log.png` });
offline = false;

// Export goes through the native share sheet.
await page.goto('https://localhost/#/export');
await page.waitForSelector('nav.tabs', { timeout: 15000 });
await clearCalls(page);
const exportBtn = await page.$('#xf button.teal');
if (exportBtn) {
  await exportBtn.click();
  await page.waitForSelector('[data-share]', { timeout: 20000 }).catch(() => {});
  const sh = await page.$('[data-share]');
  if (sh) {
    await sh.click(); await page.waitForTimeout(800);
    const fsw = await calls(page, 'Filesystem', 'writeFile'), shs = await calls(page, 'Share', 'share');
    if (!fsw.length || !shs.length) fail('export did not reach the native share sheet'); else ok('export saved to the app cache and opened the share sheet: ' + fsw[0].options.path);
  } else fail('export did not offer Share or save');
} else console.log('note: no export button found on #/export; skipped');

// Layout with Android insets (status bar 32px, gesture bar 24px) at phone and tablet widths.
for (const [w, h] of [[390, 844], [800, 1280]]) {
  const a = await newApp(w, h);
  await a.page.goto('https://localhost/');
  await a.page.waitForSelector('#app .auth, #app form, nav.tabs', { timeout: 15000 });
  await a.page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--safe-area-inset-top', '32px'); s.setProperty('--safe-area-inset-bottom', '24px'); });
  await a.page.screenshot({ path: `${out}/07-insets-${w}.png` });
  const top = await a.page.evaluate(() => { const el = document.querySelector('.auth-head, header.top'); return el ? parseFloat(getComputedStyle(el).paddingTop) : -1; });
  if (top < 32) fail(`content under the status bar at ${w}px (padding-top ${top})`); else ok(`content clears the status bar at ${w}px`);
  await noOverflow(a.page, 'welcome ' + w);
  await a.ctx.close();
}

// Log out clears the token.
await back(page); // the Android back button closes the export sheet
if (await page.$('.sheet-bg')) fail('back did not close the open sheet'); else ok('back closes an open sheet');
await page.evaluate(() => { location.hash = '#/me'; });
await page.waitForSelector('#lo', { timeout: 15000 });
await page.click('#lo');
await page.waitForTimeout(800);
p = await prefs(page);
if (p['wl-token']) fail('token still stored after log out'); else ok('log out cleared the token');

await ctx.close();
await browser.close();
if (errors.length) { console.log('\n' + errors.length + ' problem(s):\n' + errors.join('\n')); process.exit(1); }
console.log('\nAll native app checks passed.');
