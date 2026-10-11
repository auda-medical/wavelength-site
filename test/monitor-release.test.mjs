// Source monitoring, release checks (11 October 2026): the corrected RCEM and FUSIC HD citations, redirects and moved
// sources, linked documents, per-source dates, many people opening a guide at once, the source allowlist, the manual
// fallback while directories stay off, and who may open the monitoring dashboard. Synthetic sources and people only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount } from './helpers/verify.mjs';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };
import { monitorRun, seedSources } from '../worker/monitor/run.js';
import { guideStatus, resetOnDemand } from '../worker/monitor/api.js';
import { htmlToText } from '../worker/monitor/extract.js';
import { classify } from '../worker/monitor/classify.js';
import { roleForPath } from '../worker/access.js';
import { handleApp } from '../worker/app.js';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/app-util.js';

globalThis.fetch = async () => new Response('{}');
const settle = () => new Promise((r) => setTimeout(r, 30));
const md = (f) => readFileSync(new URL(`../content/guides/${f}`, import.meta.url), 'utf8');
const FAQ = 'https://rcem.ac.uk/ultrasound-education-training-2021-curriculum/';
const CURRICULUM = 'https://rcem.ac.uk/em-curriculum/';
const auto = SOURCES.sources.filter((s) => s.mode === 'auto');
const body = (t, extra = '') => `<html><head><title>${t}</title></head><body><main><h1>${t}</h1><p>${'Accreditation requires supervised scans reviewed by a mentor. '.repeat(5)}</p>${extra}</main></body></html>`;

