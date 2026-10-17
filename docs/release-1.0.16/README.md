# Wavelength 1.0.16 (22): leftover photos recovered one by one, the Scan heading, a wider annotation size range

Version name 1.0.16, version code 22, package `uk.co.thewavelength.app`. Branch `wavelength-1.0.16-20261012` (LF worktree
`C:\Users\phira\Wavelength-Cloud\wavelength-1.0.16`), from 1.0.15 (`dda2516`). Built 12 October 2026 by Claude Code.
Nothing has been signed, installed, uploaded, pushed or deployed. **It replaces 1.0.15 for Google Play**: the signed
1.0.15 APK, AAB and checksums (`C:\WavelengthSigning\signed\`) are untouched (checked by SHA-256 before and after).

## 1. Why (the owner's Fold7, 12 October 2026, ChatGPT 10:48 and 10:51)

1.0.15 found 17 photos left by earlier versions. "Review them first" put all 17 on one Home card; Review opened a new
scan with one "Add to this scan" for all of them; every one became an unfinished item of that one scan, although they
may belong to different patients; "Added to this scan" was said although none was part of the scan, which could be
saved with no images. Cause: `legacySheet()` imported them all with `formKey: 'new'`, and `drawEarlier(list)` acted
on the whole list. Treated as a release blocker (clinical-image handling).

## 2. What changed

| Area | 1.0.16 |
|---|---|
| Recovery tray | Home: "Review photos and clips" (`#/kept`); in a scan form: "Choose from them". Each kept photo or clip on its own row: a preview, when it was taken or kept, its size and where it came from ("Left by an earlier version", "Kept when Wavelength closed", "Kept for later", "Prepared, not saved in a scan"). Opens full screen to check (Back closes it). **Nothing selected to start with.** "Add selected to this scan (n)" / "Start a scan with the selected (n)" with the count shown; the rest stay. States that they may come from different patients and scans |
| Belonging | Each kept record belongs to one scan form (`media.inst`) or to none (the tray). A form shows only its own. No record is added to a scan by itself; leftovers are imported straight into the tray |
| Accurate wording | A chosen photo is "chosen for this scan, not part of it yet: finish each one to add it"; it is part of the scan only once finished in the editor. One prepared in an earlier run goes in as an image (said so) |
| Save | With unfinished items: "Not finished: n photos ... they will not be saved in this scan", with Finish them now, Save and keep them for later (back to the tray), Go back. A saved scan drops exactly the prepared copies it saved (by id, any run): none is offered again as a duplicate |
| Discard | "Discard selected (n)" asks ("not saved anywhere else", "cannot be undone"); "Delete all" is separate, enabled only by its own tick. An Unfinished tile's x: Put it back with the kept ones, or Discard it |
| Discard changes | Photos chosen from the tray go back to it as they were (prepared ones too); never deleted |
| Import safety | A leftover file is removed from the shared folder only when the app's copy is the whole file (size check) |
| No migration | 1.0.14 and 1.0.15 records are not changed: without an owner form they are in the tray. Photos 1.0.15 imported are recognised by their `JPEG_` names |
| Scan form | Section **Scan**, question **Which scan did you do?**; "Choose which scan you did.", "Scan not chosen", "Choose the next scan." Field names, stored values and exports unchanged (the CSV and PDF still say Application) |
| Annotation size | Ends about twice as far apart: text 1.2% to 42% of the picture's shorter side (was 1.6% to 30%), dots 1% to 40% (1.4% to 26%), lines 1% to 46% (1.6% to 32%), pictograms 4.5% to 96% (7% to 92%). The usual size is still the exact middle and the curve keeps fine steps around it (under 1% per step); stored sizes unchanged |
| Translations | 44 strings in 8 languages, machine-drafted for native review like the rest |

No new permission, plugin or native code. No change to what is synced, shared or backed up: kept photos stay on the
phone only and are not in `.wlbackup` files (proved, R26).

## 3. Tests (12 October 2026, Windows, LF worktree, final commit)

| Check | Result |
|---|---|
| Unit and Worker (`node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`) | **418: 417 pass, 1 skipped**, 0 fail (adds `test/app-1016.test.mjs`, 8; editor size tests updated) |
| `tools/e2e-1016.mjs` (new) | **39/39**: R1 to R26 recovery (17 leftovers via the stand-in capture plugin; separate rows, previews, none selected; one-by-one assignment into separate scans, each photo saved once; unfinished never claimed; restart; Discard changes; too many; discard one and all; account separation by log out and in; no image sent to the server; encrypted backup holds the 4 saved photos and none of the kept); U1 to U7 the owner's phone (1.0.15 bundle reproduces the bulk add and the empty scan, then 1.0.16 over it: all 17 kept, same ids, none attached, the scan unchanged and repairable by Edit); W1, W2 wording; S Fold7 folded 412x915 and unfolded 884x1032 sizes; no script errors |
| `e2e-1014` on the 1.0.16 bundle | **69/69** (P10 to P12, P16, P19, P20 updated to the new behaviour) |
| `e2e-1014` on the 1.0.15 APK assets | stops at P11: the 1.0.15 bundle has no per-scan continuation (the fixed behaviour) |
| `e2e-1013` (Z, N) / `e2e-1012` / `e2e-1010` | 28/28 / 74/74 / 44/44 |
| `e2e-1011` (reference: the 1.0.15 APK assets) | 42 pass, stops at E6 by design; **F0: 21 applications, 745 controls, no differences**; F4 updated to Scan; N11 failed once under CPU load (known, as in 1.0.15) and passed on a quiet machine |
| `e2e-native` / `e2e-offline` / `e2e-about` / `e2e-upgrade` (1.0.15 assets → 1.0.16) / `e2e-backup` | 30/30 / 16/16 / 15/15 / 12/12 / 11/11 |
| `theme-shots` (site server) | both themes pass |
| Release C suites on this `dist/`: `e2e-app-guides`, `e2e-verified` `UI=android` | 22/22, 276/276 |
| Emulator `tools/e2e-1016-emulator.mjs` (new; foldable `wlfold`, Android 16, airplane mode, adb root; debug builds, WebView debugging in scratch copies only) | **7/7 in 3 of 3 runs**: the owner's sequence through the real Android file path in 1.0.15, in-place update to 1.0.16 (same first-install time), all 17 kept and labelled, separate scans each saved once, ended by Android and reopened, 4 new leftovers found by 1.0.16 itself, nothing in the gallery or shared storage |
| Emulator `e2e-1014-emulator.mjs` on 1.0.16 | **22/22 in 3 of 3 consecutive runs** (X2 updated: the photo is chosen again from the recovery tray and comes back with its label and dot; L1 leftovers deleted on request; Y1 cloud backup refused; Y2 device transfer copies nothing) |
| Throwaway-key update (1.0.15 then 1.0.16, both signed with the emulator test key) | installed as an update, first-install time unchanged (12 Oct 12:38:29); rehearsal outputs deleted afterwards |
| Package | `aapt2 dump badging`: `uk.co.thewavelength.app`, versionCode 22, versionName 1.0.16, compile and target SDK 36; permissions unchanged; `webContentsDebuggingEnabled` false. Against the 1.0.15 APK (1,000 entries each): 17 differ, all intended (manifest version only, the app's code, styles, editor, 8 translations, build stamps) |

## 4. Unsigned files

`C:\WavelengthSigning\unsigned\wavelength-1.0.16\` and `C:\Users\phira\Wavelength-Cloud\handover-1.0.16\android\`:

```
c724586f8d8931f1c6a4172c1ecd8ab60150fa3fd7c23481c10654ad1fbb6a4f  wavelength-1.0.16-22-unsigned.apk
40d9c13e8008c05cc0b038c5679fed2ad669070a0677a75f9a33694af2b127e3  wavelength-1.0.16-22-unsigned.aab
```

Built with `WL_APP_VERSION=1.0.16 WL_VERSION_CODE=22 node mobile/scripts/build-www.mjs`, `npx cap sync android`, then
`gradlew.bat --no-daemon bundleRelease assembleRelease` with `WL_VERSION_NAME=1.0.16 WL_VERSION_CODE=22`,
`ANDROID_HOME=C:\Android\sdk`, JDK 21.0.12, no keystore. A first candidate (`9559bade…` / `3a3a3f0f…`), built before
the label fix for photos 1.0.15 had imported, was never signed and is superseded.

## 5. Signing

`C:\WavelengthSigning\SIGN-1.0.16.cmd` runs `wl-sign-android.mjs 1.0.16` (Node.js, no PowerShell). It writes new files
only (`wavelength-1.0.16-22-release.apk/.aab`, `SHA256SUMS-1.0.16-signed.txt`) and refuses to overwrite anything.
Rehearsed with the throwaway emulator key on the final files: every check passed.

## 6. Owner session

HQ `03-WEBSITE-AND-APP\android-1.0.16-owner-pack\OWNER-SESSION-1.0.16.md`: sign, install over 1.0.15 (Update, never
uninstall: the 17 photos exist only in the app), recover them one scan at a time, the Fold7 rows, then Play internal
testing with the 1.0.16 AAB.
