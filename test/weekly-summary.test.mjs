// Weekly summary email (25 Oct 2026), finished Pearl tests counted by the beacon, and certificate names in letters the
// certificate font can print (WL-VAC-WHUD-L255 came out as "Ms" because the name was in Arabic letters).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers/env.mjs';
import { handleAcademy } from '../worker/academy.js';
import { weeklySummary, weeklyFigures, summaryEmail, weekBefore, pearlOf } from '../worker/weekly-summary.js';
import { beaconRows } from '../worker/metrics.js';
import { unprintable } from '../worker/cert.js';
import META from '../worker/cert-template.json' with { type: 'json' };
import DATA from '../worker/academy-data.json' with { type: 'json' };

const MAIL = { ZEPTOMAIL_TOKEN: 'test', ZEPTOMAIL_API: 'https://mail.test/' };
const MODULE = Object.keys(DATA.modules)[0];
const MOD = DATA.modules[MODULE];
const answersFor = (right) => Object.fromEntries(MOD.questions.map((q) => [q.id, right ? q.correct : q.options.find((o) => o !== q.correct)]));

// Captures ZeptoMail calls; certificate emails and the summary both go through it.
async function withMail(fn) {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://mail.test/')) { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    return real(url, init);
  };
  try { return await fn(sent); } finally { globalThis.fetch = real; }
}

test('the summary covers the Monday-to-Sunday week before', () => {
  assert.deepEqual(weekBefore('2026-10-26'), { from: '2026-10-19', to: '2026-10-25' }); // Monday
  assert.deepEqual(weekBefore('2026-10-27'), { from: '2026-10-19', to: '2026-10-25' }); // Tuesday retry: same week
  assert.deepEqual(weekBefore('2026-10-25'), { from: '2026-10-12', to: '2026-10-18' }); // Sunday: the week is not over
  assert.equal(pearlOf('/learn/abscess-ultrasound/test/'), 'abscess-ultrasound');
  assert.equal(pearlOf('/learn/abscess-ultrasound/'), 'abscess-ultrasound');
  assert.equal(pearlOf('/learn/test/'), null);
  assert.equal(pearlOf('/learn/'), null);
  assert.equal(pearlOf('/elearning/x/'), null);
});

test('a finished Pearl test is counted by page, with full marks separately, and never the answers', () => {
  const p = '/learn/abscess-ultrasound/test/';
  assert.deepEqual(beaconRows({ t: 'ev', n: 'quiz', l: 'full', p, answers: ['a'] }), [['ev.quiz', p], ['ev.quiz_full', p]]);
  assert.deepEqual(beaconRows({ t: 'ev', n: 'quiz', l: '', p }), [['ev.quiz', p]]);
  assert.deepEqual(beaconRows({ t: 'ev', n: 'quiz', p: '/made-up/' }), [['ev.quiz', '(other)']]);
});

