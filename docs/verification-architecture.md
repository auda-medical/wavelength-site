# Verification architecture: email, professional identity, credentials and supervisors

Status: built October 2026 (branch `claude/beautiful-pascal-f9gz6s`). Migration `0011_verification.sql` is **not yet applied to production**. Professional verification is switched off until `PROFESSIONAL_VERIFY = "true"`.

The external research behind the design, including what each regulator and body allows and what to ask them for, is in [verification-integrations.md](verification-integrations.md).

## 1. Five separate things

Wavelength never folds these into one flag. Each is stored, checked, shown and revoked on its own.

| Level | What it proves | Where it lives | Who decides |
|---|---|---|---|
| 1. Email ownership | The person controls this address | `learners.email_status`, `email_verified_at` | The person, by using a single-use emailed link |
| 2. Professional registration | A regulator lists this number, the registration is current, and the name matches the account | `professional_registrations` | A regulator adapter, or an admin checking the public register by hand |
| 3. External credential | An outside body (SAM, ICS, BSE, EACVI…) recognises this person for these modules | `credentials` (+ `credential_evidence`) | A credential adapter where permitted, or an admin from evidence |
| 4. Wavelength supervisor approval | Wavelength judges this person suitable to supervise one pathway module | `supervisor_approvals` | An admin only, one scope per row |
| 5. What reviewers see | Badges, verify pages, the directory, sign-off snapshots | Computed on the server from 1 to 4 | Never stored as a flag, never accepted from a browser |

Rules that follow from this:
- A GMC number is not a supervisor qualification. A FAMUS Thoracic supervisor is not a FUSIC Heart supervisor. There is no universal supervisor permission and no `verified_supervisor` boolean.
- A badge appears only for something verified (levels 1 to 4). A claim someone has only typed never shows as verified.
- An approval counts (`current`) only while it is in date **and** the person still holds at least one verified registration. If a recheck finds the registration lapsed, supervisor privileges stop at once, but the approval row and its history stay.
- Mock results (`mock:` sources) are hidden outside tests.

## 2. Email verification (`worker/email-verify.js`)

- **Tokens:** 32 random bytes in the link's `#fragment` (`/app/#/verify-email/<token>`). D1 stores only the SHA-256 hash (`email_tokens`).
  - Each token is single use: it is claimed with `UPDATE ... WHERE used_at IS NULL`.
  - It expires: verify after 72 h, claim after 24 h, sign-in after 30 min.
  - It is bound to the address it was sent to. If the account's email changed since, the token fails.
- **Throttling:** one email of each kind per account every 2 minutes, and six a day across all kinds. Public answers are the same whether or not a mail went out.
- **POST from the page:** the page posts the token. A GET of the URL (as email link scanners do) never uses it up.
- **Purposes:**
  - `verify`: marks the email verified and never logs anyone in.
  - `claim`: an Academy-only learner adds an app password. The password hash waits in the token row and is set only when the link is opened. That revokes older sessions and logs in the browser that opened it.
  - `signin`: a returning Academy-only learner. It applies the details they typed, so a corrected certificate name still works, and logs that browser in.
- **Typed details stay with the browser that typed them:**
  - A claim's pending password and a sign-in's pending name are applied only where the form was filled in, recognised by an HttpOnly nonce cookie (`wl_claim`, path `/api/app/email/verify`, 24 h).
  - Opened anywhere else (another device, or the real owner of an address someone else typed), a claim link asks the opener to choose their own password, and typed names are never applied.
  - This closes "sign up with someone's email and wait for them to click".
- **Where it applies:**
  - **App sign-up, new email:** the account works at once (the logbook is offline-first) as `unverified`, and a link is sent.
  - **App sign-up, Academy-only email:** answers `202 { checkEmail }` and sends a claim link. **Nobody can take over an Academy record by typing its email any more.**
  - **App sign-up, email with a password:** unchanged (409, "log in instead").
  - **Academy registration, new email:** as before, plus a verification link.
  - **Academy registration, existing Academy-only email:** a sign-in link instead of an instant login (`?check=1` on the module page).
  - **Supervisor invitations:** the invite email carries its own single-use token (`supervisor_links.invite_hash`, 30 days). Accepting with it also verifies the email. Accepting by id needs a verified email.
  - **Professional verification:** always needs a verified email.
- **Not gated:** logging scans, sync, sign-off requests, in-person sign-off, assessments, exports, backups and certificates. Verification never blocks the logbook.
- **Switches:** email verification runs only when `ZEPTOMAIL_TOKEN` is set and migration 0011 is applied. `EMAIL_VERIFY = "off"` (Worker var) restores the old behaviour without a code change.

