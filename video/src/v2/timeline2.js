// Version 2 timing. Scene length = narration + lead + tail (or `min`), with `overlap` cross-dissolves. Narration
// lengths come from public/audio-v2/timings.json (written by scripts/voice-v2.mjs); before the voice exists, they are
// estimated at 147 words a minute so the films can be laid out and previewed.
import T from '../../public/audio-v2/timings.json';
import S from './script.json';

export const FPS = 30;
const estimate = (text) => (text.split(/\s+/).length / 147) * 60;
export function timeline2(film, plan) {
  let at = 0;
  const scenes = plan.map((p) => {
    const line = (S.films[film] || []).find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`] || (line.text ? { seconds: estimate(line.text), estimated: true } : { seconds: 0 });
    const lead = p.lead ?? 0.4, tail = p.tail ?? 0.6;
    const dur = Math.round(Math.max(p.min || 0, t.seconds ? t.seconds + lead + tail : 0) * FPS);
    const s = { ...p, id: line.id, text: line.text || '', screen: line.screen || [], from: at, dur, voiceFrom: at + Math.round(lead * FPS), voiceDur: Math.round((t.seconds || 0) * FPS), audio: t.file || null, estimated: !!t.estimated };
    at += dur - (p.overlap ? Math.round(p.overlap * FPS) : 0);
    return s;
  });
  const total = scenes.reduce((m, s) => Math.max(m, s.from + s.dur), 0);
  return { scenes, total, byScene: Object.fromEntries(scenes.map((s) => [s.scene, s])) };
}
// Music under the voice: lower while anyone speaks (8-frame ramps), and a fade at the end.
export function duck(f, tl, { base = 0.5, low = 0.17, endFade = 50 } = {}) {
  let v = base;
  for (const s of tl.scenes) {
    if (!s.voiceDur) continue;
    const a = s.voiceFrom - 8, b = s.voiceFrom + s.voiceDur + 10;
    if (f >= a && f <= b) { const k = Math.min(1, (f - a) / 8, (b - f) / 10); v = Math.min(v, base - (base - low) * Math.max(0, k)); }
  }
  if (f > tl.total - endFade) v *= Math.max(0, (tl.total - f) / endFade);
  return v;
}
