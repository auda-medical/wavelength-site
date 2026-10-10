// Business reporting: date ranges, the finance definitions and the queries behind /admin/business/ (worker/business.js).
// Definitions: docs/commercial-2026/02-analytics-architecture.md section 4. Pure calculations are exported for tests.
// null means "not measured" (no source for the period); 0 means measured and none.
import SITE from './site-data.json';
import { estimateFee, PAID } from './bookings.js';

// ---------- Dates ----------
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5));
export const RANGES = [['7d', '7 days', 7], ['30d', '30 days', 30], ['90d', '90 days', 90], ['12m', '12 months', 365]];
export function parseRange(params, today = iso(new Date())) {
  const r = params.get('range') || '30d';
  const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
  if (r === 'custom' && okDate(params.get('from')) && okDate(params.get('to'))) {
    let from = params.get('from'), to = params.get('to');
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today;
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    if (days > 0 && days <= 1100) return { key: 'custom', label: `${from} to ${to}`, from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
  }
  const [key, label, days] = RANGES.find((x) => x[0] === r) || RANGES[1];
  const from = addDays(today, -(days - 1));
  return { key, label: `Last ${label}`, from, to: today, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}
export const dayList = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 1200; d = addDays(d, 1)) out.push(d); return out; };
export const monthOf = (d) => String(d || '').slice(0, 7);
export const monthList = (from, to) => { const out = []; for (let m = monthOf(from); m <= monthOf(to) && out.length < 60; m = monthOf(addDays(m + '-28', 5))) out.push(m); return out; };

