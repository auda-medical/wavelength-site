// Wavelength Academy: learner registration, server-side marking, certificates and email.
// Routes (see run_worker_first in wrangler.jsonc):
//   POST /api/academy/register   save or update a learner, set the login cookie
//   GET  /api/academy/me         who is logged in, and their certificates
//   POST /api/academy/submit     mark an assessment; on a pass, issue and email the certificate
//   POST /api/academy/feedback   module feedback
//   POST /api/academy/resend     email a certificate again (owner only)
//   /elearning/<slug>/learn/*, /elearning/<slug>/assessment/   registered learners only
//   /elearning/certificate/<code>/ and <code>.pdf               public, by code
//   /elearning/verify/?code=   /elearning/account/   /elearning/logout/
// Email goes through Zoho ZeptoMail. Set the Worker secret ZEPTOMAIL_TOKEN to switch it on.
import DATA from './academy-data.json';
import TEMPLATE from './cert-template.bin';
import TEMPLATE_META from './cert-template.json';
import { stampCertificate } from './cert.js';

const COOKIE = 'wl_learn';
const DAYS = 180;
const enc = new TextEncoder();
const SITE = 'https://thewavelength.co.uk';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const HEAD = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEAD, ...extra } });
const redirect = (to, extra = {}) => new Response(null, { status: 303, headers: { Location: to, ...HEAD, ...extra } });
const withHead = (res, extra = {}) => { const r = new Response(res.body, res); for (const [k, v] of Object.entries({ ...HEAD, ...extra })) r.headers.set(k, v); return r; };
const fullName = (l) => [l.title, l.first_name, l.last_name].filter(Boolean).join(' ');
const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---------- Login cookie, signed with its own secret in the settings table ----------
let SECRET = null;
async function secret(env) {
  if (SECRET) return SECRET;
  let row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'learner_secret'").first();
  if (!row) {
    const v = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('learner_secret', ?)").bind(v).run();
    row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'learner_secret'").first();
  }
  SECRET = await crypto.subtle.importKey('raw', enc.encode(row.value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return SECRET;
}
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function cookieFor(env, id) {
  const exp = Date.now() + DAYS * 864e5;
  const sig = b64u(await crypto.subtle.sign('HMAC', await secret(env), enc.encode(`${id}.${exp}`)));
  return `${COOKIE}=${id}.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
async function learner(env, req) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(COOKIE + '=(\\d+)\\.(\\d+)\\.([A-Za-z0-9_-]+)'));
  if (!m || Number(m[2]) < Date.now()) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await secret(env), unb64u(m[3]), enc.encode(`${m[1]}.${m[2]}`)); } catch { ok = false; }
  if (!ok) return null;
  return env.DB.prepare('SELECT * FROM learners WHERE id = ?').bind(Number(m[1])).first();
}

// ---------- Certificates ----------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(mod) {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `WL-${mod.code}-${s.slice(0, 4)}-${s.slice(4)}`;
}
export function certificatePdf(cert) {
  return stampCertificate(TEMPLATE, TEMPLATE_META, { name: cert.name, module: cert.module_title, score: cert.score, cpdHours: cert.cpd_hours, date: cert.issued_on, code: cert.code });
}
const pdfName = (cert) => `Wavelength-Academy-${cert.module}-certificate-${cert.code}.pdf`;

function certificateEmail(cert, first) {
  const link = `${SITE}/elearning/certificate/${cert.code}/`;
  const hours = `${cert.cpd_hours} ${cert.cpd_hours === 1 ? 'hour' : 'hours'}`;
  const p = 'margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#33404F;';
  const eyebrow = 'margin:0 0 12px 0;font-size:12px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#2A7F8A;';
  const btn = (href, label, bg, fg) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px 0;"><tr><td align="center" bgcolor="${bg}" style="background:${bg};border-radius:999px;"><a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${fg};text-decoration:none;">${label}</a></td></tr></table>`;
  const row = (k, v) => `<tr><td style="padding:12px 0;border-bottom:1px solid #E4E0D7;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#2A7F8A;font-weight:bold;">${k}</td><td align="right" style="padding:12px 0;border-bottom:1px solid #E4E0D7;font-size:15px;color:#0F1E33;">${v}</td></tr>`;
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Your Wavelength Academy certificate</title></head>
<body style="margin:0;padding:0;background:#EDEAE3;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EDEAE3" style="background:#EDEAE3;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td align="center" bgcolor="#0F1E33" style="background:#0F1E33;padding:34px 24px;border-radius:14px 14px 0 0;"><a href="${SITE}/" style="text-decoration:none;"><img src="${SITE}/assets/email/logo-header.png" width="300" height="56" alt="Wavelength. Tune In, Gain Clarity" style="display:block;border:0;width:300px;height:56px;color:#F7F5F0;font-family:Arial,Helvetica,sans-serif;font-size:20px;letter-spacing:6px;"></a></td></tr>
<tr><td height="4" bgcolor="#2A7F8A" style="background:#2A7F8A;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:44px 48px 32px 48px;font-family:Arial,Helvetica,sans-serif;">
<p style="${eyebrow}">Wavelength Academy</p>
<h1 style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:32px;line-height:1.15;color:#0F1E33;">Congratulations, ${esc(first)}.</h1>
<p style="${p}">You passed <b>${esc(cert.module_title)}</b> with a score of ${cert.score}%. Your certificate is attached as a PDF, worth ${hours} of CPD.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;font-family:Arial,Helvetica,sans-serif;">${row('Name on certificate', esc(cert.name))}${row('CPD', `${hours} · ${cert.cpd_hours} ${cert.cpd_hours === 1 ? 'credit' : 'credits'}`)}${row('Completed', fmtDate(cert.issued_on))}${row('Certificate number', esc(cert.code))}</table>
${btn(link, 'View your certificate online', '#0F1E33', '#F7F5F0')}
</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:32px 48px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #E4E0D7;">
<p style="${eyebrow}">Add it to your portfolio</p>
<p style="${p}">Upload the PDF to your e-portfolio and add a short reflection: what you learned, how it changes your scanning, and what you will practise next. Your certificate page has a reflection template you can fill in and print.</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#5B6878;">Anyone can check your certificate at thewavelength.co.uk/elearning/verify with the code above.</p>
</td></tr>
<tr><td bgcolor="#F7F5F0" style="background:#F7F5F0;padding:32px 48px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #E4E0D7;">
<p style="${eyebrow}">Put it into practice</p>
<p style="${p}">E-learning builds the knowledge. Supervised scanning builds the skill. Our one-day Core Emergency Ultrasound course is mapped to the RCEM curriculum and taught in small groups by FAMUS-accredited instructors and RCEM-approved ultrasound supervisors.</p>
${btn(`${SITE}/courses/core-emergency-ultrasound/?utm_source=academy&utm_medium=email&utm_campaign=certificate`, 'See the core course', '#7FC4CC', '#0F1E33')}
</td></tr>
<tr><td bgcolor="#0F1E33" style="background:#0F1E33;padding:32px 48px;border-radius:0 0 14px 14px;font-family:Arial,Helvetica,sans-serif;color:#B9C4D0;">
<p style="margin:0 0 6px 0;font-size:13px;letter-spacing:4px;color:#F7F5F0;">WAVELENGTH</p>
<p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;">Questions about your certificate? Reply to this email or write to <a href="mailto:hello@thewavelength.co.uk" style="color:#F7F5F0;">hello@thewavelength.co.uk</a>.</p>
<p style="margin:0;padding-top:14px;border-top:1px solid #24364F;font-size:11px;line-height:1.6;color:#8796A8;">You receive this email because you completed a Wavelength Academy module. Wavelength is a trading name of Auda Medical Ltd. Registered in England and Wales, company number 08487817. Registered office: 99 Ericson Gardens, Bromley BR2 9FZ.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Congratulations, ${first}.\n\nYou passed ${cert.module_title} with a score of ${cert.score}%. Your certificate is attached as a PDF, worth ${hours} of CPD.\n\nName on certificate: ${cert.name}\nCompleted: ${fmtDate(cert.issued_on)}\nCertificate number: ${cert.code}\n\nView your certificate: ${link}\nVerify: ${SITE}/elearning/verify/\n\nWavelength, a trading name of Auda Medical Ltd, company 08487817.`;
  return { html, text };
}

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
export async function sendCertificate(env, cert, person) {
  if (!env.ZEPTOMAIL_TOKEN) {
    await env.DB.prepare('UPDATE certificates SET email_error = ? WHERE code = ?').bind('Email not set up yet (ZEPTOMAIL_TOKEN missing)', cert.code).run();
    return false;
  }
  const { html, text } = certificateEmail(cert, person.first_name);
  const token = env.ZEPTOMAIL_TOKEN.replace(/^Zoho-enczapikey\s+/i, '');
  try {
    const res = await fetch(env.ZEPTOMAIL_API || 'https://api.zeptomail.eu/v1.1/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-enczapikey ${token}` },
      body: JSON.stringify({
        from: { address: env.MAIL_FROM || 'academy@thewavelength.co.uk', name: env.MAIL_FROM_NAME || 'Wavelength Academy' },
        to: [{ email_address: { address: person.email, name: fullName(person) } }],
        reply_to: [{ address: env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk', name: 'Wavelength' }],
        subject: `Your Wavelength Academy certificate: ${cert.module_title}`,
        htmlbody: html,
        textbody: text,
        attachments: [{ content: b64(certificatePdf(cert)), mime_type: 'application/pdf', name: pdfName(cert) }],
        track_clicks: false,
        track_opens: false,
      }),
    });
    if (!res.ok) throw new Error(`ZeptoMail ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await env.DB.prepare("UPDATE certificates SET emailed_at = datetime('now'), email_error = NULL WHERE code = ?").bind(cert.code).run();
    return true;
  } catch (e) {
    await env.DB.prepare('UPDATE certificates SET email_error = ? WHERE code = ?').bind(String(e.message || e).slice(0, 500), cert.code).run();
    return false;
  }
}

// ---------- API ----------
async function body(req) {
  const type = req.headers.get('Content-Type') || '';
  if (type.includes('application/json')) return req.json().catch(() => ({}));
  const f = await req.formData();
  const o = {}; for (const [k, v] of f) o[k] = v; return o;
}

async function register(env, req) {
  const d = await body(req);
  const mod = DATA.modules[clip(d.module, 40)];
  const isJson = (req.headers.get('Accept') || '').includes('json');
  const fail = (error) => (isJson ? json({ ok: false, error }, 400) : redirect(`/elearning/${mod ? mod.slug : ''}/?error=1#register`));
  if (d.website) return isJson ? json({ ok: true, next: '/elearning/' }) : redirect('/elearning/'); // honeypot
  const TITLES = ['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx'];
  const p = { title: TITLES.includes(clip(d.title, 10)) ? clip(d.title, 10) : '', first: clip(d.first_name, 80), last: clip(d.last_name, 80), email: clip(d.email, 160).toLowerCase(), role: clip(d.role, 80), org: clip(d.organisation, 160), news: d.newsletter ? 1 : 0 };
  if (!mod) return fail('That module was not found.');
  if (!p.first || !p.last) return fail('Enter your first and last name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return fail('Enter a valid email address.');
  if (!d.privacy) return fail('Tick the privacy box to register.');
  if (env.NEWSLETTER_REQUIRED !== 'false' && !p.news) return fail('Academy registration includes the Wavelength newsletter. Tick the newsletter box to continue.');
  await env.DB.prepare(`INSERT INTO learners (email, title, first_name, last_name, role, organisation, newsletter, last_seen) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(email) DO UPDATE SET title = excluded.title, first_name = excluded.first_name, last_name = excluded.last_name, role = excluded.role, organisation = COALESCE(NULLIF(excluded.organisation, ''), learners.organisation), newsletter = MAX(learners.newsletter, excluded.newsletter), last_seen = datetime('now')`)
    .bind(p.email, p.title, p.first, p.last, p.role, p.org, p.news).run();
  const row = await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind(p.email).first();
  const next = Object.values(mod.lessons)[0].path;
  const cookie = await cookieFor(env, row.id);
  return isJson ? json({ ok: true, next }, 200, { 'Set-Cookie': cookie }) : redirect(next, { 'Set-Cookie': cookie });
}

async function me(env, req) {
  const l = await learner(env, req);
  if (!l) return json({ loggedIn: false });
  const { results = [] } = await env.DB.prepare('SELECT code, module, module_title, issued_on FROM certificates WHERE learner_id = ? ORDER BY created_at DESC').bind(l.id).all();
  return json({ loggedIn: true, firstName: l.first_name, certificates: results });
}

async function submit(env, req, ctx) {
  const l = await learner(env, req);
  if (!l) return json({ ok: false, error: 'Please register or log in again.' }, 401);
  const d = await body(req);
  const mod = DATA.modules[clip(d.module, 40)];
  if (!mod) return json({ ok: false, error: 'That module was not found.' }, 400);
  const answers = d.answers && typeof d.answers === 'object' ? d.answers : {};
  if (mod.questions.some((q) => !q.options.includes(answers[q.id]))) return json({ ok: false, error: 'Answer every question before you submit.' }, 400);
  const total = mod.questions.length;
  const right = mod.questions.filter((q) => answers[q.id] === q.correct).length;
  const score = Math.round((100 * right) / total);
  const passed = score >= mod.passMark;
  await env.DB.prepare('INSERT INTO attempts (learner_id, module, score, right_count, total, passed, answers) VALUES (?,?,?,?,?,?,?)')
    .bind(l.id, mod.slug, score, right, total, passed ? 1 : 0, JSON.stringify(Object.fromEntries(mod.questions.map((q) => [q.id, answers[q.id]])))).run();
  await env.DB.prepare("UPDATE learners SET last_seen = datetime('now') WHERE id = ?").bind(l.id).run();
  // Before a pass, show which answers were right and which lesson to review, not the correct option.
  const results = Object.fromEntries(mod.questions.map((q) => {
    const ok = answers[q.id] === q.correct;
    return [q.id, { correct: ok, review: ok ? null : mod.lessons[q.review] || null, ...(passed ? { why: q.why } : {}) }];
  }));
  const out = { ok: true, passed, score, right, total, passMark: mod.passMark, results };
  if (passed) {
    let cert = await env.DB.prepare('SELECT * FROM certificates WHERE learner_id = ? AND module = ?').bind(l.id, mod.slug).first();
    if (!cert) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      for (let i = 0; i < 5 && !cert; i++) {
        const code = newCode(mod);
        const r = await env.DB.prepare('INSERT OR IGNORE INTO certificates (code, learner_id, module, module_title, name, score, cpd_hours, issued_on) VALUES (?,?,?,?,?,?,?,?)')
          .bind(code, l.id, mod.slug, mod.title, fullName(l), score, mod.cpdHours, today).run();
        if (r.meta && r.meta.changes) cert = await env.DB.prepare('SELECT * FROM certificates WHERE code = ?').bind(code).first();
        else cert = await env.DB.prepare('SELECT * FROM certificates WHERE learner_id = ? AND module = ?').bind(l.id, mod.slug).first();
      }
      ctx.waitUntil(sendCertificate(env, cert, l));
      out.emailed = !!env.ZEPTOMAIL_TOKEN;
    } else out.emailed = false;
    out.code = cert.code;
    out.email = l.email;
  }
  return json(out);
}

async function feedback(env, req) {
  const l = await learner(env, req);
  const d = await body(req);
  const n = (v) => { const x = Number(v); return x >= 1 && x <= 5 ? x : null; };
  if (!DATA.modules[clip(d.module, 40)]) return json({ ok: false }, 400);
  await env.DB.prepare('INSERT INTO feedback (learner_id, module, useful, practice, comment) VALUES (?,?,?,?,?)').bind(l ? l.id : null, clip(d.module, 40), n(d.useful), n(d.practice), clip(d.comment, 1000)).run();
  return json({ ok: true });
}

async function resend(env, req) {
  const l = await learner(env, req);
  const d = await body(req);
  const cert = await env.DB.prepare('SELECT * FROM certificates WHERE code = ?').bind(clip(d.code, 40).toUpperCase()).first();
  if (!l || !cert || cert.learner_id !== l.id) return redirect('/elearning/account/');
  if (cert.emailed_at && Date.now() - new Date(cert.emailed_at.replace(' ', 'T') + 'Z').getTime() < 10 * 60e3) return redirect(`/elearning/certificate/${cert.code}/?sent=wait`);
  const ok = await sendCertificate(env, cert, l);
  return redirect(`/elearning/certificate/${cert.code}/?sent=${ok ? '1' : 'fail'}`);
}

// ---------- Worker-rendered pages ----------
async function shell(env, req, path, selector, html, title) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, req.url).toString()));
  let rw = new HTMLRewriter().on(selector, { element(el) { el.setInnerContent(html, { html: true }); } });
  if (title) rw = rw.on('#cert-title', { element(el) { el.setInnerContent(title); } });
  return withHead(rw.transform(res));
}

