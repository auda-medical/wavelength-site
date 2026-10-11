// Native administrator accounts (worker/admin/, migration 0017): bootstrap of the first Owner, activation links,
// mandatory two-step verification, sign-in throttling and lock-out, sessions, CSRF, owner management, and the end of
// the shared login once an Owner account is live. Every test runs through the whole Worker (worker/index.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupEnv, browser, bootstrapOwner, activateAndEnrol, signIn, addAdmin, linkIn, keyIn, codeFor, advance, SHARED_PW, SECRETS, ORIGIN,
} from './helpers/admin-accounts.mjs';
import { stepAt } from '../worker/admin/crypto.js';

const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const audits = async (env, action) => (await one(env, 'SELECT COUNT(*) AS n FROM audit_events WHERE action = ?', action)).n;

test('bootstrap: the shared login sets up the first Owner only with the set-up code; then only personal accounts sign in', async () => {
  const env = await setupEnv();
  const legacy = browser(env);
  assert.equal((await legacy.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } })).to, '/admin/');
  // Legacy console still works and offers the set-up page.
  const page = await legacy.go('/admin/accounts/');
  assert.match(page.text, /Set up personal administrator accounts/);
  // A wrong set-up code creates nothing and is recorded.
  const wrong = await legacy.go('/admin/accounts/', { form: { action: 'bootstrap', code: 'not the code', username: 'owner', display_name: 'Olivia Owner' } });
  assert.match(wrong.text, /set-up code is not correct/);
  assert.equal((await one(env, 'SELECT COUNT(*) AS n FROM admin_accounts')).n, 0);
  assert.equal(await audits(env, 'admin.bootstrap_refused'), 1);
  // Without the Worker secret, nothing can be set up at all.
  const noCode = await setupEnv({ ADMIN_BOOTSTRAP_CODE: '' });
  const l2 = browser(noCode);
  await l2.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } });
  assert.match((await l2.go('/admin/accounts/', { form: { action: 'bootstrap', code: '', username: 'owner', display_name: 'X' } })).text, /not correct/);

  const { owner } = await bootstrapOwner(env);
  const acc = await one(env, "SELECT * FROM admin_accounts WHERE username = 'owner'");
  assert.equal(acc.role, 'owner');
  assert.equal(acc.status, 'active');
  // Stored secrets are not readable: a peppered hash, a sealed seed, hashed recovery codes.
  assert.match(acc.password_hash, /^apbkdf2\$100000\$/);
  assert.ok(!acc.password_hash.includes(owner.password));
  assert.match(acc.totp_secret, /^v1\./);
  assert.ok(!acc.totp_secret.includes(owner.key));
  const rc = await all(env, 'SELECT code_hash FROM admin_recovery_codes WHERE admin_id = ?', acc.id);
  assert.equal(rc.length, 10);
  for (const c of owner.codes) assert.ok(!rc.some((r) => r.code_hash.includes(c.replace('-', ''))));

  // Accounts are live: the shared login and its old cookie no longer open anything.
  const after = browser(env);
  assert.equal((await after.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } })).to, '/admin/login/?error=1');
  assert.equal((await legacy.go('/admin/volunteers/')).to, '/admin/login/');
  assert.equal((await legacy.go('/admin/accounts/', { form: { action: 'bootstrap', code: SECRETS.ADMIN_BOOTSTRAP_CODE, username: 'evil', display_name: 'Evil' } })).to, '/admin/login/');
  assert.equal((await one(env, 'SELECT COUNT(*) AS n FROM admin_accounts')).n, 1);
  // The owner is signed in and sees the console with their name.
  const home = await owner.b.go('/admin/');
  assert.equal(home.status, 200);
  assert.match(home.text, /Signed in as Olivia Owner \(Owner\)/);
  assert.match(home.text, /href="\/admin\/accounts\/"/);
});

