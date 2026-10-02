# Wavelength website: notes for Claude

Site for Wavelength (trading name of Auda Medical Ltd, company 08487817), point-of-care ultrasound courses for emergency and acute clinicians. Owner: Dr Firas Abou-Auda, Course Director. General Manager: Dr Zahra Habibzadeh.

## How it works
- Static site, no framework. `node build.js` builds `dist/` from `data/*.json` and `src/`.
- Cloudflare Workers (static assets) builds every push to `main`: build `npm run build`, deploy `npx wrangler deploy` using `wrangler.jsonc`. Pushing to `main` publishes the live site.
- Domain: thewavelength.co.uk, set in `data/site.json` (`domain`). Firas is bidding for wavelength.co.uk; if he wins, change `domain` there.

## Common changes
- Course dates, prices, venues, Stripe payment links: `data/courses.json` (`dates` array; see README).
- New course: copy a course object in `data/courses.json`, new `slug`.
- Team, emails, company details: `data/site.json`.
- Photos: crop to 4:5 head and shoulders, 840x1050, plain studio background, export WebP to `src/assets/team-<name>.webp`.

## Brand
- Navy #0F1E33, deep navy #0A1526, teal #2A7F8A, light teal #7FC4CC, cream #F7F5F0, sand #EDEAE3.
- Cormorant Garamond (display) and DM Sans (text), self-hosted in `src/assets/fonts`.
- Logo: rounded amplitude "W" wave in a thin circle. Tagline "Tune In · Gain Clarity".
- UK spelling. Plain, active copy. No em dashes.

## Before pushing
Build, then check pages at 390px and 1440px (`npm i --no-save playwright@1.56 && node tools/shots.mjs <outdir>`). No horizontal overflow, no console errors.
