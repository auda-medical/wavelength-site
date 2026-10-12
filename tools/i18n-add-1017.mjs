// Adds the 1.0.17 strings (tools/i18n/batch-1.0.17-rotation.mjs) to src/app/i18n/<lang>.json. New keys are appended
// to the file as text in its own layout (one entry per line, indent 0), so nothing else in the file moves; a key
// already present is left as it is. The review note records that these, too, are machine-drafted.
//   node tools/i18n-add-1017.mjs
import fs from 'node:fs';
import { LANGS, STRINGS, PLURALS } from './i18n/batch-1.0.17-rotation.mjs';
const NOTE = ' 1.0.17 strings (Size and Rotation) were added on 12 October 2026, also machine-drafted.';
LANGS.forEach((lang, i) => {
  const f = new URL(`../src/app/i18n/${lang}.json`, import.meta.url);
  let text = fs.readFileSync(f, 'utf8');
  const have = JSON.parse(text);
  const add = [];
  for (const [en, tr] of Object.entries(STRINGS)) if (!(en in have)) add.push(`${JSON.stringify(en)}: ${JSON.stringify(tr[i])}`);
  for (const [en, by] of Object.entries(PLURALS)) if (!(en in have)) add.push(`${JSON.stringify(en)}: {\n${Object.entries(by[lang]).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}`);
  const end = text.lastIndexOf('}');
  if (add.length) text = text.slice(0, end).replace(/\s*$/, '') + ',\n' + add.join(',\n') + '\n}' + text.slice(end + 1);
  if (!have._meta.review.includes('1.0.17')) {
    const old = JSON.stringify(have._meta.review), neu = JSON.stringify(have._meta.review.replace(/\s*$/, '') + NOTE);
    if (text.split(old).length !== 2) throw new Error(`${lang}: review note not found once`);
    text = text.replace(old, () => neu);
  }
  JSON.parse(text); // still valid
  fs.writeFileSync(f, text);
  console.log(lang, add.length, 'added');
});
