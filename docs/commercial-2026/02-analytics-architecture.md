# Phase 2: analytics architecture and event catalogue

Status: implemented locally (migration `0014_business_analytics.sql`, `worker/metrics.js`, `worker/business.js`,
`worker/bookings.js`). Not deployed. Migration not applied to production.

## 1. Principles

1. **First-party and aggregate.** The existing Worker writes counters to the existing D1 database. No third-party
   analytics script, no advertising pixels, no cookies, no device identifiers, no fingerprinting.
2. **Authoritative records first.** Where a business table already records an action (registration, logbook entry,
   sign-off, assessment, evidence summary, enquiry, booking), reports count that table. Counters are used only for
   what no table records (page views, sources, button clicks, failures, errors, daily activity).
3. **Nothing clinical, ever.** No findings, images, clips, reflections, free text, patient details, names or emails
   enter any analytics table or counter. Dimensions are fixed labels (route names, page paths from the site's own
   list, scan type ids are not used either).
4. **Analytics can fail; the product cannot.** Every analytics write runs after the response, inside `try/catch`,
   through `ctx.waitUntil`. A failure is dropped silently.
5. **Bounded cost.** Writes are capped per Worker instance per day and batched, so measurement can never use up the
   D1 free-tier daily allowance (enforced since 1 September 2026) that logins and sync depend on.
6. **Zero is not unknown.** Reports show "Not measured" where no source existed for the period (for example website
   visits before the measurement start date), and 0 only when the source existed and counted nothing.

## 2. Components

```
 Browser (site pages)                       Worker (worker/index.js)                    D1 (wavelength-volunteers)
 ─────────────────────                      ────────────────────────                    ──────────────────────────
 main.js measure()  ── POST /api/m ───────▶ metrics.js beacon()  ── capped batch ─────▶ metric_daily (aggregate)
   page view, entry, CTA click                bot filter, GPC/DNT, path allowlist
                                              source/channel, country, device

 App (/api/app/*)   ── existing calls ────▶ app.js handleApp()  ── after response ────▶ metric_daily (features, failures, 5xx)
                                              metrics.appEvent()                         analytics_learner_days (activity)

 Stripe (optional)  ── POST /api/stripe ──▶ bookings.js webhook  ── idempotent ───────▶ stripe_events, bookings
                                              signature check, off without secret

 Training form      ── POST /api/training/enquire ─▶ departments.js ──────────────────▶ department_enquiries (+ new columns)

 Owner              ── /admin/business/ ──▶ business.js (owner role only) ─ reads ───▶ all of the above + ledger, owner_time
```

## 3. Data model (migration 0014)

| Table | Holds | Personal data | Retention |
|---|---|---|---|
| `metric_daily (day, metric, dim, n)` | Aggregate counters by UTC day | None | Kept (aggregate) |
| `analytics_learner_days (learner_id, day)` | One row per account per day the app was used | Pseudonymous (account id only) | 13 months, then deleted after the day's totals are rolled into `metric_daily`. Deleted with the account. |
| `bookings` | Paid, pending, refunded and cancelled course bookings: course, date, amounts in pence, Stripe ids, campaign label, attendance | No names or emails. Stripe ids link to Stripe, where the customer record lives. | 6 years (accounting) |
| `stripe_events (id, type, received_at, outcome)` | Every Stripe event id processed, for idempotency | None | 2 years |
| `ledger` | Income and expense lines: date, category, service, amounts, VAT, actual or estimate, reference, void | Supplier names may appear in descriptions: owner-only | 6 years (accounting) |
| `owner_time` | Optional owner time: date, activity, service, minutes | The owner's own time | Kept while useful |
| `business_settings (key, value)` | Measurement start date, VAT registration status, targets | None | Kept |
| `department_enquiries` (new columns) | Enquiry type, class, country, region, location, budget band, self-reported source, campaign label, participants, stage, stage date, quote, outcome | Already personal (enquiry) | Unchanged: 2 years, or with booking records |

## 4. Event catalogue

### 4.1 Website (browser beacon, aggregate only)

| Metric | Dimension | Counted when | Definition and limits |
|---|---|---|---|
| `pv` | `''` | Any page view | A page load in a browser that runs JavaScript and has not objected. Excludes bots that identify themselves, headless browsers, Global Privacy Control, Do Not Track and visitors who switched measurement off. |
| `pv.path` | page path | Any page view | Path from the site's own page list; anything else is `(other)`. Query strings are dropped. |
| `visit` | `''` | Entry page view | **Visits (estimated):** a page view whose referrer is not this website and that is not a reload. Not a count of people: one person on two devices, or returning tomorrow, is two visits; nobody is recognised across visits. |
| `visit.path` | landing page | Entry | Landing page of the visit. |
| `visit.channel` | `search`, `social`, `email`, `campaign`, `qr`, `referral`, `direct` | Entry | Rules in section 5. |
| `visit.source` | `source / medium` | Entry | From UTM parameters, else the referring host's group (for example `google / organic`). |
| `visit.campaign` | campaign label | Entry with `utm_campaign` | Sanitised to lower-case letters, digits, `-` and `_`, 60 characters. |
| `visit.ref` | referring host | Entry from another site | Host only (no path or query). |
| `visit.country` | ISO country code | Entry | From Cloudflare's IP geolocation (`request.cf.country`); the IP address is never stored. `XX` when unknown. |
| `visit.device` | `mobile`, `tablet`, `desktop` | Entry | From the User-Agent header's broad class. Screen size is not read. |
| `ev.book` | course page path | "Book now" click to Stripe | **Booking initiation**, not a booking. |
| `ev.cta` | CTA label | Click on an element with `data-m` | Labels such as `home-tailored`, `training-enquire`, `logbook-start`. |
| `ev.enquiry_start` | `training` | First interaction with the enquiry form | Form engagement; the content is never read. |

