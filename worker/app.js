// Wavelength app API: password accounts, logbook sync and supervisor sign-off.
// Routes (all under /api/app/, run_worker_first covers /api/*):
//   POST signup, login, logout, profile, sync, signoff/request, signoff/complete, signoff/inperson,
//        reset/request, reset/complete, account/delete (signoff/complete emails the learner unless profile.notifyEmail is false)
//        evidence, evidence/withdraw
//        assessment/request, assessment/inperson, assessment/cancel, assessment/complete (link), supervisors/add|remove|accept,
//        supervise/signoff, supervise/assessment, supervise/assessment/new (see supervise.js)
//   GET  assessments, supervisors, supervise/learner?id=, supervise/signoff?code=, assessment/view?t=
//   GET  me, sync?since=, signoffs, evidence, signoff/view?t=, verify?code= (SO- sign-offs and EV- evidence summaries)
//   POST signoff/image?code=&entry=&n= (encrypted bytes), signoff/images (manifest)   GET signoff/image?t=&entry=&n=
//   POST email/verify (public, token), email/resend, supervisors/accept-invite   (worker/email-verify.js)
//   GET  professional   POST professional/registration|credential|evidence|withdraw|directory   GET directory (public,
//        off until DIRECTORY_PUBLIC = "true")   (worker/professional.js, docs/verification-architecture.md)
// Logbook entries hold text only. Images stay on the learner's device. The one exception is encrypted image
// sharing in sign-off links (IMAGE_SHARE = "true"): the phone encrypts with AES-GCM and keeps the key in the link's
// #fragment, so this Worker stores only ciphertext in KV (SHARED_IMAGES), deleted on sign-off, cancel, account
// deletion or after 14 days. See the DPIA before changing any of this.
import { passwordProblem } from './password.js';
import { isNativeOrigin } from './native.js';
import { zohoSubscribe } from './newsletter.js';
import { cookieFor, clearCookie, learner, sendMail, revokeSessions } from './academy.js';
import DATA from './academy-data.json';
import { createEvidence, listEvidence, withdrawEvidence, verifyEvidence } from './evidence.js';
import * as SV from './supervise.js';
import { emailVerifyOn, sendVerification, issueToken, sendTokenEmail, resend as resendEmail, verifyToken, newNonce } from './email-verify.js';
import { handleProfessional, directorySearch, deleteProfessional, snapshotFor, publicSnapshot, entrySnapshot, professionalOn } from './professional.js';

import { enc, SITE, HEAD, json, clip, EMAIL, TITLES, PATHWAYS, b64u, pbkdf2, hashPassword, checkPassword, sha256, token, code, SIGNED_FIELDS, contentHash, body, fullName, profileOf, cleanProfile, account, verificationReady, sigKind, withSigKind, splitSigKind } from './app-util.js';

// ---------- Accounts ----------
async function signup(env, req, ctx) {
  const d = await body(req);
  if (!d) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 400);
  if (d.wl_trap) return json({ ok: true, trap: true }); // honeypot: hidden from people and from browser autofill
  const p = { title: TITLES.includes(clip(d.title, 10)) ? clip(d.title, 10) : '', first: clip(d.firstName, 80), last: clip(d.lastName, 80), email: clip(d.email, 160).toLowerCase(), role: clip(d.role, 80), org: clip(d.organisation, 160), news: d.newsletter ? 1 : 0 };
  const pw = String(d.password || '');
  if (!p.first || !p.last) return json({ ok: false, error: 'Enter your first and last name.' }, 400);
  if (!EMAIL.test(p.email)) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  const weak = passwordProblem(pw);
  if (weak) return json({ ok: false, error: weak }, 400);
  if (!d.terms) return json({ ok: false, error: 'Tick the box to accept the privacy notice and terms of use.' }, 400);
  const existing = await env.DB.prepare('SELECT id, password_hash FROM learners WHERE email = ?').bind(p.email).first();
  if (existing && existing.password_hash) return json({ ok: false, error: 'An account with this email already exists. Log in instead, or reset your password.', exists: true }, 409);
  // The store apps cannot post the website's newsletter form, so they ask the server to subscribe. Zoho still sends
  // its own confirmation email (double opt-in) before adding anyone, so nobody joins by having their address typed.
  if (p.news && req.headers.get('X-Wavelength-Client') === 'app') {
    const sub = zohoSubscribe(env, { email: p.email, first: p.first, role: p.role, source: 'App sign-up' }).catch(() => false);
    if (ctx && ctx.waitUntil) ctx.waitUntil(sub); else await sub;
  }
  const hash = await hashPassword(pw);
  const profile = JSON.stringify(cleanProfile({ pathways: [] }));
  const verifying = await emailVerifyOn(env);
  if (existing && verifying) {
    // An Academy learner (email only) is adding a password. Nobody may take over an existing account (and its
    // certificates) by typing its email address: the password is held with a single-use link sent to that address,
    // and is set only when the link is opened. The answer is the same whether or not an email went out.
    const nonce = await newNonce();
    const t = await issueToken(env, { id: existing.id, email: p.email }, 'claim', { hash, title: p.title, first: p.first, last: p.last, role: p.role, org: p.org, news: p.news, profile, nonce: nonce.hash });
    if (t) {
      const l = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(existing.id).first();
      const mail = sendTokenEmail(env, { ...l, first_name: p.first, last_name: p.last, title: p.title }, t, 'claim');
      if (ctx && ctx.waitUntil) ctx.waitUntil(mail); else await mail;
    }
    return json({ ok: true, checkEmail: true }, 202, { 'Set-Cookie': nonce.cookie });
  }
  if (existing) {
    // An Academy learner (email only) is upgrading to a password account. Only when email verification is off
    // (no ZEPTOMAIL_TOKEN, migration 0011 not applied, or EMAIL_VERIFY = "off"): the behaviour before verification.
    await env.DB.prepare("UPDATE learners SET password_hash = ?, title = ?, first_name = ?, last_name = ?, role = COALESCE(NULLIF(?, ''), role), organisation = COALESCE(NULLIF(?, ''), organisation), newsletter = MAX(newsletter, ?), profile = COALESCE(profile, ?), last_seen = datetime('now') WHERE id = ?")
      .bind(hash, p.title, p.first, p.last, p.role, p.org, p.news, profile, existing.id).run();
  } else if (await verificationReady(env)) {
    // A new account works at once (the logbook is offline-first), marked unverified until the emailed link is used.
    await env.DB.prepare("INSERT INTO learners (email, title, first_name, last_name, role, organisation, newsletter, password_hash, profile, last_seen, email_status) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),'unverified')")
      .bind(p.email, p.title, p.first, p.last, p.role, p.org, p.news, hash, profile).run();
  } else {
    await env.DB.prepare("INSERT INTO learners (email, title, first_name, last_name, role, organisation, newsletter, password_hash, profile, last_seen) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))")
      .bind(p.email, p.title, p.first, p.last, p.role, p.org, p.news, hash, profile).run();
  }
  const row = await env.DB.prepare('SELECT * FROM learners WHERE email = ?').bind(p.email).first();
  // Sent before answering, so the person can be told it is on its way.
  if (verifying && !existing) await sendVerification(env, row, 'verify').catch(() => false);
  return json({ ok: true, account: account(row), verifyEmailSent: verifying && !existing }, 200, { 'Set-Cookie': await cookieFor(env, row.id) });
}

