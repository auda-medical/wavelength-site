// Browser check of the website films and app screens (October 2026; ChatGPT 02:52 and 08:14): the homepage teaser and
// the /pocus-logbook/ film, in Microsoft Edge (H.264), with the real Worker in this process serving dist/ (media through
// worker/media.js, so byte ranges are tested). Phone, tablet and desktop widths: layout, posters, captions, the player,
// "Watch how it works" by mouse, keyboard and with reduced motion, a failed film's download link, links, and how much
// video loads before anyone presses play. Fictional data only; nothing leaves the machine.
// Run: node build.js && node --import ./test/helpers/register.mjs tools/e2e-media.mjs <outdir>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { makeEnv, ctx as wctx, ORIGIN } from '../test/helpers/env.mjs';
import worker from '../worker/index.js';
import { hashPassword } from '../worker/app-util.js';

const OUT = process.argv[2] || 'shots-media';
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
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
async function context(opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await c.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${p.url()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  return { c, p };
}
const SIZES = [['phone', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 900]];
const PAGES = [['home', '/', 'home-film', 'wavelength-free-logbook-film-v4'], ['logbook', '/pocus-logbook/', 'app-film', 'wavelength-app-film-v4']];

for (const [label, w, h] of SIZES) for (const [name, url, vid, base] of PAGES) {
  const { c, p } = await context({ viewport: { width: w, height: h } });
  const media = [];
  p.on('request', (r) => { if (/\/media\/.*\.mp4$/.test(r.url())) media.push(r.headers().range || 'none'); });
  await p.goto(BASE + url, { waitUntil: 'load' });
  const v = p.locator('#' + vid);
  await v.scrollIntoViewIfNeeded();
  await p.waitForFunction((id) => { const e = document.getElementById(id); return e && e.readyState >= 1; }, vid, { timeout: 15000 }).catch(() => {});
  const st = await p.evaluate(async (id) => {
    const e = document.getElementById(id); const t = e.textTracks[0];
    await new Promise((r) => { if (t && t.cues && t.cues.length) return r(); const tr = e.querySelector('track'); if (tr) tr.addEventListener('load', r, { once: true }); setTimeout(r, 4000); });
    const box = e.getBoundingClientRect();
    return { ready: e.readyState, duration: e.duration, paused: e.paused, autoplay: e.autoplay, tracks: e.textTracks.length, mode: t && t.mode, cues: t && t.cues ? t.cues.length : 0, w: box.width, h: box.height, poster: e.poster,
      over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  }, vid);
  const tag = `${name} ${label} ${w}px`;
  ok(!st.over, `${tag}: no horizontal overflow`);
  ok(st.ready >= 1 && st.duration > (name === 'home' ? 25 : 100), `${tag}: film metadata loads (${Math.round(st.duration)} s)`);
  ok(st.paused && !st.autoplay, `${tag}: nothing plays by itself`);
  ok(st.tracks === 1 && st.mode === 'showing' && st.cues > 3, `${tag}: English captions on by default (${st.cues} cues)`);
  ok(Math.abs(st.w / st.h - 16 / 9) < 0.05 && st.w <= w, `${tag}: player 16:9 and inside the page (${Math.round(st.w)}x${Math.round(st.h)})`);
  const poster = await p.evaluate(async (u) => { const r = await fetch(u); const b = await r.blob(); return { s: r.status, t: r.headers.get('content-type'), n: b.size }; }, st.poster);
  ok(poster.s === 200 && poster.t === 'image/jpeg' && poster.n > 20000, `${tag}: poster loads (${poster.n} bytes)`);
  ok(media.length <= 3, `${tag}: before play, ${media.length} film request(s): ${media.join(' | ')}`);
  if (label === 'desktop') {
    const r206 = await p.evaluate(async (u) => { const r = await fetch(u, { headers: { Range: 'bytes=0-1' } }); return { s: r.status, cr: r.headers.get('content-range'), n: (await r.arrayBuffer()).byteLength, ar: r.headers.get('accept-ranges') }; }, `/media/${base}.mp4`);
    ok(r206.s === 206 && /^bytes 0-1\//.test(r206.cr || '') && r206.n === 2 && r206.ar === 'bytes', `${tag}: byte ranges answered with 206 (${r206.cr})`);
  }
  await p.waitForFunction((id) => { const f = document.getElementById(id).closest(".film"); return f.classList.contains("in") && getComputedStyle(f).opacity === "1"; }, vid, { timeout: 5000 }).then(() => ok(true, `${tag}: the player is revealed and visible`), () => ok(false, `${tag}: the player is revealed and visible`));
  await p.screenshot({ path: path.join(OUT, `${name}-${label}.png`), fullPage: false });
  if (name === 'logbook') {
    const steps = await p.evaluate(() => [...document.querySelectorAll('.app-steps img')].map((i) => ({ alt: i.alt.length, lazy: i.loading })));
    ok(steps.length === 4 && steps.every((s) => s.alt > 20 && s.lazy === 'lazy'), `${tag}: four journey screens with alt text, loaded lazily`);
    await p.locator('.app-steps').scrollIntoViewIfNeeded();
    await p.waitForTimeout(800);
    const loaded = await p.evaluate(() => [...document.querySelectorAll('.app-steps img')].every((i) => i.complete && i.naturalWidth === 960));
    ok(loaded, `${tag}: the four screens load at 960 px`);
    await p.screenshot({ path: path.join(OUT, `logbook-steps-${label}.png`) });
  }
  await c.close();
}

// "Watch how it works": mouse click, keyboard, and reduced motion. Each starts the film with sound allowed.
for (const [how, opts] of [['mouse', {}], ['keyboard', {}], ['reduced motion', { reducedMotion: 'reduce' }]]) {
  const { c, p } = await context({ viewport: { width: 390, height: 844 }, ...opts });
  await p.goto(BASE + '/pocus-logbook/', { waitUntil: 'load' });
  const btn = p.locator('[data-film-play="app-film"]');
  if (how === 'keyboard') { await btn.focus(); await p.keyboard.press('Enter'); } else await btn.click();
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => { const v = document.getElementById('app-film'); const r = v.getBoundingClientRect(); return { t: v.currentTime, paused: v.paused, muted: v.muted, inView: r.top < innerHeight && r.bottom > 0, focused: document.activeElement === v }; });
  ok(s.t > 0.5 && !s.paused && !s.muted && s.inView, `Watch how it works (${how}): the film plays with sound, in view (${s.t.toFixed(1)} s)`);
  if (how === 'keyboard') {
    ok(s.focused, 'keyboard: focus moves to the player, so its controls are reachable');
    const sum = p.locator('#watch .film-transcript summary');
    await sum.focus(); await p.keyboard.press('Enter');
    const open = await p.evaluate(() => { const d = document.querySelector('#watch .film-transcript'); return { open: d.open, paras: d.querySelectorAll('p').length, words: d.textContent.split(/\s+/).length }; });
    ok(open.open && open.paras >= 5 && open.words > 150, `keyboard: "Read the film as text" opens the text version (${open.paras} paragraphs, ${open.words} words)`);
    await p.screenshot({ path: path.join(OUT, 'logbook-text-version-phone.png') });
  }
  if (how === 'mouse') await p.screenshot({ path: path.join(OUT, 'logbook-playing-phone.png') });
  await c.close();
}
// The teaser plays from its own player; the homepage link opens the app page at the film.
{
  const { c, p } = await context({ viewport: { width: 1440, height: 900 } });
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.locator('#home-film').scrollIntoViewIfNeeded();
  await p.locator('#home-film').focus();
  await p.keyboard.press('Space');
  await p.waitForTimeout(1500);
  let s = await p.evaluate(() => ({ t: document.getElementById('home-film').currentTime, paused: document.getElementById('home-film').paused }));
  if (s.paused) { await p.locator('#home-film').click(); await p.waitForTimeout(1500); s = await p.evaluate(() => ({ t: document.getElementById('home-film').currentTime, paused: document.getElementById('home-film').paused })); }
  ok(!s.paused && s.t > 0.3, `homepage teaser plays from its own player (${s.t.toFixed(1)} s)`);
  await p.locator('a[href="/pocus-logbook/#watch"]').first().click();
  await p.waitForURL('**/pocus-logbook/#watch');
  ok(await p.locator('#watch #app-film').count() === 1, '"See how the app works" opens the app page at the film');
  await c.close();
}
// A film that cannot load: its caption shows a download link; the rest of the page works.
{
  const { c, p } = await context({ viewport: { width: 390, height: 844 } });
  await p.route('**/media/wavelength-app-film-v4.mp4', (r) => r.fulfill({ status: 404, body: 'Not found' }));
  await p.goto(BASE + '/pocus-logbook/', { waitUntil: 'load' });
  await p.locator('#app-film').scrollIntoViewIfNeeded();
  await p.waitForTimeout(2500);
  const f = await p.evaluate(() => { const fig = document.getElementById('app-film').closest('figure'); const fb = fig.querySelector('.film-fallback'); return { failed: fig.classList.contains('film-failed'), shown: getComputedStyle(fb).display !== 'none', href: fb.querySelector('a').getAttribute('href') }; });
  ok(f.failed && f.shown && f.href === '/media/wavelength-app-film-v4.mp4', 'film fails to load: the download link shows');
  await p.screenshot({ path: path.join(OUT, 'logbook-film-failed-phone.png') });
  await c.close();
}
const real = errors.filter((e) => !(/status of 404/.test(e) && /pocus-logbook/.test(e)));
ok(!real.length, `no console errors${real.length ? ': ' + real.join(' | ') : ''} (the deliberate 404 of the failure check excepted)`);
await browser.close(); server.close();
console.log(`\n${oks} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
