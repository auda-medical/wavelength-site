# Version 3 narration: Qwen3-TTS (Apache-2.0), CPU. Fero chose audition 4 (Qwen VoiceDesign, description q1: a synthetic
# voice designed from words, no real person). To keep that exact speaker across every line, the Base model speaks each
# line in the voice of a reference cut from audition 4 itself (ref-audition4.wav, three clean sentences, exact text).
#   qwen\Scripts\python.exe narrate_v3.py <film> [line-id ...]
import sys, os, json, time
import truststore
truststore.inject_into_ssl()
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.join(HERE, '..', 'wavelength-business-development', 'video')
REF = os.path.join(HERE, 'auditions', 'ref-audition4.wav')
REF_TEXT = ("You've just scanned a patient, halfway through a busy night shift. The images are good, and the finding matters. "
            "With Wavelength, you log the scan in moments, and send it to a supervisor who can review it when their shift allows. "
            "Wavelength. Tune in. Gain clarity.")
film = sys.argv[1]; only = set(sys.argv[2:])
torch.set_num_threads(max(1, (os.cpu_count() or 4) - 2))
S = json.load(open(os.path.join(VIDEO, 'src', 'v3', 'script.json'), encoding='utf-8'))
out = os.path.join(VIDEO, 'public', 'audio-v3', 'raw', film)
os.makedirs(out, exist_ok=True)
t0 = time.time()
m = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.float32)
prompt = m.create_voice_clone_prompt(ref_audio=REF, ref_text=REF_TEXT)
for line in S['films'][film]:
    if only and line['id'] not in only: continue
    torch.manual_seed(line.get('seed', 7))
    wavs, sr = m.generate_voice_clone(text=line.get('say') or line['text'], language='English', voice_clone_prompt=prompt, do_sample=True, temperature=line.get('temperature', 0.8), top_p=0.92)
    sf.write(os.path.join(out, f"{line['id']}.wav"), wavs[0], sr)
    print(film, line['id'], round(len(wavs[0]) / sr, 2), 's', round(time.time() - t0), flush=True)
print('done', film, round(time.time() - t0), flush=True)
