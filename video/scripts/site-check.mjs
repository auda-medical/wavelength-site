// Website checks for the commercial changes, in Chrome against the local filming world (the built site and the real
// Worker): for each page at 390 and 1440 pixels wide, horizontal overflow, console errors, images without alt text,
// form fields without labels, heading order, structured data that does not parse, and internal links that answer
// 404; then a real enquiry submitted through the new form, the measurement beacon, and the objection switch.
// Screenshots go to <out>/. Writes <out>/site-check.json.
//   node --import ../test/helpers/register.mjs scripts/site-check.mjs <out>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startWorld } from './world.mjs';

const OUT = path.resolve(process.argv[2] || 'site-check');
fs.mkdirSync(OUT, { recursive: true });
const w = await startWorld(8798);
const browser = await chromium.launch({ channel: 'chrome' });
const PAGES = ['/', '/training/', '/courses/', '/courses/core-emergency-ultrasound/', '/pocus-logbook/', '/app/get/', '/contact/', '/privacy/', '/fr/', '/ar/', '/training/thanks/'];
const results = [];
const linkStatus = new Map();
for (const width of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const res = await page.goto(w.base + p, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const noAlt = [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.src).slice(0, 5);
      const unlabelled = [...document.querySelectorAll('input:not([type=hidden]):not([tabindex="-1"]), select, textarea')].filter((el) => !el.closest('label') && !(el.id && document.querySelector(`label[for="${el.id}"]`)) && !el.getAttribute('aria-label')).map((el) => el.name || el.type).slice(0, 5);
      const hs = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
      let skip = 0; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skip++;
      const h1 = hs.filter((x) => x === 1).length;
      let ld = 0, ldBad = 0; for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { ld++; try { JSON.parse(s.textContent); } catch { ldBad++; } }
      const links = [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href').split('#')[0]).filter(Boolean))];
      const ctas = [...document.querySelectorAll('.cta-caps')].map((a) => a.textContent.trim().replace(/\s+/g, ' '));
      return { overflow, noAlt, unlabelled, headingSkips: skip, h1, ld, ldBad, links, ctas, title: document.title, description: (document.querySelector('meta[name=description]') || {}).content || '' };
    });
    for (const l of info.links) if (!linkStatus.has(l)) linkStatus.set(l, null);
    await page.screenshot({ path: path.join(OUT, `${width}-${p.replace(/\W+/g, '_') || 'home'}.png`), fullPage: false });
    results.push({ page: p, width, status: res.status(), errors: errs, ...info, links: info.links.length });
    await page.close();
  }
  await ctx.close();
}
for (const l of linkStatus.keys()) { const r = await fetch(w.base + l, { redirect: 'manual' }); linkStatus.set(l, r.status); }
const broken = [...linkStatus].filter(([, s]) => s >= 400);

// A real enquiry through the browser, from an international individual (no organisation), with a campaign link.
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
await page.goto(w.base + '/training/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-site-check#enquire');
await page.waitForTimeout(700);
await page.fill('input[name=first_name]', 'Test');
await page.fill('input[name=last_name]', 'Enquirer');
await page.fill('input[name=email]', 'test.enquirer@example.com');
await page.fill('input[name=phone]', '+353 1 234 5678');
await page.selectOption('select[name=enquiry_type]', { label: 'Myself, as an individual' });
await page.selectOption('select[name=country]', { label: 'Ireland' });
await page.check('input[name=topics][value="Lung ultrasound"]');
await page.selectOption('select[name=group_size]', { label: '1' });
await page.selectOption('select[name=heard]', { label: 'LinkedIn' });
await page.fill('textarea[name=details]', 'Site check: fictional enquiry.');
await page.check('input[name=confirm_privacy]');
await Promise.all([page.waitForURL(/\/training\/thanks\//), page.click('form[action="/api/training/enquire"] button[type=submit]')]);
await page.screenshot({ path: path.join(OUT, 'enquiry-thanks.png') });
await page.waitForTimeout(500);
const row = await w.env.DB.prepare('SELECT country, region, enquiry_class, organisation, heard, campaign, topics FROM department_enquiries ORDER BY id DESC LIMIT 1').first();
const counters = (await w.env.DB.prepare('SELECT metric, dim, SUM(n) AS n FROM metric_daily GROUP BY metric, dim').all()).results;
// Objection switch on the privacy page, then a page view that must not be counted.
await page.goto(w.base + '/privacy/'); await page.waitForTimeout(400);
await page.click('[data-measure-toggle]'); await page.waitForTimeout(200);
const stored = await page.evaluate(() => localStorage.getItem('wl-measure'));
const before = (await w.env.DB.prepare("SELECT SUM(n) AS n FROM metric_daily WHERE metric = 'pv'").first()).n;
await page.goto(w.base + '/courses/'); await page.waitForTimeout(800);
const after = (await w.env.DB.prepare("SELECT SUM(n) AS n FROM metric_daily WHERE metric = 'pv'").first()).n;
await ctx.close();

const summary = {
  pages: results.length,
  overflow: results.filter((r) => r.overflow > 1).map((r) => `${r.page}@${r.width}: ${r.overflow}px`),
  consoleErrors: results.filter((r) => r.errors.length).map((r) => `${r.page}@${r.width}: ${r.errors[0]}`),
  imagesWithoutAlt: results.filter((r) => r.noAlt.length).map((r) => `${r.page}@${r.width}`),
  unlabelledFields: results.filter((r) => r.unlabelled.length).map((r) => `${r.page}@${r.width}: ${r.unlabelled.join(',')}`),
  headingSkips: results.filter((r) => r.headingSkips).map((r) => `${r.page}@${r.width}: ${r.headingSkips}`),
  pagesWithoutOneH1: results.filter((r) => r.h1 !== 1).map((r) => `${r.page}@${r.width}: ${r.h1}`),
  badStructuredData: results.filter((r) => r.ldBad).map((r) => r.page),
  brokenInternalLinks: broken,
  enquiry: row,
  measuredVisitCampaign: counters.filter((c) => c.metric === 'visit.campaign'),
  enquiryConversions: counters.filter((c) => c.metric.startsWith('conv.')),
  objection: { stored, pageViewsBefore: before, pageViewsAfter: after, counted: after !== before },
  ctas: Object.fromEntries(results.filter((r) => r.width === 1440).map((r) => [r.page, r.ctas])),
  titles: Object.fromEntries(results.filter((r) => r.width === 1440).map((r) => [r.page, `${r.title} (${r.title.length})`])),
};
fs.writeFileSync(path.join(OUT, 'site-check.json'), JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
w.server.close();
process.exit(0);
