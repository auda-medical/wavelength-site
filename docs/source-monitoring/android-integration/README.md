# Source monitoring in the Android and iPhone apps

`app-source-monitoring.patch` brings two things to the store apps.

**Guide source status** (`src/app/sourcestatus.js`, `window.WLSources`):
- Each guide in the app shows "Last clinically reviewed" and "Guidance last updated" from its bundled copy.
- "Source checked" (plus "No changes detected during the latest check." when true) comes only from the server (`GET /api/app/sources/guide/<slug>`). It is never worked out from the phone's clock.
- When a change awaits review, the same notice as the website appears, with the link to the original.
- Offline, the app shows the answer from the last connection, labelled "Shown from this device's last connection, [date]."
- When the website's guide is newer than the copy bundled in the app, the app says so.

**Official directory search** (`listingBox`, `bindListing`):
- The same combobox as the website app, in "Your supervisors" (invite) and in the supervisor application (Experience step: "Is this you?").
- It is shown only when the server says directory search is available (`DIRECTORY_SYNC`), so it stays hidden until a body gives permission.

Translations are included: 29 strings in the 8 app languages, from `tools/i18n/batch-source-status.json` and `batch-source-monitor.json` (machine-drafted, like the rest).

## Applies to

`wavelength-android-fixes-20261010` at `5329d8d` (the Android line, including 1.0.14). Checked on 11 October 2026 on a fresh `git archive` export:
- `git -c core.autocrlf=false apply` succeeds, and the patched files match the tested copy byte for byte;
- `node build.js` builds 352 pages;
- 373 tests run (372 pass, 1 skipped as before), including the new `test/source-status.test.mjs`;
- `tools/i18n-check.py` passes.

iPhone builds from the same `src/app/`, so the patch covers it.

```
git -c core.autocrlf=false apply docs/source-monitoring/android-integration/app-source-monitoring.patch
```

Run it from an LF checkout of the Android line. Never run `git config` inside a worktree.

## Requirements

- **Server first.** The Worker from `wavelength-source-monitor-20261010` (with migration 0016) must be live before a store build with this patch ships. Against today's Worker, the app shows only the two bundled dates and no directory box. It never breaks or claims a check.
- **No new permissions or plugins.** The calls go to thewavelength.co.uk, which the app's Content Security Policy already allows. The status endpoint is public; the listing search uses the existing login token.
- **Version.** Ship as the next store version (1.0.15 (21) per the release plan). Older installed apps are unaffected: the endpoints are new and nothing the apps already use changed.
- **Browser check.** `DIST=<patched Android-line dist> node --import ./test/helpers/register.mjs tools/e2e-app-guides.mjs <outdir>`, run from the monitor worktree. It checks live, offline and pending-review states, search and claim on the bundle (14 checks, all passing on 11 October 2026).
- **Phone checks** before release:
  - open a guide online, then in Flight mode, and confirm the offline label;
  - confirm the link in a pending notice opens in the in-app browser.
