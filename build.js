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
    // slug: the search-friendly URL (front matter). fileSlug: the original URL from the file name,
    // which redirects to the new one (see _redirects at the end of the build).
    const fileSlug = f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}(-\d{2})?-/, '');
    const slug = meta.slug || fileSlug;
    return { ...meta, slug, fileSlug, html, questions, date: String(meta.date || '') };
  })
  .filter((p) => SHOW_DRAFTS || (p.draft !== true && p.date <= new Date().toISOString().slice(0, 10)))
  .sort((a, b) => b.date.localeCompare(a.date));
// Guides: long-form reference pages in content/guides/*.md (front matter: title, slug, seoTitle, summary, date,
// reviewed (checked against official sources), updated (last edit, if later), author, order, pathway (rcem, famus, fusic or all), draft). Built at /guides/<slug>/. Drafts build unlisted and noindex, reachable by link for review,
// like Academy drafts; they join the menu, the /guides/ list and the sitemap once draft is false.
const GUIDES_DIR = path.join(ROOT, 'content/guides');
const guides = (fs.existsSync(GUIDES_DIR) ? fs.readdirSync(GUIDES_DIR) : [])
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const { meta, html } = md.parse(fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8'));
    const toc = [...html.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map((m) => ({ id: m[1], label: m[2].replace(/<[^>]+>/g, '') }));
    return { ...meta, file: f, slug: meta.slug || f.replace(/\.md$/, ''), html, toc, date: String(meta.date || ''), order: Number(meta.order || 99) };
  })
  .filter((g) => g.date <= new Date().toISOString().slice(0, 10))
  .sort((a, b) => a.order - b.order);
const liveGuides = guides.filter((g) => g.draft !== true);
// Source monitoring (October 2026): every authoritative source a guide cites in its '## Sources' section, plus the
// sources in data/monitor-sources.json (directories, other accreditation bodies, pathway documents), written to
// worker/monitor/sources.json for the Worker's daily checks. Each guide also gets a content version (a hash of its
// Markdown), so the server can tell an app whose bundled copy is older than the website's.
{
  const crypto = require('crypto');
  const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/monitor-sources.json'), 'utf8'));
  const idFor = (u) => 'g:' + crypto.createHash('sha256').update(u).digest('hex').slice(0, 12);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const BODY = { 'rcem.ac.uk': 'RCEM', 'rcemcurriculum.co.uk': 'RCEM', 'acutemedicine.org.uk': 'SAM', 'ics.ac.uk': 'ICS', 'eusem.org': 'EUSEM', 'policy.acem.org.au': 'ACEM', 'cpocus.ca': 'CPoCUS', 'acep.org': 'ACEP', 'rcr.ac.uk': 'RCR', 'esicm.org': 'ESICM', 'escardio.org': 'ESC', 'bsecho.org': 'BSE' };
  const byUrl = new Map();
  for (const s of REG.sources) byUrl.set(s.url, { guides: [], pathways: [], ...s });
  const meta = [];
  for (const g of guides) {
    const raw = fs.readFileSync(path.join(GUIDES_DIR, g.file), 'utf8');
    const i = g.html.search(/<h2 id="sources">/), j = i < 0 ? -1 : g.html.indexOf('<h2', i + 4);
    const block = i < 0 ? '' : g.html.slice(i, j < 0 ? undefined : j);
    const urls = [...new Set([...block.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
    const ids = [];
    for (const u of urls) {
      if (!byUrl.has(u)) {
        // The link's own text names the document; a second link in the same list item is named after the first
        // ("FUSIC Heart: training pack (2025, v13)").
        const esc2 = u.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const li = (block.match(new RegExp(`<li>(?:(?!</li>).)*?href="${esc2}"(?:(?!</li>).)*</li>`)) || [''])[0];
        const texts = [...li.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
        const own = (li.match(new RegExp(`href="${esc2}"[^>]*>([^<]+)</a>`)) || [])[1];
        const label = own ? (texts[0] && texts[0] !== own.replace(/&amp;/g, '&') ? `${texts[0]}: ${own.replace(/&amp;/g, '&')}` : own.replace(/&amp;/g, '&')) : null;
        byUrl.set(u, { id: idFor(u), kind: 'guidance', body: BODY[host(u)] || host(u), name: label ? label.replace(/&amp;/g, '&') : `${BODY[host(u)] || host(u)}: ${new URL(u).pathname.split('/').filter(Boolean).pop() || 'home'}`, url: u, guides: [], pathways: [] });
      }
      const s = byUrl.get(u);
      if (!s.guides.includes(g.slug)) s.guides.push(g.slug);
      if (g.pathway && g.pathway !== 'all' && !s.pathways.includes(g.pathway)) s.pathways.push(g.pathway);
      ids.push(s.id);
    }
    meta.push({ slug: g.slug, title: g.title, href: `/guides/${g.slug}/`, draft: g.draft === true, reviewed: g.reviewed ? String(g.reviewed) : null, updated: [g.reviewed, g.updated, g.date].filter(Boolean).map(String).sort().pop() || null, contentVersion: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16), sources: ids });
  }
  const sources = [...byUrl.values()].map((s) => {
    const rule = (REG.rules || []).find((r) => s.url.includes(r.match));
    return { id: s.id, kind: s.kind || 'guidance', body: s.body || BODY[host(s.url)] || host(s.url), name: s.name, url: s.url, mode: s.mode || (rule && rule.mode) || 'auto', adapter: s.adapter || 'page', guides: s.guides, pathways: s.pathways || [], why: s.why || (rule && rule.why) || null };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const out = { guides: meta, sources };
  out.version = crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16);
  fs.mkdirSync(path.join(ROOT, 'worker/monitor'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'worker/monitor/sources.json'), JSON.stringify(out, null, 1) + '\n');
}
// One-page summaries of the pathway guides: content/guides/at-a-glance/<guide slug>.md, built at /guides/<slug>/at-a-glance/.
// Each prints to one A4 page with a QR code back to the full guide. node tools/glance-pdf.mjs writes the matching PDFs to
// src/assets/guides/ and records a hash of each source, so a PDF is only offered while it matches the current text.
const GLANCE_DIR = path.join(GUIDES_DIR, 'at-a-glance');
const glances = (fs.existsSync(GLANCE_DIR) ? fs.readdirSync(GLANCE_DIR) : [])
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const src = fs.readFileSync(path.join(GLANCE_DIR, f), 'utf8');
    const { meta, html } = md.parse(src);
    return { ...meta, html, guide: meta.guide || f.replace(/\.md$/, ''), hash: require('crypto').createHash('sha256').update(src).digest('hex').slice(0, 16) };
  })
  .filter((x) => guides.some((g) => g.slug === x.guide));
const glanceFor = (g) => glances.find((x) => x.guide === g.slug);
const GLANCE_PDFS = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/guides/at-a-glance.json'), 'utf8')); } catch { return {}; } })();
const glancePdf = (x) => (GLANCE_PDFS[x.guide] === x.hash && fs.existsSync(path.join(ROOT, `src/assets/guides/${x.guide}-at-a-glance.pdf`)) ? `/assets/guides/${x.guide}-at-a-glance.pdf` : null);
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
// Topic landing pages (/learn/<page>/) for topics with a `page` and at least three live pearls.
const topicHref = (t) => (t.page && posts.filter((p) => p.draft !== true && topicOf(p.category) === t).length >= 3 ? `/learn/${t.page}/` : null);
// Link-preview image per pearl (python3 tools/pearl-social.py writes content/learn/images/social/<slug>.jpg).
const socialFor = (p) => (fs.existsSync(path.join(LEARN_DIR, 'images/social', p.slug + '.jpg')) ? `/learn/images/social/${p.slug}.jpg` : null);
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
    { href: '/training/', label: 'Tailored Training', short: 'Tailored', text: 'Training designed around individuals, groups and organisations, in the UK and beyond.' },
  ] },
  ...(posts.length || liveModules.length || liveGuides.length ? [{ href: '/learn/', label: 'Learn', match: ['/learn/', '/elearning/', '/guides/'], children: [
    ...(posts.length ? [{ href: '/learn/', label: 'Wavelength Pearls', short: 'Pearls', text: 'Free five-minute pearls, each with a short test.' }] : []),
    ...(liveModules.length ? [{ href: '/elearning/', label: 'Wavelength Academy', short: 'Academy', text: 'Free modules with a Wavelength certificate and CPD hours.' }] : []),
    ...(liveGuides.length ? [{ href: '/guides/', label: 'Guides', short: 'Guides', text: 'Sign-off, accreditation and logbook guides for RCEM, FAMUS and FUSIC.' }] : []),
    ...(liveGuides.some((g) => g.slug === 'pocus-accreditation') ? [{ href: '/guides/pocus-accreditation/', label: 'Accreditation pathways', short: 'Accreditation', text: 'Which POCUS pathway fits you: UK and international pathways compared.' }] : []),
  ] }] : []),
  { href: '/pocus-logbook/', label: 'App', match: ['/app/', '/pocus-logbook/'], children: [
    { href: '/pocus-logbook/', label: 'POCUS logbook and portfolio', short: 'Logbook', text: 'Your portfolio, tailored to your accrediting body.' },
    { href: '/app/get/', label: 'Download the app', short: 'Download', text: 'Free for iPhone, Android and the browser.' },
    { href: '/pocus-logbook/help/', label: 'Logbook help', short: 'Help', text: 'How to use the app, one task at a time.' },
  ] },
  { href: '/faculty/', label: 'Faculty' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
];

// seoTitle: the search-result title (brand added). title alone keeps the old "Title | Wavelength" pattern.
// The brand is added only while the whole title stays within TITLE_MAX characters: Google cuts longer titles off and
// already shows the site name (WebSite schema) above each result, so a long title keeps its keywords instead.
const TITLE_MAX = 60;
const brandTitle = (t) => (`${t} | ${site.name}`.length <= TITLE_MAX ? `${t} | ${site.name}` : t);
function layout({ title, seoTitle, description, pathname, body, jsonld = [], ogType = 'website', noindex = false, ogImage = '/assets/og.png' }) {
  const canonical = url(pathname);
  const base = seoTitle || title;
  const fullTitle = base ? brandTitle(base) : `${site.name} | Point-of-care ultrasound education`;
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
    ? `<div class="nav-drop"><a href="${n.href}" class="nav-drop-link"${isCurrent(n) ? ' aria-current="page"' : ''} aria-haspopup="true" aria-expanded="false">${n.label}<svg class="nav-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a><div class="nav-panel">${n.children.map((c) => `<a href="${c.href}"${c === n.children.filter((x) => pathname.startsWith(x.href)).sort((a, b) => b.href.length - a.href.length)[0] ? ' aria-current="page"' : ''}><b>${c.label}</b><span>${c.text}</span></a>`).join('')}</div></div>`
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
    <nav class="nav" aria-label="Main">${navLinks}<a class="nav-verify" href="/verify/"${pathname === '/verify/' ? ' aria-current="page"' : ''} title="Verify a certificate or sign-off"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>Verify</a><a class="btn" href="/courses/core-emergency-ultrasound/#dates">${BOOK_LABEL}</a></nav>
    <div class="bar-end"><a class="btn bar-book" href="/courses/core-emergency-ultrasound/#dates">${BOOK_LABEL}</a><button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mobile-menu"><span></span></button></div>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" aria-hidden="true">
  <a href="/">Home</a>${mobileLinks}
  <a href="/verify/">Verify a certificate</a>
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
      <div><h2>Wavelength</h2><ul><li><a href="/about/">About</a></li><li><a href="/faculty/">Faculty</a></li><li><a href="/training/">Tailored training</a></li><li><a href="/faculty/join/">Teach with us</a></li>${posts.length ? '<li><a href="/learn/">Pearls</a></li>' : ''}${liveModules.length ? '<li><a href="/elearning/">Academy</a></li>' : ''}${liveGuides.length ? '<li><a href="/guides/">Guides</a></li>' : ''}<li><a href="/pocus-logbook/">POCUS logbook</a></li>${liveGuides.some((g) => g.slug === 'pocus-accreditation') ? '<li><a href="/guides/pocus-accreditation/">Accreditation pathways</a></li>' : ''}<li><a href="/app/get/">Wavelength app</a></li><li><a href="/verify/">Verify a certificate or sign-off</a></li><li><a href="/subscribe/">Newsletter</a></li><li><a href="/contact/">Contact</a></li></ul></div>
      <div><h2>Contact</h2><ul><li><a href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a></li><li><a href="mailto:${site.bookingsEmail}">${site.bookingsEmail}</a></li></ul>${socialIcons()}</div>
    </div>
    <div class="bottom">
      <span>© <span data-year>${new Date().getFullYear()}</span> ${site.company}${site.companyNumber ? `, registered in England and Wales no. ${site.companyNumber}` : ''}. All rights reserved. Wavelength is a trading name of ${site.company}.${site.registeredOffice ? ` Registered office: ${esc(site.registeredOffice)}.` : ''} Wavelength is an independent education provider. It is not run or endorsed by the NHS, Dartford and Gravesham NHS Trust, RCEM, FAMUS or EUSEM.${site.icoNumber ? ` ICO registration ${esc(site.icoNumber)}.` : ''}</span>
      <span><a href="/privacy/">Privacy</a> · <a href="/website-terms/">Website terms</a> · <a href="/terms/">Booking terms</a> · <a href="/cancellation/">Cancellations</a></span>
    </div>
  </div>
</footer>
<script src="/assets/main.js?v=${BUILD}" defer></script>
</body>
</html>`;
}

// The approved app films (October 2026), self-hosted under /media/ (worker/media.js serves byte ranges): a native player
// with controls, playsinline, preload="metadata", a poster from the film itself, and English captions on by default
// (selectable, from the film's own WebVTT file). Never autoplays. If the film cannot load, a download link shows.
// Under each player, the film as text (from the same captions), folded away until asked for.
const FILMS = {
  app: { base: 'wavelength-app-film-v4', label: 'Wavelength logbook film: how the app works (1 minute 50 seconds)', size: '15 MB' },
  teaser: { base: 'wavelength-free-logbook-film-v4', label: 'Wavelength free logbook film (30 seconds)', size: '4 MB' },
};
// One paragraph per pause of more than a second and a half in the captions.
function filmTranscript(base) {
  const vtt = fs.readFileSync(path.join(ROOT, 'src/media', base + '.en.vtt'), 'utf8').replace(/\r/g, '');
  const secs = (s) => s.split(':').reduce((a, n) => a * 60 + Number(n), 0);
  const paras = []; let last = -1;
  for (const block of vtt.split(/\n\n+/)) {
    const lines = block.trim().split('\n'); const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->').map((s) => secs(s.trim().split(' ')[0]));
    const text = lines.slice(i + 1).join(' ').trim(); if (!text) continue;
    if (last < 0 || a - last > 1.5) paras.push([]);
    paras[paras.length - 1].push(text); last = b;
  }
  return paras.map((p) => `<p>${esc(p.join(' '))}</p>`).join('');
}
function film(kind, id, caption) {
  const f = FILMS[kind];
  return `<figure class="film reveal"><video id="${id}" controls playsinline preload="metadata" width="1920" height="1080" poster="/media/${f.base}-poster.jpg" aria-label="${esc(f.label)}"><source src="/media/${f.base}.mp4" type="video/mp4"><track kind="captions" srclang="en" label="English" src="/media/${f.base}.en.vtt" default><a href="/media/${f.base}.mp4">Download the film (MP4, ${f.size})</a></video><figcaption>${esc(caption)} <span class="film-fallback" role="status">The film could not load here. <a href="/media/${f.base}.mp4" download>Download it (MP4, ${f.size})</a>.</span></figcaption><details class="film-transcript"><summary>Read the film as text</summary>${filmTranscript(f.base)}</details></figure>`;
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

// QR code as inline SVG (qrcode-generator, MIT, already shipped with the app for PDF exports).
const qrcodeGen = require('./src/app/vendor/qrcode.js');
function qrSvg(text, { size = 112, label = '' } = {}) {
  const q = qrcodeGen(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg class="qr" width="${size}" height="${size}" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" role="img" aria-label="${esc(label)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0F1E33"/></svg>`;
}

// Accreditation pathways, as the app defines them in data/logbook.json. UK pathways have a full guide.
const PATHWAYS = (logbook.pathways || []).filter((p) => p.id !== 'general');
const GUIDE_FOR = { rcem: 'rcem-ultrasound-sign-off', famus: 'famus-accreditation', fusic: 'fusic-accreditation' };
const guideHref = (id) => (GUIDE_FOR[id] && liveGuides.some((g) => g.slug === GUIDE_FOR[id]) ? `/guides/${GUIDE_FOR[id]}/` : null);
const andList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs.join(''));
const PATHWAY_LIST = andList(PATHWAYS.map((p) => p.label.replace(/ advanced$/, '')).filter((x, i, a) => a.indexOf(x) === i));
// UK pathways (checked against each body's documents) and the editable international frameworks, named apart in public copy.
const UK_PATHWAY_LIST = andList(PATHWAYS.filter((p) => p.region === 'UK').map((p) => p.label));
const INTL_PATHWAY_LIST = andList(PATHWAYS.filter((p) => p.region && p.region !== 'UK').map((p) => p.label.replace(/ advanced$/, '')).filter((x, i, a) => a.indexOf(x) === i));
const pathwaysChecked = PATHWAYS.map((p) => p.checked).filter(Boolean).sort().pop();
const hasAccreditationHub = () => liveGuides.some((g) => g.slug === 'pocus-accreditation');

