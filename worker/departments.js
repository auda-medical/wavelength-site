// Tailored training: enquiries from /training/ (individuals, groups and organisations; UK and international).
//   POST /api/training/enquire  saves to D1 department_enquiries, emails hello@ through ZeptoMail
//                               with the enquirer as reply-to, then redirects to /training/thanks/.
// The admin list lives at /admin/departments/ (worker/index.js handles the login); the pipeline (stage, quotation)
// is on /admin/business/training/. The table keeps its original name so earlier enquiries stay where they are.
// After migration 0014 the wider fields are stored too: enquiry type and its class, country and region, preferred
// location, budget band, how they heard (self-reported) and the campaign label of the link they arrived by.
import FORM from './department-form.json';
import { count } from './metrics.js';

const clip = (v, n) => String(v || '').trim().slice(0, n);
const pick = (form, name, allowed) => form.getAll(name).map((x) => clip(x, 120)).filter((x) => allowed.includes(x));
const one = (form, name, allowed) => { const v = clip(form.get(name), 120); return allowed.includes(v) ? v : ''; };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// International telephone numbers: digits with an optional leading +, spaces, brackets, dots and hyphens; 6 to 20 digits.
export const phoneOk = (p) => !p || (/^\+?[\d\s().-]{6,32}$/.test(p) && (p.match(/\d/g) || []).length >= 6 && (p.match(/\d/g) || []).length <= 20);
export const classOf = (type) => (FORM.types.find((t) => t.label === type) || {}).class || '';
export const regionOf = (country) => (country === 'United Kingdom' ? 'uk' : country ? 'international' : '');
// Self-reported source to a reporting channel, for the aggregate conversion counter.
const HEARD = { 'Search engine (for example Google)': 'search', LinkedIn: 'social', Instagram: 'social', Facebook: 'social', 'Wavelength newsletter': 'email', 'A colleague or word of mouth': 'word_of_mouth', 'A previous Wavelength course': 'returning', 'The Wavelength app, Pearls or Academy': 'wavelength', 'A conference or event': 'event', Other: 'other' };

const COLS = new WeakMap();
async function wideColumns(env) {
  if (COLS.has(env.DB)) return COLS.get(env.DB);
  let ok = true;
  try { await env.DB.prepare('SELECT enquiry_type, stage FROM department_enquiries LIMIT 0').all(); } catch { ok = false; }
  COLS.set(env.DB, ok);
  return ok;
}

export function readEnquiry(f) {
  const type = one(f, 'enquiry_type', FORM.types.map((t) => t.label));
  const country = one(f, 'country', FORM.countries);
  return {
    first: clip(f.get('first_name'), 80),
    last: clip(f.get('last_name'), 80),
    email: clip(f.get('email'), 160).toLowerCase(),
    phone: clip(f.get('phone'), 40),
    role: one(f, 'role', FORM.roles),
    type, cls: classOf(type),
    org: clip(f.get('organisation'), 200),
    setting: one(f, 'setting', FORM.settings),
    country, region: regionOf(country),
    location: clip(f.get('location'), 200),
    training: pick(f, 'training', FORM.training).join('; '),
    topics: pick(f, 'topics', FORM.topics).join('; '),
    size: one(f, 'group_size', FORM.sizes),
    timing: clip(f.get('timing'), 200),
    budget: one(f, 'budget', FORM.budgets),
    heard: one(f, 'heard', FORM.heard),
    campaign: clip(f.get('campaign'), 60).toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    details: clip(f.get('details'), 3000),
  };
}
// Required: name, email, enquiry type (new form) or organisation (the earlier department form), participants, privacy.
// An organisation is never required from an individual.
export function enquiryProblem(d, f) {
  if (!d.first || !d.last || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || !d.size || !f.get('confirm_privacy')) return 'missing';
  if (!d.type && !d.org) return 'missing';
  if (!phoneOk(d.phone)) return 'phone';
  return null;
}

