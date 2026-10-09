# Wavelength 1.0.12: backend compatibility, web deployment plan and rollback

Nothing in this document has been done to production. No deployment, no migration and no Cloudflare change was made
from the development workspace.

## 1. Database

**No new migration.** 1.0.12 uses only tables and columns that already exist in production:

- `supervisor_links`: `status`, `ended_at`, `ended_by`, `ended_reason`, `claimed_at`, `accepted_at`, `invite_hash`,
  `via`. These come from migrations up to `0012_supervisor_lifecycle.sql`, which is applied to production (6 October 2026).
- `audit_events` (0012) for the `link.end` audit row (written only when the link actually ends).
- `signoffs`, `assessments`, `logbook_entries` for the counts and the trainee record lists.

`lifecycleReady()` and `verificationReady()` still guard the 0011 and 0012 columns, so a database without them keeps
working (the stage falls back to the older wording). The test suite applies every migration in `migrations/` and passes.

## 2. API changes (all additive; /api/app/* stays backwards compatible)

| Route | Change | Older apps (1.0.11 and earlier) |
| --- | --- | --- |
| `POST /api/app/supervisors/remove` | Who may end a link is now checked: the learner, the linked supervisor, or the confirmed holder of the invited email. Anyone else gets 404. The guarded update, its `link.end` audit row and the returned requests are one D1 batch, so it ends exactly once and never without its audit row. The response adds `ended`, `already`, `link {id, status, endedAt, endedBy, reason}` and `returned`, and keeps `ok`. A supervisor can now decline an invitation sent to their email before accepting it, which did nothing before. | Still receive `ok: true` and ignore the new fields; their remove and decline buttons work as before. One change: a link id the caller has no part in used to answer `ok: true` silently and now answers 404, which no legitimate app request produces. |
| `POST /api/app/supervisors/add` | Inviting again after an ended link clears the old claim and acceptance, so the supervisor must accept again. | Same request and response. Re-invited supervisors now see a pending invitation rather than an instant restoration (a security fix). |
| `GET /api/app/supervisors` | Each link adds `stage`, `pending` (requests waiting with that supervisor), `invitedAt` and `acceptedAt`. A new `ended` list holds links ended in the last 90 days. | Extra fields are ignored. |
| `GET /api/app/supervise/learner?id=` | Adds `link {id, since}` and `counts {scans, supervised, signed, assessments, requests}`. | Ignored. |
| `GET /api/app/supervise/learner/scans?id=&filter=&type=&month=&module=&offset=` | **New.** Gives the linked supervisor the trainee's written entries, filtered, 50 to a page. It returns no images and only works for a current link. | Not called. |

Server enforcement: after a link ends, every supervisor route (`supervise/learner`, `supervise/learner/scans`,
dashboard sign-off and assessment) refuses that learner. Covered by `test/supervision-1012.test.mjs`.

No Worker variable changes. `SUPERVISOR_APPLY` stays "true", and `SUPERVISOR_APPROVAL_REQUIRED`, `PROFESSIONAL_VERIFY`,
`DIRECTORY_PUBLIC` and `SUPERVISOR_SEARCH` stay as they are. The app's wording follows the live switches.

## 3. Website changes in the same commit range

- `/app/` (the web logbook) gets every 1.0.12 app change on deploy. These include the Save Scan behaviour already used on
  Android, the editor, the Still to do carousel, guides and supervision. The website and Android now behave the same.
  The difference before was only that `main` had not been deployed since the change, not a platform branch in the code.
- `build.js` also writes `dist/app/guides.js`, the in-app copy of the public guides. The public guide pages do not
  change.
- The service worker version changes with the build id, so open web sessions take the new shell on the next load
  (checked by e2e W4).

## 4. Web deployment plan (for the owner; not done)

1. Review the patch series and the review report.
2. Apply the patches to a branch from the current `main`. If `main` has moved since the seed (445dc66), resolve any
   conflicts and run `npm test`.
3. Run `npm test`, then `node build.js`. Check `node tools/shots.mjs <outdir>` at 390 px and 1440 px, as CLAUDE.md
   asks before pushing.
4. Merge to `main`. Cloudflare Workers builds and deploys automatically, and the Worker and website change together.
   No migration is needed beforehand.
5. Smoke test on the live site with a test account:
   - log a scan on /app/ and check it says "Scan saved and synced";
   - open Home > Still to do;
   - open Progress > Guides and accreditation;
   - with a second test account as supervisor, invite, accept, open the trainee tiles, then end supervision from each
     side;
   - check /verify/ still verifies an earlier SO- code.
6. Watch the Worker logs for 5xx on `/api/app/supervisors*` and `/api/app/supervise/*` for a day.

The store apps keep working against the new Worker, because every change is additive. **Ship the Worker first, then
the store builds.** A 1.0.12 app that meets an older Worker still works: the trainee tiles show counts without opening
lists, and ending supervision is confirmed by re-reading the links. But the tiles are only interactive once the Worker
is live.

## 5. Rollback

- **Website and Worker:** in the Cloudflare dashboard, Workers > wavelength > Deployments, roll back to the previous
  version. You can also revert the merge on `main` and let the build redeploy. There is no schema to roll back.
  - Links ended under 1.0.12 stay ended, which is correct.
  - The `ended` list and stage fields simply stop being sent.
  - 1.0.11 apps are unaffected either way.
- **Data written by 1.0.12:**
  - `supervisor_links` rows ended with reason `learner_removed`, `supervisor_declined` or `supervisor_removed`, and
    `audit_events` rows with action `link.end`. Both are readable by the older code.
  - Images with annotations keep the flattened picture as the main image, which 1.0.11 shows normally. The extra
    `base`, `annot` and `prov` fields stay on the phone, and 1.0.11 ignores them. A 1.0.11 restore of a 1.0.12 backup
    was tested (e2e B4).
- **Android:** keep the signed 1.0.11 (code 17) release. You cannot downgrade over 1.0.12 (code 18) without
  uninstalling, which deletes on-device images. Users should make an encrypted backup first, so prefer a fixed 1.0.13
  over a rollback.
- **iPhone:** stop the TestFlight or App Store build. The same downgrade limit applies.