### Transition for existing accounts

- `ALTER TABLE learners ADD COLUMN email_status ... DEFAULT 'legacy_unverified'` marks every existing row `legacy_unverified`. No data is changed and nobody is logged out.
- Legacy accounts keep everything they had: logbook, sync, sign-offs, assessments, evidence summaries, certificates, and **already-active supervisor links**, including dashboard sign-off.
- A Home and Me card asks them to confirm. The link marks them `verified`.
- What they need to verify for: accepting a *new* supervisor invitation (or using the invitation link, which verifies them), starting professional verification, and listing in the directory.
- Academy-only learners returning on a new device get a sign-in link instead of being logged in by typing their email. Devices already logged in stay logged in for up to 180 days.

## 3. Professional registration (`worker/professional.js`)

`professional_registrations` holds one active row per regulator per person, and supports several regulators (for example NMC and HCPC).

- **Claimed** (what the person typed): regulator, number (normalised and pattern-checked from `data/credentials.json`), profession, organisation, role, claimed name.
- **Returned** (the minimum the source gave): `register_name`, `register_status`, `register_fields`. The fields are a few whitelisted scalar values only, never the raw response.
- **Verification:**
  - `status`: `pending`, `verified`, `manual_verification_required`, `manual_review`, `mismatch`, `not_found`, `not_current`, `source_unavailable`, `rejected` or `withdrawn`.
  - `verification_source`, `verification_method` (`automatic_register`, `manual_register`), `match_method`, `match_version`, `match_result`.
  - Dates: `verified_at`, `last_checked_at`, `next_check_at`.
  - Failures: `failure_state` (`source_unavailable`, `conflict`, `recheck_due`), `failure_count`.
- **Integrity:**
  - A partial unique index allows one *verified* holder per regulator and number. A second claimant goes to `manual_review` (`conflict`) and is never told who holds the number. Two simultaneous verifications cannot both win: the losing UPDATE hits the index and becomes `manual_review`.
  - A second partial unique index allows one active registration per person per regulator.
  - Rate limits per account per day: 5 registration submissions, 10 credential claims, 20 evidence uploads. This limits using Wavelength to enumerate register numbers.

### Identity matching (`worker/verification/names.js`, `names-v1`)

An exact registration-number match is required first: the adapter looks the number up. Then the authoritative name is compared with the account name.

- **Normalised before comparing:** titles and post-nominals, case, accents, apostrophes, hyphens, spacing, "SURNAME, Given" order, and names split differently between given and family.
- **`match` (auto-verified):**
  - Exact after normalisation.
  - Same first and family name, where the register lists extra middle names.
- **`review` (a person decides):**
  - Initials only.
  - Known by a middle name.
  - One half of a double-barrelled surname.
  - A middle name the register lacks.
  - Missing parts.
- **`mismatch`:** different first or family name.
- Every check records the method and version. Bump `VERSION` when the rules change.

## 4. Adapters (`worker/verification/adapters.js`)

The engine never talks to a register directly. `data/credentials.json` names an adapter for every regulator and credential type.

- **Contract:**
  - `lookupRegistration(env, { regulator, number })` returns `found`, `not_found`, `unavailable` or `manual`, plus a minimal record.
  - `findCredential(env, { type, modules, person })` returns the candidate records.
- **`manual`:** every live regulator and body today. No supported automated source exists (see the research), so claims go to the admin queue as `manual_verification_required` or `evidence_required`. **No automation is pretended.**
- **`mock`:** tests only. It needs `VERIFY_MOCK = "true"` plus fixture data. A test fails if `wrangler.jsonc` mentions it, and another fails if any config entry names a non-manual adapter.
- **`unavailable`** is never a lapse. The current status is kept, `failure_state` records it, and a retry is scheduled with back-off.

### Adding a regulator or body later

1. Add an entry to `data/credentials.json`:
   - A regulator needs `numberPattern`, `numberHint`, `registerUrl`, `recheckDays`, `access` and `adapter: "manual"`.
   - A credential type needs `body`, `programme`, `role`, `modules` with their `scope` (pathway module ids from `data/logbook.json`) and `expires`.
2. If and only if the body grants written permission or a licence: write an adapter object (`mode: 'api'` or `'dataset'`), register it in `ADAPTERS`, set the config entry's `adapter`, record the agreement in `access`, and update the test that pins every adapter to `manual`.
3. Nothing in the engine, admin panel or app changes.

