// Closing tagline audition 2: chooses at most three finalists from tts-lab/takes/v4/tagline-a2 on stated technical
// grounds (listening decides; this only narrows 24 natural takes to three worth hearing). Inputs: the transcripts
// (scripts/hear.mjs) and the measurements (tts-lab/tagline_analyse.py) saved as JSON lines.
// Must pass:
//   - heard as exactly "Wavelength. Tune in. Gain clarity." (whisper; "Game" or "Wave length" fail);
//   - three phrases ("Wavelength", "Tune in", "Gain clarity") with two natural pauses (0.35 to 1.0 s);
//   - "Gain clarity" is not merely lower: its median pitch at least 1 semitone below "Tune in" is the most allowed,
//     and its tone is brighter (higher spectral centroid) than "Tune in";
//   - "Gain clarity" resolves gently: its pitch settles by 1.5 to 7 semitones (not flat, not a steep drop);
//   - no announcer push: "Gain clarity" no more than 2.5 dB louder than "Tune in".
// Ranked by: brighter and warmer "Gain clarity" relative to "Tune in" (centroid and pitch), then a pause after "Tune in"
// close to 0.65 s. At most one finalist per (reference, punctuation) pair, for variety.
//   node scripts/select-tagline-a2.mjs <transcripts.txt> <measures.jsonl>
import fs from 'node:fs';

const [, , tFile, mFile] = process.argv;
const heard = Object.fromEntries(fs.readFileSync(tFile, 'utf8').split('\n').filter((l) => l.includes('.wav:')).map((l) => { const i = l.indexOf('.wav:'); return [l.slice(0, i + 4).trim(), l.slice(i + 5).trim()]; }));
const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const st = (a, b) => 12 * Math.log2(a / b);
const rows = [];
for (const line of fs.readFileSync(mFile, 'utf8').split('\n').filter((l) => l.startsWith('{'))) {
  const m = JSON.parse(line), id = m.file.split(/[\\/]/).pop();
  const r = { id, heard: heard[id] || '', fails: [] };
  if (norm(r.heard) !== 'wavelength tune in gain clarity') r.fails.push(`heard "${r.heard}"`);
  if (m.phrases.length !== 3) r.fails.push(`${m.phrases.length} phrases`);
  else {
    const [, ti, gc] = m.phrases, [p1, p2] = m.pauses;
    Object.assign(r, { pauseAfterWavelength: p1, pauseAfterTuneIn: p2, tuneInHz: ti.f0MedianHz, gainClarityHz: gc.f0MedianHz, gcVsTiSemitones: +st(gc.f0MedianHz, ti.f0MedianHz).toFixed(2), gcSettleSemitones: gc.pitchMoveSemitones, brightnessHz: gc.centroidHz - ti.centroidHz, gcVsTiDb: +(gc.levelDb - ti.levelDb).toFixed(1), seconds: m.seconds });
    if (!(p1 >= 0.35 && p1 <= 1.0 && p2 >= 0.35 && p2 <= 1.0)) r.fails.push('pauses');
    if (r.gcVsTiSemitones < -1) r.fails.push('"Gain clarity" lower');
    if (r.brightnessHz <= 0) r.fails.push('not brighter');
    if (!(gc.pitchMoveSemitones <= -1.5 && gc.pitchMoveSemitones >= -7)) r.fails.push('settle');
    if (r.gcVsTiDb > 2.5) r.fails.push('pushed');
    r.score = +(r.brightnessHz / 100 + r.gcVsTiSemitones - Math.abs(p2 - 0.65) * 4).toFixed(2);
  }
  rows.push(r);
}
const pass = rows.filter((r) => !r.fails.length).sort((a, b) => b.score - a.score);
const seen = new Set(), finalists = [];
for (const r of pass) { const k = r.id.split('-').slice(0, 2).join('-'); if (seen.has(k)) continue; seen.add(k); finalists.push(r); if (finalists.length === 3) break; }
console.log(JSON.stringify({ takes: rows.length, passed: pass.length, finalists, rejected: rows.filter((r) => r.fails.length).map((r) => ({ id: r.id, fails: r.fails })) }, null, 1));
