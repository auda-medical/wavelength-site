// Version 3 free-logbook short (about 32 seconds), landscape and portrait, clean or captioned. The rota mismatch, then
// the real app: log the scan, request a review, reviewed on another shift; the free logbook; START YOUR FREE LOGBOOK.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame } from 'remotion';
import { Backdrop, mark } from '../kit.jsx';
import { C, SERIF, SANS, Line, Eyebrow2, Head, Focus, Device, onScreen, Captions, cuesFor, Probe, prog, Mark, SceneFade, outOf, easeIO } from '../v2/kit2.jsx';
import { End3 } from './End3.jsx';
import { RotaWeek, ShiftLanes } from './art3.jsx';
import { timeline3, duck, FPS } from './timeline3.js';

export const SHORT3_PLAN = [
  { scene: 'hook', min: 4.6, lead: 0.2, tail: 0.6, overlap: 0.4 },
  { scene: 'log', min: 4.6, lead: 0.3, tail: 0.5, overlap: 0.4 },
  { scene: 'request', min: 4.4, lead: 0.2, tail: 0.5, overlap: 0.4 },
  { scene: 'review', min: 5.2, lead: 0.4, tail: 0.6, overlap: 0.4 },
  { scene: 'free', min: 6.4, lead: 0.4, tail: 0.6, overlap: 0.4 },
  { scene: 'end', min: 6.5, lead: 0.4 },
];
export const short3TL = () => timeline3('short', SHORT3_PLAN);
const sec = (x) => Math.round(x * FPS);

function Hook({ s, V }) {
  return <SceneFade dur={s.dur} inF={1} next={s.overlap}><Backdrop tone="dim" w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 380 : 120, display: 'flex', justifyContent: 'center' }}><Eyebrow2 at={0} style={{ fontSize: V ? 34 : 26 }}>Different shifts</Eyebrow2></div>
    <div style={{ position: 'absolute', left: V ? 50 : 310, top: V ? 520 : 240 }}><RotaWeek at={0} w={V ? 980 : 1300} scale={V ? 0.72 : 1} /></div>
  </SceneFade>;
}
// A phone close-up with one line of copy above (portrait) or beside it (landscape); optional shift line.
function PhoneScene({ s, V, eyebrow, title, states, focus, lanes }) {
  const d = V ? { x: 540 - (416 * 1.1) / 2, y: 520, k: 1.1 } : { x: 1130, y: lanes ? 230 : 60, k: lanes ? 0.92 : 1.1 };
  const pt = onScreen(d, focus.px, focus.py);
  const keys = [{ at: 0, s: 1, fx: pt.x, fy: pt.y, tx: pt.x, ty: pt.y }, { at: focus.at, dur: 22, s: focus.s, fx: pt.x, fy: pt.y, tx: V ? 540 : 1390, ty: V ? 1000 : (lanes ? 790 : 560) }];
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    {lanes ? <div style={{ position: 'absolute', left: V ? 40 : 160, top: V ? 330 : 50 }}><ShiftLanes p={lanes.p} w={V ? 1000 : 1600} showRight={lanes.right} /></div> : null}
    {V ? <div style={{ position: 'absolute', left: 0, right: 0, top: 500, height: 1920 - 500 - 470, overflow: 'hidden' }}><div style={{ position: 'absolute', left: 0, top: -500, width: 1080, height: 1920 }}><Focus keys={keys}><Device x={d.x} y={d.y} k={d.k} states={states} /></Focus></div></div>
      : <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Focus keys={keys}><Device x={d.x} y={d.y} k={d.k} states={states} /></Focus></div>}
    <div style={{ position: 'absolute', left: V ? 80 : 150, right: V ? 80 : undefined, top: V ? 150 : 420, width: V ? undefined : 760, textAlign: V ? 'center' : 'left' }}>
      <Eyebrow2 at={2} style={{ fontSize: V ? 28 : 22 }}>{eyebrow}</Eyebrow2>
      <div style={{ marginTop: 14 }}><Head at={5} size={V ? 76 : 80} id="title" style={{ textAlign: V ? 'center' : 'left' }}>{title}</Head></div>
    </div>
  </SceneFade>;
}
function Free({ s, V }) {
  const f = useCurrentFrame();
  const p = prog(f, 26, 44) * outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={2} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 560 : 260, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div data-box="logo" style={{ opacity: outOf(f, s) }}><Mark size={V ? 130 : 110} draw={prog(f, 0, 22)} ring={prog(f, 0, 18)} /></div>
      <div style={{ marginTop: 44 }}><Line at={4} id="free" align="center" style={{ fontWeight: 600, fontSize: V ? 58 : 64, letterSpacing: '0.12em', color: C.cream }}>{V ? <>YOUR ULTRASOUND<br />LOGBOOK.</> : 'YOUR ULTRASOUND LOGBOOK.'}</Line></div>
      <div data-box="text" data-id="free" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: V ? 290 : 250, lineHeight: 1, color: C.tealL, opacity: p, transform: `scale(${0.94 + 0.06 * p})`, marginTop: 6 }}>FREE.</div>
    </div>
  </SceneFade>;
}
const ZONES_L = { hook: { x: 260, y: 900, w: 1400 }, log: { x: 150, y: 860, w: 820, align: 'left' }, request: { x: 150, y: 860, w: 820, align: 'left' }, review: { x: 150, y: 860, w: 820, align: 'left' }, free: { x: 260, y: 900, w: 1400 } };
const ZONES_V = { hook: { x: 80, y: 1100, w: 920 }, log: { x: 80, y: 1480, w: 920 }, request: { x: 80, y: 1480, w: 920 }, review: { x: 80, y: 1480, w: 920 }, free: { x: 80, y: 1260, w: 920 } };

