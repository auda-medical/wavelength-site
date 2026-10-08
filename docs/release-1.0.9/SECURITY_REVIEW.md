# Wavelength 1.0.9: security and privacy review

Date: 8 October 2026. Scope: every change on `claude/release-1.0.9` since `pre-1.0.9-baseline` (3dbdf3f, the 1.0.8
source). The review was done twice: once while building (Phase 3, `phase3-security.md`) and once by an independent
reviewer with no part in writing the code (Phase 5). This document joins the two and records what the second review
changed.

This is an engineering review. It makes no NHS, UK GDPR or other compliance claim. It is not a penetration test, and
nothing here ran on a physical phone.

## 1. Summary

| Area | Result |
| --- | --- |
| Encrypted backups | AES-256-GCM in 1 MiB chunks, Argon2id key (Fero's choice, 8 October). Correct against RFC 9106 and an independent Python/OpenSSL decryptor. No custom cryptography |
| App lock | Only the operating system's prompt. Strong biometrics or the screen lock on Android 11+, strong biometrics only on Android 7 to 10, Face ID or Touch ID with passcode on iPhone. **Changed in Phase 5: the lock no longer switches itself off** |
| Login token | Keystore-encrypted (Android) or Keychain (iOS) storage, as in 1.0.8. Not bound to the biometric prompt |
| Clinical media | Never uploaded automatically. No automatic cloud copy. Backups are made only when the learner asks, and are encrypted |
| Network | Same single server (thewavelength.co.uk). Content Security Policy unchanged. No new third-party service |
| Permissions | Adds `ACCESS_NETWORK_STATE` (Android, a normal permission with no prompt). Nothing else |
| Server | One optional, backward-compatible change (`rejected` list in sync answers). No migration |
| Logs | No token, passphrase, photo or clip appears in logs or request bodies (automated checks R8, R9) |

## 2. Encrypted backups

Format: `docs/backup-format.md` (WLBACKUP version 1).

- **Key:** passphrase of at least 10 characters, Argon2id (64 MiB, 3 passes, 1 lane, 16-byte random salt), then
  HKDF-SHA256 to the AES key. Argon2id comes from `@noble/hashes` 2.4.0, vendored unmodified with its MIT licence.
  **Its 2022 Cure53 audit did not cover Argon2.** Correctness is shown instead by the RFC 9106 test vector and by
  decrypting app-made files with `tools/backup-decrypt.py` (Python `argon2-cffi` and `cryptography`/OpenSSL).
- **Encryption:** AES-256-GCM through the phone's own Web Crypto. A new salt, and so a new key, for every file. The
  96-bit nonce is a random 7-byte prefix, a 32-bit chunk counter and a last-chunk flag, so no nonce repeats under a
  key. The 48-byte header is the additional authenticated data of every chunk.
- **Integrity:** each chunk's tag is checked before its data is used. Reordered, dropped, truncated or appended
  chunks are detected. Each photo and clip also carries a SHA-256 in the manifest, checked on restore.
- **Limits on hostile files:** Argon2id memory at most 256 MiB, at most 10 passes and 4 lanes; chunk size between
  4 KiB and 16 MiB. A crafted header cannot make the phone allocate without bound.
- **Restore:** adds only what the phone lacks, never overwrites a live server copy, and asks before restoring a
  backup that belongs to another account. **Changed in Phase 5:** closing that question with Back, Escape or a tap
  outside now counts as Cancel (it used to leave the restore waiting silently).
- **Lost passphrase:** there is no recovery key and no copy held by Wavelength. A forgotten passphrase means the
  backup cannot be opened. The app says this before the backup is made.
- **Where the file goes:** the learner chooses (Files, Google Drive, OneDrive, iCloud Drive, email, and so on). The
  app does not claim that any of these is private to the app or end-to-end encrypted. The file is encrypted before
  it leaves the app, so the storage provider holds ciphertext only.
- **Old backups:** 1.0.8 made unencrypted ZIP files. 1.0.9 still restores them, warns that anyone with that storage
  can read them, and asks the learner to replace and delete them.

## 3. App lock

- Uses `@capgo/capacitor-native-biometric` 8.7.0: Android BiometricPrompt, iOS LocalAuthentication. Wavelength never
  sees a fingerprint or face. No camera-based identification. No network use (unit test asserts no request).
- Android 11+: `BIOMETRIC_STRONG | DEVICE_CREDENTIAL`. Class 2 (weak, camera-only) face unlock is not accepted.
- Android 7 to 10: `BIOMETRIC_STRONG` only, because Android cannot offer strong biometrics and the PIN in one prompt
  there. A phone with only weak face unlock cannot turn the lock on.
- iPhone: Face ID or Touch ID with passcode fallback.
- The lock screen covers the app before the logbook is drawn, and after 90 s in the background.
- **Changed in Phase 5 (independent review finding 3):** 1.0.8 switched the lock off whenever the availability
  check said no, or failed. Anyone holding the phone could get in by removing the phone's screen lock, and 1.0.9's
  strong-only rule would have done the same to Android 7 to 10 phones with weak face unlock. Now the lock never
  switches itself off:
  - check failed: stays locked, "Could not check your phone's lock. Tap Unlock to try again.";
  - no suitable lock: stays locked and says what to set up, or offers Log out. Logging in again needs the account
    password and the network. Logging out keeps the logbook on the phone, and waiting entries sync after the same
    account logs in again. The lock is off after that login and can be turned back on.
  - Trade-off: on Android 7 to 10 with only weak face unlock and the lock already on, the learner must set up a
    fingerprint, or log out and log in online, before using the app. Nothing is deleted. This is a security choice
    made in the review and can be reversed if Fero prefers the old behaviour.
- The lock gates the interface. It does not encrypt the logbook or the token with a biometric-bound key (see
  outstanding issues).

## 4. Data on the phone

Unchanged from 1.0.8, reviewed in `phase3-security.md` section 4:
- logbook, photos and clips in the WebView's IndexedDB inside the app sandbox, protected by the phone's file-based
  encryption;
- Android backup off (`allowBackup=false`, data-extraction rules exclude every domain);
- iOS `Library/WebKit` excluded from iCloud and computer backups.

The app adds no database encryption of its own (see outstanding issues). The app-switcher snapshot is not hidden
(`FLAG_SECURE` not set), also in outstanding issues.

## 5. Network and server

- The bundled app talks only to `https://thewavelength.co.uk`. `capacitor.config.json` in the built APK and AAB has
  no `server.url`: the logbook runs from files inside the app, not from a remote page (checked in `BUILD_INFO.md`).
- **Changed in Phase 5 (findings 1 and 2):** server calls have time limits so nothing waits for ever. Uploads get
  extra time for their size (enough at 16 KB/s), and a response that stalls after its headers is cut off after
  60 s, so sync cannot hang. These limits affect availability only, not what is sent.
- **Changed in Phase 5 (finding 7, older than 1.0.9):** a sync answer that arrives after a log-out, or after a log-in
  to another account, is dropped, so one account's data can never be written into another account's logbook on a
  shared phone.
- **Changed in Phase 5 (finding 4):** a slow read of the stored login at start can no longer put back an old token
  over a login made in the meantime. A lock setting read late now locks the app at once.
- Server change: `POST /api/app/sync` also returns `rejected: [{id, reason}]`. It reveals nothing new: the reasons
  are fixed English sentences, and an entry id is echoed only to the account that sent it. "This entry belongs to
  another account" confirms only that an id the phone made itself is taken, which 1.0.8 already implied by not
  saving it.

## 6. Privacy

- No new data is collected or sent. The support email (About) contains only the app version, platform and
  language, and opens in the learner's own mail app. Covered by `test/about.test.mjs`.
- The start-up details kept on the phone (last 10 starts: route, timings, server result) contain no personal data
  and never leave the phone.
- No analytics, crash reporting or advertising SDK was added. The open-source licence list matches the shipped
  dependencies (`test/about.test.mjs`).
- Tests used dummy accounts and generated media only. No real patient data was used.

## 7. Export compliance (iOS)

`ios/App/App/Info.plist` declares `ITSAppUsesNonExemptEncryption = false`. 1.0.9 adds encryption of user data
(AES-256-GCM via the operating system, Argon2id via a vendored library) for the learner's own backups. Apple's
exemptions usually cover this, but the declaration is Fero's to confirm before the iOS submission. Not changed.

## 8. Independent review findings (Phase 5) and what was done

| # | Finding | Severity | Done |
| --- | --- | --- | --- |
| 1 | 20 s limit cut off large uploads (sign-off clips up to 12 MB) | High | Fixed: extra time per byte uploaded. Unit test |
| 2 | A response body that stalls could hold sync until restart | Medium | Fixed: body cut off 60 s after headers, treated as offline. Unit test |
| 3 | App lock switched itself off when the check failed or the phone lock was missing | High | Fixed: stays locked, explains, offers Log out. Unit test, e2e R4b, e2e-native |
| 4 | A late secure-storage read could replace a newer login | Medium | Fixed: a late read never overwrites a token set since; a late lock locks now. Unit test |
| 5 | Closing the "Restore into this account?" sheet left the restore hanging | Low | Fixed: closing counts as Cancel. e2e R7b |
| 6 | "Taking longer than usual" screen flashed before the offline logbook | Low | Fixed: the start-up server check ends before the recovery screen is due |
| 7 | Sync answer after an account switch written into the new account (predates 1.0.9) | Medium | Fixed: answers from an earlier session are dropped. Code review only, no automated test |
| - | Website service worker did not precache the Argon2 files | Low | Fixed: added to the offline cache list |
