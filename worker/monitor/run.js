// Source monitoring runs (October 2026). The cron (worker/cron.js, '4,14,24,34,44,54 * * * *', every ten minutes)
// checks one due source each time (144 chances a day for about 40 sources, so missed slots and retries fit), so each source is checked once a day within the Workers free plan's per-invocation limits:
// the heaviest real source measured (a 375 KB page) takes about 6 ms of the 10 ms CPU allowed (docs/source-monitoring).
// Guarantees:
//   - last_success_at moves only when a check genuinely succeeded; a failure keeps the previous good data and date
//   - a source is held by a lease while checked, so two runs (or a run and a manual retry) never check it twice
//   - a failure retries with bounded back-off (1, 2, 4, 8, then every 12 hours) and alerts after 3 failures in a row
//   - directories are read only when authorised in data/monitor-sources.json AND DIRECTORY_SYNC = "true"
//   - a directory sync is one validated snapshot written in one statement: never half applied, never emptied
//   - clinical or accreditation content is never changed here: changes are recorded for a person to review
import SOURCES from './sources.json';
import { htmlToText, htmlMeta, pdfMeta, sha256, TEXT_LIMIT } from './extract.js';
import { classify, NEEDS_REVIEW } from './classify.js';
import { parseDirectory, validate, sync, optedOut } from './directory.js';
import { queueStmt, deliverLater } from '../notify.js';
import { ukDate } from '../time.js';

export const PER_RUN = 1;            // sources per invocation (10 ms CPU on the free plan: one parse and diff each)
export const DAY_MS = 23 * 3600e3;   // a successful source is due again a day later (an hour early, so the cron keeps the daily rhythm)
export const LEASE_MS = 10 * 60e3;
export const TIMEOUT_MS = 15000;
export const MAX_REDIRECTS = 5;
// Size limits keep one check inside the free plan's 10 ms CPU (measured with tools/monitor-cpu.mjs: the heaviest real
// page, 366 KB of HTML, about 6 ms; a 1.6 MB PDF about 3 ms). A larger source is reported for checking by hand,
// never parsed and never counted as checked.
export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_HTML_BYTES = 480 * 1024;
export const SNAPSHOT_MAX = 200000;  // characters of normalised text kept for the next comparison
export const ALERT_AFTER = 3;        // consecutive failures before an administrator is told
const UA = 'WavelengthSourceCheck/1.0 (+https://thewavelength.co.uk/guides/; hello@thewavelength.co.uk)';
const iso = (ms = Date.now()) => new Date(ms).toISOString();
export const backoff = (failures) => Math.min(12, 2 ** Math.max(0, failures - 1)) * 3600e3;

// Directory sources may be read only with the body's written permission (recorded in data/monitor-sources.json by
// changing mode to 'auto' and naming the permission) and the Worker switch.
export const directoryAllowed = (env, s) => s.kind !== 'directory' || (s.mode === 'auto' && env.DIRECTORY_SYNC === 'true');

