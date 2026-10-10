// Browser check of the October 2026 supervisor verification work: the compact "Verified Supervisor" status and its
// More info (sheet on phones and a folded Fold7, pop-up on an unfolded Fold7 and desktops), the supervisor's own
// screen with a genuine pending item, the learner's view, the admin approval without a note, the email status, the
// repair of records left by the old person-page route, double clicks, offline and reconnection, both themes.
//
// Self-contained and local: the real Worker (worker/index.js) runs in this process over the test database
// (test/helpers/env.mjs: node:sqlite, every migration), serving dist/. Every outbound request the Worker makes
// (ZeptoMail) is answered here and recorded: nothing leaves the machine. All people and numbers are fictional.
// Run: node build.js && node --import ./test/helpers/register.mjs tools/e2e-verified.mjs <outdir>
// Production branch: the Worker is production's (generic registration check, supervisor role only).
// UI=web (default): the website app built from this branch (dist/). UI=android DIST=<dist of an Android-line build>:
// that app against this Worker, as installed and upcoming store apps will meet it after deployment.
// OLD_WORKER=1: the app against a Worker without this work (no `verification` field, no admin changes), as an
// installed app meets production before the Worker is deployed. Role and credential details, the admin console and
// the repair are then skipped; the app must still show one consistent status.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from '../test/helpers/verify.mjs';
import worker from '../worker/index.js';
import { supervisorsAdminPost } from '../worker/supervisors-admin.js';
import { ukDate, addMonths, addDays } from '../worker/time.js';

const out = process.argv[2] || 'shots-verified';
const OLD = process.env.OLD_WORKER === '1';
const WEB = (process.env.UI || 'web') === 'web';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const ok = (m) => console.log('ok  ', m);
const check = (cond, m) => (cond ? ok(m) : fail(m));

// ---------- Outbound requests: captured, never sent ----------
const mail = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const url = String(u && u.url || u);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(u, init);
  try { mail.push({ url, ...JSON.parse(init && init.body || '{}') }); } catch { mail.push({ url }); }
  return new Response('{}', { status: 200 });
};
const subjects = (to) => mail.filter((m) => m.to && m.to[0].email_address.address === to).map((m) => m.subject);

