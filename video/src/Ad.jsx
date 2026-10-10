// Video 3: the standalone education advertisement (about 18 seconds), landscape and vertical. Courses and tailored
// training for individuals, groups and organisations, UK and international enquiries, flexible locations by
// arrangement; it makes sense without the logbook film. No partnership or endorsement is claimed.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Canvas, Backdrop, Kinetic, Browser, Subtitle, EndFrame, SceneFade, C, SERIF, SANS, fade, clamp } from './kit.jsx';
import { timeline, musicVolume } from './timeline.js';

export const AD_PLAN = [{ scene: 'headline', min: 5.6, lead: 0.4 }, { scene: 'offer', min: 6.6, lead: 0.3, tail: 0.5 }, { scene: 'end', min: 6.2, lead: 1.0 }];
export const adTL = () => timeline('ad', AD_PLAN);

function Headline({ s, V }) {
  return <SceneFade dur={s.dur} inF={2}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    {V ? <Browser src="web-training" x={60} y={1040} w={960} opacity={0.9} /> : <Browser src="web-training" x={1000} y={300} w={800} rotY={-10} opacity={0.85} />}
    <div style={{ position: 'absolute', left: V ? 70 : 150, right: V ? 70 : undefined, width: V ? undefined : 860, top: V ? 300 : 280 }}>
      <Kinetic text="Ultrasound training tailored to your needs," start={8} stagger={3} italicFrom={4} style={{ fontFamily: SERIF, fontSize: V ? 104 : 96, lineHeight: 1.04 }} />
      <Kinetic text="with flexible locations by arrangement." start={52} stagger={3} style={{ fontFamily: SERIF, fontSize: V ? 64 : 56, lineHeight: 1.15, color: C.slate, marginTop: 26 }} />
    </div>
  </SceneFade>;
}
function Offer({ s, V }) {
  const f = useCurrentFrame();
  const items = ['HANDS-ON ULTRASOUND COURSES', 'EXPERT-LED TEACHING', 'INDIVIDUALS, GROUPS AND ORGANISATIONS', 'UK AND INTERNATIONAL ENQUIRIES WELCOME'];
  return <SceneFade dur={s.dur}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={1.5} />
    {V ? <Browser src="web-courses" x={60} y={1040} w={960} /> : <Browser src="web-courses" x={980} y={250} w={820} rotY={-10} />}
    <div style={{ position: 'absolute', left: V ? 70 : 150, right: V ? 70 : undefined, top: V ? 330 : 320 }}>
      {items.map((t, i) => { const p = fade(f, 6 + i * 22, 24 + i * 22); return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, opacity: p, transform: `translateX(${(1 - p) * 30}px)`, fontWeight: 600, letterSpacing: '0.1em', fontSize: V ? 42 : 40, margin: V ? '0 0 46px' : '0 0 40px' }}><span style={{ width: 14, height: 14, borderRadius: 7, background: C.tealL, flex: 'none' }} />{t}</div>; })}
    </div>
  </SceneFade>;
}
export function Ad({ vertical = false }) {
  const V = vertical;
  const tl = adTL();
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  return <Canvas w={W} h={H}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{x.scene === 'headline' ? <Headline s={x} V={V} /> : x.scene === 'offer' ? <Offer s={x} V={V} /> : <SceneFade dur={x.dur} outF={1}><Backdrop w={W} h={H} /><EndFrame film="ad" vertical={V} /></SceneFade>}</Sequence>)}
    {V ? tl.scenes.filter((x) => x.scene !== 'end').map((x) => <Subtitle key={'t' + x.scene} text={x.text} start={x.voiceFrom} end={x.voiceFrom + x.voiceDur + 8} w={W} bottom={110} size={42} />) : null}
    <Audio src={staticFile('audio/music/ad.wav')} volume={(f) => musicVolume(f, tl, { base: 0.62, duck: 0.26, endFade: 40 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
  </Canvas>;
}
