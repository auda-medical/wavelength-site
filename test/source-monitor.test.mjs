// Source monitoring (October 2026): daily checks of official guidance and authorised supervisor directories,
// change classification, the three dates a guide shows, failure handling, duplicate runs, directory sync, name
// autocomplete and listing claims, the admin dashboard and its alerts. Synthetic pages and directories only: no real
// source is fetched (MONITOR_FETCH stands in for the network) and no real person appears.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, client } from './helpers/env.mjs';
import { verifiedAccount, idOf, signup } from './helpers/verify.mjs';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };
import { seedSources, monitorRun, backoff, ALERT_AFTER, DAY_MS, PER_RUN } from '../worker/monitor/run.js';
import { classify, lineDiff } from '../worker/monitor/classify.js';
import { htmlToText, htmlMeta, pdfMeta, parseDate, findVersion } from '../worker/monitor/extract.js';
import { parseFamusHtml, parseFeed, validate, sync, norm } from '../worker/monitor/directory.js';
import { guideStatus, score } from '../worker/monitor/api.js';
import { sourcesAdminHtml, sourcesAdminPost } from '../worker/monitor/admin.js';
import { handleApp } from '../worker/app.js';
import { adminForm } from './helpers/verify.mjs';
import { ukDate } from '../worker/time.js';

const mail = [];
globalThis.fetch = async (u, init) => { mail.push(JSON.parse(init.body)); return new Response('{}'); };
const settle = () => new Promise((r) => setTimeout(r, 30));

// ---------- A stand-in for the internet: url -> page, counting requests ----------
const page = (body, title = 'FUSIC Heart') => `<!doctype html><html><head><title>${title}</title></head><body><header><nav>Home Learning Events Shop Log in</nav></header>
<div class="cookie-banner">We use cookies to improve your experience. Accept all</div>
<main><h1>${title}</h1>${body}</main><footer>© Intensive Care Society. Registered charity no 1039236</footer></body></html>`;
const BASE_BODY = `<p>FUSIC Heart accreditation requires a logbook of 50 supervised scans, reviewed by your mentor.</p>
<p>The triggered assessment is conducted by a FUSIC Heart supervisor once the logbook is complete.</p>
<p>Training should be completed within 12 months of the first logbook scan, and accreditation within 24 months.</p>
<p>Candidates are encouraged to attend a recognised course and to reflect on each study they record.</p>
<p>The training pack sets out the knowledge, skills and attitudes expected of a competent practitioner.</p>
<p>Mentors review scans and give feedback; supervisors also sign the summary training record.</p>`;
function net() {
  const pages = new Map(), count = new Map();
  const f = async (url, init = {}) => {
    count.set(url, (count.get(url) || 0) + 1);
    const p = pages.get(url);
    if (!p) return new Response('not found', { status: 404 });
    if (p.hang) return new Promise((_, rej) => { if (init.signal) init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
    if (p.status && p.status !== 200) return new Response('error', { status: p.status });
    if (p.etag && init.headers && init.headers['If-None-Match'] === p.etag && p.honour304) return new Response(null, { status: 304, headers: { ETag: p.etag } });
    const h = { 'Content-Type': p.type || 'text/html; charset=utf-8' };
    if (p.etag) h.ETag = p.etag;
    if (p.lastModified) h['Last-Modified'] = p.lastModified;
    return new Response(p.body, { status: 200, headers: h });
  };
  return { pages, count, f };
}
const HEART = SOURCES.sources.find((s) => s.name === 'FUSIC Heart');
const auto = SOURCES.sources.filter((s) => s.mode === 'auto');
async function setup(extra = {}) {
  const n = net();
  for (const s of auto) n.pages.set(s.url, { body: page(BASE_BODY.replace('FUSIC Heart', s.name), s.name) });
  const env = makeEnv({ MONITOR_FETCH: n.f, MONITOR_TIMEOUT_MS: '200', ZEPTOMAIL_TOKEN: 'test', ...extra });
  return { env, n };
}
const row = (env, id) => env.DB.prepare('SELECT * FROM monitor_sources WHERE id = ?').bind(id).first();
const makeDue = (env, id) => env.DB.prepare("UPDATE monitor_sources SET next_check_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(id).run();
const checkOne = (env, id, trigger = 'cron') => monitorRun(env, ctx, { trigger, ids: [id], limit: 1, force: true });

test('the build lists every guide source; directories stay off without permission; EACVI is manual', () => {
  assert.ok(SOURCES.sources.length >= 40);
  for (const g of SOURCES.guides) assert.ok(g.sources.length > 0, g.slug), assert.match(g.contentVersion, /^[0-9a-f]{16}$/);
  for (const d of SOURCES.sources.filter((s) => s.kind === 'directory')) assert.equal(d.mode, 'not_authorised', d.id);
  assert.equal(SOURCES.sources.find((s) => s.id === 'g:eacvi-certified').mode, 'manual');
  for (const body of ['RCEM', 'SAM', 'ICS', 'ACEM', 'ACEP', 'CPoCUS', 'EUSEM', 'ESICM', 'ESC', 'RCR']) assert.ok(SOURCES.sources.some((s) => s.body === body), body);
});

test('seeding: one statement, only when the list changed; states follow the mode', async () => {
  const { env } = await setup();
  assert.equal(await seedSources(env), true);
  assert.equal(await seedSources(env), false, 'unchanged list: nothing written');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM monitor_sources').first()).n, SOURCES.sources.length);
  assert.equal((await row(env, 'dir:famus')).status, 'not_authorised');
  assert.equal((await row(env, 'g:eacvi-certified')).status, 'unsupported');
  assert.equal((await row(env, HEART.id)).status, 'never');
});

test('a newly cited guidance document joins the daily checks; a source no longer cited is retired, history kept', async () => {
  const { env } = await setup();
  await seedSources(env);
  // As if the list changed: one source missing (newly cited) and one extra (no longer cited).
  await env.DB.prepare('DELETE FROM monitor_sources WHERE id = ?').bind(HEART.id).run();
  await env.DB.prepare("INSERT INTO monitor_sources (id, kind, name, url, mode, status, last_success_at) VALUES ('g:old', 'guidance', 'Withdrawn page', 'https://example.test/old', 'auto', 'ok', '2026-10-01T04:00:00.000Z')").run();
  await env.DB.prepare("UPDATE settings SET value = 'older' WHERE key = 'monitor_sources_version'").run();
  assert.equal(await seedSources(env), true);
  assert.equal((await row(env, HEART.id)).status, 'never', 'new source: not checked yet, and due');
  const old = await row(env, 'g:old');
  assert.deepEqual([old.mode, old.status, old.last_success_at], ['retired', 'retired', '2026-10-01T04:00:00.000Z']);
  const r = await monitorRun(env, ctx, { trigger: 'cron', limit: 50 });
  assert.ok(r.checked.some((c) => c.id === HEART.id));
  assert.ok(!r.checked.some((c) => c.id === 'g:old'));
});

test('a run checks one due source (CPU allowance), records a baseline, and does not check them again the same day', async () => {
  const { env, n } = await setup();
  const r = await monitorRun(env, ctx, { trigger: 'cron' });
  assert.equal(r.checked.length, PER_RUN);
  assert.equal(PER_RUN, 1);
  for (const c of r.checked) {
    const s = await row(env, c.id);
    assert.equal(s.status, 'ok');
    assert.ok(s.last_success_at && s.content_hash && s.snapshot);
    assert.ok(Date.parse(s.next_check_at) - Date.now() > DAY_MS - 60e3, 'due again a day later');
  }
  const before = [...n.count.values()].reduce((a, b) => a + b, 0);
  const again = await monitorRun(env, ctx, { trigger: 'cron' });
  assert.ok(again.checked.every((c) => !r.checked.some((x) => x.id === c.id)), 'the same sources are not checked twice');
  assert.equal([...n.count.values()].reduce((a, b) => a + b, 0), before + again.checked.length);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM monitor_changes").first()).n, 0, 'a baseline is not a change');
});

test('over a day of runs (three an hour) every automatic source is checked; directories and manual sources never are', async () => {
  const { env, n } = await setup();
  for (let h = 0; h < 72; h++) await monitorRun(env, ctx, { trigger: 'cron' });
  const rows = (await env.DB.prepare('SELECT id, mode, last_success_at FROM monitor_sources').all()).results;
  for (const s of rows) assert.equal(!!s.last_success_at, s.mode === 'auto', s.id);
  for (const s of SOURCES.sources.filter((x) => x.mode !== 'auto')) assert.ok(!n.count.has(s.url), `${s.id} never fetched`);
});

test('no change, header-only changes, cookie banners and menus are not changes; a 304 counts as checked', async () => {
  const { env, n } = await setup();
  await checkOne(env, HEART.id);
  const first = await row(env, HEART.id);
  // New ETag and Last-Modified, different cookie banner and menu, same guidance.
  n.pages.set(HEART.url, { body: page(BASE_BODY).replace('Accept all', 'Accept all cookies to use this site').replace('Home Learning Events', 'Home Learn Events Courses'), etag: '"v2"', lastModified: 'Sat, 11 Oct 2026 01:00:00 GMT' });
  await env.DB.prepare("UPDATE monitor_sources SET last_success_at = '2026-10-01T04:00:00.000Z' WHERE id = ?").bind(HEART.id).run();
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'no_change');
  const second = await row(env, HEART.id);
  assert.equal(second.content_hash, first.content_hash);
  assert.ok(second.last_success_at > '2026-10-02', 'the successful check moves the check date');
  assert.equal(second.last_change_at, null, 'but not the change date');
  assert.equal(second.etag, '"v2"');
  // A server that honours conditional requests: 304 within the week, still a successful check.
  n.pages.get(HEART.url).honour304 = true;
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'no_change');
  assert.equal((await env.DB.prepare("SELECT http_status FROM monitor_runs WHERE source_id = ? ORDER BY id DESC LIMIT 1").bind(HEART.id).first()).http_status, 304);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM monitor_changes').first()).n, 0);
});

test('a minor editorial change is recorded without review; a larger change is meaningful and waits for a person', async () => {
  const { env, n } = await setup();
  await checkOne(env, HEART.id);
  n.pages.set(HEART.url, { body: page(BASE_BODY.replace('encouraged to attend a recognised course', 'encouraged to attend an approved course')) });
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'minor');
  let c = await env.DB.prepare('SELECT * FROM monitor_changes ORDER BY id DESC').first();
  assert.equal(c.review_status, 'none');
  assert.equal((await row(env, HEART.id)).status, 'ok');
  const more = BASE_BODY + '<p>New section on image optimisation for difficult windows and obese patients.</p><p>Probe positions are illustrated in the appendix.</p><p>Common pitfalls are listed for each view.</p><p>Video examples are available to members.</p><p>Each view has a short quiz.</p><p>Further reading is given at the end.</p>';
  n.pages.set(HEART.url, { body: page(more) });
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'meaningful');
  c = await env.DB.prepare('SELECT * FROM monitor_changes ORDER BY id DESC').first();
  assert.equal(c.review_status, 'open');
  assert.equal((await row(env, HEART.id)).status, 'changed');
  assert.ok(JSON.parse(c.guides).includes('fusic-accreditation'));
});

