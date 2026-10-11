// Browser check of the whole-case page (/admin/supervisors/case/, October 2026): the real Worker runs in this process
// over the test database (test/helpers/env.mjs) serving dist/. Fictional people only; nothing leaves the machine.
// Run: node build.js && node --import ./test/helpers/register.mjs tools/e2e-case-view.mjs <outdir>
// Shared login (the rollback path), a supervisor who has applied, then: the case page at 390 and 1440 px (no
// horizontal overflow, no console errors), the links to it, a decision made on it that comes back to it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/app-util.js';
import { verifiedAccount, idOf } from '../test/helpers/verify.mjs';

const OUT = process.argv[2] || 'shots-case-view';
fs.mkdirSync(OUT, { recursive: true });
if (typeof globalThis.HTMLRewriter === 'undefined') globalThis.HTMLRewriter = class {
  constructor() { this.h = []; }
  on(sel, handler) { this.h.push([sel, handler]); return this; }
  transform(res) {
    const h = this.h;
    const body = new ReadableStream({ async start(c) {
      let t = await res.text();
      for (const [sel, handler] of h) {
        const id = sel.replace(/^#/, ''); let inner = null;
        handler.element({ setInnerContent: (v) => { inner = v; } });
        if (inner != null) t = t.replace(new RegExp(`(<[^>]+id="${id}"[^>]*>)(</div>)`), (m, a, b) => a + inner + b);
      }
      c.enqueue(new TextEncoder().encode(t)); c.close();
    } });
    return new Response(body, res);
  }
};
const DIST = path.resolve(process.env.DIST || 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const ASSETS = { fetch: async (req) => {
  const u = new URL(req.url || req);
  let f = path.join(DIST, decodeURIComponent(u.pathname));
  if (!f.startsWith(DIST)) return new Response('', { status: 403 });
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } });
} };
const rnd = (n) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString('base64');
const env = makeEnv({ ASSETS, SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: '', ZEPTOMAIL_API: 'https://capture.invalid/email' });
globalThis.fetch = async () => new Response('{}');
const SHARED = 'Local only shared 1!';
for (const [k, v] of [['admin_username', 'wavelength'], ['admin_hash', await hashPassword(SHARED)], ['volunteer_username', 'volunteer'], ['volunteer_hash', await hashPassword('Local only volunteer 1!')], ['session_secret', rnd(32)]]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    for (const k of ['origin', 'referer']) { const v = headers.get(k); if (v) headers.set(k, v.replace(/^http:\/\/(localhost|127\.0\.0\.1):\d+/, ORIGIN)); }
    const init = { method: req.method, headers };
    if (!['GET', 'HEAD'].includes(req.method)) init.body = Buffer.concat(chunks);
    const r = await worker.fetch(new Request(ORIGIN + url.pathname + url.search, init), env, wctx);
    const h = {}; r.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = k === 'location' ? v.replace(ORIGIN, '') : v; });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) h['set-cookie'] = cookies;
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;

let fails = 0, oks = 0;
const ok = (cond, what) => { if (cond) { oks++; console.log('ok  ', what); } else { fails++; console.log('FAIL', what); } };
const browser = await chromium.launch();
const errors = [];
async function context() {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.url()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  return { c, p };
}
async function shoot(p, name) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    await p.setViewportSize({ width: w, height: h });
    const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    ok(!over, `${name} ${w}px: no horizontal overflow`);
    await p.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: true });
  }
  await p.setViewportSize({ width: 1440, height: 900 });
}

// ---------- A supervisor who has applied (fictional) ----------
const sup = await verifiedAccount(env, 'jordan.case@example.test', { firstName: 'Jordan', lastName: 'Example', organisation: 'Example General Hospital' });
const app1 = await sup.call('/api/app/supervisor/application', {
  role: 'Consultant in Emergency Medicine', organisation: 'Example General Hospital',
  registration: { regulator: 'gmc', number: '7300101', profession: 'Doctor', organisation: 'Example General Hospital' },
  experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
  justification: 'I lead the department ultrasound programme and supervise lung and cardiac scans every week of the year.', evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'],
});
ok(app1.status === 200, 'application saved');
ok((await sup.call('/api/app/supervisor/submit', { declaration: true })).status === 200, 'application sent');
const sid = await idOf(env, 'jordan.case@example.test');
await env.DB.prepare("UPDATE professional_registrations SET status = 'verified', verified_at = ?, verification_method = 'manual_register', register_name = 'Jordan Example' WHERE learner_id = ?").bind(new Date().toISOString(), sid).run();

// ---------- The administrator (shared login) ----------
const { p } = await context();
await p.goto(BASE + '/admin/login/');
await p.fill('input[name=username]', 'wavelength'); await p.fill('input[name=password]', SHARED);
await Promise.all([p.waitForURL('**/admin/'), p.click('button[type=submit]')]);
await p.goto(BASE + '/admin/supervisors/?tab=new');
ok(await p.locator(`a[href="/admin/supervisors/case/?id=${sid}"]`).count() >= 1, 'the queue row links to the whole case');
await p.locator(`a[href="/admin/supervisors/case/?id=${sid}"]`).first().click();
await p.waitForURL(`**/admin/supervisors/case/?id=${sid}`);
ok(await p.locator('h2.display').innerText() === 'Jordan Example', 'case page title');
ok(/waiting for a decision/.test(await p.locator('.case-todo').innerText()), 'what needs doing now: the waiting application');
ok(await p.locator('[data-case-state="applying"]').count() === 1, 'standing: application in progress');
for (const id of ['case-application', 'case-registration', 'case-credentials', 'case-approvals', 'case-standing', 'case-history']) ok(await p.locator(`#${id}`).count() === 1, `section ${id}`);
await shoot(p, '01-case-new-application');
// The to-do link jumps to the decision on the same page.
await p.locator('.case-todo a').first().click();
ok(p.url().endsWith('#case-application'), 'to-do link goes to the application section');
// Decide from the case page: approve one module; the answer comes back to the case page.
const form = p.locator('form:has(input[name=action][value=app_approve])');
await form.locator('input[name=scope][value="famus:famus-thoracic"]').check();
await form.locator('input[name=reviewer]').fill('Alex Reviewer');
await Promise.all([p.waitForURL(`**/admin/supervisors/case/?id=${sid}&m=*`), form.locator('button[type=submit]').click()]);
ok(/Approved/.test(await p.locator('[role=status]').innerText()), 'decision message shown on the case page');
ok(await p.locator('[data-case-state="active"]').count() === 1, 'standing now active');
ok(/Approved until/.test(await p.locator('[data-case-state]').innerText()), 'approved-until date shown');
const todo2 = (await p.locator('.case-todo').count()) ? await p.locator('.case-todo').innerText() : '';
// Email is not configured in this check, so the approval email fails and is listed: that is the right answer.
ok(!todo2 || /^Approval email failed/.test(todo2.trim()), 'nothing left to do except the approval email, which cannot send here: ' + JSON.stringify(todo2));
ok(/app_approve|application/.test(await p.locator('#case-history').innerText()), 'the decision is in the one history');
await shoot(p, '02-case-approved');
// The person and application pages link to the case.
await p.goto(BASE + `/admin/supervisors/?id=${sid}`);
ok(await p.locator(`a[href="/admin/supervisors/case/?id=${sid}"]`).count() >= 1, 'person page links to the whole case');
await p.goto(BASE + '/admin/supervisors/case/?id=999999');
ok(/Not found/.test(await p.content()), 'unknown person: not found');

ok(!errors.length, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close(); server.close();
console.log(`\n${oks} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
