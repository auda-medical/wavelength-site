// Security of the supervisor verification fix (October 2026), through the whole Worker (worker/index.js): approval
// needs the admin session (not a volunteer's, not none), cross-site posts are refused, the remembered reviewer name
// is scoped and escaped, applicant text in the new admin banners is escaped, and the app API answers only the
// logged-in account. Fictional people only; email goes to a stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN, client } from './helpers/env.mjs';
import { verifiedAccount, idOf } from './helpers/verify.mjs';
import worker from '../worker/index.js';
import { handleApp } from '../worker/app.js';
import { hashPassword } from '../worker/app-util.js';
import { addMonths, ukDate } from '../worker/time.js';

const mail = [];
globalThis.fetch = async (u, init) => { mail.push(JSON.parse(init.body)); return new Response('{}'); };
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
const XSS = '<img src=x onerror=alert(1)>';
async function setup() {
  const env = makeEnv({ SUPERVISOR_APPLY: 'true', ZEPTOMAIL_TOKEN: 'test' });
  for (const [k, v] of [['volunteer_username', 'volunteer'], ['admin_username', 'wavelength'], ['volunteer_hash', await hashPassword(VOL_PW)], ['admin_hash', await hashPassword(ADMIN_PW)], ['session_secret', 'test-secret']]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
  // A supervisor whose name an attacker chose, with a sent application and a verified registration (written directly:
  // the registration check itself is covered elsewhere).
  const sup = await verifiedAccount(env, 'sec.sup@example.test', { firstName: XSS, lastName: 'Example' });
  await sup.call('/api/app/supervisor/application', { role: XSS, organisation: XSS, registration: { regulator: 'gmc', number: '7400001', profession: 'Doctor' }, experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true }, justification: `${XSS} I lead the departmental ultrasound programme and supervise scans every week in the department.`, evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'] });
  assert.equal((await sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  const sid = await idOf(env, 'sec.sup@example.test');
  await env.DB.prepare("UPDATE professional_registrations SET status = 'verified', verified_at = ?, verification_method = 'manual_register' WHERE learner_id = ?").bind(new Date().toISOString(), sid).run();
  const app = await env.DB.prepare('SELECT id FROM supervisor_applications WHERE learner_id = ?').bind(sid).first();
  return { env, sup, sid, app };
}
const go = (env, path, { cookie = '', form, headers = {} } = {}) => {
  let body;
  if (form) { body = new FormData(); for (const [k, v] of Object.entries(form)) (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, x)); }
  return worker.fetch(new Request(ORIGIN + path, { method: form ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }, body }), env, ctx);
};
const login = async (env, at, username, password) => (await go(env, at, { form: { username, password } })).headers.get('Set-Cookie').split(';')[0];
const approvals = async (env, sid) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?").bind(sid).first()).n;

test('approval needs the admin session: none, or a volunteer session, approves nothing and sends nothing', async () => {
  const { env, sid } = await setup();
  mail.length = 0;
  const form = { action: 'appr_add', learner: String(sid), scope: 'famus:famus-thoracic', reviewer: 'Alex Reviewer' };
  const none = await go(env, '/admin/supervisors/', { form });
  assert.equal(none.headers.get('Location'), '/admin/login/');
  const vol = await login(env, '/volunteer/login/', 'volunteer', VOL_PW);
  const v = await go(env, '/admin/supervisors/', { form, cookie: vol });
  assert.equal(v.headers.get('Location'), '/admin/login/');
  assert.equal(await approvals(env, sid), 0);
  assert.equal(mail.length, 0);
});

test('a cross-site post with the admin cookie is refused before anything is written', async () => {
  const { env, sid } = await setup();
  const adm = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  const r = await go(env, '/admin/supervisors/', { cookie: adm, headers: { Origin: 'https://evil.example' }, form: { action: 'appr_add', learner: String(sid), scope: 'famus:famus-thoracic', reviewer: 'Alex Reviewer' } });
  assert.equal(r.status, 403);
  assert.equal(await approvals(env, sid), 0);
});

test('an admin approval through the Worker: the application is decided, the reviewer name is remembered, scoped and escaped', async () => {
  const { env, sid, app } = await setup();
  mail.length = 0;
  const adm = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  const r = await go(env, '/admin/supervisors/', { cookie: adm, headers: { Origin: ORIGIN }, form: { action: 'appr_add', learner: String(sid), scope: 'famus:famus-thoracic', reviewer: 'Alex "Reviewer"' } });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get('Location')), /Approved until .*Approval email: accepted by the email provider\./);
  const set = r.headers.get('Set-Cookie');
  assert.match(set, /^wl_reviewer=Alex%20%22Reviewer%22; Path=\/admin\/supervisors\/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
  assert.equal((await env.DB.prepare('SELECT status FROM supervisor_applications WHERE id = ?').bind(app.id).first()).status, 'approved');
  assert.equal(mail.filter((m) => m.subject === 'Wavelength | Supervisor Verification Approved').length, 1);
  // The remembered name comes back escaped, and a hostile cookie value cannot break out of the attribute.
  const page = await (await go(env, `/admin/supervisors/?id=${sid}`, { cookie: `${adm}; wl_reviewer=${encodeURIComponent('"><script>alert(1)</script>')}` })).text();
  assert.ok(!page.includes('<script>alert(1)</script>'));
  assert.match(page, /value="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  // The reviewer cookie alone opens nothing.
  assert.equal((await go(env, '/admin/supervisors/', { cookie: 'wl_reviewer=Alex' })).headers.get('Location'), '/admin/login/');
});

test('applicant text is escaped in the new admin banners, queues and email status', async () => {
  const { env, sid, app } = await setup();
  // The old person-page state: an approval with the application still open (shows the repair banner and Attention row).
  await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at) VALUES (?, 'famus', 'famus-thoracic', 'approved', '[]', ?, ?, ?)").bind(sid, addMonths(ukDate(), 12), `admin:wavelength:${XSS}`, new Date().toISOString()).run();
  await env.DB.prepare("INSERT INTO notification_log (key, learner_id, kind, payload, status, attempts, last_error, created_at) VALUES ('app_approved:x', ?, 'app_approved', '{}', 'failed', 1, ?, ?)").bind(sid, XSS, new Date().toISOString()).run();
  const adm = await login(env, '/admin/login/', 'wavelength', ADMIN_PW);
  for (const q of [`?app=${app.id}`, `?id=${sid}`, '?tab=attention', '?tab=system']) {
    const html = await (await go(env, `/admin/supervisors/${q}`, { cookie: `${adm}; wl_reviewer=${encodeURIComponent(XSS)}` })).text();
    assert.ok(!html.includes(XSS), `unescaped on ${q}`);
    assert.ok(!/<script/i.test(html.slice(html.indexOf('id="admin-root"'))), `no script in the console content on ${q}`);
  }
});

test('the app API: no login, no status; one account never sees another\'s private verification fields', async () => {
  const { env, sup, sid } = await setup();
  const anon = client(handleApp, env);
  assert.equal((await anon.call('/api/app/supervisor')).status, 401);
  assert.equal((await anon.call('/api/app/supervisors')).status, 401);
  const other = await verifiedAccount(env, 'sec.other@example.test');
  const mine = (await other.call('/api/app/supervisor')).body;
  assert.equal(mine.verification.state, 'none', 'their own (empty) status, not the supervisor\'s');
  assert.ok(!JSON.stringify(await other.call('/api/app/supervisors')).includes('sec.sup@example.test'), 'no link, so nothing about the supervisor');
  assert.equal((await sup.call('/api/app/supervisor')).body.verification.state, 'pending');
  assert.ok(sid);
});
