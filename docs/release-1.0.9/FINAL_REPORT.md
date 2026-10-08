# Wavelength 1.0.9 (15): final report

Date: 8 October 2026. Branch `claude/release-1.0.9`, local tag `1.0.9-vc15-unsigned`; starting point
`pre-1.0.9-baseline` (3dbdf3f). Android build unsigned. Nothing was pushed, deployed, signed, uploaded or published.
The phase reports and release documents named below are in `docs/release-1.0.9/`.

## Summary

| Item | State |
| --- | --- |
| Android | Built and tested in the browser harness. Physical-device test **not run** |
| Production server | 1.0.9 works with it as deployed; no server change needed |
| iOS | Static review only; nothing compiled or run |
| Remaining work | Physical-device check, iOS on a Mac, native translation review, and three decisions for Fero (app lock behaviour, iOS export declaration, website copy) |

## 1. Splash-freeze root cause

The screen that looked like a splash was the app's own start placeholder. 1.0.8 drew it, then waited for
`/api/app/me` before opening the logbook or asking for the fingerprint. That request had **no time limit**:
- when it was slow, the prompt was late by the same time (Test 1);
- when it never answered, the app stayed on the placeholder for ever (Test 2).

A request that hangs, rather than fails, is likely on the phone, because 1.0.8 lacked `ACCESS_NETWORK_STATE`. Without
it, WebView cannot tell it is offline, and aeroplane mode often leaves Wi-Fi on with no connection.

Reproduced on the 1.0.8 code: S1, S2 and S4 fail (`phase1-root-cause.md`). How the phone itself behaved is
**inferred**: release builds cannot be debugged, so it was not measured. The fix does not depend on it.

## 2. Sync root cause

1.0.8 synced only on one-shot triggers and swallowed every failure:
- it had no retry;
- the status dot read `navigator.onLine`, so it said "Synced" while pushes were failing;
- without `ACCESS_NETWORK_STATE` the reconnect event most likely never fired;
- the resume trigger fired while the radio was still reconnecting, failed silently, and never ran again;
- the server answered `ok: true` even when it refused an entry.

Reproduced: Y1, Y2, Y3 and Y5 fail on 1.0.8.

## 3. Offline fixes

- A signed-in phone opens its logbook from the phone at once. The lock screen comes first, and the server check runs
  behind it. Authentication is not bypassed: this needs the same stored token and cached account that 1.0.8's
  offline start needed, and the server still signs out a login it no longer accepts.
- Every server call has a time limit. Uploads get time for their size, and a stalled response is cut off.
- A secure-storage read that never answers holds start-up for at most 4 s.
- A recovery screen replaces any start that is still stuck after 10 s. A separate screen appears at once if phone
  storage will not open. Neither deletes anything.
- `ACCESS_NETWORK_STATE` is added (a normal permission, no prompt).
- The last 10 starts are recorded on the phone (no personal data) under Settings, Sync, Start-up details.

## 4. Sync and status improvements

- An entry is marked synced only when the server's answer lists it as saved.
- Refused entries stay unsynced, show the reason, and are resent after an edit or Retry sync.
- Retries run at 2 s, then back off to every 5 minutes. They also run on reconnect, resume and save.
- Batches of at most 50 entries or 400 KB, inside the server's limits.
- Status dot and wording: offline, saved locally (with a count), syncing, synced, failed, sign in again.
- The sync panel shows the status, the count waiting, the last sync time, refused entries and Retry sync.
- Login ended: local entries are kept and sync after the same account signs in.
- Supervisor links and account details load after an offline start. Before this fix they showed "No supervisors
  linked yet" (found by the upgrade test).
- After the review, a sync answer that arrives after a log-out or account switch is dropped.

Details: `phase2-offline-sync.md`.

## 5. Backup architecture and restore

- **Format:** WLBACKUP v1 (`docs/backup-format.md`). AES-256-GCM in 1 MiB chunks, with the header authenticated.
- **Key:** from the passphrase by Argon2id (64 MiB, 3 passes), as Fero chose, then HKDF. Argon2id comes from the
  vendored `@noble/hashes` 2.4.0. Its audit did not cover Argon2; correctness is checked against RFC 9106 and an
  independent Python/OpenSSL decryptor.
