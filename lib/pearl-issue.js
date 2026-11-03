// Weekly Pearl newsletter issues (November 2026). One email page per queued pearl in data/pearl-issues.json, built
// from the template src/email/pearl/index.html. It keeps every fixed block of the template (course strip, course, app,
// departments, Academy and teach blocks, footer) and rewrites only the pearl-specific parts: title, preheader, opening,
// image, the pearl line, the first question and its four answers, links and utm tags. The answer order comes from the
// built test page (dist/learn/<slug>/test/), so the build calls buildQueue after the test pages are written.
//
// The build writes dist/email/pearl/<slug>/index.html for every queued pearl and dist/email/pearl/queue.json (order,
// subject, preheader, ready). The Worker's Tuesday cron (worker/newsletter.js) sends the first ready issue in the queue
// that D1 newsletter_sends does not show as sent, so no weekly commit or Monday job is needed.
const fs = require('fs');
const path = require('path');

const SITE = 'https://thewavelength.co.uk';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// The first question as the built test page shows it (options in their shuffled order).
function readQuestion(testHtml) {
  const q1 = testHtml.slice(testHtml.indexOf('id="q1"'), testHtml.indexOf('id="q2"'));
  const qText = unesc((q1.match(/<span class="quiz-n">Question 1<\/span>([\s\S]*?)<\/p>/) || [])[1] || '');
  const opts = [...q1.matchAll(/<button type="button" class="quiz-opt"( data-correct)?><span class="quiz-l">([a-d])<\/span><span>([\s\S]*?)<\/span><\/button>/g)].map((m) => ({ letter: m[2], text: unesc(m[3]), correct: !!m[1] }));
  if (!qText || opts.length !== 4 || opts.filter((o) => o.correct).length !== 1 || opts.map((o) => o.letter).join('') !== 'abcd') {
    throw new Error('Could not read question 1 from the built test page');
  }
  return { qText, opts };
}

