// Account, session and admin hardening (plan sections 22, 23, 31, 34): log out of all devices, sign-up and login that
// do not reveal which emails have accounts, rate limits with and without a binding, the Cloudflare Access check for
// admins, the app version gate, request ids and the allowlist logger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, ctx, ORIGIN } from './helpers/env.mjs';
import { handleApp } from '../worker/app.js';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/app-util.js';
import { rateLimit } from '../worker/ratelimit.js';
import { verifyAccessJwt, clearKeyCache, rolesFor, roleForPath, allowed } from '../worker/access.js';
import { compareVersions, updateState } from '../worker/version.js';
import { log, route, appVersion, clean } from '../worker/log.js';

const PASSWORD = 'Correct horse battery 1!';
const mail = [];
let certs = null; // the Access team's public keys, served by the stubbed fetch below
globalThis.fetch = async (u, init) => {
  if (String(u).endsWith('/cdn-cgi/access/certs')) { certs.calls++; return new Response(JSON.stringify({ keys: certs.keys })); }
  mail.push(JSON.parse(init.body));
  return new Response('{}');
};
const settle = () => new Promise((r) => setTimeout(r, 30));
const tick = () => new Promise((r) => setTimeout(r, 5));
async function account(env, email) {
  const c = client(handleApp, env);
  const r = await c.call('/api/app/signup', { firstName: 'Test', lastName: 'Person', email, password: PASSWORD, terms: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const get = (env, path, headers = {}) => handleApp(new Request(ORIGIN + path, { headers }), env, ctx);

// ---------- Log out of all devices ----------
test('log out of all devices refuses every older cookie and app token', async () => {
  const env = makeEnv();
  const phone = await account(env, 'all@x.co');
  await tick();
  const laptop = client(handleApp, env);
  assert.equal((await laptop.call('/api/app/login', { email: 'all@x.co', password: PASSWORD })).status, 200);
  const token = laptop.cookie.split('=')[1];
  await tick();
  const r = await phone.call('/api/app/logout-all', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.loggedOut, true);
  assert.equal(phone.cookie, '', 'this device is logged out too');
  assert.equal((await laptop.call('/api/app/me')).body.auth, false, 'an older cookie is refused');
  const bearer = await get(env, '/api/app/sync', { Authorization: 'Bearer ' + token });
  assert.equal(bearer.status, 401, 'an older app token is refused');
  assert.equal((await client(handleApp, env).call('/api/app/login', { email: 'all@x.co', password: PASSWORD })).status, 200, 'logging in again works');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'account.logout_all'").first()).n, 1);
});

test('log out of all devices can keep this device logged in', async () => {
  const env = makeEnv();
  const phone = await account(env, 'keep@x.co');
  await tick();
  const other = client(handleApp, env);
  await other.call('/api/app/login', { email: 'keep@x.co', password: PASSWORD });
  await tick();
  const r = await phone.call('/api/app/logout-all', { keepThisDevice: true });
  assert.equal(r.body.loggedOut, false);
  assert.equal((await phone.call('/api/app/me')).body.ok, true, 'a fresh cookie for this device');
  assert.equal((await other.call('/api/app/me')).body.auth, false);
  assert.equal((await client(handleApp, env).call('/api/app/logout-all', {})).status, 401, 'needs a login');
});

// ---------- Account enumeration ----------
test('sign-up answers an existing account exactly as an Academy-only email, and tells the owner by email', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  await account(env, 'owner@x.co');
  await env.DB.prepare("INSERT INTO learners (email, first_name, last_name, email_status) VALUES ('academy@x.co', 'Ann', 'Academy', 'unverified')").run();
  mail.length = 0;
  const attempt = async (email) => {
    const c = client(handleApp, env);
    const res = await handleApp(new Request(ORIGIN + '/api/app/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ firstName: 'Mal', lastName: 'Ory', email, password: 'Attacker password 1!', terms: true }) }), env, ctx);
    return { status: res.status, body: await res.json(), cookie: (res.headers.get('Set-Cookie') || '').split('=')[0], c };
  };
  const a = await attempt('owner@x.co'), b = await attempt('academy@x.co');
  assert.deepEqual({ ...a, c: null }, { ...b, c: null }, 'status, body and cookie name are identical');
  assert.deepEqual(a.body, { ok: true, checkEmail: true });
  assert.equal(a.status, 202);
  assert.notEqual(a.cookie, 'wl_learn', 'no login');
  await settle();
  const warn = mail.filter((m) => m.to[0].email_address.address === 'owner@x.co');
  assert.equal(warn.length, 1);
  assert.match(warn[0].subject, /tried to create a Wavelength account/);
  assert.ok(!/\u2014/.test(warn[0].textbody), 'no em dashes');
  await attempt('owner@x.co');
  await settle();
  assert.equal(mail.filter((m) => m.to[0].email_address.address === 'owner@x.co').length, 1, 'at most one warning an hour');
  assert.equal((await client(handleApp, env).call('/api/app/login', { email: 'owner@x.co', password: PASSWORD })).status, 200, 'the password is unchanged');
});

test('login gives one answer for an unknown email, an Academy-only email and a wrong password', async () => {
  const env = makeEnv();
  await account(env, 'pw@x.co');
  await env.DB.prepare("INSERT INTO learners (email, first_name, last_name) VALUES ('nopw@x.co', 'A', 'B')").run();
  const c = client(handleApp, env);
  const answers = [];
  for (const email of ['nobody@x.co', 'nopw@x.co', 'pw@x.co']) answers.push(await c.call('/api/app/login', { email, password: 'Wrong password 1!' }));
  for (const a of answers) assert.deepEqual(a, answers[0]);
  assert.equal(answers[0].status, 401);
  assert.equal(answers[0].body.noPassword, undefined);
});

// ---------- Rate limits ----------
test('rate-limit helper: D1 fallback, a binding when present, and allow when neither works', async () => {
  const env = makeEnv();
  for (let i = 0; i < 10; i++) assert.equal((await rateLimit(env, { scope: 't', key: 'k', limit: 10 })).ok, true);
  const over = await rateLimit(env, { scope: 't', key: 'k', limit: 10 });
  assert.deepEqual(over, { ok: false, source: 'd1' });
  assert.equal((await rateLimit(env, { scope: 't', key: 'other', limit: 10 })).ok, true, 'per key');
  const seen = [];
  const bound = makeEnv({ RATE_LIMIT: { limit: async ({ key }) => { seen.push(key); return { success: seen.length < 2 }; } } });
  assert.deepEqual(await rateLimit(bound, { scope: 's', key: 'x', limit: 99 }), { ok: true, source: 'binding' });
  assert.deepEqual(await rateLimit(bound, { scope: 's', key: 'x', limit: 99 }), { ok: false, source: 'binding' });
  assert.deepEqual(seen, ['s:x', 's:x']);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_counters').first()).n, 2);
  assert.equal((await bound.DB.prepare('SELECT COUNT(*) AS n FROM rate_counters').first()).n, 0, 'the binding is used instead of D1');
  const old = makeEnv({}, { skipMigrations: ['0013_organisations.sql'] });
  for (let i = 0; i < 12; i++) assert.equal((await rateLimit(old, { scope: 't', key: 'k', limit: 10 })).ok, true, 'before 0013: allowed');
  assert.deepEqual(await rateLimit(env, { scope: 't', key: '', limit: 1 }), { ok: true, source: 'none' });
});

test('login, sign-up, reset and resend allow 10 a minute per IP, and IPs are stored only as hashes', async () => {
  const env = makeEnv();
  const post = (path, data, ip) => handleApp(new Request(ORIGIN + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip }, body: JSON.stringify(data) }), env, ctx);
  for (let i = 0; i < 10; i++) assert.equal((await post('/api/app/reset/request', { email: 'a@x.co' }, '203.0.113.9')).status, 200);
  const r = await post('/api/app/reset/request', { email: 'a@x.co' }, '203.0.113.9');
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /wait a minute/);
  assert.equal((await post('/api/app/reset/request', { email: 'a@x.co' }, '203.0.113.10')).status, 200, 'another IP');
  assert.equal((await post('/api/app/login', { email: 'a@x.co', password: 'x' }, '203.0.113.9')).status, 401, 'each route has its own count');
  const rows = JSON.stringify((await env.DB.prepare('SELECT bucket FROM rate_counters').all()).results);
  assert.ok(!rows.includes('203.0.113'), 'no raw IP address');
});

// ---------- Cloudflare Access ----------
const TEAM = 'wavelength.cloudflareaccess.com', AUD = 'aud-test-123';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
async function keyPair() { return crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']); }
async function jwt(priv, claims, head = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...head }));
  const p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}
