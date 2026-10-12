// Version 2 flagship film (about 1 minute 50). Story: a scan at 03:12, nobody free to review it; Wavelength; log it;
// pick pathways; see who is verified; send, review and sign at different times; prove progress; free logbook; courses
// and tailored training; end frame. Narration tells the story, the screen carries one short idea per scene, and the
// app is shown close up through camera moves. props.captions adds burned-in captions placed away from the action.
import React from 'react';
import { Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { Backdrop, Wordmark, Pill, QRCode, Social, WaveLine, mark } from '../kit.jsx';
import { C, SERIF, SANS, Line, Eyebrow2, Head, Focus, Device, onScreen, Captions, cuesFor, Probe, prog, clamp, Mark, SceneFade, outOf, easeIO } from './kit2.jsx';
import { Cart, Person, Couch, ScanImage, TeachingRoom } from './art.jsx';
import { timeline2, duck, FPS } from './timeline2.js';

export const FLAGSHIP2_PLAN = [
  { scene: 'problem', min: 11.5, lead: 0.4, tail: 0.9, overlap: 0.5 },
  { scene: 'brand', min: 5.2, lead: 0.5, overlap: 0.5 },
  { scene: 'log', min: 10.8, lead: 0.4, tail: 0.9, overlap: 0.5 },
  { scene: 'pathways', min: 9.0, lead: 0.4, overlap: 0.5 },
  { scene: 'supervisors', min: 7.6, lead: 0.4, overlap: 0.5 },
  { scene: 'review', min: 18.0, lead: 0.4, tail: 0.8, overlap: 0.5 },
  { scene: 'progress', min: 10.0, lead: 0.4, overlap: 0.5 },
  { scene: 'free', min: 6.0, lead: 0.6, overlap: 0.5 },
  { scene: 'education', min: 12.5, lead: 0.4, overlap: 0.5 },
  { scene: 'end', min: 6.5, lead: 0.5 },
];
export const flagship2TL = () => timeline2('flagship', FLAGSHIP2_PLAN);
const sec = (x) => Math.round(x * FPS);

// ---------- 1. The problem: 03:12, a scan that matters, and nobody free to review it ----------
const BACKLOG = [['Lung and pleura', 'Just now'], ['eFAST or FAFF', '01:48'], ['Abdominal aorta (AAA)', 'Yesterday'], ['Echo in life support', '2 days ago'], ['DVT (compression)', 'Last week'], ['Focused cardiac ultrasound', '2 weeks ago']];
function Problem({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const cart = { x: 150, y: 120, s: 0.98 };
  const screen = { x: cart.x + 54 * cart.s + 156 * cart.s, y: cart.y + 34 * cart.s + 111 * cart.s };
  const pull = sec(3.6);
  const step = sec(1.05);
  const shown = BACKLOG.filter((_, i) => f >= sec(2.4) + i * step).length;
  const out = outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap} inF={1}><Backdrop tone="dim" />
    <Focus keys={[{ at: 0, s: 2.3, fx: screen.x, fy: screen.y, tx: 600, ty: 540 }, { at: pull, dur: 42, s: 1, fx: 960, fy: 540, tx: 960, ty: 540 }]}>
      <WaveLine y={300} progress={1} speed={2} opacity={0.12} amp={14} period={160} />
      <Cart x={cart.x} y={cart.y} s={cart.s} id="night" />
      <Person x={720} floor={1000} s={0.95} pose="phone" tone="#24476A" f={f} id="trainee" />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 70 }}><Line at={2} id="clock" style={{ fontFamily: SANS, fontSize: 24, letterSpacing: '0.2em', color: C.slate }}>EMERGENCY DEPARTMENT · 03:12</Line></div>
    <div style={{ position: 'absolute', left: 1190, top: 150, width: 580, opacity: prog(f, sec(2.2), sec(2.7)) * out }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 }}>
        <div data-box="text" data-id="awaiting" style={{ fontSize: 24, letterSpacing: '0.16em', color: C.slate }}>AWAITING SIGN-OFF</div>
        <div data-box="text" data-id="count" style={{ fontFamily: SERIF, fontSize: 76, lineHeight: 1, color: C.cream }}>{shown}</div>
      </div>
      {BACKLOG.map(([t, when], i) => {
        const at = sec(2.4) + i * step;
        if (f < at) return null;
        const p = prog(f, at, at + 12);
        const above = BACKLOG.reduce((y, _, j) => y + (j > i ? prog(f, sec(2.4) + j * step, sec(2.4) + j * step + 12) : 0), 0);
        return <div key={i} data-box="card" data-id={`card${i}`} style={{ position: 'absolute', left: 0, right: 0, top: 100 + above * 96, opacity: p * Math.max(0, 1 - Math.max(0, above - 4.2)), transform: `translateY(${(1 - p) * -18}px)`, height: 82, borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', boxSizing: 'border-box' }}>
          <div><div style={{ fontSize: 26, color: C.cream }}>{t}</div><div style={{ fontSize: 19, color: C.slate, marginTop: 3 }}>{when}</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 19, color: '#E9B872' }}><span style={{ width: 9, height: 9, borderRadius: 5, background: '#E9B872' }} />Awaiting review</div>
        </div>;
      })}
    </div>
    <div style={{ position: 'absolute', left: 1190, top: 860, width: 600 }}><Head at={v + sec(7.2)} size={64} id="unsigned">Scanned. Still unsigned.</Head></div>
  </SceneFade>;
}

