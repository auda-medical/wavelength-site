// App version compatibility (plan section 31). The store apps send X-Wavelength-App: <version> (for example "1.2.0").
// Worker vars APP_MIN_VERSION and APP_RECOMMENDED_VERSION, empty by default, set the floor and the nudge.
// The website sends no header (or "web/<build>") and is never blocked. GET /api/app/me and account deletion always
// work, so nobody is locked out of their own account or data.
import { appVersion } from './log.js';

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
