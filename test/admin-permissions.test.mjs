// Role isolation for native administrator accounts: the General Manager can do every routine action and nothing
// else (every refused request answers 403 and changes no row), the Owner can do everything, switchable permissions
// work per person, and supervisor decisions are attributed to the signed-in account, never a typed name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, browser, bootstrapOwner, activateAndEnrol, signIn, addAdmin, advance, dbFingerprint } from './helpers/admin-accounts.mjs';
import { verifiedAccount, idOf } from './helpers/verify.mjs';
import { GET_ROUTES, POST_ROUTES, ROLES, PERMISSIONS } from '../worker/admin/permissions.js';

globalThis.fetch = async () => new Response('{}');
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const GM_PW = 'Quiet harbour evening 2026';

async function world() {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const link = await addAdmin(owner.b, { username: 'zara', name: 'Zara Manager', role: 'general_manager' });
  advance(31e3);
  const gm = await activateAndEnrol(env, link, GM_PW);
  return { env, owner, gm };
}
// A supervisor with a sent application and a verified registration (as test/supervisor-verification-security does).
async function supervisor(env, email = 'sup.one@example.test', name = { firstName: 'Sam', lastName: 'Example' }) {
  const sup = await verifiedAccount(env, email, name);
  await sup.call('/api/app/supervisor/application', { role: 'Consultant', organisation: 'Example Hospital', registration: { regulator: 'gmc', number: '7400001', profession: 'Doctor' }, experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: 'Regularly' }, areas: ['lung'], pathways: ['famus'] });
  await sup.call('/api/app/supervisor/submit', { declaration: true });
  const sid = await idOf(env, email);
  await env.DB.prepare("UPDATE professional_registrations SET status = 'verified', verified_at = ?, verification_method = 'manual_register' WHERE learner_id = ?").bind(new Date(Date.now()).toISOString(), sid).run();
  return sid;
}

test('the General Manager role is exactly the routine permissions; the Owner has every permission', () => {
  const routine = Object.keys(PERMISSIONS).filter((k) => PERMISSIONS[k].kind === 'routine');
  assert.deepEqual([...ROLES.general_manager.permissions].sort(), routine.sort());
  assert.deepEqual([...ROLES.owner.permissions].sort(), Object.keys(PERMISSIONS).sort());
  for (const k of ['admins.manage', 'logins.manage', 'newsletter.integration', 'supervisors.revoke_all', 'organisations.merge']) assert.equal(PERMISSIONS[k].kind, 'owner', k);
  for (const k of ['records.delete', 'records.export_personal', 'newsletter.send_now', 'business.view']) assert.equal(PERMISSIONS[k].kind, 'switchable', k);
  for (const k of ['supervisors.decide', 'supervisors.email', 'newsletter.pause', 'academy.send_certificates', 'academy.export_feedback', 'organisations.edit', 'sources.review']) assert.equal(PERMISSIONS[k].kind, 'routine', k);
});

test('every GET route: the General Manager reaches the routine ones and is refused the rest; the Owner reaches all', async () => {
  const { env, owner, gm } = await world();
  const gmPerms = new Set(ROLES.general_manager.permissions);
  for (const [path, perm] of Object.entries(GET_ROUTES)) {
    const r = await gm.b.go(path);
    if (gmPerms.has(perm)) assert.notEqual(r.status, 403, `GM should reach ${path}`);
    else assert.equal(r.status, 403, `GM must be refused ${path} (${perm})`);
    const o = await owner.b.go(path);
    assert.notEqual(o.status, 403, `owner reaches ${path}`);
    assert.notEqual(o.to, '/admin/login/', `owner stays signed in at ${path}`);
  }
  // The navigation shows only what the account may open.
  const nav = (await gm.b.go('/admin/')).text;
  for (const s of ['volunteers', 'academy', 'supervisors', 'organisations', 'sources', 'faculty', 'departments', 'newsletter']) assert.match(nav, new RegExp(`href="/admin/${s}/"`), s);
  for (const s of ['accounts', 'logins']) assert.doesNotMatch(nav, new RegExp(`href="/admin/${s}/"`), s);
  // The spreadsheet links the GM cannot use are refused, and the refusal is a page, not a download.
  const csv = await gm.b.go('/admin/volunteers/export.csv');
  assert.equal(csv.status, 403);
  assert.doesNotMatch(csv.headers.get('Content-Type') || '', /csv/);
  void env;
});

