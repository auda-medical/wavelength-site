// Wavelength app: structured assessments (AS- codes) and the supervisor dashboard.
// Assessments: a supervisor records a formative, summative, DOPS or final assessment against one pathway module,
// in person on the learner's phone, by a 14-day link (/app/assess/#token), or from their own dashboard.
// Supervisor links: a learner invites a supervisor by email. Once the supervisor accepts in their own app, they see
// the learner's progress and the written logbook (never images), and sign-off or assessment requests addressed to them.
import LOGBOOK from '../data/logbook.json';
import { SITE, json, clip, EMAIL, sha256, token, code, body, fullName, profileOf, contentHash, SIGNED_FIELDS, verificationReady, lifecycleReady } from './app-util.js';
import { buildSummary, signedAssessments } from './evidence.js';
import { sendMail, learner as learnerOf } from './academy.js';
import { mustVerify, sendVerification } from './email-verify.js';
import { snapshotFor, publicSnapshot, logEvent, SIGNER_LABELS } from './professional.js';
import { supervisorEligibility, eligibilityError, approvalRequired, applyOn, standingOf, linkState, signerBlocked, returnRequestsStmts, supervisorUnavailable, NEUTRAL_REFUSAL, areaLabels } from './supervisor-lifecycle.js';
import { audit, auditStmt } from './audit.js';
import { nowIso, parseTs } from './time.js';

const PATHS = Object.fromEntries(LOGBOOK.pathways.map((p) => [p.id, p]));
const KINDS = (LOGBOOK.assessmentKinds || []).map((k) => k.id);
const OUTCOMES = (LOGBOOK.assessmentOutcomes || []).map((o) => o.id);
const DOMAINS = (LOGBOOK.assessmentDomains || []).map((d) => d.id);
const SCALE = LOGBOOK.assessmentScale || [];
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const SIG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function moduleOf(pathway, mod) {
  const pw = PATHS[pathway];
  return pw && pw.modules.find((m) => m.id === mod) || null;
}
async function entriesFor(env, learnerId, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => ID.test(x)).slice(0, 20);
  if (!list.length) return [];
  const { results = [] } = await env.DB.prepare(`SELECT id, data FROM logbook_entries WHERE learner_id = ? AND deleted = 0 AND id IN (${list.map(() => '?').join(',')})`).bind(learnerId, ...list).all();
  return results.map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
}
const snap = (entries) => entries.map((e) => { const s = { id: e.id }; for (const k of SIGNED_FIELDS) s[k] = e[k] == null ? null : e[k]; return s; });
function cleanAssessor(d) {
  return { name: clip(d.name, 120), role: clip(d.role, 120), reg: clip(d.registration, 40), email: clip(d.email, 160).toLowerCase(), accreditation: clip(d.accreditation, 120) };
}
// The assessment form: domain ratings, outcome, written feedback. Shared by in-person, link and dashboard routes.
function cleanForm(d) {
  const domains = {};
  for (const k of DOMAINS) { const v = clip((d.domains || {})[k], 40); if (SCALE.includes(v)) domains[k] = v; }
  return {
    domains,
    outcome: OUTCOMES.includes(d.outcome) ? d.outcome : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : new Date().toISOString().slice(0, 10),
    topic: clip(d.topic, 160), setting: clip(d.setting, 120),
    strengths: clip(d.strengths, 3000), development: clip(d.development, 3000), actions: clip(d.actions, 3000),
    learnerReflection: clip(d.learnerReflection, 3000),
  };
}
function formError(f, kind) {
  if (!f.outcome) return 'Choose the outcome of the assessment.';
  if (kind !== 'formative' && f.outcome === 'feedback') return 'Feedback only applies to formative assessments. Choose another outcome.';
  if (!Object.keys(f.domains).length) return 'Rate at least one domain.';
  return null;
}
// The assessor's verified status is captured with the signature and never changed afterwards. Only the dashboard
// route identifies the assessor by their Wavelength account; in person and by link, the details are as declared.
async function finishAssessment(env, row, f, sup, sig, supervisorId, method) {
  const who = await env.DB.prepare('SELECT a.learner_id, l.title, l.first_name, l.last_name FROM assessments a JOIN learners l ON l.id = a.learner_id WHERE a.id = ?').bind(row.id).first();
  const snap = await snapshotFor(env, { pathway: row.pathway, module: row.module, declared: sup, method, accountId: supervisorId || null, learnerName: who ? fullName(who) : null });
  const r = await env.DB.prepare(`UPDATE assessments SET status = 'signed', outcome = ?, assessed_on = ?, data = ?, supervisor_name = ?, supervisor_role = ?, supervisor_reg = ?, supervisor_email = COALESCE(NULLIF(?, ''), supervisor_email), accreditation = ?, signature = ?, signed_at = datetime('now'), token_hash = NULL, supervisor_id = COALESCE(?, supervisor_id)${snap ? ', supervisor_snapshot = ?' : ''} WHERE id = ? AND status = 'pending'`)
    .bind(f.outcome, f.date, JSON.stringify({ ...JSON.parse(row.data || '{}'), ...f }), sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sig, supervisorId || null, ...(snap ? [JSON.stringify(snap)] : []), row.id).run();
  return !!(r.meta && r.meta.changes); // false when another submission signed it first
}
const publicRow = (r) => ({
  id: r.id, pathway: r.pathway, module: r.module, kind: r.kind, method: r.method, status: r.status, outcome: r.outcome, assessed_on: r.assessed_on,
  entry_ids: JSON.parse(r.entry_ids || '[]'), data: JSON.parse(r.data || '{}'), expires_at: r.expires_at, supervisor_name: r.supervisor_name,
  supervisor_role: r.supervisor_role, supervisor_reg: r.supervisor_reg, accreditation: r.accreditation, signature: r.signature, signed_at: r.signed_at, created_at: r.created_at,
  supervisor_id: r.supervisor_id || null, returned: r.returned_at ? { at: r.returned_at, reason: r.returned_reason } : null,
  amends: r.amends || null, superseded_by: r.superseded_by || null, amend_reason: r.amend_reason || null, error_note: r.error_note || null,
  signer: signerLabel(r.supervisor_snapshot),
});
// The label shown with a signed record: approved supervisor, account not approved, or self-declared.
function signerLabel(text) {
  const p = publicSnapshot(text);
  return p ? { kind: p.signer, label: p.label } : null;
}

