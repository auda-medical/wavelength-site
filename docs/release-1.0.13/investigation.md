# 1.0.13 investigation: why the two fixes were missing from 1.0.12 (18)

Done 10 October 2026, before any code was changed.

## What is installed

The phone runs Wavelength 1.0.12 (18). The signed files of that build are on this PC:

| File | Where |
|---|---|
| `wavelength-1.0.12-18-release.apk` | `C:\WavelengthSigning\signed\` |
| `wavelength-1.0.12-18-release.aab` | `C:\WavelengthSigning\signed\` |

`aapt2 dump badging` on the APK: `package: name='uk.co.thewavelength.app' versionCode='18' versionName='1.0.12'`.

The logbook ships inside the APK (`assets/public/app/`). Its `app.js`, `editor.js` and `app.css` are byte-for-byte
the files of commit `90a8e6a` (branch `wavelength-1.0.12`, "1.0.12: test report and limitations from the final run"):

| File | SHA-256 (first 12) in source 90a8e6a | in the installed APK |
|---|---|---|
| app.js | aa7de0614f92 | aa7de0614f92 |
| editor.js | ad2ff087f89e | ad2ff087f89e |
| app.css | 0aa15e4fe761 | 0aa15e4fe761 |

So the installed build is exactly the 1.0.12 source. Nothing newer was left out of it.

## Was a fix written anywhere and not shipped?

No. Every local and remote branch (`git grep` on `src/app` for an annotation-size slider, pinch or zoom, and scroll
memory or restoration) has none of it. The commercial branch (`wavelength-business-20261010`) changed `src/app/app.js`
after 1.0.12, but only for supervisor review states (a "Decline this request" button and "Under review" wording),
not the editor or navigation. The other worktrees have no uncommitted app changes. The fixes had never been
implemented.

## Issue 1: what S, M and L did (1.0.12)

The three buttons set one stored number, `size`, as a fraction of the picture's shorter side:
S 0.042, M 0.058, L 0.080 (`SIZES` in `src/app/editor.js`). What that number means depends on the annotation:

| Annotation | What S, M, L changed |
|---|---|
| Text and clinical labels | Font height (M = 5.8% of the shorter side) |
| Dot | Radius (0.32 × size) |
| Arrow, circle, box | Line thickness and arrowhead, for new ones only. With one selected, S, M and L did nothing to it |
| Pictogram | Nothing. Pictograms were always created at 0.24 and resized only with the corner handle |

The buttons had no visible label (only spoken names "Small", "Medium", "Large"), changed only text, labels and dots
when an annotation was selected, and the corner handle could set sizes in between that S, M and L could not show.

## Issue 1: magnification

1.0.12 had none. The canvas was fitted to the stage (`max-width: 100%; max-height: 100%`) with `touch-action: none`,
so the browser's own pinch was switched off and nothing replaced it. There was no way to enlarge the picture.

## Issue 2: why Guides went back to the top

`hashchange` in `src/app/app.js` ran `render(); window.scrollTo(0, 0)` on every address change, forward or back. The
header's back arrow and the Android back button (`wl:back`) set `location.hash` to the parent screen, which is a new
visit as far as the router knew. The Guides list also draws "Loading…" first and its cards a moment later, so even a
saved position would have been applied to a page too short to hold it.

The same cause made the logbook lose its place, and its search and filters: the scan page's back arrow points at
`#/log`, without the `?q=&type=&s=` the list had been left with.

The Guides list itself has no search box or filters in 1.0.12 (six guides and the supervisor verification guide); its
"sections" are the "For your pathway" and "All guides" headings. Inside a guide there is a Contents panel and
sections. None were added in 1.0.13: the fix restores what exists.

## Which changes need a new Android binary, and which depend on the website

| Change | Where it lives | Needs |
|---|---|---|
| Annotation size slider, magnification | `src/app/app.js`, `editor.js`, `app.css`, `i18n/*.json` | A new Android build (the logbook is inside the APK). The website's /app/ gets it when the website is next deployed |
| Going back keeps place, search and filters | `src/app/app.js` | The same |
| Worker, database, Cloudflare | Unchanged | Nothing. No migration, no Worker deploy, no new or changed API call |

The Android 1.0.13 build works against the live Worker exactly as 1.0.12 does.

## Built from 1.0.12, not from the commercial branch

The commercial branch's app changes call two Worker routes that are not deployed (`/api/app/supervise/request/accept`
and `/decline`). A phone build from that branch would show a "Decline this request" button that fails against the live
server. So 1.0.13 is built from 1.0.12 (`90a8e6a`) plus only these fixes, on branch `wavelength-1.0.13`. The same
commits are merged into `wavelength-android-fixes-20261010` (which carries the commercial work) so nothing is lost
there.
