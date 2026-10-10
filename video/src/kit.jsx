// Building blocks for the Wavelength films: brand colours and type, a calm animated background, the wave mark that
// draws itself, an original phone frame showing real app captures, a browser frame for the website, tap feedback,
// kinetic type, the QR code and the end frame. Everything is laid out on a 1920 x 1080 (or 1080 x 1920) logical canvas
// and scaled to the render size, so the same scenes render at 1080p and 4K.
import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, continueRender, delayRender } from 'remotion';
import BOXES from '../public/captures/boxes.json';
import QR from './qr.json';

export const C = { navy: '#0F1E33', deep: '#0A1526', ink: '#071019', teal: '#2A7F8A', tealL: '#7FC4CC', cream: '#F7F5F0', sand: '#EDEAE3', slate: '#9FB0C2' };
export const SERIF = '"Cormorant Garamond", Georgia, serif';
export const SANS = '"DM Sans", "Segoe UI", sans-serif';
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
export const fade = (f, a, b) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

// ---------- Fonts (self-hosted copies of the site fonts) ----------
const FACES = [['Cormorant Garamond', 'cormorant-garamond-latin-500-normal.woff2', '500', 'normal'], ['Cormorant Garamond', 'cormorant-garamond-latin-500-italic.woff2', '500', 'italic'], ['Cormorant Garamond', 'cormorant-garamond-latin-600-normal.woff2', '600', 'normal'], ['DM Sans', 'dm-sans-latin-400-normal.woff2', '400', 'normal'], ['DM Sans', 'dm-sans-latin-500-normal.woff2', '500', 'normal'], ['DM Sans', 'dm-sans-latin-600-normal.woff2', '600', 'normal']];
let loaded = false;
export function useFonts() {
  const [handle] = React.useState(() => (loaded ? null : delayRender('fonts')));
  React.useEffect(() => {
    if (loaded || !handle) return;
    Promise.all(FACES.map(([fam, file, weight, style]) => new FontFace(fam, `url(${staticFile('fonts/' + file)})`, { weight, style }).load().then((f) => document.fonts.add(f)))).then(() => { loaded = true; continueRender(handle); });
  }, [handle]);
}

// ---------- Canvas: logical size, scaled to the render ----------
export function Canvas({ children, w = 1920, h = 1080, bg = C.deep }) {
  useFonts();
  const { width } = useVideoConfig();
  const k = width / w;
  return <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}><div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: '0 0', position: 'relative', fontFamily: SANS, color: C.cream }}>{children}</div></AbsoluteFill>;
}

