# 1.0.14 (20): checks on the Galaxy Z Fold7

After installing the signed 1.0.14 over 1.0.13 (`signing-and-install.md`). Use synthetic or anonymised pictures only.
Rows marked **phone only** could not be proved in the browser or emulator runs.

## 0. Update

| # | Step | Expected | Result |
|---|---|---|---|
| 0.1 | Before installing: Me > Back up and restore > Back up now; note scan, photo and sign-off counts | Backup saved | |
| 0.2 | Install over 1.0.13 (do not uninstall) | Android offers Update; no sign-in afterwards | |
| 0.3 | Settings > About Wavelength | Version 1.0.14 (20) | |
| 0.4 | Logbook, photos, clips, sign-offs | Same counts as 0.1; photos and clips open | |

## 1. Photos and clips are never lost (critical)

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | New scan > Choose a photo > Annotate > Text; type, keyboard open; press Back (gesture) | Only the keyboard closes; the text box and the photo stay | phone only (IME) |
| 1.2 | Back again | The text box closes; the editor stays | |
| 1.3 | Add a label and a redaction; Back | "Leave this photo?" with Keep editing, Keep for later, Discard photo | |
| 1.4 | Keep editing | Everything is still there | |
| 1.5 | Back > Keep for later | Editor closes; an Unfinished tile is in the scan; tap it | Reopens with the label and redaction | |
| 1.6 | Record a clip in Wavelength (Clip > Record); without changes press Back | Asks, and says the clip is not saved anywhere else | phone only (camera) |
| 1.7 | With the editor open, switch to another app for a minute; come back | Editor as it was | phone only |
| 1.8 | With the editor open, swipe Wavelength away from Recents; reopen | Home: "Kept on this phone"; Review > Add to this scan; the photo with its edits | phone only (kill) |
| 1.9 | Add a prepared photo to a new scan, close Wavelength from Recents before saving; reopen | Kept on this phone; Add to this scan restores it, nothing added by itself | phone only |
| 1.10 | Re-edit a saved photo, rotate it, Back | Keep editing or Discard changes; Discard leaves the saved photo unchanged | |
| 1.11 | Fold and unfold, and rotate, with the editor open and changes made | Editor stays open with all its work; the layout switches | phone only (hinge) |
| 1.12 | Save a scan with an Unfinished photo | Asks: Finish them first / Save without them | |
| 1.13 | New scan > Clip > Record a clip (Samsung Camera); record 3 s; accept | The clip opens in Wavelength's editor. Then open Gallery: **no new video**. If Wavelength says "Your camera app kept a copy", note it and delete the gallery copy | phone only (Samsung Camera) |
| 1.14 | New scan > Take photo; accept | The photo opens in the editor. My Files > Internal storage > Android > data > uk.co.thewavelength.app (if visible) has no new JPEG_ file; Gallery has no new photo | phone only |
| 1.15 | First start of 1.0.14 | If photos from earlier versions are found: "Photos left by earlier versions" with Delete the leftover copies / Review them first / Not now. Choose **Review them first** if unsure; they then show on Home as kept photos | phone only (your leftovers) |
| 1.16 | Type into a new scan (application, findings, reflection); swipe Wavelength away from Recents; reopen | Home: "1 unfinished scan"; Review brings back every answer; Save makes exactly one scan | phone only (Recents) |
| 1.17 | Edit a saved scan, type a change, swipe Wavelength away; reopen; open the scan's Edit | "Unfinished changes to this scan were kept": Continue the changes restores them | |
| 1.18 | Log out (Settings), log in again without closing the app; save a scan with Wi-Fi on | The scan shows as synced (not "awaiting sync") | |
| 1.19 | Before installing: Gallery > Videos (and the camera folder): any clips recorded through Wavelength before 1.0.14? | Delete any that could identify a patient; check Samsung Cloud / Google Photos did not upload them | **owner action** |

## 2. Annotation size

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Annotate, nothing selected | Slider in the middle, Smaller and Larger, no percentages, greyed until something is selected | |
| 2.2 | Add a label, drag to Larger | Large label, never wider than the picture | |
| 2.3 | Add an arrow | Slider back to the middle; the label keeps its size when selected again | |
| 2.4 | Drag slowly near the middle, then quickly to the ends | Fine control near the middle; strong change near the ends; snaps to the middle | phone only (feel) |
| 2.5 | Smaller end on a dot, a box and a pictogram | Genuinely small; Larger end genuinely large | |
| 2.6 | Undo, Redo after a drag | One step each | |

## 3. No resize dot, and colour

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | Select a label, a dot and a pictogram | No round handle over the picture; a box keeps its corner handle, an arrow its ends | |
| 3.2 | Tap the colour square | Spectrum, greys, Recent, Set as default colour, Done | |
| 3.3 | Pick a colour with a label selected | The label and the circle change at once | |
| 3.4 | Set as default colour; close and reopen Wavelength; add a dot | The dot starts in that colour | |
| 3.5 | Label > Background > colour square > Background box; pick a colour close to the text | Box colour changes; low-contrast warning | |
| 3.6 | Black or navy annotation on a dark scan | A light edge keeps it visible | phone only (real scans) |

## 4. Layout on the Fold7

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | Editor on the cover screen | Picture above, tools below, "Use this image" reachable | |
| 4.2 | Unfold | Picture on the left (about 62%), tools on the right, readable, nothing overlapping | phone only |
| 4.3 | Unfolded, rotate | Same layout, picture first | phone only |
| 4.4 | Pinch to zoom in both layouts | Zoom works; annotation sizes unchanged | |

## 5. Guides, About, backup, sign-up

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | Progress > Guides and accreditation (with RCEM as pathway) | The catalogue, not the RCEM guide | |
| 5.2 | Progress > My accreditation pathway | The RCEM sign-off guide | |
| 5.3 | Settings > About > Back, ten times, folded and unfolded; screen-record it | No second logo, no flash | phone only (recording) |
| 5.4 | Back up; after the file is created | The acknowledgement is unticked; passphrase fields empty | |
| 5.5 | Log out; turn on Flight mode; open Wavelength; wait for "taking longer"; Log in; type; turn Flight mode off | Typed text stays | phone only |

## Rollback

Keep `wavelength-1.0.13-19-release.apk`. Going back needs an uninstall, which deletes photos and clips kept only on the
phone: make a backup first (0.1). A problem would be fixed in 1.0.15 (21).
