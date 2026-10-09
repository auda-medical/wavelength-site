// Wavelength app: ultrasound logbook, progress against accreditation targets, sign-off, assessments, supervisor
// dashboard, exports and backups. Logbook text syncs to the learner's account. Images and clips stay on this device
// (IndexedDB) and in backups the learner makes. Every interface string goes through T() for translation: the
// language files live in src/app/i18n/<lang>.json and the English text is the key.
(function () {
  'use strict';
  var C = window.WL_LOGBOOK;
  var ENG = window.WLProgress.create(C);
  var TYPES = ENG.TYPES, PATHS = ENG.PATHS;
  var DESTS = C.destinations || [], DEST = {}; DESTS.forEach(function (d) { DEST[d.id] = d; });
  var KIND = {}; (C.assessmentKinds || []).forEach(function (k) { KIND[k.id] = k; });
  var OUTCOME = {}; (C.assessmentOutcomes || []).forEach(function (o) { OUTCOME[o.id] = o; });
  var F = window.WLForms;
  // Store apps (mobile/): server address, login token, website links, haptics and app lock. Inert on the website.
  var NAT = window.WLNative || { on: false, origin: location.origin, host: location.host, site: function (p) { return p; }, net: function (p, o) { return fetch(p, o); }, haptic: function () {}, openExternal: function (u) { window.open(u, '_blank'); }, lockOn: function () { return false; }, plugin: function () { return null; } };
  var app = document.getElementById('app');
  var S = { account: null, me: null, entries: [], kv: {}, db: null, online: navigator.onLine, syncing: false, installEvt: null, urls: {}, assessments: [], links: null };

  // ---------- Language ----------
  var LANGS = [['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pl', 'Polski'], ['ar', 'العربية'], ['ru', 'Русский'], ['zh', '中文（简体）']];
  var LOCALES = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', pl: 'pl-PL', ar: 'ar', ru: 'ru-RU', zh: 'zh-CN' };
  var LANG = 'en', L = {}, PR = null;
  function pickLang() {
    var saved = null; try { saved = localStorage.getItem('wl-lang'); } catch (e) { /* storage blocked */ }
    var q = new URLSearchParams(location.search).get('lang');
    var want = q || saved || ((navigator.languages || [navigator.language || 'en'])[0] || 'en').slice(0, 2).toLowerCase();
    return LOCALES[want] ? want : 'en';
  }
  function setLangVars(code) {
    LANG = code; L = window.WL_I18N || {};
    PR = window.Intl && Intl.PluralRules ? new Intl.PluralRules(LOCALES[code]) : null;
    document.documentElement.lang = LOCALES[code]; document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
  }
  function T(s, v) {
    var t = typeof L[s] === 'string' && L[s] ? L[s] : s;
    if (v) t = t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; });
    return t;
  }
  // Plurals: the language file may hold { one, few, many, other } under the plural key.
  function N(n, one, other) {
    var tr = L[other];
    if (tr && typeof tr === 'object') { var cat = PR ? PR.select(n) : (n === 1 ? 'one' : 'other'); return (tr[cat] || tr.other || other).replace('{n}', n); }
    return T(n === 1 ? one : other, { n: n });
  }
  function plural(n, a, b) { return N(n, '{n} ' + a, '{n} ' + (b || a + 's')); }
  function setLang(code) {
    try { localStorage.setItem('wl-lang', code); } catch (e) { /* storage blocked */ }
    var done = function () { location.reload(); };
    if (S.account) saveProfile({ lang: code }).then(done, done); else done();
  }
  function langPicker(id) {
    return '<label class="lang-pick" for="' + id + '"><span aria-hidden="true">🌐</span><select id="' + id + '" data-lang aria-label="' + esc(T('Language')) + '">' + LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0] === LANG ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></label>';
  }
  function bindLang(root) { $$('[data-lang]', root).forEach(function (s) { s.onchange = function () { setLang(s.value); }; }); }

  // ---------- Small helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid() { var a = crypto.getRandomValues(new Uint8Array(12)); return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join(''); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function fmt(iso, o) { if (!iso) return ''; return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(LOCALES[LANG], o || { day: 'numeric', month: 'short', year: 'numeric' }); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function val(v) { return Array.isArray(v) ? v.map(function (x) { return T(x); }).join(', ') : typeof v === 'string' ? T(v) : v; } // translate stored English choice values for display
  function pwName(p) { return p.id === 'general' ? T('General logbook') : p.label; }
  var MARK = function (size, ring) { return '<svg class="mark" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="30" stroke="' + (ring || 'currentColor') + '" stroke-width="2"/><path d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke="#7FC4CC" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };
  var ic = function (d, w) { return '<svg width="' + (w || 22) + '" height="' + (w || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var I = {
    home: ic('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', 24),
    book: ic('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/><path d="M8 8h8M8 11.5h5"/>', 24),
    plus: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    chart: ic('<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>', 24),
    user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', 24),
    gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    back: '<svg class="flip" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    pen: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    file: ic('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    cloud: ic('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5"/>'),
    camera: ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    video: ic('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
    lock: ic('<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    target: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    check: ic('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.5"/>'),
    cert: ic('<circle cx="12" cy="9" r="5"/><path d="M9 13.5 7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>'),
    share: ic('<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v8h14v-8"/>', 20),
    team: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.7.7 3 2.5 3.5 5.2"/>'),
    clip: ic('<path d="M9 4h6l1 3H8z"/><rect x="4" y="7" width="16" height="13" rx="2"/><path d="m10.5 11 4 2.5-4 2.5z"/>'),
    star: ic('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    globe: ic('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')
  };
  function toast(msg, ms) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2600);
  }
  // o.timeout: milliseconds before a call with no answer fails as offline (native.js, default 20 s).
  function api(path, data, o) {
    var opt = { credentials: 'same-origin', headers: { Accept: 'application/json', 'Accept-Language': LANG } };
    if (data !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    if (o && o.timeout) opt.timeout = o.timeout;
    return NAT.net(path, opt).then(function (r) {
      return r.json().catch(function (ex) { if (ex && ex.name === 'AbortError') { ex.network = true; ex.timeout = true; throw ex; } return { _nojson: true }; }).then(function (j) { j._status = r.status; if (j.error) j.error = T(j.error); if (r.status === 401 && j.auth === false && S.account) { authExpired(); } if (r.status === 426 && j.upgrade) { S.update = 'required'; showUpdate(); } return j; });
    });
  }
  // A network failure or a call that got no answer, as opposed to an answer from the server.
  function netFail(ex) { return !!(ex && (ex.network || ex.timeout || ex.name === 'TypeError' || ex.name === 'AbortError')); }
  // ---------- Store app updates ----------
  // The server names a minimum and a recommended store version. Recommended: a banner the learner can dismiss.
  // Required (only for a security or data-integrity reason): a banner that stays, and sync pauses, but the logbook
  // stays readable and exportable on this phone so nobody is locked out of their own records.
  function verCmp(a, b) {
    var x = String(a || '').split('.'), y = String(b || '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  function updateLevel() {
    if (S.update === 'required') return 'required';
    var me = S.me || {};
    if (me.update === 'required' || me.update === 'recommended') return me.update;
    if (!NAT.on || !NAT.version) return 'none';
    if (me.minVersion && verCmp(NAT.version, me.minVersion) < 0) return 'required';
    if (me.recommendedVersion && verCmp(NAT.version, me.recommendedVersion) < 0) return 'recommended';
    return 'none';
  }
  function storeUrl() { return NAT.platform === 'android' ? 'https://play.google.com/store/apps/details?id=uk.co.thewavelength.app' : 'https://thewavelength.co.uk/app/get/'; }
  function updateBanner() {
    var lv = updateLevel(); if (lv === 'none') return '';
    if (lv === 'recommended') { var seen; try { seen = localStorage.getItem('wl-upd-hide'); } catch (e) { seen = null; } if (seen && seen === String((S.me || {}).recommendedVersion || 'r')) return ''; }
    var msg = (S.me && S.me.updateMessage) || (lv === 'required' ? T('Update Wavelength to keep syncing. Your logbook stays on this phone and you can still read and export it.') : T('A new version of Wavelength is ready. Update when you can.'));
    return '<div class="upd ' + lv + '" role="status"><p>' + esc(msg) + '</p><div class="row"><a class="btn sm teal" href="' + esc(storeUrl()) + '" target="_blank" rel="noopener">' + esc(T('Update')) + '</a>' + (lv === 'recommended' ? '<button class="link small" type="button" data-updhide>' + esc(T('Not now')) + '</button>' : '') + '</div></div>';
  }
  function showUpdate() { if (!document.querySelector('.upd') && S.account) { var m = document.querySelector('main'); if (m) { m.insertAdjacentHTML('afterbegin', updateBanner()); bindUpdate(); } } }
  function bindUpdate() {
    var h = $('[data-updhide]'); if (h) h.onclick = function () { try { localStorage.setItem('wl-upd-hide', String((S.me || {}).recommendedVersion || 'r')); } catch (e) { /* storage blocked */ } var b = h.closest('.upd'); if (b) b.remove(); };
    $$('.upd a.btn').forEach(function (a) { a.addEventListener('click', function (ev) { if (NAT.on && NAT.openExternal && !ev.defaultPrevented) { ev.preventDefault(); NAT.openExternal(a.href); } }); });
  }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error(T('Could not load a part of the app. Check your connection.'))); }; document.head.appendChild(s); }); }
  // ---------- New passwords: the same rules as the server (worker/password.js), a live checklist and a confirm box ----------
  var PW_RULES = [
    ['At least 10 characters', function (p) { return p.length >= 10; }],
    ['An uppercase letter', function (p) { return /\p{Lu}/u.test(p); }],
    ['A lowercase letter', function (p) { return /\p{Ll}/u.test(p); }],
    ['A number', function (p) { return /\p{Nd}/u.test(p); }],
    ['A symbol, such as ! ? # or %', function (p) { return /[^\p{L}\p{N}]/u.test(p); }]
  ];
  function pwFields(id, label, name) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '"' + (name ? ' name="' + name + '"' : '') + ' type="password" autocomplete="new-password" required aria-describedby="' + id + '-rules">' +
      '<ul class="pw-rules" id="' + id + '-rules">' + PW_RULES.map(function (r, i) { return '<li data-rule="' + i + '">' + esc(T(r[0])) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="field"><label for="' + id + '-2">' + esc(T('Confirm password')) + '</label><input id="' + id + '-2" type="password" autocomplete="new-password" required><p class="pw-match" id="' + id + '-m" hidden></p></div>';
  }
  function bindPw(root, id) {
    var a = $('#' + id, root), b = $('#' + id + '-2', root), m = $('#' + id + '-m', root);
    var paint = function () {
      var v = a.value;
      $$('#' + id + '-rules li', root).forEach(function (li) { li.classList.toggle('met', PW_RULES[+li.dataset.rule][1](v)); });
      if (b.value) { var same = b.value === v; m.hidden = false; m.className = 'pw-match ' + (same ? 'met' : 'bad'); m.textContent = same ? T('Passwords match.') : T('Passwords do not match.'); } else m.hidden = true;
    };
    a.addEventListener('input', paint); b.addEventListener('input', paint);
  }
  // The problem with the new password, or '' when it meets every rule and both boxes match.
  function pwProblem(root, id) {
    var v = $('#' + id, root).value;
    if (!PW_RULES.every(function (r) { return r[1](v); })) return T('Choose a password of at least 10 characters with an uppercase letter, a lowercase letter, a number and a symbol.');
    if ($('#' + id + '-2', root).value !== v) return T('Passwords do not match.');
    return '';
  }
  function copy(text, done) { return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(done || T('Link copied.')); }).catch(function () { prompt(T('Copy this link'), text); }); }

  // ---------- Local database: one per account, so two people on one device never mix logbooks ----------
  var DB_VERSION = 2;
  var IMG_LIMIT = 1572864 - 64; // the Worker's per-image share limit (IMG_MAX), less the encryption overhead
  function openDb(id) {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('wavelength-' + id, DB_VERSION);
      // A ladder: each step runs once, in order, from the version on the phone. Steps only add stores or indexes, or
      // transform records in place. Never delete a store that holds user data in the release that stops using it.
      r.onupgradeneeded = function (ev) {
        var db = r.result, from = ev.oldVersion || 0;
        if (from < 1) {
          db.createObjectStore('entries', { keyPath: 'id' });
          var im = db.createObjectStore('images', { keyPath: 'id' }); im.createIndex('entryId', 'entryId');
          db.createObjectStore('kv', { keyPath: 'k' });
        }
        if (from < 2) db.createObjectStore('shares', { keyPath: 'code' }); // encrypted upload queue for sign-off links
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
  }
  function tx(store, mode, fn) {
    return new Promise(function (ok, no) {
      var t = S.db.transaction(store, mode), st = t.objectStore(store), out;
      var req = fn(st); if (req) req.onsuccess = function () { out = req.result; };
      t.oncomplete = function () { ok(out); }; t.onerror = function () { no(t.error); }; t.onabort = function () { no(t.error); };
    });
  }
  var put = function (store, v) { return tx(store, 'readwrite', function (s) { return s.put(v); }); };
  var del = function (store, k) { return tx(store, 'readwrite', function (s) { return s.delete(k); }); };
  var all = function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); };
  var getOne = function (store, k) { return tx(store, 'readonly', function (s) { return s.get(k); }); };
  function setKv(k, v) { S.kv[k] = v; return put('kv', { k: k, v: v }); }
  function imagesFor(entryId) { return tx('images', 'readonly', function (s) { return s.index('entryId').getAll(entryId); }); }
  function imgUrl(rec, thumb) {
    var key = rec.id + (thumb ? 't' : '');
    if (!S.urls[key]) S.urls[key] = URL.createObjectURL(thumb ? rec.thumb : rec.blob);
    return S.urls[key];
  }
  function isClip(rec) { return rec && (rec.kind === 'clip' || /^video\//.test((rec.blob || {}).type || '')); }

  // ---------- Sync ----------
  function live() { return S.entries.filter(function (e) { return !e.deleted; }); }
  // Sign-off status per scan: green signed, amber awaiting a live request, red needs action, none when the learner marks it as not needing sign-off.
  function setPending(list) {
    var m = {}, now = Date.now();
    (list || []).forEach(function (s) { if (s.status === 'pending' && s.method !== 'in-person' && s.expires_at > now) (s.entry_ids || []).forEach(function (id) { m[id] = { code: s.id, name: s.supervisor_name || '', exp: s.expires_at }; }); });
    return setKv('pending', m);
  }
  function waiting(e) { var p = (S.kv.pending || {})[e.id]; return p && p.exp > Date.now() ? p : null; }
  function signState(e) {
    if (e.signoff && e.signoff.status === 'confirmed') return 'signed';
    if (waiting(e)) return 'waiting';
    if (e.noSignoff) return 'none';
    if (e.signoff && e.signoff.status === 'query') return 'query';
    if (e.signoffVoid) return 'void';
    return 'todo';
  }
  var STATES = { signed: ['green', 'Signed off'], waiting: ['amber', 'Awaiting sign-off'], none: ['', ''], query: ['red', 'Queried'], void: ['red', 'Edited, re-sign'], todo: ['red', 'Not sent'] };
  var TODO = ['todo', 'query', 'void'];
  function stateMatch(e, f) { var s = signState(e); return !f || (f === 'todo' ? TODO.indexOf(s) >= 0 : f === 'unsigned' ? (s !== 'signed' && s !== 'none') : s === f); }
  // New sign-offs from supervisors (link or dashboard), shown until the learner opens the logbook or dismisses them.
  function news() { return S.kv.news || []; }
  function newsText(list) {
    var by = {}; list.forEach(function (n) { var k = n.name + '|' + n.status; by[k] = (by[k] || 0) + 1; });
    return Object.keys(by).map(function (k) { var p = k.split('|'); return p[1] === 'query' ? T('{name} queried {scans}.', { name: p[0], scans: plural(by[k], 'scan') }) : T('{name} signed off {scans}.', { name: p[0], scans: plural(by[k], 'scan') }); }).join(' ');
  }
  function strip(e) { var o = {}; for (var k in e) if (k.charAt(0) !== '_') o[k] = e[k]; return o; }
  function saveLocal(e) { var i = S.entries.findIndex(function (x) { return x.id === e.id; }); if (i >= 0) S.entries[i] = e; else S.entries.push(e); return put('entries', e); }
  // ---------- Sync status ----------
  // The status comes from what the last attempt actually did, combined with what the phone says about its network
  // (netstate.js): never from navigator.onLine alone. "Offline" means this device has no network; "Can't sync" means
  // it has one but the Wavelength server could not be reached (a VPN, firewall or network filter, or the server).
  // Each device shows its own status. Logbook entries only; photos and clips stay on this device and are backed up
  // separately (Back up and restore).
  var NETR = window.WLNet;
  var SY = { lastOk: 0, lastTry: 0, fail: '', tries: 0, timer: 0, ran: false, err: null };
  S.net = null; // the phone's network (WLNetwork plugin), or null where only navigator.onLine is known
  function deviceNet() { return S.net || { known: false, online: navigator.onLine !== false }; }
  function pendingList() { return S.entries.filter(function (e) { return e._dirty; }); }
  function refused() { return S.entries.filter(function (e) { return e._dirty && e._syncError; }); }
  function syncState() {
    return NETR.state({ account: !!S.account, update: SY.fail === 'update', syncing: S.syncing, auto: !S.syncManual, fail: SY.fail, dev: deviceNet(), pending: pendingList().length, refused: refused().length, ran: SY.ran });
  }
  function syncText(st) {
    var n = pendingList().length;
    if (st === 'offline') return T('You\'re offline. Your entries are saved on this device and will sync when you\'re back online.');
    if (st === 'unreachable') return T('Can\'t connect to Wavelength. Your entries remain saved on this device.');
    if (st === 'pending') return N(n, 'Saved on this device. {n} entry awaiting sync.', 'Saved on this device. {n} entries awaiting sync.');
    if (st === 'syncing') return n ? N(n, 'Synchronising {n} entry…', 'Synchronising {n} entries…') : T('Synchronising…');
    if (st === 'synced') return T('All changes synced.');
    if (st === 'failed') return T('Unable to sync. Your entries remain saved on this device.');
    if (st === 'auth') return T('Sign in again to continue synchronising. Your local entries are safe.');
    if (st === 'update') return T('Update Wavelength to keep syncing. Your logbook stays on this phone and you can still read and export it.');
    return '';
  }
  // Small line icons for the status pill and banners (stroke follows the text colour).
  var SI = {
    check: ic('<path d="M5 12.5l4.2 4.2L19 7"/>', 14),
    clock: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 14),
    sync: ic('<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3.5v3.8h-3.8M5.5 20.5v-3.8h3.8"/>', 14),
    offline: ic('<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4-2.4M19 12.9a10 10 0 0 0-2.2-1.6M2 9.3a15 15 0 0 1 4.3-2.8M22 9.3A15 15 0 0 0 10.6 5"/><circle cx="12" cy="20" r=".6"/>', 14),
    alert: ic('<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.3"/>', 14),
    lock: ic('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', 14),
    chev: '<svg class="chev flip" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
  };
  function pillInner(st) {
    var p = NETR.pill(st);
    return '<span class="sp-ic" aria-hidden="true">' + SI[p.icon] + '</span><span class="sp-tx">' + esc(T(p.label, { n: pendingList().length })) + '</span>' + SI.chev;
  }
  // Banner below the header. Pending and syncing wait a moment before showing, so a save that syncs at once never
  // flashes a warning; "All changes synced." shows briefly after a warning, then goes, leaving the pill.
  var BAN = { st: null, at: 0, shown: false, okUntil: 0, timer: 0 };
  function bannerHtml(b, n) {
    var line = b.wait ? N(n, b.wait[0], b.wait[1]) : b.body ? T(b.body) : b.note ? T(b.note) : '';
    var det = b.details ? '<button type="button" class="link small" data-syncpill>' + esc(T('Connection details')) + '</button>' : '';
    if (b.compact) return '<div class="sb sb-' + b.tone + ' sb-compact"><span class="sb-ic" aria-hidden="true">' + SI[b.icon] + '</span><p class="sb-tx"><b>' + esc(T(b.title)) + '</b> ' + esc(line) + '</p>' + det + '</div>';
    return '<div class="sb sb-' + b.tone + '"><span class="sb-ic" aria-hidden="true">' + SI[b.icon] + '</span><div class="sb-tx"><b>' + esc(T(b.title)) + '</b>' +
      (line ? '<p>' + esc(line) + '</p>' : '') +
      (b.progress ? '<span class="sb-prog" aria-hidden="true"><i></i></span>' : '') +
      (b.retry || b.details ? '<div class="sb-act">' + (b.retry ? retryButton('btn sm', 'data-sbretry') : '') + det + '</div>' : '') +
      '</div></div>';
  }
  // Retry sync. Disabled with "Trying…" (and aria-busy) only while an attempt the learner asked for is running; a
  // quiet automatic retry leaves it as it is, so it does not flicker. Unavailable, with the reason beside it, while
  // the device has no network at all (a retry could not reach anything).
  function userBusy() { return !!(S.syncing && S.syncManual) || !!SY.userWaiting; }
  function retryButton(cls, attr) {
    if (userBusy()) return '<button type="button" class="' + cls + '" ' + attr + ' disabled aria-busy="true">' + esc(T('Trying…')) + '</button>';
    if (!NETR.deviceOnline(deviceNet())) return '<button type="button" class="' + cls + '" ' + attr + ' disabled aria-describedby="rt-why">' + esc(T('Retry sync')) + '</button><span class="small muted" id="rt-why">' + esc(T('Available once this device has a network.')) + '</span>';
    return '<button type="button" class="' + cls + '" ' + attr + '>' + esc(T('Retry sync')) + '</button>';
  }
  function setSyncDot() {
    var st = syncState(), text = syncText(st), n = pendingList().length, now = Date.now();
    if (st !== BAN.st) { if (st === 'synced') { if (BAN.shown) BAN.okUntil = now + 3000; BAN.shown = false; } BAN.st = st; BAN.at = now; }
    var settle = st === 'pending' ? 3000 : st === 'syncing' ? 800 : 0, age = now - BAN.at;
    var b = NETR.banner(st, n, { settled: age >= settle, justSynced: now < BAN.okUntil });
    clearTimeout(BAN.timer);
    if (settle && age < settle) BAN.timer = setTimeout(setSyncDot, settle - age + 20);
    else if (b && st === 'synced') BAN.timer = setTimeout(setSyncDot, BAN.okUntil - now + 20);
    if (b && st !== 'synced') BAN.shown = true; // a warning was on screen: confirm briefly once everything has synced
    var cls = NETR.pill(st).cls, inner = pillInner(st);
    $$('button.sync-pill').forEach(function (a) {
      a.className = 'sync-pill p-' + cls;
      if (a.dataset.k !== inner) { a.innerHTML = inner; a.dataset.k = inner; }
      // The accessible name starts with the words on the pill, so voice control ("tap Can't sync") finds it.
      a.setAttribute('aria-label', T(NETR.pill(st).label, { n: n }) + '. ' + (text ? T('Sync status: {status}', { status: text }) : T('Sync status')) + ' ' + T('Open sync details.'));
    });
    $$('[data-syncbanner]').forEach(function (el) {
      var html = b ? bannerHtml(b, n) : '', key = (b ? st + n + (userBusy() ? 's' : '') + (NETR.deviceOnline(deviceNet()) ? '' : 'o') : '');
      if (el.dataset.k === key) return;
      el.dataset.k = key;
      if (!b) { el.hidden = true; el.innerHTML = ''; return; }
      el.innerHTML = html; el.hidden = false;
      // Fades in only when the status itself changes, not every time a screen is drawn.
      el.classList.toggle('in', BAN.key !== key);
    });
    BAN.key = b ? st + n + (userBusy() ? 's' : '') + (NETR.deviceOnline(deviceNet()) ? '' : 'o') : '';
    $$('[data-syncpanel]').forEach(fillSyncPanel);
  }
  // Retry Sync from a banner or the details panel: start the back-off again and send entries the server refused.
  function retryNow() {
    SY.tries = 0; if (SY.fail === 'offline') SY.fail = '';
    // Tapped while a quiet automatic attempt is running: this one runs straight after it, and the button says so.
    SY.userWaiting = true; setSyncDot();
    return sync(true).then(function () { SY.userWaiting = false; setSyncDot(); }, function () { SY.userWaiting = false; setSyncDot(); });
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-syncpill],[data-sbretry]') : null; if (!t) return;
    ev.preventDefault();
    if (t.hasAttribute('data-sbretry')) { if (!t.disabled) retryNow(); return; }
    openSyncSheet();
  });
  function openSyncSheet() {
    if ($('.sheet [data-syncpanel]')) return;
    sheet('<h2>' + esc(T('Sync on this device')) + '</h2><div data-syncpanel></div><div class="btns"><button class="btn ghost block" type="button" data-close>' + esc(T('Close')) + '</button></div>', function (root) { fillSyncPanel($('[data-syncpanel]', root)); });
  }
  // One timer at most. While the app is in the background (wl:pause, or the web page hidden) no timer runs, so a long
  // disconnection does not keep waking the phone: returning to the app, a network change or Retry sync starts again.
  function scheduleRetry() {
    clearTimeout(SY.timer); SY.timer = 0;
    if (SY.paused) { SY.due = true; return; }
    SY.timer = setTimeout(function () { SY.timer = 0; sync(); }, NETR.retryDelay(SY.tries, Math.random(), SY.fail));
  }
  function pauseRetries() { SY.paused = true; if (SY.timer) { clearTimeout(SY.timer); SY.timer = 0; SY.due = true; } }
  // Back in the app: read the network afresh, then follow the resume plan (netstate.js): retry at once only when the
  // last attempt is not recent, and start the back-off again only after a longer time away or a network change.
  function resumeSync(away) {
    SY.paused = false;
    var was = S.net;
    return (NAT.netStatus ? NAT.netStatus() : Promise.resolve(null)).then(function (v) {
      if (v) S.net = v;
      if (!S.account) return;
      var now = Date.now(), changed = !!(v && NETR.netChanged(was, v));
      var plan = NETR.resumePlan({ away: away || 0, sinceTry: now - (SY.lastTry || 0), sinceOk: now - (SY.lastOk || 0), failing: !!SY.fail, pending: pendingList().length, netChanged: changed });
      if (changed) setSyncDot();
      if (plan.reset) SY.tries = 0;
      if (plan.sync) { SY.due = false; sync(); } else if (SY.due || SY.fail || pendingList().length) { SY.due = false; scheduleRetry(); }
    });
  }
  // The phone's network changed (Wi-Fi or mobile data back, a VPN connected, reconnected or switched off): try again
  // soon, from the start of the back-off. Changes arrive in bursts while a VPN reconnects, so wait for them to settle.
  function onNet(v) {
    var was = S.net; S.net = v;
    if (!NETR.netChanged(was, v)) return;
    setSyncDot();
    if (!S.account || !NETR.deviceOnline(v)) return;
    netKick();
  }
  // A network that keeps flapping (a VPN in a reconnect loop) must not become a retry storm: the back-off starts
  // again at most once a minute, and network-triggered syncs run at most every 10 seconds.
  function netKick() {
    var now = Date.now();
    if (now - (SY.netResetAt || 0) > 60e3) { SY.tries = 0; SY.netResetAt = now; }
    clearTimeout(SY.netTimer);
    SY.netTimer = setTimeout(function () { SY.netSyncAt = Date.now(); if (SY.fail || pendingList().length) sync(); }, Math.max(1500, (SY.netSyncAt || 0) + 10e3 - now));
  }
  window.addEventListener('wl:net', function (e) { onNet(e.detail); });
  if (NAT.netStatus) NAT.netStatus().then(function (v) { if (v) { S.net = v; setSyncDot(); } });
  // manual: the learner pressed Retry sync. Entries the server refused are only sent again then, or after an edit.
  function sync(manual) {
    if (!S.account) return Promise.resolve();
    if (updateLevel() === 'required') { SY.fail = 'update'; setSyncDot(); return Promise.resolve(); }
    if (SY.fail === 'update') SY.fail = '';
    if (S.syncing) { S.again = S.again || S.syncP.then(function () { S.again = null; return sync(manual); }); return S.again; }
    clearTimeout(SY.timer); SY.timer = 0;
    S.syncing = true; S.syncManual = !!manual; setSyncDot();
    S.syncP = doSync(manual);
    return S.syncP;
  }
  // The Worker takes at most 200 entries and 600 KB per call: send smaller batches, one after another.
  var BATCH = 50, BATCH_BYTES = 400000;
  function batches(list) {
    var out = [], cur = [], size = 0;
    list.forEach(function (e) {
      var n = JSON.stringify(strip(e)).length;
      if (cur.length && (cur.length >= BATCH || size + n > BATCH_BYTES)) { out.push(cur); cur = []; size = 0; }
      cur.push(e); size += n;
    });
    if (cur.length) out.push(cur);
    return out;
  }
  // Bumped on every log-out. A sync answer that arrives after a log-out (or a log-in to another account) is
  // dropped, so it can never be written into the next account's logbook.
  var SESSION = 0;
  function stale(gen) { if (gen !== SESSION) { var e = new Error('signed out'); e.stale = true; throw e; } }
  function pushBatch(group, gen) {
    var pushed = {}; group.forEach(function (e) { pushed[e.id] = e; });
    var conflicts = 0;
    return api('/api/app/sync', { entries: group.map(strip) }, { timeout: 30000 }).then(function (res) {
      stale(gen);
      if (!res.ok) { var er = new Error(res.error || 'Sync failed'); er.status = res._status; er.nojson = !!res._nojson; er.auth = res.auth === false; throw er; }
      var answered = {};
      var jobs = (res.saved || []).map(function (s) {
        answered[s.id] = true;
        var local = S.entries.find(function (x) { return x.id === s.id; });
        if (s.conflict) return resolveConflict(local, s.server) && ++conflicts;
        // Edited again while this push was in flight: keep the newer local edit and send it next time.
        if (local && local !== pushed[s.id]) { local.updatedAt = s.updatedAt; conflicts++; return put('entries', local); }
        if (s.deleted) { S.entries = S.entries.filter(function (x) { return x.id !== s.id; }); return del('entries', s.id); }
        var merged = Object.assign({}, s); if (local && local._new) delete merged._new;
        return saveLocal(merged);
      });
      // Only the server's answer marks an entry as synced. One it refused, or left out of its answer, stays
      // unsynced on this device with the reason, and is not sent again until it is edited or Retry sync is pressed.
      group.forEach(function (e) {
        if (answered[e.id]) return;
        var why = (res.rejected || []).filter(function (x) { return x.id === e.id; })[0];
        var local = S.entries.find(function (x) { return x.id === e.id; });
        if (local && local === pushed[e.id]) { local._syncError = (why && why.reason) || 'not-accepted'; jobs.push(put('entries', local)); }
      });
      return Promise.all(jobs).then(function () { return conflicts; });
    });
  }
  // The last 12 sync attempts on this device, for the details panel: time, result kind, how long it took and the kind
  // of network (Wi-Fi, mobile data, VPN). No entry content, server text, addresses or account details. Capped, so it
  // never grows.
  var LOG_MAX = 12;
  function attemptLog() { try { var a = JSON.parse(localStorage.getItem('wl-synclog') || '[]'); return Array.isArray(a) ? a.slice(-LOG_MAX) : []; } catch (e) { return []; } }
  function logAttempt(ok, kind) {
    var d = deviceNet(), t = d.known ? (d.transports || []).filter(function (x) { return x !== 'vpn'; }) : [];
    var net = !d.known ? '' : !d.connected ? 'none' : (t[0] || (NETR.vpnOnly(d) ? 'none' : '')) + (d.vpn ? '+vpn' : '');
    var a = attemptLog(); a.push({ at: Date.now(), ok: !!ok, kind: kind || '', ms: SY.lastTry ? Date.now() - SY.lastTry : 0, net: net });
    try { localStorage.setItem('wl-synclog', JSON.stringify(a.slice(-LOG_MAX))); } catch (e) { /* storage blocked */ }
  }
  function doSync(manual) {
    var dirty = S.entries.filter(function (e) { return e._dirty && (manual || !e._syncError); });
    var conflicts = 0, gen = SESSION;
    SY.lastTry = Date.now();
    var push = batches(dirty).reduce(function (p, group) { return p.then(function () { return pushBatch(group, gen).then(function (c) { conflicts += c; }); }); }, Promise.resolve());
    return push.then(function () { return pullAll(0, gen); }).then(function () {
      return api('/api/app/signoffs').then(function (r) { stale(gen); if (r.ok) return setPending(r.signoffs); });
    }).then(function () { return loadAssessments(gen); }).then(function () {
      SY.fail = ''; SY.ran = true; SY.lastOk = Date.now(); SY.err = null; logAttempt(true, '');
      // Started offline: the account details and supervisor links could not load then, so fetch them now.
      if (!S.me) loadMe();
      if (!S.links) loadLinks();
      return setKv('lastSyncOk', SY.lastOk);
    }, function (ex) {
      if (ex && ex.stale) return;
      // Kept on this device either way. Offline or no answer: wait for the connection. Anything else: show it.
      // Which failure it was decides the words shown: no network here, server unreachable from here, no answer in
      // time, the login ended, or a refusal. Only the kind and time are kept, never server text or entry content.
      SY.ran = true;
      SY.fail = !S.account ? '' : NETR.classify(ex, deviceNet());
      SY.err = SY.fail ? { kind: SY.fail, at: Date.now(), status: (ex && ex.status) || 0, vpn: !!(S.net && S.net.vpn) } : null;
      if (SY.fail) logAttempt(false, SY.fail);
    }).then(function () {
      S.syncing = false; S.syncManual = false;
      if (!S.account || gen !== SESSION) return;
      // The server answered although the phone last said "no network": that reading is stale, so read it again.
      if (!SY.fail && S.net && S.net.known && !S.net.connected && NAT.netStatus) NAT.netStatus().then(function (v) { if (v) { S.net = v; setSyncDot(); } });
      var left = S.entries.some(function (e) { return e._dirty && !e._syncError; });
      if (SY.fail === 'auth') { /* signed out: nothing to retry until the learner signs in */ }
      else if (SY.fail || left) { SY.tries++; scheduleRetry(); } else SY.tries = 0;
      setSyncDot(); resumeShares();
      // Send rebased edits straight away, at most twice in a row so a misbehaving server cannot loop us.
      if (!conflicts) S.rebases = 0; else if (!S.again && (S.rebases = (S.rebases || 0) + 1) <= 2) sync();
      if (['home', 'log', 'progress', 'entry', 'assess'].indexOf(route().name) >= 0 && !document.querySelector('form[data-dirty]') && !document.querySelector('.sheet-bg')) render(true);
    });
  }
  // The server had a newer copy than the one this device edited (another device, or a supervisor's sign-off).
  // A restored backup never overwrites a live server copy: the server copy wins. Otherwise the learner's latest
  // edit wins, rebased on the server copy so it saves next time; the server keeps the sign-off only if the
  // signed fields are unchanged. Returns true when the entry needs pushing again.
  function resolveConflict(local, server) {
    if (!local || !server) return false;
    if (local._restored && !server.deleted) { saveLocal(server); return false; }
    local.updatedAt = server.updatedAt;
    put('entries', local);
    return true;
  }
  // Pull every change since the last sync, a page at a time.
  function pullAll(guard, gen) {
    var q = '/api/app/sync?since=' + (S.kv.lastSync || 0) + (S.kv.lastSyncAfter ? '&after=' + encodeURIComponent(S.kv.lastSyncAfter) : '');
    return api(q).then(function (res) {
      stale(gen);
      if (!res.ok) { var er = new Error(res.error || 'Sync failed'); er.status = res._status; er.nojson = !!res._nojson; er.auth = res.auth === false; throw er; }
      var fresh = [];
      return Promise.all((res.entries || []).map(function (e) {
        var local = S.entries.find(function (x) { return x.id === e.id; });
        if (local && local._dirty) return null;
        var so = e.signoff, old = local && local.signoff;
        if (local && so && so.method !== 'in-person' && (!old || old.code !== so.code || old.status !== so.status)) fresh.push({ id: e.id, code: so.code, status: so.status, name: so.name || T('Your supervisor') });
        if (e.deleted) { S.entries = S.entries.filter(function (x) { return x.id !== e.id; }); dropImages(e.id); return del('entries', e.id); }
        return saveLocal(e);
      })).then(function () {
        if (!fresh.length) return;
        var keep = news().filter(function (n) { return !fresh.some(function (f) { return f.id === n.id; }); });
        toast(newsText(fresh), 4000);
        return setKv('news', keep.concat(fresh).slice(-50));
      }).then(function () { return setKv('lastSyncAfter', res.after || ''); }).then(function () { return setKv('lastSync', res.now); }).then(function () {
        if (res.more && (guard || 0) < 200) return pullAll((guard || 0) + 1, gen);
      });
    });
  }
  function dropImages(entryId) { return imagesFor(entryId).then(function (list) { return Promise.all(list.map(function (r) { return del('images', r.id); })); }).catch(function () {}); }
  function loadAssessments(gen) {
    if (gen === undefined) gen = SESSION;
    return api('/api/app/assessments').then(function (res) { stale(gen); if (res.ok) { S.assessments = res.assessments || []; setKv('assessments', S.assessments); } });
  }
  function signedAssessments() { return S.assessments.filter(function (a) { return a.status === 'signed'; }); }

  // ---------- Progress against targets (shared engine in progress.js) ----------
  function profile() { return (S.account && S.account.profile) || {}; }
  function myPaths() { var p = (profile().pathways || []).filter(function (x) { return PATHS[x]; }); return p.length ? p : ['general']; }
  function pathwayStats(pid) { return ENG.pathway(pid, live(), profile(), signedAssessments(), today()); }
  function moduleStats(pw, mod, entries) { return ENG.moduleStats(mod, entries, profile().targets, signedAssessments()); }
  function ring(frac, colour, label) {
    var r = 27, c = 2 * Math.PI * r, col = 'var(--' + ({ red: 'red', amber: 'amber', green: 'green' }[colour] || 'red') + ')';
    return '<div class="ring"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="' + r + '" fill="none" style="stroke:var(--sand)" stroke-width="6"/><circle cx="32" cy="32" r="' + r + '" fill="none" style="stroke:' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (c * Math.max(0.02, frac)).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/></svg><b>' + label + '</b></div>';
  }
  function barRow(label, n, target, kind) {
    if (kind === 'max') {
      var bad = n > target;
      return '<div class="bar-row"><div class="lbl"><span>' + esc(label) + '</span><b>' + esc(T('{n} of {m} allowed', { n: n, m: target })) + '</b></div><div class="bar ' + (bad ? 'over' : 'green') + '"><i style="width:' + Math.min(100, target ? 100 * n / target : 0) + '%"></i></div></div>';
    }
    var f = target ? Math.min(1, n / target) : 1, col = f >= 1 ? 'green' : f >= 1 / 3 ? 'amber' : '';
    return '<div class="bar-row"><div class="lbl"><span>' + esc(label) + '</span><b>' + n + ' / ' + target + (f >= 1 ? ' ✓' : '') + '</b></div><div class="bar ' + col + '"><i style="width:' + (100 * f) + '%"></i></div></div>';
  }
  function gapText(g) {
    if (g.k === 'scans') return plural(g.n, 'more scan');
    if (g.k === 'supervised') return T('{n} more supervised', { n: g.n });
    if (g.k === 'reflections') return plural(g.n, 'more reflection');
    return T('{n} more: {what}', { n: g.n, what: T(g.label) });
  }
  function needText(s) {
    if (!s.total && !s.sup && !s.gaps.length) return plural(s.list.length, 'scan') + ' ' + T('logged');
    if (s.met) return T('Target met');
    var bits = s.gaps.map(gapText);
    return T('Still needed: {list}', { list: bits.slice(0, 2).join(', ') + (bits.length > 2 ? ' …' : '') });
  }
  // The module most worth working on next: unmet, closest to done first so learners finish things.
  function focusNext() {
    var best = null;
    myPaths().forEach(function (pid) {
      if (pid === 'general') return;
      pathwayStats(pid).stats.forEach(function (s) { if (!s.met && (s.total || s.gaps.length) && (!best || s.frac > best.s.frac)) best = { pid: pid, s: s }; });
    });
    return best;
  }
  function learnLink(mod) { var t = TYPES[mod.types[0]]; return t && t.learn ? t.learn : '/learn/'; }

  // ---------- Install ("Download the app") ----------
  // Store shells: Android's WebView has no Web Share, so text and link shares use the native Share plugin.
  if (NAT.on && NAT.plugin('Share') && !navigator.share) {
    try { navigator.share = function (d) { if (d && d.files) return Promise.reject(new Error('files')); return NAT.plugin('Share').share({ title: d.title, text: d.text, url: d.url }); }; } catch (e) {}
  }
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /WavelengthApp/.test(navigator.userAgent) || NAT.on;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; $$('[data-install]').forEach(function (b) { b.hidden = false; }); });
  window.addEventListener('appinstalled', function () { S.installEvt = null; toast(T('Wavelength is on your home screen.')); $$('[data-install]').forEach(function (b) { b.hidden = true; }); });
  function canInstall() { return !standalone && (S.installEvt || isIOS || /android/i.test(navigator.userAgent)); }
  function installButton(label) {
    return '<button class="get-app" type="button" data-install' + (canInstall() ? '' : ' hidden') + '><span class="ico">' + MARK(30, '#7FC4CC') + '</span><span><small>' + esc(isIOS ? T('Add to your iPhone') : T('Get it for your phone')) + '</small><b>' + esc(label || T('Download the Wavelength app')) + '</b></span></button>';
  }
  function doInstall() {
    if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(function () { S.installEvt = null; }); return; }
    sheet('<h2>' + esc(T('Install Wavelength')) + '</h2><p class="muted">' + esc(isIOS ? T('Two taps put Wavelength on your home screen. It then opens full screen like any app and keeps your photos safe from Safari clearing its storage.') : T('Open your browser menu and choose Install app or Add to Home screen.')) + '</p>' +
      (isIOS ? '<ol class="ios-steps"><li><span>' + T('Tap the <b>Share</b> button {icon} in Safari\'s toolbar.', { icon: I.share }) + '</span></li><li><span>' + T('Scroll and tap <b>Add to Home Screen</b>.') + '</span></li><li><span>' + T('Tap <b>Add</b>. Open Wavelength from your home screen from now on.') + '</span></li></ol><p class="small muted" style="margin-top:12px">' + esc(T('Using Chrome on iPhone? Open thewavelength.co.uk/app in Safari first.')) + '</p>' : '<ol class="ios-steps"><li><span>' + T('Tap the <b>⋮</b> menu in Chrome.') + '</span></li><li><span>' + T('Tap <b>Install app</b> or <b>Add to Home screen</b>.') + '</span></li><li><span>' + esc(T('Open Wavelength from your home screen.')) + '</span></li></ol>') +
      '<div class="btns"><button class="btn block" data-close>' + esc(T('Done')) + '</button></div>');
  }

  // ---------- Router ----------
  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('?')[0];
    var parts = h.split('/');
    return { name: parts[0] || 'home', arg: parts[1] || null, arg2: parts[2] || null, q: new URLSearchParams(location.hash.split('?')[1] || '') };
  }
  // Scrolls a field into view just below the sticky header (and above the sticky Save bar), so nothing the
  // learner still has to fill in sits hidden under either.
  function scrollToField(el, smooth) {
    if (!el) return;
    var top = $('.top'), head = top ? top.getBoundingClientRect().bottom : 0;
    var y = el.getBoundingClientRect().top + window.pageYOffset - Math.max(0, head) - 14;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth && !still ? 'smooth' : 'auto' });
  }
  function go(h) { if (location.hash === '#/' + h) render(); else location.hash = '#/' + h; }
  // A scan form with unsaved changes asks before any navigation (header back, tabs, links, the Android back button).
  // hashchange cannot be cancelled, so the previous address is put back without a render while the learner decides.
  var lastHash = location.hash, leaving = false;
  window.addEventListener('hashchange', function () {
    var dirty = document.querySelector('form[data-dirty]');
    if (dirty && !leaving && location.hash !== lastHash) {
      var target = location.hash;
      history.replaceState(null, '', lastHash || '#/');
      sheet('<h2>' + esc(T('Discard changes?')) + '</h2><p class="muted">' + esc(T('This scan has changes you have not saved.')) + '</p><div class="btns"><button class="btn block" data-close>' + esc(T('Keep editing')) + '</button><button class="btn ghost block danger-text" style="color:var(--red)" data-discard>' + esc(T('Discard changes')) + '</button></div>', function (root) {
        $('[data-discard]', root).onclick = function () { closeSheet(); draftImages = []; delete dirty.dataset.dirty; leaving = true; location.hash = target; };
      });
      return;
    }
    leaving = false; lastHash = location.hash;
    render(); window.scrollTo(0, 0);
  });
  window.addEventListener('online', function () { S.online = true; if (SY.fail === 'offline') SY.fail = ''; setSyncDot(); if (S.account) netKick(); });
  window.addEventListener('offline', function () { S.online = false; setSyncDot(); });
  // In the store apps, returning to the app arrives as wl:resume (below), which also reads the network first.
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (NAT.on) return;
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); pauseRetries(); return; }
    var away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
    resumeSync(away);
  });

  // The sync status pill in the header: icon, short label and chevron; opens the sync details for this device.
  function syncInd() { var st = syncState(); return '<button type="button" class="sync-pill p-' + NETR.pill(st).cls + '" data-syncpill>' + pillInner(st) + '</button>'; }
  // The connection banner under the header. Left out of the scan form (the pill still shows the status), so a change
  // of status never moves the fields while someone is typing, and out of Settings, which shows the full panel.
  function syncBanner() { return ['new', 'edit', 'settings'].indexOf(route().name) >= 0 ? '' : '<div class="sync-banner" data-syncbanner role="status" aria-live="polite" hidden></div>'; }
  function shell(opts, body) {
    var r = route().name;
    var tab = function (name, href, icon, label, dot) { return '<a href="#/' + href + '"' + (r === name || (opts.tab === name) ? ' aria-current="page"' : '') + '>' + icon + '<span>' + esc(label) + '</span>' + (dot ? '<i class="nd" aria-label="' + esc(T('New sign-off')) + '"></i>' : '') + '</a>'; };
    var top = opts.hero ? '' : '<header class="top">' + (opts.back != null ? '<a class="back" href="#/' + opts.back + '" aria-label="' + esc(T('Back')) + '">' + I.back + '</a>' : MARK(34, 'rgba(247,245,240,.5)')) + '<h1>' + esc(opts.title) + '</h1>' + (opts.action || '') + syncInd() + '</header>';
    return top + (opts.hero || '') + '<main class="' + (opts.hero ? 'flush' : '') + '">' + updateBanner() + syncBanner() + body + '</main>' +
      '<nav class="tabs" aria-label="App">' + tab('home', '', I.home, T('Home')) + tab('log', 'log', I.book, T('Logbook'), news().length) + '<a class="plus" href="#/new" aria-label="' + esc(T('Log a scan')) + '">' + I.plus + '<span>' + esc(T('Log')) + '</span></a>' + tab('progress', 'progress', I.chart, T('Progress')) + tab('me', 'me', I.user, T('Me')) + '</nav>';
  }

  var keepScroll = 0;
  function render(soft) {
    var r = route();
    if (soft) keepScroll = window.scrollY;
    if (r.name === 'verify-email') return viewVerifyEmail(r);
    if (!S.account) {
      var authViews = { signup: viewSignup, login: viewLogin, reset: viewReset };
      return (authViews[r.name] || viewWelcome)(r);
    }
    if (!S.account.declarationAt || !(profile().onboarded)) return viewOnboard(r);
    var views = { home: viewHome, log: viewLog, new: viewEdit, edit: viewEdit, entry: viewEntry, progress: viewProgress, me: viewMe, settings: viewSettings, signoff: viewSignoff, export: viewExport, evidence: viewEvidence, backup: viewBackup, targets: viewTargets, declaration: viewDeclaration, assess: viewAssess, supervisors: viewSupervisors, supervise: viewSupervise, professional: viewProfessional, supervisor: viewSupervisorRoute };
    (views[r.name] || viewHome)(r);
    setSyncDot();
    // A new screen fades in once (CSS, 180 ms, none with reduced motion). A redraw of the same screen does not.
    if (!soft) { var mn = $('main', app); if (mn) mn.classList.add('enter'); }
    if (!soft) announce();
    if (soft) window.scrollTo(0, keepScroll);
  }
  // A small live region announces each new screen by its title; the screen itself is not a live region.
  function announce(text) {
    var sr = document.getElementById('sr'); if (!sr) return;
    var h = text || ($('header.top h1') || $('h1', app) || {}).textContent || '';
    sr.textContent = ''; setTimeout(function () { sr.textContent = h; }, 60);
  }
  function mount(html) { app.innerHTML = html; bindUpdate(); $$('[data-install]', app).forEach(function (b) { b.addEventListener('click', doInstall); }); bindLang(app); }

  // ---------- Auth views ----------
  function authFrame(title, lede, body) {
    app.innerHTML = '<div class="auth"><div class="auth-head"><div class="auth-lang">' + langPicker('lang-a') + '</div><a class="home-link" href="/">' + MARK(64, 'rgba(247,245,240,.6)') + '<div class="wm">WAVELENGTH</div><div class="tag">TUNE IN · GAIN CLARITY</div></a>' + (title ? '<h1>' + esc(title) + '</h1>' : '') + (lede ? '<p>' + esc(lede) + '</p>' : '') + '</div><div class="auth-body"><div class="inner">' + body + '</div></div></div>';
    bindLang(app);
  }
  function viewWelcome() {
    var f = function (icon, t, d) { return '<div class="feature"><span class="fi">' + icon + '</span><div><b>' + esc(t) + '</b><span>' + esc(d) + '</span></div></div>'; };
    authFrame(T('Your ultrasound logbook.'), T('Log every scan, watch your accreditation targets fill up, and get signed off and assessed. Built by consultant ultrasound supervisors.'),
      '<div class="features">' + f(I.globe, T('Pathways from around the world'), T('The verified UK pathways, RCEM, FAMUS and FUSIC, plus editable trackers for international pathways and frameworks. One scan can count towards several trackers when it meets their criteria.')) + f(I.camera, T('Photos and clips stay on your phone'), T('Crop and cover identifiers before you save. If you share images with a supervisor, they are encrypted on your phone first and Wavelength never receives the key.')) + f(I.pen, T('Sign-off and assessments in seconds'), T('Your supervisor signs on your phone, from a link or from their own dashboard, with a code anyone can verify.')) + f(I.file, T('Your portfolio, tailored to your accrediting body'), T('Choose your accrediting body and Wavelength arranges your scans, assessments and sign-offs to match that body\'s portfolio requirements, ready to submit. Export as PDF, Excel or CSV with a QR-verified summary.')) + '</div>' +
      '<a class="btn teal block" href="#/signup">' + esc(T('Create your free account')) + '</a><div class="btns" style="justify-content:center"><a class="link" href="#/login">' + esc(T('I already have an account')) + '</a></div>' +
      '<div style="margin-top:22px">' + installButton() + '</div>');
    $$('[data-install]', app).forEach(function (b) { b.addEventListener('click', doInstall); });
  }
  function formData(form) { var o = {}; new FormData(form).forEach(function (v, k) { o[k] = v; }); return o; }
  function busy(btn, on, label) { btn.disabled = on; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || T('Please wait…'); } else btn.textContent = btn.dataset.l || btn.textContent; }
  // ---------- Organisation field: an ARIA combobox over the Wavelength organisation directory ----------
  // Picking a suggestion stores its id beside the text, so everyone at one hospital matches; typing something else
  // clears the id and the text is kept as typed. Before migration 0013 the field is plain text.
  function orgField(id, label, value, orgId, required) {
    return '<div class="field org-field"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" name="organisation" type="text" autocomplete="off"' + (required ? ' required' : '') + ' value="' + esc(value || '') + '" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + '-list"><input type="hidden" name="organisationId" value="' + esc(orgId || '') + '"><ul class="org-list" id="' + id + '-list" role="listbox" hidden></ul><p class="hint" id="' + id + '-hint" hidden></p></div>';
  }
  function bindOrg(root, id) {
    var inp = $('#' + id, root); if (!inp) return;
    var box = inp.closest('.field'), hid = $('input[name=organisationId]', box), list = $('#' + id + '-list', box), hint = $('#' + id + '-hint', box);
    var items = [], active = -1, timer = 0, seq = 0, picked = inp.value;
    var close = function () { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); active = -1; };
    var mark = function (i) {
      active = i; $$('li', list).forEach(function (li, k) { li.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      if (i >= 0) inp.setAttribute('aria-activedescendant', id + '-o' + i); else inp.removeAttribute('aria-activedescendant');
    };
    var pick = function (i) { var o = items[i]; if (!o) return; inp.value = o.name; hid.value = o.id; picked = o.name; close(); hint.hidden = true; inp.dispatchEvent(new Event('change', { bubbles: true })); };
    var draw = function (rs) {
      items = rs; list.innerHTML = rs.map(function (o, i) { return '<li role="option" id="' + id + '-o' + i + '" aria-selected="false" data-i="' + i + '"><b>' + esc(o.name) + '</b>' + (o.matched || o.kindLabel || (o.parent && o.parent.name) ? '<span>' + esc([o.matched ? T('also known as {name}', { name: o.matched }) : '', o.kindLabel ? T(o.kindLabel) : '', o.parent ? o.parent.name : ''].filter(Boolean).join(' · ')) + '</span>' : '') + '</li>'; }).join('');
      list.hidden = !rs.length; inp.setAttribute('aria-expanded', rs.length ? 'true' : 'false'); mark(-1);
      announce(rs.length ? plural(rs.length, 'suggestion') : T('No suggestions. Your text is kept as you typed it.'));
    };
    inp.addEventListener('input', function () {
      if (inp.value !== picked) hid.value = '';
      clearTimeout(timer); var q = inp.value.trim();
      if (q.length < 2 || !navigator.onLine) { close(); return; }
      timer = setTimeout(function () {
        var my = ++seq;
        api('/api/app/organisations?q=' + encodeURIComponent(q)).then(function (res) {
          if (my !== seq) return;
          if (!res.ok || res.available === false) { close(); return; }
          draw(res.results || []);
          if (!(res.results || []).length && q.length >= 4) { hint.textContent = T('Not in the list? Keep what you typed; the Wavelength team adds organisations people use.'); hint.hidden = false; } else hint.hidden = true;
        }).catch(close);
      }, 220);
    });
    inp.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(items.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(0, active - 1)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (li) pick(Number(li.dataset.i)); });
    inp.addEventListener('blur', function () { setTimeout(close, 120); });
  }
  function viewSignup() {
    authFrame(T('Create your account.'), T('Free. Your Academy certificates and your logbook in one place.'),
      '<form id="f" novalidate><div class="err" hidden></div>' +
      '<div class="field"><label for="title">' + esc(T('Title')) + '</label><select id="title" name="title"><option value="">' + esc(T('None')) + '</option><option>Dr</option><option>Prof</option><option>Mr</option><option>Mrs</option><option>Ms</option><option>Miss</option><option>Mx</option></select></div>' +
      '<div class="two"><div class="field"><label for="fn">' + esc(T('First name')) + '</label><input id="fn" name="firstName" type="text" autocomplete="given-name" required></div><div class="field"><label for="ln">' + esc(T('Last name')) + '</label><input id="ln" name="lastName" type="text" autocomplete="family-name" required></div></div>' +
      '<div class="field"><label for="em">' + esc(T('Email')) + '</label><input id="em" name="email" type="email" autocomplete="email" required></div>' +
      pwFields('pw', T('Password'), 'password') +
      '<div class="field"><label for="role">' + esc(T('Role')) + '</label><input id="role" name="role" type="text" placeholder="' + esc(T('For example ST4 emergency medicine, ACP, consultant')) + '" autocomplete="organization-title"></div>' +
      orgField('org', T('Hospital or organisation'), '', '') +
      '<input type="text" name="wl_trap" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<div class="field"><label class="check"><input type="checkbox" name="newsletter" value="1"><span>' + esc(T('Send me the Wavelength newsletter (optional).')) + '</span></label></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="terms" value="1" required><span>' + T('I accept the <a href="/app-terms/" target="_blank" rel="noopener">logbook terms of use</a> and the <a href="/privacy/" target="_blank" rel="noopener">privacy notice</a>.') + '</span></label></div>' +
      '<button class="btn teal block" type="submit">' + esc(T('Create account')) + '</button><div class="btns" style="justify-content:center"><a class="link" href="#/login">' + esc(T('Log in instead')) + '</a></div></form>');
    var f = $('#f'), err = $('.err', f);
    bindOrg(f, 'org');
    bindPw(f, 'pw');
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var d = formData(f); var b = $('button[type=submit]', f);
      var pwBad = pwProblem(f, 'pw');
      if (!f.checkValidity() || pwBad) { err.textContent = !(d.firstName && d.lastName && d.email) ? T('Complete your name and email.') : pwBad || (!d.terms ? T('Tick the box to accept the terms and privacy notice.') : T('Complete your name and email.')); err.hidden = false; return; }
      busy(b, true, T('Creating your account…'));
      api('/api/app/signup', d).then(function (res) {
        if (!res.ok) throw new Error(res.error);
        if (!res.account && !res.checkEmail) throw new Error(T('Something went wrong. Please try again.'));
        if (d.newsletter && !NAT.on) joinNewsletter(d); // the store apps subscribe through the server (worker/app.js signup)
        // This email already has Academy certificates: the account is finished from a link sent to that address.
        if (res.checkEmail) { authFrame(T('Check your email.'), T('We have sent a message to {email}. Open it to finish setting up your account, or to log in if you already have one. Check your junk folder too.', { email: d.email }), '<a class="btn block" href="#/login">' + esc(T('Back to log in')) + '</a>'); return; }
        return saveLangAfter(res.account);
      }).catch(function (ex) { busy(b, false); err.textContent = ex.message || T('Something went wrong. Please try again.'); err.hidden = false; });
    });
  }
  function saveLangAfter(acc) { S.account = acc; if (LANG !== 'en' && (acc.profile || {}).lang !== LANG) return saveProfile({ lang: LANG }).then(function () { return signedIn(S.account); }, function () { return signedIn(acc); }); return signedIn(acc); }
  function joinNewsletter(d) {
    var n = C.newsletter; if (!n || !n.action) return;
    var fr = document.createElement('iframe'); fr.name = 'zc-app'; fr.hidden = true; document.body.appendChild(fr);
    var f = document.createElement('form'); f.method = 'post'; f.action = n.action; f.target = 'zc-app'; f.hidden = true;
    var add = function (k, v) { var i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); };
    Object.keys(n.hidden || {}).forEach(function (k) { add(k, n.hidden[k]); });
    add(n.emailField, d.email); add(n.firstNameField, d.firstName); if (n.roleField) add(n.roleField, d.role || '');
    document.body.appendChild(f); f.submit();
  }
  function viewLogin(r) {
    var pre = r.q.get('email') || new URLSearchParams(location.search).get('login') || '';
    authFrame(T('Welcome back.'), '', authNoteHtml() + '<form id="f" novalidate><div class="err" hidden></div>' +
      '<div class="field"><label for="em">' + esc(T('Email')) + '</label><input id="em" name="email" type="email" autocomplete="email" value="' + esc(pre) + '" required></div>' +
      '<div class="field"><label for="pw">' + esc(T('Password')) + '</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn teal block" type="submit">' + esc(T('Log in')) + '</button><div class="btns" style="justify-content:space-between"><a class="link" href="#/reset">' + esc(T('Forgotten your password?')) + '</a><a class="link" href="#/signup">' + esc(T('Create an account')) + '</a></div><p class="small muted" style="margin-top:14px">' + esc(T('First time in the app after a Wavelength Academy module? Create your account with the same email.')) + '</p></form>');
    var f = $('#f'), err = $('.err', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true; var b = $('button', f); busy(b, true, T('Logging in…'));
      api('/api/app/login', formData(f)).then(function (res) {
        if (!res.ok) { var ex = new Error(res.error); ex.noPassword = res.noPassword; throw ex; }
        return signedIn(res.account);
      }).catch(function (ex) { busy(b, false); err.innerHTML = esc(netFail(ex) ? T('Could not reach Wavelength. Check your connection and try again.') : (ex.message || T('Something went wrong.'))) + (ex.noPassword ? ' <a href="#/signup">' + esc(T('Create your account')) + '</a>' : ''); err.hidden = false; });
    });
  }
  function viewReset() {
    var t = new URLSearchParams(location.search).get('reset');
    if (t) {
      authFrame(T('Choose a new password.'), '', '<form id="f" novalidate><div class="err" hidden></div>' + pwFields('pw', T('New password'), 'password') + '<button class="btn teal block">' + esc(T('Save and log in')) + '</button></form>');
      var f = $('#f'), err = $('.err', f);
      bindPw(f, 'pw');
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var bad = pwProblem(f, 'pw'); if (bad) { err.textContent = bad; err.hidden = false; return; }
        var b = $('button', f); busy(b, true);
        api('/api/app/reset/complete', { token: t, password: $('#pw').value }).then(function (res) {
          if (!res.ok) throw new Error(res.error); history.replaceState(null, '', '/app/#/'); return signedIn(res.account);
        }).catch(function (ex) { busy(b, false); err.textContent = ex.message; err.hidden = false; });
      });
      return;
    }
    authFrame(T('Reset your password.'), T('Enter your email and we will send you a link.'), '<form id="f"><div class="ok" hidden></div><div class="field"><label for="em">' + esc(T('Email')) + '</label><input id="em" name="email" type="email" autocomplete="email" required></div><button class="btn teal block">' + esc(T('Send reset link')) + '</button><div class="btns" style="justify-content:center"><a class="link" href="#/login">' + esc(T('Back to log in')) + '</a></div></form>');
    var f2 = $('#f');
    f2.addEventListener('submit', function (e) {
      e.preventDefault(); var b = $('button', f2); busy(b, true);
      api('/api/app/reset/request', { email: $('#em').value }).then(function (res) {
        busy(b, false); var ok = $('.ok', f2); ok.hidden = false;
        ok.textContent = res.emailOn === false ? T('Password reset by email is not switched on yet. Email hello@thewavelength.co.uk from the address you registered with and we will help.') : T('If that email has an account, a reset link is on its way. Check your junk folder too.');
      });
    });
  }
  // The account is cached on this device so the logbook opens offline (a hospital basement, a flight).
  function cacheAccount(acc) { try { if (acc) localStorage.setItem('wl-acc', JSON.stringify(acc)); else localStorage.removeItem('wl-acc'); } catch (e) { /* storage blocked */ } }
  function cachedAccount() { try { return JSON.parse(localStorage.getItem('wl-acc') || 'null'); } catch (e) { return null; } }
  function signedIn(acc) {
    S.account = acc; cacheAccount(acc);
    var pl = (acc.profile || {}).lang;
    var stored = null; try { stored = localStorage.getItem('wl-lang'); } catch (e) { /* blocked */ }
    if (pl && pl !== LANG && !stored && LOCALES[pl]) { setLang(pl); return Promise.resolve(); }
    return openDb(acc.id).then(function (db) { S.db = db; return Promise.all([all('entries'), all('kv')]); }).then(function (r) {
      S.entries = r[0] || []; S.kv = {}; (r[1] || []).forEach(function (x) { S.kv[x.k] = x.v; });
      S.assessments = S.kv.assessments || [];
      clearTimeout(SY.timer); SY = { lastOk: S.kv.lastSyncOk || 0, fail: '', tries: 0, timer: 0, ran: false };
      var was = authNote(); if (was && was.id === acc.id) authNote(null);
      var next = new URLSearchParams(location.search).get('next');
      if (next && /^\/elearning\//.test(next)) { location.href = next; return; }
      if (location.search) history.replaceState(null, '', '/app/' + location.hash);
      render(); sync(); loadMe(); loadLinks(); acceptPendingInvite();
    });
  }
  // A supervisor invitation link carries a one-time token (#/supervise?invite=...). It is kept for this tab until
  // the person has logged in or created their account, then used once. Accepting with it also confirms the email.
  function acceptPendingInvite() {
    var t = null; try { t = sessionStorage.getItem('wl-invite'); } catch (e) { /* storage blocked */ }
    if (!t) return;
    api('/api/app/supervisors/accept-invite', { token: t }).then(function (res) {
      if (res.ok || res._status === 404) { try { sessionStorage.removeItem('wl-invite'); } catch (e) { /* blocked */ } }
      if (res.ok) { S.account.emailStatus = 'verified'; S.account.emailVerified = true; loadLinks(); if (res.next === 'apply') { toast(T('Your email is confirmed. Next, apply to be a Wavelength supervisor.'), 5000); go('supervisor/apply'); } else { toast(T('Invitation accepted. Your email is confirmed.'), 4000); go('supervise'); } }
      else if (res.error) toast(res.error, 5000);
    }).catch(function () { /* offline: try again next time */ });
  }
  // Logging out, or a login the server no longer accepts, never deletes this device's logbook: it stays in this
  // account's local database and syncs when the same account logs in here again.
  function signedOut(to) { SESSION++; clearTimeout(SY.timer); cacheAccount(null); if (NAT.clearToken) NAT.clearToken(); hideLock(true); S.account = null; S.db = null; S.entries = []; S.me = null; S.assessments = []; S.links = null; location.hash = to || '#/welcome'; render(); }
  // The server says this login has ended (expired, password changed, logged out from another device).
  function authExpired() {
    var acc = S.account; if (!acc) return;
    authNote({ id: acc.id, email: acc.email || '', pending: pendingList().length });
    signedOut('#/login?email=' + encodeURIComponent(acc.email || ''));
  }
  function authNote(v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem('wl-auth') || 'null'); if (v) localStorage.setItem('wl-auth', JSON.stringify(v)); else localStorage.removeItem('wl-auth'); } catch (e) { /* storage blocked */ }
    return null;
  }
  function authNoteHtml() {
    var a = authNote(); if (!a) return '';
    return '<div class="warn" role="status"><p style="margin:0">' + esc(T('Sign in again to continue synchronising. Your local entries are safe.')) + '</p>' + (a.pending ? '<p class="small" style="margin:6px 0 0">' + esc(N(a.pending, '{n} entry is waiting on this device.', '{n} entries are waiting on this device.')) + '</p>' : '') + '</div>';
  }
  function loadMe() { var t0 = Date.now(); return api('/api/app/me', undefined, { timeout: 15000 }).then(function (res) { if (!DIAG.me) { diag('me', String(res._status)); diag('meMs', Date.now() - t0); } if (res.ok) { S.me = res; S.account = res.account; cacheAccount(res.account); if (route().name === 'home' || route().name === 'me') render(true); } }).catch(function (ex) { if (!DIAG.me) diag('me', ex && ex.timeout ? 'timeout' : 'offline'); /* offline: the cached account stays */ }); }
  function loadLinks() { return api('/api/app/supervisors').then(function (res) { if (res.ok) { S.links = res; if (['home', 'me', 'supervise', 'supervisors'].indexOf(route().name) >= 0 && !document.querySelector('.sheet-bg')) render(true); } }).catch(function () { /* offline: try again on the next sync */ }); }

  // ---------- Onboarding ----------
  function pathwayPicker(chosen) {
    var groups = {}; C.pathways.forEach(function (p) { var g = p.region || ''; (groups[g] = groups[g] || []).push(p); });
    var order = ['UK', 'Europe', 'Australia and New Zealand', 'Canada', 'United States', ''];
    return order.filter(function (g) { return groups[g]; }).map(function (g) {
      return '<p class="eyebrow" style="margin:16px 2px 8px">' + esc(g ? T(g) : T('Anywhere')) + '</p>' + groups[g].map(function (p) {
        return '<label class="pathcard"><input type="checkbox" name="p" value="' + p.id + '"' + (chosen.indexOf(p.id) >= 0 ? ' checked' : '') + '><div><b>' + esc(pwName(p)) + '</b><span>' + esc(T(p.desc || '')) + '</span></div></label>';
      }).join('');
    }).join('');
  }
  function viewOnboard() {
    if (!profile().onboarded) {
      authFrame(T('Which pathways are you working towards?'), T('Choose one or more. A scan can count towards several pathways when it meets their criteria. Change this any time.'),
        '<form id="f">' + pathwayPicker(profile().pathways || []) +
        '<div class="field" style="margin-top:16px"><label for="grade">' + esc(T('Grade or role (optional)')) + '</label><input id="grade" name="grade" type="text" placeholder="' + esc(T('For example ST4, ACP, consultant')) + '" value="' + esc(profile().grade || S.account.role || '') + '"></div>' +
        '<div class="field"><label class="check"><input type="checkbox" id="supv" value="1"' + (profile().supervisor ? ' checked' : '') + '><span>' + esc(T('I also supervise or assess other clinicians\' scanning.')) + '</span></label></div>' +
        '<div class="err" hidden></div><button class="btn teal block">' + esc(T('Continue')) + '</button></form>');
      var f = $('#f');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var ps = $$('input[name=p]:checked', f).map(function (i) { return i.value; });
        if (!ps.length) { var er = $('.err', f); er.textContent = T('Choose at least one, or General logbook.'); er.hidden = false; return; }
        saveProfile({ pathways: ps, grade: $('#grade').value, onboarded: true, supervisor: $('#supv').checked, lang: LANG }).then(render);
      });
      return;
    }
    authFrame(T('Before you log a scan.'), '', declarationHtml() + '<form id="f" style="margin-top:16px"><label class="check"><input type="checkbox" required id="ag"><span>' + esc(T('I understand and accept responsibility for everything I store in my logbook.')) + '</span></label><div class="btns"><button class="btn teal block" disabled>' + esc(T('Agree and start')) + '</button></div></form>');
    var ag = $('#ag'), b = $('#f button');
    ag.addEventListener('change', function () { b.disabled = !ag.checked; });
    $('#f').addEventListener('submit', function (e) { e.preventDefault(); busy(b, true); api('/api/app/profile', { declaration: true, profile: {} }).then(function (res) { if (res.ok) { S.account = res.account; go(''); render(); } else { busy(b, false); toast(T('Could not save. Check your connection.')); } }); });
  }
  function declarationHtml() {
    return '<div class="decl"><p class="eyebrow">' + esc(T('Your responsibility')) + '</p><p><b>' + esc(T('You are the data controller for what you put in your logbook.')) + '</b> ' + esc(T('Wavelength does not need, and must never receive, patient-identifiable information.')) + '</p><ul>' +
      '<li>' + esc(T('Never type names, dates of birth, NHS or hospital numbers, addresses or other identifiers into any field.')) + '</li>' +
      '<li>' + esc(T('Before you save a photo or clip, crop or cover every identifier on the screen, including names, numbers, dates and the hospital name. The app strips hidden data when it saves.')) + '</li>' +
      '<li>' + esc(T('Photos and clips stay on this device and in backups you choose to make. They are never uploaded to Wavelength, except encrypted copies you choose to share with a supervisor.')) + '</li>' +
      '<li>' + esc(T('Follow your hospital\'s policies on clinical photography, removable media and personal devices. Some need patient consent or do not allow photos of screens. If unsure, log the scan without a photo.')) + '</li>' +
      '<li>' + esc(T('Wavelength accepts no responsibility for identifiable information you store, photograph or share. Anything found must be deleted by you at once.')) + '</li></ul>' +
      '<p class="small muted">' + T('Full details in the <a href="/app-terms/" target="_blank" rel="noopener">logbook terms of use</a>.') + '</p></div>';
  }
  function saveProfile(p, extra) {
    var prof = Object.assign({}, profile(), p);
    return api('/api/app/profile', Object.assign({ profile: prof }, extra || {})).then(function (res) { if (res.ok) S.account = res.account; else throw new Error(res.error || T('Could not save. Check your connection.')); return res; });
  }

  // ---------- Home ----------
  function viewHome() {
    var ents = live(), month = today().slice(0, 7);
    var signed = ents.filter(function (e) { return e.signoff && e.signoff.status === 'confirmed'; }).length;
    var pending = ents.length - signed;
    var name = S.account.firstName;
    var hour = new Date().getHours(), hi = hour < 12 ? T('Good morning, {name}.', { name: name }) : hour < 18 ? T('Good afternoon, {name}.', { name: name }) : T('Good evening, {name}.', { name: name });
    var hero = '<header class="top" style="padding-bottom:4px"><a class="brand-link" href="/">' + MARK(34, 'rgba(247,245,240,.5)') + '<h1 style="font:600 13px var(--sans);letter-spacing:.38em">WAVELENGTH</h1></a>' + syncInd() + '</header>' +
      '<section class="hero"><p class="hi">' + esc(hi) + '</p><p class="sub">' + esc(ents.length ? T('{scans} in your logbook.', { scans: plural(ents.length, 'scan') }) : T('Log your first scan to start tracking your targets.')) + '</p>' +
      // Each count opens the records it counts: the same filters, so the numbers match (homeCounts).
      '<div class="stats">' + homeCounts(ents, month).map(function (c) { return '<a class="stat" href="#/' + c.href + '" aria-label="' + esc(T('{label}: {n}. Show these records.', { label: c.label, n: c.n })) + '"><b>' + c.n + '</b><span>' + esc(c.label) + '</span>' + SI.chev.replace('class="chev flip"', 'class="stat-go flip"') + '</a>'; }).join('') + '</div></section>';
    var quick = '<div class="card" style="margin-top:16px;padding:10px"><div class="quick">' +
      [['new', I.plus, T('Log a scan')], ['signoff', I.pen, T('Sign-off')], ['assess', I.star, T('Assessment')], ['export', I.file, T('Export')]].map(function (q) { return '<a href="#/' + q[0] + '"><span>' + q[1] + '</span>' + esc(q[2]) + '</a>'; }).join('') + '</div></div>';
    var install = canInstall() ? '<div style="margin:0 0 12px">' + installButton() + '</div>' : '';
    var nw = news(), nq = nw.some(function (n) { return n.status === 'query'; });
    var newsCard = nw.length ? '<div class="card" style="border-color:var(--green-line);background:var(--green-bg)"><div class="row"><span style="color:var(--green)">' + I.pen + '</span><div class="grow"><h3>' + esc(T('New sign-off')) + '</h3><p class="small" style="margin:0">' + esc(newsText(nw)) + '</p></div></div><div class="btns"><a class="btn sm" href="#/log' + (nq ? '?s=todo' : '?s=signed') + '">' + esc(T('See scans')) + '</a><button class="btn ghost sm" type="button" id="nwx">' + esc(T('Dismiss')) + '</button></div></div>' : '';
    var sup = newsCard + emailCard() + superviseCard();
    var focus = focusNext(), focusHtml = '';
    if (focus) {
      var fs = focus.s;
      focusHtml = '<h2 class="sec">' + esc(T('Focus next')) + '</h2><div class="card focus"><p class="eyebrow">' + esc(PATHS[focus.pid].label) + '</p><h3>' + esc(T(fs.mod.label)) + '</h3><p class="small" style="margin:2px 0 10px">' + esc(needText(fs)) + '</p>' + (fs.total ? barRow(T('Scans'), fs.counted, fs.total) : '') +
        '<div class="btns"><a class="btn teal sm" href="#/new?type=' + fs.mod.types[0] + '">' + esc(T('Log one')) + '</a><a class="btn ghost sm" href="' + esc(learnLink(fs.mod)) + '">' + esc(T('Learn: Pearls and Academy')) + '</a>' + (fs.gaps.some(function (g) { return g.k === 'assessment'; }) ? '<a class="btn ghost sm" href="#/assess?p=' + focus.pid + '&m=' + fs.mod.id + '">' + esc(T('Request assessment')) + '</a>' : '') + '</div></div>';
    }
    var paths = myPaths().map(function (pid) {
      var ps = pathwayStats(pid);
      var rows = ps.stats.filter(function (s) { return s.total || s.list.length; }).sort(function (a, b) { return b.list.length - a.list.length; }).slice(0, 4);
      if (!rows.length) return '<a class="card" href="#/progress/' + pid + '" style="display:block;text-decoration:none;color:inherit"><h3>' + esc(pwName(ps.pw)) + '</h3><p class="muted small">' + esc(T('No scans yet. Your targets appear here as you log.')) + '</p></a>';
      return '<a class="card" href="#/progress/' + pid + '" style="display:block;text-decoration:none;color:inherit"><div class="row" style="margin-bottom:10px"><h3 class="grow">' + esc(pwName(ps.pw)) + '</h3><span class="small" style="color:var(--link);font-weight:600">' + esc(T('Details')) + '</span></div><div class="mini">' +
        rows.map(function (s) { return s.total ? barRow(T(s.mod.label), s.counted, s.total) : '<div class="bar-row"><div class="lbl"><span>' + esc(T(s.mod.label)) + '</span><b>' + s.list.length + '</b></div></div>'; }).join('') + '</div></a>';
    }).join('');
    var recent = ents.slice().sort(sortEntries).slice(0, 4);
    var course = (C.courses || [])[0];
    mount(shell({ hero: hero }, quick + install + backupNudge() + sup + focusHtml +
      '<h2 class="sec">' + esc(T('Your progress')) + ' <a href="#/progress">' + esc(T('All targets')) + '</a></h2>' + paths +
      '<h2 class="sec">' + esc(T('Recent scans')) + ' <a href="#/log">' + esc(T('Logbook')) + '</a></h2>' + (recent.length ? recent.map(entryRow).join('') : '<div class="card"><p class="muted">' + esc(T('Nothing logged yet.')) + '</p><a class="btn teal" href="#/new">' + esc(T('Log your first scan')) + '</a></div>') +
      academyCard() +
      (course ? '<h2 class="sec">' + esc(T('Next course')) + '</h2><a class="card teal" href="/courses/' + esc(course.slug) + '/" style="display:block;text-decoration:none"><p class="eyebrow" style="color:var(--teal-l)">' + esc(fmt(course.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</p><h3>' + esc(course.title) + '</h3><p class="muted" style="color:#cfe3e6">' + esc([course.venue, course.city].filter(Boolean).join(', ')) + '</p><span class="btn light sm">' + esc(T('See the course')) + '</span></a>' : '')));
    var nx = $('#nwx'); if (nx) nx.onclick = function () { setKv('news', []).then(function () { render(true); }); };
    loadThumbs();
  }
  // The four Home counts and where each opens. Own logbook only (supervised learners' scans are never in S.entries).
  function homeCounts(ents, month) {
    return [
      { n: ents.length, label: T('Scans'), href: 'log' },
      { n: ents.filter(function (e) { return (e.date || '').slice(0, 7) === month; }).length, label: T('This month'), href: 'log?m=' + month },
      { n: ents.filter(function (e) { return stateMatch(e, 'signed'); }).length, label: T('Signed off'), href: 'log?s=signed' },
      { n: signedAssessments().length, label: T('Assessments'), href: 'assess?view=signed' }
    ];
  }
  function superviseCard() {
    var L2 = S.links; if (!L2) return '';
    var inv = (L2.invites || []).length, lrn = (L2.learners || []).length;
    if (!inv && !lrn) return '';
    var pend = (L2.learners || []).reduce(function (a, x) { return a + (x.pending || 0); }, 0);
    return '<a class="card dark" href="#/supervise" style="display:block;text-decoration:none"><div class="row"><span style="color:var(--teal-l)">' + I.team + '</span><div class="grow"><h3>' + esc(T('Supervising')) + '</h3><p class="muted small" style="margin:0">' + esc([lrn ? plural(lrn, 'learner') : '', inv ? plural(inv, 'new invitation') : '', pend ? plural(pend, 'request waiting', 'requests waiting') : ''].filter(Boolean).join(' · ')) + '</p></div></div></a>';
  }
  function academyCard() {
    if (!S.me) return '';
    var certs = S.me.certificates || [], mods = S.me.modules || [];
    var hours = certs.reduce(function (s, c) { return s + Number(c.cpd_hours || 0); }, 0);
    return '<h2 class="sec">' + esc(T('Wavelength Academy')) + ' <a href="/elearning/">' + esc(T('All modules')) + '</a></h2><div class="card dark"><div class="row"><span style="color:var(--teal-l)">' + I.cert + '</span><div class="grow"><h3>' + esc(plural(certs.length, 'certificate') + ' · ' + plural(hours, 'CPD hour')) + '</h3><p class="muted small" style="margin:0">' + esc(T('{n} of {m} modules passed. Every certificate carries a code anyone can verify.', { n: certs.length, m: mods.length })) + '</p></div></div>' +
      (certs.length ? '<div style="margin-top:12px;display:grid;gap:6px">' + certs.slice(0, 3).map(function (c) { return '<a href="/elearning/certificate/' + esc(c.code) + '/" style="color:var(--cream);text-decoration:none;display:flex;justify-content:space-between;gap:10px;font-size:14px;border-top:1px solid rgba(247,245,240,.1);padding-top:8px"><span>' + esc(c.module_title) + '</span><span style="color:var(--teal-l)">' + esc(T('View')) + '</span></a>'; }).join('') + '</div>' : '') +
      '<div class="btns"><a class="btn light sm" href="/elearning/">' + esc(certs.length ? T('Continue learning') : T('Start a free module')) + '</a></div></div>';
  }
  // Home: a calm reminder (not a warning) while photos or clips exist and no backup file was made in 14 days.
  function backupNudge() {
    var withImg = live().filter(function (e) { return (e.images || []).length; }).length;
    if (!withImg) return '';
    var last = S.kv.lastBackup, days = last ? daysBetween(last.slice(0, 10), today()) : null;
    if (last && days < 14) return '';
    return '<div class="card"><div class="row"><span class="muted">' + I.cloud + '</span><div class="grow"><h3>' + esc(T('Photos and clips are only on this phone')) + '</h3><p class="small muted" style="margin:0">' + esc((last ? T('Last backup file created {days} ago.', { days: plural(days, 'day') }) : T('No backup file has been created on this device yet.')) + ' ' + T('An encrypted backup keeps a copy wherever you choose.')) + '</p></div></div><div class="btns"><a class="btn sm ghost" href="#/backup">' + esc(T('Back up')) + '</a></div></div>';
  }

  // ---------- Logbook list ----------
  function sortEntries(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0); }
  function summary(e) {
    var t = TYPES[e.type]; if (!t) return '';
    var f = e.findings || {};
    var bits = t.fields.filter(function (fd) { var v = f[fd.id]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); }).slice(0, 3).map(function (fd) { var v = f[fd.id]; return T(fd.label) + ': ' + val(v) + (fd.unit ? ' ' + fd.unit : ''); });
    return (e.overall ? T(e.overall) + '. ' : '') + bits.join('; ');
  }
  function ratingDots(r) { if (!r) return ''; return '<span class="tl-dots" title="' + esc(T('Supervisor rating')) + '">' + ['image', 'accuracy'].map(function (k) { return r[k] ? '<i class="tl-' + r[k] + '"></i>' : ''; }).join('') + '</span>'; }
  function statusChip(e) {
    var st = STATES[signState(e)];
    return st[1] ? '<span class="chip ' + st[0] + '">' + esc(T(st[1])) + (st[0] === 'green' ? ratingDots(e.signoff.rating) : '') + '</span>' : '';
  }
  var SUP = {}; C.supervision.forEach(function (s) { SUP[s.id] = s.label; });
  function supLabel(id) { return SUP[id] ? T(SUP[id]) : ''; }
  function entryRow(e) {
    var t = TYPES[e.type] || { label: e.type, short: e.type };
    var clips = (e.images || []).filter(function (x) { return x.kind === 'clip'; }).length;
    var col = STATES[signState(e)][0], isNew = news().some(function (n) { return n.id === e.id; });
    return '<a class="entry' + (col ? ' s-' + col : '') + '" href="#/entry/' + esc(e.id) + '"><span class="thumb" data-thumb="' + esc(e.id) + '">' + esc(T(t.short)) + '</span><div class="grow"><h3>' + esc(T(t.label)) + '</h3><p>' + esc(fmt(e.date)) + (e.setting ? ' · ' + esc(T(e.setting)) : '') + '</p><div class="meta">' + (isNew ? '<span class="chip teal">' + esc(T('New')) + '</span>' : '') + statusChip(e) + (e.supervision === 'direct' ? '<span class="chip teal">' + esc(T('Supervised')) + '</span>' : '') + (clips ? '<span class="chip">' + I.video.replace(/22/g, '14') + ' ' + clips + '</span>' : '') + (e._dirty ? '<span class="chip' + (e._syncError ? ' red' : '') + '">' + esc(T('Not synced')) + '</span>' : '') + '</div></div></a>';
  }
  function loadThumbs() {
    $$('[data-thumb]').forEach(function (el) {
      var e = S.entries.find(function (x) { return x.id === el.dataset.thumb; });
      if (!e || !(e.images || []).length) return;
      getOne('images', e.images[0].id).then(function (rec) { if (rec) el.innerHTML = '<img alt="" src="' + imgUrl(rec, true) + '">' + (isClip(rec) ? '<span class="play">▶</span>' : ''); });
    });
  }
  function viewLog(r) {
    var f = r.q.get('type') || 'all', q = (r.q.get('q') || '').toLowerCase(), st = r.q.get('s') || '';
    var m = /^\d{4}-\d{2}$/.test(r.q.get('m') || '') ? r.q.get('m') : '';
    // A month (from Home's "This month") narrows everything on the page, counts included, by the scan's date.
    var ents = live().filter(function (e) { return !m || (e.date || '').slice(0, 7) === m; }).sort(sortEntries);
    var used = {}; ents.forEach(function (e) { used[e.type] = (used[e.type] || 0) + 1; });
    var list = ents.filter(function (e) {
      if (f !== 'all' && e.type !== f) return false;
      if (!stateMatch(e, st)) return false;
      if (q && JSON.stringify(e).toLowerCase().indexOf(q) < 0 && T((TYPES[e.type] || {}).label || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var groups = {}; list.forEach(function (e) { var m = e.date.slice(0, 7); (groups[m] = groups[m] || []).push(e); });
    var filt = function (k, label, n) { return '<button type="button" data-f="' + k + '" aria-pressed="' + (f === k) + '">' + esc(label) + (n != null ? ' · ' + n : '') + '</button>'; };
    mount(shell({ title: T('Logbook'), action: '<a class="act" href="#/signoff" style="text-decoration:none">' + esc(T('Sign-off')) + '</a>' },
      '<div class="search"><input type="search" id="q" placeholder="' + esc(T('Search your logbook')) + '" value="' + esc(q) + '" aria-label="' + esc(T('Search')) + '"><a class="btn ghost sm" href="#/export" style="flex:none">' + esc(T('Export')) + '</a></div>' +
      activeFilters(m, f, st, q) +
      '<div class="filters">' + filt('all', T('All'), ents.length) + Object.keys(used).map(function (t) { return filt(t, T((TYPES[t] || {}).short || t), used[t]); }).join('') + '</div>' +
      '<div class="seg" style="margin:0 0 6px">' + [['', T('All')], ['todo', T('Not sent')], ['waiting', T('Awaiting')], ['signed', T('Signed off')], ['none', T('No sign-off')]].map(function (o) { var n = o[0] ? ents.filter(function (e) { return stateMatch(e, o[0]); }).length : ents.length; return (o[0] === 'none' && !n && st !== 'none') ? '' : '<input type="radio" name="st" id="st' + o[0] + '" value="' + o[0] + '"' + (st === o[0] ? ' checked' : '') + '><label for="st' + o[0] + '">' + esc(o[1]) + ' · ' + n + '</label>'; }).join('') + '</div>' +
      (list.length ? Object.keys(groups).map(function (m) { return '<p class="month">' + esc(fmt(m + '-15', { month: 'long', year: 'numeric' })) + ' · ' + groups[m].length + '</p>' + groups[m].map(entryRow).join(''); }).join('') :
        '<div class="empty">' + I.book.replace('width="24" height="24"', 'width="48" height="48"') + '<p>' + esc(m && !ents.length ? T('No scans logged in {month}.', { month: fmt(m + '-15', { month: 'long', year: 'numeric' }) }) : ents.length ? T('No scans match.') : T('Your logbook is empty.')) + '</p>' + (m || f !== 'all' || st || q ? '<a class="btn ghost" href="#/log">' + esc(T('Clear filters')) + '</a> ' : '') + '<a class="btn teal" href="#/new">' + esc(T('Log a scan')) + '</a></div>')));
    var upd = function (k, v) { var p = route().q; if (v) p.set(k, v); else p.delete(k); history.replaceState(null, '', '#/log?' + p.toString()); viewLog(route()); };
    $$('[data-f]').forEach(function (b) { b.addEventListener('click', function () { upd('type', b.dataset.f === 'all' ? '' : b.dataset.f); }); });
    $$('input[name=st]').forEach(function (i) { i.addEventListener('change', function () { upd('s', i.value); }); });
    if (news().length) setKv('news', []).then(function () { var d = $('.tabs .nd'); if (d) d.remove(); });
    var qi = $('#q'), tmr; qi.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { upd('q', qi.value); var n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); });
    loadThumbs();
  }

  // The filters in force, in words, with one way to clear them all.
  function activeFilters(m, f, st, q) {
    var bits = [];
    if (m) bits.push(fmt(m + '-15', { month: 'long', year: 'numeric' }));
    if (f !== 'all') bits.push(T((TYPES[f] || {}).short || f));
    var stl = { todo: 'Not sent', waiting: 'Awaiting', signed: 'Signed off', none: 'No sign-off', unsigned: 'Not signed off' }[st]; if (stl) bits.push(T(stl));
    if (q) bits.push('“' + q + '”');
    if (!bits.length) return '';
    return '<div class="active-f" role="status"><span class="muted small">' + esc(T('Showing')) + '</span>' + bits.map(function (b) { return '<span class="chip teal">' + esc(b) + '</span>'; }).join('') + '<a class="link small" href="#/log">' + esc(bits.length > 1 ? T('Clear filters') : T('Clear filter')) + '</a></div>';
  }

  // ---------- Entry form ----------
  var GUARD = [
    [/\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/, 'a 10-digit number (NHS number?)'],
    [/\b\d{1,2}[\/.]\d{1,2}[\/.](19|20)\d{2}\b/, 'a date (date of birth?)'],
    [/\b[A-Z]{1,4}\d{5,9}\b/i, 'a hospital number'],
    [/\b(Mr|Mrs|Ms|Miss|Master)\.?\s+[A-Z][a-z]+/, 'a patient name'],
    [/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/, 'a postcode'],
    [/(\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b|(\+44\s?|\b0)(1|2)\d{2,3}\s?\d{3}\s?\d{3,4}\b/, 'a phone number'],
    [/\b\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(19|20)\d{2}\b/i, 'a date (date of birth?)'],
    [/\b(DOB|D\.O\.B\.?|date of birth|born on)\b/i, 'a date of birth']
  ];
  function guard(e) {
    var texts = [e.indication, e.interpretation, e.impact, e.reflection, e.supervisor].concat(Object.keys(e.findings || {}).map(function (k) { return typeof e.findings[k] === 'string' ? e.findings[k] : ''; }));
    var hits = [];
    texts.forEach(function (t) { GUARD.forEach(function (g) { if (t && g[0].test(t) && hits.indexOf(g[1]) < 0) hits.push(g[1]); }); });
    return hits.map(function (h) { return T(h); });
  }
  function seg(name, opts, v, cls) {
    return '<div class="seg ' + (cls || '') + '">' + opts.map(function (o, i) {
      var id2 = typeof o === 'string' ? o : o.id, l = typeof o === 'string' ? o : o.label, id = name.replace(/\W/g, '') + i;
      return '<input type="radio" name="' + name + '" id="' + id + '" value="' + esc(id2) + '"' + (v === id2 ? ' checked' : '') + '><label for="' + id + '">' + esc(T(l)) + '</label>';
    }).join('') + '</div>';
  }
  function fieldHtml(fd, v) {
    var n = 'f.' + fd.id, id = 'f_' + fd.id;
    if (fd.type === 'choice') return '<div class="field"><span class="lab">' + esc(T(fd.label)) + '</span>' + seg(n, fd.options, v) + '</div>';
    if (fd.type === 'multi') return '<div class="field"><span class="lab">' + esc(T(fd.label)) + '</span><div class="seg">' + fd.options.map(function (o, i) { return '<input type="checkbox" name="' + n + '" id="' + id + i + '" value="' + esc(o) + '"' + ((v || []).indexOf(o) >= 0 ? ' checked' : '') + '><label for="' + id + i + '">' + esc(T(o)) + '</label>'; }).join('') + '</div></div>';
    if (fd.type === 'number') return '<div class="field"><label for="' + id + '">' + esc(T(fd.label)) + (fd.unit ? ' (' + fd.unit + ')' : '') + '</label><input id="' + id + '" name="' + n + '" type="number" inputmode="decimal" step="any" value="' + esc(v == null ? '' : v) + '"></div>';
    return '<div class="field"><label for="' + id + '">' + esc(T(fd.label)) + '</label><input id="' + id + '" name="' + n + '" type="text" value="' + esc(v || '') + '"></div>';
  }
  function modulesForType(type) {
    var out = [];
    myPaths().forEach(function (pid) { PATHS[pid].modules.forEach(function (m) { if (m.types.indexOf(type) >= 0) out.push({ id: m.id, label: PATHS[pid].label + ' ' + T(m.label) }); }); });
    return out;
  }
  // Required scan fields: is this one filled in?
  function fieldOk(form, k) {
    if (k === 'type' || k === 'supervision') return !!form.querySelector('input[name=' + k + ']:checked');
    if (k === 'date') { var v = (form.querySelector('#date') || {}).value; return !!v && v <= today(); }
    return true;
  }
  // Marks a field as missing (msg) or clears it (''): red border, a short line of help tied to the controls.
  function markField(fl, msg) {
    if (!fl) return;
    var id = 'err-' + fl.dataset.req, p = $('#' + id, fl);
    fl.classList.toggle('invalid', !!msg);
    $$('input,select,textarea', fl).forEach(function (c) { if (msg) { c.setAttribute('aria-invalid', 'true'); c.setAttribute('aria-describedby', id); } else { c.removeAttribute('aria-invalid'); c.removeAttribute('aria-describedby'); } });
    if (!msg) { if (p) p.remove(); ['tabindex', 'role', 'aria-describedby', 'aria-labelledby'].forEach(function (a) { fl.removeAttribute(a); }); return; }
    if (!p) { p = document.createElement('p'); p.className = 'ferr'; p.id = id; fl.appendChild(p); }
    p.innerHTML = '<span aria-hidden="true">' + SI.alert + '</span>' + esc(msg);
    // The field itself takes focus (not a control), so no keyboard or picker opens, and screen readers read the help.
    fl.setAttribute('tabindex', '-1'); fl.setAttribute('role', 'group'); fl.setAttribute('aria-describedby', id);
    var lab = $('.lab,label', fl); if (lab) { if (!lab.id) lab.id = 'lab-' + fl.dataset.req; fl.setAttribute('aria-labelledby', lab.id); }
  }
  // The note after saving a scan: what is true now, then (after the sync that follows) whether the server has it.
  function savedNote(id, isNew) {
    var t = document.createElement('div'); t.className = 'toast act'; t.setAttribute('role', 'status');
    var words = function () {
      var e = S.entries.find(function (x) { return x.id === id; });
      if (e && !e._dirty) return isNew ? T('Scan saved and synced.') : T('Changes saved and synced.');
      var off = !NETR.deviceOnline(deviceNet()) || ['offline', 'unreachable', 'timeout'].indexOf(SY.fail) >= 0;
      return off ? T('Saved on this device. Awaiting sync.') : isNew ? T('Scan saved.') : T('Changes saved.');
    };
    t.innerHTML = '<span data-msg></span>' + (isNew ? '<a href="#/entry/' + esc(id) + '">' + esc(T('View scan')) + '</a><a href="#/new?copy=' + esc(id) + '">' + esc(T('Same patient')) + '</a>' : '');
    $('[data-msg]', t).textContent = words();
    $$('a', t).forEach(function (a) { a.addEventListener('click', function () { t.remove(); }); });
    $$('.toast.act').forEach(function (x) { x.remove(); });
    document.body.appendChild(t);
    var timer = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, 6000);
    return { update: function () { if (!document.body.contains(t)) return; var w = words(); if (w !== $('[data-msg]', t).textContent) { $('[data-msg]', t).textContent = w; clearTimeout(timer); timer = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, 4000); } } };
  }
  var draftImages = []; // images and clips added in the form but not yet saved: { id, blob, thumb, w, h, kind }
  function viewEdit(r) {
    var editing = r.name === 'edit' ? S.entries.find(function (x) { return x.id === r.arg; }) : null;
    var copyFrom = r.q.get('copy') ? S.entries.find(function (x) { return x.id === r.q.get('copy'); }) : null;
    var e = editing ? JSON.parse(JSON.stringify(strip(editing))) : { date: today(), supervision: '', setting: (copyFrom || {}).setting || S.kv.lastSetting || '', age: (copyFrom || {}).age || '', sex: (copyFrom || {}).sex || '', type: r.q.get('type') || '' };
    if (copyFrom) { e.date = copyFrom.date; e.indication = copyFrom.indication; e.supervisor = copyFrom.supervisor; e.supervision = copyFrom.supervision; e.noSignoff = copyFrom.noSignoff; e.patient = copyFrom.patient || copyFrom.id; }
    if (!editing) draftImages = [];
    var mine = {}; myPaths().forEach(function (pid) { PATHS[pid].modules.forEach(function (m) { m.types.forEach(function (t) { mine[t] = 1; }); }); });
    var ordered = C.types.slice().sort(function (a, b) { return (mine[b.id] || 0) - (mine[a.id] || 0); });
    var supNames = []; live().forEach(function (x) { if (x.supervisor && supNames.indexOf(x.supervisor) < 0) supNames.push(x.supervisor); });
    var body = '<form id="ef" novalidate>' +
      (copyFrom ? '<div class="ok">' + esc(T('Same patient as your {type} scan. Choose the next application.', { type: T((TYPES[copyFrom.type] || {}).label || '') })) + '</div>' : '') +
      '<div class="field" data-req="type"><span class="lab" id="lab-type">' + esc(T('Application')) + '</span><div class="seg types">' + ordered.map(function (t, i) { return '<input type="radio" name="type" id="t' + i + '" value="' + t.id + '"' + (e.type === t.id ? ' checked' : '') + '><label for="t' + i + '">' + esc(T(t.label)) + '</label>'; }).join('') + '</div></div>' +
      '<div id="rest"' + (e.type ? '' : ' hidden') + '>' +
      '<p class="type-ok" id="typeok" aria-live="polite"></p>' +
      '<div class="two"><div class="field" data-req="date"><label for="date">' + esc(T('Date')) + '</label><input id="date" name="date" type="date" max="' + today() + '" value="' + esc(e.date) + '" required></div>' +
      '<div class="field"><label for="setting">' + esc(T('Setting')) + '</label><select id="setting" name="setting"><option value="">' + esc(T('Choose')) + '</option>' + C.settings.map(function (s) { return '<option value="' + esc(s) + '"' + (e.setting === s ? ' selected' : '') + '>' + esc(T(s)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="two"><div class="field"><label for="age">' + esc(T('Age band')) + '</label><select id="age" name="age"><option value="">' + esc(T('Not recorded')) + '</option>' + C.ageBands.map(function (s) { return '<option value="' + esc(s) + '"' + (e.age === s ? ' selected' : '') + '>' + esc(T(s)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="sex">' + esc(T('Sex')) + '</label><select id="sex" name="sex"><option value="">' + esc(T('Not recorded')) + '</option>' + ['Female', 'Male'].map(function (s) { return '<option value="' + s + '"' + (e.sex === s ? ' selected' : '') + '>' + esc(T(s)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="ind">' + esc(T('Indication')) + '</label><input id="ind" name="indication" type="text" placeholder="' + esc(T('Clinical question, no identifiers')) + '" value="' + esc(e.indication || '') + '"></div>' +
      '<div id="findings" class="card" style="padding:16px 14px 2px"></div>' +
      '<div class="field"><span class="lab">' + esc(T('Overall')) + '</span>' + seg('overall', ['Normal', 'Abnormal', 'Indeterminate'], e.overall) + '</div>' +
      '<div class="field"><span class="lab">' + esc(T('Image quality (your rating)')) + '</span>' + seg('quality', ['Good', 'Adequate', 'Limited', 'Inadequate'], e.quality, 'q4') + '</div>' +
      '<div class="field"><label for="interp">' + esc(T('Your interpretation')) + '</label><textarea id="interp" name="interpretation" placeholder="' + esc(T('What you saw and what it means')) + '">' + esc(e.interpretation || '') + '</textarea></div>' +
      '<div class="two"><div class="field"><label for="conf">' + esc(T('Confirmed by')) + '</label><select id="conf" name="confirmation"><option value="">' + esc(T('Not yet')) + '</option>' + C.confirmation.map(function (s) { return '<option value="' + esc(s) + '"' + (e.confirmation === s ? ' selected' : '') + '>' + esc(T(s)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="conc">' + esc(T('Agreement')) + '</label><select id="conc" name="concordant"><option value="">' + esc(T('Not applicable')) + '</option>' + ['Agreed', 'Partly agreed', 'Disagreed'].map(function (s) { return '<option value="' + s + '"' + (e.concordant === s ? ' selected' : '') + '>' + esc(T(s)) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="impact">' + esc(T('Impact on management')) + '</label><input id="impact" name="impact" type="text" placeholder="' + esc(T('For example, changed fluid plan, avoided CT')) + '" value="' + esc(e.impact || '') + '"></div>' +
      '<div class="field" data-req="supervision"><span class="lab" id="lab-supervision">' + esc(T('Supervision')) + '</span>' + seg('supervision', C.supervision, e.supervision) + '</div>' +
      '<div class="field"><label for="supv">' + esc(T('Supervisor or mentor')) + '</label><input id="supv" name="supervisor" type="text" list="supl" placeholder="' + esc(T('Name')) + '" value="' + esc(e.supervisor || '') + '"><datalist id="supl">' + supNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="noSignoff" value="1"' + (e.noSignoff ? ' checked' : '') + '><span>' + esc(T('No sign-off needed for this scan')) + '</span></label></div>' +
      '<div class="field"><span class="lab">' + esc(T('Images and clips')) + '</span><p class="hint">' + esc(T('Stay on this phone only. Crop and cover identifiers before you save. Clips up to 10 seconds, without sound.')) + '</p><div class="gallery" id="gal"></div>' +
      '<input type="file" accept="image/*" capture="environment" id="cam" hidden><input type="file" accept="image/*" id="pick" hidden multiple><input type="file" accept="video/*" capture="environment" id="vcam" hidden><input type="file" accept="video/*" id="vpick" hidden></div>' +
      '<div class="field"><label for="refl">' + esc(T('Reflection')) + '</label><p class="hint">' + esc(T('What you learned and what you will do differently. Counts as a reflective note.')) + '</p><textarea id="refl" name="reflection">' + esc(e.reflection || '') + '</textarea></div>' +
      '<div id="counts"></div>' +
      '<div class="err" hidden></div><div class="btns" style="position:sticky;bottom:calc(var(--tab) + var(--safe-b) + 8px)"><button class="btn teal block" type="submit">' + esc(editing ? T('Save changes') : T('Save scan')) + '</button></div>' +
      '</div></form>';
    mount(shell({ title: editing ? T('Edit scan') : copyFrom ? T('Another scan') : T('Log a scan'), back: editing ? 'entry/' + editing.id : '', tab: 'new' }, body));
    var form = $('#ef');
    var drawFindings = function () {
      var t = TYPES[(form.querySelector('input[name=type]:checked') || {}).value];
      $('#rest').hidden = !t;
      if (!t) return;
      $('#typeok').innerHTML = '<span class="ok-ic" aria-hidden="true">' + SI.check + '</span><span>' + esc(T('{type} selected', { type: T(t.label) })) + '</span><button type="button" class="link small" data-chgtype>' + esc(T('Change')) + '</button>';
      $('[data-chgtype]', form).onclick = function () { var c = form.querySelector('input[name=type]:checked') || form.querySelector('input[name=type]'); scrollToField(c.closest('.field'), true); c.focus({ preventScroll: true }); };
      var cur = readFindings();
      $('#findings').innerHTML = '<p class="eyebrow">' + esc(T('{type} findings', { type: T(t.label) })) + '</p>' + t.fields.map(function (fd) { return fieldHtml(fd, cur[fd.id] != null ? cur[fd.id] : (e.type === t.id ? (e.findings || {})[fd.id] : null)); }).join('');
      var mods = modulesForType(t.id), ex = e.exclude || [];
      $('#counts').innerHTML = mods.length ? '<div class="field"><span class="lab">' + esc(T('Counts towards')) + '</span><p class="hint">' + esc(T('Untick any target this scan should not count towards.')) + '</p><div class="seg">' + mods.map(function (m, i) { return '<input type="checkbox" name="count" id="cm' + i + '" value="' + m.id + '"' + (ex.indexOf(m.id) < 0 ? ' checked' : '') + '><label for="cm' + i + '">' + esc(m.label) + '</label>'; }).join('') + '</div></div>' : '';
    };
    var readFindings = function () {
      var out = {}, fd = new FormData(form);
      fd.forEach(function (v, k) { if (k.indexOf('f.') !== 0) return; var id = k.slice(2); var t = TYPES[(form.querySelector('input[name=type]:checked') || {}).value]; var def = t && t.fields.find(function (x) { return x.id === id; }); if (def && def.type === 'multi') (out[id] = out[id] || []).push(v); else if (v !== '') out[id] = def && def.type === 'number' ? Number(v) : v; });
      return out;
    };
    // After the application, the next thing to fill in is the date: bring the Date and Setting row up just below the
    // header and mark it briefly. Nothing is focused, so no keyboard or date picker opens by itself.
    var toDate = function () {
      // The confirmation line sits just above the date row: both end up in view below the header.
      var row = $('#date').closest('.two'); scrollToField($('#typeok') && $('#typeok').textContent ? $('#typeok') : row, true);
      row.classList.remove('next-up'); void row.offsetWidth; row.classList.add('next-up');
      setTimeout(function () { row.classList.remove('next-up'); }, 1600);
    };
    $$('input[name=type]', form).forEach(function (i) { i.addEventListener('change', function () { drawFindings(); form.dataset.dirty = '1'; setTimeout(toDate, 60); }); });
    form.addEventListener('input', function () { form.dataset.dirty = '1'; });
    // A required field marked as missing clears as soon as it is filled in.
    var clearInvalid = function (ev) { var fl = ev.target.closest && ev.target.closest('.field.invalid'); if (fl && fieldOk(form, fl.dataset.req)) markField(fl, ''); };
    form.addEventListener('change', clearInvalid); form.addEventListener('input', clearInvalid);
    drawFindings();
    // "Log one" from a pathway (#/new?type=...): the application is already chosen, so go straight on to the date,
    // after the screen has settled at the top (the router scrolls to the top after drawing).
    if (!editing && !copyFrom && e.type && TYPES[e.type]) {
      setTimeout(function () { if (document.body.contains(form)) { toDate(); announce(T('{type} selected. Next: the date of the scan.', { type: T(TYPES[e.type].label) })); } }, 80);
    }
    // Images and clips
    var existing = editing ? (editing.images || []).slice() : [];
    var removed = [];
    var count = function () { return existing.length - removed.length + draftImages.length; };
    var drawGallery = function () {
      var g = $('#gal');
      var items = existing.filter(function (x) { return removed.indexOf(x.id) < 0; }).map(function (x) { return '<button type="button" data-old="' + x.id + '"><img alt="' + esc(T('Scan image')) + '" data-img="' + x.id + '">' + (x.kind === 'clip' ? '<span class="play">▶</span>' : '') + '<span class="x" data-rm="' + x.id + '" aria-label="' + esc(T('Remove')) + '">×</span></button>'; })
        .concat(draftImages.map(function (x) { return '<button type="button"><img alt="' + esc(T('Scan image')) + '" src="' + URL.createObjectURL(x.thumb) + '">' + (x.kind === 'clip' ? '<span class="play">▶</span>' : '') + '<span class="x" data-rmd="' + x.id + '" aria-label="' + esc(T('Remove')) + '">×</span></button>'; }));
      g.innerHTML = items.join('') + '<button type="button" class="add" id="addcam">' + I.camera + esc(T('Take photo')) + '</button><button type="button" class="add" id="addpick">' + I.file + esc(T('Choose')) + '</button><button type="button" class="add" id="addclip">' + I.video + esc(T('Clip')) + '</button>';
      $$('[data-img]', g).forEach(function (im) { getOne('images', im.dataset.img).then(function (rec) { if (rec) im.src = imgUrl(rec, true); }); });
      $('#addcam').onclick = function () { $('#cam').click(); };
      $('#addpick').onclick = function () { $('#pick').click(); };
      $('#addclip').onclick = function () {
        if (!clipSupported()) { toast(T('This phone cannot prepare clips. Save a still image instead.'), 4000); return; }
        sheet('<h2>' + esc(T('Add a clip')) + '</h2><p class="muted small">' + esc(T('Record the ultrasound screen for up to 10 seconds, or choose a clip from your phone. You then crop it and cover any identifiers. Sound is removed.')) + '</p><div class="btns"><button class="btn teal block" data-v="vcam">' + esc(T('Record a clip')) + '</button><button class="btn ghost block" data-v="vpick">' + esc(T('Choose a clip')) + '</button></div>', function (root) { $$('[data-v]', root).forEach(function (b) { b.onclick = function () { closeSheet(); $('#' + b.dataset.v).click(); }; }); });
      };
      $$('[data-rm]', g).forEach(function (x) { x.onclick = function (ev) { ev.stopPropagation(); removed.push(x.dataset.rm); form.dataset.dirty = '1'; drawGallery(); }; });
      $$('[data-rmd]', g).forEach(function (x) { x.onclick = function (ev) { ev.stopPropagation(); draftImages = draftImages.filter(function (d) { return d.id !== x.dataset.rmd; }); drawGallery(); }; });
    };
    drawGallery();
    var onFiles = function (inp, clip) {
      var files = Array.prototype.slice.call(inp.files || []); inp.value = '';
      var nextFile = function () {
        var f = files.shift(); if (!f) return;
        if (count() >= 12) { toast(T('Up to 12 images or clips per scan.')); return; }
        (clip ? editClip(f) : editImage(f)).then(function (res) { if (res) { res.id = uid(); draftImages.push(res); form.dataset.dirty = '1'; drawGallery(); } nextFile(); });
      };
      nextFile();
    };
    $('#cam').addEventListener('change', function () { onFiles(this); });
    $('#pick').addEventListener('change', function () { onFiles(this); });
    $('#vcam').addEventListener('change', function () { onFiles(this, true); });
    $('#vpick').addEventListener('change', function () { onFiles(this, true); });
    // Save
    var saving = false;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (saving) return; // a second tap while the first save is still running
      var err = $('.err', form); err.hidden = true;
      var d = formData(form);
      var out = editing ? Object.assign({}, strip(editing)) : { id: uid(), createdAt: Date.now() };
      ['type', 'date', 'setting', 'age', 'sex', 'indication', 'overall', 'quality', 'interpretation', 'confirmation', 'concordant', 'impact', 'supervision', 'supervisor', 'reflection'].forEach(function (k) { out[k] = (d[k] || '').trim ? (d[k] || '').trim() : d[k]; });
      out.findings = readFindings();
      out.noSignoff = !!$('input[name=noSignoff]', form).checked; if (!out.noSignoff) delete out.noSignoff;
      if (copyFrom) out.patient = e.patient;
      var mods = modulesForType(out.type).map(function (m) { return m.id; });
      var ticked = $$('input[name=count]:checked', form).map(function (i) { return i.value; });
      out.exclude = mods.filter(function (m) { return ticked.indexOf(m) < 0; });
      // Required fields (unchanged from 1.0.9: application, a date not in the future, supervision): each one missing is
      // marked where it is, and the first is brought into view and focused for screen readers. Nothing is cleared.
      var missing = [['type', T('Choose the application.')], ['date', out.date > today() ? T('The date cannot be in the future.') : T('Enter the date of the scan.')], ['supervision', T('Choose the level of supervision.')]].filter(function (x) { return !fieldOk(form, x[0]); });
      $$('.field.invalid', form).forEach(function (fl) { markField(fl, ''); });
      if (missing.length) {
        missing.forEach(function (x) { markField($('[data-req="' + x[0] + '"]', form), x[1]); });
        var first = $('[data-req="' + missing[0][0] + '"]', form);
        scrollToField(first, true);
        first.focus({ preventScroll: true });
        NAT.haptic('warning');
        return;
      }
      // The server refuses an entry over 20,000 characters, so say so here rather than keep one that cannot sync.
      if (JSON.stringify(strip(out)).length > 19000) { err.textContent = T('This scan has too much text to sync. Shorten the reflection or other notes.'); err.hidden = false; return; }
      var hits = guard(out);
      var finish = function () {
        var btn = $('button[type=submit]', form);
        saving = true; busy(btn, true, T('Saving…'));
        var keepImgs = existing.filter(function (x) { return removed.indexOf(x.id) < 0; });
        out.images = keepImgs.concat(draftImages.map(function (x) { var o = { id: x.id, w: x.w, h: x.h, declared: true }; if (x.kind === 'clip') { o.kind = 'clip'; o.dur = x.dur; } return o; }));
        out._dirty = true; if (!editing) out._new = true;
        out.updatedAt = editing ? editing.updatedAt : 0;
        if (draftImages.length && navigator.storage && navigator.storage.persist) navigator.storage.persist();
        fingerprints(out.images, draftImages, editing && editing.media).then(function (media) {
          if (media.length) out.media = media; else delete out.media;
          var jobs = draftImages.map(function (x) { return put('images', { id: x.id, entryId: out.id, blob: x.blob, thumb: x.thumb, w: x.w, h: x.h, kind: x.kind || 'image', dur: x.dur, sha256: x.sha256, created: Date.now() }); })
            .concat(removed.map(function (id) { return del('images', id); }));
          return Promise.all(jobs);
        }).then(function () { return saveLocal(out); }).then(function () {
          // Saved on this device. Nothing after this point may report the save as failed (a second Save would then
          // make a duplicate), so the screen change runs on its own.
          delete form.dataset.dirty; draftImages = [];
          try { setKv('lastSetting', out.setting); NAT.haptic('success'); } catch (e) { /* not essential */ }
          setTimeout(function () {
            // A new scan goes back Home; an edit goes back to the scan. A short note says what actually happened,
            // and changes to "synced" only once the server has acknowledged this scan.
            var note = savedNote(out.id, !editing);
            go(editing ? 'entry/' + out.id : '');
            sync().then(function () { note.update(); });
          }, 0);
        }, function (ex) {
          // Not saved: stay on the form with everything as entered.
          saving = false; busy(btn, false);
          err.textContent = T('Could not save on this device: {why}', { why: (ex && ex.message) || ex }); err.hidden = false;
          scrollToField(err, true);
        });
      };
      if (hits.length) {
        sheet('<h2>' + esc(T('Check for identifiers')) + '</h2><p>' + esc(T('Your text looks like it includes {what}. Your logbook must never hold patient-identifiable information.', { what: hits.join(', ') })) + '</p><div class="btns"><button class="btn block" data-close>' + esc(T('Go back and edit')) + '</button><button class="btn ghost block" data-ok>' + esc(T('It is not an identifier, save')) + '</button></div>', function (root) { $('[data-ok]', root).onclick = function () { closeSheet(); finish(); }; });
        return;
      }
      finish();
    });
  }
  // A SHA-256 of each image and clip, computed on this phone when the scan is saved. Only the fingerprints sync, so a
  // sign-off covers the media the supervisor saw: changing an image after sign-off voids a newer sign-off. It detects
  // accidental or casual changes, not a determined learner who controls the phone.
  function blobSha(b) {
    if (!(b && window.crypto && crypto.subtle)) return Promise.resolve(null);
    return b.arrayBuffer().then(function (buf) { return crypto.subtle.digest('SHA-256', buf); })
      .then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); })
      .catch(function () { return null; });
  }
  function fingerprints(images, drafts, prev) {
    return Promise.all((images || []).map(function (im) {
      var d = (drafts || []).find(function (x) { return x.id === im.id; });
      if (d) return blobSha(d.blob).then(function (h) { d.sha256 = h; return h; });
      return getOne('images', im.id).then(function (rec) {
        if (rec && rec.sha256) return rec.sha256;
        if (rec) return blobSha(rec.blob).then(function (h) { if (h) { rec.sha256 = h; put('images', rec); } return h; });
        var old = (prev || []).find(function (m) { return m.id === im.id; }); // on another device: keep its fingerprint
        return old ? old.sha256 : null;
      });
    })).then(function (hs) {
      return (images || []).map(function (im, i) { return hs[i] ? { id: im.id, sha256: hs[i], kind: im.kind === 'clip' ? 'clip' : 'image' } : null; }).filter(Boolean);
    });
  }
  // ---------- Image editor: crop, cover identifiers, rotate. Re-encoding strips hidden photo data. ----------
  function editorFrame(title, extraTools, declText, saveLabel) {
    var el = document.createElement('div'); el.className = 'editor';
    el.innerHTML = '<div class="bar-top"><button class="tool" data-a="cancel">' + esc(T('Cancel')) + '</button><b style="flex:1;text-align:center">' + esc(title) + '</b><button class="tool" data-a="undo">' + esc(T('Undo')) + '</button></div>' +
      '<div class="stage"><canvas></canvas><div class="sel" hidden></div></div>' +
      '<p class="tip" data-tip>' + esc(T('Drag to choose the area to keep, then tap Apply crop. Most machines show patient details along the top: Trim top removes that strip.')) + '</p>' +
      '<div class="bar-bot"><button class="tool" data-m="crop" aria-pressed="true">' + esc(T('Crop')) + '</button><button class="tool" data-m="cover" aria-pressed="false">' + esc(T('Cover')) + '</button><button class="tool" data-a="trim">' + esc(T('Trim top')) + '</button>' + extraTools + '<button class="tool" data-a="apply">' + esc(T('Apply crop')) + '</button>' +
      '<label class="check" style="width:100%;color:#fff;padding:8px 4px 4px;font-size:14px"><input type="checkbox" data-decl><span>' + esc(declText) + '</span></label>' +
      '<button class="btn teal block" data-a="save" disabled>' + esc(saveLabel) + '</button></div>';
    document.body.appendChild(el);
    return el;
  }
  function editImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); toast(T('That file is not an image this phone can open.')); resolve(null); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 2200, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var work = document.createElement('canvas'); work.width = Math.round(img.naturalWidth * sc); work.height = Math.round(img.naturalHeight * sc);
        work.getContext('2d').drawImage(img, 0, 0, work.width, work.height);
        var undo = [], mode = 'crop', sel = null, start = null;
        var el = editorFrame(T('Prepare image'), '<button class="tool" data-a="rotate">' + esc(T('Rotate')) + '</button>', T('I have removed or covered every patient identifier in this image.'), T('Use this image'));
        var cv = $('canvas', el), box = $('.sel', el), stage = $('.stage', el);
        var draw = function () { cv.width = work.width; cv.height = work.height; cv.getContext('2d').drawImage(work, 0, 0); sel = null; box.hidden = true; };
        var snap = function () { var c = document.createElement('canvas'); c.width = work.width; c.height = work.height; c.getContext('2d').drawImage(work, 0, 0); undo.push(c); if (undo.length > 8) undo.shift(); };
        var replace = function (c) { work = c; draw(); };
        var crop = function (x, y, w, h) { if (w < 20 || h < 20) return; snap(); var c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); c.getContext('2d').drawImage(work, x, y, w, h, 0, 0, w, h); replace(c); };
        var toWork = function (ev) { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(work.width, (ev.clientX - r.left) * work.width / r.width)), y: Math.max(0, Math.min(work.height, (ev.clientY - r.top) * work.height / r.height)) }; };
        var showSel = function () {
          if (!sel) { box.hidden = true; return; }
          var r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / work.width;
          box.hidden = false; box.className = 'sel' + (mode === 'cover' ? ' box' : '');
          box.style.left = (r.left - sr.left + sel.x * k) + 'px'; box.style.top = (r.top - sr.top + sel.y * k) + 'px'; box.style.width = sel.w * k + 'px'; box.style.height = sel.h * k + 'px';
        };
        cv.addEventListener('pointerdown', function (ev) { ev.preventDefault(); cv.setPointerCapture(ev.pointerId); start = toWork(ev); sel = { x: start.x, y: start.y, w: 0, h: 0 }; showSel(); });
        cv.addEventListener('pointermove', function (ev) { if (!start) return; var p = toWork(ev); sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; showSel(); });
        cv.addEventListener('pointerup', function () {
          start = null;
          if (mode === 'cover' && sel && sel.w > 4 && sel.h > 4) { snap(); var g = work.getContext('2d'); g.fillStyle = '#000'; g.fillRect(sel.x, sel.y, sel.w, sel.h); draw(); }
        });
        var decl = $('[data-decl]', el), save = $('[data-a=save]', el);
        decl.addEventListener('change', function () { save.disabled = !decl.checked; });
        $$('[data-m]', el).forEach(function (b) { b.onclick = function () { mode = b.dataset.m; $$('[data-m]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); $('[data-a=apply]', el).hidden = mode !== 'crop'; $('[data-tip]', el).textContent = mode === 'crop' ? T('Drag to choose the area to keep, then tap Apply crop.') : T('Drag over any name, number, date or label to black it out.'); sel = null; showSel(); }; });
        var close = function (v) { el.remove(); resolve(v); };
        el.addEventListener('click', function (ev) {
          var a = ev.target.closest('[data-a]'); if (!a) return;
          var act = a.dataset.a;
          if (act === 'cancel') close(null);
          if (act === 'undo' && undo.length) replace(undo.pop());
          if (act === 'apply' && sel) crop(sel.x, sel.y, sel.w, sel.h);
          if (act === 'trim') { var h = Math.round(work.height * 0.12); crop(0, h, work.width, work.height - h); }
          if (act === 'rotate') { snap(); var c = document.createElement('canvas'); c.width = work.height; c.height = work.width; var g = c.getContext('2d'); g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(work, 0, 0); replace(c); }
          if (act === 'save') {
            // 2048 px at quality 0.9 keeps fine text and speckle; step quality down only past the 1.5 MB share limit.
            var best = function () { var qs = [0.9, 0.85, 0.8, 0.72]; var tryQ = function (i) { return out(2048, qs[i]).then(function (r) { return r.b && r.b.size > IMG_LIMIT && i < qs.length - 1 ? tryQ(i + 1) : r; }); }; return tryQ(0); };
            var out = function (maxSide, q) { return new Promise(function (ok) { var s = Math.min(1, maxSide / Math.max(work.width, work.height)); var c = document.createElement('canvas'); c.width = Math.round(work.width * s); c.height = Math.round(work.height * s); var g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(work, 0, 0, c.width, c.height); c.toBlob(function (b) { ok({ b: b, w: c.width, h: c.height }); }, 'image/jpeg', q); }); };
            Promise.all([best(), out(360, 0.72)]).then(function (r) { close({ blob: r[0].b, thumb: r[1].b, w: r[0].w, h: r[0].h, declared: true, kind: 'image' }); });
          }
        });
        draw();
      };
      img.src = url;
    });
  }

  // ---------- Clip editor: choose up to 10 seconds, crop, cover identifiers. The clip is re-recorded from a canvas,
  // which drops sound and every piece of hidden file data, and burns the covers into every frame. ----------
  function clipMime() {
    if (!window.MediaRecorder) return null;
    var list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  }
  function clipSupported() { var c = document.createElement('canvas'); return !!(clipMime() && c.captureStream); }
  function editClip(file) {
    return new Promise(function (resolve) {
      if (file.size > 200 * 1048576) { toast(T('That clip is too large. Choose a shorter one.')); resolve(null); return; }
      var url = URL.createObjectURL(file), vid = document.createElement('video');
      vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.src = url; vid.setAttribute('playsinline', '');
      vid.onerror = function () { URL.revokeObjectURL(url); toast(T('That file is not a clip this phone can open.')); resolve(null); };
      vid.onloadedmetadata = function () {
        var W = vid.videoWidth, H = vid.videoHeight, dur = vid.duration || 0;
        if (!W || !H) { vid.onerror(); return; }
        var crop = { x: 0, y: 0, w: W, h: H }, covers = [], mode = 'crop', sel = null, start = null, history = [];
        var startAt = 0, len = Math.min(10, dur || 10);
        var el = editorFrame(T('Prepare clip'), '', T('I have removed or covered every patient identifier in this clip, in every frame.'), T('Use this clip'));
        $('.bar-bot', el).insertAdjacentHTML('afterbegin', '<div class="trim" style="width:100%;color:#fff;font-size:13px"><label>' + esc(T('Start')) + ' <span data-st>0.0</span> s<input type="range" data-start min="0" max="' + Math.max(0, dur - 1).toFixed(1) + '" step="0.1" value="0"></label><label>' + esc(T('Length')) + ' <span data-ln>' + len.toFixed(1) + '</span> s<input type="range" data-len min="1" max="' + Math.min(10, dur || 10).toFixed(1) + '" step="0.1" value="' + len.toFixed(1) + '"></label></div>');
        var cv = $('canvas', el), box = $('.sel', el), stage = $('.stage', el);
        var paint = function () {
          cv.width = crop.w; cv.height = crop.h; var g = cv.getContext('2d');
          g.drawImage(vid, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
          g.fillStyle = '#000'; covers.forEach(function (c) { g.fillRect(c.x - crop.x, c.y - crop.y, c.w, c.h); });
          sel = null; box.hidden = true;
        };
        var seek = function (t) { return new Promise(function (ok) { var done = function () { vid.removeEventListener('seeked', done); ok(); }; vid.addEventListener('seeked', done); vid.currentTime = Math.min(Math.max(0, t), Math.max(0, dur - 0.05)); }); };
        var toSrc = function (ev) { var r = cv.getBoundingClientRect(); return { x: crop.x + Math.max(0, Math.min(crop.w, (ev.clientX - r.left) * crop.w / r.width)), y: crop.y + Math.max(0, Math.min(crop.h, (ev.clientY - r.top) * crop.h / r.height)) }; };
        var showSel = function () {
          if (!sel) { box.hidden = true; return; }
          var r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / crop.w;
          box.hidden = false; box.className = 'sel' + (mode === 'cover' ? ' box' : '');
          box.style.left = (r.left - sr.left + (sel.x - crop.x) * k) + 'px'; box.style.top = (r.top - sr.top + (sel.y - crop.y) * k) + 'px'; box.style.width = sel.w * k + 'px'; box.style.height = sel.h * k + 'px';
        };
        var keep = function () { history.push({ crop: Object.assign({}, crop), covers: covers.slice() }); };
        cv.addEventListener('pointerdown', function (ev) { ev.preventDefault(); cv.setPointerCapture(ev.pointerId); start = toSrc(ev); sel = { x: start.x, y: start.y, w: 0, h: 0 }; showSel(); });
        cv.addEventListener('pointermove', function (ev) { if (!start) return; var p = toSrc(ev); sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; showSel(); });
        cv.addEventListener('pointerup', function () { start = null; if (mode === 'cover' && sel && sel.w > 4 && sel.h > 4) { keep(); covers.push(sel); paint(); } });
        $$('[data-m]', el).forEach(function (b) { b.onclick = function () { mode = b.dataset.m; $$('[data-m]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); $('[data-a=apply]', el).hidden = mode !== 'crop'; $('[data-tip]', el).textContent = mode === 'crop' ? T('Drag to choose the area to keep, then tap Apply crop.') : T('Drag over any name, number, date or label. The cover stays on every frame.'); sel = null; showSel(); }; });
        var sIn = $('[data-start]', el), lIn = $('[data-len]', el);
        sIn.oninput = function () { startAt = Number(sIn.value); $('[data-st]', el).textContent = startAt.toFixed(1); var mx = Math.min(10, Math.max(1, dur - startAt)); lIn.max = mx.toFixed(1); if (len > mx) { len = mx; lIn.value = mx; $('[data-ln]', el).textContent = mx.toFixed(1); } seek(startAt).then(paint); };
        lIn.oninput = function () { len = Number(lIn.value); $('[data-ln]', el).textContent = len.toFixed(1); };
        var decl = $('[data-decl]', el), save = $('[data-a=save]', el);
        decl.addEventListener('change', function () { save.disabled = !decl.checked; });
        var close = function (v) { vid.pause(); URL.revokeObjectURL(url); el.remove(); resolve(v); };
        el.addEventListener('click', function (ev) {
          var a = ev.target.closest('[data-a]'); if (!a) return;
          var act = a.dataset.a;
          if (act === 'cancel') close(null);
          if (act === 'undo' && history.length) { var h = history.pop(); crop = h.crop; covers = h.covers; paint(); }
          if (act === 'apply' && sel && sel.w > 20 && sel.h > 20) { keep(); crop = { x: sel.x, y: sel.y, w: sel.w, h: sel.h }; paint(); }
          if (act === 'trim') { keep(); var cut = Math.round(crop.h * 0.12); crop = { x: crop.x, y: crop.y + cut, w: crop.w, h: crop.h - cut }; paint(); }
          if (act === 'save') {
            save.disabled = true; save.textContent = T('Preparing clip… 0%');
            record().then(close).catch(function (ex) { save.disabled = false; save.textContent = T('Use this clip'); toast(ex.message || T('Could not prepare the clip.'), 4000); });
          }
        });
        function record() {
          var mime = clipMime();
          var sc = Math.min(1, 1280 / Math.max(crop.w, crop.h));
          var out = document.createElement('canvas'); out.width = Math.round(crop.w * sc / 2) * 2; out.height = Math.round(crop.h * sc / 2) * 2;
          var g = out.getContext('2d');
          var frame = function () { g.drawImage(vid, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height); g.fillStyle = '#000'; covers.forEach(function (c) { g.fillRect((c.x - crop.x) * sc, (c.y - crop.y) * sc, c.w * sc, c.h * sc); }); };
          return seek(startAt).then(function () {
            frame();
            var thumbP = new Promise(function (ok) { var s = Math.min(1, 360 / Math.max(out.width, out.height)); var c = document.createElement('canvas'); c.width = Math.round(out.width * s); c.height = Math.round(out.height * s); c.getContext('2d').drawImage(out, 0, 0, c.width, c.height); c.toBlob(ok, 'image/jpeg', 0.72); });
            var stream = out.captureStream(30), chunks = [];
            var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
            rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
            var stopAt = startAt + len, raf = 0;
            var tick = function () { frame(); save.textContent = T('Preparing clip… {p}%', { p: Math.min(99, Math.round(100 * (vid.currentTime - startAt) / len)) }); if (vid.currentTime >= stopAt || vid.ended) { vid.pause(); rec.stop(); return; } raf = requestAnimationFrame(tick); };
            var done = new Promise(function (ok, no) { rec.onstop = function () { cancelAnimationFrame(raf); var blob = new Blob(chunks, { type: mime.split(';')[0] }); if (blob.size > 12 * 1048576) no(new Error(T('The clip came out larger than 12 MB. Choose a shorter length or crop tighter.'))); else ok(blob); }; rec.onerror = function () { no(new Error(T('Could not prepare the clip.'))); }; });
            rec.start(250);
            return vid.play().then(function () { tick(); return Promise.all([done, thumbP]); });
          }).then(function (r) { return { blob: r[0], thumb: r[1], w: out.width, h: out.height, kind: 'clip', dur: Math.round(len * 10) / 10, declared: true }; });
        }
        seek(0).then(paint);
      };
    });
  }

  // ---------- Entry detail ----------
  function viewEntry(r) {
    var e = S.entries.find(function (x) { return x.id === r.arg && !x.deleted; });
    if (!e) { mount(shell({ title: T('Scan'), back: 'log' }, '<div class="empty"><p>' + esc(T('This scan is not in your logbook.')) + '</p></div>')); return; }
    var t = TYPES[e.type] || { label: e.type, fields: [] };
    var row = function (k, v) { return v == null || v === '' || (Array.isArray(v) && !v.length) ? '' : '<dt>' + esc(k) + '</dt><dd>' + esc(val(v)) + '</dd>'; };
    var f = e.findings || {};
    var so = e.signoff;
    var basis = { witnessed: T('witnessed the scan'), reviewed: T('reviewed the images'), both: T('witnessed and reviewed') };
    var rt = so && so.rating ? '<div class="rated">' + ['image', 'accuracy'].filter(function (k) { return so.rating[k]; }).map(function (k) { var q = C.qualityScale.find(function (x) { return x.id === so.rating[k]; }) || {}; return '<span class="tl-tag tl-' + so.rating[k] + '"><i></i>' + esc(T(k === 'image' ? 'Image quality' : 'Diagnostic accuracy')) + ': ' + esc(T(q.label || '')) + '</span>'; }).join('') + '</div>' : '';
    var signHtml = so ? '<div class="signbox ' + (so.status === 'confirmed' ? 'ok' : 'warn') + '"><b>' + esc(so.status === 'confirmed' ? T('Signed off') : T('Queried')) + '</b> · ' + esc(so.name) + (so.role ? ', ' + esc(so.role) : '') + (so.reg ? ' (' + esc(so.reg) + ')' : '') + ' · ' + esc(fmt(so.at)) + ' · ' + esc(so.method === 'in-person' ? T('in person') : so.method === 'dashboard' ? T('from their dashboard') : T('by link')) + (so.basis ? ' (' + esc(basis[so.basis]) + ')' : '') + (so.signatureKind === 'typed' ? ' · ' + esc(T('Typed signature')) : '') + '. ' + esc(T('Code {code}.', { code: so.code })) + (entrySigner(so) ? '<br><span class="small">' + esc(entrySigner(so)) + '</span>' : '') + rt + '</div>'
      : e.signoffVoid ? '<div class="warn">' + esc(T('Signed by {name}, then edited. Ask for sign-off again.', { name: e.signoffVoid.name })) + '</div>' : '';
    var wt = !(so && so.status === 'confirmed') && waiting(e), state = signState(e);
    if (wt) signHtml = '<div class="signbox warn"><b>' + esc(T('Awaiting sign-off')) + '</b>' + (wt.name ? ' · ' + esc(wt.name) : '') + '. ' + esc(T('Request sent, valid until {date}.', { date: fmt(new Date(wt.exp).toISOString()) })) + '</div>' + (so ? '<p class="small muted" style="margin:8px 0 0">' + esc(so.status === 'query' ? T('Earlier: queried by {name}.', { name: so.name }) : T('Earlier: signed by {name}.', { name: so.name })) + '</p>' : '');
    else if (state === 'none') signHtml = '<p class="muted small" style="margin:0">' + esc(T('No sign-off needed for this scan.')) + '</p>';
    else if (!signHtml) signHtml = '<div class="signbox" style="border-color:var(--red-line);background:var(--red-bg)"><b style="color:var(--red)">' + esc(T('Not sent')) + '</b> ' + esc(T('for sign-off yet.')) + '</div>';
    var canToggle = !(so && so.status === 'confirmed') && !wt;
    signHtml += canToggle ? '<div class="btns" style="margin-top:10px">' + (state === 'none' ? '<button class="btn ghost sm" type="button" id="nsb">' + esc(T('Needs sign-off')) + '</button>' : '<a class="btn sm" href="#/signoff?e=' + esc(e.id) + '">' + esc(T('Request sign-off')) + '</a><button class="btn ghost sm" type="button" id="nsb">' + esc(T('No sign-off needed')) + '</button>') + '</div>' : '';
    var mods = [];
    myPaths().forEach(function (pid) { PATHS[pid].modules.forEach(function (m) { if (m.types.indexOf(e.type) >= 0 && (!m.filter || ENG.hit(e, m.filter))) mods.push('<span class="chip ' + ((e.exclude || []).indexOf(m.id) < 0 ? 'teal' : '') + '">' + esc(PATHS[pid].label + ' ' + T(m.label)) + ((e.exclude || []).indexOf(m.id) < 0 ? '' : ', ' + esc(T('not counted'))) + '</span>'); }); });
    var asm = S.assessments.filter(function (a) { return (a.entry_ids || []).indexOf(e.id) >= 0 && a.status === 'signed'; });
    mount(shell({ title: T(t.label), back: 'log', action: '<a class="act" href="#/edit/' + esc(e.id) + '" style="text-decoration:none">' + esc(T('Edit')) + '</a>' },
      '<div class="detail"><p class="eyebrow">' + esc(fmt(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</p>' +
      ((e.images || []).length ? '<div class="gallery" id="gal">' + e.images.map(function (im) { return '<button type="button" data-view="' + esc(im.id) + '"><img alt="' + esc(T('Scan image')) + '" data-img="' + esc(im.id) + '">' + (im.kind === 'clip' ? '<span class="play">▶</span>' : '') + '</button>'; }).join('') + '</div><div class="mstate" id="mstate"></div>' : '') +
      '<div class="card">' + signHtml + '</div>' +
      '<div class="card"><h3 style="margin-bottom:10px">' + esc(T('Findings')) + '</h3><dl>' + t.fields.map(function (fd) { return row(T(fd.label), f[fd.id] != null ? (typeof f[fd.id] === 'number' ? f[fd.id] + (fd.unit ? ' ' + fd.unit : '') : f[fd.id]) : null); }).join('') + row(T('Overall'), e.overall) + row(T('Image quality (your rating)'), e.quality) + '</dl></div>' +
      '<div class="card"><h3 style="margin-bottom:10px">' + esc(T('Context')) + '</h3><dl>' + row(T('Setting'), e.setting) + row(T('Age band'), e.age) + row(T('Sex'), e.sex) + '<dt>' + esc(T('Indication')) + '</dt><dd>' + esc(e.indication || '') + '</dd>' + row(T('Supervision'), supLabel(e.supervision)) + '<dt>' + esc(T('Supervisor')) + '</dt><dd>' + esc(e.supervisor || '') + '</dd></dl></div>' +
      ((e.interpretation || e.confirmation || e.impact) ? '<div class="card"><h3 style="margin-bottom:10px">' + esc(T('Interpretation and outcome')) + '</h3><dl><dt>' + esc(T('Interpretation')) + '</dt><dd>' + esc(e.interpretation || '') + '</dd>' + row(T('Confirmed by'), e.confirmation) + row(T('Agreement'), e.concordant) + '<dt>' + esc(T('Impact')) + '</dt><dd>' + esc(e.impact || '') + '</dd></dl></div>' : '') +
      (e.reflection ? '<div class="card"><h3>' + esc(T('Reflection')) + '</h3><p style="white-space:pre-wrap">' + esc(e.reflection) + '</p></div>' : '') +
      (asm.length ? '<div class="card"><h3 style="margin-bottom:8px">' + esc(T('Assessments')) + '</h3>' + asm.map(asmRow).join('') + '</div>' : '') +
      (mods.length ? '<div class="card"><h3 style="margin-bottom:8px">' + esc(T('Counts towards')) + '</h3><div class="meta" style="display:flex;flex-wrap:wrap;gap:6px">' + mods.join('') + '</div></div>' : '') +
      ((TYPES[e.type] || {}).learn ? '<a class="card dark" style="display:block;text-decoration:none" href="' + esc(TYPES[e.type].learn) + '"><p class="eyebrow" style="color:var(--teal-l)">' + esc(T('Learn more')) + '</p><h3>' + esc(T('{type} on Wavelength', { type: T(t.label) })) + '</h3><p class="muted small">' + esc(T('Free Pearls and certified Academy modules.')) + '</p></a>' : '') +
      '<div class="btns"><a class="btn teal" href="#/new?copy=' + esc(e.id) + '">' + esc(T('Another scan, same patient')) + '</a>' + '<a class="btn ghost" href="#/assess?e=' + esc(e.id) + '">' + esc(T('Use for an assessment')) + '</a><button class="btn ghost" id="shb">' + I.share + ' ' + esc(T('Share case')) + '</button><button class="btn ghost danger-text" id="delb" style="color:var(--red)">' + esc(T('Delete')) + '</button></div></div>'));
    var ms = $('#mstate');
    if (ms) shareFor(e.id).then(function (q) {
      var st = shareState(q, e);
      ms.innerHTML = '<span class="chip ' + (st.cls || '') + '">' + esc(st.label) + '</span>' + (st.retry ? ' <button class="link small" type="button" data-retryq>' + esc(T('Retry')) + '</button>' : '') + (st.link && q.link ? ' <button class="link small" type="button" data-showq>' + esc(T('Show link')) + '</button>' : '');
      var rb = $('[data-retryq]', ms); if (rb) rb.onclick = function () { busy(rb, true); runShare(q).then(function (k) { linkReady({ link: q.link + '.' + k, images: q.files.length, dash: q.dash }, T('Please sign off {scans} in my Wavelength logbook: {link}', { scans: plural(q.scans || 1, 'ultrasound scan'), link: q.link + '.' + k }), T('Ultrasound logbook sign-off')); }).catch(function (ex) { if (ex.share) shareFailed(q, ex, function (k) { linkReady({ link: q.link + '.' + k, images: q.files.length, dash: q.dash }, T('Please sign off {scans} in my Wavelength logbook: {link}', { scans: plural(q.scans || 1, 'ultrasound scan'), link: q.link + '.' + k }), T('Ultrasound logbook sign-off')); }); else { busy(rb, false); toast(ex.message, 4000); } }); };
      var sb = $('[data-showq]', ms); if (sb) sb.onclick = function () { linkReady({ link: shareLink(q), images: q.files.length, dash: q.dash }, T('Please sign off {scans} in my Wavelength logbook: {link}', { scans: plural(q.scans || 1, 'ultrasound scan'), link: shareLink(q) }), T('Ultrasound logbook sign-off')); };
    });
    var nsb = $('#nsb');
    if (nsb) nsb.onclick = function () { var d = strip(e); if (d.noSignoff) delete d.noSignoff; else d.noSignoff = true; d._dirty = true; d.updatedAt = e.updatedAt || 0; saveLocal(d).then(function () { toast(d.noSignoff ? T('Marked as no sign-off needed.') : T('Marked as needing sign-off.')); render(true); sync(); }); };
    $$('[data-img]').forEach(function (im) { getOne('images', im.dataset.img).then(function (rec) { if (rec) im.src = imgUrl(rec, true); else im.parentNode.innerHTML = '<span class="small" style="color:#B9C4D0;padding:6px">' + esc(T('Image on another device or backup')) + '</span>'; }); });
    $$('[data-view]').forEach(function (b) { b.onclick = function () { getOne('images', b.dataset.view).then(function (rec) { if (!rec) return; var v = document.createElement('div'); v.className = 'viewer'; v.innerHTML = (isClip(rec) ? '<video src="' + imgUrl(rec) + '" controls autoplay loop muted playsinline></video>' : '<img alt="' + esc(T('Scan image')) + '" src="' + imgUrl(rec) + '">') + '<button class="btn sm light">' + esc(T('Close')) + '</button>'; v.onclick = function (ev) { if (ev.target.tagName !== 'VIDEO') v.remove(); }; document.body.appendChild(v); }); }; });
    $('#shb').onclick = function () {
      sheet('<h2>' + esc(T('Share this case')) + '</h2><p class="muted small">' + esc(T('Builds a one-page PDF of this scan for teaching, a colleague or your portfolio. Check every image and line is free of identifiers before you send it, and follow your hospital\'s policy on sharing clinical images.')) + '</p><form id="scf">' + ((e.images || []).length ? '<label class="check"><input type="checkbox" name="images" value="1" checked><span>' + esc(T('Include images (clips show their first frame)')) + '</span></label>' : '') + '<label class="check" style="margin-top:10px"><input type="checkbox" name="reflections" value="1"><span>' + esc(T('Include my reflection')) + '</span></label><label class="check" style="margin-top:10px"><input type="checkbox" required name="ok"><span>' + esc(T('I have checked this case holds no patient identifiers.')) + '</span></label><div class="btns"><button class="btn teal block">' + esc(T('Create PDF')) + '</button></div></form>', function (root) {
        $('#scf', root).addEventListener('submit', function (ev) { ev.preventDefault(); var d = formData(this); d.single = true; var b = $('button', this); busy(b, true, T('Building…')); exportPdf([e], d, []).then(function (out) { closeSheet(); deliver(out.blob, 'Wavelength-case-' + e.date + '-' + (TYPES[e.type] || {}).short + '.pdf'); }).catch(function (ex) { busy(b, false); toast(ex.message); }); });
      });
    };
    $('#delb').onclick = function () {
      sheet('<h2>' + esc(T('Delete this scan?')) + '</h2><p class="muted">' + esc(T('It leaves your logbook on every device, with its images on this phone. A sign-off on it is lost.')) + '</p><div class="btns"><button class="btn danger block" data-ok>' + esc(T('Delete scan')) + '</button><button class="btn ghost block" data-close>' + esc(T('Keep it')) + '</button></div>', function (root) {
        $('[data-ok]', root).onclick = function () { var d = { id: e.id, deleted: true, _dirty: true, updatedAt: e.updatedAt || 0 }; dropImages(e.id); saveLocal(d).then(function () { closeSheet(); toast(T('Scan deleted.')); go('log'); sync(); }); };
      });
    };
  }

  // ---------- Progress ----------
  function viewProgress(r) {
    var mine = myPaths(), pid = r.arg && PATHS[r.arg] ? r.arg : mine[0];
    var ps = pathwayStats(pid);
    var mods = ps.stats.map(function (s) {
      var tracked = s.total || s.sup || s.assessments.length || s.rules.length;
      var label = s.total ? Math.round(100 * s.main) + '%' : tracked ? s.percent + '%' : s.list.length;
      var asmBars = s.assessments.map(function (a) { return barRow(T(a.label), a.n, a.min); }).join('');
      var topics = (s.mod.topics || []).length ? '<details class="topics"><summary>' + esc(T('Curriculum topics ({n})', { n: s.mod.topics.length })) + '</summary><ul>' + s.mod.topics.map(function (t) { return '<li>' + esc(T(t)) + '</li>'; }).join('') + '</ul></details>' : '';
      return '<div class="mod ' + (tracked ? s.colour : '') + '"><div class="mod-head">' + ring(tracked ? s.frac : 1, tracked ? s.colour : 'green', label) + '<div class="grow"><h3>' + esc(T(s.mod.label)) + '</h3><p class="need">' + esc(needText(s)) + '</p></div></div>' +
        '<div class="bars">' + (s.total ? barRow(T('Scans'), s.counted, s.total) : '<div class="bar-row"><div class="lbl"><span>' + esc(T('Scans logged')) + '</span><b>' + s.list.length + '</b></div></div>') + (s.sup ? barRow(T('Directly supervised'), s.supervised, s.sup) : '') + (s.mod.reflections ? barRow(T('Reflective notes'), s.reflections, s.mod.reflections) : '') +
        s.rules.map(function (rl) { return rl.min ? barRow(T(rl.label), rl.n, rl.min) : barRow(T(rl.label), rl.n, rl.max, 'max'); }).join('') + asmBars +
        (s.list.length ? '<div class="bar-row"><div class="lbl"><span>' + esc(T('Signed off')) + '</span><b>' + esc(T('{n} of {m}', { n: s.signed, m: s.list.length })) + '</b></div></div>' : '') + '</div>' +
        (s.mod.minDays && ps.win ? '<p class="window">' + esc(T('Minimum training period {days}: {state}', { days: plural(s.mod.minDays, 'day'), state: ps.win.day >= s.mod.minDays ? T('met.') : T('{n} days to go.', { n: s.mod.minDays - ps.win.day }) })) + '</p>' : '') + topics +
        '<div class="btns" style="margin-top:10px"><a class="btn ghost sm" href="#/log?type=' + s.mod.types[0] + '">' + esc(T('See scans')) + '</a><a class="btn ghost sm" href="#/new?type=' + s.mod.types[0] + '">' + esc(T('Log one')) + '</a>' + (s.assessments.length ? '<a class="btn ghost sm" href="#/assess?p=' + pid + '&m=' + s.mod.id + '">' + esc(T('Assessment')) + '</a>' : '') + (!s.met ? '<a class="btn ghost sm" href="' + esc(learnLink(s.mod)) + '">' + esc(T('Learn')) + '</a>' : '') + '</div></div>';
    }).join('');
    var win = ps.win ? '<div class="card"><h3>' + esc(ps.pw.windowFrom === 'firstSupervised' ? T('Training window') : T('Logbook window')) + '</h3><p class="small" style="margin:0">' + esc(T('Started {start}. Complete by {end}.', { start: fmt(ps.win.start), end: fmt(ps.win.end) })) + ' ' + (ps.win.day > ps.win.days ? '<b style="color:var(--red)">' + esc(T('Window passed.')) + '</b>' : esc(T('{days} left.', { days: plural(Math.max(0, ps.win.days - ps.win.day), 'day') }))) + '</p><div class="bar ' + (ps.win.day / ps.win.days > 0.8 ? '' : 'green') + '" style="margin-top:10px"><i style="width:' + Math.min(100, 100 * ps.win.day / ps.win.days) + '%"></i></div></div>' : '';
    mount(shell({ title: T('Progress'), action: '<a class="act" href="#/targets/' + pid + '" style="text-decoration:none">' + esc(T('Targets')) + '</a>' },
      '<nav class="pw-tabs">' + mine.map(function (p) { return '<a href="#/progress/' + p + '"' + (p === pid ? ' aria-current="page"' : '') + '>' + esc(pwName(PATHS[p])) + '</a>'; }).join('') + '<a href="#/me?edit=pathways">+ ' + esc(T('Pathway')) + '</a></nav>' +
      (pid !== 'general' ? '<div class="legend"><span>' + esc(T('Under a third')) + '</span><span class="a">' + esc(T('On the way')) + '</span><span class="g">' + esc(T('Target met')) + '</span></div>' : '') + win +
      (mods || '<div class="empty"><p>' + esc(pid === 'general' ? T('Log any scan and it appears here. Tap Targets to set your own.') : T('No modules.')) + '</p><a class="btn teal" href="#/new">' + esc(T('Log a scan')) + '</a></div>') +
      '<p class="small muted" style="margin-top:18px">' + esc(ps.pw.source) + ' ' + esc(T('Targets checked {date}. Always confirm requirements with your supervisor and the current curriculum. You can adjust any target.', { date: fmt(ps.pw.checked) })) + '</p>'));
  }
  function viewTargets(r) {
    var pid = PATHS[r.arg] ? r.arg : myPaths()[0], pw = PATHS[pid], tg = profile().targets || {};
    var mods = pid === 'general' ? C.types.map(function (t) { return { id: 'gen-' + t.id, label: t.label, total: 0 }; }) : pw.modules;
    mount(shell({ title: pid === 'general' ? T('Your targets') : T('{p} targets', { p: pw.label }), back: 'progress/' + pid },
      '<p class="muted small">' + esc(pid === 'general' || !pw.modules.some(function (m) { return m.total; }) ? T('Set a target for any module. Leave blank for none.') : T('Defaults follow {p} guidance. Change one only if your supervisor or a newer curriculum sets a different number.', { p: pw.label })) + '</p><form id="tf">' +
      mods.map(function (m) { var t = tg[m.id] || {}; return '<div class="card"><h3>' + esc(T(m.label)) + '</h3><div class="two" style="margin-top:8px"><div class="field" style="margin:0"><label for="t_' + m.id + '">' + esc(T('Scans')) + (m.total ? ' (' + esc(T('default {n}', { n: m.total })) + ')' : '') + '</label><input id="t_' + m.id + '" data-m="' + m.id + '" data-k="total" type="number" min="0" inputmode="numeric" value="' + (t.total != null ? t.total : '') + '" placeholder="' + (m.total || '') + '"></div>' + (pid !== 'general' ? '<div class="field" style="margin:0"><label for="s_' + m.id + '">' + esc(T('Supervised')) + (m.supervised ? ' (' + esc(T('default {n}', { n: m.supervised })) + ')' : '') + '</label><input id="s_' + m.id + '" data-m="' + m.id + '" data-k="supervised" type="number" min="0" inputmode="numeric" value="' + (t.supervised != null ? t.supervised : '') + '" placeholder="' + (m.supervised || '') + '"></div>' : '') + '</div></div>'; }).join('') +
      (pw.windowFrom ? '<div class="card"><h3>' + esc(T('Window start')) + '</h3><p class="small muted">' + esc(pw.windowFrom === 'firstSupervised' ? T('By default your first directly supervised scan. Set it if your training started earlier.') : T('By default your first scan. Set it if your training started earlier.')) + '</p><input type="date" id="ws" value="' + esc((profile().windowStart || {})[pid] || '') + '"></div>' : '') +
      '<div class="btns"><button class="btn teal block">' + esc(T('Save targets')) + '</button><button type="button" class="btn ghost block" id="rs">' + esc(T('Reset to defaults')) + '</button></div></form>'));
    var save = function (reset) {
      var t = Object.assign({}, profile().targets || {});
      mods.forEach(function (m) { delete t[m.id]; });
      if (!reset) $$('[data-m]').forEach(function (i) { if (i.value === '') return; t[i.dataset.m] = t[i.dataset.m] || {}; t[i.dataset.m][i.dataset.k] = Number(i.value); });
      var ws = Object.assign({}, profile().windowStart || {}); if ($('#ws')) { if ($('#ws').value && !reset) ws[pid] = $('#ws').value; else delete ws[pid]; }
      saveProfile({ targets: t, windowStart: ws }).then(function () { toast(T('Targets saved.')); go('progress/' + pid); }).catch(function (ex) { toast(ex.message); });
    };
    $('#tf').addEventListener('submit', function (e) { e.preventDefault(); save(false); });
    $('#rs').onclick = function () { save(true); };
  }

  // ---------- Sign-off ----------
  function activeSupervisors() { return ((S.links || {}).supervisors || []).filter(function (s) { return s.status === 'active' && (!s.state || s.state === 'active' || s.state === 'not_verified'); }); }
  function viewSignoff(r) {
    var pre = r.q.get('e');
    var todo = live().filter(function (e) { return !(e.signoff && e.signoff.status === 'confirmed') && (!e.noSignoff || e.id === pre); }).sort(sortEntries);
    mount(shell({ title: T('Sign-off'), back: 'log' },
      '<div class="card dark"><h3>' + esc(T('Three ways to get signed off')) + '</h3><p class="muted small">' + esc(T('In person: hand your phone to your supervisor, who signs with a finger. By link: send a secure link your supervisor opens on any device. Dashboard: a supervisor linked to your account sees the request in their own app. Every sign-off gets a code anyone can verify at thewavelength.co.uk/verify.')) + '</p></div>' +
      (todo.length ? '<h2 class="sec">' + esc(T('Choose scans')) + ' <button class="link" id="selall" type="button">' + esc(T('Select all')) + '</button></h2><form id="sf">' + todo.map(function (e) {
        var t = TYPES[e.type] || { label: e.type };
        return '<label class="pathcard"><input type="checkbox" name="e" value="' + esc(e.id) + '"' + (pre === e.id ? ' checked' : '') + (e._dirty ? ' disabled' : '') + '><div class="grow"><b>' + esc(T(t.label)) + '</b><span>' + esc(fmt(e.date)) + ' · ' + esc(supLabel(e.supervision)) + (e.supervisor ? ' · ' + esc(e.supervisor) : '') + (e._dirty ? ' · ' + esc(T('syncing, try again shortly')) : '') + '</span><div style="margin-top:4px">' + statusChip(e) + '</div></div></label>';
      }).join('') + '<div class="btns" style="position:sticky;bottom:calc(var(--tab) + var(--safe-b) + 8px);background:var(--bg);padding:8px 0"><button class="btn teal" style="flex:1" type="button" data-m="person">' + esc(T('Supervisor is with me')) + '</button><button class="btn" style="flex:1" type="button" data-m="link">' + esc(T('Send a request')) + '</button></div></form>'
        : '<div class="empty"><p>' + esc(T('Nothing left to send. Every scan needing sign-off is signed off.')) + '</p></div>') +
      '<h2 class="sec">' + esc(T('Requests and history')) + '</h2><div id="hist"><p class="muted small">' + esc(T('Loading…')) + '</p></div>'));
    var sel = function () { return $$('input[name=e]:checked').map(function (i) { return i.value; }); };
    var sa = $('#selall'); if (sa) sa.onclick = function () { var boxes = $$('input[name=e]:not(:disabled)'); var on = boxes.some(function (b) { return !b.checked; }); boxes.forEach(function (b) { b.checked = on; }); };
    $$('[data-m]').forEach(function (b) { b.onclick = function () { var ids = sel(); if (!ids.length) { toast(T('Choose at least one scan.')); return; } if (!navigator.onLine) { toast(T('Sign-off needs an internet connection.')); return; } (b.dataset.m === 'person' ? signInPerson : signByLink)(ids); }; });
    api('/api/app/signoffs').then(function (res) {
      var h = $('#hist'); if (!h) return;
      var list = (res.signoffs || []); if (res.ok) setPending(list);
      h.innerHTML = list.length ? list.map(function (s) {
        var n = s.entry_ids.length, conf = Object.values(s.decisions || {}).filter(function (x) { return x === 'confirmed'; }).length;
        var st = s.status === 'signed' ? '<span class="chip green">' + esc(T('Signed')) + '</span>' : s.status === 'pending' ? (s.expires_at < Date.now() ? '<span class="chip">' + esc(T('Expired')) + '</span>' : '<span class="chip amber">' + esc(T('Waiting')) + '</span>') : '<span class="chip">' + esc(T('Cancelled')) + '</span>';
        var how = s.method === 'in-person' ? T('In person') : s.method === 'dashboard' ? T('Dashboard') : s.supervisor_id ? T('Dashboard and link') : T('By link');
        return '<div class="card"><div class="row"><div class="grow"><b>' + esc(s.id) + '</b><p class="small muted" style="margin:2px 0 0">' + esc([plural(n, 'scan'), how, fmt(s.signed_at || s.created_at), s.supervisor_name || '', s.status === 'signed' ? T('{n} confirmed', { n: conf }) : ''].filter(Boolean).join(' · ')) + '</p></div>' + st + '</div>' + (s.status === 'signed' && s.signer ? '<p class="small muted" style="margin:6px 0 0">' + esc(signerText(s.signer)) + '</p>' : '') + (s.issuedInError ? '<div class="warn" style="margin-top:8px">' + esc(T('Marked as issued in error by Wavelength.')) + '</div>' : '') + (s.comment ? '<p class="small" style="margin:8px 0 0">“' + esc(s.comment) + '”</p>' : '') + (s.status === 'pending' && s.returned ? '<p class="small" style="margin:8px 0 0">' + esc(T('Came back to you: the supervisor is no longer available.')) + '</p><div class="btns"><button class="btn teal sm" data-back="' + esc(s.id) + '">' + esc(T('Send on')) + '</button></div>' : '') + (s.status === 'pending' && s.expires_at > Date.now() && !s.returned ? '<div class="btns"><button class="btn ghost sm" data-cancel="' + esc(s.id) + '">' + esc(T('Cancel request')) + '</button></div>' : '') + '</div>';
      }).join('') : '<p class="muted small">' + esc(T('No sign-offs yet.')) + '</p>';
      $$('[data-cancel]', h).forEach(function (b) { b.onclick = function () { api('/api/app/signoff/cancel', { code: b.dataset.cancel }).then(function () { toast(T('Request cancelled.')); viewSignoff(route()); }); }; });
      $$('[data-back]', h).forEach(function (b) { b.onclick = function () { returnedSheet('signoff', b.dataset.back, T('This sign-off request')); }; });
    });
  }
  function entryCard(e, decide) {
    var t = TYPES[e.type] || {};
    return '<div class="card" style="padding:12px"><div class="row"><div class="grow"><b>' + esc(T(t.label || e.type)) + '</b><p class="small muted" style="margin:2px 0 0">' + esc(fmt(e.date)) + ' · ' + esc(supLabel(e.supervision)) + '</p><p class="small" style="margin:4px 0 0">' + esc(summary(e)) + '</p></div>' + (decide ? '<select data-dec="' + esc(e.id) + '" style="width:auto;min-height:40px;font-size:14px"><option value="confirmed">' + esc(T('Confirm')) + '</option><option value="query">' + esc(T('Query')) + '</option></select>' : '') + '</div>' + (decide ? F.ratingHtml(C, T, e.id) : '') + '</div>';
  }
  function signoffFormHtml(pre) {
    return '<form id="pf">' + F.assessorHtml(T, pre) +
      '<div class="field"><span class="lab">' + esc(T('How you know')) + '</span><div class="seg"><input type="radio" name="basis" id="bw" value="witnessed" checked><label for="bw">' + esc(T('I watched the scan')) + '</label><input type="radio" name="basis" id="br" value="reviewed"><label for="br">' + esc(T('I reviewed the images')) + '</label><input type="radio" name="basis" id="bb" value="both"><label for="bb">' + esc(T('Both')) + '</label></div></div>' +
      (pre && pre.noEmail ? '' : '<div class="field"><label for="se">' + esc(T('Email (optional)')) + '</label><input id="se" name="email" type="email"></div>') +
      '<div class="field"><label for="sc">' + esc(T('Comment (optional)')) + '</label><textarea id="sc" name="comment" style="min-height:70px"></textarea></div>' +
      '<div class="field"><span class="lab">' + esc(T('Signature')) + '</span><canvas class="sigpad" data-sig></canvas><button type="button" class="link small" data-sigclr>' + esc(T('Clear')) + '</button></div>' +
      '<label class="check"><input type="checkbox" name="confirm" value="1" required><span>' + esc(T('I witnessed or reviewed these scans as stated, and the record above is accurate.')) + '</span></label>' +
      '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">' + esc(T('Sign off')) + '</button><button type="button" class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div></form>';
  }
  function collectSignoff(root, f, pad) {
    var d = formData(f), err = $('.err', f);
    if (!d.name || !d.role || !d.confirm) { err.textContent = T('Enter your name and role and tick the confirmation.'); err.hidden = false; return null; }
    if (pad.empty()) { err.textContent = pad.emptyError(); err.hidden = false; return null; }
    d.signature = pad.data(); d.signatureKind = pad.kind(); d.decisions = {}; $$('[data-dec]', root).forEach(function (s) { d.decisions[s.dataset.dec] = s.value; });
    d.ratings = F.readRatings(root);
    return d;
  }
  function signInPerson(ids) {
    sheet('<h2>' + esc(T('Hand your phone to your supervisor')) + '</h2><p class="muted small">' + esc(T('{name} is asking you to confirm {scans}. Check each one, rate it if you wish, then sign below.', { name: S.account.name, scans: plural(ids.length, 'scan') })) + '</p>' + ids.map(function (id) { return entryCard(S.entries.find(function (x) { return x.id === id; }), true); }).join('') + signoffFormHtml(), function (root) {
      var f = $('#pf', root), pad = F.bindSig(root, T);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var d = collectSignoff(root, f, pad); if (!d) return; d.entryIds = ids;
        var b = $('button.teal', f); busy(b, true, T('Signing…'));
        api('/api/app/signoff/inperson', d).then(function (res) {
          if (!res.ok) throw new Error(res.error); closeSheet();
          return sync().then(function () { NAT.haptic('success'); sheet('<h2>' + esc(T('Signed off')) + '</h2><p>' + T('Code <b>{code}</b>. Anyone can verify it at thewavelength.co.uk/verify.', { code: esc(res.code) }) + '</p><div class="btns"><button class="btn teal block" data-close>' + esc(T('Done')) + '</button></div>'); viewSignoff(route()); });
        }).catch(function (ex) { busy(b, false); var err = $('.err', f); err.textContent = ex.message || T('Could not sign. Check the connection.'); err.hidden = false; });
      });
    });
  }
  // Encrypted image sharing: AES-GCM 256 on this phone, key only in the link's #fragment. The server stores ciphertext.
  function b64u(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  // Encrypted uploads for a sign-off link go through a queue kept on this phone (IndexedDB 'shares'). Each file
  // retries three times with back-off; the manifest is posted only when every file is up, or when the learner chooses
  // to send without the ones that failed; an unfinished queue resumes on the next launch or reconnect. The key lives
  // only in the queue on this phone and in the link fragment, never on the server.
  function shareImages(code, sets, onStep, meta) {
    var files = [];
    sets.forEach(function (st) { st.images.forEach(function (rec, n) { files.push({ entry: st.entry, n: n, img: rec.id, w: rec.w || 0, h: rec.h || 0, kind: isClip(rec) ? 'clip' : 'image', type: isClip(rec) ? rec.blob.type : 'image/jpeg', state: 'queued' }); }); });
    var q = Object.assign({ code: code, raw: crypto.getRandomValues(new Uint8Array(32)), files: files, created: Date.now() }, meta || {});
    return put('shares', q).then(function () { return runShare(q, onStep); });
  }
  var wait = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  function uploadOne(q, key, f, rec, tries) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return rec.blob.arrayBuffer().then(function (buf) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(q.code + ':' + f.entry + ':' + f.n) }, key, buf);
    }).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength); out.set(iv, 0); out.set(new Uint8Array(ct), 12);
      return NAT.net('/api/app/signoff/image?code=' + encodeURIComponent(q.code) + '&entry=' + encodeURIComponent(f.entry) + '&n=' + f.n + (f.kind === 'clip' ? '&kind=clip' : ''), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: out });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j.ok) return;
        var ex = new Error(T(j.error || 'Could not upload an image.'));
        ex.final = r.status >= 400 && r.status < 500; ex.status = r.status; throw ex;
      });
    }).catch(function (ex) {
      // Network errors and server errors retry with back-off; a refusal (too large, request closed, logged out) does not.
      if (ex.final || tries >= 3) throw ex;
      return wait(tries * tries * 1000).then(function () { return uploadOne(q, key, f, rec, tries + 1); });
    });
  }
  function runShare(q, onStep) {
    if (S.sharing && S.sharing[q.code]) return S.sharing[q.code];
    S.sharing = S.sharing || {};
    var total = q.files.length;
    var p = crypto.subtle.importKey('raw', q.raw, 'AES-GCM', false, ['encrypt']).then(function (key) {
      var chain = Promise.resolve();
      q.files.forEach(function (f) {
        if (f.state === 'done' || f.state === 'shared') return;
        chain = chain.then(function () {
          if (q.stop) return;
          if (onStep) onStep(q.files.filter(function (x) { return x.state === 'done'; }).length + 1, total);
          f.state = 'uploading'; delete f.why;
          return getOne('images', f.img).then(function (rec) {
            if (!rec) { var ex = new Error(T('The image is no longer on this phone.')); ex.final = true; throw ex; }
            return uploadOne(q, key, f, rec, 1);
          }).then(function () { f.state = 'done'; }, function (ex) {
            f.state = 'failed'; f.why = ex.message;
            if (ex.status === 401 || ex.status === 410) q.stop = ex.status; // logged out or the request closed: stop here
          }).then(function () { return put('shares', q); });
        });
      });
      return chain;
    }).then(function () {
      var failed = q.files.filter(function (f) { return f.state === 'failed' || f.state === 'uploading'; }).length;
      if (q.stop === 410) { var gone = new Error(T('This sign-off request is no longer open.')); gone.closed = true; throw gone; }
      if (failed) { var ex = new Error(T('{n} could not be uploaded.', { n: plural(failed, 'image') })); ex.share = q; ex.failed = failed; throw ex; }
      return finishShare(q);
    });
    S.sharing[q.code] = p;
    var clear = function () { delete S.sharing[q.code]; delete q.stop; };
    p.then(clear, clear);
    return p;
  }
  // Posts the manifest for every file that is up, then returns the key for the link fragment.
  function finishShare(q) {
    var list = q.files.filter(function (f) { return f.state === 'done' || f.state === 'shared'; }).map(function (f) { return { entry: f.entry, n: f.n, w: f.w, h: f.h, kind: f.kind, type: f.type }; });
    return api('/api/app/signoff/images', { code: q.code, images: list, declared: true }).then(function (j) {
      if (!j.ok) throw new Error(j.error || T('Could not share the images.'));
      q.posted = Date.now(); q.files = q.files.filter(function (f) { return f.state === 'done' || f.state === 'shared'; });
      q.files.forEach(function (f) { f.state = 'shared'; });
      return put('shares', q).then(function () { return b64u(q.raw); });
    });
  }
  function shareLink(q) { return q.link ? q.link + '.' + b64u(q.raw) : ''; }
  // After a launch, a reconnect or a sync: resume unfinished queues, and forget ones whose request has closed.
  function resumeShares() {
    if (!S.db || !S.account || !navigator.onLine || !(window.crypto && crypto.subtle)) return;
    all('shares').then(function (qs) {
      var pend = S.kv.pending || {}, open = {};
      Object.keys(pend).forEach(function (id) { open[pend[id].code] = true; });
      qs.forEach(function (q) {
        var live = open[q.code] && (!q.expires || q.expires > Date.now());
        if (!live) { if (q.posted || Date.now() - q.created > 864e5) { if (!q.closed) { q.closed = Date.now(); put('shares', q); } if (Date.now() - (q.closed || q.created) > 30 * 864e5) del('shares', q.code); } return; }
        if (q.posted || S.sharing && S.sharing[q.code]) return;
        if (q.files.some(function (f) { return f.state === 'failed'; })) return; // waits for the learner: retry, send without, or cancel
        runShare(q).then(function () {
          toast(T('Images for your sign-off request are uploaded.'), 3500);
          if (!document.querySelector('.sheet-bg') && !document.querySelector('form[data-dirty]')) linkReady({ link: shareLink(q), images: q.files.length, dash: q.dash }, T('Please sign off {scans} in my Wavelength logbook: {link}', { scans: plural(q.scans || 1, 'ultrasound scan'), link: shareLink(q) }), T('Ultrasound logbook sign-off'));
        }).catch(function () { /* stays queued; the scan shows what failed */ });
      });
    });
  }
  // The state of a scan's images, for the learner: on this phone only, queued, uploading, shared, failed, removed.
  function shareFor(entryId) {
    return all('shares').then(function (qs) {
      var mine = qs.filter(function (q) { return q.files.some(function (f) { return f.entry === entryId; }) || (q.entries || []).indexOf(entryId) >= 0; });
      return mine.sort(function (a, b) { return b.created - a.created; })[0] || null;
    }).catch(function () { return null; });
  }
  function shareState(q, e) {
    if (!q) return { label: T('On this phone only') };
    var pend = (S.kv.pending || {})[e.id];
    var open = pend && pend.code === q.code;
    if (q.closed || !open && q.posted) return { label: e.signoff && e.signoff.code === q.code ? T('Removed after sign-off') : T('Removed when the request closed'), cls: '' };
    var fs = q.files.filter(function (f) { return f.entry === e.id; });
    if (q.posted) return { label: T('Shared with your supervisor (encrypted, until {date})', { date: fmt(new Date(q.expires || pend.exp).toISOString()) }), cls: 'teal', link: true };
    if (fs.some(function (f) { return f.state === 'failed'; })) return { label: T('Failed: tap to retry'), cls: 'red', retry: true };
    if (S.sharing && S.sharing[q.code]) return { label: T('Uploading'), cls: 'amber' };
    return { label: T('Queued'), cls: 'amber' };
  }
  // Some files failed: try again, send without them, or cancel the request.
  function shareFailed(q, ex, done) {
    sheet('<h2>' + esc(T('Some images did not upload')) + '</h2><p>' + esc(ex.message) + '</p><p class="muted small">' + esc(T('{done} of {total} are uploaded and encrypted. Your supervisor sees nothing until you send the link.', { done: q.files.filter(function (f) { return f.state === 'done'; }).length, total: q.files.length })) + '</p><div class="err" hidden></div><div class="btns"><button class="btn teal block" data-retry>' + esc(T('Try again')) + '</button>' + (q.files.some(function (f) { return f.state === 'done'; }) ? '<button class="btn block" data-without>' + esc(T('Send without the {n} that failed', { n: ex.failed })) + '</button>' : '') + '<button class="btn ghost block" data-cancelq>' + esc(T('Cancel the request')) + '</button></div>', function (root) {
      var err = $('.err', root), btns = $$('.btns button', root);
      var run = function (b, p) { btns.forEach(function (x) { x.disabled = true; }); busy(b, true); p.then(function (k) { closeSheet(); done(k); }).catch(function (e2) { btns.forEach(function (x) { x.disabled = false; }); busy(b, false); if (e2.share) { shareFailed(e2.share, e2, done); return; } err.textContent = e2.message; err.hidden = false; }); };
      $('[data-retry]', root).onclick = function () { run(this, runShare(q, function (i, n) { $('[data-retry]', root).textContent = T('Uploading {i} of {n}…', { i: i, n: n }); })); };
      var w = $('[data-without]', root); if (w) w.onclick = function () { run(this, finishShare(q)); };
      $('[data-cancelq]', root).onclick = function () { api('/api/app/signoff/cancel', { code: q.code }).then(function () { return del('shares', q.code); }).then(function () { closeSheet(); toast(T('Request cancelled.')); sync(); }); };
    });
  }
  function signByLink(ids) {
    var canShare = !!(S.me && S.me.imageShare && window.crypto && crypto.subtle);
    var clipsOk = !!(S.me && S.me.clipShare);
    var sups = activeSupervisors();
    Promise.all(ids.map(function (id) { return canShare ? imagesFor(id).then(function (im) { return { entry: id, images: im.filter(function (x) { return clipsOk || !isClip(x); }).slice(0, 12) }; }) : { entry: id, images: [] }; })).then(function (sets) {
      sets = sets.filter(function (st) { return st.images.length; });
      var count = sets.reduce(function (a, st) { return a + st.images.length; }, 0);
      var imgPart = count ? '<div class="field"><label class="check"><input type="checkbox" id="incl" checked><span>' + esc(T('Include {n} for your supervisor to review', { n: plural(count, 'image') })) + '</span></label>' +
        '<div id="inclbox"><div class="gallery" style="margin-top:8px">' + sets.map(function (st) { return st.images.map(function (rec) { return '<button type="button" disabled><img alt="" src="' + imgUrl(rec, true) + '">' + (isClip(rec) ? '<span class="play">▶</span>' : '') + '</button>'; }).join(''); }).join('') + '</div>' +
        '<p class="hint">' + esc(T('Images are encrypted on this phone. Wavelength cannot open them. They delete when your supervisor signs, when you cancel the request, or after 14 days.')) + '</p>' +
        '<label class="check"><input type="checkbox" id="decl"><span>' + esc(T('I have checked every image above. No patient name, number, date of birth, hospital name or other identifier remains, and sharing them follows my hospital\'s information governance policy.')) + '</span></label></div></div>' : '';
      var supPart = sups.length ? '<div class="field"><label for="tosup">' + esc(T('Send to')) + '</label><select id="tosup"><option value="">' + esc(T('A link I send myself')) + '</option>' + sups.map(function (s) { return '<option value="' + s.id + '" data-uid="' + esc(s.id) + '">' + esc(T('{name}\'s dashboard (and a link)', { name: s.name || s.email })) + '</option>'; }).join('') + '</select><p class="hint">' + esc(T('A linked supervisor sees the request in their app. Images open only from the link, so send it too if you include images.')) + '</p></div>' : '';
      sheet('<h2>' + esc(T('Request sign-off')) + '</h2><p class="muted small">' + esc(T('Your supervisor sees the record of {scans}. The link works for 14 days. Anyone with the link sees what it holds, so send it only to your supervisor.', { scans: plural(ids.length, 'scan') })) + '</p><form id="lf">' + supPart + '<div class="field"><label for="ln2">' + esc(T('Supervisor name (optional)')) + '</label><input id="ln2" name="supervisorName" type="text"></div>' + imgPart + '<div class="err" hidden></div><div class="btns"><button class="btn teal block">' + esc(T('Create request')) + '</button></div></form>', function (root) {
        var incl = $('#incl', root);
        if (incl) incl.onchange = function () { $('#inclbox', root).hidden = !incl.checked; };
        $('#lf', root).addEventListener('submit', function (ev) {
          ev.preventDefault(); var b = $('button.teal', root), err = $('.err', root); err.hidden = true;
          var withImages = !!(incl && incl.checked);
          if (withImages && !$('#decl', root).checked) { err.textContent = T('Tick the declaration, or untick Include images.'); err.hidden = false; return; }
          busy(b, true);
          var code = null, supSel = $('#tosup', root), supId = supSel ? supSel.value : '';
          var ready = function (out) { closeSheet(); linkReady(out, T('Please sign off {scans} in my Wavelength logbook: {link}', { scans: plural(ids.length, 'ultrasound scan'), link: out.link }), T('Ultrasound logbook sign-off')); viewSignoff(route()); };
          var supLink = supId ? sups.find(function (s) { return String(s.id) === supId; }) : null;
          api('/api/app/signoff/request', { entryIds: ids, supervisorName: $('#ln2', root).value, supervisorId: supLink ? supLink.supervisorId || null : null, supervisorLink: supId || null }).then(function (res) {
            if (!res.ok) throw new Error(res.error);
            code = res.code;
            if (!withImages) return { link: res.link, images: 0, dash: res.toDashboard };
            return shareImages(res.code, sets, function (i, n) { b.textContent = T('Uploading {i} of {n}…', { i: i, n: n }); }, { link: res.link, dash: res.toDashboard, scans: ids.length, entries: ids, expires: Date.now() + 14 * 864e5 }).then(function (k) { return { link: res.link + '.' + k, images: count, dash: res.toDashboard }; });
          }).then(ready)
            .catch(function (ex) {
              if (ex.share) { shareFailed(ex.share, ex, function (k) { ready({ link: ex.share.link + '.' + k, images: ex.share.files.length, dash: ex.share.dash }); }); return; }
              if (code) api('/api/app/signoff/cancel', { code: code }).then(function () { del('shares', code); });
              busy(b, false); b.textContent = T('Create request'); err.textContent = ex.message || T('Could not create the request. Check the connection.'); err.hidden = false;
            });
        });
      });
    });
  }
  function linkReady(out, msg, subject) {
    var html = '<h2>' + esc(T('Request ready')) + '</h2>' + (out.dash ? '<div class="ok">' + esc(T('It is waiting in your supervisor\'s dashboard too.')) + '</div>' : '') + '<p class="small muted">' + esc(T('Send the link by email, WhatsApp or Teams.')) + ' ' + esc(out.images ? T('It holds the key to {n}, so send it only to your supervisor.', { n: plural(out.images, 'encrypted image') }) : T('Anyone with the link can sign, so send it only to your supervisor.')) + '</p><div class="card" style="word-break:break-all;font-size:13px">' + esc(out.link) + '</div><div class="btns">' + (navigator.share ? '<button class="btn teal block" data-share>' + esc(T('Share link')) + '</button>' : '') + '<button class="btn block" data-copy>' + esc(T('Copy link')) + '</button><a class="btn ghost block" href="mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg) + '">' + esc(T('Email it')) + '</a><button class="btn ghost block" data-close>' + esc(T('Done')) + '</button></div>';
    sheet(html, function (r2) {
      var sh = $('[data-share]', r2); if (sh) sh.onclick = function () { navigator.share({ title: subject, text: msg }).catch(function () {}); };
      $('[data-copy]', r2).onclick = function () { copy(out.link); };
    });
  }

  // ---------- Assessments ----------
  function kindLabel(k) { return T((KIND[k] || {}).label || k); }
  function asmRow(a) {
    var m = (PATHS[a.pathway] || { modules: [] }).modules.find(function (x) { return x.id === a.module; });
    var oc = OUTCOME[a.outcome];
    var cls = a.status !== 'signed' ? '' : a.outcome === 'competent' ? 'green' : a.outcome === 'feedback' ? 'teal' : 'amber';
    return '<div class="entry asm" data-asm="' + esc(a.id) + '"><span class="thumb">' + I.star + '</span><div class="grow"><h3>' + esc((PATHS[a.pathway] || {}).label || '') + ' · ' + esc(m ? T(m.label) : a.module) + '</h3><p>' + esc(kindLabel(a.kind)) + ' · ' + esc(fmt(a.assessed_on || a.created_at)) + (a.supervisor_name ? ' · ' + esc(a.supervisor_name) : '') + '</p><div class="meta"><span class="chip ' + cls + '">' + esc(a.status === 'superseded' ? T('Amended') : a.status === 'signed' ? T(oc ? oc.label : a.outcome) : a.expires_at < Date.now() ? T('Expired') : T('Waiting')) + '</span></div></div></div>';
  }
  function asmDetail(a) {
    if (a.status === 'superseded') a = Object.assign({}, a, { status: 'signed' }); // shown in full, marked as amended
    var m = (PATHS[a.pathway] || { modules: [] }).modules.find(function (x) { return x.id === a.module; });
    var d = a.data || {};
    var dom = C.assessmentDomains.filter(function (x) { return (d.domains || {})[x.id]; }).map(function (x) { return '<dt>' + esc(T(x.label)) + '</dt><dd>' + esc(T(d.domains[x.id])) + '</dd>'; }).join('');
    var txt = function (k, label) { return d[k] ? '<h3 style="margin:12px 0 4px">' + esc(T(label)) + '</h3><p style="white-space:pre-wrap;margin:0">' + esc(d[k]) + '</p>' : ''; };
    sheet('<h2>' + esc(kindLabel(a.kind)) + '</h2><p class="muted small">' + esc((PATHS[a.pathway] || {}).name || '') + ' · ' + esc(m ? T(m.label) : '') + '</p>' +
      (a.status === 'signed' ? '<div class="ok"><b>' + esc(T((OUTCOME[a.outcome] || {}).label || '')) + '</b><br>' + esc(T('Assessed by {name}{role} on {date}. Code {code}.', { name: a.supervisor_name, role: a.supervisor_role ? ', ' + a.supervisor_role : '', date: fmt(a.assessed_on), code: a.id })) + '</div><div class="detail"><dl>' + (d.topic ? '<dt>' + esc(T('Focus')) + '</dt><dd>' + esc(T(d.topic)) + '</dd>' : '') + dom + '</dl></div>' + txt('strengths', 'What went well') + txt('development', 'What to develop') + txt('actions', 'Agreed actions') + (a.signature ? '<img alt="' + esc(T('Signature')) + '" src="' + a.signature + '" style="max-width:220px;background:#fff;border-radius:8px;margin-top:12px">'  + (a.signatureKind === 'typed' ? '<p class="small muted" style="margin:4px 0 0">' + esc(T('Typed signature')) + '</p>' : '') : '') + '<div class="btns"><button class="btn ghost block" data-copyas>' + esc(T('Copy verification link')) + '</button></div>'
        : a.returned ? '<p>' + esc(T('Came back to you: the supervisor is no longer available.')) + '</p><div class="btns"><button class="btn teal block" data-backas>' + esc(T('Send on')) + '</button></div>'
        : '<p>' + esc(T('Waiting for your assessor.')) + '</p><div class="btns"><button class="btn ghost block" data-cancelas>' + esc(T('Cancel request')) + '</button></div>') +
      '<div class="btns"><button class="btn block" data-close>' + esc(T('Close')) + '</button></div>', function (root) {
      var c = $('[data-copyas]', root); if (c) c.onclick = function () { copy(NAT.origin + '/app/verify/?code=' + a.id); };
      asmNotes(a, root);
      var bk = $('[data-backas]', root); if (bk) bk.onclick = function () { returnedSheet('assessment', a.id, T('This assessment request')); };
      var x = $('[data-cancelas]', root); if (x) x.onclick = function () { api('/api/app/assessment/cancel', { code: a.id }).then(function () { closeSheet(); toast(T('Request cancelled.')); loadAssessments().then(function () { render(true); }); }); };
    });
  }
  // Who signed (approved supervisor, account not approved, or self-declared), and any amendment history. A supervisor
  // can amend their own dashboard assessment within 30 days: a new signed version with a reason, never an overwrite.
  var SIGNER_TEXT = { approved: 'Wavelength Verified Supervisor', account_not_approved: 'Wavelength account, not approved as a supervisor at the time of signing', self_declared: 'Self-declared (not verified by Wavelength)' };
  function signerText(sg) { return sg && SIGNER_TEXT[sg.kind] ? T(SIGNER_TEXT[sg.kind]) : ''; }
  function entrySigner(so) {
    var v = so && so.verification; if (!v) return '';
    return T(SIGNER_TEXT[v.identity !== 'wavelength_account' ? 'self_declared' : (v.approvedFor || []).length ? 'approved' : 'account_not_approved']);
  }
  var AMEND_DAYS = 30;
  function canAmend(a) {
    return a.status === 'signed' && a.method === 'dashboard' && !a.superseded_by && S.account && a.supervisor_id === S.account.id && a.learner_id !== S.account.id &&
      a.signed_at && Date.now() - Date.parse(String(a.signed_at).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(a.signed_at) ? '' : 'Z')) < AMEND_DAYS * 864e5;
  }
  function asmNotes(a, root) {
    var ok = $('.ok', root); if (!ok || a.status !== 'signed') return;
    var bits = [];
    if (a.signer) bits.push('<p class="small" style="margin:8px 0 0"><b>' + esc(T('Signer')) + ':</b> ' + esc(signerText(a.signer)) + '</p>');
    if (a.amends) bits.push('<p class="small" style="margin:8px 0 0">' + esc(T('This corrects {code}.', { code: a.amends })) + (a.amend_reason ? ' ' + esc(T('Reason: {why}', { why: a.amend_reason })) : '') + '</p>');
    if (a.superseded_by) bits.push('<div class="warn" style="margin-top:8px">' + esc(T('Amended: see {code}.', { code: a.superseded_by })) + '</div>');
    if (a.error_note) bits.push('<div class="warn" style="margin-top:8px">' + esc(T('Marked as issued in error by Wavelength.')) + '</div>');
    ok.insertAdjacentHTML('afterend', bits.join(''));
    if (a._learner && canAmend(a)) {
      var box = document.createElement('div'); box.className = 'btns';
      box.innerHTML = '<button class="btn ghost block" type="button" data-amend>' + esc(T('Amend this assessment')) + '</button>';
      var close = $$('.btns', root).pop(); close.parentNode.insertBefore(box, close);
      $('[data-amend]', box).onclick = function () { amendAssessment(a, a._learner); };
    }
  }
  function amendAssessment(a, learnerId) {
    var m = (PATHS[a.pathway] || { modules: [] }).modules.find(function (x) { return x.id === a.module; });
    var pick = '<div class="field"><label for="amr">' + esc(T('Why are you amending it?')) + '</label><textarea id="amr" rows="3" maxlength="1000" required></textarea><p class="hint">' + esc(T('The original stays in the record, marked as amended, and its verification page points to the new one.')) + '</p></div>';
    dashAssessSheet(T('Amend {kind}', { kind: kindLabel(a.kind) }), T('Record the corrected assessment in full. {module}.', { module: ((PATHS[a.pathway] || {}).label || '') + ' ' + (m ? T(m.label) : '') }), { kind: a.kind, pick: pick },
      function (d, root) {
        var why = $('#amr', root).value.trim();
        if (why.length < 5) return Promise.resolve({ ok: false, error: T('Say why you are amending this assessment.') });
        d.code = a.id; d.reason = why; return api('/api/app/supervise/assessment/amend', d);
      }, learnerId);
  }
  function moduleOptions(sel) {
    return myPaths().filter(function (p) { return PATHS[p].modules.length; }).map(function (pid) {
      return '<optgroup label="' + esc(PATHS[pid].label) + '">' + PATHS[pid].modules.map(function (m) { var v = pid + '|' + m.id; return '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + esc(T(m.label)) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function defaultKind(pid, mid) { var m = PATHS[pid] && PATHS[pid].modules.find(function (x) { return x.id === mid; }); var a = m && (m.assessments || []).find(function (x) { return x.kind !== 'formative'; }); return (m && m.assessments && m.assessments[0] && m.assessments[0].kind === 'formative' ? 'formative' : a ? a.kind : 'formative'); }
  function viewAssess(r) {
    var pre = r.q.get('p') && r.q.get('m') ? r.q.get('p') + '|' + r.q.get('m') : '';
    var preE = r.q.get('e');
    var only = r.q.get('view') === 'signed';
    var list = (only ? signedAssessments() : S.assessments).slice().sort(function (a, b) { return (b.assessed_on || b.created_at || '').localeCompare(a.assessed_on || a.created_at || ''); });
    var hasMods = myPaths().some(function (p) { return PATHS[p].modules.length; });
    // From Home's Assessments count: the signed assessments it counts, first, with the filter shown.
    var hist = '<h2 class="sec" id="ahist">' + esc(T('Your assessments')) + '</h2>' + (only ? '<div class="active-f" role="status"><span class="muted small">' + esc(T('Showing')) + '</span><span class="chip teal">' + esc(T('Signed')) + ' · ' + list.length + '</span><a class="link small" href="#/assess">' + esc(T('Clear filter')) + '</a></div>' : '') + (list.length ? list.map(asmRow).join('') : '<p class="muted small">' + esc(only ? T('No signed assessments yet.') : T('None yet.')) + '</p>');
    mount(shell({ title: T('Assessments'), back: '' }, (only ? hist : '') +
      '<div class="card dark"><h3>' + esc(T('Structured assessments')) + '</h3><p class="muted small">' + esc(T('Your assessor rates preparation, image acquisition, optimisation, interpretation, clinical integration and documentation, then records an outcome and feedback. Formative assessments guide your learning. Summative, DOPS and final assessments count towards your targets when judged competent. Each one gets a code anyone can verify.')) + '</p></div>' +
      (hasMods ? '<form id="af" class="card"><h3>' + esc(T('New assessment')) + '</h3>' +
        '<div class="field"><label for="am">' + esc(T('Pathway module')) + '</label><select id="am" name="mod">' + moduleOptions(pre) + '</select></div>' +
        '<div class="field"><label for="ak">' + esc(T('Type')) + '</label><select id="ak" name="kind">' + C.assessmentKinds.map(function (k) { return '<option value="' + k.id + '">' + esc(T(k.label)) + '</option>'; }).join('') + '</select><p class="hint" id="akh"></p></div>' +
        '<div class="field"><span class="lab">' + esc(T('Scans to attach (optional)')) + '</span><div id="ascans" class="mini-list"></div></div>' +
        '<div class="field"><label for="arf">' + esc(T('Note for your assessor (optional)')) + '</label><textarea id="arf" name="learnerReflection" style="min-height:70px" placeholder="' + esc(T('What you want feedback on')) + '"></textarea></div>' +
        '<div class="btns"><button class="btn teal" type="button" data-m="person" style="flex:1">' + esc(T('Assessor is with me')) + '</button><button class="btn" type="button" data-m="link" style="flex:1">' + esc(T('Send a request')) + '</button></div></form>'
        : '<div class="card"><p class="muted small">' + esc(T('Choose a pathway with modules in Me to record assessments against it.')) + '</p><a class="btn sm" href="#/me?edit=pathways">' + esc(T('Choose pathways')) + '</a></div>') +
      (only ? '' : hist)));
    $$('[data-asm]').forEach(function (el) { el.onclick = function () { var a = S.assessments.find(function (x) { return x.id === el.dataset.asm; }); if (a) asmDetail(a); }; });
    var f = $('#af'); if (!f) return;
    var drawScans = function () {
      var v = $('#am').value.split('|'), m = PATHS[v[0]].modules.find(function (x) { return x.id === v[1]; });
      var ents = live().filter(function (e) { return m.types.indexOf(e.type) >= 0; }).sort(sortEntries).slice(0, 30);
      $('#ascans').innerHTML = ents.length ? ents.map(function (e) { return '<label class="check"><input type="checkbox" name="e" value="' + esc(e.id) + '"' + (preE === e.id ? ' checked' : '') + '><span>' + esc(T((TYPES[e.type] || {}).label || '')) + ', ' + esc(fmt(e.date)) + (e.indication ? ' · ' + esc(e.indication) : '') + '</span></label>'; }).join('') : '<p class="small muted">' + esc(T('No scans for this module yet.')) + '</p>';
      $('#ak').value = defaultKind(v[0], v[1]); kHelp();
    };
    var kHelp = function () { $('#akh').textContent = T((KIND[$('#ak').value] || {}).help || ''); };
    if (preE && !pre) { var pe = S.entries.find(function (x) { return x.id === preE; }); if (pe) { var opt = $$('#am option').find(function (o) { var v = o.value.split('|'); return PATHS[v[0]].modules.find(function (x) { return x.id === v[1]; }).types.indexOf(pe.type) >= 0; }); if (opt) $('#am').value = opt.value; } }
    $('#am').onchange = drawScans; $('#ak').onchange = kHelp; drawScans();
    $$('[data-m]', f).forEach(function (b) {
      b.onclick = function () {
        var v = $('#am').value.split('|');
        var req = { pathway: v[0], module: v[1], kind: $('#ak').value, entryIds: $$('input[name=e]:checked', f).map(function (i) { return i.value; }), learnerReflection: $('#arf').value };
        if (!navigator.onLine) { toast(T('Assessments need an internet connection.')); return; }
        if (b.dataset.m === 'person') assessInPerson(req); else assessByLink(req);
      };
    });
  }
  function assessInPerson(req) {
    var m = PATHS[req.pathway].modules.find(function (x) { return x.id === req.module; });
    sheet('<h2>' + esc(T('Hand your phone to your assessor')) + '</h2><p class="muted small">' + esc(T('{name}: {kind} for {module}.', { name: S.account.name, kind: kindLabel(req.kind), module: PATHS[req.pathway].label + ' ' + T(m.label) })) + '</p>' + req.entryIds.map(function (id) { return entryCard(S.entries.find(function (x) { return x.id === id; }), false); }).join('') +
      '<form id="asf">' + F.assessmentHtml(C, T, { kind: req.kind, topics: m.topics, learnerReflection: req.learnerReflection }) + '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">' + esc(T('Record assessment')) + '</button><button type="button" class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div></form>', function (root) {
      var f = $('#asf', root), pad = F.bindSig(root, T);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var d = F.readAssessment(C, f), err = $('.err', f); err.hidden = true;
        if (!d.name || !d.role || !d.confirm) { err.textContent = T('Enter your name and role and tick the confirmation.'); err.hidden = false; return; }
        if (!d.outcome) { err.textContent = T('Choose the outcome of the assessment.'); err.hidden = false; return; }
        if (pad.empty()) { err.textContent = pad.emptyError(); err.hidden = false; return; }
        d.signature = pad.data(); d.signatureKind = pad.kind(); Object.assign(d, req);
        var b = $('button.teal', f); busy(b, true, T('Saving…'));
        api('/api/app/assessment/inperson', d).then(function (res) {
          if (!res.ok) throw new Error(res.error);
          closeSheet(); return loadAssessments().then(function () { sheet('<h2>' + esc(T('Assessment recorded')) + '</h2><p>' + T('Code <b>{code}</b>. Anyone can verify it at thewavelength.co.uk/verify.', { code: esc(res.code) }) + '</p><div class="btns"><button class="btn teal block" data-close>' + esc(T('Done')) + '</button></div>'); render(true); });
        }).catch(function (ex) { busy(b, false); err.textContent = ex.message || T('Could not save. Check the connection.'); err.hidden = false; });
      });
    });
  }
  function assessByLink(req) {
    var sups = activeSupervisors();
    sheet('<h2>' + esc(T('Request an assessment')) + '</h2><p class="muted small">' + esc(T('Your assessor completes the form from a secure link on any device, or from their dashboard if they supervise you on Wavelength. The link works for 14 days.')) + '</p><form id="rlf">' +
      (sups.length ? '<div class="field"><label for="tos">' + esc(T('Send to')) + '</label><select id="tos"><option value="">' + esc(T('A link I send myself')) + '</option>' + sups.map(function (s) { return '<option value="' + s.id + '">' + esc(T('{name}\'s dashboard (and a link)', { name: s.name || s.email })) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="field"><label for="asn">' + esc(T('Assessor name (optional)')) + '</label><input id="asn" type="text"></div><div class="err" hidden></div><div class="btns"><button class="btn teal block">' + esc(T('Create request')) + '</button></div></form>', function (root) {
      $('#rlf', root).addEventListener('submit', function (ev) {
        ev.preventDefault(); var b = $('button', this), err = $('.err', root); busy(b, true);
        var tos = $('#tos', root);
        api('/api/app/assessment/request', Object.assign({ supervisorName: $('#asn', root).value, supervisorLink: tos ? tos.value : '' }, req)).then(function (res) {
          if (!res.ok) throw new Error(res.error);
          closeSheet(); loadAssessments().then(function () { render(true); });
          linkReady({ link: res.link, dash: res.toDashboard }, T('Please complete my ultrasound assessment on Wavelength: {link}', { link: res.link }), T('Ultrasound assessment'));
        }).catch(function (ex) { busy(b, false); err.textContent = ex.message; err.hidden = false; });
      });
    });
  }

  // ---------- Supervisors (learner side) ----------
  function viewSupervisors() {
    var L2 = S.links || { supervisors: [] };
    mount(shell({ title: T('Your supervisors'), back: 'me' },
      '<div class="card dark"><h3>' + esc(T('Link your supervisors')) + '</h3><p class="muted small">' + esc(T('A linked supervisor sees your progress and your written scan records in their own Wavelength app, never your images. Send sign-off and assessment requests straight to their dashboard. Remove a supervisor at any time.')) + '</p></div>' +
      (S.me && S.me.supervisor && S.me.supervisor.search ? '<form id="svsf" class="card" role="search"><div class="field"><label for="svq">' + esc(T('Find a Wavelength Verified Supervisor')) + '</label><input id="svq" type="search" autocomplete="off" minlength="3" placeholder="' + esc(T('Name, at least 3 letters')) + '" aria-describedby="svq-h"><p class="hint" id="svq-h">' + esc(T('Shows only supervisors approved by Wavelength who chose to be found.')) + '</p></div><div id="svres" aria-live="polite"></div></form><p class="small muted" style="margin:-4px 0 12px">' + esc(T('Can\'t find them? Invite a supervisor by email.')) + '</p>' : '') +
      '<form id="addf" class="card"><div class="field"><label for="se2">' + esc(T('Supervisor\'s email')) + '</label><input id="se2" type="email" required autocomplete="off"></div><div class="err" hidden></div><button class="btn teal sm">' + esc(T('Send invitation')) + '</button></form>' +
      (!S.links ? '<p class="muted small" role="status">' + esc(T('Checking…')) + '</p>' : (L2.supervisors || []).length ? L2.supervisors.map(function (s) { return '<div class="card"><div class="row"><div class="grow"><b>' + esc(s.name || s.email) + '</b><p class="small muted" style="margin:2px 0 0">' + esc([s.name ? s.email : '', s.role].filter(Boolean).join(' · ')) + '</p></div>' + linkChip(s) + '</div>' + ((s.areas || []).length ? approvedList(s.areas, 'margin:6px 0 0') : '') + (s.renewal ? '<p class="small muted" style="margin:4px 0 0">' + esc(T('Renewal under review')) + '</p>' : '') + (s.state === 'unavailable' ? '<p class="small muted" style="margin:4px 0 0">' + esc(T('Please arrange another suitable supervisor.')) + '</p>' : '') + '<div class="btns">' + (s.status === 'active' || !s.email ? '' : '<button class="btn ghost sm" data-resend="' + esc(s.email) + '">' + esc(T('Resend or share')) + '</button>') + '<button class="btn ghost sm" data-rm="' + s.id + '">' + esc(T('Remove')) + '</button></div></div>'; }).join('') : '<p class="muted small">' + esc(T('No supervisors linked yet.')) + '</p>') +
      wvExplain() + '<div id="backreqs"></div>'));
    if (!S.links) loadLinks();
    returnedRequests();
    bindSupSearch();
    $('#addf').addEventListener('submit', function (ev) {
      ev.preventDefault(); var b = $('button', this), err = $('.err', this); busy(b, true);
      api('/api/app/supervisors/add', { email: $('#se2').value }).then(function (res) {
        if (!res.ok) throw new Error(res.error);
        var to = $('#se2').value.trim().toLowerCase();
        return loadLinks().then(function () { viewSupervisors(); inviteSent(to, res); });
      }).catch(function (ex) { busy(b, false); err.textContent = ex.message; err.hidden = false; });
    });
    $$('[data-resend]').forEach(function (b) { b.onclick = function () { var to = b.dataset.resend; busy(b, true); api('/api/app/supervisors/add', { email: to }).then(function (res) { busy(b, false); if (!res.ok) { toast(res.error, 5000); return; } inviteSent(to, res); }).catch(function (ex) { busy(b, false); toast(ex.message); }); }; });
    $$('[data-rm]').forEach(function (b) { b.onclick = function () { if (!confirm(T('Remove this supervisor? They stop seeing your logbook at once.'))) return; api('/api/app/supervisors/remove', { id: Number(b.dataset.rm) }).then(function () { loadLinks().then(viewSupervisors); }); }; });
  }

  // Supervisor search: results come only from current approvals whose holder opted in (worker/search.js). The ref is
  // opaque; a request creates an invitation the supervisor accepts on their dashboard.
  function bindSupSearch() {
    var f = $('#svsf'); if (!f) return;
    var q = $('#svq', f), out = $('#svres', f), timer = 0, seq = 0;
    var run = function () {
      var text = q.value.trim(); if (text.length < 3) { out.innerHTML = ''; return; }
      var my = ++seq;
      api('/api/app/supervisors/search?q=' + encodeURIComponent(text)).then(function (res) {
        if (my !== seq) return;
        if (!res.ok) { out.innerHTML = '<p class="small muted">' + esc(res.needVerify ? T('Confirm your email address to search for supervisors.') : res.error || T('Search is not available right now.')) + '</p>'; return; }
        var rs = res.results || [];
        out.innerHTML = rs.length ? rs.map(function (r, i) { return '<div class="sv-result" style="padding:10px 0;border-top:1px solid var(--line)"><div class="grow"><b>' + esc(r.name) + '</b><p class="small muted" style="margin:2px 0 0">' + esc([r.role, r.specialty, r.organisation].filter(Boolean).join(' · ')) + '</p><span class="sv-badge">' + esc(T(r.badge || 'Wavelength Verified Supervisor')) + '</span>' + ((r.areas || []).length ? approvedList(r.areas, 'margin:0') : '') + '</div><button class="btn teal sm" type="button" data-svreq="' + i + '">' + esc(T('Ask to link')) + '</button></div>'; }).join('') : '<p class="small muted">' + esc(T('No approved supervisor found. Check the spelling, or invite them by email.')) + '</p>';
        $$('[data-svreq]', out).forEach(function (b) { b.onclick = function () {
          var r = rs[Number(b.dataset.svreq)]; busy(b, true);
          api('/api/app/supervisors/request', { ref: r.ref }).then(function (j) {
            if (!j.ok) { busy(b, false); toast(j.duplicate ? T('You have already asked this supervisor.') : j.error, 5000); return; }
            toast(T('Request sent to {name}. They accept it in their Wavelength app.', { name: r.name }), 4000);
            loadLinks().then(viewSupervisors);
          }).catch(function () { busy(b, false); toast(T('Could not send. Check your connection.')); });
        }; });
      }).catch(function () { out.innerHTML = '<p class="small muted">' + esc(T('Could not search. Check your connection.')) + '</p>'; });
    };
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 300); });
    f.addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); run(); });
  }
  // The learner's view of a link: the server's state and label (worker/supervisor-lifecycle.js linkState).
  function linkChip(s) {
    var st = s.state || (s.status === 'active' ? 'not_verified' : 'invited');
    var cls = st === 'active' ? 'green' : st === 'unavailable' ? 'red' : st === 'not_verified' ? '' : 'amber';
    var label = s.stateLabel || (st === 'invited' ? 'Invitation sent' : 'Not yet verified by Wavelength');
    return '<span class="chip ' + cls + '" style="white-space:normal;text-align:right;max-width:52%">' + esc(T(label)) + '</span>';
  }
  // Sign-off and assessment requests that came back because a supervisor became unavailable.
  function returnedRequests() {
    if (!navigator.onLine) return;
    Promise.all([api('/api/app/signoffs'), loadAssessments().then(function () { return S.assessments; }, function () { return S.assessments; })]).then(function (r) {
      var box = $('#backreqs'); if (!box) return;
      var so = ((r[0] || {}).signoffs || []).filter(function (x) { return x.status === 'pending' && x.returned; });
      var as = (r[1] || []).filter(function (x) { return x.status === 'pending' && x.returned; });
      if (!so.length && !as.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<h2 class="sec">' + esc(T('Requests that came back to you')) + '</h2>' +
        so.map(function (x) { return '<div class="card"><div class="row"><div class="grow"><b>' + esc(T('Sign-off request')) + '</b><p class="small muted" style="margin:2px 0 0">' + esc(plural(x.entry_ids.length, 'scan') + ' · ' + fmt(x.created_at)) + '</p></div><button class="btn teal sm" data-back="signoff:' + esc(x.id) + '">' + esc(T('Send on')) + '</button></div></div>'; }).join('') +
        as.map(function (x) { return '<div class="card"><div class="row"><div class="grow"><b>' + esc(kindLabel(x.kind)) + '</b><p class="small muted" style="margin:2px 0 0">' + esc(((PATHS[x.pathway] || {}).label || '') + ' · ' + fmt(x.created_at)) + '</p></div><button class="btn teal sm" data-back="assessment:' + esc(x.id) + '">' + esc(T('Send on')) + '</button></div></div>'; }).join('');
      $$('[data-back]', box).forEach(function (b) { b.onclick = function () { var v = b.dataset.back.split(':'); returnedSheet(v[0], v[1], v[0] === 'assessment' ? T('This assessment request') : T('This sign-off request')); }; });
    }).catch(function () { /* offline */ });
  }

  // After an invitation: hospital email (NHSmail and others) often files a first message from a new sender as junk, so
  // say so, and give the learner a message to send themselves by WhatsApp, Teams or text. That link carries no token:
  // the supervisor signs in with the invited email and finds the invitation waiting on their dashboard.
  function inviteSent(to, res) {
    var me = S.account || {};
    var link = NAT.origin + '/app/#/supervise';
    var msg = T('Hello, I use the free Wavelength ultrasound logbook and have added you as my supervisor. Open {link} and log in, or create a free account, with {email}. My invitation is waiting there. Thank you, {name}', { link: link, email: to, name: me.name || '' });
    var head = res.emailed ? T('Invitation sent to {email}.', { email: to }) : T('Invitation saved for {email}, but the email did not go out. Send the message below instead.', { email: to });
    sheet('<h2>' + esc(T('Invitation sent')) + '</h2><div class="' + (res.emailed ? 'ok' : 'warn') + '">' + esc(head) + '</div>' +
      '<p class="small">' + esc(T('Hospital and NHS email often puts a first message from a new sender in junk. Ask your supervisor to check their junk folder and mark the email as Not junk, so later sign-off requests reach their inbox.')) + '</p>' +
      '<p class="small muted">' + esc(T('Or send them this message yourself by WhatsApp, Teams or text:')) + '</p><div class="card small" style="white-space:pre-wrap">' + esc(msg) + '</div>' +
      '<div class="btns">' + (navigator.share ? '<button class="btn teal block" data-share>' + esc(T('Share message')) + '</button>' : '') + '<button class="btn block" data-copy>' + esc(T('Copy message')) + '</button><button class="btn ghost block" data-close>' + esc(T('Done')) + '</button></div>',
    function (r2) {
      var sh = $('[data-share]', r2); if (sh) sh.onclick = function () { navigator.share({ title: T('Wavelength supervision request'), text: msg }).catch(function () {}); };
      $('[data-copy]', r2).onclick = function () { copy(msg, T('Message copied.')); };
    });
  }

  // ---------- Supervisor dashboard ----------
  function viewSupervise(r) {
    if (r.arg) return viewSupervisedLearner(r.arg);
    var L2 = S.links;
    if (!L2) { mount(shell({ title: T('Supervising'), back: '' }, '<p class="muted">' + esc(T('Loading…')) + '</p>')); loadLinks(); return; }
    var me = L2.me || {}, cur = me.standing === 'active' || me.standing === 'renewal_review';
    var banner = me.enforced && !cur ? '<div class="card dark"><h3>' + esc(T('Wavelength supervisor status')) + ': ' + esc(T(SV_STANDING[me.standing] || me.standing || '')) + '</h3><p class="muted small">' + esc(me.standing === 'applying' ? T('Your application is being reviewed. Your learners can send you requests once you are approved.') : T('You need a current Wavelength supervisor approval to sign off and assess through your dashboard.')) + '</p>' + (me.apply ? '<div class="btns"><a class="btn teal sm" href="#/supervisor">' + esc(me.standing === 'none' ? T('Become a Wavelength supervisor') : T('See your status')) + '</a></div>' : '') + '</div>'
      : !me.enforced && me.apply && me.standing === 'none' ? '<div class="card"><p class="small">' + esc(T('You are not yet verified by Wavelength. Learners see you labelled "Not yet verified by Wavelength" until you are approved.')) + '</p><div class="btns"><a class="btn teal sm" href="#/supervisor">' + esc(T('Become a Wavelength supervisor')) + '</a></div></div>' : '';
    mount(shell({ title: T('Supervising'), back: '' },
      banner +
      ((L2.invites || []).length ? '<h2 class="sec">' + esc(T('Invitations')) + '</h2>' + L2.invites.map(function (v) { return '<div class="card"><b>' + esc(v.learner) + '</b><p class="small muted" style="margin:2px 0 8px">' + esc([v.role, v.organisation].filter(Boolean).join(' · ')) + '</p><p class="small">' + esc(v.claimed ? T('Waiting for your Wavelength supervisor approval. Their supervision starts when you are approved.') : T('Asks you to supervise their ultrasound logbook. You will see their progress and written scan records, never their images.')) + '</p><div class="btns">' + (v.claimed ? '<a class="btn teal sm" href="#/supervisor">' + esc(T('Continue to supervisor verification')) + '</a>' : '<button class="btn teal sm" data-acc="' + v.id + '">' + esc(T('Accept')) + '</button>') + '<button class="btn ghost sm" data-dec="' + v.id + '">' + esc(T('Decline')) + '</button></div></div>'; }).join('') : '') +
      '<h2 class="sec">' + esc(T('Your learners')) + '</h2>' +
      ((L2.learners || []).length ? L2.learners.map(function (x) { return '<a class="entry" href="#/supervise/' + x.id + '"><span class="thumb">' + esc((x.name.split(' ').slice(-2).map(function (w) { return w.charAt(0); }).join(''))) + '</span><div class="grow"><h3>' + esc(x.name) + '</h3><p>' + esc([x.role, x.organisation].filter(Boolean).join(' · ')) + '</p><div class="meta">' + x.pathways.map(function (p) { return '<span class="chip">' + esc((PATHS[p] || {}).label || p) + '</span>'; }).join('') + (x.pending ? '<span class="chip amber">' + esc(plural(x.pending, 'request waiting', 'requests waiting')) + '</span>' : '') + (x.available === false ? '<span class="chip red">' + esc(T('Paused')) + '</span>' : '') + '</div></div></a>'; }).join('')
        : '<div class="card"><p class="muted small">' + esc(T('No learners yet. Ask your trainees to add your email under Me, Your supervisors.')) + '</p></div>')));
    $$('[data-acc]').forEach(function (b) { b.onclick = function () { busy(b, true); api('/api/app/supervisors/accept', { id: Number(b.dataset.acc) }).then(function (res) { busy(b, false); if (!res.ok) { toast(res.error, 5000); return; } loadLinks(); if (res.next === 'apply') { toast(T('Next, apply to be a Wavelength supervisor. Their supervision starts when you are approved.'), 5000); go('supervisor/apply'); } }); }; });
    $$('[data-dec]').forEach(function (b) { b.onclick = function () { api('/api/app/supervisors/remove', { id: Number(b.dataset.dec) }).then(loadLinks); }; });
  }
  function viewSupervisedLearner(id) {
    mount(shell({ title: T('Learner'), back: 'supervise' }, '<p class="muted">' + esc(T('Loading…')) + '</p>'));
    api('/api/app/supervise/learner?id=' + encodeURIComponent(id)).then(function (res) {
      if (!res.ok) { mount(shell({ title: T('Learner'), back: 'supervise' }, '<div class="err">' + esc(res.error || T('Could not load.')) + '</div>')); return; }
      S.sv = res;
      var sm = res.summary;
      var paths = sm.pathways.map(function (p) {
        return '<div class="card"><h3>' + esc(p.label) + '</h3>' + p.modules.map(function (m) { var tracked = m.total || m.supTarget || (m.assessments || []).length; return '<div class="evmod"><div class="row"><b class="grow">' + esc(T(m.label)) + '</b>' + (m.met ? '<span class="chip green">' + esc(T('Met')) + '</span>' : tracked ? '<span class="chip amber">' + m.percent + '%</span>' : '<span class="chip">' + m.logged + '</span>') + '</div><p class="small muted" style="margin:2px 0 0">' + esc(T('Scans {a} · Supervised {b} · Signed off {c}', { a: m.counted + (m.total ? ' / ' + m.total : ''), b: m.supervised + (m.supTarget ? ' / ' + m.supTarget : ''), c: m.signed })) + ((m.gaps || []).length ? '<br>' + esc(T('Still needed: {list}', { list: m.gaps.slice(0, 3).map(gapText).join(', ') })) : '') + '</p></div>'; }).join('') + '</div>';
      }).join('');
      var reqs = (res.signoffRequests || []).map(function (s) { return '<div class="card"><div class="row"><div class="grow"><b>' + esc(T('Sign-off request')) + '</b><p class="small muted" style="margin:0">' + esc(plural(s.count, 'scan') + ' · ' + fmt(s.at)) + '</p></div><button class="btn teal sm" data-sv-so="' + esc(s.code) + '">' + esc(T('Review and sign')) + '</button></div></div>'; }).join('') +
        (res.assessmentRequests || []).map(function (a, i) { return '<div class="card"><div class="row"><div class="grow"><b>' + esc(kindLabel(a.kind)) + '</b><p class="small muted" style="margin:0">' + esc(a.pathwayLabel + ' · ' + T(a.moduleLabel)) + '</p></div><button class="btn teal sm" data-sv-as="' + i + '">' + esc(T('Assess')) + '</button></div></div>'; }).join('');
      var recent = res.recent.slice(0, 20).map(function (e) { return '<div class="card" style="padding:12px"><div class="row"><div class="grow"><b>' + esc(T((TYPES[e.type] || {}).label || e.type)) + '</b><p class="small muted" style="margin:2px 0 0">' + esc(fmt(e.date)) + ' · ' + esc(supLabel(e.supervision)) + (e.images ? ' · ' + esc(plural(e.images, 'image')) : '') + '</p><p class="small" style="margin:4px 0 0">' + esc(summary(e)) + '</p></div>' + (e.signoff && e.signoff.status === 'confirmed' ? '<span class="chip green">' + esc(T('Signed off')) + ratingDots(e.signoff.rating) + '</span>' : '<span class="chip">' + esc(T('Not signed')) + '</span>') + '</div></div>'; }).join('');
      mount(shell({ title: res.learner.name, back: 'supervise' },
        '<div class="card dark"><div class="row"><span style="color:var(--teal-l)">' + I.team + '</span><div class="grow"><h3>' + esc(res.learner.name) + '</h3><p class="muted small" style="margin:0">' + esc([res.learner.role, res.learner.organisation].filter(Boolean).join(' · ')) + '</p></div></div><div class="stats" style="margin-top:12px"><div class="stat"><b>' + sm.scans + '</b><span>' + esc(T('Scans')) + '</span></div><div class="stat"><b>' + sm.supervised + '</b><span>' + esc(T('Supervised')) + '</span></div><div class="stat"><b>' + sm.signed + '</b><span>' + esc(T('Signed off')) + '</span></div><div class="stat"><b>' + (res.assessments || []).length + '</b><span>' + esc(T('Assessments')) + '</span></div></div></div>' +
        (reqs ? '<h2 class="sec">' + esc(T('Waiting for you')) + '</h2>' + reqs : '') +
        '<div class="btns"><button class="btn teal block" id="newas">' + esc(T('Record an assessment')) + '</button></div>' +
        '<h2 class="sec">' + esc(T('Progress')) + '</h2>' + paths +
        ((res.assessments || []).length ? '<h2 class="sec">' + esc(T('Assessments')) + '</h2>' + res.assessments.map(asmRow).join('') : '') +
        '<h2 class="sec">' + esc(T('Recent scans')) + '</h2>' + (recent || '<p class="muted small">' + esc(T('No scans yet.')) + '</p>') +
        '<p class="small muted" style="margin-top:14px">' + esc(T('You see written records only. Images stay on the learner\'s phone, or reach you encrypted through the links they send.')) + '</p>'));
      $$('[data-asm]').forEach(function (el) { el.onclick = function () { var a = res.assessments.find(function (x) { return x.id === el.dataset.asm; }); if (a) asmDetail(Object.assign({}, a, { _learner: id })); }; });
      $$('[data-sv-so]').forEach(function (b) { b.onclick = function () { dashSignoff(b.dataset.svSo, id); }; });
      $$('[data-sv-as]').forEach(function (b) { b.onclick = function () { dashAssess(res.assessmentRequests[Number(b.dataset.svAs)], id); }; });
      $('#newas').onclick = function () { dashAssessNew(res, id); };
    });
  }
  function myPre() { var a = S.account || {}; return { name: a.name, role: profile().grade || a.role || '', registration: profile().registration || '', noEmail: true }; }
  function dashSignoff(code, learnerId) {
    api('/api/app/supervise/signoff?code=' + encodeURIComponent(code)).then(function (res) {
      if (!res.ok) { toast(res.error); return; }
      sheet('<h2>' + esc(T('Sign off for {name}', { name: res.learner })) + '</h2><p class="muted small">' + esc(T('Confirm or query each scan, and rate image quality and diagnostic accuracy if you wish. Images open only from the link the learner sent you.')) + '</p>' + res.entries.map(function (e) { return entryCard(e, true); }).join('') + signoffFormHtml(myPre()), function (root) {
        var f = $('#pf', root), pad = F.bindSig(root, T);
        f.addEventListener('submit', function (ev) {
          ev.preventDefault(); var d = collectSignoff(root, f, pad); if (!d) return; d.code = code;
          var b = $('button.teal', f); busy(b, true, T('Signing…'));
          api('/api/app/supervise/signoff', d).then(function (r2) { if (!r2.ok) throw new Error(r2.error); closeSheet(); toast(T('Signed off. Code {code}.', { code: r2.code }), 4000); loadLinks(); viewSupervisedLearner(learnerId); })
            .catch(function (ex) { busy(b, false); var err = $('.err', f); err.textContent = ex.message; err.hidden = false; });
        });
      });
    });
  }
  function dashAssessSheet(title, intro, opts, send, learnerId) {
    sheet('<h2>' + esc(title) + '</h2><p class="muted small">' + esc(intro) + '</p>' + (opts.pick || '') + '<form id="asf">' + F.assessmentHtml(C, T, Object.assign({ pre: myPre() }, opts)) + '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">' + esc(T('Record assessment')) + '</button><button type="button" class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div></form>', function (root) {
      var f = $('#asf', root), pad = F.bindSig(root, T);
      if (opts.bind) opts.bind(root);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var d = F.readAssessment(C, f), err = $('.err', f); err.hidden = true;
        if (!d.name || !d.role || !d.confirm) { err.textContent = T('Enter your name and role and tick the confirmation.'); err.hidden = false; return; }
        if (!d.outcome) { err.textContent = T('Choose the outcome of the assessment.'); err.hidden = false; return; }
        if (pad.empty()) { err.textContent = pad.emptyError(); err.hidden = false; return; }
        d.signature = pad.data(); d.signatureKind = pad.kind();
        var b = $('button.teal', f); busy(b, true, T('Saving…'));
        send(d, root).then(function (r2) { if (!r2.ok) throw new Error(r2.error); closeSheet(); toast(T('Assessment recorded. Code {code}.', { code: r2.code }), 4000); loadLinks(); viewSupervisedLearner(learnerId); })
          .catch(function (ex) { busy(b, false); err.textContent = ex.message; err.hidden = false; });
      });
    });
  }
  function dashAssess(a, learnerId) {
    dashAssessSheet(kindLabel(a.kind), T('{name}: {module}.', { name: a.learner, module: a.pathwayLabel + ' ' + T(a.moduleLabel) }), { kind: a.kind, topics: a.topics, learnerReflection: (a.data || {}).learnerReflection },
      function (d) { d.code = a.code; return api('/api/app/supervise/assessment', d); }, learnerId);
  }
  function dashAssessNew(res, learnerId) {
    var opts = res.learner.pathways.filter(function (p) { return PATHS[p] && PATHS[p].modules.length; }).map(function (pid) { return '<optgroup label="' + esc(PATHS[pid].label) + '">' + PATHS[pid].modules.map(function (m) { return '<option value="' + pid + '|' + m.id + '">' + esc(T(m.label)) + '</option>'; }).join('') + '</optgroup>'; }).join('');
    if (!opts) { toast(T('This learner has no pathway with modules yet.')); return; }
    var pick = '<div class="field"><label for="dm">' + esc(T('Pathway module')) + '</label><select id="dm">' + opts + '</select></div><div class="field"><label for="dk">' + esc(T('Type')) + '</label><select id="dk">' + C.assessmentKinds.map(function (k) { return '<option value="' + k.id + '">' + esc(T(k.label)) + '</option>'; }).join('') + '</select></div>';
    dashAssessSheet(T('Record an assessment'), T('For {name}. Their scans stay on their phone: assess what you observed.', { name: res.learner.name }), { kind: 'formative', pick: pick, bind: function (root) {
      var redraw = function () { var k = $('#dk', root).value; var seg = $('.seg.col', root); if (seg) { var fb = $('input[value=feedback]', seg); if (fb) { fb.disabled = k !== 'formative'; fb.nextSibling.style.opacity = k !== 'formative' ? .4 : 1; if (k !== 'formative' && fb.checked) fb.checked = false; } } };
      $('#dk', root).onchange = redraw;
    } }, function (d, root) { var v = $('#dm', root).value.split('|'); d.learnerId = Number(learnerId); d.pathway = v[0]; d.module = v[1]; d.kind = $('#dk', root).value; return api('/api/app/supervise/assessment/new', d); }, learnerId);
  }

  // ---------- Becoming a Wavelength supervisor (plan section 8): status, application wizard, renewal, stopping ----------
  // The server owns every state: this screen shows what GET /api/app/supervisor returns and saves each step as a draft.
  var SV_STEPS = ['about', 'registration', 'experience', 'evidence', 'areas', 'changes', 'submit'];
  var SV_STEP_LABEL = { about: 'About you', registration: 'Professional registration', experience: 'Ultrasound experience', evidence: 'Evidence or explanation', areas: 'Areas you supervise', changes: 'What has changed', submit: 'Check and send' };
  var SV_STANDING = { none: 'Not a Wavelength supervisor', applying: 'Application being reviewed', active: 'Wavelength Verified Supervisor', renewal_review: 'Renewal under review', paused: 'Paused', expired: 'Expired', withdrawn: 'Ended at your request', revoked: 'Ended by Wavelength' };
  var SV_LAPSE = { email: 'Your email address is not confirmed.', registration: 'Your professional registration is no longer verified as current.', credential: 'A credential your approval relies on has expired or been withdrawn.', review: 'Your review date has passed.' };
  var SV_REASONS = { no_longer_supervising: 'No longer supervising ultrasound', role_change: 'Change of clinical role', organisation_change: 'Changed organisation', no_longer_practising: 'No longer practising in the relevant ultrasound area', 'break': 'Taking a break from supervision', no_longer_wavelength: 'No longer wish to use Wavelength as a supervisor', other: 'Other', prefer_not_to_say: 'Prefer not to say' };
  // "Approved to supervise:" with the supervisor's CURRENT Wavelength-approved scopes, as the server sends them (never
  // requested areas or suggested scopes). dark: on the dark status card.
  function approvedList(areas, style, dark) { return '<p class="small' + (dark ? ' muted' : '') + '" style="' + (style || '') + ';margin-bottom:0"><b>' + esc(T('Approved to supervise:')) + '</b></p><ul class="small sv-scopes' + (dark ? ' muted' : '') + '">' + areas.map(function (x) { return '<li>' + esc(T(x)) + '</li>'; }).join('') + '</ul>'; }
  // What the status means, one tap away wherever supervisor status is shown.
  function wvExplain() { return '<details class="card wv-explain"><summary>' + esc(T('What does Wavelength Verified mean?')) + '</summary><p class="small">' + esc(T('A Wavelength Verified Supervisor has completed our verification process. We check professional registration where applicable, review relevant qualifications and ultrasound credentials, and approve the supervisor only for the areas of practice supported by that information.')) + '</p><p class="small">' + esc(T('Verification is performed by Wavelength and does not mean that the supervisor has been accredited or endorsed by GMC, RCEM, FAMUS, FUSIC or another professional body.')) + '</p></details>'; }
  // Before someone applies: what Wavelength looks at, and what approval does and does not mean.
  function svHow() { return '<div class="card sv-how"><h3>' + esc(T('How supervisor verification works')) + '</h3><p class="small">' + esc(T('We look at your professional registration where applicable, your relevant ultrasound qualifications, credentials or supporting evidence, and the specific areas you want to supervise.')) + '</p><ul class="small"><li>' + esc(T('Approval is scope-specific: holding one credential does not approve every ultrasound area.')) + '</li><li>' + esc(T('We may ask for further evidence.')) + '</li><li>' + esc(T('Supervisor status is reviewed periodically.')) + '</li><li>' + esc(T('Wavelength verification is not accreditation or endorsement by an external professional body.')) + '</li></ul></div>'; }
  function svLoad() { return api('/api/app/supervisor').then(function (res) { if (res.ok) S.sup = res; return res; }); }
  function svSteps(a) { return SV_STEPS.filter(function (s) { return s !== 'changes' || (a && a.kind === 'renewal'); }); }
  function svShell(title, back, body) { return shell({ title: title, back: back }, body); }
  function svOffline(title, back) { mount(svShell(title, back, '<p class="muted">' + esc(navigator.onLine ? T('Loading…') : T('You are offline. Connect to the internet to see your supervisor status. Your logbook works as normal.')) + '</p>')); return navigator.onLine; }
  function viewSupervisorRoute(r) {
    if (r.arg === 'apply') return viewSupervisorApply(r);
    if (r.arg === 'stop') return viewSupervisorStop();
    return viewSupervisorStatus();
  }
  function viewSupervisorStatus() {
    if (!svOffline(T('Wavelength supervisor'), 'me')) return;
    svLoad().then(function (P) {
      if (route().name !== 'supervisor' || route().arg) return;
      if (!P.ok) { mount(svShell(T('Wavelength supervisor'), 'me', '<div class="card"><p class="small">' + esc(P.error || T('Supervisor applications are not available yet.')) + '</p></div>')); return; }
      var a = P.application, st = P.standing, cur = st === 'active' || st === 'renewal_review';
      var chip = cur ? 'green' : st === 'paused' || st === 'revoked' ? 'red' : st === 'none' ? '' : 'amber';
      var status = '<div class="card dark"><div class="row"><span style="color:var(--teal-l)">' + I.team + '</span><div class="grow"><h3>' + esc(T(SV_STANDING[st] || st)) + '</h3>' +
        (cur && P.areas.length ? approvedList(P.areas, 'margin:6px 0 0', true) : '') +
        (P.reviewOn ? '<p class="muted small" style="margin:2px 0 0">' + esc(T('Approved until {date}', { date: fmt(P.reviewOn) })) + '</p>' : '') + '</div></div></div>';
      var notes = '';
      if (st === 'renewal_review') { var g = (P.approvals.filter(function (x) { return x.grace; })[0] || {}).graceUntil; notes += '<div class="card"><p class="small">' + esc(T('Your renewal is with the Wavelength team. Your status continues while it is reviewed, up to {date}, as long as nothing else changes.', { date: fmt(g) })) + '</p></div>'; }
      if (st === 'paused') notes += '<div class="warn">' + esc(T(SV_LAPSE[P.lapse] || 'Something your approval relies on is not current.')) + ' ' + esc(T('While your status is paused you cannot complete supervisor sign-offs or assessments through Wavelength. It resumes on its own once this is put right.')) + '</div>';
      if (P.blocked) notes += '<div class="warn">' + esc(T("This can't be completed through Wavelength. Contact hello@thewavelength.co.uk.")) + '</div>';
      if (P.waiting.length) notes += '<div class="card"><p class="small">' + esc(T('{names} asked you to supervise their logbook. Their supervision starts when the Wavelength team approves you.', { names: P.waiting.join(', ') })) + '</p></div>';
      if (P.previous && P.previous.status === 'rejected' && !a) notes += '<div class="card"><p class="small">' + esc(T('Your last application was not approved.')) + (P.previous.message ? ' ' + esc(P.previous.message) : '') + '</p></div>';
      var app = '';
      if (a) {
        if (a.status === 'submitted') app = '<div class="card"><h3>' + esc(T('Your supervisor application is being reviewed.')) + '</h3><p class="small muted">' + esc(T('Sent {date}.', { date: fmt(a.submittedAt) })) + '</p><p class="small">' + esc(T(P.config.reviewTime)) + '</p><div class="btns"><button class="btn ghost sm" data-svcancel>' + esc((a.kind === 'renewal' ? T('Withdraw renewal') : T('Withdraw application'))) + '</button></div></div>';
        else app = '<div class="card"><h3>' + esc(a.status === 'more_info' ? T('More information needed') : (a.kind === 'renewal' ? T('Renewal in progress') : T('Supervisor application in progress'))) + '</h3>' + (a.moreInfo ? '<p class="small">' + esc(a.moreInfo) + '</p>' : '<p class="small muted">' + esc(T('Your answers are saved as you go.')) + '</p>') + '<div class="btns"><a class="btn teal sm" href="#/supervisor/apply">' + esc(a.status === 'more_info' ? T('Update and send again') : T('Continue')) + '</a><button class="btn ghost sm" data-svcancel>' + esc(T('Discard')) + '</button></div></div>';
      }
      var acts = '';
      if (!P.available) acts += '<div class="card"><p class="small muted">' + esc(T('Supervisor applications are not open yet.')) + '</p></div>';
      else if (!P.emailVerified) acts += emailCardFor();
      else {
        if (!a && st === 'none' && P.canApplyAgain) acts += svHow() + '<div class="card"><p class="small">' + esc(T('Wavelength Verified Supervisors can sign off scans and record assessments from their own dashboard.')) + '</p><div class="btns"><a class="btn teal block" href="#/supervisor/apply" data-svnew>' + esc(T('Become a Wavelength supervisor')) + '</a></div></div>';
        else if (!a && P.canApplyAgain) acts += '<div class="btns"><button class="btn teal block" data-svstart="apply-again">' + esc(T('Apply again as a supervisor')) + '</button></div>';
        if (P.canRenew) acts += '<div class="btns"><button class="btn teal block" data-svstart="renew">' + esc(T('Renew')) + '</button></div><p class="small muted">' + esc(T('Renewing takes a few minutes: check your details, confirm what has not changed and make a fresh declaration.')) + '</p>';
      }
      var find = cur && P.searchAvailable ? '<h2 class="sec">' + esc(T('Being found')) + '</h2><div class="card"><label class="check"><input type="checkbox" id="svfind"' + (P.searchableAt ? ' checked' : '') + '><span>' + esc(T('Let learners find me in Wavelength supervisor search')) + '</span></label><p class="small muted" style="margin:8px 0 0">' + esc(T('Logged-in learners would see your name, role, organisation and the areas Wavelength approved you for, never your email. They can then ask to link, and you choose whether to accept. Turn this off at any time.')) + '</p><div id="svprev"></div></div>' : '';
      var stop = cur || st === 'paused' || (a && a.status !== 'draft') ? '<h2 class="sec">' + esc(T('Stop supervising')) + '</h2><div class="card"><a href="#/supervisor/stop">' + esc(T('Stop being a Wavelength supervisor')) + '</a></div>' : '';
      mount(svShell(T('Wavelength supervisor'), 'me', status + notes + app + acts +
        (P.approvals.length ? '<h2 class="sec">' + esc(T('Approved scopes')) + '</h2><div class="card">' + P.approvals.map(function (x) { return '<span class="chip ' + (x.current ? 'teal' : 'amber') + '" style="margin:0 6px 6px 0">' + esc(x.label) + '</span>'; }).join('') + '<p class="small muted" style="margin:6px 0 0">' + esc(T('This approval is given by Wavelength. It is not an accreditation by RCEM, FAMUS, FUSIC or any other body.')) + '</p></div>' : '') +
        find + stop + wvExplain() + '<p class="small muted" style="margin-top:14px">' + esc(T('Questions: hello@thewavelength.co.uk.')) + '</p>'));
      bindEmailResend();
      var fb = $('#svfind'); if (fb) fb.onchange = function () {
        var on = fb.checked; fb.disabled = true;
        api('/api/app/supervisor/searchable', { on: on }).then(function (res) {
          fb.disabled = false;
          if (!res.ok) { fb.checked = !on; toast(res.error, 5000); return; }
          var pv = res.preview, box = $('#svprev');
          box.innerHTML = on && pv ? '<div class="card" style="margin:10px 0 0;background:var(--bg)"><p class="small muted" style="margin:0 0 4px">' + esc(T('What learners see')) + '</p><b>' + esc(pv.name) + '</b><p class="small muted" style="margin:2px 0 0">' + esc([pv.role, pv.specialty, pv.organisation].filter(Boolean).join(' · ')) + '</p><span class="sv-badge">' + esc(T(pv.badge || 'Wavelength Verified Supervisor')) + '</span>' + ((pv.areas || []).length ? '<p class="small" style="margin:0">' + esc(pv.areas.map(T).join(', ')) + '</p>' : '') + '</div>' : '';
          toast(on ? T('Learners can now find you.') : T('You no longer appear in search.'));
        }).catch(function () { fb.disabled = false; fb.checked = !on; toast(T('Could not save. Check your connection.')); });
      };
      $$('[data-svcancel]').forEach(function (b) { b.onclick = function () { if (!confirm(T('Withdraw this application? Your answers and documents are deleted. You can start again later.'))) return; busy(b, true); api('/api/app/supervisor/application/cancel', {}).then(function () { toast(T('Application withdrawn.')); viewSupervisorStatus(); }); }; });
      $$('[data-svstart]').forEach(function (b) { b.onclick = function () { busy(b, true); api('/api/app/supervisor/' + b.dataset.svstart, {}).then(function (res) { busy(b, false); if (!res.ok) { toast(res.error, 5000); return; } go('supervisor/apply'); }); }; });
    }).catch(function () { toast(T('Could not load. Check your connection.')); });
  }

  function viewSupervisorApply(r) {
    if (!svOffline(T('Supervisor application'), 'supervisor')) return;
    svLoad().then(function (P) {
      if (route().name !== 'supervisor' || route().arg !== 'apply') return;
      if (!P.ok || !P.available) { mount(svShell(T('Supervisor application'), 'supervisor', '<div class="card"><p class="small">' + esc(P.error || T('Supervisor applications are not open yet.')) + '</p></div>')); return; }
      if (!P.emailVerified) { mount(svShell(T('Supervisor application'), 'supervisor', emailCardFor())); bindEmailResend(); return; }
      var a = P.application || { kind: 'initial', status: 'draft', experience: {}, areas: [], pathways: [], credentialIds: [], evidence: [] };
      if (a.status === 'submitted') { go('supervisor'); return; }
      var steps = svSteps(a), step = steps.indexOf(r.arg2) >= 0 ? r.arg2 : steps[0], i = steps.indexOf(step);
      var cfg = P.config, acc = S.account;
      var next = function () { return i < steps.length - 1 ? 'supervisor/apply/' + steps[i + 1] : 'supervisor'; };
      var prev = i ? 'supervisor/apply/' + steps[i - 1] : 'supervisor';
      var head = '<p class="eyebrow" style="margin:0 2px 6px">' + esc(T('Step {i} of {n}', { i: i + 1, n: steps.length })) + '</p><div class="progress" aria-hidden="true" style="height:6px;border-radius:99px;background:var(--line);margin:0 0 14px"><div style="height:6px;border-radius:99px;background:var(--teal);width:' + Math.round((i + 1) / steps.length * 100) + '%"></div></div>' +
        (a.kind === 'renewal' && step !== 'submit' ? '<p class="small muted">' + esc(T('Your previous answers are filled in. Change only what is different.')) + '</p>' : '') +
        (a.moreInfo ? '<div class="warn">' + esc(T('The Wavelength team asked: {note}', { note: a.moreInfo })) + '</div>' : '');
      var foot = '<div class="err" hidden role="alert"></div><div class="btns"><button class="btn teal" style="flex:1">' + esc(step === 'submit' ? T('Send application') : T('Save and continue')) + '</button><a class="btn ghost" href="#/' + prev + '">' + esc(T('Back')) + '</a></div>';
      var body = '';
      if (step === 'about') {
        body = (a.kind === 'renewal' ? '' : svHow()) + '<div class="field"><label for="sa0">' + esc(T('Title')) + '</label><select id="sa0" name="title"><option value="">' + esc(T('None')) + '</option>' + ['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx'].map(function (t) { return '<option' + (acc.title === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
          '<div class="two"><div class="field"><label for="sa1">' + esc(T('First name')) + '</label><input id="sa1" name="firstName" type="text" required value="' + esc(acc.firstName || '') + '" autocomplete="given-name"></div><div class="field"><label for="sa2">' + esc(T('Last name')) + '</label><input id="sa2" name="lastName" type="text" required value="' + esc(acc.lastName || '') + '" autocomplete="family-name"></div></div>' +
          '<p class="hint">' + esc(T('Changing your name here changes it on your account too.')) + '</p>' +
          '<div class="field"><label for="sa3">' + esc(T('Role or grade')) + '</label><input id="sa3" name="role" type="text" required value="' + esc(a.role || profile().grade || acc.role || '') + '" placeholder="' + esc(T('For example consultant in emergency medicine')) + '"></div>' +
          orgField('sa4', T('Organisation'), a.organisation || acc.organisation, a.organisationId || (a.organisation ? '' : acc.organisationId), true);
      }
      if (step === 'registration') {
        var regs = P.registrations || [];
        var own = regs.map(function (g) { return '<label class="pathcard"><input type="radio" name="regpick" value="' + g.id + '"' + (a.registrationId === g.id && !a.noRegistration ? ' checked' : '') + '><div><b>' + esc(g.regulatorShort + ' ' + g.number) + '</b><span>' + verifyChip(g.status) + '</span></div></label>'; }).join('');
        body = '<p class="small">' + esc(T('Who regulates you?')) + '</p>' + own +
          '<label class="pathcard"><input type="radio" name="regpick" value="new"' + (!regs.length && !a.noRegistration ? ' checked' : '') + '><div><b>' + esc(T('Add a registration')) + '</b></div></label>' +
          '<div id="regnew" class="card" hidden><div class="field"><label for="sr1">' + esc(T('Regulator')) + '</label><select id="sr1">' + cfg.regulators.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.short + ' · ' + g.name) + '</option>'; }).join('') + '</select></div><div class="field"><label for="sr2">' + esc(T('Profession')) + '</label><select id="sr2"></select></div><div class="field"><label for="sr3" id="sr3l">' + esc(T('Registration number')) + '</label><p class="hint" id="sr3h"></p><input id="sr3" type="text" autocomplete="off" autocapitalize="characters"></div></div>' +
          '<label class="pathcard"><input type="radio" name="regpick" value="none"' + (a.noRegistration ? ' checked' : '') + '><div><b>' + esc(T('I am not on a statutory register')) + '</b></div></label>' +
          '<div id="regnone" class="card" hidden><div class="field"><label for="sn1">' + esc(T('Why not?')) + '</label><textarea id="sn1" rows="3" placeholder="' + esc(T('For example: sonographer not registered with the HCPC, or an overseas regulator not listed here')) + '">' + esc(a.noRegistrationReason || '') + '</textarea></div><div class="field"><label for="sn2">' + esc(T('Overseas or other regulator and number (if any)')) + '</label><input id="sn2" type="text" value="' + esc(a.otherRegulator || '') + '"></div></div>' +
          '<p class="small muted">' + esc(T('The Wavelength team checks the official public register by hand. We never ask for a passport or driving licence.')) + '</p>';
      }
      if (step === 'experience') {
        var held = P.credentials || [];
        body = '<p class="small">' + esc(T('Ultrasound credentials you hold (optional). They are issued by the named bodies, not by Wavelength, and listing them does not imply their endorsement.')) + '</p>' +
          held.map(function (c) {
            var t = svEditable(cfg, c), on = a.credentialIds.indexOf(c.id) >= 0 ? ' checked' : '';
            if (!t) return '<label class="pathcard"><input type="checkbox" name="credId" value="' + c.id + '"' + on + '><div><b>' + esc(T(c.label)) + '</b><span>' + esc(c.issuer + ((c.moduleLabels || []).length ? ' · ' + c.moduleLabels.map(T).join(', ') : '')) + '</span> ' + verifyChip(c.status) + '</div></label>';
            // Modules of a credential already held stay editable: ticked as held, a change sends it to be checked again.
            return '<div class="pathcard" style="display:block"><label class="check"><input type="checkbox" name="credId" value="' + c.id + '"' + on + '><span><b>' + esc(T(c.label)) + '</b> · ' + esc(c.issuer) + '</span></label> ' + verifyChip(c.status) +
              '<div class="mods" data-held="' + c.id + '" style="margin:6px 0 0 30px">' + t.modules.map(function (m) { return '<label class="check"><input type="checkbox" name="hmod-' + c.id + '" value="' + esc(m.id) + '"' + (c.modules.indexOf(m.id) >= 0 ? ' checked' : '') + '><span>' + esc(T(m.label)) + '</span></label>'; }).join('') +
              '<p class="small muted" style="margin:6px 0 0">' + esc(T('Changing the modules sends this credential to be checked again. Your reference, dates and evidence stay.')) + '</p></div></div>';
          }).join('') +
          cfg.credentialTypes.filter(function (t) { return !held.some(function (c) { return c.type === t.id; }); }).map(function (t) { return '<div class="pathcard" style="display:block"><label class="check"><input type="checkbox" name="credType" value="' + esc(t.id) + '"><span><b>' + esc(T(t.label)) + '</b> · ' + esc(t.issuer) + '</span></label><div class="mods" data-for="' + esc(t.id) + '" hidden style="margin:6px 0 0 30px">' + t.modules.map(function (m) { return '<label class="check"><input type="checkbox" name="mod-' + esc(t.id) + '" value="' + esc(m.id) + '"' + (t.modules.length === 1 ? ' checked' : '') + '><span>' + esc(T(m.label)) + '</span></label>'; }).join('') + '</div></div>'; }).join('') +
          '<h3 style="margin:16px 0 8px">' + esc(T('Your experience')) + '</h3>' +
          '<div class="field"><label for="se1">' + esc(T('Years of ultrasound practice')) + '</label><select id="se1" name="years"><option value="">' + esc(T('Choose')) + '</option>' + cfg.bands.years.map(function (b) { return '<option value="' + esc(b) + '"' + (a.experience.years === b ? ' selected' : '') + '>' + esc(T(b)) + '</option>'; }).join('') + '</select></div>' +
          '<div class="field"><label for="se2b">' + esc(T('Approximate number of scans you have performed')) + '</label><select id="se2b" name="scans"><option value="">' + esc(T('Choose')) + '</option>' + cfg.bands.scans.map(function (b) { return '<option value="' + esc(b) + '"' + (a.experience.scans === b ? ' selected' : '') + '>' + esc(T(b)) + '</option>'; }).join('') + '</select></div>' +
          svYesNo('teaching', T('Do you teach ultrasound?'), a.experience.teaching) + svYesNo('supervision', T('Have you supervised trainees\' scanning before?'), a.experience.supervision) +
          '<div class="field"><label for="se5">' + esc(T('Departmental ultrasound role (optional)')) + '</label><input id="se5" name="deptRole" type="text" value="' + esc(a.experience.deptRole || '') + '" placeholder="' + esc(T('For example ultrasound lead')) + '"></div>';
      }
      if (step === 'evidence') {
        body = '<p class="small">' + esc(T('Choose either route. Both can be sent.')) + '</p>' +
          '<div class="card"><h3>' + esc(T('Upload supporting documents (recommended)')) + '</h3><p class="small muted">' + esc(T('A certificate, FAMUS, FUSIC or RCEM evidence, a course or trainer certificate, a letter from your employer or clinical ultrasound lead, or local credentialing. Up to five files, PDF, JPEG or PNG, 1 MB each.')) + '</p>' +
          '<ul class="small" id="evlist" style="padding-left:18px">' + a.evidence.map(function (e) { return '<li>' + esc(e.fileName || e.description || T(e.kind)) + (e.purged ? ' (' + esc(T('deleted after the decision')) + ')' : '') + ' <button type="button" class="link" data-evrm="' + e.id + '">' + esc(T('Remove')) + '</button></li>'; }).join('') + '</ul>' +
          (a.evidence.length < 5 ? '<div class="field"><label for="ev9">' + esc(T('Add a file')) + '</label><input id="ev9" type="file" accept="application/pdf,image/jpeg,image/png"></div><div class="field"><label for="ev8">' + esc(T('What is it?')) + '</label><select id="ev8"><option value="certificate">' + esc(T('Certificate')) + '</option><option value="letter">' + esc(T('Letter or email confirming the role')) + '</option><option value="institution">' + esc(T('NHS or institutional confirmation')) + '</option><option value="body_correspondence">' + esc(T('Correspondence from the awarding body')) + '</option><option value="other">' + esc(T('Other')) + '</option></select></div><div class="btns"><button type="button" class="btn sm" id="evup">' + esc(T('Upload')) + '</button></div>' : '') +
          '<p class="hint">' + esc(T('Only the Wavelength verification team sees your documents. Cover anything not needed, such as your date of birth or home address. Files are deleted 30 days after the decision.')) + '</p></div>' +
          '<div class="card"><h3>' + esc(T('Explain your experience and basis for supervising')) + '</h3><p class="small muted">' + esc(T('If you do not have documents available, tell us about your years of practice, current role, teaching, previous supervision, approximate scan numbers, leadership, courses taught and any local credentialing. Optional if you upload documents.')) + '</p><textarea id="sj" name="justification" rows="8" maxlength="6000">' + esc(a.justification || '') + '</textarea><p class="hint" id="sjc"></p></div>';
      }
      if (step === 'areas') {
        body = '<p class="small">' + esc(T('Which areas do you supervise? The Wavelength team matches these to pathway modules.')) + '</p>' +
          cfg.areas.map(function (x) { return '<label class="check"><input type="checkbox" name="area" value="' + esc(x.id) + '"' + (a.areas.indexOf(x.id) >= 0 ? ' checked' : '') + '><span>' + esc(T(x.label)) + '</span></label>'; }).join('') +
          '<h3 style="margin:16px 0 8px">' + esc(T('Which pathways do your trainees follow?')) + '</h3>' +
          cfg.pathways.map(function (x) { return '<label class="check"><input type="checkbox" name="pw" value="' + esc(x.id) + '"' + (a.pathways.indexOf(x.id) >= 0 ? ' checked' : '') + '><span>' + esc(T(x.label)) + '</span></label>'; }).join('');
      }
      if (step === 'changes') {
        body = '<p class="small">' + esc(T('Has anything changed in your professional circumstances since your last approval: your registration, role, organisation, credentials or the areas you supervise?')) + '</p>' +
          '<label class="check"><input type="checkbox" id="nc" name="nothingChanged" value="1"' + (a.nothingChanged ? ' checked' : '') + '><span>' + esc(T('Nothing material has changed')) + '</span></label>' +
          '<div class="field"><label for="cn">' + esc(T('What has changed')) + '</label><textarea id="cn" rows="4" maxlength="3000">' + esc(a.changesNote || '') + '</textarea></div>' +
          '<p class="small muted">' + esc(T('Anything that has expired or changed since your last approval needs updated information or evidence. Unchanged items need nothing new.')) + '</p>';
      }
      if (step === 'submit') {
        var dl = function (k, v) { return v ? '<dt>' + esc(T(k)) + '</dt><dd>' + esc(v) + '</dd>' : ''; };
        var reg = (P.registrations || []).filter(function (g) { return g.id === a.registrationId; })[0];
        body = '<div class="detail"><dl>' + dl('Name', acc.name) + dl('Role or grade', a.role) + dl('Organisation', a.organisation) +
          dl('Registration', a.noRegistration ? T('Not on a statutory register') : reg ? reg.regulatorShort + ' ' + reg.number : '') +
          dl('Years of ultrasound practice', a.experience.years ? T(a.experience.years) : '') + dl('Approximate number of scans', a.experience.scans ? T(a.experience.scans) : '') +
          dl('Documents', a.evidence.length ? String(a.evidence.length) : T('None')) + dl('Written explanation', a.justification ? T('{n} characters', { n: a.justification.length }) : '') +
          dl('Areas', a.areas.map(function (id) { return T((cfg.areas.filter(function (x) { return x.id === id; })[0] || { label: id }).label); }).join(', ')) +
          (a.kind === 'renewal' ? dl('What has changed', a.nothingChanged ? T('Nothing material has changed') : a.changesNote) : '') + '</dl></div>' +
          '<div class="card"><label class="check"><input type="checkbox" id="decl" name="declaration" value="1"><span>' + esc(T(cfg.declaration)) + '</span></label></div>';
      }
      mount(svShell(T(SV_STEP_LABEL[step]), prev, head + '<form id="svf" novalidate>' + body + foot + '</form>'));
      svBindStep(step, a, P);
      var f = $('#svf'), err = $('.err', f);
      var fail = function (msg) { busy($('button.teal', f), false); err.textContent = msg; err.hidden = false; scrollToField(err, true); };
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); err.hidden = true;
        var d = svCollect(step, f, a, P);
        if (typeof d === 'string') return fail(d);
        var b = $('button.teal', f); busy(b, true, step === 'submit' ? T('Sending…') : T('Saving…'));
        var send = step === 'submit' ? api('/api/app/supervisor/submit', { declaration: true }) : api('/api/app/supervisor/application', d);
        send.then(function (res) {
          if (!res.ok) { if (res.step && res.step !== step && step === 'submit') { toast(res.error, 5000); go('supervisor/apply/' + res.step); return; } return fail(res.error || T('Something went wrong.')); }
          if (res.application) { S.sup = S.sup || P; S.sup.application = res.application; }
          if (step === 'submit') { S.sup = null; svSent(res); return; }
          go(next());
        }).catch(function () { fail(T('Could not save. Check your connection.')); });
      });
    }).catch(function () { toast(T('Could not load. Check your connection.')); });
  }
  function svYesNo(name, label, v) {
    return '<div class="field"><span class="lab">' + esc(label) + '</span><div class="seg"><input type="radio" name="' + name + '" id="' + name + 'y" value="yes"' + (v === true ? ' checked' : '') + '><label for="' + name + 'y">' + esc(T('Yes')) + '</label><input type="radio" name="' + name + '" id="' + name + 'n" value="no"' + (v === false ? ' checked' : '') + '><label for="' + name + 'n">' + esc(T('No')) + '</label></div></div>';
  }
  function svBindStep(step, a, P) {
    if (step === 'about') bindOrg(app, 'sa4');
    if (step === 'registration') {
      var show = function () { var v = ($('input[name=regpick]:checked') || {}).value; $('#regnew').hidden = v !== 'new'; $('#regnone').hidden = v !== 'none'; };
      $$('input[name=regpick]').forEach(function (x) { x.onchange = show; }); show();
      var rg = $('#sr1'), setReg = function () { var g = P.config.regulators.filter(function (x) { return x.id === rg.value; })[0] || P.config.regulators[0]; $('#sr2').innerHTML = g.professions.map(function (x) { return '<option value="' + esc(x) + '">' + esc(T(x)) + '</option>'; }).join(''); $('#sr3l').textContent = T(g.numberLabel); $('#sr3h').textContent = T(g.numberHint); };
      rg.onchange = setReg; setReg();
    }
    if (step === 'experience') $$('input[name=credType]').forEach(function (x) { x.onchange = function () { $('.mods[data-for="' + x.value + '"]').hidden = !x.checked; }; });
    if (step === 'experience') $$('.mods[data-held] input').forEach(function (x) { x.addEventListener('change', function () { var id = x.closest('.mods').dataset.held, box = $('input[name=credId][value="' + id + '"]'); if (box) box.checked = true; }); });
    if (step === 'evidence') {
      var sj = $('#sj'), cnt = function () { $('#sjc').textContent = T('{n} characters', { n: sj.value.length }) + (a.evidence.length ? '' : ' · ' + T('at least 80 without documents')); };
      sj.oninput = cnt; cnt();
      $$('[data-evrm]').forEach(function (b) { b.onclick = function () { api('/api/app/supervisor/evidence/remove', { id: Number(b.dataset.evrm) }).then(function (res) { if (res.ok) { a.evidence = res.evidence; viewSupervisorApply(route()); } else toast(res.error); }); }; });
      var up = $('#evup'); if (up) up.onclick = function () {
        var file = $('#ev9').files[0]; if (!file) { toast(T('Choose a file first.')); return; }
        // Save the explanation typed so far, so the screen can redraw after the upload without losing it.
        var keep = sj.value;
        svShrink(file).then(function (blob) {
          if (blob.size > 1048576) { toast(T('Files can be up to 1 MB. Save a smaller PDF or photo.'), 4000); return; }
          busy(up, true, T('Uploading…'));
          var uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          var q = 'subject=application&id=' + a.id + '&kind=' + encodeURIComponent($('#ev8').value) + '&description=&name=' + encodeURIComponent(file.name) + '&uploadId=' + uid;
          return api('/api/app/supervisor/application', { justification: keep }).then(function (s1) {
            if (s1.application) a.id = s1.application.id;
            q = q.replace(/&id=[^&]*/, '&id=' + a.id);
            return NAT.net('/api/app/supervisor/evidence?' + q, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }).then(function (r) { return r.json(); });
          }).then(function (res) { busy(up, false); if (!res.ok) { toast(T(res.error || 'Something went wrong.'), 5000); return; } toast(T('Uploaded.')); S.sup = null; viewSupervisorApply(route()); });
        }).catch(function () { busy(up, false); toast(T('Could not upload. Check your connection.')); });
      };
    }
  }
  // Photos of certificates are shrunk on the phone (longest side 2000 px, JPEG) so they fit under 1 MB.
  function svShrink(file) {
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= 900000) return Promise.resolve(file);
    return new Promise(function (ok) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, 2000 / Math.max(img.width, img.height)); var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(function (b) { ok(b || file); }, 'image/jpeg', 0.85); };
      img.onerror = function () { URL.revokeObjectURL(u); ok(file); };
      img.src = u;
    });
  }
  // The credential type of a held credential when its modules can be changed here (more than one to choose from).
  function svEditable(cfg, c) {
    var t = ((cfg && cfg.credentialTypes) || []).filter(function (x) { return x.id === c.type; })[0];
    return t && t.modules.length > 1 && ['revoked', 'withdrawn'].indexOf(c.status) < 0 ? t : null;
  }
  // Reads one step into the fields saveDraft expects, or returns a message for the learner.
  function svCollect(step, f, a, P) {
    var v = function (id) { var el = $('#' + id, f); return el ? el.value.trim() : ''; };
    if (step === 'about') {
      if (!v('sa1') || !v('sa2')) return T('Enter your first and last name.');
      if (!v('sa3')) return T('Enter your role or grade.');
      if (!v('sa4')) return T('Enter your organisation.');
      var oid = $('input[name=organisationId]', f);
      return { title: v('sa0'), firstName: v('sa1'), lastName: v('sa2'), role: v('sa3'), organisation: v('sa4'), organisationId: oid && oid.value || null };
    }
    if (step === 'registration') {
      var pick = ($('input[name=regpick]:checked', f) || {}).value;
      if (!pick) return T('Choose your registration, add one, or tell us you are not on a statutory register.');
      if (pick === 'none') { if (v('sn1').length < 10) return T('Tell us briefly why you are not on a statutory register.'); return { noRegistration: { reason: v('sn1'), otherRegulator: v('sn2') } }; }
      if (pick === 'new') { if (!v('sr3')) return T('Enter your registration number.'); return { registration: { regulator: v('sr1'), profession: v('sr2'), number: v('sr3'), organisation: a.organisation || S.account.organisation || '', role: a.role || '' } }; }
      return { useRegistration: Number(pick) };
    }
    if (step === 'experience') {
      var creds = [], bad = '';
      $$('input[name=credType]:checked', f).forEach(function (x) { var mods = $$('input[name="mod-' + x.value + '"]:checked', f).map(function (m) { return m.value; }); if (!mods.length) bad = T('Choose at least one module for each credential you ticked.'); creds.push({ type: x.value, modules: mods }); });
      var amend = [];
      (P.credentials || []).forEach(function (c) {
        if (!svEditable(P.config, c) || !$('.mods[data-held="' + c.id + '"]', f)) return;
        var now = $$('input[name="hmod-' + c.id + '"]:checked', f).map(function (m) { return m.value; });
        if (!now.length) bad = T('Keep at least one module for each credential you hold.');
        var add = now.filter(function (m) { return c.modules.indexOf(m) < 0; }), remove = c.modules.filter(function (m) { return now.indexOf(m) < 0; });
        if (add.length || remove.length) amend.push({ id: c.id, add: add, remove: remove });
      });
      if (bad) return bad;
      var yn = function (n) { var c = $('input[name=' + n + ']:checked', f); return c ? c.value === 'yes' : null; };
      if (!v('se1') || !v('se2b')) return T('Answer how long you have practised ultrasound and roughly how many scans you have done.');
      var d = { credentialIds: $$('input[name=credId]:checked', f).map(function (x) { return Number(x.value); }), experience: { years: v('se1'), scans: v('se2b'), teaching: yn('teaching'), supervision: yn('supervision'), deptRole: v('se5') } };
      if (creds.length) d.credentials = creds;
      if (amend.length) d.credentialModules = amend;
      return d;
    }
    if (step === 'evidence') {
      var j = v('sj');
      if (!a.evidence.length && j.length < 80) return T('Upload a supporting document, or explain your experience and basis for supervising (at least 80 characters).');
      return { justification: j, evidenceMode: a.evidence.length && j ? 'both' : a.evidence.length ? 'documents' : 'explanation' };
    }
    if (step === 'areas') {
      var areas = $$('input[name=area]:checked', f).map(function (x) { return x.value; });
      if (!areas.length) return T('Choose at least one area you supervise.');
      return { areas: areas, pathways: $$('input[name=pw]:checked', f).map(function (x) { return x.value; }) };
    }
    if (step === 'changes') {
      var nc = $('#nc', f).checked, note = v('cn');
      if (!nc && !note) return T('Tell us what has changed, or confirm that nothing material has changed.');
      return { nothingChanged: nc, changesNote: note };
    }
    if (step === 'submit') { if (!$('#decl', f).checked) return T('Tick the declaration to send your application.'); return {}; }
    return {};
  }
  function svSent(res) {
    mount(svShell(T('Application sent'), 'supervisor', '<div class="card dark"><h3>' + esc(T(res.message || 'Your supervisor application is being reviewed.')) + '</h3><p class="muted small">' + esc(T(res.reviewTime || '')) + '</p></div><p class="small">' + esc(T('We have emailed you a copy. We will contact you if we need more information.')) + '</p><div class="btns"><a class="btn teal block" href="#/supervisor">' + esc(T('Done')) + '</a></div>'));
  }
  function viewSupervisorStop() {
    var cons = ['Your Wavelength supervisor status will end.', 'You will not be able to complete new supervisor sign-offs or assessments.', 'Existing valid sign-offs and assessments remain part of your trainees\' historical portfolios.', 'Your current trainees will need to arrange ongoing supervision. Wavelength will tell them, without giving a reason.', 'Outstanding supervision requests will no longer be actionable by you. They go back to your trainees.', 'You may apply again as a supervisor in the future.'];
    mount(svShell(T('Stop being a Wavelength supervisor'), 'supervisor',
      '<div class="card"><p class="small"><b>' + esc(T('Before you confirm:')) + '</b></p><ul class="small" style="padding-left:18px;margin:0">' + cons.map(function (c) { return '<li style="margin:4px 0">' + esc(T(c)) + '</li>'; }).join('') + '</ul></div>' +
      '<form id="stf" class="card"><div class="field"><label for="st1">' + esc(T('Reason (optional)')) + '</label><select id="st1">' + Object.keys(SV_REASONS).map(function (k) { return '<option value="' + k + '"' + (k === 'prefer_not_to_say' ? ' selected' : '') + '>' + esc(T(SV_REASONS[k])) + '</option>'; }).join('') + '</select><p class="hint">' + esc(T('Kept for Wavelength\'s records only. It is never shown to your trainees.')) + '</p></div>' +
      '<div class="field" id="st2w" hidden><label for="st2">' + esc(T('Tell us more (optional)')) + '</label><input id="st2" type="text" maxlength="500"></div>' +
      '<label class="check"><input type="checkbox" id="st3"><span>' + esc(T('I understand. Stop my Wavelength supervisor status now.')) + '</span></label><div class="err" hidden role="alert"></div>' +
      '<div class="btns"><button class="btn danger block">' + esc(T('Stop being a Wavelength supervisor')) + '</button><a class="btn ghost block" href="#/supervisor">' + esc(T('Keep my supervisor status')) + '</a></div><p class="small muted">' + esc(T('Your account and logbook are not affected.')) + '</p></form>'));
    $('#st1').onchange = function () { $('#st2w').hidden = this.value !== 'other'; };
    $('#stf').addEventListener('submit', function (ev) {
      ev.preventDefault(); var err = $('.err', this), b = $('button.danger', this); err.hidden = true;
      if (!$('#st3').checked) { err.textContent = T('Tick the box to confirm.'); err.hidden = false; return; }
      busy(b, true);
      api('/api/app/supervisor/stop', { confirm: true, reason: $('#st1').value, note: $('#st2').value }).then(function (res) {
        busy(b, false);
        if (!res.ok) { err.textContent = res.error || T('Something went wrong.'); err.hidden = false; return; }
        S.sup = null; loadLinks(); loadMe(); toast(T('Your Wavelength supervisor status has ended. We have emailed you a confirmation.'), 5000); go('supervisor');
      }).catch(function () { busy(b, false); err.textContent = T('Could not save. Check your connection.'); err.hidden = false; });
    });
  }

  // ---------- Requests that came back (decision 3): reassign, send to a one-off assessor, or cancel ----------
  function approvedLinks() { return activeSupervisors().filter(function (s) { return s.state === 'active' || s.state === 'not_verified' || !s.state; }); }
  function returnedSheet(kind, code, label) {
    var sups = approvedLinks();
    var path = kind === 'assessment' ? '/api/app/assessment/' : '/api/app/signoff/';
    sheet('<h2>' + esc(T('Send this request on')) + '</h2><p class="muted small">' + esc(T('{what} came back to you because the supervisor is no longer available. Nothing needs re-entering.', { what: label })) + '</p>' +
      (sups.length ? '<div class="field"><label for="rs1">' + esc(T('Another supervisor')) + '</label><select id="rs1">' + sups.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name || s.email || '') + '</option>'; }).join('') + '</select></div><div class="btns"><button class="btn teal block" data-rs="reassign">' + esc(T('Send to their dashboard')) + '</button></div>' : '<p class="small muted">' + esc(T('You have no other approved supervisor linked. Invite one under Me, Your supervisors, or send a one-off link.')) + '</p>') +
      '<div class="field" style="margin-top:12px"><label for="rs2">' + esc(T('One-off assessor name (optional)')) + '</label><input id="rs2" type="text"></div><div class="btns"><button class="btn block" data-rs="relink">' + esc(T('Create a one-off link')) + '</button><button class="btn ghost block" data-rs="cancel">' + esc(T('Cancel request')) + '</button></div><div class="err" hidden role="alert"></div>', function (root) {
      $$('[data-rs]', root).forEach(function (b) { b.onclick = function () {
        var act = b.dataset.rs, err = $('.err', root); err.hidden = true;
        var body = act === 'reassign' ? { code: code, supervisorLink: Number($('#rs1', root).value) } : act === 'relink' ? { code: code, supervisorName: $('#rs2', root).value } : { code: code };
        busy(b, true);
        api(path + act, body).then(function (res) {
          busy(b, false);
          if (!res.ok) { err.textContent = res.error || T('Something went wrong.'); err.hidden = false; return; }
          closeSheet();
          if (act === 'relink') linkReady({ link: res.link }, kind === 'assessment' ? T('Please complete my ultrasound assessment on Wavelength: {link}', { link: res.link }) : T('Please sign off my ultrasound scans in my Wavelength logbook: {link}', { link: res.link }), kind === 'assessment' ? T('Ultrasound assessment') : T('Ultrasound logbook sign-off'));
          else toast(act === 'reassign' ? T('Sent to their dashboard.') : T('Request cancelled.'));
          if (kind === 'assessment') loadAssessments().then(function () { render(true); }); else if (route().name === 'signoff') viewSignoff(route());
        }).catch(function () { busy(b, false); toast(T('Could not save. Check your connection.')); });
      }; });
    });
  }

  // ---------- Sheets ----------
  // Sheets are modal dialogs: focus stays inside until they close, Escape closes them, and focus returns to the
  // control that opened them.
  var sheetOpener = null;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function sheet(html, bind) {
    var opener = document.querySelector('.sheet-bg') ? sheetOpener : document.activeElement;
    closeSheet(true);
    sheetOpener = opener;
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab"></div>' + html + '</div>';
    var dlg = bg.firstChild, h2 = dlg.querySelector('h2');
    if (h2) { h2.id = h2.id || 'sh-' + Date.now().toString(36); dlg.setAttribute('aria-labelledby', h2.id); }
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) { if (e.target.closest('[data-fresh]')) draftImages = []; closeSheet(); } });
    bg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      var f = $$(FOCUSABLE, dlg).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) { e.preventDefault(); dlg.focus(); return; }
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === dlg)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    document.body.appendChild(bg);
    var first = bg.querySelector('input, button, a');
    setTimeout(function () { if (first && first.tagName === 'INPUT' && first.type !== 'checkbox' && first.type !== 'radio') first.focus(); else if (bg.isConnected && !dlg.contains(document.activeElement)) dlg.focus(); }, 50);
    if (bind) bind(bg);
  }
  // Escape closes the open sheet even before focus has moved into it (the sheet takes focus just after it opens).
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !e.defaultPrevented && document.querySelector('.sheet-bg') && !document.querySelector('.editor')) { e.preventDefault(); closeSheet(); } });
  function closeSheet(keepOpener) {
    var had = $$('.sheet-bg'); had.forEach(function (s) { s.remove(); });
    if (keepOpener || !had.length) return;
    var o = sheetOpener; sheetOpener = null;
    if (o && o.isConnected && o.focus) try { o.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
  }

  // ---------- Export ----------
  // Files are built in English, whatever the app language, so any assessor or portfolio can read them and the PDF
  // fonts carry every character. The screens around them follow the app language.
  function scansIn(pid) { var pw = PATHS[pid]; if (!pw || pid === 'general') return live().length; return live().filter(function (e) { return pw.modules.some(function (m) { return m.types.indexOf(e.type) >= 0; }); }).length; }
  function defaultDest() {
    var best = null, n = 0, p = myPaths();
    DESTS.forEach(function (x) { if (x.pathway && p.indexOf(x.pathway) >= 0) { var c = scansIn(x.pathway); if (c > n) { n = c; best = x.id; } } });
    return best || 'other';
  }
  function viewExport(r) {
    var ents = live(), first = ents.map(function (e) { return e.date; }).sort()[0] || today();
    var dest = (r && r.q.get('to')) || defaultDest();
    mount(shell({ title: T('Export'), back: 'log' },
      '<p class="muted small">' + esc(T('Exports build on this phone, in English so any assessor can read them. A verified summary sends only counts and dates to your account, never images or findings.')) + '</p><form id="xf">' +
      '<div class="field"><label for="ds">' + esc(T('Where is it going?')) + '</label><select id="ds" name="destination">' + DESTS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === dest ? ' selected' : '') + '>' + esc(T(x.label)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><span class="lab">' + esc(T('Format')) + '</span>' + seg('fmt', [{ id: 'pdf', label: 'PDF for your portfolio' }, { id: 'xlsx', label: 'Excel' }, { id: 'csv', label: 'CSV' }], 'pdf') + '</div>' +
      '<div class="two"><div class="field"><label for="from">' + esc(T('From')) + '</label><input type="date" id="from" name="from" value="' + first + '"></div><div class="field"><label for="to">' + esc(T('To')) + '</label><input type="date" id="to" name="to" value="' + today() + '"></div></div>' +
      '<div class="field"><label for="pw">' + esc(T('Pathway')) + '</label><select id="pw" name="pathway"><option value="">' + esc(T('All scans')) + '</option>' + myPaths().map(function (p) { return '<option value="' + p + '">' + esc(T('{p} scans only', { p: pwName(PATHS[p]) })) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="st">' + esc(T('Status')) + '</label><select id="st" name="status"><option value="">' + esc(T('All')) + '</option><option value="signed">' + esc(T('Signed off only')) + '</option></select></div>' +
      '<div class="field" id="evopt"><label class="check"><input type="checkbox" name="verified" value="1" checked><span>' + T('<b>Add a verified summary with a QR code.</b> Your supervisor, ARCP panel or accrediting body scans it to see your progress, sign-offs and assessments as Wavelength holds them. Needs internet.') + '</span></label></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="reflections" value="1" checked><span>' + esc(T('Include reflections')) + '</span></label></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="assessments" value="1" checked><span>' + esc(T('Include assessments')) + '</span></label></div>' +
      '<div class="field" id="imgopt"><label class="check"><input type="checkbox" name="images" value="1"><span>' + esc(T('Include images from this phone (PDF only, clips show their first frame). Check every image is free of identifiers before you share the file.')) + '</span></label></div>' +
      '<div class="err" hidden></div><button class="btn teal block">' + esc(T('Create export')) + '</button></form>'));
    var f = $('#xf');
    var tog = function () { var v = formData(f).fmt; $('#imgopt').hidden = v !== 'pdf'; $('#evopt').hidden = v === 'csv'; };
    var pickPath = function () { var x = DEST[$('#ds').value]; $('#pw').value = x && x.pathway && myPaths().indexOf(x.pathway) >= 0 && scansIn(x.pathway) ? x.pathway : ''; };
    $$('input[name=fmt]', f).forEach(function (i) { i.onchange = tog; });
    $('#ds').onchange = pickPath; pickPath();
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); var d = formData(f), b = $('button.teal', f), err = $('.err', f); err.hidden = true;
      var list = live().filter(function (e) {
        if (e.date < d.from || e.date > d.to) return false;
        if (d.status === 'signed' && !(e.signoff && e.signoff.status === 'confirmed')) return false;
        if (d.pathway && d.pathway !== 'general' && !PATHS[d.pathway].modules.some(function (m) { return m.types.indexOf(e.type) >= 0; })) return false;
        return true;
      }).sort(function (a, b2) { return a.date.localeCompare(b2.date); });
      if (!list.length) { err.textContent = T('No scans match those choices.'); err.hidden = false; return; }
      busy(b, true, d.verified && d.fmt !== 'csv' ? T('Creating your verified summary…') : T('Building your file…'));
      var evJob = d.verified && d.fmt !== 'csv' ? makeEvidence(d) : Promise.resolve(null);
      evJob.then(function (evd) {
        if (evd) b.textContent = T('Building your file…');
        var job = d.fmt === 'csv' ? Promise.resolve(exportCsv(list, d)) : d.fmt === 'xlsx' ? fetchSignoffs().then(function (so) { return exportXlsx(list, d, so, evd); }) : fetchSignoffs().then(function (so) { return exportPdf(list, d, so, evd); });
        return job.then(function (out) { return { out: out, ev: evd }; });
      }).then(function (res) { busy(b, false); deliver(res.out.blob, res.out.name, portfolioSteps(d.destination, res.ev)); })
        .catch(function (ex) { busy(b, false); err.textContent = ex.message || T('Could not build the file.'); err.hidden = false; });
    });
  }
  function makeEvidence(d) {
    if (!navigator.onLine) return Promise.reject(new Error(T('You are offline. Connect to the internet for a verified summary, or untick it.')));
    return sync().then(function () { return api('/api/app/evidence', { from: d.from, to: d.to, pathway: d.pathway || '', signedOnly: d.status === 'signed', destination: d.destination }); }).then(function (res) {
      if (!res.ok) throw new Error(res.error || T('Could not create the verified summary. Try again, or untick it.'));
      return res;
    });
  }
  function portfolioSteps(destId, evd) {
    var x = DEST[destId] || DEST.other; if (!x) return null;
    var html = '<div class="card" style="margin-top:16px;text-align:start"><h3>' + esc(x.id === 'other' ? T('Add it to your portfolio') : T('Add it to {dest}', { dest: T(x.label).replace(/ \(.*\)$/, '') })) + '</h3><ol class="steps">' + x.steps.map(function (t) { return '<li>' + esc(T(t)) + '</li>'; }).join('') + '</ol>' +
      (evd ? '<p class="small muted" style="margin-top:10px">' + T('Verification code <b>{code}</b>', { code: esc(evd.code) }) + '</p><div class="btns"><button class="btn sm" type="button" data-copyev>' + esc(T('Copy verification link')) + '</button><a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(evd.link) + '">' + esc(T('Open it')) + '</a></div>' : '') + '</div>';
    return { html: html, bind: function (root) { var c = $('[data-copyev]', root); if (c) c.onclick = function () { copy(evd.link); }; } };
  }
  function viewEvidence() {
    mount(shell({ title: T('Verified summaries'), back: 'me' }, '<p class="muted small">' + esc(T('Each verified summary has a code a reviewer checks online. Withdraw one you no longer want people to see. The code then shows as withdrawn.')) + '</p><div id="evl"><div class="card"><p class="muted small">' + esc(T('Loading…')) + '</p></div></div><a class="btn teal block" href="#/export">' + esc(T('Create a new export')) + '</a>'));
    api('/api/app/evidence').then(function (res) {
      var box = $('#evl'); if (!box) return;
      var rows = res.evidence || [];
      if (!res.ok) { box.innerHTML = '<div class="card"><p class="muted small">' + esc(T('Connect to the internet to see your verified summaries.')) + '</p></div>'; return; }
      if (!rows.length) { box.innerHTML = '<div class="card"><p class="muted small">' + esc(T('None yet. Tick "Add a verified summary" when you export your logbook.')) + '</p></div>'; return; }
      box.innerHTML = rows.map(function (x) {
        return '<div class="card"><div class="row"><div class="grow"><b>' + esc(x.id) + '</b><p class="small muted" style="margin:2px 0 0">' + esc(T((DEST[x.destination] || {}).label || 'Portfolio')) + '<br>' + esc(T('{from} to {to} · created {at}', { from: fmt(x.period_from), to: fmt(x.period_to), at: fmt(x.created_at) })) + '</p></div><span class="chip ' + (x.withdrawn ? 'amber' : 'green') + '">' + esc(x.withdrawn ? T('Withdrawn') : T('Live')) + '</span></div>' +
          (x.withdrawn ? '' : '<div class="btns"><button class="btn sm" data-copy="' + esc(x.id) + '">' + esc(T('Copy link')) + '</button><button class="btn sm ghost" data-wd="' + esc(x.id) + '">' + esc(T('Withdraw')) + '</button></div>') + '</div>';
      }).join('');
      $$('[data-copy]', box).forEach(function (bt) { bt.onclick = function () { copy(NAT.origin + '/app/verify/?code=' + bt.dataset.copy); }; });
      $$('[data-wd]', box).forEach(function (bt) { bt.onclick = function () { if (!confirm(T('Withdraw {code}? Anyone who checks this code will see it is withdrawn.', { code: bt.dataset.wd }))) return; api('/api/app/evidence/withdraw', { code: bt.dataset.wd }).then(function () { toast(T('Withdrawn.')); viewEvidence(); }); }; });
    });
  }
  function fetchSignoffs() { return navigator.onLine ? api('/api/app/signoffs').then(function (r) { return r.signoffs || []; }).catch(function () { return []; }) : Promise.resolve([]); }
  // In the App Store and Google Play shells, web downloads and Web Share do not work inside the WebView,
  // so files go through the native Filesystem and Share plugins (mobile/), saved to the app cache first.
  var NATIVE = NAT.on ? { Filesystem: NAT.plugin('Filesystem'), Share: NAT.plugin('Share') } : null;
  function nativeShare(blob, name) {
    return new Promise(function (ok, fail) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = fail; r.readAsDataURL(blob); })
      .then(function (data) { return NATIVE.Filesystem.writeFile({ path: name.replace(/[^\w.-]+/g, '-'), data: data, directory: 'CACHE' }); })
      .then(function (w) { return NATIVE.Share.share({ title: name, files: [w.uri] }); })
      .catch(function (e) { if (!/cancel/i.test(String(e && e.message))) toast(T('Could not share the file.')); });
  }
  function deliver(blob, name, extra) {
    if (NATIVE && NATIVE.Share && NATIVE.Filesystem) {
      return sheet('<h2>' + esc(T('Your file is ready')) + '</h2><p class="muted small">' + esc(name) + ' · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB</p><div class="btns"><button class="btn teal block" data-share>' + I.share + ' ' + esc(T('Share or save')) + '</button><button class="btn ghost block" data-close>' + esc(T('Close')) + '</button></div>' + (extra ? extra.html : ''), function (root) {
        if (extra && extra.bind) extra.bind(root);
        $('[data-share]', root).onclick = function () { nativeShare(blob, name); };
      });
    }
    var file; try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
    var url = URL.createObjectURL(blob);
    var canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
    sheet('<h2>' + esc(T('Your file is ready')) + '</h2><p class="muted small">' + esc(name) + ' · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB</p><div class="btns">' + (canShare ? '<button class="btn teal block" data-share>' + I.share + ' ' + esc(T('Share or save')) + '</button>' : '') + '<a class="btn ' + (canShare ? 'ghost' : 'teal') + ' block" href="' + url + '" download="' + esc(name) + '">' + esc(T('Download')) + '</a><button class="btn ghost block" data-close>' + esc(T('Close')) + '</button></div>' + (extra ? extra.html : ''), function (root) {
      if (extra && extra.bind) extra.bind(root);
      var sh = $('[data-share]', root); if (sh) sh.onclick = function () { navigator.share({ files: [file], title: name }).catch(function () {}); };
    });
  }
  function dateStamp() { return today(); }
  function fmtEn(iso, o) { if (!iso) return ''; return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', o || { day: 'numeric', month: 'short', year: 'numeric' }); }
  function pl(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }
  function rowsFor(list, d) {
    var head = ['Date', 'Application', 'Setting', 'Age band', 'Sex', 'Indication', 'Findings', 'Overall', 'Image quality', 'Interpretation', 'Confirmed by', 'Agreement', 'Impact', 'Supervision', 'Supervisor', 'Images and clips', 'Sign-off', 'Signed by', 'Sign-off date', 'Sign-off code', 'Supervisor rating'];
    if (d.reflections) head.push('Reflection');
    var Q = { g: 'Good', a: 'Acceptable', r: 'Not acceptable' };
    var rows = list.map(function (e) {
      var so = e.signoff || {};
      var f = e.findings || {}, t = TYPES[e.type] || { fields: [] };
      var findings = t.fields.filter(function (fd) { return f[fd.id] != null && f[fd.id] !== ''; }).map(function (fd) { return fd.label + ': ' + (Array.isArray(f[fd.id]) ? f[fd.id].join(', ') : f[fd.id]) + (fd.unit ? ' ' + fd.unit : ''); }).join('; ');
      var rt = so.rating ? [so.rating.image ? 'Image ' + Q[so.rating.image] : '', so.rating.accuracy ? 'Accuracy ' + Q[so.rating.accuracy] : ''].filter(Boolean).join(', ') : '';
      var r = [e.date, t.label || e.type, e.setting, e.age, e.sex, e.indication, findings, e.overall, e.quality, e.interpretation, e.confirmation, e.concordant, e.impact, SUP[e.supervision] || '', e.supervisor, (e.images || []).length, so.status === 'confirmed' ? 'Signed off' : waiting(e) ? 'Awaiting' : e.noSignoff ? 'Not needed' : so.status === 'query' ? 'Queried' : 'Not sent', so.name ? so.name + (so.role ? ', ' + so.role : '') : '', so.at ? so.at.slice(0, 10) : '', so.code || '', rt];
      if (d.reflections) r.push(e.reflection || '');
      return r.map(function (x) { return x == null ? '' : x; });
    });
    return { head: head, rows: rows };
  }
  function asmRows(from, to) {
    return signedAssessments().filter(function (a) { return (a.assessed_on || '') >= from && (a.assessed_on || '') <= to; }).map(function (a) {
      var m = (PATHS[a.pathway] || { modules: [] }).modules.find(function (x) { return x.id === a.module; });
      return [a.id, a.assessed_on, (PATHS[a.pathway] || {}).label || a.pathway, m ? m.label : a.module, (KIND[a.kind] || {}).label || a.kind, (OUTCOME[a.outcome] || {}).label || a.outcome, a.supervisor_name + (a.supervisor_role ? ', ' + a.supervisor_role : ''), a.method === 'in-person' ? 'In person' : a.method === 'dashboard' ? 'Dashboard' : 'By link'];
    });
  }
  function exportCsv(list, d) {
    var t = rowsFor(list, d);
    var cell = function (v) { var s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    var csv = '﻿' + [t.head].concat(t.rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    return { blob: new Blob([csv], { type: 'text/csv' }), name: 'Wavelength-logbook-' + dateStamp() + '.csv' };
  }
  function needEn(s) { return s.met ? 'Target met' : s.needs.length ? s.needs.join(', ') + ' needed' : ''; }
  function summaryRows(list) {
    var rows = [['Pathway', 'Module', 'Scan target', 'Counted', 'Supervised target', 'Directly supervised', 'Signed off', 'Still needed', 'Status']];
    myPaths().forEach(function (pid) {
      var pw = PATHS[pid];
      ENG.modulesFor(pid, list, profile().targets).forEach(function (m) { var s = moduleStats(pw, m, list); rows.push([pw.label, m.label, s.total || '', s.counted, s.sup || '', s.supervised, s.signed, needEn(s), s.met ? 'Met' : (s.total || s.gaps.length) ? s.percent + '%' : '']); });
    });
    return rows;
  }
  function exportXlsx(list, d, signoffs, evd) {
    var t = rowsFor(list, d);
    var acc = S.account;
    var sheets = [
      { name: 'Progress', rows: evd ? [['Pathway', 'Module', 'Scan target', 'Counted', 'Supervised target', 'Directly supervised', 'Signed off', 'Status']].concat(evRows(evd)) : summaryRows(list), widths: [12, 34, 12, 10, 16, 18, 12, 44, 10] },
      { name: 'Scans', rows: [t.head].concat(t.rows), widths: [11, 24, 18, 10, 8, 26, 50, 12, 12, 40, 18, 12, 30, 22, 20, 7, 12, 28, 12, 16, 24, 50] },
      { name: 'Sign-offs', rows: [['Code', 'Date', 'Supervisor', 'Role', 'Registration', 'Accreditation', 'Method', 'Scans', 'Confirmed', 'Comment']].concat(signoffs.filter(function (s) { return s.status === 'signed'; }).map(function (s) { return [s.id, (s.signed_at || '').slice(0, 10), s.supervisor_name, s.supervisor_role, s.supervisor_reg || '', s.accreditation || '', s.method, s.entry_ids.length, Object.values(s.decisions || {}).filter(function (x) { return x === 'confirmed'; }).length, s.comment || '']; })), widths: [16, 11, 24, 30, 14, 30, 10, 7, 9, 50] }
    ];
    if (d.assessments) sheets.push({ name: 'Assessments', rows: [['Code', 'Date', 'Pathway', 'Module', 'Type', 'Outcome', 'Assessor', 'Method']].concat(asmRows(d.from, d.to)), widths: [16, 11, 10, 30, 30, 40, 30, 12] });
    sheets.push({ name: 'About', rows: [['Wavelength ultrasound logbook', ''], ['Name', acc.name], ['Email', acc.email], ['Grade or role', profile().grade || acc.role || ''], ['Registration', profile().registration || ''], ['Period', fmtEn(d.from) + ' to ' + fmtEn(d.to)], ['Scans', list.length], ['Generated', fmtEn(today())], ['Verified summary', evd ? evd.code : 'Not created'], ['Check it at', evd ? evd.link : NAT.host + '/verify'], ['Patient data', 'This record holds no patient identifiers.']], widths: [22, 60] });
    return { blob: WLZip.xlsx(sheets), name: 'Wavelength-logbook-' + dateStamp() + '.xlsx' };
  }
  function blobToDataUrl(b) { return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.readAsDataURL(b); }); }
  function qrPng(text, px) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = 4, sz = Math.max(3, Math.floor((px || 360) / (n + 2 * m)));
    var c = document.createElement('canvas'); c.width = c.height = (n + 2 * m) * sz;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#0F1E33';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + m) * sz, (r + m) * sz, sz, sz);
    return c.toDataURL('image/png');
  }
  function verifyUrl(code) { return NAT.origin + '/app/verify/?code=' + code; }
  function evRows(evd) {
    var rows = [];
    evd.summary.pathways.forEach(function (p) {
      p.modules.forEach(function (m) {
        rows.push([p.label, m.label + (m.ownTarget ? ' *' : ''), m.total || '', m.counted, m.supTarget || '', m.supervised, m.signed, m.met ? 'Target met' : (m.needs || []).length ? m.needs.join(', ') + ' needed' : pl(m.logged, 'scan') + ' logged']);
      });
    });
    return rows;
  }
  // Images for PDFs: stills as they are, clips as their first frame.
  function pdfImage(r) { return blobToDataUrl(isClip(r) ? r.thumb : r.blob).then(function (u) { return { u: u, w: r.w, h: r.h, clip: isClip(r) }; }); }
  function exportPdf(list, d, signoffs, evd) {
    var load = (window.jspdf ? Promise.resolve() : loadScript('/app/vendor/jspdf.umd.min.js').then(function () { return loadScript('/app/vendor/jspdf.plugin.autotable.min.js'); })).then(function () { return window.qrcode ? null : loadScript('/app/vendor/qrcode.js'); });
    return load.then(function () { return fetch('/assets/logo-192.png').then(function (r) { return r.blob(); }).then(blobToDataUrl).catch(function () { return null; }); }).then(function (logo) {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      var W = 210, navy = [15, 30, 51], teal = [42, 127, 138], acc = S.account;
      if (d.single) return singleCase(doc, list[0], d, logo);
      doc.setFillColor.apply(doc, navy); doc.rect(0, 0, W, 62, 'F');
      if (logo) doc.addImage(logo, 'PNG', 16, 14, 20, 20);
      doc.setTextColor(247, 245, 240); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('W A V E L E N G T H', 42, 24);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text('TUNE IN  ·  GAIN CLARITY', 42, 30);
      doc.setFontSize(24); doc.text('Ultrasound logbook', 16, 50);
      doc.setTextColor(15, 30, 51); doc.setFontSize(11);
      var info = [['Name', acc.name], ['Grade or role', profile().grade || acc.role || ''], ['Organisation', acc.organisation || ''], ['Pathways', myPaths().map(function (p) { return PATHS[p].label; }).join(', ')], ['Period', fmtEn(d.from) + ' to ' + fmtEn(d.to)], ['Scans in this export', String(list.length)], ['Generated', fmtEn(today(), { day: 'numeric', month: 'long', year: 'numeric' })]];
      doc.autoTable({ startY: 72, body: info, theme: 'plain', styles: { fontSize: 10.5, cellPadding: 1.6 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: teal } } });
      var y = doc.lastAutoTable.finalY + 8;
      if (evd) {
        doc.setFillColor(237, 234, 227); doc.roundedRect(16, y, W - 32, 44, 2, 2, 'F');
        doc.addImage(qrPng(evd.link, 360), 'PNG', W - 56, y + 3, 38, 38);
        doc.setTextColor.apply(doc, teal); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('VERIFIED SUMMARY', 22, y + 9);
        doc.setTextColor.apply(doc, navy); doc.setFontSize(16); doc.text(evd.code, 22, y + 18);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(doc.splitTextToSize('Scan the QR code, or enter the code at ' + NAT.host + '/verify, to see this summary as Wavelength holds it. The progress figures, sign-offs and assessments come from the learner\'s synced logbook on the Wavelength server, not from this file. Created ' + fmtEn(evd.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) + '.', W - 32 - 54), 22, y + 25);
        y += 52;
      }
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, navy); doc.text('Summary of training', 16, y);
      var sum = evd ? [['Pathway', 'Module', 'Scan target', 'Counted', 'Supervised target', 'Directly supervised', 'Signed off', 'Still needed']].concat(evRows(evd)) : summaryRows(list);
      var own = evd && evd.summary.pathways.some(function (p) { return p.modules.some(function (m) { return m.ownTarget; }); });
      doc.autoTable({ startY: y + 4, head: [sum[0].slice(0, 8)], body: sum.slice(1).map(function (r) { return r.slice(0, 8); }), styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: navy }, didParseCell: function (h) { if (h.section === 'body' && h.column.index === 7) { var met = /met/i.test(h.cell.raw); h.cell.styles.textColor = met ? [46, 125, 91] : [180, 69, 58]; } } });
      if (own) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(91, 104, 120); doc.text('* The learner set their own target for this module, which differs from the curriculum figure.', 16, doc.lastAutoTable.finalY + 5); }
      doc.addPage(); doc.setTextColor.apply(doc, navy);
      doc.setFontSize(14); doc.text('Scan log', 16, 18);
      var t = rowsFor(list, d);
      var body = list.map(function (e, i) { var r = t.rows[i]; return [r[0], r[1], [r[2], r[3], r[4]].filter(Boolean).join(', '), r[5], r[6] + (r[7] ? '\nOverall: ' + r[7] : '') + (r[9] ? '\n' + r[9] : ''), r[13] + (r[14] ? '\n' + r[14] : ''), r[16] + (r[17] ? '\n' + r[17] + '\n' + r[18] + '\n' + r[19] : '') + (r[20] ? '\n' + r[20] : '')]; });
      doc.autoTable({ startY: 22, head: [['Date', 'Application', 'Setting, age, sex', 'Indication', 'Findings and interpretation', 'Supervision', 'Sign-off']], body: body, styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: navy }, columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { cellWidth: 24 }, 4: { cellWidth: 55 }, 5: { cellWidth: 20 }, 6: { cellWidth: 22 } } });
      if (d.reflections && list.some(function (e) { return e.reflection; })) {
        doc.addPage(); doc.setFontSize(14); doc.text('Reflective notes', 16, 18);
        doc.autoTable({ startY: 22, head: [['Date', 'Application', 'Reflection']], body: list.filter(function (e) { return e.reflection; }).map(function (e) { return [e.date, (TYPES[e.type] || {}).label, e.reflection]; }), styles: { fontSize: 8.5, cellPadding: 2, valign: 'top' }, headStyles: { fillColor: navy }, columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 34 } } });
      }
      var ar = d.assessments ? asmRows(d.from, d.to) : [];
      if (ar.length) {
        doc.addPage(); doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Assessment register', 16, 18);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Verify any code at ' + NAT.host + '/verify, or scan its QR code', 16, 24);
        var aq = ar.map(function (r) { return qrPng(verifyUrl(r[0]), 200); });
        doc.autoTable({ startY: 28, head: [['Code', 'Date', 'Pathway and module', 'Type', 'Outcome', 'Assessor', 'Verify']], body: ar.map(function (r) { return [r[0], r[1], r[2] + '\n' + r[3], r[4], r[5], r[6] + '\n' + r[7], '']; }), styles: { fontSize: 7.5, cellPadding: 1.6, valign: 'middle', minCellHeight: 18 }, headStyles: { fillColor: navy }, columnStyles: { 6: { cellWidth: 18 } },
          didDrawCell: function (h) { if (h.section === 'body' && h.column.index === 6) { try { doc.addImage(aq[h.row.index], 'PNG', h.cell.x + 1.5, h.cell.y + 1.5, 15, 15); } catch (e) { /* skip */ } } } });
      }
      var ids = {}; list.forEach(function (e) { if (e.signoff && e.signoff.code) ids[e.signoff.code] = 1; });
      var sos = signoffs.filter(function (s) { return s.status === 'signed' && ids[s.id]; });
      if (sos.length) {
        doc.addPage(); doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Sign-off register', 16, 18);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Verify any code at ' + NAT.host + '/verify, or scan its QR code', 16, 24);
        var qrs = sos.map(function (s) { return qrPng(verifyUrl(s.id), 200); });
        doc.autoTable({ startY: 28, head: [['Code', 'Date', 'Supervisor', 'Registration', 'Accreditation', 'Method', 'Scans', 'Signature', 'Verify']], body: sos.map(function (s) { return [s.id, (s.signed_at || '').slice(0, 10), s.supervisor_name + (s.supervisor_role ? '\n' + s.supervisor_role : ''), s.supervisor_reg || '', s.accreditation || '', (s.method === 'in-person' ? 'In person' : s.method === 'dashboard' ? 'Dashboard' : 'By link') + (s.basis ? '\n' + ({ witnessed: 'Witnessed', reviewed: 'Reviewed images', both: 'Witnessed and reviewed' })[s.basis] : ''), String(s.entry_ids.length), '', '']; }), styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle', minCellHeight: 18 }, headStyles: { fillColor: navy }, columnStyles: { 7: { cellWidth: 30 }, 8: { cellWidth: 18 } },
          didDrawCell: function (h) { if (h.section === 'body' && h.column.index === 8) { try { doc.addImage(qrs[h.row.index], 'PNG', h.cell.x + 1.5, h.cell.y + 1.5, 15, 15); } catch (e) { /* skip */ } } if (h.section === 'body' && h.column.index === 7) { var s = sos[h.row.index]; if (s && s.signature) { try { doc.addImage(s.signature, 'PNG', h.cell.x + 1, h.cell.y + 1, 28, Math.min(h.cell.height - 2, 12)); } catch (e) { /* skip */ } if (s.signatureKind === 'typed') { doc.setFontSize(6.5); doc.setTextColor(91, 104, 120); doc.text('Typed signature', h.cell.x + 1, h.cell.y + h.cell.height - 1.5); } } } } });
      }
      var withImg = d.images ? list.filter(function (e) { return (e.images || []).length; }) : [];
      var addImages = withImg.reduce(function (p, e) {
        return p.then(function () { return imagesFor(e.id); }).then(function (recs) {
          if (!recs.length) return;
          return Promise.all(recs.map(pdfImage)).then(function (imgs) {
            doc.addPage(); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(((TYPES[e.type] || {}).label || e.type) + ', ' + fmtEn(e.date), 16, 18);
            var x = 16, yy = 24, colW = 86;
            imgs.forEach(function (im, i) { var h = colW * im.h / im.w; if (h > 110) h = 110; var w = h * im.w / im.h; if (yy + h > 282) { doc.addPage(); yy = 18; } doc.addImage(im.u, 'JPEG', x, yy, w, h); if (im.clip) { doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text('Clip, first frame', x, yy + h + 3); } if (i % 2 === 0) { x = 16 + colW + 6; } else { x = 16; yy += 116; } });
          });
        });
      }, Promise.resolve());
      return addImages.then(function () {
        var n = doc.getNumberOfPages();
        for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 130, 145); doc.text('Wavelength ultrasound logbook · ' + acc.name + ' · Page ' + i + ' of ' + n, 16, 290); doc.text('This record holds no patient identifiers. ' + (evd ? 'Verified summary ' + evd.code + '. ' : '') + 'Codes verify at ' + NAT.host + '/verify', 16, 294); }
        return { blob: doc.output('blob'), name: 'Wavelength-logbook-' + dateStamp() + '.pdf' };
      });
    });
  }
  function singleCase(doc, e, d, logo) {
    var navy = [15, 30, 51], teal = [42, 127, 138], t = TYPES[e.type] || { label: e.type, fields: [] }, f = e.findings || {};
    doc.setFillColor.apply(doc, navy); doc.rect(0, 0, 210, 30, 'F');
    if (logo) doc.addImage(logo, 'PNG', 14, 7, 16, 16);
    doc.setTextColor(247, 245, 240); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('W A V E L E N G T H', 34, 14); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('ULTRASOUND CASE', 34, 20);
    doc.setTextColor(15, 30, 51); doc.setFontSize(20); doc.text(t.label, 14, 44);
    doc.setFontSize(10); doc.setTextColor(91, 104, 120); doc.text([fmtEn(e.date, { day: 'numeric', month: 'long', year: 'numeric' }), e.setting, e.age, e.sex].filter(Boolean).join('  ·  '), 14, 51);
    var rows = [['Indication', e.indication || '']].concat(t.fields.filter(function (fd) { return f[fd.id] != null && f[fd.id] !== ''; }).map(function (fd) { return [fd.label, (Array.isArray(f[fd.id]) ? f[fd.id].join(', ') : f[fd.id]) + (fd.unit ? ' ' + fd.unit : '')]; }))
      .concat([['Overall', e.overall || ''], ['Image quality', e.quality || ''], ['Interpretation', e.interpretation || ''], ['Confirmed by', [e.confirmation, e.concordant].filter(Boolean).join(', ')], ['Impact', e.impact || '']]);
    if (d.reflections && e.reflection) rows.push(['Reflection', e.reflection]);
    var so = e.signoff && e.signoff.status === 'confirmed' && e.signoff.code ? e.signoff : null;
    if (so) { rows.push(['Signed off', so.name + (so.role ? ', ' + so.role : '') + ', ' + fmtEn(so.at) + '. Code ' + so.code + '. Scan the QR code to verify.']); try { doc.addImage(qrPng(verifyUrl(so.code), 240), 'PNG', 176, 3, 24, 24); } catch (x) { /* skip */ } }
    doc.autoTable({ startY: 58, body: rows.filter(function (r) { return r[1]; }), theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2.2, valign: 'top' }, columnStyles: { 0: { fontStyle: 'bold', textColor: teal, cellWidth: 46 } } });
    var y = doc.lastAutoTable.finalY + 8;
    var done = function () { doc.setFontSize(7.5); doc.setTextColor(120, 130, 145); doc.text('Shared from the Wavelength ultrasound logbook. Holds no patient identifiers. thewavelength.co.uk', 14, 290); return { blob: doc.output('blob'), name: 'case.pdf' }; };
    if (!d.images) return done();
    return imagesFor(e.id).then(function (recs) { return Promise.all(recs.map(pdfImage)); }).then(function (imgs) {
      var x = 14, colW = 88;
      imgs.forEach(function (im, i) { var h = Math.min(100, colW * im.h / im.w), w = h * im.w / im.h; if (y + h > 282) { doc.addPage(); y = 16; } doc.addImage(im.u, 'JPEG', x, y, w, h); if (i % 2 === 0) x = 14 + colW + 6; else { x = 14; y += h + 6; } });
      return done();
    });
  }

  // ---------- Backup to the learner's own cloud ----------
  // ---------- Back up and restore (encrypted, src/app/backup.js) ----------
  // A backup holds this device's logbook entries, photos and clips in one file encrypted with a passphrase the
  // learner chooses. Wavelength never receives the file or the passphrase, and cannot recover a forgotten one.
  var BK_MIN = 10;
  function viewBackup() {
    all('images').then(function (imgs) {
      var size = imgs.reduce(function (s, r) { return s + (r.blob ? r.blob.size : 0) + (r.thumb ? r.thumb.size : 0); }, 0);
      var clips = imgs.filter(isClip).length, n = pendingList().length;
      var last = S.kv.lastBackup;
      mount(shell({ title: T('Back up and restore'), back: 'me', tab: 'me' },
        '<div class="card"><h3>' + esc(T('What a backup holds')) + '</h3><p class="small muted">' + esc(T('Your logbook entries, photos and clips from this device, in one file encrypted with a passphrase you choose. Photos and clips are kept only on this device, so a backup is their only copy anywhere else.')) + '</p>' +
        '<p class="small muted">' + esc(n ? N(n, '{n} entry has not synced to your Wavelength account yet. It is included in the backup.', '{n} entries have not synced to your Wavelength account yet. They are included in the backup.') : T('Logbook entries also sync to your Wavelength account. Photos and clips do not.')) + ' ' + esc(T('Wavelength never receives the backup file or your passphrase.')) + '</p>' +
        '<p class="small" style="margin:0"><b>' + esc(plural(imgs.length - clips, 'image') + (clips ? ' · ' + plural(clips, 'clip') : '')) + '</b> · ' + (size / 1048576).toFixed(1) + ' MB · ' + esc(last ? T('Last backup file created {date}', { date: fmt(last) }) : T('No backup file created on this device yet')) + '</p></div>' +
        '<h2 class="sec">' + esc(T('Create an encrypted backup')) + '</h2><form class="card" id="bkf" novalidate>' +
        '<div class="field"><label for="bkp">' + esc(T('Backup passphrase')) + '</label><p class="hint">' + esc(T('At least {n} characters. A few unrelated words are easy to remember and hard to guess.', { n: BK_MIN })) + '</p><input id="bkp" type="password" autocomplete="new-password" minlength="' + BK_MIN + '" required></div>' +
        '<div class="field"><label for="bkp2">' + esc(T('Type the passphrase again')) + '</label><input id="bkp2" type="password" autocomplete="new-password" required></div>' +
        '<label class="check"><input type="checkbox" id="bkok"><span>' + esc(T('I understand that Wavelength cannot recover a forgotten passphrase, and without it the backup cannot be opened.')) + '</span></label>' +
        '<div class="err" hidden style="margin-top:12px"></div><p class="small muted bk-progress" role="status" hidden></p>' +
        '<div class="btns"><button class="btn teal block" id="bk"' + (imgs.length || live().length ? '' : ' disabled') + '>' + I.cloud + ' ' + esc(T('Create encrypted backup')) + '</button></div>' +
        '<p class="small muted" style="margin-top:10px">' + esc(T('You choose where to save the file: Files or iCloud Drive on iPhone, Google Drive or OneDrive on Android, or your computer. The file stays encrypted wherever you keep it, and whoever can open that storage can copy the file but not read it without the passphrase.')) + '</p></form>' +
        '<h2 class="sec">' + esc(T('Restore from a backup')) + '</h2><div class="card"><p class="small muted">' + esc(T('Choose a Wavelength backup file. Entries and media already on this device are kept as they are; only missing ones are added. Older unencrypted backups (.zip) can still be restored.')) + '</p><input type="file" id="rf" hidden><button class="btn ghost" id="rb" type="button">' + esc(T('Choose backup file')) + '</button><p class="small muted bk-rprogress" role="status" hidden></p></div>' +
        (standalone ? '' : '<div class="card"><h3>' + esc(T('Keep photos safe on this phone')) + '</h3><p class="small muted">' + esc(T('Add Wavelength to your home screen. On iPhone, Safari clears storage for websites you have not opened for a while; home screen apps are exempt.')) + '</p>' + installButton(T('Add to home screen')) + '</div>')));
      var f = $('#bkf'), err = $('.err', f), prog = $('.bk-progress', f);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); err.hidden = true;
        var p1 = $('#bkp').value, p2 = $('#bkp2').value;
        var bad = p1.length < BK_MIN ? T('Use at least {n} characters.', { n: BK_MIN }) : p1 !== p2 ? T('The passphrases do not match.') : !$('#bkok').checked ? T('Tick the box to confirm you understand the passphrase cannot be recovered.') : '';
        if (bad) { err.textContent = bad; err.hidden = false; return; }
        var b = $('#bk'); busy(b, true, T('Creating backup…')); prog.hidden = false;
        makeBackup(p1, function (msg) { prog.textContent = msg; }).then(function (out) {
          $('#bkp').value = ''; $('#bkp2').value = ''; busy(b, false); prog.hidden = true;
          return setKv('lastBackup', new Date().toISOString()).then(function () { backupReady(out); });
        }).catch(function (ex) { busy(b, false); prog.hidden = true; err.textContent = T('The backup was not created: {why}', { why: (ex && ex.message) || ex }); err.hidden = false; });
      });
      $('#rb').onclick = function () { $('#rf').click(); };
      $('#rf').onchange = function () { var file = this.files[0]; this.value = ''; if (file) restore(file); };
    });
  }
  // The finished file: share or save it. Only creation is claimed, never that it was saved somewhere.
  function backupReady(out) {
    var body = '<h2>' + esc(T('Encrypted backup created')) + '</h2><p class="muted small">' + esc(out.name) + ' · ' + (out.size / 1048576).toFixed(1) + ' MB</p><p class="small">' + esc(T('Now save it somewhere safe. Wavelength does not keep a copy.')) + '</p>';
    if (out.uri) return sheet(body + '<div class="btns"><button class="btn teal block" data-share>' + I.share + ' ' + esc(T('Share or save')) + '</button><button class="btn ghost block" data-close>' + esc(T('Done')) + '</button></div>', function (root) {
      $('[data-share]', root).onclick = function () { NATIVE.Share.share({ title: out.name, files: [out.uri] }).catch(function (e) { if (!/cancel/i.test(String(e && e.message))) toast(T('Could not share the file.')); }); };
    });
    deliver(out.blob, out.name);
  }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }
  // Where the encrypted bytes go as they are made. In the app: appended to a file in the app's cache, so a large
  // backup never sits in memory whole (only encrypted bytes are ever written). On the website: a Blob.
  function backupSink(name) {
    if (NATIVE && NATIVE.Filesystem && NATIVE.Filesystem.appendFile) {
      var FS = NATIVE.Filesystem, path = 'backup/' + name, first = true, size = 0;
      var ready = FS.rmdir({ path: 'backup', directory: 'CACHE', recursive: true }).catch(function () {});
      return {
        write: function (u8) { size += u8.length; var data = b64(u8); ready = ready.then(function () { var o = { path: path, data: data, directory: 'CACHE', recursive: true }; var go = first ? FS.writeFile(o) : FS.appendFile(o); first = false; return go; }); return ready; },
        done: function () { return ready.then(function () { return FS.getUri({ path: path, directory: 'CACHE' }); }).then(function (r) { return { name: name, size: size, uri: r.uri }; }); }
      };
    }
    var parts = [], total = 0;
    return { write: function (u8) { parts.push(u8); total += u8.length; }, done: function () { return { name: name, size: total, blob: new Blob(parts, { type: 'application/octet-stream' }) }; } };
  }
  function extOf(r) { var t = (r.blob && r.blob.type) || ''; return /mp4/.test(t) ? 'mp4' : /webm/.test(t) ? 'webm' : 'jpg'; }
  function makeBackup(passphrase, progress) {
    var name = 'Wavelength-backup-' + dateStamp() + '.wlbackup';
    var out = backupSink(name);
    progress(T('Preparing the encryption key. This takes a few seconds…'));
    var enc = WLBackup.encryptor(passphrase, function (u8) { return out.write(u8); }, { onKdfProgress: function (f) { progress(T('Preparing the encryption key… {pct}%', { pct: Math.round(f * 100) })); } });
    var zw = WLZip.zipWriter(function (u8) { return enc.write(u8); });
    return Promise.all([all('images'), enc.ready]).then(function (r) {
      var imgs = r[0], done = 0;
      // Image records only (blobs are read one at a time below), so the manifest is small.
      var manifest = { app: 'wavelength-logbook', version: 3, created: new Date().toISOString(), account: S.account.email, entries: live().map(strip), images: imgs.map(function (x) { return { id: x.id, entryId: x.entryId, w: x.w, h: x.h, kind: isClip(x) ? 'clip' : 'image', type: (x.blob && x.blob.type) || 'image/jpeg', dur: x.dur, sha256: x.sha256 || undefined, file: 'images/' + x.id + '.' + extOf(x), thumb: isClip(x) && x.thumb && x.thumb.size ? 'images/' + x.id + '-thumb.jpg' : null }; }) };
      var chain = zw.add('wavelength-backup.json', JSON.stringify(manifest));
      imgs.forEach(function (x, i) {
        var m = manifest.images[i];
        chain = chain.then(function () {
          progress(T('Encrypting photos and clips: {done} of {total}', { done: ++done, total: imgs.length }));
          // A clip's poster frame goes first, so a restore has it when the clip arrives.
          var th = m.thumb ? x.thumb.arrayBuffer().then(function (b) { return zw.add(m.thumb, new Uint8Array(b)); }) : Promise.resolve();
          return th.then(function () { return x.blob.arrayBuffer(); }).then(function (b) { return zw.add(m.file, new Uint8Array(b)); });
        });
      });
      return chain;
    }).then(function () { return zw.finish(); }).then(function () { return enc.finish(); }).then(function () { return out.done(); });
  }
  function thumbOf(blob) {
    return new Promise(function (ok) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { var s = Math.min(1, 360 / Math.max(im.width, im.height)); var c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(ok, 'image/jpeg', 0.72); }; im.onerror = function () { ok(blob); }; im.src = u; });
  }
  // Restore: an encrypted backup (WLBACKUP) streamed and checked chunk by chunk, or an older unencrypted ZIP.
  // Entries and media already on this device are never overwritten; restored entries sync as restored copies, so a
  // newer copy on the server wins.
  function restore(file) {
    file.slice(0, 8).arrayBuffer().then(function (b) {
      var head = new Uint8Array(b);
      if (WLBackup.isBackup(head)) return askPassphrase(file);
      if (head[0] === 0x50 && head[1] === 0x4b) {
        return sheet('<h2>' + esc(T('This backup is not encrypted')) + '</h2><p class="small">' + esc(T('It was made by an earlier version of Wavelength. You can still restore it. Afterwards, create an encrypted backup and delete this old file from wherever you saved it, because anyone who can open that storage can read it.')) + '</p><div class="btns"><button class="btn teal block" data-ok>' + esc(T('Restore it')) + '</button><button class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div>', function (root) { $('[data-ok]', root).onclick = function () { closeSheet(); restoreLegacy(file); }; });
      }
      toast(T('This is not a Wavelength backup file.'), 4000);
    }).catch(function () { toast(T('Could not read that file.'), 4000); });
  }
  function askPassphrase(file) {
    sheet('<h2>' + esc(T('Enter the backup passphrase')) + '</h2><form id="rpf" novalidate><div class="field"><label for="rpp">' + esc(T('Backup passphrase')) + '</label><input id="rpp" type="password" autocomplete="current-password" required></div><div class="err" hidden></div><p class="small muted" role="status" data-rprog hidden></p><div class="btns"><button class="btn teal block">' + esc(T('Restore')) + '</button><button type="button" class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div></form>', function (root) {
      var f = $('#rpf', root), err = $('.err', f);
      // Progress shows on whichever sheet is open (the account question can replace this one).
      var progress = function (msg) { var el = document.querySelector('[data-rprog]'); if (el) { el.hidden = false; el.textContent = msg; } };
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); err.hidden = true;
        var b = $('button', f); busy(b, true, T('Restoring…'));
        restoreEncrypted(file, $('#rpp', f).value, progress).then(function (res) {
          closeSheet(); restored(res);
        }).catch(function (ex) {
          if (ex && ex.code === 'cancel') { closeSheet(); return; }
          var msg = ex && ex.code === 'auth' ? T('Wrong passphrase, or the file has been changed or damaged. Nothing was restored from the damaged part.') : ((ex && ex.message) ? T(ex.message) : T('Could not read that file.'));
          if (!document.contains(err)) { closeSheet(); toast(msg, 6000); }
          else { busy(b, false); var pg = $('[data-rprog]', f); if (pg) pg.hidden = true; err.textContent = msg; err.hidden = false; }
          if (ex && ex.partial) render(true);
        });
      });
    });
  }
  // Adds what the backup holds and this device lacks. Returns counts.
  function restoreInto(man) {
    var known = {}; S.entries.forEach(function (e) { known[e.id] = 1; });
    var fresh = (man.entries || []).filter(function (e) { return e && e.id && !known[e.id] && !e.deleted; });
    return Promise.all(fresh.map(function (e) { e._dirty = true; e._restored = true; e.updatedAt = 0; return saveLocal(e); })).then(function () { return { entries: fresh.length, media: 0, kept: (man.entries || []).length - fresh.length, damaged: 0 }; });
  }
  function sha256hex(u8) { return crypto.subtle.digest('SHA-256', u8).then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function putMedia(im, data, thumbs, res) {
    return getOne('images', im.id).then(function (have) {
      if (have) { res.kept++; return; }
      var check = im.sha256 ? sha256hex(data).then(function (h) { return h === im.sha256; }) : Promise.resolve(true);
      return check.then(function (ok) {
        if (!ok) { res.damaged++; return; }
        var clip = im.kind === 'clip', blob = new Blob([data], { type: im.type || 'image/jpeg' });
        var th = clip ? Promise.resolve(thumbs[im.id] || new Blob([], { type: 'image/jpeg' })) : thumbOf(blob);
        return th.then(function (t) { delete thumbs[im.id]; res.media++; return put('images', { id: im.id, entryId: im.entryId, blob: blob, thumb: t, w: im.w, h: im.h, kind: clip ? 'clip' : 'image', dur: im.dur, sha256: im.sha256, created: Date.now() }); });
      });
    });
  }
  function confirmAccount(man) {
    if (!man.account || man.account === S.account.email) return Promise.resolve(true);
    return new Promise(function (answer) {
      var done = false, ok = function (v) { if (!done) { done = true; answer(v); } };
      sheet('<h2>' + esc(T('Restore into this account?')) + '</h2><p class="small">' + esc(T('This backup belongs to {email}. Restore it into this account anyway?', { email: man.account })) + '</p><div class="btns"><button class="btn teal block" data-ok>' + esc(T('Restore')) + '</button><button class="btn ghost block" data-no>' + esc(T('Cancel')) + '</button></div>', function (root) {
        $('[data-ok]', root).onclick = function () { sheet('<h2>' + esc(T('Restoring…')) + '</h2><p class="small muted" role="status" data-rprog></p>'); ok(true); };
        $('[data-no]', root).onclick = function () { closeSheet(); ok(false); };
        // Closed with Back, Escape or a tap outside: the same as Cancel.
        var watch = new MutationObserver(function () { if (!root.isConnected) { watch.disconnect(); ok(false); } });
        watch.observe(document.body, { childList: true });
      });
    });
  }
  function restoreEncrypted(file, passphrase, progress) {
    var man = null, byFile = {}, thumbs = {}, res = null, stop = false;
    progress(T('Checking the passphrase. This takes a few seconds…'));
    var zr = WLZip.unzipReader(function (name, data) {
      if (stop) return;
      if (!man) {
        if (name !== 'wavelength-backup.json') throw new Error('This is not a Wavelength backup file.');
        man = JSON.parse(new TextDecoder().decode(data));
        (man.images || []).forEach(function (im) { byFile[im.file] = im; if (im.thumb) byFile[im.thumb] = { thumbOf: im.id }; });
        return confirmAccount(man).then(function (go) {
          if (!go) { stop = true; var c = new Error('cancelled'); c.code = 'cancel'; throw c; }
          return restoreInto(man).then(function (r) { res = r; });
        });
      }
      var im = byFile[name]; if (!im) return;
      if (im.thumbOf) { thumbs[im.thumbOf] = new Blob([data], { type: 'image/jpeg' }); return; }
      return putMedia(im, data, thumbs, res);
    });
    return WLBackup.decrypt(passphrase, WLBackup.blobReader(file), file.size, function (plain, frac) {
      progress(T('Restoring… {pct}%', { pct: Math.round(frac * 100) }));
      return zr.push(plain);
    }).then(function () { return zr.end(); }).then(function () {
      if (stop) return { cancelled: true };
      if (!res) throw new Error('The backup file is incomplete.');
      return res;
    }, function (ex) { if (res) ex.partial = true; throw ex; });
  }
  function restoreLegacy(file) {
    file.arrayBuffer().then(function (buf) {
      var files = WLZip.unzip(buf), m = files['wavelength-backup.json'];
      if (!m) throw new Error(T('This is not a Wavelength backup file.'));
      var man = JSON.parse(new TextDecoder().decode(m)), thumbs = {}, res;
      return confirmAccount(man).then(function (go) {
        if (!go) return null;
        closeSheet();
        return restoreInto(man).then(function (r) {
          res = r;
          (man.images || []).forEach(function (im) { if (im.thumb && files[im.thumb]) thumbs[im.id] = new Blob([files[im.thumb]], { type: 'image/jpeg' }); });
          return (man.images || []).reduce(function (p, im) { return p.then(function () { return files[im.file] ? putMedia(im, files[im.file], thumbs, res) : null; }); }, Promise.resolve());
        }).then(function () { restored(res); });
      });
    }).catch(function (ex) { toast((ex && ex.message) || T('Could not read that file.'), 4000); });
  }
  function restored(res) {
    if (!res || res.cancelled) return;
    var bits = [T('Restored {entries} and {media}.', { entries: plural(res.entries, 'entry', 'entries'), media: plural(res.media, 'photo or clip', 'photos or clips') })];
    if (res.kept) bits.push(T('{n} already on this device were kept as they are.', { n: res.kept }));
    if (res.damaged) bits.push(T('{n} could not be restored because they failed the integrity check.', { n: res.damaged }));
    toast(bits.join(' '), 6000); sync(); go('');
  }

  // ---------- Me ----------
  function viewMe(r) {
    var acc = S.account, p = profile();
    var certs = (S.me && S.me.certificates) || [];
    var editPw = r.q.get('edit') === 'pathways';
    var nSup = activeSupervisors().length, L2 = S.links || {};
    mount(shell({ title: T('Me'), action: '<a class="gear" href="#/settings" aria-label="' + esc(T('Settings')) + '">' + I.gear + '</a>' },
      '<div class="card dark"><div class="row"><span style="width:52px;height:52px;border-radius:50%;background:var(--teal);display:grid;place-items:center;font:600 20px var(--sans);color:#fff;flex:none">' + esc((acc.firstName || '?').charAt(0) + (acc.lastName || '').charAt(0)) + '</span><div class="grow"><h3>' + esc(acc.name) + '</h3><p class="muted small" style="margin:0">' + esc(acc.email) + (p.grade ? ' · ' + esc(p.grade) : '') + '</p></div></div></div>' +
      (canInstall() ? installButton() : '') +
      emailCard() + '<h2 class="sec">' + esc(T('Supervision')) + '</h2><div class="card"><div style="display:grid;gap:12px">' + (S.me && S.me.verification && S.me.verification.professional ? '<a href="#/professional">' + esc(T('Professional verification')) + '</a>' : '') + (S.me && S.me.supervisor && S.me.supervisor.available && (S.me.supervisor.apply || S.me.supervisor.standing !== 'none') ? '<a href="#/supervisor">' + esc(S.me.supervisor.standing === 'none' ? T('Become a Wavelength supervisor') : T('Your Wavelength supervisor status')) + '</a>' : '') + '<a href="#/supervisors">' + esc(T('Your supervisors')) + (nSup ? ' (' + nSup + ')' : '') + '</a><a href="#/assess">' + esc(T('Your assessments')) + '</a>' + ((L2.learners || []).length || (L2.invites || []).length || p.supervisor ? '<a href="#/supervise">' + esc(T('Learners you supervise')) + ((L2.invites || []).length ? ' · ' + esc(plural(L2.invites.length, 'new invitation')) : '') + '</a>' : '') + '</div></div>' +
      '<h2 class="sec">' + esc(T('Pathways')) + '</h2><form id="pf" class="card">' + pathwayPicker(p.pathways || []) + '<div class="btns"><button class="btn sm">' + esc(T('Save pathways')) + '</button></div></form>' +
      '<h2 class="sec">' + esc(T('Certificates')) + ' <a href="/elearning/account/">' + esc(T('All')) + '</a></h2>' + (certs.length ? certs.map(function (c) { return '<div class="entry"><span class="thumb">' + I.cert + '</span><a class="grow" style="text-decoration:none;color:inherit" href="/elearning/certificate/' + esc(c.code) + '/"><h3>' + esc(c.module_title) + '</h3><p>' + esc(fmt(c.issued_on)) + ' · ' + esc(c.code) + '</p></a><button class="btn ghost sm" type="button" data-sharecert="' + esc(c.code) + '" data-title="' + esc(c.module_title) + '" aria-label="' + esc(T('Share certificate')) + '">' + I.share + '</button></div>'; }).join('') : '<div class="card"><p class="muted small">' + esc(T('Pass a free Academy module to earn a verifiable CPD certificate.')) + '</p><a class="btn sm" href="/elearning/">' + esc(T('Browse modules')) + '</a></div>') +
      '<h2 class="sec">' + esc(T('Profile')) + '</h2><form id="mf" class="card"><div class="two"><div class="field"><label for="m1">' + esc(T('First name')) + '</label><input id="m1" name="firstName" type="text" value="' + esc(acc.firstName) + '"></div><div class="field"><label for="m2">' + esc(T('Last name')) + '</label><input id="m2" name="lastName" type="text" value="' + esc(acc.lastName) + '"></div></div><div class="field"><label for="m3">' + esc(T('Grade or role')) + '</label><input id="m3" name="grade" type="text" value="' + esc(p.grade || '') + '"></div>' + orgField('m4', T('Organisation'), acc.organisation, acc.organisationId) + '<div class="field"><label for="m5">' + esc(T('Professional registration number (shown on exports, optional)')) + '</label><input id="m5" name="registration" type="text" value="' + esc(p.registration || '') + '"></div><div class="field"><label class="check"><input type="checkbox" name="supervisor" value="1"' + (p.supervisor ? ' checked' : '') + '><span>' + esc(T('I supervise or assess other clinicians\' scanning.')) + '</span></label></div><button class="btn sm">' + esc(T('Save profile')) + '</button></form>' +
      '<h2 class="sec">' + esc(T('Your data')) + '</h2><div class="card"><div style="display:grid;gap:12px"><a href="#/settings?sync=1">' + esc(T('Sync')) + '</a><a href="#/backup">' + esc(T('Back up and restore')) + '</a><a href="#/export">' + esc(T('Export your logbook')) + '</a><a href="#/evidence">' + esc(T('Verified summaries you have shared')) + '</a><a href="#/declaration">' + esc(T('Your responsibility for stored data')) + '</a><a href="/app-terms/">' + esc(T('Logbook terms of use')) + '</a><a href="/privacy/">' + esc(T('Privacy notice')) + '</a><a href="/verify/">' + esc(T('Verify a code')) + '</a></div></div>'));
    // 1.0.11: About Wavelength lives in Settings only (the gear, top right), not twice.
    if (editPw) $('#pf').scrollIntoView();
    $$('[data-sharecert]').forEach(function (b) { b.onclick = function () { shareCertificate(b.dataset.sharecert, b.dataset.title); }; });
    $('#pf').addEventListener('submit', function (e) { e.preventDefault(); var ps = $$('input[name=p]:checked', this).map(function (i) { return i.value; }); if (!ps.length) { toast(T('Keep at least one pathway.')); return; } saveProfile({ pathways: ps }).then(function () { toast(T('Pathways saved.')); }).catch(function (ex) { toast(ex.message); }); });
    bindOrg($('#mf'), 'm4');
    $('#mf').addEventListener('submit', function (e) { e.preventDefault(); var d = formData(this); saveProfile({ grade: d.grade, registration: d.registration, supervisor: !!d.supervisor }, { firstName: d.firstName, lastName: d.lastName, organisation: d.organisation, organisationId: d.organisationId || null }).then(function () { toast(T('Profile saved.')); render(true); }).catch(function (ex) { toast(ex.message); }); });
  }
  // ---------- Sync panel (Settings and the status pill): this device's network, the server, waiting entries, ----------
  // the last attempt and the last success, the last error, Retry sync and what to check. No entry content.
  function when(t) { return t ? new Date(t).toLocaleString(LOCALES[LANG], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function netWords() {
    var d = deviceNet();
    if (!d.known) return d.online ? T('Connected') : T('No network');
    if (!d.connected) return T('No network');
    if (NETR.vpnOnly(d)) return T('VPN on, with no Wi-Fi or mobile data under it');
    var t = d.transports || [], via = t.indexOf('wifi') >= 0 ? T('Wi-Fi') : t.indexOf('cellular') >= 0 ? T('Mobile data') : t.indexOf('ethernet') >= 0 ? T('Ethernet') : T('Connected');
    return via + (d.vpn ? ' · ' + T('VPN on') : '') + (d.validated ? '' : ' · ' + T('internet access not confirmed by the phone'));
  }
  function serverWords(st) {
    if (S.syncing) return T('Checking…');
    if (st === 'offline') return T('Not checked: no network');
    if (st === 'unreachable') return SY.fail === 'timeout' ? T('No answer in time') : T('Not reachable from this network');
    if (st === 'failed') return T('Reachable, but some changes were not accepted');
    if (st === 'update') return T('Reachable');
    return SY.lastOk ? T('Reachable') : T('Not checked yet');
  }
  function fillSyncPanel(el) {
    if (!el) return;
    var st = syncState(), n = pendingList().length, bad = refused();
    var why = function (r) { return r === 'not-accepted' ? T('The server did not accept this entry.') : T(r); };
    var starts = []; try { starts = JSON.parse(localStorage.getItem('wl-diag') || '[]'); } catch (e) { starts = []; }
    var p = NETR.pill(st), err = SY.err;
    // Redrawn only when something shown changes, so an open "Start-up details" or a focused button is kept.
    var key = [st, n, bad.length, SY.lastTry, SY.lastOk, userBusy(), err && err.at, netWords()].join('|');
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    var ex = NETR.explain(st, deviceNet());
    var help = ex && !(st === 'failed' && bad.length) ? '<div class="sync-help"><p>' + esc(T(ex.lead)) + '</p>' + (ex.steps.length > 1 ? '<b>' + esc(T('What to check')) + '</b><ul>' + ex.steps.map(function (x) { return '<li>' + esc(T(x)) + '</li>'; }).join('') + '</ul>' : '<p>' + esc(T(ex.steps[0])) + '</p>') + '</div>' : '';
    var log = attemptLog();
    el.innerHTML = '<p class="sync-now"><span class="sync-pill static p-' + p.cls + '"><span class="sp-ic" aria-hidden="true">' + SI[p.icon] + '</span><span class="sp-tx">' + esc(T(p.label, { n: n })) + '</span></span><span role="status">' + esc(syncText(st) || T('Checking…')) + '</span></p>' +
      '<dl class="sync-facts"><dt>' + esc(T('Network on this device')) + '</dt><dd>' + esc(netWords()) + '</dd>' +
      '<dt>' + esc(T('Wavelength server')) + '</dt><dd>' + esc(serverWords(st)) + '</dd>' +
      '<dt>' + esc(T('Entries awaiting sync')) + '</dt><dd>' + n + '</dd>' +
      '<dt>' + esc(T('Last attempt')) + '</dt><dd>' + esc(SY.lastTry ? when(SY.lastTry) : T('Not yet on this device')) + '</dd>' +
      '<dt>' + esc(T('Last synced')) + '</dt><dd>' + esc(SY.lastOk ? when(SY.lastOk) : T('Not yet on this device')) + '</dd>' +
      (err && err.kind ? '<dt>' + esc(T('Last error')) + '</dt><dd>' + esc(when(err.at)) + '</dd><dd class="wide">' + esc(T(NETR.errorText(err.kind))) + '</dd>' : '') + '</dl>' +
      (bad.length ? '<p class="small" style="margin:8px 0 4px"><b>' + esc(T('Not accepted by the server')) + '</b></p><ul class="small sync-bad">' + bad.map(function (e) { return '<li><a href="#/entry/' + esc(e.id) + '">' + esc(T((TYPES[e.type] || {}).label || e.type || '')) + (e.date ? ', ' + esc(fmt(e.date)) : '') + '</a>: ' + esc(why(e._syncError)) + '</li>'; }).join('') + '</ul>' : '') +
      help +
      '<div class="sync-retry">' + retryButton('btn sm', 'data-resync') + '</div>' +
      '<p class="small muted" style="margin:12px 0 0">' + esc(T('This status is for this device only. Another phone or computer shows its own, and a scan saved here reaches your other devices only after this device has synced it.')) + '</p>' +
      '<p class="small muted" style="margin:8px 0 0">' + esc(T('Until they sync, new entries exist only on this device and would be lost if it were lost, damaged or wiped. Sync covers your logbook entries. Photos and clips stay on this device and are not uploaded: keep them safe with Back up and restore.')) + ' <a href="#/backup">' + esc(T('Back up and restore')) + '</a></p>' +
      (log.length ? '<details class="small muted sync-log" style="margin-top:10px"><summary>' + esc(T('Recent sync attempts')) + '</summary><ul class="sync-diag">' + log.slice().reverse().map(function (a) { return '<li>' + esc(new Date(a.at).toLocaleString(LOCALES[LANG], { dateStyle: 'short', timeStyle: 'medium' })) + ': ' + esc(a.ok ? T('Synced') : T(NETR.pill(a.kind === 'timeout' ? 'unreachable' : a.kind).label, { n: '' })) + (a.ms ? ' (' + a.ms + ' ms)' : '') + (a.net ? ', ' + esc(a.net) : '') + '</li>'; }).join('') + '</ul></details>' : '') +
      (starts.length ? '<details class="small muted" style="margin-top:10px"><summary>' + esc(T('Start-up details')) + '</summary><ul class="sync-diag">' + starts.slice().reverse().map(function (d) { return '<li>' + esc(new Date(d.at).toLocaleString(LOCALES[LANG], { dateStyle: 'short', timeStyle: 'short' })) + ': ' + esc(d.path || '?') + ', ' + esc(T('logbook in {ms} ms', { ms: d.ui || '?' })) + ', ' + esc(T('server {result}', { result: d.me || '?' })) + (d.meMs ? ' (' + d.meMs + ' ms)' : '') + '</li>'; }).join('') + '</ul></details>' : '');
    var b = $('[data-resync]', el);
    if (b) b.onclick = function () { if (!b.disabled) retryNow(); };
  }
  // ---------- Settings: appearance, language, notifications, app lock, account ----------
  function viewSettings() {
    var p = profile();
    var certs = (S.me && S.me.certificates) || [];
    var cur = window.WLTheme ? WLTheme.get() : 'light';
    var opt = function (v, cls, label) { return '<input type="radio" name="theme" id="th-' + v + '" value="' + v + '"' + (cur === v ? ' checked' : '') + '><label for="th-' + v + '"><span class="sw ' + cls + '" aria-hidden="true"><i></i><b></b></span>' + esc(label) + '</label>'; };
    mount(shell({ title: T('Settings'), back: 'me', tab: 'me' },
      '<h2 class="sec" style="margin-top:6px" id="sync">' + esc(T('Sync')) + '</h2><div class="card" id="syncpanel" data-syncpanel></div>' +
      '<h2 class="sec">' + esc(T('Backup')) + '</h2><div class="card"><p class="small muted" style="margin:0 0 10px">' + esc(S.kv.lastBackup ? T('Last backup file created {date}', { date: fmt(S.kv.lastBackup) }) : T('No backup file created on this device yet')) + '. ' + esc(T('Backups are encrypted with a passphrase you choose and saved where you decide.')) + '</p><a class="btn sm" href="#/backup">' + esc(T('Back up and restore')) + '</a></div>' +
      '<h2 class="sec">' + esc(T('Appearance')) + '</h2><div class="card"><div class="theme-pick" role="radiogroup" aria-label="' + esc(T('Appearance')) + '">' + opt('system', 's', T('Match my phone')) + opt('light', '', T('Light')) + opt('dark', 'd', T('Dark')) + '</div><p class="small muted" style="margin:12px 0 0">' + esc(T('Match my phone follows the light or dark setting on your phone.')) + '</p></div>' +
      '<h2 class="sec">' + esc(T('Language')) + '</h2><div class="card set-lang"><div class="row"><span>' + I.globe + '</span><b class="grow">' + esc(T('App language')) + '</b>' + langPicker('lang-m') + '</div><p class="small muted" style="margin:8px 0 0">' + esc(T('Exports and certificates stay in English so any assessor can read them.')) + '</p></div>' +
      '<h2 class="sec">' + esc(T('Notifications')) + '</h2><div class="card"><label class="check"><input type="checkbox" id="nte"' + (p.notifyEmail === false ? '' : ' checked') + '><span>' + esc(T('Email me when a supervisor signs off or queries my scans by link or from their dashboard')) + '</span></label><p class="small muted" style="margin:8px 0 0">' + esc(T('The app also shows new sign-offs on your home screen and logbook.')) + '</p></div>' +
      lockCard() +
      '<h2 class="sec">' + esc(T('Account')) + '</h2><div class="card"><form id="cpw"><div class="field"><label for="c1">' + esc(T('Current password')) + '</label><input id="c1" name="current" type="password" autocomplete="current-password"></div>' + pwFields('c2', T('New password'), 'password') + '<button class="btn sm ghost">' + esc(T('Change password')) + '</button></form></div>' +
      '<div class="btns"><button class="btn ghost block" id="lo">' + esc(T('Log out')) + '</button><button class="btn ghost block" id="loa">' + esc(T('Log out of all other devices')) + '</button><button class="btn ghost block" id="dl" style="color:var(--red)">' + esc(T('Delete my account')) + '</button></div>' +
      aboutFooter()));
    fillSyncPanel($('#syncpanel'));
    bindAbout();
    if (route().q.get('sync')) $('#sync').scrollIntoView();
    $$('input[name=theme]').forEach(function (i) { i.onchange = function () { if (window.WLTheme) WLTheme.set(i.value); NAT.haptic(); }; });
    bindPw($('#cpw'), 'c2');
    $('#cpw').addEventListener('submit', function (e) { e.preventDefault(); var f = this; var bad = pwProblem(f, 'c2'); if (bad) { toast(bad, 5000); return; } api('/api/app/password', formData(f)).then(function (res) { toast(res.ok ? T('Password changed.') : res.error); if (res.ok) f.reset(); }); });
    $('#nte').onchange = function () { var on = this.checked; saveProfile({ notifyEmail: on }).then(function () { toast(on ? T('Sign-off emails on.') : T('Sign-off emails off.')); }).catch(function (ex) { toast(ex.message); }); };
    bindLockCard();
    $('#lo').onclick = function () {
      var out = function () { api('/api/app/logout', {}, { timeout: 8000 }).then(function () { signedOut(); }, function () { signedOut(); }); };
      var n = pendingList().length;
      if (!n) return out();
      sheet('<h2>' + esc(T('Log out?')) + '</h2><p class="muted small">' + esc(N(n, '{n} entry on this device has not synced yet.', '{n} entries on this device have not synced yet.')) + ' ' + esc(T('It stays saved on this device and syncs when you log in here again.')) + '</p><div class="btns"><button class="btn block" data-close>' + esc(T('Stay logged in')) + '</button><button class="btn ghost block" data-ok>' + esc(T('Log out')) + '</button></div>', function (root) { $('[data-ok]', root).onclick = function () { closeSheet(); out(); }; });
    };
    $('#loa').onclick = function () {
      sheet('<h2>' + esc(T('Log out of all other devices?')) + '</h2><p class="muted small">' + esc(T('Every other phone, tablet and browser signed in to your account is logged out. Logbook entries they have not synced stay on them until someone logs in there again. This device stays logged in.')) + '</p><div class="btns"><button class="btn teal block" data-ok>' + esc(T('Log out other devices')) + '</button><button class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div>', function (root) {
        $('[data-ok]', root).onclick = function () { var b = this; busy(b, true); api('/api/app/logout-all', { keepThisDevice: true }).then(function (res) { closeSheet(); toast(res.ok ? T('Other devices are logged out.') : res.error, 4000); }).catch(function () { busy(b, false); toast(T('Could not log out other devices. Check your connection.')); }); };
      });
    };
    $('#dl').onclick = function () {
      sheet('<h2>' + esc(T('Delete your account?')) + '</h2><p class="muted small">' + esc(T('This deletes your logbook, sign-offs, assessments, supervisor links and account from Wavelength. Back up or export first if you want a copy. Images and clips on this phone are removed too.')) + '</p><form id="df"><div class="field"><label for="dp">' + esc(T('Your password')) + '</label><input id="dp" type="password" autocomplete="current-password" required></div>' + (certs.length ? '<label class="check"><input type="checkbox" id="kc" checked><span>' + esc(T('Keep my Academy certificates verifiable')) + '</span></label>' : '') + '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn danger block">' + esc(T('Delete everything')) + '</button><button type="button" class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div></form>', function (root) {
        $('#df', root).addEventListener('submit', function (ev) {
          ev.preventDefault();
          api('/api/app/account/delete', { password: $('#dp', root).value, keepCertificates: !!($('#kc', root) || {}).checked }).then(function (res) {
            if (!res.ok) { var er = $('.err', root); er.textContent = res.error; er.hidden = false; return; }
            var name = 'wavelength-' + S.account.id; S.db.close(); indexedDB.deleteDatabase(name); closeSheet(); toast(T('Your account is deleted.')); signedOut();
          });
        });
      });
    };
  }
  // ---------- About Wavelength: footer at the end of Settings (its one entry), About sheet, open-source licences ----------
  // Version and build come from the installed app's metadata (WLNative.appInfo), never from this file. Everything here
  // is bundled and works offline; only the website, privacy and terms links need a connection.
  var COPYRIGHT = '© 2026 Auda Medical Ltd';
  var SUPPORT = 'hello@thewavelength.co.uk';
  function appInfo() { return NAT.appInfo ? NAT.appInfo() : Promise.resolve({ version: '', build: '' }); }
  function versionText(v) { return v.version ? (v.build ? T('Version {version} ({build})', { version: v.version, build: v.build }) : T('Version {version}', { version: v.version })) : T('Web app'); }
  function aboutFooter() {
    return '<footer class="about-foot"><p class="about-name">Wavelength</p><p data-appver>' + esc(NAT.version ? versionText({ version: NAT.version, build: '' }) : NAT.on ? '' : T('Web app')) + '</p><p><bdi dir="ltr">' + esc(COPYRIGHT) + '</bdi></p>' +
      '<button type="button" class="about-link" data-about>' + esc(T('About Wavelength')) + '</button></footer>';
  }
  function bindAbout() {
    var b = $('[data-about]'); if (b) b.onclick = aboutSheet;
    appInfo().then(function (v) { $$('[data-appver]').forEach(function (el) { el.textContent = versionText(v); }); });
  }
  function aboutSheet() {
    appInfo().then(function (v) {
      var body = [T('App version: {v}', { v: v.version ? v.version + (v.build ? ' (' + v.build + ')' : '') : T('Web app') + ' ' + (window.WL_BUILD || '') }), T('Platform: {p}', { p: NAT.platform || 'web' }), T('App language: {l}', { l: LANG })].join('\n') + '\n\n';
      var mail = 'mailto:' + SUPPORT + '?subject=' + encodeURIComponent(T('Wavelength app support')) + '&body=' + encodeURIComponent(body);
      sheet('<div class="about-head">' + MARK(56) + '<h2>Wavelength <span>POCUS Logbook</span></h2></div>' +
        '<dl class="about-facts"><dt>' + esc(T('Version')) + '</dt><dd>' + esc(v.version || T('Web app')) + '</dd><dt>' + esc(T('Build')) + '</dt><dd>' + esc(v.build || window.WL_BUILD || '–') + '</dd>' +
        '<dt>' + esc(T('Developer')) + '</dt><dd>Auda Medical Ltd</dd><dt>' + esc(T('Website')) + '</dt><dd><a href="/">thewavelength.co.uk</a></dd></dl>' +
        '<nav class="about-links" aria-label="' + esc(T('About Wavelength')) + '"><a href="' + esc(mail) + '">' + esc(T('Contact support')) + '</a><a href="/privacy/">' + esc(T('Privacy policy')) + '</a><a href="/app-terms/">' + esc(T('Terms of use')) + '</a><button type="button" data-lic>' + esc(T('Open-source licences')) + '</button></nav>' +
        '<p class="small muted">' + esc(T('The support email includes only the app version, platform and language. The website, privacy policy and terms need an internet connection.')) + '</p>' +
        '<p class="small muted"><bdi dir="ltr">' + esc(COPYRIGHT) + '</bdi></p><div class="btns"><button class="btn ghost block" data-close>' + esc(T('Close')) + '</button></div>', function (root) {
        $('[data-lic]', root).onclick = licencesSheet;
      });
    });
  }
  function loadLicences() {
    if (window.WL_LICENCES) return Promise.resolve(window.WL_LICENCES);
    return new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = '/app/licences.js?v=' + (window.WL_BUILD || ''); sc.onload = function () { ok(window.WL_LICENCES); }; sc.onerror = no; document.head.appendChild(sc); });
  }
  function licencesSheet() {
    loadLicences().then(function (L) {
      var show = function (c) { return !c.platform || (c.platform === 'app' ? NAT.on : NAT.platform === c.platform); };
      var groups = {}; L.components.filter(show).forEach(function (c) { (groups[c.licence] = groups[c.licence] || []).push(c); });
      var html = Object.keys(groups).map(function (lic) {
        return '<h3>' + esc(lic) + '</h3><ul class="lic-list">' + groups[lic].map(function (c) { return '<li><b>' + esc(c.name) + '</b>' + (c.version ? ' ' + esc(c.version) : '') + '<br><span class="muted">' + esc(c.copyright) + (c.note ? '. ' + esc(c.note) : '') + '</span></li>'; }).join('') + '</ul>' +
          '<details class="lic-text"><summary>' + esc(T('Licence text: {name}', { name: lic })) + '</summary><pre lang="en" dir="ltr">' + esc(L.texts[lic] || '') + '</pre></details>';
      }).join('');
      sheet('<h2>' + esc(T('Open-source licences')) + '</h2><p class="small muted">' + esc(T('Wavelength is built with these open-source components. Thank you to their authors.')) + '</p>' + html + '<div class="btns"><button class="btn ghost block" data-back>' + esc(T('Back')) + '</button></div>', function (root) { $('[data-back]', root).onclick = aboutSheet; });
    }).catch(function () { toast(T('Could not open the licences.')); });
  }
  function shareCertificate(code, title) {
    var link = NAT.origin + '/elearning/certificate/' + code + '/';
    var text = T('My Wavelength Academy CPD certificate: {title}. Verify it at {link}', { title: title, link: link });
    sheet('<h2>' + esc(T('Share your certificate')) + '</h2><p class="muted small">' + esc(T('Anyone with the link sees your name, the module, CPD hours and date, never your score. Add it to your e-portfolio, appraisal or LinkedIn.')) + '</p><div class="card" style="word-break:break-all;font-size:13px">' + esc(link) + '</div><div class="btns">' + (navigator.share ? '<button class="btn teal block" data-s>' + I.share + ' ' + esc(T('Share')) + '</button>' : '') + '<button class="btn block" data-pdf>' + esc(T('Share the PDF')) + '</button><button class="btn ghost block" data-c>' + esc(T('Copy link')) + '</button><a class="btn ghost block" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link) + '">' + esc(T('Post on LinkedIn')) + '</a></div>', function (root) {
      var s = $('[data-s]', root); if (s) s.onclick = function () { navigator.share({ title: title, text: text, url: link }).catch(function () {}); };
      $('[data-c]', root).onclick = function () { copy(link); };
      $('[data-pdf]', root).onclick = function () { NAT.net('/elearning/certificate/' + code + '.pdf', { credentials: 'same-origin' }).then(function (r) { return r.blob(); }).then(function (b) { closeSheet(); deliver(new Blob([b], { type: 'application/pdf' }), 'Wavelength-certificate-' + code + '.pdf'); }); };
    });
  }
  // ---------- Email confirmation ----------
  // Shown until the email is confirmed. Existing accounts (legacy_unverified) keep full use of the app meanwhile.
  function emailCard() {
    var acc = S.account, v = S.me && S.me.verification;
    if (!acc || acc.emailStatus === 'verified' || !v || !v.email) return '';
    var legacy = acc.emailStatus === 'legacy_unverified';
    setTimeout(bindEmailResend, 0);
    return '<div class="card" style="border-color:var(--amber-line);background:var(--amber-bg)"><div class="row"><span style="color:var(--warn-ink)">' + I.lock + '</span><div class="grow"><h3>' + esc(T('Confirm your email')) + '</h3><p class="small" style="margin:0">' + esc(legacy ? T('Confirming {email} protects your account and lets you accept supervisor invitations and verify your professional registration. Your logbook works as normal either way.', { email: acc.email }) : T('We sent a link to {email}. Your logbook works as normal while you wait. You need a confirmed email to accept supervisor invitations and verify your registration.', { email: acc.email })) + '</p></div></div><div class="btns"><button class="btn sm" type="button" data-evr>' + esc(legacy ? T('Send me the link') : T('Send it again')) + '</button></div></div>';
  }
  function bindEmailResend() {
    $$('[data-evr]').forEach(function (b) {
      b.onclick = function () {
        if (!navigator.onLine) { toast(T('You are offline. Connect to the internet and try again.')); return; }
        busy(b, true);
        api('/api/app/email/resend', {}).then(function (res) {
          busy(b, false);
          if (res.verified) { S.account.emailStatus = 'verified'; render(true); return; }
          toast(res.emailOn === false ? T('Email is not switched on yet. Contact hello@thewavelength.co.uk.') : T('If we have not sent one in the last few minutes, a link is on its way. Check your junk folder too.'), 5000);
        }).catch(function () { busy(b, false); toast(T('Could not send. Check your connection.')); });
      };
    });
  }
  // /app/#/verify-email/<token>: works with or without a login, in a browser or the installed app.
  function viewVerifyEmail(r) {
    var t = r.arg || '';
    history.replaceState(null, '', '/app/#/verified'); // the token leaves the address bar and history at once
    authFrame(T('Confirming your email…'), '', '<p class="muted" id="vst">' + esc(T('Please wait…')) + '</p>');
    var done = function (title, lede, body) { authFrame(title, lede, body); };
    var send = function (extra) { return api('/api/app/email/verify', Object.assign({ token: t }, extra || {})); };
    var handle = function (res) {
      // Opened in a different browser from the one that started the account: the person opening it chooses the password.
      if (res.needPassword) {
        done(T('Choose your password.'), T('To finish creating your account, choose the password you will use to log in.'), '<form id="f" novalidate><div class="err" hidden></div>' + pwFields('pw', T('Password')) + '<button class="btn teal block">' + esc(T('Save and log in')) + '</button></form>');
        bindPw($('#f'), 'pw');
        $('#f').addEventListener('submit', function (e) { e.preventDefault(); var bad = pwProblem(this, 'pw'); if (bad) { var er0 = $('.err', this); er0.textContent = bad; er0.hidden = false; return; } var b = $('button', this); busy(b, true); send({ password: $('#pw').value }).then(function (r2) { if (r2.needPassword) { busy(b, false); var er = $('.err'); er.textContent = r2.error; er.hidden = false; return; } handle(r2); }); });
        return;
      }
      return finish(res);
    };
    send().then(handle).catch(function () { done(T('You are offline.'), T('Connect to the internet and open the link again.'), ''); });
    function finish(res) {
      if (!res.ok) { done(T('This link has expired.'), res.error || T('Open the Wavelength app and send a new link.'), '<a class="btn teal block" href="/app/?verified=0">' + esc(T('Open Wavelength')) + '</a>'); return; }
      if (res.purpose === 'signin' && res.next) { location.replace(res.next); return; }
      if (res.purpose === 'claim' && res.account) { S.me = null; return signedIn(res.account); }
      if (S.account) S.account.emailStatus = 'verified';
      done(T('Email confirmed.'), T('Thank you. If you use the Wavelength app on your phone, switch back to it: it picks this up the next time it connects.'), '<a class="btn teal block" href="/app/?verified=1">' + esc(T('Open Wavelength')) + '</a>');
    }
  }

  // ---------- Professional verification (registration, credentials, supervisor status, directory) ----------
  // Nothing here is decided in the app: the server checks every claim and returns the status. A badge appears only
  // for what has been verified, never for what someone has only typed.
  var STATUS_CHIP = { verified: 'green', expired: 'red', rejected: 'red', revoked: 'red', mismatch: 'red', not_current: 'red', not_found: 'amber' };
  // Professional verification status (a different chip from the logbook's sign-off statusChip above).
  function verifyChip(st) { return '<span class="chip ' + (STATUS_CHIP[st] || 'amber') + '">' + esc(T(st === 'verified' ? 'Verified' : st === 'manual_verification_required' || st === 'manual_review' ? 'With the Wavelength team' : st === 'evidence_required' || st === 'more_evidence' ? 'Evidence needed' : st === 'source_unavailable' ? 'Will retry' : st === 'not_current' ? 'Not current' : st === 'not_found' ? 'Not found' : st === 'mismatch' ? 'Name differs' : st === 'expired' ? 'Expired' : st === 'rejected' ? 'Not verified' : st === 'revoked' ? 'Withdrawn by Wavelength' : 'Checking')) + '</span>'; }
  function badgeHtml(b, i) { return '<button type="button" class="chip ' + (b.kind === 'wavelength-supervisor' ? 'teal' : 'green') + '" data-badge="' + i + '" style="border:0;cursor:pointer;margin:0 6px 6px 0">' + esc(T(b.label)) + '</button>'; }
  function badgeSheet(b) {
    var dl = function (k, v) { return v ? '<dt>' + esc(T(k)) + '</dt><dd>' + esc(v) + '</dd>' : ''; };
    sheet('<h2>' + esc(T(b.label)) + '</h2><div class="detail"><dl>' + dl('Issued by', b.issuer) + dl('Credential', b.credential) + dl('Modules', (b.modules || []).join(', ')) + dl('Approved for', (b.scopes || []).map(function (s) { return s.label; }).join(', ')) + dl('How it was checked', b.source ? T(b.source) : '') + dl('Verified', fmt(b.verifiedAt)) + dl('Last checked', fmt(b.lastChecked)) + dl('Expires', fmt(b.expiresOn)) + dl('Review due', fmt(b.reviewOn)) + '</dl></div>' + (b.note ? '<p class="small muted">' + esc(T(b.note)) + '</p>' : '') + (b.kind === 'wavelength-supervisor' ? '<p class="small muted">' + esc(T('Wavelength approves supervisors one pathway module at a time, from verified registration and credentials.')) + '</p>' : '') + '<div class="btns"><button class="btn block" data-close>' + esc(T('Done')) + '</button></div>');
  }
  function viewProfessional() {
    mount(shell({ title: T('Professional verification'), back: 'me' }, '<p class="muted">' + esc(navigator.onLine ? T('Loading…') : T('You are offline. Connect to the internet to see your verification. Your logbook works as normal.')) + '</p>'));
    if (!navigator.onLine) return;
    api('/api/app/professional').then(function (P) {
      if (route().name !== 'professional') return;
      if (!P.ok) { mount(shell({ title: T('Professional verification'), back: 'me' }, '<div class="card"><p class="small">' + esc(P.error || T('Professional verification is not available yet.')) + '</p></div>')); return; }
      S.account.emailStatus = P.emailStatus;
      var needEmail = P.emailStatus !== 'verified';
      var regOpts = P.regulators.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.short + ' · ' + g.name) + '</option>'; }).join('');
      var credOpts = P.credentialTypes.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(T(t.label) + ' · ' + t.issuer) + '</option>'; }).join('');
      var regs = P.registrations.map(function (g) { return '<div class="card"><div class="row"><div class="grow"><h3>' + esc(g.regulatorShort + ' ' + g.number) + '</h3><p class="small muted" style="margin:0">' + esc([T(g.profession || ''), g.organisation].filter(Boolean).join(' · ')) + '</p></div>' + verifyChip(g.status) + '</div><p class="small">' + esc(T(g.message)) + (g.lastCheckedAt ? ' ' + esc(T('Last checked {date}.', { date: fmt(g.lastCheckedAt) })) : '') + '</p><div class="btns">' + (['mismatch', 'manual_review', 'manual_verification_required', 'not_found'].indexOf(g.status) >= 0 ? '<button class="btn ghost sm" data-ev="registration:' + g.id + '">' + esc(T('Add a note or evidence')) + '</button>' : '') + '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + esc(g.registerUrl) + '">' + esc(T('Official register')) + '</a><button class="btn ghost sm" data-wd="registration:' + g.id + '">' + esc(T('Remove')) + '</button></div></div>'; }).join('');
      var creds = P.credentials.map(function (c) { return '<div class="card"><div class="row"><div class="grow"><h3>' + esc(T(c.label)) + '</h3><p class="small muted" style="margin:0">' + esc(c.issuer + ((c.moduleLabels || []).length ? ' · ' + c.moduleLabels.map(T).join(', ') : '')) + '</p></div>' + verifyChip(c.status) + '</div><p class="small">' + esc(T(c.message)) + (c.expiresOn ? ' ' + esc(T('Expires {date}.', { date: fmt(c.expiresOn) })) : '') + '</p>' + ((c.evidence || []).length ? '<p class="small muted">' + esc(T('Evidence: {list}', { list: c.evidence.map(function (e) { return e.fileName || e.description || T(e.kind); }).join(', ') })) + '</p>' : '') + '<div class="btns">' + (c.status !== 'verified' ? '<button class="btn ghost sm" data-ev="credential:' + c.id + '">' + esc(T('Add evidence')) + '</button>' : '') + '<button class="btn ghost sm" data-wd="credential:' + c.id + '">' + esc(T('Remove')) + '</button></div></div>'; }).join('');
      var appr = P.approvals.length ? '<div class="card"><p class="small">' + esc(T('The Wavelength team has approved you as a supervisor for:')) + '</p><p>' + P.approvals.map(function (a) { return '<span class="chip ' + (a.current ? 'teal' : 'amber') + '">' + esc(a.label) + (a.current ? '' : ' · ' + esc(T('paused'))) + '</span>'; }).join(' ') + '</p><p class="small muted">' + esc(T('Approval is per pathway module. It pauses automatically if your registration stops being verified.')) + '</p></div>' : '<div class="card"><p class="small muted">' + esc(T('Once your registration and supervisor credentials are verified, the Wavelength team can approve you as a supervisor for the pathway modules they cover.')) + '</p></div>';
      var D = P.directory || {};
      var dir = '<form id="dirf" class="card"><label class="check"><input type="checkbox" name="listed" value="1"' + (D.listed ? ' checked' : '') + (D.eligible ? '' : ' disabled') + '><span>' + esc(T('List me in the public "Find an ultrasound supervisor" directory')) + '</span></label>' +
        (D.eligible ? '' : '<p class="small muted">' + esc(T('Not yet:')) + ' ' + (D.reasons || []).map(function (x) { return esc(T(x)); }).join(' ') + '</p>') +
        '<p class="small muted">' + esc(T('The directory shows your name, profession, organisation, region, verified credentials and supervisor modules. It never shows your email or registration number unless you add a contact address below and tick to show it.')) + (D.open ? '' : ' ' + esc(T('The directory is not open yet. Your choice is saved for when it opens.'))) + '</p>' +
        '<div class="two"><div class="field"><label for="dr1">' + esc(T('Region')) + '</label><input id="dr1" type="text" name="region" value="' + esc(D.region || '') + '" placeholder="' + esc(T('For example Kent')) + '"></div><div class="field"><label for="dr2">' + esc(T('Country code')) + '</label><input id="dr2" type="text" name="country" maxlength="2" value="' + esc(D.country || '') + '" placeholder="GB"></div></div>' +
        '<div class="field"><label for="dr3">' + esc(T('Specialty')) + '</label><input id="dr3" type="text" name="specialty" value="' + esc(D.specialty || '') + '"></div>' +
        '<div class="field"><label for="dr4">' + esc(T('Contact email for learners (optional)')) + '</label><input id="dr4" name="contactEmail" type="email" value="' + esc(D.contactEmail || '') + '"></div>' +
        '<label class="check"><input type="checkbox" name="showContact" value="1"' + (D.showContact ? ' checked' : '') + '><span>' + esc(T('Show this contact email in the directory')) + '</span></label><div class="btns"><button class="btn sm">' + esc(T('Save directory settings')) + '</button></div></form>';
      mount(shell({ title: T('Professional verification'), back: 'me' },
        '<p class="small muted">' + esc(T('Five separate things: your email, your professional registration, credentials from other bodies (such as FAMUS or FUSIC), Wavelength supervisor approval, and directory listing. Each is checked on its own.')) + '</p>' +
        (P.badges.length ? '<div class="card"><p class="eyebrow" style="margin:0 0 8px">' + esc(T('Verified')) + '</p>' + P.badges.map(badgeHtml).join('') + '<p class="small muted" style="margin:6px 0 0">' + esc(T('Tap a badge to see who issued it and how it was checked.')) + '</p></div>' : '') +
        (needEmail ? emailCardFor() : '') +
        '<h2 class="sec">' + esc(T('Professional registration')) + '</h2>' + regs +
        '<form id="rgf" class="card"><div class="field"><label for="rg1">' + esc(T('Regulator')) + '</label><select id="rg1" name="regulator">' + regOpts + '</select></div><div class="field"><label for="rg2">' + esc(T('Profession')) + '</label><select id="rg2" name="profession"></select></div><div class="field"><label for="rg3" id="rg3l">' + esc(T('Registration number')) + '</label><p class="hint" id="rg3h"></p><input id="rg3" type="text" name="number" required autocomplete="off" autocapitalize="characters"></div><div class="field"><label for="rg4">' + esc(T('Organisation')) + '</label><input id="rg4" type="text" name="organisation" value="' + esc(S.account.organisation || '') + '"></div><div class="field"><label for="rg5">' + esc(T('Role or grade')) + '</label><input id="rg5" type="text" name="role" value="' + esc(profile().grade || '') + '"></div><p class="small muted" id="rg6"></p><div class="err" hidden></div><div class="btns"><button class="btn teal sm"' + (needEmail ? ' disabled' : '') + '>' + esc(T('Check my registration')) + '</button></div></form>' +
        '<h2 class="sec">' + esc(T('Credentials from other bodies')) + '</h2>' + creds +
        '<form id="crf" class="card"><div class="field"><label for="cr1">' + esc(T('Credential')) + '</label><select id="cr1" name="type">' + credOpts + '</select></div><div class="field" id="crm"></div><div class="two"><div class="field"><label for="cr3">' + esc(T('Awarded on (optional)')) + '</label><input id="cr3" name="issuedOn" type="date"></div><div class="field"><label for="cr4">' + esc(T('Expires on (optional)')) + '</label><input id="cr4" name="expiresOn" type="date"></div></div><div class="field"><label for="cr2">' + esc(T('Certificate or reference number (optional)')) + '</label><input id="cr2" type="text" name="reference" autocomplete="off"></div><div class="field"><label for="cr5">' + esc(T('Note for the Wavelength team (optional)')) + '</label><textarea id="cr5" name="note" rows="2"></textarea></div><p class="small muted">' + esc(T('Wavelength checks credentials against each body\'s own records where it is allowed to, and otherwise against evidence you add. Never upload a passport or driving licence: we do not need one.')) + '</p><div class="err" hidden></div><div class="btns"><button class="btn teal sm"' + (needEmail ? ' disabled' : '') + '>' + esc(T('Add credential')) + '</button></div></form>' +
        '<h2 class="sec">' + esc(T('Wavelength supervisor')) + '</h2>' + appr +
        '<h2 class="sec">' + esc(T('Supervisor directory')) + '</h2>' + dir));
      bindEmailResend();
      $$('[data-badge]').forEach(function (b) { b.onclick = function () { badgeSheet(P.badges[Number(b.dataset.badge)]); }; });
      var rg = $('#rg1'), setReg = function () { var g = P.regulators.filter(function (x) { return x.id === rg.value; })[0] || P.regulators[0]; $('#rg2').innerHTML = g.professions.map(function (x) { return '<option value="' + esc(x) + '">' + esc(T(x)) + '</option>'; }).join(''); $('#rg3l').textContent = T(g.numberLabel); $('#rg3h').textContent = T(g.numberHint); $('#rg6').textContent = g.automatic ? T('Checked automatically against the register.') : T('{body} has no automated check Wavelength may use yet, so the Wavelength team checks the public register by hand.', { body: g.short }); };
      rg.onchange = setReg; setReg();
      var cr = $('#cr1'), setCred = function () { var t = P.credentialTypes.filter(function (x) { return x.id === cr.value; })[0] || P.credentialTypes[0]; $('#crm').innerHTML = '<label>' + esc(T('Modules')) + '</label>' + t.modules.map(function (m) { return '<label class="check"><input type="checkbox" name="modules" value="' + esc(m.id) + '"><span>' + esc(T(m.label)) + '</span></label>'; }).join(''); };
      cr.onchange = setCred; setCred();
      var post = function (form, path, data) { var b = $('button', form), er = $('.err', form); busy(b, true); if (er) er.hidden = true; return api(path, data).then(function (res) { busy(b, false); if (!res.ok) { if (er) { er.textContent = res.error || T('Something went wrong.'); er.hidden = false; } else toast(res.error); return; } viewProfessional(); }).catch(function () { busy(b, false); toast(T('Could not save. Check your connection.')); }); };
      $('#rgf').addEventListener('submit', function (e) { e.preventDefault(); post(this, '/api/app/professional/registration', formData(this)); });
      $('#crf').addEventListener('submit', function (e) { e.preventDefault(); var d = formData(this); d.modules = $$('input[name=modules]:checked', this).map(function (i) { return i.value; }); post(this, '/api/app/professional/credential', d); });
      $('#dirf').addEventListener('submit', function (e) { e.preventDefault(); var d = formData(this); d.listed = !!d.listed; d.showContact = !!d.showContact; api('/api/app/professional/directory', d).then(function (res) { toast(res.ok ? (res.listed ? T('You are listed.') : T('Saved. You are not listed.')) : res.error); if (res.ok) viewProfessional(); }); });
      $$('[data-wd]').forEach(function (b) { b.onclick = function () { if (!confirm(T('Remove this? Its badge disappears. You can add it again later.'))) return; var x = b.dataset.wd.split(':'); api('/api/app/professional/withdraw', { subject: x[0], id: Number(x[1]) }).then(viewProfessional); }; });
      $$('[data-ev]').forEach(function (b) { b.onclick = function () { var x = b.dataset.ev.split(':'); evidenceSheet(x[0], Number(x[1])); }; });
    }).catch(function () { toast(T('Could not load. Check your connection.')); });
  }
  function emailCardFor() { var html = emailCard(); return html || '<div class="card"><p class="small">' + esc(T('Confirm your email address first. Use the link we sent you.')) + '</p><div class="btns"><button class="btn sm" type="button" data-evr>' + esc(T('Send it again')) + '</button></div></div>'; }
  function evidenceSheet(subject, id) {
    sheet('<h2>' + esc(T('Add evidence')) + '</h2><p class="small muted">' + esc(T('A certificate, a letter from your department or the awarding body, or a link to an official public listing. PDF, JPEG or PNG up to 1 MB. Cover anything that is not needed, such as your date of birth or home address. The file is deleted once the team has decided.')) + '</p><form id="evf"><div class="field"><label for="ev1">' + esc(T('Type')) + '</label><select id="ev1" name="kind"><option value="certificate">' + esc(T('Certificate')) + '</option><option value="letter">' + esc(T('Letter or email confirming the role')) + '</option><option value="institution">' + esc(T('NHS or institutional confirmation')) + '</option><option value="body_correspondence">' + esc(T('Correspondence from the awarding body')) + '</option><option value="public_profile">' + esc(T('Official public listing (link)')) + '</option><option value="other">' + esc(T('Other')) + '</option></select></div><div class="field"><label for="ev2">' + esc(T('Description')) + '</label><input id="ev2" type="text" name="description" maxlength="500"></div><div class="field"><label for="ev3">' + esc(T('Link (optional)')) + '</label><input id="ev3" name="url" type="url" placeholder="https://"></div><div class="field"><label for="ev4">' + esc(T('File (optional)')) + '</label><input id="ev4" type="file" accept="application/pdf,image/jpeg,image/png"></div><div class="err" hidden></div><div class="btns"><button class="btn teal block">' + esc(T('Send to the Wavelength team')) + '</button><button type="button" class="btn ghost block" data-close>' + esc(T('Cancel')) + '</button></div></form>', function (root) {
      $('#evf', root).addEventListener('submit', function (e) {
        e.preventDefault();
        var f = $('#ev4', root).files[0], d = formData(this), b = $('button', this), er = $('.err', this);
        var fail = function (msg) { busy(b, false); er.textContent = msg; er.hidden = false; };
        if (f && f.size > 1048576) return fail(T('Files can be up to 1 MB. Save a smaller PDF or photo.'));
        busy(b, true);
        var q = 'subject=' + subject + '&id=' + id + '&kind=' + encodeURIComponent(d.kind) + '&description=' + encodeURIComponent(d.description || '') + '&url=' + encodeURIComponent(d.url || '');
        var send = f ? NAT.net('/api/app/professional/evidence?' + q + '&name=' + encodeURIComponent(f.name), { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': f.type || 'application/octet-stream' }, body: f }).then(function (r) { return r.json(); })
          : api('/api/app/professional/evidence', { subject: subject, id: id, kind: d.kind, description: d.description, url: d.url });
        send.then(function (res) { if (!res.ok) return fail(T(res.error || 'Something went wrong.')); closeSheet(); toast(T('Sent. The Wavelength team will review it.')); viewProfessional(); }).catch(function () { fail(T('Could not send. Check your connection.')); });
      });
    });
  }
  function viewDeclaration() { mount(shell({ title: T('Your responsibility'), back: 'me' }, declarationHtml() + '<p class="small muted" style="margin-top:12px">' + esc(T('You accepted this on {date}.', { date: fmt(S.account.declarationAt) })) + '</p>')); }

  // ---------- Store apps: back button, returning to the app, app lock ----------
  // Android back: close an open sheet, then follow the header's back link, then return to Home, then leave the app.
  window.addEventListener('wl:back', function (e) {
    if (document.querySelector('.app-lock')) return;
    if (document.querySelector('.sheet-bg')) { e.preventDefault(); closeSheet(); return; }
    var b = document.querySelector('header.top a.back');
    if (b) { e.preventDefault(); location.hash = b.getAttribute('href'); return; }
    var r = route().name;
    if (S.account ? r !== 'home' : (r === 'login' || r === 'signup' || r === 'reset')) { e.preventDefault(); go(S.account ? '' : 'welcome'); }
  });
  var LOCK_AFTER = 90e3; // a quick trip to the camera or the share sheet does not lock the logbook
  var lockBusy = false;
  window.addEventListener('wl:resume', function (e) {
    if (S.account && !lockBusy && NAT.lockOn() && e.detail && e.detail.away > LOCK_AFTER) showLock();
    // Back in the app: read the network afresh (it may have changed while away). A learner who has just fixed their
    // connection is not left waiting, and a quick trip to the camera does not start a burst of requests.
    resumeSync(e.detail && e.detail.away);
  });
  window.addEventListener('wl:pause', pauseRetries);
  // The lock setting was read late (slow secure storage at start): lock now.
  window.addEventListener('wl:lock', function () { if (S.account && NAT.lockOn()) showLock(); });
  // On start the lock covers the screen before the logbook is drawn behind it.
  function lockFirst() { if (NAT.lockOn()) showLock(); }
  function hideLock(all) { $$('.app-lock').forEach(function (x) { x.remove(); }); if (all) lockBusy = false; }
  function showLock() {
    if (document.querySelector('.app-lock')) return unlock();
    var el = document.createElement('div');
    el.className = 'app-lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T('Logbook locked'));
    el.innerHTML = '<div class="app-lock-in">' + MARK(64, 'rgba(247,245,240,.7)') + '<div class="wm">WAVELENGTH</div><p>' + esc(T('Your logbook is locked.')) + '</p><p class="small" role="status" data-lockmsg></p><button class="btn teal block" type="button" data-unlock>' + esc(T('Unlock')) + '</button><button class="btn ghost block" type="button" data-lockout>' + esc(T('Log out')) + '</button></div>';
    document.body.appendChild(el);
    $('[data-unlock]', el).onclick = unlock;
    // Logging in again needs the account password, so the lock starts off after that (it can be turned on again).
    $('[data-lockout]', el).onclick = function () { NAT.setLock(false); api('/api/app/logout', {}, { timeout: 8000 }).then(function () { signedOut(); }, function () { signedOut(); }); };
    unlock();
  }
  function unlock() {
    if (lockBusy) return;
    lockBusy = true;
    NAT.lockAvailable().then(function (ok) {
      // The lock never switches itself off. If the phone's lock was removed (or, on Android 7 to 10, only a weak
      // face unlock is left), the logbook stays locked: set the phone's lock up again, or log out and log in with
      // the account password. Logging out keeps the logbook saved on this phone.
      var msg = $('[data-lockmsg]');
      if (ok === null) { if (msg) msg.textContent = T('Could not check your phone\'s lock. Tap Unlock to try again.'); return; }
      if (!ok) { if (msg) msg.textContent = NAT.pinFallback ? T('This phone no longer has a screen lock. Set one up in your phone settings, then tap Unlock, or log out and log in with your password.') : T('This phone needs a fingerprint (or a secure face unlock) to unlock Wavelength. Set one up in your phone settings, then tap Unlock, or log out and log in with your password.'); return; }
      if (msg) msg.textContent = '';
      return NAT.verify({ reason: T('Unlock your Wavelength logbook'), title: T('Unlock Wavelength'), subtitle: T('Your ultrasound logbook'), cancel: T('Cancel') }).then(function (yes) { if (yes) { hideLock(); NAT.haptic('success'); } });
    }).then(function () { lockBusy = false; }, function () { lockBusy = false; });
  }
  function lockCard() {
    if (!NAT.on) return '';
    return '<h2 class="sec">' + esc(T('Security')) + '</h2><div class="card"><label class="check"><input type="checkbox" id="lck"' + (NAT.lockOn() ? ' checked' : '') + '><span>' + esc(T('Lock the app with fingerprint or face')) + '</span></label><p class="small muted" style="margin:8px 0 0">' + esc(T('Asks for your fingerprint or face when you open Wavelength, and after it has been in the background for a while.')) + ' ' + esc(NAT.pinFallback ? T('Your phone\'s PIN, pattern or password also works. Wavelength uses your phone\'s own prompt and never sees your fingerprint or face.') : T('Wavelength uses your phone\'s own prompt and never sees your fingerprint or face.')) + '</p></div>';
  }
  function bindLockCard() {
    var c = $('#lck'); if (!c) return;
    c.onchange = function () {
      var want = c.checked;
      if (!want) { NAT.setLock(false); toast(T('App lock off.')); return; }
      c.disabled = true; lockBusy = true;
      NAT.lockAvailable().then(function (ok) {
        if (!ok) { c.checked = false; toast(NAT.pinFallback ? T('Set up a screen lock (PIN, pattern, password, fingerprint or face) in your phone settings first.') : T('Set up fingerprint or face unlock in your phone settings first.'), 5000); return; }
        return NAT.verify({ reason: T('Turn on app lock'), title: T('Turn on app lock'), subtitle: T('Your ultrasound logbook'), cancel: T('Cancel') }).then(function (yes) {
          if (!yes) { c.checked = false; return; }
          return NAT.setLock(true).then(function () { NAT.haptic('success'); toast(T('App lock on.')); });
        });
      }).then(function () { c.disabled = false; lockBusy = false; }, function () { c.disabled = false; lockBusy = false; c.checked = false; });
    };
  }

  // ---------- Start ----------
  if ('serviceWorker' in navigator && !NAT.on) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(function () {});
  function boot() {
    var qs = new URLSearchParams(location.search);
    var hr = route();
    if (hr.name === 'supervise' && hr.q.get('invite')) {
      try { sessionStorage.setItem('wl-invite', hr.q.get('invite')); } catch (e) { /* storage blocked */ }
      history.replaceState(null, '', location.pathname + location.search + '#/supervise');
    }
    if (hr.name === 'verify-email') { render(); return; }
    if (qs.get('reset')) location.hash = '#/reset';
    else if (qs.get('login') && !/supervise/.test(location.hash)) location.hash = '#/login';
    app.innerHTML = '<div class="auth" data-boot><div class="auth-head" style="padding-top:30vh">' + MARK(64, 'rgba(247,245,240,.6)') + '<div class="wm">WAVELENGTH</div></div></div>';
    var t0 = Date.now(), c = cachedAccount();
    diag('path', 'start');
    // Nothing may keep the start screen up: after BOOT_WAIT it gives way to a screen with a way on.
    setTimeout(function () { if (app.querySelector('[data-boot]')) { diag('path', 'recovery'); viewRecovery(); } }, BOOT_WAIT);
    var opened = function () { diag('ui', Date.now() - t0); };
    var open = function (acc) { lockFirst(); return signedIn(acc).then(opened); };
    var offline = function () { if (c && c.id && (!NAT.on || NAT.signedIn())) return open(c); render(); opened(); };
    NAT.ready.then(function () {
      // The app on a phone that is signed in opens its logbook from the phone at once, behind the app lock when it
      // is on. The server check (loadMe) runs behind it: a login the server no longer accepts still signs out.
      if (NAT.on && c && c.id && NAT.signedIn()) { diag('path', 'local'); return open(c); }
      if (NAT.on && c && c.id && NAT.readFailed()) { diag('path', 'recovery'); return viewRecovery(); }
      diag('path', 'server');
      // Leave time to open the logbook offline before BOOT_WAIT shows the recovery screen.
      return api('/api/app/me', undefined, { timeout: Math.max(2000, BOOT_WAIT - 2000 - (Date.now() - t0)) }).then(function (res) {
        diag('me', String(res._status)); diag('meMs', Date.now() - t0);
        if (res.ok) { S.me = res; return open(res.account); }
        // A server error, or an answer that is not the API's (a captive portal page): open from the phone.
        if (res._status >= 500 || res._nojson) return offline();
        cacheAccount(null);
        if (qs.get('login')) location.hash = '#/login';
        else if (res.academy && !location.hash.match(/login|signup|reset/)) location.hash = '#/signup';
        render(); opened();
      }, function (ex) { diag('me', ex && ex.timeout ? 'timeout' : 'offline'); return offline(); });
    }).catch(function () {
      // The logbook on the phone could not be opened (storage error). Say so at once, rather than wait for BOOT_WAIT.
      if (S.db) return;
      diag('path', 'storage-error'); viewRecovery(true);
    });
  }
  var BOOT_WAIT = 10000;
  // Shown instead of an endless start screen. Nothing on the phone is changed or deleted.
  function viewRecovery(storage) {
    if (storage) authFrame(T('Wavelength could not open the logbook saved on this phone.'), T('Nothing has been deleted. Close Wavelength completely, then open it again. If this keeps happening, restart your phone.'), '<div class="btns"><button class="btn teal block" type="button" data-retry>' + esc(T('Try again')) + '</button></div>');
    else authFrame(T('Wavelength is taking longer than usual to start.'), T('Your entries stay saved on this device. Check your connection, then try again.'),
      '<div class="btns"><button class="btn teal block" type="button" data-retry>' + esc(T('Try again')) + '</button>' + (cachedAccount() ? '' : '<a class="btn ghost block" href="#/login">' + esc(T('Log in')) + '</a>') + '</div>');
    $('[data-retry]').onclick = function () { location.reload(); };
  }
  // A short record of the last 10 starts on this device (timings and outcomes only, no personal data), shown in
  // Settings under Sync, so a slow or stuck start on a phone can be explained without debugging tools.
  var DIAG = { at: Date.now(), path: '', ui: 0, me: '', meMs: 0 };
  function diag(k, v) {
    DIAG[k] = v;
    try {
      var a = JSON.parse(localStorage.getItem('wl-diag') || '[]');
      if (a.length && a[a.length - 1].at === DIAG.at) a[a.length - 1] = DIAG; else a.push(DIAG);
      localStorage.setItem('wl-diag', JSON.stringify(a.slice(-10)));
    } catch (e) { /* storage blocked */ }
  }
  var want = pickLang();
  if (want === 'en') { setLangVars('en'); boot(); }
  else loadScript('/app/i18n/' + want + '.js?v=' + (window.WL_BUILD || '')).then(function () { setLangVars(want); boot(); }, function () { setLangVars('en'); boot(); });
})();
