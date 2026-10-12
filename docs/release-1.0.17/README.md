# Wavelength 1.0.17 (23): annotation Rotation beside Size

Version name 1.0.17, version code 23, package `uk.co.thewavelength.app`. Branch `wavelength-1.0.17-20261012` (LF worktree
`C:\Users\phira\Wavelength-Cloud\wavelength-1.0.17`), from 1.0.16 (`7c9f236`). Built 12 October 2026 by Claude Code.
Nothing has been signed, installed on a phone, uploaded, pushed or deployed. The signed 1.0.16 and 1.0.15 APKs, AABs
and checksum records (`C:\WavelengthSigning\signed\`) are untouched (SHA-256 checked before and after).

## 1. Why (ChatGPT 12 Oct 13:01, the owner's request)

Ultrasound anatomy is often oblique. 1.0.16 could turn text, labels, pictograms and boxes only with a **Turn** button in
fixed 15° steps, which was hard to find and too coarse. The owner asked for a visible **Rotation** slider beside
**Size**, watching the annotation turn on the picture or clip.

## 2. What changed

| Area | 1.0.17 |
|---|---|
| Controls | One group, "Annotation controls": **Size** (unchanged behaviour) and **Rotation** (new). Rotation: −180° to +180° in whole degrees, **Straight** in the middle with a gentle snap while dragging (±3°) and a light haptic tick, the value in words ("12° left", "Straight", "12° right"), Left and Right at the ends, 44 px high like Size. The annotation turns live while the slider moves |
| What turns | Text, clinical labels, pictograms and boxes. Arrows, dots and circles have no Rotation control (Size then has the whole width). With nothing selected the slider is shown, disabled, with "Select text, a label, a pictogram or a box" |
| Layout | Follows the space and the text size, not the device. Where the editor shows the picture beside the tools (unfolded Fold7, tablet, landscape: the editor's existing 700 px and 4:5 rule) the group sits **under the picture**, so the annotation can be watched; elsewhere it stays in the Annotate panel. **Side by side** only when the group is at least 30 times its rendered text size wide; **stacked** otherwise (Fold7 cover screen, narrow portrait, enlarged text). The text size is measured as shown, because Android's font size enlarges text without changing CSS `em` (found on the emulator at 1.3: a CSS container query still put them side by side). A hidden letter is observed, so a text size change re-measures. Outside Annotate the space under the picture is kept but empty, so the picture does not jump |
| Undo | One drag (or one key press) is one Undo step; Redo brings it back |
| Keyboard and screen readers | Arrow keys step 1°; the snap applies only to a finger or mouse drag, so keyboard and TalkBack steps are never pulled back to Straight. The same fix applies to Size (1.0.16 pulled a keyboard step near the middle back) |
| Turn button | Removed. Tips: "Size makes it smaller or larger; Rotation turns it." |
| Picking and the outline | A turned annotation is picked by its own turned shape (not its straight bounding box); the dashed outline turns with it; dragging works to the image edges. A turned box is resized about its centre in its own frame |
| Adjust | Mirroring or rotating the picture keeps a text, label or pictogram's apparent turn; a box's tilt mirrors with the picture (it is part of the anatomy outlined). Undo restores |
| Stored values | Unchanged format: `rot` in whole degrees, now −180 to 180; Straight stores nothing (as before). Older values (1.0.16's 0 to 345 from Turn) read as the same angle (345 shows as 15° left). Non-numbers and arrows, dots or circles carrying a turn are cleaned on save and on restore |
| Saved output | Photos and every frame of a clip are drawn by the same code as the preview (checked by pixels at the turned label and where a straight label would have been) |
| Translations | 8 strings in 8 languages (Annotation controls, Rotation, Straight, {n}° left, {n}° right, the selection hint and two tips), machine-drafted for native review like the rest |

No new permission, plugin or native code. Nothing new is synced, shared or backed up; backups already carry
annotations (with their turn).

## 3. Tests (12 October 2026, Windows, LF worktree)

The whole browser regression was run twice: on `bf59f60`, and again on the final code `02629b7` (the figures below).

| Check | Result |
|---|---|
| Unit and Worker (`node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`) | **425 pass, 0 fail** (adds `test/editor-rotation.test.mjs`: normalising, snapping, legacy 0 to 360 values, cleaning, hit testing on the turned shape, Adjust mapping, layout rule; `test/editor.test.mjs` label keys updated) |
| `tools/e2e-1017.mjs` (new; browser, the 1.0.17 bundle) | **24/24**: T text (mouse), label (touch), pictogram (keys), box (mouse) at left, Straight and right, live turning while dragging, Straight stores nothing; N arrows, dots and circles have no slider; U one drag one Undo, Redo; H hit testing on letters not empty corners, the outline turns, edges; L cover 412x915 stacked, unfolded 852x796, tablet 1280x800 and phone landscape 915x412 side by side under the picture, enlarged text stacks, Adjust keeps the space; A Adjust mirror and quarter turn, saved photo matches the preview; P save, restart and re-edit, encrypted backup, interruption; C clip editor and every sampled frame of the saved clip; Z no script errors |
| `e2e-1016` (the 17-photo recovery, browser) | **39/39** |
| `e2e-1014` on the 1.0.17 bundle | **69/69** after updating two Size checks to the intended behaviour (S1 counts only Size's end words now that Rotation is beside it; S6 snaps on a drag, not on a programmatic value) |
| `e2e-1014` on the 1.0.16 APK assets | 69/69 |
| `e2e-1013` (Z, N) / `e2e-1012` / `e2e-1010` | 28/28 / 74/74 / 44/44 |
| `e2e-1013` A | stops at A1, as for every release since 1.0.14: it tests the 1.0.13 slider that 1.0.14 replaced |
| `e2e-1011` (reference: the 1.0.16 APK assets) | 42 pass, stops at E6 by design; **F0: 21 applications, 745 controls, no differences**. In the first run N11 (a timing check) failed under CPU load with the emulator running and passed on rerun (known since 1.0.15); it passed in the final run |
| `e2e-native` / `e2e-offline` / `e2e-about` / `e2e-upgrade` (1.0.16 assets → 1.0.17) / `e2e-backup` | 30/30 / 16/16 / 15/15 / 12/12 / 11/11 |
| `theme-shots` (site server) | both themes pass |
| Release C suites on this `dist/`: `e2e-app-guides`, `e2e-verified` `UI=android` | 22/22, 276/276 |
| Emulator `tools/e2e-1017-emulator.mjs` (new; foldable `wlfold`, Android 16, airplane mode, adb root; debug builds, WebView debugging in scratch copies only) | **10/10**: 1.0.16 with labels turned by Turn (15°, 345°) and 2 leftover photos in the recovery tray; updated in place to 1.0.17 (same first-install time), tray intact; re-edit shows 15° right and 15° left; a **real finger drag** turns a label unfolded (controls side by side under the picture) and folded (stacked in the panel), one drag one Undo; unfolding again keeps the turn; Android ending the app restores the turned label; **Android font size 1.3 stacks the controls** (the fix above); the clip editor turns a label with a finger and the saved clip keeps it |
| Emulator `e2e-1014-emulator.mjs` on 1.0.17 | **22/22 in 3 of 3 consecutive runs** |
| Emulator `e2e-1016-emulator.mjs` (1.0.15 → 1.0.17, the owner's 17-photo sequence) | **7/7** (`WL_EXPECT=1.0.17`): all 17 kept through the update (same first-install time, same ones, none attached), separate scans each saved once, ended by Android and reopened, 4 new leftovers found, nothing in the gallery or shared storage. A first run failed only O2, whose check named the version "1.0.16"; the version is now a parameter |
| Throwaway-key update (release builds of 1.0.16 then 1.0.17, both signed with the emulator test key) | installed as an update, first-install time unchanged (12 Oct 14:53:54), version 23 / 1.0.17, opens; rehearsal outputs deleted afterwards |
| Package | `aapt2 dump badging`: `uk.co.thewavelength.app`, versionCode 23, versionName 1.0.17, compile and target SDK 36; `webContentsDebuggingEnabled` false. Against the 1.0.16 APK web assets: only the app's code, styles, editor, 8 translations and build stamps differ |

**Emulator limitation found (not a 1.0.17 change):** on this emulator, MP4/H.264 clip recording is reported as
available but fails as it starts, so "Use this clip" says "Could not prepare the clip." The same happens with the
1.0.16 build. WebM recording works, so the emulator clip check tells the page MP4 is unavailable. Phones have hardware
H.264 encoders; the owner checks one clip on the Fold7 (owner pack). A fallback to WebM when MP4 recording fails is
suggested as separate follow-up work, not in this candidate.

## 4. Unsigned files

`C:\WavelengthSigning\unsigned\wavelength-1.0.17\` and `C:\Users\phira\Wavelength-Cloud\handover-1.0.17\android\`:

```
669fb37ee685a23a5f998f50bd65870e337fa516c4317d028d66fe7e456a9dfa  wavelength-1.0.17-23-unsigned.apk
20f1baa4dfd6434f86c2fa7861b1797a0b1e3703bdbb896c5fd6f66226c852bd  wavelength-1.0.17-23-unsigned.aab
```

Built from commit `02629b7` with `WL_APP_VERSION=1.0.17 WL_VERSION_CODE=23 node mobile/scripts/build-www.mjs`,
`npx cap sync android`, then `gradlew.bat --no-daemon bundleRelease assembleRelease` with `WL_VERSION_NAME=1.0.17
WL_VERSION_CODE=23`, `ANDROID_HOME=C:\Android\sdk`, JDK 21.0.12, no keystore. A first pair (`bb73b9db…` /
`a7dbe885…`), built before the font-size fix, was never signed; it is kept in `withdrawn-1358-before-font-size-fix\`
with a "do not sign" note.

## 5. Signing

`C:\WavelengthSigning\SIGN-1.0.17.cmd` runs `wl-sign-android.mjs 1.0.17` (Node.js, no PowerShell; entry added with the
hashes above). It writes new files only (`wavelength-1.0.17-23-release.apk/.aab`, `SHA256SUMS-1.0.17-signed.txt`) and
refuses to overwrite anything. Rehearsed with the throwaway emulator key on the final files: every check passed; a
wrong password stops before anything is signed. Rehearsal outputs deleted.

## 6. Owner

Not required for Sitting 2: 1.0.16 (signed) still recovers the 17 photos. 1.0.17 is an update on top, for the owner to
approve, sign and install when convenient (Update, never uninstall). Steps: HQ
`03-WEBSITE-AND-APP\android-1.0.17-owner-pack\OWNER-SESSION-1.0.17.md`.
