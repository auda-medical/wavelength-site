// Training for your department: enquiries from /training/.
//   POST /api/training/enquire  saves to D1 department_enquiries, emails hello@ through ZeptoMail
//                               with the enquirer as reply-to, then redirects to /training/thanks/.
// The admin list lives at /volunteer/admin/departments/ (worker/index.js handles the login).
import FORM from './department-form.json';

const clip = (v, n) => String(v || '').trim().slice(0, n);
const pick = (form, name, allowed) => form.getAll(name).map((x) => clip(x, 120)).filter((x) => allowed.includes(x));
const one = (form, name, allowed) => { const v = clip(form.get(name), 120); return allowed.includes(v) ? v : ''; };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function enquireTraining(env, req, ctx) {
  const f = await req.formData();
  if (clip(f.get('website'), 200)) return '/training/thanks/'; // honeypot
  const d = {
    first: clip(f.get('first_name'), 80),
    last: clip(f.get('last_name'), 80),
    email: clip(f.get('email'), 160).toLowerCase(),
    phone: clip(f.get('phone'), 40),
    role: one(f, 'role', FORM.roles),
    org: clip(f.get('organisation'), 200),
    setting: one(f, 'setting', FORM.settings),
    training: pick(f, 'training', FORM.training).join('; '),
    topics: pick(f, 'topics', FORM.topics).join('; '),
    size: one(f, 'group_size', FORM.sizes),
    timing: clip(f.get('timing'), 200),
    details: clip(f.get('details'), 3000),
  };
  const ok = d.first && d.last && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) && d.org && d.size && f.get('confirm_privacy');
  if (!ok) return '/training/?error=1#enquire';
  const r = await env.DB.prepare('INSERT INTO department_enquiries (first_name,last_name,email,phone,role,organisation,setting,training,topics,group_size,timing,details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(d.first, d.last, d.email, d.phone, d.role, d.org, d.setting, d.training, d.topics, d.size, d.timing, d.details).first();
  if (r && ctx) ctx.waitUntil(notifyTeam(env, r.id, d));
  return '/training/thanks/';
}

async function notifyTeam(env, id, d) {
  const mark = (err) => env.DB.prepare(err ? 'UPDATE department_enquiries SET email_error = ? WHERE id = ?' : "UPDATE department_enquiries SET emailed_at = datetime('now') WHERE id = ?").bind(...(err ? [String(err).slice(0, 500), id] : [id])).run();
  if (!env.ZEPTOMAIL_TOKEN) return mark('Email not set up yet (ZEPTOMAIL_TOKEN missing)');
  const rows = [['Name', `${d.first} ${d.last}`], ['Email', d.email], ['Phone', d.phone], ['Role', d.role], ['Organisation', d.org], ['Setting', d.setting], ['Training wanted', d.training], ['Topics', d.topics], ['Group size', d.size], ['Timing', d.timing], ['Details', d.details]].filter(([, v]) => v);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0F1E33"><p>A new department training enquiry arrived through the website. Reply to this email to answer ${esc(d.first)} directly.</p><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#5B6878;white-space:nowrap">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table><p>See all enquiries: https://thewavelength.co.uk/volunteer/admin/departments/</p></div>`;
  const text = `A new department training enquiry arrived through the website.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nSee all enquiries: https://thewavelength.co.uk/volunteer/admin/departments/`;
  try {
    const res = await fetch(env.ZEPTOMAIL_API || 'https://api.zeptomail.eu/v1.1/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN.replace(/^Zoho-enczapikey\s+/i, '')}` },
      body: JSON.stringify({
        from: { address: env.MAIL_FROM || 'academy@thewavelength.co.uk', name: 'Wavelength website' },
        to: [{ email_address: { address: env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk', name: 'Wavelength' } }],
        reply_to: [{ address: d.email, name: `${d.first} ${d.last}` }],
        subject: `Department training enquiry: ${d.org} (${d.size})`,
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

export async function departmentsAdminHtml(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM department_enquiries ORDER BY created_at DESC LIMIT 500').all();
  const rows = results.map((r) => `<tr${r.contacted ? ' class="done"' : ''}>
    <td>${esc(r.created_at.slice(0, 10))}</td>
    <td><b>${esc(r.first_name)} ${esc(r.last_name)}</b><br><a class="text-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? `<br>${esc(r.phone)}` : ''}${r.role ? `<br><span class="muted">${esc(r.role)}</span>` : ''}</td>
    <td><b>${esc(r.organisation)}</b>${r.setting ? `<br>${esc(r.setting)}` : ''}<br>Group: ${esc(r.group_size)}${r.timing ? `<br>When: ${esc(r.timing)}` : ''}</td>
    <td>${esc(r.training)}${r.topics ? `<br><span class="muted">Topics: ${esc(r.topics)}</span>` : ''}</td>
    <td style="white-space:pre-wrap;max-width:420px">${esc(r.details)}</td>
    <td class="actions">
      <form method="post"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="contacted"><button class="btn btn-ghost small" type="submit">${r.contacted ? 'Mark not contacted' : 'Mark contacted'}</button></form>
      <form method="post" onsubmit="return confirm('Delete the enquiry from ${esc(r.organisation)} permanently?')"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="delete"><button class="btn btn-ghost small danger" type="submit">Delete</button></form>
    </td></tr>`).join('');
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Department training enquiries</h2>
  <p class="admin-summary">${results.length} enquir${results.length === 1 ? 'y' : 'ies'}, ${results.filter((r) => !r.contacted).length} not yet contacted. <a class="text-link" href="/volunteer/admin/departments/enquiries.csv">Download as spreadsheet (CSV)</a> · <a class="text-link" href="/volunteer/admin/">Volunteers</a> · <a class="text-link" href="/volunteer/admin/faculty/">Faculty applications</a> · <a class="text-link" href="/volunteer/admin/academy/">Academy</a></p>
  ${results.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Received</th><th scope="col">Contact</th><th scope="col">Organisation</th><th scope="col">Training</th><th scope="col">In their words</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="admin-summary">No enquiries yet. They appear here as soon as someone submits the form at /training/.</p>'}`;
}

export async function departmentsAdminPost(env, req) {
  const f = await req.formData();
  const id = Number(f.get('id'));
  if (id && f.get('action') === 'delete') await env.DB.prepare('DELETE FROM department_enquiries WHERE id = ?').bind(id).run();
  if (id && f.get('action') === 'contacted') await env.DB.prepare('UPDATE department_enquiries SET contacted = 1 - contacted WHERE id = ?').bind(id).run();
}