async function certificatePage(env, req, code) {
  const cert = await env.DB.prepare('SELECT * FROM certificates WHERE code = ?').bind(code).first();
  if (!cert) return redirect('/elearning/verify/?error=1');
  const l = await learner(env, req);
  const owner = l && l.id === cert.learner_id;
  const sent = new URL(req.url).searchParams.get('sent');
  const note = { 1: 'We have emailed your certificate again.', wait: 'We emailed it in the last few minutes. Check your inbox and junk folder before asking again.', fail: 'We could not send the email just now. Download the PDF below, and contact hello@thewavelength.co.uk if you need help.' }[sent];
  const hours = `${cert.cpd_hours} ${cert.cpd_hours === 1 ? 'hour' : 'hours'}`;
  const html = `<div class="ac-cert">
  <div class="ac-cert-card">
    <p class="ac-valid"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11" stroke="#2A7F8A" stroke-width="1.6"/><path d="M7.5 12.4l3 3 6-6.6" stroke="#2A7F8A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Genuine Wavelength Academy certificate</p>
    <dl>
      <dt>Awarded to</dt><dd class="ac-cert-name">${esc(cert.name)}</dd>
      <dt>Module</dt><dd>${esc(cert.module_title)}</dd>
      <dt>Score</dt><dd>${cert.score}%, passed</dd>
      <dt>CPD</dt><dd>${hours} of self-directed learning</dd>
      <dt>Completed</dt><dd>${fmtDate(cert.issued_on)}</dd>
      <dt>Certificate number</dt><dd>${esc(cert.code)}</dd>
    </dl>
  </div>
  <div class="ac-noprint" style="display:flex;flex-wrap:wrap;gap:12px"><a class="btn btn-teal" href="/elearning/certificate/${esc(cert.code)}.pdf" download>Download the PDF certificate</a>${owner ? `<form method="post" action="/api/academy/resend"><input type="hidden" name="code" value="${esc(cert.code)}"><button class="btn btn-ghost" type="submit">Email it to me again</button></form>` : ''}</div>
  ${note && owner ? `<p class="form-note ac-noprint" style="font-weight:600">${esc(note)}</p>` : ''}
  ${owner ? `<section class="ac-panel ac-reflect"><h3>Reflection for your portfolio</h3><p class="ac-noprint">Write a few lines under each heading, then print or save as PDF and upload it with your certificate. Nothing you type here is sent to us.</p>
    <form class="form">${[['What did I learn?', 'The key facts or skills, in your own words.'], ['How will it change my practice?', 'A patient or a shift where you will use this.'], ['What will I do next?', 'Supervised scans to log, a course, a colleague to ask.'], ['Which part of my curriculum or job does it support?', 'For example your PoCUS portfolio or your appraisal.']].map(([h, hint]) => `<label>${h}<textarea placeholder="${hint}"></textarea></label>`).join('')}
    <p class="form-note">${esc(cert.name)} · ${esc(cert.module_title)} · ${fmtDate(cert.issued_on)} · ${esc(cert.code)}</p>
    <div class="ac-noprint"><button class="btn" type="button" data-print>Print or save as PDF</button></div></form></section>` : ''}
  <p class="form-note ac-noprint">This certificate records completion of e-learning. It does not confirm competence to scan independently, which needs supervised practice and sign-off in the holder's department.</p>
</div>`;
  return shell(env, req, '/elearning/certificate/', '#cert-root', html, owner ? 'Your certificate.' : 'Certificate verified.');
}

