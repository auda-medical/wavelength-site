// Supervisor search (plan section 20). Behind SUPERVISOR_SEARCH = "true" (off by default) and migrations 0012 and
// 0013. Routes under /api/app/ (logged in):
//   GET  supervisors/search?q=&org=      verified email; q of 3+ characters, or an org id and 2+ characters; up to 8
//   POST supervisors/request { ref }      ask a supervisor found in search; 5 a day; the supervisor accepts on their
//                                         dashboard exactly as for an email invitation
//   POST supervisor/searchable { on, rotate }   a supervisor opts in (only with a current approval) or out (always)
//
// Who can be found: only people who, at the moment of the search, hold a current Wavelength approval
// (supervisorEligibility, forced on even when SUPERVISOR_APPROVAL_REQUIRED is off), have opted in, are not test or
// review accounts and have no active block. The query starts from supervisor_approvals, never from learners, so there
// is no code path that lists ordinary accounts. Results never carry an email address or an account id: `ref` is a
// random 16-character value per supervisor, created on opt-in, replaced on rotation and cleared on opt-out.
// Anti-scraping: login and a verified email, 20 searches a minute per account and per IP, 200 a day per account
// (hitting it writes a security audit event), at most 8 results, no paging, no organisation-only listing.
// Search terms are never stored: only counts per account per day (search_counts).
import { json, clip, fullName, profileOf, lifecycleReady } from './app-util.js';
import { supervisorEligibility, NEUTRAL_REFUSAL } from './supervisor-lifecycle.js';
import { orgsReady, resolveOrg } from './organisations.js';
import { normOrg, queryWords } from './org-norm.js';
import { rateLimitAll, clientIp, ipKey, TOO_MANY } from './ratelimit.js';
import { queueStmt, deliverLater } from './notify.js';
import { audit, auditStmt } from './audit.js';
import { ukDate, addDays, nowIso } from './time.js';
import { GRACE_DAYS } from './professional.js';

export const searchOn = (env) => env.SUPERVISOR_SEARCH === 'true';
export const DAILY_SEARCHES = 200;
export const DAILY_REQUESTS = 5;
export const MAX_RESULTS = 8;
const CANDIDATES = 50;
const MAX_LINKS = 10;
export const BADGE = 'Wavelength Verified Supervisor';
const REF = /^[A-Za-z0-9]{16}$/;
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const NOT_AVAILABLE = 'This supervisor is not available. Search again, or invite your supervisor by email.';
const OFF = { ok: false, available: false, error: 'Supervisor search is not available yet. Invite your supervisor by email instead.' };

export function newRef() {
  const r = crypto.getRandomValues(new Uint8Array(16));
  return [...r].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}
async function ready(env) { return searchOn(env) && (await lifecycleReady(env)) && (await orgsReady(env)); }
const nameExpr = "(' ' || REPLACE(REPLACE(LOWER(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), '''', ''), '-', ' '))";
const orgExpr = "(' ' || REPLACE(REPLACE(LOWER(COALESCE(l.organisation, '') || ' ' || COALESCE(o.name, '')), '''', ''), '-', ' '))";

async function count(env, id, col) {
  return Number(await env.DB.prepare(`SELECT ${col} AS n FROM search_counts WHERE learner_id = ? AND day = ?`).bind(id, ukDate()).first('n')) || 0;
}
const bumpStmt = (env, id, col) => env.DB.prepare(`INSERT INTO search_counts (learner_id, day, ${col}) VALUES (?, ?, 1) ON CONFLICT (learner_id, day) DO UPDATE SET ${col} = ${col} + 1`).bind(id, ukDate());

// What a learner sees for one supervisor. Never an email address or an account id.
async function resultFor(env, row, el) {
  const p = profileOf(row);
  return { ref: row.ref, name: fullName(row), role: row.role || p.grade || '', specialty: p.specialty || '', organisation: row.org_name || row.organisation || '', badge: BADGE, areas: el.areas || [] };
}
// Eligible now, with the reasons checked on the server. Every candidate goes through this.
async function eligibleNow(env, id) {
  const el = await supervisorEligibility(env, id, { force: true });
  return el.enforced && el.ok ? el : null;
}

