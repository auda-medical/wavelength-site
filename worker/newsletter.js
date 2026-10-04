// Wavelength newsletter automation through the Zoho Campaigns API (EU data centre).
//
// Settings in D1 `settings` (never committed):
//   zoho_client_id, zoho_client_secret  from the Zoho API console (server-based client,
//                                        redirect URI https://thewavelength.co.uk/volunteer/admin/newsletter/callback/)
//   zoho_refresh_token                   stored when an admin clicks "Connect Zoho Campaigns"
//   zoho_list_key, zoho_topic_id         found automatically on first use, or set by hand
//   newsletter_auto                      "off" pauses the weekly send
//
// Weekly send: the Monday scheduled task writes src/email/pearl/index.html and issue.json and pushes.
// The Worker cron runs on Tuesdays and sends at 7:30am UK time: it reads /email/pearl/issue.json,
// skips anything already sent or older than eight days, creates a campaign from the live page and sends it.
// Every send is recorded in D1 `newsletter_sends`.

const ACCOUNTS = 'https://accounts.zoho.eu';
const API = 'https://campaigns.zoho.eu/api/v1.1';
const SITE = 'https://thewavelength.co.uk';
const REDIRECT = `${SITE}/volunteer/admin/newsletter/callback/`;
const SCOPES = 'ZohoCampaigns.campaign.ALL,ZohoCampaigns.contact.ALL';
const LIST_NAME = 'Wavelength newsletter';
const FROM_EMAIL = 'hello@thewavelength.co.uk';
const FROM_NAME = 'Wavelength';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function getSettings(env) {
  const { results = [] } = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'zoho_%' OR key LIKE 'newsletter_%'").all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}
async function put(env, k, v) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v)).run();
}

export async function zohoConnectUrl(env, state) {
  const s = await getSettings(env);
  if (!s.zoho_client_id) return null;
  const q = new URLSearchParams({ scope: SCOPES, client_id: s.zoho_client_id, response_type: 'code', access_type: 'offline', prompt: 'consent', redirect_uri: REDIRECT, state });
  return `${ACCOUNTS}/oauth/v2/auth?${q}`;
}

export async function zohoCallback(env, code) {
  const s = await getSettings(env);
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: s.zoho_client_id, client_secret: s.zoho_client_secret, redirect_uri: REDIRECT, code }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.refresh_token) return j.error || 'no refresh token returned';
  await put(env, 'zoho_refresh_token', j.refresh_token);
  if (j.access_token) { await put(env, 'zoho_access_token', j.access_token); await put(env, 'zoho_access_exp', Date.now() + (Number(j.expires_in) || 3600) * 1000 - 120000); }
  return '';
}

async function token(env) {
  const s = await getSettings(env);
  if (s.zoho_access_token && Number(s.zoho_access_exp) > Date.now()) return s.zoho_access_token;
  if (!s.zoho_refresh_token) throw new Error('Zoho Campaigns is not connected');
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.zoho_client_id, client_secret: s.zoho_client_secret, refresh_token: s.zoho_refresh_token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('Zoho token refresh failed: ' + (j.error || r.status));
  await put(env, 'zoho_access_token', j.access_token);
  await put(env, 'zoho_access_exp', Date.now() + (Number(j.expires_in) || 3600) * 1000 - 120000);
  return j.access_token;
}

async function api(env, path, params = {}, method = 'POST') {
  const t = await token(env);
  const q = new URLSearchParams({ resfmt: 'JSON', ...params });
  const url = method === 'GET' ? `${API}/${path}?${q}` : `${API}/${path}`;
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${t}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    body: method === 'GET' ? undefined : q,
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { code: String(r.status), message: text.slice(0, 300) }; }
}

async function listKey(env) {
  const s = await getSettings(env);
  if (s.zoho_list_key) return s.zoho_list_key;
  const j = await api(env, 'getmailinglists', { sort: 'asc', fromindex: '1', range: '100' }, 'GET');
  const hit = (j.list_of_details || []).find((l) => String(l.listname).trim().toLowerCase() === LIST_NAME.toLowerCase());
  if (!hit) throw new Error(`List "${LIST_NAME}" not found in Zoho Campaigns`);
  await put(env, 'zoho_list_key', hit.listkey);
  return hit.listkey;
}

