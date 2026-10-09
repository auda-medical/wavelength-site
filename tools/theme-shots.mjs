// Light and dark theme check for the app: visits every screen in both themes at 390px, saves screenshots, and checks
// text contrast against the colour behind it (WCAG AA: 4.5:1 for normal text, 3:1 for large or bold large text).
// Run against `npx wrangler dev --local --local-upstream localhost:8787`.
// Usage: node tools/theme-shots.mjs <outdir> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { localOnly } from './local-only.mjs';

const out = process.argv[2] || 'theme-shots';
const BASE = process.argv[3] || 'http://localhost:8787';
localOnly(BASE, 'tools/theme-shots.mjs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];
const errors = [];

async function context(scheme) {
  // Reduced motion (1.0.12): sections below the fold rise into view as they scroll in; a full-page still shows them all.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(scheme + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(scheme + ': ' + String(e)));
  return { ctx, page };
}
const post = (page, p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);

// Contrast of every visible text run against the first opaque background behind it. Skips text over images,
// gradients and canvases, where the backdrop is not one colour.
const contrast = (page) => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  function backdrop(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^url\(.*svg/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = mix(layers[i], base);
    return base;
  }
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('svg, canvas, video, .editor, .viewer, option, [hidden], .sr')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    let fg = parse(cs.color); const bg = backdrop(el); if (!fg || !bg) continue;
    if (fg.a < 1) fg = mix(fg, bg);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 600;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const disabled = el.closest('[disabled], .muted.small[aria-disabled]');
    if (ratio < need && !disabled && !(el.matches('input, textarea') || el.closest('input, textarea'))) bad.push(ratio.toFixed(2) + ' "' + t.textContent.trim().slice(0, 40) + '" ' + cs.color + ' on rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')');
  }
  return bad;
});

async function shoot(page, theme, name) {
  await page.waitForTimeout(500);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (ov) problems.push(`${theme} ${name}: horizontal overflow`);
  const actual = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (actual !== theme) problems.push(`${theme} ${name}: data-theme is ${actual}`);
  for (const b of await contrast(page)) problems.push(`${theme} ${name}: low contrast ${b}`);
  await page.screenshot({ path: `${out}/${theme}-${name}.png`, fullPage: true });
}

