# Version 4 closing tagline auditions in voice 4 (Qwen3-TTS Base, cloned from audition 4 itself: a designed synthetic
# voice, no real person). The delivery is steered only by natural means: which part of the audition is used as the
# voice reference (the whole audition, its calm ending, or its own tagline), the punctuation of the text, and the
# sampling seed and temperature. No pitch shifting, time-stretching or other processing.
#   qwen\Scripts\python.exe tagline_v4.py [takes-per-combination] [prompt:text] [first-take-index]
#   e.g. tagline_v4.py 8 full:line 4   (eight more takes of the whole line with the full reference)
import sys, os, json
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'takes', 'v4', 'tagline'); os.makedirs(OUT, exist_ok=True)
FULL_TEXT = ("You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters. "
             "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. "
             "Wavelength. Tune in. Gain clarity.")
PROMPTS = {
    'full': ('auditions/ref-audition4.wav', FULL_TEXT),
    'calm': ('auditions/ref4-mid.wav', "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. Wavelength. Tune in. Gain clarity."),
    'tag': ('auditions/ref4-tagline.wav', 'Wavelength. Tune in. Gain clarity.'),
}
TEXTS = {'ti': 'Tune in.', 'gc': 'Gain clarity.', 'line': 'Tune in. Gain clarity.'}
n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
only = sys.argv[2].split(':') if len(sys.argv) > 2 else None
first = int(sys.argv[3]) if len(sys.argv) > 3 else 0
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))
m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
log = []
for pk, (ref, rtext) in PROMPTS.items():
    if only and pk != only[0]: continue
    prompt = m.create_voice_clone_prompt(ref_audio=os.path.join(HERE, ref), ref_text=rtext)
    for tk, text in TEXTS.items():
        if only and tk != only[1]: continue
        for k in range(first, first + n):
            seed, temp = 700 + k * 13, (0.7 if k % 2 == 0 else 0.85)
            torch.manual_seed(seed)
            wavs, sr = m.generate_voice_clone(text=text, language='English', voice_clone_prompt=prompt, do_sample=True, temperature=temp, top_p=0.92)
            f = os.path.join(OUT, f'{pk}-{tk}-{k}.wav'); sf.write(f, wavs[0], sr)
            log.append({'file': f, 'prompt': pk, 'text': text, 'seed': seed, 'temperature': temp})
            print(json.dumps(log[-1]), flush=True)
json.dump(log, open(os.path.join(OUT, f'takes-{first}.json' if first else 'takes.json'), 'w'), indent=1)
print('done', len(log), flush=True)
