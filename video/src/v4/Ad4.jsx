// Version 4 tailored-training advert (about 21 seconds): the version 3 advert in the warmest version 4 treatment, a
// sunlit teaching scene (an illustration, not a real course) on daylight cream. Ends on EXPLORE OUR COURSES and
// ENQUIRE ABOUT TAILORED TRAINING. Sound is mixed outside Remotion (scripts/mix-v4.mjs).
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame } from 'remotion';
import { SANS, Line, Eyebrow2, Head, Focus, Captions, cuesFor, Probe, prog, SceneFade, ThemeCtx } from '../v2/kit2.jsx';
import { TeachingRoom, ArtCtx } from '../v2/art.jsx';
import { End4 } from './End4.jsx';
import { Backdrop4, L, THEME_LIGHT, ART_LIGHT, TONES } from './look.jsx';
import { timeline4, FPS } from './plans.js';
import T from '../../public/audio-v4/timings.json';
import S from './script.json';

export const ad4TL = () => timeline4('ad', T, S);
const sec = (x) => Math.round(x * FPS);

function Headline({ s, V }) {
  const f = useCurrentFrame();
  // From the screen and the faculty member's guidance out to the whole group.
  const keys = V
    ? [{ at: 0, s: 2.2, fx: 960, fy: 430, tx: 540, ty: 1020 }, { at: sec(0.8), dur: s.dur - sec(0.8), s: 0.86, fx: 1240, fy: 640, tx: 540, ty: 1080 }]
    : [{ at: 0, s: 2.0, fx: 960, fy: 430, tx: 1280, ty: 520 }, { at: sec(0.8), dur: s.dur - sec(0.8), s: 1.0, fx: 1260, fy: 600, tx: 1300, ty: 600 }];
  return <SceneFade dur={s.dur} inF={1} next={s.overlap}><Backdrop4 tone="sunlit" w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Focus keys={keys}><TeachingRoom f={f} tones={TONES} /></Focus></div>
    <div style={{ position: 'absolute', left: V ? 80 : 130, right: V ? 80 : undefined, top: V ? 230 : 220, width: V ? undefined : 620, textAlign: V ? 'center' : 'left' }}>
      <Eyebrow2 at={2} style={{ fontSize: V ? 28 : 22 }}>Ultrasound education</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={6} size={V ? 92 : 86} id="built" style={{ textAlign: V ? 'center' : 'left' }}>Training built around you.</Head></div>
    </div>
  </SceneFade>;
}
function Offer({ s, V }) {
  const f = useCurrentFrame();
  const items = ['HANDS-ON COURSES', 'EXPERT-LED TEACHING', 'TAILORED TRAINING'];
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop4 tone="sunlit" w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={1.5} />
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Focus keys={V ? [{ at: 0, s: 0.84, fx: 1240, fy: 640, tx: 540, ty: 1180 }, { at: 0, dur: s.dur, s: 0.92, fx: 1240, fy: 640, tx: 540, ty: 1180 }] : [{ at: 0, s: 1.0, fx: 1260, fy: 600, tx: 1420, ty: 640 }, { at: 0, dur: s.dur, s: 1.08, fx: 1260, fy: 600, tx: 1420, ty: 640 }]}><TeachingRoom f={f} tones={TONES} /></Focus></div>
    <div style={{ position: 'absolute', left: V ? 0 : 130, right: V ? 0 : undefined, top: V ? 250 : 260, width: V ? undefined : 680, display: 'flex', flexDirection: 'column', alignItems: V ? 'center' : 'flex-start', gap: V ? 26 : 22 }}>
      {items.map((t, i) => <Line key={t} at={6 + i * sec(1.0)} id={`item${i}`} style={{ fontWeight: 600, fontSize: V ? 52 : 44, letterSpacing: '0.12em', color: L.navy }}>{t}</Line>)}
      <div style={{ marginTop: V ? 18 : 20, maxWidth: V ? 860 : 600, textAlign: V ? 'center' : 'left' }}><Line at={sec(3.8)} id="ratio" align={V ? 'center' : 'left'} style={{ fontSize: V ? 32 : 26, lineHeight: 1.45, color: L.sub }}>One instructor to every four or five delegates.</Line></div>
    </div>
  </SceneFade>;
}
const ZONES_L = { headline: { x: 130, y: 880, w: 640, align: 'left' }, offer: { x: 130, y: 880, w: 680, align: 'left' } };
const ZONES_V = { headline: { x: 80, y: 1560, w: 920 }, offer: { x: 80, y: 1560, w: 920 } };

export function Ad4({ vertical = false, captions = false, mix = null }) {
  const V = vertical;
  const tl = ad4TL();
  const cues = tl.scenes.flatMap((x) => (x.scene === 'end' ? [] : cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(3), V ? 30 : 42)));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return (V ? ZONES_V : ZONES_L)[sc.scene] || { x: 80, y: 900, w: 1760 }; };
  return <ThemeCtx.Provider value={THEME_LIGHT}><ArtCtx.Provider value={ART_LIGHT}><div style={{ position: 'absolute', inset: 0, background: L.cream, fontFamily: SANS, color: L.navy }}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{x.scene === 'headline' ? <Headline s={x} V={V} /> : x.scene === 'offer' ? <Offer s={x} V={V} /> : <End4 s={x} film="ad" ctas={['EXPLORE OUR COURSES', 'ENQUIRE ABOUT TAILORED TRAINING']} vertical={V} />}</Sequence>)}
    {captions ? <Captions cues={cues} zone={zone} size={V ? 44 : 36} /> : null}
    {mix ? <Audio src={staticFile(mix)} /> : null}
    <Probe />
  </div></ArtCtx.Provider></ThemeCtx.Provider>;
}
