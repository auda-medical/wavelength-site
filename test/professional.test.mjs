// Professional registration and identity matching, through the regulator adapter layer. The live regulators have
// no supported automated source yet, so these tests use the mock adapter (VERIFY_MOCK) for the automatic paths and
// the real configuration for the manual path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, client } from './helpers/env.mjs';
import { verifiedAccount, signup, idOf, adminForm } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { matchNames, VERSION } from '../worker/verification/names.js';
import { supervisorsAdminPost, supervisorsAdminHtml } from '../worker/supervisors-admin.js';
import { recheckDue, checkRegistration } from '../worker/professional.js';

const REGISTER = {
  gmc: {
    1234567: { name: 'John Smith', current: true, fields: { licence: true, specialistRegister: 'Emergency medicine' } },
    2345678: { name: 'SMITH, John Paul', current: true },
    3456789: { name: 'John Smith', current: false, status: 'erased' },
    4567890: { name: 'Jane Doe', current: true },
    5678901: { name: 'J Smith', current: true },
  },
};
const mockEnv = (extra = {}) => makeEnv({ PROFESSIONAL_VERIFY: 'true', VERIFY_MOCK: 'true', VERIFY_MOCK_DATA: structuredClone({ registers: REGISTER, ...extra }) });
const claim = (c, number, regulator = 'gmc') => c.call('/api/app/professional/registration', { regulator, number, profession: 'Doctor' });

test('name matching: formatting differences match, different people never do', () => {
  const m = (a, b) => matchNames(a, b).result;
  assert.equal(m({ given: 'John', family: 'Smith' }, 'John Smith'), 'match');
  assert.equal(m({ given: 'john', family: 'SMITH' }, 'Dr John Smith'), 'match');
  assert.equal(m({ given: 'John', family: 'Smith' }, 'SMITH, John Paul'), 'match');
  assert.equal(m({ given: 'Siobhán', family: "O'Brien" }, 'Siobhan OBrien'), 'match');
  assert.equal(m({ given: 'Mary', family: 'Smith-Jones' }, 'Mary Smith Jones'), 'match');
  assert.equal(m({ given: 'Firas', family: 'Abou-Auda' }, 'Firas Abou Auda'), 'match');
  assert.equal(m({ given: 'Anne', family: 'van der Berg' }, 'Anne Vanderberg'), 'match');
  assert.equal(m({ given: 'Prof John', family: 'Smith FRCEM' }, 'John Smith'), 'match');
  assert.equal(m({ given: 'J', family: 'Smith' }, 'John Smith'), 'review', 'initials go to a person');
  assert.equal(m({ given: 'John', family: 'Smith' }, 'J Smith'), 'review');
  assert.equal(m({ given: 'Paul', family: 'Smith' }, 'John Paul Smith'), 'review', 'known by a middle name: review');
  assert.equal(m({ given: 'Mary', family: 'Smith' }, 'Mary Smith-Jones'), 'review', 'one half of a double-barrelled name: review');
  assert.equal(m({ given: 'John Paul', family: 'Smith' }, 'John Smith'), 'review', 'a middle name the register lacks: review');
  assert.equal(m({ given: 'Jane', family: 'Smith' }, 'John Smith'), 'mismatch');
  assert.equal(m({ given: 'John', family: 'Smith' }, 'John Smyth'), 'mismatch');
  assert.equal(m({ given: 'John', family: 'Smith' }, 'Jane Doe'), 'mismatch');
  assert.equal(matchNames({ given: 'a', family: 'b' }, 'a b').version, VERSION);
});

test('a current registration whose name matches is verified automatically, with the method recorded', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'doc@x.co');
  const r = await claim(c, '1234567');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.registration.status, 'verified');
  assert.equal(r.body.registration.method, 'automatic_register');
  const row = await env.DB.prepare('SELECT * FROM professional_registrations').first();
  assert.equal(row.match_result, 'match');
  assert.equal(row.match_method, 'exact');
  assert.equal(row.match_version, VERSION);
  assert.equal(row.verification_source, 'mock:gmc');
  assert.ok(row.next_check_at > Date.now(), 'a recheck is scheduled');
  assert.deepEqual(JSON.parse(row.register_fields), { licence: true, specialistRegister: 'Emergency medicine' }, 'only a few plain fields are kept');
  const ev = await env.DB.prepare("SELECT * FROM verification_events WHERE subject_type = 'registration' AND action = 'automatic_check'").first();
  assert.equal(ev.outcome, 'verified');
  const badges = (await c.call('/api/app/professional')).body.badges.map((b) => b.label);
  assert.ok(badges.includes('GMC registration verified'));
  assert.ok(badges.includes('Email verified'));
});

