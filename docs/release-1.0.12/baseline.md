# Wavelength 1.0.12: development baseline (recorded 9 October 2026)

## Starting point

| Item | Value |
| --- | --- |
| Verified 1.0.11 source tree | `1e40d1b338796c030632d94959398d8d26a4ae5d` (checked: `git rev-parse HEAD^{tree}` on the seed commit) |
| Cloud seed commit | `445dc6625922e418c47af85a1b0b3858a0c86d89` ("seed", the only commit in this workspace, local branch `master`) |
| Working tree at start | clean (`git status --short` empty) |
| Development branch | `wl-1.0.12`, created from the seed commit |
| Git history | not rewritten; the Windows history and earlier release branches are not in this workspace and are untouched |
| GitHub, production, Cloudflare | not contacted. No fetch, pull, push, deploy, migration, signing or store upload |

## Versions at the baseline

| Component | Version |
| --- | --- |
| Android app | 1.0.11, version code 17 (from `WL_VERSION_NAME` / `WL_VERSION_CODE` at build time; Gradle defaults 1.0.0 / 1) |
| iOS app | `MARKETING_VERSION` 1.0, `CURRENT_PROJECT_VERSION` 1 in the project (the iOS workflow passes the version and run number) |
| Package | `uk.co.thewavelength.app` (Android and iOS) |
| Capacitor | 8.5.1 (core, android, ios, cli); app 8.1.2, browser 8.0.5, filesystem 8.1.4, haptics 8.0.2, preferences 8.0.1, share 8.0.3; `@capgo/capacitor-native-biometric` 8.7.0 |
| Android | minSdk 24, compile and target SDK 36, AGP 8.13.0, Gradle 8.14.3, JDK 21 |
| iOS | deployment target 15.0, iPhone only (`TARGETED_DEVICE_FAMILY = 1`), Swift Package Manager (CapApp-SPM) |
| Node | 22.22.0 in this workspace (tests need 22.5 or later) |
| Vendor scripts | jsPDF, jspdf-autotable, qrcode.js, noble-hashes (Argon2id) in `src/app/vendor/` |
| Languages | en (source), fr, es, de, it, pl, ar, ru, zh (machine-drafted, marked for review) |

Android permissions: INTERNET, ACCESS_NETWORK_STATE, plus the biometric and vibrate permissions merged from plugins.
No camera permission (photos and clips are handed to the camera app).

## Tests at the baseline

| Suite | Result on the seed commit |
| --- | --- |
| `npm test` | 286 of 286 pass (61 s) |
| Browser tools (`tools/e2e-*.mjs`) | run on a clean worktree of the seed commit against `tools/dev-worker.mjs`; results are recorded in `test-report.md` next to the 1.0.12 results |

## Architecture map

Shared code (website `/app/`, Android and iOS apps):

- `src/app/app.js`: the single-page app (hash routes), about 3,650 lines. Views: home, log, new/edit (scan form),
  entry, progress, targets, signoff, assess, supervisors (trainee side), supervise (supervisor dashboard), supervisor
  (apply, status, stop), professional, export, evidence, backup, me, settings.
- `src/app/progress.js`: the one progress engine (also imported by `worker/evidence.js`).
- `src/app/netstate.js`: connection and sync rules (also tested in Node).
- `src/app/forms.js`, `sign.js`: sign-off and assessment forms (shared with the public signing pages).
- `src/app/backup.js`, `zip.js`: encrypted backup (format `docs/backup-format.md`, permanent).
- `src/app/native.js`: the phone layer (inert on the website): token storage, biometrics, back button, resume,
  network plugin, in-app browser.
- `src/app/sw.js`: website service worker (app shell only, API calls never cached).
- `build.js`: writes `dist/app/config.js` from `data/logbook.json`, i18n bundles, and stamps the build id.

Platform-specific code:

- Android: `mobile/android/.../MainActivity.java` (registers the app's own `WLNetwork` plugin) and `NetworkPlugin.java`.
- iOS: `AppDelegate.swift` (excludes WebKit storage from iCloud backup), `SceneDelegate.swift`
  (`CAPBridgeViewController`), `Info.plist`, `PrivacyInfo.xcprivacy`. No iOS network plugin at the baseline.
- Website: the same bundle served at `/app/` with the service worker; `mobile/scripts/build-www.mjs` assembles the
  store bundle from `dist/app` with a Content Security Policy.

Backend (Cloudflare Worker, D1 `wavelength-volunteers`): `worker/app.js` routes `/api/app/*`; supervision in
`worker/supervise.js`, `supervisor-lifecycle.js`, `supervisor-apply.js`, `supervisors-admin.js`, `professional.js`.
Migrations 0001 to 0013 are applied to production (CLAUDE.md).

## Production compatibility assumptions

1. Production runs migrations 0001 to 0013. Any 1.0.12 Worker code must work without a new migration, or tolerate a
   new migration's absence, because migrations are applied separately with the owner's approval.
2. Installed apps (1.0.9 to 1.0.11) stay in use: `/api/app/*` must stay backwards compatible. No route or field the
   apps use may be removed or change meaning.
3. Live switches as recorded in CLAUDE.md: `SUPERVISOR_APPLY` "true", `SUPERVISOR_APPROVAL_REQUIRED` "false",
   `PROFESSIONAL_VERIFY` off, `SUPERVISOR_SEARCH` off, `IMAGE_SHARE` and `CLIP_SHARE` "true", `EMAIL_VERIFY` on.
4. The backup format (WLBACKUP 1, manifest version 3) must still be read, and backups made by 1.0.12 should still
   restore in 1.0.11 (restore ignores unknown fields and files).
5. The live website `/app/` serves whatever was last deployed from `main`. It does not have the 1.0.10 or 1.0.11
   changes until a deploy is approved.
