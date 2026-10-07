// Browser check of the regulator-specific registration review and the supervisor status wording (October 2026):
// the GMC admin controls appear only for a GMC registration, opening the link changes nothing, a held registration
// needs a decision, applicants see "How supervisor verification works", and status shows "Approved to supervise:" with
// current scopes and "What does Wavelength Verified mean?". The GMC link is checked, never followed.
// Local only, never production. Setup as tools/e2e-verification.mjs (migrations applied locally, local admin
// settings, .dev.vars with SUPERVISOR_APPLY="true" and a stand-in mail server appending to MAIL_LOG), then
// `npx wrangler dev --local --local-upstream localhost:8787`.
// Usage: MAIL_LOG=<file> ADMIN_PASSWORD=<pw> node tools/e2e-registration-review.mjs <outdir> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { localOnly } from './local-only.mjs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
localOnly(BASE, 'tools/e2e-registration-review.mjs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const ok = (m) => console.log('ok  ', m);
async function ctxFor(name, w = 390) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(name + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  // Never reach the GMC from a test: any request to gmc-uk.org fails the run.
  await ctx.route(/gmc-uk\.org/, (r) => { fail('a request went to gmc-uk.org: ' + r.request().url()); r.abort(); });
  return { ctx, page };
}
const post = (page, p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const get = (page, p) => page.evaluate((p) => fetch(p).then((r) => r.json()), p);
const mails = (to) => fs.readFileSync(process.env.MAIL_LOG, 'utf8').split('\n').filter(Boolean).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((m) => m && m.to && m.to[0].email_address.address === to);
const lastToken = (to) => mails(to).map((m) => (String(m.textbody).match(/verify-email\/([A-Za-z0-9_-]+)/) || [])[1]).filter(Boolean).pop();
const noOverflow = async (p, name) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail('overflow ' + name); };
async function shots(p, name, prep) {
  for (const w of [390, 1440]) {
    await p.setViewportSize({ width: w, height: 900 });
    if (prep) await prep(); else await p.reload();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    await noOverflow(p, `${name}-${w}`);
  }
}
const t = Date.now();
const settle = () => new Promise((r) => setTimeout(r, 300));

async function account(email, first = 'John', last = 'Smith') {
  const a = await ctxFor(email);
  await a.page.goto(BASE + '/app/');
  const r = await post(a.page, '/api/app/signup', { firstName: first, lastName: last, email, password: 'Long-password-1', terms: true });
  if (!r.ok) fail('signup ' + email + ': ' + JSON.stringify(r));
  await settle();
  const tok = lastToken(email);
  await a.page.goto(`${BASE}/app/#/verify-email/${tok}`);
  await a.page.waitForSelector('text=Email confirmed.', { timeout: 8000 }).catch(() => fail('email confirm ' + email));
  // First-run onboarding: pick a pathway and accept, as a new user would.
  await a.page.goto(BASE + '/app/');
  await a.page.waitForSelector('.pathcard', { timeout: 8000 });
  await a.page.locator('.pathcard').filter({ hasText: 'FAMUS' }).click(); await a.page.click('#f button');
  if (await a.page.waitForSelector('#ag', { timeout: 8000 }).then(() => true).catch(() => false)) { await a.page.check('#ag'); await a.page.click('#f button'); }
  await a.page.waitForSelector('.hero', { timeout: 8000 }).catch(async () => { fail('onboarding ' + email); await a.page.screenshot({ path: `${out}/onboarding-fail-${first}.png` }); });
  return a;
}
const EXPLAIN = 'I have led the emergency department ultrasound programme for six years and supervise lung and DVT scans weekly.';
const draft = (registration) => ({ role: 'Consultant in Emergency Medicine', organisation: 'Darent Valley Hospital', registration, experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true }, justification: EXPLAIN, evidenceMode: 'explanation', areas: ['lung', 'dvt', 'procedures'], pathways: ['famus', 'international'] });

