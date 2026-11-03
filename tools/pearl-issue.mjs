// Preview one weekly Pearl newsletter issue. The build writes every queued issue to dist/email/pearl/<slug>/ and the
// Worker sends them in queue order on Tuesdays (lib/pearl-issue.js, worker/newsletter.js), so nothing needs writing
// by hand each week. This tool prints the issue's first question and correct answer and, with --write, rewrites the
// template src/email/pearl/index.html as that issue (the template only needs to stay renderable: /email/pearl/ is
// a preview, never sent). Run `node build.js` first: the answer order comes from the built test page.
//   node tools/pearl-issue.mjs <slug>            check the issue renders and show its answer
//   node tools/pearl-issue.mjs <slug> --write    also rewrite the template as this issue
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readQuestion, renderIssue, academyFor } = require('../lib/pearl-issue.js');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const [slug, flag] = process.argv.slice(2);
const it = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pearl-issues.json'), 'utf8')).issues.find((x) => x.slug === slug);
if (!it) { console.error('Not in data/pearl-issues.json:', slug); process.exit(2); }
const q = readQuestion(fs.readFileSync(path.join(ROOT, 'dist/learn', slug, 'test/index.html'), 'utf8'));
const tplPath = path.join(ROOT, 'src/email/pearl/index.html');
const html = renderIssue(fs.readFileSync(tplPath, 'utf8'), it, q, { academy: academyFor(ROOT, slug) });
const correct = q.opts.find((o) => o.correct);
console.log(`${slug}: correct answer ${correct.letter} (${correct.text}). Email image src/assets/email/pearl-${it.key}.jpg`);
if (flag === '--write') { fs.writeFileSync(tplPath, html); console.log('Wrote src/email/pearl/index.html'); }