// The template rewritten for one queue entry `it` (data/pearl-issues.json) and its first question `q` (readQuestion).
// opts.academy: { slug, short, lesson } from academyFor.
function renderIssue(template, it, q, opts = {}) {
  const slug = it.slug;
  const month = new Date(it.send + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const camp = `pearl-${it.key}`;
  const utm = `utm_source=newsletter&utm_medium=email&utm_campaign=${camp}`;
  const pearlUrl = `${SITE}/learn/${slug}/?${utm}`;
  const testUrl = (x) => `${SITE}/learn/${slug}/test/?${x ? x + '&' : ''}${utm}`;
  let h = template;
  const rep = (re, fn, what) => { const n = (h.match(re) || []).length; if (!n) throw new Error('Template part not found: ' + what); h = h.replace(re, fn); return n; };

  rep(/<title>Wavelength Pearl newsletter: [^<]*<\/title>/, () => `<title>Wavelength Pearl newsletter: ${esc(it.short)}</title>`, 'title');
  rep(/(<!-- Preheader --><div[^>]*>)[^&<]*(&#8199;)/, (m, a, b) => a + esc(it.preheader) + b, 'preheader');
  rep(/<!-- Wavelength Pearl issue \([^)]*\)\./, () => `<!-- Wavelength Pearl issue (${esc(it.short)}).`, 'issue comment');
  rep(/(>Wavelength Pearl · )[A-Za-z]+ \d{4}(<\/p>)/, (m, a, b) => a + month + b, 'month');
  rep(/(<h1 class="h1"[^>]*>)[^<]*(<\/h1>)/, (m, a, b) => a + esc(it.subject) + b, 'heading');
  rep(/(<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#33404F;">Hello,<\/p>\s*<p style="margin:0;font-size:16px;line-height:1.6;color:#33404F;">)[^<]*(<\/p>)/, (m, a, b) => a + esc(it.intro) + b, 'opening');
  // Every link to the old pearl and its test, and the image.
  rep(/https:\/\/thewavelength\.co\.uk\/learn\/[a-z0-9-]+\/\?utm_source=newsletter&utm_medium=email&utm_campaign=pearl-[a-z0-9-]+/g, () => pearlUrl, 'pearl links');
  rep(/(<img src=")https:\/\/thewavelength\.co\.uk\/assets\/email\/pearl-[a-z0-9-]+\.jpg(" width="504" alt=")[^"]*(")/, (m, a, b, c) => `${a}${SITE}/assets/email/${camp}.jpg${b}${esc(it.alt)}${c}`, 'image');
  rep(/(<p style="margin:0 0 6px 0;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#1F6670;">The pearl<\/p>\s*<p style="margin:0;font-size:16px;line-height:1.55;color:#0F1E33;">)[^<]*(<\/p>)/, (m, a, b) => a + esc(it.pearl) + b, 'pearl line');
  rep(/(Can you answer this\?<\/p>\s*<h2[^>]*>)[^<]*(<\/h2>)/, (m, a, b) => a + esc(q.qText) + b, 'question');
  let k = 0;
  rep(/(<a href=")https:\/\/thewavelength\.co\.uk\/learn\/[a-z0-9-]+\/test\/\?q=1&a=([a-d])&utm_source=newsletter&utm_medium=email&utm_campaign=pearl-[a-z0-9-]+("[^>]*>\s*<b style="color:#2A7F8A;">)([a-d])(<\/b>&nbsp;&nbsp;)[^<]*(<\/a>)/g, (m, a, l, b, l2, c, d) => {
    const o = q.opts[k++];
    return `${a}${testUrl('q=1&a=' + o.letter)}${b}${o.letter}${c}${esc(o.text)}${d}`;
  }, 'answers');
  if (k !== 4) throw new Error('Expected four answers in the template, found ' + k);
  rep(/https:\/\/thewavelength\.co\.uk\/learn\/[a-z0-9-]+\/test\/\?utm_source=newsletter&utm_medium=email&utm_campaign=pearl-[a-z0-9-]+/g, () => testUrl(''), 'test link');
  // The Academy block: the module with a lesson that links to this pearl (academyFor), else a link to every module.
  const ac = opts.academy;
  rep(/(anyone can verify\.)[^<]*(<\/p><a href="https:\/\/thewavelength\.co\.uk\/elearning\/)(?:[a-z0-9-]+\/)?(\?utm_source=newsletter[^"]*"[^>]*>)[^<]*(<\/a>)/, (m, a, b, c, d) =>
    a + (ac ? ` The ${esc(ac.short)} module covers this pearl in its lesson "${esc(ac.lesson)}".` : ' Every module is free.') + b + (ac ? ac.slug + '/' : '') + c + (ac ? `Open the ${esc(ac.short)} module &rarr;` : 'Browse the modules &rarr;') + d, 'academy block');
  // The course, app, departments and teach blocks carry the week's campaign tag too.
  h = h.replace(/utm_campaign=pearl-[a-z0-9-]+/g, () => 'utm_campaign=' + camp);
  if ([...h.matchAll(/\/learn\/([a-z0-9-]+)\/(?:test\/)?\?(?:q=1&a=[a-d]&)?utm_source=newsletter/g)].some((m) => m[1] !== slug)) throw new Error('Links to another pearl remain');
  return h;
}

// The first live Academy module (content/academy/<slug>/) with a lesson that links to /learn/<pearl>/, as
// { slug, short, lesson }, or null.
function academyFor(root, pearl) {
  const dir = path.join(root, 'content/academy');
  if (!fs.existsSync(dir)) return null;
  for (const m of fs.readdirSync(dir).sort()) {
    const mf = path.join(dir, m, 'module.json');
    if (!fs.existsSync(mf)) continue;
    const mod = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (mod.draft) continue;
    for (const f of fs.readdirSync(path.join(dir, m)).filter((x) => x.endsWith('.md')).sort()) {
      const text = fs.readFileSync(path.join(dir, m, f), 'utf8');
      if (!text.includes(`/learn/${pearl}/`)) continue;
      const title = (text.match(/^title:\s*"?([^"\n]+)"?\s*$/m) || [])[1];
      if (title) return { slug: mod.slug || m, short: mod.short || mod.title, lesson: title.trim() };
    }
  }
  return null;
}

// What the Worker needs to send one issue.
const sendInfo = (it, n) => ({ n, slug: it.slug, key: it.key, subject: it.subject, preheader: it.preheader, campaignName: `Wavelength Pearl: ${it.short}` });

// Writes dist/email/pearl/<slug>/index.html for every queued pearl that renders, and dist/email/pearl/queue.json in
// queue order. An entry whose pearl is not built (draft, future date) or does not render is listed with ready false and
// a reason: the Worker passes over it until a later build makes it ready, then sends it next.
function buildQueue(root, dist) {
  const queue = JSON.parse(fs.readFileSync(path.join(root, 'data/pearl-issues.json'), 'utf8')).issues;
  const template = fs.readFileSync(path.join(root, 'src/email/pearl/index.html'), 'utf8');
  const out = [];
  queue.forEach((it, i) => {
    const row = sendInfo(it, i + 1);
    try {
      if (it.hold) throw new Error('on hold (hold: true in data/pearl-issues.json)');
      const testPage = path.join(dist, 'learn', it.slug, 'test/index.html');
      if (!fs.existsSync(testPage)) throw new Error('pearl not on the live site yet');
      if (!fs.existsSync(path.join(root, 'src/assets/email', `pearl-${it.key}.jpg`))) throw new Error(`no email image src/assets/email/pearl-${it.key}.jpg`);
      const html = renderIssue(template, it, readQuestion(fs.readFileSync(testPage, 'utf8')), { academy: academyFor(root, it.slug) });
      fs.mkdirSync(path.join(dist, 'email/pearl', it.slug), { recursive: true });
      fs.writeFileSync(path.join(dist, 'email/pearl', it.slug, 'index.html'), html);
      out.push({ ...row, ready: true });
    } catch (e) {
      out.push({ ...row, ready: false, reason: e.message });
    }
  });
  fs.writeFileSync(path.join(dist, 'email/pearl/queue.json'), JSON.stringify({
    _help: 'Built from data/pearl-issues.json by lib/pearl-issue.js. The Worker sends the first ready issue that D1 newsletter_sends does not show as sent, at 7:30am UK time on Tuesdays, retrying hourly until 6:30pm.',
    issues: out,
  }, null, 1) + '\n');
  return out;
}

module.exports = { SITE, readQuestion, renderIssue, academyFor, buildQueue, sendInfo };
