// End-to-end check of the October 2026 app features: international pathways, sign-off with ratings, structured
// assessments (link, in person, dashboard), supervisor links and dashboard, verification, and translated screens.
// Run against `npx wrangler dev --local --local-upstream localhost:8787`. Usage: node tools/e2e-app.mjs <outdir> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
async function ctxFor(lang, w = 390) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, locale: lang });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(lang + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push(lang + ': ' + String(e)));
  return { ctx, page };
}
const post = (page, p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const get = (page, p) => page.evaluate((p) => fetch(p).then((r) => r.json()), p);
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
async function sign(p, sel = '[data-sig]') {
  await p.locator(sel).first().scrollIntoViewIfNeeded(); const b = await p.locator(sel).first().boundingBox();
  await p.mouse.move(b.x + 20, b.y + 40); await p.mouse.down(); await p.mouse.move(b.x + 120, b.y + 70, { steps: 8 }); await p.mouse.move(b.x + 200, b.y + 30, { steps: 8 }); await p.mouse.up();
}
const noOverflow = async (p, name) => { const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (ov) fail('overflow ' + name); };

// ---- Learner (English) ----
const L = await ctxFor('en-GB');
await L.page.goto(BASE + '/app/');
const t = Date.now();
const lEmail = `learner${t}@example.com`, sEmail = `sup${t}@example.com`;
let r = await post(L.page, '/api/app/signup', { title: 'Dr', firstName: 'Sam', lastName: 'Patel', email: lEmail, password: 'Long-password-1', terms: true, role: 'ST4' });
if (!r.ok) throw new Error('signup ' + JSON.stringify(r));
r = await post(L.page, '/api/app/profile', { declaration: true, profile: { pathways: ['acem', 'eusem', 'rcem'], grade: 'ST4 emergency medicine', onboarded: true }, organisation: 'Test Hospital' });
if (!r.ok || r.account.profile.pathways.length !== 3) fail('profile pathways ' + JSON.stringify(r.account && r.account.profile));
const entries = [];
for (let i = 0; i < 12; i++) entries.push({ id: 'e' + t.toString(36) + 'x' + i, type: i < 8 ? 'efast' : 'preg', date: `2026-0${(i % 8) + 1}-1${i % 9}`, setting: i % 4 ? 'Emergency department' : 'Healthy volunteer', age: i === 3 ? 'Under 16' : '31 to 50', supervision: i < 6 ? 'direct' : 'mentored', supervisor: 'Dr Lee', findings: i < 8 ? { ruq: i % 3 ? 'No free fluid' : 'Free fluid', luq: 'No free fluid', pelvis: 'No free fluid', pericardium: 'No effusion', ptx: 'None' } : { iup: 'Yes', fh: 'Present' }, overall: i % 3 ? 'Normal' : 'Abnormal', reflection: 'Learnt to look at the inferior tip of the liver before calling the RUQ negative.', updatedAt: t });
r = await post(L.page, '/api/app/sync', { entries });
if (!r.ok || r.saved.length !== 12) fail('sync ' + JSON.stringify(r).slice(0, 200));

// Supervisor account and link
const S = await ctxFor('fr-FR');
await S.page.goto(BASE + '/app/');
r = await post(S.page, '/api/app/signup', { title: 'Dr', firstName: 'Ana', lastName: 'Lee', email: sEmail, password: 'Long-password-2', terms: true, role: 'Consultant' });
if (!r.ok) fail('sup signup');
await post(S.page, '/api/app/profile', { declaration: true, profile: { pathways: ['general'], onboarded: true, supervisor: true, grade: 'Consultant in emergency medicine' } });
r = await post(L.page, '/api/app/supervisors/add', { email: sEmail });
if (!r.ok || !r.hasAccount) fail('add supervisor ' + JSON.stringify(r));
r = await get(S.page, '/api/app/supervisors');
if (!r.invites || r.invites.length !== 1) fail('invites ' + JSON.stringify(r));
const inviteId = r.invites[0].id;
// With email verification on (ZEPTOMAIL_TOKEN in .dev.vars), a supervisor confirms their email before accepting.
// MAIL_LOG is the file a local ZeptoMail stand-in writes (ZEPTOMAIL_API points at it); see tools/e2e-verification.mjs.
if (process.env.MAIL_LOG) {
  const mail = fs.readFileSync(process.env.MAIL_LOG, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)).filter((m) => m.to[0].email_address.address === sEmail);
  const tok = mail.map((m) => (String(m.textbody).match(/verify-email\/([A-Za-z0-9_-]+)/) || [])[1]).filter(Boolean).pop();
  if (!(await post(S.page, '/api/app/email/verify', { token: tok })).verified) fail('supervisor email verification');
}
r = await post(S.page, '/api/app/supervisors/accept', { id: inviteId });
if (!r.ok) fail('accept ' + JSON.stringify(r));
r = await get(L.page, '/api/app/supervisors');
const link = r.supervisors.find((x) => x.status === 'active');
if (!link) fail('learner sees active link');

