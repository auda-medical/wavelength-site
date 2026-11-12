// Wavelength newsletter automation through the Zoho Campaigns API (EU data centre).
//
// Settings in D1 `settings` (never committed):
//   zoho_client_id, zoho_client_secret  from the Zoho API console (server-based client,
//                                        redirect URI https://thewavelength.co.uk/volunteer/admin/newsletter/callback/)
//   zoho_refresh_token                   stored when an admin clicks "Connect Zoho Campaigns"
//   zoho_list_key, zoho_topic_id         found automatically on first use, or set by hand
//   newsletter_auto                      "off" pauses the weekly send
//
//   newsletter_failing_since             first Tuesday of a run of failed sends (cleared by a send)
//
// Weekly send: see "Weekly send" below. Every send is recorded in D1 `newsletter_sends`.

const ACCOUNTS = 'https://accounts.zoho.eu';
const API = 'https://campaigns.zoho.eu/api/v1.1';
const SITE = 'https://thewavelength.co.uk';
// The redirect URI stays the one registered in the Zoho API console. The Worker forwards it, with its query, to
// /admin/newsletter/callback/. To move it, add the new URI in the Zoho API console first, then change it here.
const REDIRECT = `${SITE}/volunteer/admin/newsletter/callback/`;
const SCOPES = 'ZohoCampaigns.campaign.ALL,ZohoCampaigns.contact.ALL';
const LIST_NAME = 'Wavelength newsletter';
const FROM_EMAIL = 'hello@thewavelength.co.uk';
const FROM_NAME = 'Wavelength';

import { queueStmt, deliver } from './notify.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
  // An error from Zoho (invalid_code, invalid_client and the like) means the connection must be made again by hand;
  // a bare HTTP status is Zoho being unwell, and the next hourly run tries again.
  if (!j.access_token) throw Object.assign(new Error('Zoho token refresh failed: ' + (j.error || r.status)), j.error ? { hands: 'reconnect' } : {});
  await put(env, 'zoho_access_token', j.access_token);
  await put(env, 'zoho_access_exp', Date.now() + (Number(j.expires_in) || 3600) * 1000 - 120000);
  return j.access_token;
}

async function api(env, path, params = {}, method = 'POST', inQuery = false) {
  const t = await token(env);
  const q = new URLSearchParams({ resfmt: 'JSON', ...params });
  const url = method === 'GET' || inQuery ? `${API}/${path}?${q}` : `${API}/${path}`;
  if (inQuery) { method = 'POST'; }
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${t}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    body: method === 'GET' || inQuery ? undefined : q,
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
  const all = j.topicDetails || j.topics || j.topic_details || j.data || [];
  const first = Array.isArray(all) ? all[0] : null;
  const id = first && (first.topic_id || first.topicId || first.id);
  if (id) { await put(env, 'zoho_topic_id', id); return String(id); }
  return '';
}

// Add someone to the list. Zoho sends its own confirmation email (double opt-in) before they join.
// Read-only check: token refresh, list lookup, topics. Sends nothing.
async function testConnection(env) {
  const out = [];
  try { await token(env); out.push('Token: OK'); } catch (e) { return 'Token failed: ' + e.message; }
  try {
    const j = await api(env, 'getmailinglists', { sort: 'asc', fromindex: '1', range: '100' }, 'GET');
    const lists = j.list_of_details || [];
    if (!lists.length) out.push('Lists: none returned (' + String(j.message || j.code || JSON.stringify(j)).slice(0, 160) + ')');
    else out.push('Lists: ' + lists.map((l) => `${l.listname} (${l.noofcontacts} contacts, no ${l.listunino})`).join(', '));
    await listKey(env); out.push(`Newsletter list found`);
  } catch (e) { out.push('List check failed: ' + e.message); }
  try {
    const t = await api(env, 'topics', {}, 'GET');
    const id = await topicId(env);
    out.push(id ? 'Topic: OK' : 'Topic: none (' + String(t.message || t.code || '').slice(0, 160) + ')');
  } catch (e) { out.push('Topic check failed: ' + e.message); }
  return out.join(' · ');
}

export async function zohoSubscribe(env, { email, first, role, source }) {
  try {
    const s = await getSettings(env);
    if (!s.zoho_refresh_token) return false;
    const info = { 'Contact Email': email, 'First Name': first || '' };
    if (role) info['Role'] = role;
    const tid = await topicId(env);
    // Contacts must join the campaign topic, or Zoho excludes them at send time ("No lists selected").
    const j = await api(env, 'json/listsubscribe', { listkey: await listKey(env), contactinfo: JSON.stringify(info), source: source || 'Website', ...(tid ? { topic_id: tid } : {}) }, 'POST', true);
    return j.status === 'success' || j.code === '0';
  } catch { return false; }
}