async function login(env, req) {
  const d = await body(req);
  if (!d) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 400);
  const email = clip(d.email, 160).toLowerCase();
  const fail = () => json({ ok: false, error: 'That email and password do not match.' }, 401);
  const row = await env.DB.prepare('SELECT * FROM learners WHERE email = ?').bind(email).first();
  if (!row) { await pbkdf2('x', new Uint8Array(16), 100000); return fail(); }
  if (!row.password_hash) return json({ ok: false, error: 'This email is registered for Academy modules but has no password yet. Create your account with the same email to add one.', noPassword: true }, 401);
  if (row.locked_until && row.locked_until > Date.now()) return json({ ok: false, error: 'Too many attempts. Wait 15 minutes, or reset your password.' }, 429);
  if (!(await checkPassword(String(d.password || ''), row.password_hash))) {
    const n = (row.failed_logins || 0) + 1;
    await env.DB.prepare('UPDATE learners SET failed_logins = ?, locked_until = ? WHERE id = ?').bind(n >= 8 ? 0 : n, n >= 8 ? Date.now() + 15 * 60e3 : null, row.id).run();
    return fail();
  }
  await env.DB.prepare("UPDATE learners SET failed_logins = 0, locked_until = NULL, last_seen = datetime('now') WHERE id = ?").bind(row.id).run();
  return json({ ok: true, account: account(row) }, 200, { 'Set-Cookie': await cookieFor(env, row.id) });
}

async function me(env, l) {
  const [certs, attempts] = await Promise.all([
    env.DB.prepare('SELECT code, module, module_title, issued_on, cpd_hours FROM certificates WHERE learner_id = ? ORDER BY created_at DESC').bind(l.id).all(),
    env.DB.prepare('SELECT module, MAX(score) AS best, COUNT(*) AS tries FROM attempts WHERE learner_id = ? GROUP BY module').bind(l.id).all(),
  ]);
  const modules = Object.values(DATA.modules).filter((m) => !m.draft).map((m) => ({ slug: m.slug, title: m.title, cpdHours: m.cpdHours }));
  return json({ ok: true, account: account(l), certificates: certs.results || [], attempts: attempts.results || [], modules, imageShare: imgOn(env), clipShare: imgOn(env) && env.CLIP_SHARE === 'true', verification: { email: await emailVerifyOn(env), professional: professionalOn(env) && (await verificationReady(env)), directory: env.DIRECTORY_PUBLIC === 'true' } });
}

