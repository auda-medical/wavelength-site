// Cron routing (worker/cron.js): each cron in wrangler.jsonc runs exactly one job. 15 5 * * * runs only the daily
// supervisor job; the two Tuesday crons run only the newsletter; an unknown cron runs nothing. Also simulates each
// cron through the Worker's real scheduled handler, and checks the daily job is idempotent and harmless on a database
// shaped like production after migrations 0012 and 0013 (accounts, links, sign-offs and logbook rows, but no
// supervisor approvals, applications, credentials or registrations).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv } from './helpers/env.mjs';
import { DAILY_CRON, NEWSLETTER_CRONS, MONITOR_CRON, jobFor, runScheduled } from '../worker/cron.js';
import worker from '../worker/index.js';

const wranglerCrons = () => JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')).triggers.crons;

// A ctx that keeps every waitUntil promise, so a test can wait for the scheduled work to finish.
function collectingCtx() { const p = []; return { waitUntil: (x) => p.push(Promise.resolve(x)), done: () => Promise.all(p) }; }
function spies() {
  const calls = [];
  return { calls, jobs: { dailyLifecycle: async () => { calls.push('dailyLifecycle'); }, scheduledNewsletter: async () => { calls.push('scheduledNewsletter'); } } };
}

test('every cron maps to exactly one job', () => {
  assert.equal(DAILY_CRON, '15 5 * * *');
  assert.deepEqual([...NEWSLETTER_CRONS], ['30 6 * * TUE', '30 7 * * TUE']);
  assert.equal(jobFor('15 5 * * *'), 'supervisor-daily');
  assert.equal(jobFor('30 6 * * TUE'), 'newsletter');
  assert.equal(jobFor('30 7 * * TUE'), 'newsletter');
  for (const other of ['15 5 * * 2', '30 6 * * *', '* * * * *', '', undefined, null]) assert.equal(jobFor(other), null, String(other));
});

test('wrangler.jsonc carries exactly the four crons, each routed (the hourly source monitoring added October 2026)', () => {
  const crons = wranglerCrons();
  assert.deepEqual(crons, ['30 6 * * TUE', '30 7 * * TUE', '15 5 * * *', '4,14,24,34,44,54 * * * *']);
  assert.ok(crons.length <= 5, 'the Workers free plan allows five cron triggers per account');
  assert.deepEqual(crons.filter((c) => jobFor(c) === 'source-monitor'), [MONITOR_CRON]);
  assert.equal(new Set(crons).size, crons.length, 'no duplicates');
  for (const c of crons) assert.ok(jobFor(c), `cron ${c} has a job`);
  assert.deepEqual(crons.filter((c) => jobFor(c) === 'supervisor-daily'), [DAILY_CRON]);
  assert.deepEqual(crons.filter((c) => jobFor(c) === 'newsletter'), [...NEWSLETTER_CRONS]);
});

test('the daily cron runs only dailyLifecycle; each Tuesday cron only scheduledNewsletter; others nothing', async () => {
  const env = { DB: {} };
  for (const [cron, expected] of [['15 5 * * *', ['dailyLifecycle']], ['30 6 * * TUE', ['scheduledNewsletter']], ['30 7 * * TUE', ['scheduledNewsletter']], ['0 0 * * *', []], [undefined, []]]) {
    const { calls, jobs } = spies(); const c = collectingCtx();
    const warn = mock.method(console, 'warn', () => {});
    runScheduled({ cron }, env, c, jobs);
    await c.done(); warn.mock.restore();
    assert.deepEqual(calls, expected, `cron ${cron}`);
  }
  // No database binding: nothing runs.
  const { calls, jobs } = spies(); const c = collectingCtx();
  runScheduled({ cron: DAILY_CRON }, {}, c, jobs); await c.done();
  assert.deepEqual(calls, []);
});

test('the hourly monitoring cron runs only monitorRun, and the existing crons never run it', async () => {
  const env = { DB: {} };
  for (const [cron, expected] of [[MONITOR_CRON, ['monitorRun:cron']], [DAILY_CRON, ['dailyLifecycle']], ['30 6 * * TUE', ['scheduledNewsletter']]]) {
    const calls = []; const c = collectingCtx();
    runScheduled({ cron }, env, c, { dailyLifecycle: async () => { calls.push('dailyLifecycle'); }, scheduledNewsletter: async () => { calls.push('scheduledNewsletter'); }, monitorRun: async (e, ctx, o) => { calls.push(`monitorRun:${o.trigger}`); } });
    await c.done();
    assert.deepEqual(calls, expected, `cron ${cron}`);
  }
  // A Worker built without the monitor (older entry) ignores the cron instead of failing.
  const c = collectingCtx();
  assert.equal(runScheduled({ cron: MONITOR_CRON }, env, c, { dailyLifecycle: async () => {}, scheduledNewsletter: async () => {} }), null);
});

