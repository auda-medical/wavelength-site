// Wavelength Worker. Static pages are served from dist/ as normal.
// This script only runs for /volunteer/* (see run_worker_first in wrangler.jsonc):
// a hidden, password-protected volunteer sign-up area with a private admin list.
//
// Secrets (Cloudflare dashboard > Workers > wavelength-site > Settings > Variables and Secrets):
//   VOLUNTEER_USERNAME, VOLUNTEER_PASSWORD  shared login for volunteers
//   ADMIN_USERNAME, ADMIN_PASSWORD          your login to see and export sign-ups
//   SESSION_SECRET (optional)               any long random text; signs the login cookie

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

async function key(env) {
  const secret = env.SESSION_SECRET || [env.VOLUNTEER_USERNAME, env.VOLUNTEER_PASSWORD, env.ADMIN_USERNAME, env.ADMIN_PASSWORD].join('|');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
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
  const shell = await env.ASSETS.fetch(new Request(new URL('/volunteer/admin/', req.url).toString()));
  return withHeaders(new HTMLRewriter().on('#admin-root', { element(el) { el.setInnerContent(table, { html: true }); } }).transform(shell));
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

    if (!env.VOLUNTEER_PASSWORD || !env.ADMIN_PASSWORD || !env.DB) return asset(env, req, '/volunteer/unavailable/', 503);

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
        if (await same(env, u.toLowerCase(), String(env.ADMIN_USERNAME || '').toLowerCase()) && await same(env, pw, env.ADMIN_PASSWORD)) role = 'a';
        else if (await same(env, u.toLowerCase(), String(env.VOLUNTEER_USERNAME || '').toLowerCase()) && await same(env, pw, env.VOLUNTEER_PASSWORD)) role = 'v';
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
