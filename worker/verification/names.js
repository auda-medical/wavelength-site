// Identity name matching for professional register and credential checks.
// Compares the name on a Wavelength account with the name an authoritative source returns. It accepts formatting
// differences (titles, case, accents, spacing, hyphens, apostrophes, extra middle names, "Surname, Given" order) and
// sends anything weaker (initials only, a different first name, one half of a double-barrelled surname) to manual
// review. It never auto-accepts a different identity. Bump VERSION whenever the rules change: every check records it.
export const VERSION = 'names-v1';

const TITLES = new Set(['dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'mx', 'sir', 'dame', 'lady', 'lord', 'rev', 'revd', 'reverend', 'surg', 'cdr', 'lt', 'col', 'maj', 'capt']);
const SUFFIXES = new Set(['jr', 'jnr', 'sr', 'snr', 'ii', 'iii', 'iv', 'obe', 'mbe', 'cbe', 'frcem', 'frcp', 'frcs', 'frca', 'mrcp', 'mrcs', 'mbbs', 'mbchb', 'md', 'phd', 'bsc', 'msc', 'ficm', 'fficm', 'rn', 'rgn']);

// Lower case, accents removed, apostrophes dropped (O'Brien = OBrien), other punctuation becomes a space.
function fold(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[‘’ʼ'`´]/g, '').replace(/[.,()]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Name parts: given names (array of tokens) and family name (array of tokens, hyphens split).
export function parseName(input) {
  let given, family;
  if (input && typeof input === 'object') {
    given = fold(input.given); family = fold(input.family);
  } else {
    const raw = String(input == null ? '' : input);
    // Registers often print "SURNAME, Given Names".
    if (raw.includes(',')) { const [a, ...b] = raw.split(','); family = fold(a); given = fold(b.join(' ')); }
    else { const t = fold(raw).split(' ').filter(Boolean); family = t.pop() || ''; given = t.join(' '); }
  }
  const clean = (s) => s.split(/[\s-]+/).filter((x) => x && !TITLES.has(x) && !SUFFIXES.has(x));
  return { given: clean(given), family: clean(family) };
}
const joined = (t) => t.join('');

// Returns { result: 'match' | 'review' | 'mismatch', method, version, confidence, detail }.
// account: { given, family } from the Wavelength account. source: a string or { given, family } from the source.
export function matchNames(account, source) {
  const a = parseName(account), s = parseName(source);
  const out = (result, method, confidence, detail) => ({ result, method, version: VERSION, confidence, detail });
  if (!a.family.length || !s.family.length || !a.given.length || !s.given.length) return out('review', 'incomplete', 'none', 'A name part is missing.');
  // Family name: the same letters once spaces and hyphens go (Van der Berg = Vanderberg, Smith-Jones = Smith Jones).
  let family = joined(a.family) === joined(s.family) ? 'exact' : null;
  if (!family) {
    // "Abou Auda" registered as given "... Abou", family "Auda": compare whole names without the split.
    if (joined([...a.given, ...a.family]) === joined([...s.given, ...s.family])) return out('match', 'normalised', 'high', 'Same name split differently between given and family names.');
    // One half of a double-barrelled name, or a surname the source holds among the given names: a person may use
    // one part, but it is not proof. Review.
    const sAll = new Set([...s.family, ...s.given]);
    if (a.family.every((x) => sAll.has(x)) || s.family.every((x) => new Set([...a.family, ...a.given]).has(x))) family = 'partial';
  }
  if (!family) return out('mismatch', 'family_differs', 'none', 'Family names differ.');
  const [a1] = a.given, [s1] = s.given;
  const sGiven = s.given;
  let given;
  if (a.given.join(' ') === s.given.join(' ')) given = 'exact';
  else if (a1 === s1 && a.given.every((x) => sGiven.includes(x))) given = 'extra_middle_names'; // source lists middle names the account leaves out
  else if (a1 === s1) given = 'first_name_only';
  else if (sGiven.slice(1).includes(a1)) given = 'known_by_middle_name';
  else if (a1.length === 1 && s1.startsWith(a1)) given = 'initial';
  else if (s1.length === 1 && a1.startsWith(s1)) given = 'initial';
  else given = null;
  if (!given) return out('mismatch', 'given_differs', 'none', 'First names differ.');
  if (family === 'exact' && given === 'exact') return out('match', 'exact', 'high', 'Names match after normalisation.');
  if (family === 'exact' && given === 'extra_middle_names') return out('match', 'normalised', 'high', 'Same first and family name; the source lists other given names.');
  return out('review', `${family}_family_${given}`, given === 'initial' ? 'low' : 'medium', 'Possible match. A person must check it.');
}
