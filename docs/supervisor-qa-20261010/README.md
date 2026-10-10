# Supervisor verification QA: report (10 October 2026)

Branch `wavelength-supervisor-qa-20261010`, worktree `C:\Users\phira\Wavelength-Cloud\wavelength-supervisor-qa`,
started from `59b802c`. Local work only: nothing deployed, no migration applied, no production data read or changed,
no live email sent, no store build made. GitHub was not used; this file stands in for the issue #2 record.

## 1. Why the app said "verified" and "under review" at the same time

**Cause (confirmed in the code that is live):** the admin console has two ways to approve a supervisor.

| Route | Where | Before this work |
|---|---|---|
| Application decision | `?app=<id>`, button **Approve** | writes the approvals, marks the application `approved`, queues the approval email |
| Person page | `?id=<person>`, button **Approve as Wavelength supervisor for these scopes** (`appr_add`) | writes the approvals **only**. The open application stays `submitted`, and no email goes to the supervisor |

The app's status screen draws two independent things from `GET /api/app/supervisor`:
- the card from `standing`, which is `active` as soon as one current approval exists ("Wavelength Verified Supervisor", the navy panel, with the module list); and
- a second card from the open `application`, which is still `submitted`: "Your supervisor application is being reviewed."

So both statements came from real records. The records disagreed because the person-page route never closed the application.

