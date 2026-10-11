// CPU cost of one source check, measured as CPU time (process.cpuUsage, user + system) over many repetitions, so the
// Windows timer's 15.6 ms granularity does not matter. Workers runs the same V8 engine; network and D1 waits do not
// count as CPU there, so two figures are given:
//   pipeline  what a check computes: text extraction, metadata, SHA-256 and change classification (the CPU a check
//             spends in the Worker), against a previous snapshot with one requirement line changed
//   full run  monitorRun end to end against the node:sqlite stand-in for D1 (an over-estimate: SQLite's own work
//             here is network I/O on Cloudflare)
// Input: a folder of saved source bodies named by source id (tools/monitor-cpu.mjs never fetches anything).
// Run: node --import ./test/helpers/register.mjs tools/monitor-cpu.mjs <folder> [repetitions]
import fs from 'node:fs';
import path from 'node:path';
import { htmlToText, htmlMeta, pdfMeta, sha256, TEXT_LIMIT } from '../worker/monitor/extract.js';
import { classify } from '../worker/monitor/classify.js';
import { monitorRun, seedSources, SNAPSHOT_MAX, MAX_BYTES, MAX_HTML_BYTES } from '../worker/monitor/run.js';
import { guideStatus } from '../worker/monitor/api.js';
import { makeEnv, ctx } from '../test/helpers/env.mjs';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };

const dir = process.argv[2], N = Number(process.argv[3] || 40);
const cpu = async (fn, n = N) => { await fn(); const t = process.cpuUsage(); for (let i = 0; i < n; i++) await fn(); const d = process.cpuUsage(t); return (d.user + d.system) / 1000 / n; };
const rows = [];
const bodies = new Map();
for (const s of SOURCES.sources) {
  const f = path.join(dir, s.id.replace(/[:/]/g, '_'));
  if (!fs.existsSync(f)) continue;
  const bytes = new Uint8Array(fs.readFileSync(f));
  bodies.set(s.url, bytes);
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50;
  // The same guards as checkSource: too large a file, or far too much text, is refused before the expensive steps.
  let prev = null, refused = isPdf ? bytes.length > MAX_BYTES : bytes.length > MAX_HTML_BYTES;
  if (!isPdf && !refused) {
    const text = htmlToText(new TextDecoder().decode(bytes));
    if (text == null || text.length > TEXT_LIMIT) refused = true;
    else {
      const lines = text.split('\n'); lines[Math.floor(lines.length / 2)] += ' Accreditation requires 40 supervised scans.';
      prev = { hash: 'previous', text: lines.join('\n').slice(0, SNAPSHOT_MAX), version: null, publishedOn: null, isDocument: false };
    }
  }
  const ms = await cpu(async () => {
    if (refused) { if (!isPdf && bytes.length <= MAX_HTML_BYTES) htmlToText(new TextDecoder().decode(bytes)); return null; }
    if (isPdf) { const m = pdfMeta(bytes, s.url); await sha256(bytes); return m; }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const text = htmlToText(html), hm = htmlMeta(html, text), h = await sha256(text);
    return classify(prev, { hash: h, text: text.slice(0, SNAPSHOT_MAX), version: hm.version, publishedOn: hm.publishedOn, isDocument: false });
  });
  rows.push({ id: s.id, name: s.name, kind: (isPdf ? 'pdf' : 'html') + (refused ? '*' : ''), kb: Math.round(bytes.length / 1024), pipeline: ms });
}
// Full scheduled runs (one source each), against the stand-in database.
const env = makeEnv({ MONITOR_FETCH: async (url) => (bodies.has(url) ? new Response(bodies.get(url), { headers: { 'Content-Type': bodies.get(url)[0] === 0x25 ? 'application/pdf' : 'text/html' } }) : new Response('nf', { status: 404 })), ZEPTOMAIL_TOKEN: '' });
globalThis.fetch = async () => new Response('{}');
await seedSources(env);
for (const r of rows) {
  const s = SOURCES.sources.find((x) => x.id === r.id);
  if (s.mode !== 'auto') continue;
  r.fullRun = await cpu(() => monitorRun(env, ctx, { trigger: 'manual', ids: [s.id], limit: 1, force: true }), Math.max(5, Math.round(N / 4)));
}
await env.DB.prepare("UPDATE monitor_sources SET next_check_at = '2999-01-01T00:00:00.000Z'").run();
const idle = await cpu(() => monitorRun(env, ctx, { trigger: 'cron', ids: [], limit: 1 }));
const status = await cpu(() => guideStatus(env, 'fusic-accreditation', null, { refresh: false }));
rows.sort((a, b) => b.pipeline - a.pipeline);
console.log('CPU ms per check (mean of %d)\n', N);
console.log('pipeline  full-run   KB  kind  source');
for (const r of rows) console.log(r.pipeline.toFixed(2).padStart(8), (r.fullRun == null ? '   -' : r.fullRun.toFixed(2)).padStart(9), String(r.kb).padStart(5), r.kind.padEnd(5), r.name.slice(0, 70));
const max = rows[0];
console.log(`\nheaviest pipeline: ${max.pipeline.toFixed(2)} ms (${max.name}); heaviest full run: ${Math.max(...rows.map((r) => r.fullRun || 0)).toFixed(2)} ms`);
console.log(`idle scheduled run (nothing due): ${idle.toFixed(2)} ms; guide status answer: ${status.toFixed(2)} ms`);
console.log('* refused by the size or text limits (reported for checking by hand), measured on the refusal path');
console.log('free plan allowance: 10 ms per invocation');