test('a failing job is caught and does not reject the scheduled event', async () => {
  const c = collectingCtx();
  const warn = mock.method(console, 'warn', () => {});
  runScheduled({ cron: DAILY_CRON }, { DB: {} }, c, { dailyLifecycle: async () => { throw new Error('boom'); }, scheduledNewsletter: async () => {} });
  await c.done();
  assert.equal(warn.mock.calls.length, 1);
  warn.mock.restore();
});

// A database shaped like production on 6 October 2026: accounts, two supervisor links, two pending sign-offs, logbook
// rows, tokens and verification events, but no approvals, applications, credentials, registrations or evidence.
function productionLike() {
  const env = makeEnv();
  const db = env.DB.db;
  for (let i = 1; i <= 6; i++) db.prepare("INSERT INTO learners (email, first_name, last_name, email_status) VALUES (?, 'Test', ?, ?)").run(`p${i}@example.com`, `Person${i}`, i % 2 ? 'verified' : 'legacy_unverified');
  db.prepare("INSERT INTO supervisor_links (learner_id, supervisor_email, supervisor_id, status, accepted_at) VALUES (1, 'p2@example.com', 2, 'active', datetime('now'))").run();
  db.prepare("INSERT INTO supervisor_links (learner_id, supervisor_email, status, invite_hash, invite_expires) VALUES (3, 'p4@example.com', 'pending', 'h1', ?)").run(Date.now() + 864e5);
  db.prepare("INSERT INTO signoffs (id, learner_id, method, entry_ids, snapshot, status, supervisor_id, token_hash, expires_at) VALUES ('SO-AAAA-AAAA', 1, 'dashboard', '[\"e1\"]', '[]', 'pending', 2, 't1', ?)").run(Date.now() + 864e5);
  db.prepare("INSERT INTO signoffs (id, learner_id, method, entry_ids, snapshot, status, token_hash, expires_at) VALUES ('SO-BBBB-BBBB', 3, 'link', '[\"e2\"]', '[]', 'pending', 't2', ?)").run(Date.now() - 864e5);
  for (const [id, l] of [['e1', 1], ['e2', 3], ['e3', 5]]) db.prepare("INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at) VALUES (?, ?, 'efast', '2026-10-01', '{}', ?)").run(id, l, Date.now());
  db.prepare("INSERT INTO email_tokens (token_hash, learner_id, email, purpose, created_at, expires_at) VALUES ('et1', 1, 'p1@example.com', 'verify', ?, ?)").run(Date.now() - 864e5 * 3, Date.now() - 864e5 * 2);
  db.prepare("INSERT INTO password_resets (token_hash, learner_id, expires_at) VALUES ('pr1', 2, ?)").run(Date.now() - 864e5);
  for (let i = 0; i < 5; i++) db.prepare("INSERT INTO verification_events (learner_id, subject_type, action, actor) VALUES (?, 'email', 'verified', 'learner')").run(1 + (i % 3));
  db.prepare("INSERT INTO settings (key, value) VALUES ('admin_username', 'wavelength')").run();
  return env;
}
function dump(env, except = []) {
  const db = env.DB.db;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name).filter((t) => !except.includes(t));
  return Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all().map((r) => ({ ...r }))]));
}

test('simulated 05:15 daily cron: one job run, nothing else changes, and a second run is the same', async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-07T05:15:00Z') });
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { sent.push(String(u)); return new Response('{}'); };
  try {
    const env = productionLike();
    const assets = [];
    env.ASSETS = { fetch: async (r) => { assets.push(r.url); return new Response('{}'); } };
    const before = dump(env, ['job_runs']);
    for (let n = 1; n <= 2; n++) {
      const c = collectingCtx();
      await worker.scheduled({ cron: '15 5 * * *', scheduledTime: Date.now() }, env, c);
      await c.done();
      assert.deepEqual(dump(env, ['job_runs']), before, `run ${n} changed no other table`);
      const runs = env.DB.db.prepare('SELECT job, outcome, counts, error FROM job_runs ORDER BY id').all();
      assert.equal(runs.length, n);
      assert.equal(runs[n - 1].job, 'supervisor-daily');
      assert.equal(runs[n - 1].outcome, 'ok');
      assert.equal(runs[n - 1].error, null);
      const counts = JSON.parse(runs[n - 1].counts);
      assert.deepEqual(counts, {
        expiry: { expired: 0, people: 0 }, reminders: counts.reminders, lapses: { started: 0, cleared: 0, escalated: 0 },
        purge: { purged: 0 }, drafts: { deleted: 0 }, recheck: { checked: 0 }, stuck: { unknown: 0 }, 'request-reminders': { queued: 0 }, email: counts.email,
        retention: { events: 0, audit: 0, outbox: 0, jobs: 0 },
      });
      assert.equal(counts.reminders.queued, 0);
      for (const v of Object.values(counts.email || {})) if (typeof v === 'number') assert.equal(v, 0, 'no email delivered');
    }
    assert.deepEqual(sent, [], 'no outside request (no email, no Zoho)');
    assert.deepEqual(assets, [], 'the newsletter issue was never loaded');
    assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM newsletter_sends').get().n, 0);
  } finally { globalThis.fetch = realFetch; mock.timers.reset(); }
});