async function saveProfile(env, l, req) {
  const d = await body(req);
  if (!d) return json({ ok: false }, 400);
  const p = cleanProfile(d.profile || {}, profileOf(l));
  const sets = ['profile = ?'], vals = [JSON.stringify(p)];
  if (d.declaration) { sets.push("declaration_at = COALESCE(declaration_at, datetime('now'))"); }
  if (d.firstName) { sets.push('first_name = ?'); vals.push(clip(d.firstName, 80)); }
  if (d.lastName) { sets.push('last_name = ?'); vals.push(clip(d.lastName, 80)); }
  if (d.title !== undefined) { sets.push('title = ?'); vals.push(TITLES.includes(clip(d.title, 10)) ? clip(d.title, 10) : ''); }
  if (d.role !== undefined) { sets.push('role = ?'); vals.push(clip(d.role, 80)); }
  if (d.organisation !== undefined) { sets.push('organisation = ?'); vals.push(clip(d.organisation, 160)); }
  await env.DB.prepare(`UPDATE learners SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, l.id).run();
  const row = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(l.id).first();
  return json({ ok: true, account: account(row) });
}

async function changePassword(env, l, req) {
  const d = await body(req);
  if (!d || !(await checkPassword(String(d.current || ''), l.password_hash))) return json({ ok: false, error: 'Your current password is not right.' }, 400);
  const pw = String(d.password || '');
  { const weak = passwordProblem(pw); if (weak) return json({ ok: false, error: weak }, 400); }
  await env.DB.prepare('UPDATE learners SET password_hash = ? WHERE id = ?').bind(await hashPassword(pw), l.id).run();
  // Log out every other device, then give this one a fresh cookie.
  await revokeSessions(env, l.id);
  return json({ ok: true }, 200, { 'Set-Cookie': await cookieFor(env, l.id) });
}

async function resetRequest(env, req, ctx) {
  const d = await body(req);
  const email = clip(d && d.email, 160).toLowerCase();
  const out = json({ ok: true, emailOn: !!env.ZEPTOMAIL_TOKEN });
  if (!EMAIL.test(email)) return out;
  const row = await env.DB.prepare('SELECT * FROM learners WHERE email = ? AND password_hash IS NOT NULL').bind(email).first();
  if (!row || !env.ZEPTOMAIL_TOKEN) return out;
  // One reset email per account every five minutes, so the form cannot be used to flood someone's inbox.
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE learner_id = ? AND used = 0 AND expires_at > ?').bind(row.id, Date.now() + 3300e3).first();
  if (recent && recent.n) return out;
  const t = token();
  await env.DB.prepare('INSERT INTO password_resets (token_hash, learner_id, expires_at) VALUES (?,?,?)').bind(await sha256(t), row.id, Date.now() + 3600e3).run();
  const link = `${SITE}/app/?reset=${t}`;
  ctx.waitUntil(sendMail(env, {
    to: row.email, toName: fullName(row), subject: 'Reset your Wavelength password',
    heading: 'Reset your password',
    paragraphs: [`Hello ${row.first_name},`, 'Someone asked to reset the password for your Wavelength account. If it was you, use the button below within one hour. If not, ignore this email and your password stays the same.'],
    button: { href: link, label: 'Choose a new password' },
    text: `Hello ${row.first_name},\n\nReset your Wavelength password within one hour:\n${link}\n\nIf you did not ask for this, ignore this email.`,
  }));
  return out;
}

async function resetComplete(env, req) {
  const d = await body(req);
  if (!d) return json({ ok: false }, 400);
  const pw = String(d.password || '');
  { const weak = passwordProblem(pw); if (weak) return json({ ok: false, error: weak }, 400); }
  const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(await sha256(clip(d.token, 100))).first();
  if (!row || row.used || row.expires_at < Date.now()) return json({ ok: false, error: 'This reset link has expired. Ask for a new one.' }, 400);
  const hash = await hashPassword(pw);
  // Claim the token atomically so two submissions of the same link cannot both succeed.
  const claim = await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ? AND used = 0').bind(row.token_hash).run();
  if (!(claim.meta && claim.meta.changes)) return json({ ok: false, error: 'This reset link has expired. Ask for a new one.' }, 400);
  await env.DB.batch([
    env.DB.prepare('UPDATE password_resets SET used = 1 WHERE learner_id = ?').bind(row.learner_id),
    env.DB.prepare('UPDATE learners SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(hash, row.learner_id),
  ]);
  // Whoever knew the old password is logged out everywhere.
  await revokeSessions(env, row.learner_id);
  // The reset link was delivered to this address, so the email is now proven too.
  if (await verificationReady(env)) await env.DB.prepare("UPDATE learners SET email_status = 'verified', email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?").bind(row.learner_id).run();
  const l = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(row.learner_id).first();
  return json({ ok: true, account: account(l) }, 200, { 'Set-Cookie': await cookieFor(env, l.id) });
}

async function deleteAccount(env, l, req) {
  const d = await body(req);
  if (!d || !(await checkPassword(String(d.password || ''), l.password_hash))) return json({ ok: false, error: 'Your password is not right.' }, 400);
  const hasCerts = await env.DB.prepare('SELECT COUNT(*) AS n FROM certificates WHERE learner_id = ?').bind(l.id).first();
  const { results: open = [] } = await env.DB.prepare("SELECT id FROM signoffs WHERE learner_id = ? AND status = 'pending'").bind(l.id).all();
  for (const so of open) await deleteSharedImages(env, so.id);
  const stmts = [
    env.DB.prepare('DELETE FROM logbook_entries WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM signoffs WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM evidence_summaries WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM password_resets WHERE learner_id = ?').bind(l.id),
    ...(await SV.deleteSupervision(env, l)),
    ...((await verificationReady(env)) ? deleteProfessional(env, l) : []),
  ];
  if (d.keepCertificates && hasCerts.n) stmts.push(env.DB.prepare('UPDATE learners SET password_hash = NULL, profile = NULL, declaration_at = NULL, organisation = NULL, role = NULL WHERE id = ?').bind(l.id));
  else stmts.push(env.DB.prepare('DELETE FROM attempts WHERE learner_id = ?').bind(l.id), env.DB.prepare('DELETE FROM certificates WHERE learner_id = ?').bind(l.id), env.DB.prepare('DELETE FROM learners WHERE id = ?').bind(l.id));
  await env.DB.batch(stmts);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
}

// ---------- Logbook sync ----------
const ID = /^[A-Za-z0-9_-]{8,40}$/;
function cleanEntry(e) {
  if (!e || typeof e !== 'object' || !ID.test(String(e.id || ''))) return null;
  const d = { ...e };
  delete d.signoff; delete d.signoffVoid;
  d.type = clip(d.type, 20);
  d.date = /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null;
  if (!d.type || !d.date) return null;
  if (Array.isArray(d.images)) d.images = d.images.slice(0, 12).map((i) => ({ id: clip(i && i.id, 40), w: Number(i && i.w) || 0, h: Number(i && i.h) || 0, declared: !!(i && i.declared) }));
  const text = JSON.stringify(d);
  if (text.length > 20000) return null;
  return d;
}

const SYNC_PAGE = 500;
// A write that was in flight while this query ran (a supervisor's sign-off, another device) can carry an updated_at
// slightly before the query, and clocks differ a little between Cloudflare machines. The cursor handed back
// therefore trails the query by a minute, so the next pull re-reads that minute instead of missing a change.
const SYNC_OVERLAP = 60e3;
const entryOut = (r) => (r.deleted ? { id: r.id, deleted: true, updatedAt: r.updated_at } : { ...JSON.parse(r.data), id: r.id, updatedAt: r.updated_at });
async function syncGet(env, l, url) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const after = url.searchParams.get('after') || '';
  const start = Date.now();
  // Keyset paging on (updated_at, id), so entries sharing one timestamp are never split or skipped between pages.
  const q = ID.test(after)
    ? env.DB.prepare('SELECT id, data, updated_at, deleted FROM logbook_entries WHERE learner_id = ? AND (updated_at > ? OR (updated_at = ? AND id > ?)) ORDER BY updated_at, id LIMIT ?').bind(l.id, since, since, after, SYNC_PAGE)
    : env.DB.prepare('SELECT id, data, updated_at, deleted FROM logbook_entries WHERE learner_id = ? AND updated_at > ? ORDER BY updated_at, id LIMIT ?').bind(l.id, since, SYNC_PAGE);
  const { results = [] } = await q.all();
  const more = results.length === SYNC_PAGE;
  const last = results[results.length - 1];
  // `now` is the cursor for the next pull (older app versions read only this field).
  const now = more ? last.updated_at : Math.max(since, start - SYNC_OVERLAP);
  return json({ ok: true, now, after: more ? last.id : '', more, entries: results.map(entryOut) });
}

async function syncPost(env, l, req) {
  const d = await body(req);
  if (!d || !Array.isArray(d.entries)) return json({ ok: false, error: 'Nothing to save.' }, 400);
  const incoming = d.entries.slice(0, 200);
  const now = Date.now();
  const saved = [];
  for (const raw of incoming) {
    const id = String(raw && raw.id || '');
    if (!ID.test(id)) continue;
    const ex = await env.DB.prepare('SELECT * FROM logbook_entries WHERE id = ?').bind(id).first();
    if (ex && ex.learner_id !== l.id) continue;
    // updatedAt is the server time of the copy the client edited. Missing means a new entry; 0 means a restored backup.
    const clientTime = raw.updatedAt == null ? now : Number(raw.updatedAt) || 0;
    if (ex && ex.updated_at > clientTime && !raw.force) { saved.push({ id, conflict: true, server: entryOut(ex) }); continue; }
    if (raw.deleted) {
      if (ex) await env.DB.prepare('UPDATE logbook_entries SET deleted = 1, data = ?, updated_at = ? WHERE id = ?').bind('{}', now, id).run();
      else await env.DB.prepare('INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at, deleted) VALUES (?,?,?,?,?,?,1)').bind(id, l.id, '', '', '{}', now).run();
      saved.push({ id, deleted: true, updatedAt: now });
      continue;
    }
    const e = cleanEntry(raw);
    if (!e) continue;
    delete e.updatedAt; delete e.force;
    // Keep a supervisor's sign-off only while the signed content is unchanged.
    if (ex) {
      const old = JSON.parse(ex.data || '{}');
      if (old.signoff) {
        if ((await contentHash(e)) === old.signoff.hash) e.signoff = old.signoff;
        else e.signoffVoid = { name: old.signoff.name, at: new Date(now).toISOString() };
      } else if (old.signoffVoid) e.signoffVoid = old.signoffVoid;
    }
    const text = JSON.stringify(e);
    if (ex) await env.DB.prepare('UPDATE logbook_entries SET scan_type = ?, scan_date = ?, data = ?, updated_at = ?, deleted = 0 WHERE id = ?').bind(e.type, e.date, text, now, id).run();
    else await env.DB.prepare('INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at) VALUES (?,?,?,?,?,?)').bind(id, l.id, e.type, e.date, text, now).run();
    saved.push({ ...e, updatedAt: now });
  }
  return json({ ok: true, now, saved });
}

// ---------- Supervisor sign-off ----------
async function entriesFor(env, l, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => ID.test(x)).slice(0, 100);
  if (!list.length) return [];
  const { results = [] } = await env.DB.prepare(`SELECT id, data FROM logbook_entries WHERE learner_id = ? AND deleted = 0 AND id IN (${list.map(() => '?').join(',')})`).bind(l.id, ...list).all();
  return results.map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
}
function snapshotOf(entries) {
  return entries.map((e) => { const s = { id: e.id }; for (const k of SIGNED_FIELDS) s[k] = e[k] == null ? null : e[k]; s.imageCount = (e.images || []).length; return s; });
}
function cleanSupervisor(d) {
  return { name: clip(d.name, 120), role: clip(d.role, 120), reg: clip(d.registration, 40), email: clip(d.email, 160).toLowerCase(), accreditation: clip(d.accreditation, 120), basis: ['witnessed', 'reviewed', 'both'].includes(d.basis) ? d.basis : null, comment: clip(d.comment, 2000), signatureKind: sigKind(d) };
}
const RATING = ['g', 'a', 'r'];
function cleanRating(r) { if (!r || typeof r !== 'object') return null; const o = {}; for (const k of ['image', 'accuracy']) if (RATING.includes(r[k])) o[k] = r[k]; return Object.keys(o).length ? o : null; }
async function applySignoff(env, so, decisions, sup, method, ratings = {}, snap = null) {
  const at = new Date().toISOString();
  const now = Date.now();
  for (const e of JSON.parse(so.snapshot)) {
    const status = decisions[e.id] === 'confirmed' ? 'confirmed' : decisions[e.id] === 'query' ? 'query' : null;
    if (!status) continue;
    const row = await env.DB.prepare('SELECT data FROM logbook_entries WHERE id = ? AND learner_id = ? AND deleted = 0').bind(e.id, so.learner_id).first();
    if (!row) continue;
    const data = JSON.parse(row.data);
    const hash = await contentHash(data);
    if (hash !== (await contentHash(e))) continue; // edited since the request: skip
    data.signoff = { code: so.id, status, name: sup.name, role: sup.role, reg: sup.reg, accreditation: sup.accreditation, basis: sup.basis, method, at, hash, signatureKind: sup.signatureKind || 'drawn' };
    const rt = cleanRating((ratings || {})[e.id]); if (rt) data.signoff.rating = rt;
    // What Wavelength had verified about the signer at this moment. Server-owned like the rest of signoff.
    const vs = entrySnapshot(snap); if (vs) data.signoff.verification = vs;
    delete data.signoffVoid;
    await env.DB.prepare('UPDATE logbook_entries SET data = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(data), now, e.id).run();
  }
}

async function signoffRequest(env, l, req) {
  const d = await body(req);
  const entries = await entriesFor(env, l, d && d.entryIds);
  if (!entries.length) return json({ ok: false, error: 'Choose at least one saved entry.' }, 400);
  const t = token();
  const id = code('SO');
  const link = d.supervisorLink ? await env.DB.prepare("SELECT supervisor_id FROM supervisor_links WHERE id = ? AND learner_id = ? AND status = 'active'").bind(Number(d.supervisorLink), l.id).first() : null;
  await env.DB.prepare('INSERT INTO signoffs (id, learner_id, method, token_hash, entry_ids, snapshot, expires_at, supervisor_name, supervisor_email, supervisor_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, l.id, 'remote', await sha256(t), JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snapshotOf(entries)), Date.now() + 14 * 864e5, clip(d.supervisorName, 120), clip(d.supervisorEmail, 160).toLowerCase(), link ? link.supervisor_id : null).run();
  return json({ ok: true, code: id, link: `${new URL(req.url).origin}/app/sign/#${t}`, expires: 14, toDashboard: !!link });
}

async function signoffView(env, url) {
  const t = clip(url.searchParams.get('t'), 100);
  const so = t && await env.DB.prepare('SELECT s.*, l.title, l.first_name, l.last_name FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.token_hash = ?').bind(await sha256(t)).first();
  if (!so) return json({ ok: false, error: 'This sign-off link is not valid. Ask the learner to send a new one.' }, 404);
  if (so.status !== 'pending') return json({ ok: false, done: true, error: `This request was signed by ${so.supervisor_name} on ${String(so.signed_at).slice(0, 10)}.` }, 410);
  if (so.expires_at < Date.now()) return json({ ok: false, error: 'This sign-off link has expired. Ask the learner to send a new one.' }, 410);
  const images = imgOn(env) ? (await env.SHARED_IMAGES.get(`so:${so.id}:m`, 'json')) || [] : [];
  return json({ ok: true, code: so.id, learner: fullName(so), supervisorName: so.supervisor_name, entries: JSON.parse(so.snapshot), images });
}

async function signoffComplete(env, req, ctx) {
  const d = await body(req);
  if (!d) return json({ ok: false }, 400);
  const so = await env.DB.prepare('SELECT * FROM signoffs WHERE token_hash = ?').bind(await sha256(clip(d.token, 100))).first();
  if (!so || so.status !== 'pending' || so.expires_at < Date.now()) return json({ ok: false, error: 'This sign-off link is no longer valid.' }, 410);
  const sup = cleanSupervisor(d);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  const sig = String(d.signature || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box with your finger or mouse.' }, 400);
  const decisions = d.decisions && typeof d.decisions === 'object' ? d.decisions : {};
  const ratings = d.ratings && typeof d.ratings === 'object' ? d.ratings : {};
  // Whoever holds a link signs as themselves: the snapshot records the details as declared, not verified.
  const snap = await snapshotFor(env, { entries: JSON.parse(so.snapshot), declared: sup, method: 'remote' });
  const done = await env.DB.prepare(`UPDATE signoffs SET status = 'signed', supervisor_name = ?, supervisor_role = ?, supervisor_reg = ?, supervisor_email = COALESCE(NULLIF(?, ''), supervisor_email), accreditation = ?, basis = ?, comment = ?, decisions = ?, ratings = ?, signature = ?, signed_at = datetime('now'), token_hash = NULL${snap ? ', supervisor_snapshot = ?' : ''} WHERE id = ? AND status = 'pending'`)
    .bind(sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sup.basis, sup.comment, JSON.stringify(decisions), JSON.stringify(withSigKind(ratings, sup.signatureKind)), sig, ...(snap ? [JSON.stringify(snap)] : []), so.id).run();
  // A double tap or a second tab: only the first submission signs.
  if (!(done.meta && done.meta.changes)) return json({ ok: false, error: 'This sign-off link is no longer valid.' }, 410);
  await applySignoff(env, so, decisions, sup, 'remote', ratings, snap);
  await deleteSharedImages(env, so.id);
  const mail = notifyLearner(env, so, decisions, sup);
  if (ctx && ctx.waitUntil) ctx.waitUntil(mail); else await mail;
  return json({ ok: true, code: so.id });
}

// Tells the learner by email when a supervisor completes a sign-off link or signs from their dashboard. Counts and
// the code only, never findings. Learners turn this off in the app (profile.notifyEmail = false).
export async function notifyLearner(env, so, decisions, sup) {
  try {
    const l = await env.DB.prepare('SELECT email, title, first_name, last_name, profile FROM learners WHERE id = ?').bind(so.learner_id).first();
    if (!l || !l.email || profileOf(l).notifyEmail === false) return;
    const ids = JSON.parse(so.entry_ids || '[]');
    const ok = ids.filter((id) => decisions[id] === 'confirmed').length;
    const q = ids.filter((id) => decisions[id] === 'query').length;
    if (!ok && !q) return;
    const n = (k) => `${k} ${k === 1 ? 'scan' : 'scans'}`;
    const what = [ok ? `signed off ${n(ok)}` : '', q ? `queried ${n(q)}` : ''].filter(Boolean).join(' and ');
    const link = `${SITE}/app/#/log?s=${q ? 'todo' : 'signed'}`;
    const lines = [`Hello ${l.first_name},`, `${sup.name} ${what} in your Wavelength logbook.`, q ? 'Open the app to read the query, update the scan and send it again.' : 'Open the app to see the scans, now marked green.', `Sign-off code: ${so.id}. Anyone can check it at thewavelength.co.uk/verify.`];
    await sendMail(env, {
      to: l.email, toName: fullName(l), subject: q && !ok ? 'Your supervisor queried a scan' : 'Your scans have been signed off',
      heading: q && !ok ? 'Scan queried' : 'Sign-off received',
      paragraphs: lines.concat('To stop these emails, untick the setting under Me, Settings, in the app.'),
      button: { href: link, label: 'Open your logbook' },
      text: lines.join('\n\n') + `\n\n${link}\n\nTo stop these emails, untick the setting under Me, Settings, in the app.`,
    });
  } catch { /* email is a courtesy: never fail the sign-off */ }
}

async function signoffInPerson(env, l, req) {
  const d = await body(req);
  const entries = await entriesFor(env, l, d && d.entryIds);
  if (!entries.length) return json({ ok: false, error: 'Choose at least one saved entry.' }, 400);
  const sup = cleanSupervisor(d);
  const sig = String(d.signature || '');
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'The supervisor needs to enter their name and role and tick the confirmation.' }, 400);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Ask your supervisor to sign in the box.' }, 400);
  const id = code('SO');
  const decisions = Object.fromEntries(entries.map((e) => [e.id, (d.decisions || {})[e.id] === 'query' ? 'query' : 'confirmed']));
  const so = { id, learner_id: l.id, snapshot: JSON.stringify(snapshotOf(entries)) };
  const ratings = d.ratings && typeof d.ratings === 'object' ? d.ratings : {};
  // Signed on the learner's own phone: the signer's details are declared, not verified.
  const snap = await snapshotFor(env, { entries, declared: sup, method: 'in-person' });
  await env.DB.prepare(`INSERT INTO signoffs (id, learner_id, method, entry_ids, snapshot, status, supervisor_name, supervisor_role, supervisor_reg, supervisor_email, accreditation, basis, comment, decisions, ratings, signature, signed_at${snap ? ', supervisor_snapshot' : ''}) VALUES (?,?,?,?,?,'signed',?,?,?,?,?,?,?,?,?,?,datetime('now')${snap ? ',?' : ''})`)
    .bind(id, l.id, 'in-person', JSON.stringify(entries.map((e) => e.id)), so.snapshot, sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sup.basis, sup.comment, JSON.stringify(decisions), JSON.stringify(withSigKind(ratings, sup.signatureKind)), sig, ...(snap ? [JSON.stringify(snap)] : [])).run();
  await applySignoff(env, so, decisions, sup, 'in-person', ratings, snap);
  return json({ ok: true, code: id });
}