// Create a draft campaign and confirm Zoho attached the newsletter list. Tries Zoho's documented
// formats in turn and remembers the one that works (setting zoho_list_format). Sends nothing.
let LAST_DETAILS = '';
const FORMATS = ['query-quoted', 'query-bare', 'body-bare'];
async function createVerified(env, issue, now = Date.now()) {
  const lk = await listKey(env);
  const tid = await topicId(env);
  const s = await getSettings(env);
  const order = s.zoho_list_format ? [s.zoho_list_format, ...FORMATS.filter((f) => f !== s.zoho_list_format)] : FORMATS;
  const tried = [];
  for (const fmt of order) {
    const params = {
      campaignname: `${issue.campaignName || issue.subject} (${new Date(now).toISOString().slice(0, 10)})`,
      from_email: FROM_EMAIL, from_name: FROM_NAME, subject: issue.subject,
      content_url: `${SITE}/api/newsletter/pearl/${encodeURIComponent(issue.slug)}/`,
      list_details: fmt.endsWith('quoted') ? JSON.stringify({ [lk]: [] }) : `{${lk}:[]}`,
    };
    if (tid) params.topicId = tid;
    const c = await api(env, 'createCampaign', params, 'POST', fmt.startsWith('query'));
    const key = c.campaignKey || c.campaignkey || (c.response && c.response.campaignkey);
    if (!key) { tried.push(`${fmt}: ${c.message || c.code}`); continue; }
    const d = await api(env, 'getcampaigndetails', { campaignkey: key, campaigntype: 'normal' }, 'GET');
    const lists = findLists(d);
    const picks = {}; const grab = (o, path) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (/list|recipient|contact/i.test(k)) picks[path + k] = v; grab(v, path + k + '.'); } }; grab(d, '');
    LAST_DETAILS = JSON.stringify({ subs: d.total_subscribers_count, status: d.campaign_status, seg: d.segments_info, ver: d.version, st: d.status, lists: (d.associated_mailing_lists || []).map((l) => [l.listname, l.contactscount, l.liststatus]), cd: Object.fromEntries(Object.entries((d['campaign-details'] || [])[0] || {}).filter(([k]) => /topic|email_type|content|list|recip|count|status/i.test(k))) });
    if (lists.length) { if (s.zoho_list_format !== fmt) await put(env, 'zoho_list_format', fmt); return key; }
    tried.push(`${fmt}: no list attached`);
  }
  throw new Error('List not attached. Tried ' + tried.join('; '));
}
function findLists(d) {
  const seen = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (/mailing_lists|mailinglists|list_details/i.test(k) && v) {
        const arr = Array.isArray(v) ? v : Object.values(v);
        for (const x of arr) if (x && (x.listkey || x.listname || x.list_name)) seen.push(x);
      }
      walk(v);
    }
  };
  walk(d);
  return seen;
}

// ---------- Weekly send (November 2026) ----------
// The build writes /email/pearl/queue.json (every queued pearl in order, lib/pearl-issue.js) and one email page per
// issue at /email/pearl/<slug>/. Each Tuesday the cron sends the first ready issue in the queue that newsletter_sends
// does not show as sent, so an issue that failed, or a week that was missed, goes out first the next time and the
// queue carries on in order from there. Nothing needs preparing by hand each week.
//   Times       crons every hour from 06:30 to 17:30 UTC on Tuesdays (worker/cron.js). The first send is at 7:30am
//               UK time; until one issue has gone out that week, every later run tries again (the last at 5:30pm in
//               winter, 6:30pm in summer).
//   One a week  a send in the last three days ends the week's runs, so a retry never sends a second issue.
//   Duplicates  a row is 'sending' while Zoho works. The campaign key is saved before the send call, so if the answer
//               is lost the next run asks Zoho whether that campaign went out before doing anything else.
//   Owner       emailed (hello@, through the notification outbox) only when a person must act: Zoho needs
//               reconnecting, the list is missing, the queue is empty or nearly so, Zoho cannot say whether a campaign
//               went out, or sending has failed two Tuesdays running. At most one email per reason a day.
const QUEUE_URL = `${SITE}/email/pearl/queue.json`;
const RETRY_UNTIL_UTC_HOUR = 17; // the last Tuesday cron (worker/cron.js)
const sqlTime = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19); // D1 datetime('now') format
const london = (t) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
  const g = (k) => parts.find((p) => p.type === k).value;
  return { wd: g('weekday'), hr: Number(g('hour')) % 24, day: `${g('year')}-${g('month')}-${g('day')}` };
};
const monthLabel = (t) => new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });

export async function loadQueue(env) {
  const r = await env.ASSETS.fetch(new Request(QUEUE_URL));
  if (!r.ok) throw new Error('queue.json missing');
  const j = await r.json();
  return Array.isArray(j.issues) ? j.issues : [];
}
async function sends(env) {
  const { results = [] } = await env.DB.prepare('SELECT slug, status, detail, campaign_key, updated_at FROM newsletter_sends').all();
  return Object.fromEntries(results.map((r) => [r.slug, r]));
}
// The next issue to send: the first ready one not sent. left: ready issues still to send after it.
export async function nextIssue(env) {
  const queue = await loadQueue(env), done = await sends(env);
  const todo = queue.filter((it) => it.ready && !(done[it.slug] && done[it.slug].status === 'sent'));
  return { issue: todo[0] || null, left: Math.max(todo.length - 1, 0), total: queue.length };
}

async function record(env, slug, status, detail, campaignKey = '', now = Date.now()) {
  await env.DB.prepare('INSERT INTO newsletter_sends (slug, status, detail, campaign_key, created_at, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET status = excluded.status, detail = excluded.detail, campaign_key = COALESCE(NULLIF(excluded.campaign_key, \'\'), newsletter_sends.campaign_key), updated_at = excluded.updated_at')
    .bind(slug, status, String(detail || '').slice(0, 500), campaignKey, sqlTime(now), sqlTime(now)).run();
}

// What Zoho says about a campaign: 'sent' (sent, sending, scheduled or stopped part way: never send it again),
// 'draft' (created, never sent) or 'unknown'.
export async function campaignState(env, key) {
  const d = await api(env, 'getcampaigndetails', { campaignkey: key, campaigntype: 'normal' }, 'GET');
  const states = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (/status/i.test(k) && typeof v === 'string') states.push(v); else walk(v); } };
  walk(d);
  if (states.some((s) => /sent|sending|progress|schedul|complet|stop|pause/i.test(s))) return 'sent';
  if (states.some((s) => /draft/i.test(s))) return 'draft';
  return 'unknown';
}

// Rows left at 'sending' by a run that stopped or lost Zoho's answer. Returns why this run must stop, or null.
async function settle(env, now) {
  const { results = [] } = await env.DB.prepare("SELECT slug, campaign_key, updated_at FROM newsletter_sends WHERE status = 'sending'").all();
  for (const r of results) {
    const age = now - Date.parse(String(r.updated_at).replace(' ', 'T') + 'Z');
    if (!r.campaign_key) {
      // Stopped before Zoho created a campaign: nothing went out. A run still working is given 15 minutes.
      if (age < 15 * 60e3) return { busy: `A send of ${r.slug} is still in progress.` };
      await record(env, r.slug, 'failed', 'Stopped before the campaign was created; tried again', '', now);
      continue;
    }
    let st = 'unknown';
    try { st = await campaignState(env, r.campaign_key); } catch { /* unknown */ }
    // Audit 12 Nov 2026: the send keeps the time of the attempt, not of the confirmation, so a late confirmation does not
    // count as this week's issue and skip a week.
    if (st === 'sent') { const at = Date.parse(String(r.updated_at || '').replace(' ', 'T') + 'Z'); await record(env, r.slug, 'sent', `Campaign ${r.campaign_key}: Zoho confirmed it went out`, r.campaign_key, Number.isFinite(at) ? at : now); continue; }
    if (st === 'draft') { await record(env, r.slug, 'failed', `Campaign ${r.campaign_key} was created but not sent; tried again`, '', now); continue; }
    return { unknown: { slug: r.slug, campaign: r.campaign_key } };
  }
  return null;
}

// Errors only a person can fix: the reason for the owner's email, or ''.
const needsHands = (e) => (e && e.hands) || (/not connected/i.test(e && e.message) ? 'reconnect' : /List ".*" not found/.test(e && e.message) ? 'list' : '');

