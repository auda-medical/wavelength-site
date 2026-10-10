// Version 2 free-logbook short (about 32 seconds), landscape and portrait, clean or captioned. Problem, free logbook,
// three real app moments shown close up, courses and training, one call to action: START YOUR FREE LOGBOOK.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Backdrop, mark } from '../kit.jsx';
import { C, SERIF, SANS, Line, Eyebrow2, Head, Focus, Device, onScreen, Captions, cuesFor, Probe, prog, Mark, SceneFade, outOf } from './kit2.jsx';
import { ScanImage, TeachingRoom } from './art.jsx';
import { timeline2, duck, FPS } from './timeline2.js';
import { End2 } from './Flagship2.jsx';

export const SHORT2_PLAN = [
  { scene: 'hook', min: 3.8, lead: 0.25, tail: 0.5, overlap: 0.4 },
  { scene: 'free', min: 5.4, lead: 0.4, overlap: 0.4 },
  { scene: 'log', min: 3.8, lead: 0.3, tail: 0.5, overlap: 0.4 },
  { scene: 'review', min: 4.6, lead: 0.2, overlap: 0.4 },
  { scene: 'progress', min: 3.4, lead: 0.2, overlap: 0.4 },
  { scene: 'education', min: 5.6, lead: 0.4, overlap: 0.4 },
  { scene: 'end', min: 6.5, lead: 0.4 },
];
export const short2TL = () => timeline2('short', SHORT2_PLAN);
const sec = (x) => Math.round(x * FPS);
const CARDS = ['Lung and pleura', 'eFAST or FAFF', 'Abdominal aorta (AAA)', 'Echo in life support'];

