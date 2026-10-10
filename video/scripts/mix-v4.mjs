// Version 4 soundtrack mixer. Builds each film's soundtrack outside Remotion from separate stems, so the balance can be
// measured and the stems delivered:
// - narration (public/audio-v4/<film>/*.wav, upsampled 24 to 48 kHz with a windowed-sinc filter) at its scene times;
// - music (public/audio-v4/music/<candidate>/<film>.wav) under gentle volume automation: it sits a set distance below
//   the voice while anyone speaks (target 15 dB, inside the 12 to 18 dB range in the brief), and rises by `lift` dB
//   only in real pauses (a second or more), with slow cosine ramps (0.35 s down before speech, 0.9 s up after);
//   pauses shorter than a second stay down, so there is no pumping;
// - the logo sound (public/audio-v4/sfx) placed so its second note lands on the frame the logo settles.
// Mastering: integrated loudness to -15 LUFS, look-ahead limiter, true peak checked (4x oversampled) at or below
// -1.0 dBTP. Writes the master and the stems (scaled by the same master gain, so voice + music + logo = master before
// limiting) and a JSON report of the measurements.
//   node scripts/mix-v4.mjs [sample,flagship,short,ad] [A,B,C] [--logo=single] [--out=<dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, readWav, writeWav, lufs, truePeak, limiter, scale } from './music-v4/engine.mjs';
import { timeline4, cues, SUBSETS, FPS, SETTLE } from '../src/v4/plans.js';
import { momentaryMax } from './sonar-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const films = (pos[0] || 'sample').split(','), cands = (pos[1] || 'A,B,C').split(',');
const logoKind = (args.find((a) => a.startsWith('--logo=')) || '--logo=signature').slice(7);
const OUT = path.resolve(ROOT, (args.find((a) => a.startsWith('--out=')) || '--out=public/audio-v4/mix').slice(6));
// --as=<dir>: write into OUT/<dir>/ instead of OUT/<candidate>/ (used to keep one mix per logo sound).
const AS = (args.find((a) => a.startsWith('--as=')) || '').slice(5) || null;
// --level=momentary: set the logo sound's loudest moment (maximum momentary loudness) a fixed distance under the
// voice's integrated loudness. Used for the sonar comparisons so every logo sound, including the earlier two-note
// reference, plays at the same perceived level. Without it, the earlier version 4 rule applies.
const MOMENTARY = args.includes('--level=momentary');
const SONAR = fs.existsSync(path.join(ROOT, 'public/audio-v4/sonar/sonar.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/sonar/sonar.json'), 'utf8')) : {};
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/timings.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/v4/script.json'), 'utf8'));
export const MIX = { speechToMusic: 15, lift: 6, down: 0.35, up: 0.9, minGap: 1.0, logoBelowVoice: 5, logoMomentaryBelowVoice: 1, target: -15, ceilingTP: -1.0 };

// 2x upsampling (24 to 48 kHz): zero-stuffing then a 97-tap windowed-sinc low-pass at the old Nyquist.
function up2(x) {
  const n = x.length * 2, y = new Float32Array(n), taps = 48, h = [];
  for (let k = -taps; k <= taps; k++) { const t = k / 2; const w = 0.42 + 0.5 * Math.cos(Math.PI * k / (taps + 1)) + 0.08 * Math.cos(2 * Math.PI * k / (taps + 1)); h.push((k === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * w); }
  for (let i = 0; i < n; i++) { let s = 0; for (let k = -taps; k <= taps; k++) { const j = i - k; if (j >= 0 && j < n && j % 2 === 0) s += x[j / 2] * h[k + taps]; } y[i] = s; }
  return y;
}
function loadMono(file) {
  const { L, rate } = readWav(path.join(ROOT, 'public', file));
  if (rate === RATE) return L;
  if (rate * 2 === RATE) return up2(L);
  throw new Error(`unexpected rate ${rate} in ${file}`);
}
const smooth = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));

