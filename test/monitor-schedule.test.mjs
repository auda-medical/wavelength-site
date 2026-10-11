// Source monitoring, scheduling and limits (October 2026). Three simulated days of the real cron (every ten minutes,
// one source a run) with a fake clock: every healthy source is checked successfully on every UK calendar day even when
// runs are missed; a failing source backs off, is never counted as checked and is named on its guide; a flaky one
// recovers the same day; nobody is checked more than twice a day. Also the plan limits: cron triggers per account,
// one source per run, size ceilings, and CPU per check for the largest page the monitor will parse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeEnv, ctx } from './helpers/env.mjs';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };
import { monitorRun, seedSources, PER_RUN, MAX_HTML_BYTES, MAX_BYTES, DAY_MS } from '../worker/monitor/run.js';
import { guideStatus } from '../worker/monitor/api.js';
import { htmlToText, htmlMeta, sha256, TEXT_LIMIT } from '../worker/monitor/extract.js';
import { classify } from '../worker/monitor/classify.js';
import { MONITOR_CRON, jobFor } from '../worker/cron.js';
import { ukDate } from '../worker/time.js';

globalThis.fetch = async () => new Response('{}'); // administrator alerts go nowhere
const auto = SOURCES.sources.filter((s) => s.mode === 'auto');
const body = (t) => `<html><head><title>${t}</title></head><body><main><h1>${t}</h1><p>${'Accreditation requires supervised scans reviewed by a mentor. '.repeat(6)}</p></main></body></html>`;

