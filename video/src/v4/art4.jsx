// Version 4 rota and shift line: the version 3 diagrams (src/v3/art3.jsx) redrawn for light backgrounds. White cards,
// soft shadows, nights in soft indigo, days in teal with a warm sun, the other site in grey. Plainly diagrams of a
// scenario (not real rotas, people or hospitals).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { SANS, SERIF, prog } from '../v2/kit2.jsx';
import { L } from './look.jsx';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const Moon = ({ s = 18, c = '#6E7FD0' }) => <svg width={s} height={s} viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill={c} /></svg>;
const Sun = ({ s = 18, c = '#E3A23A' }) => <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6" fill={c} /><g stroke={c} strokeWidth="2" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M12 2.6v2.4" transform={`rotate(${a} 12 12)`} />)}</g></svg>;
const Pin = ({ s = 18, c = '#7A8899' }) => <svg width={s} height={s} viewBox="0 0 24 24"><path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" fill="none" stroke={c} strokeWidth="2" /><circle cx="12" cy="10" r="2.4" fill={c} /></svg>;

export function RotaWeek4({ at = 0, w = 1100, scale = 1, mark = null }) {
  const f = useCurrentFrame();
  const you = { 0: 'night', 1: 'night', 2: 'night', 5: 'night' };
  const sup = { 0: 'site', 3: 'day', 4: 'day', 6: 'day' };
  const cell = (kind, i, row) => {
    if (!kind) return <div key={i} />;
    const t = at + 10 + (row ? 28 : 0) + i * 4;
    const p = prog(f, t, t + 12);
    const st = { night: ['rgba(110,127,208,0.14)', '#4B5AA8', <Moon key="m" />, 'Night'], day: ['rgba(42,127,138,0.12)', '#1F6A74', <Sun key="s" />, 'Day'], site: ['rgba(15,30,51,0.05)', '#5E6E80', <Pin key="p" />, 'Other site'] }[kind];
    const hot = mark != null && ((row === 0 && i === 1) || (row === 1 && i === 3));
    const hp = hot ? prog(f, mark + (row ? 18 : 0), mark + (row ? 18 : 0) + 14) : 0;
    return <div key={i} style={{ position: 'relative', boxShadow: hp ? `0 0 0 ${3 * scale * hp}px ${L.teal}, 0 10px ${26 * hp}px rgba(42,127,138,${0.25 * hp})` : undefined, height: 64 * scale, borderRadius: 14 * scale, background: st[0], border: `1px solid ${st[1]}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 * scale, color: st[1], fontSize: 20 * scale, fontWeight: 500, opacity: p, transform: `scale(${0.85 + 0.15 * p})` }}>{st[2]}{st[3]}{hp ? <div style={{ position: 'absolute', left: -20 * scale, right: -20 * scale, [row ? 'top' : 'bottom']: -31 * scale, textAlign: 'center', fontSize: 17 * scale, fontWeight: 600, letterSpacing: '0.14em', color: L.teal, opacity: hp, whiteSpace: 'nowrap' }}>{row ? 'THEIR NEXT SHIFT' : 'YOUR SCAN'}</div> : null}</div>;
  };
  const col = { display: 'grid', gridTemplateColumns: `${200 * scale}px repeat(7, 1fr)`, gap: 10 * scale, alignItems: 'center' };
  return <div data-box="art" style={{ width: w, padding: 34 * scale, borderRadius: 26 * scale, background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(15,30,51,0.07)', boxShadow: '0 30px 70px rgba(15,30,51,.12), 0 6px 18px rgba(15,30,51,.06)', opacity: prog(f, at, at + 12), fontFamily: SANS }}>
    <div style={{ ...col, marginBottom: 16 * scale }}><div />{DAYS.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 18 * scale, letterSpacing: '0.16em', color: L.sub }}>{d}</div>)}</div>
    <div style={{ ...col, marginBottom: (mark != null ? 44 : 12) * scale }}><div style={{ fontSize: 26 * scale, color: L.navy }}>You</div>{DAYS.map((_, i) => cell(you[i], i, 0))}</div>
    <div style={col}><div style={{ fontSize: 26 * scale, color: L.navy, lineHeight: 1.15 }}>Your<br />supervisor</div>{DAYS.map((_, i) => cell(sup[i], i, 1))}</div>
  </div>;
}

export function ShiftLanes4({ p = 0, w = 1600, showRight = 1, leftAt = 0 }) {
  const f = useCurrentFrame();
  const x = 60 + (w - 120) * p;
  const node = (side, icon, title, time, o) => <div style={{ position: 'absolute', [side]: 0, top: 0, width: 380, textAlign: side === 'left' ? 'left' : 'right', opacity: o }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 500, letterSpacing: '0.18em', color: L.sub, flexDirection: side === 'left' ? 'row' : 'row-reverse' }}>{icon}{title}</div>
    <div style={{ fontFamily: SERIF, fontSize: 40, color: L.navy, marginTop: 6 }}>{time}</div>
  </div>;
  return <div data-box="card" data-id="shift-line" style={{ position: 'relative', width: w, height: 150, fontFamily: SANS }}>
    {node('left', <Moon s={20} />, 'YOUR SHIFT', 'Tuesday 03:40', prog(f, leftAt, leftAt + 12))}
    {node('right', <Sun s={20} />, 'THEIR SHIFT', 'Thursday 14:20', showRight)}
    <div style={{ position: 'absolute', left: 60, right: 60, top: 118, height: 3, borderRadius: 2, background: 'linear-gradient(90deg, rgba(110,127,208,0.55), rgba(42,127,138,0.7))' }} />
    <div style={{ position: 'absolute', left: w / 2 - 30, width: 60, top: 130, textAlign: 'center', fontSize: 16, letterSpacing: '0.18em', color: L.sub }}>WED</div>
    <div style={{ position: 'absolute', left: x - 13, top: 106, width: 26, height: 26, borderRadius: 13, background: L.teal, border: '3px solid #fff', boxShadow: '0 0 0 1px rgba(42,127,138,0.3), 0 6px 18px rgba(42,127,138,0.45)' }} />
  </div>;
}
