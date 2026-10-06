// Allowlist request logger (plan section 34). One JSON line per /api/app/* request with a request id, the route
// pattern, method, status, duration, app version and error class. Nothing else is ever written: never bodies,
// headers, tokens, query strings, emails, names, registration numbers or clinical text. log() drops any field that is
// not on the allowlist, and route() replaces ids and codes in the path with placeholders.
const FIELDS = ['rid', 'route', 'method', 'status', 'ms', 'app', 'err'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// A short id people can read out ("7F3K-2Q9M"), returned as X-Request-Id and quoted in error messages.
export function requestId() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// The route pattern of a path: the part after /api/app/, with anything that looks like an id, code or token replaced.
export function route(pathname) {
  const p = String(pathname || '').replace(/^\/api\/app\//, '').split('?')[0];
  return p.split('/').slice(0, 4).map((seg) => (/^[a-z][a-z-]{0,30}$/.test(seg) ? seg : ':id')).join('/').slice(0, 80) || '/';
}

// The version part of an X-Wavelength-App header ("1.2.0", or "ios/1.2.0/12"), or ''.
export function appVersion(header) {
  const m = String(header || '').match(/(?:^|\/)(\d{1,4}(?:\.\d{1,4}){0,3})(?:\/|$)/);
  return m ? m[1] : '';
}

export function clean(fields) {
  const out = {};
  for (const k of FIELDS) {
    const v = fields && fields[k];
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'number' ? v : String(v).slice(0, 80);
  }
  return out;
}

// env.LOG_SINK (a function) replaces console.log, for tests. It cannot be set from wrangler.jsonc vars.
export function log(env, fields) {
  const line = JSON.stringify(clean(fields));
  try { (env && typeof env.LOG_SINK === 'function' ? env.LOG_SINK : console.log)(line); } catch { /* logging never breaks a request */ }
  return line;
}
