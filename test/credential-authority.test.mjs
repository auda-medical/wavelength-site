// Pathway-specific supervision authority and directory-assisted credential verification (Phase B and C):
// a directory name match never verifies anyone; identity is confirmed independently; modules and capacities limit what
// a supervisor may sign; FUSIC Heart mentors never sign the triggered assessment; FUSIC trainers only for their module;
// FAMUS peripheral access is local; losing a listing pauses privileges; the GMC workflow is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, ctx, ORIGIN } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm, SIG, gmcCheck, withMailbox } from './helpers/verify.mjs';
import worker from '../worker/index.js';
import { handleApp } from '../worker/app.js';
import { supervisorsAdminPost, supervisorsAdminHtml } from '../worker/supervisors-admin.js';
import { allowedActions, capacitiesFor, authority, actionsForSignoff, actionsForAssessment, credentialState, STATES } from '../worker/verification/pathways.js';
import { directoryReview, directoryUrl, listableModules, maskEmail } from '../worker/verification/directory-review.js';
import { sameOrganisation, publicSnapshot } from '../worker/professional.js';
import { ukDate, addDays } from '../worker/time.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };
import CREDS from '../data/credentials.json' with { type: 'json' };

const env0 = (extra = {}) => makeEnv({ PROFESSIONAL_VERIFY: 'true', ...extra });
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength', ctx);
const today = ukDate();
async function gmcVerified(env, email, { first = 'John', last = 'Smith', number = '1234567', org = 'Darent Valley Hospital' } = {}) {
  const c = await verifiedAccount(env, email, { firstName: first, lastName: last, organisation: org });
  const r = await c.call('/api/app/professional/registration', { regulator: 'gmc', number, profession: 'Doctor', organisation: org });
  assert.ok(r.body.registration, JSON.stringify(r.body));
  const lid = await idOf(env, email);
  assert.equal((await admin(env, { action: 'reg_gmc_check', learner: lid, sid: r.body.registration.id, ...gmcCheck({ register_name: `${first} ${last}` }) })).m, 'GMC registration verified.');
  return { c, lid };
}
const claim = async (c, type, modules) => (await c.call('/api/app/professional/credential', { type, modules })).body.credential;
const credRow = (env, id) => env.DB.prepare('SELECT * FROM credentials WHERE id = ?').bind(id).first();
const check = (o = {}) => ({ action: 'cred_directory_check', listed: 'yes', listed_name: 'John Smith', listed_org: 'Darent Valley Hospital', modules: ['thoracic'], checked_on: today, notes: 'Directory', ...o });

// ---------- Policy ----------
test('policy: FUSIC Heart mentors review and give feedback but never sign the triggered assessment; supervisors do', () => {
  assert.deepEqual(capacitiesFor('fusic', 'fusic-heart').sort(), ['mentor', 'supervisor']);
  assert.ok(!allowedActions('fusic', 'fusic-heart', 'mentor').includes('final'));
  assert.ok(!allowedActions('fusic', 'fusic-heart', 'mentor').includes('summative'));
  assert.ok(allowedActions('fusic', 'fusic-heart', 'mentor').includes('review'));
  assert.ok(allowedActions('fusic', 'fusic-heart', 'supervisor').includes('final'));
});

test('policy: FUSIC trainers are recognised per module and never as Heart mentors or supervisors', () => {
  assert.ok(capacitiesFor('fusic', 'fusic-lung').includes('trainer'));
  assert.ok(!capacitiesFor('fusic', 'fusic-heart').includes('trainer'), 'Heart uses mentors and supervisors, not trainers');
  assert.ok(!capacitiesFor('fusic', 'fusic-lung').includes('mentor'));
  const lungTrainer = [{ pathway: 'fusic', module: 'fusic-lung', capacity: 'trainer' }];
  assert.ok(authority(lungTrainer, 'fusic:fusic-lung', ['final']));
  assert.equal(authority(lungTrainer, 'fusic:fusic-dvt', ['review']), null, 'a Lung trainer is not a DVT trainer');
  assert.equal(authority([{ pathway: 'fusic', module: 'fusic-heart', capacity: 'trainer' }], 'fusic:fusic-heart', ['review']), null);
});

