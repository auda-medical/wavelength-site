// 1.0.30 (owner, 15 Nov 2026): a pop-up on opening the app when the store has a newer version, once per version,
// with Update now opening the store listing. iPhone: GET /api/app/store-version (Apple's public lookup); Android:
// Google Play's own check (StoreReviewPlugin.java, checkUpdate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, ctx } from './helpers/env.mjs';
import { handleApp } from '../worker/app.js';
import { storeVersion } from '../worker/version.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const APP = read('src/app/app.js');

async function withFetch(fn, impl) {
  const real = globalThis.fetch; const calls = [];
  globalThis.fetch = async (u, init) => { calls.push(String(u)); return impl(u, init); };
  try { return { out: await fn(), calls }; } finally { globalThis.fetch = real; }
}

test('store-version reads the live App Store version from Apple, publicly, and says nothing when Apple fails', async () => {
  const env = makeEnv();
  const ok = await withFetch(async () => {
    const res = await handleApp(new Request('https://thewavelength.co.uk/api/app/store-version'), env, ctx);
    return { status: res.status, cache: res.headers.get('Cache-Control'), body: await res.json() };
  }, async () => new Response(JSON.stringify({ resultCount: 1, results: [{ version: '1.0.29', trackId: 6822088185 }] })));
  assert.equal(ok.out.status, 200, 'no login needed');
  assert.equal(ok.out.body.ios, '1.0.29');
  assert.equal(ok.out.body.iosUrl, 'https://apps.apple.com/app/id6822088185');
  assert.match(ok.out.cache, /max-age=21600/);
  assert.ok(ok.calls[0].startsWith('https://itunes.apple.com/lookup?id=6822088185'), ok.calls[0]);

  const down = await withFetch(async () => (await storeVersion(env, ctx)).json(), async () => { throw new Error('offline'); });
  assert.equal(down.out.ios, null);
  const junk = await withFetch(async () => (await storeVersion(env, ctx)).json(), async () => new Response(JSON.stringify({ results: [{ version: '<script>' }] })));
  assert.equal(junk.out.ios, null, 'only a plain version number is passed on');
  const notOk = await withFetch(async () => (await storeVersion(env, ctx)).json(), async () => new Response('busy', { status: 503 }));
  assert.equal(notOk.out.ios, null);
});

test('the app asks once a day, pops up once per new version, only on safe screens, and opens the listing', () => {
  const fn = APP.slice(APP.indexOf('  function updatePrompt() {'), APP.indexOf('  function loadMe() {'));
  assert.ok(fn.length > 500);
  assert.match(fn, /wl-upd-day/, 'at most once a day');
  assert.match(fn, /wl-upd-pop/, 'once per version');
  assert.match(fn, /\/api\/app\/store-version/, 'iPhone asks the website');
  assert.match(fn, /NAT\.checkUpdate\(\)/, 'Android asks Google Play');
  assert.match(fn, /verCmp\(NAT\.version, r\.ios\) < 0/, 'only a newer version');
  assert.match(fn, /NAT\.openListing\(\)/);
  assert.match(fn, /updateLevel\(\) === 'required'/, 'a required update keeps its banner');
  assert.match(fn, /document\.querySelector\('\.sheet-bg'\)/, 'never over another sheet');
  const safe = APP.match(/var UPD_SAFE = (\{[^}]*\});/)[1];
  assert.doesNotMatch(safe, /new|sign|supervise|entry|edit/, 'never during a scan or a sign-off');
  assert.match(APP, /cacheAccount\(res\.account\); if \(route\(\)\.name === 'home' \|\| route\(\)\.name === 'me'\) render\(true\); updatePrompt\(\);/, 'checked after the account loads');
  assert.match(APP, /NAT\.platform === 'ios' \? 'https:\/\/apps\.apple\.com\/app\/id6822088185'/, 'the banner opens the App Store on iPhone');
});

test('native: Android checks Google Play; the listing, not the review page, opens; version 1.0.30 (37)', () => {
  const nat = read('src/app/native.js');
  assert.match(nat, /function checkUpdate\(\)/);
  assert.match(nat, /LISTING = \{ ios: 'https:\/\/apps\.apple\.com\/app\/id6822088185'/);
  assert.match(nat, /checkUpdate: checkUpdate,\n    openListing: openListing,/);
  const java = read('mobile/android/app/src/main/java/uk/co/thewavelength/app/StoreReviewPlugin.java');
  assert.match(java, /public void checkUpdate\(PluginCall call\)/);
  assert.match(java, /UpdateAvailability\.UPDATE_AVAILABLE/);
  assert.match(read('mobile/android/app/build.gradle'), /com\.google\.android\.play:app-update:2\.1\.0/);
  const pbx = read('mobile/ios/App/App.xcodeproj/project.pbxproj');
  assert.equal((pbx.match(/MARKETING_VERSION = 1\.0\.30;/g) || []).length, 2);
  assert.equal((pbx.match(/CURRENT_PROJECT_VERSION = 37;/g) || []).length, 2);
});
