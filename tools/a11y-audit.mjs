// Accessibility audit against WCAG 2.2 AA (November 2026, for the accessibility statement and the DTAC pack).
// Runs axe-core (rules tagged wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) on every page in the sitemap, the noindex
// pages people use (verify, app sign-in, sign-off and assessment links), and every app screen in both themes. It also
// runs scripted checks that axe does not make:
//   1.4.10 reflow: no horizontal scrolling at 320 CSS pixels;
//   2.4.7 focus visible: each of the first 80 focusable elements shows a visible change when focused by keyboard;
//   2.4.11 focus not obscured: the focused element is not hidden behind the sticky header or a banner;
//   2.4.2 page titled and 3.1.1 language of page.
// CSP: it also records any Content-Security-Policy violation, so the same run proves the CSP does not break a page.
// Run against `npx wrangler dev --local --local-upstream localhost:8787` after `node build.js`.
// Needs: npm i --no-save playwright@1.56.1 axe-core@4.10.3
// Usage: node tools/a11y-audit.mjs <outdir> [base] [--quick]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { localOnly } from './local-only.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const QUICK = process.argv.includes('--quick');
const out = args[0] || 'a11y-audit';
const BASE = args[1] || 'http://localhost:8787';
localOnly(BASE, 'tools/a11y-audit.mjs');
fs.mkdirSync(out, { recursive: true });
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const results = []; // { page, theme, width, violations: [{id, impact, help, wcag, nodes: [target...]}], checks: [..], csp: [..], errors: [..] }

const browser = await chromium.launch();

async function newContext(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 1280, height: 900 }, locale: 'en-GB', colorScheme: opts.scheme || 'light', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page._wl = { csp: [], errors: [] };
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Content-Security-Policy/i.test(t)) page._wl.csp.push(t.slice(0, 300));
    else if (m.type() === 'error' && !/favicon|404|Failed to load resource/.test(t)) page._wl.errors.push(t.slice(0, 300));
  });
  page.on('pageerror', (e) => page._wl.errors.push(String(e).slice(0, 300)));
  // A violation report also lands here, in case the console message is worded differently.
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => console.error('Content Security Policy violation: ' + e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + (e.lineNumber || '') + ' sample: ' + (e.sample || ''))); });
  return { ctx, page };
}

async function axe(page) {
  // Injected through the DevTools protocol, not as a <script> tag, so the page's own CSP neither blocks it nor reports it.
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(AXE);
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, wcag: v.tags.filter((t) => /^wcag\d{3,}$/.test(t)), nodes: v.nodes.map((n) => [n.target.join(' '), (n.failureSummary || '').split('\n').slice(1, 2).join('').trim().slice(0, 160)]) }));
  }, TAGS);
}

