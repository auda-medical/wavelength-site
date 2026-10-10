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

Updated at each commit. See "Local commits".

## Tests

| When | Command | Result |
|---|---|---|
| Baseline, before any change | `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs` (Git Bash) | 315 tests: 311 pass, 3 fail, 1 skipped |

Notes on the baseline:
- `npm test` runs 0 tests on Windows: cmd.exe passes the quoted glob `'test/*.test.mjs'` through literally. Run the
  command above from Git Bash, or on Linux or macOS, where `npm test` works.
- The 3 baseline failures are tests that match source text with LF-only regular expressions. This Windows checkout
  has `core.autocrlf=true`, so the files have CRLF line endings. They are not caused by this project.

## Known limitations

Collected in `09-limitations.md` at the end of the project.

## Outstanding actions for the owner

Collected in `10-deployment-approval.md` at the end of the project.

## Local commits

Listed at the end of the project.
