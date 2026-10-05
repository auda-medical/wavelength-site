// A test Worker environment: D1 (node:sqlite with every migration applied), a KV stub and the wrangler vars.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) {
    if (args.some((a) => a === undefined)) throw new Error('D1_TYPE_ERROR: undefined bound in ' + this.sql.slice(0, 60));
    return new Stmt(this.db, this.sql, args.map((a) => (typeof a === 'boolean' ? Number(a) : a)));
  }
  async first(col) { const r = this.db.prepare(this.sql).get(...this.args); return r ? (col ? r[col] : { ...r }) : null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })), success: true }; }
  async run() {
    const st = this.db.prepare(this.sql);
    if (/\breturning\b/i.test(this.sql)) return { results: st.all(...this.args), meta: {} };
    const r = st.run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  _sync() { return this.db.prepare(this.sql).run(...this.args); }
}
class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) this.db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
  }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map((s) => s._sync()); this.db.exec('COMMIT'); return out.map((r) => ({ meta: { changes: Number(r.changes) } })); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async exec(sql) { this.db.exec(sql); }
}
class KV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const v = this.m.get(k); if (v == null) return null; return type === 'json' ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, typeof v === 'string' ? v : v); }
  async delete(k) { this.m.delete(k); }
}
export function makeEnv(extra = {}) {
  const wr = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const vars = JSON.parse(wr).vars;
  return {
    ...vars, ZEPTOMAIL_TOKEN: '', DB: new D1(), SHARED_IMAGES: new KV(),
    ASSETS: { fetch: async () => new Response('<div id="admin-root"></div>', { headers: { 'Content-Type': 'text/html' } }) },
    ...extra,
  };
}
export const ctx = { waitUntil(p) { Promise.resolve(p).catch(() => {}); } };
export const ORIGIN = 'https://thewavelength.co.uk';

// A tiny cookie-jar client for /api/app/*.
export function client(handler, env) {
  let cookie = '';
  const call = async (path, data, opts = {}) => {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const init = { headers };
    if (data !== undefined) { init.method = 'POST'; headers['Content-Type'] = 'application/json'; headers.Origin = opts.origin || ORIGIN; init.body = JSON.stringify(data); }
    const res = await handler(new Request(ORIGIN + path, init), env, ctx);
    const set = res.headers.get('Set-Cookie');
    if (set) { const v = set.split(';')[0]; cookie = /=$/.test(v) ? '' : v; }
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}
