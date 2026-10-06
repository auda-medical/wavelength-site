// Supervisor search (plan section 20, worker/search.js): only currently approved, opted-in, real supervisors are ever
// found, whatever the query; no email address or account id is ever returned; caps, rate limits and duplicates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { signup, idOf, markVerified } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { ukDate, addDays } from '../worker/time.js';
import { DAILY_SEARCHES } from '../worker/search.js';

const mail = [];
globalThis.fetch = async (u, init) => { mail.push(JSON.parse(init.body)); return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 30));
const ON = { SUPERVISOR_SEARCH: 'true', ZEPTOMAIL_TOKEN: 'test' };
let regNo = 7000001;

async function person(env, email, first, last, extra = {}) {
  const c = await signup(env, email, { firstName: first, lastName: last, organisation: 'Darent Valley Hospital', role: 'Consultant', ...extra });
  await markVerified(env, email);
  return { c, id: await idOf(env, email) };
}
// A verified registration and one approval with the given status and review date.
async function approve(env, id, { status = 'approved', reviewOn = addDays(ukDate(), 200), regStatus = 'verified' } = {}) {
  await env.DB.prepare("INSERT INTO professional_registrations (learner_id, regulator, registration_number, claimed_name, status, active) VALUES (?, 'gmc', ?, 'Test', ?, 1)").bind(id, String(regNo++), regStatus).run();
  await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, review_on, approved_by, approved_at) VALUES (?, 'famus', 'famus-thoracic', ?, ?, 'admin:test', datetime('now'))").bind(id, status, reviewOn).run();
}
// Forces the search flag and a reference straight into the database, so each exclusion below is the server's search
// rule at work, not just the opt-in screen refusing.
async function forceSearchable(env, id) {
  await env.DB.prepare('UPDATE learners SET supervisor_searchable = 1, searchable_at = ?, supervisor_public_ref = ? WHERE id = ?').bind(new Date().toISOString(), ('R' + id + 'xxxxxxxxxxxxxxxxxx').slice(0, 16), id).run();
}
const search = (c, q, org) => c.call(`/api/app/supervisors/search?q=${encodeURIComponent(q)}${org ? `&org=${org}` : ''}`);

// One good supervisor and one of every excluded kind, all called Smith at Darent Valley Hospital (wl-2).
async function world(env) {
  const good = await person(env, 'alice@x.co', 'Alice', 'Smith', { organisationId: 'wl-2' });
  await approve(env, good.id);
  const opt = await good.c.call('/api/app/supervisor/searchable', { on: true });
  assert.equal(opt.status, 200, JSON.stringify(opt.body));
  const bad = {};
  bad.learner = await person(env, 'learner@x.co', 'Lena', 'Smith');
  bad.applicant = await person(env, 'applicant@x.co', 'Ann', 'Smith');
  await env.DB.prepare("INSERT INTO supervisor_applications (learner_id, kind, status, full_name, submitted_at) VALUES (?, 'initial', 'submitted', 'Ann Smith', datetime('now'))").bind(bad.applicant.id).run();
  bad.expired = await person(env, 'expired@x.co', 'Ed', 'Smith'); await approve(env, bad.expired.id, { status: 'expired' });
  bad.pastDate = await person(env, 'pastdate@x.co', 'Pat', 'Smith'); await approve(env, bad.pastDate.id, { reviewOn: addDays(ukDate(), -60) });
  bad.withdrawn = await person(env, 'withdrawn@x.co', 'Will', 'Smith'); await approve(env, bad.withdrawn.id, { status: 'withdrawn' });
  bad.revoked = await person(env, 'revoked@x.co', 'Rev', 'Smith'); await approve(env, bad.revoked.id, { status: 'revoked' });
  bad.blocked = await person(env, 'blocked@x.co', 'Bea', 'Smith'); await approve(env, bad.blocked.id);
  await env.DB.prepare("INSERT INTO supervisor_blocks (learner_id, kind, reason, blocked_by, blocked_at) VALUES (?, 'revoked', 'test', 'admin:test', datetime('now'))").bind(bad.blocked.id).run();
  bad.lapsed = await person(env, 'lapsed@x.co', 'Liz', 'Smith'); await approve(env, bad.lapsed.id, { regStatus: 'not_current' });
  bad.unverifiedEmail = await person(env, 'unconfirmed@x.co', 'Uma', 'Smith'); await approve(env, bad.unverifiedEmail.id);
  await env.DB.prepare("UPDATE learners SET email_status = 'unverified' WHERE id = ?").bind(bad.unverifiedEmail.id).run();
  bad.testAccount = await person(env, 'review@x.co', 'Tess', 'Smith'); await approve(env, bad.testAccount.id);
  await env.DB.prepare('UPDATE learners SET test_account = 1 WHERE id = ?').bind(bad.testAccount.id).run();
  for (const b of Object.values(bad)) await forceSearchable(env, b.id);
  // Approved and current, but never opted in.
  bad.notOptedIn = await person(env, 'quiet@x.co', 'Quinn', 'Smith'); await approve(env, bad.notOptedIn.id);
  const trainee = await person(env, 'trainee@x.co', 'Tom', 'Jones');
  return { good, bad, trainee };
}