test('sign-in needs the password and a current authenticator code; codes are single use; recovery codes work once', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = browser(env);
  advance(31e3);
  assert.equal((await b.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false })).to, '/admin/two-step/');
  // The password alone opens nothing.
  for (const p of ['/admin/', '/admin/volunteers/', '/admin/accounts/']) assert.equal((await b.go(p)).to, '/admin/two-step/', p);
  await b.go('/admin/two-step/');
  const code = await codeFor(owner.key);
  assert.equal((await b.go('/admin/two-step/', { form: { code: '000000' } })).status, 200);
  assert.equal((await b.go('/admin/two-step/', { form: { code } })).to, '/admin/');
  assert.equal((await b.go('/admin/')).status, 200);
  // The same code cannot be used again (replay), even in a new sign-in within the same time step.
  const b2 = browser(env);
  await b2.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false });
  await b2.go('/admin/two-step/');
  const replay = await b2.go('/admin/two-step/', { form: { code } });
  assert.equal(replay.status, 200);
  assert.match(replay.text, /not correct, or was already used/);
  // Clock window: the previous step's code is accepted once; two steps back is refused.
  advance(90e3);
  const old2 = await codeFor(owner.key, stepAt() - 2);
  assert.match((await b2.go('/admin/two-step/', { form: { code: old2 } })).text, /not correct/);
  const prev = await codeFor(owner.key, stepAt() - 1);
  assert.equal((await b2.go('/admin/two-step/', { form: { code: prev } })).to, '/admin/');
  // A recovery code works once.
  const b3 = browser(env);
  await b3.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false });
  await b3.go('/admin/two-step/');
  const r1 = await b3.go('/admin/two-step/', { form: { code: owner.codes[0].toUpperCase() } });
  assert.match(r1.to, /^\/admin\/account\/\?m=Signed%20in%20with%20a%20recovery%20code\.%209%20left/);
  const b4 = browser(env);
  await b4.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false });
  await b4.go('/admin/two-step/');
  assert.match((await b4.go('/admin/two-step/', { form: { code: owner.codes[0] } })).text, /not correct/);
  assert.equal(await audits(env, 'admin.recovery_code_used'), 1);
  // Every sign-in is recorded against the account.
  assert.ok(await audits(env, 'admin.sign_in') >= 3);
});

test('wrong passwords: one answer for unknown users and wrong passwords; ten failures lock the account for 15 minutes', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = browser(env);
  const unknown = await b.go('/admin/login/', { form: { username: 'nobody', password: 'whatever password' }, keepCsrf: false });
  const wrong = await b.go('/admin/login/', { form: { username: 'owner', password: 'wrong password!!' }, keepCsrf: false });
  assert.equal(unknown.to, '/admin/login/?error=1');
  assert.equal(wrong.to, unknown.to);
  for (let i = 0; i < 9; i++) await b.go('/admin/login/', { form: { username: 'owner', password: 'wrong password!!' }, keepCsrf: false });
  assert.ok((await one(env, "SELECT locked_until FROM admin_accounts WHERE username = 'owner'")).locked_until, 'locked');
  assert.equal(await audits(env, 'admin.locked'), 1);
  // Locked: even the right password gets the same answer.
  assert.equal((await b.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false })).to, '/admin/login/?error=1');
  advance(16 * 60e3);
  assert.equal((await b.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false })).to, '/admin/two-step/');
  // Network-address limit: more than ten attempts a minute from one address are refused before any check.
  const env2 = await setupEnv();
  await bootstrapOwner(env2);
  const c = browser(env2);
  let refusedEarly = 0;
  for (let i = 0; i < 12; i++) {
    const r = await c.go('/admin/login/', { form: { username: 'owner', password: 'wrong password!!' }, keepCsrf: false, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
    if (r.to === '/admin/login/?error=1') refusedEarly++;
  }
  assert.equal(refusedEarly, 12);
  assert.ok((await one(env2, "SELECT failed_count FROM admin_accounts WHERE username = 'owner'")).failed_count <= 10, 'the limit stops counting attempts past ten a minute');
});

test('session cookie: __Secure-, HttpOnly, SameSite=Strict, /admin only; idle and absolute expiry', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = browser(env);
  advance(31e3);
  const p = await b.go('/admin/login/', { form: { username: 'owner', password: owner.password }, keepCsrf: false });
  const set = p.setCookies.find((c) => c.startsWith('__Secure-wl_admin_session='));
  assert.match(set, /; Path=\/admin; HttpOnly; Secure; SameSite=Strict/);
  await b.go('/admin/two-step/');
  await b.go('/admin/two-step/', { form: { code: await codeFor(owner.key) } });
  assert.equal((await b.go('/admin/')).status, 200);
  // 61 minutes without activity ends the session.
  advance(61 * 60e3);
  assert.equal((await b.go('/admin/')).to, '/admin/login/');
  // Active use keeps it alive, but never beyond 12 hours.
  const s = await signIn(env, 'owner', owner.password, owner.key);
  for (let i = 0; i < 14; i++) { advance(55 * 60e3); await s.go('/admin/'); }
  assert.equal((await s.go('/admin/')).to, '/admin/login/');
});

