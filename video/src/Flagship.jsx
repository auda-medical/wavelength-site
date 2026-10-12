// Video 1: the flagship product film (about 2 minutes 15 seconds). The busy-shift problem, the real app solving it
// (pathways, logging, verified supervisors, asynchronous review, progress and verifiable export), the free logbook
// moment, then courses and tailored training, and the end frame. Every screen is a capture of the working app.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Canvas, Backdrop, Mark, Wordmark, WaveLine, Kinetic, Eyebrow, Phone, Browser, EndFrame, SceneFade, C, SERIF, SANS, fade, clamp, ease, mark, sp } from './kit.jsx';
import { timeline, musicVolume, FPS } from './timeline.js';

// overlap: seconds a scene starts before the previous one ends, so scenes cross-dissolve instead of dipping to dark.
export const FLAGSHIP_PLAN = [
  { scene: 'open', min: 8, overlap: 0.4 }, { scene: 'problem', min: 15.4, overlap: 0.4 }, { scene: 'intro', min: 8.4, overlap: 0.4 }, { scene: 'pathways', min: 10.4, overlap: 0.4 },
  { scene: 'log', min: 16.9, overlap: 0.4 }, { scene: 'supervisors', min: 10.4, overlap: 0.4 }, { scene: 'review', min: 19.4, overlap: 0.4 }, { scene: 'progress', min: 13.4, overlap: 0.4 },
  { scene: 'free', min: 8.9, lead: 0.9, overlap: 0.4 }, { scene: 'education', min: 15.4, overlap: 0.4 }, { scene: 'end', min: 12, lead: 2.2 },
];
export const flagshipTL = () => timeline('flagship', FLAGSHIP_PLAN);

const Title = ({ eyebrow, title, sub, x = 150, y = 330, w = 760, start = 6, size = 82 }) => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', left: x, top: y, width: w }}>
    {eyebrow ? <div style={{ opacity: fade(f, start, start + 14) }}><Eyebrow>{eyebrow}</Eyebrow></div> : null}
    <Kinetic text={title} start={start + 6} style={{ fontFamily: SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.04, marginTop: 22, color: C.cream }} />
    {sub ? <div style={{ fontSize: 30, lineHeight: 1.45, color: C.slate, marginTop: 28, opacity: fade(f, start + 22, start + 40), transform: `translateY(${(1 - fade(f, start + 22, start + 40)) * 14}px)` }}>{sub}</div> : null}
  </div>;
};
const Check = ({ children, at, i }) => {
  const f = useCurrentFrame();
  const p = fade(f, at, at + 16);
  return <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: p, transform: `translateX(${(1 - p) * 30}px)`, fontSize: 36, color: C.cream, margin: '0 0 26px' }}>
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke={C.tealL} strokeWidth="1.3" /><path d="M7.5 12.4l3 3 6-6.6" stroke={C.tealL} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="20" strokeDashoffset={20 * (1 - fade(f, at + 6, at + 20))} /></svg>{children}
  </div>;
};

function Open({ dur }) {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, dur], [1.05, 1], clamp);
  return <SceneFade dur={dur} inF={1} outF={22}><Backdrop />
    <WaveLine y={760} progress={fade(f, 10, 120)} opacity={0.18} amp={34} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 44, transform: `scale(${z})` }}>
      <Mark size={190} draw={fade(f, 8, 70)} ring={fade(f, 0, 52)} />
      <Wordmark size={80} opacity={fade(f, 46, 80)} tagOpacity={fade(f, 78, 112)} />
    </div>
  </SceneFade>;
}

