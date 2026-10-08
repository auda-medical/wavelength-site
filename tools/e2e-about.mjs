// About Wavelength in the store app, without a phone: the real bundle over the stand-in native bridge
// (tools/native-harness.mjs) and a local Worker. Dummy account only. Checks the footer on Me and Settings, that the
// version and build come from the installed app's metadata, the About sheet, the open-source licences, offline use,
// keyboard and screen-reader basics, and Arabic.
//
// Setup: WL_APP_VERSION=1.0.9 WL_VERSION_CODE=15 node mobile/scripts/build-www.mjs,
//        then node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-about.mjs [results.json] [http://localhost:8787]
import fs from 'node:fs';
import { harness, net } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-about.mjs');
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });

const t = Date.now();
const email = `about${t}@example.com`;
const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
const su = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'About', email, password: 'Long-password-1', terms: true }) });
const token = su.headers.get('X-Wavelength-Token');
await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], onboarded: true } }) });

async function phone({ init = [], lang = 'en' } = {}) {
  const { ctx, page } = await newApp(390, 844, { init });
  await page.goto('https://localhost/');
  await page.evaluate(([tok, lang]) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); localStorage.setItem('wl-lang', lang); }, [token, lang]);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  return { ctx, page };
}
const footer = (page) => page.evaluate(() => { const f = document.querySelector('.about-foot'); return f ? f.innerText.replace(/\s*\n\s*/g, ' / ') : ''; });
const go = async (page, hash) => { await page.evaluate((x) => { location.hash = x; }, hash); await page.waitForSelector('.about-foot [data-appver]'); await page.waitForTimeout(300); };

