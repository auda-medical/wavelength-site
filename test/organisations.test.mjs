// Organisation autocomplete (plan section 19, worker/organisations.js): the seed, matching, merges, "not listed"
// requests, organisationId beside typed text, the admin page and the Worker without migration 0013.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { makeEnv, client, ctx } from './helpers/env.mjs';
import { signup, idOf, markVerified, adminForm } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { organisationsAdminHtml, organisationsAdminPost, findOrganisations } from '../worker/organisations.js';
import { normOrg } from '../worker/org-norm.js';
import SEED from '../data/organisations.json' with { type: 'json' };

globalThis.fetch = async () => new Response('{}');
const EVIL = "x');fetch('/admin/',{method:'POST'});('\"><img src=x onerror=alert(1)>";
const orgs = async (q) => client(handleApp, makeEnv()).call('/api/app/organisations?q=' + encodeURIComponent(q));
const names = (r) => r.body.results.map((x) => x.name);
const admin = (env, o, access = '') => organisationsAdminPost(env, adminForm(access ? o : { reviewer: 'Firas', ...o }), 'wavelength', { access });
const html = (env, q = '') => organisationsAdminHtml(env, new URL('https://x/admin/organisations/' + q));

test('normalisation: case, "&", apostrophes and punctuation', () => {
  assert.equal(normOrg("Guy's & St Thomas'  NHS-Trust"), 'guys and st thomas nhs trust');
  assert.equal(normOrg('  DVH  '), 'dvh');
  assert.equal(normOrg('Hôpital'), 'hopital');
});

test('the seed has stable wl- ids, valid parents, and the migration matches the JSON', () => {
  const ids = new Set(SEED.organisations.map((o) => o.id));
  assert.equal(ids.size, SEED.organisations.length);
  for (const o of SEED.organisations) {
    assert.match(o.id, /^wl-\d+$/);
    if (o.parent) assert.ok(ids.has(o.parent), o.id);
  }
  assert.match(SEED._about.join(' '), /ODS import .* is still to do/);
  execFileSync(process.execPath, ['tools/organisations-seed.mjs', '--check'], { stdio: 'pipe' });
});

test('matching works on the start of any word, aliases and "&"', async () => {
  for (const q of ['dar', 'DVH', 'darent valley', 'Darent Valley Hospital']) assert.ok(names(await orgs(q)).includes('Darent Valley Hospital'), q);
  assert.ok(names(await orgs('gravesham')).includes('Dartford and Gravesham NHS Trust'));
  assert.ok(names(await orgs('dartford & gravesham')).includes('Dartford and Gravesham NHS Trust'));
  assert.ok(names(await orgs('guys thomas')).includes("Guy's and St Thomas' NHS Foundation Trust"), 'words in any order');
  assert.ok(!names(await orgs('arent')).includes('Darent Valley Hospital'), 'not the middle of a word');
  const dvh = (await orgs('DVH')).body.results[0];
  assert.deepEqual({ id: dvh.id, matched: dvh.matched, parent: dvh.parent }, { id: 'wl-2', matched: 'DVH', parent: { id: 'wl-1', name: 'Dartford and Gravesham NHS Trust' } });
  assert.equal((await orgs('Darent Valley Hospital')).body.results[0].name, 'Darent Valley Hospital', 'an exact name ranks first');
  assert.ok((await orgs('nhs')).body.results.length <= 10);
});

test('2 characters minimum, an hour of caching, and a public lookup that follows merges', async () => {
  const env = makeEnv();
  const c = client(handleApp, env);
  const res = await handleApp(new Request('https://thewavelength.co.uk/api/app/organisations?q=dv'), env, ctx);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=3600');
  const short = await c.call('/api/app/organisations?q=d');
  assert.deepEqual(short.body.results, []);
  assert.equal(short.body.tooShort, true);
  const one = await c.call('/api/app/organisations/wl-2');
  assert.equal(one.body.organisation.name, 'Darent Valley Hospital');
  assert.equal((await c.call('/api/app/organisations/wl-999999')).status, 404);
  await admin(env, { action: 'merge', from: 'wl-17', into: 'wl-16' });
  const merged = await c.call('/api/app/organisations/wl-17');
  assert.equal(merged.body.organisation.id, 'wl-16', 'an old id still resolves');
  assert.equal(merged.body.mergedFrom, 'wl-17');
});

test('"not listed" requests: logged in only, deduplicated, an exact name offered as a suggestion', async () => {
  const env = makeEnv();
  assert.equal((await client(handleApp, env).call('/api/app/organisations/request', { name: 'Somewhere' })).status, 401);
  const c = await signup(env, 'req@x.co');
  const a = await c.call('/api/app/organisations/request', { name: 'Riverside Community Hospital' });
  assert.equal(a.status, 200);
  assert.ok(a.body.requestId);
  assert.equal(a.body.suggestion, null);
  const b = await c.call('/api/app/organisations/request', { name: 'riverside community hospital ' });
  assert.equal(b.body.requestId, a.body.requestId);
  const s = await c.call('/api/app/organisations/request', { name: 'dvh' });
  assert.deepEqual(s.body.suggestion, { id: 'wl-2', name: 'Darent Valley Hospital' });
  assert.ok(!names(await client(handleApp, env).call('/api/app/organisations?q=riverside')).length, 'never offered to others until an admin adds it');
});

