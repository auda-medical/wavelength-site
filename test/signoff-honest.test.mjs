// 12 Nov 2026 (owner): a learner made a sign-off link, the app said "Request sent", and nobody ever received it. A
// supervisor invited by email heard nothing on their phone either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushText } from '../worker/push.js';

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');

test('a link-only request is told apart from one sent to a dashboard', () => {
  assert.match(APP, /dash: !!s\.supervisor_id/, 'the pending map records whether a dashboard got it');
  assert.match(APP, /if \(m\[id\] && m\[id\]\.dash && !s\.supervisor_id\) return;/, 'a dashboard request wins');
  assert.match(APP, /Sign-off link created, not sent by Wavelength/);
  assert.match(APP, /Link not sent by Wavelength/);
  assert.match(APP, /Link ready: not sent yet/);
  assert.match(APP, /sendDirect\(e\.id, lsup\)/, 'a linked supervisor is offered instead');
});

test('an invitation to someone with an account reaches their phone', () => {
  const m = pushText('link_invite', { learner: 'Dr Zahra Habibzadeh' });
  assert.equal(m.title, 'Supervision request');
  assert.match(m.body, /Dr Zahra Habibzadeh asked you to be their supervisor/);
  assert.equal(m.url, '/app/#/supervise');
  const sv = readFileSync(new URL('../worker/supervise.js', import.meta.url), 'utf8');
  assert.match(sv, /pushPerson\(env, sup\.id, 'link_invite'/);
});