export async function search(env, l, req, url) {
  if (!(await ready(env))) return json(OFF, 503);
  if (l.email_status !== 'verified') return json({ ok: false, needVerify: true, error: 'Confirm your email address to search for supervisors.' }, 403);
  const q = clip(url.searchParams.get('q'), 100);
  const qn = normOrg(q);
  const words = queryWords(q).filter((w) => w.length >= 1);
  const orgRaw = clip(url.searchParams.get('org'), 40);
  const org = orgRaw ? await resolveOrg(env, orgRaw) : null;
  if (orgRaw && (!org || org.status !== 'active')) return json({ ok: false, error: 'Choose the organisation again from the list.' }, 400);
  const min = org ? 2 : 3;
  if (qn.replace(/ /g, '').length < min) return json({ ok: false, tooShort: true, error: org ? 'Type at least 2 letters of their name.' : 'Type at least 3 letters of their name.' }, 400);

  const rl = await rateLimitAll(env, 'search', [`acct:${l.id}`, await ipKey(clientIp(req))], { binding: 'RATE_LIMIT_SEARCH' });
  if (!rl.ok) return json({ ok: false, error: TOO_MANY }, 429, { 'Retry-After': '60' });
  // The daily cap is counted before searching, so refused attempts count too.
  const n = await env.DB.prepare('INSERT INTO search_counts (learner_id, day, searches) VALUES (?, ?, 1) ON CONFLICT (learner_id, day) DO UPDATE SET searches = searches + 1 RETURNING searches AS n').bind(l.id, ukDate()).first('n');
  if (Number(n) > DAILY_SEARCHES) {
    if (Number(n) === DAILY_SEARCHES + 1) await audit(env, { actorType: 'learner', actorId: l.id, action: 'search.daily_cap', subjectType: 'learner', subjectId: l.id, meta: { limit: DAILY_SEARCHES, day: ukDate() } });
    return json({ ok: false, limit: true, error: "You have reached today's search limit. Try again tomorrow, or invite your supervisor by email." }, 429);
  }

  const today = ukDate();
  const conds = [
    "a.status = 'approved'", '(a.review_on IS NULL OR a.review_on >= ?)',
    'l.supervisor_searchable = 1', 'l.test_account = 0', 'l.supervisor_public_ref IS NOT NULL', "l.email_status = 'verified'", 'l.password_hash IS NOT NULL', 'l.id != ?',
    'NOT EXISTS (SELECT 1 FROM supervisor_blocks b WHERE b.learner_id = l.id AND b.lifted_at IS NULL)',
    // At least one word must match the person's name: no organisation-only listing.
    `(${words.map(() => `${nameExpr} LIKE ?`).join(' OR ')})`,
    ...words.map(() => `(${nameExpr} LIKE ? OR ${orgExpr} LIKE ?)`),
  ];
  const args = [addDays(today, -GRACE_DAYS), l.id, ...words.map((w) => `% ${w}%`), ...words.flatMap((w) => [`% ${w}%`, `% ${w}%`])];
  if (org) { conds.push('l.organisation_id IN (SELECT id FROM organisations WHERE id = ? OR merged_into = ?)'); args.push(org.id, org.id); }
  const { results = [] } = await env.DB.prepare(`SELECT DISTINCT l.id, l.title, l.first_name, l.last_name, l.role, l.profile, l.organisation, l.supervisor_public_ref AS ref, o.name AS org_name
    FROM supervisor_approvals a JOIN learners l ON l.id = a.learner_id LEFT JOIN organisations o ON o.id = l.organisation_id
    WHERE ${conds.join(' AND ')} ORDER BY l.last_name, l.first_name, l.id LIMIT ${CANDIDATES}`).bind(...args).all();
  const out = [];
  for (const r of results) {
    if (out.length >= MAX_RESULTS) break;
    const el = await eligibleNow(env, r.id);
    if (el) out.push(await resultFor(env, r, el));
  }
  return json({ ok: true, results: out });
}