const t = Date.now();
for (const theme of ['light', 'dark']) {
  const { ctx, page } = await context(theme);
  // Signed-out screens follow the phone setting before any choice is made.
  for (const [name, hash] of [['welcome', ''], ['login', '#/login'], ['signup', '#/signup']]) {
    await page.goto(BASE + '/app/' + hash); await page.waitForSelector('#app .auth, #app form'); await shoot(page, theme, name);
  }
  const email = `theme${theme}${t}@example.com`;
  let r = await post(page, '/api/app/signup', { firstName: 'Tess', lastName: 'Theme', email, password: 'Long-password-1', terms: true });
  if (!r.ok) throw new Error('signup ' + JSON.stringify(r));
  r = await post(page, '/api/app/profile', { declaration: true, profile: { pathways: ['rcem', 'famus'], grade: 'ST5', onboarded: true }, organisation: 'Test Hospital' });
  const entries = [];
  for (let i = 0; i < 6; i++) entries.push({ id: 'th' + theme + t.toString(36) + i, type: i < 4 ? 'efast' : 'aaa', date: `2026-0${i + 3}-1${i}`, setting: 'Emergency department', supervision: i % 2 ? 'direct' : 'indirect', overall: i === 1 ? 'Abnormal' : 'Normal', quality: ['Good', 'Adequate', 'Limited', 'Good', 'Adequate', 'Good'][i], supervisor: 'Dr Lee', indication: 'Trauma', interpretation: 'Free fluid in Morison\'s pouch', findings: { ruq: i === 1 ? 'Free fluid' : 'No free fluid' } });
  r = await post(page, '/api/app/sync', { entries });
  if (!r.ok) problems.push('sync ' + JSON.stringify(r).slice(0, 200));
  await post(page, '/api/app/signoff/request', { entryIds: [entries[0].id], supervisorName: 'Dr Lee' });
  const screens = [['home', ''], ['logbook', '#/log'], ['scan', '#/entry/' + entries[1].id], ['progress', '#/progress'], ['me', '#/me'], ['settings', '#/settings'],
    ['new', '#/new'], ['export', '#/export'], ['evidence', '#/evidence'], ['backup', '#/backup'], ['targets', '#/targets'], ['declaration', '#/declaration'], ['assess', '#/assess'], ['supervisors', '#/supervisors'], ['supervise', '#/supervise'],
    // 1.0.12 screens.
    ['outstanding', '#/outstanding'], ['guides', '#/guides'], ['guide', '#/guides/rcem-ultrasound-sign-off'], ['guide-supervision', '#/guides/supervisor-verification']];
  for (const [name, hash] of screens) {
    // The scan form asks before leaving with unsaved changes; this tool only looks, so it drops them first.
    await page.evaluate(() => document.querySelectorAll('form[data-dirty]').forEach((f) => delete f.dataset.dirty)).catch(() => {});
    await page.goto(BASE + '/app/' + hash); await page.waitForSelector('nav.tabs', { timeout: 15000 });
    if (name === 'new') { await page.click('label[for=t0]'); await page.locator('input[name=supervision]').first().check({ force: true }); await page.evaluate(() => { document.getElementById('overall1').checked = true; }); }
    if (name === 'logbook') { await page.waitForSelector('.entry'); }
    if (name === 'guides') { await page.waitForSelector('.guide-card.lead'); }
    if (name === 'guide') { await page.waitForSelector('.guide-body h2'); }
    await shoot(page, theme, name);
  }
  // The delete-account sheet, as an example of a sheet over the page.
  await page.evaluate(() => document.querySelectorAll('form[data-dirty]').forEach((f) => delete f.dataset.dirty)).catch(() => {});
  await page.goto(BASE + '/app/#/settings'); await page.waitForSelector('#dl'); await page.click('#dl'); await page.waitForSelector('.sheet'); await shoot(page, theme, 'sheet');
  await ctx.close();
}

// The choice in Settings overrides the phone and survives a restart.
{
  const { ctx, page } = await context('light');
  await page.goto(BASE + '/app/');
  const r = await post(page, '/api/app/login', { email: `themelight${t}@example.com`, password: 'Long-password-1' });
  if (!r.ok) problems.push('login ' + JSON.stringify(r));
  await page.goto(BASE + '/app/#/settings'); await page.reload(); await page.waitForSelector('.theme-pick');
  await page.click('label[for=th-dark]');
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') problems.push('choosing Dark did not switch the theme');
  await page.reload(); await page.waitForSelector('.theme-pick');
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') problems.push('Dark did not survive a restart');
  if (!(await page.isChecked('#th-dark'))) problems.push('Dark not shown as chosen after a restart');
  await page.click('label[for=th-system]');
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'light') problems.push('Match my phone did not follow a light phone');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(200);
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') problems.push('Match my phone did not follow the phone switching to dark');
  await page.click('label[for=th-light]');
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'light') problems.push('Light did not override a dark phone');
  // Supervisor pages stay light whatever the learner chose.
  await page.goto(BASE + '/verify/'); await page.waitForTimeout(300);
  await page.goto(BASE + '/app/verify/?code=SO-AAAA-AAAA'); await page.waitForTimeout(500);
  if (await page.evaluate(() => document.documentElement.dataset.theme)) problems.push('verify page took the app theme');
  await ctx.close();
}

await browser.close();
const all = problems.concat(errors.map((e) => 'console: ' + e));
for (const p of all) console.log('FAIL', p);
console.log(all.length ? `\n${all.length} problems.` : '\nBoth themes passed: no low-contrast text, no overflow, no console errors.');
process.exit(all.length ? 1 : 0);
