// Version 2 building blocks. Principles (docs/commercial-2026/07-videos.md, version 2):
// - Text arrives as whole lines in about 12 frames (a masked slide), never word by word.
// - The camera moves to show the app close up (Focus), so interfaces are readable.
// - Every element that must not be covered declares a role with data-box, so scripts/collisions.mjs can measure real
//   rendered bounds at many frames and report any overlap (text on a device, captions on a call to action, ...).
import React, { useLayoutEffect, useContext, createContext } from 'react';
import { useCurrentFrame, interpolate, Easing, getInputProps } from 'remotion';
import { C, SERIF, SANS, Phone, Browser, clamp } from '../kit.jsx';
import { splitCues, wrapAt } from './cues.js';
export { clamp };

export { C, SERIF, SANS };
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIO = Easing.bezier(0.65, 0, 0.35, 1);
export const prog = (f, a, b, e = easeOut) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });

// One line of copy: slides up out of a mask (12 frames) and leaves by lifting and fading (10 frames).
// Scene timing shared with the copy inside it: text enters only after the scene has faded in (minAt) and leaves before
// the next scene starts (outAt), so text from two scenes never stacks during a cross-dissolve.
export const SceneCtx = createContext({ minAt: 0, outAt: null });
// For a scene component's own elements (it renders the SceneFade, so it sits outside that context): the same exit.
export const outOf = (f, s) => (s.overlap ? 1 - prog(f, s.dur - Math.round(s.overlap * 30) - 16, s.dur - Math.round(s.overlap * 30) - 6, easeIO) : 1);
export function useOut() { const { outAt } = useContext(SceneCtx); const f = useCurrentFrame(); return outAt == null ? 1 : 1 - prog(f, outAt, outAt + 10, easeIO); }
export function Line({ children, at = 0, out = null, dur = 12, style = {}, id = '', role = 'text', align }) {
  const f = useCurrentFrame();
  const ctx = useContext(SceneCtx);
  at = Math.max(at, ctx.minAt);
  if (out == null) out = ctx.outAt;
  const p = prog(f, at, at + dur);
  const q = out == null ? 0 : prog(f, out, out + 10, easeIO);
  // Before it arrives and after it leaves, the line keeps its space (invisible), so nothing around it jumps.
  const shown = p > 0.001 && q < 0.999;
  return <div style={{ overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em', textAlign: align, visibility: shown ? 'visible' : 'hidden' }}>
    <div data-box={role} data-id={id} style={{ transform: `translateY(${(1 - p) * 105 - q * 30}%)`, opacity: Math.min(1, p * 1.6) * (1 - q), ...style }}>{children}</div>
  </div>;
}
export const Eyebrow2 = ({ children, at, out, style = {}, id }) => <Line at={at} out={out} id={id} style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.tealL, ...style }}>{children}</Line>;
export const Head = ({ children, at, out, size = 84, style = {}, id }) => <Line at={at} out={out} id={id} style={{ fontFamily: SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.04, color: C.cream, ...style }}>{children}</Line>;