test('every POST action the General Manager may not use is refused with 403 and changes nothing', async () => {
  const { env, gm } = await world();
  const sid = await supervisor(env);
  await env.DB.prepare("INSERT INTO volunteers (first_name, last_name, email) VALUES ('Ann', 'Lee', 'ann@x.co')").run();
  const gmPerms = new Set(ROLES.general_manager.permissions);
  let refused = 0;
  for (const [path, actions] of Object.entries(POST_ROUTES)) {
    for (const [action, perm] of Object.entries(actions)) {
      if (gmPerms.has(perm)) continue;
      await gm.b.go(path === '/admin/accounts/' ? '/admin/' : path);
      const before = await dbFingerprint(env);
      const r = await gm.b.go(path, { form: { action, id: '1', learner: String(sid), from: 'x', into: 'y', new_password: 'Another long password 1', client_id: 'a', client_secret: 'b', username: 'evil', display_name: 'Evil', role: 'owner', reason: 'Testing refusal path here', notes: 'Testing refusal path here' } });
      assert.equal(r.status, 403, `${path} ${action} (${perm})`);
      assert.deepEqual(await dbFingerprint(env), before, `${path} ${action} changed nothing`);
      refused++;
    }
  }
  assert.ok(refused >= 14, `refused ${refused} owner-only or switched-off actions`);
  // An action that is not in the registry at all is refused too.
  await gm.b.go('/admin/volunteers/');
  assert.equal((await gm.b.go('/admin/volunteers/', { form: { action: 'something_new', id: '1' } })).status, 403);
  // Refusals are recorded against the account.
  assert.ok((await one(env, "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'admin.denied' AND actor_id = 'acct2'")).n >= refused);
});

