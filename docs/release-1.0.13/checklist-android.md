# 1.0.13 (19): checks on your Android phone

For the product owner, on the Galaxy Z Fold7 (or any Android phone), after installing the signed 1.0.13 over 1.0.12
(see `signing-and-install.md`). Use a test scan and a synthetic or already anonymised picture, never a real patient
image. Mark each row Pass or Fail. Anything that the browser and emulator runs could not prove is marked **phone
only**.

## 0. Update

| # | Step | Expected | Result |
|---|---|---|---|
| 0.1 | Before installing: note how many scans, photos and sign-offs you have; make a backup (Me > Back up and restore) | Backup file saved | |
| 0.2 | Install 1.0.13 over 1.0.12. Do not uninstall | Android says "Update" or "App installed"; no sign-in asked | |
| 0.3 | Open Wavelength. If app lock is on, unlock with fingerprint or screen lock | Opens to Home | |
| 0.4 | Settings > About Wavelength | Version 1.0.13 (19) | |
| 0.5 | Logbook, photos and sign-offs | Same counts as in 0.1; photos open | |

## 1. Annotation size (Log a scan > add a photo > Prepare image > Annotate)

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Look under the colours | "Annotation size", "For new annotations", a slider with a small A and a large A, and "100%". No S, M or L | |
| 1.2 | Drag the slider with your thumb to about 180%, then add text "Ao" | Text appears large; selecting it shows 180% and "Selected label: text size" | |
| 1.3 | With "Ao" selected, drag the slider down to about 60% | The text shrinks smoothly while you drag | |
| 1.4 | Tap Undo once | "Ao" goes back to 180% (one Undo for the whole drag) | |
| 1.5 | Tap Redo | Back to 60% | |
| 1.6 | Draw an arrow; select it; move the slider | The line gets thicker or thinner; "Selected arrow: line thickness" | |
| 1.7 | Same for a dot, a circle, a box and a pictogram | Each resizes; the wording names what changes | |
| 1.8 | Drag a label's round corner handle | The slider and the percentage follow | |
| 1.9 | Tap the percentage | Returns to 100% | |
| 1.10 | Tap Done (nothing selected) | "For new annotations" again; the next annotation uses the slider's size | |
| 1.11 | Rotate the phone to landscape, and unfold the Fold7 (inner screen) | The size controls stay on screen, nothing overlaps or is cut off | phone only |

## 2. Zoom (same editor, any mode)

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Pinch outwards on the picture with two fingers | Picture enlarges smoothly up to 5×; the zoom button shows e.g. "2.5×"; the tip says zoom changes only your view | phone only (feel) |
| 2.2 | With the Dot tool chosen, pinch | No stray dot is left where the first finger landed | |
| 2.3 | Move two fingers together across the picture | The picture moves; the zoom stays the same | phone only (feel) |
| 2.4 | While zoomed, tap a dot on a small feature, then pinch back out (or tap the zoom value) | The dot is on the same feature at 1× and is its normal size | |
| 2.5 | While zoomed, Redact an identifier near the picture's edge | The black box covers exactly that area at 1× | |
| 2.6 | Use + and − | Steps of 1.5×; − is unavailable at 1× | |
| 2.7 | While zoomed, tap Rotate, Flip H or Trim top | The whole picture is shown again (1×) | |
| 2.8 | Tick the declaration, Use this image, save the scan, open the scan | The saved photo shows annotations and redaction exactly where they were placed, sizes as chosen | |
| 2.9 | Open the photo again (edit) | Annotations come back, still editable, sizes as saved | |
| 2.10 | Clip: add a short clip, pinch to zoom, add a label | Same zoom and size controls; the prepared clip has the label in place | phone only (video encoder) |
| 2.11 | Pinch speed and smoothness on the Fold7 at 120 Hz | No stutter; pinch tracks the fingers | phone only |

## 3. Guides and accreditation

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | Progress > Guides and accreditation. Scroll to the bottom; open "How supervisor verification works" | Guide opens at its top | |
| 3.2 | Back arrow (top left) | List returns at the bottom, where you left it; no flash of the top | |
| 3.3 | Scroll to the middle; open a guide; use the **Android back gesture** (swipe from the screen edge) | List returns at the middle | phone only (gesture) |
| 3.4 | Same with the **back button** (3-button navigation, if enabled) | Same | phone only |
| 3.5 | Repeat 3.1 to 3.3 five times quickly | Position holds each time | |
| 3.6 | Open the RCEM guide; open Contents; scroll halfway; tap "At a glance"; go back | Same place in the guide, Contents still open | |
| 3.7 | Leave Guides by the Progress tab, then come back to Guides from Progress | Starts at the top (a fresh visit) | |

## 4. Logbook

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | Logbook: type a search, choose an application filter and a sign-off filter; scroll down; open a scan | Scan opens | |
| 4.2 | Back gesture, back button, then the back arrow (one each, reopening a scan in between) | Each time: same search, same filters, same scan in view | |
| 4.3 | Logbook tab from a scan | A fresh logbook at the top, no search or filters | |

## 5. Not changed (spot checks)

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | Save a scan offline, then go online | Saved on this device, then synced | |
| 5.2 | Request a sign-off by link with a photo | Works as in 1.0.12 | |
| 5.3 | App lock after 90 s away | Asks to unlock | |
| 5.4 | Dark and light theme in Settings | Both look right, including the editor | |

## Rollback

Keep `wavelength-1.0.12-18-release.apk`. Android cannot install a lower version code over a higher one, so going back
to 1.0.12 needs an uninstall, which deletes photos and clips kept only on the phone. Make a backup (0.1) before
installing 1.0.13. If something is wrong, report it and a 1.0.14 with the fix is the safe route.
