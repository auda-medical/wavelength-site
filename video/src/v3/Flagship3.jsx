// Version 3 flagship (about 2 minutes). The scan is done; a suitable supervisor isn't on your shift; your logbook
// shouldn't have to wait. Then the real workflow across two shifts: log the scan, choose a Wavelength-verified
// supervisor, request a review on your shift, reviewed on theirs, the outcome in your record, progress, the free
// logbook, courses and training. Every app screen is a capture of the real app (scripts/capture.mjs, step v3).
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Backdrop, Wordmark, mark } from '../kit.jsx';
import { C, SERIF, SANS, Line, Eyebrow2, Head, Focus, Device, onScreen, Captions, cuesFor, Probe, prog, Mark, SceneFade, outOf, easeIO } from '../v2/kit2.jsx';
import { Cart, Person, Couch, TeachingRoom } from '../v2/art.jsx';
import { End3 } from './End3.jsx';
import { LogoReveal } from './reveal.jsx';
import { RotaWeek, ShiftLanes } from './art3.jsx';
import { timeline3, duck, FPS } from './timeline3.js';

export const FLAGSHIP3_PLAN = [
  { scene: 'scan', min: 5.6, lead: 0.3, tail: 0.6, overlap: 0.5 },
  { scene: 'rota', min: 9.0, lead: 0.3, tail: 0.8, overlap: 0.5 },
  { scene: 'wait', min: 8.8, lead: 0.3, tail: 0.9, overlap: 0.5 },
  { scene: 'brand', min: 9.4, lead: 2.0, tail: 0.6, overlap: 0.5 },
  { scene: 'log', min: 12.5, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'verified', min: 10.5, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'request', min: 7.5, lead: 0.4, tail: 0.9, overlap: 0.5 },
  { scene: 'review', min: 11.5, lead: 0.6, tail: 0.9, overlap: 0.5 },
  { scene: 'outcome', min: 10.0, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'progress', min: 8.5, lead: 0.4, tail: 0.6, overlap: 0.5 },
  { scene: 'free', min: 6.4, lead: 0.5, tail: 0.6, overlap: 0.5 },
  { scene: 'education', min: 8.5, lead: 0.4, tail: 0.6, overlap: 0.5 },
  { scene: 'end', min: 7.0, lead: 0.6 },
];
export const flagship3TL = () => timeline3('flagship', FLAGSHIP3_PLAN);
const sec = (x) => Math.round(x * FPS);
const PH = { x: 1120, y: 60, k: 1.12 }; // the phone's resting place in landscape scenes

// 1. Night shift: the scan, close on the screen, then the clinician at the bedside.
function Scan({ s }) {
  const f = useCurrentFrame();
  const cart = { x: 330, y: 1000 - 860 * 0.92, s: 0.92 };
  const scr = { x: cart.x + (54 + 156) * cart.s, y: cart.y + (34 + 111) * cart.s };
  return <SceneFade dur={s.dur} inF={1} next={s.overlap}><Backdrop tone="dim" />
    <Focus keys={[{ at: 0, s: 2.1, fx: scr.x, fy: scr.y, tx: 760, ty: 520 }, { at: sec(1.6), dur: 46, s: 1, fx: 960, fy: 540, tx: 960, ty: 540 }]}>
      <div style={{ position: 'absolute', left: 300, width: 1500, top: 998, height: 2, background: 'linear-gradient(90deg, transparent, rgba(127,196,204,0.16), transparent)' }} />
      <Cart x={cart.x} y={cart.y} s={cart.s} id="night3" />
      <Couch x={760} floor={1000} s={0.98} />
      <Person x={1010} floor={1000} s={0.9} pose="scan" tone="#2A5878" f={f} id="clin" />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 80 }}><Line at={1} id="clock" style={{ fontSize: 24, letterSpacing: '0.2em', color: C.slate }}>NIGHT SHIFT · 03:12</Line></div>
    <div style={{ position: 'absolute', left: 1240, top: 300, width: 600 }}><Head at={sec(2.4)} size={76} id="done">The scan is done.</Head></div>
  </SceneFade>;
}