async function accountPage(env, req) {
  const l = await learner(env, req);
  if (!l) return redirect('/elearning/');
  const { results = [] } = await env.DB.prepare('SELECT * FROM certificates WHERE learner_id = ? ORDER BY created_at DESC').bind(l.id).all();
  const mods = Object.values(DATA.modules).filter((m) => !m.draft || results.some((c) => c.module === m.slug));
  const html = `<div class="prose" style="max-width:860px">
  <p>Logged in as <strong>${esc(fullName(l))}</strong> (${esc(l.email)}). <a class="text-link" href="/elearning/logout/">Log out</a></p>
  <h2>Certificates</h2>
  ${results.length ? `<ul class="checklist">${results.map((c) => `<li><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11" stroke="#2A7F8A" stroke-width="1.4"/><path d="M7.5 12.4l3 3 6-6.6" stroke="#2A7F8A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span><a class="text-link" href="/elearning/certificate/${esc(c.code)}/">${esc(c.module_title)}</a>, ${fmtDate(c.issued_on)}, ${esc(c.code)}</span></li>`).join('')}</ul>` : '<p>No certificates yet. Pass a module assessment and your certificate appears here.</p>'}
  <h2>Modules</h2>
  <ul>${mods.map((m) => `<li><a class="text-link" href="/elearning/${m.slug}/">${esc(m.title)}</a>${results.some((c) => c.module === m.slug) ? ' · passed' : ''}</li>`).join('')}</ul>
  <p class="form-note">Your name on new certificates comes from your registration. To change it, register again on any module page with the same email and the corrected name.</p>
</div>`;
  return shell(env, req, '/elearning/account/', '#account-root', html);
}

