// Final Version 4 narration corrections, mixes and renders (owner's choices of 11 October 2026, ChatGPT 21:02 and
// 21:05): Candidate A music, logo sound L2, closing Take 2 with its small adjustment, the narration 2.0 dB lower than
// the earlier presentation, and a calmer opening line (flagship f03). Not for publication: owner viewing, listening and
// FAMUS/FUSIC pronunciation approval come first.
//
//   node scripts/final-a3.mjs before                  mixes with the narration as auditioned (old f03, Take 2), for the
//                                                     before/after extracts (mix/final-a3-before/)
//   node scripts/final-a3.mjs install <f03 take> <closing take>
//                                                     the chosen natural takes (tts-lab/takes/v4/final-a3/...): f03
//                                                     replaces raw/flagship/f03.wav (the old one is kept in
//                                                     raw/_before-a3/), the closing line goes to raw/tagline-a3/F.wav
//                                                     with the pause after "Tune in." at least 0.65 s, as for Take 2.
//                                                     Then: voice-v2 --v4 flagship tagline-a3, music-v4 flagship A.
//   node scripts/final-a3.mjs mix                     the final mixes (mix/final-a3/<film>.wav) and a report
//
// The only edit to a take is silence added inside the existing pause after "Tune in." (10 ms fades inside the
// silence). No pitch shifting, time-stretching or EQ. The closing line sits 1 dB under the other lines, exactly as
// Take 2 was auditioned (--tagline-db=-1), and the whole narration 2.0 dB (+-0.1) below the earlier presentation
// (mix-v4.mjs --voice-db, found per film as in mix-a2.mjs), with music, logo and master gain unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = path.resolve(ROOT, '..', '..', 'tts-lab', 'takes', 'v4', 'final-a3');
const RAW = path.join(ROOT, 'public/audio-v4/raw');
const P = ['--level=head', '--protect-logo', '--logo=L2'];
const FILMS = ['flagship', 'short', 'ad'];
const PAUSE = 0.65;
const [cmd, ...rest] = process.argv.slice(2);

function read(f) {
  const b = fs.readFileSync(f); let o = 12, rate = 24000, bits = 16, fmt = 1, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') { fmt = b.readUInt16LE(o + 8); rate = b.readUInt32LE(o + 12); bits = b.readUInt16LE(o + 22); } if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data.length / (bits / 8), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = fmt === 3 ? data.readFloatLE(i * 4) : data.readInt16LE(i * 2) / 32768;
  return { x, rate };
}
function write(f, x, rate) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf);
}
// Silent runs inside the speech (as tagline-a2.mjs): 10 ms frames 35 dB below the loudest, at least 150 ms long.
function pauses(x, rate) {
  const w = Math.round(0.01 * rate), lv = [];
  for (let s = 0; s + w <= x.length; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += x[i] * x[i]; lv.push(10 * Math.log10(a / w + 1e-12)); }
  const top = Math.max(...lv), quiet = lv.map((v) => v < top - 35);
  const first = quiet.indexOf(false), last = quiet.lastIndexOf(false), out = [];
  for (let i = first; i <= last; i++) if (quiet[i]) { let j = i; while (j <= last && quiet[j]) j++; if (j - i >= 15) out.push([i * w, j * w]); i = j; }
  return out;
}
const mixRun = (args, as, voiceDb) => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/mix-v4.mjs'), ...args, `--as=${as}`, ...(voiceDb ? [`--voice-db=${voiceDb}`] : [])], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const r = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
  return { voiceDb: voiceDb || 0, integratedLUFS: r.integratedLUFS, truePeakDBTP: r.truePeakDBTP, voiceLUFS: r.voiceIntegratedLUFS, speechToMusicDb: r.speechToMusicDb, limiterMaxReductionDb: r.limiterMaxReductionDb, masterGainDb: r.masterGainDb };
};
// The narration exactly 2.0 dB below the same mix without --voice-db (the search of mix-a2.mjs).
function lower(args, as) {
  const now = mixRun(args, 'final-a3-probe');
  const target = now.voiceLUFS - 2.0;
  let a = -0.5, ra = mixRun(args, 'final-a3-probe', a), b = -2.0, rb = mixRun(args, 'final-a3-probe', b), best = Math.abs(ra.voiceLUFS - target) < Math.abs(rb.voiceLUFS - target) ? ra : rb;
  for (let i = 0; i < 6 && Math.abs(best.voiceLUFS - target) > 0.1; i++) {
    const c = +(a + (target - ra.voiceLUFS) * (b - a) / (rb.voiceLUFS - ra.voiceLUFS)).toFixed(2), rc = mixRun(args, 'final-a3-probe', c);
    if (Math.abs(rc.voiceLUFS - target) < Math.abs(best.voiceLUFS - target)) best = rc;
    [a, ra, b, rb] = [b, rb, c, rc];
  }
  const fin = mixRun(args, as, best.voiceDb);
  return { earlierPresentation: now, final: fin, voiceChangeDb: +(fin.voiceLUFS - now.voiceLUFS).toFixed(2) };
}
// Each film's soundtrack: one mix-v4 run per film (it writes mix/<as>/<film>.wav and its stems).
function mixAll(as, tagline) {
  const report = {};
  for (const film of FILMS) {
    const args = [film, 'A', ...P, ...(film !== 'short' && tagline ? [`--tagline=${tagline}`, '--tagline-db=-1'] : [])];
    report[film] = { args, ...lower(args, as) };
    console.log(as, film, JSON.stringify(report[film].final), 'voice change', report[film].voiceChangeDb);
  }
  fs.rmSync(path.join(ROOT, 'public/audio-v4/mix/final-a3-probe'), { recursive: true, force: true });
  fs.writeFileSync(path.join(ROOT, `public/audio-v4/mix/${as}/report-final-a3.json`), JSON.stringify(report, null, 1));
  return report;
}

