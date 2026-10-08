// Encrypted logbook backups (format WLBACKUP version 1, docs/backup-format.md). Everything happens on the device:
// the passphrase and the key never leave it, nothing unencrypted is written to storage, and Wavelength never
// receives the file. Built only from maintained libraries: AES-256-GCM and HKDF-SHA256 from the browser's Web Crypto,
// Argon2id from @noble/hashes (vendor/noble-hashes, MIT; checked against RFC 9106 and OpenSSL in the tests), PBKDF2-SHA256 from Web Crypto for files that ask
// for it. No cryptography is implemented here; this file only frames the chunks.
//
// File: a 48-byte header, then the payload (a stored ZIP of the backup) in chunks of CHUNK bytes. Each chunk is
// AES-256-GCM encrypted with the header as additional data and a nonce made of a random 7-byte prefix, the chunk
// number and a last-chunk flag, so any change, reordering, truncation or extension of the file is detected.
(function () {
  'use strict';
  var MAGIC = [0x57, 0x4c, 0x42, 0x41, 0x43, 0x4b, 0x55, 0x50]; // "WLBACKUP"
  var VERSION = 1, HEADER = 48, TAG = 16, CHUNK = 1048576;
  var KDF_ARGON2ID = 1, KDF_PBKDF2 = 2;
  // Argon2id at 64 MiB, 3 passes, 1 lane (RFC 9106 section 4, second recommended option, single lane for a phone).
  var ARGON = { m: 65536, t: 3, p: 1 };
  var PBKDF2_ITER = 600000; // OWASP 2023 for PBKDF2-HMAC-SHA256
  var INFO = 'Wavelength backup v1 AES-256-GCM';
  var subtle = (window.crypto || {}).subtle;
  var enc = new TextEncoder();

  function isBackup(bytes) { if (!bytes || bytes.length < 8) return false; for (var i = 0; i < 8; i++) if (bytes[i] !== MAGIC[i]) return false; return true; }
  function fail(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function pass(p) { return enc.encode(String(p).normalize('NFC')); }

  // The noble modules are ES modules next to this script (/app/vendor/), loaded only when a backup is made or restored.
  var SCRIPT = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  var noble = null;
  function argon2() {
    if (!noble) noble = (window.WLBackupArgon2 ? Promise.resolve(window.WLBackupArgon2) : import(new URL('vendor/noble-hashes/argon2.js', SCRIPT || location.href).href)).catch(function (e) { noble = null; throw e; });
    return noble;
  }

  function header(kdf, salt, prefix) {
    var h = new Uint8Array(HEADER), v = new DataView(h.buffer);
    h.set(MAGIC, 0); h[8] = VERSION; h[9] = kdf.id;
    if (kdf.id === KDF_ARGON2ID) { v.setUint32(10, kdf.m); v.setUint32(14, kdf.t); h[18] = kdf.p; } else v.setUint32(10, kdf.iter);
    h.set(salt, 19); h.set(prefix, 35); v.setUint32(42, CHUNK);
    return h;
  }
  function readHeader(h) {
    if (!isBackup(h) || h.length < HEADER) throw fail('format', 'This is not an encrypted Wavelength backup.');
    if (h[8] !== VERSION) throw fail('version', 'This backup was made by a newer version of Wavelength. Update the app, then try again.');
    var v = new DataView(h.buffer, h.byteOffset, HEADER), kdf;
    // Limits keep a crafted file from asking the phone for more memory or time than a real backup would.
    if (h[9] === KDF_ARGON2ID) {
      kdf = { id: KDF_ARGON2ID, m: v.getUint32(10), t: v.getUint32(14), p: h[18] };
      if (kdf.m < 8192 || kdf.m > 262144 || kdf.t < 1 || kdf.t > 10 || kdf.p < 1 || kdf.p > 4) throw fail('format', 'The backup file is damaged.');
    } else if (h[9] === KDF_PBKDF2) {
      kdf = { id: KDF_PBKDF2, iter: v.getUint32(10) };
      if (kdf.iter < 100000 || kdf.iter > 10000000) throw fail('format', 'The backup file is damaged.');
    } else throw fail('format', 'The backup file is damaged.');
    var chunk = v.getUint32(42);
    if (chunk < 4096 || chunk > 16777216) throw fail('format', 'The backup file is damaged.');
    return { kdf: kdf, salt: h.slice(19, 35), prefix: h.slice(35, 42), chunk: chunk, bytes: h.slice(0, HEADER) };
  }

  // Passphrase -> AES-256-GCM key: Argon2id (or PBKDF2) to 32 bytes, then HKDF-SHA256 with a fixed label.
  function deriveKey(passphrase, kdf, salt, onProgress) {
    var ikm;
    if (kdf.id === KDF_ARGON2ID) {
      ikm = argon2().then(function (m) {
        return m.argon2idAsync(pass(passphrase), salt, { t: kdf.t, m: kdf.m, p: kdf.p, dkLen: 32, asyncTick: 25, onProgress: onProgress });
      });
    } else {
      ikm = subtle.importKey('raw', pass(passphrase), 'PBKDF2', false, ['deriveBits']).then(function (k) {
        return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: kdf.iter }, k, 256);
      }).then(function (b) { return new Uint8Array(b); });
    }
    return ikm.then(function (bits) {
      return subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']).then(function (k) {
        if (bits.fill) bits.fill(0);
        return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(INFO) }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
    });
  }
  function nonce(prefix, n, last) {
    var iv = new Uint8Array(12); iv.set(prefix, 0);
    new DataView(iv.buffer).setUint32(7, n); iv[11] = last ? 1 : 0;
    return iv;
  }

  // Encrypts a stream. Returns { write(Uint8Array), finish() }, both promises; sink(Uint8Array) receives the file in
  // order (header first). opts.kdf: 'argon2id' (default) or 'pbkdf2'. opts.onKdfProgress(fraction).
  function encryptor(passphrase, sink, opts) {
    opts = opts || {};
    var kdf = opts.kdf === 'pbkdf2' ? { id: KDF_PBKDF2, iter: PBKDF2_ITER } : { id: KDF_ARGON2ID, m: ARGON.m, t: ARGON.t, p: ARGON.p };
    if (opts.test) Object.assign(kdf, opts.test); // tests only: smaller parameters to keep the suite fast
    var salt = crypto.getRandomValues(new Uint8Array(16)), prefix = crypto.getRandomValues(new Uint8Array(7));
    var head = header(kdf, salt, prefix), n = 0, pend = new Uint8Array(CHUNK), fill = 0;
    var ready = deriveKey(passphrase, kdf, salt, opts.onKdfProgress).then(function (key) { return Promise.resolve(sink(head)).then(function () { return key; }); });
    var chain = ready;
    function seal(key, data, last) {
      if (n >= 0xffffffff) throw fail('size', 'The backup is too large.');
      var iv = nonce(prefix, n++, last);
      return subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: head, tagLength: 128 }, key, data).then(function (c) { return sink(new Uint8Array(c)); });
    }
    function write(data) {
      data = data instanceof Uint8Array ? data : new Uint8Array(data);
      chain = chain.then(function (key) {
        var at = 0, jobs = Promise.resolve();
        while (at < data.length) {
          // A full chunk is sealed only once more data arrives, so the last chunk can carry the last-chunk flag.
          if (fill === CHUNK) { var full = pend; pend = new Uint8Array(CHUNK); fill = 0; jobs = jobs.then(seal.bind(null, key, full, false)); }
          var take = Math.min(CHUNK - fill, data.length - at);
          pend.set(data.subarray(at, at + take), fill); fill += take; at += take;
        }
        return jobs.then(function () { return key; });
      });
      return chain;
    }
    function finish() {
      return chain.then(function (key) { var last = pend.subarray(0, fill); return seal(key, last, true).then(function () { pend.fill(0); }); });
    }
    return { write: write, finish: finish, ready: ready };
  }

  // Decrypts a file read through read(offset, length) -> Promise<Uint8Array> of total size bytes, sending each
  // verified plaintext chunk to sink(Uint8Array) in order. Nothing reaches the sink before its chunk is verified.
  // Rejects with code 'auth' for a wrong passphrase or a changed file, 'format' or 'version' otherwise.
  function decrypt(passphrase, read, size, sink, opts) {
    opts = opts || {};
    if (size < HEADER + TAG) return Promise.reject(fail('format', 'This is not an encrypted Wavelength backup.'));
    return read(0, HEADER).then(function (hb) {
      var h = readHeader(hb), step = h.chunk + TAG;
      return deriveKey(passphrase, h.kdf, h.salt, opts.onKdfProgress).then(function (key) {
        var n = 0, at = HEADER;
        function next() {
          var len = Math.min(step, size - at), last = at + len === size;
          if (len < TAG) return Promise.reject(fail('auth', 'Wrong passphrase, or the file has been changed or damaged.'));
          return read(at, len).then(function (c) {
            return subtle.decrypt({ name: 'AES-GCM', iv: nonce(h.prefix, n, last), additionalData: h.bytes, tagLength: 128 }, key, c).then(null, function () {
              throw fail('auth', 'Wrong passphrase, or the file has been changed or damaged.');
            });
          }).then(function (plain) {
            n++; at += len;
            return Promise.resolve(sink(new Uint8Array(plain), at / size)).then(function () { return last ? null : next(); });
          });
        }
        return next();
      });
    });
  }

  // Reads a Blob or File a slice at a time (File.slice does not load the whole file).
  function blobReader(blob) {
    return function (offset, length) { return blob.slice(offset, offset + length).arrayBuffer().then(function (b) { return new Uint8Array(b); }); };
  }

  window.WLBackup = { isBackup: isBackup, encryptor: encryptor, decrypt: decrypt, blobReader: blobReader, readHeader: readHeader, HEADER: HEADER, CHUNK: CHUNK, ARGON: ARGON, PBKDF2_ITER: PBKDF2_ITER };
})();
