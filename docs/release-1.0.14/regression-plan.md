# Regression plan for Android releases (from 1.0.14)

Run in this order before every candidate. Steps 1 to 6 need no phone. Each test step must pass (or match a documented
exception) before the next.

1. **Unit and Worker tests.** Run `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`.
   - Run it directly: on Windows `npm test` passes the quoted glob to Node unexpanded and runs 0 tests.
   - Run it on an LF checkout.
2. **Build the bundle** with the release's version: `WL_APP_VERSION=… WL_VERSION_CODE=… node mobile/scripts/build-www.mjs`.
   Then start the local Worker (`node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8787`) and the site
   server (`… tools/dev-worker.mjs 8792 --site`). Restart both after every build.
3. **This release's browser checks:** `node tools/e2e-1014.mjs <out>` (sections P S H C L G A B R F I).
   - Run them on the new bundle (all pass), then on the previous release's APK assets (`BUNDLE=<unzipped>/assets/public`).
   - The second run shows each fixed defect failing before the fix.
4. **Earlier browser checks:**
   - `e2e-1013` (Z, N);
   - `e2e-1012` (S D H M E C G B);
   - `e2e-1011` (stops at E6 by design; F0 must report no differences against the previous APK's assets);
   - `e2e-1010`, `e2e-native`, `e2e-offline`, `e2e-about`;
   - `e2e-upgrade` (previous assets → new);
   - `theme-shots` against the site server.
   - When a release changes behaviour on purpose, update the older check to the new behaviour (as `e2e-1013` A after
     the 1.0.14 slider), and record it in the test report.
5. **Emulator** (foldable AVD `wlfold`, airplane mode):
   - Make an emulator-only debug build with WebView debugging switched on in a scratch copy, then switched off again.
   - Run `node tools/e2e-1014-emulator.mjs <out>` three times in a row (needs a rootable `google_apis` image for the
     backup, device-transfer and other-app checks; `adb root` first).
   - Run `node tools/e2e-1014-upgrade-emulator.mjs <out> <previous debug apk> <new debug apk>`: an in-place update
     carrying a scan, a photo and an unsynced state.
   - Then install the previous release and the new one, both signed with the throwaway key, as an update, and check the
     first-install time is unchanged.
6. **Release build checks:**
   - `aapt2 dump badging`: package, version code and name, permissions unchanged.
   - Compare every file against the previous release APK: only intended files differ; the manifest differs only by version.
   - `webContentsDebuggingEnabled` is false.
   - Write the checksums.
   - Rehearse the signing script with the emulator key and delete its outputs.
7. **Phone** (owner): back up first, sign, install over the previous version, then work through `checklist-fold7.md`.
   Pay most attention to its "phone only" rows.

The suites that cover each risk area:

| Risk | Covered by |
|---|---|
| Loss of photos or clips | e2e-1014 P, emulator K F X M3, checklist 1 |
| Loss of typed scans | e2e-1014 F, emulator T1, upgrade U3, checklist 1.16 to 1.17 |
| Unredacted media outside the app | emulator M1 M2 L1, unit test storage-privacy, checklist 1.13 to 1.15 |
| Backup and device transfer | emulator Y1 Y2, unit test storage-privacy |
| Account isolation and sign-out | e2e-1014 I, emulator O1 |
| Scan data and sync | e2e-1010, e2e-offline, e2e-upgrade, unit tests |
| Sign-off, assessment, supervision | unit tests, e2e-1012 |
| Backup and restore | e2e-1014 B, unit tests (format), checklist 0.1 and 5.4 |
| Navigation and Back | e2e-1013 N, emulator K and G |
| Look and accessibility | theme-shots, e2e-1014 C L |
