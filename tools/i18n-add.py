# Adds translations to src/app/i18n/<lang>.json from one batch file keyed by the English text:
#   { "English text": { "fr": "...", "es": "...", "de": "...", "it": "...", "pl": "...", "ar": "...", "ru": "...", "zh": "..." },
#     "{n} scan": { "fr": { "one": "...", "other": "..." }, ... } }
# Existing keys are replaced, new keys added; the file keeps its format (tools/i18n-merge.py). Usage:
#   python3 tools/i18n-add.py tools/i18n/batch-1.0.12-supervision.json
# 1.0.12: translations added this way are machine-drafted like the rest and need a native speaker's review.
import json, sys
LANGS = ['fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh']
for path in sys.argv[1:]:
    batch = json.load(open(path, encoding='utf-8'))
    for lang in LANGS:
        f = f'src/app/i18n/{lang}.json'
        d = json.load(open(f, encoding='utf-8'))
        n = 0
        for en, tr in batch.items():
            if en.startswith('_'): continue
            if lang not in tr: raise SystemExit(f'{path}: no {lang} for {en!r}')
            d[en] = tr[lang]; n += 1
        m = d.get('_meta', {})
        if '1.0.12' not in m.get('review', ''):
            m['review'] = (m.get('review', '').rstrip('.') + '; 1.0.12 strings were added on 9 October 2026, also machine-drafted.').lstrip('; ')
        d['_meta'] = m
        json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(lang, n, 'added or updated from', path)
