// Release W checks in a browser (25 October 2026): a finished Pearl test sends one counted event (full marks, no
// answers); Academy registration with a name in Arabic letters asks for English letters; an account whose name the
// certificate cannot print is asked for it at the pass, and the certificate is issued with the typed name.
// Synthetic accounts only, against a local Worker serving the built site.
//
// Setup: node build.js, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8787 --site
// Run:   node tools/e2e-release-w.mjs [results.json] [http://localhost:8787]
import fs from 'node:fs';
import { chromium } from 'playwright';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-release-w.mjs');
const DATA = JSON.parse(fs.readFileSync('worker/academy-data.json', 'utf8'));
const SLUG = Object.keys(DATA.modules)[0];
const MOD = DATA.modules[SLUG];
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();

async function fresh(w = 390, h = 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  return { ctx, page };
}

try {
  // W1: a Pearl test, all answers right, sends one quiz event with full marks and nothing else about the answers.
  {
    const { ctx, page } = await fresh();
    // Beacons are Blobs, which the request event does not expose: record what the page hands to sendBeacon.
    await page.addInitScript(() => { window.__b = []; const send = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { if (d && d.text) d.text().then((t) => window.__b.push(t)); return send(u, d); }; });
    const read = async () => (await page.evaluate(() => window.__b)).map((t) => JSON.parse(t));
    const path = '/learn/abscess-ultrasound/test/';
    await page.goto(API + path);
    const n = await page.locator('[data-quiz]').count();
    for (let i = 0; i < n; i++) await page.locator('[data-quiz]').nth(i).locator('.quiz-opt[data-correct]').click();
    await sleep(800);
    const quiz = (await read()).filter((b) => b.t === 'ev' && b.n === 'quiz');
    record('W1', 'finished Pearl test counted once, full marks, no answers', quiz.length === 1 && quiz[0].l === 'full' && quiz[0].p === path && Object.keys(quiz[0]).sort().join() === 'l,n,p,t', `${n} questions; events ${JSON.stringify(quiz)}`);
    // W2: a retry with one wrong answer is a second finished test, without full marks.
    await page.locator('[data-retry]').click();
    await page.locator('[data-quiz]').nth(0).locator('.quiz-opt:not([data-correct])').first().click();
    for (let i = 1; i < n; i++) await page.locator('[data-quiz]').nth(i).locator('.quiz-opt[data-correct]').click();
    await sleep(800);
    const q2 = (await read()).filter((b) => b.t === 'ev' && b.n === 'quiz');
    record('W2', 'a retry counts again, not full marks', q2.length === 2 && q2[1].l === '', JSON.stringify(q2[1] || null));
    await ctx.close();
  }

  // W3: Academy registration with the first name in Arabic letters shows the English letters message.
  {
    const { ctx, page } = await fresh();
    await page.goto(API + `/elearning/${SLUG}/`);
    const form = page.locator('[data-ac-register]').first();
    await form.locator('[name="first_name"]').fill('فائزة');
    await form.locator('[name="last_name"]').fill('Alshammari');
    await form.locator('[name="email"]').fill(`w${Date.now()}@example.com`);
    const role = form.locator('[name="role"]');
    if (await role.count()) { const tag = await role.evaluate((e) => e.tagName); if (tag === 'SELECT') await role.selectOption({ index: 1 }); else await role.fill('Doctor'); }
    await form.locator('[name="privacy"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForSelector('[data-ac-error]:not([hidden])', { timeout: 8000 });
    const msg = await form.locator('[data-ac-error]').innerText();
    record('W3', 'registration in Arabic letters asks for English letters', /English letters/.test(msg) && page.url().includes(`/elearning/${SLUG}/`), msg);
    await ctx.close();
  }

  // W4 to W6: an app account named in Arabic letters passes the final assessment.
  {
    const { ctx, page } = await fresh(1280, 900);
    await page.goto(API + '/app/');
    const email = `w${Date.now()}@example.com`;
    const s = await page.evaluate(async (email) => {
      const r = await fetch('/api/app/signup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ title: 'Ms', firstName: 'فائزة', lastName: 'الشمري', email, password: 'Long-password-1', terms: true }) });
      return r.status;
    }, email);
    await page.goto(API + `/elearning/${SLUG}/assessment/`);
    await page.waitForSelector('[data-ac-assess]', { timeout: 8000 });
    for (const q of MOD.questions) await page.locator(`[data-q="${q.id}"] input[value="${q.correct.replace(/"/g, '\\"')}"]`).check();
    await page.locator('[data-ac-assess] button[type="submit"]').click();
    await page.waitForSelector('[data-ac-namebox]', { timeout: 8000 });
    const box = await page.locator('[data-ac-namebox]').innerText();
    const prefill = await page.locator('[data-ac-certname]').inputValue();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-ac-certname'));
    record('W4', 'the pass asks for the certificate name in English letters', s === 200 && /English letters/.test(box) && prefill.trim() === 'Ms' && focused, `signup ${s}; prefill "${prefill}"; ${box.split('\n')[1] || ''}`);
    await page.locator('[data-ac-certname]').fill('Ms Faiza Lafi Alshammari');
    await page.locator('[data-ac-assess] button[type="submit"]').click();
    await page.waitForSelector('[data-ac-result]:not([hidden])', { timeout: 8000 });
    const res = await page.locator('[data-ac-result]').innerText();
    const gone = await page.locator('[data-ac-namebox]').count();
    record('W5', 'resubmitting with the name passes and issues the certificate', /passed/i.test(res) && gone === 0, res.split('\n').slice(0, 2).join(' / '));
    const href = await page.locator('[data-ac-result] a[href*="/elearning/certificate/"]').first().getAttribute('href');
    // The certificate page itself uses Cloudflare's HTMLRewriter, which the local stand-in lacks: check the PDF and the
    // learner's certificate list instead (the stored name is checked in test/weekly-summary.test.mjs).
    const pdf = await page.evaluate(async (h) => { const r = await fetch(h.replace(/\/$/, '') + '.pdf'); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('Content-Type'), head: String.fromCharCode(...b.slice(0, 5)), size: b.length }; }, href);
    const me = await page.evaluate(async () => (await fetch('/api/academy/me', { headers: { Accept: 'application/json' } })).json());
    record('W6', 'the certificate is issued and its PDF downloads', pdf.status === 200 && pdf.head === '%PDF-' && (me.certificates || []).some((c) => href.includes(c.code)), `${href}; pdf ${pdf.status} ${pdf.type} ${pdf.size} bytes`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
record('W7', 'no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
