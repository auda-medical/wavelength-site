// Version 4 free-logbook short (about 30 seconds): the version 3 short with the version 4 look (src/v4/look.jsx).
// The rota mismatch in calm, cool light; then the real app in daylight; the free logbook on a teal field; START YOUR
// FREE LOGBOOK. Sound is mixed outside Remotion (scripts/mix-v4.mjs).
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame } from 'remotion';
import { mark } from '../kit.jsx';
import { SERIF, SANS, Line, Eyebrow2, Head, Focus, Device as Device0, onScreen, Captions, cuesFor, Probe, prog, Mark, SceneFade, outOf, easeIO, ThemeCtx } from '../v2/kit2.jsx';
import { End4 } from './End4.jsx';
import { RotaWeek4 as RotaWeek, ShiftLanes4 as ShiftLanes } from './art4.jsx';
import { Backdrop4, L, THEME_LIGHT, PHONE_SHADOW } from './look.jsx';
import { timeline4, FPS } from './plans.js';
import T from '../../public/audio-v4/timings.json';
import S from './script.json';
const Device = (p) => <Device0 shadow={PHONE_SHADOW} {...p} />;

export const short4TL = () => timeline4('short', T, S);
const sec = (x) => Math.round(x * FPS);

function Hook({ s, V }) {
  return <SceneFade dur={s.dur} inF={1} next={s.overlap}><Backdrop4 tone="mist" w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 640 : 120, display: 'flex', justifyContent: 'center' }}><Eyebrow2 at={0} style={{ fontSize: V ? 34 : 26 }}>Different shifts</Eyebrow2></div>
    <div style={{ position: 'absolute', left: V ? 50 : 310, top: V ? 760 : 240 }}><RotaWeek at={0} w={V ? 980 : 1300} scale={V ? 0.72 : 1} mark={sec(2.2)} /></div>
  </SceneFade>;
}
// A phone close-up with one line of copy above (portrait) or beside it (landscape); optional shift line.
function PhoneScene({ s, V, eyebrow, title, states, focus, lanes }) {
  const d = V ? { x: 540 - (416 * 1.1) / 2, y: 520, k: 1.1 } : { x: 1130, y: lanes ? 230 : 60, k: lanes ? 0.92 : 1.1 };
  const pt = onScreen(d, focus.px, focus.py);
  const keys = [{ at: 0, s: 1, fx: pt.x, fy: pt.y, tx: pt.x, ty: pt.y }, { at: focus.at, dur: 22, s: focus.s, fx: pt.x, fy: pt.y, tx: V ? 540 : 1390, ty: V ? 1000 : (lanes ? 790 : 560) }];
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop4 tone="day" w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
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
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop4 tone="teal" w={V ? 1080 : 1920} h={V ? 1920 : 1080} drift={2} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 560 : 260, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div data-box="logo" style={{ opacity: outOf(f, s) }}><Mark size={V ? 130 : 110} draw={prog(f, 0, 22)} ring={prog(f, 0, 18)} ringColor="#F7F5F0" color="#FFFFFF" /></div>
      <div style={{ marginTop: 44 }}><Line at={4} id="free" align="center" style={{ fontWeight: 600, fontSize: V ? 58 : 64, letterSpacing: '0.12em', color: '#F2FAFA' }}>{V ? <>YOUR ULTRASOUND<br />LOGBOOK.</> : 'YOUR ULTRASOUND LOGBOOK.'}</Line></div>
      <div data-box="text" data-id="free" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: V ? 290 : 250, lineHeight: 1, color: '#FFFFFF', opacity: p, transform: `scale(${0.94 + 0.06 * p})`, marginTop: 6, textShadow: '0 20px 60px rgba(10,60,68,0.25)' }}>FREE.</div>
    </div>
  </SceneFade>;
}
const ZONES_L = { hook: { x: 260, y: 900, w: 1400 }, log: { x: 150, y: 860, w: 820, align: 'left' }, request: { x: 150, y: 860, w: 820, align: 'left' }, review: { x: 150, y: 860, w: 820, align: 'left' }, free: { x: 260, y: 900, w: 1400 } };
const ZONES_V = { hook: { x: 80, y: 1140, w: 920 }, log: { x: 80, y: 1480, w: 920 }, request: { x: 80, y: 1480, w: 920 }, review: { x: 80, y: 1480, w: 920 }, free: { x: 80, y: 1260, w: 920 } };

export function Short4({ vertical = false, captions = false, mix = null }) {
  const V = vertical;
  const tl = short4TL();
  const f0 = useCurrentFrame();
  const lung = mark('new-grid', 'lung'), send = mark('v3-request-pick', 'send'), create = mark('v3-request-ready', 'create');
  const render = (x) => {
    if (x.scene === 'hook') return <Hook s={x} V={V} />;
    if (x.scene === 'log') return <PhoneScene s={x} V={V} eyebrow="Log your scan" title="In moments." states={[{ src: 'new-grid', at: 0, tap: { at: 12, ...lung } }, { src: 'new-lung-scroll', at: 22, scrollFrom: 0, scrollTo: 1330, scrollAt: 28, scrollDur: 24 }]} focus={{ at: 24, s: 1.4, px: 195, py: 430 }} />;
    if (x.scene === 'request') return <PhoneScene s={x} V={V} eyebrow="Request review" title="On your shift." lanes={{ p: 0, right: 0.25 }} states={[{ src: 'v3-request-ready', at: 0, tap: { at: 18, ...create } }, { src: 'v3-request-sent', at: 28 }]} focus={{ at: 34, s: V ? 1.35 : 1.25, px: 195, py: 470 }} />;
    if (x.scene === 'review') return <ReviewScene s={x} V={V} />;
    if (x.scene === 'free') return <Free s={x} V={V} />;
    return <End4 s={x} film="short" ctas={['START YOUR FREE LOGBOOK']} vertical={V} />;
  };
  const cues = tl.scenes.flatMap((x) => (x.scene === 'end' ? [] : cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(2), V ? 30 : 42)));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return (V ? ZONES_V : ZONES_L)[sc.scene] || { x: 80, y: V ? 1500 : 900, w: V ? 920 : 1760 }; };
  return <ThemeCtx.Provider value={THEME_LIGHT}><div style={{ position: 'absolute', inset: 0, background: L.cream, fontFamily: SANS, color: L.navy }}>
    {tl.scenes.map((x) => <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}>{render(x)}</Sequence>)}
    {captions ? <Captions cues={cues} zone={zone} size={V ? 44 : 36} /> : null}
    {mix ? <Audio src={staticFile(mix)} /> : null}
    <Probe />
  </div></ThemeCtx.Provider>;
}
// Reviewed on their shift: the request travels along the shift line, the supervisor signs.
function ReviewScene({ s, V }) {
  const f = useCurrentFrame();
  const p = prog(f, 0, 36, easeIO);
  return <PhoneScene s={s} V={V} eyebrow="Review when available" title="On their shift." lanes={{ p, right: prog(f, 16, 34) }} states={[{ src: 'v3-review-sheet', at: 0, scrollFrom: 900, scrollTo: 1450, scrollAt: 30, scrollDur: 70 }, { src: 'v3-signed-done', at: s.dur - 34 }]} focus={{ at: 26, s: V ? 1.3 : 1.25, px: 195, py: 520 }} />;
}