// Send the next issue. force: the admin "send now" button, which ignores the once-a-week rule (never the duplicate
// checks). Returns { ok, msg } and, on failure, hands (the owner must act), unknown or busy.
export async function sendNext(env, { force = false, now = Date.now() } = {}) {
  const stop = await settle(env, now);
  if (stop && stop.busy) return { ok: false, msg: stop.busy, busy: true };
  if (stop) return { ok: false, msg: `Zoho has not said whether campaign ${stop.unknown.campaign} (${stop.unknown.slug}) went out, so nothing more is sent until it does.`, unknown: stop.unknown };
  if (!force) {
    const recent = await env.DB.prepare("SELECT slug FROM newsletter_sends WHERE status = 'sent' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 1").bind(sqlTime(now - 3 * 864e5)).first();
    if (recent) return { ok: true, msg: `This week's issue has gone out (${recent.slug}).`, already: true };
  }
  let next;
  try { next = await nextIssue(env); } catch (e) { return { ok: false, msg: e.message }; }
  const { issue } = next;
  if (!issue) return { ok: false, msg: 'No issue is ready to send: the Pearl queue is empty.', hands: 'empty' };
  let key = '';
  try {
    await record(env, issue.slug, 'sending', 'Creating campaign', '', now);
    // Audit 12 Nov 2026: an earlier refused draft's key must not be kept on this attempt (it let a second run send too).
    await env.DB.prepare('UPDATE newsletter_sends SET campaign_key = NULL WHERE slug = ?').bind(issue.slug).run();
    key = await createVerified(env, issue, now);
    // Saved before the send call: if Zoho's answer is lost, the next run checks this campaign before anything else.
    await record(env, issue.slug, 'sending', `Campaign ${key} created, sending`, key, now);
  } catch (e) {
    await record(env, issue.slug, 'failed', e.message, '', now);
    return { ok: false, msg: e.message, hands: needsHands(e), slug: issue.slug };
  }
  let sres;
  try {
    const lk = await listKey(env), tid = await topicId(env);
    sres = await api(env, 'sendcampaign', { campaignkey: key }, 'POST', true);
    const failed = (x) => (x.response ? String(x.response.code) !== '200' : String(x.code) !== '200');
    // Fallback: some accounts want the list and topic repeated on the send call.
    if (failed(sres)) sres = await api(env, 'sendcampaign', { campaignkey: key, list_details: JSON.stringify({ [lk]: [] }), ...(tid ? { topicId: tid } : {}) }, 'POST', true);
    if (failed(sres)) {
      // Zoho answered and refused: the campaign stays a draft. The next run starts again with a new campaign.
      await record(env, issue.slug, 'failed', 'sendcampaign: ' + JSON.stringify(sres).slice(0, 400), '', now);
      return { ok: false, msg: 'Zoho refused the send: ' + JSON.stringify(sres).slice(0, 200), slug: issue.slug };
    }
  } catch (e) {
    // No answer from Zoho: the row stays 'sending' with its campaign key, and the next run asks Zoho what happened.
    return { ok: false, msg: `No answer from Zoho for campaign ${key}: ${e.message}. The next run checks it before sending anything.`, slug: issue.slug };
  }
  const st = (sres.response && (sres.response.campaign_status || sres.response.code)) || sres.code;
  await record(env, issue.slug, 'sent', `Campaign ${key} ${st}`, key, now);
  return { ok: true, msg: `Sent ${issue.subject}`, slug: issue.slug, left: next.left };
}

