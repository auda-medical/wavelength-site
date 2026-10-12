# Website changes (free logbook, supervision story, tailored training)

Branch `wavelength-business-20261010`. Nothing here is deployed. Every page was checked in Chrome against the built
site and the real Worker (`video/scripts/site-check.mjs`), at 390 and 1440 pixels wide.

## 1. Free logbook marketing

| Where | Change |
|---|---|
| Home hero | Calls to action "EXPLORE OUR COURSES" and "START YOUR FREE LOGBOOK" (`.btn.cta-caps`). |
| Home, new navy band | "Your ultrasound logbook. Free to use. Designed for real clinical practice." with "Scan when you work. Log when it suits you. Connect with verified supervisors. Track your progress." and the CTA "START YOUR FREE LOGBOOK" (to /app/get/). The older duplicate app band was removed. |
| /pocus-logbook/ | Hero CTA "START YOUR FREE LOGBOOK"; new section `#supervision` with the story "Ultrasound training shouldn't stop when your supervisor isn't available." It says that remote review never replaces bedside supervision or an observed assessment that a pathway requires. |
| Wording kept honest | "Free to use" describes the logbook as it is today. Nothing promises every future feature free; sign-off and records are never behind payment. No ratings, user numbers or endorsements are claimed. |

## 2. Tailored training (/training/)

- Navigation label "Tailored Training" (under Courses) and footer link "Tailored training".
- Page title "Tailored Ultrasound Training"; H1 "Ultrasound Training Tailored to Your Needs" with the intro as supplied.
- Audience cards (individuals, groups, organisations); "UK and International Training Enquiries" section in the exact
  preferred wording; FAQ including the international answer as supplied; `Service` structured data.
- Enquiry form widened (`worker/department-form.json`, `worker/departments.js`):
  - individual, group or organisation (organisation optional);
  - country (203, United Kingdom first) and international phone format;
  - modules, participants, preferred dates and location, optional budget band, how they heard;
  - hidden campaign label from the visit.
  - Legacy values from the old department form are still accepted.
- Without migration 0014 the new answers are kept inside the message text, so nothing is lost before the migration.
- Thanks page and email subject "Tailored training enquiry: …". Admin list relabelled "Training enquiries".
- Home: a tailored-training section with the CTA "ENQUIRE ABOUT TAILORED TRAINING". It is also on the translated home
  pages (keys `tailored*` in `data/i18n/site.<lang>.json`; machine-drafted like the rest of those files, so a native
  speaker should review them).

## 3. Measurement and privacy notice

- Cookieless measurement script in `src/assets/main.js` (page beacon to `/api/m`):
  - campaign label for the tab;
  - `client_reference_id` added to Stripe Payment Links;
  - CTA clicks (`data-m`) and enquiry starts.
- Privacy notice (updated 10 October 2026), new sections:
  - "Measuring how the website and app are used", with the objection switch;
  - "Course bookings and payments";
  - "Checking supervisor credentials";
  - "Tailored training enquiries".

## 4. SEO

- Titles kept under about 50 characters before " | Wavelength" (checked in `site-check.json`).
- /training/ search title "Tailored ultrasound training, UK and international", with `Service` structured data and
  the FAQ.
- /pocus-logbook/ keeps its FAQ split from /app/get/ (no repeated questions).

## 5. Checks run (local, fictional data)

| Check | Result |
|---|---|
| 22 page views (11 pages × 2 widths, including /fr/ and /ar/) | No horizontal overflow, no console errors, no images without alt text, no unlabelled form fields, one H1 per page, structured data parses, no broken internal links |
| Real enquiry through the browser (Irish individual, no organisation, LinkedIn campaign link) | Stored with region international, class individual and the campaign label; conversion counters recorded |
| Objection switch | Stored, and the next page view was not counted |
| Automated tests | `test/tailored-training.test.mjs` (8) |

## 6. Needs approval before going live

The website changes deploy with the Worker on a push to `main`. Migration 0014 should be applied first, so new
enquiries land in their own columns (otherwise they fall back to the message text). See `10-deployment-approval.md`.
