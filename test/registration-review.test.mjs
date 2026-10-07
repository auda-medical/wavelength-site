// Regulator-specific manual review of professional registrations (worker/verification/register-review.js) and the
// public wording of supervisor status. GMC controls appear only for regulator = GMC; every other regulator keeps the
// generic manual check. Nothing here (or in the code) contacts the GMC: the link is only opened by an admin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm, gmcCheck } from './helpers/verify.mjs';
import { supervisorsAdminPost, supervisorsAdminHtml } from '../worker/supervisors-admin.js';
import { checkRegistration, currentStatus, badgesFrom, SIGNER_LABELS } from '../worker/professional.js';
import { gmcRegisterUrl, gmcReview, isGmc, RESTRICTION_STATE, GMC_SOURCE } from '../worker/verification/register-review.js';
import { areaLabels } from '../worker/supervisor-lifecycle.js';
import { ukDate, addDays } from '../worker/time.js';

globalThis.fetch = async () => new Response('{}');
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength', ctx);
const page = (env, q) => supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/${q}`), 'wavelength');
const regEnv = () => makeEnv({ PROFESSIONAL_VERIFY: 'true' });
const claim = (c, regulator, number, profession) => c.call('/api/app/professional/registration', { regulator, number, profession });
const regRow = (env, regulator) => env.DB.prepare('SELECT * FROM professional_registrations WHERE regulator = ? AND active = 1').bind(regulator).first();
// The registration card for one row on the person page: from its heading to the next card.
const cardFor = (html, regName) => { const i = html.indexOf(`<h4>${regName}`); assert.ok(i >= 0, `card for ${regName}`); const j = html.indexOf('<div class="sv-card">', i + 1); return html.slice(i, j < 0 ? undefined : j); };

async function gmcRegistrant(env, email = 'doc@x.co', number = '7654321') {
  const c = await verifiedAccount(env, email);
  const r = await claim(c, 'gmc', number, 'Doctor');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { c, id: await idOf(env, email), row: await regRow(env, 'gmc') };
}

test('1. a valid GMC number gives exactly the official registrant URL, on gmc-uk.org only', () => {
  assert.equal(gmcRegisterUrl('gmc', '7654321'), 'https://www.gmc-uk.org/registrants/7654321');
  assert.equal(gmcRegisterUrl('gmc', '0000001'), 'https://www.gmc-uk.org/registrants/0000001');
  assert.ok(isGmc('gmc') && !isGmc('GMC') && !isGmc('gphc'));
});

test('2. a malformed GMC number never produces an external link', () => {
  for (const bad of ['123456', '12345678', '12a4567', ' 7654321', '7654321 ', '7654321/../x', '7654321?name=John', '7654321#x', '', null, undefined, {}, ['7654321'], '７６５４３２１']) {
    assert.equal(gmcRegisterUrl('gmc', bad), null, `no link for ${JSON.stringify(bad)}`);
  }
});

test('3 and 13. other regulators never get a GMC link or GMC controls, and keep their own manual check', async () => {
  for (const reg of ['gphc', 'nmc', 'hcpc', 'imc', 'nmbi', 'big', 'rct', 'GMC', '', null]) assert.equal(gmcRegisterUrl(reg, '7654321'), null, `${reg}: no GMC link`);
  const env = regEnv();
  const c = await verifiedAccount(env, 'pharm@x.co');
  // GPhC numbers are also 7 digits: the number alone must never make it look like a GMC registration.
  assert.equal((await claim(c, 'gphc', '2012345', 'Pharmacist')).status, 200);
  const id = await idOf(env, 'pharm@x.co');
  const row = await regRow(env, 'gphc');
  const card = cardFor(await page(env, `?id=${id}`), 'General Pharmaceutical Council');
  assert.doesNotMatch(card, /Open GMC register|gmc-uk\.org|reg_gmc_check|Record a GMC register check|Licence to practise/);
  assert.match(card, /value="reg_verify"/, 'the generic manual check is still there');
  assert.match(card, /value="reg_recheck"/);
  assert.match(card, /Open the official GPhC register/);
  const refused = await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck() });
  assert.equal(refused.m, 'The GMC check applies only to GMC registrations.');
  assert.equal((await regRow(env, 'gphc')).status, 'manual_verification_required', 'unchanged');
  const ok = await admin(env, { action: 'reg_verify', learner: id, sid: row.id, register_name: 'John Smith', checked: '1', notes: 'GPhC register' });
  assert.equal(ok.m, 'Registration verified.');
  const after = await regRow(env, 'gphc');
  assert.equal(after.status, 'verified');
  assert.equal(after.verification_source, 'gphc-public-register');
});

test('GMC registrations get the GMC controls, and not the generic ones', async () => {
  const env = regEnv();
  const { id, row } = await gmcRegistrant(env);
  const card = cardFor(await page(env, `?id=${id}`), 'General Medical Council');
  assert.match(card, /<a class="btn btn-ghost small" href="https:\/\/www\.gmc-uk\.org\/registrants\/7654321" target="_blank" rel="noopener noreferrer">Open GMC register<\/a>/);
  for (const field of ['register_name', 'number_matched', 'registration_current', 'licence_current', 'restriction', 'checked_on', 'notes', 'reviewer']) assert.match(card, new RegExp(`name="${field}"`), field);
  assert.match(card, /Name shown on the GMC register/);
  assert.match(card, /Source: GMC register/);
  assert.doesNotMatch(card, /value="reg_verify"|value="reg_recheck"/, 'no generic verify or automatic recheck for GMC');
  assert.doesNotMatch(card, /John Smith[^<]*gmc-uk|registrants\/[^"]*@/, 'nothing personal in the URL');
  const generic = await admin(env, { action: 'reg_verify', learner: id, sid: row.id, register_name: 'John Smith', checked: '1' });
  assert.match(generic.m, /Record GMC check/);
  assert.equal((await admin(env, { action: 'reg_recheck', learner: id, sid: row.id })).m, 'GMC registrations have no automatic check. Record a GMC register check instead.');
  assert.equal((await regRow(env, 'gmc')).status, 'manual_verification_required');
});

test('4. changing the regulator away from GMC removes the GMC behaviour from the application', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const sup = await verifiedAccount(env, 'switch@x.co');
  const base = { role: 'Consultant', organisation: 'Darent Valley Hospital', experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true }, justification: 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.', evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'] };
  const d1 = await sup.call('/api/app/supervisor/application', { ...base, registration: { regulator: 'gmc', number: '7654321', profession: 'Doctor' } });
  assert.equal(d1.status, 200, JSON.stringify(d1.body));
  const s1 = await sup.call('/api/app/supervisor/submit', { declaration: true });
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  const app1 = await env.DB.prepare('SELECT * FROM supervisor_applications').first();
  assert.match(await page(env, `?app=${app1.id}`), /Open GMC register/, 'GMC: the link shows');
  // Back to draft (as "Ask for more information" does) and change regulator.
  assert.match((await admin(env, { action: 'app_more', app: app1.id, notes: 'Please confirm your regulator.' })).m, /./);
  const r = await sup.call('/api/app/supervisor/application', { registration: { regulator: 'gphc', number: '2012345', profession: 'Pharmacist' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const app2 = await env.DB.prepare('SELECT a.*, r.regulator FROM supervisor_applications a JOIN professional_registrations r ON r.id = a.registration_id WHERE a.id = ?').bind(app1.id).first();
  assert.equal(app2.regulator, 'gphc');
  const html = await page(env, `?app=${app1.id}`);
  assert.doesNotMatch(html, /Open GMC register|gmc-uk\.org\/registrants/, 'no GMC link once the application names another regulator');
  // The GPhC row never carries GMC review fields, and GMC actions on it are refused.
  const gphc = await regRow(env, 'gphc');
  assert.equal(gphc.register_fields, null);
  assert.equal((await admin(env, { action: 'reg_gmc_check', learner: gphc.learner_id, sid: gphc.id, ...gmcCheck() })).m, 'The GMC check applies only to GMC registrations.');
  assert.equal((await admin(env, { action: 'reg_gmc_decide', learner: gphc.learner_id, sid: gphc.id, decision: 'verify', notes: 'Considered and acceptable.' })).m, 'The GMC check applies only to GMC registrations.');
});

test('5. showing or opening the GMC link never changes the registration', async () => {
  const env = regEnv();
  const { id, row } = await gmcRegistrant(env);
  const before = { ...(await regRow(env, 'gmc')) };
  const events = (await env.DB.prepare('SELECT COUNT(*) AS n FROM verification_events').first()).n;
  const html = await page(env, `?id=${id}`);
  // The link is a plain external link: no form, no Wavelength route, nothing for the Worker to act on.
  const link = html.match(/<a [^>]*>Open GMC register<\/a>/)[0];
  assert.match(link, /href="https:\/\/www\.gmc-uk\.org\/registrants\/7654321"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.doesNotMatch(link, /\/admin\/|action=|onclick/);
  assert.deepEqual({ ...(await regRow(env, 'gmc')) }, before, 'the row is unchanged');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM verification_events').first()).n, events, 'no event written');
  assert.equal(row.status, 'manual_verification_required');
});

test('6 and 8. an explicit GMC check verifies the registration and records who, when, the source and the result', async () => {
  const env = regEnv();
  const { c, id, row } = await gmcRegistrant(env);
  const today = ukDate();
  // Every required confirmation is needed.
  for (const [o, msg] of [[{ register_name: '' }, /Enter the name/], [{ number_matched: '' }, /GMC number on the register matches/], [{ registration_current: '' }, /registration is current/], [{ licence_current: '' }, /licence to practise is current/], [{ restriction: '' }, /warning, condition, undertaking or restriction/], [{ checked_on: addDays(today, 1) }, /date you checked/], [{ checked_on: addDays(today, -8) }, /date you checked/], [{ checked_on: 'yesterday' }, /date you checked/]]) {
    assert.match((await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck(o) })).m, msg);
    assert.equal((await regRow(env, 'gmc')).status, 'manual_verification_required');
  }
  const checkedOn = addDays(today, -1);
  const ok = await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck({ checked_on: checkedOn, notes: 'Full registration with a licence to practise' }) });
  assert.equal(ok.m, 'GMC registration verified.');
  const after = await regRow(env, 'gmc');
  assert.equal(after.status, 'verified');
  assert.equal(after.verification_method, 'manual_register');
  assert.equal(after.verification_source, GMC_SOURCE);
  assert.equal(after.register_name, 'John Smith');
  assert.ok(after.verified_at && after.last_checked_at);
  assert.deepEqual(JSON.parse(after.register_fields), { source: 'GMC register', numberMatched: true, registrationCurrent: true, licenceCurrent: true, restrictionShown: false, checkedOn, reviewer: 'Firas' }, 'only the answers, never page content');
  const ev = await env.DB.prepare("SELECT * FROM verification_events WHERE subject_type = 'registration' AND action = 'admin_verified'").first();
  assert.equal(ev.actor, 'admin:wavelength:Firas');
  assert.equal(ev.source, 'gmc-public-register');
  assert.equal(ev.method, 'manual_register');
  assert.equal(ev.outcome, 'verified');
  assert.ok(ev.at);
  assert.match(ev.notes, new RegExp(`GMC register checked on ${checkedOn}: number matched, registration current, licence to practise current, nothing shown`));
  const badge = (await c.call('/api/app/professional')).body.badges.find((b) => b.kind === 'registration');
  assert.equal(badge.label, 'Professional registration ✓');
  assert.equal(badge.regulator, 'GMC');
  const html = await page(env, `?id=${id}`);
  assert.match(html, new RegExp(`Last GMC check recorded: ${checkedOn} by Firas`));
});

test('7. a warning, condition, undertaking or restriction holds the registration for a deliberate decision', async () => {
  const env = regEnv();
  const { c, id, row } = await gmcRegistrant(env);
  assert.match((await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck({ restriction: 'shown', notes: '' }) })).m, /Describe briefly/);
  const held = await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck({ restriction: 'shown', notes: 'Conditions on registration shown' }) });
  assert.match(held.m, /^Held for a decision/);
  let r = await regRow(env, 'gmc');
  assert.equal(r.status, 'manual_review');
  assert.equal(r.failure_state, RESTRICTION_STATE);
  assert.equal(r.verified_at, null);
  assert.equal(JSON.parse(r.register_fields).restrictionShown, true);
  assert.equal((await currentStatus(env, id)).hasReg, false, 'not verified, so no supervisor approval can rely on it');
  assert.ok(!(await c.call('/api/app/professional')).body.badges.some((b) => b.kind === 'registration'));
  // The reason is visible to admins, in the card and in the queue.
  const html = await page(env, `?id=${id}`);
  assert.match(html, /Held for a decision\.<\/b> The GMC register shows a warning, condition, undertaking or restriction/);
  assert.match(html, /Note: GMC register checked on .* Conditions on registration shown/);
  assert.match(html, /value="reg_gmc_decide"/);
  assert.doesNotMatch(cardFor(html, 'General Medical Council'), /value="reg_gmc_check"/, 'no second check until decided');
  assert.match(await page(env, '?tab=claims'), /register_restriction/);
  // Nothing clears the hold by itself: another check, the automatic (manual adapter) check, or the applicant re-entering the number.
  assert.match((await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck() })).m, /held for a decision/);
  await checkRegistration(env, r, 'admin', 'admin:test');
  assert.equal((await claim(c, 'gmc', '7654321', 'Doctor')).status, 200);
  r = await regRow(env, 'gmc');
  assert.deepEqual([r.status, r.failure_state], ['manual_review', RESTRICTION_STATE]);
  // A deliberate decision needs a choice and a reason.
  assert.equal((await admin(env, { action: 'reg_gmc_decide', learner: id, sid: row.id, notes: 'Considered by the clinical lead.' })).m, 'Choose a decision.');
  assert.match((await admin(env, { action: 'reg_gmc_decide', learner: id, sid: row.id, decision: 'verify', notes: 'fine' })).m, /20 characters/);
  const ok = await admin(env, { action: 'reg_gmc_decide', learner: id, sid: row.id, decision: 'verify', notes: 'Conditions are unrelated to ultrasound supervision; discussed with the clinical lead.' });
  assert.equal(ok.m, 'GMC registration verified after consideration.');
  r = await regRow(env, 'gmc');
  assert.deepEqual([r.status, r.failure_state, r.verification_source], ['verified', null, GMC_SOURCE]);
  assert.equal(JSON.parse(r.register_fields).decidedBy, 'Firas');
  const ev = await env.DB.prepare("SELECT * FROM verification_events WHERE action = 'admin_verified_after_consideration'").first();
  assert.equal(ev.actor, 'admin:wavelength:Firas');
  assert.match(ev.notes, /discussed with the clinical lead/);
  assert.ok(await env.DB.prepare("SELECT 1 FROM verification_events WHERE action = 'admin_gmc_held' AND source = 'gmc-public-register'").first(), 'the hold stays in the audit trail');
});

test('7b. a held GMC registration can be marked not current or rejected instead', async () => {
  const env = regEnv();
  const { id, row } = await gmcRegistrant(env);
  await admin(env, { action: 'reg_gmc_check', learner: id, sid: row.id, ...gmcCheck({ restriction: 'shown', notes: 'Suspension shown on the register' }) });
  assert.equal((await admin(env, { action: 'reg_gmc_decide', learner: id, sid: row.id, decision: 'not_current', notes: 'Register shows a current suspension.' })).m, 'Registration marked not current.');
  const r = await regRow(env, 'gmc');
  assert.deepEqual([r.status, r.failure_state], ['not_current', null]);
  assert.equal((await admin(env, { action: 'reg_gmc_decide', learner: id, sid: row.id, decision: 'verify', notes: 'Trying to verify after the decision.' })).m, 'This registration is not held for a decision.');
});

test('the GMC review helper stores only its own answers', () => {
  const f = adminForm(gmcCheck({ register_name: 'Dr John SMITH', notes: 'x'.repeat(900) }));
  const out = gmcReview(f);
  assert.equal(out.outcome, 'verified');
  assert.equal(out.note.length, 500);
  assert.deepEqual(Object.keys(out.fields).sort(), ['checkedOn', 'licenceCurrent', 'numberMatched', 'registrationCurrent', 'restrictionShown', 'source']);
});

test('9. public wording never says the GMC or another body verified or approved the supervisor', () => {
  const root = new URL('../', import.meta.url);
  const files = ['src/app/app.js', 'src/app/sign.js', 'src/app/forms.js', 'build.js', 'mobile/STORE.md',
    ...readdirSync(new URL('worker/', root)).filter((f) => f.endsWith('.js')).map((f) => `worker/${f}`),
    ...readdirSync(new URL('worker/verification/', root)).map((f) => `worker/verification/${f}`),
    ...readdirSync(new URL('src/app/i18n/', root)).map((f) => `src/app/i18n/${f}`),
    ...readdirSync(new URL('data/i18n/', root)).map((f) => `data/i18n/${f}`)];
  const banned = /GMC[- ]verified|verified by (the )?GMC|GMC[- ]approved|approved by (the )?GMC|(RCEM|FAMUS|FUSIC)[- ]approved by Wavelength/i;
  for (const f of files) {
    const text = readFileSync(new URL(f, root), 'utf8');
    const hit = text.match(banned);
    assert.equal(hit, null, `${f}: "${hit && hit[0]}"`);
  }
  assert.equal(SIGNER_LABELS.approved, 'Wavelength Verified Supervisor');
  const app = readFileSync(new URL('src/app/app.js', root), 'utf8');
  assert.ok(app.includes("A Wavelength Verified Supervisor has completed our verification process. We check professional registration where applicable, review relevant qualifications and ultrasound credentials, and approve the supervisor only for the areas of practice supported by that information."));
  assert.ok(app.includes('Verification is performed by Wavelength and does not mean that the supervisor has been accredited or endorsed by GMC, RCEM, FAMUS, FUSIC or another professional body.'));
  assert.ok(app.includes("T('What does Wavelength Verified mean?')"));
  assert.ok(readFileSync(new URL('src/app/sign.js', root), 'utf8').includes("T('What does Wavelength Verified mean?')"), 'on the public verify page too');
});

test('badges say "Professional registration ✓" for every regulator, never the regulator as the verifier', () => {
  const st = { learner: { email_status: 'verified' }, registrations: [{ regulator: 'gmc', active: 1, status: 'verified', verification_method: 'manual_register', verification_source: 'gmc-public-register' }, { regulator: 'nmc', active: 1, status: 'verified', verification_method: 'manual_register', verification_source: 'nmc-public-register' }], credentials: [], approvals: [{ pathway: 'famus', module: 'famus-thoracic', current: true }] };
  const b = badgesFrom({}, st);
  assert.deepEqual(b.filter((x) => x.kind === 'registration').map((x) => [x.label, x.regulator]), [['Professional registration ✓', 'GMC'], ['Professional registration ✓', 'NMC']]);
  assert.equal(b.find((x) => x.kind === 'wavelength-supervisor').label, 'Wavelength Verified Supervisor');
});

test('10 and 11. "Approved to supervise" lists only current Wavelength approvals, never requested or suggested scopes', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const learner = await verifiedAccount(env, 'trainee@x.co');
  await learner.call('/api/app/supervisors/add', { email: 'sup@x.co' });
  const sup = await verifiedAccount(env, 'sup@x.co');
  await sup.call('/api/app/supervisors/accept', { id: (await sup.call('/api/app/supervisors')).body.invites[0].id });
  const sid = await idOf(env, 'sup@x.co');
  // Asks for many areas and pathways (which suggest dozens of scopes) and claims FAMUS credentials.
  assert.equal((await sup.call('/api/app/supervisor/application', { role: 'Consultant', organisation: 'Darent Valley Hospital', registration: { regulator: 'gmc', number: '7654321', profession: 'Doctor' }, experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true }, justification: 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.', evidenceMode: 'explanation', areas: ['lung', 'heart', 'dvt', 'abdomen', 'procedures', 'access'], pathways: ['famus', 'rcem', 'international'] })).status, 200);
  assert.equal((await sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  const shown = async () => ({ link: (await learner.call('/api/app/supervisors')).body.supervisors[0], me: (await sup.call('/api/app/supervisor')).body });
  let s = await shown();
  assert.deepEqual(s.link.areas, [], 'requested areas are not approvals');
  assert.notEqual(s.link.stateLabel, 'Wavelength Verified ✓');
  assert.deepEqual(s.me.areas, []);
  // Registration verified and one scope approved, out of everything requested.
  const reg = await regRow(env, 'gmc');
  assert.equal((await admin(env, { action: 'reg_gmc_check', learner: sid, sid: reg.id, ...gmcCheck() })).m, 'GMC registration verified.');
  const app = await env.DB.prepare('SELECT id FROM supervisor_applications').first();
  assert.match((await admin(env, { action: 'app_approve', app: app.id, scope: ['famus:famus-thoracic', 'famus:famus-dvt'], notes: 'Two scopes on the evidence seen.' })).m, /^Approved until/);
  // A revoked approval and an expired one must not show.
  await env.DB.prepare("UPDATE supervisor_approvals SET status = 'revoked' WHERE module = 'famus-dvt'").run();
  await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes) VALUES (?, 'famus', 'famus-abdo', 'approved', '[]', ?, 'admin:test', ?, 'expired')").bind(sid, addDays(ukDate(), -1), new Date().toISOString()).run();
  s = await shown();
  assert.equal(s.link.stateLabel, 'Wavelength Verified ✓');
  assert.deepEqual(s.link.areas, ['Thoracic (FAMUS pathway)']);
  assert.deepEqual(s.me.areas, ['Thoracic (FAMUS pathway)']);
  assert.deepEqual(areaLabels([{ pathway: 'famus', module: 'famus-lp' }, { pathway: 'rcem', module: '*' }]), ['Ultrasound-assisted LP (FAMUS pathway)', 'All modules (RCEM pathway)']);
});

test('12. an applicant sees "How supervisor verification works" before applying and on the first step', () => {
  const app = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
  const how = app.slice(app.indexOf('function svHow()'), app.indexOf('\n', app.indexOf('function svHow()')));
  for (const t of ['How supervisor verification works', 'professional registration where applicable', 'ultrasound qualifications, credentials or supporting evidence', 'specific areas you want to supervise', 'Approval is scope-specific: holding one credential does not approve every ultrasound area.', 'We may ask for further evidence.', 'Supervisor status is reviewed periodically.', 'Wavelength verification is not accreditation or endorsement by an external professional body.']) assert.ok(how.includes(t), t);
  assert.match(app, /if \(step === 'about'\) \{\n\s+body = \(a\.kind === 'renewal' \? '' : svHow\(\)\)/, 'first step of a new application');
  assert.match(app, /st === 'none' && P\.canApplyAgain\) acts \+= svHow\(\)/, 'status page before applying');
  const { strings } = JSON.parse(readFileSync(new URL('../tools/i18n/strings.json', import.meta.url), 'utf8'));
  assert.ok(strings.includes('How supervisor verification works') && strings.includes('What does Wavelength Verified mean?'), 'listed for translation');
});