// Each pearl's logbook scan type, so the pearl can say which pathway modules that scan counts towards in the app.
// By category, with exceptions by slug. null: no matching pathway module, so the pearl shows a general logbook note.
const PEARL_LOG_CATEGORY = { Lung: ['lung'], Cardiac: ['cardiac', 'shock'], eFAST: ['efast'], Aorta: ['aaa'], Renal: ['abdo'], Eye: ['ocular'], MSK: ['msk'], 'Soft tissue': ['msk'], 'Nerve blocks': ['block'] };
const PEARL_LOG_SLUG = {
  'gallbladder-ultrasound': ['biliary'], 'common-bile-duct-ultrasound': ['biliary'], 'gallbladder-wall-thickening-ultrasound': ['biliary'],
  'appendicitis-ultrasound': ['bowel'], 'small-bowel-obstruction-ultrasound': ['bowel'], 'intussusception-ultrasound': ['bowel'],
  'ectopic-pregnancy-ultrasound': ['preg'], 'dvt-ultrasound': ['dvt'], 'bakers-cyst-ultrasound': ['dvt'],
  'fascia-iliaca-block-infra-inguinal': ['fib'], 'fascia-iliaca-block-supra-inguinal': ['fib'], 'portal-vein-pulsatility': null, 'pseudoaneurysm-ultrasound': null,
  'ultrasound-guided-iv-centre-the-vein': ['pva'], 'ultrasound-guided-iv-probe-pressure': ['pva'], 'difficult-iv-access-vein-distension': ['pva'],
  'ultrasound-guided-iv-posterior-wall-puncture': ['pva'], 'ultrasound-guided-iv-threading-failure': ['pva'], 'ultrasound-iv-flush-test': ['pva'],
  'vein-or-artery-ultrasound-compression': ['pva'], 'ultrasound-guided-iv-choose-the-vein': ['pva'],
  'central-line-ultrasound-guidewire-check': ['cvc'], 'ultrasound-guided-radial-arterial-line': ['procedure'],
  'pneumoperitoneum-ultrasound': ['abdo'], 'colour-doppler-aliasing': null, 'mirror-image-artefact-ultrasound': null, 'cricothyroid-membrane-ultrasound': null,
};
function logStrip(p) {
  const types = p.slug in PEARL_LOG_SLUG ? PEARL_LOG_SLUG[p.slug] : PEARL_LOG_CATEGORY[p.category] || null;
  const hub = hasAccreditationHub() ? ' · <a class="text-link" href="/guides/pocus-accreditation/">Compare accreditation pathways</a>' : '';
  if (!types) return `<aside class="log-strip reveal"><p class="eyebrow">Logging your scans?</p><p>Record every scan as you learn. The free <a class="text-link" href="/pocus-logbook/">Wavelength POCUS logbook</a> tracks your scans, sign-offs and assessments against ${esc(UK_PATHWAY_LIST)} targets, editable international frameworks (${esc(INTL_PATHWAY_LIST)}), or targets you set yourself.</p></aside>`;
  const uk = [], intl = [];
  for (const pw of PATHWAYS) for (const m of pw.modules || []) {
    if (!(m.types || []).some((t) => types.includes(t))) continue;
    if (GUIDE_FOR[pw.id]) { const l = `${pw.label} ${m.label}`; if (!uk.includes(l)) uk.push(l); } else { const l = pw.label.replace(/ advanced$/, ''); if (!intl.includes(l)) intl.push(l); }
  }
  const labels = types.map((t) => (logbook.types.find((x) => x.id === t) || {}).label).filter(Boolean);
  const counts = [uk.length ? `the ${andList(uk.map(esc))} ${uk.length > 1 ? 'trackers' : 'tracker'}` : '', intl.length ? `${uk.length ? 'and ' : ''}the editable ${andList(intl.map(esc))} ${intl.length > 1 ? 'frameworks' : 'framework'}` : ''].filter(Boolean).join(', ');
  const guidesLinks = PATHWAYS.filter((pw) => guideHref(pw.id) && uk.some((l) => l.startsWith(pw.label + ' '))).map((pw) => `<a class="text-link" href="${guideHref(pw.id)}">${esc(pw.label)} ${pw.id === 'rcem' ? 'sign-off' : 'accreditation'} guide</a>`);
  return `<aside class="log-strip reveal"><p class="eyebrow">Logging this scan?</p><p>In the free <a class="text-link" href="/pocus-logbook/">Wavelength POCUS logbook</a>, a scan logged as ${labels.map((l) => `<b>${esc(l)}</b>`).join(' or ')} can count towards ${counts}, when it meets their criteria. Acceptance remains with each organisation and your supervisor.</p>${guidesLinks.length || hub ? `<p class="log-strip-links">${guidesLinks.join(' · ')}${guidesLinks.length ? hub : hub.replace(/^ · /, '')}</p>` : ''}</aside>`;
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
    // Google Events asks for performer: the Course Director leads every date; list extra faculty per date in courses.json `faculty` (names)
    performer: [
      { '@type': 'Person', name: site.director.name, jobTitle: site.director.title, url: url('/faculty/') },
      ...(d.faculty || []).map((n) => ({ '@type': 'Person', name: n })),
    ],
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
    ...(c.prerequisites ? { coursePrerequisites: c.prerequisites } : {}),
    isAccessibleForFree: false,
  };
  const director = { '@type': 'Person', name: site.director.name, jobTitle: site.director.title, url: url('/faculty/') };
  ld.hasCourseInstance = [{ '@type': 'CourseInstance', courseMode: 'Onsite', courseWorkload: 'PT8H', location: { '@type': 'Place', name: site.region, address: { '@type': 'PostalAddress', addressRegion: site.region, addressCountry: 'GB' } } }];
  if (list.length) {
    ld.hasCourseInstance = list.map((d) => ({
      courseWorkload: 'PT8H',
      '@type': 'CourseInstance',
      courseMode: 'Onsite',
      instructor: [director, ...(d.faculty || []).map((n) => ({ '@type': 'Person', name: n }))],
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

function subscribeBand(title = 'Ultrasound skills, <em>in your inbox.</em>', text = 'One email a week: a practical scanning skill, new Learn posts and course dates before they go public.') {
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
    foot: (t) => { const mods = liveModules.filter((m) => topicOf(m.category) === t); const h = topicHref(t); return (mods.length ? `<div class="topic-modules">${mods.map(moduleStrip).join('')}</div>` : '') + (h ? `<p class="topic-related reveal"><a class="text-link" href="${h}">${esc(t.heading || t.label)}: all ${esc(t.label.toLowerCase())} pearls on one page</a></p>` : ''); },
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
  seoTitle: 'Emergency ultrasound and POCUS training, UK',
  pathname: '/',
  description: 'Hands-on emergency ultrasound and POCUS courses for UK clinicians, mapped to the RCEM curriculum. Free ultrasound Pearls, CPD e-learning and a logbook app.',
  jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: url('/'), inLanguage: 'en-GB' }, faqLd(generalFaqs)],
  body: `
<section class="hero on-dark">${mesh}
  <canvas class="waves" aria-hidden="true"></canvas>
  <div class="wrap hero-inner">
    <div class="rise">${mark({ size: 96, cls: 'hero-mark', draw: true, ring: '#F7F5F0' })}</div>
    <p class="eyebrow rise">Point-of-care ultrasound education</p>
    <h1 class="split-words">Tune in. <em>Gain clarity.</em></h1>
    <p class="lede rise">Hands-on courses, tailored training, a free ultrasound logbook, five-minute Pearls and certified e-learning for emergency and acute clinicians. Mapped to the RCEM curriculum and led by an emergency medicine consultant who has scanned since 2008 and taught ultrasound since 2010.</p>
    <div class="hero-ctas rise">
      <a class="btn btn-teal cta-caps" href="/courses/" data-m="home-hero-courses">Explore our courses ${arrow}</a>
      <a class="btn btn-ghost light cta-caps" href="/app/get/" data-m="home-hero-logbook">Start your free logbook</a>
    </div>
    ${nextDate ? `<p class="rise" style="margin-top:14px;color:#B9C4D0;font-size:15px">Next core course: <a class="text-link" style="color:var(--teal-l)" href="/courses/core-emergency-ultrasound/#dates">${fmtDate(nextDate.d.date, { day: 'numeric', month: 'long', year: 'numeric' })}</a></p>` : ''}
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

<section class="section on-dark" style="background:var(--navy)" id="free-logbook">
  <div class="wrap split">
    <div><p class="eyebrow reveal" style="color:var(--teal-l)">The Wavelength logbook</p><h2 class="statement reveal" data-d="1" style="margin-top:22px;color:var(--cream)">Your ultrasound logbook. <span style="color:var(--teal-l)">Free to use. Designed for real clinical practice.</span></h2>
      ${film('teaser', 'home-film', 'The free logbook in 30 seconds. Captions on; sound when you press play.')}</div>
    <div class="reveal" data-d="2">
      <p class="lede" style="color:#D5DDE6">Scan when you work. Log when it suits you. Connect with your supervisors and see who is verified. Track your progress.</p>
      <ul class="checklist" style="margin-top:20px;color:#D5DDE6">${['Log scans from a photo or an upload, online or offline', 'Send scans to your supervisor to review when they are free, or sign off in person', 'Track RCEM, FAMUS and FUSIC targets, or editable international frameworks', 'Export a QR-verified portfolio for your e-portfolio or appraisal'].map((x) => `<li>${tick}<span>${esc(x)}</span></li>`).join('')}</ul>
      <div class="hero-ctas" style="margin-top:26px"><a class="btn btn-teal cta-caps" href="/app/get/" data-m="home-logbook-start">Start your free logbook ${arrow}</a><a class="btn btn-ghost light" href="/pocus-logbook/#watch" data-m="home-logbook-how">See how the app works</a></div>
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
    ${hasAccreditationHub() ? `<a class="bank-link reveal" href="/guides/pocus-accreditation/" style="background:var(--teal-ink)"><span><span class="eyebrow" style="color:var(--cream)">Free accreditation guides</span><strong>RCEM sign-off, FAMUS and FUSIC step by step, with international pathways compared.</strong></span>${arrow}</a>` : ''}
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

<section class="section sand" id="tailored">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Tailored training</p><h2 class="display reveal" data-d="1" style="font-size:clamp(36px,4.6vw,58px);margin-top:20px">Looking for ultrasound training suited to your needs?</h2></div>
    <div class="reveal" data-d="2">
      <p class="lede">Explore tailored teaching for individuals, groups and organisations, with flexible location options by arrangement.</p>
      <div class="hero-ctas" style="margin-top:24px"><a class="btn btn-teal cta-caps" href="/courses/" data-m="home-tailored-courses">Explore our courses ${arrow}</a><a class="btn btn-ghost cta-caps" href="/training/" data-m="home-tailored-enquire">Enquire about tailored training</a></div>
    </div>
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
{
  const venues = [...new Set(openCourses.flatMap((c) => upcoming(c).map((d) => [d.venue, d.city].filter(Boolean).join(', '))))];
  const coursesFaqs = [
    { q: 'What is a POCUS course?', a: 'A point-of-care ultrasound (POCUS) course teaches clinicians to perform and interpret focused bedside scans that answer a clinical question, such as free fluid in trauma or an aortic aneurysm. Wavelength courses are hands-on: most of the day is spent scanning healthy models, simulators and vascular phantoms under supervision.' },
    { q: 'Are Wavelength courses accredited?', a: 'The Core Emergency Ultrasound course is mapped to the RCEM curriculum. It is not RCEM, FAMUS or FUSIC accredited. It is taught by FAMUS-accredited instructors and RCEM-approved ultrasound supervisors, and you receive a certificate of attendance for your portfolio and appraisal.' },
    { q: 'Do I need a course for RCEM sign-off?', a: 'No. Since the 2021 curriculum RCEM no longer requires a course. A course is one source of learning evidence alongside e-learning, departmental teaching, your logbook, reflections and workplace-based assessments.' },
    { q: `Where are the courses held?`, a: `${venues.length ? `The next open course is at ${venues[0]}. ` : ''}Individuals, groups and organisations can also ask for tailored training, with locations agreed individually.` },
  ];
  pages['/courses/'] = layout({
    title: 'Point-of-care ultrasound courses',
    seoTitle: 'POCUS courses UK: hands-on emergency ultrasound',
    pathname: '/courses/',
    description: 'Hands-on POCUS courses for emergency and acute clinicians in the UK, mapped to the RCEM curriculum, with one instructor to every four or five delegates.',
    jsonld: [
      breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Courses', href: '/courses/' }]),
      { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: openCourses.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/courses/${c.slug}/`) })) },
      faqLd(coursesFaqs),
    ],
    body: `${pageHero({ eyebrow: 'Courses', title: 'Ultrasound courses', lede: 'Start with the core course. Specialist courses follow, each built on the same small-group, hands-on approach.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Courses' }] })}
<section class="section sand"><div class="wrap" style="display:grid;gap:32px">${openCourses.map((c) => courseCard(c, 'h2')).join('')}
  <div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">Tailored ultrasound training</h2><p>Teaching designed around your objectives, for individuals, groups and organisations, with flexible locations by arrangement. UK and international enquiries welcome.</p></div><a class="btn btn-teal cta-caps" href="/training/" data-m="courses-tailored">Enquire about tailored training ${arrow}</a></div>
  <div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">Specialist courses</h2><p>Further courses are in development. Tell us what you want to learn and we will let you know first.</p></div><a class="btn" href="${mailto(site.enquiriesEmail, 'Specialist courses: keep me informed')}">Keep me informed ${arrow}</a></div>
</div></section>
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">Hands-on POCUS training</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">Emergency ultrasound, <span>taught on the probe.</span></h2></div>
  <div class="reveal" data-d="2">
    <p class="lede">Wavelength runs point-of-care ultrasound courses for clinicians who scan in emergency and acute care: emergency medicine trainees and consultants, acute and internal medicine doctors, advanced clinical practitioners, physician associates and GPs in urgent care.</p>
    <p class="lede" style="margin-top:18px">Each module follows the same pattern: a short talk, a live demonstration, then supervised scanning on healthy models, simulators and vascular phantoms, with one instructor to every four or five delegates. Every course is led by our Course Director, an emergency medicine consultant, with FAMUS-accredited instructors and RCEM-approved ultrasound supervisors on the faculty.</p>
    ${venues.length ? `<p class="lede" style="margin-top:18px">Open courses run in person in the UK. The next is at ${esc(venues[0])}.</p>` : ''}
  </div>
</div></section>
<section class="section sand"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Courses and accreditation</p><h2 class="reveal" data-d="1">Where a course fits.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:680px">No course signs you off on its own. Each pathway treats a course differently, so check yours before you book anything.</p></div>
  <div class="pillars">
    <div class="pillar reveal"><div class="num">RCEM</div><h3>Optional since 2021</h3><p>A course is one source of learning evidence for emergency medicine sign-off. The Wavelength core course is mapped to the RCEM curriculum.${guideHref('rcem') ? ` <a class="text-link" href="${guideHref('rcem')}">RCEM sign-off guide</a>` : ''}</p></div>
    <div class="pillar reveal" data-d="1"><div class="num">FAMUS</div><h3>Approved course recommended</h3><p>The Society for Acute Medicine strongly recommends a FAMUS-approved course, though it is not mandatory.${guideHref('famus') ? ` <a class="text-link" href="${guideHref('famus')}">FAMUS accreditation guide</a>` : ''}</p></div>
    <div class="pillar reveal" data-d="2"><div class="num">FUSIC</div><h3>Online training or approved course</h3><p>The Intensive Care Society asks for one or the other. FEEL and BSE Level 1 courses count for FUSIC Heart.${guideHref('fusic') ? ` <a class="text-link" href="${guideHref('fusic')}">FUSIC accreditation guide</a>` : ''}</p></div>
  </div>
  <a class="bank-link reveal" href="/pocus-logbook/" style="margin-top:32px;background:var(--navy)"><span><span class="eyebrow" style="color:var(--teal-l)">After the course</span><strong>Log your supervised scans in the free Wavelength POCUS logbook, tailored to your accrediting body.</strong></span>${arrow}</a>
</div></section>
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">Questions</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Before you choose.</h2>${hasAccreditationHub() ? `<p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">Not sure which pathway you are on? <a class="text-link" href="/guides/pocus-accreditation/">Compare POCUS accreditation pathways</a>.</p>` : ''}</div>
  ${faqHtml(coursesFaqs)}
</div></section>
${ctaBand()}`,
  });
}

// Course pages
for (const c of openCourses) {
  const p = `/courses/${c.slug}/`;
  const list = upcoming(c);
  const facts = [
    ['Level', c.level],
    ['Duration', `${c.duration}, ${c.hours}`],
    ...((c.accreditation || []).length ? [['Accredited by', c.accreditation.join(', ').replace(/, ([^,]*)$/, ' and $1')]] : []),
    ['Fee', money(c.price) || 'Published with dates'],
    ['Next date', list.length ? fmtDate(list[0].date, { day: 'numeric', month: 'long', year: 'numeric' }) + (list[0].city ? `, ${list[0].city}` : '') : 'Opening soon'],
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
${(() => { const prep = (c.pearls || []).map((sl) => posts.find((x) => x.slug === sl && x.draft !== true)).filter(Boolean).slice(0, 6); return prep.length ? `<section class="section sand">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">Prepare for free</p><h2 class="reveal" data-d="1">Read a pearl before the day.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:640px">Free Wavelength Pearls on the applications this course teaches, each with a short test.</p></div>
    <div class="post-grid">${prep.map((x) => postCard(x, 'h3', { topicView: true })).join('')}</div>
    <p class="reveal" style="margin-top:32px"><a class="text-link" href="/learn/">All ${posts.length} pearls</a></p>
  </div>
</section>` : ''; })()}
${c.curriculum && c.curriculum.length ? `<section class="section sand">
  <div class="wrap split">
    <div><p class="eyebrow reveal">Curriculum</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Mapped to RCEM.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">The course covers the core emergency applications in the RCEM curriculum: eFAST, AAA, echo in life support and vascular access. The table shows the training phase in which RCEM introduces each application and the indicative number of supervised logbook scans before sign-off.</p><p class="reveal" data-d="2" style="margin-top:20px;padding:18px 22px;border-left:3px solid var(--teal);background:var(--sand)"><strong>A guide, not a target.</strong> RCEM sign-off rests on an entrustment decision by your supervisor, using your logbook, reflections and observed scans. Reaching a number does not by itself mean sign-off.</p></div>
    <div class="table-wrap reveal" data-d="1"><table class="table"><thead><tr><th scope="col">Application</th><th scope="col">Introduced in</th><th scope="col">Indicative scans (guide only)</th></tr></thead><tbody>${c.curriculum.map((r) => `<tr><td><b>${esc(r.application)}</b></td><td>${esc(r.stage)}</td><td>${esc(r.scans)}</td></tr>`).join('')}</tbody></table>
    <p class="source">Source: <a class="text-link" href="https://rcemcurriculum.co.uk/wp-content/uploads/2021/06/Appendix-3-PoCUS-for-2021-RCEM-curriculum.pdf" rel="noopener">RCEM curriculum, point-of-care ultrasound appendix</a>. Scan numbers are indicative, not fixed targets. Sign-off also requires e-learning or course attendance, reflections and an entrustment decision in your department.</p></div>
  </div>
</section>` : ''}
<section class="section">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow reveal">After the day</p><h2 class="reveal" data-d="1">From course to sign-off.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:680px">The course gives you the knowledge and the first supervised hours. Sign-off comes from supervised scans, reflections and assessment in your own department. These free resources take you the rest of the way.</p></div>
    <div class="post-grid">
      ${guideHref('rcem') ? `<a class="post-card reveal" href="${guideHref('rcem')}"><p class="eyebrow">Guide · RCEM</p><h3>The RCEM ultrasound sign-off pathway</h3><p>Modalities, indicative numbers, DOPS and the entrustment decision, with a ten-step action plan.</p><span class="meta">Free guide${glances.some((x) => x.guide === GUIDE_FOR.rcem) ? ` · <span class="text-link">One-page summary inside</span>` : ''}</span></a>` : ''}
      <a class="post-card reveal" data-d="1" href="/pocus-logbook/"><p class="eyebrow">Wavelength POCUS logbook</p><h3>Your portfolio, tailored to your accrediting body</h3><p>Log your supervised scans, get signed off on your phone, record DOPS and export a QR-verified summary for your e-portfolio.</p><span class="meta">Free app</span></a>
      ${hasAccreditationHub() ? `<a class="post-card reveal" data-d="2" href="/guides/pocus-accreditation/"><p class="eyebrow">Guide · Accreditation</p><h3>POCUS accreditation, pathway by pathway</h3><p>Working in acute medicine or intensive care? Compare RCEM with FAMUS, FUSIC and international pathways.</p><span class="meta">Free guide</span></a>` : ''}
    </div>
  </div>
</section>
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
${subscribeBand('No dates that suit? <em>Hear first.</em>', 'Subscribe and we email you new dates before they go public, with a practical scanning skill each week.')}
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
    { '@context': 'https://schema.org', '@type': 'Person', '@id': url('/faculty/#director'), name: site.director.name, jobTitle: site.director.title, url: url('/faculty/'), worksFor: { '@id': url('/#org') }, description: site.director.bio[0], ...(site.director.photo ? { image: url(site.director.photo) } : {}), knowsAbout: ['Point-of-care ultrasound', 'Emergency ultrasound', 'Emergency medicine', 'Ultrasound-guided regional anaesthesia', 'Medical education'], ...(site.director.email ? { email: site.director.email } : {}) },
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
    <label class="ac-hp" aria-hidden="true">Leave blank<input name="wl_trap" tabindex="-1" autocomplete="off"></label>
    <label class="consent"><input type="checkbox" name="confirm_privacy" value="yes" required><span>Wavelength stores my details to consider my application and contact me about faculty work, as set out in the <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
    <div><button class="btn btn-teal" type="submit">Send my application ${arrow}</button></div>
    <p class="form-note">Prefer email? Write to <a class="text-link" href="${mailto(site.enquiriesEmail, 'Faculty enquiry')}">${site.enquiriesEmail}</a>.</p>
  </form>
</div></section>`,
});
const TRAINING_FAQS = [
  { q: 'Do you offer ultrasound training outside the UK?', a: 'Wavelength is based in the UK, and we welcome international training enquiries. Overseas programmes are considered individually, depending on the training requirements, location, equipment, faculty availability and practical arrangements. Please contact us with your requirements to discuss the available options.' },
  { q: 'Can I enquire as an individual?', a: 'Yes. Individuals, small groups, clinical teams and organisations are all welcome to enquire. Tell us what you want to learn and we will suggest the most suitable option, which may be one of our open courses or a tailored session where that can be arranged.' },
  { q: 'How is a tailored programme priced?', a: 'Each enquiry is assessed on its merits. Where we can help, we send a bespoke proposal and a quotation based on the format, the number of participants, the faculty needed, equipment, venue and any travel. There is no obligation.' },
  { q: 'How many participants can you teach?', a: 'It depends on the format. Our hands-on teaching keeps to one instructor for every four or five participants, so larger groups need more faculty. Tell us your numbers and we will plan around them.' },
  { q: 'Where does the training take place?', a: 'At a location agreed with you: your hospital, clinic or education centre, or a venue we arrange. Locations and arrangements are agreed individually, taking into account travel logistics and availability. We need a room for teaching and space for scanning stations.' },
  { q: 'Do we need to provide ultrasound machines?', a: 'We agree machines and scanning models with you when we plan the training. Teaching on the machines your team uses every shift helps learning transfer to practice, and we can discuss alternatives where that is not possible.' },
  { q: 'Which ultrasound modules can you cover?', a: 'Tell us the applications you are interested in. We confirm what we can offer, and who will teach it, in the proposal. Our open core course is mapped to the RCEM curriculum; nerve blocks are planned as a separate course.' },
  { q: 'Is the training accredited?', a: 'The core course is mapped to the RCEM curriculum. It is taught by FAMUS-accredited instructors and RCEM-approved ultrasound supervisors. It is not RCEM, FAMUS or FUSIC accredited. Each participant receives a certificate of attendance for their portfolio and appraisal.' },
  { q: 'How far ahead should we enquire?', a: 'Three months ahead gives time to plan rotas, study leave and travel. Ask anyway if you need sooner, as we can sometimes fit a shorter lead time.' },
];
// Tailored Ultrasound Training (/training/, the URL is kept): individuals, groups and organisations, in the UK and
// internationally. Enquiries go to worker/departments.js; options live in worker/department-form.json.
{
  const opts = (xs) => xs.map((x) => `<option>${esc(x)}</option>`).join('');
  pages['/training/'] = layout({
    title: 'Tailored Ultrasound Training',
    seoTitle: 'Tailored ultrasound training, UK and international',
    pathname: '/training/',
    description: 'Tailored, expert-led ultrasound training for individuals, groups and organisations: focused practical sessions to bespoke programmes, with UK and international enquiries welcome.',
    jsonld: [
      breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Tailored Ultrasound Training', href: '/training/' }]),
      { '@context': 'https://schema.org', '@type': 'Service', name: 'Tailored ultrasound training', serviceType: 'Point-of-care ultrasound training', url: url('/training/'), provider: { '@id': url('/#org') }, audience: { '@type': 'Audience', audienceType: 'Individual healthcare professionals, groups, clinical teams, hospitals, private clinics, healthcare organisations and training institutions' }, areaServed: { '@type': 'Country', name: 'United Kingdom' }, description: 'Expert-led ultrasound training designed around the learner’s objectives. Locations and arrangements are agreed individually; international enquiries are welcome and assessed individually.' },
      faqLd(TRAINING_FAQS),
    ],
    body: `${pageHero({ eyebrow: 'Tailored Ultrasound Training', title: 'Ultrasound Training Tailored to Your Needs', lede: 'From focused practical sessions to bespoke ultrasound training programmes, Wavelength offers expert-led teaching designed around your learning objectives. Whether you are enquiring as an individual, a small group or an organisation, we welcome the opportunity to discuss your requirements.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Tailored Ultrasound Training' }], extra: `<div class="hero-ctas rise"><a class="btn btn-teal cta-caps" href="#enquire" data-m="training-hero-enquire">Enquire about tailored training ${arrow}</a><a class="btn btn-ghost light cta-caps" href="/courses/" data-m="training-hero-courses">Explore our courses</a></div>` })}
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">Who we teach</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">Training for individuals, <span>groups and organisations.</span></h2></div>
  <div class="reveal" data-d="2">
    <p class="lede">We welcome enquiries from anyone who wants to build practical point-of-care ultrasound skills with experienced clinical teachers.</p>
    <ul class="tt-audience">${['Individual healthcare professionals', 'Doctors', 'Ultrasound practitioners', 'Small groups', 'Clinical teams', 'Hospitals', 'Private clinics', 'Healthcare organisations', 'Training institutions', 'Other professional groups'].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </div>
</div></section>
<section class="section sand" id="options"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Ways we can help</p><h2 class="reveal" data-d="1">Built around your objectives.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:680px">What we can offer depends on your objectives, numbers and location. We confirm the format, faculty and modules in a proposal before anything is booked.</p></div>
  <div class="pillars">
    <div class="pillar reveal"><div class="num">01</div><h3>Focused practical sessions</h3><p>Hands-on teaching on the scans you need most, such as lung, focused cardiac or proximal DVT, for an individual, a small group or a team.</p></div>
    <div class="pillar reveal" data-d="1"><div class="num">02</div><h3>A course for your group</h3><p>Our full-day core emergency ultrasound course, mapped to the RCEM curriculum, run for your group only, on dates agreed with you.</p></div>
    <div class="pillar reveal" data-d="2"><div class="num">03</div><h3>Bespoke programmes</h3><p>A programme over several sessions, for a new service, a regional training group or an organisation building ultrasound capability.</p></div>
  </div>
</div></section>
<section class="section" id="international"><div class="wrap split">
  <div><p class="eyebrow reveal">UK and international</p><h2 class="display reveal" data-d="1" style="font-size:clamp(36px,4.8vw,58px);margin-top:20px">UK and International Training Enquiries</h2></div>
  <div class="tt-intl reveal" data-d="2">
    <p class="lede">Wavelength is a UK-based ultrasound education provider offering tailored training for individuals, groups and organisations.</p>
    <p class="lede">We welcome enquiries from across the UK and internationally.</p>
    <p class="lede">Training programmes, locations and arrangements are agreed individually, taking into account your learning objectives, group size, equipment requirements, travel logistics and availability.</p>
    <p class="lede">Each enquiry is assessed on its merits, with a bespoke proposal and quotation provided where appropriate.</p>
  </div>
</div></section>
<section class="section sand"><div class="wrap split">
  <div><p class="eyebrow reveal">Every programme</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,56px);margin-top:20px">The same standard as our open courses.</h2></div>
  <ul class="checklist reveal" data-d="1">${[
    'Teaching by FAMUS-accredited instructors and RCEM-approved ultrasound supervisors',
    'One instructor to every four or five participants, with most of the time on the probe',
    'Content matched to your objectives; our core course is mapped to the RCEM curriculum',
    'Free Wavelength Academy modules before and after, with a certificate for each module passed',
    'The free Wavelength logbook for logging supervised scans and getting them signed off',
    'A certificate of attendance for every participant, and a written proposal and quotation before you commit',
  ].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">How it works</p><h2 class="reveal" data-d="1">From enquiry to teaching.</h2></div>
  <ol class="ac-steps">${[
    ['Tell us what you need', 'Who the training is for, what you want to learn, how many people, where and when. The form below takes a few minutes.'],
    ['Receive a proposal', 'We reply within five working days. Where we can help, we send a proposal with the format, faculty and a quotation.'],
    ['Agree the arrangements', 'We agree the location, ultrasound machines, scanning models and any travel with you, then send joining instructions.'],
    ['Teach and follow up', 'We run the training, issue certificates and suggest Academy modules and logbook targets to keep skills growing.'],
  ].map(([h, t], i) => `<li class="reveal" data-d="${i}"><span class="ac-step-n">${i + 1}</span><h3>${h}</h3><p>${t}</p></li>`).join('')}</ol>
</div></section>
<section class="section sand" id="enquire"><div class="wrap split">
  <div>
    <p class="eyebrow reveal">Enquire about tailored training</p>
    <h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,56px);margin:20px 0 24px">Tell us what you need.</h2>
    <p class="lede reveal" data-d="2">There is no obligation. We read every enquiry and reply within five working days.</p>
    <aside class="callout reveal" style="margin-top:36px"><p class="callout-title">Questions first?</p><p>Email <a class="text-link" href="${mailto(site.enquiriesEmail, 'Tailored ultrasound training')}">${site.enquiriesEmail}</a> and we reply within two working days.</p></aside>
  </div>
  <form class="form" method="post" action="/api/training/enquire" data-m-form="training">
    <p class="form-error" data-show-on="error" hidden>Please complete the required fields, check your phone number and tick the privacy box.</p>
    <div class="sub-row"><label>First name<input name="first_name" autocomplete="given-name" required maxlength="80"></label><label>Last name<input name="last_name" autocomplete="family-name" required maxlength="80"></label></div>
    <div class="sub-row"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="160"></label><label>Phone (optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40" inputmode="tel"><span class="hint">Include the country code if you are outside the UK</span></label></div>
    <div class="sub-row"><label>I am enquiring for<select name="enquiry_type" required><option value="">Choose one</option>${opts(DEPT_FORM.types.map((t) => t.label))}</select></label><label>Your professional role<select name="role"><option value="">Choose one</option>${opts(DEPT_FORM.rolesShown)}</select></label></div>
    <div class="sub-row"><label>Organisation (if applicable)<input name="organisation" autocomplete="organization" maxlength="200"></label><label>Clinical setting (optional)<select name="setting"><option value="">Choose one</option>${opts(DEPT_FORM.settings)}</select></label></div>
    <div class="sub-row"><label>Country<select name="country" required autocomplete="country-name">${DEPT_FORM.countries.map((c, i) => `<option${i === 0 ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label>Preferred training location (optional)<input name="location" maxlength="200" placeholder="For example, your hospital, a city, or flexible"></label></div>
    <fieldset class="vol-dates"><legend>What are you looking for?</legend>${boxes('training', DEPT_FORM.trainingShown)}</fieldset>
    <fieldset class="vol-dates"><legend>Ultrasound modules you are interested in (optional)</legend>${boxes('topics', DEPT_FORM.topicsShown)}<p class="form-note" style="margin:8px 0 0">We confirm which modules we can offer, and who will teach them, in our proposal.</p></fieldset>
    <div class="sub-row"><label>Approximate number of participants<select name="group_size" required><option value="">Choose one</option>${opts(DEPT_FORM.sizesShown)}</select></label><label>Preferred dates (optional)<input name="timing" maxlength="200" placeholder="For example, March 2027, weekdays"></label></div>
    <div class="sub-row"><label>Budget range (optional)<select name="budget"><option value="">Prefer not to say</option>${opts(DEPT_FORM.budgets)}</select></label><label>How did you hear about us? (optional)<select name="heard"><option value="">Choose one</option>${opts(DEPT_FORM.heard)}</select></label></div>
    <label>Additional requirements (optional)<textarea name="details" maxlength="3000" rows="5" placeholder="Your learning objectives, experience, the machines you have, a service you are setting up, or anything else we should know."></textarea></label>
    <input type="hidden" name="campaign" value="">
    <label class="ac-hp" aria-hidden="true">Leave blank<input name="wl_trap" tabindex="-1" autocomplete="off"></label>
    <label class="consent"><input type="checkbox" name="confirm_privacy" value="yes" required><span>Wavelength stores my details to answer this enquiry, as set out in the <a class="text-link" href="/privacy/">privacy notice</a>.</span></label>
    <div><button class="btn btn-teal cta-caps" type="submit">Send my enquiry ${arrow}</button></div>
  </form>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Questions</p><h2 class="reveal" data-d="1">Before you ask.</h2></div>
  ${faqHtml(TRAINING_FAQS)}
</div></section>`,
  });
}
pages['/training/thanks/'] = layout({
  title: 'Enquiry received',
  pathname: '/training/thanks/',
  noindex: true,
  body: `${pageHero({ eyebrow: 'Tailored Ultrasound Training', title: 'Thank you.', lede: 'We have your enquiry. A member of the team replies within five working days, with a proposal and quotation where we can help.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Tailored Ultrasound Training', href: '/training/' }, { label: 'Thank you' }], extra: '<div class="hero-ctas rise"><a class="btn btn-teal cta-caps" href="/courses/">Explore our courses</a><a class="btn btn-ghost light cta-caps" href="/app/get/">Start your free logbook</a></div>' })}`,
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
  description: 'Contact Wavelength about ultrasound course bookings, tailored training for individuals, groups and organisations, invoices and faculty roles.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Contact', href: '/contact/' }])],
  body: `${pageHero({ eyebrow: 'Contact', title: 'Get in touch.', lede: 'Questions about a course, an invoice for your trust, a group booking or joining the faculty. We reply within two working days.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Contact' }] })}
