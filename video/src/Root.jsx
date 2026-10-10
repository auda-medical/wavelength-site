// All compositions. Durations come from the measured narration (src/timeline.js). Render sizes: 1920 x 1080 and
// 1080 x 1920 by default; scripts/render.mjs also renders the 16:9 films at 3840 x 2160 (the layout scales).
import React from 'react';
import { Composition } from 'remotion';
import { Flagship, flagshipTL } from './Flagship.jsx';
import { Short, shortTL } from './Short.jsx';
import { Ad, adTL } from './Ad.jsx';
import { FPS } from './timeline.js';

const sampleLen = () => { const t = flagshipTL(); return ['supervisors', 'free'].reduce((a, k) => a + t.byScene[k].dur, 0); };
export const Root = () => <>
  <Composition id="Flagship" component={Flagship} durationInFrames={flagshipTL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="Sample" component={Flagship} defaultProps={{ only: ['supervisors', 'free'], music: 'audio/music/sample.wav' }} durationInFrames={sampleLen()} fps={FPS} width={1920} height={1080} />
  <Composition id="Short" component={Short} durationInFrames={shortTL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="ShortVertical" component={Short} defaultProps={{ vertical: true }} durationInFrames={shortTL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="Ad" component={Ad} durationInFrames={adTL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="AdVertical" component={Ad} defaultProps={{ vertical: true }} durationInFrames={adTL().total} fps={FPS} width={1080} height={1920} />
</>;
