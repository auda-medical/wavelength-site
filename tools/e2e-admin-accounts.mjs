// Browser check of native administrator accounts (worker/admin/): the real Worker runs in this process over the test
// database (test/helpers/env.mjs) serving dist/. Fictional people and throwaway secrets only; nothing leaves the machine.
// Run: node build.js && node --import ./test/helpers/register.mjs tools/e2e-admin-accounts.mjs <outdir>
// Steps: shared login -> first Owner set-up -> activation -> two-step set-up (QR and key) -> recovery codes -> add the
// General Manager -> her activation and set-up -> what she sees and is refused. Every page at 390 and 1440 px: no
// horizontal overflow, no console errors.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/app-util.js';
import { fromBase32, hotp, stepAt } from '../worker/admin/crypto.js';

const OUT = process.argv[2] || 'shots-admin-accounts';
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
const BOOT = 'local-browser-check-' + rnd(9);
const env = makeEnv({ ASSETS, ADMIN_PEPPER: rnd(24), ADMIN_TOTP_KEY: rnd(32), ADMIN_BOOTSTRAP_CODE: BOOT, ZEPTOMAIL_TOKEN: '', ZEPTOMAIL_API: 'https://capture.invalid/email' });
globalThis.fetch = async () => new Response('{}');
const SHARED = 'Local only shared 1!';
for (const [k, v] of [['admin_username', 'wavelength'], ['admin_hash', await hashPassword(SHARED)], ['volunteer_username', 'volunteer'], ['volunteer_hash', await hashPassword('Local only volunteer 1!')], ['session_secret', rnd(32)]]) await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(k, v).run();
await env.DB.prepare("INSERT INTO volunteers (first_name, last_name, email) VALUES ('Ann', 'Example', 'ann@example.test')").run();

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
const code = async (key, s = stepAt()) => hotp(fromBase32(key), s);
const keyOn = async (p) => (await p.locator('[data-key]').innerText()).replace(/\s+/g, '');

// ---------- The owner ----------
const { p: o } = await context();
await o.goto(BASE + '/admin/login/');
await o.fill('input[name=username]', 'wavelength'); await o.fill('input[name=password]', SHARED);
await Promise.all([o.waitForURL('**/admin/'), o.click('button[type=submit]')]);
await o.goto(BASE + '/admin/accounts/');
await shoot(o, '01-bootstrap');
await o.fill('input[name=code]', BOOT); await o.fill('input[name=username]', 'owner'); await o.fill('input[name=display_name]', 'Olivia Owner');
await o.click('form button[type=submit]');
await o.waitForSelector('[data-activation-link]');
const ownerLink = (await o.locator('[data-activation-link] p').nth(1).innerText()).trim().replace(ORIGIN, '');
ok(ownerLink.startsWith('/admin/activate/?t='), 'owner activation link shown once');
await o.goto(BASE + ownerLink);
await shoot(o, '02-activate');
await o.fill('input[name=password]', 'Spring meadow lantern 2026'); await o.fill('input[name=password2]', 'Spring meadow lantern 2026');
await Promise.all([o.waitForURL('**/admin/two-step/setup/'), o.click('button[type=submit]')]);
ok(await o.locator('svg[aria-label="QR code for your authenticator app"]').count() === 1, 'QR code drawn');
await shoot(o, '03-enrol');
const ownerKey = await keyOn(o);
await o.fill('input[name=code]', await code(ownerKey));
await o.click('button[type=submit]');
await o.waitForSelector('[data-recovery-codes] li');
ok(await o.locator('[data-recovery-codes] li').count() === 10, 'ten recovery codes shown');
await shoot(o, '04-recovery-codes');
await o.click('text=I have saved them');
await o.waitForURL('**/admin/');
ok(/Signed in as Olivia Owner/.test(await o.content()), 'console names the owner');
await shoot(o, '05-console-owner');
await o.goto(BASE + '/admin/accounts/');
await o.fill('form:has(input[value=create]) input[name=username]', 'zara');
await o.fill('form:has(input[value=create]) input[name=display_name]', 'Zara Manager');
await o.selectOption('form:has(input[value=create]) select[name=role]', 'general_manager');
await o.click('form:has(input[value=create]) button[type=submit]');
await o.waitForSelector('[data-activation-link]');
const gmLink = (await o.locator('[data-activation-link] p').nth(1).innerText()).trim().replace(ORIGIN, '');
await shoot(o, '06-administrators');

// ---------- The General Manager ----------
const { p: z } = await context();
await z.goto(BASE + gmLink);
await z.fill('input[name=password]', 'Quiet harbour evening 2026'); await z.fill('input[name=password2]', 'Quiet harbour evening 2026');
await Promise.all([z.waitForURL('**/admin/two-step/setup/'), z.click('button[type=submit]')]);
const gmKey = await keyOn(z);
await z.fill('input[name=code]', await code(gmKey));
await z.click('button[type=submit]');
await z.waitForSelector('[data-recovery-codes] li');
await z.click('text=I have saved them');
await z.waitForURL('**/admin/');
const nav = await z.locator('nav.admin-nav').innerText();
ok(/Volunteers/.test(nav) && /Supervisor verification/.test(nav) && !/Administrators/.test(nav) && !/Logins/.test(nav), 'GM navigation: routine sections only');
await shoot(z, '07-console-gm');
await z.goto(BASE + '/admin/volunteers/');
ok(await z.locator('text=ann@example.test').count() > 0, 'GM sees volunteers');
ok(await z.locator('button.danger:has-text("Delete")').count() >= 1, 'delete button is shown (the server refuses it)');
z.once('dialog', (d) => d.accept());
await z.click('button.danger:has-text("Delete")');
await z.waitForSelector('text=Not available to your account');
ok(/Not available to your account/.test(await z.content()), 'GM delete refused with a clear page');
ok((await env.DB.prepare('SELECT COUNT(*) AS n FROM volunteers').first()).n === 1, 'nothing deleted');
await shoot(z, '08-denied');
await z.goto(BASE + '/admin/account/');
await shoot(z, '09-your-account');
// Sign out, then the two-step page on the way back in.
await z.goto(BASE + '/admin/logout/');
await z.fill('input[name=username]', 'zara'); await z.fill('input[name=password]', 'Quiet harbour evening 2026');
await Promise.all([z.waitForURL('**/admin/two-step/'), z.click('button[type=submit]')]);
await shoot(z, '10-two-step');
await z.fill('input[name=code]', await code(gmKey, stepAt() + 1));
await Promise.all([z.waitForURL('**/admin/'), z.click('button[type=submit]')]);
ok(true, 'GM signed in again with password and code');

// The refused delete answers 403 on purpose; the browser logs that response. Anything else is a real error.
const real = errors.filter((e) => !(e.includes('/admin/volunteers/: Failed to load resource') && e.includes('status of 403')));
errors.length = 0; errors.push(...real);
ok(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
server.close();
console.log(`\n${oks} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
