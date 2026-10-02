# Wavelength website

Static site for thewavelength.co.uk. No framework, no dependencies at build time.

## Change courses, dates and prices
Edit `data/courses.json`. Each course has a `dates` list. Add a date like this:

```json
{ "date": "2027-03-14", "venue": "Darent Valley Hospital Education Centre", "city": "Dartford, Kent", "places": 12, "price": 350, "stripeLink": "https://buy.stripe.com/..." }
```

- No `stripeLink` yet: the button becomes "Request a place" (email).
- `"soldOut": true` or `"places": 0`: shows "Fully booked" with a waiting list button.
- Past dates disappear automatically on the next build.

Add a new course by copying the whole course object and giving it a new `slug`.

## Site details
`data/site.json` holds the domain, emails, company details and team.

## Build
`node build.js` writes the site to `dist/`.

## Hosting (Cloudflare Pages)
- Build command: `node build.js`
- Output directory: `dist`
Every push to `main` publishes automatically.

## Images
`node tools/images.mjs` regenerates favicons and the social share image (needs `npm install`).
