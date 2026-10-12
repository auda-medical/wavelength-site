# Wavelength 1.0.9 (15): test report

Final run: 8 October 2026, on commit `cb445c7` (all code changes; later commits are documents only). Dummy accounts and
generated media only.

## Where the tests ran, and where they did not

- **Ran:** Node unit tests, and browser tests. The browser tests used the real 1.0.9 app bundle (`mobile/www`,
  identical to the APK's `assets/public`) in Chromium with a stand-in native bridge (`tools/native-harness.mjs`:
  secure storage, preferences, biometric prompt, share, filesystem, app info and lifecycle events). They talked to
  the real Worker code run locally (`tools/dev-worker.mjs`) with every database migration.
- **Not run:** nothing ran on an Android phone, in Android WebView, on iOS or in WKWebView. Chromium stands in for
  both. The physical-device checks are in `ACCEPTANCE_CHECKLIST.md`, all marked NOT RUN.
- No test was skipped, disabled or weakened to pass. One existing check changed its expectation because the
  behaviour changed on purpose: `tools/e2e-native.mjs` used to expect the app lock to switch itself off when the
  phone has no lock. It now expects the lock to stay on and explain (independent review finding 3).

## Results

| Suite | What it covers | Current Worker | Production code (2dfd55e) |
| --- | --- | --- | --- |
| `npm test` (unit and Worker) | 238 tests: the 201 from 1.0.8 plus 37 new | **238 / 238** | n/a |
| `tools/e2e-native.mjs` | Store-app basics: sign-up, token, offline start, scan save, back button, app lock, export, insets, CSP | **All pass** | All pass |
| `tools/e2e-offline.mjs` | Start-up without network, sync, retries, refusals, batches (S1 to S4, Y1 to Y9) | **16 / 16** | 15 / 16 (Y5, expected) |
| `tools/e2e-backup.mjs` | Encrypted backup and restore (B1 to B11) | **11 / 11** | 11 / 11 |
| `tools/e2e-about.mjs` | About, version, licences, support email (A1 to A15) | **15 / 15** | 15 / 15 |
| `tools/e2e-upgrade.mjs` | 1.0.8 bundle from the signed APK, then 1.0.9 on the same storage (U0 to U11) | **12 / 12** | 12 / 12 |
| `tools/e2e-resilience.mjs` | Harder cases (R1 to R10, R4b, R7b) | **12 / 12** | 12 / 12 |

Y5 against 2dfd55e checks the optional server field `rejected`, which is not deployed. The app's own handling of a
refused entry (Y8a, Y8b) passes against both. See `BACKEND_DEPLOYMENT.md`.

Result files:
- `docs/release-1.0.9/phase5/*.json` (current Worker);
- `docs/release-1.0.9/compat-production-2dfd55e/*.json` (production code);
- earlier phases' files in `docs/release-1.0.9/`.

On the 1.0.8 code, the start-up and sync checks failed 7 of 9 (`phase1-e2e-offline-baseline.json`). That is the
reproduction of the reported failures.

## Coverage of the brief (5.1)

| Area | Automated checks | Not covered automatically |
| --- | --- | --- |
| **Start-up** | S1 to S4 (no network, slow network, failing calls, lock first); R1 (damaged cached account); R2 (storage that will not open); `sync-ack` unit tests (time limits); `net-timeout` (calls without an answer, late secure-storage read) | Android WebView's own offline behaviour; real splash timing on a phone |
| **Sync** | Y1 to Y9 (reconnect without events, resume, refusals, lost answers, login ended, batches); R3, R5; U7, U11 (second session sees the offline scan); `sync-ack` (9 tests); `net-timeout` (upload time, stalled body) | Account-switch guard (review finding 7): code review only. On-phone reconnect (checklist C) |
| **Backup** | B1 to B11; R6 (60 MB, 30 files, fresh phone); R7, R7b (another account's backup, Cancel and Escape); `backup-format` (12 tests: RFC 9106 vector, tampering, truncation, limits, Python interop) | Argon2id speed on a slow phone; the Android share sheet and file picker |
| **Security** | `biometric` (7 tests: strong-only, PIN fallback rules, iOS, no network, failed prompt, failed check keeps the lock, lock never turns itself off); R4, R4b; R8 (no token or passphrase in logs); R9 (no media in any request); A4 (support email has no account details); B3 (file is encrypted) | Real BiometricPrompt and Keystore behaviour; Face ID |
| **UI** | A1 to A15 (About, keyboard, 48 px targets, offline, Arabic right to left); Y2, Y6a, Y8a (status wording); e2e-native insets and back button; `tools/native-shots.mjs` light, dark and Arabic screens at 390 px with overflow and page-error checks; R10, U10, A15 (no page errors) | Contrast checks (`tools/theme-shots.mjs` needs Wrangler, not available here); native review of translations; real phone screens |

## Upgrade from 1.0.8 vc14 (5.2)

`tools/e2e-upgrade.mjs` runs the web bundle taken read-only from the **signed 1.0.8 APK**. It sets up the case
described in the brief, then starts 1.0.9 on the same browser storage:
- signed in, with app lock on and the dark theme;
- two supervisors linked, and the account supervising two trainees;
- a signed-off scan and an assessment;
- a scan saved offline and waiting, with two photos.

It checks:
- the login token is unchanged in secure storage, and no sign-in is asked (U3);
- the app lock setting is kept and the phone prompt is used (U2, U5);
- every entry, photo, sign-off and assessment is still there, and the offline scan is still waiting (U4);
- preferences are kept (U5);
- the scan reaches the server exactly once when online (U7);
- both supervisor links and both trainees are shown (U8);
- About shows 1.0.9 (15) (U9);
- a **second signed-in session sees the scan saved offline in 1.0.8** (U11).

This proves the storage keys and formats carry over. It does not prove that Android keeps the app's data across the
APK update: that depends on the same package and signing key, and is checked on the phone (checklist sections B
and D).

## Physical-device acceptance test (5.2)

Not run. No phone is available here. `ACCEPTANCE_CHECKLIST.md` lists the steps:
- the two original failures (Test 1, and Test 2 in aeroplane mode);
- the offline scan becoming visible in a second signed-in session after reconnection and a successful sync
  (section C);
- data kept by the upgrade;
- app lock, backup and restore, and About.

**No result is claimed for any of it.**

## New tests added in 1.0.9

- Unit:
  - `test/sync-ack.test.mjs` (9);
  - `test/backup-format.test.mjs` (12);
  - `test/biometric.test.mjs` (7);
  - `test/about.test.mjs` (5);
  - `test/net-timeout.test.mjs` (4).
- Browser:
  - `tools/e2e-offline.mjs`;
  - `tools/e2e-backup.mjs`;
  - `tools/e2e-about.mjs`;
  - `tools/e2e-upgrade.mjs`;
  - `tools/e2e-resilience.mjs`.
- Helpers:
  - `tools/dev-worker.mjs`;
  - `tools/native-shots.mjs`;
  - `tools/backup-decrypt.py`;
  - extensions to `tools/native-harness.mjs`.

How to re-run: see the header comment of each tool. In short, build the bundle with
`WL_APP_VERSION=1.0.9 WL_VERSION_CODE=15 node mobile/scripts/build-www.mjs`, start
`node --import ./test/helpers/register.mjs tools/dev-worker.mjs`, then run each `tools/e2e-*.mjs`.