// ---------- Learner side ----------
async function activeLink(env, learnerId, linkId) {
  if (!linkId) return null;
  return env.DB.prepare("SELECT * FROM supervisor_links WHERE id = ? AND learner_id = ? AND status = 'active'").bind(Number(linkId), learnerId).first();
}
// A dashboard request goes only to a linked supervisor who is approved, now, for what it covers.
export async function eligibleLink(env, learnerId, linkId, need) {
  const link = await activeLink(env, learnerId, linkId);
  if (!link || !link.supervisor_id) return { link: null, error: linkId ? 'That supervisor is no longer linked to you.' : null };
  const el = await supervisorEligibility(env, link.supervisor_id, need);
  if (!el.ok) return { link: null, error: el.reasons.includes('out_of_scope') ? 'This supervisor is not approved by Wavelength for everything in this request. Choose another supervisor, or send a one-off link.' : 'This supervisor is not available for Wavelength supervision at present. Choose another supervisor, or send a one-off link.' };
  return { link };
}
export async function assessmentRequest(env, l, req) {
  const d = await body(req);
  if (!d || !moduleOf(d.pathway, d.module) || !KINDS.includes(d.kind)) return json({ ok: false, error: 'Choose the pathway module and type of assessment.' }, 400);
  const entries = await entriesFor(env, l.id, d.entryIds);
  const { link, error } = await eligibleLink(env, l.id, d.supervisorLink, { scopes: [`${d.pathway}:${d.module}`] });
  if (d.supervisorLink && !link) return json({ ok: false, error }, 400);
  const t = token(), id = code('AS');
  await env.DB.prepare("INSERT INTO assessments (id, learner_id, pathway, module, kind, method, entry_ids, snapshot, data, token_hash, expires_at, supervisor_id, supervisor_name) VALUES (?,?,?,?,?,'remote',?,?,?,?,?,?,?)")
    .bind(id, l.id, d.pathway, d.module, d.kind, JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snap(entries)), JSON.stringify({ learnerReflection: clip(d.learnerReflection, 3000), topic: clip(d.topic, 160) }), await sha256(t), Date.now() + 14 * 864e5, link ? link.supervisor_id : null, clip(d.supervisorName, 120)).run();
  return json({ ok: true, code: id, link: `${new URL(req.url).origin}/app/assess/#${t}`, toDashboard: !!link });
}
export async function assessmentInPerson(env, l, req) {
  const d = await body(req);
  if (!d || !moduleOf(d.pathway, d.module) || !KINDS.includes(d.kind)) return json({ ok: false, error: 'Choose the pathway module and type of assessment.' }, 400);
  const f = cleanForm(d), sup = cleanAssessor(d), sig = String(d.signature || '');
  const err = formError(f, d.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'The assessor needs to enter their name and role and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Ask your assessor to sign in the box.' }, 400);
  const barred = await signerBlocked(env, { emails: [sup.email], reg: sup.reg });
  if (barred) { await audit(env, { actorType: 'learner', actorId: l.id, action: 'oneoff.blocked', subjectType: 'learner', subjectId: barred.learnerId, meta: { route: 'assessment/inperson' } }); return json({ ok: false, blocked: true, error: NEUTRAL_REFUSAL }, 403); }
  const entries = await entriesFor(env, l.id, d.entryIds);
  const id = code('AS');
  await env.DB.prepare("INSERT INTO assessments (id, learner_id, pathway, module, kind, method, entry_ids, snapshot, data) VALUES (?,?,?,?,?,'in-person',?,?,'{}')")
    .bind(id, l.id, d.pathway, d.module, d.kind, JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snap(entries))).run();
  await finishAssessment(env, { id, data: '{}', pathway: d.pathway, module: d.module }, f, sup, sig, null, 'in-person');
  return json({ ok: true, code: id });
}
export async function assessmentList(env, l) {
  const { results = [] } = await env.DB.prepare("SELECT * FROM assessments WHERE learner_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 300").bind(l.id).all();
  return json({ ok: true, assessments: results.map(publicRow) });
}
export async function assessmentCancel(env, l, req) {
  const d = await body(req);
  await env.DB.prepare("UPDATE assessments SET status = 'cancelled', token_hash = NULL WHERE id = ? AND learner_id = ? AND status = 'pending'").bind(clip(d && d.code, 20), l.id).run();
  return json({ ok: true });
}

