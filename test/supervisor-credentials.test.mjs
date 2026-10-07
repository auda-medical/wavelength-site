// Credentials inside the supervisor application: claims made on the experience step stay linked to the application,
// and an applicant can add or remove modules on a credential they already hold (same record, checked again), for
// example adding Ultrasound-assisted LP to FAMUS claims when an application comes back for more information.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from './helpers/verify.mjs';
import { supervisorsAdminPost, supervisorsAdminHtml } from '../worker/supervisors-admin.js';
import { suggestedScopes } from '../worker/supervisor-lifecycle.js';

globalThis.fetch = async () => new Response('{}');
const ON = { SUPERVISOR_APPLY: 'true', ZEPTOMAIL_TOKEN: 'test' };
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength', ctx);
const html = (env, q) => supervisorsAdminHtml(env, new URL(`https://x/volunteer/admin/supervisors/${q}`), 'wavelength');
const FOUR = ['thoracic', 'dvt', 'abdo-renal', 'pva'];
const FIVE = [...FOUR, 'lp'];
const EXPERIENCE = { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true };
const EXPLAIN = 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.';
const AREAS = ['lung', 'heart', 'efast', 'aorta', 'dvt', 'access', 'abdomen', 'biliary', 'ocular', 'procedures'];
const PATHWAYS = ['rcem', 'famus', 'international'];

