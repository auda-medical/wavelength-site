// Weekly Pearl newsletter, fully automatic (3 November 2026). Until then a Monday job had to write
// src/email/pearl/issue.json and push it; on 2 Nov it could not read the send log, kept B-lines (already sent on
// 27 Oct), and the Tuesday send found it sent and stopped: nothing went out on 3 Nov and nobody was told.
// Now the build writes every queued issue and queue.json (lib/pearl-issue.js), and the Worker sends the first ready
// issue that newsletter_sends does not show as sent (worker/newsletter.js). These tests drive the real scheduled
// handler against a fake Zoho Campaigns: the order, the catch-up rule (a missed issue goes first the next Tuesday),
// hourly retries, one issue a week, lost answers, and the owner's email only when a person must act.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv } from './helpers/env.mjs';
import { scheduledNewsletter, sendNext, issuePage, nextIssue } from '../worker/newsletter.js';
import { NEWSLETTER_CRONS, jobFor } from '../worker/cron.js';

const require = createRequire(import.meta.url);
const { renderIssue, readQuestion, academyFor } = require('../lib/pearl-issue.js');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const QUEUE = JSON.parse(readFileSync(new URL('../data/pearl-issues.json', import.meta.url), 'utf8')).issues;
const SLUGS = ['cardiac-tamponade-ultrasound', 'fracture-ultrasound', 'b-lines-lung-ultrasound', 'pneumoperitoneum-ultrasound', 'colour-doppler-aliasing', 'elbow-effusion-ultrasound'];

// The Worker's view of the site: queue.json and one email page per issue.
function assets(queue = SLUGS.map((slug, i) => ({ n: i + 1, slug, key: slug.split('-')[0], subject: `Subject ${slug}`, preheader: 'p', campaignName: `Wavelength Pearl: ${slug}`, ready: true }))) {
  return {
    fetch: async (r) => {
      const p = new URL(r.url).pathname;
      if (p === '/email/pearl/queue.json') return Response.json({ issues: queue });
      const m = p.match(/^\/email\/pearl\/([a-z0-9-]+)\/$/);
      if (m && queue.some((x) => x.slug === m[1])) return new Response(`<p style="x">Wavelength Pearl · October 2026</p><h1>${m[1]}</h1>`, { headers: { 'Content-Type': 'text/html' } });
      return new Response('not found', { status: 404 });
    },
  };
}

// A fake Zoho Campaigns. opts: token ('ok' | 'error' | 'down'), create ('ok' | 'fail'), send ('ok' | 'refuse' |
// 'lost'), state (what getcampaigndetails reports for a campaign after a lost send: 'Sent' | 'Draft' | '?').
function zoho(opts = {}) {
  const o = { token: 'ok', create: 'ok', send: 'ok', state: 'Sent', ...opts };
  const log = []; let n = 0; const states = {};
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    const call = u.pathname.split('/').pop();
    if (u.hostname === 'accounts.zoho.eu') {
      log.push('token');
      if (o.token === 'error') return Response.json({ error: 'invalid_code' });
      if (o.token === 'down') return new Response('busy', { status: 503 });
      return Response.json({ access_token: 'at', expires_in: 3600 });
    }
    if (u.hostname !== 'campaigns.zoho.eu') { log.push('other:' + u.hostname); return Response.json({}); }
    const key = u.searchParams.get('campaignkey');
    log.push(call + (key ? ':' + key : ''));
    if (call === 'getmailinglists') return Response.json({ list_of_details: [{ listname: 'Wavelength newsletter', listkey: 'LK', noofcontacts: 9 }] });
    if (call === 'topics') return Response.json({ topicDetails: [{ topic_id: 'T1' }] });
    if (call === 'createCampaign') {
      if (o.create === 'fail') return Response.json({ code: '2001', message: 'Zoho is busy' });
      const k = 'CK' + ++n; states[k] = 'Draft';
      fn.created.push({ key: k, content: u.searchParams.get('content_url'), name: u.searchParams.get('campaignname') });
      return Response.json({ campaignKey: k, code: '200' });
    }
    if (call === 'getcampaigndetails') return Response.json({ campaign_status: states[key] === 'lost' ? o.state : states[key], associated_mailing_lists: [{ listname: 'Wavelength newsletter', listkey: 'LK' }] });
    if (call === 'sendcampaign') {
      if (o.send === 'refuse') return Response.json({ code: '2500', message: 'refused' });
      if (o.send === 'lost') { states[key] = 'lost'; throw new TypeError('network connection lost'); }
      states[key] = 'Sent'; fn.sent.push(key);
      return Response.json({ code: '200', campaign_status: 'Sent' });
    }
    return Response.json({ code: '404' });
  };
  fn.log = log; fn.created = []; fn.sent = []; fn.set = (k, v) => { o[k] = v; };
  return fn;
}