test('an important clinical or accreditation change: flagged, guide shows a pending-review notice, administrators told once', async () => {
  const { env, n } = await setup();
  await checkOne(env, HEART.id);
  n.pages.set(HEART.url, { body: page(BASE_BODY.replace('a logbook of 50 supervised scans', 'a logbook of 40 supervised scans')) });
  mail.length = 0;
  const r = await monitorRun(env, ctx, { trigger: 'cron', ids: [HEART.id], force: true });
  assert.equal(r.checked[0].outcome, 'important');
  const c = await env.DB.prepare('SELECT * FROM monitor_changes ORDER BY id DESC').first();
  assert.equal(c.classification, 'important');
  const ev = JSON.parse(c.evidence);
  assert.ok(ev.requirementLines.some((l) => /40 supervised scans/.test(l)) && ev.requirementLines.some((l) => /50 supervised scans/.test(l)));
  const st = await guideStatus(env, 'fusic-accreditation', null, { refresh: false });
  assert.equal(st.pendingReview.length, 1);
  assert.equal(st.pendingReview[0].url, HEART.url);
  assert.equal(st.pendingReview[0].important, true);
  await settle();
  assert.equal(mail.filter((m) => m.subject === 'Wavelength | Source monitoring: review needed').length, 1);
  assert.match(mail[0].textbody, /FUSIC Heart \(important\)/);
  // The next run has nothing new to report: no second email.
  await monitorRun(env, ctx, { trigger: 'cron', ids: [HEART.id], force: true });
  await settle();
  assert.equal(mail.filter((m) => /Source monitoring/.test(m.subject)).length, 1);
  // The Wavelength guide itself was not touched.
  assert.equal(st.reviewedOn, SOURCES.guides.find((g) => g.slug === 'fusic-accreditation').reviewed);
});

