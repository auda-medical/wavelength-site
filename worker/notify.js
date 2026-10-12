// Notification outbox for supervisor lifecycle emails (notification_log, migration 0012).
//
// Duplicate protection, stated exactly: every email has a unique key (for example "app_received:<application>").
// The row is written before anything is sent, in the same D1 batch as the state change where there is one, so a
// retried request, a double tap or a second run of the daily job cannot queue a second copy. A sender claims a row
// (pending or failed to 'sending') with a guarded update before calling the email provider, so two senders cannot both
// send it. This gives at most one email per event in normal operation. It is not "exactly once": ZeptoMail offers no
// idempotency key, so if the provider accepts a message but the answer never reaches the Worker (a timeout or a lost
// connection), the row is marked 'unknown' and is never retried automatically. An administrator can see these on the
// System page, check the recipient's mailbox or the ZeptoMail log, and resend or mark as sent. A provider error (it
// answered, and refused) is 'failed' and retried by the daily job, up to three attempts in all.
import { sendMailResult } from './academy.js';
import { SITE } from './app-util.js';
import { nowIso, longDate } from './time.js';

const SUPPORT = 'hello@thewavelength.co.uk';
const REVIEW_TIME = `Supervisor applications are usually reviewed quickly. Please allow up to 3 business days during busy periods. If you have not heard from us after 3 business days, please contact us at ${SUPPORT}.`;
export const MAX_ATTEMPTS = 3;
const APP = `${SITE}/app/#`;

// A statement that queues one email. INSERT OR IGNORE: a second queue with the same key does nothing.
export function queueStmt(env, { key, learnerId = null, kind, to, toName = '', data = {} }) {
  return env.DB.prepare("INSERT OR IGNORE INTO notification_log (key, learner_id, kind, payload, status, created_at) VALUES (?,?,?,?,'pending',?)")
    .bind(String(key).slice(0, 200), learnerId, kind, JSON.stringify({ to, toName, data }), nowIso());
}
export async function queue(env, n) { await queueStmt(env, n).run(); return n.key; }

// Sends the given keys now (after a request), or every due row (daily job). Returns counts.
export async function deliver(env, keys = null, limit = 50) {
  const now = nowIso();
  const rows = keys
    ? ((await env.DB.prepare(`SELECT * FROM notification_log WHERE key IN (${keys.map(() => '?').join(',')}) AND status = 'pending'`).bind(...keys).all()).results || [])
    : ((await env.DB.prepare("SELECT * FROM notification_log WHERE (status = 'pending' OR (status = 'failed' AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?))) ORDER BY created_at LIMIT ?").bind(MAX_ATTEMPTS, now, limit).all()).results || []);
  const out = { sent: 0, failed: 0, unknown: 0, skipped: 0 };
  for (const row of rows) {
    const claim = await env.DB.prepare("UPDATE notification_log SET status = 'sending', attempts = attempts + 1 WHERE key = ? AND status IN ('pending', 'failed')").bind(row.key).run();
    if (!(claim.meta && claim.meta.changes)) { out.skipped++; continue; }
    let p; try { p = JSON.parse(row.payload || '{}'); } catch { p = {}; }
    const msg = render(row.kind, p.data || {});
    if (!msg || !p.to) {
      await env.DB.prepare("UPDATE notification_log SET status = 'failed', attempts = ?, last_error = 'no template or recipient' WHERE key = ?").bind(MAX_ATTEMPTS, row.key).run();
      out.failed++; continue;
    }
    const res = await sendMailResult(env, { to: p.to, toName: p.toName || p.to, ...msg }).catch(() => 'unknown');
    if (res === 'sent') {
      // The payload (addresses and names) is no longer needed once the email has gone.
      await env.DB.prepare("UPDATE notification_log SET status = 'sent', sent_at = ?, payload = NULL, last_error = NULL WHERE key = ?").bind(nowIso(), row.key).run();
      out.sent++;
    } else if (res === 'unknown') {
      await env.DB.prepare("UPDATE notification_log SET status = 'unknown', last_error = 'no answer from the email provider' WHERE key = ?").bind(row.key).run();
      out.unknown++;
    } else {
      // 'refused' or 'off' (no email token): try again later, at most MAX_ATTEMPTS in all.
      const next = new Date(Date.now() + 6 * 3600e3).toISOString();
      await env.DB.prepare("UPDATE notification_log SET status = 'failed', last_error = ?, next_attempt_at = ? WHERE key = ?").bind(res === 'off' ? 'email sending is not set up' : 'refused by the email provider', next, row.key).run();
      out.failed++;
    }
  }
  return out;
}
// Sends in the background after a response, where the runtime allows it.
export function deliverLater(env, ctx, keys) {
  if (!keys || !keys.length) return;
  const p = deliver(env, keys).catch(() => null);
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  return p;
}