test('policy: FAMUS mentors cannot sign the ACT; peripheral access is approved locally; RCEM is local', () => {
  assert.ok(!allowedActions('famus', 'famus-dvt', 'mentor').includes('final'));
  assert.ok(allowedActions('famus', 'famus-dvt', 'mentor').includes('witness'), 'directly supervised scans may be overseen by a mentor');
  assert.ok(capacitiesFor('famus', 'famus-pva').includes('local_supervisor'));
  assert.ok(!capacitiesFor('famus', 'famus-dvt').includes('local_supervisor'), 'other FAMUS modules need SAM-registered supervisors');
  assert.ok(capacitiesFor('rcem', 'rcem-efast').includes('local_supervisor'));
  assert.deepEqual(actionsForSignoff('both'), ['witness', 'review']);
  assert.deepEqual(actionsForAssessment('dops'), ['dops']);
  assert.deepEqual(actionsForAssessment('anything'), ['final'], 'an unknown kind is treated as the strictest');
  // An "all modules" approval covers only what every module of the pathway allows.
  assert.ok(!allowedActions('fusic', '*', 'mentor').includes('review'), 'mentor is not a role for most FUSIC modules');
});

test('every directory has a fixed https address on the body’s own site, and every credential status maps to a precise state', () => {
  for (const t of CREDS.credentialTypes.filter((x) => x.directory)) {
    assert.ok(directoryUrl(t.id), `${t.id} directory URL`);
    assert.match(t.directory.permission, /hand|manual/i, `${t.id} records a manual-only permission`);
  }
  assert.equal(directoryUrl('esicm-edec'), null, 'EDEC has no directory: evidence only');
  assert.deepEqual(listableModules('famus-supervisor').map((m) => m.id), ['thoracic', 'dvt', 'abdo-renal', 'lp']);
  const day = '2026-10-10';
  assert.equal(credentialState({ status: 'verified', active: 1 }, day), 'verified');
  assert.equal(credentialState({ status: 'verified', active: 1, expires_on: '2026-01-01' }, day), 'expired');
  assert.equal(credentialState({ status: 'directory_match', active: 1 }, day), 'directory_match');
  assert.equal(credentialState({ status: 'source_unavailable', active: 1 }, day), 'verification_requested', 'an outage never reads as verified');
  assert.equal(credentialState({ status: 'rejected', active: 1 }, day), 'unable_to_verify');
  assert.equal(credentialState({ status: 'verified', active: 0 }, day), 'unable_to_verify');
  assert.equal(Object.keys(STATES).length, 9);
});

// ---------- Directory review (pure) ----------
const form = (o) => adminForm(o);
const acct = { first_name: 'John', last_name: 'Smith', email: 'john@nhs.net', email_status: 'verified', organisation: 'Darent Valley Hospital' };
const ctxFor = (o = {}) => ({ type: 'famus-supervisor', account: acct, registrations: [], evidence: [], confirmed: false, sameOrg: sameOrganisation, ...o });

test('a directory name match alone is only a directory match, never verified', () => {
  const r = directoryReview(form(check()), ctxFor());
  assert.equal(r.outcome, 'directory_match');
  assert.equal(r.status, 'directory_match');
});