async function signoffList(env, l) {
  const { results = [] } = await env.DB.prepare('SELECT id, method, status, created_at, expires_at, supervisor_name, supervisor_role, supervisor_reg, accreditation, basis, comment, decisions, ratings, signature, signed_at, entry_ids, supervisor_id FROM signoffs WHERE learner_id = ? ORDER BY created_at DESC LIMIT 300').bind(l.id).all();
  return json({ ok: true, signoffs: results.map((r) => ({ ...r, entry_ids: JSON.parse(r.entry_ids || '[]'), decisions: JSON.parse(r.decisions || '{}'), ...splitSigKind(r.ratings) })) });
}

async function signoffCancel(env, l, req) {
  const d = await body(req);
  const c = clip(d && d.code, 20);
  const r = await env.DB.prepare("UPDATE signoffs SET status = 'cancelled', token_hash = NULL WHERE id = ? AND learner_id = ? AND status = 'pending'").bind(c, l.id).run();
  if (r.meta && r.meta.changes) await deleteSharedImages(env, c);
  return json({ ok: true });
}

// ---------- Encrypted image sharing in sign-off links ----------
const imgOn = (env) => env.IMAGE_SHARE === 'true' && !!env.SHARED_IMAGES;
const IMG_MAX = 1572864, CLIP_MAX = 12 * 1048576 + 64, IMG_PER_ENTRY = 12, IMG_PER_LINK = 60;
const clipOn = (env) => imgOn(env) && env.CLIP_SHARE === 'true';
const imgKey = (id, entry, n) => `so:${id}:${entry}:${n}`;
async function ownPending(env, l, c) {
  const so = await env.DB.prepare("SELECT id, entry_ids, expires_at, status FROM signoffs WHERE id = ? AND learner_id = ? AND method = 'remote'").bind(clip(c, 20), l.id).first();
  return so && so.status === 'pending' && so.expires_at > Date.now() + 120000 ? so : null;
}
async function signoffImageUpload(env, l, req, url) {
  if (!imgOn(env)) return json({ ok: false, error: 'Image sharing is not switched on yet.' }, 404);
  const so = await ownPending(env, l, url.searchParams.get('code'));
  if (!so) return json({ ok: false, error: 'This sign-off request is no longer open.' }, 410);
  const entry = clip(url.searchParams.get('entry'), 40), n = Number(url.searchParams.get('n'));
  if (!JSON.parse(so.entry_ids).includes(entry) || !Number.isInteger(n) || n < 0 || n >= IMG_PER_ENTRY) return json({ ok: false, error: 'That image does not belong to this request.' }, 400);
  const asClip = url.searchParams.get('kind') === 'clip';
  if (asClip && !clipOn(env)) return json({ ok: false, error: 'Clip sharing is not switched on yet. Untick the clips, or share stills only.' }, 403);
  const max = asClip ? CLIP_MAX : IMG_MAX;
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) return json({ ok: false, error: 'Image too large.' }, 413);
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 29 || buf.byteLength > max) return json({ ok: false, error: 'Image too large or empty.' }, 413);
  await env.SHARED_IMAGES.put(imgKey(so.id, entry, n), buf, { expiration: Math.floor(so.expires_at / 1000) });
  return json({ ok: true });
}
async function signoffImagesCommit(env, l, req) {
  if (!imgOn(env)) return json({ ok: false, error: 'Image sharing is not switched on yet.' }, 404);
  const d = await body(req);
  const so = d && await ownPending(env, l, d.code);
  if (!so) return json({ ok: false, error: 'This sign-off request is no longer open.' }, 410);
  if (!d.declared) return json({ ok: false, error: 'Confirm that no identifiers remain on the images.' }, 400);
  const ids = JSON.parse(so.entry_ids), seen = new Set();
  const list = (Array.isArray(d.images) ? d.images : []).slice(0, IMG_PER_LINK).map((i) => ({ entry: clip(i && i.entry, 40), n: Number(i && i.n), w: Math.min(20000, Number(i && i.w) || 0), h: Math.min(20000, Number(i && i.h) || 0), kind: i && i.kind === 'clip' && clipOn(env) ? 'clip' : 'image', type: i && i.kind === 'clip' && /^video\/(mp4|webm)$/.test(i.type || '') ? i.type : 'image/jpeg' }))
    .filter((i) => ids.includes(i.entry) && Number.isInteger(i.n) && i.n >= 0 && i.n < IMG_PER_ENTRY && !seen.has(i.entry + ':' + i.n) && seen.add(i.entry + ':' + i.n));
  await env.SHARED_IMAGES.put(`so:${so.id}:m`, JSON.stringify(list), { expiration: Math.floor(so.expires_at / 1000) });
  return json({ ok: true, count: list.length });
}
async function signoffImageGet(env, url) {
  if (!imgOn(env)) return json({ ok: false }, 404);
  const t = clip(url.searchParams.get('t'), 100);
  const so = t && await env.DB.prepare('SELECT id, status, expires_at FROM signoffs WHERE token_hash = ?').bind(await sha256(t)).first();
  if (!so || so.status !== 'pending' || so.expires_at < Date.now()) return json({ ok: false }, 410);
  const buf = await env.SHARED_IMAGES.get(imgKey(so.id, clip(url.searchParams.get('entry'), 40), Number(url.searchParams.get('n'))), 'arrayBuffer');
  if (!buf) return json({ ok: false }, 404);
  return new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', ...HEAD } });
}
async function deleteSharedImages(env, id) {
  if (!env.SHARED_IMAGES || !id) return;
  const m = await env.SHARED_IMAGES.get(`so:${id}:m`, 'json');
  const keys = (Array.isArray(m) ? m : []).map((i) => imgKey(id, i.entry, i.n));
  await Promise.all([...keys, `so:${id}:m`].map((k) => env.SHARED_IMAGES.delete(k)));
}

