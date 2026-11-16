// 16 Nov 2026 (owner, D-117): certificates print Greek and Cyrillic names in EB Garamond Italic (the name slot's alt
// font); Latin names keep Cormorant exactly; Arabic, Chinese and other scripts are still asked for in other letters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampCertificate, unprintable, fontFor } from '../worker/cert.js';

const meta = JSON.parse(readFileSync(new URL('../worker/cert-template.json', import.meta.url), 'utf8'));
const tpl = new Uint8Array(readFileSync(new URL('../worker/cert-template.bin', import.meta.url)));
const pdfText = (bytes) => Buffer.from(bytes).toString('latin1');
const stamp = (name) => pdfText(stampCertificate(tpl, meta, { name, module: 'Lung ultrasound', score: 92, cpdHours: 1.5, date: '2026-11-16', code: 'WL-TEST-0001' }));

test('Latin names keep the current font; Greek and Cyrillic names use the alt font and lose no letter', () => {
  assert.equal(meta.slots.name.alt, 'nameAlt');
  assert.ok(meta.fonts.nameAlt, 'EB Garamond Italic is in the template');
  for (const n of ['Dr Maria Papadopoulou', 'Ms Zoë Brontë-Łukasz', 'Prof José Núñez']) {
    assert.equal(fontFor(meta, 'name', n), 'serifItalic', n);
    assert.deepEqual(unprintable(meta, 'name', n), [], n);
  }
  for (const n of ['Δρ Μαρία Παπαδοπούλου', 'Иван Петров', 'Ολγα Иванова', 'Dr Νίκος Smith']) {
    assert.equal(fontFor(meta, 'name', n), 'nameAlt', n);
    assert.deepEqual(unprintable(meta, 'name', n), [], n);
  }
});

test('a letter typed with a separate accent mark keeps its accent (composed first)', () => {
  assert.deepEqual(unprintable(meta, 'name', 'Μαρία'), []);
  assert.equal(fontFor(meta, 'name', 'Μαρία'), 'nameAlt');
});

test('Arabic and Chinese names are still refused, so the Academy asks for other letters', () => {
  assert.ok(unprintable(meta, 'name', 'أحمد علي').length > 0);
  assert.ok(unprintable(meta, 'name', '王小明').length > 0);
  const academy = readFileSync(new URL('../worker/academy.js', import.meta.url), 'utf8');
  assert.match(academy, /Write your name in Latin, Greek or Cyrillic letters/);
  assert.match(academy, /PRINTABLE_LETTER = \/\[A-Za-z\\u00c0-\\u017f\\u0370-\\u03ff\\u0400-\\u04ff\]\//);
  assert.doesNotMatch(academy, /English letters \(A to Z\)/);
});

test('the stamped PDF uses the alt font only for a Greek or Cyrillic name', () => {
  const altRes = meta.fonts.nameAlt.res;
  const latin = stamp('Dr Maria Papadopoulou');
  const greek = stamp('Δρ Μαρία Παπαδοπούλου');
  const tail = (s) => s.slice(s.lastIndexOf('%%EOF', s.length - 10));
  assert.ok(!tail(latin).includes(`${altRes} 40 Tf`), 'Latin name not in the alt font');
  assert.ok(tail(greek).includes(`${altRes} `), 'Greek name in the alt font');
  assert.ok(greek.length > 100000 && greek.startsWith('%PDF'), 'a whole PDF');
});
