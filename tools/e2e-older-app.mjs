// Older apps against this Worker (supervisor verification fix, October 2026): an app built before the new display
// (the website app now live, or a store app already installed) must still show one consistent status once an
// administrator approves from the person page: approved, and never "being reviewed" for the same application.
// Self-contained and local, like tools/e2e-verified.mjs: the real Worker in process over the test database, email
// captured, fictional people. DIST: the older app's built dist/ folder.
// Run: DIST=<older dist> node --import ./test/helpers/register.mjs tools/e2e-older-app.mjs <outdir>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from '../test/helpers/verify.mjs';
import worker from '../worker/index.js';
import { supervisorsAdminPost } from '../worker/supervisors-admin.js';

const out = process.argv[2] || 'shots-older';
fs.mkdirSync(out, { recursive: true });
const errors = [];
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) errors.push(m); };
const mail = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => { const url = String(u && u.url || u); if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(u, init); try { mail.push(JSON.parse(init.body)); } catch { /* none */ } return new Response('{}'); };
const DIST = path.resolve(process.env.DIST || 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const ASSETS = { fetch: async (req) => { const u = new URL(req.url || req); let f = path.join(DIST, decodeURIComponent(u.pathname)); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!f.startsWith(DIST) || !fs.existsSync(f)) return new Response('Not found', { status: 404 }); return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } }); } };
const env = makeEnv({ ASSETS, SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: 'local-capture-only', ZEPTOMAIL_API: 'https://capture.invalid/email' });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'); const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    for (const k of ['origin', 'referer']) { const v = headers.get(k); if (v) headers.set(k, v.replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+/, ORIGIN)); }
    const init = { method: req.method, headers }; if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await worker.fetch(new Request(ORIGIN + url.pathname + url.search, init), env, wctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;
const admin = (o) => supervisorsAdminPost(env, adminForm({ reviewer: 'Alex Reviewer', ...o }), 'wavelength', wctx);
const ready = (c) => c.call('/api/app/profile', { profile: { pathways: ['famus'], onboarded: true, grade: 'Consultant', supervisor: true }, declaration: true });

// The production case: invited, applied, registration checked, then approved from the person page.
const learner = await verifiedAccount(env, 'casey.older@example.test', { firstName: 'Casey', lastName: 'Trainee' }); await ready(learner);
await learner.call('/api/app/supervisors/add', { email: 'jordan.older@example.test' });
const sup = await verifiedAccount(env, 'jordan.older@example.test', { firstName: 'Jordan', lastName: 'Example', title: 'Dr' }); await ready(sup);
const inv = (await sup.call('/api/app/supervisors')).body.invites[0]; await sup.call('/api/app/supervisors/accept', { id: inv.id });
await sup.call('/api/app/supervisor/application', { role: 'Consultant', organisation: 'Example General Hospital', registration: { regulator: 'gmc', number: '7300001', profession: 'Doctor' }, experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true }, justification: 'Fictional applicant for a local compatibility check of older apps against the corrected Worker.', evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'] });
await sup.call('/api/app/supervisor/submit', { declaration: true });
const id = await idOf(env, 'jordan.older@example.test');
const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(id).first();
await admin({ action: 'reg_verify', learner: id, sid: reg.id, register_name: 'Jordan Example', checked: '1' });
const r = await admin({ action: 'appr_add', learner: id, scope: ['famus:famus-thoracic'] });
check(/^Approved until .*Approval email: accepted by the email provider\./.test(r.m), `person-page approval: ${r.m}`);

const browser = await chromium.launch();
for (const [who, client, route] of [['supervisor', sup, '#/supervisor'], ['learner', learner, '#/supervisors']]) {
  for (const w of [390, 1440]) {
    const cx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'en-GB' });
    const [name, ...v] = client.cookie.split('='); await cx.addCookies([{ name, value: v.join('='), domain: 'localhost', path: '/' }]);
    const page = await cx.newPage();
    page.on('pageerror', (e) => errors.push(`${who} ${w}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`${who} ${w}: ${m.text()}`); });
    await page.goto(BASE + '/app/' + route);
    await page.waitForFunction(() => /Verified|verified|approved/i.test(document.querySelector('main') ? document.querySelector('main').innerText : ''), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const t = await page.locator('main').innerText();
    check(/Wavelength Verified|Verified Supervisor|Wavelength-approved supervisor/.test(t), `${who} ${w}px: shown as approved`);
    check(!/being reviewed|under review/i.test(t), `${who} ${w}px: nothing says the application is under review`);
    await page.screenshot({ path: path.join(out, `${who}-${w}.png`) });
    await cx.close();
  }
}
await browser.close(); server.close();
console.log(errors.length ? `\n${errors.length} problem(s):\n${errors.join('\n')}` : '\nOlder app checks passed.');
process.exit(errors.length ? 1 : 0);
