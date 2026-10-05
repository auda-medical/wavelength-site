// External credentials, manual evidence review, scoped Wavelength supervisor approvals, the supervisor-status
// snapshot on sign-offs and assessments, and the opt-in supervisor directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm, SIG } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { supervisorsAdminPost, supervisorsAdminHtml, evidenceFile } from '../worker/supervisors-admin.js';
import { ORIGIN, ctx } from './helpers/env.mjs';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const DATA = {
  registers: { gmc: { 1234567: { name: 'John Smith', current: true }, 7654321: { name: 'Ann Lee', current: true } } },
  directories: {
    'famus-supervisor': [
      { name: 'John Smith', organisation: 'Darent Valley Hospital', modules: ['thoracic', 'dvt'], role: 'supervisor' },
      { name: 'Priya Patel', organisation: 'Royal London Hospital', modules: ['thoracic'], role: 'supervisor' },
    ],
    // A source that exposes registration numbers: an exact number match is a strong identifier on its own.
    'bse-accreditation': [{ name: 'John Smith', registrationNumber: '1234567', modules: ['level1'], expiresOn: '2020-12-31', role: 'accredited' }],
    'fusic-trainer': [
      { name: 'John Smith', organisation: 'Kings College Hospital', modules: ['lung'], role: 'trainer' },
      { name: 'John Smith', organisation: 'Leeds General Infirmary', modules: ['lung'], role: 'trainer' },
    ],
  },
};
const mockEnv = (extra = {}) => makeEnv({ PROFESSIONAL_VERIFY: 'true', VERIFY_MOCK: 'true', VERIFY_MOCK_DATA: structuredClone(DATA), ...extra });
async function professional(env, email, number = '1234567', org = 'Darent Valley Hospital, Dartford and Gravesham NHS Trust') {
  const c = await verifiedAccount(env, email, { organisation: org });
  const r = await c.call('/api/app/professional/registration', { regulator: 'gmc', number, profession: 'Doctor', organisation: org });
  assert.equal(r.body.registration.status, 'verified', JSON.stringify(r.body));
  return c;
}
const claimCred = (c, type, modules, extra = {}) => c.call('/api/app/professional/credential', { type, modules, ...extra });
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength');
const PDF = new TextEncoder().encode('%PDF-1.4\n% test certificate\n');
const upload = (c, id, bytes, type = 'application/pdf') => handleApp(new Request(`${ORIGIN}/api/app/professional/evidence?subject=credential&id=${id}&kind=certificate&description=Supervisor%20certificate&name=cert.pdf`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: c.cookie, 'Content-Type': type }, body: bytes }), c._env, ctx).then(async (r) => ({ status: r.status, body: await r.json() }));

test('a credential that matches the authoritative source on name and hospital is verified automatically, with provenance', async () => {
  const env = mockEnv();
  const c = await professional(env, 'famus@x.co');
  const r = await claimCred(c, 'famus-supervisor', ['thoracic']);
  assert.equal(r.body.credential.status, 'verified', JSON.stringify(r.body));
  assert.equal(r.body.credential.method, 'automatic_register');
  const row = await env.DB.prepare('SELECT * FROM credentials').first();
  assert.match(row.match_method, /^name_and_organisation/);
  assert.equal(row.verification_source, 'mock:famus-supervisor');
  const badge = (await c.call('/api/app/professional')).body.badges.find((b) => b.kind === 'credential');
  assert.equal(badge.label, 'FAMUS supervisor verified');
  assert.equal(badge.issuer, 'Society for Acute Medicine');
  assert.deepEqual(badge.modules, ['Thoracic']);
  assert.match(badge.source, /Checked automatically against the SAM record/);
  assert.match(badge.note, /not by Wavelength/);
});

