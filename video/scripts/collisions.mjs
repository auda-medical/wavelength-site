// Layout collision check for the version 2 films. Renders every Nth frame of each composition with inputProps
// { probe: true }; the <Probe> component logs the rendered bounds of every visible element that declares a role
// (data-box: text, caption, device, browser, logo, cta, qr, social, card, art). Reports any frame where:
//   - copy (text) overlaps a device, browser, card, logo, call to action, QR code or other copy;
//   - a caption overlaps anything except the background art;
//   - anything overlaps a call to action, QR code, social icons or the logo.
// Overlaps under 4 px are ignored (anti-aliasing). Writes <out>/collisions.json and prints a summary.
//   node scripts/collisions.mjs <out> [Composition,...] [--every=5]
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderFrames } from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const args = process.argv.slice(2);
const OUT = path.resolve(args[0] || 'collisions');
const every = Number((args.find((a) => a.startsWith('--every=')) || '--every=5').split('=')[1]);
const ids = (args[1] && !args[1].startsWith('--') ? args[1].split(',') : ['V2Flagship', 'V2FlagshipCaptioned', 'V2Short', 'V2ShortVertical', 'V2ShortCaptioned', 'V2ShortVerticalCaptioned', 'V2Ad', 'V2AdVertical', 'V2AdCaptioned', 'V2AdVerticalCaptioned']);
fs.mkdirSync(OUT, { recursive: true });

const HARD = new Set(['device', 'browser', 'card', 'logo', 'cta', 'qr', 'social']);
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) > 0 && Math.min(a.r, b.r) - Math.max(a.l, b.l) >= 4 && Math.min(a.b, b.b) - Math.max(a.t, b.t) >= 4;
const KNOWN = new Set(['text', 'caption', 'device', 'browser', 'card', 'logo', 'cta', 'qr', 'social', 'art']);
function problems(all) {
  const boxes = all.filter((b) => KNOWN.has(b.role));
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (!overlap(a, b)) continue;
    const roles = [a.role, b.role].sort().join('+');
    const bad =
      (a.role === 'text' && b.role === 'text' && a.id !== b.id) ||
      ((a.role === 'text' && HARD.has(b.role)) || (b.role === 'text' && HARD.has(a.role))) ||
      ((a.role === 'caption' && b.role !== 'art') || (b.role === 'caption' && a.role !== 'art')) ||
      (['cta', 'qr', 'social', 'logo'].includes(a.role) && ['cta', 'qr', 'social', 'logo', 'device', 'browser', 'card'].includes(b.role) && a.role !== b.role);
    if (bad) out.push({ roles, a: `${a.role}:${a.id}`, b: `${b.role}:${b.id}`, boxA: [a.l, a.t, a.r, a.b, a.o], boxB: [b.l, b.t, b.r, b.b, b.o] });
  }
  return out;
}

const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/index.jsx') });
const report = {};
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id, inputProps: { probe: true } });
  const frames = new Map();
  await renderFrames({
    serveUrl, composition, inputProps: { probe: true }, outputDir: null, imageFormat: 'none', everyNthFrame: every, concurrency: 2, logLevel: 'error',
    onBrowserLog: (log) => { const t = log.text || ''; if (t.startsWith('WLBOX ')) { const j = JSON.parse(t.slice(6)); frames.set(j.f, j.boxes); } },
    onStart: () => {}, onFrameUpdate: () => {},
  });
  const issues = [];
  for (const [f, boxes] of [...frames].sort((x, y) => x[0] - y[0])) for (const p of problems(boxes)) issues.push({ frame: f, second: +(f / 30).toFixed(2), ...p });
  // Group consecutive frames of the same pair into ranges.
  const ranges = [];
  for (const x of issues) {
    const last = ranges.find((r) => r.a === x.a && r.b === x.b && x.frame - r.to <= every);
    if (last) last.to = x.frame; else ranges.push({ a: x.a, b: x.b, from: x.frame, to: x.frame, boxA: x.boxA, boxB: x.boxB });
  }
  report[id] = { framesChecked: frames.size, every, ranges: ranges.map((r) => ({ ...r, seconds: `${(r.from / 30).toFixed(1)}-${(r.to / 30).toFixed(1)}` })) };
  console.log(`${id}: ${frames.size} frames checked, ${ranges.length} overlap range(s)`);
  for (const r of report[id].ranges) console.log(`   ${r.seconds}s  ${r.a} [${r.boxA}]  x  ${r.b} [${r.boxB}]`);
}
fs.writeFileSync(path.join(OUT, 'collisions.json'), JSON.stringify(report, null, 1));
