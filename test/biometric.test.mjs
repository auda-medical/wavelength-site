// App lock (src/app/native.js): only the phone's own prompt, strong biometrics only on Android (no camera-only face
// unlock), the screen lock as fallback where Android allows it in one prompt, Face ID or Touch ID with the passcode
// on iPhone, and no network involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/app/native.js', import.meta.url), 'utf8');
function load(platform, ua, avail = { isAvailable: true, authenticationStrength: 1 }) {
  const calls = [];
  const bio = {
    getData: () => Promise.reject(new Error('No data found')),
    isAvailable: (o) => { calls.push(['isAvailable', o]); return Promise.resolve(typeof avail === 'function' ? avail(o) : avail); },
    verifyIdentity: (o) => { calls.push(['verifyIdentity', o]); return Promise.resolve(); },
  };
  const win = {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, registerPlugin: (n) => (n === 'NativeBiometric' ? bio : n === 'Preferences' ? { get: () => Promise.resolve({ value: '' }) } : null) },
    WL_NATIVE: { site: 'https://thewavelength.co.uk', version: '1.0.9' },
    addEventListener() {}, dispatchEvent() { return true; },
  };
  const doc = { addEventListener() {}, documentElement: { classList: { add() {} } } };
  let fetched = 0;
  new Function('window', 'document', 'navigator', 'location', 'fetch', 'Headers', 'CustomEvent', 'setTimeout', SRC)(
    win, doc, { userAgent: ua }, { origin: 'https://localhost' }, () => { fetched++; return Promise.reject(new Error('no network')); }, Map, function () {}, setTimeout);
  return { N: win.WLNative, calls, fetched: () => fetched };
}
const TEXT = { reason: 'r', title: 't', subtitle: 's', cancel: 'c' };
const ANDROID14 = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';
const ANDROID10 = 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';

test('Android 11+: strong biometrics or the screen lock, never weak face unlock', async () => {
  const { N, calls, fetched } = load('android', ANDROID14);
  assert.equal(await N.lockAvailable(), true);
  assert.equal(await N.verify(TEXT), true);
  const v = calls.find((c) => c[0] === 'verifyIdentity')[1];
  assert.deepEqual(v.allowedBiometryTypes, [3, 7]); // BIOMETRIC_STRONG via FINGERPRINT, DEVICE_CREDENTIAL
  assert.equal(calls.find((c) => c[0] === 'isAvailable')[1].useFallback, true);
  assert.equal(N.pinFallback, true);
  assert.equal(fetched(), 0);
});

test('Android 7 to 10: strong biometrics only, and the lock needs a strong biometric', async () => {
  const weakOnly = load('android', ANDROID10, { isAvailable: true, authenticationStrength: 2 });
  assert.equal(await weakOnly.N.lockAvailable(), false, 'weak face unlock alone must not enable the lock');
  const strong = load('android', ANDROID10, { isAvailable: true, authenticationStrength: 1 });
  assert.equal(await strong.N.lockAvailable(), true);
  await strong.N.verify(TEXT);
  assert.deepEqual(strong.calls.find((c) => c[0] === 'verifyIdentity')[1].allowedBiometryTypes, [3]);
  assert.equal(strong.N.pinFallback, false);
});

test('iPhone: Face ID or Touch ID with the passcode as fallback', async () => {
  const { N, calls } = load('ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  assert.equal(await N.lockAvailable(), true);
  await N.verify(TEXT);
  const v = calls.find((c) => c[0] === 'verifyIdentity')[1];
  assert.equal(v.useFallback, true);
  assert.equal(v.allowedBiometryTypes, undefined);
});

test('no screen lock and no biometrics: the lock cannot be turned on', async () => {
  const { N } = load('android', ANDROID14, { isAvailable: false });
  assert.equal(await N.lockAvailable(), false);
});

test('a failed or cancelled prompt never unlocks', async () => {
  const { N } = load('android', ANDROID14);
  const bio = N.plugin('NativeBiometric');
  bio.verifyIdentity = () => Promise.reject(new Error('User cancelled'));
  assert.equal(await N.verify(TEXT), false);
});

test('a failed availability check is reported as unknown (null), not as "no lock", so the lock stays on', async () => {
  const { N } = load('android', ANDROID14, () => Promise.reject(new Error('plugin error')));
  assert.equal(await N.lockAvailable(), null);
});

test('the app lock never switches itself off when the phone lock is missing or cannot be checked', () => {
  const app = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function unlock()'), app.indexOf('function lockCard()'));
  assert.doesNotMatch(fn, /setLock\(false\)|hideLock\(\);\s*toast/, 'unlock() must keep the lock screen up');
  assert.match(fn, /ok === null/);
});