function setup(sent = [], extra = {}) {
  const env = makeEnv({ ASSETS: assets(extra.queue), ...extra.env });
  const db = env.DB.db;
  db.prepare("INSERT INTO settings (key, value) VALUES ('zoho_client_id', 'cid'), ('zoho_client_secret', 'sec'), ('zoho_refresh_token', 'rt')").run();
  for (const [slug, at] of sent) db.prepare("INSERT INTO newsletter_sends (slug, status, detail, campaign_key, created_at, updated_at) VALUES (?, 'sent', 'Campaign X 200', 'X', ?, ?)").run(slug, at, at);
  return env;
}
const rows = (env) => Object.fromEntries(env.DB.db.prepare('SELECT slug, status, campaign_key FROM newsletter_sends').all().map((r) => [r.slug, r.status]));
const alerts = (env) => env.DB.db.prepare("SELECT key, kind, payload FROM notification_log WHERE kind = 'newsletter_alert' ORDER BY key").all().map((r) => ({ key: r.key, ...JSON.parse(r.payload) }));
async function withZoho(z, fn) {
  const real = globalThis.fetch; globalThis.fetch = z;
  try { return await fn(); } finally { globalThis.fetch = real; }
}
const at = (iso) => Date.parse(iso);
// Production on 4 Nov 2026: tamponade, fracture and B-lines sent on their Tuesdays, pneumoperitoneum sent on 4 Nov
// by the admin button after the missed Tuesday.
const LIVE = [['cardiac-tamponade-ultrasound', '2026-10-16 17:59:32'], ['fracture-ultrasound', '2026-10-20 06:30:44'], ['b-lines-lung-ultrasound', '2026-10-27 07:30:42'], ['pneumoperitoneum-ultrasound', '2026-11-04 00:30:00']];

test('the Tuesday cron runs hourly from 06:30 to 17:30 UTC and is routed to the newsletter only', () => {
  assert.deepEqual([...NEWSLETTER_CRONS], ['30 6-17 * * TUE']);
  assert.equal(jobFor('30 6-17 * * TUE'), 'newsletter');
  assert.equal(jobFor('30 6-17 * * tue'), 'newsletter');
  for (const old of ['30 6 * * TUE', '30 7 * * TUE', '30 6-17 * * 3']) assert.equal(jobFor(old), null, old);
});

test('Tue 10 Nov: after the out-of-turn send of pneumoperitoneum, the schedule moves on to aliasing, once', async () => {
  const env = setup(LIVE); const z = zoho();
  await withZoho(z, async () => {
    const r = await scheduledNewsletter(env, at('2026-11-10T07:30:00Z')); // 7:30am GMT
    assert.equal(r.ok, true, r.msg);
    assert.equal(r.slug, 'colour-doppler-aliasing');
    assert.equal(rows(env)['colour-doppler-aliasing'], 'sent');
    assert.equal(z.created.length, 1);
    assert.equal(z.created[0].content, 'https://thewavelength.co.uk/api/newsletter/pearl/colour-doppler-aliasing/');
    // The hourly retries that day see the week's send and do nothing at all.
    const calls = z.log.length;
    for (const h of ['08', '12', '17']) assert.equal((await scheduledNewsletter(env, at(`2026-11-10T${h}:30:00Z`))).already, true);
    assert.equal(z.log.length, calls, 'no Zoho call after the week is done');
    // The next Tuesday sends the one after it.
    assert.equal((await scheduledNewsletter(env, at('2026-11-17T07:30:00Z'))).slug, 'elbow-effusion-ultrasound');
    assert.deepEqual(z.sent, ['CK1', 'CK2']);
  });
  // Only the early warning that this six-issue test queue is nearly used up.
  assert.deepEqual(alerts(env).map((a) => a.data.reason), ['low', 'low']);
});

