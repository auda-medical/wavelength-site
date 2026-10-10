// Tailored training enquiries (/training/): individuals, groups and organisations, UK and international. The earlier
// department form still submits during a deploy; conversions are counted without personal details; review states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN, client } from './helpers/env.mjs';
import { withMailbox, verifiedAccount, idOf, SIG } from './helpers/verify.mjs';
import worker from '../worker/index.js';
import { handleApp } from '../worker/app.js';
import { phoneOk, classOf, regionOf } from '../worker/departments.js';
import { reviewState } from '../worker/review.js';
import { budget } from '../worker/metrics.js';
import FORM from '../worker/department-form.json' with { type: 'json' };

const settle = () => new Promise((r) => setTimeout(r, 20));
const send = (env, o, headers = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return worker.fetch(new Request(`${ORIGIN}/api/training/enquire`, { method: 'POST', headers: { Origin: ORIGIN, ...headers }, body: f }), env, ctx); };
const base = { first_name: 'Maya', last_name: 'Okafor', email: 'maya@example.com', enquiry_type: 'Myself, as an individual', country: 'United Kingdom', group_size: '1', confirm_privacy: 'yes' };

test('an individual can enquire without an organisation; the reporting class and region are derived', async () => {
  budget.day = '';
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  await withMailbox(async (box) => {
    const r = await send(env, { ...base, topics: ['Lung ultrasound', 'Made-up module'], training: 'Individual or small-group teaching', heard: 'LinkedIn', budget: 'Under £500', phone: '+44 (0)7700 900123', campaign: '2026-11 Flagship!', details: 'I work nights.' });
    assert.equal(r.headers.get('Location'), '/training/thanks/');
    await box.settle();
    const row = await env.DB.prepare('SELECT * FROM department_enquiries').first();
    assert.deepEqual([row.organisation, row.enquiry_class, row.region, row.topics, row.heard, row.campaign, row.stage], ['', 'individual', 'uk', 'Lung ultrasound', 'LinkedIn', '2026-11flagship', 'new']);
    const mail = box.sent.find((m) => /Tailored training enquiry/.test(m.subject));
    assert.match(mail.subject, /Maya Okafor \(United Kingdom, 1 participant\)/);
    assert.equal(mail.reply_to[0].address, 'maya@example.com');
  });
  await settle();
  const c = (await env.DB.prepare("SELECT metric, dim, n FROM metric_daily WHERE metric LIKE 'conv.%'").all()).results;
  const has = (m, d) => c.some((x) => x.metric === m && x.dim === d);
  assert.ok(has('conv.enquiry', 'social') && has('conv.enquiry_region', 'uk') && has('conv.enquiry_class', 'individual') && has('conv.enquiry_campaign', '2026-11flagship'));
  assert.doesNotMatch(JSON.stringify(c), /Maya|maya@|nights/, 'counters hold no personal details or message');
});

test('international organisations: country outside the UK is international; Crown Dependencies count as international', async () => {
  const env = makeEnv();
  await send(env, { ...base, email: 'clinic@example.ae', enquiry_type: 'A private clinic or practice', organisation: 'Gulf Clinic', country: 'United Arab Emirates', location: 'Dubai', group_size: '6 to 10', phone: '+971 4 123 4567' });
  const row = await env.DB.prepare('SELECT enquiry_class, region, country, location FROM department_enquiries').first();
  assert.deepEqual(Object.values(row), ['organisation', 'international', 'United Arab Emirates', 'Dubai']);
  assert.equal(regionOf('Jersey'), 'international');
  assert.equal(regionOf('United Kingdom'), 'uk');
  assert.equal(classOf('A small group of colleagues'), 'group');
  assert.ok(FORM.countries.length > 190 && FORM.countries[0] === 'United Kingdom');
});

test('phone numbers: international formats accepted, nonsense refused with a clear error', async () => {
  for (const p of ['', '+44 20 7946 0958', '020 7946 0958', '+1 (212) 555-0123', '+33 6 12 34 56 78', '+86 138 0013 8000']) assert.ok(phoneOk(p), p);
  for (const p of ['12345', 'call me', '+44 20 7946 0958 ext 12', '1'.repeat(25)]) assert.ok(!phoneOk(p), p);
  const env = makeEnv();
  assert.equal((await send(env, { ...base, phone: 'call me maybe' })).headers.get('Location'), '/training/?error=phone#enquire');
});

