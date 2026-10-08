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
import fs from 'node:fs';
import { harness, net, SITE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const out = process.argv[2] || 'native-shots';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-native.mjs');
fs.mkdirSync(out, { recursive: true });

const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const ok = (m) => console.log('ok  ', m);

const { browser, newApp } = await harness({ api: API, errors });
const calls = (p, plugin, method) => p.evaluate(([a, b]) => window.__calls.filter((c) => c.plugin === a && (!b || c.method === b)), [plugin, method]);
const clearCalls = (p) => p.evaluate(() => { window.__calls.length = 0; });
const prefs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__prefs') || '{}'));
const secure = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__secure') || '{}'));
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
await page.fill('input[name=password]', 'Long-password-1');
await page.fill('#pw-2', 'Long-password-1');
await page.screenshot({ path: `${out}/01b-signup.png`, fullPage: true });
if (await page.locator('.pw-rules li:not(.met)').count()) fail('password checklist not all ticked for a valid password'); else ok('password checklist ticks every rule');
await page.check('input[name=terms]');
await page.click('#f button[type=submit]');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('__secure') || '{}')['wavelength.session'] || document.querySelector('#f .err:not([hidden])'), null, { timeout: 15000 });
await page.waitForTimeout(800);
let p = await secure(page);
if (!/^\d+\.\d+\.[\w-]+$/.test(p['wavelength.session'] || '')) fail('no token in secure storage after sign-up: ' + JSON.stringify(p));
else ok('sign-up stored the login token in secure storage');
if ((await prefs(page))['wl-token']) fail('login token also written to Preferences'); else ok('no login token in Preferences');
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
await page.waitForTimeout(1000);
// Choosing the application scrolls to the Date and Setting row, with its labels just below the sticky header.
const land = await page.evaluate(() => ({ head: document.querySelector('.top').getBoundingClientRect().bottom, date: document.querySelector('label[for=date]').getBoundingClientRect().top, setting: document.querySelector('label[for=setting]').getBoundingClientRect().top, y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
if (land.date < land.head || land.setting < land.head) fail('Date or Setting hidden under the header after choosing the application: ' + JSON.stringify(land));
else if (land.date - land.head > 40 && land.y < land.max - 2) fail('form did not scroll to the Date row: ' + JSON.stringify(land));
else ok('choosing the application scrolls to the Date and Setting row, clear of the header');
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
await page.waitForSelector('.top .gear');
await page.click('.top .gear');
await page.waitForSelector('#lck', { timeout: 15000 }).catch(() => fail('Settings has no app lock switch'));
if ((await hash(page)) !== '#/settings') fail('the gear on Me opened ' + (await hash(page))); else ok('the gear on Me opens Settings, with the app lock switch');
await back(page);
if ((await hash(page)) !== '#/me') fail('back from Settings went to ' + (await hash(page))); else ok('back from Settings returns to Me');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#lck');

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
// The phone's own lock removed: the logbook stays locked and says why (the lock never switches itself off).
if (!(await page.$('.app-lock'))) fail('the lock switched itself off when the phone lock was removed');
else if (!/screen lock|fingerprint/.test(await page.$eval('[data-lockmsg]', (x) => x.textContent))) fail('the lock screen does not say why it cannot unlock');
else ok('phone lock removed: the logbook stays locked and says what to set up');
await page.evaluate(() => { window.__bio.available = true; });
await page.click('[data-unlock]');
await page.waitForSelector('.app-lock', { state: 'detached', timeout: 5000 }).then(() => ok('phone lock set up again: Unlock opens the logbook'), () => fail('Unlock did not open the logbook after the phone lock came back'));
// Lock off again for the checks below, as before.
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); delete p['wl-lock']; localStorage.setItem('__prefs', JSON.stringify(p)); });

// Offline start: the logbook opens from the device with the scan in it.
net.offline = true;
await page.goto('https://localhost/');
await page.waitForSelector('nav.tabs', { timeout: 15000 }).then(() => ok('offline start opens the logbook'), () => fail('offline start did not open the logbook'));
await page.evaluate(() => { location.hash = '#/log'; });
await page.waitForTimeout(500);
if (!(await page.$('.entry'))) fail('offline logbook shows no scans'); else ok('offline logbook shows the saved scan');
await page.screenshot({ path: `${out}/06-offline-log.png` });
net.offline = false;

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
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#lo', { timeout: 15000 });
await page.click('#lo');
await page.waitForTimeout(800);
p = await secure(page);
if (p['wavelength.session'] || (await prefs(page))['wl-token']) fail('token still stored after log out'); else ok('log out cleared the token');

// An earlier build kept the token in Preferences: it moves to secure storage on start.
{
  const m = await newApp();
  await m.page.goto('https://localhost/');
  await m.page.waitForSelector('#app .auth, #app form', { timeout: 15000 });
  const t2 = Date.now();
  const r2 = await m.page.evaluate((e) => window.WLNative.net('/api/app/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ firstName: 'Old', lastName: 'Build', email: e, password: 'Long-password-1', terms: true }) }).then((r) => r.json()), `oldbuild${t2}@example.com`);
  if (!r2.ok) fail('migration sign-up ' + JSON.stringify(r2));
  await m.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('__secure') || '{}'); const tok = s['wavelength.session']; localStorage.setItem('__secure', '{}'); localStorage.setItem('__prefs', JSON.stringify({ 'wl-token': tok })); });
  await m.page.goto('https://localhost/');
  await m.page.waitForTimeout(1500);
  const sp = await secure(m.page), pp = await prefs(m.page);
  if (sp['wavelength.session'] && !pp['wl-token']) ok('a token from Preferences moved to secure storage'); else fail('token migration: ' + JSON.stringify({ sp, pp }));
  await m.ctx.close();
}

await ctx.close();
await browser.close();
if (errors.length) { console.log('\n' + errors.length + ' problem(s):\n' + errors.join('\n')); process.exit(1); }
console.log('\nAll native app checks passed.');
