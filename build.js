// Wavelength site builder. No dependencies: run `node build.js`, output goes to dist/.
// To change courses or dates, edit data/courses.json. Site-wide details live in data/site.json.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const courses = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses.json'), 'utf8'));
const BUILD = Date.now().toString(36);
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (p) => site.domain.replace(/\/$/, '') + p;
const money = (n) => (n == null || n === '' ? null : '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: Number(n) % 1 ? 2 : 0 }));
const fmtDate = (iso, opts) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'Europe/London' }, opts));
const mailto = (to, subject) => `mailto:${to}?subject=${encodeURIComponent(subject)}`;

const upcoming = (c) => (c.dates || []).filter((d) => d.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
const openCourses = courses.filter((c) => c.status !== 'hidden');

function mark({ size = 42, cls = '', draw = false, ring = 'currentColor' } = {}) {
  return `<svg class="${cls} ${draw ? 'draw' : ''}" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false"><circle class="mark-ring" cx="32" cy="32" r="30" stroke="${ring}" stroke-width="2"/><path class="mark-wave" d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const tick = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11" stroke="#2A7F8A" stroke-width="1.4"/><path d="M7.5 12.4l3 3 6-6.6" stroke="#2A7F8A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const arrow = `<svg class="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const mesh = `<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="grain" aria-hidden="true"></div>`;

const anyDates = courses.some((c) => (c.dates || []).some((d) => d.date >= new Date().toISOString().slice(0, 10)));
const BOOK_LABEL = anyDates ? 'Book a course' : 'Register interest';
const NAV = [
  { href: '/courses/', label: 'Courses' },
  { href: '/faculty/', label: 'Faculty' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
];

function layout({ title, description, pathname, body, jsonld = [], ogType = 'website', noindex = false }) {
  const canonical = url(pathname);
  const fullTitle = title ? `${title} | ${site.name}` : `${site.name} | Point-of-care ultrasound courses`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      '@id': url('/#org'),
      name: site.name,
      legalName: site.company,
      url: url('/'),
      logo: url('/assets/logo-512.png'),
      email: site.enquiriesEmail,
      slogan: site.tagline,
      areaServed: site.region,
      description: site.description,
      ...(site.linkedin ? { sameAs: [site.linkedin] } : {}),
    },
    ...jsonld,
  ];
  const navLinks = NAV.map((n) => `<a href="${n.href}"${pathname.startsWith(n.href) ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.description)}">
${noindex ? '' : `<link rel="canonical" href="${canonical}">`}
${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#0A1526">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${site.name}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${url('/assets/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/cormorant-garamond-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/dm-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css?v=${BUILD}">
<script>document.documentElement.classList.add('js');setTimeout(function(){if(!window.__wl)document.documentElement.classList.remove('js')},2500)</script>
<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? ld[0] : ld)}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" data-theme="dark">
  <div class="wrap bar">
    <a class="brand" href="/" aria-label="${site.name} home">${mark()}<span class="wm"><b>WAVELENGTH</b><small>TUNE IN · GAIN CLARITY</small></span></a>
    <nav class="nav" aria-label="Main">${navLinks}<a class="btn" href="/courses/core-emergency-ultrasound/#dates">${BOOK_LABEL}</a></nav>
    <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu"><span></span></button>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" aria-hidden="true">
  <a href="/">Home</a>${NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join('')}
  <a class="btn btn-teal" href="/courses/core-emergency-ultrasound/#dates">${BOOK_LABEL} ${arrow}</a>
</div>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="top">
      <div>
        <a class="brand" href="/" aria-label="${site.name} home">${mark({ ring: '#F7F5F0' })}<span class="wm"><b>WAVELENGTH</b><small>TUNE IN · GAIN CLARITY</small></span></a>
        <p class="foot-tag">Consultant-led point-of-care ultrasound courses for emergency and acute clinicians.</p>
      </div>
      <div><h2>Courses</h2><ul>${openCourses.map((c) => `<li><a href="/courses/${c.slug}/">${esc(c.title)}</a></li>`).join('')}<li><a href="/courses/">All courses</a></li></ul></div>
      <div><h2>Wavelength</h2><ul><li><a href="/about/">About</a></li><li><a href="/faculty/">Faculty</a></li><li><a href="/contact/">Contact</a></li></ul></div>
      <div><h2>Contact</h2><ul><li><a href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a></li><li><a href="mailto:${site.bookingsEmail}">${site.bookingsEmail}</a></li>${site.linkedin ? `<li><a href="${site.linkedin}" rel="me">LinkedIn</a></li>` : ''}</ul></div>
    </div>
    <div class="bottom">
      <span>© <span data-year>${new Date().getFullYear()}</span> ${site.company}${site.companyNumber ? `, registered in England and Wales no. ${site.companyNumber}` : ''}. Wavelength is a trading name of ${site.company}.${site.registeredOffice ? ` Registered office: ${esc(site.registeredOffice)}.` : ''}</span>
      <span><a href="/privacy/">Privacy</a> · <a href="/terms/">Booking terms</a> · <a href="/cancellation/">Cancellations</a></span>
    </div>
  </div>
</footer>
<script src="/assets/main.js?v=${BUILD}" defer></script>
</body>
</html>`;
}

function pageHero({ eyebrow, title, lede, crumbs = [], extra = '' }) {
  const crumbHtml = crumbs.length
    ? `<nav class="crumbs rise" aria-label="Breadcrumb">${crumbs.map((c, i) => (c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span aria-current="page">${esc(c.label)}</span>`) + (i < crumbs.length - 1 ? '<span aria-hidden="true">/</span>' : '')).join('')}</nav>`
    : '';
  return `<section class="hero compact on-dark">${mesh}
  <div class="wrap hero-inner" style="padding-top:0;padding-bottom:0">
    ${crumbHtml}
    <p class="eyebrow rise">${esc(eyebrow)}</p>
    <h1 class="split-words" style="font-size:clamp(46px,7vw,96px);margin-bottom:24px">${title}</h1>
    ${lede ? `<p class="lede rise">${lede}</p>` : ''}
    ${extra}
  </div>
