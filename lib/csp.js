// Content-Security-Policy for the static site and app (November 2026, NHS assurance work).
// Every script the site runs is either a file on our own origin or a small inline script that the build writes.
// The build hashes each inline script in dist/ and lists the hashes, so the browser runs those and nothing else:
// an injected <script>, an inline event handler (onclick=...) or a javascript: link is refused.
// Only script-src is restricted. Images, media, styles, fonts and fetch keep their current behaviour (no default-src),
// because the app draws images from blob: and data: URLs and the site uses inline styles.
// The admin console and volunteer area are not covered: the Worker sets their own policy (worker/index.js HEADERS),
// because console pages are assembled at request time and use inline confirm handlers.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"];
// Scripts that are data, not code: browsers do not run them, so they need no hash.
const DATA_TYPES = /^(application\/(ld\+)?json|importmap|text\/template|text\/x-template)$/i;
const JS_TYPES = /^(|module|text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)$/i;

// Inline scripts in one HTML document, as the browser sees them. The HTML parser turns CRLF and lone CR into LF
// before the script text exists, so hash what the parser would produce.
function inlineScripts(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = ((/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs) || [])[1] || '').trim();
    if (DATA_TYPES.test(type)) continue;
    if (!JS_TYPES.test(type)) continue; // unknown types are not run either
    out.push(m[2].replace(/\r\n?/g, '\n'));
  }
  return out;
}

const hashOf = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function htmlFiles(dir) {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.html?$/i.test(e.name)) files.push(p);
    }
  })(dir);
  return files;
}

// Distinct hashes of every inline script under dir, sorted so the header is stable between identical builds.
function scriptHashes(dir) {
  const set = new Set();
  for (const f of htmlFiles(dir)) for (const s of inlineScripts(fs.readFileSync(f, 'utf8'))) set.add(hashOf(s));
  return [...set].sort();
}

// The policy: our own origin plus the listed inline scripts.
function policy(hashes) {
  return [...BASE, `script-src 'self' ${hashes.join(' ')}`.trim(), 'upgrade-insecure-requests'].join('; ');
}

// Same policy without script-src, as before November 2026. The Worker uses it for the admin console and volunteer area.
const LEGACY = [...BASE, 'upgrade-insecure-requests'].join('; ');

module.exports = { inlineScripts, hashOf, scriptHashes, policy, LEGACY, htmlFiles };