function withClock(start) {
  const Real = Date;
  let now = Date.parse(start);
  class Fake extends Real { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  globalThis.Date = Fake;
  return { set: (t) => { now = t; }, get: () => now, restore: () => { globalThis.Date = Real; } };
}

test('three days of ten-minute runs: daily success for every healthy source, missed runs absorbed, failures never counted', async () => {
  const failing = auto[3], flaky = auto[7];
  let flakyLeft = 3;
  const MONITOR_FETCH = async (url) => {
    if (url === failing.url) return new Response('down', { status: 503 });
    if (url === flaky.url && flakyLeft > 0) { flakyLeft--; return new Response('busy', { status: 502 }); }
    const s = auto.find((x) => x.url === url);
    return s ? new Response(body(s.name), { headers: { 'Content-Type': 'text/html' } }) : new Response('nf', { status: 404 });
  };
  const env = makeEnv({ MONITOR_FETCH, ZEPTOMAIL_TOKEN: '' });
  const clock = withClock('2026-10-12T00:00:00Z');
  try {
    await seedSources(env);
    const minutes = MONITOR_CRON.split(' ')[0].split(',').map(Number);
    assert.equal(minutes.length, 6, 'every ten minutes');
    let slot = 0, ran = 0;
    for (let t = Date.parse('2026-10-12T00:00:00Z'); t < Date.parse('2026-10-15T00:00:00Z'); t += 60e3) {
      if (!minutes.includes(new Date(t).getUTCMinutes())) continue;
      slot++;
      if (slot % 7 === 0) continue; // Cloudflare occasionally misses a scheduled run: one in seven here
      clock.set(t);
      await monitorRun(env, ctx, { trigger: 'cron' });
      ran++;
    }
    assert.ok(ran > 360 && ran < 432);
    const runs = (await env.DB.prepare('SELECT source_id, started_at, outcome FROM monitor_runs').all()).results;
    const OK = new Set(['no_change', 'minor', 'meaningful', 'important']);
    const days = ['2026-10-12', '2026-10-13', '2026-10-14'];
    for (const s of auto) {
      const mine = runs.filter((r) => r.source_id === s.id);
      for (const d of days) {
        const that = mine.filter((r) => ukDate(Date.parse(r.started_at)) === d);
        if (s.id === failing.id) {
          assert.ok(that.every((r) => !OK.has(r.outcome)), 'a failure is never a success');
          assert.ok(that.length >= 1 && that.length <= 8, `failing source: bounded retries on ${d} (${that.length})`);
        } else {
          assert.ok(that.some((r) => OK.has(r.outcome)), `${s.name}: a successful check on ${d}`);
          assert.ok(that.filter((r) => OK.has(r.outcome)).length <= 2, `${s.name}: not hammered on ${d}`);
        }
      }
    }
    // The flaky source failed three times, then recovered on the first day.
    const fl = runs.filter((r) => r.source_id === flaky.id && ukDate(Date.parse(r.started_at)) === '2026-10-12');
    assert.equal(fl.filter((r) => r.outcome === 'unavailable').length, 3);
    assert.ok(fl.some((r) => OK.has(r.outcome)));
    // The failing source's guide: never "checked" as a whole; the failing source is named, the rest dated today.
    const row = await env.DB.prepare('SELECT last_success_at, failures, status FROM monitor_sources WHERE id = ?').bind(failing.id).first();
    assert.equal(row.last_success_at, null);
    assert.equal(row.status, 'unavailable');
    const g = SOURCES.guides.find((x) => x.sources.includes(failing.id));
    const st = await guideStatus(env, g.slug, null, { refresh: false });
    assert.equal(st.checkedOn, null);
    assert.ok(st.unavailable.some((u) => u.url === failing.url && u.lastCheckedOn === null));
    if (st.partial) assert.equal(st.partial.ok, st.sources.automatic - 1);
  } finally { clock.restore(); }
});

test('a source due again after a success waits a day less an hour, so each UK calendar day has a check', () => {
  assert.equal(DAY_MS, 23 * 3600e3);
  // Checks every 23 hours always land at least once in every 24-hour calendar day.
  let t = Date.parse('2026-10-12T23:50:00Z');
  const seen = new Set();
  for (let i = 0; i < 40; i++) { seen.add(new Date(t).toISOString().slice(0, 10)); t += DAY_MS; }
  const first = Date.parse('2026-10-12T00:00:00Z');
  for (let d = 0; d < 37; d++) assert.ok(seen.has(new Date(first + d * 864e5).toISOString().slice(0, 10)));
});

test('plan limits: at most five cron triggers in the account, one source per run, size ceilings, CPU per check', async () => {
  const w = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const crons = JSON.parse(w.match(/"crons":\s*(\[[^\]]*\])/)[1]);
  // The account's other Workers (OneRota site and preview) had no cron triggers on 11 October 2026.
  assert.ok(crons.length <= 4, 'leave at least one of the free plan\'s five account-wide cron triggers free');
  assert.equal(crons.filter((c) => jobFor(c) === 'source-monitor').length, 1);
  assert.equal(PER_RUN, 1);
  assert.ok(MAX_HTML_BYTES <= 480 * 1024 && MAX_BYTES <= 3 * 1024 * 1024);
  // The heaviest page the monitor will compare: the full HTML allowance, with the full text allowance of guidance
  // lines in its main content and the rest markup (menus, scripts, styling), parsed, hashed and compared with a
  // changed previous copy. Well inside 10 ms of CPU.
  const line = (i) => `<div class="row"><h3>Module ${i}</h3><p>Accreditation requires ${i % 50} supervised scans, reviewed by a mentor, within 12 months.</p><a href="/doc/pack-v${i % 9}.pdf">pack</a></div>`;
  let main = '', i = 0;
  while (main.replace(/<[^>]+>/g, '').length < TEXT_LIMIT - 3000) main += line(i++);
  let html = '<html><head><title>Big</title><script>' + 'var x=1;'.repeat(4000) + '</script></head><body><nav>' + '<a href="/x">Menu</a>'.repeat(300) + '</nav>';
  while (html.length + main.length < MAX_HTML_BYTES - 4000) html += '<div class="decor"><span class="icon"></span><span class="icon"></span></div>';
  html += `<main>${main}</main><footer>© Society</footer></body></html>`;
  const text0 = htmlToText(html);
  assert.ok(text0 && text0.length <= TEXT_LIMIT && html.length <= MAX_HTML_BYTES, `the test page is inside both allowances (${text0 && text0.length} characters, ${html.length} bytes)`);
  const prev = { hash: 'x', text: text0.replace('requires 7 supervised', 'requires 8 supervised'), isDocument: false };
  const once = async () => { const t = htmlToText(html); const m = htmlMeta(html, t); return classify(prev, { hash: await sha256(t), text: t, version: m.version, publishedOn: m.publishedOn, isDocument: false }); };
  await once();
  const n = 15, c = process.cpuUsage();
  for (let k = 0; k < n; k++) await once();
  const d = process.cpuUsage(c), ms = (d.user + d.system) / 1000 / n;
  assert.ok(ms < 10, `largest parsed page: ${ms.toFixed(2)} ms CPU per check`);
  // A page of far more text than any guidance page is refused before the expensive steps, cheaply.
  const huge = '<main>' + Array.from({ length: 9000 }, (_, k) => `<p>Line ${k} of a very long register of names and places.</p>`).join('') + '</main>';
  assert.equal(htmlToText(huge), null);
  const c2 = process.cpuUsage(); for (let k = 0; k < 15; k++) htmlToText(huge); const d2 = process.cpuUsage(c2);
  assert.ok((d2.user + d2.system) / 1000 / 15 < 10);
});