// Keyboard focus: tab through the page and compare each focused element's outline, box-shadow, border and
// background with its unfocused look. Also checks that the focused element is not covered by something fixed.
async function focusChecks(page, limit = 80) {
  const issues = []; let stops = 0;
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.locator('body').focus().catch(() => {});
  // Each element is tagged on its first visit, so the walk stops only when focus comes back to the same element.
  await page.evaluate(() => document.querySelectorAll('[data-a11y-seen]').forEach((e) => e.removeAttribute('data-a11y-seen')));
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      if (el.hasAttribute('data-a11y-seen')) return { again: true };
      el.setAttribute('data-a11y-seen', '');
      const label = (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/s+/).slice(0, 2).join('.') : '') + (el.name ? '[name=' + el.name + ']' : '') + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30) + '"');
      const pick = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor, cs.textDecorationLine, cs.color].join('|');
      // The focus indicator may be drawn on the element, its label (custom radios and checkboxes) or a wrapping box
      // styled with :focus-within (search fields). Compare each with its look when the element is not focused.
      const parts = [el, el.parentElement, el.parentElement && el.parentElement.parentElement, ...(el.labels ? [...el.labels] : [])].filter(Boolean);
      const focused = parts.map((p) => pick(getComputedStyle(p))).join('#');
      el.blur();
      const plain = parts.map((p) => pick(getComputedStyle(p))).join('#');
      el.focus({ preventScroll: true });
      const cs = getComputedStyle(el);
      const visibleChange = focused !== plain || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0);
      // Judge position by the first line box (a link that wraps has a bounding box over other text), or by the label
      // when the control itself is visually hidden.
      let box = el.getClientRects()[0];
      const tiny = !box || box.width < 2 || box.height < 2;
      if (tiny && el.labels && el.labels[0]) box = el.labels[0].getClientRects()[0];
      let obscured = false, offscreen = !box;
      if (box) {
        if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) obscured = 'off-screen';
        else {
          const x = Math.min(innerWidth - 1, Math.max(0, box.left + Math.min(box.width / 2, 8))); const y = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
          const top = document.elementFromPoint(x, y);
          const mine = (n) => n && (n === el || el.contains(n) || n.contains(el) || (el.labels && [...el.labels].some((l) => l === n || l.contains(n) || n.contains(l))));
          if (top && !mine(top)) obscured = 'covered by ' + top.tagName.toLowerCase() + (typeof top.className === 'string' && top.className ? '.' + top.className.trim().split(/s+/)[0] : '');
        }
      }
      if (el.matches('.skip, .skip-link, [class*=skip]')) obscured = false;
      return { label, visibleChange, obscured, offscreen };
    });
    if (!r) continue;
    if (r.again) break; // wrapped round
    stops++;
    // Menus and the sliding header animate; measure again once they have settled before calling it covered.
    if (r.obscured) {
      await page.waitForTimeout(400);
      r.obscured = await page.evaluate(() => {
        const el = document.activeElement; let box = el.getClientRects()[0];
        if ((!box || box.width < 2 || box.height < 2) && el.labels && el.labels[0]) box = el.labels[0].getClientRects()[0];
        if (!box) return false;
        if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) return 'off-screen';
        const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, box.left + Math.min(box.width / 2, 8))), Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2)));
        const mine = (n) => n && (n === el || el.contains(n) || n.contains(el) || (el.labels && [...el.labels].some((l) => l === n || l.contains(n) || n.contains(l))));
        return top && !mine(top) ? 'covered by ' + top.tagName.toLowerCase() + (typeof top.className === 'string' && top.className ? '.' + top.className.trim().split(/s+/)[0] : '') : false;
      });
    }
    if (!r.visibleChange && !r.offscreen) issues.push('2.4.7 no visible focus change: ' + r.label);
    if (r.obscured) issues.push('2.4.11 focused element ' + r.obscured + ': ' + r.label);
  }
  page._wl.stops = stops;
  return issues;
}

async function pageChecks(page) {
  // The site header hides when scrolling down; a keyboard user who tabs back into it must still see it.
  const header = await page.evaluate(async () => {
    const h = document.querySelector('.site-header'); const link = h && h.querySelector('a[href]');
    if (!h || !link || document.documentElement.scrollHeight < innerHeight * 2) return null;
    window.scrollTo(0, 600); await new Promise((r) => setTimeout(r, 60)); window.scrollTo(0, 1400); await new Promise((r) => setTimeout(r, 400));
    link.focus(); await new Promise((r) => setTimeout(r, 400));
    const b = link.getBoundingClientRect(); const ok = b.bottom > 0 && b.top < innerHeight;
    link.blur(); window.scrollTo(0, 0);
    return ok ? null : '2.4.11 header link off-screen when focused after scrolling down';
  });
  return page.evaluate((header) => {
    const issues = header ? [header] : [];
    if (!document.title.trim()) issues.push('2.4.2 no page title');
    if (!document.documentElement.lang) issues.push('3.1.1 no lang on <html>');
    return issues;
  }, header);
}

async function reflow(page) {
  const vp = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth > innerWidth + 1;
    if (!over) return null;
    const wide = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > innerWidth + 1 && b.width > 0 && getComputedStyle(e).position !== 'fixed' && !e.closest('table, pre, code, [data-scroll-x], .table-wrap'); }).slice(0, 3).map((e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : ''));
    return '1.4.10 horizontal scroll at 320px: ' + document.documentElement.scrollWidth + 'px wide (' + wide.join(', ') + ')';
  });
  await page.setViewportSize(vp);
  return r ? [r] : [];
}

async function audit(page, name, theme, opts = {}) {
  page._wl.stops = null;
  await page.waitForTimeout(opts.wait ?? 300);
  const violations = await axe(page);
  const checks = [...(await pageChecks(page)), ...(opts.focus === false ? [] : await focusChecks(page)), ...(opts.reflow === false ? [] : await reflow(page))];
  const textLen = await page.evaluate(() => document.body.innerText.trim().length);
  results.push({ page: name, theme, textLen, focusStops: page._wl.stops, violations, checks, csp: page._wl.csp.splice(0), errors: page._wl.errors.splice(0) });
  process.stdout.write(`${violations.length || checks.length ? '!' : '.'}`);
}