- **Contents:** the file holds the logbook, photos and clips, each with a SHA-256.
- **Saving:** made only when the learner asks, and saved where they choose. No automatic upload. No claim that any
  cloud drive is private to the app or end-to-end encrypted.
- **Restore:**
  - adds only what is missing and never overwrites a newer server copy;
  - verifies every chunk and file;
  - asks before restoring another account's backup (closing that question counts as Cancel);
  - still reads old unencrypted 1.0.8 ZIPs, with a warning to replace them.
- **No recovery key:** a forgotten passphrase cannot be recovered, and the app says so first.

## 6. Biometrics and device limitations

- Only the phone's own prompt is used, never camera-based identification. Wavelength never sees a fingerprint or
  face.
- **Android 11+:** strong biometrics or the PIN, pattern or password. Weak camera face unlock is refused.
- **Android 7 to 10:** strong biometrics only. Android cannot offer the PIN in the same prompt there.
- **iPhone:** Face ID or Touch ID with the passcode.
- **Changed after the independent review:** the lock never switches itself off. If the phone's lock is missing, or
  cannot be checked, the logbook stays locked, says why, and offers Log out. Logging in again needs the password and
  the network; nothing on the phone is deleted. On Android 7 to 10 phones with only weak face unlock and the lock
  already on, this means setting up a fingerprint, or logging out and in. 1.0.8 instead switched the lock off.
  **Decision for Fero**; reversible.
- **Not done:** the lock gates the interface; it does not encrypt data with a biometric-bound key.

Details: `phase3-security.md`, `SECURITY_REVIEW.md`.

## 7. About and version display

- Me and Settings end with a footer: Wavelength, version and build, "© 2026 Auda Medical Ltd", and About Wavelength.
- About shows:
  - version and build, read from the installed app (`App.getInfo()`), with the built-in numbers as a fallback;
  - developer and website;
  - a Contact support email (version, platform and language only);
  - privacy policy and terms;
  - open-source licences grouped by licence, with full texts.
- Works offline and in all eight languages, including Arabic right to left.
- The version is never written in the code (unit test).

## 8. Android status

Built: unsigned APK and AAB, 1.0.9 (15), package `uk.co.thewavelength.app`, targetSdk 36, minSdk 24. The logbook is
bundled inside the app, with no remote `server.url` (`BUILD_INFO.md`).

Tested:
- 238 of 238 unit tests;
- every browser suite against the current Worker.

**Not run on a phone.** Ready for Fero to sign with the 1.0.8 upload key and run `ACCEPTANCE_CHECKLIST.md`.

## 9. iOS status

Every 1.0.9 change is in the shared logbook code. No iOS file changed.

Static review: the version fields, Face ID text, plugins, iOS 15 support for the features used, the CSP and the
backup exclusion are all in order (`IOS_READINESS.md`).

**Not compiled or run.** Needs a Mac for:
- the build;
- `npx cap sync ios`;
- runtime checks (crypto, Argon2 load, Face ID, file export and restore, storage).

Before submitting, Fero must confirm the export-compliance declaration (`ITSAppUsesNonExemptEncryption`).

## 10. Test results and outstanding defects

Results:
- Unit: 238 / 238.
- Browser, current Worker: e2e-native all pass; offline 16/16, backup 11/11, About 15/15, upgrade 12/12,
  resilience 12/12.
- Browser, production code: the same, except offline 15/16. The missing check, Y5, tests the optional server field.

The independent review found 7 defects. All are fixed and retested (`SECURITY_REVIEW.md` section 8).

No known open defect in the tested paths. Open items (`OUTSTANDING_ISSUES.md`):
- physical-device test;
- iOS on a Mac;
- native translation review;
- Argon2 timing on old phones;
- the account-switch guard has no automated test;
- the website /app/get/ copy still describes one-tap unencrypted backups.

Details: `TEST_REPORT.md`.

## 11. Backend dependencies and deployment

**None required.** 1.0.9 works fully against the production Worker code (2dfd55e, labelled production in the recovery
archive). An earlier read-only check in this project found the live Worker running main-equivalent code; it was not
re-checked for this report. One cosmetic gap carries over from 1.0.8: a supervisor label from the live Worker shows
in English in the other seven languages.