test('identity routes: listed email = verified account email; listed contact confirmed; registration name and organisation', () => {
  assert.equal(directoryReview(form(check({ listed_email: 'JOHN@nhs.net' })), ctxFor()).outcome, 'verified');
  assert.equal(directoryReview(form(check({ listed_email: 'john@nhs.net' })), ctxFor({ account: { ...acct, email_status: 'unverified' } })).outcome, 'directory_match', 'an unverified account email proves nothing');
  assert.match(directoryReview(form(check({ identity: 'listed_contact_confirmed' })), ctxFor()).error, /No confirmation/);
  assert.equal(directoryReview(form(check({ identity: 'listed_contact_confirmed' })), ctxFor({ confirmed: true })).outcome, 'verified');
  const regs = [{ register_name: 'SMITH, John', organisation: 'Darent Valley Hospital, Dartford and Gravesham NHS Trust' }];
  assert.equal(directoryReview(form(check({ identity: 'registration_and_organisation' })), ctxFor({ registrations: regs })).identity, 'registration_and_organisation');
  assert.match(directoryReview(form(check({ identity: 'registration_and_organisation', listed_org: 'Leeds General Infirmary' })), ctxFor({ registrations: regs })).error, /same organisation/);
  assert.match(directoryReview(form(check({ identity: 'registration_and_organisation' })), ctxFor()).error, /verified registration/);
});

test('duplicate and wrong names, expired and exam-only listings, and employer confirmation for SAM modules are refused', () => {
  const wrong = directoryReview(form(check({ listed_name: 'Jane Doe', listed_email: 'john@nhs.net' })), ctxFor());
  assert.deepEqual([wrong.outcome, wrong.failure], ['review', 'name_mismatch'], 'a different person, even with a matching email field, is held for review');
  const initials = directoryReview(form(check({ listed_name: 'J Smith' })), ctxFor());
  assert.equal(initials.outcome, 'directory_match', 'initials are a possible match, not proof');
  const bse = directoryReview(form(check({ modules: ['tte'], expires_on: addDays(today, -1), listed_email: 'john@nhs.net' })), ctxFor({ type: 'bse-accreditation' }));
  assert.equal(bse.outcome, 'expired');
  assert.match(directoryReview(form(check({ modules: ['tte'] })), ctxFor({ type: 'bse-accreditation' })).error, /expiry/);
  const exam = directoryReview(form(check({ modules: ['tte'], expires_on: addDays(today, 400), stage: 'exam_only', listed_email: 'john@nhs.net' })), ctxFor({ type: 'eacvi-certification' }));
  assert.deepEqual([exam.outcome, exam.failure], ['review', 'not_certified'], 'examination only is not certification');
  assert.match(directoryReview(form(check({ identity: 'employer_confirmation', evidence: '5' })), ctxFor({ evidence: [{ id: 5, kind: 'letter' }] })).error, /locally approved/);
  assert.match(directoryReview(form(check({ modules: ['pva'] })), ctxFor()).error, /Tick the modules/, 'a SAM listing cannot confirm peripheral access');
  assert.equal(directoryReview(form({ action: 'x', listed: 'no', checked_on: today }), ctxFor()).outcome, 'not_listed');
  assert.match(directoryReview(form(check({ checked_on: addDays(today, -30) })), ctxFor()).error, /within the last/);
  assert.match(directoryReview(form(check()), ctxFor({ type: 'esicm-edec' })).error, /no official directory/);
});

