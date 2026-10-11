// Guide source status in the apps (window.WLSources, source monitoring, October 2026), kept apart from app.js so the
// rules can be tested in Node. The server owns every date (GET /api/app/sources/guide/<slug>); this file keeps the
// last answer on the device for offline use and decides what may be said:
//   - "Source checked" only from the server's own date, never from the device's clock or the time it was fetched
//   - offline, the stored answer is shown with the date this device last received it, never as today's check
//   - "Source checked" for the whole guide only when every automatic source's latest check succeeded; otherwise the
//     date covers only the sources that were ("for 14 of 15 sources"), and each one that failed is named
//   - "No changes detected during the latest check" only when the server said so and nothing awaits review
//   - a newer website version is reported when the server's content version differs from the app's bundled copy
// Strings stay in app.js (translated with T()).
(function (root) {
  'use strict';
  var KEY = 'wl-src-';
  function load(slug) { try { var v = JSON.parse(localStorage.getItem(KEY + slug) || 'null'); return v && v.guide && v.receivedOn ? v : null; } catch (e) { return null; } }
  function save(slug, guide, receivedOn) { try { localStorage.setItem(KEY + slug, JSON.stringify({ guide: guide, receivedOn: receivedOn })); } catch (e) { /* storage full or blocked: live only */ } }
  // st: the server's guide status; bundled: the guide in the app ({ hash, reviewed, updated }); o: { cached, receivedOn }.
  function describe(st, bundled, o) {
    o = o || {};
    if (!st || typeof st !== 'object') return null;
    var auto = st.sources && st.sources.automatic || 0, isDay = function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || ''); };
    var checkedOn = auto && isDay(st.checkedOn) ? st.checkedOn : null;
    var part = st.partial && isDay(st.partial.checkedOn) && st.partial.ok > 0 ? { checkedOn: st.partial.checkedOn, ok: Number(st.partial.ok), total: Number(st.partial.total) } : null;
    var unavailable = (st.unavailable || []).filter(function (u) { return u && /^https?:\/\//.test(u.url || ''); }).map(function (u) { return { name: String(u.name || ''), url: u.url, lastCheckedOn: isDay(u.lastCheckedOn) ? u.lastCheckedOn : null }; });
    return {
      checkedOn: checkedOn,
      partial: checkedOn ? null : part,
      unavailable: unavailable,
      notYet: Number(st.notYetChecked) || 0,
      noChange: !!checkedOn && !!st.noChangeLatest && !(st.pendingReview || []).length && !unavailable.length,
      notChecked: !!auto && !checkedOn && !part,
      pending: (st.pendingReview || []).filter(function (p) { return p && /^https?:\/\//.test(p.url || ''); }),
      newer: !!(st.contentVersion && bundled && bundled.hash && st.contentVersion !== bundled.hash),
      cached: !!o.cached,
      receivedOn: o.receivedOn || null
    };
  }
  var api = { load: load, save: save, describe: describe, KEY: KEY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WLSources = api;
})(typeof window !== 'undefined' ? window : this);
