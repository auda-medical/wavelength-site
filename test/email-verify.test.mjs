// Email ownership verification: app sign-up, Academy registration, Academy-only accounts adding a password,
// supervisor invitations, throttling, expiry, replay and the transition for existing accounts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, ctx, ORIGIN } from './helpers/env.mjs';
import { withMailbox, signup, idOf, PASSWORD } from './helpers/verify.mjs';
import { handleApp } from '../worker/app.js';
import { handleAcademy } from '../worker/academy.js';
import { sha256 } from '../worker/app-util.js';

const MAIL = { ZEPTOMAIL_TOKEN: 'test', ZEPTOMAIL_API: 'https://mail.test/' };
const MODULE = Object.keys((await import('../worker/academy-data.json', { with: { type: 'json' } })).default.modules)[0];
const academy = (env) => client(handleAcademy, env);
const register = (c, email, extra = {}) => c.call('/api/academy/register', { module: MODULE, first_name: 'Ann', last_name: 'Lee', email, role: 'Doctor', privacy: 'yes', ...extra });

test('a new app account works at once, is unverified, and the emailed link verifies it', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const app = await signup(env, 'new@x.co');
    let me = (await app.call('/api/app/me')).body;
    assert.equal(me.account.emailStatus, 'unverified');
    assert.equal(me.account.emailVerified, false);
    const [t] = box.tokens();
    assert.ok(t, 'a verification email was sent');
    // The link is opened in another browser (as when a phone opens an email link outside the app).
    const browser = client(handleApp, env);
    const r = await browser.call('/api/app/email/verify', { token: t });
    assert.equal(r.status, 200);
    assert.equal(r.body.verified, true);
    assert.equal(browser.cookie, '', 'a plain verification link never logs anyone in');
    me = (await app.call('/api/app/me')).body;
    assert.equal(me.account.emailStatus, 'verified', 'the app session sees the verification at once');
  });
});

test('tokens are stored hashed, work once, and two clicks at the same time verify once', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    await signup(env, 'once@x.co');
    const [t] = box.tokens();
    const rows = (await env.DB.prepare('SELECT * FROM email_tokens').all()).results;
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, t);
    assert.equal(rows[0].token_hash, await sha256(t));
    assert.ok(!JSON.stringify(rows).includes(t), 'no plain token in the database');
    const [a, b] = await Promise.all([client(handleApp, env).call('/api/app/email/verify', { token: t }), client(handleApp, env).call('/api/app/email/verify', { token: t })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 410]);
    assert.equal((await client(handleApp, env).call('/api/app/email/verify', { token: t })).status, 410, 'a used link cannot be replayed');
  });
});

test('an expired token is refused and leaves the account unverified', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async () => { await signup(env, 'late@x.co'); });
  const id = await idOf(env, 'late@x.co');
  const t = 'expired-token-0123456789-abcdefghij';
  await env.DB.prepare("INSERT INTO email_tokens (token_hash, learner_id, email, purpose, created_at, expires_at) VALUES (?,?,?,'verify',?,?)").bind(await sha256(t), id, 'late@x.co', Date.now() - 4 * 864e5, Date.now() - 1000).run();
  const r = await client(handleApp, env).call('/api/app/email/verify', { token: t });
  assert.equal(r.status, 410);
  assert.equal((await env.DB.prepare('SELECT email_status FROM learners WHERE id = ?').bind(id).first()).email_status, 'unverified');
  assert.equal((await client(handleApp, env).call('/api/app/email/verify', { token: 'made-up-token' })).status, 410, 'unknown tokens get the same answer');
});

test('resend is throttled to one email every two minutes and six a day, with the same answer every time', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const app = await signup(env, 'flood@x.co');
    for (let i = 0; i < 3; i++) assert.deepEqual((await app.call('/api/app/email/resend', {})).body, { ok: true, emailOn: true });
    assert.equal(box.tokens().length, 1, 'only the sign-up email went out');
    await env.DB.prepare('UPDATE email_tokens SET created_at = created_at - 180000').run();
    await app.call('/api/app/email/resend', {});
    assert.equal(box.tokens().length, 2, 'allowed again after two minutes');
    const id = await idOf(env, 'flood@x.co');
    for (let i = 0; i < 6; i++) await env.DB.prepare("INSERT INTO email_tokens (token_hash, learner_id, email, purpose, created_at, expires_at) VALUES (?,?,?,'verify',?,?)").bind('h' + i, id, 'flood@x.co', Date.now() - 3600e3, Date.now() + 3600e3).run();
    await app.call('/api/app/email/resend', {});
    assert.equal(box.tokens().length, 2, 'the daily cap holds');
  });
});

