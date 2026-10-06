// Normalised form of an organisation name or alias, shared by the Worker (worker/organisations.js) and the seed
// script (tools/organisations-seed.mjs). No imports, so Node can load it directly.
// Lower case, accents dropped, "&" to "and", apostrophes removed (so "Guy's" and "Guys" match), every other run of
// punctuation or space becomes one space. Words such as NHS, Foundation, Trust and Hospital are kept.
export function normOrg(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 200);
}
// The words of a query, for "matches the start of any word" searches. At most six words, each at least one character.
export const queryWords = (q) => normOrg(q).split(' ').filter(Boolean).slice(0, 6);
