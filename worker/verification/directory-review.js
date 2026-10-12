// Directory-assisted verification of credentials issued by outside bodies (SAM FAMUS supervisors, ICS FUSIC trainers,
// mentors and supervisors, BSE accreditation, EACVI certification). It mirrors the GMC manual review
// (register-review.js): nothing here contacts a directory. An administrator opens the body's official page in their own
// browser, looks the person up by hand, and records what the entry showed. Wavelength never scrapes, bulk-copies,
// synchronises or republishes directory records (data/credentials.json `directory.permission`).
//
// A matching name is never enough. A credential becomes verified only when, in addition to the listing:
//   - identity is confirmed independently (IDENTITY below), and
//   - the name is not a mismatch, the listing covers the modules, and any expiry date is in the future.
// Otherwise it is recorded as directory_match (listing found, identity not yet confirmed), identity_pending (a
// confirmation was sent to the contact address the directory lists) or manual_review.
//
// Listed-contact confirmation: the administrator types the email address the directory itself lists (consented by the
// listed person for this purpose). Wavelength emails a single-use link there. The listed person either confirms that
// the Wavelength account is theirs, or says it is not, which flags the claim as disputed. The address is stored only as
// a hash and a masked hint.
import CFG from '../../data/credentials.json';
import { matchNames } from './names.js';
import { ukDate, addDays } from '../time.js';

export const MAX_CHECK_AGE_DAYS = 7;
export const CONFIRM_DAYS = 14;
export const CONFIRM_LIMIT = 3; // per credential per 30 days
const TYPES = Object.fromEntries(CFG.credentialTypes.map((t) => [t.id, t]));
const BODIES = Object.fromEntries(CFG.bodies.map((b) => [b.id, b]));
// Directory pages are opened from fixed https addresses on the bodies' own sites only.
const HOSTS = ['www.acutemedicine.org.uk', 'ics.ac.uk', 'www.bsecho.org', 'www.escardio.org', 'www.esicm.org'];

export const IDENTITY = {
  listed_email_matches_account: 'The email address the directory lists is the holder’s verified Wavelength email',
  listed_contact_confirmed: 'The holder confirmed from the email address the directory lists',
  registration_and_organisation: 'A verified professional registration name and the organisation both match the listing',
  body_confirmation: 'Written confirmation from the issuing body, or its certificate, held as evidence',
  employer_confirmation: 'Written confirmation from the holder’s organisation, held as evidence (local roles only)',
};