async function verify(env, url) {
  const c = clip(url.searchParams.get('code'), 20).toUpperCase().replace(/\s+/g, '');
  if (c.startsWith('EV-')) return verifyEvidence(env, c, json);
  if (c.startsWith('AS-')) return SV.verifyAssessment(env, c);
  const ready = await verificationReady(env);
  const so = c && await env.DB.prepare(`SELECT s.id, s.method, s.supervisor_name, s.supervisor_role, s.accreditation, s.basis, s.signed_at, s.signature IS NOT NULL AS signed_by_hand, s.decisions, s.ratings, s.snapshot${ready ? ', s.supervisor_snapshot' : ''}, l.title, l.first_name, l.last_name FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.id = ? AND s.status = 'signed'`).bind(c).first();
  if (!so) return json({ ok: false, error: 'No signed record matches that code.' }, 404);
  const dec = JSON.parse(so.decisions || '{}');
  const snap = JSON.parse(so.snapshot || '[]');
  const sk = splitSigKind(so.ratings).signatureKind; // 'typed' or 'drawn': a typed name is not a hand signature
  // supervisorCheck: what Wavelength had verified about the signer when they signed (null for older sign-offs).
  return json({ ok: true, code: so.id, learner: fullName(so), supervisor: so.supervisor_name, role: so.supervisor_role, accreditation: so.accreditation, basis: so.basis, handSigned: !!so.signed_by_hand && sk !== 'typed', signatureKind: sk, method: so.method, signedAt: so.signed_at, confirmed: Object.values(dec).filter((x) => x === 'confirmed').length, entries: snap.map((e) => ({ date: e.date, type: e.type, decision: dec[e.id] || null })), supervisorCheck: publicSnapshot(so.supervisor_snapshot) });
}

