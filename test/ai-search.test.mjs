// Search engines and AI assistants (4 Nov 2026): robots.txt welcomes every crawler to the public pages, llms.txt
// summarises the site from the same data as the pages, and the organisation names its founder as the same person as
// abouauda.co.uk. Reads the built site (node build.js first, as the other dist tests do).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(path.join(DIST, p), 'utf8');
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [].concat(JSON.parse(m[1])));

test('robots.txt: one group for every crawler, public pages allowed, private areas and the sitemap listed', () => {
  const r = read('robots.txt');
  assert.equal((r.match(/^User-agent:/gm) || []).length, 1);
  assert.match(r, /^User-agent: \*\nAllow: \/\n/m);
  for (const p of ['/admin/', '/volunteer/', '/app/sign/']) assert.match(r, new RegExp(`^Disallow: ${p}$`, 'm'));
  assert.doesNotMatch(r, /^Disallow: \/$/m);
  assert.match(r, /^Sitemap: https:\/\/thewavelength\.co\.uk\/sitemap\.xml$/m);
});

test('llms.txt: title, summary, founder link, courses, Academy, logbook and every link on this site or the founder\'s', () => {
  const t = read('llms.txt');
  assert.match(t, /^# Wavelength\n\n> /);
  assert.match(t, /\(https:\/\/abouauda\.co\.uk\/\)/);
  for (const h of ['## Courses and training', '## Free learning', '## Logbook app', '## About']) assert.ok(t.includes(h), h);
  assert.match(t, /\(https:\/\/thewavelength\.co\.uk\/courses\/core-emergency-ultrasound\/\)/);
  assert.match(t, /\(https:\/\/thewavelength\.co\.uk\/pocus-logbook\/\)/);
  const links = [...t.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length > 20);
  assert.deepEqual(links.filter((u) => !/^https:\/\/(thewavelength|abouauda)\.co\.uk\//.test(u)), []);
  for (const u of links.filter((x) => x.startsWith('https://thewavelength.co.uk/'))) {
    const p = u.replace('https://thewavelength.co.uk/', '');
    assert.doesNotThrow(() => read(p.endsWith('/') || p === '' ? `${p}index.html` : p), u);
  }
  assert.doesNotMatch(t, / 1 CPD hours/);
});

test('every page names the founder, the same person on abouauda.co.uk', () => {
  for (const p of ['index.html', 'courses/index.html', 'fr/index.html']) {
    const org = ldOf(read(p)).find((x) => x['@id'] === 'https://thewavelength.co.uk/#org');
    assert.ok(org, p);
    assert.equal(org.founder['@id'], 'https://thewavelength.co.uk/faculty/#director');
    assert.ok(org.founder.sameAs.includes('https://abouauda.co.uk/'), p);
  }
  const home = ldOf(read('index.html')).find((x) => x['@id'] === 'https://thewavelength.co.uk/#org');
  assert.equal(home.parentOrganization['@id'], 'https://abouauda.co.uk/#auda-medical');
  assert.ok(ldOf(read('index.html')).some((x) => x['@type'] === 'FAQPage'));
});

test('the faculty page links the Course Director to his own site', () => {
  const html = read('faculty/index.html');
  const director = ldOf(html).find((x) => x['@id'] === 'https://thewavelength.co.uk/faculty/#director');
  assert.ok(director.sameAs.includes('https://abouauda.co.uk/'));
  assert.match(html, /<a class="text-link" href="https:\/\/abouauda\.co\.uk\/" rel="me">abouauda\.co\.uk<\/a>/);
});