function Hook({ s, V }) {
  const f = useCurrentFrame();
  const shown = CARDS.filter((_, i) => f >= 8 + i * 16).length;
  const out = outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap} inF={1}><Backdrop tone="dim" w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div data-box="art" style={{ position: 'absolute', left: V ? 140 : 150, top: V ? 260 : 210, width: V ? 800 : 820, height: V ? 600 : 620, borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,.5)', transform: `scale(${1.06 - 0.06 * prog(f, 0, s.dur)})` }}><ScanImage w={V ? 800 : 820} h={V ? 600 : 620} id="hook" /></div>
    <div style={{ position: 'absolute', left: V ? 140 : 1100, top: V ? 940 : 250, width: V ? 800 : 660, opacity: out }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20, opacity: prog(f, 4, 12) }}>
        <div data-box="text" data-id="awaiting" style={{ fontSize: V ? 30 : 24, letterSpacing: '0.16em', color: C.slate }}>AWAITING SIGN-OFF</div>
        <div data-box="text" data-id="count" style={{ fontFamily: SERIF, fontSize: V ? 90 : 76, lineHeight: 1, color: C.cream }}>{shown}</div>
      </div>
      {CARDS.map((t, i) => { const at = 8 + i * 16; if (f < at) return null; const p = prog(f, at, at + 10); return <div key={i} data-box="card" style={{ height: V ? 96 : 82, marginBottom: 14, borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', opacity: p, transform: `translateY(${(1 - p) * -14}px)`, fontSize: V ? 30 : 26 }}><span>{t}</span><span style={{ color: '#E9B872', fontSize: V ? 24 : 20 }}>● Awaiting review</span></div>; })}
    </div>
  </SceneFade>;
}
function Free({ s, V }) {
  const f = useCurrentFrame();
  const p = prog(f, 12, 30) * outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={2} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 560 : 260, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div data-box="logo" style={{ opacity: outOf(f, s) }}><Mark size={V ? 130 : 110} draw={prog(f, 0, 22)} ring={prog(f, 0, 18)} /></div>
      <div style={{ marginTop: 44 }}><Line at={4} id="free" align="center" style={{ fontWeight: 600, fontSize: V ? 58 : 64, letterSpacing: '0.12em', color: C.cream }}>{V ? <>YOUR ULTRASOUND<br />LOGBOOK.</> : 'YOUR ULTRASOUND LOGBOOK.'}</Line></div>
      <div data-box="text" data-id="free" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: V ? 290 : 250, lineHeight: 1, color: C.tealL, opacity: p, transform: `scale(${0.94 + 0.06 * p})`, marginTop: 6 }}>FREE.</div>
    </div>
  </SceneFade>;
}
// Phone close-up scenes: the phone sits right (landscape) or centre (portrait), the line of copy sits beside or above.
function PhoneScene({ s, V, eyebrow, title, states, focus, note }) {
  const f = useCurrentFrame();
  const d = V ? { x: 540 - (416 * 1.1) / 2, y: 470, k: 1.1 } : { x: 1130, y: 60, k: 1.1 };
  const pt = onScreen(d, focus.px, focus.py);
  const keys = [{ at: 0, s: 1, fx: pt.x, fy: pt.y, tx: pt.x, ty: pt.y }, { at: focus.at, dur: 22, s: focus.s, fx: pt.x, fy: pt.y, tx: V ? 540 : 1390, ty: V ? 960 : 560 }];
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    {V ? <div style={{ position: 'absolute', left: 0, right: 0, top: 440, height: 1920 - 440 - (note ? 640 : 470), overflow: 'hidden' }}><div style={{ position: 'absolute', left: 0, top: -440, width: 1080, height: 1920 }}><Focus keys={keys}><Device x={d.x} y={d.y} k={d.k} states={states} /></Focus></div></div>
      : <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Focus keys={keys}><Device x={d.x} y={d.y} k={d.k} states={states} /></Focus></div>}
    <div style={{ position: 'absolute', left: V ? 80 : 150, right: V ? 80 : undefined, top: V ? 170 : 380, width: V ? undefined : 760, textAlign: V ? 'center' : 'left' }}>
      <Eyebrow2 at={2} style={{ fontSize: V ? 28 : 22 }}>{eyebrow}</Eyebrow2>
      <div style={{ marginTop: 16 }}><Head at={5} size={V ? 78 : 80} id="title" style={{ textAlign: V ? 'center' : 'left' }}>{title}</Head></div>
      {note && !V ? <div style={{ marginTop: 34, width: 640 }}><Line at={30} id="note" style={{ fontSize: 24, lineHeight: 1.45, color: C.slate }}>{note}</Line></div> : null}
    </div>
    {note && V ? <div style={{ position: 'absolute', left: 90, right: 90, top: 1310 }}><Line at={30} id="note" align="center" style={{ fontSize: 28, lineHeight: 1.4, color: C.slate }}>{note}</Line></div> : null}
  </SceneFade>;
}
function Education({ s, V }) {
  const f = useCurrentFrame();
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    {V ? <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Focus keys={[{ at: 0, s: 0.86, fx: 1290, fy: 640, tx: 540, ty: 1040 }, { at: 0, dur: s.dur, s: 0.8, fx: 1290, fy: 640, tx: 540, ty: 1040 }]}><TeachingRoom f={f} /></Focus></div>
      : <Focus keys={[{ at: 0, s: 1.08, fx: 1280, fy: 640, tx: 1280, ty: 640 }, { at: 0, dur: s.dur, s: 1, fx: 1280, fy: 640, tx: 1280, ty: 640 }]}><TeachingRoom f={f} /></Focus>}
    <div style={{ position: 'absolute', left: V ? 0 : 130, right: V ? 0 : undefined, top: V ? 230 : 300, width: V ? undefined : 600, display: 'flex', flexDirection: 'column', alignItems: V ? 'center' : 'flex-start', gap: 20 }}>
      <Line at={6} id="hands" style={{ fontWeight: 600, fontSize: V ? 50 : 44, letterSpacing: '0.12em', color: C.cream }}>HANDS-ON COURSES</Line>
      <Line at={22} id="tailored" style={{ fontWeight: 600, fontSize: V ? 50 : 44, letterSpacing: '0.12em', color: C.cream }}>TAILORED TRAINING</Line>
    </div>
  </SceneFade>;
}

const ZONES_L = { hook: { x: 150, y: 880, w: 820, align: 'left' }, free: { x: 260, y: 900, w: 1400, align: 'center' }, log: { x: 150, y: 860, w: 820, align: 'left' }, review: { x: 150, y: 860, w: 820, align: 'left' }, progress: { x: 150, y: 860, w: 820, align: 'left' }, education: { x: 130, y: 560, w: 560, align: 'left' } };
const ZONES_V = { hook: { x: 80, y: 1560, w: 920 }, free: { x: 80, y: 1260, w: 920 }, log: { x: 80, y: 1480, w: 920 }, review: { x: 80, y: 1480, w: 920 }, progress: { x: 80, y: 1480, w: 920 }, education: { x: 80, y: 1500, w: 920 } };

export function Short2({ vertical = false, captions = false }) {
  const V = vertical;
  const tl = short2TL();
  const lung = mark('new-grid', 'lung'), fam = mark('progress-rcem', 'famus');
  const render = (x) => {
    if (x.scene === 'hook') return <Hook s={x} V={V} />;
    if (x.scene === 'free') return <Free s={x} V={V} />;
    if (x.scene === 'log') return <PhoneScene s={x} V={V} eyebrow="Log a scan" title="In moments." states={[{ src: 'new-grid', at: 0, tap: { at: 14, ...lung } }, { src: 'new-lung-scroll', at: 24, scrollFrom: 0, scrollTo: 1330, scrollAt: 30, scrollDur: 26 }]} focus={{ at: 26, s: 1.4, px: 195, py: 430 }} />;
    if (x.scene === 'review') return <PhoneScene s={x} V={V} eyebrow="Supervision" title="Reviewed when they're free." note="Bedside supervision and observed assessments still happen in person, where your pathway requires them." states={[{ src: 'supervise-sheet-scroll', at: 0, scrollFrom: 700, scrollTo: 1450, scrollAt: 10, scrollDur: 70 }]} focus={{ at: 4, s: 1.35, px: 195, py: 520 }} />;
    if (x.scene === 'progress') return <PhoneScene s={x} V={V} eyebrow="Progress" title="Every target, tracked." states={[{ src: 'progress-rcem', at: 0, tap: { at: 30, ...fam } }, { src: 'progress-famus', at: 40 }]} focus={{ at: 2, s: 1.3, px: 195, py: 300 }} />;
    if (x.scene === 'education') return <Education s={x} V={V} />;
    return <End2 s={x} film="short" ctas={['START YOUR FREE LOGBOOK']} vertical={V} />;
  };
  // Captions start once the scene has fully replaced the previous one (16 frames), never during the dissolve.
  const cues = tl.scenes.flatMap((x) => (x.scene === 'end' ? [] : cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(2), V ? 30 : 42)));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return (V ? ZONES_V : ZONES_L)[sc.scene] || { x: 80, y: V ? 1500 : 900, w: V ? 920 : 1760 }; };
  return <div style={{ position: 'absolute', inset: 0, background: C.ink, fontFamily: SANS, color: C.cream }}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{render(x)}</Sequence>)}
    {captions ? <Captions cues={cues} zone={zone} size={V ? 44 : 36} /> : null}
    <Audio src={staticFile('audio-v2/music/short.wav')} volume={(f) => duck(f, tl, { base: 0.55, low: 0.2 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
    <Probe />
  </div>;
}