// ---------- Integration: admin console, confirmation link, approvals ----------
test('admin directory check: match recorded, confirmation sent to the listed address, GET changes nothing, POST confirms', async () => {
  const env = env0({ ZEPTOMAIL_TOKEN: 'test' });
  const { c, lid } = await gmcVerified(env, 'john@x.co');
  const cred = await claim(c, 'famus-supervisor', ['thoracic', 'dvt']);
  assert.match((await admin(env, { action: 'cred_approve', learner: lid, sid: cred.id, modules: 'thoracic', method: 'manual_register', notes: 'Saw it' })).m, /Record directory check/, 'the generic approval cannot bypass the directory check');
  assert.match((await admin(env, { learner: lid, sid: cred.id, ...check({ modules: ['thoracic', 'dvt'] }) })).m, /directory match/);
  let row = await credRow(env, cred.id);
  assert.equal(row.status, 'directory_match');
  assert.equal((await c.call('/api/app/professional')).body.credentials[0].stateLabel, 'Directory match found');
  assert.ok(!(await c.call('/api/app/professional')).body.badges.some((b) => b.kind === 'credential'), 'no verified badge for a directory match');
  const html = await supervisorsAdminHtml(env, new URL(`${ORIGIN}/admin/supervisors/?id=${lid}`), 'wavelength');
  assert.match(html, /Open the official directory/);
  assert.match(html, /href="https:\/\/www\.acutemedicine\.org\.uk\/famus\/supervisors-and-mentors\/"/);
  await withMailbox(async (box) => {
    assert.match((await admin(env, { action: 'cred_listing_send', learner: lid, sid: cred.id, listed_email: 'J.Smith@NHS.net' })).m, /Confirmation sent to j\*\*\*@nhs\.net/);
    await box.settle();
    const mail = box.sent.find((m) => /Is this you/.test(m.subject));
    assert.ok(mail, 'confirmation email sent');
    assert.equal(mail.to[0].email_address.address, 'j.smith@nhs.net');
    assert.match(mail.textbody, /not run or endorsed by Society for Acute Medicine/);
    const t = (mail.textbody.match(/confirm-listing\?t=([0-9a-f]{48})/) || [])[1];
    assert.ok(t);
    const conf = await env.DB.prepare('SELECT * FROM credential_confirmations').first();
    assert.doesNotMatch(JSON.stringify(conf), /smith@nhs/i, 'the address is stored only as a hash and a masked hint');
    assert.equal((await credRow(env, cred.id)).status, 'identity_pending');
    const page = await worker.fetch(new Request(`${ORIGIN}/api/confirm-listing?t=${t}`), env, ctx);
    assert.match(await page.text(), /Is this you\?/);
    assert.equal((await credRow(env, cred.id)).status, 'identity_pending', 'opening the link changes nothing');
    const f = new FormData(); f.append('t', t); f.append('answer', 'confirm');
    const done = await worker.fetch(new Request(`${ORIGIN}/api/confirm-listing`, { method: 'POST', headers: { Origin: ORIGIN }, body: f }), env, ctx);
    assert.match(await done.text(), /confirmed/);
    row = await credRow(env, cred.id);
    assert.deepEqual([row.status, row.identity_method, JSON.parse(row.modules).sort().join(',')], ['verified', 'listed_contact_confirmed', 'dvt,thoracic']);
    const again = await worker.fetch(new Request(`${ORIGIN}/api/confirm-listing`, { method: 'POST', headers: { Origin: ORIGIN }, body: f }), env, ctx);
    assert.match(await again.text(), /no longer valid|already/, 'single use');
  });
  const ev = (await env.DB.prepare("SELECT action FROM verification_events WHERE subject_type = 'credential' ORDER BY id").all()).results.map((r) => r.action);
  for (const a of ['directory_directory_match', 'listing_confirmation_sent', 'listing_confirmed']) assert.ok(ev.includes(a), `audit: ${a}`);
});

test('"This is not me" stops the claim and flags it for review', async () => {
  const env = env0({ ZEPTOMAIL_TOKEN: 'test' });
  const { c, lid } = await gmcVerified(env, 'imposter@x.co');
  const cred = await claim(c, 'fusic-mentor', ['heart']);
  await admin(env, { learner: lid, sid: cred.id, ...check({ modules: ['heart'] }) });
  await withMailbox(async (box) => {
    await admin(env, { action: 'cred_listing_send', learner: lid, sid: cred.id, listed_email: 'real.person@nhs.net' });
    await box.settle();
    const t = (box.sent[0].textbody.match(/confirm-listing\?t=([0-9a-f]{48})/) || [])[1];
    const f = new FormData(); f.append('t', t); f.append('answer', 'not_me');
    await worker.fetch(new Request(`${ORIGIN}/api/confirm-listing`, { method: 'POST', headers: { Origin: ORIGIN }, body: f }), env, ctx);
  });
  const row = await credRow(env, cred.id);
  assert.deepEqual([row.status, row.failure_state], ['manual_review', 'disputed']);
});

