// Organisation autocomplete (plan section 19). Routes under /api/app/:
//   GET  organisations?q=&country=     public; 2 characters minimum; up to 10 suggestions; cached for an hour
//   GET  organisations/<id>            public; one organisation, following merged_into
//   POST organisations/request {name}  logged in; "My organisation is not listed"
// Admin page /volunteer/admin/organisations/ (worker/index.js): request queue, aliases, merges, legacy free text.
// Rules: the typed text is always kept beside any id; an id is added only when the person picked a suggestion or an
// administrator confirmed a match; nothing is merged silently and nothing is deleted.
// Before migration 0013 every endpoint degrades quietly: no suggestions, typed text saved as before.
import { json, clip, fullName } from './app-util.js';
import { normOrg, queryWords } from './org-norm.js';
import { auditStmt, audit } from './audit.js';
import { nowIso } from './time.js';

export const KINDS = ['trust', 'hospital', 'health_board', 'university', 'deanery', 'private', 'other'];
const KIND_LABEL = { trust: 'NHS trust', hospital: 'Hospital', health_board: 'Health board', university: 'University or medical school', deanery: 'Deanery or NHS England region', private: 'Independent provider', other: 'Other' };
const ID = /^wl-\d{1,7}$|^[A-Z0-9]{3,6}$/;
const ADMIN_FIRST = 100001; // administrators' additions; seed ids stay below 100000
const MAX_RESULTS = 10;

// True once migration 0013 is applied. Cached per database binding: a positive answer for the life of the isolate,
// a negative one for a minute.
const READY = new WeakMap();
export async function orgsReady(env) {
  if (!env || !env.DB) return false;
  const c = READY.get(env.DB);
  if (c && (c.ok || Date.now() - c.at < 60e3)) return c.ok;
  let ok = true;
  try { await env.DB.prepare('SELECT id FROM organisations LIMIT 0').all(); await env.DB.prepare('SELECT organisation_id FROM learners LIMIT 0').all(); await env.DB.prepare('SELECT bucket FROM rate_counters LIMIT 0').all(); }
  catch { ok = false; }
  READY.set(env.DB, { ok, at: Date.now() });
  return ok;
}

