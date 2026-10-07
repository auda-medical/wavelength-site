// The admin "Send submission receipt" action: recovers an applicant receipt that the old resubmission bug never
// queued, by rebuilding the exact key the submit code uses for the current submission and sending it through the
// normal outbox. It never sends a second copy and never changes the application, its credentials or approvals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from './helpers/verify.mjs';
import { supervisorsAdminPost, supervisorsAdminHtml } from '../worker/supervisors-admin.js';
import { receiptKey } from '../worker/supervisor-apply.js';
import { ukDate, addDays } from '../worker/time.js';

const mail = [];
globalThis.fetch = async (u, init) => { mail.push(JSON.parse(init.body)); return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 30));
const to = (addr) => mail.filter((m) => m.to[0].email_address.address === addr).map((m) => m.subject);
const ON = { SUPERVISOR_APPLY: 'true', ZEPTOMAIL_TOKEN: 'test' };
const admin = (env, o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Firas', ...o }), 'wavelength', ctx);
const EXPLAIN = 'I have led the emergency department ultrasound programme for six years and supervise lung and cardiac scans weekly.';
const appOf = (env, sid) => env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(sid).first();
const row = (env, key) => env.DB.prepare('SELECT key, kind, status FROM notification_log WHERE key = ?').bind(key).first();
const receipts = async (env, sid) => (await env.DB.prepare('SELECT key FROM notification_log WHERE learner_id = ? ORDER BY created_at, key').bind(sid).all()).results.map((x) => x.key).filter((k) => /^(app|renew)_(received|resubmitted):/.test(k));
const audits = async (env, id) => (await env.DB.prepare("SELECT actor_type, actor_id, meta FROM audit_events WHERE action = 'application.receipt' AND subject_type = 'application' AND subject_id = ? ORDER BY id").bind(String(id)).all()).results.map((r) => ({ ...r, meta: JSON.parse(r.meta) }));
// Everything the action must leave alone.
const snapshot = async (env, sid) => ({
  app: await appOf(env, sid),
  credentials: (await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? ORDER BY id').bind(sid).all()).results,
  approvals: (await env.DB.prepare('SELECT * FROM supervisor_approvals WHERE learner_id = ? ORDER BY id').bind(sid).all()).results,
  registrations: (await env.DB.prepare('SELECT * FROM professional_registrations WHERE learner_id = ? ORDER BY id').bind(sid).all()).results,
});

async function applicant(env, email) {
  const c = await verifiedAccount(env, email, { organisation: 'Darent Valley Hospital' });
  const r = await c.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Darent Valley Hospital',
    registration: { regulator: 'gmc', number: '1234567', profession: 'Doctor', organisation: 'Darent Valley Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: EXPLAIN, evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'],
    credentials: [{ type: 'famus-supervisor', modules: ['thoracic', 'lp'] }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { c, sid: await idOf(env, email) };
}
const send = async (c) => { const r = await c.call('/api/app/supervisor/submit', { declaration: true }); assert.equal(r.status, 200, JSON.stringify(r.body)); await settle(); return r; };
const ask = async (env, id) => { assert.match((await admin(env, { action: 'app_more', app: id, notes: 'Please add LP if it applies.' })).m, /More information requested/); await settle(); };
const recover = async (env, id) => { const r = await admin(env, { action: 'app_receipt', app: id }); await settle(); return r.m; };
// What the old bug left behind: the resubmission's receipt was never queued (its insert was ignored).
const loseReceipt = (env, key) => env.DB.prepare('DELETE FROM notification_log WHERE key = ?').bind(key).run();

test('recovers a missing receipt after a resubmission, once, without touching the application', async () => {
  const env = makeEnv(ON);
  const email = 'recover.resubmit@x.co';
  const { c, sid } = await applicant(env, email);
  await send(c);
  const a = await appOf(env, sid);
  await ask(env, a.id);
  await send(c);
  const now = await appOf(env, sid);
  assert.equal(now.status, 'submitted');
  assert.ok(now.more_info_at < now.submitted_at);
  const key = `app_resubmitted:${a.id}:${now.more_info_at}`;
  assert.deepEqual(receiptKey(now), { kind: 'app_resubmitted', resubmit: true, key }, 'the action rebuilds the key the submit code used');
  assert.equal((await row(env, key)).status, 'sent');
  await loseReceipt(env, key);
  const before = await snapshot(env, sid);
  mail.length = 0;

  assert.equal(await recover(env, a.id), 'The updated submission receipt was sent.');
  assert.deepEqual(to(email), ['Updated supervisor application received']);
  assert.match(mail[0].htmlbody, /We have received your updated Wavelength supervisor application/);
  assert.equal(mail.length, 1, 'only the applicant is emailed; the team is not told again');
  assert.deepEqual(await row(env, key), { key, kind: 'app_resubmitted', status: 'sent' }, 'a normal outbox row, keyed as the submit code keys it');

  // Pressed again: nothing more is sent.
  assert.equal(await recover(env, a.id), 'Receipt already sent');
  assert.equal(mail.length, 1);
  const log = await audits(env, a.id);
  assert.deepEqual(log.map((x) => x.meta), [
    { kind: 'initial', template: 'app_resubmitted', outcome: 'queued' },
    { kind: 'initial', template: 'app_resubmitted', outcome: 'already_sent' },
  ]);
  assert.ok(log.every((x) => x.actor_type === 'admin' && /Firas/.test(x.actor_id)));
  assert.deepEqual(await snapshot(env, sid), before, 'application, credentials, approvals and registration unchanged');
  // The application's own receipts: the original one and the recovered one, nothing else.
  assert.deepEqual(await receipts(env, sid), [`app_received:${a.id}`, key]);
});

test('refuses to duplicate a receipt that was already sent', async () => {
  const env = makeEnv(ON);
  const email = 'recover.dup@x.co';
  const { c, sid } = await applicant(env, email);
  await send(c);
  const a = await appOf(env, sid);
  await ask(env, a.id);
  await send(c);
  const before = await snapshot(env, sid);
  mail.length = 0;
  assert.equal(await recover(env, a.id), 'Receipt already sent');
  assert.equal(await recover(env, a.id), 'Receipt already sent');
  assert.equal(mail.length, 0, 'nothing sent');
  assert.equal((await audits(env, a.id)).length, 2, 'each press is still audited');
  assert.deepEqual(await snapshot(env, sid), before);
});

test('recovers a missing receipt for an initial submission', async () => {
  const env = makeEnv(ON);
  const email = 'recover.initial@x.co';
  const { c, sid } = await applicant(env, email);
  await send(c);
  const a = await appOf(env, sid);
  assert.equal(a.more_info_at, null);
  const key = `app_received:${a.id}`;
  assert.equal(receiptKey(a).key, key);
  await loseReceipt(env, key);
  const before = await snapshot(env, sid);
  mail.length = 0;
  assert.equal(await recover(env, a.id), 'The submission receipt was sent.');
  assert.deepEqual(to(email), ['Wavelength supervisor application received']);
  assert.equal((await row(env, key)).status, 'sent');
  assert.equal(await recover(env, a.id), 'Receipt already sent');
  assert.equal(mail.length, 1);
  assert.deepEqual(await snapshot(env, sid), before);
});

test('recovers renewal receipts, first send and after a return for more information', async () => {
  const env = makeEnv(ON);
  const email = 'recover.renew@x.co';
  const { c, sid } = await applicant(env, email);
  await send(c);
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(sid).first();
  assert.equal((await admin(env, { action: 'reg_verify', learner: sid, sid: reg.id, register_name: 'John Smith', checked: '1', notes: 'GMC register' })).m, 'Registration verified.');
  assert.match((await admin(env, { action: 'app_approve', app: (await appOf(env, sid)).id, scope: ['famus:famus-thoracic'], notes: 'Basis' })).m, /^Approved until/);
  await env.DB.prepare('UPDATE supervisor_approvals SET review_on = ? WHERE learner_id = ?').bind(addDays(ukDate(), 20), sid).run();
  assert.equal((await c.call('/api/app/supervisor/renew', {})).status, 200);
  await c.call('/api/app/supervisor/application', { nothingChanged: true });
  await send(c);
  const r = await appOf(env, sid);
  assert.equal(r.kind, 'renewal');

  // First renewal send, receipt lost.
  await loseReceipt(env, `renew_received:${r.id}`);
  let before = await snapshot(env, sid);
  mail.length = 0;
  assert.equal(await recover(env, r.id), 'The submission receipt was sent.');
  assert.deepEqual(to(email), ['Supervisor renewal received']);
  assert.deepEqual(await snapshot(env, sid), before);

  // Returned, resent, receipt lost.
  await ask(env, r.id);
  await c.call('/api/app/supervisor/application', { changesNote: 'Answer.' });
  await send(c);
  const now = await appOf(env, sid);
  const key = `renew_resubmitted:${r.id}:${now.more_info_at}`;
  assert.equal(receiptKey(now).key, key);
  await loseReceipt(env, key);
  before = await snapshot(env, sid);
  mail.length = 0;
  assert.equal(await recover(env, r.id), 'The updated submission receipt was sent.');
  assert.deepEqual(to(email), ['Updated supervisor renewal received']);
  assert.match(mail[0].htmlbody, /We have received your updated Wavelength supervisor renewal/);
  assert.equal(await recover(env, r.id), 'Receipt already sent');
  assert.equal(mail.length, 1);
  assert.deepEqual(await snapshot(env, sid), before, 'renewal, approvals and credentials unchanged');
  assert.deepEqual((await audits(env, r.id)).map((x) => x.meta.template), ['renew_received', 'renew_resubmitted', 'renew_resubmitted']);
});

test('only for a submitted application; a receipt already in the outbox is delivered or left alone, never doubled', async () => {
  const env = makeEnv({ SUPERVISOR_APPLY: 'true' }); // No mail token: receipts stay in the outbox.
  const email = 'recover.state@x.co';
  const { c, sid } = await applicant(env, email);
  const draft = await appOf(env, sid);
  assert.equal(await recover(env, draft.id), 'This application has already been decided or withdrawn.');
  await send(c);
  const a = await appOf(env, sid);
  const page = (await supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/?app=${a.id}`), 'wavelength'));
  assert.match(page, /Send submission receipt/);
  await ask(env, a.id);
  const waiting = await supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/?app=${a.id}`), 'wavelength');
  assert.doesNotMatch(waiting, /Send submission receipt/, 'not offered while waiting for information');
  const before = await snapshot(env, sid);
  assert.equal(await recover(env, a.id), 'A receipt can be sent only while the application is submitted.');
  assert.deepEqual(await snapshot(env, sid), before);
  assert.equal((await audits(env, a.id)).length, 0);

  await send(c);
  const now = await appOf(env, sid);
  const key = receiptKey(now).key;
  // Without a mail token the automatic send failed; the outbox owns retries, so the action sends nothing.
  const status = (await row(env, key)).status;
  assert.notEqual(status, 'sent');
  mail.length = 0;
  if (status === 'pending') assert.match(await recover(env, a.id), /in the email outbox/);
  else assert.equal(await recover(env, a.id), `This receipt is already in the email outbox with status "${status}". Nothing was sent. Check it on the System tab.`);
  await env.DB.prepare("UPDATE notification_log SET status = 'unknown' WHERE key = ?").bind(key).run();
  assert.match(await recover(env, a.id), /status "unknown"\. Nothing was sent/);
  assert.equal(mail.length, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notification_log WHERE key = ?').bind(key).first()).n, 1);
});
