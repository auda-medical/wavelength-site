// Version 3 end frame: the short logo reveal (same motion language as the brand reveal), then the website, the calls to
// action, the verified social accounts and the QR code. Landscape and portrait.
import React from 'react';
import { Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Backdrop, Pill, QRCode, Social } from '../kit.jsx';
import { C, SERIF, prog, SceneFade } from '../v2/kit2.jsx';
import { LogoReveal, REVEAL } from './reveal.jsx';

export function End3({ s, film = 'flagship', ctas = ['START YOUR FREE LOGBOOK'], vertical = false }) {
  const f = useCurrentFrame();
  const V = vertical;
  const base = REVEAL.short.tag + 8;
  const a = (x) => prog(f, base + x, base + x + 14);
  const lift = (x) => `translateY(${(1 - a(x)) * 16}px)`;
  const L = V ? { cx: 540, cy: 520, size: 150, word: 62, url: 840, cta: 950 } : { cx: 960, cy: 195, size: 124, word: 64, url: 478, cta: 590 };
  return <SceneFade dur={s.dur} outF={1}><Backdrop w={V ? 1080 : 1920} h={V ? 1920 : 1080} />
    <Sequence from={0} durationInFrames={90}><Audio src={staticFile('audio-v3/sfx/reveal-short.wav')} volume={0.55} /></Sequence>
    <LogoReveal cx={L.cx} cy={L.cy} size={L.size} variant="short" wordSize={L.word} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: L.url, display: 'flex', justifyContent: 'center' }}><div data-box="text" data-id="url" style={{ opacity: a(0), transform: lift(0), fontFamily: SERIF, fontSize: V ? 74 : 72, color: C.cream }}>thewavelength.co.uk</div></div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: L.cta, display: 'flex', justifyContent: 'center' }}><div data-box="cta" style={{ opacity: a(8), transform: lift(8), display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: 'center', gap: 20 }}>{ctas.map((c, i) => <Pill key={c} solid={i === 0} size={V ? 28 : 24}>{c}</Pill>)}</div></div>
    <div style={{ position: 'absolute', left: V ? 0 : 120, right: V ? 0 : 120, bottom: V ? 300 : 70, display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: V ? 'center' : 'flex-end', justifyContent: 'space-between', gap: V ? 34 : 0, opacity: a(18) }}>
      <div data-box="social"><Social size={V ? 30 : 32} /></div>
      <div data-box="qr" style={{ display: 'flex', alignItems: 'center', gap: 18 }}><div style={{ textAlign: 'right', fontSize: V ? 24 : 20, color: C.slate, lineHeight: 1.45 }}>Scan to visit<br />thewavelength.co.uk</div><QRCode film={film} size={V ? 170 : 140} /></div>
    </div>
  </SceneFade>;
}