// ---- 1. Before applying: "How supervisor verification works" and "What does Wavelength Verified mean?" ----
const supEmail = `gmc${t}@example.com`, phEmail = `gphc${t}@example.com`, lEmail = `learner${t}@example.com`;
const gmcNo = String(t).slice(-7);
const learner = await account(lEmail, 'Lara', 'Jones');
await post(learner.page, '/api/app/supervisors/add', { email: supEmail });
const sup = await account(supEmail);
const inv = (await get(sup.page, '/api/app/supervisors')).invites[0];
const acc = await post(sup.page, '/api/app/supervisors/accept', { id: inv.id });
if (!acc.ok) fail('accept ' + JSON.stringify(acc));
await sup.page.goto(BASE + '/app/#/supervisor');
await sup.page.waitForSelector('text=How supervisor verification works', { timeout: 8000 }).then(() => ok('status page explains verification before applying')).catch(() => fail('no "How supervisor verification works" on the status page'));
if (!(await sup.page.locator('summary', { hasText: 'What does Wavelength Verified mean?' }).count())) fail('no explainer on the status page'); else ok('status page has "What does Wavelength Verified mean?"');
await shots(sup.page, 'supervisor-before-applying');
await sup.page.goto(BASE + '/app/#/supervisor/apply');
await sup.page.waitForSelector('.sv-how', { timeout: 8000 }).then(() => ok('first application step shows how verification works')).catch(() => fail('no explanation on the first step'));
await shots(sup.page, 'apply-step-1');

// ---- 2. Two applications: one GMC, one GPhC ----
let r = await post(sup.page, '/api/app/supervisor/application', draft({ regulator: 'gmc', number: gmcNo, profession: 'Doctor' }));
if (!r.ok) fail('GMC draft ' + JSON.stringify(r));
r = await post(sup.page, '/api/app/supervisor/submit', { declaration: true });
if (!r.ok) fail('GMC submit ' + JSON.stringify(r));
const ph = await account(phEmail, 'Priya', 'Shah');
r = await post(ph.page, '/api/app/supervisor/application', draft({ regulator: 'gphc', number: String(t + 1).slice(-7), profession: 'Pharmacist' }));
if (!r.ok) fail('GPhC draft ' + JSON.stringify(r));
r = await post(ph.page, '/api/app/supervisor/submit', { declaration: true });
if (!r.ok) fail('GPhC submit ' + JSON.stringify(r));
const supId = (await get(sup.page, '/api/app/me')).account.id;
const phId = (await get(ph.page, '/api/app/me')).account.id;

// ---- 3. Admin: GMC controls for the GMC registration only ----
const adm = await ctxFor('admin', 1440);
await adm.page.goto(BASE + '/admin/login/');
await adm.page.fill('input[name=username]', 'wavelength'); await adm.page.fill('input[name=password]', process.env.ADMIN_PASSWORD || '');
await adm.page.click('form.vol-login button');
await adm.page.waitForURL(/\/admin\/$/, { timeout: 8000 }).catch(() => fail('admin login'));
const person = (id) => adm.page.goto(`${BASE}/admin/supervisors/?id=${id}`);
await person(supId);
const link = adm.page.locator('a', { hasText: 'Open GMC register' }).first();
const href = await link.getAttribute('href');
if (href !== `https://www.gmc-uk.org/registrants/${gmcNo}`) fail('GMC link ' + href); else ok('Open GMC register: ' + href.replace(/\d{7}$/, '<number>'));
if ((await link.getAttribute('target')) !== '_blank' || (await link.getAttribute('rel')) !== 'noopener noreferrer') fail('link target/rel'); else ok('opens in a new tab with noopener noreferrer');
const before = await adm.page.locator('.sv-card h4').first().innerText();
await shots(adm.page, 'admin-gmc-card', () => person(supId));
await person(supId);
if ((await adm.page.locator('.sv-card h4').first().innerText()) !== before) fail('status changed after viewing'); else ok('viewing the link changes nothing (' + before.trim() + ')');
await person(phId);
const phCard = await adm.page.locator('.sv-card').first().innerText();
if (/Open GMC register|GMC register check|Licence to practise/.test(phCard)) fail('GMC controls on a GPhC registration'); else ok('GPhC registration has no GMC controls');
if (!(await adm.page.locator('form:has(input[value=reg_verify])').count())) fail('GPhC lost its manual check'); else ok('GPhC keeps the generic manual check');
await shots(adm.page, 'admin-gphc-card', () => person(phId));

