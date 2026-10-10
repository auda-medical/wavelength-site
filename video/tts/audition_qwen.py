# Voice auditions for the Wavelength films (version 2), Qwen3-TTS VoiceDesign (Apache-2.0), CPU.
# Each designed voice is a new synthetic voice described in words: no real person's voice is cloned.
#   qwen\Scripts\python.exe audition_qwen.py <outdir> [variant ...]
import sys, os, time, json
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

OUT = sys.argv[1] if len(sys.argv) > 1 else 'auditions'
PICK = sys.argv[2:]
os.makedirs(OUT, exist_ok=True)
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))

# Real lines from the version 2 script: conversational opening, clinical context, product benefit, an accreditation term,
# the name and the tagline.
TEXT = ("You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters. "
        "But your supervisor is in the resuscitation room, and by the time they're free, you're three patients further on. "
        "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. "
        "Every sign-off counts towards your R C E M targets, and the Royal College of Emergency Medicine curriculum. "
        "Wavelength. Tune in. Gain clarity.")

VOICES = {
    'q1-documentary': "A warm, deep, resonant British English male voice in his late forties with a Received Pronunciation accent. Low register, calm and reassuring. Natural, conversational documentary narration, unhurried, with natural pauses and gentle emphasis. Not an announcer.",
    'q2-baritone': "A mature British man with a rich, soft baritone voice, speaking directly and kindly to doctors like a premium documentary voice-over. Relaxed pace, subtle warmth, understated confidence, smooth and never harsh.",
    'q3-intimate': "A deep, smooth, slightly textured British English male voice, close to the microphone, calm and sincere. Measured pacing that varies naturally, quiet confidence, warm low tones, no exaggerated enthusiasm.",
}

t0 = time.time()
model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', device_map='cpu', dtype=torch.float32)
print(f'loaded in {time.time() - t0:.0f}s', flush=True)
report = {}
for name, instruct in VOICES.items():
    if PICK and name not in PICK:
        continue
    torch.manual_seed(1234)
    t = time.time()
    wavs, sr = model.generate_voice_design(text=TEXT, instruct=instruct, language='English', do_sample=True, temperature=0.8, top_p=0.9)
    path = os.path.join(OUT, f'{name}.wav')
    sf.write(path, wavs[0], sr)
    secs = len(wavs[0]) / sr
    report[name] = {'file': path, 'seconds': round(secs, 2), 'generate_seconds': round(time.time() - t, 1), 'sample_rate': sr, 'instruct': instruct}
    print(name, report[name], flush=True)
with open(os.path.join(OUT, 'qwen-report.json'), 'w') as f:
    json.dump({'text': TEXT, 'voices': report}, f, indent=1)
