// Standalone previews of the version 4 logo reveal (full and short) on daylight cream, in the website's light-background
// colours. check: draw the website's own light-background markup (site-mark-light.json, written by
// scripts/logo-check.mjs --v4) as the settled logo. Sound is added when muxing (scripts/mix-v4.mjs).
import React from 'react';
import { LogoReveal } from '../v3/reveal.jsx';
import { Backdrop4, LOGO_LIGHT } from './look.jsx';
import SITE_MARK from './site-mark-light.json';
export function RevealPreview4({ variant = 'full', check = false }) {
  return <div style={{ position: 'absolute', inset: 0, background: '#F7F5F0' }}><Backdrop4 tone="day" />
    <LogoReveal cx={960} cy={420} size={150} variant={variant} wordSize={66} pal={LOGO_LIGHT} settledHtml={check ? SITE_MARK.svg : null} />
  </div>;
}