test('losing a listing or a module pauses exactly the approvals that relied on it; GMC alone grants nothing', async () => {
  const env = env0({ SUPERVISOR_APPLY: 'true' });
  const { c, lid } = await gmcVerified(env, 'mods@x.co', { first: 'Ann', last: 'Lee' });
  assert.ok(!(await c.call('/api/app/professional')).body.badges.some((b) => b.kind === 'wavelength-supervisor'), 'a GMC registration is not a supervisor approval');
  const cred = await claim(c, 'famus-supervisor', ['thoracic', 'dvt']);
  await admin(env, { learner: lid, sid: cred.id, ...check({ listed_name: 'Ann Lee', modules: ['thoracic', 'dvt'], listed_email: 'mods@x.co' }) });
  assert.equal((await credRow(env, cred.id)).status, 'verified');
  assert.match((await admin(env, { action: 'appr_add', learner: lid, scope: ['famus:famus-thoracic', 'famus:famus-dvt'], basis: String(cred.id), capacity: 'supervisor', notes: 'Directory and identity confirmed' })).m, /^2 scopes approved\./);
  const scopes = async () => ((await c.call('/api/app/professional')).body.approvals.filter((a) => a.current).map((a) => a.module).sort());
  assert.deepEqual(await scopes(), ['famus-dvt', 'famus-thoracic']);
  // Six months later the directory lists Thoracic only.
  await admin(env, { learner: lid, sid: cred.id, ...check({ listed_name: 'Ann Lee', modules: ['thoracic'], listed_email: 'mods@x.co' }) });
  assert.deepEqual(await scopes(), ['famus-thoracic'], 'DVT stops counting; Thoracic continues');
  // Then not listed at all.
  await admin(env, { learner: lid, sid: cred.id, action: 'cred_directory_check', listed: 'no', checked_on: today, notes: 'Recheck' });
  assert.deepEqual(await scopes(), [], 'no current approval relies on an unlisted credential');
  assert.equal((await credRow(env, cred.id)).failure_state, 'not_listed');
});

test('capacities at approval: a mentor for FUSIC Lung is refused; FUSIC Heart mentor and FAMUS PVA local supervisor are accepted', async () => {
  const env = env0({ SUPERVISOR_APPLY: 'true' });
  const { lid } = await gmcVerified(env, 'cap@x.co');
  assert.match((await admin(env, { action: 'appr_add', learner: lid, scope: ['fusic:fusic-lung'], capacity: 'mentor', notes: 'x' })).m, /not a role for FUSIC Lung/);
  assert.match((await admin(env, { action: 'appr_add', learner: lid, scope: ['fusic:fusic-heart'], capacity: 'mentor', notes: 'ICS directory' })).m, /^1 scope approved\./);
  assert.match((await admin(env, { action: 'appr_add', learner: lid, scope: ['famus:famus-dvt'], capacity: 'local_supervisor', notes: 'x' })).m, /not a role/);
  assert.match((await admin(env, { action: 'appr_add', learner: lid, scope: ['famus:famus-pva'], capacity: 'local_supervisor', notes: 'Trust letter' })).m, /^1 scope approved\./);
  const rows = (await env.DB.prepare('SELECT module, capacity FROM supervisor_approvals WHERE learner_id = ? ORDER BY module').bind(lid).all()).results;
  assert.deepEqual(rows.map((r) => `${r.module}:${r.capacity}`), ['famus-pva:local_supervisor', 'fusic-heart:mentor']);
});

async function mentorPair(env) {
  const { c: sup, lid: sid } = await gmcVerified(env, 'mentor@x.co');
  await admin(env, { action: 'appr_add', learner: sid, scope: ['fusic:fusic-heart'], capacity: 'mentor', notes: 'ICS directory: Mentor FUSIC Heart' });
  const learner = await verifiedAccount(env, 'icu@x.co');
  await learner.call('/api/app/supervisors/add', { email: 'mentor@x.co' });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  const link = (await learner.call('/api/app/supervisors')).body.supervisors[0];
  return { sup, sid, learner, link, lid: await idOf(env, 'icu@x.co') };
}
const assess = (sup, lid, kind, o = {}) => sup.call('/api/app/supervise/assessment/new', { learnerId: lid, pathway: 'fusic', module: 'fusic-heart', kind, name: 'Dr Mentor', role: 'Consultant', confirm: true, signature: SIG, outcome: kind === 'formative' ? 'feedback' : 'competent', domains: { [LOGBOOK.assessmentDomains[0].id]: LOGBOOK.assessmentScale[0] }, ...o });