// ---------- 2. Wavelength ----------
function Brand({ s }) {
  const f = useCurrentFrame();
  const up = prog(f, 6, 40);
  const out = outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 150, top: 300 }}>
      <div data-box="logo" style={{ width: 120, height: 120, opacity: out }}><Mark size={120} draw={prog(f, 0, 26)} ring={prog(f, 0, 22)} /></div>
      <div style={{ marginTop: 40 }}><Line at={14} id="wordmark" style={{ fontFamily: SANS, fontWeight: 600, fontSize: 78, letterSpacing: '0.38em', color: C.cream }}>WAVELENGTH</Line></div>
      <div style={{ marginTop: 26 }}><Line at={24} id="designed" style={{ fontFamily: SERIF, fontSize: 52, color: C.slate }}>Designed for real clinical practice</Line></div>
    </div>
    <Device x={1120} y={interpolate(up, [0, 1], [1100, 60])} k={1.12} states={[{ src: 'home', at: 0 }]} />
  </SceneFade>;
}

// ---------- 3. Log a scan: four steps, each shown close up ----------
function Log({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const d = { x: 1120, y: 60, k: 1.12 };
  const P = (px, py) => onScreen(d, px, py);
  const home = mark('home', 'log'), lung = mark('new-grid', 'lung');
  const t = { grid: sec(0.9), lung: sec(1.6), find: v + sec(1.2), sup: v + sec(3.0), img: v + sec(5.4), saved: v + sec(8.4) };
  const steps = [['Application', t.grid], ['Findings', t.find], ['Supervision', t.sup], ['Image', t.img]];
  const active = steps.reduce((a, [, at], i) => (f >= at ? i : a), -1);
  const out = outOf(f, s);
  const C0 = P(195, 422);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[
      { at: 0, s: 1, fx: C0.x, fy: C0.y, tx: C0.x, ty: C0.y },
      { at: t.lung - 6, dur: 18, s: 1.35, fx: P(195, 330).x, fy: P(195, 330).y, tx: 1400, ty: 520 },
      { at: t.find - 8, dur: 20, s: 1.45, fx: P(195, 420).x, fy: P(195, 420).y, tx: 1400, ty: 540 },
      { at: t.img - 10, dur: 20, s: 1.15, fx: C0.x, fy: C0.y, tx: 1400, ty: 540 },
      { at: t.saved - 6, dur: 20, s: 1, fx: C0.x, fy: C0.y, tx: C0.x, ty: C0.y },
    ]}>
      <Device x={d.x} y={d.y} k={d.k} states={[
        { src: 'home', at: 0, tap: { at: sec(0.5), ...home } },
        { src: 'new-grid', at: t.grid, tap: { at: t.lung - 8, ...lung } },
        { src: 'new-lung-scroll', at: t.lung, scrollFrom: 0, scrollTo: 0 },
        { src: 'new-lung-scroll', at: t.find - 10, scrollFrom: 0, scrollTo: 1330, scrollAt: t.find - 10, scrollDur: 22 },
        { src: 'new-lung-scroll', at: t.sup - 10, scrollFrom: 1330, scrollTo: 2700, scrollAt: t.sup - 10, scrollDur: 24 },
        { src: 'new-image', at: t.img },
        { src: 'saved', at: t.saved },
      ]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 250, width: 760 }}>
      <Eyebrow2 at={4}>Log a scan</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={8} size={80} id="moments">Log it in moments.</Head></div>
      <div style={{ marginTop: 56, opacity: out * prog(f, 18, 30) }}>
        {steps.map(([label, at], i) => {
          const p = prog(f, at - 4, at + 8), on = i === active;
          return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, margin: '0 0 22px', opacity: 0.35 + 0.65 * p }}>
            <div style={{ width: 46, height: 46, borderRadius: 23, border: `2px solid ${on ? C.tealL : 'rgba(247,245,240,0.3)'}`, background: on ? 'rgba(127,196,204,0.16)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: on ? C.tealL : C.slate }}>{i + 1}</div>
            <div data-box="text" data-id={`step${i}`} style={{ fontSize: 38, color: on ? C.cream : C.slate }}>{label}</div>
          </div>;
        })}
      </div>
    </div>
  </SceneFade>;
}

