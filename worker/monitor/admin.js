// Admin: source monitoring (/admin/sources/, admin login; Access role 'verifier' or owner). One table of sources with
// their last successful check, next check, state and failures; the changes waiting for review; directory counts; a
// change report per item; and manual retry. Submitted and fetched text is always escaped and never placed inside a
// script or handler (CLAUDE.md).
import SOURCES from './sources.json';
import { monitorRun } from './run.js';
import { ukDate } from '../time.js';
import { norm, orgNorm, optedOut } from './directory.js';
import { audit } from '../audit.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const BASE = '/admin/sources/';
const when = (v) => (v ? `${esc(ukDate(Date.parse(v)))} <small>${esc(String(v).slice(11, 16))} UTC</small>` : '<span class="muted">never</span>');
const STYLE = '<style>.ms-pill{display:inline-block;padding:2px 9px;border-radius:99px;background:#EDEAE3;font-size:12.5px}.ms-ok{background:#DDEFE9}.ms-bad{background:#F6DEDA}.ms-warn{background:#FBEFD5}.ms-pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#F7F5F0;border-radius:8px;padding:10px;font-size:13px;max-height:360px;overflow:auto}.ms-form{display:inline-grid;gap:6px;margin:4px 0}.ms-form label{display:grid;gap:3px;font-size:13px}.ms-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.ms-tabs a{padding:5px 12px;border:1px solid #E4E0D7;border-radius:99px;text-decoration:none;color:inherit;font-size:14px}.ms-tabs a[aria-current=page]{background:#0F1E33;color:#fff}</style>';
const PILL = { ok: 'ms-ok', changed: 'ms-warn', unavailable: 'ms-bad', format_changed: 'ms-bad', never: '', unsupported: '', not_authorised: '', retired: '' };
const pill = (s) => `<span class="ms-pill ${PILL[s] || ''}">${esc(String(s).replace(/_/g, ' '))}</span>`;
const reviewerField = '<label>Your name (recorded)<input name="reviewer" maxlength="80" required></label>';
const form = (action, hidden, inner, button) => `<form class="ms-form sv-form" method="post"><input type="hidden" name="action" value="${action}">${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}${inner}<button class="btn btn-ghost small" type="submit">${esc(button)}</button></form>`;