// ---------- Website ----------
const sitemap = fs.readFileSync(path.join('dist', 'sitemap.xml'), 'utf8');
let sitePages = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
// Pages people use that are noindex or out of the sitemap.
sitePages.push('/verify/', '/app/verify/', '/elearning/verify/', '/learn/test/', '/does-not-exist/', '/subscribe/thanks/', '/booked/', '/admin/login/');
const testPage = sitePages.find((p) => /^\/learn\/[^/]+\/$/.test(p) && p !== '/learn/test/');
if (testPage) sitePages.push(testPage + 'test/');
for (const g of ['/guides/rcem-ultrasound-sign-off/at-a-glance/']) if (fs.existsSync(path.join('dist', g, 'index.html'))) sitePages.push(g);
// New pages in this branch, once built.
for (const p of ['/accessibility/', '/trust/', '/clinical-safety/']) if (fs.existsSync(path.join('dist', p, 'index.html')) && !sitePages.includes(p)) sitePages.push(p);
sitePages = [...new Set(sitePages)];
if (QUICK) {
  const keep = new Set(['/', '/courses/', '/learn/', '/guides/', '/pocus-logbook/', '/app/get/', '/about/', '/contact/', '/privacy/', '/app-terms/', '/verify/', '/fr/', '/ar/', '/accessibility/', '/trust/', '/clinical-safety/', '/departments/', '/training/', '/contact/', '/admin/login/', '/does-not-exist/']);
  sitePages = sitePages.filter((p) => keep.has(p) || p === testPage || p === (testPage || '') + 'test/' || /^\/elearning\/[^/]+\/$/.test(p) && !keep.has('el') && keep.add('el') || /^\/courses\/[^/]+\/$/.test(p) && !keep.has('c') && keep.add('c') || /^\/guides\/[^/]+\/$/.test(p) && !keep.has('g') && keep.add('g'));
}
console.log(`Website: ${sitePages.length} pages`);
{
  const { ctx, page } = await newContext();
  for (const p of sitePages) {
    const res = await page.goto(BASE + p, { waitUntil: 'load' }).catch((e) => ({ status: () => 'ERR ' + e.message }));
    const st = res && res.status ? res.status() : '?';
    // Focus checks on a sample (they are slow); axe and reflow everywhere.
    const focus = QUICK || !/^\/learn\/[^/]+\/$/.test(p) || p === testPage;
    await audit(page, `${p} [${st}]`, 'site', { focus });
  }
  await ctx.close();
}

