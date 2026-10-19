// Production applies the commercial migrations late: 0001 to 0013, 0016 and 0017 are live (12 October 2026), so 0014
// and 0015 run after 0016 and 0017. This proves, in disposable in-memory databases, that the production order gives
// exactly the same schema as the numeric order, that 0014 and 0015 touch nothing 0016 or 0017 created, and that a
// second application is refused at its first new column (so the deployment launcher checks before applying).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DIR = new URL('../migrations/', import.meta.url);
const ALL = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const sql = (f) => readFileSync(new URL(f, DIR), 'utf8');
const LATE = ['0014_business_analytics.sql', '0015_credential_authorisation.sql'];
// Migrations after 0017 (0018 phone notifications, October 2026) run in numeric order after 0014 and 0015.
const UPTO = ALL.filter((f) => f < '0018');
const PRODUCTION = [...UPTO.filter((f) => !LATE.includes(f)), ...LATE, ...ALL.filter((f) => f >= '0018')];

function build(order) {
  const db = new DatabaseSync(':memory:');
  for (const f of order) db.exec(sql(f));
  return db;
}
// Tables with their columns (name, type, not-null, default, primary key; order-independent) and indexes.
function schema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  const cols = Object.fromEntries(tables.map((t) => [t, db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => `${c.name} ${c.type} ${c.notnull} ${c.dflt_value} ${c.pk}`).sort()]));
  const indexes = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name").all().map((r) => `${r.tbl_name}.${r.name}: ${r.sql.replace(/\s+/g, ' ')}`);
  return { tables, cols, indexes };
}

test('production order (0016 and 0017 before 0014 and 0015) gives exactly the numeric-order schema', () => {
  assert.deepEqual(UPTO.slice(-4), ['0014_business_analytics.sql', '0015_credential_authorisation.sql', '0016_source_monitoring.sql', '0017_admin_accounts.sql']);
  const a = schema(build(ALL)), b = schema(build(PRODUCTION));
  assert.deepEqual(b.tables, a.tables);
  assert.deepEqual(b.cols, a.cols);
  assert.deepEqual(b.indexes, a.indexes);
  assert.ok(a.tables.includes('bookings') && a.tables.includes('credential_confirmations') && a.tables.includes('admin_accounts') && a.tables.includes('monitor_sources'));
});

test('0014 and 0015 touch no table that 0016 or 0017 creates', () => {
  const created = new Set([...sql('0016_source_monitoring.sql').matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)/gi), ...sql('0017_admin_accounts.sql').matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)].map((m) => m[1]));
  for (const f of LATE) for (const m of sql(f).matchAll(/(?:ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE(?: IF NOT EXISTS)?|ON)\s+([a-z_]+)/gi)) assert.ok(!created.has(m[1]), `${f} touches ${m[1]}`);
});

test('a second application of 0014 or 0015 is refused at its first new column, leaving the schema as it was', () => {
  for (const f of LATE) {
    const db = build(PRODUCTION);
    const before = schema(db);
    assert.throws(() => db.exec(sql(f)), /duplicate column/);
    assert.deepEqual(schema(db), before, `${f}: nothing changed by the refused second run`);
  }
});

test('existing rows keep their meaning: approvals become capacity supervisor, enquiries keep their fields', () => {
  const db = build(ALL.filter((f) => !LATE.includes(f)));
  db.exec("INSERT INTO learners (email, first_name, last_name, password_hash, created_at) VALUES ('a@example.test', 'A', 'Example', 'x', '2026-10-01')");
  const lid = db.prepare('SELECT id FROM learners').get().id;
  db.prepare("INSERT INTO supervisor_approvals (learner_id, pathway, module, status, basis, approved_by, approved_at) VALUES (?, 'famus', 'famus-thoracic', 'approved', '[]', 'admin:wavelength:x', '2026-10-10')").run(lid);
  db.exec("INSERT INTO department_enquiries (first_name, last_name, email, organisation, created_at) VALUES ('B', 'Example', 'b@example.test', 'Example Trust', '2026-10-01')");
  for (const f of LATE) db.exec(sql(f));
  assert.equal(db.prepare('SELECT capacity FROM supervisor_approvals').get().capacity, 'supervisor');
  const e = db.prepare('SELECT first_name, email, organisation FROM department_enquiries').get();
  assert.deepEqual({ ...e }, { first_name: 'B', email: 'b@example.test', organisation: 'Example Trust' });
});
