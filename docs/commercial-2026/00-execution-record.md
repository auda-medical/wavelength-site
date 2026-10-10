# Wavelength commercial development: local execution record

This file replaces the GitHub issue #2 start and handoff comments while the GitHub account is unavailable (owner's
instruction, 10 October 2026). It records the work, decisions, files, tests, limitations, outstanding actions and
local commits for the commercial development project. Nothing in this project depends on GitHub.

## Start record (10 October 2026)

| Item | Value |
|---|---|
| Task | Business analytics, tailored training website expansion, promotional videos |
| Worktree | `C:\Users\phira\Wavelength-Cloud\wavelength-business-development` |
| Branch | `wavelength-business-20261010` (local only, no upstream) |
| Starting commit | `90a8e6aba021ea569988162ca301ca33726ad32e` (Wavelength 1.0.12) |
| Original repository | `C:\Users\phira\Wavelength-Cloud\wavelength-site`, not touched |
| PR | None (GitHub unavailable) |
| Expected areas | `worker/` (analytics, bookings, finance, dashboard), `migrations/0014_*`, `build.js` (training page, home, nav, privacy, beacon), `data/`, `src/assets/main.js`, `test/`, `docs/commercial-2026/`, `video/` (Remotion project) |

## Rules followed

- No GitHub access, comments, fetch, push, merge or pull requests.
- No deployment, no production migration, no change to Cloudflare settings, Stripe or live records.
- Live data was read only as aggregate counts (no names, emails or clinical content) to set the baseline. The exact
  queries are in `01-analytics-audit.md`.
- No paid services, no billable APIs, no new subscriptions.
- Fictional data only in tests and videos.

## Work log

Entries are added at each milestone. Newest at the bottom.

### Phase 1: analytics audit (10 October 2026)
- Read CLAUDE.md, the 1.0.12 handover documents, the Worker, the migrations, build.js and the admin console.
- Ran the existing test suite: 315 tests, 311 pass, 3 fail, 1 skipped. See "Tests" below.
- Read live D1 aggregate counts (read-only) for the baseline.
- Checked current ICO guidance on storage and access technologies (statistical purposes exception, in force since
  5 February 2026) and Cloudflare free-tier limits (D1 free-tier daily limits enforced since 1 September 2026).
- Output: `01-analytics-audit.md`.

### Phase 2: analytics, bookings, finance and dashboard (10 October 2026)
- Cookieless measurement, app events, Stripe webhook (off by default), ledger, owner time, opportunity register and the
  private dashboard with monthly report and CSV exports. Migration 0014 (not applied).
- Output: `02-analytics-architecture.md`, `05-privacy-security-review.md`, `06-campaign-links.md`. Commit `e4d7aef`.

### Phases B to E: credential verification, supervision authority, directory, asynchronous review
- Capacities per pathway (FAMUS supervisor and mentor, FUSIC trainer and Heart mentor, local supervisors), directory
  checks with independent identity confirmation, nine credential states, listed-contact confirmation, accept and
  decline with reason on review requests. GMC workflow preserved. Migration 0015 (not applied).
- Output: `03-credential-verification.md`. Commits `e4d7aef` and `c01f74f`.

### Website: free logbook, supervision story, Tailored Training, UK and international
- Output: `04-website-changes.md`. Commit `c01f74f`.

### Commercial strategy, partnerships, scenarios and draft proposals (not sent)
- Output: `08-commercial-strategy.md`.

