// App version compatibility (plan section 31). The store apps send X-Wavelength-App: <version> (for example "1.2.0").
// Worker vars APP_MIN_VERSION and APP_RECOMMENDED_VERSION, empty by default, set the floor and the nudge.
// The website sends no header (or "web/<build>") and is never blocked. GET /api/app/me and account deletion always
// work, so nobody is locked out of their own account or data.
import { appVersion } from './log.js';
import { json } from './app-util.js';

// Compares dot-separated versions numerically, part by part: -1, 0 or 1. Missing parts count as 0.
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
const VALID = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const setting = (v) => (VALID.test(String(v || '').trim()) ? String(v).trim() : '');

// 'none' | 'recommended' | 'required' for a version ('' means the website or an unknown build: always 'none').
export function updateState(env, version) {
  if (!version) return 'none';
  const min = setting(env.APP_MIN_VERSION), rec = setting(env.APP_RECOMMENDED_VERSION);
  if (min && compareVersions(version, min) < 0) return 'required';
  if (rec && compareVersions(version, rec) < 0) return 'recommended';
  return 'none';
}
export function versionInfo(env, req) {
  const h = req.headers.get('X-Wavelength-App') || '';
  const version = /^web\//i.test(h) ? '' : appVersion(h);
  const update = updateState(env, version);
  return {
    minVersion: setting(env.APP_MIN_VERSION) || null,
    recommendedVersion: setting(env.APP_RECOMMENDED_VERSION) || null,
    appVersion: version || null,
    update,
    updateMessage: update === 'required' ? 'Please update the Wavelength app to continue.' : update === 'recommended' ? 'A new version of the Wavelength app is available.' : null,
  };
}
// True when this request must be refused with 426.
export function mustUpgrade(env, req, path) {
  if (req.method === 'GET' && path === 'me') return false;
  if (req.method === 'POST' && path === 'account/delete') return false;
  return versionInfo(env, req).update === 'required';
}
export const UPGRADE = { ok: false, upgrade: true, error: 'Please update the Wavelength app to continue.' };

// 1.0.30 (owner, 15 Nov 2026): GET /api/app/store-version, public. The version the App Store is serving now, read from
// Apple's public lookup, so the iPhone app offers an update only once Apple has actually published it. Cached at the edge
// for six hours; { ios: null } when Apple cannot be reached, and the app then simply says nothing. Android needs no
// server: Google Play answers the app directly (StoreReviewPlugin.java, checkUpdate).
export const APP_STORE_ID = '6822088185';
const LOOKUP_TTL = 6 * 3600;
export async function storeVersion(env, ctx) {
  const cache = typeof caches !== 'undefined' && caches.default;
  const key = cache ? new Request('https://store-version.cache.invalid/ios') : null;
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit; }
  let ios = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const r = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=gb`, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (r && r.ok) {
      const j = await r.json();
      const v = String((j && j.results && j.results[0] && j.results[0].version) || '');
      if (VALID.test(v)) ios = v;
    }
  } catch { ios = null; }
  const res = json({ ok: true, ios, iosUrl: `https://apps.apple.com/app/id${APP_STORE_ID}` }, 200, { 'Cache-Control': ios ? `public, max-age=${LOOKUP_TTL}` : 'no-store' });
  if (cache && ios) { const put = cache.put(key, res.clone()).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(put); }
  return res;
}
