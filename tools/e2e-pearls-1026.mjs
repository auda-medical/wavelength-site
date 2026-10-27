// Browser checks for the 26 October 2026 Pearls and Academy release (14 Pearls from the owner's two sets of graphics): every new Pearl page and test,
// the newsletter issue and its answer links, the changed Academy lessons for a registered learner, and mobile
// layout. Needs the local Worker serving the built site:
//   node build.js && node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8801 --site
//   node tools/e2e-pearls-1026.mjs <outdir> [http://localhost:8801]
// READ_ONLY=1 skips the Academy section (it registers a learner), for checks against production.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.resolve(process.argv[2] || 'e2e-pearls-1026'); fs.mkdirSync(OUT, { recursive: true });
const BASE = process.argv[3] || 'http://localhost:8801';
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', typeof detail === 'string' ? detail : JSON.stringify(detail)); };
const NEW = ['portal-venous-gas-pneumobilia-ultrasound', 'cauda-equina-bladder-ultrasound', 'ivc-thrombus-ultrasound', 'achilles-xanthoma-ultrasound', 'pyelonephritis-ultrasound', 'pyloric-stenosis-ultrasound', 'appendix-testis-torsion-ultrasound',
  'neck-lump-node-or-abscess-ultrasound', 'paracentesis-ultrasound', 'retained-products-of-conception-ultrasound', 'diverticulitis-ultrasound', 'hydrocele-scrotal-fluid-ultrasound', 'suprapubic-catheter-ultrasound', 'ascites-ultrasound'];
const queue = JSON.parse(fs.readFileSync('data/pearl-issues.json', 'utf8')).issues.filter((x) => NEW.includes(x.slug));
if (queue.length !== 14) throw new Error('queue: ' + queue.length);
const browser = await chromium.launch();
const errors = [];
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); };

// P: every new Pearl, desktop and phone.
for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); watch(page);
  const bad = [];
  for (const it of queue) {
    const r = await page.goto(`${BASE}/learn/${it.slug}/`); await page.waitForLoadState('load');
    // The graphic may be lazy-loaded below the fold on a phone: bring it into view and wait for it.
    await page.evaluate(() => { const i = document.querySelector('main img[src*="-pearl.webp"]'); if (i) { i.loading = 'eager'; i.scrollIntoView(); } });
    await page.waitForFunction(() => { const i = document.querySelector('main img[src*="-pearl.webp"]'); return !i || (i.complete && i.naturalWidth > 0); }, null, { timeout: 15000 }).catch(() => {});
    const m = await page.evaluate(() => {
      const img = document.querySelector('main img[src*="-pearl.webp"]');
      return {
        h1: (document.querySelector('h1') || {}).textContent || '',
        img: img ? { ok: img.complete && img.naturalWidth > 1000, alt: img.alt.length } : null,
        disclosure: /illustrations, not patient scans/.test(document.body.innerText),
        over: document.documentElement.scrollWidth > innerWidth + 1,
        og: (document.querySelector('meta[property="og:image"]') || {}).content || '',
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { return JSON.parse(s.textContent)['@type']; } catch { return 'bad'; } }),
        dash: /[–—]/.test(document.querySelector('main').innerText),
        test: !!document.querySelector(`a[href$="/test/"]`),
      };
    });
    const og = m.og ? await page.request.get(m.og.replace('https://thewavelength.co.uk', BASE)) : null;
    const ok = r.status() === 200 && m.h1 && m.img && m.img.ok && m.img.alt > 20 && m.disclosure && !m.over && og && og.status() === 200 && m.canonical.endsWith(`/learn/${it.slug}/`) && !m.ld.includes('bad') && !m.dash && m.test;
    if (!ok) bad.push({ slug: it.slug, status: r.status(), ...m, og: og && og.status() });
    if (label === 'phone' && ['cauda-equina-bladder-ultrasound', 'achilles-xanthoma-ultrasound', 'portal-venous-gas-pneumobilia-ultrasound'].includes(it.slug)) await page.screenshot({ path: path.join(OUT, `P-${it.slug}-phone.png`), fullPage: false });
  }
  record(`P-${label}`, `${label}: all 14 new Pearl pages load with the graphic, alt text, the illustration note, link preview image, canonical, structured data, a test link, no dashes and no sideways scroll`, !bad.length, bad.length ? bad : `${queue.length} pages`);
  await ctx.close();
}

