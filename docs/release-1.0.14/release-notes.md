# Wavelength 1.0.14 (20): release notes

Version name 1.0.14, version code 20, package `uk.co.thewavelength.app`, signed (by the owner) with the same
certificate as 1.0.8 to 1.0.13. Built from branch `wavelength-1.0.14` (1.0.13 plus four commits), from a checkout with
LF line endings. Quality release after real-device testing of 1.0.13 on a Galaxy Z Fold7: fixes only, no new
features beyond what the fixes need.

No Worker, database or Cloudflare change, and nothing depends on the undeployed commercial work: the app talks to
the live server exactly as 1.0.13 does. Nothing to deploy for it to work.

Causes, before and after for each fix: `fixes-and-causes.md`. Tests: `test-report.md`. Phone checks:
`checklist-fold7.md`. Signing and installing: `signing-and-install.md`.

## For learners (store "What's new", under 500 characters)

> Your work is safe: photos, clips and unfinished scans are kept on your phone if Wavelength closes, and offered back
> when you return. Photos and clips you take now stay inside Wavelength, never in your gallery. Back closes the
> keyboard first and asks before discarding anything. Annotation size runs from Smaller to Larger, with one colour
> control. The unfolded Fold shows the picture beside the tools.

## What changed

1. **Photos and clips are never lost.** Back closes the keyboard, then an open panel, then asks: Keep editing, Keep
   for later, Discard. A safety copy of every new photo or clip and its edits is kept on the phone (never synced or
   backed up) until it is used or discarded; after an interruption Home offers it back, and nothing is added to a
   scan by itself.
2. **Annotation size**: Smaller to Larger, the middle is the usual size, a curve with fine steps near the middle,
   a much wider range per type, every new annotation starts in the middle, a selected one shows its own size.
3. **No resize dot** over labels, text, dots and pictograms; boxes, circles and arrows keep their handles.
4. **Colour**: one spectrum square and a circle with the colour in use; three recent colours; Set as default colour
   (kept across restarts); a separate background colour for boxed text with a contrast warning; a contrasting edge
   so any colour shows on dark and bright scans.
5. **Fold7 unfolded and other wide screens**: the picture first, about 62%, tools beside it; the cover screen and
   phones keep the familiar layout.
6. **Progress**: "Guides and accreditation" always opens the catalogue; "My accreditation pathway" opens the
   pathway's own guide.
7. **About**: the second logo that flashed while the sheet closed is gone (every sheet had the fault).
8. **Backup**: the acknowledgement is unticked for every new backup.
9. **Sign-up on a slow start**: a late start-up answer never clears what you are typing; one request however many
   taps; plain wording when the connection fails (not "Failed to fetch").
10. **Unfinished scans are kept**: what is typed into a scan form survives Wavelength closing, is offered back, saves
    as one scan only, and is never applied over a newer saved version.
11. **Camera photos and clips stay in Wavelength's private storage**, never the gallery or shared storage. Clips
    recorded through Wavelength before 1.0.14 were saved by the camera app in the phone's gallery: check the gallery.
    Photos left by earlier versions in Wavelength's shared folder are offered for review or deletion at the first start.
12. **Sync after logging out and in again** without restarting works again (a fault in the first 1.0.14 candidate).

Data protection: `data-protection-review.md` (storage map, backup and device-transfer proof, privacy notice and DPIA
amendment for the owner).

## Known limitations

- The privacy notice and logbook terms describing the safety copies are updated on the branch but not yet on the
  live website; deploy them with the release.
- Translations of the new wording (96 strings) are machine-drafted, like the rest of the app's translations.
- Pictograms still need clinical review (unchanged from 1.0.12).
