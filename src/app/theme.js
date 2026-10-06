// Appearance for the logbook: 'system' (match the phone, the default), 'light' or 'dark', kept on this device.
// Loaded in <head> before the stylesheet so the first paint is already in the right theme. app.js changes it from
// Settings through window.WLTheme. Sign-off, assessment and verify pages do not load this file and stay light.
(function () {
  'use strict';
  var KEY = 'wl-theme', root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var mem = null; // used when storage is blocked, so a choice still holds until the app closes
  function get() {
    if (mem) return mem;
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; }
  }
  function resolved(choice) { return choice === 'dark' || (choice === 'system' && mq && mq.matches) ? 'dark' : 'light'; }
  function apply() { root.setAttribute('data-theme', resolved(get())); }
  function set(choice) {
    choice = choice === 'light' || choice === 'dark' ? choice : 'system';
    mem = null;
    try { if (choice === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch (e) { mem = choice; }
    apply();
  }
  apply();
  if (mq) {
    var onChange = function () { if (get() === 'system') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  window.WLTheme = { get: get, set: set, current: function () { return resolved(get()); } };
})();
