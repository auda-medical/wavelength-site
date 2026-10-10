# Directory autocomplete and daily source monitoring (11 October 2026)

Branch `wavelength-source-monitor-20261010`, worktree `wavelength-source-monitor`. It is built on the supervisor verification release branch (`wavelength-supervisor-prod-20261010`, merged in at `b2e8814`), which itself sits on the deployed `main` (`2dfd55e`). It carries no commercial, 1.0.12+ or Android code. Nothing has been deployed, no migration has been applied, no live email has been sent and no real person's directory record has been collected.

Status: **built and tested; ready for deployment approval.** Directory sync stays **off**: no professional body has given permission yet (section 3).

## 1. What it does

**Guides and accreditation sources (on at deployment).**
- Every official source cited under a guide's `## Sources` heading is checked once a day: 40 sources, of which 36 are automatic, 1 is checked by hand (EACVI: the ESC terms forbid automated collection) and 3 are directories waiting for permission. `build.js` writes `worker/monitor/sources.json` from the guides plus `data/monitor-sources.json`, so a newly cited source joins the checks at the next deployment. A source no longer cited is retired, and its history is kept.
- Each check:
  - uses a conditional request (ETag, Last-Modified), with a full read at least weekly;
  - strips menus, cookie banners and footers, but never a clinical line (words such as "consent" are kept);
  - hashes the main text, and reads a document's version and date (HTML meta, PDF `/ModDate` and `/Title`, version in the address).
- Changes are classified word by word:
  - `no_change`;
  - `minor` (recorded, no review);
  - `meaningful` (a requirement term, more than 12 words, or 6 or more lines changed: waits for review);
  - `important` (a number or "must/required"-type word changed in a requirement line, or a new version or date: waits for review, flags the guide, emails the team once);
  - `format_changed` (the page lost most of its text: held, reviewed once, baseline kept).
- **Nothing clinical is ever rewritten.** A reviewer at `/admin/sources/` acknowledges, approves (note required: what was decided) or dismisses (note required: why). Any guide edit goes through the normal release, with a new `reviewed` date.

**What a guide shows** (website, Android and iPhone alike):
- "Last clinically reviewed: [date]": the guide's `reviewed` front matter.
- "Guidance last updated: [date]": the later of `updated` and `reviewed`.
- "Source checked: [date]": only from the server, and only once every automatic source of that guide has been checked successfully. A failed check never moves the date. When the latest check of every source found nothing that matters, the line adds "No changes detected during the latest check."
- Before the first check: "Official sources not yet checked automatically."
- When a change awaits review, a notice: "An official source for this guide changed on [date]. This Wavelength summary is being reviewed. Until then, check the original guidance:" with a link to the source.
- Opening a guide whose sources were not all checked today starts one background check. The answer never waits for it, and the date stays the last real success.
- The hub (`/guides/pocus-accreditation/`) has no `reviewed` date, so it shows no "Last clinically reviewed" line. It does show "Source checked", which describes the automatic check of the cited pages, not a re-check of the hub's claims (CLAUDE.md rule on the hub's "Checked" date). Remove the hub from monitoring if you would rather it showed no check date at all.
- In the apps, the status from the last connection is shown offline, labelled "Shown from this device's last connection, [date]." When the website's guide is newer than the copy bundled in the app, the app says so.

**Supervisor directories and name autocomplete (off until permission).**
- Adapters:
  - `famus_html`: reads the SAM table by its headings; contact details are never read.
  - `feed_json`: the feed format proposed in `feed-format.md`.
  - `fixture`: tests only.
- Validation keeps the previous directory when the source is empty, unreadable, or more than 10% of entries lack a name or module. A fall of more than 30% is held until an administrator checks the source and accepts it, with their name and how they checked (new in `66eed61`).
- Matching across syncs uses, in order:
  1. the source's own ID;
  2. the same name and organisation;
  3. the same name alone, when unique (a move);
  4. a similar name at the same organisation (a corrected spelling).

  Anything uncertain becomes an "ambiguous" event, never a merge. Removed people are kept, marked removed, for 12 months, then dropped. Directory events are kept for 13 months (`b87bbcf`).
