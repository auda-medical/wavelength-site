// Administrator accounts, sessions and two-step verification (migration 0017_admin_accounts.sql).
//
// Modes:
//   legacy   no active owner account with two-step yet (or migration 0017 not applied): the shared admin login works
//            exactly as before, and the first Owner account can be set up (bootstrap, which needs the Worker secret
//            ADMIN_BOOTSTRAP_CODE).
//   accounts an active Owner with two-step exists: only personal accounts sign in; the shared login and its cookie
//            are refused. The shared password stays in settings, unused, as the way in after a rollback.
// Every session lives in D1 and is checked on every request, so disabling an account, resetting its password or
// two-step, changing its role or "sign out everywhere" takes effect on the next request.
import {
  accountsConfigured, newToken, tokenId, hashAdminPassword, checkAdminPassword, sealSeed, openSeed, randomBytes,
  base32, verifyTotp, newRecoveryCodes, recoveryHash, normaliseRecovery, b64url, sha256Hex,
} from './crypto.js';
import { auditStmt } from '../audit.js';
import { rateLimit, clientIp, ipKey, LIMITS } from '../ratelimit.js';

export const COOKIE = '__Secure-wl_admin_session';
export const SESSION_HOURS = 12;
export const IDLE_MINUTES = 60;
const TOUCH_MINUTES = 5;
const STAGE_MINUTES = { two_step: 5, enrol: 30 };
export const ACTIVATION_HOURS = 72;
export const MAX_FAILURES = 10;
export const LOCK_MINUTES = 15;
const iso = (ms = Date.now()) => new Date(ms).toISOString();

