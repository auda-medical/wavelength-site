# Phases B to E: unified credential verification and pathway-specific supervision

Status: implemented and tested locally (commits `e4d7aef` and `c01f74f`). Migration `0015_credential_authorisation.sql`
is **not applied to production**. Nothing was sent to any professional body.

## 1. What was already there (preserved)

The 1.0.12 verification architecture (`docs/verification-architecture.md`) already kept five things apart: email
ownership, professional registration, external credentials, Wavelength supervisor approval per pathway module, and the
badges and snapshots computed from them. The GMC manual review (`worker/verification/register-review.js`) was already
the model for honest manual checks. This project extends that architecture. It does not build a second system.

GMC: unchanged. Generic "verify" is still refused for GMC rows, the "Record GMC check" form and the hold-for-decision
path behave as before, and every earlier GMC test still passes. A new test confirms this
(`test/credential-authority.test.mjs`, "the GMC workflow is preserved"). A GMC registration alone grants no supervision
privilege: tested ("GMC alone grants nothing").

## 2. What each body publishes, and what automation is appropriate

Researched on 10 October 2026 from each body's own pages. "Permitted method" is what Wavelength does now.

| Body / programme | Public source | Fields shown | Official API or data agreement | Permitted method in Wavelength |
|---|---|---|---|---|
| GMC | Online register | Name, number, registration and licence status, conditions | No public API. Licensed Medical Register download (fee, signed agreement) | Manual check by an administrator (unchanged) |
| SAM, FAMUS supervisors | [Supervisors and mentors page](https://www.acutemedicine.org.uk/famus/supervisors-and-mentors/) with a directory | Name, position, trust or hospital, modules, date accredited, email, **published only if the supervisor consents** | None found. No stated terms for reuse | Manual lookup by an administrator, recorded with "Record directory check". No scraping, bulk copying or republication |
| SAM, FAMUS mentors | Not registered | n/a: "Mentors can be any grade clinician who is competent in the scan being overseen; they do not have to be registered with FAMUS" | n/a | Evidence only (supervisor or departmental confirmation) |
| SAM, FAMUS peripheral access | [Peripheral access module](https://www.acutemedicine.org.uk/famus/peripheral-access-module/) | "Registration with the Society is not required and supervision is to be determined at a local level" | n/a | Local supervisor approval; a SAM listing cannot confirm it |
| ICS, FUSIC | [FUSIC TMS directory](https://ics.ac.uk/learning/fusic/fusic-tms-directory.html), searched by hospital | Name, hospital, category, some emails. Categories seen: Mentor FUSIC Heart (838), Trainer FUSIC Lung (484), Supervisor FUSIC Heart (202), Trainer FUSIC Abdomen (159), FUSIC Vascular trainer (144), Trainer FUSIC DVT (131), Supervisor fTOE (105), Trainer FUSIC HD (76), Trainer CACTUS Lung (42), Trainer CACTUS Cardiac (17) | None found. Consent and reuse terms not stated | Manual lookup by an administrator |
| ESICM, EDEC | EDEC Guidelines 2025 (updated 13 November 2025); ESICM lists certified supervisors by region | Supervisors approved by the EDEC Committee; may be remote; validate the logbook in the EDEC ePortfolio | None found | **Evidence only** (written confirmation of appointment). A list may lag behind appointments and ends, so it is never relied on alone |
| BSE | [Accredited members list](https://www.bsecho.org/Public/Public/Accreditation/Personal-accred/Accredited-members.aspx) | Full name, accreditation type, "accredited until" | None found | Manual lookup with expiry date |
| EACVI (ESC) | [Certified professionals in imaging](https://www.escardio.org/education/career-development/certification-programmes/cv-imaging/certified-healthcare-professionals-in-imaging/) | First and last name, country, certification and expiry | ESC terms forbid substantive extraction or automated collection | Individual manual lookups only; "examination only" is recorded as not certified |
| RCEM | No register of ultrasound supervisors | Supervision is local | n/a | Local supervisor approval from evidence |
| ASUM CCPU (future) | CCPU regulations (February 2026) | Primary supervisor criteria (for example CCPU holder in the unit for 12 months, DDU, FACEM, FCICM) | Not researched further | Not implemented; candidate for later |
| NBE (future) | No public lookup found from the build environment | n/a | Not found | Not implemented |

Conclusion: no body offers an authorised API or data-sharing arrangement Wavelength holds. Automated verification is
therefore **not** appropriate today. Wavelength automates the administration around a human check: forms, recorded
fields, identity confirmation emails, recheck scheduling, audit and reporting. It never makes the competency or
accreditation decision, and it never grants a privilege from a name match.

## 3. Identity is confirmed independently of the name

A directory entry with the same name is not proof that the account holder is the listed person. A credential becomes
verified from a directory check only with one of these independent routes (`worker/verification/directory-review.js`):

| Route | What proves identity |
|---|---|
| `listed_email_matches_account` | The email the directory lists equals the holder's **verified** Wavelength email |
| `listed_contact_confirmed` | A single-use link sent to the address the directory lists was used to confirm the account. The listed person can also answer "This is not me", which stops the claim and flags it as disputed |
| `registration_and_organisation` | A verified professional registration whose register name matches the listing exactly, **and** the same organisation |
| `body_confirmation` | Written confirmation or a certificate from the issuing body, held as evidence |
| `employer_confirmation` | A letter from the holder's organisation, for locally approved roles only |

Without one of these the check is recorded as **Directory match found**, never Verified. A different name is held for
manual review even when an email field matches. Initials or a partial name are "possible match" only.

The generic "Approve credential" action can no longer approve a directory-listed credential "against the body's public
list": that route must go through the directory check. Approving from evidence still works but must name the evidence.

## 4. Credential states (precise meanings)

`credentialState()` in `worker/verification/pathways.js`, shown to holders and administrators:

| State | Meaning |
|---|---|
| Unverified | Claimed; nothing checked yet |
| Verification requested | Waiting for the Wavelength team, or for evidence the holder was asked for. Also used when a source is unavailable: an outage never counts as verified |
| Directory match found | An administrator found a matching entry in the official directory; identity not yet confirmed |
| Identity confirmation pending | A confirmation was sent to the address the directory lists |
| Manual review required | A person must decide: ambiguous match, conflict, dispute, listing changed |
| Verified | Identity confirmed independently and the credential confirmed for the modules shown |
| Expired | Was verified; past its expiry or review date |
| Revoked | Withdrawn by Wavelength after a change |
| Unable to verify | Rejected, not found, or withdrawn by the holder |

## 5. Capacities and module-specific permissions

`data/supervision-policy.json` records, per pathway and module, the capacities each body recognises and what each may do.
Each Wavelength approval now carries a capacity (`supervisor_approvals.capacity`, default `supervisor`, so existing
approvals keep their meaning).

| Pathway / module | Capacity | Witness scan | Review scan later | Formative | Summative / DOPS | Final or triggered assessment |
|---|---|---|---|---|---|---|
| FAMUS Thoracic, Abdominal-renal, DVT, LP | Supervisor (SAM-registered for that module) | ✓ | ✓ | ✓ | ✓ | ✓ (ACT) |
| | Mentor (locally determined) | ✓ | ✓ | ✓ | ✗ | ✗ |
| FAMUS Peripheral access | Locally approved supervisor | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Mentor | ✓ | ✓ | ✓ | ✗ | ✗ |
| FUSIC Heart | Supervisor | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Mentor | ✓ | ✓ | ✓ | ✗ | ✗ |
| FUSIC Lung, Abdomen, DVT, Vascular | Trainer **for that module only** | ✓ | ✓ | ✓ | ✓ | ✓ |
| RCEM modules | Supervisor or locally approved supervisor | ✓ | ✓ | ✓ | ✓ | ✓ |
| International frameworks | Supervisor or locally approved supervisor | ✓ | ✓ | ✓ | ✓ | ✓ |

Sources: FAMUS curriculum pack (DVT v1.1): "Supervisors: may undertake supervised scans, review unsupervised scans and
must perform ACTs… Mentors: will review images from unsupervised scans (mentored practice); cannot sign off ACTs". ICS
FUSIC Heart supervisor page: supervisors "conduct the triggered assessment and countersign the summary training record";
mentors assess logbooks and are involved in the triggered assessment with the supervisor. ICS trainer page: trainers are
recognised per module after 12 months' accreditation and sign the triggered assessment and summary record for it.

fTOE, CACTUS, FUSIC Haemodynamics and EDEC credentials are recorded and verifiable but support no approval scope,
because the logbook has no matching module yet.

How the capacity is used:
- **Admin approval:** a capacity a module does not recognise is refused (for example "Mentor" for FUSIC Lung).
- **Enforcement on** (`SUPERVISOR_APPROVAL_REQUIRED = "true"`): dashboard sign-offs and assessments check the capacity
  against the action. A FUSIC Heart mentor can review scans and record formative feedback; the triggered assessment is
  refused with a clear reason (`capacity`). Tested.
- **Enforcement off** (today): nothing is blocked, as before, but every signature's snapshot records the capacity and
  whether it covered what was signed. A mentor who signs a final assessment is shown on the public verify page as
  "approved as mentor, which does not cover final", and never as an approved supervisor for it. Tested.

## 6. Changes and loss of status

- A credential's module coverage is checked on every read: if a recheck shows a FAMUS supervisor no longer listed for
  DVT, their FAMUS DVT approval stops counting at once while Thoracic continues (tested).
- "Not listed" on recheck makes the credential not verified, so every approval that relied on it pauses (tested).
- Directory credentials are flagged for recheck after 180 days by the existing daily job (`recheckDays`), joining the
  admin queue. They are not demoted automatically, and an outage never grants or removes anything.
- Past sign-offs keep the snapshot written when they were signed.

## 7. Supervisor discovery and review workflow (Phase E)

- **Directory API** (`GET /api/app/directory`, still closed until `DIRECTORY_PUBLIC = "true"`): new filters for role
  (capacity), organisation, "accepting requests" and verification; each result lists roles per module and whether the
  person accepts new requests (their own choice, `directory_profiles.accepting_requests`). The response states that
  listing is not a promise of availability, and links the bodies' own directories with a note that people listed
  there may not use Wavelength and that Wavelength does not copy them.
- **Review states** (`worker/review.js`): pending, under review (the supervisor opened the request), declined with a
  reason (it returns to the learner, who sends it on or cancels), returned, approved, revision requested (a queried
  scan), cancelled, expired. The app's supervisor screens mark requests as opened and offer "Decline this request";
  learners see "Under review" and the reason for a decline. Tested end to end.
- Wording on the website and in the app keeps the boundary: remote review of a record does not replace directly
  supervised scanning, observed procedures or required assessments, and never confers accreditation.

## 8. Analytics (no clinical content)

The business dashboard's Supervision tab reports, for the chosen period: supervisor applications by status,
verification success rate (approved ÷ decided), credentials by programme and role and state, current approvals by
pathway and capacity, verification events by outcome (including directory checks and listed-contact confirmations),
sign-off requests and completions by route, median review turnaround (link and dashboard), requests open now, and signed
assessments by pathway and kind. Counts and statuses only.

## 9. What is needed before any automated check

For each body: written permission or a data-sharing agreement covering purpose, fields, frequency, retention, change
notification and republication; then an adapter in `worker/verification/adapters.js` with the agreement recorded in
`data/credentials.json` `access`. Draft requests to SAM and ICS are in `08-commercial-strategy.md` (not sent).

## 10. Before switching on in production

1. Apply migration 0015 (after 0014), with a Time Travel recovery point.
2. The privacy notice section "Checking supervisor credentials" is drafted (in this branch); update the DPIA screening
   for listed-contact emails and directory checks.
3. Decide when to switch on `SUPERVISOR_APPROVAL_REQUIRED` (owner's Step 3b), now with capacity checks.
4. Store builds: the app changes (decline button, review labels) ship in the next store build; the API is backwards
   compatible with older apps.
