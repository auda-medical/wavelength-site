# Wavelength website: notes for Claude

Site for Wavelength (trading name of Auda Medical Ltd, company 08487817), point-of-care ultrasound courses for emergency and acute clinicians. Owner: Dr Firas Abou-Auda, Course Director. General Manager: Dr Zahra Habibzadeh.

## Before every Wavelength job (AI coordination)
Claude and ChatGPT both work on this repository. GitHub issue #2 in auda-medical/wavelength-site ("AI coordination log: Claude and ChatGPT") is the shared log and its rules apply. For every job:
1. Read issue #2, including all comments, before starting.
2. Update from the latest `main`.
3. Post a start comment on issue #2: agent, task, branch, PR (if any), and the files or areas you expect to change.
4. Work on your own branch, never on `main` directly.
5. Never edit another agent's active branch. Review it and comment instead.
6. Post an end-of-job handoff comment on issue #2: status, commits or PR, migrations or Cloudflare changes, tests run, deployment status, rollback notes, and any handoff needed.

## How it works
- Static site, no framework. `node build.js` builds `dist/` from `data/*.json` and `src/`.
- Cloudflare Workers (static assets) builds every push to `main`: build `npm run build`, deploy `npx wrangler deploy` using `wrangler.jsonc`. Pushing to `main` publishes the live site.
- Domain: thewavelength.co.uk (and www), attached as custom domains in `wrangler.jsonc` routes and set in `data/site.json` (`domain`). workers.dev is off so only the real domain is indexed. Firas is bidding for wavelength.co.uk; if he wins, change `domain` there.

## Common changes
- Course dates, prices, venues, Stripe payment links: `data/courses.json` (`dates` array; see README).
- Event structured data (`eventsLd` in build.js) lists the Course Director as `performer` for every date, as Google Search Console asks. Add other confirmed instructors to a date with `faculty: ["Dr Name"]` in `data/courses.json`.
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
- Newsletter cadence (agreed October 2026): one Pearl issue a week. A weekly scheduled task drafts the next issue from the next unsent pearl and tells Firas; sent issues are logged in `data/newsletter-log.json`. Every sign-up route (/subscribe/, Academy registration, app sign-up, and the optional box on verify pages) feeds the Zoho Campaigns list "Wavelength newsletter" with double opt-in. Verification never needs an account, and marketing consent is never a condition of anything.
- Automatic sending (built October 2026, `worker/newsletter.js`, migration `0008_newsletter.sql`, applied to live): the Worker cron (`triggers` in `wrangler.jsonc`) sends `src/email/pearl/issue.json`'s issue at 7:30am UK time on Tuesdays through the Zoho Campaigns API (EU), using the live page /email/pearl/ as content. Admin: /volunteer/admin/newsletter/ (client ID and secret, connect, pause, send now, send log). OAuth settings live in D1 `settings` (`zoho_*`). Each send is logged in D1 `newsletter_sends`; the same slug never sends twice, and drafts older than eight days are skipped. Set `ready` false in issue.json to hold an issue. The volunteer form has an optional newsletter box that subscribes through the API (Zoho sends the confirmation email).
- Zoho topics: every contact must belong to the topic "Marketing" or Zoho excludes them at send time with error 6606 "No lists selected". The Zoho form "Website newsletter sign-up" has Topics = Marketing, and the Worker passes `topic_id` on API sign-ups. Zoho API parameters go in the query string, not the body.
- Who gets the newsletter: only people who opted in and confirmed (double opt-in). Never add learners, app users, volunteers or students who did not tick the box. Course delegates who did not opt out at booking fall under the soft opt-in for similar courses only, not the full newsletter, so keep them off this list unless they subscribe.
- Issue content, every week: next-course strip under the header, the pearl and its first question, the course block (main offer, navy), app spotlight (capabilities only: never claim ratings or popularity until real reviews exist), "Need help setting up ultrasound training for your department?" block linking /training/, then Academy and Teach with us.
- Newsletter issue for a pearl: `src/email/pearl/` (live at /email/pearl/). Answer buttons link to /learn/<slug>/test/?q=1&a=<letter>, which marks that answer on arrival. After editing a pearl's first question, re-check the letters match the test page.
- Pearl graphics come from ChatGPT. Check anatomy and laterality, remove em dashes, and note "Scan images in the graphic are illustrations, not patient scans" until real scans replace them.

