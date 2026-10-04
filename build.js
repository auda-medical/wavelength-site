// Wavelength site builder. No dependencies: run `node build.js`, output goes to dist/.
// To change courses or dates, edit data/courses.json. Site-wide details live in data/site.json.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const yearsSince = (y) => new Date().getFullYear() - y;
const fill = (s) => String(s).replace(/\{scanYears\}/g, yearsSince(2008)).replace(/\{teachYears\}/g, yearsSince(2010));
const siteRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const site = JSON.parse(JSON.stringify(siteRaw), (k, v) => (typeof v === 'string' ? fill(v) : v));
const courses = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/courses.json'), 'utf8'));
const logbook = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/logbook.json'), 'utf8'));
const FACULTY_FORM = JSON.parse(fs.readFileSync(path.join(ROOT, 'worker/faculty-form.json'), 'utf8'));
const DEPT_FORM = JSON.parse(fs.readFileSync(path.join(ROOT, 'worker/department-form.json'), 'utf8'));
const md = require('./lib/md.js');
const SHOW_DRAFTS = process.env.DRAFTS === '1';
const LEARN_DIR = path.join(ROOT, 'content/learn');
const posts = (fs.existsSync(LEARN_DIR) ? fs.readdirSync(LEARN_DIR) : [])
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const { meta, html, questions } = md.parse(fs.readFileSync(path.join(LEARN_DIR, f), 'utf8'));
    const slug = meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}(-\d{2})?-/, '');
    return { ...meta, slug, html, questions, date: String(meta.date || '') };
  })
  .filter((p) => SHOW_DRAFTS || (p.draft !== true && p.date <= new Date().toISOString().slice(0, 10)))
  .sort((a, b) => b.date.localeCompare(a.date));
// Wavelength Academy modules: content/academy/<slug>/module.json, lesson Markdown files and assessment.md.
// The assessment answer key goes to worker/academy-data.json for server-side marking, never into pages.
const ACADEMY_DIR = path.join(ROOT, 'content/academy');
function parseAssessment(src) {
  const body = src.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
  return body.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.startsWith('?? ')).map((b, i) => {
    const lines = b.split('\n');
    const q0 = lines[0].slice(3).trim();
    const opts = md.seededShuffle(lines.filter((l) => /^[-+] /.test(l)).map((l) => ({ ok: l[0] === '+', text: l.slice(2).trim() })), q0).map((o, j) => ({ ...o, id: 'abcdefgh'[j] }));
    return { id: `q${i + 1}`, q: lines[0].slice(3).trim(), review: (lines.find((l) => l.startsWith('@ ')) || '').slice(2).trim(), options: opts, correct: (opts.find((o) => o.ok) || {}).id, why: lines.filter((l) => /^: /.test(l)).map((l) => l.slice(2).trim()).join(' ') };
  });
}
const modules = (fs.existsSync(ACADEMY_DIR) ? fs.readdirSync(ACADEMY_DIR) : [])
  .filter((d) => fs.existsSync(path.join(ACADEMY_DIR, d, 'module.json')))
  .map((d) => {
    const m = JSON.parse(fs.readFileSync(path.join(ACADEMY_DIR, d, 'module.json'), 'utf8'));
    m.lessonPages = m.lessons.map((slug) => {
      const { meta, html } = md.parse(fs.readFileSync(path.join(ACADEMY_DIR, d, slug + '.md'), 'utf8'), { inlineQuiz: true });
      return { slug: slug.replace(/^\d+-/, ''), file: slug, title: meta.title, minutes: Number(meta.minutes || 0), html, cases: /data-quiz/.test(html) };
    });
    m.questions = parseAssessment(fs.readFileSync(path.join(ACADEMY_DIR, d, 'assessment.md'), 'utf8'));
    return m;
  });
// Draft modules are built so the team can review them by link, but stay unlisted, noindex and out of the sitemap.
const liveModules = modules.filter((m) => m.draft !== true);

// Topic groups (data/site.json learnTopics) shared by the Pearls and Academy pages.
const TOPICS = ((site.learnTopics || {}).topics || []).concat([{ slug: 'more', label: 'More pearls', intro: 'Further techniques from the Wavelength faculty.', categories: [] }]);
const topicOf = (cat) => TOPICS.find((t) => t.categories.includes(cat)) || TOPICS[TOPICS.length - 1];
const topicRank = (cat) => TOPICS.indexOf(topicOf(cat));
liveModules.sort((a, b) => topicRank(a.category) - topicRank(b.category));
// Card image: a 16:10 thumbnail of the pearl graphic (tools/pearl-thumbs.py writes content/learn/images/thumbs/).
const thumbFor = (img) => (img && fs.existsSync(path.join(LEARN_DIR, 'images/thumbs', img)) ? `/learn/images/thumbs/${img}` : null);
const pearlThumb = (p) => thumbFor(((String(p.html).match(/\/learn\/images\/([a-z0-9-]+-pearl\.webp)/) || [])[1]));
const cardImg = (src) => (src ? `<span class="card-img"><img src="${src}" alt="" loading="lazy" decoding="async" width="720" height="450"></span>` : '');
const readMins = (html) => Math.max(2, Math.round(String(html).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200));
fs.writeFileSync(path.join(ROOT, 'worker/academy-data.json'), JSON.stringify({ modules: Object.fromEntries(modules.map((m) => [m.slug, { slug: m.slug, code: m.code, title: m.title, cpdHours: m.cpdHours, passMark: m.passMark, draft: m.draft === true, questions: m.questions.map((q) => ({ id: q.id, correct: q.correct, why: q.why, review: q.review, options: q.options.map((o) => o.id) })), lessons: Object.fromEntries(m.lessonPages.map((l) => [l.file, { title: l.title, path: `/elearning/${m.slug}/learn/${l.slug}/` }])) }])) }, null, 1) + '\n');
const BUILD = Date.now().toString(36);
const crypto = require('crypto');
const ver = (p) => { try { return p + '?v=' + crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, 'src', p))).digest('hex').slice(0, 8); } catch { return p; } };
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
  { href: '/courses/', label: 'Courses', match: ['/courses/', '/training/'], children: [
    { href: '/courses/', label: 'Ultrasound courses', short: 'Courses', text: 'Open courses with dates and online booking.' },
    { href: '/training/', label: 'Training for your department', short: 'For departments', text: 'A closed course or focused sessions for your team.' },
  ] },
  ...(posts.length || liveModules.length ? [{ href: '/learn/', label: 'Learn', match: ['/learn/', '/elearning/'], children: [
    ...(posts.length ? [{ href: '/learn/', label: 'Wavelength Pearls', short: 'Pearls', text: 'Free five-minute pearls, each with a short test.' }] : []),
    ...(liveModules.length ? [{ href: '/elearning/', label: 'Wavelength Academy', short: 'Academy', text: 'Free modules with a Wavelength certificate and CPD hours.' }] : []),
  ] }] : []),
  { href: '/app/get/', label: 'App', match: ['/app/'] },
  { href: '/faculty/', label: 'Faculty' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
];

function layout({ title, description, pathname, body, jsonld = [], ogType = 'website', noindex = false, ogImage = '/assets/og.png' }) {
  const canonical = url(pathname);
  const fullTitle = title ? `${title} | ${site.name}` : `${site.name} | Point-of-care ultrasound education`;
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
      ...([site.linkedin, site.instagram].filter(Boolean).length ? { sameAs: [site.linkedin, site.instagram].filter(Boolean) } : {}),
    },
    ...jsonld,
  ];
  const isCurrent = (n) => (n.match || [n.href]).some((h) => pathname.startsWith(h));
  const navLinks = NAV.map((n) => n.children && n.children.length > 1
    ? `<div class="nav-drop"><a href="${n.href}" class="nav-drop-link"${isCurrent(n) ? ' aria-current="page"' : ''} aria-haspopup="true" aria-expanded="false">${n.label}<svg class="nav-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a><div class="nav-panel">${n.children.map((c) => `<a href="${c.href}"${pathname.startsWith(c.href) ? ' aria-current="page"' : ''}><b>${c.label}</b><span>${c.text}</span></a>`).join('')}</div></div>`
    : `<a href="${n.href}"${isCurrent(n) ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  const mobileLinks = NAV.map((n) => n.children && n.children.length > 1
    ? `<a href="${n.href}">${n.label}</a><span class="mm-sub">${n.children.map((c) => `<a href="${c.href}">${c.short}</a>`).join('')}</span>`
    : `<a href="${n.href}">${n.label}</a>`).join('');
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
<meta property="og:image" content="${url(ogImage)}">
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
  <a href="/">Home</a>${mobileLinks}
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
        <p class="foot-tag">Point-of-care ultrasound education for emergency and acute clinicians: hands-on courses, free Pearls and Wavelength Academy.</p>
      </div>
      <div><h2>Courses</h2><ul>${openCourses.map((c) => `<li><a href="/courses/${c.slug}/">${esc(c.title)}</a></li>`).join('')}<li><a href="/courses/">All courses</a></li></ul></div>
      <div><h2>Wavelength</h2><ul><li><a href="/about/">About</a></li><li><a href="/faculty/">Faculty</a></li><li><a href="/training/">For departments</a></li><li><a href="/faculty/join/">Teach with us</a></li>${posts.length ? '<li><a href="/learn/">Pearls</a></li>' : ''}${liveModules.length ? '<li><a href="/elearning/">Academy</a></li>' : ''}<li><a href="/app/get/">Wavelength app</a></li><li><a href="/subscribe/">Newsletter</a></li><li><a href="/contact/">Contact</a></li></ul></div>
      <div><h2>Contact</h2><ul><li><a href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a></li><li><a href="mailto:${site.bookingsEmail}">${site.bookingsEmail}</a></li></ul>${socialIcons()}</div>
    </div>
    <div class="bottom">
      <span>© <span data-year>${new Date().getFullYear()}</span> ${site.company}${site.companyNumber ? `, registered in England and Wales no. ${site.companyNumber}` : ''}. Wavelength is a trading name of ${site.company}.${site.registeredOffice ? ` Registered office: ${esc(site.registeredOffice)}.` : ''} Wavelength is an independent education provider. It is not run or endorsed by the NHS, Dartford and Gravesham NHS Trust, RCEM, FAMUS or EUSEM.${site.icoNumber ? ` ICO registration ${esc(site.icoNumber)}.` : ''}</span>
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
      // Show the remaining count only once places run low (8 or fewer); otherwise show the cap.
      const showLeft = !full && d.places != null && (!d.capacity || d.places <= 8);
      const book = full
        ? `<a class="btn btn-ghost" href="${mailto(site.bookingsEmail, `Waiting list: ${c.title}, ${d.date}`)}">Join waiting list</a>`
        : d.stripeLink
        ? `<a class="btn" href="${esc(d.stripeLink)}" rel="noopener">Book now ${arrow}</a>`
        : `<a class="btn" href="${mailto(site.bookingsEmail, `Booking enquiry: ${c.title}, ${fmtDate(d.date, { day: 'numeric', month: 'long', year: 'numeric' })}`)}">Request a place ${arrow}</a>`;
      return `<div class="date-row reveal">
        <div class="d">${fmtDate(d.date, { day: 'numeric', month: 'short' })}<small>${fmtDate(d.date, { weekday: 'long', year: 'numeric' })}</small></div>
        <div class="c">${esc(d.venue || 'Venue to be confirmed')}<small>${esc(d.city || '')}</small></div>
        <div class="p">${price || ''}${full ? '<div class="places low">Fully booked</div>' : showLeft ? `<div class="places${low ? ' low' : ''}">${d.places} place${d.places === 1 ? '' : 's'} left</div>` : d.capacity ? `<div class="places">Maximum ${d.capacity} delegates</div>` : ''}</div>
        <div>${book}</div>
      </div>`;
    })
    .join('')}</div>`;
}