**Never** scrape a public register, bypass CAPTCHA or bot protection, or call an undocumented endpoint (for example the GMC print URL that appears in search results).

## 5. Credentials and automatic matching

`credentials` holds one active row per person per credential type: issuer, programme, role, modules (JSON), level, reference, issued, expiry and review dates, status, source, method, match fields, `verified_by` and `registration_id`.

**Automatic verification needs all of these:**
1. The person holds a verified registration. Their authoritative register name is used for matching.
2. Exactly one candidate record could be this person.
3. That record fits on two independent points: either an exact registration-number match, or a name `match` together with the same organisation (`sameOrganisation`, which ignores "NHS Foundation Trust" noise).
4. The record covers every module claimed.

Anything less goes to `manual_review` (`ambiguous` or `no_verified_registration`). Expiry dates from the source are kept, and an expired record is `expired`, never `verified`.

Provenance is kept per credential and per event. For example, the badge reads "FAMUS supervisor verified · Thoracic · Checked automatically against the SAM record · 5 Oct 2026", with the note "Issued by Society for Acute Medicine, not by Wavelength".

## 6. Manual verification and evidence

Evidence lives in `credential_evidence` and can be any of:
- A certificate, letter, NHS or institutional confirmation, or correspondence from the body.
- An official public listing, as an https link.
- A file: PDF, JPEG or PNG, at most 1 MB. The type is checked by magic bytes and the SHA-256 is stored.

Data minimisation:
- The app tells people to cover what is not needed, and never asks for a passport or driving licence. Regulator verification already establishes identity.
- File bytes are purged `PURGE_EVIDENCE_DAYS` (30) after a final decision, and at once on withdrawal. The hash and description stay as the reference.
- Admins download evidence as an attachment, with `Content-Security-Policy: sandbox`.

## 7. Admin panel (`/volunteer/admin/supervisors/`, `worker/supervisors-admin.js`)

The panel uses the admin login.

- **Queue:** everything waiting for a person, including rechecks that are due.
- **Per person:**
  - Email status.
  - Registrations, with claimed and returned details, match result, source, dates and a link to the official register. The admin checks it by hand; it is never scripted.
  - Credentials with their evidence.
  - Approvals.
  - The badges shown today.
  - The full history.
- **Actions:**
  - Registration: verify (needs the name exactly as the register shows it, plus a tick confirming the admin checked the official register today), reject, mark not current, rerun the automatic check.
  - Credential: approve (modules, method, evidence relied on, issued, expiry and review dates), request more evidence (emails the holder), reject, revoke, reinstate.
  - Approval: approve for chosen scopes (pathway module, or "all modules" recorded explicitly), with the basis credentials and a review date. Revoke. Reinstate, which adds a new row so the revoked one keeps its reason.
- **Audit:**
  - Every action needs the reviewer's name and notes or a reason.
  - It writes `verification_events` with the decision, timestamp, actor (`admin:<login>:<reviewer>`), scope, credential, evidence id and notes. The trail is append-only.
  - The admin login is shared today. Individual admin accounts are a recommended follow-up.
- **Safety:** all text is escaped, and confirmations use `data-confirm` (see CLAUDE.md).

## 8. Historical sign-off integrity

`signoffs.supervisor_snapshot` and `assessments.supervisor_snapshot` are written **in the same UPDATE that signs**, and nothing ever updates them afterwards.

Each snapshot holds:
- Version, `capturedAt` and method (`remote`, `in-person` or `dashboard`).
- `identity`: `wavelength_account` (dashboard only) or `self_declared` (link or in person: anyone holding a link signs "as themselves").
- What the signer declared.
- For accounts:
  - The email state.
  - The professional name: the register name when verified.
  - Registrations: regulator, number, status, verified flag, source, method and dates.
  - Verified current credentials.
  - Current approvals.
  - `relevantScopes`, worked out from the signed entries' scan types or the assessment's module.
  - `approvedFor`, which is the relevant scopes that are approved.
  - `wavelengthVerifiedSupervisor`.

A compact copy goes on the logbook entry's server-owned `signoff.verification`.

The public verify pages show `supervisorCheck`: regulators, credentials, scopes and dates, but **no registration numbers or emails**.

Later revocation, expiry or a lapse changes current privileges and future snapshots, never past ones. Tests cover this.

## 9. Re-verification

`recheckDue` runs from the Worker cron. For now it shares the newsletter crons; a daily cron should be added with approval once a live adapter exists.