// ---------- Mode ----------
// Per database (one isolate may serve several in tests): the table exists, and accounts have gone live. Both only ever
// change from false to true, so a true answer is cached.
const READY = new WeakMap(), LIVE = new WeakMap();
export async function accountsReady(env) {
  if (READY.get(env.DB)) return true;
  try { await env.DB.prepare('SELECT id FROM admin_accounts LIMIT 1').first(); READY.set(env.DB, true); return true; } catch { return false; }
}
// True once personal accounts are in force. Sticky: the first Owner to finish two-step set-up writes
// settings.admin_accounts_live, and from then on the shared login never comes back, even while an owner's password
// or two-step is being reset (emergency recovery). Before the flag existed, an active, enrolled Owner also counts.
export async function accountsLive(env) {
  if (LIVE.get(env.DB)) return true;
  if (!(await accountsReady(env))) return false;
  const flag = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_accounts_live'").first();
  const r = flag ? { n: 1 } : await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_accounts WHERE role = 'owner' AND status = 'active' AND totp_secret IS NOT NULL AND password_hash IS NOT NULL").first();
  const live = !!(r && r.n);
  if (live) LIVE.set(env.DB, true);
  return live;
}
export const accountCount = async (env) => (await accountsReady(env)) ? ((await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_accounts').first()) || {}).n || 0 : 0;

// ---------- Audit (actor: the account, never a typed name) ----------
export const actorOf = (account) => (account ? `acct${account.id}` : 'anonymous');
export function accountAudit(env, account, action, { subjectType = 'admin_account', subjectId = null, meta = {} } = {}) {
  return auditStmt(env, { actorType: 'admin', actorId: account ? `acct${account.id}` : 'anonymous', action, subjectType, subjectId, meta });
}

// ---------- Accounts ----------
export const USERNAME_RE = /^[a-z][a-z0-9._-]{2,39}$/;
export const getAccount = (env, id) => env.DB.prepare('SELECT * FROM admin_accounts WHERE id = ?').bind(Number(id) || 0).first();
export const byUsername = (env, u) => env.DB.prepare('SELECT * FROM admin_accounts WHERE username = ?').bind(String(u || '').trim().toLowerCase()).first();
export const listAccounts = async (env) => (await env.DB.prepare('SELECT * FROM admin_accounts ORDER BY id').all()).results || [];
export async function activeOwners(env, exceptId = 0) {
  return ((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_accounts WHERE role = 'owner' AND status = 'active' AND id <> ?").bind(exceptId).first()) || {}).n || 0;
}

export async function createAccount(env, { username, displayName, role, createdBy = null }) {
  const at = iso();
  const r = await env.DB.prepare("INSERT INTO admin_accounts (username, display_name, role, grants, status, created_at, created_by, updated_at) VALUES (?, ?, ?, '[]', 'pending', ?, ?, ?)")
    .bind(String(username).toLowerCase(), displayName, role, at, createdBy, at).run();
  return r.meta.last_row_id;
}

// A single-use activation link (first password, or a password reset). Earlier unused links for the account stop
// working. Returns the token, which is shown once and never stored.
export async function issueActivation(env, accountId, createdBy = null) {
  const token = newToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_tokens SET used_at = ? WHERE admin_id = ? AND used_at IS NULL").bind(iso(now), accountId),
    env.DB.prepare("INSERT INTO admin_tokens (id, admin_id, purpose, created_at, expires_at, created_by) VALUES (?, ?, 'activate', ?, ?, ?)")
      .bind(await tokenId(token), accountId, iso(now), iso(now + ACTIVATION_HOURS * 3600e3), createdBy),
  ]);
  return token;
}
// The account an unused, unexpired activation link belongs to (without using it up), or null.
export async function activationAccount(env, token) {
  if (!token || String(token).length > 100) return null;
  const t = await env.DB.prepare('SELECT * FROM admin_tokens WHERE id = ?').bind(await tokenId(token)).first();
  if (!t || t.used_at || t.expires_at < iso()) return null;
  const a = await getAccount(env, t.admin_id);
  return a && a.status !== 'disabled' ? a : null;
}
// Sets the password through an activation link: the link is used up in the same batch (a guarded update, so a link
// can be used once), every session of the account ends, and the failure counter clears.
export async function completeActivation(env, token, password) {
  const a = await activationAccount(env, token);
  if (!a) return null;
  const id = await tokenId(token), at = iso();
  const used = await env.DB.prepare('UPDATE admin_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(at, id).run();
  if (!(used.meta && used.meta.changes)) return null;
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_accounts SET password_hash = ?, password_changed_at = ?, failed_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
      .bind(await hashAdminPassword(env, password), at, at, a.id),
    env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').bind(a.id),
    accountAudit(env, a, 'admin.password_set', { subjectId: a.id, meta: { via: 'activation' } }),
  ]);
  return getAccount(env, a.id);
}

export async function changePassword(env, account, password, keepSessionId = '') {
  const at = iso();
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_accounts SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?').bind(await hashAdminPassword(env, password), at, at, account.id),
    env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id <> ?').bind(account.id, keepSessionId),
    accountAudit(env, account, 'admin.password_change', { subjectId: account.id }),
  ]);
}

// ---------- Sessions ----------
export const revokeSessions = (env, accountId) => env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').bind(accountId);

