# Version 2 narration with Chatterbox (MIT), CPU, in the designed q2 voice (a synthetic reference made with Qwen3-TTS
# VoiceDesign; no real person's voice is cloned). Each line is spoken sentence by sentence, joined with a short natural
# pause, from video/src/v2/script.json ("say" if present). Output: video/public/audio-v2/raw/<film>/<id>.wav. Every
# output carries Chatterbox's inaudible Perth watermark.
#   cbox\Scripts\python.exe narrate_cbox.py <film> [line-id ...]
import sys, os, re, json, time
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf, numpy as np
from chatterbox.tts import ChatterboxTTS

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, '..', 'wavelength-business-development', 'video')
REF = os.path.join(HERE, 'auditions', 'ref-q2-baritone.wav')
film = sys.argv[1]; only = set(sys.argv[2:])
torch.set_num_threads(10)
S = json.load(open(os.path.join(VIDEO, 'src', 'v2', 'script.json'), encoding='utf-8'))
out = os.path.join(VIDEO, 'public', 'audio-v2', 'raw', film)
os.makedirs(out, exist_ok=True)
t0 = time.time()
m = ChatterboxTTS.from_pretrained(device='cpu')
for line in S['films'][film]:
    if only and line['id'] not in only: continue
    text = line.get('say') or line['text']
    sentences = [s for s in re.split(r'(?<=[.?!])\s+', text) if s.strip()]
    parts = []
    for i, s in enumerate(sentences):
        torch.manual_seed(11 + i)
        w = m.generate(s, audio_prompt_path=REF, exaggeration=line.get('exaggeration', 0.45), cfg_weight=0.45).squeeze(0).numpy()
        parts.append(w)
        if i < len(sentences) - 1: parts.append(np.zeros(int(m.sr * 0.32)))
    sf.write(os.path.join(out, f"{line['id']}.wav"), np.concatenate(parts), m.sr)
    print(film, line['id'], round(sum(len(p) for p in parts) / m.sr, 2), 's', round(time.time() - t0), flush=True)
print('done', film, round(time.time() - t0), flush=True)
