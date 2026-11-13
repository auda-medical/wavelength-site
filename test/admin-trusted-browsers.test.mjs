// "Trust this browser for 30 days" on the admin console's two-step step (worker/admin/trust.js, migration 0019): the
// cookie and what is stored, password-only sign-in in a trusted browser, expiry, one account only, revocation on
// password and two-step changes and on disable, "Forget this browser" and "Forget all browsers", the cap of ten, the
// lock-out, and a database without migration 0019. Every test runs through the whole Worker (worker/index.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, browser, bootstrapOwner, activateAndEnrol, signIn, addAdmin, linkIn, keyIn, codeFor, advance, ORIGIN } from './helpers/admin-accounts.mjs';
import { browserLabel, TRUST_COOKIE } from '../worker/admin/trust.js';
import { sha256Hex } from '../worker/admin/crypto.js';

const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const audits = async (env, action, like = '%') => (await one(env, 'SELECT COUNT(*) AS n FROM audit_events WHERE action = ? AND meta LIKE ?', action, like)).n;
const trustRows = (env, adminId) => all(env, 'SELECT * FROM admin_trusted_browsers WHERE admin_id = ? ORDER BY id', adminId);
const DAY = 86400e3;
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const GM_PW = 'Quiet harbour evening 2026';

// Password step (the clock moves a time step on, so the next code is new).
async function password(b, username, pw) {
  advance(31e3);
  return b.go('/admin/login/', { form: { username, password: pw }, keepCsrf: false });
}
// Code step, with or without the trust box ticked.
async function code(b, key, { trust = false, ua = UA_WIN } = {}) {
  const page = await b.go('/admin/two-step/');
  const res = await b.go('/admin/two-step/', { form: { code: await codeFor(key), ...(trust ? { trust: '1' } : {}) }, headers: { 'User-Agent': ua } });
  return { page, res };
}
// A new browser, signed in with password and code, with the trust box ticked.
async function trusted(env, username, pw, key, ua = UA_WIN) {
  const b = browser(env);
  assert.equal((await password(b, username, pw)).to, '/admin/two-step/');
  const { res } = await code(b, key, { trust: true, ua });
  assert.equal(res.to, '/admin/');
  assert.ok(b.jar.get(TRUST_COOKIE), 'trust cookie set');
  return b;
}
// A browser holding only the given trust cookie (as if the session had ended).
function withTrust(env, token) {
  const b = browser(env);
  if (token) b.jar.set(TRUST_COOKIE, token);
  return b;
}
async function addGm(env, owner) {
  const link = await addAdmin(owner.b, { username: 'zara', name: 'Zara Manager', role: 'general_manager' });
  advance(31e3);
  const gm = await activateAndEnrol(env, link, GM_PW);
  return { ...gm, id: (await one(env, "SELECT id FROM admin_accounts WHERE username = 'zara'")).id };
}

test('password and code with the box ticked: a __Host- cookie (HttpOnly, Secure, SameSite=Strict, 30 days); only a hash is stored', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = browser(env);
  await password(b, 'owner', owner.password);
  const { page, res } = await code(b, owner.key, { trust: true });
  // The box is offered, unticked by default.
  assert.match(page.text, /<input type="checkbox" name="trust" value="1">/);
  assert.match(page.text, /Trust this browser for 30 days/);
  const set = res.setCookies.find((c) => c.startsWith(`${TRUST_COOKIE}=`));
  assert.ok(set, 'trust cookie sent');
  assert.match(set, /^__Host-wl_admin_trust=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);
  const token = set.split(';')[0].split('=')[1];
  const rows = await trustRows(env, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, await sha256Hex('admin-trust:' + token));
  assert.ok(!JSON.stringify(await all(env, 'SELECT * FROM admin_trusted_browsers')).includes(token), 'the token itself is not stored');
  assert.ok(!JSON.stringify(await all(env, 'SELECT * FROM audit_events')).includes(token), 'nor in the audit trail');
  assert.equal(rows[0].label, 'Chrome on Windows');
  assert.equal(Date.parse(rows[0].expires_at) - Date.parse(rows[0].created_at), 30 * DAY);
  assert.equal(rows[0].last_used_at, null);
  assert.equal(await audits(env, 'admin.trust_granted'), 1);
});

