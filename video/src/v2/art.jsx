// Original illustrations for version 2, drawn in the brand style (line art on navy, teal light). They are plainly
// illustrations, never presented as photographs of a Wavelength course or of a patient. Scan images are synthetic
// (filtered noise shaped like a lung window), not patient scans.
import React, { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';
import { C } from '../kit.jsx';

// Palettes: line art on navy (versions 2 and 3, the default) or on light backgrounds (version 4, src/v4/look.jsx).
export const ART_DARK = { LINE: 'rgba(247,245,240,0.55)', SOFT: 'rgba(247,245,240,0.22)', FILL: '#13233A', FILL2: '#0E1B2D', glow: 0.35, toneEnd: '#0E1C2E', rim: 'rgba(127,196,204,0.28)', rimArm: 'rgba(127,196,204,0.22)', shadow: 'rgba(0,0,0,0.35)', floor: 'rgba(127,196,204,0.16)', model: ['#3D6F8E', '#1E3A55'], pillow: '#1A2D45', phone: '#0B1522' };
export const ArtCtx = createContext(ART_DARK);

// The scan image: a sector (fan) with speckle that shimmers, a bright pleural line, sliding below it, and A-lines.
export function ScanImage({ w = 420, h = 320, id = 'scan', live = true }) {
  const f = useCurrentFrame();
  const seed = live ? Math.floor(f / 2) % 40 : 3;
  const cx = w / 2, top = h * 0.06, r = h * 0.9;
  const a = (35 * Math.PI) / 180;
  const fan = `M ${cx} ${top} L ${cx - Math.sin(a) * r} ${top + Math.cos(a) * r} A ${r} ${r} 0 0 0 ${cx + Math.sin(a) * r} ${top + Math.cos(a) * r} Z`;
  const arc = (d, op, sw) => <path d={`M ${cx - Math.sin(a) * d} ${top + Math.cos(a) * d} A ${d} ${d} 0 0 0 ${cx + Math.sin(a) * d} ${top + Math.cos(a) * d}`} stroke={`rgba(235,240,245,${op})`} strokeWidth={sw} fill="none" />;
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
    <defs>
      <filter id={`${id}-sp`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1 0.42" numOctaves="2" seed={seed} /><feColorMatrix type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.93  0 0 0 0 0.96  0 0 0 1.9 -0.9" /></filter>
      <radialGradient id={`${id}-fade`} cx={cx} cy={top} r={r} gradientUnits="userSpaceOnUse"><stop offset="0.2" stopColor="#fff" stopOpacity="0.85" /><stop offset="1" stopColor="#fff" stopOpacity="0.15" /></radialGradient>
      <clipPath id={`${id}-clip`}><path d={fan} /></clipPath>
      <mask id={`${id}-mask`}><rect width={w} height={h} fill={`url(#${id}-fade)`} /></mask>
    </defs>
    <rect width={w} height={h} fill="#05090F" />
    <g clipPath={`url(#${id}-clip)`}>
      <rect width={w} height={h} fill="#0B0F14" />
      <rect width={w} height={h} filter={`url(#${id}-sp)`} mask={`url(#${id}-mask)`} opacity="0.75" />
      {arc(r * 0.30, 0.9, 3)}{arc(r * 0.30 + 1.5, 0.35, 6)}
      {arc(r * 0.58, 0.22, 2.5)}{arc(r * 0.86, 0.12, 2.5)}
    </g>
    <path d={fan} fill="none" stroke="rgba(255,255,255,0.08)" />
    {[0.2, 0.4, 0.6, 0.8].map((t) => <circle key={t} cx={w - 16} cy={top + r * t * 0.95} r="2" fill="rgba(255,255,255,0.45)" />)}
  </svg>;
}

// A point-of-care ultrasound machine on a cart: monitor on an arm, console with trackball, probe holder, column, base.
export function Cart({ x, y, s = 1, glow = 1, id = 'cart' }) {
  const { LINE, SOFT, FILL, FILL2, glow: gl } = useContext(ArtCtx);
  return <div style={{ position: 'absolute', left: x, top: y, width: 420 * s, height: 860 * s }}>
    <svg width={420 * s} height={860 * s} viewBox="0 0 420 860" style={{ position: 'absolute', inset: 0 }}>
      <defs><radialGradient id={`${id}-g`} cx="0.5" cy="0.5" r="0.6"><stop offset="0" stopColor={C.tealL} stopOpacity={gl * glow} /><stop offset="1" stopColor={C.tealL} stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="210" cy="150" rx="260" ry="190" fill={`url(#${id}-g)`} />
      <rect x="40" y="20" width="340" height="250" rx="14" fill={FILL2} stroke={LINE} strokeWidth="2" />
      <rect x="196" y="270" width="28" height="70" fill={FILL} stroke={SOFT} strokeWidth="2" />
      <path d="M 70 340 L 350 340 L 380 410 L 40 410 Z" fill={FILL} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={90 + i * 38} y="356" width="28" height="12" rx="3" fill="none" stroke={SOFT} strokeWidth="1.5" />)}
      <circle cx="300" cy="388" r="11" fill="none" stroke={LINE} strokeWidth="2" />
      <rect x="60" y="410" width="300" height="34" rx="6" fill={FILL2} stroke={SOFT} strokeWidth="2" />
      <path d="M 352 414 q 40 10 34 70 q -6 60 -30 90" fill="none" stroke={SOFT} strokeWidth="3" strokeLinecap="round" />
      <rect x="340" y="404" width="22" height="40" rx="8" fill={FILL} stroke={LINE} strokeWidth="2" />
      <rect x="190" y="444" width="40" height="300" fill={FILL} stroke={SOFT} strokeWidth="2" />
      <path d="M 110 790 L 310 790 L 330 812 L 90 812 Z" fill={FILL} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M 210 744 L 210 790" stroke={SOFT} strokeWidth="2" />
      {[100, 170, 250, 320].map((cx) => <circle key={cx} cx={cx} cy="830" r="14" fill={FILL2} stroke={LINE} strokeWidth="2" />)}
    </svg>
    <div style={{ position: 'absolute', left: 54 * s, top: 34 * s, width: 312 * s, height: 222 * s, borderRadius: 6 * s, overflow: 'hidden' }}><ScanImage w={312 * s} h={222 * s} id={`${id}-scan`} /></div>
  </div>;
}

