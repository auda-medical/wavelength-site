// Wavelength app API: password accounts, logbook sync and supervisor sign-off.
// Routes (all under /api/app/, run_worker_first covers /api/*):
//   POST signup, login, logout, profile, sync, signoff/request, signoff/complete, signoff/inperson,
//        reset/request, reset/complete, account/delete
//   GET  me, sync?since=, signoffs, signoff/view?t=, verify?code=
// Logbook entries hold text only. Images stay on the learner's device and never reach this Worker.
import { cookieFor, clearCookie, learner, sendMail } from './academy.js';
import DATA from './academy-data.json';

const enc = new TextEncoder();
const SITE = 'https://thewavelength.co.uk';
const HEAD = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEAD, ...extra } });
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLES = ['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx'];
const PATHWAYS = ['rcem', 'famus', 'fusic', 'general'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------- Crypto helpers ----------
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64u = (buf) => b64(buf).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
async function pbkdf2(password, salt, iterations) {
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, k, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${b64(salt)}$${await pbkdf2(password, salt, 100000)}`;
}
async function checkPassword(password, stored) {
  if (!stored) return false;
  const [, it, salt, hash] = stored.split('$');
  const got = await pbkdf2(password, unb64(salt), Number(it));
  let d = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) d |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return d === 0;
}
const sha256 = async (text) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const token = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
function code(prefix) {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

// The parts of an entry a supervisor signs. Editing any of these after sign-off voids the sign-off.
const SIGNED_FIELDS = ['type', 'date', 'setting', 'age', 'sex', 'indication', 'findings', 'overall', 'quality', 'interpretation', 'confirmation', 'concordant', 'impact', 'supervision', 'supervisor', 'reflection'];
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v == null ? null : v);
}
const contentHash = (d) => sha256(canonical(Object.fromEntries(SIGNED_FIELDS.map((k) => [k, d[k] == null ? null : d[k]]))));

// ---------- Request helpers ----------
async function body(req) {
  if (!(req.headers.get('Content-Type') || '').includes('application/json')) return null;
  const text = await req.text();
  if (text.length > 600000) return null;
  try { return JSON.parse(text); } catch { return null; }
}
const fullName = (l) => [l.title, l.first_name, l.last_name].filter(Boolean).join(' ');
function profileOf(l) { try { return JSON.parse(l.profile || '{}'); } catch { return {}; } }
function cleanProfile(p, old = {}) {
  const out = { ...old };
  if (Array.isArray(p.pathways)) out.pathways = p.pathways.filter((x) => PATHWAYS.includes(x)).slice(0, 4);
  if (p.grade !== undefined) out.grade = clip(p.grade, 80);
  if (p.specialty !== undefined) out.specialty = clip(p.specialty, 80);
  if (p.base !== undefined) out.base = clip(p.base, 120);
  if (p.registration !== undefined) out.registration = clip(p.registration, 40);
  if (p.targets && typeof p.targets === 'object') {
    out.targets = {};
    for (const [k, v] of Object.entries(p.targets).slice(0, 60)) {
      if (!/^[a-z0-9-]{1,40}$/.test(k) || !v || typeof v !== 'object') continue;
      const n = (x) => (x === '' || x == null ? null : Math.max(0, Math.min(999, Math.round(Number(x)) || 0)));
      out.targets[k] = { total: n(v.total), supervised: n(v.supervised), label: clip(v.label, 60) || undefined, types: Array.isArray(v.types) ? v.types.map((t) => clip(t, 20)).slice(0, 10) : undefined };
    }
  }
  if (p.windowStart && typeof p.windowStart === 'object') {
    out.windowStart = {};
    for (const [k, v] of Object.entries(p.windowStart).slice(0, 10)) if (PATHWAYS.includes(k) && /^\d{4}-\d{2}-\d{2}$/.test(v)) out.windowStart[k] = v;
  }
  if (p.onboarded) out.onboarded = true;
  return out;
}
function account(l) {
  const p = profileOf(l);
  return { id: l.id, email: l.email, title: l.title, firstName: l.first_name, lastName: l.last_name, name: fullName(l), role: l.role, organisation: l.organisation, newsletter: !!l.newsletter, declarationAt: l.declaration_at, profile: p };
}

// ---------- Accounts ----------
async function signup(env, req) {
  const d = await body(req);
  if (!d) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 400);
  if (d.website) return json({ ok: true });
  const p = { title: TITLES.includes(clip(d.title, 10)) ? clip(d.title, 10) : '', first: clip(d.firstName, 80), last: clip(d.lastName, 80), email: clip(d.email, 160).toLowerCase(), role: clip(d.role, 80), org: clip(d.organisation, 160), news: d.newsletter ? 1 : 0 };
  const pw = String(d.password || '');
  if (!p.first || !p.last) return json({ ok: false, error: 'Enter your first and last name.' }, 400);
  if (!EMAIL.test(p.email)) return json({ ok: false, error: 'Enter a valid email address.' }, 400);
  if (pw.length < 10 || pw.length > 200) return json({ ok: false, error: 'Choose a password of at least 10 characters.' }, 400);
  if (!d.terms) return json({ ok: false, error: 'Tick the box to accept the privacy notice and terms of use.' }, 400);
  const existing = await env.DB.prepare('SELECT id, password_hash FROM learners WHERE email = ?').bind(p.email).first();
  if (existing && existing.password_hash) return json({ ok: false, error: 'An account with this email already exists. Log in instead, or reset your password.', exists: true }, 409);
  const hash = await hashPassword(pw);
  const profile = JSON.stringify(cleanProfile({ pathways: [] }));
  if (existing) {
    // An Academy learner (email only) is upgrading to a password account.
    await env.DB.prepare("UPDATE learners SET password_hash = ?, title = ?, first_name = ?, last_name = ?, role = COALESCE(NULLIF(?, ''), role), organisation = COALESCE(NULLIF(?, ''), organisation), newsletter = MAX(newsletter, ?), profile = COALESCE(profile, ?), last_seen = datetime('now') WHERE id = ?")
      .bind(hash, p.title, p.first, p.last, p.role, p.org, p.news, profile, existing.id).run();
  } else {
    await env.DB.prepare("INSERT INTO learners (email, title, first_name, last_name, role, organisation, newsletter, password_hash, profile, last_seen) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))")
      .bind(p.email, p.title, p.first, p.last, p.role, p.org, p.news, hash, profile).run();
  }
  const row = await env.DB.prepare('SELECT * FROM learners WHERE email = ?').bind(p.email).first();
  return json({ ok: true, account: account(row) }, 200, { 'Set-Cookie': await cookieFor(env, row.id) });
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
  return json({ ok: true, account: account(l), certificates: certs.results || [], attempts: attempts.results || [], modules });
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
  if (pw.length < 10 || pw.length > 200) return json({ ok: false, error: 'Choose a password of at least 10 characters.' }, 400);
  await env.DB.prepare('UPDATE learners SET password_hash = ? WHERE id = ?').bind(await hashPassword(pw), l.id).run();
  return json({ ok: true });
}

async function resetRequest(env, req, ctx) {
  const d = await body(req);
  const email = clip(d && d.email, 160).toLowerCase();
  const out = json({ ok: true, emailOn: !!env.ZEPTOMAIL_TOKEN });
  if (!EMAIL.test(email)) return out;
  const row = await env.DB.prepare('SELECT * FROM learners WHERE email = ? AND password_hash IS NOT NULL').bind(email).first();
  if (!row || !env.ZEPTOMAIL_TOKEN) return out;
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
  if (pw.length < 10 || pw.length > 200) return json({ ok: false, error: 'Choose a password of at least 10 characters.' }, 400);
  const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(await sha256(clip(d.token, 100))).first();
  if (!row || row.used || row.expires_at < Date.now()) return json({ ok: false, error: 'This reset link has expired. Ask for a new one.' }, 400);
  await env.DB.batch([
    env.DB.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').bind(row.token_hash),
    env.DB.prepare('UPDATE learners SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(await hashPassword(pw), row.learner_id),
  ]);
  const l = await env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(row.learner_id).first();
  return json({ ok: true, account: account(l) }, 200, { 'Set-Cookie': await cookieFor(env, l.id) });
}

async function deleteAccount(env, l, req) {
  const d = await body(req);
  if (!d || !(await checkPassword(String(d.password || ''), l.password_hash))) return json({ ok: false, error: 'Your password is not right.' }, 400);
  const hasCerts = await env.DB.prepare('SELECT COUNT(*) AS n FROM certificates WHERE learner_id = ?').bind(l.id).first();
  const stmts = [
    env.DB.prepare('DELETE FROM logbook_entries WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM signoffs WHERE learner_id = ?').bind(l.id),
    env.DB.prepare('DELETE FROM password_resets WHERE learner_id = ?').bind(l.id),
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

async function syncGet(env, l, url) {
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const { results = [] } = await env.DB.prepare('SELECT id, data, updated_at, deleted FROM logbook_entries WHERE learner_id = ? AND updated_at > ? ORDER BY updated_at LIMIT 2000').bind(l.id, since).all();
  return json({ ok: true, now: Date.now(), entries: results.map((r) => (r.deleted ? { id: r.id, deleted: true, updatedAt: r.updated_at } : { ...JSON.parse(r.data), updatedAt: r.updated_at })) });
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
    const clientTime = Number(raw.updatedAt) || now;
    if (ex && ex.updated_at > clientTime && !raw.force) { saved.push({ id, conflict: true }); continue; }
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
  return { name: clip(d.name, 120), role: clip(d.role, 120), reg: clip(d.registration, 40), email: clip(d.email, 160).toLowerCase(), accreditation: clip(d.accreditation, 120), basis: ['witnessed', 'reviewed', 'both'].includes(d.basis) ? d.basis : null, comment: clip(d.comment, 2000) };
}
async function applySignoff(env, so, decisions, sup, method) {
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
    data.signoff = { code: so.id, status, name: sup.name, role: sup.role, reg: sup.reg, accreditation: sup.accreditation, basis: sup.basis, method, at, hash };
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
  await env.DB.prepare('INSERT INTO signoffs (id, learner_id, method, token_hash, entry_ids, snapshot, expires_at, supervisor_name, supervisor_email) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, l.id, 'remote', await sha256(t), JSON.stringify(entries.map((e) => e.id)), JSON.stringify(snapshotOf(entries)), Date.now() + 14 * 864e5, clip(d.supervisorName, 120), clip(d.supervisorEmail, 160).toLowerCase()).run();
  return json({ ok: true, code: id, link: `${new URL(req.url).origin}/app/sign/#${t}`, expires: 14 });
}

async function signoffView(env, url) {
  const t = clip(url.searchParams.get('t'), 100);
  const so = t && await env.DB.prepare('SELECT s.*, l.title, l.first_name, l.last_name FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.token_hash = ?').bind(await sha256(t)).first();
  if (!so) return json({ ok: false, error: 'This sign-off link is not valid. Ask the learner to send a new one.' }, 404);
  if (so.status !== 'pending') return json({ ok: false, done: true, error: `This request was signed by ${so.supervisor_name} on ${String(so.signed_at).slice(0, 10)}.` }, 410);
  if (so.expires_at < Date.now()) return json({ ok: false, error: 'This sign-off link has expired. Ask the learner to send a new one.' }, 410);
  return json({ ok: true, code: so.id, learner: fullName(so), supervisorName: so.supervisor_name, entries: JSON.parse(so.snapshot) });
}

async function signoffComplete(env, req) {
  const d = await body(req);
  if (!d) return json({ ok: false }, 400);
  const so = await env.DB.prepare('SELECT * FROM signoffs WHERE token_hash = ?').bind(await sha256(clip(d.token, 100))).first();
  if (!so || so.status !== 'pending' || so.expires_at < Date.now()) return json({ ok: false, error: 'This sign-off link is no longer valid.' }, 410);
  const sup = cleanSupervisor(d);
  if (!sup.name || !sup.role || !d.confirm) return json({ ok: false, error: 'Enter your name and role, and tick the confirmation.' }, 400);
  const sig = String(d.signature || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 120000) return json({ ok: false, error: 'Sign in the box with your finger or mouse.' }, 400);
  const decisions = d.decisions && typeof d.decisions === 'object' ? d.decisions : {};
  await env.DB.prepare("UPDATE signoffs SET status = 'signed', supervisor_name = ?, supervisor_role = ?, supervisor_reg = ?, supervisor_email = COALESCE(NULLIF(?, ''), supervisor_email), accreditation = ?, basis = ?, comment = ?, decisions = ?, signature = ?, signed_at = datetime('now'), token_hash = NULL WHERE id = ?")
    .bind(sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sup.basis, sup.comment, JSON.stringify(decisions), sig, so.id).run();
  await applySignoff(env, so, decisions, sup, 'remote');
  return json({ ok: true, code: so.id });
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
  await env.DB.prepare("INSERT INTO signoffs (id, learner_id, method, entry_ids, snapshot, status, supervisor_name, supervisor_role, supervisor_reg, supervisor_email, accreditation, basis, comment, decisions, signature, signed_at) VALUES (?,?,?,?,?,'signed',?,?,?,?,?,?,?,?,?,datetime('now'))")
    .bind(id, l.id, 'in-person', JSON.stringify(entries.map((e) => e.id)), so.snapshot, sup.name, sup.role, sup.reg, sup.email, sup.accreditation, sup.basis, sup.comment, JSON.stringify(decisions), sig).run();
  await applySignoff(env, so, decisions, sup, 'in-person');
  return json({ ok: true, code: id });
}

async function signoffList(env, l) {
  const { results = [] } = await env.DB.prepare('SELECT id, method, status, created_at, expires_at, supervisor_name, supervisor_role, supervisor_reg, accreditation, basis, comment, decisions, signature, signed_at, entry_ids FROM signoffs WHERE learner_id = ? ORDER BY created_at DESC LIMIT 300').bind(l.id).all();
  return json({ ok: true, signoffs: results.map((r) => ({ ...r, entry_ids: JSON.parse(r.entry_ids || '[]'), decisions: JSON.parse(r.decisions || '{}') })) });
}

async function signoffCancel(env, l, req) {
  const d = await body(req);
  await env.DB.prepare("UPDATE signoffs SET status = 'cancelled', token_hash = NULL WHERE id = ? AND learner_id = ? AND status = 'pending'").bind(clip(d && d.code, 20), l.id).run();
  return json({ ok: true });
}

async function verify(env, url) {
  const c = clip(url.searchParams.get('code'), 20).toUpperCase().replace(/\s+/g, '');
  const so = c && await env.DB.prepare("SELECT s.id, s.method, s.supervisor_name, s.supervisor_role, s.accreditation, s.basis, s.signed_at, s.signature IS NOT NULL AS signed_by_hand, s.decisions, s.snapshot, l.title, l.first_name, l.last_name FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.id = ? AND s.status = 'signed'").bind(c).first();
  if (!so) return json({ ok: false, error: 'No signed record matches that code.' }, 404);
  const dec = JSON.parse(so.decisions || '{}');
  const snap = JSON.parse(so.snapshot || '[]');
  return json({ ok: true, code: so.id, learner: fullName(so), supervisor: so.supervisor_name, role: so.supervisor_role, accreditation: so.accreditation, basis: so.basis, handSigned: !!so.signed_by_hand, method: so.method, signedAt: so.signed_at, confirmed: Object.values(dec).filter((x) => x === 'confirmed').length, entries: snap.map((e) => ({ date: e.date, type: e.type, decision: dec[e.id] || null })) });
}

// ---------- Router ----------
export async function handleApp(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\/app\//, '');
  if (!env.DB) return json({ ok: false, error: 'The app is not available right now.' }, 503);
  if (req.method === 'POST') {
    const origin = req.headers.get('Origin');
    if (!origin || origin !== url.origin) return json({ ok: false, error: 'Forbidden' }, 403);
    if (p === 'signup') return signup(env, req);
    if (p === 'login') return login(env, req);
    if (p === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
    if (p === 'reset/request') return resetRequest(env, req, ctx);
    if (p === 'reset/complete') return resetComplete(env, req);
    if (p === 'signoff/complete') return signoffComplete(env, req);
    const l = await learner(env, req);
    if (!l || !l.password_hash) return json({ ok: false, error: 'Please log in again.', auth: false }, 401);
    if (p === 'profile') return saveProfile(env, l, req);
    if (p === 'password') return changePassword(env, l, req);
    if (p === 'sync') return syncPost(env, l, req);
    if (p === 'signoff/request') return signoffRequest(env, l, req);
    if (p === 'signoff/inperson') return signoffInPerson(env, l, req);
    if (p === 'signoff/cancel') return signoffCancel(env, l, req);
    if (p === 'account/delete') return deleteAccount(env, l, req);
    return json({ ok: false }, 404);
  }
  if (p === 'signoff/view') return signoffView(env, url);
  if (p === 'verify') return verify(env, url);
  const l = await learner(env, req);
  if (p === 'me') return l && l.password_hash ? me(env, l) : json({ ok: false, auth: false, academy: !!l });
  if (!l || !l.password_hash) return json({ ok: false, error: 'Please log in again.', auth: false }, 401);
  if (p === 'sync') return syncGet(env, l, url);
  if (p === 'signoffs') return signoffList(env, l);
  return json({ ok: false }, 404);
}
