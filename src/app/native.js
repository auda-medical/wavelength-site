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
  var VERSION = on ? String((window.WL_NATIVE && window.WL_NATIVE.version) || '') : '';
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
  // Both reads are local. A plugin that never answers must not hold the app on its start screen, so after
  // READY_WAIT the app carries on and readFailed() says the token could not be read (never "signed out").
  var READY_WAIT = 4000, READ_DONE = false, READ_FAILED = false;
  var ready = on ? Promise.race([
    Promise.all([readToken(), pref('wl-lock')]).then(function (v) { TOKEN = v[0]; LOCK = v[1] === '1'; READ_DONE = true; READ_FAILED = false; }),
    new Promise(function (ok) { setTimeout(function () { if (!READ_DONE) READ_FAILED = true; ok(); }, READY_WAIT); })
  ]) : Promise.resolve();
  function setToken(t) { if ((t || '') === TOKEN) return; TOKEN = t || ''; saveToken(TOKEN); }
  // A path on the Wavelength website as an absolute address (the website itself keeps relative paths).
  function site(path) { return /^[a-z]+:/i.test(path) ? path : SITE + path; }
  // fetch() with a time limit (opt.timeout, default NET_WAIT). A call that gets no answer fails like an offline
  // call, with err.timeout set, instead of waiting for ever.
  var NET_WAIT = 20000;
  function timed(url, opt) {
    var ms = opt.timeout || NET_WAIT, o = {};
    for (var k in opt) if (k !== 'timeout') o[k] = opt[k];
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    if (ctl) o.signal = ctl.signal;
    var timer;
    var limit = new Promise(function (ok, no) {
      timer = setTimeout(function () { if (ctl) ctl.abort(); var e = new Error('No answer from the server'); e.timeout = true; e.network = true; no(e); }, ms);
    });
    var call = fetch(url, o).catch(function (e) { e.network = true; throw e; });
    return Promise.race([call, limit]).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }
  // fetch() for the Wavelength server. In the app: absolute address, token header, no cookies, token kept fresh.
  function net(path, opt) {
    opt = opt || {};
    if (!on) return timed(path, opt);
    return ready.then(function () {
      var h = new Headers(opt.headers || {});
      h.set('X-Wavelength-Client', 'app');
      // The store version, so the server can ask a too-old app to update (worker: APP_MIN_VERSION).
      if (VERSION) h.set('X-Wavelength-App', VERSION);
      if (TOKEN) h.set('Authorization', 'Bearer ' + TOKEN);
      var o = {}; for (var k in opt) o[k] = opt[k];
      o.headers = h; o.credentials = 'omit'; o.mode = 'cors';
      return timed(site(path), o).then(function (r) {
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

  // ---------- App lock (the phone's own fingerprint, face or screen-lock prompt) ----------
  // Only the system prompt is used; the app never sees or stores a fingerprint or a face. On iPhone: Face ID or
  // Touch ID with the passcode as fallback. On Android 11 and later: Class 3 (strong) biometrics, meaning
  // fingerprint or a secure face or iris sensor, with the phone's PIN, pattern or password as fallback. Android's
  // weaker camera-only face unlock is not accepted. Android 7 to 10 cannot combine strong biometrics with the PIN in
  // one prompt, so there the lock needs a strong biometric (anyone locked out can still log out and log in with the
  // account password). Nothing here uses the network.
  var PLATFORM = on && cap.getPlatform ? cap.getPlatform() : 'web';
  var ANDROID = PLATFORM === 'android' ? (parseInt((/Android (\d+)/.exec(navigator.userAgent) || [])[1], 10) || 0) : 0;
  var STRONG = 1, FINGERPRINT_STRONG = 3, DEVICE_CREDENTIAL = 7; // plugin enums: AuthenticationStrength, BiometryType
  var PIN_FALLBACK = PLATFORM === 'ios' || ANDROID >= 11;
  function lockAvailable() {
    if (!Bio) return Promise.resolve(false);
    return Bio.isAvailable({ useFallback: PIN_FALLBACK }).then(function (r) {
      if (!r || !r.isAvailable) return false;
      return PIN_FALLBACK || r.authenticationStrength === STRONG;
    }, function () { return false; });
  }
  function verify(text) {
    if (!Bio) return Promise.resolve(false);
    var o = { reason: text.reason, title: text.title, subtitle: text.subtitle, negativeButtonText: text.cancel, useFallback: true, maxAttempts: 5 };
    if (PLATFORM === 'android') o.allowedBiometryTypes = PIN_FALLBACK ? [FINGERPRINT_STRONG, DEVICE_CREDENTIAL] : [FINGERPRINT_STRONG];
    return Bio.verifyIdentity(o).then(function () { return true; }, function () { return false; });
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

  // The installed app's version and build, read from the app's own metadata (Android versionName and versionCode,
  // iOS CFBundleShortVersionString and CFBundleVersion), so About always matches the store listing. Falls back to the
  // numbers the bundle was built with, then to none. Never needs the network.
  var info = null;
  function appInfo() {
    if (info) return info;
    var built = { version: VERSION, build: String((window.WL_NATIVE && window.WL_NATIVE.versionCode) || '') };
    info = !on ? Promise.resolve({ version: '', build: '' })
      : App && App.getInfo ? App.getInfo().then(function (r) { return { version: String((r && r.version) || built.version), build: String((r && r.build) || built.build) }; }, function () { return built; })
      : Promise.resolve(built);
    return info;
  }

  // Android draws behind the status and navigation bars from Android 15. Mark the page so CSS can keep content clear.
  if (on) document.documentElement.classList.add('native', 'native-' + (cap.getPlatform ? cap.getPlatform() : 'app'));

  window.WLNative = {
    on: on,
    platform: PLATFORM,
    pinFallback: PIN_FALLBACK,
    site: site,
    origin: SITE,
    host: SITE.replace(/^[a-z]+:\/\//i, ''),
    net: net,
    version: VERSION,
    appInfo: appInfo,
    ready: ready,
    readFailed: function () { return READ_FAILED && !TOKEN; },
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