test('only current, opted-in, real supervisors are ever found, whatever the query', async () => {
  const env = makeEnv(ON);
  const { bad, trainee } = await world(env);
  for (const [q, org] of [['smith', ''], ['smi', ''], ['Smith Darent', ''], ['darent smith', ''], ['sm', 'wl-2'], ['smith', 'wl-2'], ['alice', ''], ['ali smi', '']]) {
    const r = await search(trainee.c, q, org);
    assert.equal(r.status, 200, `${q}: ${JSON.stringify(r.body)}`);
    assert.deepEqual(r.body.results.map((x) => x.name), ['Alice Smith'], `query "${q}" org "${org}"`);
  }
  for (const [name, b] of Object.entries(bad)) {
    const first = (await env.DB.prepare('SELECT first_name FROM learners WHERE id = ?').bind(b.id).first()).first_name;
    const r = await search(trainee.c, first + ' smith');
    assert.deepEqual(r.body.results, [], `${name} must never appear`);
  }
});

test('results carry no email address or account id, only what the supervisor agreed to show', async () => {
  const env = makeEnv(ON);
  const { trainee, good } = await world(env);
  const r = await search(trainee.c, 'smith');
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes('@'), 'no email address');
  const hit = r.body.results[0];
  assert.deepEqual(Object.keys(hit).sort(), ['areas', 'badge', 'name', 'organisation', 'ref', 'role', 'specialty']);
  assert.match(hit.ref, /^[A-Za-z0-9]{16}$/);
  assert.notEqual(hit.ref, String(good.id));
  assert.equal(hit.badge, 'Wavelength Verified Supervisor');
  assert.equal(hit.organisation, 'Darent Valley Hospital', 'the canonical name from the list');
  assert.ok(hit.areas.length, 'approved areas as plain labels');
  assert.ok(!/RCEM|FAMUS|FUSIC/.test(hit.badge));
});

test('no organisation-only listing, and short or empty queries are refused', async () => {
  const env = makeEnv(ON);
  const { trainee } = await world(env);
  assert.deepEqual((await search(trainee.c, 'darent')).body.results, [], 'the organisation alone lists nobody');
  assert.equal((await search(trainee.c, 'sm')).status, 400);
  assert.equal((await search(trainee.c, '')).status, 400);
  assert.equal((await search(trainee.c, '%%%')).status, 400);
  assert.equal((await search(trainee.c, 's', 'wl-2')).status, 400);
  assert.equal((await search(trainee.c, 'smith', 'wl-999999')).status, 400, 'an unknown organisation');
});