// ---------- Templates ----------
// No email carries findings, registration numbers, evidence or reasons the recipient should not see.
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
export function render(kind, d) {
  const hi = d.firstName ? `Hello ${d.firstName},` : 'Hello,';
  const T = {
    app_received: () => ({
      subject: 'Wavelength supervisor application received',
      heading: 'Application received',
      paragraphs: [hi, 'Thank you for applying to be a Wavelength supervisor.', d.learner ? `Your application follows ${d.learner}'s invitation to supervise their ultrasound logbook. They will see that your supervisor verification is in progress.` : null, 'Your application is pending review by the Wavelength team.', REVIEW_TIME, 'We will contact you if we need more information.'],
      button: { href: `${APP}/supervisor`, label: 'See your application' },
    }),
    renew_received: () => ({
      subject: 'Supervisor renewal received',
      heading: 'Renewal received',
      paragraphs: [hi, 'Thank you for renewing your Wavelength supervisor status. Your renewal is pending review by the Wavelength team.', d.reviewOn ? `Your current approval runs until ${longDate(d.reviewOn)}. If your renewal is still being reviewed then, your status shows as "Renewal under review" for up to 30 days, as long as nothing else has changed.` : null, REVIEW_TIME],
      button: { href: `${APP}/supervisor`, label: 'See your renewal' },
    }),
    app_resubmitted: () => ({
      subject: 'Updated supervisor application received',
      heading: 'Updated application received',
      paragraphs: [hi, 'Thank you. We have received your updated Wavelength supervisor application and it is back with the Wavelength team for review.', REVIEW_TIME, 'We will contact you if we need more information.'],
      button: { href: `${APP}/supervisor`, label: 'See your application' },
    }),
    renew_resubmitted: () => ({
      subject: 'Updated supervisor renewal received',
      heading: 'Updated renewal received',
      paragraphs: [hi, 'Thank you. We have received your updated Wavelength supervisor renewal and it is back with the Wavelength team for review.', d.reviewOn ? `Your current approval runs until ${longDate(d.reviewOn)}. If your renewal is still being reviewed then, your status shows as "Renewal under review" for up to 30 days, as long as nothing else has changed.` : null, REVIEW_TIME],
      button: { href: `${APP}/supervisor`, label: 'See your renewal' },
    }),
    app_admin: () => ({
      subject: `${d.resubmitted ? 'Updated' : 'New'} supervisor ${d.renewal ? 'renewal' : 'application'} to review`,
      heading: `${d.resubmitted ? 'Updated supervisor' : 'Supervisor'} ${d.renewal ? 'renewal' : 'application'} waiting`,
      paragraphs: [d.resubmitted ? `A supervisor ${d.renewal ? 'renewal' : 'application'} (number ${d.application}) has been sent again with more information and is waiting for review.` : `A supervisor ${d.renewal ? 'renewal' : 'application'} (number ${d.application}) is waiting for review.`, d.basis ? `Basis: ${d.basis}.` : null, 'Open the supervisor verification console to review it. This email holds no personal details.'],
      button: { href: `${SITE}/admin/supervisors/?tab=new`, label: 'Open the console' },
    }),
    app_more: () => ({
      subject: 'More information needed for your supervisor application',
      heading: 'More information needed',
      paragraphs: [hi, 'The Wavelength team has looked at your supervisor application and needs a little more information before deciding.', d.note ? `What we need: ${d.note}` : null, 'Add it in the app and send your application again. You do not need to start again.', `Questions: ${SUPPORT}.`],
      button: { href: `${APP}/supervisor/apply`, label: 'Update your application' },
    }),
    // Sent only after the approval is saved (it is queued in the same D1 batch). groups: one line per approved
    // pathway and role (worker/verification/status.js groupLine), from the approval rows just written. Rows queued
    // before October 2026 carry areas instead.
    app_approved: () => ({
      subject: d.renewal ? 'Wavelength | Supervisor Verification Renewed' : 'Wavelength | Supervisor Verification Approved',
      heading: d.renewal ? 'Supervisor verification renewed' : 'Supervisor verification approved',
      paragraphs: [hi,
        d.renewal ? 'Your supervisor verification has been renewed by Wavelength.' : 'Your supervisor verification has been approved by Wavelength.',
        ...(d.groups && d.groups.length ? [`Your approved ${d.groups.length === 1 ? 'pathway and modules are' : 'pathways and modules are'}:`, ...d.groups.map((g) => `${g}.`)] : d.areas && d.areas.length ? [`Approved to supervise: ${list(d.areas)}.`] : []),
        d.reviewOn ? `Your approval runs until ${longDate(d.reviewOn)}. We will remind you to renew from 60 days before.` : null,
        d.learners && d.learners.length ? `${list(d.learners)} ${d.learners.length === 1 ? 'is' : 'are'} waiting: your supervision is now active.` : null,
        'Your verified status is available in your Wavelength profile, under Me, Wavelength supervisor.',
        'You may review eligible supervision requests in accordance with the relevant training requirements.',
        'This is Wavelength’s own verification. It is not accreditation or endorsement by RCEM, FAMUS, FUSIC, the GMC or any other body.',
        'Thank you for supporting ultrasound education.',
        'Wavelength · Tune In · Gain Clarity'],
      button: { href: `${APP}/supervisor`, label: 'Open your Wavelength profile' },
    }),
    app_rejected: () => ({
      subject: 'Update on your Wavelength supervisor application',
      heading: 'Your supervisor application',
      paragraphs: [hi, 'Thank you for applying to be a Wavelength supervisor. After review, the Wavelength team has not been able to approve your application at this time.', d.reason ? `Reason: ${d.reason}` : null, d.mayReapply ? 'You are welcome to apply again with further evidence or a fuller explanation of your experience.' : 'Please contact us before applying again.', 'Your Wavelength account and logbook are not affected.', `Questions: ${SUPPORT}.`],
    }),
    link_active: () => ({
      subject: 'Your supervisor is now active',
      heading: 'Supervisor active',
      paragraphs: [hi, `${d.supervisor} is now a Wavelength Verified Supervisor and your supervision link is active.`, 'You can send sign-off and assessment requests to their dashboard.'],
      button: { href: `${APP}/supervisors`, label: 'Open your supervisors' },
    }),
    link_ended: () => ({
      subject: 'Your supervisor request',
      heading: 'Supervisor not available',
      paragraphs: [hi, `${d.supervisor} is not available as a Wavelength supervisor at present, so your supervision request has ended.`, 'Please arrange another suitable supervisor. You can invite them from the app, or send a one-off sign-off link to someone who supervised your scan.'],
      button: { href: `${APP}/supervisors`, label: 'Open your supervisors' },
    }),
    renew: () => ({
      subject: d.days <= 7 ? 'Your Wavelength supervisor status ends in a week' : 'Your Wavelength supervisor status is due for renewal',
      heading: 'Time to renew',
      paragraphs: [hi, `Your Wavelength supervisor approval runs until ${longDate(d.reviewOn)}.`, 'Renewing takes a few minutes: check your details, confirm what has not changed, and make a fresh declaration. You only need new evidence for anything that has changed or expired.', 'If you do not renew, your supervisor status ends on that date. Records you have already signed stay valid.'],
      button: { href: `${APP}/supervisor`, label: 'Renew now' },
    }),
    expired: () => ({
      subject: 'Your Wavelength supervisor status has expired',
      heading: 'Supervisor status expired',
      paragraphs: [hi, d.underReview ? 'Your renewal is still under review, and the 30-day grace period has ended, so your supervisor status is paused until the Wavelength team approves it.' : `Your Wavelength supervisor approval ended on ${longDate(d.reviewOn)}.`, 'You cannot complete new supervisor sign-offs or assessments through Wavelength until you are approved again.', 'Scans and assessments you validly supervised while your status was active remain part of your trainees’ portfolios.', d.underReview ? 'We will email you as soon as your renewal is decided.' : 'To supervise through Wavelength again, renew from the app. Your previous details are filled in for you.', `Questions: ${SUPPORT}.`],
      button: { href: `${APP}/supervisor`, label: d.underReview ? 'See your renewal' : 'Apply again' },
    }),
    withdrawn: () => ({
      subject: 'Your Wavelength supervisor status has ended',
      heading: 'Supervisor status ended',
      paragraphs: [hi, 'Your Wavelength supervisor status has now ended.', 'You will no longer be able to complete new supervisor sign-offs or assessments through Wavelength.', 'Scans and assessments you validly supervised while your status was active remain part of your trainees’ historical portfolios.', 'Please make sure any trainees you currently supervise are aware that they will need to arrange ongoing supervision. Wavelength will also notify trainees linked to your account.', 'If you wish to supervise through Wavelength again in future, you may submit a new supervisor application.', `Questions: ${SUPPORT}.`],
    }),
    revoked: () => ({
      subject: 'Change to your Wavelength supervisor status',
      heading: 'Change to your supervisor status',
      paragraphs: [hi, d.all ? 'The Wavelength team has ended your Wavelength supervisor approval.' : `The Wavelength team has ended your Wavelength supervisor approval for: ${list(d.areas || [])}.`, d.reason ? `Reason: ${d.reason}` : null, d.all ? 'You can no longer complete supervisor sign-offs or assessments through Wavelength.' : 'Your approval for other areas is not affected.', 'Records you signed while approved stay valid.', `If you have questions, or think this is a mistake, contact ${SUPPORT}.`],
    }),
    lapse: () => ({
      subject: 'Your Wavelength supervisor status is paused',
      heading: 'Supervisor status paused',
      paragraphs: [hi, 'Your Wavelength supervisor status is paused because something it relies on is no longer current:', d.reason || 'a professional registration or credential.', 'While it is paused you cannot complete supervisor sign-offs or assessments through Wavelength. It resumes on its own once this is put right. Your trainees will be told only if it lasts more than 14 days.', `If you think this is a mistake, contact ${SUPPORT}.`],
      button: { href: `${APP}/supervisor`, label: 'See your status' },
    }),
    unavailable: () => ({
      subject: 'Your supervisor is no longer available on Wavelength',
      heading: 'Supervisor no longer available',
      paragraphs: [hi, `${d.supervisor} is no longer available for new supervision through Wavelength.`, 'Sign-offs and assessments they completed while active stay in your portfolio.', d.returned ? `${d.returned} open ${d.returned === 1 ? 'request has' : 'requests have'} come back to you. In the app you can send ${d.returned === 1 ? 'it' : 'them'} to another approved supervisor or to a one-off assessor, or cancel ${d.returned === 1 ? 'it' : 'them'}. Nothing needs re-entering.` : null, 'Please arrange another suitable supervisor.'],
      button: { href: `${APP}/supervisors`, label: 'Open your supervisors' },
    }),
    // Source monitoring (worker/monitor/run.js): only when something needs a person, never for routine checks.
    monitor_summary: () => ({
      subject: 'Wavelength | Source monitoring: review needed',
      heading: 'Source monitoring',
      paragraphs: [
        (d.items || []).length ? `${d.items.length} change${d.items.length === 1 ? '' : 's'} to review:` : null,
        ...(d.items || []).slice(0, 15).map((i) => `${i.name} (${i.classification.replace(/_/g, ' ')}): ${i.summary}`),
        (d.failing || []).length ? `Failing repeatedly: ${(d.failing || []).map((f) => `${f.name} (${f.failures} failures in a row)`).join('; ')}.` : null,
        'No Wavelength guide has been changed. Review each item and update the guide through the normal release if needed. This email holds no personal details.',
      ],
      button: { href: `${SITE}/admin/sources/`, label: 'Open source monitoring' },
    }),
    signup_exists: () => ({
      subject: 'Someone tried to create a Wavelength account with your email',
      heading: 'You already have an account',
      paragraphs: [hi, 'Someone, perhaps you, tried to create a new Wavelength account with this email address. You already have an account, so nothing has changed.', 'If it was you, log in with your password. If you have forgotten it, use the option to reset your password on the login screen.', 'If it was not you, you can ignore this email. Your account and logbook have not been changed.'],
      button: { href: `${SITE}/app/`, label: 'Log in' },
    }),
    search_request: () => ({
      subject: 'New supervision request on Wavelength',
      heading: 'Supervision request',
      paragraphs: [hi, `${d.learner} found you in Wavelength's supervisor search and asked you to supervise their ultrasound logbook.`, 'Accept or decline it in your supervisor dashboard. Nothing is shared until you accept.'],
      button: { href: `${APP}/supervise`, label: 'Open your dashboard' },
    }),
  };
  const f = T[kind];
  if (!f) return null;
  const m = f();
  m.paragraphs = m.paragraphs.filter(Boolean);
  m.text = m.paragraphs.join('\n\n') + (m.button ? `\n\n${m.button.label}: ${m.button.href}` : '');
  return m;
}
