# Runbook: applying D1 migration 0011 (verification) to production

Workflow: `.github/workflows/d1-migration-0011.yml`. Script: `tools/d1/migrate-0011.sh`. The migration file is `migrations/0011_verification.sql` from PR #7 commit `e6ebfdc` (reviewed), pinned by SHA-256.

## Before running
1. The owner approves applying 0011, and this workflow PR is reviewed and merged. A `workflow_dispatch` workflow can only be run once it is on `main`.
2. Optional but recommended: in Settings > Environments > `production-d1`, add a required reviewer. GitHub creates the environment on the first run if it does not exist, and without protection rules unless you add them.

## Run
Actions > "Apply D1 migration 0011 (production)" > Run workflow on `main`, then type `APPLY-0011-TO-PRODUCTION`.

The run:
- **Refuses** when:
  - The confirmation text, the branch, the token or the account id is wrong.
  - The migration file differs from the reviewed one.
  - `learners.email_status` or any other part of 0011 already exists.
  - The Time Travel bookmark cannot be read.

  Each refusal stops before any SQL is run.
- **Records** the learner count, and other row counts for comparison.
- **Records the recovery reference immediately before migrating:** the UTC time and the D1 Time Travel bookmark. Both appear in the run summary and in the `d1-0011-recovery-reference` artifact (kept 90 days).
- **Applies** only `migrations/0011_verification.sql`.
- **Verifies**, failing the run on any mismatch:
  - The counts are unchanged.
  - Every learner is `legacy_unverified` and none has `email_verified_at`.
  - All 7 new tables exist.
  - All 6 new columns exist.
  - The key indexes exist.

## After a successful run
- Copy the recovery timestamp and bookmark into issue #2.
- Then merge PR #7 and check the deploy.
- `PROFESSIONAL_VERIFY` and `DIRECTORY_PUBLIC` stay off. This workflow never changes Worker settings.

## If the run fails
- **Before "Applied":** nothing changed. Fix the cause and run again.
- **During or after "Applied":**
  - Do not rerun. The preflight will refuse a partly migrated database anyway.
  - Read the error, and post it and the recovery reference in issue #2.
  - Restoring discards every write since the bookmark: `wrangler d1 time-travel restore wavelength-volunteers --bookmark=<bookmark>`. It needs owner approval and is not automated here.
  - The Worker on `main` tolerates 0011 being absent, and the PR #7 Worker tolerates it being present or absent.

## Local test
From a scratch copy holding `wrangler.jsonc` and `migrations/`:
1. Apply `0001` to `0010` with `npx wrangler d1 execute wavelength-volunteers --local --file <file>`.
2. Run `WRANGLER="npx wrangler" bash tools/d1/migrate-0011.sh --local`.

Rerunning must refuse.