test('CSRF and origin: a post without the session token, with another session\'s token or from another site changes nothing', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  await env.DB.prepare("INSERT INTO volunteers (first_name, last_name, email) VALUES ('Ann', 'Lee', 'ann@x.co')").run();
  const vid = (await one(env, 'SELECT id FROM volunteers')).id;
  const b = owner.b;
  await b.go('/admin/volunteers/');
  assert.match((await b.go('/admin/volunteers/')).text, /name="_csrf" value=/, 'every console form carries the token');
  const other = await signIn(env, 'owner', owner.password, owner.key);
  const otherToken = other.csrf;
  assert.ok(otherToken && otherToken !== b.csrf);
  for (const attempt of [{ _csrf: '' }, { _csrf: otherToken }, { _csrf: 'x'.repeat(32) }]) {
    const r = await b.go('/admin/volunteers/', { form: { action: 'contacted', id: vid, ...attempt } });
    assert.equal(r.status, 403);
  }
  assert.equal((await b.go('/admin/volunteers/', { form: { action: 'contacted', id: vid }, origin: 'https://evil.example' })).status, 403);
  // No Origin and no Sec-Fetch-Site: refused too.
  assert.equal((await b.go('/admin/volunteers/', { form: { action: 'contacted', id: vid }, origin: '' })).status, 403);
  assert.equal((await one(env, 'SELECT contacted FROM volunteers WHERE id = ?', vid)).contacted, 0);
  // With the right token it works, and it is recorded against the account.
  assert.equal((await b.go('/admin/volunteers/', { form: { action: 'contacted', id: vid } })).to, '/admin/volunteers/');
  assert.equal((await one(env, 'SELECT contacted FROM volunteers WHERE id = ?', vid)).contacted, 1);
  const a = await one(env, "SELECT actor_type, actor_id FROM audit_events WHERE action = 'volunteer.contacted'");
  assert.deepEqual([a.actor_type, a.actor_id], ['admin', 'acct1']);
});

test('owner security pages need a password and code check from the last 10 minutes', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = owner.b;
  assert.equal((await b.go('/admin/accounts/')).status, 200);
  advance(11 * 60e3);
  await b.go('/admin/');
  assert.equal((await b.go('/admin/accounts/')).to, '/admin/reauth/?next=%2Fadmin%2Faccounts%2F');
  assert.equal((await b.go('/admin/accounts/', { form: { action: 'create', username: 'gm', display_name: 'G M', role: 'general_manager' } })).to, '/admin/reauth/?next=%2Fadmin%2Faccounts%2F');
  assert.equal((await one(env, 'SELECT COUNT(*) AS n FROM admin_accounts')).n, 1);
  await b.go('/admin/reauth/?next=%2Fadmin%2Faccounts%2F');
  assert.match((await b.go('/admin/reauth/', { form: { action: 'reauth', next: '/admin/accounts/', password: 'wrong one here', code: await codeFor(owner.key) } })).text, /not correct/);
  advance(31e3);
  assert.equal((await b.go('/admin/reauth/', { form: { action: 'reauth', next: '/admin/accounts/', password: owner.password, code: await codeFor(owner.key) } })).to, '/admin/accounts/');
  assert.equal((await b.go('/admin/accounts/')).status, 200);
  // The next page is always inside the console.
  advance(31e3 + 11 * 60e3);
  await b.go('/admin/reauth/');
  assert.equal((await b.go('/admin/reauth/', { form: { action: 'reauth', next: 'https://evil.example/', password: owner.password, code: await codeFor(owner.key) } })).to, '/admin/');
});

