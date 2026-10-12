// Website films (October 2026): worker/media.js serves /media/* with byte ranges (Safari on iPhone needs 206; Workers
// static assets alone always answer 200), the homepage and /pocus-logbook/ carry accessible native players, and every
// media file fits Cloudflare's 25 MiB static-asset limit. Run after `node build.js` for the page checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serveMedia, parseRange } from '../worker/media.js';

const ROOT = new URL('../', import.meta.url);
const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
const assetsFor = (files) => ({ fetch: async (req) => { const p = new URL(req.url).pathname; const b = files[p]; return b ? new Response(b, { headers: { 'Content-Length': String(b.length), ETag: '"e1"' } }) : new Response('Not found', { status: 404 }); } });
const env = { ASSETS: assetsFor({ '/media/wavelength-app-film-v4.mp4': bytes, '/media/wavelength-app-film-v4.en.vtt': new TextEncoder().encode('WEBVTT\n') }) };
const get = (path, headers = {}, method = 'GET') => serveMedia(new Request('https://thewavelength.co.uk' + path, { method, headers }), env);

test('ranges: one range, open-ended, suffix, clamped end; unsatisfiable and ignored forms', () => {
  assert.deepEqual(parseRange('bytes=0-1', 1000), { start: 0, end: 1 });
  assert.deepEqual(parseRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 });
  for (const h of ['bytes=1000-', 'bytes=5-2', 'bytes=-0', 'bytes=-']) assert.equal(parseRange(h, 1000), 'unsatisfiable', h);
  for (const h of [null, '', 'items=0-1', 'bytes=0-1,5-6', 'bytes=abc']) assert.equal(parseRange(h, 1000), null, String(h));
});

test('without a cache: whole file 200, a range 206 with Content-Range, 416 past the end, HEAD has no body', async () => {
  const full = await get('/media/wavelength-app-film-v4.mp4');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('Content-Type'), 'video/mp4');
  assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(full.headers.get('Content-Length'), '1000');
  assert.match(full.headers.get('Cache-Control'), /public, max-age=604800/);
  assert.equal((await full.arrayBuffer()).byteLength, 1000);
  const part = await get('/media/wavelength-app-film-v4.mp4', { Range: 'bytes=0-1' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 0-1/1000');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [0, 1]);
  const tail = await get('/media/wavelength-app-film-v4.mp4', { Range: 'bytes=990-' });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get('Content-Range'), 'bytes 990-999/1000');
  const bad = await get('/media/wavelength-app-film-v4.mp4', { Range: 'bytes=2000-' });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('Content-Range'), 'bytes */1000');
  const head = await get('/media/wavelength-app-film-v4.mp4', { Range: 'bytes=0-1' }, 'HEAD');
  assert.equal(head.status, 206);
  assert.equal(head.body, null);
  const vtt = await get('/media/wavelength-app-film-v4.en.vtt');
  assert.equal(vtt.headers.get('Content-Type'), 'text/vtt; charset=utf-8');
});

test('only the named media files: other names, paths and methods are refused', async () => {
  for (const p of ['/media/', '/media/../worker/index.js', '/media/x.exe', '/media/Film.MP4', '/media/a/b.mp4', '/media/wavelength-missing.mp4']) assert.equal((await get(p)).status, 404, p);
  assert.equal((await get('/media/wavelength-app-film-v4.mp4', {}, 'POST')).status, 405);
});

test('with Cloudflare\'s cache: the whole file is stored once, and ranges are answered from the cache', async () => {
  // A stand-in for caches.default with the documented behaviour: match() with Range slices a stored 200 into a 206.
  const store = new Map(); let puts = 0, assetReads = 0;
  globalThis.caches = { default: {
    async put(req, res) { puts++; assert.equal(res.status, 200); assert.ok(res.headers.get('Content-Length')); store.set(new URL(req.url).pathname, { body: new Uint8Array(await res.arrayBuffer()), headers: res.headers }); },
    async match(req) {
      const e = store.get(new URL(req.url).pathname); if (!e) return undefined;
      const r = parseRange(req.headers.get('Range'), e.body.length);
      if (r && r !== 'unsatisfiable') { const h = new Headers(e.headers); h.set('Content-Range', `bytes ${r.start}-${r.end}/${e.body.length}`); h.set('Content-Length', String(r.end - r.start + 1)); return new Response(e.body.subarray(r.start, r.end + 1), { status: 206, headers: h }); }
      return new Response(e.body, { status: 200, headers: e.headers });
    },
  } };
  const counting = { ASSETS: { fetch: async (req) => { assetReads++; return env.ASSETS.fetch(req); } } };
  try {
    const a = await serveMedia(new Request('https://thewavelength.co.uk/media/wavelength-app-film-v4.mp4', { headers: { Range: 'bytes=0-1' } }), counting);
    assert.equal(a.status, 206);
    assert.equal(a.headers.get('Content-Type'), 'video/mp4');
    const b = await serveMedia(new Request('https://thewavelength.co.uk/media/wavelength-app-film-v4.mp4', { headers: { Range: 'bytes=500-599' } }), counting);
    assert.equal(b.status, 206);
    assert.equal(b.headers.get('Content-Range'), 'bytes 500-599/1000');
    assert.equal(puts, 1, 'stored once');
    assert.equal(assetReads, 1, 'the asset is read once; the second range comes from the cache');
  } finally { delete globalThis.caches; }
});

