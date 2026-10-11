// Guide source status in the apps (src/app/sourcestatus.js, October 2026): what a guide may say about its official
// sources, live and offline. The server owns every date; the device only stores its last answer and says when it
// arrived. Tested in Node with a stand-in localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/app/sourcestatus.js', import.meta.url), 'utf8');
function load(storage) {
  const win = {};
  globalThis.localStorage = storage;
  new Function('window', SRC.replace(/\}\)\(typeof window[^;]*;\s*$/, '})(window);'))(win);
  return win.WLSources;
}
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const status = (o = {}) => ({ slug: 'fusic-accreditation', contentVersion: 'aaaa', checkedOn: '2026-10-11', noChangeLatest: true, sources: { automatic: 15, byHand: 0 }, pendingReview: [], ...o });
const bundled = { hash: 'aaaa', reviewed: '2026-10-04', updated: '2026-10-05' };

test('live: the server\'s date and "no changes"; never more than the server said', () => {
  const W = load(store());
  assert.deepEqual(W.describe(status(), bundled), { checkedOn: '2026-10-11', partial: null, unavailable: [], notYet: 0, noChange: true, notChecked: false, pending: [], newer: false, cached: false, receivedOn: null });
  assert.equal(W.describe(status({ checkedOn: null }), bundled).notChecked, true, 'never checked: says so, no date');
  assert.equal(W.describe(status({ checkedOn: 'yesterday' }), bundled).checkedOn, null, 'only a real date');
  assert.equal(W.describe(status({ sources: { automatic: 0, byHand: 2 } }), bundled).checkedOn, null, 'no automatic sources: no check claimed');
  const p = W.describe(status({ pendingReview: [{ source: 'FUSIC Heart', url: 'https://ics.ac.uk/product/fusic-heart.html', detectedOn: '2026-10-11' }, { source: 'bad', url: 'javascript:alert(1)' }] }), bundled);
  assert.equal(p.noChange, false, 'a change awaiting review is never "no changes"');
  assert.equal(p.pending.length, 1, 'only real links');
  assert.equal(W.describe(null, bundled), null);
});

test('one source unavailable: no date for the whole guide; the others keep theirs; the failed one is named', () => {
  const W = load(store());
  const d = W.describe(status({ checkedOn: null, noChangeLatest: false, partial: { checkedOn: '2026-10-11', ok: 14, total: 15 }, unavailable: [{ name: 'FUSIC Heart', url: 'https://ics.ac.uk/product/fusic-heart.html', lastCheckedOn: '2026-10-09' }, { name: 'bad', url: 'javascript:alert(1)' }], notYetChecked: 0 }), bundled);
  assert.equal(d.checkedOn, null, 'never "checked" while a source is unavailable');
  assert.deepEqual(d.partial, { checkedOn: '2026-10-11', ok: 14, total: 15 });
  assert.deepEqual(d.unavailable, [{ name: 'FUSIC Heart', url: 'https://ics.ac.uk/product/fusic-heart.html', lastCheckedOn: '2026-10-09' }], 'only real links');
  assert.equal(d.noChange, false);
  assert.equal(d.notChecked, false);
  // A failed source never checked successfully: named without a date.
  const e = W.describe(status({ checkedOn: null, partial: null, unavailable: [{ name: 'X', url: 'https://x.org/', lastCheckedOn: null }] }), bundled);
  assert.equal(e.unavailable[0].lastCheckedOn, null);
  assert.equal(e.notChecked, true);
  // A server that says "checked" but also lists an unavailable source never gets "no changes".
  assert.equal(W.describe(status({ unavailable: [{ name: 'X', url: 'https://x.org/' }] }), bundled).noChange, false);
});

test('the bundled copy is older than the website: reported, not hidden', () => {
  const W = load(store());
  assert.equal(W.describe(status({ contentVersion: 'bbbb' }), bundled).newer, true);
  assert.equal(W.describe(status({ contentVersion: 'aaaa' }), bundled).newer, false);
  assert.equal(W.describe(status({ contentVersion: null }), bundled).newer, false, 'an older server without versions says nothing');
});

test('offline: the stored answer, labelled with the day it arrived, never as today\'s check', () => {
  const s = store(), W = load(s);
  W.save('fusic-accreditation', status({ checkedOn: '2026-10-09' }), '2026-10-09');
  const got = W.load('fusic-accreditation');
  const d = W.describe(got.guide, bundled, { cached: true, receivedOn: got.receivedOn });
  assert.equal(d.checkedOn, '2026-10-09', 'the server\'s date from that day, not the device\'s today');
  assert.equal(d.cached, true);
  assert.equal(d.receivedOn, '2026-10-09');
  // Storage broken or blocked: no crash, nothing claimed.
  s.m.set('wl-src-x', '{not json');
  assert.equal(W.load('x'), null);
  const W2 = load({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.equal(W2.load('fusic-accreditation'), null);
  W2.save('fusic-accreditation', status(), '2026-10-11');
});