export async function createSession(env, req, accountId, stage) {
  const token = newToken(), csrf = b64url(randomBytes(24)), now = Date.now();
  const expires = now + (STAGE_MINUTES[stage] ? STAGE_MINUTES[stage] * 60e3 : SESSION_HOURS * 3600e3);
  const ip = clientIp(req);
  await env.DB.prepare('INSERT INTO admin_sessions (id, admin_id, stage, csrf, created_at, expires_at, last_seen_at, reauth_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(await tokenId(token), accountId, stage, csrf, iso(now), iso(expires), iso(now), stage === 'full' ? iso(now) : null, ip ? (await sha256Hex('ip:' + ip)).slice(0, 22) : null).run();
  return { token, csrf, cookie: `${COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}` };
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const cookieToken = (req) => {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)__Secure-wl_admin_session=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : '';
};
// { session, account } for a valid session, or null. Expired and idle sessions are deleted. "last active" is written
// at most once every five minutes (D1 free-tier writes).
export async function readSession(env, req) {
  const token = cookieToken(req);
  if (!token) return null;
  const id = await tokenId(token);
  const s = await env.DB.prepare('SELECT * FROM admin_sessions WHERE id = ?').bind(id).first();
  if (!s) return null;
  const now = Date.now();
  if (s.expires_at < iso(now) || (s.stage === 'full' && Date.parse(s.last_seen_at) + IDLE_MINUTES * 60e3 < now)) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(id).run();
    return null;
  }
  const account = await getAccount(env, s.admin_id);
  if (!account || account.status === 'disabled') { await revokeSessions(env, s.admin_id).run(); return null; }
  if (Date.parse(s.last_seen_at) + TOUCH_MINUTES * 60e3 < now) await env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').bind(iso(now), id).run();
  return { session: s, account };
}
export async function upgradeSession(env, sessionId, stage, { reauth = false } = {}) {
  const now = Date.now();
  await env.DB.prepare('UPDATE admin_sessions SET stage = ?, expires_at = ?, last_seen_at = ?, reauth_at = CASE WHEN ? THEN ? ELSE reauth_at END WHERE id = ?')
    .bind(stage, iso(now + SESSION_HOURS * 3600e3), iso(now), reauth ? 1 : 0, iso(now), sessionId).run();
}
export const markReauth = (env, sessionId) => env.DB.prepare('UPDATE admin_sessions SET reauth_at = ? WHERE id = ?').bind(iso(), sessionId).run();
export const listSessions = async (env, accountId) => (await env.DB.prepare('SELECT id, stage, created_at, last_seen_at, expires_at FROM admin_sessions WHERE admin_id = ? ORDER BY created_at DESC').bind(accountId).all()).results || [];

// ---------- Failures and lock-out ----------
const isLocked = (a) => !!(a && a.locked_until && a.locked_until > iso());
// Every failed step writes the same two statements, whether or not the account exists, is disabled or is locked, so
// the time a refusal takes does not reveal which usernames exist. Only a live, unlocked account's counter moves.
async function recordFailure(env, a, what) {
  const counts = !!(a && a.status !== 'disabled' && !isLocked(a));
  const failed = counts ? (a.failed_count || 0) + 1 : 0;
  const lock = counts && failed >= MAX_FAILURES;
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_accounts SET failed_count = ?, locked_until = ? WHERE id = ? AND ?')
      .bind(lock ? 0 : failed, lock ? iso(Date.now() + LOCK_MINUTES * 60e3) : (a && a.locked_until) || null, a ? a.id : -1, counts ? 1 : 0),
    accountAudit(env, a, lock ? 'admin.locked' : 'admin.sign_in_failed', { subjectId: a ? a.id : null, meta: { step: what } }),
  ]);
}
const clearFailures = (env, a) => env.DB.prepare('UPDATE admin_accounts SET failed_count = 0, locked_until = NULL WHERE id = ?').bind(a.id);

// Network-address limit for every sign-in step (worker/ratelimit.js; the address itself is never stored).
export async function signInAllowed(env, req) {
  const r = await rateLimit(env, { scope: 'admin_signin', key: await ipKey(clientIp(req)), limit: LIMITS.auth.limit, period: LIMITS.auth.period });
  return r.ok;
}

// Password step. Returns { ok, account, reason }. The same answer for an unknown username, a wrong password, a
// disabled or locked account, so nothing reveals which usernames exist.
export async function checkPasswordStep(env, username, password) {
  const a = await byUsername(env, username);
  const good = await checkAdminPassword(env, String(password || '').slice(0, 200), a && a.password_hash);
  if (!a || a.status === 'disabled' || isLocked(a) || !a.password_hash || !good) { await recordFailure(env, a, 'password'); return { ok: false }; }
  return { ok: true, account: a };
}

