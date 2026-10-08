# Wavelength 1.0.9: backend compatibility, deployment and rollback

Date: 8 October 2026. **Nothing was deployed.** No production system, database or Cloudflare setting was touched.

## 1. Does 1.0.9 need a server change?

**No.** Android 1.0.9 is fully functional against the current production Worker. One server change exists. It is
optional and backward compatible, and it only improves what the app can tell the learner when the server refuses an
entry.

| Server change | Needed by 1.0.9? | Effect if not deployed |
| --- | --- | --- |
| `POST /api/app/sync` also returns `rejected: [{id, reason}]` (`worker/app.js`, `syncPost`, 13 lines) | No | An entry the server refuses still shows "Not synced" on the phone, and is not resent until it is edited or Retry sync is pressed. It shows the general reason "not accepted" instead of the specific one (too long, missing date, and so on) |

There is no database migration, no new binding, no new secret and no `wrangler.jsonc` change. Nothing in 1.0.9 is
switched on by a server flag. The GMC registration review and Wavelength Verified wording are unchanged.

## 2. How compatibility was tested

"Production" here means commit **2dfd55e** (main). Your recovery archive labels it as production
(`wavelength-site-source-main-2dfd55e-production.tar.gz`). The live Worker on Cloudflare was not read, so it is
**inferred**, not checked, that the deployed code matches 2dfd55e.

Between 2dfd55e and the 1.0.8 source (3dbdf3f), only GMC and verification files changed. Nothing changed in the app's
login, sync, `/me`, sign-off or assessment endpoints.

Method:
1. The Worker at 2dfd55e was run locally on port 8789. It used every migration, an in-memory database and dummy
   accounts.
2. The full 1.0.9 browser suites ran against it.
3. Results are in `docs/release-1.0.9/compat-production-2dfd55e/`.

| Suite | Against 2dfd55e |
| --- | --- |
| e2e-native (store-app basics) | All pass |
| e2e-offline (start-up and sync) | All pass except Y5. Y5 is expected: it checks the optional `rejected` field. Y8a (the app keeps a refused entry unsynced and flags it) passes |
| e2e-backup | All pass |
| e2e-about | All pass |
| e2e-upgrade (1.0.8 data, then 1.0.9 on the same storage) | All pass, including a second session seeing the offline scan |
| e2e-resilience | All pass |

Older apps are not affected by deploying: 1.0.8 ignores the extra `rejected` field (it reads `saved` only).

## 3. If Fero chooses to deploy the Worker change

**Approval point:** deploying is a production change. It needs Fero's explicit go-ahead, and Fero (or someone Fero
names) runs it. This environment will not run it: the brief rules out deploying Workers.

Steps, from the release commit on Fero's own machine with Wrangler logged in:

1. `git checkout claude/release-1.0.9` (or the tag Fero puts on the reviewed commit).
2. `npm ci && npm test`. All tests must pass.
3. `npx wrangler deployments list`. Note the current version ID; it is the rollback target.
4. `npx wrangler deploy --dry-run`. Check that only the Worker script changes, with no binding changes.
5. `npx wrangler deploy`.
6. Smoke test with a test account (not a learner's):
   - `POST /api/app/sync` with one valid dummy entry: `saved` holds it and `rejected` is `[]`.
   - Send one entry with no date: it is in `rejected` with "This entry is missing its application or date.".
   - Delete the dummy entries afterwards.
7. Watch `npx wrangler tail` for errors for a few minutes.

Because the branch also carries the 1.0.8-era GMC work (3dbdf3f), deploying it deploys that too. That work was
reviewed before 1.0.8 was signed but has not been deployed (memory note: "GMC server-side Worker deploy deferred").
Fero should decide whether to deploy both together, or cherry-pick only the `syncPost` change onto 2dfd55e.

## 4. Rollback

- `npx wrangler rollback <version-id from step 3>`. The change only adds a response field and stores nothing new, so
  rolling back leaves no data to clean up.
- Apps keep working either way: 1.0.9 handles a missing `rejected` field, and 1.0.8 never reads it.

## 5. Order of release

The app and the Worker change are independent:
- 1.0.9 can be released with or without the Worker change.
- The Worker change can be deployed before or after 1.0.9.
- Do not raise `APP_MIN_VERSION` for 1.0.9. Nothing requires learners to update.