// ---- 4. A restriction shown holds the registration; a deliberate decision verifies it ----
await person(supId);
let f = adm.page.locator('form:has(input[value=reg_gmc_check])');
await f.locator('input[name=register_name]').fill('John Smith');
for (const n of ['number_matched', 'registration_current', 'licence_current']) await f.locator(`input[name=${n}]`).check();
await f.locator('input[name=restriction][value=shown]').check();
await f.locator('input[name=notes]').fill('E2E: an undertaking is shown on the register');
await f.locator('input[name=reviewer]').fill('E2E reviewer');
await f.locator('button').click();
await adm.page.waitForSelector('text=Held for a decision', { timeout: 8000 }).then(() => ok('restriction holds the registration')).catch(() => fail('no hold'));
await shots(adm.page, 'admin-gmc-held', () => person(supId));
await person(supId);
f = adm.page.locator('form:has(input[value=reg_gmc_decide])');
await f.locator('input[name=decision][value=verify]').check();
await f.locator('textarea[name=notes]').fill('E2E: considered, not relevant to ultrasound supervision.');
await f.locator('input[name=reviewer]').fill('E2E reviewer');
adm.page.once('dialog', (d) => d.accept());
await f.locator('button').click();
await adm.page.waitForSelector('text=GMC registration verified after consideration.', { timeout: 8000 }).then(() => ok('deliberate decision verified it')).catch(() => fail('decision'));

// ---- 5. Approve one scope; status shows only that scope ----
const appId = (await get(sup.page, '/api/app/supervisor')).application.id;
await adm.page.goto(`${BASE}/admin/supervisors/?app=${appId}`);
const ap = adm.page.locator('form:has(input[value=app_approve])');
await ap.locator('input[name=scope]').evaluateAll((els) => els.forEach((e) => { e.checked = e.value === 'famus:famus-thoracic'; }));
await ap.locator('textarea[name=notes]').fill('E2E: thoracic only.');
await ap.locator('input[name=reviewer]').fill('E2E reviewer');
adm.page.once('dialog', (d) => d.accept());
await ap.locator('button').click();
await adm.page.waitForSelector('text=Approved until', { timeout: 8000 }).then(() => ok('approved for one scope')).catch(() => fail('approve'));
await sup.page.goto(BASE + '/app/#/supervisor');
await sup.page.waitForSelector('.sv-scopes', { timeout: 8000 });
const own = await sup.page.locator('.sv-scopes li').allInnerTexts();
if (own.join('|') !== 'Thoracic (FAMUS pathway)') fail('supervisor sees ' + own.join('|')); else ok('supervisor status: Approved to supervise: Thoracic (FAMUS pathway)');
await shots(sup.page, 'supervisor-approved');
await learner.page.goto(BASE + '/app/#/supervisors'); await learner.page.reload();
await learner.page.waitForSelector('.sv-scopes', { timeout: 8000 }).catch(() => fail('learner list has no scopes'));
const seen = await learner.page.locator('.sv-scopes li').allInnerTexts();
const chip = await learner.page.locator('.chip', { hasText: 'Wavelength Verified' }).count();
if (seen.join('|') !== 'Thoracic (FAMUS pathway)' || !chip) fail(`learner sees ${seen.join('|')}, chip ${chip}`); else ok('learner sees "Wavelength Verified ✓" and only the approved scope');
await learner.page.locator('summary', { hasText: 'What does Wavelength Verified mean?' }).click();
await shots(learner.page, 'learner-supervisors', async () => { await learner.page.reload(); await learner.page.waitForSelector('.sv-scopes'); await learner.page.locator('summary', { hasText: 'What does Wavelength Verified mean?' }).click(); });

await browser.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nAll checks passed.');
process.exit(errors.length ? 1 : 0);