</section>`;
}

function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, item: url(it.href) })) };
}

function datesBlock(c) {
  const list = upcoming(c);
  if (!list.length) {
    return `<div class="empty-dates reveal">
      <div><h3>New dates opening soon</h3><p>Register your interest and we will email you first when bookings open, before dates go public.</p></div>
      <a class="btn" href="${mailto(site.bookingsEmail, `Register interest: ${c.title}`)}">Register interest ${arrow}</a>
    </div>`;
  }
  return `<div class="dates">${list
    .map((d) => {
      const price = money(d.price != null ? d.price : c.price);
      const full = d.soldOut || d.places === 0;
      const low = !full && d.places != null && d.places <= 3;
      const book = full
        ? `<a class="btn btn-ghost" href="${mailto(site.bookingsEmail, `Waiting list: ${c.title}, ${d.date}`)}">Join waiting list</a>`
        : d.stripeLink
        ? `<a class="btn" href="${esc(d.stripeLink)}" rel="noopener">Book now ${arrow}</a>`
        : `<a class="btn" href="${mailto(site.bookingsEmail, `Booking enquiry: ${c.title}, ${fmtDate(d.date, { day: 'numeric', month: 'long', year: 'numeric' })}`)}">Request a place ${arrow}</a>`;
      return `<div class="date-row reveal">
        <div class="d">${fmtDate(d.date, { day: 'numeric', month: 'short' })}<small>${fmtDate(d.date, { weekday: 'long', year: 'numeric' })}</small></div>
        <div class="c">${esc(d.venue || 'Venue to be confirmed')}<small>${esc(d.city || '')}</small></div>
        <div class="p">${price || ''}${full ? '<div class="places low">Fully booked</div>' : d.places != null ? `<div class="places${low ? ' low' : ''}">${d.places} place${d.places === 1 ? '' : 's'} left</div>` : ''}</div>
        <div>${book}</div>
      </div>`;
    })
    .join('')}</div>`;
}

function courseLd(c) {
  const list = upcoming(c);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `${c.title} (${c.level})`,
    description: c.seoDescription || c.short,
    url: url(`/courses/${c.slug}/`),
    provider: { '@id': url('/#org'), '@type': 'EducationalOrganization', name: site.name, url: url('/') },
    educationalLevel: c.level,
    teaches: c.modules.map((m) => m.name),
    inLanguage: 'en-GB',
    audience: { '@type': 'EducationalAudience', educationalRole: 'Doctors, advanced clinical practitioners and other acute care clinicians' },
  };
  ld.hasCourseInstance = [{ '@type': 'CourseInstance', courseMode: 'Onsite', courseWorkload: 'PT8H', location: { '@type': 'Place', name: site.region, address: { '@type': 'PostalAddress', addressRegion: site.region, addressCountry: 'GB' } } }];
  if (list.length) {
    ld.hasCourseInstance = list.map((d) => ({
      courseWorkload: 'PT8H',
      '@type': 'CourseInstance',
      courseMode: 'Onsite',
      startDate: d.date,
      endDate: d.endDate || d.date,
      location: { '@type': 'Place', name: d.venue || site.region, address: { '@type': 'PostalAddress', addressLocality: d.city || '', addressCountry: 'GB' } },
      ...(money(d.price != null ? d.price : c.price) ? { offers: { '@type': 'Offer', price: String(d.price != null ? d.price : c.price), priceCurrency: 'GBP', availability: d.soldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: url(`/courses/${c.slug}/`), category: 'Paid' } } : {}),
    }));
  }
  if (c.price != null) ld.offers = { '@type': 'Offer', price: String(c.price), priceCurrency: 'GBP', category: 'Paid' };
  return ld;
}

function faqLd(faqs) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

function faqHtml(faqs) {
  return `<div class="faq">${faqs.map((f) => `<details class="reveal"><summary>${esc(f.q)}<span class="pm" aria-hidden="true"></span></summary><div class="a">${esc(f.a)}</div></details>`).join('')}</div>`;
}

function ctaBand(title = 'Tune in. <em>Gain clarity.</em>', text = 'Small groups, consultant faculty and hands-on scanning from the first hour.') {
  return `<section class="cta-band">${mesh}
  <div class="wrap">
    <h2 class="reveal">${title}</h2>
    <p class="reveal" data-d="1">${text}</p>
    <div class="hero-ctas reveal" data-d="2"><a class="btn btn-teal" href="/courses/core-emergency-ultrasound/#dates">See course dates ${arrow}</a><a class="btn btn-ghost light" href="/contact/">Ask a question</a></div>
  </div>
