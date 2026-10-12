// 1.0.12: ending supervision from either side, relationship stages, and the records behind the dashboard tiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { verifiedAccount, signup, idOf, SIG } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { relationshipStage } from '../worker/supervisor-lifecycle.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

globalThis.fetch = async () => new Response('{}');
const kind = LOGBOOK.assessmentKinds[0].id;
const pw = LOGBOOK.pathways.find((p) => p.id === 'famus');

// A learner linked to an accepted supervisor (approval not enforced, the live setting), with three scans.
async function linked(env, tag = 'a') {
  const learner = await verifiedAccount(env, `learner.${tag}@x.co`);
  const sup = await verifiedAccount(env, `sup.${tag}@x.co`);
  await learner.call('/api/app/sync', { entries: [
    { id: `scan${tag}000001`, type: 'efast', date: '2026-09-01', supervision: 'direct' },
    { id: `scan${tag}000002`, type: 'lung', date: '2026-09-02', supervision: 'independent' },
    { id: `scan${tag}000003`, type: 'lung', date: '2026-10-02', supervision: 'direct' },
  ] });
  await learner.call('/api/app/supervisors/add', { email: `sup.${tag}@x.co` });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  return { learner, sup, linkId: inv.id, lid: await idOf(env, `learner.${tag}@x.co`), sid: await idOf(env, `sup.${tag}@x.co`) };
}

test('a supervisor ends supervision from their dashboard: access stops, requests come back, history stays', async () => {
  const env = makeEnv();
  const { learner, sup, linkId, lid } = await linked(env);
  // A sign-off request and an assessment request addressed to the supervisor's dashboard.
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scana000001'], supervisorLink: linkId });
  assert.equal(so.status, 200, JSON.stringify(so.body));
  assert.equal(so.body.toDashboard, true);
  const as = await learner.call('/api/app/assessment/request', { pathway: 'famus', module: pw.modules[0].id, kind, supervisorLink: linkId });
  assert.equal(as.body.toDashboard, true);
  // The supervisor signs one assessment first: it must survive the ending.
  const dom = LOGBOOK.assessmentDomains[0].id;
  const done = await sup.call('/api/app/supervise/assessment/new', { learnerId: lid, pathway: 'famus', module: pw.modules[0].id, kind: 'formative', outcome: 'feedback', domains: { [dom]: LOGBOOK.assessmentScale[0] }, name: 'Dr S', role: 'Consultant', confirm: true, signature: SIG });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const view = await sup.call('/api/app/supervise/learner?id=' + lid);
  assert.equal(view.body.link.id, linkId, 'the dashboard names the link it can end');
  assert.equal(view.body.counts.requests, 2);

  const end = await sup.call('/api/app/supervisors/remove', { id: linkId });
  assert.equal(end.status, 200);
  assert.deepEqual([end.body.ended, end.body.already, end.body.link.endedBy, end.body.link.reason, end.body.returned], [true, false, 'supervisor', 'supervisor_removed', 2]);
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 404, 'the dashboard closes at once');
  assert.equal((await sup.call('/api/app/supervise/learner/scans?id=' + lid)).status, 404);
  assert.equal((await sup.call('/api/app/supervise/signoff?code=' + so.body.code)).status, 404, 'the open request cannot be signed');
  // The requests are back with the learner, unaddressed, with their details.
  const back = await env.DB.prepare('SELECT supervisor_id, returned_reason, status, token_hash FROM signoffs WHERE id = ?').bind(so.body.code).first();
  assert.deepEqual([back.supervisor_id, back.returned_reason, back.status, back.token_hash], [null, 'supervisor_removed', 'pending', null]);
  // The signed assessment is untouched and still verifies.
  const a = await env.DB.prepare('SELECT status FROM assessments WHERE id = ?').bind(done.body.code).first();
  assert.equal(a.status, 'signed');
  assert.equal((await client(handleApp, env).call('/api/app/verify?code=' + done.body.code)).body.ok, true);
  // Both sides see that it ended, and who ended it.
  const ls = (await learner.call('/api/app/supervisors')).body;
  assert.equal(ls.supervisors.length, 0);
  assert.deepEqual([ls.ended[0].role, ls.ended[0].endedBy], ['learner', 'them']);
  const ss = (await sup.call('/api/app/supervisors')).body;
  assert.equal(ss.learners.length, 0);
  assert.deepEqual([ss.ended[0].role, ss.ended[0].endedBy], ['supervisor', 'you']);
  // An audit row, without personal data.
  const au = await env.DB.prepare("SELECT * FROM audit_events WHERE action = 'link.end'").all();
  assert.equal(au.results.length, 1);
  assert.doesNotMatch(au.results[0].meta, /@/);
});

