// The supervisor invitation email follows the live switches (invitationWording in worker/supervise.js). With
// SUPERVISOR_APPROVAL_REQUIRED off, accepting activates the link at once, so the email must never say that Wavelength
// approval or checking comes first; it offers the application and says the learner sees the supervisor's status. With
// it on, the email says approval is required before dashboard supervision begins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';
import { withMailbox, verifiedAccount } from './helpers/verify.mjs';
import { invitationWording } from '../worker/supervise.js';

// Any of these in an email sent while enforcement is off would claim more than the Worker enforces.
const MANDATORY = /approval is required|required before|checks every supervisor|before (they|you) can (sign|supervise)|must be approved|only approved/i;
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

async function invite(env, { supervisorHasAccount }) {
  return withMailbox(async (box) => {
    const learner = await verifiedAccount(env, 'trainee@x.co');
    if (supervisorHasAccount) await verifiedAccount(env, 'sup@x.co');
    box.sent.length = 0;
    const r = await learner.call('/api/app/supervisors/add', { email: 'sup@x.co' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await box.settle();
    const mails = box.sent.filter((m) => m.to[0].email_address.address === 'sup@x.co');
    assert.equal(mails.length, 1);
    return { html: strip(mails[0].htmlbody), text: String(mails[0].textbody), subject: mails[0].subject };
  });
}

for (const supervisorHasAccount of [false, true]) {
  const who = supervisorHasAccount ? 'an existing account' : 'no account yet';
  test(`invitation, applications on and enforcement off (${who}): no claim that approval is mandatory`, async () => {
    const env = makeEnv({ SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: 'test' });
    const m = await invite(env, { supervisorHasAccount });
    assert.doesNotMatch(m.html, MANDATORY);
    assert.doesNotMatch(m.text, MANDATORY);
    assert.match(m.html, /apply in the app to become a Wavelength-approved supervisor/);
    assert.match(m.html, /sees whether you are Wavelength-approved or not yet verified/);
    assert.match(m.html, supervisorHasAccount ? /Log in and accept/ : /Create your account/);
  });

  test(`invitation, applications on and enforcement on (${who}): says approval comes before dashboard supervision`, async () => {
    const env = makeEnv({ SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'true', ZEPTOMAIL_TOKEN: 'test' });
    const m = await invite(env, { supervisorHasAccount });
    assert.match(m.html, /Wavelength approval is required before dashboard supervision begins/);
    assert.doesNotMatch(m.html, /checks every supervisor before they can sign anything/, 'one-off signers can still sign without approval');
    assert.match(m.html, supervisorHasAccount ? /Continue to supervisor verification/ : /Register as a supervisor/);
  });
}

test('invitation wording: every combination with enforcement off stays optional; only enforcement makes it mandatory', () => {
  for (const journey of [false, true]) for (const hasAccount of [false, true]) for (const approved of [false, true]) {
    const off = invitationWording({ journey, required: false, hasAccount, approved, learner: 'Sam Patel' });
    assert.doesNotMatch(off.next, MANDATORY, JSON.stringify({ journey, hasAccount, approved }));
    assert.ok(['Log in and accept', 'Create your account'].includes(off.label), off.label);
    const on = invitationWording({ journey, required: true, hasAccount, approved, learner: 'Sam Patel' });
    if (approved) assert.equal(on.label, 'Log in and accept');
    else assert.match(on.next, /Wavelength approval is required before dashboard supervision begins/);
  }
  // Applications closed and enforcement off: exactly the wording used before supervisor applications existed.
  assert.deepEqual(invitationWording({ journey: false, required: false, hasAccount: false, approved: false }), { label: 'Create your account', next: 'Create a free Wavelength account with this email address to accept.' });
  assert.deepEqual(invitationWording({ journey: false, required: false, hasAccount: true, approved: false }), { label: 'Log in and accept', next: 'Log in to Wavelength with this email address to accept.' });
  for (const w of [true, false].flatMap((r) => [true, false].map((h) => invitationWording({ journey: true, required: r, hasAccount: h, approved: false })))) assert.doesNotMatch(w.next, /—/, 'no em dashes');
});

test('the deployed configuration (wrangler.jsonc) sends the optional wording', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  assert.equal(env.SUPERVISOR_APPROVAL_REQUIRED, 'false');
  const m = await invite(env, { supervisorHasAccount: false });
  assert.doesNotMatch(m.html, MANDATORY);
});