Counted server-side as conversions (no browser involvement):

| Metric | Dimension | Counted when |
|---|---|---|
| `conv.enquiry` | channel (self-reported) | A training enquiry is saved |
| `conv.enquiry_campaign` | campaign label | A saved enquiry carried a campaign label |
| `conv.signup` | `web` or `app` | A new logbook account is created (see 4.2) |

### 4.2 Logbook (server-side, from authoritative responses)

| Metric | Source | Definition |
|---|---|---|
| Registered accounts | `learners` with `password_hash` | App accounts that exist now (deleted accounts are gone). Academy-only learners are counted separately. |
| New registrations | `learners.created_at` (app accounts) | Accounts created in the period. An Academy learner who later adds a password counts on the Academy date (the table has no separate date). |
| Completed registrations (email verified) | `learners.email_status = 'verified'` | Accounts whose owner opened the verification link. |
| `app.signup` (counter) | `POST signup` → 200 | Successful new accounts, counted at the time of sign-up. |
| `app.signup_fail` / reason | `POST signup` → 400 | Reasons: `name`, `email`, `password`, `terms`, `organisation`, `other`. 202 "check your email" (existing email) is `app.signup_existing`, not a failure. |
| `app.login` / `app.login_fail` / `app.login_locked` | `POST login` → 200 / 401 / 429 | |
| First successful scan entry | `MIN(logbook_entries.created_at)` per account | First entry saved to the server. Entries kept only on the phone are not visible. |
| Activity (DAU / WAU / MAU) | `analytics_learner_days` | An account is active on a day when it makes at least one authenticated `/api/app/*` request (sync, sign-off, assessment and so on). Opening the app offline is not visible until it syncs. WAU and MAU are distinct accounts over 7 and 30 days ending on the day. |
| Returning users | `analytics_learner_days` | Accounts active in the period that were also active before it. |
| Retention (cohort) | registration month × activity | Share of accounts registered in month M that were active in month M+k. Only from the measurement start date. |
| Feature usage | `signoffs`, `assessments`, `evidence_summaries`, `supervisor_links`, `logbook_entries` | Counts by creation date; signed sign-offs by `signed_at`. |
| `app.feature` / route | `POST` routes → 200 | Server-confirmed workflow completions: `signoff/request`, `signoff/inperson`, `signoff/complete`, `supervise/signoff`, `assessment/request`, `assessment/inperson`, `assessment/complete`, `supervise/assessment`, `evidence`, `supervisors/add`, `supervisors/accept`, `signoff/images`, `account/delete`. |
| `app.entries_created` | `POST sync` | New (not previously synced) entries saved. |
| `app.error` / route | any `/api/app/*` → 5xx | Server errors, by route pattern only. |

### 4.3 Supervisor verification (server-side)

Counted from existing tables (`supervisor_applications`, `professional_registrations`, `credentials`,
`supervisor_approvals`, `verification_events`) and new counters:

| Metric | Definition |
|---|---|
| Supervisor applications started / submitted / approved / rejected / withdrawn | By date of the state change. |
| Verification success rate | Approved ÷ decided (approved + rejected) in the period. Pending and more-information cases are shown separately. |
| FAMUS directory checks | `verification_events` of kind `famus_check` by outcome (matched, partly matched, not listed). |
| Supervision requests | Sign-off and assessment requests created (link and dashboard), by date. |
| Completed sign-offs | Sign-offs with `signed_at` in the period, by route (in person, link, dashboard). |

### 4.4 Courses and bookings

| Measure | Source | Definition |
|---|---|---|
| Course page visits | `pv.path` for `/courses/<slug>/` | Page views (estimated, see 4.1). |
| Booking initiation | `ev.book` | Clicks on "Book now". **Not sales.** |
| Pending bookings | `bookings.status = 'pending'` | Invoice requested or payment not yet confirmed. |
| Confirmed paid bookings | `bookings.status IN ('paid','part_refunded')` | From a verified Stripe webhook (`checkout.session.completed` with `payment_status = 'paid'`, or `async_payment_succeeded`) or entered by the owner with a payment reference. |
| Refunds | `bookings.refund_pence` | From `charge.refunded` or entered by hand. |
| Cancellations | `bookings.status = 'cancelled'` | |
| Attendance | `bookings.attended` | Recorded by the owner after the day. Unrecorded is shown as unrecorded. |
| Places sold, available, occupancy | bookings vs `capacity` in `data/courses.json` | Occupancy = places in paid bookings ÷ capacity. |
| Gross revenue | sum of `gross_pence` of paid bookings | Amount charged, including any VAT. |
| Net revenue | gross − refunds | |
| Delivery costs | `ledger` expense lines linked to the course date (`course:<slug>@<date>`) | Actual and estimate shown separately. |
| Profit per course | net revenue − delivery costs − payment fees | Payment fees from Stripe when known, else an estimate marked as such. |
| Bookings taken | paid bookings by payment (or recording) date, gross − refunds | Shown on the overview beside net revenue, so money for a later course is visible the day it is paid. |