// ---------- Router ----------
export async function handleApp(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\/app\//, '');
  if (!env.DB) return json({ ok: false, error: 'The app is not available right now.' }, 503);
  if (req.method === 'POST') {
    const origin = req.headers.get('Origin');
    // Same-origin pages, or the store apps (bundled logbook, Bearer token, see worker/native.js).
    if (!origin || (origin !== url.origin && !isNativeOrigin(origin))) return json({ ok: false, error: 'Forbidden' }, 403);
    if (p === 'signup') return signup(env, req, ctx);
    if (p === 'email/verify') return verifyToken(env, req);
    if (p === 'login') return login(env, req);
    if (p === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
    if (p === 'reset/request') return resetRequest(env, req, ctx);
    if (p === 'reset/complete') return resetComplete(env, req);
    if (p === 'signoff/complete') return signoffComplete(env, req, ctx);
    if (p === 'assessment/complete') return SV.assessmentComplete(env, req);
    const l = await learner(env, req);
    if (!l || !l.password_hash) return json({ ok: false, error: 'Please log in again.', auth: false }, 401);
    if (p === 'profile') return saveProfile(env, l, req);
    if (p === 'password') return changePassword(env, l, req);
    if (p === 'sync') return syncPost(env, l, req);
    if (p === 'signoff/request') return signoffRequest(env, l, req);
    if (p === 'signoff/inperson') return signoffInPerson(env, l, req);
    if (p === 'signoff/cancel') return signoffCancel(env, l, req);
    if (p === 'signoff/image') return signoffImageUpload(env, l, req, url);
    if (p === 'signoff/images') return signoffImagesCommit(env, l, req);
    if (p === 'evidence') return createEvidence(env, l, await body(req), { code, clip, fullName, profileOf, json, origin: url.origin });
    if (p === 'evidence/withdraw') return withdrawEvidence(env, l, await body(req), clip, json);
    if (p === 'account/delete') return deleteAccount(env, l, req);
    if (p === 'assessment/request') return SV.assessmentRequest(env, l, req);
    if (p === 'assessment/inperson') return SV.assessmentInPerson(env, l, req);
    if (p === 'assessment/cancel') return SV.assessmentCancel(env, l, req);
    if (p === 'supervisors/add') return SV.supervisorAdd(env, l, req, ctx);
    if (p === 'supervisors/remove') return SV.supervisorRemove(env, l, req);
    if (p === 'supervisors/accept') return SV.supervisorAccept(env, l, req);
    if (p === 'supervisors/accept-invite') return SV.supervisorAcceptInvite(env, l, req);
    if (p === 'email/resend') return resendEmail(env, l);
    if (p === 'supervise/signoff') return SV.superviseSignoffComplete(env, l, req, applySignoff, cleanSupervisor, deleteSharedImages, (so, dec, sup) => { const m = notifyLearner(env, so, dec, sup); if (ctx && ctx.waitUntil) ctx.waitUntil(m); });
    if (p === 'supervise/assessment') return SV.superviseAssessmentComplete(env, l, req);
    if (p === 'supervise/assessment/new') return SV.superviseAssessmentNew(env, l, req);
    const pro = await handleProfessional(env, l, req, url, p);
    if (pro) return pro;
    return json({ ok: false }, 404);
  }
  if (p === 'signoff/view') return signoffView(env, url);
  if (p === 'signoff/image') return signoffImageGet(env, url);
  if (p === 'verify') return verify(env, url);
  if (p === 'assessment/view') return SV.assessmentView(env, url);
  if (p === 'directory') return directorySearch(env, url);
  const l = await learner(env, req);
  if (p === 'me') return l && l.password_hash ? me(env, l) : json({ ok: false, auth: false, academy: !!l });
  if (!l || !l.password_hash) return json({ ok: false, error: 'Please log in again.', auth: false }, 401);
  if (p === 'sync') return syncGet(env, l, url);
  if (p === 'signoffs') return signoffList(env, l);
  if (p === 'evidence') return listEvidence(env, l, json);
  if (p === 'assessments') return SV.assessmentList(env, l);
  if (p === 'supervisors') return SV.supervisorLinks(env, l);
  if (p === 'supervise/learner') return SV.superviseLearner(env, l, url);
  if (p === 'supervise/signoff') return SV.superviseSignoffView(env, l, url);
  const pro = await handleProfessional(env, l, req, url, p);
  if (pro) return pro;
  return json({ ok: false }, 404);
}
