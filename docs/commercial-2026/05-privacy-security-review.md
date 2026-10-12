# Privacy and security review (analytics, bookings, finance, verification, website)

Reviewed 10 October 2026 against UK GDPR, the Data Protection Act 2018, PECR as amended by the Data (Use and Access)
Act 2025 (storage and access changes in force since 5 February 2026) and the ICO's guidance on storage and access
technologies (finalised 29 April 2026). This is a technical review, not legal advice; the owner should confirm the
conclusions with their data protection adviser before deployment.

## 1. Website measurement (PECR and UK GDPR)

| Question | Answer |
|---|---|
| Does it store or access information on the visitor's device? | It runs a script that reads the page address, the referrer and the address's campaign tags, and sends them. It stores nothing for measurement. It reads one local setting only to honour an objection, and keeps a campaign label in session storage for the tab when the visitor arrived from a tagged link. |
| Lawful under PECR? | The statistical-purposes exception (amended regulation 6) covers storage or access whose sole purpose is statistics about how the website is used, to improve it, provided visitors get clear information and a simple, free way to object. The campaign label serves the same purpose (which pages and posts lead to enquiries) and identifies nobody. It is not used to identify, track or monitor individuals, which the exception excludes. |
| Clear information | Privacy notice section "Measuring how the website and app are used" (drafted in this branch). |
| Simple, free objection | A switch in that section, working on every page; Global Privacy Control and Do Not Track are honoured in the browser and on the server. |
| Cookies | None for measurement. The notice's promise "If we ever add analytics or marketing cookies, we will ask for your consent first" remains true. |
| Personal data? | No identifiers or IP addresses are stored; only daily totals by page, channel, source, campaign, referring host, country and device class. Country is derived from the IP address at the edge and discarded. The data are anonymous aggregates. |
| Third parties | None. Cloudflare already processes requests as the website host. |
| Cardinality abuse | Paths outside the site's own list are counted as "(other)"; labels are sanitised and capped; per-address and per-instance limits stop floods. |

Residual risk: low. A visitor who objects but whose browser blocks local storage cannot store the objection; GPC or Do
Not Track still works.

## 2. App activity and events

| Item | Assessment |
|---|---|
| `analytics_learner_days` (account id and day) | Pseudonymous personal data inside the same controller's database. Purpose: whether people keep finding the logbook useful (retention). Lawful basis: legitimate interests (service improvement); minimal; retained 13 months then reduced to daily totals; deleted with the account. Disclosed in the privacy notice. |
| Feature and failure counters | Route name and status only; never request bodies, findings, images, notes, names or emails. A failed sign-up's reason is reduced to a category (name, email, password, terms, organisation). |
| Effect on the app | All writes run after the response, inside `try/catch`. Tests prove sign-up and sync work without migration 0014. |
| D1 allowance | Capped writes per instance per day; the logbook's own traffic is unaffected by measurement. |

## 3. Bookings and Stripe webhook

- Off until `STRIPE_WEBHOOK_SECRET` is set. Signature checked (HMAC-SHA256, five-minute tolerance, constant-time
  comparison). Each event id is stored once, each Checkout Session maps to one booking, refunds set absolute amounts:
  replays and duplicates cannot double-count (tested).
- No customer name or email is stored in `bookings`; the Stripe ids link to Stripe's record. The privacy notice
  describes this ("Course bookings and payments").
- Card data never reaches Wavelength (Stripe-hosted Payment Links).

## 4. Finance, time and the opportunity register

Owner-only (admin login; with Cloudflare Access, the owner role). Ledger lines are voided, never deleted, for audit.
Supplier names may appear in descriptions: they are business records, kept six years. CSV exports guard against
spreadsheet formula injection (existing `csvCell`).

## 5. Tailored training enquiries

The form now collects country, enquiry type, optional organisation, optional budget band, how they heard and a campaign
label. The privacy notice section is updated. Personal messages never enter the analytics counters (tested). The
pipeline CSV in the business dashboard omits names, emails, phone numbers and messages (tested). Retention unchanged
(two years unless a booking follows).

## 6. Credential verification

- Directory lookups are manual and individual. No scraping, bulk extraction, synchronisation or republication.
- Listed-contact confirmation: the address is typed by an administrator from the body's directory, stored as a SHA-256
  hash plus a masked hint, and receives one single-use link (14 days, at most three per credential in 30 days). GET
  never changes anything; POST records the answer. "This is not me" stops the claim and flags it.
- The confirmation page sets a strict Content Security Policy, `noindex`, no referrer and denies framing.
- Name matches never verify alone; capacities restrict signing when enforcement is on; snapshots record authority
  honestly when it is off.
- Needs before switching on: privacy notice section (drafted), DPIA screening for directory checks and listed-contact
  emails, store privacy answers unchanged (no new data leaves the device).

## 7. Admin and access control

| Area | Control |
|---|---|
| `/admin/business/*` | Admin session cookie (HttpOnly, Secure, SameSite=Lax, path /admin, 12 h); with Cloudflare Access on, the owner role only (`roleForPath` default). Tested for login redirect and role refusal. |
| Forms | Same-origin POST check (existing); all output escaped; confirmations use `data-confirm`. |
| CSV | Formula-injection guard. |

## 8. Security testing done

Automated (359 tests on an LF checkout: 358 pass, 1 skipped, 0 fail): beacon bot, GPC, DNT and origin refusal; oversized and malformed
bodies; caps; Stripe signature, staleness, replay and duplicate handling; dashboard login and role checks; enquiry
validation, honeypot and origin check; capacity enforcement; directory review identity rules; single-use confirmation
links; GMC workflow preserved; account deletion removes activity rows.

Not done: an external penetration test; load testing against D1 limits in production.
