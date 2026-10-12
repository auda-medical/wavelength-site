// Machine transcription of any WAV files (whisper.cpp base.en, local and free), to catch garbled or misread words in
// voice auditions and narration. A supplement to listening, never a substitute.
//   node scripts/hear.mjs <file.wav> [...]
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installWhisperCpp, downloadWhisperModel, transcribe } from '@remotion/install-whisper-cpp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WH = path.join(ROOT, '.whisper');
await installWhisperCpp({ to: WH, version: '1.5.5' });
await downloadWhisperModel({ model: 'base.en', folder: WH });
for (const src of process.argv.slice(2)) {
  const w16 = path.join(WH, 'hear.wav');
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ar', '16000', '-ac', '1', w16], { shell: process.platform === 'win32', cwd: ROOT });
  const r = await transcribe({ inputPath: w16, whisperPath: WH, model: 'base.en', whisperCppVersion: '1.5.5' });
  console.log(`${path.basename(src)}: ${r.transcription.map((x) => x.text).join('').replace(/\s+/g, ' ').trim()}`);
}