</section>`;
}

// ---------- Pages ----------
const pages = {};
const core = courses.find((c) => c.slug === 'core-emergency-ultrasound') || courses[0];
const nextDate = courses.flatMap((c) => upcoming(c).map((d) => ({ c, d }))).sort((a, b) => a.d.date.localeCompare(b.d.date))[0];

const generalFaqs = [
  { q: 'Who are Wavelength courses for?', a: 'Doctors at every grade in emergency, acute and internal medicine, plus advanced clinical practitioners, physician associates and GPs who work in urgent care.' },
  { q: 'Are the courses mapped to the RCEM curriculum?', a: 'Yes. The core course covers every core point-of-care ultrasound application in the RCEM 2021 curriculum, and we show you how to collect the supervised scans and assessments your department needs for sign-off.' },
  { q: 'How large are the groups?', a: 'Small. We cap numbers so each delegate gets long, supervised time on the probe at every station.' },
  { q: 'How do I pay?', a: 'Online by card through Stripe when you book. If your trust or deanery pays, email us and we will send an invoice.' },
  { q: 'What happens if I need to cancel?', a: 'You can transfer to a later date or cancel under our cancellation policy, which sets out the refund at each stage.' },
];

// Home
pages['/'] = layout({
  pathname: '/',
  description: site.description,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: url('/'), inLanguage: 'en-GB' }, faqLd(generalFaqs)],
  body: `
<section class="hero on-dark">${mesh}
  <canvas class="waves" aria-hidden="true"></canvas>
  <div class="wrap hero-inner">
    <div class="rise">${mark({ size: 96, cls: 'hero-mark', draw: true, ring: '#F7F5F0' })}</div>
    <p class="eyebrow rise">Point-of-care ultrasound courses</p>
    <h1 class="split-words">Tune in. <em>Gain clarity.</em></h1>
    <p class="lede rise">Hands-on ultrasound training for emergency and acute clinicians, mapped to the RCEM curriculum and led by an emergency medicine consultant who scans every shift.</p>
    <div class="hero-ctas rise">
      <a class="btn btn-teal" href="/courses/core-emergency-ultrasound/">Explore the core course ${arrow}</a>
      <a class="btn btn-ghost light" href="/courses/core-emergency-ultrasound/#dates">${nextDate ? 'Next date: ' + fmtDate(nextDate.d.date, { day: 'numeric', month: 'long' }) : 'Register interest'}</a>
    </div>
    <div class="hero-meta rise">
      <div><b>RCEM-mapped</b>Core applications for 2021 curriculum</div>
      <div><b>Small groups</b>Long, supervised time on the probe</div>
      <div><b>Consultant-led</b>Emergency medicine faculty</div>
    </div>
  </div>
  <div class="scroll-cue" aria-hidden="true"></div>
</section>