test('enforced: a FUSIC Heart mentor reviews scans and records formative feedback, but the triggered assessment is refused', async () => {
  const env = env0({ SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'true' });
  const { sup, learner, link, lid } = await mentorPair(env);
  assert.equal((await assess(sup, lid, 'formative')).status, 200);
  const fin = await assess(sup, lid, 'final');
  assert.equal(fin.status, 403);
  assert.deepEqual(fin.body.eligibility, ['capacity']);
  assert.match(fin.body.error, /mentor cannot sign a final or triggered assessment/);
  assert.equal((await assess(sup, lid, 'summative')).status, 403);
  await learner.call('/api/app/sync', { entries: [{ id: 'heartscan01', type: 'cardiac', date: '2026-10-01', supervision: 'indirect' }] });
  const req = await learner.call('/api/app/signoff/request', { entryIds: ['heartscan01'], supervisorLink: link.id });
  const so = await sup.call('/api/app/supervise/signoff', { code: req.body.code, name: 'Dr Mentor', role: 'Consultant', basis: 'reviewed', confirm: true, signature: SIG, decisions: { heartscan01: 'confirmed' } });
  assert.equal(so.status, 200, 'asynchronous review is within a mentor’s role');
});

test('not enforced: a mentor who signs a final assessment is recorded honestly as not authorised for it', async () => {
  const env = env0({ SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false' });
  const { sup, lid } = await mentorPair(env);
  const r = await assess(sup, lid, 'final');
  assert.equal(r.status, 200);
  const raw = (await env.DB.prepare('SELECT supervisor_snapshot FROM assessments WHERE id = ?').bind(r.body.code).first()).supervisor_snapshot;
  const s = JSON.parse(raw);
  assert.deepEqual(s.actions, ['final']);
  assert.deepEqual(s.approvedFor, []);
  assert.equal(s.authority[0].capacity, 'mentor');
  assert.equal(s.authority[0].allowed, false);
  const pub = publicSnapshot(raw);
  assert.equal(pub.wavelengthVerifiedSupervisor, false);
  assert.match(pub.notAuthorisedFor[0], /FUSIC Heart: approved as mentor, which does not cover final/);
  const v = (await client(handleApp, env).call('/api/app/verify?code=' + r.body.code)).body;
  assert.equal(v.supervisorCheck.signer, 'account_not_approved');
});

test('the GMC workflow is preserved: generic verify refused, held for a decision when something is shown', async () => {
  const env = env0();
  const c = await verifiedAccount(env, 'gmc@x.co', { organisation: 'Darent Valley Hospital' });
  const r = await c.call('/api/app/professional/registration', { regulator: 'gmc', number: '7654321', profession: 'Doctor', organisation: 'Darent Valley Hospital' });
  const lid = await idOf(env, 'gmc@x.co');
  assert.match((await admin(env, { action: 'reg_verify', learner: lid, sid: r.body.registration.id, register_name: 'John Smith', checked: '1', notes: 'x' })).m, /Record GMC check/);
  assert.match((await admin(env, { action: 'reg_gmc_check', learner: lid, sid: r.body.registration.id, ...gmcCheck({ restriction: 'shown', notes: 'Conditions shown on the register' }) })).m, /Held for a decision/);
  assert.equal((await env.DB.prepare('SELECT status FROM professional_registrations WHERE id = ?').bind(r.body.registration.id).first()).status, 'manual_review');
});

test('mask and hints never reveal a full address', () => {
  assert.equal(maskEmail('jane.doe@nhs.net'), 'j***@nhs.net');
  assert.equal(maskEmail('bad'), '');
});
