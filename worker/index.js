// Wavelength Worker. Static pages are served from dist/ as normal.
// This script runs first only for the paths in run_worker_first (wrangler.jsonc):
//   /volunteer/*  a hidden, password-protected volunteer sign-up area
//   /admin/*      the Wavelength admin console (volunteers, Academy, faculty, departments, newsletter, supervisors,
//                 organisations, logins), with its own login and session
//   /elearning/*, /api/*  Wavelength Academy (worker/academy.js)
import { preflight, withNative } from './native.js';
import { handleAcademy, sendCertificate } from './academy.js';
import { handleApp } from './app.js';
import { applyFaculty, facultyAdminHtml, facultyAdminPost } from './faculty.js';
import { enquireTraining, departmentsAdminHtml, departmentsAdminPost } from './departments.js';
import { zohoConnectUrl, zohoCallback, zohoSubscribe, scheduledNewsletter, newsletterAdminHtml, newsletterAdminPost } from './newsletter.js';
import { supervisorsAdminHtml, supervisorsAdminPost, evidenceFile } from './supervisors-admin.js';
import { dailyLifecycle } from './supervisor-lifecycle.js';
import { organisationsAdminHtml, organisationsAdminPost } from './organisations.js';
import { adminAccess, allowed } from './access.js';
import { runScheduled } from './cron.js';
import { legacyAdminPath, adminNav, consoleHome } from './admin-console.js';
//
// Logins live in the D1 table `settings` (volunteer_username, volunteer_hash, admin_username,
// admin_hash, session_secret, admin_session_secret). Passwords are stored as PBKDF2 hashes, never in plain text.
// The admin Logins page lets the team change both passwords.
//
// Volunteer and admin sessions are separate: different cookies, paths and signing secrets. The volunteer cookie
// (wl_vol, Path=/volunteer, signed with session_secret) never opens the console, and the admin cookie (wl_admin,
// Path=/admin, signed with admin_session_secret, created at the first admin login) is never sent to the volunteer
// area. Changing one password logs out only that side.

const SESSIONS = {
  v: { cookie: 'wl_vol', path: '/volunteer', secret: 'session_secret' },
  a: { cookie: 'wl_admin', path: '/admin', secret: 'admin_session_secret' },
};
const SESSION_HOURS = 12;
const enc = new TextEncoder();

const HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
};

