// Search titles (build.js layout, 16 Oct 2026): the "| Wavelength" brand is added only while the whole title stays
// within 60 characters. Google cuts longer titles off and shows the site name above each result anyway, so a long
// title keeps its keywords. Reads the built pages (node build.js first, as the media tests do).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pages = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'index.html') pages.push(p); } })(DIST);
const titleOf = (p) => (readFileSync(p, 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1];
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

test('no title carries the brand past 60 characters', () => {
  const over = pages.map(titleOf).filter((t) => t && t.endsWith(' | Wavelength') && unescape(t).length > 60);
  assert.deepEqual(over, []);
});

test('short titles keep the brand; long ones keep their keywords instead', () => {
  assert.equal(titleOf(path.join(DIST, 'courses/index.html')), 'POCUS courses UK: hands-on emergency ultrasound | Wavelength');
  assert.equal(titleOf(path.join(DIST, 'learn/epss-ultrasound/index.html')), 'EPSS ultrasound: when the mitral valve misses the septum');
});

test('the ultrasound logbook guide links to the logbook app page', () => {
  assert.match(readFileSync(path.join(DIST, 'guides/ultrasound-logbook/index.html'), 'utf8'), /href="\/pocus-logbook\/">Wavelength POCUS logbook app</);
});
