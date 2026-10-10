// Business measurement, bookings, finance and the private dashboard (docs/commercial-2026/02-analytics-architecture.md):
// aggregate counters only, nothing clinical, caps that protect the D1 allowance, measurement that never breaks a
// request, idempotent Stripe webhooks, correct profit arithmetic, and owner-only access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, ctx, ORIGIN } from './helpers/env.mjs';
import { PASSWORD } from './helpers/verify.mjs';
import worker from '../worker/index.js';
import { handleApp } from '../worker/app.js';
import { hashPassword } from '../worker/app-util.js';
import { beaconRows, classify, normPath, deviceOf, budget, LIMITS, signupReason, appRows, rollup } from '../worker/metrics.js';
import { verifyStripe, signStripe, courseFor, estimateFee } from '../worker/bookings.js';
import { pnl, parseRange, perHour, funnel, enquiryStats, ledgerDay, ledgerRows, takenIn } from '../worker/business-data.js';
import { campaignUrl, priority } from '../worker/business.js';
import SITE from '../worker/site-data.json' with { type: 'json' };

globalThis.HTMLRewriter = class {
  on(sel, h) { this.h = h; return this; }
  transform(res) {
    let inner = '';
    this.h.element({ setInnerContent: (c) => { inner = c; } });
    const body = new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode((await res.text()).replace('<div id="admin-root"></div>', `<div id="admin-root">${inner}</div>`))); c.close(); } });
    return new Response(body, { headers: res.headers });
  }
};
const settle = () => new Promise((r) => setTimeout(r, 15));
const reset = () => { budget.day = ''; budget.beacons = 0; budget.app = 0; budget.ips.clear(); budget.seen.clear(); };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const beacon = (env, body, headers = {}) => worker.fetch(new Request(`${ORIGIN}/api/m`, { method: 'POST', headers: { 'User-Agent': DESK, Origin: ORIGIN, 'Content-Type': 'text/plain', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, ctx);
const counters = async (env) => Object.fromEntries(((await env.DB.prepare('SELECT metric, dim, SUM(n) AS n FROM metric_daily GROUP BY metric, dim').all()).results || []).map((r) => [`${r.metric}|${r.dim}`, r.n]));

// ---------- Website measurement ----------
test('channels: search, social, campaign, QR, email, referral and direct are told apart', () => {
  assert.equal(classify('google.co.uk').channel, 'search');
  assert.equal(classify('bing.com').source, 'bing / organic');
  assert.equal(classify('linkedin.com').channel, 'social');
  assert.equal(classify('lnkd.in').source, 'linkedin / social');
  assert.equal(classify('t.co').source, 'x / social');
  assert.equal(classify('', { source: 'LinkedIn', medium: 'social', campaign: '2026-11 Flagship film' }).campaign, '2026-11-flagship-film');
  assert.equal(classify('', { source: 'poster', medium: 'qr', campaign: 'x' }).channel, 'qr');
  assert.equal(classify('', { source: 'zoho', medium: 'newsletter' }).channel, 'email');
  assert.equal(classify('rcem.ac.uk').channel, 'referral');
  assert.equal(classify('').channel, 'direct');
  assert.equal(classify('thewavelength.co.uk').channel, 'direct', 'our own site is never a referrer');
});

test('page paths come only from the site list; devices from the User-Agent class', () => {
  assert.equal(normPath('/courses/core-emergency-ultrasound/?utm_source=x'), '/courses/core-emergency-ultrasound/');
  assert.equal(normPath('/training'), '/training/');
  assert.equal(normPath('/made-up-path-' + 'x'.repeat(50)), '(other)', 'made-up paths cannot fill the counters');
  assert.equal(normPath('/<script>/'), '(other)');
  assert.ok(SITE.paths.includes('/pocus-logbook/'));
  assert.ok(!SITE.paths.some((p) => p.startsWith('/admin/') || p.startsWith('/volunteer/')), 'private areas are not in the list');
  assert.equal(deviceOf(UA), 'mobile');
  assert.equal(deviceOf(DESK), 'desktop');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'tablet');
});

test('a visit is a page view from another site or typed in; internal clicks and reloads are page views only', () => {
  const entry = beaconRows({ t: 'pv', p: '/training/', r: 'https://www.google.com/' }, { country: 'IE', ua: UA });
  const keys = entry.map(([m, d]) => `${m}|${d}`);
  for (const k of ['pv|', 'pv.path|/training/', 'visit|', 'visit.path|/training/', 'visit.channel|search', 'visit.country|IE', 'visit.device|mobile', 'visit.ref|google.com']) assert.ok(keys.includes(k), k);
  assert.deepEqual(beaconRows({ t: 'pv', p: '/courses/', r: 'https://thewavelength.co.uk/' }).map(([m]) => m), ['pv', 'pv.path'], 'internal navigation');
  assert.deepEqual(beaconRows({ t: 'pv', p: '/courses/', r: '', reload: true }).map(([m]) => m), ['pv', 'pv.path'], 'reload');
  assert.equal(beaconRows({ t: 'pv', p: '/', r: '' }, { country: '<x>' }).find(([m]) => m === 'visit.country')[1], 'XX');
  assert.deepEqual(beaconRows({ t: 'ev', n: 'book', p: '/courses/core-emergency-ultrasound/' }), [['ev.book', '/courses/core-emergency-ultrasound/']]);
  assert.deepEqual(beaconRows({ t: 'ev', n: 'unknown' }), []);
});

test('the beacon counts in aggregate, ignores bots, GPC, Do Not Track and junk, and always answers 204', async () => {
  reset();
  const env = makeEnv();
  assert.equal((await beacon(env, { t: 'pv', p: '/training/', r: 'https://www.linkedin.com/', u: { source: 'linkedin', medium: 'social', campaign: 'launch' } })).status, 204);
  await settle();
  let c = await counters(env);
  assert.equal(c['visit.campaign|launch'], 1);
  assert.equal(c['visit.channel|campaign'], 1);
  const before = JSON.stringify(c);
  for (const h of [{ 'User-Agent': 'Googlebot/2.1' }, { 'User-Agent': 'Mozilla/5.0 HeadlessChrome/140' }, { 'Sec-GPC': '1' }, { DNT: '1' }, { Origin: 'https://evil.example' }]) assert.equal((await beacon(env, { t: 'pv', p: '/' }, h)).status, 204);
  assert.equal((await beacon(env, 'not json')).status, 204);
  assert.equal((await beacon(env, '{"t":"pv","p":"/","r":"' + 'x'.repeat(5000) + '"}')).status, 204, 'oversized body is cut and dropped');
  await settle();
  c = await counters(env);
  assert.equal(JSON.stringify(c), before, 'nothing counted for bots, objections, other origins or junk');
  const row = await env.DB.prepare("SELECT value FROM business_settings WHERE key = 'web_start'").first();
  assert.match(row.value, /^\d{4}-\d{2}-\d{2}$/, 'measurement start recorded, so later zeros are real zeros');
  const all = JSON.stringify((await env.DB.prepare('SELECT * FROM metric_daily').all()).results);
  assert.doesNotMatch(all, /\d+\.\d+\.\d+\.\d+|@/, 'no IP address or email anywhere');
});

test('the daily write cap stops measurement before it can use up the D1 allowance', async () => {
  reset();
  const env = makeEnv();
  const cap = LIMITS.beaconsPerDay;
  LIMITS.beaconsPerDay = 3;
  try {
    for (let i = 0; i < 6; i++) await beacon(env, { t: 'pv', p: '/', r: '' });
    await settle();
    assert.equal((await counters(env))['pv|'], 3);
  } finally { LIMITS.beaconsPerDay = cap; reset(); }
});

test('per-address flood limit: one address cannot fill the counters', async () => {
  reset();
  const env = makeEnv();
  for (let i = 0; i < LIMITS.perIpPerMinute + 10; i++) await beacon(env, { t: 'pv', p: '/', r: '' }, { 'CF-Connecting-IP': '203.0.113.9' });
  await settle();
  assert.equal((await counters(env))['pv|'], LIMITS.perIpPerMinute);
  reset();
});

// ---------- App events and activity ----------
test('sign-up outcomes, logins, workflows and server errors are counted by route and status only', () => {
  assert.deepEqual(appRows('POST', 'signup', 200), [['app.signup', ''], ['conv.signup', 'app']]);
  assert.deepEqual(appRows('POST', 'signup', 202), [['app.signup_existing', '']]);
  assert.deepEqual(appRows('POST', 'signup', 400, 'Use at least 12 characters'), [['app.signup_fail', 'password']]);
  assert.equal(signupReason('Tick the box to accept the privacy notice and terms of use.'), 'terms');
  assert.equal(signupReason('Enter a valid email address.'), 'email');
  assert.deepEqual(appRows('POST', 'login', 401), [['app.login_fail', '']]);
  assert.deepEqual(appRows('POST', 'signoff/request', 200), [['app.feature', 'signoff/request']]);
  assert.deepEqual(appRows('GET', 'sync', 500), [['app.error', 'sync']]);
  assert.deepEqual(appRows('GET', 'sync', 200), []);
});

test('real app use records one activity row per account per day, new entries are counted, and deletion removes the rows', async () => {
  reset();
  const env = makeEnv();
  const c = client(handleApp, env);
  assert.equal((await c.call('/api/app/signup', { firstName: 'Ana', lastName: 'Lee', email: 'ana@x.co', password: PASSWORD, terms: true })).status, 200);
  await c.call('/api/app/sync', { entries: [{ id: 'e1aaaaaaaaaa', type: 'lung', date: '2026-10-09', supervision: 'direct', findings: { sliding: 'Present' } }] });
  await c.call('/api/app/sync?since=0');
  await settle();
  const id = (await env.DB.prepare("SELECT id FROM learners WHERE email = 'ana@x.co'").first()).id;
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM analytics_learner_days WHERE learner_id = ?').bind(id).first()).n, 1);
  const k = await counters(env);
  assert.equal(k['app.signup|'], 1);
  assert.equal(k['app.entries_created|'], 1);
  assert.doesNotMatch(JSON.stringify(k), /sliding|Present|lung/, 'no clinical content or scan type in the counters');
  assert.equal((await c.call('/api/app/account/delete', { password: PASSWORD })).status, 200);
  await settle();
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM analytics_learner_days WHERE learner_id = ?').bind(id).first()).n, 0);
  reset();
});

test('measurement never breaks the app: without migration 0014 sign-up and sync work as before', async () => {
  reset();
  const env = makeEnv({}, { skipMigrations: ['0014_business_analytics.sql'] });
  const c = client(handleApp, env);
  assert.equal((await c.call('/api/app/signup', { firstName: 'Bo', lastName: 'Ng', email: 'bo@x.co', password: PASSWORD, terms: true })).status, 200);
  assert.equal((await c.call('/api/app/sync', { entries: [{ id: 'e2aaaaaaaaaa', type: 'aaa', date: '2026-10-09', supervision: 'direct' }] })).status, 200);
  assert.equal((await beacon(env, { t: 'pv', p: '/', r: '' })).status, 204);
  reset();
});

test('roll-up keeps daily active totals and purges activity rows older than 13 months', async () => {
  const env = makeEnv();
  await env.DB.prepare("INSERT INTO analytics_learner_days (learner_id, day) VALUES (1, '2024-01-05'), (2, '2024-01-05'), (1, ?)").bind(new Date(Date.now() - 864e5).toISOString().slice(0, 10)).run();
  const r = await rollup(env);
  assert.equal(r.rolled, 2);
  assert.equal(r.purged, 2, 'the 2024 rows are older than 13 months and already rolled up');
  assert.equal((await env.DB.prepare("SELECT n FROM metric_daily WHERE metric = 'app.active' AND day = '2024-01-05'").first()).n, 2);
  assert.equal((await rollup(env)).rolled, 0, 'idempotent');
});

// ---------- Finance ----------
test('profit and loss: paid bookings only, refunds, estimated fees, delivery and operating costs, margins, voids', () => {
  const bookings = [
    { status: 'paid', gross_pence: 37500, refund_pence: 0, fee_pence: 583, fee_estimated: 0, places: 1 },
    { status: 'part_refunded', gross_pence: 37500, refund_pence: 10000, fee_pence: null, places: 1 },
    { status: 'pending', gross_pence: 37500, refund_pence: 0, places: 1 },
    { status: 'cancelled', gross_pence: 37500, refund_pence: 0, places: 1 },
  ];
  const ledger = [
    { kind: 'expense', category: 'venue', stream: 'courses', amount_pence: 30000, vat_pence: 5000, basis: 'actual' },
    { kind: 'expense', category: 'faculty', stream: 'courses', amount_pence: 20000, vat_pence: 0, basis: 'estimate' },
    { kind: 'expense', category: 'software', stream: 'general', amount_pence: 1000, vat_pence: 0, basis: 'actual' },
    { kind: 'income', category: 'tailored_training', stream: 'tailored', amount_pence: 120000, vat_pence: 20000, basis: 'actual' },
    { kind: 'expense', category: 'travel', stream: 'tailored', amount_pence: 9999, vat_pence: 0, basis: 'actual', voided_at: '2026-10-10' },
  ];
  const p = pnl({ bookings, ledger, vat: 'no' });
  const T = p.total;
  assert.equal(T.places, 2, 'pending and cancelled bookings are not sales');
  assert.equal(T.income, 37500 * 2 + 120000);
  assert.equal(T.refunds, 10000);
  assert.equal(T.net, 185000);
  assert.equal(T.fees, 583 + estimateFee(37500));
  assert.equal(T.directAll, 30000 + 20000 + T.fees);
  assert.equal(T.overhead, 1000);
  assert.equal(T.operatingProfit, T.net - T.directAll - 1000);
  assert.equal(T.estimated, 20000 + estimateFee(37500), 'estimates are reported separately');
  assert.equal(p.streams.tailored.grossProfit, 120000, 'the voided travel line is ignored');
  const vatReg = pnl({ bookings, ledger, vat: 'yes' });
  assert.equal(vatReg.total.income, T.income - 20000, 'VAT registered: recorded output VAT is not revenue');
  assert.equal(vatReg.total.direct, T.direct - 5000, 'and recorded input VAT is not a cost');
  assert.match(pnl({ bookings, ledger }).vatBasis, /not recorded/);
  assert.equal(pnl({}).total.operatingMargin, null, 'no margin without revenue (never a division by zero)');
  assert.equal(perHour(30000, 120), 15000);
  assert.equal(perHour(30000, 0), null);
});

test('course money is matched: costs linked to a course date count on that date; bookings taken count by payment date', async () => {
  assert.equal(ledgerDay({ service: 'course:core-emergency-ultrasound@2026-12-21', entry_date: '2026-10-05' }), '2026-12-21');
  assert.equal(ledgerDay({ service: 'general', entry_date: '2026-10-05' }), '2026-10-05');
  assert.equal(ledgerDay({ service: 'course:broken', entry_date: '2026-10-05' }), '2026-10-05', 'a malformed link falls back to the entry date');
  const env = makeEnv();
  await env.DB.prepare("INSERT INTO ledger (entry_date, kind, category, stream, service, amount_pence) VALUES ('2026-10-05', 'expense', 'venue', 'courses', 'course:core-emergency-ultrasound@2026-12-21', 60000), ('2026-10-05', 'expense', 'software', 'general', 'general', 1200)").run();
  const rd = { ledger: true };
  assert.deepEqual((await ledgerRows(env, rd, '2026-10-01', '2026-10-31')).map((l) => l.category), ['software'], 'October carries only the unlinked cost');
  assert.deepEqual((await ledgerRows(env, rd, '2026-12-01', '2026-12-31')).map((l) => l.category), ['venue'], 'the venue lands with the December course');
  const bookings = [
    { status: 'paid', gross_pence: 39500, refund_pence: 0, places: 1, course_date: '2026-12-21', paid_at: '2026-10-08T10:00:00Z' },
    { status: 'part_refunded', gross_pence: 79000, refund_pence: 39500, places: 2, course_date: '2026-12-21', created_at: '2026-10-09 09:00:00' },
    { status: 'pending', gross_pence: 39500, places: 1, course_date: '2026-12-21', created_at: '2026-10-09 09:00:00' },
  ];
  assert.deepEqual(takenIn(bookings, '2026-10-01', '2026-10-31'), { places: 3, pence: 79000, n: 2 }, 'paid money is visible the month it is taken, refunds deducted, pending ignored');
  assert.deepEqual(takenIn(bookings, '2026-11-01', '2026-11-30'), { places: 0, pence: 0, n: 0 });
});

test('date ranges: presets, a custom range in either order, and no future dates', () => {
  const r = parseRange(new URLSearchParams('range=7d'), '2026-10-10');
  assert.deepEqual([r.from, r.to, r.days, r.prevFrom, r.prevTo], ['2026-10-04', '2026-10-10', 7, '2026-09-27', '2026-10-03']);
  const c = parseRange(new URLSearchParams('range=custom&from=2026-12-31&to=2026-10-01'), '2026-10-10');
  assert.deepEqual([c.from, c.to], ['2026-10-01', '2026-10-10']);
  assert.equal(parseRange(new URLSearchParams('range=nonsense'), '2026-10-10').key, '30d');
  assert.equal(parseRange(new URLSearchParams('range=12m'), '2026-10-10').days, 365);
});

test('funnel rates compare totals and never divide by zero; enquiry pipeline counts stages reached', () => {
  const f = funnel([{ stage: 'a', value: 200 }, { stage: 'b', value: 10 }, { stage: 'c', value: 0 }, { stage: 'd', value: 0 }]);
  assert.deepEqual(f.map((x) => x.rate), [null, 5, 0, null]);
  const rows = [{ created_at: '2026-10-05 10:00:00', stage: 'booked', quote_pence: 250000 }, { created_at: '2026-10-06 10:00:00', stage: 'declined' }, { created_at: '2026-10-07 10:00:00', stage: 'new' }, { created_at: '2026-08-01 10:00:00', stage: 'booked' }];
  const s = enquiryStats(rows, '2026-10-01', '2026-10-10');
  assert.deepEqual([s.n, s.qualified, s.proposals, s.accepted, s.declined, s.booked, s.conversion, s.quoted], [3, 2, 2, 1, 1, 1, 33.3, 250000]);
});

test('campaign links and the opportunity priority score', () => {
  assert.equal(campaignUrl({ page: '/pocus-logbook/', source: 'LinkedIn', medium: 'video', campaign: '2026-11 Flagship', content: 'A' }), 'https://thewavelength.co.uk/pocus-logbook/?utm_source=linkedin&utm_medium=video&utm_campaign=2026-11-flagship&utm_content=a');
  assert.equal(campaignUrl({ page: 'https://evil.example/', source: 'x' }), 'https://thewavelength.co.uk/?utm_source=x', 'never another site');
  assert.equal(priority({ score_value: 5, score_profit: 5, score_scale: 5, score_feasible: 5, score_strategic: 5 }), 100);
  assert.equal(priority({ score_value: 1, score_profit: 1, score_scale: 1, score_feasible: 1, score_strategic: 1 }), 20);
});

// ---------- Stripe ----------
const SECRET = 'whsec_test_secret';
const hook = async (env, evt, { secret = SECRET, t } = {}) => { const raw = JSON.stringify(evt); return worker.fetch(new Request(`${ORIGIN}/api/stripe/webhook`, { method: 'POST', headers: { 'Stripe-Signature': await signStripe(secret, raw, t) }, body: raw }), env, ctx); };
const session = (id, o = {}) => ({ id: 'evt_' + id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + (o.cs || id), mode: 'payment', payment_status: 'paid', amount_total: 37500, currency: 'gbp', payment_intent: 'pi_' + (o.cs || id), client_reference_id: 'wl-launch-film', total_details: { amount_discount: 0 }, ...o.obj } } });

