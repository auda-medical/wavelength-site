// Word timings for the final narration corrections (11 October 2026): whisper.cpp base.en with token-level
// timestamps, local and free. Prints one JSON line per file: the transcript and each word with its start and end
// (seconds). Used to confirm "Gain" (not "Game"), how long "Gain" is held and the gap before "clarity".
// A supplement to listening, never a substitute.
//   node scripts/words-a3.mjs <file.wav> [...]
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installWhisperCpp, downloadWhisperModel, transcribe } from '@remotion/install-whisper-cpp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WH = path.join(ROOT, '.whisper');
await installWhisperCpp({ to: WH, version: '1.5.5' });
await downloadWhisperModel({ model: 'base.en', folder: WH });
for (const src of process.argv.slice(2)) {
  const w16 = path.join(WH, 'words.wav');
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', w16], { shell: process.platform === 'win32', cwd: ROOT });
  const r = await transcribe({ inputPath: w16, whisperPath: WH, model: 'base.en', whisperCppVersion: '1.5.5', tokenLevelTimestamps: true });
  // Tokens: sub-word pieces; a new word starts at a token with a leading space. Special tokens ([_BEG_] etc.) skipped.
  const words = [];
  for (const item of r.transcription) for (const t of item.tokens) {
    if (/^\[_|^<\|/.test(t.text) || !t.text.trim()) continue;
    if (/^\s/.test(t.text) || !words.length) words.push({ w: t.text.trim(), start: t.offsets.from / 1000, end: t.offsets.to / 1000 });
    else { const w = words[words.length - 1]; w.w += t.text; w.end = t.offsets.to / 1000; }
  }
  console.log(JSON.stringify({ file: path.basename(src), text: r.transcription.map((x) => x.text).join('').replace(/\s+/g, ' ').trim(), words }));
}
