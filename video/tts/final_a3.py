# Final version 4 narration corrections (owner, 11 October 2026; ChatGPT 21:02 and 21:05), voice 4 (Qwen3-TTS Base,
# cloned from audition 4: a designed synthetic voice, no real person). Natural generation only: the voice reference,
# the punctuation, the seed and the temperature steer the delivery; no pitch shifting, time-stretching or processing.
#   opening (flagship f03, same words): calmer, mellower, conversational; concern without urgency or projection.
#   closing (flagship f13 and ad a03): Take 2's warm, steady character; "Tune in" calm; then "Gain clarity" in a
#            clearly deeper register, "Gain" held a little, a tiny separation before "clarity", which settles warmly.
# Takes go to takes/v4/final-a3/<job>/ (nothing else is touched).
#   qwen\Scripts\python.exe -I final_a3.py [opening|closing|both] [seeds-per-variant]
import sys, os, json, time
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
FULL_TEXT = ("You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters. "
             "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. "
             "Wavelength. Tune in. Gain clarity.")
CALM_TEXT = "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. Wavelength. Tune in. Gain clarity."
REFS = {'full': ('auditions/ref-audition4.wav', FULL_TEXT), 'calm': ('auditions/ref4-mid.wav', CALM_TEXT)}
OPEN = "And before you know it, another week has passed. Your scans shouldn't be forgotten, simply because your rotas don't match."
JOBS = {
    # The same words; softer punctuation lets the sentence flow instead of landing hard on each stress.
    'opening': [('calm', 'plain', OPEN, 0.7), ('calm', 'flow', OPEN.replace('has passed. Your', 'has passed, and your').replace('And before', 'And, before'), 0.7),
                ('full', 'plain', OPEN, 0.7), ('calm', 'soft', OPEN.replace('. Your', '... your'), 0.75)],
    # Take 2 was the full reference, plain text, seed 917, temperature 0.9.
    'closing': [('full', 'comma', 'Wavelength. Tune in. Gain, clarity.', 0.9), ('full', 'held', 'Wavelength. Tune in. Gain... clarity.', 0.9),
                ('full', 'plain', 'Wavelength. Tune in. Gain clarity.', 0.85)],
}
job = sys.argv[1] if len(sys.argv) > 1 else 'both'
n = int(sys.argv[2]) if len(sys.argv) > 2 else 4
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))
m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
prompts = {k: m.create_voice_clone_prompt(ref_audio=os.path.join(HERE, r), ref_text=t) for k, (r, t) in REFS.items()}
for j in (['opening', 'closing'] if job == 'both' else [job]):
    out = os.path.join(HERE, 'takes', 'v4', 'final-a3', j); os.makedirs(out, exist_ok=True)
    log = []
    for (ref, tag, text, temp) in JOBS[j]:
        for k in range(n):
            seed = (917 if j == 'closing' else 300) + k * 29
            torch.manual_seed(seed); t0 = time.time()
            wavs, sr = m.generate_voice_clone(text=text, language='English', voice_clone_prompt=prompts[ref], do_sample=True, temperature=temp, top_p=0.92)
            f = os.path.join(out, f'{ref}-{tag}-{k}.wav'); sf.write(f, wavs[0], sr)
            log.append({'file': os.path.basename(f), 'ref': ref, 'text': text, 'seed': seed, 'temperature': temp, 'seconds': round(time.time() - t0, 1)})
            print(j, json.dumps(log[-1]), flush=True)
    json.dump(log, open(os.path.join(out, 'takes.json'), 'w'), indent=1)
print('done', flush=True)
