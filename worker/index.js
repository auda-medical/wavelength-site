// Wavelength Worker. Static pages are served from dist/ as normal.
// This script only runs for /volunteer/* (see run_worker_first in wrangler.jsonc):
// a hidden, password-protected volunteer sign-up area with a private admin list.
//
// Logins live in the D1 table `settings` (volunteer_username, volunteer_hash, admin_username,
// admin_hash, session_secret). Passwords are stored as PBKDF2 hashes, never in plain text.
// The admin page lets the team change both passwords.

const COOKIE = 'wl_vol';
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
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
async function key(env) {
  const s = await settings(env);
  return crypto.subtle.importKey('raw', enc.encode(s.session_secret || 'unset'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(env, text) {
  const sig = await crypto.subtle.sign('HMAC', await key(env), enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
}
// Compare two strings without leaking timing, by comparing their HMACs.
async function same(env, a, b) {
  const [x, y] = await Promise.all([sign(env, 'cmp:' + a), sign(env, 'cmp:' + b)]);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

async function session(env, req) {
  if (!(await settings(env)).session_secret) return null;
  const m = (req.headers.get('Cookie') || '').match(new RegExp(COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [role, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!role || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!(await same(env, sig, await sign(env, role + '.' + exp)))) return null;
  return role; // 'v' volunteer or 'a' admin
}
async function cookieFor(env, role) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const val = `${role}.${exp}.${await sign(env, role + '.' + exp)}`;
  return `${COOKIE}=${encodeURIComponent(val)}; Path=/volunteer; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}
const clearCookie = `${COOKIE}=; Path=/volunteer; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

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
  };
  const ok = d.first && d.last && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) && form.get('confirm_age') && form.get('confirm_scan') && form.get('confirm_findings') && form.get('confirm_privacy');
  if (!ok) return false;
  await env.DB.prepare('INSERT INTO volunteers (first_name,last_name,email,phone,status,organisation,year,dates,notes,future_contact) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(d.first, d.last, d.email, d.phone, d.status, d.org, d.year, d.dates, d.notes, d.future).run();
  return true;
}

async function adminPage(env, req) {
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
      <form method="post" onsubmit="return confirm('Delete ${esc(r.first_name)} ${esc(r.last_name)} permanently?')"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="delete"><button class="btn btn-ghost small danger" type="submit">Delete</button></form>
    </td></tr>`).join('');
  const table = results.length
    ? `<p class="admin-summary">${results.length} volunteer${results.length === 1 ? '' : 's'}, ${results.filter((r) => !r.contacted).length} not yet contacted. <a class="text-link" href="/volunteer/admin/export.csv">Download as spreadsheet (CSV)</a></p>
       <div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Signed up</th><th scope="col">Name and contact</th><th scope="col">Role</th><th scope="col">Dates</th><th scope="col">Notes</th><th scope="col">Future contact</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty-dates"><div><h3>No volunteers yet</h3><p>Sign-ups appear here as soon as someone submits the form.</p></div></div>';
  const s = await settings(env);
  const pw = (who, label) => `<form class="form pw-form" method="post"><input type="hidden" name="action" value="password_${who}"><label>${label}<input name="new_password" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn btn-ghost small" type="submit">Change</button></form>`;
  const msg = { ok: 'Password changed.', short: 'Use at least 10 characters.' }[new URL(req.url).searchParams.get('pw')] || '';
  const logins = `<section class="admin-logins"><h2 class="display" style="font-size:34px;margin:56px 0 8px">Logins</h2>
    <p class="admin-summary">Volunteer username: <b>${esc(s.volunteer_username)}</b> · Admin username: <b>${esc(s.admin_username)}</b>. Changing the volunteer password logs out every volunteer and stops the old password working.</p>
    ${msg ? `<p class="form-note" style="font-weight:600">${msg}</p>` : ''}
    <div class="pw-grid">${pw('volunteer', 'New volunteer password')}${pw('admin', 'New admin password')}</div></section>`;
  const shell = await env.ASSETS.fetch(new Request(new URL('/volunteer/admin/', req.url).toString()));
  return withHeaders(new HTMLRewriter().on('#admin-root', { element(el) { el.setInnerContent(table + logins, { html: true }); } }).transform(shell));
}

async function exportCsv(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM volunteers ORDER BY created_at DESC').all();
  const cols = ['created_at', 'first_name', 'last_name', 'email', 'phone', 'status', 'organisation', 'year', 'dates', 'notes', 'future_contact', 'contacted'];
  const cell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
  const csv = [cols.join(','), ...results.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
  return withHeaders(new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="wavelength-volunteers-${new Date().toISOString().slice(0, 10)}.csv"` } }));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    let p = url.pathname;
    if (!p.startsWith('/volunteer')) return env.ASSETS.fetch(req);
    if (p === '/volunteer') return redirect('/volunteer/');
    if (!p.endsWith('/') && !p.endsWith('.csv')) p += '/';

    if (!env.DB) return asset(env, req, '/volunteer/unavailable/', 503);
    SETTINGS = null; // read fresh settings on every request
    const s = await settings(env);
    if (!s.volunteer_hash || !s.admin_hash || !s.session_secret) return asset(env, req, '/volunteer/unavailable/', 503);

    // Reject cross-site form posts.
    if (req.method === 'POST') {
      const origin = req.headers.get('Origin');
      if (origin && origin !== url.origin) return withHeaders(new Response('Forbidden', { status: 403 }));
    }

    if (p === '/volunteer/login/') {
      if (req.method === 'POST') {
        const f = await req.formData();
        const u = clip(f.get('username'), 100), pw = String(f.get('password') || '').slice(0, 200);
        let role = null;
        if (await same(env, u.toLowerCase(), String(s.admin_username || '').toLowerCase()) && await checkPassword(env, pw, s.admin_hash)) role = 'a';
        else if (await same(env, u.toLowerCase(), String(s.volunteer_username || '').toLowerCase()) && await checkPassword(env, pw, s.volunteer_hash)) role = 'v';
        if (!role) { await new Promise((r) => setTimeout(r, 800)); return redirect('/volunteer/login/?error=1'); }
        return redirect(role === 'a' ? '/volunteer/admin/' : '/volunteer/', { 'Set-Cookie': await cookieFor(env, role) });
      }
      if (await session(env, req)) return redirect('/volunteer/');
      return asset(env, req, '/volunteer/login/');
    }
    if (p === '/volunteer/logout/') return redirect('/volunteer/login/', { 'Set-Cookie': clearCookie });

    const role = await session(env, req);
    if (!role) return redirect('/volunteer/login/');

    if (p.startsWith('/volunteer/admin')) {
      if (role !== 'a') return redirect('/volunteer/');
      if (p === '/volunteer/admin/export.csv') return exportCsv(env);
      if (req.method === 'POST') {
        const f = await req.formData();
        const id = Number(f.get('id'));
        if (id && f.get('action') === 'delete') await env.DB.prepare('DELETE FROM volunteers WHERE id = ?').bind(id).run();
        if (id && f.get('action') === 'contacted') await env.DB.prepare('UPDATE volunteers SET contacted = 1 - contacted WHERE id = ?').bind(id).run();
        const action = String(f.get('action') || '');
        if (action === 'password_volunteer' || action === 'password_admin') {
          const np = String(f.get('new_password') || '');
          if (np.length < 10 || np.length > 200) return redirect('/volunteer/admin/?pw=short');
          const who = action === 'password_admin' ? 'admin' : 'volunteer';
          await env.DB.batch([
            env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(await hashPassword(np), who + '_hash'),
            // A new session secret logs everyone out, so the old password stops working at once.
            env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(b64(crypto.getRandomValues(new Uint8Array(32))), 'session_secret'),
          ]);
          SETTINGS = null;
          return redirect(who === 'admin' ? '/volunteer/login/' : '/volunteer/admin/?pw=ok', who === 'admin' ? { 'Set-Cookie': clearCookie } : { 'Set-Cookie': await cookieFor(env, 'a') });
        }
        return redirect('/volunteer/admin/');
      }
      return adminPage(env, req);
    }

    if (p === '/volunteer/' && req.method === 'POST') {
      const saved = await saveVolunteer(env, await req.formData());
      return redirect(saved ? '/volunteer/thanks/' : '/volunteer/?error=1');
    }
    if (p === '/volunteer/' || p === '/volunteer/thanks/') return asset(env, req, p);
    return redirect('/volunteer/');
  },
};
