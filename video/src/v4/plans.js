// Version 4 scene plans (same story, narration and timing rules as version 3) and the music cue points derived from
// them. Pure JavaScript: used by the Remotion compositions and by the Node scripts that compose and mix the music, so
// the music's lifts land exactly on the pictures.
export const FPS = 30;
export const FLAGSHIP4_PLAN = [
  { scene: 'scan', min: 5.6, lead: 0.3, tail: 0.6, overlap: 0.5 },
  { scene: 'rota', min: 9.0, lead: 0.3, tail: 0.8, overlap: 0.5 },
  { scene: 'wait', min: 8.8, lead: 0.3, tail: 0.9, overlap: 0.5 },
  { scene: 'brand', min: 9.9, lead: 2.5, tail: 0.6, overlap: 0.5 }, // narration starts 0.5 s after the logo settles
  { scene: 'log', min: 12.5, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'verified', min: 10.5, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'request', min: 7.5, lead: 0.4, tail: 0.9, overlap: 0.5 },
  { scene: 'review', min: 11.5, lead: 0.6, tail: 0.9, overlap: 0.5 },
  { scene: 'outcome', min: 10.0, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'progress', min: 8.5, lead: 0.4, tail: 0.6, overlap: 0.5 },
  { scene: 'free', min: 6.4, lead: 0.5, tail: 0.6, overlap: 0.5 },
  { scene: 'education', min: 8.5, lead: 0.4, tail: 0.6, overlap: 0.5 },
  { scene: 'end', min: 7.0, lead: 1.5 }, // the tagline follows the closing logo's settle (1.1 s)
];
export const SHORT4_PLAN = [
  { scene: 'hook', min: 4.6, lead: 0.2, tail: 0.6, overlap: 0.4 },
  { scene: 'log', min: 4.6, lead: 0.3, tail: 0.5, overlap: 0.4 },
  { scene: 'request', min: 4.4, lead: 0.2, tail: 0.5, overlap: 0.4 },
  { scene: 'review', min: 5.2, lead: 0.4, tail: 0.6, overlap: 0.4 },
  { scene: 'free', min: 6.4, lead: 0.4, tail: 0.6, overlap: 0.4 },
  { scene: 'end', min: 6.5, lead: 1.5 },
];
export const AD4_PLAN = [
  { scene: 'headline', min: 6.6, lead: 0.3, tail: 0.6, overlap: 0.5 },
  { scene: 'offer', min: 8.4, lead: 0.3, tail: 0.7, overlap: 0.5 },
  { scene: 'end', min: 6.8, lead: 1.5 },
];
// The comparison sample: problem, the brand reveal, the app, free, the close.
export const SAMPLE4 = ['scan', 'rota', 'brand', 'request', 'free', 'end'];
export const PLANS = { flagship: FLAGSHIP4_PLAN, short: SHORT4_PLAN, ad: AD4_PLAN };

// Scene length = narration + lead + tail (or `min`), with `overlap` cross-dissolves (as version 3). T: timings.json,
// S: script.json. only: keep these scenes, closing the gaps.
export function timeline4(film, T, S, only = null) {
  const plan = PLANS[film];
  const estimate = (text) => (text.split(/\s+/).length / 147) * 60;
  let at = 0;
  let scenes = plan.map((p) => {
    const line = (S.films[film] || []).find((l) => l.scene === p.scene) || {};
    const t = T[`${film}/${line.id}`] || (line.text ? { seconds: estimate(line.text), estimated: true } : { seconds: 0 });
    const lead = p.lead ?? 0.4, tail = p.tail ?? 0.6;
    const dur = Math.round(Math.max(p.min || 0, t.seconds ? t.seconds + lead + tail : 0) * FPS);
    const s = { ...p, id: line.id, text: line.text || '', screen: line.screen || [], from: at, dur, voiceFrom: at + Math.round(lead * FPS), voiceDur: Math.round((t.seconds || 0) * FPS), audio: t.file || null, estimated: !!t.estimated };
    at += dur - (p.overlap ? Math.round(p.overlap * FPS) : 0);
    return s;
  });
  if (only) {
    at = 0;
    scenes = scenes.filter((x) => only.includes(x.scene)).map((x, i, arr) => { const shift = at - x.from; at += x.dur - (i < arr.length - 1 ? Math.round((x.overlap || 0) * FPS) : 0); return { ...x, from: x.from + shift, voiceFrom: x.voiceFrom + shift }; });
  }
  const total = scenes.reduce((m, s) => Math.max(m, s.from + s.dur), 0);
  return { scenes, total, byScene: Object.fromEntries(scenes.map((s) => [s.scene, s])) };
}

// Logo timing (frames from the scene start): the full reveal settles at 60, the short one at 33 (src/v3/reveal.jsx).
export const SETTLE = { full: 60, short: 33 };
// Music cue points in seconds: where each musical section begins. problem: the clinical frustration (restrained, light
// movement, no home chord yet); lift: Wavelength arrives (the home chord, clearer and brighter); develop: the review
// workflow (progress and reassurance); free: the free-logbook lift; warm: courses and training; end: the resolution as
// the closing logo settles. Sections are aligned to bars by the composer.
export function cues(film, tl) {
  const b = tl.byScene, s = (f) => f / FPS, out = [];
  const add = (name, f) => { if (f != null && !Number.isNaN(f)) out.push({ name, at: s(f) }); };
  if (film === 'ad') {
    add('warm', 0); add('main', b.offer.from); add('end', b.end.from + SETTLE.short);
  } else {
    add('problem', 0);
    if (b.brand) add('lift', b.brand.from + SETTLE.full); else if (b.log) add('lift', b.log.from);
    if (b.request) add('develop', b.request.from);
    if (b.progress) add('main', b.progress.from);
    if (b.free) add('free', b.free.from + 26);
    if (b.education) add('warm', b.education.from);
    add('end', b.end.from + SETTLE.short);
  }
  return { cues: out.sort((x, y) => x.at - y.at), total: s(tl.total) };
}