// ---------- The source list: seeded from the build in one statement, only when it changed ----------
export async function seedSources(env) {
  const have = await env.DB.prepare("SELECT value FROM settings WHERE key = 'monitor_sources_version'").first('value').catch(() => null);
  if (have === SOURCES.version) return false;
  const rows = JSON.stringify(SOURCES.sources.map((s) => ({ id: s.id, kind: s.kind, name: s.name, body: s.body, url: s.url, mode: s.mode, adapter: s.adapter, guides: JSON.stringify(s.guides || []), why: s.why || null })));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO monitor_sources (id, kind, name, body, url, mode, adapter, guides, status, meta)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.kind'), json_extract(value, '$.name'), json_extract(value, '$.body'), json_extract(value, '$.url'), json_extract(value, '$.mode'), json_extract(value, '$.adapter'), json_extract(value, '$.guides'),
        CASE json_extract(value, '$.mode') WHEN 'manual' THEN 'unsupported' WHEN 'not_authorised' THEN 'not_authorised' ELSE 'never' END, json_object('why', json_extract(value, '$.why'))
      FROM json_each(?) WHERE true
      ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, body = excluded.body, mode = excluded.mode, adapter = excluded.adapter, guides = excluded.guides, meta = json_set(monitor_sources.meta, '$.why', json_extract(excluded.meta, '$.why')),
        url = excluded.url, status = CASE WHEN excluded.mode = 'manual' THEN 'unsupported' WHEN excluded.mode = 'not_authorised' THEN 'not_authorised' WHEN monitor_sources.status IN ('unsupported', 'not_authorised') THEN 'never' ELSE monitor_sources.status END,
        content_hash = CASE WHEN excluded.url = monitor_sources.url THEN monitor_sources.content_hash END, snapshot = CASE WHEN excluded.url = monitor_sources.url THEN monitor_sources.snapshot END, updated_at = datetime('now')`).bind(rows),
    // A source no longer cited anywhere is retired: kept with its history, no longer checked.
    env.DB.prepare("UPDATE monitor_sources SET mode = 'retired', status = 'retired' WHERE id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?))").bind(rows),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('monitor_sources_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(SOURCES.version),
  ]);
  return true;
}

// ---------- One run ----------
// opts: { trigger: 'cron' | 'manual' | 'on_demand', ids: only these sources (manual retry, a guide being opened),
// limit, force: check even if not due (manual retry), acceptDrop: a directory fall an administrator accepted }. Returns a summary.
// Whether migration 0016 is in place. Before it (a Worker deployed first) or after a rollback, monitoring does nothing
// and the public status answers 'not set up', so nothing errors and nothing is claimed.
export async function monitorReady(env) {
  try { await env.DB.prepare('SELECT 1 FROM monitor_sources LIMIT 0').all(); return true; } catch { return false; }
}

export async function monitorRun(env, ctx = null, opts = {}) {
  const trigger = opts.trigger || 'cron', now = Date.now();
  if (!(await monitorReady(env))) return { trigger, checked: [], skipped: [], ready: false };
  await seedSources(env);
  const due = opts.ids && opts.ids.length
    ? ((await env.DB.prepare(`SELECT * FROM monitor_sources WHERE id IN (${opts.ids.map(() => '?').join(',')})`).bind(...opts.ids).all()).results || [])
    : ((await env.DB.prepare("SELECT * FROM monitor_sources WHERE mode = 'auto' AND (next_check_at IS NULL OR next_check_at <= ?) AND (lease_until IS NULL OR lease_until < ?) ORDER BY next_check_at IS NOT NULL, next_check_at LIMIT ?").bind(iso(now), iso(now), opts.limit || PER_RUN).all()).results || []);
  const out = { trigger, checked: [], skipped: [] };
  for (const s of due.slice(0, opts.limit || PER_RUN)) {
    if (s.mode !== 'auto' || !directoryAllowed(env, s)) { out.skipped.push({ id: s.id, why: s.mode }); continue; }
    if (!opts.force && s.next_check_at && s.next_check_at > iso(now)) { out.skipped.push({ id: s.id, why: 'not_due' }); continue; }
    // The lease: only one run checks a source at a time.
    const lease = await env.DB.prepare('UPDATE monitor_sources SET lease_until = ? WHERE id = ? AND (lease_until IS NULL OR lease_until < ?)').bind(iso(now + LEASE_MS), s.id, iso(now)).run();
    if (!(lease.meta && lease.meta.changes)) { out.skipped.push({ id: s.id, why: 'busy' }); continue; }
    let r;
    try { r = await checkSource(env, s, trigger, { acceptDrop: !!opts.acceptDrop }); } catch (e) { r = { outcome: 'unavailable', error: String(e && e.message || e).slice(0, 300) }; await recordFailure(env, s, r, trigger); }
    out.checked.push({ id: s.id, outcome: r.outcome });
  }
  if (trigger === 'cron') await notifyAdmins(env, ctx);
  if (trigger === 'cron') await retention(env);
  return out;
}

// ---------- One source ----------
async function fetchSource(env, s) {
  const f = env.MONITOR_FETCH || fetch; // tests pass a stand-in; production uses the Workers fetch
  const headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf,application/json;q=0.9,*/*;q=0.5' };
  const meta = JSON.parse(s.meta || '{}');
  // Conditional requests save the source's bandwidth, but once a week the full content is read and compared, so
  // a server that answers 304 wrongly cannot hide a change.
  const fullDue = !meta.fullAt || Date.now() - Date.parse(meta.fullAt) > 7 * 864e5;
  if (s.content_hash && !fullDue) { if (s.etag) headers['If-None-Match'] = s.etag; if (s.last_modified) headers['If-Modified-Since'] = s.last_modified; }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const limit = Number(env.MONITOR_TIMEOUT_MS) || TIMEOUT_MS;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), limit) : null;
  try {
    // Redirects are followed by hand, at most five, and only within the source's own site: a source can never lead
    // the monitor to another host (the allowlist is the registry). A permanent move (301, 308) is recorded so the
    // citation can be updated; a temporary one (302, 303, 307) is how some bodies serve versioned files.
    let url = s.url, res = null, moved = null;
    const site = (u) => new URL(u).hostname.replace(/^www\./, '');
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await f(url, { headers, redirect: 'manual', signal: ctrl ? ctrl.signal : undefined });
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      const loc = res.headers.get('Location');
      if (!loc || hop === MAX_REDIRECTS) return { status: res.status, error: `too many redirects` };
      const next = new URL(loc, url).toString();
      if (!/^https:/.test(next) || site(next) !== site(s.url)) return { status: res.status, error: `redirected to another site (${new URL(next).hostname}): check the citation` };
      if ((res.status === 301 || res.status === 308) && hop === 0) moved = next;
      url = next;
    }
    if (res.status === 304) return { status: 304, headers: res.headers, finalUrl: url, moved };
    if (!res.ok) return { status: res.status, error: `HTTP ${res.status}` };
    const len = Number(res.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES) return { status: res.status, error: `too large to check automatically (${Math.round(len / 1024)} KB): check it by hand` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return { status: res.status, error: `too large to check automatically (${Math.round(buf.length / 1024)} KB): check it by hand` };
    return { status: res.status, headers: res.headers, bytes: buf, type: (res.headers.get('Content-Type') || '').toLowerCase(), finalUrl: url, moved };
  } catch (e) {
    return { status: 0, error: e && e.name === 'AbortError' ? `no answer within ${Math.round(limit / 1000)} seconds` : String(e && e.message || e).slice(0, 200) };
  } finally { if (timer) clearTimeout(timer); }
}

export async function checkSource(env, s, trigger = 'cron', o = {}) {
  const started = iso();
  const got = await fetchSource(env, s);
  if (got.error) return recordFailure(env, s, { outcome: 'unavailable', http: got.status, error: got.error }, trigger, started);
  if (s.kind === 'directory') return checkDirectory(env, s, got, trigger, started, o);
  const meta = JSON.parse(s.meta || '{}');
  // Where the citation now leads: shown to administrators so a permanently moved source gets its citation updated.
  if (got.moved) meta.movedTo = got.moved; else delete meta.movedTo;
  if (got.finalUrl && got.finalUrl !== s.url) meta.finalUrl = got.finalUrl; else delete meta.finalUrl;
  if (got.status === 304) return recordSuccess(env, s, { outcome: 'no_change', http: 304, next: { hash: s.content_hash, text: s.snapshot, version: s.doc_version, publishedOn: s.published_on }, result: { classification: 'no_change', summary: 'Not modified since the last check (confirmed by the source).' }, meta }, trigger, started);
  const isPdf = got.type.includes('pdf') || (got.bytes[0] === 0x25 && got.bytes[1] === 0x50 && got.bytes[2] === 0x44 && got.bytes[3] === 0x46);
  let next;
  if (isPdf) {
    const pm = pdfMeta(got.bytes, got.finalUrl || s.url); // a versioned file name behind a redirect names the version
    next = { isDocument: true, hash: await sha256(got.bytes), text: null, version: pm.version, publishedOn: pm.publishedOn, title: pm.title };
  } else {
    if (got.bytes.length > MAX_HTML_BYTES) return recordFailure(env, s, { outcome: 'unsupported', http: got.status, error: `The page is ${Math.round(got.bytes.length / 1024)} KB, more than can be checked automatically within the plan's limits: check it by hand.` }, trigger, started);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(got.bytes);
    const text = htmlToText(html);
    if (text == null || text.length > TEXT_LIMIT) return recordFailure(env, s, { outcome: 'unsupported', http: got.status, error: 'The page holds far more text than a guidance page: it cannot be compared automatically within the plan\'s limits. Check it by hand.' }, trigger, started);
    if (text.length < 120) return recordFailure(env, s, { outcome: 'format_changed', http: got.status, error: `The page has almost no readable text (${text.length} characters): it may now need JavaScript, a login or a different address.` }, trigger, started);
    const hm = htmlMeta(html, text);
    next = { isDocument: false, hash: await sha256(text), text: text.slice(0, SNAPSHOT_MAX), version: hm.version, publishedOn: hm.publishedOn, title: hm.title };
  }
  const prev = s.content_hash ? { hash: s.content_hash, text: s.snapshot, version: s.doc_version, publishedOn: s.published_on, isDocument: next.isDocument } : null;
  const result = classify(prev, next);
  meta.fullAt = iso();
  if (result.classification === 'format_changed') return recordFailure(env, s, { outcome: 'format_changed', http: got.status, error: result.summary, evidence: result.evidence }, trigger, started);
  return recordSuccess(env, s, { outcome: result.classification === 'baseline' ? 'no_change' : result.classification, http: got.status, next, result, meta, etag: got.headers.get('ETag'), lastModified: got.headers.get('Last-Modified') }, trigger, started);
}

