// Weekly summary email to the owner (25 Oct 2026, owner's request): every Monday morning, last week's figures for the
// Academy, the Pearls, the app and the website, with the all-time totals. Sent by the daily job (worker/cron.js,
// 05:15 UTC, so about 6am UK time) on Mondays in London; no extra cron. If the email provider refuses it, Tuesday's and
// Wednesday's runs try again. Counts only: no names, emails or answers,
// so the email carries no personal data. Names stay in the admin console (Academy tab), linked from the email.
//   To:   env.SUMMARY_TO, else env.MAIL_REPLY_TO (hello@thewavelength.co.uk)
//   Once: a settings row 'weekly-summary:<last Sunday>' is claimed before sending, so a second run that day, or a
//         retry, never sends it twice. A send the provider refused frees the row for the next day's run.
// Week: Monday to Sunday by UK date. Stored timestamps are UTC, so an event between midnight and 1am UK time in
// summer counts on the day before; the counters (metric_daily) are UTC days too.
import DATA from './academy-data.json';
import SITE_DATA from './site-data.json';
import { sendMailResult } from './academy.js';
import { ukDate, addDays } from './time.js';

const SITE = 'https://thewavelength.co.uk';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const n = (v) => Number(v) || 0;

// The week the summary covers: the Monday-to-Sunday UK week before `today` (a UK date). Exported for tests.
export function weekBefore(today) {
  const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 Sunday .. 6 Saturday
  const to = addDays(today, -(dow === 0 ? 7 : dow));
  return { from: addDays(to, -6), to };
}

// Pearl slug of a counted page (/learn/<slug>/ or /learn/<slug>/test/); null for other pages.
export function pearlOf(path) {
  const m = /^\/learn\/([a-z0-9-]+)\/(test\/)?$/.exec(String(path || ''));
  return m && m[1] !== 'test' ? m[1] : null;
}
const PEARLS = Object.fromEntries((SITE_DATA.pearls || []).map((p) => [p.slug, p.title]));
const pearlTitle = (slug) => PEARLS[slug] || slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const moduleTitle = (slug) => (DATA.modules[slug] && DATA.modules[slug].title) || slug;

// Every query is guarded: a table missing from an older database gives zeros, never a failed summary.
async function first(env, sql, ...b) { try { return (await env.DB.prepare(sql).bind(...b).first()) || {}; } catch { return {}; } }
async function all(env, sql, ...b) { try { return (await env.DB.prepare(sql).bind(...b).all()).results || []; } catch { return []; } }