export function mixFilm(film, cand) {
  const key = SUBSETS[film] ? 'flagship' : film;
  const tl = timeline4(key, T, S, SUBSETS[film] || null);
  const n = Math.round(tl.total / FPS * RATE);
  const voice = new Float32Array(n), mL = new Float32Array(n), mR = new Float32Array(n), sL = new Float32Array(n), sR = new Float32Array(n);
  // Narration.
  const regions = [];
  for (const sc of tl.scenes) if (sc.audio) {
    const v = loadMono(sc.audio), s0 = Math.round(sc.voiceFrom / FPS * RATE);
    for (let i = 0; i < v.length && s0 + i < n; i++) voice[s0 + i] += v[i];
    regions.push([s0 / RATE, (s0 + v.length) / RATE]);
  }
  // Merge speech regions separated by less than minGap (the music stays down through short pauses).
  const sp = []; for (const r of regions.sort((a, b) => a[0] - b[0])) { const last = sp[sp.length - 1]; if (last && r[0] - last[1] < MIX.minGap) last[1] = Math.max(last[1], r[1]); else sp.push([...r]); }
  // Music.
  const mus = readWav(path.join(ROOT, `public/audio-v4/music/${cand}/${film}.wav`));
  for (let i = 0; i < n && i < mus.L.length; i++) { mL[i] = mus.L[i]; mR[i] = mus.R[i]; }
  // Logo sounds: full reveal at the brand scene (settle 2.0 s into its file), short reveal on the end frame (1.1 s).
  const place = (file, at, gain = 1) => { const w = readWav(file), s0 = Math.round(at * RATE); for (let i = 0; i < w.L.length; i++) { const j = s0 + i; if (j >= 0 && j < n) { sL[j] += w.L[i] * gain; sR[j] += w.R[i] * gain; } } };
  const logo = (name, sceneFrom, settleFrames, fileSettle) => {
    const settle = (sceneFrom + settleFrames) / FPS;
    if (SONAR[logoKind]) {
      // A sonar candidate: the same quiet air movement as before under the pullback, and the sound's hit on the settle.
      place(path.join(ROOT, `public/audio-v4/sonar/air-${name === 'reveal' ? 'full' : 'short'}.wav`), settle - fileSettle);
      place(path.join(ROOT, `public/audio-v4/sonar/${logoKind}.wav`), settle - SONAR[logoKind].hit, Math.pow(10, 6 / 20));
    } else place(path.join(ROOT, `public/audio-v4/sfx/${name}${logoKind === 'single' ? '-single' : ''}.wav`), settle - fileSettle);
  };
  if (tl.byScene.brand) logo('reveal', tl.byScene.brand.from, SETTLE.full, 2.0);
  if (tl.byScene.end) logo('reveal-short', tl.byScene.end.from, SETTLE.short, 1.1);
  // Levels: voice to -18 LUFS (speech only), music so its level under speech is MIX.speechToMusic below the voice.
  const vL = lufs(voice, voice); const gv = Math.pow(10, (-18 - vL) / 20); for (let i = 0; i < n; i++) voice[i] *= gv;
  const env = new Float32Array(n);
  const downDb = -MIX.lift; // relative automation: 0 dB in pauses, -lift under speech
  for (let i = 0; i < n; i++) {
    const t = i / RATE; let d = 0;
    for (const [a, b] of sp) {
      if (t < a - MIX.down || t > b + MIX.up) continue;
      const k = t < a ? smooth((t - (a - MIX.down)) / MIX.down) : t <= b ? 1 : 1 - smooth((t - b) / MIX.up);
      d = Math.min(d, downDb * k);
    }
    env[i] = Math.pow(10, d / 20);
  }
  // Fit the music's level under speech: measure voice and (automated) music over the speech regions.
  const sel = (x) => { const parts = []; for (const [a, b] of sp) parts.push(x.subarray(Math.round(a * RATE), Math.min(n, Math.round(b * RATE)))); const len = parts.reduce((s, p) => s + p.length, 0), o = new Float32Array(len); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const amL = Float32Array.from(mL, (v, i) => v * env[i]), amR = Float32Array.from(mR, (v, i) => v * env[i]);
  const vs = sel(voice), musUnder = lufs(sel(amL), sel(amR)), voiceUnder = lufs(vs, vs);
  const gm = Math.pow(10, (voiceUnder - MIX.speechToMusic - musUnder) / 20);
  scale(amL, amR, gm);
  // Logo: its loudness MIX.logoBelowVoice under the voice's loudness.
  if (MOMENTARY) { const mm = momentaryMax(sL, sR); if (Number.isFinite(mm)) scale(sL, sR, Math.pow(10, (-18 - MIX.logoMomentaryBelowVoice - mm) / 20)); }
  else { const sfxL = lufs(sL, sR); if (Number.isFinite(sfxL)) scale(sL, sR, Math.pow(10, (-18 - MIX.logoBelowVoice - sfxL) / 20)); }
  // Sum, master.
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = voice[i] + amL[i] + sL[i]; R[i] = voice[i] + amR[i] + sR[i]; }
  const g = Math.pow(10, (MIX.target - lufs(L, R)) / 20);
  scale(L, R, g); for (const x of [voice, amL, amR, sL, sR]) for (let i = 0; i < n; i++) x[i] *= g;
  let ceil = -1.6, tp;
  const L0 = Float32Array.from(L), R0 = Float32Array.from(R);
  // Limit, then make up the loudness the limiter took (twice at most), keeping the true peak at or below the ceiling.
  for (let pass = 0; pass < 3; pass++) {
    for (;;) { L.set(L0); R.set(R0); limiter(L, R, ceil); tp = truePeak(L, R); if (tp <= MIX.ceilingTP || ceil < -4) break; ceil -= 0.3; }
    const short = MIX.target - lufs(L, R); if (short < 0.15 || pass === 2) break;
    const k = Math.pow(10, short / 20); scale(L0, R0, k); for (const x of [voice, amL, amR, sL, sR]) for (let i = 0; i < n; i++) x[i] *= k;
  }
  // Measurements.
  const musGap = (() => { const gaps = []; let prev = 0; for (const [a, b] of sp) { if (a - prev > 1.5) gaps.push([prev + MIX.up, a - MIX.down]); prev = b; } return gaps.filter(([a, b]) => b - a > 0.5); })();
  const gapSel = (x) => { const parts = musGap.map(([a, b]) => x.subarray(Math.round(a * RATE), Math.round(b * RATE))); const len = parts.reduce((s, p) => s + p.length, 0), o = new Float32Array(len); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const vS = sel(voice);
  const mono = Float32Array.from(L, (v, i) => (v + R[i]) / 2);
  const rep = {
    film, candidate: cand, logo: logoKind, logoMomentaryLUFS: +momentaryMax(sL, sR).toFixed(1), seconds: +(n / RATE).toFixed(2),
    integratedLUFS: +lufs(L, R).toFixed(1), truePeakDBTP: +tp.toFixed(2), limiterCeilingDBFS: +ceil.toFixed(1),
    speechToMusicDb: +(lufs(vS, vS) - lufs(sel(amL), sel(amR))).toFixed(1),
    musicInPausesVsSpeechDb: musGap.length ? +(lufs(gapSel(amL), gapSel(amR)) - lufs(vS, vS)).toFixed(1) : null,
    monoMinusStereoLU: +(lufs(mono, mono) - lufs(L, R)).toFixed(2),
    speechRegions: sp.length,
  };
  const dir = path.join(OUT, AS || cand);
  writeWav(path.join(dir, `${film}.wav`), L, R);
  writeWav(path.join(dir, 'stems', `${film}-voice.wav`), voice, voice);
  writeWav(path.join(dir, 'stems', `${film}-music.wav`), amL, amR);
  writeWav(path.join(dir, 'stems', `${film}-logo.wav`), sL, sR);
  // Music-only listening version (music plus the logo sound, no narration, no automation), at -16 LUFS.
  const oL = Float32Array.from(mL, (v, i) => v * gm + sL[i] / g), oR = Float32Array.from(mR, (v, i) => v * gm + sR[i] / g);
  scale(oL, oR, Math.pow(10, (-16 - lufs(oL, oR)) / 20)); limiter(oL, oR, -1.6);
  writeWav(path.join(dir, `${film}-music-only.wav`), oL, oR);
  return rep;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const all = {};
  for (const film of films) for (const c of cands) { const t0 = Date.now(); const r = mixFilm(film, c); r.ms = Date.now() - t0; all[`${AS || c}/${film}`] = r; console.log(JSON.stringify(r)); }
  const rf = path.join(OUT, 'report.json');
  const prev = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : {};
  fs.writeFileSync(rf, JSON.stringify({ ...prev, ...all }, null, 1));
}