test('a missed Tuesday: the missed issue goes first the next Tuesday, then the queue carries on in order', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ token: 'down' });
  await withZoho(z, async () => {
    // Tue 3 Nov: Zoho down at every hourly try, 06:30 GMT (too early) to 17:30.
    for (let h = 6; h <= 17; h++) assert.equal((await scheduledNewsletter(env, at(`2026-11-03T${String(h).padStart(2, '0')}:30:00Z`))).ok, h === 6 ? undefined : false);
    assert.equal(rows(env)['pneumoperitoneum-ultrasound'], 'failed');
    assert.deepEqual(z.sent, []);
    assert.deepEqual(alerts(env), [], 'one bad Tuesday is not the owner\'s job');
    z.set('token', 'ok');
    assert.equal((await scheduledNewsletter(env, at('2026-11-10T07:30:00Z'))).slug, 'pneumoperitoneum-ultrasound');
    assert.equal((await scheduledNewsletter(env, at('2026-11-17T07:30:00Z'))).slug, 'colour-doppler-aliasing');
  });
  assert.equal(env.DB.db.prepare("SELECT COUNT(*) n FROM settings WHERE key = 'newsletter_failing_since'").get().n, 0, 'cleared by the send');
});

test('a failure at 7:30 is retried at the next hourly run the same day, and sent once', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ create: 'fail' });
  await withZoho(z, async () => {
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'))).ok, false);
    z.set('create', 'ok');
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T08:30:00Z'))).slug, 'pneumoperitoneum-ultrasound');
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T09:30:00Z'))).already, true);
  });
  assert.deepEqual(z.sent, ['CK1']);
});

test('Zoho refusing the send leaves a draft; the next run makes a new campaign and sends it', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ send: 'refuse' });
  await withZoho(z, async () => {
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'))).ok, false);
    assert.equal(rows(env)['pneumoperitoneum-ultrasound'], 'failed');
    z.set('send', 'ok');
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T08:30:00Z'))).ok, true);
  });
  assert.deepEqual(z.sent, ['CK2']);
});

test('a lost answer from Zoho: the next run asks Zoho, finds it sent and never sends it again', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ send: 'lost', state: 'Sent' });
  await withZoho(z, async () => {
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'))).ok, false);
    const row = env.DB.db.prepare("SELECT status, campaign_key FROM newsletter_sends WHERE slug = 'pneumoperitoneum-ultrasound'").get();
    assert.deepEqual({ ...row }, { status: 'sending', campaign_key: 'CK1' }, 'the campaign key is kept for the check');
    z.set('send', 'ok');
    const r = await scheduledNewsletter(env, at('2026-11-03T08:30:00Z'));
    assert.equal(r.already, true, r.msg);
    assert.equal(rows(env)['pneumoperitoneum-ultrasound'], 'sent');
    assert.equal(z.created.length, 1, 'no second campaign');
    assert.equal((await scheduledNewsletter(env, at('2026-11-10T07:30:00Z'))).slug, 'colour-doppler-aliasing');
  });
});

test('a lost answer for a campaign Zoho still holds as a draft: it is sent on the next run', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ send: 'lost', state: 'Draft' });
  await withZoho(z, async () => {
    await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'));
    z.set('send', 'ok');
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T08:30:00Z'))).slug, 'pneumoperitoneum-ultrasound');
  });
  assert.deepEqual(z.sent, ['CK2']);
});

