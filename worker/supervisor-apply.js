// The supervisor application, renewal, reapplication and "Stop being a Wavelength supervisor" (plan section 8).
// Routes under /api/app/ (logged-in accounts):
//   GET  supervisor                                   standing, approvals, the open application, configuration
//   POST supervisor/application                       save the draft (any step's fields; creates the draft if none)
//   POST supervisor/evidence (bytes or JSON)          add a document or a link to the open application
//   POST supervisor/evidence/remove                   remove one from a draft
//   POST supervisor/submit                            declaration and submit
//   POST supervisor/application/cancel                withdraw an open application
//   POST supervisor/renew, supervisor/apply-again      start a pre-filled renewal or a new application
//   POST supervisor/stop                               voluntary withdrawal, at once, no administrator step
// The application journey is behind SUPERVISOR_APPLY. It reuses the professional registration and credential
// functions of worker/professional.js directly, so the general Professional verification screen (PROFESSIONAL_VERIFY)
// stays off for everyone else. Viewing one's own status and stopping work whenever migration 0012 is applied.
import LOGBOOK from '../data/logbook.json';
import { json, clip, body, fullName, TITLES, lifecycleReady } from './app-util.js';
import { currentStatus, submitRegistration, submitCredential, amendCredentialModules, addEvidence, publicRegistration, publicCredential, config, logEvent, parseList, scopeLabel, TYPE } from './professional.js';
import { standingOf, applyOn, areaLabels, AREAS, withdrawSupervisor, WITHDRAW_REASONS, activeBlock, verificationOf } from './supervisor-lifecycle.js';
import { queueStmt, deliverLater } from './notify.js';
import { auditStmt, audit } from './audit.js';
import { nowIso, ukDate, addDays } from './time.js';
import { orgField, orgsReady } from './organisations.js';
import { normOrg } from './org-norm.js';

export const DECLARATION_VERSION = 'supervisor-declaration-1';
export const DECLARATION = 'I confirm that the information I have given is accurate and current, and that I am appropriately qualified and experienced to supervise the ultrasound areas I have selected. I will tell Wavelength if anything changes.';
export const REVIEW_TIME = 'Supervisor applications are usually reviewed quickly. Please allow up to 3 business days during busy periods. If you have not heard from us after 3 business days, please contact us at hello@thewavelength.co.uk.';
export const RENEW_FROM_DAYS = 60;
const BANDS = {
  years: ['Less than 2 years', '2 to 5 years', '5 to 10 years', 'More than 10 years'],
  scans: ['Fewer than 100', '100 to 500', '500 to 1,000', 'More than 1,000'],
};
const PATHWAY_CHOICES = [
  { id: 'rcem', label: 'RCEM' }, { id: 'famus', label: 'FAMUS' }, { id: 'fusic', label: 'FUSIC' },
  { id: 'international', label: 'International pathways and frameworks (EUSEM, ACEM, CPoCUS, ACEP)' }, { id: 'general', label: 'General or local logbooks' },
];
const OPEN = ['draft', 'submitted', 'more_info'];
const JUSTIFY_MIN = 80, JUSTIFY_MAX = 6000;

const list = (v) => { try { const x = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(x) ? x : []; } catch { return []; } };
const obj = (v) => { try { const x = typeof v === 'string' ? JSON.parse(v) : v; return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } };
async function openApplication(env, l) {
  return env.DB.prepare(`SELECT * FROM supervisor_applications WHERE learner_id = ? AND status IN ('draft', 'submitted', 'more_info') ORDER BY id DESC LIMIT 1`).bind(l.id).first();
}
async function evidenceOf(env, appId) {
  return ((await env.DB.prepare("SELECT id, kind, description, url, file_name, file_size, purged_at, created_at FROM credential_evidence WHERE subject_type = 'application' AND subject_id = ? ORDER BY id").bind(appId).all()).results || [])
    .map((e) => ({ id: e.id, kind: e.kind, description: e.description, url: e.url, fileName: e.file_name, size: e.file_size, purged: !!e.purged_at, at: e.created_at }));
}
export function publicApplication(a, evidence = []) {
  if (!a) return null;
  return {
    id: a.id, kind: a.kind, status: a.status, fullName: a.full_name, role: a.role, organisation: a.organisation,
    registrationId: a.registration_id, noRegistration: !!a.no_registration, noRegistrationReason: a.no_registration_reason, otherRegulator: a.other_regulator,
    credentialIds: list(a.credential_ids), experience: obj(a.experience), justification: a.justification || '', evidenceMode: a.evidence_mode,
    areas: list(a.requested_areas), pathways: list(a.requested_pathways), changesNote: a.changes_note || '', nothingChanged: !!a.nothing_changed,
    submittedAt: a.submitted_at, moreInfo: a.status === 'more_info' ? a.more_info_note : null, decidedAt: a.decided_at,
    message: a.status === 'rejected' ? a.applicant_message : null, mayReapply: a.may_reapply == null ? null : !!a.may_reapply, evidence,
  };
}