test('existing accounts become legacy_unverified and keep full use of the logbook', async () => {
  const env = makeEnv(MAIL);
  // An account created before migration 0011: the column default marks it legacy.
  await withMailbox(async () => { await signup(env, 'old@x.co'); });
  await env.DB.prepare("UPDATE learners SET email_status = 'legacy_unverified' WHERE email = ?").bind('old@x.co').run();
  await env.DB.prepare("INSERT INTO learners (email, first_name, last_name) VALUES ('academy-old@x.co', 'Old', 'Academy')").run();
  assert.equal((await env.DB.prepare("SELECT email_status FROM learners WHERE email = 'academy-old@x.co'").first()).email_status, 'legacy_unverified');
  const c = client(handleApp, env);
  assert.equal((await c.call('/api/app/login', { email: 'old@x.co', password: PASSWORD })).status, 200);
  assert.equal((await c.call('/api/app/me')).body.account.emailStatus, 'legacy_unverified');
  const s = await c.call('/api/app/sync', { entries: [{ id: 'legacyentry1', type: 'efast', date: '2026-09-01' }] });
  assert.equal(s.body.saved.length, 1, 'the logbook syncs without verification');
  const so = await c.call('/api/app/signoff/inperson', { entryIds: ['legacyentry1'], name: 'Dr S', role: 'Consultant', confirm: true, signature: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(so.status, 200, 'in-person sign-off works without verification');
});

test('an Academy-only account cannot be taken over by signing up with its email', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const owner = academy(env);
    assert.equal((await register(owner, 'ann@x.co')).status, 200);
    const ownerCookie = owner.cookie;
    assert.ok(ownerCookie);
    await box.settle();
    // Someone else signs up in the app with Ann's email and their own password.
    const attacker = client(handleApp, env);
    const r = await attacker.call('/api/app/signup', { firstName: 'Mal', lastName: 'Ory', email: 'ann@x.co', password: 'Attacker password 1!', terms: true });
    assert.equal(r.status, 202);
    assert.deepEqual(r.body, { ok: true, checkEmail: true });
    assert.ok(!/wl_learn=/.test(attacker.cookie), 'no login');
    const row = await env.DB.prepare('SELECT password_hash, first_name FROM learners WHERE email = ?').bind('ann@x.co').first();
    assert.equal(row.password_hash, null, 'no password set without the email link');
    assert.equal(row.first_name, 'Ann');
    assert.equal((await attacker.call('/api/app/login', { email: 'ann@x.co', password: 'Attacker password 1!' })).status, 401);
  });
});

test('an Academy learner adds a password through the emailed link, which logs out older sessions', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const academyTab = academy(env);
    await register(academyTab, 'bea@x.co');
    await new Promise((r) => setTimeout(r, 5));
    const app = client(handleApp, env);
    assert.equal((await app.call('/api/app/signup', { firstName: 'Bea', lastName: 'Tan', email: 'bea@x.co', password: 'My new password 1!', terms: true })).status, 202);
    await box.settle();
    const t = box.tokens().pop();
    const claim = await app.call('/api/app/email/verify', { token: t });
    assert.equal(claim.status, 200, JSON.stringify(claim.body));
    assert.equal(claim.body.purpose, 'claim');
    assert.equal(claim.body.account.emailStatus, 'verified');
    assert.equal((await app.call('/api/app/me')).body.ok, true, 'the browser that opened the link is logged in');
    assert.equal((await academyTab.call('/api/academy/me')).body.loggedIn, false, 'the old email-only session is logged out');
    assert.equal((await client(handleApp, env).call('/api/app/login', { email: 'bea@x.co', password: 'My new password 1!' })).status, 200);
  });
});

test('returning Academy learners get a sign-in link instead of being logged in by typing an email', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    await register(academy(env), 'cal@x.co');
    const other = academy(env);
    const r = await register(other, 'cal@x.co', { first_name: 'Callum' });
    assert.equal(r.status, 202);
    assert.equal(r.body.checkEmail, true);
    assert.ok(!/wl_learn=/.test(other.cookie), 'typing the email no longer logs in');
    assert.equal((await env.DB.prepare('SELECT first_name FROM learners WHERE email = ?').bind('cal@x.co').first()).first_name, 'Ann', 'the name is unchanged until the link is used');
    await box.settle();
    const t = box.tokens().pop();
    // Opened in the browser that registered: the corrected name applies.
    const opener = client(handleApp, env); opener.cookie = other.cookie;
    const done = await opener.call('/api/app/email/verify', { token: t });
    assert.equal(done.body.purpose, 'signin');
    assert.match(done.body.next, /^\/elearning\//);
    assert.equal((await env.DB.prepare('SELECT first_name, email_status FROM learners WHERE email = ?').bind('cal@x.co').first()).first_name, 'Callum');
  });
});

