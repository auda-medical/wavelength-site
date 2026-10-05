// End-to-end check of email, professional and supervisor verification in a real browser (October 2026).
// Setup, all local (never the production database):
//   1. Apply every file in migrations/ with `npx wrangler d1 execute wavelength-volunteers --local --file <file>`.
//   2. Insert local admin settings (admin_username 'wavelength', admin_hash for ADMIN_PASSWORD, session_secret, and the
//      volunteer pair), as for the volunteer area.
//   3. .dev.vars: ZEPTOMAIL_TOKEN="local-test", ZEPTOMAIL_API="http://127.0.0.1:8799/", PROFESSIONAL_VERIFY="true",
//      DIRECTORY_PUBLIC="true". Run a stand-in mail server on 8799 that appends each JSON body to MAIL_LOG.
//   4. npx wrangler dev --local --local-upstream localhost:8787
// Usage: MAIL_LOG=<file> ADMIN_PASSWORD=<pw> node tools/e2e-verification.mjs <outdir> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const ok = (m) => console.log('ok  ', m);
// Responses the test provokes on purpose (refusals) are not errors.
const EXPECTED = [/supervisors\/accept\b/, /email\/verify/];
async function ctxFor(name, { w = 390, ua } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, locale: 'en-GB', ...(ua ? { userAgent: ua } : {}) });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(name + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/') && !EXPECTED.some((x) => x.test(r.url()))) errors.push(`${name}: ${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  return { ctx, page };
}
const post = (page, p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const get = (page, p) => page.evaluate((p) => fetch(p).then((r) => r.json()), p);
const mails = (to) => fs.readFileSync(process.env.MAIL_LOG, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)).filter((m) => m.to[0].email_address.address === to);
const lastToken = (to, re = /verify-email\/([A-Za-z0-9_-]+)/) => mails(to).map((m) => (String(m.textbody).match(re) || [])[1]).filter(Boolean).pop();
const noOverflow = async (p, name) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail('overflow ' + name); };
const shot = async (p, name) => { await p.screenshot({ path: `${out}/${name}.png`, fullPage: true }); await noOverflow(p, name); };
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const t = Date.now();
const GMC = String(t).slice(-7); // unique per run: one verified holder per number
const supEmail = `sup${t}@example.com`, lEmail = `learner${t}@example.com`, invEmail = `invited${t}@example.com`;

