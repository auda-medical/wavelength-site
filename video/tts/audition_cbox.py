# Chatterbox (MIT) audition on CPU. Chatterbox speaks in the voice of a reference recording; the reference here is a
# synthetic voice designed with Qwen3-TTS VoiceDesign (no real person's voice is cloned).
#   cbox\Scripts\python.exe audition_cbox.py <reference.wav> <out.wav> [exaggeration] [cfg_weight]
import sys, time
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf
from chatterbox.tts import ChatterboxTTS

ref, out = sys.argv[1], sys.argv[2]
ex = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
cfg = float(sys.argv[4]) if len(sys.argv) > 4 else 0.45
torch.set_num_threads(10)
TEXT = ["You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters.",
        "But your supervisor is in the resuscitation room, and by the time they're free, you're three patients further on.",
        "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows.",
        "Every sign-off counts towards your R C E M targets, and the Royal College of Emergency Medicine curriculum.",
        "Wavelength. Tune in. Gain clarity."]
t = time.time()
m = ChatterboxTTS.from_pretrained(device='cpu')
print('loaded', round(time.time() - t), flush=True)
parts = []
for line in TEXT:
    w = m.generate(line, audio_prompt_path=ref, exaggeration=ex, cfg_weight=cfg)
    parts.append(w.squeeze(0).numpy())
    parts.append(torch.zeros(int(m.sr * 0.45)).numpy())
import numpy as np
sf.write(out, np.concatenate(parts), m.sr)
print('done', out, round(time.time() - t), flush=True)
