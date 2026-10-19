// App links (worker/app-links.js): the files that let a logbook link in an email open the installed app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx } from './helpers/env.mjs';
import worker from '../worker/index.js';

const get = (p) => worker.fetch(new Request('https://thewavelength.co.uk' + p), makeEnv(), ctx);

test('Android App Links: the app package and the signing certificate Google Play uses', async () => {
  const r = await get('/.well-known/assetlinks.json');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /^application\/json/);
  const j = await r.json();
  assert.equal(j[0].target.package_name, 'uk.co.thewavelength.app');
  // The original upload key (ee30bfd2...a1e0), kept as the app signing key through Play App Signing (12 Oct 2026).
  assert.equal(j[0].target.sha256_cert_fingerprints[0].replace(/:/g, '').toLowerCase(), 'ee30bfd2dfc3356eadd1b70919a50c5b66aacb1643ee312e63767f747261a1e0');
});

test('iPhone Universal Links: the App Store app, and only the logbook address /app/', async () => {
  const r = await get('/.well-known/apple-app-site-association');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /^application\/json/);
  const d = (await r.json()).applinks.details[0];
  assert.deepEqual(d.appIDs, ['XXUSS4CKW8.uk.co.thewavelength.app']);
  assert.deepEqual(d.components.map((c) => c['/']), ['/app/'], 'the one-off signing pages stay in the browser');
});

test('the site sends /.well-known/ to the Worker (static pages would answer "not found" otherwise)', async () => {
  const { readFileSync } = await import('node:fs');
  const w = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.ok(w.assets.run_worker_first.includes('/.well-known/*'), 'Release L served these files only in tests: /.well-known/ was missing here');
});
