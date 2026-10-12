// Version 4 look: brighter, warmer and more optimistic, with the same brand. Navy is kept for type and emphasis;
// backgrounds move from a cool, calm early light (the problem) to warm daylight cream with teal light (Wavelength),
// with one teal field for the free logbook. The logo uses the website's own light-background colours (build.js
// mark() in the scrolled header: ring navy #0F1E33, wave teal #2A7F8A), so the artwork is unchanged.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, SANS } from '../kit.jsx';

export const L = { navy: '#0F1E33', teal: '#2A7F8A', tealL: '#7FC4CC', cream: '#F7F5F0', white: '#FFFFFF', sub: '#56677A', amber: '#A8691A' };
export const THEME_LIGHT = { text: L.navy, eyebrow: L.teal };
export const LOGO_LIGHT = { ring: L.navy, wave: [42, 127, 138], hi: [127, 196, 204], glow: 0.12, word: L.navy, tag: L.sub };
export const ART_LIGHT = { LINE: 'rgba(15,30,51,0.48)', SOFT: 'rgba(15,30,51,0.2)', FILL: '#FFFFFF', FILL2: '#EDF2F5', glow: 0.2, toneEnd: '#3F6E8C', rim: 'rgba(15,30,51,0.22)', rimArm: 'rgba(15,30,51,0.16)', shadow: 'rgba(15,30,51,0.1)', floor: 'rgba(42,127,138,0.28)', model: ['#D3E3EB', '#AFC8D6'], pillow: '#FFFFFF', phone: '#16243A' };
export const TONES = ['#6FA3BE', '#4F84A6', '#78AEB8', '#6E98BC'];
export const PHONE_SHADOW = '0 46px 90px rgba(15,30,51,.2), 0 14px 30px rgba(15,30,51,.14)';

// tone: 'mist' (cool early light), 'day' (warm daylight cream), 'sunlit' (day with more warm sun, for teaching),
// 'teal' (the free-logbook field). warm: 0..1 blends
// mist into day (the brand reveal brings the light in).
export function Backdrop4({ w = 1920, h = 1080, tone = 'day', warm = null, drift = 1 }) {
  const f = useCurrentFrame(), t = f / 30;
  const g1 = { x: 0.72 + 0.04 * Math.sin(t * 0.21 * drift), y: 0.34 + 0.05 * Math.cos(t * 0.17 * drift) };
  const g2 = { x: 0.16 + 0.05 * Math.cos(t * 0.13 * drift), y: 0.84 + 0.04 * Math.sin(t * 0.19 * drift) };
  const at = (g) => `${g.x * w}px ${g.y * h}px`;
  const mist = `radial-gradient(1100px 800px at ${at(g1)}, rgba(127,196,204,0.26), transparent 62%), radial-gradient(900px 700px at ${at(g2)}, rgba(150,166,214,0.24), transparent 62%), linear-gradient(180deg, #DEE5EC, #CAD4DF)`;
  const sun = tone === 'sunlit' ? 0.3 : 0.16; // 'sunlit': the teaching scenes, the warmest light
  const day = `radial-gradient(1000px 760px at ${at(g1)}, rgba(127,196,204,0.3), transparent 62%), radial-gradient(${tone === 'sunlit' ? 1300 : 900}px 900px at ${at(g2)}, rgba(242,200,121,${sun}), transparent 64%), radial-gradient(1400px 900px at ${0.12 * w}px ${0.08 * h}px, rgba(255,255,255,0.9), transparent 60%), linear-gradient(180deg, #FCFBF8, #F1EEE7)`;
  const teal = `radial-gradient(1200px 900px at ${at(g1)}, rgba(255,255,255,0.22), transparent 60%), radial-gradient(900px 700px at ${at(g2)}, rgba(127,196,204,0.5), transparent 62%), linear-gradient(160deg, #24737D, #2A7F8A 45%, #4D9FA9)`;
  const mix = warm != null ? warm : tone === 'mist' ? 0 : 1;
  return <div style={{ position: 'absolute', inset: 0 }}>
    {tone === 'teal' ? <div style={{ position: 'absolute', inset: 0, background: teal }} /> : <>
      {mix < 1 ? <div style={{ position: 'absolute', inset: 0, background: mist }} /> : null}
      {mix > 0 ? <div style={{ position: 'absolute', inset: 0, background: day, opacity: mix }} /> : null}
    </>}
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, opacity: 0.05, mixBlendMode: 'soft-light' }}><filter id="grain4"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={3} /></filter><rect width="100%" height="100%" filter="url(#grain4)" /></svg>
  </div>;
}

export function Pill4({ children, solid = false, size = 22 }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: size * 2.5, padding: `0 ${size * 1.3}px`, borderRadius: 999, fontFamily: SANS, fontWeight: 600, fontSize: size, letterSpacing: '0.08em', background: solid ? L.teal : 'rgba(255,255,255,0.6)', color: solid ? L.white : L.navy, border: solid ? 'none' : '1.5px solid rgba(15,30,51,.32)', boxShadow: solid ? '0 12px 28px rgba(42,127,138,.28)' : 'none' }}>{children}</span>;
}
// The two verified accounts (data/site.json), as on the version 3 end frame, in navy.
export const Social4 = ({ size = 34 }) => <div style={{ display: 'flex', gap: 34, alignItems: 'center', fontSize: size * 0.62, color: L.sub }}>
  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><svg width={size} height={size} viewBox="0 0 24 24" fill={L.navy}><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.8 2.67 4.8 6.13V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.86V21H9z" /></svg>linkedin.com/company/the-wavelength</span>
  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={L.navy} strokeWidth="1.9"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill={L.navy} stroke="none" /></svg>@thewavelength.co.uk</span>
</div>;
export { C };
