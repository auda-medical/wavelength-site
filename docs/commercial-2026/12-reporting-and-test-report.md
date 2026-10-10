# Monthly reporting framework and test report

## Part 1: monthly reporting framework

The dashboard's Monthly report tab (`/admin/business/monthly/?m=YYYY-MM`) builds the report from measured data and
the owner's entries. It compares each figure with the previous month and lists rule-based flags. It prints or saves as
PDF, and downloads as CSV. It is a management report: figures without a source say "Not measured" instead of showing
zero.

### Before the report (about 20 minutes, first working day of the month)

| Entry | Where | Why it matters |
|---|---|---|
| Ledger: every cost and any income not from Stripe (tailored training invoices, sponsorship) with VAT treatment and actual or estimate | Finance | Profit is only as complete as the ledger |
| Link course costs to their course date (venue, faculty, equipment) | Finance, "Linked to" | Puts each course's costs in the same month as its revenue and gives the per-course profit |
| Owner time by activity and stream | Owner time | Profit per owner hour; shows where time goes |
| Bookings paid by invoice or bank transfer; refunds; attendance after each course | Courses | Stripe records card bookings only |
| Enquiry stages (qualified, proposal, accepted, booked, lost) and quote values | Tailored training | Pipeline and conversion |
| Opportunity register: status changes and next actions | Opportunities | Keeps commercial work deliberate |

### The report

| Section | Measures | Source and reliability |
|---|---|---|
| Summary lines | Plain sentences for the month against the previous month | Generated from the measures below |
| Website | Visits (estimated), by channel and campaign | Cookieless beacon; estimates |
| Logbook | New accounts, first scans, active accounts (30 days), sign-offs completed | Server records; measured |
| Tailored training | Enquiries, UK or international, individual, group or organisation; booked | Form records and stages; measured |
| Courses | Paid places, occupancy | Stripe webhook or recorded bookings; measured |
| Money | Net revenue, gross profit, operating profit, margin, by stream; bookings taken | Bookings and ledger; actual or estimate as entered |
| What to look at | Rule-based flags: sign-off requests waiting for a supervisor, low activation of new accounts, training enquiries left at New for over 7 days, places sold for upcoming course dates, Stripe bookings with no course date | Rules stating measured facts, not judgements |

### Reading it: questions for each month

1. **Free logbook:** are new accounts turning into first scans and sign-offs? Activation (first scan) matters more than
   sign-ups.
2. **Supervision:** are requests being reviewed? Turnaround and open requests show whether asynchronous review works.
3. **Courses:** is occupancy above the break-even place count in `08-commercial-strategy.md`, at the price charged?
4. **Tailored training:** how many enquiries became proposals, and proposals bookings? Which channels sent them?
5. **Owner time:** which stream earns most per owner hour? Does the time spent match the priorities?
6. **Marketing:** which campaign links produced enquiries or bookings, not just visits?

### Keeping it honest

- Projections stay in the strategy document as labelled scenarios. The monthly report shows recorded figures only.
- No figure is copied into public material without checking its source. User numbers, ratings and growth claims are
  not published until they are real and the owner chooses to share them.
- A quarterly review compares actual results with the central scenario and updates the assumptions in
  `08-commercial-strategy.md`.

## Part 2: test report (10 October 2026)

### Automated tests

| Run | Command | Result |
|---|---|---|
| Baseline before the project (Windows checkout) | `node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs` | 315 tests: 311 pass, 3 fail (CRLF), 1 skipped |
| End of project (Windows checkout) | same | 359 tests: 355 pass, 3 fail (the same CRLF cases), 1 skipped |
| End of project (LF checkout of commit `60fdf92`) | same, on a clone with `core.autocrlf=false` | 359 tests: 358 pass, 0 fail, 1 skipped |

New test files and what they prove:

- `test/business-analytics.test.mjs` (21):
  - channel classification, path limits, devices;
  - beacon refusals (bots, GPC, DNT, origin, junk) and caps;
  - app events by route and status only;
  - activity rows and deletion;
  - measurement never breaks sign-up or sync without migration 0014;
  - roll-up and purge;
  - profit and loss arithmetic, VAT basis and voids;
  - course-date matching of costs and bookings taken;
  - date ranges, funnels, campaign links;
  - Stripe signature, staleness, replay, duplicates and refunds;
  - course matching;
  - dashboard login, roles, every tab rendering with no "undefined", "NaN" or double-encoded characters;
  - ledger, time, bookings and settings entry;
  - exports without contact details.
- `test/credential-authority.test.mjs` (15):
  - capacities per pathway and action;
  - mentor limits;
  - directory match never verifies alone;
  - each identity route;
  - single-use listed-contact links and "This is not me";
  - nine states;
  - GMC workflow preserved, and GMC alone grants nothing;
  - snapshots record authority.
- `test/tailored-training.test.mjs` (8): individual, group and organisation enquiries; international phone numbers and
  countries; region and class; campaign; legacy values; storage without migration 0014; admin list; exports.

### Browser checks (Chrome, local Worker, fictional data)

| Check | Script | Result |
|---|---|---|
| 11 website pages at 390 and 1440 px (22 views) | `video/scripts/site-check.mjs` | No overflow, console errors, missing alt text, unlabelled fields, heading skips or broken internal links; one H1 per page; structured data parses |
| Real enquiry, campaign attribution, objection switch | same | Stored with region, class and campaign; counters recorded; objection respected |
| Business dashboard, 12 tabs at 1440 and 390 px (24 views) with 60 days of fictional traffic, bookings, ledger, time and opportunities | `video/scripts/dashboard-check.mjs` | No overflow, console errors, "undefined", "NaN" or double-encoded characters. Per-course profit checked by hand (7 places, £2,765 gross, £42 estimated fees, £600 venue, £2,123 profit, 76.8%) |
| App screens for the films (sign-off, export, supervisors, verify) | `video/scripts/capture.mjs` | Captured without console errors |

Defects found by these checks and fixed:

- `worker/business.js` had double-encoded characters: "Â£" for "£", and broken dashes, "·" and "÷". Fixed, and a test
  now fails if it happens again.
- Course costs paid before a course counted in the month paid, while the course's revenue counted on the course date.
  Costs linked to a course date now count on that date, and the overview adds "Bookings taken" (cash by payment
  date).

### Video checks

See `07-videos.md` section 5 and `render-report.json` beside the films: per-line transcription error rate, integrated
loudness and peaks, stills at every scene change.

### Not tested

Production D1 behaviour and limits, real Stripe events, Safari and Firefox, real phones for the website, an external
penetration test, and human review of the films.