test('the pages: native players with poster and default captions, no autoplay, the journey screens, and a route through the Worker', () => {
  const page = (p) => fs.readFileSync(new URL(`dist${p}index.html`, ROOT), 'utf8');
  const home = page('/'), log = page('/pocus-logbook/');
  for (const [html, base] of [[home, 'wavelength-free-logbook-film-v4'], [log, 'wavelength-app-film-v4']]) {
    const v = (html.match(/<video[^>]*>[\s\S]*?<\/video>/) || [''])[0];
    for (const a of [' controls', ' playsinline', ' preload="metadata"', `poster="/media/${base}-poster.jpg"`, 'aria-label="']) assert.ok(v.includes(a), `${base}: ${a}`);
    assert.ok(!/autoplay/i.test(v), 'never autoplays');
    assert.ok(v.includes(`<source src="/media/${base}.mp4" type="video/mp4">`));
    assert.ok(v.includes(`<track kind="captions" srclang="en" label="English" src="/media/${base}.en.vtt" default>`));
    assert.ok(html.includes('class="film-fallback"'), 'a download link if the film cannot load');
    const text = (html.match(/<details class="film-transcript"><summary>Read the film as text<\/summary>([\s\S]*?)<\/details>/) || [])[1] || '';
    const cues = fs.readFileSync(new URL(`src/media/${base}.en.vtt`, ROOT), 'utf8').split(/\r?\n/).filter((l) => l && !l.includes('-->') && !/^(WEBVTT|\d+)$/.test(l.trim()));
    assert.ok(cues.length > 5 && cues.every((l) => text.includes(l.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))), `${base}: every caption line is in the text version`);
  }
  assert.ok(home.includes('Tune in') || home.includes('Gain clarity'), 'the homepage opening is kept');
  assert.ok(home.includes('href="/pocus-logbook/#watch"') && home.includes('See how the app works'));
  assert.ok(home.includes('Start your free logbook'));
  assert.ok(log.includes('data-film-play="app-film"') && log.includes('Watch how it works') && log.includes('id="watch"'));
  assert.ok(log.indexOf('id="watch"') < log.indexOf('What it is'), 'the film is right below the opening');
  assert.equal((log.match(/<img src="\/media\/wavelength-app-step-\d-[a-z-]+\.jpg" alt="[^"]{20,}"/g) || []).length, 4, 'four journey screens with real alt text');
  assert.ok(log.includes('Start your free logbook') && log.includes('Open in your browser'));
  const w = fs.readFileSync(new URL('wrangler.jsonc', ROOT), 'utf8');
  assert.match(w, /"run_worker_first": \[[^\]]*"\/media\/\*"/);
});

test('every /media/ file the site links exists, and each fits the 25 MiB static-asset limit', () => {
  const dir = new URL('dist/media/', ROOT);
  const files = fs.readdirSync(dir);
  for (const f of files) assert.ok(fs.statSync(new URL(f, dir)).size < 25 * 1024 * 1024, f);
  const linked = new Set();
  for (const p of ['/', '/pocus-logbook/']) for (const m of fs.readFileSync(new URL(`dist${p}index.html`, ROOT), 'utf8').matchAll(/\/media\/([a-z0-9.-]+)/g)) linked.add(m[1]);
  for (const f of linked) assert.ok(files.includes(f), `missing ${f}`);
  assert.ok(linked.size >= 10);
  for (const f of files) assert.match(`/media/${f}`, /^\/media\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\.en)?\.(mp4|vtt|jpg)$/, `${f} is a name worker/media.js serves`);
});
