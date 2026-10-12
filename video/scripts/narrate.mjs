// Speaks every line in src/script.json with Kokoro-82M (Apache 2.0, runs locally on the CPU, no paid service) in a
// British English voice. Each line becomes public/audio/<film>/<id>.wav, trimmed of leading and trailing silence,
// peak-normalised to -3 dBFS, with its length and loudness in public/audio/timings.json.
//   node scripts/narrate.mjs [film]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KokoroTTS } from 'kokoro-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/script.json'), 'utf8'));
const OUT = path.join(ROOT, 'public/audio');
const TIMINGS = path.join(OUT, 'timings.json');
const timings = fs.existsSync(TIMINGS) ? JSON.parse(fs.readFileSync(TIMINGS, 'utf8')) : {};
const only = process.argv[2];

// 16-bit PCM WAV writer (mono).
function wav(samples, rate) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}
function trim(x, rate, thr = 0.01) {
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  const pad = Math.round(rate * 0.04);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad));
}
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));
// Broadcast-style voice processing: a gentle compressor (3:1 above -26 dBFS, 5 ms attack, 120 ms release), make-up gain,
// then a soft limiter at -1.5 dBFS. Raises the voice's average level without audible pumping or clipping.
function voice(x, rate) {
  const thr = Math.pow(10, -26 / 20), ratio = 3, att = Math.exp(-1 / (0.005 * rate)), rel = Math.exp(-1 / (0.12 * rate));
  let env = 0; const y = new Array(x.length);
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a; const g = env > thr ? Math.pow(env / thr, 1 / ratio - 1) : 1; y[i] = x[i] * g; }
  const target = Math.pow(10, -17 / 20), r = rms(y) || 1, mk = target / r, ceil = Math.pow(10, -1.5 / 20);
  return y.map((v) => ceil * Math.tanh((v * mk) / ceil));
}

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
for (const [film, lines] of Object.entries(S.films)) {
  if (only && film !== only) continue;
  fs.mkdirSync(path.join(OUT, film), { recursive: true });
  for (const l of lines) {
    if (!l.say) { timings[`${film}/${l.id}`] = { seconds: 0, file: null }; continue; }
    // Long lines are spoken sentence by sentence and joined with short pauses, which keeps Kokoro's prosody natural.
    // Whole lines: splitting into sentences produced clipped fragments that transcribed badly (scripts/tts-variants.mjs).
    const parts = [l.say];
    let all = [], rate = 24000;
    for (const [i, part] of parts.entries()) {
      const audio = await tts.generate(part.trim(), { voice: S.voice, speed: S.speed });
      rate = audio.sampling_rate;
      const t = trim(Array.from(audio.audio), rate);
      all = all.concat(t);
      if (i < parts.length - 1) all = all.concat(new Array(Math.round(rate * (/[?]$/.test(part.trim()) ? 0.42 : 0.3))).fill(0));
    }
    const out = voice(all, rate);
    const file = path.join(OUT, film, `${l.id}.wav`);
    fs.writeFileSync(file, wav(out, rate));
    const seconds = out.length / rate;
    const clipped = out.filter((v) => Math.abs(v) >= 0.999).length;
    timings[`${film}/${l.id}`] = { seconds: Math.round(seconds * 1000) / 1000, file: `audio/${film}/${l.id}.wav`, rate, rmsDb: Math.round(20 * Math.log10(rms(out)) * 10) / 10, clipped, words: l.say.split(/\s+/).length };
    console.log(`${film}/${l.id}: ${seconds.toFixed(2)} s, RMS ${timings[`${film}/${l.id}`].rmsDb} dBFS, ${(l.say.split(/\s+/).length / seconds * 60).toFixed(0)} wpm`);
  }
}
fs.writeFileSync(TIMINGS, JSON.stringify(timings, null, 1));