test('a normalised name (register order, middle names, capitals) still verifies', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'norm@x.co');
  const r = await claim(c, '2345678');
  assert.equal(r.body.registration.status, 'verified');
  assert.equal((await env.DB.prepare('SELECT match_method FROM professional_registrations').first()).match_method, 'normalised');
});

test('unknown, not current, mismatched and ambiguous registrations are never verified', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'many@x.co');
  assert.equal((await claim(c, '9999999')).body.registration.status, 'not_found');
  assert.equal((await claim(c, '3456789')).body.registration.status, 'not_current');
  assert.equal((await claim(c, '4567890')).body.registration.status, 'mismatch');
  assert.equal((await claim(c, '5678901')).body.registration.status, 'manual_review');
  assert.equal((await claim(c, 'abc')).status, 400, 'the number format is checked first');
  const badges = (await c.call('/api/app/professional')).body.badges.map((b) => b.kind);
  assert.ok(!badges.includes('registration'));
});

test('a source outage is not a lapse: a verified registration stays verified and is retried later', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'outage@x.co');
  await claim(c, '1234567');
  env.VERIFY_MOCK_DATA.unavailable = ['gmc'];
  await env.DB.prepare('UPDATE professional_registrations SET next_check_at = 1').run();
  await recheckDue(env);
  let row = await env.DB.prepare('SELECT * FROM professional_registrations').first();
  assert.equal(row.status, 'verified');
  assert.equal(row.failure_state, 'source_unavailable');
  assert.ok(row.next_check_at > Date.now(), 'retry scheduled');
  // When the source is back and the doctor really has left the register, the status follows.
  env.VERIFY_MOCK_DATA.unavailable = [];
  env.VERIFY_MOCK_DATA.registers.gmc['1234567'] = { name: 'John Smith', current: false, status: 'erased' };
  await env.DB.prepare('UPDATE professional_registrations SET next_check_at = 1').run();
  await recheckDue(env);
  row = await env.DB.prepare('SELECT * FROM professional_registrations').first();
  assert.equal(row.status, 'not_current');
  // A new claim while the source is down waits rather than failing.
  const d = await verifiedAccount(env, 'outage2@x.co');
  env.VERIFY_MOCK_DATA.unavailable = ['gmc'];
  assert.equal((await claim(d, '2345678')).body.registration.status, 'source_unavailable');
});

test('one registration number cannot be verified on two accounts, and the second claimant is not told who holds it', async () => {
  const env = mockEnv();
  const a = await verifiedAccount(env, 'real@x.co');
  const b = await verifiedAccount(env, 'copy@x.co');
  assert.equal((await claim(a, '1234567')).body.registration.status, 'verified');
  const r = await claim(b, '1234567');
  assert.equal(r.body.registration.status, 'manual_review');
  assert.ok(!JSON.stringify(r.body).includes('real@x.co'));
  const rows = (await env.DB.prepare("SELECT status FROM professional_registrations WHERE registration_number = '1234567' ORDER BY id").all()).results.map((x) => x.status);
  assert.deepEqual(rows, ['verified', 'manual_review']);
  // Even if the conflict check is raced, the database refuses a second verified holder.
  const row = await env.DB.prepare("SELECT * FROM professional_registrations WHERE status = 'manual_review'").first();
  const out = await checkRegistration(env, row, 'admin', 'test');
  assert.equal(out.status, 'manual_review');
  assert.equal(out.failure_state, 'conflict');
});

test('two accounts verifying the same number at the same moment: at most one wins', async () => {
  const env = mockEnv();
  const a = await verifiedAccount(env, 'race1@x.co');
  const b = await verifiedAccount(env, 'race2@x.co');
  await Promise.all([claim(a, '1234567'), claim(b, '1234567')]);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM professional_registrations WHERE status = 'verified'").first();
  assert.equal(n.n, 1);
});

