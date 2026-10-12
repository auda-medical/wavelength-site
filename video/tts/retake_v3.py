# Version 3 retakes: speak a line several times (different seeds, same voice reference), measure each take, keep the
# best. Score: pace closest to 148 words a minute (inside 135 to 160 preferred), pitch range of at least 7 semitones
# (expressive, not flat), and every word present (checked afterwards by transcription in the video project).
# No time-stretching or pitch processing: only natural takes.
#   qwen\Scripts\python.exe retake_v3.py <film> <line-id> [takes]
import sys, os, json, time, subprocess
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf, numpy as np
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, '..', 'wavelength-business-development', 'video')
REF = os.path.join(HERE, 'auditions', 'ref-audition4.wav')
REF_TEXT = ("You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters. "
            "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. "
            "Wavelength. Tune in. Gain clarity.")
film, lid = sys.argv[1], sys.argv[2]
takes = int(sys.argv[3]) if len(sys.argv) > 3 else 4
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))
S = json.load(open(os.path.join(VIDEO, 'src', 'v3', 'script.json'), encoding='utf-8'))
line = next(l for l in S['films'][film] if l['id'] == lid)
text = line.get('say') or line['text']
words = len(line['text'].split())
out = os.path.join(VIDEO, 'public', 'audio-v3', 'raw', film)
tdir = os.path.join(HERE, 'takes', film, lid); os.makedirs(tdir, exist_ok=True)
m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
prompt = m.create_voice_clone_prompt(ref_audio=REF, ref_text=REF_TEXT)
results = []
for k in range(takes):
    seed = 100 + k * 17
    torch.manual_seed(seed)
    wavs, sr = m.generate_voice_clone(text=text, language='English', voice_clone_prompt=prompt, do_sample=True, temperature=0.8, top_p=0.92)
    p = os.path.join(tdir, f'take{k}.wav'); sf.write(p, wavs[0], sr)
    a = json.loads(subprocess.run([sys.executable, '-I', os.path.join(HERE, 'analyse_voice.py'), str(words), p], capture_output=True, text=True).stdout.strip().splitlines()[-1])
    score = abs(a['wpm_overall'] - 148) + max(0, 7 - a['f0_spread_semitones_p10_p90']) * 6
    results.append({ 'take': k, 'seed': seed, 'wpm': a['wpm_overall'], 'range': a['f0_spread_semitones_p10_p90'], 'f0': a['f0_median_hz'], 'score': round(score, 1), 'file': p })
    print(film, lid, results[-1], flush=True)
best = min(results, key=lambda r: r['score'])
json.dump({ 'line': lid, 'text': text, 'takes': results, 'chosen': best['take'] }, open(os.path.join(tdir, 'takes.json'), 'w'), indent=1)
import shutil; shutil.copy(best['file'], os.path.join(out, f'{lid}.wav'))
print('chosen', film, lid, best, flush=True)