async function topicId(env) {
  const s = await getSettings(env);
  if (s.zoho_topic_id) return s.zoho_topic_id;
  const j = await api(env, 'topics', {}, 'GET');
  const all = j.topics || j.topic_details || j.data || [];
  const first = Array.isArray(all) ? all[0] : null;
  const id = first && (first.topic_id || first.topicId || first.id);
  if (id) { await put(env, 'zoho_topic_id', id); return String(id); }
  return '';
}

// Add someone to the list. Zoho sends its own confirmation email (double opt-in) before they join.
export async function zohoSubscribe(env, { email, first, role, source }) {
  try {
    const s = await getSettings(env);
    if (!s.zoho_refresh_token) return false;
    const info = { 'Contact Email': email, 'First Name': first || '' };
    if (role) info['Role'] = role;
    const j = await api(env, 'json/listsubscribe', { listkey: await listKey(env), contactinfo: JSON.stringify(info), source: source || 'Website' });
    return j.status === 'success' || j.code === '0';
  } catch { return false; }
}

async function loadIssue(env) {
  const r = await env.ASSETS.fetch(new Request(`${SITE}/email/pearl/issue.json`));
  if (!r.ok) throw new Error('issue.json missing');
  return r.json();
}

async function record(env, slug, status, detail, campaignKey = '') {
  await env.DB.prepare('INSERT INTO newsletter_sends (slug, status, detail, campaign_key) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET status = excluded.status, detail = excluded.detail, campaign_key = COALESCE(NULLIF(excluded.campaign_key, \'\'), newsletter_sends.campaign_key), updated_at = datetime(\'now\')')
    .bind(slug, status, String(detail || '').slice(0, 500), campaignKey).run();
}

// Send this week's issue. force skips the age check (admin "send now").
export async function sendIssue(env, { force = false } = {}) {
  const issue = await loadIssue(env);
  if (!issue.ready) return { ok: false, msg: 'Issue is on hold (ready is false).' };
  const done = await env.DB.prepare('SELECT status FROM newsletter_sends WHERE slug = ?').bind(issue.slug).first();
  if (done && (done.status === 'sent' || done.status === 'sending')) return { ok: false, msg: `Already sent: ${issue.slug}` };
  const age = (Date.now() - new Date(issue.drafted + 'T00:00:00Z').getTime()) / 864e5;
  if (!force && age > 8) { await record(env, issue.slug, 'skipped', `Draft is ${Math.floor(age)} days old`); return { ok: false, msg: 'Draft too old, skipped.' }; }
  try {
    await record(env, issue.slug, 'sending', 'Creating campaign');
    const params = {
      campaignname: `${issue.campaignName || issue.subject} (${new Date().toISOString().slice(0, 10)})`,
      from_email: FROM_EMAIL, from_name: FROM_NAME, subject: issue.subject,
      content_url: `${SITE}/email/pearl/?v=${encodeURIComponent(issue.slug)}`,
      list_details: JSON.stringify({ [await listKey(env)]: [] }),
    };
    const tid = await topicId(env);
    if (tid) params.topicId = tid;
    const c = await api(env, 'createCampaign', params);
    const key = c.campaignKey || c.campaignkey || (c.response && c.response.campaignkey);
    if (!key) throw new Error('createCampaign: ' + (c.message || JSON.stringify(c).slice(0, 300)));
    const sres = await api(env, 'sendcampaign', { campaignkey: key });
    const st = (sres.response && (sres.response.campaign_status || sres.response.code)) || sres.code;
    if (sres.response ? String(sres.response.code) !== '200' : String(sres.code) !== '200') throw new Error('sendcampaign: ' + (sres.message || (sres.response && sres.response.message) || JSON.stringify(sres).slice(0, 300)));
    await record(env, issue.slug, 'sent', `Campaign ${key} ${st}`, key);
    return { ok: true, msg: `Sent ${issue.subject}` };
  } catch (e) {
    await record(env, issue.slug, 'failed', e.message);
    return { ok: false, msg: e.message };
  }
}