test('a learner removes a supervisor; repeating it, or both ending it at once, ends it exactly once', async () => {
  const env = makeEnv();
  const { learner, sup, linkId } = await linked(env, 'b');
  const [x, y] = await Promise.all([learner.call('/api/app/supervisors/remove', { id: linkId }), sup.call('/api/app/supervisors/remove', { id: linkId })]);
  assert.equal(x.status, 200); assert.equal(y.status, 200);
  assert.deepEqual([x.body.already, y.body.already].sort(), [false, true], 'exactly one request ended it');
  const again = await learner.call('/api/app/supervisors/remove', { id: linkId });
  assert.deepEqual([again.body.ended, again.body.already], [true, true]);
  const au = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'link.end'").first();
  assert.equal(au.n, 1, 'one audit row');
});

test('nobody else can end, probe or restore a relationship', async () => {
  const env = makeEnv();
  const { learner, sup, linkId, lid } = await linked(env, 'c');
  const stranger = await verifiedAccount(env, 'stranger@x.co');
  const other = await linked(env, 'd');
  const r = await stranger.call('/api/app/supervisors/remove', { id: linkId });
  assert.equal(r.status, 404);
  assert.equal((await other.sup.call('/api/app/supervisors/remove', { id: linkId })).status, 404, "another supervisor cannot end someone else's link");
  assert.equal((await other.learner.call('/api/app/supervisors/remove', { id: linkId })).status, 404);
  assert.equal((await stranger.call('/api/app/supervisors/remove', { id: 999999 })).status, 404, 'unknown and foreign ids answer the same');
  assert.equal((await learner.call('/api/app/supervisors/remove', { id: 'x' })).status, 400);
  assert.equal((await env.DB.prepare('SELECT status FROM supervisor_links WHERE id = ?').bind(linkId).first()).status, 'active');
  // Other relationships are untouched by this one ending.
  await learner.call('/api/app/supervisors/remove', { id: linkId });
  assert.equal((await other.sup.call('/api/app/supervise/learner?id=' + other.lid)).status, 200);
  // The supervisor cannot reactivate it: accept refuses an ended link.
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: linkId })).status, 404);
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 404);
  // A new invitation is a new relationship: pending until the supervisor accepts again, with the old acceptance cleared.
  await learner.call('/api/app/supervisors/add', { email: 'sup.c@x.co' });
  const row = await env.DB.prepare('SELECT status, accepted_at, claimed_at, ended_reason FROM supervisor_links WHERE id = ?').bind(linkId).first();
  assert.deepEqual([row.status, row.accepted_at, row.claimed_at, row.ended_reason], ['pending', null, null, null]);
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 404, 'no access until accepted again');
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: linkId })).status, 200);
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 200);
});