// Camera: keys [{ at, dur, s, fx, fy, tx, ty }] put stage point (fx, fy) at screen point (tx, ty) at scale s. Each key's
// move starts at `at` and takes `dur` frames (default 24), eased in and out. Everything inside moves together.
export function Focus({ keys, children }) {
  const f = useCurrentFrame();
  let cur = keys[0];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.at) break;
    const t = interpolate(f, [k.at, k.at + (k.dur ?? 24)], [0, 1], { ...clamp, easing: easeIO });
    cur = Object.fromEntries(['s', 'fx', 'fy', 'tx', 'ty'].map((n) => [n, cur[n] + (k[n] - cur[n]) * t]));
  }
  const { s, fx, fy, tx, ty } = cur;
  return <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${tx - fx * s}px, ${ty - fy * s}px) scale(${s})` }}>{children}</div>;
}

// A phone (the version 1 frame and layered screens) that declares itself to the collision check.
export function Device({ x, y, k, states, rotY = 0, opacity = 1, id = 'phone' }) {
  const W = (390 + 26) * k, H = (844 + 26) * k;
  return <div data-box="device" data-id={id} style={{ position: 'absolute', left: x, top: y, width: W, height: H, opacity }}>
    <Phone k={k} x={0} y={0} rotY={rotY} states={states} />
  </div>;
}
// Stage coordinates of a point on a Device's screen (CSS px of the 390 x 844 capture).
export const onScreen = (d, px, py) => ({ x: d.x + 13 * d.k + px * d.k, y: d.y + 13 * d.k + py * d.k });

export function Site({ src, x, y, w, rotY = 0, opacity = 1, scrollFrom = 0, scrollTo = 0, scrollAt = 0, scrollDur = 90, id = 'browser' }) {
  return <div data-box="browser" data-id={id} style={{ position: 'absolute', left: x, top: y, width: w, height: w * 9 / 16 + 44, opacity }}>
    <Browser src={src} x={0} y={0} w={w} rotY={rotY} scrollFrom={scrollFrom} scrollTo={scrollTo} scrollAt={scrollAt} scrollDur={scrollDur} />
  </div>;
}

// Captions (captioned versions only). cues: [{ start, end, text }] in frames. zone(frame) gives { x, y, w, align }:
// each scene puts its captions where nothing important sits (beside the phone, never over it).
export function Captions({ cues, zone, size = 38 }) {
  const f = useCurrentFrame();
  const c = cues.find((q) => f >= q.start && f <= q.end);
  if (!c) return null;
  const z = zone(f);
  const o = Math.min(prog(f, c.start, c.start + 5), 1 - prog(f, c.end - 5, c.end));
  return <div style={{ position: 'absolute', left: z.x, top: z.y, width: z.w, display: 'flex', justifyContent: z.align === 'left' ? 'flex-start' : z.align === 'right' ? 'flex-end' : 'center', opacity: o }}>
    <div data-box="caption" style={{ background: 'rgba(5,12,20,0.82)', borderRadius: 12, padding: `${size * 0.28}px ${size * 0.5}px`, fontFamily: SANS, fontWeight: 500, fontSize: size, lineHeight: 1.3, color: '#fff', textAlign: z.align || 'center', maxWidth: z.w }}>{c.text}</div>
  </div>;
}

// Caption cues from a spoken line (src/v2/cues.js: sentence first, then commas), timed by share of characters.
export function cuesFor(text, from, dur, max = 42) {
  const chunks = splitCues(text, max);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let at = from;
  return chunks.map((c) => { const d = Math.round(dur * c.length / total); const lines = wrapAt(c, max); const q = { start: at, end: at + d, text: lines.length > 1 ? <>{lines[0]}<br />{lines[1]}</> : c }; at += d; return q; });
}

// Layout probe: with inputProps { probe: true }, logs the rendered bounds of every visible data-box element each frame
// (text measured tightly from its glyphs). scripts/collisions.mjs reads these logs.
export function Probe() {
  const f = useCurrentFrame();
  const { probe } = getInputProps() || {};
  useLayoutEffect(() => {
    if (!probe) return;
    const out = [];
    document.querySelectorAll('[data-box]').forEach((el) => {
      let o = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); o *= parseFloat(cs.opacity || '1'); if (cs.display === 'none' || cs.visibility === 'hidden') o = 0; }
      if (o < 0.12) return;
      let r;
      if (el.dataset.box === 'text') {
        const range = document.createRange(); range.selectNodeContents(el);
        const rs = [...range.getClientRects()].filter((x) => x.width > 1 && x.height > 1);
        if (!rs.length) return;
        r = { l: Math.min(...rs.map((x) => x.left)), t: Math.min(...rs.map((x) => x.top)), r: Math.max(...rs.map((x) => x.right)), b: Math.max(...rs.map((x) => x.bottom)) };
      } else { const b = el.getBoundingClientRect(); r = { l: b.left, t: b.top, r: b.right, b: b.bottom }; }
      // Clip to the visible part of the frame (masks hide what is outside).
      for (let e = el.parentElement; e && e.nodeType === 1; e = e.parentElement) { if (getComputedStyle(e).overflow === 'hidden') { const c = e.getBoundingClientRect(); r = { l: Math.max(r.l, c.left), t: Math.max(r.t, c.top), r: Math.min(r.r, c.right), b: Math.min(r.b, c.bottom) }; } }
      if (r.r - r.l < 2 || r.b - r.t < 2) return;
      out.push({ role: el.dataset.box, id: el.dataset.id || '', o: +o.toFixed(2), ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)])) });
    });
    console.log('WLBOX ' + JSON.stringify({ f, boxes: out }));
  });
  return null;
}

// The approved mark, as in the website header (build.js): ring stroke 2, wave stroke 3.6, wave #7FC4CC. Both strokes
// use pathLength 1, so draw = 1 is always the complete artwork; at draw >= 1 no dash is applied at all. (Version 1 used
// a fixed dash of 80 on the 102.5-unit wave, which left the final upstroke undrawn.)
const WAVE = 'M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5';
export function Mark({ size = 160, draw = 1, ring = 1, color = C.tealL, ringColor = C.cream }) {
  const dash = (p) => (p >= 1 ? {} : { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - Math.max(0, p) });
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="30" stroke={ringColor} strokeWidth="2" transform="rotate(-90 32 32)" {...dash(ring)} />
    <path d={WAVE} stroke={color} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" {...dash(draw)} />
  </svg>;
}
// A scene fades in over the previous one, which stays opaque underneath (outF 0), so cuts are true cross-dissolves with
// no dip to dark. Pass outF only for the last scene.
// next: the overlap (seconds) with the following scene; its copy leaves 6 frames before that scene begins.
export function SceneFade({ children, dur, inF = 14, outF = 0, next = null }) {
  const f = useCurrentFrame();
  const o = Math.min(inF > 1 ? prog(f, 0, inF, easeIO) : 1, outF > 0 ? 1 - prog(f, dur - outF, dur, easeIO) : 1);
  const ctx = { minAt: inF > 1 ? Math.max(inF - 2, 18) : 0, outAt: next ? dur - Math.round(next * 30) - 16 : null };
  return <SceneCtx.Provider value={ctx}><div data-scene="1" style={{ position: 'absolute', inset: 0, opacity: o }}>{children}</div></SceneCtx.Provider>;
}
