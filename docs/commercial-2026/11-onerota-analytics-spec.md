# OneRota analytics: specification only

OneRota was **not modified**. This specification was written from a read-only look at the OneRota source
(`C:\Users\phira\OneRota`, 10 October 2026). That source is a Cloudflare Worker with a private R2 bucket per hospital,
records under `hospitals/<hospital>/departments/<department>/`, and Supabase or Cloudflare Access login restricted to
nhs.net. It already has personal analytics for each member (their own hours and shifts). This document covers
**service** analytics for the owner: is OneRota used, by how many departments, and is it worth developing
commercially. It reuses the Wavelength approach (`02-analytics-architecture.md`) where that fits.

## 1. Principles

1. **No staff personal data in analytics.** OneRota holds names, emails, shifts, leave requests, allocations and
   **sickness records**: sickness is health data (special category). None of these may enter an analytics record,
   even as a count for a named person. Analytics counts actions by department per day, never per person.
2. **Hospital isolation stays intact.** Each department's counters live under its own prefix in its own hospital
   bucket, exactly like its records. The owner's cross-hospital view reads totals only, and only for departments
   whose agreement allows it.
3. **The department is the customer.** If OneRota is offered to other trusts, the department (or trust) is the
   controller of its rota records and OneRota is a processor. Service analytics about the department's use of the
   product must be covered by the contract and the privacy notice (see section 6).
4. **Nothing third-party.** No analytics script, no cookies for measurement, no session replay.
5. **Fail silent and capped**, as in Wavelength: analytics never blocks a request and has a daily write ceiling.

## 2. Storage

R2 is the store OneRota already uses, so no new product is needed. A D1 database would be simpler for querying, but
it adds a product and a data location to each hospital's hosting arrangements.

| Object | Key | Content |
|---|---|---|
| Daily counters | `hospitals/<h>/departments/<d>/analytics/daily/<yyyy-mm-dd>.json` | `{ "metric|dim": n }`, written in memory and flushed once per minute or per 50 increments (R2 Class A operations stay low) |
| Active-member days | `.../analytics/active/<yyyy-mm>.json` | Number of distinct members active each day, computed from hashed member keys **held only in memory for the day** and stored as a number. No member key is written |
| Monthly roll-up | `.../analytics/monthly/<yyyy-mm>.json` | Totals for the month; daily files older than 13 months deleted |

The portal Worker (hospital chooser) keeps one cross-hospital file, `portal/analytics/departments.json`, holding only
each department's monthly totals, copied by a scheduled job.

## 3. Event catalogue

Counted by route and outcome inside `worker/api.js` handlers, after the response is decided. Dimensions are fixed
lists. Free text never becomes a dimension.

| Metric | Dimensions | Purpose |
|---|---|---|
| `login` | method (supabase, access), outcome (ok, refused_domain, not_member, otp_failed) | Can staff get in? Where do they fail? |
| `member.approve` / `member.remove` | role band (consultant, junior, other) | Department growth |
| `active.members` | none (daily number) | Weekly and monthly active members as a share of members |
| `rota.view` | view (week, month, personal) | Which views matter |
| `rota.publish` / `rota.import` | outcome (ok, failed_parse, failed_validation) | Admin workload and import reliability |
| `request.create` / `request.decide` | type (leave, swap, preference), decision (approved, declined) | Requests flow. **No dates, names or reasons** |
| `allocation.change` | none | Coordinator workload |
| `note.create` | none | Use of shift notes. **Never the note text** |
| `sickness.record` | **not counted** | Excluded deliberately: even a daily count in a small department can identify a person's sickness |
| `calendar.subscribe` / `calendar.fetch` | outcome | Calendar feature uptake, once `CALENDAR_FEED_ENABLED` is on. Never log the token |
| `error` | route group, status class (4xx, 5xx) | Reliability |

Small-number rule: any monthly count below 5 is shown as "fewer than 5" in every report that leaves the department's
own admin view. This stops counts being linked to individuals in small teams.

## 4. Reports

| Report | Audience | Shows |
|---|---|---|
| Department admin page | That department's rota owner | Members, weekly active share, requests decided and median time to decision, imports and failures, calendar uptake |
| Owner portfolio view | Fero | Departments live, members and active share for each department, errors, month-on-month growth. Totals only |
| Commercial summary | Fero, for decisions | Departments live, retention of departments (still active after 3 and 6 months), time saved estimates **labelled as estimates** |

Time saved: OneRota can measure counts (requests handled, imports, allocations changed), not minutes. Any "hours
saved" figure must come from a survey of coordinators and be labelled as an estimate with its source.

## 5. Commercial questions the data can answer

1. Do departments keep using it after the first rota cycle (activation and retention)?
2. Which features carry the use: requests, calendar, personal hours?
3. How much support does a department need (errors, failed imports)?
4. What could a per-department subscription be worth? Answered by interviews and the department's own valuation,
   **never** by inferring from staff data.

## 6. Before building

- Department agreement: data processing terms naming service analytics as a processing purpose. The analytics are
  aggregate, but they derive from processing personal data.
- Privacy notice for staff: one paragraph saying service-use counts are kept per department, no individual's use is
  reported, and sickness is never counted.
- DPIA screening per hospital (the rota already holds health data, so the trust may require a full DPIA).
- Tests:
  - isolation (two hospitals, one bucket; counters never cross prefixes);
  - no personal fields in any analytics object;
  - the small-number rule;
  - the cap;
  - failure does not affect the request.
- This specification needs the owner's approval before any OneRota change, and OneRota's own release process.

## 7. Not proposed

- No tracking of individual staff behaviour, productivity or attendance, even if a department asks. That would be
  workforce monitoring, a different purpose needing its own lawful basis, consultation and DPIA.
- No sharing of OneRota analytics with Wavelength. The products stay separate.
