// Regulator-specific manual review of a professional registration. The wider verification system stays
// profession-neutral: every regulator keeps the generic manual check in worker/supervisors-admin.js, and only a
// registration whose regulator is 'gmc' gets the GMC controls below. Nothing here contacts the GMC: the admin opens the
// official register entry in their own browser, reads it, and records what it showed. Opening the link never changes a
// registration. Automated GMC checks are not built (no licence or permission yet: see data/credentials.json 'access').
import { ukDate, addDays } from '../time.js';

export const GMC = 'gmc';
export const GMC_NUMBER = /^\d{7}$/;
export const GMC_SOURCE = 'gmc-public-register';
export const GMC_SOURCE_LABEL = 'GMC register';
// A registration held for a deliberate decision because the register shows something that needs consideration.
export const RESTRICTION_STATE = 'register_restriction';
// How far back the reviewer may date a check they record (a check from today or the last few days).
export const MAX_CHECK_AGE_DAYS = 7;

export const isGmc = (regulator) => regulator === GMC;

// The official register entry for one GMC number, or null. The URL is built only from a regulator of exactly 'gmc' and
// a number of exactly seven digits, and only on www.gmc-uk.org: no name, email or other detail ever goes in it.
export function gmcRegisterUrl(regulator, number) {
  if (!isGmc(regulator)) return null;
  const n = typeof number === 'string' || typeof number === 'number' ? String(number) : '';
  if (!GMC_NUMBER.test(n)) return null;
  const u = new URL(`/registrants/${n}`, 'https://www.gmc-uk.org');
  return u.hostname === 'www.gmc-uk.org' && u.protocol === 'https:' ? u.href : null;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const yes = (f, k) => f.get(k) === '1';

// Reads the GMC review form and decides what it allows. Returns { error } or
// { outcome: 'verified' | 'review', registerName, checkedOn, fields, summary, note }.
//   verified: every required check confirmed and the reviewer says nothing needing consideration is shown.
//   review:   the reviewer says the register shows a warning, condition, undertaking or restriction to consider. The
//             registration is held (never verified) until an admin records a deliberate decision.
// Anything not confirmed is refused with a message: use "Mark not current" or "Reject" for those outcomes instead.
export function gmcReview(f, today = ukDate()) {
  const registerName = clip(f.get('register_name'), 160);
  const note = clip(f.get('notes'), 500);
  const checkedOn = String(f.get('checked_on') || '');
  const restriction = String(f.get('restriction') || '');
  if (!registerName) return { error: 'Enter the name exactly as the GMC register shows it.' };
  if (!yes(f, 'number_matched')) return { error: 'Confirm the GMC number on the register matches this registration. If it does not, reject the registration instead.' };
  if (!yes(f, 'registration_current')) return { error: 'Confirm the registration is current. If it is not, use "Mark not current" instead.' };
  if (!yes(f, 'licence_current')) return { error: 'Confirm the licence to practise is current. If it is not, use "Mark not current" instead.' };
  if (!['none', 'shown'].includes(restriction)) return { error: 'Say whether the register shows a warning, condition, undertaking or restriction that needs further consideration.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedOn) || checkedOn > today || checkedOn < addDays(today, -MAX_CHECK_AGE_DAYS)) return { error: `Enter the date you checked the register: today or within the last ${MAX_CHECK_AGE_DAYS} days.` };
  if (restriction === 'shown' && note.length < 10) return { error: 'Describe briefly what the register shows (internal note), so the decision can be made.' };
  const shown = restriction === 'shown';
  // At most 8 plain fields (the register_fields limit). Never page content beyond these answers.
  const fields = { source: GMC_SOURCE_LABEL, numberMatched: true, registrationCurrent: true, licenceCurrent: true, restrictionShown: shown, checkedOn };
  const summary = `GMC register checked on ${checkedOn}: number matched, registration current, licence to practise current, ${shown ? 'something shown that needs consideration' : 'nothing shown that needs consideration'}.`;
  return { outcome: shown ? 'review' : 'verified', registerName, checkedOn, fields, summary, note };
}

// A deliberate decision on a registration held for consideration. verify needs a reason of 20 characters or more.
export function restrictionDecision(f) {
  const decision = String(f.get('decision') || '');
  const reason = clip(f.get('notes'), 1000);
  if (!['verify', 'not_current', 'reject'].includes(decision)) return { error: 'Choose a decision.' };
  if (reason.length < 20) return { error: 'Give the reason for your decision (20 characters or more).' };
  return { decision, reason };
}
