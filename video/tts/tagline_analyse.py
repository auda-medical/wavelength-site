# Objective measures for the closing-tagline takes (supporting listening, never replacing it). For each phrase (split
# at pauses of 150 ms or more): duration, median pitch (Hz), the pitch movement across the phrase (semitones from its
# first third to its last third: negative = a settling, downward inflection), the length of the final syllable's voiced
# run, level (dB RMS) and spectral centroid (Hz; lower = warmer). Uses librosa's pYIN pitch tracker.
#   qwen\Scripts\python.exe -I tagline_analyse.py <wav> [<wav> ...]   -> JSON lines
import sys, json
import numpy as np, soundfile as sf, librosa

def phrases(x, sr, min_pause=0.15):
    h = int(0.01 * sr); n = len(x) // h
    db = np.array([20 * np.log10(np.sqrt(np.mean(x[i * h:(i + 1) * h] ** 2)) + 1e-9) for i in range(n)])
    on = db > np.percentile(db, 97) - 32
    segs, s, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if s is None: s = i
            gap = 0
        elif s is not None:
            gap += 1
            if gap * 0.01 >= min_pause: segs.append((s, i - gap + 1)); s, gap = None, 0
    if s is not None: segs.append((s, n - gap))
    return [(a * h, b * h) for a, b in segs if (b - a) >= 12]

for path in sys.argv[1:]:
    x, sr = sf.read(path)
    if x.ndim > 1: x = x.mean(axis=1)
    out = {'file': path, 'seconds': round(len(x) / sr, 2), 'phrases': []}
    segs = phrases(x, sr)
    for a, b in segs:
        y = x[a:b]
        f0, vf, _ = librosa.pyin(y, fmin=60, fmax=300, sr=sr, frame_length=1024, hop_length=240)
        f = f0[~np.isnan(f0)]
        ph = {'start': round(a / sr, 2), 'seconds': round((b - a) / sr, 2), 'levelDb': round(float(20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-9)), 1)}
        if len(f) >= 6:
            k = max(2, len(f) // 3)
            ph['f0MedianHz'] = round(float(np.median(f)), 1)
            ph['pitchMoveSemitones'] = round(float(12 * np.log2(np.median(f[-k:]) / np.median(f[:k]))), 2)
            ph['endF0Hz'] = round(float(np.median(f[-k:])), 1)
            # final voiced run length (s)
            v = ~np.isnan(f0); i = len(v) - 1
            while i > 0 and not v[i]: i -= 1
            j = i
            while j > 0 and v[j]: j -= 1
            ph['finalVoicedRun'] = round((i - j) * 240 / sr, 2)
        S = np.abs(librosa.stft(y, n_fft=1024, hop_length=256)) ** 2
        fr = librosa.fft_frequencies(sr=sr, n_fft=1024)
        ph['centroidHz'] = int((S.sum(axis=1) * fr).sum() / max(S.sum(), 1e-12))
        out['phrases'].append(ph)
    if len(segs) > 1: out['pauses'] = [round((segs[i + 1][0] - segs[i][1]) / sr, 2) for i in range(len(segs) - 1)]
    print(json.dumps(out), flush=True)
