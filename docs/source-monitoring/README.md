# Source monitoring and directory search: release package (11 October 2026)

Branch `wavelength-source-monitor-20261010`, worktree `wavelength-source-monitor`. It contains the supervisor-verification release branch (`wavelength-supervisor-prod-20261010`, `0d4f924`) unchanged, on top of the deployed `main` (`2dfd55e`), and no commercial, 1.0.12+ or Android code.

Nothing has been deployed, no migration applied, no live record changed, no email sent and nothing bought. Production was only read, through read-only queries:
- the schema (definitions only);
- the account's Workers and their cron schedules.

**Status: ready for deployment approval.** Directory sync stays **off** until a body gives written permission.

| Document | What |
|---|---|
| This file | Report, reliability and CPU assessment, deployment, rollback, approvals |
| `source-inventory.md` | All 51 sources as checked on 11 October 2026, what was corrected, and the clinical review items |
| `permissions.md` | Directory permission assessment, **the three final letters with verified contact routes**, data protection |
| `feed-format.md` | The data format suggested to SAM and ICS |
| `android-integration/` | The app patches (alone, or after the supervisor patch), steps and verification |
| `0016-rollback.sql` | Rollback of the migration, rehearsed against the production schema |

## 1. Corrected RCEM references
- `https://rcem.ac.uk/ultrasound/` returns 404. Three guides cited it as "RCEM: Ultrasound education and training, 2021 curriculum (FAQ)":
  - RCEM ultrasound sign-off;
  - ultrasound logbook;
  - POCUS accreditation hub.

  The RCEM one-page summary also used it as its official source.
- **Replacement:** `https://rcem.ac.uk/ultrasound-education-training-2021-curriculum/`. This is the same document: the same title and FAQ, the same links to the SLO6 and Governance entrustment scales the RCEM guide cites, and the same Appendix 3. Used in all four places; the summary PDF was regenerated (`tools/glance-pdf.mjs`, which now also runs on Windows).
- **Tracked separately:** `https://rcem.ac.uk/em-curriculum/`. It is RCEM's page for the 2021 curriculum's 2025 update (in effect from 6 August 2025), its summary of changes and transition advice. It contains no ultrasound guidance, so it does not replace the FAQ. It is added as a separate source of the RCEM sign-off guide, where SLO6 assessment changes matter. The "summary of changes" PDF is tracked for the reviewer.
- **Clinical material unchanged.** The guides' text, numbers and `reviewed` dates are untouched. The citation fix is recorded as `updated: 2026-10-11` (RCEM sign-off, logbook, hub; the FUSIC guide too, for its HD citation), so "Guidance last updated" is honest and "Last clinically reviewed" does not move.
- The app's directory of bodies (`data/credentials.json`) already pointed RCEM to the new page.

## 2. Verified source inventory
Details: `source-inventory.md`.
- **51 sources:** 36 cited, 12 tracked, 3 directories; 46 automatic, 2 checked by hand, 3 awaiting permission.
- **Every automatic source answered 200.**
- **Broken:** 1, the RCEM FAQ, now fixed.
- **Outdated:** 1, the November 2025 FUSIC HD assessment day. Its permanent move pointed to a past event; it is replaced by the November 2026 page, whose requirements read word for word the same.
- **Moved permanently:** the ESC page (registry updated) and the HD event.
- **Temporary redirects:** eight ICS documents. Each is kept as cited, and the version is now read from the file name served.
- **Duplicates:** none. The guides cite the newer of two copies of RCEM Appendix 3.
- **Newer authoritative version, for clinical review: the FUSIC HD curriculum changed on 1 February 2026** (new reporting form, extra measurements, new examination competencies). The FUSIC guide does not mention it. Its three documents are tracked. Nothing was rewritten.
- **Uncited documents for review:** five FAMUS curriculum packs (including two LP documents, v2 and v1.4); the RCEM Physics/Settings entrustment scale; the RCEM 2025 summary of changes.
- **Manual review:** ESC/EACVI (terms) and the 5.3 MB FUSIC HD Complete Guide (CPU).
- **Awaiting permission:** SAM FAMUS, ICS FUSIC and BSE directories.

## 3. Daily monitoring reliability
- **Three separate facts, never mixed:**
  - "Last clinically reviewed": the guide's `reviewed`; nothing automatic ever changes it.
  - "Guidance last updated": the later of `updated` and `reviewed`.
  - "Source checked": from the server only.
