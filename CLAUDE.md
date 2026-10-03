# Wavelength website: notes for Claude

Site for Wavelength (trading name of Auda Medical Ltd, company 08487817), point-of-care ultrasound courses for emergency and acute clinicians. Owner: Dr Firas Abou-Auda, Course Director. General Manager: Dr Zahra Habibzadeh.

## How it works
- Static site, no framework. `node build.js` builds `dist/` from `data/*.json` and `src/`.
- Cloudflare Workers (static assets) builds every push to `main`: build `npm run build`, deploy `npx wrangler deploy` using `wrangler.jsonc`. Pushing to `main` publishes the live site.
- Domain: thewavelength.co.uk (and www), attached as custom domains in `wrangler.jsonc` routes and set in `data/site.json` (`domain`). workers.dev is off so only the real domain is indexed. Firas is bidding for wavelength.co.uk; if he wins, change `domain` there.

## Common changes
- Course dates, prices, venues, Stripe payment links: `data/courses.json` (`dates` array; see README).
- New course: copy a course object in `data/courses.json`, new `slug`.
- Team, emails, company details, LinkedIn and Instagram links: `data/site.json`. Each person has an optional `email` shown on their profile (aliases of the shared Zoho inbox hello@).
- Photos: crop to 4:5 head and shoulders with the face centred, 1680x2100 (2x for sharp screens), plain studio background, export WebP to `src/assets/team-<name>.webp` and set `photo` in `data/site.json`.
- Accreditation: EUSEM accreditation is pending written confirmation, so the site does not claim it yet. When EUSEM confirms, `git revert` the commit "Hide EUSEM accreditation claim until EUSEM confirms in writing" to show it. Do not add RCEM, SAM/FAMUS or EUSEM logos without written permission from each body. It is NOT RCEM or FAMUS accredited: say "mapped to the RCEM curriculum". Name who accredits the faculty: "FAMUS-accredited instructors and RCEM-approved ultrasound supervisors", never bare "accredited instructors". Never call the course FAMUS-mapped, and do not mention plans for FAMUS courses. The EUSEM revert will conflict with later wording changes, so re-add EUSEM by hand if needed. Fascia iliaca block is not in the core course; nerve blocks will be a separate course. Say "RCEM curriculum", never "RCEM 2021 curriculum".
- Firas's bio uses `{scanYears}` (since 2008) and `{teachYears}` (since 2010), filled in at build time so the numbers stay current.

## Social images
- `tools/social/ad.html` + `node tools/social/render.mjs <outdir>` render the Instagram post (1080x1350), story (1080x1920), LinkedIn (1200x1200) and link-preview (1200x630) images. The course page uses the link-preview image via `ogImage` in `data/courses.json`; update or remove it when the date passes.

## Learn and newsletter
- Learn posts: Markdown files in `content/learn/` (front matter: title, summary, category, date, author, draft, optional reviewed). The byline shows the review date (reviewed, or date) and a next review two years later; set `reviewed` when you update a pearl. `draft: true` or a future date keeps a post off the live site. Preview drafts with `DRAFTS=1 node build.js`. Images go in `content/learn/images/` and are referenced as `/learn/images/<file>`. The Pearls nav link appears once one post is live.
- Newsletter form: `newsletter` in `data/site.json` posts straight to the Zoho Campaigns form "Website newsletter sign-up" (list "Wavelength newsletter", custom field Role = CONTACT_CF1, double opt-in on, redirect to `/subscribe/thanks/`). Empty `action` falls back to emailing hello@.
- Zoho Campaigns (EU): templates "Wavelength monthly newsletter" and "Wavelength welcome email"; workflow "Newsletter welcome" sends the welcome email when a contact joins the list. Merge tag for first name: `$[LI:FIRSTNAME]$`.
- Email templates for Zoho Campaigns: `src/email/newsletter/` and `src/email/welcome/` (live at /email/...). Images must use absolute https URLs.

## Wavelength Pearls and tests
- Pearls are the Learn posts in `content/learn/` (menu label "Pearls", URL /learn/). Each pearl's questions (`?? question`, `- wrong`, `+ correct`, `: explanation`) go on its own test page /learn/<slug>/test/ and the question bank /learn/test/. Options are shuffled at build time with a fixed seed per question (`seededShuffle` in lib/md.js), so write the correct option anywhere.
- Newsletter issue for a pearl: `src/email/pearl/` (live at /email/pearl/). Answer buttons link to /learn/<slug>/test/?q=1&a=<letter>, which marks that answer on arrival. After editing a pearl's first question, re-check the letters match the test page.
- Pearl graphics come from ChatGPT. Check anatomy and laterality, remove em dashes, and note "Scan images in the graphic are illustrations, not patient scans" until real scans replace them.

- Topics: `learnTopics` in `data/site.json` groups pearls and Academy modules by `category` (Fundamentals, Heart and vessels, Lung and airway, Abdomen and pelvis, Soft tissue and joints, Eye and scrotum). /learn/ shows a sticky topic bar with search, one section per topic and the matching Academy modules at the foot of each. A new category needs adding to a topic, or it lands under "More pearls". Links like /learn/#topic-lung open one topic.
- Card images: `python3 tools/pearl-thumbs.py` cuts a 16:10 thumbnail from each `*-pearl.webp` into `content/learn/images/thumbs/` (default crop: the 3D illustration top right; exceptions in `CROP`). Run it after adding a pearl graphic and check the crop. Academy cards use the thumbnail of the module's `image`.

