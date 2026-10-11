// Migration 0016 (source monitoring) rehearsed against the live database's own schema (test/fixtures/
// production-schema-20261011.sql, definitions only): it only adds tables and indexes, applies twice without harm,
// leaves every existing table and row exactly as it was, and its rollback (docs/source-monitoring/0016-rollback.sql)
// returns the schema to the original. A Worker deployed before the migration, or still running after the rollback,
// does nothing and claims nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { makeEnv, ctx } from './helpers/env.mjs';
import { monitorRun, seedSources } from '../worker/monitor/run.js';
import { guideStatus } from '../worker/monitor/api.js';
import { sourcesAdminHtml } from '../worker/monitor/admin.js';
import { handleApp } from '../worker/app.js';
import SOURCES from '../worker/monitor/sources.json' with { type: 'json' };

globalThis.fetch = async () => new Response('{}');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PROD = read('./fixtures/production-schema-20261011.sql');
const M16 = read('../migrations/0016_source_monitoring.sql');
const ROLLBACK = read('../docs/source-monitoring/0016-rollback.sql');
const NEW = ['directory_events', 'directory_links', 'directory_optouts', 'directory_snapshots', 'monitor_changes', 'monitor_runs', 'monitor_sources'];
const schema = (db) => db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all().map((r) => `${r.type} ${r.name}: ${r.sql}`);
const statements = (sql) => sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);

function prodDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(PROD);
  // Synthetic rows standing for real records: they must come through untouched.
  db.exec("INSERT INTO learners (email, first_name, last_name, email_status) VALUES ('alex@example.test', 'Alex', 'Example', 'verified')");
  db.exec("INSERT INTO settings (key, value) VALUES ('learner_secret', 'x'), ('admin_username', 'wavelength')");
  db.exec("INSERT INTO credentials (learner_id, credential_type, issuer, status) VALUES (1, 'famus-supervisor', 'SAM', 'verified')");
  db.exec("INSERT INTO supervisor_applications (learner_id, status) VALUES (1, 'submitted')");
  db.exec("INSERT INTO audit_events (at, actor_type, action) VALUES ('2026-10-10T18:03:00Z', 'admin', 'approval.grant')");
  return db;
}
const rows = (db) => ['learners', 'settings', 'credentials', 'supervisor_applications', 'audit_events'].map((t) => JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()));

test('0016 only creates tables and indexes, and none of its names exists in production', () => {
  const st = statements(M16);
  assert.ok(st.length >= 14);
  for (const s of st) assert.match(s, /^CREATE (TABLE|(UNIQUE )?INDEX) IF NOT EXISTS /, s.slice(0, 80));
  assert.doesNotMatch(M16.replace(/--[^\n]*/g, ''), /\b(ALTER|DROP|UPDATE|DELETE|INSERT|REPLACE)\b/i);
  for (const t of NEW) assert.doesNotMatch(PROD, new RegExp(`CREATE TABLE ${t}\\b`), `${t} is new`);
  // The live schema has the tables the monitor uses alongside its own.
  for (const t of ['settings', 'audit_events', 'notification_log', 'learners', 'credentials']) assert.match(PROD, new RegExp(`CREATE TABLE ${t} `));
});

test('applied to the production schema, twice: existing tables and rows unchanged, seven tables added', () => {
  const db = prodDb();
  const before = schema(db), data = rows(db);
  db.exec(M16);
  db.exec(M16); // a repeat changes nothing
  const after = schema(db);
  for (const line of before) assert.ok(after.includes(line), `unchanged: ${line.slice(0, 60)}`);
  const added = after.filter((l) => !before.includes(l));
  assert.deepEqual([...new Set(added.filter((l) => l.startsWith('table')).map((l) => l.split(' ')[1].replace(':', '')))].sort(), NEW);
  assert.deepEqual(rows(db), data, 'every existing row exactly as it was');
});

test('rollback returns the schema to the original and touches nothing else', () => {
  const db = prodDb();
  const before = schema(db), data = rows(db);
  db.exec(M16);
  db.exec("INSERT INTO settings (key, value) VALUES ('monitor_sources_version', 'abc'), ('monitor_retention_day', '2026-10-11')");
  db.exec("INSERT INTO monitor_sources (id, kind, name, url) VALUES ('g:x', 'guidance', 'X', 'https://example.org/')");
  db.exec(ROLLBACK);
  assert.deepEqual(schema(db), before);
  assert.deepEqual(rows(db), data);
  db.exec(ROLLBACK); // safe to repeat
});

test('the Worker before the migration (or after a rollback): no runs, no status, no errors, nothing claimed', async () => {
  const env = makeEnv({ DIRECTORY_SYNC: 'true', MONITOR_FETCH: async () => { throw new Error('must not fetch'); } });
  env.DB.db = prodDb();
  const r = await monitorRun(env, ctx, { trigger: 'cron' });
  assert.equal(r.ready, false);
  assert.deepEqual(r.checked, []);
  const app = (path, cookie) => handleApp(new Request(`https://thewavelength.co.uk${path}`, { headers: cookie ? { Cookie: cookie } : {} }), env, ctx);
  const res = await app('/api/app/sources/guide/fusic-accreditation');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
  assert.match(await sourcesAdminHtml(env, new URL('https://x/admin/sources/')), /apply migrations\/0016_source_monitoring\.sql first/);
});

test('after the migration on the production schema, the monitor works end to end', async () => {
  const pages = new Map(SOURCES.sources.filter((s) => s.mode === 'auto').map((s) => [s.url, `<main><h1>${s.name}</h1><p>${'Accreditation requires supervised scans reviewed by a mentor. '.repeat(5)}</p></main>`]));
  const env = makeEnv({ MONITOR_FETCH: async (u) => (pages.has(u) ? new Response(pages.get(u), { headers: { 'Content-Type': 'text/html' } }) : new Response('nf', { status: 404 })) });
  env.DB.db = prodDb();
  env.DB.db.exec(M16);
  await seedSources(env);
  const g = SOURCES.guides.find((x) => x.slug === 'famus-accreditation');
  await monitorRun(env, ctx, { trigger: 'manual', ids: g.sources, limit: g.sources.length, force: true });
  const st = await guideStatus(env, 'famus-accreditation', null, { refresh: false });
  assert.ok(st.checkedOn);
  assert.equal(st.reviewedOn, g.reviewed, 'a check never moves the clinical review date');
  assert.deepEqual(rows(env.DB.db).length, 5);
});
