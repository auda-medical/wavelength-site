// The final version 4 review page: wavelength-video-output\final-v4\index.html. One simple page for the owner: the two
// narration corrections as short before/after extracts (in the mix, on headphones and as a phone speaker would play
// them), every rendered film with its caption files, the checks, and an approval form whose answers stay in the browser
// (copied as text; nothing is sent). Not publication: owner viewing, listening and FAMUS/FUSIC pronunciation approval.
//   node scripts/final-page-a3.mjs     (after final-a3.mjs mix, render-v4.mjs into final-v4, captions-v4.mjs, qa)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { timeline4 } from '../src/v4/plans.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'final-v4');
const LAB = path.resolve(ROOT, '..', '..', 'tts-lab', 'takes', 'v4', 'final-a3');
const X = path.join(OUT, 'extracts');
fs.mkdirSync(X, { recursive: true });
const PUB = (p) => path.join(ROOT, 'public', p);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const q = (s) => (process.platform === 'win32' ? `"${s}"` : s);
const ff = (a) => execFileSync(npx, ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...a], { shell: process.platform === 'win32', cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
// A cut of a mix as AAC, plus the same cut as a phone speaker plays it (mono; nothing below 350 Hz or above 7 kHz:
// two 2nd-order high-passes and two low-passes). Remotion's ffmpeg has no audio filters, so cutting, fades and the
// phone filter are done here and ffmpeg only encodes.
function readWav(file) {
  const b = fs.readFileSync(file); let o = 12, rate = 48000, ch = 2, bits = 16, fmt = 1, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') { fmt = b.readUInt16LE(o + 8); ch = b.readUInt16LE(o + 10); rate = b.readUInt32LE(o + 12); bits = b.readUInt16LE(o + 22); } if (id === 'data') { data = b.subarray(o + 8, o + 8 + sz); break; } o += 8 + sz + (sz & 1); }
  const n = data.length / (bits / 8) / ch, chans = Array.from({ length: ch }, () => new Float32Array(n));
  for (let k = 0; k < n; k++) for (let c = 0; c < ch; c++) { const p = (k * ch + c) * (bits / 8); chans[c][k] = fmt === 3 ? data.readFloatLE(p) : bits === 16 ? data.readInt16LE(p) / 32768 : bits === 24 ? data.readIntLE(p, 3) / 8388608 : data.readInt32LE(p) / 2147483648; }
  return { rate, chans };
}
function writeWav(file, chans, rate) {
  const ch = chans.length, n = chans[0].length, buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let k = 0; k < n; k++) for (let c = 0; c < ch; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[c][k])) * 32767), 44 + (k * ch + c) * 2);
  fs.writeFileSync(file, buf);
}
function biquad(x, rate, type, f0, Q = Math.SQRT1_2) {
  const w = 2 * Math.PI * f0 / rate, a = Math.sin(w) / (2 * Q), cw = Math.cos(w);
  const [b0, b1, b2] = type === 'hp' ? [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2] : [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
  const a0 = 1 + a, a1 = -2 * cw, a2 = 1 - a, y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let k = 0; k < x.length; k++) { const v = (b0 * x[k] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[k]; y2 = y1; y1 = v; y[k] = v; }
  return y;
}
const TMP = path.join(X, '_tmp.wav');
function encode(chans, rate, out, kbps) { writeWav(TMP, chans, rate); ff(['-i', q(TMP), '-c:a', 'aac', '-b:a', kbps, '-f', 'mp4', q(out)]); fs.rmSync(TMP); }
function cut(src, start, dur, name) {
  const { rate, chans } = readWav(src);
  const a = Math.max(0, Math.round(start * rate)), n = Math.min(Math.round(dur * rate), chans[0].length - a);
  const fi = Math.round(0.15 * rate), fo = Math.round(0.3 * rate);
  const seg = chans.map((c) => { const y = Float32Array.from(c.subarray(a, a + n)); for (let k = 0; k < fi; k++) y[k] *= k / fi; for (let k = 0; k < fo; k++) y[n - 1 - k] *= k / fo; return y; });
  encode(seg, rate, path.join(X, `${name}.m4a`), '256k');
  let mono = seg.length > 1 ? seg[0].map((v, k) => 0.5 * (v + seg[1][k])) : seg[0];
  for (const [ty, fq] of [['hp', 350], ['hp', 350], ['lp', 7000], ['lp', 7000]]) mono = biquad(mono, rate, ty, fq);
  encode([mono], rate, path.join(X, `${name}-phone.m4a`), '192k');
}
const T = J(PUB('audio-v4/timings.json')), S = J(path.join(ROOT, 'src/v4/script.json'));
const tl = timeline4('flagship', T, S);
const wait = tl.byScene.wait;
const before = PUB('audio-v4/mix/final-a3-before/flagship.wav'), after = PUB('audio-v4/mix/final-a3/flagship.wav');
const adBefore = PUB('audio-v4/mix/final-a3-before/ad.wav'), adAfter = PUB('audio-v4/mix/final-a3/ad.wav');
const dur = (f) => { const b = fs.readFileSync(f); let o = 12; while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') var rate = b.readUInt32LE(o + 12), ch = b.readUInt16LE(o + 10), bits = b.readUInt16LE(o + 22); if (id === 'data') return sz / (rate * ch * bits / 8); o += 8 + sz + (sz & 1); } return 0; };
// The opening correction: the problem scene ("+ 7 days"), the same 10 s window in both (the scenes before it are unchanged).
cut(before, wait.from / 30, 10, 'opening-before'); cut(after, wait.from / 30, 10, 'opening-after');
// The closing correction: the last 8 s of the flagship and of the Tailored Training advert.
cut(before, dur(before) - 8, 8, 'closing-before'); cut(after, dur(after) - 8, 8, 'closing-after');
cut(adBefore, dur(adBefore) - 8, 8, 'ad-closing-before'); cut(adAfter, dur(adAfter) - 8, 8, 'ad-closing-after');
// The voice alone, for close listening; and the runner-up closing take.
for (const [src, name] of [[PUB('audio-v4/raw/_before-a3/flagship-f03.wav'), 'voice-opening-before'], [path.join(LAB, 'opening/calm-plain-0.wav'), 'voice-opening-after'], [PUB('audio-v4/tagline-a2/T2.wav'), 'voice-closing-before'], [PUB('audio-v4/tagline-a3/F.wav'), 'voice-closing-after'], [path.join(LAB, 'closing-more/full-held-6.wav'), 'voice-closing-alternative']]) {
  const w = readWav(src); encode(w.chans, w.rate, path.join(X, `${name}.m4a`), '192k');
}

const sel = J(path.join(OUT, 'selection-a3.json'));
const mixes = J(PUB('audio-v4/mix/final-a3/report-final-a3.json'));
const renders = J(path.join(OUT, 'render-report.json'));
const qa = fs.existsSync(path.join(OUT, 'qa-a3.json')) ? J(path.join(OUT, 'qa-a3.json')) : null;
const FILMS = [
  ['Flagship film', 'wavelength-flagship-film-v4', ['1080p', 'captioned-1080p']],
  ['Free logbook (short)', 'wavelength-free-logbook-short-v4', ['1080p', 'captioned-1080p', 'vertical-1080x1920', 'vertical-captioned-1080x1920']],
  ['Tailored Training (advert)', 'wavelength-tailored-training-ad-v4', ['1080p', 'captioned-1080p', 'vertical-1080x1920', 'vertical-captioned-1080x1920']],
];
const LABEL = { '1080p': 'Landscape', 'captioned-1080p': 'Landscape, captions burned in', 'vertical-1080x1920': 'Vertical', 'vertical-captioned-1080x1920': 'Vertical, captions burned in' };
const r = (f) => renders.find((x) => x.file === f) || {};
const mb = (f) => (fs.existsSync(path.join(OUT, f)) ? `${(fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(1)} MB` : 'missing');
const au = (f, label, note = '') => `<figure><figcaption><b>${esc(label)}</b>${note ? `<br><span class="muted">${esc(note)}</span>` : ''}</figcaption><audio controls preload="none" src="extracts/${f}.m4a"></audio></figure>`;
const pair = (name, label) => `<div class="grid">${au(`${name}-before`, `Before: ${label}`, 'Headphones')}${au(`${name}-after`, `After: ${label}`, 'Headphones')}${au(`${name}-before-phone`, `Before: ${label}`, 'As a phone speaker plays it')}${au(`${name}-after-phone`, `After: ${label}`, 'As a phone speaker plays it')}</div>`;
const vid = (f, label) => { const x = r(f); const cap = f.replace(/-(captioned-)?(vertical-)?(captioned-)?(1080p|1080x1920)\.mp4$/, ''); const track = /captioned/.test(f) ? '' : `<track kind="captions" srclang="en" label="English" src="captions/${cap}.en.vtt">`; return `<figure class="${/vertical/.test(f) ? 'tall' : ''}"><figcaption><b>${esc(label)}</b><br><span class="muted">${x.seconds ? `${x.seconds} s · ${x.lufs} LUFS · true peak ${x.truePeakDBTP} dBTP · ` : ''}${mb(f)}</span></figcaption><video controls preload="metadata" playsinline src="${esc(f)}">${track}</video></figure>`; };
const o = sel.opening, c = sel.closing;
const row = (k, a, b, better) => `<tr><td>${esc(k)}</td><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(better)}</td></tr>`;
const qaRows = qa ? qa.map((x) => `<tr><td>${esc(x.check)}</td><td>${x.ok ? '✓' : '✗'}</td><td>${esc(x.detail)}</td></tr>`).join('') : '';
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wavelength films: version 4 final review</title>
<style>
:root{--navy:#0F1E33;--teal:#2A7F8A;--cream:#F7F5F0;--sand:#EDEAE3}
body{margin:0;background:var(--cream);color:var(--navy);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 64px}h1{font-size:30px;margin:8px 0}h2{margin:40px 0 8px;border-top:2px solid var(--sand);padding-top:24px}
.muted{color:#4b5563}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}figure{margin:0;background:#fff;border:1px solid var(--sand);border-radius:12px;padding:12px;min-width:0}
figure.tall video{max-height:640px;width:auto;max-width:100%;display:block;margin:8px auto 0}
video{width:100%;border-radius:8px;margin-top:8px;background:#000}audio{width:100%;margin-top:8px}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;background:#fff}th,td{border:1px solid var(--sand);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--sand)}
fieldset{border:1px solid var(--sand);border-radius:12px;background:#fff;margin:12px 0;padding:12px}label{display:block;margin:4px 0}textarea{width:100%;min-height:70px;box-sizing:border-box}
button{background:var(--navy);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:15px;cursor:pointer}.note{background:#fff;border-left:4px solid var(--teal);padding:10px 14px;border-radius:6px}
</style></head><body><main>
<p class="muted">Wavelength films, version 4. Final renders for your approval, ${esc(sel.date)}. Private review page: nothing here is published, uploaded or sent.</p>
<h1>Version 4: the final films</h1>
<p class="note">As you chose: music <b>Candidate A</b>, logo sound <b>L2</b> (balanced lingering second tone), closing <b>Take 2</b> with its small adjustment, the narration <b>2 dB lower</b> than before, and a <b>calmer opening line</b>. Listen on headphones and on your phone speaker. Publication still needs your viewing and listening approval and the FAMUS/FUSIC pronunciation check.</p>

<h2>1. The two narration corrections</h2>
<h3>The opening line: "And before you know it, another week has passed. Your scans shouldn't be forgotten…"</h3>
<p>A new natural performance in voice 4, the same words (no pitch shifting, time-stretching, EQ or extra level change: it sits at the same 2 dB lower presentation as every line). Chosen from 16 takes for the calmest delivery that keeps concern without urgency.</p>
${pair('opening', 'the problem scene (+ 7 days)')}
<div class="grid">${au('voice-opening-before', 'Before: the voice alone')}${au('voice-opening-after', 'After: the voice alone')}</div>
<div class="tbl"><table><tr><th>Measured (supports listening, never replaces it)</th><th>Before</th><th>After</th><th>Means</th></tr>
${row('Loudest moment above the speech average', `${o.before.peakDb} dB`, `${o.after.peakDb} dB`, 'Lower: no shouted word')}
${row('Stressed syllables above the average (95th percentile)', `${o.before.punchDb} dB`, `${o.after.punchDb} dB`, 'Lower: fewer hammered stresses')}
${row('Pitch range (spread)', `${o.before.pitchSpreadSt} semitones`, `${o.after.pitchSpreadSt} semitones`, 'Similar: still natural, not flat')}
${row('Tone (spectral centre)', `${o.before.centroidHz} Hz`, `${o.after.centroidHz} Hz`, 'Lower: mellower, from the performance, not EQ')}
${row('Median pitch', `${o.before.f0MedianHz} Hz`, `${o.after.f0MedianHz} Hz`, 'Lower: a more relaxed register')}
${row('Heard by the transcriber', o.heardBefore, o.heardAfter, '"rotors" is the transcriber mishearing "rotas" in both')}
</table></div>
<h3>The closing line: "Wavelength. Tune in. Gain clarity."</h3>
<p>Take 2's warm, steady character, generated afresh with "Gain" held very slightly and a tiny natural separation before "clarity". Chosen from 28 takes; most attempts at the hold came apart into "Gain. Clarity." as two separate words, which the brief rules out. The transcriber hears <b>Gain</b>, not Game.</p>
${pair('closing', 'the flagship ending')}
${pair('ad-closing', 'the advert ending')}
<div class="grid">${au('voice-closing-before', 'Before: Take 2, the voice alone')}${au('voice-closing-after', 'After: the adjusted take, the voice alone')}${au('voice-closing-alternative', 'For comparison only: the runner-up', 'A shorter hold, more settling, and quieter at the end')}</div>
<div class="tbl"><table><tr><th>Measured</th><th>Take 2 (before)</th><th>Adjusted (after)</th><th>Means</th></tr>
${row('"Gain" held (from the start of "Gain clarity" to the joint)', `${c.before.gainHeldS} s`, `${c.after.gainHeldS} s`, 'Held a little longer')}
${row('Separation before "clarity"', `${c.before.dipS} s`, `${c.after.dipS} s`, 'A tiny natural gap, still one phrase')}
${row('Pause after "Tune in"', `${c.before.pauseAfterTuneIn} s`, `${c.after.pauseAfterTuneIn} s`, 'The calm pause you liked, kept')}
${row('"Gain clarity" pitch compared with "Tune in"', `${c.before.gcVsTiSt} semitones`, `${c.after.gcVsTiSt} semitones`, 'Deeper: the step into understanding')}
${row('Pitch movement inside "Gain clarity"', `${c.before.gcSpreadSt} semitones`, `${c.after.gcSpreadSt} semitones`, 'A little less than Take 2: steadier, not sing-song (the brief allowed a little more; tell us if you want the runner-up)')}
${row('Settle at the end of "clarity"', `${c.before.settleSt} semitones`, `${c.after.settleSt} semitones`, 'Gentler than Take 2: it still settles (never rises), more quietly')}
${row('Heard by the transcriber', c.heardBefore, c.heardAfter, 'Gain, not Game')}
</table></div>

<h2>2. The films</h2>
<p class="muted">Caption files (SRT and WebVTT) for every film are in <code>captions\\</code>; the landscape and vertical players below use them. Burned-in versions are listed separately.</p>
${FILMS.map(([title, base, kinds]) => `<h3>${esc(title)}</h3><div class="grid">${kinds.map((k) => vid(`${base}-${k}.mp4`, LABEL[k])).join('')}</div>`).join('')}

<h2>3. Checks</h2>
<div class="tbl"><table><tr><th>Soundtrack</th><th>Voice change</th><th>Loudness</th><th>True peak</th><th>Speech above music</th></tr>${Object.entries(mixes).map(([f, m]) => `<tr><td>${esc(f)}</td><td>${m.voiceChangeDb} dB</td><td>${m.final.integratedLUFS} LUFS</td><td>${m.final.truePeakDBTP} dBTP</td><td>${m.final.speechToMusicDb} dB</td></tr>`).join('')}</table></div>
${qaRows ? `<div class="tbl" style="margin-top:12px"><table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${qaRows}</table></div>` : ''}

<h2>4. Your approval</h2>
<form id="choice">
<fieldset><legend><b>The opening line</b></legend><label><input type="radio" name="opening" value="approved"> Calmer: approved</label><label><input type="radio" name="opening" value="again"> Still too strong (say how in the notes)</label></fieldset>
<fieldset><legend><b>The closing line</b></legend><label><input type="radio" name="closing" value="approved"> Adjusted take: approved</label><label><input type="radio" name="closing" value="runner-up"> Prefer the runner-up</label><label><input type="radio" name="closing" value="take2"> Keep Take 2 unchanged</label></fieldset>
<fieldset><legend><b>The films</b></legend><label><input type="radio" name="films" value="approved"> Approved for publication once pronunciation is confirmed</label><label><input type="radio" name="films" value="changes"> Changes needed (notes)</label></fieldset>
<fieldset><legend><b>FAMUS/FUSIC pronunciation</b></legend><label><input type="radio" name="pron" value="confirmed"> Confirmed (no acronyms are spoken in these films)</label><label><input type="radio" name="pron" value="check"> To check</label></fieldset>
<fieldset><legend><b>Notes</b></legend><textarea id="notes" placeholder="Anything you heard on headphones or the phone speaker"></textarea></fieldset>
<button type="button" id="copy">Copy my answers</button> <span id="done" class="muted"></span>
</form>
<p class="muted">Your answers stay in this browser. "Copy my answers" puts them on your clipboard to paste into ChatGPT or a message to Claude.</p>
</main><script>
(function(){var f=document.getElementById('choice'),k='wl-final-v4',N=['opening','closing','films','pron'];try{var s=JSON.parse(localStorage.getItem(k)||'{}');N.forEach(function(n){var e=f.querySelector('[name="'+n+'"][value="'+s[n]+'"]');if(e)e.checked=true;});if(s.notes)document.getElementById('notes').value=s.notes;}catch(e){}
function val(n){var e=f.querySelector('[name="'+n+'"]:checked');return e?e.value:'';}
function save(){try{var o={notes:document.getElementById('notes').value};N.forEach(function(n){o[n]=val(n);});localStorage.setItem(k,JSON.stringify(o));}catch(e){}}
f.addEventListener('change',save);document.getElementById('notes').addEventListener('input',save);
document.getElementById('copy').addEventListener('click',function(){var t='Wavelength films, version 4 final review: opening '+(val('opening')||'-')+'; closing '+(val('closing')||'-')+'; films '+(val('films')||'-')+'; pronunciation '+(val('pron')||'-')+'. Notes: '+(document.getElementById('notes').value||'none');
if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){document.getElementById('done').textContent='Copied.';},function(){document.getElementById('done').textContent=t;});else document.getElementById('done').textContent=t;});})();
</script></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('page', path.join(OUT, 'index.html'));