- Topics: `learnTopics` in `data/site.json` groups pearls and Academy modules by `category` (Fundamentals, Heart and vessels, Lung and airway, Abdomen and pelvis, Soft tissue and joints, Eye and scrotum). /learn/ shows a sticky topic bar with search, one section per topic and the matching Academy modules at the foot of each. A new category needs adding to a topic, or it lands under "More pearls". Links like /learn/#topic-lung open one topic.
- Card images: `python3 tools/pearl-thumbs.py` cuts a 16:10 thumbnail from each `*-pearl.webp` into `content/learn/images/thumbs/` (default crop: the 3D illustration top right; exceptions in `CROP`). Run it after adding a pearl graphic and check the crop. Academy cards use the thumbnail of the module's `image`.

## Guides (cornerstone pages)
- Markdown in `content/guides/` (front matter: title, short, slug, seoTitle, eyebrow, summary, date, reviewed, author, order, draft). Built at /guides/<slug>/ with a contents list from the `##` headings; /guides/ lists them. Menu (under Learn) and footer show Guides once one is live. `draft: true` builds the page unlisted and noindex, out of the sitemap, reachable by link.
- Markdown supports pipe tables (`| a | b |` with a `|---|` line) and gives every `##` heading an id.
- Live October 2026: RCEM ultrasound sign-off, ultrasound logbook, FAMUS accreditation, FUSIC accreditation. Every requirement, number and fee is checked against the source list at the foot of each guide. Action plans and email templates are Wavelength advice and say so. Re-check against the sources and update `reviewed` at least yearly, or when RCEM, SAM or the ICS publish a new pack. Keep the FUSIC/FAMUS/RCEM targets in `data/logbook.json` consistent with the guides.

## Search (SEO)
- Google Search Console: domain property thewavelength.co.uk, verified and owned by Firas's Google account; sitemap submitted. Firas wants dashboard tasks like this done through Claude in Chrome, not handed to him.
- Every Pearl has `slug` (search-friendly URL, e.g. epss-ultrasound) and `seoTitle` (the search-result title, which names the condition or technique plus "ultrasound", "POCUS" or "block"). `title` stays the hook shown as the H1. Give every new pearl both fields.
- Old URLs (from the file name) redirect with 301s: the build writes `dist/_redirects` for any pearl whose `slug` differs from its file name, including /test/. Never change a live pearl's `slug` again without keeping that redirect.
- Pearl test pages (/learn/<slug>/test/), /verify/ and /elearning/verify/ are noindex and out of the sitemap, so the Pearl itself ranks. The question bank /learn/test/ stays indexed.
- Sitemap carries lastmod for pearls (reviewed or date), Academy modules (published) and /learn/.
- Topic landing pages: `page`, `heading`, `seoTitle` and `about` on a topic in `learnTopics` (data/site.json) build /learn/<page>/ once the topic has three live pearls. Pearl breadcrumbs and "All ... pearls" links point to it.
- Link previews: `python3 tools/pearl-social.py` writes a 1200x630 card per pearl to `content/learn/images/social/<slug>.jpg` (title on navy, illustration framed with the crop settings in tools/pearl-thumbs.py). Run it after adding a pearl or changing its title.
- Course pages show "Read a pearl before the day" from the course's `pearls` list (slugs) in data/courses.json. Drafts appear once live.
- Page titles: pass `seoTitle` to layout() for the search title; the brand is added. Keep them under about 50 characters before " | Wavelength".