test('organisationId beside the typed text: checked, kept, and cleared when the text changes', async () => {
  const env = makeEnv();
  const c = await signup(env, 'org@x.co', { organisation: 'DVH', organisationId: 'wl-2' });
  let acc = (await c.call('/api/app/me')).body.account;
  assert.equal(acc.organisation, 'DVH', 'the typed text is kept');
  assert.equal(acc.organisationId, 'wl-2');
  assert.equal((await c.call('/api/app/profile', { organisationId: 'wl-nope' })).status, 400);
  assert.equal((await client(handleApp, env).call('/api/app/signup', { firstName: 'A', lastName: 'B', email: 'bad@x.co', password: 'Correct horse battery 1!', terms: true, organisationId: 'wl-999999' })).status, 400);
  await c.call('/api/app/profile', { organisation: 'DVH' });
  assert.equal((await c.call('/api/app/me')).body.account.organisationId, 'wl-2', 'the same text keeps its id');
  await c.call('/api/app/profile', { organisation: 'Medway Maritime' });
  acc = (await c.call('/api/app/me')).body.account;
  assert.equal(acc.organisationId, null, 'different text without a pick clears the id');
  await c.call('/api/app/profile', { organisation: 'Medway Maritime Hospital', organisationId: 'wl-24' });
  assert.equal((await c.call('/api/app/me')).body.account.organisationId, 'wl-24');
  // A merged organisation is stored as the one it was merged into.
  await admin(env, { action: 'merge', from: 'wl-24', into: 'wl-23' });
  await c.call('/api/app/profile', { organisationId: 'wl-24' });
  assert.equal((await c.call('/api/app/me')).body.account.organisationId, 'wl-23');
});