<section class="section">
  <div class="wrap">
    <div class="contact-grid">
      <a class="contact-card reveal" href="mailto:${site.bookingsEmail}"><p class="eyebrow">Bookings and invoices</p><h2>${site.bookingsEmail}</h2><p>Places, payments, invoices and transfers.</p><span class="text-link">Email bookings</span></a>
      <a class="contact-card reveal" data-d="1" href="mailto:${site.enquiriesEmail}"><p class="eyebrow">General enquiries</p><h2>${site.enquiriesEmail}</h2><p>Course content, group bookings, faculty and partnerships.</p><span class="text-link">Email us</span></a>
    </div>
    <div class="empty-dates reveal" style="margin-top:40px"><div><h3>Tailored ultrasound training</h3><p>For individuals, groups and organisations, in the UK and internationally. Tell us what you need and we send a proposal.</p></div><a class="btn btn-teal cta-caps" href="/training/" data-m="contact-tailored">Enquire about tailored training ${arrow}</a></div>
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
  description: 'Subscribe to the Wavelength newsletter: one practical point-of-care ultrasound skill a week, new Learn posts and early access to course dates.',
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Newsletter', href: '/subscribe/' }])],
  body: `${pageHero({ eyebrow: 'Newsletter', title: 'Ultrasound skills, <em style="font-style:italic;color:var(--teal-light)">weekly.</em>', lede: 'One email a week from the Wavelength faculty. A practical scanning Pearl with a short test, new Academy modules, and course dates before they go public.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Newsletter' }] })}
<section class="section"><div class="wrap split">
  <div>
    <p class="eyebrow reveal">What you receive</p>
    <ul class="checklist reveal" data-d="1" style="margin-top:20px">${['A practical scanning skill each week, written by FAMUS instructors', 'New Learn posts, with images and pitfalls', 'Course dates before they go public', 'No sharing of your details, and one click to unsubscribe'].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
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
  seoTitle: 'Free POCUS tutorials: emergency ultrasound Pearls',
  pathname: '/learn/',
  description: `${posts.length} free point-of-care ultrasound tutorials for emergency and acute clinicians: probe position, views, pitfalls and nerve blocks, each with a short test.`,
  jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }])],
  body: `${pageHero({ eyebrow: 'Wavelength Pearls', title: 'From the scanning room.', lede: 'Free, five-minute point-of-care ultrasound pearls from the Wavelength faculty. One technique, one view or one pitfall at a time, each with a short test.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Learn' }] })}
