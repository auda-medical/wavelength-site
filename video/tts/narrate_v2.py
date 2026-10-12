# Version 2 narration with Qwen3-TTS (Apache-2.0), CPU. One synthetic voice per candidate, kept consistent across lines:
#   1. ref:      VoiceDesign speaks REF_TEXT from the written description (a new synthetic voice, not a real person).
#   2. audition: the Base model speaks the audition passage in that voice (voice clone of the synthetic reference).
#   3. film:     the Base model speaks every line of a film from video/src/v2/script.json in that voice.
# Usage:
#   qwen\Scripts\python.exe narrate_v2.py ref <voice>
#   qwen\Scripts\python.exe narrate_v2.py audition <voice>
#   qwen\Scripts\python.exe narrate_v2.py film <voice> <film> [line-id ...]
import sys, os, json, time
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf, numpy as np
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, '..', 'wavelength-business-development', 'video')
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))

VOICES = {
    'q1': "A warm, deep, resonant British English male voice in his late forties with a Received Pronunciation accent. Low register, calm and reassuring. Natural, conversational documentary narration, unhurried, with natural pauses and gentle emphasis. Not an announcer.",
    'q2': "A mature British man with a rich, soft baritone voice, speaking directly and kindly to doctors like a premium documentary voice-over. Moderate, relaxed pace, subtle warmth, understated confidence, smooth and never harsh.",
}
REF_TEXT = "Wavelength is an ultrasound logbook, designed for real clinical practice. It fits around the way you work, on every shift."
AUDITION = ["You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters.",
            "But your supervisor is in the resuscitation room, and by the time they're free, you're three patients further on.",
            "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows.",
            "Every sign-off counts towards your R C E M targets, and the Royal College of Emergency Medicine curriculum.",
            "Wavelength. Tune in. Gain clarity."]

mode, voice = sys.argv[1], sys.argv[2]
ref_path = os.path.join(HERE, 'auditions', f'ref-design-{voice}.wav')
t0 = time.time()
if mode == 'ref':
    m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', device_map='cpu', dtype=torch.float32)
    torch.manual_seed(1234)
    wavs, sr = m.generate_voice_design(text=REF_TEXT, instruct=VOICES[voice], language='English', do_sample=True, temperature=0.8, top_p=0.9)
    sf.write(ref_path, wavs[0], sr)
    print('ref', ref_path, round(len(wavs[0]) / sr, 2), 's in', round(time.time() - t0), 's', flush=True)
    sys.exit(0)

m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
prompt = m.create_voice_clone_prompt(ref_audio=ref_path, ref_text=REF_TEXT)
def speak(text, seed=7):
    torch.manual_seed(seed)
    wavs, sr = m.generate_voice_clone(text=text, language='English', voice_clone_prompt=prompt, do_sample=True, temperature=0.7, top_p=0.9)
    return wavs[0], sr

if mode == 'audition':
    parts = []
    for line in AUDITION:
        w, sr = speak(line); parts += [w, np.zeros(int(sr * 0.4))]
    out = os.path.join(HERE, 'auditions', f'{voice}-final-pipeline.wav')
    sf.write(out, np.concatenate(parts), sr)
    print('audition', out, round(time.time() - t0), 's', flush=True)
elif mode == 'film':
    film = sys.argv[3]; only = set(sys.argv[4:])
    S = json.load(open(os.path.join(VIDEO, 'src', 'v2', 'script.json'), encoding='utf-8'))
    outdir = os.path.join(VIDEO, 'public', 'audio-v2', 'raw', film)
    os.makedirs(outdir, exist_ok=True)
    for line in S['films'][film]:
        if only and line['id'] not in only: continue
        w, sr = speak(line.get('say') or line['text'], seed=line.get('seed', 7))
        sf.write(os.path.join(outdir, f"{line['id']}.wav"), w, sr)
        print(film, line['id'], round(len(w) / sr, 2), 's', flush=True)
    print('film', film, 'done in', round(time.time() - t0), 's', flush=True)
