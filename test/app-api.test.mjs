// Wavelength app API: accounts, sessions, logbook ownership, sync and sign-off.
// Run with `npm test` (Node's built-in test runner; the D1 database is node:sqlite with every migration applied).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, ctx, ORIGIN } from './helpers/env.mjs';
import { handleApp } from '../worker/app.js';

const PASSWORD = 'Correct horse battery 1!';
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
async function account(env, email, extra = {}) {
  const c = client(handleApp, env);
  const r = await c.call('/api/app/signup', { firstName: 'Test', lastName: email.split('@')[0], email, password: PASSWORD, terms: true, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
const entry = (id, extra = {}) => ({ id, type: 'efast', date: '2026-09-01', supervision: 'direct', ...extra });

test('signup validates input, and a duplicate email gets the "check your email" answer without logging in', async () => {
  const env = makeEnv();
  const c = client(handleApp, env);
  assert.equal((await c.call('/api/app/signup', { firstName: 'A', lastName: 'B', email: 'bad', password: PASSWORD, terms: true })).status, 400);
  assert.equal((await c.call('/api/app/signup', { firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'short', terms: true })).status, 400);
  assert.equal((await c.call('/api/app/signup', { firstName: 'A', lastName: 'B', email: 'a@b.co', password: PASSWORD })).status, 400);
  await account(env, 'a@b.co');
  const before = await env.DB.prepare('SELECT password_hash, first_name FROM learners WHERE email = ?').bind('a@b.co').first();
  // Plan section 23: the same answer as an Academy-only email (no 409 that would confirm the account exists).
  const other = client(handleApp, env);
  const dup = await other.call('/api/app/signup', { firstName: 'X', lastName: 'Y', email: 'A@B.co', password: 'Another password 1!', terms: true });
  assert.equal(dup.status, 202);
  assert.deepEqual(dup.body, { ok: true, checkEmail: true });
  assert.ok(!/wl_learn=/.test(other.cookie), 'no login');
  assert.deepEqual(await env.DB.prepare('SELECT password_hash, first_name FROM learners WHERE email = ?').bind('a@b.co').first(), before, 'nothing about the account changes');
});

test('passwords are stored hashed, never in plain text', async () => {
  const env = makeEnv();
  await account(env, 'hash@x.co');
  const row = await env.DB.prepare('SELECT password_hash FROM learners WHERE email = ?').bind('hash@x.co').first();
  assert.match(row.password_hash, /^pbkdf2\$100000\$/);
  assert.ok(!row.password_hash.includes(PASSWORD));
});

test('POSTs from another origin, or with no Origin, are refused', async () => {
  const env = makeEnv();
  const c = await account(env, 'csrf@x.co');
  assert.equal((await c.call('/api/app/sync', { entries: [entry('aaaaaaaa1')] }, { origin: 'https://evil.example' })).status, 403);
  const res = await handleApp(new Request(ORIGIN + '/api/app/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.cookie }, body: '{"entries":[]}' }), env, ctx);
  assert.equal(res.status, 403);
});

test('a forged or tampered cookie is not a login', async () => {
  const env = makeEnv();
  const c = await account(env, 'cookie@x.co');
  const [id, exp, sig] = c.cookie.split('=')[1].split('.');
  const other = client(handleApp, env);
  other.cookie = `wl_learn=${Number(id) + 1}.${exp}.${sig}`;
  assert.equal((await other.call('/api/app/me')).body.auth, false);
  other.cookie = `wl_learn=${id}.${Number(exp) + 1}.${sig}`;
  assert.equal((await other.call('/api/app/me')).body.auth, false);
});

test('eight wrong passwords lock the account for 15 minutes', async () => {
  const env = makeEnv();
  await account(env, 'lock@x.co');
  const c = client(handleApp, env);
  for (let i = 0; i < 8; i++) assert.equal((await c.call('/api/app/login', { email: 'lock@x.co', password: 'wrong password' })).status, 401);
  assert.equal((await c.call('/api/app/login', { email: 'lock@x.co', password: PASSWORD })).status, 429);
});

test('changing the password logs out other devices but keeps this one', async () => {
  const env = makeEnv();
  const phone = await account(env, 'pw@x.co');
  const laptop = client(handleApp, env);
  assert.equal((await laptop.call('/api/app/login', { email: 'pw@x.co', password: PASSWORD })).status, 200);
  await new Promise((r) => setTimeout(r, 5));
  const r = await phone.call('/api/app/password', { current: PASSWORD, password: 'A brand new password 2!' });
  assert.equal(r.status, 200);
  assert.equal((await phone.call('/api/app/me')).body.ok, true, 'this device stays logged in');
  assert.equal((await laptop.call('/api/app/me')).body.auth, false, 'the other device is logged out');
});

test('a password reset link works once and logs out old sessions', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const old = await account(env, 'reset@x.co');
  const { id } = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind('reset@x.co').first();
  // Insert a known token directly, as the email would carry it.
  const token = 'known-reset-token-0123456789';
  const { sha256 } = await import('../worker/app-util.js');
  await env.DB.prepare('INSERT INTO password_resets (token_hash, learner_id, expires_at) VALUES (?,?,?)').bind(await sha256(token), id, Date.now() + 3600e3).run();
  await new Promise((r) => setTimeout(r, 5));
  const c = client(handleApp, env);
  assert.equal((await c.call('/api/app/reset/complete', { token, password: 'Reset password 123!' })).status, 200);
  assert.equal((await c.call('/api/app/me')).body.ok, true);
  assert.equal((await old.call('/api/app/me')).body.auth, false, 'the old session no longer works');
  assert.equal((await client(handleApp, env).call('/api/app/reset/complete', { token, password: 'Another password 1!' })).status, 400, 'the link works once');
});

test('reset emails are limited to one every five minutes per account', async () => {
  const sent = [];
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test', ZEPTOMAIL_API: 'https://mail.test/' });
  await account(env, 'flood@x.co');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { sent.push(u); return new Response('{}'); };
  try {
    const c = client(handleApp, env);
    for (let i = 0; i < 3; i++) assert.equal((await c.call('/api/app/reset/request', { email: 'flood@x.co' })).body.ok, true);
    await new Promise((r) => setTimeout(r, 10));
  } finally { globalThis.fetch = realFetch; }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM password_resets').first();
  assert.equal(n.n, 1);
  assert.equal(sent.length, 1);
});

test('one learner cannot read, overwrite or delete another learner\'s logbook entries', async () => {
  const env = makeEnv();
  const a = await account(env, 'owner@x.co');
  const b = await account(env, 'intruder@x.co');
  const id = 'ownedentry01';
  assert.equal((await a.call('/api/app/sync', { entries: [entry(id, { indication: 'mine' })] })).body.saved.length, 1);
  // B tries to overwrite, force-overwrite and delete A's entry by its id.
  const w = await b.call('/api/app/sync', { entries: [entry(id, { indication: 'hijack', force: true }), { id, deleted: true, force: true }] });
  assert.deepEqual(w.body.saved, []);
  const row = await env.DB.prepare('SELECT learner_id, data, deleted FROM logbook_entries WHERE id = ?').bind(id).first();
  assert.equal(JSON.parse(row.data).indication, 'mine');
  assert.equal(row.deleted, 0);
  // B's pull never includes A's entries.
  assert.deepEqual((await b.call('/api/app/sync?since=0')).body.entries, []);
  // B cannot request sign-off on A's entry.
  assert.equal((await b.call('/api/app/signoff/request', { entryIds: [id] })).status, 400);
  // B cannot cancel A's sign-off request.
  const so = await a.call('/api/app/signoff/request', { entryIds: [id] });
  await b.call('/api/app/signoff/cancel', { code: so.body.code });
  assert.equal((await env.DB.prepare('SELECT status FROM signoffs WHERE id = ?').bind(so.body.code).first()).status, 'pending');
});

test('the server owns sign-off: a client cannot write one, and editing a signed scan voids it', async () => {
  const env = makeEnv();
  const a = await account(env, 'signed@x.co');
  const id = 'signedentry1';
  await a.call('/api/app/sync', { entries: [entry(id, { signoff: { status: 'confirmed', name: 'Forged' } })] });
  let pulled = (await a.call('/api/app/sync?since=0')).body.entries[0];
  assert.equal(pulled.signoff, undefined, 'client-supplied sign-off is ignored');
  const r = await a.call('/api/app/signoff/inperson', { entryIds: [id], name: 'Dr Supervisor', role: 'Consultant', confirm: true, signature: SIG });
  assert.equal(r.status, 200);
  pulled = (await a.call('/api/app/sync?since=0')).body.entries[0];
  assert.equal(pulled.signoff.status, 'confirmed');
  // Unchanged signed content keeps the sign-off; a changed finding voids it.
  let s = await a.call('/api/app/sync', { entries: [{ ...entry(id), noSignoff: true, updatedAt: pulled.updatedAt }] });
  assert.equal(s.body.saved[0].signoff.status, 'confirmed');
  s = await a.call('/api/app/sync', { entries: [{ ...entry(id, { indication: 'changed' }), updatedAt: s.body.saved[0].updatedAt }] });
  assert.equal(s.body.saved[0].signoff, undefined);
  assert.equal(s.body.saved[0].signoffVoid.name, 'Dr Supervisor');
});

test('a sign-off link signs once, even if submitted twice', async () => {
  const env = makeEnv();
  const a = await account(env, 'twice@x.co');
  const id = 'twiceentry01';
  await a.call('/api/app/sync', { entries: [entry(id)] });
  const req = await a.call('/api/app/signoff/request', { entryIds: [id] });
  const token = req.body.link.split('#')[1];
  const sup = client(handleApp, env);
  const view = await sup.call('/api/app/signoff/view?t=' + token);
  assert.equal(view.body.entries.length, 1);
  const form = { token, name: 'Dr One', role: 'Consultant', confirm: true, signature: SIG, decisions: { [id]: 'confirmed' } };
  const [x, y] = await Promise.all([sup.call('/api/app/signoff/complete', form), sup.call('/api/app/signoff/complete', { ...form, name: 'Dr Two' })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 410]);
  assert.equal((await sup.call('/api/app/signoff/view?t=' + token)).status, 404, 'the token is gone after signing');
});

test('sync conflict: an older copy is refused and the server copy comes back', async () => {
  const env = makeEnv();
  const a = await account(env, 'conflict@x.co');
  const id = 'conflict0001';
  const first = (await a.call('/api/app/sync', { entries: [entry(id, { indication: 'v1' })] })).body.saved[0];
  await new Promise((r) => setTimeout(r, 3));
  const second = (await a.call('/api/app/sync', { entries: [{ ...entry(id, { indication: 'v2' }), updatedAt: first.updatedAt }] })).body.saved[0];
  // A second device still holding v1 pushes an edit: conflict, with the server's v2 attached.
  const stale = (await a.call('/api/app/sync', { entries: [{ ...entry(id, { indication: 'v1 edit' }), updatedAt: first.updatedAt }] })).body.saved[0];
  assert.equal(stale.conflict, true);
  assert.equal(stale.server.indication, 'v2');
  assert.equal(stale.server.updatedAt, second.updatedAt);
  // A restored backup (updatedAt 0) never silently overwrites a live server copy.
  const restored = (await a.call('/api/app/sync', { entries: [{ ...entry(id, { indication: 'old backup' }), updatedAt: 0 }] })).body.saved[0];
  assert.equal(restored.conflict, true);
  // A new entry (no updatedAt) saves.
  assert.equal((await a.call('/api/app/sync', { entries: [entry('brandnew0001')] })).body.saved[0].conflict, undefined);
});

test('sync pulls large logbooks in pages without losing entries that share a timestamp', async () => {
  const env = makeEnv();
  const a = await account(env, 'big@x.co');
  const { id: lid } = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind('big@x.co').first();
  // 1,203 entries, all written in the same millisecond (as one bulk push would be).
  const t = Date.now() - 3600e3;
  const ins = [];
  for (let i = 0; i < 1203; i++) ins.push(env.DB.prepare('INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at) VALUES (?,?,?,?,?,?)').bind('bulk' + String(i).padStart(6, '0'), lid, 'efast', '2026-09-01', JSON.stringify(entry('bulk' + i)), t));
  await env.DB.batch(ins);
  const seen = new Set();
  let since = 0, after = '', pages = 0, res;
  do {
    res = (await a.call(`/api/app/sync?since=${since}${after ? '&after=' + after : ''}`)).body;
    res.entries.forEach((e) => seen.add(e.updatedAt + e.id));
    since = res.now; after = res.after; pages++;
  } while (res.more && pages < 20);
  assert.equal(seen.size, 1203);
  assert.equal(pages, 3);
});

test('the sync cursor trails the clock so a write landing during a pull is not missed', async () => {
  const env = makeEnv();
  const a = await account(env, 'race@x.co');
  const before = Date.now();
  const res = (await a.call('/api/app/sync?since=0')).body;
  assert.ok(res.now <= before, 'cursor is behind the time of the query');
  const { id: lid } = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind('race@x.co').first();
  // A sign-off that committed just after the pull but stamped a moment before it.
  await env.DB.prepare('INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at) VALUES (?,?,?,?,?,?)').bind('lateentry001', lid, 'efast', '2026-09-01', '{}', before - 500).run();
  const next = (await a.call('/api/app/sync?since=' + res.now)).body;
  assert.ok(next.entries.some((e) => e.id === 'lateentry001'));
});

test('verify shows a signed record by code without findings', async () => {
  const env = makeEnv();
  const a = await account(env, 'verify@x.co');
  await a.call('/api/app/sync', { entries: [entry('verifyentry1', { indication: 'private clinical text' })] });
  const r = await a.call('/api/app/signoff/inperson', { entryIds: ['verifyentry1'], name: 'Dr V', role: 'Consultant', confirm: true, signature: SIG });
  const v = await client(handleApp, env).call('/api/app/verify?code=' + r.body.code);
  assert.equal(v.body.ok, true);
  assert.ok(!JSON.stringify(v.body).includes('private clinical text'));
  assert.equal((await client(handleApp, env).call('/api/app/verify?code=SO-AAAA-BBBB')).status, 404);
});

test('deleting an account removes its logbook and sign-offs', async () => {
  const env = makeEnv();
  const a = await account(env, 'gone@x.co');
  await a.call('/api/app/sync', { entries: [entry('goneentry001')] });
  await a.call('/api/app/signoff/request', { entryIds: ['goneentry001'] });
  assert.equal((await a.call('/api/app/account/delete', { password: 'wrong password!' })).status, 400);
  assert.equal((await a.call('/api/app/account/delete', { password: PASSWORD })).status, 200);
  for (const t of ['logbook_entries', 'signoffs', 'learners']) assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n, 0, t);
});

test('new passwords need 10 characters, upper and lower case, a number and a symbol', async () => {
  const env = makeEnv();
  const c = client(handleApp, env);
  const base = { firstName: 'P', lastName: 'W', terms: true };
  for (const bad of ['Short1!', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoNumbersHere!', 'NoSymbols1234']) {
    const r = await c.call('/api/app/signup', { ...base, email: 'pw' + bad.length + '@x.co', password: bad });
    assert.equal(r.status, 400, bad);
    assert.match(r.body.error, /uppercase/);
  }
  assert.equal((await c.call('/api/app/signup', { ...base, email: 'ok@x.co', password: 'Göod-pässword 9' })).status, 200);
  assert.equal((await c.call('/api/app/password', { current: 'Göod-pässword 9', password: 'weakpassword' })).status, 400);
});

test('autofill of a field named website no longer drops a real sign-up', async () => {
  const env = makeEnv();
  const r = await client(handleApp, env).call('/api/app/signup', { firstName: 'Auto', lastName: 'Fill', email: 'autofill@x.co', password: PASSWORD, terms: true, website: 'https://example.com' });
  assert.equal(r.status, 200);
  assert.ok(r.body.account, 'account returned');
  const trap = await client(handleApp, env).call('/api/app/signup', { firstName: 'Bot', lastName: 'Bot', email: 'bot@x.co', password: PASSWORD, terms: true, wl_trap: 'x' });
  assert.equal(trap.body.trap, true);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM learners WHERE email = ?').bind('bot@x.co').first()).n, 0);
});

test('the sign-off email tells the learner where to turn these emails off', async () => {
  const { withMailbox } = await import('./helpers/verify.mjs');
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test', ZEPTOMAIL_API: 'https://mail.test/' });
  await withMailbox(async (box) => {
    const a = await account(env, 'notify@x.co');
    const id = 'notifyentry1';
    await a.call('/api/app/sync', { entries: [entry(id)] });
    const req = await a.call('/api/app/signoff/request', { entryIds: [id] });
    const token = req.body.link.split('#')[1];
    const sup = client(handleApp, env);
    const r = await sup.call('/api/app/signoff/complete', { token, name: 'Dr One', role: 'Consultant', confirm: true, signature: SIG, decisions: { [id]: 'confirmed' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await box.settle();
    const mail = box.sent.find((m) => /untick the setting/.test(String(m.textbody)));
    assert.ok(mail, 'the learner got a sign-off email');
    assert.match(String(mail.textbody), /under Me, Settings, in the app/);
  });
});