test('Zoho cannot say what happened: nothing more is sent, and the owner is asked once, at the last try', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ send: 'lost', state: '?' });
  await withZoho(z, async () => {
    for (let h = 7; h <= 17; h++) await scheduledNewsletter(env, at(`2026-11-03T${String(h).padStart(2, '0')}:30:00Z`));
  });
  assert.equal(z.created.length, 1);
  const a = alerts(env);
  assert.equal(a.length, 1);
  assert.equal(a[0].data.reason, 'unknown');
  assert.equal(a[0].to, 'hello@thewavelength.co.uk');
});

test('Zoho needs reconnecting: one email to the owner that day with the clicks, and the queue keeps its place', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ token: 'error' });
  await withZoho(z, async () => {
    for (const h of ['07', '08', '09']) assert.equal((await scheduledNewsletter(env, at(`2026-11-03T${h}:30:00Z`))).hands, 'reconnect');
  });
  const a = alerts(env);
  assert.equal(a.length, 1, 'one email a day, not one an hour');
  assert.equal(a[0].key, 'newsletter:reconnect:2026-11-03');
  assert.equal(a[0].data.reason, 'reconnect');
  const { render } = await import('../worker/notify.js');
  const m = render('newsletter_alert', a[0].data);
  assert.match(m.text, /Reconnect Zoho Campaigns/);
  assert.match(m.text, /no issue is skipped/);
  assert.doesNotMatch(m.text, /—|;/, 'plain wording');
  assert.equal(rows(env)['pneumoperitoneum-ultrasound'], 'failed');
});

test('Zoho not connected at all: the owner is told, nothing is sent', async () => {
  const env = setup(LIVE.slice(0, 3));
  env.DB.db.prepare("DELETE FROM settings WHERE key = 'zoho_refresh_token'").run();
  const z = zoho();
  await withZoho(z, () => scheduledNewsletter(env, at('2026-11-03T07:30:00Z')));
  assert.deepEqual(z.log, []);
  assert.equal(alerts(env)[0].data.reason, 'reconnect');
});

test('failing two Tuesdays running: the owner is told at the last try of the second Tuesday', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho({ create: 'fail' });
  await withZoho(z, async () => {
    await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'));
    await scheduledNewsletter(env, at('2026-11-03T17:30:00Z'));
    assert.deepEqual(alerts(env), [], 'not after the first Tuesday');
    await scheduledNewsletter(env, at('2026-11-10T07:30:00Z'));
    assert.deepEqual(alerts(env), [], 'not before the last try');
    await scheduledNewsletter(env, at('2026-11-10T17:30:00Z'));
  });
  const a = alerts(env);
  assert.equal(a.length, 1);
  assert.equal(a[0].data.reason, 'stuck');
  assert.equal(a[0].data.since, '2026-11-03');
});

test('outside Tuesday from 7am London time nothing is read or sent; paused means paused', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho();
  await withZoho(z, async () => {
    assert.equal((await scheduledNewsletter(env, at('2026-12-01T06:30:00Z'))).skipped, 'not the send time'); // 06:30 GMT
    assert.equal((await scheduledNewsletter(env, at('2026-11-04T07:30:00Z'))).skipped, 'not the send time'); // Wednesday
    env.DB.db.prepare("INSERT INTO settings (key, value) VALUES ('newsletter_auto', 'off')").run();
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'))).skipped, 'paused');
  });
  assert.deepEqual(z.log, []);
  assert.deepEqual(alerts(env), []);
});

test('summer time: 06:30 UTC is 7:30am BST and sends', async () => {
  const env = setup([]); const z = zoho();
  await withZoho(z, async () => assert.equal((await scheduledNewsletter(env, at('2026-10-13T06:30:00Z'))).slug, 'cardiac-tamponade-ultrasound'));
});

