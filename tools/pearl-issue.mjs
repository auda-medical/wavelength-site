// Writes the weekly Pearl newsletter issue (src/email/pearl/index.html and issue.json) for one queued pearl in
// data/pearl-issues.json. It keeps every fixed block of the current template (course strip, course, app,
// departments, Academy and teach blocks, footer) and rewrites only the pearl-specific parts: title, preheader,
// opening, image, the pearl line, the first question and its four answers, links and utm tags.
// The answer order comes from the built test page, so run `node build.js` first; each answer button links to
// /learn/<slug>/test/?q=1&a=<letter> and is checked against that page. The send itself is unchanged: the Worker's
// Tuesday cron reads issue.json (worker/newsletter.js).
//   node tools/pearl-issue.mjs <slug>            write the issue (drafted = its planned send Tuesday)
//   node tools/pearl-issue.mjs <slug> --check    only check the template would be rewritten correctly
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SITE = 'https://thewavelength.co.uk';
const [slug, flag] = process.argv.slice(2);
const queue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pearl-issues.json'), 'utf8')).issues;
const it = queue.find((x) => x.slug === slug);
if (!it) { console.error('Not in data/pearl-issues.json:', slug); process.exit(2); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// The first question as the built test page shows it (options in their shuffled order).
const testHtml = fs.readFileSync(path.join(ROOT, 'dist/learn', slug, 'test/index.html'), 'utf8');
const q1 = testHtml.slice(testHtml.indexOf('id="q1"'), testHtml.indexOf('id="q2"'));
const qText = unesc((q1.match(/<span class="quiz-n">Question 1<\/span>([\s\S]*?)<\/p>/) || [])[1] || '');
const opts = [...q1.matchAll(/<button type="button" class="quiz-opt"( data-correct)?><span class="quiz-l">([a-d])<\/span><span>([\s\S]*?)<\/span><\/button>/g)].map((m) => ({ letter: m[2], text: unesc(m[3]), correct: !!m[1] }));
if (!qText || opts.length !== 4 || opts.filter((o) => o.correct).length !== 1 || opts.map((o) => o.letter).join('') !== 'abcd') {
  console.error('Could not read question 1 from the built test page. Run node build.js first.', { qText, opts }); process.exit(1);
}

const send = new Date(it.send + 'T12:00:00Z');
// drafted is the send Tuesday itself: deployed before 07:30 that day, it sends that morning; deployed later, the
// Worker sends it the following Tuesday (it skips only drafts more than eight days old).
const drafted = it.send;
const month = send.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const camp = `pearl-${it.key}`;
const utm = `utm_source=newsletter&utm_medium=email&utm_campaign=${camp}`;
const pearlUrl = `${SITE}/learn/${slug}/?${utm}`;
const testUrl = (q) => `${SITE}/learn/${slug}/test/?${q ? q + '&' : ''}${utm}`;

const tplPath = path.join(ROOT, 'src/email/pearl/index.html');
let h = fs.readFileSync(tplPath, 'utf8');
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
rep(/(Can you answer this\?<\/p>\s*<h2[^>]*>)[^<]*(<\/h2>)/, (m, a, b) => a + esc(qText) + b, 'question');
let k = 0;
rep(/(<a href=")https:\/\/thewavelength\.co\.uk\/learn\/[a-z0-9-]+\/test\/\?q=1&a=([a-d])&utm_source=newsletter&utm_medium=email&utm_campaign=pearl-[a-z0-9-]+("[^>]*>\s*<b style="color:#2A7F8A;">)([a-d])(<\/b>&nbsp;&nbsp;)[^<]*(<\/a>)/g, (m, a, l, b, l2, c, d) => {
  const o = opts[k++];
  return `${a}${testUrl('q=1&a=' + o.letter)}${b}${o.letter}${c}${esc(o.text)}${d}`;
}, 'answers');
if (k !== 4) throw new Error('Expected four answers in the template, found ' + k);
rep(/https:\/\/thewavelength\.co\.uk\/learn\/[a-z0-9-]+\/test\/\?utm_source=newsletter&utm_medium=email&utm_campaign=pearl-[a-z0-9-]+/g, () => testUrl(''), 'test link');
// The course, app, departments and teach blocks carry the week's campaign tag too.
h = h.replace(/utm_campaign=pearl-[a-z0-9-]+/g, () => 'utm_campaign=' + camp);
if ([...h.matchAll(/\/learn\/([a-z0-9-]+)\/(?:test\/)?\?(?:q=1&a=[a-d]&)?utm_source=newsletter/g)].some((m) => m[1] !== slug)) throw new Error('Links to another pearl remain');

const issue = { _help: 'Read by the Worker\'s Tuesday send. ready true and an unsent slug means it sends at 7:30am UK time on the first Tuesday on or after drafted, unless the draft is more than eight days old. Set ready false to hold an issue.', slug, subject: it.subject, preheader: it.preheader, campaignName: `Wavelength Pearl: ${it.short}`, drafted, ready: true };
const correct = opts.find((o) => o.correct);
console.log(`${slug}: send ${it.send}, drafted ${drafted}, correct answer ${correct.letter} (${correct.text})`);
if (flag === '--check') process.exit(0);
fs.writeFileSync(tplPath, h);
fs.writeFileSync(path.join(ROOT, 'src/email/pearl/issue.json'), JSON.stringify(issue, null, 2).replace(/^\{\n  "_help"/, '{\n  "_help"') + '\n');
console.log('Wrote src/email/pearl/index.html and issue.json. The email image is src/assets/email/' + camp + '.jpg.');