test('a reviewer approves the change: the notice goes, the source is ok again, the decision is recorded', async () => {
  const { env, n } = await setup();
  await checkOne(env, HEART.id);
  n.pages.set(HEART.url, { body: page(BASE_BODY.replace('within 12 months', 'within 18 months')) });
  await checkOne(env, HEART.id);
  const c = await env.DB.prepare("SELECT id FROM monitor_changes WHERE review_status = 'open'").first();
  const html = await sourcesAdminHtml(env, new URL(`https://x/admin/sources/?change=${c.id}`));
  assert.match(html, /within 18 months/);
  assert.match(html, /Possible change to requirements/);
  assert.match((await sourcesAdminPost(env, adminForm({ action: 'review', change: c.id, outcome: 'approved', reviewer: 'Alex Reviewer' }), 'wavelength', ctx)).m, /Say what was decided/);
  assert.equal((await sourcesAdminPost(env, adminForm({ action: 'review', change: c.id, outcome: 'approved', reviewer: 'Alex Reviewer', note: 'Guide updated: training window now 18 months; released 12 Oct.' }), 'wavelength', ctx)).m, 'Recorded as approved.');
  assert.equal((await row(env, HEART.id)).status, 'ok');
  assert.equal((await guideStatus(env, 'fusic-accreditation', null, { refresh: false })).pendingReview.length, 0);
  const rec = await env.DB.prepare('SELECT * FROM monitor_changes WHERE id = ?').bind(c.id).first();
  assert.equal(rec.reviewed_by, 'admin:wavelength:Alex Reviewer');
});

test('a failed check never advances the successful check date, keeps the data, backs off, and alerts after three', async () => {
  const { env, n } = await setup();
  await checkOne(env, HEART.id);
  const good = await row(env, HEART.id);
  n.pages.set(HEART.url, { status: 500 });
  mail.length = 0;
  for (let i = 1; i <= ALERT_AFTER; i++) {
    const r = await monitorRun(env, ctx, { trigger: 'cron', ids: [HEART.id], force: true });
    assert.equal(r.checked[0].outcome, 'unavailable');
    const s = await row(env, HEART.id);
    assert.equal(s.last_success_at, good.last_success_at, 'never advanced by a failure');
    assert.equal(s.content_hash, good.content_hash);
    assert.equal(s.snapshot, good.snapshot);
    assert.equal(s.failures, i);
    assert.ok(Math.abs(Date.parse(s.next_check_at) - Date.now() - backoff(i)) < 5000, `back-off ${i}`);
  }
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map((f) => backoff(f) / 3600e3), [1, 2, 4, 8, 12, 12, 12]);
  await settle();
  assert.equal(mail.filter((m) => /Failing repeatedly/.test(m.textbody)).length, 1);
  assert.equal((await guideStatus(env, 'fusic-accreditation', null, { refresh: false })).sources.failing, 1);
  // Recovery resets the count.
  n.pages.set(HEART.url, { body: page(BASE_BODY) });
  await checkOne(env, HEART.id);
  assert.equal((await row(env, HEART.id)).failures, 0);
});

test('a source that does not answer times out; a page that changed shape is held, reviewed once, baseline kept', async () => {
  const { env, n } = await setup();
  await checkOne(env, HEART.id);
  const good = await row(env, HEART.id);
  n.pages.set(HEART.url, { hang: true });
  const t0 = Date.now();
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'unavailable');
  assert.ok(Date.now() - t0 < 3000);
  assert.match((await env.DB.prepare('SELECT error FROM monitor_runs ORDER BY id DESC').first()).error, /no answer within/);
  // A redesign that left almost nothing of the old text.
  n.pages.set(HEART.url, { body: page('<p>This page has moved. Please see our new learning platform.</p><p>Thank you for your patience while we update our website and content for all members and visitors.</p>') });
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'format_changed');
  assert.equal((await checkOne(env, HEART.id)).checked[0].outcome, 'format_changed');
  const s = await row(env, HEART.id);
  assert.equal(s.content_hash, good.content_hash, 'baseline kept');
  assert.equal(s.last_success_at, good.last_success_at);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM monitor_changes WHERE classification = 'format_changed'").first()).n, 1, 'one review item, not one per retry');
});

test('two runs at once check each source once (lease); an idempotent repeat changes nothing', async () => {
  const { env, n } = await setup();
  await Promise.all([monitorRun(env, ctx, { trigger: 'cron' }), monitorRun(env, ctx, { trigger: 'cron' }), monitorRun(env, ctx, { trigger: 'manual', ids: [auto[0].id], force: true })]);
  for (const [url, c] of n.count) assert.equal(c, 1, url);
  const runs = (await env.DB.prepare('SELECT source_id, COUNT(*) AS n FROM monitor_runs GROUP BY source_id').all()).results;
  assert.ok(runs.every((r) => r.n === 1));
});

test('documents (PDF): baseline, an unchanged file, then a new version is an important change', async () => {
  const { env, n } = await setup();
  const pdf = SOURCES.sources.find((s) => /Appendix 3/.test(s.name));
  const doc = (v, mod) => new TextEncoder().encode(`%PDF-1.7\n1 0 obj\n<< /Title (RCEM PoCUS curriculum ${v}) /ModDate (D:${mod}120000Z) >>\nendobj\nstream ... ${v} ... endstream\n%%EOF`);
  n.pages.set(pdf.url, { body: doc('v1.0', '20210601'), type: 'application/pdf' });
  await checkOne(env, pdf.id);
  let s = await row(env, pdf.id);
  assert.equal(s.doc_version, 'v1.0'); assert.equal(s.published_on, '2021-06-01'); assert.equal(s.snapshot, null, 'no text kept for documents');
  assert.equal((await checkOne(env, pdf.id)).checked[0].outcome, 'no_change');
  n.pages.set(pdf.url, { body: doc('v1.1', '20261101'), type: 'application/pdf' });
  assert.equal((await checkOne(env, pdf.id)).checked[0].outcome, 'important');
  const c = await env.DB.prepare('SELECT * FROM monitor_changes ORDER BY id DESC').first();
  assert.match(c.summary, /version v1\.0 to v1\.1/);
  assert.deepEqual(JSON.parse(c.guides).sort(), ['pocus-accreditation', 'rcem-ultrasound-sign-off', 'ultrasound-logbook']);
});

