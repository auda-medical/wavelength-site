// Tries spoken variants of a line and reports how whisper.cpp hears each (character error rate against the intended
// words, spaces ignored, so "log book" and "logbook" match). Used to choose spellings that the voice pronounces well.
//   node scripts/tts-variants.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { KokoroTTS } from 'kokoro-js';
import { transcribe } from '@remotion/install-whisper-cpp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WH = path.join(ROOT, '.whisper');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/script.json'), 'utf8'));
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const squash = (t) => t.toLowerCase().replace(/thewavelength\.co\.uk/g, 'thewavelengthdotcodotuk').replace(/\.co\.uk/g, 'dotcodotuk').replace(/[^a-z0-9]/g, '');
export function cer(a, b) { const r = squash(a), h = squash(b); const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]); for (let j = 1; j <= h.length; j++) d[0][j] = j; for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)); return d[r.length][h.length] / Math.max(1, r.length); }
const TRIES = [['Wavelength. Tune in, gain clarity.', ['Wavelength. Tune in, gain clarity.', 'Wavelength. Tune in, gayn clarity.', 'Wavelength. Tune in. Gain clarity.', 'Wavelength. Tune in, gain, clarity.', 'Wavelength. Tune in. Gane clarity.']]];
const out = [];
for (const [intended, variants] of TRIES) for (const v of variants) {
  const a = await tts.generate(v, { voice: S.voice, speed: S.speed });
  const f = path.join(WH, 'variant.wav'); await a.save(f);
  const w16 = path.join(WH, 'variant16.wav');
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', f, '-ar', '16000', '-ac', '1', w16], { shell: process.platform === 'win32' });
  const r = await transcribe({ inputPath: w16, whisperPath: WH, model: 'base.en', whisperCppVersion: '1.5.5' });
  const heard = r.transcription.map((x) => x.text).join('').replace(/\s+/g, ' ').trim();
  const e = cer(intended, heard);
  out.push({ intended, variant: v, cer: Math.round(e * 100), heard });
  console.log(`${Math.round(e * 100)}%  ${v}\n      heard: ${heard}`);
}
fs.writeFileSync(path.join(WH, 'variants.json'), JSON.stringify(out, null, 1));