export async function requestSupervisor(env, l, d, ctx) {
  if (!(await ready(env))) return json(OFF, 503);
  if (l.email_status !== 'verified') return json({ ok: false, needVerify: true, error: 'Confirm your email address first.' }, 403);
  const ref = clip(d && d.ref, 40);
  if (!REF.test(ref)) return json({ ok: false, error: NOT_AVAILABLE }, 404);
  if ((await count(env, l.id, 'requests')) >= DAILY_REQUESTS) return json({ ok: false, limit: true, error: `You can send ${DAILY_REQUESTS} supervision requests a day. Try again tomorrow.` }, 429);
  const sup = await env.DB.prepare("SELECT id, email, title, first_name, last_name FROM learners WHERE supervisor_public_ref = ? AND supervisor_searchable = 1 AND test_account = 0 AND password_hash IS NOT NULL AND email_status = 'verified'").bind(ref).first();
  if (!sup || sup.id === l.id) return json({ ok: false, error: NOT_AVAILABLE }, 404);
  const block = await env.DB.prepare('SELECT id FROM supervisor_blocks WHERE learner_id = ? AND lifted_at IS NULL').bind(sup.id).first();
  if (block || !(await eligibleNow(env, sup.id))) return json({ ok: false, error: NOT_AVAILABLE }, 404);
  const email = String(sup.email).toLowerCase();
  const prev = await env.DB.prepare("SELECT id, status FROM supervisor_links WHERE learner_id = ? AND (supervisor_id = ? OR supervisor_email = ?) AND status != 'ended' ORDER BY id DESC LIMIT 1").bind(l.id, sup.id, email).first();
  if (prev && prev.status === 'active') return json({ ok: false, duplicate: true, error: 'This supervisor is already linked to you.' }, 409);
  if (prev) return json({ ok: false, duplicate: true, error: 'You have already asked this supervisor. They will see your request on their dashboard.' }, 409);
  const links = await env.DB.prepare("SELECT COUNT(*) AS n FROM supervisor_links WHERE learner_id = ? AND status != 'ended'").bind(l.id).first('n');
  if (links >= MAX_LINKS) return json({ ok: false, error: 'You can link up to 10 supervisors. Remove one first.' }, 400);
  // The supervisor's address is stored on the link (so they can accept it as they would an email invitation) but is
  // never shown to the learner: supervisorLinks hides it for links made through search.
  await env.DB.prepare(`INSERT INTO supervisor_links (learner_id, supervisor_email, supervisor_id, status, via) VALUES (?,?,?,'pending','search')
    ON CONFLICT (learner_id, supervisor_email) DO UPDATE SET status = 'pending', supervisor_id = excluded.supervisor_id, via = 'search', ended_at = NULL, ended_reason = NULL, ended_by = NULL, claimed_at = NULL, accepted_at = NULL, invite_hash = NULL, invite_expires = NULL, created_at = datetime('now')
    WHERE supervisor_links.status = 'ended'`).bind(l.id, email, sup.id).run();
  const link = await env.DB.prepare("SELECT id, status, via FROM supervisor_links WHERE learner_id = ? AND supervisor_email = ?").bind(l.id, email).first();
  if (!link || link.status !== 'pending' || link.via !== 'search') return json({ ok: false, duplicate: true, error: 'You have already asked this supervisor.' }, 409);
  const key = `search_request:${link.id}:${nowIso().slice(0, 16)}`;
  await env.DB.batch([
    bumpStmt(env, l.id, 'requests'),
    queueStmt(env, { key, learnerId: sup.id, kind: 'search_request', to: sup.email, toName: fullName(sup), data: { firstName: sup.first_name, learner: fullName(l) } }),
    auditStmt(env, { actorType: 'learner', actorId: l.id, action: 'search.request', subjectType: 'link', subjectId: link.id, meta: { via: 'search' } }),
  ]);
  deliverLater(env, ctx, [key]);
  return json({ ok: true, link: { id: link.id, name: fullName(sup), state: 'invited', via: 'search' } });
}

