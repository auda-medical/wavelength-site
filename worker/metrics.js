// Business measurement (docs/commercial-2026/02-analytics-architecture.md). Aggregate counters in D1 metric_daily and
// app activity days in analytics_learner_days (migration 0014).
//   POST /api/m        the website's cookieless beacon (src/assets/main.js): page views, visits, CTA clicks, finished tests
//   appEvent()         called by worker/app.js after each /api/app/* response: features, failures, server errors
//   activity()         one row per app account per UTC day it is used (retention, DAU/WAU/MAU)
//   count()            server-side conversions (enquiries, sign-ups)
// Rules: nothing clinical, no names, emails, IP addresses or free text; every write is capped, runs after the
// response and swallows its own errors, so measurement can never break a request or use up the D1 free-tier allowance.
import SITE from './site-data.json';

const DAY = () => new Date().toISOString().slice(0, 10);
export const LIMITS = { beaconsPerDay: 4000, appWritesPerDay: 4000, perIpPerMinute: 60 };

// ---------- Readiness and budget ----------
const READY = new WeakMap();
export async function metricsReady(env) {
  if (!env || !env.DB) return false;
  const c = READY.get(env.DB);
  if (c && (c.ok || Date.now() - c.at < 60e3)) return c.ok;
  let ok = true;
  try { await env.DB.prepare('SELECT n FROM metric_daily LIMIT 0').all(); await env.DB.prepare('SELECT day FROM analytics_learner_days LIMIT 0').all(); } catch { ok = false; }
  READY.set(env.DB, { ok, at: Date.now() });
  return ok;
}

// Per Worker instance and UTC day. Exported for tests.
export const budget = { day: '', beacons: 0, app: 0, ips: new Map(), seen: new Set() };
// A new UTC day resets the counters. Called first by every check, so no count is lost or doubled at the boundary.
function rollDay() {
  const d = DAY();
  if (budget.day !== d) { budget.day = d; budget.beacons = 0; budget.app = 0; budget.seen.clear(); budget.ips.clear(); }
}
function spend(kind) {
  rollDay();
  const cap = kind === 'beacon' ? LIMITS.beaconsPerDay : LIMITS.appWritesPerDay;
  if (budget[kind === 'beacon' ? 'beacons' : 'app'] >= cap) return false;
  budget[kind === 'beacon' ? 'beacons' : 'app']++;
  return true;
}
function ipAllowed(ip) {
  if (!ip) return true;
  rollDay();
  const min = Math.floor(Date.now() / 60e3);
  const e = budget.ips.get(ip);
  if (!e || e.min !== min) { if (budget.ips.size > 5000) budget.ips.clear(); budget.ips.set(ip, { min, n: 1 }); return true; }
  return ++e.n <= LIMITS.perIpPerMinute;
}

const upsert = (env, day, metric, dim, n = 1) => env.DB.prepare('INSERT INTO metric_daily (day, metric, dim, n) VALUES (?, ?, ?, ?) ON CONFLICT (day, metric, dim) DO UPDATE SET n = n + excluded.n').bind(day, metric, String(dim || '').slice(0, 120), n);

// Adds counters in one batch. rows: [[metric, dim, n?], ...]. Never throws. The first batch of each kind in an
// instance also records when measurement started (web_start, app_start), so reports can tell a real zero after that
// date from a period that was never measured.
const STARTED = new Set();
export async function count(env, rows, { kind = 'app' } = {}) {
  try {
    if (!rows.length || !(await metricsReady(env)) || !spend(kind)) return false;
    const d = DAY();
    const stmts = rows.map(([m, dim, n]) => upsert(env, d, m, dim, n || 1));
    const key = kind === 'beacon' ? 'web_start' : 'app_start';
    if (!STARTED.has(key)) { STARTED.add(key); stmts.push(env.DB.prepare('INSERT OR IGNORE INTO business_settings (key, value) VALUES (?, ?)').bind(key, d)); }
    await env.DB.batch(stmts);
    return true;
  } catch { return false; }
}
const later = (ctx, p) => { if (ctx && ctx.waitUntil) ctx.waitUntil(p); return p; };

// ---------- App activity and events ----------
// One row per account per day. The Set keeps repeat requests from the same account in this instance free of D1 calls.
export async function activity(env, ctx, learnerId) {
  const id = Number(learnerId);
  if (!id) return;
  const d = DAY();
  if (budget.day === d && budget.seen.has(id)) return;
  return later(ctx, (async () => {
    try {
      if (!(await metricsReady(env)) || !spend('app')) return;
      budget.seen.add(id);
      await env.DB.prepare('INSERT OR IGNORE INTO analytics_learner_days (learner_id, day) VALUES (?, ?)').bind(id, d).run();
      if (!STARTED.has('app_start')) { STARTED.add('app_start'); await env.DB.prepare("INSERT OR IGNORE INTO business_settings (key, value) VALUES ('app_start', ?)").bind(d).run(); }
    } catch { /* measurement never breaks a request */ }
  })());
}