test('the three dates: never checked, checked today, a failure keeps yesterday, UK dates at midnight', async () => {
  const { env, n } = await setup();
  await seedSources(env);
  let st = await guideStatus(env, 'famus-accreditation', null, { refresh: false });
  assert.equal(st.checkedOn, null, 'before any check: no check date at all');
  assert.equal(st.reviewedOn, '2026-10-04');
  assert.equal(st.updatedOn, '2026-10-05');
  const ids = SOURCES.guides.find((g) => g.slug === 'famus-accreditation').sources;
  await monitorRun(env, ctx, { trigger: 'cron', ids, limit: ids.length, force: true });
  st = await guideStatus(env, 'famus-accreditation', null, { refresh: false });
  assert.equal(st.checkedOn, ukDate());
  assert.equal(st.checkedToday, true);
  assert.equal(st.noChangeLatest, true);
  assert.equal(st.reviewedOn, '2026-10-04', 'a check is never a review');
  assert.equal(st.updatedOn, '2026-10-05', 'nor a content update');
  // Yesterday's success, today's failure: the guide says yesterday.
  await env.DB.prepare("UPDATE monitor_sources SET last_success_at = '2026-10-09T05:07:00.000Z' WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).run();
  n.pages.set(SOURCES.sources.find((s) => s.id === ids[0]).url, { status: 503 });
  await checkOne(env, ids[0]);
  st = await guideStatus(env, 'famus-accreditation', null, { refresh: false });
  assert.equal(st.checkedOn, '2026-10-09');
  assert.equal(st.checkedToday, false);
  // 23:30 UTC on 30 June is 1 July in the UK (BST); 23:30 UTC on 31 December is still 31 December (GMT).
  await env.DB.prepare("UPDATE monitor_sources SET last_success_at = '2026-06-30T23:30:00.000Z' WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).run();
  assert.equal((await guideStatus(env, 'famus-accreditation', null, { refresh: false })).checkedOn, '2026-07-01');
  await env.DB.prepare("UPDATE monitor_sources SET last_success_at = '2026-12-31T23:30:00.000Z' WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).run();
  assert.equal((await guideStatus(env, 'famus-accreditation', null, { refresh: false })).checkedOn, '2026-12-31');
});

test('opening a guide before the day\'s check: answered at once with the last real date, and a background check starts', async () => {
  const { env, n } = await setup();
  await seedSources(env);
  const waits = [];
  const c = { waitUntil: (p) => waits.push(p) };
  const app = client(handleApp, env);
  const res = await app.call('/api/app/sources/guide/rcem-ultrasound-sign-off');
  assert.equal(res.status, 200);
  assert.equal(res.body.guide.checkedOn, null, 'not checked yet: no date claimed');
  const st = await guideStatus(env, 'rcem-ultrasound-sign-off', c);
  assert.equal(st.checkedOn, null, 'the answer does not wait for the source');
  assert.equal(waits.length, 1);
  await Promise.all(waits);
  assert.equal([...n.count.keys()].length, 1, 'one stale source refreshed in the background per view');
  // Opening it again within the hour does not hammer the sources.
  const w2 = []; await guideStatus(env, 'rcem-ultrasound-sign-off', { waitUntil: (p) => w2.push(p) });
  await Promise.all(w2);
  const ids = SOURCES.guides.find((g) => g.slug === 'rcem-ultrasound-sign-off').sources;
  assert.ok([...n.count.values()].every((x) => x === 1));
  assert.ok(ids.length > 2);
  // The public endpoints answer without a login, cacheable for five minutes; unknown guides 404.
  assert.equal((await app.call('/api/app/sources/guide/no-such-guide')).status, 404);
  const all = await app.call('/api/app/sources/guides');
  assert.equal(all.status, 200);
  assert.equal(all.body.guides.length, SOURCES.guides.filter((g) => !g.draft).length);
});

// ---------- Directories (synthetic, and only once authorised) ----------
const person = (name, organisation, modules, role = 'supervisor', id) => ({ ...(id ? { id } : {}), name, organisation, roles: modules.map((m) => ({ role, module: m })), accredited_on: '2025-03-01' });
async function directory(env, n, entries, adapter = 'fixture') {
  await seedSources(env);
  // Written permission recorded: the source becomes automatic (as a change to data/monitor-sources.json would).
  await env.DB.prepare("UPDATE monitor_sources SET mode = 'auto', adapter = ?, status = 'never' WHERE id = 'dir:fusic'").bind(adapter).run();
  n.pages.set(SOURCES.sources.find((s) => s.id === 'dir:fusic').url, { body: typeof entries === 'string' ? entries : JSON.stringify({ entries }), type: 'application/json' });
}
const snapshot = async (env) => JSON.parse((await env.DB.prepare("SELECT entries FROM directory_snapshots WHERE source_id = 'dir:fusic' AND current = 1").first()).entries);
const events = async (env) => (await env.DB.prepare("SELECT kind, entry_key, review_status FROM directory_events WHERE source_id = 'dir:fusic' ORDER BY id").all()).results;
const syncNow = (env) => checkOne(env, 'dir:fusic');
const BASE_DIR = [person('Alex Example', 'Northtown General Hospital', ['fusic-heart']), person('Sam Patel', 'Westfield Royal Infirmary', ['fusic-heart'], 'mentor'), person('Sam Patel', 'Eastbridge University Hospital', ['fusic-lung'], 'trainer'), person('Jo Rivers', 'Northtown General Hospital', ['fusic-dvt', 'fusic-lung'], 'trainer')];

test('directories are never read without permission and the switch', async () => {
  const { env, n } = await setup();
  await seedSources(env);
  await checkOne(env, 'dir:fusic');
  assert.ok(!n.count.has(SOURCES.sources.find((s) => s.id === 'dir:fusic').url));
  await directory(env, n, BASE_DIR);
  await syncNow(env); // DIRECTORY_SYNC not set
  assert.ok(!n.count.has(SOURCES.sources.find((s) => s.id === 'dir:fusic').url), 'still not read: the Worker switch is off');
});

test('directory sync: baseline, new, removed, moved hospital, modules, role, corrected name, same names apart', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  await directory(env, n, BASE_DIR);
  assert.equal((await syncNow(env)).checked[0].outcome, 'directory');
  let snap = await snapshot(env);
  assert.equal(snap.length, 4);
  assert.equal(new Set(snap.map((e) => e.key)).size, 4, 'two Sam Patels at different hospitals are two people');
  const keyOf = (name, orgPart) => snap.find((e) => e.name === name && e.organisation.includes(orgPart)).key;
  const alex = keyOf('Alex Example', 'Northtown'), jo = keyOf('Jo Rivers', 'Northtown'), samW = keyOf('Sam Patel', 'Westfield');
  // Next day: Alex moves hospital, Jo loses DVT and gains Vascular, Sam (Westfield) becomes a supervisor, a new
  // trainer appears, and a spelling is corrected.
  const next = [person('Alex Example', 'Southport District Hospital', ['fusic-heart']), person('Sam Patel', 'Westfield Royal Infirmary', ['fusic-heart'], 'supervisor'), person('Sam Patel', 'Eastbridge University Hospital', ['fusic-lung'], 'trainer'), person('Joe Rivers', 'Northtown General Hospital', ['fusic-lung', 'fusic-vasc'], 'trainer'), person('Kim Newton', 'Harbour City Hospital', ['fusic-abdo'], 'trainer')];
  await directory(env, n, next);
  await syncNow(env);
  snap = await snapshot(env);
  assert.equal(snap.length, 5);
  const ev = await events(env);
  const kinds = (key) => ev.filter((e) => e.entry_key === key).map((e) => e.kind).sort();
  assert.deepEqual(kinds(alex), ['added', 'organisation_changed'], 'moved, not a new person');
  assert.deepEqual(kinds(jo), ['added', 'modules_added', 'modules_removed', 'name_corrected']);
  assert.deepEqual(kinds(samW), ['added', 'role_changed']);
  assert.ok(ev.some((e) => e.kind === 'added' && e.entry_key.includes('kim newton')));
  assert.ok(ev.filter((e) => ['modules_removed', 'role_changed', 'name_corrected'].includes(e.kind) && e.entry_key !== '').every((e) => e.review_status === 'open'));
  const ch = await env.DB.prepare("SELECT * FROM monitor_changes WHERE classification = 'directory'").first();
  assert.match(ch.summary, /1 added/);
  // Removal: Kim leaves the directory. Kept, marked removed, flagged; never deleted.
  await directory(env, n, next.slice(0, 4));
  await syncNow(env);
  snap = await snapshot(env);
  const kim = snap.find((e) => e.name === 'Kim Newton');
  assert.equal(kim.status, 'removed');
  assert.equal(kim.removed_on, ukDate());
  // And back again: relisted under the same key.
  await directory(env, n, next);
  await syncNow(env);
  assert.equal((await snapshot(env)).find((e) => e.key === kim.key).status, 'listed');
  assert.ok((await events(env)).some((e) => e.kind === 'relisted' && e.entry_key === kim.key));
});

test('directory sync never empties or half-applies: empty, partial, broken and unchanged sources', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  const many = Array.from({ length: 30 }, (_, i) => person(`Person ${String.fromCharCode(65 + (i % 26))}${i} Example`, `Hospital ${i}`, ['fusic-heart']));
  await directory(env, n, many);
  await syncNow(env);
  const good = await env.DB.prepare("SELECT id, content_hash FROM directory_snapshots WHERE source_id = 'dir:fusic' AND current = 1").first();
  for (const [body, outcome] of [[[], 'unavailable'], [many.slice(0, 15), 'format_changed'], ['<html>maintenance</html>', 'format_changed'], [many.map((e) => ({ ...e, roles: [] })), 'format_changed']]) {
    await directory(env, n, body);
    assert.equal((await syncNow(env)).checked[0].outcome, outcome);
    const cur = await env.DB.prepare("SELECT id FROM directory_snapshots WHERE source_id = 'dir:fusic' AND current = 1").first();
    assert.equal(cur.id, good.id, 'the previous directory stays current');
  }
  assert.equal((await snapshot(env)).filter((e) => e.status === 'listed').length, 30);
  // The same list again: no new snapshot, no events, but a successful check.
  await directory(env, n, many);
  const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM directory_snapshots').first()).n;
  assert.equal((await syncNow(env)).checked[0].outcome, 'no_change');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM directory_snapshots').first()).n, before);
  // A failing batch leaves everything as it was.
  await directory(env, n, [...many, person('New Person', 'Hospital X', ['fusic-heart'])]);
  const real = env.DB.batch.bind(env.DB); env.DB.batch = async () => { throw new Error('D1_ERROR'); };
  await syncNow(env).catch(() => null);
  env.DB.batch = real;
  assert.equal((await env.DB.prepare("SELECT id FROM directory_snapshots WHERE source_id = 'dir:fusic' AND current = 1").first()).id, good.id);
});

test('a large fall is held until an administrator checks the source and accepts it, with a recorded reason', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  const many = Array.from({ length: 30 }, (_, i) => person(`Person ${String.fromCharCode(65 + (i % 26))}${i} Example`, `Hospital ${i}`, ['fusic-heart']));
  await directory(env, n, many);
  await syncNow(env);
  await directory(env, n, many.slice(0, 15));
  assert.equal((await syncNow(env)).checked[0].outcome, 'format_changed');
  const html = await sourcesAdminHtml(env, new URL('https://x/admin/sources/?tab=directories'));
  assert.match(html, /The source lists 15 people against 30/);
  assert.match(html, /Accept the fall and sync/);
  assert.match((await sourcesAdminPost(env, adminForm({ action: 'accept_drop', id: 'dir:fusic', reviewer: 'Alex Reviewer' }), 'wavelength', ctx)).m, /how you checked the source/);
  assert.match((await sourcesAdminPost(env, adminForm({ action: 'accept_drop', id: 'g:esicm-edec', reviewer: 'Alex Reviewer', note: 'x'.repeat(5) }), 'wavelength', ctx)).m, /Not a directory/);
  assert.equal((await snapshot(env)).filter((e) => e.status === 'listed').length, 30, 'nothing changed before the decision');
  const r = await sourcesAdminPost(env, adminForm({ action: 'accept_drop', id: 'dir:fusic', reviewer: 'Alex Reviewer', note: 'Checked the ICS directory page: the Southern region moved to its own list.' }), 'wavelength', ctx);
  assert.equal(r.m, 'Synced: directory.');
  const snap = await snapshot(env);
  assert.equal(snap.filter((e) => e.status === 'listed').length, 15);
  assert.equal(snap.filter((e) => e.status === 'removed').length, 15, 'kept, marked removed, never deleted');
  const held = await env.DB.prepare("SELECT * FROM monitor_changes WHERE source_id = 'dir:fusic' AND classification = 'format_changed'").first();
  assert.equal(held.review_status, 'approved');
  assert.match(held.reviewed_by, /Alex Reviewer/);
  assert.match(held.review_note, /^Fall accepted: Checked the ICS directory/);
  assert.equal((await row(env, 'dir:fusic')).status, 'ok');
  // Accepting a fall never lets an empty or unreadable list through.
  assert.equal(validate([], many.map((e) => ({ ...e, status: 'listed' })), { acceptDrop: true }).reason, 'empty');
  assert.doesNotMatch(await sourcesAdminHtml(env, new URL('https://x/admin/sources/?tab=directories')), /Accept the fall/);
});