function withHeaders(res, extra = {}) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...HEADERS, ...extra })) r.headers.set(k, v);
  return r;
}
const redirect = (to, extra = {}) => withHeaders(new Response(null, { status: 303, headers: { Location: to } }), extra);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let SETTINGS = null;
async function settings(env) {
  if (!SETTINGS) {
    const { results = [] } = await env.DB.prepare('SELECT key, value FROM settings').all();
    SETTINGS = Object.fromEntries(results.map((r) => [r.key, r.value]));
  }
  return SETTINGS;
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(password, salt, iterations) {
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, k, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$100000$${b64(salt)}$${await pbkdf2(password, salt, 100000)}`;
}
async function checkPassword(env, password, stored) {
  if (!stored) return false;
  const [, it, salt, hash] = stored.split('$');
  return same(env, await pbkdf2(password, unb64(salt), Number(it)), hash);
}
async function key(env, secret = 'session_secret') {
  const s = await settings(env);
  return crypto.subtle.importKey('raw', enc.encode(s[secret] || 'unset'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(env, text, secret) {
  const sig = await crypto.subtle.sign('HMAC', await key(env, secret), enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
// Compare two strings without leaking timing, by comparing their HMACs.
async function same(env, a, b) {
  const [x, y] = await Promise.all([sign(env, 'cmp:' + a), sign(env, 'cmp:' + b)]);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

// True when the request carries a valid, unexpired session of this kind ('v' volunteer, 'a' admin).
async function session(env, req, role) {
  const S = SESSIONS[role];
  if (!(await settings(env))[S.secret]) return false;
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + S.cookie + '=([^;]+)'));
  if (!m) return false;
  const [r, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (r !== role || !exp || !sig || Number(exp) < Date.now()) return false;
  return same(env, sig, await sign(env, r + '.' + exp, S.secret));
}
async function cookieFor(env, role) {
  const S = SESSIONS[role];
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const val = `${role}.${exp}.${await sign(env, role + '.' + exp, S.secret)}`;
  return `${S.cookie}=${encodeURIComponent(val)}; Path=${S.path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}
const clearCookie = (role) => `${SESSIONS[role].cookie}=; Path=${SESSIONS[role].path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const newSecret = () => b64(crypto.getRandomValues(new Uint8Array(32)));
// The admin signing secret is created at the first admin login after the console moved to /admin/.
async function ensureAdminSecret(env) {
  if ((await settings(env)).admin_session_secret) return;
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_session_secret', ?)").bind(newSecret()).run();
  SETTINGS = null;
  await settings(env);
}

const asset = async (env, req, path, status) => {
  const res = await env.ASSETS.fetch(new Request(new URL(path, req.url).toString(), { method: 'GET' }));
  return withHeaders(status ? new Response(res.body, { status, headers: res.headers }) : res);
};

const clip = (v, n) => String(v || '').trim().slice(0, n);

async function saveVolunteer(env, form) {
  const d = {
    first: clip(form.get('first_name'), 80),
    last: clip(form.get('last_name'), 80),
    email: clip(form.get('email'), 160).toLowerCase(),
    phone: clip(form.get('phone'), 40),
    status: clip(form.get('status'), 80),
    org: clip(form.get('organisation'), 160),
    year: clip(form.get('year'), 40),
    dates: form.getAll('dates').map((x) => clip(x, 80)).filter(Boolean).slice(0, 20).join('; '),
    notes: clip(form.get('notes'), 1000),
    future: form.get('future_contact') ? 1 : 0,
    news: form.get('newsletter') ? 1 : 0,
  };
  const ok = d.first && d.last && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) && form.get('confirm_age') && form.get('confirm_scan') && form.get('confirm_findings') && form.get('confirm_privacy');
  if (!ok) return false;
  await env.DB.prepare('INSERT INTO volunteers (first_name,last_name,email,phone,status,organisation,year,dates,notes,future_contact,newsletter) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(d.first, d.last, d.email, d.phone, d.status, d.org, d.year, d.dates, d.notes, d.future, d.news).run();
  // Optional newsletter: Zoho sends its own confirmation email before adding them.
  if (d.news) await zohoSubscribe(env, { email: d.email, first: d.first, role: d.status, source: 'Volunteer sign-up' });
  return true;
}

// Every console page: the static shell at /admin/ with the console navigation and the page's own HTML.
async function render(env, req, html, acc, current) {
  const shell = await env.ASSETS.fetch(new Request(new URL('/admin/', req.url).toString()));
  return withHeaders(new HTMLRewriter().on('#admin-root', { element(el) { el.setInnerContent(adminNav(acc, current) + html, { html: true }); } }).transform(shell));
}

async function volunteersHtml(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM volunteers ORDER BY created_at DESC').all();
  const rows = results.map((r) => `<tr${r.contacted ? ' class="done"' : ''}>
    <td>${esc(r.created_at.slice(0, 10))}</td>
    <td><b>${esc(r.first_name)} ${esc(r.last_name)}</b><br><a class="text-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? `<br>${esc(r.phone)}` : ''}</td>
    <td>${esc(r.status)}${r.organisation ? `<br>${esc(r.organisation)}` : ''}${r.year ? `<br>${esc(r.year)}` : ''}</td>
    <td>${esc(r.dates) || '<span class="muted">Not given</span>'}</td>
    <td>${esc(r.notes)}</td>
    <td>${r.future_contact ? 'Yes' : 'No'}</td>
    <td class="actions">
      <form method="post"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="contacted"><button class="btn btn-ghost small" type="submit">${r.contacted ? 'Mark not contacted' : 'Mark contacted'}</button></form>
      <form method="post" onsubmit="return confirm(this.dataset.confirm)" data-confirm="Delete ${esc(r.first_name)} ${esc(r.last_name)} permanently?"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="delete"><button class="btn btn-ghost small danger" type="submit">Delete</button></form>
    </td></tr>`).join('');
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Volunteers</h2>` + (results.length
    ? `<p class="admin-summary">${results.length} volunteer${results.length === 1 ? '' : 's'}, ${results.filter((r) => !r.contacted).length} not yet contacted. <a class="text-link" href="/admin/volunteers/export.csv">Download as spreadsheet (CSV)</a></p>
       <div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Signed up</th><th scope="col">Name and contact</th><th scope="col">Role</th><th scope="col">Dates</th><th scope="col">Notes</th><th scope="col">Future contact</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty-dates"><div><h3>No volunteers yet</h3><p>Sign-ups appear here as soon as someone submits the form at /volunteer/.</p></div></div>');
}

async function loginsHtml(env, req) {
  const s = await settings(env);
  const pw = (who, label) => `<form class="form pw-form" method="post"><input type="hidden" name="action" value="password_${who}"><label>${label}<input name="new_password" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn btn-ghost small" type="submit">Change</button></form>`;
  const msg = { ok: 'Password changed.', short: 'Use at least 10 characters.' }[new URL(req.url).searchParams.get('pw')] || '';
  return `<section class="admin-logins"><h2 class="display" style="font-size:34px;margin:0 0 8px">Logins</h2>
    <p class="admin-summary">Volunteer username: <b>${esc(s.volunteer_username)}</b> · Admin username: <b>${esc(s.admin_username)}</b>. Volunteers log in at /volunteer/login/, the Wavelength team at /admin/login/, and the two sessions are separate. Changing the volunteer password logs out every volunteer; changing the admin password logs out every admin. Each stops the old password working at once.</p>
    ${msg ? `<p class="form-note" style="font-weight:600">${msg}</p>` : ''}
    <div class="pw-grid">${pw('volunteer', 'New volunteer password')}${pw('admin', 'New admin password')}</div></section>`;
}

async function exportCsv(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM volunteers ORDER BY created_at DESC').all();
  const cols = ['created_at', 'first_name', 'last_name', 'email', 'phone', 'status', 'organisation', 'year', 'dates', 'notes', 'future_contact', 'contacted'];
  const cell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
  const csv = [cols.join(','), ...results.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  return withHeaders(new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="wavelength-volunteers-${new Date().toISOString().slice(0, 10)}.csv"` } }));
}

const csvCell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
function csvResponse(rows, cols, name) {
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
  return withHeaders(new Response('\ufeff' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` } }));
}