test('the dead RCEM address is gone everywhere; each guide cites the right RCEM page; review dates untouched', () => {
  assert.ok(!SOURCES.sources.some((s) => s.url === 'https://rcem.ac.uk/ultrasound/'));
  for (const f of ['rcem-ultrasound-sign-off.md', 'ultrasound-logbook.md', 'pocus-accreditation.md', 'at-a-glance/rcem-ultrasound-sign-off.md']) {
    assert.doesNotMatch(md(f), /rcem\.ac\.uk\/ultrasound\//, f);
    assert.ok(md(f).includes(FAQ), `${f} cites the ultrasound education and training FAQ`);
  }
  // The curriculum page (2025 update, effective 6 August 2025) is tracked separately, on the RCEM guide only.
  assert.ok(md('rcem-ultrasound-sign-off.md').includes(CURRICULUM));
  const faq = SOURCES.sources.find((s) => s.url === FAQ), cur = SOURCES.sources.find((s) => s.url === CURRICULUM);
  assert.deepEqual(faq.guides.sort(), ['pocus-accreditation', 'rcem-ultrasound-sign-off', 'ultrasound-logbook']);
  assert.deepEqual(cur.guides, ['rcem-ultrasound-sign-off']);
  assert.equal(faq.mode, 'auto');
  assert.notEqual(faq.id, cur.id);
  // A citation fix is an update, never a clinical review.
  const g = (slug) => SOURCES.guides.find((x) => x.slug === slug);
  assert.equal(g('rcem-ultrasound-sign-off').reviewed, '2026-10-04');
  assert.equal(g('rcem-ultrasound-sign-off').updated, '2026-10-11');
  assert.equal(g('ultrasound-logbook').reviewed, '2026-10-04');
  assert.equal(g('pocus-accreditation').reviewed, null, 'the hub still has no review date');
  // The past FUSIC HD assessment day was replaced by the current one; the guide's HD requirements are unchanged.
  assert.doesNotMatch(md('fusic-accreditation.md'), /summative-assessment-november-2025/);
  assert.match(md('fusic-accreditation.md'), /fusic-hd-summative-assessment-november-2026\.html/);
  assert.match(md('fusic-accreditation.md'), /\| Haemodynamics \(HD\) \| 50 \| 20 \|/);
  // Tracked documents (the 2026 HD curriculum, FAMUS packs, RCEM scales) are monitored but never shown as citations.
  const hd = SOURCES.sources.find((s) => s.id === 'g:fusic-hd-updates');
  assert.deepEqual(hd.guides, ['fusic-accreditation']);
  assert.ok(!SOURCES.guides.find((x) => x.slug === 'fusic-accreditation').sources.includes(hd.id));
  // The ESC page is recorded at its permanent new address, still checked by hand.
  const esc = SOURCES.sources.find((s) => s.id === 'g:eacvi-certified');
  assert.match(esc.url, /certification-programmes\/cv-imaging/);
  assert.equal(esc.mode, 'manual');
});

function harness(routes) {
  const count = new Map();
  const f = async (url) => {
    count.set(url, (count.get(url) || 0) + 1);
    const r = routes(url);
    if (!r) return new Response('nf', { status: 404 });
    if (r.location) return new Response('', { status: r.status, headers: { Location: r.location } });
    return new Response(r.body, { status: r.status || 200, headers: { 'Content-Type': r.type || 'text/html' } });
  };
  return { f, count };
}

test('redirects: a permanent move is recorded, a versioned file behind a temporary one names the version, other sites and loops are refused', async () => {
  const a = auto.find((s) => s.url.endsWith('/') && !s.url.endsWith('.pdf')), pdf = auto.find((s) => /\/asset\//.test(s.url));
  const other = auto.find((s) => s !== a && s !== pdf && !s.url.endsWith('.pdf'));
  const loop = auto.find((s) => s !== a && s !== pdf && s !== other && !s.url.endsWith('.pdf'));
  const base = new URL(a.url).origin, pbase = new URL(pdf.url).origin;
  const h = harness((u) => {
    if (u === a.url) return { status: 301, location: base + '/moved/page/' };
    if (u === base + '/moved/page/') return { body: body(a.name) };
    if (u === pdf.url) return { status: 302, location: pbase + '/static/abc/Training-Pack-2025-V13.pdf' };
    if (u === pbase + '/static/abc/Training-Pack-2025-V13.pdf') return { body: '%PDF-1.7 synthetic', type: 'application/pdf' };
    if (u === other.url) return { status: 302, location: 'https://elsewhere.example/page' };
    if (u === loop.url) return { status: 302, location: loop.url };
    return null;
  });
  const env = makeEnv({ MONITOR_FETCH: h.f });
  await seedSources(env);
  const r = await monitorRun(env, ctx, { trigger: 'manual', ids: [a.id, pdf.id, other.id, loop.id], limit: 4, force: true });
  const out = Object.fromEntries(r.checked.map((c) => [c.id, c.outcome]));
  const row = (id) => env.DB.prepare('SELECT * FROM monitor_sources WHERE id = ?').bind(id).first();
  assert.equal(out[a.id], 'no_change');
  assert.equal(JSON.parse((await row(a.id)).meta).movedTo, base + '/moved/page/', 'the citation can be updated');
  assert.equal(out[pdf.id], 'no_change');
  assert.equal((await row(pdf.id)).doc_version, 'v13', 'version read from the file name behind the redirect');
  assert.equal(JSON.parse((await row(pdf.id)).meta).movedTo, undefined, 'a temporary redirect is not a move');
  assert.equal(out[other.id], 'unavailable');
  assert.ok(!h.count.has('https://elsewhere.example/page'), 'never followed to another site');
  assert.match((await env.DB.prepare('SELECT error FROM monitor_runs WHERE source_id = ? ORDER BY id DESC').bind(other.id).first()).error, /another site/);
  assert.equal(out[loop.id], 'unavailable');
  for (const id of [other.id, loop.id]) assert.equal((await row(id)).last_success_at, null, 'a refused redirect is never a success');
});

test('a new version of a linked official document on a page is a change for review', () => {
  const v1 = htmlToText(body('FAMUS DVT module', '<a href="https://www.acutemedicine.org.uk/wp-content/uploads/FAMUS-curriculum-pack-DVT-v1.1.pdf">Curriculum pack</a>'));
  const v2 = htmlToText(body('FAMUS DVT module', '<a href="https://www.acutemedicine.org.uk/wp-content/uploads/FAMUS-curriculum-pack-DVT-v1.2.pdf">Curriculum pack</a>'));
  assert.match(v1, /Linked document: FAMUS-curriculum-pack-DVT-v1\.1\.pdf/);
  assert.equal(classify({ hash: 'a', text: v1 }, { hash: 'b', text: v2 }).classification, 'important');
  const ics1 = htmlToText(body('FUSIC HD', '<a href="https://ics.ac.uk/asset/08F17125%2D7601%2D49EB%2DB00D9F2201376D45/">FUSIC HD Complete Guide</a>'));
  const ics2 = htmlToText(body('FUSIC HD', '<a href="https://ics.ac.uk/asset/99A17125%2D7601%2D49EB%2DB00D9F2201376D45/">FUSIC HD Complete Guide</a>'));
  assert.notEqual(ics1, ics2, 'a replaced ICS file has a new address');
  assert.ok(['meaningful', 'important'].includes(classify({ hash: 'a', text: ics1 }, { hash: 'b', text: ics2 }).classification));
});

test('each source keeps its own date; a source too large to compare is named, never counted as checked', async () => {
  const g = SOURCES.guides.find((x) => x.slug === 'famus-accreditation');
  const big = auto.find((s) => g.sources.includes(s.id) && !s.url.endsWith('.pdf'));
  const h = harness((u) => { const s = auto.find((x) => x.url === u); if (!s) return null; return s === big ? { body: '<main>' + '<p>x</p>'.repeat(90000) + '</main>' } : { body: body(s.name) }; });
  const env = makeEnv({ MONITOR_FETCH: h.f });
  await seedSources(env);
  const others = g.sources.filter((id) => id !== big.id);
  await env.DB.prepare("UPDATE monitor_sources SET last_success_at = '2026-10-09T08:00:00.000Z' WHERE id = ?").bind(others[0]).run();
  await monitorRun(env, ctx, { trigger: 'manual', ids: [...others.slice(1), big.id], limit: g.sources.length, force: true });
  const st = await guideStatus(env, 'famus-accreditation', null, { refresh: false });
  const dates = Object.fromEntries(st.list.map((x) => [x.url, x.checkedOn]));
  assert.equal(dates[SOURCES.sources.find((s) => s.id === others[0]).url], '2026-10-09', 'its own date');
  assert.equal(st.checkedOn, null);
  assert.ok(st.unavailable.some((u) => u.url === big.url));
  const row = await env.DB.prepare('SELECT status, last_success_at FROM monitor_sources WHERE id = ?').bind(big.id).first();
  assert.equal(row.status, 'unsupported');
  assert.equal(row.last_success_at, null);
});

test('fifty people open a guide at once: one background check at most, and with the edge cache one database read', async () => {
  const h = harness((u) => { const s = auto.find((x) => x.url === u); return s ? { body: body(s.name) } : null; });
  const env = makeEnv({ MONITOR_FETCH: h.f });
  await seedSources(env);
  resetOnDemand();
  const waits = [];
  const c = { waitUntil: (p) => waits.push(p) };
  const open = () => handleApp(new Request('https://thewavelength.co.uk/api/app/sources/guide/fusic-accreditation'), env, c);
  const res = await Promise.all(Array.from({ length: 50 }, open));
  assert.ok(res.every((r) => r.status === 200));
  await Promise.all(waits);
  assert.ok([...h.count.values()].reduce((a, b) => a + b, 0) <= 1, 'one source fetch for fifty openings');
  // With the Workers cache: the first answer is stored, and the rest never reach the database.
  const store = new Map();
  globalThis.caches = { default: { match: async (k) => { const r = store.get(k.url); return r ? r.clone() : undefined; }, put: async (k, r) => { store.set(k.url, r); } } };
  try {
    let reads = 0;
    const prep = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => { if (/monitor_sources|monitor_changes/.test(sql)) reads++; return prep(sql); };
    const first = await open(); await Promise.all(waits); await settle();
    const after = reads;
    const more = await Promise.all(Array.from({ length: 49 }, open));
    assert.equal(first.status, 200);
    assert.ok(more.every((r) => r.status === 200));
    assert.equal(reads, after, 'served from the cache');
    assert.deepEqual((await more[0].json()).guide.slug, 'fusic-accreditation');
  } finally { delete globalThis.caches; }
});

test('only guides in the registry: no address from a request is ever fetched', async () => {
  const h = harness(() => ({ body: body('x') }));
  const env = makeEnv({ MONITOR_FETCH: h.f });
  await seedSources(env);
  for (const p of ['/api/app/sources/guide/no-such-guide', '/api/app/sources/guide/https%3A%2F%2Fevil.example%2F', '/api/app/sources/guide/..%2F..%2Fadmin', '/api/app/sources/check?url=https://evil.example/']) {
    const r = await handleApp(new Request('https://thewavelength.co.uk' + p), env, { waitUntil: (x) => x });
    assert.ok([400, 401, 404].includes(r.status), `${p}: ${r.status}`);
  }
  await settle();
  assert.ok(![...h.count.keys()].some((u) => /evil/.test(u)));
  const post = await handleApp(new Request('https://thewavelength.co.uk/api/app/sources/guide/fusic-accreditation', { method: 'POST', body: '{}' }), env, ctx);
  assert.notEqual(post.status, 200, 'status is read-only');
});

test('directories off: the search says so and supervisors are entered by hand; an application with written experience and no certificate still goes in', async () => {
  const env = makeEnv({ SUPERVISOR_APPLY: 'true', ZEPTOMAIL_TOKEN: 'test' });
  globalThis.fetch = async () => new Response('{}');
  const c = await verifiedAccount(env, 'free.text@example.test', { organisation: 'Darent Valley Hospital' });
  const s = await c.call('/api/app/listings/search?q=sam');
  assert.equal(s.status, 200);
  assert.equal(s.body.available, false);
  assert.match(s.body.note, /Enter your supervisor by hand/);
  assert.equal((await c.call('/api/app/listings/claim', { ref: 'dir:fusic|x' })).status, 503);
  // RCEM supervisors (no directory exists) and anyone not listed: a written account of experience, no certificate.
  const r = await c.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Darent Valley Hospital',
    registration: { regulator: 'gmc', number: '1234567', profession: 'Doctor', organisation: 'Darent Valley Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: 'I am an RCEM-approved ultrasound supervisor and have supervised trainees in emergency department point-of-care ultrasound for eight years.',
    evidenceMode: 'explanation', areas: ['lung'], pathways: ['rcem'],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const sent = await c.call('/api/app/supervisor/submit', { declaration: true });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.status, 'submitted');
  const creds = await env.DB.prepare('SELECT COUNT(*) AS n FROM credentials').first();
  assert.equal(creds.n, 0, 'no certificate was needed');
});

test('the monitoring dashboard: administrators only; under Cloudflare Access, the verifier role', async () => {
  const env = makeEnv({});
  for (const [k, v] of [['volunteer_username', 'volunteer'], ['volunteer_hash', await hashPassword('Volunteer pw 12345')], ['admin_username', 'wavelength'], ['admin_hash', await hashPassword('Admin password 12345')], ['session_secret', 'test-secret']]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
  const res = await worker.fetch(new Request('https://thewavelength.co.uk/admin/sources/'), env, ctx);
  assert.ok([302, 303].includes(res.status), `no login: ${res.status}`);
  assert.match(res.headers.get('Location') || '', /\/admin\/login\//);
  const post = await worker.fetch(new Request('https://thewavelength.co.uk/admin/sources/', { method: 'POST', body: new URLSearchParams({ action: 'retry', id: auto[0].id }) }), env, ctx);
  assert.notEqual(post.status, 200);
  assert.equal(roleForPath('/admin/sources/'), 'verifier');
});