test('a credential is not auto-verified when the match is ambiguous, absent, or the registration is unverified', async () => {
  const env = mockEnv();
  const c = await professional(env, 'amb@x.co', '1234567', 'Somewhere Else Hospital');
  assert.equal((await claimCred(c, 'fusic-trainer', ['lung'])).body.credential.status, 'manual_review', 'two people of that name: a person decides');
  assert.equal((await claimCred(c, 'famus-supervisor', ['thoracic'])).body.credential.status, 'manual_review', 'name matches but the hospital does not');
  assert.equal((await claimCred(c, 'famus-supervisor', ['abdo-renal'])).body.credential.status, 'not_found', 'module not listed');
  const u = await verifiedAccount(env, 'noreg@x.co', { organisation: 'Darent Valley Hospital' });
  assert.equal((await claimCred(u, 'famus-supervisor', ['thoracic'])).body.credential.status, 'manual_review', 'no verified registration, no automatic verification');
  const rows = (await env.DB.prepare('SELECT failure_state FROM credentials WHERE learner_id = ?').bind(await idOf(env, 'noreg@x.co')).all()).results;
  assert.equal(rows[0].failure_state, 'no_verified_registration');
});

test('an expired credential is recorded as expired, never verified', async () => {
  const env = mockEnv();
  const c = await professional(env, 'bse@x.co');
  const r = await claimCred(c, 'bse-accreditation', ['level1']);
  assert.equal(r.body.credential.status, 'expired');
  assert.equal((await env.DB.prepare('SELECT match_method FROM credentials').first()).match_method, 'registration_number');
  assert.ok(!(await c.call('/api/app/professional')).body.badges.some((b) => b.kind === 'credential'));
});

test('manual review: evidence, then admin approval, rejection, revocation and reinstatement, all audited', async () => {
  const env = mockEnv();
  const c = await professional(env, 'manualcred@x.co');
  c._env = env;
  const r = await claimCred(c, 'rcem-ultrasound-supervisor', ['core'], { note: 'PoCUS lead at DVH' });
  assert.equal(r.body.credential.status, 'evidence_required');
  const id = r.body.credential.id;
  assert.equal((await upload(c, id, new TextEncoder().encode('<html><script>alert(1)</script>'), 'text/html')).status, 415, 'only PDF, JPEG or PNG');
  assert.equal((await upload(c, id, new Uint8Array(1048577).fill(37))).status, 413, '1 MB limit');
  const up = await upload(c, id, PDF);
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal((await c.call('/api/app/professional')).body.credentials[0].status, 'manual_review');
  const ev = await env.DB.prepare('SELECT * FROM credential_evidence').first();
  assert.equal(ev.file_type, 'application/pdf');
  assert.equal(ev.file_sha256.length, 64);
  const lid = await idOf(env, 'manualcred@x.co');
  const html = await supervisorsAdminHtml(env, new URL(`https://x/volunteer/admin/supervisors/?id=${lid}`));
  assert.ok(html.includes('cert.pdf'));
  const file = await evidenceFile(env, ev.id);
  assert.equal(file.headers.get('Content-Type'), 'application/pdf');
  assert.match(file.headers.get('Content-Disposition'), /^attachment/);
  assert.match(file.headers.get('Content-Security-Policy'), /sandbox/);
  assert.equal(new TextDecoder().decode(await file.arrayBuffer()), new TextDecoder().decode(PDF));
  assert.match((await admin(env, { action: 'cred_approve', learner: lid, sid: id, modules: 'core' })).m, /notes/);
  assert.equal((await admin(env, { action: 'cred_approve', learner: lid, sid: id, modules: 'core', method: 'manual_evidence', evidence: ev.id, review_on: '2099-01-01', notes: 'Letter from clinical director' })).m, 'Credential approved.');
  let o = (await c.call('/api/app/professional')).body;
  assert.equal(o.credentials[0].status, 'verified');
  assert.ok(o.badges.some((b) => b.label === 'RCEM ultrasound supervisor (local role) verified' && /from evidence/.test(b.source)));
  assert.equal((await admin(env, { action: 'cred_revoke', learner: lid, sid: id, notes: 'Left the department' })).m, 'Credential revoked.');
  o = (await c.call('/api/app/professional')).body;
  assert.equal(o.credentials[0].status, 'revoked');
  assert.ok(!o.badges.some((b) => b.kind === 'credential'), 'revocation removes the badge at once');
  assert.equal((await admin(env, { action: 'cred_reinstate', learner: lid, sid: id, notes: 'Returned' })).m, 'Credential reinstated.');
  assert.equal((await c.call('/api/app/professional')).body.credentials[0].status, 'verified');
  const actions = (await env.DB.prepare("SELECT action, actor, evidence_id, scope FROM verification_events WHERE subject_type = 'credential' AND actor LIKE 'admin:%' ORDER BY id").all()).results;
  assert.deepEqual(actions.map((a) => a.action), ['admin_approved', 'admin_revoked', 'admin_reinstated']);
  assert.ok(actions.every((a) => a.actor === 'admin:wavelength:Firas'));
  assert.equal(actions[0].evidence_id, ev.id);
  assert.equal(actions[0].scope, 'core');
  // Rejection of a different claim.
  const r2 = await claimCred(c, 'esicm-edec', ['edec']);
  assert.equal((await admin(env, { action: 'cred_reject', learner: lid, sid: r2.body.credential.id, notes: 'Certificate unreadable' })).m, 'Credential rejected.');
  assert.equal((await c.call('/api/app/professional')).body.credentials.find((x) => x.type === 'esicm-edec').status, 'rejected');
});