<section class="section">
  <div class="wrap split">
    <div>
      <p class="eyebrow reveal">Why Wavelength</p>
      <h2 class="statement reveal" data-d="1" style="margin-top:22px">Ultrasound changes decisions at the bedside. <span>We teach you to trust what you see.</span></h2>
    </div>
    <div class="reveal" data-d="2">
      <p class="lede">A course should leave you scanning on your next shift, not filing a certificate. Every Wavelength module follows the same rhythm: a short, focused talk, a live demonstration, then supervised time on the probe until the views come easily.</p>
      <p class="lede" style="margin-top:18px">You leave with the knowledge, the hands-on hours and a clear plan for sign-off in your own department.</p>
    </div>
  </div>
  <div class="wrap" style="margin-top:88px">
    <div class="pillars">
      <div class="pillar reveal"><div class="num">01</div><h3>Scan, don't sit</h3><p>Most of the day sits on the probe, with healthy models, simulators and vascular phantoms at every station.</p></div>
      <div class="pillar reveal" data-d="1"><div class="num">02</div><h3>Built for sign-off</h3><p>Content mapped to the RCEM 2021 curriculum, with logbook templates and guidance on supervised scans and assessments.</p></div>
      <div class="pillar reveal" data-d="2"><div class="num">03</div><h3>Led by a clinician</h3><p>Every course is led by an emergency medicine consultant and ultrasound lead who teaches the way he practises.</p></div>
    </div>
  </div>
</section>

<section class="section sand" id="courses">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">The course</p><h2 class="reveal" data-d="1">Start with the core.</h2></div>
    ${courseCard(core)}
    <p class="reveal" style="margin-top:36px;color:var(--slate)">Specialist courses follow. <a class="text-link" href="${mailto(site.enquiriesEmail, 'Specialist courses: keep me informed')}">Ask to hear first</a>.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">How it works</p><h2 class="reveal" data-d="1">From booking to sign-off.</h2></div>
    <div class="steps">
      <svg class="steps-line" viewBox="0 0 1000 32" preserveAspectRatio="none" aria-hidden="true"><path d="M0 16 C 60 -4, 110 36, 170 16 S 280 -4, 340 16 S 450 36, 510 16 S 620 -4, 680 16 S 790 36, 850 16 S 960 -4, 1000 16"/></svg>
      <div class="step reveal"><h3>Book online</h3><p>Choose a date and pay securely by card. Your confirmation and joining details arrive by email.</p></div>
      <div class="step reveal" data-d="1"><h3>Prepare</h3><p>We send a pre-course reading pack so the day goes straight to scanning.</p></div>
      <div class="step reveal" data-d="2"><h3>Scan</h3><p>A full day of small-group teaching and supervised hands-on practice.</p></div>
      <div class="step reveal" data-d="3"><h3>Sign off</h3><p>Take home your certificate, logbook template and a plan for supervised scans and assessment.</p></div>
    </div>
  </div>
</section>

<section class="section sand">
  <div class="wrap">${directorBlock()}</div>
</section>

<section class="section" id="dates">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">Dates</p><h2 class="reveal" data-d="1">Upcoming courses.</h2></div>
    ${datesBlock(core)}
  </div>
</section>

<section class="section sand">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Questions</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,64px);margin-top:20px">Good to know.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">Something else? <a class="text-link" href="/contact/">Get in touch</a>.</p></div>
    ${faqHtml(generalFaqs)}
  </div>
</section>
${ctaBand()}
`,
});

function courseCard(c, h = 'h3') {
  const list = upcoming(c);
  return `<a class="course-card reveal" href="/courses/${c.slug}/">
    <div class="glow" aria-hidden="true"></div>
    <div class="body">
      <p class="eyebrow light">${esc(c.level)}${c.status === 'planned' ? ' · In development' : ''}</p>
      <${h}>${esc(c.title)}</${h}>
      <p>${esc(c.short)}</p>
      <div class="chips"><span class="chip">${esc(c.duration)}</span><span class="chip">RCEM-mapped</span>${c.cpd ? `<span class="chip">${esc(c.cpd)} CPD</span>` : ''}${money(c.price) ? `<span class="chip">${money(c.price)}</span>` : ''}${list.length ? `<span class="chip">Next: ${fmtDate(list[0].date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div>
      <span class="btn btn-teal">View course ${arrow}</span>
    </div>
    <div class="modules"><ol>${c.modules.map((m) => `<li>${esc(m.name)}</li>`).join('')}</ol></div>
  </a>`;
}

function directorBlock() {
  const d = site.director;
  return `<div class="director">
    <div class="portrait reveal${d.photo ? ' has-photo' : ''}">${d.photo ? `<img src="${d.photo}" alt="${esc(d.name)}, ${esc(d.role)}" width="840" height="1050" loading="lazy" decoding="async">` : mark({ size: 200, ring: '#F7F5F0' })}<span class="cap">Course Director</span></div>
    <div>
      <p class="eyebrow reveal">Faculty</p>
      <h2 class="reveal" data-d="1">${esc(d.name)}</h2>
      <p class="role reveal" data-d="1">${esc(d.title)} · ${esc(d.role)}</p>
      ${d.bio.map((p) => `<p class="reveal" data-d="2">${esc(p)}</p>`).join('')}
      <div class="creds reveal" data-d="3">${d.credentials.map((x) => `<span class="chip dark">${esc(x)}</span>`).join('')}</div>
    </div>
  </div>`;
}