function eventsLd(c) {
  const [h0, h1] = (c.hours || '09:00 to 17:00').split(' to ');
  return upcoming(c).map((d) => ({
    '@context': 'https://schema.org',
    '@type': 'EducationEvent',
    name: `${c.title} (${c.level}), ${d.city ? d.city.split(',')[0] : site.region}`,
    description: c.seoDescription || c.short,
    startDate: `${d.date}T${h0}:00+00:00`,
    endDate: `${d.endDate || d.date}T${h1}:00+00:00`,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [url(c.ogImage || '/assets/og.png')],
    url: url(`/courses/${c.slug}/`),
    location: { '@type': 'Place', name: d.venue, address: { '@type': 'PostalAddress', ...(d.street ? { streetAddress: d.street } : {}), addressLocality: (d.city || '').split(',')[0], ...(d.city && d.city.includes(',') ? { addressRegion: d.city.split(',')[1].trim() } : {}), ...(d.postcode ? { postalCode: d.postcode } : {}), addressCountry: 'GB' } },
    organizer: { '@type': 'Organization', name: site.name, url: url('/') },
    ...(d.price ? { offers: { '@type': 'Offer', price: String(d.price), priceCurrency: 'GBP', availability: (d.soldOut || d.places === 0) ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', url: d.stripeLink || url(`/courses/${c.slug}/`), validFrom: '2026-10-01' } } : {}),
  }));
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
      location: { '@type': 'Place', name: d.venue || site.region, address: { '@type': 'PostalAddress', ...(d.street ? { streetAddress: d.street } : {}), addressLocality: (d.city || '').split(',')[0], ...(d.city && d.city.includes(',') ? { addressRegion: d.city.split(',')[1].trim() } : {}), ...(d.postcode ? { postalCode: d.postcode } : {}), addressCountry: 'GB' } },
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

function ctaBand(title = 'Tune in. <em>Gain clarity.</em>', text = 'Consultant faculty, one instructor to every four or five delegates, and hands-on scanning from the first hour.') {
  return `<section class="cta-band">${mesh}
  <div class="wrap">
    <h2 class="reveal">${title}</h2>
    <p class="reveal" data-d="1">${text}</p>
    <div class="hero-ctas reveal" data-d="2"><a class="btn btn-teal" href="/courses/core-emergency-ultrasound/#dates">See course dates ${arrow}</a><a class="btn btn-ghost light" href="/contact/">Ask a question</a></div>
  </div>
</section>`;
}

const ROLES = ['Emergency medicine doctor', 'Acute or internal medicine doctor', 'Advanced clinical practitioner', 'Physician associate', 'GP', 'Nurse', 'Sonographer', 'Medical student', 'Other'];

function subscribeForm({ id = 'sub', dark = false } = {}) {
  const n = site.newsletter || {};
  const live = !!n.action;
  const nm = (zoho, label) => (live ? zoho : label);
  const hidden = live ? Object.entries(n.hidden || {}).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('') : '<input type="hidden" name="subject" value="Newsletter sign-up">';
  return `<form class="form sub-form${dark ? ' on-dark-form' : ''}" ${live ? `action="${esc(n.action)}" method="post" target="zc-${id}" data-zoho` : `data-mailto="${site.enquiriesEmail}"`} id="${id}">
    ${hidden}
    <div class="sub-row">
      <label>First name<input name="${nm(n.firstNameField || 'FIRSTNAME', 'First name')}" autocomplete="given-name" required></label>
      <label>Email<input name="${nm(n.emailField || 'CONTACT_EMAIL', 'Email')}" type="email" autocomplete="email" required></label>
    </div>
    ${!live || n.roleField ? `<label>Role<select name="${nm(n.roleField, 'Role')}" required><option value="">Choose your role</option>${ROLES.map((r) => `<option>${r}</option>`).join('')}</select></label>` : ''}
    <label class="consent"><input type="checkbox"${live ? '' : ' name="Consent" value="yes"'} required><span>Send me the Wavelength newsletter: ultrasound skills, new Learn posts and course dates. I can unsubscribe at any time. Read our <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
    <div><button class="btn${dark ? ' btn-teal' : ''}" type="submit">Subscribe ${arrow}</button></div>
    ${live ? '' : '<p class="form-note">This opens your email app with your details ready to send.</p>'}
  </form>${live ? `<iframe name="zc-${id}" title="Newsletter sign-up" hidden tabindex="-1" style="display:none"></iframe>` : ''}`;
}

function subscribeBand(title = 'Ultrasound skills, <em>in your inbox.</em>', text = 'One email a month: a practical scanning skill, new Learn posts and course dates before they go public.') {
  return `<section class="section sub-band"><div class="wrap split">
    <div><p class="eyebrow reveal">Newsletter</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">${title}</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">${text}</p></div>
    <div class="reveal" data-d="1">${subscribeForm()}</div>
  </div></section>`;
}

const ICONS = {
  linkedin: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.9 5.9 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.9 5.9 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.9 5.9 0 0 0 2.13-1.38 5.9 5.9 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.9 5.9 0 0 0-1.38-2.13A5.9 5.9 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/></svg>',
};
function socialIcons() {
  const items = [['linkedin', 'LinkedIn'], ['instagram', 'Instagram']].filter(([k]) => site[k]);
  if (!items.length) return '';
  return `<div class="social">${items.map(([k, label]) => `<a href="${site[k]}" rel="me noopener" target="_blank" aria-label="Wavelength on ${label}">${ICONS[k]}</a>`).join('')}</div>`;
}

function reviewsBand() {
  const r = site.reviews; if (!r || !(r.items || []).length) return '';
  const star = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 1.5l2.6 5.5 6 .8-4.4 4.1 1.1 6-5.3-2.9-5.3 2.9 1.1-6L1.4 7.8l6-.8z"/></svg>';
  const stars = `<span class="stars" aria-label="5 out of 5 stars">${star.repeat(5)}</span>`;
  return `<section class="section reviews-band on-dark">${mesh}
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">Delegate reviews</p><h2 class="reveal" data-d="1">What delegates say about courses led by our Course Director.</h2><a class="rating-badge reveal" data-d="2" href="${r.url}" rel="noopener" target="_blank">${stars}<span>Rated 5 stars on Google</span></a></div>
    <div class="review-grid">${r.items.map((x, i) => `<figure class="review reveal" data-d="${i % 3}">${stars}<blockquote>${esc(x.text)}</blockquote><figcaption>${esc(x.name)} <span>Google review</span></figcaption></figure>`).join('')}</div>
    <p class="review-note reveal">${esc(r.note || '')} <a class="text-link" href="${r.url}" rel="noopener" target="_blank">Read all reviews on Google</a></p>
  </div>
</section>`;
}

// Tabs at the top of /learn/ and /elearning/ so visitors move between Pearls and Academy.
function learnSwitch(active) {
  if (!posts.length || !liveModules.length) return '';
  const tab = (key, href, label, note) => `<a class="learn-tab${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}><b>${label}</b><span>${note}</span></a>`;
  return `<nav class="learn-switch" aria-label="Learn"><div class="wrap">${tab('pearls', '/learn/', 'Wavelength Pearls', `${posts.length} free pearls with tests`)}${tab('academy', '/elearning/', 'Wavelength Academy', `${liveModules.length} certified ${liveModules.length === 1 ? 'module' : 'modules'} with CPD`)}</div></nav>`;
}

function postCard(p, h = 'h3', { topicView = false } = {}) {
  const meta = topicView
    ? `${readMins(p.html)} min read${p.questions && p.questions.length ? ` · ${p.questions.length} questions` : ''}`
    : `${p.date ? fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}${p.questions && p.questions.length ? ` · ${p.questions.length} questions` : ''}`;
  const search = topicView ? ` data-search="${esc([p.title, p.summary, p.category, topicOf(p.category).label].join(' ').toLowerCase())}"` : '';
  const img = pearlThumb(p);
  return `<a class="post-card reveal${img ? ' has-img' : ''}" href="/learn/${p.slug}/"${search}>${cardImg(img)}
    <p class="eyebrow">${esc(p.category || 'Learn')}${p.draft === true ? ' · Draft' : ''}</p>
    <${h}>${esc(p.title)}</${h}>
    <p>${esc(p.summary || '')}</p>
    <span class="meta">${meta}</span>
  </a>`;
}

// Academy link at the foot of a topic group and of a pearl.
function moduleStrip(m) {
  return `<a class="topic-module reveal" href="/elearning/${m.slug}/"><span class="topic-module-text"><span class="eyebrow">Wavelength Academy · Go deeper</span><strong>${esc(m.short || m.title)}</strong><span class="topic-module-meta">${m.cpdHours} ${m.cpdHours === 1 ? 'hour' : 'hours'} CPD · Certificate · Free</span></span>${arrow}</a>`;
}

// Topic index used by /learn/ (Pearls) and /elearning/ (Academy): filter bar, search, and one section per topic.
function topicIndex({ items, card, noun, nouns, ariaLabel, placeholder, summary, foot = () => '' }) {
  const groups = TOPICS.map((t) => ({ t, items: items.filter((x) => topicOf(x.category) === t) })).filter((g) => g.items.length);
  const chip = (slug, label, n, active) => `<a class="topic-chip${active ? ' is-active' : ''}" href="${slug === 'all' ? '#topics' : '#topic-' + slug}" data-topic="${slug}"${active ? ' aria-current="true"' : ''}>${esc(label)}<span>${n}</span></a>`;
  const icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  return `<div class="topic-bar" id="topics" data-topic-bar>
  <div class="wrap topic-bar-inner">
    <nav class="topic-chips" aria-label="${esc(ariaLabel)}">${chip('all', 'All', items.length, true)}${groups.map((g) => chip(g.t.slug, g.t.label, g.items.length)).join('')}</nav>
    <label class="topic-search">${icon}<span class="sr-only">Search the ${esc(nouns)}</span><input type="search" placeholder="${esc(placeholder)}" autocomplete="off" data-topic-search></label>
  </div>
</div>
<section class="section sand topic-index"><div class="wrap">
  <div class="topic-summary reveal">${summary(groups.length)}</div>
  ${groups.map((g, i) => `<section class="topic-group" id="topic-${g.t.slug}" data-group="${g.t.slug}" aria-labelledby="th-${g.t.slug}">
    <header class="topic-head reveal"><span class="topic-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h2 id="th-${g.t.slug}">${esc(g.t.label)}</h2><p>${esc(g.t.intro)}</p></div><span class="topic-count">${g.items.length} ${g.items.length === 1 ? noun : nouns}</span></header>
    <div class="post-grid">${g.items.map(card).join('')}</div>
    ${foot(g.t)}
  </section>`).join('')}
  <div class="topic-empty" data-topic-empty hidden><h2>Nothing matches your search.</h2><p>Try a shorter word, such as "lung" or "abscess", or <button type="button" class="text-link" data-topic-reset>show everything</button>.</p></div>
</div></section>`;
}
function pearlTopics() {
  return topicIndex({
    items: posts, noun: 'pearl', nouns: 'pearls', ariaLabel: 'Pearl topics', placeholder: 'Search a sign or condition',
    card: (p) => postCard(p, 'h3', { topicView: true }),
    summary: (n) => `<p>${posts.length} pearls in ${n} topics. Each teaches one technique and ends with a short test.</p>${posts.some((x) => x.questions.length) ? `<a class="text-link" href="/learn/test/">Open the question bank</a>` : ''}`,
    foot: (t) => { const mods = liveModules.filter((m) => topicOf(m.category) === t); return mods.length ? `<div class="topic-modules">${mods.map(moduleStrip).join('')}</div>` : ''; },
  });
}

// ---------- Pages ----------
const pages = {};
const core = courses.find((c) => c.slug === 'core-emergency-ultrasound') || courses[0];
const nextDate = courses.flatMap((c) => upcoming(c).map((d) => ({ c, d }))).sort((a, b) => a.d.date.localeCompare(b.d.date))[0];

const generalFaqs = [
  { q: 'Who are Wavelength courses for?', a: 'Doctors at every grade in emergency, acute and internal medicine, plus advanced clinical practitioners, physician associates and GPs who work in urgent care.' },
  { q: 'Are the courses mapped to the RCEM curriculum?', a: 'Yes. The core course covers the core emergency applications in the RCEM curriculum: eFAST, AAA, echo in life support and vascular access. We show you how to collect the supervised scans and assessments your department needs for sign-off.' },
  { q: 'Who teaches the courses?', a: 'Senior clinicians with years of scanning and teaching experience: FAMUS-accredited instructors and RCEM-approved ultrasound supervisors. The core course maps to the RCEM curriculum.' },
  { q: 'How large are the groups?', a: 'We teach in groups of four or five delegates, each with its own instructor, so you spend most of the day on the probe. A course day takes up to 25 delegates.' },
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
    <p class="eyebrow rise">Point-of-care ultrasound education</p>
    <h1 class="split-words">Tune in. <em>Gain clarity.</em></h1>
    <p class="lede rise">Hands-on courses, free five-minute Pearls and certified e-learning for emergency and acute clinicians. Mapped to the RCEM curriculum and led by an emergency medicine consultant who has scanned since 2008 and taught ultrasound since 2010.</p>
    <div class="hero-ctas rise">
      <a class="btn btn-teal" href="/courses/core-emergency-ultrasound/">Explore the core course ${arrow}</a>
      <a class="btn btn-ghost light" href="/courses/core-emergency-ultrasound/#dates">${nextDate ? 'Next date: ' + fmtDate(nextDate.d.date, { day: 'numeric', month: 'long' }) : 'Register interest'}</a>
    </div>
    <div class="hero-meta rise">
      <div><b>RCEM curriculum</b>Core emergency applications, mapped</div>
      <div><b>FAMUS-accredited instructors</b>Senior clinicians, years of experience</div>
      <div><b>RCEM-approved supervisors</b>Consultant-led faculty</div>
      <div><b>Four or five per instructor</b>Long, supervised time on the probe</div>
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
      <div class="pillar reveal" data-d="1"><div class="num">02</div><h3>Built for sign-off</h3><p>Content mapped to the RCEM curriculum, with logbook templates and guidance on supervised scans and assessments.</p></div>
      <div class="pillar reveal" data-d="2"><div class="num">03</div><h3>Led by a clinician</h3><p>Every course is led by an emergency medicine consultant and ultrasound lead who teaches the way they practise.</p></div>
    </div>
  </div>
</section>

<section class="section sand">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">Ways to learn</p><h2 class="reveal" data-d="1">Ultrasound education, on the probe and online.</h2></div>
    <div class="pillars">
      <a class="pillar reveal" href="/courses/" style="text-decoration:none;color:inherit"><div class="num">Courses</div><h3>Hands-on scanning days</h3><p>Consultant-led courses with one instructor to every four or five delegates, mapped to the RCEM curriculum.</p><span class="text-link">See courses</span></a>
      ${posts.length ? `<a class="pillar reveal" data-d="1" href="/learn/" style="text-decoration:none;color:inherit"><div class="num">Pearls</div><h3>Five-minute techniques</h3><p>${posts.length} free Wavelength Pearls, one view or pitfall at a time, each with a short test.</p><span class="text-link">Read the Pearls</span></a>` : ''}
      ${liveModules.length ? `<a class="pillar reveal" data-d="2" href="/elearning/" style="text-decoration:none;color:inherit"><div class="num">Academy</div><h3>Certified e-learning</h3><p>Free modules with lessons, clinical cases, an assessment and a CPD certificate anyone can verify online.</p><span class="text-link">Start a module</span></a>` : ''}
    </div>
    <a class="bank-link reveal" href="/app/get/" style="margin-top:28px;background:var(--navy)"><span><span class="eyebrow" style="color:var(--teal-l)">The Wavelength app</span><strong>Your ultrasound logbook: track RCEM, FAMUS and FUSIC targets, get signed off, and send QR-verified evidence to your portfolio. Free.</strong></span>${arrow}</a>
    ${liveModules.length ? `<div class="ac-verify reveal" style="margin-top:28px"><div><h3>Certificates you can prove</h3><p>Every Academy certificate shows your name, CPD hours and a unique code. Your educational supervisor, appraiser or employer checks it online in seconds.</p></div><a class="btn btn-ghost" href="/elearning/verify/">Verify a certificate ${arrow}</a></div>` : ''}
  </div>
</section>

<section class="section" id="courses">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">The course</p><h2 class="reveal" data-d="1">Start with the core.</h2></div>
    ${courseCard(core)}
    <p class="reveal" style="margin-top:36px;color:var(--slate)">Specialist courses follow. <a class="text-link" href="${mailto(site.enquiriesEmail, 'Specialist courses: keep me informed')}">Ask to hear first</a>.</p>
  </div>
</section>

<section class="section sand">
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

<section class="section">
  <div class="wrap">${directorBlock()}</div>
</section>
${reviewsBand()}

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
${posts.length ? `<section class="section"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">Learn</p><h2 class="reveal" data-d="1">From the scanning room.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:640px">Free five-minute Wavelength Pearls, each with a short test${liveModules.length ? ', and Wavelength Academy modules with a certificate of completion' : ''}.</p></div>${liveModules.length ? `<a class="bank-link reveal" href="/elearning/" style="background:var(--teal-ink)"><span><span class="eyebrow" style="color:var(--cream)">Wavelength Academy</span><strong>Free modules with a Wavelength certificate. Start with ${esc(liveModules[0].title.split(':')[0])}.</strong></span>${arrow}</a>` : ''}<div class="post-grid">${posts.slice(0, 3).map((p) => postCard(p)).join('')}</div><p class="reveal" style="margin-top:32px"><a class="text-link" href="/learn/">All ${posts.length} pearls</a></p></div></section>` : ''}
${subscribeBand()}
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
      <div class="chips"><span class="chip">${esc(c.duration)}</span>${(c.accreditation || []).length ? `<span class="chip">${c.accreditation.join(', ').replace(/, ([^,]*)$/, ' and $1')} accredited</span>` : '<span class="chip">RCEM-mapped</span>'}${c.cpd ? `<span class="chip">${esc(c.cpd)} CPD</span>` : ''}${money(c.price) ? `<span class="chip">${money(c.price)}</span>` : ''}${list.length ? `<span class="chip">Next: ${fmtDate(list[0].date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div>
      <span class="btn btn-teal">View course ${arrow}</span>
    </div>
    <div class="modules"><ol>${c.modules.map((m) => `<li>${esc(m.name)}</li>`).join('')}</ol></div>
  </a>`;
}

function personEmail(email, d = '2') {
  return email ? `<p class="email reveal" data-d="${d}"><a class="text-link" href="mailto:${email}">${email}</a></p>` : '';
}

function directorBlock() {
  const d = site.director;
  return `<div class="director">
    <div class="portrait reveal${d.photo ? ' has-photo' : ''}">${d.photo ? `<img src="${ver(d.photo)}" alt="${esc(d.name)}, ${esc(d.role)}" width="840" height="1050" loading="lazy" decoding="async">` : mark({ size: 200, ring: '#F7F5F0' })}<span class="cap">Course Director</span></div>
    <div>
      <p class="eyebrow reveal">Faculty</p>
      <h2 class="reveal" data-d="1">${esc(d.name)}</h2>
      <p class="role reveal" data-d="1">${esc(d.title)} · ${esc(d.role)}</p>
      ${d.bio.map((p) => `<p class="reveal" data-d="2">${esc(p)}</p>`).join('')}
      ${personEmail(d.email)}
      <div class="creds reveal" data-d="3">${d.credentials.map((x) => `<span class="chip dark">${esc(x)}</span>`).join('')}</div>
    </div>
  </div>`;
}

// Courses index
pages['/courses/'] = layout({
  title: 'Point-of-care ultrasound courses',
  pathname: '/courses/',
  description: 'Point-of-care ultrasound courses for emergency and acute clinicians, starting with the Level 1 core course, mapped to the RCEM curriculum.',
  jsonld: [
    breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses/' }]),
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: openCourses.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/courses/${c.slug}/`) })) },
  ],
  body: `${pageHero({ eyebrow: 'Courses', title: 'Ultrasound courses', lede: 'Start with the core course. Specialist courses follow, each built on the same small-group, hands-on approach.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Courses' }] })}
<section class="section sand"><div class="wrap" style="display:grid;gap:32px">${openCourses.map((c) => courseCard(c, 'h2')).join('')}
  <div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">Training for your department</h2><p>Run the core course or focused sessions for your team only, at your site, on dates that fit your rota.</p></div><a class="btn btn-teal" href="/training/">Ask for a proposal ${arrow}</a></div>
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
    ...((c.accreditation || []).length ? [['Accredited by', c.accreditation.join(', ').replace(/, ([^,]*)$/, ' and $1')]] : []),
    ['Fee', money(c.price) || 'Published with dates'],
    ['Next date', list.length ? fmtDate(list[0].date, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Opening soon'],
  ];
  pages[p] = layout({
    title: c.seoTitle || c.title,
    pathname: p,
    ...(c.ogImage ? { ogImage: c.ogImage } : {}),
    description: c.seoDescription || c.short,
    jsonld: [courseLd(c), ...eventsLd(c), faqLd(c.faqs), breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses/' }, { label: c.title, href: p }])],
    body: `${pageHero({
      eyebrow: `Core course · ${c.level} content`,
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
    <div><p class="eyebrow reveal">Curriculum</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Mapped to RCEM.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">The course covers the core emergency applications in the RCEM curriculum: eFAST, AAA, echo in life support and vascular access. The table shows the training phase in which RCEM introduces each application and the indicative number of supervised logbook scans before sign-off.</p><p class="reveal" data-d="2" style="margin-top:20px;padding:18px 22px;border-left:3px solid var(--teal);background:var(--sand)"><strong>A guide, not a target.</strong> RCEM sign-off rests on an entrustment decision by your supervisor, using your logbook, reflections and observed scans. Reaching a number does not by itself mean sign-off.</p></div>
    <div class="table-wrap reveal" data-d="1"><table class="table"><thead><tr><th scope="col">Application</th><th scope="col">Introduced in</th><th scope="col">Indicative scans (guide only)</th></tr></thead><tbody>${c.curriculum.map((r) => `<tr><td><b>${esc(r.application)}</b></td><td>${esc(r.stage)}</td><td>${esc(r.scans)}</td></tr>`).join('')}</tbody></table>
    <p class="source">Source: <a class="text-link" href="https://rcemcurriculum.co.uk/wp-content/uploads/2021/06/Appendix-3-PoCUS-for-2021-RCEM-curriculum.pdf" rel="noopener">RCEM curriculum, point-of-care ultrasound appendix</a>. Scan numbers are indicative, not fixed targets. Sign-off also requires e-learning or course attendance, reflections and an entrustment decision in your department.</p></div>
  </div>
</section>` : ''}
${reviewsBand()}
<section class="section" id="dates">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">Dates and booking</p><h2 class="reveal" data-d="1">Choose your date.</h2></div>
    ${datesBlock(c)}
    <p class="reveal" style="margin-top:28px;color:var(--slate);font-size:15px">${list.some((d) => d.stripeLink) ? 'Have a discount code? Enter it on the payment page after you click Book now. ' : ''}Paying through your trust or deanery? <a class="text-link" href="${mailto(site.bookingsEmail, `Invoice request: ${c.title}`)}">Request an invoice</a>. Bookings follow our <a class="text-link" href="/terms/">booking terms</a> and <a class="text-link" href="/cancellation/">cancellation policy</a>.</p>
  </div>
</section>
<section class="section sand">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Questions</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Before you book.</h2></div>
    ${faqHtml(c.faqs)}
  </div>
</section>
${subscribeBand('No dates that suit? <em>Hear first.</em>', 'Subscribe and we email you new dates before they go public, with a practical scanning skill each month.')}
${ctaBand()}`,
  });
}

// Faculty
pages['/faculty/'] = layout({
  title: 'Faculty | Consultant-led POCUS training',
  pathname: '/faculty/',
  description: `Meet the Wavelength team: Course Director ${site.director.name}, Consultant in Emergency Medicine, and General Manager Dr Zahra Habibzadeh, Emergency Medicine Specialist.`,
  jsonld: [
    breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Faculty', href: '/faculty/' }]),
    { '@context': 'https://schema.org', '@type': 'Person', name: site.director.name, jobTitle: site.director.title, worksFor: { '@id': url('/#org') }, description: site.director.bio[0], ...(site.director.email ? { email: site.director.email } : {}) },
    ...(site.team || []).map((m) => ({ '@context': 'https://schema.org', '@type': 'Person', name: m.name, jobTitle: m.role, worksFor: { '@id': url('/#org') }, description: m.bio[0], ...(m.email ? { email: m.email } : {}), ...(m.photo ? { image: url(m.photo) } : {}) })),
  ],
  body: `${pageHero({ eyebrow: 'Faculty', title: 'Taught by clinicians who scan.', lede: 'Every course is led by our Course Director and taught by emergency medicine clinicians who are FAMUS-accredited instructors and RCEM-approved ultrasound supervisors. They teach the way they practise.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Faculty' }] })}
<section class="section"><div class="wrap">${directorBlock()}</div></section>
<section class="section"><div class="wrap"><div class="empty-dates reveal"><div><h3>Teaching faculty</h3><p>Each course runs with one instructor to every four or five delegates. We name the faculty for your date in your joining instructions${(site.faculty || []).length ? '' : ', and add instructor profiles to this page as each one confirms'}.</p></div></div></div></section>
${[...(site.faculty || []).map((m) => ({ ...m, group: 'Teaching faculty' })), ...(site.team || [])].map((m) => `<section class="section sand"><div class="wrap"><div class="director">
  <div class="portrait reveal${m.photo ? ' has-photo' : ''}">${m.photo ? `<img src="${ver(m.photo)}" alt="${esc(m.name)}, ${esc(m.role)}" width="840" height="1050" loading="lazy" decoding="async">` : mark({ size: 200, ring: '#F7F5F0' })}<span class="cap">${esc(m.role)}</span></div>
  <div><p class="eyebrow reveal">${esc(m.group || 'Management')}</p><h2 class="reveal" data-d="1">${esc(m.name)}</h2><p class="role reveal" data-d="1">${m.title ? esc(m.title) + ' · ' : ''}${esc(m.role)}</p>${m.bio.map((p) => `<p class="reveal" data-d="2">${esc(p)}</p>`).join('')}${personEmail(m.email)}${m.credentials ? `<div class="creds reveal" data-d="3">${m.credentials.map((x) => `<span class="chip dark">${esc(x)}</span>`).join('')}</div>` : ''}</div>
</div></div></section>`).join('')}
<section class="section"><div class="wrap"><div class="empty-dates reveal"><div><h3>Teach with us</h3><p>Experienced in point-of-care ultrasound and keen to teach, run courses or write for Learn? Tell us about yourself and we will be in touch.</p></div><a class="btn" href="/faculty/join/">Apply to join the faculty ${arrow}</a></div></div></section>
${ctaBand()}`,
});

// Teach with us: faculty application form, saved by the Worker (worker/faculty.js)
const boxes = (name, items) => `<div class="check-grid">${items.map((x) => `<label class="consent"><input type="checkbox" name="${name}" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div>`;
pages['/faculty/join/'] = layout({
  title: 'Teach with us | Join the Wavelength faculty',
  pathname: '/faculty/join/',
  description: 'Experienced in point-of-care ultrasound? Apply to teach on Wavelength courses, help run them or write for Wavelength Pearls and Academy.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Faculty', href: '/faculty/' }, { label: 'Teach with us', href: '/faculty/join/' }])],
  body: `${pageHero({ eyebrow: 'Teach with us', title: 'Join the faculty.', lede: 'We look for clinicians who scan every week and enjoy teaching it. Tell us about your ultrasound experience and credentials, and we will be in touch.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Faculty', href: '/faculty/' }, { label: 'Teach with us' }] })}
<section class="section"><div class="wrap split">
  <div>
    <p class="eyebrow">What we look for</p>
    <ul class="checklist" style="margin-top:20px">${[
      'Regular point-of-care ultrasound in emergency or acute care',
      'FAMUS accreditation, RCEM supervisor approval or an equivalent ultrasound qualification',
      'Teaching experience, on courses or at the bedside',
      'Time to teach on at least one course day a year',
    ].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
    <aside class="callout" style="margin-top:36px"><p class="callout-title">What happens next</p><p>We read every application and reply within two weeks. If your experience fits a course, we arrange a short call and invite you to observe or co-teach a session first.</p></aside>
  </div>
  <form class="form" method="post" action="/api/faculty/apply">
    <p class="form-error" data-show-on="error" hidden>Please complete the required fields, tell us about your experience and tick the privacy box.</p>
    <div class="sub-row"><label>First name<input name="first_name" autocomplete="given-name" required maxlength="80"></label><label>Last name<input name="last_name" autocomplete="family-name" required maxlength="80"></label></div>
    <div class="sub-row"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="160"></label><label>Mobile (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label></div>
    <div class="sub-row"><label>Role<select name="profession" required><option value="">Choose one</option>${FACULTY_FORM.professions.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label><label>Specialty<input name="specialty" maxlength="120" placeholder="For example, EM"></label></div>
    <div class="sub-row"><label>Workplace<input name="organisation" autocomplete="organization" maxlength="160"></label><label>Registration (optional)<input name="registration" maxlength="60" placeholder="GMC, NMC or HCPC number"></label></div>
    <label>Point-of-care ultrasound experience<select name="experience" required><option value="">Choose one</option>${FACULTY_FORM.experience.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
    <fieldset class="vol-dates"><legend>Ultrasound credentials (tick all that apply)</legend>${boxes('credentials', FACULTY_FORM.credentials)}</fieldset>
    <fieldset class="vol-dates"><legend>Applications you scan and teach with confidence</legend>${boxes('applications', FACULTY_FORM.applications)}</fieldset>
    <fieldset class="vol-dates"><legend>How would you like to work with us?</legend>${boxes('interests', FACULTY_FORM.interests)}</fieldset>
    <label>Your experience and credentials<textarea name="details" required maxlength="3000" rows="7" placeholder="Your ultrasound training and accreditation, the courses you have taught on, how often you scan, and anything else we should know."></textarea></label>
    <label class="ac-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    <label class="consent"><input type="checkbox" name="confirm_privacy" value="yes" required><span>Wavelength stores my details to consider my application and contact me about faculty work, as set out in the <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
    <div><button class="btn btn-teal" type="submit">Send my application ${arrow}</button></div>
    <p class="form-note">Prefer email? Write to <a class="text-link" href="${mailto(site.enquiriesEmail, 'Faculty enquiry')}">${site.enquiriesEmail}</a>.</p>
  </form>
</div></section>`,
});
const TRAINING_FAQS = [
  { q: 'Where does the training take place?', a: 'At your education centre or simulation suite, or at a venue we arrange near you. We need a room for teaching and space for scanning stations.' },
  { q: 'Do we need to provide ultrasound machines?', a: 'We agree machines and scanning models with you when we plan the day. Teaching on the machines your team uses every shift helps learning transfer to practice.' },
  { q: 'How much does it cost?', a: 'We quote a fixed price for the group, based on the format, the number of delegates and the faculty needed. We invoice your trust, deanery or department.' },
  { q: 'Is the course accredited?', a: 'The core course is mapped to the RCEM curriculum. It is taught by FAMUS-accredited instructors and RCEM-approved ultrasound supervisors. Each delegate receives a certificate of attendance for their portfolio and appraisal.' },
  { q: 'Can delegates of different grades attend together?', a: 'Yes. Mixed groups of doctors, advanced clinical practitioners and physician associates work well. Tell us the mix and we set the stations to match.' },
  { q: 'How far ahead should we book?', a: 'Three months ahead gives time to plan rotas and study leave. Ask anyway if you need sooner, as we can sometimes fit a shorter lead time.' },
];
// Training for your department: in-house courses for departments and trusts. Enquiries go to worker/departments.js.
pages['/training/'] = layout({
  title: 'Training for your department | Point-of-care ultrasound for your team',
  pathname: '/training/',
  description: 'Point-of-care ultrasound training for your emergency department, urgent treatment centre or acute unit: the core course or focused sessions for your team, on dates that fit your rota.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Training for your department', href: '/training/' }])],
  body: `${pageHero({ eyebrow: 'For departments and trusts', title: 'Training for your department.', lede: 'Bring Wavelength to your team. We run the core course or focused scanning sessions for your staff only, at your education centre or a venue we arrange, on dates that fit your rota.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Training for your department' }], extra: `<div class="hero-ctas rise"><a class="btn btn-teal" href="#enquire">Ask for a proposal ${arrow}</a><a class="btn btn-ghost light" href="#options">See the options</a></div>` })}
<section class="section" id="options"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">What we offer</p><h2 class="reveal" data-d="1">Built around your team.</h2></div>
  <div class="pillars">
    <div class="pillar reveal"><div class="num">01</div><h3>The core course, for your team</h3><p>Our full-day core emergency ultrasound course, mapped to the RCEM curriculum, run for your staff only. Your team learns together and leaves with a shared standard.</p></div>
    <div class="pillar reveal" data-d="1"><div class="num">02</div><h3>Focused sessions</h3><p>Shorter, hands-on sessions on the scans your department needs most, such as lung, focused cardiac or proximal DVT. Ideal for a teaching day or a new service.</p></div>
    <div class="pillar reveal" data-d="2"><div class="num">03</div><h3>Regional and deanery groups</h3><p>Courses for trainees, advanced clinical practitioners or physician associates across a region, with one point of contact and one invoice.</p></div>
  </div>
</div></section>
<section class="section sand"><div class="wrap split">
  <div><p class="eyebrow reveal">Every booking includes</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,56px);margin-top:20px">The same standard as our open courses.</h2></div>
  <ul class="checklist reveal" data-d="1">${[
    'Teaching by FAMUS-accredited instructors and RCEM-approved ultrasound supervisors',
    'One instructor to every four or five delegates, with most of the day on the probe',
    'Content mapped to the RCEM curriculum and matched to your department',
    'Free Wavelength Academy modules for your team before and after the day, with a certificate for each module passed',
    'A certificate of attendance for every delegate, and an attendance and feedback summary for your education lead',
    'A fixed quote for the group and an invoice to your trust, deanery or department',
  ].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">How it works</p><h2 class="reveal" data-d="1">From enquiry to teaching day.</h2></div>
  <ol class="ac-steps">${[
    ['Tell us what you need', 'Your team, its experience, the scans you want and your preferred dates. The form below takes two minutes.'],
    ['Agree a plan', 'We reply within five working days with a programme, faculty numbers and a fixed quote.'],
    ['Set up the day', 'We agree the venue, ultrasound machines and scanning models with you, then send joining instructions to your delegates.'],
    ['Teach and follow up', 'We run the day, issue certificates, and send your summary with suggested Academy modules for your team.'],
  ].map(([h, t], i) => `<li class="reveal" data-d="${i}"><span class="ac-step-n">${i + 1}</span><h3>${h}</h3><p>${t}</p></li>`).join('')}</ol>
</div></section>
<section class="section sand" id="enquire"><div class="wrap split">
  <div>
    <p class="eyebrow reveal">Ask for a proposal</p>
    <h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,56px);margin:20px 0 24px">Tell us about your team.</h2>
    <p class="lede reveal" data-d="2">There is no obligation. We read every enquiry and reply within five working days.</p>
    <aside class="callout reveal" style="margin-top:36px"><p class="callout-title">Questions first?</p><p>Email <a class="text-link" href="${mailto(site.enquiriesEmail, 'Training for our department')}">${site.enquiriesEmail}</a> and we reply within two working days.</p></aside>
  </div>
  <form class="form" method="post" action="/api/training/enquire">
    <p class="form-error" data-show-on="error" hidden>Please complete the required fields and tick the privacy box.</p>
    <div class="sub-row"><label>First name<input name="first_name" autocomplete="given-name" required maxlength="80"></label><label>Last name<input name="last_name" autocomplete="family-name" required maxlength="80"></label></div>
    <div class="sub-row"><label>Work email<input name="email" type="email" autocomplete="email" required maxlength="160"></label><label>Phone (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label></div>
    <div class="sub-row"><label>Your role<select name="role"><option value="">Choose one</option>${DEPT_FORM.roles.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label><label>Setting<select name="setting"><option value="">Choose one</option>${DEPT_FORM.settings.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label></div>
    <label>Trust, hospital or organisation<input name="organisation" autocomplete="organization" required maxlength="200"></label>
    <fieldset class="vol-dates"><legend>What are you looking for?</legend>${boxes('training', DEPT_FORM.training)}</fieldset>
    <fieldset class="vol-dates"><legend>Scans your team wants to learn (optional)</legend>${boxes('topics', DEPT_FORM.topics)}</fieldset>
    <div class="sub-row"><label>Number of staff<select name="group_size" required><option value="">Choose one</option>${DEPT_FORM.sizes.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label><label>Preferred dates (optional)<input name="timing" maxlength="200" placeholder="For example, March 2027, weekdays"></label></div>
    <label>Anything else we should know (optional)<textarea name="details" maxlength="3000" rows="5" placeholder="Your team's experience, the machines you have, a service you are setting up, or a budget to work to."></textarea></label>
    <label class="ac-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    <label class="consent"><input type="checkbox" name="confirm_privacy" value="yes" required><span>Wavelength stores my details to answer this enquiry, as set out in the <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
    <div><button class="btn btn-teal" type="submit">Send my enquiry ${arrow}</button></div>
  </form>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Questions</p><h2 class="reveal" data-d="1">Before you ask.</h2></div>
  ${faqHtml(TRAINING_FAQS)}
</div></section>`,
});
pages['/training/thanks/'] = layout({
  title: 'Enquiry received',
  pathname: '/training/thanks/',
  noindex: true,
  body: `${pageHero({ eyebrow: 'Training for your department', title: 'Thank you.', lede: 'We have your enquiry. A member of the faculty replies within five working days with a plan and a quote.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Training for your department', href: '/training/' }, { label: 'Thank you' }], extra: '<div class="hero-ctas rise"><a class="btn btn-teal" href="/elearning/">Explore the Academy</a><a class="btn btn-ghost light" href="/">Home</a></div>' })}`,
});
pages['/faculty/join/thanks/'] = layout({
  title: 'Application received',
  pathname: '/faculty/join/thanks/',
  noindex: true,
  body: `${pageHero({ eyebrow: 'Teach with us', title: 'Thank you.', lede: 'We have your application. A member of the team reads every one and replies within two weeks.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Faculty', href: '/faculty/' }, { label: 'Thank you' }], extra: '<div class="hero-ctas rise"><a class="btn btn-teal" href="/learn/">Read the Pearls</a><a class="btn btn-ghost light" href="/">Home</a></div>' })}`,
});

// About
pages['/about/'] = layout({
  title: 'About | Point-of-care ultrasound education',
  pathname: '/about/',
  description: 'Wavelength is a point-of-care ultrasound education provider for emergency and acute clinicians: consultant-led hands-on courses, free Wavelength Pearls and Wavelength Academy e-learning.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'About', href: '/about/' }])],
  body: `${pageHero({ eyebrow: 'About', title: 'On the same <em style="font-style:italic;color:var(--teal-light)">wavelength.</em>', lede: 'Good teaching happens when teacher and learner tune in to each other. Good scanning happens when you tune the image until the answer is clear.', crumbs: [{ label: 'Home', href: '/' }, { label: 'About' }] })}
<section class="section">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Our approach</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">Fewer slides. <span>More scanning.</span></h2></div>
    <div class="reveal" data-d="2">
      <p class="lede">Wavelength started from a simple observation in the emergency department. Clinicians leave many ultrasound courses with a certificate but little confidence, because they spent the day watching rather than scanning.</p>
      <p class="lede">We build each course the other way round. Short, focused teaching. Live demonstration. Then supervised time on the probe, in groups of four or five, until the views come easily and you know what to do with what you see.</p>
      <p class="lede">Learning does not stop when the course ends. Wavelength Pearls teach one practical technique at a time, free, each with a short test. Wavelength Academy builds them into full modules with clinical cases, an assessment and a certificate. Courses, Pearls and Academy work together: you learn the theory online and practise it on the probe.</p>
      <p class="lede">We start with the core applications every emergency clinician needs, mapped to the RCEM curriculum. Senior FAMUS-accredited instructors and RCEM-approved ultrasound supervisors teach every course. Specialist courses, such as nerve blocks, follow on the same principles.</p>
    </div>
  </div>
</section>
<section class="section sand"><div class="wrap">
  <div class="pillars">
    <div class="pillar reveal"><div class="num">01</div><h3>Four or five per instructor</h3><p>Every group has its own instructor, so everyone gets long, supervised time at every station.</p></div>
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
    <div class="empty-dates reveal" style="margin-top:40px"><div><h3>Training for your team?</h3><p>We run the core course or focused sessions for departments, trusts and deaneries.</p></div><a class="btn btn-teal" href="/training/">Ask for a proposal ${arrow}</a></div>
    <div class="empty-dates reveal" style="margin-top:40px"><div><h3>Want to teach with us?</h3><p>Tell us about your ultrasound experience and credentials, and we will be in touch.</p></div><a class="btn" href="/faculty/join/">Apply to join the faculty ${arrow}</a></div>
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

// Subscribe
pages['/subscribe/'] = layout({
  title: 'Newsletter | Ultrasound skills by email',
  pathname: '/subscribe/',
  description: 'Subscribe to the Wavelength newsletter: one practical point-of-care ultrasound skill a month, new Learn posts and early access to course dates.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Newsletter', href: '/subscribe/' }])],
  body: `${pageHero({ eyebrow: 'Newsletter', title: 'Ultrasound skills, <em style="font-style:italic;color:var(--teal-light)">monthly.</em>', lede: 'One email a month from the Wavelength faculty. A practical scanning skill, new Learn posts, and course dates before they go public.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Newsletter' }] })}
<section class="section"><div class="wrap split">
  <div>
    <p class="eyebrow reveal">What you receive</p>
    <ul class="checklist reveal" data-d="1" style="margin-top:20px">${['A practical scanning skill each month, written by FAMUS instructors', 'New Learn posts, with images and pitfalls', 'Course dates before they go public', 'No sharing of your details, and one click to unsubscribe'].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
  </div>
  <div class="reveal" data-d="1">${subscribeForm({ id: 'sub-page' })}</div>
</div></section>`,
});
pages['/subscribe/thanks/'] = layout({
  title: 'Check your inbox',
  pathname: '/subscribe/thanks/',
  noindex: true,
  body: `${pageHero({ eyebrow: 'Newsletter', title: 'Check your inbox.', lede: 'We have sent you an email to confirm your subscription. Click the link inside it to start receiving the Wavelength newsletter. If it does not arrive within a few minutes, check your spam or junk folder.', extra: '<div class="hero-ctas rise"><a class="btn btn-teal" href="/courses/">View courses</a><a class="btn btn-ghost light" href="/">Home</a></div>' })}`,
});

// Booking confirmation (Stripe redirects here after payment)
pages['/booked/'] = layout({
  title: 'Booking confirmed',
  pathname: '/booked/',
  noindex: true,
  body: `${pageHero({ eyebrow: 'Booking confirmed', title: 'Thank you. <em style="font-style:italic;color:var(--teal-light)">See you on the day.</em>', lede: 'Your place is booked. Stripe has emailed your receipt, and your joining instructions follow by email within two working days.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Booking confirmed' }] })}
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">What happens next</p><h2 class="display reveal" data-d="1" style="font-size:clamp(34px,4vw,52px);margin-top:20px">Before the course.</h2></div>
  <ul class="checklist reveal" data-d="1">${['Check your inbox for the Stripe receipt and invoice', 'Joining instructions arrive within two working days, with venue, parking and timings', 'Your pre-course reading pack follows before the day', 'Questions or changes: email <a class="text-link" href="mailto:' + site.bookingsEmail + '">' + site.bookingsEmail + '</a>'].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
</div></section>`,
});

// Learn
pages['/learn/'] = layout({
  title: 'Learn | Point-of-care ultrasound skills',
  pathname: '/learn/',
  description: 'Practical point-of-care ultrasound skills from the Wavelength faculty: probe technique, views, pitfalls and cases for emergency and acute clinicians.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }])],
  body: `${pageHero({ eyebrow: 'Wavelength Pearls', title: 'From the scanning room.', lede: 'Free, five-minute point-of-care ultrasound pearls from the Wavelength faculty. One technique, one view or one pitfall at a time, each with a short test.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Learn' }] })}