// ---------- 4. Pathways ----------
function Pathways({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const d = { x: 1120, y: 60, k: 1.12 };
  const fam = mark('progress-rcem', 'famus');
  const chips = ['RCEM', 'FAMUS', 'FUSIC'];
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Device x={d.x} y={d.y} k={d.k} states={[{ src: 'progress-rcem', at: 0, tap: { at: v + sec(3.2), ...fam } }, { src: 'progress-famus', at: v + sec(3.6) }]} />
    <div style={{ position: 'absolute', left: 150, top: 280, width: 800 }}>
      <Eyebrow2 at={4}>Your pathways</Eyebrow2>
      <div style={{ display: 'flex', gap: 18, marginTop: 34 }}>{chips.map((c, i) => <Line key={c} at={v + sec(1.2) + i * 8} id={`chip${c}`} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 44, letterSpacing: '0.06em', color: C.cream, border: '2px solid rgba(127,196,204,0.6)', borderRadius: 40, padding: '10px 30px' }}>{c}</Line>)}</div>
      <div style={{ marginTop: 26 }}><Line at={v + sec(2.4)} id="intl" style={{ fontSize: 34, color: C.slate }}>+ international frameworks</Line></div>
      <div style={{ marginTop: 70, width: 700 }}><Line at={v + sec(4)} id="pathnote" style={{ fontSize: 22, lineHeight: 1.45, color: C.slate }}>UK pathways follow each body's published requirements. Your supervisor and accrediting body decide what they accept.</Line></div>
    </div>
  </SceneFade>;
}

// ---------- 5. Verified supervisors (close up on the real card) ----------
function Supervisors({ s }) {
  const v = s.voiceFrom - s.from;
  const d = { x: 1120, y: 60, k: 1.12 };
  const card = onScreen(d, 195, 300);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[{ at: 0, s: 1, fx: card.x, fy: card.y, tx: card.x, ty: card.y }, { at: v + sec(0.6), dur: 30, s: 1.75, fx: card.x, fy: card.y, tx: 1380, ty: 560 }, { at: s.dur - 42, dur: 24, s: 1, fx: card.x, fy: card.y, tx: card.x, ty: card.y }]}>
      <Device x={d.x} y={d.y} k={d.k} states={[{ src: 'supervisors', at: 0 }]} />
    </Focus>
    <div style={{ position: 'absolute', left: 150, top: 360, width: 800 }}>
      <Eyebrow2 at={4}>Verified supervisors</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={10} size={76} id="named">Verified for named modules.</Head></div>
    </div>
  </SceneFade>;
}

