# Deployment plan and approvals needed

Status on 10 October 2026: everything below is built and tested locally on branch `wavelength-business-20261010`.
**Nothing is deployed, no production migration is applied, and no Stripe, Cloudflare, store or external setting has
been changed.** Each numbered step needs Fero's explicit approval. Do the steps in order; each has a check and a way
back.

## 0. Readiness at a glance

| Area | Built | Verified locally | Needs before live |
|---|---|---|---|
| Website: free logbook, supervision story, Tailored Training, UK and international, wider enquiry form | Yes | Unit tests; browser checks (22 page views, real enquiry, objection switch) | Steps 1 to 4 |
| Cookieless measurement and objection switch | Yes | Yes | Privacy notice goes live with the deploy; migration 0014 |
| Business dashboard `/admin/business/` | Yes | Browser check of 12 tabs at two widths with 60 days of fictional data; per-course profit checked by hand | Migration 0014; optional Cloudflare Access owner role |
| Money separation | Yes | Tests: bookings taken (cash) vs recognised revenue (course date), costs dated with their course, actual vs estimate, **Stripe test-mode bookings never counted** | — |
| Stripe bookings webhook | Yes, off by default | Signature, staleness, replay, duplicates, refunds, test mode | Step 5 (payment configuration) |
| Credential verification (directory checks, identity routes, nine states, capacities, listed-contact confirmation) | Yes | Tests (15) | Migration 0015; DPIA screening; privacy notice (drafted) |
| Asynchronous review (accept, decline with reason) | Yes (Worker and app) | Tests | Migration 0015; store build for phones |
| Existing logbook | Unchanged behaviour | Full suite 359 tests, 358 pass, 1 skipped, 0 fail (Windows and Linux line endings); app end-to-end suite passes | — |
| Films (version 2) | See `07-videos.md` | See the video quality assessment | Fero's viewing and listening approval; nothing is published |

## 1. Back up and prepare (before any production change)

1. In the Cloudflare dashboard, open D1 `wavelength-volunteers` and note the current **Time Travel** point (date and
   time, UTC). Time Travel on the free plan keeps 7 days of restore points.
2. Optional extra copy: `npx wrangler d1 export wavelength-volunteers --remote --output backup-YYYYMMDD.sql`. Keep it
   private: it contains personal data. Store it encrypted, off the repository.
3. Note the current Worker version in Workers and Pages > wavelength-site > Deployments (the rollback target).
4. Pick a quiet time (early morning UK, not a Tuesday, when the newsletter cron runs at 07:30).

## 2. Production migrations (database `wavelength-volunteers`)

Apply **before** deploying the Worker. Both are additive: new tables, and new columns with defaults. Nothing is
dropped or rewritten.

| Migration | What it does | If skipped |
|---|---|---|
| `0014_business_analytics.sql` | `metric_daily`, `analytics_learner_days`, `bookings` (with `livemode`), `stripe_events`, `ledger`, `owner_time`, `business_settings`, `opportunities`; 11 new columns on `department_enquiries` | The Worker still runs: measurement is skipped and enquiries keep the new answers in the message text. The dashboard shows "not set up" |
| `0015_credential_authorisation.sql` | `supervisor_approvals.capacity` (default `supervisor`, so existing approvals keep their meaning); credential identity fields; `credential_confirmations`; accept and decline columns on `signoffs` and `assessments`; `directory_profiles.accepting_requests` (default on) | Review states, capacities and directory preferences check for the columns first. Directory-check admin actions and the listing-confirmation page need it |

Commands (with the Cloudflare tools, approval needed):

```
npx wrangler d1 execute wavelength-volunteers --remote --file migrations/0014_business_analytics.sql
npx wrangler d1 execute wavelength-volunteers --remote --file migrations/0015_credential_authorisation.sql
```

Checks:
- `SELECT name FROM sqlite_master WHERE name IN ('metric_daily','bookings','ledger','credential_confirmations')`
  returns four rows.
- `PRAGMA table_info(supervisor_approvals)` lists `capacity`.

**Rollback:** restore D1 to the Time Travel point from step 1 (Cloudflare dashboard, or
`npx wrangler d1 time-travel restore wavelength-volunteers --timestamp <ISO time>`). Restoring also removes any data
written since that point, so roll back promptly or prefer leaving the unused additive tables in place (they cost
nothing).

## 3. Deploy the Worker and website

- When GitHub is available: push the branch, open a pull request into `main`, review it, merge. Cloudflare builds and
  deploys every push to `main`. Without GitHub, a deploy from this machine (`npx wrangler deploy`) needs Fero's
  approval and Wrangler login.
- No new Worker variables are required. New routes: `/api/m`, `/api/stripe/webhook` (404 until step 5),
  `/api/confirm-listing`, `/admin/business/*`. All are covered by the existing `run_worker_first` entries for
  `/api/*` and `/admin/*`.
- **Rollback:** in the Cloudflare dashboard, Deployments, choose the version noted in step 1 and roll back. The
  additive database changes can stay.

## 4. Post-deployment checks (first hour)