test('people removed from a directory are kept twelve months, then dropped; directory events thirteen months', async () => {
  const a = person('Alex Example', 'Northtown General Hospital', ['fusic-heart']), b = person('Jo Rivers', 'Southport District', ['fusic-lung']);
  let snap = sync([], [a, b], '2026-01-10').entries;
  snap = sync(snap, [a], '2026-02-01').entries;
  assert.equal(snap.find((e) => e.name === 'Jo Rivers').status, 'removed');
  assert.ok(sync(snap, [a, person('Kim Newton', 'Harbour City Hospital', ['fusic-abdo'])], '2027-01-31').entries.some((e) => e.name === 'Jo Rivers'), 'within twelve months: kept');
  assert.ok(!sync(snap, [a, person('Kim Newton', 'Harbour City Hospital', ['fusic-abdo'])], '2027-02-02').entries.some((e) => e.name === 'Jo Rivers'), 'after twelve months: dropped');
  const { env } = await setup();
  await seedSources(env);
  await env.DB.prepare("INSERT INTO directory_events (source_id, entry_key, at, kind) VALUES ('dir:fusic', 'old', ?, 'added'), ('dir:fusic', 'new', ?, 'added')").bind(new Date(Date.now() - 400 * 864e5).toISOString(), new Date().toISOString()).run();
  await env.DB.prepare("DELETE FROM settings WHERE key = 'monitor_retention_day'").run();
  await monitorRun(env, ctx, { trigger: 'cron' });
  assert.deepEqual((await env.DB.prepare('SELECT entry_key FROM directory_events').all()).results.map((r) => r.entry_key), ['new']);
});

