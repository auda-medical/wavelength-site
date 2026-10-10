// Video 2: the short logbook film (about 40 seconds), landscape (1920 x 1080) and vertical (1080 x 1920). Acquisition:
// the recognisable problem, "Your ultrasound logbook. Free.", three real app moments, courses and tailored training,
// and the call to action. Subtitles are burned in for muted social playback.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Canvas, Backdrop, Mark, Wordmark, Kinetic, Eyebrow, Phone, Browser, Subtitle, Pill, QRCode, Social, SceneFade, C, SERIF, SANS, fade, clamp, mark } from './kit.jsx';
import { timeline, musicVolume, FPS } from './timeline.js';

export const SHORT_PLAN = [{ scene: 'hook', min: 4.9, lead: 0.4, overlap: 0.3 }, { scene: 'free', min: 6.1, lead: 0.4, overlap: 0.3 }, { scene: 'log', min: 5.3, lead: 0.5, overlap: 0.3 }, { scene: 'review', min: 6.3, lead: 0.5, overlap: 0.3 }, { scene: 'progress', min: 5.3, lead: 0.5, overlap: 0.3 }, { scene: 'education', min: 4.9, lead: 0.4, overlap: 0.3 }, { scene: 'end', min: 8, lead: 0.6 }];
export const shortTL = () => timeline('short', SHORT_PLAN);

function Hook({ s, V }) {
  const f = useCurrentFrame();
  return <SceneFade dur={s.dur} inF={2}><Backdrop tone="dim" w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', left: V ? 80 : 150, right: V ? 80 : 150, top: V ? 640 : 330 }}>
      <Kinetic text="Scanned on a busy shift?" start={4} stagger={3} style={{ fontFamily: SERIF, fontSize: V ? 104 : 112, lineHeight: 1.04, color: C.cream }} />
      <Kinetic text="Supervisor nowhere to be seen?" start={50} stagger={3} style={{ fontFamily: SERIF, fontSize: V ? 104 : 112, lineHeight: 1.04, color: C.tealL, marginTop: 18 }} />
    </div>
  </SceneFade>;
}
function Free({ s, V }) {
  const f = useCurrentFrame();
  const p = fade(f, 34, 54);
  return <SceneFade dur={s.dur}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={2} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: V ? '0 60px' : 0 }}>
      <div style={{ opacity: fade(f, 0, 14) }}><Mark size={V ? 120 : 110} draw={fade(f, 0, 30)} ring={fade(f, 0, 24)} /></div>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: V ? 62 : 70, letterSpacing: '0.1em', marginTop: 40, opacity: fade(f, 10, 28) }}>YOUR ULTRASOUND LOGBOOK.</div>
      <div style={{ fontFamily: SERIF, fontSize: V ? 300 : 260, lineHeight: 1, color: C.tealL, opacity: p, transform: `scale(${0.9 + 0.1 * p})`, marginTop: 6 }}>Free.</div>
    </div>
  </SceneFade>;
}
const Caption = ({ eyebrow, title, V, at = 6 }) => { const f = useCurrentFrame(); return <div style={{ position: 'absolute', left: V ? 80 : 150, right: V ? 80 : undefined, top: V ? 150 : 380, width: V ? undefined : 760, textAlign: V ? 'center' : 'left' }}><div style={{ opacity: fade(f, at, at + 12) }}><Eyebrow style={{ fontSize: V ? 28 : 22 }}>{eyebrow}</Eyebrow></div><Kinetic text={title} start={at + 4} style={{ fontFamily: SERIF, fontSize: V ? 92 : 92, lineHeight: 1.04, marginTop: 18 }} /></div>; };
function Demo({ s, V, eyebrow, title, states, second }) {
  const f = useCurrentFrame();
  return <SceneFade dur={s.dur}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <Caption eyebrow={eyebrow} title={title} V={V} />
    {V ? <Phone k={1.32} x={540 - (390 * 1.32 + 26 * 1.32) / 2} y={520} states={states} /> : <Phone k={1.02} x={1180} y={110} rotY={-8} states={states} />}
    {second ? second(f) : null}
  </SceneFade>;
}
function Education({ s, V }) {
  const f = useCurrentFrame();
  const words = ['HANDS-ON ULTRASOUND COURSES', 'TAILORED ULTRASOUND TRAINING'];
  return <SceneFade dur={s.dur}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    {V ? <Browser src="web-training" x={60} y={620} w={960} /> : <Browser src="web-training" x={760} y={210} w={1040} rotY={-8} />}
    {words.map((wd, i) => <div key={i} style={{ position: 'absolute', left: V ? 0 : 150, right: V ? 0 : undefined, textAlign: V ? 'center' : 'left', top: (V ? 300 : 420) + i * (V ? 90 : 90), opacity: fade(f, 8 + i * 16, 24 + i * 16), fontWeight: 600, fontSize: V ? 46 : 46, letterSpacing: '0.1em' }}>{wd}</div>)}
  </SceneFade>;
}
function End({ s, V }) {
  const f = useCurrentFrame();
  const a = (x) => fade(f, x, x + 16);
  return <SceneFade dur={s.dur} outF={1}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: V ? 40 : 30 }}>
      <div style={{ opacity: a(0) }}><Mark size={V ? 130 : 110} draw={fade(f, 0, 30)} ring={fade(f, 0, 24)} /></div>
      <div style={{ opacity: a(4) }}><Wordmark size={V ? 58 : 60} /></div>
      <div style={{ opacity: a(12), marginTop: 14 }}><Pill solid size={V ? 32 : 30}>START YOUR FREE LOGBOOK</Pill></div>
      <div style={{ opacity: a(18), fontFamily: SERIF, fontSize: V ? 80 : 78 }}>thewavelength.co.uk</div>
      <div style={{ opacity: a(26), display: 'flex', alignItems: 'center', gap: 22, marginTop: 8 }}><QRCode film="short" size={V ? 200 : 150} /><div style={{ fontSize: V ? 28 : 22, color: C.slate, lineHeight: 1.45 }}>Scan to start<br />your free logbook</div></div>
      <div style={{ opacity: a(32), marginTop: 10 }}><Social size={V ? 30 : 30} /></div>
    </div>
  </SceneFade>;
}

