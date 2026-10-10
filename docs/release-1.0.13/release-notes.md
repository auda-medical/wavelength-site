# Wavelength 1.0.13 (19): release notes

Version name 1.0.13, version code 19, package `uk.co.thewavelength.app`. Built from branch `wavelength-1.0.13`
(1.0.12 commit `90a8e6a` plus the 1.0.13 commits). Patch release: the version name follows the 1.0.x series, and the
version code goes up by one from 18, so it installs over 1.0.12 as an update.

No Worker, database or Cloudflare change. Nothing to deploy for the Android app to work.

## For learners (store "What's new", 500 characters)

> Annotating images is easier: one Annotation size slider replaces S, M and L and resizes the selected label, arrow,
> dot, circle, box or pictogram. Pinch with two fingers, or use the zoom buttons, to enlarge the picture while you
> annotate or cover identifiers; zooming never changes your annotations. Going back from a guide or a scan now returns
> you to the same place in the list, with your search and filters kept.

## Image editor (Annotate)

- **Annotation size slider** replaces the three unexplained buttons S, M and L. It is labelled "Annotation size",
  shows its value (40% to 250% of each type's usual size, in steps of 5%) and says what it applies to:
  "For new annotations", or for a selected one "Selected label: text size", "Selected arrow: line thickness",
  "Selected pictogram: size", and so on.
- It changes every kind of annotation: text and labels (font height), dots, arrows, circles and boxes (line thickness
  and arrowhead) and pictograms (their whole size). In 1.0.12 S, M and L did nothing to a selected arrow, circle,
  box or pictogram.
- Selecting an annotation moves the slider to its size. The corner handle and the slider agree. Tapping the
  percentage returns to 100%.
- One drag of the slider is one step of Undo; Redo puts it back.
- Annotations made in 1.0.12 keep their size (S, M and L read as 72%, 100% and 138%).

## Image editor (all modes): magnification

- Pinch with two fingers to zoom (up to 5×); move two fingers together to move around the picture.
- Zoom buttons on the picture: −, the current zoom (tap it to see the whole picture), +. They fade while a finger is
  on the picture, so they never hide what is being drawn or covered.
- On a computer (the website's logbook): the mouse wheel, or + and − with the picture focused.
- Zoom is on screen only. Annotations and redactions are placed on the picture's own pixels, keep their size, and are
  saved exactly as they would be unzoomed. The tip line says so when you zoom in.
- Crop, Trim top, Rotate and Flip return to the whole picture.
- The same in the clip editor.

## Going back

- Back from a guide (the back arrow, the Android back button or back gesture) returns to the same place in Guides
  and accreditation, without a jump to the top.
- Inside a guide, back from the one-page summary returns to the same place in the guide with Contents still open.
- The logbook: back from a scan returns to the same scan in the list, with the search, the application filter and
  the sign-off filter as they were (in 1.0.12 all three were cleared).
- Opening a screen afresh (a tab, a link) still starts at the top.

## Known issue (priority before public release)

On a slow connection, text typed into Create account in the first moments after opening the app can be cleared
when the app's start-up check answers. The same in 1.0.12. To be fixed before any public release.

## Unchanged

Redaction, the identifier declaration before "Use this image", the identifier check on typed labels, clip
preparation, backups, sync, sign-off, the scan form (all 745 controls identical to 1.0.12), and every server call.