// ---------- Money ----------
export const gbp = (p, { dp = 0 } = {}) => (p == null ? 'Not recorded' : `${p < 0 ? '−' : ''}£${(Math.abs(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
export const pct = (a, b) => (b > 0 && a != null ? Math.round((a / b) * 1000) / 10 : null);
export const growth = (now, before) => (before > 0 && now != null ? Math.round(((now - before) / before) * 1000) / 10 : null);

// ---------- Finance definitions ----------
export const STREAMS = [
  ['courses', 'Hands-on courses'], ['tailored', 'Tailored training'], ['institutional', 'Institutional services'],
  ['digital', 'Premium digital services'], ['recurring', 'Recurring education'], ['sponsorship', 'Sponsored education'], ['general', 'General and overheads'],
];
export const INCOME = [['course_other', 'Course income not booked through Wavelength'], ['tailored_training', 'Tailored training'], ['institutional', 'Institutional contract or licence'], ['digital', 'Digital product'], ['recurring', 'Subscription or membership'], ['sponsorship', 'Sponsorship (disclosed)'], ['other_income', 'Other income']];
export const DIRECT = [['venue', 'Venue'], ['faculty', 'Teaching faculty'], ['equipment', 'Equipment hire or transport'], ['consumables', 'Consumables and materials'], ['catering', 'Catering'], ['travel', 'Travel'], ['accommodation', 'Accommodation'], ['payment_fees', 'Payment processing fees'], ['other_direct', 'Other delivery cost']];
export const OVERHEAD = [['marketing', 'Marketing'], ['software', 'Software and hosting'], ['insurance', 'Insurance'], ['professional_fees', 'Accountancy and professional fees'], ['other_overhead', 'Other operating cost']];
export const REFUND_CATEGORY = 'refunds';
export const VAT_TREATMENTS = [['not_recorded', 'Not recorded'], ['standard', 'Standard rate'], ['reduced', 'Reduced rate'], ['zero', 'Zero rate'], ['exempt', 'Exempt'], ['outside_scope', 'Outside the scope of VAT']];
export const ACTIVITIES = [['development', 'Course development'], ['preparation', 'Course preparation'], ['delivery', 'Course delivery'], ['travel', 'Travel'], ['admin', 'Administration'], ['enquiries', 'Responding to enquiries'], ['marketing', 'Marketing'], ['content', 'Content production'], ['software', 'Software and product'], ['partnerships', 'Partnerships']];
const DIRECT_IDS = new Set(DIRECT.map(([k]) => k)), OVERHEAD_IDS = new Set(OVERHEAD.map(([k]) => k));
const empty = () => ({ income: 0, refunds: 0, direct: 0, overhead: 0, fees: 0, estimated: 0, places: 0, bookings: 0 });

// Profit and loss for a set of paid bookings and ledger lines. vat: 'yes' (VAT registered: use amounts excluding
// recorded VAT), 'no' or '' (amounts as paid). Returns totals and one entry per revenue stream.
export function pnl({ bookings = [], ledger = [], vat = '' }) {
  const ex = vat === 'yes';
  const streams = Object.fromEntries(STREAMS.map(([k]) => [k, empty()]));
  const s = (k) => streams[k] || streams.general;
  for (const b of bookings) {
    if (!PAID.includes(b.status)) continue;
    const t = s('courses');
    t.income += (b.gross_pence || 0) - (ex ? b.vat_pence || 0 : 0);
    t.refunds += b.refund_pence || 0;
    const fee = b.fee_pence == null ? estimateFee(b.gross_pence || 0) : b.fee_pence;
    t.fees += fee;
    if (b.fee_pence == null || b.fee_estimated) t.estimated += fee;
    t.places += b.places || 1;
    t.bookings += 1;
  }
  for (const l of ledger) {
    if (l.voided_at) continue;
    const amount = (l.amount_pence || 0) - (ex ? l.vat_pence || 0 : 0);
    const t = s(l.stream);
    if (l.kind === 'income') t.income += amount;
    else if (l.category === REFUND_CATEGORY) t.refunds += amount;
    else if (DIRECT_IDS.has(l.category)) t.direct += amount;
    else t.overhead += amount;
    if (l.basis === 'estimate' && l.kind === 'expense') t.estimated += amount;
  }
  const total = empty();
  for (const t of Object.values(streams)) {
    for (const k of Object.keys(total)) total[k] += t[k];
    t.net = t.income - t.refunds;
    t.directAll = t.direct + t.fees;
    t.grossProfit = t.net - t.directAll;
  }
  total.net = total.income - total.refunds;
  total.directAll = total.direct + total.fees;
  total.grossProfit = total.net - total.directAll;
  total.operatingProfit = total.grossProfit - total.overhead;
  total.grossMargin = pct(total.grossProfit, total.net);
  total.operatingMargin = pct(total.operatingProfit, total.net);
  total.revenuePerPlace = total.places ? Math.round(streams.courses.net / total.places) : null;
  return { total, streams, vatBasis: ex ? 'excluding recorded VAT' : vat === 'no' ? 'amounts as paid (not VAT registered)' : 'amounts as paid (VAT registration not recorded)' };
}

// Indicative profit per owner hour: gross profit of a stream ÷ owner hours logged against it.
export function perHour(grossProfit, minutes) { return minutes > 0 ? Math.round(grossProfit / (minutes / 60)) : null; }

// Funnel conversion between consecutive stages (null where the earlier stage was not measured or is zero).
export function funnel(stages) { return stages.map((s, i) => ({ ...s, rate: i === 0 ? null : pct(s.value, stages[i - 1].value) })); }

// ---------- Queries ----------
const has = async (env, sql) => { try { await env.DB.prepare(sql).all(); return true; } catch { return false; } };
export async function ready(env) {
  const [metrics, bookings, ledger, enquiries14, verification, lifecycle, testCol] = await Promise.all([
    has(env, 'SELECT n FROM metric_daily LIMIT 0'), has(env, 'SELECT id FROM bookings LIMIT 0'), has(env, 'SELECT id FROM ledger LIMIT 0'),
    has(env, 'SELECT stage FROM department_enquiries LIMIT 0'), has(env, 'SELECT id FROM supervisor_approvals LIMIT 0'),
    has(env, 'SELECT id FROM supervisor_applications LIMIT 0'), has(env, 'SELECT test_account FROM learners LIMIT 0'),
  ]);
  return { metrics, bookings, ledger, enquiries14, verification, lifecycle, testCol };
}
export async function settingsOf(env) {
  try { const { results = [] } = await env.DB.prepare('SELECT key, value FROM business_settings').all(); return Object.fromEntries(results.map((r) => [r.key, r.value])); } catch { return {}; }
}

// Counter totals by metric (and dim) for a date range.
export async function sums(env, from, to, metrics) {
  const q = metrics.map(() => '?').join(',');
  const { results = [] } = await env.DB.prepare(`SELECT metric, dim, SUM(n) AS n FROM metric_daily WHERE day BETWEEN ? AND ? AND metric IN (${q}) GROUP BY metric, dim`).bind(from, to, ...metrics).all();
  return results;
}
export async function daily(env, from, to, metric, dim = '') {
  const { results = [] } = await env.DB.prepare('SELECT day, SUM(n) AS n FROM metric_daily WHERE day BETWEEN ? AND ? AND metric = ? AND dim = ? GROUP BY day').bind(from, to, metric, dim).all();
  const m = Object.fromEntries(results.map((r) => [r.day, r.n]));
  return dayList(from, to).map((d) => ({ day: d, n: m[d] || 0 }));
}
export const total = (rows, metric, dim) => rows.filter((r) => r.metric === metric && (dim === undefined || r.dim === dim)).reduce((a, r) => a + r.n, 0);
export const top = (rows, metric, n = 10) => rows.filter((r) => r.metric === metric).sort((a, b) => b.n - a.n || String(a.dim).localeCompare(String(b.dim))).slice(0, n);

// Measured only from the start date onwards: a range that ends before it is not measured (null).
export const measured = (start, from, to) => (start && start <= to ? { full: start <= from, from: start > from ? start : from } : null);

const notTest = (r) => (r.testCol ? 'AND COALESCE(l.test_account, 0) = 0' : '');

export async function logbookStats(env, rd, r, appStart) {
  const T = notTest(rd);
  const one = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first()) || {};
  const accounts = await one(`SELECT COUNT(*) AS n, SUM(CASE WHEN l.email_status = 'verified' THEN 1 ELSE 0 END) AS verified FROM learners l WHERE l.password_hash IS NOT NULL ${T}`);
  const fresh = await one(`SELECT COUNT(*) AS n, SUM(CASE WHEN l.email_status = 'verified' THEN 1 ELSE 0 END) AS verified FROM learners l WHERE l.password_hash IS NOT NULL AND substr(l.created_at, 1, 10) BETWEEN ? AND ? ${T}`, r.from, r.to);
  const freshPrev = await one(`SELECT COUNT(*) AS n FROM learners l WHERE l.password_hash IS NOT NULL AND substr(l.created_at, 1, 10) BETWEEN ? AND ? ${T}`, r.prevFrom, r.prevTo);
  const academy = await one(`SELECT COUNT(*) AS n FROM learners l WHERE l.password_hash IS NULL AND substr(l.created_at, 1, 10) BETWEEN ? AND ? ${T}`, r.from, r.to);
  // First entry per account (server copy), and how many accounts registered in the range have one.
  const first = await one(`SELECT COUNT(*) AS n FROM (SELECT e.learner_id, MIN(e.created_at) AS f FROM logbook_entries e JOIN learners l ON l.id = e.learner_id WHERE 1 = 1 ${T} GROUP BY e.learner_id) WHERE substr(f, 1, 10) BETWEEN ? AND ?`, r.from, r.to);
  const activated = await one(`SELECT COUNT(DISTINCT l.id) AS n FROM learners l JOIN logbook_entries e ON e.learner_id = l.id WHERE l.password_hash IS NOT NULL AND substr(l.created_at, 1, 10) BETWEEN ? AND ? ${T}`, r.from, r.to);
  const entries = await one(`SELECT COUNT(*) AS n FROM logbook_entries e JOIN learners l ON l.id = e.learner_id WHERE e.deleted = 0 AND substr(e.created_at, 1, 10) BETWEEN ? AND ? ${T}`, r.from, r.to);
  const out = { accounts: accounts.n || 0, verified: accounts.verified || 0, newAccounts: fresh.n || 0, newVerified: fresh.verified || 0, newPrev: freshPrev.n || 0, academyOnly: academy.n || 0, firstEntries: first.n || 0, activated: activated.n || 0, entries: entries.n || 0 };
  out.activationRate = pct(out.activated, out.newAccounts);
  // Activity (from analytics_learner_days, and app.active for days already rolled up and purged).
  const m = measured(appStart, r.from, r.to);
  if (!rd.metrics || !m) return { ...out, activity: null };
  const end = r.to;
  const distinct = async (from, to) => (await one(`SELECT COUNT(DISTINCT a.learner_id) AS n FROM analytics_learner_days a JOIN learners l ON l.id = a.learner_id WHERE a.day BETWEEN ? AND ? ${T}`, from, to)).n || 0;
  const dau = await distinct(end, end), wau = await distinct(addDays(end, -6), end), mau = await distinct(addDays(end, -29), end);
  const activeInRange = await distinct(m.from, r.to);
  const returning = (await one(`SELECT COUNT(DISTINCT a.learner_id) AS n FROM analytics_learner_days a JOIN learners l ON l.id = a.learner_id WHERE a.day BETWEEN ? AND ? ${T} AND EXISTS (SELECT 1 FROM analytics_learner_days b WHERE b.learner_id = a.learner_id AND b.day < ?)`, m.from, r.to, m.from)).n || 0;
  const { results: perDay = [] } = await env.DB.prepare(`SELECT a.day, COUNT(DISTINCT a.learner_id) AS n FROM analytics_learner_days a JOIN learners l ON l.id = a.learner_id WHERE a.day BETWEEN ? AND ? ${T} GROUP BY a.day`).bind(r.from, r.to).all();
  const rolled = Object.fromEntries(((await env.DB.prepare("SELECT day, n FROM metric_daily WHERE metric = 'app.active' AND dim = '' AND day BETWEEN ? AND ?").bind(r.from, r.to).all()).results || []).map((x) => [x.day, x.n]));
  const live = Object.fromEntries(perDay.map((x) => [x.day, x.n]));
  const series = dayList(r.from, r.to).map((d) => ({ day: d, n: d < appStart ? null : live[d] ?? rolled[d] ?? 0 }));
  return { ...out, activity: { dau, wau, mau, activeInRange, returning, series, partial: !m.full, since: appStart } };
}

// Cohort retention: accounts registered in each month since app measurement began, and the share active in each later month.
export async function cohorts(env, rd, appStart, months = 6) {
  if (!rd.metrics || !appStart) return null;
  const T = notTest(rd);
  const { results = [] } = await env.DB.prepare(`SELECT substr(l.created_at, 1, 7) AS cohort, l.id, (SELECT GROUP_CONCAT(DISTINCT substr(a.day, 1, 7)) FROM analytics_learner_days a WHERE a.learner_id = l.id) AS months
    FROM learners l WHERE l.password_hash IS NOT NULL AND substr(l.created_at, 1, 10) >= ? ${T}`).bind(appStart).all();
  const by = {};
  for (const row of results) {
    const c = by[row.cohort] || (by[row.cohort] = { cohort: row.cohort, size: 0, active: Array(months).fill(0) });
    c.size++;
    const seen = new Set(String(row.months || '').split(',').filter(Boolean));
    for (let k = 0; k < months; k++) { const mk = monthOf(addDays(row.cohort + '-15', k * 30.5)); if (seen.has(mk)) c.active[k]++; }
  }
  const now = monthOf(iso(new Date()));
  return Object.values(by).sort((a, b) => a.cohort.localeCompare(b.cohort)).map((c) => ({ ...c, rates: c.active.map((n, k) => (monthOf(addDays(c.cohort + '-15', k * 30.5)) > now ? null : pct(n, c.size))) }));
}

export async function featureStats(env, rd, r) {
  const T = notTest(rd);
  const n = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
  const so = await env.DB.prepare(`SELECT s.method, CASE WHEN s.supervisor_id IS NOT NULL THEN 1 ELSE 0 END AS dash, COUNT(*) AS n, SUM(CASE WHEN s.signed_at IS NOT NULL THEN 1 ELSE 0 END) AS signed FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE substr(s.created_at, 1, 10) BETWEEN ? AND ? ${T} GROUP BY s.method, dash`).bind(r.from, r.to).all();
  const signedInRange = await n(`SELECT COUNT(*) AS n FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.signed_at IS NOT NULL AND substr(s.signed_at, 1, 10) BETWEEN ? AND ? ${T}`, r.from, r.to);
  // Turnaround of link and dashboard sign-offs signed in the range (hours from request to signature), and requests still open.
  const ta = await env.DB.prepare(`SELECT (julianday(s.signed_at) - julianday(s.created_at)) * 24 AS h FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.method != 'inperson' AND s.signed_at IS NOT NULL AND substr(s.signed_at, 1, 10) BETWEEN ? AND ? ${T}`).bind(r.from, r.to).all();
  const hours = (ta.results || []).map((x) => x.h).filter((h) => h >= 0).sort((a, b) => a - b);
  const median = hours.length ? Math.round(hours[Math.floor((hours.length - 1) / 2)] * 10) / 10 : null;
  const open = await n(`SELECT COUNT(*) AS n FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.status = 'pending' AND (s.expires_at IS NULL OR s.expires_at > ?) ${T}`, Date.now());
  const assess = await env.DB.prepare(`SELECT a.status, COUNT(*) AS n FROM assessments a JOIN learners l ON l.id = a.learner_id WHERE substr(a.created_at, 1, 10) BETWEEN ? AND ? ${T} GROUP BY a.status`).bind(r.from, r.to).all();
  const evidence = await n(`SELECT COUNT(*) AS n FROM evidence_summaries e JOIN learners l ON l.id = e.learner_id WHERE substr(e.created_at, 1, 10) BETWEEN ? AND ? ${T}`, r.from, r.to);
  const links = await n(`SELECT COUNT(*) AS n FROM supervisor_links s WHERE substr(s.created_at, 1, 10) BETWEEN ? AND ?`, r.from, r.to);
  return { signoffs: so.results || [], signedInRange, medianHours: median, turnaroundN: hours.length, openRequests: open, assessments: assess.results || [], evidence, links };
}

export async function verificationStats(env, rd, r) {
  if (!rd.verification) return null;
  const rows = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).all()).results || []);
  const apps = rd.lifecycle ? await rows("SELECT status, COUNT(*) AS n FROM supervisor_applications WHERE substr(COALESCE(decided_at, submitted_at, created_at), 1, 10) BETWEEN ? AND ? GROUP BY status", r.from, r.to) : [];
  const creds = await rows("SELECT credential_type AS type, status, COUNT(*) AS n FROM credentials WHERE substr(COALESCE(verified_at, updated_at, created_at), 1, 10) BETWEEN ? AND ? GROUP BY credential_type, status", r.from, r.to);
  const regs = await rows("SELECT regulator, status, COUNT(*) AS n FROM professional_registrations WHERE substr(COALESCE(verified_at, updated_at, created_at), 1, 10) BETWEEN ? AND ? GROUP BY regulator, status", r.from, r.to);
  const approvals = await rows("SELECT pathway, COUNT(*) AS n FROM supervisor_approvals WHERE status = 'approved' AND (review_on IS NULL OR review_on >= date('now')) GROUP BY pathway");
  const checks = await rows("SELECT subject_type, action, COALESCE(outcome, '') AS outcome, COUNT(*) AS n FROM verification_events WHERE substr(at, 1, 10) BETWEEN ? AND ? GROUP BY subject_type, action, outcome", r.from, r.to);
  const decided = apps.filter((a) => ['approved', 'rejected'].includes(a.status)).reduce((s, a) => s + a.n, 0);
  const approved = (apps.find((a) => a.status === 'approved') || {}).n || 0;
  return { apps, creds, regs, approvals, checks, successRate: pct(approved, decided), decided };
}

export async function bookingRows(env, rd) {
  if (!rd.bookings) return null;
  return (await env.DB.prepare('SELECT * FROM bookings ORDER BY course_date DESC, id DESC LIMIT 2000').all()).results || [];
}
export async function ledgerRows(env, rd, from, to) {
  if (!rd.ledger) return null;
  return (await env.DB.prepare(`SELECT * FROM ledger WHERE ${LEDGER_DAY_SQL} BETWEEN ? AND ? ORDER BY entry_date DESC, id DESC LIMIT 5000`).bind(from, to).all()).results || [];
}
// The date a ledger line belongs to: a cost linked to a course date counts on that date, like the course's revenue, so
// a venue paid in October for a December course lands in December. Every other line counts on the date entered.
export const ledgerDay = (l) => (/^course:.+@\d{4}-\d{2}-\d{2}$/.test(l.service || '') ? l.service.slice(-10) : l.entry_date);
const LEDGER_DAY_SQL = "(CASE WHEN service LIKE 'course:%@____-__-__' THEN substr(service, -10) ELSE entry_date END)";
export async function timeRows(env, rd, from, to) {
  if (!rd.ledger) return null;
  return (await env.DB.prepare('SELECT * FROM owner_time WHERE voided_at IS NULL AND work_date BETWEEN ? AND ? ORDER BY work_date DESC, id DESC LIMIT 5000').bind(from, to).all()).results || [];
}
// The date a booking's revenue belongs to: the course date (service delivered), else the payment date.
export const bookingDay = (b) => b.course_date || String(b.paid_at || b.created_at || '').slice(0, 10);
export const inRange = (d, from, to) => d >= from && d <= to;
// Money taken in a period: paid bookings by the date they were paid (or recorded), whatever the course date. Gross less
// refunds, before fees. Shown beside revenue so a booking for a later course is visible the day it is paid.
export function takenIn(bookings, from, to) {
  const t = { places: 0, pence: 0, n: 0 };
  for (const b of bookings || []) {
    if (!PAID.includes(b.status)) continue;
    if (!inRange(String(b.paid_at || b.created_at || '').slice(0, 10), from, to)) continue;
    t.n++; t.places += b.places || 1; t.pence += (b.gross_pence || 0) - (b.refund_pence || 0);
  }
  return t;
}

// Per course date: capacity, places, occupancy, money and profit.
export function courseDates(bookings = [], ledger = [], courses = SITE.courses || [], vat = '') {
  const out = [];
  for (const c of courses) for (const d of c.dates || []) {
    const key = `course:${c.slug}@${d.date}`;
    const bs = bookings.filter((b) => b.course_slug === c.slug && b.course_date === d.date);
    const ls = ledger.filter((l) => l.service === key);
    const p = pnl({ bookings: bs, ledger: ls.map((l) => ({ ...l, stream: 'courses' })), vat });
    const places = bs.filter((b) => ['paid', 'part_refunded'].includes(b.status)).reduce((a, b) => a + (b.places || 1), 0);
    out.push({ key, slug: c.slug, title: c.title, date: d.date, venue: d.venue, capacity: d.capacity, places, pending: bs.filter((b) => b.status === 'pending').reduce((a, b) => a + (b.places || 1), 0), occupancy: d.capacity ? pct(places, d.capacity) : null, ...p.total });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function enquiryRows(env, rd) {
  const cols = rd.enquiries14 ? ', enquiry_type, enquiry_class, country, region, location, budget, heard, campaign, stage, stage_at, quote_pence' : '';
  return (await env.DB.prepare(`SELECT id, created_at, organisation, role, setting, training, topics, group_size, contacted${cols} FROM department_enquiries ORDER BY created_at DESC LIMIT 2000`).all()).results || [];
}
export const STAGES = [['new', 'New'], ['qualified', 'Qualified'], ['proposal', 'Proposal or quotation issued'], ['accepted', 'Quotation accepted'], ['declined', 'Quotation declined'], ['booked', 'Training booked'], ['lost', 'Closed, not proceeding']];
export function enquiryStats(rows, from, to) {
  const inR = rows.filter((e) => inRange(String(e.created_at).slice(0, 10), from, to));
  const tally = (key, split) => { const m = {}; for (const e of inR) for (const v of split ? String(e[key] || '').split(/;\s*/).filter(Boolean) : [e[key] || '(not given)']) m[v] = (m[v] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const stage = (s) => inR.filter((e) => (e.stage || 'new') === s).length;
  const reached = (list) => inR.filter((e) => list.includes(e.stage || 'new')).length;
  return {
    n: inR.length, byClass: tally('enquiry_class'), byRegion: tally('region'), byCountry: tally('country'), byTopic: tally('topics', true), byFormat: tally('training', true), bySize: tally('group_size'), byBudget: tally('budget'), byHeard: tally('heard'), byCampaign: tally('campaign'),
    stages: STAGES.map(([k, l]) => ({ k, l, n: stage(k) })),
    qualified: reached(['qualified', 'proposal', 'accepted', 'declined', 'booked']), proposals: reached(['proposal', 'accepted', 'declined', 'booked']), accepted: reached(['accepted', 'booked']), declined: stage('declined'), booked: stage('booked'),
    conversion: pct(stage('booked'), inR.length), quoted: inR.reduce((a, e) => a + (e.quote_pence || 0), 0),
  };
}

// Group page views by section of the site, for engagement.
export const SECTIONS = [['Courses', /^\/courses\//], ['Tailored training', /^\/training\//], ['Logbook landing', /^\/(pocus-logbook|app\/get)\//], ['Pearls', /^\/learn\//], ['Guides', /^\/guides\//], ['Academy', /^\/elearning\//], ['Home', /^\/$/], ['Translated pages', /^\/(fr|es|de|it|pl|ar|ru|zh)\//]];
export function bySection(pathRows) {
  const m = Object.fromEntries(SECTIONS.map(([l]) => [l, 0]));
  m.Other = 0;
  for (const r of pathRows) { const s = SECTIONS.find(([, re]) => re.test(r.dim)); m[s ? s[0] : 'Other'] += r.n; }
  return Object.entries(m);
}
