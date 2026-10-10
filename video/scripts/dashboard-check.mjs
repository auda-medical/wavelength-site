// Browser check of the private business dashboard (/admin/business/) with FICTIONAL data, against the local filming
// world (built site plus the real Worker, node:sqlite standing in for D1; never production). Seeds 60 days of
// measured visits from the real beacon rules, manual bookings, ledger lines, owner time and the opportunity register,
// then opens every tab at 1440 and 390 pixels wide and checks for horizontal overflow, console errors, "undefined",
// "NaN" and double-encoded characters. Screenshots and dashboard-check.json go to <outdir>.
//   node build.js, then in video/: node --import ../test/helpers/register.mjs scripts/dashboard-check.mjs <outdir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startWorld } from './world.mjs';
import { beaconRows } from '../../worker/metrics.js';
import { hashPassword } from '../../worker/app-util.js';
import SITE from '../../worker/site-data.json' with { type: 'json' };

// Node has no HTMLRewriter: the same stand-in as test/business-analytics.test.mjs, enough for the admin shell.
globalThis.HTMLRewriter ||= class {
  on(sel, h) { this.h = h; return this; }
  transform(res) {
    let inner = '';
    this.h.element({ setInnerContent: (c) => { inner = c; } });
    const body = new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode((await res.text()).replace('<div id="admin-root"></div>', `<div id="admin-root">${inner}</div>`))); c.close(); } });
    return new Response(body, { headers: res.headers });
  }
};
const OUT = path.resolve(process.argv[2] || 'business-check');
fs.mkdirSync(OUT, { recursive: true });
const w = await startWorld(8796);
const { env, base } = w;
const ADMIN_PW = 'Fictional admin pw 2026';
for (const [k, v] of [['volunteer_username', 'volunteer'], ['volunteer_hash', await hashPassword('Fictional volunteer pw 2026')], ['session_secret', 'fictional-secret'], ['admin_username', 'wavelength'], ['admin_hash', await hashPassword(ADMIN_PW)]]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();

// Fictional measured traffic: a seeded random walk over 60 days, turned into counter rows by the Worker's own rules.
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const PATHS = ['/', '/training/', '/courses/', '/courses/core-emergency-ultrasound/', '/pocus-logbook/', '/app/get/', '/learn/', '/guides/pocus-accreditation/'];
const REFS = [['https://www.google.com/', {}], ['https://www.linkedin.com/', {}], ['', {}], ['', { source: 'linkedin', medium: 'social', campaign: '2026-11-flagship-film' }], ['', { source: 'newsletter', medium: 'email', campaign: '2026-11-core-21dec' }], ['https://www.bing.com/', {}], ['', { source: 'qr', medium: 'qr', campaign: '2026-12-course-day' }]];
const UAS = ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'];
const counts = new Map();
const add = (day, metric, dim) => { const k = `${day}|${metric}|${dim}`; counts.set(k, (counts.get(k) || 0) + 1); };
const today = new Date();
for (let back = 59; back >= 0; back--) {
  const day = new Date(today.getTime() - back * 864e5).toISOString().slice(0, 10);
  const n = Math.round(14 + 10 * Math.sin(back / 6) + rnd() * 12 + (59 - back) * 0.2);
  for (let i = 0; i < n; i++) {
    const [r, u] = pick(REFS);
    for (const [metric, dim] of beaconRows({ t: 'pv', p: pick(PATHS), r, u }, { country: pick(['GB', 'GB', 'GB', 'IE', 'AE', 'IN']), ua: pick(UAS) })) add(day, metric, dim);
    if (rnd() < 0.3) add(day, 'pv', ''), add(day, 'pv.path', pick(PATHS));
    if (rnd() < 0.08) add(day, 'ev.cta', pick(['home-courses', 'home-logbook', 'home-tailored']));
    if (rnd() < 0.03) add(day, 'ev.book', '/courses/core-emergency-ultrasound/');
    if (rnd() < 0.02) add(day, 'ev.enquiry_start', 'training');
  }
  if (rnd() < 0.25) add(day, 'conv.signup', 'app');
}
for (const [k, n] of counts) { const [day, metric, dim] = k.split('|'); await env.DB.prepare('INSERT INTO metric_daily (day, metric, dim, n) VALUES (?, ?, ?, ?) ON CONFLICT (day, metric, dim) DO UPDATE SET n = n + excluded.n').bind(day, metric, dim, n).run(); }
await env.DB.prepare("INSERT OR REPLACE INTO business_settings (key, value) VALUES ('web_start', ?), ('app_start', ?)").bind(new Date(today.getTime() - 59 * 864e5).toISOString().slice(0, 10), new Date(today.getTime() - 59 * 864e5).toISOString().slice(0, 10)).run().catch(() => {});

// Owner entries through the dashboard's own forms.
const login = new FormData(); login.append('username', 'wavelength'); login.append('password', ADMIN_PW);
const lr = await fetch(base + '/admin/login/', { method: 'POST', body: login, headers: { Origin: base }, redirect: 'manual' });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
if (!cookie.includes('=')) throw new Error('admin login failed: ' + lr.status);
const post = async (tab, o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); const r = await fetch(`${base}/admin/business/${tab}/`, { method: 'POST', body: f, headers: { Cookie: cookie, Origin: base }, redirect: 'manual' }); return decodeURIComponent((r.headers.get('location') || '').split('m=')[1] || '').replace(/\+/g, ' '); };
const d = (back) => new Date(today.getTime() - back * 864e5).toISOString().slice(0, 10);
const course = SITE.courses[0], date = course.dates[0];
const log = [];
log.push(await post('settings', { action: 'settings', vat_registered: 'no', target_margin: '35' }));
for (const [back, places, gross] of [[40, 2, '790'], [25, 1, '395'], [12, 3, '1185'], [3, 1, '395']]) log.push(await post('courses', { action: 'booking_add', course: `${course.slug}@${date.date}`, status: 'paid', source: 'invoice', places: String(places), gross, reference: `FICT-${back}` }));
for (const [back, category, stream, amount, desc] of [[30, 'venue', 'courses', '600', 'Fictional room hire'], [28, 'equipment', 'courses', '150', 'Fictional probe cover stock'], [20, 'faculty', 'courses', '400', 'Fictional faculty fee'], [15, 'software', '', '12', 'Fictional software'], [10, 'marketing', '', '45', 'Fictional leaflet print']]) log.push(await post('finance', { action: 'ledger_add', entry_date: d(back), category, stream, service: category === 'venue' ? `course:${course.slug}@${date.date}` : 'general', amount, vat: '0', vat_treatment: 'exempt', basis: 'estimate', description: desc }));
for (const [back, activity, hours] of [[30, 'delivery', '8'], [29, 'preparation', '3'], [14, 'marketing', '2'], [7, 'admin', '1.5']]) log.push(await post('time', { action: 'time_add', work_date: d(back), activity, stream: 'courses', hours }));
log.push(await post('opportunities', { action: 'opp_seed' }));

