// Supervisor directories: read an authorised source into plain entries, check the result is plausible, and compare it
// with the previous snapshot without ever creating a second person for a spelling change or a move of hospital.
// Pure functions (tested in Node with synthetic fixtures). No real directory is read until the body gives written
// permission (docs/source-monitoring/permissions.md): run.js refuses unless the source is authorised.
//
// Entry: { key, name, organisation, roles: [{ role, module }], accredited_on, status: 'listed'|'removed',
//          first_seen, last_seen, removed_on }
// Only what supervision needs: name, organisation, role and module, the accreditation date. Never emails, phone
// numbers or anything else a page may show.

export const norm = (s) => String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/^\s*(dr|prof|professor|mr|mrs|ms|miss|mx)\.?\s+/, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ORG_NOISE = new Set(['nhs', 'the', 'and', 'of', 'foundation', 'trust', 'university', 'hospital', 'hospitals', 'teaching', 'health', 'board', 'healthcare', 'ft', 'uhb', 'general']);
export const orgNorm = (s) => norm(s).split(' ').filter((w) => w && !ORG_NOISE.has(w)).join(' ');
const roleKey = (r) => `${r.role}|${r.module}`;
const uniqRoles = (roles) => { const m = new Map(); for (const r of roles || []) if (r && r.role && r.module) m.set(roleKey(r), { role: String(r.role).toLowerCase(), module: String(r.module).toLowerCase() }); return [...m.values()].sort((a, b) => roleKey(a).localeCompare(roleKey(b))); };

// Small edit distance (names that differ by a typo: "Jonathon" and "Jonathan").
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const similarName = (a, b) => { const x = norm(a), y = norm(b); return x === y || (x.length > 5 && editDistance(x, y, 2) <= 2); };