// The owner's email when a person must act (notification outbox, notify.js). One per reason a day.
async function tellOwner(env, reason, data, now) {
  try {
    const key = `newsletter:${reason}:${london(now).day}`;
    await queueStmt(env, { key, kind: 'newsletter_alert', to: env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk', toName: 'Wavelength', data: { reason, ...data } }).run();
    await deliver(env, [key]);
  } catch (e) { console.warn('newsletter alert', e && e.message); }
}

// Cron handler: Tuesdays from 7am UK time, hourly until the week's issue is out (worker/cron.js).
export async function scheduledNewsletter(env, now = Date.now()) {
  const s = await getSettings(env);
  if (s.newsletter_auto === 'off') return { skipped: 'paused' };
  const t = london(now);
  if (t.wd !== 'Tue' || t.hr < 7) return { skipped: 'not the send time' };
  const last = new Date(now).getUTCHours() >= RETRY_UNTIL_UTC_HOUR;
  const r = s.zoho_refresh_token ? await sendNext(env, { now }) : { ok: false, msg: 'Zoho Campaigns is not connected', hands: 'reconnect' };
  if (r.ok) {
    if (!r.already) {
      if (s.newsletter_failing_since) await env.DB.prepare("DELETE FROM settings WHERE key = 'newsletter_failing_since'").run();
      if (r.left !== undefined && r.left < 3) await tellOwner(env, 'low', { left: r.left }, now);
    }
    return r;
  }
  if (r.busy) return r;
  if (!s.newsletter_failing_since) await put(env, 'newsletter_failing_since', t.day);
  if (r.hands) await tellOwner(env, r.hands, { detail: r.msg }, now);
  else if (r.unknown && last) await tellOwner(env, 'unknown', r.unknown, now);
  else if (last && s.newsletter_failing_since && s.newsletter_failing_since <= sqlTime(now - 6 * 864e5).slice(0, 10)) await tellOwner(env, 'stuck', { detail: r.msg, since: s.newsletter_failing_since }, now);
  return r;
}

// The email page for one issue, as Zoho imports it when the campaign is created: the built page with the masthead
// month set to the month it is sent (an issue sent a week late in a new month says so).
export async function issuePage(env, slug, now = Date.now()) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const r = await env.ASSETS.fetch(new Request(`${SITE}/email/pearl/${slug}/`));
  if (!r.ok) return null;
  const html = (await r.text()).replace(/(>Wavelength Pearl · )[A-Za-z]+ \d{4}(<\/p>)/, (m, a, b) => a + monthLabel(now) + b);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function newsletterAdminHtml(env, msg) {
  const s = await getSettings(env);
  let next = null; try { next = await nextIssue(env); } catch { /* no queue */ }
  const issue = next && next.issue;
  const { results = [] } = await env.DB.prepare('SELECT * FROM newsletter_sends ORDER BY updated_at DESC LIMIT 30').all();
  const connected = !!s.zoho_refresh_token;
  const status = !s.zoho_client_id ? 'Zoho API client not set up yet.' : connected ? 'Connected to Zoho Campaigns.' : 'Not connected.';
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Newsletter</h2>
  <p class="admin-summary">${esc(status)} Automatic weekly send: <b>${s.newsletter_auto === 'off' ? 'paused' : 'on'}</b>, Tuesdays at 7:30am UK time (if it fails, it tries again every hour that day, and a missed issue goes first the next Tuesday), to the Zoho list "${LIST_NAME}". <a class="text-link" href="/admin/volunteers/">Volunteers</a> · <a class="text-link" href="/admin/academy/">Academy</a></p>
  ${msg ? `<p class="form-note" style="font-weight:600">${esc(msg)}</p>` : ''}
  ${issue ? `<p class="admin-summary">Next issue: <b>${esc(issue.subject)}</b> (number ${issue.n} of ${next.total} in the queue, ${next.left} more ready after it). <a class="text-link" href="/api/newsletter/pearl/${esc(issue.slug)}/" target="_blank" rel="noopener">Preview</a></p>` : next ? '<p class="admin-summary"><b>The Pearl queue is empty.</b> Add issues to data/pearl-issues.json.</p>' : ''}
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0 32px">
    ${s.zoho_client_id ? `<a class="btn btn-ghost small" href="/admin/newsletter/connect/">${connected ? 'Reconnect' : 'Connect'} Zoho Campaigns</a>` : ''}
    <form method="post"><input type="hidden" name="action" value="toggle"><button class="btn btn-ghost small" type="submit">${s.newsletter_auto === 'off' ? 'Resume' : 'Pause'} automatic sending</button></form>
    ${connected ? `<form method="post"><input type="hidden" name="action" value="test"><button class="btn btn-ghost small" type="submit">Test connection (sends nothing)</button></form><form method="post"><input type="hidden" name="action" value="dryrun"><button class="btn btn-ghost small" type="submit">Dry run (draft only, sends nothing)</button></form>` : ''}
    ${connected ? `<form method="post" onsubmit="return confirm('Send the next issue to the whole list now? It counts as this week’s issue: a Tuesday send less than three days later is skipped.')"><input type="hidden" name="action" value="send"><button class="btn small" type="submit">Send the next issue now</button></form>` : ''}
  </div>
  ${connected ? '' : `<form class="form pw-form" method="post" style="max-width:560px;margin-bottom:32px"><input type="hidden" name="action" value="client"><p class="admin-summary" style="overflow-wrap:anywhere">Step 1: paste the Client ID and Client Secret from the Zoho API console (server-based application, redirect URI ${REDIRECT}). Step 2: click Connect.</p><label>Client ID<input name="client_id" autocomplete="off" required maxlength="200" value="${esc(s.zoho_client_id || '')}"></label><label>Client Secret<input name="client_secret" type="password" autocomplete="off" required maxlength="200"></label><button class="btn btn-ghost small" type="submit">Save</button></form>`}
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
  if (a === 'test') return testConnection(env);
  if (a === 'dryrun') {
    try { const { issue } = await nextIssue(env); if (!issue) return 'Dry run: the Pearl queue is empty.'; const key = await createVerified(env, issue); return `Dry run OK: draft campaign ${key} created with the list attached. Nothing sent. Debug: ${LAST_DETAILS}`; }
    catch (e) { return 'Dry run failed: ' + e.message; }
  }
  if (a === 'send') return (await sendNext(env, { force: true })).msg;
  return '';
}
