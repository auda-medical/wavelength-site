// 1.0.10 rules in src/app/app.js that the browser checks (tools/e2e-1010.mjs) cover end to end, kept here in the
// source too because those checks need a local Worker and Playwright.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/app/app.css', import.meta.url), 'utf8');
const slice = (from, to) => APP.slice(APP.indexOf(from), APP.indexOf(to, APP.indexOf(from)));

test('a failed sync is classified with the phone\'s network, never assumed offline', () => {
  const body = slice('  function doSync(manual) {', '  // The server had a newer copy');
  assert.match(body, /SY\.fail = !S\.account \? '' : NETR\.classify\(ex, deviceNet\(\)\)/);
  assert.doesNotMatch(body, /netFail\(ex\) \? 'offline'/);
  // Only a full run marks the device synced.
  assert.match(body, /SY\.fail = ''; SY\.ran = true; SY\.lastOk = Date\.now\(\)/);
});

test('a network change or a return to the app retries (1.0.11: a return follows the resume plan)', () => {
  assert.match(APP, /window\.addEventListener\('wl:net', function \(e\) \{ onNet\(e\.detail\); \}\)/);
  const on = slice('  function onNet(v) {', '  window.addEventListener(\'wl:net\'');
  assert.match(on, /NETR\.netChanged\(was, v\)/);
  assert.match(on, /SY\.tries = 0/);
  const resume = slice("  window.addEventListener('wl:resume'", '  // The lock setting was read late');
  assert.match(resume, /resumeSync\(e\.detail && e\.detail\.away\)/);
  const rs = slice('  function resumeSync(away) {', "  // The phone's network changed");
  assert.match(rs, /NAT\.netStatus/);
  assert.match(rs, /NETR\.resumePlan\(/);
  assert.match(rs, /if \(plan\.reset\) SY\.tries = 0;/);
  // A flapping network cannot make a retry storm.
  assert.match(APP, /now - \(SY\.netResetAt \|\| 0\) > 60e3/);
  assert.match(APP, /\(SY\.netSyncAt \|\| 0\) \+ 10e3 - now/);
});

test('the status pill is a button that opens the sync details; banners stay off the scan form', () => {
  assert.match(APP, /<button type="button" class="sync-pill p-/);
  assert.match(APP, /function openSyncSheet\(\)/);
  assert.match(APP, /\['new', 'edit', 'settings'\]\.indexOf\(route\(\)\.name\) >= 0 \? '' : '<div class="sync-banner"/);
});

test('saving: one save at a time, Home afterwards, "synced" only once the server has the scan', () => {
  const sub = slice("    form.addEventListener('submit', function (ev) {", '  // A SHA-256 of each image');
  assert.match(sub, /if \(saving\) return;/);
  assert.match(sub, /go\(editing \? 'entry\/' \+ out\.id : ''\)/);
  assert.match(sub, /saving = false; busy\(btn, false\);/, 'a failed save makes Save usable again');
  const note = slice('  function savedNote(id, isNew) {', '  var draftImages');
  assert.match(note, /if \(e && !e\._dirty\) return isNew \? T\('Scan saved and synced\.'\)/);
});

test('required fields are the same three as in 1.0.9', () => {
  const sub = slice("    form.addEventListener('submit', function (ev) {", '  // A SHA-256 of each image');
  const keys = [...sub.matchAll(/\[\['type'|\['date'|\['supervision'/g)].length;
  // 1.0.16: still the same three; only the first one's message says scan (ChatGPT 12 Oct 10:51).
  assert.match(sub, /\[\['type', T\('Choose which scan you did\.'\)\], \['date', [^\]]+\], \['supervision', T\('Choose the level of supervision\.'\)\]\]/);
  assert.ok(keys >= 1);
});

test('motion is off with reduced motion, and there is no backdrop blur on the tab bar', () => {
  const rm = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
  for (const sel of ['main.enter', '.sync-banner.in', '.next-up']) assert.ok(rm.includes(sel), 'reduced motion misses ' + sel);
  assert.match(CSS, /\* \{ animation: none !important; \}/);
  const tabs = CSS.slice(CSS.indexOf('.tabs {'), CSS.indexOf('}', CSS.indexOf('.tabs {')));
  assert.doesNotMatch(tabs, /backdrop-filter/);
});