test('without the tick: no cookie and nothing stored; the code is asked for every time', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = browser(env);
  await password(b, 'owner', owner.password);
  const { res } = await code(b, owner.key);
  assert.equal(res.to, '/admin/');
  assert.ok(!res.setCookies.some((c) => c.startsWith(TRUST_COOKIE)));
  assert.equal((await trustRows(env, 1)).length, 0);
  await b.go('/admin/logout/');
  assert.equal((await password(b, 'owner', owner.password)).to, '/admin/two-step/');
  // A wrong code with the box ticked trusts nothing.
  await b.go('/admin/two-step/');
  await b.go('/admin/two-step/', { form: { code: '000000', trust: '1' } });
  assert.equal((await trustRows(env, 1)).length, 0);
  assert.equal(b.jar.get(TRUST_COOKIE), undefined);
});

test('next sign-in in the trusted browser: password only, no code; still not a fresh check for owner security pages', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = await trusted(env, 'owner', owner.password, owner.key);
  await b.go('/admin/logout/');
  assert.equal((await b.go('/admin/')).to, '/admin/login/', 'signed out');
  // The wrong password is refused, trust or not.
  assert.equal((await password(b, 'owner', 'not the password at all')).to, '/admin/login/?error=1');
  const p = await password(b, 'owner', owner.password);
  assert.equal(p.to, '/admin/', 'no code step');
  assert.equal((await b.go('/admin/')).status, 200);
  assert.equal((await one(env, "SELECT stage FROM admin_sessions WHERE admin_id = 1 AND reauth_at IS NULL")).stage, 'full');
  // Owner security pages still ask for the password and a code.
  assert.match((await b.go('/admin/accounts/')).to, /^\/admin\/reauth\//);
  const row = (await trustRows(env, 1))[0];
  assert.ok(row.last_used_at, 'last used recorded');
  assert.equal(await audits(env, 'admin.trust_used'), 1);
  assert.equal(await audits(env, 'admin.sign_in', '%trusted_browser%'), 1);
  // Only the trusted browser: another browser still needs the code.
  assert.equal((await password(browser(env), 'owner', owner.password)).to, '/admin/two-step/');
});

test('an expired or unknown token is ignored: the code is asked for and the stale cookie cleared', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = await trusted(env, 'owner', owner.password, owner.key);
  const token = b.jar.get(TRUST_COOKIE);
  // Unknown (forged) token.
  const forged = withTrust(env, 'A'.repeat(43));
  const f = await password(forged, 'owner', owner.password);
  assert.equal(f.to, '/admin/two-step/');
  assert.ok(f.setCookies.some((c) => /^__Host-wl_admin_trust=; .*Max-Age=0/.test(c)), 'stale cookie cleared');
  assert.equal(forged.jar.get(TRUST_COOKIE), undefined);
  // Expired: 30 days and a minute later (the server decides, whatever the browser keeps).
  advance(30 * DAY + 60e3);
  const late = withTrust(env, token);
  const r = await password(late, 'owner', owner.password);
  assert.equal(r.to, '/admin/two-step/');
  assert.ok(r.setCookies.some((c) => /^__Host-wl_admin_trust=; .*Max-Age=0/.test(c)));
  assert.equal((await trustRows(env, 1)).length, 0, 'the expired entry is deleted');
  assert.equal(await audits(env, 'admin.trust_used'), 0);
});

test('a token from account A does not help account B', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const gm = await addGm(env, owner);
  const b = await trusted(env, 'owner', owner.password, owner.key);
  const token = b.jar.get(TRUST_COOKIE);
  await b.go('/admin/logout/');
  // Zara signs in on the owner's trusted browser: she still needs her code.
  const z = await password(b, 'zara', GM_PW);
  assert.equal(z.to, '/admin/two-step/');
  assert.ok(!z.setCookies.some((c) => c.startsWith(TRUST_COOKIE)), 'the owner\'s trust is left alone');
  assert.equal((await b.go('/admin/')).to, '/admin/two-step/', 'nothing opens without her code');
  assert.equal(await audits(env, 'admin.trust_used'), 0);
  // The owner's token still works for the owner.
  assert.equal((await password(withTrust(env, token), 'owner', owner.password)).to, '/admin/');
  // A trusted browser of Zara's does not let the owner skip the code either.
  const zb = await trusted(env, 'zara', GM_PW, gm.key);
  await zb.go('/admin/logout/');
  assert.equal((await password(zb, 'owner', owner.password)).to, '/admin/two-step/');
  // Zara cannot forget the owner's browser through her account page.
  const zs = await signIn(env, 'zara', GM_PW, gm.key);
  await zs.go('/admin/account/');
  const ownerRow = (await trustRows(env, 1))[0];
  assert.match((await zs.go('/admin/account/', { form: { action: 'trust_forget', browser: ownerRow.id } })).to, /Nothing%20changed/);
  assert.equal((await trustRows(env, 1)).length, 1);
  // The owner trusts Zara's browser for himself: the browser's one cookie now holds the owner's token, and Zara's
  // entry for it (which no cookie can reach any more) is removed rather than left behind.
  const { res } = await code(zb, owner.key, { trust: true });
  assert.equal(res.to, '/admin/');
  assert.equal((await trustRows(env, gm.id)).length, 0);
  assert.equal((await trustRows(env, 1)).length, 2);
  assert.equal(await audits(env, 'admin.trust_revoked', '%replaced%'), 1);
  await zb.go('/admin/logout/');
  assert.equal((await password(zb, 'zara', GM_PW)).to, '/admin/two-step/');
});