test('the browser cannot forge verification: status fields sent by the client are ignored', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'forge@x.co');
  const r = await c.call('/api/app/professional/registration', { regulator: 'gmc', number: '9999999', status: 'verified', verified: true, verification_method: 'automatic_register', register_name: 'John Smith' });
  assert.equal(r.body.registration.status, 'not_found');
  await c.call('/api/app/profile', { profile: { verified: true, emailStatus: 'verified', badges: ['x'] }, email_status: 'verified' });
  const me = (await c.call('/api/app/me')).body;
  assert.equal(me.account.profile.verified, undefined);
  // Entries cannot carry a sign-off or its verification snapshot from the client.
  const s = await c.call('/api/app/sync', { entries: [{ id: 'forgedentry1', type: 'lung', date: '2026-09-01', signoff: { status: 'confirmed', verification: { identity: 'wavelength_account', approvedFor: ['famus:famus-thoracic'] } } }] });
  assert.equal(s.body.saved[0].signoff, undefined);
  // An unverified email cannot start professional verification at all.
  const u = await signup(env, 'unverified@x.co');
  const blocked = await claim(u, '1234567');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.needVerify, true);
});

test('registration checks are rate limited per account', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'enum@x.co');
  const numbers = ['1111111', '2222222', '3333333', '4444444', '5555555', '6666666'];
  const out = [];
  for (const n of numbers) out.push((await claim(c, n)).status);
  assert.deepEqual(out, [200, 200, 200, 200, 200, 429]);
});

test('with no supported source (the live configuration), a registration waits for manual verification by an admin', async () => {
  const env = makeEnv({ PROFESSIONAL_VERIFY: 'true' });
  const c = await verifiedAccount(env, 'manual@x.co');
  const r = await claim(c, '7654321');
  assert.equal(r.body.registration.status, 'manual_verification_required');
  assert.ok(!(await c.call('/api/app/professional')).body.badges.some((b) => b.kind === 'registration'), 'no badge from self-declaration');
  const id = await idOf(env, 'manual@x.co');
  const row = await env.DB.prepare('SELECT id FROM professional_registrations').first();
  const html = await supervisorsAdminHtml(env, new URL('https://x/volunteer/admin/supervisors/'));
  assert.ok(html.includes('manual verification required'), 'it appears in the admin queue');
  const noName = await supervisorsAdminPost(env, adminForm({ action: 'reg_verify', learner: id, sid: row.id, register_name: 'John Smith', checked: '1' }), 'wavelength');
  assert.match(noName.m, /Enter your name/);
  const unticked = await supervisorsAdminPost(env, adminForm({ action: 'reg_verify', learner: id, sid: row.id, register_name: 'John Smith', reviewer: 'Firas' }), 'wavelength');
  assert.match(unticked.m, /Tick the box/);
  const ok = await supervisorsAdminPost(env, adminForm({ action: 'reg_verify', learner: id, sid: row.id, register_name: 'John Smith', checked: '1', reviewer: 'Firas', notes: 'GMC online register, licence to practise' }), 'wavelength');
  assert.equal(ok.m, 'Registration verified.');
  const after = (await c.call('/api/app/professional')).body;
  assert.equal(after.registrations[0].status, 'verified');
  assert.equal(after.registrations[0].method, 'manual_register');
  assert.ok(after.badges.some((b) => b.label === 'GMC registration verified' && /Wavelength team/.test(b.source)));
  const ev = await env.DB.prepare("SELECT * FROM verification_events WHERE action = 'admin_verified'").first();
  assert.equal(ev.actor, 'admin:wavelength:Firas');
  assert.equal(ev.method, 'manual_register');
  // Manually verified registrations come back for a fresh look when due, without losing their status.
  await env.DB.prepare('UPDATE professional_registrations SET next_check_at = 1').run();
  await recheckDue(env);
  const due = await env.DB.prepare('SELECT status, failure_state FROM professional_registrations').first();
  assert.deepEqual({ ...due }, { status: 'verified', failure_state: 'recheck_due' });
});