- Name search starts at three letters, in any word order, tolerates a one-letter slip, tells two people with the same name apart by hospital, returns at most 8 results, and never returns contact details. "On Wavelength" appears only for a confirmed, approved supervisor who chose to be found.
- Four states stay separate:
  - **Listing**: in a directory.
  - **Identity**: an administrator confirms the claim, records the identity method, and verifies the listed credential for exactly the listed modules.
  - **Membership**.
  - **Wavelength approval**: still the administrator's decision.

  A claim grants nothing.
- Objections (UK GDPR Article 21): `/admin/sources/?tab=directories` records one by name, and organisation if given. It removes the person at once from both stored copies and from the event history, and keeps them out of later syncs, search and claims. The audit rows carry counts only.
- Flexible verification is unchanged: people not in a directory, or on a pathway with no directory (RCEM), tick credentials, upload documents or describe their experience, as before.

## 2. Files and commits

| Commit | What |
|---|---|
| `ae88a72` | Monitoring core: registry, extraction, classification, runs, guide status API, website labels, admin dashboard, cron, migration 0016 |
| `1d20647` | Listing claims for administrators, name autocomplete in the website app, browser check |
| `b2e8814` | Merge of the release branch (`7f2c249`: "Verified on" is the UK date) |
| `66eed61` | Free-plan CPU fit (one source per run), `last_outcome`, accepting a held fall, Android/iPhone patch, app browser check |
| `b87bbcf` | Objections, retention limits for directory data |
| `373379f` | Documents, app patch with directory search, app check of autocomplete, CLAUDE.md |

New: `worker/monitor/` (`run.js`, `extract.js`, `classify.js`, `directory.js`, `api.js`, `admin.js`, `claims-admin.js`, `sources.json`), `data/monitor-sources.json`, `migrations/0016_source_monitoring.sql`, `test/source-monitor.test.mjs`, `tools/e2e-monitor.mjs`, `tools/e2e-app-guides.mjs`, `tools/i18n/batch-source-monitor.json`, `docs/source-monitoring/`.

Changed:
- `build.js`: guide registry; guide date lines.
- `src/assets/main.js` and `style.css`: the website guide status.
- `src/app/app.js` and `app.css`: autocomplete in the website app.
- `worker/cron.js`, `index.js`, `app.js`, `admin-console.js`, `access.js` (verifier role), `notify.js` (`monitor_summary`), `supervisors-admin.js` (claims panel), `professional.js` (`directory_listing` wording).
- `wrangler.jsonc`: one cron added.
- `test/cron.test.mjs`.

## 3. Permission assessment (detail and draft letters: `permissions.md`)

| Source | Personal data | API, feed or reuse terms | Status |
|---|---|---|---|
| SAM FAMUS supervisors and mentors | Yes (names, hospitals, modules, dates, contact column) | None found | `not_authorised`: needs SAM's written permission |
| ICS FUSIC TMS directory | Yes (1,173 entries behind a hospital search) | None found; robots.txt sets no content signal | `not_authorised`: needs ICS's written permission, ideally a feed |
| BSE accredited members | Yes | None found | `not_authorised`: ask BSE |
| ESC / EACVI certified professionals | Yes | Terms forbid substantive extraction or automated collection | Manual only |
| Guidance pages and documents (RCEM, SAM, ICS, ACEM, ACEP, CPoCUS, ESICM, EUSEM, RCR) | No | Public pages, read once a day with an identifying user agent | Automatic |

No scraping round any access control, no CAPTCHA bypass, no undocumented endpoint. Every directory is tested only with synthetic people.

## 4. Migration 0016 (`migrations/0016_source_monitoring.sql`)

It contains new tables only, so nothing existing changes. It is safe to apply before the Worker, and the current Worker ignores it.