// ---------- Assessor by link ----------
async function byToken(env, t) {
  return t && env.DB.prepare('SELECT a.*, l.title, l.first_name, l.last_name, l.email AS learner_email FROM assessments a JOIN learners l ON l.id = a.learner_id WHERE a.token_hash = ?').bind(await sha256(clip(t, 100))).first();
}
function viewOf(a) {
  const pw = PATHS[a.pathway], m = moduleOf(a.pathway, a.module);
  return { ok: true, code: a.id, learner: fullName(a), pathway: a.pathway, pathwayLabel: pw ? pw.label : a.pathway, module: a.module, moduleLabel: m ? m.label : a.module, kind: a.kind, supervisorName: a.supervisor_name, entries: JSON.parse(a.snapshot || '[]'), data: JSON.parse(a.data || '{}'), topics: (m && m.topics) || [] };
}
export async function assessmentView(env, url) {
  const a = await byToken(env, url.searchParams.get('t'));
  if (!a) return json({ ok: false, error: 'This assessment link is not valid. Ask the learner to send a new one.' }, 404);
  if (a.status !== 'pending') return json({ ok: false, done: true, error: `This assessment was completed by ${a.supervisor_name || 'the assessor'}.` }, 410);
  if (a.expires_at < Date.now()) return json({ ok: false, error: 'This assessment link has expired. Ask the learner to send a new one.' }, 410);
  return json(viewOf(a));
}
export async function assessmentComplete(env, req) {
  const d = await body(req);
  const a = d && await byToken(env, d.token);
  if (!a || a.status !== 'pending' || a.expires_at < Date.now()) return json({ ok: false, error: 'This assessment link is no longer valid.' }, 410);
  const f = cleanForm(d), sup = cleanAssessor(d), sig = String(d.signature || '');
  const err = formError(f, a.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box with your finger or mouse.' }, 400);
  const signer = await learnerOf(env, req).catch(() => null);
  const barred = await signerBlocked(env, { accountId: signer && signer.id, emails: [sup.email, a.supervisor_email], reg: sup.reg });
  if (barred) {
    // The request comes back to the learner, who sees only that this person can't sign through Wavelength at present.
    await env.DB.batch([
      env.DB.prepare("UPDATE assessments SET token_hash = NULL, returned_at = ?, returned_reason = 'signer_unavailable' WHERE id = ? AND status = 'pending'").bind(nowIso(), a.id),
      auditStmt(env, { actorType: 'token', actorId: signer ? signer.id : null, action: 'oneoff.blocked', subjectType: 'assessment', subjectId: a.id, meta: { route: 'assessment/complete' } }),
    ]);
    return json({ ok: false, blocked: true, error: NEUTRAL_REFUSAL }, 403);
  }
  if (!(await finishAssessment(env, a, f, sup, sig, null, 'remote'))) return json({ ok: false, error: 'This assessment link is no longer valid.' }, 410);
  return json({ ok: true, code: a.id });
}

// ---------- Supervisor links ----------
export async function supervisorAdd(env, l, req, ctx) {
  const d = await body(req);
  const email = clip(d && d.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return json({ ok: false, error: 'Enter your supervisor\'s email address.' }, 400);
  if (email === String(l.email).toLowerCase()) return json({ ok: false, error: 'Enter your supervisor\'s email, not your own.' }, 400);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_links WHERE learner_id = ? AND status != 'ended'").bind(l.id).first();
  if (n.n >= 10) return json({ ok: false, error: 'You can link up to 10 supervisors. Remove one first.' }, 400);
  // A resend within two minutes of the last one sends nothing new, so nobody receives a burst of invitations.
  const prev = await env.DB.prepare("SELECT status, created_at FROM supervisor_links WHERE learner_id = ? AND supervisor_email = ?").bind(l.id, email).first();
  if (prev && prev.status === 'pending' && Date.now() - Date.parse(String(prev.created_at).replace(' ', 'T') + 'Z') < 120000) return json({ ok: true, emailed: true, recent: true, hasAccount: false });
  if (prev && prev.status === 'active') return json({ ok: false, error: 'This supervisor is already linked.' }, 400);
  const sup = await env.DB.prepare('SELECT id FROM learners WHERE email = ? AND password_hash IS NOT NULL').bind(email).first();
  await env.DB.prepare("INSERT INTO supervisor_links (learner_id, supervisor_email, supervisor_id, status) VALUES (?,?,?,'pending') ON CONFLICT (learner_id, supervisor_email) DO UPDATE SET status = 'pending', supervisor_id = excluded.supervisor_id, ended_at = NULL, created_at = datetime('now')")
    .bind(l.id, email, sup ? sup.id : null).run();
  // The invitation carries a single-use token (hashed in D1, 30 days). Accepting with it proves the supervisor
  // received this email, so it also verifies their address.
  let invite = '';
  if (await verificationReady(env)) {
    const t = token();
    await env.DB.prepare('UPDATE supervisor_links SET invite_hash = ?, invite_expires = ? WHERE learner_id = ? AND supervisor_email = ?').bind(await sha256(t), Date.now() + 30 * 864e5, l.id, email).run();
    invite = `?invite=${t}`;
  }
  // Written to read as a message from a colleague, which hospital mail filters (NHSmail runs on Microsoft 365) trust
  // more than a bare service notice: the learner's name on the sender, replies going to the learner, and a link that
  // carries no email address.
  const who = fullName(l).replace(/[<>"\r\n]/g, '').slice(0, 80) || 'A Wavelength learner';
  const link = `${SITE}/app/#/supervise${invite}`;
  // With supervisor applications open, the button says what the person will actually do next: register as a
  // supervisor, continue to supervisor verification, or (already approved) log in and accept.
  const journey = applyOn(env) && (await lifecycleReady(env));
  const approved = journey && sup ? (await standingOf(env, sup.id)).current.length > 0 : false;
  const label = !journey ? (sup ? 'Log in and accept' : 'Create your account') : !sup ? 'Register as a supervisor' : approved ? 'Log in and accept' : 'Continue to supervisor verification';
  const next = !journey ? (sup ? 'Log in to Wavelength with this email address to accept.' : 'Create a free Wavelength account with this email address to accept.')
    : !sup ? 'Register as a Wavelength supervisor with this email address. Wavelength checks every supervisor before they can sign anything; it takes a few minutes, and your account also gives you a free logbook of your own.'
    : approved ? 'Log in to Wavelength with this email address to accept.' : 'Log in with this email address and complete the short supervisor verification. Wavelength checks every supervisor before they can sign anything.';
  const emailed = await sendMail(env, {
    to: email,
    fromName: `${who} via Wavelength`,
    replyTo: { address: String(l.email), name: who },
    subject: `Ultrasound supervision request from ${who}`,
    heading: 'Supervise an ultrasound logbook',
    paragraphs: [`${who} uses the free Wavelength ultrasound logbook and has named you as a supervisor.`, 'Once you accept, you see their progress against their pathway targets and their written scan records, never their images. They can send sign-off and assessment requests straight to your dashboard.', next, `To reply to ${who}, reply to this email.`],
    button: { href: link, label },
    text: `${who} has named you as an ultrasound supervisor on Wavelength, the free ultrasound logbook.\n\nAccept here: ${link}\n\nUse this email address (${email}) to log in or create your account. To reply to ${who}, reply to this email. If you do not know them, ignore this email.`,
  }).catch(() => false);
  return json({ ok: true, emailed: !!emailed, hasAccount: !!sup });
}
export async function supervisorRemove(env, l, req) {
  const d = await body(req);
  const id = Number(d && d.id);
  if (!(await lifecycleReady(env))) {
    await env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now') WHERE id = ? AND (learner_id = ? OR supervisor_id = ?)").bind(id, l.id, l.id).run();
    return json({ ok: true });
  }
  const link = await env.DB.prepare("SELECT * FROM supervisor_links WHERE id = ? AND (learner_id = ? OR supervisor_id = ?) AND status != 'ended'").bind(id, l.id, l.id).first();
  if (!link) return json({ ok: true });
  const byLearner = link.learner_id === l.id;
  // Open requests between the two come back to the learner, keeping their details.
  const ret = link.supervisor_id ? await returnRequestsStmts(env, link.supervisor_id, byLearner ? 'learner_removed' : 'supervisor_removed', link.learner_id) : { stmts: [] };
  await env.DB.batch([
    env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now'), ended_reason = ?, ended_by = ? WHERE id = ?").bind(byLearner ? 'learner_removed' : 'supervisor_removed', byLearner ? 'learner' : 'supervisor', link.id),
    ...ret.stmts,
    auditStmt(env, { actorType: byLearner ? 'learner' : 'supervisor', actorId: l.id, action: 'link.end', subjectType: 'link', subjectId: link.id, meta: { reason: byLearner ? 'learner_removed' : 'supervisor_removed' } }),
  ]);
  return json({ ok: true });
}
// Accepting an invitation. Before migration 0012, or with SUPERVISOR_APPROVAL_REQUIRED off, it activates the link as it
// always has. With approval required, it claims the link: the invitation stays pending (the learner sees "Supervisor
// verification in progress") and the person is sent to the supervisor application, unless they already hold a current
// approval, in which case it activates at once. Intent is kept on the server, so any later login on any device finds it.
async function acceptLink(env, l, where, args) {
  const life = await lifecycleReady(env);
  const eligible = (await supervisorEligibility(env, l.id)).ok;
  const activate = !life || eligible;
  const clear = args.clearInvite ? ', invite_hash = NULL' : '';
  const sql = activate
    ? `UPDATE supervisor_links SET status = 'active', supervisor_id = ?, accepted_at = datetime('now')${life ? ", claimed_at = COALESCE(claimed_at, datetime('now'))" : ''}${clear} WHERE ${where} AND status = 'pending'`
    : `UPDATE supervisor_links SET supervisor_id = ?, claimed_at = COALESCE(claimed_at, datetime('now'))${clear} WHERE ${where} AND status = 'pending'`;
  const r = await env.DB.prepare(sql).bind(l.id, ...args.bind).run();
  if (!(r.meta && r.meta.changes)) return null;
  if (life) await audit(env, { actorType: 'supervisor', actorId: l.id, action: activate ? 'link.accept' : 'link.claim', subjectType: 'link', subjectId: args.linkId, meta: {} });
  return { active: activate, next: activate ? 'dashboard' : 'apply' };
}
export async function supervisorAccept(env, l, req) {
  const d = await body(req);
  const id = Number(d && d.id);
  // An invitation is addressed to an email. Only someone who has proved they own that email may accept it.
  if (await mustVerify(env, l)) {
    await sendVerification(env, l, 'verify');
    return json({ ok: false, needVerify: true, error: 'Confirm your email address to accept. Use the link in the invitation email, or the confirmation link we have just sent.' }, 403);
  }
  const out = await acceptLink(env, l, 'id = ? AND supervisor_email = ?', { bind: [id, String(l.email).toLowerCase()], linkId: id });
  if (!out) return json({ ok: false, error: 'This invitation is no longer open.' }, 404);
  return json({ ok: true, ...out });
}
// Accept with the token from the invitation email. Works for an unverified account, because the token proves the
// email, and marks the address verified.
export async function supervisorAcceptInvite(env, l, req) {
  const d = await body(req);
  if (!(await verificationReady(env))) return json({ ok: false, error: 'This invitation is no longer open.' }, 404);
  const h = await sha256(clip(d && d.token, 100));
  const row = await env.DB.prepare('SELECT * FROM supervisor_links WHERE invite_hash = ?').bind(h).first();
  if (!row || row.status !== 'pending' || !row.invite_expires || row.invite_expires < Date.now()) return json({ ok: false, error: 'This invitation is no longer open. Ask the learner to invite you again.' }, 404);
  if (row.supervisor_email !== String(l.email).toLowerCase()) return json({ ok: false, wrongEmail: true, error: 'This invitation was sent to a different email address. Log in with the address it was sent to.' }, 403);
  const out = await acceptLink(env, l, 'id = ? AND invite_hash = ?', { bind: [row.id, h], linkId: row.id, clearInvite: true });
  if (!out) return json({ ok: false, error: 'This invitation is no longer open. Ask the learner to invite you again.' }, 404);
  if (l.email_status !== 'verified') {
    await env.DB.prepare("UPDATE learners SET email_status = 'verified', email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ? AND email = ?").bind(l.id, l.email).run();
    await logEvent(env, { learnerId: l.id, subjectType: 'email', subjectId: l.id, action: 'verified', outcome: 'verified', actor: 'learner', method: 'supervisor_invitation' });
  }
  return json({ ok: true, verified: true, ...out });
}
export async function supervisorLinks(env, l) {
  const life = await lifecycleReady(env);
  const mine = await env.DB.prepare(`SELECT s.id, s.supervisor_email, s.supervisor_id, s.status, s.created_at, s.accepted_at${life ? ', s.claimed_at, s.via' : ''}, t.title, t.first_name, t.last_name, t.role FROM supervisor_links s LEFT JOIN learners t ON t.id = s.supervisor_id WHERE s.learner_id = ? AND s.status != 'ended' ORDER BY s.created_at DESC`).bind(l.id).all();
  const invites = await env.DB.prepare(`SELECT s.id, s.created_at${life ? ', s.claimed_at, s.via' : ''}, t.title, t.first_name, t.last_name, t.role, t.organisation FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE (s.supervisor_email = ? OR s.supervisor_id = ?) AND s.status = 'pending' ORDER BY s.created_at DESC`).bind(String(l.email).toLowerCase(), l.id).all();
  const learners = await env.DB.prepare("SELECT s.id AS link_id, s.accepted_at, t.id, t.title, t.first_name, t.last_name, t.role, t.organisation, t.profile FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.status = 'active' ORDER BY t.last_name").bind(l.id).all();
  const pend = await env.DB.prepare("SELECT learner_id, COUNT(*) AS n FROM signoffs WHERE supervisor_id = ? AND status = 'pending' AND expires_at > ? GROUP BY learner_id").bind(l.id, Date.now()).all();
  const pendA = await env.DB.prepare("SELECT learner_id, COUNT(*) AS n FROM assessments WHERE supervisor_id = ? AND status = 'pending' AND expires_at > ? GROUP BY learner_id").bind(l.id, Date.now()).all();
  const pc = {}; for (const r of [...(pend.results || []), ...(pendA.results || [])]) pc[r.learner_id] = (pc[r.learner_id] || 0) + r.n;
  // Each supervisor's standing, read once per request: a link's label comes from current approvals, never from the link.
  const enforced = approvalRequired(env);
  const standings = {};
  const standing = async (id) => (id && life ? (standings[id] ||= await standingOf(env, id)) : null);
  const supervisors = [];
  for (const r of mine.results || []) {
    const st = life ? linkState(r, await standing(r.supervisor_id), enforced) : { state: r.status === 'active' ? 'not_verified' : 'invited', label: r.status === 'active' ? 'Not yet verified by Wavelength' : 'Invitation sent' };
    // A supervisor found through search never had their address typed by the learner: it is not shown.
    supervisors.push({ id: r.id, email: r.via === 'search' ? null : r.supervisor_email, status: r.status, state: st.state, stateLabel: st.label, areas: st.areas || [], renewal: !!st.renewal, name: r.first_name ? fullName(r) : '', role: r.role || '', since: r.accepted_at || r.created_at, via: r.via || 'email' });
  }
  const me = life ? await standing(l.id) : null;
  return json({
    ok: true,
    supervisors,
    invites: (invites.results || []).map((r) => ({ id: r.id, learner: fullName(r), role: r.role || '', organisation: r.organisation || '', at: r.created_at, claimed: !!r.claimed_at, via: r.via || 'email' })),
    learners: (learners.results || []).map((r) => ({ id: r.id, linkId: r.link_id, name: fullName(r), role: profileOf(r).grade || r.role || '', organisation: r.organisation || '', pathways: profileOf(r).pathways || [], pending: pc[r.id] || 0, since: r.accepted_at, available: !enforced || !!(me && me.current.length) })),
    me: me ? { standing: me.standing, areas: areaLabels(me.current), enforced, apply: applyOn(env) } : { standing: 'none', areas: [], enforced: false, apply: false },
  });
}
async function supervisedLearner(env, l, learnerId) {
  return env.DB.prepare("SELECT t.* FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.learner_id = ? AND s.status = 'active'").bind(l.id, Number(learnerId)).first();
}
// Every dashboard route: the link must be active AND the supervisor must be eligible now, for what the action covers.
async function guard(env, l, learnerId, need = {}) {
  const t = await supervisedLearner(env, l, learnerId);
  if (!t) return { res: json({ ok: false, error: 'You no longer supervise this learner.' }, 404) };
  const el = await supervisorEligibility(env, l.id, need);
  if (!el.ok) return { res: json({ ok: false, eligibility: el.reasons, error: eligibilityError(el) }, 403) };
  return { t };
}
const typesIn = (snapshot) => [...new Set(JSON.parse(snapshot || '[]').map((e) => e.type).filter(Boolean))];
export async function superviseLearner(env, l, url) {
  const g = await guard(env, l, url.searchParams.get('id'));
  if (g.res) return g.res;
  const t = g.t;
  const prof = profileOf(t);
  const { results = [] } = await env.DB.prepare('SELECT data FROM logbook_entries WHERE learner_id = ? AND deleted = 0 ORDER BY scan_date DESC').bind(t.id).all();
  const entries = results.map((r) => JSON.parse(r.data));
  const asm = await signedAssessments(env, t.id);
  const pathways = (prof.pathways && prof.pathways.length ? prof.pathways : ['general']).filter((p) => PATHS[p]);
  const summary = buildSummary(entries, prof, pathways, asm);
  const recent = entries.slice(0, 60).map((e) => ({ id: e.id, type: e.type, date: e.date, setting: e.setting, indication: e.indication, findings: e.findings, overall: e.overall, quality: e.quality, interpretation: e.interpretation, supervision: e.supervision, supervisor: e.supervisor, signoff: e.signoff ? { status: e.signoff.status, name: e.signoff.name, at: e.signoff.at, code: e.signoff.code, rating: e.signoff.rating } : null, images: (e.images || []).length }));
  const so = await env.DB.prepare("SELECT id, created_at, expires_at, entry_ids FROM signoffs WHERE learner_id = ? AND supervisor_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC").bind(t.id, l.id, Date.now()).all();
  const as = await env.DB.prepare("SELECT * FROM assessments WHERE learner_id = ? AND supervisor_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC").bind(t.id, l.id, Date.now()).all();
  const done = await env.DB.prepare("SELECT * FROM assessments WHERE learner_id = ? AND status = 'signed' ORDER BY assessed_on DESC LIMIT 50").bind(t.id).all();
  return json({
    ok: true, learner: { id: t.id, name: fullName(t), role: prof.grade || t.role || '', organisation: t.organisation || '', pathways },
    summary, recent,
    signoffRequests: (so.results || []).map((r) => ({ code: r.id, at: r.created_at, expires: r.expires_at, count: JSON.parse(r.entry_ids || '[]').length })),
    assessmentRequests: (as.results || []).map((r) => viewOf({ ...r, title: t.title, first_name: t.first_name, last_name: t.last_name })),
    assessments: (done.results || []).map(publicRow),
  });
}
// Sign-off from the dashboard, for requests the learner addressed to this supervisor.
export async function superviseSignoffView(env, l, url) {
  const so = await env.DB.prepare("SELECT s.*, t.title, t.first_name, t.last_name FROM signoffs s JOIN learners t ON t.id = s.learner_id WHERE s.id = ? AND s.supervisor_id = ? AND s.status = 'pending'").bind(clip(url.searchParams.get('code'), 20), l.id).first();
  if (!so || so.expires_at < Date.now()) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  const g = await guard(env, l, so.learner_id, { types: typesIn(so.snapshot) });
  if (g.res) return g.res;
  return json({ ok: true, code: so.id, learner: fullName(so), entries: JSON.parse(so.snapshot) });
}
export async function superviseSignoffComplete(env, l, req, applySignoff, cleanSupervisor, deleteSharedImages, notify) {
  const d = await body(req);
  const so = d && await env.DB.prepare("SELECT * FROM signoffs WHERE id = ? AND supervisor_id = ? AND status = 'pending'").bind(clip(d.code, 20), l.id).first();
  if (!so || so.expires_at < Date.now()) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  // Checked again at submit: an approval that ended, or a scope that does not cover every scan, refuses here.
  const g = await guard(env, l, so.learner_id, { types: typesIn(so.snapshot) });
  if (g.res) return g.res;
  const sup = cleanSupervisor({ ...d, email: l.email });
  const sig = String(d.signature || '');
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  const decisions = d.decisions && typeof d.decisions === 'object' ? d.decisions : {};
  const ratings = d.ratings && typeof d.ratings === 'object' ? d.ratings : {};
  // Signed from the supervisor's own logged-in account: capture their verified status as it is now.
  const snap = await snapshotFor(env, { entries: JSON.parse(so.snapshot), declared: sup, method: 'dashboard', accountId: l.id, learnerName: fullName(g.t) });
  const done = await env.DB.prepare(`UPDATE signoffs SET status = 'signed', method = 'dashboard', supervisor_name = ?, supervisor_role = ?, supervisor_reg = ?, supervisor_email = ?, accreditation = ?, basis = ?, comment = ?, decisions = ?, ratings = ?, signature = ?, signed_at = datetime('now'), token_hash = NULL${snap ? ', supervisor_snapshot = ?' : ''} WHERE id = ? AND status = 'pending'`)
    .bind(sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sup.basis, sup.comment, JSON.stringify(decisions), JSON.stringify(ratings), sig, ...(snap ? [JSON.stringify(snap)] : []), so.id).run();
  if (!(done.meta && done.meta.changes)) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  await applySignoff(env, so, decisions, sup, 'dashboard', ratings, snap);
  await deleteSharedImages(env, so.id);
  if (notify) notify(so, decisions, sup);
  return json({ ok: true, code: so.id });
}
export async function superviseAssessmentComplete(env, l, req) {
  const d = await body(req);
  const a = d && await env.DB.prepare("SELECT * FROM assessments WHERE id = ? AND supervisor_id = ? AND status = 'pending'").bind(clip(d.code, 20), l.id).first();
  if (!a || a.expires_at < Date.now()) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  const g = await guard(env, l, a.learner_id, { scopes: [`${a.pathway}:${a.module}`] });
  if (g.res) return g.res;
  const f = cleanForm(d), sup = cleanAssessor({ ...d, email: l.email }), sig = String(d.signature || '');
  const err = formError(f, a.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  if (!(await finishAssessment(env, a, f, sup, sig, l.id, 'dashboard'))) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  await env.DB.prepare("UPDATE assessments SET method = 'dashboard' WHERE id = ?").bind(a.id).run();
  return json({ ok: true, code: a.id });
}
// A supervisor records an assessment for a linked learner on their own device, without a request.
export async function superviseAssessmentNew(env, l, req) {
  const d = await body(req);
  if (!d) return json({ ok: false, error: 'You no longer supervise this learner.' }, 404);
  if (!moduleOf(d.pathway, d.module) || !KINDS.includes(d.kind)) return json({ ok: false, error: 'Choose the pathway module and type of assessment.' }, 400);
  const g = await guard(env, l, d.learnerId, { scopes: [`${d.pathway}:${d.module}`] });
  if (g.res) return g.res;
  const t = g.t;
  const f = cleanForm(d), sup = cleanAssessor({ ...d, email: l.email }), sig = String(d.signature || '');
  const err = formError(f, d.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  const entries = await entriesFor(env, t.id, d.entryIds);
  const id = code('AS');
  await env.DB.prepare("INSERT INTO assessments (id, learner_id, pathway, module, kind, method, entry_ids, snapshot, data, supervisor_id) VALUES (?,?,?,?,?,'dashboard',?,?,'{}',?)")
    .bind(id, t.id, d.pathway, d.module, d.kind, JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snap(entries)), l.id).run();
  await finishAssessment(env, { id, data: '{}', pathway: d.pathway, module: d.module }, f, sup, sig, l.id, 'dashboard');
  return json({ ok: true, code: id });
}

export async function verifyAssessment(env, c) {
  const life = await lifecycleReady(env);
  const a = await env.DB.prepare(`SELECT a.*, l.title, l.first_name, l.last_name FROM assessments a JOIN learners l ON l.id = a.learner_id WHERE a.id = ? AND a.status IN ('signed'${life ? ", 'superseded'" : ''})`).bind(c).first();
  if (!a) return (await tombstone(env, c)) || json({ ok: false, error: 'No completed assessment matches that code.' }, 404);
  const pw = PATHS[a.pathway], m = moduleOf(a.pathway, a.module), kind = (LOGBOOK.assessmentKinds || []).find((k) => k.id === a.kind);
  const outcome = (LOGBOOK.assessmentOutcomes || []).find((o) => o.id === a.outcome);
  const check = publicSnapshot(a.supervisor_snapshot);
  const out = { ok: true, kind: 'assessment', code: a.id, learner: (check && check.learnerName) || fullName(a), pathway: pw ? pw.name : a.pathway, module: m ? m.label : a.module, type: kind ? kind.label : a.kind, outcome: outcome ? outcome.label : a.outcome, outcomeId: a.outcome, assessedOn: a.assessed_on, assessor: a.supervisor_name, role: a.supervisor_role, accreditation: a.accreditation, method: a.method, handSigned: !!a.signature, scans: JSON.parse(a.entry_ids || '[]').length, supervisorCheck: check };
  if (life) {
    if (a.status === 'superseded' && a.superseded_by) {
      const n = await env.DB.prepare('SELECT signed_at FROM assessments WHERE id = ?').bind(a.superseded_by).first();
      out.superseded = { by: a.superseded_by, on: n ? String(n.signed_at || '').slice(0, 10) : null, notice: `Amended by the assessor${n && n.signed_at ? ' on ' + String(n.signed_at).slice(0, 10) : ''}: see ${a.superseded_by}.` };
    }
    if (a.amends) out.amends = { code: a.amends, notice: `This corrects ${a.amends}.` };
    if (a.error_at) out.issuedInError = { on: String(a.error_at).slice(0, 10), notice: 'Wavelength has marked this record as issued in error. It does not count as evidence.' };
  }
  return json(out);
}
// Verify codes whose owner deleted their account answer "withdrawn by its owner", which tells a reviewer it was real
// but withdrawn, without keeping anything about the person.
export async function tombstone(env, c) {
  if (!c || !(await lifecycleReady(env))) return null;
  const t = await env.DB.prepare('SELECT kind, withdrawn_on FROM code_tombstones WHERE code_hash = ?').bind(await sha256('code:' + c)).first();
  return t ? json({ ok: false, withdrawn: true, code: c, error: 'This record was withdrawn by its owner, who has closed their Wavelength account. It can no longer be checked.' }, 410) : null;
}

// ---------- Amendment ----------
// The assessor corrects their own dashboard assessment within 30 days: a new signed version with a reason. The old one
// is kept, marked superseded, and its verify page points to the new one. Never an overwrite.
export const AMEND_DAYS = 30;
export async function superviseAssessmentAmend(env, l, req) {
  if (!(await lifecycleReady(env))) return json({ ok: false, error: 'Not available yet.' }, 404);
  const d = await body(req);
  const old = d && await env.DB.prepare("SELECT * FROM assessments WHERE id = ? AND supervisor_id = ? AND status = 'signed' AND method = 'dashboard'").bind(clip(d.code, 20), l.id).first();
  if (!old) return json({ ok: false, error: 'You can amend only an assessment you signed from your dashboard.' }, 404);
  if (old.superseded_by) return json({ ok: false, error: 'This assessment has already been amended.' }, 409);
  if (Date.now() - parseTs(old.signed_at) > AMEND_DAYS * 864e5) return json({ ok: false, error: `Assessments can be amended for ${AMEND_DAYS} days. Record a new assessment instead.` }, 400);
  const reason = clip(d.reason, 1000);
  if (reason.length < 5) return json({ ok: false, error: 'Say why you are amending this assessment.' }, 400);
  const g = await guard(env, l, old.learner_id, { scopes: [`${old.pathway}:${old.module}`] });
  if (g.res) return g.res;
  const f = cleanForm(d), sup = cleanAssessor({ ...d, email: l.email }), sig = String(d.signature || '');
  const err = formError(f, old.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  const id = code('AS');
  // Claim the old record first, so two amendments cannot both succeed.
  const claim = await env.DB.prepare("UPDATE assessments SET superseded_by = ? WHERE id = ? AND status = 'signed' AND superseded_by IS NULL").bind(id, old.id).run();
  if (!(claim.meta && claim.meta.changes)) return json({ ok: false, error: 'This assessment has already been amended.' }, 409);
  await env.DB.prepare("INSERT INTO assessments (id, learner_id, pathway, module, kind, method, entry_ids, snapshot, data, supervisor_id, amends, amend_reason) VALUES (?,?,?,?,?,'dashboard',?,?,'{}',?,?,?)")
    .bind(id, old.learner_id, old.pathway, old.module, old.kind, old.entry_ids, old.snapshot, l.id, old.id, reason).run();
  await finishAssessment(env, { id, data: '{}', pathway: old.pathway, module: old.module }, f, sup, sig, l.id, 'dashboard');
  await env.DB.batch([
    env.DB.prepare("UPDATE assessments SET status = 'superseded' WHERE id = ? AND superseded_by = ?").bind(old.id, id),
    auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'assessment.amend', subjectType: 'assessment', subjectId: id, meta: { amends: old.id } }),
  ]);
  return json({ ok: true, code: id, amends: old.id });
}

// ---------- Returned requests: the learner reassigns, sends to a one-off assessor, or cancels ----------
export async function assessmentReassign(env, l, req) {
  const d = await body(req);
  const a = d && await env.DB.prepare("SELECT * FROM assessments WHERE id = ? AND learner_id = ? AND status = 'pending'").bind(clip(d.code, 20), l.id).first();
  if (!a) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  const { link, error } = await eligibleLink(env, l.id, d.supervisorLink, { scopes: [`${a.pathway}:${a.module}`] });
  if (!link) return json({ ok: false, error: error || 'Choose a supervisor.' }, 400);
  await env.DB.batch([
    env.DB.prepare("UPDATE assessments SET supervisor_id = ?, returned_at = NULL, returned_reason = NULL, expires_at = MAX(expires_at, ?) WHERE id = ? AND status = 'pending'").bind(link.supervisor_id, Date.now() + 14 * 864e5, a.id),
    auditStmt(env, { actorType: 'learner', actorId: l.id, action: 'request.reassign', subjectType: 'assessment', subjectId: a.id, meta: { link: link.id } }),
  ]);
  return json({ ok: true, code: a.id });
}
export async function assessmentRelink(env, l, req) {
  const d = await body(req);
  const a = d && await env.DB.prepare("SELECT * FROM assessments WHERE id = ? AND learner_id = ? AND status = 'pending'").bind(clip(d.code, 20), l.id).first();
  if (!a) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  const t = token();
  await env.DB.batch([
    env.DB.prepare("UPDATE assessments SET supervisor_id = NULL, token_hash = ?, expires_at = ?, returned_at = NULL, returned_reason = NULL, supervisor_name = ? WHERE id = ? AND status = 'pending'").bind(await sha256(t), Date.now() + 14 * 864e5, clip(d.supervisorName, 120) || null, a.id),
    auditStmt(env, { actorType: 'learner', actorId: l.id, action: 'request.relink', subjectType: 'assessment', subjectId: a.id, meta: {} }),
  ]);
  return json({ ok: true, code: a.id, link: `${new URL(req.url).origin}/app/assess/#${t}` });
}

// The supervisor's signed records stay in their trainees' portfolios, with a reduced snapshot: name, role, the
// registration they declared, and the approval status and scope at the time. Email and account details go.
export function reduceSnapshot(text) {
  let s; try { s = JSON.parse(text || 'null'); } catch { s = null; }
  if (!s) return text;
  delete s.email; delete s.accountId;
  if (Array.isArray(s.registrations)) s.registrations = s.registrations.map((r) => ({ regulator: r.regulator, regulatorName: r.regulatorName, profession: r.profession, status: r.status, verified: r.verified, verifiedAt: r.verifiedAt }));
  s.accountClosed = true;
  return JSON.stringify(s);
}
export async function deleteSupervision(env, l) {
  const life = await lifecycleReady(env);
  const out = [];
  let notify = [];
  if (life) {
    // Requests addressed to this supervisor come back to their learners (decision 3), and actively linked learners
    // are told the supervisor is no longer available (no reason given).
    const un = await supervisorUnavailable(env, l.id, { event: 'account-closed', reason: 'supervisor_account_closed' });
    out.push(...un.stmts);
    notify = un.keys;
    for (const t of ['signoffs', 'assessments']) {
      const { results = [] } = await env.DB.prepare(`SELECT id, supervisor_snapshot FROM ${t} WHERE supervisor_id = ? AND supervisor_snapshot IS NOT NULL`).bind(l.id).all();
      for (const r of results) out.push(env.DB.prepare(`UPDATE ${t} SET supervisor_snapshot = ?, supervisor_email = NULL WHERE id = ?`).bind(reduceSnapshot(r.supervisor_snapshot), r.id));
    }
  }
  const stmts = [
    ...out,
    env.DB.prepare('DELETE FROM assessments WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM supervisor_links WHERE learner_id = ?').bind(l.id),
    env.DB.prepare(`UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now'), supervisor_id = NULL${life ? ", ended_reason = 'account_deleted', ended_by = 'system'" : ''} WHERE supervisor_id = ?`).bind(l.id),
    env.DB.prepare('UPDATE signoffs SET supervisor_id = NULL WHERE supervisor_id = ?').bind(l.id),
    env.DB.prepare('UPDATE assessments SET supervisor_id = NULL WHERE supervisor_id = ?').bind(l.id),
  ];
  stmts.notify = notify; // outbox keys to send once the batch has committed
  return stmts;
}