// Courses index
pages['/courses/'] = layout({
  title: 'Point-of-care ultrasound courses',
  pathname: '/courses/',
  description: 'Point-of-care ultrasound courses for emergency and acute clinicians, starting with the Level 1 core course mapped to the RCEM curriculum.',
  jsonld: [
    breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses/' }]),
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: openCourses.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/courses/${c.slug}/`) })) },
  ],
  body: `${pageHero({ eyebrow: 'Courses', title: 'Ultrasound courses', lede: 'Start with the core course. Specialist courses follow, each built on the same small-group, hands-on approach.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Courses' }] })}
<section class="section sand"><div class="wrap" style="display:grid;gap:32px">${openCourses.map((c) => courseCard(c, 'h2')).join('')}
  <div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">Specialist courses</h2><p>Further courses are in development. Tell us what you want to learn and we will let you know first.</p></div><a class="btn" href="${mailto(site.enquiriesEmail, 'Specialist courses: keep me informed')}">Keep me informed ${arrow}</a></div>
</div></section>
${ctaBand()}`,
});

// Course pages
for (const c of openCourses) {
  const p = `/courses/${c.slug}/`;
  const list = upcoming(c);
  const facts = [
    ['Level', c.level],
    ['Duration', `${c.duration}, ${c.hours}`],
    ['Fee', money(c.price) || 'Published with dates'],
    ['Next date', list.length ? fmtDate(list[0].date, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Opening soon'],
  ];
  pages[p] = layout({
    title: c.seoTitle || c.title,
    pathname: p,
    description: c.seoDescription || c.short,
    jsonld: [courseLd(c), faqLd(c.faqs), breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses/' }, { label: c.title, href: p }])],
    body: `${pageHero({
      eyebrow: `${c.level} course`,
      title: esc(c.title),
      lede: esc(c.short),
      crumbs: [{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses/' }, { label: c.title }],
      extra: `<div class="hero-ctas rise"><a class="btn btn-teal" href="#dates">${list.length ? 'Book a place' : 'Register interest'} ${arrow}</a><a class="btn btn-ghost light" href="#programme">See the programme</a></div>
      <dl class="facts rise">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,
    })}
<section class="section">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Overview</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Confident scanning from day one.</h2></div>
    <div>${c.overview.map((o, i) => `<p class="lede reveal" data-d="${i + 1}">${esc(o)}</p>`).join('')}</div>
  </div>
</section>
<section class="section sand">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">What you will learn</p><h2 class="reveal" data-d="1">${c.modules.length} modules, one day.</h2></div>
    <div class="module-grid">${c.modules.map((m, i) => `<article class="module reveal" data-d="${i % 2}"><div class="n">MODULE ${String(i + 1).padStart(2, '0')}</div><h3>${esc(m.name)}</h3><p>${esc(m.text)}</p></article>`).join('')}</div>
  </div>
</section>
<section class="section" id="programme">
  <div class="wrap split">
    <div>
      <p class="eyebrow reveal">Programme</p>
      <h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin:20px 0 28px">The day.</h2>
      <ol class="timeline reveal" data-d="2">${c.programme.map((r) => `<li><time>${esc(r.time)}</time><span>${esc(r.item)}</span></li>`).join('')}</ol>
    </div>
    <div>
      <p class="eyebrow reveal">Who it is for</p>
      <ul class="audience reveal" data-d="1" style="margin-top:20px">${c.audience.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      <p class="eyebrow reveal" style="margin-top:56px">Included</p>
      <ul class="checklist reveal" data-d="1" style="margin-top:20px">${c.includes.map((x) => `<li>${tick}<span>${esc(x)}</span></li>`).join('')}</ul>
    </div>
  </div>
</section>
${c.curriculum && c.curriculum.length ? `<section class="section sand">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Curriculum</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Mapped to RCEM.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">The course covers each core point-of-care ultrasound application in the RCEM 2021 curriculum. The table shows the training phase in which RCEM introduces each application and the indicative number of supervised logbook scans before sign-off.</p></div>
    <div class="table-wrap reveal" data-d="1"><table class="table"><thead><tr><th scope="col">Application</th><th scope="col">Introduced in</th><th scope="col">Indicative scans</th></tr></thead><tbody>${c.curriculum.map((r) => `<tr><td><b>${esc(r.application)}</b></td><td>${esc(r.stage)}</td><td>${esc(r.scans)}</td></tr>`).join('')}</tbody></table>
    <p class="source">Source: <a class="text-link" href="https://rcemcurriculum.co.uk/wp-content/uploads/2021/06/Appendix-3-PoCUS-for-2021-RCEM-curriculum.pdf" rel="noopener">RCEM 2021 curriculum, Appendix 3: PoCUS</a>. Scan numbers are indicative, not fixed targets. Sign-off also requires e-learning or course attendance, reflections and an entrustment decision in your department.</p></div>
  </div>
</section>` : ''}
<section class="section" id="dates">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">Dates and booking</p><h2 class="reveal" data-d="1">Choose your date.</h2></div>
    ${datesBlock(c)}
    <p class="reveal" style="margin-top:28px;color:var(--slate);font-size:15px">Paying through your trust or deanery? <a class="text-link" href="${mailto(site.bookingsEmail, `Invoice request: ${c.title}`)}">Request an invoice</a>. Bookings follow our <a class="text-link" href="/terms/">booking terms</a> and <a class="text-link" href="/cancellation/">cancellation policy</a>.</p>
  </div>
</section>
<section class="section sand">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Questions</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Before you book.</h2></div>
    ${faqHtml(c.faqs)}
  </div>
</section>
${ctaBand()}`,
  });
}

// Faculty
pages['/faculty/'] = layout({
  title: 'Faculty | Consultant-led POCUS training',
  pathname: '/faculty/',
  description: `Meet the Wavelength team: Course Director ${site.director.name}, Consultant in Emergency Medicine, and General Manager Dr Zahra Habibzadeh, ultrasonographer.`,
  jsonld: [
    breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Faculty', href: '/faculty/' }]),
    { '@context': 'https://schema.org', '@type': 'Person', name: site.director.name, jobTitle: site.director.title, worksFor: { '@id': url('/#org') }, description: site.director.bio[0] },
    ...(site.team || []).map((m) => ({ '@context': 'https://schema.org', '@type': 'Person', name: m.name, jobTitle: m.role, worksFor: { '@id': url('/#org') }, description: m.bio[0], ...(m.photo ? { image: url(m.photo) } : {}) })),
  ],
  body: `${pageHero({ eyebrow: 'Faculty', title: 'Taught by clinicians who scan.', lede: 'Our faculty are emergency medicine consultants and experienced ultrasound practitioners. They teach the way they practise.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Faculty' }] })}
<section class="section"><div class="wrap">${directorBlock()}</div></section>
${(site.team || []).map((m) => `<section class="section sand"><div class="wrap"><div class="director">
  <div class="portrait reveal${m.photo ? ' has-photo' : ''}">${m.photo ? `<img src="${m.photo}" alt="${esc(m.name)}, ${esc(m.role)}" width="840" height="1050" loading="lazy" decoding="async">` : mark({ size: 200, ring: '#F7F5F0' })}<span class="cap">${esc(m.role)}</span></div>
  <div><p class="eyebrow reveal">Management</p><h2 class="reveal" data-d="1">${esc(m.name)}</h2><p class="role reveal" data-d="1">${m.title ? esc(m.title) + ' · ' : ''}${esc(m.role)}</p>${m.bio.map((p) => `<p class="reveal" data-d="2">${esc(p)}</p>`).join('')}${m.credentials ? `<div class="creds reveal" data-d="3">${m.credentials.map((x) => `<span class="chip dark">${esc(x)}</span>`).join('')}</div>` : ''}</div>
</div></div></section>`).join('')}
<section class="section"><div class="wrap"><div class="empty-dates reveal"><div><h3>Join the faculty</h3><p>Experienced in point-of-care ultrasound and keen to teach? We would like to hear from you.</p></div><a class="btn" href="${mailto(site.enquiriesEmail, 'Faculty enquiry')}">Get in touch ${arrow}</a></div></div></section>
${ctaBand()}`,
});

// About
pages['/about/'] = layout({
  title: 'About | Ultrasound training in Kent and London',
  pathname: '/about/',
  description: 'Wavelength runs consultant-led point-of-care ultrasound courses for emergency and acute clinicians in Kent and London.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'About', href: '/about/' }])],
  body: `${pageHero({ eyebrow: 'About', title: 'On the same <em style="font-style:italic;color:var(--teal-light)">wavelength.</em>', lede: 'Good teaching happens when teacher and learner tune in to each other. Good scanning happens when you tune the image until the answer is clear.', crumbs: [{ label: 'Home', href: '/' }, { label: 'About' }] })}
<section class="section">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Our approach</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">Fewer slides. <span>More scanning.</span></h2></div>
    <div class="reveal" data-d="2">
      <p class="lede">Wavelength started from a simple observation in the emergency department. Clinicians leave many ultrasound courses with a certificate but little confidence, because they spent the day watching rather than scanning.</p>
      <p class="lede">We build each course the other way round. Short, focused teaching. Live demonstration. Then supervised time on the probe, in small groups, until the views come easily and you know what to do with what you see.</p>
      <p class="lede">We start with the core applications every emergency clinician needs, mapped to the RCEM curriculum. Specialist courses follow on the same principles.</p>
    </div>
  </div>
</section>
<section class="section sand"><div class="wrap">
  <div class="pillars">
    <div class="pillar reveal"><div class="num">01</div><h3>Small groups</h3><p>We cap numbers so everyone gets long, supervised time at every station.</p></div>
    <div class="pillar reveal" data-d="1"><div class="num">02</div><h3>Clinical focus</h3><p>Every module answers a bedside question, from free fluid in trauma to the arrest that needs a cause.</p></div>
    <div class="pillar reveal" data-d="2"><div class="num">03</div><h3>Beyond the day</h3><p>Logbook templates, sign-off guidance and a route to supervised practice in your own department.</p></div>
  </div>
</div></section>
${ctaBand()}`,
});

// Contact
pages['/contact/'] = layout({
  title: 'Contact | Ultrasound course bookings',
  pathname: '/contact/',
  description: 'Contact Wavelength about ultrasound course bookings, invoices for trusts and deaneries, group bookings and faculty roles.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Contact', href: '/contact/' }])],
  body: `${pageHero({ eyebrow: 'Contact', title: 'Get in touch.', lede: 'Questions about a course, an invoice for your trust, a group booking or joining the faculty. We reply within two working days.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Contact' }] })}
<section class="section">
  <div class="wrap">
    <div class="contact-grid">
      <a class="contact-card reveal" href="mailto:${site.bookingsEmail}"><p class="eyebrow">Bookings and invoices</p><h2>${site.bookingsEmail}</h2><p>Places, payments, invoices and transfers.</p><span class="text-link">Email bookings</span></a>
      <a class="contact-card reveal" data-d="1" href="mailto:${site.enquiriesEmail}"><p class="eyebrow">General enquiries</p><h2>${site.enquiriesEmail}</h2><p>Course content, group bookings, faculty and partnerships.</p><span class="text-link">Email us</span></a>
    </div>
  </div>
</section>
<section class="section sand">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Send a message</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Tell us what you need.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">This opens your email app with your message ready to send.</p></div>
    <form class="form reveal" data-mailto="${site.enquiriesEmail}">
      <label>Name<input name="Name" autocomplete="name" required></label>
      <label>Email<input name="Email" type="email" autocomplete="email" required></label>
      <label>Role<input name="Role" placeholder="For example, ST4 emergency medicine"></label>
      <label>Subject<select name="subject"><option>Course enquiry</option><option>Invoice for my trust or deanery</option><option>Group booking</option><option>Faculty enquiry</option><option>Something else</option></select></label>
      <label>Message<textarea name="Message" required></textarea></label>
      <div><button class="btn" type="submit">Send message ${arrow}</button></div>
    </form>
  </div>
</section>`,
});

