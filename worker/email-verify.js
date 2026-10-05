// Email ownership verification for app accounts, Academy learners and supervisors.
// A token is 32 random bytes sent only in the email link's #fragment (never logged by servers or sent as a referrer).
// D1 stores its SHA-256 hash. Tokens are single use (claimed atomically), expire, and are throttled per account.
// Opening the link (/app/#/verify-email/<token>) posts the token from the page, so email scanners that only fetch the
// URL cannot use it up. Verification is bound to the token, not to a browser session, so a link opened in Safari or
// Chrome still verifies an account that is logged in inside the iOS or Android app.
// Purposes:
//   verify  marks the email verified. Never logs anyone in.
//   claim   an Academy-only learner (no password) finishes creating their app account: sets the password they chose,
//           logs out every older session, logs this browser in.
//   signin  an Academy-only learner returns to the Academy: applies the details they typed, logs this browser in.
// Newsletter consent is separate and never needed for any of this.
import { SITE, json, clip, sha256, token, body, account, fullName, verificationReady, hashPassword } from './app-util.js';
import { sendMail, cookieFor, revokeSessions } from './academy.js';

const TTL = { verify: 72 * 3600e3, claim: 24 * 3600e3, signin: 30 * 60e3 };
const MIN_GAP = 2 * 60e3; // one email of each kind every two minutes per account
const DAY_MAX = 6; // and at most six a day
const FAIL = 'This link has expired or has already been used. Open the Wavelength app to send a new one.';

// Claim and sign-in links carry details typed by whoever filled in the form (a password, a name). Those details are
// applied only in the browser that typed them, recognised by this HttpOnly nonce. Anyone else opening the link
// (including the real owner of an address someone else typed) must choose their own password, and typed names are
// never applied. This stops "sign up with someone's email, wait for them to click".
const NONCE = 'wl_claim';
export async function newNonce() { const n = token(); return { hash: await sha256(n), cookie: `${NONCE}=${n}; Path=/api/app/email/verify; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` }; }
const clearNonce = `${NONCE}=; Path=/api/app/email/verify; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
async function sameBrowser(req, pending) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(NONCE + '=([A-Za-z0-9_-]+)'));
  return !!(m && pending.nonce && (await sha256(m[1])) === pending.nonce);
}
const withCookies = (res, cookies) => { for (const c of cookies) res.headers.append('Set-Cookie', c); return res; };

// Email verification needs the migration and working email. EMAIL_VERIFY = "off" is an emergency switch back to the
// old behaviour without a code change.
export const mailOn = (env) => !!env.ZEPTOMAIL_TOKEN && env.EMAIL_VERIFY !== 'off';
export async function emailVerifyOn(env) { return mailOn(env) && (await verificationReady(env)); }
// Whether this account must verify before a protected action (accepting an invitation, professional verification).
export async function mustVerify(env, l) { return l.email_status !== 'verified' && (await emailVerifyOn(env)); }

async function event(env, learnerId, action, outcome, method, notes) {
  try {
    await env.DB.prepare("INSERT INTO verification_events (learner_id, subject_type, subject_id, action, outcome, actor, method, notes) VALUES (?,'email',?,?,?,?,?,?)")
      .bind(learnerId, learnerId, action, outcome, 'learner', method || null, notes || null).run();
  } catch { /* the audit trail must never block a login */ }
}

// Creates a token unless the account has had one too recently. Returns the token, or null when throttled.
export async function issueToken(env, l, purpose, pending) {
  const now = Date.now();
  // The two-minute gap is per purpose (a sign-in link straight after a confirmation email is fine); the daily cap
  // covers every purpose, so the forms cannot be used to flood someone's inbox.
  const r = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(CASE WHEN purpose = ? THEN created_at END) AS last FROM email_tokens WHERE learner_id = ? AND created_at > ?').bind(purpose, l.id, now - 864e5).first();
  if (r && (r.n >= DAY_MAX || (r.last && now - r.last < MIN_GAP))) return null;
  const t = token();
  await env.DB.prepare('INSERT INTO email_tokens (token_hash, learner_id, email, purpose, pending, created_at, expires_at) VALUES (?,?,?,?,?,?,?)')
    .bind(await sha256(t), l.id, String(l.email).toLowerCase(), purpose, pending ? JSON.stringify(pending) : null, now, now + TTL[purpose]).run();
  return t;
}

const COPY = {
  verify: { subject: 'Confirm your email for Wavelength', heading: 'Confirm your email', lines: ['Please confirm this is your email address. It keeps your logbook, certificates and sign-offs tied to you, and lets supervisors find and trust you.', 'The link works for three days. If you did not create a Wavelength account, ignore this email.'], button: 'Confirm my email' },
  claim: { subject: 'Finish creating your Wavelength account', heading: 'Finish creating your account', lines: ['Someone, hopefully you, asked to add a password to the Wavelength account for this email. Your Academy certificates stay in the account.', 'Use the button within 24 hours to finish. If it was not you, ignore this email and nothing changes.'], button: 'Finish creating my account' },
  signin: { subject: 'Your Wavelength Academy sign-in link', heading: 'Sign in to Wavelength Academy', lines: ['Use the button within 30 minutes to carry on with your module. It signs in the browser you open it in.', 'If you did not ask for this, ignore this email.'], button: 'Sign in and continue' },
};
export async function sendTokenEmail(env, l, t, purpose) {
  const c = COPY[purpose];
  const link = `${SITE}/app/#/verify-email/${t}`;
  return sendMail(env, {
    to: l.email, toName: fullName(l), subject: c.subject, heading: c.heading,
    paragraphs: [`Hello ${l.first_name},`, ...c.lines], button: { href: link, label: c.button },
    text: `Hello ${l.first_name},\n\n${c.lines.join('\n\n')}\n\n${link}`,
  });
}
// Issue and send in one go. Quietly does nothing when throttled or when email is off.
export async function sendVerification(env, l, purpose = 'verify', pending = null) {
  if (!(await emailVerifyOn(env))) return false;
  const t = await issueToken(env, l, purpose, pending);
  if (!t) return false;
  await event(env, l.id, `${purpose}_sent`, 'sent', purpose);
  return sendTokenEmail(env, l, t, purpose);
}