// Sign-off request to dashboard + link, supervisor signs from dashboard with ratings
r = await post(L.page, '/api/app/signoff/request', { entryIds: entries.slice(0, 3).map((e) => e.id), supervisorName: 'Dr Lee', supervisorLink: link.id });
if (!r.ok || !r.toDashboard) fail('signoff to dashboard ' + JSON.stringify(r));
const soCode = r.code;
r = await get(S.page, '/api/app/supervise/learner?id=' + (await get(S.page, '/api/app/supervisors')).learners[0].id);
if (!r.ok || r.signoffRequests.length !== 1) fail('dashboard requests ' + JSON.stringify(r).slice(0, 300));
const learnerId = r.learner.id;
const acem = r.summary.pathways.find((p) => p.id === 'acem');
const ef = acem.modules.find((m) => m.id === 'acem-efast');
console.log('ACEM eFAST', ef.counted, ef.rules.map((x) => x.label + ' ' + x.n + '/' + x.min).join('; '), ef.assessments.map((a) => a.label + ' ' + a.n).join('; '));
if (ef.rules.find((x) => x.label === 'Positive scans').n !== 3) fail('ACEM positive rule count');
if (ef.rules.find((x) => x.label === 'Clinically indicated').n !== 6) fail('ACEM clinical rule count');
const eus = r.summary.pathways.find((p) => p.id === 'eusem');
if (eus.modules.find((m) => m.id === 'eusem-paeds').logged !== 1) fail('EUSEM paediatric filter');
r = await post(S.page, '/api/app/supervise/signoff', { code: soCode, name: 'Dr Ana Lee', role: 'Consultant', basis: 'witnessed', confirm: '1', signature: SIG, decisions: { [entries[0].id]: 'confirmed', [entries[1].id]: 'confirmed', [entries[2].id]: 'query' }, ratings: { [entries[0].id]: { image: 'g', accuracy: 'a' } } });
if (!r.ok) fail('dashboard signoff ' + JSON.stringify(r));
r = await get(L.page, '/api/app/sync?since=0');
const e0 = r.entries.find((e) => e.id === entries[0].id);
if (!e0.signoff || e0.signoff.rating.image !== 'g' || e0.signoff.method !== 'dashboard') fail('rating stored ' + JSON.stringify(e0.signoff));

// Sign-off by link page with ratings (UI, French supervisor)
r = await post(L.page, '/api/app/signoff/request', { entryIds: entries.slice(3, 5).map((e) => e.id), supervisorName: 'Dr Roux' });
const linkUrl = BASE + new URL(r.link).pathname + new URL(r.link).hash;
const V = await ctxFor('fr-FR');
await V.page.goto(linkUrl); await V.page.waitForSelector('#sf');
await V.page.fill('#as-r', 'Consultant'); await V.page.selectOption('#as-a', 'EUSEM ultrasound faculty');
await V.page.locator('label.tl-g').first().click(); await V.page.locator('label.tl-r').nth(1).click();
await sign(V.page); await V.page.check('input[name=confirm]');
await V.page.screenshot({ path: `${out}/sign-fr-390.png`, fullPage: true });
// Signer details: name, role, registration and accreditation boxes share one left edge and one width.
const boxes = await V.page.evaluate(() => ['#as-n', '#as-r', '#as-g', '#as-a'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return Math.round(r.left) + '/' + Math.round(r.width); }));
if (new Set(boxes).size !== 1) fail('signer detail boxes not aligned: ' + boxes.join(' '));
await noOverflow(V.page, 'sign-fr');
await V.page.click('#sf button.teal'); await V.page.waitForSelector('.ok', { timeout: 8000 }).catch(() => fail('link sign-off did not complete'));
await V.page.waitForTimeout(300); await V.page.screenshot({ path: `${out}/sign-done-fr-390.png`, fullPage: true });
const lede = await V.page.textContent('#root');
if (!/Merci|Thank/.test(lede)) fail('sign result text');