- **No false "checked".** The guide-wide "Source checked: [date]" appears only when every automatic source of the guide succeeded at its latest attempt, and the date is the oldest of their successes. If a source fails:
  - the guide shows "Source checked: [date] for 14 of 15 sources.";
  - it names each failed source with its own last successful check and a link;
  - "No changes detected" disappears.

  A failure never moves any date, and never counts as a success (tests: `source-monitor`, `monitor-schedule`).
- **Guides open at once.** The status is fetched after the page renders. The apps show their cached status, labelled with the day it arrived.
- **Pending-review warnings** are unchanged: meaningful and important changes wait at `/admin/sources/` and show the notice on the guide until a reviewer records a decision with a note.
- **Stronger detection, same baseline rules:**
  - linked official documents are compared by file name (a new curriculum pack behind the same link text is an important change);
  - versions are read from the file behind a redirect;
  - a permanent move is recorded for the citation to be updated.
- **Redirect safety.** Redirects are followed by hand, at most five, and only within the source's own site. Another site or a loop is a failure.
- **Load on the live site:**
  - status answers are cached at the edge for five minutes (Cache API: fifty openings make one database read);
  - an opening may start at most one background check, at most once a minute per Worker instance, and only for a source of that guide that is already due (failing sources keep their back-off) and not held by another run;
  - there is no route that takes an address from a request: sources come only from the build's registry (tests: `monitor-release`).
- **Before the migration, or after its rollback,** the Worker does nothing and claims nothing: public status answers 503, runs return "not ready", and the admin page says to apply 0016.

## 4. Cloudflare CPU and scheduling
- **Account.**
  - Workers Free.
  - One D1 database, `wavelength-volunteers` (`1d2a5805-b54f-4969-b0dc-8decaa5319cf`), bound as `DB`; matches `wrangler.jsonc`.
  - Cron triggers read from the Cloudflare API: `wavelength-site` has 3 (`15 5 * * *`, `30 6 * * 2`, `30 7 * * 2`); OneRota's two Workers have none.
  - This adds one, `4,14,24,34,44,54 * * * *`: **4 of the 5 the free plan allows per account**, leaving one for OneRota.
  - The supervisor and newsletter schedules are unchanged, and each cron still runs exactly one job.
- **Schedule.**
  - Every ten minutes, one due source per run: 144 chances a day for 46 automatic sources.
  - A success is due again after 23 hours, so every UK calendar day gets a check.
  - Failures back off 1, 2, 4, 8, then 12 hours (at most about 7 attempts a day) and alert hello@ once after three in a row.
  - The oldest-due source is always next, so nothing starves.
  - Proven by a three-day simulated-clock run of the real code, with one run in seven missed, one source down throughout and one flaky: every healthy source succeeded every day; the failing one was never counted, was retried within bounds and was named on its guide (`test/monitor-schedule.test.mjs`).
- **CPU.** Measured as process CPU time over 100 to 200 repetitions of the real Worker modules in V8 (the engine Workers runs), not single wall-clock timings (`tools/monitor-cpu.mjs`, against every real source body):

| | Before this round | Now |
|---|---|---|
| Heaviest real check (pipeline) | 6.3 ms (CPoCUS page) | **4.4 ms** (2.4 MB FUSIC HD updates PDF); CPoCUS 4.1 ms |
| Worst HTML text extraction | 5.9 ms | 2.8 ms (output identical on all 26 real HTML pages and 3 edge cases) |
| Idle run (nothing due) | | 0.3 ms |
| Guide status answer | | 0.5 ms; a cache hit does no database work |
| Largest page the monitor will parse (480 KB HTML with 60,000 characters of text) | | under 10 ms (asserted in the tests) |

  Optimisations:
  - one regular expression for all dropped blocks instead of thirteen passes;
  - one test for furniture lines instead of sixteen;
  - character fixes once per page.

  Hard limits stop a growing source pushing a run over 10 ms:
  - HTML over 480 KB, main text over 60,000 characters, or a document over 3 MB is reported "too large: check by hand";
  - such a source is never parsed and never counted as checked;
  - the longest real guidance text is about 23,000 characters.

  D1 cost: about 2 rows written per check (about 100 a day); an idle run makes 5 small queries; guide views mostly come from the cache. Well within the enforced free-tier limits.
- **Confirm on Cloudflare after deployment.** Local V8 measurement is representative, not identical. In the Worker's Metrics, watch CPU time for scheduled invocations and any "Exceeded CPU" outcome for the first 48 hours. Rollback trigger: any `exceededCpu`, or a p99 above 8 ms. Then remove the monitoring cron (section 9) and lower `MAX_HTML_BYTES`.