const appOf = (env, sid) => env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(sid).first();
const credOf = (env, sid, type) => env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? AND credential_type = ? AND active = 1').bind(sid, type).first();
const linked = async (env, sid) => JSON.parse((await appOf(env, sid)).credential_ids).map(Number);
const mods = (c) => JSON.parse(c.modules).slice().sort();
// The experience step exactly as the app sends it: the ticked held credentials, the answers and any new claims.
const experience = (c, extra) => c.call('/api/app/supervisor/application', { credentialIds: [], experience: EXPERIENCE, ...extra });
async function applicant(env, email) {
  const c = await verifiedAccount(env, email, { organisation: 'Darent Valley Hospital' });
  const r = await c.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Darent Valley Hospital',
    registration: { regulator: 'gmc', number: '1234567', profession: 'Doctor', organisation: 'Darent Valley Hospital' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { c, sid: await idOf(env, email) };
}

test('first save of the experience step: a new FAMUS credential exists, is linked, and the review shows it', async () => {
  const env = makeEnv(ON);
  const { c, sid } = await applicant(env, 'link@x.co');
  assert.equal(await credOf(env, sid, 'famus-supervisor'), null, 'starts with no credential');
  const r = await experience(c, { credentials: [{ type: 'famus-supervisor', modules: ['thoracic', 'lp'] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cred = await credOf(env, sid, 'famus-supervisor');
  assert.ok(cred, 'the credential row exists');
  assert.deepEqual(mods(cred), ['lp', 'thoracic']);
  assert.deepEqual(await linked(env, sid), [cred.id], 'its id is in supervisor_applications.credential_ids');
  assert.deepEqual(r.body.application.credentialIds.map(Number), [cred.id], 'the applicant sees it linked');
  assert.deepEqual((await c.call('/api/app/supervisor')).body.application.credentialIds.map(Number), [cred.id]);
  // Saving the step again with the held credential ticked keeps it; unticking it unlinks it but keeps the claim.
  await experience(c, { credentialIds: [cred.id] });
  assert.deepEqual(await linked(env, sid), [cred.id]);
  await experience(c, { credentialIds: [] });
  assert.deepEqual(await linked(env, sid), []);
  assert.ok(await credOf(env, sid, 'famus-supervisor'));
  // A held credential ticked together with a new claim in one save: both linked.
  await experience(c, { credentialIds: [cred.id], credentials: [{ type: 'local-credentialing', modules: ['local'] }] });
  const local = await credOf(env, sid, 'local-credentialing');
  assert.deepEqual((await linked(env, sid)).sort(), [cred.id, local.id].sort());
  // The admin review lists the linked credentials with their modules.
  const page = await html(env, `?app=${(await appOf(env, sid)).id}`);
  assert.match(page, /FAMUS supervisor: Thoracic, Ultrasound-assisted LP/);
  assert.match(page, /Local ultrasound credentialing or supervisor role/);
  assert.doesNotMatch(page, /None claimed/);
});

test('amending modules on a held credential keeps the record, its details and evidence, and is checked again', async () => {
  const env = makeEnv(ON);
  const { c, sid } = await applicant(env, 'amend@x.co');
  await experience(c, { credentials: [{ type: 'famus-supervisor', modules: FOUR, reference: 'REF-1', issuedOn: '2020-03-01', note: 'Directory entry 2020' }] });
  const before = await credOf(env, sid, 'famus-supervisor');
  assert.equal((await c.call('/api/app/supervisor/evidence', { subject: 'credential', id: before.id, kind: 'certificate', description: 'FAMUS supervisor certificate' })).status, 200);
  // Pretend the team had verified it, to show a change is checked again.
  await env.DB.prepare("UPDATE credentials SET status = 'verified', verified_at = '2026-10-01T00:00:00Z', verified_by = 'Firas', verification_method = 'manual_evidence' WHERE id = ?").bind(before.id).run();

  // Only modules named in remove come off: leaving one out of add does not delete it.
  const r = await experience(c, { credentialIds: [before.id], credentialModules: [{ id: before.id, add: ['lp'], remove: [] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = await credOf(env, sid, 'famus-supervisor');
  assert.equal(after.id, before.id, 'same credential record');
  assert.deepEqual(mods(after), [...FIVE].sort());
  for (const k of ['reference', 'issued_on', 'expires_on', 'claim_note', 'created_at', 'credential_type', 'issuer', 'role']) assert.equal(after[k], before[k], k + ' kept');
  assert.equal(after.status, 'manual_review', 'back in the review queue: it has evidence');
  assert.equal(after.verified_at, null);
  assert.equal(after.verified_by, null);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM credential_evidence WHERE subject_type = 'credential' AND subject_id = ?").bind(before.id).first()).n, 1, 'evidence kept');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials WHERE learner_id = ?').bind(sid).first()).n, 1, 'no second record');

  // An explicit removal works; an unchanged set changes nothing; invalid or empty sets are refused.
  await experience(c, { credentialModules: [{ id: before.id, add: [], remove: ['pva'] }] });
  assert.deepEqual(mods(await credOf(env, sid, 'famus-supervisor')), ['abdo-renal', 'dvt', 'lp', 'thoracic']);
  await env.DB.prepare("UPDATE credentials SET status = 'verified' WHERE id = ?").bind(before.id).run();
  await experience(c, { credentialModules: [{ id: before.id, add: ['lp'], remove: [] }] });
  assert.equal((await credOf(env, sid, 'famus-supervisor')).status, 'verified', 'no change, no re-check');
  for (const bad of [{ add: ['heart'] }, { add: ['lp', 'not-a-module'] }, { remove: ['core'] }]) {
    const x = await experience(c, { credentialModules: [{ id: before.id, add: [], remove: [], ...bad }] });
    assert.equal(x.status, 400, JSON.stringify(bad));
  }
  assert.equal((await experience(c, { credentialModules: [{ id: before.id, remove: ['thoracic', 'dvt', 'abdo-renal', 'lp'] }] })).status, 400, 'at least one module stays');
  assert.deepEqual(mods(await credOf(env, sid, 'famus-supervisor')), ['abdo-renal', 'dvt', 'lp', 'thoracic']);

  // Someone else's credential cannot be amended.
  const other = await applicant(env, 'other@x.co');
  assert.equal((await experience(other.c, { credentialModules: [{ id: before.id, add: ['pva'] }] })).status, 404);
  assert.deepEqual(mods(await credOf(env, sid, 'famus-supervisor')), ['abdo-renal', 'dvt', 'lp', 'thoracic']);

  // Reclaiming the same type without a reference or dates keeps the ones already recorded.
  await experience(c, { credentials: [{ type: 'famus-supervisor', modules: FIVE }] });
  const re = await credOf(env, sid, 'famus-supervisor');
  assert.equal(re.reference, 'REF-1');
  assert.equal(re.issued_on, '2020-03-01');
  assert.equal(re.claim_note, 'Directory entry 2020');
});

test('production case: FAMUS claims without LP, returned for more information, LP added to both, resubmitted', async () => {
  const env = makeEnv(ON);
  const { c, sid } = await applicant(env, 'fero@x.co');
  // As submitted on 7 October 2026: both FAMUS claims with four modules, three other claims, every area, three pathways.
  await experience(c, { credentials: [
    { type: 'famus-supervisor', modules: FOUR }, { type: 'famus-accredited', modules: FOUR },
    { type: 'rcem-ultrasound-supervisor', modules: ['core'] }, { type: 'local-credentialing', modules: ['local'] }, { type: 'other-qualification', modules: ['other'] },
  ] });
  await c.call('/api/app/supervisor/application', { justification: EXPLAIN, evidenceMode: 'both', areas: AREAS, pathways: PATHWAYS });
  // The bug fixed above left the submitted application with no linked credentials.
  await env.DB.prepare("UPDATE supervisor_applications SET credential_ids = '[]' WHERE learner_id = ?").bind(sid).run();
  const sub = await c.call('/api/app/supervisor/submit', { declaration: true });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  const a = await appOf(env, sid);
  assert.equal(a.status, 'submitted');
  const sup = await credOf(env, sid, 'famus-supervisor'), acc = await credOf(env, sid, 'famus-accredited');
  assert.deepEqual(mods(sup), [...FOUR].sort());
  assert.deepEqual(mods(acc), [...FOUR].sort());
  const others = await Promise.all(['rcem-ultrasound-supervisor', 'local-credentialing', 'other-qualification'].map((t) => credOf(env, sid, t)));

  // While submitted, the applicant cannot change anything.
  assert.equal((await experience(c, { credentialModules: [{ id: sup.id, add: ['lp'] }] })).status, 409);
  assert.deepEqual(mods(await credOf(env, sid, 'famus-supervisor')), [...FOUR].sort());

  // Returned with "Ask for more information".
  assert.match((await admin(env, { action: 'app_more', app: a.id, notes: 'Please add Ultrasound-assisted LP to your FAMUS credentials if it applies.' })).m, /More information requested/);
  const me = (await c.call('/api/app/supervisor')).body;
  assert.equal(me.application.status, 'more_info');
  const held = me.credentials.filter((x) => x.type.startsWith('famus-'));
  assert.deepEqual(held.map((x) => x.modules.slice().sort()), [[...FOUR].sort(), [...FOUR].sort()], 'the app gets the current modules to show ticked');

  // The applicant ticks LP under both FAMUS claims and keeps every credential ticked, as the app sends it.
  const r = await c.call('/api/app/supervisor/application', {
    credentialIds: [sup.id, acc.id, ...others.map((o) => o.id)], experience: EXPERIENCE,
    credentialModules: [{ id: sup.id, add: ['lp'], remove: [] }, { id: acc.id, add: ['lp'], remove: [] }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await c.call('/api/app/supervisor/submit', { declaration: true })).status, 200);

  const back = await appOf(env, sid);
  assert.equal(back.id, a.id);
  assert.equal(back.status, 'submitted');
  for (const [before, type] of [[sup, 'famus-supervisor'], [acc, 'famus-accredited']]) {
    const now = await credOf(env, sid, type);
    assert.equal(now.id, before.id, type + ' same record');
    assert.deepEqual(mods(now), [...FIVE].sort(), type + ' has all five FAMUS modules');
    assert.ok(['claimed', 'evidence_required', 'manual_review'].includes(now.status), type + ' waits to be checked: ' + now.status);
  }
  const ids = JSON.parse(back.credential_ids).map(Number);
  for (const x of [sup, acc, ...others]) assert.ok(ids.includes(x.id), `credential ${x.credential_type} linked`);
  assert.ok(suggestedScopes(JSON.parse(back.requested_areas), JSON.parse(back.requested_pathways)).includes('famus:famus-lp'));
  const page = await html(env, `?app=${a.id}`);
  assert.match(page, /value="famus:famus-lp" checked/, 'pre-ticked for the reviewer');
  assert.match(page, /FAMUS supervisor: Thoracic, DVT, Abdominal-renal, Peripheral vascular access, Ultrasound-assisted LP/);
  assert.match(page, /FAMUS accredited: Thoracic, DVT, Abdominal-renal, Peripheral vascular access, Ultrasound-assisted LP/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals').first()).n, 0, 'resubmitting approves nothing');
  assert.equal((await c.call('/api/app/supervisor')).body.standing, 'applying');
});