// 2. The rota: nights against days and another site; no shift in common.
function Rota({ s }) {
  const v = s.voiceFrom - s.from;
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 110, display: 'flex', justifyContent: 'center' }}><Eyebrow2 at={4} style={{ fontSize: 26 }}>Different shifts</Eyebrow2></div>
    <div style={{ position: 'absolute', left: 190, top: 210 }}><RotaWeek at={6} w={1540} scale={1.2} /></div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 820, display: 'flex', justifyContent: 'center' }}><Head at={v + sec(2.0)} size={72} id="noton">Your supervisor isn't on your shift.</Head></div>
  </SceneFade>;
}

// 3. A week passes: the unsent scan's details fade as the days count up.
function Wait({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const days = Math.min(7, Math.floor(interpolate(f, [10, v + sec(2.6)], [0, 7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const fadeOut = (i) => 1 - 0.8 * prog(f, 20 + i * 18, 60 + i * 18);
  const out = outOf(f, s);
  const rows = [['Findings', 'Lung sliding present, no B-lines'], ['Supervision', 'Directly supervised'], ['Image', 'Saved on this phone'], ['Reflection', 'What I would do differently']];
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop tone="dim" />
    <div data-box="card" style={{ position: 'absolute', left: 230, top: 250, width: 720, padding: '34px 40px', borderRadius: 26, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', opacity: prog(f, 0, 12) * out }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={{ fontSize: 34, color: C.cream }}>Lung and pleura</div><div style={{ fontSize: 22, color: '#E9B872' }}>● Not logged yet</div></div>
      <div style={{ fontSize: 22, color: C.slate, marginTop: 6 }}>Tuesday 03:12 · Emergency department</div>
      <div style={{ marginTop: 26 }}>{rows.map(([k, val], i) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 24, opacity: fadeOut(i), filter: `blur(${(1 - fadeOut(i)) * 5}px)` }}><span style={{ color: C.slate }}>{k}</span><span style={{ color: C.cream }}>{val}</span></div>)}</div>
    </div>
    <div style={{ position: 'absolute', left: 1040, top: 250, width: 800, opacity: prog(f, 6, 18) * out }}>
      <div data-box="text" data-id="days" style={{ fontFamily: SERIF, fontSize: 150, lineHeight: 1, whiteSpace: 'nowrap', color: days >= 7 ? C.tealL : C.cream }}>+ {days} {days === 1 ? 'DAY' : 'DAYS'}</div>
    </div>
    <div style={{ position: 'absolute', left: 1040, top: 470, width: 760 }}><Head at={v + sec(3.6)} size={66} id="wait">Your logbook shouldn't have to wait.</Head></div>
  </SceneFade>;
}

// 4. The brand reveal (after the problem): macro on the wave, pullback, settle, wordmark and tagline; the narration
// starts as the emblem settles; then the logo glides aside as the real app rises where the next scene uses it.
function Brand({ s }) {
  const f = useCurrentFrame();
  const g = prog(f, sec(2.9), sec(2.9) + 22, easeIO);
  const up = prog(f, sec(3.2), sec(3.2) + 32);
  return <SceneFade dur={s.dur} inF={10} next={s.overlap}><Backdrop />
    <Sequence from={0} durationInFrames={130}><Audio src={staticFile('audio-v3/sfx/reveal.wav')} volume={0.6} /></Sequence>
    <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-480 * g}px)`, opacity: outOf(f, s) }}><LogoReveal cx={960} cy={400} size={150} variant="full" wordSize={66} /></div>
    <Device x={PH.x} y={interpolate(up, [0, 1], [1100, PH.y])} k={PH.k} states={[{ src: 'home', at: 0 }]} opacity={up > 0 ? 1 : 0} />
  </SceneFade>;
}

// 5. Log the scan: application, findings, supervision, image, pathway; the camera moves to each.
function Log({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const d = PH, P = (px, py) => onScreen(d, px, py), C0 = P(195, 422);
  const home = mark('home', 'log'), lung = mark('new-grid', 'lung');
  const t = { grid: sec(0.8), lung: v + sec(1.1), find: v + sec(2.4), sup: v + sec(4.0), img: v + sec(6.0), path: v + sec(8.6), saved: v + sec(10.6) };
  const steps = [['Application', t.grid], ['Findings', t.find], ['Supervision', t.sup], ['Image', t.img], ['Pathway', t.path]];
  const active = steps.reduce((a, [, at], i) => (f >= at ? i : a), -1);
  const out = outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[
      { at: 0, s: 1, fx: C0.x, fy: C0.y, tx: C0.x, ty: C0.y },
      { at: t.lung - 8, dur: 18, s: 1.35, fx: P(195, 330).x, fy: P(195, 330).y, tx: 1400, ty: 520 },
      { at: t.find - 8, dur: 18, s: 1.5, fx: P(195, 420).x, fy: P(195, 420).y, tx: 1400, ty: 540 },
      { at: t.img - 10, dur: 18, s: 1.15, fx: C0.x, fy: C0.y, tx: 1400, ty: 540 },
      { at: t.path - 8, dur: 18, s: 1.5, fx: P(195, 420).x, fy: P(195, 420).y, tx: 1400, ty: 540 },
      { at: t.saved - 6, dur: 20, s: 1, fx: C0.x, fy: C0.y, tx: C0.x, ty: C0.y },
    ]}>
      <Device x={d.x} y={d.y} k={d.k} states={[
        { src: 'home', at: 0, tap: { at: sec(0.4), ...home } },
        { src: 'new-grid', at: t.grid, tap: { at: t.lung - 8, ...lung } },
        { src: 'new-lung-scroll', at: t.lung, scrollFrom: 0, scrollTo: 0 },
        { src: 'new-lung-scroll', at: t.find - 10, scrollFrom: 0, scrollTo: 1330, scrollAt: t.find - 10, scrollDur: 20 },
        { src: 'new-lung-scroll', at: t.sup - 10, scrollFrom: 1330, scrollTo: 2700, scrollAt: t.sup - 10, scrollDur: 22 },
        { src: 'new-image', at: t.img },
        { src: 'new-lung-scroll', at: t.path - 10, scrollFrom: 3480, scrollTo: 3480 },
        { src: 'saved', at: t.saved },
      ]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 230, width: 760 }}>
      <Eyebrow2 at={4}>In your logbook</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={78} id="log">Log your scan.</Head></div>
      <div style={{ marginTop: 50, opacity: out * prog(f, 18, 30) }}>
        {steps.map(([label, at], i) => {
          const p = prog(f, at - 4, at + 8), on = i === active;
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '0 0 18px', opacity: 0.35 + 0.65 * p }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, border: `2px solid ${on ? C.tealL : 'rgba(247,245,240,0.3)'}`, background: on ? 'rgba(127,196,204,0.16)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, color: on ? C.tealL : C.slate }}>{i + 1}</div>
            <div data-box="text" data-id={`step${i}`} style={{ fontSize: 36, color: on ? C.cream : C.slate }}>{label}</div>
          </div>;
        })}
      </div>
    </div>
  </SceneFade>;
}

// 6. Verified supervisors: the real card, then what verification means (the app's own explanation).
function Verified({ s }) {
  const v = s.voiceFrom - s.from;
  const d = PH;
  const card = onScreen(d, 195, 300), why = onScreen(d, 195, 330);
  const swap = v + sec(4.6);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[{ at: 0, s: 1, fx: card.x, fy: card.y, tx: card.x, ty: card.y }, { at: v + sec(0.4), dur: 26, s: 1.7, fx: card.x, fy: card.y, tx: 1380, ty: 560 }, { at: swap, dur: 1, s: 1.7, fx: why.x, fy: why.y, tx: 1380, ty: 560 }, { at: s.dur - 40, dur: 22, s: 1, fx: card.x, fy: card.y, tx: card.x, ty: card.y }]}>
      <Device x={d.x} y={d.y} k={d.k} states={[{ src: 'v3-supervisors', at: 0 }, { src: 'v3-verified-explain', at: swap }]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 380, width: 820 }}>
      <Eyebrow2 at={4}>Verified supervisors</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={74} id="areas">Verified for specific areas.</Head></div>
    </div>
  </SceneFade>;
}

// 7. On your shift: request a review. The shift line starts on Tuesday night.
function Request({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const d = { x: 1160, y: 230, k: 0.92 };
  const send = mark('v3-request-pick', 'send'), create = mark('v3-request-ready', 'create');
  const t = { to: v + sec(0.9), sent: v + sec(2.3) };
  const msg = onScreen(d, 195, 470);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 160, top: 50 }}><ShiftLanes p={0} w={1600} showRight={0.25} leftAt={2} /></div>
    <Focus keys={[{ at: 0, s: 1, fx: msg.x, fy: msg.y, tx: msg.x, ty: msg.y }, { at: t.sent + 8, dur: 24, s: 1.25, fx: msg.x, fy: msg.y, tx: 1380, ty: 790 }]}>
      <Device x={d.x} y={d.y} k={d.k} states={[{ src: 'v3-request-pick', at: 0, tap: { at: t.to - 10, ...send } }, { src: 'v3-request-ready', at: t.to, tap: { at: t.sent - 10, ...create } }, { src: 'v3-request-sent', at: t.sent }]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 430, width: 820 }}>
      <Eyebrow2 at={4}>Request review</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={74} id="req">On your shift.</Head></div>
    </div>
  </SceneFade>;
}

// 8. On their shift: the request travels to Thursday afternoon; the supervisor reviews, rates, comments and signs.
function Review({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const d = { x: 1160, y: 230, k: 0.92 };
  const rev = mark('v3-learner', 'review');
  const travel = prog(f, 0, sec(1.6), easeIO);
  const t = { learner: sec(1.9), sheet: sec(3.0), done: s.dur - sec(1.6) };
  const z = onScreen(d, 195, 470);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 160, top: 50 }}><ShiftLanes p={travel} w={1600} showRight={prog(f, sec(0.8), sec(1.6))} /></div>
    <Focus keys={[{ at: 0, s: 1, fx: z.x, fy: z.y, tx: z.x, ty: z.y }, { at: t.sheet + 12, dur: 24, s: 1.25, fx: z.x, fy: z.y, tx: 1380, ty: 790 }, { at: t.done - 26, dur: 22, s: 1, fx: z.x, fy: z.y, tx: z.x, ty: z.y }]}>
      <Device x={d.x} y={d.y} k={d.k} states={[{ src: 'v3-dashboard', at: 0 }, { src: 'v3-learner', at: t.learner, tap: { at: t.sheet - 10, ...rev } }, { src: 'v3-review-sheet', at: t.sheet, scrollFrom: 0, scrollTo: 1450, scrollAt: t.sheet + 16, scrollDur: t.done - t.sheet - 50 }, { src: 'v3-signed-done', at: t.done }]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 430, width: 820 }}>
      <Eyebrow2 at={4}>Review when available</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={74} id="rev">On their shift.</Head></div>
    </div>
  </SceneFade>;
}

// 9. The outcome in the trainee's record, with the code; and the rule that direct supervision still applies.
function Outcome({ s, captions }) {
  const v = s.voiceFrom - s.from;
  const d = PH;
  const card = onScreen(d, 195, 200);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[{ at: 0, s: 1, fx: card.x, fy: card.y, tx: card.x, ty: card.y }, { at: sec(1.6), dur: 24, s: 1.8, fx: card.x, fy: card.y, tx: 1380, ty: 500 }, { at: s.dur - 40, dur: 22, s: 1, fx: card.x, fy: card.y, tx: card.x, ty: card.y }]}>
      <Device x={d.x} y={d.y} k={d.k} states={[{ src: 'v3-log-signed', at: 0 }, { src: 'v3-entry-signed', at: sec(1.2) }]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 330, width: 800 }}>
      <Eyebrow2 at={4}>The outcome</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={74} id="signed">Signed off.</Head></div>
      <div style={{ marginTop: 40, width: 640 }}><Line at={v + sec(4.6)} id="rules" style={{ fontSize: 26, lineHeight: 1.45, color: C.slate }}>Direct supervision and formal assessments follow your pathway's rules.</Line></div>
    </div>
  </SceneFade>;
}

// 10. Progress and the portfolio export, with the verified summary.
function Progress({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const fam = mark('progress-rcem', 'famus');
  const t2 = v + sec(3.2);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 150, top: 380, width: 640 }}>
      <Eyebrow2 at={4}>Your training progress</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={74} id="track">Track your progress.</Head></div>
    </div>
    <Device id="progress" x={860} y={90} k={0.98} states={[{ src: 'progress-rcem', at: 0, tap: { at: sec(1.6), ...fam } }, { src: 'progress-famus', at: sec(2.0) }, { src: 'export-scroll', at: t2, scrollFrom: 0, scrollTo: 330, scrollAt: t2 + 16, scrollDur: 46 }]} />
    <Device id="verify" x={1380} y={90 + (1 - prog(f, t2 + 36, t2 + 60)) * 140} k={0.98} opacity={prog(f, t2 + 36, t2 + 60)} states={[{ src: 'verify-evidence', at: 0 }]} />
  </SceneFade>;
}

// 11. Free.
function Free({ s }) {
  const f = useCurrentFrame();
  const p = prog(f, 26, 44) * outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop drift={2} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + 0.05 * prog(f, 0, s.dur, easeIO)})` }}>
      <Line at={2} id="free" style={{ fontWeight: 600, fontSize: 64, letterSpacing: '0.12em', color: C.cream }}>YOUR ULTRASOUND LOGBOOK.</Line>
      <div data-box="text" data-id="free" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 280, lineHeight: 1, color: C.tealL, opacity: p, transform: `scale(${0.94 + 0.06 * p})`, marginTop: 8 }}>FREE.</div>
    </div>
  </SceneFade>;
}