${learnSwitch('pearls')}${posts.length ? pearlTopics() : `<section class="section sand"><div class="wrap"><div class="empty-dates reveal"><div><h3>First posts arriving soon</h3><p>Subscribe and the first Learn posts reach your inbox the day they go live.</p></div><a class="btn" href="/subscribe/">Subscribe ${arrow}</a></div></div></section>`}
${subscribeBand()}`,
});
function nextReview(p) { const d = new Date((p.reviewed || p.date) + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + 2); return d.toISOString().slice(0, 10); }
for (const p of posts) {
  const href = `/learn/${p.slug}/`;
  const sameTopic = posts.filter((o) => o.slug !== p.slug && topicOf(o.category) === topicOf(p.category));
  const others = sameTopic.concat(posts.filter((o) => o.slug !== p.slug && !sameTopic.includes(o))).slice(0, 3);
  const topicMods = liveModules.filter((m) => topicOf(m.category) === topicOf(p.category));
  pages[href] = layout({
    title: p.title,
    pathname: href,
    description: p.summary,
    ogType: 'article',
    noindex: p.draft === true,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.summary, datePublished: p.date, dateModified: p.reviewed || p.date, author: { '@type': 'Person', name: p.author || site.director.name }, publisher: { '@id': url('/#org') }, mainEntityOfPage: url(href), inLanguage: 'en-GB' },
      breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: p.title, href }]),
    ],
    body: `${pageHero({ eyebrow: (p.category || 'Learn') + (p.draft === true ? ' · Draft, not published' : ''), title: esc(p.title), lede: esc(p.summary || ''), crumbs: [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: p.title }], extra: `<p class="byline rise">${esc(p.author || site.director.name)}${p.date ? ' · ' + fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}${p.date ? ` · Reviewed ${fmtDate(p.reviewed || p.date, { month: 'long', year: 'numeric' })}, next review ${fmtDate(nextReview(p), { month: 'long', year: 'numeric' })}` : ''}</p>` })}