Dating rule (matching): revenue from a booking belongs to its course date, and so does any cost linked to that course
date (`ledgerDay`), wherever the money moved. A venue paid in October for a December course therefore counts in
December with the course's revenue. Unlinked ledger lines count on the date entered. "Bookings taken" is the cash view.

### 4.5 Tailored training

| Measure | Source |
|---|---|
| Enquiries; individual / group / organisation; UK / international | `department_enquiries` (`enquiry_class`, `region`) |
| Requested modules, participants, budget band, source | Enquiry structured fields |
| Pipeline: qualified, proposal issued, quotation accepted, declined, booked, lost | `stage` set by the owner in the admin console |
| Training revenue, delivery costs, profit | `ledger` lines linked to `training:<enquiry id>` |
| Enquiry-to-booking conversion | booked ÷ enquiries received in the period (cohort by enquiry date) |

### 4.6 Finance definitions

All amounts are integers in pence. Totals are shown in pounds.

| Term | Definition |
|---|---|
| Gross revenue | Paid course bookings (gross) + ledger income lines |
| Refunds | Booking refunds + ledger `refunds` lines |
| Net revenue | Gross revenue − refunds |
| VAT basis | If the owner records "VAT registered: yes", profit uses amounts excluding recorded VAT. If "no", amounts are used as paid (VAT on costs is a cost). If not recorded, amounts as paid, with a warning. |
| Direct costs | Expense categories venue, faculty, equipment, consumables, catering, travel, accommodation, payment fees, other direct |
| Gross profit | Net revenue − direct costs |
| Operating costs | Marketing, software, insurance, professional fees, other overheads |
| Operating profit | Gross profit − operating costs. A management figure before tax and before any owner salary or dividends. Not statutory accounts. |
| Margin | Profit ÷ net revenue, shown only when net revenue > 0 |
| Revenue per customer | Net revenue from paid bookings ÷ paid places (courses); per enquiry for training |
| Profit per owner hour (indicative) | Gross profit of a service ÷ owner hours logged against it. A management measure only; it is not pay and not accounting profit. |
| Monthly growth | (this month − last month) ÷ last month, shown only when last month > 0 |

## 5. Channel rules (visits)

In order:
1. `utm_medium` is `qr` → `qr`.
2. `utm_medium` in `email`, `newsletter` → `email`.
3. `utm_source` or `utm_campaign` present → `campaign` (source and medium recorded as given).
4. Referrer host is a search engine (Google, Bing, DuckDuckGo, Yahoo, Ecosia, Baidu, Yandex, Brave) → `search`.
5. Referrer host is a social network (LinkedIn, lnkd.in, Instagram, Facebook, fb.me, t.co, X, Twitter, YouTube,
   WhatsApp) → `social`.
6. Any other referrer host → `referral`.
7. No referrer → `direct` (typed address, bookmark, app link, or a browser that removed the referrer).

Measured attribution: channel and campaign come from the link the visitor used. Estimated attribution: the enquiry
form's "How did you hear about us?" is what the person says. Reports label each.

## 6. Campaign links

`tools/campaign-links.mjs` prints UTM links and a QR SVG for each planned campaign (videos, LinkedIn, Instagram,
Facebook, newsletter, course announcements, Pearls, guides, printed QR codes). Convention:

```
https://thewavelength.co.uk/<page>?utm_source=<linkedin|instagram|facebook|newsletter|qr|youtube>&utm_medium=<social|email|qr|video|print>&utm_campaign=<yyyy-mm-short-name>&utm_content=<variant>
```

A campaign label (not the person) travels with an enquiry or Stripe booking as `client_reference_id` when the visitor
arrived through a tagged link in the same browser tab, so verified bookings can be credited to a campaign.

## 7. Write budget

Per Worker instance per UTC day: at most 4,000 beacon batches and 4,000 app-event writes. A batch is one D1 call of
2 to 10 upserts. Per IP address (hashed in memory, never stored): 60 beacons a minute. At Wavelength's current scale
(tens of visits a day) the measurement uses well under 1% of the free daily write allowance; the caps keep a bot
flood below about a quarter of it even with several instances.

## 8. Scaling path (not needed now)

If traffic outgrows D1 counters: Workers Analytics Engine (writes sampled at high volume; queries need an API token in
a Worker secret). Cloudflare Web Analytics can be switched on as an independent cross-check by setting
`analytics.cfBeacon` in `data/site.json` to the site token from the Cloudflare dashboard (free); it is off by default
and the privacy notice must mention it before use.
