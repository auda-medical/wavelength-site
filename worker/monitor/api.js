// Source monitoring: what the website and the apps show (GET /api/app/sources/guides, /api/app/sources/guide/<slug>),
// the listing search for name autocomplete (GET /api/app/listings/search) and a supervisor's claim to be a listed
// person (POST /api/app/listings/claim). The server is the only source of check dates and content versions.
//
// Three dates, never mixed (UK calendar dates, Europe/London):
//   checkedOn    the latest date on which EVERY automatically checked source of the guide was checked successfully
//                (a failed check never moves it; a source never checked leaves it null)
//   updatedOn    when the Wavelength guide's own text last changed (front matter updated, or reviewed)
//   reviewedOn   the last documented clinical review of the guide (front matter reviewed)
import SOURCES from './sources.json';
import { NEEDS_REVIEW } from './classify.js';
import { norm, orgNorm, editDistance, optedOut } from './directory.js';
import { monitorRun } from './run.js';
import { credentialsForListing } from './claims-admin.js';
import { json, clip } from '../app-util.js';
import { ukDate } from '../time.js';

const GUIDES = Object.fromEntries(SOURCES.guides.map((g) => [g.slug, g]));
const STATE_WORDS = { ok: 'Checked', changed: 'Changed: awaiting review', unavailable: 'Could not be checked', format_changed: 'Page changed shape: awaiting review', unsupported: 'Checked by hand (no automated check)', not_authorised: 'Not checked automatically (permission needed)', never: 'Not checked yet', retired: 'No longer cited' };