// ---------- App, both themes ----------
const post = (page, p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const t = Date.now();
let signLink = null;
for (const theme of ['light', 'dark']) {
  console.log(`\nApp (${theme})`);
  const { ctx, page } = await newContext({ width: 390, scheme: theme });
  for (const [name, hash] of [['welcome', ''], ['login', '#/login'], ['signup', '#/signup']]) {
    await page.goto(BASE + '/app/' + hash); await page.waitForSelector('#app .auth, #app form', { timeout: 15000 }).catch(() => {});
    await audit(page, 'app ' + name, theme);
  }
  const email = `a11y${theme}${t}@example.com`;
  let r = await post(page, '/api/app/signup', { firstName: 'Alex', lastName: 'Access', email, password: 'Long-password-1', terms: true });
  if (!r.ok) { console.log('signup failed', JSON.stringify(r)); await ctx.close(); continue; }
  await post(page, '/api/app/profile', { declaration: true, profile: { pathways: ['rcem', 'famus'], grade: 'ST5', onboarded: true }, organisation: 'Test Hospital' });
  const entries = [];
  for (let i = 0; i < 4; i++) entries.push({ id: 'ax' + theme + t.toString(36) + i, type: i < 3 ? 'efast' : 'aaa', date: `2026-0${i + 3}-1${i}`, setting: 'Emergency department', supervision: i % 2 ? 'direct' : 'indirect', overall: i === 1 ? 'Abnormal' : 'Normal', quality: 'Good', supervisor: 'Dr Lee', indication: 'Trauma', interpretation: 'No free fluid', findings: { ruq: 'No free fluid' } });
  await post(page, '/api/app/sync', { entries });
  const so = await post(page, '/api/app/signoff/request', { entryIds: [entries[0].id], supervisorName: 'Dr Lee' });
  if (so && so.link && !signLink) { const u = new URL(so.link); signLink = u.pathname + u.hash; }
  const screens = [['home', ''], ['logbook', '#/log'], ['scan', '#/entry/' + entries[1].id], ['new scan', '#/new'], ['progress', '#/progress'], ['me', '#/me'], ['settings', '#/settings'],
    ['export', '#/export'], ['evidence', '#/evidence'], ['backup', '#/backup'], ['targets', '#/targets'], ['assess', '#/assess'], ['supervisors', '#/supervisors'], ['supervise', '#/supervise'], ['outstanding', '#/outstanding'], ['guides', '#/guides']];
  for (const [name, hash] of screens) {
    await page.evaluate(() => document.querySelectorAll('form[data-dirty]').forEach((f) => delete f.dataset.dirty)).catch(() => {});
    await page.goto(BASE + '/app/' + hash); await page.waitForSelector('nav.tabs', { timeout: 15000 }).catch(() => {});
    if (name === 'logbook') await page.waitForSelector('.entry', { timeout: 5000 }).catch(() => {});
    await audit(page, 'app ' + name, theme, { wait: 500 });
  }
  await ctx.close();
}

// Supervisor's sign-off link page (light only: it does not load the theme).
if (signLink) {
  const { ctx, page } = await newContext({ width: 390 });
  await page.goto(BASE + signLink); await page.waitForSelector('#sf', { timeout: 15000 }).catch(() => {});
  await audit(page, 'sign-off link page', 'light');
  await ctx.close();
}

await browser.close();

// ---------- Report ----------
const byRule = new Map();
for (const r of results) for (const v of r.violations) {
  const k = v.id; const e = byRule.get(k) || { id: v.id, impact: v.impact, help: v.help, wcag: v.wcag, pages: [], examples: [] };
  e.pages.push(`${r.page}${r.theme === 'site' ? '' : ' (' + r.theme + ')'}`); if (e.examples.length < 6) e.examples.push(...v.nodes.slice(0, 2).map((n) => `${r.page}: ${n[0]} ${n[1]}`));
  byRule.set(k, e);
}
const checkCounts = new Map();
for (const r of results) for (const c of r.checks) { const k = c.replace(/:.*/, ''); const e = checkCounts.get(k) || { n: 0, ex: [] }; e.n++; if (e.ex.length < 8) e.ex.push(`${r.page} (${r.theme}): ${c}`); checkCounts.set(k, e); }
const csp = results.filter((r) => r.csp.length);
const errs = results.filter((r) => r.errors.length);
const lines = [];
lines.push(`# Accessibility audit, WCAG 2.2 AA (automated and scripted)`, '', `Run: ${new Date().toISOString()} against ${BASE}. Pages and screens audited: ${results.length} (${results.filter((r) => r.theme === 'site').length} website pages; ${results.filter((r) => r.theme !== 'site').length} app and link screens in light and dark).`, `axe-core rules: tags ${TAGS.join(', ')}.`, '');
lines.push(`## axe-core violations (${byRule.size} rules)`, '');
for (const e of [...byRule.values()].sort((a, b) => b.pages.length - a.pages.length)) {
  lines.push(`### ${e.id} (${e.impact}; WCAG ${e.wcag.join(', ') || 'n/a'}): ${e.help}`, `Pages: ${e.pages.length}. First: ${e.pages.slice(0, 8).join('; ')}`, ...e.examples.map((x) => `- ${x}`), '');
}
lines.push(`## Scripted checks`, '');
for (const [k, e] of checkCounts) lines.push(`### ${k}: ${e.n}`, ...e.ex.map((x) => `- ${x}`), '');
const thin = results.filter((r) => r.textLen < 80);
 lines.push(`## Screens with almost no text (check they rendered): ${thin.length}`, ...thin.map((r) => `- ${r.page} (${r.theme}): ${r.textLen} characters`), '');
lines.push(`## Content-Security-Policy violations: ${csp.length} pages`, ...csp.slice(0, 20).map((r) => `- ${r.page} (${r.theme}): ${r.csp.join(' | ')}`), '');
lines.push(`## Script errors: ${errs.length} pages`, ...errs.slice(0, 20).map((r) => `- ${r.page} (${r.theme}): ${r.errors.join(' | ')}`), '');
fs.writeFileSync(path.join(out, 'a11y-report.md'), lines.join('\n'));
fs.writeFileSync(path.join(out, 'a11y-results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length} audited; ${byRule.size} axe rules failing; scripted issues ${[...checkCounts.values()].reduce((a, e) => a + e.n, 0)}; CSP violations on ${csp.length} pages; script errors on ${errs.length} pages. Report: ${path.join(out, 'a11y-report.md')}`);
