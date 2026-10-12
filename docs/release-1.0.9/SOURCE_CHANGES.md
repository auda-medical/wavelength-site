# Wavelength 1.0.9: source changes

From tag `pre-1.0.9-baseline` (3dbdf3f, the 1.0.8 source) to branch `claude/release-1.0.9`. Local commits only;
nothing was pushed or merged. To see everything: `git diff pre-1.0.9-baseline..claude/release-1.0.9`.

## Commits

| Commit | Phase | Summary |
| --- | --- | --- |
| a2f74f7 | 1 | Reproduce the offline start freeze and lost sync: local Worker, harness network modes, `e2e-offline` checks that fail on 1.0.8 |
| c4321a4 | 2 | Open offline at once; sync that retries and only trusts the server's answer; status wording; `ACCESS_NETWORK_STATE`; Worker `rejected` list |
| 9306571 | 3 | Encrypted backups (AES-256-GCM, Argon2id); strong-only app lock; security report |
| 98016eb | 4 | About Wavelength: version from the installed app, licences, support email |
| 3507d19 | 5 | Upgrade test from the signed 1.0.8 bundle; supervisor links load after an offline start (bug found by the test) |
| c9731fd | 5 | Recovery screen when phone storage will not open; resilience checks; second-session check |
| 8785946 | 5 | Compatibility results against the production Worker code (2dfd55e) |
| cb445c7 | 5 | Fixes from the independent review; security, outstanding-issues, checklist, iOS and backend reports |
| (next) | 5 | Final reports only (no code) |

## Files by area

### App (shared by Android and iOS)

- `src/app/app.js`:
  - start-up without waiting for the network, the recovery screen and start-up details;
  - sync with acknowledgements, retries, batches, refusals and a session guard;
  - status dot and panel;
  - login-ended handling;
  - encrypted backup and restore screens;
  - app lock that never switches itself off;
  - About, licences and the footer.
- `src/app/native.js`:
  - time limits on server calls, including upload time and stalled bodies;
  - start-up that never waits more than 4 s on secure storage, and a late read that never overwrites a newer login;
  - lock rules (strong biometrics, PIN fallback on Android 11+ and iOS);
  - `appInfo()`.
- `src/app/backup.js` (new): the WLBACKUP v1 reader and writer.
- `src/app/zip.js`: streaming ZIP writer and reader for backups.
- `src/app/licences.js` (new): the open-source licence list and texts.
- `src/app/vendor/noble-hashes/*` (new, vendored unmodified): Argon2id from `@noble/hashes` 2.4.0, MIT.
- `src/app/vendor/LICENSES.txt`: adds `@noble/hashes`.
- `src/app/index.html`: loads `backup.js`.
- `src/app/sw.js`: website offline cache adds `backup.js`, `licences.js` and the Argon2 modules.
- `src/app/app.css`: status, sync panel, backup, About, licences and recovery screen styles.
- `src/app/i18n/*.json`: new strings in fr, es, de, it, pl, ru, ar and zh (machine-drafted).
- `tools/i18n/strings.json`: regenerated string catalogue.

### Android and build

- `mobile/android/app/src/main/AndroidManifest.xml`: `ACCESS_NETWORK_STATE`.
- `mobile/scripts/patch-native.py`: adds the same permission when the Android project is regenerated.
- `mobile/scripts/build-www.mjs`: writes `versionCode` into `native-config.js`.
- **Unchanged:**
  - `mobile/android/app/build.gradle`, including the signing configuration;
  - `capacitor.config.json`;
  - the package ID;
  - every iOS file.

### Server (optional, not deployed)

- `worker/app.js` `syncPost`: adds `rejected: [{id, reason}]` to the sync answer. 13 lines.
- **Unchanged:**
  - migrations;
  - `wrangler.jsonc`;
  - switches;
  - the GMC registration review and Wavelength Verified wording and logic.

### Tests and tools

- Unit tests:
  - `test/sync-ack.test.mjs`;
  - `test/backup-format.test.mjs`;
  - `test/biometric.test.mjs`;
  - `test/about.test.mjs`;
  - `test/net-timeout.test.mjs`.
- Browser tests:
  - `tools/e2e-offline.mjs`;
  - `tools/e2e-backup.mjs`;
  - `tools/e2e-about.mjs`;
  - `tools/e2e-upgrade.mjs`;
  - `tools/e2e-resilience.mjs`;
  - `tools/e2e-native.mjs` (lock expectation updated).
- Helpers:
  - `tools/dev-worker.mjs`;
  - `tools/native-harness.mjs`;
  - `tools/native-shots.mjs`;
  - `tools/backup-decrypt.py`.

### Documents

- `docs/backup-format.md`.
- `docs/release-1.0.9/*`: phase reports, result files and these release reports.
- `CLAUDE.md`: notes on backups, the app lock and About.

## What did not change on purpose

- **Storage:**
  - IndexedDB version (2) and store names;
  - secure-store key `wavelength.session`;
  - preference `wl-lock`;
  - localStorage keys;
  - WebView origin (`https://localhost`).
- **Behaviour:**
  - no automatic upload of clinical media;
  - no camera-based identification;
  - supervisor search and professional verification stay off.

## Size

75 files changed, 9,002 lines added and 159 removed (`git diff --shortstat pre-1.0.9-baseline`). Of the added lines,
2,203 are the vendored Argon2 library and about 1,500 are test result files. Most of the rest are documents, tests and
translations. The app code itself (`src/app` scripts, styles and page, without vendor files, licence texts or
translations) is 839 lines added.