export async function guideStatus(env, slug, ctx = null, { refresh = true } = {}) {
  const g = GUIDES[slug];
  if (!g || g.draft) return null;
  const ids = g.sources;
  const rows = ids.length ? ((await env.DB.prepare(`SELECT id, name, body, url, mode, status, last_outcome, last_success_at, last_attempt_at, last_change_at, doc_version, published_on, failures FROM monitor_sources WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || []) : [];
  const open = ids.length ? ((await env.DB.prepare(`SELECT c.id, c.source_id, c.detected_at, c.classification, c.summary FROM monitor_changes c WHERE c.review_status IN ('open', 'acknowledged') AND c.source_id IN (${ids.map(() => '?').join(',')}) AND c.classification IN ('meaningful', 'important', 'format_changed') ORDER BY c.id DESC LIMIT 10`).bind(...ids).all()).results || []) : [];
  const auto = rows.filter((r) => r.mode === 'auto');
  const checked = auto.length && auto.every((r) => r.last_success_at) ? auto.map((r) => r.last_success_at).sort()[0] : null;
  const today = ukDate();
  const checkedOn = checked ? ukDate(Date.parse(checked)) : null;
  // The latest outcome is kept on each source (last_outcome), so this reads one row per source, never the run history.
  const noChange = !!checked && !open.length && auto.every((r) => ['no_change', 'minor'].includes(r.last_outcome));
  // Opening a guide whose sources were not all checked today asks for a background check of one of them (one parse fits the request's CPU allowance): it
  // never delays the response, and the date shown stays the last genuine success until that check succeeds.
  const stale = auto.filter((r) => !r.last_success_at || ukDate(Date.parse(r.last_success_at)) < today).filter((r) => !r.last_attempt_at || Date.now() - Date.parse(r.last_attempt_at) > 3600e3);
  if (refresh && ctx && ctx.waitUntil && stale.length && env.MONITOR_ON_DEMAND !== 'false') ctx.waitUntil(monitorRun(env, ctx, { trigger: 'on_demand', ids: stale.slice(0, 1).map((r) => r.id), limit: 1 }).catch(() => null));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return {
    slug, title: g.title, href: g.href, contentVersion: g.contentVersion,
    reviewedOn: g.reviewed, updatedOn: g.updated, checkedOn, checkedToday: checkedOn === today,
    noChangeLatest: noChange,
    sources: { total: rows.length, automatic: auto.length, byHand: rows.filter((r) => r.mode !== 'auto').length, failing: auto.filter((r) => r.failures > 0).length },
    pendingReview: open.map((c) => ({ source: (byId[c.source_id] || {}).name, url: (byId[c.source_id] || {}).url, detectedOn: ukDate(Date.parse(c.detected_at)), important: c.classification === 'important' })),
    list: ids.map((id) => byId[id]).filter(Boolean).map((r) => ({ name: r.name, body: r.body, url: r.url, state: r.status, stateLabel: STATE_WORDS[r.status] || r.status, checkedOn: r.last_success_at ? ukDate(Date.parse(r.last_success_at)) : null, changedOn: r.last_change_at ? ukDate(Date.parse(r.last_change_at)) : null, version: r.doc_version, publishedOn: r.published_on })),
  };
}

// ---------- Listing search (name autocomplete) ----------
// Only from directories that are authorised and synced. Names, organisations, roles and modules: never contact
// details. A listed person is shown as "On Wavelength" only when they are an approved Wavelength supervisor whose
// confirmed claim links them to the listing and who chose to be found (supervisor search consent).
const MIN = 3, MAX_RESULTS = 8;
let CACHE = { at: 0, key: '', list: [] };
// Objections are applied on every read too, so a cached list never shows someone whose objection was just recorded.
async function listings(env) {
  const all = await listingsAll(env);
  const optouts = (await env.DB.prepare('SELECT source_id, name_norm, org_norm FROM directory_optouts').all().catch(() => ({ results: [] }))).results || [];
  return optouts.length ? all.filter((x) => !optedOut(x, optouts, x.source)) : all;
}
async function listingsAll(env) {
  const rows = (await env.DB.prepare("SELECT s.source_id, s.id, s.entries, m.name AS source_name, m.body FROM directory_snapshots s JOIN monitor_sources m ON m.id = s.source_id WHERE s.current = 1 AND m.mode = 'auto'").all()).results || [];
  const key = rows.map((r) => `${r.source_id}:${r.id}`).join(',');
  if (CACHE.key === key && Date.now() - CACHE.at < 300e3) return CACHE.list;
  const list = [];
  for (const r of rows) for (const e of JSON.parse(r.entries)) if (e.status !== 'removed') list.push({ source: r.source_id, sourceName: r.source_name, body: r.body, key: e.key, name: e.name, organisation: e.organisation, roles: e.roles, n: norm(e.name), o: orgNorm(e.organisation), tokens: norm(e.name).split(' ') });
  CACHE = { at: Date.now(), key, list };
  return list;
}
// Scores a listing against what was typed: whole-name prefix, word prefixes in any order, a one-letter slip in a
// longer word, then the organisation as a tie-break.
export function score(item, q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return 0;
  let s = 0;
  if (item.n.startsWith(norm(q))) s += 50;
  for (const w of words) {
    const exact = item.tokens.some((t) => t.startsWith(w));
    const near = !exact && w.length >= 4 && item.tokens.some((t) => editDistance(t.slice(0, w.length + 1), w, 1) <= 1 || editDistance(t, w, 1) <= 1);
    const org = !exact && !near && item.o.split(' ').some((t) => t.startsWith(w));
    if (!exact && !near && !org) return 0;
    s += exact ? 20 : near ? 8 : 4;
  }
  return s;
}
export async function listingSearch(env, l, url) {
  if (env.DIRECTORY_SYNC !== 'true') return json({ ok: true, available: false, results: [], note: 'Official directory search is not switched on yet. Enter your supervisor by hand.' });
  const q = clip(url.searchParams.get('q'), 80);
  if (norm(q).replace(/ /g, '').length < MIN) return json({ ok: true, available: true, results: [] });
  const pathway = clip(url.searchParams.get('pathway'), 20), module = clip(url.searchParams.get('module'), 40);
  const all = await listings(env);
  const hits = all.map((x) => ({ x, s: score(x, q) })).filter((h) => h.s > 0 && (!pathway || h.x.roles.some((r) => r.module.startsWith(pathway))) && (!module || h.x.roles.some((r) => r.module === module)))
    .sort((a, b) => b.s - a.s || a.x.name.localeCompare(b.x.name)).slice(0, MAX_RESULTS).map((h) => h.x);
  // On Wavelength: a confirmed claim, a current approval, and the person's own consent to be found.
  const keys = hits.map((h) => `${h.source}|${h.key}`);
  const on = keys.length ? ((await env.DB.prepare(`SELECT k.source_id || '|' || k.entry_key AS k FROM directory_links k JOIN learners t ON t.id = k.learner_id WHERE k.status = 'confirmed' AND t.supervisor_searchable = 1 AND EXISTS (SELECT 1 FROM supervisor_approvals a WHERE a.learner_id = k.learner_id AND a.status = 'approved') AND (k.source_id || '|' || k.entry_key) IN (${keys.map(() => '?').join(',')})`).bind(...keys).all().catch(() => ({ results: [] }))).results || []) : [];
  const onSet = new Set(on.map((r) => r.k));
  return json({ ok: true, available: true, results: hits.map((h) => ({ ref: `${h.source}|${h.key}`, name: h.name, organisation: h.organisation, source: h.sourceName, body: h.body, roles: h.roles, onWavelength: onSet.has(`${h.source}|${h.key}`) })), note: 'From official directories, checked daily. Being listed is not Wavelength approval.' });
}
// A supervisor says "this listing is me". A claim only: an administrator confirms identity before it counts, and
// approval to supervise is still decided separately (worker/supervisors-admin.js).
export async function listingClaim(env, l, d) {
  if (env.DIRECTORY_SYNC !== 'true') return json({ ok: false, error: 'Official directory matching is not switched on yet. Add your credential and evidence instead.' }, 503);
  if (l.email_status !== 'verified') return json({ ok: false, needVerify: true, error: 'Confirm your email address first.' }, 403);
  const [source, ...rest] = String(d.ref || '').split('|');
  const key = rest.join('|');
  const all = await listings(env);
  const hit = all.find((x) => x.source === source && x.key === key);
  if (!hit) return json({ ok: false, error: 'That listing was not found. It may have changed: search again.' }, 404);
  const taken = await env.DB.prepare("SELECT learner_id FROM directory_links WHERE source_id = ? AND entry_key = ? AND status = 'confirmed' AND learner_id != ?").bind(source, key, l.id).first();
  if (taken) return json({ ok: false, error: 'Another account has already been confirmed as this listed person. Contact hello@thewavelength.co.uk if this is you.' }, 409);
  try { await env.DB.prepare("INSERT INTO directory_links (learner_id, source_id, entry_key, status) VALUES (?,?,?, 'claimed')").bind(l.id, source, key).run(); }
  catch { /* already claimed: one live claim per listing per account */ }
  // The credentials the listing shows, so the application can tick them (the applicant can still change them).
  const credentials = credentialsForListing(source, hit.roles).map((c) => ({ type: c.type.id, modules: c.modules }));
  return json({ ok: true, claim: { ref: `${source}|${key}`, status: 'claimed', name: hit.name, organisation: hit.organisation, roles: hit.roles, source: hit.sourceName }, credentials, message: 'Thank you. The Wavelength team will confirm it is you before the listing counts towards your verification.' });
}
export async function listingClaims(env, l) {
  const rows = (await env.DB.prepare("SELECT source_id, entry_key, status, flag, claimed_at, decided_at FROM directory_links WHERE learner_id = ? AND status IN ('claimed', 'confirmed') ORDER BY id DESC").bind(l.id).all().catch(() => ({ results: [] }))).results || [];
  return json({ ok: true, claims: rows.map((r) => ({ ref: `${r.source_id}|${r.entry_key}`, status: r.status, changed: r.flag || null, claimedOn: ukDate(Date.parse(r.claimed_at + 'Z')) })) });
}

// Routes under /api/app/ (worker/app.js). Guide status is public; listings need a login.
export async function handleMonitorPublic(env, req, url, p, ctx) {
  if (p === 'sources/guides') {
    const out = [];
    for (const g of SOURCES.guides.filter((x) => !x.draft)) out.push(await guideStatus(env, g.slug, null, { refresh: false }));
    return json({ ok: true, today: ukDate(), guides: out }, 200, { 'Cache-Control': 'public, max-age=300' });
  }
  const m = p.match(/^sources\/guide\/([a-z0-9-]{1,80})$/);
  if (m) {
    const st = await guideStatus(env, m[1], ctx);
    return st ? json({ ok: true, today: ukDate(), guide: st }, 200, { 'Cache-Control': 'public, max-age=300' }) : json({ ok: false, error: 'No such guide.' }, 404);
  }
  return null;
}
export async function handleMonitorApp(env, l, req, url, p, body) {
  if (p === 'listings/search' && req.method === 'GET') return listingSearch(env, l, url);
  if (p === 'listings/claims' && req.method === 'GET') return listingClaims(env, l);
  if (p === 'listings/claim' && req.method === 'POST') return listingClaim(env, l, (await body(req)) || {});
  return null;
}
export { NEEDS_REVIEW };
