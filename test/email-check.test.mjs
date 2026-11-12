// 12 Nov 2026: a learner typed her supervisor's NHS address as "...@nhs.ner"; the invitation reached no one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestDomain, domainAccepts, distance } from '../worker/email-check.js';

test('likely slips in a common domain are suggested back', () => {
  assert.equal(suggestDomain('nhs.ner'), 'nhs.net');
  assert.equal(suggestDomain('nhs.nte'), 'nhs.net');
  assert.equal(suggestDomain('gmial.com'), 'gmail.com');
  assert.equal(suggestDomain('hotmial.co.uk'), 'hotmail.co.uk');
  assert.equal(suggestDomain('outlok.com'), 'outlook.com');
});
test('real domains are left alone', () => {
  for (const d of ['nhs.net', 'gmail.com', 'mail.com', 'gmx.com', 'yahoo.co.uk', 'thewavelength.co.uk', 'nhs.uk', 'wales.nhs.uk', 'gstt.nhs.uk', 'ed.ac.uk', 'hotmail.fr', 'doctors.org.uk']) assert.equal(suggestDomain(d), null, d);
});
test('distance counts a swap as one step', () => { assert.equal(distance('nhs.nte', 'nhs.net'), 1); assert.equal(distance('abc', 'abc'), 0); });

const dns = (byType) => async (u) => { const t = new URL(u).searchParams.get('type'); const v = byType[t]; if (v === 'throw') throw new Error('net'); return new Response(JSON.stringify(v || {})); };
test('a domain that does not exist cannot receive email', async () => {
  assert.equal(await domainAccepts('nhs.ner', dns({ MX: { Status: 3 } })), false);
  assert.equal(await domainAccepts('x.example', dns({ MX: { Status: 0, Answer: [] }, A: { Status: 0, Answer: [] } })), false);
});
test('a domain with a mail server or an address can', async () => {
  assert.equal(await domainAccepts('nhs.net', dns({ MX: { Status: 0, Answer: [{ type: 15 }] } })), true);
  assert.equal(await domainAccepts('small.org', dns({ MX: { Status: 0, Answer: [] }, A: { Status: 0, Answer: [{ type: 1 }] } })), true);
});
test('a failed lookup never blocks an address', async () => {
  assert.equal(await domainAccepts('nhs.net', dns({ MX: 'throw' })), null);
  assert.equal(await domainAccepts('nhs.net', async () => new Response('{}')), null);
  assert.equal(await domainAccepts('nhs.net', async () => new Response('x', { status: 500 })), null);
});
