// Store ratings (window.WLRating, 1.0.29): when the store apps may ask the phone for its own rating prompt, kept apart
// from app.js so the rules can be tested in Node. Only the official prompts are used (iPhone: StoreKit, at most three
// times a year, and iOS may show nothing; Android: Google Play In-App Review, which Google may also skip). The app never
// asks "do you like Wavelength?" first, never offers anything for a rating and never draws a rating dialog of its own.
//
// A positive moment (a sign-off the learner has just seen, a supervisor finishing a sign-off, the learner's 5th scan)
// asks only when all of these hold:
//   - the store app (never the website or the home-screen web app)
//   - this install was first used at least 3 days ago, and this is not the session in which it was first opened
//   - at least 3 scans logged, or at least 1 sign-off completed (scans signed off for the learner, or sign-offs this
//     person completed as a supervisor on this install)
//   - no ask in the last 120 days, and fewer than 3 asks in the last 365 days
//   - not right after an error (a failed save, sync or sign-off in the last 15 minutes, or a sync problem now)
//   - not already asked in this session
// Kept on this phone only (localStorage 'wl-rate'): when it was first used, when it asked, and how many sign-offs the
// person completed as a supervisor here. Nothing is sent anywhere. Logging out keeps it: it belongs to the install.
(function (root) {
  'use strict';
  var KEY = 'wl-rate';
  var DAY = 864e5;
  var RULES = { minDays: 3, minScans: 3, minSignoffs: 1, gapDays: 120, perYear: 3, troubleMs: 15 * 60e3 };
  var SCAN_MILESTONES = [5];
  var MOMENTS = { signed: 1, supervised: 1, scan: 1 };

  function read(store) {
    try { var v = JSON.parse(store.getItem(KEY) || 'null'); return v && typeof v === 'object' && typeof v.first === 'number' ? v : null; } catch (e) { return null; }
  }
  function write(store, v) { try { store.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked: this session only */ } }
  function clean(v) {
    return { first: v.first, asks: (Array.isArray(v.asks) ? v.asks : []).filter(function (t) { return typeof t === 'number' && t > 0; }).sort(function (a, b) { return a - b; }).slice(-10), signoffs: Math.max(0, Number(v.signoffs) || 0) };
  }

  // The rules on their own. st: the stored record; ctx: { now, native, firstSession, askedThisSession, troubleAt,
  // troubleNow, scans, signoffs, moment }. Returns { ok, why }: why names the first rule that said no.
  function decide(st, ctx) {
    var now = ctx.now;
    if (!ctx.native) return { ok: false, why: 'web' };
    if (!MOMENTS[ctx.moment]) return { ok: false, why: 'moment' };
    if (!st || typeof st.first !== 'number') return { ok: false, why: 'new' };
    if (ctx.firstSession) return { ok: false, why: 'first-session' };
    if (now - st.first < RULES.minDays * DAY) return { ok: false, why: 'too-soon' };
    if ((Number(ctx.scans) || 0) < RULES.minScans && (Number(ctx.signoffs) || 0) < RULES.minSignoffs) return { ok: false, why: 'too-little' };
    if (ctx.askedThisSession) return { ok: false, why: 'this-session' };
    var asks = (st.asks || []).filter(function (t) { return t <= now; });
    var last = asks.length ? asks[asks.length - 1] : 0;
    if (last && now - last < RULES.gapDays * DAY) return { ok: false, why: 'asked-recently' };
    if (asks.filter(function (t) { return now - t < 365 * DAY; }).length >= RULES.perYear) return { ok: false, why: 'year-cap' };
    if (ctx.troubleNow || (ctx.troubleAt && now - ctx.troubleAt < RULES.troubleMs)) return { ok: false, why: 'after-error' };
    return { ok: true, why: '' };
  }

  // One per app session. o: { storage, now() (default Date.now), earliest (an older start of this install, in ms) }.
  // A logbook that was already on the phone before this version counts from its earliest recorded start, not from
  // the update, but still never asks in the session in which the record was first made.
  function create(o) {
    o = o || {};
    var store = o.storage, clock = o.now || function () { return Date.now(); };
    var t0 = clock(), st = store ? read(store) : null, firstSession = false;
    if (st) st = clean(st);
    else {
      var e = Number(o.earliest) || 0;
      st = { first: e > 0 && e < t0 ? e : t0, asks: [], signoffs: 0 };
      firstSession = !(e > 0 && e < t0 - 60e3);
      if (store) write(store, st);
    }
    var asked = false, troubleAt = 0;
    return {
      // ctx: { native, scans, signoffs (the learner's signed-off scans), troubleNow, moment }
      check: function (ctx) {
        var c = {}; for (var k in ctx) c[k] = ctx[k];
        c.now = clock(); c.firstSession = firstSession; c.askedThisSession = asked; c.troubleAt = troubleAt;
        c.signoffs = Math.max(Number(c.signoffs) || 0, st.signoffs);
        return decide(st, c);
      },
      // Called just before the phone's prompt is requested: the OS may show nothing, but it still counts.
      asked: function () { asked = true; st.asks = st.asks.concat([clock()]).slice(-10); if (store) write(store, st); },
      trouble: function () { troubleAt = clock(); },
      signedOff: function () { st.signoffs += 1; if (store) write(store, st); },
      scanMilestone: function (n) { return SCAN_MILESTONES.indexOf(n) >= 0; },
      state: function () { return { first: st.first, asks: st.asks.slice(), signoffs: st.signoffs, firstSession: firstSession, askedThisSession: asked, troubleAt: troubleAt }; }
    };
  }

  var api = { create: create, decide: decide, RULES: RULES, KEY: KEY, SCAN_MILESTONES: SCAN_MILESTONES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WLRating = api;
})(typeof window !== 'undefined' ? window : this);
