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
import { Flagship3, flagship3TL } from './v3/Flagship3.jsx';
import { Short3, short3TL } from './v3/Short3.jsx';
import { Ad3, ad3TL } from './v3/Ad3.jsx';
import { RevealPreview } from './v3/RevealPreview.jsx';
import { Flagship4, flagship4TL } from './v4/Flagship4.jsx';
import { Short4, short4TL } from './v4/Short4.jsx';
import { Ad4, ad4TL } from './v4/Ad4.jsx';
import { RevealPreview4 } from './v4/RevealPreview4.jsx';
import { SAMPLE4 } from './v4/plans.js';

const sampleLen = () => { const t = flagshipTL(); return ['supervisors', 'free'].reduce((a, k) => a + t.byScene[k].dur, 0); };
const v2SampleLen = () => { const t = flagship2TL(); const k = ['brand', 'log', 'supervisors'].map((x) => t.byScene[x]); return k.reduce((a, x, i) => a + x.dur - (i < k.length - 1 ? Math.round((x.overlap || 0) * FPS) : 0), 0); };
const V3_SAMPLE = ['scan', 'rota', 'brand', 'request'];
const v3SampleLen = () => { const t = flagship3TL(); const k = V3_SAMPLE.map((x) => t.byScene[x]); return k.reduce((a, x, i) => a + x.dur - (i < k.length - 1 ? Math.round((x.overlap || 0) * FPS) : 0), 0); };
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
  {/* Version 3 (src/v3): the rota-mismatch story. Same variants as version 2. */}
  <Composition id="V3Flagship" component={Flagship3} durationInFrames={flagship3TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V3FlagshipCaptioned" component={Flagship3} defaultProps={{ captions: true }} durationInFrames={flagship3TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V3Sample" component={Flagship3} defaultProps={{ only: V3_SAMPLE }} durationInFrames={v3SampleLen()} fps={FPS} width={1920} height={1080} />
  <Composition id="V3Short" component={Short3} durationInFrames={short3TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V3ShortVertical" component={Short3} defaultProps={{ vertical: true }} durationInFrames={short3TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V3ShortCaptioned" component={Short3} defaultProps={{ captions: true }} durationInFrames={short3TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V3ShortVerticalCaptioned" component={Short3} defaultProps={{ vertical: true, captions: true }} durationInFrames={short3TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V3Ad" component={Ad3} durationInFrames={ad3TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V3AdVertical" component={Ad3} defaultProps={{ vertical: true }} durationInFrames={ad3TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V3AdCaptioned" component={Ad3} defaultProps={{ captions: true }} durationInFrames={ad3TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V3AdVerticalCaptioned" component={Ad3} defaultProps={{ vertical: true, captions: true }} durationInFrames={ad3TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V3LogoReveal" component={RevealPreview} defaultProps={{ variant: 'full' }} durationInFrames={120} fps={FPS} width={1920} height={1080} />
  <Composition id="V3LogoRevealCheck" component={RevealPreview} defaultProps={{ variant: 'full', check: true }} durationInFrames={120} fps={FPS} width={1920} height={1080} />
  <Composition id="V3LogoRevealShort" component={RevealPreview} defaultProps={{ variant: 'short' }} durationInFrames={80} fps={FPS} width={1920} height={1080} />
  {/* Version 4 (src/v4): brighter, warmer treatment. Sound is mixed outside Remotion (scripts/mix-v4.mjs), so these
      render silent and the mix is added when muxing; `mix` plays a soundtrack in the Studio. */}
  <Composition id="V4Flagship" component={Flagship4} durationInFrames={flagship4TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4FlagshipCaptioned" component={Flagship4} defaultProps={{ captions: true }} durationInFrames={flagship4TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4Sample" component={Flagship4} defaultProps={{ only: SAMPLE4 }} durationInFrames={flagship4TL(SAMPLE4).total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4Short" component={Short4} durationInFrames={short4TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4ShortVertical" component={Short4} defaultProps={{ vertical: true }} durationInFrames={short4TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V4ShortCaptioned" component={Short4} defaultProps={{ captions: true }} durationInFrames={short4TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4ShortVerticalCaptioned" component={Short4} defaultProps={{ vertical: true, captions: true }} durationInFrames={short4TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V4Ad" component={Ad4} durationInFrames={ad4TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4AdVertical" component={Ad4} defaultProps={{ vertical: true }} durationInFrames={ad4TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V4AdCaptioned" component={Ad4} defaultProps={{ captions: true }} durationInFrames={ad4TL().total} fps={FPS} width={1920} height={1080} />
  <Composition id="V4AdVerticalCaptioned" component={Ad4} defaultProps={{ vertical: true, captions: true }} durationInFrames={ad4TL().total} fps={FPS} width={1080} height={1920} />
  <Composition id="V4LogoReveal" component={RevealPreview4} defaultProps={{ variant: 'full' }} durationInFrames={120} fps={FPS} width={1920} height={1080} />
  <Composition id="V4LogoRevealCheck" component={RevealPreview4} defaultProps={{ variant: 'full', check: true }} durationInFrames={120} fps={FPS} width={1920} height={1080} />
  <Composition id="V4LogoRevealShort" component={RevealPreview4} defaultProps={{ variant: 'short' }} durationInFrames={80} fps={FPS} width={1920} height={1080} />
  <Composition id="V2ArtTest" component={ArtTest} durationInFrames={90} fps={FPS} width={1920} height={1080} />
</>;
