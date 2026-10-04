// Wavelength app: structured assessments (AS- codes) and the supervisor dashboard.
// Assessments: a supervisor records a formative, summative, DOPS or final assessment against one pathway module,
// in person on the learner's phone, by a 14-day link (/app/assess/#token), or from their own dashboard.
// Supervisor links: a learner invites a supervisor by email. Once the supervisor accepts in their own app, they see
// the learner's progress and the written logbook (never images), and sign-off or assessment requests addressed to them.
import LOGBOOK from '../data/logbook.json';
import { SITE, json, clip, EMAIL, sha256, token, code, body, fullName, profileOf, contentHash, SIGNED_FIELDS } from './app-util.js';
import { buildSummary, signedAssessments } from './evidence.js';
import { sendMail } from './academy.js';

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
async function finishAssessment(env, row, f, sup, sig, supervisorId) {
  await env.DB.prepare("UPDATE assessments SET status = 'signed', outcome = ?, assessed_on = ?, data = ?, supervisor_name = ?, supervisor_role = ?, supervisor_reg = ?, supervisor_email = COALESCE(NULLIF(?, ''), supervisor_email), accreditation = ?, signature = ?, signed_at = datetime('now'), token_hash = NULL, supervisor_id = COALESCE(?, supervisor_id) WHERE id = ?")
    .bind(f.outcome, f.date, JSON.stringify({ ...JSON.parse(row.data || '{}'), ...f }), sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sig, supervisorId || null, row.id).run();
}
const publicRow = (r) => ({
  id: r.id, pathway: r.pathway, module: r.module, kind: r.kind, method: r.method, status: r.status, outcome: r.outcome, assessed_on: r.assessed_on,
  entry_ids: JSON.parse(r.entry_ids || '[]'), data: JSON.parse(r.data || '{}'), expires_at: r.expires_at, supervisor_name: r.supervisor_name,
  supervisor_role: r.supervisor_role, supervisor_reg: r.supervisor_reg, accreditation: r.accreditation, signature: r.signature, signed_at: r.signed_at, created_at: r.created_at,
});