export function Short3({ vertical = false, captions = false }) {
  const V = vertical;
  const tl = short3TL();
  const f0 = useCurrentFrame();
  const lung = mark('new-grid', 'lung'), send = mark('v3-request-pick', 'send'), create = mark('v3-request-ready', 'create');
  const render = (x) => {
    if (x.scene === 'hook') return <Hook s={x} V={V} />;
    if (x.scene === 'log') return <PhoneScene s={x} V={V} eyebrow="Log your scan" title="In moments." states={[{ src: 'new-grid', at: 0, tap: { at: 12, ...lung } }, { src: 'new-lung-scroll', at: 22, scrollFrom: 0, scrollTo: 1330, scrollAt: 28, scrollDur: 24 }]} focus={{ at: 24, s: 1.4, px: 195, py: 430 }} />;
    if (x.scene === 'request') return <PhoneScene s={x} V={V} eyebrow="Request review" title="On your shift." lanes={{ p: 0, right: 0.25 }} states={[{ src: 'v3-request-ready', at: 0, tap: { at: 18, ...create } }, { src: 'v3-request-sent', at: 28 }]} focus={{ at: 34, s: V ? 1.35 : 1.25, px: 195, py: 470 }} />;
    if (x.scene === 'review') return <ReviewScene s={x} V={V} />;
    if (x.scene === 'free') return <Free s={x} V={V} />;
    return <End3 s={x} film="short" ctas={['START YOUR FREE LOGBOOK']} vertical={V} />;
  };
  const cues = tl.scenes.flatMap((x) => (x.scene === 'end' ? [] : cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(2), V ? 30 : 42)));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return (V ? ZONES_V : ZONES_L)[sc.scene] || { x: 80, y: V ? 1500 : 900, w: V ? 920 : 1760 }; };
  return <div style={{ position: 'absolute', inset: 0, background: C.ink, fontFamily: SANS, color: C.cream }}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{render(x)}</Sequence>)}
    {captions ? <Captions cues={cues} zone={zone} size={V ? 44 : 36} /> : null}
    <Audio src={staticFile('audio-v3/music/short.wav')} volume={(f) => duck(f, tl, { base: 0.55, low: 0.2 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
    <Probe />
  </div>;
}
// Reviewed on their shift: the request travels along the shift line, the supervisor signs.
function ReviewScene({ s, V }) {
  const f = useCurrentFrame();
  const p = prog(f, 0, 36, easeIO);
  return <PhoneScene s={s} V={V} eyebrow="Review when available" title="On their shift." lanes={{ p, right: prog(f, 16, 34) }} states={[{ src: 'v3-review-sheet', at: 0, scrollFrom: 900, scrollTo: 1450, scrollAt: 30, scrollDur: 70 }, { src: 'v3-signed-done', at: s.dur - 34 }]} focus={{ at: 26, s: V ? 1.3 : 1.25, px: 195, py: 520 }} />;
}
