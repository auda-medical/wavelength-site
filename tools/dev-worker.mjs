// A local Wavelength Worker for the native end-to-end tools when Wrangler is not installed: the real Worker
// (worker/index.js) over the test environment (test/helpers/env.mjs: node:sqlite with every migration applied, a KV
// stub, the wrangler vars). Data lives in memory and is gone when the process stops. Listens on localhost only.
//
// Run: node --import ./test/helpers/register.mjs tools/dev-worker.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { makeEnv, ctx, ORIGIN } from '../test/helpers/env.mjs';
import worker from '../worker/index.js';

const port = Number(process.argv[2]) || 8787;
// Options (1.0.11), for the browser tools that open the website itself (tools/theme-shots.mjs,
// tools/e2e-supervisor-ui.mjs) where Wrangler is not installed:
//   --site          serve the built website from dist/ (run node build.js first) instead of the stand-in page
//   --var NAME=V    override a wrangler.jsonc var, e.g. --var SUPERVISOR_SEARCH=true (repeatable)
const args = process.argv.slice(3), extra = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--var' && args[i + 1]) { const [k, ...v] = args[++i].split('='); extra[k] = v.join('='); }
if (args.includes('--site')) {
  const DIST = path.resolve('dist');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
  extra.ASSETS = { fetch: async (req) => {
    const u = new URL(req.url || req);
    let f = path.join(DIST, decodeURIComponent(u.pathname));
    if (!f.startsWith(DIST)) return new Response('', { status: 403 });
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    else if (!path.extname(f) && fs.existsSync(f + '/index.html')) f = f + '/index.html';
    if (!fs.existsSync(f)) return new Response(fs.existsSync(path.join(DIST, '404.html')) ? fs.readFileSync(path.join(DIST, '404.html')) : 'Not found', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } });
  } };
}
const env = makeEnv(extra);
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