test('owner manages an administrator: activation link once, role change, disable and restore, password and two-step reset, sign out', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const link = await addAdmin(owner.b, { username: 'zara', name: 'Zara Manager', role: 'general_manager' });
  // The link opens once; activation needs a 12-character password without the username.
  const z = browser(env);
  const token = new URL(ORIGIN + link).searchParams.get('t');
  await z.go(link);
  assert.match((await z.go('/admin/activate/', { form: { t: token, password: 'short', password2: 'short' }, keepCsrf: false })).text, /at least 12 characters/);
  assert.match((await z.go('/admin/activate/', { form: { t: token, password: 'zara password long', password2: 'zara password long' }, keepCsrf: false })).text, /username/);
  advance(31e3);
  const gm = await activateAndEnrol(env, link, 'Quiet harbour evening 2026', z);
  assert.equal((await gm.b.go(link)).status, 410, 'a used link no longer works');
  assert.equal((await one(env, "SELECT status FROM admin_accounts WHERE username = 'zara'")).status, 'active');
  const zid = (await one(env, "SELECT id FROM admin_accounts WHERE username = 'zara'")).id;
  assert.equal((await gm.b.go('/admin/')).status, 200);

  // Disable: the session ends on the next request; sign-in is refused; restore lets her back in.
  await owner.b.go('/admin/accounts/');
  await owner.b.go('/admin/accounts/', { form: { action: 'disable', id: zid } });
  assert.equal((await gm.b.go('/admin/')).to, '/admin/login/');
  advance(31e3);
  assert.equal((await browser(env).go('/admin/login/', { form: { username: 'zara', password: 'Quiet harbour evening 2026' }, keepCsrf: false })).to, '/admin/login/?error=1');
  await owner.b.go('/admin/accounts/', { form: { action: 'restore', id: zid } });
  let zb = await signIn(env, 'zara', 'Quiet harbour evening 2026', gm.key);

  // Role change ends her sessions at once.
  await owner.b.go('/admin/accounts/', { form: { action: 'role', id: zid, role: 'owner' } });
  assert.equal((await zb.go('/admin/')).to, '/admin/login/');
  await owner.b.go('/admin/accounts/', { form: { action: 'role', id: zid, role: 'general_manager' } });

  // Password reset: the old password stops working, sessions end, a new link sets a new password; two-step stays.
  zb = await signIn(env, 'zara', 'Quiet harbour evening 2026', gm.key);
  const reset = await owner.b.go('/admin/accounts/', { form: { action: 'reset_password', id: zid } });
  const newLink = linkIn(reset.text);
  assert.ok(newLink);
  assert.equal((await zb.go('/admin/')).to, '/admin/login/');
  advance(31e3);
  assert.equal((await browser(env).go('/admin/login/', { form: { username: 'zara', password: 'Quiet harbour evening 2026' }, keepCsrf: false })).to, '/admin/login/?error=1');
  const z2 = browser(env);
  const t2 = new URL(ORIGIN + newLink).searchParams.get('t');
  assert.equal((await z2.go('/admin/activate/', { form: { t: t2, password: 'Brand new phrase 2026', password2: 'Brand new phrase 2026' }, keepCsrf: false })).to, '/admin/two-step/', 'two-step still required after a password reset');

  // Two-step reset: sessions end; the next sign-in must set it up again with a new key.
  zb = await signIn(env, 'zara', 'Brand new phrase 2026', gm.key);
  await owner.b.go('/admin/accounts/', { form: { action: 'reset_two_step', id: zid } });
  assert.equal((await zb.go('/admin/')).to, '/admin/login/');
  advance(31e3);
  const z3 = browser(env);
  assert.equal((await z3.go('/admin/login/', { form: { username: 'zara', password: 'Brand new phrase 2026' }, keepCsrf: false })).to, '/admin/two-step/setup/');
  const enrol = await z3.go('/admin/two-step/setup/');
  const newKey = keyIn(enrol.text);
  assert.notEqual(newKey, gm.key);
  assert.equal((await z3.go('/admin/')).to, '/admin/two-step/setup/', 'nothing else opens until set-up is finished');
  await z3.go('/admin/two-step/setup/', { form: { code: await codeFor(newKey) } });
  assert.equal((await z3.go('/admin/')).status, 200);

  // Sign out everywhere.
  await owner.b.go('/admin/accounts/', { form: { action: 'sign_out', id: zid } });
  assert.equal((await z3.go('/admin/')).to, '/admin/login/');
  // The owner cannot change their own role, two-step or status here.
  const self = await owner.b.go('/admin/accounts/', { form: { action: 'disable', id: 1 } });
  assert.match(self.text, /Another owner must change/);
  assert.equal((await one(env, 'SELECT status FROM admin_accounts WHERE id = 1')).status, 'active');
  for (const a of ['admin.create', 'admin.disable', 'admin.restore', 'admin.role', 'admin.password_reset', 'admin.two_step_reset', 'admin.sign_out_everywhere']) assert.ok(await audits(env, a) >= 1, a);
});