// Slow-moving teal and blue glows over deep navy, with fine grain. tone: 'dark' or 'dim' (problem scene).
export function Backdrop({ w = 1920, h = 1080, tone = 'dark', drift = 1 }) {
  const f = useCurrentFrame();
  const t = f / 30;
  const g1 = { x: 0.72 + 0.04 * Math.sin(t * 0.21 * drift), y: 0.36 + 0.05 * Math.cos(t * 0.17 * drift) };
  const g2 = { x: 0.18 + 0.05 * Math.cos(t * 0.13 * drift), y: 0.82 + 0.04 * Math.sin(t * 0.19 * drift) };
  const a = tone === 'dim' ? 0.18 : 0.42;
  return <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(1100px 800px at ${g1.x * w}px ${g1.y * h}px, rgba(42,127,138,${a}), transparent 60%), radial-gradient(900px 700px at ${g2.x * w}px ${g2.y * h}px, rgba(46,82,140,${a * 0.75}), transparent 62%), linear-gradient(180deg, ${C.deep}, ${C.ink})` }} />
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay' }}><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={3} /></filter><rect width="100%" height="100%" filter="url(#grain)" /></svg>
  </div>;
}

// ---------- Brand ----------
const WAVE = 'M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5';
export function Mark({ size = 160, draw = 1, ring = 1, color = C.tealL, ringColor = 'rgba(247,245,240,.75)' }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="30" stroke={ringColor} strokeWidth="1.6" strokeDasharray="190" strokeDashoffset={190 * (1 - ring)} transform="rotate(-90 32 32)" />
    <path d={WAVE} stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="80" strokeDashoffset={80 * (1 - draw)} />
  </svg>;
}
export function Wordmark({ size = 64, spacing = 0.42, opacity = 1, tag = true, tagOpacity = 1 }) {
  return <div style={{ textAlign: 'center', opacity }}>
    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: size, letterSpacing: `${spacing}em`, paddingLeft: `${spacing}em`, color: C.cream }}>WAVELENGTH</div>
    {tag ? <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: size * 0.3, letterSpacing: '0.32em', paddingLeft: '0.32em', color: C.slate, marginTop: size * 0.32, opacity: tagOpacity }}>TUNE IN · GAIN CLARITY</div> : null}
  </div>;
}
// The brand wave as a long horizontal line (scene dividers, the problem scene's monitor trace).
export function WaveLine({ w = 1920, y = 900, progress = 1, amp = 26, color = C.tealL, opacity = 0.5, period = 240, speed = 0 }) {
  const f = useCurrentFrame();
  let d = '';
  for (let x = 0; x <= w; x += 6) { const ph = (x + f * speed) / period * Math.PI * 2; const v = Math.sin(ph) * amp * (0.6 + 0.4 * Math.sin(ph / 3.7)); d += `${x === 0 ? 'M' : 'L'}${x} ${y + v}`; }
  return <svg width={w} height={y + amp * 2 + 10} style={{ position: 'absolute', left: 0, top: 0, opacity }}><path d={d} stroke={color} strokeWidth="2.2" fill="none" strokeDasharray={w * 1.3} strokeDashoffset={w * 1.3 * (1 - progress)} strokeLinecap="round" /></svg>;
}

// ---------- Type ----------
// Words rise and sharpen one after another from `start` (frames), each `stagger` frames apart.
export function Kinetic({ text, start = 0, stagger = 3, style = {}, dur = 18, italicFrom = null, color }) {
  const f = useCurrentFrame();
  const words = String(text).split(' ');
  return <div style={{ ...style }}>{words.map((wd, i) => {
    const p = fade(f, start + i * stagger, start + i * stagger + dur);
    const it = italicFrom != null && i >= italicFrom;
    return <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 26}px)`, filter: `blur(${(1 - p) * 8}px)`, marginRight: '0.26em', fontStyle: it ? 'italic' : 'normal', color: it ? C.tealL : color }}>{wd}</span>;
  })}</div>;
}
export const Eyebrow = ({ children, style = {} }) => <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 21, letterSpacing: '0.24em', textTransform: 'uppercase', color: C.tealL, ...style }}>{children}</div>;
// Subtitles for the social versions: the spoken line, two lines at most, lower third.
export function Subtitle({ text, start, end, w = 1920, bottom = 70, size = 40 }) {
  const f = useCurrentFrame();
  if (!text || f < start || f > end) return null;
  const o = Math.min(fade(f, start, start + 6), 1 - fade(f, end - 6, end));
  return <div style={{ position: 'absolute', left: w * 0.08, right: w * 0.08, bottom, textAlign: 'center', opacity: o }}><span style={{ fontFamily: SANS, fontWeight: 500, fontSize: size, lineHeight: 1.35, color: C.cream, background: 'rgba(7,16,25,.62)', padding: '6px 16px', borderRadius: 10, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{text}</span></div>;
}

// ---------- Phone ----------
// An original phone frame (not any manufacturer's design): slim dark bezel, soft edge highlight, small camera pill.
// states: [{ src, at, scrollFrom, scrollTo, scrollAt, scrollDur, tap }] in frames relative to the component; each
// state cross-fades in over 10 frames. Screen captures are 390 CSS pixels wide (1170 px images).
export function Phone({ states, k = 1.08, x = 0, y = 0, rotY = 0, rotX = 0, scale = 1, opacity = 1, shadow = true, glare = true }) {
  const f = useCurrentFrame();
  const W = 390 * k, H = 844 * k, B = 13 * k, R = 58 * k;
  return <div style={{ position: 'absolute', left: x, top: y, width: W + 2 * B, height: H + 2 * B, transform: `perspective(2600px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${scale})`, opacity, transformStyle: 'preserve-3d' }}>
    {shadow ? <div style={{ position: 'absolute', inset: 0, borderRadius: R + B, boxShadow: '0 60px 120px rgba(0,0,0,.55), 0 18px 40px rgba(0,0,0,.35)' }} /> : null}
    <div style={{ position: 'absolute', inset: 0, borderRadius: R + B, background: 'linear-gradient(145deg, #3a4656 0%, #151b24 38%, #0b0f15 62%, #2a3442 100%)', padding: B }}>
      <div style={{ position: 'absolute', inset: 1.5, borderRadius: R + B - 1.5, border: '1px solid rgba(255,255,255,.14)' }} />
      <div style={{ position: 'relative', width: W, height: H, borderRadius: R, overflow: 'hidden', background: '#fff' }}>
        {states.map((s, i) => {
          const next = states[i + 1];
          // The next screen fades in over this one, which stays opaque underneath until it is covered (no dip in brightness).
          const o = Math.min(i === 0 ? 1 : fade(f, s.at, s.at + 10), next ? 1 - fade(f, next.at + 10, next.at + 11) : 1);
          if (o <= 0) return null;
          const meta = BOXES[s.src] || { page: { h: 844 } };
          const sc = s.scrollTo != null ? interpolate(f, [s.scrollAt ?? s.at + 15, (s.scrollAt ?? s.at + 15) + (s.scrollDur ?? 60)], [s.scrollFrom || 0, s.scrollTo], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : s.scrollFrom || 0;
          if (meta.layer) return <div key={i} style={{ position: 'absolute', inset: 0, opacity: o }}><Layered name={s.src} meta={meta} sc={sc} k={k} W={W} />{s.tap ? <Tap k={k} at={s.tap.at} x={s.tap.x} y={s.tap.y} /> : null}</div>;
          return <div key={i} style={{ position: 'absolute', inset: 0, opacity: o }}>
            <Img src={staticFile(`captures/${s.src}.png`)} style={{ position: 'absolute', left: 0, top: -sc * k, width: W, height: (meta.full ? meta.page.h : 844) * k }} />
            {s.tap ? <Tap k={k} at={s.tap.at} x={s.tap.x} y={s.tap.y - sc} /> : null}
          </div>;
        })}
        <div style={{ position: 'absolute', top: 10 * k, left: '50%', width: 96 * k, height: 26 * k, marginLeft: -48 * k, borderRadius: 20 * k, background: '#070a0f' }} />
        {glare ? <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 32%)', pointerEvents: 'none' }} /> : null}
      </div>
    </div>
  </div>;
}
// A screen captured in layers (scripts/capture.mjs scrollShot): the content scrolls, the fixed bars or the sheet's
// surroundings stay where they are, as on the phone.
function Layered({ name, meta, sc, k, W }) {
  const base = staticFile(`captures/${name}-base.png`), content = staticFile(`captures/${name}-content.png`);
  if (meta.layer === 'sheet') {
    const r = meta.rect;
    return <><Img src={base} style={{ position: 'absolute', left: 0, top: 0, width: W, height: 844 * k }} />
      <div style={{ position: 'absolute', left: r.x * k, top: r.y * k, width: r.w * k, height: r.h * k, overflow: 'hidden', borderRadius: `${22 * k}px ${22 * k}px 0 0` }}><Img src={content} style={{ position: 'absolute', left: 0, top: -sc * k, width: r.w * k, height: meta.contentH * k }} /></div></>;
  }
  return <><Img src={content} style={{ position: 'absolute', left: 0, top: -sc * k, width: W, height: meta.contentH * k }} />
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: meta.top * k, overflow: 'hidden' }}><Img src={base} style={{ position: 'absolute', left: 0, top: 0, width: W, height: 844 * k }} /></div>
    <div style={{ position: 'absolute', left: 0, top: meta.bottom * k, width: W, height: (844 - meta.bottom) * k, overflow: 'hidden' }}><Img src={base} style={{ position: 'absolute', left: 0, top: -meta.bottom * k, width: W, height: 844 * k }} /></div></>;
}
// The centre of a captured control, for taps: mark(name, key) -> { x, y } in screen CSS pixels.
export const mark = (src, key) => { const m = ((BOXES[src] || {}).marks || {})[key]; return m ? { x: m.x + m.w / 2, y: m.y + m.h / 2 } : { x: 195, y: 422 }; };
export function Tap({ k, at, x, y }) {
  const f = useCurrentFrame();
  if (f < at - 2 || f > at + 24) return null;
  const p = interpolate(f, [at, at + 22], [0, 1], clamp);
  const press = interpolate(f, [at - 2, at + 4, at + 12], [0, 1, 0], clamp);
  return <div style={{ position: 'absolute', left: x * k, top: y * k, width: 0, height: 0 }}>
    <div style={{ position: 'absolute', left: -22 * k, top: -22 * k, width: 44 * k, height: 44 * k, borderRadius: '50%', background: `rgba(255,255,255,${0.42 * press})`, boxShadow: '0 0 0 1px rgba(15,30,51,.15)' }} />
    <div style={{ position: 'absolute', left: -(22 + 30 * p) * k, top: -(22 + 30 * p) * k, width: (44 + 60 * p) * k, height: (44 + 60 * p) * k, borderRadius: '50%', border: `${2 * k}px solid rgba(42,127,138,${0.7 * (1 - p)})` }} />
  </div>;
}

// ---------- Browser frame for the website ----------
export function Browser({ src, x = 0, y = 0, w = 1200, scrollFrom = 0, scrollTo = 0, scrollAt = 0, scrollDur = 90, opacity = 1, scale = 1, rotY = 0, url = 'thewavelength.co.uk' }) {
  const f = useCurrentFrame();
  const sc = interpolate(f, [scrollAt, scrollAt + scrollDur], [scrollFrom, scrollTo], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const h = w * 9 / 16;
  return <div style={{ position: 'absolute', left: x, top: y, width: w, opacity, transform: `perspective(2600px) rotateY(${rotY}deg) scale(${scale})`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 50px 110px rgba(0,0,0,.5)', background: '#0d1520', border: '1px solid rgba(255,255,255,.1)' }}>
    <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', background: 'linear-gradient(#1a2433,#141c28)' }}>
      {['#4b5666', '#4b5666', '#4b5666'].map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
      <div style={{ marginLeft: 16, flex: 1, height: 26, borderRadius: 13, background: 'rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: C.slate, letterSpacing: '.02em' }}>{url}</div>
    </div>
    <div style={{ position: 'relative', height: h, overflow: 'hidden' }}><Img src={staticFile(`captures/${src}.png`)} style={{ position: 'absolute', left: 0, top: -sc, width: w }} /></div>
  </div>;
}

// ---------- QR, social, end frame ----------
export function QRCode({ film, size = 220, fg = C.navy, bg = '#fff' }) {
  const q = QR[film];
  const m = 3, n = q.size + 2 * m;
  return <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" style={{ borderRadius: 14 }}><rect width={n} height={n} fill={bg} /><path d={q.dark.map(([x, y]) => `M${x + m} ${y + m}h1v1h-1z`).join('')} fill={fg} /></svg>;
}
// Simple monochrome glyphs for the two verified accounts in data/site.json (LinkedIn, Instagram). No Facebook account
// is configured, so none is shown.
export const Social = ({ size = 34, color = C.cream }) => <div style={{ display: 'flex', gap: 34, alignItems: 'center', fontSize: size * 0.62, color: C.slate }}>
  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.8 2.67 4.8 6.13V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.86V21H9z" /></svg>linkedin.com/company/the-wavelength</span>
  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill={color} stroke="none" /></svg>@thewavelength.co.uk</span>
</div>;
export function Pill({ children, solid = false, size = 22 }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: size * 2.5, padding: `0 ${size * 1.3}px`, borderRadius: 999, fontFamily: SANS, fontWeight: 600, fontSize: size, letterSpacing: '0.08em', background: solid ? C.tealL : 'transparent', color: solid ? C.deep : C.cream, border: solid ? 'none' : '1.5px solid rgba(247,245,240,.5)' }}>{children}</span>;
}
// The closing frame. vertical: the 1080 x 1920 layout.
export function EndFrame({ film, vertical = false, start = 0 }) {
  const f = useCurrentFrame() - start;
  const a = (s) => fade(f, s, s + 18);
  const lift = (s) => `translateY(${(1 - a(s)) * 22}px)`;
  if (vertical) return <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34 }}>
    <div style={{ opacity: a(0), transform: lift(0) }}><Mark size={150} draw={Math.min(1, f / 30)} ring={Math.min(1, f / 24)} /></div>
    <div style={{ opacity: a(6), transform: lift(6) }}><Wordmark size={62} /></div>
    <div style={{ opacity: a(16), transform: lift(16), fontFamily: SERIF, fontSize: 70, color: C.cream, marginTop: 10 }}>thewavelength.co.uk</div>
    <div style={{ opacity: a(24), transform: lift(24), display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}><Pill solid size={26}>EXPLORE OUR COURSES</Pill><Pill size={26}>ENQUIRE ABOUT TAILORED TRAINING</Pill></div>
    <div style={{ opacity: a(32), transform: lift(32), display: 'flex', alignItems: 'center', gap: 22, marginTop: 10 }}><QRCode film={film} size={190} /><div style={{ fontSize: 26, color: C.slate, lineHeight: 1.4 }}>Scan to visit<br />thewavelength.co.uk</div></div>
    <div style={{ opacity: a(40), transform: lift(40), marginTop: 6 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}><Social size={32} /></div></div>
  </div>;
  return <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
      <div style={{ opacity: a(0), transform: lift(0) }}><Mark size={128} draw={Math.min(1, f / 30)} ring={Math.min(1, f / 24)} /></div>
      <div style={{ opacity: a(6), transform: lift(6) }}><Wordmark size={70} /></div>
      <div style={{ opacity: a(16), transform: lift(16), fontFamily: SERIF, fontSize: 76, color: C.cream, marginTop: 8 }}>thewavelength.co.uk</div>
      <div style={{ opacity: a(24), transform: lift(24), display: 'flex', gap: 22 }}><Pill solid>EXPLORE OUR COURSES</Pill><Pill>ENQUIRE ABOUT TAILORED TRAINING</Pill></div>
    </div>
    <div style={{ position: 'absolute', left: 120, right: 120, bottom: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', opacity: a(34) }}>
      <Social size={34} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}><div style={{ textAlign: 'right', fontSize: 21, color: C.slate, lineHeight: 1.45 }}>Scan to visit<br />thewavelength.co.uk</div><QRCode film={film} size={150} /></div>
    </div>
  </div>;
}

// Cross-fade a scene in and out (frames relative to the scene).
export function SceneFade({ children, dur, inF = 14, outF = 14 }) {
  const f = useCurrentFrame();
  const o = Math.min(fade(f, 0, inF), 1 - fade(f, dur - outF, dur));
  return <div style={{ position: 'absolute', inset: 0, opacity: o }}>{children}</div>;
}
export const sp = (f, fps, delay = 0, cfg = { damping: 200, stiffness: 80, mass: 1 }) => spring({ frame: f - delay, fps, config: cfg });