${learnSwitch('pearls')}${posts.length ? pearlTopics() + `<section class="section"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">Working towards accreditation?</p><h2 class="reveal" data-d="1">From learning to sign-off.</h2></div>${hasAccreditationHub() ? `<a class="bank-link reveal" href="/guides/pocus-accreditation/" style="background:var(--teal-ink)"><span><span class="eyebrow" style="color:var(--cream)">Free guides</span><strong>Which POCUS pathway fits you: RCEM, FAMUS, FUSIC and international pathways compared.</strong></span>${arrow}</a>` : ''}<a class="bank-link reveal" href="/pocus-logbook/" style="background:var(--navy)"><span><span class="eyebrow" style="color:var(--teal-l)">Wavelength POCUS logbook</span><strong>Log the scans you learn here and track them against your pathway. Free.</strong></span>${arrow}</a></div></section>` : `<section class="section sand"><div class="wrap"><div class="empty-dates reveal"><div><h3>First posts arriving soon</h3><p>Subscribe and the first Learn posts reach your inbox the day they go live.</p></div><a class="btn" href="/subscribe/">Subscribe ${arrow}</a></div></div></section>`}
${subscribeBand()}`,
});
// Topic landing pages: one indexable page per clinical area, linking every pearl and Academy module in it.
for (const t of TOPICS) {
  const href = topicHref(t);
  if (!href) continue;
  const items = posts.filter((p) => topicOf(p.category) === t);
  const mods = liveModules.filter((m) => topicOf(m.category) === t);
  const heading = t.heading || t.label;
  pages[href] = layout({
    title: heading,
    seoTitle: t.seoTitle || heading,
    pathname: href,
    description: `${items.length} free ${heading.toLowerCase()} pearls for emergency and acute clinicians. ${t.intro}`,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: heading, description: t.intro, url: url(href), inLanguage: 'en-GB', isPartOf: { '@type': 'WebSite', name: site.name, url: url('/') }, mainEntity: { '@type': 'ItemList', itemListElement: items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/learn/${p.slug}/`), name: p.title })) } },
      breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: heading, href }]),
    ],
    body: `${pageHero({ eyebrow: 'Wavelength Pearls', title: esc(heading) + '.', lede: esc(t.intro), crumbs: [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: heading }] })}
<section class="section"><div class="wrap"><div class="prose reveal">${(t.about || []).map((a) => `<p>${esc(a)}</p>`).join('')}</div></div></section>
<section class="section sand"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">${items.length} pearls</p><h2 class="reveal" data-d="1">One technique at a time.</h2></div><div class="post-grid">${items.map((p) => postCard(p, 'h3', { topicView: true })).join('')}</div>
${mods.length ? `<div class="topic-modules">${mods.map(moduleStrip).join('')}</div>` : ''}
<p class="reveal" style="margin-top:32px"><a class="text-link" href="/learn/">All Wavelength Pearls</a>${items.some((p) => p.questions.length) ? ` · <a class="text-link" href="/learn/test/">Question bank</a>` : ''} · <a class="text-link" href="/pocus-logbook/">Log these scans in the free POCUS logbook</a></p></div></section>
<section class="section"><div class="wrap"><div class="post-cta reveal"><div><h3>Practise it with us</h3><p>One instructor to every four or five delegates, FAMUS-accredited instructors and RCEM-approved ultrasound supervisors, and long, supervised time on the probe.</p></div><a class="btn btn-teal" href="/courses/">See the courses ${arrow}</a></div></div></section>
${subscribeBand('Get the next one <em>by email.</em>')}`,
  });
}
function nextReview(p) { const d = new Date((p.reviewed || p.date) + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + 2); return d.toISOString().slice(0, 10); }
for (const p of posts) {
  const href = `/learn/${p.slug}/`;
  const sameTopic = posts.filter((o) => o.slug !== p.slug && topicOf(o.category) === topicOf(p.category));
  const others = sameTopic.concat(posts.filter((o) => o.slug !== p.slug && !sameTopic.includes(o))).slice(0, 3);
  const topicMods = liveModules.filter((m) => topicOf(m.category) === topicOf(p.category));
  const t = topicOf(p.category);
  const tHref = topicHref(t);
  const trail = [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, ...(tHref ? [{ label: t.heading || t.label, href: tHref }] : [])];
  const social = socialFor(p);
  const graphic = (String(p.html).match(/\/learn\/images\/[a-z0-9-]+\.webp/) || [])[0];
  const isDirector = !p.author || p.author === site.director.name;
  pages[href] = layout({
    title: p.title,
    seoTitle: p.seoTitle || p.title,
    pathname: href,
    description: p.summary,
    ogType: 'article',
    ...(social ? { ogImage: social } : {}),
    noindex: p.draft === true,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Article', headline: p.seoTitle || p.title, alternativeHeadline: p.title, description: p.summary, ...(graphic || social ? { image: [graphic, social].filter(Boolean).map(url) } : {}), datePublished: p.date, dateModified: p.reviewed || p.date, author: { '@type': 'Person', name: p.author || site.director.name, ...(isDirector ? { '@id': url('/faculty/#director'), jobTitle: site.director.title, url: url('/faculty/') } : {}) }, publisher: { '@id': url('/#org') }, mainEntityOfPage: url(href), articleSection: t.heading || t.label, isAccessibleForFree: true, inLanguage: 'en-GB' },
      breadcrumbLd([...trail, { label: p.title, href }]),
    ],
    body: `${pageHero({ eyebrow: (p.category || 'Learn') + (p.draft === true ? ' · Draft, not published' : ''), title: esc(p.title), lede: esc(p.summary || ''), crumbs: [...trail, { label: p.title }], extra: `<p class="byline rise">${isDirector ? `<a href="/faculty/">${esc(p.author || site.director.name)}</a>` : esc(p.author)}${p.date ? ' · ' + fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}${p.date ? ` · Reviewed ${fmtDate(p.reviewed || p.date, { month: 'long', year: 'numeric' })}, next review ${fmtDate(nextReview(p), { month: 'long', year: 'numeric' })}` : ''}</p>` })}
<section class="section"><div class="wrap"><article class="prose post reveal">${p.html}</article>
${p.questions.length ? `<div class="test-cta reveal"><div><p class="eyebrow">Test yourself</p><h3>${p.questions.length} questions on this pearl</h3><p>Answer at your own pace. Each answer comes with a short explanation. About ${Math.max(2, Math.round(p.questions.length * 0.6))} minutes.</p></div><a class="btn btn-teal" href="/learn/${p.slug}/test/">Take the test ${arrow}</a></div>` : ''}
${logStrip(p)}
<div class="post-cta reveal"><div><h3>Practise it with us</h3><p>Four or five delegates per instructor, FAMUS-accredited faculty and long, supervised time on the probe.</p></div><a class="btn btn-teal" href="/courses/core-emergency-ultrasound/">See the core course ${arrow}</a></div>
</div></section>
${others.length || topicMods.length ? `<section class="section sand"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">More on ${esc(topicOf(p.category).label.toLowerCase())}</p></div>${others.length ? `<div class="post-grid">${others.map((o) => postCard(o, 'h3', { topicView: true })).join('')}</div>` : ''}${topicMods.length ? `<div class="topic-modules">${topicMods.map(moduleStrip).join('')}</div>` : ''}<p class="reveal" style="margin-top:32px"><a class="text-link" href="${tHref || `/learn/#topic-${t.slug}`}">All ${esc(t.label.toLowerCase())} pearls</a></p></div></section>` : ''}
${subscribeBand('Get the next one <em>by email.</em>')}`,
  });
}

// Guides: /guides/ index and one page per guide, with a contents list built from the ## headings.
if (guides.length) {
  const gCrumbs = (extra = []) => [{ label: 'Home', href: '/' }, { label: 'Learn', href: '/learn/' }, { label: 'Guides', href: '/guides/' }, ...extra];
  const guideCard = (g, h = 'h2') => `<a class="post-card reveal" href="/guides/${g.slug}/"><p class="eyebrow">${esc(g.eyebrow || 'Guide')}${g.draft === true ? ' · Draft' : ''}</p><${h}>${esc(g.title)}</${h}><p>${esc(g.summary || '')}</p><span class="meta">${readMins(g.html)} min read${g.reviewed ? ` · Checked ${fmtDate(g.reviewed, { month: 'long', year: 'numeric' })}` : ''}</span></a>`;
  const glanceHref = (x) => `/guides/${x.guide}/at-a-glance/`;
  const glanceCard = (x, h = 'h3') => `<a class="post-card reveal" href="${glanceHref(x)}"><p class="eyebrow">One-page summary</p><${h}>${esc(x.title)}</${h}><p>${esc(x.summary || '')}</p><span class="meta">Prints on one A4 page${glancePdf(x) ? ' · PDF' : ''}</span></a>`;
  const listedGlances = glances.filter((x) => (SHOW_DRAFTS ? guides : liveGuides).some((g) => g.slug === x.guide));
  pages['/guides/'] = layout({
    title: 'Ultrasound sign-off and accreditation guides',
    seoTitle: 'POCUS sign-off and accreditation guides',
    pathname: '/guides/',
    description: 'Free POCUS accreditation guides: RCEM sign-off, FAMUS and FUSIC step by step, the UK pathways compared, one-page checklists and logbook advice.',
    noindex: !liveGuides.length,
    jsonld: [breadcrumbLd(gCrumbs()), { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: liveGuides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: url(`/guides/${g.slug}/`), name: g.title })) }],
    body: `${pageHero({ eyebrow: 'Guides', title: 'Get signed off.', lede: 'Step-by-step guides to the UK ultrasound pathways and the logbook behind them, checked against each body\'s current documents.', crumbs: gCrumbs().slice(0, -1).concat([{ label: 'Guides' }]) })}
<section class="section sand"><div class="wrap">${(SHOW_DRAFTS ? guides : liveGuides).length ? `<div class="post-grid">${(SHOW_DRAFTS ? guides : liveGuides).map((g) => guideCard(g)).join('')}</div>` : `<div class="empty-dates reveal"><div><h3>First guides arriving soon</h3><p>Subscribe and they reach your inbox the day they go live.</p></div><a class="btn" href="/subscribe/">Subscribe ${arrow}</a></div>`}</div></section>
${listedGlances.length ? `<section class="section"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">Save to your phone</p><h2 class="reveal" data-d="1">Each pathway on one page.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:640px">The requirements, the people who sign you off and the order to do it in, with a QR code back to the full guide. Each one prints on a single A4 page.</p></div><div class="post-grid">${listedGlances.map((x) => glanceCard(x)).join('')}</div>
<a class="bank-link reveal" href="/pocus-logbook/" style="margin-top:32px;background:var(--navy)"><span><span class="eyebrow" style="color:var(--teal-l)">Wavelength POCUS logbook</span><strong>Your portfolio, tailored to your accrediting body. Free.</strong></span>${arrow}</a></div></section>` : ''}
${subscribeBand('Pathway changes, <em>in your inbox.</em>')}`,
  });
  // Calls to action and related learning for each guide, by its `pathway` front matter (rcem, famus, fusic or all).
  const GUIDE_CTA = {
    rcem: ['Your RCEM evidence, organised', 'Choose RCEM in the free Wavelength logbook and it tracks the six modalities, your reflections and DOPS, then exports a PDF with a QR-verified summary for your e-portfolio.'],
    famus: ['Your FAMUS logbook, organised', 'Choose FAMUS in the free Wavelength logbook and it tracks each module\'s supervised scans, minimum training time and core pathology, then exports a PDF with a QR-verified summary.'],
    fusic: ['Your FUSIC logbook, organised', 'Choose FUSIC in the free Wavelength logbook and it tracks totals, supervised scans, the 12-month window and the 10% cap on healthy volunteers, then exports a PDF with a QR-verified summary.'],
    all: ['Your portfolio, tailored to your accrediting body', 'For supported UK pathways, Wavelength arranges your scans, assessments and sign-offs around published portfolio requirements. International trackers provide editable starting frameworks that you can adapt to your local requirements. Export as PDF, Excel or CSV with a QR-verified summary.'],
  };
  const GUIDE_TOPICS = { rcem: ['heart', 'abdomen', 'lung'], famus: ['lung', 'abdomen', 'heart'], fusic: ['heart', 'lung', 'abdomen'] };
  const topicCard = (t) => { const n = posts.filter((p) => p.draft !== true && topicOf(p.category) === t).length; return `<a class="post-card reveal" href="${topicHref(t)}"><p class="eyebrow">Wavelength Pearls</p><h3>${esc(t.heading || t.label)}</h3><p>${esc(t.intro)}</p><span class="meta">${n} free pearls, each with a short test</span></a>`; };
  const courseLearnCard = (c) => { const next = upcoming(c)[0]; return `<a class="post-card reveal" href="/courses/${c.slug}/"><p class="eyebrow">Hands-on course</p><h3>${esc(c.title)}</h3><p>${esc(c.short)}</p><span class="meta">Mapped to the RCEM curriculum${next ? ` · Next: ${fmtDate(next.date, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</span></a>`; };
  // Three dates that mean three different things (source monitoring, October 2026). The two the build knows are
  // written here; "Source checked" comes only from the server (src/assets/main.js reads /api/app/sources/guide/<slug>),
  // so a page never claims a check that did not happen, and without the server it simply says nothing about checks.
  const guideDates = (g) => {
    const fmt = (d) => fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' });
    const updated = [g.reviewed, g.updated, g.date].filter(Boolean).map(String).sort().pop();
    return `<p class="guide-dates rise">${g.reviewed ? `<span>Last clinically reviewed: ${fmt(g.reviewed)}</span>` : ''}${updated ? `<span>Guidance last updated: ${fmt(updated)}</span>` : ''}<span data-source-checked="${g.slug}" hidden></span></p><div class="source-notice" data-source-notice="${g.slug}" role="status" hidden></div>`;
  };
  for (const g of guides) {
    const href = `/guides/${g.slug}/`;
    const isDirector = !g.author || g.author === site.director.name;
    const others = (g.draft === true ? guides : liveGuides).filter((o) => o !== g);
    // Only a guide with `reviewed` was checked against the official sources; the byline says so only then.
    const checked = g.reviewed;
    const gl = glanceFor(g);
    const cta = GUIDE_CTA[g.pathway] || GUIDE_CTA.all;
    const related = (GUIDE_TOPICS[g.pathway] || []).map((sl) => TOPICS.find((t) => t.slug === sl)).filter((t) => t && topicHref(t));
    const learnCards = [...(g.pathway === 'rcem' ? [courseLearnCard(core)] : []), ...related.map(topicCard)].slice(0, 3);
    pages[href] = layout({
      title: g.title,
      seoTitle: g.seoTitle || g.title,
      pathname: href,
      description: g.summary,
      ogType: 'article',
      noindex: g.draft === true,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'Article', headline: g.seoTitle || g.title, alternativeHeadline: g.title, description: g.summary, datePublished: g.date, dateModified: [checked || g.date, g.updated].filter(Boolean).map(String).sort().pop(), author: { '@type': 'Person', name: g.author || site.director.name, ...(isDirector ? { '@id': url('/faculty/#director'), jobTitle: site.director.title, url: url('/faculty/') } : {}) }, publisher: { '@id': url('/#org') }, mainEntityOfPage: url(href), isAccessibleForFree: true, inLanguage: 'en-GB', ...(gl ? { hasPart: { '@type': 'WebPage', name: gl.title, url: url(glanceHref(gl)) } } : {}) },
        breadcrumbLd([...gCrumbs(), { label: g.title, href }]),
      ],
      body: `${pageHero({ eyebrow: (g.eyebrow || 'Guide') + (g.draft === true ? ' · Draft, not published' : ''), title: esc(g.title), lede: esc(g.summary || ''), crumbs: gCrumbs([{ label: g.short || g.title }]), extra: `<p class="byline rise">${isDirector ? `<a href="/faculty/">${esc(g.author || site.director.name)}</a>` : esc(g.author)} · ${readMins(g.html)} min read</p>${guideDates(g)}${gl ? `<div class="hero-ctas rise" style="margin-top:28px"><a class="btn btn-ghost light" href="${glanceHref(gl)}">One-page summary</a></div>` : ''}` })}
<section class="section"><div class="wrap guide-wrap">${g.toc.length > 2 ? `<nav class="guide-toc reveal" aria-label="Contents"><p class="eyebrow">Contents</p><ol>${g.toc.map((t) => `<li><a href="#${t.id}">${t.label}</a></li>`).join('')}</ol>${gl ? `<p class="guide-toc-extra"><a class="text-link" href="${glanceHref(gl)}">One-page summary</a></p>` : ''}${g.slug !== 'pocus-accreditation' && hasAccreditationHub() ? `<p class="guide-toc-extra"><a class="text-link" href="/guides/pocus-accreditation/">Compare all pathways</a></p>` : ''}</nav>` : ''}<article class="prose post guide reveal">${g.html}</article></div>
<div class="wrap"><div class="post-cta reveal"><div><h3>${esc(cta[0])}</h3><p>${esc(cta[1])}</p></div><a class="btn btn-teal" href="/pocus-logbook/${g.pathway && g.pathway !== 'all' ? `#pathway-${g.pathway}` : ''}">See the POCUS logbook ${arrow}</a></div></div>
</section>
${learnCards.length ? `<section class="section"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">Learn the scans</p><h2 class="reveal" data-d="1">Free learning for this pathway.</h2></div><div class="post-grid">${learnCards.join('')}</div></div></section>` : ''}
${others.length ? `<section class="section sand"><div class="wrap"><div class="section-head"><p class="eyebrow reveal">More guides</p></div><div class="post-grid">${others.map((o) => guideCard(o, 'h3')).join('')}</div></div></section>` : ''}
${subscribeBand('Pathway changes, <em>in your inbox.</em>')}`,
    });
    if (!gl) continue;
    // One-page summary of the guide.
    const gHref = glanceHref(gl);
    const pdf = glancePdf(gl);
    const glChecked = gl.reviewed || checked || g.date;
    pages[gHref] = layout({
      title: gl.title,
      seoTitle: gl.seoTitle || gl.title,
      pathname: gHref,
      description: gl.summary,
      ogType: 'article',
      // The full guide is the page for search; this one is the printable and phone companion, so it stays out of the index.
      noindex: true,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'Article', headline: gl.seoTitle || gl.title, alternativeHeadline: gl.title, description: gl.summary, datePublished: glChecked, dateModified: glChecked, author: { '@type': 'Person', name: g.author || site.director.name, ...(isDirector ? { '@id': url('/faculty/#director'), jobTitle: site.director.title, url: url('/faculty/') } : {}) }, publisher: { '@id': url('/#org') }, mainEntityOfPage: url(gHref), isPartOf: { '@type': 'Article', headline: g.title, url: url(href) }, ...(pdf ? { associatedMedia: { '@type': 'MediaObject', contentUrl: url(pdf), encodingFormat: 'application/pdf' } } : {}), isAccessibleForFree: true, inLanguage: 'en-GB' },
        breadcrumbLd([...gCrumbs(), { label: g.short || g.title, href }, { label: 'At a glance', href: gHref }]),
      ],
      body: `${pageHero({ eyebrow: 'One-page summary' + (g.draft === true ? ' · Draft, not published' : ''), title: esc(gl.title), lede: esc(gl.summary || ''), crumbs: gCrumbs([{ label: g.short || g.title, href }, { label: 'At a glance' }]), extra: `<div class="hero-ctas rise">${pdf ? `<a class="btn btn-teal" href="${pdf}" download>Download the PDF ${arrow}</a>` : ''}<button class="btn ${pdf ? 'btn-ghost light' : 'btn-teal'}" type="button" data-print hidden>Print or save as PDF</button><a class="btn btn-ghost light" href="${href}">Read the full guide</a></div>` })}
<section class="section glance-section"><div class="wrap">
<p class="glance-lead reveal">This is the one-page checklist to save or print. For what each step means, the evidence that counts and the official sources, <a class="text-link" href="${href}">read the full ${esc(g.short || g.title)} guide</a>.</p>
<article class="glance" aria-labelledby="glance-title">
  <header class="glance-head"><span class="glance-brand">${mark({ size: 34 })}<b>WAVELENGTH</b></span><div><p class="eyebrow">At a glance · Checked ${fmtDate(glChecked, { day: 'numeric', month: 'long', year: 'numeric' })}</p><h2 id="glance-title">${esc(gl.pathway || g.short || g.title)}</h2></div></header>
  <div class="glance-body prose">${gl.html}</div>
  <footer class="glance-foot">
    <a class="glance-qr" href="${href}" aria-label="Full guide">${qrSvg(url(href), { label: `QR code linking to the full guide at ${url(href)}` })}</a>
    <div>
      <p><b>Full guide:</b> <a class="text-link" href="${href}">${esc(url(href).replace(/^https?:\/\//, ''))}</a></p>
      ${gl.sourceUrl ? `<p><b>Official source:</b> <a class="text-link" href="${esc(gl.sourceUrl)}" rel="noopener">${esc(gl.source || gl.sourceUrl)}</a></p>` : ''}
      <p class="glance-note">A Wavelength summary of the official requirements, checked on the date above. Wavelength is independent${gl.owner ? ` and is not run or endorsed by ${esc(gl.owner)}` : ''}. Requirements change, so confirm them with your supervisor and the official source.</p>
    </div>
  </footer>
</article>
<p class="glance-more reveal"><a class="text-link" href="${href}">Read the full ${esc(g.short || g.title)} guide</a>${hasAccreditationHub() ? ` · <a class="text-link" href="/guides/pocus-accreditation/">Compare all accreditation pathways</a>` : ''} · <a class="text-link" href="/pocus-logbook/">Track it in the free POCUS logbook</a></p>
</div></section>
<script>document.querySelectorAll('[data-print]').forEach(function(b){b.hidden=false;b.addEventListener('click',function(){window.print();});});</script>`,
    });
  }
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
    // Tests stay out of search so the Pearl page ranks for the topic. Links on them are still followed.
    noindex: true,
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
${subscribeBand('A new pearl and test <em>every week.</em>')}`,
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
${subscribeBand('A new pearl and test <em>every week.</em>')}`,
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
  seoTitle: 'Free POCUS e-learning with CPD certificates',
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
    <p class="form-note">Already registered? Enter the same email and we email you a link to carry on where you left off.</p>
    <form class="form" method="post" action="/api/academy/register" data-ac-register>
      <input type="hidden" name="module" value="${m.slug}">
      <label>Title (optional)<select name="title" autocomplete="honorific-prefix"><option value="">None</option>${['Dr', 'Prof', 'Mr', 'Mrs', 'Ms', 'Miss', 'Mx'].map((t) => `<option>${t}</option>`).join('')}</select></label>
      <div class="sub-row"><label>First name<input name="first_name" autocomplete="given-name" maxlength="80" required></label><label>Last name<input name="last_name" autocomplete="family-name" maxlength="80" required></label></div>
      <p class="form-note ac-name-note">Your certificate shows your title and name exactly as you enter them here.</p>
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
      <label>Role<select name="role" required><option value="">Choose your role</option>${ROLES.map((r) => `<option>${r}</option>`).join('')}</select></label>
      <label>Workplace (optional)<input name="organisation" autocomplete="organization" maxlength="160"></label>
      <label class="ac-hp" aria-hidden="true">Leave blank<input name="wl_trap" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input type="checkbox" name="newsletter" value="yes"${AC.newsletterRequired ? ' required' : ''}><span>Send me the Wavelength newsletter: a weekly ultrasound Pearl, new modules, and course dates. ${AC.newsletterRequired ? 'Joining the newsletter is part of free Academy registration. ' : ''}I can unsubscribe at any time.</span></label>
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
    seoTitle: `${m.short || m.title}: free e-learning with CPD`,
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
  noindex: true,
  description: `Check a ${AC.name} certificate is genuine by entering its code.`,
  body: `${pageHero({ eyebrow: AC.name, title: 'Verify a certificate.', lede: 'Enter the code printed on the certificate, for example WL-DVT-7K3M-Q9XA.', crumbs: acCrumbs([{ label: 'Verify' }]) })}
<section class="section"><div class="wrap"><form class="form ac-verify-form" method="get" action="/elearning/verify/">
  <label>Certificate code<input name="code" required maxlength="40" autocomplete="off" placeholder="WL-DVT-XXXX-XXXX" style="text-transform:uppercase"></label>
  <div><button class="btn" type="submit">Check certificate ${arrow}</button></div>
  <p class="form-error" data-show-on="error" hidden>We could not find a certificate with that code. Check it and try again.</p>
</form></div></section>${subscribeBand('Supervising or appraising? <em>Get the weekly Pearl.</em>', 'One free email a week: a practical scanning skill with a short test, new Academy modules and course dates. Optional. No account needed to verify.')}<section class="section sand"><div class="wrap"><div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">Do you supervise scanning?</h2><p>Teach with Wavelength. We welcome experienced scanners and ultrasound supervisors to our faculty.</p></div><a class="btn" href="/faculty/join/?utm_source=verify&amp;utm_medium=web">Apply to teach ${arrow}</a></div></div></section>`,
});

// One place to check any Wavelength code: WL- certificates, SO- sign-offs, EV- verified summaries.
pages['/verify/'] = layout({
  title: 'Verify a certificate or sign-off',
  pathname: '/verify/',
  noindex: true,
  description: 'Check that a Wavelength Academy certificate, a supervisor sign-off or a verified logbook summary is genuine. Enter the code printed on it.',
  body: `${pageHero({ eyebrow: 'Verify', title: 'Is it genuine?', lede: 'Enter the code printed on any Wavelength certificate, sign-off or logbook summary. No account needed.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Verify' }] })}
<section class="section"><div class="wrap"><form class="form ac-verify-form" method="get" action="/verify/" id="vform">
  <label>Code<input name="code" id="vcode" required maxlength="40" autocomplete="off" placeholder="WL-, SO- or EV- code" style="text-transform:uppercase"></label>
  <div><button class="btn" type="submit">Check ${arrow}</button></div>
  <p class="form-error" id="verr" hidden>Codes start with WL-, SO- or EV-. Check the code and try again.</p>
</form>
<div class="pillars" style="margin-top:48px">
  <div class="pillar"><div class="num">WL-</div><h3>Academy certificate</h3><p>Shows the learner's name, the module, CPD hours and the date it was issued.</p></div>
  <div class="pillar"><div class="num">SO-</div><h3>Supervisor sign-off</h3><p>Shows who signed, their stated role and accreditation, how they signed and which scans they confirmed.</p></div>
  <div class="pillar"><div class="num">EV-</div><h3>Verified logbook summary</h3><p>Shows the learner's progress against each pathway as Wavelength recorded it. Counts and dates only.</p></div>
</div>
<p style="margin-top:32px;color:var(--slate)">Scanning the QR code on a certificate or export opens the same check. Wavelength holds no patient identifiers, and checks never show findings or images.</p>
</div></section>
${subscribeBand('Supervising or appraising? <em>Get the weekly Pearl.</em>', 'One free email a week: a practical scanning skill with a short test, new Academy modules and course dates. Optional. No account needed to verify.')}<section class="section sand"><div class="wrap"><div class="empty-dates reveal"><div><h2 class="display" style="font-size:34px;margin-bottom:8px">Do you supervise scanning?</h2><p>Teach with Wavelength. We welcome experienced scanners and ultrasound supervisors to our faculty.</p></div><a class="btn" href="/faculty/join/?utm_source=verify&amp;utm_medium=web">Apply to teach ${arrow}</a></div></div></section>
<script>(function(){var go=function(v){v=String(v||'').toUpperCase().replace(/\\s+/g,'');if(/^WL-/.test(v))return '/elearning/verify/?code='+encodeURIComponent(v);if(/^(SO|EV)-/.test(v))return '/app/verify/?code='+encodeURIComponent(v);return null;};var q=new URLSearchParams(location.search).get('code');if(q){var u=go(q);if(u){location.replace(u);return;}document.getElementById('verr').hidden=false;document.getElementById('vcode').value=q;}document.getElementById('vform').addEventListener('submit',function(e){e.preventDefault();var u=go(document.getElementById('vcode').value);if(u)location.href=u;else document.getElementById('verr').hidden=false;});})();</script>`,
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
    <label class="consent"><input type="checkbox" name="newsletter" value="yes"><span>Send me the weekly Wavelength Pearl: free ultrasound tips and course dates. I confirm by email and can unsubscribe at any time. (Optional)</span></label>
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

// Wavelength admin console (hidden, not linked, not in sitemap). worker/index.js guards every /admin/ page with its own
// login and session, separate from the volunteer area; /volunteer/admin/* addresses redirect here.
const adminHero = (title, lede) => pageHero({ eyebrow: 'Wavelength admin', title, lede });
pages['/admin/'] = layout({
  title: 'Admin console',
  pathname: '/admin/',
  noindex: true,
  body: `${adminHero('Admin console.', 'Private to the Wavelength team. Volunteers and learners never see these pages.')}
<section class="section"><div class="wrap"><div id="admin-root"></div></div></section>
<script>document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.classList||!f.classList.contains('sv-form')||e.defaultPrevented)return;if(f.dataset.sent){e.preventDefault();return;}f.dataset.sent='1';var b=f.querySelector('button[type=submit]');if(b){b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='Saving…';}});</script>`,
});
pages['/admin/login/'] = layout({
  title: 'Admin login',
  pathname: '/admin/login/',
  noindex: true,
  body: `${adminHero('Admin login.', 'For the Wavelength team. Volunteers log in at the volunteer area instead.')}
<section class="section"><div class="wrap">
  <form class="form vol-login" method="post" action="/admin/login/">
    <p class="form-error" data-show-on="error" hidden>The username or password is not correct. Try again.</p>
    <label>Username<input name="username" autocomplete="username" autocapitalize="none" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <div><button class="btn" type="submit">Log in ${arrow}</button></div>
    <p class="form-note">The admin console moved here from /volunteer/admin/ in October 2026. It has its own login, separate from the volunteer area.</p>
  </form>
</div></section>`,
});
pages['/admin/unavailable/'] = layout({
  title: 'Admin console',
  pathname: '/admin/unavailable/',
  noindex: true,
  body: `${adminHero('Not set up yet.', 'The admin console needs its logins in the database first.')}`,
});
pages['/volunteer/unavailable/'] = layout({
  title: 'Volunteer area',
  pathname: '/volunteer/unavailable/',
  noindex: true,
  body: `${volHero('Opening soon.', `The volunteer area is not open yet. Email <a class="text-link" href="mailto:${site.enquiriesEmail}" style="color:inherit">${site.enquiriesEmail}</a> to register your interest.`)}`,
});

const APP_INSTALL_JS = `<script>(function(){var e=null,b=document.querySelector('[data-app-install]'),ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if('serviceWorker' in navigator)navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'}).catch(function(){});addEventListener('beforeinstallprompt',function(x){x.preventDefault();e=x;});if(b)b.addEventListener('click',function(){if(e){e.prompt();e.userChoice.then(function(c){if(c.outcome==='accepted')location.href=b.getAttribute('data-app-href')||'/app/';});}else if(ios){document.querySelector('[data-app-ios]').hidden=false;}else{location.href=b.getAttribute('data-app-href')||'/app/';}});})();</script>`;
// Account deletion page: Google Play and the App Store link to it from the store listings.
pages['/app/delete-account/'] = layout({
  title: 'Delete your Wavelength account',
  pathname: '/app/delete-account/',
  description: 'How to delete your Wavelength app account and what is deleted.',
  body: `${pageHero({ eyebrow: 'Wavelength app', title: 'Delete your account.', lede: 'You delete your Wavelength account yourself in the app, in a few seconds. You can also ask us by email.', crumbs: [{ label: 'Home', href: '/' }, { label: 'App', href: '/app/get/' }, { label: 'Delete your account' }] })}
<section class="section"><div class="wrap"><div class="prose">
<h2>In the app</h2>
<ol><li>Open the Wavelength app and log in.</li><li>Tap <b>Me</b>.</li><li>Scroll to the end and tap <b>Delete my account</b>.</li><li>Enter your password to confirm.</li></ol>
<p>Export or back up your logbook first if you want to keep a copy. Deletion cannot be undone.</p>
<h2>By email</h2>
<p>If you cannot open the app, email <a class="text-link" href="${mailto(site.enquiriesEmail, 'Delete my Wavelength account')}">${site.enquiriesEmail}</a> from the email address on your account and ask us to delete it. We confirm within one month, usually much sooner.</p>
<h2>What is deleted</h2>
<p>Your account, password, profile, the written entries in your logbook, your sign-offs and sign-off requests, structured assessments, supervisor links, verified evidence summaries and any encrypted images or clips waiting in a sign-off link. Verification codes for your sign-offs, assessments and summaries stop working.</p>
<p>Photos and clips live only on your phone and in backup files you saved yourself. Uninstalling the app removes them from your phone. Delete any backup files from your own cloud storage separately.</p>
<h2>What we keep</h2>
<p>If you hold Wavelength Academy certificates, the app asks whether to keep them verifiable. If you choose to keep them, we keep your name and email with the certificate records so employers can still check them, for up to six years after your last activity. Otherwise we delete them too. Course booking and payment records stay for six years because the law requires it. Read the <a class="text-link" href="/privacy/">privacy notice</a> for details.</p>
</div></div></section>`,
});

// The app as a SoftwareApplication, shared by /app/get/ and /pocus-logbook/ (same @id). Features listed here are all live in src/app/.
const APP_LD = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': url('/app/get/#app'), name: 'Wavelength', alternateName: 'Wavelength POCUS logbook',
  applicationCategory: 'MedicalApplication', operatingSystem: 'iOS, Android, web', url: url('/app/get/'), publisher: { '@id': url('/#org') },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  inLanguage: ['en', 'fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh-Hans'],
  featureList: [
    'Point-of-care ultrasound scan logbook, with images and clips kept on the device',
    `Progress against ${UK_PATHWAY_LIST} targets, editable international frameworks (${INTL_PATHWAY_LIST}), or targets you set`,
    'Supervisor sign-off in person, by secure link or from a supervisor dashboard',
    'Structured assessments: DOPS, formative, summative and final',
    'Portfolio export as PDF, Excel or CSV',
    'QR-verified evidence summaries',
    'Works offline',
  ],
};

// Wavelength app landing page (/app/get/). The app itself is static in src/app/.
{
  const f = (icon, t, d) => `<div class="pillar reveal"><div class="num">${icon}</div><h3>${t}</h3><p>${d}</p></div>`;
  const appFaqs = [
    { q: 'Is it free?', a: 'Yes. The logbook, progress tracking, sign-off, exports and backups are free.' },
    { q: 'Does Wavelength see my scan photos?', a: 'No. Photos stay on your phone and in backup files you save to your own iCloud Drive, Google Drive or OneDrive. Only the written record syncs to your account, and it must never contain patient identifiers. Images and clips you include in a sign-off link are encrypted on your phone first, so Wavelength stores files it cannot open, and deletes them once your supervisor signs.' },
    { q: 'Is it in my language?', a: 'The app works in English, French, Spanish, German, Italian, Polish, Arabic, Russian and Chinese. Choose a language on the first screen or in Me. Exports, certificates and verification records stay in English so every reviewer reads them the same way.' },
    { q: 'Do I need an account?', a: 'Yes. The app, its exports and its downloads need a free Wavelength account. Every scan, sign-off and verified summary then belongs to a named clinician, which is what makes it trustworthy evidence.' },
    { q: 'Can I upload images I already have?', a: 'Yes. Tap Choose on any scan to add images from your photos or files, several at once, up to 12 per scan. This includes images copied from the ultrasound machine to a USB drive, once your trust\'s removable media and information governance policy allows it. Every image opens in the editor before it is saved.' },
    { q: 'Can I edit images in the app?', a: 'Yes. The built-in editor crops, rotates, trims the patient banner from the top of the screen and blacks out any name, number, date or label, with undo. You do not need your phone\'s photo editor. Saving re-encodes the image, which removes hidden location and device data.' },
    { q: 'How fast is sign-off?', a: 'Immediate in person: your supervisor signs on your phone after the scan. By link, they open it on their own phone, confirm or query each scan and sign with a finger, and the sign-off appears in your logbook straight away. Include your images and clips in the link and your supervisor reviews them on their own phone before signing. They are encrypted on your phone, Wavelength cannot open them, and they delete when your supervisor signs.' },
    { q: 'How does someone check a sign-off is genuine?', a: 'Each sign-off has a code (SO-XXXX-XXXX) and QR code, printed on your case PDFs and in the sign-off register of every export. Scanning it, or entering the code at thewavelength.co.uk/verify, shows the learner, the supervisor, the date and how they signed. The check shows the record as it was signed, so an edited PDF does not match it, and changing a signed scan in the app voids its sign-off.' },
    { q: 'Is it in the App Store?', a: 'Not yet. You install it from this website in two taps and it works like any app, including offline. App Store and Google Play versions follow.' },
    { q: 'What about my Academy certificates?', a: 'Log in with the same email and your Wavelength Academy certificates appear in the app, ready to share or verify.' },
  ];
  let html = layout({
    title: 'Wavelength app | Free ultrasound logbook for RCEM, FAMUS, FUSIC, EUSEM, ACEM and more',
    seoTitle: 'Download the Wavelength ultrasound logbook app',
    pathname: '/app/get/',
    description: 'A free point-of-care ultrasound logbook. Log scans and clips, track RCEM, FAMUS and FUSIC or editable international frameworks, get signed off and assessed, and export portfolio-ready PDFs with QR-verified summaries. Photos stay on your phone.',
    jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'App', href: '/app/get/' }]), faqLd(appFaqs), APP_LD],
    body: `<section class="hero on-dark">${mesh}<div class="wrap hero-inner app-hero">
  <div>
    <p class="eyebrow rise">The Wavelength app</p>
    <h1 class="split-words">Your logbook. <em>In your pocket.</em></h1>
    <p class="lede rise">Log a scan in seconds from a photo you take or an image you upload. Your supervisor signs it off on the spot or from a secure link, and anyone checking your portfolio confirms it is genuine by scanning a QR code. Free, and your photos never leave your phone.</p>
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
<section class="section sand"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Why clinicians switch</p><h2 class="reveal" data-d="1">Three things a paper logbook cannot do.</h2></div>
  <div class="pillars app-pillars">
    ${f('Same day', 'Signed off before you go home', 'Hand your phone to your supervisor to sign with a finger, or send a secure link by WhatsApp, Teams or email. They review your images and confirm the scan from their own phone, often within minutes. No chasing signatures weeks later.')}
    ${f('Verify', 'Checked with one scan of a QR code', 'Every sign-off, every case PDF and every logbook export carries its own code and QR code. Your supervisor, ARCP panel, FAMUS administrator or appraiser scans it and sees the genuine record on the Wavelength site. No account needed to check, and no emails asking you to prove it.')}
    ${f('Images', 'Any image, ready to use', 'Photograph the screen, or upload images you already have from your photos or files, up to 12 per scan. Crop, rotate, trim off the patient banner and black out identifiers inside the app before you save.')}
  </div>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Built by ultrasound supervisors</p><h2 class="reveal" data-d="1">Everything your logbook should have been.</h2></div>
  <div class="pillars app-pillars">
    ${f('Targets', 'Every pathway, one scan', 'Choose RCEM, FAMUS, FUSIC or your own targets. A lung scan counts towards FAMUS thoracic and FUSIC lung at once, with pathology quotas, supervised counts and training windows tracked for you.')}
    ${f('Colour', 'See what is left', 'Red, amber, green. Each module shows exactly how many scans, supervised scans, reflections and pathologies you still need.')}
    ${f('Privacy', 'Photos stay on your phone', 'Take a photo or upload one, then crop, rotate and black out identifiers in the built-in editor. Hidden photo data is stripped when you save. Images are never readable by Wavelength.')}
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
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">Pathways and portfolios</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,60px);margin-top:20px">Working towards accreditation?</h2></div>
  <div class="reveal" data-d="2"><p class="lede">Which pathways the app tracks, how your evidence is organised for each accrediting body, what goes into your e-portfolio and whether your college will accept it are all on the <a class="text-link" href="/pocus-logbook/">POCUS logbook and portfolio</a> page.</p>${hasAccreditationHub() ? '<p class="lede" style="margin-top:18px">Not sure which pathway you need? <a class="text-link" href="/guides/pocus-accreditation/">Compare the accreditation pathways</a>.</p>' : ''}</div>
</div></section>
<section class="section sand"><div class="wrap split">
  <div><p class="eyebrow reveal">Good to know</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,64px);margin-top:20px">Questions.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">Read the <a class="text-link" href="/app-terms/">logbook terms of use</a> and <a class="text-link" href="/privacy/">privacy notice</a>. Questions about pathways, e-portfolios and verified summaries are answered on the <a class="text-link" href="/pocus-logbook/#faq">POCUS logbook page</a>.</p></div>
  ${faqHtml(appFaqs)}
</div></section>
${ctaBand('Tune in. <em>Log it.</em>', 'Free for every clinician who scans. Open it on your phone and add it to your home screen.')}`,
  });
  html = html.replace('<link rel="manifest" href="/site.webmanifest">', '<link rel="manifest" href="/app/manifest.webmanifest">')
    .replace('</body>', `${APP_INSTALL_JS}\n</body>`);
  pages['/app/get/'] = html;
}

// POCUS logbook and portfolio (/pocus-logbook/): the search landing page for the app. Pathway cards come from data/logbook.json,
// so the page always lists what the app actually tracks. /app/get/ stays the download page.
{
  const LOGBOOK_PAGE_REVIEWED = '2026-10-05';
  const UK_TARGETS_CHECKED = PATHWAYS.filter((p) => p.region === 'UK').map((p) => p.checked).filter(Boolean).sort().pop() || LOGBOOK_PAGE_REVIEWED;
  const regionOf = (p) => p.region || 'Any country';
  // Outside the UK the programme details have not been checked against each body's documents, so the card names only the organisation.
  const intlOf = (p) => p.region && p.region !== 'UK';
  const nameOf = (p) => (!p.region || p.region === 'UK' ? p.name : p.name.replace(/\s*\(.*\)$/, '').replace(/,.*$/, ''));
  const pwCard = (p) => {
    const g = guideHref(p.id);
    const mods = (p.modules || []).map((m) => m.label);
    const link = g ? `<a class="text-link" href="${g}">${esc(p.id === 'rcem' ? 'RCEM sign-off guide' : `${p.label} accreditation guide`)}</a>` : (hasAccreditationHub() ? `<a class="text-link" href="/guides/pocus-accreditation/#international-pathways-and-frameworks">${esc(p.label)} in international pathways and frameworks</a>` : '');
    return `<article class="pw-card reveal" id="pathway-${p.id}"><p class="eyebrow">${esc(regionOf(p))}${intlOf(p) ? ' · International framework' : ''}</p><h3>${esc(p.label)}</h3><p class="pw-name">${esc(nameOf(p))}</p><p class="pw-mods"><b>${intlOf(p) ? 'Editable tracker' : 'The app tracks'}:</b> ${esc(andList(mods))}.</p>${link ? `<p class="pw-link">${link}</p>` : ''}</article>`;
  };
  const steps = [
    ['Choose your pathway', `Pick ${UK_PATHWAY_LIST}, an editable international framework (${INTL_PATHWAY_LIST}), several at once, or a general logbook with your own targets. You can adjust any target to match what your supervisor or local credentialing process asks for.`],
    ['Log every scan', 'Choose the scan type, tick the findings, record the supervision level and add images or a short clip. The app warns you if text looks like a patient identifier.'],
    ['Get signed off', 'Your supervisor signs on your phone, from a secure link on their own phone, or from their supervisor dashboard. Each sign-off has its own verification code.'],
    ['Record assessments', 'DOPS, formative, summative and final or triggered assessments, rated across six domains with an outcome and a signature. Summative, DOPS and final assessments count once judged competent.'],
    ['Track your progress', 'Each module shows total and supervised scans, required findings, reflections, assessments and training windows in red, amber or green, so you see exactly what is left.'],
    ['Export your portfolio', 'Choose where it is going and the app builds a PDF, Excel or CSV file, with the steps for that destination. A verified summary adds a code and QR code that reviewers scan to check your figures online.'],
  ];
  const faqs = [
    { q: 'What is a POCUS logbook?', a: 'A record of every point-of-care ultrasound scan you perform while training: the scan type, the clinical question, your findings, how you were supervised and who reviewed it. Accrediting bodies and ARCP panels use it, with your assessments and reflections, to judge your progress towards sign-off.' },
    { q: 'What should a POCUS logbook record?', a: 'For each scan: a training reference (never a patient identifier), the date, the scan type and pathway module, the setting, the clinical question, the views obtained, image quality, findings, the supervision level, who supervised or reviewed it, formal imaging or outcome, and a reflection. RCEM accepts any logbook that captures its minimum dataset within data protection rules. FAMUS and FUSIC have their own report sheets and forms.' },
    { q: 'Which pathways and frameworks does it support?', a: `UK pathways: ${UK_PATHWAY_LIST}. International pathways and frameworks, as editable trackers: ${andList(PATHWAYS.filter((p) => intlOf(p) && p.id !== 'eusem2').map((p) => `${p.label} (${regionOf(p)})`))}. Plus a general logbook for any application with targets you set.` },
    { q: 'Can one scan count towards more than one pathway?', a: 'Wavelength can apply one scan to multiple selected pathway trackers when it meets their configured criteria. Acceptance remains subject to each organisation, supervisor or local credentialing process.' },
    { q: 'Will RCEM, SAM or the Intensive Care Society accept it?', a: 'RCEM accepts any logbook platform that captures the minimum dataset and meets data protection rules, although its preferred platform is the RCEM e-portfolio. FAMUS and FUSIC have their own report sheets, reporting forms and final paperwork, which you still complete. Your supervisor and the accrediting body decide what they accept. Wavelength is independent of all of them.' },
    { q: 'Does it replace my e-portfolio?', a: 'No. It organises your scans, sign-offs and assessments and builds a file for your portfolio. Choose the destination (the RCEM e-portfolio on risr/advance, the JRCPTB ePortfolio, FAMUS, FUSIC or appraisal) and the app shows the steps. It is not yet connected directly to any of these systems.' },
    { q: 'What is a QR-verified summary?', a: 'When you export, Wavelength can compute your progress against each pathway from your synced logbook and store a snapshot with a code and QR code. Your supervisor, ARCP panel or accrediting body scans it and sees the same figures and sign-offs online. It shows counts and dates only, never findings or images, and you can withdraw it at any time.' },
    { q: 'Can I use it outside the UK?', a: 'Yes. It has editable international frameworks for the EUSEM curriculum in Europe, ACEM\'s recommended credentialing framework in Australia and New Zealand, CPoCUS in Canada and ACEP\'s guidelines in the United States. They are starting points, not checked against each organisation\'s current documents, so adapt them to your local requirements. Credentialing is decided by your health service or hospital.' },
  ];
  const href = '/pocus-logbook/';
  pages[href] = layout({
    title: 'POCUS logbook and ultrasound portfolio',
    seoTitle: 'POCUS logbook and ultrasound portfolio, free',
    pathname: href,
    description: 'Free POCUS logbook and ultrasound portfolio app for RCEM, FAMUS and FUSIC, with editable international frameworks. Scans, sign-offs and assessments in one place.',
    jsonld: [
      breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'POCUS logbook', href }]),
      { '@context': 'https://schema.org', '@type': 'WebPage', '@id': url(href), name: 'POCUS logbook and ultrasound portfolio', url: url(href), inLanguage: 'en-GB', lastReviewed: LOGBOOK_PAGE_REVIEWED, about: { '@id': url('/app/get/#app') }, isPartOf: { '@type': 'WebSite', name: site.name, url: url('/') } },
      APP_LD,
      faqLd(faqs),
    ],
    body: `${pageHero({
      eyebrow: 'POCUS logbook and portfolio',
      title: 'Your portfolio, tailored to <em>your accrediting body.</em>',
      lede: 'For supported UK pathways, Wavelength arranges your scans, assessments and sign-offs around published portfolio requirements. International trackers provide editable starting frameworks that you can adapt to your local requirements. Export as PDF, Excel or CSV with a QR-verified summary.',
      crumbs: [{ label: 'Home', href: '/' }, { label: 'POCUS logbook' }],
      extra: `<div class="hero-ctas rise"><a class="btn btn-teal cta-caps" href="/app/get/" data-m="logbook-hero-start">Start your free logbook ${arrow}</a><a class="btn btn-ghost light" href="#watch" data-film-play="app-film" data-m="logbook-hero-watch">Watch how it works</a><a class="btn btn-ghost light" href="/app/" data-m="logbook-hero-browser">Open in your browser</a></div>
      <div class="hero-meta rise"><div><b>Free</b>Logbook, sign-off and exports</div><div><b>${PATHWAYS.filter((p) => p.region === 'UK').length} UK pathways</b>Plus editable international frameworks</div><div><b>Nine languages</b>Exports in English</div><div><b>Photos stay on your phone</b>Only the written record syncs</div></div>`,
    })}
<section class="section film-section" id="watch"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">See how it works</p><h2 class="reveal" data-d="1">Your scans should move your training forward.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:680px">Record each scan while it is fresh, request review when your supervisor is available, and keep your evidence ready for your portfolio. See how the free Wavelength ultrasound logbook fits around real clinical rotas, in under two minutes.</p></div>
  ${film('app', 'app-film', 'A scan logged on a night shift, reviewed by a supervisor on theirs, and signed off. The people, hospital and scans in the film are fictional.')}
</div></section>
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">What it is</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">A free POCUS logbook that builds <span>your portfolio as you scan.</span></h2></div>
  <div class="reveal" data-d="2">
    <p class="lede">Wavelength is a point-of-care ultrasound logbook for doctors, advanced clinical practitioners, physician associates, nurses and other clinicians learning bedside ultrasound. You record each scan on your phone, your supervisor signs it off, assessments sit beside the scans they cover, and your progress against your pathway updates as you go.</p>
    <p class="lede" style="margin-top:18px">When you are ready, you export a portfolio your supervisor, ARCP panel or accrediting body can check online. It is free to use, works offline, and runs in your browser or from your home screen on iPhone and Android.</p>
  </div>
</div></section>
<section class="section sand" id="supervision"><div class="wrap split">
  <div><p class="eyebrow reveal">Scanning on a busy shift</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">Ultrasound training shouldn't stop <span>when your supervisor isn't available.</span></h2>
    <p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">You scan when the patient needs it. Your supervisor may be on a different shift, in resus, or at another site. Paper sheets go missing, review never quite happens, and the logbook falls behind.</p></div>
  <div class="reveal" data-d="2">
    <ul class="checklist">${[
      ['Log when it suits you', 'Record the scan during the shift or afterwards, from a photo or an upload, with the findings and how you were supervised. It saves on your phone even without signal.'],
      ['Choose the right supervisor', 'Invite the supervisors you work with. The app shows whether each one is a Wavelength Verified Supervisor, and for which pathway modules.'],
      ['Send for review', 'Send scans to a linked supervisor’s dashboard, or a secure link to anyone who supervised you. They review when they are free, from their own phone.'],
      ['Get feedback', 'Your supervisor confirms each scan or queries it with a comment, rates image quality and accuracy if they wish, and can record a structured assessment.'],
      ['See your progress', 'Every sign-off and assessment updates your pathway targets, so you always know what is left.'],
    ].map(([h, t]) => `<li>${tick}<span><b>${esc(h)}.</b> ${esc(t)}</span></li>`).join('')}</ul>
    <p class="source" style="margin-top:18px">Remote review of a written record and images does not replace directly supervised scanning, observed procedures or the assessments your pathway requires, and a supervisor decides what they review and when. Sign-off in Wavelength records your supervisor’s decision; accreditation stays with your accrediting body.</p>
    <p style="margin-top:22px"><a class="btn btn-teal cta-caps" href="/app/get/" data-m="logbook-story-start">Start your free logbook ${arrow}</a></p>
  </div>
</div></section>
<section class="section" id="app-screens"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">The app, screen by screen</p><h2 class="reveal" data-d="1">From the scan to the signature.</h2></div>
  <ol class="app-steps">${[["wavelength-app-step-1-log.jpg","Log a scan","Choose the scan, tick the findings and add an image with patient details removed.","The app’s image screen: crop, annotate or redact an ultrasound image before it is saved."],["wavelength-app-step-2-request.jpg","Request review","Send it to a linked supervisor’s dashboard, or share a secure link, from your shift.","The app’s sign-off request, ready to share with a supervisor by link."],["wavelength-app-step-3-signed-off.jpg","Receive sign-off","Your supervisor reviews on their shift; the sign-off, its code and their ratings appear on the scan.","A scan in the app marked signed off by a Wavelength Verified Supervisor, with image quality and diagnostic accuracy rated good."],["wavelength-app-step-4-progress.jpg","Track and export","See what is left for your pathway, then export a portfolio with a QR-verified summary.","The app’s export screen and a verified summary showing scans, supervision and sign-offs."]].map(([img, h, p, alt], i) => `<li class="reveal" data-d="${i % 4}"><figure><img src="/media/${img}" alt="${esc(alt)}" width="960" height="540" loading="lazy" decoding="async"><figcaption><span class="ac-step-n">${i + 1}</span><b>${esc(h)}.</b> ${esc(p)}</figcaption></figure></li>`).join('')}</ol>
  <p class="source" style="margin-top:14px">Screens from the Wavelength app with fictional people and illustrative images, never a patient.</p>
</div></section>
<section class="section sand"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">From first scan to finished portfolio</p><h2 class="reveal" data-d="1">Six steps, one app.</h2></div>
  <ol class="ac-steps steps-3">${steps.map(([h, t], i) => `<li class="reveal" data-d="${i % 3}"><span class="ac-step-n">${i + 1}</span><h3>${esc(h)}</h3><p>${esc(t)}</p></li>`).join('')}</ol>
</div></section>
<section class="section" id="pathways"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Pathways and frameworks it tracks</p><h2 class="reveal" data-d="1">Organised for your accrediting body.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:16px;max-width:680px">Wavelength can apply one scan to multiple selected pathway trackers when it meets their configured criteria. A lung scan, for example, can count towards both the FAMUS Thoracic and FUSIC Lung trackers. Acceptance remains subject to each organisation, supervisor or local credentialing process.</p></div>
  <div class="pw-grid">${PATHWAYS.filter((p) => p.id !== 'eusem2').map(pwCard).join('')}</div>
  <p class="source reveal" style="max-width:780px;margin-top:28px">The RCEM, FAMUS and FUSIC targets follow each body's published documents, checked on ${fmtDate(UK_TARGETS_CHECKED, { day: 'numeric', month: 'long', year: 'numeric' })}. The EUSEM, ACEM, CPoCUS and ACEP trackers are editable starting frameworks, not checked against those organisations' current documents, so adapt them to your local requirements. Curricula change, so confirm requirements with your supervisor and the accrediting body or local credentialing process. Wavelength is independent and is not run or endorsed by RCEM, the Society for Acute Medicine, the Intensive Care Society, EUSEM, ACEM, CPoCUS, ACEP or any other body.${hasAccreditationHub() ? ' <a class="text-link" href="/guides/pocus-accreditation/">Compare the pathways</a>.' : ''}</p>
</div></section>
<section class="section on-dark" style="background:var(--navy)"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal" style="color:var(--teal-l)">Evidence reviewers can check</p><h2 class="reveal" data-d="1" style="color:var(--cream)">Every record carries a code.</h2><p class="reveal" data-d="2" style="color:#B9C4D0;max-width:640px">A paper logbook or spreadsheet asks reviewers to take the numbers on trust. Wavelength records carry verification codes anyone can check at <a class="text-link" href="/verify/" style="color:var(--teal-l)">thewavelength.co.uk/verify</a>, with no account.</p></div>
  <ol class="ev-steps"><li class="reveal" data-d="0"><span class="ev-n">SO-</span><h3>Sign-offs</h3><p>Who signed, their stated role, how they signed and which scans they confirmed. Editing a signed scan voids its sign-off.</p></li><li class="reveal" data-d="1"><span class="ev-n">AS-</span><h3>Assessments</h3><p>The type, outcome, date and assessor of each structured assessment. Written feedback stays private.</p></li><li class="reveal" data-d="2"><span class="ev-n">EV-</span><h3>Verified summaries</h3><p>Your progress against each pathway, computed by Wavelength from your synced logbook. Counts and dates only.</p></li><li class="reveal" data-d="3"><span class="ev-n">QR</span><h3>Scan to check</h3><p>Every export, case PDF and sign-off register carries QR codes, so an edited file does not match the record online.</p></li></ol>
</div></section>
<section class="section sand"><div class="wrap split">
  <div><p class="eyebrow reveal">What it does not replace</p><h2 class="display reveal" data-d="1" style="font-size:clamp(34px,4.5vw,54px);margin-top:20px">Each body keeps its own forms.</h2></div>
  <div class="reveal" data-d="1">
    <p class="lede">Wavelength organises your evidence and shows your progress. Each accrediting body still asks for its own paperwork, and the logbook is built to sit alongside it.</p>
    <ul class="checklist" style="margin-top:24px">${[
      `<b>RCEM:</b> DOPS and the entrustment decision in the RCEM e-portfolio.${guideHref('rcem') ? ` <a class="text-link" href="${guideHref('rcem')}">RCEM sign-off guide</a>` : ''}`,
      `<b>FAMUS:</b> a FAMUS report sheet for every scan, countersigned by your mentor, and the ACT sent to SAM.${guideHref('famus') ? ` <a class="text-link" href="${guideHref('famus')}">FAMUS guide</a>` : ''}`,
      `<b>FUSIC:</b> the standard FUSIC reporting form for every scan, and a summary training record through the FUSIC portal.${guideHref('fusic') ? ` <a class="text-link" href="${guideHref('fusic')}">FUSIC guide</a>` : ''}`,
    ].map((x) => `<li>${tick}<span>${x}</span></li>`).join('')}</ul>
    <p style="color:var(--slate);margin-top:20px">Wavelength is not yet connected directly to any accrediting body's system. You attach the export and paste the verification link.</p>
  </div>
</div></section>
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">Privacy by design</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">Your photos stay <span>on your phone.</span></h2></div>
  <div class="reveal" data-d="2">
    <p class="lede">Images and clips live on your device and in backups you save to your own cloud storage. The built-in editor crops, rotates and covers identifiers, and saving strips hidden photo data. Only the written record syncs to your account.</p>
    <p class="lede" style="margin-top:18px">When you share images with your supervisor in a sign-off link, your phone encrypts them first. Wavelength stores files it cannot open, and deletes them once your supervisor signs. The logbook must never contain patient-identifiable information. Read the <a class="text-link" href="/app-terms/">logbook terms</a> and <a class="text-link" href="/privacy/">privacy notice</a>.</p>
  </div>
</div></section>
<section class="section sand" id="faq"><div class="wrap split">
  <div><p class="eyebrow reveal">Questions</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,64px);margin-top:20px">Good to know.</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">Installing on iPhone or Android, or asking about cost, images or sign-off on a phone? See <a class="text-link" href="/app/get/">download the app</a>.</p></div>
  ${faqHtml(faqs)}
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">Learn while you log</p><h2 class="reveal" data-d="1">Guides, Pearls and courses.</h2></div>
  <div class="post-grid">
    ${hasAccreditationHub() ? `<a class="post-card reveal" href="/guides/pocus-accreditation/"><p class="eyebrow">Guide</p><h3>POCUS accreditation, pathway by pathway</h3><p>Which pathway fits you, and what RCEM, FAMUS, FUSIC and the international bodies ask for.</p><span class="meta">Free guide</span></a>` : ''}
    ${liveGuides.some((g) => g.slug === 'ultrasound-logbook') ? `<a class="post-card reveal" data-d="1" href="/guides/ultrasound-logbook/"><p class="eyebrow">Guide</p><h3>How to keep an ultrasound logbook</h3><p>What to record for every scan, how to keep patient data out, and the counting rules each pathway applies.</p><span class="meta">Free guide</span></a>` : ''}
    ${posts.length ? `<a class="post-card reveal" data-d="2" href="/learn/"><p class="eyebrow">Wavelength Pearls</p><h3>${posts.length} free ultrasound pearls</h3><p>One technique, one view or one pitfall at a time, each with a short test. Most pearls show which pathways their scan counts towards.</p><span class="meta">Free</span></a>` : ''}
  </div>
  <div class="post-cta reveal" style="max-width:none"><div><h3>Start your logbook today</h3><p>Free for every clinician who scans. Open it on your phone and add it to your home screen.</p></div><a class="btn btn-teal" href="/app/get/">Get the free app ${arrow}</a></div>
</div></section>`,
  });
}