// ---------- Lookup ----------
// Follows merged_into (at most five steps). Returns the row reached, or null.
export async function resolveOrg(env, id) {
  let cur = clip(id, 40);
  for (let i = 0; i < 6 && cur; i++) {
    const row = await env.DB.prepare('SELECT * FROM organisations WHERE id = ?').bind(cur).first();
    if (!row) return null;
    if (row.status !== 'merged' || !row.merged_into) return row;
    cur = row.merged_into;
  }
  return null;
}
// For endpoints that accept organisationId beside organisation: { ok, id } with id the active organisation (after
// following a merge) or null when none was given or 0013 is not applied; { ok: false, error } for an unknown or
// closed id. The caller always keeps the typed text.
export async function checkOrgId(env, raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, id: null };
  if (!(await orgsReady(env))) return { ok: true, id: null, skipped: true };
  const id = clip(raw, 40);
  const row = ID.test(id) ? await resolveOrg(env, id) : null;
  if (!row || row.status !== 'active') return { ok: false, error: 'That organisation is not on the list. Choose it again from the suggestions, or just type its name.' };
  return { ok: true, id: row.id, name: row.name };
}
const publicOrg = (o, parents = {}) => ({ id: o.id, name: o.name, kind: o.kind, kindLabel: KIND_LABEL[o.kind] || 'Other', country: o.country, parent: o.parent_id && parents[o.parent_id] ? { id: o.parent_id, name: parents[o.parent_id] } : null });
async function parentNames(env, rows) {
  const ids = [...new Set(rows.map((r) => r.parent_id).filter(Boolean))];
  if (!ids.length) return {};
  const { results = [] } = await env.DB.prepare(`SELECT id, name FROM organisations WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  return Object.fromEntries(results.map((r) => [r.id, r.name]));
}

// Matching: every word of the query must match the start of a word in the name or in one alias ("dar", "DVH" and
// "gravesham" all work). Exact and whole-phrase matches rank first.
export async function findOrganisations(env, q, { country = '', limit = MAX_RESULTS } = {}) {
  const qn = normOrg(q);
  const words = queryWords(q);
  if (qn.length < 2 || !words.length) return [];
  const where = words.map(() => "(' ' || m.n) LIKE ?").join(' AND ');
  const args = words.map((w) => `% ${w}%`);
  const cc = /^[A-Z]{2}$/.test(country) ? country : '';
  const { results = [] } = await env.DB.prepare(`SELECT o.id, o.name, o.kind, o.parent_id, o.country, m.n, m.alias FROM
      (SELECT id AS oid, name_norm AS n, NULL AS alias FROM organisations WHERE status = 'active' UNION ALL SELECT organisation_id, alias_norm, alias FROM organisation_aliases) m
      JOIN organisations o ON o.id = m.oid WHERE o.status = 'active'${cc ? ' AND o.country = ?' : ''} AND ${where} LIMIT 300`).bind(...(cc ? [cc] : []), ...args).all();
  const score = (n) => (n === qn ? 0 : n.startsWith(qn) ? 1 : (' ' + n).includes(' ' + qn) ? 2 : 3);
  const best = new Map();
  for (const r of results) {
    const s = score(r.n) + (r.alias ? 0.5 : 0);
    const cur = best.get(r.id);
    if (!cur || s < cur.s) best.set(r.id, { ...r, s });
  }
  const rows = [...best.values()].sort((a, b) => a.s - b.s || a.name.length - b.name.length || a.name.localeCompare(b.name)).slice(0, limit);
  const parents = await parentNames(env, rows);
  return rows.map((r) => ({ ...publicOrg(r, parents), matched: r.alias || null }));
}

async function searchRoute(env, url, ctx) {
  const q = clip(url.searchParams.get('q'), 100);
  const country = clip(url.searchParams.get('country'), 2).toUpperCase();
  const head = { 'Cache-Control': 'public, max-age=3600' };
  if (!(await orgsReady(env))) return json({ ok: true, available: false, results: [] });
  const qn = normOrg(q);
  if (qn.length < 2) return json({ ok: true, results: [], tooShort: true }, 200, head);
  // One edge-cache entry per normalised query, so "Darent", "darent" and "darent " share it.
  const cache = typeof caches !== 'undefined' && caches.default;
  const key = cache ? new Request(`https://organisations.cache.invalid/?q=${encodeURIComponent(qn)}&c=${country}`) : null;
  if (cache) { const hit = await cache.match(key).catch(() => null); if (hit) return hit; }
  const res = json({ ok: true, results: await findOrganisations(env, q, { country }) }, 200, head);
  if (cache) { const p = cache.put(key, res.clone()).catch(() => null); if (ctx && ctx.waitUntil) ctx.waitUntil(p); }
  return res;
}
async function oneRoute(env, id) {
  if (!(await orgsReady(env))) return json({ ok: false, available: false, error: 'Not found.' }, 404);
  const row = ID.test(id) ? await resolveOrg(env, id) : null;
  if (!row) return json({ ok: false, error: 'Not found.' }, 404);
  const parents = await parentNames(env, [row]);
  return json({ ok: true, organisation: { ...publicOrg(row, parents), status: row.status }, requested: id, mergedFrom: row.id !== id ? id : null }, 200, { 'Cache-Control': 'public, max-age=3600' });
}
async function requestRoute(env, l, d) {
  if (!(await orgsReady(env))) return json({ ok: false, available: false, error: 'This is not available yet. Type your organisation and carry on.' }, 503);
  const typed = clip(d && (d.name ?? d.typed), 160);
  const typedNorm = normOrg(typed);
  if (typedNorm.length < 2) return json({ ok: false, error: 'Type the name of your organisation.' }, 400);
  // A name that is already on the list is offered as a suggestion; the person still chooses it.
  const exact = await env.DB.prepare("SELECT o.id, o.name FROM organisations o WHERE o.status = 'active' AND (o.name_norm = ? OR o.id IN (SELECT organisation_id FROM organisation_aliases WHERE alias_norm = ?)) LIMIT 1").bind(typedNorm, typedNorm).first();
  const suggestion = exact ? { id: exact.id, name: exact.name } : null;
  const mine = await env.DB.prepare("SELECT id FROM organisation_requests WHERE learner_id = ? AND typed_norm = ? AND status = 'open'").bind(l.id, typedNorm).first();
  if (mine) return json({ ok: true, requestId: mine.id, suggestion, duplicate: true });
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM organisation_requests WHERE learner_id = ? AND status = 'open'").bind(l.id).first('n');
  if (open >= 10) return json({ ok: false, error: 'You have several organisations waiting to be added. We will look at those first.' }, 429);
  const r = await env.DB.prepare("INSERT INTO organisation_requests (typed, typed_norm, learner_id, status, created_at) VALUES (?,?,?,'open',?)").bind(typed, typedNorm, l.id, nowIso()).run();
  const id = r.meta && r.meta.last_row_id;
  await audit(env, { actorType: 'learner', actorId: l.id, action: 'organisation.request', subjectType: 'organisation_request', subjectId: id, meta: { request: id } });
  return json({ ok: true, requestId: id, suggestion });
}

// Router hook for worker/app.js. Returns null when the path is not an organisation route.
export async function handleOrganisations(env, req, url, p, l, ctx, readBody) {
  if (p !== 'organisations' && !p.startsWith('organisations/')) return null;
  if (req.method === 'GET') {
    if (p === 'organisations') return searchRoute(env, url, ctx);
    const id = decodeURIComponent(p.slice('organisations/'.length));
    return id && !id.includes('/') ? oneRoute(env, id) : json({ ok: false }, 404);
  }
  if (p === 'organisations/request') {
    if (!l || !l.password_hash) return json({ ok: false, error: 'Please log in again.', auth: false }, 401);
    return requestRoute(env, l, await readBody(req));
  }
  return json({ ok: false }, 404);
}

// ---------- Admin ----------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const BASE = '/volunteer/admin/organisations/';
const NAV = `<a class="text-link" href="/volunteer/admin/">Volunteers</a> · <a class="text-link" href="/volunteer/admin/academy/">Academy</a> · <a class="text-link" href="/volunteer/admin/supervisors/">Supervisor verification</a> · <a class="text-link" href="${BASE}">Organisations</a>`;
const STYLE = '<style>.og-form{display:grid;gap:8px;margin:8px 0;padding:10px;border:1px dashed #E4E0D7;border-radius:10px}.og-form label{display:grid;gap:4px;font-size:14px}.og-form button{justify-self:start;width:auto;min-height:0}.og-row{display:flex;flex-wrap:wrap;gap:6px 14px}.og-row label{display:inline-flex;flex-direction:row;gap:6px;align-items:center}.og-form input[type=checkbox],.og-form input[type=radio]{width:18px;height:18px;min-height:0;margin:0}.og-small{font-size:13px;color:#5B6878}</style>';
// With Cloudflare Access on, the admin's email is the actor and no typed name is needed.
const reviewerField = (access) => (access ? `<p class="og-small">Recorded as ${esc(access)}.</p>` : '<label>Your name (recorded with the decision)<input name="reviewer" autocomplete="name" maxlength="80" required></label>');
const form = (access, action, hidden, inner, button, confirmText) => `<form class="og-form" method="post"${confirmText ? ` onsubmit="return confirm(this.dataset.confirm)" data-confirm="${esc(confirmText)}"` : ''}><input type="hidden" name="action" value="${action}">${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}${inner}${reviewerField(access)}<button class="btn btn-ghost small" type="submit">${esc(button)}</button></form>`;
const kindSelect = (sel = 'hospital') => `<label>Kind<select name="kind">${KINDS.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(KIND_LABEL[k])}</option>`).join('')}</select></label>`;

// Free-text organisation values not yet linked to an id, grouped by normalised text.
async function legacyGroups(env) {
  const groups = new Map();
  const tables = [['learners', 'organisation'], ['professional_registrations', 'organisation'], ['directory_profiles', 'organisation']];
  for (const [t, c] of tables) {
    const { results = [] } = await env.DB.prepare(`SELECT ${c} AS v FROM ${t} WHERE organisation_id IS NULL AND ${c} IS NOT NULL AND TRIM(${c}) != '' LIMIT 3000`).all();
    for (const r of results) {
      const n = normOrg(r.v);
      if (n.length < 2) continue;
      const g = groups.get(n) || { norm: n, example: r.v, count: 0 };
      g.count++;
      groups.set(n, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.norm.localeCompare(b.norm)).slice(0, 100);
}

export async function organisationsAdminHtml(env, url, { access = '' } = {}) {
  if (!(await orgsReady(env))) return `${STYLE}<h2 class="display" style="font-size:34px;margin:0 0 8px">Organisations</h2><p class="admin-summary">Not available yet: apply migrations/0013_organisations.sql to the database first. ${NAV}</p>`;
  const m = url.searchParams.get('m') || '';
  const q = clip(url.searchParams.get('q'), 100);
  const note = m ? `<p class="form-note" style="font-weight:600">${esc(m)}</p>` : '';
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM organisations WHERE status = 'active'").first('n');

  // 1. Requests
  const { results: reqs = [] } = await env.DB.prepare("SELECT r.*, l.title, l.first_name, l.last_name FROM organisation_requests r LEFT JOIN learners l ON l.id = r.learner_id WHERE r.status = 'open' ORDER BY r.id LIMIT 100").all();
  const reqHtml = [];
  for (const r of reqs) {
    const sug = await findOrganisations(env, r.typed, { limit: 3 });
    const choices = sug.map((s, i) => `<label><input type="radio" name="org" value="${esc(s.id)}"${i === 0 ? ' checked' : ''}> ${esc(s.name)}${s.parent ? ` <span class="og-small">(${esc(s.parent.name)})</span>` : ''}</label>`).join('');
    reqHtml.push(`<div class="sv-card" style="background:#fff;border:1px solid #E4E0D7;border-radius:12px;padding:14px;margin:10px 0">
      <p><b>${esc(r.typed)}</b> <span class="og-small">request ${r.id}, ${esc(String(r.created_at).slice(0, 10))}${r.first_name ? `, from ${esc(fullName(r))}` : ''}</span></p>
      ${form(access, 'req_map', { request: r.id }, `<div class="og-row">${choices}</div><label>Or an organisation id<input name="org_id" maxlength="40" placeholder="wl-1"></label>`, 'Map to this organisation (adds the typed text as an alias)')}
      ${form(access, 'req_add', { request: r.id }, `<label>Name<input name="name" maxlength="160" value="${esc(r.typed)}" required></label>${kindSelect()}<label>Parent organisation id (optional, a hospital's trust)<input name="parent" maxlength="40"></label>`, 'Add as a new organisation')}
      ${form(access, 'req_dismiss', { request: r.id }, '', 'Dismiss', `Dismiss "${r.typed}"? It will not be added.`)}
    </div>`);
  }

  // 2. Legacy free text
  const legacy = await legacyGroups(env);
  const legacyRows = [];
  for (const g of legacy) {
    const sug = (await findOrganisations(env, g.norm, { limit: 1 }))[0];
    legacyRows.push(`<tr><td>${esc(g.example)}</td><td>${g.count}</td><td>${sug ? `<label class="og-row"><input type="checkbox" name="confirm" value="${esc(g.norm + '|' + sug.id)}"> ${esc(sug.name)} <span class="og-small">${esc(sug.id)}</span></label>` : '<span class="og-small">No suggestion</span>'}</td></tr>`);
  }
  const legacyHtml = legacy.length
    ? `<form class="og-form" method="post"><input type="hidden" name="action" value="legacy_confirm"><div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Typed text</th><th scope="col">Records</th><th scope="col">Suggested match (tick to confirm)</th></tr></thead><tbody>${legacyRows.join('')}</tbody></table></div>${reviewerField(access)}<button class="btn btn-ghost small" type="submit">Link the ticked matches</button></form>`
    : '<p class="admin-summary">Every typed organisation is linked, or none has been typed yet.</p>';

  // 3. Organisations: search, aliases, merge
  const found = q ? await adminFind(env, q) : ((await env.DB.prepare("SELECT * FROM organisations WHERE source = 'admin' OR status = 'merged' ORDER BY updated_at DESC LIMIT 30").all()).results || []);
  const orgCards = [];
  for (const o of found) {
    const { results: aliases = [] } = await env.DB.prepare('SELECT alias, alias_norm FROM organisation_aliases WHERE organisation_id = ? ORDER BY alias').bind(o.id).all();
    orgCards.push(`<div style="background:#fff;border:1px solid #E4E0D7;border-radius:12px;padding:14px;margin:10px 0">
      <p><b>${esc(o.name)}</b> <span class="og-small">${esc(o.id)} · ${esc(KIND_LABEL[o.kind] || o.kind)} · ${esc(o.status)}${o.merged_into ? ` into ${esc(o.merged_into)}` : ''}${o.parent_id ? ` · part of ${esc(o.parent_id)}` : ''}${o.ods_code ? ` · ODS ${esc(o.ods_code)}` : ''}</span></p>
      <p class="og-small">Aliases: ${aliases.length ? aliases.map((a) => esc(a.alias)).join(', ') : 'none'}</p>
      ${o.status === 'active' ? `${form(access, 'alias_add', { org: o.id }, '<label>New alias<input name="alias" maxlength="160" required></label>', 'Add alias')}
      ${aliases.length ? form(access, 'alias_remove', { org: o.id }, `<label>Alias to remove<select name="alias_norm">${aliases.map((a) => `<option value="${esc(a.alias_norm)}">${esc(a.alias)}</option>`).join('')}</select></label>`, 'Remove alias') : ''}
      ${form(access, 'merge', { from: o.id }, '<label>Merge into organisation id<input name="into" maxlength="40" required></label>', 'Merge', `Merge ${o.name} into another organisation? Its id keeps working and points to the other one.`)}` : ''}
    </div>`);
  }

  // 4. Security events from supervisor search
  const { results: sec = [] } = await env.DB.prepare("SELECT at, actor_id, action, meta FROM audit_events WHERE action LIKE 'search.%' ORDER BY id DESC LIMIT 50").all().catch(() => ({ results: [] }));

  return `${STYLE}<h2 class="display" style="font-size:34px;margin:0 0 8px">Organisations</h2>
  <p class="admin-summary">${total} organisations on the list. Typed text is always kept; an id is linked only when someone picks a suggestion or you confirm a match here. Nothing is deleted: a merge points the old id at the new one. ${NAV}</p>${note}
  <h3 style="margin:28px 0 10px">Not listed: requests (${reqs.length})</h3>${reqHtml.join('') || '<p class="admin-summary">No open requests.</p>'}
  <h3 style="margin:28px 0 10px">Typed organisations not yet linked</h3>${legacyHtml}
  <h3 style="margin:28px 0 10px">Find an organisation</h3>
  <form class="og-form" method="get" action="${BASE}"><label>Name, alias or id<input name="q" value="${esc(q)}" maxlength="100"></label><button class="btn btn-ghost small" type="submit">Search</button></form>
  ${q ? '' : '<p class="og-small">Showing organisations added by administrators and merged organisations.</p>'}${orgCards.join('') || '<p class="admin-summary">Nothing to show.</p>'}
  <h3 style="margin:28px 0 10px">Supervisor search: security events</h3>
  ${sec.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">Account</th><th scope="col">Event</th><th scope="col">Details</th></tr></thead><tbody>${sec.map((e) => `<tr><td>${esc(e.at)}</td><td>${esc(e.actor_id)}</td><td>${esc(e.action)}</td><td><small>${esc(e.meta)}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">None.</p>'}`;
}
// Admin search: an exact id, or the same matching as the autocomplete but including merged and closed organisations.
async function adminFind(env, q) {
  const byId = await env.DB.prepare('SELECT * FROM organisations WHERE id = ?').bind(q).first();
  if (byId) return [byId];
  const words = queryWords(q);
  if (!words.length) return [];
  const { results = [] } = await env.DB.prepare(`SELECT DISTINCT o.* FROM organisations o LEFT JOIN organisation_aliases a ON a.organisation_id = o.id WHERE ${words.map(() => "((' ' || o.name_norm) LIKE ? OR (' ' || COALESCE(a.alias_norm, '')) LIKE ?)").join(' AND ')} ORDER BY o.name LIMIT 30`).bind(...words.flatMap((w) => [`% ${w}%`, `% ${w}%`])).all();
  return results;
}

