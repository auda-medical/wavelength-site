// NHS assurance work (November 2026): the Content-Security-Policy built from inline-script hashes (lib/csp.js), and
// the Trust and security, Intended purpose and clinical safety, and Accessibility statement pages
// (lib/assurance-pages.js). Reads the built site (node build.js first, as the other dist tests do).
// The "claims" tests tie statements on the pages to the code that makes them true: if one fails, change the page
// and the DTAC evidence pack together with the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CSP = require('../lib/csp.js');
const { assurancePages } = require('../lib/assurance-pages.js');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIST = path.join(ROOT, 'dist');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const site = JSON.parse(read('data/site.json'));
const esc = (s) => String(s);
const PAGES = ['/trust/', '/clinical-safety/', '/accessibility/'];

// ---------- CSP ----------
test('inline scripts are hashed as the browser sees them', () => {
  // MDN's worked example: sha256 of exactly this script text.
  assert.equal(CSP.hashOf("alert('Hello, world.');"), "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
  const html = `<script src="/a.js"></script><script type="application/ld+json">{"a":1}</script><script>a()\r\nb()</script><script type="module">c()</script><script type="text/plain">no</script>`;
  assert.deepEqual(CSP.inlineScripts(html), ['a()\nb()', 'c()']);
});

test('the policy restricts scripts without unsafe-inline or unsafe-eval', () => {
  const p = CSP.policy(["'sha256-x'"]);
  assert.match(p, /script-src 'self' 'sha256-x'/);
  assert.match(p, /frame-ancestors 'none'/);
  assert.match(p, /object-src 'none'/);
  assert.match(p, /base-uri 'self'/);
  assert.doesNotMatch(p, /unsafe-inline|unsafe-eval|default-src/);
});

test('every inline script in the built site is allowed by the _headers policy', { skip: !existsSync(path.join(DIST, '_headers')) && 'build first' }, () => {
  const headers = readFileSync(path.join(DIST, '_headers'), 'utf8');
  const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  assert.ok(line, 'Content-Security-Policy line present');
  const missing = [];
  for (const f of CSP.htmlFiles(DIST)) for (const s of CSP.inlineScripts(readFileSync(f, 'utf8'))) if (!line.includes(CSP.hashOf(s))) missing.push(path.relative(DIST, f));
  assert.deepEqual([...new Set(missing)], []);
  assert.equal(headers.match(/Content-Security-Policy:/g).length, 1, 'one CSP rule, on /*');
});

test('the built site has no inline event handlers or javascript: links, which the policy would block', { skip: !existsSync(path.join(DIST, 'index.html')) && 'build first' }, () => {
  const bad = [];
  for (const f of CSP.htmlFiles(DIST)) {
    const h = readFileSync(f, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(h) || /href\s*=\s*["']?\s*javascript:/i.test(h)) bad.push(path.relative(DIST, f));
  }
  assert.deepEqual(bad, []);
});

test('admin and volunteer responses keep the policy without script-src (console pages use inline confirm handlers)', () => {
  const w = read('worker/index.js');
  const m = w.match(/const HEADERS = \{[\s\S]*?\n\};/);
  assert.ok(m);
  assert.match(m[0], new RegExp(`'Content-Security-Policy': "${CSP.LEGACY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
});

// ---------- Assurance pages ----------
const BANNED = [/NHS[- ]approved/i, /NHS[- ]compliant/i, /DTAC[- ](approved|certified|compliant)/i, /UK[- ]only hosting/i, /hosted (only )?in the UK/i, /GDPR[- ]certified/i, /HIPAA[- ]compliant/i, /bank[- ]grade/i, /military[- ]grade/i, /Cyber Essentials (certified|Plus certified)/i, /(is|are|been) endorsed by the NHS/i, /accredited by (the )?NHS/i];

test('no assurance page makes a claim we cannot back', () => {
  for (const approved of [null, { iso: '2026-11-20', human: '20 November 2026' }]) {
    for (const [p, a] of Object.entries(assurancePages({ site, esc, approved }))) {
      // The one deliberate denial is allowed; any other mention is not.
      const text = a.body.replace(/<[^>]+>/g, ' ').replace('We do not claim UK-only hosting.', '');
      for (const re of BANNED) assert.doesNotMatch(text, re, `${p} matches ${re}`);
      assert.doesNotMatch(text, /—/, `${p} has an em dash`);
    }
  }
});

test('until the owner approves, the pages are drafts: noindex, out of the sitemap and footer', { skip: !existsSync(path.join(DIST, 'trust/index.html')) && 'build first' }, () => {
  if (site.assuranceApproved) return; // approved: the next test covers it
  const sitemap = readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  for (const p of PAGES) {
    const h = readFileSync(path.join(DIST, p, 'index.html'), 'utf8');
    assert.match(h, /<meta name="robots" content="noindex">/, p);
    assert.match(h, /Draft for the director's approval/, p);
    assert.ok(!sitemap.includes(`thewavelength.co.uk${p}<`), `${p} not in sitemap`);
  }
  assert.doesNotMatch(readFileSync(path.join(DIST, 'index.html'), 'utf8'), /href="\/trust\/"|href="\/accessibility\/"/);
});

test('once approved, the pages carry the approval and the footer links them', { skip: !existsSync(path.join(DIST, 'trust/index.html')) && 'build first' }, () => {
  const pages = assurancePages({ site, esc, approved: { iso: '2026-11-20', human: '20 November 2026' } });
  for (const p of PAGES) assert.match(pages[p].body, /approved by Dr Firas Abou-Auda, Director, Auda Medical Ltd, on 20 November 2026/);
  const build = read('build.js');
  assert.match(build, /ASSURANCE_APPROVED \? ' · <a href="\/accessibility\/">Accessibility<\/a> · <a href="\/trust\/">Trust and security<\/a>' : ''/);
  if (site.assuranceApproved) {
    const h = readFileSync(path.join(DIST, 'index.html'), 'utf8');
    assert.match(h, /href="\/trust\/">Trust and security</);
    assert.doesNotMatch(readFileSync(path.join(DIST, 'trust/index.html'), 'utf8'), /Draft for the director's approval/);
  }
});

// ---------- Claims tied to code ----------
test('claims: passwords are salted PBKDF2-SHA-256; admin passwords are peppered', () => {
  assert.match(read('worker/app-util.js'), /pbkdf2\$100000\$/);
  assert.match(read('worker/app-util.js'), /getRandomValues\(new Uint8Array\(16\)\)/);
  assert.match(read('worker/admin/crypto.js'), /HMAC-SHA-256\(pepper, password\)/);
  assert.match(assurancePages({ site, esc })['/trust/'].body, /salted PBKDF2-SHA-256 hashes/);
});

test('claims: an account locks for 15 minutes after eight failed sign-ins', () => {
  assert.match(read('worker/app.js'), /n >= 8 \? Date\.now\(\) \+ 15 \* 60e3/);
  assert.match(assurancePages({ site, esc })['/trust/'].body, /locks for 15 minutes after eight failed sign-ins/);
});

test('claims: images are AES-GCM encrypted on the phone and deleted within 14 days; logs kept at most seven days', () => {
  const t = assurancePages({ site, esc })['/trust/'].body;
  assert.match(t, /AES-GCM with a 256-bit key/);
  assert.match(t, /after 14 days/);
  const privacy = read('build.js');
  assert.match(privacy, /until your supervisor signs, you cancel the request or 14 days pass/);
  assert.match(privacy, /for a few days \(at most seven\)/);
});

test('claims: the trust page names the ICO registration and never claims UK-only hosting', () => {
  const t = assurancePages({ site, esc })['/trust/'].body;
  assert.ok(site.icoNumber && t.includes(site.icoNumber));
  assert.match(t, /We do not claim UK-only hosting/);
  assert.match(t, /location hint rather than a guarantee/);
});

test('accessibility statement lists the known non-compliances with their WCAG criteria', () => {
  const a = assurancePages({ site, esc })['/accessibility/'].body;
  for (const sc of ['2.1.1', '2.5.7', '2.5.1', '1.3.1']) assert.ok(a.includes(sc), sc);
  assert.match(a, /partially compliant/);
  assert.match(a, /WCAG22|Web Content Accessibility Guidelines version 2\.2/);
});
