# Source monitoring in the Android and iPhone apps: integration handover (11 October 2026)

For the next coordinated store release (1.0.15 (21) per the release plan). iPhone builds from the same `src/app/`, so the same steps cover both. Nothing here has been applied to another worktree.

## What it brings

**Guide source status** (`src/app/sourcestatus.js`, `window.WLSources`):
- Each guide shows "Last clinically reviewed" and "Guidance last updated" from its bundled copy.
- The source-check line comes only from the server (`GET /api/app/sources/guide/<slug>`), never from the phone's clock:
  - "Source checked: [date]" only when every official source of the guide was checked successfully at its latest attempt, with "No changes detected during the latest check." when that is true;
  - when one or more sources could not be checked: "Source checked: [date] for 14 of 15 sources." plus "Could not be checked at the latest attempt: [source] (last checked [date])", linked to the source.
- The pending-review notice and its link to the original, when an important change awaits review.
- Offline: the answer from the last connection, labelled "Shown from this device's last connection, [date]."
- "The website has a newer version of this guide…" when the server's content version differs from the bundled copy. It shows after today's citation corrections, until the app's guides are rebuilt.

**Official directory search** (`listingBox`, `bindListing`):
- A combobox in "Your supervisors" (invite) and in the supervisor application (Experience: "Is this you?").
- It is shown only when the server reports directory search available (`DIRECTORY_SYNC`).
- While directories stay off (today, and until a body gives permission), no box appears. The supervisor's email, the credential ticks and the written experience are the route, exactly as now.

## Two patch files, one for each release order

| File | Apply to |
|---|---|
| `app-source-monitoring.patch` | The Android line on its own (`wavelength-android-fixes-20261010` at `5329d8d`) |
| `app-source-monitoring.after-supervisor.patch` | The Android line **after** the supervisor-verification app patch (`docs/supervisor-verification-release/android-integration/app-ui.patch` and `app-css-block.css`). Use this one for 1.0.15, which carries both |

The two features touch neighbouring lines in `app.js`, `app.css`, `index.html` and `sw.js`, so the second file is the first rebased onto the supervisor patch. The resulting files are byte for byte what was tested. Translations travel as batch files, not as edits to the generated language files, so the two features never conflict there.

## Steps (inside an LF checkout of the Android line; never run `git config` in a worktree)

1. Supervisor verification first (its own README):
   - `git -c core.autocrlf=false apply <release>/android-integration/app-ui.patch`
   - append `app-css-block.css` to `src/app/app.css`
2. `git -c core.autocrlf=false apply docs/source-monitoring/android-integration/app-source-monitoring.after-supervisor.patch` (or `app-source-monitoring.patch` without step 1).
3. `python3 tools/i18n-add.py tools/i18n/batch-supervisor-qa.json tools/i18n/batch-source-status.json tools/i18n/batch-source-monitor.json` (leave out the first file without step 1). Then convert the eight `src/app/i18n/*.json` files back to LF, because Python on Windows writes CRLF.
4. `node tools/i18n-extract.mjs`, then `python3 tools/i18n-check.py`, then `node build.js`.
5. Tests: `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs` (on Windows `npm test` runs none).

## Verified on 11 October 2026 (fresh `git archive` exports of `5329d8d`)

| Combination | Result |
|---|---|
| Monitoring patch alone | Applies cleanly; files identical to the tested copy; 374 tests (373 pass, 1 skipped as before); i18n check OK |
| Supervisor patch, then the after-supervisor variant | Both apply cleanly; files identical to the tested combination; 2,254 strings; i18n check OK; **381 tests (380 pass, 1 skipped)** |
| Browser: `tools/e2e-app-guides.mjs` on the combined bundle | All checks pass: own dates, no check claimed before one, today's check, offline label, newer-version notice, one source failing (14 of 15, named), pending notice and link, search and claim, directories off (no box, manual entry) |
| Browser: the supervisor release's `tools/e2e-verified.mjs` (`UI=android`) on the combined bundle | All checks pass |

Run the app check from the monitor worktree:

```
DIST=<patched Android-line dist> node --import ./test/helpers/register.mjs tools/e2e-app-guides.mjs <outdir>
```

## Requirements and compatibility

- **Server first.** Deploy the Worker from `wavelength-source-monitor-20261010`, with migration 0016, before a store build with this patch ships. Against today's live Worker the app shows only its two bundled dates and no directory box: it never breaks and never claims a check.
- **Older installed apps** are unaffected: the endpoints are new, and nothing the apps already use changed.
- **No new permissions or plugins.** Calls go only to thewavelength.co.uk, which the app's Content Security Policy already allows. The status endpoint is public and read-only; listing search uses the existing login token.
- **Phone checks before release:**
  - open a guide online, then in Flight mode, and confirm the offline label;
  - confirm that links in the notices open in the in-app browser.
