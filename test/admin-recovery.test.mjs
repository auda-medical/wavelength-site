// Owner emergency recovery (tools/admin-recover.mjs): the printed SQL, run against the database, gives a working
// single-use owner link that resets the password (and, if asked, two-step), ends every session, and works only for an
// Owner account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, browser, bootstrapOwner, activateAndEnrol, addAdmin, codeFor, keyIn, advance, ORIGIN } from './helpers/admin-accounts.mjs';
import { buildRecovery } from '../tools/admin-recover.mjs';

const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();

test('recovery without two-step reset: new password, then the existing authenticator', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const r = await buildRecovery('owner', { now: Date.now() });
  await env.DB.exec(r.sql);
  assert.equal((await owner.b.go('/admin/')).to, '/admin/login/', 'every session ended');
  advance(31e3);
  assert.equal((await browser(env).go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false })).to, '/admin/login/?error=1', 'old password stopped');
  const b = browser(env);
  const path = r.link.replace(ORIGIN, '');
  assert.equal((await b.go(path)).status, 200);
  const t = new URL(r.link).searchParams.get('t');
  assert.equal((await b.go('/admin/activate/', { form: { t, password: 'Recovered phrase 2026', password2: 'Recovered phrase 2026' }, keepCsrf: false })).to, '/admin/two-step/');
  await b.go('/admin/two-step/');
  assert.equal((await b.go('/admin/two-step/', { form: { code: await codeFor(owner.key) } })).to, '/admin/');
  assert.equal((await one(env, "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'admin.emergency_recovery'")).n, 1);
  assert.equal((await browser(env).go(path)).status, 410, 'the link worked once');
});

test('recovery with two-step reset: a fresh authenticator set-up; only owners can be recovered', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const link = await addAdmin(owner.b, { username: 'zara', name: 'Zara Manager', role: 'general_manager' });
  advance(31e3);
  await activateAndEnrol(env, link, 'Quiet harbour evening 2026');
  // Not an owner: the SQL writes nothing for her.
  const notOwner = await buildRecovery('zara');
  await env.DB.exec(notOwner.sql);
  assert.equal((await browser(env).go(notOwner.link.replace(ORIGIN, ''))).status, 410);
  assert.ok((await one(env, "SELECT password_hash FROM admin_accounts WHERE username = 'zara'")).password_hash);
  // The owner with a lost phone and lost codes.
  const r = await buildRecovery('owner', { resetTwoStep: true });
  await env.DB.exec(r.sql);
  assert.equal((await one(env, "SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE admin_id = 1")).n, 0);
  const b = browser(env);
  const t = new URL(r.link).searchParams.get('t');
  await b.go(r.link.replace(ORIGIN, ''));
  assert.equal((await b.go('/admin/activate/', { form: { t, password: 'Recovered phrase 2026', password2: 'Recovered phrase 2026' }, keepCsrf: false })).to, '/admin/two-step/setup/');
  const key = keyIn((await b.go('/admin/two-step/setup/')).text);
  assert.notEqual(key, owner.key);
  await b.go('/admin/two-step/setup/', { form: { code: await codeFor(key) } });
  assert.equal((await b.go('/admin/accounts/')).status, 200);
  await assert.rejects(buildRecovery("x'; DROP TABLE learners; --"), /owner username/);
});
