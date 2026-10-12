// Version 3 brand reveal (about 2.8 s; a shorter closing variation of about 1.6 s). A macro view of the wave (on the W's
// right-hand upstroke) in soft teal light, a smooth camera pullback with restrained depth and a slight rotation, and the
// emblem settling exactly into place; then the wordmark and tagline. The artwork is the approved mark itself (kit2 Mark:
// the website's SVG, ring #F7F5F0 stroke 2, wave #7FC4CC stroke 3.6), rendered large and scaled down so it stays crisp.
// From the settle frame onward the plain Mark is drawn with no light, tilt or effect, so the final frames are the
// approved logo unaltered. No particles, flares, shake or spin.
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { C, SANS, Mark, prog, easeIO } from '../v2/kit2.jsx';
import { clamp } from '../v2/kit2.jsx';

const WAVE = 'M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5';
const settleEase = Easing.bezier(0.33, 0, 0.12, 1); // eases in gently, then a long, soft settle

// Timing (frames) for the two variants.
export const REVEAL = { full: { hold: 8, pull: 52, word: 60, tag: 72, K: 24 }, short: { hold: 3, pull: 30, word: 34, tag: 42, K: 12 } };

// The emblem during the move: the same geometry, with a gentle light sweeping along the wave and a ring that completes
// as the camera pulls back. Draws nothing different from Mark once p reaches 1.
// Colours: the dark-background artwork by default (version 3); version 4 passes the website's light-background
// colours (ring navy, wave #2A7F8A). wave/hi: the wave's colour and the sweep's highlight, as RGB.
export const DARK_PAL = { ring: C.cream, wave: [127, 196, 204], hi: [173, 222, 226], glow: 0.16, word: C.cream, tag: C.slate };
const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ')})`;
function MovingMark({ size, p, sweep, pal = DARK_PAL }) {
  const ring = prog(p, 0.1, 0.85, Easing.inOut(Easing.cubic));
  const hl = 1 - p; // the light fades out by the settle
  const base = `rgb(${pal.wave.join(', ')})`;
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ overflow: 'visible' }}>
    <defs>
      <linearGradient id="wl-sweep" gradientUnits="userSpaceOnUse" x1={8 + sweep * 50} y1="0" x2={20 + sweep * 50} y2="64">
        <stop offset="0" stopColor={pal === DARK_PAL ? '#7FC4CC' : base} /><stop offset="0.5" stopColor={pal === DARK_PAL ? `rgb(${127 + 46 * hl}, ${196 + 26 * hl}, ${204 + 22 * hl})` : rgb(pal.wave, pal.hi, hl)} /><stop offset="1" stopColor={pal === DARK_PAL ? '#7FC4CC' : base} />
      </linearGradient>
      <radialGradient id="wl-glow" cx="32" cy="32" r="34" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#7FC4CC" stopOpacity={pal.glow * hl} /><stop offset="1" stopColor="#7FC4CC" stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="32" cy="32" r="34" fill="url(#wl-glow)" />
    <circle cx="32" cy="32" r="30" stroke={pal.ring} strokeWidth="2" transform="rotate(-90 32 32)" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - ring} />
    <path d={WAVE} stroke="url(#wl-sweep)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

// cx, cy: where the emblem's centre settles; size: its final size. variant: 'full' | 'short'. words: show the wordmark
// and tagline under the emblem. at: start frame.
// settledHtml: for the logo check only, draw this markup instead of Mark once settled (the website's own SVG).
export function LogoReveal({ cx, cy, size = 150, variant = 'full', words = true, at = 0, wordSize = 66, settledHtml = null, pal = DARK_PAL }) {
  const f = useCurrentFrame() - at;
  const T = REVEAL[variant];
  const p = interpolate(f, [T.hold, T.hold + T.pull], [0, 1], { ...clamp, easing: settleEase });
  const settled = f >= T.hold + T.pull;
  // Macro focus: a point on the right-hand upstroke of the W (viewBox units), drifting very slightly during the hold.
  const fx = 49.4 - 0.5 * prog(f, 0, T.hold), fy = 33;
  const K = T.K, big = size * K;
  const sc = interpolate(p, [0, 1], [1, 1 / K]);
  const dx = interpolate(p, [0, 1], [-(fx - 32) / 64 * big, 0]);
  const dy = interpolate(p, [0, 1], [-(fy - 32) / 64 * big, 0]);
  const rz = interpolate(p, [0, 1], [-9, 0]), rx = interpolate(p, [0, 1], [8, 0]), ry = interpolate(p, [0, 1], [-12, 0]);
  const o = 1; // the scene's own dissolve brings the macro in
  const word = prog(f, T.word, T.word + 14), tag = prog(f, T.tag, T.tag + 14);
  return <>
    <div data-box="logo" data-id="reveal" style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size }}>
      {settled ? (settledHtml ? <div style={{ width: size, height: size, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: settledHtml }} /> : (pal === DARK_PAL ? <Mark size={size} /> : <Mark size={size} ringColor={pal.ring} color={`rgb(${pal.wave.join(', ')})`} />)) : <div style={{ position: 'absolute', left: size / 2 - big / 2, top: size / 2 - big / 2, width: big, height: big, opacity: o, transform: `perspective(${big * 3}px) translate(${dx}px, ${dy}px) scale(${sc}) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)`, transformOrigin: '50% 50%' }}><MovingMark size={big} p={p} pal={pal} sweep={prog(f, 0, T.hold + T.pull * 0.8, easeIO)} /></div>}
    </div>
    {words ? <div style={{ position: 'absolute', left: cx - 700, width: 1400, top: cy + size / 2 + wordSize * 0.55, textAlign: 'center', fontFamily: SANS }}>
      <div data-box="text" data-id="wordmark" style={{ fontWeight: 600, fontSize: wordSize, letterSpacing: '0.42em', paddingLeft: '0.42em', color: pal.word, opacity: word, transform: `translateY(${(1 - word) * 14}px)` }}>WAVELENGTH</div>
      <div data-box="text" data-id="wordmark" style={{ fontWeight: 500, fontSize: wordSize * 0.3, letterSpacing: '0.32em', paddingLeft: '0.32em', color: pal.tag, marginTop: wordSize * 0.32, opacity: tag, transform: `translateY(${(1 - tag) * 10}px)` }}>TUNE IN · GAIN CLARITY</div>
    </div> : null}
  </>;
}