test('an objection removes the person at once (both stored copies, history, search) and keeps them out of later syncs', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  await directory(env, n, BASE_DIR);
  await syncNow(env);
  await directory(env, n, [...BASE_DIR, person('Kim Newton', 'Harbour City Hospital', ['fusic-abdo'])]);
  await syncNow(env);
  const l = await verifiedAccount(env, 'searcher@example.test');
  const search = async (q) => (await (await handleApp(new Request(`https://thewavelength.co.uk/api/app/listings/search?q=${encodeURIComponent(q)}`, { headers: { Cookie: l.cookie } }), env, ctx)).json()).results.map((r) => `${r.name} | ${r.organisation}`);
  assert.equal((await search('Sam Patel')).length, 2);
  assert.match((await sourcesAdminPost(env, adminForm({ action: 'optout', source: 'dir:fusic', name: 'Sam Patel', reviewer: 'Alex Reviewer' }), 'wavelength', ctx)).m, /how the request arrived/);
  const r = await sourcesAdminPost(env, adminForm({ action: 'optout', source: 'dir:fusic', name: 'Dr Sam PATEL', organisation: 'Westfield Royal Infirmary NHS Trust', reviewer: 'Alex Reviewer', note: 'Email to hello@ on 11 Oct' }), 'wavelength', ctx);
  assert.match(r.m, /Objection recorded\. 1 matching entry removed/);
  assert.deepEqual(await search('Sam Patel'), ['Sam Patel | Eastbridge University Hospital'], 'the other Sam Patel stays');
  for (const s of (await env.DB.prepare("SELECT entries FROM directory_snapshots WHERE source_id = 'dir:fusic'").all()).results) assert.ok(!/Westfield/.test(s.entries), 'gone from the current and the previous copy');
  assert.ok(!(await env.DB.prepare("SELECT entry_key FROM directory_events").all()).results.some((e) => /westfield/.test(e.entry_key)), 'and from the change history');
  // The next sync still lists them at the source: they are not taken in again, and no removal is reported.
  await directory(env, n, [...BASE_DIR, person('Kim Newton', 'Harbour City Hospital', ['fusic-abdo']), person('Lee Ford', 'Harbour City Hospital', ['fusic-abdo'])]);
  await syncNow(env);
  assert.ok(!(await snapshot(env)).some((e) => /Westfield/.test(e.organisation)));
  assert.ok(!(await events(env)).some((e) => /westfield/.test(e.entry_key)));
  const html = await sourcesAdminHtml(env, new URL('https://x/admin/sources/?tab=directories'));
  assert.match(html, /Email to hello@ on 11 Oct/);
  assert.match(html, /Withdraw objection/);
  // An objection for every directory, organisation left empty, covers a move.
  await sourcesAdminPost(env, adminForm({ action: 'optout', source: '*', name: 'Kim Newton', reviewer: 'Alex Reviewer', note: 'Letter' }), 'wavelength', ctx);
  assert.deepEqual(await search('Kim Newton'), []);
  const row = await env.DB.prepare("SELECT id FROM directory_optouts WHERE name_norm = 'kim newton'").first();
  assert.match((await sourcesAdminPost(env, adminForm({ action: 'optout_remove', id: row.id, reviewer: 'Alex Reviewer', note: 'Asked to be listed again' }), 'wavelength', ctx)).m, /Objection withdrawn/);
  const audit = (await env.DB.prepare("SELECT action, meta FROM audit_events WHERE action LIKE 'directory.%'").all()).results;
  assert.deepEqual(audit.map((a) => a.action), ['directory.optout', 'directory.optout', 'directory.optout_withdrawn']);
  assert.ok(!audit.some((a) => /patel|newton/i.test(a.meta || '')), 'the audit trail names nobody');
});

