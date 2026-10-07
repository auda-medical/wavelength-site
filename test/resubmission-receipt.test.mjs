// Applicant receipts for supervisor applications and renewals: one on the first send, a fresh one for every
// resubmission after "Ask for more information", and never a duplicate for a double tap or a retried delivery.
// The Wavelength team gets an email for every legitimate send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from './helpers/verify.mjs';
import { supervisorsAdminPost } from '../worker/supervisors-admin.js';
import { deliver, queue, render } from '../worker/notify.js';
import { ukDate, addDays } from '../worker/time.js';

const mail = [];
globalThis.fetch = async (u, init) => { mail.push(JSON.parse(init.body)); return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 30));
const to = (addr) => mail.filter((m) => m.to[0].email_address.address === addr).map((m) => m.subject);
const ADMIN = 'hello@thewavelength.co.uk';
const ON = { SUPERVISOR_APPLY: 'true', ZEPTOMAIL_TOKEN: 'test' };
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength', ctx);
const EXPLAIN = 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.';
const appOf = (env, sid) => env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(sid).first();
const outbox = async (env, sid) => (await env.DB.prepare('SELECT key, kind, status FROM notification_log WHERE learner_id = ? ORDER BY created_at, key').bind(sid).all()).results;

async function applicant(env, email) {
  const c = await verifiedAccount(env, email, { organisation: 'Darent Valley Hospital' });
  const r = await c.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Darent Valley Hospital',
    registration: { regulator: 'gmc', number: '1234567', profession: 'Doctor', organisation: 'Darent Valley Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: EXPLAIN, evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { c, sid: await idOf(env, email) };
}
const send = async (c) => { const r = await c.call('/api/app/supervisor/submit', { declaration: true }); await settle(); return r; };
const ask = async (env, id, notes) => { const r = await admin(env, { action: 'app_more', app: id, notes }); await settle(); return r; };

test('initial send, two returns and two resubmissions: one receipt each, admin told each time, no duplicates', async () => {
  const env = makeEnv(ON);
  const email = 'resend@x.co';
  const { c, sid } = await applicant(env, email);
  await settle();
  mail.length = 0;

  // 1. First send: exactly one "received" receipt and one admin email.
  assert.equal((await send(c)).status, 200);
  const a = await appOf(env, sid);
  assert.deepEqual(to(email), ['Wavelength supervisor application received']);
  assert.deepEqual(to(ADMIN), ['New supervisor application to review']);
  // A double tap of the same send: refused, nothing queued, nothing sent.
  assert.equal((await send(c)).status, 404);
  assert.deepEqual(to(email), ['Wavelength supervisor application received']);

  // 2. Returned for more information, then sent again: a fresh "updated" receipt.
  assert.match((await ask(env, a.id, 'Please add LP if it applies.')).m, /More information requested/);
  assert.equal(to(email).at(-1), 'More information needed for your supervisor application');
  assert.equal((await send(c)).status, 200);
  assert.deepEqual(to(email).filter((s) => /received/.test(s)), ['Wavelength supervisor application received', 'Updated supervisor application received']);
  assert.deepEqual(to(ADMIN), ['New supervisor application to review', 'Updated supervisor application to review']);
  const updated = mail.filter((m) => m.subject === 'Updated supervisor application received')[0];
  assert.match(updated.htmlbody, /Updated application received/);
  assert.match(updated.htmlbody, /Thank you\. We have received your updated Wavelength supervisor application and it is back with the Wavelength team for review\./);
  assert.match(updated.htmlbody, /usually reviewed quickly/);
  assert.match(updated.htmlbody, /\/app\/#\/supervisor"/);

  // 3. A second return and resubmission: its own receipt again.
  await ask(env, a.id, 'Please also confirm your current employer.');
  // Two taps at once on the same state: one send goes through, the other is refused.
  const both = await Promise.all([c.call('/api/app/supervisor/submit', { declaration: true }), c.call('/api/app/supervisor/submit', { declaration: true })]);
  await settle();
  assert.equal(both.filter((r) => r.status === 200).length, 1, 'one send goes through');
  assert.ok(both.some((r) => [404, 409].includes(r.status)), 'the other is refused');
  assert.deepEqual(to(email).filter((s) => /received/.test(s)), ['Wavelength supervisor application received', 'Updated supervisor application received', 'Updated supervisor application received']);
  assert.equal(to(ADMIN).length, 3, 'the team hears about every send');

  // A retried delivery, a later daily run and a retried queue of the same event send nothing more.
  const rows = await outbox(env, sid);
  const receipts = rows.filter((r) => /_(received|resubmitted):/.test(r.key));
  assert.equal(receipts.length, 3);
  assert.equal(new Set(receipts.map((r) => r.key)).size, 3, 'three distinct keys');
  assert.ok(receipts.every((r) => r.status === 'sent'));
  const before = mail.length;
  await deliver(env, receipts.map((r) => r.key));
  await deliver(env);
  const last = receipts.at(-1);
  await queue(env, { key: last.key, learnerId: sid, kind: last.kind, to: email, data: {} });
  await deliver(env, [last.key]);
  assert.equal(mail.length, before, 'no duplicate emails');
  assert.equal((await appOf(env, sid)).id, a.id, 'same application throughout');
});

test('renewals: one receipt on sending, a fresh one after each return for more information', async () => {
  const env = makeEnv(ON);
  const email = 'renew.resend@x.co';
  const { c, sid } = await applicant(env, email);
  await send(c);
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(sid).first();
  assert.equal((await admin(env, { action: 'reg_verify', learner: sid, sid: reg.id, register_name: 'John Smith', checked: '1', notes: 'GMC register' })).m, 'Registration verified.');
  assert.match((await admin(env, { action: 'app_approve', app: (await appOf(env, sid)).id, scope: ['famus:famus-thoracic'], notes: 'Basis' })).m, /^Approved until/);
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), 20), sid).run();
  await settle();
  mail.length = 0;

  assert.equal((await c.call('/api/app/supervisor/renew', {})).status, 200);
  await c.call('/api/app/supervisor/application', { nothingChanged: true });
  assert.equal((await send(c)).status, 200);
  const r = await appOf(env, sid);
  assert.equal(r.kind, 'renewal');
  assert.deepEqual(to(email), ['Supervisor renewal received']);
  assert.deepEqual(to(ADMIN), ['New supervisor renewal to review']);

  for (const n of [1, 2]) {
    await ask(env, r.id, `Question ${n}.`);
    await c.call('/api/app/supervisor/application', { changesNote: `Answer ${n}.` });
    assert.equal((await send(c)).status, 200);
    assert.equal((await send(c)).status, 404, 'a second tap after sending is refused');
  }
  assert.deepEqual(to(email).filter((s) => /received/.test(s)), ['Supervisor renewal received', 'Updated supervisor renewal received', 'Updated supervisor renewal received']);
  assert.deepEqual(to(ADMIN), ['New supervisor renewal to review', 'Updated supervisor renewal to review', 'Updated supervisor renewal to review']);
  const renewed = mail.filter((m) => m.subject === 'Updated supervisor renewal received')[0];
  assert.match(renewed.htmlbody, /Updated renewal received/);
  assert.match(renewed.htmlbody, /We have received your updated Wavelength supervisor renewal and it is back with the Wavelength team for review\./);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?').bind(sid).first()).n, 1, 'resending approves nothing new');
});

test('the updated receipts render cleanly', () => {
  for (const k of ['app_resubmitted', 'renew_resubmitted']) {
    const m = render(k, { firstName: 'Ann', reviewOn: '2027-10-06' });
    assert.ok(m && m.subject && m.text, k);
    assert.ok(!/—/.test(m.text + m.subject), `${k}: no em dashes`);
    assert.match(m.text, /usually reviewed quickly/);
  }
  assert.equal(render('app_admin', { application: 3, resubmitted: true }).subject, 'Updated supervisor application to review');
  assert.equal(render('app_admin', { application: 3 }).subject, 'New supervisor application to review');
});