test('declining an invitation addressed by email works before the supervisor had an account, after email confirmation', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const learner = await verifiedAccount(env, 'learner.e@x.co');
  await learner.call('/api/app/supervisors/add', { email: 'later@x.co' });
  const sup = await signup(env, 'later@x.co'); // unverified email
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  const r = await sup.call('/api/app/supervisors/remove', { id: inv.id });
  assert.equal(r.status, 403, 'an unconfirmed email cannot decline');
  await env.DB.prepare("UPDATE learners SET email_status = 'verified' WHERE email = 'later@x.co'").run();
  const ok = await sup.call('/api/app/supervisors/remove', { id: inv.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.link.reason, 'supervisor_declined');
  assert.equal((await sup.call('/api/app/supervisors')).body.invites.length, 0);
});

test('the dashboard tiles count exactly the records they open, for that learner only', async () => {
  const env = makeEnv();
  const { learner, sup, lid, linkId } = await linked(env, 'f');
  const other = await linked(env, 'g');
  // Make one scan signed off (server-owned field) for the tile.
  await env.DB.prepare("UPDATE logbook_entries SET data = json_set(data, '$.signoff', json('{\"status\":\"confirmed\",\"code\":\"SO-TEST-0001\"}')) WHERE id = 'scanf000001'").run();
  const v = (await sup.call('/api/app/supervise/learner?id=' + lid)).body;
  assert.deepEqual(v.counts, { scans: 3, supervised: 2, signed: 1, assessments: 0, requests: 0 });
  for (const [f, n] of [['all', 3], ['supervised', 2], ['signed', 1], ['unsigned', 2]]) {
    const r = (await sup.call(`/api/app/supervise/learner/scans?id=${lid}&filter=${f}`)).body;
    assert.equal(r.total, n, f);
    assert.ok(r.entries.every((e) => e.id.startsWith('scanf')), 'only this learner');
    assert.ok(r.entries.every((e) => !('reflection' in e)), 'written summary only');
  }
  assert.equal((await sup.call(`/api/app/supervise/learner/scans?id=${lid}&type=lung`)).body.total, 2);
  assert.equal((await sup.call(`/api/app/supervise/learner/scans?id=${lid}&month=2026-10`)).body.total, 1);
  // The supervisor of learner f cannot list learner g's scans by changing the id.
  assert.equal((await sup.call(`/api/app/supervise/learner/scans?id=${other.lid}`)).status, 404);
  assert.equal((await other.sup.call(`/api/app/supervise/learner/scans?id=${lid}`)).status, 404);
  assert.equal((await learner.call(`/api/app/supervise/learner/scans?id=${lid}`)).status, 404, 'a learner is not their own supervisor');
  assert.ok(linkId);
});

test('relationship stages keep the relationship apart from verification and never reveal private reasons', () => {
  const st = (o) => ({ current: [], standing: 'none', open: null, block: null, status: { hasReg: false }, ...o });
  const L = (o) => ({ status: 'active', supervisor_id: 5, claimed_at: '2026-10-01', ...o });
  assert.equal(relationshipStage(L({ status: 'pending', claimed_at: null }), null, true), 'awaiting_acceptance');
  assert.equal(relationshipStage(L({ status: 'pending' }), st(), true), 'verification_not_submitted');
  assert.equal(relationshipStage(L({ status: 'pending' }), st({ open: { status: 'draft' } }), true), 'verification_not_submitted');
  assert.equal(relationshipStage(L({ status: 'pending' }), st({ open: { status: 'submitted' } }), true), 'awaiting_professional_verification');
  assert.equal(relationshipStage(L({ status: 'pending' }), st({ open: { status: 'more_info' }, status: { hasReg: true } }), true), 'awaiting_approval');
  assert.equal(relationshipStage(L(), st({ current: [{}], standing: 'active' }), true), 'approved');
  assert.equal(relationshipStage(L(), st(), false), 'not_verified');
  // A lapse is never shown to the learner as such (review finding 4): it reads as linkState did.
  assert.equal(relationshipStage(L(), st({ standing: 'paused' }), false), 'not_verified');
  assert.equal(relationshipStage(L(), st({ standing: 'paused' }), true), 'unavailable');
  assert.equal(relationshipStage(L(), st({ standing: 'revoked', block: { id: 1 } }), false), 'unavailable');
  assert.equal(relationshipStage(L(), st({ standing: 'expired' }), true), 'unavailable');
  assert.equal(relationshipStage(L({ status: 'ended' }), st({ current: [{}] }), true), 'ended');
});

