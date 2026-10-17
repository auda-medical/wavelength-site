// Store listing images from the real app: runs mobile/www (see tools/native-harness.mjs) against a local Worker with
// a sample logbook, takes phone screenshots, and frames them with a caption at two sizes: 1080x1920 for Google Play
// (<outdir>/play-*.png, copy to mobile/store/) and iPhone 6.9 inch, 1320x2868, for the App Store
// (<outdir>/ios/ios-*.png, copy to mobile/store/ios/). Also renders the Google Play feature graphic (1024x500).
// Setup as for tools/e2e-native.mjs. Run: node tools/store-shots.mjs <outdir> [http://localhost:8787]
// The sample logbook is invented for illustration: no real patients, learners or supervisors.
import fs from 'node:fs';
import path from 'node:path';
import { harness } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const out = path.resolve(process.argv[2] || 'store-shots');
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/store-shots.mjs');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---- Sample logbook ----
const { ctx, page } = await newApp(412, 732);
await page.goto('https://localhost/');
await page.waitForSelector('#app .auth, #app form', { timeout: 15000 });
const call = (p, data, pg = page) => pg.evaluate(([p, data]) => window.WLNative.net(p, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const stamp = Date.now().toString(36);
// The sample account lives only in the local test database. If an earlier run left it, delete it and start clean.
const email = 'alex.morgan@example.com', password = 'Sample-logbook-1';
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
// One set of raw screens per listing size, from a phone of that shape. The page must be logged in to the sample account.
async function capture(page, dir, settle) {
  fs.mkdirSync(dir, { recursive: true });
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForTimeout(settle);
  const shots = [];
  // hero: the part of the screen each listing image enlarges as a callout, so every swipe shows something new.
  async function shot(name, hash, prep, hero) {
    await page.evaluate((h) => { document.querySelectorAll('.sheet-bg,.toast').forEach((s) => s.remove()); location.hash = h; }, hash);
    await page.waitForTimeout(900);
    if (prep) await prep(); else await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((s) => s.remove()));
    const f = path.join(dir, name + '.png');
    await page.screenshot({ path: f });
    shots.push(f);
    if (hero) {
      const el = page.locator(hero).first();
      if (await el.count()) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(900); /* sections fade in as they scroll into view */ await el.screenshot({ path: path.join(dir, name + '-hero.png') }); }
      else console.log('note: no hero element for ' + name);
    }
  }
  await shot('home', '#/', null, '.stats');
  await shot('progress', '#/progress', async () => { await page.evaluate(() => { let best = null, top = -1; document.querySelectorAll('main .mod-head').forEach((h) => { const v = parseInt((h.querySelector('.ring') || h).textContent, 10) || 0; if (v > top && v < 100) { top = v; best = h; } }); if (best) best.parentElement.setAttribute('data-hero', '1'); window.scrollTo(0, 0); }); }, '[data-hero]');
  await shot('log', '#/log', async () => { const b = page.locator('button, a, label').filter({ hasText: /^Signed off · \d+$/ }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(500); } }, 'main .entry');
  await shot('entry', '#/entry/' + entries[0].id, null, '.signbox');
  // App lock lives under Me > Settings > Security (1.0.12 and later): show it switched on, scrolled into view.
  await shot('me', '#/settings', async () => { await page.evaluate(() => { const c = document.querySelector('#lck'); if (c) { c.checked = true; const card = c.closest('.card'); const h = card && card.previousElementSibling; (h || card).scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } else window.scrollTo(0, 0); }); }, '.card:has(#lck)');
  // Last: once a scan type is chosen, leaving the form asks whether to discard it (1.0.14 and later).
  await shot('new', '#/new', async () => { await page.click('label[for=t0]'); await page.waitForTimeout(400); await page.evaluate(() => window.scrollTo(0, 0)); });
  return shots;
}

