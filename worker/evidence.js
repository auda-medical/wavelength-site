// Verified evidence summaries for the Wavelength app.
// The Worker computes pathway progress from its own copy of the logbook (sign-offs are server-owned),
// stores a snapshot with a public code (EV-XXXX-XXXX), and shows it at /app/verify/?code=.
// No findings, indications or reflections are stored in the snapshot: only counts.
import LOGBOOK from '../data/logbook.json';

const PATHS = Object.fromEntries(LOGBOOK.pathways.map((p) => [p.id, p]));
const TYPES = Object.fromEntries(LOGBOOK.types.map((t) => [t.id, t]));
const DEST = Object.fromEntries((LOGBOOK.destinations || []).map((d) => [d.id, d]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function matches(e, match) {
  return Object.keys(match).every((k) => {
    const v = k.startsWith('f.') ? (e.findings || {})[k.slice(2)] : e[k];
    return match[k].includes(v);
  });
}

// Mirrors moduleStats in src/app/app.js. Keep the two in step.
function moduleStats(mod, entries, targets) {
  const t = targets[mod.id] || {};
  const curriculumTotal = mod.total || 0, curriculumSup = mod.supervised || 0;
  const total = t.total != null ? Number(t.total) || 0 : curriculumTotal;
  const sup = t.supervised != null ? Number(t.supervised) || 0 : curriculumSup;
  const list = entries.filter((e) => mod.types.includes(e.type) && !(e.exclude || []).includes(mod.id));
  let over = 0;
  const rules = (mod.rules || []).map((r) => {
    const n = list.filter((e) => matches(e, r.match)).length;
    if (r.max != null && n > r.max) over += n - r.max;
    return { label: r.label, n, min: r.min || null, max: r.max != null ? r.max : null };
  });
  const counted = Math.max(0, list.length - over);
  const supervised = list.filter((e) => e.supervision === 'direct').length;
  const mentored = list.filter((e) => e.supervision === 'mentored').length;
  const reflections = list.filter((e) => e.reflection && String(e.reflection).trim().length > 20).length;
  const signed = list.filter((e) => e.signoff && e.signoff.status === 'confirmed').length;
  const parts = [];
  if (total) parts.push(Math.min(1, counted / total));
  if (sup) parts.push(Math.min(1, supervised / sup));
  if (mod.reflections) parts.push(Math.min(1, reflections / mod.reflections));
  rules.forEach((r) => { if (r.min) parts.push(Math.min(1, r.n / r.min)); });
  const frac = parts.length ? Math.min(...parts) : (list.length ? 1 : 0);
  const needs = [];
  if (total > counted) needs.push(`${total - counted} more scan${total - counted === 1 ? '' : 's'}`);
  if (sup > supervised) needs.push(`${sup - supervised} more supervised`);
  if (mod.reflections && mod.reflections > reflections) needs.push(`${mod.reflections - reflections} more reflection${mod.reflections - reflections === 1 ? '' : 's'}`);
  rules.forEach((r) => { if (r.min && r.n < r.min) needs.push(`${r.min - r.n} more ${r.label.toLowerCase()}`); });
  return {
    needs, id: mod.id, label: mod.label, logged: list.length, counted, total, supervised, supTarget: sup, mentored, reflections,
    reflectionTarget: mod.reflections || 0, signed, rules, met: !!parts.length && frac >= 1, percent: Math.round(100 * frac),
    ownTarget: (t.total != null && Number(t.total) !== curriculumTotal) || (t.supervised != null && Number(t.supervised) !== curriculumSup),
    curriculumTotal, curriculumSup,
  };
}

export function buildSummary(entries, profile, pathwayIds) {
  const targets = profile.targets || {};
  const pathways = pathwayIds.filter((id) => PATHS[id]).map((pid) => {
    const pw = PATHS[pid];
    let mods = pw.modules;
    if (pid === 'general') {
      const seen = [...new Set(entries.map((e) => e.type))].filter((t) => TYPES[t]);
      mods = seen.map((t) => ({ id: `gen-${t}`, label: TYPES[t].label, types: [t], total: 0 }));
    }
    return { id: pid, label: pw.label, name: pw.name, source: pw.source, checked: pw.checked, modules: mods.map((m) => moduleStats(m, entries, targets)) };
  });
  const byType = {};
  for (const e of entries) {
    const k = e.type;
    byType[k] = byType[k] || { type: k, label: (TYPES[k] || {}).label || k, logged: 0, direct: 0, mentored: 0, independent: 0, signed: 0 };
    byType[k].logged++;
    if (e.supervision && byType[k][e.supervision] != null) byType[k][e.supervision]++;
    if (e.signoff && e.signoff.status === 'confirmed') byType[k].signed++;
  }
  const codes = [...new Set(entries.filter((e) => e.signoff && e.signoff.status === 'confirmed').map((e) => e.signoff.code))];
  const dates = entries.map((e) => e.date).sort();
  return {
    scans: entries.length,
    signed: entries.filter((e) => e.signoff && e.signoff.status === 'confirmed').length,
    supervised: entries.filter((e) => e.supervision === 'direct').length,
    firstScan: dates[0] || null, lastScan: dates[dates.length - 1] || null,
    pathways, types: Object.values(byType).sort((a, b) => b.logged - a.logged), signoffCodes: codes,
  };
}

export async function createEvidence(env, l, d, { code, clip, fullName, profileOf, json, origin }) {
  const from = ISO.test(d && d.from) ? d.from : '2000-01-01';
  const to = ISO.test(d && d.to) ? d.to : new Date().toISOString().slice(0, 10);
  if (from > to) return json({ ok: false, error: 'The start date is after the end date.' }, 400);
  const profile = profileOf(l);
  const mine = (profile.pathways && profile.pathways.length ? profile.pathways : ['general']).filter((p) => PATHS[p]);
  const pathwayIds = d && d.pathway && PATHS[d.pathway] ? [d.pathway] : mine;
  const { results = [] } = await env.DB.prepare('SELECT data FROM logbook_entries WHERE learner_id = ? AND deleted = 0 AND scan_date >= ? AND scan_date <= ? ORDER BY scan_date').bind(l.id, from, to).all();
  let entries = results.map((r) => JSON.parse(r.data));
  if (d && d.pathway && d.pathway !== 'general' && PATHS[d.pathway]) {
    const types = new Set(PATHS[d.pathway].modules.flatMap((m) => m.types));
    entries = entries.filter((e) => types.has(e.type));
  }
  if (d && d.signedOnly) entries = entries.filter((e) => e.signoff && e.signoff.status === 'confirmed');
  if (!entries.length) return json({ ok: false, error: 'No synced scans match those choices. Connect to the internet so your logbook syncs, then try again.' }, 400);
  const dest = DEST[d && d.destination] ? d.destination : 'other';
  const summary = buildSummary(entries, profile, pathwayIds);
  const data = { learner: fullName(l), grade: clip(profile.grade || l.role || '', 120), organisation: clip(l.organisation || '', 160), from, to, destination: dest, destinationLabel: DEST[dest] ? DEST[dest].label : '', signedOnly: !!(d && d.signedOnly), ...summary };
  const id = code('EV');
  await env.DB.prepare('INSERT INTO evidence_summaries (id, learner_id, destination, period_from, period_to, data) VALUES (?,?,?,?,?,?)').bind(id, l.id, dest, from, to, JSON.stringify(data)).run();
  return json({ ok: true, code: id, link: `${origin}/app/verify/?code=${id}`, summary: data, createdAt: new Date().toISOString() });
}

export async function listEvidence(env, l, json) {
  const { results = [] } = await env.DB.prepare('SELECT id, destination, period_from, period_to, created_at, withdrawn FROM evidence_summaries WHERE learner_id = ? ORDER BY created_at DESC LIMIT 100').bind(l.id).all();
  return json({ ok: true, evidence: results });
}

export async function withdrawEvidence(env, l, d, clip, json) {
  await env.DB.prepare('UPDATE evidence_summaries SET withdrawn = 1 WHERE id = ? AND learner_id = ?').bind(clip(d && d.code, 20), l.id).run();
  return json({ ok: true });
}

export async function verifyEvidence(env, c, json) {
  const row = await env.DB.prepare('SELECT id, data, created_at, withdrawn FROM evidence_summaries WHERE id = ?').bind(c).first();
  if (!row) return json({ ok: false, error: 'No evidence summary matches that code.' }, 404);
  if (row.withdrawn) return json({ ok: false, withdrawn: true, error: 'The learner has withdrawn this evidence summary. Ask them for a current one.' }, 410);
  return json({ ok: true, kind: 'evidence', code: row.id, createdAt: row.created_at, ...JSON.parse(row.data) });
}