// Legal pages
const legal = {
  '/privacy/': {
    title: 'Privacy notice',
    body: `<p>This notice explains how ${site.company}, trading as Wavelength ("we"), collects and uses your personal data. We are the data controller for the data described here${site.registeredOffice ? `. Our registered office is ${site.registeredOffice}` : ''}${site.icoNumber ? ` and are registered with the Information Commissioner's Office under number ${site.icoNumber}` : ''}.</p>
<h2>What we collect</h2><ul><li>Your name, email address, job title, grade and workplace when you book or contact us.</li><li>Payment details, which Stripe processes on our behalf. We never see or store your full card number.</li><li>Dietary or access requirements you choose to tell us, so we can run the day safely.</li></ul>
<h2>Why we use it</h2><ul><li>To manage your booking, send joining instructions and issue your certificate (contract).</li><li>To keep financial records as the law requires (legal obligation).</li><li>To tell you about future courses, only where you have agreed (consent). You can unsubscribe at any time.</li></ul>
<h2>Who we share it with</h2><p>Stripe for payments, our email provider and our website host. Each acts under contract and protects your data. We do not sell your data.</p>
<h2>How long we keep it</h2><p>Booking and attendance records for six years, to meet accounting rules and to confirm attendance for appraisal or revalidation. Marketing preferences until you withdraw consent.</p>
<h2>Your rights</h2><p>You have the right to access, correct or delete your data, to object to or restrict its use, and to data portability. Email <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>. If you are unhappy with our response, you can complain to the Information Commissioner's Office at ico.org.uk.</p>`,
  },
  '/terms/': {
    title: 'Booking terms',
    body: `<p>These terms apply to every booking with ${site.company}, trading as Wavelength. By booking a place you accept them.</p>
<h2>Booking and payment</h2><p>Your place is confirmed when we receive full payment, or when we accept a purchase order from your employer. We send confirmation and joining instructions by email.</p>
<h2>Invoices</h2><p>Invoices for trusts and deaneries are payable within 30 days and before the course date. We hold the place for you until then.</p>
<h2>Attendance and certificates</h2><p>You receive a certificate of attendance when you attend the full course. Attending a course does not by itself grant competence or curriculum sign-off. Sign-off remains with your supervisors and department.</p>
<h2>Conduct and safety</h2><p>Hands-on sessions use volunteer models. We expect professional conduct at all times. Faculty may stop any practice that raises safety or dignity concerns.</p>
<h2>Changes by us</h2><p>We may change faculty, venue or programme details where needed. If we cancel a course, you choose a full refund or a free transfer to another date. We are not liable for travel or accommodation costs, so we advise flexible bookings.</p>
<h2>Your right to cancel</h2><p>Courses take place on a specific date, so the 14-day cooling-off period under the Consumer Contracts Regulations does not apply to them. Our cancellation policy gives you rights instead.</p>
<h2>Cancellations by you</h2><p>See our <a class="text-link" href="/cancellation/">cancellation policy</a>.</p>
<h2>Contact</h2><p><a class="text-link" href="mailto:${site.bookingsEmail}">${site.bookingsEmail}</a></p>`,
  },
  '/cancellation/': {
    title: 'Cancellation policy',
    body: `<p>Plans change on clinical rotas. We keep this policy simple.</p>
<h2>Transfers</h2><p>You can transfer once, free of charge, to another date of the same course if you tell us at least 14 days before the course.</p>
<h2>Cancellations</h2><ul><li>More than 30 days before the course: full refund, less a £50 administration fee.</li><li>14 to 30 days before the course: 50% refund.</li><li>Fewer than 14 days before the course: no refund. You can send a colleague in your place at no charge.</li></ul>
<h2>If we cancel</h2><p>You choose a full refund or a free transfer to another date.</p>
<h2>How to cancel</h2><p>Email <a class="text-link" href="mailto:${site.bookingsEmail}">${site.bookingsEmail}</a> with your name and course date. We process refunds within 14 days to the original payment card.</p>`,
  },
};
for (const [p, l] of Object.entries(legal)) {
  pages[p] = layout({
    title: l.title,
    pathname: p,
    description: `${l.title} for Wavelength ultrasound courses, run by ${site.company}.`,
    jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: l.title, href: p }])],
    body: `${pageHero({ eyebrow: 'Wavelength', title: esc(l.title), lede: `Last updated ${fmtDate(site.legalUpdated || TODAY, { day: 'numeric', month: 'long', year: 'numeric' })}.`, crumbs: [{ label: 'Home', href: '/' }, { label: l.title }] })}
<section class="section"><div class="wrap"><div class="prose reveal">${l.body}</div></div></section>`,
  });
}