test('supervisor applications and registrations accept organisationId and refuse an unknown one', async () => {
  const env = makeEnv({ SUPERVISOR_APPLY: 'true' });
  const c = await signup(env, 'sup@x.co');
  await markVerified(env, 'sup@x.co');
  assert.equal((await c.call('/api/app/supervisor/application', { organisation: 'x', organisationId: 'wl-0' })).status, 400);
  const r = await c.call('/api/app/supervisor/application', { organisation: 'DVH', organisationId: 'wl-2', registration: { regulator: 'gmc', number: '7123456', profession: 'Doctor', organisation: 'DVH', organisationId: 'wl-2' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = await idOf(env, 'sup@x.co');
  assert.equal((await env.DB.prepare('SELECT organisation_id FROM supervisor_applications WHERE learner_id = ?').bind(id).first()).organisation_id, 'wl-2');
  const reg = await env.DB.prepare('SELECT organisation, organisation_id FROM professional_registrations WHERE learner_id = ?').bind(id).first();
  assert.deepEqual({ ...reg }, { organisation: 'DVH', organisation_id: 'wl-2' });
  assert.equal((await c.call('/api/app/supervisor/application', { registration: { regulator: 'gmc', number: '7123456', organisationId: 'wl-nope' } })).status, 400);
});

test('without migration 0013 nothing breaks: no suggestions, typed text saved, ids ignored', async () => {
  const env = makeEnv({}, { skipMigrations: ['0013_organisations.sql'] });
  const c = await signup(env, 'old@x.co', { organisation: 'DVH', organisationId: 'wl-2' });
  const r = await c.call('/api/app/organisations?q=dvh');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results, []);
  assert.equal(r.body.available, false);
  assert.equal((await c.call('/api/app/organisations/request', { name: 'Somewhere' })).status, 503);
  assert.equal((await c.call('/api/app/profile', { organisation: 'Elsewhere', organisationId: 'wl-2' })).status, 200);
  const acc = (await c.call('/api/app/me')).body.account;
  assert.equal(acc.organisation, 'Elsewhere');
  assert.equal(acc.organisationId, null);
  assert.match(await html(env), /apply migrations\/0013/);
});

test('admin: map a request (adds the alias and links the requester), add, dismiss; every decision audited', async () => {
  const env = makeEnv();
  const c = await signup(env, 'map@x.co', { organisation: 'Darent Valley Hosp.' });
  const id = await idOf(env, 'map@x.co');
  const rq = (await c.call('/api/app/organisations/request', { name: 'Darent Valley Hosp.' })).body.requestId;
  assert.match((await admin(env, { action: 'req_map', request: rq })).m, /Enter your name|Choose/, 'needs a choice');
  assert.equal((await organisationsAdminPost(env, adminForm({ action: 'req_map', request: rq, org: 'wl-2' }), 'wavelength')).m, 'Enter your name: every decision records who made it.');
  const m = await admin(env, { action: 'req_map', request: rq, org: 'wl-2' });
  assert.equal(m.m, 'Mapped to Darent Valley Hospital.');
  assert.equal((await env.DB.prepare('SELECT organisation_id FROM learners WHERE id = ?').bind(id).first()).organisation_id, 'wl-2');
  assert.ok(names(await client(handleApp, env).call('/api/app/organisations?q=darent valley hosp')).includes('Darent Valley Hospital'));
  assert.equal((await admin(env, { action: 'req_map', request: rq, org: 'wl-2' })).m, 'That request has already been decided.');

  const rq2 = (await c.call('/api/app/organisations/request', { name: 'Riverside Clinic' })).body.requestId;
  const add = await admin(env, { action: 'req_add', request: rq2, name: 'Riverside Clinic', kind: 'private', parent: '' });
  assert.equal(add.q, 'wl-100001', 'administrators get ids above the seed range');
  assert.ok(names(await client(handleApp, env).call('/api/app/organisations?q=riverside')).includes('Riverside Clinic'));
  const rq3 = (await c.call('/api/app/organisations/request', { name: 'Typo place' })).body.requestId;
  assert.equal((await admin(env, { action: 'req_dismiss', request: rq3 }, 'ops@x.co')).m, 'Request dismissed.');
  const ev = (await env.DB.prepare("SELECT action, actor_type, actor_id FROM audit_events WHERE action LIKE 'organisation.%' ORDER BY id").all()).results;
  assert.deepEqual(ev.map((e) => e.action), ['organisation.request', 'organisation.request_map', 'organisation.request', 'organisation.request_add', 'organisation.request', 'organisation.request_dismiss']);
  assert.equal(ev[1].actor_id, 'wavelength:Firas');
  assert.equal(ev[5].actor_id, 'ops@x.co', 'the Access email is the actor when present');
});

test('admin: aliases, merge (nothing deleted) and legacy free text confirmed in bulk', async () => {
  const env = makeEnv();
  assert.equal((await admin(env, { action: 'alias_add', org: 'wl-24', alias: 'MMH' })).m, 'Alias added.');
  assert.ok(names(await client(handleApp, env).call('/api/app/organisations?q=mmh')).includes('Medway Maritime Hospital'));
  assert.equal((await admin(env, { action: 'alias_remove', org: 'wl-24', alias_norm: 'mmh' })).m, 'Alias removed.');
  assert.ok(!names(await client(handleApp, env).call('/api/app/organisations?q=mmh')).length);
  assert.match((await admin(env, { action: 'merge', from: 'wl-2', into: 'wl-2' })).m, /itself/);
  await admin(env, { action: 'merge', from: 'wl-2', into: 'wl-1' });
  const row = await env.DB.prepare('SELECT status, merged_into FROM organisations WHERE id = ?').bind('wl-2').first();
  assert.deepEqual({ ...row }, { status: 'merged', merged_into: 'wl-1' });
  assert.deepEqual(names(await client(handleApp, env).call('/api/app/organisations?q=dvh')), ['Dartford and Gravesham NHS Trust'], 'the old alias now finds the organisation it was merged into');

  for (const [e, o] of [['l1@x.co', 'Medway Maritime Hospital'], ['l2@x.co', 'medway maritime hospital'], ['l3@x.co', 'Somewhere else']]) await signup(env, e, { organisation: o });
  const page = await html(env);
  assert.match(page, /Typed organisations not yet linked/);
  assert.match(page, /medway maritime hospital\|wl-24/);
  const r = await admin(env, { action: 'legacy_confirm', confirm: ['medway maritime hospital|wl-24'] });
  assert.match(r.m, /Linked 2 records/);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM learners WHERE organisation_id = 'wl-24'").first()).n, 2);
  assert.equal((await env.DB.prepare("SELECT organisation_id FROM learners WHERE email = 'l3@x.co'").first()).organisation_id, null, 'no silent linking');
});

test('the admin page escapes typed text and puts none of it inside a script or handler', async () => {
  const env = makeEnv();
  const c = await signup(env, 'evil@x.co', { organisation: EVIL });
  await c.call('/api/app/organisations/request', { name: EVIL });
  const page = await html(env);
  assert.ok(!page.includes('<img src=x'));
  assert.ok(!page.includes("x');fetch"));
  assert.ok(!/confirm\('/.test(page));
  assert.match(page, /data-confirm=/);
  assert.match(await html(env, '?q=wl-2'), /Darent Valley Hospital/);
  const withAccess = await organisationsAdminHtml(env, new URL('https://x/admin/organisations/'), { access: 'ops@x.co' });
  assert.ok(!withAccess.includes('name="reviewer"'), 'no typed name with Access on');
});

test('findOrganisations filters by country and caps results', async () => {
  const env = makeEnv();
  assert.equal((await findOrganisations(env, 'nhs', { country: 'IE' })).length, 0);
  assert.ok((await findOrganisations(env, 'nhs', { limit: 3 })).length <= 3);
});
