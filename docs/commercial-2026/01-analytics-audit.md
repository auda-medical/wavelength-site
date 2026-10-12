# Phase 1: analytics audit and baseline

Date: 10 October 2026. Source: Wavelength 1.0.12 (commit 90a8e6a), the live D1 database (aggregate counts only,
read-only) and the Cloudflare account (Worker metadata only).

## 1. Summary

Wavelength had no business measurement before this project:

- **Website:** no analytics of any kind. The privacy notice says "This website uses no analytics, tracking or
  advertising cookies". No visitor, page view, source or campaign numbers exist anywhere Wavelength controls.
- **Bookings:** Stripe Payment Links only. The Worker has no Stripe code, no webhook and no booking table, so no
  booking, payment, refund or attendance record exists outside Stripe.
- **Logbook:** account and logbook tables exist, so registrations, first scans and current totals can be counted
  from real data. Daily, weekly and monthly activity cannot be rebuilt for the past: nothing records when an account
  was used, except login time and the last edit of each entry.
- **Training enquiries:** stored in D1 (`department_enquiries`) with no stage, source, quote or outcome fields.
- **Finance:** nothing in the system. No costs, fees, owner time or profit records.

The baseline is therefore small and mostly "not measured". This project measures from day one of deployment and
does not rebuild figures that were never recorded.

## 2. What exists today

| Area | What exists | Reliable history? |
|---|---|---|
| Cloudflare Web Analytics | No beacon in the built pages. Whether the zone has automatic Web Analytics injection turned on in the dashboard could not be checked with the available tools. | No data held by Wavelength |
| Cloudflare zone analytics | Request counts in the Cloudflare dashboard (all requests, including bots and assets). Not available to the Worker or the admin console. | Dashboard only, not visitor-level |
| Workers | One Worker, `wavelength-site` (static assets plus `worker/index.js`). Request log: one allowlisted JSON line per `/api/app/*` request (`worker/log.js`) to Workers logs, not stored. | No stored history |
| D1 | One database, `wavelength-volunteers`, migrations 0001 to 0013 applied. | Yes, for the records below |
| Workers Analytics Engine | Not configured (no binding in `wrangler.jsonc`). | None |
| KV | `SHARED_IMAGES` (encrypted sign-off images, 14-day expiry). Not used for analytics. | n/a |
| Registration and authentication | `learners` (Academy and app accounts): `created_at`, `last_seen` (set at registration and password login only, not on each use), `password_hash` (present for app accounts), `email_status`. Login failures update `failed_logins`; no history of failures. | Registrations: yes. Activity: no |
| Logbook usage | `logbook_entries`: `created_at`, `updated_at` (last change only), `deleted`. `signoffs`, `assessments`, `evidence_summaries`, `supervisor_links` with created and signed dates. | First scans and totals: yes. Repeat use over time: no |
| Course booking | Stripe Payment Link per date in `data/courses.json` (`stripeLink`), `capacity` and `places` typed by hand. No webhook. | No |
| Payments | Stripe only. The Stripe connector needs owner authentication and was not used. | Not accessible in this project |
| Training enquiries | `department_enquiries` (form at /training/), `contacted` flag only. Email to hello@ through ZeptoMail. | Count: yes. Outcomes: no |
| Administrative reports | Admin console sections: volunteers, Academy (counts, attempts, feedback), supervisors, organisations, faculty, departments, newsletter, logins. CSV exports. No business or financial reporting. | n/a |
| Google Search Console | Domain property verified by the owner's Google account, sitemap submitted (CLAUDE.md). No API connection. Data stays in Search Console. | In Search Console (16 months) |
| Newsletter | Zoho Campaigns holds opens and clicks. `newsletter_sends` logs sends (0 so far). | In Zoho |
| Social accounts | LinkedIn (`https://www.linkedin.com/company/the-wavelength/`) and Instagram (`https://www.instagram.com/thewavelength.co.uk/`) in `data/site.json`. No Facebook account is configured, so none is used. | n/a |

## 3. Baseline from real data (read 10 October 2026)

Queries run against the live database (read-only, aggregate only; no row-level personal data was read):

```sql
SELECT (SELECT COUNT(*) FROM learners) AS learners, (SELECT MIN(created_at) FROM learners) AS learners_first,
  (SELECT COUNT(*) FROM learners WHERE password_hash IS NOT NULL) AS app_accounts, ... -- see execution record
SELECT substr(created_at,1,10) AS day, COUNT(*) ... FROM learners GROUP BY day;
SELECT (SELECT COUNT(*) FROM signoffs) ..., (SELECT COUNT(*) FROM attempts) ...;
```