async function recordSuccess(env, s, r, trigger, started) {
  const now = iso();
  const changed = !['no_change', 'baseline'].includes(r.result.classification);
  const stmts = [
    env.DB.prepare(`UPDATE monitor_sources SET status = ?, last_outcome = ?, last_attempt_at = ?, last_success_at = ?, last_change_at = CASE WHEN ? THEN ? ELSE last_change_at END, next_check_at = ?, failures = 0, lease_until = NULL,
      etag = COALESCE(?, etag), last_modified = COALESCE(?, last_modified), content_hash = ?, doc_version = ?, published_on = ?, snapshot = ?, meta = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(changed && NEEDS_REVIEW.has(r.result.classification) ? 'changed' : 'ok', r.outcome, now, now, changed ? 1 : 0, now, iso(Date.now() + DAY_MS), r.etag || null, r.lastModified || null, r.next.hash, r.next.version || null, r.next.publishedOn || null, r.next.text || null, JSON.stringify(r.meta || {}), s.id),
    env.DB.prepare('INSERT INTO monitor_runs (source_id, trigger, started_at, finished_at, outcome, http_status) VALUES (?,?,?,?,?,?)').bind(s.id, trigger, started || now, now, r.outcome, r.http || null),
  ];
  if (changed) stmts.push(env.DB.prepare('INSERT INTO monitor_changes (source_id, detected_at, classification, summary, evidence, guides, review_status) VALUES (?,?,?,?,?,?,?)')
    .bind(s.id, now, r.result.classification, r.result.summary, JSON.stringify(r.result.evidence || {}).slice(0, 8000), s.guides || '[]', NEEDS_REVIEW.has(r.result.classification) ? 'open' : 'none'));
  await env.DB.batch(stmts);
  return { outcome: r.outcome, classification: r.result.classification };
}
export async function recordFailure(env, s, r, trigger, started) {
  const now = iso();
  const failures = (s.failures || 0) + 1;
  const stmts = [
    // last_success_at, the content hash and the snapshot are left exactly as they were.
    env.DB.prepare("UPDATE monitor_sources SET status = ?, last_outcome = ?, last_attempt_at = ?, failures = ?, next_check_at = ?, lease_until = NULL, updated_at = datetime('now') WHERE id = ?").bind(['format_changed', 'unsupported'].includes(r.outcome) ? r.outcome : 'unavailable', r.outcome, now, failures, iso(Date.now() + backoff(failures)), s.id),
    env.DB.prepare('INSERT INTO monitor_runs (source_id, trigger, started_at, finished_at, outcome, http_status, error) VALUES (?,?,?,?,?,?,?)').bind(s.id, trigger, started || now, now, r.outcome, r.http || null, (r.error || '').slice(0, 500)),
  ];
  // A format change is worth one review item (not one per retry): only when the source was not already in that state.
  if (r.outcome === 'format_changed' && s.status !== 'format_changed') stmts.push(env.DB.prepare("INSERT INTO monitor_changes (source_id, detected_at, classification, summary, evidence, guides, review_status) VALUES (?,?,'format_changed',?,?,?, 'open')").bind(s.id, now, r.error || 'The source format changed.', JSON.stringify(r.evidence || {}).slice(0, 4000), s.guides || '[]'));
  await env.DB.batch(stmts);
  return { outcome: r.outcome, failures };
}

// ---------- Directories ----------
async function checkDirectory(env, s, got, trigger, started, o = {}) {
  const text = got.status === 304 ? null : new TextDecoder().decode(got.bytes);
  const cur = await env.DB.prepare('SELECT * FROM directory_snapshots WHERE source_id = ? AND current = 1 ORDER BY id DESC LIMIT 1').bind(s.id).first();
  const previous = cur ? JSON.parse(cur.entries) : [];
  if (got.status === 304) return recordDirectory(env, s, { outcome: 'no_change', previous, cur, entries: previous, events: [], hash: cur && cur.content_hash, http: 304 }, trigger, started);
  const parsed = parseDirectory(s.adapter, text);
  if (!parsed.ok) return recordFailure(env, s, { outcome: 'format_changed', http: got.status, error: `Could not read the directory: ${parsed.error}. Kept the previous directory.` }, trigger, started);
  // People who objected are never taken in (they were removed from the stored snapshots when the objection was recorded).
  const optouts = (await env.DB.prepare("SELECT source_id, name_norm, org_norm FROM directory_optouts WHERE source_id IN (?, '*')").bind(s.id).all()).results || [];
  if (optouts.length) parsed.entries = parsed.entries.filter((e) => !optedOut(e, optouts, s.id));
  const v = validate(parsed.entries, previous, { acceptDrop: o.acceptDrop });
  if (!v.ok) return recordFailure(env, s, { outcome: v.reason === 'empty' ? 'unavailable' : 'format_changed', http: got.status, error: v.message }, trigger, started);
  const hash = await sha256(JSON.stringify(parsed.entries.map((e) => [e.sourceId, e.name, e.organisation, e.roles, e.accredited_on])));
  if (cur && cur.content_hash === hash) return recordDirectory(env, s, { outcome: 'no_change', previous, cur, entries: previous, events: [], hash, http: got.status }, trigger, started);
  const day = ukDate();
  const res = sync(previous, parsed.entries, day);
  return recordDirectory(env, s, { outcome: res.events.length ? 'directory' : 'no_change', previous, cur, entries: res.entries, events: res.events, hash, http: got.status }, trigger, started);
}
async function recordDirectory(env, s, r, trigger, started) {
  const now = iso();
  const stmts = [];
  const counts = { listed: r.entries.filter((e) => e.status !== 'removed').length };
  for (const e of r.events) counts[e.kind] = (counts[e.kind] || 0) + 1;
  if (r.events.length || !r.cur) {
    // The new snapshot replaces the current one in the same batch as everything else: all or nothing.
    stmts.push(env.DB.prepare('UPDATE directory_snapshots SET current = 0 WHERE source_id = ? AND current = 1').bind(s.id));
    stmts.push(env.DB.prepare('INSERT INTO directory_snapshots (source_id, taken_at, entry_count, content_hash, entries, current) VALUES (?,?,?,?,?,1)').bind(s.id, now, counts.listed, r.hash || '', JSON.stringify(r.entries)));
    // Keep the current and the previous snapshot only.
    stmts.push(env.DB.prepare('DELETE FROM directory_snapshots WHERE source_id = ? AND current = 0 AND id NOT IN (SELECT id FROM directory_snapshots WHERE source_id = ? AND current = 0 ORDER BY id DESC LIMIT 1)').bind(s.id, s.id));
    // Events: one row each, up to 25; a larger sync is one summarised change for review.
    for (const e of r.events.slice(0, 25)) stmts.push(env.DB.prepare('INSERT INTO directory_events (source_id, entry_key, at, kind, before, after, review_status) VALUES (?,?,?,?,?,?,?)').bind(s.id, e.key || '', now, e.kind, e.before ? JSON.stringify(e.before) : null, e.after ? JSON.stringify(e.after) : null, e.review ? 'open' : 'none'));
    // People whose Wavelength verification relies on a listing that went or lost modules: flag for review.
    const flagged = r.events.filter((e) => e.key && (e.kind === 'removed' || e.kind === 'modules_removed' || e.kind === 'role_changed'));
    if (flagged.length) stmts.push(env.DB.prepare("UPDATE directory_links SET flag = CASE WHEN (SELECT json_extract(value, '$.kind') FROM json_each(?) WHERE json_extract(value, '$.key') = directory_links.entry_key LIMIT 1) = 'removed' THEN 'listing_removed' ELSE 'modules_changed' END WHERE source_id = ? AND status IN ('claimed', 'confirmed') AND entry_key IN (SELECT json_extract(value, '$.key') FROM json_each(?))").bind(JSON.stringify(flagged.map((e) => ({ key: e.key, kind: e.kind }))), s.id, JSON.stringify(flagged.map((e) => ({ key: e.key })))));
    const review = r.events.filter((e) => e.review);
    if (r.cur && r.events.length) stmts.push(env.DB.prepare("INSERT INTO monitor_changes (source_id, detected_at, classification, summary, evidence, guides, review_status) VALUES (?,?,'directory',?,?, '[]', ?)")
      .bind(s.id, now, `${Object.entries(counts).filter(([k]) => k !== 'listed').map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ')}; ${counts.listed} listed.`, JSON.stringify({ counts, events: r.events.slice(0, 60) }).slice(0, 8000), review.length ? 'open' : 'none'));
  }
  stmts.push(env.DB.prepare("UPDATE monitor_sources SET status = 'ok', last_outcome = ?, last_attempt_at = ?, last_success_at = ?, last_change_at = CASE WHEN ? THEN ? ELSE last_change_at END, next_check_at = ?, failures = 0, lease_until = NULL, content_hash = ?, meta = json_set(meta, '$.fullAt', ?, '$.counts', json(?)), updated_at = datetime('now') WHERE id = ?")
    .bind(r.outcome, now, now, r.events.length ? 1 : 0, now, iso(Date.now() + DAY_MS), r.hash || null, now, JSON.stringify(counts), s.id));
  stmts.push(env.DB.prepare('INSERT INTO monitor_runs (source_id, trigger, started_at, finished_at, outcome, http_status, counts) VALUES (?,?,?,?,?,?,?)').bind(s.id, trigger, started || now, now, r.outcome, r.http || null, JSON.stringify(counts)));
  await env.DB.batch(stmts);
  return { outcome: r.outcome, counts };
}

// ---------- Administrator alerts: only when something needs a person, at most one email per run ----------
async function notifyAdmins(env, ctx) {
  const items = (await env.DB.prepare("SELECT c.id, c.source_id, c.classification, c.summary, s.name FROM monitor_changes c JOIN monitor_sources s ON s.id = c.source_id WHERE c.review_status = 'open' AND c.notified_at IS NULL AND c.classification IN ('important', 'meaningful', 'format_changed', 'directory') ORDER BY c.id LIMIT 30").all()).results || [];
  const failing = (await env.DB.prepare("SELECT id, name, failures FROM monitor_sources WHERE mode = 'auto' AND failures = ?").bind(ALERT_AFTER).all()).results || [];
  if (!items.length && !failing.length) return null;
  const key = `monitor:${ukDate()}:${items.map((i) => i.id).join('.')}:${failing.map((f) => f.id).join('.')}`.slice(0, 190);
  const to = env.MAIL_REPLY_TO || 'hello@thewavelength.co.uk';
  await env.DB.batch([
    queueStmt(env, { key, kind: 'monitor_summary', to, toName: 'Wavelength', data: { items: items.map((i) => ({ name: i.name, classification: i.classification, summary: i.summary })), failing: failing.map((f) => ({ name: f.name, failures: f.failures })) } }),
    ...(items.length ? [env.DB.prepare(`UPDATE monitor_changes SET notified_at = ? WHERE id IN (${items.map(() => '?').join(',')})`).bind(iso(), ...items.map((i) => i.id))] : []),
  ]);
  deliverLater(env, ctx, [key]);
  return key;
}
async function retention(env) {
  const day = ukDate();
  const done = await env.DB.prepare("SELECT value FROM settings WHERE key = 'monitor_retention_day'").first('value').catch(() => null);
  if (done === day) return;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM monitor_runs WHERE started_at < ?").bind(iso(Date.now() - 90 * 864e5)),
    // Directory events name people: kept 13 months, long enough to review a year's changes.
    env.DB.prepare("DELETE FROM directory_events WHERE at < ?").bind(iso(Date.now() - 395 * 864e5)),
    env.DB.prepare("INSERT INTO settings (key, value) VALUES ('monitor_retention_day', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(day),
  ]);
}