test('details typed by someone else are never applied when the owner opens the link elsewhere', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    await register(academy(env), 'dee@x.co');
    // A stranger types Dee's email with another name; Dee later opens the link in her own browser.
    await register(academy(env), 'dee@x.co', { first_name: 'Mallory' });
    await box.settle();
    const r = await client(handleApp, env).call('/api/app/email/verify', { token: box.tokens().pop() });
    assert.equal(r.body.purpose, 'signin');
    assert.equal((await env.DB.prepare('SELECT first_name FROM learners WHERE email = ?').bind('dee@x.co').first()).first_name, 'Ann');
  });
});

test('a claim link opened in another browser asks the opener for a password and never applies the typed one', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    await register(academy(env), 'eve@x.co');
    // Someone signs up in the app with Eve's email and a password of their choosing.
    const attacker = client(handleApp, env);
    assert.equal((await attacker.call('/api/app/signup', { firstName: 'Mal', lastName: 'Ory', email: 'eve@x.co', password: 'Attacker password 1!', terms: true })).status, 202);
    await box.settle();
    const t = box.tokens().pop();
    // Eve opens the email in her own browser.
    const eve = client(handleApp, env);
    const first = await eve.call('/api/app/email/verify', { token: t });
    assert.equal(first.status, 400);
    assert.equal(first.body.needPassword, true);
    const done = await eve.call('/api/app/email/verify', { token: t, password: 'Eves own password 1!' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.account.firstName, 'Ann', 'the typed name is not applied');
    assert.equal((await client(handleApp, env).call('/api/app/login', { email: 'eve@x.co', password: 'Attacker password 1!' })).status, 401, "the attacker's password was never set");
    assert.equal((await client(handleApp, env).call('/api/app/login', { email: 'eve@x.co', password: 'Eves own password 1!' })).status, 200);
  });
});

test('accepting a supervisor invitation needs a verified email; the invitation link itself verifies it', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const learner = await signup(env, 'trainee@x.co');
    const sup = await signup(env, 'boss@x.co');
    await learner.call('/api/app/supervisors/add', { email: 'boss@x.co' });
    await box.settle();
    const invite = (await sup.call('/api/app/supervisors')).body.invites[0];
    const byId = await sup.call('/api/app/supervisors/accept', { id: invite.id });
    assert.equal(byId.status, 403);
    assert.equal(byId.body.needVerify, true);
    // Someone who signed up with a different address cannot use the token.
    const t = box.invites().pop();
    assert.ok(t);
    const stranger = await signup(env, 'stranger@x.co');
    assert.equal((await stranger.call('/api/app/supervisors/accept-invite', { token: t })).status, 403);
    const ok = await sup.call('/api/app/supervisors/accept-invite', { token: t });
    assert.equal(ok.status, 200);
    assert.equal((await sup.call('/api/app/me')).body.account.emailStatus, 'verified');
    assert.equal((await sup.call('/api/app/supervisors/accept-invite', { token: t })).status, 404, 'the invitation token works once');
  });
});

test('newsletter consent is never needed to verify', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    await signup(env, 'nonews@x.co', { newsletter: false });
    const r = await client(handleApp, env).call('/api/app/email/verify', { token: box.tokens()[0] });
    assert.equal(r.body.verified, true);
    assert.equal((await env.DB.prepare('SELECT newsletter FROM learners WHERE email = ?').bind('nonews@x.co').first()).newsletter, 0);
  });
});

test('EMAIL_VERIFY = "off" restores the old behaviour without a code change', async () => {
  const env = makeEnv({ ...MAIL, EMAIL_VERIFY: 'off' });
  await withMailbox(async (box) => {
    const c = academy(env);
    await register(c, 'off@x.co');
    const again = academy(env);
    assert.equal((await register(again, 'off@x.co')).status, 200);
    assert.ok(again.cookie);
    assert.equal(box.tokens().length, 0);
  });
});

test('without migration 0011 every existing flow still works', async () => {
  const env = makeEnv(MAIL, { skipMigrations: ['0011_verification.sql'] });
  await withMailbox(async () => {
    const a = await signup(env, 'premig@x.co');
    assert.equal((await a.call('/api/app/me')).body.account.emailStatus, 'legacy_unverified');
    await a.call('/api/app/sync', { entries: [{ id: 'premigentry1', type: 'lung', date: '2026-09-01' }] });
    const so = await a.call('/api/app/signoff/inperson', { entryIds: ['premigentry1'], name: 'Dr S', role: 'Consultant', confirm: true, signature: 'data:image/png;base64,iVBORw0KGgo=' });
    assert.equal(so.status, 200);
    const v = await client(handleApp, env).call('/api/app/verify?code=' + so.body.code);
    assert.equal(v.body.ok, true);
    assert.equal(v.body.supervisorCheck, null);
    const req = await a.call('/api/app/signoff/request', { entryIds: ['premigentry1'] });
    const done = await client(handleApp, env).call('/api/app/signoff/complete', { token: req.body.link.split('#')[1], name: 'Dr T', role: 'Consultant', confirm: true, signature: 'data:image/png;base64,iVBORw0KGgo=', decisions: { premigentry1: 'confirmed' } });
    assert.equal(done.status, 200);
    assert.equal((await a.call('/api/app/professional')).status, 503);
    const c = academy(env);
    await register(c, 'premig-academy@x.co');
    const again = academy(env);
    assert.equal((await register(again, 'premig-academy@x.co')).status, 200, 'Academy keeps the old behaviour until the migration');
    await a.call('/api/app/supervisors/add', { email: 'premig-sup@x.co' });
  });
});

