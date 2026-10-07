// The Wavelength admin console at /admin/: its own login and session, separate from the volunteer area; old
// /volunteer/admin/* addresses redirect safely; Access roles route by the new paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN } from './helpers/env.mjs';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/app-util.js';
import { clearKeyCache } from '../worker/access.js';
import { legacyAdminPath, adminNav, consoleHome } from '../worker/admin-console.js';

// Workers' HTMLRewriter, reduced to what the console uses: fill #admin-root in the shell.
globalThis.HTMLRewriter = class {
  on(sel, h) { this.h = h; return this; }
  transform(res) {
    let inner = '';
    this.h.element({ setInnerContent: (c) => { inner = c; } });
    const body = new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode((await res.text()).replace('<div id="admin-root"></div>', `<div id="admin-root">${inner}</div>`))); c.close(); } });
    return new Response(body, { headers: res.headers });
  }
};

const ADMIN_PW = 'Admin password 12345', VOL_PW = 'Volunteer pw 12345';
async function setup(extra = {}) {
  const env = makeEnv(extra);
  for (const [k, v] of [['volunteer_username', 'volunteer'], ['admin_username', 'wavelength'], ['volunteer_hash', await hashPassword(VOL_PW)], ['admin_hash', await hashPassword(ADMIN_PW)], ['session_secret', 'test-secret']]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
  await env.DB.prepare("INSERT INTO volunteers (first_name, last_name, email) VALUES ('Ann', 'Lee', 'ann@x.co')").run();
  return env;
}
const go = (env, path, { cookie = '', form, headers = {}, method } = {}) => {
  let body;
  if (form) { body = new FormData(); for (const [k, v] of Object.entries(form)) body.append(k, v); }
  return worker.fetch(new Request(ORIGIN + path, { method: method || (form ? 'POST' : 'GET'), headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }, body }), env, ctx);
};
const login = async (env, at, username, password) => {
  const r = await go(env, at, { form: { username, password } });
  const set = r.headers.get('Set-Cookie') || '';
  return { status: r.status, to: r.headers.get('Location'), set, cookie: set.split(';')[0] };
};
const where = (r) => r.headers.get('Location');