// POST /api/app/email/resend (logged in). The answer is the same whether or not an email went out.
export async function resend(env, l) {
  if (l.email_status === 'verified') return json({ ok: true, verified: true });
  if (!(await emailVerifyOn(env))) return json({ ok: true, emailOn: false });
  await sendVerification(env, l, 'verify');
  return json({ ok: true, emailOn: true });
}

// POST /api/app/email/verify { token } (public: the token is the credential).
export async function verifyToken(env, req) {
  if (!(await verificationReady(env))) return json({ ok: false, error: FAIL }, 410);
  const d = await body(req);
  const h = await sha256(clip(d && d.token, 100));
  const row = await env.DB.prepare('SELECT * FROM email_tokens WHERE token_hash = ?').bind(h).first();
  const now = Date.now();
  if (!row || row.used_at || row.expires_at < now) return json({ ok: false, error: FAIL }, 410);
  const pending = row.pending ? JSON.parse(row.pending) : {};
  const mine = await sameBrowser(req, pending);
  let ownHash = null;
  if (row.purpose === 'claim' && !mine) {
    // Opened somewhere other than where the account was started: the opener chooses the password. The token is not
    // used up until they do.
    const pw = String((d && d.password) || '');
    if (pw.length < 10 || pw.length > 200) return json({ ok: false, needPassword: true, error: 'Choose a password of at least 10 characters to finish creating your account.' }, 400);
    ownHash = await hashPassword(pw);
  }
  // Claim it first, so two clicks (or a replay) cannot both succeed.
  const claim = await env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').bind(now, h, now).run();
  if (!(claim.meta && claim.meta.changes)) return json({ ok: false, error: FAIL }, 410);
  const l = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(row.learner_id).first();
  // The account changed its email since the link was sent: the link proves nothing about the new address.
  if (!l || String(l.email).toLowerCase() !== row.email) return json({ ok: false, error: FAIL }, 410);
  await env.DB.prepare("UPDATE learners SET email_status = 'verified', email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ? AND email = ?").bind(l.id, l.email).run();
  await event(env, l.id, 'verified', 'verified', row.purpose);
  if (row.purpose === 'claim') {
    // Typed names apply only in the browser that typed them.
    if (!mine) { pending.title = l.title; pending.first = l.first_name; pending.last = l.last_name; pending.role = ''; pending.org = ''; pending.news = 0; }
    const set = await env.DB.prepare("UPDATE learners SET password_hash = ?, title = ?, first_name = ?, last_name = ?, role = COALESCE(NULLIF(?, ''), role), organisation = COALESCE(NULLIF(?, ''), organisation), newsletter = MAX(newsletter, ?), profile = COALESCE(profile, ?), last_seen = datetime('now') WHERE id = ? AND password_hash IS NULL")
      .bind(ownHash || pending.hash, pending.title || '', pending.first || l.first_name, pending.last || l.last_name, pending.role || '', pending.org || '', pending.news ? 1 : 0, pending.profile || '{}', l.id).run();
    if (!(set.meta && set.meta.changes)) return json({ ok: true, verified: true, error: 'Your email is confirmed. This account already has a password, so log in with it.' });
    // Anyone who reached the Academy-only account by typing the email is logged out now it has a password.
    await revokeSessions(env, l.id);
    const fresh = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(l.id).first();
    return withCookies(json({ ok: true, verified: true, purpose: 'claim', account: account(fresh) }), [await cookieFor(env, l.id), clearNonce]);
  }
  if (row.purpose === 'signin') {
    if (!l.password_hash && pending.first && mine) {
      await env.DB.prepare("UPDATE learners SET title = ?, first_name = ?, last_name = ?, role = COALESCE(NULLIF(?, ''), role), organisation = COALESCE(NULLIF(?, ''), organisation), newsletter = MAX(newsletter, ?), last_seen = datetime('now') WHERE id = ?")
        .bind(pending.title || '', pending.first, pending.last || l.last_name, pending.role || '', pending.org || '', pending.news ? 1 : 0, l.id).run();
    }
    const next = /^\/elearning\/[a-z0-9-]+\//.test(pending.next || '') ? pending.next : '/elearning/';
    // An account with a password always logs in with it: the link only confirms the email.
    if (l.password_hash) return json({ ok: true, verified: true, purpose: 'signin', next: `/app/?login=${encodeURIComponent(l.email)}&next=${encodeURIComponent(next)}` });
    return withCookies(json({ ok: true, verified: true, purpose: 'signin', next }), [await cookieFor(env, l.id), clearNonce]);
  }
  return json({ ok: true, verified: true, purpose: 'verify' });
}
