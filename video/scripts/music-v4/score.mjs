// Version 4 score: one musical identity in three arrangements (candidates A, B and C).
//
// Identity
// - Key of D major throughout, so the logo signature (D5 rising to A5) sits in every arrangement.
// - The "W" motif: A5, D5, F#5, D5, A5, the shape of the Wavelength wave (high, low, middle, low, high). Its last leap
//   (D5 to A5) is the logo signature.
// - Story: the problem section never reaches the home chord (G, Asus4, Em7, Asus4: open and expectant, not dark) and
//   plays only the first three notes of the motif; Wavelength's arrival lands on D, the home chord, and the motif is
//   heard in full. Lifts at the free logbook and a resolution on D as the closing logo settles.
// - Bass notes are short (never sustained), pads sit in the middle register, the reverb return is high-passed: no
//   organ-like drones or heavy low end.
import { RATE, midi, Mixer, pad, piano, pluck, mallet, synthPluck, bass, kick, shaker, tap, clap, riser, rng } from './engine.mjs';

// Chords: bass (short notes), pad (middle register), arp (tones for patterns, ascending), gtr (guitar-register voicing).
const CH = {
  D: { bass: 38, pad: [62, 66, 69, 76], arp: [62, 66, 69, 74, 76], gtr: [50, 57, 62, 66, 69] },
  'A/C#': { bass: 37, pad: [61, 64, 69, 76], arp: [61, 64, 69, 73, 76], gtr: [49, 57, 61, 64, 69] },
  Bm7: { bass: 47, pad: [59, 62, 66, 69], arp: [59, 62, 66, 69, 74], gtr: [47, 54, 59, 62, 66] },
  G: { bass: 43, pad: [59, 62, 67, 69], arp: [59, 62, 67, 69, 71], gtr: [43, 50, 55, 59, 62] },
  Gmaj7: { bass: 43, pad: [59, 62, 66, 69], arp: [59, 62, 66, 69, 71], gtr: [43, 50, 54, 59, 62] },
  Asus4: { bass: 45, pad: [57, 62, 64, 69], arp: [57, 62, 64, 69, 74], gtr: [45, 52, 57, 62, 64] },
  A: { bass: 45, pad: [57, 61, 64, 69], arp: [57, 61, 64, 69, 73], gtr: [45, 52, 57, 61, 64] },
  Em7: { bass: 40, pad: [59, 62, 64, 67], arp: [59, 62, 64, 67, 71], gtr: [40, 47, 52, 55, 62] },
  'D/F#': { bass: 42, pad: [62, 66, 69, 74], arp: [62, 66, 69, 74, 78], gtr: [42, 50, 57, 62, 66] },
};
const PROG = {
  problem: ['Gmaj7', 'Asus4', 'Em7', 'Asus4'],
  lift: ['D', 'A/C#', 'Bm7', 'G'],
  main: ['D', 'A/C#', 'Bm7', 'G', 'D/F#', 'G', 'Em7', 'Asus4'],
  develop: ['G', 'D/F#', 'Em7', 'Asus4', 'G', 'D/F#', 'Em7', 'A'],
  free: ['D', 'A/C#', 'Bm7', 'G'],
  warm: ['G', 'D/F#', 'Em7', 'A'],
};
// The motif and its answers, in beats from a bar start: [beat, length, midi].
const W = [[0, 1, 81], [1, 0.5, 74], [1.5, 1, 78], [2.5, 0.5, 74], [3, 2.5, 81]];
const PHRASE = [ // four bars over D, A/C#, Bm7, G
  ...W,
  [5.5, 0.5, 76], [6, 0.5, 78], [6.5, 1.5, 76],
  [8, 1, 78], [9, 0.5, 71], [9.5, 1, 74], [10.5, 0.5, 71], [11, 1, 78],
  [12, 1.5, 76], [13.5, 0.5, 74], [14, 2, 74],
];
const FRAGMENT = [[0, 1, 81], [1, 0.5, 74], [1.5, 2, 78]]; // the motif, unfinished
const COUNTER = [[0, 1.5, 71], [1.5, 0.5, 74], [2, 2, 76], [4, 1, 78], [5, 1, 76], [6, 2, 74]]; // develop: rising, settled