if (cmd === 'before') mixAll('final-a3-before', 'audio-v4/tagline-a2/T2.wav');
else if (cmd === 'install') {
  const [open, close] = rest;
  if (!open || !close) throw new Error('install <f03 take> <closing take>');
  const keep = path.join(RAW, '_before-a3', 'flagship-f03.wav');
  if (!fs.existsSync(keep)) { fs.mkdirSync(path.dirname(keep), { recursive: true }); fs.copyFileSync(path.join(RAW, 'flagship', 'f03.wav'), keep, fs.constants.COPYFILE_EXCL); }
  fs.copyFileSync(path.resolve(LAB, open), path.join(RAW, 'flagship', 'f03.wav'));
  const { x, rate } = read(path.resolve(LAB, close));
  const ps = pauses(x, rate);
  // The pause after "Tune in." is the second silent run; a shorter joint inside "Gain clarity" may follow it.
  if (ps.length < 2) throw new Error(`${close}: expected at least two pauses, found ${ps.length}`);
  const [a, b] = ps[1], have = (b - a) / rate;
  let y = x, added = 0;
  if (have < PAUSE) {
    const mid = Math.round((a + b) / 2), add = Math.round((PAUSE - have) * rate), f = Math.round(0.01 * rate);
    const head = Float32Array.from(x.subarray(0, mid)), tail = Float32Array.from(x.subarray(mid));
    for (let i = 0; i < f; i++) { head[head.length - 1 - i] *= i / f; tail[i] *= i / f; }
    y = new Float32Array(x.length + add); y.set(head, 0); y.set(tail, head.length + add); added = +(add / rate).toFixed(3);
  }
  write(path.join(RAW, 'tagline-a3', 'F.wav'), y, rate);
  const rec = { installedAt: new Date().toISOString(), opening: { take: open, replaces: 'raw/flagship/f03.wav', kept: 'raw/_before-a3/flagship-f03.wav' }, closing: { take: close, pauseAfterTuneIn: +have.toFixed(2), silenceAdded: added, seconds: +(y.length / rate).toFixed(2), file: 'raw/tagline-a3/F.wav' } };
  fs.writeFileSync(path.join(RAW, 'tagline-a3', 'install.json'), JSON.stringify(rec, null, 1));
  console.log(JSON.stringify(rec, null, 1));
} else if (cmd === 'mix') mixAll('final-a3', 'audio-v4/tagline-a3/F.wav');
else console.log('node scripts/final-a3.mjs before | install <f03 take> <closing take> | mix');
