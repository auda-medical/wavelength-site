// Admin: listing claims on the supervisor person page (worker/supervisors-admin.js). An account says "this official
// listing is me"; an administrator confirms identity by a recorded method before the listing counts. Confirming
// verifies the credential the listing shows (role and modules exactly as listed, method 'directory_listing'), and
// nothing more: approval to supervise is still the separate decision on the same page.
import CFG from '../../data/credentials.json';
import { logEvent } from '../professional.js';
import { auditStmt } from '../audit.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const SOURCE_BODY = { 'dir:famus': 'sam', 'dir:fusic': 'ics', 'dir:bse': 'bse' };
export const IDENTITY_METHODS = {
  listed_contact_matches: 'The contact the directory lists matches the account\'s verified email (checked by hand)',
  employer_confirmation: 'Confirmed with the employer or department',
  video_or_in_person: 'Video call or in person, with photo identification',
  professional_register: 'Same person as the verified professional registration (name and organisation)',
  other: 'Other (say how in the note)',
};
// The credential types a listing's role and module correspond to: same body, same role, a module mapped to it.
export function credentialsForListing(sourceId, roles) {
  const body = SOURCE_BODY[sourceId];
  const out = new Map();
  for (const r of roles || []) {
    const pathway = String(r.module).split('-')[0];
    for (const t of CFG.credentialTypes) {
      if (t.body !== body || t.role !== r.role) continue;
      const m = (t.modules || []).find((x) => x.scope === `${pathway}:${r.module}`);
      if (!m) continue;
      if (!out.has(t.id)) out.set(t.id, { type: t, modules: [] });
      if (!out.get(t.id).modules.includes(m.id)) out.get(t.id).modules.push(m.id);
    }
  }
  return [...out.values()];
}
async function listingOf(env, sourceId, key) {
  const s = await env.DB.prepare('SELECT entries FROM directory_snapshots WHERE source_id = ? AND current = 1 ORDER BY id DESC LIMIT 1').bind(sourceId).first().catch(() => null);
  return s ? JSON.parse(s.entries).find((e) => e.key === key) || null : null;
}
export async function claimsPanel(env, learnerId, form) {
  let rows;
  try { rows = (await env.DB.prepare("SELECT k.*, m.name AS source_name FROM directory_links k LEFT JOIN monitor_sources m ON m.id = k.source_id WHERE k.learner_id = ? ORDER BY k.id DESC").bind(learnerId).all()).results || []; } catch { return ''; }
  if (!rows.length) return '';
  const cards = [];
  for (const k of rows) {
    const e = await listingOf(env, k.source_id, k.entry_key);
    const roles = e ? e.roles.map((r) => `${r.role} ${r.module}`).join(', ') : '';
    const flag = k.flag ? `<p class="sv-banner sv-warn"><b>The listing changed since:</b> ${esc(k.flag === 'listing_removed' ? 'no longer in the directory' : 'its modules or role changed')}. Review any approval that relies on it. Nothing was revoked.</p>` : '';
    const H = { learner: learnerId, link: k.id };
    cards.push(`<div class="sv-card"><h4>${esc(k.source_name || k.source_id)}: ${esc(e ? e.name : k.entry_key)} <span class="sv-status">${esc(k.status)}</span></h4>
      <p>${e ? `${esc(e.organisation)} · ${esc(roles)}${e.status === 'removed' ? ' · <b>removed from the directory</b>' : ''}` : 'Not in the current directory snapshot.'}<br><small>Claimed ${esc(String(k.claimed_at).slice(0, 10))}${k.decided_at ? ` · decided ${esc(String(k.decided_at).slice(0, 10))} by ${esc(k.decided_by || '')}${k.identity_method ? ` (${esc(IDENTITY_METHODS[k.identity_method] || k.identity_method)})` : ''}` : ''}</small></p>${flag}
      ${k.status === 'claimed' ? `<div class="sv-actions">${form('listing_confirm', H, `<label>How you confirmed it is the same person<select name="method" required>${Object.entries(IDENTITY_METHODS).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label>Note (required for "Other")<input name="notes" maxlength="500"></label><p class="form-note">A matching name is never enough on its own. Confirming verifies the credential the listing shows, for exactly the modules listed. It does not approve them to supervise.</p>`, 'Confirm identity')}${form('listing_reject', H, '<label>Reason (internal)<input name="notes" maxlength="500" required></label>', 'Reject claim')}</div>` : ''}
      ${k.status === 'confirmed' && k.flag ? form('listing_flag_clear', H, '<label>What you checked (required)<input name="notes" maxlength="500" required></label>', 'Mark the change reviewed') : ''}</div>`);
  }
  return `<h3 style="margin:28px 0 10px">Official directory listings claimed</h3><div class="sv-grid">${cards.join('')}</div>`;
}
// Returns the message to show, or null when the action is not one of these.
export async function claimsPost(env, f, action, { learnerId, actor, notes }) {
  if (!['listing_confirm', 'listing_reject', 'listing_flag_clear'].includes(action)) return null;
  const k = await env.DB.prepare('SELECT * FROM directory_links WHERE id = ? AND learner_id = ?').bind(Number(f.get('link')), learnerId).first();
  if (!k) return 'Claim not found.';
  const at = new Date().toISOString();
  if (action === 'listing_reject') {
    if (!notes) return 'Give a reason.';
    const r = await env.DB.prepare("UPDATE directory_links SET status = 'rejected', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'claimed'").bind(at, actor, k.id).run();
    if (!(r.meta && r.meta.changes)) return 'This claim was already decided.';
    await logEvent(env, { learnerId, subjectType: 'directory', subjectId: k.id, action: 'listing_rejected', outcome: 'rejected', actor, notes });
    return 'Claim rejected.';
  }
  if (action === 'listing_flag_clear') {
    if (!notes) return 'Say what you checked.';
    await env.DB.prepare('UPDATE directory_links SET flag = NULL WHERE id = ?').bind(k.id).run();
    await logEvent(env, { learnerId, subjectType: 'directory', subjectId: k.id, action: 'listing_change_reviewed', outcome: 'reviewed', actor, notes });
    return 'Listing change marked reviewed.';
  }
  const method = Object.keys(IDENTITY_METHODS).includes(f.get('method')) ? String(f.get('method')) : null;
  if (!method) return 'Choose how you confirmed it is the same person.';
  if (method === 'other' && notes.length < 10) return 'Say how you confirmed it.';
  const e = await listingOf(env, k.source_id, k.entry_key);
  if (!e || e.status === 'removed') return 'This listing is not in the current directory, so it cannot be confirmed.';
  const taken = await env.DB.prepare("SELECT id FROM directory_links WHERE source_id = ? AND entry_key = ? AND status = 'confirmed' AND learner_id != ?").bind(k.source_id, k.entry_key, learnerId).first();
  if (taken) return 'Another account is already confirmed as this listed person. Resolve that first.';
  const guard = await env.DB.prepare("UPDATE directory_links SET status = 'confirmed', decided_at = ?, decided_by = ?, identity_method = ?, flag = NULL WHERE id = ? AND status = 'claimed'").bind(at, actor, method, k.id).run();
  if (!(guard.meta && guard.meta.changes)) return 'This claim was already decided.';
  // The credentials the listing shows, verified from the directory for exactly the listed modules.
  const creds = credentialsForListing(k.source_id, e.roles);
  for (const c of creds) {
    const cur = await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? AND credential_type = ? AND active = 1').bind(learnerId, c.type.id).first();
    if (cur) await env.DB.prepare("UPDATE credentials SET modules = ?, status = 'verified', verification_method = 'directory_listing', verification_source = ?, verified_at = ?, verified_by = ?, failure_state = NULL, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(c.modules), k.source_id, at, actor, cur.id).run();
    else await env.DB.prepare("INSERT INTO credentials (learner_id, credential_type, issuer, programme, role, modules, status, verification_method, verification_source, verified_at, verified_by) VALUES (?,?,?,?,?,?, 'verified', 'directory_listing', ?, ?, ?)").bind(learnerId, c.type.id, c.type.body, c.type.programme, c.type.role, JSON.stringify(c.modules), k.source_id, at, actor).run();
    const id = (await env.DB.prepare('SELECT id FROM credentials WHERE learner_id = ? AND credential_type = ? AND active = 1').bind(learnerId, c.type.id).first()).id;
    await env.DB.prepare('UPDATE directory_links SET credential_id = COALESCE(credential_id, ?) WHERE id = ?').bind(id, k.id).run();
    await logEvent(env, { learnerId, subjectType: 'credential', subjectId: id, action: 'admin_approved', outcome: 'verified', actor, method: 'directory_listing', source: k.source_id, scope: c.modules.join(','), notes: `Directory listing ${k.entry_key}; identity: ${method}${notes ? ` | ${notes}` : ''}` });
  }
  await auditStmt(env, { actorType: 'admin', actorId: actor.replace(/^admin:/, ''), action: 'listing.confirm', subjectType: 'learner', subjectId: learnerId, meta: { method, scopes: e.roles.map((r) => r.module), count: creds.length } }).run().catch(() => null);
  return `Identity confirmed. ${creds.length ? `${creds.map((c) => `${c.type.label}: ${c.modules.join(', ')}`).join('; ')} verified from the directory.` : 'The listing shows no credential Wavelength records.'} Approve supervision separately below if appropriate.`;
}
// Needs attention: confirmed or pending claims whose listing changed.
export async function flaggedClaims(env) {
  try { return (await env.DB.prepare("SELECT k.learner_id, k.flag, k.source_id, l.title, l.first_name, l.last_name FROM directory_links k JOIN learners l ON l.id = k.learner_id WHERE k.flag IS NOT NULL AND k.status IN ('claimed', 'confirmed')").all()).results || []; } catch { return []; }
}