<section class="section"><div class="wrap"><article class="prose post reveal">${p.html}</article>
${p.questions.length ? `<div class="test-cta reveal"><div><p class="eyebrow">Test yourself</p><h3>${p.questions.length} questions on this pearl</h3><p>Answer at your own pace. Each answer comes with a short explanation. About ${Math.max(2, Math.round(p.questions.length * 0.6))} minutes.</p></div><a class="btn btn-teal" href="/learn/${p.slug}/test/">Take the test ${arrow}</a></div>` : ''}
<div class="post-cta reveal"><div><h3>Practise it with us</h3><p>Four or five delegates per instructor, FAMUS-accredited faculty and long, supervised time on the probe.</p></div><a class="btn btn-teal" href="/courses/core-emergency-ultrasound/">See the core course ${arrow}</a></div>
</div></section>
${others.length || topicMods.length ? `<section class="section sand"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">More on ${esc(topicOf(p.category).label.toLowerCase())}</p></div>${others.length ? `<div class="post-grid">${others.map((o) => postCard(o, 'h3', { topicView: true })).join('')}</div>` : ''}${topicMods.length ? `<div class="topic-modules">${topicMods.map(moduleStrip).join('')}</div>` : ''}<p class="reveal" style="margin-top:32px"><a class="text-link" href="/learn/#topic-${topicOf(p.category).slug}">All ${esc(topicOf(p.category).label.toLowerCase())} pearls</a></p></div></section>` : ''}
${subscribeBand('Get the next one <em>by email.</em>')}`,
  });
}

// Learn tests: one page per post with questions, plus a question bank listing them all
const tested = posts.filter((p) => p.questions.length);
for (const p of tested) {
  const href = `/learn/${p.slug}/test/`;
  const i = tested.indexOf(p);
  const next = tested[(i + 1) % tested.length];
  pages[href] = layout({
    title: `Test yourself: ${p.title}`,
    pathname: href,
    description: `${p.questions.length} questions on ${p.title}, with an explanation for every answer.`,
    noindex: p.draft === true,
    jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: p.title, href: `/learn/${p.slug}/` }, { label: 'Test yourself', href }])],
    body: `${pageHero({ eyebrow: 'Test yourself' + (p.draft === true ? ' · Draft, not published' : ''), title: esc(p.title), lede: `${p.questions.length} questions. Pick an answer to see whether you are right and why. Your score appears at the end.`, crumbs: [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: p.title, href: `/learn/${p.slug}/` }, { label: 'Test' }] })}