| Table | Purpose |
|---|---|
| `monitor_sources` | One row per source: mode, state, last attempt, last success, last change, next check, failures, lease, ETag and Last-Modified, content hash, version, source date, capped snapshot (200,000 characters), `last_outcome` |
| `monitor_runs` | Every check (kept 90 days) |
| `monitor_changes` | Changes with evidence and the review decision |
| `directory_snapshots` | Current and previous validated list per directory (one JSON document each, written in one batch) |
| `directory_events` | Added, removed, moved, modules, role, corrected name, relisted, ambiguous (kept 13 months) |
| `directory_links` | A Wavelength account's claim to be a listed person, and the decision on it |
| `directory_optouts` | Objections |

It is numbered 0016 so it follows the commercial branch's 0014 and 0015 (not applied) without colliding. Apply it with `wrangler d1 execute --file`, not `migrations apply`, so 0014 and 0015 are not pulled in.

## 5. Cron and switches

`wrangler.jsonc` triggers: `["30 6 * * 2", "30 7 * * 2", "15 5 * * *", "4,24,44 * * * *"]`. The newsletter and daily supervisor crons are unchanged. `worker/cron.js` routes each cron to exactly one job; an unknown cron runs nothing. That is 4 of the 5 cron triggers the free plan allows; the commercial branch adds none.

| Variable | Default | Effect |
|---|---|---|
| `DIRECTORY_SYNC` | unset (off) | Directories are read only when this is `"true"` AND the source's `mode` is `auto` in `data/monitor-sources.json`. Search and claims answer "not switched on yet" while it is off |
| `MONITOR_ON_DEMAND` | unset (on) | `"false"` stops the background check when a guide is opened |
| `MONITOR_TIMEOUT_MS` | 15000 | Fetch timeout |
| `MONITOR_FETCH` | none | Test stand-in for the network; never set in `wrangler.jsonc` |

## 6. Cost and limits (Workers Free, D1 free tier; nothing paid)

- **CPU.** I measured the parse, hash and diff of every real source on 11 October 2026: one fetch each for measurement, nothing kept. Heaviest: the CPoCUS page (375 KB), 5.7 ms. Next: an ICS PDF, 4.3 ms. Most pages: about 2 ms. The total for all 36 is 60 ms. The free plan allows 10 ms CPU per invocation, so each run checks **one** source (three runs an hour gives 72 slots a day for 36 sources), and a guide view starts at most one background check. A 304 answer costs almost nothing.
- **Invocations.** 72 cron runs a day.
- **Outbound fetches.** About 36 a day, plus at most one per guide view when a source is stale (not attempted in the last hour). One subrequest per run.
- **D1.**
  - Writes: about 2 rows per check (the source and the run), so about 75 rows a day plus index updates. A change adds one row.
  - Seeding: one statement when the registry changes.
  - Retention: one batch a day.
  - Reads: a guide view reads one row per source of that guide (`last_outcome` avoids scanning the run history) plus open changes, about 10 to 30 rows. A cron run reads the due index (40 rows at most).

  This is well inside the free tier's daily limits, which are now enforced.
- **Email.** `monitor_summary` goes to `MAIL_REPLY_TO` (hello@) through the existing outbox, once per batch of important changes and once when a source fails three times in a row. It is internal mail only.
- **KV, R2, queues and paid add-ons:** none.

## 7. Tests (11 October 2026)

| Check | Result |
|---|---|
| `npm test` equivalent (`node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`) | **251 pass, 0 fail** |
| `test/source-monitor.test.mjs` | 28 tests (below) |
| `tools/e2e-monitor.mjs` (website and website app, 390 and 1440 px) | 38 checks pass |
| `tools/e2e-app-guides.mjs` against the Android bundle with the patch | 14 checks pass |
| `npx wrangler@4 deploy --dry-run` | Bundles; same bindings and variables as today |
| Android line with the patch (fresh export of `5329d8d`) | Builds; 373 tests, 372 pass, 1 skipped (as before); i18n check OK |