// Listing sizes. Google Play: 1080x1920 from an Android phone (412x732). App Store: iPhone 6.9 inch, 1320x2868, from
// a phone of that shape (440x956 is its size in CSS pixels). phoneW fixes the Play frame width as before; for the
// iPhone it is worked out from the screenshot's shape.
const SIZES = [
  { key: 'play', width: 1080, height: 1920, view: [412, 732], phoneW: 780, dir: out, raw: path.join(out, 'raw') },
  { key: 'ios', width: 1320, height: 2868, view: [440, 956], dir: path.join(out, 'ios'), raw: path.join(out, 'ios', 'raw') },
];
SIZES[0].shots = await capture(page, SIZES[0].raw, 1500);
await ctx.close();
{
  // A fresh phone: log in to the same sample account, and let the first sync bring the logbook down.
  const iphone = await newApp(...SIZES[1].view);
  await iphone.page.goto('https://localhost/');
  await iphone.page.waitForSelector('#app .auth, #app form', { timeout: 15000 });
  r = await call('/api/app/login', { email, password }, iphone.page);
  if (!r.ok) throw new Error('login ' + JSON.stringify(r));
  SIZES[1].shots = await capture(iphone.page, SIZES[1].raw, 3000);
  await iphone.ctx.close();
}

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
// Listing order: what it is, how quick it is, why it helps training, supervision, verifiable evidence, privacy.
const ORDER = ['home', 'new', 'progress', 'log', 'entry', 'me'];
for (const size of SIZES) {
  // The 1080x1920 layout, scaled to the listing width. The phone frame fills the height under the caption.
  const W = size.width, H = size.height, k = W / 1080;
  const px = (n) => Math.round(n * k);
  // phoneW and phoneH are the screen area inside the frame's padding.
  const pad = px(22), phoneH = H - px(534);
  const phoneW = size.phoneW || Math.min(W - px(180), Math.round(phoneH * size.view[0] / size.view[1]));
  const maxText = W - px(128);
  fs.mkdirSync(size.dir, { recursive: true });
  await fp.setViewportSize({ width: W, height: H });
  const ordered = ORDER.map((name) => size.shots.find((f) => path.basename(f, '.png') === name)).filter(Boolean);
  for (const f of ordered) {
    const key = path.basename(f, '.png');
    const [eye, h, sub] = CAPTIONS[key];
    const heroFile = path.join(size.raw, key + '-hero.png');
    const hero = fs.existsSync(heroFile) ? 'data:image/png;base64,' + fs.readFileSync(heroFile).toString('base64') : '';
    const img = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    await fp.setContent(`<!doctype html><html><head><style>
      ${FONTS}
      html,body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: radial-gradient(120% 70% at 50% 0%, #163049 0%, #0A1526 62%); color: #F7F5F0; }
      /* Every caption sits on the same grid: eyebrow, rule, headline and subtitle at fixed heights on all six images. */
      .eye, .rule, h1, p { position: absolute; left: 0; right: 0; text-align: center; margin: 0; }
      .eye { top: ${px(96)}px; font: 600 ${px(26)}px/1 DMSans, sans-serif; letter-spacing: .32em; text-indent: .32em; color: #7FC4CC; }
      .rule { top: ${px(140)}px; left: 50%; right: auto; width: ${px(96)}px; height: ${px(2)}px; transform: translateX(-50%); background: rgba(127,196,204,.7); }
      h1 { top: ${px(172)}px; font: 500 ${px(86)}px/1 Cormorant, Georgia, serif; letter-spacing: -.5px; white-space: nowrap; }
      p { top: ${px(282)}px; font: 500 ${px(38)}px/1.2 DMSans, sans-serif; color: #D6DEE7; white-space: nowrap; }
      .phone { position: absolute; left: 50%; top: ${px(404)}px; width: ${phoneW}px; height: ${phoneH}px; transform: translateX(-50%); border-radius: ${px(64)}px; background: #050B14; padding: ${pad}px; box-shadow: 0 ${px(40)}px ${px(120)}px rgba(0,0,0,.55), 0 0 0 ${px(2)}px rgba(127,196,204,.25); }
      .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: ${px(44)}px; display: block; }
      .hero { position: absolute; left: 50%; bottom: ${px(168)}px; width: ${px(846)}px; transform: translateX(-50%); border-radius: ${px(30)}px; overflow: hidden; box-shadow: 0 ${px(30)}px ${px(90)}px rgba(0,0,0,.6), 0 0 0 ${px(3)}px rgba(127,196,204,.75), 0 0 ${px(60)}px rgba(42,127,138,.45); }
      .hero img { width: 100%; display: block; }
    </style></head><body><div class="eye">${esc(eye)}</div><div class="rule"></div><h1>${esc(h)}</h1><p>${esc(sub)}</p><div class="phone"><img src="${img}"></div>${hero ? `<div class="hero"><img src="${hero}"></div>` : ''}</body></html>`, { waitUntil: 'load' });
    await fp.waitForTimeout(300);
    // Keep every headline and subtitle on one line inside a 64 px margin (scaled); report any that had to shrink.
    const shrunk = await fp.evaluate(([max, min]) => { const out = []; for (const el of document.querySelectorAll('h1, p')) { let size = parseFloat(getComputedStyle(el).fontSize); const w = () => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; }; while (w() > max && size > min) { size -= 1; el.style.fontSize = size + 'px'; } if (el.style.fontSize) out.push(el.tagName + ' ' + size); } return out; }, [maxText, px(20)]);
    if (shrunk.length) console.log('note: ' + size.key + ' ' + key + ' text shrunk to fit: ' + shrunk.join(', '));
    await fp.screenshot({ path: path.join(size.dir, `${size.key}-${String(ordered.indexOf(f) + 1).padStart(2, '0')}-${key}.png`) });
  }
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