export async function sourcesAdminHtml(env, url) {
  try { await env.DB.prepare('SELECT 1 FROM monitor_sources LIMIT 0').all(); } catch { return '<h2 class="display" style="font-size:34px">Source monitoring</h2><p class="admin-summary">Not available yet: apply migrations/0016_source_monitoring.sql first.</p>'; }
  const m = url.searchParams.get('m') || '';
  const tab = url.searchParams.get('tab') || 'review';
  const change = Number(url.searchParams.get('change'));
  const note = m ? `<p class="sv-banner" role="status" style="font-weight:600">${esc(m)}</p>` : '';
  if (change) return STYLE + note + await changeReport(env, change);
  const sources = (await env.DB.prepare('SELECT * FROM monitor_sources ORDER BY kind DESC, body, name').all()).results || [];
  const open = (await env.DB.prepare("SELECT c.*, s.name FROM monitor_changes c JOIN monitor_sources s ON s.id = c.source_id WHERE c.review_status = 'open' ORDER BY c.id DESC LIMIT 100").all()).results || [];
  const lastRun = await env.DB.prepare("SELECT * FROM monitor_runs WHERE trigger = 'cron' ORDER BY id DESC LIMIT 1").first();
  const failing = sources.filter((s) => s.mode === 'auto' && s.failures >= 3);
  const dirs = sources.filter((s) => s.kind === 'directory');
  // A directory held back by the 30% rule: its latest run says so, and an administrator may accept the fall.
  const held = {};
  for (const d of dirs.filter((x) => x.status === 'format_changed')) { const r = await env.DB.prepare('SELECT error FROM monitor_runs WHERE source_id = ? ORDER BY id DESC LIMIT 1').bind(d.id).first(); if (r && /^The source lists \d+ people against \d+/.test(r.error || '')) held[d.id] = r.error; }
  const guidesNeedingReview = [...new Set(open.flatMap((c) => JSON.parse(c.guides || '[]')))];
  const tabs = [['review', `Needs review (${open.length})`], ['sources', `All sources (${sources.length})`], ['directories', 'Directories'], ['runs', 'Recent checks']];
  const nav = `<nav class="ms-tabs" aria-label="Source monitoring">${tabs.map(([k, l]) => `<a href="${BASE}?tab=${k}"${k === tab ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</nav>`;
  const auto = sources.filter((s) => s.mode === 'auto');
  const head = `<h2 class="display" style="font-size:34px;margin:0 0 8px">Source monitoring</h2>
  <p class="admin-summary">Daily checks of the official guidance behind Wavelength's guides, and of supervisor directories where the body has given permission. Checked by the cron every ten minutes, one source at a time; each source once a day. Nothing clinical is changed automatically: changes wait here for a person.</p>${note}
  <p class="admin-summary">${auto.filter((s) => s.last_success_at && ukDate(Date.parse(s.last_success_at)) === ukDate()).length} of ${auto.length} automatic sources checked today · last scheduled run ${lastRun ? when(lastRun.started_at) : '<span class="muted">none yet</span>'} · ${failing.length ? `<b>${failing.length} failing repeatedly</b>` : 'none failing repeatedly'} · guides needing review: ${guidesNeedingReview.length ? esc(guidesNeedingReview.join(', ')) : 'none'}</p>${nav}`;
  let body = '';
  if (tab === 'review') body = open.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Detected</th><th scope="col">Source</th><th scope="col">Kind</th><th scope="col">Summary</th><th scope="col">Guides</th></tr></thead><tbody>${open.map((c) => `<tr><td>${when(c.detected_at)}</td><td><a class="text-link" href="${BASE}?change=${c.id}">${esc(c.name)}</a></td><td>${pill(c.classification === 'important' ? 'changed' : c.classification === 'format_changed' ? 'format_changed' : 'changed')} ${esc(c.classification)}</td><td>${esc(c.summary)}</td><td>${esc(JSON.parse(c.guides || '[]').join(', '))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">Nothing needs review.</p>';
  if (tab === 'sources') body = `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Source</th><th scope="col">State</th><th scope="col">Last successful check</th><th scope="col">Next check</th><th scope="col">Last change</th><th scope="col">Version / date</th><th scope="col"></th></tr></thead><tbody>${sources.map((s) => `<tr><td><a class="text-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a><br><small>${esc(s.body || '')} · ${esc(s.mode.replace(/_/g, ' '))}${JSON.parse(s.guides || '[]').length ? ` · ${esc(JSON.parse(s.guides).join(', '))}` : ''}</small></td><td>${pill(s.status)}${s.failures ? `<br><small>${s.failures} failed in a row</small>` : ''}</td><td>${when(s.last_success_at)}</td><td>${s.mode === 'auto' ? when(s.next_check_at) : '<span class="muted">not scheduled</span>'}</td><td>${when(s.last_change_at)}</td><td><small>${esc(s.doc_version || '')} ${esc(s.published_on || '')}</small></td><td>${s.mode === 'auto' ? form('retry', { id: s.id }, '', 'Check now') : ''}</td></tr>`).join('')}</tbody></table></div>`;
  if (tab === 'directories') body = dirs.map((d) => { const c = JSON.parse(d.meta || '{}').counts || {}; return `<div class="sv-card" style="margin:0 0 12px"><h4 style="margin:0 0 6px">${esc(d.name)} ${pill(d.status)}</h4><p class="admin-summary">${d.mode === 'auto' ? `Last successful sync ${when(d.last_success_at)} · listed ${c.listed ?? 'n/a'} · added ${c.added || 0} · changed ${(c.organisation_changed || 0) + (c.modules_added || 0) + (c.modules_removed || 0) + (c.role_changed || 0) + (c.name_corrected || 0)} · removed ${c.removed || 0}` : 'Not read automatically: the body has not given written permission. Individual checks stay manual, on the person page.'}</p><p class="admin-summary"><small>${esc(JSON.parse(d.meta || '{}').why || '')}</small></p>${held[d.id] ? `<p class="admin-summary">${esc(held[d.id])}</p>${form('accept_drop', { id: d.id }, `${reviewerField}<label>How you checked the source (required)<input name="note" maxlength="500" required></label>`, 'Accept the fall and sync')}` : ''}</div>`; }).join('') + `<p class="admin-summary">Directory sync switch (DIRECTORY_SYNC): <b>${env.DIRECTORY_SYNC === 'true' ? 'on' : 'off'}</b>.</p>` + await optoutsPanel(env, dirs);
  if (tab === 'runs') { const runs = (await env.DB.prepare('SELECT r.*, s.name FROM monitor_runs r LEFT JOIN monitor_sources s ON s.id = r.source_id ORDER BY r.id DESC LIMIT 100').all()).results || []; body = runs.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">Source</th><th scope="col">Trigger</th><th scope="col">Outcome</th><th scope="col">Detail</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${when(r.started_at)}</td><td>${esc(r.name || r.source_id)}</td><td>${esc(r.trigger)}</td><td>${esc(String(r.outcome || '').replace(/_/g, ' '))}${r.http_status ? ` <small>HTTP ${r.http_status}</small>` : ''}</td><td><small>${esc(r.error || r.counts || '')}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No checks yet.</p>'; }
  return STYLE + head + body;
}

// Objections (Article 21): a listed person asks not to be included. Recorded by name (and organisation, if given);
// never their contact details.
async function optoutsPanel(env, dirs) {
  const rows = (await env.DB.prepare('SELECT * FROM directory_optouts ORDER BY id DESC LIMIT 200').all().catch(() => ({ results: [] }))).results || [];
  const names = Object.fromEntries(dirs.map((d) => [d.id, d.name]));
  const sel = `<label>Directory<select name="source"><option value="*">Every directory</option>${dirs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label>`;
  return `<div class="sv-card" style="margin:16px 0 12px"><h4 style="margin:0 0 6px">Objections: people who asked not to be included</h4>
  <p class="admin-summary">Recording an objection removes every matching entry from the stored directory (current and previous copies) and its change history at once, and keeps the person out of later syncs, name search and claims. Matching is on the name and, if you give one, the organisation: leave the organisation empty to cover a move.</p>
  ${form('optout', {}, `${sel}<label>Name as listed (required)<input name="name" maxlength="120" required></label><label>Organisation (optional)<input name="organisation" maxlength="160"></label>${reviewerField}<label>How the request arrived (required; no contact details)<input name="note" maxlength="300" required></label>`, 'Record objection')}
  ${rows.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Recorded</th><th scope="col">Directory</th><th scope="col">Name</th><th scope="col">Organisation</th><th scope="col">By</th><th scope="col">Note</th><th scope="col"></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${when(r.created_at.replace(' ', 'T') + 'Z')}</td><td>${esc(r.source_id === '*' ? 'Every directory' : names[r.source_id] || r.source_id)}</td><td>${esc(r.name_norm)}</td><td>${esc(r.org_norm || 'any')}</td><td>${esc(r.created_by || '')}</td><td>${esc(r.note || '')}</td><td>${form('optout_remove', { id: r.id }, `${reviewerField}<label>Why (required)<input name="note" maxlength="300" required></label>`, 'Withdraw objection')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No objections recorded.</p>'}</div>`;
}

async function changeReport(env, id) {
  const c = await env.DB.prepare('SELECT c.*, s.name, s.url, s.body FROM monitor_changes c JOIN monitor_sources s ON s.id = c.source_id WHERE c.id = ?').bind(id).first();
  if (!c) return `<p class="admin-summary">Change not found. <a class="text-link" href="${BASE}">Back</a></p>`;
  const ev = JSON.parse(c.evidence || '{}');
  const lines = (xs, sign) => (xs || []).map((l) => `${sign} ${l}`).join('\n');
  const guides = JSON.parse(c.guides || '[]');
  const titles = Object.fromEntries(SOURCES.guides.map((g) => [g.slug, g.title]));
  return `<h2 class="display" style="font-size:30px;margin:0 0 8px">Change report</h2>
  <p class="admin-summary"><a class="text-link" href="${BASE}">Back to source monitoring</a></p>
  <dl class="sv-dl"><dt>Source</dt><dd><a class="text-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a> (${esc(c.body || '')})</dd><dt>Detected</dt><dd>${when(c.detected_at)}</dd><dt>Classification</dt><dd>${esc(c.classification)}</dd><dt>Summary</dt><dd>${esc(c.summary)}</dd>
  <dt>Wavelength guides affected</dt><dd>${guides.length ? guides.map((g) => `<a class="text-link" href="/guides/${esc(g)}/" target="_blank" rel="noopener">${esc(titles[g] || g)}</a>`).join(', ') : 'none'}</dd>
  ${ev.oldVersion || ev.newVersion ? `<dt>Version</dt><dd>${esc(ev.oldVersion || '?')} to ${esc(ev.newVersion || '?')}</dd>` : ''}${ev.oldPublishedOn || ev.newPublishedOn ? `<dt>Source date</dt><dd>${esc(ev.oldPublishedOn || '?')} to ${esc(ev.newPublishedOn || '?')}</dd>` : ''}
  <dt>Review</dt><dd>${esc(c.review_status)}${c.reviewed_by ? ` by ${esc(c.reviewed_by)} ${esc((c.reviewed_at || '').slice(0, 10))}` : ''}${c.review_note ? `<br>${esc(c.review_note)}` : ''}</dd></dl>
  ${ev.requirementLines && ev.requirementLines.length ? `<h3>Lines that mention requirements</h3><div class="ms-pre">${esc(ev.requirementLines.join('\n'))}</div>` : ''}
  ${ev.added || ev.removed ? `<h3>Changed lines (${ev.addedCount || 0} added, ${ev.removedCount || 0} removed; up to 40 of each shown)</h3><div class="ms-pre">${esc(lines(ev.removed, '−'))}${ev.removed && ev.added ? '\n' : ''}${esc(lines(ev.added, '+'))}</div>` : ''}
  ${ev.events ? `<h3>Directory changes</h3><div class="ms-pre">${esc(ev.events.map((e) => `${e.kind}${e.key ? ' ' + e.key : ''}: ${JSON.stringify(e.after || e.before || {})}`).join('\n'))}</div>` : ''}
  <p class="admin-summary">The Wavelength guide is never changed from here. If it needs an update, edit the guide, record the new review date (front matter reviewed) and release it as usual; then mark this change approved.</p>
  ${c.review_status === 'open' ? `<div class="sv-actions">${form('review', { change: c.id, outcome: 'acknowledged' }, `${reviewerField}<label>Note (optional)<input name="note" maxlength="500"></label>`, 'Acknowledge: reviewing')}${form('review', { change: c.id, outcome: 'approved' }, `${reviewerField}<label>What was decided (required)<input name="note" maxlength="500" required></label>`, 'Reviewed: guide updated or no change needed')}${form('review', { change: c.id, outcome: 'dismissed' }, `${reviewerField}<label>Why it does not matter (required)<input name="note" maxlength="500" required></label>`, 'Dismiss: not a real change')}</div>` : c.review_status === 'acknowledged' ? form('review', { change: c.id, outcome: 'approved' }, `${reviewerField}<label>What was decided (required)<input name="note" maxlength="500" required></label>`, 'Reviewed: guide updated or no change needed') : ''}`;
}

export async function sourcesAdminPost(env, f, admin, ctx) {
  const action = String(f.get('action') || '');
  const reviewer = clip(f.get('reviewer'), 80);
  if (action === 'retry') {
    const id = clip(f.get('id'), 80);
    const r = await monitorRun(env, ctx, { trigger: 'manual', ids: [id], limit: 1, force: true });
    const c = r.checked[0];
    return { tab: 'sources', m: c ? `Checked: ${c.outcome.replace(/_/g, ' ')}.` : `Not checked: ${(r.skipped[0] || {}).why === 'busy' ? 'a check is already running for this source' : 'this source is not checked automatically'}.` };
  }
  if (action === 'accept_drop') {
    // Only after a person has looked at the official directory: the reason is kept on the held review item.
    const id = clip(f.get('id'), 80), note = clip(f.get('note'), 500);
    if (!reviewer || note.length < 3) return { tab: 'directories', m: 'Enter your name and how you checked the source.' };
    const s = await env.DB.prepare("SELECT kind, mode FROM monitor_sources WHERE id = ?").bind(id).first();
    if (!s || s.kind !== 'directory') return { tab: 'directories', m: 'Not a directory.' };
    const r = await monitorRun(env, ctx, { trigger: 'manual', ids: [id], limit: 1, force: true, acceptDrop: true });
    const c = r.checked[0];
    if (c && c.outcome !== 'format_changed' && c.outcome !== 'unavailable') await env.DB.prepare("UPDATE monitor_changes SET review_status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE source_id = ? AND classification = 'format_changed' AND review_status IN ('open', 'acknowledged')").bind(`admin:${clip(admin, 40)}:${reviewer}`, new Date().toISOString(), `Fall accepted: ${note}`, id).run();
    return { tab: 'directories', m: c ? `Synced: ${c.outcome.replace(/_/g, ' ')}.` : 'Not synced: directory sync is off or a check is already running.' };
  }
  if (action === 'optout') {
    const source = clip(f.get('source'), 80) || '*', name = clip(f.get('name'), 120), org = clip(f.get('organisation'), 160), note = clip(f.get('note'), 300);
    const nn = norm(name), on = org ? orgNorm(org) : null;
    if (nn.replace(/ /g, '').length < 3 || !reviewer || note.length < 3) return { tab: 'directories', m: 'Enter the name as listed, your name and how the request arrived.' };
    const dirs = ((await env.DB.prepare("SELECT id FROM monitor_sources WHERE kind = 'directory'").all()).results || []).map((r) => r.id);
    if (source !== '*' && !dirs.includes(source)) return { tab: 'directories', m: 'Not a directory.' };
    const rule = { source_id: source, name_norm: nn, org_norm: on };
    // The objection and every removal it implies are one batch: stored copies and history go together.
    const stmts = [env.DB.prepare('INSERT OR IGNORE INTO directory_optouts (source_id, name_norm, org_norm, created_by, note) VALUES (?,?,?,?,?)').bind(source, nn, on, `admin:${clip(admin, 40)}:${reviewer}`, note)];
    let removed = 0;
    const snaps = (await env.DB.prepare(`SELECT id, source_id, entries FROM directory_snapshots WHERE source_id ${source === '*' ? "LIKE 'dir:%'" : '= ?'}`).bind(...(source === '*' ? [] : [source])).all()).results || [];
    for (const s of snaps) {
      const entries = JSON.parse(s.entries), out = entries.filter((e) => optedOut(e, [rule], s.source_id));
      if (!out.length) continue;
      removed = Math.max(removed, out.length);
      const keep = entries.filter((e) => !out.includes(e));
      stmts.push(env.DB.prepare('UPDATE directory_snapshots SET entries = ?, entry_count = ? WHERE id = ?').bind(JSON.stringify(keep), keep.filter((e) => e.status !== 'removed').length, s.id));
      stmts.push(env.DB.prepare(`DELETE FROM directory_events WHERE source_id = ? AND entry_key IN (${out.map(() => '?').join(',')})`).bind(s.source_id, ...out.map((e) => e.key)));
    }
    await env.DB.batch(stmts);
    await audit(env, { actorType: 'admin', actorId: clip(admin, 40), action: 'directory.optout', meta: { removed } });
    return { tab: 'directories', m: removed ? `Objection recorded. ${removed} matching ${removed === 1 ? 'entry' : 'entries'} removed.` : 'Objection recorded. No matching entry is stored now; the person will not be taken in later.' };
  }
  if (action === 'optout_remove') {
    const note = clip(f.get('note'), 300);
    if (!reviewer || note.length < 3) return { tab: 'directories', m: 'Enter your name and why the objection is withdrawn.' };
    const r = await env.DB.prepare('DELETE FROM directory_optouts WHERE id = ?').bind(Number(f.get('id'))).run();
    if (r.meta && r.meta.changes) await audit(env, { actorType: 'admin', actorId: clip(admin, 40), action: 'directory.optout_withdrawn' });
    return { tab: 'directories', m: r.meta && r.meta.changes ? 'Objection withdrawn. The person is taken in again at the next sync.' : 'Nothing changed.' };
  }
  if (action === 'review') {
    const outcome = ['acknowledged', 'approved', 'dismissed'].includes(f.get('outcome')) ? String(f.get('outcome')) : null;
    const note = clip(f.get('note'), 500);
    if (!outcome || !reviewer) return { change: f.get('change'), m: 'Enter your name.' };
    if (outcome !== 'acknowledged' && note.length < 3) return { change: f.get('change'), m: 'Say what was decided.' };
    const r = await env.DB.prepare("UPDATE monitor_changes SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND review_status IN ('open', 'acknowledged')").bind(outcome, `admin:${clip(admin, 40)}:${reviewer}`, new Date().toISOString(), note || null, Number(f.get('change'))).run();
    if (r.meta && r.meta.changes && outcome !== 'acknowledged') {
      // The source's state follows its oldest open item: back to 'ok' when nothing is left open.
      const c = await env.DB.prepare('SELECT source_id FROM monitor_changes WHERE id = ?').bind(Number(f.get('change'))).first();
      if (c) await env.DB.prepare("UPDATE monitor_sources SET status = CASE WHEN EXISTS (SELECT 1 FROM monitor_changes WHERE source_id = ? AND review_status IN ('open', 'acknowledged')) THEN status ELSE (CASE WHEN status IN ('changed', 'format_changed') AND failures = 0 THEN 'ok' ELSE status END) END WHERE id = ?").bind(c.source_id, c.source_id).run();
    }
    return { change: f.get('change'), m: r.meta && r.meta.changes ? `Recorded as ${outcome}.` : 'Nothing changed: it was already decided.' };
  }
  return { tab: 'review', m: 'Nothing changed.' };
}