test('required fields, unknown options, the honeypot and other origins', async () => {
  const env = makeEnv();
  assert.equal((await send(env, { ...base, enquiry_type: 'Made up' })).headers.get('Location'), '/training/?error=1#enquire', 'no type and no organisation');
  assert.equal((await send(env, { ...base, group_size: '' })).headers.get('Location'), '/training/?error=1#enquire');
  assert.equal((await send(env, { ...base, confirm_privacy: '' })).headers.get('Location'), '/training/?error=1#enquire');
  assert.equal((await send(env, { ...base, wl_trap: 'bot' })).headers.get('Location'), '/training/thanks/');
  assert.equal((await send(env, base, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM department_enquiries').first()).n, 0);
});

test('the earlier department form (cached before a deploy) still submits', async () => {
  const env = makeEnv();
  const r = await send(env, { first_name: 'Old', last_name: 'Form', email: 'lead@nhs.net', organisation: 'Darent Valley Hospital', role: 'Clinical lead or consultant', setting: 'Emergency department', training: 'Core emergency ultrasound course for our team', topics: 'Vascular access', group_size: '10 to 20', confirm_privacy: 'yes' });
  assert.equal(r.headers.get('Location'), '/training/thanks/');
  const row = await env.DB.prepare('SELECT * FROM department_enquiries').first();
  assert.deepEqual([row.organisation, row.group_size, row.training, row.topics], ['Darent Valley Hospital', '10 to 20', 'Core emergency ultrasound course for our team', 'Vascular access']);
});

test('before migration 0014, the new answers are kept in the details text', async () => {
  const env = makeEnv({}, { skipMigrations: ['0014_business_analytics.sql'] });
  assert.equal((await send(env, { ...base, country: 'Ireland', location: 'Dublin', budget: 'Under £500', details: 'Hello' })).headers.get('Location'), '/training/thanks/');
  const row = await env.DB.prepare('SELECT details FROM department_enquiries').first();
  assert.match(row.details, /Enquiry type: Myself, as an individual\nCountry: Ireland\nLocation: Dublin\nBudget: Under £500\nHello/);
});

// ---------- Review states ----------
test('review states are derived precisely from the record', () => {
  const now = Date.now();
  assert.equal(reviewState({ status: 'pending', expires_at: now + 1e6 }), 'pending');
  assert.equal(reviewState({ status: 'pending', accepted_at: 'x', expires_at: now + 1e6 }), 'under_review');
  assert.equal(reviewState({ status: 'pending', returned_at: 'x', returned_reason: 'declined' }), 'declined');
  assert.equal(reviewState({ status: 'pending', returned_at: 'x', returned_reason: 'supervisor_removed' }), 'returned');
  assert.equal(reviewState({ status: 'signed', decisions: '{"a":"confirmed","b":"query"}' }), 'revision_requested');
  assert.equal(reviewState({ status: 'signed', decisions: '{"a":"confirmed"}' }), 'approved');
  assert.equal(reviewState({ status: 'cancelled' }), 'cancelled');
  assert.equal(reviewState({ status: 'pending', expires_at: now - 1 }), 'expired');
});

test('a supervisor opens a request (under review), declines it with a reason, and the learner can send it on', async () => {
  const env = makeEnv();
  const sup = await verifiedAccount(env, 'sup.r@x.co');
  const learner = await verifiedAccount(env, 'trainee.r@x.co');
  await learner.call('/api/app/supervisors/add', { email: 'sup.r@x.co' });
  const inv = (await sup.call('/api/app/supervisors')).body.invites[0];
  await sup.call('/api/app/supervisors/accept', { id: inv.id });
  const link = (await learner.call('/api/app/supervisors')).body.supervisors[0];
  await learner.call('/api/app/sync', { entries: [{ id: 'reviewscan1', type: 'lung', date: '2026-10-01', supervision: 'indirect' }] });
  const req = await learner.call('/api/app/signoff/request', { entryIds: ['reviewscan1'], supervisorLink: link.id });
  const code = req.body.code;
  const stateOf = async () => (await learner.call('/api/app/signoffs')).body.signoffs.find((s) => s.id === code);
  assert.equal((await stateOf()).reviewState, 'pending');
  assert.equal((await sup.call('/api/app/supervise/request/accept', { kind: 'signoff', code })).body.state, 'under_review');
  assert.equal((await stateOf()).reviewState, 'under_review');
  const stranger = await verifiedAccount(env, 'stranger.r@x.co');
  assert.equal((await stranger.call('/api/app/supervise/request/decline', { kind: 'signoff', code, reason: 'Not mine' })).status, 404, 'only the supervisor it was sent to');
  assert.equal((await sup.call('/api/app/supervise/request/decline', { kind: 'signoff', code, reason: '' })).status, 400);
  assert.equal((await sup.call('/api/app/supervise/request/decline', { kind: 'signoff', code, reason: 'I did not supervise this scan.' })).body.state, 'declined');
  const s = await stateOf();
  assert.deepEqual([s.reviewState, s.returned.reason, s.returned.note], ['declined', 'declined', 'I did not supervise this scan.']);
  assert.equal((await sup.call('/api/app/supervise/request/accept', { kind: 'signoff', code })).status, 404, 'no longer theirs');
  const entry = (await learner.call('/api/app/sync?since=0')).body.entries.find((e) => e.id === 'reviewscan1');
  assert.ok(!entry.signoff, 'declining changes nothing in the logbook');
  const audit = (await env.DB.prepare("SELECT action FROM audit_events WHERE action LIKE 'request.%' ORDER BY id").all()).results.map((r) => r.action);
  assert.deepEqual(audit, ['request.accept', 'request.decline']);
});