// The beat grid: each section is fitted with a whole number of beats (tempo varies by under about 2 per cent), so
// every section change lands exactly on its picture cue. Bars group four beats; a section may end on a short bar.
export function grid(cues, total, bpm) {
  const beat0 = 60 / bpm, bars = [];
  const secs = cues.filter((c) => c.name !== 'end');
  const endCue = cues.find((c) => c.name === 'end');
  secs.forEach((c, i) => {
    const to = i < secs.length - 1 ? secs[i + 1].at : endCue.at;
    const D = to - c.at; if (D <= 0.05) return;
    const nb = Math.max(1, Math.round(D / beat0)), bt = D / nb;
    let k = 0, bi = 0;
    while (k < nb) { const len = Math.min(4, nb - k); bars.push({ sec: c.name, i: bi, t: c.at + k * bt, beat: bt, beats: len, last: false }); k += len; bi++; }
    bars[bars.length - 1].last = true;
  });
  bars.forEach((b, j) => { b.next = bars[j + 1] ? bars[j + 1].sec : 'end'; b.nb = bars.filter((x) => x.sec === b.sec).length; });
  return { bars, end: endCue.at, total };
}
function chordFor(b) {
  if (b.next === 'end' && b.i >= b.nb - 2) return b.i === b.nb - 1 ? 'A' : 'G'; // cadence into the final D
  if (b.beats < 4 && b.i > 0) return PROG[b.sec][(b.i - 1) % PROG[b.sec].length];
  return PROG[b.sec][b.i % PROG[b.sec].length];
}
const at = (b, beat) => b.t + beat * b.beat;

// Candidates. Each: tempo, buses and a bar player. Energy rises by section: problem < lift/main < develop < free.
const ENERGY = { problem: 0.35, lift: 0.62, main: 0.62, develop: 0.72, free: 0.86, warm: 0.6 };
export const CANDIDATES = {
  A: { name: 'Uplifting modern technology', bpm: 112, delay: 0.75, room: 0.78 },
  B: { name: 'Warm acoustic-electronic', bpm: 96, delay: 0.75, room: 0.8 },
  C: { name: 'Bright cinematic minimalism', bpm: 84, delay: 1, room: 0.86 },
};

function setup(mx, id) {
  // Levels are the RMS of each instrument while it plays: the rhythm bed and the melody lead, the pad sits behind,
  // the bass is light, percussion lighter still.
  if (id === 'A') {
    mx.bus('arp', { verb: 0.18, delay: 0.22, level: -24, hp: 180 }); mx.bus('pad', { verb: 0.3, level: -30, hp: 200 });
    mx.bus('mel', { verb: 0.3, delay: 0.18, level: -25 }); mx.bus('bass', { verb: 0, level: -28, lp: 900 });
    mx.bus('drums', { verb: 0.08, level: -34, hp: 50 }); mx.bus('fx', { verb: 0.4, level: -38, hp: 300 }); mx.bus('keys', { verb: 0.3, level: -31 });
  } else if (id === 'B') {
    mx.bus('gtr', { verb: 0.22, delay: 0.08, level: -24, hp: 90 }); mx.bus('pad', { verb: 0.3, level: -31, hp: 200, lp: 5000 });
    mx.bus('mel', { verb: 0.32, delay: 0.1, level: -24 }); mx.bus('bass', { verb: 0.02, level: -28, lp: 1200 });
    mx.bus('drums', { verb: 0.1, level: -34 }); mx.bus('fx', { verb: 0.4, level: -38, hp: 300 }); mx.bus('mallet', { verb: 0.3, delay: 0.15, level: -31 });
  } else {
    mx.bus('ost', { verb: 0.32, level: -24, hp: 120 }); mx.bus('pad', { verb: 0.45, level: -29, hp: 220, lp: 6000 });
    mx.bus('mel', { verb: 0.45, delay: 0.12, level: -25 }); mx.bus('low', { verb: 0.3, level: -30, hp: 60 });
    mx.bus('fx', { verb: 0.5, level: -37, hp: 300 }); mx.bus('drums', { verb: 0.15, level: -34 });
  }
}

