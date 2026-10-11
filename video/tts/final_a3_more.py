# Final version 4 closing correction, second batch (11 October 2026). In the first batch (final_a3.py) only the "held"
# phrasing ("Gain... clarity.") kept "Gain clarity" as one phrase with a slight hold on "Gain" and a tiny joint
# (full-held-0); the comma phrasing and most held seeds came apart into "Gain. Clarity." This batch tries ten more seeds
# of the held phrasing at Take 2's temperature, and four at a slightly steadier one, to find a take that also moves a
# little more in pitch and settles warmly. Voice 4 (Qwen3-TTS Base, cloned from audition 4: a designed synthetic voice,
# no real person). Natural generation only: no pitch shifting, time-stretching or processing.
# Takes go to takes/v4/final-a3/closing-more/ (nothing else is touched).
#   qwen\Scripts\python.exe -I final_a3_more.py
import sys, os, json, time
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
FULL_TEXT = ("You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters. "
             "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. "
             "Wavelength. Tune in. Gain clarity.")
REF = ('auditions/ref-audition4.wav', FULL_TEXT)
TEXT = 'Wavelength. Tune in. Gain... clarity.'
JOBS = [('held', 0.9, range(4, 14)), ('held85', 0.85, range(0, 4))]
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))
m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
prompt = m.create_voice_clone_prompt(ref_audio=os.path.join(HERE, REF[0]), ref_text=REF[1])
out = os.path.join(HERE, 'takes', 'v4', 'final-a3', 'closing-more'); os.makedirs(out, exist_ok=True)
log = []
for (tag, temp, seeds) in JOBS:
    for k in seeds:
        seed = 917 + k * 29
        torch.manual_seed(seed); t0 = time.time()
        wavs, sr = m.generate_voice_clone(text=TEXT, language='English', voice_clone_prompt=prompt, do_sample=True, temperature=temp, top_p=0.92)
        f = os.path.join(out, f'full-{tag}-{k}.wav'); sf.write(f, wavs[0], sr)
        log.append({'file': os.path.basename(f), 'ref': 'full', 'text': TEXT, 'seed': seed, 'temperature': temp, 'seconds': round(time.time() - t0, 1)})
        print('closing-more', json.dumps(log[-1]), flush=True)
json.dump(log, open(os.path.join(out, 'takes.json'), 'w'), indent=1)
print('done', flush=True)