// ---------- The Worker, its database and dist/ ----------
// Cloudflare's HTMLRewriter, for the one use the admin console makes of it (filling #admin-root).
if (typeof globalThis.HTMLRewriter === 'undefined') globalThis.HTMLRewriter = class {
  constructor() { this.h = []; }
  on(sel, handler) { this.h.push([sel, handler]); return this; }
  transform(res) {
    const h = this.h;
    const body = new ReadableStream({ async start(c) {
      let t = await res.text();
      for (const [sel, handler] of h) {
        const id = sel.replace(/^#/, ''); let inner = null;
        handler.element({ setInnerContent: (v) => { inner = v; } });
        if (inner != null) t = t.replace(new RegExp(`(<[^>]+id="${id}"[^>]*>)(</div>)`), (m, a, b) => a + inner + b);
      }
      c.enqueue(new TextEncoder().encode(t)); c.close();
    } });
    return new Response(body, res);
  }
};
const DIST = path.resolve(process.env.DIST || 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const ASSETS = { fetch: async (req) => {
  const u = new URL(req.url || req);
  let f = path.join(DIST, decodeURIComponent(u.pathname));
  if (!f.startsWith(DIST)) return new Response('', { status: 403 });
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } });
} };
const env = makeEnv({ ASSETS, SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: 'local-capture-only', ZEPTOMAIL_API: 'https://capture.invalid/email' });
const b64 = (u8) => Buffer.from(u8).toString('base64');
async function hash(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256)))}`;
}
const ADMIN_PW = 'Local only admin 1!';
for (const [k, v] of [['admin_username', 'wavelength'], ['admin_hash', await hash(ADMIN_PW)], ['volunteer_username', 'volunteer'], ['volunteer_hash', await hash('Local only volunteer 1!')], ['session_secret', b64(crypto.getRandomValues(new Uint8Array(32)))]]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    for (const k of ['origin', 'referer']) { const v = headers.get(k); if (v) headers.set(k, v.replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+/, ORIGIN)); }
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await worker.fetch(new Request(ORIGIN + url.pathname + url.search, init), env, wctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = k === 'location' ? v.replace(ORIGIN, '') : v; });
    // Cookies are Secure: Chrome accepts them on http://localhost.
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;

// ---------- Fictional records ----------
// Each account has finished the app's first-run steps (pathways chosen, declaration made).
const ready = (c) => c.call('/api/app/profile', { profile: { pathways: ['famus', 'fusic'], onboarded: true, grade: 'Consultant', supervisor: true }, declaration: true });
const admin = (o, reviewer = 'Alex Reviewer') => supervisorsAdminPost(env, adminForm({ reviewer, ...o }), 'wavelength', wctx);
let gmc = 7200001;
async function applicant(email, first, last, { learner = null } = {}) {
  if (learner) await learner.call('/api/app/supervisors/add', { email });
  const c = await verifiedAccount(env, email, { firstName: first, lastName: last, title: 'Dr', organisation: 'Example General Hospital' });
  await ready(c);
  if (learner) { const inv = (await c.call('/api/app/supervisors')).body.invites[0]; await c.call('/api/app/supervisors/accept', { id: inv.id }); }
  await c.call('/api/app/supervisor/application', { title: 'Dr', role: 'Consultant in Emergency Medicine', organisation: 'Example General Hospital', registration: { regulator: 'gmc', number: String(gmc++), profession: 'Doctor', organisation: 'Example General Hospital' }, experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true }, justification: 'Fictional applicant for a local browser check. Leads departmental ultrasound teaching and supervises scans weekly.', evidenceMode: 'explanation', areas: ['lung', 'heart'], pathways: ['famus', 'fusic'] });
  await c.call('/api/app/supervisor/submit', { declaration: true });
  const id = await idOf(env, email);
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(id).first();
  await admin({ action: 'reg_verify', learner: id, sid: reg.id, register_name: `${first} ${last}`, checked: '1' });
  const app = await env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(id).first();
  return { c, id, app };
}
const learner = await verifiedAccount(env, 'casey.trainee@example.test', { firstName: 'Casey', lastName: 'Trainee' });
await ready(learner);
// A: verified for FAMUS Thoracic and DVT (supervisor) and FUSIC Heart (mentor), relying on a FAMUS credential.
const A = await applicant('jordan.example@example.test', 'Jordan', 'Example', { learner });
const cred = (await env.DB.prepare("INSERT INTO credentials (learner_id, credential_type, issuer, programme, role, modules, status, verified_at, verified_by, verification_method, expires_on) VALUES (?, 'famus-supervisor', 'sam', 'famus', 'supervisor', '[\"thoracic\",\"dvt\"]', 'verified', ?, 'admin:wavelength:Alex Reviewer', 'manual_evidence', '2029-06-30')").bind(A.id, new Date().toISOString()).run()).meta.last_row_id;
await admin({ action: 'app_approve', app: A.app.id, scope: ['famus:famus-thoracic', 'famus:famus-dvt'], basis: String(cred), notes: 'PRIVATE ADMIN NOTE: never shown outside the console' });
await admin({ action: 'appr_add', learner: A.id, scope: ['fusic:fusic-heart'] });
// B: the reported production state: approved by the old person-page route, application still "submitted".
const B = await applicant('riley.legacy@example.test', 'Riley', 'Legacy');
await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes) VALUES (?, 'famus', 'famus-thoracic', 'approved', '[]', ?, 'admin:wavelength:Alex Reviewer', ?, 'old route')").bind(B.id, addMonths(ukDate(), 12), new Date().toISOString()).run();
// C: application under review, invited by the learner.
const C = await applicant('morgan.pending@example.test', 'Morgan', 'Pending', { learner });
// D: an application the admin will approve in the browser, without a note.
const D = await applicant('drew.newcomer@example.test', 'Drew', 'Newcomer');
ok('fictional records seeded');

// ---------- Browser ----------
const browser = await chromium.launch();
const cookieOf = (c) => { const [name, ...v] = c.cookie.split('='); return { name, value: v.join('='), domain: 'localhost', path: '/' }; };
async function open(name, client, { w = 390, h = 844, theme = 'light', reduced = false } = {}) {
  const cx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-GB', reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: w < 760 });
  if (client) await cx.addCookies([cookieOf(client)]);
  await cx.addInitScript((t) => { try { localStorage.setItem('wl-theme', t); } catch (e) { /* none */ } }, theme);
  const page = await cx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { cx, page };
}
const noOverflow = async (page, name) => check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${name}: no horizontal overflow`);
const shot = (page, f, admin = false) => (admin ? page.locator('#admin-root').screenshot({ path: path.join(out, f) }) : page.screenshot({ path: path.join(out, f) }));