function melody(mx, busName, b, notes, inst, vel = 0.6, octave = 0) {
  for (const [bt, len, m] of notes) {
    const t = at(b, bt), d = len * b.beat;
    mx.add(busName, t, inst(midi(m + octave), d, vel), { pan: 0.08 });
  }
}

function playBar(mx, id, b, r, film) {
  const ch = CH[chordFor(b)], e = ENERGY[b.sec] ?? 0.6, B = b.beats, P = b.sec;
  const barDur = B * b.beat;
  const phraseBar = (n) => b.i % 4 === n; // position in a four-bar phrase
  // Pads: every section, thin in the problem section.
  const padNotes = P === 'problem' ? ch.pad.slice(1, 3) : ch.pad;
  mx.addStereo('pad', b.t, pad(padNotes, barDur + 0.15, { attack: P === 'problem' ? 1.4 : 0.6, release: 1.4, bright: id === 'C' ? 0.6 : id === 'A' ? 0.55 : 0.35, seed: b.i + 3 }), 0.55 + 0.35 * e);
  // Melody plan: fragment in the problem section, the phrase at the lift (from its second bar), the free lift and the
  // warm close; a counter-line in the develop section. Never every bar, so it does not loop.
  const mel = (notes, vel, oct = 0) => {
    if (id === 'A') melody(mx, 'mel', b, notes, (f, d, v) => mallet(f, v, { kind: 'bell', decay: 1.2 }), vel, oct);
    else if (id === 'B') melody(mx, 'mel', b, notes, (f, d, v) => piano(f, d, v, { felt: 0.75 }), vel, oct - 12);
    else melody(mx, 'mel', b, notes, (f, d, v) => mallet(f, v, { kind: 'vibes', trem: 0.22 }), vel, oct - 12);
  };
  const phraseStart = { lift: 1, free: 0, warm: 0 }[P];
  if (P === 'problem' && (b.i === 2 || b.i === 6)) mel(FRAGMENT, 0.42, b.i === 6 ? -5 : 0);
  if (phraseStart != null && b.i >= phraseStart && b.i < phraseStart + 4 && B === 4) mel(PHRASE.filter(([bt]) => bt >= (b.i - phraseStart) * 4 && bt < (b.i - phraseStart + 1) * 4).map(([bt, l, m]) => [bt - (b.i - phraseStart) * 4, l, m]), P === 'free' ? 0.7 : 0.55);
  if (P === 'develop' && (b.i === 4 || b.i === 5) && B === 4) mel(COUNTER.filter(([bt]) => bt >= (b.i - 4) * 4 && bt < (b.i - 3) * 4).map(([bt, l, m]) => [bt - (b.i - 4) * 4, l, m]), 0.45);

  if (id === 'A') {
    // Synth arpeggio: eighths in the problem section (dull), sixteenths after the lift (brighter).
    const sub = P === 'problem' ? 2 : 4, pat = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 3, 1, 3, 2, 1];
    for (let k = 0; k < B * sub; k++) {
      const idx = pat[(k + (b.i % 2) * 4) % pat.length], m = ch.arp[idx] + (P === 'free' && k % 4 === 2 ? 12 : 0);
      const v = (k % sub === 0 ? 0.75 : 0.5) * (0.6 + 0.5 * e);
      mx.add('arp', at(b, k / sub), synthPluck(midi(m), v, { decay: P === 'problem' ? 0.35 : 0.5, bright: P === 'problem' ? 0.25 : 0.4 + 0.4 * e }), { pan: Math.sin(k * 1.3) * 0.35 });
    }
    if (P !== 'problem') {
      const bp = [1, 0, 1, 1, 0, 1, 1, 0];
      for (let k = 0; k < B * 2; k++) if (bp[k % 8]) mx.add('bass', at(b, k / 2), bass(midi(ch.bass + (k % 4 === 3 ? 12 : 0)), b.beat * 0.38, 0.55 + 0.3 * e));
      for (let k = 0; k < B; k++) {
        if (k % 2 === 0 && P !== 'warm') mx.add('drums', at(b, k), kick(0.45 + 0.2 * e));
        if ((P === 'develop' || P === 'free') && k % 2 === 1) mx.add('drums', at(b, k), clap(0.32 + 0.1 * e), { pan: 0.05 });
        for (const h of [0, 0.5]) mx.add('drums', at(b, k + h), shaker(h ? 0.5 : 0.3, b.i * 8 + k), { pan: 0.25 });
      }
    }
    if (P === 'free' && phraseBar(0)) mx.add('keys', b.t, mallet(midi(86), 0.4, { kind: 'bell' }), { pan: -0.3 });
  } else if (id === 'B') {
    // Fingerpicked guitar: thumb on the bass string, fingers on the upper strings; slight swing on the off-beats.
    const sw = 0.06;
    const fing = P === 'problem' ? [[0, 0], [1, 3], [2, 2], [3, 4]] : [[0, 0], [0.5, 2], [1, 3], [1.5, 4], [2, 1], [2.5, 3], [3, 2], [3.5, 4]];
    for (const [bt, s] of fing) {
      if (bt >= B) continue;
      const off = bt % 1 ? sw : 0, m = ch.gtr[s] + (P === 'free' && s === 4 ? 12 : 0);
      mx.add('gtr', at(b, bt + off), pluck(midi(m), (s === 0 ? 0.8 : 0.55) * (0.65 + 0.4 * e), { bright: 0.42, decay: 2.4, seed: b.i * 11 + s }), { pan: (s - 2) * 0.16 });
    }
    if (P !== 'problem') {
      for (const [bt, iv] of [[0, 0], [2, 7], [3.5, 0]]) if (bt < B) mx.add('bass', at(b, bt + (bt % 1 ? sw : 0)), pluck(midi(ch.bass + iv), 0.75, { bright: 0.22, decay: 0.9, len: 0.7, seed: 5 }));
      // Shaker sixteenths (accented off-beats), a wooden tap on 2 and 4 from the develop section, a soft kick at the lift.
      for (let k = 0; k < B * 4; k++) { const q = k % 4; const v = [0.18, 0.12, 0.34, 0.14][q] * (0.7 + 0.5 * e); mx.add('drums', at(b, k / 4 + (q % 2 ? sw * 0.5 : 0)), shaker(v, b.i * 16 + k), { pan: 0.3 }); }
      if (P !== 'lift' && P !== 'warm') for (const k of [1, 3]) if (k < B) mx.add('drums', at(b, k), tap(0.32 + 0.1 * e, k), { pan: -0.1 });
      if (P === 'free' || P === 'develop') for (const k of [0, 2]) if (k < B) mx.add('drums', at(b, k), kick(0.32));
    }
    if ((P === 'free' || P === 'lift') && phraseBar(0) && B === 4) [0, 0.5, 1].forEach((bt, j) => mx.add('mallet', at(b, 2.5 + bt), mallet(midi([86, 88, 93][j]), 0.35, { kind: 'marimba' }), { pan: 0.4 }));
  } else {
    // Minimalist piano ostinato (eighths, varying by section), piano bass on the downbeat, a pulse of short string
    // notes in the develop section; soft swells into the lifts. No drums.
    const pats = { problem: [0, 2, 1, 3, 0, 2, 1, 3], lift: [0, 2, 4, 2, 1, 3, 4, 3], main: [0, 3, 1, 4, 0, 3, 2, 4], develop: [1, 3, 4, 3, 0, 3, 4, 2], free: [0, 2, 4, 3, 1, 4, 2, 4], warm: [0, 2, 1, 3, 0, 2, 4, 3] };
    const pat = pats[P] || pats.main;
    for (let k = 0; k < B * 2; k++) {
      const m = ch.arp[pat[k % 8]] + (P === 'free' && k % 8 === 6 ? 12 : 0);
      mx.add('ost', at(b, k / 2), piano(midi(m), b.beat * 0.9, (k % 2 ? 0.42 : 0.55) * (0.6 + 0.5 * e), { felt: 0.45, ring: 0.6 }), { pan: ((k % 4) - 1.5) * 0.12 });
    }
    if (P !== 'problem') mx.add('low', b.t, piano(midi(ch.bass + 12), barDur, 0.5, { felt: 0.6, ring: 0.5 }));
    if (P === 'develop' || P === 'free') for (let k = 0; k < B * 2; k++) mx.add('pad', at(b, k / 2), synthPluck(midi(ch.pad[k % 2 ? 2 : 1]), 0.35, { decay: 0.3, bright: 0.2 }), { pan: k % 2 ? 0.3 : -0.3 });
  }
}