async function seed(env) {
  const day = '2026-10-21 10:00:00';
  const L = async (email, pw, test = 0) => (await env.DB.prepare("INSERT INTO learners (email, first_name, last_name, password_hash, created_at, test_account) VALUES (?, 'A', 'B', ?, ?, ?)").bind(email, pw, day, test).run()).meta.last_row_id;
  const a = await L('a@x.co', null), b = await L('b@x.co', 'h'), t = await L('t@x.co', 'h', 1);
  for (const [id, passed, score] of [[a, 1, 90], [a, 0, 40], [t, 1, 100]]) await env.DB.prepare('INSERT INTO attempts (learner_id, module, score, right_count, total, passed, created_at) VALUES (?, ?, ?, 1, 1, ?, ?)').bind(id, MODULE, score, passed, day).run();
  await env.DB.prepare("INSERT INTO certificates (code, learner_id, module, module_title, name, score, cpd_hours, issued_on, created_at) VALUES ('WL-1', ?, ?, 'M', 'A B', 90, 1, '2026-10-21', ?)").bind(a, MODULE, day).run();
  await env.DB.prepare("INSERT INTO certificates (code, learner_id, module, module_title, name, score, cpd_hours, issued_on, created_at) VALUES ('WL-OLD', ?, ?, 'M', 'A B', 90, 1, '2026-09-01', '2026-09-01 10:00:00')").bind(b, MODULE).run();
  await env.DB.prepare("INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at, created_at) VALUES ('e1', ?, 'efast', '2026-10-21', '{}', 1, ?)").bind(b, day).run();
  for (const [metric, dim, n] of [['pv', '', 50], ['visit', '', 20], ['pv.path', '/learn/abscess-ultrasound/', 7], ['pv.path', '/learn/abscess-ultrasound/test/', 3], ['ev.quiz', '/learn/abscess-ultrasound/test/', 3], ['ev.quiz_full', '/learn/abscess-ultrasound/test/', 2], ['visit.channel', 'search', 12]]) {
    await env.DB.prepare('INSERT INTO metric_daily (day, metric, dim, n) VALUES (?, ?, ?, ?)').bind('2026-10-21', metric, dim, n).run();
  }
  await env.DB.prepare("INSERT INTO faculty_applications (first_name, last_name, email, created_at) VALUES ('F', 'G', 'f@x.co', ?)").bind(day).run();
}

test('the figures count last week only and leave test accounts out', async () => {
  const env = makeEnv(MAIL);
  await seed(env);
  const f = await weeklyFigures(env, { from: '2026-10-19', to: '2026-10-25' });
  assert.equal(f.academy.newLearners, 1);
  assert.equal(f.academy.attempts, 2, 'the test account attempt is left out');
  assert.equal(f.academy.passed, 1);
  assert.equal(f.academy.certs, 1);
  assert.equal(f.academy.certsAll, 2);
  const m = f.academy.modules.find((x) => x.slug === MODULE);
  assert.equal(m.avg, 65);
  assert.equal(f.app.newAccounts, 1);
  assert.equal(f.app.scans, 1);
  assert.equal(f.pearls.views, 7, 'test pages are not counted as views');
  assert.equal(f.pearls.tests, 3);
  assert.equal(f.pearls.full, 2);
  assert.match(f.pearls.list[0].title, /Abscess/i, 'the Pearl title comes from the site data');
  assert.equal(f.web.visits, 20);
  assert.equal(f.web.faculty, 1);
  const mail = summaryEmail(f);
  assert.match(mail.subject, /19 Oct to 25 Oct 2026/);
  assert.match(mail.extraHtml, /Wavelength Pearls/);
  assert.ok(!/a@x\.co|t@x\.co/.test(mail.extraHtml + mail.text), 'no email addresses in the summary');
});

test('the summary is sent once on Monday, to the reply-to address unless SUMMARY_TO is set', async () => {
  const env = makeEnv(MAIL);
  await seed(env);
  const monday = Date.parse('2026-10-26T05:15:00Z');
  await withMail(async (sent) => {
    assert.deepEqual(await weeklySummary(env, { now: Date.parse('2026-10-25T05:15:00Z') }), { skipped: 'not Monday to Wednesday' });
    assert.equal((await weeklySummary(env, { now: monday })).result, 'sent');
    assert.equal((await weeklySummary(env, { now: monday + 3600e3 })).skipped, 'already sent');
    assert.equal((await weeklySummary(env, { now: monday + 864e5 })).skipped, 'already sent', 'Tuesday does not repeat it');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to[0].email_address.address, env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk');
    assert.match(sent[0].subject, /Wavelength weekly summary/);
    assert.match(sent[0].htmlbody, /Tests finished/);
  });
  const env2 = makeEnv({ ...MAIL, SUMMARY_TO: 'owner@x.co' });
  await withMail(async (sent) => {
    await weeklySummary(env2, { now: monday });
    assert.equal(sent[0].to[0].email_address.address, 'owner@x.co');
  });
});

