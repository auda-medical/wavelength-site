#!/usr/bin/env python3
"""Decrypts a Wavelength encrypted backup (WLBACKUP version 1) on a computer, without the app.

The output is the plain backup: a ZIP holding wavelength-backup.json (logbook entries) and images/ (photos and clips).
The format is in docs/backup-format.md. This script is a second, independent reader of that format, so a backup
never depends on the app alone.

Needs Python 3.9+ and the 'cryptography' package, version 44 or later with OpenSSL 3.2+ for Argon2id
(pip install cryptography). Usage:
    python3 tools/backup-decrypt.py Wavelength-backup.wlbackup backup.zip
The passphrase is asked for and never shown, stored or logged. Keep the decrypted ZIP somewhere safe and delete it
when you no longer need it: it is not encrypted.
"""
import getpass
import os
import struct
import sys

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

MAGIC, HEADER, TAG = b'WLBACKUP', 48, 16
INFO = b'Wavelength backup v1 AES-256-GCM'


def key_for(passphrase, h):
    kdf_id, salt = h[9], h[19:35]
    pw = passphrase.encode('utf-8')  # the app normalises to NFC first
    if kdf_id == 1:
        from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
        m, t = struct.unpack('>II', h[10:18])
        ikm = Argon2id(salt=salt, length=32, iterations=t, lanes=h[18], memory_cost=m).derive(pw)
    elif kdf_id == 2:
        (it,) = struct.unpack('>I', h[10:14])
        ikm = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=it).derive(pw)
    else:
        raise SystemExit('Unknown key derivation in this file.')
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=INFO).derive(ikm)


def main(src, dst):
    import unicodedata
    size = os.path.getsize(src)
    with open(src, 'rb') as f:
        h = f.read(HEADER)
        if len(h) < HEADER or h[:8] != MAGIC:
            raise SystemExit('This is not an encrypted Wavelength backup.')
        if h[8] != 1:
            raise SystemExit('This backup uses a newer format version (%d).' % h[8])
        chunk = struct.unpack('>I', h[42:46])[0]
        prefix = h[35:42]
        passphrase = unicodedata.normalize('NFC', getpass.getpass('Backup passphrase: '))
        aes = AESGCM(key_for(passphrase, h))
        at, n = HEADER, 0
        tmp = dst + '.part'
        with open(tmp, 'wb') as out:
            while True:
                length = min(chunk + TAG, size - at)
                last = at + length == size
                if length < TAG:
                    raise SystemExit('The file is incomplete.')
                c = f.read(length)
                iv = prefix + struct.pack('>I', n) + (b'\x01' if last else b'\x00')
                try:
                    out.write(aes.decrypt(iv, c, h))
                except InvalidTag:
                    out.close()
                    os.remove(tmp)
                    raise SystemExit('Wrong passphrase, or the file has been changed or damaged.')
                n += 1
                at += length
                if last:
                    break
        os.replace(tmp, dst)
    print('Decrypted to', dst)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