// Assessment by link (UI)
r = await post(L.page, '/api/app/assessment/request', { pathway: 'acem', module: 'acem-efast', kind: 'summative', entryIds: [entries[0].id], learnerReflection: 'Please watch my LUQ view.' });
if (!r.ok) fail('assessment request ' + JSON.stringify(r));
const asUrl = BASE + new URL(r.link).pathname + new URL(r.link).hash;
const A = await ctxFor('en-GB');
await A.page.goto(asUrl); await A.page.waitForSelector('#af');
await A.page.fill('#as-n', 'Dr Grey'); await A.page.fill('#as-r', 'Emergency ultrasound director');
for (const d of ['prep', 'acquire', 'optimise', 'interpret', 'integrate', 'record']) await A.page.locator(`label[for="d-${d}-2"]`).click();
await A.page.locator('input[name=outcome][value=competent] + label').click();
await A.page.fill('#as-s', 'Smooth probe handling.'); await sign(A.page); await A.page.check('input[name=confirm]');
await A.page.screenshot({ path: `${out}/assess-link-390.png`, fullPage: true });
await A.page.click('#af button.teal'); await A.page.waitForSelector('.ok', { timeout: 8000 }).catch(() => fail('assessment link did not complete'));
const asCode = ((await A.page.textContent('.ok')).match(/AS-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0];
if (!asCode) fail('no AS code');

// In-person assessment (API) and dashboard assessment
r = await post(L.page, '/api/app/assessment/inperson', { pathway: 'acem', module: 'acem-efast', kind: 'formative', entryIds: [], domains: { prep: 'Meets expected' }, outcome: 'feedback', name: 'Dr Lee', role: 'Consultant', confirm: '1', signature: SIG });
if (!r.ok) fail('in-person assessment ' + JSON.stringify(r));
r = await post(S.page, '/api/app/supervise/assessment/new', { learnerId, pathway: 'acem', module: 'acem-efast', kind: 'formative', domains: { acquire: 'Borderline' }, outcome: 'progressing', name: 'Dr Ana Lee', role: 'Consultant', confirm: '1', signature: SIG });
if (!r.ok) fail('dashboard assessment ' + JSON.stringify(r));
r = await post(S.page, '/api/app/supervise/assessment/new', { learnerId, pathway: 'acem', module: 'acem-efast', kind: 'summative', domains: { acquire: 'Borderline' }, outcome: 'feedback', name: 'Dr Ana Lee', role: 'Consultant', confirm: '1', signature: SIG });
if (r.ok) fail('summative with feedback-only outcome should be refused');
r = await get(L.page, '/api/app/assessments');
if (r.assessments.filter((a) => a.status === 'signed').length !== 3) fail('assessment list ' + r.assessments.length);

// Verify AS and evidence
r = await get(L.page, '/api/app/verify?code=' + asCode);
if (!r.ok || r.kind !== 'assessment' || r.outcomeId !== 'competent') fail('verify AS ' + JSON.stringify(r));
r = await post(L.page, '/api/app/evidence', { from: '2026-01-01', to: '2026-12-31', pathway: 'acem', destination: 'acem' });
if (!r.ok) fail('evidence ' + JSON.stringify(r).slice(0, 200));
else {
  const m = r.summary.pathways[0].modules.find((x) => x.id === 'acem-efast');
  console.log('Evidence eFAST assessments', JSON.stringify(m.assessments));
  if (m.assessments.find((a) => a.kind === 'formative').n !== 2 || m.assessments.find((a) => a.kind === 'summative').n !== 1) fail('evidence assessment counts');
  for (const [code, name] of [[r.code, 'verify-ev'], [asCode, 'verify-as'], [soCode, 'verify-so']]) {
    const vp = await L.ctx.newPage(); await vp.goto(`${BASE}/app/verify/?code=${code}`); await vp.waitForSelector('.ok, .err'); await noOverflow(vp, name); await vp.screenshot({ path: `${out}/${name}-390.png`, fullPage: true }); await vp.close();
  }
}

// App screens in English
await L.page.goto(BASE + '/app/#/'); await L.page.reload(); await L.page.waitForSelector('.hero', { timeout: 15000 }); await L.page.waitForTimeout(2500);
for (const [h, name] of [['#/', 'home'], ['#/progress/acem', 'progress-acem'], ['#/progress/eusem', 'progress-eusem'], ['#/assess', 'assess'], ['#/supervisors', 'supervisors'], ['#/me', 'me'], ['#/new?type=efast', 'new'], ['#/entry/' + entries[0].id, 'entry']]) {
  await L.page.goto(BASE + '/app/' + h); await L.page.waitForTimeout(900); await noOverflow(L.page, name); await L.page.screenshot({ path: `${out}/app-${name}-390.png`, fullPage: true });
}
// Supervisor app screens in French
await S.page.goto(BASE + '/app/#/supervise'); await S.page.reload(); await S.page.waitForTimeout(2500);
await S.page.screenshot({ path: `${out}/fr-supervise-390.png`, fullPage: true }); await noOverflow(S.page, 'fr-supervise');
await S.page.goto(BASE + '/app/#/supervise/' + learnerId); await S.page.waitForTimeout(2500);
await S.page.screenshot({ path: `${out}/fr-learner-390.png`, fullPage: true }); await noOverflow(S.page, 'fr-learner');
// Welcome screens in each language
for (const lang of ['fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh']) {
  const W = await ctxFor(lang);
  await W.page.goto(BASE + '/app/?lang=' + lang + '#/welcome'); await W.page.waitForSelector('.auth', { timeout: 10000 }); await W.page.waitForTimeout(700);
  const dir = await W.page.evaluate(() => document.documentElement.dir);
  if (lang === 'ar' && dir !== 'rtl') fail('arabic not rtl');
  await noOverflow(W.page, 'welcome-' + lang); await W.page.screenshot({ path: `${out}/welcome-${lang}-390.png`, fullPage: true }); await W.ctx.close();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'All checks passed');
await browser.close();
process.exit(errors.length ? 1 : 0);
