# Wavelength encrypted backup format (WLBACKUP version 1)

Introduced in app 1.0.9. Written by `src/app/backup.js` (the app) and read by the app and by
`tools/backup-decrypt.py` (an independent reader for computers). Approved by Fero on 8 October 2026: Argon2id,
built into the app. This format is permanent once 1.0.9 ships: every later app version must keep reading it.

File extension `.wlbackup`, media type `application/octet-stream`. All integers are big-endian.

## Header (48 bytes)

| Offset | Size | Field |
|---|---|---|
| 0 | 8 | Magic `WLBACKUP` (57 4C 42 41 43 4B 55 50) |
| 8 | 1 | Format version, `1` |
| 9 | 1 | Key derivation: `1` Argon2id, `2` PBKDF2-HMAC-SHA256 |
| 10 | 8 | Argon2id: memory in KiB (u32), passes (u32). PBKDF2: iterations (u32), then 4 zero bytes |
| 18 | 1 | Argon2id: lanes. PBKDF2: zero |
| 19 | 16 | Salt (random per file) |
| 35 | 7 | Nonce prefix (random per file) |
| 42 | 4 | Chunk size in bytes (u32), `1048576` |
| 46 | 2 | Reserved, zero |

The app writes Argon2id with 65536 KiB (64 MiB), 3 passes, 1 lane (RFC 9106 section 4, second recommended
option, single lane). Readers refuse files outside these limits before doing any work, so a crafted file cannot ask a
phone for unbounded memory or time: Argon2id memory 8192 to 262144 KiB, passes 1 to 10, lanes 1 to 4; PBKDF2
100,000 to 10,000,000 iterations; chunk size 4096 to 16 MiB. A version other than 1 is refused with "made by a newer
version of Wavelength".

## Key

1. Passphrase: Unicode NFC, then UTF-8.
2. 32 bytes from Argon2id (or PBKDF2-HMAC-SHA256) with the header's salt and parameters.
3. HKDF-SHA256 (RFC 5869) with an empty salt and info `Wavelength backup v1 AES-256-GCM`, 32 bytes: the AES-256 key.

## Body

The plaintext payload is cut into chunks of exactly the chunk size; the last chunk holds the remainder and may be
empty (an empty payload is one empty last chunk). Chunk `n` (from 0) is stored as AES-256-GCM ciphertext followed by
its 16-byte tag, with:

- nonce (12 bytes): the 7-byte prefix, `n` as u32, then `01` for the last chunk and `00` otherwise;
- additional authenticated data: the whole 48-byte header.

A reader takes `chunk size + 16` bytes at a time; the chunk that reaches the end of the file is the last one. Any
changed byte (header included), reordering, removal, truncation or appended data fails a tag check. A reader must
not release a chunk's plaintext before its tag verifies. The app stops at the first failure and keeps what it had
already restored from verified chunks; it never writes anything unverified.

## Payload

A stored (uncompressed) ZIP, written and read as a stream:

- `wavelength-backup.json` first: `{ app: "wavelength-logbook", version: 3, created, account, entries: [...],
  images: [{ id, entryId, w, h, kind: "image" | "clip", type, dur, sha256, file, thumb }] }`. `sha256` is the
  hex SHA-256 of the image or clip file; restore checks it.
- then each file under `images/`: a clip's poster frame (`<id>-thumb.jpg`) comes before the clip itself.

Manifest versions 1 and 2 are the older unencrypted `.zip` backups, which 1.0.9 still restores after a warning.

### Optional fields added in 1.0.12 (manifest version still 3)

Readers before 1.0.12 ignore unknown fields and unknown files, so a 1.0.12 backup restores in 1.0.9 to 1.0.11 (the
photo or clip as saved, with any annotations already in its pixels). 1.0.12 restores older backups unchanged.

- `annot`: `{ v: 1, ann: [...], burnt }`, the annotation layer of a photo or clip, as drawn by `src/app/editor.js`.
  Each annotation is `{ type, x, y, color, ... }` in fractions of the picture (text up to 80 characters, at most 60
  annotations). Readers must clean it again on the way in (`WLEditor.cleanAnn`). `burnt: true` (clips) means the
  annotations are only in the pixels and cannot be edited again.
- `base`: `images/<id>-base.jpg`, for a photo with annotations: the same photo with its redactions and without its
  annotations, so the annotations can be changed after a restore. It comes before the photo's own file. It is never an
  unredacted original: redactions are in its pixels.
- `prov`: up to 10 editing sessions `{ on, crop, r, m, redact, ann }` (date, whether cropped, orientation, counts).
  No text, coordinates or identifiers.

## Reading a backup on a computer

```
pip install cryptography        # version 44+ with OpenSSL 3.2+ for Argon2id
python3 tools/backup-decrypt.py Wavelength-backup-2026-10-08.wlbackup backup.zip
```

The decrypted ZIP is not encrypted: keep it safe and delete it after use.
