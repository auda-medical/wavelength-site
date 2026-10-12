// Self-hosted website films and their stills (/media/*), served by the Worker so that byte-range requests work.
// Workers static assets answer every request with the whole file (200, even with a Range header: checked on production
// on 12 October 2026), and Safari on iPhone will not play an MP4 without 206 range responses. So the first request for a
// file stores the whole file (read from env.ASSETS) in Cloudflare's cache, and from then on the cache answers range
// requests itself with 206 (Workers Cache API: match() honours Range for a stored response with a Content-Length); the
// Worker never slices a 15 MB film in JavaScript. Where there is no cache (local tests, or a store that failed), the
// one range asked for is sliced here. Only the named files below are served; anything else is a plain 404.
const TYPES = { mp4: 'video/mp4', vtt: 'text/vtt; charset=utf-8', jpg: 'image/jpeg' };
const NAME = /^\/media\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\.en)?\.(mp4|vtt|jpg)$/;
// A week: the files are versioned by name (a new cut gets a new name), so they never change under the same address.
const CACHE_CONTROL = 'public, max-age=604800';

const plain = (status, extra = {}) => new Response(status === 404 ? 'Not found' : '', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra } });

// One byte range from a Range header ("bytes=a-b", "bytes=a-" or "bytes=-n") over a file of `size` bytes:
// { start, end } (inclusive), 'unsatisfiable', or null to send the whole file (no header, another unit, or several
// ranges, which a video player never asks for).
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null; // unparseable, another unit, or several ranges: ignored, as Cloudflare does
  if (m[1] === '' && m[2] === '') return 'unsatisfiable';
  let start, end;
  if (m[1] === '') { const n = Number(m[2]); if (!n) return 'unsatisfiable'; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

// The response for a HEAD is the GET's status and headers without the body.
const forMethod = (res, method) => (method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res);

export async function serveMedia(req, env) {
  const url = new URL(req.url);
  const m = NAME.exec(url.pathname);
  if (!m) return plain(404);
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, { Allow: 'GET, HEAD' });
  const key = new Request(url.origin + url.pathname, { method: 'GET' });
  const range = req.headers.get('Range');
  const lookup = () => (range ? new Request(key.url, { headers: { Range: range } }) : key);
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  if (cache) {
    const hit = await cache.match(lookup());
    if (hit) return forMethod(hit, req.method);
  }
  let res = await env.ASSETS.fetch(key);
  if (!res.ok) return plain(404);
  const size = Number(res.headers.get('Content-Length'));
  const headers = { 'Content-Type': TYPES[m[1]], 'Cache-Control': CACHE_CONTROL, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  const etag = res.headers.get('ETag');
  if (etag) headers.ETag = etag;
  if (cache && size > 0) {
    try {
      await cache.put(key, new Response(res.body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } }));
      const stored = await cache.match(lookup());
      if (stored) return forMethod(stored, req.method);
    } catch { /* not stored: answered below from the asset itself */ }
    res = await env.ASSETS.fetch(key);
    if (!res.ok) return plain(404);
  }
  const body = new Uint8Array(await res.arrayBuffer());
  const r = parseRange(range, body.length);
  if (r === 'unsatisfiable') return plain(416, { 'Content-Range': `bytes */${body.length}`, 'Accept-Ranges': 'bytes' });
  if (!r) return forMethod(new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(body.length) } }), req.method);
  const part = body.subarray(r.start, r.end + 1);
  return forMethod(new Response(part, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${r.start}-${r.end}/${body.length}`, 'Content-Length': String(part.length) } }), req.method);
}
