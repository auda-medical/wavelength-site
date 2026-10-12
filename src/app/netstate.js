// Connection and sync status rules (window.WLNet), kept apart from app.js so the rules can be tested in Node.
// The app never trusts navigator.onLine alone. It combines what the phone says about its network (Android's
// ConnectivityManager through the WLNetwork plugin, or navigator.onLine where nothing better exists) with what the
// last request to the Wavelength server actually did:
//   offline      no usable network on this device
//   unreachable  the device has a network, but the Wavelength server could not be reached (VPN, firewall, filter)
//   timeout      the server did not answer in time
//   auth         the login has ended
//   failed       the server answered and refused (a specific error)
// Strings are English keys: app.js translates them with T().
(function (root) {
  'use strict';

  // dev: { known, connected, validated, vpn, transports, underlying } from the phone, or { known: false, online }
  // otherwise. underlying (Android, 1.0.11): whether a real network (Wi-Fi, mobile data, Ethernet) exists under the
  // phone's networks, read separately from the default network: true, false, or null when Android could not say.
  // A VPN app can keep its virtual network "connected" with nothing under it (Flight mode on, Wi-Fi off, mobile data
  // off, NordVPN still showing Connected). That is no usable network: Offline, not "Can't sync". Flight mode itself is
  // never read: Wi-Fi switched back on in Flight mode is a real network.
  function deviceOnline(dev) {
    if (!dev) return true;
    if (dev.known) {
      if (!dev.connected) return false;
      // Only a definite "nothing underneath" counts. Unknown (an older app build, or Android refused to say) keeps
      // the conservative answer: the device may have a network, so the server is reported as unreachable.
      if (dev.vpn && dev.underlying === false) return false;
      return true;
    }
    return dev.online !== false;
  }
  // The VPN is up but has no network under it.
  function vpnOnly(dev) { return !!(dev && dev.known && dev.connected && dev.vpn && dev.underlying === false); }

  // What a failed sync means. ex is the error the request threw (native.js marks network and timeout failures) or
  // an Error carrying the server's HTTP status (status) and whether the answer was readable JSON (nojson).
  function classify(ex, dev) {
    if (!ex) return 'failed';
    if (ex.stale) return '';
    // Only the Wavelength API's own "login ended" answer asks to sign in. A 401 from something in between (a proxy or
    // filter page) is not about the login: it falls through to unreachable below.
    if (ex.auth) return 'auth';
    // native.js marks every failed or timed-out request (ex.network, ex.timeout). A coding error is not a network
    // problem and is reported as a failure, never with VPN advice.
    var net = !!(ex.network || ex.timeout);
    if (net) {
      if (!deviceOnline(dev)) return 'offline';
      return ex.timeout ? 'timeout' : 'unreachable';
    }
    // An answer that is not the Wavelength API's (a network filter's block page, a proxy, a gateway error) or a
    // server error: the server was not usable from here, but nothing about the entries was refused.
    if (ex.nojson || ex.status >= 500 || ex.status === 401) return 'unreachable';
    return 'failed';
  }

  // The one status shown in the header pill, the banner and the sync panel.
  // s: { account, syncing, auto, update, fail, dev, pending, refused, ran }. auto: the sync running is an automatic
  // retry, not one the learner asked for.
  function state(s) {
    if (!s.account) return '';
    if (s.update) return 'update';
    // A phone with no network shows Offline even during a quick retry, so the pill does not flicker.
    if (!deviceOnline(s.dev)) return 'offline';
    // While the server cannot be reached, a quiet automatic retry keeps the amber status (no flicker, no repeated
    // announcement). A retry the learner asked for shows Syncing.
    if (s.syncing && !(s.auto && (s.fail === 'unreachable' || s.fail === 'timeout'))) return 'syncing';
    if (s.fail === 'offline') return 'offline';
    if (s.fail === 'auth') return 'auth';
    if (s.fail === 'unreachable' || s.fail === 'timeout') return 'unreachable';
    if (s.fail === 'failed' || s.refused) return 'failed';
    if (s.pending) return 'pending';
    return s.ran ? 'synced' : '';
  }

  // Header pill: colour class, icon name and short label. Colour, icon and words always say the same thing.
  var PILL = {
    synced: { cls: 'ok', icon: 'check', label: 'Synced' },
    pending: { cls: 'warn', icon: 'clock', label: '{n} waiting' },
    syncing: { cls: 'busy', icon: 'sync', label: 'Syncing' },
    offline: { cls: 'bad', icon: 'offline', label: 'Offline' },
    unreachable: { cls: 'warn', icon: 'alert', label: 'Can\'t sync' },
    failed: { cls: 'bad', icon: 'alert', label: 'Sync failed' },
    auth: { cls: 'bad', icon: 'lock', label: 'Sign in' },
    update: { cls: 'bad', icon: 'alert', label: 'Update' },
    '': { cls: 'none', icon: 'sync', label: 'Sync' }
  };
  function pill(st) { return PILL[st] || PILL['']; }

  // Banner below the header, or null for none. tone: red, amber, teal, green.
  // 1.0.11: short. A title and one line about scans waiting, with Retry sync and Connection details; everything else
  // (what the device says about its network, the server, VPN and firewall advice, the last attempts) lives in the
  // sync details panel. With nothing waiting, a single quiet line (compact) instead of a large warning. The words
  // never say or imply that a scan saved on this device has been backed up or synced.
  // wait: [one, other] plural keys for the waiting line ({n}); app.js picks the form with N().
  var WAIT = ['{n} scan saved on this device, awaiting sync.', '{n} scans saved on this device, awaiting sync.'];
  function banner(st, n, opts) {
    opts = opts || {};
    if (st === 'offline') return n ? { tone: 'red', icon: 'offline', title: 'You\'re offline', wait: WAIT, details: true }
      : { tone: 'red', icon: 'offline', title: 'You\'re offline', note: 'Nothing waiting to sync.', compact: true, details: true };
    if (st === 'unreachable') return n ? { tone: 'amber', icon: 'alert', title: 'Can\'t connect to Wavelength', wait: WAIT, retry: true, details: true }
      : { tone: 'amber', icon: 'alert', title: 'Wavelength server unreachable', note: 'Nothing waiting to sync.', compact: true, details: true };
    if (st === 'failed') return { tone: 'red', icon: 'alert', title: 'Sync failed', wait: n ? ['{n} scan saved on this device, not yet synced.', '{n} scans saved on this device, not yet synced.'] : null, retry: true, details: true };
    if (st === 'auth') return { tone: 'red', icon: 'lock', title: 'Sign in to sync', body: 'Sign in again to continue synchronising. Your local entries are safe.' };
    if (st === 'pending' && n && opts.settled) return { tone: 'amber', icon: 'clock', title: 'Scans awaiting sync', wait: ['{n} scan is saved on this device. Wavelength will retry automatically.', '{n} scans are saved on this device. Wavelength will retry automatically.'] };
    if (st === 'syncing' && n && opts.settled) return { tone: 'teal', icon: 'sync', title: 'Synchronising your scans…', progress: true };
    if (st === 'synced' && opts.justSynced) return { tone: 'green', icon: 'check', title: 'All changes synced.', brief: true };
    return null;
  }

  // The full explanation for the sync details panel: what the status means and what to check. kind: the state, with
  // 'vpnonly' for a VPN that shows as connected with no network under it. Returns { lead, steps }.
  function explain(st, dev) {
    if (st === 'offline' && vpnOnly(dev)) return { lead: 'Your VPN shows as connected, but this device has no Wi-Fi, mobile data or other network under it, so nothing can reach Wavelength.', steps: ['Turn off aeroplane mode, or connect to Wi-Fi or mobile data. Your VPN can stay on.', 'Wavelength syncs by itself when a connection returns.'] };
    if (st === 'offline') return { lead: 'This device has no network connection. Your scans are saved on this device but haven\'t yet synced to Wavelength.', steps: ['Turn off aeroplane mode or connect to Wi-Fi or mobile data. Wavelength syncs by itself when a connection returns.'] };
    if (st === 'unreachable' && dev && dev.known && dev.vpnKnown === false) return { lead: 'Your device appears connected, but Wavelength can\'t reach its server. Your scans remain saved on this device. This phone does not tell apps whether a VPN is on.', steps: ['Open a website in your browser to check this network has internet access.', 'If you use a VPN, check that it is connected. A VPN, firewall or network restriction may be affecting the connection: follow your organisation\'s rules.', 'Hospital guest Wi-Fi may need you to sign in on its page first.', 'Then press Retry sync. Wavelength also retries by itself.'] };
    if (st === 'unreachable') return { lead: 'Your device appears connected, but Wavelength can\'t reach its server. Your scans remain saved on this device.', steps: ['Open a website in your browser to check this network has internet access.', 'A VPN, firewall or network restriction may be affecting the connection. Check your network or VPN settings, following your organisation\'s rules.', 'Hospital guest Wi-Fi may need you to sign in on its page first.', 'Then press Retry sync. Wavelength also retries by itself.'] };
    if (st === 'failed') return { lead: 'Wavelength could not sync some changes. They remain saved on this device.', steps: ['Wavelength will try again. If this keeps happening, contact hello@thewavelength.co.uk.'] };
    return null;
  }

  // Wait before the next automatic retry after `tries` failures in a row, with ±20% jitter (rnd in [0, 1)).
  // Leaving aeroplane mode takes a phone a few seconds, so the first gaps are short, then 2 minutes apart. After about
  // 20 minutes of failures in a row (IDLE_AFTER tries) the gap grows to 5 minutes, so a phone left on a network that
  // blocks Wavelength all day does not wake every 2 minutes. Recovery never depends on that timer alone: a network
  // change from the phone (Wi-Fi back, a VPN reconnecting), returning to the app and Retry sync all start the sequence
  // again. There is no limit on the number of tries: a saved scan is always retried. A refusal (the server answered
  // and would not take the batch) cannot be fixed by the network, so its gaps grow to 5 minutes sooner.
  var RETRY = [2e3, 5e3, 10e3, 20e3, 30e3, 60e3, 120e3], RETRY_FAILED = RETRY.concat([300e3]), IDLE_AFTER = 16, IDLE = 300e3;
  function retryDelay(tries, rnd, kind) {
    var list = kind === 'failed' ? RETRY_FAILED : RETRY;
    var base = tries >= IDLE_AFTER ? IDLE : list[Math.min(Math.max(tries - 1, 0), list.length - 1)];
    return Math.round(base * (0.8 + (rnd == null ? Math.random() : rnd) * 0.4));
  }

  // Returning to the app (Android resume, or the web page shown again). Ordinary trips away (the camera, the share
  // sheet, a quick look at another app) must not become a burst of requests, and must not throw away the back-off.
  // s: { away (ms in the background), sinceTry (ms since the last attempt started), failing, pending, netChanged,
  // sinceOk (ms since the last success) }. Returns { sync, reset }.
  var RESUME_GAP = 10e3, RESUME_RESET = 60e3, RESUME_PULL = 30e3;
  function resumePlan(s) {
    var trouble = !!(s.failing || s.pending);
    // Start the back-off again only when something may really have changed: a new network, or a longer time away.
    var reset = trouble && (!!s.netChanged || s.away >= RESUME_RESET);
    var sync = trouble ? (reset || s.sinceTry >= RESUME_GAP) : s.sinceOk >= RESUME_PULL;
    return { sync: !!sync, reset: !!reset };
  }

  // Did the phone's network change in a way worth retrying for? (A new network, VPN up or down, a network that
  // now has validated internet.) Signal-strength noise does not count.
  function netChanged(a, b) {
    if (!a || !b) return !!b;
    return a.connected !== b.connected || a.validated !== b.validated || a.vpn !== b.vpn || String(a.transports || '') !== String(b.transports || '') || a.id !== b.id ||
      (a.underlying !== b.underlying && !(a.underlying == null && b.underlying == null)) || String(a.underlyingTransports || '') !== String(b.underlyingTransports || '');
  }

  // The last error, in words, for the sync details panel. Never includes server text that could carry data.
  function errorText(kind) {
    return {
      offline: 'No network connection on this device.',
      unreachable: 'This device has a network connection, but the Wavelength server could not be reached.',
      timeout: 'The Wavelength server did not answer in time.',
      failed: 'The Wavelength server could not accept the changes.',
      auth: 'Your login has ended. Sign in again.',
      update: 'This version of Wavelength needs updating before it can sync.'
    }[kind] || '';
  }

  var api = { explain: explain, deviceOnline: deviceOnline, vpnOnly: vpnOnly, resumePlan: resumePlan, IDLE_AFTER: IDLE_AFTER, classify: classify, state: state, pill: pill, banner: banner, retryDelay: retryDelay, netChanged: netChanged, errorText: errorText, RETRY: RETRY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WLNet = api;
})(typeof window !== 'undefined' ? window : this);
