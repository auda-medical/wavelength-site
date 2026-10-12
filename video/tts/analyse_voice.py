# Objective voice measures for auditions. These support, and never replace, listening.
#   python analyse_voice.py <words-in-text> <wav> [<wav> ...]  -> JSON lines
# median F0 (Hz): register; F0 spread (semitones, 10th-90th percentile): expressiveness (very low = monotone);
# spectral centroid (Hz) and share of energy above 3 kHz: brightness / harshness; words per minute overall and while
# speaking; pauses (>= 180 ms) count and median length; share of time silent.
import sys, json
import numpy as np, soundfile as sf

def frames(x, n, hop):
    k = 1 + max(0, (len(x) - n) // hop)
    return np.stack([x[i * hop:i * hop + n] for i in range(k)])

def yin_f0(fr, sr, fmin=60, fmax=300, thr=0.15):
    out = []
    lo, hi = int(sr / fmax), int(sr / fmin)
    for w in fr:
        w = w - w.mean()
        d = np.array([np.sum((w[:-t] - w[t:]) ** 2) if t else 0.0 for t in range(hi + 1)])
        c = np.cumsum(d[1:]); cmnd = np.ones_like(d); cmnd[1:] = d[1:] * np.arange(1, hi + 1) / np.maximum(c, 1e-12)
        idx = np.where(cmnd[lo:hi] < thr)[0]
        if len(idx) == 0: out.append(np.nan); continue
        t = lo + idx[0]
        while t + 1 < hi and cmnd[t + 1] < cmnd[t]: t += 1
        out.append(sr / t)
    return np.array(out)

words = int(sys.argv[1])
for path in sys.argv[2:]:
    x, sr = sf.read(path)
    if x.ndim > 1: x = x.mean(axis=1)
    if sr != 16000:
        n = int(len(x) * 16000 / sr); x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x); sr = 16000
    n, hop = int(0.04 * sr), int(0.01 * sr)
    fr = frames(x, n, hop)
    rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    voiced = db > (np.percentile(db, 95) - 30)
    f0 = yin_f0(fr[voiced][::3], sr)
    f0 = f0[~np.isnan(f0)]
    spec = np.abs(np.fft.rfft(fr[voiced] * np.hanning(n), axis=1)) ** 2
    freqs = np.fft.rfftfreq(n, 1 / sr)
    cent = (spec * freqs).sum(axis=1) / np.maximum(spec.sum(axis=1), 1e-12)
    hi_share = spec[:, freqs >= 3000].sum() / max(spec.sum(), 1e-12)
    # pauses: runs of unvoiced frames >= 180 ms, ignoring leading and trailing silence
    v = voiced.astype(int); idx = np.where(v)[0]
    pauses = []
    if len(idx):
        run = 0
        for k in range(idx[0], idx[-1] + 1):
            if not v[k]: run += 1
            else:
                if run * 0.01 >= 0.18: pauses.append(run * 0.01)
                run = 0
    total = len(x) / sr
    speaking = (idx[-1] - idx[0] + 1) * 0.01 if len(idx) else total
    st = 12 * np.log2(f0 / np.median(f0)) if len(f0) else np.array([0])
    print(json.dumps({
        'file': path, 'seconds': round(total, 2),
        'f0_median_hz': round(float(np.median(f0)), 1) if len(f0) else None,
        'f0_spread_semitones_p10_p90': round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2),
        'centroid_median_hz': round(float(np.median(cent)), 0),
        'energy_above_3khz_pct': round(float(hi_share) * 100, 2),
        'wpm_overall': round(words / total * 60, 1), 'wpm_between_first_and_last_word': round(words / speaking * 60, 1),
        'pauses': len(pauses), 'pause_median_s': round(float(np.median(pauses)), 2) if pauses else 0,
        'pause_lengths_s': [round(p, 2) for p in pauses],
    }))
