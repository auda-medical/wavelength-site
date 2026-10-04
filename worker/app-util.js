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
  return { id: l.id, email: l.email, title: l.title, firstName: l.first_name, lastName: l.last_name, name: fullName(l), role: l.role, organisation: l.organisation, newsletter: !!l.newsletter, declarationAt: l.declaration_at, profile: p };
}


export { LANGS, enc, SITE, HEAD, json, clip, EMAIL, TITLES, PATHWAYS, ALPHABET, b64, unb64, b64u, pbkdf2, hashPassword, checkPassword, sha256, token, code, SIGNED_FIELDS, canonical, contentHash, body, fullName, profileOf, cleanProfile, account };
