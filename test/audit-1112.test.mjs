// Full audit, 12 Nov 2026: regression tests for the defects found and fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount } from './helpers/verify.mjs';
import { cleanDecisions, cleanRatings } from '../worker/app-util.js';
import { htmlToText, dropRelated } from '../worker/monitor/extract.js';
import { suggestDomain } from '../worker/email-check.js';

test('a signer can only decide on the scans in the request, as confirmed or query', () => {
  assert.deepEqual(cleanDecisions(['a', 'b'], { a: 'confirmed', b: 'query', fake1: 'confirmed', c: 'yes' }), { a: 'confirmed', b: 'query' });
  assert.deepEqual(cleanDecisions(['a'], { a: 'approved' }), {});
  assert.deepEqual(cleanDecisions(['a'], null), {});
  assert.deepEqual(Object.keys(cleanRatings(['a'], { a: { image: 'g' }, z: { image: 'r' }, signatureKind: 'typed' })).sort(), ['a', 'signatureKind']);
});

test('related-event cards are never taken as an event page\'s text', () => {
  const page = '<html><body><div class="intro"><h1>FUSIC HD summative assessment</h1><p>' + 'Complete 50 scans, 20 of them supervised, before the assessment. '.repeat(6) + '</p></div>' +
    '<div class="related-events"><article><h3>Inside Intensive Care: Anticoagulants</h3><p>17 November 2026</p></article><article><h3>UK Shock 26</h3></article></div></body></html>';
  const t = htmlToText(page);
  assert.match(t, /50 scans/);
  assert.doesNotMatch(t, /Anticoagulants|UK Shock/);
  assert.doesNotMatch(dropRelated('<div class="related-events"><div><p>x</p></div><p>y</p></div><p>keep</p>'), /<p>x|<p>y/);
});

test('real email providers close to common ones are not questioned', () => {
  for (const d of ['live.ca', 'hotmail.ca', 'yahoo.ca', 'email.com', 'hotmail.fr']) assert.equal(suggestDomain(d), null, d);
  assert.equal(suggestDomain('nhs.ner'), 'nhs.net');
});

test('adding and removing a supervisor in a loop stops at 20 invitations a day', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const real = globalThis.fetch; globalThis.fetch = async () => new Response('{}');
  try {
    const l = await verifiedAccount(env, 'loop@x.co');
    let last;
    for (let i = 0; i < 25; i++) {
      last = await l.call('/api/app/supervisors/add', { email: 'victim@example.org' });
      if (last.status === 429) break;
      const link = (await l.call('/api/app/supervisors')).body.supervisors.find((s) => s.email === 'victim@example.org');
      await l.call('/api/app/supervisors/remove', { id: link.id });
    }
    assert.equal(last.status, 429, JSON.stringify(last.body));
    const meta = (await env.DB.prepare("SELECT meta FROM audit_events WHERE action = 'link.invite' ORDER BY id LIMIT 1").first()).meta;
    assert.match(meta, /"emailed":true/, 'whether the invitation email went is recorded');
  } finally { globalThis.fetch = real; }
});

test('cancelling a request that is no longer open says so', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  const l = await verifiedAccount(env, 'cancel@x.co');
  const r = await l.call('/api/app/signoff/cancel', { code: 'SO-NONE-XXXX' });
  assert.equal(r.status, 409);
  assert.equal(r.body.ok, false);
  const a = await l.call('/api/app/assessment/cancel', { code: 'AS-NONE-XXXX' });
  assert.equal(a.status, 409);
});