// A faceless silhouette figure with a soft rim light: elegant proportions, no features, so it reads as an illustration of
// a role (faculty, delegate), never as a real person. Local frame: 200 wide, feet on y = 600. pose: stand | watch |
// point | scan | phone. flip faces the figure left. Placed so its feet sit on the floor line `floor`.
const ARMS = {
  stand: ['M 64 126 Q 50 222 56 318', 'M 136 126 Q 150 222 144 318'],
  watch: ['M 64 126 Q 44 214 94 252', 'M 136 126 Q 156 214 106 252'],
  point: ['M 64 126 Q 50 222 56 318', 'M 136 124 Q 196 96 258 44'],
  scan: ['M 64 126 Q 50 222 56 318', 'M 136 126 Q 186 236 226 336'],
  phone: ['M 64 126 Q 58 204 94 226', 'M 136 126 Q 146 204 112 226'],
};
export function Person({ x, floor, s = 1, pose = 'stand', tone = '#24476A', flip = false, f = 0, phase = 0, id }) {
  const A = useContext(ArtCtx);
  const g = `p-${id || Math.round(x)}`;
  const sway = Math.sin((f + phase) / 24) * 2.2;
  const [l, r] = ARMS[pose];
  const rArm = pose === 'point' || pose === 'scan' ? r.replace(/(\d+) (\d+)$/, (m, a, b) => `${a} ${+b + sway}`) : r;
  return <svg data-art="person" width={300 * s} height={620 * s} viewBox="-50 -10 300 620" style={{ position: 'absolute', left: x - 100 * s, top: floor - 600 * s, transform: flip ? 'scaleX(-1)' : undefined, overflow: 'visible' }}>
    <defs><linearGradient id={g} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={tone} /><stop offset="1" stopColor={A.toneEnd} /></linearGradient></defs>
    <ellipse cx="100" cy="600" rx="70" ry="9" fill={A.shadow} />
    <g fill={`url(#${g})`} stroke={A.rim} strokeWidth="1.5">
      <ellipse cx="100" cy="54" rx="25" ry="30" />
      <path d="M 92 80 L 108 80 L 110 104 L 90 104 Z" />
      <path d="M 62 114 Q 100 100 138 114 L 145 332 Q 100 342 55 332 Z" />
      <path d="M 64 330 L 97 330 L 93 596 L 70 596 Z" /><path d="M 103 330 L 136 330 L 130 596 L 107 596 Z" />
    </g>
    <g fill="none" stroke={`url(#${g})`} strokeWidth="19" strokeLinecap="round"><path d={l} /><path d={rArm} /></g>
    <g fill="none" stroke={A.rimArm} strokeWidth="1.5"><path d={l} /><path d={rArm} /></g>
    {pose === 'scan' ? <rect x="219" y={330 + sway} width="14" height="30" rx="5" transform={`rotate(-12 226 ${345 + sway})`} fill="#D9E2EA" /> : null}
    {pose === 'phone' ? <><rect x="86" y="206" width="30" height="50" rx="5" fill={A.phone} stroke="rgba(247,245,240,0.5)" /><rect x="89" y="211" width="24" height="40" rx="2" fill={C.tealL} opacity="0.55" /></> : null}
  </svg>;
}

