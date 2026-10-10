// Caption cues: one sentence per cue where it fits (two lines of about `max` characters); longer sentences split at
// commas, then between words. Timed by share of characters. Shared by src/v2/kit2.jsx and scripts/captions-v2.mjs.
export function splitCues(text, max = 42) {
  const limit = max * 2;
  const out = [];
  const sentences = text.match(/[^.?!]+[.?!]*/g).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (s.length <= limit) { out.push(s); continue; }
    let cur = '';
    for (const part of s.split(/(?<=,)\s+/)) {
      const next = cur ? `${cur} ${part}` : part;
      if (next.length <= limit) { cur = next; continue; }
      if (cur) out.push(cur);
      if (part.length <= limit) { cur = part; continue; }
      let w = '';
      for (const word of part.split(' ')) { const n = w ? `${w} ${word}` : word; if (n.length > limit) { out.push(w); w = word; } else w = n; }
      cur = w;
    }
    if (cur) out.push(cur);
  }
  return out;
}
// Two balanced lines, preferring a break after a comma near the middle.
export function wrapAt(s, max = 42) {
  if (s.length <= max) return [s];
  const mid = s.length / 2; let best = -1, score = Infinity;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ') { const sc = Math.abs(i - mid) - (s[i - 1] === ',' ? 8 : 0); if (sc < score) { score = sc; best = i; } }
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}
