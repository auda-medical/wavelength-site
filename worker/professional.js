// Professional identity, external credentials, Wavelength supervisor approvals, badges, the supervisor directory and
// the supervisor-status snapshot stored with every sign-off and assessment. Architecture: docs/verification-architecture.md.
//
// Five separate things, never merged into one flag:
//   1. email ownership (learners.email_status)            worker/email-verify.js
//   2. professional registration (professional_registrations), checked against a regulator through an adapter
//   3. external credentials (credentials), each issued by an outside body, verified and revoked one by one
//   4. Wavelength supervisor approval (supervisor_approvals), scoped to one pathway module, granted by an administrator
//   5. what a reviewer sees: badges and snapshots computed from 1 to 4 on the server
// Every status here is decided on the server. Anything a browser sends about verification is ignored.
import CFG from '../data/credentials.json';
import LOGBOOK from '../data/logbook.json';
import { json, clip, body, fullName, verificationReady, lifecycleReady } from './app-util.js';
import { ukDate, inDate, addDays } from './time.js';
import { adapterFor, isMockSource } from './verification/adapters.js';
import { matchNames } from './verification/names.js';
import { orgField, saveOrgId } from './organisations.js';

export const REG = Object.fromEntries(CFG.regulators.map((r) => [r.id, r]));
export const TYPE = Object.fromEntries(CFG.credentialTypes.map((t) => [t.id, t]));
export const BODY = Object.fromEntries(CFG.bodies.map((b) => [b.id, b]));
const PATHS = Object.fromEntries(LOGBOOK.pathways.map((p) => [p.id, p]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => ukDate();
const nowIso = () => new Date().toISOString();
const SUPERVISING_ROLES = ['supervisor', 'mentor', 'trainer'];
export const PURGE_EVIDENCE_DAYS = 30;
const EVIDENCE_MAX = 1048576;
const EVIDENCE_KINDS = ['certificate', 'letter', 'institution', 'body_correspondence', 'public_profile', 'other'];
const LIMITS = { registration: 5, credential: 10, evidence: 20 }; // per account per day
const UNAVAILABLE = 'The Wavelength team will check this by hand. We email you when it is done.';

// ---------- Audit trail ----------
export async function logEvent(env, e) {
  await env.DB.prepare('INSERT INTO verification_events (learner_id, subject_type, subject_id, action, outcome, actor, source, method, match_method, match_version, match_result, scope, evidence_id, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(e.learnerId ?? null, e.subjectType, e.subjectId ?? null, e.action, e.outcome ?? null, e.actor || 'system', e.source ?? null, e.method ?? null, e.matchMethod ?? null, e.matchVersion ?? null, e.matchResult ?? null, e.scope ?? null, e.evidenceId ?? null, e.notes ? clip(e.notes, 2000) : null).run();
}
async function recentCount(env, learnerId, action) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM verification_events WHERE learner_id = ? AND action = ? AND at > datetime('now', '-1 day')").bind(learnerId, action).first();
  return (r && r.n) || 0;
}

// ---------- Registration numbers and names ----------
export function normaliseNumber(reg, raw) {
  const n = String(raw == null ? '' : raw).toUpperCase().replace(/[\s.]/g, '');
  return new RegExp(reg.numberPattern).test(n) ? n : null;
}
const accountName = (l) => ({ given: l.first_name, family: l.last_name });
// Organisation names: compare the words that identify a place, not "NHS Foundation Trust".
const ORG_NOISE = new Set(['nhs', 'the', 'and', 'of', 'foundation', 'trust', 'university', 'universities', 'hospital', 'hospitals', 'teaching', 'health', 'board', 'healthcare', 'uhb', 'ft', 'trusts', 'royal', 'general', 'infirmary', 'centre', 'center', 'medical']);
function orgWords(s) { return new Set(String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !ORG_NOISE.has(w))); }
export function sameOrganisation(a, b) {
  const x = orgWords(a), y = orgWords(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared >= 1 && shared >= Math.min(x.size, y.size) / 2;
}

// ---------- Current status, derived on every read ----------
const isCurrentReg = (r) => r.active && r.status === 'verified';
const isCurrentCred = (c) => c.active && c.status === 'verified' && inDate(c.expires_on, ukDate()) && inDate(c.review_on, ukDate());
export async function currentStatus(env, learnerId) {
  const life = await lifecycleReady(env);
  const [l, regs, creds, apps, renewal, block] = await Promise.all([
    env.DB.prepare(`SELECT id, email, title, first_name, last_name, organisation, role, email_status, email_verified_at${life ? ', test_account' : ''} FROM learners WHERE id = ?`).bind(learnerId).first(),
    env.DB.prepare('SELECT * FROM professional_registrations WHERE learner_id = ? AND active = 1 ORDER BY id').bind(learnerId).all(),
    env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? AND active = 1 ORDER BY id').bind(learnerId).all(),
    env.DB.prepare("SELECT * FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved' ORDER BY pathway, module").bind(learnerId).all(),
    life ? env.DB.prepare("SELECT * FROM supervisor_applications WHERE learner_id = ? AND kind = 'renewal' AND status IN ('submitted', 'more_info') ORDER BY id DESC LIMIT 1").bind(learnerId).first() : null,
    life ? env.DB.prepare('SELECT * FROM supervisor_blocks WHERE learner_id = ? AND lifted_at IS NULL ORDER BY id DESC LIMIT 1').bind(learnerId).first() : null,
  ]);
  const registrations = regs.results || [], credentials = creds.results || [];
  const hasReg = registrations.some(isCurrentReg);
  const day = ukDate();
  // An approval counts only while it is in date and the person still holds a verified registration. A lapse found on
  // recheck therefore removes supervisor privileges at once without deleting the approval or its history.
  // After migration 0012 (supervisor lifecycle) an approval is current only while every one of these holds, checked on
  // every read, so suspension is never stored and a fixed lapse restores privileges on its own:
  //   the email is verified; the registration is verified, or the approval records an administrator's exemption;
  //   every credential the administrator marked as required is still current; and the review date has not passed,
  //   or a complete renewal is within its 30-day grace period (graceFor below).
  const emailOk = !!l && l.email_status === 'verified';
  const credOk = (ids) => parseList(ids).every((id) => credentials.some((c) => c.id === Number(id) && isCurrentCred(c)));
  const approvals = (apps.results || []).map((a) => {
    if (!life) return { ...a, current: hasReg && inDate(a.review_on, day) };
    const regOk = hasReg || !!a.registration_exempt;
    const basisOk = credOk(a.required_basis);
    const inTerm = inDate(a.review_on, day);
    const grace = !inTerm && regOk && basisOk && emailOk && !block && graceFor(a, renewal, day);
    const lapse = !emailOk ? 'email' : !regOk ? 'registration' : !basisOk ? 'credential' : null;
    return { ...a, current: emailOk && regOk && basisOk && (inTerm || grace), grace: !!grace, lapse, graceUntil: grace ? addDays(a.review_on, GRACE_DAYS) : null };
  });
  return { learner: l, registrations, credentials, approvals, hasReg, renewal: renewal || null, block: block || null, lifecycle: life };
}
// Fero's conditions (6 October 2026) for up to 30 days of grace after the review date: the renewal was submitted on
// or before that date, the supervisor was fully approved and current when they submitted it, it is complete (not
// waiting on information Wavelength asked for), no administrator has recorded a material change, and (checked by the
// caller) the registration, required credentials and email are still current and there is no block. Status shows as
// "Renewal under review"; the approval is not described as renewed until an administrator confirms it.
export const GRACE_DAYS = 30;
function graceFor(a, renewal, day) {
  if (!renewal || renewal.status !== 'submitted' || !renewal.current_at_submit || renewal.grace_blocked) return false;
  if (!a.review_on || ukDate(renewal.submitted_at) > a.review_on) return false;
  return day <= addDays(a.review_on, GRACE_DAYS);
}
export const scopeLabel = (pathway, module) => {
  const pw = PATHS[pathway]; if (!pw) return `${pathway} ${module}`;
  if (module === '*') return `${pw.label}, all modules`;
  const m = pw.modules.find((x) => x.id === module);
  return `${pw.label} ${m ? m.label : module}`;
};
const moduleLabels = (type, ids) => ids.map((id) => ((type.modules || []).find((m) => m.id === id) || { label: id }).label);
const parseList = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const sourceText = (row, issuerName) => {
  if (row.verification_method === 'automatic_register') return `Checked automatically against ${issuerName}`;
  if (row.verification_method === 'manual_register') return `Checked by the Wavelength team against ${issuerName}`;
  if (row.verification_method === 'manual_evidence') return 'Checked by the Wavelength team from evidence the holder provided';
  return 'Checked by the Wavelength team';
};
const showSource = (env, s) => !isMockSource(s) || env.VERIFY_MOCK === 'true';

// Text badges. No body's logo is ever used. Each badge says who issued the credential and how Wavelength checked it.
export function badgesFrom(env, st) {
  const out = [];
  if (st.learner && st.learner.email_status === 'verified') out.push({ kind: 'email', label: 'Email verified', verifiedAt: st.learner.email_verified_at });
  for (const r of st.registrations.filter(isCurrentReg)) {
    if (!showSource(env, r.verification_source)) continue;
    const reg = REG[r.regulator] || { short: r.regulator, name: r.regulator };
    out.push({ kind: 'registration', label: `${reg.short} registration verified`, issuer: reg.name, credential: r.profession || 'Registered professional', source: sourceText(r, `the ${reg.short} register`), verifiedAt: r.verified_at, lastChecked: r.last_checked_at });
  }
  for (const c of st.credentials.filter(isCurrentCred)) {
    if (!showSource(env, c.verification_source)) continue;
    const t = TYPE[c.credential_type] || { label: c.credential_type, modules: [] };
    const b = BODY[c.issuer] || { name: c.issuer, short: c.issuer };
    out.push({ kind: 'credential', label: `${t.label} verified`, issuer: b.name, credential: t.label, modules: moduleLabels(t, parseList(c.modules)), source: sourceText(c, `the ${b.short} record`), verifiedAt: c.verified_at, expiresOn: c.expires_on, reviewOn: c.review_on, note: 'Issued by ' + b.name + ', not by Wavelength.' });
  }
  const scopes = st.approvals.filter((a) => a.current);
  if (scopes.length) out.push({ kind: 'wavelength-supervisor', label: 'Wavelength verified supervisor', issuer: 'Wavelength', scopes: scopes.map((a) => ({ pathway: a.pathway, module: a.module, label: scopeLabel(a.pathway, a.module), approvedAt: a.approved_at, reviewOn: a.review_on })) });
  return out;
}

// ---------- Registration checks ----------
const backoff = (n) => Date.now() + Math.min(24 * 3600e3, 3600e3 * 2 ** Math.min(n, 5));
// Runs the adapter for one registration row and records the result. kind: 'claim' | 'recheck' | 'admin'.
export async function checkRegistration(env, row, kind = 'claim', actor = 'system') {
  const reg = REG[row.regulator];
  const l = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(row.learner_id).first();
  const adapter = adapterFor(env, reg);
  let res;
  try { res = await adapter.lookupRegistration(env, { regulator: row.regulator, number: row.registration_number }); }
  catch { res = { outcome: 'unavailable', source: adapter.id }; }
  const u = { last_checked_at: nowIso(), verification_source: res.source || null };
  let outcome = res.outcome, match = null;
  if (outcome === 'manual') {
    // No supported source. A verified registration stays verified (an administrator checked it); anything else waits.
    if (row.status === 'verified') return row;
    Object.assign(u, { status: 'manual_verification_required', next_check_at: null, failure_state: null });
  } else if (outcome === 'unavailable') {
    // A source outage is never a lapse: keep the current status and try again later.
    Object.assign(u, { status: row.status === 'verified' ? 'verified' : 'source_unavailable', failure_state: 'source_unavailable', failure_count: (row.failure_count || 0) + 1, next_check_at: backoff(row.failure_count || 0) });
  } else if (outcome === 'not_found') {
    Object.assign(u, { status: 'not_found', register_name: null, register_status: null, register_fields: null, failure_state: null, failure_count: 0, next_check_at: null });
  } else {
    const rec = res.record || {};
    const name = typeof rec.name === 'string' ? rec.name : [rec.name && rec.name.given, rec.name && rec.name.family].filter(Boolean).join(' ');
    // Keep only a few plain fields, never the raw response.
    const fields = {}; for (const [k, v] of Object.entries(rec.fields || {}).slice(0, 8)) if (/^[a-zA-Z]{1,30}$/.test(k) && ['string', 'boolean', 'number'].includes(typeof v)) fields[k] = typeof v === 'string' ? clip(v, 120) : v;
    Object.assign(u, { register_name: clip(name, 160), register_status: clip(rec.status, 30), register_fields: JSON.stringify(fields), failure_state: null, failure_count: 0 });
    if (!rec.current) { outcome = 'not_current'; Object.assign(u, { status: 'not_current', next_check_at: Date.now() + (reg.recheckDays || 30) * 864e5 }); }
    else {
      match = matchNames(accountName(l), rec.name);
      Object.assign(u, { match_method: match.method, match_version: match.version, match_result: match.result });
      if (match.result === 'match') Object.assign(u, { status: 'verified', verification_method: 'automatic_register', verified_at: row.status === 'verified' && row.verified_at ? row.verified_at : nowIso(), next_check_at: Date.now() + (reg.recheckDays || 30) * 864e5 });
      else Object.assign(u, { status: match.result === 'review' ? 'manual_review' : 'mismatch', next_check_at: null });
      outcome = match.result === 'match' ? 'verified' : match.result === 'review' ? 'manual_review' : 'mismatch';
    }
  }
  const saved = await saveRegistration(env, row, u);
  await logEvent(env, { learnerId: row.learner_id, subjectType: 'registration', subjectId: row.id, action: kind === 'recheck' ? 'recheck' : 'automatic_check', outcome: saved.status === 'manual_review' && saved.failure_state === 'conflict' ? 'conflict' : outcome, actor, source: res.source || adapter.id, method: adapter.mode, matchMethod: match && match.method, matchVersion: match && match.version, matchResult: match && match.result, notes: `${adapter.id} ${adapter.version}` });
  return saved;
}
async function saveRegistration(env, row, u) {
  const keys = Object.keys(u);
  const sql = `UPDATE professional_registrations SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`;
  try { await env.DB.prepare(sql).bind(...keys.map((k) => u[k] ?? null), row.id).run(); }
  catch (e) {
    // Another account already holds this number as verified (the unique index): two people cannot both be verified
    // for one registration, whoever got there first. Send it to a person instead.
    if (!/unique|constraint/i.test(String(e && e.message))) throw e;
    await env.DB.prepare("UPDATE professional_registrations SET status = 'manual_review', failure_state = 'conflict', last_checked_at = ?, updated_at = datetime('now') WHERE id = ?").bind(nowIso(), row.id).run();
  }
  return env.DB.prepare('SELECT * FROM professional_registrations WHERE id = ?').bind(row.id).first();
}

export async function submitRegistration(env, l, d) {
  const reg = REG[d.regulator];
  if (!reg) return json({ ok: false, error: 'Choose your regulator.' }, 400);
  // organisationId beside the typed organisation (plan section 19): checked against the list, typed text kept.
  const org = await orgField(env, d.organisationId);
  if (!org.ok) return json({ ok: false, error: org.error }, 400);
  const number = normaliseNumber(reg, d.number);
  if (!number) return json({ ok: false, error: `Check your ${reg.numberLabel}: ${reg.numberHint}.` }, 400);
  if ((await recentCount(env, l.id, 'registration_submitted')) >= LIMITS.registration) return json({ ok: false, error: 'You have made several changes today. Try again tomorrow.' }, 429);
  const profession = reg.professions.includes(d.profession) ? d.profession : reg.professions[0];
  const fields = { profession, organisation: clip(d.organisation, 160) || l.organisation || null, role: clip(d.role, 120) || null, country: reg.country, claimed_name: [l.first_name, l.last_name].join(' ') };
  let row = await env.DB.prepare('SELECT * FROM professional_registrations WHERE learner_id = ? AND regulator = ? AND active = 1').bind(l.id, reg.id).first();
  if (row && row.registration_number === number && ['verified', 'manual_review', 'manual_verification_required'].includes(row.status)) {
    await env.DB.prepare("UPDATE professional_registrations SET profession = ?, organisation = ?, role = ?, updated_at = datetime('now') WHERE id = ?").bind(fields.profession, fields.organisation, fields.role, row.id).run();
    await saveOrgId(env, 'professional_registrations', row.id, org, fields.organisation, row.organisation);
    return json({ ok: true, registration: publicRegistration(await env.DB.prepare('SELECT * FROM professional_registrations WHERE id = ?').bind(row.id).first()) });
  }
  const prevOrg = row ? row.organisation : undefined;
  if (row) {
    // A new number replaces the old one and starts again.
    await env.DB.prepare("UPDATE professional_registrations SET registration_number = ?, profession = ?, organisation = ?, role = ?, claimed_name = ?, status = 'pending', register_name = NULL, register_status = NULL, register_fields = NULL, verified_at = NULL, verification_method = NULL, verification_source = NULL, match_method = NULL, match_version = NULL, match_result = NULL, failure_state = NULL, failure_count = 0, updated_at = datetime('now') WHERE id = ?")
      .bind(number, fields.profession, fields.organisation, fields.role, fields.claimed_name, row.id).run();
  } else {
    try {
      await env.DB.prepare("INSERT INTO professional_registrations (learner_id, regulator, registration_number, profession, claimed_name, organisation, role, country, status) VALUES (?,?,?,?,?,?,?,?,'pending')")
        .bind(l.id, reg.id, number, fields.profession, fields.claimed_name, fields.organisation, fields.role, fields.country).run();
    } catch { return json({ ok: false, error: 'Something went wrong. Please try again.' }, 409); } // a second tab inserted it first
  }
  row = await env.DB.prepare('SELECT * FROM professional_registrations WHERE learner_id = ? AND regulator = ? AND active = 1').bind(l.id, reg.id).first();
  await saveOrgId(env, 'professional_registrations', row.id, org, fields.organisation, prevOrg);
  await logEvent(env, { learnerId: l.id, subjectType: 'registration', subjectId: row.id, action: 'registration_submitted', actor: 'learner', notes: `${reg.short} number entered` });
  // Someone else already holds this number as verified. Do not say who: an administrator looks at both.
  const other = await env.DB.prepare("SELECT id FROM professional_registrations WHERE regulator = ? AND registration_number = ? AND status = 'verified' AND active = 1 AND learner_id != ?").bind(reg.id, number, l.id).first();
  if (other) {
    row = await saveRegistration(env, row, { status: 'manual_review', failure_state: 'conflict', last_checked_at: nowIso() });
    await logEvent(env, { learnerId: l.id, subjectType: 'registration', subjectId: row.id, action: 'automatic_check', outcome: 'conflict', notes: `Number already verified on registration ${other.id}` });
  } else row = await checkRegistration(env, row, 'claim');
  return json({ ok: true, registration: publicRegistration(row) });
}

const REG_MESSAGES = {
  verified: 'Verified against the register.',
  pending: 'Waiting to be checked.',
  manual_verification_required: 'Wavelength cannot check this register automatically yet. The Wavelength team will check it by hand against the public register.',
  manual_review: UNAVAILABLE,
  mismatch: 'The name on the register does not match the name on your account. The Wavelength team will look at it. If your name has changed, add a note or evidence.',
  not_found: 'We could not find that number on the register. Check it and enter it again.',
  not_current: 'The register shows this registration is not current.',
  source_unavailable: 'The register could not be reached. We will try again automatically.',
  rejected: 'The Wavelength team could not verify this registration.',
  withdrawn: 'Withdrawn.',
};
export function publicRegistration(r) {
  const reg = REG[r.regulator] || {};
  return { id: r.id, regulator: r.regulator, regulatorName: reg.name, regulatorShort: reg.short, number: r.registration_number, profession: r.profession, organisation: r.organisation, role: r.role, status: r.status, message: REG_MESSAGES[r.status] || '', registerName: r.status === 'verified' ? r.register_name : null, registerStatus: r.register_status, verifiedAt: r.verified_at, lastCheckedAt: r.last_checked_at, method: r.verification_method, registerUrl: reg.registerUrl };
}

// ---------- Credential checks ----------
// Auto-verifies only when the person's registration is verified and exactly one record in the authoritative source
// fits on two independent points (registration number, or name and organisation) and covers every module claimed.
export async function checkCredential(env, cred, kind = 'claim', actor = 'system') {
  const type = TYPE[cred.credential_type];
  const st = await currentStatus(env, cred.learner_id);
  const reg = st.registrations.find(isCurrentReg) || null;
  const adapter = adapterFor(env, type);
  const modules = parseList(cred.modules);
  const person = { name: reg && reg.register_name ? reg.register_name : accountName(st.learner), organisation: (reg && reg.organisation) || st.learner.organisation, registration: reg && reg.registration_number };
  let res;
  try { res = await adapter.findCredential(env, { type: type.id, modules, person }); }
  catch { res = { outcome: 'unavailable', source: adapter.id, records: [] }; }
  const u = { last_checked_at: nowIso(), verification_source: res.source || null };
  let outcome = res.outcome, mm = null;
  const hasEvidence = !!(await env.DB.prepare("SELECT id FROM credential_evidence WHERE subject_type = 'credential' AND subject_id = ? LIMIT 1").bind(cred.id).first());
  if (outcome === 'manual') {
    if (cred.status === 'verified') return cred;
    Object.assign(u, { status: hasEvidence ? 'manual_review' : 'evidence_required', next_check_at: null });
  } else if (outcome === 'unavailable') {
    Object.assign(u, { status: cred.status === 'verified' ? 'verified' : 'source_unavailable', failure_state: 'source_unavailable', next_check_at: backoff(1) });
  } else {
    const fits = (res.records || []).filter((r) => modules.every((m) => (r.modules || []).includes(m)) && (!r.role || r.role === type.role));
    const scored = fits.map((r) => {
      const nm = matchNames(person.name, r.name);
      const id = !!(r.registrationNumber && person.registration && String(r.registrationNumber).toUpperCase() === person.registration);
      const org = sameOrganisation(r.organisation, person.organisation);
      return { r, nm, id, strong: id || (nm.result === 'match' && org), possible: id || nm.result !== 'mismatch' };
    });
    const strong = scored.filter((x) => x.strong), possible = scored.filter((x) => x.possible);
    if (!possible.length) { outcome = 'not_found'; Object.assign(u, { status: hasEvidence ? 'manual_review' : 'not_found', failure_state: null }); }
    else if (!reg || strong.length !== 1 || possible.length !== 1) {
      outcome = 'ambiguous'; mm = (strong[0] || possible[0]).nm;
      Object.assign(u, { status: 'manual_review', failure_state: !reg ? 'no_verified_registration' : 'ambiguous', match_method: mm.method, match_version: mm.version, match_result: 'ambiguous' });
    } else {
      const hit = strong[0]; mm = hit.nm;
      const expires = ISO.test(hit.r.expiresOn || '') ? hit.r.expiresOn : null;
      const expired = expires && expires < today();
      outcome = expired ? 'expired' : 'verified';
      Object.assign(u, { status: expired ? 'expired' : 'verified', expires_on: expires || cred.expires_on, verification_method: 'automatic_register', verified_at: expired ? cred.verified_at : (cred.status === 'verified' && cred.verified_at ? cred.verified_at : nowIso()), verified_by: 'system', registration_id: reg.id, match_method: hit.id ? 'registration_number' : `name_and_organisation:${mm.method}`, match_version: mm.version, match_result: 'match', failure_state: null, next_check_at: Date.now() + (type.recheckDays || 180) * 864e5 });
    }
  }
  const keys = Object.keys(u);
  await env.DB.prepare(`UPDATE credentials SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...keys.map((k) => u[k] ?? null), cred.id).run();
  await logEvent(env, { learnerId: cred.learner_id, subjectType: 'credential', subjectId: cred.id, action: kind === 'recheck' ? 'recheck' : 'automatic_check', outcome, actor, source: res.source || adapter.id, method: adapter.mode, matchMethod: u.match_method, matchVersion: u.match_version, matchResult: u.match_result, scope: modules.join(','), notes: `${adapter.id} ${adapter.version}` });
  return env.DB.prepare('SELECT * FROM credentials WHERE id = ?').bind(cred.id).first();
}

export async function submitCredential(env, l, d) {
  const type = TYPE[d.type];
  if (!type) return json({ ok: false, error: 'Choose the credential.' }, 400);
  const modules = [...new Set((Array.isArray(d.modules) ? d.modules : []).map(String))].filter((m) => type.modules.some((x) => x.id === m));
  if (!modules.length) return json({ ok: false, error: 'Choose at least one module.' }, 400);
  if ((await recentCount(env, l.id, 'credential_submitted')) >= LIMITS.credential) return json({ ok: false, error: 'You have made several changes today. Try again tomorrow.' }, 429);
  const date = (v) => (ISO.test(v || '') ? v : null);
  const f = { reference: clip(d.reference, 80) || null, issued_on: date(d.issuedOn), expires_on: date(d.expiresOn), claim_note: clip(d.note, 1000) || null };
  let cred = await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? AND credential_type = ? AND active = 1').bind(l.id, type.id).first();
  if (cred && cred.status === 'verified' && modules.every((m) => parseList(cred.modules).includes(m))) return json({ ok: true, credential: publicCredential(cred) });
  if (cred) {
    // A different set of modules is a new claim. The holder can narrow or change it; it is checked again.
    await env.DB.prepare("UPDATE credentials SET modules = ?, reference = ?, issued_on = ?, expires_on = ?, claim_note = ?, status = 'claimed', verified_at = NULL, verified_by = NULL, verification_method = NULL, match_result = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(modules), f.reference, f.issued_on, f.expires_on, f.claim_note, cred.id).run();
  } else {
    await env.DB.prepare("INSERT INTO credentials (learner_id, credential_type, issuer, programme, role, modules, reference, issued_on, expires_on, claim_note, status) VALUES (?,?,?,?,?,?,?,?,?,?,'claimed')")
      .bind(l.id, type.id, type.body, type.programme, type.role, JSON.stringify(modules), f.reference, f.issued_on, f.expires_on, f.claim_note).run();
  }
  cred = await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ? AND credential_type = ? AND active = 1').bind(l.id, type.id).first();
  await logEvent(env, { learnerId: l.id, subjectType: 'credential', subjectId: cred.id, action: 'credential_submitted', actor: 'learner', scope: modules.join(',') });
  cred = await checkCredential(env, cred, 'claim');
  return json({ ok: true, credential: publicCredential(cred) });
}

const CRED_MESSAGES = {
  verified: 'Verified.', claimed: 'Waiting to be checked.',
  evidence_required: 'There is no register Wavelength can check automatically. Add evidence, such as your certificate or a letter, and the Wavelength team will review it.',
  manual_review: UNAVAILABLE, more_evidence: 'The Wavelength team asked for more evidence.',
  not_found: 'We could not find a matching record. Add evidence and the Wavelength team will review it.',
  source_unavailable: 'The source could not be reached. We will try again automatically.',
  expired: 'This credential has expired.', rejected: 'The Wavelength team could not verify this credential.', revoked: 'Withdrawn by the Wavelength team.', withdrawn: 'Withdrawn.',
};
export function publicCredential(c, evidence = []) {
  const t = TYPE[c.credential_type] || { label: c.credential_type, modules: [] };
  const expired = c.status === 'verified' && !isCurrentCred(c);
  return { id: c.id, type: c.credential_type, label: t.label, issuer: (BODY[c.issuer] || {}).name || c.issuer, modules: parseList(c.modules), moduleLabels: moduleLabels(t, parseList(c.modules)), status: expired ? 'expired' : c.status, message: CRED_MESSAGES[expired ? 'expired' : c.status] || '', reference: c.reference, issuedOn: c.issued_on, expiresOn: c.expires_on, reviewOn: c.review_on, verifiedAt: c.verified_at, method: c.verification_method, evidence: evidence.map((e) => ({ id: e.id, kind: e.kind, description: e.description, url: e.url, fileName: e.file_name, at: e.created_at, purged: !!e.purged_at })) };
}

// ---------- Evidence ----------
const MAGIC = [['application/pdf', [0x25, 0x50, 0x44, 0x46]], ['image/png', [0x89, 0x50, 0x4e, 0x47]], ['image/jpeg', [0xff, 0xd8, 0xff]]];
const sniff = (u8) => (MAGIC.find(([, m]) => m.every((b, i) => u8[i] === b)) || [null])[0];
const hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
// JSON { subject, id, kind, description, url } or raw bytes with ?subject=&id=&kind=&description=&name=
// subject 'application' (a supervisor application, migration 0012) is reached only through worker/supervisor-apply.js.
// uploadId: a value the app makes per file, so a retried or double-tapped upload returns the first copy.
export async function addEvidence(env, l, req, url, { allowApplication = false } = {}) {
  const raw = !(req.headers.get('Content-Type') || '').includes('application/json');
  const d = raw ? Object.fromEntries(url.searchParams) : (await body(req)) || {};
  const subject = d.subject === 'registration' ? 'registration' : d.subject === 'application' && allowApplication ? 'application' : 'credential';
  const row = subject === 'application'
    ? await env.DB.prepare("SELECT * FROM supervisor_applications WHERE id = ? AND learner_id = ? AND status IN ('draft', 'more_info')").bind(Number(d.id), l.id).first()
    : await env.DB.prepare(`SELECT * FROM ${subject === 'registration' ? 'professional_registrations' : 'credentials'} WHERE id = ? AND learner_id = ? AND active = 1`).bind(Number(d.id), l.id).first();
  if (!row) return json({ ok: false, error: subject === 'application' ? 'Evidence can be added while your application is a draft or when we have asked for more information.' : 'That claim was not found.' }, 404);
  const uploadId = /^[A-Za-z0-9_-]{8,40}$/.test(String(d.uploadId || '')) ? String(d.uploadId) : null;
  const life = await lifecycleReady(env);
  if (uploadId && life) {
    const dup = await env.DB.prepare('SELECT id FROM credential_evidence WHERE learner_id = ? AND upload_id = ?').bind(l.id, uploadId).first();
    if (dup) return json({ ok: true, id: dup.id, duplicate: true });
  }
  if ((await recentCount(env, l.id, 'evidence_added')) >= LIMITS.evidence) return json({ ok: false, error: 'You have added a lot of evidence today. Try again tomorrow.' }, 429);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM credential_evidence WHERE subject_type = ? AND subject_id = ?').bind(subject, row.id).first();
  if (n.n >= 5) return json({ ok: false, error: 'You can add up to five pieces of evidence to one claim.' }, 400);
  const kind = EVIDENCE_KINDS.includes(d.kind) ? d.kind : 'other';
  const description = clip(d.description, 500);
  let link = clip(d.url, 400);
  if (link && !/^https:\/\/[^\s<>"]+$/.test(link)) return json({ ok: false, error: 'Links must start with https://' }, 400);
  let file = null;
  if (raw) {
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > EVIDENCE_MAX) return json({ ok: false, error: 'Files can be up to 1 MB. Save a smaller PDF or photo.' }, 413);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > EVIDENCE_MAX) return json({ ok: false, error: 'Files can be up to 1 MB. Save a smaller PDF or photo.' }, 413);
    const type = sniff(new Uint8Array(buf.slice(0, 8)));
    if (!type) return json({ ok: false, error: 'Upload a PDF, JPEG or PNG file.' }, 415);
    file = { type, size: buf.byteLength, sha: await hex(buf), name: clip(d.name, 120).replace(/[^\w .()-]/g, '_') || 'evidence', data: new Uint8Array(buf) };
    // The same file twice on one claim is stored once.
    const same = await env.DB.prepare('SELECT id FROM credential_evidence WHERE subject_type = ? AND subject_id = ? AND file_sha256 = ?').bind(subject, row.id, file.sha).first();
    if (same) return json({ ok: true, id: same.id, duplicate: true });
  } else if (!description && !link) return json({ ok: false, error: 'Describe the evidence or add a link.' }, 400);
  const r = await env.DB.prepare(`INSERT INTO credential_evidence (learner_id, subject_type, subject_id, kind, description, url, file_name, file_type, file_size, file_sha256, file_data${life ? ', upload_id' : ''}) VALUES (?,?,?,?,?,?,?,?,?,?,?${life ? ',?' : ''})`)
    .bind(l.id, subject, row.id, kind, description || null, link || null, file ? file.name : null, file ? file.type : null, file ? file.size : null, file ? file.sha : null, file ? file.data : null, ...(life ? [uploadId] : [])).run();
  const evidenceId = r.meta && r.meta.last_row_id;
  if (subject === 'credential' && ['claimed', 'evidence_required', 'not_found', 'more_evidence', 'source_unavailable'].includes(row.status)) await env.DB.prepare("UPDATE credentials SET status = 'manual_review', updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
  if (subject === 'registration' && ['mismatch', 'not_found', 'source_unavailable', 'pending'].includes(row.status)) await env.DB.prepare("UPDATE professional_registrations SET status = 'manual_review', updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
  if (subject === 'application') await env.DB.prepare("UPDATE supervisor_applications SET updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
  await logEvent(env, { learnerId: l.id, subjectType: subject, subjectId: row.id, action: 'evidence_added', actor: 'learner', evidenceId, notes: kind });
  return json({ ok: true, id: evidenceId });
}

async function withdraw(env, l, d) {
  const subject = d && d.subject === 'registration' ? 'registration' : 'credential';
  const table = subject === 'registration' ? 'professional_registrations' : 'credentials';
  const r = await env.DB.prepare(`UPDATE ${table} SET active = 0, status = 'withdrawn', updated_at = datetime('now') WHERE id = ? AND learner_id = ? AND active = 1`).bind(Number(d && d.id), l.id).run();
  if (r.meta && r.meta.changes) {
    // Withdrawn evidence is not needed any more: delete the files now.
    await env.DB.prepare("UPDATE credential_evidence SET file_data = NULL, purged_at = datetime('now') WHERE subject_type = ? AND subject_id = ? AND file_data IS NOT NULL").bind(subject, Number(d.id)).run();
    await logEvent(env, { learnerId: l.id, subjectType: subject, subjectId: Number(d.id), action: 'withdrawn', outcome: 'withdrawn', actor: 'learner' });
  }
  return json({ ok: true });
}

// ---------- Directory ----------
export function directoryEligibility(st) {
  const reasons = [];
  if (!st.learner || st.learner.email_status !== 'verified') reasons.push('Confirm your email address.');
  if (!st.hasReg) reasons.push('Verify your professional registration.');
  if (!st.approvals.some((a) => a.current) && !st.credentials.some((c) => isCurrentCred(c) && SUPERVISING_ROLES.includes(c.role))) reasons.push('Hold a verified supervisor, mentor or trainer credential, or a Wavelength supervisor approval.');
  return { eligible: !reasons.length, reasons };
}
async function saveDirectory(env, l, d) {
  const st = await currentStatus(env, l.id);
  const el = directoryEligibility(st);
  const want = !!(d && d.listed);
  const contact = clip(d && d.contactEmail, 160).toLowerCase();
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return json({ ok: false, error: 'Enter a valid contact email, or leave it empty.' }, 400);
  const listed = want && el.eligible ? 1 : 0;
  const org = await orgField(env, d.organisationId);
  if (!org.ok) return json({ ok: false, error: org.error }, 400);
  const before = await env.DB.prepare('SELECT organisation FROM directory_profiles WHERE learner_id = ?').bind(l.id).first();
  const v = { display_name: clip(d.displayName, 120) || null, profession: clip(d.profession, 80) || null, specialty: clip(d.specialty, 80) || null, organisation: clip(d.organisation, 160) || null, region: clip(d.region, 80) || null, country: clip(d.country, 2).toUpperCase() || null, contact_email: contact || null, show_contact: d.showContact && contact ? 1 : 0 };
  await env.DB.prepare(`INSERT INTO directory_profiles (learner_id, listed, display_name, profession, specialty, organisation, region, country, contact_email, show_contact, listed_at) VALUES (?,?,?,?,?,?,?,?,?,?, CASE WHEN ? = 1 THEN datetime('now') END)
    ON CONFLICT (learner_id) DO UPDATE SET listed = excluded.listed, display_name = excluded.display_name, profession = excluded.profession, specialty = excluded.specialty, organisation = excluded.organisation, region = excluded.region, country = excluded.country, contact_email = excluded.contact_email, show_contact = excluded.show_contact, updated_at = datetime('now'), listed_at = CASE WHEN excluded.listed = 1 THEN COALESCE(directory_profiles.listed_at, datetime('now')) END`)
    .bind(l.id, listed, v.display_name, v.profession, v.specialty, v.organisation, v.region, v.country, v.contact_email, v.show_contact, listed).run();
  await saveOrgId(env, 'directory_profiles', l.id, org, v.organisation, before ? before.organisation : null);
  await logEvent(env, { learnerId: l.id, subjectType: 'directory', subjectId: l.id, action: listed ? 'listed' : 'unlisted', actor: 'learner' });
  return json({ ok: true, listed: !!listed, ...el });
}
// The public directory. Off until DIRECTORY_PUBLIC = "true". Only people who opted in AND are eligible today appear,
// with only the fields below. External registers are never imported: everyone listed chose to be here.
export async function directorySearch(env, url) {
  if (env.DIRECTORY_PUBLIC !== 'true' || !professionalOn(env)) return json({ ok: false, error: 'The supervisor directory is not open yet.' }, 404);
  if (!(await verificationReady(env))) return json({ ok: false, error: 'The supervisor directory is not open yet.' }, 404);
  const q = (k) => clip(url.searchParams.get(k), 80).toLowerCase();
  const f = { country: q('country'), region: q('region'), text: q('q'), pathway: q('pathway'), module: q('module'), credential: q('credential'), profession: q('profession') };
  const { results = [] } = await env.DB.prepare('SELECT * FROM directory_profiles WHERE listed = 1 ORDER BY updated_at DESC LIMIT 500').all();
  const out = [];
  for (const p of results) {
    if (f.country && String(p.country || '').toLowerCase() !== f.country) continue;
    if (f.region && !String(p.region || '').toLowerCase().includes(f.region)) continue;
    if (f.profession && !String(p.profession || '').toLowerCase().includes(f.profession)) continue;
    const st = await currentStatus(env, p.learner_id);
    if (!st.learner || !directoryEligibility(st).eligible) continue;
    const badges = badgesFrom(env, st).filter((b) => b.kind !== 'email');
    const name = p.display_name || [st.learner.title, st.learner.first_name, st.learner.last_name].filter(Boolean).join(' ');
    const org = p.organisation || st.learner.organisation || '';
    if (f.text && !`${name} ${org}`.toLowerCase().includes(f.text)) continue;
    const scopes = st.approvals.filter((a) => a.current).map((a) => `${a.pathway}:${a.module}`);
    if (f.pathway && !scopes.some((s) => s.startsWith(f.pathway + ':')) && !st.credentials.some((c) => isCurrentCred(c) && String(c.programme || '').toLowerCase() === f.pathway)) continue;
    if (f.module && !scopes.some((s) => s.endsWith(':' + f.module) || (f.pathway && s === `${f.pathway}:*`)) && !st.credentials.some((c) => isCurrentCred(c) && parseList(c.modules).includes(f.module))) continue;
    if (f.credential && !st.credentials.some((c) => isCurrentCred(c) && c.credential_type === f.credential)) continue;
    const dates = [...st.registrations.filter(isCurrentReg).map((r) => r.last_checked_at || r.verified_at), ...st.credentials.filter(isCurrentCred).map((c) => c.verified_at)].filter(Boolean).sort();
    out.push({ name, profession: p.profession || (st.registrations.find(isCurrentReg) || {}).profession || '', organisation: org, region: p.region || '', country: p.country || '', specialty: p.specialty || '', badges, lastVerified: dates[dates.length - 1] || null, contact: p.show_contact ? p.contact_email : null });
    if (out.length >= 50) break;
  }
  return json({ ok: true, supervisors: out });
}

// ---------- Snapshot of supervisor status at the moment of signing ----------
// Written once, with the signature, and never changed. Later changes to the supervisor's status change what they can
// do from then on, never what an old sign-off says was verified when it was signed.
export function scopesForTypes(types) {
  const s = new Set();
  for (const pw of LOGBOOK.pathways) for (const m of pw.modules || []) if ((m.types || []).some((t) => types.includes(t))) s.add(`${pw.id}:${m.id}`);
  return [...s];
}
// Schema v2 (migration 0012) adds: learnerName (the learner's name when signed, so verify pages need not read the live
// account), signer ('approved' | 'account_not_approved' | 'self_declared': the label every page shows), and standing.
export async function supervisorSnapshot(env, { accountId, declared, method, scopes = [], learnerName = null }) {
  const life = await lifecycleReady(env);
  const snap = { v: life ? 2 : 1, capturedAt: nowIso(), method, identity: accountId ? 'wavelength_account' : 'self_declared', declared: { name: declared.name || '', role: declared.role || '', registration: declared.reg || '', accreditation: declared.accreditation || '' }, relevantScopes: scopes };
  if (life) { snap.signer = 'self_declared'; if (learnerName) snap.learnerName = learnerName; }
  if (!accountId) return snap;
  const st = await currentStatus(env, accountId);
  if (!st.learner) return snap;
  const reg = st.registrations.find(isCurrentReg);
  const live = (s) => showSource(env, s);
  snap.accountId = accountId;
  snap.email = { status: st.learner.email_status || 'legacy_unverified', verifiedAt: st.learner.email_verified_at || null };
  snap.professionalName = reg && reg.register_name ? reg.register_name : fullName(st.learner);
  snap.registrations = st.registrations.filter((r) => r.status !== 'withdrawn').map((r) => ({ regulator: r.regulator, regulatorName: (REG[r.regulator] || {}).name || r.regulator, number: r.registration_number, profession: r.profession, status: r.status, verified: isCurrentReg(r) && live(r.verification_source), source: r.verification_source, method: r.verification_method, verifiedAt: r.verified_at, lastCheckedAt: r.last_checked_at }));
  snap.credentials = st.credentials.filter((c) => isCurrentCred(c) && live(c.verification_source)).map((c) => ({ type: c.credential_type, label: (TYPE[c.credential_type] || {}).label || c.credential_type, issuer: (BODY[c.issuer] || {}).name || c.issuer, modules: parseList(c.modules), status: 'verified', source: c.verification_source, method: c.verification_method, verifiedAt: c.verified_at, expiresOn: c.expires_on }));
  snap.approvals = st.approvals.filter((a) => a.current).map((a) => ({ pathway: a.pathway, module: a.module, label: scopeLabel(a.pathway, a.module), approvedAt: a.approved_at, reviewOn: a.review_on }));
  const covers = (sc) => snap.approvals.some((a) => sc === `${a.pathway}:${a.module}` || sc.startsWith(`${a.pathway}:`) && a.module === '*');
  snap.approvedFor = scopes.filter(covers);
  snap.wavelengthVerifiedSupervisor = snap.approvedFor.length > 0;
  if (life) {
    snap.signer = snap.wavelengthVerifiedSupervisor ? 'approved' : 'account_not_approved';
    snap.standing = st.approvals.some((a) => a.current) ? (st.approvals.filter((a) => a.current).every((a) => a.grace) ? 'renewal_review' : 'active') : st.approvals.length ? 'paused' : 'not_approved';
  }
  return snap;
}
// The snapshot for a sign-off or assessment, or null before migration 0011. entries: the signed snapshot entries.
export async function snapshotFor(env, { entries = [], pathway, module, declared, method, accountId = null, learnerName = null }) {
  if (!(await verificationReady(env))) return null;
  const scopes = pathway ? [`${pathway}:${module}`] : scopesForTypes([...new Set(entries.map((e) => e.type))]);
  return supervisorSnapshot(env, { accountId, declared, method, scopes, learnerName });
}
// The three labels used on verify pages, the app and exports.
export const SIGNER_LABELS = {
  approved: 'Wavelength-approved supervisor',
  account_not_approved: 'Wavelength account, not approved as a supervisor at the time of signing',
  self_declared: 'Self-declared (not verified by Wavelength)',
};
const signerOf = (s) => s.signer || (s.identity !== 'wavelength_account' ? 'self_declared' : s.wavelengthVerifiedSupervisor ? 'approved' : 'account_not_approved');
// What the public verify pages show from a snapshot: no registration numbers, no email.
export function publicSnapshot(text) {
  let s; try { s = JSON.parse(text || 'null'); } catch { s = null; }
  if (!s) return null;
  if (s.identity !== 'wavelength_account') return { capturedAt: s.capturedAt, identity: 'self_declared', signer: 'self_declared', label: SIGNER_LABELS.self_declared, learnerName: s.learnerName || null, summary: 'Name, role and any registration were entered by the signer and were not verified by Wavelength.' };
  const signer = signerOf(s);
  return {
    capturedAt: s.capturedAt, identity: 'wavelength_account', signer, label: SIGNER_LABELS[signer], learnerName: s.learnerName || null,
    accountClosed: !!s.accountClosed, closedNote: s.accountClosed ? "The signer's Wavelength account has since been closed; details are as recorded at signing." : null,
    professionalName: s.professionalName,
    emailVerified: (s.email || {}).status === 'verified',
    registrations: (s.registrations || []).filter((r) => r.verified).map((r) => ({ regulator: r.regulatorName, profession: r.profession, verifiedAt: r.verifiedAt })),
    credentials: (s.credentials || []).map((c) => ({ label: c.label, issuer: c.issuer, modules: moduleLabels(TYPE[c.type] || { modules: [] }, c.modules || []), verifiedAt: c.verifiedAt, expiresOn: c.expiresOn })),
    approvedFor: (s.approvedFor || []).map((sc) => { const [p, m] = sc.split(':'); return scopeLabel(p, m); }),
    wavelengthVerifiedSupervisor: !!s.wavelengthVerifiedSupervisor,
  };
}
// Compact copy kept on the logbook entry's server-owned sign-off.
export function entrySnapshot(s) {
  if (!s) return null;
  return { identity: s.identity, reg: (s.registrations || []).filter((r) => r.verified).map((r) => (REG[r.regulator] || {}).short || r.regulator), approvedFor: s.approvedFor || [], at: s.capturedAt };
}

// ---------- Scheduled re-verification ----------
// Runs from the Worker cron. Only adapters with a live source recheck: manual ones never expire on their own, and
// expiry dates are applied on every read. A failed source is retried with back-off and never treated as a lapse.
export async function recheckDue(env, limit = 20) {
  if (!(await verificationReady(env))) return { checked: 0 };
  const now = Date.now();
  let checked = 0;
  const regs = await env.DB.prepare('SELECT * FROM professional_registrations WHERE active = 1 AND next_check_at IS NOT NULL AND next_check_at <= ? ORDER BY next_check_at LIMIT ?').bind(now, limit).all();
  // A registration the team checked by hand is due a fresh look: it stays verified and joins the admin queue.
  for (const r of regs.results || []) { if (adapterFor(env, REG[r.regulator]).mode === 'manual') { await env.DB.prepare("UPDATE professional_registrations SET next_check_at = NULL, failure_state = 'recheck_due' WHERE id = ?").bind(r.id).run(); continue; } await checkRegistration(env, r, 'recheck'); checked++; }
  const creds = await env.DB.prepare("SELECT * FROM credentials WHERE active = 1 AND status IN ('verified', 'source_unavailable') AND next_check_at IS NOT NULL AND next_check_at <= ? ORDER BY next_check_at LIMIT ?").bind(now, limit).all();
  for (const c of creds.results || []) { if (adapterFor(env, TYPE[c.credential_type]).mode === 'manual') { await env.DB.prepare("UPDATE credentials SET next_check_at = NULL, failure_state = 'recheck_due' WHERE id = ?").bind(c.id).run(); continue; } await checkCredential(env, c, 'recheck'); checked++; }
  // Evidence files are needed only until a decision. Keep the hash and description, drop the bytes.
  await env.DB.prepare(`UPDATE credential_evidence SET file_data = NULL, purged_at = datetime('now') WHERE file_data IS NOT NULL AND (
      (subject_type = 'credential' AND subject_id IN (SELECT id FROM credentials WHERE status IN ('verified', 'rejected', 'revoked', 'withdrawn', 'expired') AND updated_at < datetime('now', '-${PURGE_EVIDENCE_DAYS} days')))
   OR (subject_type = 'registration' AND subject_id IN (SELECT id FROM professional_registrations WHERE status IN ('verified', 'rejected', 'withdrawn') AND updated_at < datetime('now', '-${PURGE_EVIDENCE_DAYS} days'))))`).run();
  return { checked };
}

// ---------- Account deletion ----------
// After migration 0012 (life): approval and application decision events are kept pseudonymised (no learner id, no
// notes) for six years, because they back historical "approved supervisor" labels (decision 12); the daily job
// deletes them after that. Applications, the lapse watch and queued emails go with the account.
export function deleteProfessional(env, l, life = false) {
  const pre = life ? [
    env.DB.prepare("UPDATE verification_events SET learner_id = NULL, notes = NULL, evidence_id = NULL WHERE learner_id = ? AND subject_type IN ('approval', 'application')").bind(l.id),
    ...['supervisor_applications', 'supervisor_watch', 'notification_log'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE learner_id = ?`).bind(l.id)),
  ] : [];
  return [...pre, ...['email_tokens', 'professional_registrations', 'credentials', 'credential_evidence', 'supervisor_approvals', 'verification_events', 'directory_profiles']
    .map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE learner_id = ?`).bind(l.id))];
}

// ---------- Learner API ----------
export const professionalOn = (env) => env.PROFESSIONAL_VERIFY === 'true';
export function config() {
  return {
    regulators: CFG.regulators.map((r) => ({ id: r.id, short: r.short, name: r.name, country: r.country, professions: r.professions, numberLabel: r.numberLabel, numberHint: r.numberHint, registerUrl: r.registerUrl, automatic: r.adapter !== 'manual' })),
    credentialTypes: CFG.credentialTypes.map((t) => ({ id: t.id, label: t.label, issuer: (BODY[t.body] || {}).name, programme: t.programme, role: t.role, modules: t.modules.map((m) => ({ id: m.id, label: m.label })), expires: !!t.expires, automatic: t.adapter !== 'manual' })),
  };
}
async function overview(env, l) {
  const st = await currentStatus(env, l.id);
  const ev = await env.DB.prepare('SELECT id, subject_type, subject_id, kind, description, url, file_name, created_at, purged_at FROM credential_evidence WHERE learner_id = ? ORDER BY id').bind(l.id).all();
  const evFor = (type, id) => (ev.results || []).filter((e) => e.subject_type === type && e.subject_id === id);
  const dir = await env.DB.prepare('SELECT * FROM directory_profiles WHERE learner_id = ?').bind(l.id).first();
  return json({
    ok: true, available: true, emailStatus: l.email_status || 'legacy_unverified', ...config(),
    registrations: st.registrations.map(publicRegistration),
    credentials: st.credentials.map((c) => publicCredential(c, evFor('credential', c.id))),
    approvals: st.approvals.map((a) => ({ pathway: a.pathway, module: a.module, label: scopeLabel(a.pathway, a.module), current: a.current, approvedAt: a.approved_at, reviewOn: a.review_on })),
    badges: badgesFrom(env, st),
    directory: { ...(dir ? { listed: !!dir.listed, displayName: dir.display_name, profession: dir.profession, specialty: dir.specialty, organisation: dir.organisation, region: dir.region, country: dir.country, contactEmail: dir.contact_email, showContact: !!dir.show_contact } : { listed: false }), ...directoryEligibility(st), open: env.DIRECTORY_PUBLIC === 'true' },
  });
}

// Routes under /api/app/professional... (logged-in learners). Returns null when the path is not one of these.
export async function handleProfessional(env, l, req, url, p) {
  const known = ['professional', 'professional/registration', 'professional/credential', 'professional/evidence', 'professional/withdraw', 'professional/directory'];
  if (!known.includes(p)) return null;
  // Off until PROFESSIONAL_VERIFY = "true": switch it on only once the privacy notice and the DPIA cover registration
  // numbers, evidence files and the directory (docs/verification-architecture.md, "Before switching on").
  if (!professionalOn(env) || !(await verificationReady(env))) return json({ ok: false, available: false, error: 'Professional verification is not available yet.' }, 503);
  if (req.method === 'GET') return p === 'professional' ? overview(env, l) : json({ ok: false }, 404);
  // Professional verification always starts from a verified email (even with email sending switched off), so a
  // stranger cannot attach a registration or credential to an address they do not control.
  if (l.email_status !== 'verified') return json({ ok: false, needVerify: true, error: 'Confirm your email address first. We have sent you a link, or send a new one from this screen.' }, 403);
  if (p === 'professional/registration') return submitRegistration(env, l, (await body(req)) || {});
  if (p === 'professional/credential') return submitCredential(env, l, (await body(req)) || {});
  if (p === 'professional/evidence') return addEvidence(env, l, req, url);
  if (p === 'professional/withdraw') return withdraw(env, l, await body(req));
  if (p === 'professional/directory') return saveDirectory(env, l, (await body(req)) || {});
  return json({ ok: false }, 404);
}
export { isCurrentReg, isCurrentCred, parseList };