// Every tab, two widths.
const TABS = ['', 'website', 'logbook', 'supervision', 'courses', 'training', 'finance', 'time', 'marketing', 'opportunities', 'monthly', 'settings'];
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), domain: new URL(base).hostname, path: '/admin' }]);
  for (const tab of TABS) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const res = await page.goto(`${base}/admin/business/${tab ? tab + '/' : ''}?range=90d`, { waitUntil: 'load' });
    const info = await page.evaluate(() => {
      const t = document.body.innerText;
      const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest('.biz-scroll,.table-wrap,[style*="overflow"]')).slice(0, 3).map((el) => el.tagName + '.' + el.className);
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide, undef: /undefined|NaN/.test(t), mojibake: /Â[ -¿]|â€|Ã[\u0080-¿]/.test(t), title: document.title, h: (document.querySelector('h1,h2') || {}).textContent || '' };
    });
    await page.screenshot({ path: path.join(OUT, `${width}-${tab || 'overview'}.png`), fullPage: true });
    results.push({ tab: tab || 'overview', width, status: res.status(), errors: errs, ...info });
    await page.close();
  }
  await ctx.close();
}
const summary = {
  seeded: { counterRows: counts.size, entries: log },
  tabs: results.length,
  notOk: results.filter((r) => r.status !== 200).map((r) => `${r.tab}@${r.width}: ${r.status}`),
  overflow: results.filter((r) => r.overflow > 1).map((r) => `${r.tab}@${r.width}: ${r.overflow}px ${r.wide.join(' ')}`),
  consoleErrors: results.filter((r) => r.errors.length).map((r) => `${r.tab}@${r.width}: ${r.errors[0]}`),
  undefinedOrNaN: results.filter((r) => r.undef).map((r) => `${r.tab}@${r.width}`),
  doubleEncoded: results.filter((r) => r.mojibake).map((r) => `${r.tab}@${r.width}`),
};
fs.writeFileSync(path.join(OUT, 'dashboard-check.json'), JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
w.server.close();
process.exit(0);
