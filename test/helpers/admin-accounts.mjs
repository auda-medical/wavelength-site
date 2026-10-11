// Test helpers for native administrator accounts (worker/admin/): an environment with the account secrets and the
// shared login, a browser-like client (cookie jar, same-origin posts), a controllable clock, authenticator codes,
// and the steps of bootstrap, activation and two-step set-up. Fictional people and throwaway secrets only.
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN } from './env.mjs';
import worker from '../../worker/index.js';
import { hashPassword } from '../../worker/app-util.js';
import { fromBase32, hotp, stepAt } from '../../worker/admin/crypto.js';

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

// A clock the Worker reads through Date.now(); tests move it forward.
const realNow = Date.now.bind(Date);
let offset = 0;
Date.now = () => realNow() + offset;
export const advance = (ms) => { offset += ms; };
export const resetClock = () => { offset = 0; };

export const SHARED_PW = 'Shared admin password 1';
export const VOL_PW = 'Volunteer pw 12345';
export const BOOTSTRAP = 'bootstrap-code-for-tests-only';
export const SECRETS = {
  ADMIN_PEPPER: 'pepper-for-tests-only-0123456789',
  ADMIN_TOTP_KEY: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i * 7 + 1))),
  ADMIN_BOOTSTRAP_CODE: BOOTSTRAP,
};
export async function setupEnv(extra = {}) {
  const env = makeEnv({ ...SECRETS, SUPERVISOR_APPLY: 'true', ZEPTOMAIL_TOKEN: 'test', ...extra });
  for (const [k, v] of [['volunteer_username', 'volunteer'], ['admin_username', 'wavelength'], ['volunteer_hash', await hashPassword(VOL_PW)], ['admin_hash', await hashPassword(SHARED_PW)], ['session_secret', 'test-secret']]) {
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
  }
  return env;
}

// A browser: keeps cookies, sends Origin on posts (unless told otherwise), and remembers the last page's CSRF token.
export function browser(env) {
  const jar = new Map();
  let csrf = '';
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  async function go(path, { form, method, origin = ORIGIN, headers = {}, keepCsrf = true } = {}) {
    let body;
    if (form) {
      body = new FormData();
      const data = keepCsrf && csrf && !('_csrf' in form) ? { _csrf: csrf, ...form } : form;
      for (const [k, v] of Object.entries(data)) if (v !== undefined) (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, String(x)));
    }
    const h = { ...headers };
    if (jar.size) h.Cookie = cookieHeader();
    if (form && origin) h.Origin = origin;
    const res = await worker.fetch(new Request(ORIGIN + path, { method: method || (form ? 'POST' : 'GET'), headers: h, body }), env, ctx);
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (!v || /Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v);
    }
    const text = await res.text();
    const m = text.match(/name="_csrf" value="([^"]+)"/);
    if (m) csrf = m[1];
    return { status: res.status, to: res.headers.get('Location'), text, headers: res.headers, setCookies: res.headers.getSetCookie ? res.headers.getSetCookie() : [] };
  }
  return { go, jar, get csrf() { return csrf; }, set csrf(v) { csrf = v; } };
}

export const linkIn = (html) => { const m = html.match(/https:\/\/thewavelength\.co\.uk(\/admin\/activate\/\?t=[A-Za-z0-9_-]+)/); return m ? m[1] : null; };
export const keyIn = (html) => { const m = html.match(/data-key>([A-Z2-7 ]+)</); return m ? m[1].replace(/\s+/g, '') : null; };
export const codesIn = (html) => [...(html.split('data-recovery-codes')[1] || '').matchAll(/<li>([a-z0-9-]+)<\/li>/g)].map((x) => x[1]);
export const codeFor = (key, step = stepAt()) => hotp(fromBase32(key), step);

// Activation link -> password -> two-step set-up. Returns the browser (fully signed in), the key and the recovery codes.
export async function activateAndEnrol(env, link, password, b = browser(env)) {
  const page = await b.go(link);
  assert.equal(page.status, 200, 'activation page');
  const token = new URL(ORIGIN + link).searchParams.get('t');
  const set = await b.go('/admin/activate/', { form: { t: token, password, password2: password }, keepCsrf: false });
  assert.equal(set.to, '/admin/two-step/setup/');
  const enrol = await b.go('/admin/two-step/setup/');
  const key = keyIn(enrol.text);
  assert.ok(key && key.length >= 32, 'manual key shown');
  const done = await b.go('/admin/two-step/setup/', { form: { code: await codeFor(key) } });
  assert.equal(done.status, 200);
  const codes = codesIn(done.text);
  assert.equal(codes.length, 10, 'ten recovery codes shown once');
  return { b, key, codes };
}

// The shared login, then the first Owner account (bootstrap). Returns { owner: { b, key, codes } }.
export async function bootstrapOwner(env, { username = 'owner', name = 'Olivia Owner', password = 'Spring meadow lantern 2026' } = {}) {
  const legacy = browser(env);
  const li = await legacy.go('/admin/login/', { form: { username: 'wavelength', password: SHARED_PW } });
  assert.equal(li.to, '/admin/');
  const r = await legacy.go('/admin/accounts/', { form: { action: 'bootstrap', code: BOOTSTRAP, username, display_name: name } });
  const link = linkIn(r.text);
  assert.ok(link, 'owner activation link shown');
  advance(31e3);
  const owner = await activateAndEnrol(env, link, password);
  return { legacy, owner: { ...owner, password, username, name } };
}

// Signs in with password and the current code (moving the clock a step on, so the code is new).
export async function signIn(env, username, password, key, b = browser(env)) {
  advance(31e3);
  const p = await b.go('/admin/login/', { form: { username, password }, keepCsrf: false });
  assert.equal(p.to, '/admin/two-step/', `password step for ${username}`);
  await b.go('/admin/two-step/');
  const c = await b.go('/admin/two-step/', { form: { code: await codeFor(key) } });
  assert.equal(c.to, '/admin/', `code step for ${username}`);
  return b;
}

// Owner adds an administrator; returns the activation link.
export async function addAdmin(ownerB, { username, name, role }) {
  await ownerB.go('/admin/accounts/');
  const r = await ownerB.go('/admin/accounts/', { form: { action: 'create', username, display_name: name, role } });
  const link = linkIn(r.text);
  assert.ok(link, `activation link for ${username}: ${r.text.slice(0, 0)}`);
  return link;
}

// A fingerprint of every table's rows, to prove a refused request changed nothing.
export async function dbFingerprint(env, { ignore = ['audit_events', 'admin_sessions', 'rate_counters'] } = {}) {
  const tables = ((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results || []).map((r) => r.name).filter((t) => !ignore.includes(t));
  const out = {};
  for (const t of tables) out[t] = JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results);
  return out;
}
export { ORIGIN };
