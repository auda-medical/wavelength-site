// Private business dashboard at /admin/business/ (owner role; worker/access.js sends every unlisted /admin/ path to
// owner). Pages: overview, website, logbook, supervision, courses, training, finance, time, marketing, opportunities,
// monthly, settings. CSV exports under /admin/business/export/<name>.csv. Definitions and limits:
// docs/commercial-2026/02-analytics-architecture.md. Everything here is aggregate except bookings, ledger and the
// enquiry pipeline, which the owner manages. No clinical content is read.
import SITE from './site-data.json';
import qrcode from '../src/app/vendor/qrcode.js';
import * as D from './business-data.js';
import { columns, bars } from './charts.js';
import { rollup } from './metrics.js';
import { bookingAdminPost, pence, STATUSES } from './bookings.js';
import FORM from './department-form.json';
import OPPORTUNITIES from '../data/opportunities.json';
import { pathwayReport } from './verification/pathways.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const num = (n) => (n == null ? '<span class="biz-na">Not measured</span>' : Number(n).toLocaleString('en-GB'));
const pc = (n) => (n == null ? '<span class="biz-na">â€“</span>' : `${n}%`);
const money = (p) => (p == null ? '<span class="biz-na">Not recorded</span>' : esc(D.gbp(p)));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const label = (list, k) => (list.find(([x]) => x === k) || [, k])[1];
const opts = (list, sel) => list.map(([k, l]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
const today = () => new Date().toISOString().slice(0, 10);

export const TABS = [['', 'Overview'], ['website', 'Website'], ['logbook', 'Logbook'], ['supervision', 'Supervision'], ['courses', 'Courses'], ['training', 'Tailored training'], ['finance', 'Finance'], ['time', 'Owner time'], ['marketing', 'Marketing'], ['opportunities', 'Opportunities'], ['monthly', 'Monthly report'], ['settings', 'Settings']];

const STYLE = `<style>
.biz{--biz-a:#2A7F8A;--biz-b:#0F1E33;--biz-line:#D9D4C8;--biz-mute:#5B6878;font-size:15px}
.biz h2{font-size:30px;margin:0 0 6px}.biz h3{font-size:19px;margin:30px 0 10px}
.biz-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}.biz-tabs a,.biz-tabs b{padding:6px 11px;border-radius:999px;border:1px solid var(--biz-line);text-decoration:none;color:inherit;font-size:14px}.biz-tabs b{background:var(--biz-b);color:#F7F5F0;border-color:var(--biz-b)}
.biz-range{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:0 0 10px}.biz-range label{display:grid;gap:3px;font-size:13px;color:var(--biz-mute)}.biz-range select,.biz-range input{padding:6px 8px;border:1px solid var(--biz-line);border-radius:8px;font:inherit}
.biz-meta{color:var(--biz-mute);font-size:13px;margin:0 0 18px}
.biz-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 8px}.biz-kpi{border:1px solid var(--biz-line);border-radius:14px;padding:14px 16px;background:#fff}.biz-kpi small{display:block;color:var(--biz-mute);font-size:12.5px;line-height:1.3}.biz-kpi b{display:block;font-size:26px;margin:4px 0 2px;font-variant-numeric:tabular-nums}.biz-kpi em{font-style:normal;font-size:12.5px;color:var(--biz-mute)}
.biz-up{color:#1E7A46!important}.biz-down{color:#A33A2B!important}.biz-na{color:var(--biz-mute);font-style:italic;font-weight:400;font-size:.85em}
.biz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}.biz-card{border:1px solid var(--biz-line);border-radius:14px;padding:16px 18px;background:#fff;min-width:0}
.biz-chart{width:100%;height:auto;display:block}.biz-axis{font-size:11px;fill:var(--biz-mute)}
.biz-bars{list-style:none;padding:0;margin:0;display:grid;gap:6px}.biz-bars li{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:8px;align-items:center;font-size:13.5px}.biz-bar-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.biz-bar-t{background:#EDEAE3;border-radius:4px;height:10px}.biz-bar-t i{display:block;height:10px;border-radius:4px;background:var(--biz-a)}
.biz table{width:100%;border-collapse:collapse;font-size:13.5px}.biz th,.biz td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--biz-line);vertical-align:top}.biz td.r,.biz th.r{text-align:right;font-variant-numeric:tabular-nums}
.biz-tw{overflow-x:auto}.biz-note{color:var(--biz-mute);font-size:13px}.biz-empty{color:var(--biz-mute);font-style:italic}
.biz-summary{border-left:3px solid var(--biz-a);background:#F7F5F0;padding:12px 16px;border-radius:0 10px 10px 0;margin:0 0 18px}.biz-summary li{margin:3px 0}
.biz form.biz-f{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end}.biz form.biz-f label{display:grid;gap:3px;font-size:12.5px;color:var(--biz-mute)}.biz form.biz-f input,.biz form.biz-f select,.biz form.biz-f textarea{padding:6px 8px;border:1px solid var(--biz-line);border-radius:8px;font:inherit;color:#0F1E33;min-width:0}
.biz form.biz-i{display:flex;flex-wrap:wrap;gap:4px;align-items:center}.biz form.biz-i input,.biz form.biz-i select{padding:3px 5px;border:1px solid var(--biz-line);border-radius:6px;font:inherit;font-size:12.5px;max-width:110px}
.biz-msg{font-weight:600;padding:8px 12px;background:#E6F2F3;border-radius:8px;display:inline-block}
.biz-qr svg{width:180px;height:180px}.biz code{word-break:break-all}
@media print{.biz-tabs,.biz-range,.admin-nav,form{display:none!important}.biz-card,.biz-kpi{break-inside:avoid}}
</style>`;

function tabs(current, r) {
  const q = r.key === 'custom' ? `?range=custom&from=${r.from}&to=${r.to}` : `?range=${r.key}`;
  return `<nav class="biz-tabs" aria-label="Business sections">${TABS.map(([k, l]) => (k === current ? `<b aria-current="page">${esc(l)}</b>` : `<a href="/admin/business/${k ? k + '/' : ''}${q}">${esc(l)}</a>`)).join('')}</nav>`;
}
function rangeForm(tab, r) {
  return `<form class="biz-range" method="get" action="/admin/business/${tab ? tab + '/' : ''}"><label>Period<select name="range">${D.RANGES.map(([k, l]) => `<option value="${k}"${r.key === k ? ' selected' : ''}>Last ${l}</option>`).join('')}<option value="custom"${r.key === 'custom' ? ' selected' : ''}>Custom range</option></select></label>
  <label>From<input type="date" name="from" value="${r.from}"></label><label>To<input type="date" name="to" value="${r.to}"></label><button class="btn btn-ghost small" type="submit">Show</button></form>`;
}
const kpi = (title, value, { prev, note, invert = false, isMoney = false } = {}) => {
  const g = typeof value === 'number' && typeof prev === 'number' ? D.growth(value, prev) : null;
  const cls = g == null || g === 0 ? '' : (g > 0) !== invert ? 'biz-up' : 'biz-down';
  const shown = isMoney ? money(value) : num(value);
  return `<div class="biz-kpi"><small>${esc(title)}</small><b>${shown}</b>${g != null ? `<em class="${cls}">${g > 0 ? '+' : ''}${g}% vs previous period</em>` : typeof prev === 'number' ? `<em>previous: ${isMoney ? esc(D.gbp(prev)) : prev.toLocaleString('en-GB')}</em>` : note ? `<em>${esc(note)}</em>` : ''}</div>`;
};
const table = (head, rows, { empty = 'None in this period.' } = {}) => (rows.length ? `<div class="biz-tw"><table><thead><tr>${head.map((h) => `<th scope="col"${/^r:/.test(h) ? ' class="r"' : ''}>${esc(h.replace(/^r:/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${/^r:/.test(head[i]) ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="biz-empty">${esc(empty)}</p>`);
const notReady = (what) => `<p class="biz-empty">${esc(what)} needs migration 0014 (business analytics). It is not applied to this database yet.</p>`;

// ---------- Data for a period ----------
async function webData(env, rd, r, st) {
  if (!rd.metrics) return null;
  const m = D.measured(st.web_start, r.from, r.to);
  if (!m) return { measured: false };
  const ALL = ['pv', 'pv.path', 'visit', 'visit.path', 'visit.channel', 'visit.source', 'visit.campaign', 'visit.ref', 'visit.country', 'visit.device', 'ev.book', 'ev.cta', 'ev.enquiry_start', 'conv.enquiry', 'conv.enquiry_campaign', 'conv.signup'];
  const rows = await D.sums(env, r.from, r.to, ALL);
  const pm = D.measured(st.web_start, r.prevFrom, r.prevTo);
  const prev = pm ? await D.sums(env, r.prevFrom, r.prevTo, ['pv', 'visit', 'ev.book', 'conv.enquiry']) : null;
  const visitsDaily = (await D.daily(env, r.from, r.to, 'visit')).map((p) => ({ ...p, n: p.day < st.web_start ? null : p.n }));
  return { measured: true, partial: !m.full, rows, prev, visitsDaily };
}

async function periodData(env, url) {
  const r = D.parseRange(url.searchParams);
  const rd = await D.ready(env);
  if (rd.metrics) await rollup(env).catch(() => null);
  const st = await D.settingsOf(env);
  return { r, rd, st };
}

function metaLine(st, rd) {
  const bits = [`Generated ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC. Website and app counters update within seconds of each event; tables are read live.`];
  bits.push(rd.metrics ? (st.web_start ? `Website measured since ${st.web_start}.` : 'Website measurement has not recorded a visit yet.') : 'Website measurement is not installed (migration 0014).');
  if (rd.metrics) bits.push(st.app_start ? `App activity measured since ${st.app_start}.` : 'App activity not recorded yet.');
  return `<p class="biz-meta">${bits.map(esc).join(' ')}</p>`;
}

// ---------- Pages ----------
async function overview(env, url) {
  const { r, rd, st } = await periodData(env, url);
  const web = await webData(env, rd, r, st);
  const lb = await D.logbookStats(env, rd, r, st.app_start);
  const fs = await D.featureStats(env, rd, r);
  const enq = D.enquiryStats(await D.enquiryRows(env, rd), r.from, r.to);
  const enqPrev = D.enquiryStats(await D.enquiryRows(env, rd), r.prevFrom, r.prevTo);
  const bookings = await D.bookingRows(env, rd);
  const ledger = await D.ledgerRows(env, rd, r.from, r.to);
  const vat = st.vat_registered || '';
  const pl = bookings && ledger ? D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.from, r.to)), ledger, vat }) : null;
  const plPrev = bookings && ledger ? D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.prevFrom, r.prevTo)), ledger: await D.ledgerRows(env, rd, r.prevFrom, r.prevTo), vat }) : null;
  const visits = web && web.measured ? D.total(web.rows, 'visit') : null;
  const visitsPrev = web && web.prev ? D.total(web.prev, 'visit') : undefined;
  const paidPlaces = pl ? pl.total.places : null;
  const fun = D.funnel([
    { stage: 'Visits (estimated)', value: visits },
    { stage: 'New logbook accounts', value: lb.newAccounts },
    { stage: 'New accounts with a first scan', value: lb.activated },
  ]);
  const summary = summaryLines({ r, visits, visitsPrev, lb, enq, enqPrev, pl, plPrev, fs, web });
  const flags = await priorityFlags(env, rd, { lb, fs, bookings, enqRows: await D.enquiryRows(env, rd) });
  return `${tabs('', r)}${rangeForm('', r)}${metaLine(st, rd)}
  <h2 class="display">Business overview</h2><p class="biz-note">${esc(r.label)} (${r.from} to ${r.to}), compared with the ${r.days} days before.</p>
  <ul class="biz-summary" aria-label="Management summary">${summary.map((s) => `<li>${s}</li>`).join('')}</ul>
  <div class="biz-kpis">
    ${kpi('Visits (estimated)', visits, { prev: visitsPrev, note: web && web.partial ? 'part of the period measured' : '' })}
    ${kpi('New logbook accounts', lb.newAccounts, { prev: lb.newPrev })}
    ${kpi('First scans logged', lb.firstEntries)}
    ${kpi('Active accounts (30 days to end)', lb.activity ? lb.activity.mau : null)}
    ${kpi('Sign-offs completed', fs.signedInRange)}
    ${kpi('Tailored training enquiries', enq.n, { prev: enqPrev.n })}
    ${kpi('Paid course places', paidPlaces, { prev: plPrev ? plPrev.total.places : undefined })}
    ${kpi('Net revenue', pl ? pl.total.net : null, { prev: plPrev ? plPrev.total.net : undefined, isMoney: true })}
    ${kpi('Operating profit', pl ? pl.total.operatingProfit : null, { prev: plPrev ? plPrev.total.operatingProfit : undefined, isMoney: true })}
    ${kpi('Operating margin', null, { note: pl && pl.total.operatingMargin != null ? `${pl.total.operatingMargin}%` : 'no net revenue in period' })}
  </div>
  <div class="biz-grid">
    <section class="biz-card"><h3>Visits per day (estimated)</h3>${web && web.measured ? columns(web.visitsDaily, { label: 'Visits per day' }) : '<p class="biz-empty">Not measured in this period.</p>'}</section>
    <section class="biz-card"><h3>Customer journey</h3>${table(['Stage', 'r:Count', 'r:From previous stage'], fun.map((s) => [esc(s.stage), num(s.value), pc(s.rate)]))}
      <p class="biz-note">Visits are estimated and nobody is followed between steps, so each rate compares totals in the same period, not the same people. Courses and training: see their tabs.</p></section>
    <section class="biz-card"><h3>Priorities from the data</h3>${flags.length ? `<ul>${flags.map((f) => `<li>${f}</li>`).join('')}</ul>` : '<p class="biz-empty">Nothing flagged.</p>'}<p class="biz-note">Rules, not judgements: each item states a measured fact. See the monthly report for the full list.</p></section>
  </div>`;
}

function summaryLines({ r, visits, visitsPrev, lb, enq, enqPrev, pl, plPrev, fs, web }) {
  const out = [];
  const cmp = (a, b) => (typeof b === 'number' ? (b > 0 ? ` (${a >= b ? 'up' : 'down'} from ${b.toLocaleString('en-GB')})` : ` (none in the previous ${r.prevLabel || `${r.days} days`})`) : '');
  if (visits == null) out.push('Website visits were not measured in this period.');
  else out.push(`Visits (estimated): <b>${visits.toLocaleString('en-GB')}</b>${cmp(visits, visitsPrev)}${web && web.partial ? ', measured for part of the period' : ''}.`);
  out.push(`New logbook accounts: <b>${lb.newAccounts}</b>${cmp(lb.newAccounts, lb.newPrev)}; ${lb.activated} of them logged a scan${lb.activationRate != null ? ` (${lb.activationRate}%)` : ''}.`);
  if (lb.activity) out.push(`Active accounts in the 30 days to ${r.to}: <b>${lb.activity.mau}</b>; ${lb.activity.returning} returned after earlier use.`);
  out.push(`Sign-offs completed: <b>${fs.signedInRange}</b>; ${fs.openRequests} request${fs.openRequests === 1 ? '' : 's'} open now${fs.medianHours != null ? `; median turnaround ${fs.medianHours} hours (link and dashboard)` : ''}.`);
  out.push(`Tailored training enquiries: <b>${enq.n}</b>${cmp(enq.n, enqPrev.n)}${enq.booked ? `; ${enq.booked} booked` : ''}.`);
  if (!pl) out.push('Finance reporting needs migration 0014.');
  else if (!pl.total.income && !pl.total.direct && !pl.total.overhead) out.push('No revenue or costs are recorded for this period.');
  else out.push(`Net revenue <b>${esc(D.gbp(pl.total.net))}</b>, operating profit <b>${esc(D.gbp(pl.total.operatingProfit))}</b>${pl.total.operatingMargin != null ? ` (${pl.total.operatingMargin}% margin)` : ''}${plPrev && plPrev.total.net ? `; previous period net revenue ${esc(D.gbp(plPrev.total.net))}` : ''}. Basis: ${esc(pl.vatBasis)}.`);
  return out;
}

async function priorityFlags(env, rd, { lb, fs, bookings, enqRows }) {
  const flags = [];
  if (fs.openRequests) flags.push(`${fs.openRequests} sign-off request${fs.openRequests === 1 ? ' is' : 's are'} waiting for a supervisor.`);
  if (lb.newAccounts >= 3 && lb.activationRate != null && lb.activationRate < 50) flags.push(`Only ${lb.activationRate}% of new accounts in the period have logged a scan.`);
  const stale = enqRows.filter((e) => (e.stage || 'new') === 'new' && Date.parse(String(e.created_at).replace(' ', 'T') + 'Z') < Date.now() - 7 * 864e5).length;
  if (stale) flags.push(`${stale} training enquir${stale === 1 ? 'y has' : 'ies have'} stayed at New for more than 7 days.`);
  for (const c of SITE.courses || []) for (const d of c.dates || []) {
    const days = Math.round((Date.parse(d.date) - Date.parse(today())) / 864e5);
    if (days < 0 || days > 60 || !d.capacity) continue;
    if (!bookings) { flags.push(`${esc(c.title)} on ${d.date} is ${days} days away; paid places are not recorded until bookings are installed.`); continue; }
    const sold = bookings.filter((b) => b.course_slug === c.slug && b.course_date === d.date && ['paid', 'part_refunded'].includes(b.status)).reduce((a, b) => a + (b.places || 1), 0);
    if (sold / d.capacity < 0.6) flags.push(`${esc(c.title)} on ${d.date}: ${sold} of ${d.capacity} places recorded as paid, ${days} days to go.`);
  }
  if (bookings && bookings.some((b) => b.source === 'stripe' && !b.course_date)) flags.push('Some Stripe bookings have no course date assigned (Courses tab).');
  return flags;
}

async function website(env, url) {
  const { r, rd, st } = await periodData(env, url);
  const web = await webData(env, rd, r, st);
  const head = `${tabs('website', r)}${rangeForm('website', r)}${metaLine(st, rd)}<h2 class="display">Website</h2>`;
  if (!web) return head + notReady('Website measurement');
  if (!web.measured) return head + '<p class="biz-empty">Not measured in this period: website measurement started later or has not recorded a visit yet.</p>';
  const R = web.rows, t = (m) => D.top(R, m, 15).map((x) => [x.dim || '(none)', x.n]);
  const sec = D.bySection(D.top(R, 'pv.path', 10000));
  return `${head}<p class="biz-note">Visits are estimated (section 4.1 of the architecture document): page loads from another site or typed in, in browsers that run JavaScript and have not objected. They are not unique people.</p>
  <div class="biz-kpis">${kpi('Visits (estimated)', D.total(R, 'visit'), { prev: web.prev ? D.total(web.prev, 'visit') : undefined })}${kpi('Page views', D.total(R, 'pv'), { prev: web.prev ? D.total(web.prev, 'pv') : undefined })}${kpi('Pages per visit', null, { note: D.total(R, 'visit') ? (D.total(R, 'pv') / D.total(R, 'visit')).toFixed(2) : 'â€“' })}${kpi('Booking initiations (clicks)', D.total(R, 'ev.book'), { prev: web.prev ? D.total(web.prev, 'ev.book') : undefined, note: 'not sales' })}${kpi('Enquiry forms started', D.total(R, 'ev.enquiry_start'))}${kpi('Enquiries sent', D.total(R, 'conv.enquiry'))}</div>
  <div class="biz-grid">
    <section class="biz-card"><h3>Visits per day</h3>${columns(web.visitsDaily, { label: 'Visits per day' })}</section>
    <section class="biz-card"><h3>Channels</h3>${bars(t('visit.channel'), { label: 'Visits by channel' })}</section>
    <section class="biz-card"><h3>Sources</h3>${bars(t('visit.source'), { label: 'Visits by source' })}</section>
    <section class="biz-card"><h3>Landing pages</h3>${bars(t('visit.path'), { label: 'Landing pages' })}</section>
    <section class="biz-card"><h3>Most viewed pages</h3>${bars(t('pv.path'), { label: 'Page views by page' })}</section>
    <section class="biz-card"><h3>Engagement by section (page views)</h3>${bars(sec.filter(([, n]) => n), { label: 'Page views by section' })}</section>
    <section class="biz-card"><h3>Referring websites</h3>${bars(t('visit.ref'), { label: 'Referring hosts' })}</section>
    <section class="biz-card"><h3>Countries</h3>${bars(t('visit.country'), { label: 'Visits by country' })}<p class="biz-note">From Cloudflare's IP geolocation. XX: unknown.</p></section>
    <section class="biz-card"><h3>Devices</h3>${bars(t('visit.device'), { label: 'Visits by device' })}</section>
    <section class="biz-card"><h3>Calls to action clicked</h3>${bars(t('ev.cta'), { label: 'CTA clicks' })}</section>
    <section class="biz-card"><h3>Booking initiations by page</h3>${bars(t('ev.book'), { label: 'Book now clicks' })}</section>
  </div><p><a class="text-link" href="/admin/business/export/metrics.csv?range=${r.key}&from=${r.from}&to=${r.to}">Download daily counters (CSV)</a></p>`;
}

async function logbook(env, url) {
  const { r, rd, st } = await periodData(env, url);
  const lb = await D.logbookStats(env, rd, r, st.app_start);
  const fs = await D.featureStats(env, rd, r);
  const co = await D.cohorts(env, rd, st.app_start);
  const c = rd.metrics ? await D.sums(env, r.from, r.to, ['app.signup', 'app.signup_fail', 'app.signup_existing', 'app.login', 'app.login_fail', 'app.login_locked', 'app.feature', 'app.entries_created', 'app.error']) : null;
  const a = lb.activity;
  return `${tabs('logbook', r)}${rangeForm('logbook', r)}${metaLine(st, rd)}<h2 class="display">Logbook adoption and retention</h2>
  <div class="biz-kpis">${kpi('App accounts (all time)', lb.accounts, { note: `${lb.verified} with a verified email` })}${kpi('New accounts', lb.newAccounts, { prev: lb.newPrev })}${kpi('New, email verified', lb.newVerified)}${kpi('Academy-only learners (new)', lb.academyOnly)}${kpi('First scans logged', lb.firstEntries)}${kpi('Activation (new accounts with a scan)', null, { note: lb.activationRate != null ? `${lb.activationRate}% (${lb.activated} of ${lb.newAccounts})` : 'no new accounts' })}${kpi('Entries created', lb.entries)}</div>
  <h3>Activity</h3>${a ? `<div class="biz-kpis">${kpi(`Active on ${r.to} (DAU)`, a.dau)}${kpi('Active in 7 days to end (WAU)', a.wau)}${kpi('Active in 30 days to end (MAU)', a.mau)}${kpi('Active in period', a.activeInRange)}${kpi('Returning (used before the period)', a.returning)}${kpi('Stickiness (DAU Ã· MAU)', null, { note: a.mau ? `${D.pct(a.dau, a.mau)}%` : 'â€“' })}</div>
    <div class="biz-card">${columns(a.series, { label: 'Active accounts per day' })}<p class="biz-note">An account is active on a day when it made at least one signed-in request to the app server (for example a sync). Offline use is seen when the app next syncs.${a.partial ? ` Measured since ${a.since}; earlier days are gaps.` : ''}</p></div>` : '<p class="biz-empty">Not measured: activity counting starts when migration 0014 is applied and the first signed-in request arrives.</p>'}
  <h3>Retention by registration month</h3>${co && co.length ? table(['Registered', 'r:Accounts', ...Array.from({ length: 6 }, (_, k) => `r:Month ${k}`)], co.map((x) => [x.cohort, x.size, ...x.rates.map((v) => (v == null ? '' : `${v}%`))])) + '<p class="biz-note">Month 0 is the month of registration. Share of the month\'s new accounts that were active in each later month. Only accounts registered since activity measurement began.</p>' : '<p class="biz-empty">No cohorts yet.</p>'}
  <h3>Feature use (from records)</h3>${table(['Workflow', 'r:Started', 'r:Signed or completed'], [
    ...fs.signoffs.map((s) => [esc(`Sign-off: ${s.dash ? 'supervisor dashboard' : s.method === 'inperson' ? 'in person' : 'link'}`), s.n, s.signed]),
    ...fs.assessments.map((s) => [esc(`Assessment (${s.status})`), s.n, '']),
    ['Verified evidence summaries', fs.evidence, ''], ['Supervisor links created', fs.links, ''],
  ])}
  ${c ? `<div class="biz-grid"><section class="biz-card"><h3>Sign-up and login outcomes</h3>${table(['Outcome', 'r:Count'], [['Accounts created', D.total(c, 'app.signup')], ['Existing email (check your email)', D.total(c, 'app.signup_existing')], ...D.top(c, 'app.signup_fail', 10).map((x) => [esc(`Sign-up refused: ${x.dim}`), x.n]), ['Logins', D.total(c, 'app.login')], ['Login failures', D.total(c, 'app.login_fail')], ['Lockouts', D.total(c, 'app.login_locked')]])}</section>
  <section class="biz-card"><h3>Completed workflows (server-confirmed)</h3>${bars(D.top(c, 'app.feature', 20).map((x) => [x.dim, x.n]), { label: 'Workflows' })}<p class="biz-note">New entries reaching the server: ${D.total(c, 'app.entries_created')}.</p></section>
  <section class="biz-card"><h3>Server errors</h3>${bars(D.top(c, 'app.error', 20).map((x) => [x.dim, x.n]), { label: 'Errors by route' })}</section></div>` : ''}`;
}

async function supervision(env, url) {
  const { r, rd, st } = await periodData(env, url);
  const v = await D.verificationStats(env, rd, r);
  const fs = await D.featureStats(env, rd, r);
  const ce = await pathwayReport(env, r).catch(() => null);
  return `${tabs('supervision', r)}${rangeForm('supervision', r)}${metaLine(st, rd)}<h2 class="display">Supervision and verification</h2>
  <div class="biz-kpis">${kpi('Sign-offs completed', fs.signedInRange)}${kpi('Requests open now', fs.openRequests)}${kpi('Median turnaround (hours)', fs.medianHours, { note: fs.turnaroundN ? `${fs.turnaroundN} link or dashboard sign-offs` : 'none signed' })}${kpi('Verification success rate', null, { note: v && v.successRate != null ? `${v.successRate}% of ${v.decided} decided applications` : 'no decisions in period' })}</div>
  ${v ? `<div class="biz-grid"><section class="biz-card"><h3>Supervisor applications</h3>${table(['Status', 'r:Count'], v.apps.map((a) => [esc(a.status), a.n]))}</section>
  <section class="biz-card"><h3>Current approvals by pathway</h3>${table(['Pathway', 'r:Supervisor-module approvals'], v.approvals.map((a) => [esc(a.pathway), a.n]))}</section>
  <section class="biz-card"><h3>Credentials by type and status</h3>${table(['Credential', 'Status', 'r:Count'], v.creds.map((a) => [esc(a.type), esc(a.status), a.n]))}</section>
  <section class="biz-card"><h3>Professional registrations</h3>${table(['Regulator', 'Status', 'r:Count'], v.regs.map((a) => [esc(a.regulator), esc(a.status), a.n]))}</section>
  <section class="biz-card"><h3>Verification events</h3>${table(['Subject', 'Action', 'Outcome', 'r:Count'], v.checks.map((a) => [esc(a.subject_type), esc(a.action), esc(a.outcome), a.n]))}</section>
  ${ce ? `<section class="biz-card"><h3>By accreditation pathway</h3>${ce}</section>` : ''}</div>` : '<p class="biz-empty">Verification tables are not installed in this database.</p>'}
  <p class="biz-note">Counts and statuses only. No clinical content, scan details or evidence files are read here.</p>`;
}

async function coursesPage(env, url, msg) {
  const { r, rd, st } = await periodData(env, url);
  const head = `${tabs('courses', r)}${rangeForm('courses', r)}${metaLine(st, rd)}<h2 class="display">Courses and bookings</h2>${msg ? `<p class="biz-msg">${esc(msg)}</p>` : ''}`;
  const bookings = await D.bookingRows(env, rd);
  if (!bookings) return head + notReady('Bookings');
  const ledger = await D.ledgerRows(env, rd, '2000-01-01', '2999-12-31');
  const cd = D.courseDates(bookings, ledger, SITE.courses, st.vat_registered || '');
  const web = rd.metrics && st.web_start ? await D.sums(env, r.from, r.to, ['pv.path', 'ev.book']) : null;
  const dateOpts = (SITE.courses || []).flatMap((c) => (c.dates || []).map((d) => [`${c.slug}@${d.date}`, `${c.title}, ${d.date}`]));
  return `${head}<p class="biz-note">Paid places come only from verified Stripe webhooks or bookings you record here with a payment reference. "Book now" clicks are booking initiations, not sales. Revenue is dated by the course date.</p>
  ${table(['Course date', 'r:Capacity', 'r:Paid places', 'r:Pending', 'r:Occupancy', 'r:Gross', 'r:Refunds', 'r:Net', 'r:Fees', 'r:Delivery costs', 'r:Profit', 'r:Margin'], cd.map((c) => [`${esc(c.title)}<br><span class="biz-note">${c.date}, ${esc(c.venue)}</span>`, c.capacity ?? 'â€“', c.places, c.pending, pc(c.occupancy), money(c.income), money(c.refunds), money(c.net), money(c.fees), money(c.direct), money(c.grossProfit), pc(c.grossMargin)]))}
  <p class="biz-note">Fees include Stripe's standard UK card price (1.5% + 20p) where the actual fee is not recorded; those are estimates. Delivery costs are ledger lines linked to the course date (Finance tab).</p>
  ${web ? `<h3>Course page engagement (${esc(r.label)})</h3>${table(['Page', 'r:Page views', 'r:Booking initiations'], (SITE.courses || []).map((c) => [`/courses/${esc(c.slug)}/`, D.total(web, 'pv.path', `/courses/${c.slug}/`), D.total(web, 'ev.book', `/courses/${c.slug}/`)]))}` : ''}
  <h3>Record a booking</h3><form class="biz-f" method="post"><input type="hidden" name="action" value="booking_add">
    <label>Course date<select name="course" required>${opts(dateOpts)}</select></label>
    <label>Status<select name="status">${opts(STATUSES.map((s) => [s, s]), 'paid')}</select></label>
    <label>Source<select name="source"><option value="manual">Card or other, recorded by hand</option><option value="invoice">Invoice (trust or deanery)</option></select></label>
    <label>Places<input name="places" type="number" min="1" max="50" value="1"></label>
    <label>Amount paid (Â£)<input name="gross" inputmode="decimal" required></label>
    <label>Fee (Â£, if known)<input name="fee" inputmode="decimal"></label>
    <label>Reference (receipt or invoice no., not a name)<input name="reference" maxlength="80"></label>
    <label>Campaign label (optional)<input name="campaign" maxlength="60"></label>
    <label>Note (no personal details)<input name="note" maxlength="300"></label>
    <button class="btn btn-teal small" type="submit">Record booking</button></form>
  <h3>Bookings</h3>${table(['Course', 'Source', 'Status', 'r:Places', 'r:Paid', 'r:Refund', 'r:Fee', 'Campaign', 'Edit'], bookings.slice(0, 300).map((b) => [`${esc(b.course_slug || 'Unassigned')}<br><span class="biz-note">${esc(b.course_date || '')}${b.note ? ' Â· ' + esc(b.note) : ''}</span>`, esc(b.source), esc(b.status), b.places, money(b.gross_pence), money(b.refund_pence), `${money(b.fee_pence)}${b.fee_estimated ? ' <span class="biz-note">est.</span>' : ''}`, esc(b.campaign),
    `<form class="biz-i" method="post"><input type="hidden" name="action" value="booking_update"><input type="hidden" name="id" value="${b.id}"><select name="course" aria-label="Course date">${opts(dateOpts, `${b.course_slug}@${b.course_date}`)}${b.course_slug ? '' : '<option value="" selected>Unassigned</option>'}</select><select name="status" aria-label="Status">${opts(STATUSES.map((s) => [s, s]), b.status)}</select><input name="refund" aria-label="Refund in pounds" placeholder="Refund Â£" value="${b.refund_pence ? (b.refund_pence / 100).toFixed(2) : ''}"><input name="fee" aria-label="Fee in pounds" placeholder="Fee Â£" value="${b.fee_pence != null && !b.fee_estimated ? (b.fee_pence / 100).toFixed(2) : ''}"><select name="attended" aria-label="Attendance"><option value=""${b.attended == null ? ' selected' : ''}>Attendance?</option><option value="1"${b.attended === 1 ? ' selected' : ''}>Attended</option><option value="0"${b.attended === 0 ? ' selected' : ''}>Did not attend</option></select><button class="btn btn-ghost small" type="submit">Save</button></form>`]), { empty: 'No bookings recorded yet.' })}
  <p><a class="text-link" href="/admin/business/export/bookings.csv">Download bookings (CSV)</a></p>
  <p class="biz-note">Stripe webhook: ${env.STRIPE_WEBHOOK_SECRET ? 'on' : 'off (no STRIPE_WEBHOOK_SECRET). See docs/commercial-2026/10-deployment-approval.md'}.</p>`;
}

async function training(env, url, msg) {
  const { r, rd, st } = await periodData(env, url);
  const rows = await D.enquiryRows(env, rd);
  const s = D.enquiryStats(rows, r.from, r.to);
  const ledger = rd.ledger ? await D.ledgerRows(env, rd, '2000-01-01', '2999-12-31') : [];
  const money4 = (id) => { const p = D.pnl({ ledger: ledger.filter((l) => l.service === `training:${id}`).map((l) => ({ ...l, stream: 'tailored' })), vat: st.vat_registered || '' }); return p.total; };
  const list = rows.filter((e) => D.inRange(String(e.created_at).slice(0, 10), r.from, r.to));
  const t = (pairs) => bars(pairs.map(([k, n]) => [k, n]), {});
  return `${tabs('training', r)}${rangeForm('training', r)}${metaLine(st, rd)}<h2 class="display">Tailored training</h2>${msg ? `<p class="biz-msg">${esc(msg)}</p>` : ''}
  <div class="biz-kpis">${kpi('Enquiries', s.n)}${kpi('Qualified', s.qualified)}${kpi('Proposals issued', s.proposals)}${kpi('Quotations accepted', s.accepted)}${kpi('Declined', s.declined)}${kpi('Booked', s.booked)}${kpi('Enquiry to booking', null, { note: s.conversion != null ? `${s.conversion}%` : 'â€“' })}${kpi('Value quoted', s.quoted, { isMoney: true })}</div>
  ${rd.enquiries14 ? '' : '<p class="biz-empty">Enquiry type, country, pipeline and quotations need migration 0014.</p>'}
  <div class="biz-grid"><section class="biz-card"><h3>Who is enquiring</h3>${t(s.byClass)}</section><section class="biz-card"><h3>UK and international</h3>${t(s.byRegion)}</section><section class="biz-card"><h3>Countries</h3>${t(s.byCountry)}</section><section class="biz-card"><h3>Modules requested</h3>${t(s.byTopic)}</section><section class="biz-card"><h3>Format wanted</h3>${t(s.byFormat)}</section><section class="biz-card"><h3>Participants</h3>${t(s.bySize)}</section><section class="biz-card"><h3>Budget band</h3>${t(s.byBudget)}</section><section class="biz-card"><h3>How they heard (self-reported)</h3>${t(s.byHeard)}</section><section class="biz-card"><h3>Campaign link (measured)</h3>${t(s.byCampaign)}</section></div>
  <h3>Pipeline</h3><p class="biz-note">Contact details and messages stay on the <a class="text-link" href="/admin/departments/">Training enquiries</a> page. Revenue and costs for a programme are ledger lines with service <code>training:&lt;id&gt;</code>.</p>
  ${table(['#', 'Received', 'Type', 'Country', 'Participants', 'Stage', 'r:Quote', 'r:Revenue', 'r:Profit', 'Update'], list.slice(0, 300).map((e) => { const m = money4(e.id); return [e.id, String(e.created_at).slice(0, 10), esc(e.enquiry_class || e.enquiry_type || 'department'), esc(e.country || ''), esc(e.group_size || ''), esc(label(D.STAGES, e.stage || 'new')), money(e.quote_pence ?? null), money(m.net || null), money(m.net || m.directAll ? m.grossProfit : null),
    rd.enquiries14 ? `<form class="biz-i" method="post"><input type="hidden" name="action" value="stage"><input type="hidden" name="id" value="${e.id}"><select name="stage" aria-label="Stage">${opts(D.STAGES, e.stage || 'new')}</select><input name="quote" aria-label="Quotation in pounds" placeholder="Quote Â£" value="${e.quote_pence != null ? (e.quote_pence / 100).toFixed(2) : ''}"><button class="btn btn-ghost small" type="submit">Save</button></form>` : '']; }), { empty: 'No enquiries in this period.' })}
  <p><a class="text-link" href="/admin/business/export/training.csv?range=${r.key}&from=${r.from}&to=${r.to}">Download pipeline (CSV, no contact details or messages)</a></p>`;
}

async function finance(env, url, msg) {
  const { r, rd, st } = await periodData(env, url);
  const head = `${tabs('finance', r)}${rangeForm('finance', r)}${metaLine(st, rd)}<h2 class="display">Finance</h2>${msg ? `<p class="biz-msg">${esc(msg)}</p>` : ''}`;
  if (!rd.ledger) return head + notReady('Finance');
  const bookings = await D.bookingRows(env, rd);
  const ledger = await D.ledgerRows(env, rd, r.from, r.to);
  const vat = st.vat_registered || '';
  const pl = D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.from, r.to)), ledger, vat });
  const T = pl.total;
  const months = D.monthList(D.parseRange(new URLSearchParams('range=12m')).from, today());
  const allLedger = await D.ledgerRows(env, rd, months[0] + '-01', today());
  const monthly = months.map((m) => { const p = D.pnl({ bookings: bookings.filter((b) => D.monthOf(D.bookingDay(b)) === m), ledger: allLedger.filter((l) => D.monthOf(l.entry_date) === m), vat }); return { m, ...p.total }; });
  const services = [['general', 'General'], ['app', 'Logbook app'], ['academy', 'Academy'], ...(SITE.courses || []).flatMap((c) => (c.dates || []).map((d) => [`course:${c.slug}@${d.date}`, `${c.title}, ${d.date}`]))];
  const catOpts = `<optgroup label="Income">${opts(D.INCOME)}</optgroup><optgroup label="Delivery costs">${opts(D.DIRECT)}</optgroup><optgroup label="Operating costs">${opts(D.OVERHEAD)}</optgroup><optgroup label="Refunds"><option value="refunds">Refund (not a booking)</option></optgroup>`;
  const allCats = [...D.INCOME, ...D.DIRECT, ...D.OVERHEAD, ['refunds', 'Refund']];
  return `${head}<p class="biz-note">Management figures, not statutory accounts and not a replacement for accounting software. Basis: ${esc(pl.vatBasis)}. Revenue from course bookings is dated by course date; ledger lines by the date you enter.${vat ? '' : ' Record your VAT registration status under Settings.'}</p>
  <div class="biz-kpis">${kpi('Gross revenue', T.income, { isMoney: true })}${kpi('Refunds', T.refunds, { isMoney: true })}${kpi('Net revenue', T.net, { isMoney: true })}${kpi('Delivery costs incl. fees', T.directAll, { isMoney: true })}${kpi('Gross profit', T.grossProfit, { isMoney: true, note: T.grossMargin != null ? `${T.grossMargin}% margin` : '' })}${kpi('Operating costs', T.overhead, { isMoney: true })}${kpi('Operating profit', T.operatingProfit, { isMoney: true, note: T.operatingMargin != null ? `${T.operatingMargin}% margin` : '' })}${kpi('Of which estimated', T.estimated, { isMoney: true, note: 'estimated costs and fees' })}${kpi('Revenue per paid place', T.revenuePerPlace, { isMoney: true })}</div>
  <h3>By revenue stream</h3>${table(['Stream', 'r:Revenue', 'r:Refunds', 'r:Net', 'r:Delivery costs', 'r:Gross profit', 'r:Operating costs'], D.STREAMS.map(([k, l]) => { const s = pl.streams[k]; return [esc(l), money(s.income), money(s.refunds), money(s.net), money(s.directAll), money(s.grossProfit), money(s.overhead)]; }))}
  <h3>Last 12 months</h3><div class="biz-card">${columns(monthly.map((x) => ({ day: x.m, n: Math.round(x.net / 100) })), { label: 'Net revenue by month, pounds' })}</div>
  ${table(['Month', 'r:Net revenue', 'r:Gross profit', 'r:Operating profit', 'r:Revenue growth', 'r:Profit growth'], monthly.map((x, i) => [x.m, money(x.net), money(x.grossProfit), money(x.operatingProfit), pc(i ? D.growth(x.net, monthly[i - 1].net) : null), pc(i ? D.growth(x.operatingProfit, monthly[i - 1].operatingProfit) : null)]))}
  <h3>Add an income or expense line</h3><form class="biz-f" method="post"><input type="hidden" name="action" value="ledger_add">
    <label>Date<input type="date" name="entry_date" value="${today()}" required></label><label>Category<select name="category" required>${catOpts}</select></label>
    <label>Revenue stream<select name="stream">${opts(D.STREAMS, 'general')}</select></label><label>Linked to<select name="service">${opts(services, 'general')}</select></label>
    <label>Or training enquiry no.<input name="training_id" inputmode="numeric" placeholder="for example 12"></label>
    <label>Amount incl. VAT (Â£)<input name="amount" inputmode="decimal" required></label><label>VAT within it (Â£)<input name="vat" inputmode="decimal" value="0"></label>
    <label>VAT treatment<select name="vat_treatment">${opts(D.VAT_TREATMENTS, 'not_recorded')}</select></label>
    <label>Basis<select name="basis"><option value="actual">Actual (invoice or receipt)</option><option value="estimate">Estimate</option></select></label>
    <label>Description<input name="description" maxlength="200"></label><label>Reference<input name="reference" maxlength="80"></label>
    <button class="btn btn-teal small" type="submit">Add line</button></form>
  <h3>Lines in this period</h3>${table(['Date', 'Category', 'Stream', 'Linked to', 'Description', 'r:Amount', 'r:VAT', 'Basis', ''], ledger.map((l) => [esc(l.entry_date), esc(label(allCats, l.category)) + (l.kind === 'income' ? ' <span class="biz-note">income</span>' : ''), esc(label(D.STREAMS, l.stream)), esc(l.service), esc(l.description), l.voided_at ? `<s>${money(l.amount_pence)}</s>` : money(l.amount_pence), money(l.vat_pence), esc(l.basis), l.voided_at ? `<span class="biz-note">voided: ${esc(l.void_reason || '')}</span>` : `<form class="biz-i" method="post" onsubmit="return confirm(this.dataset.confirm)" data-confirm="Void this line? It stays in the record, marked void."><input type="hidden" name="action" value="ledger_void"><input type="hidden" name="id" value="${l.id}"><input name="reason" placeholder="Reason" aria-label="Reason" maxlength="120"><button class="btn btn-ghost small" type="submit">Void</button></form>`]), { empty: 'No lines in this period.' })}
  <p><a class="text-link" href="/admin/business/export/ledger.csv?range=${r.key}&from=${r.from}&to=${r.to}">Download ledger (CSV, for your accountant)</a> Â· <a class="text-link" href="/admin/business/export/pnl.csv?range=${r.key}&from=${r.from}&to=${r.to}">Profit and loss by stream (CSV)</a></p>`;
}

async function timePage(env, url, msg) {
  const { r, rd, st } = await periodData(env, url);
  const head = `${tabs('time', r)}${rangeForm('time', r)}${metaLine(st, rd)}<h2 class="display">Owner time</h2>${msg ? `<p class="biz-msg">${esc(msg)}</p>` : ''}`;
  if (!rd.ledger) return head + notReady('Owner time');
  const rows = await D.timeRows(env, rd, r.from, r.to);
  const bookings = await D.bookingRows(env, rd);
  const ledger = await D.ledgerRows(env, rd, r.from, r.to);
  const pl = D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.from, r.to)), ledger, vat: st.vat_registered || '' });
  const mins = (k) => rows.filter((x) => x.stream === k).reduce((a, x) => a + x.minutes, 0);
  const byAct = D.ACTIVITIES.map(([k, l]) => [l, Math.round(rows.filter((x) => x.activity === k).reduce((a, x) => a + x.minutes, 0) / 6) / 10]).filter(([, h]) => h);
  const total = rows.reduce((a, x) => a + x.minutes, 0);
  return `${head}<p class="biz-note">Optional. Profit per owner hour is an indicative management measure (gross profit of a stream Ã· hours you logged against it). It is not pay, not accounting profit, and it is only as complete as the time you record.</p>
  <div class="biz-kpis">${kpi('Hours logged', Math.round(total / 6) / 10)}${kpi('Operating profit per hour logged', null, { note: total ? D.gbp(D.perHour(pl.total.operatingProfit, total)) : 'â€“' })}</div>
  <div class="biz-grid"><section class="biz-card"><h3>Hours by activity</h3>${bars(byAct, { label: 'Hours by activity' })}</section>
  <section class="biz-card"><h3>Profit per owner hour by stream</h3>${table(['Stream', 'r:Hours', 'r:Gross profit', 'r:Per hour (indicative)'], D.STREAMS.map(([k, l]) => [esc(l), Math.round(mins(k) / 6) / 10, money(pl.streams[k].grossProfit), mins(k) ? money(D.perHour(pl.streams[k].grossProfit, mins(k))) : 'â€“']))}</section></div>
  <h3>Log time</h3><form class="biz-f" method="post"><input type="hidden" name="action" value="time_add"><label>Date<input type="date" name="work_date" value="${today()}" required></label><label>Activity<select name="activity">${opts(D.ACTIVITIES)}</select></label><label>Revenue stream<select name="stream">${opts(D.STREAMS, 'courses')}</select></label><label>Linked to (optional)<input name="service" placeholder="course:core-emergency-ultrasound@2026-12-21" maxlength="80"></label><label>Hours<input name="hours" inputmode="decimal" required></label><label>Note<input name="note" maxlength="200"></label><button class="btn btn-teal small" type="submit">Log time</button></form>
  <h3>Entries</h3>${table(['Date', 'Activity', 'Stream', 'Linked to', 'r:Hours', 'Note', ''], rows.map((x) => [esc(x.work_date), esc(label(D.ACTIVITIES, x.activity)), esc(label(D.STREAMS, x.stream)), esc(x.service), Math.round(x.minutes / 6) / 10, esc(x.note), `<form class="biz-i" method="post"><input type="hidden" name="action" value="time_void"><input type="hidden" name="id" value="${x.id}"><button class="btn btn-ghost small" type="submit">Remove</button></form>`]), { empty: 'No time logged in this period.' })}
  <p><a class="text-link" href="/admin/business/export/time.csv?range=${r.key}&from=${r.from}&to=${r.to}">Download time (CSV)</a></p>`;
}

export function campaignUrl({ page = '/', source = '', medium = '', campaign = '', content = '' }) {
  const lbl = (v) => String(v || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 60);
  const p = String(page || '/').startsWith('/') ? String(page).split(/[?#]/)[0] : '/';
  const q = [['utm_source', lbl(source)], ['utm_medium', lbl(medium)], ['utm_campaign', lbl(campaign)], ['utm_content', lbl(content)]].filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
  return `https://thewavelength.co.uk${p}${q ? '?' + q : ''}`;
}
export function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" role="img" aria-label="QR code for ${esc(text)}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0F1E33"/></svg>`;
}

async function marketing(env, url) {
  const { r, rd, st } = await periodData(env, url);
  const web = await webData(env, rd, r, st);
  const enq = D.enquiryStats(await D.enquiryRows(env, rd), r.from, r.to);
  const bookings = (await D.bookingRows(env, rd)) || [];
  const inR = bookings.filter((b) => D.inRange(D.bookingDay(b), r.from, r.to) && ['paid', 'part_refunded', 'refunded'].includes(b.status));
  const byCampaign = {};
  for (const b of inR) { const k = b.campaign || '(none)'; const x = byCampaign[k] || (byCampaign[k] = { places: 0, net: 0 }); x.places += b.places || 1; x.net += (b.gross_pence || 0) - (b.refund_pence || 0); }
  const camps = web && web.measured ? D.top(web.rows, 'visit.campaign', 50) : [];
  const names = [...new Set([...camps.map((c) => c.dim), ...Object.keys(byCampaign).filter((k) => k !== '(none)'), ...enq.byCampaign.map(([k]) => k).filter((k) => k !== '(not given)')])];
  const g = url.searchParams;
  const built = g.get('build') ? campaignUrl({ page: g.get('page'), source: g.get('source'), medium: g.get('medium'), campaign: g.get('campaign'), content: g.get('content') }) : '';
  const channels = web && web.measured ? D.top(web.rows, 'visit.channel', 10) : [];
  return `${tabs('marketing', r)}${rangeForm('marketing', r)}${metaLine(st, rd)}<h2 class="display">Marketing performance</h2>
  <p class="biz-note"><b>Measured</b>: from the link a visitor used (UTM campaign, referrer) and the campaign label carried to an enquiry or Stripe booking in the same browser tab. <b>Estimated</b>: what people tell us on the enquiry form. Neither follows a person across devices or visits.</p>
  <h3>Campaigns (measured)</h3>${table(['Campaign', 'r:Visits', 'r:Enquiries', 'r:Paid places', 'r:Net revenue'], names.map((n) => [esc(n), (camps.find((c) => c.dim === n) || {}).n || 0, (enq.byCampaign.find(([k]) => k === n) || [, 0])[1], (byCampaign[n] || {}).places || 0, money((byCampaign[n] || {}).net || 0)]), { empty: 'No campaign traffic or conversions in this period.' })}
  <div class="biz-grid"><section class="biz-card"><h3>Visits by channel (measured)</h3>${bars(channels.map((x) => [x.dim, x.n]), {})}</section><section class="biz-card"><h3>Enquiries by what people told us (estimated)</h3>${bars(enq.byHeard, {})}</section>
  <section class="biz-card"><h3>Paid places without a campaign label</h3><p>${num((byCampaign['(none)'] || {}).places || 0)} places, ${money((byCampaign['(none)'] || {}).net || 0)}. Unattributed: direct, word of mouth, or a different browser.</p></section></div>
  <h3>Campaign link builder</h3><form class="biz-f" method="get"><input type="hidden" name="build" value="1"><input type="hidden" name="range" value="${r.key}">
    <label>Page<select name="page">${opts([['/', 'Home'], ['/pocus-logbook/', 'Free logbook'], ['/app/get/', 'Download the app'], ['/courses/', 'Courses'], ...(SITE.courses || []).map((c) => [`/courses/${c.slug}/`, c.title]), ['/training/', 'Tailored training'], ['/learn/', 'Pearls'], ['/guides/', 'Guides'], ['/subscribe/', 'Newsletter']], g.get('page') || '/')}</select></label>
    <label>Source<select name="source">${opts([['linkedin', 'LinkedIn'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['newsletter', 'Newsletter'], ['qr', 'QR code'], ['email', 'Email'], ['event', 'Event or conference']], g.get('source') || 'linkedin')}</select></label>
    <label>Medium<select name="medium">${opts([['social', 'Social post'], ['video', 'Video'], ['email', 'Email'], ['qr', 'QR code'], ['print', 'Print'], ['paid-social', 'Paid social']], g.get('medium') || 'social')}</select></label>
    <label>Campaign (yyyy-mm-name)<input name="campaign" value="${esc(g.get('campaign') || '')}" placeholder="2026-11-flagship-film" maxlength="60" required></label>
    <label>Variant (optional)<input name="content" value="${esc(g.get('content') || '')}" placeholder="headline-a" maxlength="60"></label>
    <button class="btn btn-teal small" type="submit">Build link</button></form>
  ${built ? `<div class="biz-card" style="margin-top:12px"><p><code>${esc(built)}</code></p><div class="biz-qr">${qrSvg(built)}</div><p class="biz-note">Use the same campaign name everywhere for one campaign. For a printed QR code, choose medium "QR code".</p></div>` : ''}
  <p class="biz-note">Ready-made links for the videos and launch posts: docs/commercial-2026/06-campaign-links.md.</p>`;
}

// ---------- Opportunity register (private) ----------
export const OPP_STATUSES = [['idea', 'Idea'], ['researching', 'Researching'], ['validating', 'Validating demand'], ['proposal', 'Proposal drafted'], ['approved', 'Approved by owner'], ['active', 'In progress'], ['won', 'Won'], ['parked', 'Parked'], ['dropped', 'Dropped']];
export const priority = (o) => Math.round(((o.score_value * 0.3 + o.score_profit * 0.25 + o.score_scale * 0.2 + o.score_feasible * 0.15 + o.score_strategic * 0.1) / 5) * 100);
async function opportunities(env, url, msg) {
  const { r, rd, st } = await periodData(env, url);
  const head = `${tabs('opportunities', r)}${metaLine(st, rd)}<h2 class="display">Commercial opportunity register</h2>${msg ? `<p class="biz-msg">${esc(msg)}</p>` : ''}`;
  if (!rd.ledger) return head + notReady('The register');
  const { results = [] } = await env.DB.prepare('SELECT * FROM opportunities WHERE archived = 0').all();
  const list = results.map((o) => ({ ...o, p: priority(o) })).sort((a, b) => b.p - a.p);
  const sel = (name, v) => `<select name="${name}" aria-label="${name}">${[1, 2, 3, 4, 5].map((n) => `<option${n === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
  return `${head}<p class="biz-note">Private. Values and costs are owner estimates unless the evidence column says otherwise; they are not forecasts. Priority = value 30%, profitability 25%, scalability 20%, feasibility 15%, strategic importance 10% (each scored 1 to 5).</p>
  ${list.length ? '' : `<form method="post"><input type="hidden" name="action" value="opp_seed"><button class="btn btn-ghost small" type="submit">Load the starter list from the commercial research (estimates)</button></form>`}
  ${table(['Priority', 'Opportunity', 'Stream', 'Customer', 'r:Value (est.)', 'r:Direct cost (est.)', 'r:Owner hours (est.)', 'Evidence', 'Risk', 'Status', 'Next action', 'Scores V P S F St'], list.map((o) => [`<b>${o.p}</b>`, `<b>${esc(o.title)}</b><br><span class="biz-note">${esc(o.description)}</span>${o.requirements ? `<br><span class="biz-note">Requirements: ${esc(o.requirements)}</span>` : ''}`, esc(label(D.STREAMS, o.stream)), esc(o.customer), money(o.value_pence), money(o.cost_pence), o.owner_hours ?? 'â€“', esc(o.evidence), esc(o.risk), esc(label(OPP_STATUSES, o.status)), esc(o.next_action),
    `<form class="biz-i" method="post"><input type="hidden" name="action" value="opp_update"><input type="hidden" name="id" value="${o.id}">${sel('score_value', o.score_value)}${sel('score_profit', o.score_profit)}${sel('score_scale', o.score_scale)}${sel('score_feasible', o.score_feasible)}${sel('score_strategic', o.score_strategic)}<select name="status" aria-label="status">${opts(OPP_STATUSES, o.status)}</select><input name="next_action" value="${esc(o.next_action)}" aria-label="Next action" maxlength="200"><button class="btn btn-ghost small" type="submit">Save</button></form>`]), { empty: 'No opportunities recorded.' })}
  <h3>Add an opportunity</h3><form class="biz-f" method="post"><input type="hidden" name="action" value="opp_add"><label>Title<input name="title" required maxlength="120"></label><label>Stream<select name="stream">${opts(D.STREAMS, 'courses')}</select></label><label>Customer group<input name="customer" maxlength="120"></label><label>Description<input name="description" maxlength="400"></label><label>Value per year (Â£, estimate)<input name="value" inputmode="decimal"></label><label>Direct cost per year (Â£, estimate)<input name="cost" inputmode="decimal"></label><label>Owner hours per year (estimate)<input name="owner_hours" inputmode="numeric"></label><label>Market evidence<input name="evidence" maxlength="300"></label><label>Development needed<input name="development" maxlength="300"></label><label>Regulatory or contract requirements<input name="requirements" maxlength="300"></label><label>Risk<select name="risk">${opts([['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'medium')}</select></label><label>Next action<input name="next_action" maxlength="200"></label><button class="btn btn-teal small" type="submit">Add</button></form>
  <p><a class="text-link" href="/admin/business/export/opportunities.csv">Download register (CSV)</a></p>`;
}

async function monthly(env, url) {
  const m = /^\d{4}-\d{2}$/.test(url.searchParams.get('m') || '') ? url.searchParams.get('m') : today().slice(0, 7);
  const end = (mm) => { const d = new Date(Date.parse(mm + '-01T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); const e = d.toISOString().slice(0, 10); return e > today() ? today() : e; };
  const prevM = (() => { const d = new Date(Date.parse(m + '-15T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const params = new URLSearchParams({ range: 'custom', from: m + '-01', to: end(m) });
  const r = D.parseRange(params);
  r.prevFrom = prevM + '-01'; r.prevTo = end(prevM);
  const fake = { searchParams: params };
  const { rd, st } = await periodData(env, fake);
  const web = await webData(env, rd, r, st);
  const lb = await D.logbookStats(env, rd, r, st.app_start);
  const fs = await D.featureStats(env, rd, r);
  const enqRows = await D.enquiryRows(env, rd);
  const enq = D.enquiryStats(enqRows, r.from, r.to), enqPrev = D.enquiryStats(enqRows, r.prevFrom, r.prevTo);
  const bookings = await D.bookingRows(env, rd);
  const vat = st.vat_registered || '';
  const pl = bookings && rd.ledger ? D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.from, r.to)), ledger: await D.ledgerRows(env, rd, r.from, r.to), vat }) : null;
  const plPrev = bookings && rd.ledger ? D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.prevFrom, r.prevTo)), ledger: await D.ledgerRows(env, rd, r.prevFrom, r.prevTo), vat }) : null;
  const visits = web && web.measured ? D.total(web.rows, 'visit') : null;
  const visitsPrev = web && web.prev ? D.total(web.prev, 'visit') : undefined;
  const time = rd.ledger ? (await D.timeRows(env, rd, r.from, r.to)).reduce((a, x) => a + x.minutes, 0) : 0;
  const flags = await priorityFlags(env, rd, { lb, fs, bookings, enqRows });
  const monthsBack = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.parse(today().slice(0, 7) + '-15T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
  return `${tabs('monthly', r)}<form class="biz-range" method="get"><label>Month<select name="m">${monthsBack.map((x) => `<option${x === m ? ' selected' : ''}>${x}</option>`).join('')}</select></label><button class="btn btn-ghost small" type="submit">Show</button> <button class="btn btn-ghost small" type="button" onclick="print()">Print or save as PDF</button></form>${metaLine(st, rd)}
  <h2 class="display">Monthly business performance: ${m}</h2><p class="biz-note">${r.from} to ${r.to}, compared with ${prevM}.</p>
  <ul class="biz-summary">${summaryLines({ r: { ...r, prevLabel: 'month' }, visits, visitsPrev, lb, enq, enqPrev, pl, plPrev, fs, web }).map((s) => `<li>${s}</li>`).join('')}</ul>
  ${table(['Measure', 'r:' + m, 'r:' + prevM], [
    ['Visits (estimated)', num(visits), num(visitsPrev ?? null)], ['New logbook accounts', lb.newAccounts, lb.newPrev], ['First scans logged', lb.firstEntries, ''], ['Active accounts (30 days to month end)', num(lb.activity ? lb.activity.mau : null), ''], ['Sign-offs completed', fs.signedInRange, ''],
    ['Tailored training enquiries', enq.n, enqPrev.n], ['Training booked', enq.booked, enqPrev.booked], ['Paid course places', pl ? pl.total.places : 'â€“', plPrev ? plPrev.total.places : 'â€“'],
    ['Net revenue', money(pl ? pl.total.net : null), money(plPrev ? plPrev.total.net : null)], ['Gross profit', money(pl ? pl.total.grossProfit : null), money(plPrev ? plPrev.total.grossProfit : null)], ['Operating profit', money(pl ? pl.total.operatingProfit : null), money(plPrev ? plPrev.total.operatingProfit : null)], ['Operating margin', pc(pl ? pl.total.operatingMargin : null), pc(plPrev ? plPrev.total.operatingMargin : null)], ['Owner hours logged', Math.round(time / 6) / 10, ''],
  ])}
  ${pl ? `<h3>By revenue stream</h3>${table(['Stream', 'r:Net revenue', 'r:Gross profit'], D.STREAMS.map(([k, l]) => [esc(l), money(pl.streams[k].net), money(pl.streams[k].grossProfit)]))}` : ''}
  <h3>What to look at</h3>${flags.length ? `<ul>${flags.map((f) => `<li>${f}</li>`).join('')}</ul>` : '<p class="biz-empty">Nothing flagged by the rules.</p>'}
  <p class="biz-note">Management report. Figures marked "Not measured" had no source for the month. Finance basis: ${pl ? esc(pl.vatBasis) : 'not installed'}.</p>
  <p><a class="text-link" href="/admin/business/export/monthly.csv?m=${m}">Download this report (CSV)</a></p>`;
}

async function settingsPage(env, url, msg) {
  const { r, rd, st } = await periodData(env, url);
  return `${tabs('settings', r)}${metaLine(st, rd)}<h2 class="display">Settings</h2>${msg ? `<p class="biz-msg">${esc(msg)}</p>` : ''}
  ${rd.ledger ? `<form class="biz-f" method="post"><input type="hidden" name="action" value="settings"><label>VAT registered?<select name="vat_registered">${opts([['', 'Not recorded'], ['yes', 'Yes'], ['no', 'No']], st.vat_registered || '')}</select></label><label>Monthly net revenue target (Â£, optional)<input name="target_revenue" inputmode="decimal" value="${st.target_revenue ? (Number(st.target_revenue) / 100).toFixed(0) : ''}"></label><label>Target operating margin (%, optional)<input name="target_margin" inputmode="numeric" value="${esc(st.target_margin || '')}"></label><button class="btn btn-teal small" type="submit">Save</button></form>` : notReady('Settings')}
  <h3>Measurement</h3><ul><li>Website measurement started: ${esc(st.web_start || 'not yet')}</li><li>App activity measurement started: ${esc(st.app_start || 'not yet')}</li><li>Stripe webhook: ${env.STRIPE_WEBHOOK_SECRET ? 'on' : 'off'}</li><li>Write caps per Worker instance per day: 4,000 beacon batches, 4,000 app writes.</li></ul>
  <p class="biz-note">Definitions: docs/commercial-2026/02-analytics-architecture.md. Privacy review: docs/commercial-2026/05-privacy-security-review.md.</p>`;
}

// ---------- POST ----------
async function post(env, tab, f) {
  const a = String(f.get('action') || '');
  if (a.startsWith('booking_')) return bookingAdminPost(env, f);
  const rd = await D.ready(env);
  if (a === 'stage' && rd.enquiries14) {
    const id = Number(f.get('id')), stage = D.STAGES.some(([k]) => k === f.get('stage')) ? f.get('stage') : null;
    if (!id || !stage) return 'Choose a stage.';
    const q = clip(f.get('quote'), 20) === '' ? null : pence(f.get('quote'));
    await env.DB.prepare("UPDATE department_enquiries SET stage = ?, stage_at = CASE WHEN COALESCE(stage, 'new') = ? THEN stage_at ELSE datetime('now') END, quote_pence = ? WHERE id = ?").bind(stage, stage, q, id).run();
    return 'Enquiry updated.';
  }
  if (!rd.ledger) return 'Needs migration 0014.';
  if (a === 'ledger_add') {
    const cat = clip(f.get('category'), 40);
    const income = D.INCOME.some(([k]) => k === cat), known = income || [...D.DIRECT, ...D.OVERHEAD].some(([k]) => k === cat) || cat === D.REFUND_CATEGORY;
    const amount = pence(f.get('amount')), vat = pence(f.get('vat') || '0');
    const date = clip(f.get('entry_date'), 10);
    if (!known || amount == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter a date, a category and an amount.';
    if (vat == null || vat > amount) return 'VAT cannot be more than the amount.';
    const tid = Number(f.get('training_id'));
    const service = tid > 0 ? `training:${tid}` : clip(f.get('service'), 80) || 'general';
    const stream = D.STREAMS.some(([k]) => k === f.get('stream')) ? f.get('stream') : tid > 0 ? 'tailored' : service.startsWith('course:') ? 'courses' : 'general';
    const vt = D.VAT_TREATMENTS.some(([k]) => k === f.get('vat_treatment')) ? f.get('vat_treatment') : 'not_recorded';
    await env.DB.prepare('INSERT INTO ledger (entry_date, kind, category, stream, service, description, amount_pence, vat_pence, vat_treatment, basis, reference) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(date, income ? 'income' : 'expense', cat, stream, service, clip(f.get('description'), 200), amount, vat, vt, f.get('basis') === 'estimate' ? 'estimate' : 'actual', clip(f.get('reference'), 80)).run();
    return 'Line added.';
  }
  if (a === 'ledger_void') { await env.DB.prepare("UPDATE ledger SET voided_at = datetime('now'), void_reason = ? WHERE id = ? AND voided_at IS NULL").bind(clip(f.get('reason'), 120) || 'Voided', Number(f.get('id'))).run(); return 'Line voided.'; }
  if (a === 'time_add') {
    const h = Number(String(f.get('hours') || '').replace(',', '.'));
    const date = clip(f.get('work_date'), 10);
    if (!(h > 0 && h <= 24) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter a date and between 0 and 24 hours.';
    await env.DB.prepare('INSERT INTO owner_time (work_date, activity, stream, service, minutes, note) VALUES (?,?,?,?,?,?)').bind(date, D.ACTIVITIES.some(([k]) => k === f.get('activity')) ? f.get('activity') : 'admin', D.STREAMS.some(([k]) => k === f.get('stream')) ? f.get('stream') : 'general', clip(f.get('service'), 80) || 'general', Math.round(h * 60), clip(f.get('note'), 200)).run();
    return 'Time logged.';
  }
  if (a === 'time_void') { await env.DB.prepare("UPDATE owner_time SET voided_at = datetime('now') WHERE id = ?").bind(Number(f.get('id'))).run(); return 'Entry removed.'; }
  if (a === 'settings') {
    const vat = ['yes', 'no'].includes(f.get('vat_registered')) ? f.get('vat_registered') : '';
    const tr = clip(f.get('target_revenue'), 20) ? pence(f.get('target_revenue')) : null;
    const tm = Number(f.get('target_margin'));
    const stmts = [env.DB.prepare('INSERT OR REPLACE INTO business_settings (key, value) VALUES (?, ?)').bind('vat_registered', vat)];
    stmts.push(tr != null ? env.DB.prepare("INSERT OR REPLACE INTO business_settings (key, value) VALUES ('target_revenue', ?)").bind(String(tr)) : env.DB.prepare("DELETE FROM business_settings WHERE key = 'target_revenue'"));
    stmts.push(tm > 0 && tm <= 100 ? env.DB.prepare("INSERT OR REPLACE INTO business_settings (key, value) VALUES ('target_margin', ?)").bind(String(Math.round(tm))) : env.DB.prepare("DELETE FROM business_settings WHERE key = 'target_margin'"));
    await env.DB.batch(stmts);
    return 'Settings saved.';
  }
  if (a === 'opp_add' || a === 'opp_update') {
    const s = (k) => Math.max(1, Math.min(5, Number(f.get(k)) || 3));
    const status = OPP_STATUSES.some(([k]) => k === f.get('status')) ? f.get('status') : 'idea';
    if (a === 'opp_update') {
      await env.DB.prepare("UPDATE opportunities SET score_value = ?, score_profit = ?, score_scale = ?, score_feasible = ?, score_strategic = ?, status = ?, next_action = ?, updated_at = datetime('now') WHERE id = ?").bind(s('score_value'), s('score_profit'), s('score_scale'), s('score_feasible'), s('score_strategic'), status, clip(f.get('next_action'), 200), Number(f.get('id'))).run();
      return 'Opportunity updated.';
    }
    if (!clip(f.get('title'), 120)) return 'Give the opportunity a title.';
    await env.DB.prepare('INSERT INTO opportunities (title, stream, customer, description, value_pence, cost_pence, owner_hours, evidence, development, requirements, risk, next_action) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(clip(f.get('title'), 120), D.STREAMS.some(([k]) => k === f.get('stream')) ? f.get('stream') : 'general', clip(f.get('customer'), 120), clip(f.get('description'), 400), clip(f.get('value'), 20) ? pence(f.get('value')) : null, clip(f.get('cost'), 20) ? pence(f.get('cost')) : null, Number(f.get('owner_hours')) || null, clip(f.get('evidence'), 300), clip(f.get('development'), 300), clip(f.get('requirements'), 300), ['low', 'medium', 'high'].includes(f.get('risk')) ? f.get('risk') : 'medium', clip(f.get('next_action'), 200)).run();
    return 'Opportunity added.';
  }
  if (a === 'opp_seed') {
    const n = ((await env.DB.prepare('SELECT COUNT(*) AS n FROM opportunities').first()) || {}).n || 0;
    if (n) return 'The register already has entries.';
    const seed = OPPORTUNITIES;
    await env.DB.batch(seed.items.map((o) => env.DB.prepare('INSERT INTO opportunities (title, stream, customer, description, value_pence, cost_pence, owner_hours, evidence, development, requirements, risk, score_value, score_profit, score_scale, score_feasible, score_strategic, status, next_action) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(o.title, o.stream, o.customer || '', o.description || '', o.value == null ? null : Math.round(o.value * 100), o.cost == null ? null : Math.round(o.cost * 100), o.ownerHours ?? null, o.evidence || '', o.development || '', o.requirements || '', o.risk || 'medium', o.scores[0], o.scores[1], o.scores[2], o.scores[3], o.scores[4], o.status || 'idea', o.next || '')));
    return `Loaded ${seed.items.length} opportunities (estimates).`;
  }
  return '';
}

// ---------- CSV ----------
async function exportCsv(env, name, url) {
  const r = D.parseRange(url.searchParams);
  const rd = await D.ready(env);
  if (name === 'metrics' && rd.metrics) return { cols: ['day', 'metric', 'dim', 'n'], rows: (await env.DB.prepare('SELECT day, metric, dim, n FROM metric_daily WHERE day BETWEEN ? AND ? ORDER BY day, metric, dim').bind(r.from, r.to).all()).results || [] };
  if (name === 'bookings' && rd.bookings) return { cols: ['id', 'created_at', 'course_slug', 'course_date', 'source', 'status', 'places', 'currency', 'gross_pence', 'refund_pence', 'discount_pence', 'fee_pence', 'fee_estimated', 'vat_pence', 'stripe_session', 'stripe_payment_intent', 'campaign', 'attended', 'paid_at', 'refunded_at', 'cancelled_at', 'reference', 'note'], rows: await D.bookingRows(env, rd) };
  if (name === 'ledger' && rd.ledger) return { cols: ['id', 'entry_date', 'kind', 'category', 'stream', 'service', 'description', 'amount_pence', 'vat_pence', 'vat_treatment', 'basis', 'reference', 'voided_at', 'void_reason'], rows: await D.ledgerRows(env, rd, r.from, r.to) };
  if (name === 'time' && rd.ledger) return { cols: ['id', 'work_date', 'activity', 'stream', 'service', 'minutes', 'note'], rows: await D.timeRows(env, rd, r.from, r.to) };
  if (name === 'opportunities' && rd.ledger) return { cols: ['id', 'title', 'stream', 'customer', 'description', 'value_pence', 'cost_pence', 'owner_hours', 'evidence', 'development', 'requirements', 'risk', 'score_value', 'score_profit', 'score_scale', 'score_feasible', 'score_strategic', 'status', 'next_action', 'updated_at'], rows: (await env.DB.prepare('SELECT * FROM opportunities WHERE archived = 0 ORDER BY id').all()).results || [] };
  if (name === 'training') {
    // No names, emails, phone numbers or messages.
    const rows = (await D.enquiryRows(env, rd)).filter((e) => D.inRange(String(e.created_at).slice(0, 10), r.from, r.to));
    return { cols: ['id', 'created_at', 'enquiry_type', 'enquiry_class', 'country', 'region', 'setting', 'training', 'topics', 'group_size', 'budget', 'heard', 'campaign', 'stage', 'stage_at', 'quote_pence'], rows };
  }
  if (name === 'pnl' && rd.ledger) {
    const bookings = await D.bookingRows(env, rd);
    const pl = D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), r.from, r.to)), ledger: await D.ledgerRows(env, rd, r.from, r.to), vat: (await D.settingsOf(env)).vat_registered || '' });
    return { cols: ['stream', 'revenue_pence', 'refunds_pence', 'net_pence', 'delivery_costs_pence', 'gross_profit_pence', 'operating_costs_pence', 'estimated_pence'], rows: [...D.STREAMS.map(([k]) => ({ stream: k, revenue_pence: pl.streams[k].income, refunds_pence: pl.streams[k].refunds, net_pence: pl.streams[k].net, delivery_costs_pence: pl.streams[k].directAll, gross_profit_pence: pl.streams[k].grossProfit, operating_costs_pence: pl.streams[k].overhead, estimated_pence: pl.streams[k].estimated })), { stream: 'TOTAL', revenue_pence: pl.total.income, refunds_pence: pl.total.refunds, net_pence: pl.total.net, delivery_costs_pence: pl.total.directAll, gross_profit_pence: pl.total.grossProfit, operating_costs_pence: pl.total.overhead, estimated_pence: pl.total.estimated }] };
  }
  if (name === 'monthly') {
    const m = /^\d{4}-\d{2}$/.test(url.searchParams.get('m') || '') ? url.searchParams.get('m') : today().slice(0, 7);
    const from = m + '-01', to = (() => { const d = new Date(Date.parse(from + 'T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
    const rr = { from, to, prevFrom: from, prevTo: from };
    const st = await D.settingsOf(env);
    const lb = await D.logbookStats(env, rd, rr, st.app_start);
    const fs = await D.featureStats(env, rd, rr);
    const web = rd.metrics && st.web_start ? await D.sums(env, from, to, ['visit', 'pv']) : null;
    const enq = D.enquiryStats(await D.enquiryRows(env, rd), from, to);
    const bookings = await D.bookingRows(env, rd);
    const pl = bookings && rd.ledger ? D.pnl({ bookings: bookings.filter((b) => D.inRange(D.bookingDay(b), from, to)), ledger: await D.ledgerRows(env, rd, from, to), vat: st.vat_registered || '' }) : null;
    const rows = [['visits_estimated', web ? D.total(web, 'visit') : 'not measured'], ['page_views', web ? D.total(web, 'pv') : 'not measured'], ['new_app_accounts', lb.newAccounts], ['first_scans', lb.firstEntries], ['mau_at_month_end', lb.activity ? lb.activity.mau : 'not measured'], ['signoffs_completed', fs.signedInRange], ['training_enquiries', enq.n], ['training_booked', enq.booked], ['paid_course_places', pl ? pl.total.places : 'not installed'], ['net_revenue_pence', pl ? pl.total.net : 'not installed'], ['gross_profit_pence', pl ? pl.total.grossProfit : 'not installed'], ['operating_profit_pence', pl ? pl.total.operatingProfit : 'not installed']];
    return { cols: ['month', 'measure', 'value'], rows: rows.map(([k, v]) => ({ month: m, measure: k, value: v })) };
  }
  return null;
}

// Entry point from worker/index.js adminRoute. Returns { html } | { redirect } | { csv: { rows, cols, name } } | null.
export async function businessRoute(env, req, url, p) {
  const rest = p.replace(/^\/admin\/business\//, '');
  const ex = rest.match(/^export\/([a-z]+)\.csv$/);
  if (ex) { const c = await exportCsv(env, ex[1], url); return c ? { csv: { ...c, name: `wavelength-${ex[1]}` } } : { redirect: '/admin/business/' }; }
  const tab = rest.replace(/\/$/, '');
  if (!TABS.some(([k]) => k === tab)) return { redirect: '/admin/business/' };
  if (req.method === 'POST') {
    const m = await post(env, tab, await req.formData());
    return { redirect: `/admin/business/${tab ? tab + '/' : ''}?m=${encodeURIComponent(m || '')}` };
  }
  const msg = url.searchParams.get('m') || '';
  const page = { '': overview, website, logbook, supervision, courses: coursesPage, training, finance, time: timePage, marketing, opportunities, monthly, settings: settingsPage }[tab];
  return { html: `<div class="biz">${STYLE}${await page(env, url, msg)}</div>` };
}

// Used by the department enquiry list and tests.
export { FORM as TRAINING_FORM };
