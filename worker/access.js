// Administrator identity through Cloudflare Access (plan section 22).
//
// Runs only when both Worker vars ACCESS_TEAM_DOMAIN (for example "wavelength.cloudflareaccess.com") and ACCESS_AUD
// (the Access application's audience tag) are set; they are not in wrangler.jsonc and are added by the owner after
// setting up Access. Then every /volunteer/admin/* request must carry a valid Cf-Access-Jwt-Assertion: RS256, signed
// by one of the team's current keys (fetched from <team>/cdn-cgi/access/certs and cached for an hour), with this
// audience, this issuer and an expiry in the future. The email in the token is the admin's identity and becomes the
// actor in audit events. The existing admin password login stays as a second check.
//
// Roles, kept in D1 settings under key 'admin_roles' as JSON { "email": ["verifier", ...] }, are enforced only while
// Access is on:
//   owner       everything, including volunteers, faculty, departments, passwords and role changes
//   verifier    supervisor verification and organisations
//   academy     Academy learners, certificates and exports
//   newsletter  the newsletter page
// While no admin_roles setting exists, every person the Access policy lets in is treated as owner (the Access policy
// is then the only list), so switching Access on can never lock the owner out. Once the setting exists, an email that
// is not in it has no roles.
// With Access off, behaviour is exactly as before: one shared admin login, and the typed reviewer name.
const enc = new TextEncoder();
export const ROLES = ['owner', 'verifier', 'academy', 'newsletter'];
const KEY_TTL = 3600e3, REFETCH_GAP = 60e3, LEEWAY = 60;

export const accessOn = (env) => !!(env && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
export function issuerOf(env) {
  const d = String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${d}`;
}

const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const parse = (s) => JSON.parse(new TextDecoder().decode(unb64u(s)));

// Signing keys per issuer: { at, keys: Map(kid -> CryptoKey) }.
const KEYS = new Map();
export function clearKeyCache() { KEYS.clear(); }
async function loadKeys(issuer) {
  const res = await fetch(`${issuer}/cdn-cgi/access/certs`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('certs ' + res.status);
  const body = await res.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    try { keys.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])); } catch { /* skip a key we cannot read */ }
  }
  const entry = { at: Date.now(), keys };
  KEYS.set(issuer, entry);
  return entry;
}
async function keyFor(issuer, kid) {
  let entry = KEYS.get(issuer);
  if (!entry || Date.now() - entry.at > KEY_TTL) entry = await loadKeys(issuer);
  // A key rotation: fetch again, but not more than once a minute.
  if (!entry.keys.has(kid) && Date.now() - entry.at > REFETCH_GAP) entry = await loadKeys(issuer);
  return entry.keys.get(kid) || null;
}

// Verifies a token. Returns { ok: true, email, sub } or { ok: false, reason }.
export async function verifyAccessJwt(env, token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  let head, claims;
  try { head = parse(parts[0]); claims = parse(parts[1]); } catch { return { ok: false, reason: 'malformed' }; }
  if (head.alg !== 'RS256' || !head.kid) return { ok: false, reason: 'alg' };
  const issuer = issuerOf(env);
  let key;
  try { key = await keyFor(issuer, head.kid); } catch { return { ok: false, reason: 'certs' }; }
  if (!key) return { ok: false, reason: 'kid' };
  let good = false;
  try { good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`)); } catch { good = false; }
  if (!good) return { ok: false, reason: 'signature' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(env.ACCESS_AUD)) return { ok: false, reason: 'audience' };
  if (claims.iss !== issuer) return { ok: false, reason: 'issuer' };
  const t = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + LEEWAY < t) return { ok: false, reason: 'expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY > t) return { ok: false, reason: 'not_yet' };
  const email = String(claims.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'email' };
  return { ok: true, email, sub: claims.sub || null };
}

// Roles for an email from settings.admin_roles. null map: no setting yet (everyone Access admits is owner).
export function rolesFor(settingValue, email) {
  if (settingValue == null || settingValue === '') return ['owner'];
  let map;
  try { map = JSON.parse(settingValue); } catch { return []; }
  if (!map || typeof map !== 'object') return [];
  const found = Object.entries(map).find(([k]) => String(k).trim().toLowerCase() === email);
  return found && Array.isArray(found[1]) ? found[1].filter((r) => ROLES.includes(r)) : [];
}
// The role a path needs.
export function roleForPath(path) {
  if (path.startsWith('/volunteer/admin/supervisors/') || path.startsWith('/volunteer/admin/organisations/')) return 'verifier';
  if (path.startsWith('/volunteer/admin/academy/')) return 'academy';
  if (path.startsWith('/volunteer/admin/newsletter/')) return 'newsletter';
  return 'owner';
}
export const allowed = (roles, path) => roles.includes('owner') || roles.includes(roleForPath(path));

// For worker/index.js: { on: false } with Access off; otherwise { on: true, ok, email, roles, reason }.
export async function adminAccess(env, req, settings = {}) {
  if (!accessOn(env)) return { on: false, ok: true };
  const v = await verifyAccessJwt(env, req.headers.get('Cf-Access-Jwt-Assertion'));
  if (!v.ok) return { on: true, ok: false, reason: v.reason };
  return { on: true, ok: true, email: v.email, roles: rolesFor(settings.admin_roles, v.email) };
}
