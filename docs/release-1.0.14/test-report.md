# Wavelength 1.0.14 (20): test report

Final build after the data-protection review, 10 October 2026: unsigned APK SHA-256 `bcdcbc2a…698e`, AAB
`4d9e9d31…58bc`. The browser checks ran on the exact assets inside that APK (46 app files compared, identical). The
emulator checks ran on an emulator-only debug build whose app code is identical to the release (34 app files
compared). All runs used synthetic accounts, synthetic pictures, and the emulator's synthetic camera scene. Nothing
touched production: there was a local Worker, and the emulator was in airplane mode.

## Summary

| Suite | Result | Notes |
|---|---|---|
| Unit and Worker tests (`node --test test/*.test.mjs`) | **325 pass, 0 fail, 1 skipped** of 326 | New: `test/storage-privacy.test.mjs` (6). Skip: the Python backup reader, as before. Run directly: under `npm test` on Windows the glob matches nothing |
| Same, merged into `wavelength-android-fixes-20261010` (commercial work included) | **369 pass, 0 fail, 1 skipped** of 370 | Run on an LF export of the merge commit |
| `tools/e2e-1014.mjs` (P S H C L G A B R F I) | **69 / 69 pass** | New F (typed forms, 12) and I (account isolation, sync after log out and in, 3) |
| The same I2 check on the **first** 1.0.14 candidate | **fails** ("dirty": true) | The sign-out counter defect, fixed here |
| `tools/e2e-1014-emulator.mjs` (real Android WebView, foldable, real input) | **22 / 22 pass**, three runs | K F X A G as before; new T, M, L, Y, O |
| `tools/e2e-1014-upgrade-emulator.mjs` | **4 / 4 pass** | 1.0.13 debug build → 1.0.14 debug build in place: a scan, its photo (same SHA-256) and its unsynced state unchanged; still signed in; typed form kept after the update |
| Release-path update (1.0.13 → 1.0.14, both signed with the same throwaway key) | **pass** | Installed as an update (first-install time unchanged), version code 20, opens, no crash |
| `tools/e2e-1013.mjs` Z, N | **28 / 28** | Section A tests the 1.0.13 slider that 1.0.14 replaces |
| `tools/e2e-1012.mjs` S D H M E C G B | **74 / 74** | |
| `tools/e2e-1011.mjs` | **42 pass, 0 fail**, stops at E6 by design | F0: all 745 scan-form controls identical to 1.0.13 |
| `tools/e2e-1010.mjs` | **44 / 44** | |
| `tools/e2e-native.mjs` | **30 / 30** | |
| `tools/e2e-upgrade.mjs` (1.0.13 assets → 1.0.14) | **12 / 12** | |
| `tools/e2e-offline.mjs` | **16 / 16** | |
| `tools/e2e-about.mjs` | **15 / 15** | |
| `tools/theme-shots.mjs` | **pass** | Light and dark, WCAG AA text contrast, no overflow, no console errors |

## Emulator: data-protection checks (new)

| # | Check | Result |
|---|---|---|
| T1 | Typed into a new scan with the real keyboard; Android ends Wavelength (`am kill`); Home offers the unfinished scan and Review brings the text back | pass |
| M1 | Take photo: the camera writes into `files/wl-captures` (private); the file is gone once the editor has the photo; nothing in shared storage or the gallery | pass |
| M2 | Record a clip: written to `files/wl-captures`, not the gallery (`/sdcard/Movies` empty, no MediaStore row); removed once copied | pass |
| M3 | Android ends Wavelength while the camera is open: on return the photo is kept (Home), and the camera file is removed | pass |
| L1 | Photos left by earlier versions in `Android/data/.../Pictures`: offered with Delete, Review or Not now; Delete removes them | pass |
| Y1 | Cloud backup: "Backup is not allowed" | pass |
| Y2 | Device-to-device transfer copies nothing of Wavelength while kept photos are on the phone | pass |
| O1 | Another user id cannot list Wavelength's storage; `app_webview` and `wl-captures` are `drwx------` | pass |

These checks reproduced the defects first, on the earlier build:

- **Clip:** saved by the camera app at `/sdcard/Movies/VID_20261010_195115.mp4`.
- **Photo:** left at `Android/data/uk.co.thewavelength.app/files/Pictures/JPEG_….jpg`.
- **Backup A/B:** a control build without the extraction rules handed a 4.6 MB archive to device transfer, containing
  the blob files of three kept photos. Details are in `data-protection-review.md`.

## Not proved without the phone

These are the "phone only" rows of `checklist-fold7.md`:

- **Camera:** Samsung Camera and the private output file (1.13, 1.14).
- **Leftovers:** the owner's own leftover photos (1.15).
- **Recents:** swipe-away (1.8, 1.9, 1.16).
- **Hardware and feel:** the Samsung keyboard and One UI gestures; the hinge; the slider's feel; real scans on dark
  backgrounds.
- **Flight mode** during sign-up.
- **Samsung Smart Switch's own tool:** only Android's device-transfer path was tested.

## Release checks

- **Package and permissions:** `aapt2 dump badging` gives `uk.co.thewavelength.app`, versionCode 20, versionName
  1.0.14, target SDK 36. The permissions are identical to 1.0.13, with no camera or storage permission.
- **Against the 1.0.13 release**, entry by entry:
  - Changed as intended: `app.js`, `app.css`, `editor.js`, `native.js`, the eight translations, `classes2.dex` and
    its start-up profile (the new WLChromeClient and CapturePlugin), and `res/8K.xml` (FileProvider paths: added
    `files-path wl_captures`).
  - Changed only by build stamps: `config.js`, `guides.js`, `native-config.js`, the two `index.html`.
  - Changed only by the version: the manifest.
  - Nothing added or removed.
- **Debug flag:** `webContentsDebuggingEnabled` is false.
- **Signing script:** rehearsed on these files with the emulator test key; every check passed; the outputs were deleted.
