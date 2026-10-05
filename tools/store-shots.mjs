// Store listing images from the real app: runs mobile/www (see tools/native-harness.mjs) against a local Worker with
// a sample logbook, takes phone screenshots, and frames them with a caption at 1080x1920 for Google Play and the
// App Store. Also renders the Google Play feature graphic (1024x500).
// Setup as for tools/e2e-native.mjs. Run: node tools/store-shots.mjs <outdir> [http://localhost:8787]
// The sample logbook is invented for illustration: no real patients, learners or supervisors.
import fs from 'node:fs';
import path from 'node:path';
import { harness } from './native-harness.mjs';

const out = path.resolve(process.argv[2] || 'store-shots');
const API = process.argv[3] || 'http://localhost:8787';
fs.mkdirSync(path.join(out, 'raw'), { recursive: true });
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---- Sample logbook ----
const { ctx, page } = await newApp(412, 732);
await page.goto('https://localhost/');
await page.waitForSelector('#app .auth, #app form', { timeout: 15000 });
const call = (p, data) => page.evaluate(([p, data]) => window.WLNative.net(p, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const stamp = Date.now().toString(36);
// The sample account lives only in the local test database. If an earlier run left it, delete it and start clean.
const email = 'alex.morgan@example.com', password = 'sample-logbook-1';
const signup = () => call('/api/app/signup', { title: 'Dr', firstName: 'Alex', lastName: 'Morgan', email, password, terms: true, role: 'ST4 emergency medicine' });
let r = await signup();
if (r.exists) { await call('/api/app/login', { email, password }); await call('/api/app/account/delete', { password }); r = await signup(); }
if (!r.ok) throw new Error('signup ' + JSON.stringify(r));
r = await call('/api/app/profile', { declaration: true, profile: { pathways: ['rcem', 'famus'], grade: 'ST4 emergency medicine', onboarded: true }, organisation: 'Teaching hospital' });
if (!r.ok) throw new Error('profile ' + JSON.stringify(r));
const plan = [['efast', 14], ['lung', 9], ['cardiac', 8], ['aaa', 6], ['dvt', 5], ['shock', 3], ['pva', 4]];
const settings = ['Emergency department', 'Emergency department', 'Acute medical unit', 'Course or simulation', 'Intensive care'];
const entries = [];
let n = 0;
for (const [type, count] of plan) {
  for (let i = 0; i < count; i++, n++) {
    const d = new Date(Date.now() - (n * 3 + 2) * 864e5).toISOString().slice(0, 10);
    entries.push({ id: `s${stamp}${n}`, type, date: d, setting: settings[n % settings.length], age: ['31 to 50', '51 to 70', '16 to 30', 'Over 70'][n % 4], sex: n % 2 ? 'Female' : 'Male', supervision: n % 3 ? 'direct' : 'mentored', supervisor: 'Dr Rivers', overall: n % 4 ? 'Normal' : 'Abnormal', imageQuality: n % 5 ? 'Good' : 'Adequate', indication: 'Undifferentiated hypotension', reflection: 'Fanned through the whole window before deciding.', findings: {} });
  }
}
r = await call('/api/app/sync', { entries });
if (!r.ok) throw new Error('sync ' + JSON.stringify(r).slice(0, 300));
r = await call('/api/app/signoff/inperson', { entryIds: entries.slice(0, 18).map((e) => e.id), name: 'Dr Sam Rivers', role: 'Consultant in emergency medicine', confirm: true, signature: SIG, basis: 'witnessed' });
if (!r.ok) console.log('note: sign-off sample', JSON.stringify(r).slice(0, 200));

// ---- Screens ----
await page.goto('https://localhost/');
await page.waitForSelector('nav.tabs', { timeout: 15000 });
await page.waitForTimeout(1500);
const shots = [];
// hero: the part of the screen each listing image enlarges as a callout, so every swipe shows something new.
async function shot(name, hash, prep, hero) {
  await page.evaluate((h) => { document.querySelectorAll('.sheet-bg,.toast').forEach((s) => s.remove()); location.hash = h; }, hash);
  await page.waitForTimeout(900);
  if (prep) await prep(); else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((s) => s.remove()));
  const f = path.join(out, 'raw', name + '.png');
  await page.screenshot({ path: f });
  shots.push(f);
  if (hero) {
    const el = page.locator(hero).first();
    if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: path.join(out, 'raw', name + '-hero.png') }); }
    else console.log('note: no hero element for ' + name);
  }
}
await shot('home', '#/', null, '.stats');
await shot('progress', '#/progress', async () => { await page.evaluate(() => { let best = null, top = -1; document.querySelectorAll('main .mod-head').forEach((h) => { const v = parseInt((h.querySelector('.ring') || h).textContent, 10) || 0; if (v > top && v < 100) { top = v; best = h; } }); if (best) best.parentElement.setAttribute('data-hero', '1'); window.scrollTo(0, 0); }); }, '[data-hero]');
await shot('log', '#/log', async () => { const b = page.locator('button, a, label').filter({ hasText: /^Signed off · \d+$/ }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(500); } }, 'main .entry');
await shot('new', '#/new', async () => { await page.click('label[for=t0]'); await page.waitForTimeout(400); await page.evaluate(() => window.scrollTo(0, 0)); });
await shot('entry', '#/entry/' + entries[0].id, null, '.signbox');
await shot('me', '#/me', async () => { await page.evaluate(() => { const c = document.querySelector('#lck'); if (c) c.checked = true; window.scrollTo(0, 0); }); }, '.card:has(#lck)');
await ctx.close();

