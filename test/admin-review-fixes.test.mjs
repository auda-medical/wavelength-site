// Fixes from the code review of the administrator accounts branch (11 October 2026): accounts mode is sticky (the shared
// login never returns), the Zoho return trip keeps the session, owners recover with recovery codes, disabling ends
// activation links, your own logbook link cannot be quietly changed, failures write the same for every username, and
// the CSRF token reaches forms in any quoting style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, browser, bootstrapOwner, activateAndEnrol, signIn, addAdmin, linkIn, keyIn, codeFor, advance, SHARED_PW, ORIGIN } from './helpers/admin-accounts.mjs';
import { verifiedAccount } from './helpers/verify.mjs';
import { buildRecovery } from '../tools/admin-recover.mjs';
import { withCsrf } from '../worker/admin/routes.js';

const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();

test('the shared login never comes back, even while the only owner is being recovered', async () => {
  const env = await setupEnv();
  await bootstrapOwner(env);
  assert.ok(await one(env, "SELECT value FROM settings WHERE key = 'admin_accounts_live'"), 'mode recorded');
  const r = await buildRecovery('owner', { resetTwoStep: true });
  await env.DB.exec(r.sql);
  // The owner now has no password and no authenticator, but accounts stay in force.
  const legacy = browser(env);
  assert.equal((await legacy.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } })).to, '/admin/login/?error=1');
  assert.equal((await legacy.go('/admin/accounts/')).to, '/admin/login/');
  // A fresh isolate (no cached mode) reads the stored flag.
  const env2 = await setupEnv();
  await env2.DB.prepare("INSERT INTO settings (key, value) VALUES ('admin_accounts_live', 'x')").run();
  assert.equal((await browser(env2).go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } })).to, '/admin/login/?error=1');
});

test('the session cookie is sent on the return from Zoho (a top-level navigation from another site)', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  // Browsers send SameSite=Lax cookies (asserted in admin-accounts.test.mjs) on cross-site top-level GETs, and the
  // console must accept that request: no CSRF token is needed for a GET.
  const r = await owner.b.go('/admin/newsletter/callback/?state=1.x&code=abc', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.notEqual(r.to, '/admin/login/');
  assert.match(decodeURIComponent(r.to || ''), /Connection link expired/, 'the callback ran (its own signed state is checked)');
});

test('an owner without their phone: recovery code to sign in, recovery code to re-authenticate, then a new authenticator', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  advance(11 * 60e3);
  const b = browser(env);
  await b.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false });
  await b.go('/admin/two-step/');
  await b.go('/admin/two-step/', { form: { code: owner.codes[0] } });
  advance(11 * 60e3);
  await b.go('/admin/');
  assert.equal((await b.go('/admin/accounts/')).to, '/admin/reauth/?next=%2Fadmin%2Faccounts%2F');
  await b.go('/admin/reauth/?next=%2Fadmin%2Faccounts%2F');
  assert.equal((await b.go('/admin/reauth/', { form: { action: 'reauth', next: '/admin/accounts/', password: owner.password, code: owner.codes[1] } })).to, '/admin/accounts/');
  // New authenticator from Your account: old key and old recovery codes stop working.
  await b.go('/admin/account/');
  assert.match((await b.go('/admin/account/', { form: { action: 'two_step_renew', current: owner.password, code: owner.codes[1] } })).to, /not%20correct/, 'a used recovery code is refused');
  assert.equal((await b.go('/admin/account/', { form: { action: 'two_step_renew', current: owner.password, code: owner.codes[2] } })).to, '/admin/two-step/setup/');
  const key = keyIn((await b.go('/admin/two-step/setup/')).text);
  assert.notEqual(key, owner.key);
  const done = await b.go('/admin/two-step/setup/', { form: { code: await codeFor(key) } });
  assert.match(done.text, /Save your recovery codes/);
  assert.equal((await b.go('/admin/')).status, 200);
  assert.equal((await one(env, "SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE admin_id = 1 AND used_at IS NULL")).n, 10);
  // The old authenticator no longer signs in; the new one does.
  advance(31e3);
  const c = browser(env);
  await c.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false });
  await c.go('/admin/two-step/');
  assert.match((await c.go('/admin/two-step/', { form: { code: await codeFor(owner.key) } })).text, /not correct/);
  await signIn(env, 'owner', owner.password, key);
  assert.equal((await one(env, "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'admin.two_step_renew'")).n, 1);
});

test('disabling an account ends its unused activation links, so restoring it does not revive them', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const link = await addAdmin(owner.b, { username: 'zara', name: 'Zara Manager', role: 'general_manager' });
  await owner.b.go('/admin/accounts/', { form: { action: 'disable', id: '2' } });
  await owner.b.go('/admin/accounts/', { form: { action: 'restore', id: '2' } });
  assert.equal((await browser(env).go(link)).status, 410);
  // A fresh link from a password reset works.
  const r = await owner.b.go('/admin/accounts/', { form: { action: 'reset_password', id: '2' } });
  advance(31e3);
  await activateAndEnrol(env, linkIn(r.text), 'Quiet harbour evening 2026');
});

test('an owner can set their own logbook link once; changing it needs another owner', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  await verifiedAccount(env, 'owner.sup@example.test', { firstName: 'Olivia', lastName: 'Owner' });
  await verifiedAccount(env, 'other@example.test', { firstName: 'Other', lastName: 'Person' });
  await owner.b.go('/admin/accounts/');
  await owner.b.go('/admin/accounts/', { form: { action: 'link', id: '1', learner_email: 'owner.sup@example.test' } });
  const first = (await one(env, 'SELECT learner_id FROM admin_accounts WHERE id = 1')).learner_id;
  assert.ok(first);
  for (const email of ['', 'other@example.test']) {
    const r = await owner.b.go('/admin/accounts/', { form: { action: 'link', id: '1', learner_email: email } });
    assert.match(r.text, /Another owner must change it/);
  }
  assert.equal((await one(env, 'SELECT learner_id FROM admin_accounts WHERE id = 1')).learner_id, first);
});

test('a refused sign-in writes the same records whether or not the username exists', async () => {
  const env = await setupEnv();
  await bootstrapOwner(env);
  const before = (await one(env, "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'admin.sign_in_failed'")).n;
  const b = browser(env);
  await b.go('/admin/login/', { form: { username: 'nobody-here', password: 'whatever password' }, keepCsrf: false });
  await b.go('/admin/login/', { form: { username: 'owner', password: 'wrong password!!' }, keepCsrf: false });
  const rows = (await env.DB.prepare("SELECT actor_id, subject_id FROM audit_events WHERE action = 'admin.sign_in_failed' ORDER BY id").all()).results.slice(before);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.actor_id), ['anonymous', 'acct1']);
  assert.ok(!JSON.stringify(rows).includes('nobody-here'), 'the attempted username is not stored');
});

test('the CSRF token is added to post forms in any quoting style, and only to post forms', () => {
  const html = `<form method="post"></form><form method='post' class="x"></form><form class="y" method=POST></form><form method="get"></form>`;
  const out = withCsrf(html, 'TOKEN');
  assert.equal((out.match(/name="_csrf" value="TOKEN"/g) || []).length, 3);
  assert.match(out, /<form method="get"><\/form>/);
  void ORIGIN;
});
