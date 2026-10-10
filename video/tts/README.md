# Voice lab (version 2 narration)

Python scripts for the version 2 narration. They run in a separate folder outside the repository
(`C:\Users\phira\Wavelength-Cloud\tts-lab`) with their own environments, because the models are several gigabytes:

```
python -m pip install --user uv
set UV_NATIVE_TLS=1
python -m uv venv --python 3.12 qwen
python -m uv pip install --python qwen\Scripts\python.exe --extra-index-url https://download.pytorch.org/whl/cpu torch torchaudio qwen-tts soundfile truststore
python -m uv venv --python 3.11 cbox
python -m uv pip install --python cbox\Scripts\python.exe --extra-index-url https://download.pytorch.org/whl/cpu chatterbox-tts soundfile truststore "setuptools<81"
```

| Script | Purpose |
|---|---|
| `audition_qwen.py` | Qwen3-TTS VoiceDesign auditions from written voice descriptions (synthetic voices, no real person) |
| `narrate_v2.py` | Qwen pipeline: design a reference voice once, then speak every line in it with the Base model |
| `audition_cbox.py`, `narrate_cbox.py` | Chatterbox (MIT) speaking a designed synthetic reference voice; output carries the inaudible Perth watermark |
| `analyse_voice.py` | Objective measures: pitch, pitch range, brightness, pace, pauses (supporting evidence, never a substitute for listening) |

After generating raw lines into `video/public/audio-v2/raw/<film>/`, run `node scripts/voice-v2.mjs` (trim, level,
timings), then `node scripts/music-v2.mjs`, `node scripts/captions-v2.mjs <out>` and `node scripts/render.mjs --v2`.
Licences: Qwen3-TTS Apache-2.0; Chatterbox MIT. Both run locally and free on CPU (about 11 to 13 times slower than
real time on this computer).