// ---------- Overview ----------
async function overview(env, l) {
  const st = await currentStatus(env, l.id);
  const s = await standingOf(env, l.id, st);
  const open = await openApplication(env, l);
  const last = await env.DB.prepare("SELECT * FROM supervisor_applications WHERE learner_id = ? AND status IN ('approved', 'rejected', 'withdrawn') ORDER BY id DESC LIMIT 1").bind(l.id).first();
  const current = st.approvals.filter((a) => a.current);
  const reviewOn = current.map((a) => a.review_on).filter(Boolean).sort()[0] || null;
  const waiting = (await env.DB.prepare("SELECT t.title, t.first_name, t.last_name FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.status = 'pending' AND s.claimed_at IS NOT NULL").bind(l.id).all()).results || [];
  const ev = await env.DB.prepare('SELECT id, subject_type, subject_id, kind, description, file_name, purged_at FROM credential_evidence WHERE learner_id = ? AND subject_type != ? ORDER BY id').bind(l.id, 'application').all();
  const canRenew = !!current.length && !!reviewOn && ukDate() >= addDays(reviewOn, -RENEW_FROM_DAYS) && !(open && open.kind === 'renewal');
  return json({
    ok: true, available: applyOn(env), emailVerified: l.email_status === 'verified',
    // The one authoritative reading (worker/verification/status.js). Apps from October 2026 draw from this alone;
    // the fields below stay for installed apps that read them.
    verification: await verificationOf(env, l.id, 'self', s),
    standing: s.standing, lapse: s.lapse, blocked: !!s.block && !s.block.one_off_permitted,
    approvals: st.approvals.map((a) => ({ pathway: a.pathway, module: a.module, label: scopeLabel(a.pathway, a.module), current: a.current, grace: !!a.grace, graceUntil: a.graceUntil || null, reviewOn: a.review_on, approvedAt: a.approved_at, lastRenewedAt: a.last_renewed_at || null })),
    areas: areaLabels(current), reviewOn, canRenew,
    canApplyAgain: !current.length && !open && !(s.block && !s.block.one_off_permitted) && !(last && last.status === 'rejected' && last.may_reapply === 0),
    application: open ? publicApplication(open, await evidenceOf(env, open.id)) : null,
    previous: last ? { status: last.status, kind: last.kind, decidedAt: last.decided_at, message: last.status === 'rejected' ? last.applicant_message : null, mayReapply: last.may_reapply == null ? null : !!last.may_reapply } : null,
    waiting: waiting.map(fullName),
    registrations: st.registrations.map(publicRegistration),
    credentials: st.credentials.map((c) => publicCredential(c, (ev.results || []).filter((e) => e.subject_type === 'credential' && e.subject_id === c.id))),
    searchable: !!(await env.DB.prepare('SELECT supervisor_searchable FROM learners WHERE id = ?').bind(l.id).first('supervisor_searchable')),
    // Supervisor search (worker/search.js): whether it is switched on, and since when this person has been findable.
    searchAvailable: env.SUPERVISOR_SEARCH === 'true' && (await orgsReady(env)),
    searchableAt: (await env.DB.prepare('SELECT searchable_at FROM learners WHERE id = ?').bind(l.id).first('searchable_at')) || null,
    config: { ...config(), areas: AREAS.map((a) => ({ id: a.id, label: a.label })), pathways: PATHWAY_CHOICES, bands: BANDS, declaration: DECLARATION, declarationVersion: DECLARATION_VERSION, reviewTime: REVIEW_TIME, withdrawReasons: WITHDRAW_REASONS },
  });
}

