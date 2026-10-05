// Supervisor links and assessments: only an accepted supervisor sees a learner's logbook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { handleApp } from '../worker/app.js';
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const PASSWORD = 'Correct horse battery 1!';
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
async function account(env, email) {
  const c = client(handleApp, env);
  assert.equal((await c.call('/api/app/signup', { firstName: 'T', lastName: 'L', email, password: PASSWORD, terms: true })).status, 200);
  return c;
}

test('a supervisor sees a learner only after accepting, and loses access when removed', async () => {
  const env = makeEnv();
  const learner = await account(env, 'learner@x.co');
  const sup = await account(env, 'sup@x.co');
  const stranger = await account(env, 'stranger@x.co');
  await learner.call('/api/app/sync', { entries: [{ id: 'supentry0001', type: 'efast', date: '2026-09-01', supervision: 'direct' }] });
  const { id: lid } = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind('learner@x.co').first();
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 404, 'no access before an invitation');
  await learner.call('/api/app/supervisors/add', { email: 'sup@x.co' });
  const invite = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await stranger.call('/api/app/supervisors/accept', { id: invite.id })).status, 404, 'only the invited email can accept');
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 404, 'no access before accepting');
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: invite.id })).status, 200);
  const view = await sup.call('/api/app/supervise/learner?id=' + lid);
  assert.equal(view.status, 200);
  assert.equal(view.body.recent.length, 1);
  assert.equal((await stranger.call('/api/app/supervise/learner?id=' + lid)).status, 404);
  await learner.call('/api/app/supervisors/remove', { id: invite.id });
  assert.equal((await sup.call('/api/app/supervise/learner?id=' + lid)).status, 404, 'removed supervisors lose access');
});

test('an assessment link completes once', async () => {
  const env = makeEnv();
  const learner = await account(env, 'assess@x.co');
  const pw = LOGBOOK.pathways.find((p) => p.modules && p.modules.length);
  const kind = LOGBOOK.assessmentKinds[0].id;
  const r = await learner.call('/api/app/assessment/request', { pathway: pw.id, module: pw.modules[0].id, kind });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const token = r.body.link.split('#')[1];
  const domain = LOGBOOK.assessmentDomains[0].id;
  const outcome = LOGBOOK.assessmentOutcomes.find((o) => o.id !== 'feedback' || kind === 'formative').id;
  const form = { token, name: 'Dr A', role: 'Consultant', confirm: true, signature: SIG, outcome, domains: { [domain]: LOGBOOK.assessmentScale[0] } };
  const assessor = client(handleApp, env);
  const [x, y] = await Promise.all([assessor.call('/api/app/assessment/complete', form), assessor.call('/api/app/assessment/complete', form)]);
  assert.deepEqual([x.status, y.status].sort(), [200, 410]);
});