// The figures for one week. Exported for tests and for a preview.
export async function weeklyFigures(env, { from, to }) {
  let hasTest = true;
  try { await env.DB.prepare('SELECT test_account FROM learners LIMIT 0').all(); } catch { hasTest = false; }
  const T = hasTest ? 'AND COALESCE(l.test_account, 0) = 0' : '';
  const inWeek = (col) => `substr(${col}, 1, 10) BETWEEN ? AND ?`;
  const W = [from, to];

  // Academy
  const academyNew = n((await first(env, `SELECT COUNT(*) AS n FROM learners l WHERE l.password_hash IS NULL AND ${inWeek('l.created_at')} ${T}`, ...W)).n);
  const attempts = await all(env, `SELECT a.module, COUNT(*) AS attempts, COUNT(DISTINCT a.learner_id) AS learners, SUM(a.passed) AS passed, ROUND(AVG(a.score)) AS avg
    FROM attempts a JOIN learners l ON l.id = a.learner_id WHERE ${inWeek('a.created_at')} ${T} GROUP BY a.module`, ...W);
  const certsWeek = await all(env, `SELECT c.module, COUNT(*) AS n FROM certificates c JOIN learners l ON l.id = c.learner_id WHERE ${inWeek('c.created_at')} ${T} GROUP BY c.module`, ...W);
  const certsAll = await all(env, `SELECT c.module, COUNT(*) AS n FROM certificates c JOIN learners l ON l.id = c.learner_id WHERE 1 = 1 ${T} GROUP BY c.module`);
  const unsent = n((await first(env, `SELECT COUNT(*) AS n FROM certificates c JOIN learners l ON l.id = c.learner_id WHERE c.emailed_at IS NULL AND c.email_error IS NOT NULL ${T}`)).n);
  const fb = await first(env, `SELECT COUNT(*) AS n, ROUND(AVG(useful), 1) AS useful FROM feedback WHERE ${inWeek('created_at')}`, ...W);
  const mods = [...new Set([...Object.keys(DATA.modules), ...attempts.map((r) => r.module), ...certsAll.map((r) => r.module)])];
  const byMod = (rows, m) => rows.find((r) => r.module === m) || {};
  const modules = mods.map((m) => ({ slug: m, title: moduleTitle(m), attempts: n(byMod(attempts, m).attempts), learners: n(byMod(attempts, m).learners), passed: n(byMod(attempts, m).passed), avg: byMod(attempts, m).avg ?? null, certs: n(byMod(certsWeek, m).n), certsAll: n(byMod(certsAll, m).n) }))
    .filter((m) => m.attempts || m.certsAll || DATA.modules[m.slug]);

  // Pearls (page and test counters; finished tests are counted from 25 Oct 2026)
  const counters = await all(env, "SELECT metric, dim, SUM(n) AS n FROM metric_daily WHERE day BETWEEN ? AND ? AND metric IN ('pv', 'visit', 'pv.path', 'visit.channel', 'ev.quiz', 'ev.quiz_full', 'ev.book', 'ev.enquiry_start') GROUP BY metric, dim", ...W);
  const sum = (metric) => counters.filter((r) => r.metric === metric).reduce((a, r) => a + n(r.n), 0);
  const pearl = {};
  const add = (slug, k, v) => { (pearl[slug] = pearl[slug] || { slug, title: pearlTitle(slug), views: 0, tests: 0, full: 0 })[k] += v; };
  for (const r of counters) {
    const slug = pearlOf(r.dim);
    if (!slug) continue;
    if (r.metric === 'pv.path' && !/\/test\/$/.test(r.dim)) add(slug, 'views', n(r.n));
    if (r.metric === 'ev.quiz') add(slug, 'tests', n(r.n));
    if (r.metric === 'ev.quiz_full') add(slug, 'full', n(r.n));
  }
  const pearls = Object.values(pearl).sort((a, b) => b.tests - a.tests || b.views - a.views || a.title.localeCompare(b.title));
  const quizStart = (await first(env, "SELECT MIN(day) AS d FROM metric_daily WHERE metric = 'ev.quiz'")).d || null;
  const newsletter = await all(env, `SELECT slug, status FROM newsletter_sends WHERE ${inWeek('updated_at')} ORDER BY updated_at`, ...W);

  // App
  const app = {
    newAccounts: n((await first(env, `SELECT COUNT(*) AS n FROM learners l WHERE l.password_hash IS NOT NULL AND ${inWeek('l.created_at')} ${T}`, ...W)).n),
    accounts: n((await first(env, `SELECT COUNT(*) AS n FROM learners l WHERE l.password_hash IS NOT NULL ${T}`)).n),
    active: n((await first(env, `SELECT COUNT(DISTINCT a.learner_id) AS n FROM analytics_learner_days a JOIN learners l ON l.id = a.learner_id WHERE a.day BETWEEN ? AND ? ${T}`, ...W)).n),
    scans: n((await first(env, `SELECT COUNT(*) AS n FROM logbook_entries e JOIN learners l ON l.id = e.learner_id WHERE e.deleted = 0 AND ${inWeek('e.created_at')} ${T}`, ...W)).n),
    requests: n((await first(env, `SELECT COUNT(*) AS n FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE ${inWeek('s.created_at')} ${T}`, ...W)).n),
    signed: n((await first(env, `SELECT COUNT(*) AS n FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.status = 'signed' AND ${inWeek('s.signed_at')} ${T}`, ...W)).n),
    returned: n((await first(env, `SELECT COUNT(*) AS n FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE ${inWeek('s.returned_at')} ${T}`, ...W)).n),
    waiting: n((await first(env, `SELECT COUNT(*) AS n FROM signoffs s JOIN learners l ON l.id = s.learner_id WHERE s.status = 'pending' ${T}`)).n),
    assessments: n((await first(env, `SELECT COUNT(*) AS n FROM assessments s JOIN learners l ON l.id = s.learner_id WHERE s.status IN ('signed', 'superseded') AND ${inWeek('s.signed_at')} ${T}`, ...W)).n),
  };

  // Website and enquiries
  const topPages = counters.filter((r) => r.metric === 'pv.path').sort((a, b) => n(b.n) - n(a.n)).slice(0, 5).map((r) => ({ path: r.dim, n: n(r.n) }));
  const channels = counters.filter((r) => r.metric === 'visit.channel').sort((a, b) => n(b.n) - n(a.n)).map((r) => ({ channel: r.dim, n: n(r.n) }));
  const count = async (table) => n((await first(env, `SELECT COUNT(*) AS n FROM ${table} WHERE ${inWeek('created_at')}`, ...W)).n);
  const paid = await first(env, `SELECT COUNT(*) AS n, SUM(places) AS places, SUM(gross_pence) AS gross FROM bookings WHERE livemode = 1 AND status IN ('paid', 'part_refunded') AND ${inWeek('COALESCE(paid_at, created_at)')}`, ...W);
  const web = {
    visits: sum('visit'), views: sum('pv'), bookClicks: sum('ev.book'), formsStarted: sum('ev.enquiry_start'), topPages, channels,
    training: await count('department_enquiries'), faculty: await count('faculty_applications'), volunteers: await count('volunteers'),
    bookings: n(paid.n), places: n(paid.places), grossPence: n(paid.gross),
  };

  return {
    from, to,
    academy: { newLearners: academyNew, attempts: modules.reduce((a, m) => a + m.attempts, 0), passed: modules.reduce((a, m) => a + m.passed, 0), certs: modules.reduce((a, m) => a + m.certs, 0), certsAll: modules.reduce((a, m) => a + m.certsAll, 0), unsent, feedback: n(fb.n), useful: fb.useful ?? null, modules },
    pearls: { views: pearls.reduce((a, p) => a + p.views, 0), tests: pearls.reduce((a, p) => a + p.tests, 0), full: pearls.reduce((a, p) => a + p.full, 0), list: pearls.slice(0, 10), counting: quizStart, newsletter },
    app, web,
  };
}

