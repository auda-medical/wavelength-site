# Wavelength 1.0.14 (20): fixes, causes, before and after

Quality release after real-device testing of 1.0.13 (19) on a Galaxy Z Fold7. No new features beyond what the fixes
need. Built from `wavelength-1.0.13` on branch `wavelength-1.0.14`. No Worker, database or Cloudflare change: the app
works against the live server exactly as 1.0.13 does.

## 1. Photos and clips lost on Back (critical)

**Cause.** The Android back button (and gesture) inside the photo or clip editor called the editor's Cancel, which
closed it and threw everything away at once. Nothing of a new photo or clip was kept anywhere until "Use this
image/clip", so a clip recorded in Wavelength (which exists nowhere else on the phone) was gone. Prepared photos and
clips added to a scan were also only in memory until the scan was saved, so Wavelength closing (Android ending it in
the background, a crash, a restart) lost them too.

**Now.**
- Back with the keyboard open closes only the keyboard (everywhere in the app, not just the editor). The editor stays
  as it is.
- The next Back closes an open panel (text, labels, pictograms, colour).
- Then, with unsaved work, the editor asks: **Keep editing**, **Keep for later**, **Discard photo/clip**. Cancel asks
  the same. A photo or clip taken in Wavelength asks even without changes, and says it is not saved anywhere else.
  An unchanged photo from the gallery closes straight away (the original is still in the gallery).
- Re-editing a saved photo asks **Keep editing** or **Discard changes**; the saved photo is never touched by leaving.
- A **safety copy** is kept on this phone from the moment a new photo or clip opens: the original file once, and the
  edits (crop, turns, redactions, annotations, a clip's selection) as they change and at once when the app is left.
  Prepared photos and clips are kept until the scan is saved. Its own database (`wavelength-<account>-drafts`): never
  synced, shared or put in a backup; deleted with the account.
- **Keep for later** puts the photo in the scan as an Unfinished tile; tapping it reopens the editor where it was left.
  Saving a scan with an unfinished item asks first (Finish them first / Save without them; they stay kept).
- **After an interruption**, Home shows "Kept on this phone" and the scan form offers the items back with **Add to
  this scan** or **Discard** (which asks first). Nothing is added to a scan by itself, so a photo cannot end up on
  another patient's scan unnoticed.
- Folding, unfolding and rotating never restarted the app (the Android activity handles those changes itself); the
  editor keeps its work through them.

What is typed into a scan form is kept the same way (section 10).

## 2. Annotation size

**Before.** 40% to 250% of one usual size for every kind, percentages on screen, and new annotations inherited the
last setting.

**Now.** The slider's exact middle is the usual size, with **Smaller** and **Larger** at the ends and a mark at the
middle, no percentages. A curve: fine steps near the middle, strong towards the ends; a position close to the middle
snaps to it. Each kind has its own range: text 1.6% to 30% of the picture's shorter side (a large label is fitted to
the picture's width), dots, line thickness of arrows, circles and boxes 0.28x to 5.5x (the arrowhead follows), and
pictograms up to nearly the whole picture. The slider sizes the selected annotation and shows its own size; every new
annotation starts in the middle. One drag is one Undo step. Sizes from 1.0.12 and 1.0.13 read back where they belong.

## 3. The resize dot over the picture

Removed for labels, text, dots and pictograms (Annotation size does that job). Circles and boxes keep the one handle
that sets their extent; arrows keep their two ends. Tiny annotations still have a finger-sized area to pick them up.

## 4. Colour

The four fixed swatches are replaced by one spectrum square (opens a continuous spectrum and a white-grey-black strip)
and a circle showing the colour in use. A selected annotation changes at once (one Undo step per pick); otherwise
the colour is for the next one. The picker offers the three colours used last and **Set as default colour**, kept on
this phone across restarts. Text in a box has its own **background box** colour, with a warning when text and box
are too close to read. Every mark is edged in the opposite tone, so a dark colour shows on a dark scan and a light
one on a bright area. Colours are stored as `#rrggbb`; 1.0.12 and 1.0.13 names still work.

## 5. Editor layout on the Fold7

**Before.** One layout for every screen: picture above, tools below; on the unfolded Fold7 the picture got about half
the screen.

**Now.** Wide screens (at least 700 px and not much taller than wide: the Fold7 unfolded either way up, tablets, a
phone on its side) put the picture first: about 62% picture, 38% tools (at least 300 px), the tools scrolling in their
own column. The cover screen and phones in portrait keep the 1.0.13 layout, where "Use this image" stays in the same
place.

## 6. Guides and accreditation from Progress

**Cause.** The Progress card titled "Guides and accreditation" linked to the learner's own pathway guide, so it
changed with the primary pathway (an RCEM learner got the RCEM guide).

**Now.** Two named destinations: **Guides and accreditation** always opens the catalogue; **My accreditation
pathway** opens the pathway's own guide (sign-off and evidence requirements). A general logbook has no pathway link.
Scroll position, open sections and history are kept by the 1.0.13 back-navigation work.

## 7. About: the duplicate logo

**Cause.** When a sheet closes, a copy fades out over 170 ms. The copy's box was renamed (`sheet-was`, so nothing
mistakes it for an open sheet), but no styles applied to the new name: for those frames the sheet's content, the
About logo included, was drawn bare over the screen beneath. Every sheet did this since 1.0.11; About made it obvious.