<section class="section"><div class="wrap"><div class="prose post test" data-test data-total="${p.questions.length}">
<p class="test-back"><a class="text-link" href="/learn/${p.slug}/">Read the pearl first</a></p>
<div class="test-progress" aria-live="polite"><span data-progress>0 of ${p.questions.length} answered</span><span class="test-bar"><i data-bar></i></span></div>
${p.questions.join('\n')}
<div class="test-score" data-score hidden><p class="eyebrow">Your score</p><p class="test-result"><span data-right>0</span> of ${p.questions.length}</p><p data-message></p>
<div class="test-actions"><a class="btn" href="/learn/${p.slug}/">Back to the pearl</a>${next && next !== p ? `<a class="btn btn-teal" href="/learn/${next.slug}/test/">Next test ${arrow}</a>` : ''}<button type="button" class="text-link test-retry" data-retry>Try again</button></div></div>
</div>
<div class="post-cta reveal"><div><h3>Practise it with us</h3><p>Four or five delegates per instructor, FAMUS-accredited faculty and long, supervised time on the probe.</p></div><a class="btn btn-teal" href="/courses/core-emergency-ultrasound/">See the core course ${arrow}</a></div>
</div></section>
${subscribeBand('A new pearl and test <em>every month.</em>')}`,
  });
}
if (tested.length) {
  pages['/learn/test/'] = layout({
    title: 'Question bank | Point-of-care ultrasound',
    pathname: '/learn/test/',
    description: 'Test your point-of-care ultrasound knowledge, one Wavelength Pearl at a time. Every answer comes with an explanation.',
    jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: 'Question bank', href: '/learn/test/' }])],
    body: `${pageHero({ eyebrow: 'Question bank', title: 'Test yourself.', lede: 'Short tests on each Wavelength Pearl. Read the pearl, then check what stuck. Every answer comes with an explanation.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: 'Question bank' }] })}
<section class="section sand"><div class="wrap"><div class="post-grid">${tested.map((p) => `<a class="post-card reveal" href="/learn/${p.slug}/test/"><p class="eyebrow">${esc(p.category || 'Learn')}${p.draft === true ? ' · Draft' : ''}</p><h2>${esc(p.title)}</h2><p>${esc(p.summary || '')}</p><span class="meta">${p.questions.length} questions · Start the test</span></a>`).join('')}</div></div></section>
${subscribeBand('A new pearl and test <em>every month.</em>')}`,
  });
}

// ---------- Wavelength Academy ----------
// Public: /elearning/ (hub), /elearning/<slug>/ (module page with registration), /elearning/verify/.
// Behind registration (worker/index.js checks the login cookie): /elearning/<slug>/learn/<lesson>/ and /elearning/<slug>/assessment/.
// Rendered by the Worker into built shells: /elearning/certificate/<code>/ and /elearning/account/.
const AC = Object.assign({ name: 'Wavelength Academy', newsletterRequired: false }, site.academy || {});
const acCrumbs = (extra = []) => [{ label: 'Home', href: '/' }, { label: 'Academy', href: '/elearning/' }, ...extra];
const totalMinutes = (m) => m.lessonPages.reduce((n, l) => n + l.minutes, 0);
const caseCount = (m) => m.lessonPages.reduce((n, l) => n + (l.html.match(/data-quiz/g) || []).length, 0);
const moduleFacts = (m) => [
  `${m.cpdHours} ${m.cpdHours === 1 ? 'hour' : 'hours'} CPD`,
  `${m.lessonPages.filter((l) => !l.cases).length} lessons`,
  `${caseCount(m)} cases`,
  `${m.questions.length}-question assessment`,
  `Pass mark ${m.passMark}%`,
  'Free',
];
const factChips = (m) => `<ul class="ac-facts rise">${moduleFacts(m).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
const howItWorks = `<ol class="ac-steps">${[
  ['Register', 'Free. Your name, email and role. The newsletter is optional.'],
  ['Learn', 'Short lessons, the Wavelength Pearl, and clinical cases with explanations.'],
  ['Pass', `A final assessment, marked instantly. Pass at ${(liveModules[0] || modules[0] || {}).passMark || 80}% and retry as often as you need.`],
  ['Certificate', 'Emailed to you as a PDF with your name, CPD hours and a verification code.'],
].map(([h, t], i) => `<li class="reveal" data-d="${i}"><span class="ac-step-n">${i + 1}</span><h3>${h}</h3><p>${t}</p></li>`).join('')}</ol>`;

function moduleCard(m, h = 'h3') {
  const img = thumbFor(path.basename(m.image || ""));
  return `<a class="post-card ac-card reveal${img ? ' has-img' : ''}" href="/elearning/${m.slug}/" data-search="${esc([m.title, m.short, m.summary, m.category, topicOf(m.category).label].join(' ').toLowerCase())}">${cardImg(img)}
    <p class="eyebrow">${esc(topicOf(m.category).label)}${m.draft === true ? ' · Draft' : ''}</p>
    <${h}>${esc(m.title)}</${h}>
    <p>${esc(m.summary)}</p>
    <span class="meta">${m.cpdHours} ${m.cpdHours === 1 ? 'hour' : 'hours'} CPD · Wavelength certificate · Free</span>
  </a>`;
}

pages['/elearning/'] = layout({
  title: `${AC.name} | Certified point-of-care ultrasound e-learning`,
  pathname: '/elearning/',
  description: `Free point-of-care ultrasound e-learning modules with a Wavelength certificate of completion and CPD hours. Lessons, clinical cases and a final assessment, written by consultant emergency physicians.`,
  noindex: !liveModules.length,
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Academy', href: '/elearning/' }])],
  body: `${pageHero({ eyebrow: AC.name, title: 'Learn it. Prove it.', lede: 'Certified e-learning for point-of-care ultrasound. Work through the lessons and cases, pass the assessment, and your CPD certificate arrives by email with a code anyone can verify online.', crumbs: acCrumbs() })}
${learnSwitch('academy')}${liveModules.length ? topicIndex({
    items: liveModules, noun: 'module', nouns: 'modules', ariaLabel: 'Academy topics', placeholder: 'Search a module or condition',
    card: (m) => moduleCard(m, 'h3'),
    summary: (n) => `<p>${liveModules.length} certified modules in ${n} topics, ${liveModules.reduce((a, m) => a + Number(m.cpdHours || 0), 0)} hours of CPD in all. Each is free, with a Wavelength certificate when you pass.</p><a class="text-link" href="#how">How it works</a>`,
    foot: (t) => { const n = posts.filter((p) => topicOf(p.category) === t).length; return n ? `<p class="topic-related reveal"><a class="text-link" href="/learn/#topic-${t.slug}">${n} free ${esc(t.label.toLowerCase())} ${n === 1 ? 'pearl' : 'pearls'}</a></p>` : ''; },
  }) : `<section class="section sand"><div class="wrap"><div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">First module arriving soon</h2><p>Subscribe to the newsletter and hear the day it opens.</p></div><a class="btn" href="/subscribe/">Subscribe ${arrow}</a></div></div></section>`}
<section class="section" id="how"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">How it works</p><h2 class="reveal" data-d="1">Four steps to your certificate.</h2></div>
  ${howItWorks}
  <div class="ac-verify reveal"><div><h3>Checking a certificate?</h3><p>Every Academy certificate carries a code. Enter it to confirm it is genuine.</p></div><a class="btn btn-ghost" href="/elearning/verify/">Verify a certificate ${arrow}</a></div>
</div></section>
<section class="section sand"><div class="wrap"><a class="bank-link reveal" href="/learn/"><span><span class="eyebrow">Wavelength Pearls</span><strong>Five minutes to spare? Read a pearl.</strong></span>${arrow}</a><a class="bank-link reveal" href="/app/get/" style="margin-top:16px;background:var(--navy)"><span><span class="eyebrow" style="color:var(--teal-l)">Wavelength app</span><strong>Keep your certificates and your scan logbook in one place.</strong></span>${arrow}</a></div></section>
${subscribeBand()}`,
});

function registerCard(m) {
  const n = site.newsletter || {};
  const zoho = n.action ? `<form action="${esc(n.action)}" method="post" target="zc-academy" data-zoho-academy hidden>${Object.entries(n.hidden || {}).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')}<input type="hidden" name="${esc(n.firstNameField || 'FIRSTNAME')}" data-z="first"><input type="hidden" name="${esc(n.emailField || 'CONTACT_EMAIL')}" data-z="email">${n.roleField ? `<input type="hidden" name="${esc(n.roleField)}" data-z="role">` : ''}</form><iframe name="zc-academy" title="Newsletter sign-up" hidden tabindex="-1" style="display:none"></iframe>` : '';
  return `<aside class="ac-register" id="register">
  <div data-ac-guest>
    <p class="eyebrow">Free registration</p>
    <h2>Start the module</h2>
    <p class="form-note">Already registered? Enter the same email and you carry on where you left off.</p>
    <form class="form" method="post" action="/api/academy/register" data-ac-register>
      <input type="hidden" name="module" value="${m.slug}">
      <label>Title (optional)<select name="title" autocomplete="honorific-prefix"><option value="">None</option>${['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx'].map((t) => `<option>${t}</option>`).join('')}</select></label>
      <div class="sub-row"><label>First name<input name="first_name" autocomplete="given-name" maxlength="80" required></label><label>Last name<input name="last_name" autocomplete="family-name" maxlength="80" required></label></div>
      <p class="form-note ac-name-note">Your certificate shows your title and name exactly as you enter them here.</p>
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
      <label>Role<select name="role" required><option value="">Choose your role</option>${ROLES.map((r) => `<option>${r}</option>`).join('')}</select></label>
      <label>Workplace (optional)<input name="organisation" autocomplete="organization" maxlength="160"></label>
      <label class="ac-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input type="checkbox" name="newsletter" value="yes"${AC.newsletterRequired ? ' required' : ''}><span>Send me the Wavelength newsletter: a monthly ultrasound skill, new pearls and modules, and course dates. ${AC.newsletterRequired ? 'Joining the newsletter is part of free Academy registration. ' : ''}I can unsubscribe at any time.</span></label>
      <label class="consent"><input type="checkbox" name="privacy" value="yes" required><span>Wavelength stores my details to run the Academy, issue and verify my certificate, as set out in the <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
      <p class="form-error" data-ac-error hidden></p>
      <div><button class="btn btn-teal" type="submit">Register and start ${arrow}</button></div>
      <p class="form-note">If you tick the newsletter box, confirm your subscription from the email we send you.</p>
    </form>
    ${zoho}
  </div>
  <div data-ac-member hidden>
    <p class="eyebrow">Welcome back</p>
    <h2 data-ac-hello>You are registered</h2>
    <p data-ac-status>Pick up where you left off.</p>
    <div class="ac-member-actions"><a class="btn btn-teal" href="/elearning/${m.slug}/learn/${m.lessonPages[0].slug}/">Go to the lessons ${arrow}</a><a class="btn btn-ghost" href="/elearning/${m.slug}/assessment/">Final assessment</a></div>
    <p data-ac-cert hidden></p>
    <p class="form-note">Not you? <a class="text-link" href="/elearning/logout/">Log out</a></p>
  </div>
</aside>`;
}

function lessonNav(m, current) {
  return `<nav class="ac-nav" aria-label="Module contents"><p class="eyebrow">${esc(m.short || m.title)}</p><ol>${m.lessonPages.map((l, i) => `<li${l.slug === current ? ' aria-current="step"' : ''}><a href="/elearning/${m.slug}/learn/${l.slug}/"><span class="ac-nav-n">${i + 1}</span><span>${esc(l.title)}<small>${l.minutes} min</small></span></a></li>`).join('')}<li${current === 'assessment' ? ' aria-current="step"' : ''}><a href="/elearning/${m.slug}/assessment/"><span class="ac-nav-n">✓</span><span>Final assessment<small>${m.questions.length} questions</small></span></a></li></ol><ul class="ac-nav-foot"><li><a class="text-link" href="/elearning/${m.slug}/">Module overview</a></li><li><a class="text-link" href="/elearning/account/">My certificates</a></li></ul></nav>`;
}

for (const m of modules) {
  const base = `/elearning/${m.slug}/`;
  pages[base] = layout({
    title: `${m.title} | ${AC.name}`,
    pathname: base,
    description: m.summary,
    noindex: m.draft === true,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Course', name: m.title, description: m.summary, provider: { '@id': url('/#org') }, inLanguage: 'en-GB', isAccessibleForFree: true, educationalCredentialAwarded: 'Certificate of completion', timeRequired: `PT${m.cpdHours}H`, hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: `PT${m.cpdHours}H` }, offers: { '@type': 'Offer', price: 0, priceCurrency: 'GBP', category: 'Free' } },
      breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Academy', href: '/elearning/' }, { label: m.short || m.title, href: base }]),
    ],
    body: `${pageHero({ eyebrow: `${AC.name} · ${m.category}${m.draft === true ? ' · Draft, not published' : ''}`, title: esc(m.title), lede: esc(m.summary), crumbs: acCrumbs([{ label: m.short || m.title }]), extra: factChips(m) + `<p class="rise" style="margin-top:28px"><a class="btn btn-teal" href="#register">Register free and start ${arrow}</a></p>` })}
<section class="section"><div class="wrap ac-landing">
  <div class="prose">
    <h2>What you will learn</h2>
    <ul class="checklist">${m.outcomes.map((o) => `<li>${tick}<span>${esc(o)}</span></li>`).join('')}</ul>
    <h2>Lessons</h2>
    <ol class="ac-lessons">${m.lessonPages.map((l) => `<li><span>${esc(l.title)}</span><small>${l.minutes} min</small></li>`).join('')}<li><span>Final assessment: ${m.questions.length} questions, pass mark ${m.passMark}%</span><small>${Math.max(5, Math.round(m.questions.length * 0.6))} min</small></li></ol>
    <h2>Who it is for</h2>
    <p>${esc(m.audience)}</p>
    <h2>Your certificate</h2>
    <p>Pass the assessment and we email your certificate as a PDF: your name, the module, ${m.cpdHours} ${m.cpdHours === 1 ? 'hour' : 'hours'} of CPD, the date and a code anyone can check at <a class="text-link" href="/elearning/verify/">thewavelength.co.uk/elearning/verify</a>. Upload it to your e-portfolio with a short reflection. Wavelength issues the certificate itself. It is not accredited by an external body, so record the hours as self-directed CPD under your own college or regulator's rules. The certificate records completed learning. Sign-off to scan independently stays with your department.</p>
    <h2>About this module</h2>
    <p><strong>Author.</strong> ${esc(m.author)}.<br><strong>Published.</strong> ${fmtDate(m.published, { month: 'long', year: 'numeric' })}. <strong>Next review.</strong> ${fmtDate(m.reviewDue, { month: 'long', year: 'numeric' })}.<br><strong>Conflicts of interest.</strong> ${esc(m.conflicts)}</p>
    <h3>References</h3>
    <ol class="ac-refs">${m.references.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    ${m.pearl ? `<p><a class="text-link" href="${m.pearl}">Read the free Wavelength Pearl on this topic</a></p>` : ''}
  </div>
  ${registerCard(m)}
</div></section>`,
  });

  m.lessonPages.forEach((l, i) => {
    const href = `${base}learn/${l.slug}/`;
    const prev = m.lessonPages[i - 1], next = m.lessonPages[i + 1];
    pages[href] = layout({
      title: `${l.title} | ${m.short || m.title}`,
      pathname: href,
      description: m.summary,
      noindex: true,
      body: `${pageHero({ eyebrow: `Lesson ${i + 1} of ${m.lessonPages.length} · ${l.minutes} min`, title: esc(l.title), crumbs: acCrumbs([{ label: m.short || m.title, href: base }, { label: `Lesson ${i + 1}` }]) })}
<section class="section"><div class="wrap ac-layout">
  ${lessonNav(m, l.slug)}
  <div>
    <article class="prose post"${l.cases ? ' data-test' : ''}>${l.html}</article>
    <div class="ac-pager">${prev ? `<a class="btn btn-ghost" href="${base}learn/${prev.slug}/">Previous: ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="btn" href="${base}learn/${next.slug}/">Next: ${esc(next.title)} ${arrow}</a>` : `<a class="btn btn-teal" href="${base}assessment/">Take the final assessment ${arrow}</a>`}</div>
  </div>
</div></section>`,
    });
  });

  pages[`${base}assessment/`] = layout({
    title: `Final assessment | ${m.short || m.title}`,
    pathname: `${base}assessment/`,
    description: m.summary,
    noindex: true,
    body: `${pageHero({ eyebrow: 'Final assessment', title: esc(m.title), lede: `${m.questions.length} questions. Pass mark ${m.passMark}%: ${Math.ceil((m.passMark / 100) * m.questions.length)} of ${m.questions.length}. When you pass, your certificate is emailed to you straight away. Retry as often as you need.`, crumbs: acCrumbs([{ label: m.short || m.title, href: base }, { label: 'Assessment' }]) })}
<section class="section"><div class="wrap ac-layout">
  ${lessonNav(m, 'assessment')}
  <div>
    <form class="prose post ac-assess" data-ac-assess data-module="${m.slug}" data-pass="${m.passMark}" data-total="${m.questions.length}" novalidate>
      <div class="test-progress" aria-live="polite"><span data-progress>0 of ${m.questions.length} answered</span><span class="test-bar"><i data-bar></i></span></div>
      ${m.questions.map((q, i) => `<fieldset class="quiz ac-q" data-q="${q.id}"><legend class="quiz-q"><span class="quiz-n">Question <span data-qn>${i + 1}</span></span>${esc(q.q)}</legend>
        <div class="quiz-opts">${q.options.map((o) => `<label class="quiz-opt"><input type="radio" name="${q.id}" value="${o.id}" required><span class="quiz-l">${o.id}</span><span>${esc(o.text)}</span></label>`).join('')}</div>
        <div class="ac-feedback" data-feedback hidden></div></fieldset>`).join('')}
      <p class="form-error" data-ac-error hidden></p>
      <div class="ac-submit"><button class="btn btn-teal" type="submit">Submit my answers ${arrow}</button></div>
      <noscript><p class="form-error">The assessment needs JavaScript switched on.</p></noscript>
    </form>
    <div class="ac-result" data-ac-result hidden></div>
  </div>
</div></section>`,
  });
}

pages['/elearning/verify/'] = layout({
  title: 'Verify a certificate',
  pathname: '/elearning/verify/',
  description: `Check a ${AC.name} certificate is genuine by entering its code.`,
  body: `${pageHero({ eyebrow: AC.name, title: 'Verify a certificate.', lede: 'Enter the code printed on the certificate, for example WL-DVT-7K3M-Q9XA.', crumbs: acCrumbs([{ label: 'Verify' }]) })}
<section class="section"><div class="wrap"><form class="form ac-verify-form" method="get" action="/elearning/verify/">
  <label>Certificate code<input name="code" required maxlength="40" autocomplete="off" placeholder="WL-DVT-XXXX-XXXX" style="text-transform:uppercase"></label>
  <div><button class="btn" type="submit">Check certificate ${arrow}</button></div>
  <p class="form-error" data-show-on="error" hidden>We could not find a certificate with that code. Check it and try again.</p>
</form></div></section>`,
});

pages['/elearning/certificate/'] = layout({
  title: 'Certificate',
  pathname: '/elearning/certificate/',
  description: `${AC.name} certificate.`,
  noindex: true,
  body: `<section class="hero compact on-dark">${mesh}<div class="wrap hero-inner" style="padding-top:0;padding-bottom:0"><nav class="crumbs rise" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/elearning/">Academy</a><span aria-hidden="true">/</span><span aria-current="page">Certificate</span></nav><p class="eyebrow rise">${AC.name}</p><h1 class="split-words" style="font-size:clamp(42px,6vw,80px);margin-bottom:12px" id="cert-title">Certificate</h1></div></section>
<section class="section"><div class="wrap" id="cert-root"></div></section>`,
});

pages['/elearning/account/'] = layout({
  title: 'My certificates',
  pathname: '/elearning/account/',
  description: `Your ${AC.name} modules and certificates.`,
  noindex: true,
  body: `${pageHero({ eyebrow: AC.name, title: 'My certificates.', crumbs: acCrumbs([{ label: 'My certificates' }]) })}
<section class="section"><div class="wrap" id="account-root"></div></section>`,
});

// Volunteer area (hidden, not linked, not in sitemap). worker/index.js guards every /volunteer/ page.
const volDates = courses.flatMap((c) => upcoming(c).map((d) => `${c.title}, ${fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${d.city ? ', ' + d.city : ''}`));
const volHero = (title, lede) => pageHero({ eyebrow: 'Volunteers', title, lede });
const volLogout = '<p class="vol-logout"><a class="text-link" href="/volunteer/logout/">Log out</a></p>';
pages['/volunteer/login/'] = layout({
  title: 'Volunteer login',
  pathname: '/volunteer/login/',
  noindex: true,
  body: `${volHero('Volunteer login.', 'Log in with the username and password you received from the Wavelength team.')}
<section class="section"><div class="wrap">
  <form class="form vol-login" method="post" action="/volunteer/login/">
    <p class="form-error" data-show-on="error" hidden>The username or password is not correct. Try again or email <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>.</p>
    <label>Username<input name="username" autocomplete="username" autocapitalize="none" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <div><button class="btn" type="submit">Log in ${arrow}</button></div>
  </form>
</div></section>`,
});
pages['/volunteer/'] = layout({
  title: 'Volunteer as a scanning model',
  pathname: '/volunteer/',
  noindex: true,
  body: `${volHero('Volunteer as a scanning model.', 'Help clinicians learn point-of-care ultrasound, and see how emergency scanning works from the other side of the probe. Ideal for medical students and anyone interested in ultrasound.')}
<section class="section"><div class="wrap split">
  <div>
    <p class="eyebrow">What it involves</p>
    <ul class="checklist" style="margin-top:20px">${[
      'Delegates scan you under direct supervision from our faculty',
      'Scans cover the abdomen, chest, heart and neck. Wear a two-piece outfit, and expect to expose your abdomen and chest',
      'A chaperone is available on request, and you may stop or take a break at any time',
      'You watch expert scanning all day and learn the anatomy on screen',
    ].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
    <aside class="callout" style="margin-top:36px"><p class="callout-title">Teaching, not diagnosis</p><p>Course scans are for teaching and are not a medical check-up. If faculty notice something unexpected, they tell you privately and advise you to see your GP. We do not record it.</p></aside>
    ${volLogout}
  </div>
  <form class="form" method="post" action="/volunteer/">
    <p class="form-error" data-show-on="error" hidden>Please complete the required fields and tick each confirmation.</p>
    <div class="sub-row"><label>First name<input name="first_name" autocomplete="given-name" required maxlength="80"></label><label>Last name<input name="last_name" autocomplete="family-name" required maxlength="80"></label></div>
    <div class="sub-row"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="160"></label><label>Mobile<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label></div>
    <label>I am a<select name="status" required><option value="">Choose one</option>${['Medical student', 'Physician associate student', 'Nursing student', 'Sonography or radiography student', 'Paramedic student', 'Doctor', 'Other healthcare professional', 'Other'].map((r) => `<option>${r}</option>`).join('')}</select></label>
    <div class="sub-row"><label>University or organisation<input name="organisation" maxlength="160"></label><label>Year of study (if a student)<input name="year" maxlength="40" placeholder="For example, Year 4"></label></div>
    <fieldset class="vol-dates"><legend>Which dates suit you?</legend>
      ${volDates.map((d) => `<label class="consent"><input type="checkbox" name="dates" value="${esc(d)}"><span>${esc(d)}</span></label>`).join('')}
      <label class="consent"><input type="checkbox" name="dates" value="Any date: contact me when dates are set"${volDates.length ? '' : ' checked'}><span>Any date. Contact me when new dates are set.</span></label>
    </fieldset>
    <label>Anything else we should know<textarea name="notes" maxlength="1000" placeholder="For example, travel limits or times you are unavailable. Please do not include medical details."></textarea></label>
    <label class="consent"><input type="checkbox" name="confirm_age" value="yes" required><span>I am aged 18 or over.</span></label>
    <label class="consent"><input type="checkbox" name="confirm_scan" value="yes" required><span>I agree to be scanned by course delegates under faculty supervision, and I understand I may stop at any time.</span></label>
    <label class="consent"><input type="checkbox" name="confirm_findings" value="yes" required><span>I understand course scans are for teaching, not diagnosis.</span></label>
    <label class="consent"><input type="checkbox" name="confirm_privacy" value="yes" required><span>Wavelength may store my details to arrange volunteer sessions, as set out in the <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
    <label class="consent"><input type="checkbox" name="future_contact" value="yes"><span>Contact me about future volunteer sessions. (Optional)</span></label>
    <div><button class="btn" type="submit">Sign up to volunteer ${arrow}</button></div>
  </form>
</div></section>`,
});
pages['/volunteer/thanks/'] = layout({
  title: 'Thank you for volunteering',
  pathname: '/volunteer/thanks/',
  noindex: true,
  body: `${volHero('Thank you.', 'We have your details. The Wavelength team will email you to confirm a date, timings and the venue.')}
<section class="section"><div class="wrap"><p><a class="btn" href="/volunteer/">Add another volunteer</a></p>${volLogout}</div></section>`,
});
pages['/volunteer/admin/'] = layout({
  title: 'Volunteer sign-ups',
  pathname: '/volunteer/admin/',
  noindex: true,
  body: `${volHero('Volunteer sign-ups.', 'Private to the Wavelength team. Volunteers never see this page.')}
<section class="section"><div class="wrap"><div id="admin-root"></div>${volLogout}</div></section>`,
});
pages['/volunteer/unavailable/'] = layout({
  title: 'Volunteer area',
  pathname: '/volunteer/unavailable/',
  noindex: true,
  body: `${volHero('Opening soon.', `The volunteer area is not open yet. Email <a class="text-link" href="mailto:${site.enquiriesEmail}" style="color:inherit">${site.enquiriesEmail}</a> to register your interest.`)}`,
});

// Wavelength app landing page (/app/get/). The app itself is static in src/app/.
{
  const f = (icon, t, d) => `<div class="pillar reveal"><div class="num">${icon}</div><h3>${t}</h3><p>${d}</p></div>`;
  const appFaqs = [
    { q: 'Is it free?', a: 'Yes. The logbook, progress tracking, sign-off, exports and backups are free.' },
    { q: 'Does Wavelength see my scan photos?', a: 'No. Photos stay on your phone and in backup files you save to your own iCloud Drive, Google Drive or OneDrive. Only the written record syncs to your account, and it must never contain patient identifiers.' },
    { q: 'Which pathways does it track?', a: 'RCEM PoCUS, FAMUS (thoracic, abdominal-renal, DVT, peripheral access, LP) and FUSIC (heart, lung, abdomen, DVT, vascular access), plus a general logbook for any application with targets you set. One scan counts towards every pathway it fits.' },
    { q: 'Do I need an account?', a: 'Yes. The app, its exports and its downloads need a free Wavelength account. Every scan, sign-off and verified summary then belongs to a named clinician, which is what makes it trustworthy evidence.' },
    { q: 'How does it get into my e-portfolio?', a: 'Choose where the export is going (the RCEM e-portfolio on risr/advance, formerly Kaizen, the JRCPTB ePortfolio, FAMUS, FUSIC or appraisal) and the app builds the PDF and shows the steps for that portfolio. Wavelength is not yet connected directly to these systems, so you attach the file and paste the verification link. We are working towards direct links.' },
    { q: 'What is a verified summary?', a: 'A record of your progress against each pathway, created by Wavelength from your synced logbook, with a code and QR code on the PDF. Your supervisor, ARCP panel or accrediting body scans it and sees the same figures and sign-offs online, so they know the file has not been edited. It shows counts and dates only, never findings or images. You withdraw a summary at any time.' },
    { q: 'Will my college or accrediting body accept it?', a: 'The logbook records what the published curricula ask for, and verified summaries let reviewers check your evidence online. Your supervisor and the accrediting body decide what they accept, so check with them. Wavelength is independent of RCEM, JRCPTB, the Society for Acute Medicine and the Intensive Care Society.' },
    { q: 'Is it in the App Store?', a: 'Not yet. You install it from this website in two taps and it works like any app, including offline. App Store and Google Play versions follow.' },
    { q: 'What about my Academy certificates?', a: 'Log in with the same email and your Wavelength Academy certificates appear in the app, ready to share or verify.' },
  ];
  let html = layout({
    title: 'Wavelength app | Free ultrasound logbook with RCEM, FAMUS and FUSIC targets',
    pathname: '/app/get/',
    description: 'A free point-of-care ultrasound logbook. Log scans, track RCEM, FAMUS and FUSIC targets, get signed off, and export portfolio-ready PDFs with QR-verified summaries. Photos stay on your phone.',
    jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'App', href: '/app/get/' }]), faqLd(appFaqs), { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Wavelength', applicationCategory: 'MedicalApplication', operatingSystem: 'iOS, Android, web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' }, url: url('/app/get/') }],
    body: `<section class="hero on-dark">${mesh}<div class="wrap hero-inner app-hero">
  <div>
    <p class="eyebrow rise">The Wavelength app</p>
    <h1 class="split-words">Your logbook. <em>In your pocket.</em></h1>
    <p class="lede rise">Log every scan in seconds, watch your RCEM, FAMUS and FUSIC targets fill up in colour, and get signed off by your supervisor. Free, and your photos never leave your phone.</p>
    <div class="hero-ctas rise app-ctas">
      <button class="app-dl" type="button" data-app-install><span class="app-dl-ico">${mark({ size: 30, ring: '#7FC4CC' })}</span><span><small>Free for iPhone and Android</small><b>Download the app</b></span></button>
      <a class="btn btn-ghost light" href="/app/">Open in your browser</a>
    </div>
    <div class="app-ios rise" data-app-ios hidden><b>On iPhone:</b> tap Share in Safari, then <b>Add to Home Screen</b>. Wavelength then opens full screen like any app.</div>
  </div>
  <div class="phone rise" aria-hidden="true"><div class="phone-screen">
    <div class="ph-top"><span>WAVELENGTH</span><i></i></div>
    <div class="ph-hero"><b>Good evening, Sam.</b><small>38 scans in your logbook.</small><div class="ph-stats"><span><b>38</b>Scans</span><span><b>9</b>This month</span><span><b>24</b>Signed</span></div></div>
    <div class="ph-card"><p>FAMUS</p>${[['Thoracic', 31, 40], ['Abdominal-renal', 14, 40], ['DVT', 10, 10]].map(([l, n, t]) => { const fr = n / t; const c = fr >= 1 ? '#2E7D5B' : fr >= 1 / 3 ? '#B7791F' : '#B4453A'; return `<div class="ph-bar"><span>${l}<b>${n} / ${t}</b></span><i><em style="width:${Math.min(100, fr * 100)}%;background:${c}"></em></i></div>`; }).join('')}</div>
    <div class="ph-card"><p>RCEM</p>${[['eFAST', 19, 25], ['AAA', 6, 25]].map(([l, n, t]) => { const fr = n / t; const c = fr >= 1 ? '#2E7D5B' : fr >= 1 / 3 ? '#B7791F' : '#B4453A'; return `<div class="ph-bar"><span>${l}<b>${n} / ${t}</b></span><i><em style="width:${fr * 100}%;background:${c}"></em></i></div>`; }).join('')}</div>
    <div class="ph-tabs"><i></i><i></i><em>+</em><i></i><i></i></div>
  </div></div>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Built by ultrasound supervisors</p><h2 class="reveal" data-d="1">Everything your logbook should have been.</h2></div>
  <div class="pillars app-pillars">
    ${f('Targets', 'Every pathway, one scan', 'Choose RCEM, FAMUS, FUSIC or your own targets. A lung scan counts towards FAMUS thoracic and FUSIC lung at once, with pathology quotas, supervised counts and training windows tracked for you.')}
    ${f('Colour', 'See what is left', 'Red, amber, green. Each module shows exactly how many scans, supervised scans, reflections and pathologies you still need.')}
    ${f('Privacy', 'Photos stay on your phone', 'Take a photo of the screen, crop it, black out identifiers, and save. Hidden photo data is stripped. Images never reach our servers.')}
    ${f('Sign-off', 'Signed in seconds', 'Hand your phone to your supervisor to sign with a finger, or send a secure link. Each sign-off gets a code anyone can verify.')}
    ${f('Export', 'Portfolio-ready', 'PDF with a summary of training, scan log, reflections and sign-off register, each sign-off with its own QR code. Excel and CSV too.')}
    ${f('Backup', 'Your cloud, your copy', 'One tap saves your photos to iCloud Drive, Google Drive or OneDrive. Restore on a new phone in seconds.')}
    ${f('Guard', 'Identifier check', 'The app warns you before saving text that looks like an NHS number, a hospital number, a date of birth or a name.')}
    ${f('Learn', 'Linked to learning', 'Every scan type links to free Pearls and certified Academy modules. Your CPD certificates sit in the same app.')}
    ${f('Offline', 'Works without signal', 'Log in the basement resus room. Entries sync when you reconnect.')}
  </div>
</div></section>
<section class="section on-dark" style="background:var(--navy)"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal" style="color:var(--teal-l)">From scan to portfolio</p><h2 class="reveal" data-d="1" style="color:var(--cream)">Evidence your assessors can check.</h2><p class="reveal" data-d="2" style="color:#B9C4D0;max-width:640px">Paper logbooks and spreadsheets ask your ARCP panel or accrediting body to take the numbers on trust. Every Wavelength export carries a verification code instead.</p></div>
  <ol class="ev-steps"><li class="reveal" data-d="0"><span class="ev-n">01</span><h3>Log and get signed off</h3><p>Record each scan in seconds. Your supervisor signs on your phone or from a secure link, and each sign-off gets its own code.</p></li><li class="reveal" data-d="1"><span class="ev-n">02</span><h3>Choose where it goes</h3><p>RCEM e-portfolio (risr/advance, formerly Kaizen), JRCPTB ePortfolio for acute medicine, FAMUS, FUSIC, or appraisal and revalidation. The PDF and the steps match the destination.</p></li><li class="reveal" data-d="2"><span class="ev-n">03</span><h3>Verified summary</h3><p>Wavelength builds your progress against each pathway from your synced logbook and stamps it with a code and QR code. Counts and dates only, never findings or images.</p></li><li class="reveal" data-d="3"><span class="ev-n">04</span><h3>Scan to check</h3><p>Your supervisor, ARCP panel or the FAMUS administrator scans the QR code and sees the same figures and sign-offs online. If the file was edited, it shows.</p></li></ol>
  <p class="reveal" style="color:#B9C4D0;font-size:14px;margin-top:28px;max-width:760px">Wavelength is independent of RCEM, JRCPTB, the Society for Acute Medicine and the Intensive Care Society, and is not yet connected directly to their portfolio systems. You attach the PDF and paste the verification link. A free account is needed to use the app and its exports.</p>
</div></section>
<section class="section sand"><div class="wrap split">
  <div><p class="eyebrow reveal">Good to know</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,64px);margin-top:20px">Questions.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">Read the <a class="text-link" href="/app-terms/">logbook terms of use</a> and <a class="text-link" href="/privacy/">privacy notice</a>.</p></div>
  ${faqHtml(appFaqs)}
</div></section>
${ctaBand('Tune in. <em>Log it.</em>', 'Free for every clinician who scans. Open it on your phone and add it to your home screen.')}`,
  });
  html = html.replace('<link rel="manifest" href="/site.webmanifest">', '<link rel="manifest" href="/app/manifest.webmanifest">')
    .replace('</body>', `<script>(function(){var e=null,b=document.querySelector('[data-app-install]'),ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if('serviceWorker' in navigator)navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'}).catch(function(){});addEventListener('beforeinstallprompt',function(x){x.preventDefault();e=x;});if(b)b.addEventListener('click',function(){if(e){e.prompt();e.userChoice.then(function(c){if(c.outcome==='accepted')location.href='/app/';});}else if(ios){document.querySelector('[data-app-ios]').hidden=false;}else{location.href='/app/';}});})();</script>\n</body>`);
  pages['/app/get/'] = html;
}

// Legal pages
const legal = {
  '/privacy/': {
    title: 'Privacy notice',
    body: `<p>This notice explains how ${site.company}, trading as Wavelength ("we"), collects and uses your personal data. We are the data controller for the data described here${site.registeredOffice ? `. Our registered office is ${site.registeredOffice}` : ''}${site.icoNumber ? ` and are registered with the Information Commissioner's Office under number ${site.icoNumber}` : ''}.</p>
<h2>What we collect</h2><ul><li>Your name, email address, phone number, job title, grade and workplace when you book or contact us, and your GMC, NMC or HCPC number if you choose to give it.</li><li>Your first name, email address and role when you subscribe to our newsletter.</li><li>Payment details, which Stripe processes on our behalf. We never see or store your full card number.</li><li>Dietary or access requirements you choose to tell us, so we can run the day safely.</li><li>Your name, contact details, role, organisation and availability when you volunteer as a scanning model.</li><li>Your title, name, email address, role and workplace when you register for Wavelength Academy, with your assessment answers, scores, certificates and any feedback you give.</li><li>If you use the Wavelength app: your account details, a securely hashed password, the pathways and targets you choose, the written entries in your scan logbook, and supervisor sign-offs (the supervisor's name, role, any registration number, email and signature they give).</li></ul>
<h2>Why we use it</h2><ul><li>To manage your booking, send joining instructions and issue your certificate (contract).</li><li>To keep financial records as the law requires (legal obligation).</li><li>To send you our newsletter, where you have subscribed (consent).</li><li>To arrange volunteer scanning sessions, where you have signed up as a volunteer.</li><li>To run Wavelength Academy: mark your assessments, and issue, email and verify your certificates (contract, providing the learning you signed up for).</li><li>To tell delegates who have booked with us about similar future courses, unless they opted out when booking or later (our legitimate interests, under the soft opt-in rule in the Privacy and Electronic Communications Regulations).</li></ul>
<h2>Our newsletter</h2><p>When you subscribe, we send you an email asking you to confirm. We add you to the list only after you click the confirmation link. Each newsletter carries an unsubscribe link, and you can also unsubscribe by emailing <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>. We use your role to send you content relevant to your practice. Our newsletter service records whether you open an email and which links you click, so we can see which content helps clinicians most. We never sell or share your details for others' marketing.</p>
<h2>Volunteer scanning models</h2><p>We use volunteers' details to arrange scanning sessions on our courses (our legitimate interests in running the course, and your agreement to take part). We do not ask for health information. Scans on our courses are for teaching, not diagnosis. If faculty notice something unexpected, they tell you privately and advise you to see your GP, and we do not record it. We keep volunteer details for up to two years after your last session, or until you ask us to delete them.</p>
<h2>Department training enquiries</h2><p>If you ask about training for your department, we store your name, work contact details, role, organisation and the details of your enquiry. We use them only to answer your enquiry and plan any training you book (legitimate interests). We keep enquiries for two years, then delete them, unless they lead to a booking, when we keep them with our booking records.</p><h2>Faculty applications</h2><p>If you apply to teach with us, we store your name, contact details, professional registration number if you give it, and the ultrasound experience and credentials you describe. We use them only to consider your application and contact you about faculty work (legitimate interests). We keep applications for two years, then delete them, unless you join the faculty or ask us to delete them sooner.</p>
<h2>Wavelength Academy</h2><p>Registration for Academy modules is free. Joining our newsletter is optional: tick the box if you want it, and leave at any time without losing access to your certificates. We email your certificate through Zoho ZeptoMail when you pass. Each certificate carries a code. Anyone who has the code, such as an employer or appraiser you share it with, can see the name, module, CPD hours and date on our verification page. Your score stays private to you. We keep Academy records for six years after your last activity, so certificates stay verifiable, unless you ask us to delete them sooner.</p>
<h2>Wavelength app and logbook</h2><p>We store your account and the written entries in your logbook so they sync between your devices and your supervisor can sign them off (contract, providing the service you signed up for). <b>Scan photos never reach us.</b> They stay on your device and in backup files you save to your own storage, such as iCloud Drive, Google Drive or OneDrive, which you control. The logbook must not contain patient-identifiable information. You are responsible for what you enter and photograph, as set out in the <a class="text-link" href="/app-terms/">logbook terms of use</a>. When a supervisor signs off scans, we keep their details with the sign-off so anyone with the sign-off code can confirm it: the code shows the learner's name, supervisor's name and role, the date and the scan types and dates, never findings or images. We keep logbook data while your account is open. You can export it at any time and delete your account from the app, which deletes your logbook and sign-offs.</p>
<h2>Who we share it with</h2><p>Stripe for payments, Zoho for our email, newsletter and mailing list, and Cloudflare for our website. Each acts under contract as our processor and protects your data. We do not sell your data.</p>
<h2>Cookies</h2><p>This website uses no analytics, tracking or advertising cookies. The private volunteer area sets one login cookie, which it needs to work, and removes it when you log out or after 12 hours. Wavelength Academy and the Wavelength app share one login cookie to keep you signed in, for up to 180 days or until you log out. The app stores your logbook, photos and settings in your browser's storage on your device so it works offline. Academy lesson pages remember which lessons you have opened in your browser's storage, on your device only. Cloudflare, which protects this website, sets a short-lived security cookie on some visits to tell people from automated traffic. All of these are strictly necessary to run the service you ask for, so UK and EU law does not require a cookie consent banner. If we ever add analytics or marketing cookies, we will ask for your consent first. Stripe sets its own cookies on its payment pages, under Stripe's privacy policy.</p>
<h2>How long we keep it</h2><p>Booking and attendance records for six years, to meet accounting rules and to confirm attendance for appraisal or revalidation. Newsletter details until you unsubscribe. After you unsubscribe, we keep your email address on a suppression list so we do not email you again.</p>
<h2>Your rights</h2><p>You have the right to access, correct or delete your data, to object to or restrict its use, to withdraw consent at any time, and to data portability. Email <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>. If you are unhappy with our response, you can complain to the Information Commissioner's Office at ico.org.uk.</p>`,
  },
  '/app-terms/': {
    title: 'Logbook terms of use',
    body: `<p>These terms apply to the Wavelength app and its ultrasound logbook, provided free by ${site.company}, trading as Wavelength. By creating an account you accept them.</p>
<h2>What the logbook is</h2><p>A personal record of your ultrasound practice, with progress shown against targets drawn from published curricula (RCEM, FAMUS and FUSIC). Targets come from each body's published documents on the date shown in the app. Curricula change, so confirm requirements with your supervisor and the accrediting body. Wavelength is independent and is not run or endorsed by RCEM, the Society for Acute Medicine, the Intensive Care Society or any other body. Logging a scan, meeting a target in the app or receiving a sign-off does not by itself confer competence or accreditation.</p>
<h2>No patient-identifiable information</h2><p>You must never enter or photograph patient-identifiable information, including names, dates of birth, NHS or hospital numbers, addresses, postcodes, or any detail that identifies a person alone or with other information. Before you save a photo, crop or cover every identifier. The app removes hidden photo data (such as location) when it saves an image and warns you if text looks like an identifier, but these checks do not replace your own.</p>
<h2>Your responsibility</h2><p>You are responsible for everything you store, photograph, export or share from your logbook, and for following the policies of your employer on clinical photography, personal devices, removable media and information governance. Some employers require patient consent for clinical photographs or do not allow photographs of screens. Where that applies, log the scan without a photo. If you find identifiable information in your logbook, delete it at once. Wavelength accepts no liability for identifiable information that you enter, photograph, store, export or share, to the extent the law allows.</p>
<h2>Where your data lives</h2><p>Your written entries sync to your Wavelength account. Photos stay on your device and in backup files you choose to make. We never receive your photos, so we cannot recover them if you lose your device without a backup. Back up regularly.</p>
<h2>Sign-off</h2><p>Supervisors sign off in person on your device or through a link you send. You must send links only to the supervisor concerned. Each sign-off has a code that anyone can use on our verification page to confirm who signed, when, and the scan types and dates covered. Editing a signed entry voids its sign-off.</p>
<h2>Acceptable use</h2><p>Do not misuse the service, record scans you did not perform, or forge or misrepresent a sign-off. We may suspend accounts that do.</p>
<h2>Availability and changes</h2><p>We aim to keep the app available but do not guarantee it. We may change features or these terms and will tell you of significant changes in the app. Keep your own exports.</p>
<h2>Ending your account</h2><p>Delete your account in the app at any time. This deletes your logbook entries and sign-offs from our servers. Export first if you want a copy.</p>
<h2>Contact</h2><p><a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a></p>`,
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
if (fs.existsSync(path.join(LEARN_DIR, 'images'))) copyDir(path.join(LEARN_DIR, 'images'), path.join(DIST, 'learn/images'));
// Wavelength app: config from data/logbook.json, upcoming courses, newsletter form, and cache-busting version.
{
  const appCourses = courses.filter((c) => c.status !== 'hidden').flatMap((c) => upcoming(c).map((d) => ({ slug: c.slug, title: c.title, date: d.date, venue: d.venue, city: d.city }))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const { _help, _help_destinations, ...lb } = logbook;
  const nl = site.newsletter && site.newsletter.action ? { action: site.newsletter.action, hidden: site.newsletter.hidden, emailField: site.newsletter.emailField, firstNameField: site.newsletter.firstNameField, roleField: site.newsletter.roleField } : null;
  fs.writeFileSync(path.join(DIST, 'app/config.js'), `window.WL_LOGBOOK = ${JSON.stringify({ ...lb, courses: appCourses, newsletter: nl })};\n`);
  const appDir = path.join(DIST, 'app');
  const files = ['index.html', 'sw.js', 'sign/index.html', 'verify/index.html'];
  for (const f of files) { const p = path.join(appDir, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/__V__/g, BUILD)); }
}

fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /email/\nDisallow: /subscribe/thanks/\nDisallow: /app/sign/\nAllow: /app/get/\n\nSitemap: ${url('/sitemap.xml')}\n`);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(pages)
    .filter((p) => !p.includes('/thanks/') && p !== '/booked/' && !p.startsWith('/volunteer/') && !/^\/elearning\/[^/]+\/(learn|assessment)\//.test(p) && !['/elearning/certificate/', '/elearning/account/'].includes(p) && !(p === '/elearning/' && !liveModules.length) && !modules.some((m) => m.draft === true && p.startsWith(`/elearning/${m.slug}/`)) && !(p === '/learn/' && !posts.some((x) => x.draft !== true)) && !(posts.find((x) => (p === `/learn/${x.slug}/` || p === `/learn/${x.slug}/test/`) && x.draft === true)) && !(p === '/learn/test/' && !posts.some((x) => x.draft !== true && x.questions.length)))
    .map((p) => `  <url><loc>${url(p)}</loc><priority>${p === '/' ? '1.0' : p.startsWith('/courses/') ? '0.9' : ['/privacy/', '/terms/', '/cancellation/'].includes(p) ? '0.3' : '0.7'}</priority></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(DIST, 'site.webmanifest'), JSON.stringify({ name: site.name, short_name: site.name, start_url: '/', icons: [{ src: '/assets/logo-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/logo-512.png', sizes: '512x512', type: 'image/png' }], theme_color: '#0A1526', background_color: '#0A1526', display: 'standalone' }));
fs.writeFileSync(
  path.join(DIST, '_headers'),
  `/assets/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=86400\n/app/sw.js\n  Cache-Control: no-cache\n/app/\n  Cache-Control: no-cache\n/app/vendor/*\n  Cache-Control: public, max-age=2592000\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n`
);
console.log(`Built ${Object.keys(pages).length} pages to dist/`);