test('Stripe webhook: off without a secret, refuses bad or stale signatures', async () => {
  assert.equal((await hook(makeEnv(), session('a'))).status, 404, 'off until the owner adds the secret');
  const env = makeEnv({ STRIPE_WEBHOOK_SECRET: SECRET });
  assert.equal((await hook(env, session('a'), { secret: 'wrong' })).status, 400);
  assert.equal((await hook(env, session('a'), { t: Math.floor(Date.now() / 1000) - 3600 })).status, 400, 'replayed old event');
  assert.equal((await verifyStripe(SECRET, 't=1,v1=abc', '{}')).ok, false);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM bookings').first()).n, 0);
});

test('Stripe webhook: one paid booking per session, repeated and duplicated events never double-count, refunds update it', async () => {
  const env = makeEnv({ STRIPE_WEBHOOK_SECRET: SECRET });
  assert.equal((await hook(env, session('one'))).status, 200);
  assert.equal((await (await hook(env, session('one'))).json()).duplicate, true, 'same event id again');
  await hook(env, { ...session('two', { cs: 'one' }) }); // a different event for the same session
  const rows = (await env.DB.prepare('SELECT * FROM bookings').all()).results;
  assert.equal(rows.length, 1);
  const b = rows[0];
  assert.deepEqual([b.status, b.gross_pence, b.source, b.campaign, b.fee_estimated], ['paid', 37500, 'stripe', 'launch-film', 1]);
  const d = SITE.courses[0].dates[0];
  assert.deepEqual([b.course_slug, b.course_date], d.stripeLink && d.price === 375 ? [SITE.courses[0].slug, d.date] : ['', ''], 'matched by price only when exactly one date has that price');
  assert.doesNotMatch(JSON.stringify(b), /@/, 'no customer email stored');
  await hook(env, { id: 'evt_r1', type: 'charge.refunded', data: { object: { payment_intent: 'pi_one', amount: 37500, amount_refunded: 10000 } } });
  assert.deepEqual(Object.values(await env.DB.prepare('SELECT status, refund_pence FROM bookings').first()), ['part_refunded', 10000]);
  await hook(env, { id: 'evt_r2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_one', amount: 37500, amount_refunded: 37500 } } });
  assert.equal((await env.DB.prepare('SELECT status FROM bookings').first()).status, 'refunded');
  await hook(env, session('late', { cs: 'one' }));
  assert.equal((await env.DB.prepare('SELECT status FROM bookings').first()).status, 'refunded', 'a late completion event never undoes a refund');
  await hook(env, session('unpaid', { obj: { payment_status: 'unpaid' } }));
  assert.equal((await env.DB.prepare("SELECT status FROM bookings WHERE stripe_session = 'cs_unpaid'").first()).status, 'pending', 'unpaid is pending, not a sale');
  await hook(env, { id: 'evt_fail', type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_unpaid' } } });
  assert.equal((await env.DB.prepare("SELECT status FROM bookings WHERE stripe_session = 'cs_unpaid'").first()).status, 'cancelled');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM stripe_events').first()).n, 7);
});