// Cron handler: Tuesdays, only at 7am UK local time (the cron fires at 06:30 and 07:30 UTC).
export async function scheduledNewsletter(env) {
  const s = await getSettings(env);
  if (s.newsletter_auto === 'off' || !s.zoho_refresh_token) return;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === 'weekday').value, hr = Number(parts.find((p) => p.type === 'hour').value);
  if (wd !== 'Tue' || hr !== 7) return;
  await sendIssue(env);
}

export async function newsletterAdminHtml(env, msg) {
  const s = await getSettings(env);
  let issue = null; try { issue = await loadIssue(env); } catch { /* none */ }
  const { results = [] } = await env.DB.prepare('SELECT * FROM newsletter_sends ORDER BY updated_at DESC LIMIT 30').all();
  const connected = !!s.zoho_refresh_token;
  const status = !s.zoho_client_id ? 'Zoho API client not set up yet.' : connected ? 'Connected to Zoho Campaigns.' : 'Not connected.';
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Newsletter</h2>
  <p class="admin-summary">${esc(status)} Automatic weekly send: <b>${s.newsletter_auto === 'off' ? 'paused' : 'on'}</b>, Tuesdays at 7:30am UK time, to the Zoho list "${LIST_NAME}". <a class="text-link" href="/volunteer/admin/">Volunteers</a> · <a class="text-link" href="/volunteer/admin/academy/">Academy</a></p>
  ${msg ? `<p class="form-note" style="font-weight:600">${esc(msg)}</p>` : ''}
  ${issue ? `<p class="admin-summary">This week: <b>${esc(issue.subject)}</b> (drafted ${esc(issue.drafted)}${issue.ready ? '' : ', on hold'}). <a class="text-link" href="/email/pearl/" target="_blank" rel="noopener">Preview</a></p>` : ''}
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 32px">
    ${s.zoho_client_id ? `<a class="btn btn-ghost small" href="/volunteer/admin/newsletter/connect/">${connected ? 'Reconnect' : 'Connect'} Zoho Campaigns</a>` : ''}
    <form method="post"><input type="hidden" name="action" value="toggle"><button class="btn btn-ghost small" type="submit">${s.newsletter_auto === 'off' ? 'Resume' : 'Pause'} automatic sending</button></form>
    ${connected ? `<form method="post" onsubmit="return confirm('Send this week\\'s issue to the whole list now?')"><input type="hidden" name="action" value="send"><button class="btn small" type="submit">Send this week's issue now</button></form>` : ''}
  </div>
  ${connected ? '' : `<form class="form pw-form" method="post" style="max-width:560px;margin-bottom:32px"><input type="hidden" name="action" value="client"><p class="admin-summary">Step 1: paste the Client ID and Client Secret from the Zoho API console (server-based application, redirect URI ${REDIRECT}). Step 2: click Connect.</p><label>Client ID<input name="client_id" autocomplete="off" required maxlength="200" value="${esc(s.zoho_client_id || '')}"></label><label>Client Secret<input name="client_secret" type="password" autocomplete="off" required maxlength="200"></label><button class="btn btn-ghost small" type="submit">Save</button></form>`}
  ${results.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Updated</th><th scope="col">Issue</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead><tbody>${results.map((r) => `<tr><td>${esc(r.updated_at)}</td><td>${esc(r.slug)}</td><td>${esc(r.status)}</td><td>${esc(r.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No issues sent yet.</p>'}`;
}

export async function newsletterAdminPost(env, f) {
  const a = String(f.get('action') || '');
  if (a === 'toggle') { const s = await getSettings(env); await put(env, 'newsletter_auto', s.newsletter_auto === 'off' ? 'on' : 'off'); return 'Saved.'; }
  if (a === 'client') {
    const id = String(f.get('client_id') || '').trim().slice(0, 200), sec = String(f.get('client_secret') || '').trim().slice(0, 200);
    if (!id || !sec) return 'Enter both values.';
    await put(env, 'zoho_client_id', id); await put(env, 'zoho_client_secret', sec);
    return 'Saved. Now click Connect Zoho Campaigns.';
  }
  if (a === 'send') return (await sendIssue(env, { force: true })).msg;
  return '';
}