// ---------- Router ----------
export async function handleAcademy(req, env, ctx) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (!env.DB) return withHead(new Response('The Academy is not available right now.', { status: 503 }));
  if (req.method === 'POST') {
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ ok: false, error: 'Forbidden' }, 403);
    if (p === '/api/academy/register') return register(env, req);
    if (p === '/api/academy/submit') return submit(env, req, ctx);
    if (p === '/api/academy/feedback') return feedback(env, req);
    if (p === '/api/academy/resend') return resend(env, req);
    return json({ ok: false }, 404);
  }
  if (p === '/api/academy/me') return me(env, req);
  if (p.startsWith('/api/')) return json({ ok: false }, 404);
  if (p === '/elearning/logout/' || p === '/elearning/logout') return redirect('/elearning/', { 'Set-Cookie': clearCookie });
  if (p === '/elearning/account/') return accountPage(env, req);
  if (p === '/elearning/verify/' && url.searchParams.get('code')) {
    const code = clip(url.searchParams.get('code'), 40).toUpperCase().replace(/\s+/g, '');
    const hit = await env.DB.prepare('SELECT code FROM certificates WHERE code = ?').bind(code).first();
    return redirect(hit ? `/elearning/certificate/${hit.code}/` : '/elearning/verify/?error=1');
  }
  let m = p.match(/^\/elearning\/certificate\/([A-Z0-9-]{6,40})\.pdf$/i);
  if (m) {
    const cert = await env.DB.prepare('SELECT * FROM certificates WHERE code = ?').bind(m[1].toUpperCase()).first();
    if (!cert) return redirect('/elearning/verify/?error=1');
    return new Response(certificatePdf(cert), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfName(cert)}"`, ...HEAD } });
  }
  m = p.match(/^\/elearning\/certificate\/([A-Z0-9-]{6,40})\/?$/i);
  if (m) return certificatePage(env, req, m[1].toUpperCase());
  m = p.match(/^\/elearning\/([a-z0-9-]+)\/(learn|assessment)(\/|$)/);
  if (m) {
    if (!(await learner(env, req))) return redirect(`/elearning/${m[1]}/?register=1#register`);
    const res = await env.ASSETS.fetch(req);
    return withHead(res);
  }
  return env.ASSETS.fetch(req);
}