test('switchable permissions: the owner switches personal-data export on for one person, and off again at once', async () => {
  const { env, owner, gm } = await world();
  await env.DB.prepare("INSERT INTO volunteers (first_name, last_name, email) VALUES ('Ann', 'Lee', 'ann@x.co')").run();
  assert.equal((await gm.b.go('/admin/volunteers/export.csv')).status, 403);
  await owner.b.go('/admin/accounts/');
  await owner.b.go('/admin/accounts/', { form: { action: 'grants', id: '2', grant: ['records.export_personal', 'admins.manage', 'not.a.permission'] } });
  const g = JSON.parse((await one(env, 'SELECT grants FROM admin_accounts WHERE id = 2')).grants);
  assert.deepEqual(g, ['records.export_personal'], 'only switchable permissions can be switched on');
  assert.equal((await gm.b.go('/admin/')).to, '/admin/login/', 'the change signs her out so it applies at once');
  const b = await signIn(env, 'zara', GM_PW, gm.key);
  const csv = await b.go('/admin/volunteers/export.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.text, /ann@x\.co/);
  assert.equal((await one(env, "SELECT actor_id FROM audit_events WHERE action = 'export.volunteers'")).actor_id, 'acct2');
  assert.equal((await b.go('/admin/accounts/')).status, 403, 'admins.manage cannot be switched on');
  await owner.b.go('/admin/accounts/', { form: { action: 'grants', id: '2' } });
  const b2 = await signIn(env, 'zara', GM_PW, gm.key);
  assert.equal((await b2.go('/admin/volunteers/export.csv')).status, 403);
});

test('supervisor decisions are recorded as the signed-in account; a typed name is ignored', async () => {
  const { env, gm } = await world();
  const sid = await supervisor(env);
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  const r = await gm.b.go('/admin/supervisors/', { form: { action: 'appr_add', learner: String(sid), scope: 'famus:famus-thoracic', reviewer: 'Someone Else' } });
  assert.equal(r.status, 303);
  const a = await one(env, "SELECT approved_by FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'", sid);
  assert.ok(a, 'approved');
  assert.equal(a.approved_by, 'admin:acct2:Zara Manager');
  const ev = await one(env, "SELECT actor_id FROM audit_events WHERE action = 'approval.grant'");
  assert.equal(ev.actor_id, 'acct2:Zara Manager');
  // The console page shows who will be recorded, with no name box.
  const page = (await gm.b.go(`/admin/supervisors/?id=${sid}`)).text;
  assert.match(page, /Recorded as Zara Manager \(your administrator account\)/);
  assert.doesNotMatch(page, /<input name="reviewer" autocomplete="name"/);
});

test('owner-only supervisor and organisation actions: revoke every approval, merge organisations', async () => {
  const { env, owner, gm } = await world();
  const sid = await supervisor(env);
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  await gm.b.go('/admin/supervisors/', { form: { action: 'appr_add', learner: String(sid), scope: 'famus:famus-thoracic' } });
  const live = async () => (await one(env, "SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'", sid)).n;
  assert.equal(await live(), 1);
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  assert.equal((await gm.b.go('/admin/supervisors/', { form: { action: 'appr_revoke_all', learner: String(sid), notes: 'Testing the owner-only revoke all' } })).status, 403);
  assert.equal(await live(), 1);
  // The General Manager can revoke one of several approvals with a reason...
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  await gm.b.go('/admin/supervisors/', { form: { action: 'appr_add', learner: String(sid), scope: 'famus:famus-dvt' } });
  assert.equal(await live(), 2);
  const first = await one(env, "SELECT id FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved' ORDER BY id LIMIT 1", sid);
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  await gm.b.go('/admin/supervisors/', { form: { action: 'appr_revoke', learner: String(sid), sid: String(first.id), notes: 'Scope not supported by the evidence held' } });
  assert.equal(await live(), 1);
  assert.equal((await one(env, 'SELECT status FROM supervisor_approvals WHERE id = ?', first.id)).status, 'revoked');
  // ...but not the last one: that ends their supervisor status, which only the owner can do.
  const last = await one(env, "SELECT id FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'", sid);
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  const refusedLast = await gm.b.go('/admin/supervisors/', { form: { action: 'appr_revoke', learner: String(sid), sid: String(last.id), notes: 'Scope not supported by the evidence held' } });
  assert.match(decodeURIComponent(refusedLast.to || ''), /Only the owner can do that/);
  assert.equal(await live(), 1);
  assert.equal((await one(env, 'SELECT COUNT(*) AS n FROM supervisor_blocks WHERE learner_id = ?', sid)).n, 0);
  await owner.b.go(`/admin/supervisors/?id=${sid}`);
  await owner.b.go('/admin/supervisors/', { form: { action: 'appr_revoke', learner: String(sid), sid: String(last.id), notes: 'Owner ends supervisor status for testing' } });
  assert.equal(await live(), 0);
  await owner.b.go('/admin/organisations/');
  assert.notEqual((await owner.b.go('/admin/organisations/', { form: { action: 'merge', from: 'x', into: 'y' } })).status, 403);
  await gm.b.go('/admin/organisations/');
  assert.equal((await gm.b.go('/admin/organisations/', { form: { action: 'merge', from: 'x', into: 'y' } })).status, 403);
});

test('self-approval: a linked logbook account is recognised for any display name; the independent review comes from someone else', async () => {
  const { env, owner, gm } = await world();
  // The owner is also a supervisor, with a logbook account in a different name from their admin display name.
  const sid = await supervisor(env, 'owner.sup@example.test', { firstName: 'Firstname', lastName: 'Different' });
  await owner.b.go('/admin/accounts/');
  await owner.b.go('/admin/accounts/', { form: { action: 'link', id: '1', learner_email: 'owner.sup@example.test' } });
  assert.equal((await one(env, 'SELECT learner_id FROM admin_accounts WHERE id = 1')).learner_id, sid);
  // The owner approves their own record: recognised as a self-approval although the names differ.
  const page = (await owner.b.go(`/admin/supervisors/?id=${sid}`)).text;
  assert.match(page, /self_ack/, 'the self-approval acknowledgement is shown');
  const r = await owner.b.go('/admin/supervisors/', { form: { action: 'appr_add', learner: String(sid), scope: 'famus:famus-thoracic', self_ack: '1', self_reason: 'Independent evidence: FAMUS mentor certificate held' } });
  assert.equal(r.status, 303);
  const meta = JSON.parse((await one(env, "SELECT meta FROM audit_events WHERE action = 'approval.grant'")).meta);
  assert.equal(meta.selfApproval, true);
  // The owner cannot record the independent review of their own approval; the General Manager can.
  await owner.b.go(`/admin/supervisors/?id=${sid}`);
  const own = await owner.b.go('/admin/supervisors/', { form: { action: 'appr_independent_review', learner: String(sid), outcome: 'confirmed' } });
  assert.match(decodeURIComponent(own.to || ''), /someone other than the supervisor/);
  await gm.b.go(`/admin/supervisors/?id=${sid}`);
  const ok = await gm.b.go('/admin/supervisors/', { form: { action: 'appr_independent_review', learner: String(sid), outcome: 'confirmed' } });
  assert.match(decodeURIComponent(ok.to || ''), /Independent review recorded/);
  assert.equal((await one(env, "SELECT actor_id FROM audit_events WHERE action = 'approval.independent_review'")).actor_id, 'acct2:Zara Manager');
});
