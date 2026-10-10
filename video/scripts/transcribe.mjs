// Pronunciation check: transcribes each narration file with whisper.cpp (MIT, local, free; installed on first run into
// video/.whisper/) and compares the words with what the script says (word error rate after normalising numbers and
// punctuation). A high error rate on a line flags a word the voice may have mispronounced.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installWhisperCpp, downloadWhisperModel, transcribe } from '@remotion/install-whisper-cpp';
const squash = (t) => t.toLowerCase().replace(/r c e m/g, 'rcem').replace(/fay-mus/g, 'famus').replace(/few-sick/g, 'fusic').replace(/the wavelength dot co dot u k/g, 'thewavelengthdotcodotuk').replace(/.co.uk/g, 'dotcodotuk').replace(/[^a-z0-9]/g, '');
function cer(a, b) { const r = squash(a), h = squash(b); const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]); for (let j = 1; j <= h.length; j++) d[0][j] = j; for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)); return d[r.length][h.length] / Math.max(1, r.length); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WH = path.join(ROOT, '.whisper');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/script.json'), 'utf8'));
await installWhisperCpp({ to: WH, version: '1.5.5' });
await downloadWhisperModel({ model: 'base.en', folder: WH });
const norm = (t) => t.toLowerCase().replace(/[’']/g, "'").replace(/thewavelength\.co\.uk|the wavelength dot co dot u k/g, 'the wavelength dot co dot uk').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
function wer(ref, hyp) { const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...Array(hyp.length).fill(0)]); for (let j = 1; j <= hyp.length; j++) d[0][j] = j; for (let i = 1; i <= ref.length; i++) for (let j = 1; j <= hyp.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)); return d[ref.length][hyp.length] / Math.max(1, ref.length); }
const rows = [];
for (const [film, lines] of Object.entries(S.films)) for (const l of lines) {
  if (!l.say) continue;
  const src = path.join(ROOT, 'public/audio', film, `${l.id}.wav`);
  const w16 = path.join(WH, 'tmp.wav');
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', w16], { shell: process.platform === 'win32' });
  const r = await transcribe({ inputPath: w16, whisperPath: WH, model: 'base.en', whisperCppVersion: '1.5.5' });
  const heard = r.transcription.map((x) => x.text).join('').replace(/\s+/g, ' ').trim();
  const e = cer(l.say, heard);
  rows.push({ id: `${film}/${l.id}`, cer: Math.round(e * 100), heard });
  console.log(`${film}/${l.id}  CER ${Math.round(e * 100)}%  heard: ${heard}`);
}
fs.writeFileSync(path.join(ROOT, 'public/audio/transcripts.json'), JSON.stringify(rows, null, 1));