// ---------- 6. Send, review and sign, at different times ----------
function Review({ s, captions }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const send = mark('signoff-pick', 'send'), rev = mark('supervise-learner', 'review');
  const sup = v + sec(2.4);
  const inS = prog(f, sup - 8, sup + 18);
  // Captioned version: smaller phones and a gentler push-in, so the caption band at the foot stays clear.
  const K = captions ? 0.76 : 0.84;
  const A = { x: interpolate(inS, [0, 1], [760, 360]), y: captions ? 170 : 190, k: K };
  const B = { x: captions ? 1230 : 1210, y: (captions ? 170 : 190) + (1 - inS) * 120, k: K };
  const sheet = sup + sec(3.4);
  const zoom = onScreen(B, 195, 470);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 54, display: 'flex', justifyContent: 'center' }}><Head at={6} out={sheet + sec(0.9)} size={66} id="free-time">Reviewed when they're free.</Head></div>
    <Focus keys={[{ at: 0, s: 1, fx: 960, fy: 540, tx: 960, ty: 540 }, { at: sheet + sec(1.2), dur: 30, s: captions ? 1.12 : 1.32, fx: zoom.x, fy: zoom.y, tx: 1240, ty: captions ? 500 : 600 }, { at: sheet + sec(7.2), dur: 24, s: 1, fx: 960, fy: 540, tx: 960, ty: 540 }]}>
      <Device id="trainee" x={A.x} y={A.y} k={A.k} opacity={1 - 0.45 * prog(f, sheet + sec(1), sheet + sec(1.8))} states={[{ src: 'signoff-pick', at: 0, tap: { at: sec(1.4), ...send } }, { src: 'signoff-send', at: sec(1.8) }]} />
      <Device id="supervisor" x={B.x} y={B.y} k={B.k} opacity={inS} states={[{ src: 'supervise-learner', at: 0, tap: { at: sheet - 12, ...rev } }, { src: 'supervise-sheet-scroll', at: sheet, scrollFrom: 0, scrollTo: 1450, scrollAt: sheet + sec(1.6), scrollDur: sec(5.2) }]} />
    </Focus>
    <div style={{ position: 'absolute', left: 120, top: 560, width: 190, opacity: prog(f, 12, 26) * (1 - prog(f, sheet + sec(1), sheet + sec(1.4))) }}><div data-box="text" data-id="trainee-label" style={{ fontSize: 26, lineHeight: 1.35, color: C.slate }}>Trainee<br /><span style={{ color: C.cream }}>sends</span></div></div>
    <div style={{ position: 'absolute', right: 110, top: 560, width: 190, textAlign: 'right', opacity: inS * (1 - prog(f, sheet + sec(1), sheet + sec(1.4))) }}><div data-box="text" data-id="sup-label" style={{ fontSize: 26, lineHeight: 1.35, color: C.slate }}>Supervisor<br /><span style={{ color: C.cream }}>reviews and signs</span></div></div>
    {captions ? null : <div style={{ position: 'absolute', left: 0, right: 0, top: 1024, display: 'flex', justifyContent: 'center' }}><Line at={sheet + sec(7.2) + 26} id="bedside" style={{ fontSize: 22, color: C.slate }}>Bedside supervision and observed assessments still happen in person, where your pathway requires them.</Line></div>}
  </SceneFade>;
}