## Wavelength Academy (certified e-learning)
- Modules live in `content/academy/<slug>/`: `module.json` (title, CPD hours, pass mark, draft, outcomes, references, review date, conflicts), lesson Markdown files listed in `lessons` (front matter: title, minutes; lesson URL drops the number prefix), and `assessment.md` (`?? question`, `@ lesson-file` to review, options, `: explanation`). Case questions inside lessons stay inline.
- `draft: true` builds the module unlisted and noindex, reachable by link for review. The Academy menu link appears once one module is live. The name sits in `academy.name` in `data/site.json`; the newsletter box at Academy registration is optional and unticked (`academy.newsletterRequired` false, Worker var `NEWSLETTER_REQUIRED` "false"). Keep it optional: marketing consent must not be a condition of access.
- The build writes `worker/academy-data.json` (answer key, never in pages). Commit it with content changes.
- The Worker (`worker/academy.js`) gates /elearning/<slug>/learn/ and /assessment/ behind a learner cookie (signed with `learner_secret` in D1 `settings`, created on first use), marks answers server-side, issues one certificate per learner per module (code WL-<CODE>-XXXX-XXXX), and emails it.
- Certificate PDF: `worker/cert-template.bin` + `.json` hold the fixed design (logo, fonts, frame). The Worker stamps name, module, score, CPD, date and code by appending a content stream (`worker/cert.js`), under a millisecond. To change the design, edit `tools/certificate/make-template.mjs` and run it (`npm i --no-save pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1`). Fonts in `worker/fonts/` are TTF copies of the site fonts.
- Email: Zoho ZeptoMail. Secret `ZEPTOMAIL_TOKEN` (Cloudflare dashboard, Worker settings, Variables and secrets). `MAIL_FROM` etc. in `wrangler.jsonc` vars. Without the token, certificates still issue and download; the admin page lists unsent emails with a button to send them.
- Admin: /volunteer/admin/academy/ (same admin login): learners, certificates, attempts, feedback, CSV exports.
- Database: D1 tables in `migrations/0003_academy.sql`, applied to the live database with the Cloudflare tools. Local test: apply all migrations with `--local`, put `ZEPTOMAIL_TOKEN` and a mock `ZEPTOMAIL_API` in `.dev.vars`, run `npx wrangler dev --local`.

## Volunteer area (hidden)
- `/volunteer/` is a hidden, password-protected sign-up for scanning-model volunteers. Not linked anywhere, noindex, not in the sitemap.
- `worker/index.js` runs first for `/volunteer/*` (`run_worker_first` in `wrangler.jsonc`), checks the login cookie, saves sign-ups to D1 (`wavelength-volunteers`, binding `DB`, schema in `migrations/`), and renders `/volunteer/admin/` (list, mark contacted, delete, CSV export).
- Logins live in the D1 `settings` table (volunteer_username "volunteer", admin_username "wavelength", PBKDF2 password hashes, session_secret). Never commit passwords. The admin page changes either password, and a change logs everyone out. Without settings the area shows "Opening soon".
- Local test: apply both files in `migrations/` with `npx wrangler d1 execute wavelength-volunteers --local --file ...`, insert test settings, then `npx wrangler dev --local`.

## Teach with us (faculty applications)
- Public form /faculty/join/ posts to /api/faculty/apply (`worker/faculty.js`), saves to D1 `faculty_applications` (`migrations/0004_faculty.sql`, applied to live), and emails hello@ through ZeptoMail with the applicant as reply-to. Option lists live in `worker/faculty-form.json`, shared by the build and the Worker. Admin list: /volunteer/admin/faculty/ (admin login), with CSV, mark contacted and delete. Linked from the faculty page, contact page and footer. Privacy notice keeps applications two years.

## Positioning
- Wavelength is a point-of-care ultrasound education provider (courses, Pearls, Academy), not only a course seller. Keep the homepage "Ways to learn" section and education-first wording in titles and descriptions.

## Discount codes
Bookings go through Stripe Payment Links. Discount codes are Stripe promotion codes, switched on per payment link ("Allow promotion codes"). The course page tells people to enter codes on the payment page once any date has a `stripeLink`.

## Compliance wording
- USB drive: sell it as built for ultrasound machines, always alongside "check your trust's removable media and information governance policy" and the anonymisation teaching. Never claim images are anonymous by default.
- Footer carries the independence statement (not run or endorsed by the NHS, Dartford and Gravesham NHS Trust, RCEM, FAMUS or EUSEM). Edit it when EUSEM endorsement is confirmed in writing. `icoNumber` in `data/site.json` shows in the footer once filled.
- Group size: say "one instructor to every four or five delegates", not bare "small groups".
- Academy certificates are Wavelength's own, not externally accredited. Public verification and the PDF show pass, not the score.
- Teaching faculty: add instructors to a `faculty` array in `data/site.json` (same fields as `team`) and they render on /faculty/.

## Brand
- Navy #0F1E33, deep navy #0A1526, teal #2A7F8A, light teal #7FC4CC, cream #F7F5F0, sand #EDEAE3.
- Cormorant Garamond (display) and DM Sans (text), self-hosted in `src/assets/fonts`.
- Logo: rounded amplitude "W" wave in a thin circle. Tagline "Tune In · Gain Clarity".
- UK spelling. Plain, active copy. No em dashes.

## Before pushing
Build, then check pages at 390px and 1440px (`npm i --no-save playwright@1.56 && node tools/shots.mjs <outdir>`). No horizontal overflow, no console errors.
