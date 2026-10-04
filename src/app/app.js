// Wavelength app: ultrasound logbook, progress against accreditation targets, sign-off, exports and backups.
// Logbook text syncs to the learner's account. Images stay on this device (IndexedDB) and in backups the learner makes.
(function () {
  'use strict';
  var C = window.WL_LOGBOOK;
  var TYPES = {}; C.types.forEach(function (t) { TYPES[t.id] = t; });
  var PATHS = {}; C.pathways.forEach(function (p) { PATHS[p.id] = p; });
  var DESTS = C.destinations || [], DEST = {}; DESTS.forEach(function (d) { DEST[d.id] = d; });
  var app = document.getElementById('app');
  var S = { account: null, me: null, entries: [], kv: {}, db: null, online: navigator.onLine, syncing: false, installEvt: null, urls: {} };

  // ---------- Small helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid() { var a = crypto.getRandomValues(new Uint8Array(12)); return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join(''); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function fmt(iso, o) { if (!iso) return ''; return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', o || { day: 'numeric', month: 'short', year: 'numeric' }); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  var MARK = function (size, ring) { return '<svg class="mark" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="30" stroke="' + (ring || 'currentColor') + '" stroke-width="2"/><path d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke="#7FC4CC" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; };
  var I = {
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    book: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/><path d="M8 8h8M8 11.5h5"/></svg>',
    plus: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    chart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/></svg>',
    user: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    pen: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    file: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    cloud: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5"/></svg>',
    camera: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    target: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.5"/></svg>',
    cert: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M9 13.5 7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/></svg>',
    share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v8h14v-8"/></svg>'
  };
  function toast(msg, ms) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function api(path, data) {
    var opt = { credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (data !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; if (r.status === 401 && j.auth === false && S.account) { signedOut(); } return j; });
    });
  }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load ' + src + '. Check your connection.')); }; document.head.appendChild(s); }); }

  // ---------- Local database: one per account, so two people on one device never mix logbooks ----------
  function openDb(id) {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('wavelength-' + id, 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        db.createObjectStore('entries', { keyPath: 'id' });
        var im = db.createObjectStore('images', { keyPath: 'id' }); im.createIndex('entryId', 'entryId');
        db.createObjectStore('kv', { keyPath: 'k' });
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

  // ---------- Sync ----------
  function live() { return S.entries.filter(function (e) { return !e.deleted; }); }
  function strip(e) { var o = {}; for (var k in e) if (k.charAt(0) !== '_') o[k] = e[k]; return o; }
  function saveLocal(e) { var i = S.entries.findIndex(function (x) { return x.id === e.id; }); if (i >= 0) S.entries[i] = e; else S.entries.push(e); return put('entries', e); }
  function setSyncDot() { var d = $('.sync-dot'); if (!d) return; d.classList.toggle('off', !S.online); d.classList.toggle('busy', S.syncing); d.title = !S.online ? 'Offline. Changes save on this device and sync when you reconnect.' : S.syncing ? 'Syncing' : 'Synced'; }
  function sync() {
    if (!S.account || !navigator.onLine) return Promise.resolve();
    if (S.syncing) { S.again = S.again || S.syncP.then(function () { S.again = null; return sync(); }); return S.again; }
    S.syncing = true; setSyncDot();
    S.syncP = doSync();
    return S.syncP;
  }
  function doSync() {
    var dirty = S.entries.filter(function (e) { return e._dirty; });
    var push = dirty.length ? api('/api/app/sync', { entries: dirty.map(strip) }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'Sync failed');
      return Promise.all((res.saved || []).map(function (s) {
        if (s.conflict) return null;
        var local = S.entries.find(function (x) { return x.id === s.id; });
        if (s.deleted) { S.entries = S.entries.filter(function (x) { return x.id !== s.id; }); return del('entries', s.id); }
        var merged = Object.assign({}, s); if (local && local._new) delete merged._new;
        return saveLocal(merged);
      }));
    }) : Promise.resolve();
    return push.then(function () { return api('/api/app/sync?since=' + (S.kv.lastSync || 0)); }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'Sync failed');
      return Promise.all((res.entries || []).map(function (e) {
        var local = S.entries.find(function (x) { return x.id === e.id; });
        if (local && local._dirty) return null;
        if (e.deleted) { S.entries = S.entries.filter(function (x) { return x.id !== e.id; }); dropImages(e.id); return del('entries', e.id); }
        return saveLocal(e);
      })).then(function () { return setKv('lastSync', res.now); });
    }).catch(function () { /* offline or server error: try again later */ }).then(function () {
      S.syncing = false; setSyncDot();
      if (['home', 'log', 'progress', 'entry'].indexOf(route().name) >= 0 && !document.querySelector('form[data-dirty]')) render(true);
    });
  }
  function dropImages(entryId) { return imagesFor(entryId).then(function (list) { return Promise.all(list.map(function (r) { return del('images', r.id); })); }).catch(function () {}); }

  // ---------- Progress against targets ----------
  function profile() { return (S.account && S.account.profile) || {}; }
  function myPaths() { var p = profile().pathways || []; return p.length ? p : ['general']; }
  function matches(e, match) {
    return Object.keys(match).every(function (k) {
      var v = k.indexOf('f.') === 0 ? (e.findings || {})[k.slice(2)] : e[k];
      return match[k].indexOf(v) >= 0;
    });
  }
  function moduleStats(pw, mod, entries) {
    var t = (profile().targets || {})[mod.id] || {};
    var total = t.total != null ? t.total : mod.total, sup = t.supervised != null ? t.supervised : (mod.supervised || 0);
    var list = entries.filter(function (e) { return mod.types.indexOf(e.type) >= 0 && (e.exclude || []).indexOf(mod.id) < 0; });
    var over = 0;
    var rules = (mod.rules || []).map(function (r) {
      var n = list.filter(function (e) { return matches(e, r.match); }).length;
      if (r.max != null && n > r.max) over += n - r.max;
      return { label: r.label, n: n, min: r.min, max: r.max };
    });
    var counted = Math.max(0, list.length - over);
    var supervised = list.filter(function (e) { return e.supervision === 'direct'; }).length;
    var reflections = list.filter(function (e) { return e.reflection && String(e.reflection).trim().length > 20; }).length;
    var signed = list.filter(function (e) { return e.signoff && e.signoff.status === 'confirmed'; }).length;
    var parts = [];
    if (total) parts.push(Math.min(1, counted / total));
    if (sup) parts.push(Math.min(1, supervised / sup));
    if (mod.reflections) parts.push(Math.min(1, reflections / mod.reflections));
    rules.forEach(function (r) { if (r.min) parts.push(Math.min(1, r.n / r.min)); });
    var frac = parts.length ? Math.min.apply(null, parts) : (list.length ? 1 : 0);
    var met = parts.length && frac >= 1;
    var main = total ? Math.min(1, counted / total) : 0;
    return { mod: mod, list: list, total: total, sup: sup, counted: counted, supervised: supervised, reflections: reflections, signed: signed, rules: rules, frac: frac, main: main, met: met, colour: met ? 'green' : frac >= 1 / 3 ? 'amber' : 'red', need: Math.max(0, total - counted) };
  }
  function pathwayStats(pid) {
    var pw = PATHS[pid]; var ents = live();
    var mods = pw.modules.slice();
    if (pid === 'general') {
      var seen = {}; ents.forEach(function (e) { seen[e.type] = (seen[e.type] || 0) + 1; });
      var custom = profile().targets || {};
      Object.keys(custom).forEach(function (k) { if (k.indexOf('gen-') === 0 && custom[k].total) seen[k.slice(4)] = seen[k.slice(4)] || 0; });
      mods = Object.keys(seen).filter(function (t) { return TYPES[t]; }).map(function (t) { return { id: 'gen-' + t, label: TYPES[t].label, types: [t], total: 0 }; });
    }
    var stats = mods.map(function (m) { return moduleStats(pw, m, ents); });
    var win = null;
    if (pw.windowFrom) {
      var rel = ents.filter(function (e) { return pw.modules.some(function (m) { return m.types.indexOf(e.type) >= 0; }) && (pw.windowFrom === 'firstScan' || e.supervision === 'direct'); }).map(function (e) { return e.date; }).sort();
      var start = (profile().windowStart || {})[pid] || rel[0];
      if (start) win = { start: start, end: addDays(start, pw.windowDays), day: daysBetween(start, today()), days: pw.windowDays };
    }
    return { pw: pw, stats: stats, win: win };
  }
  function ring(frac, colour, label) {
    var r = 27, c = 2 * Math.PI * r, col = { red: '#B4453A', amber: '#B7791F', green: '#2E7D5B' }[colour];
    return '<div class="ring"><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#EDEAE3" stroke-width="6"/><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + (c * Math.max(0.02, frac)).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg><b>' + label + '</b></div>';
  }
  function barRow(label, n, target, kind) {
    if (kind === 'max') {
      var bad = n > target;
      return '<div class="bar-row"><div class="lbl"><span>' + esc(label) + '</span><b>' + n + ' of ' + target + ' allowed</b></div><div class="bar ' + (bad ? 'over' : 'green') + '"><i style="width:' + Math.min(100, target ? 100 * n / target : 0) + '%"></i></div></div>';
    }
    var f = target ? Math.min(1, n / target) : 1, col = f >= 1 ? 'green' : f >= 1 / 3 ? 'amber' : '';
    return '<div class="bar-row"><div class="lbl"><span>' + esc(label) + '</span><b>' + n + ' / ' + target + (f >= 1 ? ' ✓' : '') + '</b></div><div class="bar ' + col + '"><i style="width:' + (100 * f) + '%"></i></div></div>';
  }
  function needText(s) {
    if (!s.total && !s.sup) return plural(s.list.length, 'scan') + ' logged';
    if (s.met) return 'Target met';
    var bits = [];
    if (s.need) bits.push(plural(s.need, 'more scan'));
    if (s.sup > s.supervised) bits.push((s.sup - s.supervised) + ' more supervised');
    if (s.mod.reflections && s.mod.reflections > s.reflections) bits.push(plural(s.mod.reflections - s.reflections, 'more reflection'));
    s.rules.forEach(function (r) { if (r.min && r.n < r.min) bits.push((r.min - r.n) + ' more ' + r.label.toLowerCase()); });
    return bits.slice(0, 2).join(', ') + (bits.length > 2 ? ' and more' : '') + ' needed';
  }

  // ---------- Install ("Download the app") ----------
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; $$('[data-install]').forEach(function (b) { b.hidden = false; }); });
  window.addEventListener('appinstalled', function () { S.installEvt = null; toast('Wavelength is on your home screen.'); $$('[data-install]').forEach(function (b) { b.hidden = true; }); });
  function canInstall() { return !standalone && (S.installEvt || isIOS || /android/i.test(navigator.userAgent)); }
  function installButton(label) {
    return '<button class="get-app" type="button" data-install' + (canInstall() ? '' : ' hidden') + '><span class="ico">' + MARK(30, '#7FC4CC') + '</span><span><small>' + (isIOS ? 'Add to your iPhone' : 'Get it for your phone') + '</small><b>' + (label || 'Download the Wavelength app') + '</b></span></button>';
  }
  function doInstall() {
    if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(function () { S.installEvt = null; }); return; }
    sheet('<h2>Install Wavelength</h2><p class="muted">' + (isIOS ? 'Two taps put Wavelength on your home screen. It then opens full screen like any app and keeps your photos safe from Safari clearing its storage.' : 'Open your browser menu and choose Install app or Add to Home screen.') + '</p>' +
      (isIOS ? '<ol class="ios-steps"><li><span>Tap the <b>Share</b> button ' + I.share + ' in Safari\'s toolbar.</span></li><li><span>Scroll and tap <b>Add to Home Screen</b>.</span></li><li><span>Tap <b>Add</b>. Open Wavelength from your home screen from now on.</span></li></ol><p class="small muted" style="margin-top:12px">Using Chrome on iPhone? Open thewavelength.co.uk/app in Safari first.</p>' : '<ol class="ios-steps"><li><span>Tap the <b>⋮</b> menu in Chrome.</span></li><li><span>Tap <b>Install app</b> or <b>Add to Home screen</b>.</span></li><li><span>Open Wavelength from your home screen.</span></li></ol>') +
      '<div class="btns"><button class="btn block" data-close>Done</button></div>');
  }

  // ---------- Router ----------
  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('?')[0];
    var parts = h.split('/');
    return { name: parts[0] || 'home', arg: parts[1] || null, q: new URLSearchParams(location.hash.split('?')[1] || '') };
  }
  function go(h) { if (location.hash === '#/' + h) render(); else location.hash = '#/' + h; }
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });
  window.addEventListener('online', function () { S.online = true; setSyncDot(); sync(); });
  window.addEventListener('offline', function () { S.online = false; setSyncDot(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });

  function shell(opts, body) {
    var r = route().name;
    var tab = function (name, href, icon, label) { return '<a href="#/' + href + '"' + (r === name || (opts.tab === name) ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></a>'; };
    var top = opts.hero ? '' : '<header class="top">' + (opts.back ? '<a class="back" href="#/' + opts.back + '" aria-label="Back">' + I.back + '</a>' : MARK(34, 'rgba(247,245,240,.5)')) + '<h1>' + esc(opts.title) + '</h1>' + (opts.action || '') + '<span class="sync-dot" aria-hidden="true"></span></header>';
    return top + (opts.hero || '') + '<main class="' + (opts.hero ? 'flush' : '') + '">' + body + '</main>' +
      '<nav class="tabs" aria-label="App">' + tab('home', '', I.home, 'Home') + tab('log', 'log', I.book, 'Logbook') + '<a class="plus" href="#/new" aria-label="Log a scan">' + I.plus + '<span>Log</span></a>' + tab('progress', 'progress', I.chart, 'Progress') + tab('me', 'me', I.user, 'Me') + '</nav>';
  }

  var keepScroll = 0;
  function render(soft) {
    var r = route();
    if (soft) keepScroll = window.scrollY;
    if (!S.account) {
      var authViews = { signup: viewSignup, login: viewLogin, reset: viewReset };
      return (authViews[r.name] || viewWelcome)(r);
    }
    if (!S.account.declarationAt || !(profile().onboarded)) return viewOnboard(r);
    var views = { home: viewHome, log: viewLog, new: viewEdit, edit: viewEdit, entry: viewEntry, progress: viewProgress, me: viewMe, signoff: viewSignoff, export: viewExport, evidence: viewEvidence, backup: viewBackup, targets: viewTargets, declaration: viewDeclaration };
    (views[r.name] || viewHome)(r);
    setSyncDot();
    if (soft) window.scrollTo(0, keepScroll);
  }
  function mount(html) { app.innerHTML = html; $$('[data-install]', app).forEach(function (b) { b.addEventListener('click', doInstall); }); }

  // ---------- Auth views ----------
  function authFrame(title, lede, body) {
    app.innerHTML = '<div class="auth"><div class="auth-head">' + MARK(64, 'rgba(247,245,240,.6)') + '<div class="wm">WAVELENGTH</div><div class="tag">TUNE IN · GAIN CLARITY</div>' + (title ? '<h1>' + title + '</h1>' : '') + (lede ? '<p>' + lede + '</p>' : '') + '</div><div class="auth-body"><div class="inner">' + body + '</div></div></div>';
  }
  function viewWelcome() {
    var f = function (icon, t, d) { return '<div class="feature"><span class="fi">' + icon + '</span><div><b>' + t + '</b><span>' + d + '</span></div></div>'; };
    authFrame('Your ultrasound logbook.', 'Log every scan, watch your accreditation targets fill up, and get signed off. Built by consultant ultrasound supervisors.',
      '<div class="features">' + f(I.target, 'RCEM, FAMUS and FUSIC targets', 'One scan counts towards every pathway it fits, with live colour-coded progress.') + f(I.camera, 'Photos stay on your phone', 'Crop and cover identifiers before you save. Wavelength never sees your images.') + f(I.pen, 'Sign-off in seconds', 'Your supervisor signs on your phone or from a link, with a code anyone can verify.') + f(I.file, 'Portfolio-ready exports', 'PDF, Excel or CSV in the format your assessor expects.') + '</div>' +
      '<a class="btn teal block" href="#/signup">Create your free account</a><div class="btns" style="justify-content:center"><a class="link" href="#/login">I already have an account</a></div>' +
      '<div style="margin-top:22px">' + installButton() + '</div>');
    $$('[data-install]', app).forEach(function (b) { b.addEventListener('click', doInstall); });
  }
  function formData(form) { var o = {}; new FormData(form).forEach(function (v, k) { o[k] = v; }); return o; }
  function busy(btn, on, label) { btn.disabled = on; if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || 'Please wait…'; } else btn.textContent = btn.dataset.l || btn.textContent; }
  function viewSignup() {
    authFrame('Create your account.', 'Free. Your Academy certificates and your logbook in one place.',
      '<form id="f" novalidate><div class="err" hidden></div>' +
      '<div class="field"><label for="title">Title</label><select id="title" name="title"><option value="">None</option><option>Dr</option><option>Prof</option><option>Mr</option><option>Mrs</option><option>Ms</option><option>Miss</option><option>Mx</option></select></div>' +
      '<div class="two"><div class="field"><label for="fn">First name</label><input id="fn" name="firstName" type="text" autocomplete="given-name" required></div><div class="field"><label for="ln">Last name</label><input id="ln" name="lastName" type="text" autocomplete="family-name" required></div></div>' +
      '<div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label for="pw">Password</label><p class="hint">At least 10 characters.</p><input id="pw" name="password" type="password" autocomplete="new-password" minlength="10" required></div>' +
      '<div class="field"><label for="role">Role</label><input id="role" name="role" type="text" placeholder="For example ST4 emergency medicine, ACP, consultant" autocomplete="organization-title"></div>' +
      '<div class="field"><label for="org">Hospital or organisation</label><input id="org" name="organisation" type="text" autocomplete="organization"></div>' +
      '<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<div class="field"><label class="check"><input type="checkbox" name="newsletter" value="1"><span>Send me the Wavelength newsletter (optional).</span></label></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="terms" value="1" required><span>I accept the <a href="/app-terms/" target="_blank" rel="noopener">logbook terms of use</a> and the <a href="/privacy/" target="_blank" rel="noopener">privacy notice</a>.</span></label></div>' +
      '<button class="btn teal block" type="submit">Create account</button><div class="btns" style="justify-content:center"><a class="link" href="#/login">Log in instead</a></div></form>');
    var f = $('#f'), err = $('.err', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var d = formData(f); var b = $('button[type=submit]', f);
      if (!f.checkValidity()) { err.textContent = !d.terms ? 'Tick the box to accept the terms and privacy notice.' : (d.password || '').length < 10 ? 'Choose a password of at least 10 characters.' : 'Complete your name and email.'; err.hidden = false; return; }
      busy(b, true, 'Creating your account…');
      api('/api/app/signup', d).then(function (res) {
        if (!res.ok) throw new Error(res.error);
        if (d.newsletter) joinNewsletter(d);
        return signedIn(res.account);
      }).catch(function (ex) { busy(b, false); err.textContent = ex.message || 'Something went wrong. Please try again.'; err.hidden = false; });
    });
  }
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
    authFrame('Welcome back.', '', '<form id="f" novalidate><div class="err" hidden></div>' +
      '<div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" value="' + esc(pre) + '" required></div>' +
      '<div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn teal block" type="submit">Log in</button><div class="btns" style="justify-content:space-between"><a class="link" href="#/reset">Forgotten your password?</a><a class="link" href="#/signup">Create an account</a></div></form>');
    var f = $('#f'), err = $('.err', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true; var b = $('button', f); busy(b, true, 'Logging in…');
      api('/api/app/login', formData(f)).then(function (res) {
        if (!res.ok) { var ex = new Error(res.error); ex.noPassword = res.noPassword; throw ex; }
        return signedIn(res.account);
      }).catch(function (ex) { busy(b, false); err.innerHTML = esc(ex.message || 'Something went wrong.') + (ex.noPassword ? ' <a href="#/signup">Create your account</a>' : ''); err.hidden = false; });
    });
  }
  function viewReset() {
    var t = new URLSearchParams(location.search).get('reset');
    if (t) {
      authFrame('Choose a new password.', '', '<form id="f"><div class="err" hidden></div><div class="field"><label for="pw">New password</label><p class="hint">At least 10 characters.</p><input id="pw" name="password" type="password" autocomplete="new-password" minlength="10" required></div><button class="btn teal block">Save and log in</button></form>');
      var f = $('#f'), err = $('.err', f);
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var b = $('button', f); busy(b, true);
        api('/api/app/reset/complete', { token: t, password: $('#pw').value }).then(function (res) {
          if (!res.ok) throw new Error(res.error); history.replaceState(null, '', '/app/#/'); return signedIn(res.account);
        }).catch(function (ex) { busy(b, false); err.textContent = ex.message; err.hidden = false; });
      });
      return;
    }
    authFrame('Reset your password.', 'Enter your email and we will send you a link.', '<form id="f"><div class="ok" hidden></div><div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required></div><button class="btn teal block">Send reset link</button><div class="btns" style="justify-content:center"><a class="link" href="#/login">Back to log in</a></div></form>');
    var f2 = $('#f');
    f2.addEventListener('submit', function (e) {
      e.preventDefault(); var b = $('button', f2); busy(b, true);
      api('/api/app/reset/request', { email: $('#em').value }).then(function (res) {
        busy(b, false); var ok = $('.ok', f2); ok.hidden = false;
        ok.textContent = res.emailOn === false ? 'Password reset by email is not switched on yet. Email hello@thewavelength.co.uk from the address you registered with and we will help.' : 'If that email has an account, a reset link is on its way. Check your junk folder too.';
      });
    });
  }
  function signedIn(acc) {
    S.account = acc;
    return openDb(acc.id).then(function (db) { S.db = db; return Promise.all([all('entries'), all('kv')]); }).then(function (r) {
      S.entries = r[0] || []; S.kv = {}; (r[1] || []).forEach(function (x) { S.kv[x.k] = x.v; });
      var next = new URLSearchParams(location.search).get('next');
      if (next && /^\/elearning\//.test(next)) { location.href = next; return; }
      if (location.search) history.replaceState(null, '', '/app/' + location.hash);
      render(); sync(); loadMe();
    });
  }
  function signedOut() { S.account = null; S.db = null; S.entries = []; S.me = null; location.hash = '#/welcome'; render(); }
  function loadMe() { return api('/api/app/me').then(function (res) { if (res.ok) { S.me = res; S.account = res.account; if (route().name === 'home' || route().name === 'me') render(true); } }); }

  // ---------- Onboarding ----------
  var DESC = { rcem: 'Emergency medicine trainees. AAA, eFAST, ELS, shock, vascular access and fascia iliaca block.', famus: 'Society for Acute Medicine. Thoracic, abdominal-renal, DVT, peripheral access and LP modules.', fusic: 'Intensive Care Society. Heart, lung, abdomen, DVT and vascular access.', general: 'Any clinician using ultrasound. Log any application and set your own targets.' };
  function viewOnboard() {
    if (!profile().onboarded) {
      authFrame('Which pathways are you working towards?', 'Choose one or more. A scan counts towards every pathway it fits. Change this any time.',
        '<form id="f">' + C.pathways.map(function (p) { return '<label class="pathcard"><input type="checkbox" name="p" value="' + p.id + '"' + ((profile().pathways || []).indexOf(p.id) >= 0 ? ' checked' : '') + '><div><b>' + esc(p.label === 'General' ? 'General logbook' : p.label) + '</b><span>' + DESC[p.id] + '</span></div></label>'; }).join('') +
        '<div class="field" style="margin-top:16px"><label for="grade">Grade or role (optional)</label><input id="grade" name="grade" type="text" placeholder="For example ST4, ACP, consultant" value="' + esc(profile().grade || S.account.role || '') + '"></div>' +
        '<div class="err" hidden></div><button class="btn teal block">Continue</button></form>');
      var f = $('#f');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var ps = $$('input[name=p]:checked', f).map(function (i) { return i.value; });
        if (!ps.length) { var er = $('.err', f); er.textContent = 'Choose at least one, or General logbook.'; er.hidden = false; return; }
        saveProfile({ pathways: ps, grade: $('#grade').value, onboarded: true }).then(render);
      });
      return;
    }
    authFrame('Before you log a scan.', '', declarationHtml() + '<form id="f" style="margin-top:16px"><label class="check"><input type="checkbox" required id="ag"><span>I understand and accept responsibility for everything I store in my logbook.</span></label><div class="btns"><button class="btn teal block" disabled>Agree and start</button></div></form>');
    var ag = $('#ag'), b = $('#f button');
    ag.addEventListener('change', function () { b.disabled = !ag.checked; });
    $('#f').addEventListener('submit', function (e) { e.preventDefault(); busy(b, true); api('/api/app/profile', { declaration: true, profile: {} }).then(function (res) { if (res.ok) { S.account = res.account; go(''); render(); } else { busy(b, false); toast('Could not save. Check your connection.'); } }); });
  }
  function declarationHtml() {
    return '<div class="decl"><p class="eyebrow">Your responsibility</p><p><b>You are the data controller for what you put in your logbook.</b> Wavelength does not need, and must never receive, patient-identifiable information.</p><ul>' +
      '<li>Never type names, dates of birth, NHS or hospital numbers, addresses or other identifiers into any field.</li>' +
      '<li>Before you save a photo, crop or cover every identifier on the screen, including names, numbers, dates and the hospital name. The app strips hidden photo data when it saves.</li>' +
      '<li>Photos stay on this device and in backups you choose to make. They are never uploaded to Wavelength.</li>' +
      '<li>Follow your trust\'s policies on clinical photography, removable media and personal devices. Some trusts need patient consent or do not allow photos of screens. If unsure, log the scan without a photo.</li>' +
      '<li>Wavelength accepts no responsibility for identifiable information you store, photograph or share. Anything found must be deleted by you at once.</li></ul>' +
      '<p class="small muted">Full details in the <a href="/app-terms/" target="_blank" rel="noopener">logbook terms of use</a>.</p></div>';
  }
  function saveProfile(p, extra) {
    var prof = Object.assign({}, profile(), p);
    return api('/api/app/profile', Object.assign({ profile: prof }, extra || {})).then(function (res) { if (res.ok) S.account = res.account; else throw new Error(res.error || 'Could not save. Check your connection.'); return res; });
  }

  // ---------- Home ----------
  function viewHome() {
    var ents = live(), month = today().slice(0, 7);
    var signed = ents.filter(function (e) { return e.signoff && e.signoff.status === 'confirmed'; }).length;
    var pending = ents.filter(function (e) { return !(e.signoff && e.signoff.status === 'confirmed'); }).length;
    var name = S.account.firstName;
    var hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    var hero = '<header class="top" style="padding-bottom:4px">' + MARK(34, 'rgba(247,245,240,.5)') + '<h1 style="font:600 13px var(--sans);letter-spacing:.38em">WAVELENGTH</h1><span class="sync-dot" aria-hidden="true"></span></header>' +
      '<section class="hero"><p class="hi">' + hi + ', ' + esc(name) + '.</p><p class="sub">' + (ents.length ? plural(ents.length, 'scan') + ' in your logbook.' : 'Log your first scan to start tracking your targets.') + '</p>' +
      '<div class="stats"><div class="stat"><b>' + ents.length + '</b><span>Scans</span></div><div class="stat"><b>' + ents.filter(function (e) { return e.date.slice(0, 7) === month; }).length + '</b><span>This month</span></div><div class="stat"><b>' + signed + '</b><span>Signed off</span></div><div class="stat"><b>' + pending + '</b><span>To sign</span></div></div></section>';
    var quick = '<div class="card" style="margin-top:16px;padding:10px"><div style="display:grid;grid-template-columns:repeat(4,1fr);text-align:center;font-size:12px;font-weight:600">' +
      [['new', I.plus, 'Log a scan'], ['signoff', I.pen, 'Sign-off'], ['export', I.file, 'Export'], ['backup', I.cloud, 'Back up']].map(function (q) { return '<a href="#/' + q[0] + '" style="text-decoration:none;color:var(--navy);display:grid;gap:6px;justify-items:center;padding:8px 2px"><span style="width:44px;height:44px;border-radius:14px;background:var(--sand);display:grid;place-items:center">' + q[1] + '</span>' + q[2] + '</a>'; }).join('') + '</div></div>';
    var install = canInstall() ? '<div style="margin:0 0 12px">' + installButton() + '</div>' : '';
    var backup = backupNudge();
    var paths = myPaths().map(function (pid) {
      var ps = pathwayStats(pid);
      var rows = ps.stats.filter(function (s) { return s.total || s.list.length; }).sort(function (a, b) { return b.list.length - a.list.length; }).slice(0, 4);
      if (!rows.length) return '<div class="card"><h3>' + esc(ps.pw.label === 'General' ? 'General logbook' : ps.pw.label) + '</h3><p class="muted small">No scans yet. Your targets appear here as you log.</p></div>';
      return '<a class="card" href="#/progress/' + pid + '" style="display:block;text-decoration:none;color:inherit"><div class="row" style="margin-bottom:10px"><h3 class="grow">' + esc(ps.pw.label === 'General' ? 'General logbook' : ps.pw.label) + '</h3><span class="small" style="color:var(--teal);font-weight:600">Details</span></div><div class="mini">' +
        rows.map(function (s) { return s.total ? barRow(s.mod.label, s.counted, s.total) : '<div class="bar-row"><div class="lbl"><span>' + esc(s.mod.label) + '</span><b>' + s.list.length + '</b></div></div>'; }).join('') + '</div></a>';
    }).join('');
    var recent = ents.slice().sort(sortEntries).slice(0, 4);
    var academy = academyCard();
    var course = (C.courses || [])[0];
    mount(shell({ hero: hero }, quick + install + backup +
      '<h2 class="sec">Your progress <a href="#/progress">All targets</a></h2>' + paths +
      '<h2 class="sec">Recent scans <a href="#/log">Logbook</a></h2>' + (recent.length ? recent.map(entryRow).join('') : '<div class="card"><p class="muted">Nothing logged yet.</p><a class="btn teal" href="#/new">Log your first scan</a></div>') +
      academy +
      (course ? '<h2 class="sec">Next course</h2><a class="card teal" href="/courses/' + esc(course.slug) + '/" style="display:block;text-decoration:none"><p class="eyebrow" style="color:var(--teal-l)">' + esc(fmt(course.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</p><h3>' + esc(course.title) + '</h3><p class="muted" style="color:#cfe3e6">' + esc([course.venue, course.city].filter(Boolean).join(', ')) + '</p><span class="btn light sm">See the course</span></a>' : '')));
    loadThumbs();
  }
  function academyCard() {
    if (!S.me) return '';
    var certs = S.me.certificates || [], mods = S.me.modules || [];
    var done = {}; certs.forEach(function (c) { done[c.module] = c; });
    var hours = certs.reduce(function (s, c) { return s + Number(c.cpd_hours || 0); }, 0);
    return '<h2 class="sec">Wavelength Academy <a href="/elearning/">All modules</a></h2><div class="card dark"><div class="row"><span style="color:var(--teal-l)">' + I.cert + '</span><div class="grow"><h3>' + plural(certs.length, 'certificate') + ' · ' + hours + ' CPD ' + (hours === 1 ? 'hour' : 'hours') + '</h3><p class="muted small" style="margin:0">' + certs.length + ' of ' + mods.length + ' modules passed. Every certificate carries a code anyone can verify.</p></div></div>' +
      (certs.length ? '<div style="margin-top:12px;display:grid;gap:6px">' + certs.slice(0, 3).map(function (c) { return '<a href="/elearning/certificate/' + esc(c.code) + '/" style="color:var(--cream);text-decoration:none;display:flex;justify-content:space-between;gap:10px;font-size:14px;border-top:1px solid rgba(247,245,240,.1);padding-top:8px"><span>' + esc(c.module_title) + '</span><span style="color:var(--teal-l)">View</span></a>'; }).join('') + '</div>' : '') +
      '<div class="btns"><a class="btn light sm" href="/elearning/">' + (certs.length ? 'Continue learning' : 'Start a free module') + '</a></div></div>';
  }
  function backupNudge() {
    var withImg = live().filter(function (e) { return (e.images || []).length; }).length;
    if (!withImg) return '';
    var last = S.kv.lastBackup, days = last ? daysBetween(last.slice(0, 10), today()) : null;
    if (last && days < 14) return '';
    return '<div class="card" style="border-color:#e9d6b0;background:var(--amber-bg)"><div class="row"><span style="color:var(--amber)">' + I.cloud + '</span><div class="grow"><h3>Back up your photos</h3><p class="small" style="margin:0">' + (last ? 'Last backup ' + plural(days, 'day') + ' ago.' : 'Your scan photos live only on this phone.') + ' Save a copy to iCloud, Google Drive or OneDrive.</p></div></div><div class="btns"><a class="btn sm" href="#/backup">Back up now</a></div></div>';
  }

  // ---------- Logbook list ----------
  function sortEntries(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0); }
  function summary(e) {
    var t = TYPES[e.type]; if (!t) return '';
    var f = e.findings || {};
    var bits = t.fields.filter(function (fd) { var v = f[fd.id]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); }).slice(0, 3).map(function (fd) { var v = f[fd.id]; return fd.label + ': ' + (Array.isArray(v) ? v.join(', ') : v) + (fd.unit ? ' ' + fd.unit : ''); });
    return (e.overall ? e.overall + '. ' : '') + bits.join('; ');
  }
  function statusChip(e) {
    if (e.signoff && e.signoff.status === 'confirmed') return '<span class="chip green">Signed off</span>';
    if (e.signoff && e.signoff.status === 'query') return '<span class="chip amber">Query</span>';
    if (e.signoffVoid) return '<span class="chip amber">Edited, re-sign</span>';
    return '<span class="chip">Not signed</span>';
  }
  var SUP = {}; C.supervision.forEach(function (s) { SUP[s.id] = s.label; });
  function entryRow(e) {
    var t = TYPES[e.type] || { label: e.type, short: e.type };
    return '<a class="entry" href="#/entry/' + esc(e.id) + '"><span class="thumb" data-thumb="' + esc(e.id) + '">' + esc(t.short) + '</span><div class="grow"><h3>' + esc(t.label) + '</h3><p>' + esc(fmt(e.date)) + (e.setting ? ' · ' + esc(e.setting) : '') + '</p><div class="meta">' + statusChip(e) + (e.supervision === 'direct' ? '<span class="chip teal">Supervised</span>' : '') + (e._dirty ? '<span class="chip">Not synced</span>' : '') + '</div></div></a>';
  }
  function loadThumbs() {
    $$('[data-thumb]').forEach(function (el) {
      var e = S.entries.find(function (x) { return x.id === el.dataset.thumb; });
      if (!e || !(e.images || []).length) return;
      getOne('images', e.images[0].id).then(function (rec) { if (rec) el.innerHTML = '<img alt="" src="' + imgUrl(rec, true) + '">'; });
    });
  }
  function viewLog(r) {
    var f = r.q.get('type') || 'all', q = (r.q.get('q') || '').toLowerCase(), st = r.q.get('s') || '';
    var ents = live().sort(sortEntries);
    var used = {}; ents.forEach(function (e) { used[e.type] = (used[e.type] || 0) + 1; });
    var list = ents.filter(function (e) {
      if (f !== 'all' && e.type !== f) return false;
      if (st === 'unsigned' && e.signoff && e.signoff.status === 'confirmed') return false;
      if (st === 'signed' && !(e.signoff && e.signoff.status === 'confirmed')) return false;
      if (q && JSON.stringify(e).toLowerCase().indexOf(q) < 0 && (TYPES[e.type] || {}).label.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var groups = {}; list.forEach(function (e) { var m = e.date.slice(0, 7); (groups[m] = groups[m] || []).push(e); });
    var filt = function (k, label, n) { return '<button type="button" data-f="' + k + '" aria-pressed="' + (f === k) + '">' + esc(label) + (n != null ? ' · ' + n : '') + '</button>'; };
    mount(shell({ title: 'Logbook', action: '<a class="act" href="#/signoff" style="text-decoration:none">Sign-off</a>' },
      '<div class="search"><input type="search" id="q" placeholder="Search your logbook" value="' + esc(q) + '" aria-label="Search"><a class="btn ghost sm" href="#/export" style="flex:none">Export</a></div>' +
      '<div class="filters">' + filt('all', 'All', ents.length) + Object.keys(used).map(function (t) { return filt(t, (TYPES[t] || {}).short || t, used[t]); }).join('') + '</div>' +
      '<div class="seg" style="margin:0 0 6px">' + [['', 'Any status'], ['unsigned', 'Not signed off'], ['signed', 'Signed off']].map(function (o) { return '<input type="radio" name="st" id="st' + o[0] + '" value="' + o[0] + '"' + (st === o[0] ? ' checked' : '') + '><label for="st' + o[0] + '">' + o[1] + '</label>'; }).join('') + '</div>' +
      (list.length ? Object.keys(groups).map(function (m) { return '<p class="month">' + fmt(m + '-15', { month: 'long', year: 'numeric' }) + ' · ' + groups[m].length + '</p>' + groups[m].map(entryRow).join(''); }).join('') :
        '<div class="empty">' + I.book.replace('width="24" height="24"', 'width="48" height="48"') + '<p>' + (ents.length ? 'No scans match.' : 'Your logbook is empty.') + '</p><a class="btn teal" href="#/new">Log a scan</a></div>')));
    var upd = function (k, v) { var p = route().q; if (v) p.set(k, v); else p.delete(k); history.replaceState(null, '', '#/log?' + p.toString()); viewLog(route()); };
    $$('[data-f]').forEach(function (b) { b.addEventListener('click', function () { upd('type', b.dataset.f === 'all' ? '' : b.dataset.f); }); });
    $$('input[name=st]').forEach(function (i) { i.addEventListener('change', function () { upd('s', i.value); }); });
    var qi = $('#q'), tmr; qi.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { upd('q', qi.value); var n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); });
    loadThumbs();
  }

  // ---------- Entry form ----------
  var GUARD = [
    [/\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/, 'a 10-digit number (NHS number?)'],
    [/\b\d{1,2}[\/.]\d{1,2}[\/.](19|20)\d{2}\b/, 'a date (date of birth?)'],
    [/\b[A-Z]{1,4}\d{5,9}\b/i, 'a hospital number'],
    [/\b(Mr|Mrs|Ms|Miss|Master)\.?\s+[A-Z][a-z]+/, 'a patient name'],
    [/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/, 'a postcode']
  ];
  function guard(e) {
    var texts = [e.indication, e.interpretation, e.impact, e.reflection].concat(Object.keys(e.findings || {}).map(function (k) { return typeof e.findings[k] === 'string' ? e.findings[k] : ''; }));
    var hits = [];
    texts.forEach(function (t) { GUARD.forEach(function (g) { if (t && g[0].test(t) && hits.indexOf(g[1]) < 0) hits.push(g[1]); }); });
    return hits;
  }
  function seg(name, opts, val, cls) {
    return '<div class="seg ' + (cls || '') + '">' + opts.map(function (o, i) {
      var v = typeof o === 'string' ? o : o.id, l = typeof o === 'string' ? o : o.label, id = name.replace(/\W/g, '') + i;
      return '<input type="radio" name="' + name + '" id="' + id + '" value="' + esc(v) + '"' + (val === v ? ' checked' : '') + '><label for="' + id + '">' + esc(l) + '</label>';
    }).join('') + '</div>';
  }
  function fieldHtml(fd, val) {
    var n = 'f.' + fd.id, id = 'f_' + fd.id;
    if (fd.type === 'choice') return '<div class="field"><span class="lab">' + esc(fd.label) + '</span>' + seg(n, fd.options, val) + '</div>';
    if (fd.type === 'multi') return '<div class="field"><span class="lab">' + esc(fd.label) + '</span><div class="seg">' + fd.options.map(function (o, i) { return '<input type="checkbox" name="' + n + '" id="' + id + i + '" value="' + esc(o) + '"' + ((val || []).indexOf(o) >= 0 ? ' checked' : '') + '><label for="' + id + i + '">' + esc(o) + '</label>'; }).join('') + '</div></div>';
    if (fd.type === 'number') return '<div class="field"><label for="' + id + '">' + esc(fd.label) + (fd.unit ? ' (' + fd.unit + ')' : '') + '</label><input id="' + id + '" name="' + n + '" type="number" inputmode="decimal" step="any" value="' + esc(val == null ? '' : val) + '"></div>';
    return '<div class="field"><label for="' + id + '">' + esc(fd.label) + '</label><input id="' + id + '" name="' + n + '" type="text" value="' + esc(val || '') + '"></div>';
  }
  function modulesForType(type) {
    var out = [];
    myPaths().forEach(function (pid) { PATHS[pid].modules.forEach(function (m) { if (m.types.indexOf(type) >= 0) out.push({ id: m.id, label: PATHS[pid].label + ' ' + m.label }); }); });
    return out;
  }
  var draftImages = []; // images added in the form but not yet saved: { id, blob, thumb, w, h, declared }
  function viewEdit(r) {
    var editing = r.name === 'edit' ? S.entries.find(function (x) { return x.id === r.arg; }) : null;
    var copyFrom = r.q.get('copy') ? S.entries.find(function (x) { return x.id === r.q.get('copy'); }) : null;
    var e = editing ? JSON.parse(JSON.stringify(strip(editing))) : { date: today(), supervision: '', setting: (copyFrom || {}).setting || S.kv.lastSetting || '', age: (copyFrom || {}).age || '', sex: (copyFrom || {}).sex || '', type: r.q.get('type') || '' };
    if (copyFrom) { e.date = copyFrom.date; e.indication = copyFrom.indication; e.supervisor = copyFrom.supervisor; e.supervision = copyFrom.supervision; e.patient = copyFrom.patient || copyFrom.id; }
    if (!editing) draftImages = [];
    var mine = {}; myPaths().forEach(function (pid) { PATHS[pid].modules.forEach(function (m) { m.types.forEach(function (t) { mine[t] = 1; }); }); });
    var ordered = C.types.slice().sort(function (a, b) { return (mine[b.id] || 0) - (mine[a.id] || 0); });
    var supNames = []; live().forEach(function (x) { if (x.supervisor && supNames.indexOf(x.supervisor) < 0) supNames.push(x.supervisor); });
    var body = '<form id="ef" novalidate>' +
      (copyFrom ? '<div class="ok">Same patient as your ' + esc((TYPES[copyFrom.type] || {}).label) + ' scan. Choose the next application.</div>' : '') +
      '<div class="field"><span class="lab">Application</span><div class="seg types">' + ordered.map(function (t, i) { return '<input type="radio" name="type" id="t' + i + '" value="' + t.id + '"' + (e.type === t.id ? ' checked' : '') + '><label for="t' + i + '">' + esc(t.label) + '</label>'; }).join('') + '</div></div>' +
      '<div id="rest"' + (e.type ? '' : ' hidden') + '>' +
      '<div class="two"><div class="field"><label for="date">Date</label><input id="date" name="date" type="date" max="' + today() + '" value="' + esc(e.date) + '" required></div>' +
      '<div class="field"><label for="setting">Setting</label><select id="setting" name="setting"><option value="">Choose</option>' + C.settings.map(function (s) { return '<option' + (e.setting === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="two"><div class="field"><label for="age">Age band</label><select id="age" name="age"><option value="">Not recorded</option>' + C.ageBands.map(function (s) { return '<option' + (e.age === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="sex">Sex</label><select id="sex" name="sex"><option value="">Not recorded</option>' + ['Female', 'Male'].map(function (s) { return '<option' + (e.sex === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="ind">Indication</label><input id="ind" name="indication" type="text" placeholder="Clinical question, no identifiers" value="' + esc(e.indication || '') + '"></div>' +
      '<div id="findings" class="card" style="padding:16px 14px 2px"></div>' +
      '<div class="field"><span class="lab">Overall</span>' + seg('overall', ['Normal', 'Abnormal', 'Indeterminate'], e.overall) + '</div>' +
      '<div class="field"><span class="lab">Image quality</span>' + seg('quality', ['Good', 'Adequate', 'Limited', 'Inadequate'], e.quality) + '</div>' +
      '<div class="field"><label for="interp">Your interpretation</label><textarea id="interp" name="interpretation" placeholder="What you saw and what it means">' + esc(e.interpretation || '') + '</textarea></div>' +
      '<div class="two"><div class="field"><label for="conf">Confirmed by</label><select id="conf" name="confirmation"><option value="">Not yet</option>' + C.confirmation.map(function (s) { return '<option' + (e.confirmation === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="conc">Agreement</label><select id="conc" name="concordant"><option value="">Not applicable</option>' + ['Agreed', 'Partly agreed', 'Disagreed'].map(function (s) { return '<option' + (e.concordant === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="impact">Impact on management</label><input id="impact" name="impact" type="text" placeholder="For example, changed fluid plan, avoided CT" value="' + esc(e.impact || '') + '"></div>' +
      '<div class="field"><span class="lab">Supervision</span>' + seg('supervision', C.supervision, e.supervision) + '</div>' +
      '<div class="field"><label for="supv">Supervisor or mentor</label><input id="supv" name="supervisor" type="text" list="supl" placeholder="Name" value="' + esc(e.supervisor || '') + '"><datalist id="supl">' + supNames.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><span class="lab">Images</span><p class="hint">Stay on this phone only. Crop and cover identifiers before you save.</p><div class="gallery" id="gal"></div>' +
      '<input type="file" accept="image/*" capture="environment" id="cam" hidden><input type="file" accept="image/*" id="pick" hidden multiple></div>' +
      '<div class="field"><label for="refl">Reflection</label><p class="hint">What you learned and what you will do differently. Counts as a reflective note.</p><textarea id="refl" name="reflection">' + esc(e.reflection || '') + '</textarea></div>' +
      '<div id="counts"></div>' +
      '<div class="err" hidden></div><div class="btns" style="position:sticky;bottom:calc(var(--tab) + var(--safe-b) + 8px)"><button class="btn teal block" type="submit">' + (editing ? 'Save changes' : 'Save scan') + '</button></div>' +
      '</div></form>';
    mount(shell({ title: editing ? 'Edit scan' : copyFrom ? 'Another scan' : 'Log a scan', back: editing ? 'entry/' + editing.id : '', tab: 'new' }, body));
    var form = $('#ef');
    var drawFindings = function () {
      var t = TYPES[(form.querySelector('input[name=type]:checked') || {}).value];
      $('#rest').hidden = !t;
      if (!t) return;
      var cur = readFindings();
      $('#findings').innerHTML = '<p class="eyebrow">' + esc(t.label) + ' findings</p>' + t.fields.map(function (fd) { return fieldHtml(fd, cur[fd.id] != null ? cur[fd.id] : (e.type === t.id ? (e.findings || {})[fd.id] : null)); }).join('');
      var mods = modulesForType(t.id), ex = e.exclude || [];
      $('#counts').innerHTML = mods.length ? '<div class="field"><span class="lab">Counts towards</span><p class="hint">Untick any target this scan should not count towards.</p><div class="seg">' + mods.map(function (m, i) { return '<input type="checkbox" name="count" id="cm' + i + '" value="' + m.id + '"' + (ex.indexOf(m.id) < 0 ? ' checked' : '') + '><label for="cm' + i + '">' + esc(m.label) + '</label>'; }).join('') + '</div></div>' : '';
    };
    var readFindings = function () {
      var out = {}, fd = new FormData(form);
      fd.forEach(function (v, k) { if (k.indexOf('f.') !== 0) return; var id = k.slice(2); var t = TYPES[(form.querySelector('input[name=type]:checked') || {}).value]; var def = t && t.fields.find(function (x) { return x.id === id; }); if (def && def.type === 'multi') (out[id] = out[id] || []).push(v); else if (v !== '') out[id] = def && def.type === 'number' ? Number(v) : v; });
      return out;
    };
    $$('input[name=type]', form).forEach(function (i) { i.addEventListener('change', function () { drawFindings(); form.dataset.dirty = '1'; setTimeout(function () { $('#rest').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }); });
    form.addEventListener('input', function () { form.dataset.dirty = '1'; });
    drawFindings();
    // Images
    var existing = editing ? (editing.images || []).slice() : [];
    var removed = [];
    var drawGallery = function () {
      var g = $('#gal');
      var items = existing.filter(function (x) { return removed.indexOf(x.id) < 0; }).map(function (x) { return '<button type="button" data-old="' + x.id + '"><img alt="Scan image" data-img="' + x.id + '"><span class="x" data-rm="' + x.id + '" aria-label="Remove image">×</span></button>'; })
        .concat(draftImages.map(function (x) { return '<button type="button"><img alt="Scan image" src="' + URL.createObjectURL(x.thumb) + '"><span class="x" data-rmd="' + x.id + '" aria-label="Remove image">×</span></button>'; }));
      g.innerHTML = items.join('') + '<button type="button" class="add" id="addcam">' + I.camera + 'Take photo</button><button type="button" class="add" id="addpick">' + I.file + 'Choose</button>';
      $$('[data-img]', g).forEach(function (im) { getOne('images', im.dataset.img).then(function (rec) { if (rec) im.src = imgUrl(rec, true); }); });
      $('#addcam').onclick = function () { $('#cam').click(); };
      $('#addpick').onclick = function () { $('#pick').click(); };
      $$('[data-rm]', g).forEach(function (x) { x.onclick = function (ev) { ev.stopPropagation(); removed.push(x.dataset.rm); form.dataset.dirty = '1'; drawGallery(); }; });
      $$('[data-rmd]', g).forEach(function (x) { x.onclick = function (ev) { ev.stopPropagation(); draftImages = draftImages.filter(function (d) { return d.id !== x.dataset.rmd; }); drawGallery(); }; });
    };
    drawGallery();
    var onFiles = function (inp) {
      var files = Array.prototype.slice.call(inp.files || []); inp.value = '';
      var nextFile = function () {
        var f = files.shift(); if (!f) return;
        if (existing.length - removed.length + draftImages.length >= 12) { toast('Up to 12 images per scan.'); return; }
        editImage(f).then(function (res) { if (res) { res.id = uid(); draftImages.push(res); form.dataset.dirty = '1'; drawGallery(); } nextFile(); });
      };
      nextFile();
    };
    $('#cam').addEventListener('change', function () { onFiles(this); });
    $('#pick').addEventListener('change', function () { onFiles(this); });
    // Save
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = $('.err', form); err.hidden = true;
      var d = formData(form);
      var out = editing ? Object.assign({}, strip(editing)) : { id: uid(), createdAt: Date.now() };
      ['type', 'date', 'setting', 'age', 'sex', 'indication', 'overall', 'quality', 'interpretation', 'confirmation', 'concordant', 'impact', 'supervision', 'supervisor', 'reflection'].forEach(function (k) { out[k] = (d[k] || '').trim ? (d[k] || '').trim() : d[k]; });
      out.findings = readFindings();
      if (copyFrom) out.patient = e.patient;
      var mods = modulesForType(out.type).map(function (m) { return m.id; });
      var ticked = $$('input[name=count]:checked', form).map(function (i) { return i.value; });
      out.exclude = mods.filter(function (m) { return ticked.indexOf(m) < 0; });
      if (!out.type) { err.textContent = 'Choose the application.'; err.hidden = false; return; }
      if (!out.date || out.date > today()) { err.textContent = 'Enter the date of the scan.'; err.hidden = false; return; }
      if (!out.supervision) { err.textContent = 'Choose the level of supervision.'; err.hidden = false; $('input[name=supervision]').scrollIntoView({ block: 'center' }); return; }
      var hits = guard(out);
      var finish = function () {
        var keepImgs = existing.filter(function (x) { return removed.indexOf(x.id) < 0; });
        out.images = keepImgs.concat(draftImages.map(function (x) { return { id: x.id, w: x.w, h: x.h, declared: true }; }));
        out._dirty = true; if (!editing) out._new = true;
        out.updatedAt = editing ? editing.updatedAt : 0;
        var jobs = draftImages.map(function (x) { return put('images', { id: x.id, entryId: out.id, blob: x.blob, thumb: x.thumb, w: x.w, h: x.h, created: Date.now() }); })
          .concat(removed.map(function (id) { return del('images', id); }));
        if (draftImages.length && navigator.storage && navigator.storage.persist) navigator.storage.persist();
        Promise.all(jobs).then(function () { return saveLocal(out); }).then(function () {
          setKv('lastSetting', out.setting); draftImages = [];
          delete form.dataset.dirty;
          sheet('<h2>Scan saved</h2><p class="muted">' + esc((TYPES[out.type] || {}).label) + ', ' + esc(fmt(out.date)) + '.</p>' + nextTargetsHtml(out) +
            '<div class="btns"><a class="btn teal block" href="#/new?copy=' + out.id + '" data-close>Another scan, same patient</a><a class="btn ghost block" href="#/new" data-close data-fresh>New patient</a><a class="btn ghost block" href="#/entry/' + out.id + '" data-close>View this scan</a></div>');
          go('entry/' + out.id); sync();
        }).catch(function (ex) { err.textContent = 'Could not save on this device: ' + (ex && ex.message || ex); err.hidden = false; });
      };
      if (hits.length) {
        sheet('<h2>Check for identifiers</h2><p>Your text looks like it includes ' + esc(hits.join(', ')) + '. Your logbook must never hold patient-identifiable information.</p><div class="btns"><button class="btn block" data-close>Go back and edit</button><button class="btn ghost block" data-ok>It is not an identifier, save</button></div>', function (root) { $('[data-ok]', root).onclick = function () { closeSheet(); finish(); }; });
        return;
      }
      finish();
    });
  }
  function nextTargetsHtml(e) {
    var rows = [];
    myPaths().forEach(function (pid) { var ps = pathwayStats(pid); ps.stats.forEach(function (s) { if (s.mod.types.indexOf(e.type) >= 0 && (e.exclude || []).indexOf(s.mod.id) < 0 && s.total) rows.push('<div class="mod ' + s.colour + '" style="margin:0 0 8px;padding:12px"><div class="row"><b class="grow">' + esc(ps.pw.label + ' ' + s.mod.label) + '</b><span>' + s.counted + ' / ' + s.total + '</span></div><p class="need small" style="margin:4px 0 0">' + esc(needText(s)) + '</p></div>'); }); });
    return rows.length ? '<div style="margin:12px 0">' + rows.join('') + '</div>' : '';
  }

  // ---------- Image editor: crop, cover identifiers, rotate. Re-encoding strips hidden photo data. ----------
  function editImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); toast('That file is not an image this phone can open.'); resolve(null); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 2200, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var work = document.createElement('canvas'); work.width = Math.round(img.naturalWidth * sc); work.height = Math.round(img.naturalHeight * sc);
        work.getContext('2d').drawImage(img, 0, 0, work.width, work.height);
        var undo = [], mode = 'crop', sel = null, start = null;
        var el = document.createElement('div'); el.className = 'editor';
        el.innerHTML = '<div class="bar-top"><button class="tool" data-a="cancel">Cancel</button><b style="flex:1;text-align:center">Prepare image</b><button class="tool" data-a="undo">Undo</button></div>' +
          '<div class="stage"><canvas></canvas><div class="sel" hidden></div></div>' +
          '<p class="tip" data-tip>Drag to choose the area to keep, then tap Apply crop. Most machines show patient details along the top: Trim top removes that strip.</p>' +
          '<div class="bar-bot"><button class="tool" data-m="crop" aria-pressed="true">Crop</button><button class="tool" data-m="cover" aria-pressed="false">Cover</button><button class="tool" data-a="trim">Trim top</button><button class="tool" data-a="rotate">Rotate</button><button class="tool" data-a="apply">Apply crop</button>' +
          '<label class="check" style="width:100%;color:#fff;padding:8px 4px 4px;font-size:14px"><input type="checkbox" data-decl><span>I have removed or covered every patient identifier in this image.</span></label>' +
          '<button class="btn teal block" data-a="save" disabled>Use this image</button></div>';
        document.body.appendChild(el);
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
        $$('[data-m]', el).forEach(function (b) { b.onclick = function () { mode = b.dataset.m; $$('[data-m]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); $('[data-a=apply]', el).hidden = mode !== 'crop'; $('[data-tip]', el).textContent = mode === 'crop' ? 'Drag to choose the area to keep, then tap Apply crop.' : 'Drag over any name, number, date or label to black it out.'; sel = null; showSel(); }; });
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
            var out = function (maxSide, q) { return new Promise(function (ok) { var s = Math.min(1, maxSide / Math.max(work.width, work.height)); var c = document.createElement('canvas'); c.width = Math.round(work.width * s); c.height = Math.round(work.height * s); var g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(work, 0, 0, c.width, c.height); c.toBlob(function (b) { ok({ b: b, w: c.width, h: c.height }); }, 'image/jpeg', q); }); };
            Promise.all([out(1600, 0.86), out(360, 0.72)]).then(function (r) { close({ blob: r[0].b, thumb: r[1].b, w: r[0].w, h: r[0].h, declared: true }); });
          }
        });
        draw();
      };
      img.src = url;
    });
  }

  // ---------- Entry detail ----------
  function viewEntry(r) {
    var e = S.entries.find(function (x) { return x.id === r.arg && !x.deleted; });
    if (!e) { mount(shell({ title: 'Scan', back: 'log' }, '<div class="empty"><p>This scan is not in your logbook.</p></div>')); return; }
    var t = TYPES[e.type] || { label: e.type, fields: [] };
    var row = function (k, v) { return v == null || v === '' || (Array.isArray(v) && !v.length) ? '' : '<dt>' + esc(k) + '</dt><dd>' + esc(Array.isArray(v) ? v.join(', ') : v) + '</dd>'; };
    var f = e.findings || {};
    var so = e.signoff;
    var signHtml = so ? '<div class="signbox ' + (so.status === 'confirmed' ? 'ok' : 'warn') + '"><b>' + (so.status === 'confirmed' ? 'Signed off' : 'Queried') + '</b> by ' + esc(so.name) + (so.role ? ', ' + esc(so.role) : '') + (so.reg ? ' (' + esc(so.reg) + ')' : '') + ' on ' + esc(fmt(so.at)) + (so.method === 'in-person' ? ', in person' : ', by link') + (so.basis ? ' (' + ({ witnessed: 'witnessed the scan', reviewed: 'reviewed the images', both: 'witnessed and reviewed' })[so.basis] + ')' : '') + '. Code ' + esc(so.code) + '.</div>'
      : e.signoffVoid ? '<div class="warn">Signed by ' + esc(e.signoffVoid.name) + ', then edited. Ask for sign-off again.</div>' : '<p class="muted small" style="margin:0">Not signed off yet.</p>';
    var mods = [];
    myPaths().forEach(function (pid) { PATHS[pid].modules.forEach(function (m) { if (m.types.indexOf(e.type) >= 0) mods.push('<span class="chip ' + ((e.exclude || []).indexOf(m.id) < 0 ? 'teal' : '') + '">' + esc(PATHS[pid].label + ' ' + m.label) + ((e.exclude || []).indexOf(m.id) < 0 ? '' : ', not counted') + '</span>'); }); });
    mount(shell({ title: t.label, back: 'log', action: '<a class="act" href="#/edit/' + esc(e.id) + '" style="text-decoration:none">Edit</a>' },
      '<div class="detail"><p class="eyebrow">' + esc(fmt(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</p>' +
      ((e.images || []).length ? '<div class="gallery" id="gal">' + e.images.map(function (im) { return '<button type="button" data-view="' + esc(im.id) + '"><img alt="Scan image" data-img="' + esc(im.id) + '"></button>'; }).join('') + '</div>' : '') +
      '<div class="card">' + signHtml + '</div>' +
      '<div class="card"><h3 style="margin-bottom:10px">Findings</h3><dl>' + t.fields.map(function (fd) { return row(fd.label, f[fd.id] != null ? f[fd.id] + (fd.unit && f[fd.id] !== '' ? ' ' + fd.unit : '') : null); }).join('') + row('Overall', e.overall) + row('Image quality', e.quality) + '</dl></div>' +
      '<div class="card"><h3 style="margin-bottom:10px">Context</h3><dl>' + row('Setting', e.setting) + row('Age band', e.age) + row('Sex', e.sex) + row('Indication', e.indication) + row('Supervision', SUP[e.supervision]) + row('Supervisor', e.supervisor) + '</dl></div>' +
      ((e.interpretation || e.confirmation || e.impact) ? '<div class="card"><h3 style="margin-bottom:10px">Interpretation and outcome</h3><dl>' + row('Interpretation', e.interpretation) + row('Confirmed by', e.confirmation) + row('Agreement', e.concordant) + row('Impact', e.impact) + '</dl></div>' : '') +
      (e.reflection ? '<div class="card"><h3>Reflection</h3><p style="white-space:pre-wrap">' + esc(e.reflection) + '</p></div>' : '') +
      (mods.length ? '<div class="card"><h3 style="margin-bottom:8px">Counts towards</h3><div class="meta" style="display:flex;flex-wrap:wrap;gap:6px">' + mods.join('') + '</div></div>' : '') +
      ((TYPES[e.type] || {}).learn ? '<a class="card dark" style="display:block;text-decoration:none" href="' + esc(TYPES[e.type].learn) + '"><p class="eyebrow" style="color:var(--teal-l)">Learn more</p><h3>' + esc(t.label) + ' on Wavelength</h3><p class="muted small">Free Pearls and certified Academy modules.</p></a>' : '') +
      '<div class="btns"><a class="btn teal" href="#/new?copy=' + esc(e.id) + '">Another scan, same patient</a>' + (!(so && so.status === 'confirmed') ? '<a class="btn ghost" href="#/signoff?e=' + esc(e.id) + '">Request sign-off</a>' : '') + '<button class="btn ghost" id="shb">' + I.share + ' Share case</button>' + '<button class="btn ghost danger-text" id="delb" style="color:var(--red)">Delete</button></div></div>'));
    $$('[data-img]').forEach(function (im) { getOne('images', im.dataset.img).then(function (rec) { if (rec) im.src = imgUrl(rec, true); else im.parentNode.innerHTML = '<span class="small" style="color:#B9C4D0;padding:6px">Image on another device or backup</span>'; }); });
    $$('[data-view]').forEach(function (b) { b.onclick = function () { getOne('images', b.dataset.view).then(function (rec) { if (!rec) return; var v = document.createElement('div'); v.className = 'viewer'; v.innerHTML = '<img alt="Scan image" src="' + imgUrl(rec) + '"><button class="btn sm light">Close</button>'; v.onclick = function () { v.remove(); }; document.body.appendChild(v); }); }; });
    $('#shb').onclick = function () {
      sheet('<h2>Share this case</h2><p class="muted small">Builds a one-page PDF of this scan for teaching, a colleague or your portfolio. Check every image and line is free of identifiers before you send it, and follow your trust\'s policy on sharing clinical images.</p><form id="scf">' + ((e.images || []).length ? '<label class="check"><input type="checkbox" name="images" value="1" checked><span>Include images</span></label>' : '') + '<label class="check" style="margin-top:10px"><input type="checkbox" name="reflections" value="1"><span>Include my reflection</span></label><label class="check" style="margin-top:10px"><input type="checkbox" required name="ok"><span>I have checked this case holds no patient identifiers.</span></label><div class="btns"><button class="btn teal block">Create PDF</button></div></form>', function (root) {
        $('#scf', root).addEventListener('submit', function (ev) { ev.preventDefault(); var d = formData(this); d.single = true; var b = $('button', this); busy(b, true, 'Building…'); exportPdf([e], d, []).then(function (out) { closeSheet(); deliver(out.blob, 'Wavelength-case-' + e.date + '-' + (TYPES[e.type] || {}).short + '.pdf'); }).catch(function (ex) { busy(b, false); toast(ex.message); }); });
      });
    };
    $('#delb').onclick = function () {
      sheet('<h2>Delete this scan?</h2><p class="muted">It leaves your logbook on every device, with its images on this phone. A sign-off on it is lost.</p><div class="btns"><button class="btn danger block" data-ok>Delete scan</button><button class="btn ghost block" data-close>Keep it</button></div>', function (root) {
        $('[data-ok]', root).onclick = function () { var d = { id: e.id, deleted: true, _dirty: true, updatedAt: e.updatedAt || 0 }; dropImages(e.id); saveLocal(d).then(function () { closeSheet(); toast('Scan deleted.'); go('log'); sync(); }); };
      });
    };
  }

  // ---------- Progress ----------
  function viewProgress(r) {
    var mine = myPaths(), pid = r.arg && PATHS[r.arg] ? r.arg : mine[0];
    var ps = pathwayStats(pid);
    var mods = ps.stats.map(function (s) {
      var label = s.total ? Math.round(100 * s.main) + '%' : s.list.length;
      return '<div class="mod ' + (s.total || s.sup ? s.colour : '') + '"><div class="mod-head">' + ring(s.total ? s.frac : 1, s.total ? s.colour : 'green', label) + '<div class="grow"><h3>' + esc(s.mod.label) + '</h3><p class="need">' + esc(needText(s)) + '</p></div></div>' +
        '<div class="bars">' + (s.total ? barRow('Scans', s.counted, s.total) : '') + (s.sup ? barRow('Directly supervised', s.supervised, s.sup) : '') + (s.mod.reflections ? barRow('Reflective notes', s.reflections, s.mod.reflections) : '') +
        s.rules.map(function (rl) { return rl.min ? barRow(rl.label, rl.n, rl.min) : barRow(rl.label, rl.n, rl.max, 'max'); }).join('') +
        (s.list.length ? '<div class="bar-row"><div class="lbl"><span>Signed off</span><b>' + s.signed + ' of ' + s.list.length + '</b></div></div>' : '') + '</div>' +
        (s.mod.minDays && ps.win ? '<p class="window">Minimum training period ' + plural(s.mod.minDays, 'day') + ': ' + (ps.win.day >= s.mod.minDays ? 'met.' : (s.mod.minDays - ps.win.day) + ' days to go.') + '</p>' : '') +
        '<div class="btns" style="margin-top:10px"><a class="btn ghost sm" href="#/log?type=' + s.mod.types[0] + '">See scans</a><a class="btn ghost sm" href="#/new?type=' + s.mod.types[0] + '">Log one</a></div></div>';
    }).join('');
    var win = ps.win ? '<div class="card"><h3>' + (ps.pw.windowFrom === 'firstSupervised' ? 'Training window' : 'Logbook window') + '</h3><p class="small" style="margin:0">Started ' + esc(fmt(ps.win.start)) + '. Complete by <b>' + esc(fmt(ps.win.end)) + '</b>' + (ps.win.day > ps.win.days ? ', <b style="color:var(--red)">window passed</b>' : ', ' + plural(Math.max(0, ps.win.days - ps.win.day), 'day') + ' left') + '.</p><div class="bar ' + (ps.win.day / ps.win.days > 0.8 ? '' : 'green') + '" style="margin-top:10px"><i style="width:' + Math.min(100, 100 * ps.win.day / ps.win.days) + '%"></i></div></div>' : '';
    mount(shell({ title: 'Progress', action: '<a class="act" href="#/targets/' + pid + '" style="text-decoration:none">Targets</a>' },
      '<nav class="pw-tabs">' + mine.map(function (p) { return '<a href="#/progress/' + p + '"' + (p === pid ? ' aria-current="page"' : '') + '>' + esc(PATHS[p].label) + '</a>'; }).join('') + '<a href="#/me?edit=pathways">+ Pathway</a></nav>' +
      (pid !== 'general' ? '<div class="legend"><span>Under a third</span><span class="a">On the way</span><span class="g">Target met</span></div>' : '') + win +
      (mods || '<div class="empty"><p>' + (pid === 'general' ? 'Log any scan and it appears here. Tap Targets to set your own.' : 'No modules.') + '</p><a class="btn teal" href="#/new">Log a scan</a></div>') +
      '<p class="small muted" style="margin-top:18px">' + esc(ps.pw.source) + ' Targets checked ' + esc(fmt(ps.pw.checked)) + '. Always confirm requirements with your supervisor and the current curriculum. You can adjust any target.</p>'));
  }
  function viewTargets(r) {
    var pid = PATHS[r.arg] ? r.arg : myPaths()[0], pw = PATHS[pid], tg = profile().targets || {};
    var mods = pid === 'general' ? C.types.map(function (t) { return { id: 'gen-' + t.id, label: t.label, total: 0 }; }) : pw.modules;
    mount(shell({ title: (pw.label === 'General' ? 'Your' : pw.label) + ' targets', back: 'progress/' + pid },
      '<p class="muted small">' + (pid === 'general' ? 'Set a target for any application. Leave blank for none.' : 'Defaults follow ' + esc(pw.label) + ' guidance. Change one only if your supervisor or a newer curriculum sets a different number.') + '</p><form id="tf">' +
      mods.map(function (m) { var t = tg[m.id] || {}; return '<div class="card"><h3>' + esc(m.label) + '</h3><div class="two" style="margin-top:8px"><div class="field" style="margin:0"><label for="t_' + m.id + '">Scans' + (m.total ? ' (default ' + m.total + ')' : '') + '</label><input id="t_' + m.id + '" data-m="' + m.id + '" data-k="total" type="number" min="0" inputmode="numeric" value="' + (t.total != null ? t.total : '') + '" placeholder="' + (m.total || '') + '"></div>' + (pid !== 'general' ? '<div class="field" style="margin:0"><label for="s_' + m.id + '">Supervised' + (m.supervised ? ' (default ' + m.supervised + ')' : '') + '</label><input id="s_' + m.id + '" data-m="' + m.id + '" data-k="supervised" type="number" min="0" inputmode="numeric" value="' + (t.supervised != null ? t.supervised : '') + '" placeholder="' + (m.supervised || '') + '"></div>' : '') + '</div></div>'; }).join('') +
      (pw.windowFrom ? '<div class="card"><h3>Window start</h3><p class="small muted">By default your ' + (pw.windowFrom === 'firstSupervised' ? 'first directly supervised scan' : 'first scan') + '. Set it if your training started earlier.</p><input type="date" id="ws" value="' + esc((profile().windowStart || {})[pid] || '') + '"></div>' : '') +
      '<div class="btns"><button class="btn teal block">Save targets</button><button type="button" class="btn ghost block" id="rs">Reset to defaults</button></div></form>'));
    var save = function (reset) {
      var t = Object.assign({}, profile().targets || {});
      mods.forEach(function (m) { delete t[m.id]; });
      if (!reset) $$('[data-m]').forEach(function (i) { if (i.value === '') return; t[i.dataset.m] = t[i.dataset.m] || {}; t[i.dataset.m][i.dataset.k] = Number(i.value); });
      var ws = Object.assign({}, profile().windowStart || {}); if ($('#ws')) { if ($('#ws').value && !reset) ws[pid] = $('#ws').value; else delete ws[pid]; }
      saveProfile({ targets: t, windowStart: ws }).then(function () { toast('Targets saved.'); go('progress/' + pid); }).catch(function (ex) { toast(ex.message); });
    };
    $('#tf').addEventListener('submit', function (e) { e.preventDefault(); save(false); });
    $('#rs').onclick = function () { save(true); };
  }

  // ---------- Sign-off ----------
  var ACCRED = ['RCEM-approved ultrasound supervisor', 'FAMUS mentor', 'FAMUS supervisor', 'FUSIC mentor', 'FUSIC supervisor', 'Consultant sonographer', 'Other'];
  function viewSignoff(r) {
    var pre = r.q.get('e');
    var todo = live().filter(function (e) { return !(e.signoff && e.signoff.status === 'confirmed'); }).sort(sortEntries);
    mount(shell({ title: 'Sign-off', back: 'log' },
      '<div class="card dark"><h3>Two ways to get signed off</h3><p class="muted small">In person: hand your phone to your supervisor, who signs with a finger. By link: send a secure link your supervisor opens on any device. Every sign-off gets a code anyone can verify at thewavelength.co.uk/verify.</p></div>' +
      (todo.length ? '<h2 class="sec">Choose scans <button class="link" id="selall" type="button">Select all</button></h2><form id="sf">' + todo.map(function (e) {
        var t = TYPES[e.type] || { label: e.type };
        return '<label class="pathcard"><input type="checkbox" name="e" value="' + esc(e.id) + '"' + (pre === e.id ? ' checked' : '') + (e._dirty ? ' disabled' : '') + '><div class="grow"><b>' + esc(t.label) + '</b><span>' + esc(fmt(e.date)) + ' · ' + esc(SUP[e.supervision] || '') + (e.supervisor ? ' · ' + esc(e.supervisor) : '') + (e._dirty ? ' · syncing, try again shortly' : '') + '</span><div style="margin-top:4px">' + statusChip(e) + '</div></div></label>';
      }).join('') + '<div class="btns" style="position:sticky;bottom:calc(var(--tab) + var(--safe-b) + 8px);background:var(--cream);padding:8px 0"><button class="btn teal" style="flex:1" type="button" data-m="person">Supervisor is with me</button><button class="btn" style="flex:1" type="button" data-m="link">Send a link</button></div></form>'
        : '<div class="empty"><p>Everything in your logbook is signed off.</p></div>') +
      '<h2 class="sec">Requests and history</h2><div id="hist"><p class="muted small">Loading…</p></div>'));
    var sel = function () { return $$('input[name=e]:checked').map(function (i) { return i.value; }); };
    var sa = $('#selall'); if (sa) sa.onclick = function () { var boxes = $$('input[name=e]:not(:disabled)'); var on = boxes.some(function (b) { return !b.checked; }); boxes.forEach(function (b) { b.checked = on; }); };
    $$('[data-m]').forEach(function (b) { b.onclick = function () { var ids = sel(); if (!ids.length) { toast('Choose at least one scan.'); return; } if (!navigator.onLine) { toast('Sign-off needs an internet connection.'); return; } (b.dataset.m === 'person' ? signInPerson : signByLink)(ids); }; });
    api('/api/app/signoffs').then(function (res) {
      var h = $('#hist'); if (!h) return;
      var list = (res.signoffs || []);
      h.innerHTML = list.length ? list.map(function (s) {
        var n = s.entry_ids.length, conf = Object.values(s.decisions || {}).filter(function (x) { return x === 'confirmed'; }).length;
        var st = s.status === 'signed' ? '<span class="chip green">Signed</span>' : s.status === 'pending' ? (s.expires_at < Date.now() ? '<span class="chip">Expired</span>' : '<span class="chip amber">Waiting</span>') : '<span class="chip">Cancelled</span>';
        return '<div class="card"><div class="row"><div class="grow"><b>' + esc(s.id) + '</b><p class="small muted" style="margin:2px 0 0">' + plural(n, 'scan') + ' · ' + (s.method === 'in-person' ? 'In person' : 'By link') + ' · ' + esc(fmt(s.signed_at || s.created_at)) + (s.supervisor_name ? ' · ' + esc(s.supervisor_name) : '') + (s.status === 'signed' ? ' · ' + conf + ' confirmed' : '') + '</p></div>' + st + '</div>' + (s.comment ? '<p class="small" style="margin:8px 0 0">“' + esc(s.comment) + '”</p>' : '') + (s.status === 'pending' && s.expires_at > Date.now() ? '<div class="btns"><button class="btn ghost sm" data-cancel="' + esc(s.id) + '">Cancel request</button></div>' : '') + '</div>';
      }).join('') : '<p class="muted small">No sign-offs yet.</p>';
      $$('[data-cancel]', h).forEach(function (b) { b.onclick = function () { api('/api/app/signoff/cancel', { code: b.dataset.cancel }).then(function () { toast('Request cancelled.'); viewSignoff(route()); }); }; });
    });
  }
  function entriesTable(ids) {
    return ids.map(function (id) { var e = S.entries.find(function (x) { return x.id === id; }); var t = TYPES[e.type] || {}; return '<div class="card" style="padding:12px"><div class="row"><div class="grow"><b>' + esc(t.label) + '</b><p class="small muted" style="margin:2px 0 0">' + esc(fmt(e.date)) + ' · ' + esc(SUP[e.supervision] || '') + '</p><p class="small" style="margin:4px 0 0">' + esc(summary(e)) + '</p></div><select data-dec="' + esc(id) + '" style="width:auto;min-height:40px;font-size:14px"><option value="confirmed">Confirm</option><option value="query">Query</option></select></div></div>'; }).join('');
  }
  function signInPerson(ids) {
    sheet('<h2>Hand your phone to your supervisor</h2><p class="muted small">' + esc(S.account.name) + ' is asking you to confirm ' + plural(ids.length, 'scan') + '. Check each one, then sign below.</p>' + entriesTable(ids) +
      '<form id="pf"><div class="field"><label for="sn">Your name</label><input id="sn" name="name" type="text" required autocomplete="off"></div>' +
      '<div class="field"><label for="sr">Role</label><input id="sr" name="role" type="text" placeholder="For example consultant in emergency medicine" required></div>' +
      '<div class="two"><div class="field"><label for="sg">GMC, NMC or HCPC number</label><input id="sg" name="registration" type="text" inputmode="numeric"></div><div class="field"><label for="sa">Accreditation</label><select id="sa" name="accreditation"><option value="">Choose</option>' + ACCRED.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></div></div>' +
'<div class="field"><span class="lab">How you know</span><div class="seg"><input type="radio" name="basis" id="bw" value="witnessed" checked><label for="bw">I watched the scan</label><input type="radio" name="basis" id="br" value="reviewed"><label for="br">I reviewed the images</label><input type="radio" name="basis" id="bb" value="both"><label for="bb">Both</label></div></div>' +
      '<div class="field"><label for="se">Email (optional)</label><input id="se" name="email" type="email"></div>' +
      '<div class="field"><label for="sc">Comment (optional)</label><textarea id="sc" name="comment" style="min-height:70px"></textarea></div>' +
      '<div class="field"><span class="lab">Signature</span><canvas class="sigpad" id="sig"></canvas><button type="button" class="link small" id="sigclr">Clear</button></div>' +
      '<label class="check"><input type="checkbox" name="confirm" value="1" required><span>I witnessed or reviewed these scans as stated, and the record above is accurate.</span></label>' +
      '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">Sign off</button><button type="button" class="btn ghost block" data-close>Cancel</button></div></form>', function (root) {
      var pad = sigPad($('#sig', root)); $('#sigclr', root).onclick = pad.clear;
      var f = $('#pf', root);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var d = formData(f), err = $('.err', f);
        if (!d.name || !d.role || !d.confirm) { err.textContent = 'Enter your name and role and tick the confirmation.'; err.hidden = false; return; }
        if (pad.empty()) { err.textContent = 'Sign in the box.'; err.hidden = false; return; }
        d.signature = pad.data(); d.entryIds = ids; d.decisions = {}; $$('[data-dec]', root).forEach(function (s) { d.decisions[s.dataset.dec] = s.value; });
        var b = $('button.teal', f); busy(b, true, 'Signing…');
        api('/api/app/signoff/inperson', d).then(function (res) {
          if (!res.ok) throw new Error(res.error); closeSheet();
          return sync().then(function () { sheet('<h2>Signed off</h2><p>Code <b>' + esc(res.code) + '</b>. Anyone can verify it at thewavelength.co.uk/verify.</p><div class="btns"><button class="btn teal block" data-close>Done</button></div>'); viewSignoff(route()); });
        }).catch(function (ex) { busy(b, false); err.textContent = ex.message || 'Could not sign. Check the connection.'; err.hidden = false; });
      });
    });
  }
  // Encrypted image sharing: AES-GCM 256 on this phone, key only in the link's #fragment. The server stores ciphertext.
  function b64u(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function shareImages(code, sets, onStep) {
    var raw = crypto.getRandomValues(new Uint8Array(32)), list = [], total = 0, done = 0;
    sets.forEach(function (st) { total += st.images.length; });
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']).then(function (key) {
      var chain = Promise.resolve();
      sets.forEach(function (st) {
        st.images.forEach(function (rec, n) {
          chain = chain.then(function () {
            onStep(++done, total);
            var iv = crypto.getRandomValues(new Uint8Array(12));
            return rec.blob.arrayBuffer().then(function (buf) {
              return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(code + ':' + st.entry + ':' + n) }, key, buf);
            }).then(function (ct) {
              var out = new Uint8Array(12 + ct.byteLength); out.set(iv, 0); out.set(new Uint8Array(ct), 12);
              return fetch('/api/app/signoff/image?code=' + encodeURIComponent(code) + '&entry=' + encodeURIComponent(st.entry) + '&n=' + n, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: out });
            }).then(function (r) { return r.json(); }).then(function (j) {
              if (!j.ok) throw new Error(j.error || 'Could not upload an image.');
              list.push({ entry: st.entry, n: n, w: rec.w || 0, h: rec.h || 0 });
            });
          });
        });
      });
      return chain;
    }).then(function () {
      return api('/api/app/signoff/images', { code: code, images: list, declared: true });
    }).then(function (j) { if (!j.ok) throw new Error(j.error || 'Could not share the images.'); return b64u(raw); });
  }
  function signByLink(ids) {
    var canShare = !!(S.me && S.me.imageShare && window.crypto && crypto.subtle);
    Promise.all(ids.map(function (id) { return canShare ? imagesFor(id).then(function (im) { return { entry: id, images: im.slice(0, 12) }; }) : { entry: id, images: [] }; })).then(function (sets) {
      sets = sets.filter(function (st) { return st.images.length; });
      var count = sets.reduce(function (a, st) { return a + st.images.length; }, 0);
      var imgPart = count ? '<div class="field"><label class="check"><input type="checkbox" id="incl" checked><span>Include ' + plural(count, 'image') + ' for your supervisor to review</span></label>' +
        '<div id="inclbox"><div class="gallery" style="margin-top:8px">' + sets.map(function (st) { return st.images.map(function (rec) { return '<button type="button" disabled><img alt="Image to share" src="' + imgUrl(rec, true) + '"></button>'; }).join(''); }).join('') + '</div>' +
        '<p class="hint">Images are encrypted on this phone. Wavelength cannot open them. They delete when your supervisor signs, when you cancel the request, or after 14 days.</p>' +
        '<label class="check"><input type="checkbox" id="decl"><span>I have checked every image above. No patient name, number, date of birth, hospital name or other identifier remains, and sharing them follows my trust\'s information governance policy.</span></label></div></div>' : '';
      sheet('<h2>Send a sign-off link</h2><p class="muted small">' + (count ? 'Your supervisor sees the record of ' + plural(ids.length, 'scan') + ' and, if you include them, your images.' : 'Your supervisor sees the text of ' + plural(ids.length, 'scan') + ', not your images.') + ' The link works for 14 days. Anyone with the link sees what it holds, so send it only to your supervisor.</p><form id="lf"><div class="field"><label for="ln2">Supervisor name (optional)</label><input id="ln2" name="supervisorName" type="text"></div>' + imgPart + '<div class="err" hidden></div><div class="btns"><button class="btn teal block">Create link</button></div></form>', function (root) {
        var incl = $('#incl', root);
        if (incl) incl.onchange = function () { $('#inclbox', root).hidden = !incl.checked; };
        $('#lf', root).addEventListener('submit', function (ev) {
          ev.preventDefault(); var b = $('button.teal', root), err = $('.err', root); err.hidden = true;
          var withImages = !!(incl && incl.checked);
          if (withImages && !$('#decl', root).checked) { err.textContent = 'Tick the declaration, or untick Include images.'; err.hidden = false; return; }
          busy(b, true);
          var code = null;
          api('/api/app/signoff/request', { entryIds: ids, supervisorName: $('#ln2', root).value }).then(function (res) {
            if (!res.ok) throw new Error(res.error);
            code = res.code;
            if (!withImages) return { link: res.link, images: 0 };
            return shareImages(res.code, sets, function (i, n) { b.textContent = 'Encrypting image ' + i + ' of ' + n + '…'; }).then(function (k) { return { link: res.link + '.' + k, images: count }; });
          }).then(function (out) {
            var msg = 'Please sign off ' + plural(ids.length, 'ultrasound scan') + ' in my Wavelength logbook: ' + out.link;
            var html = '<h2>Link ready</h2><p class="small muted">Send it by email, WhatsApp or Teams.' + (out.images ? ' It holds the key to ' + plural(out.images, 'encrypted image') + ', so send it only to your supervisor.' : ' Anyone with the link can sign, so send it only to your supervisor.') + '</p><div class="card" style="word-break:break-all;font-size:13px">' + esc(out.link) + '</div><div class="btns">' + (navigator.share ? '<button class="btn teal block" data-share>Share link</button>' : '') + '<button class="btn block" data-copy>Copy link</button><a class="btn ghost block" href="mailto:?subject=' + encodeURIComponent('Ultrasound logbook sign-off') + '&body=' + encodeURIComponent(msg) + '">Email it</a><button class="btn ghost block" data-close>Done</button></div>';
            closeSheet(); sheet(html, function (r2) {
              var sh = $('[data-share]', r2); if (sh) sh.onclick = function () { navigator.share({ title: 'Logbook sign-off', text: msg }).catch(function () {}); };
              $('[data-copy]', r2).onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(out.link) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { toast('Press and hold the link to copy it.'); }); };
            });
            viewSignoff(route());
          }).catch(function (ex) {
            if (code) api('/api/app/signoff/cancel', { code: code });
            busy(b, false); b.textContent = 'Create link'; err.textContent = ex.message || 'Could not create the link. Check the connection.'; err.hidden = false;
          });
        });
      });
    });
  }
  function sigPad(cv) {
    var g, drawn = false, last = null;
    var size = function () { cv.width = cv.clientWidth; cv.height = cv.clientHeight; g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#0F1E33'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; drawn = false; };
    setTimeout(size, 30);
    var pt = function (e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); last = pt(e); });
    cv.addEventListener('pointermove', function (e) { if (!last) return; var p = pt(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; drawn = true; });
    cv.addEventListener('pointerup', function () { last = null; });
    return { clear: size, empty: function () { return !drawn; }, data: function () { return cv.toDataURL('image/png'); } };
  }

  // ---------- Sheets ----------
  function sheet(html, bind) {
    closeSheet();
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) { if (e.target.closest('[data-fresh]')) draftImages = []; closeSheet(); } });
    document.body.appendChild(bg);
    var first = bg.querySelector('input, button, a'); if (first && first.tagName === 'INPUT') setTimeout(function () { first.focus(); }, 50);
    if (bind) bind(bg);
  }
  function closeSheet() { $$('.sheet-bg').forEach(function (s) { s.remove(); }); }

  // ---------- Export ----------
  function scansIn(pid) { var pw = PATHS[pid]; if (!pw || pid === 'general') return live().length; return live().filter(function (e) { return pw.modules.some(function (m) { return m.types.indexOf(e.type) >= 0; }); }).length; }
  function defaultDest() {
    var best = null, n = 0, p = myPaths();
    DESTS.forEach(function (x) { if (x.pathway && p.indexOf(x.pathway) >= 0) { var c = scansIn(x.pathway); if (c > n) { n = c; best = x.id; } } });
    return best || 'other';
  }
  function viewExport(r) {
    var ents = live(), first = ents.map(function (e) { return e.date; }).sort()[0] || today();
    var dest = (r && r.q.get('to')) || defaultDest();
    mount(shell({ title: 'Export', back: 'log' },
      '<p class="muted small">Exports build on this phone. A verified summary sends only counts and dates to your account, never images or findings.</p><form id="xf">' +
      '<div class="field"><label for="ds">Where is it going?</label><select id="ds" name="destination">' + DESTS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === dest ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><span class="lab">Format</span>' + seg('fmt', [{ id: 'pdf', label: 'PDF for your portfolio' }, { id: 'xlsx', label: 'Excel' }, { id: 'csv', label: 'CSV' }], 'pdf') + '</div>' +
      '<div class="two"><div class="field"><label for="from">From</label><input type="date" id="from" name="from" value="' + first + '"></div><div class="field"><label for="to">To</label><input type="date" id="to" name="to" value="' + today() + '"></div></div>' +
      '<div class="field"><label for="pw">Pathway</label><select id="pw" name="pathway"><option value="">All scans</option>' + myPaths().map(function (p) { return '<option value="' + p + '">' + esc(PATHS[p].label) + ' scans only</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="st">Status</label><select id="st" name="status"><option value="">All</option><option value="signed">Signed off only</option></select></div>' +
      '<div class="field" id="evopt"><label class="check"><input type="checkbox" name="verified" value="1" checked><span><b>Add a verified summary with a QR code.</b> Your supervisor, ARCP panel or accrediting body scans it to see your progress and sign-offs as Wavelength holds them. Needs internet.</span></label></div>' +
      '<div class="field"><label class="check"><input type="checkbox" name="reflections" value="1" checked><span>Include reflections</span></label></div>' +
      '<div class="field" id="imgopt"><label class="check"><input type="checkbox" name="images" value="1"><span>Include images from this phone (PDF only). Check every image is free of identifiers before you share the file.</span></label></div>' +
      '<div class="err" hidden></div><button class="btn teal block">Create export</button></form>'));
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
        if (d.pathway && !PATHS[d.pathway].modules.some(function (m) { return m.types.indexOf(e.type) >= 0; }) && d.pathway !== 'general') return false;
        return true;
      }).sort(function (a, b2) { return a.date.localeCompare(b2.date); });
      if (!list.length) { err.textContent = 'No scans match those choices.'; err.hidden = false; return; }
      busy(b, true, d.verified && d.fmt !== 'csv' ? 'Creating your verified summary…' : 'Building your file…');
      var evJob = d.verified && d.fmt !== 'csv' ? makeEvidence(d) : Promise.resolve(null);
      evJob.then(function (evd) {
        if (evd) b.textContent = 'Building your file…';
        var job = d.fmt === 'csv' ? Promise.resolve(exportCsv(list, d)) : d.fmt === 'xlsx' ? fetchSignoffs().then(function (so) { return exportXlsx(list, d, so, evd); }) : fetchSignoffs().then(function (so) { return exportPdf(list, d, so, evd); });
        return job.then(function (out) { return { out: out, ev: evd }; });
      }).then(function (res) { busy(b, false); deliver(res.out.blob, res.out.name, portfolioSteps(d.destination, res.ev)); })
        .catch(function (ex) { busy(b, false); err.textContent = ex.message || 'Could not build the file.'; err.hidden = false; });
    });
  }
  function makeEvidence(d) {
    if (!navigator.onLine) return Promise.reject(new Error('You are offline. Connect to the internet for a verified summary, or untick it.'));
    return sync().then(function () { return api('/api/app/evidence', { from: d.from, to: d.to, pathway: d.pathway || '', signedOnly: d.status === 'signed', destination: d.destination }); }).then(function (res) {
      if (!res.ok) throw new Error(res.error || 'Could not create the verified summary. Try again, or untick it.');
      return res;
    });
  }
  function portfolioSteps(destId, evd) {
    var x = DEST[destId] || DEST.other; if (!x) return null;
    var html = '<div class="card" style="margin-top:16px;text-align:left"><h3>Add it to ' + esc(x.id === 'other' ? 'your portfolio' : x.label.replace(/ \(.*\)$/, '')) + '</h3><ol class="steps">' + x.steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
      (evd ? '<p class="small muted" style="margin-top:10px">Verification code <b>' + esc(evd.code) + '</b></p><div class="btns"><button class="btn sm" type="button" data-copyev>Copy verification link</button><a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(evd.link) + '">Open it</a></div>' : '') + '</div>';
    return { html: html, bind: function (root) { var c = $('[data-copyev]', root); if (c) c.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(evd.link) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { prompt('Copy this link', evd.link); }); }; } };
  }
  function viewEvidence() {
    mount(shell({ title: 'Verified summaries', back: 'me' }, '<p class="muted small">Each verified summary has a code a reviewer checks online. Withdraw one you no longer want people to see. The code then shows as withdrawn.</p><div id="evl"><div class="card"><p class="muted small">Loading…</p></div></div><a class="btn teal block" href="#/export">Create a new export</a>'));
    api('/api/app/evidence').then(function (res) {
      var box = $('#evl'); if (!box) return;
      var rows = res.evidence || [];
      if (!res.ok) { box.innerHTML = '<div class="card"><p class="muted small">Connect to the internet to see your verified summaries.</p></div>'; return; }
      if (!rows.length) { box.innerHTML = '<div class="card"><p class="muted small">None yet. Tick "Add a verified summary" when you export your logbook.</p></div>'; return; }
      box.innerHTML = rows.map(function (x) {
        return '<div class="card"><div class="row"><div class="grow"><b>' + esc(x.id) + '</b><p class="small muted" style="margin:2px 0 0">' + esc((DEST[x.destination] || {}).label || 'Portfolio') + '<br>' + esc(fmt(x.period_from)) + ' to ' + esc(fmt(x.period_to)) + ' · created ' + esc(fmt(x.created_at)) + '</p></div><span class="chip ' + (x.withdrawn ? 'amber' : 'green') + '">' + (x.withdrawn ? 'Withdrawn' : 'Live') + '</span></div>' +
          (x.withdrawn ? '' : '<div class="btns"><button class="btn sm" data-copy="' + esc(x.id) + '">Copy link</button><button class="btn sm ghost" data-wd="' + esc(x.id) + '">Withdraw</button></div>') + '</div>';
      }).join('');
      $$('[data-copy]', box).forEach(function (bt) { bt.onclick = function () { var l = location.origin + '/app/verify/?code=' + bt.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { prompt('Copy this link', l); }); }; });
      $$('[data-wd]', box).forEach(function (bt) { bt.onclick = function () { if (!confirm('Withdraw ' + bt.dataset.wd + '? Anyone who checks this code will see it is withdrawn.')) return; api('/api/app/evidence/withdraw', { code: bt.dataset.wd }).then(function () { toast('Withdrawn.'); viewEvidence(); }); }; });
    });
  }
  function fetchSignoffs() { return navigator.onLine ? api('/api/app/signoffs').then(function (r) { return r.signoffs || []; }).catch(function () { return []; }) : Promise.resolve([]); }
  function deliver(blob, name, extra) {
    var file; try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
    var url = URL.createObjectURL(blob);
    var canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
    sheet('<h2>Your file is ready</h2><p class="muted small">' + esc(name) + ' · ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB</p><div class="btns">' + (canShare ? '<button class="btn teal block" data-share>' + I.share + ' Share or save</button>' : '') + '<a class="btn ' + (canShare ? 'ghost' : 'teal') + ' block" href="' + url + '" download="' + esc(name) + '">Download</a><button class="btn ghost block" data-close>Close</button></div>' + (extra ? extra.html : ''), function (root) {
      if (extra && extra.bind) extra.bind(root);
      var sh = $('[data-share]', root); if (sh) sh.onclick = function () { navigator.share({ files: [file], title: name }).catch(function () {}); };
    });
  }
  function dateStamp() { return today(); }
  function rowsFor(list, d) {
    var head = ['Date', 'Application', 'Setting', 'Age band', 'Sex', 'Indication', 'Findings', 'Overall', 'Image quality', 'Interpretation', 'Confirmed by', 'Agreement', 'Impact', 'Supervision', 'Supervisor', 'Images', 'Sign-off', 'Signed by', 'Sign-off date', 'Sign-off code'];
    if (d.reflections) head.push('Reflection');
    var rows = list.map(function (e) {
      var so = e.signoff || {};
      var f = e.findings || {}, t = TYPES[e.type] || { fields: [] };
      var findings = t.fields.filter(function (fd) { return f[fd.id] != null && f[fd.id] !== ''; }).map(function (fd) { return fd.label + ': ' + (Array.isArray(f[fd.id]) ? f[fd.id].join(', ') : f[fd.id]) + (fd.unit ? ' ' + fd.unit : ''); }).join('; ');
      var r = [e.date, t.label || e.type, e.setting, e.age, e.sex, e.indication, findings, e.overall, e.quality, e.interpretation, e.confirmation, e.concordant, e.impact, SUP[e.supervision] || '', e.supervisor, (e.images || []).length, so.status === 'confirmed' ? 'Signed off' : so.status === 'query' ? 'Queried' : 'Not signed', so.name ? so.name + (so.role ? ', ' + so.role : '') : '', so.at ? so.at.slice(0, 10) : '', so.code || ''];
      if (d.reflections) r.push(e.reflection || '');
      return r.map(function (x) { return x == null ? '' : x; });
    });
    return { head: head, rows: rows };
  }
  function exportCsv(list, d) {
    var t = rowsFor(list, d);
    var cell = function (v) { var s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    var csv = '﻿' + [t.head].concat(t.rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    return { blob: new Blob([csv], { type: 'text/csv' }), name: 'Wavelength-logbook-' + dateStamp() + '.csv' };
  }
  function summaryRows(list) {
    var rows = [['Pathway', 'Module', 'Scan target', 'Counted', 'Supervised target', 'Directly supervised', 'Signed off', 'Still needed', 'Status']];
    myPaths().forEach(function (pid) {
      var ents = list; var pw = PATHS[pid];
      var mods = pid === 'general' ? pathwayStats('general').stats.map(function (s) { return s.mod; }) : pw.modules;
      mods.forEach(function (m) { var s = moduleStats(pw, m, ents); rows.push([pw.label, m.label, s.total || '', s.counted, s.sup || '', s.supervised, s.signed, s.total ? needText(s) : '', s.met ? 'Met' : s.total ? Math.round(100 * s.frac) + '%' : '']); });
    });
    return rows;
  }
  function exportXlsx(list, d, signoffs, evd) {
    var t = rowsFor(list, d);
    var acc = S.account;
    var sheets = [
      { name: 'Progress', rows: evd ? [['Pathway', 'Module', 'Scan target', 'Counted', 'Supervised target', 'Directly supervised', 'Signed off', 'Status']].concat(evRows(evd)) : summaryRows(list), widths: [12, 34, 12, 10, 16, 18, 12, 44, 10] },
      { name: 'Scans', rows: [t.head].concat(t.rows), widths: [11, 24, 18, 10, 8, 26, 50, 12, 12, 40, 18, 12, 30, 22, 20, 7, 12, 28, 12, 16, 50] },
      { name: 'Sign-offs', rows: [['Code', 'Date', 'Supervisor', 'Role', 'Registration', 'Accreditation', 'Method', 'Scans', 'Confirmed', 'Comment']].concat(signoffs.filter(function (s) { return s.status === 'signed'; }).map(function (s) { return [s.id, (s.signed_at || '').slice(0, 10), s.supervisor_name, s.supervisor_role, s.supervisor_reg || '', s.accreditation || '', s.method, s.entry_ids.length, Object.values(s.decisions || {}).filter(function (x) { return x === 'confirmed'; }).length, s.comment || '']; })), widths: [16, 11, 24, 30, 14, 30, 10, 7, 9, 50] },
      { name: 'About', rows: [['Wavelength ultrasound logbook', ''], ['Name', acc.name], ['Email', acc.email], ['Grade or role', profile().grade || acc.role || ''], ['Registration', profile().registration || ''], ['Period', fmt(d.from) + ' to ' + fmt(d.to)], ['Scans', list.length], ['Generated', fmt(today())], ['Verified summary', evd ? evd.code : 'Not created'], ['Check it at', evd ? evd.link : location.host + '/app/verify'], ['Patient data', 'This record holds no patient identifiers.']], widths: [22, 60] }
    ];
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
  function verifyUrl(code) { return location.origin + '/app/verify/?code=' + code; }
  function evRows(evd) {
    var rows = [];
    evd.summary.pathways.forEach(function (p) {
      p.modules.forEach(function (m) {
        rows.push([p.label, m.label + (m.ownTarget ? ' *' : ''), m.total || '', m.counted, m.supTarget || '', m.supervised, m.signed, m.met ? 'Target met' : (m.needs || []).length ? m.needs.join(', ') + ' needed' : plural(m.logged, 'scan') + ' logged']);
      });
    });
    return rows;
  }
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
      var info = [['Name', acc.name], ['Grade or role', profile().grade || acc.role || ''], ['Organisation', acc.organisation || ''], ['Pathways', myPaths().map(function (p) { return PATHS[p].label; }).join(', ')], ['Period', fmt(d.from) + ' to ' + fmt(d.to)], ['Scans in this export', String(list.length)], ['Generated', fmt(today(), { day: 'numeric', month: 'long', year: 'numeric' })]];
      doc.autoTable({ startY: 72, body: info, theme: 'plain', styles: { fontSize: 10.5, cellPadding: 1.6 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: teal } } });
      var y = doc.lastAutoTable.finalY + 8;
      if (evd) {
        doc.setFillColor(237, 234, 227); doc.roundedRect(16, y, W - 32, 44, 2, 2, 'F');
        doc.addImage(qrPng(evd.link, 360), 'PNG', W - 56, y + 3, 38, 38);
        doc.setTextColor.apply(doc, teal); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('VERIFIED SUMMARY', 22, y + 9);
        doc.setTextColor.apply(doc, navy); doc.setFontSize(16); doc.text(evd.code, 22, y + 18);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(doc.splitTextToSize('Scan the QR code, or enter the code at ' + location.host + '/app/verify, to see this summary as Wavelength holds it. The progress figures and sign-offs come from the learner\'s synced logbook on the Wavelength server, not from this file. Created ' + fmt(evd.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) + '.', W - 32 - 54), 22, y + 25);
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
      var body = list.map(function (e, i) { var r = t.rows[i]; return [r[0], r[1], [r[2], r[3], r[4]].filter(Boolean).join(', '), r[5], r[6] + (r[7] ? '\nOverall: ' + r[7] : '') + (r[9] ? '\n' + r[9] : ''), r[13] + (r[14] ? '\n' + r[14] : ''), r[16] + (r[17] ? '\n' + r[17] + '\n' + r[18] + '\n' + r[19] : '')]; });
      doc.autoTable({ startY: 22, head: [['Date', 'Application', 'Setting, age, sex', 'Indication', 'Findings and interpretation', 'Supervision', 'Sign-off']], body: body, styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: navy }, columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { cellWidth: 24 }, 4: { cellWidth: 55 }, 5: { cellWidth: 20 }, 6: { cellWidth: 22 } } });
      if (d.reflections && list.some(function (e) { return e.reflection; })) {
        doc.addPage(); doc.setFontSize(14); doc.text('Reflective notes', 16, 18);
        doc.autoTable({ startY: 22, head: [['Date', 'Application', 'Reflection']], body: list.filter(function (e) { return e.reflection; }).map(function (e) { return [e.date, (TYPES[e.type] || {}).label, e.reflection]; }), styles: { fontSize: 8.5, cellPadding: 2, valign: 'top' }, headStyles: { fillColor: navy }, columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 34 } } });
      }
      var ids = {}; list.forEach(function (e) { if (e.signoff && e.signoff.code) ids[e.signoff.code] = 1; });
      var sos = signoffs.filter(function (s) { return s.status === 'signed' && ids[s.id]; });
      if (sos.length) {
        doc.addPage(); doc.setFontSize(14); doc.text('Sign-off register', 16, 18);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text('Verify any code at ' + location.host + '/app/verify, or scan its QR code', 16, 24);
        var qrs = sos.map(function (s) { return qrPng(verifyUrl(s.id), 200); });
        doc.autoTable({ startY: 28, head: [['Code', 'Date', 'Supervisor', 'Registration', 'Accreditation', 'Method', 'Scans', 'Signature', 'Verify']], body: sos.map(function (s) { return [s.id, (s.signed_at || '').slice(0, 10), s.supervisor_name + (s.supervisor_role ? '\n' + s.supervisor_role : ''), s.supervisor_reg || '', s.accreditation || '', (s.method === 'in-person' ? 'In person' : 'By link') + (s.basis ? '\n' + ({ witnessed: 'Witnessed', reviewed: 'Reviewed images', both: 'Witnessed and reviewed' })[s.basis] : ''), String(s.entry_ids.length), '', '']; }), styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle', minCellHeight: 18 }, headStyles: { fillColor: navy }, columnStyles: { 7: { cellWidth: 30 }, 8: { cellWidth: 18 } },
          didDrawCell: function (h) { if (h.section === 'body' && h.column.index === 8) { try { doc.addImage(qrs[h.row.index], 'PNG', h.cell.x + 1.5, h.cell.y + 1.5, 15, 15); } catch (e) { /* skip */ } } if (h.section === 'body' && h.column.index === 7) { var s = sos[h.row.index]; if (s && s.signature) { try { doc.addImage(s.signature, 'PNG', h.cell.x + 1, h.cell.y + 1, 28, Math.min(h.cell.height - 2, 12)); } catch (e) { /* skip */ } } } } });
      }
      var withImg = d.images ? list.filter(function (e) { return (e.images || []).length; }) : [];
      var addImages = withImg.reduce(function (p, e) {
        return p.then(function () { return imagesFor(e.id); }).then(function (recs) {
          if (!recs.length) return;
          return Promise.all(recs.map(function (r) { return blobToDataUrl(r.blob).then(function (u) { return { u: u, w: r.w, h: r.h }; }); })).then(function (imgs) {
            doc.addPage(); doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(((TYPES[e.type] || {}).label || e.type) + ', ' + fmt(e.date), 16, 18);
            var x = 16, yy = 24, colW = 86;
            imgs.forEach(function (im, i) { var h = colW * im.h / im.w; if (h > 110) h = 110; var w = h * im.w / im.h; if (yy + h > 282) { doc.addPage(); yy = 18; } doc.addImage(im.u, 'JPEG', x, yy, w, h); if (i % 2 === 0) { x = 16 + colW + 6; } else { x = 16; yy += 116; } });
          });
        });
      }, Promise.resolve());
      return addImages.then(function () {
        var n = doc.getNumberOfPages();
        for (var i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 130, 145); doc.text('Wavelength ultrasound logbook · ' + acc.name + ' · Page ' + i + ' of ' + n, 16, 290); doc.text('This record holds no patient identifiers. ' + (evd ? 'Verified summary ' + evd.code + '. ' : '') + 'Codes verify at ' + location.host + '/app/verify', 16, 294); }
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
    doc.setFontSize(10); doc.setTextColor(91, 104, 120); doc.text([fmt(e.date, { day: 'numeric', month: 'long', year: 'numeric' }), e.setting, e.age, e.sex].filter(Boolean).join('  ·  '), 14, 51);
    var rows = [['Indication', e.indication || '']].concat(t.fields.filter(function (fd) { return f[fd.id] != null && f[fd.id] !== ''; }).map(function (fd) { return [fd.label, (Array.isArray(f[fd.id]) ? f[fd.id].join(', ') : f[fd.id]) + (fd.unit ? ' ' + fd.unit : '')]; }))
      .concat([['Overall', e.overall || ''], ['Image quality', e.quality || ''], ['Interpretation', e.interpretation || ''], ['Confirmed by', [e.confirmation, e.concordant].filter(Boolean).join(', ')], ['Impact', e.impact || '']]);
    if (d.reflections && e.reflection) rows.push(['Reflection', e.reflection]);
    var so = e.signoff && e.signoff.status === 'confirmed' && e.signoff.code ? e.signoff : null;
    if (so) { rows.push(['Signed off', so.name + (so.role ? ', ' + so.role : '') + ', ' + fmt(so.at) + '. Code ' + so.code + '. Scan the QR code to verify.']); try { doc.addImage(qrPng(verifyUrl(so.code), 240), 'PNG', 176, 3, 24, 24); } catch (x) { /* skip */ } }
    doc.autoTable({ startY: 58, body: rows.filter(function (r) { return r[1]; }), theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2.2, valign: 'top' }, columnStyles: { 0: { fontStyle: 'bold', textColor: teal, cellWidth: 46 } } });
    var y = doc.lastAutoTable.finalY + 8;
    var done = function () { doc.setFontSize(7.5); doc.setTextColor(120, 130, 145); doc.text('Shared from the Wavelength ultrasound logbook. Holds no patient identifiers. thewavelength.co.uk', 14, 290); return { blob: doc.output('blob'), name: 'case.pdf' }; };
    if (!d.images) return done();
    return imagesFor(e.id).then(function (recs) {
      return Promise.all(recs.map(function (r) { return blobToDataUrl(r.blob).then(function (u) { return { u: u, w: r.w, h: r.h }; }); }));
    }).then(function (imgs) {
      var x = 14, colW = 88;
      imgs.forEach(function (im, i) { var h = Math.min(100, colW * im.h / im.w), w = h * im.w / im.h; if (y + h > 282) { doc.addPage(); y = 16; } doc.addImage(im.u, 'JPEG', x, y, w, h); if (i % 2 === 0) x = 14 + colW + 6; else { x = 14; y += h + 6; } });
      return done();
    });
  }

  // ---------- Backup to the learner's own cloud ----------
  function viewBackup() {
    all('images').then(function (imgs) {
      var size = imgs.reduce(function (s, r) { return s + (r.blob ? r.blob.size : 0) + (r.thumb ? r.thumb.size : 0); }, 0);
      var last = S.kv.lastBackup;
      mount(shell({ title: 'Backup', back: '' },
        '<div class="card dark"><h3>Your photos, your cloud</h3><p class="muted small">Your logbook text is safe in your Wavelength account. Your scan photos live only on this phone. A backup packs them into one file you save to iCloud Drive, Google Drive, OneDrive or your computer. Wavelength never receives it.</p></div>' +
        '<div class="card"><div class="row"><div class="grow"><b>' + plural(imgs.length, 'image') + ' on this phone</b><p class="small muted" style="margin:2px 0 0">' + (size / 1048576).toFixed(1) + ' MB · ' + (last ? 'Last backup ' + esc(fmt(last)) : 'Never backed up') + '</p></div></div><div class="btns"><button class="btn teal block" id="bk"' + (imgs.length || live().length ? '' : ' disabled') + '>' + I.cloud + ' Back up now</button></div><p class="small muted" style="margin-top:10px">On iPhone, choose Save to Files, then iCloud Drive. On Android, choose Drive or OneDrive.</p></div>' +
        '<div class="card"><h3>Restore from a backup</h3><p class="small muted">On a new phone, log in, then choose your backup file. Images return to their scans.</p><input type="file" id="rf" accept=".zip,application/zip" hidden><button class="btn ghost" id="rb">Choose backup file</button></div>' +
        '<div class="card"><h3>Keep photos safe on this phone</h3><p class="small muted">' + (standalone ? 'You opened Wavelength from your home screen, so your browser keeps its storage.' : 'Add Wavelength to your home screen. On iPhone, Safari clears storage for websites you have not opened for a while; home screen apps are exempt.') + '</p>' + (standalone ? '' : installButton('Add to home screen')) + '</div>'));
      $('#bk').onclick = function () { var b = this; busy(b, true, 'Packing your backup…'); makeBackup().then(function (out) { busy(b, false); setKv('lastBackup', new Date().toISOString()); deliver(out.blob, out.name); }).catch(function (ex) { busy(b, false); toast(ex.message); }); };
      $('#rb').onclick = function () { $('#rf').click(); };
      $('#rf').onchange = function () { var f = this.files[0]; this.value = ''; if (f) restore(f); };
    });
  }
  function makeBackup() {
    return all('images').then(function (imgs) {
      return Promise.all(imgs.map(function (r) { return r.blob.arrayBuffer().then(function (b) { return { r: r, b: new Uint8Array(b) }; }); }));
    }).then(function (imgs) {
      var manifest = { app: 'wavelength-logbook', version: 1, created: new Date().toISOString(), account: S.account.email, entries: live().map(strip), images: imgs.map(function (x) { return { id: x.r.id, entryId: x.r.entryId, w: x.r.w, h: x.r.h, file: 'images/' + x.r.id + '.jpg' }; }) };
      var files = [{ name: 'wavelength-backup.json', data: JSON.stringify(manifest) }].concat(imgs.map(function (x) { return { name: 'images/' + x.r.id + '.jpg', data: x.b }; }));
      return { blob: WLZip.zip(files), name: 'Wavelength-logbook-backup-' + dateStamp() + '.zip' };
    });
  }
  function thumbOf(blob) {
    return new Promise(function (ok) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { var s = Math.min(1, 360 / Math.max(im.width, im.height)); var c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(ok, 'image/jpeg', 0.72); }; im.onerror = function () { ok(blob); }; im.src = u; });
  }
  function restore(file) {
    file.arrayBuffer().then(function (buf) {
      var files = WLZip.unzip(buf), man = files['wavelength-backup.json'];
      if (!man) throw new Error('This is not a Wavelength backup file.');
      man = JSON.parse(new TextDecoder().decode(man));
      if (man.account && man.account !== S.account.email && !confirm('This backup belongs to ' + man.account + '. Restore it into this account anyway?')) return;
      var known = {}; S.entries.forEach(function (e) { known[e.id] = 1; });
      var jobs = (man.entries || []).filter(function (e) { return !known[e.id]; }).map(function (e) { e._dirty = true; e.updatedAt = 0; return saveLocal(e); });
      var n = 0;
      jobs = jobs.concat((man.images || []).map(function (im) { var data = files[im.file]; if (!data) return null; var blob = new Blob([data], { type: 'image/jpeg' }); n++; return thumbOf(blob).then(function (t) { return put('images', { id: im.id, entryId: im.entryId, blob: blob, thumb: t, w: im.w, h: im.h, created: Date.now() }); }); }));
      return Promise.all(jobs).then(function () { toast('Restored ' + plural(n, 'image') + '.'); sync(); go(''); });
    }).catch(function (ex) { toast(ex.message || 'Could not read that file.', 4000); });
  }

  // ---------- Me ----------
  function viewMe(r) {
    var acc = S.account, p = profile();
    var certs = (S.me && S.me.certificates) || [];
    var editPw = r.q.get('edit') === 'pathways';
    mount(shell({ title: 'Me' },
      '<div class="card dark"><div class="row"><span style="width:52px;height:52px;border-radius:50%;background:var(--teal);display:grid;place-items:center;font:600 20px var(--sans);color:#fff;flex:none">' + esc((acc.firstName || '?').charAt(0) + (acc.lastName || '').charAt(0)) + '</span><div class="grow"><h3>' + esc(acc.name) + '</h3><p class="muted small" style="margin:0">' + esc(acc.email) + (p.grade ? ' · ' + esc(p.grade) : '') + '</p></div></div></div>' +
      (canInstall() ? installButton() : '') +
      '<h2 class="sec">Pathways</h2><form id="pf" class="card">' + C.pathways.map(function (pw) { return '<label class="check" style="padding:8px 0"><input type="checkbox" name="p" value="' + pw.id + '"' + (myPaths().indexOf(pw.id) >= 0 && (p.pathways || []).indexOf(pw.id) >= 0 ? ' checked' : '') + '><span><b>' + esc(pw.label === 'General' ? 'General logbook' : pw.label) + '</b><br><span class="muted">' + DESC[pw.id] + '</span></span></label>'; }).join('') + '<div class="btns"><button class="btn sm">Save pathways</button></div></form>' +
      '<h2 class="sec">Certificates <a href="/elearning/account/">All</a></h2>' + (certs.length ? certs.map(function (c) { return '<div class="entry"><span class="thumb">' + I.cert + '</span><a class="grow" style="text-decoration:none;color:inherit" href="/elearning/certificate/' + esc(c.code) + '/"><h3>' + esc(c.module_title) + '</h3><p>' + esc(fmt(c.issued_on)) + ' · ' + esc(c.code) + '</p></a><button class="btn ghost sm" type="button" data-sharecert="' + esc(c.code) + '" data-title="' + esc(c.module_title) + '" aria-label="Share certificate">' + I.share + '</button></div>'; }).join('') : '<div class="card"><p class="muted small">Pass a free Academy module to earn a verifiable CPD certificate.</p><a class="btn sm" href="/elearning/">Browse modules</a></div>') +
      '<h2 class="sec">Profile</h2><form id="mf" class="card"><div class="two"><div class="field"><label for="m1">First name</label><input id="m1" name="firstName" type="text" value="' + esc(acc.firstName) + '"></div><div class="field"><label for="m2">Last name</label><input id="m2" name="lastName" type="text" value="' + esc(acc.lastName) + '"></div></div><div class="field"><label for="m3">Grade or role</label><input id="m3" name="grade" type="text" value="' + esc(p.grade || '') + '"></div><div class="field"><label for="m4">Organisation</label><input id="m4" name="organisation" type="text" value="' + esc(acc.organisation || '') + '"></div><div class="field"><label for="m5">GMC, NMC or HCPC number (shown on exports, optional)</label><input id="m5" name="registration" type="text" value="' + esc(p.registration || '') + '"></div><button class="btn sm">Save profile</button></form>' +
      '<h2 class="sec">Your data</h2><div class="card"><div style="display:grid;gap:12px"><a href="#/backup">Back up or restore photos</a><a href="#/export">Export your logbook</a><a href="#/evidence">Verified summaries you have shared</a><a href="#/declaration">Your responsibility for stored data</a><a href="/app-terms/">Logbook terms of use</a><a href="/privacy/">Privacy notice</a><a href="/app/verify/">Verify a sign-off code</a></div></div>' +
      '<h2 class="sec">Account</h2><div class="card"><form id="cpw"><div class="field"><label for="c1">Current password</label><input id="c1" name="current" type="password" autocomplete="current-password"></div><div class="field"><label for="c2">New password</label><input id="c2" name="password" type="password" minlength="10" autocomplete="new-password"></div><button class="btn sm ghost">Change password</button></form></div>' +
      '<div class="btns"><button class="btn ghost block" id="lo">Log out</button><button class="btn ghost block" id="dl" style="color:var(--red)">Delete my account</button></div>' +
      '<p class="small muted" style="text-align:center;margin-top:20px">Wavelength app · Auda Medical Ltd</p>'));
    if (editPw) $('#pf').scrollIntoView();
    $$('[data-sharecert]').forEach(function (b) { b.onclick = function () { shareCertificate(b.dataset.sharecert, b.dataset.title); }; });
    $('#pf').addEventListener('submit', function (e) { e.preventDefault(); var ps = $$('input[name=p]:checked', this).map(function (i) { return i.value; }); if (!ps.length) { toast('Keep at least one pathway.'); return; } saveProfile({ pathways: ps }).then(function () { toast('Pathways saved.'); }).catch(function (ex) { toast(ex.message); }); });
    $('#mf').addEventListener('submit', function (e) { e.preventDefault(); var d = formData(this); saveProfile({ grade: d.grade, registration: d.registration }, { firstName: d.firstName, lastName: d.lastName, organisation: d.organisation }).then(function () { toast('Profile saved.'); render(true); }).catch(function (ex) { toast(ex.message); }); });
    $('#cpw').addEventListener('submit', function (e) { e.preventDefault(); var f = this; api('/api/app/password', formData(f)).then(function (res) { toast(res.ok ? 'Password changed.' : res.error); if (res.ok) f.reset(); }); });
    $('#lo').onclick = function () { api('/api/app/logout', {}).then(signedOut); };
    $('#dl').onclick = function () {
      sheet('<h2>Delete your account?</h2><p class="muted small">This deletes your logbook, sign-offs and account from Wavelength. Back up or export first if you want a copy. Images on this phone are removed too.</p><form id="df"><div class="field"><label for="dp">Your password</label><input id="dp" type="password" autocomplete="current-password" required></div>' + (certs.length ? '<label class="check"><input type="checkbox" id="kc" checked><span>Keep my Academy certificates verifiable</span></label>' : '') + '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn danger block">Delete everything</button><button type="button" class="btn ghost block" data-close>Cancel</button></div></form>', function (root) {
        $('#df', root).addEventListener('submit', function (ev) {
          ev.preventDefault();
          api('/api/app/account/delete', { password: $('#dp', root).value, keepCertificates: !!($('#kc', root) || {}).checked }).then(function (res) {
            if (!res.ok) { var er = $('.err', root); er.textContent = res.error; er.hidden = false; return; }
            var name = 'wavelength-' + S.account.id; S.db.close(); indexedDB.deleteDatabase(name); closeSheet(); toast('Your account is deleted.'); signedOut();
          });
        });
      });
    };
  }
  function shareCertificate(code, title) {
    var link = location.origin + '/elearning/certificate/' + code + '/';
    var text = 'My Wavelength Academy CPD certificate: ' + title + '. Verify it at ' + link;
    sheet('<h2>Share your certificate</h2><p class="muted small">Anyone with the link sees your name, the module, CPD hours and date, never your score. Add it to your e-portfolio, appraisal or LinkedIn.</p><div class="card" style="word-break:break-all;font-size:13px">' + esc(link) + '</div><div class="btns">' + (navigator.share ? '<button class="btn teal block" data-s>' + I.share + ' Share</button>' : '') + '<button class="btn block" data-pdf>Share the PDF</button><button class="btn ghost block" data-c>Copy link</button><a class="btn ghost block" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link) + '">Post on LinkedIn</a></div>', function (root) {
      var s = $('[data-s]', root); if (s) s.onclick = function () { navigator.share({ title: title, text: text, url: link }).catch(function () {}); };
      $('[data-c]', root).onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Link copied.'); }).catch(function () { toast('Press and hold the link to copy it.'); }); };
      $('[data-pdf]', root).onclick = function () { fetch('/elearning/certificate/' + code + '.pdf', { credentials: 'same-origin' }).then(function (r) { return r.blob(); }).then(function (b) { closeSheet(); deliver(new Blob([b], { type: 'application/pdf' }), 'Wavelength-certificate-' + code + '.pdf'); }); };
    });
  }
  function viewDeclaration() { mount(shell({ title: 'Your responsibility', back: 'me' }, declarationHtml() + '<p class="small muted" style="margin-top:12px">You accepted this on ' + esc(fmt(S.account.declarationAt)) + '.</p>')); }

  // ---------- Start ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(function () {});
  var qs = new URLSearchParams(location.search);
  if (qs.get('reset')) location.hash = '#/reset';
  else if (qs.get('login')) location.hash = '#/login';
  app.innerHTML = '<div class="auth"><div class="auth-head" style="padding-top:30vh">' + MARK(64, 'rgba(247,245,240,.6)') + '<div class="wm">WAVELENGTH</div></div></div>';
  api('/api/app/me').then(function (res) {
    if (res.ok) { S.me = res; return signedIn(res.account); }
    if (res.academy && !location.hash.match(/login|signup|reset/)) location.hash = '#/signup';
    render();
  }).catch(function () { render(); });
})();
