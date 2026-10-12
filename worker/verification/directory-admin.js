// Admin controls for directory-assisted credential verification (worker/supervisors-admin.js calls these for any
// credential type with a `directory` in data/credentials.json). The panel offers the body's official directory page
// (a fixed address, opened in the administrator's own browser; opening it changes nothing), the last recorded check,
// the "Record directory check" form and "Send confirmation to the listed address". All decisions are logged to
// verification_events with the reviewer, the directory as source and the outcome.
import CFG from '../../data/credentials.json';
import { directoryOf, directoryUrl, listableModules, directoryReview, issueConfirmation, confirmationEmail, confirmReady, IDENTITY, MAX_CHECK_AGE_DAYS, maskEmail } from './directory-review.js';
import { sameOrganisation, isCurrentReg } from '../professional.js';
import { sendMail } from '../academy.js';
import { ukDate, addDays } from '../time.js';

export { directoryOf };
const TYPES = Object.fromEntries(CFG.credentialTypes.map((t) => [t.id, t]));
const BODIES = Object.fromEntries(CFG.bodies.map((b) => [b.id, b]));
const parse = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };

export function directoryPanel(c, { H, evid, form, esc }) {
  const t = TYPES[c.credential_type];
  const dir = directoryOf(c.credential_type);
  const url = directoryUrl(c.credential_type);
  const fields = parse(c.directory_fields);
  const mods = listableModules(c.credential_type);
  const local = (t.modules || []).filter((m) => m.directory === false);
  const today = ukDate();
  const evOpts = evid.filter((x) => x.subject_type === 'credential' && x.subject_id === c.id).map((x) => `<option value="${x.id}">#${x.id} ${esc(x.kind)}</option>`).join('');
  const last = fields.checkedOn ? `<p class="admin-summary">Last directory check: ${esc(fields.checkedOn)}${fields.reviewer ? ` by ${esc(fields.reviewer)}` : ''}. ${fields.listed ? `Listed as <b>${esc(fields.listedName)}</b>${fields.listedOrg ? `, ${esc(fields.listedOrg)}` : ''}${fields.listedRole ? ` (${esc(fields.listedRole)})` : ''}; modules ${esc((fields.modules || []).join(', '))}${fields.expiresOn ? `; until ${esc(fields.expiresOn)}` : ''}${fields.stage ? `; ${esc(fields.stage)}` : ''}.` : '<b>Not listed.</b>'} Identity: ${esc(c.identity_method ? IDENTITY[c.identity_method] || c.identity_method : 'not confirmed independently')}.</p>` : '<p class="admin-summary">No directory check recorded yet.</p>';
  const stages = dir.stages ? `<label>What the listing shows<select name="stage" required><option value="">Choose</option>${dir.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select></label>` : '';
  return `<div class="sv-gmc"><h5 style="margin:0 0 6px">${esc(dir.name)}</h5>
  ${url ? `<p><a class="btn btn-ghost small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open the official directory</a> <small>Search for the person by hand in your own browser. Never script it. ${esc(dir.permission || '')}</small></p>` : ''}
  <p class="admin-summary">The directory shows: ${esc((dir.fields || []).join(', '))}.${local.length ? ` It cannot confirm ${esc(local.map((m) => m.label).join(', '))}: that is approved locally.` : ''} A matching name is not enough: record how identity was confirmed separately, or send a confirmation to the address the directory lists.</p>
  ${last}
  ${form('cred_directory_check', { ...H, sid: c.id }, `<fieldset><legend>Is the person listed?</legend><label class="consent"><input type="radio" name="listed" value="yes" required><span>Yes</span></label><label class="consent"><input type="radio" name="listed" value="no"><span>No, not found</span></label></fieldset>
    <label>Name exactly as listed<input name="listed_name" maxlength="160" value="${esc(fields.listedName || '')}"></label>
    <label>Hospital or organisation as listed<input name="listed_org" maxlength="200" value="${esc(fields.listedOrg || '')}"></label>
    <label>Role or category as listed (optional)<input name="listed_role" maxlength="120" value="${esc(fields.listedRole || '')}"></label>
    <div class="sv-checks">${mods.map((m) => `<label><input type="checkbox" name="modules" value="${esc(m.id)}"${(fields.modules || []).includes(m.id) ? ' checked' : ''}>${esc(m.label)}</label>`).join('')}</div>
    <label>Date registered or accredited, if shown<input type="date" name="listed_date" value="${esc(fields.listedDate || '')}"></label>
    ${dir.expiry ? `<label>Expiry or "accredited until" date<input type="date" name="expires_on" required value="${esc(fields.expiresOn || '')}"></label>` : ''}
    ${stages}
    <label>Email the directory lists, if any (used only to send a confirmation; stored as a hash)<input type="email" name="listed_email" maxlength="160"></label>
    <label>How identity was confirmed, independently of the name<select name="identity"><option value="">Not yet: record as a directory match</option>${Object.entries(IDENTITY).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
    <label>Evidence relied on (for body or employer confirmation)<select name="evidence"><option value="">None</option>${evOpts}</select></label>
    <label>Date checked<input type="date" name="checked_on" required value="${esc(today)}" max="${esc(today)}" min="${esc(addDays(today, -MAX_CHECK_AGE_DAYS))}"></label>
    <label>Internal note<input name="notes" maxlength="500"></label>
    <p class="form-note">Only these answers are stored, never the directory page. A listed email that equals the holder's verified Wavelength email confirms identity on its own.</p>`, 'Record directory check')}
  ${form('cred_listing_send', { ...H, sid: c.id }, '<label>Email exactly as the directory lists it<input type="email" name="listed_email" required maxlength="160"></label><p class="form-note">Sends a single-use link to that address asking the listed person to confirm the Wavelength account is theirs, or to say it is not. Nothing changes until they answer.</p>', 'Send confirmation to the listed address', 'Send a confirmation email to this address?')}
  </div>`;
}

// action: cred_directory_check | cred_listing_send. helpers from supervisorsAdminPost: { reviewer, actor, back, ev, decided, ctx }.
export async function directoryPost(env, f, action, c, { reviewer, actor, back, ev, decided, ctx }) {
  const t = TYPES[c.credential_type];
  const dir = directoryOf(c.credential_type);
  if (!t || !dir) return back('This credential has no official directory.');
  const ready = await confirmReady(env);
  if (!ready) return back('Directory checks need migration 0015.');
  const l = await env.DB.prepare('SELECT id, email, email_status, title, first_name, last_name, organisation FROM learners WHERE id = ?').bind(c.learner_id).first();
  if (action === 'cred_listing_send') {
    const out = await issueConfirmation(env, c, f.get('listed_email'), actor);
    if (out.error) return back(out.error);
    const msg = confirmationEmail(c, { typeLabel: t.label, bodyName: (BODIES[t.body] || {}).name || t.body, accountHint: maskEmail(l.email), holderName: [l.title, l.first_name, l.last_name].filter(Boolean).join(' '), url: out.url });
    const mail = env.ZEPTOMAIL_TOKEN ? sendMail(env, { to: String(f.get('listed_email')).trim().toLowerCase(), ...msg }).catch(() => false) : Promise.resolve(false);
    if (ctx && ctx.waitUntil) ctx.waitUntil(mail); else await mail;
    await ev({ subjectType: 'credential', subjectId: c.id, action: 'listing_confirmation_sent', outcome: 'identity_pending', source: dir.name, method: 'listed_contact', notes: `Sent to ${out.hint}.${env.ZEPTOMAIL_TOKEN ? '' : ' Email is not set up (ZEPTOMAIL_TOKEN missing), so nothing was delivered.'}` });
    return back(env.ZEPTOMAIL_TOKEN ? `Confirmation sent to ${out.hint}.` : `Confirmation created for ${out.hint}, but email is not set up, so it was not delivered.`);
  }
  const regs = ((await env.DB.prepare('SELECT * FROM professional_registrations WHERE learner_id = ? AND active = 1').bind(c.learner_id).all()).results || []).filter(isCurrentReg);
  const evidence = (await env.DB.prepare('SELECT id, kind FROM credential_evidence WHERE learner_id = ? AND subject_type = ? AND subject_id = ?').bind(c.learner_id, 'credential', c.id).all()).results || [];
  const confirmed = !!(await env.DB.prepare("SELECT id FROM credential_confirmations WHERE credential_id = ? AND outcome = 'confirmed' AND used_at > datetime('now', '-180 days') LIMIT 1").bind(c.id).first()) || c.identity_method === 'listed_contact_confirmed';
  const out = directoryReview(f, { type: c.credential_type, account: l, registrations: regs, evidence, confirmed, sameOrg: sameOrganisation });
  if (out.error) return back(out.error);
  const fields = JSON.stringify({ ...out.fields, reviewer });
  const now = new Date().toISOString();
  const next = Date.now() + (t.recheckDays || 180) * 864e5;
  if (out.outcome === 'verified') {
    await env.DB.prepare("UPDATE credentials SET status = 'verified', modules = ?, identity_method = ?, directory_fields = ?, directory_checked_at = ?, verification_method = 'manual_register', verification_source = ?, verified_at = ?, verified_by = ?, expires_on = COALESCE(?, expires_on), issued_on = COALESCE(issued_on, ?), match_method = ?, match_version = ?, match_result = ?, failure_state = NULL, next_check_at = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(out.modules), out.identity, fields, now, `${c.issuer}-directory`, now, actor, out.fields.expiresOn || null, out.fields.listedDate || null, out.nameMatch.method, out.nameMatch.version, out.nameMatch.result, next, c.id).run();
    await decided('credentials', c.id);
  } else {
    // directory_match, not_listed (manual_review), expired, or review: never verified. A verified credential that is no
    // longer listed stops counting at once (it is no longer 'verified'), so approvals relying on it pause.
    await env.DB.prepare("UPDATE credentials SET status = ?, identity_method = CASE WHEN ? = 'directory_match' THEN identity_method ELSE NULL END, directory_fields = ?, directory_checked_at = ?, verification_source = ?, failure_state = ?, match_method = ?, match_version = ?, match_result = ?, expires_on = COALESCE(?, expires_on), next_check_at = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(out.status, out.outcome, fields, now, `${c.issuer}-directory`, out.failure, out.nameMatch ? out.nameMatch.method : null, out.nameMatch ? out.nameMatch.version : null, out.nameMatch ? out.nameMatch.result : null, out.fields.expiresOn || null, c.id).run();
  }
  await ev({ subjectType: 'credential', subjectId: c.id, action: `directory_${out.outcome}`, outcome: out.status, source: dir.name, method: 'manual_register', matchMethod: out.nameMatch ? out.nameMatch.method : null, matchVersion: out.nameMatch ? out.nameMatch.version : null, matchResult: out.nameMatch ? out.nameMatch.result : null, scope: out.modules.join(','), evidenceId: Number(f.get('evidence')) || null, notes: [out.summary, out.note].filter(Boolean).join(' ') });
  const words = { verified: 'Verified from the directory, with identity confirmed separately.', directory_match: 'Recorded as a directory match. Identity still needs confirming: send a confirmation to the listed address, or record another independent method.', not_listed: 'Recorded as not listed. The credential is not verified and goes to manual review.', expired: 'The listing has expired. Recorded as expired.', review: 'Held for manual review: see the note.' };
  return back(words[out.outcome] || 'Directory check recorded.');
}