test('supervisor approval is scoped: approved for FAMUS Thoracic is not approved for FUSIC Heart', async () => {
  const env = mockEnv();
  const c = await professional(env, 'scope@x.co');
  await claimCred(c, 'famus-supervisor', ['thoracic']);
  const lid = await idOf(env, 'scope@x.co');
  assert.match((await admin(env, { action: 'appr_add', learner: lid, notes: 'FAMUS directory' })).m, /Tick at least one/);
  assert.equal((await admin(env, { action: 'appr_add', learner: lid, scope: ['famus:famus-thoracic', 'famus:famus-dvt'], notes: 'FAMUS directory', review_on: '2099-01-01' })).m, '2 scopes approved.');
  const o = (await c.call('/api/app/professional')).body;
  const wl = o.badges.find((b) => b.kind === 'wavelength-supervisor');
  assert.deepEqual(wl.scopes.map((s) => s.label).sort(), ['FAMUS DVT', 'FAMUS Thoracic']);
  assert.ok(!wl.scopes.some((s) => s.pathway === 'fusic'));
  // An approval stops counting at once if the registration is no longer verified.
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(lid).first();
  await admin(env, { action: 'reg_not_current', learner: lid, sid: reg.id, notes: 'Register shows suspended' });
  assert.ok(!(await c.call('/api/app/professional')).body.badges.some((b) => b.kind === 'wavelength-supervisor'));
});