test('a bare GET of the verify endpoint (an email scanner) cannot use up a token', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    await signup(env, 'scan@x.co');
    const [t] = box.tokens();
    const res = await handleApp(new Request(ORIGIN + '/api/app/email/verify?token=' + t), env, ctx);
    assert.notEqual(res.status, 200);
    assert.equal((await client(handleApp, env).call('/api/app/email/verify', { token: t })).status, 200, 'the token still works from the page');
  });
});

test('a completed password reset also confirms the email', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async () => { await signup(env, 'reset-verify@x.co'); });
  const id = await idOf(env, 'reset-verify@x.co');
  const token = 'reset-token-for-verify-0123456789';
  await env.DB.prepare('INSERT INTO password_resets (token_hash, learner_id, expires_at) VALUES (?,?,?)').bind(await sha256(token), id, Date.now() + 3600e3).run();
  assert.equal((await client(handleApp, env).call('/api/app/reset/complete', { token, password: 'A new password 123!' })).status, 200);
  assert.equal((await env.DB.prepare('SELECT email_status FROM learners WHERE id = ?').bind(id).first()).email_status, 'verified');
});

test('a supervisor invitation reads as from the learner, replies go to them, and the link carries no email', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const learner = await signup(env, 'reg@x.co', { firstName: 'Reza', lastName: 'Grant' });
    const r = await learner.call('/api/app/supervisors/add', { email: 'Consultant@NHS.net' });
    assert.equal(r.status, 200);
    assert.equal(r.body.emailed, true, 'the app is told the email really went');
    const mail = box.sent.find((m) => m.to[0].email_address.address === 'consultant@nhs.net');
    assert.ok(mail, 'invitation sent');
    assert.match(mail.from.name, /^Reza Grant via Wavelength$/);
    assert.equal(mail.from.address.endsWith('@thewavelength.co.uk'), true, 'sent from our own domain, so SPF, DKIM and DMARC align');
    assert.equal(mail.reply_to[0].address, 'reg@x.co');
    assert.match(mail.subject, /Reza Grant/);
    assert.doesNotMatch(mail.htmlbody + mail.textbody, /login=|consultant%40nhs\.net/i, 'no email address inside the link');
    assert.match(mail.textbody, /\/app\/#\/supervise\?invite=/);
    // Pressing resend straight away does not send a second email.
    const again = await learner.call('/api/app/supervisors/add', { email: 'consultant@nhs.net' });
    assert.equal(again.status, 200);
    assert.equal(again.body.recent, true);
    assert.equal(box.sent.filter((m) => m.to[0].email_address.address === 'consultant@nhs.net').length, 1);
  });
});

test('the app hears when an invitation email fails, and an active supervisor is not invited again', async () => {
  const env = makeEnv(MAIL);
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":"down"}', { status: 500 });
  try {
    const learner = await signup(env, 'fail@x.co');
    const r = await learner.call('/api/app/supervisors/add', { email: 'boss2@x.co' });
    assert.equal(r.status, 200);
    assert.equal(r.body.emailed, false);
  } finally { globalThis.fetch = real; }
  await withMailbox(async () => {
    const learner = await signup(env, 'linked@x.co');
    const sup = await signup(env, 'linkedsup@x.co');
    await learner.call('/api/app/supervisors/add', { email: 'linkedsup@x.co' });
    const id = (await env.DB.prepare("SELECT id FROM supervisor_links WHERE supervisor_email = 'linkedsup@x.co'").first()).id;
    await env.DB.prepare("UPDATE supervisor_links SET status = 'active' WHERE id = ?").bind(id).run();
    const again = await learner.call('/api/app/supervisors/add', { email: 'linkedsup@x.co' });
    assert.equal(again.status, 400);
    assert.equal((await env.DB.prepare('SELECT status FROM supervisor_links WHERE id = ?').bind(id).first()).status, 'active', 'still linked');
  });
});
