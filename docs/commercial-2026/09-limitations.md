# Known limitations

These are honest limits of what was built, measured and researched on 10 October 2026. Where a limit has a fix, the
fix is named.

## Analytics and dashboard

1. **Visits are estimates.** No visitor is recognised across pages, days or devices, by design (no cookies, no
   identifiers).
   - "Visits" counts arrivals from outside the site. One person can be several visits.
   - Browsers with JavaScript off, people who object, and Global Privacy Control or Do Not Track users are not counted.
2. **Funnel rates compare totals, not people.** For example, "accounts per visit" divides two totals in the same
   period. It does not follow anyone from visit to account.
3. **Logbook sign-ups are not attributed to campaigns.** The app keeps no campaign label (it would need a stored
   identifier or a change to the store apps). Campaign attribution covers visits, training enquiries and Stripe
   bookings only.
4. **Bookings are recorded only once the Stripe webhook is switched on**, or when entered by hand. Until then, "Book now"
   clicks are reported as initiations, never as sales.
5. **Course matching**: without `stripePaymentLink` ids in `data/courses.json`, a Stripe booking is matched to a date by
   price only when exactly one date has that price; otherwise it waits in the Courses tab for the owner to assign it.
6. **Finance is a management view**, not statutory accounts and not a VAT return.
   - Stripe fees are estimated (1.5% + 20p) where the actual fee is not recorded.
   - Course revenue, and costs linked to a course, count on the course date; "Bookings taken" shows the cash view.
   - Projections in `08-commercial-strategy.md` are illustrative scenarios, not forecasts or results.
7. **Measurement starts at deployment.** There is no history before migration 0014 is applied, and the dashboard says
   "Not measured" rather than showing zero for those periods.
8. **Write caps.** Measurement stops for the day after 4,000 beacon writes (and 4,000 app-activity writes) per Worker
   instance, to protect the D1 free-tier allowance. A very busy day would be undercounted, and the dashboard cannot
   tell exactly by how much.
9. **Cross-instance caps are approximate.** Per-address and daily limits are kept in each Worker instance's memory, so
   several instances can together exceed them slightly.
10. **Dashboard checked with fictional data only.** Live behaviour is unknown until deployment.

## Credential verification

1. No professional body offers Wavelength an authorised API or data agreement. All directory checks are manual, one
   person at a time. Automated rechecks only remind an administrator.
2. **A listed-contact confirmation proves control of the listed address, not clinical competence.** Wavelength
   approval for a module still rests on the evidence and the administrator's review.
3. Directory data can be out of date (the bodies say so themselves). Rechecks are scheduled (`recheckDays`), but a
   change between rechecks is not seen.
4. EDEC, BSE and EACVI support evidence only, or individual lookups. EACVI's terms forbid automated collection.
5. ASUM CCPU and NBE were researched only far enough to record them as future candidates.
6. Capacity enforcement (mentor versus supervisor, and so on) applies when `SUPERVISOR_APPROVAL_REQUIRED` is on. While
   it is off, sign-offs proceed and the snapshot records the signer's real authority honestly.

## Website

1. The new translated home-page sections are machine-drafted, like the rest of the translations. A native speaker
   should review them.
2. The international FAQ and section use the owner's wording. Travel, insurance, indemnity and local regulatory
   requirements for teaching abroad are not covered by the site and need checking per enquiry.
3. Pages were checked in Chrome only (390 and 1440 px), not in Safari or Firefox.

## Films

Version 1 (the nine files in `final\`) was reviewed by Fero and **not approved**. It is kept unchanged. Version 2:

1. **The narration voice is not approved.**
   - Version 2 uses a provisional synthetic voice: Chatterbox speaking a designed British male voice.
   - I cannot listen. Pitch, range, brightness, pace and machine transcription were measured, but warmth, naturalness
     and rhythm need Fero's ears.
   - If no candidate is acceptable, a human voice-over recorded to `video/src/v2/script.json` replaces it without
     other changes.
2. FAMUS and FUSIC have no confirmed spoken pronunciation, so the narration does not say them (on screen only).
3. The illustrations are original line art. A real course shoot (with consent) would look more premium than any
   illustration, and is the recommended next step for the advert. Never imply photographs where none exist.
4. App screens show this branch's 1.0.12 interface, and in places the course date "21 Dec 2026". Refresh the films
   when the date passes or the interface changes.
5. Not test-uploaded to LinkedIn or Instagram, which re-encode uploads. The encodes are full-range `yuvj420p`; if
   colours look washed out on a platform, re-render with `--color-space=bt709`.
6. Rendering runs on this computer's CPU only, so a full voice change and re-render takes about two hours.

## Commercial research

1. Prices and competitor details come from public web pages read on 10 October 2026. They change, and some providers
   do not publish prices.
2. Nobody has been interviewed: no customer, trust, body or partner. Demand, willingness to pay and institutional
   appetite are unvalidated.
3. FAMUS course approval and FUSIC opportunities are assessed from published requirements only. SAM and the ICS
   decide, and the draft proposals have not been sent.
4. Tax, VAT and NHS conflict-of-interest points are general guidance for discussion with an accountant and the
   employing trust, not professional advice.

## Testing environment

1. Fixed on 10 October 2026:
   - `npm test` now runs on Windows (the glob is double-quoted).
   - The three tests that failed only because of CRLF line endings now compare content instead.
   - Windows and Linux checkouts both pass.
4. Two local browser checks in `tools/e2e-supervisor-ui.mjs` fail against the stand-in Worker (`tools/dev-worker.mjs`):
   the organisation on the account, and a later step that times out.
   - They fail identically on the untouched 1.0.12 code, so this project did not cause them.
   - They were written for `wrangler dev` with `.dev.vars`; re-run them that way before the next store build.
2. Tests use node:sqlite in place of D1 and a KV stub. D1-specific behaviour (limits, latency, replication) is not
   exercised.
3. No external penetration test or production load test has been done.