// T: every test page has five questions, one correct answer each, and ?q=1&a=<letter> marks the answer on arrival.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); watch(page);
  const bad = [];
  for (const it of queue) {
    await page.goto(`${BASE}/learn/${it.slug}/test/`);
    const q = await page.evaluate(() => [...document.querySelectorAll('.quiz')].map((z) => ({ opts: z.querySelectorAll('.quiz-opt').length, correct: z.querySelectorAll('.quiz-opt[data-correct]').length })));
    const robots = await page.evaluate(() => (document.querySelector('meta[name=robots]') || {}).content || '');
    const letter = await page.evaluate(() => document.querySelector('#q1 .quiz-opt[data-correct] .quiz-l').textContent);
    await page.goto(`${BASE}/learn/${it.slug}/test/?q=1&a=${letter}`); await page.waitForTimeout(400);
    const marked = await page.evaluate(() => { const b = document.querySelector('#q1 .quiz-opt[data-correct]'); const z = document.querySelector('#q1'); return { cls: b.className, aria: b.getAttribute('aria-pressed'), open: !!(z.querySelector('details[open]')), anyState: z.className }; });
    const markedOk = /right|correct|chosen|is-/.test(marked.cls + ' ' + marked.anyState) || marked.open || marked.aria === 'true';
    if (q.length !== 5 || q.some((x) => x.opts !== 4 || x.correct !== 1) || !/noindex/.test(robots) || !markedOk) bad.push({ slug: it.slug, q, robots, marked });
  }
  record('T', 'All 14 tests: five questions, four options and one correct answer each, noindex, and the email answer link marks the answer on arrival', !bad.length, bad.length ? bad : '14 tests');
  await ctx.close();
}

// E: the newsletter issue (issue 1) and its links.
{
  const ctx = await browser.newContext({ viewport: { width: 600, height: 1000 } }); const page = await ctx.newPage(); watch(page);
  const issue = JSON.parse(fs.readFileSync('src/email/pearl/issue.json', 'utf8'));
  await page.goto(`${BASE}/email/pearl/`);
  const e = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, links: [...document.querySelectorAll('a[href]')].map((a) => a.href), imgs: [...document.querySelectorAll('img')].map((i) => i.src), answers: [...document.querySelectorAll('a[href*="q=1&a="]')].map((a) => [a.href.match(/a=([a-d])/)[1], a.textContent.replace(/\s+/g, ' ').trim()]) }));
  const learn = e.links.filter((l) => /\/learn\//.test(l));
  const wrong = learn.filter((l) => !l.includes(`/learn/${issue.slug}/`));
  const imgOk = []; for (const s of e.imgs) { const r = await page.request.get(s.replace('https://thewavelength.co.uk', BASE)); imgOk.push(r.status()); }
  await page.goto(`${BASE}/learn/${issue.slug}/test/`);
  const built = await page.evaluate(() => [...document.querySelectorAll('#q1 .quiz-opt')].map((b) => [b.querySelector('.quiz-l').textContent, b.querySelector('span:last-child').textContent.trim()]));
  const same = JSON.stringify(built.map(([l, t]) => [l, `${l} ${t}`])) === JSON.stringify(e.answers.map(([l, t]) => [l, t]));
  // The week's campaign tag: pearl-<key> from the queue (was fixed to tamponade, the first issue).
  const tag = 'pearl-' + ((JSON.parse(fs.readFileSync(new URL('../data/pearl-issues.json', import.meta.url), 'utf8')).issues.find((x) => x.slug === issue.slug) || {}).key || 'tamponade');
  const camp = e.links.filter((l) => /utm_campaign=/.test(l)).every((l) => l.includes('utm_campaign=' + tag));
  record('E1', `Newsletter issue: "${e.h1}", every learn link goes to ${issue.slug}, every campaign tag is ${tag}, images load`, e.h1 === issue.subject && !wrong.length && camp && imgOk.every((s) => s === 200), { wrong, imgOk, camp });
  record('E2', 'The four answer buttons in the email match the built test page, letter for letter', same && e.answers.length === 4, { email: e.answers, built });
  await page.goto(`${BASE}/email/pearl/`); await page.screenshot({ path: path.join(OUT, 'E-issue.png'), fullPage: true });
  await ctx.close();
}

