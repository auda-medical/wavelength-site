// Verified evidence summaries for the Wavelength app.
// The Worker computes pathway progress from its own copy of the logbook (sign-offs are server-owned),
// stores a snapshot with a public code (EV-XXXX-XXXX), and shows it at /app/verify/?code=.
// No findings, indications or reflections are stored in the snapshot: only counts.
import LOGBOOK from '../data/logbook.json';

import '../src/app/progress.js';

const P = globalThis.WLProgress.create(LOGBOOK);
const PATHS = P.PATHS;
const TYPES = P.TYPES;
const DEST = Object.fromEntries((LOGBOOK.destinations || []).map((d) => [d.id, d]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Snapshot of one module for the verify page and exports. Plain data only (no entry lists).
function modOut(s) {
  return {
    needs: s.needs, id: s.id, label: s.label, logged: s.logged, counted: s.counted, total: s.total, supervised: s.supervised, supTarget: s.supTarget,
    mentored: s.mentored, reflections: s.reflections, reflectionTarget: s.reflectionTarget, signed: s.signed, rules: s.rules, assessments: s.assessments,
    met: s.met, percent: s.percent, gaps: s.gaps, ownTarget: s.ownTarget, curriculumTotal: s.curriculumTotal, curriculumSup: s.curriculumSup,
  };
}

export function buildSummary(entries, profile, pathwayIds, assessments = []) {
  const pathways = pathwayIds.filter((id) => PATHS[id]).map((pid) => {
    const pw = PATHS[pid];
    const ps = P.pathway(pid, entries, profile, assessments);
    return { id: pid, label: pw.label, name: pw.name, source: pw.source, checked: pw.checked, modules: ps.stats.map(modOut) };
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
    assessmentCodes: assessments.map((x) => x.id), assessmentsPassed: assessments.filter((x) => x.outcome === 'competent').length,
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
  const asm = await signedAssessments(env, l.id, from, to);
  const summary = buildSummary(entries, profile, pathwayIds, asm);
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

export async function signedAssessments(env, learnerId, from = '2000-01-01', to = '2999-12-31') {
  const { results = [] } = await env.DB.prepare("SELECT id, pathway, module, kind, outcome, assessed_on FROM assessments WHERE learner_id = ? AND status = 'signed' AND assessed_on >= ? AND assessed_on <= ? ORDER BY assessed_on").bind(learnerId, from, to).all();
  return results;
}