// An examination couch with a volunteer scanning model lying on it (as on a real course; no patient). Legs reach the
// floor line. The model is a lighter silhouette, head on a pillow at the left.
export function Couch({ x, floor, s = 1 }) {
  const { LINE, SOFT, FILL, model, pillow, rim } = useContext(ArtCtx);
  const H = 300;
  return <svg data-art="couch" width={640 * s} height={H * s} viewBox={`0 0 640 ${H}`} style={{ position: 'absolute', left: x, top: floor - H * s }}>
    <defs><linearGradient id="couch-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={model[0]} /><stop offset="1" stopColor={model[1]} /></linearGradient></defs>
    <rect x="20" y="120" width="600" height="36" rx="14" fill={FILL} stroke={LINE} strokeWidth="2" />
    <path d="M 70 156 L 70 296 M 570 156 L 570 296" stroke={SOFT} strokeWidth="6" strokeLinecap="round" />
    <rect x="40" y="96" width="110" height="26" rx="12" fill={pillow} stroke={SOFT} />
    <g fill="url(#couch-m)" stroke={rim} strokeWidth="1.5">
      <ellipse cx="96" cy="80" rx="30" ry="25" />
      <path d="M 128 74 Q 200 52 330 58 Q 470 62 590 92 L 594 122 L 128 122 Z" />
    </g>
  </svg>;
}

// Hands-on teaching: a machine, a volunteer model on the couch, one delegate scanning, a faculty member guiding at the
// screen and two delegates watching (one instructor to four or five delegates). Stage coordinates, floor at `floor`.
export function TeachingRoom({ f, floor = 1000, x = 0, tones = ['#2A5878', '#1F3C5C', '#25566A', '#2B4E70'] }) {
  const A = useContext(ArtCtx);
  return <div data-art="teaching" style={{ position: 'absolute', left: x, top: 0, width: 1920, height: 1080 }}>
    <div style={{ position: 'absolute', left: 300, width: 1600, top: floor - 2, height: 2, background: `linear-gradient(90deg, transparent, ${A.floor}, transparent)` }} />
    <Cart x={720} y={floor - 860 * 0.86} s={0.86} id={`teach${x}`} />
    <Couch x={1090} floor={floor} s={0.95} />
    <Person x={1330} floor={floor} s={0.86} pose="scan" tone={tones[0]} f={f} id={`d1${x}`} />
    <Person x={1070} floor={floor} s={0.94} pose="point" tone={tones[1]} flip f={f} phase={20} id={`fac${x}`} />
    <Person x={1640} floor={floor} s={0.84} pose="watch" tone={tones[2]} flip f={f} phase={40} id={`d2${x}`} />
    <Person x={1790} floor={floor} s={0.82} pose="watch" tone={tones[3]} flip f={f} phase={70} id={`d3${x}`} />
  </div>;
}