// Workflow completions confirmed by the server (route answered 200).
export const FEATURE_ROUTES = ['signoff/request', 'signoff/inperson', 'signoff/complete', 'supervise/signoff', 'assessment/request', 'assessment/inperson', 'assessment/complete', 'supervise/assessment', 'supervise/assessment/new', 'evidence', 'supervisors/add', 'supervisors/accept', 'supervisors/accept-invite', 'signoff/images', 'account/delete', 'email/verify'];
const SIGNUP_REASONS = [[/name/i, 'name'], [/email/i, 'email'], [/password|characters|letters|common/i, 'password'], [/privacy|terms/i, 'terms'], [/organisation/i, 'organisation']];
export function signupReason(message) {
  const m = String(message || '');
  for (const [re, r] of SIGNUP_REASONS) if (re.test(m)) return r;
  return 'other';
}

// The counters for one /api/app/* response. errorText: the JSON error of a failed sign-up, when known.
export function appRows(method, route, status, errorText) {
  const rows = [];
  if (status >= 500) rows.push(['app.error', route]);
  if (method !== 'POST') return rows;
  if (route === 'signup') {
    if (status === 200) rows.push(['app.signup', ''], ['conv.signup', 'app']);
    else if (status === 202) rows.push(['app.signup_existing', '']);
    else if (status === 400) rows.push(['app.signup_fail', signupReason(errorText)]);
    else if (status === 429) rows.push(['app.signup_fail', 'rate_limited']);
  }
  if (route === 'login') rows.push([status === 200 ? 'app.login' : status === 429 ? 'app.login_locked' : 'app.login_fail', '']);
  if (status === 200 && FEATURE_ROUTES.includes(route)) rows.push(['app.feature', route]);
  return rows;
}

// Called by handleApp with a clone of the response. Reads the body only for a failed sign-up (to classify it).
export function appEvent(env, ctx, { method, route, status, res }) {
  return later(ctx, (async () => {
    try {
      let err = '';
      if (route === 'signup' && status === 400 && res) err = ((await res.json().catch(() => ({}))) || {}).error || '';
      const rows = appRows(method, route, status, err);
      if (rows.length) await count(env, rows);
    } catch { /* never breaks a request */ }
  })());
}

