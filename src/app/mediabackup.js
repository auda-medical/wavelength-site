// Automatic photo and clip backup (owner, 19 Nov 2026, D-118): the encryption, done on the phone.
// Plain script like formats.js: the app loads it with a <script> tag; tests run it with new Function.
//
// Each learner has one random 256-bit backup key. It never leaves the phone unencrypted: Wavelength stores it only
// wrapped (AES-GCM) under a key derived from the learner's password (PBKDF2-SHA256, 600,000 rounds, random salt), so a
// new phone that signs in can unwrap it. Every photo or clip record is packed (its fields, the picture, its preview and
// any edit base) and encrypted with AES-GCM under the backup key, a fresh 96-bit IV each time, and its id as associated
// data, so a stored copy cannot be passed off as another photo. Wavelength's servers hold only the results.
(function (root) {
  'use strict';
  var C = root.crypto && root.crypto.subtle;
  var ITER = 600000;
  var MAGIC = [87, 76, 77, 49]; // "WLM1": a packed record
  var SEAL = [87, 76, 69, 49];  // "WLE1": encrypted with the backup key
  var enc = new TextEncoder(), dec = new TextDecoder();

  function b64(u8) { var s = ''; u8 = new Uint8Array(u8); for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function rand(n) { var u = new Uint8Array(n); root.crypto.getRandomValues(u); return u; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function toBytes(x) { return x instanceof Uint8Array ? Promise.resolve(x) : x && x.arrayBuffer ? x.arrayBuffer().then(function (b) { return new Uint8Array(b); }) : Promise.resolve(new Uint8Array(x || 0)); }
  function cat(parts) { var n = 0; parts.forEach(function (p) { n += p.length; }); var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out; }
  function same(a, b) { for (var i = 0; i < b.length; i++) if (a[i] !== b[i]) return false; return true; }

  function newKey() { return rand(32); }
  // The key's public fingerprint (first 16 hex of its SHA-256): names the key without revealing it.
  function kid(raw) { return C.digest('SHA-256', raw).then(function (h) { return hex(h).slice(0, 16); }); }
  function sha(blob) { return toBytes(blob).then(function (u) { return C.digest('SHA-256', u); }).then(hex); }

  function kek(password, salt, iter) {
    return C.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return C.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  // The backup key wrapped with the password: {salt, iter, wrapped, kid}, as the server keeps it.
  function wrap(raw, password, iter) {
    iter = iter || ITER; var salt = rand(16), iv = rand(12);
    return kek(password, salt, iter).then(function (k) { return C.encrypt({ name: 'AES-GCM', iv: iv }, k, raw); }).then(function (ct) {
      return kid(raw).then(function (id) { return { salt: b64(salt), iter: iter, wrapped: b64(cat([iv, new Uint8Array(ct)])), kid: id }; });
    });
  }
  // Rejects when the password is not the one it was wrapped with.
  function unwrap(w, password) {
    var all = unb64(w.wrapped);
    return kek(password, unb64(w.salt), w.iter).then(function (k) { return C.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, k, all.subarray(12)); }).then(function (raw) { return new Uint8Array(raw); });
  }

  // A photo or clip record, packed: "WLM1", header length (4 bytes), header JSON (every plain field, plus the size and
  // type of each Blob field), then each Blob's bytes in order.
  function pack(rec) {
    var meta = {}, blobs = [];
    Object.keys(rec).forEach(function (k) {
      var v = rec[k];
      if (v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.size === 'number') blobs.push({ k: k, v: v });
      else if (v !== undefined && typeof v !== 'function') meta[k] = v;
    });
    return Promise.all(blobs.map(function (b) { return toBytes(b.v); })).then(function (bytes) {
      meta._parts = blobs.map(function (b, i) { return { k: b.k, type: b.v.type || '', n: bytes[i].length }; });
      var head = enc.encode(JSON.stringify(meta)), len = new Uint8Array(4);
      new DataView(len.buffer).setUint32(0, head.length);
      return cat([new Uint8Array(MAGIC), len, head].concat(bytes));
    });
  }
  function unpack(u8) {
    if (!same(u8, MAGIC)) throw new Error('not a Wavelength backup');
    var n = new DataView(u8.buffer, u8.byteOffset + 4, 4).getUint32(0), o = 8 + n;
    var meta = JSON.parse(dec.decode(u8.subarray(8, o))), rec = {};
    Object.keys(meta).forEach(function (k) { if (k !== '_parts') rec[k] = meta[k]; });
    (meta._parts || []).forEach(function (p) { rec[p.k] = new Blob([u8.slice(o, o + p.n)], { type: p.type }); o += p.n; });
    return rec;
  }
  function aesKey(raw, use) { return C.importKey('raw', raw, 'AES-GCM', false, [use]); }
  // Pack and encrypt a record for upload: "WLE1", IV, ciphertext. The record's id is bound in as associated data.
  function seal(raw, rec) {
    var iv = rand(12);
    return Promise.all([pack(rec), aesKey(raw, 'encrypt')]).then(function (r) {
      return C.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(String(rec.id)) }, r[1], r[0]);
    }).then(function (ct) { return cat([new Uint8Array(SEAL), iv, new Uint8Array(ct)]).buffer; });
  }
  // Decrypt and unpack a downloaded copy of photo `id`. Rejects if it was not made with this key for this id.
  function open(raw, buf, id) {
    var u = new Uint8Array(buf);
    if (!same(u, SEAL)) return Promise.reject(new Error('not a Wavelength backup'));
    return aesKey(raw, 'decrypt').then(function (k) {
      return C.decrypt({ name: 'AES-GCM', iv: u.subarray(4, 16), additionalData: enc.encode(String(id)) }, k, u.subarray(16));
    }).then(function (plain) { var rec = unpack(new Uint8Array(plain)); if (rec.id !== id) throw new Error('wrong photo'); return rec; });
  }

  root.WLMB = { ITER: ITER, b64: b64, unb64: unb64, newKey: newKey, kid: kid, sha: sha, wrap: wrap, unwrap: unwrap, pack: pack, unpack: unpack, seal: seal, open: open };
})(typeof window !== 'undefined' ? window : globalThis);