// ---------- 7. Progress you can prove ----------
function Progress({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const t2 = v + sec(3.0);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <div style={{ position: 'absolute', left: 150, top: 360, width: 620 }}>
      <Eyebrow2 at={4}>Progress you can prove</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={10} size={76} id="every">Every sign-off counts.</Head></div>
    </div>
    <Device id="export" x={880} y={90} k={0.98} states={[{ src: 'log-signed', at: 0 }, { src: 'progress-rcem', at: sec(1.6) }, { src: 'export-scroll', at: t2, scrollFrom: 0, scrollTo: 330, scrollAt: t2 + 18, scrollDur: 50 }]} />
    <Device id="verify" x={1380} y={90 + (1 - prog(f, t2 + 40, t2 + 66)) * 140} k={0.98} opacity={prog(f, t2 + 40, t2 + 66)} states={[{ src: 'verify-evidence', at: 0 }]} />
  </SceneFade>;
}

// ---------- 8. Free ----------
function Free({ s }) {
  const f = useCurrentFrame();
  const p = prog(f, 26, 44) * outOf(f, s);
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop drift={2} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + 0.05 * prog(f, 0, s.dur, easeIO)})` }}>
      <Line at={2} id="free" style={{ fontFamily: SANS, fontWeight: 600, fontSize: 64, letterSpacing: '0.12em', color: C.cream }}>YOUR ULTRASOUND LOGBOOK.</Line>
      <div data-box="text" data-id="free" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 280, lineHeight: 1, color: C.tealL, opacity: p, transform: `scale(${0.94 + 0.06 * p})`, marginTop: 8 }}>FREE.</div>
    </div>
  </SceneFade>;
}

// ---------- 9. Courses and tailored training (illustration of hands-on teaching) ----------
function Education({ s }) {
  const f = useCurrentFrame();
  const v = s.voiceFrom - s.from;
  const floor = 1000;
  return <SceneFade dur={s.dur} next={s.overlap}><Backdrop />
    <Focus keys={[{ at: 0, s: 1.12, fx: 1180, fy: 640, tx: 1180, ty: 640 }, { at: 0, dur: s.dur, s: 1.0, fx: 1180, fy: 640, tx: 1180, ty: 640 }]}>
      <TeachingRoom f={f} floor={floor} />
    </Focus>
    <div style={{ position: 'absolute', left: 120, top: 150, width: 600 }}>
      <Eyebrow2 at={6}>Courses and training</Eyebrow2>
      <div style={{ marginTop: 18 }}><Head at={10} size={70} id="built">Training built around you.</Head></div>
      <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Line at={v + sec(2.6)} id="hands" style={{ fontWeight: 600, fontSize: 30, letterSpacing: '0.12em', color: C.cream }}>HANDS-ON COURSES</Line>
        <Line at={v + sec(3.6)} id="tailored" style={{ fontWeight: 600, fontSize: 30, letterSpacing: '0.12em', color: C.cream }}>TAILORED TRAINING</Line>
      </div>
      <div style={{ marginTop: 36, width: 520 }}><Line at={v + sec(5.2)} id="ratio" style={{ fontSize: 24, lineHeight: 1.45, color: C.slate }}>One instructor to every four or five delegates.</Line></div>
    </div>
  </SceneFade>;
}

// ---------- 10. End frame ----------
export function End2({ s, film = 'flagship', ctas = ['START YOUR FREE LOGBOOK', 'EXPLORE OUR COURSES'], vertical = false }) {
  const f = useCurrentFrame();
  const a = (x) => prog(f, x, x + 14);
  const lift = (x) => `translateY(${(1 - a(x)) * 18}px)`;
  const V = vertical;
  return <SceneFade dur={s.dur} next={s.overlap} outF={1}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 470 : 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: V ? 34 : 26 }}>
      <div data-box="logo" style={{ opacity: a(0), transform: lift(0) }}><Mark size={V ? 150 : 124} draw={prog(f, 0, 24)} ring={prog(f, 0, 20)} /></div>
      <div data-box="logo" style={{ opacity: a(6), transform: lift(6) }}><Wordmark size={V ? 62 : 66} /></div>
      <div data-box="text" data-id="url" style={{ opacity: a(14), transform: lift(14), fontFamily: SERIF, fontSize: V ? 74 : 72, color: C.cream, marginTop: 6 }}>thewavelength.co.uk</div>
      <div data-box="cta" style={{ opacity: a(22), transform: lift(22), display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: 'center', gap: 20 }}>{ctas.map((c, i) => <Pill key={c} solid={i === 0} size={V ? 28 : 24}>{c}</Pill>)}</div>
    </div>
    <div style={{ position: 'absolute', left: V ? 0 : 120, right: V ? 0 : 120, bottom: V ? 300 : 70, display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: V ? 'center' : 'flex-end', justifyContent: 'space-between', gap: V ? 34 : 0, opacity: a(32) }}>
      <div data-box="social"><Social size={V ? 30 : 32} /></div>
      <div data-box="qr" style={{ display: 'flex', alignItems: 'center', gap: 18 }}><div style={{ textAlign: 'right', fontSize: V ? 24 : 20, color: C.slate, lineHeight: 1.45 }}>Scan to visit<br />thewavelength.co.uk</div><QRCode film={film} size={V ? 170 : 140} /></div>
    </div>
  </SceneFade>;
}

const SCENES = { problem: Problem, brand: Brand, log: Log, pathways: Pathways, supervisors: Supervisors, review: Review, progress: Progress, free: Free, education: Education, end: (p) => <End2 {...p} /> };
// Where captions go in each scene: beside the phone, never over it or over a call to action.
const ZONES = { problem: { x: 120, y: 900, w: 960, align: 'left' }, brand: { x: 120, y: 860, w: 960, align: 'left' }, log: { x: 120, y: 860, w: 900, align: 'left' }, pathways: { x: 120, y: 880, w: 900, align: 'left' }, supervisors: { x: 120, y: 860, w: 900, align: 'left' }, review: { x: 260, y: 900, w: 1400, align: 'center' }, progress: { x: 120, y: 860, w: 700, align: 'left' }, free: { x: 260, y: 900, w: 1400, align: 'center' }, education: { x: 120, y: 820, w: 520, align: 'left' }, end: { x: 260, y: 700, w: 1400, align: 'center' } };

// only: optional scene list (the review sample), re-timed to start at 0.
export function Flagship2({ captions = false, only = null }) {
  const full = flagship2TL();
  let tl = full;
  if (only) { let at = 0; const scenes = full.scenes.filter((x) => only.includes(x.scene)).map((x, i, arr) => { const shift = at - x.from; at += x.dur - (i < arr.length - 1 ? Math.round((x.overlap || 0) * FPS) : 0); return { ...x, from: x.from + shift, voiceFrom: x.voiceFrom + shift }; }); tl = { scenes, total: scenes.reduce((m, x) => Math.max(m, x.from + x.dur), 0) }; }
  const cues = tl.scenes.filter((x) => x.scene !== 'end').flatMap((x) => cuesFor(x.text, Math.max(x.voiceFrom, x.from + 16), x.voiceDur - Math.max(0, x.from + 16 - x.voiceFrom) || sec(3)).map((c) => ({ ...c, scene: x.scene })));
  const zone = (f) => { const sc = [...tl.scenes].reverse().find((x) => f >= x.from) || tl.scenes[0]; return ZONES[sc.scene]; };
  return <div style={{ position: 'absolute', inset: 0, background: C.ink, fontFamily: SANS, color: C.cream }}>
    {tl.scenes.map((x) => { const S = SCENES[x.scene]; return <Sequence key={x.scene} from={x.from} durationInFrames={x.dur}><S s={x} captions={captions} /></Sequence>; })}
    {captions ? <Captions cues={cues} zone={zone} size={36} /> : null}
    <Audio src={staticFile('audio-v2/music/flagship.wav')} startFrom={only ? (full.byScene[only[0]] || {}).from || 0 : 0} volume={(f) => duck(f, tl, { base: 0.5, low: 0.16 })} />
    {tl.scenes.filter((x) => x.audio).map((x) => <Sequence key={'v' + x.scene} from={x.voiceFrom} durationInFrames={x.voiceDur + 6}><Audio src={staticFile(x.audio)} /></Sequence>)}
    <Probe />
  </div>;
}
