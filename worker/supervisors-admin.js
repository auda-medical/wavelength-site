// Admin: professional and supervisor verification (/volunteer/admin/supervisors/, admin login only).
// Lists what needs a person (manual checks, ambiguous matches, evidence, rechecks), and for each professional shows
// registrations, credentials, evidence, supervisor approvals and the full verification history. Every decision is
// written to verification_events with the reviewer's name, the scope and the evidence it relied on. Routine work never
// needs SQL. Submitted text is always escaped and never placed inside a script or handler (see CLAUDE.md).
import LOGBOOK from '../data/logbook.json';
import { REG, TYPE, BODY, logEvent, checkRegistration, currentStatus, badgesFrom, scopeLabel, parseList } from './professional.js';
import { sendMail } from './academy.js';
import { verificationReady } from './app-util.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const date = (v) => (ISO.test(String(v || '')) ? String(v) : null);
const nowIso = () => new Date().toISOString();
const BASE = '/volunteer/admin/supervisors/';
const PATHS = LOGBOOK.pathways.filter((p) => p.modules && p.modules.length);
const REG_QUEUE = ['pending', 'manual_verification_required', 'manual_review', 'mismatch', 'source_unavailable'];
const CRED_QUEUE = ['claimed', 'evidence_required', 'manual_review', 'more_evidence', 'not_found', 'source_unavailable'];
const NAV = `<a class="text-link" href="/volunteer/admin/">Volunteers</a> · <a class="text-link" href="/volunteer/admin/academy/">Academy</a> · <a class="text-link" href="${BASE}">Supervisor verification</a>`;
const name = (l) => [l.title, l.first_name, l.last_name].filter(Boolean).join(' ');
const reviewerField = '<label>Your name (recorded with the decision)<input name="reviewer" autocomplete="name" maxlength="80" required></label>';
const form = (action, hidden, inner, button, confirmText) => `<form class="form sv-form" method="post"${confirmText ? ` onsubmit="return confirm(this.dataset.confirm)" data-confirm="${esc(confirmText)}"` : ''}><input type="hidden" name="action" value="${action}">${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}${inner}${reviewerField}<button class="btn btn-ghost small" type="submit">${esc(button)}</button></form>`;
const STYLE = '<style>.sv-grid{display:grid;gap:18px}.sv-card{background:#fff;border:1px solid #E4E0D7;border-radius:12px;padding:18px}.sv-card h4{margin:0 0 6px}.sv-form{display:grid;gap:8px;margin:10px 0;padding:12px;border:1px dashed #E4E0D7;border-radius:10px}.sv-form label{display:grid;gap:4px;font-size:14px}.sv-actions{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.sv-status{display:inline-block;padding:2px 10px;border-radius:99px;background:#EDEAE3;font-size:13px}.sv-ok{background:#DDEFE9}.sv-bad{background:#F6DEDA}.sv-checks{display:flex;flex-wrap:wrap;gap:6px 14px;border:0;padding:0;margin:0 0 8px}.sv-checks legend{font-weight:600;font-size:14px;margin-bottom:4px}.sv-form .sv-checks label,.sv-form label.consent{display:inline-flex;flex-direction:row;gap:6px;align-items:center}.sv-form input[type=checkbox]{width:18px;height:18px;min-height:0;flex:none;margin:0}.sv-actions{align-items:start}.sv-form button{justify-self:start;align-self:start;width:auto;height:auto;min-height:0}</style>';
const pill = (s) => `<span class="sv-status ${s === 'verified' || s === 'approved' ? 'sv-ok' : ['rejected', 'revoked', 'mismatch', 'not_current', 'expired'].includes(s) ? 'sv-bad' : ''}">${esc(String(s).replace(/_/g, ' '))}</span>`;

export async function supervisorsAdminHtml(env, url) {
  if (!(await verificationReady(env))) return `${STYLE}<h2 class="display" style="font-size:34px;margin:0 0 8px">Supervisor verification</h2><p class="admin-summary">Not available yet: apply migrations/0011_verification.sql to the database first. ${NAV}</p>`;
  const m = url.searchParams.get('m') || '';
  const id = Number(url.searchParams.get('id'));
  const note = m ? `<p class="form-note" style="font-weight:600">${esc(m)}</p>` : '';
  return STYLE + (id ? await detail(env, id, note) : await list(env, note));
}