// ---------- Footer, metadata, About sheet ----------
{
  const { ctx, page } = await phone();
  await go(page, '#/me');
  const me = await footer(page);
  record('A1', 'Me shows Wavelength, version and build, copyright and an About link', me === 'Wavelength / Version 1.0.9 (15) / © 2026 Auda Medical Ltd / About Wavelength', me);
  await go(page, '#/settings');
  const set = await footer(page);
  record('A2', 'Settings shows the same footer', set === me, set);

  await page.click('[data-about]');
  await page.waitForSelector('.sheet .about-facts');
  const s = await page.evaluate(() => {
    const d = document.querySelector('.sheet');
    const facts = {}; const dts = d.querySelectorAll('.about-facts dt'); d.querySelectorAll('.about-facts dd').forEach((dd, i) => { facts[dts[i].textContent] = dd.textContent; });
    const links = [...d.querySelectorAll('.about-links a, .about-links button')].map((a) => ({ text: a.textContent, href: a.getAttribute('href'), h: a.getBoundingClientRect().height }));
    return { title: d.querySelector('h2').textContent, logo: !!d.querySelector('.about-head svg.mark'), facts, links, role: d.getAttribute('role'), labelled: d.getAttribute('aria-labelledby') === d.querySelector('h2').id };
  });
  record('A3', 'About sheet: logo, name, version, build, developer and website', s.logo && s.title === 'Wavelength POCUS Logbook' && s.facts.Version === '1.0.9' && s.facts.Build === '15' && s.facts.Developer === 'Auda Medical Ltd' && s.facts.Website === 'thewavelength.co.uk', JSON.stringify({ title: s.title, logo: s.logo, facts: s.facts }));
  const mail = (s.links.find((l) => l.text === 'Contact support') || {}).href || '';
  const body = decodeURIComponent((mail.split('body=')[1] || ''));
  record('A4', 'Contact support emails hello@ with version, platform and language only, never account details', mail.startsWith('mailto:hello@thewavelength.co.uk?') && /1\.0\.9 \(15\)/.test(body) && /android/.test(body) && !body.includes(email) && !body.includes('About'), JSON.stringify(body));
  const want = { 'Privacy policy': '/privacy/', 'Terms of use': '/app-terms/' };
  record('A5', 'Privacy policy, terms of use and open-source licences are listed', Object.entries(want).every(([k, v]) => s.links.some((l) => l.text === k && l.href === v)) && s.links.some((l) => l.text === 'Open-source licences'), s.links.map((l) => l.text + (l.href ? ' ' + l.href.slice(0, 40) : '')).join(' | '));
  record('A6', 'Sheet is a labelled dialog and every row is at least 48px tall', s.role === 'dialog' && s.labelled && s.links.every((l) => l.h >= 47.5), 'heights ' + s.links.map((l) => Math.round(l.h)).join(','));

  // Privacy opens in the in-app browser, not inside the logbook.
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.click('.about-links a[href="/privacy/"]');
  await page.waitForTimeout(300);
  const opened = await page.evaluate(() => window.__calls.filter((c) => c.plugin === 'Browser').map((c) => c.options.url));
  record('A7', 'Privacy policy opens the website in the in-app browser', opened.length === 1 && opened[0] === 'https://thewavelength.co.uk/privacy/' && /#\/settings/.test(page.url()), JSON.stringify(opened));

  // Licences, Back, Escape and focus return.
  await page.click('.about-links [data-lic]');
  await page.waitForSelector('.lic-list');
  const lic = await page.evaluate(() => ({ text: document.querySelector('.sheet').innerText, groups: [...document.querySelectorAll('.sheet h3')].map((x) => x.textContent) }));
  const has = ['Capacitor', '@capgo/capacitor-native-biometric', 'MPL', 'Cap-go/capacitor-native-biometric', 'AndroidX', 'jsPDF', '@noble/hashes', 'DM Sans', 'Cormorant Garamond'].filter((x) => !lic.text.includes(x));
  record('A8', 'Open-source licences list every component, grouped by licence, with the MPL source link', !has.length && ['MIT', 'MPL-2.0', 'Apache-2.0', 'OFL-1.1'].every((g) => lic.groups.includes(g)), 'groups ' + lic.groups.join(', ') + (has.length ? '; missing ' + has.join(', ') : ''));
  await page.click('.lic-text summary');
  const full = await page.evaluate(() => { const p = document.querySelector('.lic-text[open] pre'); return p ? p.textContent.slice(0, 40) + '… ' + p.textContent.length + ' chars' : ''; });
  record('A9', 'Full licence text opens', /Permission is hereby granted|MIT License/.test(full), full);
  await page.click('.sheet [data-back]');
  await page.waitForSelector('.sheet .about-facts');
  await page.waitForTimeout(150); // the sheet takes focus just after it opens
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const focus = await page.evaluate(() => ({ open: !!document.querySelector('.sheet-bg'), focused: document.activeElement && document.activeElement.hasAttribute('data-about') }));
  record('A10', 'Back returns to About; Escape closes it and focus returns to the About link', !focus.open && focus.focused, JSON.stringify(focus));
  await ctx.close();
}

// ---------- Version from the installed app's metadata, and the fallback ----------
{
  const { ctx, page } = await phone({ init: ['window.__appInfo = { name: "Wavelength", id: "uk.co.thewavelength.app", version: "9.8.7", build: "654" };'] });
  await go(page, '#/me');
  const f = await footer(page);
  record('A11', 'Version and build are read from the installed app metadata, not fixed in the code', f.includes('Version 9.8.7 (654)'), f);
  await ctx.close();
  const b = await phone({ init: ['window.__appInfoFail = true;'] });
  await go(b.page, '#/me');
  const g = await footer(b.page);
  record('A12', 'If the metadata cannot be read, the version the bundle was built with is shown', g.includes('Version 1.0.9 (15)'), g);
  await b.ctx.close();
}

// ---------- Offline ----------
{
  const { ctx, page } = await phone();
  net.offline = true;
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await go(page, '#/me');
  await page.click('[data-about]');
  await page.waitForSelector('.sheet .about-facts');
  await page.click('.about-links [data-lic]');
  const ok = await page.waitForSelector('.lic-list', { timeout: 5000 }).then(() => true, () => false);
  const v = await page.evaluate(() => document.querySelector('.about-foot [data-appver]').textContent);
  record('A13', 'Offline: footer, About and licences all open', ok && v === 'Version 1.0.9 (15)', 'licences ' + ok + ', footer ' + v);
  net.offline = false;
  await ctx.close();
}

// ---------- Arabic ----------
{
  const { ctx, page } = await phone({ lang: 'ar' });
  await go(page, '#/me');
  const f = await footer(page);
  await page.click('[data-about]');
  await page.waitForSelector('.sheet .about-facts');
  const s = await page.evaluate(() => ({ dir: document.documentElement.dir, text: document.querySelector('.sheet').innerText, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  record('A14', 'Arabic: footer and About are translated, right to left, with no overflow', s.dir === 'rtl' && !/About Wavelength|Version|Contact support|Privacy policy/.test(f + s.text) && /1\.0\.9/.test(f) && s.wide <= 1, f);
  await ctx.close();
}

await browser.close();
const bad = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|internetdisconnected/i.test(e));
record('A15', 'No page errors', !bad.length, bad.slice(0, 3).join(' | ') || 'none');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ run: new Date().toISOString(), results }, null, 2) + '\n');
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? failed + ' checks failed.' : 'All About checks passed.');
process.exit(failed ? 1 : 0);