// Compose one film's music for a candidate. cues/total from src/v4/plans.js. Returns [L, R].
export function compose(id, { cues, total }, { film = 'flagship' } = {}) {
  const cand = CANDIDATES[id], g = grid(cues, total, cand.bpm), r = rng(17);
  const mx = new Mixer(total + 0.2); setup(mx, id);
  for (const b of g.bars) playBar(mx, id, b, r, film);
  // Gentle rises into the lifts (ending on the cue), quiet.
  for (const c of cues) if (c.name === 'lift' || c.name === 'free') { const d = Math.min(1.8, c.at - 0.2); if (d > 0.6) mx.add('fx', c.at - d, riser(d, id === 'C' ? 0.5 : 0.4, Math.round(c.at))); }
  // The resolution: the home chord as the closing logo settles, left to ring and fade with the picture.
  // The final chord follows the logo's settle by 0.12 s with a soft pad attack, so the logo sound is heard first and the
  // music resolves beneath it (no ducking).
  const endT = g.end + 0.12, ringDur = Math.max(1.5, total - endT);
  const fin = CH.D;
  mx.addStereo('pad', endT, pad([62, 66, 69, 74, 76], ringDur, { attack: 0.45, release: 1.2, bright: 0.45, seed: 99 }), 0.9);
  if (id === 'A') { fin.arp.forEach((m, j) => mx.add('arp', endT + j * 0.06, synthPluck(midi(m), 0.6, { decay: 1.6, bright: 0.5 }), { pan: (j - 2) * 0.15 })); mx.add('bass', endT, bass(midi(38), 0.9, 0.7)); }
  else if (id === 'B') { fin.gtr.forEach((m, j) => mx.add('gtr', endT + j * 0.045, pluck(midi(m), 0.75, { bright: 0.42, decay: 3.2, seed: 70 + j }), { pan: (j - 2) * 0.16 })); mx.add('bass', endT, pluck(midi(38), 0.8, { bright: 0.2, decay: 1.4, seed: 5 })); }
  else { [50, 57, 62, 66, 69, 74].forEach((m, j) => mx.add('ost', endT + j * 0.03, piano(midi(m), ringDur, 0.5, { felt: 0.5 }), { pan: (j - 2.5) * 0.1 })); }
  const [L, R] = mx.render({ room: cand.room, delayTime: cand.delay * 60 / cand.bpm });
  // Fade in over the first half-second and out over the last 1.6 s, so the music ends naturally with the picture.
  const n = L.length, fi = Math.round(0.5 * RATE), fo = Math.round(1.6 * RATE);
  for (let i = 0; i < fi && i < n; i++) { const k = i / fi; L[i] *= k; R[i] *= k; }
  for (let i = 0; i < fo; i++) { const k = (i / fo) ** 1.5, j = n - 1 - i; L[j] *= k; R[j] *= k; }
  return [L, R];
}