## Wavelength Academy (certified e-learning)
- Modules live in `content/academy/<slug>/`: `module.json` (title, CPD hours, pass mark, draft, outcomes, references, review date, conflicts), lesson Markdown files listed in `lessons` (front matter: title, minutes; lesson URL drops the number prefix), and `assessment.md` (`?? question`, `@ lesson-file` to review, options, `: explanation`). Case questions inside lessons stay inline.
- `draft: true` builds the module unlisted and noindex, reachable by link for review. The Academy menu link appears once one module is live. The name sits in `academy.name` in `data/site.json`; the newsletter box at Academy registration is optional and unticked (`academy.newsletterRequired` false, Worker var `NEWSLETTER_REQUIRED` "false"). Keep it optional: marketing consent must not be a condition of access.
- The build writes `worker/academy-data.json` (answer key, never in pages). Commit it with content changes.
- The Worker (`worker/academy.js`) gates /elearning/<slug>/learn/ and /assessment/ behind a learner cookie (signed with `learner_secret` in D1 `settings`, created on first use), marks answers server-side, issues one certificate per learner per module (code WL-<CODE>-XXXX-XXXX), and emails it.
- Certificate PDF: `worker/cert-template.bin` + `.json` hold the fixed design (logo, fonts, frame). The Worker stamps name, module, score, CPD, date and code by appending a content stream (`worker/cert.js`), under a millisecond. To change the design, edit `tools/certificate/make-template.mjs` and run it (`npm i --no-save pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1`). Fonts in `worker/fonts/` are TTF copies of the site fonts.
- Email: Zoho ZeptoMail. Secret `ZEPTOMAIL_TOKEN` (Cloudflare dashboard, Worker settings, Variables and secrets). `MAIL_FROM` etc. in `wrangler.jsonc` vars. Without the token, certificates still issue and download; the admin page lists unsent emails with a button to send them.
- Admin: /volunteer/admin/academy/ (same admin login): learners, certificates, attempts, feedback, CSV exports.
- Database: D1 tables in `migrations/0003_academy.sql`, applied to the live database with the Cloudflare tools. Local test: apply all migrations with `--local`, put `ZEPTOMAIL_TOKEN` and a mock `ZEPTOMAIL_API` in `.dev.vars`, run `npx wrangler dev --local`.

