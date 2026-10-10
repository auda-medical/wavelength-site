// All compositions. Durations come from the measured narration (src/timeline.js). Render sizes: 1920 x 1080 and
// 1080 x 1920 by default; scripts/render.mjs also renders the 16:9 films at 3840 x 2160 (the layout scales).
import React from 'react';
import { Composition } from 'remotion';
import { Flagship, flagshipTL } from './Flagship.jsx';
import { Short, shortTL } from './Short.jsx';
import { Ad, adTL } from './Ad.jsx';
import { FPS } from './timeline.js';
import { ArtTest } from './v2/ArtTest.jsx';
import { Flagship2, flagship2TL } from './v2/Flagship2.jsx';
import { Short2, short2TL } from './v2/Short2.jsx';
import { Ad2, ad2TL } from './v2/Ad2.jsx';

const sampleLen = () => { const t = flagshipTL(); return ['supervisors', 'free'].reduce((a, k) => a + t.byScene[k].dur, 0); };
const v2SampleLen = () => { const t = flagship2TL(); const k = ['brand', 'log', 'supervisors'].map((x) => t.byScene[x]); return k.reduce((a, x, i) => a + x.dur - (i < k.length - 1 ? Math.round((x.overlap || 0) * FPS) : 0), 0); };
export const Root = () => <>
  <Composition id="Flagship" component={Flagship} durationInFrames={flagshipTL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="Sample" component={Flagship} defaultProps={{ only: ['supervisors', 'free'], music: 'audio/music/sample.wav' }} durationInFrames={sampleLen()} fps={FPS} width={1920} height={1080} />
  <Composition id="Short" component={Short} durationInFrames={shortTL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="ShortVertical" component={Short} defaultProps={{ vertical: true }} durationInFrames={shortTL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="Ad" component={Ad} durationInFrames={adTL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="AdVertical" component={Ad} defaultProps={{ vertical: true }} durationInFrames={adTL().total} fps={FPS} width={1080} height={1920} />
  {/* Version 2 (src/v2). Clean films have no burned-in subtitles; Captioned variants are for muted social playback. */}
  <Composition id="V2Flagship" component={Flagship2} durationInFrames={flagship2TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V2FlagshipCaptioned" component={Flagship2} defaultProps={{ captions: true }} durationInFrames={flagship2TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V2Sample" component={Flagship2} defaultProps={{ only: ['brand', 'log', 'supervisors'] }} durationInFrames={v2SampleLen()} fps={FPS} width={1920} height={1080} />
  <Composition id="V2Short" component={Short2} durationInFrames={short2TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V2ShortVertical" component={Short2} defaultProps={{ vertical: true }} durationInFrames={short2TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V2ShortCaptioned" component={Short2} defaultProps={{ captions: true }} durationInFrames={short2TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V2ShortVerticalCaptioned" component={Short2} defaultProps={{ vertical: true, captions: true }} durationInFrames={short2TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V2Ad" component={Ad2} durationInFrames={ad2TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V2AdVertical" component={Ad2} defaultProps={{ vertical: true }} durationInFrames={ad2TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V2AdCaptioned" component={Ad2} defaultProps={{ captions: true }} durationInFrames={ad2TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V2AdVerticalCaptioned" component={Ad2} defaultProps={{ vertical: true, captions: true }} durationInFrames={ad2TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V2ArtTest" component={ArtTest} durationInFrames={90} fps={FPS} width={1920} height={1080} />
</>;
