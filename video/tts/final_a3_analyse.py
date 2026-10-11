# Objective measures for the two final narration corrections (11 October 2026), supporting listening, never replacing it.
#   qwen\Scripts\python.exe -I final_a3_analyse.py opening <wav> [...]   -> JSON lines
#   qwen\Scripts\python.exe -I final_a3_analyse.py closing <wav> [...]
# Opening ("And before you know it ..."): how forceful the delivery is.
#   pitchSpreadSt  standard deviation of voiced pitch, in semitones (lower = calmer, less sing-song or urgent)
#   punchDb        95th percentile of 10 ms frame level minus the median voiced frame level (lower = fewer hammered stresses)
#   peakDb         loudest 50 ms window minus the median voiced level (lower = no shouted word)
#   centroidHz     spectral centroid (lower = mellower; reported, not used to choose, so a take is never picked for dullness)
#   f0MedianHz     median pitch (lower = more relaxed register)
#   seconds        duration of speech
# Closing ("Wavelength. Tune in. Gain clarity."): the phrase split of tagline_analyse.py (pauses of 150 ms or more),
# then inside "Gain clarity" the deepest level dip 0.12 to 0.55 s after its start (and within its first 60%), which is the joint between
# "Gain" and "clarity":
#   gainHeldS      from the phrase start to that dip (how long "Gain" is held)
#   dipDb          how far the dip falls below the phrase's median level (a tiny separation: about 6 to 20 dB)
#   dipS           how long the level stays at least 6 dB below the median there (tiny: about 0.03 to 0.20 s)
#   gcVsTiSt       median pitch of "Gain clarity" minus "Tune in", in semitones (negative = deeper)
#   gcSpreadSt     pitch spread inside "Gain clarity" (a little more movement than Take 2)
#   settleSt       pitch move from the first to the last third of "Gain clarity" (negative = settling)
#   gcVsTiDb       level of "Gain clarity" minus "Tune in" (no announcer push)
import sys, json
import numpy as np, soundfile as sf, librosa

def frames_db(x, sr, ms=10):
    h = int(ms / 1000 * sr); n = len(x) // h
    return np.array([20 * np.log10(np.sqrt(np.mean(x[i * h:(i + 1) * h] ** 2)) + 1e-9) for i in range(n)]), h

def phrases(x, sr, min_pause=0.15):
    db, h = frames_db(x, sr)
    on = db > np.percentile(db, 97) - 32
    segs, s, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if s is None: s = i
            gap = 0
        elif s is not None:
            gap += 1
            if gap * 0.01 >= min_pause: segs.append((s, i - gap + 1)); s, gap = None, 0
    if s is not None: segs.append((s, len(on) - gap))
    return [(a * h, b * h) for a, b in segs if (b - a) >= 12]

def pitch(y, sr):
    f0, _, _ = librosa.pyin(y, fmin=60, fmax=300, sr=sr, frame_length=1024, hop_length=240)
    return f0[~np.isnan(f0)]

def st(a, b): return float(12 * np.log2(a / b))

def centroid(y, sr):
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=256)) ** 2
    fr = librosa.fft_frequencies(sr=sr, n_fft=1024)
    return int((S.sum(axis=1) * fr).sum() / max(S.sum(), 1e-12))

def level(y): return float(20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-9))

mode = sys.argv[1]
for path in sys.argv[2:]:
    x, sr = sf.read(path)
    if x.ndim > 1: x = x.mean(axis=1)
    out = {'file': path.replace('\\', '/').split('/')[-1], 'mode': mode}
    if mode == 'opening':
        segs = phrases(x, sr)
        a, b = segs[0][0], segs[-1][1]; y = x[a:b]
        db, h = frames_db(y, sr)
        voiced = db[db > np.percentile(db, 97) - 32]
        w = np.convolve(10 ** (db / 10), np.ones(5) / 5, mode='valid')
        f = pitch(y, sr)
        out.update({'seconds': round((b - a) / sr, 2), 'pitchSpreadSt': round(float(np.std(12 * np.log2(f / np.median(f)))), 2),
                    'punchDb': round(float(np.percentile(voiced, 95) - np.median(voiced)), 1),
                    'peakDb': round(float(10 * np.log10(w.max()) - np.median(voiced)), 1),
                    'f0MedianHz': round(float(np.median(f)), 1), 'centroidHz': centroid(y, sr), 'levelDb': round(level(y), 1),
                    'pauses': [round((segs[i + 1][0] - segs[i][1]) / sr, 2) for i in range(len(segs) - 1)]})
    else:
        segs = phrases(x, sr)
        out['phrases'] = len(segs)
        out['pauses'] = [round((segs[i + 1][0] - segs[i][1]) / sr, 2) for i in range(len(segs) - 1)]
        if len(segs) == 3:
            (_, _), (ta, tb), (ga, gb) = segs
            ti, gc = x[ta:tb], x[ga:gb]
            fti, fgc = pitch(ti, sr), pitch(gc, sr)
            db, h = frames_db(gc, sr)
            med = float(np.median(db[db > np.percentile(db, 97) - 32]))
            lo, hi = int(0.12 / 0.01), min(len(db) - 5, int(0.55 / 0.01), int(len(db) * 0.6))
            sm = np.convolve(db, np.ones(3) / 3, mode='same')
            k = lo + int(np.argmin(sm[lo:hi])) if hi > lo else None
            if k is not None:
                i = k
                while i > 0 and sm[i - 1] < med - 6: i -= 1
                j = k
                while j < len(sm) - 1 and sm[j + 1] < med - 6: j += 1
                dip_s = (j - i + 1) * 0.01 if sm[k] < med - 6 else 0.0
                out.update({'gainHeldS': round(k * 0.01, 2), 'dipDb': round(med - float(sm[k]), 1), 'dipS': round(dip_s, 2)})
            if len(fti) >= 6 and len(fgc) >= 6:
                q = max(2, len(fgc) // 3)
                out.update({'gcVsTiSt': round(st(np.median(fgc), np.median(fti)), 2),
                            'gcSpreadSt': round(float(np.std(12 * np.log2(fgc / np.median(fgc)))), 2),
                            'settleSt': round(st(np.median(fgc[-q:]), np.median(fgc[:q])), 2)})
            out.update({'gcVsTiDb': round(level(gc) - level(ti), 1), 'gcSeconds': round((gb - ga) / sr, 2),
                        'gcCentroidHz': centroid(gc, sr), 'tiCentroidHz': centroid(ti, sr)})
    print(json.dumps(out), flush=True)
