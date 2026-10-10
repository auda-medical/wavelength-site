# Deployment readiness and approvals needed

Status on 10 October 2026: everything below is built and tested locally on branch `wavelength-business-20261010`.
**Nothing is deployed, no production migration is applied, and no Stripe, Cloudflare, store or external setting has
been changed.** Each numbered item needs Fero's explicit approval. The items are independent unless the text says
otherwise.

## Readiness at a glance

| Area | Built | Tested | Needs before live |
|---|---|---|---|
| Website: free logbook, supervision story, Tailored Training, UK and international, wider enquiry form | Yes | Unit tests and browser checks (22 page views, real enquiry) | Approval 1 and deploy (2) |
| Cookieless measurement and objection switch | Yes | Yes | Privacy notice goes live with the deploy; migration 0014 |
| Business dashboard `/admin/business/` (overview, website, logbook, supervision, courses, training, finance, time, marketing, opportunities, monthly, settings, CSV) | Yes | Yes | Migration 0014; optional Cloudflare Access owner role |
| Stripe bookings webhook | Yes, off by default | Signature, replay, refund tests | Approval 4 (Stripe dashboard) |
| Credential verification: directory checks, identity routes, nine states, capacities, listed-contact confirmation | Yes | Yes | Migration 0015; DPIA screening; privacy notice (drafted) |
| Asynchronous review: accept, decline with reason, review states | Yes (Worker and app) | Yes | Migration 0015; website app updates on deploy, store apps in the next store build |
| Three films (five MP4 formats plus 4K) | See `07-videos.md` and the render report | Objective checks only | Approval 7: watch and approve before publishing |
| Commercial strategy, proposals, partnership register | Documents only | n/a | Approvals 8 and 9 before any contact |

## 1. Merge the branch

- The work is on `wavelength-business-20261010` (local commits listed in `00-execution-record.md`).
- GitHub is unavailable, so nothing has been pushed.
- When GitHub is back: push the branch, open a pull request into `main`, review it, and merge only after items 2 and 3.

## 2. Production migrations (database `wavelength-volunteers`)

Apply **before** deploying the Worker. Both are additive: new tables, and new columns with defaults. Nothing is
dropped or rewritten.

| Migration | What it does | Risk |
|---|---|---|
| `0014_business_analytics.sql` | `metric_daily`, `analytics_learner_days`, `bookings`, `stripe_events`, `ledger`, `owner_time`, `business_settings`, `opportunities`; 11 new columns on `department_enquiries` (enquiry type, class, country, region, location, budget, heard, campaign, stage, stage date, quote) | Low. Without it the Worker still runs: measurement writes are skipped and enquiries keep the new answers in the message text |
| `0015_credential_authorisation.sql` | `supervisor_approvals.capacity` (default `supervisor`, so existing approvals keep their meaning); `credentials.identity_method`, `directory_fields`, `directory_checked_at`; `credential_confirmations`; accept and decline columns on `signoffs` and `assessments`; `directory_profiles.accepting_requests` (default on) | Low. The review states, capacities and directory preferences check for the columns first. The directory-check admin actions and the listing-confirmation page need it, so apply it before using them |

Suggested steps:

1. Note a D1 Time Travel recovery point.
2. Apply 0014 and then 0015 with the Cloudflare tools.
3. Check that the tables and columns exist.
4. Deploy (item 3).

Rollback: restore to the recovery point, or leave the additive tables in place (unused tables cost nothing).

D1 allowance: measurement is capped at 4,000 beacon writes and 4,000 app-activity writes per Worker instance per day,
well inside the free-tier limits. Watch D1 usage in the dashboard for the first week.

## 3. Deploy the website and Worker

- A push to `main` builds and deploys through Cloudflare Workers.
- No new Worker variables are required. New routes: `/api/m`, `/api/stripe/webhook` (404 until item 4),
  `/api/confirm-listing` and `/admin/business/*`. All are covered by the existing `run_worker_first: "/api/*"` and
  `"/admin/*"`.
- After deploying:
  - load /, /training/, /pocus-logbook/ and /privacy/;
  - submit one test enquiry;
  - open `/admin/business/`;
  - check that the Website tab counts the visit the next day.
- Rollback: redeploy the previous Worker version from the Cloudflare dashboard. Additive tables can stay.

## 4. Stripe bookings webhook (payment configuration)

1. In Stripe, add a webhook endpoint `https://thewavelength.co.uk/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
2. Put its signing secret in the Worker secret `STRIPE_WEBHOOK_SECRET` (Cloudflare dashboard, Variables and secrets).
3. Optional but recommended: add each date's Payment Link id as `stripePaymentLink` in `data/courses.json`, so every
   booking maps to its course date (otherwise a booking is matched by price only when one date has that price).

Nothing about how people pay changes: Payment Links stay as they are. The webhook only records bookings. Until it is
on, the dashboard shows booking clicks as "initiated" and real bookings only when entered by hand.

## 5. Privacy and data protection

- The privacy notice changes ship with the deploy:
  - measurement and the objection switch;
  - course bookings;
  - checking supervisor credentials;
  - tailored training enquiries.
  Review the wording first (see `05-privacy-security-review.md`).
- DPIA screening for directory checks and listed-contact confirmation emails before the first directory check.
- Store privacy answers: unchanged (no new data leaves the phone). The analytics architecture keeps it that way.

## 6. Store apps

`src/app/app.js` changes (decline button, under-review note, returned-request text) reach the website app on deploy
and store users in the next Android and iOS build. The API stays backwards compatible: older store versions keep
working, and the new routes are additions.

## 7. Films

Watch and listen to each film, then approve them or ask for changes before anything is posted (`07-videos.md`,
section 7). Post with the campaign links in `06-campaign-links.md`.

## 8. External contact (not done)

Draft proposals to SAM (FAMUS course approval) and the ICS (FUSIC) are in `08-commercial-strategy.md`. None has been
sent. Any contact with a professional body, trust, university or partner needs approval of the text and the recipient.

## 9. Directory permissions

Wavelength looks up the FAMUS, FUSIC, BSE and EACVI directories one person at a time by an administrator, with no
copying. Before any automated or bulk use, ask each body in writing for permission (`03-credential-verification.md`).
The GMC Licensed Medical Register would need a signed agreement and a fee.

## 10. Optional and not required now

- Cloudflare Web Analytics as a cross-check (free, cookieless): switch on in the dashboard if wanted.
- Cloudflare Access for `/admin/*` with roles (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`).
- No paid service, subscription or billable API is needed for anything in this project.

## Things that were deliberately not done

- No payment model, paid tier or charge was implemented. The logbook, sign-off and records stay free.
- No production data was changed. Live D1 was read only as aggregate counts, for the baseline.
- No organisation was contacted and nothing was published.