| Measure | Value | Notes |
|---|---|---|
| Learner records (Academy and app) | 11 | First on 3 October 2026 |
| App accounts (with a password) | 7 | |
| Registrations by day | 3 Oct: 2, 4 Oct: 2, 6 Oct: 2, 8 Oct: 2, 9 Oct: 3 | Includes at least 1 account on the company domain. Test and store-review accounts cannot be separated from real users without reading records, which was not done. |
| Learners with a login or registration in the last 7 days | 11 | `last_seen` is set only at registration and password login, so this is not "active users". |
| Live logbook entries | 9 | First on 4 October 2026 |
| Learners with at least one entry | 4 | 4 of 7 app accounts (57%), before removing test accounts |
| Sign-offs (all signed) | 3 | |
| Structured assessments | 0 | |
| Supervisor links | 3 | |
| Supervisor applications | 1 | |
| Verified evidence summaries | 1 | |
| Academy attempts / certificates / feedback | 6 / 6 / 3 | |
| Newsletter box ticked (learners) | 6 | Ticking is not subscribing: Zoho double opt-in decides. |
| Training enquiries | 1 | First on 9 October 2026 |
| Faculty applications / volunteers | 0 / 0 | |
| Course bookings and revenue | Not available | Stripe only. Next date 21 December 2026, Darent Valley Hospital, 25 places, £375. |
| Website visitors, page views, sources | Not measured | No analytics existed. |

What the baseline means: Wavelength launched its app and Academy in the first week of October 2026, so any trend
would rest on a handful of records, some of them internal tests. Reports from this project mark "not measured" where
no data exists and never turn it into zero.

## 4. Constraints found

1. **D1 free-tier limits are enforced since 1 September 2026.** On the Workers Free plan, D1 queries fail for the rest
   of the UTC day once the account passes its daily row-read or row-write allowance. Logins, sync and sign-off all use
   D1, so analytics must not be able to exhaust it. Design response: capped, batched writes; aggregate tables; no
   per-request D1 rate-limit writes for the measurement endpoint.
2. **KV free tier allows 1,000 writes a day.** KV is not suitable for counting.
3. **Cron triggers:** three are configured. A new cron is not needed for this project (roll-ups run when the dashboard
   is opened).
4. **PECR (amended by the Data (Use and Access) Act 2025, in force since 5 February 2026):** storage of, or access to,
   information on a visitor's device for statistical purposes, to improve the website or service, no longer needs
   consent, provided visitors get clear information and a simple, free way to object. It does not cover identifying,
   tracking or monitoring individuals. ICO guidance on storage and access technologies was finalised on 29 April 2026.
   Design response: no cookies and no identifiers; clear notice; an objection switch that works on every page;
   Global Privacy Control and Do Not Track honoured. Details in `05-privacy-security-review.md`.
5. **Stripe:** no API key or connector access. Design response: an optional, verified webhook receiver that stays off
   until the owner adds a webhook secret, plus manual booking entry.
6. **Windows checkout:** `npm test` runs no tests on Windows and 3 tests fail on CRLF line endings (see the
   execution record). All test results in this project come from the Git Bash command.

## 5. Gaps this project closes

| Question the owner asked | Data needed | Source after this project |
|---|---|---|
| Which marketing channels attract customers? | Visits by source and campaign; enquiries and bookings by source | First-party measurement (aggregate), UTM links, "How did you hear about us?" on the enquiry form, campaign label on Stripe bookings |
| Which courses make the most profit? | Paid bookings, refunds, fees, course costs | Bookings (webhook or manual) plus the cost ledger |
| Which services give the best profit per owner hour? | Profit per service and owner time | Ledger plus optional owner time log |
| Which training modules attract most interest? | Modules requested in enquiries | Enquiry form (structured choices) |
| What share of visitors become logbook users? | Visits and new app accounts | Measurement plus `learners` |
| What share of enquiries become bookings? | Enquiry stages | Enquiry pipeline in the admin console |
| How many users keep using the logbook? | Days each account was used | `analytics_learner_days` (new, retained 13 months) |
| Which activities are recurring or scalable? | Revenue by service type with owner hours | Ledger categories plus time log |