One optional, backward-compatible change exists: the `rejected` list in sync answers. It has no migration.

Deploy and rollback steps are in `BACKEND_DEPLOYMENT.md`. **Production approval is needed before any deploy**, and
Fero runs it. Deploying this branch would also deploy the GMC work from 3dbdf3f, so choose deliberately.

## 12. Upgrade compatibility with 1.0.8

Nothing about storage changed:
- IndexedDB version 2 and its stores;
- the token key `wavelength.session`;
- the `wl-lock` preference;
- localStorage keys;
- the `https://localhost` origin;
- the package.

`tools/e2e-upgrade.mjs` ran the bundle from the signed 1.0.8 APK, then 1.0.9 on the same storage. Kept:
- login;
- app lock setting;
- entries, photos, sign-offs and assessments;
- the waiting offline scan, which then synced once;
- both supervisor links and both trainees;
- preferences.

A second session saw the offline scan. No uninstall or clear-storage step is ever needed.

Still to prove on the phone: that Android keeps the data across the APK update. That needs the same signing key.

## 13. Physical-device testing instructions

`ACCEPTANCE_CHECKLIST.md`:
1. Sign 1.0.9 with the 1.0.8 key.
2. Note the phone's state.
3. Install over 1.0.8 without uninstalling.
4. Repeat Test 1, and Test 2 in aeroplane mode.
5. Save a scan offline, reconnect, and confirm it appears on the website or a second phone (required check C3).
6. Then check the data kept by the upgrade, the app lock, backup and restore, and About.

Every step is marked NOT RUN.

## 14. Unsigned APK and AAB

In `wavelength-android/1.0.9-vc15-unsigned/`:

| File | SHA-256 |
| --- | --- |
| `wavelength-1.0.9-vc15-release-unsigned.apk` (7,475,649 bytes) | `c8ebd3d21dabbcf31bd7912fe249dcb206f98dba58af09e81c5d6ee42f7a3f01` |
| `wavelength-1.0.9-vc15-release-unsigned.aab` (6,710,926 bytes) | `e08c8399b7c396c322048892076797d8bfb8f2013d88a7122c7756fdcd6f635c` |

Built from commit `cb445c7`. The commits after it change documents only.

## 15. SHA-256 and recovery archive

- **Checksums:** `SHA256SUMS.txt` in the artefact folder covers the APK, the AAB and the recovery archive.
- **Recovery archive:** `wavelength-site-1.0.9-recovery.tar.gz` holds the whole repository with its full Git history
  (`.git`). It leaves out `node_modules` and build outputs. Its SHA-256 and verification steps are in
  `RECOVERY_ARCHIVE.md` next to it. The hash cannot be written in this file, because this file is inside the
  archive.
- **1.0.8 files:** the signed 1.0.8 APK and AAB still match their recorded checksums and were not modified.

## Independent final review (5.6)

| # | Check | Result |
| --- | --- | --- |
| 1 | Diff against the starting commit reviewed | Yes: an independent reviewer read the whole diff, and its 7 findings were fixed |
| 2 | Each feature addressed | Yes: sections 1 to 7 above. iOS runtime and the on-phone test are not done (sections 9, 13) |
| 3 | Full suite re-run | Yes, on `cb445c7`: unit 238/238 and every browser suite, against both Workers. Unit tests re-run on the final commit |
| 4 | Clean repository state | `git status` clean on the final commit. `git fsck` clean |
| 5 | Package ID and version | `uk.co.thewavelength.app`, 1.0.9 (15), in both the APK and the AAB |
| 6 | Privacy and security | `SECURITY_REVIEW.md`. No new data collected, no media uploaded, lock fails closed |
| 7 | Unfinished work | `OUTSTANDING_ISSUES.md` |
| 8 | Production backend changes needed | None required. One optional change, not deployed |
| 9 | Release archive and hashes | Archive extracted and checked (`git fsck`, HEAD, tests); hashes in `SHA256SUMS.txt` |
| 10 | 1.0.8 files untouched | `sha256sum -c` passes in `1.0.8-vc14-signed/` and `1.0.8-vc14-unsigned/` |
