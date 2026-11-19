// 19 Nov 2026 (owner): exported scans carry their images. The PDF export now starts on All images (the identifier
// declaration still has to be ticked); Excel and CSV, which cannot hold images, say that the PDF does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');

test('the PDF export includes all images unless the learner changes it, and still asks for the declaration', () => {
  assert.match(APP, /\{ id: 'pick', label: 'Choose scans' \}\], 'all', '', 'lab-img'\)/);
  assert.match(APP, /\$\('#imgdeclf'\)\.hidden = mode === 'none' \|\| !mode;/);
  assert.match(APP, /if \(d\.images && !\$\('#imgdecl'\)\.checked\)/, 'the declaration is still required');
});

test('Excel and CSV say where the images go', () => {
  assert.match(APP, /id="imgxls" hidden>/);
  assert.match(APP, /\$\('#imgxls'\)\.hidden = v === 'pdf';/);
  for (const l of ['ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'ru', 'zh']) {
    const j = JSON.parse(readFileSync(new URL('../src/app/i18n/' + l + '.json', import.meta.url), 'utf8'));
    assert.ok(j['Images and clips go into PDF exports. Excel and CSV list how many each scan has.'], l);
  }
});
