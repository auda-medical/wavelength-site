// Trusted browsers for the admin console (migration 0019_admin_trusted_browsers.sql, November 2026).
//
// After the password and a two-step code, an administrator may tick "Trust this browser for 30 days". The browser
// then gets its own cookie, __Host-wl_admin_trust (HttpOnly, Secure, SameSite=Strict, Path=/, 30 days), holding 32
// random bytes; D1 keeps only the SHA-256 of that token, bound to the account, with a short label from the User-Agent.
// In a trusted browser the sign-in still needs the password and still respects the per-address limit and the account
// lock-out (the password step runs first and unchanged); only the code step is skipped. Owner security pages still
// ask for a fresh code (re-authentication), whatever the browser.
//
// Trust holds only for the account it was issued for. An unknown or expired token is ignored (the code is asked for)
// and its cookie cleared. Every trusted browser of an account is forgotten on a password change or reset, a two-step
// reset or new authenticator, and when the account is disabled; the account page lists them, with "Forget this
// browser" and "Forget all browsers". At most ten per account: the oldest goes. Before migration 0019 is applied,
// nothing here is offered and nothing breaks.
import { newToken, sha256Hex } from './crypto.js';
import { auditStmt } from '../audit.js';

export const TRUST_COOKIE = '__Host-wl_admin_trust';
export const TRUST_DAYS = 30;
export const TRUST_MAX = 10;
const iso = (ms = Date.now()) => new Date(ms).toISOString();

// Per database, like accountsReady: the table exists. Only ever changes from false to true, so true is cached.
const READY = new WeakMap();
export async function trustReady(env) {
  if (READY.get(env.DB)) return true;
  try { await env.DB.prepare('SELECT id FROM admin_trusted_browsers LIMIT 1').first(); READY.set(env.DB, true); return true; } catch { return false; }
}