test('course matching: by Payment Link id first, never guessed between two dates at the same price', () => {
  const courses = [{ slug: 'a', dates: [{ date: '2027-01-01', price: 375, stripeLink: 'x', stripePaymentLink: 'plink_1' }, { date: '2027-02-01', price: 375, stripeLink: 'y' }] }];
  assert.deepEqual(courseFor({ payment_link: 'plink_1', amount_total: 1 }, courses), { slug: 'a', date: '2027-01-01', how: 'payment_link' });
  assert.equal(courseFor({ amount_total: 37500 }, courses).how, 'unassigned');
});

// ---------- Dashboard access ----------
const ADMIN_PW = 'Admin password 12345';
async function adminEnv(extra = {}) {
  const env = makeEnv(extra);
  for (const [k, v] of [['volunteer_username', 'volunteer'], ['admin_username', 'wavelength'], ['volunteer_hash', await hashPassword('Volunteer pw 12345')], ['admin_hash', await hashPassword(ADMIN_PW)], ['session_secret', 'test-secret']]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
  const f = new FormData(); f.append('username', 'wavelength'); f.append('password', ADMIN_PW);
  const r = await worker.fetch(new Request(`${ORIGIN}/admin/login/`, { method: 'POST', body: f }), env, ctx);
  return { env, cookie: (r.headers.get('Set-Cookie') || '').split(';')[0] };
}
const get = (env, path, cookie) => worker.fetch(new Request(ORIGIN + path, { headers: cookie ? { Cookie: cookie } : {} }), env, ctx);
const post = (env, path, cookie, o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return worker.fetch(new Request(ORIGIN + path, { method: 'POST', headers: { Cookie: cookie, Origin: ORIGIN }, body: f }), env, ctx); };

test('the business dashboard is behind the admin login, shows "Not measured" before data exists, and every tab renders', async () => {
  const { env, cookie } = await adminEnv();
  assert.equal((await get(env, '/admin/business/')).headers.get('Location'), '/admin/login/');
  const home = await (await get(env, '/admin/business/', cookie)).text();
  assert.match(home, /Business overview/);
  assert.match(home, /Not measured/, 'no fictional numbers before measurement starts');
  for (const tab of ['website', 'logbook', 'supervision', 'courses', 'training', 'finance', 'time', 'marketing', 'opportunities', 'monthly', 'settings']) {
    const r = await get(env, `/admin/business/${tab}/?range=90d`, cookie);
    assert.equal(r.status, 200, tab);
    const html = await r.text();
    assert.doesNotMatch(html, /undefined|NaN/, `${tab} has no undefined or NaN`);
    // UTF-8 text decoded twice shows as "Â£" or "â€“": the pound sign and dashes must arrive intact.
    assert.doesNotMatch(html, /Â[ -¿]|â€|Ã[\u0080-¿]/, `${tab} has no double-encoded characters`);
  }
  assert.match(await (await get(env, '/admin/business/finance/?range=90d', cookie)).text(), /Amount incl\. VAT \(£\)/);
  assert.match(await (await get(env, '/admin/', cookie)).text(), /href="\/admin\/business\/"/);
});

test('with Cloudflare Access roles, only the owner opens the business dashboard', async () => {
  const { allowed } = await import('../worker/access.js');
  assert.equal(allowed(['owner'], '/admin/business/finance/'), true);
  assert.equal(allowed(['verifier'], '/admin/business/'), false);
  assert.equal(allowed(['academy', 'newsletter'], '/admin/business/export/ledger.csv'), false);
});

test('ledger, owner time, bookings and settings: entered, voided, exported; exports carry no contact details', async () => {
  const { env, cookie } = await adminEnv();
  const ok = async (tab, o) => { const r = await post(env, `/admin/business/${tab}/`, cookie, o); assert.equal(r.status, 303); return decodeURIComponent((r.headers.get('Location').split('m=')[1] || '').replace(/\+/g, ' ')); };
  assert.equal(await ok('finance', { action: 'ledger_add', entry_date: '2026-10-09', category: 'venue', stream: 'courses', service: 'general', amount: '£300.00', vat: '50', vat_treatment: 'standard', basis: 'actual', description: 'Room hire' }), 'Line added.');
  assert.equal(await ok('finance', { action: 'ledger_add', entry_date: '2026-10-09', category: 'venue', amount: '10', vat: '20' }), 'VAT cannot be more than the amount.');
  assert.equal(await ok('finance', { action: 'ledger_add', entry_date: 'yesterday', category: 'venue', amount: '10' }), 'Enter a date, a category and an amount.');
  assert.equal(await ok('time', { action: 'time_add', work_date: '2026-10-09', activity: 'delivery', stream: 'courses', hours: '7.5' }), 'Time logged.');
  assert.equal(await ok('time', { action: 'time_add', work_date: '2026-10-09', activity: 'delivery', hours: '30' }), 'Enter a date and between 0 and 24 hours.');
  const d = SITE.courses[0].dates[0];
  assert.equal(await ok('courses', { action: 'booking_add', course: `${SITE.courses[0].slug}@${d.date}`, status: 'paid', source: 'invoice', places: '2', gross: '750', reference: 'INV-101' }), 'Booking recorded.');
  const b = await env.DB.prepare('SELECT * FROM bookings').first();
  assert.equal(await ok('courses', { action: 'booking_update', id: String(b.id), status: 'paid', refund: '900' }), 'A refund cannot be more than the amount paid.');
  assert.equal(await ok('courses', { action: 'booking_update', id: String(b.id), status: 'paid', refund: '375', attended: '1' }), 'Booking updated.');
  assert.equal((await env.DB.prepare('SELECT status FROM bookings').first()).status, 'part_refunded');
  assert.equal(await ok('settings', { action: 'settings', vat_registered: 'no', target_margin: '40' }), 'Settings saved.');
  const fin = await (await get(env, '/admin/business/finance/?range=custom&from=2026-10-01&to=2026-10-10', cookie)).text();
  assert.match(fin, /Room hire/);
  const line = await env.DB.prepare('SELECT id FROM ledger').first();
  assert.equal(await ok('finance', { action: 'ledger_void', id: String(line.id), reason: 'Duplicate' }), 'Line voided.');
  assert.ok((await env.DB.prepare('SELECT voided_at FROM ledger').first()).voided_at, 'voided, not deleted');
  await env.DB.prepare("INSERT INTO department_enquiries (first_name, last_name, email, phone, organisation, group_size, details) VALUES ('Zed', 'Ray', 'zed@x.co', '+44 7700 900000', 'Clinic', '1', 'Private message')").run();
  const csv = await (await get(env, '/admin/business/export/training.csv?range=12m', cookie)).text();
  assert.doesNotMatch(csv, /zed@x\.co|Zed|7700|Private message/, 'pipeline export has no contact details or messages');
  const led = await (await get(env, '/admin/business/export/ledger.csv?range=custom&from=2026-10-01&to=2026-10-10', cookie)).text();
  assert.match(led, /entry_date,kind,category/);
  assert.equal(await ok('opportunities', { action: 'opp_seed' }), `Loaded ${(await import('../data/opportunities.json', { with: { type: 'json' } })).default.items.length} opportunities (estimates).`);
  assert.equal(await ok('opportunities', { action: 'opp_seed' }), 'The register already has entries.');
});