async function list(env, note) {
  const regs = await env.DB.prepare(`SELECT r.*, l.title, l.first_name, l.last_name, l.email FROM professional_registrations r JOIN learners l ON l.id = r.learner_id WHERE r.active = 1 AND (r.status IN (${REG_QUEUE.map(() => '?').join(',')}) OR r.failure_state = 'recheck_due') ORDER BY r.updated_at`).bind(...REG_QUEUE).all();
  const creds = await env.DB.prepare(`SELECT c.*, l.title, l.first_name, l.last_name, l.email FROM credentials c JOIN learners l ON l.id = c.learner_id WHERE c.active = 1 AND (c.status IN (${CRED_QUEUE.map(() => '?').join(',')}) OR c.failure_state = 'recheck_due') ORDER BY c.updated_at`).bind(...CRED_QUEUE).all();
  const people = await env.DB.prepare(`SELECT l.id, l.title, l.first_name, l.last_name, l.email, l.email_status,
      (SELECT GROUP_CONCAT(regulator || ' ' || status, ', ') FROM professional_registrations WHERE learner_id = l.id AND active = 1) AS regs,
      (SELECT COUNT(*) FROM credentials WHERE learner_id = l.id AND active = 1) AS creds,
      (SELECT COUNT(*) FROM supervisor_approvals WHERE learner_id = l.id AND status = 'approved') AS approvals
    FROM learners l WHERE l.id IN (SELECT learner_id FROM professional_registrations UNION SELECT learner_id FROM credentials UNION SELECT learner_id FROM supervisor_approvals) ORDER BY l.last_name LIMIT 500`).all();
  const q = [
    ...(regs.results || []).map((r) => `<tr><td>${esc(r.updated_at.slice(0, 10))}</td><td><a class="text-link" href="${BASE}?id=${r.learner_id}">${esc(name(r))}</a><br>${esc(r.email)}</td><td>Registration: ${esc((REG[r.regulator] || {}).short || r.regulator)} ${esc(r.registration_number)}</td><td>${pill(r.failure_state === 'recheck_due' ? 'recheck due' : r.status)}${r.failure_state && r.failure_state !== 'recheck_due' ? `<br><small>${esc(r.failure_state)}</small>` : ''}</td></tr>`),
    ...(creds.results || []).map((c) => `<tr><td>${esc(c.updated_at.slice(0, 10))}</td><td><a class="text-link" href="${BASE}?id=${c.learner_id}">${esc(name(c))}</a><br>${esc(c.email)}</td><td>${esc((TYPE[c.credential_type] || {}).label || c.credential_type)}: ${esc(parseList(c.modules).join(', '))}</td><td>${pill(c.failure_state === 'recheck_due' ? 'recheck due' : c.status)}</td></tr>`),
  ];
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Supervisor verification</h2>
  <p class="admin-summary">Professional registrations, external credentials and Wavelength supervisor approvals. Registration and credential checks are separate from supervisor approval: approve a supervisor only for the pathway modules the evidence supports. ${NAV}</p>${note}
  <h3 style="margin:28px 0 10px">Needs a decision (${q.length})</h3>
  ${q.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Updated</th><th scope="col">Person</th><th scope="col">Claim</th><th scope="col">Status</th></tr></thead><tbody>${q.join('')}</tbody></table></div>` : '<p class="admin-summary">Nothing waiting.</p>'}
  <h3 style="margin:28px 0 10px">Professionals</h3>
  ${(people.results || []).length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Registrations</th><th scope="col">Credentials</th><th scope="col">Approvals</th></tr></thead><tbody>${people.results.map((p) => `<tr><td><a class="text-link" href="${BASE}?id=${p.id}">${esc(name(p))}</a></td><td>${esc(p.email)}<br><small>${esc(String(p.email_status || '').replace(/_/g, ' '))}</small></td><td>${esc(p.regs || 'None')}</td><td>${p.creds}</td><td>${p.approvals}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No professional claims yet.</p>'}`;
}

async function detail(env, id, note) {
  const st = await currentStatus(env, id);
  const l = st.learner;
  if (!l) return `<p class="admin-summary">Not found. ${NAV}</p>`;
  const evid = (await env.DB.prepare('SELECT id, subject_type, subject_id, kind, description, url, file_name, file_type, file_size, file_sha256, purged_at, created_at FROM credential_evidence WHERE learner_id = ? ORDER BY id').bind(id).all()).results || [];
  const history = (await env.DB.prepare('SELECT * FROM verification_events WHERE learner_id = ? ORDER BY id DESC LIMIT 300').bind(id).all()).results || [];
  const allCreds = (await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? ORDER BY active DESC, id').bind(id).all()).results || [];
  const allApps = (await env.DB.prepare('SELECT * FROM supervisor_approvals WHERE learner_id = ? ORDER BY id DESC').bind(id).all()).results || [];
  const evList = (type, sid) => {
    const e = evid.filter((x) => x.subject_type === type && x.subject_id === sid);
    return e.length ? `<ul>${e.map((x) => `<li>#${x.id} ${esc(x.kind)}: ${esc(x.description || '')}${x.url ? ` <a class="text-link" href="${esc(x.url)}" rel="noopener noreferrer" target="_blank">link</a>` : ''}${x.file_name ? (x.purged_at ? ` · file ${esc(x.file_name)} (deleted after the decision; SHA-256 ${esc(String(x.file_sha256).slice(0, 16))}…)` : ` · <a class="text-link" href="${BASE}evidence/?id=${x.id}">${esc(x.file_name)}</a> (${Math.round(x.file_size / 1024)} KB)`) : ''}</li>`).join('')}</ul>` : '<p class="admin-summary">No evidence.</p>';
  };
  const H = { learner: id };
  const regCards = st.registrations.map((r) => {
    const reg = REG[r.regulator] || {};
    let fields = {}; try { fields = JSON.parse(r.register_fields || '{}'); } catch { /* none */ }
    return `<div class="sv-card"><h4>${esc(reg.name || r.regulator)} ${pill(r.status)}</h4>
    <p>Number <b>${esc(r.registration_number)}</b> · ${esc(r.profession || '')} · ${esc(r.organisation || '')} ${esc(r.role || '')}<br>
    Claimed name: ${esc(r.claimed_name)} · Register name: ${esc(r.register_name || 'not returned')} · Register status: ${esc(r.register_status || 'unknown')}<br>
    Source: ${esc(r.verification_source || 'none')} · Method: ${esc(r.verification_method || 'none')} · Name match: ${esc(r.match_result || 'n/a')} (${esc(r.match_method || '')} ${esc(r.match_version || '')})<br>
    Verified: ${esc(r.verified_at || 'no')} · Last checked: ${esc(r.last_checked_at || 'never')}${r.failure_state ? ` · <b>${esc(r.failure_state.replace(/_/g, ' '))}</b>` : ''}${Object.keys(fields).length ? `<br>Register fields: ${esc(JSON.stringify(fields))}` : ''}
    <br><a class="text-link" href="${esc(reg.registerUrl || '#')}" target="_blank" rel="noopener noreferrer">Open the official ${esc(reg.short || '')} register</a> (search the number by hand: never script it)</p>
    ${evList('registration', r.id)}
    <div class="sv-actions">
    ${form('reg_verify', { ...H, sid: r.id }, `<label>Name exactly as the register shows it<input name="register_name" required maxlength="160" value="${esc(r.register_name || '')}"></label><label class="consent"><input type="checkbox" name="checked" value="1" required><span>I checked this number and name on the official register today, and the registration is current.</span></label><label>Notes<input name="notes" maxlength="500"></label>`, 'Verify registration')}
    ${form('reg_reject', { ...H, sid: r.id }, '<label>Reason (shown in the audit trail)<input name="notes" required maxlength="500"></label>', 'Reject')}
    ${form('reg_not_current', { ...H, sid: r.id }, '<label>What the register shows<input name="notes" required maxlength="500"></label>', 'Mark not current')}
    ${form('reg_recheck', { ...H, sid: r.id }, '', 'Run the automatic check again')}
    </div></div>`;
  }).join('') || '<p class="admin-summary">No registrations.</p>';
  const credCards = allCreds.map((c) => {
    const t = TYPE[c.credential_type] || { label: c.credential_type, modules: [] };
    const claimed = parseList(c.modules);
    const checks = t.modules.map((m) => `<label><input type="checkbox" name="modules" value="${esc(m.id)}"${claimed.includes(m.id) ? ' checked' : ''}>${esc(m.label)}</label>`).join('');
    const evOpts = evid.filter((x) => x.subject_type === 'credential' && x.subject_id === c.id).map((x) => `<option value="${x.id}">#${x.id} ${esc(x.kind)}</option>`).join('');
    return `<div class="sv-card"><h4>${esc(t.label)} (${esc((BODY[c.issuer] || {}).name || c.issuer)}) ${pill(c.active ? c.status : 'withdrawn')}</h4>
    <p>Modules claimed: ${esc(claimed.join(', '))} · Reference: ${esc(c.reference || 'none')} · Issued: ${esc(c.issued_on || '?')} · Expires: ${esc(c.expires_on || 'n/a')} · Review: ${esc(c.review_on || 'n/a')}<br>
    Automatic result: ${esc(c.match_result || 'n/a')} (${esc(c.match_method || '')} ${esc(c.match_version || '')}) · Source: ${esc(c.verification_source || 'none')} · Method: ${esc(c.verification_method || 'none')} · Verified by: ${esc(c.verified_by || 'n/a')} ${esc(c.verified_at || '')}${c.failure_state ? ` · <b>${esc(c.failure_state.replace(/_/g, ' '))}</b>` : ''}<br>
    Holder's note: ${esc(c.claim_note || 'none')}<br><small>${esc(t.access || '')}</small></p>
    ${evList('credential', c.id)}
    ${c.active ? `<div class="sv-actions">
    ${form('cred_approve', { ...H, sid: c.id }, `<div class="sv-checks">${checks}</div><label>How you checked<select name="method"><option value="manual_evidence">From the evidence provided</option><option value="manual_register">Against the body's own public list</option></select></label><label>Evidence relied on<select name="evidence"><option value="">None listed</option>${evOpts}</select></label><label>Issued on<input type="date" name="issued_on" value="${esc(c.issued_on || '')}"></label><label>Expires on<input type="date" name="expires_on" value="${esc(c.expires_on || '')}"></label><label>Review on<input type="date" name="review_on" value="${esc(c.review_on || '')}"></label><label>Notes<input name="notes" required maxlength="500"></label>`, 'Approve credential')}
    ${form('cred_more', { ...H, sid: c.id }, '<label>What evidence you need (emailed to the holder)<textarea name="notes" required maxlength="800"></textarea></label>', 'Request more evidence')}
    ${form('cred_reject', { ...H, sid: c.id }, '<label>Reason<input name="notes" required maxlength="500"></label>', 'Reject')}
    ${form('cred_revoke', { ...H, sid: c.id }, '<label>Reason<input name="notes" required maxlength="500"></label>', 'Revoke', 'Revoke this credential? Badges and directory listings that rely on it disappear at once.')}
    ${['revoked', 'rejected', 'expired'].includes(c.status) ? form('cred_reinstate', { ...H, sid: c.id }, '<label>Why it is valid again<input name="notes" required maxlength="500"></label><label>Expires on<input type="date" name="expires_on"></label>', 'Reinstate') : ''}
    </div>` : ''}</div>`;
  }).join('') || '<p class="admin-summary">No credentials claimed.</p>';
  const appRows = allApps.map((a) => `<tr><td>${esc(scopeLabel(a.pathway, a.module))}</td><td>${pill(a.status)}${a.status === 'approved' && !st.hasReg ? '<br><small>Not current: no verified registration</small>' : ''}</td><td>${esc(a.approved_by || '')} ${esc((a.approved_at || '').slice(0, 10))}</td><td>${esc(a.review_on || '')}</td><td>${esc(a.notes || '')}${a.ended_reason ? `<br>Ended: ${esc(a.ended_reason)} (${esc(a.ended_by || '')})` : ''}</td><td>${a.status === 'approved' ? form('appr_revoke', { ...H, sid: a.id }, '<label>Reason<input name="notes" required maxlength="500"></label>', 'Revoke', 'Revoke this supervisor approval? It stops counting at once. Past sign-offs keep what was true when they were signed.') : form('appr_reinstate', { ...H, sid: a.id }, '<label>Why<input name="notes" required maxlength="500"></label><label>Review on<input type="date" name="review_on"></label>', 'Reinstate')}</td></tr>`).join('');
  const verifiedCreds = allCreds.filter((c) => c.active && c.status === 'verified');
  const addApproval = form('appr_add', H, `<p class="form-note">Modules (scope). Tick only the modules the evidence supports. "All modules" is recorded as its own scope.</p>
    ${PATHS.map((p) => `<fieldset class="sv-checks"><legend>${esc(p.label)}</legend><label><input type="checkbox" name="scope" value="${p.id}:*">All modules</label>${p.modules.map((m) => `<label><input type="checkbox" name="scope" value="${p.id}:${m.id}">${esc(m.label)}</label>`).join('')}</fieldset>`).join('')}
    <p class="form-note">Basis: the verified credentials this approval relies on.</p><div class="sv-checks">${verifiedCreds.map((c) => `<label><input type="checkbox" name="basis" value="${c.id}">${esc((TYPE[c.credential_type] || {}).label || c.credential_type)}: ${esc(parseList(c.modules).join(', '))}</label>`).join('') || '<span class="admin-summary">No verified credentials. Record the basis in the notes.</span>'}</div>
    <label>Review on<input type="date" name="review_on"></label><label>Notes (basis and reasoning)<textarea name="notes" required maxlength="1000"></textarea></label>`, 'Approve as Wavelength supervisor for these scopes');
  const badges = badgesFrom(env, st);
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">${esc(name(l))}</h2>
  <p class="admin-summary">${esc(l.email)} · Email: ${pill(l.email_status || 'legacy_unverified')} ${esc(l.email_verified_at || '')} · ${esc(l.organisation || '')} ${esc(l.role || '')} · <a class="text-link" href="${BASE}">Back to the queue</a></p>${note}
  <p class="admin-summary">Badges shown today: ${badges.length ? badges.map((b) => esc(b.label + (b.modules ? ` (${b.modules.join(', ')})` : '') + (b.scopes ? ` (${b.scopes.map((s) => s.label).join(', ')})` : ''))).join(' · ') : 'none'}</p>
  <h3 style="margin:28px 0 10px">Professional registration</h3><div class="sv-grid">${regCards}</div>
  <h3 style="margin:28px 0 10px">External credentials</h3><div class="sv-grid">${credCards}</div>
  <h3 style="margin:28px 0 10px">Wavelength supervisor approvals</h3>
  ${appRows ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Scope</th><th scope="col">Status</th><th scope="col">Approved</th><th scope="col">Review</th><th scope="col">Notes</th><th scope="col">Action</th></tr></thead><tbody>${appRows}</tbody></table></div>` : '<p class="admin-summary">No approvals.</p>'}
  ${st.hasReg ? addApproval : '<p class="admin-summary">Verify a professional registration before approving this person as a supervisor.</p>'}
  <h3 style="margin:28px 0 10px">History</h3>
  ${history.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Outcome</th><th scope="col">Who</th><th scope="col">Details</th></tr></thead><tbody>${history.map((h) => `<tr><td>${esc(h.at)}</td><td>${esc(h.subject_type)} #${esc(h.subject_id)}: ${esc(h.action)}</td><td>${esc(h.outcome || '')}</td><td>${esc(h.actor)}</td><td>${esc([h.source, h.method, h.match_result && `match ${h.match_result} (${h.match_method} ${h.match_version})`, h.scope && `scope ${h.scope}`, h.evidence_id && `evidence #${h.evidence_id}`, h.notes].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No history.</p>'}`;
}

// Returns the message to show after the redirect.
export async function supervisorsAdminPost(env, f, admin, ctx) {
  if (!(await verificationReady(env))) return { id: 0, m: 'Apply migration 0011 first.' };
  const action = String(f.get('action') || '');
  const learnerId = Number(f.get('learner')), sid = Number(f.get('sid'));
  const reviewer = clip(f.get('reviewer'), 80);
  const notes = clip(f.get('notes'), 1000);
  const back = (m) => ({ id: learnerId, m });
  if (!reviewer) return back('Enter your name: every decision records who made it.');
  const actor = `admin:${clip(admin, 40)}:${reviewer}`;
  const ev = (e) => logEvent(env, { learnerId, actor, ...e });

  if (action.startsWith('reg_')) {
    const r = await env.DB.prepare('SELECT * FROM professional_registrations WHERE id = ? AND learner_id = ?').bind(sid, learnerId).first();
    if (!r) return back('Registration not found.');
    const reg = REG[r.regulator] || {};
    if (action === 'reg_verify') {
      if (!f.get('checked')) return back('Tick the box to confirm you checked the official register.');
      try {
        await env.DB.prepare("UPDATE professional_registrations SET status = 'verified', register_name = ?, register_status = 'registered', verification_method = 'manual_register', verification_source = ?, verified_at = ?, last_checked_at = ?, next_check_at = ?, failure_state = NULL, failure_count = 0, match_method = 'admin', match_version = NULL, match_result = 'match', updated_at = datetime('now') WHERE id = ?")
          .bind(clip(f.get('register_name'), 160), `${r.regulator}-public-register`, nowIso(), nowIso(), Date.now() + (reg.recheckDays || 30) * 864e5, r.id).run();
      } catch { return back('Another account already holds this registration number as verified. Resolve that account first.'); }
      await ev({ subjectType: 'registration', subjectId: r.id, action: 'admin_verified', outcome: 'verified', source: `${r.regulator}-public-register`, method: 'manual_register', notes });
      return back('Registration verified.');
    }
    if (action === 'reg_reject' || action === 'reg_not_current') {
      if (!notes) return back('Give a reason.');
      const s = action === 'reg_reject' ? 'rejected' : 'not_current';
      await env.DB.prepare("UPDATE professional_registrations SET status = ?, last_checked_at = ?, failure_state = NULL, updated_at = datetime('now') WHERE id = ?").bind(s, nowIso(), r.id).run();
      await ev({ subjectType: 'registration', subjectId: r.id, action: `admin_${s}`, outcome: s, notes });
      return back(s === 'rejected' ? 'Registration rejected.' : 'Registration marked not current.');
    }
    if (action === 'reg_recheck') { const out = await checkRegistration(env, r, 'admin', actor); return back(`Automatic check: ${out.status.replace(/_/g, ' ')}.`); }
  }

  if (action.startsWith('cred_')) {
    const c = await env.DB.prepare('SELECT * FROM credentials WHERE id = ? AND learner_id = ?').bind(sid, learnerId).first();
    if (!c) return back('Credential not found.');
    const t = TYPE[c.credential_type] || { modules: [] };
    if (!notes) return back('Add notes or a reason.');
    if (action === 'cred_approve') {
      const modules = f.getAll('modules').map(String).filter((m) => t.modules.some((x) => x.id === m));
      if (!modules.length) return back('Tick at least one module.');
      const method = f.get('method') === 'manual_register' ? 'manual_register' : 'manual_evidence';
      const evidenceId = Number(f.get('evidence')) || null;
      const review = date(f.get('review_on'));
      await env.DB.prepare("UPDATE credentials SET status = 'verified', modules = ?, issued_on = COALESCE(?, issued_on), expires_on = ?, review_on = ?, verification_method = ?, verification_source = ?, verified_at = ?, verified_by = ?, failure_state = NULL, next_check_at = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(JSON.stringify(modules), date(f.get('issued_on')), date(f.get('expires_on')), review, method, method === 'manual_register' ? `${c.issuer}-public-list` : 'evidence', nowIso(), actor, review ? new Date(review + 'T00:00:00Z').getTime() : Date.now() + (t.recheckDays || 365) * 864e5, c.id).run();
      await ev({ subjectType: 'credential', subjectId: c.id, action: 'admin_approved', outcome: 'verified', method, source: method === 'manual_register' ? `${c.issuer}-public-list` : 'evidence', scope: modules.join(','), evidenceId, notes });
      return back('Credential approved.');
    }
    if (action === 'cred_more') {
      await env.DB.prepare("UPDATE credentials SET status = 'more_evidence', updated_at = datetime('now') WHERE id = ?").bind(c.id).run();
      await ev({ subjectType: 'credential', subjectId: c.id, action: 'admin_more_evidence', outcome: 'more_evidence', notes });
      const l = await env.DB.prepare('SELECT email, first_name, last_name, title FROM learners WHERE id = ?').bind(learnerId).first();
      if (l && env.ZEPTOMAIL_TOKEN) {
        const mail = sendMail(env, { to: l.email, toName: name(l), subject: 'Wavelength: more evidence needed', heading: 'More evidence needed', paragraphs: [`Hello ${l.first_name},`, `We are checking your ${t.label || 'credential'}. ${notes}`, 'Add it in the Wavelength app under Me, Professional verification.'], button: { href: 'https://thewavelength.co.uk/app/#/professional', label: 'Open the app' } }).catch(() => false);
        if (ctx && ctx.waitUntil) ctx.waitUntil(mail); else await mail;
      }
      return back('More evidence requested.');
    }
    if (action === 'cred_reject' || action === 'cred_revoke') {
      const s = action === 'cred_reject' ? 'rejected' : 'revoked';
      await env.DB.prepare("UPDATE credentials SET status = ?, verified_by = ?, failure_state = NULL, updated_at = datetime('now') WHERE id = ?").bind(s, actor, c.id).run();
      await ev({ subjectType: 'credential', subjectId: c.id, action: `admin_${s}`, outcome: s, notes });
      return back(s === 'rejected' ? 'Credential rejected.' : 'Credential revoked.');
    }
    if (action === 'cred_reinstate') {
      await env.DB.prepare("UPDATE credentials SET status = 'verified', active = 1, expires_on = COALESCE(?, expires_on), verified_at = ?, verified_by = ?, updated_at = datetime('now') WHERE id = ?").bind(date(f.get('expires_on')), nowIso(), actor, c.id).run();
      await ev({ subjectType: 'credential', subjectId: c.id, action: 'admin_reinstated', outcome: 'verified', notes });
      return back('Credential reinstated.');
    }
  }

  if (action.startsWith('appr_')) {
    if (!notes) return back('Add notes or a reason.');
    if (action === 'appr_add') {
      const st = await currentStatus(env, learnerId);
      if (!st.hasReg) return back('Verify a professional registration first.');
      const scopes = f.getAll('scope').map(String).filter((s) => { const [p, m] = s.split(':'); const pw = PATHS.find((x) => x.id === p); return pw && (m === '*' || pw.modules.some((x) => x.id === m)); });
      if (!scopes.length) return back('Tick at least one module scope.');
      const basis = f.getAll('basis').map(Number).filter((x) => st.credentials.some((c) => c.id === x));
      let added = 0;
      for (const s of scopes) {
        const [p, m] = s.split(':');
        try {
          await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes) VALUES (?,?,?,'approved',?,?,?,?,?)").bind(learnerId, p, m, JSON.stringify(basis), date(f.get('review_on')), actor, nowIso(), notes).run();
          added++;
          await ev({ subjectType: 'approval', action: 'admin_approved', outcome: 'approved', scope: s, notes: `${notes} | basis credentials: ${basis.join(',') || 'none'}` });
        } catch { /* already approved for this scope */ }
      }
      return back(`${added} scope${added === 1 ? '' : 's'} approved.`);
    }
    const a = await env.DB.prepare('SELECT * FROM supervisor_approvals WHERE id = ? AND learner_id = ?').bind(sid, learnerId).first();
    if (!a) return back('Approval not found.');
    if (action === 'appr_revoke') {
      await env.DB.prepare("UPDATE supervisor_approvals SET status = 'revoked', ended_by = ?, ended_at = ?, ended_reason = ? WHERE id = ? AND status = 'approved'").bind(actor, nowIso(), notes, a.id).run();
      await ev({ subjectType: 'approval', subjectId: a.id, action: 'admin_revoked', outcome: 'revoked', scope: `${a.pathway}:${a.module}`, notes });
      return back('Approval revoked.');
    }
    if (action === 'appr_reinstate') {
      // A new row, so the revoked one and its reason stay in the record.
      try { await env.DB.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, review_on, approved_by, approved_at, notes) VALUES (?,?,?,'approved',?,?,?,?,?)").bind(learnerId, a.pathway, a.module, a.basis, date(f.get('review_on')), actor, nowIso(), `Reinstated from #${a.id}: ${notes}`).run(); }
      catch { return back('This scope is already approved.'); }
      await ev({ subjectType: 'approval', subjectId: a.id, action: 'admin_reinstated', outcome: 'approved', scope: `${a.pathway}:${a.module}`, notes });
      return back('Approval reinstated.');
    }
  }
  return back('Nothing changed.');
}

// Evidence file download for administrators. Served as an attachment with a locked-down content type.
export async function evidenceFile(env, id) {
  const e = await env.DB.prepare('SELECT file_name, file_type, file_data FROM credential_evidence WHERE id = ? AND file_data IS NOT NULL').bind(Number(id)).first();
  if (!e) return null;
  const type = ['application/pdf', 'image/png', 'image/jpeg'].includes(e.file_type) ? e.file_type : 'application/octet-stream';
  // D1 may return a BLOB as an ArrayBuffer or as an array of byte values.
  return new Response(new Uint8Array(e.file_data), { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${String(e.file_name || 'evidence').replace(/[^\w .()-]/g, '_')}"`, 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}