test('a refused send is tried again the next day', async () => {
  const env = makeEnv(MAIL);
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('no', { status: calls === 1 ? 500 : 200 }); };
  try {
    const monday = Date.parse('2026-10-26T05:15:00Z');
    assert.equal((await weeklySummary(env, { now: monday })).result, 'refused');
    assert.equal((await weeklySummary(env, { now: monday + 864e5 })).result, 'sent');
    assert.equal((await weeklySummary(env, { now: monday + 2 * 864e5 })).skipped, 'already sent');
  } finally { globalThis.fetch = real; }
});

test('no summary without email set up', async () => {
  const env = makeEnv({});
  delete env.ZEPTOMAIL_TOKEN;
  assert.deepEqual(await weeklySummary(env, { now: Date.parse('2026-10-26T05:15:00Z') }), { skipped: 'email off' });
});

// ---------- Certificate names ----------
test('the certificate font check: Latin names with accents print, Arabic, Cyrillic and Chinese do not', () => {
  assert.deepEqual(unprintable(META, 'name', "Dr Łukasz Ñúñez O'Brien-Smith"), []);
  assert.deepEqual(unprintable(META, 'name', 'Ms Faiza Lafi Alshammari'), []);
  assert.ok(unprintable(META, 'name', 'Ms فائزة').length > 0);
  assert.ok(unprintable(META, 'name', 'Иван').length > 0);
  assert.ok(unprintable(META, 'name', '王').length > 0);
});

const register = (c, extra = {}) => c.call('/api/academy/register', { module: MODULE, title: 'Ms', first_name: 'Faiza', last_name: 'Alshammari', email: 'f@x.co', role: 'Doctor', privacy: 'yes', ...extra });

test('Academy registration asks for the name in English letters', async () => {
  const env = makeEnv({});
  const c = client(handleAcademy, env);
  const r = await register(c, { first_name: 'فائزة' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /English letters/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM learners').first()).n, 0);
  assert.equal((await register(c)).status, 200);
});

test('a pass with a name the certificate cannot print asks for it first, then issues the certificate with it', async () => {
  const env = makeEnv({});
  const c = client(handleAcademy, env);
  assert.equal((await register(c)).status, 200);
  // An app account or an older registration can hold a name in other letters.
  await env.DB.prepare("UPDATE learners SET first_name = 'فائزة', last_name = 'الشمري'").run();
  let r = await c.call('/api/academy/submit', { module: MODULE, answers: answersFor(true) });
  assert.equal(r.status, 422);
  assert.equal(r.body.needName, true);
  assert.equal(r.body.prefill, 'Ms');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts').first()).n, 0, 'the attempt waits for the name');
  r = await c.call('/api/academy/submit', { module: MODULE, answers: answersFor(true), cert_name: 'Ms فائزة' });
  assert.equal(r.status, 422, 'the typed name must print too');
  r = await c.call('/api/academy/submit', { module: MODULE, answers: answersFor(true), cert_name: 'Ms Faiza Lafi Alshammari' });
  assert.equal(r.status, 200);
  assert.equal(r.body.passed, true);
  const cert = await env.DB.prepare('SELECT name FROM certificates').first();
  assert.equal(cert.name, 'Ms Faiza Lafi Alshammari');
  assert.equal((await env.DB.prepare('SELECT first_name FROM learners').first()).first_name, 'فائزة', 'the account name is unchanged');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts').first()).n, 1);
});

test('a fail is marked as usual, and a printable name is used without asking', async () => {
  const env = makeEnv({});
  const c = client(handleAcademy, env);
  await register(c);
  await env.DB.prepare("UPDATE learners SET first_name = 'فائزة'").run();
  let r = await c.call('/api/academy/submit', { module: MODULE, answers: answersFor(false) });
  assert.equal(r.status, 200);
  assert.equal(r.body.passed, false);
  await env.DB.prepare("UPDATE learners SET first_name = 'Faiza'").run();
  r = await c.call('/api/academy/submit', { module: MODULE, answers: answersFor(true) });
  assert.equal(r.status, 200);
  assert.equal((await env.DB.prepare('SELECT name FROM certificates').first()).name, 'Ms Faiza Alshammari');
});
