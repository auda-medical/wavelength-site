// 15 Nov 2026 (owner): every field where people type something that is already in a list drops matching entries down
// from the first letter. The helper's matching runs here on its own (src/app/app.js, "Suggestions under typed fields").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const part = APP.slice(APP.indexOf('  var SUG_LISTS = {'), APP.indexOf('  function sugAttrs('));
const make = (S) => new Function('S', part + '; return { sugItems, sugScore, sugNorm };')(S);
const labels = (h) => h.map((x) => x.label);

test('one letter suggests every entry with a word starting with it, whole-text matches first', () => {
  const { sugItems } = make({ entries: [] });
  const c = labels(sugItems('grade', 'c'));
  assert.ok(c.length > 3 && c.length <= 12);
  for (const x of ['CT1', 'Consultant', 'Clinical fellow']) assert.ok(c.includes(x), x);
  for (const x of c) assert.ok(x.toLowerCase().split(/[\s()]+/).some((w) => w.startsWith('c')), x);
  assert.deepEqual(labels(sugItems('grade', 'st4')), [], 'the exact entry typed is not offered again');
  assert.deepEqual(labels(sugItems('grade', 'st')).slice(0, 3), ['ST1', 'ST2', 'ST3']);
  assert.deepEqual(labels(sugItems('grade', 'x')), []);
  assert.deepEqual(labels(sugItems('grade', '')), []);
  assert.ok(labels(sugItems('specialty', 'e')).includes('Emergency medicine'));
  assert.ok(labels(sugItems('specialty', 'emergency p')).includes('Paediatric emergency medicine'), 'words in any order');
  assert.ok(labels(sugItems('region', 'k')).includes('Kent'));
});

test('country codes match on the code or the name, and fill the code', () => {
  const { sugItems } = make({ entries: [] });
  const u = sugItems('country', 'u');
  assert.ok(u.some((h) => h.v === 'GB' && /United Kingdom/.test(h.label)));
  assert.ok(u.some((h) => h.v === 'US'));
  assert.ok(sugItems('country', 'g').some((h) => h.v === 'GB'));
});

test('the learner\'s own earlier answers and linked supervisors come first, newest first, without repeats', () => {
  const S = {
    links: { supervisors: [{ name: 'Amira Hassan' }, { name: '' }] },
    entries: [
      { supervisor: 'Adam Clarke', updated_at: '2026-11-01', findings: { agent: 'Levobupivacaine 0.25% 20 ml' } },
      { supervisor: 'adam clarke', updated_at: '2026-11-10', indication: 'Breathless ?effusion' },
      { supervisor: 'Old Name', updated_at: '2026-10-01', deleted: true },
    ],
  };
  const { sugItems } = make(S);
  assert.deepEqual(labels(sugItems('supervisor', 'a')), ['Amira Hassan', 'adam clarke']);
  assert.deepEqual(labels(sugItems('supervisor', 'o')), [], 'deleted scans are not used');
  assert.equal(labels(sugItems('f:agent', 'l'))[0], 'Levobupivacaine 0.25% 20 ml', 'own answer before the starter list');
  assert.ok(labels(sugItems('f:agent', 'l')).includes('Lidocaine 1%'));
  assert.deepEqual(labels(sugItems('indication', 'b')), ['Breathless ?effusion']);
  assert.ok(labels(sugItems('f:complication', 'p')).includes('Pneumothorax'));
});

test('every suggesting field has its own listbox, and the searched lists start at the first letter', () => {
  const ids = [...APP.matchAll(/sugAttrs\('[^']+', '([^']+)'\) \+ '>' \+ sugList\('([^']+)'\)/g)];
  assert.ok(ids.length >= 9, ids.length);
  for (const m of ids) assert.equal(m[1], m[2]);
  for (const id of ['role', 'grade', 'supv', 'ind', 'sa3', 'se5', 'dr1', 'dr2', 'dr3']) assert.ok(ids.some((m) => m[1] === id), id);
  assert.match(APP, /sugAttrs\('f:' \+ fd\.id, id\) \+ '>' \+ sugList\(id\)/, 'free-text scan form fields');
  assert.doesNotMatch(APP, /q\.length < 2 \|\| !navigator\.onLine/, 'organisation from the first letter');
  assert.doesNotMatch(APP, /length < 3\) \{ close\(\)/, 'directory listings from the first letter');
  assert.doesNotMatch(APP, /text\.length < 3/, 'supervisor search from the first letter');
});