function Problem({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const lines = [[0, 'You scan when the patient needs it.'], [3.4, 'Your supervisor is in resus.'], [5.4, 'On nights. At another site.'], [7.6, 'The review never quite happens.'], [9.7, 'And the logbook falls behind.']];
  const minute = 12 + Math.floor((f / FPS) / 2);
  return <SceneFade dur={s.dur}><Backdrop tone="dim" />
    <div style={{ position: 'absolute', left: 150, top: 120, fontFamily: SANS, fontSize: 26, letterSpacing: '0.2em', color: C.slate, opacity: fade(f, 6, 30) * 0.8 }}>EMERGENCY DEPARTMENT · 03:{String(minute).padStart(2, '0')}</div>
    <WaveLine y={860} progress={1} speed={2.2} opacity={0.32} amp={22} period={210} />
    {lines.map(([t, text], i) => {
      const a = v + Math.round(t * FPS), b = i < lines.length - 1 ? v + Math.round(lines[i + 1][0] * FPS) : s.dur;
      const o = Math.min(fade(f, a, a + 12), i < lines.length - 1 ? 1 - fade(f, b - 4, b + 8) : 1);
      return o > 0 ? <div key={i} style={{ position: 'absolute', left: 150, right: 150, top: 410, opacity: o }}><Kinetic text={text} start={a} stagger={2} style={{ fontFamily: SERIF, fontSize: 104, lineHeight: 1.05, color: i === lines.length - 1 ? C.tealL : C.cream }} /></div> : null;
    })}
  </SceneFade>;
}

function Intro({ s }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const up = sp(f, fps, 8);
  return <SceneFade dur={s.dur}><Backdrop />
    <Title eyebrow="Introducing" title="Wavelength" sub="The ultrasound logbook, designed for real clinical practice." size={150} y={330} />
    <Phone k={1.02} x={1180} y={interpolate(up, [0, 1], [900, 110])} rotY={interpolate(up, [0, 1], [-22, -9])} states={[{ src: 'home', at: 0 }]} />
  </SceneFade>;
}

function Pathways({ s }) {
  const f = useCurrentFrame();
  const chips = ['RCEM', 'FAMUS', 'FUSIC', 'EUSEM', 'ACEM', 'CPoCUS', 'ACEP'];
  const tap = mark('progress-rcem', 'famus');
  return <SceneFade dur={s.dur}><Backdrop />
    <Title eyebrow="Your pathways" title="Organised for your accrediting body." x={150} y={260} w={820} />
    <div style={{ position: 'absolute', left: 150, top: 590, width: 820, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {chips.map((c, i) => { const p = fade(f, 50 + i * 7, 66 + i * 7); return <span key={c} style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)`, padding: '12px 26px', borderRadius: 999, border: `1.5px solid ${i < 3 ? C.tealL : 'rgba(247,245,240,.35)'}`, fontSize: 28, fontWeight: 600, letterSpacing: '0.04em', color: i < 3 ? C.cream : C.slate }}>{c}</span>; })}
    </div>
    <div style={{ position: 'absolute', left: 150, top: 760, width: 780, fontSize: 23, lineHeight: 1.5, color: C.slate, opacity: fade(f, 110, 130) }}>UK pathways follow each body's published requirements. International frameworks are editable trackers. Your supervisor and accrediting body decide what they accept.</div>
    <Phone k={1.02} x={1190} y={110} rotY={-9} states={[{ src: 'progress-rcem', at: 0, tap: { at: 92, ...tap } }, { src: 'progress-famus', at: 104 }]} />
  </SceneFade>;
}

function Log({ s }) {
  const v = s.voiceFrom - s.from;
  const lung = mark('new-grid', 'lung');
  const items = [['The application', 0.2], ['Your findings', 1.9], ['How you were supervised', 3.1], ['An image, if you have one', 4.6], ['Works offline', 7.0], ['Identifiers removed before saving', 8.4]];
  return <SceneFade dur={s.dur}><Backdrop />
    <Phone k={1.02} x={180} y={110} rotY={9} states={[{ src: 'new-grid', at: 0, tap: { at: v + 15, ...lung } }, { src: 'new-lung-scroll', at: v + 27, scrollFrom: 0, scrollTo: 1300, scrollAt: v + 33, scrollDur: 30 }, { src: 'new-lung-scroll', at: v + 65, scrollFrom: 1300, scrollTo: 2690, scrollAt: v + 67, scrollDur: 38 }, { src: 'new-lung-scroll', at: v + 107, scrollFrom: 2690, scrollTo: 3180, scrollAt: v + 109, scrollDur: 22 }, { src: 'new-image', at: v + Math.round(4.8 * FPS) }, { src: 'saved', at: v + Math.round(9.6 * FPS) }]} />
    <div style={{ position: 'absolute', left: 900, top: 200 }}>
      <div style={{ opacity: fade(useCurrentFrame(), 4, 18) }}><Eyebrow>Log a scan</Eyebrow></div>
      <Kinetic text="In moments, on any shift." start={10} style={{ fontFamily: SERIF, fontSize: 86, lineHeight: 1.05, marginTop: 22, marginBottom: 56, width: 860 }} />
      {items.map(([t, at], i) => <Check key={i} i={i} at={v + Math.round(at * FPS)}>{t}</Check>)}
    </div>
  </SceneFade>;
}

function Supervisors({ s }) {
  const f = useCurrentFrame();
  const z = interpolate(f, [30, 170], [1, 1.3], { ...clamp, easing: ease }) + interpolate(f, [170, 400], [0, 0.05], clamp);
  const badge = mark('supervisors', 'verified');
  return <SceneFade dur={s.dur}><Backdrop />
    <Title eyebrow="Verified supervisors" title="See who is verified, and for what." sub="Registrations and credentials are checked by the Wavelength team. Approval is for named pathway modules." x={150} y={290} w={820} />
    <div style={{ position: 'absolute', left: 1160, top: 110, transform: `scale(${z})`, transformOrigin: `${(badge.x + 13) * 1.02}px ${(badge.y + 13) * 1.02}px` }}>
      <Phone k={1.02} x={0} y={0} rotY={-6} states={[{ src: 'supervisors', at: 0 }]} />
    </div>
  </SceneFade>;
}

function Review({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const send = mark('signoff-pick', 'send');
  const rev = mark('supervise-learner', 'review');
  const second = v + Math.round(3.0 * FPS);
  const supIn = fade(f, second - 10, second + 20);
  return <SceneFade dur={s.dur}><Backdrop />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center' }}>
      <div style={{ opacity: fade(f, 4, 18) }}><Eyebrow>Asynchronous review</Eyebrow></div>
      <Kinetic text="Reviewed when they're free." start={10} style={{ fontFamily: SERIF, fontSize: 76, marginTop: 14 }} />
    </div>
    <Phone k={0.84} x={interpolate(supIn, [0, 1], [760, 440])} y={215} rotY={interpolate(supIn, [0, 1], [0, 8])} states={[{ src: 'signoff-pick', at: 0, tap: { at: 56, ...send } }, { src: 'signoff-send', at: 66 }]} />
    <Phone k={0.84} x={1100} y={215 + (1 - supIn) * 120} opacity={supIn} rotY={-8} states={[{ src: 'supervise-learner', at: 0, tap: { at: second + 40, ...rev } }, { src: 'supervise-sheet-scroll', at: second + 52, scrollFrom: 0, scrollTo: 1450, scrollAt: second + 80, scrollDur: 190 }]} />
    <div style={{ position: 'absolute', left: 120, top: 520, width: 280, fontSize: 26, lineHeight: 1.4, color: C.slate, opacity: fade(f, 20, 40) }}>Trainee<br /><span style={{ color: C.cream }}>sends the scans</span></div>
    <div style={{ position: 'absolute', right: 110, top: 520, width: 300, textAlign: 'right', fontSize: 26, lineHeight: 1.4, color: C.slate, opacity: supIn }}>Supervisor<br /><span style={{ color: C.cream }}>confirms or queries each one, and signs</span></div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26, textAlign: 'center', fontSize: 22, color: C.slate, opacity: fade(f, v + Math.round(9 * FPS), v + Math.round(9.6 * FPS)) }}>Where a pathway requires bedside supervision or an observed assessment, it still happens in person.</div>
  </SceneFade>;
}

function Progress({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const t2 = v + Math.round(3.6 * FPS);
  return <SceneFade dur={s.dur}><Backdrop />
    <Title eyebrow="Progress you can prove" title="Every sign-off counts." sub="Export a portfolio with a QR code that reviewers can check online, in seconds." x={150} y={300} w={720} />
    <Phone k={0.92} x={880} y={170} rotY={-4} states={[{ src: 'log-signed', at: 0 }, { src: 'progress-rcem', at: 70 }, { src: 'export-scroll', at: t2, scrollFrom: 0, scrollTo: 320, scrollAt: t2 + 20, scrollDur: 70 }]} />
    <Phone k={0.92} x={1360} y={170 + (1 - fade(f, t2 + 30, t2 + 60)) * 140} opacity={fade(f, t2 + 30, t2 + 60)} rotY={-10} states={[{ src: 'verify-evidence', at: 0 }]} />
  </SceneFade>;
}

function Free({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const big = v + Math.round(2.0 * FPS);
  const p = fade(f, big, big + 22);
  return <SceneFade dur={s.dur}><Backdrop drift={2} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Kinetic text="Your ultrasound logbook." start={v - 6} stagger={4} style={{ fontFamily: SERIF, fontSize: 96, color: C.cream }} />
      <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 300, lineHeight: 1, color: C.tealL, opacity: p, transform: `scale(${0.92 + 0.08 * p})`, filter: `blur(${(1 - p) * 10}px)`, marginTop: 10 }}>Free.</div>
      <div style={{ fontSize: 30, letterSpacing: '0.14em', color: C.slate, marginTop: 34, opacity: fade(f, big + 30, big + 50) }}>FREE TO USE · DESIGNED FOR REAL CLINICAL PRACTICE</div>
    </div>
  </SceneFade>;
}

function Education({ s }) {
  const f = useCurrentFrame();
  const words = ['HANDS-ON ULTRASOUND COURSES', 'EXPERT-LED TEACHING', 'TAILORED ULTRASOUND TRAINING', 'FLEXIBLE LOCATIONS BY ARRANGEMENT'];
  const step = Math.round((s.dur - 40) / words.length);
  return <SceneFade dur={s.dur}><Backdrop />
    <Browser src="web-courses" x={140} y={150} w={1000} opacity={0.55 * fade(f, 0, 20)} rotY={10} scale={0.96} scrollFrom={0} scrollTo={420} scrollAt={20} scrollDur={step * 2} />
    <Browser src="web-training" x={interpolate(fade(f, step, step + 30), [0, 1], [900, 760])} y={240} w={1040} opacity={fade(f, step - 10, step + 20)} rotY={-8} scrollFrom={0} scrollTo={0} />
    <Browser src="web-training-intl" x={760} y={240} w={1040} opacity={fade(f, step * 3, step * 3 + 24)} rotY={-8} />
    {words.map((wd, i) => { const a = 20 + i * step; const o = Math.min(fade(f, a, a + 14), i < words.length - 1 ? 1 - fade(f, a + step - 8, a + step + 4) : 1); return o > 0 ? <div key={i} style={{ position: 'absolute', left: 150, bottom: 110, opacity: o, transform: `translateY(${(1 - fade(f, a, a + 14)) * 18}px)`, fontFamily: SANS, fontWeight: 600, fontSize: 52, letterSpacing: '0.12em', color: C.cream, textShadow: '0 4px 30px rgba(0,0,0,.6)' }}>{wd}</div> : null; })}
  </SceneFade>;
}

function End({ s }) {
  return <SceneFade dur={s.dur} outF={1}><Backdrop /><EndFrame film="flagship" start={0} /></SceneFade>;
}

const SCENES = { open: Open, problem: Problem, intro: Intro, pathways: Pathways, log: Log, supervisors: Supervisors, review: Review, progress: Progress, free: Free, education: Education, end: End };
// only: optional list of scenes (the representative sample uses two), re-timed to start at 0.
export function Flagship({ only = null, music = 'music/flagship.wav' }) {
  const full = flagshipTL();
  let scenes = full.scenes;
  if (only) { let at = 0; scenes = full.scenes.filter((s) => only.includes(s.scene)).map((s) => { const shift = at - s.from; at += s.dur; return { ...s, from: s.from + shift, voiceFrom: s.voiceFrom + shift }; }); }
  const tl = { scenes, total: scenes.reduce((m, s) => Math.max(m, s.from + s.dur), 0) };
  return <Canvas>
    {scenes.map((s) => { const Scene = SCENES[s.scene]; return <Sequence key={s.scene} from={s.from} durationInFrames={s.dur}>{s.scene === 'open' ? <Open dur={s.dur} /> : <Scene s={s} />}</Sequence>; })}
    <Audio src={staticFile(music.startsWith('audio/') ? music : 'audio/' + music)} volume={(f) => musicVolume(f, tl, { base: 0.55, duck: 0.2 })} />
    {scenes.filter((s) => s.audio).map((s) => <Sequence key={'v' + s.scene} from={s.voiceFrom} durationInFrames={s.voiceDur + 6}><Audio src={staticFile(s.audio)} volume={1} /></Sequence>)}
    {scenes.filter((s) => ['intro', 'education', 'end'].includes(s.scene)).map((s) => <Sequence key={'w' + s.scene} from={Math.max(0, s.from - 12)} durationInFrames={34}><Audio src={staticFile('audio/sfx/whoosh.wav')} volume={0.22} /></Sequence>)}
    {scenes.filter((s) => s.scene === 'free').map((s) => <Sequence key="swell" from={s.voiceFrom + Math.round(2.0 * FPS) - 60} durationInFrames={72}><Audio src={staticFile('audio/sfx/swell.wav')} volume={0.5} /></Sequence>)}
  </Canvas>;
}