test('searching needs a login, a verified email, the switch and both migrations', async () => {
  const env = makeEnv(ON);
  const { trainee } = await world(env);
  assert.equal((await search(client(handleApp, env), 'smith')).status, 401);
  const un = await signup(env, 'new@x.co');
  assert.equal((await search(un, 'smith')).status, 403);
  const off = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const t = await person(off, 't@x.co', 'T', 'J');
  assert.equal((await search(t.c, 'smith')).status, 503, 'SUPERVISOR_SEARCH is off by default');
  for (const skip of ['0012_supervisor_lifecycle.sql', '0013_organisations.sql']) {
    const old = makeEnv(ON, { skipMigrations: [skip] });
    const o = await person(old, 'o@x.co', 'O', 'P');
    assert.equal((await search(o.c, 'smith')).status, 503, `without ${skip}`);
    assert.equal((await o.c.call('/api/app/supervisors/request', { ref: 'A'.repeat(16) })).status, 503);
  }
  assert.equal((await search(trainee.c, 'smith')).status, 200);
});

test('20 searches a minute per account, then 429; a rate-limiting binding is used when present', async () => {
  const env = makeEnv(ON);
  const { trainee } = await world(env);
  for (let i = 0; i < 20; i++) assert.equal((await search(trainee.c, 'smith')).status, 200, `search ${i + 1}`);
  const r = await search(trainee.c, 'smith');
  assert.equal(r.status, 429);
  assert.match(r.body.error, /wait a minute/);
  const keys = [];
  const env2 = makeEnv({ ...ON, RATE_LIMIT_SEARCH: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } });
  const t2 = await person(env2, 't2@x.co', 'T', 'Two');
  assert.equal((await search(t2.c, 'smith')).status, 429);
  assert.ok(keys[0].startsWith('search:acct:'), 'keyed by account');
});

test('the daily cap of 200 searches is counted in D1 and writes one security event; terms are never stored', async () => {
  const env = makeEnv(ON);
  const { trainee } = await world(env);
  await search(trainee.c, 'alice smith');
  await env.DB.prepare('UPDATE search_counts SET searches = ? WHERE learner_id = ?').bind(DAILY_SEARCHES, trainee.id).run();
  const r = await search(trainee.c, 'smith');
  assert.equal(r.status, 429);
  assert.equal(r.body.limit, true);
  await search(trainee.c, 'smith');
  const ev = (await env.DB.prepare("SELECT * FROM audit_events WHERE action = 'search.daily_cap'").all()).results;
  assert.equal(ev.length, 1, 'logged once a day');
  assert.equal(ev[0].actor_id, String(trainee.id));
  const dump = JSON.stringify([(await env.DB.prepare('SELECT * FROM search_counts').all()).results, (await env.DB.prepare('SELECT * FROM audit_events').all()).results, (await env.DB.prepare('SELECT * FROM rate_counters').all()).results]);
  assert.ok(!/alice/i.test(dump), 'no search term is stored anywhere');
});

