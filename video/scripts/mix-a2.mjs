// Audition 2 mixes, with the narration exactly 2.0 dB below its current presentation (owner's level note, 11 October
// 2026). For each mix: run mix-v4.mjs as now (the current pipeline, with its make-up gain) to measure the voice's
// integrated loudness in the master; then find the --voice-db that puts the voice 2.0 dB (+-0.1) lower in the master,
// with music, logo and master gain unchanged and no make-up gain (mix-v4.mjs --voice-db). The current-level mix is kept
// where the level comparison needs it. Reports every mix's measurements to public/audio-v4/linger/mixes-a2.json.
//   node scripts/mix-a2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = ['--level=head', '--protect-logo'];
const tag = (t) => [`--tagline=audio-v4/tagline-a2/${t}.wav`, '--tagline-db=-1'];
const SPECS = [
  ...['TN1', 'MX', 'L1', 'L2', 'L3'].map((k) => ({ as: `a2-${k}`, args: ['logo', 'A', `--logo=${k}`, ...P] })),
  ...['T1', 'T2', 'T3'].map((t) => ({ as: `a2-t-${t}`, args: ['closing', 'A', '--logo=signature', ...P, ...tag(t)] })),
  { as: 'a2-t-current', args: ['closing', 'A', '--logo=signature', ...P] },
  { as: 'a2-lvl-T1-lower', current: 'a2-lvl-T1-now', args: ['closing', 'A', '--logo=signature', ...P, ...tag('T1')] },
  ...[['L1', 'T1'], ['L2', 'T1'], ['L2', 'T2']].map(([k, t]) => ({ as: `a2-c-${k}-${t}`, args: ['logo', 'A', `--logo=${k}`, ...P, ...tag(t)] })),
];
const run = (args, as, voiceDb) => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/mix-v4.mjs'), ...args, `--as=${as}`, ...(voiceDb ? [`--voice-db=${voiceDb}`] : [])], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const r = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
  return { voiceDb: voiceDb || 0, integratedLUFS: r.integratedLUFS, truePeakDBTP: r.truePeakDBTP, voiceLUFS: r.voiceIntegratedLUFS, speechToMusicDb: r.speechToMusicDb, limiterMaxReductionDb: r.limiterMaxReductionDb, masterGainDb: r.masterGainDb };
};
const report = {};
for (const s of SPECS) {
  const now = run(s.args, s.current || 'a2-probe');
  const target = now.voiceLUFS - 2.0;
  let a = -0.5, ra = run(s.args, 'a2-probe', a), b = -2.0, rb = run(s.args, 'a2-probe', b), best = Math.abs(ra.voiceLUFS - target) < Math.abs(rb.voiceLUFS - target) ? ra : rb;
  for (let i = 0; i < 6 && Math.abs(best.voiceLUFS - target) > 0.1; i++) {
    const c = +(a + (target - ra.voiceLUFS) * (b - a) / (rb.voiceLUFS - ra.voiceLUFS)).toFixed(2), rc = run(s.args, 'a2-probe', c);
    if (Math.abs(rc.voiceLUFS - target) < Math.abs(best.voiceLUFS - target)) best = rc;
    [a, ra, b, rb] = [b, rb, c, rc];
  }
  const fin = run(s.args, s.as, best.voiceDb);
  report[s.as] = { current: now, lower: fin, voiceChangeDb: +(fin.voiceLUFS - now.voiceLUFS).toFixed(2) };
  console.log(s.as, JSON.stringify(report[s.as]));
}
fs.rmSync(path.join(ROOT, 'public/audio-v4/mix/a2-probe'), { recursive: true, force: true });
fs.writeFileSync(path.join(ROOT, 'public/audio-v4/linger/mixes-a2.json'), JSON.stringify(report, null, 1));
