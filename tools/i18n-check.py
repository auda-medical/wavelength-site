# Checks a translation chunk against tools/i18n/strings.json: length, placeholders and HTML tags.
import json, re, sys, os
S = json.load(open(os.environ.get('I18N_STRINGS','tools/i18n/strings.json')))['strings']
def check(lang, chunk, start, end):
    a = json.load(open(f'tools/i18n/{lang}.{chunk}.json'))
    if isinstance(a, dict):
        missing = [k for k in range(start, end) if str(k) not in a]
        extra = [k for k in a if not k.startswith('_') and not (start <= int(k) < end)]
        if missing or extra: print(lang, chunk, 'MISSING', missing[:20], 'EXTRA', extra[:20]); return False
        a = [a[str(k)] for k in range(start, end)]
    src = S[start:end]
    bad = []
    if len(a) != len(src): print(lang, chunk, 'LENGTH', len(a), 'expected', len(src)); return False
    for i, (e, t) in enumerate(zip(src, a)):
        if sorted(re.findall(r'\{\w+\}', e)) != sorted(re.findall(r'\{\w+\}', t)): bad.append((start + i, 'placeholder', e, t))
        if sorted(re.findall(r'</?[a-z]+', e)) != sorted(re.findall(r'</?[a-z]+', t)): bad.append((start + i, 'tags', e, t))
        if not t.strip(): bad.append((start + i, 'empty', e, t))
    for b in bad: print(lang, b)
    return not bad
ranges = {'0': (0, 400), '1': (400, 800), '2': (800, len(S))}
ok = all(check(sys.argv[1], c, *ranges[c]) for c in sys.argv[2:])
print('OK' if ok else 'PROBLEMS')
