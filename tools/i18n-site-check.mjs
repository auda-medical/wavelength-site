// Checks data/i18n/site.<lang>.json against site.en.json: same keys, placeholders and HTML tags.
import fs from 'node:fs';
const dir = new URL('../data/i18n/', import.meta.url);
const en = JSON.parse(fs.readFileSync(new URL('site.en.json', dir)));
const sig = (s) => [...String(s).matchAll(/\{\w+\}|<\/?[a-z]+/g)].map((m) => m[0]).sort().join(' ');
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^site\.[a-z]{2}\.json$/.test(x) && x !== 'site.en.json')) {
  const t = JSON.parse(fs.readFileSync(new URL(f, dir)));
  for (const [sec, keys] of Object.entries(en)) {
    if (sec.startsWith('_')) continue;
    for (const [k, v] of Object.entries(keys)) {
      const x = (t[sec] || {})[k];
      if (x == null) { console.log(f, 'missing', `${sec}.${k}`); bad++; } else if (sig(x) !== sig(v)) { console.log(f, 'placeholders or tags differ', `${sec}.${k}`); bad++; }
    }
  }
}
console.log(bad ? `${bad} problems` : 'OK');
process.exit(bad ? 1 : 0);