// ---------- Two-step verification ----------
export const enrolled = (a) => !!(a && a.totp_secret);
// Starts (or restarts) enrolment: a new seed, sealed, kept apart until a code from it is confirmed.
export async function beginEnrolment(env, account) {
  const seed = randomBytes(20);
  await env.DB.prepare('UPDATE admin_accounts SET totp_pending = ? WHERE id = ?').bind(await sealSeed(env, seed, account.id), account.id).run();
  return base32(seed);
}
export async function pendingSecret(env, account) {
  const seed = account.totp_pending ? await openSeed(env, account.totp_pending, account.id) : null;
  return seed ? base32(seed) : '';
}
// Confirms enrolment with one valid code from the pending seed. Returns the recovery codes (shown once) or null.
export async function finishEnrolment(env, account, code) {
  const seed = account.totp_pending ? await openSeed(env, account.totp_pending, account.id) : null;
  if (!seed) return null;
  const step = await verifyTotp(seed, code, { lastStep: 0 });
  if (!step) { await recordFailure(env, account, 'enrol'); return null; }
  const codes = newRecoveryCodes();
  const at = iso();
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_accounts SET totp_secret = totp_pending, totp_pending = NULL, totp_enrolled_at = ?, totp_last_step = ?, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END, failed_count = 0, locked_until = NULL, updated_at = ? WHERE id = ? AND totp_pending IS NOT NULL")
      .bind(at, step, at, account.id),
    // The first Owner with two-step ends the shared login for good (see accountsLive).
    ...(account.role === 'owner' ? [env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_accounts_live', ?)").bind(at)] : []),
    env.DB.prepare('DELETE FROM admin_recovery_codes WHERE admin_id = ?').bind(account.id),
    ...(await Promise.all(codes.map(async (c) => env.DB.prepare('INSERT INTO admin_recovery_codes (admin_id, code_hash, created_at) VALUES (?, ?, ?)').bind(account.id, await recoveryHash(env, account.id, c), at)))),
    accountAudit(env, account, 'admin.two_step_enrolled', { subjectId: account.id, meta: { recoveryCodes: codes.length } }),
  ]);
  return codes;
}
// Checks an authenticator code (never the same time step twice: a guarded update records the step) or a recovery
// code (used once). Returns 'code', 'recovery' or ''.
export async function checkSecondFactor(env, account, input) {
  if (isLocked(account) || !account.totp_secret) return '';
  const raw = String(input || '').trim();
  if (/^\d{3}\s?\d{3}$/.test(raw)) {
    const seed = await openSeed(env, account.totp_secret, account.id);
    const step = seed ? await verifyTotp(seed, raw, { lastStep: account.totp_last_step || 0 }) : 0;
    if (step) {
      const r = await env.DB.prepare('UPDATE admin_accounts SET totp_last_step = ? WHERE id = ? AND totp_last_step < ?').bind(step, account.id, step).run();
      if (r.meta && r.meta.changes) { await clearFailures(env, account).run(); return 'code'; }
    }
  } else if (normaliseRecovery(raw).length === 10) {
    const r = await env.DB.prepare('UPDATE admin_recovery_codes SET used_at = ? WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL')
      .bind(iso(), account.id, await recoveryHash(env, account.id, raw)).run();
    if (r.meta && r.meta.changes) {
      await env.DB.batch([clearFailures(env, account), accountAudit(env, account, 'admin.recovery_code_used', { subjectId: account.id })]);
      return 'recovery';
    }
  }
  await recordFailure(env, account, 'two_step');
  return '';
}
export const recoveryLeft = async (env, accountId) => ((await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE admin_id = ? AND used_at IS NULL').bind(accountId).first()) || {}).n || 0;

// Ends every unused activation link of an account (disable, and before issuing a new one).
export const revokeLinks = (env, accountId) => env.DB.prepare('UPDATE admin_tokens SET used_at = ? WHERE admin_id = ? AND used_at IS NULL').bind(iso(), accountId);

// ---------- Owner actions on another account ----------
// Each returns the statements for one batch: the change, the session revocation where needed, and the audit entry.
export function resetTwoStepStmts(env, owner, target) {
  return [
    env.DB.prepare('UPDATE admin_accounts SET totp_secret = NULL, totp_pending = NULL, totp_enrolled_at = NULL, totp_last_step = 0, updated_at = ? WHERE id = ?').bind(iso(), target.id),
    env.DB.prepare('DELETE FROM admin_recovery_codes WHERE admin_id = ?').bind(target.id),
    revokeSessions(env, target.id),
    accountAudit(env, owner, 'admin.two_step_reset', { subjectId: target.id }),
  ];
}
export { accountsConfigured };
