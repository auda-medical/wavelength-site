// Shared helpers for the Wavelength app API (worker/app.js, worker/supervise.js).
import LOGBOOK from '../data/logbook.json';
const enc = new TextEncoder();
const SITE = 'https://thewavelength.co.uk';
const HEAD = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEAD, ...extra } });
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLES = ['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx'];
const PATHWAYS = LOGBOOK.pathways.map((p) => p.id);
const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------- Crypto helpers ----------
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64u = (buf) => b64(buf).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
async function pbkdf2(password, salt, iterations) {
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, k, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${b64(salt)}$${await pbkdf2(password, salt, 100000)}`;
}
async function checkPassword(password, stored) {
  if (!stored) return false;
  const [, it, salt, hash] = stored.split('$');
  const got = await pbkdf2(password, unb64(salt), Number(it));
  let d = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) d |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return d === 0;
}
const sha256 = async (text) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const token = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
function code(prefix) {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

// The parts of an entry a supervisor signs. Editing any of these after sign-off voids the sign-off.
const SIGNED_FIELDS = ['type', 'date', 'setting', 'age', 'sex', 'indication', 'findings', 'overall', 'quality', 'interpretation', 'confirmation', 'concordant', 'impact', 'supervision', 'supervisor', 'reflection'];
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v == null ? null : v);
}
const contentHash = (d) => sha256(canonical(Object.fromEntries(SIGNED_FIELDS.map((k) => [k, d[k] == null ? null : d[k]]))));
// Media fingerprints: the app stores a SHA-256 of each image and clip when it is saved, as media: [{ id, sha256, kind }]
// (fingerprints only; the files never leave the phone). Sign-offs made after migration 0012 hash them too (hash
// version 2), so replacing an image after sign-off voids it. Older sign-offs keep their version 1 hash and are not
// voided by this change. Limitation: the fingerprint is computed on the learner's own phone, so it catches accidental
// or casual changes, not a determined learner who controls the device.
const HEX64 = /^[a-f0-9]{64}$/;
function mediaOf(d) {
  return (Array.isArray(d && d.media) ? d.media : []).slice(0, 24)
    .map((m) => ({ id: clip(m && m.id, 40), sha256: HEX64.test(String(m && m.sha256 || '')) ? m.sha256 : null, kind: m && m.kind === 'clip' ? 'clip' : 'image' }))
    .filter((m) => m.id && m.sha256);
}
const contentHashV2 = (d) => sha256(canonical({ ...Object.fromEntries(SIGNED_FIELDS.map((k) => [k, d[k] == null ? null : d[k]])), media: mediaOf(d).map((m) => m.sha256).sort() }));
const hashFor = (d, version) => (version === 2 ? contentHashV2(d) : contentHash(d));

// ---------- Request helpers ----------
async function body(req) {
  if (!(req.headers.get('Content-Type') || '').includes('application/json')) return null;
  const text = await req.text();
  if (text.length > 600000) return null;
  try { return JSON.parse(text); } catch { return null; }
}
const fullName = (l) => [l.title, l.first_name, l.last_name].filter(Boolean).join(' ');
function profileOf(l) { try { return JSON.parse(l.profile || '{}'); } catch { return {}; } }
function cleanProfile(p, old = {}) {
  const out = { ...old };
  if (Array.isArray(p.pathways)) out.pathways = p.pathways.filter((x) => PATHWAYS.includes(x)).slice(0, 9);
  if (p.grade !== undefined) out.grade = clip(p.grade, 80);
  if (p.specialty !== undefined) out.specialty = clip(p.specialty, 80);
  if (p.base !== undefined) out.base = clip(p.base, 120);
  if (p.registration !== undefined) out.registration = clip(p.registration, 40);
  if (p.targets && typeof p.targets === 'object') {
    out.targets = {};
    for (const [k, v] of Object.entries(p.targets).slice(0, 160)) {
      if (!/^[a-z0-9-]{1,40}$/.test(k) || !v || typeof v !== 'object') continue;
      const n = (x) => (x === '' || x == null ? null : Math.max(0, Math.min(999, Math.round(Number(x)) || 0)));
      out.targets[k] = { total: n(v.total), supervised: n(v.supervised), label: clip(v.label, 60) || undefined, types: Array.isArray(v.types) ? v.types.map((t) => clip(t, 20)).slice(0, 10) : undefined };
    }
  }
  if (p.windowStart && typeof p.windowStart === 'object') {
    out.windowStart = {};
    for (const [k, v] of Object.entries(p.windowStart).slice(0, 10)) if (PATHWAYS.includes(k) && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.windowStart[k] = v;
  }
  if (p.onboarded) out.onboarded = true;
  if (p.notifyEmail !== undefined) out.notifyEmail = !!p.notifyEmail;
  if (p.lang !== undefined) out.lang = LANGS.includes(p.lang) ? p.lang : 'en';
  if (p.supervisor !== undefined) out.supervisor = !!p.supervisor;
  return out;
}
function account(l) {
  const p = profileOf(l);
  return { id: l.id, email: l.email, title: l.title, firstName: l.first_name, lastName: l.last_name, name: fullName(l), role: l.role, organisation: l.organisation, newsletter: !!l.newsletter, declarationAt: l.declaration_at, profile: p, emailStatus: l.email_status || 'legacy_unverified', emailVerified: l.email_status === 'verified' };
}

// True once migration 0011 (verification) is applied. Until then the Worker keeps the old behaviour for email,
// sign-off and assessment flows, and the professional verification endpoints answer "not available yet".
// Cached per database binding: a positive answer for the life of the isolate, a negative one for a minute.
const READY = new WeakMap();
async function verificationReady(env) {
  if (!env || !env.DB) return false;
  const c = READY.get(env.DB);
  if (c && (c.ok || Date.now() - c.at < 60e3)) return c.ok;
  let ok = true;
  try { await env.DB.prepare('SELECT email_status FROM learners LIMIT 0').all(); await env.DB.prepare('SELECT supervisor_snapshot FROM signoffs LIMIT 0').all(); await env.DB.prepare('SELECT token_hash FROM email_tokens LIMIT 0').all(); }
  catch { ok = false; }
  READY.set(env.DB, { ok, at: Date.now() });
  return ok;
}
// True once migration 0012 (supervisor lifecycle) is applied, on top of 0011. Same caching as verificationReady.
const LIFE = new WeakMap();
async function lifecycleReady(env) {
  if (!(await verificationReady(env))) return false;
  const c = LIFE.get(env.DB);
  if (c && (c.ok || Date.now() - c.at < 60e3)) return c.ok;
  let ok = true;
  try { await env.DB.prepare('SELECT id FROM supervisor_applications LIMIT 0').all(); await env.DB.prepare('SELECT key FROM notification_log LIMIT 0').all(); await env.DB.prepare('SELECT test_account FROM learners LIMIT 0').all(); await env.DB.prepare('SELECT returned_at FROM signoffs LIMIT 0').all(); }
  catch { ok = false; }
  LIFE.set(env.DB, { ok, at: Date.now() });
  return ok;
}

// How the signer signed: 'typed' (their name typed, rendered as an image) or 'drawn' (finger or mouse). Anything else,
// including no value from an older app build, counts as drawn. The signature image itself is stored either way.
const sigKind = (d) => (d && d.signatureKind === 'typed' ? 'typed' : 'drawn');
// Sign-offs keep the kind inside their ratings JSON under this key (entry ids never start with $), so no column is needed.
const SIG_KEY = '$signatureKind';
function withSigKind(ratings, kind) { const r = { ...(ratings && typeof ratings === 'object' && !Array.isArray(ratings) ? ratings : {}) }; delete r[SIG_KEY]; r[SIG_KEY] = kind; return r; }
function splitSigKind(json) { let r = {}; try { r = JSON.parse(json || '{}') || {}; } catch { r = {}; } const kind = r[SIG_KEY] === 'typed' ? 'typed' : 'drawn'; delete r[SIG_KEY]; return { ratings: r, signatureKind: kind }; }

export { sigKind, SIG_KEY, withSigKind, splitSigKind, LANGS, enc, SITE, HEAD, json, clip, EMAIL, TITLES, PATHWAYS, ALPHABET, b64, unb64, b64u, pbkdf2, hashPassword, checkPassword, sha256, token, code, SIGNED_FIELDS, canonical, contentHash, contentHashV2, hashFor, mediaOf, body, fullName, profileOf, cleanProfile, account, verificationReady, lifecycleReady };