// ---------- Adapters: source body to entries ----------
// feed_json / fixture: the structured feed Wavelength asks each body for (docs/source-monitoring/feed-format.md):
// { entries: [{ id?, name, organisation, roles: [{ role, module }] | modules: [], role?, accredited_on? }] }
export function parseFeed(text) {
  let d; try { d = JSON.parse(text); } catch { return { ok: false, error: 'not JSON' }; }
  const list = Array.isArray(d) ? d : d && Array.isArray(d.entries) ? d.entries : null;
  if (!list) return { ok: false, error: 'no entries array' };
  return { ok: true, entries: list.map((e) => ({ sourceId: e.id != null ? String(e.id) : null, name: String(e.name || '').trim(), organisation: String(e.organisation || e.hospital || '').trim(), roles: uniqRoles(e.roles || (e.modules || []).map((m) => ({ role: e.role || 'supervisor', module: m }))), accredited_on: /^\d{4}-\d{2}-\d{2}$/.test(e.accredited_on || '') ? e.accredited_on : null })) };
}
// famus_html: the SAM directory table (Name, Position, Trust/Hospital, one column per module, Date accredited,
// Contact). Columns are found by their headings, so a reordered table still reads; a missing heading is a format
// change. Contact details are never read.
const FAMUS_MODULES = { thoracic: 'famus-thoracic', 'abdo/renal': 'famus-abdo', 'abdo renal': 'famus-abdo', dvt: 'famus-dvt', 'us assisted lp': 'famus-lp', 'ultrasound assisted lp': 'famus-lp' };
export function parseFamusHtml(html) {
  const tables = String(html || '').match(/<table\b[\s\S]*?<\/table>/gi) || [];
  const cell = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  for (const t of tables) {
    const rows = t.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    if (!rows.length) continue;
    const head = (rows[0].match(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi) || []).map((c) => cell(c).toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const iName = col(/^name$/), iOrg = col(/trust|hospital/), iDate = col(/date/);
    const mods = head.map((h, i) => [i, FAMUS_MODULES[h.replace(/\s+/g, ' ')]]).filter(([, m]) => m);
    if (iName < 0 || iOrg < 0 || !mods.length) continue;
    const entries = [];
    for (const r of rows.slice(1)) {
      const cells = r.match(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi) || [];
      if (cells.length < head.length) continue;
      const ticked = (c) => /✓|✔|\byes\b|\bx\b|checked|tick/i.test(c) && !/\bno\b/i.test(cell(c));
      entries.push({ sourceId: null, name: cell(cells[iName]), organisation: cell(cells[iOrg]), roles: uniqRoles(mods.filter(([i]) => ticked(cells[i])).map(([, m]) => ({ role: 'supervisor', module: m }))), accredited_on: iDate >= 0 ? toIso(cell(cells[iDate])) : null });
    }
    return { ok: true, entries };
  }
  return { ok: false, error: 'directory table not found (headings Name, Trust/Hospital and module columns)' };
}
const toIso = (s) => { const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
export function parseDirectory(adapter, text) {
  if (adapter === 'famus_html') return parseFamusHtml(text);
  if (adapter === 'feed_json' || adapter === 'fixture') return parseFeed(text);
  return { ok: false, error: `no adapter ${adapter}` };
}

// ---------- Validation: never let an outage, an empty page or a redesign remove everyone ----------
// o.acceptDrop: an administrator checked the source and confirmed a large fall is real (admin 'accept_drop', with a
// recorded reason). It lifts the 30% rule only: an empty or unreadable list is still refused.
export function validate(entries, previous = [], o = {}) {
  const listed = previous.filter((e) => e.status !== 'removed').length;
  const bad = entries.filter((e) => !e.name || e.name.length < 3 || !e.roles.length);
  if (!entries.length) return { ok: false, reason: 'empty', message: 'The source returned no entries. Kept the previous directory: an empty list is never read as everyone being removed.' };
  if (bad.length > entries.length * 0.1) return { ok: false, reason: 'format', message: `${bad.length} of ${entries.length} entries have no name or no module: the source format may have changed. Kept the previous directory.` };
  if (!o.acceptDrop && listed >= 20 && entries.length < listed * 0.7) return { ok: false, reason: 'drop', message: `The source lists ${entries.length} people against ${listed} before (a fall of more than 30%). Kept the previous directory until an administrator checks the source and accepts the fall.` };
  return { ok: true };
}

// ---------- Sync: previous snapshot + validated entries -> next snapshot and events ----------
// Matching, in order: the source's own id; the same name and organisation; the same name alone (moved hospital,
// only when it is unique on both sides); a similar name at the same organisation (corrected spelling, only when
// unique). Two people with the same name are told apart by organisation; anything left uncertain is an
// 'ambiguous' event for review, never a merge. Removed people are kept, marked removed, and can be relisted.
export function sync(previous, incoming, day) {
  const prev = previous.map((e) => ({ ...e, roles: uniqRoles(e.roles) }));
  const inc = incoming.map((e) => ({ ...e, roles: uniqRoles(e.roles) }));
  const used = new Set(), matched = new Map(), events = [];
  const take = (pi, ii, how) => { used.add(pi); matched.set(ii, { pi, how }); };
  const byId = new Map(prev.map((e, i) => [e.sourceId, i]).filter(([k]) => k));
  inc.forEach((e, ii) => { if (e.sourceId && byId.has(e.sourceId)) take(byId.get(e.sourceId), ii, 'id'); });
  const free = (pred) => prev.map((e, i) => [e, i]).filter(([e, i]) => !used.has(i) && pred(e));
  inc.forEach((e, ii) => { if (matched.has(ii)) return; const c = free((p) => norm(p.name) === norm(e.name) && orgNorm(p.organisation) === orgNorm(e.organisation)); if (c.length) take(c[0][1], ii, 'exact'); });
  inc.forEach((e, ii) => {
    if (matched.has(ii)) return;
    const c = free((p) => norm(p.name) === norm(e.name));
    const sameIncoming = inc.filter((x, j) => !matched.has(j) && norm(x.name) === norm(e.name)).length;
    if (c.length === 1 && sameIncoming === 1) take(c[0][1], ii, 'moved');
    else if (c.length > 1 || (c.length === 1 && sameIncoming > 1)) events.push({ key: null, kind: 'ambiguous', before: c.map(([p]) => ({ key: p.key, name: p.name, organisation: p.organisation })), after: { name: e.name, organisation: e.organisation }, review: true });
  });
  inc.forEach((e, ii) => {
    if (matched.has(ii)) return;
    const c = free((p) => orgNorm(p.organisation) === orgNorm(e.organisation) && similarName(p.name, e.name));
    if (c.length === 1) take(c[0][1], ii, 'renamed');
  });
  const keys = new Set(prev.map((e) => e.key));
  const newKey = (e) => { const base = e.sourceId ? `id:${e.sourceId}` : `n:${norm(e.name)}|${orgNorm(e.organisation)}`; let k = base, n = 2; while (keys.has(k)) k = `${base}#${n++}`; keys.add(k); return k; };
  const next = [];
  inc.forEach((e, ii) => {
    const m = matched.get(ii);
    if (!m) {
      const entry = { key: newKey(e), sourceId: e.sourceId || null, name: e.name, organisation: e.organisation, roles: e.roles, accredited_on: e.accredited_on || null, status: 'listed', first_seen: day, last_seen: day, removed_on: null };
      next.push(entry);
      events.push({ key: entry.key, kind: 'added', after: pick(entry) });
      return;
    }
    const p = prev[m.pi];
    const entry = { ...p, sourceId: e.sourceId || p.sourceId || null, name: e.name, organisation: e.organisation, roles: e.roles, accredited_on: e.accredited_on || p.accredited_on || null, status: 'listed', last_seen: day, removed_on: null };
    next.push(entry);
    if (p.status === 'removed') events.push({ key: p.key, kind: 'relisted', before: pick(p), after: pick(entry) });
    if (norm(p.name) !== norm(e.name)) events.push({ key: p.key, kind: 'name_corrected', before: { name: p.name }, after: { name: e.name }, review: m.how === 'renamed' });
    if (orgNorm(p.organisation) !== orgNorm(e.organisation)) events.push({ key: p.key, kind: 'organisation_changed', before: { organisation: p.organisation }, after: { organisation: e.organisation } });
    const was = new Set(p.roles.map(roleKey)), now = new Set(e.roles.map(roleKey));
    const modsWas = new Set(p.roles.map((r) => r.module)), modsNow = new Set(e.roles.map((r) => r.module));
    const addedMods = [...modsNow].filter((x) => !modsWas.has(x)), removedMods = [...modsWas].filter((x) => !modsNow.has(x));
    if (addedMods.length) events.push({ key: p.key, kind: 'modules_added', before: { modules: [...modsWas] }, after: { modules: addedMods } });
    if (removedMods.length) events.push({ key: p.key, kind: 'modules_removed', before: { modules: removedMods }, after: { modules: [...modsNow] }, review: true });
    const roleChanged = [...modsNow].filter((mod) => modsWas.has(mod) && p.roles.filter((r) => r.module === mod).map((r) => r.role).sort().join() !== e.roles.filter((r) => r.module === mod).map((r) => r.role).sort().join());
    if (roleChanged.length) events.push({ key: p.key, kind: 'role_changed', before: { roles: p.roles.filter((r) => roleChanged.includes(r.module)) }, after: { roles: e.roles.filter((r) => roleChanged.includes(r.module)) }, review: true });
    if (!was.size && now.size) { /* nothing more */ }
  });
  prev.forEach((p, i) => {
    if (used.has(i)) return;
    if (p.status === 'removed') { next.push(p); return; } // stays removed, kept for history
    const entry = { ...p, status: 'removed', removed_on: day };
    next.push(entry);
    events.push({ key: p.key, kind: 'removed', before: pick(p), review: true });
  });
  return { entries: next.sort((a, b) => a.key.localeCompare(b.key)), events };
}
const pick = (e) => ({ name: e.name, organisation: e.organisation, roles: e.roles, accredited_on: e.accredited_on || null });
