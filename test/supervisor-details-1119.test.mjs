// 19 Nov 2026 (owner): a supervisor signing on the dashboard, or on the learner's phone, saw only the scan type, date
// and a short findings line: never the indication, interpretation, confirmation or impact. Both sign-off sheets and the
// dashboard's scan cards now show what the sign-off link page shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount, idOf } from './helpers/verify.mjs';

globalThis.fetch = async () => new Response('{}');
const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');

test('the sign-off card and the dashboard scan card both include the full scan details', () => {
  const detail = APP.slice(APP.indexOf('function scanDetail(e)'), APP.indexOf('function entryCard('));
  for (const k of ['Setting', 'Indication', 'Overall', 'Image quality', 'Interpretation', 'Confirmed by', 'Impact']) assert.ok(detail.includes("r('" + k + "'"), k);
  const card = APP.slice(APP.indexOf('function entryCard('), APP.indexOf('function signoffFormHtml('));
  assert.match(card, /\+ scanDetail\(e\) \+ \(media \|\| ''\)/, 'shown on both sign-off sheets');
  const sv = APP.slice(APP.indexOf('function svScanCard(e)'), APP.indexOf('function viewSupervisedScans('));
  assert.match(sv, /<details class="sv-more">.*scanDetail\(e\)/, 'on the dashboard, folded under Scan details');
});

test('the dashboard data carries the confirmation and impact', async () => {
  const env = makeEnv();
  const learner = await verifiedAccount(env, 'learner.d@x.co', { firstName: 'Sam', lastName: 'Trainee' });
  const sup = await verifiedAccount(env, 'sup.d@x.co');
  await learner.call('/api/app/sync', { entries: [{ id: 'scand0000001', type: 'cardiac', date: '2026-11-19', supervision: 'independent', indication: 'Chest pain', interpretation: 'No effusion', confirmation: 'Formal echo', impact: 'Discharged' }] });
  await learner.call('/api/app/supervisors/add', { email: 'sup.d@x.co' });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  assert.equal((await sup.call('/api/app/supervisors/accept', { id: inv.id })).status, 200);
  const id = await idOf(env, 'learner.d@x.co');
  const view = await sup.call('/api/app/supervise/learner?id=' + id);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  const e = view.body.recent.find((x) => x.id === 'scand0000001');
  assert.deepEqual([e.indication, e.interpretation, e.confirmation, e.impact], ['Chest pain', 'No effusion', 'Formal echo', 'Discharged']);
  const scans = await sup.call('/api/app/supervise/learner/scans?id=' + id + '&filter=all');
  assert.equal(scans.status, 200, JSON.stringify(scans.body));
  const s = scans.body.entries.find((x) => x.id === 'scand0000001');
  assert.deepEqual([s.confirmation, s.impact], ['Formal echo', 'Discharged']);
});