test('a request creates a pending search link, emails the supervisor, hides their email and refuses duplicates', async () => {
  const env = makeEnv(ON);
  const { trainee, good } = await world(env);
  const ref = (await search(trainee.c, 'alice smith')).body.results[0].ref;
  mail.length = 0;
  const r = await trainee.c.call('/api/app/supervisors/request', { ref });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.link.via, 'search');
  const link = await env.DB.prepare('SELECT * FROM supervisor_links WHERE learner_id = ?').bind(trainee.id).first();
  assert.equal(link.supervisor_id, good.id);
  assert.equal(link.via, 'search');
  assert.equal(link.status, 'pending');
  await settle();
  assert.equal(mail.filter((m) => m.to[0].email_address.address === 'alice@x.co' && /supervision request/i.test(m.subject)).length, 1);
  const mine = (await trainee.c.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(mine.email, null, 'the supervisor address is never shown to the learner');
  assert.ok(!JSON.stringify(r.body).includes('@'));
  const dup = await trainee.c.call('/api/app/supervisors/request', { ref });
  assert.equal(dup.status, 409);
  // The supervisor accepts from their dashboard, as for an email invitation.
  const inv = (await good.c.call('/api/app/supervisors')).body.invites.find((i) => i.via === 'search');
  assert.ok(inv);
  assert.equal((await good.c.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  assert.equal((await trainee.c.call('/api/app/supervisors/request', { ref })).status, 409, 'already linked');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'search.request'").first()).n, 1);
});

test('requests are capped at 5 a day, and unknown, excluded or own references are refused alike', async () => {
  const env = makeEnv(ON);
  const { trainee, bad, good } = await world(env);
  const ref = (await search(trainee.c, 'alice smith')).body.results[0].ref;
  assert.equal((await trainee.c.call('/api/app/supervisors/request', { ref: 'nope' })).status, 404);
  assert.equal((await trainee.c.call('/api/app/supervisors/request', { ref: 'ABCDEFGHJKLMNPQR' })).status, 404);
  for (const b of [bad.lapsed, bad.blocked, bad.testAccount, bad.expired, bad.applicant]) {
    const r = (await env.DB.prepare('SELECT supervisor_public_ref AS r FROM learners WHERE id = ?').bind(b.id).first()).r;
    assert.equal((await trainee.c.call('/api/app/supervisors/request', { ref: r })).status, 404);
  }
  assert.equal((await good.c.call('/api/app/supervisors/request', { ref })).status, 404, 'not yourself');
  await env.DB.prepare('INSERT INTO search_counts (learner_id, day, requests) VALUES (?, ?, 5) ON CONFLICT (learner_id, day) DO UPDATE SET requests = 5').bind(trainee.id, ukDate()).run();
  const r = await trainee.c.call('/api/app/supervisors/request', { ref });
  assert.equal(r.status, 429);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_links').first()).n, 0);
});

test('opting in needs a current approval and the switch; opting out always works and kills the old reference', async () => {
  const env = makeEnv(ON);
  const { trainee, good } = await world(env);
  assert.equal((await trainee.c.call('/api/app/supervisor/searchable', { on: true })).status, 403, 'not a supervisor');
  const overview = (await good.c.call('/api/app/supervisor')).body;
  assert.equal(overview.searchable, true);
  assert.equal(overview.searchAvailable, true);
  assert.ok(overview.searchableAt);
  assert.equal((await good.c.call('/api/app/me')).body.supervisor.search, true);
  const ref1 = (await search(trainee.c, 'alice smith')).body.results[0].ref;
  const rot = await good.c.call('/api/app/supervisor/searchable', { on: true, rotate: true });
  assert.equal(rot.status, 200);
  assert.equal(rot.body.preview.name, 'Alice Smith', 'the opt-in screen shows exactly what appears');
  assert.ok(!('ref' in rot.body.preview));
  const ref2 = (await search(trainee.c, 'alice smith')).body.results[0].ref;
  assert.notEqual(ref1, ref2);
  assert.equal((await trainee.c.call('/api/app/supervisors/request', { ref: ref1 })).status, 404, 'a rotated reference stops working');
  const offEnv = { ...env, SUPERVISOR_SEARCH: 'false' };
  const goodOff = client(handleApp, offEnv); goodOff.cookie = good.c.cookie;
  assert.equal((await goodOff.call('/api/app/supervisor/searchable', { on: false })).status, 200, 'switching off works even with search off');
  assert.deepEqual((await search(trainee.c, 'alice smith')).body.results, []);
  assert.equal((await trainee.c.call('/api/app/supervisors/request', { ref: ref2 })).status, 404);
  assert.equal((await goodOff.call('/api/app/supervisor/searchable', { on: true })).status, 503, 'opting in needs the switch');
  const ev = (await env.DB.prepare("SELECT meta FROM audit_events WHERE action = 'supervisor.searchable' ORDER BY id").all()).results.map((e) => JSON.parse(e.meta).searchable);
  assert.deepEqual(ev, [true, true, false], 'consent and its withdrawal are recorded');
});

test('search works with SUPERVISOR_APPROVAL_REQUIRED off: eligibility is always forced', async () => {
  const env = makeEnv({ ...ON, SUPERVISOR_APPROVAL_REQUIRED: 'false' });
  const { trainee } = await world(env);
  assert.deepEqual((await search(trainee.c, 'smith')).body.results.map((r) => r.name), ['Alice Smith']);
});
