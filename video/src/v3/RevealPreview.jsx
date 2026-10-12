// Standalone previews of the version 3 logo reveal (full and short), for review before and apart from the films.
import React from 'react';
import { Audio, staticFile } from 'remotion';
import { Backdrop } from '../kit.jsx';
import { LogoReveal } from './reveal.jsx';
import SITE_MARK from './site-mark.json';
// check: draw the website's own logo markup (site-mark.json, written by scripts/logo-check.mjs) as the settled logo.
export function RevealPreview({ variant = 'full', check = false }) {
  return <div style={{ position: 'absolute', inset: 0, background: '#071019' }}><Backdrop />
    <Audio src={staticFile(`audio-v3/sfx/${variant === 'full' ? 'reveal' : 'reveal-short'}.wav`)} volume={0.6} />
    <LogoReveal cx={960} cy={420} size={150} variant={variant} wordSize={66} settledHtml={check ? SITE_MARK.svg : null} />
  </div>;
}