test('a password change, a new authenticator and an owner\'s resets or disable forget every trusted browser', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const gm = await addGm(env, owner);

  // Own password change: every trusted browser of the account, including this one.
  const b1 = await trusted(env, 'owner', owner.password, owner.key);
  const b2 = await trusted(env, 'owner', owner.password, owner.key, UA_MAC);
  const t2 = b2.jar.get(TRUST_COOKIE);
  assert.equal((await trustRows(env, 1)).length, 2);
  await b1.go('/admin/account/');
  const ch = await b1.go('/admin/account/', { form: { action: 'password', current: owner.password, password: 'Another phrase 2027', password2: 'Another phrase 2027' } });
  assert.match(ch.to, /Password%20changed/);
  assert.ok(ch.setCookies.some((c) => /^__Host-wl_admin_trust=; .*Max-Age=0/.test(c)));
  assert.equal((await trustRows(env, 1)).length, 0);
  assert.equal(await audits(env, 'admin.trust_revoked', '%password_change%'), 1);
  assert.equal((await password(withTrust(env, t2), 'owner', 'Another phrase 2027')).to, '/admin/two-step/', 'the other browser needs a code again');
  owner.password = 'Another phrase 2027';

  // Own new authenticator (two_step_renew).
  const b3 = await trusted(env, 'owner', owner.password, owner.key);
  const t3 = b3.jar.get(TRUST_COOKIE);
  await b3.go('/admin/account/');
  advance(31e3);
  const renew = await b3.go('/admin/account/', { form: { action: 'two_step_renew', current: owner.password, code: await codeFor(owner.key) } });
  assert.equal(renew.to, '/admin/two-step/setup/');
  assert.equal((await trustRows(env, 1)).length, 0);
  assert.equal(await audits(env, 'admin.trust_revoked', '%two_step_renew%'), 1);
  assert.notEqual((await password(withTrust(env, t3), 'owner', owner.password)).to, '/admin/');

  // Owner actions on Zara: reset two-step, reset password, disable.
  // First the owner finishes setting up the new authenticator (b3 is in the set-up stage).
  owner.key = keyIn((await b3.go('/admin/two-step/setup/')).text);
  await b3.go('/admin/two-step/setup/', { form: { code: await codeFor(owner.key) } });
  const ownerB = await signIn(env, 'owner', owner.password, owner.key);
  for (const action of ['reset_two_step', 'reset_password', 'disable']) {
    // Zara trusts a browser (setting up two-step or a password again where the last action needs it).
    let zKey = gm.key, zPw = GM_PW;
    if (action === 'reset_password') {
      // After the two-step reset: sign in and set up a new authenticator.
      const zb = browser(env);
      assert.equal((await password(zb, 'zara', zPw)).to, '/admin/two-step/setup/');
      const enrol = await zb.go('/admin/two-step/setup/');
      gm.key = keyIn(enrol.text);
      await zb.go('/admin/two-step/setup/', { form: { code: await codeFor(gm.key) } });
      zKey = gm.key;
    }
    if (action === 'disable') {
      // After the password reset: a new password through the new link.
      const t = new URL(ORIGIN + gm.link).searchParams.get('t');
      assert.equal((await browser(env).go('/admin/activate/', { form: { t, password: 'Brand new phrase 2026', password2: 'Brand new phrase 2026' }, keepCsrf: false })).to, '/admin/two-step/');
      zPw = 'Brand new phrase 2026';
    }
    const zb = await trusted(env, 'zara', zPw, zKey);
    const tz = zb.jar.get(TRUST_COOKIE);
    assert.equal((await trustRows(env, gm.id)).length, 1, `${action}: trusted before`);
    await ownerB.go('/admin/accounts/');
    const r = await ownerB.go('/admin/accounts/', { form: { action, id: gm.id } });
    if (action === 'reset_password') gm.link = linkIn(r.text);
    assert.equal((await trustRows(env, gm.id)).length, 0, `${action}: forgotten`);
    assert.ok(await audits(env, 'admin.trust_revoked', `%${{ reset_two_step: 'two_step_reset', reset_password: 'password_reset', disable: 'disabled' }[action]}%`) >= 1, action);
    assert.notEqual((await password(withTrust(env, tz), 'zara', zPw)).to, '/admin/', `${action}: no password-only sign-in`);
  }
});