### Films
- Remotion project in `video/`, real app captures from a fictional local world, local narration and original music.
  Layered captures so fixed bars and modal sheets behave as on a phone. Renders in
  `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final\` (see `render-report.json` there).
- Output: `07-videos.md`.

### Final checks and documents
- Browser check of the business dashboard with fictional data found two defects, both fixed with tests: double-encoded
  characters in `worker/business.js`, and course costs dated differently from course revenue.
- Output: `09-limitations.md`, `10-deployment-approval.md`, `11-onerota-analytics-spec.md` (OneRota not modified),
  `12-reporting-and-test-report.md`.

### Final review and films version 2 (10 October 2026, later the same day)
- Fero reviewed the version 1 films and asked for a substantial redesign. Version 1 is preserved: renders unchanged in
  `final\`, source at Git tag `video-v1`.
- Version 2 built in `video/src/v2/`:
  - redesigned films, corrected logo, separate narration and screen copy;
  - camera close-ups of the app and original illustrations;
  - captions and caption files, a layout collision check, new music cues.
- Voice evaluation: Qwen3-TTS (VoiceDesign, then a design-then-clone pipeline) and Chatterbox, all local and free,
  with synthetic designed voices only. A provisional voice was chosen on measurements; it awaits Fero's listening.
  Output: `13-pronunciation-glossary.md`, `14-videos-v2.md`.
- Application review:
  - the Windows test failures were fixed (`npm test` runs and passes on Windows);
  - the app end-to-end suite passes against the local Worker;
  - two supervisor interface checks fail identically on the untouched 1.0.12 code (a harness difference, not a
    regression).
- Business review: Stripe test-mode events are now kept out of every money figure; the finance tab names bookings
  taken and recognised revenue separately.
- Deployment plan rewritten (`10-deployment-approval.md`) and release readiness reported
  (`15-release-readiness.md`).

### Films version 3 (10 October 2026, evening)
- New direction from Fero: the supervisor is not on the trainee's shift (rota mismatch), not just busy. Built in
  `video/src/v3/` (Flagship3, Short3, Ad3, End3, art3, reveal); versions 1 and 2 untouched.
- Narration: Fero's chosen voice (audition 4), cloned from the audition itself (a synthetic voice, never a real
  person); takes chosen by measured pace and pitch range; no pitch or speed processing. Chatterbox not reused.
- Premium logo reveal (macro, pullback, settle, wordmark, tagline) with original synthesised sound; checked
  pixel-identical to the website mark. Sound approved for the films only: the app and website stay silent
  (recommendations in `17-logo-motion-and-sound-recommendations.md`; app and website not modified).
- Output: `16-videos-v3.md`, renders in `wavelength-video-output\final-v3\`.

### Films version 4 (10 October 2026, evening)
- Fero's feedback: version 3 felt gloomy (dark navy pictures, organ-like bass). Version 4 in `video/src/v4/`:
  brighter, warmer pictures with the same story and app demonstration; three original music candidates; a shorter
  logo sound; f09 retaken ("Directly supervised" now transcribes correctly); mixing outside Remotion with stems.
- Comparison stage only: the full films wait for a human choice of music. Versions 1 to 3 preserved and checked.
- The version 3 capture metadata, discarded from the working tree by mistake, was restored exactly and committed.
- Output: `18-videos-v4.md`; files in `wavelength-video-output\comparison-v4\`.
- Later the same evening, Fero chose Candidate A and asked for sonar logo sounds:
  - nine original sounds were made and measured;
  - three finalists (C3, A1, C1) and the two-note reference were placed in the real logo animation;
  - output: `19-sonar-logo-sound.md`, `wavelength-video-output\comparison-v4\sonar\`;
  - final renders wait for approval of the logo sound.
- Final logo-sound comparison (Fero's brief, same evening):
  - four options (original two-note, refined two-note, C1 sweep, sonar-musical hybrid);
  - options 2 to 4 dry and with a subtle reflection (150 ms, about 18 dB under);
  - the music makes a little room around each settle instead of the logo being made louder;
  - output: `20-logo-sound-final-comparison.md`, `wavelength-video-output\comparison-v4\signature\`;
  - awaiting Fero's selection.

## Decisions and assumptions

Listed in full in each phase document. The main ones:

1. First-party, cookieless, aggregate measurement in the existing D1 database, written by the existing Worker. No
   third-party analytics script by default. Cloudflare Web Analytics stays an optional cross-check the owner can
   switch on.
2. Analytics writes are capped per Worker instance per day, so they can never use up the D1 free-tier write
   allowance that the logbook and logins depend on. Analytics fails silently and never breaks a request.
3. Paid bookings are counted only from authoritative records: a verified Stripe webhook (switched off until the owner
   adds the webhook secret) or a booking the owner records by hand. A click on "Book now" is reported as booking
   initiation, never as a sale.
4. Financial figures are entered by the owner and marked actual or estimate. Nothing is invented. VAT treatment is
   recorded per line and defaults to "not recorded".
5. The URL /training/ stays; only its labels and content change (no redirect needed).

## Files changed

See each commit (`git show --stat <commit>`) and the phase documents. Areas: `worker/` (metrics, bookings, business
dashboard, departments, review, verification), `migrations/0014` and `0015`, `build.js`, `data/`, `src/assets/`, `src/app/`
(review states, translations), `test/` (three new files), `docs/commercial-2026/`, `video/`.

## Tests

| When | Command | Result |
|---|---|---|
| Baseline, before any change | `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs` (Git Bash) | 315 tests: 311 pass, 3 fail, 1 skipped |
| End of project, Windows checkout | same | 359 tests: 355 pass, 3 fail (same CRLF cases), 1 skipped |
| End of project, LF clone of `60fdf92` | same, `core.autocrlf=false` | 359 tests: 358 pass, 0 fail, 1 skipped |

Notes on the baseline:
- `npm test` runs 0 tests on Windows: cmd.exe passes the quoted glob `'test/*.test.mjs'` through literally. Run the
  command above from Git Bash, or on Linux or macOS, where `npm test` works.
- The 3 baseline failures are tests that match source text with LF-only regular expressions. This Windows checkout
  has `core.autocrlf=true`, so the files have CRLF line endings. They are not caused by this project.

## Known limitations

See `09-limitations.md`.

## Outstanding actions for the owner

See `10-deployment-approval.md`: merge, migrations 0014 and 0015, deploy, Stripe webhook, privacy notice and DPIA
screening, store build, film approval, external contact, directory permissions. Nothing there has been done.

## Local commits

| Commit | Summary |
|---|---|
| `e4d7aef` | Business analytics foundation, private dashboard and pathway-specific supervision authority |
| `c01f74f` | Tailored training website, review states, supervisor directory filters and tests |
| `60fdf92` | Films source, dashboard fixes, remaining documents |
| (final commit) | Final test figures, render results and file locations |
| `bc53be1` to `af31089` | Films version 2, Windows test fixes, Stripe test-mode separation, deployment plan |
| `4f1d4b3`, `f60dce9` and the record commit | Films version 3 source, results, assessment, logo and sound recommendations |

Nothing has been pushed (no remote access).
