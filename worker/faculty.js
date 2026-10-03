// "Teach with us" faculty applications.
//   POST /api/faculty/apply   public form at /faculty/join/ saves to D1 faculty_applications,
//                             emails the team at hello@ through ZeptoMail, then redirects to /faculty/join/thanks/.
import FORM from './faculty-form.json';
const { professions: PROFESSIONS, experience: EXPERIENCE, credentials: CREDENTIALS, applications: APPLICATIONS, interests: INTERESTS } = FORM;
// The admin list lives at /volunteer/admin/faculty/ (worker/index.js handles the login).


const clip = (v, n) => String(v || '').trim().slice(0, n);
const pick = (form, name, allowed) => form.getAll(name).map((x) => clip(x, 120)).filter((x) => allowed.includes(x));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function applyFaculty(env, req, ctx) {
  const f = await req.formData();
  if (clip(f.get('website'), 200)) return '/faculty/join/thanks/'; // honeypot: bots fill it, people never see it
  const d = {
    first: clip(f.get('first_name'), 80),
    last: clip(f.get('last_name'), 80),
    email: clip(f.get('email'), 160).toLowerCase(),
    phone: clip(f.get('phone'), 40),
    profession: PROFESSIONS.includes(clip(f.get('profession'), 80)) ? clip(f.get('profession'), 80) : '',
    specialty: clip(f.get('specialty'), 120),
    org: clip(f.get('organisation'), 160),
    registration: clip(f.get('registration'), 60),
    experience: EXPERIENCE.includes(clip(f.get('experience'), 40)) ? clip(f.get('experience'), 40) : '',
    credentials: pick(f, 'credentials', CREDENTIALS).join('; '),
    applications: pick(f, 'applications', APPLICATIONS).join('; '),
    interests: pick(f, 'interests', INTERESTS).join('; '),
    details: clip(f.get('details'), 3000),
  };
  const ok = d.first && d.last && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) && d.profession && d.experience && d.details && f.get('confirm_privacy');
  if (!ok) return '/faculty/join/?error=1';
  const r = await env.DB.prepare('INSERT INTO faculty_applications (first_name,last_name,email,phone,profession,specialty,organisation,registration,experience,credentials,applications,interests,details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(d.first, d.last, d.email, d.phone, d.profession, d.specialty, d.org, d.registration, d.experience, d.credentials, d.applications, d.interests, d.details).first();
  if (r && ctx) ctx.waitUntil(notifyTeam(env, r.id, d));
  return '/faculty/join/thanks/';
}

async function notifyTeam(env, id, d) {
  const mark = (err) => env.DB.prepare(err ? 'UPDATE faculty_applications SET email_error = ? WHERE id = ?' : "UPDATE faculty_applications SET emailed_at = datetime('now') WHERE id = ?").bind(...(err ? [String(err).slice(0, 500), id] : [id])).run();
  if (!env.ZEPTOMAIL_TOKEN) return mark('Email not set up yet (ZEPTOMAIL_TOKEN missing)');
  const rows = [['Name', `${d.first} ${d.last}`], ['Email', d.email], ['Phone', d.phone], ['Role', d.profession], ['Specialty', d.specialty], ['Workplace', d.org], ['Registration', d.registration], ['Ultrasound experience', d.experience], ['Credentials', d.credentials], ['Applications', d.applications], ['Interested in', d.interests], ['Experience and credentials', d.details]].filter(([, v]) => v);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0F1E33"><p>A new faculty application arrived through the website.</p><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#5B6878;white-space:nowrap">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table><p>See all applications: https://thewavelength.co.uk/volunteer/admin/faculty/</p></div>`;
  const text = `A new faculty application arrived through the website.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nSee all applications: https://thewavelength.co.uk/volunteer/admin/faculty/`;
  try {
    const res = await fetch(env.ZEPTOMAIL_API || 'https://api.zeptomail.eu/v1.1/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN.replace(/^Zoho-enczapikey\s+/i, '')}` },
      body: JSON.stringify({
        from: { address: env.MAIL_FROM || 'academy@thewavelength.co.uk', name: 'Wavelength website' },
        to: [{ email_address: { address: env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk', name: 'Wavelength' } }],
        reply_to: [{ address: d.email, name: `${d.first} ${d.last}` }],
        subject: `Faculty application: ${d.first} ${d.last} (${d.profession})`,
        htmlbody: html,
        textbody: text,
        track_clicks: false,
        track_opens: false,
      }),
    });
    if (!res.ok) throw new Error(`ZeptoMail ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return mark(null);
  } catch (e) {
    return mark(e.message || e);
  }
}

export async function facultyAdminHtml(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM faculty_applications ORDER BY created_at DESC LIMIT 500').all();
  const rows = results.map((r) => `<tr${r.contacted ? ' class="done"' : ''}>
    <td>${esc(r.created_at.slice(0, 10))}</td>
    <td><b>${esc(r.first_name)} ${esc(r.last_name)}</b><br><a class="text-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? `<br>${esc(r.phone)}` : ''}</td>
    <td>${esc(r.profession)}${r.specialty ? `<br>${esc(r.specialty)}` : ''}${r.organisation ? `<br>${esc(r.organisation)}` : ''}${r.registration ? `<br>Reg: ${esc(r.registration)}` : ''}</td>
    <td>${esc(r.experience)}${r.credentials ? `<br>${esc(r.credentials)}` : ''}${r.applications ? `<br><span class="muted">Teaches: ${esc(r.applications)}</span>` : ''}${r.interests ? `<br><span class="muted">Wants to: ${esc(r.interests)}</span>` : ''}</td>
    <td style="white-space:pre-wrap;max-width:420px">${esc(r.details)}</td>
    <td class="actions">
      <form method="post"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="contacted"><button class="btn btn-ghost small" type="submit">${r.contacted ? 'Mark not contacted' : 'Mark contacted'}</button></form>
      <form method="post" onsubmit="return confirm('Delete ${esc(r.first_name)} ${esc(r.last_name)} permanently?')"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="delete"><button class="btn btn-ghost small danger" type="submit">Delete</button></form>
    </td></tr>`).join('');
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Faculty applications</h2>
  <p class="admin-summary">${results.length} application${results.length === 1 ? '' : 's'}, ${results.filter((r) => !r.contacted).length} not yet contacted. <a class="text-link" href="/volunteer/admin/faculty/applications.csv">Download as spreadsheet (CSV)</a> · <a class="text-link" href="/volunteer/admin/">Volunteers</a> · <a class="text-link" href="/volunteer/admin/academy/">Academy</a></p>
  ${results.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Received</th><th scope="col">Name and contact</th><th scope="col">Role</th><th scope="col">Ultrasound</th><th scope="col">In their words</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="admin-summary">No applications yet. They appear here as soon as someone submits the form at /faculty/join/.</p>'}`;
}

export async function facultyAdminPost(env, req) {
  const f = await req.formData();
  const id = Number(f.get('id'));
  if (id && f.get('action') === 'delete') await env.DB.prepare('DELETE FROM faculty_applications WHERE id = ?').bind(id).run();
  if (id && f.get('action') === 'contacted') await env.DB.prepare('UPDATE faculty_applications SET contacted = 1 - contacted WHERE id = ?').bind(id).run();
}