test('Forget this browser and Forget all browsers on Your account', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const here = await trusted(env, 'owner', owner.password, owner.key);
  const there = await trusted(env, 'owner', owner.password, owner.key, UA_MAC);
  const tThere = there.jar.get(TRUST_COOKIE);
  const page = await here.go('/admin/account/');
  assert.match(page.text, /Trusted browsers/);
  assert.match(page.text, /Chrome on Windows \(this browser\)/);
  assert.match(page.text, /Safari on Mac</);
  assert.equal((page.text.match(/Forget this browser/g) || []).length, 2);
  assert.match(page.text, /Forget all browsers/);
  // Forget the other browser: it needs a code again; this one keeps its cookie.
  const macRow = (await trustRows(env, 1)).find((r) => r.label === 'Safari on Mac');
  const f1 = await here.go('/admin/account/', { form: { action: 'trust_forget', browser: macRow.id } });
  assert.match(f1.to, /That%20browser%20is%20forgotten/);
  assert.ok(!f1.setCookies.some((c) => c.startsWith(TRUST_COOKIE)), 'this browser keeps its trust');
  assert.equal((await password(withTrust(env, tThere), 'owner', owner.password)).to, '/admin/two-step/');
  assert.equal(await audits(env, 'admin.trust_revoked', '%"forget"%'), 1);
  // Forget this browser: its cookie is cleared too.
  await here.go('/admin/account/');
  const winRow = (await trustRows(env, 1))[0];
  const f2 = await here.go('/admin/account/', { form: { action: 'trust_forget', browser: winRow.id } });
  assert.ok(f2.setCookies.some((c) => /^__Host-wl_admin_trust=; .*Max-Age=0/.test(c)));
  assert.equal((await trustRows(env, 1)).length, 0);
  assert.match((await here.go('/admin/account/')).text, /No trusted browsers/);
  // Forget all.
  const a = await trusted(env, 'owner', owner.password, owner.key);
  const b = await trusted(env, 'owner', owner.password, owner.key, UA_MAC);
  const tb = b.jar.get(TRUST_COOKIE);
  await a.go('/admin/account/');
  const fa = await a.go('/admin/account/', { form: { action: 'trust_forget_all' } });
  assert.match(fa.to, /Every%20trusted%20browser%20is%20forgotten/);
  assert.ok(fa.setCookies.some((c) => /^__Host-wl_admin_trust=; .*Max-Age=0/.test(c)));
  assert.equal((await trustRows(env, 1)).length, 0);
  assert.equal(await audits(env, 'admin.trust_revoked', '%forget_all%'), 1);
  assert.equal((await password(withTrust(env, tb), 'owner', owner.password)).to, '/admin/two-step/');
  // The forms need the session's CSRF token like every other console form.
  const c = await trusted(env, 'owner', owner.password, owner.key);
  assert.equal((await c.go('/admin/account/', { form: { action: 'trust_forget_all', _csrf: 'x'.repeat(32) } })).status, 403);
  assert.equal((await trustRows(env, 1)).length, 1);
});

test('the lock-out still applies in a trusted browser', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const b = await trusted(env, 'owner', owner.password, owner.key);
  await b.go('/admin/logout/');
  // Someone else guesses the password ten times: the account locks.
  const guesser = browser(env);
  for (let i = 0; i < 10; i++) await guesser.go('/admin/login/', { form: { username: 'owner', password: 'wrong password!!' }, keepCsrf: false });
  assert.ok((await one(env, "SELECT locked_until FROM admin_accounts WHERE username = 'owner'")).locked_until, 'locked');
  // The trusted browser with the right password gets the same refusal.
  assert.equal((await password(b, 'owner', owner.password)).to, '/admin/login/?error=1');
  assert.equal((await b.go('/admin/')).to, '/admin/login/');
  assert.equal(await audits(env, 'admin.trust_used'), 0);
  assert.ok(b.jar.get(TRUST_COOKIE), 'trust is kept for after the lock-out');
  // After the lock-out, password only again.
  advance(16 * 60e3);
  assert.equal((await password(b, 'owner', owner.password)).to, '/admin/');
  // The per-address limit applies before trust is looked at, too.
  const env2 = await setupEnv();
  const o2 = (await bootstrapOwner(env2)).owner;
  const c = await trusted(env2, 'owner', o2.password, o2.key);
  await c.go('/admin/logout/');
  // Start of a fresh one-minute window, so the attempts below all fall in one window.
  advance(60e3 - (Date.now() % 60e3) + 50);
  const ip = { 'CF-Connecting-IP': '203.0.113.7' };
  // Unknown usernames, so the account itself does not lock: only the address limit can refuse what follows.
  for (let i = 0; i < 10; i++) await c.go('/admin/login/', { form: { username: 'nobody', password: 'wrong password!!' }, keepCsrf: false, headers: ip });
  assert.equal((await c.go('/admin/login/', { form: { username: 'owner', password: o2.password }, keepCsrf: false, headers: ip })).to, '/admin/login/?error=1');
});

