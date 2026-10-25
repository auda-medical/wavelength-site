// Preview of the weekly summary email with made-up figures (no real data): writes the HTML the email provider would
// receive, for a screenshot. Run: node --import ./test/helpers/register.mjs tools/preview-weekly-summary.mjs out.html
import fs from 'node:fs';
import { makeEnv } from '../test/helpers/env.mjs';
import { weeklySummary } from '../worker/weekly-summary.js';
import DATA from '../worker/academy-data.json' with { type: 'json' };

const env = makeEnv({ ZEPTOMAIL_TOKEN: 'preview', ZEPTOMAIL_API: 'https://mail.preview/' });
const day = '2026-10-21 10:00:00';
const mods = Object.keys(DATA.modules);
for (let i = 0; i < 9; i++) {
  const id = (await env.DB.prepare("INSERT INTO learners (email, first_name, last_name, password_hash, created_at) VALUES (?, 'A', 'B', ?, ?)").bind(`p${i}@example.com`, i < 4 ? 'h' : null, day).run()).meta.last_row_id;
  const m = mods[i % mods.length];
  await env.DB.prepare('INSERT INTO attempts (learner_id, module, score, right_count, total, passed, created_at) VALUES (?, ?, ?, 1, 1, ?, ?)').bind(id, m, 60 + i * 4, i % 3 ? 1 : 0, day).run();
  if (i % 3) await env.DB.prepare('INSERT INTO certificates (code, learner_id, module, module_title, name, score, cpd_hours, issued_on, created_at) VALUES (?, ?, ?, ?, ?, 90, 1, ?, ?)').bind(`WL-P${i}`, id, m, m, 'A B', '2026-10-21', day).run();
  if (i < 4) await env.DB.prepare("INSERT INTO logbook_entries (id, learner_id, scan_type, scan_date, data, updated_at, created_at) VALUES (?, ?, 'efast', '2026-10-21', '{}', 1, ?)").bind(`e${i}`, id, day).run();
}
const rows = [['pv', '', 412], ['visit', '', 168], ['ev.book', '', 6], ['ev.enquiry_start', 'training', 3], ['visit.channel', 'search', 81], ['visit.channel', 'direct', 52], ['visit.channel', 'social', 35],
  ['pv.path', '/', 120], ['pv.path', '/learn/', 64], ['pv.path', '/courses/core-emergency-ultrasound/', 41], ['pv.path', '/learn/abscess-ultrasound/', 33], ['pv.path', '/learn/ankle-effusion-ultrasound/', 21], ['pv.path', '/learn/absent-lung-sliding-pneumothorax/', 18],
  ['ev.quiz', '/learn/abscess-ultrasound/test/', 9], ['ev.quiz_full', '/learn/abscess-ultrasound/test/', 5], ['ev.quiz', '/learn/ankle-effusion-ultrasound/test/', 4], ['ev.quiz_full', '/learn/ankle-effusion-ultrasound/test/', 1], ['ev.quiz', '/learn/absent-lung-sliding-pneumothorax/test/', 3]];
for (const [m, d, n] of rows) await env.DB.prepare('INSERT INTO metric_daily (day, metric, dim, n) VALUES (?, ?, ?, ?)').bind('2026-10-21', m, d, n).run();
let html = '';
globalThis.fetch = async (u, init) => { html = JSON.parse(init.body).htmlbody; return new Response('{}'); };
await weeklySummary(env, { now: Date.parse('2026-10-26T05:15:00Z') });
fs.writeFileSync(process.argv[2] || 'weekly-summary-preview.html', html);
console.log('written', html.length);