// 12. Courses and tailored training.
function Education({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[{ at: 0, s: 1.12, fx: 1180, fy: 640, tx: 1180, ty: 640 }, { at: 0, dur: s.dur, s: 1.0, fx: 1180, fy: 640, tx: 1180, ty: 640 }]}><TeachingRoom f={f} floor={1000} /></Focus>
    <div style={{ position: 'absolute', left: 120, top: 170, width: 600 }}>
      <Eyebrow2 at={6}>Wavelength education</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={10} size={70} id="built">Training built around you.</Head></div>
      <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Line at={v + sec(2.2)} id="hands" style={{ fontWeight: 600, fontSize: 30, letterSpacing: '0.12em', color: C.cream }}>HANDS-ON COURSES</Line>
        <Line at={v + sec(3.0)} id="tailored" style={{ fontWeight: 600, fontSize: 30, letterSpacing: '0.12em', color: C.cream }}>TAILORED TRAINING</Line>
      </div>
    </div>
  </SceneFade>;
}

const SCENES = { scan: Scan, rota: Rota, wait: Wait, brand: Brand, log: Log, verified: Verified, request: Request, review: Review, outcome: Outcome, progress: Progress, free: Free, education: Education, end: (p) => <End3 {...p} film="flagship" ctas={['START YOUR FREE LOGBOOK', 'EXPLORE OUR COURSES']} /> };
// Captions sit where nothing important is: beside the phone, under the rota, never over controls or the end frame.
const ZONES = { scan: { x: 120, y: 900, w: 1000, align: 'left' }, rota: { x: 260, y: 900, w: 1400 }, wait: { x: 230, y: 860, w: 760, align: 'left' }, brand: { x: 120, y: 860, w: 900, align: 'left' }, log: { x: 120, y: 900, w: 900, align: 'left' }, verified: { x: 120, y: 860, w: 900, align: 'left' }, request: { x: 120, y: 860, w: 900, align: 'left' }, review: { x: 120, y: 860, w: 900, align: 'left' }, outcome: { x: 120, y: 900, w: 900, align: 'left' }, progress: { x: 120, y: 860, w: 680, align: 'left' }, free: { x: 260, y: 900, w: 1400 }, education: { x: 120, y: 800, w: 560, align: 'left' }, end: { x: 260, y: 700, w: 1400 } };