// Each Tuesday cron, in summer (BST) and winter (GMT). scheduledNewsletter loads the issue only at 7am to 8am London
// time; the issue here is on hold (ready false), so nothing reaches Zoho. The daily job never runs.
for (const [when, cron, loads] of [
  ['2026-10-13T06:30:00Z', '30 6 * * TUE', true], // 07:30 BST
  ['2026-10-13T07:30:00Z', '30 7 * * TUE', false], // 08:30 BST
  ['2026-12-01T06:30:00Z', '30 6 * * TUE', false], // 06:30 GMT
  ['2026-12-01T07:30:00Z', '30 7 * * TUE', true], // 07:30 GMT
]) {
  test(`simulated Tuesday newsletter cron ${cron} at ${when}: newsletter only${loads ? ', issue loaded' : ', outside the send hour'}`, async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date(when) });
    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => { sent.push(String(u)); return new Response('{}'); };
    try {
      const env = productionLike();
      env.DB.db.prepare("INSERT INTO settings (key, value) VALUES ('zoho_refresh_token', 'test'), ('newsletter_auto', 'on')").run();
      const assets = [];
      env.ASSETS = { fetch: async (r) => { assets.push(new URL(r.url).pathname); return Response.json({ slug: 'test-pearl', ready: false, drafted: when.slice(0, 10) }); } };
      const before = dump(env);
      const c = collectingCtx();
      await worker.scheduled({ cron, scheduledTime: Date.now() }, env, c);
      await c.done();
      assert.deepEqual(assets, loads ? ['/email/pearl/issue.json'] : []);
      assert.deepEqual(sent, [], 'nothing sent to Zoho or ZeptoMail');
      assert.deepEqual(dump(env), before, 'no table changed: no job run, no supervisor work');
      assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM job_runs').get().n, 0);
    } finally { globalThis.fetch = realFetch; mock.timers.reset(); }
  });
}

test('the daily job does nothing on a Tuesday-newsletter-only schedule: an unknown cron runs neither job', async () => {
  const env = productionLike();
  const assets = [];
  env.ASSETS = { fetch: async (r) => { assets.push(r.url); return new Response('{}'); } };
  const before = dump(env);
  const warn = mock.method(console, 'warn', () => {});
  const c = collectingCtx();
  await worker.scheduled({ cron: '0 12 * * *', scheduledTime: Date.now() }, env, c);
  await c.done();
  warn.mock.restore();
  assert.deepEqual(dump(env), before);
  assert.deepEqual(assets, []);
});

// 14 Oct 2026: Cloudflare numbers weekdays 1 = Sunday to 7 = Saturday, so "30 6 * * 2" ran on MONDAY and the first
// weekly Pearl (Tue 13 Oct) was never sent. A weekday in a Worker cron must be a name, never a number.
test('no Worker cron gives its day of the week as a number', () => {
  for (const c of wranglerCrons()) {
    const dow = c.trim().split(/\s+/)[4];
    assert.ok(dow === '*' || /^[A-Z]{3}([-,][A-Z]{3})*$/.test(dow), `${c}: name the weekday (SUN to SAT), Cloudflare reads 1 as Sunday`);
  }
});

test('the newsletter crons are Tuesday by name, matched whatever the case, and the old Monday crons run nothing', () => {
  assert.ok(NEWSLETTER_CRONS.every((c) => c.endsWith(' TUE')));
  for (const c of ['30 6 * * tue', '30 7 * * Tue', ' 30 6  * * TUE ']) assert.equal(jobFor(c), 'newsletter', c);
  for (const c of ['30 6 * * 2', '30 7 * * 2', '30 6 * * 3', '30 6 * * WED']) assert.equal(jobFor(c), null, c);
});
