// 29 Oct 2026 (owner): a sign-off link a learner shares (WhatsApp, text, email) reaches each of their active
// supervisors' dashboards with Review and sign, unless the learner addressed it to someone else's email; opening it
// there attaches it to that supervisor. A supervisor signed in on the link page signs as their own account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount, idOf, SIG } from './helpers/verify.mjs';

async function linked(env, tag) {
  const learner = await verifiedAccount(env, `learner.${tag}@x.co`, { firstName: 'Sam', lastName: 'Trainee' });
  const sup = await verifiedAccount(env, `sup.${tag}@x.co`, { firstName: 'Ana', lastName: 'Supervisor' });
  await learner.call('/api/app/sync', { entries: [
    { id: `scan${tag}000001`, type: 'efast', date: '2026-09-01', supervision: 'direct' },
    { id: `scan${tag}000002`, type: 'lung', date: '2026-09-02', supervision: 'independent' },
  ] });
  await learner.call('/api/app/supervisors/add', { email: `sup.${tag}@x.co` });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  return { learner, sup, lid: await idOf(env, `learner.${tag}@x.co`), sid: await idOf(env, `sup.${tag}@x.co`) };
}
const tokenOf = (r) => r.body.link.split('#')[1];

test('a shared link from a linked learner shows on the supervisor dashboard and signs from it', async () => {
  const env = makeEnv();
  const { learner, sup, lid, sid } = await linked(env, 'a');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scana000002'] });
  assert.equal(so.status, 200);
  assert.equal(so.body.toDashboard, false, 'sent as a link, not to the dashboard');
  const home = (await sup.call('/api/app/supervisors')).body.learners.find((x) => x.id === lid);
  assert.equal(home.pending, 1, 'counted as waiting on the supervisor home');
  const view = (await sup.call('/api/app/supervise/learner?id=' + lid)).body;
  assert.deepEqual(view.signoffRequests.map((r) => r.code), [so.body.code]);
  assert.equal(view.recent.find((e) => e.id === 'scana000002').waiting, so.body.code, 'the scan card offers Review and sign');
  const tile = (await sup.call('/api/app/supervise/learner/scans?id=' + lid + '&filter=waiting')).body;
  assert.deepEqual(tile.entries.map((e) => e.id), ['scana000002']);
  // Opening it attaches it to this supervisor; signing then works as a dashboard request.
  const open = await sup.call('/api/app/supervise/signoff?code=' + so.body.code);
  assert.equal(open.status, 200, JSON.stringify(open.body));
  assert.equal((await env.DB.prepare('SELECT supervisor_id FROM signoffs WHERE id = ?').bind(so.body.code).first()).supervisor_id, sid);
  const done = await sup.call('/api/app/supervise/signoff', { code: so.body.code, name: 'Dr Ana Supervisor', role: 'Consultant', confirm: true, signature: SIG, decisions: { scana000002: 'confirmed' } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const row = await env.DB.prepare('SELECT status, method, token_hash FROM signoffs WHERE id = ?').bind(so.body.code).first();
  assert.deepEqual([row.status, row.method, row.token_hash], ['signed', 'dashboard', null], 'signed once; the link is closed');
});

test('a link addressed to someone else, a stranger, or a returned request stays off the dashboard', async () => {
  const env = makeEnv();
  const { learner, sup, lid } = await linked(env, 'b');
  const other = await learner.call('/api/app/signoff/request', { entryIds: ['scanb000001'], supervisorEmail: 'someone.else@x.co' });
  const mine = await learner.call('/api/app/signoff/request', { entryIds: ['scanb000002'], supervisorEmail: 'SUP.B@x.co' });
  const codes = (await sup.call('/api/app/supervise/learner?id=' + lid)).body.signoffRequests.map((r) => r.code);
  assert.deepEqual(codes, [mine.body.code], 'their own email counts (any case); another email does not');
  assert.equal((await sup.call('/api/app/supervise/signoff?code=' + other.body.code)).status, 404);
  // A supervisor not linked to this learner sees and opens nothing.
  const stranger = await verifiedAccount(env, 'stranger.b@x.co');
  assert.equal((await stranger.call('/api/app/supervise/signoff?code=' + mine.body.code)).status, 404);
  assert.equal((await stranger.call('/api/app/supervisors')).body.learners.length, 0);
  // Sent back to the learner: no longer waiting for anyone.
  await env.DB.prepare("UPDATE signoffs SET returned_at = datetime('now'), returned_reason = 'declined' WHERE id = ?").bind(mine.body.code).run();
  assert.deepEqual((await sup.call('/api/app/supervise/learner?id=' + lid)).body.signoffRequests, []);
});

test('signed in on the link page, a supervisor signs as their own account', async () => {
  const env = makeEnv();
  const { learner, sup, sid } = await linked(env, 'c');
  const so = await learner.call('/api/app/signoff/request', { entryIds: ['scanc000001'], supervisorName: 'Dr Typed Name' });
  const form = { token: tokenOf(so), name: 'Someone Else', role: 'Consultant', email: 'typed@x.co', confirm: true, signature: SIG, decisions: { scanc000001: 'confirmed' } };
  const r = await sup.call('/api/app/signoff/complete', { ...form, asAccount: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await env.DB.prepare('SELECT supervisor_name, supervisor_email, supervisor_id, supervisor_snapshot FROM signoffs WHERE id = ?').bind(so.body.code).first();
  assert.equal(row.supervisor_name, 'Ana Supervisor', "the account's name, not the typed one");
  assert.equal(row.supervisor_email, 'sup.c@x.co');
  assert.equal(row.supervisor_id, sid);
  const snap = JSON.parse(row.supervisor_snapshot || 'null');
  if (snap) assert.equal(snap.identity, 'wavelength_account');
});

test('without asAccount, or as the learner, the link signs as declared', async () => {
  const env = makeEnv();
  const { learner, sup } = await linked(env, 'd');
  const a = await learner.call('/api/app/signoff/request', { entryIds: ['scand000001'] });
  const b = await learner.call('/api/app/signoff/request', { entryIds: ['scand000002'] });
  const form = (so, id) => ({ token: tokenOf(so), name: 'Dr Declared', role: 'Registrar', confirm: true, signature: SIG, decisions: { [id]: 'confirmed' } });
  assert.equal((await sup.call('/api/app/signoff/complete', form(a, 'scand000001'))).status, 200);
  assert.equal((await learner.call('/api/app/signoff/complete', { ...form(b, 'scand000002'), asAccount: true })).status, 200);
  for (const so of [a, b]) {
    const row = await env.DB.prepare('SELECT supervisor_name, supervisor_id FROM signoffs WHERE id = ?').bind(so.body.code).first();
    assert.deepEqual([row.supervisor_name, row.supervisor_id], ['Dr Declared', null]);
  }
});
