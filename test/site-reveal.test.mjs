// Scroll reveals on the website (src/assets/main.js and style.css) are decoration only. October 2026: on phones the
// POCUS accreditation guide stayed blank because the whole article was one .reveal block 12,000+ px tall and the
// observer waited for 8 % of it to be on screen at once, which a ~740 px screen never shows. These tests pin the
// rules that keep content visible: nothing is hidden unless main.js is running its observer, the observer fires on
// any overlap, and anything on or above the screen is shown whatever the observer does. The browser-level check of
// every page is tools/mobile-audit.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/assets/style.css');
const js = read('src/assets/main.js');

test('the stylesheet hides .reveal only under html.reveal-on, never under .js alone', () => {
  assert.doesNotMatch(css, /\.js \.reveal\s*\{[^}]*opacity:\s*0/, '.js .reveal must not hide content: .js is set before main.js loads');
  assert.match(css, /\.reveal-on \.reveal\{[^}]*opacity:0/);
  const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
  assert.match(reduce.slice(0, reduce.indexOf('\n}')), /\.reveal-on \.reveal\{opacity:1;transform:none\}/);
  assert.match(reduce.slice(0, reduce.indexOf('\n}')), /\.js \.hero \.rise\{opacity:1;transform:none;animation:none\}/, 'reduced motion: hero lines show at once, without their start delays');
  assert.match(css, /@media print\{\.reveal-on \.reveal,/);
});

// Runs main.js against a minimal page: the reveal items, a scriptable IntersectionObserver and timers run on demand.
function run({ withObserver = true, reduce = false, items = [] } = {}) {
  const classes = new Set();
  const listeners = {};
  const timers = [];
  const observers = [];
  const doc = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
  const document = {
    documentElement: doc,
    querySelector: () => null,
    getElementById: () => null,
    querySelectorAll: (sel) => (sel === '.reveal, .steps-line' ? items : []),
    addEventListener: () => {},
  };
  const window = {
    matchMedia: () => ({ matches: reduce }),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    innerHeight: 740,
    scrollY: 0,
  };
  class IO {
    constructor(cb, options) { this.cb = cb; this.options = options; this.watched = new Set(); observers.push(this); }
    observe(el) { this.watched.add(el); }
    unobserve(el) { this.watched.delete(el); }
    fire(el) { this.cb([{ target: el, isIntersecting: true }]); }
  }
  if (withObserver) window.IntersectionObserver = IO;
  const location = { search: '', href: '' };
  new Function('window', 'document', 'location', 'IntersectionObserver', 'requestAnimationFrame', 'setTimeout', js)(
    window, document, location, withObserver ? IO : undefined, (fn) => fn(), (fn, ms) => { timers.push({ fn, ms }); });
  return { classes, listeners, timers, observers };
}
const el = (top) => { const c = new Set(); return { top, classList: { add: (x) => c.add(x), contains: (x) => c.has(x) }, getBoundingClientRect() { return { top: this.top }; }, get shown() { return c.has('in'); } }; };

test('the observer fires on any overlap, so an element taller than the screen still appears', () => {
  const items = [el(1500)];
  const { observers, classes } = run({ items });
  assert.equal(observers.length, 1);
  const t = observers[0].options.threshold;
  assert.ok((Array.isArray(t) ? Math.max(...t) : t) === 0, 'threshold must be 0, not a share of the element');
  assert.ok(classes.has('reveal-on'), 'hiding starts only once the observer runs');
  observers[0].fire(items[0]);
  assert.ok(items[0].shown);
});

test('anything on or above the screen is shown by the sweep, even if the observer never reports', () => {
  const above = el(-8000), onScreen = el(300), below = el(5000);
  const { timers, listeners } = run({ items: [above, onScreen, below] });
  assert.ok(timers.some((t) => t.ms <= 1500), 'a timed sweep runs soon after start');
  timers.forEach((t) => t.fn());
  assert.ok(above.shown, 'above the screen (restored scroll, back/forward)');
  assert.ok(onScreen.shown, 'on screen');
  assert.ok(!below.shown, 'below the screen waits for the user to scroll');
  below.top = 200;
  (listeners.scroll || []).forEach((fn) => fn());
  assert.ok(below.shown, 'scrolling to it shows it');
  assert.ok((listeners.pageshow || []).length, 'back/forward cache restores run the sweep too');
});

test('without an observer, or with reduced motion, nothing is hidden at all', () => {
  for (const opts of [{ withObserver: false }, { reduce: true }]) {
    const items = [el(9000)];
    const { classes } = run({ ...opts, items });
    assert.ok(!classes.has('reveal-on'), JSON.stringify(opts));
    assert.ok(items[0].shown, JSON.stringify(opts));
  }
});
