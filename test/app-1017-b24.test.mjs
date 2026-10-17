// 1.0.17, iPhone build 24 (src/app/app.css, src/app/app.js): found on the iPhone XS device checks of 14 October 2026.
// A double-tap zoomed the logbook in and pinch could not undo it (Capacitor blocks pinch zoom on iPhone), and a long
// hospital name pushed a supervisor's learner card past the edge of the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/app/app.css');
const rule = (sel) => { const m = css.match(new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')); return m ? m[2] : null; };

test('a double-tap never zooms the page', () => {
  assert.match(rule('html') || '', /touch-action:\s*manipulation/);
  // Nothing else in the app turns double-tap zoom back on for the whole page.
  assert.doesNotMatch(css, /(^|\n)(html|body)[^{]*\{[^}]*touch-action:\s*(auto|pan-x pan-y pinch-zoom)\b/);
});

test('the viewport still lets the browser zoom (no user-scalable=no or maximum-scale)', () => {
  const vp = read('src/app/index.html').match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(vp, /user-scalable\s*=\s*no|maximum-scale/);
});

test('a long line in a logbook or learner row never widens the card', () => {
  assert.match(rule('.entry .grow') || '', /min-width:\s*0/);
  assert.match(rule('.entry.sv-learner p') || '', /white-space:\s*normal/);
  assert.match(rule('.entry.sv-learner p') || '', /overflow-wrap:\s*anywhere/);
  assert.match(read('src/app/app.js'), /<a class="entry sv-learner" href="#\/supervise\/'/);
});