## 5. Supervisor directory permission status
- **SAM FAMUS, ICS FUSIC and BSE: not authorised, never read.** They need two things: `mode` set to `auto` in `data/monitor-sources.json` with the permission cited, and `DIRECTORY_SYNC = "true"`. Tested only with synthetic people.
- **Built and waiting:**
  - daily detection of new and removed names, changed hospitals, roles and modules;
  - validation that never empties or half-applies a directory;
  - a held fall above 30% until an administrator accepts it;
  - objections removed at once;
  - removed people kept 12 months and events 13 months.
- **Listing, identity, membership and Wavelength approval stay separate.** A claim grants nothing until an administrator confirms identity, and approval is still a separate decision.
- **Manual entry stays the route:**
  - RCEM has no directory;
  - unlisted supervisors tick credentials or upload documents;
  - a written account of experience remains eligible for manual assessment with no certificate (test: an RCEM supervisor's application with written experience and no credential is submitted);
  - certificates are not mandatory.
- **The three letters are final** in `permissions.md`, with verified addresses: famus@acutemedicine.org.uk, learning@ics.ac.uk, accreditation@bsecho.org. None sent.

## 6. Tests (11 October 2026)

| Check | Result |
|---|---|
| Full Worker suite, this branch | **267 pass, 0 fail** (from 251 at the start of this round) |
| New: `monitor-schedule` (3), `monitor-migration` (5), `monitor-release` (8) | All pass |
| `tools/e2e-monitor.mjs`: website and website app at 390 and 1440 px, including a failing source | All pass |
| `tools/e2e-app-guides.mjs`: Android bundle, alone and combined with the supervisor patch | All pass |
| Android line, monitoring patch alone | 374 tests (373 pass, 1 skipped) |
| Android line, supervisor + monitoring patches | 381 tests (380 pass, 1 skipped); the supervisor `e2e-verified` (android) passes too |
| `wrangler deploy --dry-run` | Bundles; same bindings and variables as today; four crons |

The new tests cover:
- replacement RCEM links;
- broken sources and redirects;
- several sources on one guide;
- per-source dates;
- failed daily checks;
- scheduling and retry fairness;
- CPU and account limits;
- fifty simultaneous openings;
- the allowlist;
- directories without permission and the manual fallback;
- dashboard access;
- migration safety on the production schema;
- website and app display.

## 7. Database migration safety
- `migrations/0016_source_monitoring.sql` holds only `CREATE TABLE IF NOT EXISTS` and `CREATE [UNIQUE] INDEX IF NOT EXISTS`, for seven new tables. No ALTER, UPDATE, DELETE or INSERT.
- None of its names exists in production. The production table `directory_profiles` is unrelated and untouched.
- It needs `settings`, `audit_events`, `notification_log`, `learners` and `credentials`, all present.
- **Rehearsed on the production schema** (`test/fixtures/production-schema-20261011.sql`, definitions only):
  - applied twice: every existing table definition and row unchanged, seven tables added;
  - `0016-rollback.sql` returns the schema exactly to the original and touches no other data;
  - a Worker running before the migration or after the rollback does nothing and errors nowhere.
- **Backups, in this order, before applying:**
  1. a fresh export, `npx wrangler d1 export wavelength-volunteers --remote --output wavelength-volunteers-<date>.sql`. Keep it off the repository: it holds personal data. Check that it opens with `sqlite3 :memory: ".read <file>"` and that its row counts match a `SELECT COUNT(*)` of `learners`, `credentials` and `supervisor_applications`.
  2. a Time Travel bookmark, `npx wrangler d1 time-travel info wavelength-volunteers`, as an additional safeguard, not the only one. A restore is destructive and rewinds everything written since.
- **Reverting the Worker** to the release branch, or to `2dfd55e`, leaves the seven tables in place, unused. No earlier Worker reads or writes them, and they hold no learner records except the opt-in claims. Drop them only with `0016-rollback.sql`, after a fresh export.

## 8. Deployment sequence (each step needs your approval; none done)
The supervisor-verification fix stays an independent, earlier release. Deploying the monitor does not depend on directory permissions.

**Release A: supervisor verification** (`wavelength-supervisor-prod-20261010`, `0d4f924`). Follow `docs/supervisor-verification-release/README.md` (export, bookmark, `npx wrangler deploy` from that worktree), then watch it for 24 to 48 hours. This branch does not need to wait for A, but A must not wait for this branch.

**Release B: source monitoring** (this branch, which contains A unchanged):
1. Fresh export and Time Travel bookmark (section 7); note the current Worker version (`npx wrangler deployments list`).
2. Apply 0016: `npx wrangler d1 execute wavelength-volunteers --remote --file migrations/0016_source_monitoring.sql`. Use `execute --file`, not `migrations apply`: production has no migrations table, and 0014/0015 belong to the commercial branch.
   - Check: `SELECT name FROM sqlite_master WHERE name LIKE 'monitor_%' OR name IN ('directory_snapshots','directory_events','directory_links','directory_optouts')` lists 7 tables.
3. In this worktree: `node build.js`, then `npx wrangler deploy --dry-run` (expect four crons and the same bindings), then `npx wrangler deploy`. `DIRECTORY_SYNC` stays unset.
4. **First hours.**
   - `/admin/sources/` shows sources checked one every ten minutes. All 46 are first checked within about 8 hours; these are baselines, not changes.
   - Guides read "Official sources not yet checked automatically.", then "Source checked: [date] for N of M sources." while their sources are being reached, then "Source checked: [date]".
   - Watch the CPU metrics (section 4).
5. **First day.** Every guide should show "Source checked: [today]". Review any item at `/admin/sources/`.
6. Then: the store build with the app patches (`android-integration/`), and the clinical review items in `source-inventory.md`.
7. **Only after written permission from a body:** follow the checklist in `permissions.md` section 5.

If the supervisor release needs a hotfix after A, make it on the release branch, then merge that branch into this one before B. This branch must never be merged into the release branch, and never into the commercial branch's deployment path.

## 9. Rollback
- **Monitoring off, quickly:** remove `"4,14,24,34,44,54 * * * *"` from the triggers, set `MONITOR_ON_DEMAND = "false"`, and deploy. Guides keep their last real check.
- **Worker:** `npx wrangler rollback` to the version noted in step 1, or redeploy the release branch. The tables stay, unused (section 7).
- **Tables:** `0016-rollback.sql`, after a fresh export, only if they must go.
- **Directory sync:** unset `DIRECTORY_SYNC` and deploy.
- **Time Travel restore:** a last resort, because it rewinds every write since the bookmark.

## 10. Mobile integration
`android-integration/README.md` has the steps and the two patch variants:
- alone: `app-source-monitoring.patch`;
- after the supervisor patch: `app-source-monitoring.after-supervisor.patch`, for 1.0.15.

Both were verified on fresh exports of the unchanged Android tip `5329d8d`, including with the supervisor patch. The app shows the same honest status as the website, its cached status offline, pending-review notices, a newer-version notice, and no directory box while directories are off.

## 11. Changed files
This round:

| Area | Files |
|---|---|
| Worker | `worker/monitor/run.js` (redirects, moves, size and text limits, readiness, `MAX_*`), `extract.js` (linked documents, faster extraction, `TEXT_LIMIT`), `classify.js` (linked documents), `api.js` (per-source and partial status, on-demand limits, edge cache, readiness), `worker/cron.js`, `worker/index.js`, `wrangler.jsonc` (cron every ten minutes), `worker/monitor/admin.js` |
| Content | `content/guides/rcem-ultrasound-sign-off.md`, `ultrasound-logbook.md`, `pocus-accreditation.md`, `fusic-accreditation.md`, `at-a-glance/rcem-ultrasound-sign-off.md`, `src/assets/guides/rcem-ultrasound-sign-off-at-a-glance.pdf`, `at-a-glance.json`, `data/monitor-sources.json` |
| Website | `src/assets/main.js`, `src/assets/style.css` |
| Tests and tools | `test/monitor-schedule.test.mjs`, `test/monitor-migration.test.mjs`, `test/monitor-release.test.mjs`, `test/fixtures/production-schema-20261011.sql`, `test/source-monitor.test.mjs`, `test/cron.test.mjs`, `tools/monitor-cpu.mjs`, `tools/e2e-monitor.mjs`, `tools/e2e-app-guides.mjs`, `tools/glance-pdf.mjs` |
| Docs | this folder, `CLAUDE.md` |

## 12. Outstanding production approvals
1. Release A: deploy the supervisor-verification fix (its own package).
2. Release B: fresh export and bookmark, apply migration 0016, deploy this branch (adds the fourth account cron).
3. Watch CPU for 48 hours after B.
4. Send the three permission letters (none sent).
5. Clinical review: FUSIC HD 2026 curriculum, FAMUS packs, RCEM 2025 update (`source-inventory.md`).
6. After any permission: legitimate interests assessment, DPIA screening, privacy notice paragraph, then `DIRECTORY_SYNC`.
7. Store build 1.0.15 with both app patches, after B is live.
8. Optional: a Cloudflare Redirect Rule www to apex (unchanged since 5 October).