async function academyHtml(env, req) {
  const db = env.DB;
  const [learners, certs, attempts, fb] = await Promise.all([
    db.prepare('SELECT l.*, (SELECT COUNT(*) FROM certificates c WHERE c.learner_id = l.id) AS certs FROM learners l ORDER BY l.created_at DESC LIMIT 500').all(),
    db.prepare('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 500').all(),
    db.prepare('SELECT module, COUNT(*) AS n, SUM(passed) AS passed, ROUND(AVG(score)) AS avg FROM attempts GROUP BY module').all(),
    db.prepare('SELECT module, COUNT(*) AS n, ROUND(AVG(useful), 1) AS useful, ROUND(AVG(practice), 1) AS practice FROM feedback GROUP BY module').all(),
  ]);
  const L = learners.results || [], C = certs.results || [];
  const pending = C.filter((c) => !c.emailed_at).length;
  const msg = { 1: 'Certificate emails sent.', 0: 'Some emails could not be sent. See the email column.' }[new URL(req.url).searchParams.get('sent')] || '';
  const stats = (attempts.results || []).map((a) => { const f = (fb.results || []).find((x) => x.module === a.module); return `<li><b>${esc(a.module)}</b>: ${a.n} attempts, ${a.passed} passes, average score ${a.avg}%${f ? `. Feedback from ${f.n}: useful ${f.useful}/5, changes practice ${f.practice}/5` : ''}</li>`; }).join('');
  const html = `<h2 class="display" style="font-size:34px;margin:0 0 8px">Academy</h2>
  <p class="admin-summary">${L.length} learner${L.length === 1 ? '' : 's'}, ${L.filter((l) => l.newsletter).length} ticked the newsletter. ${C.length} certificate${C.length === 1 ? '' : 's'} issued. <a class="text-link" href="/admin/academy/learners.csv">Learners (CSV)</a> · <a class="text-link" href="/admin/academy/certificates.csv">Certificates (CSV)</a> · <a class="text-link" href="/admin/academy/feedback.csv">Feedback (CSV)</a></p>
  ${stats ? `<ul class="admin-summary">${stats}</ul>` : ''}
  ${msg ? `<p class="form-note" style="font-weight:600">${msg}</p>` : ''}
  ${pending ? `<form method="post"><input type="hidden" name="action" value="send_pending"><button class="btn btn-ghost small" type="submit">Email the ${pending} certificate${pending === 1 ? '' : 's'} not yet sent</button></form>` : ''}
  <h3 style="margin:36px 0 10px">Certificates</h3>
  ${C.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Issued</th><th scope="col">Name</th><th scope="col">Module</th><th scope="col">Score</th><th scope="col">Code</th><th scope="col">Email</th></tr></thead><tbody>${C.map((c) => `<tr><td>${esc(c.issued_on)}</td><td>${esc(c.name)}</td><td>${esc(c.module)}</td><td>${c.score}%</td><td><a class="text-link" href="/elearning/certificate/${esc(c.code)}/">${esc(c.code)}</a></td><td>${c.emailed_at ? 'Sent ' + esc(c.emailed_at.slice(0, 16)) : `<span class="muted">${esc(c.email_error || 'Pending')}</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No certificates yet.</p>'}
  <h3 style="margin:36px 0 10px">Learners</h3>
  ${L.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Registered</th><th scope="col">Name and email</th><th scope="col">Role</th><th scope="col">Newsletter</th><th scope="col">Certificates</th></tr></thead><tbody>${L.map((l) => `<tr><td>${esc(l.created_at.slice(0, 10))}</td><td><b>${esc(l.first_name)} ${esc(l.last_name)}</b><br><a class="text-link" href="mailto:${esc(l.email)}">${esc(l.email)}</a></td><td>${esc(l.role)}${l.organisation ? `<br>${esc(l.organisation)}` : ''}</td><td>${l.newsletter ? 'Yes' : 'No'}</td><td>${l.certs}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No learners yet.</p>'}`;
  return html;
}

// The console behind the admin login. Cloudflare Access (worker/access.js) applies only when ACCESS_TEAM_DOMAIN and
// ACCESS_AUD are set: then the admin's Access email is their identity in audit events, and roles from
// settings.admin_roles decide which sections open (roleForPath).
async function adminRoute(req, env, ctx, url, p, s) {
  const acc = await adminAccess(env, req, s);
  if (!acc.ok) return withHeaders(new Response('Sign in through Cloudflare Access to use the admin area.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  if (acc.on && !allowed(acc.roles, p)) return withHeaders(new Response('Your admin roles do not include this page. Ask the owner to add the role you need.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  const accessEmail = acc.on ? acc.email : '';
  const back = (to, m) => redirect(to + (m ? '?m=' + encodeURIComponent(m) : ''));
  const page = async (html, current) => render(env, req, html, acc, current);

  if (p === '/admin/') return page(consoleHome(acc), '');

  if (p === '/admin/volunteers/export.csv') return exportCsv(env);
  if (p === '/admin/volunteers/') {
    if (req.method === 'POST') {
      const f = await req.formData();
      const id = Number(f.get('id'));
      if (id && f.get('action') === 'delete') await env.DB.prepare('DELETE FROM volunteers WHERE id = ?').bind(id).run();
      if (id && f.get('action') === 'contacted') await env.DB.prepare('UPDATE volunteers SET contacted = 1 - contacted WHERE id = ?').bind(id).run();
      return redirect('/admin/volunteers/');
    }
    return page(await volunteersHtml(env), 'volunteers');
  }

  if (p === '/admin/logins/') {
    if (req.method === 'POST') {
      const f = await req.formData();
      const action = String(f.get('action') || '');
      if (action !== 'password_volunteer' && action !== 'password_admin') return redirect('/admin/logins/');
      const np = String(f.get('new_password') || '');
      if (np.length < 10 || np.length > 200) return redirect('/admin/logins/?pw=short');
      const who = action === 'password_admin' ? 'admin' : 'volunteer';
      // A new signing secret for that side logs everyone on it out, so the old password stops working at once.
      // The other side's sessions are untouched.
      const secret = who === 'admin' ? 'admin_session_secret' : 'session_secret';
      await env.DB.batch([
        env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(await hashPassword(np), who + '_hash'),
        env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(secret, newSecret()),
      ]);
      SETTINGS = null;
      return who === 'admin' ? redirect('/admin/login/', { 'Set-Cookie': clearCookie('a') }) : redirect('/admin/logins/?pw=ok');
    }
    return page(await loginsHtml(env, req), 'logins');
  }

  if (p === '/admin/academy/learners.csv') return csvResponse((await env.DB.prepare('SELECT * FROM learners ORDER BY created_at DESC').all()).results || [], ['created_at', 'title', 'first_name', 'last_name', 'email', 'role', 'organisation', 'newsletter', 'last_seen'], 'wavelength-academy-learners');
  if (p === '/admin/academy/certificates.csv') return csvResponse((await env.DB.prepare('SELECT * FROM certificates ORDER BY created_at DESC').all()).results || [], ['issued_on', 'code', 'name', 'module', 'module_title', 'score', 'cpd_hours', 'emailed_at', 'email_error'], 'wavelength-academy-certificates');
  if (p === '/admin/academy/feedback.csv') return csvResponse((await env.DB.prepare('SELECT created_at, module, useful, practice, comment FROM feedback ORDER BY created_at DESC').all()).results || [], ['created_at', 'module', 'useful', 'practice', 'comment'], 'wavelength-academy-feedback');
  if (p === '/admin/academy/') {
    if (req.method === 'POST') {
      const f = await req.formData();
      if (f.get('action') === 'send_pending') {
        const { results = [] } = await env.DB.prepare('SELECT c.*, l.email, l.title, l.first_name, l.last_name FROM certificates c JOIN learners l ON l.id = c.learner_id WHERE c.emailed_at IS NULL LIMIT 25').all();
        let ok = true;
        for (const c of results) ok = (await sendCertificate(env, c, c)) && ok;
        return redirect(`/admin/academy/?sent=${ok ? 1 : 0}`);
      }
      return redirect('/admin/academy/');
    }
    return page(await academyHtml(env, req), 'academy');
  }

  if (p === '/admin/faculty/applications.csv') return csvResponse((await env.DB.prepare('SELECT * FROM faculty_applications ORDER BY created_at DESC').all()).results || [], ['created_at', 'first_name', 'last_name', 'email', 'phone', 'profession', 'specialty', 'organisation', 'registration', 'experience', 'credentials', 'applications', 'interests', 'details', 'contacted'], 'wavelength-faculty-applications');
  if (p === '/admin/faculty/') {
    if (req.method === 'POST') { await facultyAdminPost(env, req); return redirect('/admin/faculty/'); }
    return page(await facultyAdminHtml(env), 'faculty');
  }
  if (p === '/admin/departments/enquiries.csv') return csvResponse((await env.DB.prepare('SELECT * FROM department_enquiries ORDER BY created_at DESC').all()).results || [], ['created_at', 'first_name', 'last_name', 'email', 'phone', 'role', 'organisation', 'setting', 'training', 'topics', 'group_size', 'timing', 'details', 'contacted'], 'wavelength-department-enquiries');
  if (p === '/admin/departments/') {
    if (req.method === 'POST') { await departmentsAdminPost(env, req); return redirect('/admin/departments/'); }
    return page(await departmentsAdminHtml(env), 'departments');
  }

  if (p === '/admin/newsletter/connect/') {
    const exp = Date.now() + 15 * 60e3;
    const to = await zohoConnectUrl(env, `${exp}.${await sign(env, 'zoho.' + exp, 'admin_session_secret')}`);
    return to ? redirect(to) : back('/admin/newsletter/', 'Add the Zoho API client first.');
  }
  if (p === '/admin/newsletter/callback/') {
    const [exp, sig] = String(url.searchParams.get('state') || '').split('.');
    if (!exp || Number(exp) < Date.now() || !(await same(env, sig || '', await sign(env, 'zoho.' + exp, 'admin_session_secret')))) return back('/admin/newsletter/', 'Connection link expired. Try again.');
    const err = url.searchParams.get('error') || await zohoCallback(env, String(url.searchParams.get('code') || ''));
    return back('/admin/newsletter/', err ? 'Zoho connection failed: ' + err : 'Connected to Zoho Campaigns.');
  }
  if (p === '/admin/newsletter/') {
    if (req.method === 'POST') return back('/admin/newsletter/', await newsletterAdminPost(env, await req.formData()));
    return page(await newsletterAdminHtml(env, url.searchParams.get('m') || ''), 'newsletter');
  }

  if (p === '/admin/supervisors/evidence/') {
    const file = await evidenceFile(env, url.searchParams.get('id'), accessEmail ? `access:${accessEmail}` : s.admin_username);
    return file ? withHeaders(file) : redirect('/admin/supervisors/');
  }
  if (p === '/admin/supervisors/') {
    if (req.method === 'POST') {
      const f = await req.formData();
      // With Access on, the verified email replaces the typed reviewer name as the actor.
      if (accessEmail) f.set('reviewer', accessEmail);
      const r = await supervisorsAdminPost(env, f, accessEmail ? 'access' : s.admin_username, ctx);
      // The reviewer's name is typed once a session: remembered for the supervisor console only (it is a name, never
      // a credential; the admin login still decides who gets in).
      const who = accessEmail ? '' : String(f.get('reviewer') || '').replace(/[\u0000-\u001f;,]/g, ' ').trim().slice(0, 80);
      return redirect(`/admin/supervisors/?${r.app ? `app=${r.app}&` : r.id ? `id=${r.id}&` : ''}${r.tab ? `tab=${encodeURIComponent(r.tab)}&` : ''}m=${encodeURIComponent(r.m)}`,
        who ? { 'Set-Cookie': `wl_reviewer=${encodeURIComponent(who)}; Path=/admin/supervisors/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict` } : {});
    }
    const remembered = (/(?:^|;\s*)wl_reviewer=([^;]*)/.exec(req.headers.get('Cookie') || '') || [])[1];
    let reviewer = '';
    try { reviewer = remembered ? decodeURIComponent(remembered).slice(0, 80) : ''; } catch { reviewer = ''; }
    return page(await supervisorsAdminHtml(env, url, s.admin_username, { reviewer, access: accessEmail }), 'supervisors');
  }
  if (p === '/admin/organisations/') {
    if (req.method === 'POST') {
      const r = await organisationsAdminPost(env, await req.formData(), s.admin_username, { access: accessEmail });
      return redirect(`/admin/organisations/?${r.q ? `q=${encodeURIComponent(r.q)}&` : ''}m=${encodeURIComponent(r.m)}`);
    }
    return page(await organisationsAdminHtml(env, url, { access: accessEmail }), 'organisations');
  }
  return redirect('/admin/');
}

export default {
  async scheduled(event, env, ctx) {
    // One cron, one job (worker/cron.js): 15 5 * * * runs the daily supervisor job, the two Tuesday crons the newsletter.
    runScheduled(event, env, ctx, { dailyLifecycle, scheduledNewsletter });
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    let p = url.pathname;
    if (p === '/api/faculty/apply') {
      if (req.method !== 'POST') return redirect('/faculty/join/');
      const origin = req.headers.get('Origin');
      if (origin && origin !== url.origin) return withHeaders(new Response('Forbidden', { status: 403 }));
      if (!env.DB) return redirect('/faculty/join/?error=1');
      return redirect(await applyFaculty(env, req, ctx));
    }
    if (p === '/api/training/enquire') {
      if (req.method !== 'POST') return redirect('/training/');
      const origin = req.headers.get('Origin');
      if (origin && origin !== url.origin) return withHeaders(new Response('Forbidden', { status: 403 }));
      if (!env.DB) return redirect('/training/?error=1#enquire');
      return redirect(await enquireTraining(env, req, ctx));
    }
    // /api/app/* also serves the store apps from their own origins (worker/native.js).
    if (p.startsWith('/api/app/')) return req.method === 'OPTIONS' ? preflight(req) : withNative(req, await handleApp(req, env, ctx));
    // Certificate PDFs are public by code; the store apps fetch them to save or share.
    if (/^\/elearning\/certificate\/[A-Z0-9-]+\.pdf$/.test(p) && req.method === 'GET') return withNative(req, await handleAcademy(req, env, ctx));
    if (p.startsWith('/elearning/') || p.startsWith('/api/')) return handleAcademy(req, env, ctx);
    const area = p === '/admin' || p.startsWith('/admin/') ? 'admin' : p === '/volunteer' || p.startsWith('/volunteer/') ? 'volunteer' : null;
    if (!area) return env.ASSETS.fetch(req);
    if (p === '/volunteer' || p === '/admin') return redirect(p + '/');
    if (!p.endsWith('/') && !p.endsWith('.csv')) p += '/';

    // The console moved from /volunteer/admin/ to /admin/ in October 2026. Old links keep working: a GET lands on the
    // same page at its new address with its query (the Zoho callback needs it); a POST is never replayed, it lands on
    // the new page and is sent again from there.
    if (p.startsWith('/volunteer/admin/')) {
      const to = legacyAdminPath(p);
      if (req.method === 'GET' || req.method === 'HEAD') return withHeaders(new Response(null, { status: 301, headers: { Location: to + url.search } }));
      return redirect(to);
    }

    const down = area === 'admin' ? '/admin/unavailable/' : '/volunteer/unavailable/';
    if (!env.DB) return asset(env, req, down, 503);
    SETTINGS = null; // read fresh settings on every request
    const s = await settings(env);
    if (!s.volunteer_hash || !s.admin_hash || !s.session_secret) return asset(env, req, down, 503);

    // Reject cross-site form posts.
    if (req.method === 'POST') {
      const origin = req.headers.get('Origin');
      if (origin && origin !== url.origin) return withHeaders(new Response('Forbidden', { status: 403 }));
    }
    const login = async (f, who) => {
      const u = clip(f.get('username'), 100).toLowerCase(), pw = String(f.get('password') || '').slice(0, 200);
      return await same(env, u, String(s[who + '_username'] || '').toLowerCase()) && await checkPassword(env, pw, s[who + '_hash']);
    };
    const refuse = async (to) => { await new Promise((r) => setTimeout(r, 800)); return redirect(to); };

    if (area === 'admin') {
      if (p === '/admin/login/') {
        if (req.method === 'POST') {
          if (!(await login(await req.formData(), 'admin'))) return refuse('/admin/login/?error=1');
          await ensureAdminSecret(env);
          return redirect('/admin/', { 'Set-Cookie': await cookieFor(env, 'a') });
        }
        if (await session(env, req, 'a')) return redirect('/admin/');
        return asset(env, req, '/admin/login/');
      }
      if (p === '/admin/logout/') return redirect('/admin/login/', { 'Set-Cookie': clearCookie('a') });
      if (!(await session(env, req, 'a'))) return redirect('/admin/login/');
      return adminRoute(req, env, ctx, url, p, s);
    }

    if (p === '/volunteer/login/') {
      if (req.method === 'POST') {
        const f = await req.formData();
        if (await login(f, 'volunteer')) return redirect('/volunteer/', { 'Set-Cookie': await cookieFor(env, 'v') });
        // The Wavelength team used to log in here. Their login now opens only the console, at its own address.
        if (await login(f, 'admin')) return redirect('/admin/login/');
        return refuse('/volunteer/login/?error=1');
      }
      if (await session(env, req, 'v')) return redirect('/volunteer/');
      return asset(env, req, '/volunteer/login/');
    }
    if (p === '/volunteer/logout/') return redirect('/volunteer/login/', { 'Set-Cookie': clearCookie('v') });
    if (!(await session(env, req, 'v'))) return redirect('/volunteer/login/');

    if (p === '/volunteer/' && req.method === 'POST') {
      const saved = await saveVolunteer(env, await req.formData());
      return redirect(saved ? '/volunteer/thanks/' : '/volunteer/?error=1');
    }
    if (p === '/volunteer/' || p === '/volunteer/thanks/') return asset(env, req, p);
    return redirect('/volunteer/');
  },
};