- **Live adapters:** recheck at `next_check_at`, which is set from `recheckDays`.
- **Outages:** back-off of 1 h to 24 h, keeping the status.
- **Manual verifications:** when due, they are flagged `recheck_due` and join the admin queue. They are not demoted.
- **Expiry and review dates:** applied on every read (`isCurrentCred`), so they need no job.
- **Evidence:** the same job purges decided evidence files.
- **Suggested intervals:**
  - Regulators (GMC, NMC, HCPC, GPhC): monthly, in `data/credentials.json` `recheckDays`.
  - Society directories: six-monthly.
  - Expiring credentials (BSE, EACVI, five years): use the expiry date.

## 10. Cross-credential rules

`data/credentials.json` `rules` is a list:
`{ id, from: credentialType (+modules), relation: 'may_satisfy_prerequisite', to: role or credential, source: URL, quote, checked, status: 'draft' | 'active' }`.

Only `active` rules with a source would ever be used, and a test enforces that. The list is **empty on purpose**: no body's eligibility rule has been read and recorded yet, and Wavelength must not assume one. Future queries such as "who near me is eligible to supervise FUSIC Lung" join verified credentials and approvals through these rules.

## 11. Directory (`GET /api/app/directory`)

The directory is closed until `DIRECTORY_PUBLIC = "true"` **and** `PROFESSIONAL_VERIFY = "true"`.

- **Who appears:** only people with `directory_profiles.listed = 1`, who must also be eligible *at read time*: a verified email, a current verified registration, and a current approval or a verified supervising credential.
- **Public fields:** display name, profession, organisation, region, country, specialty, badges (no email badge), the last verification date, and a contact email only if the person added one and ticked to show it.
- **Never public:** account email and registration numbers.
- **Filters:** country, region, text, profession, pathway, module and credential.
- **External registers are never imported:** everyone listed chose to be listed.

**Invite a supervisor:** a learner who cannot find their supervisor invites them by email. The supervisor then creates or claims an account, verifies their email (the invitation link does this), adds their registration and credentials, is verified automatically or by hand, and can opt into the directory. This builds the network without bulk importing anyone.

## 12. Security summary

- Every verification decision is made on the server.
  - The browser's status fields are ignored: tests forge them.
  - Sign-off and verification data on entries is stripped on sync.
  - The mock adapter cannot be enabled from config.
- Tokens are hashed and single use, with expiry and throttling.
- Invitation tokens are bound to the invited email.
- Registration claims are rate limited, and the unique indexes prevent duplicate or cross-account verified identities.
- Verification events log decisions without raw register responses or document contents.
- Admin pages escape all input; evidence is served sandboxed as an attachment.
- `verificationReady()` lets the Worker run safely before the migration: old behaviour for email and sign-off, 503 for the professional endpoints.

## 13. Mobile and store implications

- The native shells load `https://thewavelength.co.uk/app/` (Capacitor `server.url`), so every change here reaches store users without a native build.
- Email links open in the system browser, which has its own cookie jar. Verification is bound to the token, not the session, so the app picks up "verified" on its next `/api/app/me`. Nothing depends on the link opening inside the app.
- A claim or sign-in link logs in the browser that opened it. The app session logs in with the password as usual.
- Invitation tokens survive the login or sign-up step in `sessionStorage`.
- The logbook stays fully usable offline and while unverified.
- **Universal Links and App Links** are recommended later, to open `/app/*` links straight in the app. They need:
  - `/.well-known/apple-app-site-association` (with the Team ID) and `assetlinks.json` (with the Play app-signing SHA-256), served as JSON without redirects.
  - The Associated Domains entitlement, plus an Android `autoVerify` intent filter.
  - The `@capacitor/app` plugin's `appUrlOpen` handler.

  That is a native build. It is not part of this change.

## 14. Before switching on professional verification (`PROFESSIONAL_VERIFY = "true"`)

1. Apply `migrations/0011_verification.sql` with a recorded Time Travel recovery point. Email verification and snapshots start working at once.
2. Update the privacy notice and app terms. The draft text is in [verification-integrations.md](verification-integrations.md#privacy-notice-draft).
3. Complete a DPIA screening, or an amendment to the existing DPIA, covering:
   - Registration numbers.
   - Regulator lookups.
   - Evidence documents and their retention.
   - Admin decisions and the audit trail.
   - Rechecks.
   - The public directory.
4. Update Apple App Privacy and Google Play Data safety answers (`mobile/STORE.md`).
5. Set `PROFESSIONAL_VERIFY = "true"` in `wrangler.jsonc` vars with approval. Later, and separately, `DIRECTORY_PUBLIC = "true"`.