export async function enquireTraining(env, req, ctx) {
  const f = await req.formData();
  if (clip(f.get('wl_trap'), 200)) return '/training/thanks/'; // honeypot
  const d = readEnquiry(f);
  const problem = enquiryProblem(d, f);
  if (problem) return `/training/?error=${problem === 'phone' ? 'phone' : '1'}#enquire`;
  let r;
  if (await wideColumns(env)) {
    r = await env.DB.prepare('INSERT INTO department_enquiries (first_name,last_name,email,phone,role,organisation,setting,training,topics,group_size,timing,details,enquiry_type,enquiry_class,country,region,location,budget,heard,campaign) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(d.first, d.last, d.email, d.phone, d.role, d.org, d.setting, d.training, d.topics, d.size, d.timing, d.details, d.type, d.cls, d.country, d.region, d.location, d.budget, d.heard, d.campaign).first();
  } else {
    r = await env.DB.prepare('INSERT INTO department_enquiries (first_name,last_name,email,phone,role,organisation,setting,training,topics,group_size,timing,details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(d.first, d.last, d.email, d.phone, d.role, d.org, d.setting, d.training, d.topics, d.size, d.timing, [d.type && `Enquiry type: ${d.type}`, d.country && `Country: ${d.country}`, d.location && `Location: ${d.location}`, d.budget && `Budget: ${d.budget}`, d.details].filter(Boolean).join('\n').slice(0, 3000)).first();
  }
  if (r && ctx) {
    ctx.waitUntil(notifyTeam(env, r.id, d));
    // Aggregate conversion counters: never the message, name or contact details.
    ctx.waitUntil(count(env, [['conv.enquiry', HEARD[d.heard] || 'not_given'], ['conv.enquiry_region', d.region || 'not_given'], ['conv.enquiry_class', d.cls || 'department'], ...(d.campaign ? [['conv.enquiry_campaign', d.campaign]] : [])]));
  }
  return '/training/thanks/';
}

async function notifyTeam(env, id, d) {
  const mark = (err) => env.DB.prepare(err ? 'UPDATE department_enquiries SET email_error = ? WHERE id = ?' : "UPDATE department_enquiries SET emailed_at = datetime('now') WHERE id = ?").bind(...(err ? [String(err).slice(0, 500), id] : [id])).run();
  if (!env.ZEPTOMAIL_TOKEN) return mark('Email not set up yet (ZEPTOMAIL_TOKEN missing)');
  const rows = [['Name', `${d.first} ${d.last}`], ['Email', d.email], ['Phone', d.phone], ['Enquiring for', d.type], ['Role', d.role], ['Organisation', d.org], ['Setting', d.setting], ['Country', d.country], ['Preferred location', d.location], ['Training wanted', d.training], ['Modules', d.topics], ['Participants', d.size], ['Preferred dates', d.timing], ['Budget', d.budget], ['Heard about us', d.heard], ['Campaign link', d.campaign], ['Details', d.details]].filter(([, v]) => v);
  const who = d.org || `${d.first} ${d.last}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0F1E33"><p>A new tailored training enquiry arrived through the website. Reply to this email to answer ${esc(d.first)} directly.</p><table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="vertical-align:top;color:#5B6878;white-space:nowrap">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table><p>See all enquiries: https://thewavelength.co.uk/admin/departments/</p></div>`;
  const text = `A new tailored training enquiry arrived through the website.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nSee all enquiries: https://thewavelength.co.uk/admin/departments/`;
  try {
    const res = await fetch(env.ZEPTOMAIL_API || 'https://cpaas.zoho.eu/v1.1/email', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN.replace(/^Zoho-enczapikey\s+/i, '')}` },
      body: JSON.stringify({
        from: { address: env.MAIL_FROM || 'academy@thewavelength.co.uk', name: 'Wavelength website' },
        to: [{ email_address: { address: env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk', name: 'Wavelength' } }],
        reply_to: [{ address: d.email, name: `${d.first} ${d.last}` }],
        subject: `Tailored training enquiry: ${who} (${[d.country, d.size && `${d.size} participant${d.size === '1' ? '' : 's'}`].filter(Boolean).join(', ')})`.replace(/[\r\n]/g, ' '),
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
    <td>${esc(r.created_at.slice(0, 10))}${r.stage ? `<br><span class="muted">${esc(r.stage)}</span>` : ''}</td>
    <td><b>${esc(r.first_name)} ${esc(r.last_name)}</b><br><a class="text-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? `<br>${esc(r.phone)}` : ''}${r.role ? `<br><span class="muted">${esc(r.role)}</span>` : ''}</td>
    <td>${r.enquiry_type ? `${esc(r.enquiry_type)}<br>` : ''}${r.organisation ? `<b>${esc(r.organisation)}</b><br>` : ''}${r.setting ? `${esc(r.setting)}<br>` : ''}Participants: ${esc(r.group_size)}${r.country ? `<br>${esc(r.country)}${r.location ? `, ${esc(r.location)}` : ''}` : ''}${r.timing ? `<br>When: ${esc(r.timing)}` : ''}${r.budget ? `<br>Budget: ${esc(r.budget)}` : ''}</td>
    <td>${esc(r.training)}${r.topics ? `<br><span class="muted">Modules: ${esc(r.topics)}</span>` : ''}${r.heard ? `<br><span class="muted">Heard: ${esc(r.heard)}</span>` : ''}</td>
    <td style="white-space:pre-wrap;max-width:420px">${esc(r.details)}</td>
    <td class="actions">
      <form method="post"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="contacted"><button class="btn btn-ghost small" type="submit">${r.contacted ? 'Mark not contacted' : 'Mark contacted'}</button></form>
      <form method="post" onsubmit="return confirm(this.dataset.confirm)" data-confirm="Delete the enquiry from ${esc(r.organisation || `${r.first_name} ${r.last_name}`)} permanently?"><input type="hidden" name="id" value="${r.id}"><input type="hidden" name="action" value="delete"><button class="btn btn-ghost small danger" type="submit">Delete</button></form>
    </td></tr>`).join('');
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Tailored training enquiries</h2>
  <p class="admin-summary">${results.length} enquir${results.length === 1 ? 'y' : 'ies'}, ${results.filter((r) => !r.contacted).length} not yet contacted. <a class="text-link" href="/admin/departments/enquiries.csv">Download as spreadsheet (CSV)</a> · <a class="text-link" href="/admin/business/training/">Pipeline and quotations</a> · <a class="text-link" href="/admin/volunteers/">Volunteers</a> · <a class="text-link" href="/admin/faculty/">Faculty applications</a> · <a class="text-link" href="/admin/academy/">Academy</a></p>
  ${results.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Received</th><th scope="col">Contact</th><th scope="col">Who and where</th><th scope="col">Training</th><th scope="col">In their words</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="admin-summary">No enquiries yet. They appear here as soon as someone submits the form at /training/.</p>'}`;
}

export async function departmentsAdminPost(env, req) {
  const f = await req.formData();
  const id = Number(f.get('id'));
  if (id && f.get('action') === 'delete') await env.DB.prepare('DELETE FROM department_enquiries WHERE id = ?').bind(id).run();
  if (id && f.get('action') === 'contacted') await env.DB.prepare('UPDATE department_enquiries SET contacted = 1 - contacted WHERE id = ?').bind(id).run();
}
