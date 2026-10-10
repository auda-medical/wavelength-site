# 1.0.14 (20): readiness, security and an honest score

## Readiness

**Ready for the owner's phone and internal testing** once signed. **Not yet for public release** (Play production or
open testing) until two things are done. First, the "phone only" rows of `checklist-fold7.md` must pass on the Fold7.
Second, the owner must review the privacy points below. No server change is needed.

## Security and privacy findings

1. **Safety copies hold unredacted originals on the phone.** The drafts store (`wavelength-<account>-drafts`) keeps the
   original file of a new photo or clip until it is used, discarded or the scan is saved. It is never synced, uploaded,
   shared or put in a backup. Google backup is off (`allowBackup` false). Account deletion removes it, and Discard
   removes it. This is the same exposure as the image store the app already has, but it lasts longer for an
   abandoned edit. The privacy notice's "images never leave the device" stays true. **Owner review:** add a sentence
   to the privacy notice and the DPIA record ("unfinished photos and clips are kept on the device until used or
   discarded"). Possibly also add an expiry, for example 30 days, for items kept and never finished.
2. **Log out does not remove safety copies**, which matches how the image store has always behaved. A shared phone
   with two accounts keeps each account's separately.
3. **A crafted backup could store a non-colour.** Fixed: colour names are checked as own properties (`hexOf`), and
   anything else is ignored.
4. **No new permissions, routes, libraries, cookies or analytics.** CSP and the native layer are unchanged.
   `webContentsDebuggingEnabled` is false in the release.
5. **Signing:** the original keystore was not opened. The script uses hidden prompts and process-only environment
   variables, removes them at the end, and refuses to overwrite files.

## Score (out of 10, honest)

| Area | Score | Why not 10 |
|---|---|---|
| Media safety (item 1) | 9 | Proved in the browser, on the real WebView, through fold/unfold and through Android ending the app. Not yet proved on a Samsung keyboard, with a camera-recorded clip, or with a Recents swipe. Typed scan fields are still lost if the app is killed before saving. |
| Annotation size (2) | 9 | The model is tested; the feel of the curve needs a thumb on the phone. |
| Resize dot (3) | 10 | |
| Colour (4) | 8.5 | Complete and tested. The spectrum square is small on the cover screen, and the contrast edge is a judgement call that needs real scans. |
| Fold7 layout (5) | 8.5 | Folded and unfolded proved on an emulator, not on the hinge. Landscape on the cover screen keeps the phone layout. |
| Guides from Progress (6) | 10 | |
| About flash (7) | 9.5 | No bare logo in 51 sampled closing frames on a real WebView. A slowed screen recording on the phone is still to do. |
| Backup acknowledgement (8) | 10 | |
| Slow-start sign-up (9) | 9 | Tested with a delayed server, not with real Flight mode. |
| Whole app as a busy clinician (13) | 8.5 | Clear wording and no surprise losses. Still open: the scan form does not keep typed fields across a kill, translations are machine-drafted, and pictograms need clinical review. |

**Overall: 9 / 10 for this release's scope.** A true 10 needs the phone-only checks passing, a draft of the scan
form's typed fields kept on the phone like the media, and a native-speaker pass on the translations.

## Remaining defects and gaps (none blocking internal testing)

- The scan form's typed fields are not kept across Android ending the app (media are). This would be a 1.0.15
  candidate.
- 58 new strings in eight languages are machine-drafted.
- The emulator cannot prove the Samsung keyboard, One UI gestures, the camera or the hinge sensor.
