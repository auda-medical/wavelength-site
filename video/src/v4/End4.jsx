// Version 4 end frame: the short logo reveal in the website's light-background colours on warm daylight cream, then
// the website, the calls to action, the verified social accounts and the QR code. Landscape and portrait. Same layout,
// links and QR destinations as version 3; the logo sound is mixed into the soundtrack (scripts/mix-v4.mjs).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { QRCode } from '../kit.jsx';
import { SERIF, prog, SceneFade } from '../v2/kit2.jsx';
import { LogoReveal, REVEAL } from '../v3/reveal.jsx';
import { Backdrop4, Pill4, Social4, L, LOGO_LIGHT } from './look.jsx';

export function End4({ s, film = 'flagship', ctas = ['START YOUR FREE LOGBOOK'], vertical = false }) {
  const f = useCurrentFrame();
  const V = vertical;
  const base = REVEAL.short.tag + 8;
  const a = (x) => prog(f, base + x, base + x + 14);
  const lift = (x) => `translateY(${(1 - a(x)) * 16}px)`;
  const P = V ? { cx: 540, cy: 520, size: 150, word: 62, url: 840, cta: 950 } : { cx: 960, cy: 195, size: 124, word: 64, url: 478, cta: 590 };
  return <SceneFade dur={s.dur} outF={1}><Backdrop4 w={V ? 1080 : 1920} h={V ? 1920 : 1080} tone="day" />
    <LogoReveal cx={P.cx} cy={P.cy} size={P.size} variant="short" wordSize={P.word} pal={LOGO_LIGHT} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: P.url, display: 'flex', justifyContent: 'center' }}><div data-box="text" data-id="url" style={{ opacity: a(0), transform: lift(0), fontFamily: SERIF, fontSize: V ? 74 : 72, color: L.navy }}>thewavelength.co.uk</div></div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: P.cta, display: 'flex', justifyContent: 'center' }}><div data-box="cta" style={{ opacity: a(8), transform: lift(8), display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: 'center', gap: 20 }}>{ctas.map((c, i) => <Pill4 key={c} solid={i === 0} size={V ? 28 : 24}>{c}</Pill4>)}</div></div>
    <div style={{ position: 'absolute', left: V ? 0 : 120, right: V ? 0 : 120, bottom: V ? 300 : 70, display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: V ? 'center' : 'flex-end', justifyContent: 'space-between', gap: V ? 34 : 0, opacity: a(18) }}>
      <div data-box="social"><Social4 size={V ? 30 : 32} /></div>
      <div data-box="qr" style={{ display: 'flex', alignItems: 'center', gap: 18 }}><div style={{ textAlign: 'right', fontSize: V ? 24 : 20, color: L.sub, lineHeight: 1.45 }}>Scan to visit<br />thewavelength.co.uk</div><div style={{ padding: 6, borderRadius: 18, background: '#fff', boxShadow: '0 10px 26px rgba(15,30,51,.12)' }}><QRCode film={film} size={V ? 170 : 140} /></div></div>
    </div>
  </SceneFade>;
}