test('admin login at /admin/login/ gives an admin-only cookie scoped to /admin', async () => {
  const env = await setup();
  const a = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  assert.equal(a.to, '/admin/');
  assert.match(a.set, /^wl_admin=a\.\d+\./);
  assert.match(a.set, /Path=\/admin;/);
  assert.match(a.set, /HttpOnly; Secure; SameSite=Lax/);
  assert.ok((await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_session_secret'").first()).value, 'its own signing secret, created at the first admin login');
  const home = await go(env, '/admin/', { cookie: a.cookie });
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Admin console/);
  for (const s of ['volunteers', 'academy', 'supervisors', 'organisations', 'faculty', 'departments', 'newsletter', 'logins']) assert.match(html, new RegExp(`href="/admin/${s}/"`));
  assert.equal((await go(env, '/admin/volunteers/export.csv', { cookie: a.cookie })).status, 200);
  assert.match(await (await go(env, '/admin/volunteers/', { cookie: a.cookie })).text(), /ann@x\.co/);
  // Wrong password, or the volunteer login, is refused at the admin login.
  assert.equal((await login(env, '/admin/login/', 'wavelength', 'wrong password')).to, '/admin/login/?error=1');
  const v = await login(env, '/admin/login/', 'volunteer', VOL_PW);
  assert.equal(v.to, '/admin/login/?error=1');
  assert.equal(v.set, '');
  // Logged out: every console page sends you to the admin login.
  for (const p of ['/admin/', '/admin/volunteers/', '/admin/supervisors/', '/admin/logins/', '/admin/academy/learners.csv']) assert.equal(where(await go(env, p)), '/admin/login/', p);
  const out = await go(env, '/admin/logout/', { cookie: a.cookie });
  assert.equal(where(out), '/admin/login/');
  assert.match(out.headers.get('Set-Cookie'), /^wl_admin=; Path=\/admin;.*Max-Age=0/);
});

test('volunteer and admin sessions are separate', async () => {
  const env = await setup();
  const v = await login(env, '/volunteer/login/', 'volunteer', VOL_PW);
  assert.equal(v.to, '/volunteer/');
  assert.match(v.set, /^wl_vol=v\./);
  assert.match(v.set, /Path=\/volunteer;/);
  assert.equal((await go(env, '/volunteer/', { cookie: v.cookie })).status, 200);
  // A volunteer cookie never opens the console, under either name.
  assert.equal(where(await go(env, '/admin/', { cookie: v.cookie })), '/admin/login/');
  assert.equal(where(await go(env, '/admin/', { cookie: v.cookie.replace('wl_vol', 'wl_admin') })), '/admin/login/');

  // The admin login entered at the volunteer login opens nothing there and points to the console login.
  const moved = await login(env, '/volunteer/login/', 'wavelength', ADMIN_PW);
  assert.equal(moved.to, '/admin/login/');
  assert.equal(moved.set, '', 'no cookie set');

  // An admin cookie never opens the volunteer area, under either name.
  const a = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  assert.equal(where(await go(env, '/volunteer/', { cookie: a.cookie })), '/volunteer/login/');
  assert.equal(where(await go(env, '/volunteer/', { cookie: a.cookie.replace('wl_admin', 'wl_vol') })), '/volunteer/login/');
  // An admin cookie from before the move (wl_vol, role a, signed with the volunteer secret) opens neither.
  const old = `wl_vol=${encodeURIComponent(v.cookie.split('=')[1]).replace(/^v/, 'a')}`;
  assert.equal(where(await go(env, '/volunteer/', { cookie: old })), '/volunteer/login/');
  assert.equal(where(await go(env, '/admin/', { cookie: old.replace('wl_vol', 'wl_admin') })), '/admin/login/');
});

test('changing one password logs out only that side', async () => {
  const env = await setup();
  const v = await login(env, '/volunteer/login/', 'volunteer', VOL_PW);
  const a = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  // Volunteer password: volunteers out, the admin stays in.
  const r = await go(env, '/admin/logins/', { cookie: a.cookie, form: { action: 'password_volunteer', new_password: 'New volunteer pw 1' }, headers: { Origin: ORIGIN } });
  assert.equal(where(r), '/admin/logins/?pw=ok');
  assert.equal(where(await go(env, '/volunteer/', { cookie: v.cookie })), '/volunteer/login/');
  assert.equal((await go(env, '/admin/volunteers/', { cookie: a.cookie })).status, 200);
  assert.equal((await login(env, '/volunteer/login/', 'volunteer', VOL_PW)).to, '/volunteer/login/?error=1');
  const v2 = await login(env, '/volunteer/login/', 'volunteer', 'New volunteer pw 1');
  assert.equal(v2.to, '/volunteer/');
  // Admin password: admins out, the volunteer stays in.
  const r2 = await go(env, '/admin/logins/', { cookie: a.cookie, form: { action: 'password_admin', new_password: 'New admin pw 123' } });
  assert.equal(where(r2), '/admin/login/');
  assert.match(r2.headers.get('Set-Cookie'), /^wl_admin=;/);
  assert.equal(where(await go(env, '/admin/', { cookie: a.cookie })), '/admin/login/');
  assert.equal((await go(env, '/volunteer/', { cookie: v2.cookie })).status, 200);
  assert.equal((await login(env, '/admin/login/', 'wavelength', 'New admin pw 123')).to, '/admin/');
  // Too short: nothing changes.
  const a2 = await login(env, '/admin/login/', 'wavelength', 'New admin pw 123');
  assert.equal(where(await go(env, '/admin/logins/', { cookie: a2.cookie, form: { action: 'password_admin', new_password: 'short' } })), '/admin/logins/?pw=short');
  assert.equal((await go(env, '/admin/', { cookie: a2.cookie })).status, 200);
});

test('old /volunteer/admin/ addresses redirect to the same page in the console, keeping the query, never replaying a POST', async () => {
  const env = await setup();
  const map = {
    '/volunteer/admin': '/admin/',
    '/volunteer/admin/': '/admin/',
    '/volunteer/admin/export.csv': '/admin/volunteers/export.csv',
    '/volunteer/admin/academy/': '/admin/academy/',
    '/volunteer/admin/academy/learners.csv': '/admin/academy/learners.csv',
    '/volunteer/admin/faculty/applications.csv': '/admin/faculty/applications.csv',
    '/volunteer/admin/departments': '/admin/departments/',
    '/volunteer/admin/supervisors/?tab=new': '/admin/supervisors/?tab=new',
    '/volunteer/admin/supervisors/?app=1&m=Done': '/admin/supervisors/?app=1&m=Done',
    '/volunteer/admin/supervisors/evidence/?id=4': '/admin/supervisors/evidence/?id=4',
    '/volunteer/admin/organisations/': '/admin/organisations/',
    '/volunteer/admin/newsletter/callback/?code=abc&state=1.x': '/admin/newsletter/callback/?code=abc&state=1.x',
    '/volunteer/admin/nothing-here/': '/admin/',
    '/volunteer/admin//evil.example/': '/admin/',
  };
  for (const [from, to] of Object.entries(map)) {
    const r = await go(env, from);
    assert.equal(r.status, 301, from);
    assert.equal(where(r), to, from);
    assert.ok(where(r).startsWith('/'), 'always a path on this site');
    assert.ok(!where(r).startsWith('//'));
  }
  assert.equal(legacyAdminPath('/volunteer/admin/supervisors/'), '/admin/supervisors/');
  assert.equal(legacyAdminPath('/volunteer/admin/https:/evil.example/'), '/admin/');
  assert.equal(legacyAdminPath('/volunteer/admin/academy/../../x/'), '/admin/');

  // A POST to an old address changes nothing: it lands on the new page, to be sent again from there.
  const a = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  const id = (await env.DB.prepare('SELECT id FROM volunteers').first()).id;
  const r = await go(env, '/volunteer/admin/', { form: { id: String(id), action: 'delete' }, cookie: a.cookie });
  assert.equal(r.status, 303);
  assert.equal(where(r), '/admin/');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM volunteers').first()).n, 1, 'nothing deleted');
  // The same action from the new page works.
  assert.equal(where(await go(env, '/admin/volunteers/', { form: { id: String(id), action: 'delete' }, cookie: a.cookie })), '/admin/volunteers/');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM volunteers').first()).n, 0);
  // Cross-site posts are refused.
  assert.equal((await go(env, '/admin/volunteers/', { form: { id: '1', action: 'delete' }, cookie: a.cookie, headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('the console is unavailable, not open, before its logins exist', async () => {
  const env = makeEnv();
  assert.equal((await go(env, '/admin/')).status, 503);
  assert.equal((await go(env, '/admin/login/', { form: { username: 'wavelength', password: ADMIN_PW } })).status, 503);
});

// ---------- Access ----------
const enc = new TextEncoder();
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ACCESS = { ACCESS_TEAM_DOMAIN: 'wavelength.cloudflareaccess.com', ACCESS_AUD: 'aud-1' };
async function accessToken(email) {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
  globalThis.fetch = async (u) => (String(u).endsWith('/cdn-cgi/access/certs') ? new Response(JSON.stringify({ keys: [jwk] })) : new Response('{}'));
  clearKeyCache();
  const now = Math.floor(Date.now() / 1000);
  const part = (o) => b64u(enc.encode(JSON.stringify(o)));
  const data = `${part({ alg: 'RS256', kid: 'k1' })}.${part({ aud: ['aud-1'], iss: 'https://wavelength.cloudflareaccess.com', exp: now + 600, email })}`;
  return `${data}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, enc.encode(data)))}`;
}

test('Access roles route by /admin/ paths: the home shows only the sections a person can open', async () => {
  const env = await setup(ACCESS);
  const H = { 'Cf-Access-Jwt-Assertion': await accessToken('ops@x.co') };
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('admin_roles', ?)").bind(JSON.stringify({ 'ops@x.co': ['verifier'] })).run();
  const a = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  const get = (p) => go(env, p, { cookie: a.cookie, headers: H });
  assert.equal((await go(env, '/admin/', { cookie: a.cookie })).status, 403, 'no Access token: refused');
  const home = await get('/admin/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /href="\/admin\/supervisors\/"/);
  assert.match(html, /href="\/admin\/organisations\/"/);
  for (const s of ['volunteers', 'academy', 'faculty', 'departments', 'newsletter', 'logins']) assert.doesNotMatch(html, new RegExp(`href="/admin/${s}/"`), s);
  assert.match(html, /ops@x\.co/);
  for (const p of ['/admin/volunteers/', '/admin/volunteers/export.csv', '/admin/logins/', '/admin/academy/learners.csv', '/admin/newsletter/']) assert.equal((await get(p)).status, 403, p);
  assert.equal(where(await go(env, '/admin/logins/', { cookie: a.cookie, headers: H, form: { action: 'password_admin', new_password: 'Takeover pw 1234' } })), null, 'a verifier cannot change logins');
  assert.equal((await get('/admin/organisations/')).status, 200);
});

test('console navigation and home without Access list every section', () => {
  const nav = adminNav({ on: false }, 'supervisors');
  assert.match(nav, /<b aria-current="page">Supervisor verification<\/b>/);
  assert.match(nav, /href="\/admin\/volunteers\/"/);
  assert.match(nav, /href="\/admin\/logout\/"/);
  assert.match(consoleHome({ on: false }), /href="\/admin\/logins\/"/);
  assert.match(consoleHome({ on: true, email: 'x@x.co', roles: [] }), /do not open any section/);
});

test('team emails link to the console at its new address, with the resubmission wording kept', async () => {
  const { render } = await import('../worker/notify.js');
  for (const d of [{ application: 1 }, { application: 1, resubmitted: true }, { application: 2, renewal: true, resubmitted: true }]) {
    const m = render('app_admin', d);
    assert.match(m.text + m.button.href, /https:\/\/thewavelength\.co\.uk\/admin\/supervisors\/\?tab=new/);
    assert.doesNotMatch(m.text + m.button.href, /volunteer\/admin/);
  }
  assert.equal(render('app_admin', { application: 1, resubmitted: true }).subject, 'Updated supervisor application to review');
  assert.equal(render('app_admin', { application: 2, renewal: true }).subject, 'New supervisor renewal to review');
  assert.equal(render('app_resubmitted', {}).subject, 'Updated supervisor application received');
  assert.equal(render('renew_resubmitted', {}).subject, 'Updated supervisor renewal received');
});