test('the FAMUS table adapter reads by headings, ignores contact details, and reports a format change', () => {
  const html = `<table><tr><th>Name</th><th>Position</th><th>Trust/Hospital</th><th>Thoracic</th><th>Abdo/Renal</th><th>DVT</th><th>US Assisted LP</th><th>Date Accredited</th><th>Contact</th></tr>
  <tr><td>Dr Alex Example</td><td>Consultant</td><td>Northtown General Hospital</td><td>✓</td><td></td><td>✓</td><td></td><td>01/03/2025</td><td>alex@example.test</td></tr>
  <tr><td>Dr Jo Rivers</td><td>Registrar</td><td>Southport District</td><td></td><td>✓</td><td></td><td>✓</td><td>15/11/2024</td><td>jo@example.test</td></tr></table>`;
  const r = parseFamusHtml(html);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entries.map((e) => [e.name, e.organisation, e.roles.map((x) => x.module), e.accredited_on]), [['Dr Alex Example', 'Northtown General Hospital', ['famus-dvt', 'famus-thoracic'], '2025-03-01'], ['Dr Jo Rivers', 'Southport District', ['famus-abdo', 'famus-lp'], '2024-11-15']]);
  assert.ok(!JSON.stringify(r).includes('@'), 'no contact details read');
  assert.equal(parseFamusHtml('<table><tr><th>Surname</th><th>Region</th></tr></table>').ok, false);
  assert.equal(parseFeed('{"oops":1}').ok, false);
  assert.equal(validate([], [{ status: 'listed' }]).reason, 'empty');
});

test('a listed person whose verification relies on the listing is flagged for review when it changes, never revoked', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  await directory(env, n, BASE_DIR);
  await syncNow(env);
  const sup = await verifiedAccount(env, 'alex.example@example.test', { firstName: 'Alex', lastName: 'Example' });
  const found = await sup.call('/api/app/listings/search?q=alex exa');
  const ref = found.body.results[0].ref;
  assert.equal((await sup.call('/api/app/listings/claim', { ref })).body.claim.status, 'claimed');
  await env.DB.prepare("UPDATE directory_links SET status = 'confirmed'").run(); // an administrator confirmed identity
  await directory(env, n, BASE_DIR.filter((e) => e.name !== 'Alex Example'));
  await syncNow(env);
  const link = await env.DB.prepare('SELECT status, flag FROM directory_links').first();
  assert.deepEqual([link.status, link.flag], ['confirmed', 'listing_removed'], 'flagged, still confirmed: a person decides');
  assert.equal((await sup.call('/api/app/listings/claims')).body.claims[0].changed, 'listing_removed');
});

test('name autocomplete: three letters, any order, a slip of a letter, hospital tells same names apart, nothing private', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  await directory(env, n, BASE_DIR);
  await syncNow(env);
  const u = await verifiedAccount(env, 'learner.search@example.test');
  const q = async (s, extra = '') => (await u.call(`/api/app/listings/search?q=${encodeURIComponent(s)}${extra}`)).body;
  assert.deepEqual((await q('al')).results, [], 'fewer than three letters: nothing');
  assert.equal((await q('ALE')).results[0].name, 'Alex Example', 'case does not matter');
  assert.equal((await q('example alex')).results[0].name, 'Alex Example', 'any order');
  assert.equal((await q('Aelx')).results.length, 0, 'not a letter salad');
  assert.equal((await q('Alix Example')).results[0].name, 'Alex Example', 'a one-letter slip');
  const sams = (await q('sam patel')).results;
  assert.equal(sams.length, 2);
  assert.deepEqual(sams.map((r) => r.organisation).sort(), ['Eastbridge University Hospital', 'Westfield Royal Infirmary']);
  assert.equal((await q('sam patel', '&module=fusic-lung')).results.length, 1, 'filtered by module');
  assert.deepEqual(Object.keys(sams[0]).sort(), ['body', 'name', 'onWavelength', 'organisation', 'ref', 'roles', 'source']);
  assert.equal(sams[0].onWavelength, false);
  assert.match((await q('sam')).note, /not Wavelength approval/);
  assert.equal((await client(handleApp, env).call('/api/app/listings/search?q=sam')).status, 401, 'login needed');
  // Off without the switch: the manual route stays.
  const off = makeEnv({ MONITOR_FETCH: n.f });
  const u2 = await verifiedAccount(off, 'l2@example.test');
  const r = (await u2.call('/api/app/listings/search?q=sam')).body;
  assert.equal(r.available, false);
  assert.match(r.note, /Enter your supervisor by hand/);
  assert.ok(score({ n: norm('Jo Rivers'), o: 'northtown', tokens: ['jo', 'rivers'] }, 'northtown') > 0, 'organisation words help');
});

test('claims: email must be confirmed, a listing confirmed for someone else cannot be claimed, a claim grants nothing', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  await directory(env, n, BASE_DIR);
  await syncNow(env);
  const unverified = await signup(env, 'new.person@example.test');
  const ref = (await (await verifiedAccount(env, 'look@example.test')).call('/api/app/listings/search?q=jo rivers')).body.results[0].ref;
  assert.equal((await unverified.call('/api/app/listings/claim', { ref })).status, 403);
  const a = await verifiedAccount(env, 'jo.rivers@example.test', { firstName: 'Jo', lastName: 'Rivers' });
  assert.equal((await a.call('/api/app/listings/claim', { ref })).status, 200);
  assert.equal((await a.call('/api/app/listings/claim', { ref })).status, 200, 'repeat: same claim');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM directory_links').first()).n, 1);
  await env.DB.prepare("UPDATE directory_links SET status = 'confirmed'").run();
  const b = await verifiedAccount(env, 'impostor@example.test', { firstName: 'Jo', lastName: 'Rivers' });
  assert.equal((await b.call('/api/app/listings/claim', { ref })).status, 409);
  const id = await idOf(env, 'jo.rivers@example.test');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?").bind(id).first()).n, 0, 'listing and claim grant no approval');
  assert.equal((await a.call('/api/app/supervisor')).body.verification.verified, false);
});

test('admin dashboard: tabs, directory state, manual retry, escaping; restricted to the admin console', async () => {
  const { env, n } = await setup();
  await monitorRun(env, ctx, { trigger: 'cron' });
  n.pages.set(HEART.url, { body: page(BASE_BODY.replace('a logbook of 50', '<script>alert(1)</script> a logbook of 45')) });
  await checkOne(env, HEART.id);
  for (const tab of ['review', 'sources', 'directories', 'runs']) {
    const html = await sourcesAdminHtml(env, new URL(`https://x/admin/sources/?tab=${tab}`));
    assert.ok(!/<script>alert/.test(html), tab);
  }
  assert.match(await sourcesAdminHtml(env, new URL('https://x/admin/sources/?tab=directories')), /Not read automatically: the body has not given written permission/);
  const r = await sourcesAdminPost(env, adminForm({ action: 'retry', id: auto[5].id, reviewer: 'Alex' }), 'wavelength', ctx);
  assert.match(r.m, /^Checked: /);
  assert.match((await sourcesAdminPost(env, adminForm({ action: 'retry', id: 'dir:famus', reviewer: 'Alex' }), 'wavelength', ctx)).m, /not checked automatically/);
});