export function Flagship3({ captions = false, only = null }) {
  const full = flagship3TL();
  let tl = full;
  if (only) { let at = 0; const scenes = full.scenes.filter((x) => only.includes(x.scene)).map((x, i, arr) => { const shift = at - x.from; at += x.dur - (i < arr.length - 1 ? Math.round((x.overlap || 0) * FPS) : 0); return { ...x, from: x.from + shift, voiceFrom: x.voiceFrom + shift }; }); tl = { scenes, total: scenes.reduce((m, x) => Math.max(m, x.from + x.dur), 0) }; }
  const cues = tl.scenes.filter((x) => x.scene !== 'end').flatMap((x) => cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(3)));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return ZONES[sc.scene]; };
  return <div style={{ position: 'absolute', inset: 0, background: C.ink, fontFamily: SANS, color: C.cream }}>
    {tl.scenes.map((x) => { const S = SCENES[x.scene]; return <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}><S s={x} captions={captions} /></Sequence>; })}
    {captions ? <Captions cues={cues} zone={zone} size={36} /> : null}
    <Audio src={staticFile('audio-v3/music/flagship.wav')} startFrom={only ? (full.byScene[only[0]] || {}).from || 0 : 0} volume={(f) => duck(f, tl, { base: 0.5, low: 0.16 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
    <Probe />
  </div>;
}