// ---------- Website beacon ----------
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|httpclient|java\/|go-http|axios|node-fetch|scrapy|phantom|puppeteer|playwright/i;
const SEARCH = [/(^|\.)google\./, /(^|\.)bing\.com$/, /(^|\.)duckduckgo\.com$/, /(^|\.)search\.yahoo\.com$/, /(^|\.)yahoo\.com$/, /(^|\.)ecosia\.org$/, /(^|\.)baidu\.com$/, /(^|\.)yandex\./, /(^|\.)search\.brave\.com$/, /(^|\.)startpage\.com$/];
const SOCIAL = [/(^|\.)linkedin\.com$/, /^lnkd\.in$/, /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /^fb\.me$/, /^t\.co$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/, /(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)whatsapp\.com$/, /(^|\.)threads\.net$/, /(^|\.)reddit\.com$/];
const PATHS = new Set(SITE.paths || []);
export const label = (v, n = 60) => String(v || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, n);
export function hostOf(ref) {
  try { const u = new URL(String(ref || '')); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '').slice(0, 80) : ''; } catch { return ''; }
}
export function normPath(p) {
  let s = String(p || '/').split(/[?#]/)[0].replace(/\/index\.html$/, '/').slice(0, 200);
  if (!s.startsWith('/')) s = '/' + s;
  if (!s.endsWith('/') && !/\.[a-z0-9]+$/i.test(s)) s += '/';
  return PATHS.has(s) ? s : '(other)';
}
export function deviceOf(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet|Nexus (7|9|10)|SM-T|Kindle|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(s)) return 'mobile';
  return 'desktop';
}
// Channel, source and campaign of a visit. utm: { source, medium, campaign }.
export function classify(refHost, utm = {}, ownHost = 'thewavelength.co.uk') {
  const source = label(utm.source, 40), medium = label(utm.medium, 40), campaign = label(utm.campaign, 60);
  if (medium === 'qr') return { channel: 'qr', source: `${source || 'qr'} / qr`, campaign };
  if (medium === 'email' || medium === 'newsletter') return { channel: 'email', source: `${source || 'email'} / ${medium}`, campaign };
  if (source || campaign) return { channel: 'campaign', source: `${source || '(none)'} / ${medium || '(none)'}`, campaign };
  if (!refHost || refHost === ownHost || refHost.endsWith('.' + ownHost)) return { channel: 'direct', source: '(direct) / (none)', campaign: '' };
  const short = refHost.split('.').slice(-2)[0];
  if (SEARCH.some((r) => r.test(refHost))) return { channel: 'search', source: `${short} / organic`, campaign: '' };
  if (SOCIAL.some((r) => r.test(refHost))) return { channel: 'social', source: `${short === 'lnkd' ? 'linkedin' : short === 't' ? 'x' : short} / social`, campaign: '' };
  return { channel: 'referral', source: `${refHost} / referral`, campaign: '' };
}

// The counters for one beacon payload. Exported for tests.
export function beaconRows(d, { country = 'XX', ua = '', ownHost = 'thewavelength.co.uk' } = {}) {
  const path = normPath(d.p);
  if (d.t === 'ev') {
    const name = label(d.n, 30);
    if (name === 'book') return [['ev.book', path]];
    if (name === 'cta') return [['ev.cta', label(d.l, 40) || '(none)']];
    if (name === 'enquiry_start') return [['ev.enquiry_start', label(d.l, 20) || 'training']];
    // 25 Oct 2026: a finished Pearl test (src/assets/main.js), by page; ev.quiz_full when every answer was right.
    if (name === 'quiz') return label(d.l, 10) === 'full' ? [['ev.quiz', path], ['ev.quiz_full', path]] : [['ev.quiz', path]];
    return [];
  }
  if (d.t !== 'pv') return [];
  const rows = [['pv', ''], ['pv.path', path]];
  const ref = hostOf(d.r);
  const internal = ref && (ref === ownHost || ref.endsWith('.' + ownHost));
  if (internal || d.reload) return rows;
  const c = classify(ref, d.u || {}, ownHost);
  rows.push(['visit', ''], ['visit.path', path], ['visit.channel', c.channel], ['visit.source', c.source], ['visit.country', /^[A-Z]{2}$/.test(country) ? country : 'XX'], ['visit.device', deviceOf(ua)]);
  if (c.campaign) rows.push(['visit.campaign', c.campaign]);
  if (ref && c.channel !== 'direct') rows.push(['visit.ref', ref]);
  return rows;
}

export async function beacon(req, env, ctx) {
  const ok = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (req.method !== 'POST') return ok;
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return ok;
    const ua = req.headers.get('User-Agent') || '';
    if (!ua || BOT.test(ua) || req.headers.get('Sec-GPC') === '1' || req.headers.get('DNT') === '1') return ok;
    if (!ipAllowed(req.headers.get('CF-Connecting-IP') || '')) return ok;
    const text = (await req.text()).slice(0, 2000);
    let d;
    try { d = JSON.parse(text); } catch { return ok; }
    if (!d || typeof d !== 'object') return ok;
    const rows = beaconRows(d, { country: (req.cf && req.cf.country) || 'XX', ua, ownHost: url.hostname.replace(/^www\./, '') });
    if (rows.length) later(ctx, count(env, rows, { kind: 'beacon' }));
  } catch { /* the beacon never fails visibly */ }
  return ok;
}

// ---------- Roll-up and retention ----------
// Rolls finished days' active-account totals into metric_daily (app.active), then deletes activity rows older than
// 13 months. Runs when the business dashboard opens (no cron needed). Idempotent: a day is rolled up once.
export async function rollup(env) {
  if (!(await metricsReady(env))) return { ok: false };
  const today = DAY();
  const { results = [] } = await env.DB.prepare(`SELECT a.day, COUNT(*) AS n FROM analytics_learner_days a
    WHERE a.day < ? AND NOT EXISTS (SELECT 1 FROM metric_daily m WHERE m.day = a.day AND m.metric = 'app.active' AND m.dim = '')
    GROUP BY a.day ORDER BY a.day LIMIT 400`).bind(today).all();
  if (results.length) await env.DB.batch(results.map((r) => env.DB.prepare("INSERT OR IGNORE INTO metric_daily (day, metric, dim, n) VALUES (?, 'app.active', '', ?)").bind(r.day, r.n)));
  const cutoff = new Date(Date.now() - 396 * 864e5).toISOString().slice(0, 10);
  const del = await env.DB.prepare("DELETE FROM analytics_learner_days WHERE day < ? AND EXISTS (SELECT 1 FROM metric_daily m WHERE m.day = analytics_learner_days.day AND m.metric = 'app.active')").bind(cutoff).run();
  return { ok: true, rolled: results.length, purged: (del.meta && del.meta.changes) || 0 };
}

// Account deletion: the account's activity rows go with it.
export async function forgetLearner(env, learnerId) {
  try { if (await metricsReady(env)) await env.DB.prepare('DELETE FROM analytics_learner_days WHERE learner_id = ?').bind(Number(learnerId)).run(); } catch { /* ignore */ }
}
