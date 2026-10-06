// Store apps (Capacitor, mobile/). The Android and iPhone apps carry the logbook inside the app and run it from
// https://localhost (Android) or capacitor://localhost (iOS). They call /api/app/* across origins:
//   - with CORS, only for those two origins, and never with credentials (no cookies cross the origin boundary);
//   - with the login token in an Authorization: Bearer header instead of the wl_learn cookie;
//   - receiving a new or cleared token in the X-Wavelength-Token header wherever the website would set the cookie.
// The token is the cookie value itself (id.expiry.signature), so expiry, signature checks and session revocation
// (sessions_after) work the same way. A browser never sends a Bearer token by itself, so cross-site requests from
// these origins carry no ambient login and need no CSRF defence beyond the origin check.
export const NATIVE_ORIGINS = ['https://localhost', 'capacitor://localhost'];
export const isNativeOrigin = (o) => !!o && NATIVE_ORIGINS.includes(o);
const LOGIN_COOKIE = 'wl_learn';
// X-Wavelength-App: the store app's version, for the minimum-version check (worker/version.js).
const ALLOW_HEADERS = 'Accept, Accept-Language, Content-Type, Authorization, X-Wavelength-Client, X-Wavelength-App';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Expose-Headers': 'X-Wavelength-Token, X-Request-Id',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

// Preflight for /api/app/*. Other origins get no CORS headers, so browsers block them as before.
export function preflight(req) {
  const origin = req.headers.get('Origin');
  if (!isNativeOrigin(origin)) return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

// The login token from an Authorization header, in the cookie's own format, or '' when there is none.
export function bearer(req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\d+\.\d+\.[A-Za-z0-9_-]+)\s*$/);
  return m ? m[1] : '';
}

// Adds CORS headers for the store apps and turns the login cookie into the token header. Responses to the website
// pass through unchanged.
export function withNative(req, res) {
  const origin = req.headers.get('Origin');
  if (!isNativeOrigin(origin)) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  const cookies = typeof out.headers.getSetCookie === 'function' ? out.headers.getSetCookie() : [out.headers.get('Set-Cookie')].filter(Boolean);
  for (const c of cookies) {
    const m = c.match(new RegExp('^' + LOGIN_COOKIE + '=([^;]*)'));
    if (m) out.headers.set('X-Wavelength-Token', m[1]);
  }
  // A cookie set for a cross-site request is never sent back, so drop it rather than leave a stray one behind.
  out.headers.delete('Set-Cookie');
  return out;
}
