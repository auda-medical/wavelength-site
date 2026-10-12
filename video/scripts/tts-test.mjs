// Quick check that Kokoro runs locally and lists its British English voices.
import { KokoroTTS } from 'kokoro-js';
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const voices = Object.entries(tts.voices).filter(([k]) => k.startsWith('b'));
console.log(voices.map(([k, v]) => `${k} ${v.name} ${v.gender} grade ${v.overallGrade}`).join('\n'));
const out = process.argv[2] || 'out-test';
for (const v of ['bf_emma', 'bm_george', 'bm_fable', 'bf_isabella']) {
  const t0 = Date.now();
  const audio = await tts.generate('Your ultrasound logbook. Free to use. Designed for real clinical practice.', { voice: v, speed: 0.95 });
  await audio.save(`${out}-${v}.wav`);
  console.log(v, 'ok', Date.now() - t0, 'ms');
}
