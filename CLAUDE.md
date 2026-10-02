# Wavelength website: notes for Claude

Site for Wavelength (trading name of Auda Medical Ltd, company 08487817), point-of-care ultrasound courses for emergency and acute clinicians. Owner: Dr Firas Abou-Auda, Course Director. General Manager: Dr Zahra Habibzadeh.

## How it works
- Static site, no framework. `node build.js` builds `dist/` from `data/*.json` and `src/`.
- Cloudflare Workers (static assets) builds every push to `main`: build `npm run build`, deploy `npx wrangler deploy` using `wrangler.jsonc`. Pushing to `main` publishes the live site.
- Domain: thewavelength.co.uk (and www), attached as custom domains in `wrangler.jsonc` routes and set in `data/site.json` (`domain`). workers.dev is off so only the real domain is indexed. Firas is bidding for wavelength.co.uk; if he wins, change `domain` there.

## Common changes
- Course dates, prices, venues, Stripe payment links: `data/courses.json` (`dates` array; see README).
- New course: copy a course object in `data/courses.json`, new `slug`.
- Team, emails, company details: `data/site.json`. Each person has an optional `email` shown on their profile (aliases of the shared Zoho inbox hello@).
- Photos: crop to 4:5 head and shoulders with the face centred, 1680x2100 (2x for sharp screens), plain studio background, export WebP to `src/assets/team-<name>.webp` and set `photo` in `data/site.json`.
- Accreditation: the core course is EUSEM, RCEM and FAMUS accredited (`accreditation` in `data/courses.json` and `data/site.json`). Faculty are FAMUS instructors. Say "RCEM curriculum", never "RCEM 2021 curriculum".
- Firas's bio uses `{scanYears}` (since 2008) and `{teachYears}` (since 2010), filled in at build time so the numbers stay current.

## Learn and newsletter
- Learn posts: Markdown files in `content/learn/` (front matter: title, summary, category, date, author, draft). `draft: true` or a future date keeps a post off the live site. Preview drafts with `DRAFTS=1 node build.js`. Images go in `content/learn/images/` and are referenced as `/learn/images/<file>`. The Learn nav link appears once one post is live.
- Newsletter form: `newsletter` in `data/site.json` posts straight to the Zoho Campaigns form "Website newsletter sign-up" (list "Wavelength newsletter", custom field Role = CONTACT_CF1, double opt-in on, redirect to `/subscribe/thanks/`). Empty `action` falls back to emailing hello@.
- Zoho Campaigns (EU): templates "Wavelength monthly newsletter" and "Wavelength welcome email"; workflow "Newsletter welcome" sends the welcome email when a contact joins the list. Merge tag for first name: `$[LI:FIRSTNAME]$`.
- Email templates for Zoho Campaigns: `src/email/newsletter/` and `src/email/welcome/` (live at /email/...). Images must use absolute https URLs.

## Volunteer area (hidden)
- `/volunteer/` is a hidden, password-protected sign-up for scanning-model volunteers. Not linked anywhere, noindex, not in the sitemap.
- `worker/index.js` runs first for `/volunteer/*` (`run_worker_first` in `wrangler.jsonc`), checks the login cookie, saves sign-ups to D1 (`wavelength-volunteers`, binding `DB`, schema in `migrations/`), and renders `/volunteer/admin/` (list, mark contacted, delete, CSV export).
- Logins live in the D1 `settings` table (volunteer_username "volunteer", admin_username "wavelength", PBKDF2 password hashes, session_secret). Never commit passwords. The admin page changes either password, and a change logs everyone out. Without settings the area shows "Opening soon".
- Local test: apply both files in `migrations/` with `npx wrangler d1 execute wavelength-volunteers --local --file ...`, insert test settings, then `npx wrangler dev --local`.

## Discount codes
Bookings go through Stripe Payment Links. Discount codes are Stripe promotion codes, switched on per payment link ("Allow promotion codes"). The course page tells people to enter codes on the payment page once any date has a `stripeLink`.

## Brand
- Navy #0F1E33, deep navy #0A1526, teal #2A7F8A, light teal #7FC4CC, cream #F7F5F0, sand #EDEAE3.
- Cormorant Garamond (display) and DM Sans (text), self-hosted in `src/assets/fonts`.
- Logo: rounded amplitude "W" wave in a thin circle. Tagline "Tune In · Gain Clarity".
- UK spelling. Plain, active copy. No em dashes.

## Before pushing
Build, then check pages at 390px and 1440px (`npm i --no-save playwright@1.56 && node tools/shots.mjs <outdir>`). No horizontal overflow, no console errors.
