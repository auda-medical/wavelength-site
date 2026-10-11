// Cryptography for administrator accounts (native accounts, October 2026). Web Crypto only, so it runs the same in
// Workers and in Node tests.
//
// Two Worker secrets, set by the owner with `wrangler secret put` and never written anywhere else:
//   ADMIN_PEPPER    mixed into every administrator password hash (HMAC-SHA-256 before PBKDF2), so a copy of the
//                   database alone is not enough to test password guesses;
//   ADMIN_TOTP_KEY  32 random bytes, base64: encrypts authenticator seeds at rest (AES-256-GCM).
// Without both, accounts cannot be used (fail closed; see accountsConfigured).
const enc = new TextEncoder();

export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (buf) => b64(buf).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export async function sha256Hex(text) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(String(text)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Single-use tokens (activation links, session IDs): 32 random bytes shown once; only their SHA-256 is stored.
export const newToken = () => b64url(randomBytes(32));
export const tokenId = (token) => sha256Hex('admin-token:' + token);

export function accountsConfigured(env) {
  if (!env || !env.ADMIN_PEPPER || String(env.ADMIN_PEPPER).length < 16) return false;
  try { return unb64(String(env.ADMIN_TOTP_KEY || '')).length === 32; } catch { return false; }
}

// Constant-time comparison of two strings of the same kind (hex digests, codes).
export function sameString(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

// ---------- Passwords ----------
// PBKDF2-SHA-256 with 100,000 iterations (the most the Workers runtime allows) over HMAC-SHA-256(pepper, password).
// Stored as "apbkdf2$100000$<salt>$<hash>". Nothing about the password can be recovered from it.
export const ITERATIONS = 100000;
async function peppered(env, password) {
  const k = await crypto.subtle.importKey('raw', enc.encode(String(env.ADMIN_PEPPER)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(String(password))));
}
async function pbkdf2(bytes, salt, iterations) {
  const k = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, k, 256));
}
export async function hashAdminPassword(env, password) {
  const salt = randomBytes(16);
  return `apbkdf2$${ITERATIONS}$${b64(salt)}$${await pbkdf2(await peppered(env, password), salt, ITERATIONS)}`;
}
// A stored hash to compare against when the username is unknown, so a wrong username costs the same time.
const DUMMY = 'apbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
export async function checkAdminPassword(env, password, stored) {
  const [kind, it, salt, hash] = String(stored || DUMMY).split('$');
  if (kind !== 'apbkdf2' || !salt || !hash) return false;
  const got = await pbkdf2(await peppered(env, password), unb64(salt), Number(it) || ITERATIONS);
  return sameString(got, hash) && !!stored;
}
export const ADMIN_PASSWORD_MIN = 12;
export function adminPasswordProblem(password, { username = '', name = '' } = {}) {
  const pw = String(password || '');
  if (pw.length < ADMIN_PASSWORD_MIN) return `Use at least ${ADMIN_PASSWORD_MIN} characters. A short phrase of several words works well.`;
  if (pw.length > 200) return 'Use at most 200 characters.';
  const low = pw.toLowerCase();
  if (username && low.includes(String(username).toLowerCase())) return 'Do not include your username in your password.';
  for (const part of String(name || '').toLowerCase().split(/\s+/).filter((x) => x.length >= 3)) if (low.includes(part)) return 'Do not include your name in your password.';
  if (/^(.)\1+$/.test(pw)) return 'Choose a password that is not one repeated character.';
  return '';
}

// ---------- Authenticator seeds at rest (AES-256-GCM with ADMIN_TOTP_KEY) ----------
async function seedKey(env) {
  return crypto.subtle.importKey('raw', unb64(String(env.ADMIN_TOTP_KEY)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealSeed(env, seed, accountId) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('admin-totp:' + accountId) }, await seedKey(env), seed);
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function openSeed(env, sealed, accountId) {
  const [v, iv, ct] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !ct) return null;
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode('admin-totp:' + accountId) }, await seedKey(env), unb64(ct)));
  } catch { return null; }
}

// ---------- TOTP (RFC 6238: SHA-1, 6 digits, 30 seconds; what every authenticator app supports) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function fromBase32(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
export const STEP = 30;
export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
export async function hotp(seed, counter) {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const k = await crypto.subtle.importKey('raw', seed, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
// The accepted time step for a code, allowing one step either side for clock drift, and never a step at or before
// `lastStep` (a code is used once). Returns the step or 0.
export async function verifyTotp(seed, code, { now = Date.now(), lastStep = 0, window = 1 } = {}) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return 0;
  const t = stepAt(now);
  let found = 0;
  for (let s = t - window; s <= t + window; s++) if (s > lastStep && sameString(await hotp(seed, s), c)) found = s;
  return found;
}
export const otpauthUrl = ({ issuer = 'Wavelength', account, secret }) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

// ---------- Recovery codes: ten single-use codes shown once; only salted hashes stored ----------
const RC = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = [...b].map((x) => RC[x % RC.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
export const normaliseRecovery = (code) => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Keyed with the pepper (HMAC-SHA-256), so a copy of the database alone cannot be searched for the codes.
export async function recoveryHash(env, accountId, code) {
  const k = await crypto.subtle.importKey('raw', enc.encode(String(env.ADMIN_PEPPER)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', k, enc.encode(`admin-recovery:${accountId}:${normaliseRecovery(code)}`)));
}