export function Short({ vertical = false }) {
  const V = vertical;
  const tl = shortTL();
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  const sc = tl.byScene;
  const lung = mark('new-grid', 'lung'), rev = mark('supervise-learner', 'review');
  const render = (x) => {
    if (x.scene === 'hook') return <Hook s={x} V={V} />;
    if (x.scene === 'free') return <Free s={x} V={V} />;
    if (x.scene === 'log') return <Demo s={x} V={V} eyebrow="Log a scan" title="In moments." states={[{ src: 'new-grid', at: 0, tap: { at: 26, ...lung } }, { src: 'new-lung-scroll', at: 38, scrollFrom: 0, scrollTo: 1300, scrollAt: 52, scrollDur: 80 }]} />;
    if (x.scene === 'review') return <Demo s={x} V={V} eyebrow="Verified supervisors" title="Reviewed when they're free." states={[{ src: 'supervisors', at: 0 }, { src: 'supervise-learner', at: 70, tap: { at: 104, ...rev } }, { src: 'supervise-sheet', at: 116 }]} />;
    if (x.scene === 'progress') return <Demo s={x} V={V} eyebrow="Track your progress" title="Towards your targets." states={[{ src: 'progress-rcem', at: 0, scrollFrom: 0, scrollTo: 380, scrollAt: 30, scrollDur: 80 }]} />;
    if (x.scene === 'education') return <Education s={x} V={V} />;
    return <End s={x} V={V} />;
  };
  return <Canvas w={W} h={H}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{render(x)}</Sequence>)}
    {tl.scenes.map((x) => <Subtitle key={'t' + x.scene} text={x.scene === 'end' ? '' : x.text} start={x.voiceFrom} end={x.voiceFrom + x.voiceDur + 8} w={W} bottom={V ? 150 : 60} size={V ? 44 : 38} />)}
    <Audio src={staticFile('audio/music/short.wav')} volume={(f) => musicVolume(f, tl, { base: 0.6, duck: 0.24 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
    <Sequence from={sc.free.from - 50} durationInFrames={72}><Audio src={staticFile('audio/sfx/swell.wav')} volume={0.45} /></Sequence>
  </Canvas>;
}