// ---------- Learner side ----------
async function activeLink(env, learnerId, linkId) {
  if (!linkId) return null;
  return env.DB.prepare("SELECT * FROM supervisor_links WHERE id = ? AND learner_id = ? AND status = 'active'").bind(Number(linkId), learnerId).first();
}
export async function assessmentRequest(env, l, req) {
  const d = await body(req);
  if (!d || !moduleOf(d.pathway, d.module) || !KINDS.includes(d.kind)) return json({ ok: false, error: 'Choose the pathway module and type of assessment.' }, 400);
  const entries = await entriesFor(env, l.id, d.entryIds);
  const link = await activeLink(env, l.id, d.supervisorLink);
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
  const entries = await entriesFor(env, l.id, d.entryIds);
  const id = code('AS');
  await env.DB.prepare("INSERT INTO assessments (id, learner_id, pathway, module, kind, method, entry_ids, snapshot, data) VALUES (?,?,?,?,?,'in-person',?,?,'{}')")
    .bind(id, l.id, d.pathway, d.module, d.kind, JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snap(entries))).run();
  await finishAssessment(env, { id, data: '{}' }, f, sup, sig, null);
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
  await finishAssessment(env, a, f, sup, sig, null);
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
  const sup = await env.DB.prepare('SELECT id FROM learners WHERE email = ? AND password_hash IS NOT NULL').bind(email).first();
  await env.DB.prepare("INSERT INTO supervisor_links (learner_id, supervisor_email, supervisor_id, status) VALUES (?,?,?,'pending') ON CONFLICT (learner_id, supervisor_email) DO UPDATE SET status = 'pending', supervisor_id = excluded.supervisor_id, ended_at = NULL, created_at = datetime('now')")
    .bind(l.id, email, sup ? sup.id : null).run();
  let emailed = false;
  if (env.ZEPTOMAIL_TOKEN) {
    const link = `${SITE}/app/?login=${encodeURIComponent(email)}#/supervise`;
    ctx.waitUntil(sendMail(env, {
      to: email, subject: `${fullName(l)} asks you to supervise their ultrasound logbook`,
      heading: 'Supervise an ultrasound logbook',
      paragraphs: [`${fullName(l)} uses the free Wavelength ultrasound logbook and has named you as a supervisor.`, 'Once you accept, you see their progress against their pathway targets and their written scan records, never their images. They can send sign-off and assessment requests straight to your dashboard.', sup ? 'Log in to Wavelength with this email address to accept.' : 'Create a free Wavelength account with this email address to accept.'],
      button: { href: link, label: sup ? 'Log in and accept' : 'Create your account' },
      text: `${fullName(l)} has named you as an ultrasound supervisor on Wavelength.\n\nAccept here: ${link}\n\nIf you do not know them, ignore this email.`,
    }).catch(() => {}));
    emailed = true;
  }
  return json({ ok: true, emailed, hasAccount: !!sup });
}
export async function supervisorRemove(env, l, req) {
  const d = await body(req);
  const id = Number(d && d.id);
  await env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now') WHERE id = ? AND (learner_id = ? OR supervisor_id = ?)").bind(id, l.id, l.id).run();
  return json({ ok: true });
}
export async function supervisorAccept(env, l, req) {
  const d = await body(req);
  const id = Number(d && d.id);
  const r = await env.DB.prepare("UPDATE supervisor_links SET status = 'active', supervisor_id = ?, accepted_at = datetime('now') WHERE id = ? AND supervisor_email = ? AND status = 'pending'").bind(l.id, id, String(l.email).toLowerCase()).run();
  if (!(r.meta && r.meta.changes)) return json({ ok: false, error: 'This invitation is no longer open.' }, 404);
  return json({ ok: true });
}
export async function supervisorLinks(env, l) {
  const mine = await env.DB.prepare("SELECT s.id, s.supervisor_email, s.status, s.created_at, s.accepted_at, t.title, t.first_name, t.last_name, t.role FROM supervisor_links s LEFT JOIN learners t ON t.id = s.supervisor_id WHERE s.learner_id = ? AND s.status != 'ended' ORDER BY s.created_at DESC").bind(l.id).all();
  const invites = await env.DB.prepare("SELECT s.id, s.created_at, t.title, t.first_name, t.last_name, t.role, t.organisation FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_email = ? AND s.status = 'pending' ORDER BY s.created_at DESC").bind(String(l.email).toLowerCase()).all();
  const learners = await env.DB.prepare("SELECT s.id AS link_id, s.accepted_at, t.id, t.title, t.first_name, t.last_name, t.role, t.organisation, t.profile FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.status = 'active' ORDER BY t.last_name").bind(l.id).all();
  const pend = await env.DB.prepare("SELECT learner_id, COUNT(*) AS n FROM signoffs WHERE supervisor_id = ? AND status = 'pending' AND expires_at > ? GROUP BY learner_id").bind(l.id, Date.now()).all();
  const pendA = await env.DB.prepare("SELECT learner_id, COUNT(*) AS n FROM assessments WHERE supervisor_id = ? AND status = 'pending' AND expires_at > ? GROUP BY learner_id").bind(l.id, Date.now()).all();
  const pc = {}; for (const r of [...(pend.results || []), ...(pendA.results || [])]) pc[r.learner_id] = (pc[r.learner_id] || 0) + r.n;
  return json({
    ok: true,
    supervisors: (mine.results || []).map((r) => ({ id: r.id, email: r.supervisor_email, status: r.status, name: r.first_name ? fullName(r) : '', role: r.role || '', since: r.accepted_at || r.created_at })),
    invites: (invites.results || []).map((r) => ({ id: r.id, learner: fullName(r), role: r.role || '', organisation: r.organisation || '', at: r.created_at })),
    learners: (learners.results || []).map((r) => ({ id: r.id, linkId: r.link_id, name: fullName(r), role: profileOf(r).grade || r.role || '', organisation: r.organisation || '', pathways: profileOf(r).pathways || [], pending: pc[r.id] || 0, since: r.accepted_at })),
  });
}
async function supervisedLearner(env, l, learnerId) {
  return env.DB.prepare("SELECT t.* FROM supervisor_links s JOIN learners t ON t.id = s.learner_id WHERE s.supervisor_id = ? AND s.learner_id = ? AND s.status = 'active'").bind(l.id, Number(learnerId)).first();
}
export async function superviseLearner(env, l, url) {
  const t = await supervisedLearner(env, l, url.searchParams.get('id'));
  if (!t) return json({ ok: false, error: 'You no longer supervise this learner.' }, 404);
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
  if (!so || so.expires_at < Date.now() || !(await supervisedLearner(env, l, so.learner_id))) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  return json({ ok: true, code: so.id, learner: fullName(so), entries: JSON.parse(so.snapshot) });
}
export async function superviseSignoffComplete(env, l, req, applySignoff, cleanSupervisor, deleteSharedImages, notify) {
  const d = await body(req);
  const so = d && await env.DB.prepare("SELECT * FROM signoffs WHERE id = ? AND supervisor_id = ? AND status = 'pending'").bind(clip(d.code, 20), l.id).first();
  if (!so || so.expires_at < Date.now() || !(await supervisedLearner(env, l, so.learner_id))) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  const sup = cleanSupervisor({ ...d, email: l.email });
  const sig = String(d.signature || '');
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  const decisions = d.decisions && typeof d.decisions === 'object' ? d.decisions : {};
  const ratings = d.ratings && typeof d.ratings === 'object' ? d.ratings : {};
  await env.DB.prepare("UPDATE signoffs SET status = 'signed', method = 'dashboard', supervisor_name = ?, supervisor_role = ?, supervisor_reg = ?, supervisor_email = ?, accreditation = ?, basis = ?, comment = ?, decisions = ?, ratings = ?, signature = ?, signed_at = datetime('now'), token_hash = NULL WHERE id = ?")
    .bind(sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sup.basis, sup.comment, JSON.stringify(decisions), JSON.stringify(ratings), sig, so.id).run();
  await applySignoff(env, so, decisions, sup, 'dashboard', ratings);
  await deleteSharedImages(env, so.id);
  if (notify) notify(so, decisions, sup);
  return json({ ok: true, code: so.id });
}
export async function superviseAssessmentComplete(env, l, req) {
  const d = await body(req);
  const a = d && await env.DB.prepare("SELECT * FROM assessments WHERE id = ? AND supervisor_id = ? AND status = 'pending'").bind(clip(d.code, 20), l.id).first();
  if (!a || a.expires_at < Date.now() || !(await supervisedLearner(env, l, a.learner_id))) return json({ ok: false, error: 'This request is no longer open.' }, 404);
  const f = cleanForm(d), sup = cleanAssessor({ ...d, email: l.email }), sig = String(d.signature || '');
  const err = formError(f, a.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  await finishAssessment(env, a, f, sup, sig, l.id);
  await env.DB.prepare("UPDATE assessments SET method = 'dashboard' WHERE id = ?").bind(a.id).run();
  return json({ ok: true, code: a.id });
}
// A supervisor records an assessment for a linked learner on their own device, without a request.
export async function superviseAssessmentNew(env, l, req) {
  const d = await body(req);
  const t = d && await supervisedLearner(env, l, d.learnerId);
  if (!t) return json({ ok: false, error: 'You no longer supervise this learner.' }, 404);
  if (!moduleOf(d.pathway, d.module) || !KINDS.includes(d.kind)) return json({ ok: false, error: 'Choose the pathway module and type of assessment.' }, 400);
  const f = cleanForm(d), sup = cleanAssessor({ ...d, email: l.email }), sig = String(d.signature || '');
  const err = formError(f, d.kind);
  if (err) return json({ ok: false, error: err }, 400);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  if (!SIG.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box.' }, 400);
  const entries = await entriesFor(env, t.id, d.entryIds);
  const id = code('AS');
  await env.DB.prepare("INSERT INTO assessments (id, learner_id, pathway, module, kind, method, entry_ids, snapshot, data, supervisor_id) VALUES (?,?,?,?,?,'dashboard',?,?,'{}',?)")
    .bind(id, t.id, d.pathway, d.module, d.kind, JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snap(entries)), l.id).run();
  await finishAssessment(env, { id, data: '{}' }, f, sup, sig, l.id);
  return json({ ok: true, code: id });
}

export async function verifyAssessment(env, c) {
  const a = await env.DB.prepare("SELECT a.*, l.title, l.first_name, l.last_name FROM assessments a JOIN learners l ON l.id = a.learner_id WHERE a.id = ? AND a.status = 'signed'").bind(c).first();
  if (!a) return json({ ok: false, error: 'No completed assessment matches that code.' }, 404);
  const pw = PATHS[a.pathway], m = moduleOf(a.pathway, a.module), kind = (LOGBOOK.assessmentKinds || []).find((k) => k.id === a.kind);
  const outcome = (LOGBOOK.assessmentOutcomes || []).find((o) => o.id === a.outcome);
  return json({ ok: true, kind: 'assessment', code: a.id, learner: fullName(a), pathway: pw ? pw.name : a.pathway, module: m ? m.label : a.module, type: kind ? kind.label : a.kind, outcome: outcome ? outcome.label : a.outcome, outcomeId: a.outcome, assessedOn: a.assessed_on, assessor: a.supervisor_name, role: a.supervisor_role, accreditation: a.accreditation, method: a.method, handSigned: !!a.signature, scans: JSON.parse(a.entry_ids || '[]').length });
}

export async function deleteSupervision(env, l) {
  return [
    env.DB.prepare('DELETE FROM assessments WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM supervisor_links WHERE learner_id = ?').bind(l.id),
    env.DB.prepare("UPDATE supervisor_links SET status = 'ended', ended_at = datetime('now'), supervisor_id = NULL WHERE supervisor_id = ?").bind(l.id),
    env.DB.prepare('UPDATE signoffs SET supervisor_id = NULL WHERE supervisor_id = ?').bind(l.id),
    env.DB.prepare('UPDATE assessments SET supervisor_id = NULL WHERE supervisor_id = ?').bind(l.id),
  ];
}