// The supervisor's own screen and More info, at each size and theme.
const SIZES = [['phone', 390, 844], ['fold7-folded', 344, 882], ['fold7-unfolded', 884, 1104], ['desktop', 1440, 900]];
for (const [label, w, h] of SIZES) for (const theme of ['light', 'dark']) {
  const name = `A ${label} ${theme}`;
  const { cx, page } = await open(name, A.c, { w, h, theme });
  await page.goto(BASE + '/app/#/supervisor');
  try { await page.waitForSelector('.card.vs', { timeout: 15000 }); }
  catch (e) { await shot(page, `debug-${label}-${theme}.png`); console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)), page.url(), JSON.stringify(await cx.cookies())); throw e; }
  const card = page.locator('.card.vs').first();
  const text = await card.innerText();
  check(/Verified Supervisor/.test(text) && /Credentials and approved scope confirmed by Wavelength\./.test(text), `${name}: compact card text`);
  check(!/Thoracic|DVT|Heart|FAMUS|FUSIC/.test(text), `${name}: no pathways or modules on the main card`);
  const box = await card.boundingBox();
  check(box.height <= (w < 400 ? 140 : 120), `${name}: compact (${Math.round(box.height)} px high)`);
  check(!(await page.locator('.card.dark').count()), `${name}: no navy status panel`);
  check(!/being reviewed/i.test(await page.locator('main').innerText()), `${name}: nothing says "being reviewed"`);
  const icon = await page.evaluate(() => { const i = document.querySelector('.card.vs .vs-ic'); const cs = getComputedStyle(i); const card = getComputedStyle(document.querySelector('.card.vs')); return { w: i.getBoundingClientRect().width, color: cs.color, bg: card.backgroundColor }; });
  check(icon.w <= 20 && /rgb\((46, 125, 91|98, 199, 154)\)/.test(icon.color), `${name}: small green check (${icon.w}px, ${icon.color})`);
  check(!/rgb\((232, 244, 238|15, 30, 51)\)/.test(icon.bg), `${name}: no green or navy background (${icon.bg})`);
  const more = page.locator('.card.vs [data-vinfo]');
  const mb = await more.boundingBox();
  check(mb.height >= 44, `${name}: More info touch target ${Math.round(mb.height)} px`);
  await noOverflow(page, name);
  await shot(page, `supervisor-${label}-${theme}.png`);
  await more.focus();
  await page.keyboard.press('Enter');
  const dlg = page.locator('.sheet-bg [role=dialog]');
  await dlg.waitFor();
  await page.waitForTimeout(250); // the opening animation
  const pop = await page.locator('.sheet.pop').count();
  check(pop === (w >= 760 ? 1 : 0), `${name}: More info as ${pop ? 'pop-up' : 'bottom sheet'}`);
  const info = await dlg.innerText();
  const op = await page.evaluate(() => { const d = document.querySelector('.sheet-bg [role=dialog]'); return { o: getComputedStyle(d).opacity, top: d.scrollTop, bg: getComputedStyle(d).backgroundColor }; });
  check(op.o === '1' && op.top === 0 && !/rgba\(.*, 0(\.\d+)?\)$/.test(op.bg), `${name}: More info opaque and opens at its top (${JSON.stringify(op)})`);
  for (const s of OLD ? ['FAMUS pathway', 'Thoracic', 'DVT', 'FUSIC pathway', 'Heart', 'Approved until'] : ['FAMUS pathway', 'Thoracic', 'DVT', 'FUSIC pathway', 'Heart', 'Verified role', 'Supervisor', 'Approved until', 'Verified on', 'Credentials relied on', 'FAMUS supervisor']) check(info.includes(s), `${name}: More info shows "${s}"`);
  if (!OLD) check(/Expires \d{1,2} \S+ 2029/.test(info), `${name}: More info shows the credential's expiry`);
  check(!/PRIVATE ADMIN NOTE|7200001|evidence/i.test(info), `${name}: no admin notes, registration number or evidence`);
  check(!/Also in progress/.test(info), `${name}: nothing pending is mixed in`);
  const labelled = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const h = d && document.getElementById(d.getAttribute('aria-labelledby')); return d && d.getAttribute('aria-modal') === 'true' && h && h.textContent; });
  check(labelled === 'Verified Supervisor', `${name}: dialog is modal and labelled`);
  if (pop) {
    const r = await page.locator('.sheet.pop').boundingBox();
    check(r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h, `${name}: pop-up inside the screen`);
    check(Math.abs(r.y - (mb.y + mb.height + 8)) < 2 || r.y + r.height <= mb.y, `${name}: pop-up beside its button`);
  }
  await page.waitForFunction(() => !!document.activeElement.closest('.sheet-bg [role=dialog]'), null, { timeout: 2000 }).then(() => ok(`${name}: focus moves into the dialog`), () => fail(`${name}: focus moves into the dialog`));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')), `${name}: focus stays in the dialog`);
  await shot(page, `supervisor-${label}-${theme}-more-info.png`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sheet-bg'));
  check(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-vinfo')), `${name}: Escape closes and returns focus to More info`);
  if (label === 'fold7-unfolded' && theme === 'light') {
    // Folding the phone while More info is open: the pop-up becomes a bottom sheet, the content unchanged.
    await more.click(); await page.locator('.sheet.pop').waitFor();
    await page.setViewportSize({ width: 344, height: 882 });
    await page.waitForFunction(() => document.querySelector('.sheet-bg:not(.pop) .sheet') && !document.querySelector('.sheet.pop'));
    check(/FUSIC pathway/.test(await page.locator('.sheet-bg [role=dialog]').innerText()), 'folding the Fold7 turns the pop-up into a sheet with the same content');
    await shot(page, 'fold7-folded-after-unfolded.png');
    await page.locator('[role=dialog] [data-close]').last().click();
    await page.setViewportSize({ width: w, height: h });
  }
  if (label === 'phone' && theme === 'light') {
    // A tap outside the sheet closes it.
    await more.click(); await dlg.waitFor();
    await page.mouse.click(10, 10);
    await page.waitForFunction(() => !document.querySelector('.sheet-bg'));
    ok(`${name}: tapping outside closes More info`);
  }
  await cx.close();
}

// B: verified (old route) with the application still open: never "being reviewed"; the application shown apart.
{
  const { cx, page } = await open('B', B.c);
  await page.goto(BASE + '/app/#/supervisor');
  await page.waitForSelector('.card.vs');
  const main = await page.locator('main').innerText();
  check(/Verified Supervisor/.test(main), 'B: verified');
  check(/Further application under review/.test(main) && /Your current approval is not affected\./.test(main), 'B: the open application is shown as a separate further application');
  check(!/Your supervisor application is being reviewed/.test(main), 'B: no contradictory "being reviewed" message');
  await shot(page, 'legacy-before-repair.png');
  await page.locator('.card.vs [data-vinfo]').click();
  await page.waitForTimeout(300);
  check(/Also in progress[\s\S]*Further application under review/.test(await page.locator('.sheet-bg [role=dialog]').innerText()), 'B: More info lists the application under "Also in progress", apart from the approval');
  await shot(page, 'legacy-more-info.png');
  await cx.close();
}

// C: pending. A light status card, no check, no navy panel.
{
  const { cx, page } = await open('C', C.c);
  await page.goto(BASE + '/app/#/supervisor');
  await page.waitForSelector('.card.vs.vs-off');
  check(/Application being reviewed/.test(await page.locator('.card.vs').innerText()), 'C: pending status');
  check(!(await page.locator('.vs-ic').count()), 'C: no verified check');
  check(!(await page.locator('.card.dark').count()), 'C: no navy panel');
  await shot(page, 'pending.png');
  await cx.close();
}

// The learner (website app): A verified (compact, no modules in the list, More info in the card), C not verified.
for (const [label, w, h] of WEB ? [['phone', 390, 844], ['desktop', 1440, 900]] : []) {
  const name = `learner ${label}`;
  const { cx, page } = await open(name, learner, { w, h });
  await page.goto(BASE + '/app/#/supervisors');
  await page.waitForSelector('.vs-line');
  const cards = await page.locator('main .card').allInnerTexts();
  const a = cards.find((t) => /Jordan/.test(t)) || '', c = cards.find((t) => /Morgan/.test(t)) || '';
  check(/Verified Supervisor/.test(a) && /More info/.test(a) && !/Thoracic|Approved by Wavelength to supervise/.test(a), `${name}: A verified, compact, no module list`);
  check(!/Verified Supervisor/.test(c), `${name}: C not verified`);
  await noOverflow(page, name);
  await shot(page, `learner-list-${label}.png`);
  await page.locator('main .card', { hasText: 'Jordan' }).locator('[data-vinfo]').click();
  await page.waitForTimeout(300);
  const info = await page.locator('.sheet-bg [role=dialog]').innerText();
  check(/FAMUS pathway/.test(info) && /Thoracic/.test(info) && /Supervisor/.test(info) && /Approved until/.test(info), `${name}: More info explains pathways, modules and roles`);
  check(!/Credentials relied on|Also in progress|PRIVATE|Expires/.test(info), `${name}: nothing beyond what a learner should see`);
  await shot(page, `learner-more-info-${label}.png`);
  await page.keyboard.press('Escape');
  await cx.close();
}
// The learner: A verified (compact, no modules in the list), C awaiting approval; A's details and More info.
for (const [label, w, h] of WEB ? [] : [['phone', 390, 844], ['desktop', 1440, 900]]) {
  const name = `learner ${label}`;
  const { cx, page } = await open(name, learner, { w, h });
  await page.goto(BASE + '/app/#/supervisors');
  await page.waitForSelector('.sv-link');
  const cards = await page.locator('.sv-link').allInnerTexts();
  const a = cards.find((t) => /Jordan/.test(t)) || '', c = cards.find((t) => /Morgan/.test(t)) || '';
  check(/Verified Supervisor/.test(a) && !/Thoracic|Approved to supervise/.test(a), `${name}: A verified, compact, no module list`);
  check(!/Verified Supervisor/.test(c), `${name}: C not verified`);
  await noOverflow(page, name);
  const line = await page.locator('.sv-link', { hasText: 'Jordan' }).evaluate((a) => { const l = a.querySelector('.vs-line').getBoundingClientRect(), m = a.querySelector('.link-more').getBoundingClientRect(); return l.bottom <= m.top + 1 || l.right <= m.left; });
  check(line, `${name}: the verified line and "Details and options" do not overlap`);
  await shot(page, `learner-list-${label}.png`);
  await page.locator('.sv-link', { hasText: 'Jordan' }).click();
  await page.waitForSelector('.card.vs');
  await page.locator('.card.vs [data-vinfo]').click();
  await page.waitForTimeout(300);
  const info = await page.locator('.sheet-bg [role=dialog]').innerText();
  check(/FAMUS pathway/.test(info) && /Thoracic/.test(info) && (OLD || (/Supervisor/.test(info) && /Approved until/.test(info))), `${name}: More info explains pathways, modules and roles`);
  check(!/Credentials relied on|Also in progress|PRIVATE|Expires/.test(info), `${name}: nothing beyond what a learner should see`);
  await shot(page, `learner-more-info-${label}.png`);
  await cx.close();
}

// Offline, then reconnecting: the status screen says so, then shows the card.
{
  const { cx, page } = await open('offline', A.c);
  await page.goto(BASE + '/app/#/me'); await page.waitForSelector('main');
  await cx.setOffline(true);
  await page.goto(BASE + '/app/#/supervisor').catch(() => {});
  await page.evaluate(() => { location.hash = '#/supervisor'; });
  await page.waitForTimeout(600);
  const t = await page.locator('main').innerText().catch(() => '');
  check(/offline|Could not load|Loading/i.test(t) && !/Verified Supervisor/.test(t) || /Verified Supervisor/.test(t), 'offline: no false status (either an offline note or the last real status)');
  await cx.setOffline(false);
  await page.evaluate(() => { location.hash = '#/me'; location.hash = '#/supervisor'; });
  await page.waitForSelector('.card.vs', { timeout: 15000 });
  ok('reconnected: the status loads');
  await cx.close();
}

// ---------- Admin console ----------
for (const [label, w] of OLD ? [] : [['desktop', 1440], ['phone', 390]]) {
  const { cx, page } = await open(`admin ${label}`, null, { w, h: 900 });
  await page.goto(BASE + '/admin/login/');
  await page.fill('input[name=username]', 'wavelength'); await page.fill('input[name=password]', ADMIN_PW);
  await Promise.all([page.waitForNavigation(), page.click('form button[type=submit]')]);
  if (label === 'desktop') {
    await page.goto(BASE + '/admin/supervisors/?tab=attention');
    const att = await page.locator('body').innerText();
    check(/is still open although they hold a current approval/.test(att), 'admin: Needs attention lists the open application of an approved supervisor');
    await shot(page, 'admin-attention.png', true);
    // D: approve without a note, double-clicking the button.
    await page.goto(BASE + `/admin/supervisors/?app=${D.app.id}`);
    const form = page.locator('form:has(input[value=app_approve])');
    check(!(await form.locator('[name=notes][required]').count()), 'admin: approval note not required');
    check(/Before approving/.test(await page.locator('body').innerText()), 'admin: review checklist shown');
    await shot(page, 'admin-application.png', true);
    await form.locator('input[name=reviewer]').fill('Alex Reviewer');
    await form.locator('input[name=scope][value="famus:famus-thoracic"]').check();
    await Promise.all([page.waitForNavigation(), form.locator('button[type=submit]').dblclick()]);
    const msg = await page.locator('body').innerText();
    check(/Approved until .*FAMUS pathway, supervisor: Thoracic.*Approval email: accepted by the email provider\./.test(msg), 'admin: clear confirmation with the email status');
    check(/Approval email: Accepted by the email provider/.test(msg), 'admin: email status indicator on the application');
    check(subjects('drew.newcomer@example.test').filter((s) => s === 'Wavelength | Supervisor Verification Approved').length === 1, 'admin: one approval email for a double click');
    check(await page.inputValue('form input[name=reviewer]').catch(() => '') === 'Alex Reviewer' || !(await page.locator('form input[name=reviewer]').count()), 'admin: reviewer name remembered');
    await shot(page, 'admin-approved.png', true);
    // B: the repair.
    await page.goto(BASE + `/admin/supervisors/?app=${B.app.id}`);
    check(/Already approved:/.test(await page.locator('body').innerText()), 'admin: legacy application explains it is already approved');
    await shot(page, 'admin-legacy.png', true);
    const rep = page.locator('form:has(input[value=app_close_approved])');
    await rep.locator('input[name=reviewer]').fill('Alex Reviewer');
    await Promise.all([page.waitForNavigation(), rep.locator('button[type=submit]').click()]);
    check(/Application recorded as approved\. No email was sent\./.test(await page.locator('body').innerText()), 'admin: repaired without an email');
    check(!subjects('riley.legacy@example.test').some((s) => /Supervisor Verification/.test(s)), 'admin: no corrective email sent');
  } else {
    await page.goto(BASE + `/admin/supervisors/?app=${D.app.id}`);
    await noOverflow(page, 'admin phone');
    await shot(page, 'admin-phone.png', true);
  }
  await cx.close();
}
// B after the repair: verified, nothing under review.
if (!OLD) {
  const { cx, page } = await open('B after repair', B.c);
  await page.goto(BASE + '/app/#/supervisor');
  await page.waitForSelector('.card.vs');
  check(!/under review/i.test(await page.locator('main').innerText()), 'B after repair: verified, nothing under review');
  await shot(page, 'legacy-after-repair.png');
  await cx.close();
}

await browser.close();
server.close();
const real = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/.test(e));
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ errors: real, mail: mail.map((m) => ({ to: m.to && m.to[0].email_address.address, subject: m.subject })) }, null, 2));
console.log(real.length ? `\n${real.length} problem(s):\n${real.join('\n')}` : '\nAll browser checks passed.');
process.exit(real.length ? 1 : 0);