export const directoryOf = (typeId) => (TYPES[typeId] && TYPES[typeId].directory) || null;
export function directoryUrl(typeId) {
  const d = directoryOf(typeId);
  if (!d || !d.url) return null;
  try { const u = new URL(d.url); return u.protocol === 'https:' && HOSTS.includes(u.hostname) ? u.href : null; } catch { return null; }
}
// Modules a listing can confirm (a module marked directory: false, such as FAMUS peripheral access, cannot).
export const listableModules = (typeId) => ((TYPES[typeId] || {}).modules || []).filter((m) => m.directory !== false);

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const maskEmail = (e) => { const [u, d] = String(e || '').split('@'); return u && d ? `${u.slice(0, 1)}***@${d}` : ''; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Reads the "Record directory check" form. ctx: { type, account: { first_name, last_name, email, email_status,
// organisation }, registrations: [verified rows], evidence: [rows for this credential], confirmed: bool }.
// Returns { error } or { outcome, status, failure, modules, identity, nameMatch, fields, summary, note }.
//   outcome verified | directory_match | not_listed | expired | review
export function directoryReview(f, ctx, today = ukDate()) {
  const type = TYPES[ctx.type];
  const dir = directoryOf(ctx.type);
  if (!type || !dir) return { error: 'This credential has no official directory to check.' };
  const checkedOn = String(f.get('checked_on') || '');
  if (!ISO.test(checkedOn) || checkedOn > today || checkedOn < addDays(today, -MAX_CHECK_AGE_DAYS)) return { error: `Enter the date you checked the directory: today or within the last ${MAX_CHECK_AGE_DAYS} days.` };
  const note = clip(f.get('notes'), 500);
  const base = { source: dir.name, checkedOn };
  if (f.get('listed') === 'no') {
    return { outcome: 'not_listed', status: 'manual_review', failure: 'not_listed', modules: [], identity: null, fields: { ...base, listed: false }, summary: `Not found in the ${dir.name} on ${checkedOn}.`, note };
  }
  if (f.get('listed') !== 'yes') return { error: 'Say whether the person is listed.' };
  const listedName = clip(f.get('listed_name'), 160);
  if (!listedName) return { error: 'Enter the name exactly as the directory shows it.' };
  const allowed = listableModules(ctx.type).map((m) => m.id);
  const modules = f.getAll('modules').map(String).filter((m) => allowed.includes(m));
  if (!modules.length) return { error: 'Tick the modules (or roles) the listing shows. Only modules this directory can confirm are offered.' };
  const listedOrg = clip(f.get('listed_org'), 200);
  const listedRole = clip(f.get('listed_role'), 120);
  const listedDate = ISO.test(String(f.get('listed_date') || '')) ? String(f.get('listed_date')) : null;
  const expiresOn = ISO.test(String(f.get('expires_on') || '')) ? String(f.get('expires_on')) : null;
  if (dir.expiry && !expiresOn) return { error: 'This directory shows an expiry or "accredited until" date. Enter it.' };
  const listedEmail = clip(f.get('listed_email'), 160).toLowerCase();
  if (listedEmail && !EMAIL.test(listedEmail)) return { error: 'The listed email address does not look right.' };
  const stage = dir.stages ? String(f.get('stage') || '') : '';
  if (dir.stages && !dir.stages.some((s) => s.id === stage)) return { error: 'Choose what the listing shows (for example certified, or examination only).' };
  const fields = { ...base, listed: true, listedName, listedOrg, listedRole, modules, listedDate, expiresOn, stage: stage || undefined, emailListed: !!listedEmail };
  // Names: compared with the account and with every verified register name. A mismatch with both never verifies.
  const regNames = (ctx.registrations || []).filter((r) => r.register_name).map((r) => r.register_name);
  const results = [matchNames({ given: ctx.account.first_name, family: ctx.account.last_name }, listedName), ...regNames.map((n) => matchNames(n, listedName))];
  const nameMatch = results.find((r) => r.result === 'match') || results.find((r) => r.result === 'review') || results[0];
  const summary = (s) => `${dir.name} checked on ${checkedOn}: listed as ${listedName}${listedOrg ? `, ${listedOrg}` : ''}${listedRole ? ` (${listedRole})` : ''}; modules ${modules.join(', ')}${expiresOn ? `; until ${expiresOn}` : ''}. ${s}`;
  if (expiresOn && expiresOn < today) return { outcome: 'expired', status: 'expired', failure: null, modules, identity: null, nameMatch, fields, summary: summary('The listing has expired.'), note };
  const notCertified = stage && (dir.stages.find((s) => s.id === stage) || {}).verifies === false;
  if (notCertified) return { outcome: 'review', status: 'manual_review', failure: 'not_certified', modules, identity: null, nameMatch, fields, summary: summary('The listing does not show a completed credential.'), note };
  if (nameMatch.result === 'mismatch') return { outcome: 'review', status: 'manual_review', failure: 'name_mismatch', modules, identity: null, nameMatch, fields, summary: summary('The listed name does not match the account or a verified registration.'), note };
  // Identity, independent of the name.
  const method = String(f.get('identity') || '');
  const acctEmail = String(ctx.account.email || '').toLowerCase();
  let identity = null, idError = null;
  if (listedEmail && ctx.account.email_status === 'verified' && listedEmail === acctEmail) identity = 'listed_email_matches_account';
  else if (method === 'listed_contact_confirmed') { if (ctx.confirmed) identity = method; else idError = 'No confirmation from the listed address has been received yet. Send one first.'; }
  else if (method === 'registration_and_organisation') {
    const same = (ctx.registrations || []).some((r) => r.register_name && matchNames(r.register_name, listedName).result === 'match' && listedOrg && ctx.sameOrg(listedOrg, r.organisation || ctx.account.organisation));
    if (same) identity = method; else idError = 'That needs a verified registration whose register name matches the listing exactly, and the same organisation.';
  } else if (method === 'body_confirmation' || method === 'employer_confirmation') {
    const kinds = method === 'body_confirmation' ? ['body_correspondence', 'certificate'] : ['letter', 'institution'];
    const ev = (ctx.evidence || []).find((e) => e.id === Number(f.get('evidence')) && kinds.includes(e.kind));
    if (method === 'employer_confirmation' && type.body !== 'local' && !modules.every((m) => (type.modules.find((x) => x.id === m) || {}).local)) idError = 'Employer confirmation applies only to locally approved roles.';
    else if (ev) identity = method; else idError = `Choose the evidence that holds the ${method === 'body_confirmation' ? 'body’s confirmation or certificate' : 'organisation’s letter'}.`;
  }
  if (idError) return { error: idError };
  if (!identity) return { outcome: 'directory_match', status: 'directory_match', failure: null, modules, identity: null, nameMatch, fields, listedEmail, summary: summary('Identity not yet confirmed independently.'), note };
  return { outcome: 'verified', status: 'verified', failure: null, modules, identity, nameMatch, fields, listedEmail, summary: summary(`Identity: ${IDENTITY[identity]}.`), note };
}

// ---------- Listed-contact confirmation ----------
const enc = new TextEncoder();
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const tokenOf = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function confirmReady(env) { try { await env.DB.prepare('SELECT id FROM credential_confirmations LIMIT 0').all(); return true; } catch { return false; } }

// Issues a confirmation for one credential to the address the directory lists. Returns { ok, token, url, hint } or
// { error }. The caller sends the email (so tests can read the token without a mail service).
export async function issueConfirmation(env, c, email, actor, origin = 'https://thewavelength.co.uk') {
  if (!(await confirmReady(env))) return { error: 'Listed-contact confirmation needs migration 0015.' };
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(e)) return { error: 'Enter the email address exactly as the directory lists it.' };
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM credential_confirmations WHERE credential_id = ? AND sent_at > datetime('now', '-30 days')").bind(c.id).first();
  if (((recent && recent.n) || 0) >= CONFIRM_LIMIT) return { error: `At most ${CONFIRM_LIMIT} confirmations can be sent for one credential in 30 days.` };
  const t = tokenOf();
  await env.DB.batch([
    env.DB.prepare("UPDATE credential_confirmations SET outcome = 'superseded', used_at = datetime('now') WHERE credential_id = ? AND used_at IS NULL").bind(c.id),
    env.DB.prepare("INSERT INTO credential_confirmations (credential_id, learner_id, token_hash, email_hash, email_hint, expires_at, actor) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(c.id, c.learner_id, await sha('cc:' + t), await sha('em:' + e), maskEmail(e), Date.now() + CONFIRM_DAYS * 864e5, actor),
    env.DB.prepare("UPDATE credentials SET status = CASE WHEN status IN ('verified', 'revoked', 'rejected', 'withdrawn') THEN status ELSE 'identity_pending' END, updated_at = datetime('now') WHERE id = ?").bind(c.id),
  ]);
  return { ok: true, token: t, url: `${origin}/api/confirm-listing?t=${t}`, hint: maskEmail(e) };
}

export function confirmationEmail(c, { typeLabel, bodyName, accountHint, holderName, url }) {
  return {
    subject: `Is this you? Confirm your ${typeLabel} on Wavelength`,
    heading: 'Please confirm this is you',
    paragraphs: [
      `Someone using the Wavelength ultrasound logbook under the name ${holderName} (account ${accountHint}) has asked us to confirm that they are the ${typeLabel} listed in the ${bodyName} directory with this email address.`,
      'If that is you, press Confirm. If it is not you, press "This is not me" and we will look into it. Nothing changes until you choose.',
      `We sent this to the address the ${bodyName} directory lists. Wavelength is independent and is not run or endorsed by ${bodyName}.`,
      `The link works once and expires in ${CONFIRM_DAYS} days.`,
    ],
    button: { href: url, label: 'Review and confirm' },
    text: `Someone using Wavelength under the name ${holderName} (account ${accountHint}) asked us to confirm they are the ${typeLabel} listed in the ${bodyName} directory with this email address.\n\nReview and confirm, or tell us it is not you: ${url}\n\nNothing changes until you choose. The link works once and expires in ${CONFIRM_DAYS} days. Wavelength is independent and is not run or endorsed by ${bodyName}.`,
  };
}

const page = (title, body) => new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} | Wavelength</title><style>body{font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;background:#F7F5F0;color:#0F1E33;margin:0;padding:24px 16px}main{max-width:560px;margin:8vh auto;background:#fff;border:1px solid #E3DED3;border-radius:16px;padding:28px}h1{font-size:24px;margin:0 0 12px}button{font:inherit;padding:11px 18px;border-radius:999px;border:1px solid #0F1E33;cursor:pointer;margin:6px 8px 0 0}.go{background:#0F1E33;color:#fff}.no{background:#fff;color:#0F1E33}small{color:#5B6878}</style></head><body><main>${body}</main></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
const escH = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
async function findOpen(env, t) {
  if (!/^[0-9a-f]{48}$/.test(String(t || '')) || !(await confirmReady(env))) return null;
  const row = await env.DB.prepare('SELECT * FROM credential_confirmations WHERE token_hash = ?').bind(await sha('cc:' + t)).first();
  return row && !row.used_at && row.expires_at > Date.now() ? row : null;
}

// GET: never changes anything (mail scanners open links). Shows what is being confirmed and two buttons.
export async function confirmListingPage(req, env) {
  const t = new URL(req.url).searchParams.get('t');
  const row = await findOpen(env, t);
  if (!row) return page('Link not valid', '<h1>This link is no longer valid</h1><p>It may have been used already or expired. If you need help, email hello@thewavelength.co.uk.</p>');
  const c = await env.DB.prepare('SELECT c.credential_type, c.issuer, l.first_name, l.last_name, l.title, l.email FROM credentials c JOIN learners l ON l.id = c.learner_id WHERE c.id = ?').bind(row.credential_id).first();
  if (!c) return page('Link not valid', '<h1>This link is no longer valid</h1>');
  const type = TYPES[c.credential_type] || { label: 'credential' };
  const body = (BODIES[c.issuer] || {}).name || c.issuer;
  return page('Confirm your listing', `<h1>Is this you?</h1><p>A Wavelength account in the name <b>${escH([c.title, c.first_name, c.last_name].filter(Boolean).join(' '))}</b> (${escH(maskEmail(c.email))}) asks us to confirm that its holder is the <b>${escH(type.label)}</b> listed in the ${escH(body)} directory with the address this link was sent to.</p>
  <form method="post" action="/api/confirm-listing"><input type="hidden" name="t" value="${escH(t)}"><button class="go" name="answer" value="confirm" type="submit">Yes, this is me</button><button class="no" name="answer" value="not_me" type="submit">This is not me</button></form>
  <p><small>Confirming lets the Wavelength team complete their check. It does not change your listing with ${escH(body)}, and Wavelength is not run or endorsed by ${escH(body)}.</small></p>`);
}

// POST: records the answer once. confirm completes a recorded directory match; not_me flags the claim as disputed.
export async function confirmListingPost(req, env) {
  let t = '', answer = '';
  try { const f = await req.formData(); t = String(f.get('t') || ''); answer = String(f.get('answer') || ''); } catch { /* bad body */ }
  const origin = req.headers.get('Origin');
  if (origin && origin !== new URL(req.url).origin) return page('Not allowed', '<h1>Not allowed</h1>');
  const row = await findOpen(env, t);
  if (!row || !['confirm', 'not_me'].includes(answer)) return page('Link not valid', '<h1>This link is no longer valid</h1><p>It may have been used already or expired.</p>');
  const claim = await env.DB.prepare('UPDATE credential_confirmations SET used_at = datetime(\'now\'), outcome = ? WHERE id = ? AND used_at IS NULL').bind(answer === 'confirm' ? 'confirmed' : 'disputed', row.id).run();
  if (!(claim.meta && claim.meta.changes)) return page('Link not valid', '<h1>This link has already been used</h1>');
  const c = await env.DB.prepare('SELECT * FROM credentials WHERE id = ?').bind(row.credential_id).first();
  const now = new Date().toISOString();
  const log = (action, outcome, notes) => env.DB.prepare('INSERT INTO verification_events (learner_id, subject_type, subject_id, action, outcome, actor, source, method, notes) VALUES (?, \'credential\', ?, ?, ?, \'listed_contact\', ?, \'listed_contact\', ?)').bind(row.learner_id, row.credential_id, action, outcome, (directoryOf(c && c.credential_type) || {}).name || 'directory', notes).run();
  if (!c) return page('Thank you', '<h1>Thank you</h1>');
  if (answer === 'not_me') {
    await env.DB.prepare("UPDATE credentials SET status = CASE WHEN status = 'verified' THEN 'manual_review' ELSE 'manual_review' END, failure_state = 'disputed', identity_method = NULL, updated_at = datetime('now') WHERE id = ?").bind(c.id).run();
    await log('listing_disputed', 'manual_review', `The listed contact (${row.email_hint}) said the account is not theirs.`);
    return page('Thank you', '<h1>Thank you for telling us</h1><p>The request has been stopped and the Wavelength team will look into it. You do not need to do anything else.</p>');
  }
  // Confirmed. If the administrator has already recorded a listing (directory_match or identity_pending with fields),
  // this completes the check; otherwise the confirmation waits for the administrator's directory check.
  let fields = {}; try { fields = JSON.parse(c.directory_fields || '{}'); } catch { /* none */ }
  const t2 = TYPES[c.credential_type] || {};
  if (fields.listed && ['directory_match', 'identity_pending'].includes(c.status) && (!fields.expiresOn || fields.expiresOn >= ukDate())) {
    await env.DB.prepare("UPDATE credentials SET status = 'verified', identity_method = 'listed_contact_confirmed', modules = ?, verification_method = 'manual_register', verification_source = ?, verified_at = ?, verified_by = 'listed_contact', expires_on = COALESCE(?, expires_on), failure_state = NULL, next_check_at = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(fields.modules || []), `${c.issuer}-directory`, now, fields.expiresOn || null, Date.now() + (t2.recheckDays || 180) * 864e5, c.id).run();
    await log('listing_confirmed', 'verified', `Confirmed from the listed address (${row.email_hint}); listing recorded on ${fields.checkedOn || 'unknown date'}.`);
  } else {
    await env.DB.prepare("UPDATE credentials SET identity_method = 'listed_contact_confirmed', updated_at = datetime('now') WHERE id = ?").bind(c.id).run();
    await log('listing_confirmed', 'identity_confirmed', `Confirmed from the listed address (${row.email_hint}); waiting for the directory check.`);
  }
  return page('Thank you', '<h1>Thank you, that is confirmed</h1><p>The Wavelength team will finish their check. You can close this page.</p>');
}