test('at most ten trusted browsers per account: the oldest goes', async () => {
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  const tokens = [];
  for (let i = 0; i < 11; i++) { tokens.push((await trusted(env, 'owner', owner.password, owner.key)).jar.get(TRUST_COOKIE)); advance(1000); }
  assert.equal((await trustRows(env, 1)).length, 10);
  assert.equal(await audits(env, 'admin.trust_revoked', '%limit%'), 1);
  assert.equal((await password(withTrust(env, tokens[0]), 'owner', owner.password)).to, '/admin/two-step/', 'the oldest is forgotten');
  assert.equal((await password(withTrust(env, tokens[1]), 'owner', owner.password)).to, '/admin/', 'the second oldest still works');
  assert.equal((await password(withTrust(env, tokens[10]), 'owner', owner.password)).to, '/admin/', 'the newest works');
});

test('the label is the browser and system only; the raw User-Agent is never stored', async () => {
  assert.equal(browserLabel(UA_WIN), 'Chrome on Windows');
  assert.equal(browserLabel(UA_MAC), 'Safari on Mac');
  assert.equal(browserLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'), 'Edge on Windows');
  assert.equal(browserLabel('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'), 'Firefox on Linux');
  assert.equal(browserLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'), 'Chrome on iPhone');
  assert.equal(browserLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), 'Chrome on Android');
  assert.equal(browserLabel(''), 'Unknown browser');
  assert.ok(browserLabel('x'.repeat(5000)).length <= 60);
  const env = await setupEnv();
  const { owner } = await bootstrapOwner(env);
  await trusted(env, 'owner', owner.password, owner.key, UA_WIN);
  assert.ok(!JSON.stringify(await all(env, 'SELECT * FROM admin_trusted_browsers')).includes('Mozilla'));
});

test('before migration 0019: no box, no section, and password changes and resets still work', async () => {
  const env = await setupEnv({}, { skipMigrations: ['0019_admin_trusted_browsers.sql'] });
  const { owner } = await bootstrapOwner(env);
  const gm = await addGm(env, owner);
  const b = browser(env);
  await password(b, 'owner', owner.password);
  const { page, res } = await code(b, owner.key, { trust: true });
  assert.doesNotMatch(page.text, /Trust this browser/);
  assert.equal(res.to, '/admin/');
  assert.ok(!res.setCookies.some((c) => c.startsWith(TRUST_COOKIE)), 'nothing to trust with');
  const acct = await b.go('/admin/account/');
  assert.doesNotMatch(acct.text, /Trusted browsers/);
  assert.match((await b.go('/admin/account/', { form: { action: 'password', current: owner.password, password: 'Another phrase 2027', password2: 'Another phrase 2027' } })).to, /Password%20changed/);
  await b.go('/admin/account/');
  assert.match((await b.go('/admin/account/', { form: { action: 'trust_forget_all' } })).to, /forgotten/);
  // A stray cookie is ignored (and the code asked for).
  assert.equal((await password(withTrust(env, 'B'.repeat(43)), 'owner', 'Another phrase 2027')).to, '/admin/two-step/');
  const ob = await signIn(env, 'owner', 'Another phrase 2027', owner.key);
  advance(31e3);
  await ob.go('/admin/accounts/');
  for (const action of ['reset_two_step', 'reset_password', 'disable']) {
    const r = await ob.go('/admin/accounts/', { form: { action, id: gm.id } });
    assert.equal(r.status, 200, action);
  }
  assert.equal((await one(env, 'SELECT status FROM admin_accounts WHERE id = ?', gm.id)).status, 'disabled');
});
