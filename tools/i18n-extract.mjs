// Collects every translatable English string: T('...') calls in the app scripts, plural keys from plural()/N(),
// labels from data/logbook.json, and error messages the Worker returns. Writes tools/i18n/strings.json.
// Usage: node tools/i18n-extract.mjs   (then translate the missing keys into src/app/i18n/<lang>.json)
import fs from 'node:fs';
const files = ['src/app/app.js', 'src/app/sign.js', 'src/app/forms.js'];
const keys = new Set(), plurals = new Map();
const lit = /T\(\s*'((?:[^'\\]|\\.)*)'/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(lit)) keys.add(m[1].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/plural\([^,]+,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\)/g)) plurals.set('{n} ' + (m[2] || m[1] + 's'), '{n} ' + m[1]);
  for (const m of s.matchAll(/N\([^,]+,\s*'([^']+)',\s*'([^']+)'\)/g)) plurals.set(m[2], m[1]);
}
// Plural calls built from non-literal words in app.js (gapText, rules).
for (const w of ['more scan', 'more reflection', 'scan', 'image', 'clip', 'day', 'learner', 'new invitation', 'certificate', 'CPD hour', 'item', 'encrypted image', 'ultrasound scan']) if (!plurals.has('{n} ' + w + 's')) plurals.set('{n} ' + w + 's', '{n} ' + w);
plurals.set('{n} requests waiting', '{n} request waiting');
plurals.set("{n} images on the learner's phone", "{n} image on the learner's phone");
const lb = JSON.parse(fs.readFileSync('data/logbook.json', 'utf8'));
const add = (v) => { if (typeof v === 'string' && v.trim()) keys.add(v); };
lb.types.forEach((t) => { add(t.label); add(t.short); t.fields.forEach((f) => { add(f.label); (f.options || []).forEach(add); }); });
['settings', 'ageBands', 'confirmation', 'assessmentScale'].forEach((k) => (lb[k] || []).forEach(add));
lb.supervision.forEach((s) => { add(s.label); add(s.help); });
lb.pathways.forEach((p) => { add(p.desc); add(p.region); p.modules.forEach((m) => { add(m.label); (m.rules || []).forEach((r) => add(r.label)); (m.assessments || []).forEach((a) => add(a.label)); (m.topics || []).forEach(add); }); });
['assessmentKinds', 'assessmentDomains', 'assessmentOutcomes', 'qualityScale'].forEach((k) => (lb[k] || []).forEach((x) => { add(x.label); add(x.help); }));
lb.destinations.forEach((d) => { add(d.label); d.steps.forEach(add); });
['Overall', 'Normal', 'Abnormal', 'Indeterminate', 'Good', 'Adequate', 'Limited', 'Inadequate', 'Female', 'Male', 'Agreed', 'Partly agreed', 'Disagreed', 'UK', 'Europe', 'Australia and New Zealand', 'Canada', 'United States', 'Portfolio', 'Image quality', 'Diagnostic accuracy'].forEach(add);
// Connection and sync status words (src/app/netstate.js): pill labels, banner titles and text, error lines.
{
  const s = fs.readFileSync('src/app/netstate.js', 'utf8');
  for (const m of s.matchAll(/(?:label|title|body|hint): '((?:[^'\\]|\\.)*)'/g)) if (!/\{n\} scans? (is|are) saved/.test(m[1])) add(m[1].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/^\s+(?:offline|unreachable|timeout|failed|auth|update): '((?:[^'\\]|\\.)*)',?$/gm)) add(m[1].replace(/\\'/g, "'"));
}
// Label maps in app.js passed to T() through a variable (supervisor standing, lapse reasons, wizard steps, signers).
{
  const s = fs.readFileSync('src/app/app.js', 'utf8');
  for (const m of s.matchAll(/var (?:SV_STANDING|SV_LAPSE|SV_REASONS|SV_STEP_LABEL|SIGNER_TEXT) = \{([^\n]*)\};/g)) for (const v of m[1].matchAll(/:\s*'((?:[^'\\]|\\.)*)'/g)) add(v[1].replace(/\\'/g, "'"));
}
// Labels the Worker sends for display: link states, organisation kinds, the search badge, the review time.
for (const f of ['worker/supervisor-lifecycle.js', 'worker/organisations.js', 'worker/search.js', 'worker/supervisor-apply.js']) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/label: '((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/const KIND_LABEL = \{([^\n]*)\};/g)) for (const v of m[1].matchAll(/:\s*'([^']*)'/g)) add(v[1]);
  for (const m of s.matchAll(/(?:REVIEW_TIME|badge:?)\s*[=:]\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));
}
// Worker error messages shown to users.
for (const f of ['worker/app.js', 'worker/supervise.js', 'worker/app-util.js', 'worker/evidence.js', 'worker/email-verify.js', 'worker/password.js', 'worker/supervisor-apply.js', 'worker/supervisor-lifecycle.js', 'worker/organisations.js', 'worker/search.js', 'worker/professional.js']) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/error: '((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));
  for (const m of s.matchAll(/error: `([^`$]*)`/g)) add(m[1]);
}
// New-password checklist (PW_RULES in app.js, rules in worker/password.js).
['At least 10 characters', 'An uppercase letter', 'A lowercase letter', 'A number', 'A symbol, such as ! ? # or %', 'Choose a password of at most 200 characters.'].forEach(add);
for (const p of plurals.keys()) keys.delete(p);
fs.mkdirSync('tools/i18n', { recursive: true });
const out = { strings: [...keys].sort(), plurals: Object.fromEntries([...plurals].sort()) };
fs.writeFileSync('tools/i18n/strings.json', JSON.stringify(out, null, 1));
console.log(out.strings.length, 'strings,', plurals.size, 'plurals');
