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

> Your photos and clips are safe while you edit: Back closes the keyboard first, and leaving with unsaved changes
> asks before anything is discarded. Unfinished work is kept on your phone, even if Wavelength closes. Annotation
> size now runs from Smaller to Larger, starting in the middle for each new mark. One colour control with recent
> colours and a default. The unfolded Fold shows the picture beside the tools. Smoother About, backup and sign-up.

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

## Known limitations

- The scan form's typed fields are not kept if Wavelength is closed before the scan is saved (as in 1.0.13). Photos
  and clips are.
- Translations of the new wording (58 strings) are machine-drafted, like the rest of the app's translations.
- Pictograms still need clinical review (unchanged from 1.0.12).
