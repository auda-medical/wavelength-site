// Store apps (Android and iPhone). The apps carry this logbook inside them (mobile/www, built by
// mobile/scripts/build-www.mjs) and run it from https://localhost or capacitor://localhost. This file connects the
// logbook to the phone: the Wavelength server address, the login token (Bearer, see worker/native.js), website links
// in the in-app browser, the Android back button, haptics, app lock with fingerprint or face, and resume events.
// On the website it does nothing: WLNative.on is false and every helper falls back to the browser.
(function () {
  'use strict';
  var cap = window.Capacitor;
  var on = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var SITE = on ? ((window.WL_NATIVE && window.WL_NATIVE.site) || 'https://thewavelength.co.uk') : location.origin;
  var cache = {};
  function plugin(name) {
    if (!on) return null;
    if (name in cache) return cache[name];
    var p = null;
    try { p = typeof cap.registerPlugin === 'function' ? cap.registerPlugin(name) : null; } catch (e) { p = null; }
    if (!p && cap.Plugins) p = cap.Plugins[name] || null;
    cache[name] = p;
    return p;
  }
  var Prefs = plugin('Preferences');
  function pref(key) { return Prefs ? Prefs.get({ key: key }).then(function (r) { return (r && r.value) || ''; }, function () { return ''; }) : Promise.resolve(''); }
  function setPref(key, v) { if (!Prefs) return Promise.resolve(); return (v ? Prefs.set({ key: key, value: String(v) }) : Prefs.remove({ key: key })).catch(function () {}); }

  // ---------- Server and login token ----------
  // The login token lives in the phone's secure storage (Android Keystore-encrypted, iOS Keychain) through the
  // biometric plugin's data store. Preferences keeps settings only. A token left in Preferences by an earlier build
  // moves across on first start.
  var Bio = plugin('NativeBiometric');
  var SECURE_KEY = 'wavelength.session';
  var TOKEN = '', LOCK = false;
  function readToken() {
    var secure = Bio ? Bio.getData({ key: SECURE_KEY }).then(function (r) { return (r && r.value) || ''; }, function () { return ''; }) : Promise.resolve('');
    return secure.then(function (v) {
      if (v || !Bio) return v || pref('wl-token');
      return pref('wl-token').then(function (old) { if (old) { saveToken(old); setPref('wl-token', ''); } return old; });
    });
  }
  function saveToken(t) {
    if (!Bio) return setPref('wl-token', t);
    return (t ? Bio.setData({ key: SECURE_KEY, value: t }) : Bio.deleteData({ key: SECURE_KEY })).catch(function () {});
  }
  var ready = on ? Promise.all([readToken(), pref('wl-lock')]).then(function (v) { TOKEN = v[0]; LOCK = v[1] === '1'; }) : Promise.resolve();
  function setToken(t) { if ((t || '') === TOKEN) return; TOKEN = t || ''; saveToken(TOKEN); }
  // A path on the Wavelength website as an absolute address (the website itself keeps relative paths).
  function site(path) { return /^[a-z]+:/i.test(path) ? path : SITE + path; }
  // fetch() for the Wavelength server. In the app: absolute address, token header, no cookies, token kept fresh.
  function net(path, opt) {
    opt = opt || {};
    if (!on) return fetch(path, opt);
    return ready.then(function () {
      var h = new Headers(opt.headers || {});
      h.set('X-Wavelength-Client', 'app');
      if (TOKEN) h.set('Authorization', 'Bearer ' + TOKEN);
      var o = {}; for (var k in opt) o[k] = opt[k];
      o.headers = h; o.credentials = 'omit'; o.mode = 'cors';
      return fetch(site(path), o).then(function (r) {
        var t = r.headers.get('X-Wavelength-Token');
        if (t !== null) setToken(t);
        return r;
      });
    });
  }

  // ---------- Website links open in the in-app browser, never inside the logbook ----------
  var Browser = plugin('Browser');
  function openExternal(href) {
    var u = site(href);
    if (Browser) return Browser.open({ url: u, toolbarColor: '#0A1526', presentationStyle: 'popover' }).catch(function () { window.open(u, '_blank'); });
    window.open(u, '_blank');
  }
  function insideApp(href) { return /^\/app\/?(\?[^#]*)?(#.*)?$/.test(href) || href.charAt(0) === '#'; }
  if (on) {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.hasAttribute('download') || e.defaultPrevented) return;
      var href = a.getAttribute('href') || '';
      if (!href || insideApp(href) || /^(blob|data|javascript):/i.test(href)) return;
      if (/^(mailto|tel|sms):/i.test(href)) return; // the system opens these
      e.preventDefault();
      openExternal(href);
    }, true);
  }

  // ---------- Haptics ----------
  var Haptics = plugin('Haptics');
  function haptic(kind) {
    if (!Haptics) return;
    try {
      if (kind === 'success' || kind === 'warning' || kind === 'error') Haptics.notification({ type: kind.toUpperCase() });
      else Haptics.impact({ style: 'LIGHT' });
    } catch (e) { /* no haptics on this device */ }
  }

  // ---------- App lock (fingerprint, face or device biometrics) ----------
  function lockAvailable() {
    if (!Bio) return Promise.resolve(false);
    return Bio.isAvailable({ useFallback: false }).then(function (r) { return !!(r && r.isAvailable); }, function () { return false; });
  }
  function verify(text) {
    if (!Bio) return Promise.resolve(false);
    return Bio.verifyIdentity({ reason: text.reason, title: text.title, subtitle: text.subtitle, negativeButtonText: text.cancel, useFallback: true, maxAttempts: 5 })
      .then(function () { return true; }, function () { return false; });
  }
  function setLock(v) { LOCK = !!v; return setPref('wl-lock', LOCK ? '1' : ''); }

  // ---------- App lifecycle: back button and returning to the app ----------
  var App = plugin('App');
  var hiddenAt = 0;
  if (App) {
    App.addListener('backButton', function () {
      var ev = new CustomEvent('wl:back', { cancelable: true });
      if (!window.dispatchEvent(ev)) return; // the logbook handled it (closed a dialog or went back)
      App.exitApp();
    });
    App.addListener('appStateChange', function (s) {
      if (!s || s.isActive) {
        var away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        window.dispatchEvent(new CustomEvent('wl:resume', { detail: { away: away } }));
      } else {
        hiddenAt = Date.now();
        window.dispatchEvent(new CustomEvent('wl:pause'));
      }
    });
  }

  // Android draws behind the status and navigation bars from Android 15. Mark the page so CSS can keep content clear.
  if (on) document.documentElement.classList.add('native', 'native-' + (cap.getPlatform ? cap.getPlatform() : 'app'));

  window.WLNative = {
    on: on,
    platform: on && cap.getPlatform ? cap.getPlatform() : 'web',
    site: site,
    origin: SITE,
    host: SITE.replace(/^[a-z]+:\/\//i, ''),
    net: net,
    ready: ready,
    signedIn: function () { return !!TOKEN; },
    clearToken: function () { setToken(''); },
    openExternal: openExternal,
    haptic: haptic,
    lockAvailable: lockAvailable,
    lockOn: function () { return on && LOCK; },
    setLock: setLock,
    verify: verify,
    plugin: plugin
  };
})();
