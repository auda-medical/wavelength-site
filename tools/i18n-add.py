# Adds translations to src/app/i18n/<lang>.json from one batch file keyed by the English text:
#   { "English text": { "fr": "...", "es": "...", "de": "...", "it": "...", "pl": "...", "ar": "...", "ru": "...", "zh": "..." },
#     "{n} scan": { "fr": { "one": "...", "other": "..." }, ... } }
# Existing keys are replaced, new keys added; the file keeps its format (tools/i18n-merge.py). Usage:
#   python3 tools/i18n-add.py tools/i18n/batch-1.0.12-supervision.json
# 1.0.12: translations added this way are machine-drafted like the rest and need a native speaker's review.
import json, sys
LANGS = ['fr', 'es', 'de', 'it', 'pl', 'ar', 'ru', 'zh']
def note(m):
    if '1.0.12' not in m.get('review', ''):
        m['review'] = (m.get('review', '').rstrip('.') + '; 1.0.12 strings were added on 9 October 2026, also machine-drafted.').lstrip('; ')
    return m
if len(sys.argv) > 2 and sys.argv[1] == '--keys':
    K = json.load(open(sys.argv[2], encoding='utf-8'))
    for path in sys.argv[3:]:
        L = json.load(open(path, encoding='utf-8'))
        lang, lst, pl = L['lang'], L['list'], L.get('plurals', {})
        if len(lst) != len(K['_keys']): raise SystemExit(f'{path}: {len(lst)} translations for {len(K["_keys"])} keys')
        missing = [k for k in K.get('_plurals', {}) if k not in pl]
        if missing: raise SystemExit(f'{path}: no plural forms for {missing}')
        f = f'src/app/i18n/{lang}.json'
        d = json.load(open(f, encoding='utf-8'))
        for en, tr in zip(K['_keys'], lst): d[en] = tr
        for en, forms in pl.items(): d[en] = forms
        d['_meta'] = note(d.get('_meta', {}))
        json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(lang, len(lst), 'strings and', len(pl), 'plurals from', path)
    sys.exit(0)
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
        d['_meta'] = note(d.get('_meta', {}))
        json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(lang, n, 'added or updated from', path)

# List form (1.0.12): tools/i18n-add.py --keys <batch.keys.json> <lang files...>, where the keys file is
# {"_keys": [English...], "_plurals": {...}} and each language file is {"lang": "fr", "list": [...], "plurals": {...}}
# with list aligned to _keys. Used for large batches translated one language at a time.