test('extraction and classification details', () => {
  assert.equal(parseDate('Last updated: 3rd March 2026'), '2026-03-03');
  assert.equal(parseDate('August 2025'), '2025-08-01');
  assert.equal(parseDate('12/03/2026'), '2026-03-12');
  assert.equal(findVersion('RCEM-Emergency-Medicine-Training-Curriculum-2025-Update-v1.5-Final.pdf'), 'v1.5');
  assert.equal(findVersion('FUSIC Heart training pack version 13'), 'v13');
  const t = htmlToText(page('<p>Patients must give consent before an ultrasound-guided LP; record it in the notes.</p><p>A second paragraph long enough to keep the main element as the content of this page for the extractor to use.</p>'));
  assert.match(t, /consent before an ultrasound-guided LP/, 'clinical lines mentioning consent are never dropped as furniture');
  assert.ok(!/cookies/i.test(t) && !/Registered charity/.test(t) && !/Log in/.test(t));
  assert.equal(htmlMeta('<meta property="article:modified_time" content="2026-09-14T10:00:00Z"><title>x</title>', '').publishedOn, '2026-09-14');
  assert.equal(pdfMeta(new TextEncoder().encode('%PDF-1.4 /Title (Pack v2.0) /CreationDate (D:20240102)'), 'https://x/a.pdf').version, 'v2.0');
  assert.equal(classify(null, { hash: 'a' }).classification, 'baseline');
  assert.equal(classify({ hash: 'a', text: 'x' }, { hash: 'a', text: 'x' }).classification, 'no_change');
  assert.equal(lineDiff('a\nb', 'a\nb\nc').addedCount, 1);
  const vol = classify({ hash: 'a', text: 'Line one of guidance text\nPage last generated 10 Oct' }, { hash: 'b', text: 'Line one of guidance text\nPage last generated 11 Oct' });
  assert.equal(vol.classification, 'no_change', 'a generated-on line is not a change');
  assert.equal(sync([], [{ name: 'A B', organisation: 'X', roles: [{ role: 'supervisor', module: 'm' }] }], '2026-10-10').events[0].kind, 'added');
});

test('an administrator confirms a listing claim: identity method recorded, listed credential verified for exactly the listed modules, no approval', async () => {
  const { env, n } = await setup({ DIRECTORY_SYNC: 'true' });
  await directory(env, n, BASE_DIR);
  await syncNow(env);
  const { supervisorsAdminPost, supervisorsAdminHtml } = await import('../worker/supervisors-admin.js');
  const adm = (o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Alex Reviewer', ...o }), 'wavelength', ctx);
  const jo = await verifiedAccount(env, 'jo.claim@example.test', { firstName: 'Jo', lastName: 'Rivers' });
  const ref = (await jo.call('/api/app/listings/search?q=jo rivers')).body.results[0].ref;
  await jo.call('/api/app/listings/claim', { ref });
  const id = await idOf(env, 'jo.claim@example.test');
  const link = await env.DB.prepare('SELECT id FROM directory_links').first();
  const pageHtml = await supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/?id=${id}`), 'wavelength');
  assert.match(pageHtml, /Official directory listings claimed/);
  assert.match(pageHtml, /A matching name is never enough on its own/);
  assert.match((await adm({ action: 'listing_confirm', learner: id, link: link.id })).m, /Choose how you confirmed/);
  assert.match((await adm({ action: 'listing_confirm', learner: id, link: link.id, method: 'other', notes: 'x' })).m, /Say how you confirmed/);
  const ok = await adm({ action: 'listing_confirm', learner: id, link: link.id, method: 'employer_confirmation', notes: 'Clinical director confirmed by phone' });
  assert.match(ok.m, /^Identity confirmed\. FUSIC trainer: dvt, lung verified from the directory\./, ok.m);
  const cred = await env.DB.prepare('SELECT * FROM credentials WHERE learner_id = ?').bind(id).first();
  assert.deepEqual([cred.credential_type, JSON.parse(cred.modules).sort(), cred.status, cred.verification_method, cred.verification_source], ['fusic-trainer', ['dvt', 'lung'], 'verified', 'directory_listing', 'dir:fusic']);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM supervisor_approvals WHERE learner_id = ?').bind(id).first()).n, 0, 'no approval to supervise');
  assert.match((await adm({ action: 'listing_confirm', learner: id, link: link.id, method: 'employer_confirmation' })).m, /already decided/);
  // The listing then loses DVT: flagged on the person page and under Needs attention, never revoked.
  await directory(env, n, BASE_DIR.map((e) => (e.name === 'Jo Rivers' ? person('Jo Rivers', 'Northtown General Hospital', ['fusic-lung'], 'trainer') : e)));
  await syncNow(env);
  assert.equal((await env.DB.prepare('SELECT flag, status FROM directory_links').first()).flag, 'modules_changed');
  assert.match(await supervisorsAdminHtml(env, new URL('https://x/admin/supervisors/?tab=attention'), 'wavelength'), /changed its modules or role/);
  assert.equal((await env.DB.prepare('SELECT status FROM credentials WHERE learner_id = ?').bind(id).first()).status, 'verified', 'nothing revoked automatically');
  assert.match((await adm({ action: 'listing_flag_clear', learner: id, link: link.id, notes: 'DVT approval revoked; lung kept' })).m, /marked reviewed/);
  // A different claim rejected with a reason.
  const sam = await verifiedAccount(env, 'sam.claim@example.test', { firstName: 'Sam', lastName: 'Patel' });
  const sref = (await sam.call('/api/app/listings/search?q=sam patel')).body.results[0].ref;
  await sam.call('/api/app/listings/claim', { ref: sref });
  const sid = await idOf(env, 'sam.claim@example.test');
  const sl = await env.DB.prepare('SELECT id FROM directory_links WHERE learner_id = ?').bind(sid).first();
  assert.equal((await adm({ action: 'listing_reject', learner: sid, link: sl.id, notes: 'Different person at that hospital' })).m, 'Claim rejected.');
});