// A: changed Academy lessons for a registered learner (desktop and phone).
if (process.env.READ_ONLY !== '1') {
  const lessons = [['abdomen', 'kidneys', /Pyelonephritis: a normal kidney can be infected/i], ['abdomen', 'bowel', /Gas in the liver: portal or biliary/i], ['biliary-bladder', 'retention', /post-void residual in suspected cauda equina/i], ['cardiac', 'right-heart-venous', /look inside the vein/i], ['msk', 'tendon-ruptures', /Xanthoma:/i], ['eye-scrotum', 'torsion', /find the tender nub/i], ['eye-scrotum', 'torsion', /Fluid around the testis/i], ['lumps', 'cellulitis-abscess', /Neck lumps: node or pus/i], ['pelvis', 'early-pregnancy', /retained products/i], ['abdomen', 'appendix-intussusception', /Left-sided pain: diverticulitis/i], ['biliary-bladder', 'retention', /fill first, then find the window/i]];
  for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); watch(page);
    const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: BASE };
    const reg = await page.request.post(`${BASE}/api/academy/register`, { headers: H, data: { module: 'msk', first_name: 'Test', last_name: 'Learner', email: `learner.${label}.${Date.now()}@example.com`, role: 'Doctor', privacy: 'yes' } }).catch(() => null);
    let regOk = reg && reg.ok();
    if (!regOk) {
      await page.goto(`${BASE}/elearning/msk/`);
      const form = await page.$('#register form, form[data-register], form[action*="register"]');
      if (form) { await page.fill('input[name=name]', 'Test Learner').catch(() => {}); await page.fill('input[name=email]', `learner.${label}.${Date.now()}@example.com`).catch(() => {}); const role = await page.$('select[name=role]'); if (role) await role.selectOption({ index: 1 }); for (const c of await page.$$('form input[type=checkbox][required]')) await c.check(); await Promise.all([page.waitForLoadState('load'), page.click('form button[type=submit]')]).catch(() => {}); }
      regOk = (await ctx.cookies()).length > 0;
    }
    const bad = [];
    for (const [mod, les, re] of lessons) {
      const r = await page.goto(`${BASE}/elearning/${mod}/learn/${les}/`);
      const t = await page.evaluate(() => ({ text: (document.querySelector('main') || document.body).innerText, over: document.documentElement.scrollWidth > innerWidth + 1, quiz: document.querySelectorAll('.quiz').length }));
      if (r.status() !== 200 || !re.test(t.text) || t.over) bad.push({ mod, les, status: r.status(), found: re.test(t.text), over: t.over });
    }
    record(`A-${label}`, `${label}: the 11 changed Academy lessons open for a registered learner, show the new teaching and fit the screen`, regOk && !bad.length, bad.length ? { regOk, bad } : '11 lessons');
    if (label === 'phone') { await page.goto(`${BASE}/elearning/biliary-bladder/learn/retention/`); await page.screenshot({ path: path.join(OUT, 'A-retention-phone.png'), fullPage: false }); }
    await ctx.close();
  }
}

// L: the Learn index lists them in their topics, with thumbnails.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage(); watch(page);
  await page.goto(`${BASE}/learn/`);
  const found = await page.evaluate((slugs) => slugs.filter((s) => !document.querySelector(`a[href="/learn/${s}/"] img`)), queue.map((q) => q.slug));
  record('L', 'The Learn page lists all 14 with their card thumbnails', !found.length, found.length ? { missing: found } : '14 cards');
  await ctx.close();
}

record('Z', 'No script errors on any page', !errors.length, errors.slice(0, 5).join(' | ') || 'none');
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
