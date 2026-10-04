# Merges translation chunks tools/i18n/<lang>.<0|1|2>.json (lists or index-keyed objects, aligned with
# tools/i18n/strings.json) into src/app/i18n/<lang>.json keyed by the English text. Usage: python3 tools/i18n-merge.py fr
import json, sys, os
S = json.load(open(os.environ.get('I18N_STRINGS','tools/i18n/strings.json')))
out = {'_meta': {'note': 'English text is the key. Plural keys hold one/few/many/other forms. Built by tools/i18n-merge.py.'}}
starts = [0, 400, 800]
for lang in sys.argv[1:]:
    d = dict(out)
    for c, st in enumerate(starts):
        a = json.load(open(f'tools/i18n/{lang}.{c}.json'))
        if isinstance(a, list): a = {str(st + i): v for i, v in enumerate(a)}
        for k, v in a.items():
            if k == '_plurals': d.update(v); continue
            d[S['strings'][int(k)]] = v
    path = f'src/app/i18n/{lang}.json'
    old = json.load(open(path)) if os.path.exists(path) else {}
    for k, v in old.items():  # keep hand edits for keys no longer in the extracted list
        if k not in d: d[k] = v
    json.dump(d, open(path, 'w'), ensure_ascii=False, indent=0)
    print(lang, len(d) - 1, 'entries')