const now = () => Math.floor(Date.now() / 1000);
const claims = (o = {}) => ({ aud: [AUD], iss: `https://${TEAM}`, email: 'Ops@X.co', sub: 'u1', iat: now(), exp: now() + 600, ...o });
const ACCESS = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

test('Access JWT: signature, audience, issuer, expiry and key id are all checked; keys are cached', async () => {
  const kp = await keyPair(), other = await keyPair();
  certs = { calls: 0, keys: [{ ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' }] };
  clearKeyCache();
  const env = makeEnv(ACCESS);
  const ok = await verifyAccessJwt(env, await jwt(kp.privateKey, claims()));
  assert.deepEqual(ok, { ok: true, email: 'ops@x.co', sub: 'u1' });
  assert.equal((await verifyAccessJwt(env, await jwt(kp.privateKey, claims({ aud: ['someone-else'] })))).reason, 'audience');
  assert.equal((await verifyAccessJwt(env, await jwt(kp.privateKey, claims({ iss: 'https://evil.cloudflareaccess.com' })))).reason, 'issuer');
  assert.equal((await verifyAccessJwt(env, await jwt(kp.privateKey, claims({ exp: now() - 3600 })))).reason, 'expired');
  assert.equal((await verifyAccessJwt(env, await jwt(other.privateKey, claims()))).reason, 'signature');
  assert.equal((await verifyAccessJwt(env, await jwt(kp.privateKey, claims(), { alg: 'none' }))).reason, 'alg');
  assert.equal((await verifyAccessJwt(env, await jwt(kp.privateKey, claims(), { kid: 'nope' }))).reason, 'kid');
  assert.equal((await verifyAccessJwt(env, 'not.a.jwt')).ok, false);
  assert.equal((await verifyAccessJwt(env, '')).reason, 'malformed');
  assert.equal(certs.calls, 1, 'keys fetched once and cached');
});

test('Access roles: owner by default until admin_roles exists, then only the listed roles', () => {
  assert.deepEqual(rolesFor(null, 'a@x.co'), ['owner']);
  assert.deepEqual(rolesFor('{"A@x.co":["verifier","made-up"]}', 'a@x.co'), ['verifier']);
  assert.deepEqual(rolesFor('{"b@x.co":["owner"]}', 'a@x.co'), []);
  assert.deepEqual(rolesFor('not json', 'a@x.co'), []);
  assert.equal(roleForPath('/admin/organisations/'), 'verifier');
  assert.equal(roleForPath('/admin/academy/learners.csv'), 'academy');
  assert.equal(roleForPath('/admin/volunteers/'), 'owner');
  assert.equal(roleForPath('/admin/logins/'), 'owner');
  assert.equal(roleForPath('/admin/'), 'any', 'the console home lists only what a person can open');
  assert.ok(allowed(['verifier'], '/admin/supervisors/'));
  assert.ok(allowed(['verifier'], '/admin/'));
  assert.ok(!allowed([], '/admin/'), 'no roles, no console');
  assert.ok(!allowed(['verifier'], '/admin/volunteers/export.csv'));
  assert.ok(!allowed(['verifier'], '/admin/logins/'));
  assert.ok(allowed(['owner'], '/admin/newsletter/'));
});

async function adminEnv(extra) {
  const env = makeEnv(extra);
  const ADMIN = 'Admin password 12345';
  for (const [k, v] of [['volunteer_username', 'volunteer'], ['admin_username', 'wavelength'], ['volunteer_hash', await hashPassword('Volunteer pw 12345')], ['admin_hash', await hashPassword(ADMIN)], ['session_secret', 'test-secret']]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
  const f = new FormData(); f.append('username', 'wavelength'); f.append('password', ADMIN);
  const res = await worker.fetch(new Request(ORIGIN + '/admin/login/', { method: 'POST', body: f }), env, ctx);
  const cookie = res.headers.get('Set-Cookie').split(';')[0];
  const req = (path, headers = {}, body) => worker.fetch(new Request(ORIGIN + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, ...headers }, body }), env, ctx);
  return { env, req };
}

test('admin area: with Access on, a valid Access token and the password are both needed; roles apply; email is the actor', async () => {
  const kp = await keyPair();
  certs = { calls: 0, keys: [{ ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' }] };
  clearKeyCache();
  // Access off: exactly as before.
  const off = await adminEnv({});
  assert.equal((await off.req('/admin/volunteers/export.csv')).status, 200);

  const { env, req } = await adminEnv(ACCESS);
  assert.equal((await req('/admin/volunteers/export.csv')).status, 403, 'no Access token');
  const tok = await jwt(kp.privateKey, claims());
  const H = { 'Cf-Access-Jwt-Assertion': tok };
  assert.equal((await req('/admin/volunteers/export.csv', { 'Cf-Access-Jwt-Assertion': await jwt(kp.privateKey, claims({ aud: ['x'] })) })).status, 403, 'wrong audience');
  assert.equal((await req('/admin/volunteers/export.csv', H)).status, 200, 'owner while no admin_roles setting exists');
  const noPw = await worker.fetch(new Request(ORIGIN + '/admin/volunteers/export.csv', { headers: H }), env, ctx);
  assert.equal(noPw.status, 303, 'the password login is still needed');

  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('admin_roles', ?)").bind(JSON.stringify({ 'ops@x.co': ['verifier'] })).run();
  assert.equal((await req('/admin/volunteers/export.csv', H)).status, 403, 'a verifier is not an owner');
  assert.equal((await req('/admin/academy/learners.csv', H)).status, 403);
  const f = new FormData(); f.append('action', 'alias_add'); f.append('org', 'wl-2'); f.append('alias', 'Darent');
  const post = await req('/admin/organisations/', H, f);
  assert.equal(post.status, 303);
  const ev = await env.DB.prepare("SELECT actor_type, actor_id FROM audit_events WHERE action = 'organisation.alias_add'").first();
  assert.deepEqual({ ...ev }, { actor_type: 'admin', actor_id: 'ops@x.co' }, 'no typed name needed; the Access email is the actor');
});

// ---------- App versions ----------
test('versions compare numerically by dot-separated parts', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.2.0', '1.2.1'), -1);
  assert.equal(compareVersions('2', '1.99.99'), 1);
  assert.equal(appVersion('ios/1.1.0/12'), '1.1.0');
  assert.equal(appVersion('1.2.0'), '1.2.0');
  assert.equal(updateState({ APP_MIN_VERSION: '', APP_RECOMMENDED_VERSION: '' }, '0.1'), 'none', 'empty vars never block');
});

test('the version gate: 426 below the minimum, except GET me and account deletion; the website is never blocked', async () => {
  const env = makeEnv({ APP_MIN_VERSION: '1.2.0', APP_RECOMMENDED_VERSION: '1.3.0' });
  const c = await account(env, 'v@x.co');
  const call = async (path, version, data) => {
    const headers = { Cookie: c.cookie, ...(version ? { 'X-Wavelength-App': version } : {}) };
    const init = data ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(data) } : { headers };
    const res = await handleApp(new Request(ORIGIN + path, init), env, ctx);
    return { status: res.status, body: await res.json() };
  };
  const old = await call('/api/app/sync', '1.1.9');
  assert.equal(old.status, 426);
  assert.deepEqual(old.body, { ok: false, upgrade: true, error: 'Please update the Wavelength app to continue.' });
  assert.equal((await call('/api/app/sync', 'android/1.1.0/7')).status, 426);
  assert.equal((await call('/api/app/login', '1.0.0', { email: 'v@x.co', password: PASSWORD })).status, 426);
  const me = await call('/api/app/me', '1.1.9');
  assert.equal(me.status, 200);
  assert.deepEqual([me.body.minVersion, me.body.recommendedVersion, me.body.update], ['1.2.0', '1.3.0', 'required']);
  assert.equal((await call('/api/app/account/delete', '1.0.0', { password: 'wrong' })).status, 400, 'account deletion is never blocked');
  assert.equal((await call('/api/app/me', '1.2.5')).body.update, 'recommended');
  assert.equal((await call('/api/app/me', '1.10.0')).body.update, 'none', '1.10 is newer than 1.3');
  assert.equal((await call('/api/app/sync', '1.2.0')).status, 200);
  assert.equal((await call('/api/app/sync')).status, 200, 'no header: the website');
  assert.equal((await call('/api/app/sync', 'web/abc123')).status, 200);
  const anon = await get(env, '/api/app/me', { 'X-Wavelength-App': '1.0.0' });
  assert.equal((await anon.json()).update, 'required', 'logged out too');
});

// ---------- Request ids and the logger ----------
test('every /api/app response carries a request id, and each request logs one allowlisted line', async () => {
  const lines = [];
  const env = makeEnv({ LOG_SINK: (l) => lines.push(l) });
  const c = await account(env, 'log@x.co');
  for (const path of ['/api/app/me', '/api/app/nothing-here', '/api/app/organisations/wl-2', '/api/app/organisations?q=darent']) {
    const res = await get(env, path, { Cookie: c.cookie, 'X-Wavelength-App': 'ios/1.4.0/9' });
    assert.match(res.headers.get('X-Request-Id'), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, path);
  }
  const all = lines.join('\n');
  assert.ok(!all.includes('log@x.co') && !all.includes('darent') && !all.includes('wl_learn'), 'no email, query string or cookie');
  for (const l of lines) for (const k of Object.keys(JSON.parse(l))) assert.ok(['rid', 'route', 'method', 'status', 'ms', 'app', 'err'].includes(k), k);
  const routes = lines.map((l) => JSON.parse(l).route);
  assert.ok(routes.includes('organisations/:id') && routes.includes('signup'));
  assert.equal(JSON.parse(lines[1]).app, '1.4.0');
  assert.deepEqual(clean({ rid: 'X', email: 'a@b.co', body: '{}', token: 't', name: 'Ann' }), { rid: 'X' }, 'unknown fields are dropped');
  assert.equal(route('/api/app/supervise/learner'), 'supervise/learner');
  assert.equal(route('/api/app/signoff/view'), 'signoff/view');
  assert.equal(route('/api/app/organisations/RN7'), 'organisations/:id');
  assert.equal(JSON.parse(log({ LOG_SINK: () => {} }, { rid: 'A', status: 200, email: 'x@y.z' })).email, undefined);
});

test('an unexpected error answers 500 with the request id as a reference, and logs only its class', async () => {
  const lines = [];
  const env = makeEnv({ LOG_SINK: (l) => lines.push(l) });
  env.DB.prepare = () => { throw new TypeError('secret detail about a@b.co'); };
  const res = await handleApp(new Request(ORIGIN + '/api/app/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: '{"email":"a@b.co","password":"x"}' }), env, ctx);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.ref, res.headers.get('X-Request-Id'));
  assert.ok(body.error.includes(body.ref));
  const line = JSON.parse(lines.pop());
  assert.equal(line.err, 'TypeError');
  assert.ok(!JSON.stringify(line).includes('secret'));
});
