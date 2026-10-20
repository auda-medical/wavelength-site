// Request rate limits (plan sections 20 and 23).
//
// With a Workers rate-limiting binding (env.RATE_LIMIT, or a named one such as env.RATE_LIMIT_SEARCH), the binding's
// own limit applies: `await binding.limit({ key })` answers { success }. A binding has one fixed limit and period,
// set in wrangler.jsonc, so the `limit` passed here is used only by the fallback. Adding a binding is a wrangler.jsonc
// change that needs the owner's approval; configured in wrangler.jsonc from 20 Oct 2026 (RATE_LIMIT_AUTH, RATE_LIMIT_SEARCH).
// Without a binding: a fixed-window counter in D1 (rate_counters, migration 0013). Before 0013 is applied, or if D1
// fails, the request is allowed: a rate limit must never lock everyone out.
// IP addresses are never stored: the key is a short SHA-256 of the address.
import { sha256 } from './app-util.js';

export const LIMITS = {
  auth: { limit: 10, period: 60 },        // login, sign-up, password reset request, email verification resend, per IP
  search: { limit: 20, period: 60 },      // supervisor search, per account and per IP
};
export const TOO_MANY = 'Too many requests. Please wait a minute and try again.';

// The caller's IP as Cloudflare reports it. Absent outside Cloudflare (local tests), when IP limits are skipped.
export const clientIp = (req) => req.headers.get('CF-Connecting-IP') || '';
export const ipKey = async (ip) => (ip ? 'ip:' + (await sha256('ip:' + ip)).slice(0, 22) : '');

// { ok, source: 'binding' | 'd1' | 'none' }
export async function rateLimit(env, { scope, key, limit, period = 60, binding = 'RATE_LIMIT' }) {
  if (!key) return { ok: true, source: 'none' };
  const b = (binding && env[binding]) || env.RATE_LIMIT;
  const k = `${scope}:${key}`;
  if (b && typeof b.limit === 'function') {
    try { const r = await b.limit({ key: k }); return { ok: !!(r && r.success), source: 'binding' }; }
    catch { return { ok: true, source: 'none' }; }
  }
  if (!env.DB) return { ok: true, source: 'none' };
  const now = Date.now();
  const win = Math.floor(now / (period * 1000));
  try {
    const n = await env.DB.prepare('INSERT INTO rate_counters (bucket, n, expires_at) VALUES (?, 1, ?) ON CONFLICT (bucket) DO UPDATE SET n = n + 1 RETURNING n')
      .bind(`${k}:${win}`, (win + 1) * period * 1000).first('n');
    // Tidy expired windows now and then, so the table stays small.
    if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_counters WHERE expires_at < ?').bind(now).run();
    return { ok: Number(n) <= limit, source: 'd1' };
  } catch { return { ok: true, source: 'none' }; }
}

// Checks several keys (for example the account and the IP) and fails if any is over its limit.
export async function rateLimitAll(env, scope, keys, opts = {}) {
  const conf = { ...(LIMITS[scope] || { limit: 10, period: 60 }), ...opts };
  for (const key of keys.filter(Boolean)) {
    const r = await rateLimit(env, { scope, key, ...conf });
    if (!r.ok) return r;
  }
  return { ok: true };
}