async function nextAdminId(env) {
  const max = await env.DB.prepare(`SELECT MAX(CAST(SUBSTR(id, 4) AS INTEGER)) AS n FROM organisations WHERE id LIKE 'wl-%' AND CAST(SUBSTR(id, 4) AS INTEGER) >= ${ADMIN_FIRST}`).first('n');
  return `wl-${Math.max(ADMIN_FIRST - 1, Number(max) || 0) + 1}`;
}
const aliasStmt = (env, orgId, alias) => env.DB.prepare('INSERT OR IGNORE INTO organisation_aliases (organisation_id, alias, alias_norm, created_at) VALUES (?,?,?,?)').bind(orgId, clip(alias, 160), normOrg(alias), nowIso());

// Links free text to an organisation in each table, for rows whose text normalises to `norm` and have no id yet.
async function linkTextStmts(env, norm, orgId, onlyLearner = null) {
  const stmts = [];
  let count = 0;
  for (const t of ['learners', 'professional_registrations', 'directory_profiles']) {
    const key = t === 'learners' ? 'id' : t === 'directory_profiles' ? 'learner_id' : 'id';
    const filter = onlyLearner ? ` AND ${t === 'learners' ? 'id' : 'learner_id'} = ?` : '';
    const { results = [] } = await env.DB.prepare(`SELECT ${key} AS k, organisation AS v FROM ${t} WHERE organisation_id IS NULL AND organisation IS NOT NULL${filter} LIMIT 3000`).bind(...(onlyLearner ? [onlyLearner] : [])).all();
    for (const r of results) if (normOrg(r.v) === norm) { stmts.push(env.DB.prepare(`UPDATE ${t} SET organisation_id = ? WHERE ${key} = ? AND organisation_id IS NULL`).bind(orgId, r.k)); count++; }
  }
  return { stmts, count };
}

