# 1.0.13 (19): test report

Run on 10 October 2026 on this PC (Windows 11, Node 24.19, Chromium 141 through Playwright 1.56, Android emulator
36 with Android System WebView 133). Synthetic accounts and pictures only. Nothing contacted production: the browser
runs used a local Worker (`tools/dev-worker.mjs`), the emulator ran in airplane mode.

Release candidate: branch `wavelength-1.0.13`, commit `2c2e336` for the app (later commits on the branch change
tools and documents only), built from a checkout with LF line endings so every unchanged file in the APK is
byte-identical to the installed 1.0.12.

## Results

| Suite | Result | Notes |
|---|---|---|
| Unit and Worker tests (`node --test test/*.test.mjs`, LF checkout) | **318 pass, 0 fail, 1 skipped** of 319 | 315 at 1.0.12 plus 4 new editor tests. The skip is the Python backup reader, which needs the `cryptography` package (not installed here). |
| Same, merged into `wavelength-android-fixes-20261010` (commercial work included) | 360 pass, 2 fail, 1 skipped of 363 | The 2 failures are regex checks that read `src/app/app.js` with Windows line endings; they fail identically on untouched 1.0.12 in this checkout and pass in an LF checkout. |
| `tools/e2e-1013.mjs` (new: slider, zoom, back navigation) | **42 / 42 pass**, on the exact assets inside the 1.0.13 APK | Against the installed 1.0.12 (18) bundle: navigation 3 / 16 (only the "starts at the top" checks pass), editor checks stop at once (no slider, no zoom controls) |
| `tools/e2e-1013-emulator.mjs` (new: real Android WebView, real input) | **11 / 11 pass** | Back button (KEYCODE_BACK), back gesture (edge swipe, gesture navigation), back arrow, repeated trips, logbook with search and filters, slider by finger, pinch, zoomed tap placement, back closes the editor |
| Android update on the emulator (1.0.12 → 1.0.13, same test key) | Pass | `adb install -r`: version 18 → 19, first install time kept (an in-place update), app starts, no crash |
| `tools/e2e-1012.mjs` (1.0.12 regression: S D H M E C G B) | **74 / 74 pass** | W (website) not run: needs a second local site server |
| `tools/e2e-1011.mjs` (1.0.11 regression) | **42 pass, 0 fail**, then stops at E6 by design | As documented for 1.0.12 (E6 drives the old "Cover" mode). F0: all 745 scan-form controls identical to the installed 1.0.12 |
| `tools/e2e-1010.mjs` | **44 / 44 pass** | L1 (600-scan draw under 4× CPU, 3 s limit) failed twice in long runs at 3.19 and 3.27 s; alternating the same measurement 6 times on both builds gave medians of 1.50 s (1.0.12) and 1.53 s (1.0.13): machine load, not a regression |
| `tools/e2e-native.mjs` (store app shell) | **30 / 30 pass** | After fixing the check's own start-up race (see below); passes on 1.0.12 too |
| `tools/e2e-upgrade.mjs` (1.0.12 (18) bundle → 1.0.13 (19), same storage) | **12 / 12 pass** | Signed in with the same token, entries, photos, sign-offs, assessments, theme, app lock kept, the offline scan syncs once, Settings shows 1.0.13 (19) |
| `tools/e2e-offline.mjs` | **16 / 16 pass** | |
| `tools/e2e-about.mjs` | Pass | |

## What the new checks prove

Annotation size (A1 to A13): the S, M and L buttons are gone; the labelled slider (40% to 250%) moves under a finger;
new text, dots, arrows and pictograms take its size; selecting one shows its size and what changes; moving the
slider resizes an existing arrow's line in the picture's own pixels; one drag is one Undo, Redo restores it; the
corner handle and slider agree; tapping the percentage resets to 100%; the saved photo keeps each size and equals
the preview (mean difference 1.7 of 255); French and Arabic are translated and fit.

Zoom (Z1 to Z11): buttons 1× to 5×; a two-finger pinch zooms and the first finger leaves no dot; two fingers pan; a
one-finger tap, an arrow and a redaction made while zoomed land on the same picture pixels as at 1×; the wheel
zooms; the picture being edited is identical zoomed or not; rotate and flip return to 1×; the declaration is still
required; the saved photo has the dot exactly where it was tapped (0.47, 0.53) at its usual size; the clip editor
has the same controls.

Going back (N0 to N13, E1 to E6): the list comes back where it was left, on every animation frame (never the top
first), by the back arrow, the Android back button, the back gesture and the browser's back, five times in a row;
inside a guide the place and the open Contents come back; the logbook (300 scans) keeps its search, application and
sign-off filters; a fresh visit (a tab, a link) starts at the top; back to the restored position takes 57 ms (380
ms with the CPU slowed 4×).

## Found and fixed during testing

- **The connection banner moved the restored list.** On the emulator the "You're offline" banner appears a moment
  after a screen is drawn, so it was sometimes there when the list was left and not on return; restoring the raw
  scroll position then moved the list by about 60 px. 1.0.13 now restores the element that was at the top of the
  screen to the same height (the raw position is only the fallback while content loads). N13 reproduces it: fails on
  the earlier candidate (61 px), passes now; the emulator shows it holding with the banner present on one side only.
- **The zoom stayed on after a flip** (a flip keeps the picture's size). Every Adjust action now returns to 1×.
- **The annotate panel was 42 to 83 px taller**, pushing "Use this image" off a 390 × 844 screen. The size heading now
  sits beside the colours; Save is where it was in 1.0.12 on 390 × 844 and 412 × 915.

## Found, not changed (outside this release)

- **Sign-up typing can be cleared on a slow start.** While the app's first server check is still running, the start
  screen can be left for Create account; when the check answers, the screen is drawn again and typed text is lost.
  The same in 1.0.12. Only on a slow connection, before the first screen has settled. Suggested for 1.0.14: when the
  answer arrives, leave an auth screen the learner has already moved to alone.
- `tools/e2e-native.mjs` waited for `#app .auth`, which also matches the start screen, so it raced that check;
  fixed in the tool.

## Needs a real phone (not provable here)

The feel and speed of pinching and panning on the Fold7's 120 Hz screen and digitizer (adb cannot send two fingers,
so pinches were sent as touch events through DevTools); the back gesture with Samsung's One UI gesture settings; the
inner (unfolded) screen and folding or unfolding while the editor is open; clip preparation with the phone's
hardware video encoder; signing with your key and Android's own update prompt on your phone. All are in
`checklist-android.md`.