// Logbook help (1.0.18): how to use the app, task by task, linked from the app (Me > Help) and the App menu. The
// words in bold are the app's own button and screen names (English); keep them in step with src/app/app.js.
{
  const href = '/pocus-logbook/help/';
  // Questions and answers. Facts come from data/logbook.json (pathways, module targets, supervision levels, assessment
  // kinds, destinations) and from the app; keep them in step when those change.
  const HQ = [
    ['curricula', 'Questions: curricula and targets', [
      ['Which curricula and frameworks does the logbook follow?', 'Choose one or more pathways: the RCEM PoCUS curriculum (2021, Appendix 3), the FAMUS module packs of the Society for Acute Medicine, the FUSIC training packs of the Intensive Care Society, the EUSEM Core Compendium (core and advanced), ACEM\'s credentialing recommendations, the CPoCUS Acute Care CORE track, the ACEP Ultrasound Guidelines, or General with your own targets. Each pathway\'s targets come from that body\'s published documents, and the app names the document and version it used. Wavelength is independent: it is not run or endorsed by any of these bodies, and curricula change, so check requirements with your supervisor and the accrediting body.'],
      ['How does the app know what I still need to do?', 'For each module it tracks what your pathway asks for: the total number of scans, how many were supervised, reflective notes, the assessment that completes the module (a DOPS judged competent for RCEM, the assessment of completion of training for FAMUS, the triggered assessment for FUSIC) and any time rules, such as FAMUS\'s minimum training time from your first supervised scan or FUSIC\'s 12-month logbook window. <b>Progress</b> shows each module as a ring that moves from red to amber to green, with what is left. For example, RCEM AAA shows its indicative minimum of 25 scans, 5 reflective notes and a DOPS.'],
      ['Does it check the case mix, not just the numbers?', 'Yes, where a pathway sets rules. FAMUS Thoracic, for example, counts scans showing consolidation, increased lung water and pleural effusion, and FUSIC limits scans on healthy volunteers to 10%. The app reads these from what you record, so fill in the findings and the setting for every scan.'],
      ['Can one scan count towards more than one pathway?', 'Yes. Wavelength applies one scan to every pathway you follow when it meets that pathway\'s criteria, so you never log the same scan twice. Each organisation, supervisor or local credentialing process still decides what it accepts.'],
      ['What do the supervision levels mean?', '<b>Directly supervised</b>: a supervisor or mentor watched you scan. <b>Independent, reviewed by mentor</b>: you scanned alone and a mentor reviewed your images later. <b>Independent</b>: your own scan, not reviewed. Each pathway counts them by its own rules (FUSIC, for instance, no longer counts course scans as supervised). Choose the level that is true: a sign-off confirms it.'],
      ['Can I change my targets?', 'In <b>Progress</b>, tap <b>Targets</b>. The international frameworks and General are starting points: adjust them to your country, hospital or department, and remove modules you do not use. For the UK pathways, keep the published targets unless your supervisor or accrediting body tells you otherwise.'],
      ['Does reaching my targets mean I am signed off or accredited?', 'No. Logging a scan, meeting a target in the app or receiving a sign-off does not by itself confer competence or accreditation. RCEM sign-off is by DOPS and your department\'s entrustment decision; FAMUS and FUSIC end with their own final assessment and paperwork, which you still complete. Wavelength keeps the evidence organised and shows how close you are.'],
    ]],
    ['evidence', 'Questions: sign-off, evidence and ARCP', [
      ['Will RCEM, SAM or the Intensive Care Society accept it?', 'RCEM accepts any logbook platform that captures its minimum dataset and meets data protection rules, although its preferred platform is the RCEM e-portfolio. FAMUS and FUSIC have their own report sheets, reporting forms and final paperwork, which you still complete. Your supervisor and the accrediting body decide what they accept.'],
      ['Does it replace my e-portfolio?', 'No. It organises your scans, sign-offs and assessments and builds a file for your portfolio. When you export, choose where it is going (the RCEM e-portfolio on risr/advance, the JRCPTB ePortfolio, FAMUS, FUSIC, appraisal or another portfolio) and the app shows the steps. It is not yet connected directly to any of these systems, so you attach the export to your portfolio entry. For RCEM, ask your supervisor to complete the DOPS in your e-portfolio too.'],
      ['How do I show my logbook at ARCP or to an assessor?', 'Tap <b>Me</b>, then <b>Export your logbook</b>: a PDF, Excel or CSV file of your scans, sign-offs, assessments and reflections. Add a verified summary if you want the panel to be able to check your figures online.'],
      ['What is a QR-verified summary?', 'When you export, Wavelength can work out your progress against each pathway from your synced logbook and store a snapshot with a code and QR code. Your supervisor, ARCP panel or accrediting body scans it and sees the same figures and sign-offs online. It shows counts and dates only, never findings or images, and you can withdraw it at any time.'],
      ['How does anyone know a sign-off is genuine?', 'Every sign-off and assessment has a code. Anyone can enter it at <a class="text-link" href="/verify/">thewavelength.co.uk/verify</a> and see the learner, the supervisor\'s name and role, the date and the scan types and dates, never findings or images. It also says whether the signer was a Wavelength Verified Supervisor at the time, a Wavelength account holder not approved at the time, or self-declared. Editing a signed scan voids its sign-off.'],
      ['My supervisor does not use Wavelength. Can they still sign?', 'Yes. They sign <b>In person</b> on your phone, or open a link you send them on any device; no account is needed. They sign by hand or type their name, and the record shows how they described themselves. Anyone with the link can sign, so send it only to your supervisor.'],
      ['What happens if my supervisor queries a scan?', 'The scan shows as queried, with their comment. Check or correct it, then ask for sign-off again.'],
    ]],
    ['supervisors', 'Questions: supervisors', [
      ['What is a Wavelength Verified Supervisor?', 'A supervisor whose professional registration Wavelength has checked by hand against the regulator\'s public register, and approved for the areas they supervise. Approval lasts up to 12 months. Their sign-offs and assessments show that they were verified when they signed, which makes your evidence easier to trust.'],
      ['How do I link my supervisor?', 'In <b>Me</b>, under <b>Supervision</b>, tap <b>Your supervisors</b>: find a Wavelength Verified Supervisor or invite your own. A linked supervisor sees your progress and your written scan records in their own Wavelength app, never your images, and you can send sign-off and assessment requests straight to their dashboard. Remove a supervisor at any time.'],
      ['I supervise trainees. Can I use Wavelength?', 'Yes, free. In <b>Me</b>, under <b>Supervision</b>, tap <b>Learners you supervise</b>, then <b>Become a Wavelength supervisor</b> to apply for verification. Your dashboard lists your trainees\' requests; you sign off in person or by link and record structured assessments.'],
    ]],
    ['privacy', 'Questions: patient data and privacy', [
      ['Can I photograph scans?', 'Only ultrasound images with every patient identifier removed, and only where your employer\'s policy allows it. Some employers do not allow photographs of screens: then log the scan without a photo. Never type names, dates of birth, hospital or NHS numbers or any other identifier into the logbook. The editor\'s <b>Redact</b> covers text, and the app warns you if something looks like an identifier, but the check is yours.'],
      ['Who can see my logbook?', 'You. Supervisors you link see your progress and written entries, never your photos or clips. Someone with a sign-off, assessment or summary code sees only what that code shows. Wavelength never sees your photos.'],
      ['Where is my data kept?', 'Your account and written entries are stored with our processors in the UK and the European Economic Area where we can. Photos and clips stay on your phone and in backup files you keep. The <a class="text-link" href="/privacy/">privacy notice</a> has the details.'],
      ['Does it work without signal?', 'Yes. Log and edit scans offline; Wavelength syncs your entries when the phone is back online. A guide opened offline says it is the copy from your last connection.'],
    ]],
  ];
  const H = [
    ['start', 'Getting started', `<ol><li>Install Wavelength from the App Store or Google Play, or open it in your browser: see <a class="text-link" href="/app/get/">Download the app</a>.</li><li>Create your account with your name, email and a password, and confirm your email address from the message we send.</li><li>Choose your pathways, for example RCEM, FAMUS or FUSIC. <b>Progress</b> then shows your scans against each pathway's targets.</li></ol>`],
    ['log', 'Log a scan', `<ol><li>Tap the round <b>+ Log</b> button in the middle of the bottom bar.</li><li>Choose the application and check the date.</li><li>Record what you found, your image quality and your interpretation. Add the confirmation and the impact on management if you know them.</li><li>Choose the <b>Level of supervision</b> and, if you like, your supervisor.</li><li>Add a reflection if you want it to count as a reflective note.</li><li>Tap <b>Save scan</b>.</li></ol><p>Log on the day of the scan. If Wavelength closes before you save, Home shows <b>Kept on this phone</b>: tap <b>Review</b> to carry on where you left off. Nothing is added to your logbook until you save it.</p>`],
    ['media', 'Photos and clips', `<p>In a scan, under <b>Images and clips</b>, tap <b>Take photo</b>, <b>Choose</b> or <b>Clip</b> (up to 10 seconds, with sound removed). The editor then has three modes:</p><ul><li><b>Adjust</b>: crop, trim, rotate and flip.</li><li><b>Redact</b>: cover identifiers with a solid block. Blurring is not offered, because it can leave text readable.</li><li><b>Annotate</b>: labels, your own text, arrows, boxes, circles, dots and pictograms. <b>Size</b> and <b>Rotation</b> change the selected one; <b>Straight</b> is in the middle of Rotation.</li></ul><p>Before you save, confirm that you removed or covered every patient identifier (in every frame of a clip). Photos and clips taken with the camera from Wavelength go straight into the app's own storage, not your phone's gallery.</p>`],
    ['sync', 'What syncs, and what stays on your phone', `<ul><li><b>Your written logbook entries sync</b> to your Wavelength account, so they appear on every phone, tablet or browser where you log in.</li><li><b>Photos and clips never leave your phone.</b> They are not uploaded to Wavelength, so they do not appear on another device. The only exception is a sign-off link you choose to send with images: they are encrypted on your phone, and deleted when your supervisor signs, you cancel, or after 14 days.</li><li>The sync label at the top of the app shows this device's status. Tap it for details and <b>Retry sync</b>. Offline, everything keeps working and syncs when you are back online.</li></ul>`],
    ['backup', 'Back up, restore and move to a new phone', `<p>Because photos and clips stay on your phone, a backup is their only copy anywhere else.</p><ol><li>Tap <b>Me</b>, then <b>Back up and restore</b>.</li><li>Choose a passphrase, type it twice and tick the box. Wavelength cannot recover a forgotten passphrase.</li><li>Tap <b>Create encrypted backup</b>, then <b>Share or save</b>, and keep the file somewhere safe: Files or iCloud Drive on iPhone, Google Drive or OneDrive on Android, or your computer.</li></ol><p><b>On a new phone</b>, install Wavelength and log in: your written entries come back by themselves. Then open <b>Me</b>, <b>Back up and restore</b>, tap <b>Choose backup file</b>, enter the passphrase and tap <b>Restore</b>. Only what is missing is added, so nothing is duplicated. This works between Android and iPhone in either direction: move the file by email, cloud storage, AirDrop or Quick Share.</p>`],
    ['signoff', 'Supervisor sign-off', `<ol><li>Tap <b>Logbook</b>, then <b>Sign-off</b> at the top.</li><li>Select the scans and choose how your supervisor signs: <b>In person</b> on your phone, or with a link you send them.</li><li>Your supervisor confirms each scan or queries it, and signs by hand or types their name.</li></ol><p>Each sign-off gets a code that anyone can check at <a class="text-link" href="/verify/">thewavelength.co.uk/verify</a>. Editing a signed scan voids its sign-off. You can mark a scan as not needing sign-off.</p>`],
    ['assess', 'Assessments', `<p>In <b>Progress</b>, tap <b>Request assessment</b> on a module, or open a saved scan and tap <b>Use for an assessment</b>. Your assessor completes it with you <b>In person</b> on your phone, or from a secure link on any device (it works for 14 days). Formative assessments guide your learning; summative, DOPS and final assessments count towards your targets when your assessor judges you competent. Each one has a code anyone can verify.</p>`],
    ['export', 'Export your logbook', `<p>Tap <b>Me</b>, then <b>Export your logbook</b>, and choose PDF, Excel or CSV for your portfolio or ARCP. You can add a verified summary: a snapshot of your progress with a code and QR code that assessors can check. You can withdraw a summary at any time.</p>`],
    ['lock', 'Lock the app', `<p>Tap <b>Me</b>, then the gear icon (<b>Settings</b>) at the top. Under <b>Security</b>, tick <b>Lock the app with fingerprint or face</b>. Wavelength then asks for your fingerprint, face or phone passcode when it opens and after it has been in the background for a while.</p>`],
    ['account', 'Your account, devices and languages', `<ul><li><b>Free.</b> The logbook costs nothing, on iPhone, Android and in the browser at <a class="text-link" href="/app/">thewavelength.co.uk/app</a>. Use the same account on as many devices as you like.</li><li><b>Languages.</b> The app is in nine languages: tap <b>Me</b>, then the gear icon (<b>Settings</b>) at the top, and choose the <b>App language</b>. Exports and certificates stay in English so any assessor can read them.</li><li><b>Lost or changed phone.</b> In <b>Me</b>, <b>Settings</b>, <b>Log out other devices</b> signs out every other phone, tablet and browser. Your written entries stay safe in your account; photos and clips come back only from a backup.</li><li><b>Leaving.</b> Export first, then <b>Me</b>, <b>Settings</b>, <b>Delete my account</b>. This deletes your logbook, sign-offs, assessments, supervisor links and verified summaries.</li></ul>`],
    ...HQ.map(([id, title, qs]) => [id, title, qs.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('\n')]),
    ['help', 'Still stuck?', `<p>Email <a class="text-link" href="mailto:hello@thewavelength.co.uk">hello@thewavelength.co.uk</a>. In the app, <b>Me</b>, then <b>About Wavelength</b>, then <b>Contact support</b> adds your app version for us. See also the <a class="text-link" href="/app-terms/">logbook terms of use</a>, the <a class="text-link" href="/privacy/">privacy notice</a> and the <a class="text-link" href="/guides/ultrasound-logbook/">ultrasound logbook guide</a> on what to record.</p>`],
  ];
  pages[href] = layout({
    title: 'Logbook help',
    seoTitle: 'Logbook help: how to use the Wavelength app',
    pathname: href,
    description: 'How to use the free Wavelength POCUS logbook, with answers on RCEM, FAMUS and FUSIC targets, sign-off, ARCP evidence, supervisors, backups and patient data.',
    jsonld: [breadcrumbLd([{ label: 'Home', href: '/' }, { label: 'POCUS logbook', href: '/pocus-logbook/' }, { label: 'Help', href }]), faqLd(HQ.flatMap(([, , qs]) => qs.map(([q, ans]) => ({ q, a: ans.replace(/<[^>]+>/g, '') }))))],
    body: `${pageHero({ eyebrow: 'POCUS logbook', title: 'Logbook help.', lede: 'How to use the Wavelength app, one task at a time, and answers to the questions trainees and supervisors ask.', crumbs: [{ label: 'POCUS logbook', href: '/pocus-logbook/' }, { label: 'Help' }] })}
<section class="section"><div class="wrap guide-wrap"><nav class="guide-toc reveal" aria-label="Contents"><p class="eyebrow">Contents</p><ol>${H.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>
<article class="prose post reveal">${H.map(([id, t, body]) => `<h2 id="${id}">${t}</h2>${body}`).join('\n')}</article></div></section>`,
  });
}