// What a supervisor would look like in search: shown on the opt-in screen so they see exactly what will appear.
export async function searchPreview(env, l) {
  const el = await eligibleNow(env, l.id);
  const row = await env.DB.prepare('SELECT l.id, l.title, l.first_name, l.last_name, l.role, l.profile, l.organisation, NULL AS ref, o.name AS org_name FROM learners l LEFT JOIN organisations o ON o.id = l.organisation_id WHERE l.id = ?').bind(l.id).first();
  if (!row) return null;
  const r = await resultFor(env, row, el || { areas: [] });
  delete r.ref;
  return r;
}

export async function setSearchable(env, l, d) {
  if (!(await lifecycleReady(env))) return json(OFF, 503);
  const on = !!(d && d.on);
  if (!on) {
    // Switching off always works, at once, and the old reference stops working.
    await env.DB.batch([
      env.DB.prepare('UPDATE learners SET supervisor_searchable = 0, searchable_at = NULL, supervisor_public_ref = NULL WHERE id = ?').bind(l.id),
      auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'supervisor.searchable', subjectType: 'learner', subjectId: l.id, meta: { searchable: false } }),
    ]);
    return json({ ok: true, searchable: false, searchableAt: null });
  }
  if (!(await ready(env))) return json(OFF, 503);
  const block = await env.DB.prepare('SELECT id FROM supervisor_blocks WHERE learner_id = ? AND lifted_at IS NULL AND one_off_permitted = 0').bind(l.id).first();
  if (block) return json({ ok: false, error: NEUTRAL_REFUSAL }, 403);
  if (!(await eligibleNow(env, l.id))) return json({ ok: false, error: 'Only a current Wavelength Verified Supervisor can be found in search. Your approval, registration and email all need to be current.' }, 403);
  const cur = await env.DB.prepare('SELECT supervisor_searchable, searchable_at, supervisor_public_ref FROM learners WHERE id = ?').bind(l.id).first();
  const rotate = !!(d && d.rotate) || !cur.supervisor_public_ref;
  const at = cur.supervisor_searchable && cur.searchable_at ? cur.searchable_at : nowIso();
  for (let i = 0; i < 3; i++) {
    const ref = rotate ? newRef() : cur.supervisor_public_ref;
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE learners SET supervisor_searchable = 1, searchable_at = ?, supervisor_public_ref = ? WHERE id = ?').bind(at, ref, l.id),
        // Consent to be found is recorded with its time (lawful basis: consent).
        auditStmt(env, { actorType: 'supervisor', actorId: l.id, action: 'supervisor.searchable', subjectType: 'learner', subjectId: l.id, meta: { searchable: true, rotated: rotate } }),
      ]);
      return json({ ok: true, searchable: true, searchableAt: at, preview: await searchPreview(env, l) });
    } catch { if (!rotate) break; /* a reference collision: try another */ }
  }
  return json({ ok: false, error: 'Something went wrong. Please try again.' }, 500);
}

// Router hook for worker/app.js (logged-in routes). Returns null when the path is not a search route.
export async function handleSearch(env, l, req, url, p, ctx, readBody) {
  if (req.method === 'GET' && p === 'supervisors/search') return search(env, l, req, url);
  if (req.method === 'POST' && p === 'supervisors/request') return requestSupervisor(env, l, await readBody(req), ctx);
  if (req.method === 'POST' && p === 'supervisor/searchable') return setSearchable(env, l, await readBody(req));
  return null;
}
