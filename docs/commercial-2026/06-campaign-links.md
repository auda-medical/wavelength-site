# Campaign links and measurement plan

Use these links for every post, email and printed code so the business dashboard (Marketing tab) can show which
channels bring visits, enquiries and verified bookings. Build further links in the dashboard's campaign link builder
(`/admin/business/marketing/`), which also draws the QR code.

Convention: `utm_source` = where the link sits, `utm_medium` = the kind of placement, `utm_campaign` =
`yyyy-mm-short-name`, `utm_content` = the variant (for headline or call-to-action tests). Lower case, hyphens.

## Videos (the three films)

| Placement | Link |
|---|---|
| Flagship film end-frame QR and description | https://thewavelength.co.uk/?utm_source=video&utm_medium=video&utm_campaign=2026-11-flagship-film |
| Flagship film on LinkedIn | https://thewavelength.co.uk/?utm_source=linkedin&utm_medium=video&utm_campaign=2026-11-flagship-film |
| Flagship film on YouTube (if used) | https://thewavelength.co.uk/?utm_source=youtube&utm_medium=video&utm_campaign=2026-11-flagship-film |
| Short film QR and description | https://thewavelength.co.uk/app/get/?utm_source=video&utm_medium=video&utm_campaign=2026-11-free-logbook |
| Short film on Instagram (link in bio or story link) | https://thewavelength.co.uk/app/get/?utm_source=instagram&utm_medium=video&utm_campaign=2026-11-free-logbook |
| Short film on LinkedIn | https://thewavelength.co.uk/app/get/?utm_source=linkedin&utm_medium=video&utm_campaign=2026-11-free-logbook |
| Short film on Facebook (owner's own page or shares) | https://thewavelength.co.uk/app/get/?utm_source=facebook&utm_medium=video&utm_campaign=2026-11-free-logbook |
| Advert QR and description | https://thewavelength.co.uk/training/?utm_source=video&utm_medium=video&utm_campaign=2026-11-tailored-training |
| Advert on LinkedIn | https://thewavelength.co.uk/training/?utm_source=linkedin&utm_medium=video&utm_campaign=2026-11-tailored-training |
| Advert on Instagram | https://thewavelength.co.uk/training/?utm_source=instagram&utm_medium=video&utm_campaign=2026-11-tailored-training |

The QR codes in the films encode the first link in each group (`src/qr.json`, made by `video/scripts/qr.mjs`).

## Posts, newsletter and print

| Placement | Link |
|---|---|
| LinkedIn post: course on 21 December | https://thewavelength.co.uk/courses/core-emergency-ultrasound/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-core-21dec |
| Instagram post: course on 21 December | https://thewavelength.co.uk/courses/core-emergency-ultrasound/?utm_source=instagram&utm_medium=social&utm_campaign=2026-11-core-21dec |
| Newsletter: course block | https://thewavelength.co.uk/courses/core-emergency-ultrasound/?utm_source=newsletter&utm_medium=email&utm_campaign=2026-11-core-21dec |
| Newsletter: tailored training block | https://thewavelength.co.uk/training/?utm_source=newsletter&utm_medium=email&utm_campaign=2026-11-tailored-training |
| Newsletter: app spotlight | https://thewavelength.co.uk/app/get/?utm_source=newsletter&utm_medium=email&utm_campaign=2026-11-free-logbook |
| Pearl shared on LinkedIn | https://thewavelength.co.uk/learn/<slug>/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-pearls |
| Guide shared on LinkedIn | https://thewavelength.co.uk/guides/pocus-accreditation/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-11-guides |
| Course day poster QR | https://thewavelength.co.uk/app/get/?utm_source=qr&utm_medium=qr&utm_campaign=2026-12-course-day |
| Conference or event leaflet QR | https://thewavelength.co.uk/training/?utm_source=event&utm_medium=qr&utm_campaign=2027-01-event-name |

## What is measured, and how reliably

| Measure | How | Reliability |
|---|---|---|
| Visits by campaign, channel, source, landing page | Cookieless page beacon (`/api/m`) reads the link's UTM tags and the referring site | Measured, but visits are estimates: no person is followed across devices or visits; browsers with JavaScript off, privacy objections, GPC or Do Not Track are not counted |
| Training enquiries by campaign | The campaign label from the same browser tab is sent with the enquiry | Measured for enquiries in the same tab and visit; anything else is unattributed |
| Training enquiries by what people say | "How did you hear about us?" on the form | Estimated (self-reported) |
| Course bookings by campaign | The campaign label is added to the Stripe Payment Link as `client_reference_id`, which the verified webhook stores | Measured once the webhook is switched on; a booking made later or on another device is unattributed |
| Logbook sign-ups | Counted by the server; per-campaign sign-ups are not attributed (the app has no campaign capture) | Totals measured; campaign attribution estimated from visit timing only |
| Revenue by campaign | Net revenue of bookings carrying the label | Measured for attributed bookings; never extrapolated |

## Testing headlines and calls to action

Use `utm_content` variants in posts (for example `headline-supervisor` and `headline-free`) and compare visits,
enquiry starts and enquiries per variant in the Marketing tab. On-site A/B tests that assign visitors to variants
would need a stored identifier or consent decisions, so they are not built; link-level variants give a fair test
without tracking people.
