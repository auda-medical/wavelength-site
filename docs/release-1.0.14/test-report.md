# Wavelength 1.0.14 (20): test report

All runs on 10 October 2026 against the final build (the assets inside the unsigned 1.0.14 APK, SHA-256
`526fcfc6…0763`), synthetic accounts and pictures only, local Worker (`tools/dev-worker.mjs`), nothing against
production.

## Summary

| Suite | Result | Notes |
|---|---|---|
| Unit and Worker tests (`node --test test/*.test.mjs`) | **319 pass, 0 fail, 1 skipped** of 320 | Skip: the Python backup reader (needs the `cryptography` package), as before. Under `npm test` on Windows the quoted glob matches nothing; run the command directly. |
| `tools/e2e-1014.mjs` (new; P S H C L G A B R) | **54 / 54 pass** | P 21, S 8, H 2, C 7, L 5, G 5, A 1, B 2, R 3 |
| Same checks against the 1.0.13 (19) APK's assets ("before") | P stops at P1 (Back closed the editor: the text panel no longer exists); S 1/8, H 1/2, C stops, L 2/5, G 0/1, A 0/1, B 1/2, R 0/3 | Every reported defect reproduces on 1.0.13 and is fixed in 1.0.14 |
| `tools/e2e-1014-emulator.mjs` (new; real Android WebView on a foldable emulator, real input) | **14 / 14 pass, three runs in a row** | See below |
| Emulator update, 1.0.13 (19) → 1.0.14 (20), same (test) key | **pass** | Android treated it as an update: first-install time unchanged, version code 20, app opened, no crash |
| `tools/e2e-1013.mjs` Z (magnification) and N (going back) | **28 / 28 pass** | Section A tested the 1.0.13 slider (40% to 250%, size inherited by new annotations), which 1.0.14 replaces as asked; e2e-1014 S covers the new one |
| `tools/e2e-1012.mjs` S D H M E C G B | **74 / 74 pass** | Colour steps now go through the new picker (`tools/editor-colour.mjs`); G1 expects "My accreditation pathway" for the pathway guide |
| `tools/e2e-1011.mjs` | **42 pass, 0 fail**, then stops at E6 by design | As since 1.0.12 (E6 drives the old Cover mode). F0: all 745 scan-form controls identical to 1.0.13 |
| `tools/e2e-1010.mjs` | **44 / 44 pass** | |
| `tools/e2e-native.mjs` (store app shell) | **30 / 30 pass** | |
| `tools/e2e-upgrade.mjs` (1.0.13 bundle → 1.0.14, same storage) | **12 / 12 pass** | Token, entries, photos, sign-offs, assessments, theme, app lock kept |
| `tools/e2e-offline.mjs` | **16 / 16 pass** | |
| `tools/e2e-about.mjs` | **15 / 15 pass** | |
| `tools/theme-shots.mjs` (light and dark, WCAG AA text contrast, overflow) | **pass** | Run against the site server (`tools/dev-worker.mjs 8792 --site`); the API-only server has no /app/ page |

## Emulator (Pixel 9 Pro Fold profile, Android 16, airplane mode)

An emulator-only debug build (WebView debugging switched on in a scratch copy and switched off again; never
distributed) on the `wlfold` emulator. Input through adb: the real soft keyboard, KEYCODE_BACK, an edge-swipe back
gesture, `adb emu fold`/`unfold`, and `am kill` after leaving the app (what Android does to a background app short of
memory).

| # | Check | Result |
|---|---|---|
| K1 | Keyboard open in the text panel, Back: only the keyboard closes (viewport 508 → 796 px); panel, text and editor stay | pass |
| K2 | Next Back closes the panel at once; the editor stays | pass |
| K3 | With a label and a dot, Back asks first; nothing lost | pass |
| K4 | Back on the question means Keep editing | pass |
| K5 | The back gesture asks the same question | pass |
| F1 | Fold with the editor open: still open, work intact, cover-screen layout | pass |
| F2 | Unfold: still open, work intact, picture beside the tools (528 of 852 px, 62%) | pass |
| X1 | Android ends Wavelength with the editor open: Home says "Kept on this phone, 1 photo" | pass |
| X2 | Add to this scan, Unfinished tile: the photo returns with its label and dot | pass |
| A1 | About, real Back, four times unfolded and four folded: 24 and 27 closing frames sampled, none with a bare logo | pass |
| G1–G3 | Progress > Guides and accreditation is the catalogue; Back returns to Progress; My accreditation pathway is the RCEM guide | pass |

The keyboard fix was found on the emulator. In the browser stand-in, Back with a focused field always meant "close the
keyboard". On a real WebView Android closes the keyboard itself on the first Back and the field stays focused, so the
second Back only blurred the field and seemed to do nothing. Now Back closes a keyboard only when the viewport shows it
is really up.

## Not proved without the phone

Listed in `checklist-fold7.md` as "phone only":
- the Samsung keyboard and One UI gestures;
- the hinge and real rotation;
- camera capture of a clip;
- Recents swipe-away;
- a screen recording of About;
- the slider's feel;
- real scans on dark backgrounds;
- Flight mode during sign-up.

## Release checks

- `aapt2 dump badging`: `uk.co.thewavelength.app`, versionCode 20, versionName 1.0.14, target SDK 36. Permissions are
  identical to 1.0.13 (internet, network state, vibrate, biometric/fingerprint, the dynamic-receiver permission).
  No camera or storage permission.
- Against the 1.0.13 release APK, file by file:
  - Changed as intended: `app.js`, `app.css`, `editor.js`, the eight translations.
  - Changed only by the build or version stamp: `config.js`, `guides.js`, `native-config.js` (version 1.0.14, code 20),
    the two `index.html`.
  - Changed only by the version: the manifest (`aapt2 dump xmltree`).
  - Everything else is byte-identical.
- `capacitor.config.json` in the release: `webContentsDebuggingEnabled` false.
- The unsigned APK does not verify (no signature), as intended. The signing script was rehearsed with the emulator
  test key: every check passed (package, version, content unchanged by signing, v2/v3 signature, AAB jar signature).
  The rehearsal files were deleted.