// ---------- Email ----------
const H2 = 'margin:30px 0 10px 0;font-family:Georgia,serif;font-weight:normal;font-size:22px;color:#0F1E33;';
const TD = 'padding:8px 6px;border-bottom:1px solid #E4E0D7;font-size:14px;color:#33404F;';
const TH = 'padding:8px 6px;border-bottom:2px solid #2A7F8A;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#2A7F8A;text-align:left;';
const table = (head, rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 8px 0;"><tr>${head.map((h, i) => `<th style="${TH}${i ? 'text-align:right;' : ''}">${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="${TD}${i ? 'text-align:right;' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
const kv = (pairs) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 12px 0;">${pairs.map(([k, v]) => `<tr><td style="${TD}">${esc(k)}</td><td style="${TD}text-align:right;font-weight:bold;color:#0F1E33;">${esc(v)}</td></tr>`).join('')}</table>`;
const note = (s) => `<p style="margin:4px 0 0 0;font-size:13px;line-height:1.5;color:#5B6878;">${esc(s)}</p>`;
const gbp = (p) => `£${(p / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export function summaryEmail(f) {
  const A = f.academy, P = f.pearls, X = f.app, Wb = f.web;
  const period = `${fmt(f.from)} to ${fmt(f.to)} ${f.to.slice(0, 4)}`;
  const headline = [
    `Academy: ${A.attempts} ${A.attempts === 1 ? 'attempt' : 'attempts'}, ${A.certs} ${A.certs === 1 ? 'certificate' : 'certificates'} issued (${A.certsAll} in all).`,
    `Pearls: ${P.views} Pearl page views, ${P.tests} ${P.tests === 1 ? 'test' : 'tests'} finished.`,
    `App: ${X.newAccounts} new ${X.newAccounts === 1 ? 'account' : 'accounts'}, ${X.scans} scans logged, ${X.signed} sign-offs.`,
    `Website: ${Wb.visits} visits, ${Wb.training + Wb.faculty} enquiries and applications, ${Wb.bookings} paid ${Wb.bookings === 1 ? 'booking' : 'bookings'}.`,
  ];
  // Only modules with attempts or certificates this week, by the short part of their title, busiest first.
  const active = A.modules.filter((m) => m.attempts || m.certs).sort((a, b) => b.attempts - a.attempts || b.certs - a.certs);
  const short = (t) => String(t).split(':')[0];
  const sections = [];
  sections.push(`<h2 style="${H2}">Wavelength Academy</h2>` + kv([
    ['New Academy registrations', A.newLearners], ['Assessment attempts', A.attempts], ['Passed', A.passed], ['Certificates issued', A.certs], ['Certificates in all', A.certsAll],
    ...(A.feedback ? [['Feedback received', `${A.feedback}${A.useful != null ? `, usefulness ${A.useful} of 5` : ''}`]] : []),
  ]) + (active.length ? table(['Module', 'Attempts', 'Passed', 'Average', 'Certificates', 'In all'], active.map((m) => [short(m.title), m.attempts, m.passed, m.avg == null ? '–' : `${m.avg}%`, m.certs, m.certsAll])) : note('No module was attempted this week.'))
    + (A.unsent ? note(`${A.unsent} ${A.unsent === 1 ? 'certificate email has' : 'certificate emails have'} not gone out. Admin console, Academy tab, Certificates, to resend.`) : ''));
  sections.push(`<h2 style="${H2}">Wavelength Pearls</h2>` + kv([['Pearl page views', P.views], ['Tests finished', P.tests], ['Tests with full marks', P.full]])
    + (P.list.length ? table(['Pearl', 'Views', 'Tests finished', 'Full marks'], P.list.map((p) => [p.title, p.views, p.tests, p.full])) : note('No Pearl page views were counted this week.'))
    + (!P.counting || P.counting > f.from ? note(`Finished tests are counted from ${P.counting ? fmt(P.counting) : 'the 25 October 2026 website release'}, so earlier weeks show none.`) : '')
    + (P.newsletter.length ? note(`Newsletter: ${P.newsletter.map((s) => `${pearlTitle(s.slug)} (${s.status})`).join('; ')}.`) : note('No newsletter was sent this week.')));
  sections.push(`<h2 style="${H2}">Wavelength app</h2>` + kv([
    ['New accounts', X.newAccounts], ['Accounts in all', X.accounts], ['Accounts that used the app', X.active], ['Scans logged', X.scans],
    ['Sign-off requests sent', X.requests], ['Signed off', X.signed], ['Sent back for more information', X.returned], ['Assessments signed', X.assessments], ['Requests waiting now', X.waiting],
  ]));
  sections.push(`<h2 style="${H2}">Website and enquiries</h2>` + kv([
    ['Visits (estimated)', Wb.visits], ['Page views', Wb.views], ['Booking button clicks', Wb.bookClicks], ['Paid bookings', Wb.bookings ? `${Wb.bookings} (${Wb.places} ${Wb.places === 1 ? 'place' : 'places'}, ${gbp(Wb.grossPence)})` : 0],
    ['Enquiry forms started', Wb.formsStarted], ['Training enquiries', Wb.training], ['Faculty applications', Wb.faculty], ['Volunteer sign-ups', Wb.volunteers],
  ]) + (Wb.topPages.length ? table(['Most viewed pages', 'Views'], Wb.topPages.map((p) => [p.path, p.n])) : '')
    + (Wb.channels.length ? note(`Visits came from: ${Wb.channels.map((c) => `${c.channel} ${c.n}`).join(', ')}.`) : ''));
  const extraHtml = sections.join('') + note('Test accounts are left out. Counts only: names and details are in the admin console.');
  const text = [`Wavelength weekly summary, ${period}`, '', ...headline, '',
    'Academy by module:', ...A.modules.filter((m) => m.attempts || m.certs).map((m) => `- ${m.title}: ${m.attempts} attempts, ${m.passed} passed, ${m.certs} certificates (${m.certsAll} in all)`), '',
    'Top Pearls:', ...(P.list.length ? P.list.map((p) => `- ${p.title}: ${p.views} views, ${p.tests} tests finished`) : ['- none counted']), '',
    `App: ${X.newAccounts} new accounts (${X.accounts} in all), ${X.active} active, ${X.scans} scans, ${X.requests} requests, ${X.signed} signed, ${X.returned} sent back, ${X.waiting} waiting now.`,
    `Website: ${Wb.visits} visits, ${Wb.views} page views, ${Wb.training} training enquiries, ${Wb.faculty} faculty applications, ${Wb.volunteers} volunteers, ${Wb.bookings} paid bookings.`, '',
    `Admin console: ${SITE}/admin/`].join('\n');
  return { subject: `Wavelength weekly summary: ${period}`, heading: 'Your week at Wavelength', paragraphs: [period, ...headline], extraHtml, text };
}

// Called by the daily job. force: send for the last full week whatever the day (used by tests and a manual run).
export async function weeklySummary(env, { now = Date.now(), force = false } = {}) {
  const today = ukDate(now);
  const dow = new Date(today + 'T12:00:00Z').getUTCDay();
  if (!force && (dow < 1 || dow > 3)) return { skipped: 'not Monday to Wednesday' };
  if (!env.ZEPTOMAIL_TOKEN) return { skipped: 'email off' };
  const week = weekBefore(today);
  const key = `weekly-summary:${week.to}`;
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'sending')").bind(key).run();
  if (!(claim.meta && claim.meta.changes)) return { skipped: 'already sent', week: week.to };
  const mail = summaryEmail(await weeklyFigures(env, week));
  const to = env.SUMMARY_TO || env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk';
  const result = await sendMailResult(env, { to, toName: 'Wavelength', fromName: 'Wavelength', ...mail, button: { href: `${SITE}/admin/`, label: 'Open the admin console' } });
  if (result === 'refused') await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  else await env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(result, key).run();
  return { result, week: week.to };
}