// ---------- Draft ----------
async function newDraft(env, l, kind, from = null) {
  const link = await env.DB.prepare("SELECT id FROM supervisor_links WHERE supervisor_id = ? AND status = 'pending' AND claimed_at IS NOT NULL ORDER BY claimed_at LIMIT 1").bind(l.id).first();
  const reg = await env.DB.prepare("SELECT id FROM professional_registrations WHERE learner_id = ? AND active = 1 ORDER BY (status = 'verified') DESC, id DESC LIMIT 1").bind(l.id).first();
  const f = from || {};
  try {
    await env.DB.prepare(`INSERT INTO supervisor_applications (learner_id, kind, status, link_id, previous_application_id, full_name, role, organisation, organisation_id, registration_id, no_registration, no_registration_reason, other_regulator, credential_ids, experience, justification, evidence_mode, requested_areas, requested_pathways)
      VALUES (?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(l.id, kind, link ? link.id : null, f.id || null, fullName(l), f.role || l.role || null, f.organisation || l.organisation || null, f.organisation_id || null,
      f.registration_id || (reg ? reg.id : null), f.no_registration || 0, f.no_registration_reason || null, f.other_regulator || null, f.credential_ids || '[]', f.experience || '{}', f.justification || null, f.evidence_mode || null, f.requested_areas || '[]', f.requested_pathways || '[]').run();
  } catch { /* a second tab created it first: one open application per person */ }
  const a = await openApplication(env, l);
  if (a) await audit(env, { actorType: 'learner', actorId: l.id, action: 'application.start', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind, previous: f.id || null } });
  return a;
}
// What kind of application a person without an open one would start now.
async function defaultKind(env, l) {
  const prior = await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_applications WHERE learner_id = ? AND status IN ('approved', 'rejected', 'withdrawn')").bind(l.id).first();
  const appr = await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?').bind(l.id).first();
  return (prior && prior.n) || (appr && appr.n) ? 'reapplication' : 'initial';
}
async function lastDecided(env, l) {
  return env.DB.prepare("SELECT * FROM supervisor_applications WHERE learner_id = ? AND status IN ('approved', 'rejected', 'withdrawn') ORDER BY (status = 'approved') DESC, id DESC LIMIT 1").bind(l.id).first();
}

async function saveDraft(env, l, d) {
  let a = await openApplication(env, l);
  if (!a) a = await newDraft(env, l, await defaultKind(env, l));
  if (!a) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 409);
  if (a.status === 'submitted') return json({ ok: false, error: 'Your application has been sent and is being reviewed. You can withdraw it and start again if something has changed.' }, 409);
  const set = {}, notes = [];
  // Step 1, about you. Changing the name here changes it on the account too.
  if (d.firstName !== undefined || d.lastName !== undefined || d.title !== undefined) {
    const first = clip(d.firstName ?? l.first_name, 80), last = clip(d.lastName ?? l.last_name, 80);
    if (!first || !last) return json({ ok: false, error: 'Enter your first and last name.' }, 400);
    const title = d.title !== undefined ? (TITLES.includes(clip(d.title, 10)) ? clip(d.title, 10) : '') : l.title;
    await env.DB.prepare('UPDATE learners SET title = ?, first_name = ?, last_name = ? WHERE id = ?').bind(title, first, last, l.id).run();
    Object.assign(l, { title, first_name: first, last_name: last });
    set.full_name = fullName(l);
  }
  if (d.role !== undefined) set.role = clip(d.role, 120) || null;
  if (d.organisation !== undefined) set.organisation = clip(d.organisation, 160) || null;
  // organisationId beside the typed text (plan section 19): must be on the list and active; typing a different name
  // without picking a suggestion clears the old id. Before migration 0013 the id is not checked or kept.
  if (d.organisationId !== undefined) {
    const org = await orgField(env, d.organisationId);
    if (!org.ok) return json({ ok: false, error: org.error }, 400);
    if (org.given || org.id === null) set.organisation_id = org.id;
  } else if (d.organisation !== undefined && normOrg(d.organisation) !== normOrg(a.organisation)) set.organisation_id = null;
  // Step 2, professional registration: the existing registration functions, through this journey only.
  if (d.registration && typeof d.registration === 'object') {
    const res = await submitRegistration(env, l, d.registration);
    const j = await res.json();
    if (!j.ok) return json(j, res.status);
    Object.assign(set, { registration_id: j.registration.id, no_registration: 0, no_registration_reason: null, other_regulator: null });
  }
  if (d.noRegistration && typeof d.noRegistration === 'object') {
    const reason = clip(d.noRegistration.reason, 1000);
    if (reason.length < 10) return json({ ok: false, error: 'Tell us briefly why you are not on a statutory register.' }, 400);
    Object.assign(set, { no_registration: 1, no_registration_reason: reason, other_regulator: clip(d.noRegistration.otherRegulator, 200) || null, registration_id: null });
  }
  if (d.useRegistration !== undefined) {
    const r = await env.DB.prepare('SELECT id FROM professional_registrations WHERE id = ? AND learner_id = ? AND active = 1').bind(Number(d.useRegistration), l.id).first();
    if (!r) return json({ ok: false, error: 'That registration was not found.' }, 404);
    Object.assign(set, { registration_id: r.id, no_registration: 0, no_registration_reason: null, other_regulator: null });
  }
  // Step 3, ultrasound experience: credentials from Wavelength's framework (issued by the named bodies, never by
  // Wavelength) and short structured answers.
  // Credentials claimed or amended in this save are always linked to the application; credentialIds (the held
  // credentials the applicant ticked) never drops them.
  const touched = [];
  if (Array.isArray(d.credentials)) {
    for (const c of d.credentials.slice(0, 10)) {
      const res = await submitCredential(env, l, c || {});
      const j = await res.json();
      if (!j.ok) return json(j, res.status);
      touched.push(j.credential.id);
    }
  }
  // Modules added to or removed from a credential already held (same record, checked again).
  if (Array.isArray(d.credentialModules)) {
    for (const c of d.credentialModules.slice(0, 20)) {
      const res = await amendCredentialModules(env, l, c || {});
      const j = await res.json();
      if (!j.ok) return json(j, res.status);
      touched.push(j.credential.id);
    }
  }
  let ticked = null;
  if (Array.isArray(d.credentialIds)) {
    const mine = ((await env.DB.prepare('SELECT id FROM credentials WHERE learner_id = ? AND active = 1').bind(l.id).all()).results || []).map((r) => r.id);
    ticked = d.credentialIds.map(Number).filter((x) => mine.includes(x));
  }
  if (ticked || touched.length) set.credential_ids = JSON.stringify([...new Set([...touched, ...(ticked || list(a.credential_ids).map(Number))])].slice(0, 20));
  if (d.experience && typeof d.experience === 'object') {
    const e = d.experience;
    set.experience = JSON.stringify({
      years: BANDS.years.includes(e.years) ? e.years : null, scans: BANDS.scans.includes(e.scans) ? e.scans : null,
      teaching: typeof e.teaching === 'boolean' ? e.teaching : null, supervision: typeof e.supervision === 'boolean' ? e.supervision : null,
      deptRole: clip(e.deptRole, 300) || null,
    });
  }
  // Step 4, evidence or explanation. Documents are encouraged, never required.
  if (d.justification !== undefined) set.justification = clip(d.justification, JUSTIFY_MAX) || null;
  if (d.evidenceMode !== undefined) set.evidence_mode = ['documents', 'explanation', 'both'].includes(d.evidenceMode) ? d.evidenceMode : null;
  // Step 5, areas and pathways.
  if (Array.isArray(d.areas)) set.requested_areas = JSON.stringify([...new Set(d.areas.map(String))].filter((x) => AREAS.some((ar) => ar.id === x)));
  if (Array.isArray(d.pathways)) set.requested_pathways = JSON.stringify([...new Set(d.pathways.map(String))].filter((x) => PATHWAY_CHOICES.some((p) => p.id === x)));
  // Renewals: what changed.
  if (d.changesNote !== undefined) set.changes_note = clip(d.changesNote, 3000) || null;
  if (d.nothingChanged !== undefined) set.nothing_changed = d.nothingChanged ? 1 : 0;
  const keys = Object.keys(set);
  if (keys.length) await env.DB.prepare(`UPDATE supervisor_applications SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND status IN ('draft', 'more_info')`).bind(...keys.map((k) => set[k]), a.id).run();
  a = await env.DB.prepare('SELECT * FROM supervisor_applications WHERE id = ?').bind(a.id).first();
  return json({ ok: true, application: publicApplication(a, await evidenceOf(env, a.id)), notes });
}

// ---------- Submit ----------
async function problems(env, l, a) {
  const out = [];
  if (!a.full_name && !fullName(l)) out.push({ step: 'about', error: 'Enter your name.' });
  if (!a.role) out.push({ step: 'about', error: 'Enter your role or grade.' });
  if (!a.organisation) out.push({ step: 'about', error: 'Enter your organisation.' });
  if (!a.no_registration) {
    const r = a.registration_id && await env.DB.prepare('SELECT id FROM professional_registrations WHERE id = ? AND learner_id = ? AND active = 1').bind(a.registration_id, l.id).first();
    if (!r) out.push({ step: 'registration', error: 'Add your professional registration, or tell us you are not on a statutory register.' });
  } else if (!a.no_registration_reason) out.push({ step: 'registration', error: 'Tell us why you are not on a statutory register.' });
  const ex = obj(a.experience);
  if (!ex.years || !ex.scans) out.push({ step: 'experience', error: 'Answer how long you have practised ultrasound and roughly how many scans you have done.' });
  const files = await env.DB.prepare("SELECT COUNT(*) AS n FROM credential_evidence WHERE subject_type = 'application' AND subject_id = ?").bind(a.id).first();
  const credEv = list(a.credential_ids).length ? await env.DB.prepare(`SELECT COUNT(*) AS n FROM credential_evidence WHERE subject_type = 'credential' AND learner_id = ? AND subject_id IN (${list(a.credential_ids).map(() => '?').join(',')})`).bind(l.id, ...list(a.credential_ids)).first() : { n: 0 };
  const renewalUnchanged = a.kind === 'renewal' && a.nothing_changed;
  if (!files.n && !credEv.n && String(a.justification || '').length < JUSTIFY_MIN && !renewalUnchanged) out.push({ step: 'evidence', error: `Upload a supporting document, or explain your experience and basis for supervising (at least ${JUSTIFY_MIN} characters).` });
  if (!list(a.requested_areas).length) out.push({ step: 'areas', error: 'Choose at least one area you supervise.' });
  if (a.kind === 'renewal' && !a.nothing_changed && !a.changes_note) out.push({ step: 'changes', error: 'Tell us what has changed, or confirm that nothing material has changed.' });
  return out;
}
// The applicant receipt for the send that made an application 'submitted'. The first send is keyed by the
// application; a resubmission after "Ask for more information" (more_info_at before submitted_at) is keyed by that
// request's time, so each return-and-resubmit gets its own receipt, while a double tap or retry of the same send meets
// the same key and is ignored by the outbox. The admin "Send submission receipt" action rebuilds the same key.
export function receiptKey(a) {
  const resubmit = !!a.more_info_at && (!a.submitted_at || a.more_info_at < a.submitted_at);
  const kind = `${a.kind === 'renewal' ? 'renew' : 'app'}_${resubmit ? 'resubmitted' : 'received'}`;
  return { kind, resubmit, key: resubmit ? `${kind}:${a.id}:${a.more_info_at}` : `${kind}:${a.id}` };
}
export async function receiptFor(env, l, a) {
  const r = receiptKey(a);
  const inviter = a.link_id ? await env.DB.prepare('SELECT t.title, t.first_name, t.last_name FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.id = ?').bind(a.link_id).first() : null;
  const reviewOn = a.kind === 'renewal' ? (await currentStatus(env, l.id)).approvals.map((x) => x.review_on).filter(Boolean).sort()[0] : null;
  return { ...r, stmt: queueStmt(env, { key: r.key, learnerId: l.id, kind: r.kind, to: l.email, toName: fullName(l), data: { firstName: l.first_name, learner: inviter ? fullName(inviter) : null, reviewOn } }) };
}
async function submit(env, l, d, ctx) {
  const a = await openApplication(env, l);
  if (!a || !['draft', 'more_info'].includes(a.status)) return json({ ok: false, error: 'There is no application to send.' }, 404);
  const block = await activeBlock(env, l.id);
  if (block && !block.one_off_permitted) return json({ ok: false, error: "This can't be completed through Wavelength. Contact hello@thewavelength.co.uk." }, 403);
  const p = await problems(env, l, a);
  if (p.length) return json({ ok: false, error: p[0].error, step: p[0].step, problems: p }, 400);
  if (!d.declaration) return json({ ok: false, step: 'declaration', error: 'Tick the declaration to send your application.' }, 400);
  // Renewal grace (Fero, 6 October 2026): only a renewal sent on or before the review date, by someone fully approved
  // and current at that moment, can hold their status for up to 30 days while it is reviewed.
  let currentAtSubmit = 0;
  if (a.kind === 'renewal') {
    const st = await currentStatus(env, l.id);
    const cur = st.approvals.filter((x) => x.current && !x.grace);
    currentAtSubmit = cur.length && cur.every((x) => !x.review_on || ukDate() <= x.review_on) ? 1 : 0;
  }
  const at = nowIso();
  const files = (await env.DB.prepare("SELECT COUNT(*) AS n FROM credential_evidence WHERE subject_type = 'application' AND subject_id = ?").bind(a.id).first()).n;
  const basis = files ? `uploaded evidence (${files} ${files === 1 ? 'file' : 'files'})` : a.kind === 'renewal' && a.nothing_changed ? 'renewal, nothing material changed' : 'self-declared experience, no documents';
  const res = await env.DB.prepare("UPDATE supervisor_applications SET status = 'submitted', submitted_at = ?, declared_at = ?, declaration_version = ?, current_at_submit = ?, full_name = COALESCE(full_name, ?), updated_at = datetime('now') WHERE id = ? AND status IN ('draft', 'more_info')")
    .bind(at, at, DECLARATION_VERSION, currentAtSubmit, fullName(l), a.id).run();
  if (!(res.meta && res.meta.changes)) return json({ ok: false, error: 'Your application has already been sent.' }, 409);
  const renewal = a.kind === 'renewal';
  const receipt = await receiptFor(env, l, { ...a, submitted_at: at });
  const resubmit = receipt.resubmit;
  const keys = [receipt.key, `app_admin:${a.id}:${at}`];
  await env.DB.batch([
    receipt.stmt,
    queueStmt(env, { key: keys[1], kind: 'app_admin', to: env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk', toName: 'Wavelength', data: { application: a.id, renewal, basis, resubmitted: resubmit } }),
    auditStmt(env, { actorType: 'learner', actorId: l.id, action: a.status === 'more_info' ? 'application.resubmit' : 'application.submit', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind, evidence: files, basis: files ? 'documents' : 'explanation' } }),
  ]);
  await logEvent(env, { learnerId: l.id, subjectType: 'application', subjectId: a.id, action: 'application_submitted', outcome: 'submitted', actor: 'learner', notes: `${a.kind}; basis: ${basis}` });
  deliverLater(env, ctx, keys);
  return json({ ok: true, status: 'submitted', message: 'Your supervisor application is being reviewed.', reviewTime: REVIEW_TIME });
}

async function cancel(env, l) {
  const a = await openApplication(env, l);
  if (!a) return json({ ok: true });
  await env.DB.batch([
    env.DB.prepare("UPDATE supervisor_applications SET status = 'withdrawn', decided_at = ?, decided_by = 'self', updated_at = datetime('now') WHERE id = ? AND status IN ('draft', 'submitted', 'more_info')").bind(nowIso(), a.id),
    auditStmt(env, { actorType: 'learner', actorId: l.id, action: 'application.withdraw', subjectType: 'application', subjectId: a.id, meta: { kind: a.kind, status: a.status } }),
  ]);
  // Documents are not needed any more.
  await env.DB.prepare("UPDATE credential_evidence SET file_data = NULL, purged_at = datetime('now') WHERE subject_type = 'application' AND subject_id = ? AND file_data IS NOT NULL").bind(a.id).run();
  return json({ ok: true });
}

// Renewal (from 60 days before the review date) and reapplication: pre-filled from the last approved application, so
// unchanged registration, credentials and evidence carry over. A fresh declaration is always needed.
async function start(env, l, kind) {
  if (await openApplication(env, l)) return json({ ok: false, error: 'You already have an application in progress.' }, 409);
  const st = await currentStatus(env, l.id);
  const current = st.approvals.filter((a) => a.current);
  if (kind === 'renewal') {
    const reviewOn = current.map((a) => a.review_on).filter(Boolean).sort()[0];
    if (!current.length || !reviewOn) return json({ ok: false, error: 'There is no current approval to renew. Apply again instead.' }, 400);
    if (ukDate() < addDays(reviewOn, -RENEW_FROM_DAYS)) return json({ ok: false, error: `You can renew from ${RENEW_FROM_DAYS} days before your review date.` }, 400);
  } else {
    if (current.length) return json({ ok: false, error: 'You are already an approved supervisor. Renew from 60 days before your review date.' }, 400);
    const block = await activeBlock(env, l.id);
    if (block && !block.one_off_permitted) return json({ ok: false, error: "This can't be completed through Wavelength. Contact hello@thewavelength.co.uk." }, 403);
    const last = await env.DB.prepare("SELECT may_reapply FROM supervisor_applications WHERE learner_id = ? AND status = 'rejected' ORDER BY id DESC LIMIT 1").bind(l.id).first();
    const lastAny = await env.DB.prepare("SELECT status FROM supervisor_applications WHERE learner_id = ? AND status IN ('approved', 'rejected', 'withdrawn') ORDER BY id DESC LIMIT 1").bind(l.id).first();
    if (last && last.may_reapply === 0 && lastAny && lastAny.status === 'rejected') return json({ ok: false, error: 'Please contact hello@thewavelength.co.uk before applying again.' }, 403);
  }
  const from = await lastDecided(env, l);
  const a = await newDraft(env, l, kind === 'renewal' ? 'renewal' : 'reapplication', from ? { ...from, justification: from.justification, credential_ids: from.credential_ids } : null);
  if (!a) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 409);
  return json({ ok: true, application: publicApplication(a, await evidenceOf(env, a.id)) });
}

async function removeEvidence(env, l, d) {
  const a = await openApplication(env, l);
  if (!a || !['draft', 'more_info'].includes(a.status)) return json({ ok: false, error: 'Evidence can be removed only before you send your application.' }, 409);
  await env.DB.prepare("DELETE FROM credential_evidence WHERE id = ? AND learner_id = ? AND subject_type = 'application' AND subject_id = ?").bind(Number(d && d.id), l.id, a.id).run();
  return json({ ok: true, evidence: await evidenceOf(env, a.id) });
}

async function stop(env, l, d, ctx) {
  const reason = WITHDRAW_REASONS.includes(d && d.reason) ? d.reason : 'prefer_not_to_say';
  if (!d || !d.confirm) return json({ ok: false, error: 'Confirm that you want to stop being a Wavelength supervisor.' }, 400);
  const r = await withdrawSupervisor(env, l, { reason, note: reason === 'other' ? clip(d.note, 500) : '' }, ctx);
  return json(r, r.ok ? 200 : 400);
}

export async function handleSupervisorApply(env, l, req, url, p, ctx) {
  const known = ['supervisor', 'supervisor/application', 'supervisor/evidence', 'supervisor/evidence/remove', 'supervisor/submit', 'supervisor/application/cancel', 'supervisor/renew', 'supervisor/apply-again', 'supervisor/stop'];
  if (!known.includes(p)) return null;
  if (!(await lifecycleReady(env))) return json({ ok: false, available: false, error: 'Supervisor applications are not available yet.' }, 503);
  if (req.method === 'GET') return p === 'supervisor' ? overview(env, l) : json({ ok: false }, 404);
  if (p === 'supervisor/stop') return stop(env, l, await body(req), ctx);
  if (!applyOn(env)) return json({ ok: false, available: false, error: 'Supervisor applications are not open yet.' }, 503);
  // An application always starts from a confirmed email, so nobody applies in someone else's name.
  if (l.email_status !== 'verified') return json({ ok: false, needVerify: true, error: 'Confirm your email address first. We have sent you a link, or send a new one from this screen.' }, 403);
  if (p === 'supervisor/evidence') return addEvidence(env, l, req, url, { allowApplication: true });
  const d = (await body(req)) || {};
  if (p === 'supervisor/application') return saveDraft(env, l, d);
  if (p === 'supervisor/submit') return submit(env, l, d, ctx);
  if (p === 'supervisor/application/cancel') return cancel(env, l);
  if (p === 'supervisor/renew') return start(env, l, 'renewal');
  if (p === 'supervisor/apply-again') return start(env, l, 'reapplication');
  if (p === 'supervisor/evidence/remove') return removeEvidence(env, l, d);
  return json({ ok: false }, 404);
}
export { TYPE, parseList, LOGBOOK };
