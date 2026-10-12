// Helpers for the verification tests: a mailbox that captures ZeptoMail calls, and ready-made accounts.
import assert from 'node:assert/strict';
import { client } from './env.mjs';
import { handleApp } from '../../worker/app.js';
import { ukDate } from '../../worker/time.js';

export const PASSWORD = 'Correct horse battery 1!';
export const SIG = 'data:image/png;base64,iVBORw0KGgo=';

// Replaces fetch while fn runs. Every email sent is captured; tokens() pulls the email-link tokens out of them.
export async function withMailbox(fn) {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => { sent.push({ url: String(u), ...JSON.parse(init.body) }); return new Response('{}'); };
  const box = {
    sent,
    tokens: () => sent.map((m) => (String(m.textbody).match(/verify-email\/([A-Za-z0-9_-]+)/) || [])[1]).filter(Boolean),
    invites: () => sent.map((m) => (String(m.textbody).match(/invite=([A-Za-z0-9_-]+)/) || [])[1]).filter(Boolean),
    settle: () => new Promise((r) => setTimeout(r, 20)),
  };
  try { return await fn(box); } finally { globalThis.fetch = real; }
}

export async function signup(env, email, extra = {}) {
  const c = client(handleApp, env);
  const r = await c.call('/api/app/signup', { firstName: 'John', lastName: 'Smith', email, password: PASSWORD, terms: true, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}
export const idOf = async (env, email) => (await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind(email).first()).id;
// Marks the email verified directly, for tests about later steps.
export async function markVerified(env, email) {
  await env.DB.prepare("UPDATE learners SET email_status = 'verified', email_verified_at = datetime('now') WHERE email = ?").bind(email).run();
}
export async function verifiedAccount(env, email, extra = {}) {
  const c = await signup(env, email, extra);
  await markVerified(env, email);
  return c;
}
// A FormData-like object for the admin POST handler.
export function adminForm(o) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, String(x)));
  return f;
}
// The admin's GMC register check form (worker/verification/register-review.js), every required box confirmed and
// nothing shown that needs consideration. Pass overrides to change one answer.
export const gmcCheck = (o = {}) => ({ register_name: 'John Smith', number_matched: '1', registration_current: '1', licence_current: '1', restriction: 'none', checked_on: ukDate(), notes: 'GMC register', ...o });