export const trustHash = (token) => sha256Hex('admin-trust:' + token);
export const trustCookie = (token) => `${TRUST_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TRUST_DAYS * 86400}`;
export const clearTrustCookie = () => `${TRUST_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
const cookieToken = (req) => {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-wl_admin_trust=([A-Za-z0-9_-]{40,100})(?:;|$)/);
  return m ? m[1] : '';
};
export const hasTrustCookie = (req) => /(?:^|;\s*)__Host-wl_admin_trust=/.test(req.headers.get('Cookie') || '');
// The hash of this browser's trust token, or '' (no cookie).
export const currentTrustHash = async (req) => { const t = cookieToken(req); return t ? trustHash(t) : ''; };

// "Chrome on Windows": browser and system only, never the raw User-Agent (it is not stored).
export function browserLabel(ua) {
  const s = String(ua || '').slice(0, 512);
  const browser = /\bEdg(?:e|A|iOS)?\//.test(s) ? 'Edge'
    : /\bOPR\/|\bOpera\b/.test(s) ? 'Opera'
      : /\bSamsungBrowser\//.test(s) ? 'Samsung Internet'
        : /\bFirefox\/|\bFxiOS\//.test(s) ? 'Firefox'
          : /\bChrome\/|\bCriOS\//.test(s) ? 'Chrome'
            : /\bSafari\//.test(s) && /\bVersion\//.test(s) ? 'Safari' : '';
  const os = /\biPad\b/.test(s) ? 'iPad'
    : /\biPhone\b|\biPod\b/.test(s) ? 'iPhone'
      : /\bAndroid\b/.test(s) ? 'Android'
        : /\bCrOS\b/.test(s) ? 'ChromeOS'
          : /\bWindows\b/.test(s) ? 'Windows'
            : /\bMacintosh\b|\bMac OS X\b/.test(s) ? 'Mac'
              : /\bLinux\b/.test(s) ? 'Linux' : '';
  const label = browser && os ? `${browser} on ${os}` : browser || (os ? `Browser on ${os}` : 'Unknown browser');
  return label.slice(0, 60);
}

const trustAudit = (env, actor, action, subjectId, meta = {}, ifChanged = false) =>
  auditStmt(env, { actorType: 'admin', actorId: actor ? `acct${actor.id}` : 'anonymous', action, subjectType: 'admin_account', subjectId, meta }, { ifChanged });

// Statements that forget every trusted browser of an account, with an audit row written only when one was forgotten.
// [] before migration 0019, so callers can always spread them into their batch.
export async function revokeTrustStmts(env, actor, accountId, reason) {
  if (!(await trustReady(env))) return [];
  return [
    env.DB.prepare('DELETE FROM admin_trusted_browsers WHERE admin_id = ?').bind(accountId),
    trustAudit(env, actor, 'admin.trust_revoked', accountId, { reason }, true),
  ];
}

// Trusts this browser for the account (after a correct password and code). Replaces any token this browser already
// held, drops the account's expired entries and keeps the newest TRUST_MAX. Returns the Set-Cookie value, or '' before
// migration 0019.
export async function grantTrust(env, req, account) {
  if (!(await trustReady(env))) return '';
  const token = newToken(); // 32 bytes from crypto.getRandomValues
  const now = Date.now();
  const stmts = [];
  const oldHash = await currentTrustHash(req);
  if (oldHash) {
    const old = await env.DB.prepare('SELECT admin_id FROM admin_trusted_browsers WHERE token_hash = ?').bind(oldHash).first();
    if (old) stmts.push(env.DB.prepare('DELETE FROM admin_trusted_browsers WHERE token_hash = ?').bind(oldHash), trustAudit(env, account, 'admin.trust_revoked', old.admin_id, { reason: 'replaced' }, true));
  }
  stmts.push(
    env.DB.prepare('DELETE FROM admin_trusted_browsers WHERE admin_id = ? AND expires_at <= ?').bind(account.id, iso(now)),
    env.DB.prepare('INSERT INTO admin_trusted_browsers (token_hash, admin_id, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await trustHash(token), account.id, browserLabel(req.headers.get('User-Agent')), iso(now), iso(now + TRUST_DAYS * 86400e3)),
    trustAudit(env, account, 'admin.trust_granted', account.id, { days: TRUST_DAYS }),
    env.DB.prepare('DELETE FROM admin_trusted_browsers WHERE admin_id = ? AND id NOT IN (SELECT id FROM admin_trusted_browsers WHERE admin_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)')
      .bind(account.id, account.id, TRUST_MAX),
    trustAudit(env, account, 'admin.trust_revoked', account.id, { reason: 'limit', limit: TRUST_MAX }, true),
  );
  await env.DB.batch(stmts);
  return trustCookie(token);
}

// Does this browser's cookie trust this account right now? { trusted, row, clear }: clear is true when the cookie is
// unknown or expired (a stale cookie to remove). A token issued for another account is ignored but left alone: it
// still belongs to that account in this browser.
export async function checkTrust(env, req, account) {
  const token = cookieToken(req);
  if (!token) return { trusted: false, clear: hasTrustCookie(req) };
  if (!(await trustReady(env))) return { trusted: false, clear: false };
  const hash = await trustHash(token);
  const row = await env.DB.prepare('SELECT * FROM admin_trusted_browsers WHERE token_hash = ?').bind(hash).first();
  if (!row) return { trusted: false, clear: true };
  if (row.expires_at <= iso()) {
    await env.DB.prepare('DELETE FROM admin_trusted_browsers WHERE id = ?').bind(row.id).run();
    return { trusted: false, clear: true };
  }
  if (!account || row.admin_id !== account.id) return { trusted: false, clear: false };
  return { trusted: true, row, clear: false };
}
// Statements recording a sign-in that used this trusted browser.
export const useTrustStmts = (env, account, row) => [
  env.DB.prepare('UPDATE admin_trusted_browsers SET last_used_at = ? WHERE id = ?').bind(iso(), row.id),
  trustAudit(env, account, 'admin.trust_used', account.id),
];

// The account's trusted browsers (unexpired), newest first, each marked when it is this browser.
export async function listTrusted(env, req, accountId) {
  if (!(await trustReady(env))) return null;
  const mine = await currentTrustHash(req);
  const rows = (await env.DB.prepare('SELECT id, token_hash, label, created_at, last_used_at, expires_at FROM admin_trusted_browsers WHERE admin_id = ? AND expires_at > ? ORDER BY created_at DESC, id DESC').bind(accountId, iso()).all()).results || [];
  return rows.map(({ token_hash, ...r }) => ({ ...r, current: !!mine && token_hash === mine }));
}

// Forgets one trusted browser of the account. Returns { forgotten, current } (current: it was this browser).
export async function forgetTrusted(env, req, account, id) {
  if (!(await trustReady(env))) return { forgotten: false, current: false };
  const row = await env.DB.prepare('SELECT id, token_hash FROM admin_trusted_browsers WHERE id = ? AND admin_id = ?').bind(Number(id) || 0, account.id).first();
  if (!row) return { forgotten: false, current: false };
  const r = await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_trusted_browsers WHERE id = ? AND admin_id = ?').bind(row.id, account.id),
    trustAudit(env, account, 'admin.trust_revoked', account.id, { reason: 'forget' }, true),
  ]);
  return { forgotten: !!(r[0] && r[0].meta && r[0].meta.changes), current: row.token_hash === (await currentTrustHash(req)) };
}