## Wavelength app (logbook)
- Static app in `src/app/` served at /app/ (noindex): `app.js` (single-page app, hash routes), `app.css`, `zip.js` (zip, unzip and .xlsx writer), `sign.js` (supervisor link page /app/sign/#token and public check /app/verify/?code=), `sw.js` (offline shell), `manifest.webmanifest` and icons. `vendor/` holds jsPDF and jspdf-autotable (MIT), loaded only for PDF exports. Landing page /app/get/ is built in build.js and links the app manifest, so "Download the app" installs it (Android prompt, iPhone Add to Home Screen steps). Header nav and footer link to /app/get/.
- Build writes `dist/app/config.js` from `data/logbook.json` (scan types, findings fields, pathways RCEM/FAMUS/FUSIC/general with targets, rules and windows), the next course dates and the newsletter form, and replaces `__V__` with the build id in the app HTML and service worker.
- International pathways (October 2026): RCEM, FAMUS, FUSIC, EUSEM basic and advanced (Core Compendium, Ultraschall in Med 2026: topics in two tiers, no universal numbers, so modules count assessments and learners set their own targets), ACEM (P733 v6.2, Dec 2025), CPoCUS Acute Care CORE (50 supervised determinate scans; per-area split is members-only) and ACEP (25 per core application benchmark). Pathways carry `desc` and `region` for the picker. Rules support `match`, `any` (one of several) and `not`; modules support `filter` (EUSEM paediatrics counts Under 16 only), `topics` and `assessments` (counted by kind and outcome).
- One progress engine: `src/app/progress.js` (window.WLProgress) is used by the app and imported by `worker/evidence.js`. Change targets logic there only.
- Pathway targets: edit `data/logbook.json`. Rules match `f.<field>` (a finding) or entry keys (overall, setting, supervision); `min` is a quota, `max` caps scans that count. Update `checked` and `source` when you re-check a curriculum. Learners can override any target in the app.
- Worker: `worker/app.js` handles /api/app/* (password accounts on the Academy `learners` table, lockout after 8 failed logins, logbook sync, sign-off, verify, password reset by ZeptoMail, account deletion). The login cookie is the Academy cookie (`cookieFor` in academy.js), so one login covers both. Academy registration refuses to log in an email that has an app password.
- Privacy design: logbook text syncs to D1 `logbook_entries` (JSON per entry, 20 KB cap). Images never leave the device: IndexedDB per account (`wavelength-<id>`); the crop and cover editor re-encodes JPEG, which strips EXIF. Backups are a stored zip the learner shares to their own cloud. Never add server image storage without a DPIA.
- Sign-off: in person (finger signature on the learner's phone) or by link (14 days, token stored hashed, supervisor also signs by finger). Both record the basis (witnessed, reviewed, both). The server owns `signoff` on an entry and ignores client copies. It stores a hash of the signed fields, and editing any of them voids the sign-off (`signoffVoid`). Codes SO-XXXX-XXXX verify publicly, showing no findings.
- Sign-off status (October 2026): each scan shows a traffic light from `signState` in app.js. Green signed off, amber awaiting (a live link request; the app caches pending requests from /api/app/signoffs in kv `pending` on every sync), red needs action (not sent, queried, edited after sign-off, or link expired), no colour when the learner ticks "No sign-off needed" (`noSignoff` on the entry, unticked by default, not a signed field, so toggling never voids a sign-off). Logbook filter: Not sent, Awaiting, Signed off, No sign-off.
- Sign-off notifications: when sync brings in a new link or dashboard sign-off, the app shows a toast, a "New sign-off" card on Home, a dot on the Logbook tab and "New" chips (kv `news`, cleared on opening the logbook). The Worker also emails the learner on signoff/complete and dashboard sign-off (counts and code only) unless `profile.notifyEmail` is false (toggle under Me). In-person sign-offs do not notify. Phone push notifications are not built yet.
- Encrypted image sharing in sign-off links (built October 2026, switched on 4 October 2026 after Firas signed the DPIA "Wavelength DPIA: encrypted image and clip sharing for supervisor sign-off" in Claude Docs; review due October 2027). Switch: Worker var `IMAGE_SHARE` in `wrangler.jsonc` ("true" turns it on; `/api/app/me` returns `imageShare` and the app shows the option). Privacy notice, app terms and app page describe it; change them together with the feature. How it works: the phone encrypts each image with AES-GCM 256 (new key per link, additional data `code:entry:n`), uploads ciphertext to KV `SHARED_IMAGES` (namespace wavelength-shared-images) with expiry at the link's expiry, then posts a manifest (`so:<code>:m`) with the learner's no-identifier declaration. The key travels only in the link fragment `#<token>.<key>`. The supervisor page decrypts on the device and draws each image on a canvas with a "Review copy · learner · date" watermark, no download. Ciphertext is deleted on sign-off, cancel and account deletion. Never store keys or plain images on the server.
- Verify: /verify/ is the one public check page (header link, mobile menu, footer). It routes WL- codes to /elearning/verify/ and SO-/EV- codes to /app/verify/. Printed text points people to thewavelength.co.uk/verify; QR codes still open the specific pages.
- Sharing: a scan exports as a one-page case PDF, certificates share by link, PDF or LinkedIn, logbooks export as PDF, Excel or CSV. All built on the device.
- Verified evidence summaries (`worker/evidence.js`, migration `0007_evidence.sql`, applied to live): on export the app asks the Worker to compute pathway progress from the server copy of the logbook and store a snapshot with code EV-XXXX-XXXX (counts and dates only, no findings). The PDF cover carries the code and a QR code, every sign-off in the register has its own QR code, and a signed case PDF carries one too. /app/verify/ shows SO- and EV- codes. Learners list and withdraw summaries at #/evidence; account deletion removes them. `moduleStats` in evidence.js mirrors the one in app.js: change both together.
- Portfolio destinations (`destinations` in `data/logbook.json`): RCEM risr/advance (Kaizen), FAMUS, FUSIC, JRCPTB ePortfolio, appraisal, other. The export screen picks one and shows its steps after the file is built. Wavelength is not integrated with any of these yet, so keep the steps general and say "not yet connected directly". Direct links (risr/advance API, SAM) need each body's agreement first.
- End-to-end test: `node tools/e2e-evidence.mjs <outdir>` against `npx wrangler dev --local --local-upstream localhost:8787` (the flag keeps request URLs on localhost; without it origin checks fail). Restart wrangler after `node build.js`, as rebuilding dist mid-run gives 500s.
- Structured assessments (AS-XXXX-XXXX, `worker/supervise.js`, migration `0009_assessments_supervisors.sql`, applied to live 4 October 2026): formative, summative, DOPS and final kinds; six domains rated on `assessmentScale`, an outcome, feedback and a finger signature. Recorded in person on the learner's phone, by a 14-day link (/app/assess/#token), or by a linked supervisor from their dashboard. Only `status = 'signed'` counts. Summative, DOPS and final need outcome `competent` to count. Verify shows type, outcome, date and assessor, never feedback. Form markup lives in `src/app/forms.js` (shared with sign.js).
- Supervisor links and dashboard: learners invite supervisors by email (#/supervisors); the supervisor accepts in their own app (#/supervise). Linked supervisors see progress and written entries (never images) and get sign-off and assessment requests sent to their dashboard (`supervisor_id` on signoffs and assessments). Images still travel only in the link fragment.
- Sign-off ratings: supervisors may rate each scan's image quality and diagnostic accuracy (g/a/r) in all three sign-off routes; stored on `entry.signoff.rating` and `signoffs.ratings`.
- Clips: up to 10 s, recorded or chosen, re-encoded from a canvas (no sound, no file metadata, covers burnt into every frame) and kept in IndexedDB with `kind: 'clip'`. Backups v2 carry clips and their thumbnails. Clip sharing in sign-off links switched on 5 October 2026 after Firas signed DPIA Amendment 1 (clips): Worker var `CLIP_SHARE` "true" (it also needs `IMAGE_SHARE`). The supervisor's "Review copy" stamp overlays the video player and is not burnt into the file; the DPIA records this. Privacy notice and app terms mention clips; change them together with the feature.
- Translation: the app, sign-off, assessment and verify pages use T('English text'). Run `node tools/i18n-extract.mjs` after changing app text to list keys in `tools/i18n/strings.json`, add translations to `src/app/i18n/<lang>.json` (English text as key, plurals as {one, few, many, other}), and the build writes `dist/app/i18n/<lang>.js`. Languages: en, fr, es, de, it, pl, ar (right to left), ru, zh. Stored values stay English (rules match on them); only display is translated. Exports, certificates and server-stored snapshots stay in English.
- Website translation: home, app, about and contact exist in each app language at /<lang>/, /<lang>/app/, /<lang>/about/, /<lang>/contact/ (built near the end of build.js from `data/i18n/site.<lang>.json`, English source `site.en.json`). Check with `node tools/i18n-site-check.mjs`. Pearls, Academy, courses and legal pages stay English, and the translated pages say so; legal pages are English and the English version governs. Every English page gets a language menu (header and footer), hreflang on the four translated pages, and a one-time banner offering the visitor's browser language (dismissal kept in localStorage). When you change English copy on those four pages, update `site.en.json` and the eight translations. Translations were machine-drafted: a native speaker should review before you promote a language.
- End-to-end test of the October 2026 features: `node tools/e2e-app.mjs <outdir>`.
- Migration `migrations/0006_app.sql` (applied to live). Terms at /app-terms/; the privacy notice has an app section.
- Monetisation stance (October 2026): free for now. Possible later paid tiers: department dashboards, optional encrypted cloud image backup (DPIA first).

## Verification: email, professional identity, credentials, supervisors (October 2026)
- Full design: `docs/verification-architecture.md`. Register research, what to ask each body, portfolio standards, privacy and store review: `docs/verification-integrations.md`.
- Migration `0011_verification.sql` is NOT yet applied to production. Until it is, `verificationReady()` keeps the old email and sign-off behaviour, and the professional endpoints answer 503.
- Keep five things separate:
  1. Email ownership (`learners.email_status`: legacy_unverified, unverified, verified).
  2. Professional registration (`professional_registrations`).
  3. External credentials (`credentials`, issued by SAM, ICS, BSE and others, never by Wavelength).
  4. Scoped Wavelength supervisor approval (`supervisor_approvals`, one pathway module per row).
  5. Badges, snapshots and the directory, computed on the server.
  Never add a `verified_supervisor` boolean, and never trust status sent by a browser.
- Email: `worker/email-verify.js`. Hashed, single-use, expiring, throttled tokens in `/app/#/verify-email/<token>`.
  - App sign-up on an Academy-only email finishes from a claim link, and returning Academy learners get a sign-in link: nobody takes over an account by typing an email.
  - Accepting a supervisor invitation needs a verified email, or the invitation's own token.
  - The logbook is never gated.
  - `EMAIL_VERIFY = "off"` is the emergency switch.
- Regulators and bodies live in `data/credentials.json`. Every adapter is `manual` (no permitted automated source yet), so claims go to `/volunteer/admin/supervisors/`.
  - `worker/verification/adapters.js` defines the adapter contract. `mock` is for tests only (`VERIFY_MOCK`, never in wrangler.jsonc).
  - Never scrape a register, bypass CAPTCHA or use an undocumented endpoint. A live adapter needs the body's written permission or licence.
- Name matching: `worker/verification/names.js` (`names-v1`). Formatting differences match; initials, middle-name use and partial surnames go to review. Bump `VERSION` when the rules change.
- Sign-offs and assessments store `supervisor_snapshot`, written once with the signature and never updated. Public verify pages show `supervisorCheck`, never registration numbers.
- Tests: `test/email-verify.test.mjs`, `test/professional.test.mjs`, `test/credentials.test.mjs`. Browser check: `tools/e2e-verification.mjs` (local setup in its header; never against production).
- Professional verification is off until `PROFESSIONAL_VERIFY = "true"`, and the directory until `DIRECTORY_PUBLIC = "true"`. Before switching either on, update the privacy notice, the DPIA and the store privacy answers (checklist in the architecture doc, section 14).

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

## Tests
- `npm test` (Node 22.5 or later, no installs): Node's test runner against the Worker with node:sqlite standing in for D1 (every file in `migrations/` applied) and a KV stub. `test/helpers/` holds the loader (lets Node import `.json` and `.bin` as Wrangler does) and the env. Covers sign-up, login lockout, session revocation, password reset, logbook ownership between accounts, server-owned sign-off, sync paging and conflicts, supervisor access and admin escaping. Add a test with any change to `worker/`.

## Sessions and sync (October 2026 review)
- Login cookies are stateless (180 days). A password change or reset sets `learners.sessions_after` (migration `0010_sessions.sql`), which refuses older cookies. `migrations/0010_sessions.sql` was applied to the live production D1 database (wavelength-volunteers) on 5 October 2026. The Worker still tolerates the column being absent.
- Logbook pulls are keyset-paged on (updated_at, id), 500 a page, with `more` and `after`; the cursor (`now`) trails the clock by a minute so writes in flight are not missed. A push conflict returns the server copy: the app rebases the learner's edit, except a restored backup, which never overwrites a live server copy.
- Admin HTML: never put submitted text inside an inline script or handler. Use `data-confirm` with `onsubmit="return confirm(this.dataset.confirm)"`.

## Before pushing
Run `npm test`. Build, then check pages at 390px and 1440px (`npm i --no-save playwright@1.56 && node tools/shots.mjs <outdir>`). No horizontal overflow, no console errors.

## App Store and Google Play
- `mobile/` holds Capacitor 8 shells (iOS and Android, bundle ID `uk.co.thewavelength.app`) that load the live app from https://thewavelength.co.uk/app/ (`server.url` in `mobile/capacitor.config.json`). Web changes reach store users at once; rebuild the shells only for native changes. Listing text, privacy labels, Data safety answers and review notes: `mobile/STORE.md`.
- Builds run on GitHub Actions only (workflows "Android app" and "iOS app", run by hand with a version number). Secrets are listed at the top of each workflow file. The Android workflow outputs a signed .aab and uploads to Play internal testing once `PLAY_SERVICE_ACCOUNT_JSON` exists; the iOS workflow uploads to TestFlight with an App Store Connect API key.
- After `npx cap add` or a Capacitor upgrade run `python3 mobile/scripts/patch-native.py` and `npm run assets` in `mobile/`.
- The shell appends `WavelengthApp` to the user agent (app.js treats it as installed) and exposes the Share and Filesystem plugins: `deliver()` and `navigator.share` in app.js use them when `window.Capacitor` is native, because WebView downloads and Web Share do not work there.
- Android cloud backup is off (`allowBackup` false) so logbook images never leave the phone through Google backup.
- Store review account: appreview@thewavelength.co.uk in the live `learners` table. Account deletion page for the stores: /app/delete-account/.