// Returns { m, q } for the redirect.
export async function organisationsAdminPost(env, f, admin = 'admin', { access = '' } = {}) {
  if (!(await orgsReady(env))) return { m: 'Apply migration 0013 first.' };
  const action = String(f.get('action') || '');
  const reviewer = clip(f.get('reviewer'), 80);
  if (!access && !reviewer) return { m: 'Enter your name: every decision records who made it.' };
  const actorId = access || `${clip(admin, 40)}:${reviewer}`;
  const decidedBy = access ? `admin:${access}` : `admin:${clip(admin, 40)}:${reviewer}`;
  const adminAudit = (e) => auditStmt(env, { actorType: 'admin', actorId, ...e });
  const at = nowIso();

  if (action.startsWith('req_')) {
    const r = await env.DB.prepare("SELECT * FROM organisation_requests WHERE id = ? AND status = 'open'").bind(Number(f.get('request'))).first();
    if (!r) return { m: 'That request has already been decided.' };
    if (action === 'req_dismiss') {
      await env.DB.batch([
        env.DB.prepare("UPDATE organisation_requests SET status = 'dismissed', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'open'").bind(decidedBy, at, r.id),
        adminAudit({ action: 'organisation.request_dismiss', subjectType: 'organisation_request', subjectId: r.id, meta: { request: r.id } }),
      ]);
      return { m: 'Request dismissed.' };
    }
    let org;
    const stmts = [];
    if (action === 'req_map') {
      org = await resolveOrg(env, clip(f.get('org_id'), 40) || clip(f.get('org'), 40));
      if (!org || org.status !== 'active') return { m: 'Choose an organisation on the list (or give its id).' };
      if (normOrg(org.name) !== r.typed_norm) stmts.push(aliasStmt(env, org.id, r.typed));
    } else if (action === 'req_add') {
      const name = clip(f.get('name'), 160);
      const kind = KINDS.includes(String(f.get('kind'))) ? String(f.get('kind')) : 'other';
      const parentId = clip(f.get('parent'), 40);
      const parent = parentId ? await resolveOrg(env, parentId) : null;
      if (normOrg(name).length < 2) return { m: 'Enter the organisation name.' };
      if (parentId && (!parent || parent.status !== 'active')) return { m: 'The parent organisation id was not found.' };
      const dupe = await env.DB.prepare("SELECT id FROM organisations WHERE name_norm = ? AND status = 'active'").bind(normOrg(name)).first();
      if (dupe) return { m: `${name} is already on the list (${dupe.id}). Map the request to it instead.` };
      org = { id: await nextAdminId(env), name };
      stmts.push(env.DB.prepare("INSERT INTO organisations (id, name, name_norm, kind, parent_id, country, status, source, created_at, updated_at) VALUES (?,?,?,?,?,'GB','active','admin',?,?)").bind(org.id, name, normOrg(name), kind, parent ? parent.id : null, at, at));
      if (normOrg(name) !== r.typed_norm) stmts.push(aliasStmt(env, org.id, r.typed));
    } else return { m: 'Unknown action.' };
    const status = action === 'req_map' ? 'mapped' : 'added';
    // The requester's own typed text gains the id; nobody else's record changes here.
    const link = r.learner_id ? await linkTextStmts(env, r.typed_norm, org.id, r.learner_id) : { stmts: [], count: 0 };
    stmts.push(
      env.DB.prepare('UPDATE organisation_requests SET status = ?, organisation_id = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = ?').bind(status, org.id, decidedBy, at, r.id, 'open'),
      ...link.stmts,
      adminAudit({ action: `organisation.request_${status === 'mapped' ? 'map' : 'add'}`, subjectType: 'organisation', subjectId: org.id, meta: { request: r.id, organisation: org.id, count: link.count, aliasAdded: normOrg(org.name) !== r.typed_norm } }),
    );
    await env.DB.batch(stmts);
    return { m: status === 'mapped' ? `Mapped to ${org.name}.` : `Added ${org.name} (${org.id}).`, q: org.id };
  }

  if (action === 'alias_add' || action === 'alias_remove') {
    const org = await env.DB.prepare("SELECT * FROM organisations WHERE id = ? AND status = 'active'").bind(clip(f.get('org'), 40)).first();
    if (!org) return { m: 'Organisation not found.' };
    if (action === 'alias_add') {
      const alias = clip(f.get('alias'), 160);
      if (normOrg(alias).length < 2) return { m: 'Enter the alias.', q: org.id };
      await env.DB.batch([aliasStmt(env, org.id, alias), env.DB.prepare('UPDATE organisations SET updated_at = ? WHERE id = ?').bind(at, org.id), adminAudit({ action: 'organisation.alias_add', subjectType: 'organisation', subjectId: org.id, meta: { organisation: org.id, alias } })]);
      return { m: 'Alias added.', q: org.id };
    }
    const norm = clip(f.get('alias_norm'), 200);
    const row = await env.DB.prepare('SELECT alias FROM organisation_aliases WHERE organisation_id = ? AND alias_norm = ?').bind(org.id, norm).first();
    if (!row) return { m: 'Alias not found.', q: org.id };
    await env.DB.batch([env.DB.prepare('DELETE FROM organisation_aliases WHERE organisation_id = ? AND alias_norm = ?').bind(org.id, norm), env.DB.prepare('UPDATE organisations SET updated_at = ? WHERE id = ?').bind(at, org.id), adminAudit({ action: 'organisation.alias_remove', subjectType: 'organisation', subjectId: org.id, meta: { organisation: org.id, alias: row.alias } })]);
    return { m: 'Alias removed.', q: org.id };
  }

  if (action === 'merge') {
    const from = await env.DB.prepare("SELECT * FROM organisations WHERE id = ? AND status = 'active'").bind(clip(f.get('from'), 40)).first();
    const into = await resolveOrg(env, clip(f.get('into'), 40));
    if (!from) return { m: 'Organisation not found, or already merged.' };
    if (!into || into.status !== 'active') return { m: 'The organisation to merge into was not found.', q: from.id };
    if (into.id === from.id) return { m: 'An organisation cannot be merged into itself.', q: from.id };
    // Nothing is deleted. The old name and its aliases become aliases of the organisation it is merged into, so
    // people searching the old name still find it; hospital sites under it move to the new parent.
    const { results: aliases = [] } = await env.DB.prepare('SELECT alias FROM organisation_aliases WHERE organisation_id = ?').bind(from.id).all();
    await env.DB.batch([
      env.DB.prepare("UPDATE organisations SET status = 'merged', merged_into = ?, updated_at = ? WHERE id = ? AND status = 'active'").bind(into.id, at, from.id),
      env.DB.prepare('UPDATE organisations SET parent_id = ?, updated_at = ? WHERE parent_id = ?').bind(into.id, at, from.id),
      aliasStmt(env, into.id, from.name),
      ...aliases.map((a) => aliasStmt(env, into.id, a.alias)),
      env.DB.prepare('UPDATE organisations SET updated_at = ? WHERE id = ?').bind(at, into.id),
      adminAudit({ action: 'organisation.merge', subjectType: 'organisation', subjectId: from.id, meta: { organisation: from.id, into: into.id } }),
    ]);
    return { m: `Merged ${from.name} into ${into.name}.`, q: into.id };
  }

  if (action === 'legacy_confirm') {
    let linked = 0, groups = 0;
    for (const v of f.getAll('confirm').map(String).slice(0, 100)) {
      const [norm, id] = v.split('|');
      const org = await resolveOrg(env, clip(id, 40));
      if (!norm || !org || org.status !== 'active') continue;
      const link = await linkTextStmts(env, normOrg(norm), org.id);
      const stmts = [...link.stmts];
      if (normOrg(org.name) !== norm) stmts.push(aliasStmt(env, org.id, norm));
      stmts.push(adminAudit({ action: 'organisation.legacy_link', subjectType: 'organisation', subjectId: org.id, meta: { organisation: org.id, count: link.count } }));
      await env.DB.batch(stmts);
      linked += link.count; groups++;
    }
    return { m: groups ? `Linked ${linked} ${linked === 1 ? 'record' : 'records'} in ${groups} ${groups === 1 ? 'group' : 'groups'}.` : 'Tick at least one match.' };
  }
  return { m: 'Unknown action.' };
}

// checkOrgId for an optional field: { ok, id, given }. given is false when no organisationId was sent, or before 0013.
export async function orgField(env, raw) {
  if (raw === undefined) return { ok: true, id: null, given: false };
  const r = await checkOrgId(env, raw);
  return { ...r, given: r.ok && !r.skipped };
}
// Saves organisation_id on one row beside its typed text (registrations, directory profiles). With no organisationId
// sent, a changed typed text clears the old id, so an id never sits beside text it does not describe.
const ORG_TABLES = { professional_registrations: 'id', directory_profiles: 'learner_id' };
export async function saveOrgId(env, table, keyValue, org, typed, oldTyped) {
  const key = ORG_TABLES[table];
  if (!key || !(await orgsReady(env))) return;
  if (org && org.given) await env.DB.prepare(`UPDATE ${table} SET organisation_id = ? WHERE ${key} = ?`).bind(org.id, keyValue).run();
  else if (typed !== undefined && normOrg(typed) !== normOrg(oldTyped)) await env.DB.prepare(`UPDATE ${table} SET organisation_id = NULL WHERE ${key} = ?`).bind(keyValue).run();
}
