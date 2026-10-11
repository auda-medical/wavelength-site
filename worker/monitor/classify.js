// Source monitoring: how much a source changed between two successful checks, and whether a person must look.
//   no_change    the relevant text (or, for a document, its bytes) is the same, whatever the headers say
//   minor        a small edit with no accreditation or clinical wording in it (recorded, no review)
//   meaningful   a larger change: a reviewer should look
//   important    changed lines touch requirements (numbers of scans, assessments, sign-off, supervision, fees,
//                deadlines, validity, versions), or the document's version or revision date changed
//   format_changed  the page no longer looks like the page we checked before (most of its text has gone): never
//                treated as new guidance and never stored as the new baseline
// Pure functions, tested in Node.

const REQUIREMENT = /\b(minimum|must|required?|requirements?|mandatory|accredit\w*|assess\w*|sign[- ]?off|supervis\w*|mentor\w*|trainers?|logbook|scans?|studies|DOPS|curriculum|modules?|deadlines?|fees?|valid\w*|expir\w*|competen\w*|triggered|summative|formative|portfolio|eligib\w*|entrust\w*|SLO\d*|registration|certif\w*|examination|exam|renewal|months?|years?)\b|£|€|\$/i;
const NUMBER = /\d/;
// A linked official document (extract.js) counts as requirement wording: a new file is a new pack or version.
const isReq = (l) => REQUIREMENT.test(l) || l.startsWith('Linked document:');
// Words that turn guidance into a rule, or change one.
const STRONG = /^(must|mandatory|required|requires?|minimum|maximum|only|not|no|never|deadline|fee|fees|expires?|valid|withdrawn|replaced|discontinued)$/i;
// Lines that change on every visit without saying anything new (a date the page was generated, a visitor counter).
const VOLATILE = /^(page (last )?(generated|viewed|printed)|generated on|last visited|you are here|\d+ (views|visitors))/i;

export function lineDiff(oldText, newText, cap = 40) {
  const count = (t) => { const m = new Map(); for (const l of String(t || '').split('\n')) if (l && !VOLATILE.test(l)) m.set(l, (m.get(l) || 0) + 1); return m; };
  const a = count(oldText), b = count(newText);
  const removed = [], added = [];
  for (const [l, n] of a) for (let i = (b.get(l) || 0); i < n; i++) removed.push(l);
  for (const [l, n] of b) for (let i = (a.get(l) || 0); i < n; i++) added.push(l);
  const chars = (xs) => xs.reduce((s, x) => s + x.length, 0);
  const base = Math.max(1, chars([...a.keys()]));
  return { removed: removed.slice(0, cap), added: added.slice(0, cap), removedCount: removed.length, addedCount: added.length, ratio: (chars(removed) + chars(added)) / base };
}

// prev / next: { text, hash, version, publishedOn, isDocument }. Returns { classification, summary, evidence }.
export function classify(prev, next) {
  if (!prev || !prev.hash) return { classification: 'baseline', summary: 'First successful check: recorded as the baseline.', evidence: { hash: next.hash, version: next.version || null, publishedOn: next.publishedOn || null } };
  const versionChanged = !!(next.version && prev.version && next.version !== prev.version);
  const dateChanged = !!(next.publishedOn && prev.publishedOn && next.publishedOn > prev.publishedOn);
  const ev = { oldHash: prev.hash, newHash: next.hash, oldVersion: prev.version || null, newVersion: next.version || null, oldPublishedOn: prev.publishedOn || null, newPublishedOn: next.publishedOn || null };
  if (prev.hash === next.hash) return { classification: 'no_change', summary: 'No change detected.', evidence: ev };
  if (next.isDocument) {
    // A document whose bytes changed: compare what can be compared without reading the PDF's text.
    if (versionChanged || dateChanged) return { classification: 'important', summary: `The document was revised${versionChanged ? ` (version ${prev.version} to ${next.version})` : ''}${dateChanged ? ` (revision date ${next.publishedOn})` : ''}.`, evidence: ev };
    return { classification: 'meaningful', summary: 'The document file changed. Its text needs reading by a person to see what changed.', evidence: ev };
  }
  const oldLen = (prev.text || '').length, newLen = (next.text || '').length;
  if (oldLen > 400 && newLen < oldLen * 0.3) return { classification: 'format_changed', summary: `Most of the page's text has gone (${oldLen} to ${newLen} characters). The page may have moved or been redesigned; the earlier version is kept.`, evidence: ev };
  const d = lineDiff(prev.text, next.text);
  Object.assign(ev, { removed: d.removed, added: d.added, removedCount: d.removedCount, addedCount: d.addedCount, ratio: Math.round(d.ratio * 1000) / 1000 });
  if (!d.removedCount && !d.addedCount) return { classification: 'no_change', summary: 'Only lines that change on every visit differ.', evidence: ev };
  const touched = [...d.removed, ...d.added];
  // Words that actually changed between the old and the new lines (a one-word edit in a long sentence is one word,
  // not two sentences).
  const words = (xs) => { const m = new Map(); for (const l of xs) for (const w of l.toLowerCase().match(/[a-z0-9£€$.%-]+/g) || []) m.set(w, (m.get(w) || 0) + 1); return m; };
  const a = words(d.removed), b = words(d.added), changedWords = [];
  for (const [w, n] of a) for (let k = (b.get(w) || 0); k < n; k++) changedWords.push(w);
  for (const [w, n] of b) for (let k = (a.get(w) || 0); k < n; k++) changedWords.push(w);
  const requirementLines = touched.filter((l) => isReq(l) && NUMBER.test(l));
  const numberChanged = changedWords.some((w) => NUMBER.test(w)) && touched.some(isReq);
  const strongChanged = changedWords.some((w) => STRONG.test(w)) && touched.some(isReq);
  const termChanged = changedWords.some((w) => REQUIREMENT.test(w)) || touched.some((l) => l.startsWith('Linked document:'));
  ev.requirementLines = requirementLines.slice(0, 20);
  ev.changedWords = changedWords.slice(0, 60);
  const summary = (kind) => `${kind}: ${d.addedCount} line${d.addedCount === 1 ? '' : 's'} added, ${d.removedCount} removed, ${changedWords.length} word${changedWords.length === 1 ? '' : 's'} changed${requirementLines.length ? `; ${requirementLines.length} line${requirementLines.length === 1 ? '' : 's'} mention requirements with numbers or dates` : ''}${versionChanged ? `; version ${prev.version} to ${next.version}` : ''}.`;
  if (numberChanged || strongChanged || versionChanged || dateChanged) return { classification: 'important', summary: summary('Possible change to requirements'), evidence: ev };
  if (termChanged || changedWords.length > 12 || d.addedCount + d.removedCount >= 6) return { classification: 'meaningful', summary: summary('Content changed'), evidence: ev };
  return { classification: 'minor', summary: summary('Minor editorial change'), evidence: ev };
}
// Which classifications a person must review.
export const NEEDS_REVIEW = new Set(['meaningful', 'important', 'format_changed']);