// ---------- Snapshots ----------
async function supervisedPair(env) {
  const sup = await professional(env, 'sup@x.co');
  await claimCred(sup, 'famus-supervisor', ['thoracic']);
  const sid = await idOf(env, 'sup@x.co');
  await admin(env, { action: 'appr_add', learner: sid, scope: ['famus:famus-thoracic'], notes: 'FAMUS directory' });
  const learner = await verifiedAccount(env, 'trainee@x.co');
  await learner.call('/api/app/supervisors/add', { email: 'sup@x.co' });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  const link = (await learner.call('/api/app/supervisors')).body.supervisors[0];
  return { sup, learner, sid, link };
}
async function dashboardSignoff(env, { sup, learner, link }, entryId, type = 'lung') {
  await learner.call('/api/app/sync', { entries: [{ id: entryId, type, date: '2026-09-01', supervision: 'direct' }] });
  const req = await learner.call('/api/app/signoff/request', { entryIds: [entryId], supervisorLink: link.id });
  const done = await sup.call('/api/app/supervise/signoff', { code: req.body.code, name: 'Dr John Smith', role: 'Consultant', confirm: true, signature: SIG, decisions: { [entryId]: 'confirmed' } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return req.body.code;
}

test('a dashboard sign-off captures the supervisor status of that moment, and later changes never alter it', async () => {
  const env = mockEnv();
  const pair = await supervisedPair(env);
  const code = await dashboardSignoff(env, pair, 'snapentry01');
  const row = await env.DB.prepare('SELECT supervisor_snapshot FROM signoffs WHERE id = ?').bind(code).first();
  const snap = JSON.parse(row.supervisor_snapshot);
  assert.equal(snap.identity, 'wavelength_account');
  assert.equal(snap.method, 'dashboard');
  assert.equal(snap.accountId, pair.sid);
  assert.equal(snap.professionalName, 'John Smith');
  assert.equal(snap.registrations[0].regulator, 'gmc');
  assert.equal(snap.registrations[0].number, '1234567');
  assert.equal(snap.registrations[0].verified, true);
  assert.equal(snap.email.status, 'verified');
  assert.deepEqual(snap.credentials.map((c) => c.type), ['famus-supervisor']);
  assert.deepEqual(snap.approvedFor, ['famus:famus-thoracic']);
  assert.ok(snap.relevantScopes.includes('fusic:fusic-lung'), 'a lung scan is relevant to FUSIC Lung too');
  assert.ok(!snap.approvedFor.includes('fusic:fusic-lung'), 'but the approval covers FAMUS Thoracic only');
  assert.equal(snap.wavelengthVerifiedSupervisor, true);
  const before = (await client(handleApp, env).call('/api/app/verify?code=' + code)).body.supervisorCheck;
  assert.deepEqual(before.approvedFor, ['FAMUS Thoracic']);
  assert.equal(before.registrations[0].regulator, 'General Medical Council');
  assert.ok(!JSON.stringify(before).includes('1234567'), 'the public check shows no registration number');
  const entry = (await pair.learner.call('/api/app/sync?since=0')).body.entries.find((e) => e.id === 'snapentry01');
  assert.deepEqual(entry.signoff.verification.approvedFor, ['famus:famus-thoracic']);
  // Two years later the supervisor loses everything.
  const appr = await env.DB.prepare('SELECT id FROM supervisor_approvals WHERE learner_id = ?').bind(pair.sid).first();
  await admin(env, { action: 'appr_revoke', learner: pair.sid, sid: appr.id, notes: 'Stopped supervising' });
  const cred = await env.DB.prepare('SELECT id FROM credentials WHERE learner_id = ?').bind(pair.sid).first();
  await admin(env, { action: 'cred_revoke', learner: pair.sid, sid: cred.id, notes: 'Removed from directory' });
  const after = (await client(handleApp, env).call('/api/app/verify?code=' + code)).body.supervisorCheck;
  assert.deepEqual(after, before, 'the historical record is unchanged');
  assert.equal((await env.DB.prepare('SELECT supervisor_snapshot FROM signoffs WHERE id = ?').bind(code).first()).supervisor_snapshot, row.supervisor_snapshot);
  // Current privileges follow the current status: a new sign-off now records no approval.
  const code2 = await dashboardSignoff(env, pair, 'snapentry02');
  const snap2 = JSON.parse((await env.DB.prepare('SELECT supervisor_snapshot FROM signoffs WHERE id = ?').bind(code2).first()).supervisor_snapshot);
  assert.equal(snap2.wavelengthVerifiedSupervisor, false);
  assert.deepEqual(snap2.credentials, []);
});

test('link and in-person sign-offs record the signer as self-declared, whatever they type', async () => {
  const env = mockEnv();
  const { learner } = await supervisedPair(env);
  await learner.call('/api/app/sync', { entries: [{ id: 'selfdecl001', type: 'lung', date: '2026-09-01' }, { id: 'selfdecl002', type: 'lung', date: '2026-09-02' }] });
  const req = await learner.call('/api/app/signoff/request', { entryIds: ['selfdecl001'] });
  const done = await client(handleApp, env).call('/api/app/signoff/complete', { token: req.body.link.split('#')[1], name: 'Dr John Smith', role: 'Consultant', registration: '1234567', accreditation: 'FAMUS supervisor', confirm: true, signature: SIG, decisions: { selfdecl001: 'confirmed' } });
  assert.equal(done.status, 200);
  const v = (await client(handleApp, env).call('/api/app/verify?code=' + done.body.code)).body.supervisorCheck;
  assert.equal(v.identity, 'self_declared');
  const ip = await learner.call('/api/app/signoff/inperson', { entryIds: ['selfdecl002'], name: 'Dr John Smith', role: 'Consultant', registration: '1234567', confirm: true, signature: SIG });
  const snap = JSON.parse((await env.DB.prepare('SELECT supervisor_snapshot FROM signoffs WHERE id = ?').bind(ip.body.code).first()).supervisor_snapshot);
  assert.equal(snap.identity, 'self_declared');
  assert.equal(snap.declared.registration, '1234567');
  assert.equal(snap.wavelengthVerifiedSupervisor, undefined);
});

test('a dashboard assessment captures the assessor snapshot for its pathway module', async () => {
  const env = mockEnv();
  const { sup, learner } = await supervisedPair(env);
  const lid = await idOf(env, 'trainee@x.co');
  const kind = LOGBOOK.assessmentKinds.find((k) => k.id === 'summative').id;
  const r = await sup.call('/api/app/supervise/assessment/new', { learnerId: lid, pathway: 'famus', module: 'famus-thoracic', kind, name: 'Dr John Smith', role: 'Consultant', confirm: true, signature: SIG, outcome: 'competent', domains: { [LOGBOOK.assessmentDomains[0].id]: LOGBOOK.assessmentScale[0] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = (await client(handleApp, env).call('/api/app/verify?code=' + r.body.code)).body;
  assert.equal(v.supervisorCheck.identity, 'wavelength_account');
  assert.deepEqual(v.supervisorCheck.approvedFor, ['FAMUS Thoracic']);
  assert.equal(v.supervisorCheck.wavelengthVerifiedSupervisor, true);
  assert.ok(learner);
});

// ---------- Directory ----------
test('the directory lists only people who opted in and are eligible, with public fields only', async () => {
  const env = mockEnv({ DIRECTORY_PUBLIC: 'true' });
  const { sup } = await supervisedPair(env);
  const anon = client(handleApp, env);
  assert.deepEqual((await anon.call('/api/app/directory')).body.supervisors, [], 'nobody is listed by default');
  const saved = await sup.call('/api/app/professional/directory', { listed: true, region: 'Kent', country: 'gb', contactEmail: 'pocus@dvh.example', showContact: false });
  assert.equal(saved.body.listed, true);
  let list = (await anon.call('/api/app/directory')).body.supervisors;
  assert.equal(list.length, 1);
  const p = list[0];
  assert.equal(p.name, 'John Smith');
  assert.equal(p.region, 'Kent');
  assert.equal(p.country, 'GB');
  assert.equal(p.contact, null, 'no contact details unless chosen');
  const text = JSON.stringify(p);
  for (const secret of ['sup@x.co', '1234567', 'pocus@dvh.example']) assert.ok(!text.includes(secret), `${secret} is not public`);
  assert.ok(p.badges.some((b) => b.kind === 'wavelength-supervisor'));
  await sup.call('/api/app/professional/directory', { listed: true, region: 'Kent', country: 'gb', contactEmail: 'pocus@dvh.example', showContact: true });
  assert.equal((await anon.call('/api/app/directory')).body.supervisors[0].contact, 'pocus@dvh.example');
  // Filters.
  assert.equal((await anon.call('/api/app/directory?pathway=famus&module=famus-thoracic')).body.supervisors.length, 1);
  assert.equal((await anon.call('/api/app/directory?pathway=fusic')).body.supervisors.length, 0);
  assert.equal((await anon.call('/api/app/directory?country=ie')).body.supervisors.length, 0);
  // A private, unlisted learner never appears; an ineligible one cannot list themselves.
  const plain = await verifiedAccount(env, 'plain@x.co');
  const no = await plain.call('/api/app/professional/directory', { listed: true });
  assert.equal(no.body.listed, false);
  assert.ok(no.body.reasons.length >= 2);
  list = (await anon.call('/api/app/directory')).body.supervisors;
  assert.deepEqual(list.map((x) => x.name), ['John Smith']);
  // Opting out removes the listing at once.
  await sup.call('/api/app/professional/directory', { listed: false });
  assert.deepEqual((await anon.call('/api/app/directory')).body.supervisors, []);
});

test('the public directory stays closed until it is switched on', async () => {
  const env = mockEnv();
  assert.equal((await client(handleApp, env).call('/api/app/directory')).status, 404);
});

test('account deletion removes registrations, credentials, evidence, approvals and directory data', async () => {
  const env = mockEnv();
  const c = await professional(env, 'gone@x.co');
  await claimCred(c, 'famus-supervisor', ['thoracic']);
  await c.call('/api/app/professional/directory', { listed: true });
  assert.equal((await c.call('/api/app/account/delete', { password: 'Correct horse battery 1!' })).status, 200);
  for (const t of ['professional_registrations', 'credentials', 'credential_evidence', 'supervisor_approvals', 'directory_profiles', 'email_tokens', 'verification_events']) {
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n, 0, t);
  }
});

test('admin pages escape everything a professional typed', async () => {
  const env = mockEnv();
  const EVIL = '"><img src=x onerror=alert(1)>';
  const c = await professional(env, 'evil@x.co');
  await c.call('/api/app/professional/credential', { type: 'rcem-ultrasound-supervisor', modules: ['core'], note: EVIL, reference: EVIL });
  await c.call('/api/app/professional/evidence', { subject: 'credential', id: 1, kind: 'letter', description: EVIL, url: 'javascript:alert(1)' });
  await c.call('/api/app/professional/evidence', { subject: 'credential', id: 1, kind: 'letter', description: EVIL });
  const lid = await idOf(env, 'evil@x.co');
  const html = await supervisorsAdminHtml(env, new URL(`https://x/volunteer/admin/supervisors/?id=${lid}`)) + await supervisorsAdminHtml(env, new URL('https://x/volunteer/admin/supervisors/'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('javascript:'));
});

test('evidence files are purged 30 days after a decision, keeping the fingerprint', async () => {
  const env = mockEnv();
  const c = await professional(env, 'purge@x.co');
  c._env = env;
  const r = await claimCred(c, 'rcem-ultrasound-supervisor', ['core']);
  await upload(c, r.body.credential.id, PDF);
  const lid = await idOf(env, 'purge@x.co');
  await admin(env, { action: 'cred_approve', learner: lid, sid: r.body.credential.id, modules: 'core', notes: 'Letter seen' });
  const { recheckDue } = await import('../worker/professional.js');
  await recheckDue(env);
  assert.ok((await env.DB.prepare('SELECT file_data FROM credential_evidence').first()).file_data, 'kept while recent');
  await env.DB.prepare("UPDATE credentials SET updated_at = datetime('now', '-31 days')").run();
  await recheckDue(env);
  const ev = await env.DB.prepare('SELECT file_data, purged_at, file_sha256 FROM credential_evidence').first();
  assert.equal(ev.file_data, null);
  assert.ok(ev.purged_at);
  assert.equal(ev.file_sha256.length, 64);
});