test('the mock adapter can never be switched on from wrangler.jsonc, and the directory starts closed', () => {
  const wr = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.ok(!/VERIFY_MOCK/.test(wr));
  assert.ok(!/DIRECTORY_PUBLIC/.test(wr));
  const cfg = JSON.parse(readFileSync(new URL('../data/credentials.json', import.meta.url), 'utf8'));
  for (const x of [...cfg.regulators, ...cfg.credentialTypes]) assert.equal(x.adapter, 'manual', `${x.id}: no live adapter without a written agreement`);
  assert.deepEqual(cfg.rules.filter((r) => r.status === 'active' && !r.source), [], 'active rules need a source');
});

test('an official API that Wavelength is not authorised to use is recorded but never switched on (HCPC Employer Check API)', () => {
  const cfg = JSON.parse(readFileSync(new URL('../data/credentials.json', import.meta.url), 'utf8'));
  const hcpc = cfg.regulators.find((r) => r.id === 'hcpc');
  assert.equal(hcpc.officialApi.name, 'HCPC Employer Check API');
  assert.equal(hcpc.officialApi.status, 'not_authorised');
  assert.match(hcpc.officialApi.url, /^https:\/\/www\.hcpc-uk\.org\//);
  assert.ok(hcpc.officialApi.fields.includes('registration status'));
  assert.equal(hcpc.adapter, 'manual', 'no live adapter until access and terms are confirmed');
  for (const x of [...cfg.regulators, ...cfg.credentialTypes].filter((e) => e.officialApi)) {
    assert.ok(['not_authorised', 'authorised'].includes(x.officialApi.status), `${x.id}: officialApi.status`);
    if (x.officialApi.status !== 'authorised') assert.equal(x.adapter, 'manual', `${x.id}: an unauthorised API must stay manual`);
  }
});

test('an HCPC registration still goes to manual verification', async () => {
  const env = makeEnv({ PROFESSIONAL_VERIFY: 'true' });
  const c = await verifiedAccount(env, 'para@x.co');
  const r = await c.call('/api/app/professional/registration', { regulator: 'hcpc', number: 'PA123456', profession: 'Paramedic' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.registration.status, 'manual_verification_required');
  assert.equal((await c.call('/api/app/professional')).body.regulators.find((g) => g.id === 'hcpc').automatic, false);
});

test('mock results are hidden outside tests', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'hide@x.co');
  await claim(c, '1234567');
  env.VERIFY_MOCK = 'false';
  const badges = (await c.call('/api/app/professional')).body.badges;
  assert.ok(!badges.some((b) => b.kind === 'registration'));
});

test('withdrawing a registration removes its badge and keeps the history', async () => {
  const env = mockEnv();
  const c = await verifiedAccount(env, 'wd@x.co');
  const r = await claim(c, '1234567');
  await c.call('/api/app/professional/withdraw', { subject: 'registration', id: r.body.registration.id });
  const o = (await c.call('/api/app/professional')).body;
  assert.equal(o.registrations.length, 0);
  assert.ok(!o.badges.some((b) => b.kind === 'registration'));
  assert.ok((await env.DB.prepare("SELECT COUNT(*) AS n FROM verification_events WHERE action = 'withdrawn'").first()).n >= 1);
  // The number is free for its real holder afterwards.
  const d = await verifiedAccount(env, 'wd2@x.co');
  assert.equal((await claim(d, '1234567')).body.registration.status, 'verified');
  const other = client(handleApp, env);
  assert.equal((await other.call('/api/app/professional')).status, 401);
});

test('professional verification stays switched off until PROFESSIONAL_VERIFY is set', async () => {
  const env = makeEnv({ DIRECTORY_PUBLIC: 'true' });
  const c = await verifiedAccount(env, 'off@x.co');
  const r = await claim(c, '1234567');
  assert.equal(r.status, 503);
  assert.equal((await c.call('/api/app/professional')).status, 503);
  assert.equal((await c.call('/api/app/me')).body.verification.professional, false);
  assert.equal((await client(handleApp, env).call('/api/app/directory')).status, 404);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM professional_registrations').first()).n, 0);
});