test('an issue not ready yet is passed over, and goes next once a later build makes it ready', async () => {
  const q = SLUGS.map((slug, i) => ({ n: i + 1, slug, key: 'k', subject: slug, campaignName: slug, ready: slug !== 'pneumoperitoneum-ultrasound' }));
  const env = setup(LIVE.slice(0, 3), { queue: q }); const z = zoho();
  await withZoho(z, async () => {
    assert.equal((await scheduledNewsletter(env, at('2026-11-03T07:30:00Z'))).slug, 'colour-doppler-aliasing');
    q[3].ready = true;
    assert.equal((await scheduledNewsletter(env, at('2026-11-10T07:30:00Z'))).slug, 'pneumoperitoneum-ultrasound');
  });
});

test('an empty queue tells the owner; two issues left after a send warns early', async () => {
  const done = SLUGS.map((s, i) => [s, `2026-10-${String(1 + i).padStart(2, '0')} 07:30:00`]);
  const env = setup(done); const z = zoho();
  await withZoho(z, () => scheduledNewsletter(env, at('2026-11-03T07:30:00Z')));
  assert.equal(alerts(env)[0].data.reason, 'empty');
  const env2 = setup(LIVE.slice(0, 3));
  await withZoho(zoho(), () => scheduledNewsletter(env2, at('2026-11-03T07:30:00Z')));
  assert.deepEqual(alerts(env2).map((x) => [x.data.reason, x.data.left]), [['low', 2]]);
});

test('the admin "send now" sends the next issue even in a week that has had one, and never the same one twice', async () => {
  const env = setup(LIVE.slice(0, 3)); const z = zoho();
  await withZoho(z, async () => {
    assert.equal((await sendNext(env, { force: true, now: at('2026-11-04T00:30:00Z') })).slug, 'pneumoperitoneum-ultrasound');
    assert.equal((await nextIssue(env)).issue.slug, 'colour-doppler-aliasing');
  });
});

test('the email page Zoho imports carries the month it is sent in', async () => {
  const env = setup([]);
  const r = await issuePage(env, 'colour-doppler-aliasing', at('2026-12-01T07:30:00Z'));
  assert.match(await r.text(), /Wavelength Pearl · December 2026/);
  assert.equal(await issuePage(env, '../admin', Date.now()), null);
  assert.equal(await issuePage(env, 'no-such-pearl', Date.now()), null);
});

// The renderer, against the real template and queue: every queued pearl renders with its own links only.
test('every queued pearl renders from the template, and the Academy line follows the pearl', () => {
  const tpl = readFileSync(new URL('../src/email/pearl/index.html', import.meta.url), 'utf8');
  const fakeTest = '<div id="q1"><p><span class="quiz-n">Question 1</span>What is it?</p>' + ['a', 'b', 'c', 'd'].map((l) => `<button type="button" class="quiz-opt"${l === 'c' ? ' data-correct' : ''}><span class="quiz-l">${l}</span><span>Option ${l}</span></button>`).join('') + '</div><div id="q2">';
  for (const it of QUEUE) {
    const h = renderIssue(tpl, it, readQuestion(fakeTest), { academy: academyFor(ROOT, it.slug) });
    assert.ok(h.includes(`<h1 class="h1"`) && h.includes(`>${it.subject.replace(/&/g, '&amp;')}</h1>`), it.slug);
    assert.ok(h.includes(`/assets/email/pearl-${it.key}.jpg`), it.slug);
    for (const m of h.matchAll(/utm_campaign=([a-z0-9-]+)/g)) assert.equal(m[1], `pearl-${it.key}`, it.slug);
  }
  assert.deepEqual(academyFor(ROOT, 'pneumoperitoneum-ultrasound'), { slug: 'abdomen', short: 'Acute abdominal pain', lesson: 'Small bowel obstruction' });
});

test('the Worker serves the email page at /api/newsletter/pearl/<slug>/ for Zoho to import', async () => {
  const { default: worker } = await import('../worker/index.js');
  const env = setup([]);
  const ok = await worker.fetch(new Request('https://thewavelength.co.uk/api/newsletter/pearl/colour-doppler-aliasing/'), env, { waitUntil() {} });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /<h1>colour-doppler-aliasing<\/h1>/);
  assert.equal(ok.headers.get('X-Robots-Tag'), 'noindex');
});