**Now.** The closing copy keeps the sheet's background, shape and text styles. Checked frame by frame: no bare logo.

## 8. Backup acknowledgement

**Cause.** After a successful backup the screen was not redrawn, so the tick stayed.

**Now.** After each backup the tick is cleared with the passphrases and the screen shows the new backup date;
leaving and returning starts unticked. A backup in progress is untouched; encryption and restore are unchanged.

## 9. Sign-up on a slow start

**Cause.** The app's start-up check (`/api/app/me`) redrew the screen when it answered. If the learner had already
moved on to Create account or Log in (the recovery screen after 10 s offers Log in), what they had typed was lost.

**Now.** The answer only replaces the start or recovery screen. A screen the learner has moved to is left alone. One
sign-up request however many taps; the button shows "Creating your account…". A network failure reads "Could not
reach Wavelength. Check your connection and try again." (it read "Failed to fetch"), here and wherever a request fails.

## Found during testing and fixed

- `hexOf('constructor')` returned an inherited JavaScript function: a damaged or hand-made backup could have stored a
  non-colour. Colour names are now checked as own properties.
- A panel's field took focus 30 ms after opening, which could reopen the keyboard after Back had closed it.
- "Review" from Home and "Add to this scan" put items under Images, hidden until the application is chosen: the
  notice now sits at the top of the form and says where they went.

## 10. Typed scan forms survive Wavelength closing (data-protection review)

**Before.** Everything typed into a scan form (application, findings, interpretation, reflection, supervision,
pathways) was only in memory until Save, so Android ending Wavelength in the background lost it.

**Now.** What is typed is kept on this phone 0.6 s after the last change, and at once when the app is left. It is
kept in the drafts database (store `forms`, one record per open form), never synced or backed up. Home lists
"unfinished scans" with the kept photos, with the date and size. The scan form offers **Continue it** or **Discard**.
- A new scan saves under the id fixed when its form opened, so a continued form can only make one scan.
- An unfinished edit is applied only if the saved scan is still the version it began from. Otherwise its text is
  shown to read and copy, never applied over the newer version.
- Two unfinished scans are both kept. Continuing one while typing another asks first and keeps both.
- Discard changes on leaving deletes that form's copy only. Nothing is deleted by age.

## 11. Camera photos and clips stayed outside Wavelength (data-protection review)

**Cause.** Capacitor's camera hand-off wrote "Take photo" originals to the app's shared-storage folder
(`Android/data/.../files/Pictures`) and never removed them. "Record a clip" gave the camera app no output file, so the
camera app saved every clip in the phone's gallery. There, other apps and cloud photo backup can reach it. Both have
been true since those features shipped. They were reproduced on the emulator.

**Now.** Wavelength's own file chooser (`WLChromeClient`) has the camera write each photo or clip into Wavelength's
private storage (`files/wl-captures`). The app takes its own copy and removes the file. A capture left behind because
Android ended Wavelength while the camera was open comes back as a kept item at the next start. "Take photo" leftovers
from earlier versions are offered once: Delete the leftover copies, Review them first, or Not now. A camera app that
ignores the private file and keeps its own copy triggers a message to delete it from the gallery. Choosing an existing
photo or clip is unchanged. Details: `data-protection-review.md`.

## 12. Sync after logging out and in again (found in this review, in the first 1.0.14 candidate)

**Cause.** The drafts module's run id was declared `var SESSION` in the same scope as the sync's sign-out counter, so
it replaced the counter with text. After logging out and in again without restarting the app, every sync answer was
dropped as if it belonged to the earlier login. Scans reached the server, but the phone kept them as "awaiting sync"
and stopped receiving changes.

**Now.** The run id is `RUN`. A unit test keeps exactly one `SESSION`. The browser check I2 fails on the first
candidate and passes now.

## 13. Kept items after logging in

**Cause.** Straight after logging in, Home is shown under the address `#/login`. The kept-items card checked for the
Home address and did not appear until Home was opened again.

**Now.** The card belongs to the Home screen that asked for it.

