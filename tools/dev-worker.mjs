// A local Wavelength Worker for the native end-to-end tools when Wrangler is not installed: the real Worker
// (worker/index.js) over the test environment (test/helpers/env.mjs: node:sqlite with every migration applied, a KV
// stub, the wrangler vars). Data lives in memory and is gone when the process stops. Listens on localhost only.
//
// Run: node --import ./test/helpers/register.mjs tools/dev-worker.mjs [port]
import http from 'node:http';
import { makeEnv, ctx, ORIGIN } from '../test/helpers/env.mjs';
import worker from '../worker/index.js';

const port = Number(process.argv[2]) || 8787;
const env = makeEnv();
// Test hooks the native tools use to look at the server side (never part of the real Worker).
async function peek(req, res, url) {
  if (url.pathname === '/__dev/entries') {
    const rows = (await env.DB.prepare('SELECT id, learner_id, scan_type, scan_date, updated_at, deleted FROM logbook_entries ORDER BY updated_at').all()).results;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows)); return true;
  }
  return false;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await peek(req, res, url)) return;
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const out = await worker.fetch(new Request(ORIGIN + url.pathname + url.search, init), env, ctx);
    const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(out.status, h);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(String(e && e.stack || e));
  }
}).listen(port, '127.0.0.1', () => console.log(`dev worker on http://localhost:${port}`));
