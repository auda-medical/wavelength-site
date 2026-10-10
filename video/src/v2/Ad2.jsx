// Version 2 tailored-training advert (about 20 seconds), landscape and portrait, clean or captioned. An illustrated
// hands-on teaching scene carries the picture (no website screenshots); the narration states the offer; the screen
// keeps to three short statements. Ends on EXPLORE OUR COURSES and ENQUIRE ABOUT TAILORED TRAINING.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame } from 'remotion';
import { Backdrop } from '../kit.jsx';
import { C, SERIF, SANS, Line, Eyebrow2, Head, Focus, Captions, cuesFor, Probe, prog, SceneFade } from './kit2.jsx';
import { TeachingRoom, ScanImage } from './art.jsx';
import { timeline2, duck, FPS } from './timeline2.js';
import { End2 } from './Flagship2.jsx';

export const AD2_PLAN = [
  { scene: 'headline', min: 6.4, lead: 0.3, tail: 0.6, overlap: 0.5 },
  { scene: 'offer', min: 8.2, lead: 0.3, tail: 0.7, overlap: 0.5 },
  { scene: 'end', min: 6.6, lead: 0.6 },
];
export const ad2TL = () => timeline2('ad', AD2_PLAN);
const sec = (x) => Math.round(x * FPS);

function Headline({ s, V }) {
  const f = useCurrentFrame();
  const keys = V
    ? [{ at: 0, s: 0.92, fx: 1240, fy: 640, tx: 540, ty: 1080 }, { at: 0, dur: s.dur, s: 0.84, fx: 1240, fy: 640, tx: 540, ty: 1080 }]
    : [{ at: 0, s: 1.14, fx: 1260, fy: 600, tx: 1300, ty: 600 }, { at: 0, dur: s.dur, s: 1.0, fx: 1260, fy: 600, tx: 1300, ty: 600 }];
  return <SceneFade dur={s.dur} next={s.overlap} inF={1}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Focus keys={keys}><TeachingRoom f={f} /></Focus></div>
    <div style={{ position: 'absolute', left: V ? 80 : 130, right: V ? 80 : undefined, top: V ? 230 : 220, width: V ? undefined : 640, textAlign: V ? 'center' : 'left' }}>
      <Eyebrow2 at={2} style={{ fontSize: V ? 28 : 22 }}>Ultrasound education</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={6} size={V ? 92 : 86} id="built" style={{ textAlign: V ? 'center' : 'left' }}>Training built around you.</Head></div>
    </div>
  </SceneFade>;
}
function Offer({ s, V }) {
  const f = useCurrentFrame();
  const items = ['HANDS-ON COURSES', 'TAILORED TRAINING', 'UK & INTERNATIONAL'];
  const W = V ? 920 : 860, H = V ? 620 : 600;
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={1.5} />
    <div data-box="art" style={{ position: 'absolute', left: V ? 80 : 960, top: V ? 860 : 200, width: W, height: H, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,.5)' }}>
      <Focus keys={[{ at: 0, s: 1.9, fx: 1100, fy: 470, tx: W / 2, ty: H / 2 }, { at: 0, dur: s.dur, s: 1.7, fx: 1100, fy: 520, tx: W / 2, ty: H / 2 }]}><TeachingRoom f={f} /></Focus>
    </div>
    <div style={{ position: 'absolute', left: V ? 0 : 130, right: V ? 0 : undefined, top: V ? 260 : 300, width: V ? undefined : 760, display: 'flex', flexDirection: 'column', alignItems: V ? 'center' : 'flex-start', gap: V ? 26 : 24 }}>
      {items.map((t, i) => <Line key={t} at={6 + i * sec(1.2)} id={`item${i}`} style={{ fontWeight: 600, fontSize: V ? 52 : 46, letterSpacing: '0.12em', color: C.cream }}>{t}</Line>)}
      <div style={{ marginTop: V ? 18 : 22, maxWidth: V ? 860 : 620, textAlign: V ? 'center' : 'left' }}><Line at={sec(4.2)} id="ratio" align={V ? 'center' : 'left'} style={{ fontSize: V ? 32 : 26, lineHeight: 1.45, color: C.slate }}>One instructor to every four or five delegates.</Line></div>
    </div>
  </SceneFade>;
}
const ZONES_L = { headline: { x: 130, y: 880, w: 760, align: 'left' }, offer: { x: 130, y: 880, w: 760, align: 'left' } };
const ZONES_V = { headline: { x: 80, y: 1560, w: 920 }, offer: { x: 80, y: 1540, w: 920 } };

export function Ad2({ vertical = false, captions = false }) {
  const V = vertical;
  const tl = ad2TL();
  const cues = tl.scenes.flatMap((x) => (x.scene === 'end' ? [] : cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(3), V ? 30 : 42)));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return (V ? ZONES_V : ZONES_L)[sc.scene] || { x: 80, y: 900, w: 1760 }; };
  return <div style={{ position: 'absolute', inset: 0, background: C.ink, fontFamily: SANS, color: C.cream }}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{x.scene === 'headline' ? <Headline s={x} V={V} /> : x.scene === 'offer' ? <Offer s={x} V={V} /> : <End2 s={x} film="ad" ctas={['EXPLORE OUR COURSES', 'ENQUIRE ABOUT TAILORED TRAINING']} vertical={V} />}</Sequence>)}
    {captions ? <Captions cues={cues} zone={zone} size={V ? 44 : 36} /> : null}
    <Audio src={staticFile('audio-v2/music/ad.wav')} volume={(f) => duck(f, tl, { base: 0.6, low: 0.22, endFade: 36 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
    <Probe />
  </div>;
}