| Check | How | Expected |
|---|---|---|
| Home, /training/, /pocus-logbook/, /privacy/, /app/ | Open in a browser at phone and desktop width | Pages load; no console errors; CTAs present |
| Enquiry form | Submit one enquiry marked "TEST" from /training/ | Thanks page; email to hello@; row in Training enquiries; remove the test row after |
| Measurement | Visit two pages, then open `/admin/business/website/` | Page views appear within a minute; "Not measured" before then |
| Objection switch | /privacy/, switch off, visit a page | Not counted |
| Logbook | Sign in to the store review account, log a scan, sync | Saved and synced; no errors |
| Sign-off request | From the review account to a test supervisor account | Arrives on the dashboard; accept, then decline with a reason; the learner sees it returned |
| Business dashboard | `/admin/business/` | Every tab loads; money tiles say "Not recorded" or £0 with no data |

## 5. Stripe bookings webhook (payment configuration, approval needed)

1. **Test first, safely:** in Stripe **test mode**, add an endpoint `https://thewavelength.co.uk/api/stripe/webhook`
   with the events below. Put the test signing secret in `STRIPE_WEBHOOK_SECRET`, then make a test-mode payment on a
   test Payment Link.
   - The booking appears on the Courses tab as a **test-mode booking (not counted)**.
   - Revenue, bookings taken and places stay unchanged (tested: `livemode false` never reaches a money figure).
2. Then add the **live-mode** endpoint with the same events and replace the secret with the live signing secret. Test
   endpoints and secrets do not receive live events.
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
3. Optional, recommended: add each date's Payment Link id as `stripePaymentLink` in `data/courses.json`, so every
   booking maps to its date.

How people pay does not change (Payment Links stay as they are). **Rollback:** delete the secret (the endpoint then
answers 404) or disable the endpoint in Stripe.

## 6. Privacy and data protection

- The privacy notice changes ship with the deploy:
  - measurement and the objection switch (PECR statistical-purposes exception as amended by the Data (Use and
    Access) Act 2025);
  - course bookings and payments;
  - checking supervisor credentials;
  - tailored training enquiries.
- Before the deploy: Fero (and the data protection adviser, if any) reviews `05-privacy-security-review.md` and the
  notice wording.
- Before the **first directory check**: DPIA screening for directory lookups and listed-contact confirmation emails.
  Record the decision.
- Records of processing: add the business ledger, owner time, bookings (no names) and enquiry pipeline.
- Store privacy answers: unchanged (no new data leaves the phone).

## 7. Credential verification safeguards (switches stay as they are)

- `PROFESSIONAL_VERIFY`, `DIRECTORY_PUBLIC` and `SUPERVISOR_SEARCH` stay **off** until their own approval. Each needs
  privacy notice, DPIA and store-answer updates (checklist in `docs/verification-architecture.md`, section 14).
- `SUPERVISOR_APPROVAL_REQUIRED` stays `false`. When it is turned on, capacity limits apply: a FAMUS mentor can
  witness and review but not sign summative assessments, for example (`data/supervision-policy.json`).
- Directory checks remain manual and individual: no scraping, bulk copying, republication or automated lookups. The
  GMC workflow is unchanged.
- Public wording never says "GMC verified", "FAMUS approved by Wavelength" or similar. Tests scan for these phrases.

## 8. Website changes

Live with step 3: navigation "Tailored Training", the free-logbook band, the supervision story, the UK and
International section, the wider enquiry form, the translated home sections and privacy notice updates. Translations
of the new home sections are machine-drafted: have a native speaker review them before promoting a language.

## 9. Mobile app release

- `src/app/app.js` changes (decline button, under-review note, returned-request text) reach the website app on deploy
  and store users only in the next Android and iOS build (GitHub Actions workflows, run by hand with a version
  number).
- The API stays backwards compatible: older store versions keep working, and the new routes are additions. Deploy the
  Worker before the store build.
- Before submitting: run the store-app checks (`node tools/e2e-native.mjs`) against a local Worker and update
  `mobile/STORE.md` only if a store answer changes (none expected).

## 10. Monitoring (first two weeks)

| What | Where | Watch for |
|---|---|---|
| D1 reads and writes | Cloudflare dashboard, D1 metrics | Daily writes far under the free-tier limit (measurement is capped at 4,000 beacon and 4,000 app writes per Worker instance per day) |
| Worker errors | Workers > wavelength-site > Metrics and Logs | 5xx rate; any rise after the deploy |
| Cron jobs | `/admin/supervisors/` System tab (`job_runs`) | Daily lifecycle job still runs at 05:15; the Tuesday newsletter still sends |
| Measurement | `/admin/business/website/` | Visits each day; channel mix plausible; "(other)" paths low |
| Enquiries | Training enquiries | Each enquiry also emailed to hello@ |
| Bookings | Courses tab | Stripe bookings match the Stripe dashboard; test-mode count only rises when you test |

## 11. Films

Version 2 films need Fero's viewing and **listening** approval before anything is posted: the narration voice and the
FAMUS and FUSIC pronunciation in particular (`13-pronunciation-glossary.md`). Post with the campaign links in
`06-campaign-links.md`. Version 1 films are kept, not approved.

## 12. External contact and permissions (not done)

- Draft proposals to SAM (FAMUS course approval) and the ICS (FUSIC) are in `08-commercial-strategy.md`; none has
  been sent.
- Before any automated or bulk use of FAMUS, FUSIC, BSE or EACVI directory data, ask each body in writing. The GMC
  Licensed Medical Register needs a signed agreement and a fee.

## Deliberately not done

- No payment model, paid tier or charge was implemented. The logbook, sign-off and records stay free.
- No production data was read beyond aggregate counts, and none was changed.
- No organisation was contacted and nothing was published. No paid service was used.
