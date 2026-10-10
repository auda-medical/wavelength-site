// Look-development frame for the version 2 illustrations (not part of any film).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Backdrop, Wordmark } from '../kit.jsx';
import { Mark } from './kit2.jsx';
import { Cart, Person, Couch } from './art.jsx';
export function ArtTest() {
  const f = useCurrentFrame();
  const floor = 930;
  return <div style={{ position: 'absolute', inset: 0, background: '#0A1526' }}><Backdrop />
    <div style={{ position: 'absolute', left: 0, right: 0, top: floor - 2, height: 2, background: 'linear-gradient(90deg, transparent, rgba(127,196,204,0.18), transparent)' }} />
    <Cart x={300} y={floor - 860 * 0.95} s={0.95} />
    <Couch x={760} floor={floor} s={1} />
    <Person x={1020} floor={floor} s={0.92} pose="scan" tone="#2A5878" f={f} id="a" />
    <Person x={730} floor={floor} s={1.0} pose="point" tone="#1F3C5C" flip f={f} phase={20} id="b" />
    <Person x={1480} floor={floor} s={0.9} pose="watch" tone="#25566A" flip f={f} phase={40} id="c" />
    <Person x={1640} floor={floor} s={0.88} pose="phone" tone="#2B4E70" flip f={f} phase={60} id="d" />
    <div style={{ position: 'absolute', left: 80, top: 60 }}><Mark size={120} /></div>
  </div>;
}
