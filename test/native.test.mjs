// Store apps: the bundled logbook calls /api/app/* from https://localhost (Android) or capacitor://localhost (iOS)
// with a Bearer token, never a cookie. See worker/native.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN } from './helpers/env.mjs';
import worker from '../worker/index.js';

const PASSWORD = 'Correct horse battery 1!';
const ANDROID = 'https://localhost';
const IOS = 'capacitor://localhost';

// A store-app client: keeps the token from X-Wavelength-Token, sends it as a Bearer header, never sends cookies.
function app(env, origin = ANDROID) {
  let token = '';
  const call = async (path, data, opts = {}) => {
    const headers = { Accept: 'application/json', Origin: opts.origin || origin, 'X-Wavelength-Client': 'app' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const init = { headers };
    if (data !== undefined) { init.method = 'POST'; headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(data); }
    const res = await worker.fetch(new Request(ORIGIN + path, init), env, ctx);
    if (res.headers.has('X-Wavelength-Token')) token = res.headers.get('X-Wavelength-Token');
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, headers: res.headers };
  };
  return { call, get token() { return token; }, set token(v) { token = v; } };
}
const signup = (c, email) => c.call('/api/app/signup', { firstName: 'Test', lastName: 'Native', email, password: PASSWORD, terms: true });

test('preflight is allowed for the store app origins only', async () => {
  const env = makeEnv();
  for (const o of [ANDROID, IOS]) {
    const r = await worker.fetch(new Request(ORIGIN + '/api/app/sync', { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } }), env, ctx);
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), o);
    assert.match(r.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    assert.equal(r.headers.get('Access-Control-Allow-Credentials'), null);
  }
  const bad = await worker.fetch(new Request(ORIGIN + '/api/app/sync', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env, ctx);
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

test('sign-up from the app returns a token header and no cookie', async () => {
  const env = makeEnv();
  const c = app(env);
  const r = await signup(c, 'native@x.co');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(c.token, /^\d+\.\d+\.[A-Za-z0-9_-]+$/);
  assert.equal(r.headers.get('Set-Cookie'), null);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ANDROID);
  assert.match(r.headers.get('Access-Control-Expose-Headers'), /X-Wavelength-Token/);
});

test('the Bearer token logs the app in, syncs and logs out', async () => {
  const env = makeEnv();
  const c = app(env, IOS);
  await signup(c, 'ios@x.co');
  const me = await c.call('/api/app/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.account.email, 'ios@x.co');
  const s = await c.call('/api/app/sync', { entries: [{ id: 'nativeaa1', type: 'efast', date: '2026-09-01', supervision: 'direct' }] });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const out = await c.call('/api/app/logout', {});
  assert.equal(out.status, 200);
  assert.equal(c.token, '');
  assert.equal((await c.call('/api/app/me')).body.auth, false);
});

test('a token sent from any other origin is refused for changes', async () => {
  const env = makeEnv();
  const c = app(env);
  await signup(c, 'other@x.co');
  const r = await c.call('/api/app/sync', { entries: [] }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
});

test('a tampered token is not a login', async () => {
  const env = makeEnv();
  const c = app(env);
  await signup(c, 'tamper@x.co');
  const [id, exp, sig] = c.token.split('.');
  c.token = `${Number(id) + 1}.${exp}.${sig}`;
  assert.equal((await c.call('/api/app/me')).body.auth, false);
  c.token = `${id}.${Number(exp) + 1}.${sig}`;
  assert.equal((await c.call('/api/app/me')).body.auth, false);
});

test('a password change gives the app a new token and retires older ones', async () => {
  const env = makeEnv();
  const phone = app(env);
  await signup(phone, 'rotate@x.co');
  const tablet = app(env);
  assert.equal((await tablet.call('/api/app/login', { email: 'rotate@x.co', password: PASSWORD })).status, 200);
  const before = phone.token;
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await phone.call('/api/app/password', { current: PASSWORD, password: 'A brand new password 2!' })).status, 200);
  assert.notEqual(phone.token, before);
  assert.equal((await phone.call('/api/app/me')).status, 200);
  assert.equal((await tablet.call('/api/app/me')).body.auth, false);
});

test('website requests are unchanged: cookie set, no CORS headers', async () => {
  const env = makeEnv();
  const r = await worker.fetch(new Request(ORIGIN + '/api/app/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: ORIGIN }, body: JSON.stringify({ firstName: 'Web', lastName: 'User', email: 'web@x.co', password: PASSWORD, terms: true }) }), env, ctx);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Set-Cookie') || '', /^wl_learn=/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(r.headers.get('X-Wavelength-Token'), null);
});

test('deleting the account from the app clears the token', async () => {
  const env = makeEnv();
  const c = app(env);
  await signup(c, 'bye@x.co');
  const r = await c.call('/api/app/account/delete', { password: PASSWORD, confirm: 'DELETE' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(c.token, '');
});

test('the store app may send its version header, and can read the request id', async () => {
  const env = makeEnv({ APP_MIN_VERSION: '1.2.0' });
  for (const o of [ANDROID, IOS]) {
    const r = await worker.fetch(new Request(ORIGIN + '/api/app/sync', { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization, x-wavelength-app' } }), env, ctx);
    assert.equal(r.status, 204);
    assert.ok(r.headers.get('Access-Control-Allow-Headers').split(/,\s*/).includes('X-Wavelength-App'));
  }
  const old = await worker.fetch(new Request(ORIGIN + '/api/app/sync', { headers: { Origin: ANDROID, 'X-Wavelength-App': '1.1.0' } }), env, ctx);
  assert.equal(old.status, 426);
  assert.match(old.headers.get('Access-Control-Expose-Headers'), /X-Request-Id/);
  assert.ok(old.headers.get('X-Request-Id'));
  assert.equal((await app(env).call('/api/app/me')).status, 200, 'no version header: never blocked');
});