Ruled out:
- **Multiple applications:** the database allows one open application per person (unique index `sup_app_one_open`).
- **Stale cache:** `/api/app/*` answers `Cache-Control: no-store`, and the status screen reads the server on every visit.
- **Different endpoints calculating differently:** both cards come from the same response.
- **An Android-only display bug:** the same logic is in `main`, which is what the website serves.
- **A partial deployment:** the live Worker `wavelength-site` was last deployed on 7 October 2026 at 15:53 UTC, which matches `main` at `2dfd55e` (PR #27). That code has exactly the behaviour above.

**Not confirmed against live data.** A read-only query of production D1 was blocked by this session's permission rules, so I did not retry it. `production-diagnosis.sql` holds read-only queries for you to run. Q1 lists every application left open beside a current approval. Q2 shows whether the approval was made from the person page (`application_id` empty).

## 2. Why no approval email arrived

The trace runs from the saved decision to the provider. Approval writes rows, then the outbox row (`notification_log`), then `deliver()`, then ZeptoMail `POST cpaas.zoho.eu/v1.1/email`, then the row is marked `sent`, `failed` or `unknown`.

- **Person-page route:** no supervisor email was ever generated (**Not generated**). Only the "your supervisor is now active" emails to waiting learners were queued. This is the confirmed code defect, and the most likely explanation if the approval was made on the person page, which is natural when someone approves their own record.
- **Credential approval** ("Approve credential") and **GMC registration checks** never send email in any version. If "approved credentials" meant those buttons, no email was expected. Those are steps before supervisor approval.
- **Application route:** the email is queued in the same batch as the approval and sent straight away. If it did not arrive, Q3 will show the outbox status:
  - `failed` with "email sending is not set up": the `ZEPTOMAIL_TOKEN` secret is missing.
  - `failed` with "refused by the email provider": ZeptoMail refused it (domain or API key).
  - `unknown`: no answer from the provider.
  - `sent`: ZeptoMail accepted it, so look in the ZeptoMail log or the junk folder.
- **Delivered, bounced and rejected cannot be known** by Wavelength today. There is no ZeptoMail webhook or bounce report. `sent` means "accepted by the provider" and is now labelled exactly that. ZeptoMail's own log (Zoho CPaaS, EU) is the only place to confirm delivery or a bounce.
- **Sending domain:** CLAUDE.md records DKIM and the bounce CNAME as verified on 5 October 2026. I could not check them from here.

Unresolved until you run `production-diagnosis.sql` (Q2 to Q5) and check the ZeptoMail log: which route was used for the reported approval, and whether the token was present at the time.

## 3. What was changed

### One authoritative verification state
`worker/verification/status.js` (`verificationView`), loaded by `verificationOf()` in `worker/supervisor-lifecycle.js`. It is pure, derived on every read, and nothing new is stored.

States, in order of precedence:

| State | When |
|---|---|
| `verified` | At least one current approval |
| `renewal_review` | Every current approval is inside its renewal grace period |
| `paused` | Approvals exist, none current (a lapsed registration, credential or email) |
| `more_info` | Open application, team asked for more information |
| `pending` | Open application, sent |
| `revoked`, `expired`, `withdrawn` | How the last approval ended |
| `rejected` | Last application rejected |
| `none` | Nothing current or pending |

- Approved groups are by pathway and role: modules, verified-on date, approved-until date.
- Genuine pending items are listed separately: a renewal, a further application, an unsent draft or a credential being checked. They are never merged into the approved groups and never hidden.
- Audiences:
  - `self` (the supervisor): everything above, plus the credentials the approval relies on and their expiry.
  - `learner`: state, pathways, modules, role and dates only. Never pending items, lapse reasons, blocks, credentials, notes, registration numbers or evidence. A supervisor who is not verified now reads `not_verified` or `pending`.
  - `admin`: same as `self`.
- Sent as `verification` by `GET /api/app/supervisor` (self) and `GET /api/app/supervisors` (each linked supervisor at the `approved` stage, learner audience; `me.verification` for the account itself). The older fields stay for installed apps.

### Both approval routes now behave the same
`grantApprovals()` in `worker/supervisors-admin.js` is used by the application's **Approve** and **Confirm renewal** buttons and by the person page.

- It decides any open (sent or more-information) application in the same step, so "verified" and "under review" can no longer come from one decision.
- It queues the approval email in the same D1 batch as the approval rows, so the email exists only if the approval was saved.
- It activates links that were waiting for the decision.
- It records automatically, in `audit_events` and `verification_events`:
  - who decided (admin login plus reviewer name, or Access email) and when;
  - the route;
  - the approved pathways and modules, and the role;
  - the credential IDs relied on, and the evidence IDs (application files and those credentials' files);
  - registration exemption;
  - status before and after;
  - whether it was a self-approval, and whether a note was given (not the note's text).

### Optional notes
Approval notes are optional on the application (**Approve**), on the person page and on **Approve credential**. They sit behind "Add a note (optional)". These still require a reason: reject, ask for more information, revoke, revoke all, reinstate, lift a block, end the grace period, reject or mark a registration not current, a GMC restriction decision, and a registration exemption.

### Simpler administration
- **Before approving** checklist: email, professional registration, credentials.
- Requested pathways are open with their requested modules pre-ticked. Other pathways sit behind one toggle.
- "Verified role" select, with credentials pre-ticked from the application.
- **Approve** is the one main form. Ask for more information, reject, end the grace period and send the receipt are under "Other decisions".
- The reviewer's name is remembered for 12 hours (`wl_reviewer` cookie, supervisor console only). With Cloudflare Access the field is replaced by the verified email.
- The result of every action shows in a banner: green when it worked, amber when the approval email failed.
- A double-click disables the button at once (static admin shell). The real protection is server-side: a guarded application update, the unique live-approval index and unique outbox keys.

### Approval email
- Subject "Wavelength | Supervisor Verification Approved" ("… Renewed" for renewals), from the approval rows just written. Template `app_approved` in `worker/notify.js`.
- It lists each approved pathway, role and module, for example "FAMUS pathway, supervisor: Thoracic and DVT."
- It gives the approved-until date and any learners now active, links to the Wavelength profile (`/app/#/supervisor`), and says it is Wavelength's own verification, not accreditation or endorsement by RCEM, FAMUS, FUSIC, the GMC or any other body. It ends "Tune In · Gain Clarity".
- Duplicates: one key per decision (`app_approved:<application>`, or `app_approved:direct:<person>:<time>`). A repeated decision changes nothing and sends nothing.
- Retries: a refusal or a missing token is `failed` and retried by the daily job, up to three attempts. No answer is `unknown` and is never retried automatically.

### Administrator notification status and resend
- Shown on the application page, on the person page and under Needs attention: Not generated, Queued, Submitting, Accepted by the email provider, Failed (with the error), or Unknown. Delivered is never claimed.
- **Send again** is offered only for `failed` or `unknown` emails whose content is still held. It is audited, and returns you to the page you came from.

### Repair for records left by the old route
- The application page explains "Already approved: …" and offers **Record as approved (no change to approvals)**. The email goes only if you tick the box. It is unticked by default, so no corrective email reaches an existing user unless you choose it.
- Such applications are listed under Needs attention.

### Self-approval
`looksLikeSelf()` recognises a reviewer who matches the applicant:
- with Access: the same email;
- otherwise: the same name, a near match (initials or middle names), or the person's first or family name alone.

When it matches:
- approval needs a "this is my own status" tick and a reason of 20 characters or more (the independent evidence);
- the decision is recorded as a self-approval;
- the approval is listed under Needs attention until a different administrator records an independent review. Neither the supervisor nor the original approver can record it.

Approvals made before this check existed are found from `approved_by`. Nothing is revoked automatically. The in-app guide said "Nobody can approve themselves", which the code never enforced. It now describes the safeguard.

### Compact Verified Supervisor display (app)
- The supervisor's own status, and a learner's view of a linked supervisor, show one compact card: a small green check-circle, **Verified Supervisor**, "Credentials and approved scope confirmed by Wavelength.", and **More info**.
- No navy panel and no green background. Pathway names and module lists are not on the card.
- A supervisor who is not verified gets the same quiet card with a coloured dot and the state ("Application being reviewed", "Paused", and so on).
- In the learner's list, a verified supervisor shows only the status line. Search results show the line and More info.
- A verified supervisor's genuine open item reads "Renewal under review", "Further application under review" or "Unsent application draft", with "Your current approval is not affected." It never says "Your supervisor application is being reviewed".

### More info
- Content, grouped by pathway:
  - verified role, approved modules, verified-on date and approved-until date;
  - for the supervisor only: the credentials relied on, with their expiry, and anything in progress under "Also in progress", kept apart;
  - the statement that this is not accreditation or endorsement by any body;
  - Close.
- Where it opens: a bottom sheet below 760 px wide or 520 px high (phones, the folded Z Fold7, landscape phones). Otherwise an anchored pop-up beside the button (the unfolded Z Fold7, desktops).
- Folding the phone while the pop-up is open turns it into a sheet with the same content.
- It reuses the app's sheet: `role="dialog"`, `aria-modal`, labelled by its heading, focus moves in and is trapped, Escape and Android back close it, a tap outside closes it, and focus returns to More info.
- More info is a 44 px touch target. Text contrast is 5.0:1 or more in both themes. Motion is off under reduced motion.

### Freshness
A learner's supervisor list reloads when it is more than 30 seconds old on opening, and with sync at most every five minutes. An approval or a pause therefore arrives without restarting the app. Status responses are not cached.

## 4. Verification integrity (unchanged rules, now tested)
- Professional registration, credentials, Wavelength approval and module permissions stay separate.
- A GMC registration alone, or an unrelated credential, never makes anyone verified or eligible.
- Approval stays per pathway module and role. A FUSIC Heart mentor is eligible to review scans, not to sign a final assessment (`supervisorEligibility` with `actions`). The policy is in `data/supervision-policy.json`.
- EDEC, BSE and EACVI exist only as manually checked credential types; no external directory checks were enabled. Names alone never verify (`directory-review.js`, unchanged).
- Restricted sign-off is enforced per module only when `SUPERVISOR_APPROVAL_REQUIRED = "true"`. It is `"false"` in production, by the owner's earlier decision. Switching it on is a separate approval and was not done.

## 5. Tests

| Run | Result |
|---|---|
| Baseline at `59b802c` | 360 tests: 359 pass, 1 skipped, 0 fail |
| After this work (`node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`) | 388 tests: 387 pass, 1 skipped (the same one), 0 fail |
| Android Fixes branch exported (`git archive`, read-only) with this integration applied | 371 tests: 370 pass, 1 skipped, 0 fail. The baseline export was 364: 363 pass, 1 skipped |
| `tools/e2e-verified.mjs`, Chromium | 284 checks pass, 0 fail |
| Same browser check, Android Fixes app against a Worker without this work (`OLD_WORKER=1`) | All checks pass |

New test files:
- `test/supervisor-verification-qa.test.mjs` (21 tests): approval with and without notes; the person-page defect; legacy records and their repair, with and without email; partial approval; several pathways and roles; verified with a genuine pending application or credential; renewal under review; an expired credential pauses; rejected; revoked; learner-visible fields only; GMC alone grants nothing; module and role eligibility; email failure, retry by the daily job and resend; unknown never auto-retried; no token; duplicates from repeat clicks, two administrators and two requests at once; the audit record; self-approval detection, acknowledgement, listing and independent review (including old records); optional-note forms; the reviewer field (remembered, or Access); the email template; before migration 0012.
- `test/verified-view.test.mjs` (7 tests): the app's reading of the server state; old-Worker fallback without overclaiming; More info placement for a phone, the folded and unfolded Z Fold7, a landscape phone and a desktop; pop-up position.

Intended wording changes in existing tests: `credentials`, `credential-authority`, `supervisor-lifecycle` and `sync-ack`.

`tools/e2e-verified.mjs` runs the real Worker in-process over the test database, with every outbound request captured locally and only fictional people. It covers:
- **Sizes and themes:** 390×844, 344×882 (Z Fold7 folded), 884×1104 (Z Fold7 unfolded) and 1440×900, each light and dark.
- **The card:** compact; no modules on it; small green check; no navy or green panel; More info target size.
- **More info:** sheet or pop-up; content; no private data; modal and labelled; focus in, trapped, returned; Escape; tap outside; folding while open.
- **States:** legacy (verified plus further application); pending.
- **Learner:** list and More info.
- **Offline and reconnection.**
- **Admin:** Needs attention; approval without a note on a double click (one email); email status; reviewer remembered; repair without email; admin page at 390 px.
- **Layout:** no horizontal overflow; no console errors.

Screenshots of the last run are in the session scratchpad. Run again with `node build.js && node --import ./test/helpers/register.mjs tools/e2e-verified.mjs <outdir>`.

Not done: a check on a physical Android phone or the Android emulator's WebView. Store builds come from the Android Fixes line, so this needs the 1.0.15 build (section 7).

## 6. Files changed (commits on this branch)
- `77d3995` and `f9ec1d1`. A third commit adds these documents, the integration bundle and the harness's old-Worker mode.
- New:
  - `worker/verification/status.js`
  - `src/app/verified.js`
  - `test/supervisor-verification-qa.test.mjs`
  - `test/verified-view.test.mjs`
  - `tools/e2e-verified.mjs`
  - `tools/i18n/batch-supervisor-qa.json`
  - this folder
- Changed:
  - Worker: `worker/supervisors-admin.js`, `worker/supervisor-lifecycle.js`, `worker/supervisor-apply.js`, `worker/supervise.js`, `worker/notify.js`, `worker/audit.js`, `worker/index.js`
  - Admin shell: `build.js`
  - App: `src/app/app.js`, `src/app/app.css`, `src/app/index.html`, `src/app/sw.js`
  - Translations: `src/app/i18n/*.json` (21 strings, machine-drafted like the rest; a native speaker should review), `tools/i18n-extract.mjs`, `tools/i18n/strings.json`
  - Existing tests: `test/credentials.test.mjs`, `test/credential-authority.test.mjs`, `test/supervisor-lifecycle.test.mjs`, `test/sync-ack.test.mjs`
  - `CLAUDE.md`

## 7. What each change needs to reach users

| Change | Needs |
|---|---|
| Approval routine, email, notes, admin screens, self-approval, repair, `verification` in the API | **Worker deployment** (`main`, then Cloudflare builds) |
| Double-click guard in the admin shell (`build.js`) | **Website deployment** (same deploy) |
| Compact status and More info on the website app (`/app/`) | **Website deployment**. The service worker updates on the next visit |
| Compact status and More info in the installed Android app | **New store build** (1.0.15) from the Android Fixes line. Website changes never reach installed apps |
| Database | **No migration.** Nothing new is stored. Works with the migrations already applied (0011 to 0013). 0015's `capacity` column is used when present, as before. 0014 and 0015 stay unapplied |
| Configuration | **None.** No new Worker variable or secret |
| Email provider | **None in code.** Check that `ZEPTOMAIL_TOKEN` is set and look at the ZeptoMail log for the reported email (section 2) |

**Order:** deploy the Worker first, then the store build. The new app works against the old Worker (tested), and older installed apps work against the new Worker: all old fields are kept.

**This branch includes the commercial work** (`wavelength-business-20261010`): analytics, the business dashboard and directory review. Deploying this branch as it is would deploy that too, and needs migrations 0014 and 0015 (see `docs/commercial-2026/10-deployment-approval.md`). To ship only this fix, the Worker changes must be ported onto `main`. They do not apply as they are: a `git apply --check` against `main` fails in `worker/notify.js`, `worker/supervise.js`, `worker/supervisor-lifecycle.js` and `worker/supervisors-admin.js`. Those files also carry commercial-branch work, such as approval capacities from `worker/verification/pathways.js`, which the new code uses. A `main`-only port is a separate, reviewable piece of work. Ask me to prepare it on its own branch.

## 8. Android integration (for the Android Fixes workstream)
Bundle in `android-integration/`:
- `app-ui.patch`: `app.js`, `verified.js`, `index.html`, `sw.js`, the i18n extractor, the translation batch and two tests.
- `app-css-block.css`: the styles, appended to `src/app/app.css`.

Steps, in the Android Fixes worktree. Do not run `git config` there.
1. `git -c core.autocrlf=false apply <path>/docs/supervisor-qa-20261010/android-integration/app-ui.patch`. Run it inside the worktree: outside a repository this machine's global setting writes CRLF line endings and breaks source-reading tests.
2. Append `app-css-block.css` to the end of `src/app/app.css`.
3. `python3 tools/i18n-add.py tools/i18n/batch-supervisor-qa.json`, then convert the eight `src/app/i18n/*.json` files back to LF (the script writes CRLF on Windows), then `node tools/i18n-extract.mjs`.
4. `node build.js`, then `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`.

This exact sequence was tested on a read-only export of `wavelength-android-fixes-20261010` at `ca6895d`. The patch applied cleanly, the build passed, the tests gave 371 with 370 passing, 1 skipped and 0 failing, there were no missing translations, and the browser check passed against an old Worker.

Only the app changes go to the Android line. The Worker changes ship with the Worker deployment. Version, signing and release stay with that workstream. No conflicting release was made here.

On the phone (Fold7 checklist), check:
- the status card folded and unfolded;
- More info as a sheet when folded and a pop-up when unfolded;
- the Android back button closing it;
- TalkBack reading "Verified Supervisor", the line and "More info, button";
- the dark theme.

## 9. Self-approval governance assessment
- **Risk.** One person (the owner, as administrator) can approve their own supervisor status. Wavelength verification then rests on that person's own reading of their own evidence. The GMC check and credential checks are manual. "Wavelength Verified" is shown to trainees, and signed records carry the signer's status. A self-approval is therefore a conflict of interest, even when the evidence is genuine.
- **Now in place.** It is recognised, needs an explicit acknowledgement and a written basis, is recorded, and stays listed until another administrator records an independent review. The supervisor and the original approver cannot record it.
- **Recommended.**
  1. Ask a second person (for example the General Manager, or a trusted external supervisor) to record the independent review of the owner's approval. Give them their own admin login or, better, Cloudflare Access, so the record names them.
  2. Switch on Cloudflare Access (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) so identities are emails, not typed names.
  3. Keep the GMC check and the FAMUS or FUSIC evidence for the owner's own record, as for anyone else.
  4. Consider requiring two administrators for self-approval once a second administrator exists. This is a policy decision, not built.
- **Existing records.** Kept as they are. Nothing was revoked or changed. Such an approval appears under Needs attention once deployed.

## 10. Production readiness
- **Ready for review and deployment**, with the order and conditions in section 7: all automated and browser checks pass, there is no migration, and it is backwards compatible both ways.
- **Before deploying:** run `production-diagnosis.sql` to see the affected records. After deploying, use **Record as approved** on each open application listed under Needs attention. Decide case by case whether to send the confirmation email.
- **Known limits:**
  - Delivery and bounces are not visible without a ZeptoMail webhook (a possible later addition).
  - Self-approval detection by typed name can raise a false alarm (it only asks for an acknowledgement) and can miss a deliberately different name. Access emails close that gap.
  - The new translations are machine-drafted.
  - No physical-device check yet.

## 11. Approvals needed (nothing here has been done)
1. Run the read-only `production-diagnosis.sql` (or allow me to run read-only production queries).
2. Approve the deployment route: a `main`-only port of this fix (separate work, section 7), or deploy together with the commercial branch (which also needs migrations 0014 and 0015 and that branch's approvals).
3. Approve the Worker and website deployment.
4. Decide, per affected supervisor, whether to send the corrective approval email after **Record as approved**.
5. Name a second administrator for the independent review of the owner's own approval. Optionally, switch on Cloudflare Access.
6. Approve integrating the app changes into the Android Fixes workstream for 1.0.15, with the Fold7 phone checks before release.
7. Check `ZEPTOMAIL_TOKEN` and the ZeptoMail log (Zoho CPaaS, EU) for the original approval email.
8. Optional: have a native speaker review the new translations.
9. Not requested and not done: switching on `SUPERVISOR_APPROVAL_REQUIRED` (module-specific enforcement of sign-off). It remains the owner's separate decision.