// 404
const notFound = layout({
  title: 'Page not found',
  pathname: '/404',
  noindex: true,
  body: `${pageHero({ eyebrow: 'Error 404', title: 'Lost the signal.', lede: 'That page does not exist. Try the courses page or head home.', extra: '<div class="hero-ctas rise"><a class="btn btn-teal" href="/courses/">View courses</a><a class="btn btn-ghost light" href="/">Home</a></div>' })}`,
});

// ---------- Write output ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const [p, html] of Object.entries(pages)) {
  const dir = path.join(DIST, p);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
fs.writeFileSync(path.join(DIST, '404.html'), notFound);

// Static files
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, f.name), d = path.join(dst, f.name);
    f.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'src'), DIST);

fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap.xml')}\n`);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(pages)
    .map((p) => `  <url><loc>${url(p)}</loc><priority>${p === '/' ? '1.0' : p.startsWith('/courses/') ? '0.9' : ['/privacy/', '/terms/', '/cancellation/'].includes(p) ? '0.3' : '0.7'}</priority></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(DIST, 'site.webmanifest'), JSON.stringify({ name: site.name, short_name: site.name, start_url: '/', icons: [{ src: '/assets/logo-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/logo-512.png', sizes: '512x512', type: 'image/png' }], theme_color: '#0A1526', background_color: '#0A1526', display: 'standalone' }));
fs.writeFileSync(
  path.join(DIST, '_headers'),
  `/assets/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=86400\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n`
);
console.log(`Built ${Object.keys(pages).length} pages to dist/`);