// ---- 1. Sign up in the "native shell" (WavelengthApp user agent), see the confirm-email card ----
const app = await ctxFor('app', { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WavelengthApp' });
await app.page.goto(BASE + '/app/#/signup');
await app.page.fill('#fn', 'John'); await app.page.fill('#ln', 'Smith'); await app.page.fill('#em', supEmail); await app.page.fill('#pw', 'longpassword1');
await app.page.fill('#org', 'Darent Valley Hospital');
await app.page.check('input[name=terms]'); await app.page.click('#f button[type=submit]');
await app.page.waitForSelector('.pathcard'); // onboarding
await app.page.locator('.pathcard').filter({ hasText: 'FAMUS' }).click(); await app.page.click('#f button');
await app.page.waitForSelector('#ag'); await app.page.check('#ag'); await app.page.click('#f button');
await app.page.waitForSelector('[data-evr]', { timeout: 8000 }).then(() => ok('home shows the confirm-email card')).catch(() => fail('no confirm-email card on Home'));
await shot(app.page, 'home-unverified-390');
// Log a scan while unverified: the logbook is never gated.
const r0 = await post(app.page, '/api/app/sync', { entries: [{ id: 'v' + t.toString(36) + 'a', type: 'lung', date: '2026-09-01', supervision: 'direct' }] });
if (!r0.ok || r0.saved.length !== 1) fail('unverified account could not sync'); else ok('unverified account syncs its logbook');

// ---- 2. The email link opens in a different browser (as when a phone opens links outside the app) ----
const tok = lastToken(supEmail);
if (!tok) fail('no verification email captured');
const other = await ctxFor('browser');
await other.page.goto(`${BASE}/app/#/verify-email/${tok}`);
await other.page.waitForSelector('text=Email confirmed.', { timeout: 8000 }).then(() => ok('link verified in another browser')).catch(() => fail('verify page did not confirm'));
if (/verify-email/.test(other.page.url())) fail('token left in the address bar');
await shot(other.page, 'verify-email-done-390');
await other.page.goto(`${BASE}/app/#/verify-email/${tok}`);
await other.page.waitForSelector('text=This link has expired.', { timeout: 8000 }).then(() => ok('reused link refused')).catch(() => fail('reused link not refused'));
await app.page.reload(); await app.page.waitForSelector('.hero');
if (await app.page.locator('[data-evr]').count()) fail('app still shows the card after verification'); else ok('app picks up the verification on next load');

// ---- 3. Offline: the logbook still works; verification screens say so ----
await app.ctx.setOffline(true);
await app.page.evaluate(() => { location.hash = '#/log'; });
await app.page.waitForSelector('.entry', { timeout: 8000 }).then(() => ok('logbook opens offline')).catch(() => fail('logbook did not open offline'));
await app.page.evaluate(() => { location.hash = '#/professional'; });
await app.page.waitForSelector('text=You are offline', { timeout: 5000 }).then(() => ok('professional screen explains it is offline')).catch(() => fail('no offline message'));
await app.ctx.setOffline(false);

// ---- 4. Professional verification screen: registration, credential, evidence ----
await app.page.evaluate(() => { location.hash = '#/me'; });
await app.page.waitForSelector('a[href="#/professional"]').catch(() => fail('Me has no Professional verification link'));
await app.page.click('a[href="#/professional"]');
await app.page.waitForSelector('#rgf');
await app.page.selectOption('#rg1', 'gmc'); await app.page.fill('#rg3', GMC);
await app.page.click('#rgf button');
await app.page.waitForSelector('text=With the Wavelength team', { timeout: 8000 }).then(() => ok('GMC claim waits for manual verification (no automation pretended)')).catch(() => fail('registration status not shown'));
await app.page.selectOption('#cr1', 'famus-supervisor'); await app.page.check('#crm input[value=thoracic]');
await app.page.click('#crf button');
await app.page.waitForSelector('text=Evidence needed', { timeout: 8000 }).then(() => ok('FAMUS claim asks for evidence')).catch(() => fail('credential status not shown'));
await app.page.locator('[data-ev^="credential:"]').first().click();
await app.page.fill('#ev2', 'FAMUS supervisor approval email');
await app.page.setInputFiles('#ev4', { name: 'famus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% e2e\n') });
await app.page.click('#evf button.teal');
await app.page.waitForSelector('text=With the Wavelength team >> nth=1', { timeout: 8000 }).then(() => ok('evidence uploaded, claim in review')).catch(() => fail('evidence upload'));
await shot(app.page, 'professional-390');
const P0 = await get(app.page, '/api/app/professional');
if (P0.badges.some((b) => b.kind !== 'email')) fail('a badge appeared from self-declaration'); else ok('no badge from self-declaration');

// ---- 5. Admin panel: verify registration, approve credential, approve a scope ----
const adm = await ctxFor('admin', { w: 1440 });
await adm.page.goto(BASE + '/volunteer/login/');
await adm.page.fill('input[name=username]', 'wavelength'); await adm.page.fill('input[name=password]', process.env.ADMIN_PASSWORD || '');
await adm.page.click('form.vol-login button');
await adm.page.goto(BASE + '/volunteer/admin/supervisors/');
await adm.page.waitForSelector('text=Needs a decision');
await shot(adm.page, 'admin-queue-1440');
const supId = (await get(app.page, '/api/app/me')).account.id;
await adm.page.goto(`${BASE}/volunteer/admin/supervisors/?id=${supId}`);
await adm.page.waitForSelector('text=Professional registration');
const regForm = adm.page.locator('form:has(input[value=reg_verify])');
await regForm.locator('input[name=register_name]').fill('John Smith');
await regForm.locator('input[name=checked]').check(); await regForm.locator('input[name=notes]').fill('GMC online register checked'); await regForm.locator('input[name=reviewer]').fill('E2E reviewer');
await regForm.locator('button').click();
await adm.page.waitForSelector('text=Registration verified.').then(() => ok('admin verified the registration')).catch(() => fail('admin registration verify'));
const credForm = adm.page.locator('form:has(input[value=cred_approve])');
await credForm.locator('input[name=notes]').fill('Supervisor email from SAM'); await credForm.locator('input[name=reviewer]').fill('E2E reviewer');
await credForm.locator('select[name=evidence]').selectOption({ index: 1 });
await credForm.locator('button').click();
await adm.page.waitForSelector('text=Credential approved.').then(() => ok('admin approved the credential')).catch(() => fail('admin credential approve'));
const apForm = adm.page.locator('form:has(input[value=appr_add])');
await apForm.locator('input[value="famus:famus-thoracic"]').check(); await apForm.locator('textarea[name=notes]').fill('FAMUS Thoracic supervisor, SAM evidence'); await apForm.locator('input[name=reviewer]').fill('E2E reviewer');
await apForm.locator('button').click();
await adm.page.waitForSelector('text=1 scope approved.').then(() => ok('admin approved a scoped supervisor')).catch(() => fail('admin approval'));
await shot(adm.page, 'admin-person-1440');
const P1 = await get(app.page, '/api/app/professional');
const kinds = P1.badges.map((b) => b.kind).sort().join(',');
if (kinds !== 'credential,email,registration,wavelength-supervisor') fail('badges after approval: ' + kinds); else ok('badges: email, registration, credential, Wavelength supervisor (FAMUS Thoracic)');
await app.page.evaluate(() => { location.hash = '#/me'; }); await app.page.evaluate(() => { location.hash = '#/professional'; });
await app.page.waitForSelector('[data-badge]'); await app.page.locator('[data-badge]').last().click();
await app.page.waitForSelector('.sheet-bg'); await shot(app.page, 'badge-detail-390');
await app.page.locator('.sheet-bg [data-close]').click();

// ---- 6. Dashboard sign-off carries the snapshot; the verify page shows it ----
const L = await ctxFor('learner');
await L.page.goto(BASE + '/app/');
await post(L.page, '/api/app/signup', { firstName: 'Sam', lastName: 'Patel', email: lEmail, password: 'longpassword2', terms: true });
await post(L.page, '/api/app/profile', { declaration: true, profile: { pathways: ['famus'], onboarded: true } });
await post(L.page, '/api/app/sync', { entries: [{ id: 'l' + t.toString(36) + 'a', type: 'lung', date: '2026-09-02', supervision: 'direct' }] });
await post(L.page, '/api/app/supervisors/add', { email: supEmail });
const inv = (await get(app.page, '/api/app/supervisors')).invites[0];
const acc = await post(app.page, '/api/app/supervisors/accept', { id: inv.id });
if (!acc.ok) fail('verified supervisor could not accept ' + JSON.stringify(acc));
const link = (await get(L.page, '/api/app/supervisors')).supervisors[0];
const so = await post(L.page, '/api/app/signoff/request', { entryIds: ['l' + t.toString(36) + 'a'], supervisorLink: link.id });
const done = await post(app.page, '/api/app/supervise/signoff', { code: so.code, name: 'Dr John Smith', role: 'Consultant', confirm: '1', signature: SIG, decisions: { ['l' + t.toString(36) + 'a']: 'confirmed' } });
if (!done.ok) fail('dashboard sign-off ' + JSON.stringify(done));
const V = await ctxFor('verifier');
await V.page.goto(`${BASE}/app/verify/?code=${so.code}`);
await V.page.waitForSelector('text=Verified when signed', { timeout: 8000 }).then(() => ok('verify page shows what was verified at signing')).catch(() => fail('verify page lacks the snapshot'));
if (await V.page.locator(`text=${GMC}`).count()) fail('registration number shown on the public verify page');
await shot(V.page, 'verify-snapshot-390');

// ---- 7. Directory opt-in ----
await post(app.page, '/api/app/professional/directory', { listed: true, region: 'Kent', country: 'GB' });
const dir = await get(V.page, '/api/app/directory?pathway=famus');
if (!dir.supervisors.length || JSON.stringify(dir).includes(supEmail)) fail('directory ' + JSON.stringify(dir).slice(0, 200)); else ok('directory lists the opted-in supervisor, no email');

// ---- 8. Invitation link verifies a brand new supervisor's email ----
await post(L.page, '/api/app/supervisors/add', { email: invEmail });
const invTok = lastToken(invEmail, /invite=([A-Za-z0-9_-]+)/);
if (!invTok) fail('no invitation email captured');
const N = await ctxFor('new-supervisor');
await N.page.goto(`${BASE}/app/?login=${encodeURIComponent(invEmail)}#/supervise?invite=${invTok}`);
await N.page.waitForSelector('#em');
await N.page.goto(`${BASE}/app/#/signup`);
await N.page.fill('#fn', 'Ivy'); await N.page.fill('#ln', 'Ng'); await N.page.fill('#em', invEmail); await N.page.fill('#pw', 'longpassword3');
await N.page.check('input[name=terms]'); await N.page.click('#f button[type=submit]');
await N.page.waitForTimeout(1500);
const me = await get(N.page, '/api/app/me');
if (me.account.emailStatus !== 'verified') fail('invitation did not verify the email: ' + me.account.emailStatus); else ok('invitation link accepted after sign-up, email verified');
const links = await get(L.page, '/api/app/supervisors');
if (!links.supervisors.some((s) => s.email === invEmail && s.status === 'active')) fail('invited supervisor not active'); else ok('invited supervisor linked');

// ---- 9. Academy: returning learners get a sign-in link ----
const mod = (await (await fetch(BASE + '/elearning/')).text()).match(/href="\/elearning\/([a-z0-9-]+)\/"/)[1];
const A1 = await ctxFor('academy1');
await A1.page.goto(`${BASE}/elearning/${mod}/`);
const fill = async (p) => { await p.selectOption('select[name=title]', 'Dr'); await p.fill('input[name=first_name]', 'Ann'); await p.fill('input[name=last_name]', 'Lee'); await p.fill('input[name=email]', `acad${t}@example.com`); await p.selectOption('select[name=role]', { index: 1 }); await p.check('input[name=privacy]'); await p.click('[data-ac-register] button[type=submit]'); };
await fill(A1.page); await A1.page.waitForURL(/\/learn\//, { timeout: 10000 }).then(() => ok('new Academy learner starts at once')).catch(() => fail('new Academy learner not redirected'));
const A2 = await ctxFor('academy2');
await A2.page.goto(`${BASE}/elearning/${mod}/`);
await fill(A2.page);
await A2.page.waitForSelector('text=We have sent you a link', { timeout: 8000 }).then(() => ok('returning Academy learner gets a sign-in link')).catch(() => fail('returning learner was not sent a link'));
await shot(A2.page, 'academy-check-email-390');
const sTok = lastToken(`acad${t}@example.com`);
await A2.page.goto(`${BASE}/app/#/verify-email/${sTok}`);
await A2.page.waitForURL(/\/elearning\//, { timeout: 10000 }).then(() => ok('sign-in link continues the module')).catch(() => fail('sign-in link did not continue'));

// ---- 10. Wide layouts ----
const W = await ctxFor('wide', { w: 1440 });
await W.page.goto(BASE + '/app/'); await post(W.page, '/api/app/login', { email: supEmail, password: 'longpassword1' });
await W.page.goto(BASE + '/app/?w=1#/professional'); await W.page.waitForSelector('#rgf'); await shot(W.page, 'professional-1440');

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'All verification end-to-end checks passed.');
process.exit(errors.length ? 1 : 0);
