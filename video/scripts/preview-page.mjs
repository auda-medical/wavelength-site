// Builds the local review page for the films: wavelength-video-output\index.html, a tiny static server (serve.mjs)
// and "Watch the films.cmd", which starts the server on http://localhost:5174 and opens the page. Nothing leaves the
// computer. The page lists version 2 (clean, captioned, portrait), the voice auditions and version 1 (archived), with
// caption files attached to the players. Re-run after rendering:  node scripts/preview-page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.WL_VIDEO_OUT_ROOT || path.resolve(ROOT, '..', '..', 'wavelength-video-output');
const list = (d) => (fs.existsSync(path.join(OUT, d)) ? fs.readdirSync(path.join(OUT, d)) : []);
const mb = (d, f) => (fs.statSync(path.join(OUT, d, f)).size / 1e6).toFixed(1) + ' MB';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const v2 = list('final-v2').filter((f) => f.endsWith('.mp4'));
const v1 = list('final').filter((f) => f.endsWith('.mp4'));
const caps = list('final-v2/captions');
const aud = list('v2-auditions').filter((f) => f.endsWith('.wav'));
const notes = fs.existsSync(path.join(OUT, 'v2-auditions', 'notes.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'v2-auditions', 'notes.json'), 'utf8')) : {};
const label = (f) => f.replace(/^wavelength-/, '').replace(/\.mp4$/, '').replace(/-/g, ' ');
const trackFor = (f) => { const base = f.replace(/-(1080p|4k|vertical-1080x1920|captioned.*)\.mp4$/, '').replace(/\.mp4$/, ''); const vtt = caps.find((c) => c.startsWith(base) && c.endsWith('.vtt')); return vtt && !/captioned/.test(f) ? `<track kind="captions" srclang="en" label="English" src="final-v2/captions/${vtt}">` : ''; };
const film = (d, f) => `<figure class="${/vertical/.test(f) ? 'tall' : ''}"><video controls preload="metadata" src="${d}/${f}">${d === 'final-v2' ? trackFor(f) : ''}</video><figcaption><b>${esc(label(f))}</b><span>${mb(d, f)}</span></figcaption></figure>`;
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wavelength films</title><link rel="icon" href="data:,">
<style>:root{color-scheme:dark}body{margin:0;font:16px/1.5 "Segoe UI",system-ui,sans-serif;background:#0A1526;color:#F7F5F0}main{max-width:1280px;margin:0 auto;padding:24px 16px 80px}h1{font-weight:500;font-size:30px;margin:8px 0 4px}h2{font-weight:500;font-size:22px;margin:40px 0 6px;color:#7FC4CC}p{color:#9FB0C2;max-width:860px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}figure{margin:0;background:#0F1E33;border:1px solid #1d2f48;border-radius:14px;overflow:hidden}figure.tall video{aspect-ratio:9/16;max-height:640px}video{width:100%;display:block;background:#000}figcaption{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;font-size:14px;text-transform:capitalize}figcaption span{color:#9FB0C2;text-transform:none}.aud{display:grid;gap:12px}.aud div{background:#0F1E33;border:1px solid #1d2f48;border-radius:12px;padding:12px 14px}.aud audio{width:100%;margin-top:8px}.note{font-size:14px;color:#9FB0C2}.warn{border-left:3px solid #E9B872;padding-left:12px}</style></head><body><main>
<h1>Wavelength films: review copies</h1><p class="warn">Private review copies on this computer. Not approved for publication. Version 2 needs your viewing and listening approval: the narration voice in particular.</p>
<h2>Version 2</h2><p>Clean versions have no burned-in subtitles; use the CC button for English captions. Captioned versions are for muted social playback. Caption files (SRT and WebVTT) are in final-v2\\captions.</p>
<div class="grid">${v2.length ? v2.map((f) => film('final-v2', f)).join('') : '<p>Not rendered yet.</p>'}</div>
<h2>Voice auditions (version 2)</h2><p>The same passage, with real script lines, in each candidate voice. Please listen and choose; measurements and machine transcription cannot judge warmth or naturalness. Every voice is synthetic and designed from a written description: none copies a real person.</p>
<div class="aud">${aud.map((f) => `<div><b>${esc(f.replace('.wav', ''))}</b><div class="note">${esc(notes[f] || '')}</div><audio controls preload="none" src="v2-auditions/${f}"></audio></div>`).join('') || '<p>None yet.</p>'}</div>
<h2>Version 1 (archived, not approved)</h2><div class="grid">${v1.map((f) => film('final', f)).join('')}</div>
</main></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'serve.mjs'), `// Local-only static server for the review page (http://localhost:5174). Ctrl+C to stop.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.vtt': 'text/vtt; charset=utf-8', '.srt': 'text/plain; charset=utf-8', '.json': 'application/json' };
http.createServer((req, res) => {
  const p = path.normalize(path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(DIR)) { res.writeHead(403); return res.end(); }
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const size = fs.statSync(file).size, type = TYPES[path.extname(file)] || 'application/octet-stream';
  const m = /bytes=(\\d*)-(\\d*)/.exec(req.headers.range || '');
  if (m) { const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1; res.writeHead(206, { 'Content-Type': type, 'Content-Range': \`bytes \${a}-\${b}/\${size}\`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 }); return fs.createReadStream(file, { start: a, end: b }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(file).pipe(res);
}).listen(5174, '127.0.0.1', () => console.log('Wavelength films: http://localhost:5174  (close this window to stop)'));
`);
fs.writeFileSync(path.join(OUT, 'Watch the films.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nstart "" http://localhost:5174\r\nnode serve.mjs\r\n');
console.log('wrote', path.join(OUT, 'index.html'), `(${v2.length} v2 films, ${aud.length} auditions, ${v1.length} v1 films)`);