// Legal pages
const legal = {
  '/privacy/': {
    title: 'Privacy notice',
    updated: '2026-10-19',
    body: `<p>This notice explains how ${site.company}, trading as Wavelength ("we"), collects and uses your personal data. We are the data controller for the data described here${site.registeredOffice ? `. Our registered office is ${site.registeredOffice}` : ''}${site.icoNumber ? ` and are registered with the Information Commissioner's Office under number ${site.icoNumber}` : ''}.</p>
<h2>What we collect</h2><ul><li>Your name, email address, phone number, job title, grade and workplace when you book or contact us, and your GMC, NMC or HCPC number if you choose to give it.</li><li>Your first name, email address and role when you subscribe to our newsletter.</li><li>Payment details, which Stripe processes on our behalf. We never see or store your full card number.</li><li>Dietary or access requirements you choose to tell us, so we can run the day safely.</li><li>Your name, contact details, role, organisation and availability when you volunteer as a scanning model.</li><li>Your title, name, email address, role and workplace when you register for Wavelength Academy, with your assessment answers, scores, certificates and any feedback you give.</li><li>If you use the Wavelength app: your account details, a securely hashed password, the pathways and targets you choose, the written entries in your scan logbook, and supervisor sign-offs (the supervisor's name, role, any registration number, email and signature they give).</li></ul>
<h2>Why we use it</h2><ul><li>To manage your booking, send joining instructions and issue your certificate (contract).</li><li>To keep financial records as the law requires (legal obligation).</li><li>To send you our newsletter, where you have subscribed (consent).</li><li>To arrange volunteer scanning sessions, where you have signed up as a volunteer.</li><li>To run Wavelength Academy: mark your assessments, and issue, email and verify your certificates (contract, providing the learning you signed up for).</li><li>To tell delegates who have booked with us about similar future courses, unless they opted out when booking or later (our legitimate interests, under the soft opt-in rule in the Privacy and Electronic Communications Regulations).</li></ul>
<h2>Our newsletter</h2><p>When you subscribe, we send you an email asking you to confirm. We add you to the list only after you click the confirmation link. Each newsletter carries an unsubscribe link, and you can also unsubscribe by emailing <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>. We use your role to send you content relevant to your practice. Our newsletter service records whether you open an email and which links you click, so we can see which content helps clinicians most. We never sell or share your details for others' marketing.</p>
<h2>Volunteer scanning models</h2><p>We use volunteers' details to arrange scanning sessions on our courses (our legitimate interests in running the course, and your agreement to take part). We do not ask for health information. Scans on our courses are for teaching, not diagnosis. If faculty notice something unexpected, they tell you privately and advise you to see your GP, and we do not record it. We keep volunteer details for up to two years after your last session, or until you ask us to delete them.</p>
<h2>Tailored training enquiries</h2><p>If you ask about tailored training, we store your name, contact details, professional role, who the training is for, any organisation, your country and preferred location, the training and modules you are interested in, participant numbers, preferred dates, any budget range and how you heard about us, with the details you write. If you arrived from a link in one of our posts or emails, we also store that link's campaign label (for example 2026-11-flagship-film), which says nothing about you. We use them only to answer your enquiry, prepare a proposal and plan any training you book, and to see which of our activities lead to enquiries (legitimate interests). We keep enquiries for two years, then delete them, unless they lead to a booking, when we keep them with our booking records.</p><h2>Faculty applications</h2><p>If you apply to teach with us, we store your name, contact details, professional registration number if you give it, and the ultrasound experience and credentials you describe. We use them only to consider your application and contact you about faculty work (legitimate interests). We keep applications for two years, then delete them, unless you join the faculty or ask us to delete them sooner.</p>
<h2>Wavelength Academy</h2><p>Registration for Academy modules is free. Joining our newsletter is optional: tick the box if you want it, and leave at any time without losing access to your certificates. We email your certificate through Zoho ZeptoMail when you pass. Each certificate carries a code. Anyone who has the code, such as an employer or appraiser you share it with, can see the name, module, CPD hours and date on our verification page. Your score stays private to you. We keep Academy records for six years after your last activity, so certificates stay verifiable, unless you ask us to delete them sooner.</p>
<h2>Wavelength app and logbook</h2><p>We store your account and the written entries in your logbook so they sync between your devices and your supervisor can sign them off (contract, providing the service you signed up for). <b>We never see your scan photos.</b> They stay on your device and in backup files you save to your own storage, such as iCloud Drive, Google Drive or OneDrive, which you control. If you choose to include images or short clips (up to 10 seconds, with sound removed) in a sign-off link, your phone encrypts them before upload and the key travels only inside the link, so we store files we cannot open. We hold them only until your supervisor signs, you cancel the request or 14 days pass, whichever comes first, then delete them. Our basis is legitimate interests: making remote sign-off reliable. We assessed this feature in a data protection impact assessment. The logbook must not contain patient-identifiable information. You are responsible for what you enter and photograph, as set out in the <a class="text-link" href="/app-terms/">logbook terms of use</a>. When a supervisor completes a sign-off link, we email you the number of scans signed or queried and the sign-off code, never findings, unless you turn these emails off in the app. When a supervisor signs off scans, we keep their details with the sign-off so anyone with the sign-off code can confirm it: the code shows the learner's name, supervisor's name and role, the date and the scan types and dates, never findings or images. When you choose to add a verified summary to an export, we store a snapshot of your progress (your name, grade or role, organisation, the period, scan counts per pathway and module, supervised and signed-off counts, and sign-off codes) so anyone with its code can check it. It holds no findings, reflections or images. You can withdraw a summary in the app at any time, after which its code shows as withdrawn. We keep logbook data while your account is open. When an assessor completes a structured assessment for you, we keep the assessment (pathway module, type, domain ratings, outcome, written feedback, the assessor's name, role, stated accreditation and signature) so it counts towards your targets and anyone with its code can confirm the type, outcome, date and assessor, never the feedback. If you link a supervisor to your account, they see your progress and the written entries in your logbook, never your photos or clips, and the sign-off and assessment requests you send them, until you or they remove the link (legitimate interests: supporting supervised training you asked for). A supervisor's ratings of image quality and diagnostic accuracy are kept with the sign-off. Short clips you record stay on your device like photos. Photos and clips you take with the camera from the Android app go straight into the app's private storage on your phone, not your gallery. Until you save a scan or discard them, the app keeps safety copies on your phone of new photos and clips (as taken, before any crop or redaction) and of what you have typed into an unfinished scan, so nothing is lost if your phone closes the app. These copies never leave your phone: they are not synced, uploaded or shared, and they are left out of your backup files and of your phone's own backup and transfer to a new phone. They are removed when you save the scan, when you discard them and when you delete your account, and never automatically otherwise: the app reminds you of unfinished items on its home screen. If you log out, they stay on the phone and show again only when the same account logs in. When you save a scan, your phone stores a fingerprint (a SHA-256 hash) of each image and clip with the written entry, never the image itself, so a sign-off covers the images your supervisor saw. A supervisor who cannot sign on a touch screen may type their name instead, and the record says it was typed. You can export it at any time and delete your account from the app, which deletes your logbook, sign-offs, assessments, supervisor links and verified summaries.</p>
<h2>Supervisor verification</h2><p>If you apply in the app to become a Wavelength Verified Supervisor, we store your application: your name and email, your professional registration (the regulator and number), your ultrasound experience in broad bands, the areas you ask to supervise, any credentials, evidence files or written explanation you give, and our decision. We use them to decide, renew and, where needed, end your approval, and to show whether a signer was approved when they signed (legitimate interests: making supervised sign-off trustworthy for learners, their supervisors and the bodies that review their portfolios). We check registrations by hand against each regulator's public register; we do not scrape registers or make automated decisions about you. Only the Wavelength verification team sees your evidence files, and we delete them 30 days after the decision. Applications left unfinished for 90 days are deleted. Approval lasts up to 12 months. We email you before it ends and when its status changes. Learners you supervise see your name, the areas you are approved for and whether your approval is current. Public verification pages show only whether the signer was a Wavelength Verified Supervisor, a Wavelength account holder not approved at the time, or self-declared, never registration numbers. Each sign-off and assessment keeps a record of what was true when it was signed, which does not change if your approval later ends. We keep a pseudonymised record of approval decisions for six years, a security log of administrative actions for two years and email delivery records for one year. People who sign without an approved account are recorded as they declared themselves (name, role and any registration number they type), not as checked by us.</p>
<h2>Notifications about sign-offs and requests</h2><p>When someone sends you scans or an assessment to sign in your supervisor dashboard, we email you, and once more if it is still waiting three days later. When a supervisor signs off or queries your scans, signs your assessment, declines your request or asks for more information, we email you. These emails carry names and counts only, never findings, images, reasons or notes, and a link to the right screen of the logbook. You can turn them off in the app under Me, Settings.</p><p>In the Wavelength app on Android and iPhone you can also turn on phone notifications for the same events. They are off until you turn them on. When you do, your phone gives the app a notification token, which we store with your account so we can send them; we delete it when you turn notifications off, log out on that phone or delete your account. We send them through Google Firebase Cloud Messaging, which delivers them to Android phones and, through Apple's push notification service, to iPhones. A notification shows a title and one line with names and counts only, such as "Sam Trainee sent you 2 scans to sign off", never anything about a patient. Google and Apple handle the token and the notification only to deliver it, as our processors. Our basis is your consent for phone notifications, and legitimate interests (running the logbook service you use) for the emails. We assessed this in a data protection impact assessment.</p><h2>Who we share it with</h2><p>Stripe for payments, Zoho for our email, newsletter and mailing list, Cloudflare for our website, and Google (Firebase Cloud Messaging) and Apple for phone notifications in the app, if you turn them on. Each acts under contract as our processor and protects your data. We do not sell your data.</p>
<h2>Where your data is processed</h2><p>We store your data with processors in the UK and the European Economic Area where we can. Some of them, such as Stripe and Cloudflare, also process data in the United States and other countries. Where data leaves the UK or the EEA, it is protected by the UK International Data Transfer Addendum or the EU Standard Contractual Clauses in our processors' contracts, or by the UK-US data bridge and the EU-US Data Privacy Framework where the processor is certified under them.</p>
<h2>Automated marking</h2><p>Wavelength Academy marks assessments automatically against a fixed answer key and issues a certificate when you reach the pass mark. This has no legal or similar effect on you. If you think a result is wrong, email us and a member of faculty will review it.</p>
<h2>Measuring how the website and app are used</h2><p>To improve the website and the app, we count how they are used, in aggregate only. When a page loads, your browser sends us the page address, the website that linked to it (the site name only) and any campaign tags in the link. Our server adds your country from your internet address and the broad type of device (phone, tablet or computer) from your browser, then adds one to daily totals. We store no cookies or identifiers for this, keep no record of your internet address, never recognise you on a later visit and never follow you to other websites. If you arrived from one of our tagged links, the link's campaign label is kept in your browser for that tab only, so an enquiry or booking in the same visit can be credited to the post that led to it. We do not share these figures with anyone. In the app, our server counts completed actions, such as accounts created or sign-offs completed, and records the days each account uses the app, so we can see whether people keep finding it useful; we keep those daily records for 13 months, then keep only totals, and we delete them when you delete your account. None of this ever includes scan findings, images or anything you write. Our legal basis is our legitimate interest in improving our services; for the website this relies on the exception in the Privacy and Electronic Communications Regulations for statistics that improve a website, so it needs no consent banner, but you can object at any time: <button type="button" class="btn btn-ghost small" data-measure-toggle aria-pressed="true">Turn off measurement on this device</button> <span data-measure-state class="small"></span> Your browser's Global Privacy Control or Do Not Track setting is also respected. Turning measurement off stores one setting in your browser so we can remember your choice.</p>
<h2>Course bookings and payments</h2><p>When you book through Stripe, Stripe tells our server that a payment for a course date succeeded, was refunded or was cancelled, with the amount and Stripe's own references. We record that in our booking records without your name or email address, which stay with Stripe and in our email. We use the records to count places, run the course and keep the financial records the law requires.</p>
<h2>Checking supervisor credentials</h2><p>If you ask us to verify a credential that a professional body publishes in its own directory (such as the Society for Acute Medicine's FAMUS supervisor directory or the Intensive Care Society's FUSIC directory), a member of our team looks you up in that directory by hand and records what it shows. Because a matching name is not proof of identity, we may also email the address that directory lists for you, asking you to confirm that the Wavelength account is yours; we store that address only in a scrambled (hashed) form. We never copy or republish these directories. Being listed in a body's directory, or verified by us, does not mean that body endorses Wavelength.</p>
<h2>Cookies</h2><p>This website uses no analytics, tracking or advertising cookies. The private volunteer area sets one login cookie, which it needs to work, and removes it when you log out or after 12 hours. Wavelength Academy and the Wavelength app share one login cookie to keep you signed in, for up to 180 days or until you log out. The app stores your logbook, photos and settings in your browser's storage on your device so it works offline. Academy lesson pages remember which lessons you have opened in your browser's storage, on your device only. Cloudflare, which protects this website, sets a short-lived security cookie on some visits to tell people from automated traffic. All of these are strictly necessary to run the service you ask for, so UK and EU law does not require a cookie consent banner. The measurement described above sets no cookies. If we ever add analytics or marketing cookies, we will ask for your consent first. Stripe sets its own cookies on its payment pages, under Stripe's privacy policy.</p>
<h2>How long we keep it</h2><p>Booking and attendance records for six years, to meet accounting rules and to confirm attendance for appraisal or revalidation. Newsletter details until you unsubscribe. After you unsubscribe, we keep your email address on a suppression list so we do not email you again.</p>
<h2>Your rights</h2><p>You have the right to access, correct or delete your data, to object to or restrict its use, to withdraw consent at any time, and to data portability. Email <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a>. If you are unhappy with our response, you can complain to the Information Commissioner's Office at ico.org.uk. If you live in the European Union or the European Economic Area, you can also complain to the data protection authority in your country. We reply to requests within one month.</p>`,
  },
  '/app-terms/': {
    title: 'Logbook terms of use',
    body: `<p>These terms apply to the Wavelength app and its ultrasound logbook, provided free by ${site.company}, trading as Wavelength. By creating an account you accept them.</p>
<h2>What the logbook is</h2><p>A personal record of your ultrasound practice, with progress shown against targets drawn from published curricula and guidance (RCEM, FAMUS, FUSIC, the EUSEM Core Compendium, ACEM, CPoCUS and ACEP). Targets come from each body's published documents on the date shown in the app. Curricula change, so confirm requirements with your supervisor and the accrediting body. Wavelength is independent and is not run or endorsed by RCEM, the Society for Acute Medicine, the Intensive Care Society, EUSEM, ACEM, CPoCUS, ACEP or any other body. Structured assessments recorded in the app are a record of what your assessor judged; they do not replace any assessment form your accrediting body requires. Logging a scan, meeting a target in the app or receiving a sign-off does not by itself confer competence or accreditation.</p>
<h2>No patient-identifiable information</h2><p>You must never enter or photograph patient-identifiable information, including names, dates of birth, NHS or hospital numbers, addresses, postcodes, or any detail that identifies a person alone or with other information. Before you save a photo or clip, crop or cover every identifier, in every frame of a clip. The app removes hidden file data (such as location) when it saves an image or clip, removes sound from clips, and warns you if text looks like an identifier, but these checks do not replace your own.</p>
<h2>Your responsibility</h2><p>You are responsible for everything you store, photograph, export or share from your logbook, and for following the policies of your employer on clinical photography, personal devices, removable media and information governance. Some employers require patient consent for clinical photographs or do not allow photographs of screens. Where that applies, log the scan without a photo. If you find identifiable information in your logbook, delete it at once. Wavelength accepts no liability for identifiable information that you enter, photograph, store, export or share, to the extent the law allows.</p>
<h2>Where your data lives</h2><p>Your written entries sync to your Wavelength account. Photos stay on your device and in backup files you choose to make. Unfinished photos, clips and scans are kept on your device until you save or discard them. We cannot open your photos, so we cannot recover them if you lose your device without a backup. Back up regularly.</p><h2>Sharing images and clips with your supervisor</h2><p>When you include images or clips in a sign-off link, your phone encrypts them and only the link opens them. Before sharing, you must check every image and every frame of each clip, and confirm that no patient identifier remains and that sharing follows your employer's information governance policy. Anyone holding the link sees the images and clips, so send it only to your supervisor. The encrypted files are deleted when your supervisor signs, when you cancel the request, when you delete your account, or after 14 days.</p><h2>Linked supervisors</h2><p>You choose which supervisors to link to your account. A linked supervisor sees your progress, assessments and written entries, never your photos or clips. Remove a link at any time and it ends at once. Translations of the app are for convenience; exports and certificates are in English, and the English version of these terms governs.</p>
<h2>Sign-off</h2><p>Supervisors sign off in person on your device or through a link you send. You must send links only to the supervisor concerned. Each sign-off has a code that anyone can use on our verification page to confirm who signed, when, and the scan types and dates covered. Editing a signed entry voids its sign-off. You can mark a scan as not needing sign-off. When a supervisor completes a link, we email you, and you can turn these emails off in the app.</p>
<h2>Acceptable use</h2><p>Do not misuse the service, record scans you did not perform, or forge or misrepresent a sign-off. We may suspend accounts that do.</p>
<h2>Availability and changes</h2><p>We aim to keep the app available but do not guarantee it. We may change features or these terms and will tell you of significant changes in the app. Keep your own exports.</p>
<h2>Ending your account</h2><p>Delete your account in the app at any time. This deletes your logbook entries and sign-offs from our servers. Export first if you want a copy.</p>
<h2>Contact</h2><p><a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a></p>`,
  },
  '/website-terms/': {
    title: 'Website terms of use',
    updated: '2026-10-05',
    body: `<p>These terms apply to your use of the Wavelength website, Pearls, Wavelength Academy, guides and newsletters, provided by ${site.company}, trading as Wavelength${site.companyNumber ? `, registered in England and Wales no. ${site.companyNumber}` : ''}${site.registeredOffice ? `. Registered office: ${esc(site.registeredOffice)}` : ''}. Course bookings follow our <a class="text-link" href="/terms/">booking terms</a>, the app follows the <a class="text-link" href="/app-terms/">logbook terms of use</a>, and the <a class="text-link" href="/privacy/">privacy notice</a> explains how we use personal data. Those documents apply alongside these terms. By using the site you accept them.</p>
<h2>Education, not clinical advice</h2><p>Wavelength content teaches ultrasound and related skills. It gives no advice about an individual patient and does not replace your clinical judgement, your employer's policies, local protocols or supervised training. You stay responsible for every clinical decision you make. Scan images in our graphics are illustrations, not patient scans, unless a page says otherwise.</p>
<h2>Certificates and accreditation</h2><p>Wavelength issues its own certificates. No external body accredits them. A certificate confirms you completed a named module and passed its assessment, or attended a course. It does not confirm clinical competence and does not replace sign-off by your supervisor or a professional body. Where we say a course or module is mapped to a curriculum, the body which owns that curriculum has not accredited it unless the page says so.</p>
<h2>Our content and copyright</h2><p>${site.company}, or its licensors, owns the copyright and other rights in the content of this site, including text, graphics, Pearls, Academy modules, assessments and question banks, guides, course material, software, the Wavelength name and the logo. All rights are reserved.</p>
<h2>What you are permitted to do</h2><p>You are permitted to read and use the content for your own learning, and to teach your own colleagues from it in a non-commercial setting. You are permitted to link to any page. You are permitted to keep copies of your own certificates, exports and logbook records.</p>
<h2>What you must not do</h2><p>You must not copy, republish, sell, sublicense or distribute our content without our written permission. You must not remove copyright or brand notices. You must not collect content with scraping or other automated tools, and you must not use our content to train a machine learning model. You must not misuse the site, try to gain unauthorised access, or upload harmful code. If you want to use our material in a course, publication or product, email <a class="text-link" href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a> first.</p>
<h2>Other bodies and linked sites</h2><p>We name professional bodies, societies and portfolio systems to describe curricula and requirements. Naming them does not imply their endorsement, and we use their logos only with written permission. We do not control linked sites and accept no responsibility for them.</p>
<h2>Availability and changes</h2><p>We aim to keep the site available but do not promise uninterrupted access. We update content as practice changes and we change these terms from time to time. The date at the top of this page shows the latest version. If you keep using the site after a change, you accept the new terms.</p>
<h2>Our liability</h2><p>We prepare our content with reasonable care and skill, but we do not promise it is complete or free of error, so check it against current guidance before you rely on it. We do not exclude liability for death or personal injury caused by our negligence, for fraud, or for anything the law does not allow us to exclude. Your legal rights as a consumer stay unchanged. Subject to that, we are not liable for loss of profit, loss of data, or other indirect loss arising from your use of free content.</p>
<h2>Governing law</h2><p>The law of England and Wales governs these terms, and the courts of England and Wales have jurisdiction. If you live in Scotland or Northern Ireland, you also have the right to use the courts of your home nation.</p>
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
    body: `${pageHero({ eyebrow: 'Wavelength', title: esc(l.title), lede: `Last updated ${fmtDate(l.updated || site.legalUpdated || TODAY, { day: 'numeric', month: 'long', year: 'numeric' })}.`, crumbs: [{ label: 'Home', href: '/' }, { label: l.title }] })}
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

// ---------- Translated pages (/fr/, /es/ ...) ----------
// Copy lives in data/i18n/site.<lang>.json (same keys as site.en.json). Each language gets home, app, about and contact.
// English pages with a translation carry hreflang links, and every page offers the visitor's browser language once.
{
  const I18N = path.join(ROOT, 'data/i18n');
  const LANGS = [
    ['fr', 'Français', 'fr_FR'], ['es', 'Español', 'es_ES'], ['de', 'Deutsch', 'de_DE'], ['it', 'Italiano', 'it_IT'],
    ['pl', 'Polski', 'pl_PL'], ['ar', 'العربية', 'ar_AR'], ['ru', 'Русский', 'ru_RU'], ['zh', '中文（简体）', 'zh_CN'],
  ].filter(([l]) => fs.existsSync(path.join(I18N, `site.${l}.json`)));
  const LOCAL = { '/': '', '/app/get/': 'app/', '/about/': 'about/', '/contact/': 'contact/' };
  const altsFor = (enPath) => (enPath in LOCAL ? [['en', enPath], ...LANGS.map(([l]) => [l, `/${l}/${LOCAL[enPath]}`])] : null);
  const hreflang = (alts) => alts.map(([l, p]) => `<link rel="alternate" hreflang="${l === 'zh' ? 'zh-Hans' : l}" href="${url(p)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${url(alts[0][1])}">`;
  const names = Object.fromEntries([['en', 'English'], ...LANGS.map(([l, n]) => [l, n])]);
  // Banner offering the browser's language. Labels come from each language file so the offer reads in that language.
  const offer = Object.fromEntries(LANGS.map(([l]) => { const c = JSON.parse(fs.readFileSync(path.join(I18N, `site.${l}.json`), 'utf8')).chrome; const inner = { fr: 'français', es: 'español', it: 'italiano' }[l] || names[l]; return [l, { t: c.suggest.replace('{language}', inner), go: c.suggestGo.replace('{language}', inner), x: c.dismiss, rtl: l === 'ar' }]; }));
  const offerJs = (alts) => `<script>(function(){try{var A=${JSON.stringify(Object.fromEntries((alts || LANGS.map(([l]) => [l, `/${l}/`])).filter(([l]) => l !== 'en')))},O=${JSON.stringify(offer)};var k='wl-lang-offer';if(localStorage.getItem(k))return;var ls=(navigator.languages||[navigator.language||'']).map(function(x){return String(x).slice(0,2).toLowerCase()});if(ls[0]==='en')return;var l=ls.filter(function(x){return A[x]})[0];if(!l)return;var o=O[l],d=document.createElement('div');d.className='lang-offer';d.lang=l;if(o.rtl)d.dir='rtl';d.innerHTML='<span></span><a></a><button type="button"></button>';d.children[0].textContent=o.t;d.children[1].textContent=o.go;d.children[1].href=A[l];d.children[2].textContent='×';d.children[2].setAttribute('aria-label',o.x);d.children[2].onclick=function(){try{localStorage.setItem(k,'1')}catch(e){}d.remove()};d.children[1].onclick=function(){try{localStorage.setItem(k,'1')}catch(e){}};document.body.appendChild(d)}catch(e){}})();</script>`;
  const langMenu = (alts, current, label) => `<details class="lang-menu"><summary aria-label="${esc(label)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5s-1.3 6.7-3.9 9.5c-2.6-2.8-3.9-6-3.9-9.5S9.4 5.3 12 2.5z"/></svg><span>${current === 'en' ? 'EN' : current.toUpperCase()}</span></summary><div>${alts.map(([l, p]) => `<a href="${p}" lang="${l === 'zh' ? 'zh-Hans' : l}"${l === 'ar' ? ' dir="rtl"' : ''}${l === current ? ' aria-current="true"' : ''}>${esc(names[l])}</a>`).join('')}</div></details>`;
  const allHomes = [['en', '/'], ...LANGS.map(([l]) => [l, `/${l}/`])];

  // English pages: hreflang where a translation exists, a language menu in the header and footer, and the browser-language offer.
  for (const [p, html] of Object.entries(pages)) {
    if (p.startsWith('/volunteer/') || p.startsWith('/admin/') || p.startsWith('/email/')) continue;
    const alts = altsFor(p);
    let h = html;
    if (alts && !/noindex/.test(h.slice(0, 2000))) h = h.replace('</head>', hreflang(alts) + '\n</head>');
    h = h.replace('<div class="bar-end">', `<div class="bar-end">${langMenu(alts || allHomes, 'en', 'Language')}`).replace('<a class="nav-verify"', `${langMenu(alts || allHomes, 'en', 'Language')}<a class="nav-verify"`)
      .replace('<span><a href="/privacy/">Privacy</a>', `<span class="foot-langs">${allHomes.map(([l, q]) => `<a href="${(alts || allHomes).find(([x]) => x === l)[1]}" lang="${l === 'zh' ? 'zh-Hans' : l}">${esc(names[l])}</a>`).join(' · ')}</span><span><a href="/privacy/">Privacy</a>`)
      .replace('</body>', offerJs(alts) + '\n</body>');
    pages[p] = h;
  }

  for (const [lang, , locale] of LANGS) {
    const L = JSON.parse(fs.readFileSync(path.join(I18N, `site.${lang}.json`), 'utf8'));
    const t = (sec, key) => { const v = (L[sec] || {})[key]; if (v == null) throw new Error(`site.${lang}.json missing ${sec}.${key}`); return v; };
    const c = (k) => t('chrome', k);
    const base = `/${lang}/`;
    const hl = lang === 'zh' ? 'zh-Hans' : lang;
    const rtl = lang === 'ar';
    const appHref = `/app/?lang=${lang}`;
    const page = (enPath, { title, description, body, jsonld = [] }) => {
      const pathname = base + LOCAL[enPath];
      const alts = altsFor(enPath);
      const fullTitle = brandTitle(title);
      const nav = [[`${base}app/`, c('app')], [`${base}about/`, c('about')], [`${base}contact/`, c('contact')]];
      const ld = [{ '@context': 'https://schema.org', '@type': 'EducationalOrganization', '@id': url('/#org'), name: site.name, url: url('/') }, { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: url(pathname), inLanguage: hl }, ...jsonld];
      return `<!doctype html>
<html lang="${hl}"${rtl ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url(pathname)}">
${hreflang(alts)}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0A1526">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${site.name}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url(pathname)}">
<meta property="og:image" content="${url('/assets/og.png')}">
<meta property="og:locale" content="${locale}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="${enPath === '/app/get/' ? '/app/manifest.webmanifest' : '/site.webmanifest'}">
<link rel="stylesheet" href="/assets/style.css?v=${BUILD}">
<script>document.documentElement.classList.add('js');setTimeout(function(){if(!window.__wl)document.documentElement.classList.remove('js')},2500)</script>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body class="l10n">
<a class="skip" href="#main">${esc(c('skip'))}</a>
<header class="site-header" data-theme="dark">
  <div class="wrap bar">
    <a class="brand" href="${base}" aria-label="${site.name}" dir="ltr">${mark()}<span class="wm"><b>WAVELENGTH</b><small>TUNE IN · GAIN CLARITY</small></span></a>
    <nav class="nav" aria-label="${esc(c('menu'))}">${langMenu(alts, lang, c('language'))}${nav.map(([h, l]) => `<a href="${h}"${h === pathname ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('')}<a class="nav-verify" href="/verify/" title="${esc(c('verifyTitle'))}">${esc(c('verify'))}</a><a class="btn" href="${base}app/">${esc(c('getApp'))}</a></nav>
    <div class="bar-end">${langMenu(alts, lang, c('language'))}<a class="btn bar-book" href="${base}app/">${esc(c('getApp'))}</a><button class="menu-toggle" type="button" aria-label="${esc(c('menu'))}" aria-expanded="false" aria-controls="mobile-menu"><span></span></button></div>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" aria-hidden="true">
  <a href="${base}">${esc(c('home'))}</a>${nav.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}
  <a href="/verify/">${esc(c('verifyTitle'))}</a>
  <a href="/" lang="en">${esc(c('englishSite'))}</a>
  <a class="btn btn-teal" href="${base}app/">${esc(c('getApp'))} ${arrow}</a>
</div>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="top">
      <div>
        <a class="brand" href="${base}" aria-label="${site.name}" dir="ltr">${mark({ ring: '#F7F5F0' })}<span class="wm"><b>WAVELENGTH</b><small>TUNE IN · GAIN CLARITY</small></span></a>
        <p class="foot-tag">${esc(c('footerTag'))}</p>
      </div>
      <div><h2>Wavelength</h2><ul>${nav.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}<li><a href="/verify/">${esc(c('verifyTitle'))}</a></li><li><a href="/" lang="en">${esc(c('englishSite'))}</a></li></ul></div>
      <div><h2>${esc(c('contact'))}</h2><ul><li><a href="mailto:${site.enquiriesEmail}">${site.enquiriesEmail}</a></li></ul>${socialIcons()}</div>
    </div>
    <div class="bottom">
      <span>${esc(c('company').replace('{year}', new Date().getFullYear()))} ${esc(c('independence'))} ${esc(c('footerLegal'))}</span>
      <span class="foot-langs">${alts.map(([l, q]) => `<a href="${q}" lang="${l === 'zh' ? 'zh-Hans' : l}">${esc(names[l])}</a>`).join(' · ')}</span>
      <span><a href="/privacy/" lang="en">${esc(c('privacy'))}</a> · <a href="/app-terms/" lang="en">${esc(c('appTerms'))}</a> (${esc(c('inEnglish'))})</span>
    </div>
  </div>
</footer>
<script src="/assets/main.js?v=${BUILD}" defer></script>
</body>
</html>`;
    };
    const ctas = `<div class="hero-ctas rise"><a class="btn btn-teal" href="${base}app/">${esc(t('home', 'ctaApp'))} ${arrow}</a><a class="btn btn-ghost light" href="${appHref}">${esc(t('home', 'ctaBrowser'))}</a></div>`;
    const pill = (num, h, p, href, link, d = 0) => `<a class="pillar reveal" data-d="${d}" href="${href}" style="text-decoration:none;color:inherit"${href.startsWith(base) ? '' : ' hreflang="en"'}><div class="num">${num}</div><h3>${esc(h)}</h3><p>${esc(p)}</p><span class="text-link">${esc(link)}</span></a>`;
    const PATHS = [['RCEM', 'pathRcem'], ['FAMUS', 'pathFamus'], ['FUSIC', 'pathFusic'], ['EUSEM', 'pathEusem'], ['ACEM', 'pathAcem'], ['CPoCUS', 'pathCpocus'], ['ACEP', 'pathAcep'], ['', 'pathGeneral']];
    const d = site.director;
    pages[base] = page('/', {
      title: t('home', 'seoTitle'),
      description: t('home', 'description'),
      body: `<section class="hero on-dark">${mesh}
  <canvas class="waves" aria-hidden="true"></canvas>
  <div class="wrap hero-inner">
    <div class="rise">${mark({ size: 96, cls: 'hero-mark', draw: true, ring: '#F7F5F0' })}</div>
    <p class="eyebrow rise">${esc(t('home', 'eyebrow'))}</p>
    <h1 class="split-words">${t('home', 'title')}</h1>
    <p class="lede rise">${esc(t('home', 'lede'))}</p>
    ${ctas}
    <div class="hero-meta rise">${[['metaPathways', 'metaPathwaysText'], ['metaLanguages', 'metaLanguagesText'], ['metaPrivacy', 'metaPrivacyText'], ['metaFree', 'metaFreeText']].map(([a, b]) => `<div><b>${esc(t('home', a))}</b>${esc(t('home', b))}</div>`).join('')}</div>
  </div>
</section>
<section class="section sand"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">${esc(t('home', 'waysEyebrow'))}</p><h2 class="reveal" data-d="1">${esc(t('home', 'waysTitle'))}</h2></div>
  <div class="pillars l-ways">
    ${pill('01', t('home', 'wayApp'), t('home', 'wayAppText'), `${base}app/`, t('home', 'wayAppLink'))}
    ${posts.length ? pill('02', t('home', 'wayPearls'), t('home', 'wayPearlsText'), '/learn/', t('home', 'wayPearlsLink'), 1) : ''}
    ${liveModules.length ? pill('03', t('home', 'wayAcademy'), t('home', 'wayAcademyText'), '/elearning/', t('home', 'wayAcademyLink'), 2) : ''}
    ${pill('04', t('home', 'wayCourses'), t('home', 'wayCoursesText'), '/courses/', t('home', 'wayCoursesLink'), 3)}
  </div>
</div></section>
<section class="section" id="tailored"><div class="wrap split">
  <div><p class="eyebrow reveal">${esc(t('home', 'tailoredEyebrow'))}</p><h2 class="display reveal" data-d="1" style="font-size:clamp(34px,4.4vw,54px);margin-top:20px">${esc(t('home', 'tailoredTitle'))}</h2></div>
  <div class="reveal" data-d="2"><p class="lede">${esc(t('home', 'tailoredText'))}</p><p class="small" style="color:var(--slate);margin-top:10px">${esc(t('home', 'tailoredLanguage'))}</p>
    <div class="hero-ctas" style="margin-top:22px"><a class="btn btn-teal cta-caps" href="/training/" hreflang="en" data-m="intl-home-tailored">${esc(t('home', 'tailoredLink'))} ${arrow}</a><a class="btn btn-ghost cta-caps" href="/courses/" hreflang="en" data-m="intl-home-courses">${esc(t('home', 'tailoredCourses'))}</a></div></div>
</div></section>
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">${esc(t('home', 'pathEyebrow'))}</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">${esc(t('home', 'pathTitle'))}</h2><p class="reveal" data-d="2" style="color:var(--slate);margin-top:20px">${esc(t('home', 'pathIntro'))}</p></div>
  <ul class="l-paths reveal" data-d="2">${PATHS.map(([a, k]) => `<li>${a ? `<b dir="ltr">${a}</b>` : `<b>+</b>`}<span>${esc(t('home', k))}</span></li>`).join('')}</ul>
</div></section>
<section class="section sand"><div class="wrap"><div class="director">
  <div class="portrait reveal has-photo"><img src="${ver(d.photo)}" alt="${esc(d.name)}" width="840" height="1050" loading="lazy" decoding="async"><span class="cap">${esc(t('home', 'directorEyebrow'))}</span></div>
  <div><p class="eyebrow reveal">${esc(t('home', 'directorEyebrow'))}</p><h2 class="reveal" data-d="1" dir="ltr">${esc(d.name)}</h2><p class="reveal" data-d="2">${esc(t('home', 'directorText'))}</p><p class="reveal" data-d="2" style="margin-top:20px"><a class="text-link" href="${base}about/">${esc(t('home', 'directorLink'))}</a></p></div>
</div></div></section>
<section class="section on-dark l-cta" style="background:var(--navy)"><div class="wrap"><h2 class="display reveal" style="color:var(--cream);font-size:clamp(38px,5vw,64px)">${esc(t('home', 'ctaTitle'))}</h2><p class="reveal" data-d="1" style="color:#B9C4D0;margin-top:14px">${esc(t('home', 'ctaText'))}</p>${ctas}</div></section>`,
    });

    const feats = [1, 2, 3, 4, 5, 6].map((n, i) => `<div class="pillar reveal" data-d="${i % 3}"><div class="num">0${n}</div><h3>${esc(t('app', 'f' + n))}</h3><p>${esc(t('app', `f${n}Text`))}</p></div>`).join('');
    const faqs = [1, 2, 3, 4, 5, 6].map((n) => ({ q: t('app', 'q' + n), a: t('app', 'a' + n) }));
    pages[`${base}app/`] = page('/app/get/', {
      title: t('app', 'seoTitle'),
      description: t('app', 'description'),
      jsonld: [faqLd(faqs), { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Wavelength', applicationCategory: 'MedicalApplication', operatingSystem: 'iOS, Android, web', inLanguage: hl, offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' }, url: url(`${base}app/`) }],
      body: `<section class="hero on-dark">${mesh}<div class="wrap hero-inner">
  <p class="eyebrow rise">${esc(t('app', 'eyebrow'))}</p>
  <h1 class="split-words">${t('app', 'title')}</h1>
  <p class="lede rise">${esc(t('app', 'lede'))}</p>
  <div class="hero-ctas rise app-ctas">
    <button class="app-dl" type="button" data-app-install data-app-href="${appHref}"><span class="app-dl-ico">${mark({ size: 30, ring: '#7FC4CC' })}</span><span><small>${esc(t('app', 'dlSmall'))}</small><b>${esc(t('app', 'dlButton'))}</b></span></button>
    <a class="btn btn-ghost light" href="${appHref}">${esc(t('app', 'browser'))}</a>
  </div>
  <div class="app-ios rise" data-app-ios hidden>${t('app', 'ios')}</div>
</div></section>
<section class="section sand"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">${esc(t('app', 'featEyebrow'))}</p><h2 class="reveal" data-d="1">${esc(t('app', 'featTitle'))}</h2></div>
  <div class="pillars app-pillars">${feats}</div>
</div></section>
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">${esc(t('app', 'privEyebrow'))}</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">${esc(t('app', 'privTitle'))}</h2></div>
  <div class="reveal" data-d="2"><p class="lede">${esc(t('app', 'privText'))}</p><p class="eyebrow" style="margin-top:36px">${esc(t('app', 'langEyebrow'))}</p><p style="color:var(--slate);margin-top:12px">${esc(t('app', 'langText'))}</p></div>
</div></section>
<section class="section sand"><div class="wrap split">
  <div><p class="eyebrow reveal">${esc(t('app', 'faqEyebrow'))}</p><h2 class="display reveal" data-d="1" style="font-size:clamp(38px,5vw,64px);margin-top:20px">${esc(t('app', 'faqTitle'))}</h2></div>
  ${faqHtml(faqs)}
</div></section>
<section class="section on-dark l-cta" style="background:var(--navy)"><div class="wrap"><h2 class="display reveal" style="color:var(--cream);font-size:clamp(38px,5vw,64px)">${esc(t('home', 'ctaTitle'))}</h2><p class="reveal" data-d="1" style="color:#B9C4D0;margin-top:14px">${esc(t('home', 'ctaText'))}</p>${ctas}</div></section>`,
    }).replace('</body>', `${APP_INSTALL_JS}\n</body>`);

    const zahra = (site.team || []).find((x) => /Zahra/.test(x.name));
    const person = (p, role, text) => `<div class="l-person reveal">${p.photo ? `<img src="${ver(p.photo)}" alt="${esc(p.name)}" width="840" height="1050" loading="lazy" decoding="async">` : ''}<div><h3 dir="ltr">${esc(p.name)}</h3><p class="role">${esc(role)}</p><p>${esc(text)}</p></div></div>`;
    pages[`${base}about/`] = page('/about/', {
      title: t('about', 'seoTitle'),
      description: t('about', 'description'),
      body: `${pageHero({ eyebrow: t('about', 'eyebrow'), title: t('about', 'title') })}
<section class="section"><div class="wrap split">
  <div><p class="eyebrow reveal">${esc(t('about', 'approachEyebrow'))}</p><h2 class="statement reveal" data-d="1" style="margin-top:22px">${t('about', 'approachTitle')}</h2></div>
  <div class="reveal" data-d="2"><p class="lede">${esc(t('about', 'lede'))}</p>${['p1', 'p2', 'p3'].map((k) => `<p class="lede">${esc(t('about', k))}</p>`).join('')}</div>
</div></section>
<section class="section sand"><div class="wrap">
  <div class="section-head"><p class="eyebrow reveal">${esc(t('about', 'teamEyebrow'))}</p></div>
  <div class="l-team">${person(d, t('about', 'firasRole'), t('about', 'firas'))}${zahra ? person(zahra, t('about', 'zahraRole'), t('about', 'zahra')) : ''}</div>
  <p class="reveal" style="color:var(--slate);margin-top:36px;max-width:760px">${esc(t('about', 'companyText'))}</p>
</div></section>`,
    });

    pages[`${base}contact/`] = page('/contact/', {
      title: t('contact', 'seoTitle'),
      description: t('contact', 'description'),
      body: `${pageHero({ eyebrow: t('contact', 'eyebrow'), title: esc(t('contact', 'title')), lede: esc(t('contact', 'lede')) })}
<section class="section"><div class="wrap">
  <div class="contact-grid">
    <a class="contact-card reveal" href="mailto:${site.enquiriesEmail}"><p class="eyebrow">${esc(t('contact', 'general'))}</p><h2 dir="ltr">${site.enquiriesEmail}</h2><p>${esc(t('contact', 'generalText'))}</p><span class="text-link">${esc(t('contact', 'emailUs'))}</span></a>
    <a class="contact-card reveal" data-d="1" href="mailto:${site.bookingsEmail}"><p class="eyebrow">${esc(t('contact', 'bookings'))}</p><h2 dir="ltr">${site.bookingsEmail}</h2><p>${esc(t('contact', 'bookingsText'))}</p><span class="text-link">${esc(t('contact', 'emailUs'))}</span></a>
  </div>
  <div class="empty-dates reveal" style="margin-top:40px"><div><h3>${esc(t('contact', 'deptTitle'))}</h3><p>${esc(t('contact', 'deptText'))}</p></div><a class="btn btn-teal" href="${mailto(site.enquiriesEmail, 'Ultrasound training')}">${esc(t('contact', 'deptCta'))} ${arrow}</a></div>
</div></section>`,
    });
  }
}

// ---------- Image dimensions ----------
// Markdown images (pearl and lesson graphics) get width and height from the file, so the browser reserves the
// space before the image loads and the text below does not jump (Cumulative Layout Shift).
const imageSizes = {};
function imageSize(file) {
  if (file in imageSizes) return imageSizes[file];
  let size = null;
  try {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 1, 4) === 'PNG') size = [b.readUInt32BE(16), b.readUInt32BE(20)];
    else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = b.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') size = [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
      else if (chunk === 'VP8L') { const n = b.readUInt32LE(21); size = [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
      else if (chunk === 'VP8X') size = [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { size = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { size = null; }
  return (imageSizes[file] = size && size[0] && size[1] ? size : null);
}
const sizeImages = (html) => html.replace(/<img src="\/learn\/images\/([^"?#]+)"(?![^>]*\swidth=)/g, (tag, f) => {
  const size = imageSize(path.join(LEARN_DIR, 'images', decodeURIComponent(f)));
  return size ? `${tag} width="${size[0]}" height="${size[1]}"` : tag;
});

// ---------- Write output ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const [p, html] of Object.entries(pages)) {
  const dir = path.join(DIST, p);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), sizeImages(html));
}
fs.writeFileSync(path.join(DIST, '404.html'), notFound);
// Business measurement (worker/metrics.js, worker/business.js): the public page list (anything else is counted as
// "(other)", so the counters cannot be filled with made-up paths) and each course date's capacity, price and Stripe
// link. Committed with content changes, like worker/academy-data.json. Deterministic: no build id or date.
fs.writeFileSync(path.join(ROOT, 'worker/site-data.json'), JSON.stringify({
  paths: Object.keys(pages).filter((p) => !p.startsWith('/admin/') && !p.startsWith('/volunteer/') && !p.startsWith('/email/')).sort(),
  courses: courses.map((c) => ({ slug: c.slug, title: c.title, status: c.status || 'open', price: c.price ?? null, dates: (c.dates || []).map((d) => ({ date: d.date, venue: d.venue || '', city: d.city || '', capacity: d.capacity ?? null, price: d.price ?? c.price ?? null, stripeLink: d.stripeLink || '', stripePaymentLink: d.stripePaymentLink || '' })) })),
}, null, 1) + '\n');

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
  const { _help, _help_destinations, _help_supervisionAreas, ...lb } = logbook;
  const nl = site.newsletter && site.newsletter.action ? { action: site.newsletter.action, hidden: site.newsletter.hidden, emailField: site.newsletter.emailField, firstNameField: site.newsletter.firstNameField, roleField: site.newsletter.roleField } : null;
  fs.writeFileSync(path.join(DIST, 'app/config.js'), `window.WL_BUILD = ${JSON.stringify(BUILD)};\nwindow.WL_LOGBOOK = ${JSON.stringify({ ...lb, courses: appCourses, newsletter: nl })};\n`);
  const appDir = path.join(DIST, 'app');
  // Translations: src/app/i18n/<lang>.json (English text as the key) becomes dist/app/i18n/<lang>.js for the app and supervisor pages.
  const i18nDir = path.join(ROOT, 'src/app/i18n');
  if (fs.existsSync(i18nDir)) {
    for (const f of fs.readdirSync(i18nDir).filter((x) => x.endsWith('.json'))) {
      const dict = JSON.parse(fs.readFileSync(path.join(i18nDir, f), 'utf8'));
      delete dict._meta;
      fs.writeFileSync(path.join(appDir, 'i18n', f.replace('.json', '.js')), `window.WL_I18N = ${JSON.stringify(dict)};\n`);
      fs.rmSync(path.join(appDir, 'i18n', f), { force: true });
    }
  }
  // 1.0.12: the accreditation guides inside the app, from the same Markdown as /guides/ (one source, so the app and the
  // website cannot drift apart). Live guides only. Each carries its review dates, a hash of its source text, its
  // contents and the official sources listed at its foot. The app loads this file only when Guides is opened, and keeps
  // it offline with the rest of the app.
  {
    const crypto = require('crypto');
    const srcOf = (g) => fs.readdirSync(GUIDES_DIR).find((f) => f.endsWith('.md') && (md.parse(fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8')).meta.slug || f.replace(/\.md$/, '')) === g.slug);
    const appGuides = liveGuides.map((g) => {
      const file = srcOf(g), raw = file ? fs.readFileSync(path.join(GUIDES_DIR, file), 'utf8') : '';
      const at = g.html.indexOf('<h2 id="sources">');
      const sources = at < 0 ? [] : [...g.html.slice(at).matchAll(/<a class="text-link" href="(https?:[^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => ({ url: m[1], label: m[2].replace(/<[^>]+>/g, '') }));
      const gl = glanceFor(g);
      return { slug: g.slug, title: g.title, short: g.short || g.title, eyebrow: g.eyebrow || '', summary: g.summary || '', pathway: g.pathway || 'all', order: g.order, date: g.date, reviewed: g.reviewed ? String(g.reviewed) : null, updated: g.updated ? String(g.updated) : null, author: g.author || '', hash: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16), toc: g.toc, html: g.html, sources, glance: gl ? { html: gl.html, hash: gl.hash } : null };
    });
    fs.writeFileSync(path.join(DIST, 'app/guides.js'), `window.WL_GUIDES = ${JSON.stringify({ build: BUILD, built: new Date().toISOString().slice(0, 10), guides: appGuides })};\n`);
  }
  const files = ['index.html', 'sw.js', 'sign/index.html', 'verify/index.html', 'assess/index.html'];
  for (const f of files) { const p = path.join(appDir, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/__V__/g, BUILD)); }
}

// Permanent redirects from the original Pearl URLs (file names) to the search-friendly slugs.
// Drafts are included so links in drafted newsletters keep working once they go live.
{
  const all = fs.readdirSync(LEARN_DIR).filter((f) => f.endsWith('.md')).map((f) => md.parse(fs.readFileSync(path.join(LEARN_DIR, f), 'utf8')).meta.slug ? { from: f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}(-\d{2})?-/, ''), to: md.parse(fs.readFileSync(path.join(LEARN_DIR, f), 'utf8')).meta.slug } : null).filter((r) => r && r.from !== r.to);
    // Short, memorable paths people type or were given, pointing at the one page that serves that search.
  const SHORT = [['/pearls', '/learn/'], ['/pocus-accreditation', '/guides/pocus-accreditation/'], ['/ultrasound-portfolio', '/pocus-logbook/']].filter(([, to]) => to in pages);
  fs.writeFileSync(path.join(DIST, '_redirects'), all.flatMap((r) => [`/learn/${r.from}/ /learn/${r.to}/ 301`, `/learn/${r.from}/test/ /learn/${r.to}/test/ 301`, `/learn/${r.from} /learn/${r.to}/ 301`]).concat(SHORT.flatMap(([from, to]) => [`${from} ${to} 301`, `${from}/ ${to} 301`])).join('\n') + '\n');
}
// Last-modified dates for the sitemap: pearls use their review or publication date, Academy modules their publication date.
const LASTMOD = {};
for (const p of posts) LASTMOD[`/learn/${p.slug}/`] = p.reviewed || p.date;
for (const m of liveModules) if (m.published) LASTMOD[`/elearning/${m.slug}/`] = String(m.published).slice(0, 10);
for (const g of liveGuides) LASTMOD[`/guides/${g.slug}/`] = [g.reviewed || g.date, g.updated].filter(Boolean).map(String).sort().pop();
if (pages['/pocus-logbook/']) LASTMOD['/pocus-logbook/'] = [pathwaysChecked, '2026-10-05'].filter(Boolean).sort().pop();
if (liveGuides.length) LASTMOD['/guides/'] = liveGuides.map((g) => LASTMOD[`/guides/${g.slug}/`]).sort().pop();
if (posts.length) LASTMOD['/learn/'] = posts.map((p) => p.date).sort().pop();
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /email/\nDisallow: /subscribe/thanks/\nDisallow: /app/sign/\nDisallow: /app/assess/\nAllow: /app/get/\n\nSitemap: ${url('/sitemap.xml')}\n`);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(pages)
    .filter((p) => !p.includes('/thanks/') && p !== '/booked/' && !p.startsWith('/volunteer/') && !p.startsWith('/admin/') && !/^\/elearning\/[^/]+\/(learn|assessment)\//.test(p) && !['/elearning/certificate/', '/elearning/account/'].includes(p) && !(p === '/elearning/' && !liveModules.length) && !modules.some((m) => m.draft === true && p.startsWith(`/elearning/${m.slug}/`)) && !(p === '/learn/' && !posts.some((x) => x.draft !== true)) && !(posts.find((x) => (p === `/learn/${x.slug}/` || p === `/learn/${x.slug}/test/`) && x.draft === true)) && !(p === '/learn/test/' && !posts.some((x) => x.draft !== true && x.questions.length)))
    .filter((p) => !/^\/learn\/[^/]+\/test\/$/.test(p) && !['/verify/', '/elearning/verify/'].includes(p))
    .filter((p) => !(p === '/guides/' && !liveGuides.length) && !guides.some((g) => g.draft === true && p.startsWith(`/guides/${g.slug}/`)))
    // Utility pages that should stay reachable but are not search landing pages. One-page guides are noindex: the full guide ranks.
    .filter((p) => !['/app/delete-account/'].includes(p) && !/^\/guides\/[^/]+\/at-a-glance\/$/.test(p))
    .map((p) => `  <url><loc>${url(p)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(LASTMOD[p] || '') ? `<lastmod>${LASTMOD[p]}</lastmod>` : ''}<priority>${p === '/' ? '1.0' : p.startsWith('/courses/') || p === '/pocus-logbook/' ? '0.9' : p.startsWith('/guides/') ? '0.8' : ['/privacy/', '/website-terms/', '/terms/', '/cancellation/'].includes(p) ? '0.3' : '0.7'}</priority></url>`)
    .join('\n')}\n</urlset>\n`
);
fs.writeFileSync(path.join(DIST, 'site.webmanifest'), JSON.stringify({ name: site.name, short_name: site.name, start_url: '/', icons: [{ src: '/assets/logo-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/logo-512.png', sizes: '512x512', type: 'image/png' }], theme_color: '#0A1526', background_color: '#0A1526', display: 'standalone' }));
fs.writeFileSync(
  path.join(DIST, '_headers'),
  `/assets/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=86400\n/assets/guides/*\n  X-Robots-Tag: noindex\n/app/sw.js\n  Cache-Control: no-cache\n/app/\n  Cache-Control: no-cache\n/app/vendor/*\n  Cache-Control: public, max-age=2592000\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n`
);
console.log(`Built ${Object.keys(pages).length} pages to dist/`);