The tests cover:
- the registry and seeding;
- daily scheduling and the lease against duplicate runs;
- no-change, header-only, cookie-banner and 304 answers;
- minor, meaningful and important changes;
- a reviewer's decision;
- failures (back-off 1, 2, 4, 8 then 12 hours, alert after 3, the date never advanced);
- timeouts and format changes;
- PDFs;
- the three dates around UK midnight;
- on-demand refresh;
- directories off without permission and the switch;
- directory sync: baseline, new, removed, moved, modules, role, corrected name, same names apart;
- never emptying or half-applying a directory;
- accepting a held fall;
- objections and retention;
- the FAMUS adapter;
- flags on claims when a listing changes;
- autocomplete;
- claims;
- confirming a claim;
- the admin dashboard and escaping;
- the cron routing.

## 8. Android and iPhone

`android-integration/app-source-monitoring.patch` applies to the Android line (`wavelength-android-fixes-20261010` at `5329d8d`, checked on a fresh export). See `android-integration/README.md`. iPhone builds from the same `src/app/` bundle, so the same patch covers it. A store build is needed for phones to show either feature. Older installed apps are unaffected: the endpoints are new, and nothing the apps already use changed.

## 9. Deployment sequence (each step needs your approval; none done)

**Order matters.** The supervisor verification release (`7f2c249`) should go first, or together: this branch already contains it, so deploying this branch deploys both.

1. **Before you start.**
   - Record the D1 bookmark: `npx wrangler d1 time-travel info wavelength-volunteers`.
   - Record the current Worker version: `npx wrangler deployments list`.
2. **Apply migration 0016:** `npx wrangler d1 execute wavelength-volunteers --remote --file migrations/0016_source_monitoring.sql`. Check it: `SELECT name FROM sqlite_master WHERE name LIKE 'monitor_%' OR name LIKE 'directory_%'` should list 7 tables.
3. **Build and dry run** in this worktree: `node build.js && npx wrangler deploy --dry-run`.
4. **Deploy:** `npx wrangler deploy` (GitHub is unavailable, so the dashboard build from `main` is not the route). `DIRECTORY_SYNC` stays unset.
5. **First hour.**
   - `/admin/sources/` should show sources being checked one at a time, and `/guides/fusic-accreditation/` should show "Official sources not yet checked automatically." until all 15 of its sources are checked.
   - Expect `https://rcem.ac.uk/ultrasound/` to fail: it answered **404** on 11 October 2026. It is cited by three guides (RCEM sign-off, logbook, hub). After three failures (about 3 hours), the team gets one alert email at hello@. Until the citation is fixed, those three guides cannot show "Source checked". Replace the link in the guides (a content change: check the new RCEM page first).
6. **First day.** Every automatic source should be checked by the next morning. The first checks are baselines, not changes.
7. **Later, only after written permission from a body:**
   - set that directory's `mode` to `auto` in `data/monitor-sources.json`, with the permission's reference in `why`;
   - update the privacy notice (wording in `permissions.md`);
   - add `"DIRECTORY_SYNC": "true"` to `wrangler.jsonc` vars;
   - deploy.

## 10. Rollback

- **Worker.** `npx wrangler rollback` to the version noted in step 1, or redeploy the release branch. The tables stay and are harmless.
- **Monitoring only.** Remove `"4,24,44 * * * *"` from the triggers and set `MONITOR_ON_DEMAND = "false"`, then deploy. Guides then keep their last real check date. To hide the line too, revert the build.js guide-date block.
- **Directory sync.** Unset `DIRECTORY_SYNC` and deploy. Stored snapshots stay until deleted (`DELETE FROM directory_snapshots WHERE source_id = ?`).
- **Database.** Migration 0016 adds tables only. A Time Travel restore to the step-1 bookmark is never needed for this change.

## 11. Outstanding authorisations

1. Deploy (section 9), including migration 0016 and the new cron.
2. Fix the RCEM ultrasound citation (`https://rcem.ac.uk/ultrasound/`, 404).
3. Send the permission requests to SAM, ICS and BSE (drafts in `permissions.md`). Wavelength must not contact them without your approval.
4. After any permission: a legitimate interests assessment, the privacy notice paragraph, the DPIA screening, then `DIRECTORY_SYNC`.
5. A store build of the Android and iPhone apps with the patch (after the Worker is live).
6. Clinical review of any change the monitor flags: the reviewer is a clinician, never automatic.
