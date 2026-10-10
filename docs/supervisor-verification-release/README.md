# Supervisor verification fix: release package (10 October 2026)

| | |
|---|---|
| Release branch | `wavelength-supervisor-prod-20261010` (worktree `C:\Users\phira\Wavelength-Cloud\wavelength-supervisor-prod`) |
| Built on | `2dfd55e`, the source that is live |
| Release commit | `c9622f0` (plus this documentation commit) |
| Development branch | `wavelength-supervisor-qa-20261010`, which holds the fuller version for the commercial and Android lines. First report: `docs/supervisor-qa-20261010/README.md` on that branch |

Nothing has been deployed, no production record changed, no live email sent, and nothing purchased.

## 1. Confirmed production findings
Read-only queries ran through the Cloudflare connector, after your authorisation on 10 October 2026. The results below contain no names, emails or registration numbers.

**Deployed Worker.** `wavelength-site` was last modified on 7 October 2026 at 15:53:33 UTC, one minute after `main` `2dfd55e` (PR #27). The production audit row written on 10 October has exactly the shape `main`'s code writes (`route: "direct"`, no capacity). Production's `supervisor_approvals` table has **no `capacity` column**, so migration 0015 is not applied, and migration 0014 is not either.

**The reported record:**
- **Application #1** (kind initial): sent on 7 October at 13:50 UTC; more information requested at 15:05; resubmitted at 15:07; status still **`submitted`**.
- **8 current approvals** for the same account, all created on **10 October at 18:03 UTC** from the **person page**. Every one has `application_id` empty, and audit `approval.grant` records `route: "direct"`. Scopes:
  - RCEM, all modules
  - FAMUS, all modules
  - EUSEM: Chest (heart and lung), Ocular, Procedures
  - EUSEM advanced: Chest, Ocular, Procedures
- **No credential basis.** The audit records `basis: 0`: the approvals rely on none of the 5 credentials the team verified for this account. So a credential lapse would not pause them.
- **Permissions were granted:** the 8 approvals are live and current.
- **Email:** there is **no `app_approved` row** in the outbox. The approval email was **never generated**, so nothing reached ZeptoMail.
- **Email system health:** every other supervisor email was accepted by ZeptoMail: application received (1), sent to administrators (2), more information (1), resubmitted (1). The token and the sending domain work.
- **Duplicates:** none. Production has exactly one person with approvals, and the 8 event rows match the 8 approvals.
- **Links:** this person supervises 2 active links (1 claimed) and 1 ended link.
- **Daily job:** `supervisor-daily` runs, and its last run (10 October at 05:15) was `ok`.

**Not confirmed:** whether the approver's name matches the supervisor (self-approval). The query that compared the reviewer name with the account name was refused by the permission classifier, and I did not repeat it. You told us the approval was your own. After deployment, the Needs attention list detects it from `approved_by`, if the typed reviewer name matches the account name.

**Live only in development (not in production):**
- the GMC manual register review;
- approval roles or capacities and the supervision policy (migration 0015);
- the 1.0.9 to 1.0.14 app and Worker work, including relationship stages and ending supervision from either side;
- business analytics, bookings and directory review (commercial branch, migration 0014).

## 2. Root causes and evidence
1. **Two approval routes.** On `main`, `appr_add` (the person page) inserted approvals and activated links only. It did not decide the open application and queued no supervisor email (`worker/supervisors-admin.js` at `2dfd55e`, around line 456). The application route did both. Evidence: application #1 still `submitted`, `route: "direct"`, and no `app_approved` row.
2. **Contradictory app status.** `GET /api/app/supervisor` returned `standing: "active"` (from the 8 approvals) and `application.status: "submitted"`. The app drew both: the navy "Wavelength-approved supervisor" panel, and "Your supervisor application is being reviewed".
3. **Mandatory notes.** The approval forms marked the note `required`, and the server refused an approval without one.
4. **Missing email.** It follows from cause 1. The email system itself works.

## 3. Production-compatible fixes (commits `d353e5a`, `bfd8eea`, `c9622f0`)
How it was ported: each file was three-way merged (QA starting point → QA result, onto `2dfd55e`) or ported by hand. Commercial code, 1.0.9 to 1.0.14 code, migrations and data files were all left out. Approval roles do not exist in production, so every approval is in the supervisor role.

- **One approval routine** (`grantApprovals`) for the application's **Approve** and **Confirm renewal** and for the person page:
  - it decides any open application in the same step;
  - it queues the approval email in the same D1 batch as the approval;
  - it activates waiting links;
  - it records the reviewer, route, scopes, credential and evidence IDs, status before and after, self-approval, and whether a note was given (`audit_events`, `verification_events`);
  - a failed save undoes the decision and leaves no email;
  - repeated clicks and concurrent requests cannot duplicate approvals or emails (guarded update, unique live-approval index, unique outbox key).
- **Notes optional** for approvals (application, person page, credential). Reasons stay required for rejection, more information, revocation, reinstatement, lifting a block, ending the grace period, registration decisions and exemptions.
- **One verification state** (`worker/verification/status.js`). It is sent as `verification` by `GET /api/app/supervisor` and, with learner-only fields, by `GET /api/app/supervisors`. Every older field is kept.
- **Approval email** "Wavelength | Supervisor Verification Approved", with the approved pathways and modules in exact wording. Module names that contain commas are separated with semicolons.
- **Admin screens:**
  - "Before approving" checklist; requested pathways first; Approve as the main form.
  - Email status: Not generated, Queued, Submitting, Accepted by the email provider, Failed or Unknown. Never "delivered".
  - **Send again** for failed or unknown emails only.
  - **Record as approved** for an application left open by the old route. The email goes only if the box is ticked.
  - Needs attention lists open applications beside approvals, failed approval emails and possible self-approvals.
  - Reviewer name remembered for the session. A double-click is guarded. Results show in a banner.
- **Self-approval:**
  - recognised from the reviewer name, or the Access email;
  - needs an acknowledgement and a 20-character basis;
  - recorded, and listed until a *different* administrator records an independent review;
  - optional `SUPERVISOR_SELF_APPROVAL = "refuse"` (Worker variable, **unset** in this release) forbids it entirely.
- **Website app (`/app/`):**
  - compact card: small green check, **Verified Supervisor**, "Credentials and approved scope confirmed by Wavelength.", **More info**. No navy panel, no module list on the card;
  - More info: bottom sheet under 760×520 px, otherwise a pop-up beside the button. It shows pathways, modules, role, verified-on and approved-until dates, and, for the supervisor only, the credentials relied on and their expiry;
  - genuine pending items are shown apart ("Further application under review", "Renewal under review");
  - learner list: compact status with More info;
  - the supervisor list is read again when more than 30 seconds old;
  - `src/app/verified.js`; translations for 17 strings (machine-drafted).

## 4. Files
Release branch changes (31 files):
- **Worker:** `worker/supervisors-admin.js`, `supervisor-lifecycle.js`, `supervisor-apply.js`, `supervise.js`, `notify.js`, `audit.js`, `index.js`, new `worker/verification/status.js`
- **Admin shell:** `build.js` (double-click guard)
- **App:** `src/app/app.js`, `app.css`, `index.html`, `sw.js`, new `verified.js`, eight `i18n/*.json`
- **Tools:** `tools/i18n-extract.mjs`, `tools/i18n/strings.json`
- **Tests:** `test/credentials.test.mjs` and `test/supervisor-lifecycle.test.mjs` (intended wording); new `supervisor-verification-qa.test.mjs`, `supervisor-verification-security.test.mjs`, `verified-view.test.mjs`
- **Browser checks:** `tools/e2e-verified.mjs`, `tools/e2e-older-app.mjs`

Commits:

| Branch | Commits |
|---|---|
| Release | `d353e5a`, `bfd8eea`, `c9622f0` |
| QA | `77d3995`, `f9ec1d1`, `54e28f5`, `0535123`, `e5a0fe9`, `449ca11` |

## 5. Test results

| Run | Result |
|---|---|
| `main` baseline | 187 tests, all pass |
| **Release branch** | **222 tests, all pass.** 21 new approval and state tests, 1 self-approval refusal test, 1 failed-save test, 5 security tests, 7 app-reading tests |
| Bundle | `wrangler deploy --dry-run`: bundles cleanly (799 KiB, same bindings and variables as now); nothing uploaded |
| Browser, website app with the new Worker (`UI=web`) | 274 checks pass |
| Browser, patched Android-line app with the new Worker (`UI=android`) | 276 checks pass |
| Browser, older apps with the new Worker (`tools/e2e-older-app.mjs`) | Both pass: the live website app (`2dfd55e`) and the unpatched Android tip (`5329d8d`). After a person-page approval they show approved, never "being reviewed", with no console errors. One cold-start timeout on the first run did not reproduce in two strict re-runs |
| QA branch | 395 tests: 394 pass, 1 skipped (baseline skip). Browser 284 checks pass |
| Android tip (`5329d8d`) export with the app patch | 377 tests: 376 pass, 1 skipped (baseline 370 with 369 passing) |
| Android tip with the app patch and the Worker patch | 405 tests: 404 pass, 1 skipped; browser 284 pass |

The tests cover:
- approval through both routes, with and without notes;
- application closure;
- verified, pending, partial, several pathways, renewal under review, paused by an expired credential, rejected and revoked;
- module eligibility; a GMC registration alone grants nothing;
- More info content and placement (phone, folded and unfolded Z Fold7, desktop), keyboard, focus, Escape, folding while open, light and dark;
- learner-only fields;
- email creation, refusal, unknown, missing token, retry by the daily job, resend once, no automatic duplicate;
- failed save leaves nothing behind;
- duplicate clicks and concurrent requests;
- audit contents;
- self-approval acknowledgement, independent review and refusal;
- authentication: no session, volunteer session, cross-site post;
- reviewer cookie scope and escaping; applicant-text escaping;
- older-app compatibility; offline and reconnection.

## 6. Remaining blockers
None for the code. To finish:
- **Production deployment needs your approval** (section 12).
- One read-only query, the self-approval name comparison, was refused by the session's permission classifier.
- No physical Android device test from this session; that belongs to the Android release checks.

## 7. Recommended deployment strategy
**Deploy the release branch (based on `2dfd55e`) directly with Wrangler.** It holds only the fix. The QA branch and the Android Fixes branch both carry undeployed commercial work and migrations 0014 and 0015, so neither should be deployed for this fix.

Cloudflare Workers Builds also deploys on every push to GitHub `main`. GitHub is unavailable, so after deploying, keep local `main` in step: the release branch is a straight line on top of `main`, so `git merge --ff-only` works. That way no later push of an old `main` can undo the fix.

**Runbook** (from `C:\Users\phira\Wavelength-Cloud\wavelength-supervisor-prod`, logged in to Wrangler as the owner):
1. `git log --oneline -1`: expect `c9622f0` or the documentation commit after it. `git status`: expect a clean tree.
2. `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`: expect 222 passing. (`npm test` finds no files on Windows because of its quoted glob.)
3. `node build.js`
4. `npx wrangler deploy --dry-run`: expect the same bindings as today.
5. **Back up first.**
   - `npx wrangler d1 time-travel info wavelength-volunteers`: note the bookmark.
   - `npx wrangler deployments list`: note the current version ID (the 7 October deployment).
6. **Deploy (needs approval):** `npx wrangler deploy`
7. **Smoke test:**
   - `https://thewavelength.co.uk/app/verified.js` returns 200.
   - `/admin/supervisors/?tab=attention` loads and lists application #1 as "still open although they hold a current approval".
   - Run `post-deploy-checks.sql` (read-only).
8. **Reconcile the reported record (needs approval for the email).** Open `/admin/supervisors/?app=1`. The banner reads "Already approved: RCEM pathway, supervisor: all RCEM modules; …". Choose **Record as approved**:
   - box unticked: no email;
   - box ticked: one email, previewed in section 10.

   Afterwards C1 in `post-deploy-checks.sql` returns no rows, and the supervisor's app shows only "Verified Supervisor".
9. **Independent review (section 11):** a second administrator records it on the person page.
10. **Keep `main` in step:**
    - Confirm no worktree has `main` checked out (`git worktree list`) and that `main` is still `2dfd55e`.
    - From this worktree, run `git branch -f main wavelength-supervisor-prod-20261010`. This moves a shared branch, so it needs approval (section 12).
    - Push to GitHub once it is available.

**Approval route after deployment:** the person page and the application page now behave identically. No configuration change is needed: `SUPERVISOR_APPROVAL_REQUIRED` stays `"false"` and `SUPERVISOR_SELF_APPROVAL` stays unset.

## 8. Backup and rollback
- **Code.** `2dfd55e` is in local Git (`main`, and every worktree's history) and is the deployed version. The release is three commits on top of it.
- **Worker.** `npx wrangler rollback` returns to the previous version (the 7 October deployment, ID noted in step 5). Or deploy `2dfd55e` again: `git -c core.autocrlf=false worktree add ..\wavelength-rollback 2dfd55e`, then `node build.js`, then `npx wrangler deploy` there.
- **Database.**
  - **No migration and no schema change.** The fix writes only rows the current schema already has: approvals, application decisions, outbox rows and audit rows. They stay valid if the code is rolled back. The old code ignores the new audit fields.
  - If an approval email is still queued during a rollback, the old template would send it without the module list. The daily job sends it within a day.
  - Time Travel: D1 storage version `production`, confirmed from the database's metadata. A bookmark is recorded in step 5. A restore (`npx wrangler d1 time-travel restore wavelength-volunteers --bookmark=<id>`) is destructive and is needed only if records themselves went wrong. Not expected.
  - Bookmark integrity cannot be checked until step 5 is run, because Wrangler access from this session is a dry run only. The earlier documented recovery point (`2026-10-06T22:28:49Z`) stays inside the free plan's 7-day Time Travel window only until about 13 October 2026. Use the fresh bookmark from step 5.
- **Email configuration.** Unchanged: `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_API`, `MAIL_FROM`. Nothing to roll back.

## 9. Android integration status
In `android-integration/`. Never applied to another session's worktree.

| File | Use |
|---|---|
| `app-ui.patch` and `app-css-block.css` | The display, for the next Android release (1.0.15) |
| `worker-android-line.patch` | The fix in the Android line's own Worker. That Worker carries the 1.0.12 stages and the commercial work, so it needs the QA-branch version of the fix, not this production port |

Both apply cleanly to a fresh export of the latest Android tip, `5329d8d`. The patched tree passes 405 tests (404 pass, 1 skipped), and the browser check passes in full.

Steps, inside that worktree:
1. `git -c core.autocrlf=false apply <patch>`
2. Append the CSS block to `src/app/app.css`.
3. `python3 tools/i18n-add.py tools/i18n/batch-supervisor-qa.json`, then convert the eight `src/app/i18n/*.json` files back to LF.
4. `node tools/i18n-extract.mjs`, then `node build.js`, then the tests.

**Compatibility:**

| Combination | Result |
|---|---|
| New production Worker with installed and older apps | Works: they keep their old display, and it is now consistent |
| New production Worker with the patched Android app | Works (276 browser checks) |
| Patched Android app with today's live Worker | Works: it falls back to the older fields without overclaiming |

**Caution:** the Android Fixes branch contains the commercial work. Its Worker must not be deployed for this fix.

## 10. The missing confirmation email: ready for a controlled send
Yes. After deployment, **Record as approved** on application #1, with the email box ticked, queues exactly one email (key `app_approved:1`) and sends it through ZeptoMail. The admin page then shows "Approval email: Accepted by the email provider" or the failure. It is not sent unless you tick the box. The text, from the production scopes, with the first name left out here:

> **Wavelength | Supervisor Verification Approved**
>
> Your supervisor verification has been approved by Wavelength.
>
> Your approved pathways and modules are:
>
> - RCEM pathway, supervisor: all RCEM modules.
> - FAMUS pathway, supervisor: all FAMUS modules.
> - EUSEM pathway, supervisor: Chest: heart and lung; Ocular; Procedures.
> - EUSEM advanced pathway, supervisor: Chest, advanced; Ocular, advanced; Procedures, advanced.
>
> Your approval runs until … We will remind you to renew from 60 days before.
>
> Your verified status is available in your Wavelength profile, under Me, Wavelength supervisor.
>
> You may review eligible supervision requests in accordance with the relevant training requirements.
>
> This is Wavelength's own verification. It is not accreditation or endorsement by RCEM, FAMUS, FUSIC, the GMC or any other body.
>
> Thank you for supporting ultrasound education.
>
> Wavelength · Tune In · Gain Clarity
>
> Button: "Open your Wavelength profile"

## 11. Independent verification required
- The 8 approvals were made from the person page on the shared admin login, relying on **no credentials**. They include **all RCEM modules** and **all FAMUS modules**.
- If they were self-approved, as reported, a second administrator should, before or soon after deployment:
  - confirm identity and the GMC registration;
  - check that each approved scope is supported by the verified credentials and evidence;
  - record the result with **Record independent review** on the person page.
- If a scope is not supported, revoke that scope deliberately, with a reason. Nothing is revoked automatically.
- **Recommended:** give the second administrator their own login, or switch on Cloudflare Access so decisions are recorded under verified emails. Then decide whether to set `SUPERVISOR_SELF_APPROVAL = "refuse"` for the future.

## 12. Production actions needing your approval (none done)
1. Deploy the release branch (`npx wrangler deploy` from the release worktree, runbook step 6), after recording the D1 bookmark and the current Worker version (step 5).
2. Run the read-only `post-deploy-checks.sql` (or allow me to).
3. **Record as approved** on application #1, choosing **with or without** the confirmation email (section 10).
4. Name the second administrator for the independent review, and give them a login or Access.
5. Optionally set `SUPERVISOR_SELF_APPROVAL = "refuse"` in `wrangler.jsonc` vars (a further deployment).
6. Move local `main` to the release commit after deployment, and push to GitHub when it is available.
7. Approve the Android workstream's integration of the bundle for 1.0.15, with the phone checks.