test('the learner sees each supervisor with a stage and the requests waiting with them', async () => {
  const env = makeEnv();
  const { learner, linkId } = await linked(env, 'h');
  await learner.call('/api/app/signoff/request', { entryIds: ['scanh000001'], supervisorLink: linkId });
  const s = (await learner.call('/api/app/supervisors')).body.supervisors[0];
  assert.equal(s.stage, 'not_verified');
  assert.equal(s.pending, 1);
  assert.ok(s.acceptedAt);
});

// Review findings, October 2026.
test('ending and its audit row commit together: a failed write changes nothing, and a retry ends it with one audit row', async () => {
  const env = makeEnv();
  const { learner, linkId } = await linked(env, 'i');
  const real = env.DB.batch.bind(env.DB);
  env.DB.batch = async () => { throw new Error('D1 unavailable'); };
  const r = await learner.call('/api/app/supervisors/remove', { id: linkId });
  assert.ok(r.status >= 500, 'the failure is reported, not hidden');
  assert.equal((await env.DB.prepare('SELECT status FROM supervisor_links WHERE id = ?').bind(linkId).first()).status, 'active');
  env.DB.batch = real;
  const ok = await learner.call('/api/app/supervisors/remove', { id: linkId });
  assert.deepEqual([ok.status, ok.body.ended, ok.body.already], [200, true, false]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'link.end'").first()).n, 1);
  await learner.call('/api/app/supervisors/remove', { id: linkId });
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'link.end'").first()).n, 1, 'a repeat writes no second row');
});

test("a supervisor's own withdrawal reads as theirs, not Wavelength's", async () => {
  const env = makeEnv();
  const { learner, sup, linkId } = await linked(env, 'j');
  await env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now'), ended_by = 'self', ended_reason = 'withdrawn' WHERE id = ?").bind(linkId).run();
  assert.equal((await learner.call('/api/app/supervisors')).body.ended[0].endedBy, 'them');
  assert.equal((await sup.call('/api/app/supervisors')).body.ended[0].endedBy, 'you');
});

test('inviting again keeps how an open request was made; requests past their expiry are not counted as waiting', async () => {
  const env = makeEnv();
  const { learner, linkId } = await linked(env, 'k');
  await env.DB.prepare("UPDATE supervisor_links SET status = 'pending', via = 'search' WHERE id = ?").bind(linkId).run();
  await learner.call('/api/app/supervisors/add', { email: 'sup.k@x.co' });
  assert.equal((await env.DB.prepare('SELECT via FROM supervisor_links WHERE id = ?').bind(linkId).first()).via, 'search');
  // Pending count: an expired dashboard request is not "waiting with them".
  await env.DB.prepare("UPDATE supervisor_links SET status = 'active', via = 'email' WHERE id = ?").bind(linkId).run();
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scank000001'], supervisorLink: linkId });
  assert.equal((await learner.call('/api/app/supervisors')).body.supervisors[0].pending, 1);
  await env.DB.prepare('UPDATE signoffs SET expires_at = ? WHERE id = ?').bind(Date.now() - 1000, so.body.code).run();
  assert.equal((await learner.call('/api/app/supervisors')).body.supervisors[0].pending, 0);
});

test('a made-up pathway in the module filter gives an empty list, never an error', async () => {
  const env = makeEnv();
  const { sup, lid } = await linked(env, 'l');
  for (const m of ['__proto__:x', 'constructor:x', 'toString:aaa', 'nope:aaa']) {
    const r = await sup.call(`/api/app/supervise/learner/scans?id=${lid}&module=${encodeURIComponent(m)}`);
    assert.deepEqual([r.status, r.body.total], [200, 0], m);
  }
});
