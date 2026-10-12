// Scene timing from the measured narration (public/audio/timings.json, written by scripts/narrate.mjs). Each scene
// lasts at least `min` seconds and at least its narration plus `lead` before and `tail` after. Music ducks under speech.
import T from '../public/audio/timings.json';
import S from './script.json';

export const FPS = 30;
export function timeline(film, plan) {
  let at = 0;
  const scenes = plan.map((p) => {
    const line = (S.films[film] || []).find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`] || { seconds: 0 };
    const lead = p.lead ?? 0.7, tail = p.tail ?? 0.9;
    const dur = Math.round(Math.max(p.min || 0, t.seconds ? t.seconds + lead + tail : 0) * FPS);
    const s = { ...p, id: line.id, text: line.text || '', from: at, dur, voiceFrom: at + Math.round(lead * FPS), voiceDur: Math.round((t.seconds || 0) * FPS), audio: t.file || null };
    at += dur - (p.overlap ? Math.round(p.overlap * FPS) : 0);
    return s;
  });
  const total = scenes.reduce((m, s) => Math.max(m, s.from + s.dur), 0);
  return { scenes, total, byScene: Object.fromEntries(scenes.map((s) => [s.scene, s])) };
}
// Music volume for frame f: lower while narration plays (with 8-frame ramps), and a fade at the very end.
export function musicVolume(f, tl, { base = 0.5, duck = 0.2, endFade = 60 } = {}) {
  let v = base;
  for (const s of tl.scenes) {
    if (!s.voiceDur) continue;
    const a = s.voiceFrom - 8, b = s.voiceFrom + s.voiceDur + 10;
    if (f >= a && f <= b) { const k = Math.min(1, (f - a) / 8, (b - f) / 10); v = Math.min(v, base - (base - duck) * Math.max(0, k)); }
  }
  if (f > tl.total - endFade) v *= Math.max(0, (tl.total - f) / endFade);
  return v;
}
export const links = S.links;