// ---- Framed listing images ----
// [eyebrow, heading, subline]. Name only the verified UK pathways (RCEM, FAMUS, FUSIC); the international ones are
// editable trackers, so the store artwork must not imply accreditation with them.
const CAPTIONS = {
  home: ['POCUS LOGBOOK', 'Every scan, in your pocket', 'Log scans, track targets and get signed off.'],
  progress: ['PROGRESS', 'Watch your targets fill up', 'Track RCEM, FAMUS and FUSIC, or set your own.'],
  log: ['SIGN-OFF', 'Signed off the same day', 'In person, by secure link or from a dashboard.'],
  new: ['WORKS OFFLINE', 'Log a scan in seconds', 'No signal needed. Images stay on your phone.'],
  entry: ['VERIFIABLE', 'Evidence anyone can check', 'Every sign-off carries its own code.'],
  me: ['PRIVATE', 'Locked to you', 'Fingerprint or face unlock guards your logbook.'],
};
const fontDir = path.resolve('mobile/www/assets/fonts');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(fontDir, f)).toString('base64');
const FONTS = `@font-face { font-family: Cormorant; src: url('${font('cormorant-garamond-latin-500-normal.woff2')}'); }
  @font-face { font-family: DMSans; src: url('${font('dm-sans-latin-500-normal.woff2')}'); font-weight: 500; }
  @font-face { font-family: DMSans; src: url('${font('dm-sans-latin-600-normal.woff2')}'); font-weight: 600; }`;
const frameCtx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const fp = await frameCtx.newPage();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
for (const f of shots) {
  const key = path.basename(f, '.png');
  const [eye, h, sub] = CAPTIONS[key];
  const heroFile = path.join(out, 'raw', key + '-hero.png');
  const hero = fs.existsSync(heroFile) ? 'data:image/png;base64,' + fs.readFileSync(heroFile).toString('base64') : '';
  const img = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  await fp.setContent(`<!doctype html><html><head><style>
    ${FONTS}
    html,body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: radial-gradient(120% 70% at 50% 0%, #163049 0%, #0A1526 62%); color: #F7F5F0; }
    .cap { text-align: center; padding: 92px 64px 0; }
    .eye { display: inline-block; font: 600 26px DMSans, sans-serif; letter-spacing: .32em; color: #7FC4CC; padding-bottom: 14px; margin-bottom: 26px; border-bottom: 2px solid rgba(127,196,204,.55); }
    h1 { font: 500 86px/1.02 Cormorant, Georgia, serif; margin: 0 0 24px; letter-spacing: -.5px; }
    p { font: 500 38px/1.35 DMSans, sans-serif; color: #B9C4D0; margin: 0; }
    .phone { position: absolute; left: 50%; top: 470px; width: 780px; height: 1386px; transform: translateX(-50%); border-radius: 64px; background: #050B14; padding: 22px; box-shadow: 0 40px 120px rgba(0,0,0,.55), 0 0 0 2px rgba(127,196,204,.25); }
    .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 44px; display: block; }
    .hero { position: absolute; left: 50%; bottom: 150px; width: 940px; transform: translateX(-50%); border-radius: 30px; overflow: hidden; box-shadow: 0 30px 90px rgba(0,0,0,.6), 0 0 0 3px rgba(127,196,204,.75), 0 0 60px rgba(42,127,138,.45); }
    .hero img { width: 100%; display: block; }
  </style></head><body><div class="cap"><div class="eye">${esc(eye)}</div><h1>${esc(h)}</h1><p>${esc(sub)}</p></div><div class="phone"><img src="${img}"></div>${hero ? `<div class="hero"><img src="${hero}"></div>` : ''}</body></html>`, { waitUntil: 'load' });
  await fp.waitForTimeout(300);
  await fp.screenshot({ path: path.join(out, `play-${String(shots.indexOf(f) + 1).padStart(2, '0')}-${key}.png`) });
}
// Feature graphic: brand mark, name and tagline.
await fp.setViewportSize({ width: 1024, height: 500 });
await fp.setContent(`<!doctype html><html><head><style>
  ${FONTS}
  html,body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: radial-gradient(90% 120% at 20% 50%, #163049 0%, #0A1526 70%); color: #F7F5F0; display: flex; align-items: center; }
  .wrap { display: flex; align-items: center; gap: 52px; padding: 0 70px; }
  .t { font: 600 22px DMSans, sans-serif; letter-spacing: .42em; }
  h1 { font: 500 60px/1.06 Cormorant, Georgia, serif; margin: 18px 0 16px; white-space: nowrap; }
  p { font: 500 24px DMSans, sans-serif; color: #B9C4D0; margin: 0; letter-spacing: .18em; }
</style></head><body><div class="wrap">
  <svg width="180" height="180" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" stroke="rgba(247,245,240,.6)" stroke-width="2"/><path d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke="#7FC4CC" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div><div class="t">WAVELENGTH</div><h1>The ultrasound logbook<br>built by supervisors</h1><p>TUNE IN · GAIN CLARITY</p></div>
</div></body></html>`, { waitUntil: 'load' });
await fp.waitForTimeout(300);
await fp.screenshot({ path: path.join(out, 'play-feature-graphic.png') });
await browser.close();
if (errors.length) console.log('Console problems:\n' + errors.join('\n'));
console.log('Store images in ' + out);
