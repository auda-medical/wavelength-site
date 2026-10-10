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

1. **No person has watched or listened to them yet.** Audio was checked by loudness measurement and by machine
   transcription (character error rate 0 to 4% per line), not by ear. Voice quality, music balance and pacing need a
   human judgement.
2. The narration is a synthetic voice (Kokoro, British English). Some listeners will notice. A recorded human voice
   would be warmer: replace the WAV files in `public/audio/` and re-run the render.
3. The ultrasound image in the editor scene is a drawn illustration, not a scan.
4. No `.srt` subtitle file yet. The short and the vertical advert have burnt-in subtitles; the flagship does not.
5. Not test-uploaded to LinkedIn or Instagram, which re-encode uploads.
6. The encodes are tagged full-range (`yuvj420p`, Remotion's default). Most players handle this; it has not been
   checked on LinkedIn or Instagram. If colours look slightly washed out there, re-render with `--color-space=bt709` (one flag in
   `scripts/render.mjs`).
7. App screens show the 1.0.12 interface of this branch. Later interface changes will make the films slightly dated.

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

1. On this Windows checkout, `npm test` runs no tests (quoted glob) and 3 tests fail because of CRLF line endings
   (`core.autocrlf=true`). On an LF checkout every test passes (see `12-reporting-and-test-report.md`).
2. Tests use node:sqlite in place of D1 and a KV stub. D1-specific behaviour (limits, latency, replication) is not
   exercised.
3. No external penetration test or production load test has been done.