test('own account: change password (other sessions end), sign out everywhere; no secrets in pages', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const second = await signIn(env, 'owner', owner.password, owner.key);
  const page = await owner.b.go('/admin/account/');
  assert.match(page.text, /Recovery codes left: 10/);
  for (const secret of [SECRETS.ADMIN_PEPPER, SECRETS.ADMIN_TOTP_KEY, owner.password, owner.key]) assert.ok(!page.text.includes(secret));
  assert.match((await owner.b.go('/admin/account/', { form: { action: 'password', current: 'wrong', password: 'Another phrase 2027', password2: 'Another phrase 2027' } })).to, /not%20correct/);
  await owner.b.go('/admin/account/');
  const ch = await owner.b.go('/admin/account/', { form: { action: 'password', current: owner.password, password: 'Another phrase 2027', password2: 'Another phrase 2027' } });
  assert.match(ch.to, /Password%20changed/);
  assert.equal((await owner.b.go('/admin/')).status, 200, 'this session continues');
  assert.equal((await second.go('/admin/')).to, '/admin/login/', 'the other session ended');
  await owner.b.go('/admin/account/');
  assert.equal((await owner.b.go('/admin/account/', { form: { action: 'sign_out_everywhere' } })).to, '/admin/login/');
  assert.equal((await owner.b.go('/admin/')).to, '/admin/login/');
  // Logging out deletes the session row.
  const s = await signIn(env, 'owner', 'Another phrase 2027', owner.key);
  const before = (await one(env, 'SELECT COUNT(*) AS n FROM admin_sessions')).n;
  await s.go('/admin/logout/');
  assert.equal((await one(env, 'SELECT COUNT(*) AS n FROM admin_sessions')).n, before - 1);
});

test('no secret reaches a page, a log line or the audit trail', async () => {
  const logs = [];
  const env = await setupEnv({ LOG_SINK: (l) => logs.push(JSON.stringify(l)) });
  const { owner } = await bootstrapOwner(env);
  const everything = JSON.stringify(await all(env, 'SELECT * FROM audit_events')) + logs.join('\n');
  for (const s of [SECRETS.ADMIN_PEPPER, SECRETS.ADMIN_TOTP_KEY, SECRETS.ADMIN_BOOTSTRAP_CODE, owner.password, owner.key, ...owner.codes]) assert.ok(!everything.includes(s), 'secret absent');
  const pages = [await owner.b.go('/admin/'), await owner.b.go('/admin/accounts/'), await owner.b.go('/admin/account/')].map((r) => r.text).join('');
  for (const s of [SECRETS.ADMIN_PEPPER, SECRETS.ADMIN_TOTP_KEY, SECRETS.ADMIN_BOOTSTRAP_CODE, owner.password, owner.key]) assert.ok(!pages.includes(s));
  const acc = await one(env, 'SELECT * FROM admin_accounts WHERE id = 1');
  assert.ok(!JSON.stringify(acc).includes(owner.password) && !JSON.stringify(acc).includes(owner.key));
});

test('accounts fail closed without the secrets, and the shared login keeps working until an Owner has two-step', async () => {
  const env = await setupEnv({ ADMIN_PEPPER: '', ADMIN_TOTP_KEY: '' });
  const b = browser(env);
  await b.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } });
  assert.match((await b.go('/admin/accounts/')).text, /ADMIN_PEPPER and ADMIN_TOTP_KEY are not set/);
  assert.equal((await b.go('/admin/activate/?t=whatever')).to, '/admin/login/');
  // A started but unfinished owner account does not end the shared login.
  const env2 = await setupEnv();
  const l = browser(env2);
  await l.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } });
  const r = await l.go('/admin/accounts/', { form: { action: 'bootstrap', code: SECRETS.ADMIN_BOOTSTRAP_CODE, username: 'owner', display_name: 'O' } });
  assert.ok(linkIn(r.text));
  assert.equal((await l.go('/admin/volunteers/')).status, 200);
  // A second bootstrap only re-issues the link for the same owner account.
  const again = await l.go('/admin/accounts/', { form: { action: 'bootstrap', code: SECRETS.ADMIN_BOOTSTRAP_CODE, username: 'owner' } });
  assert.ok(linkIn(again.text));
  assert.notEqual(linkIn(again.text), linkIn(r.text));
  assert.equal((await one(env2, 'SELECT COUNT(*) AS n FROM admin_accounts')).n, 1);
  assert.equal((await browser(env2).go(linkIn(r.text))).status, 410, 'the earlier link stopped working');
});
