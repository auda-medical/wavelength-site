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

  // dev: { known, connected, validated, vpn, transports } from the phone, or { known: false, online } otherwise.
  function deviceOnline(dev) {
    if (!dev) return true;
    if (dev.known) return !!dev.connected;
    return dev.online !== false;
  }

  // What a failed sync means. ex is the error the request threw (native.js marks network and timeout failures) or
  // an Error carrying the server's HTTP status (status) and whether the answer was readable JSON (nojson).
  function classify(ex, dev) {
    if (!ex) return 'failed';
    if (ex.stale) return '';
    if (ex.status === 401 || ex.auth) return 'auth';
    var net = !!(ex.network || ex.timeout || ex.name === 'TypeError' || ex.name === 'AbortError');
    if (net) {
      if (!deviceOnline(dev)) return 'offline';
      return ex.timeout ? 'timeout' : 'unreachable';
    }
    // An answer that is not the Wavelength API's (a network filter's block page, a proxy, a gateway error) or a
    // server error: the server was not usable from here, but nothing about the entries was refused.
    if (ex.nojson || ex.status >= 500) return 'unreachable';
    return 'failed';
  }

  // The one status shown in the header pill, the banner and the sync panel.
  // s: { account, syncing, update, fail, dev, pending, refused, ran }
  function state(s) {
    if (!s.account) return '';
    if (s.update) return 'update';
    // A phone with no network shows Offline even during a quick retry, so the pill does not flicker.
    if (!deviceOnline(s.dev)) return 'offline';
    if (s.syncing) return 'syncing';
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
  function banner(st, n, opts) {
    opts = opts || {};
    if (st === 'offline') return { tone: 'red', icon: 'offline', title: 'You\'re offline', body: 'Your scans are saved on this device but haven\'t yet synced to Wavelength. They\'ll sync automatically when a connection becomes available.', pending: n };
    if (st === 'unreachable') return { tone: 'amber', icon: 'alert', title: 'Can\'t connect to Wavelength', body: 'Your device appears connected, but Wavelength can\'t reach its server. Your scans remain saved on this device.', hint: 'A VPN, firewall or network restriction may be affecting the connection. Check your network or VPN settings.', pending: n, retry: true, details: true };
    if (st === 'failed') return { tone: 'red', icon: 'alert', title: 'Sync failed', body: 'Wavelength could not sync some changes. They remain saved on this device.', pending: n, retry: true, details: true };
    if (st === 'auth') return { tone: 'red', icon: 'lock', title: 'Sign in to sync', body: 'Sign in again to continue synchronising. Your local entries are safe.' };
    if (st === 'pending' && n && opts.settled) return { tone: 'amber', icon: 'clock', title: 'Scans awaiting sync', body: n === 1 ? '{n} scan is saved on this device. Wavelength will retry automatically.' : '{n} scans are saved on this device. Wavelength will retry automatically.', pending: 0 };
    if (st === 'syncing' && n && opts.settled) return { tone: 'teal', icon: 'sync', title: 'Synchronising your scans…', progress: true };
    if (st === 'synced' && opts.justSynced) return { tone: 'green', icon: 'check', title: 'All changes synced.', brief: true };
    return null;
  }

  // Wait before the next automatic retry after `tries` failures in a row, with ±20% jitter (rnd in [0, 1)).
  // Leaving aeroplane mode takes a phone a few seconds, so the first gaps are short, and never more than 2 minutes
  // apart: a retry that fails at once costs next to nothing. A network-change event from the phone (Wi-Fi back, a
  // VPN reconnecting) starts the sequence again, so the cap is only a safety net if such an event is ever missed.
  var RETRY = [2e3, 5e3, 10e3, 20e3, 30e3, 60e3, 120e3];
  function retryDelay(tries, rnd) {
    var base = RETRY[Math.min(Math.max(tries - 1, 0), RETRY.length - 1)];
    return Math.round(base * (0.8 + (rnd == null ? Math.random() : rnd) * 0.4));
  }

  // Did the phone's network change in a way worth retrying for? (A new network, VPN up or down, a network that
  // now has validated internet.) Signal-strength noise does not count.
  function netChanged(a, b) {
    if (!a || !b) return !!b;
    return a.connected !== b.connected || a.validated !== b.validated || a.vpn !== b.vpn || String(a.transports || '') !== String(b.transports || '') || a.id !== b.id;
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

  var api = { deviceOnline: deviceOnline, classify: classify, state: state, pill: pill, banner: banner, retryDelay: retryDelay, netChanged: netChanged, errorText: errorText, RETRY: RETRY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WLNet = api;
})(typeof window !== 'undefined' ? window : this);
