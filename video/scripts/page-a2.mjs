// Builds the audition 2 review page: wavelength-video-output\comparison-v4\audition-2\index.html, with the sounds and
// takes copied beside it (audio\). One simple page: three refined two-tone logo sounds with TN1 and MX as references,
// three new closing-line takes, one level comparison and three combined previews, each with a plain name, the
// measurements that matter, and a choice form whose answers stay in the browser (copied as text; nothing is sent).
//   node scripts/page-a2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'comparison-v4', 'audition-2');
const A = path.join(OUT, 'audio');
fs.mkdirSync(A, { recursive: true });
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4', p), 'utf8'));
const linger = J('linger/linger.json'), phone = J('linger/phone-check.json').results, integ = J('decay/integration-a2.json').results;
const mixes = J('linger/mixes-a2.json'), sel = J('linger/select-tagline-a2.json'), fin = J('raw/tagline-a2/finalists.json');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const [src, dst] of [['decay/TN1.wav', 'TN1.wav'], ['decay/MX.wav', 'MX.wav'], ['linger/L1.wav', 'L1.wav'], ['linger/L2.wav', 'L2.wav'], ['linger/L3.wav', 'L3.wav'], ['tagline-a2/T1.wav', 'T1.wav'], ['tagline-a2/T2.wav', 'T2.wav'], ['tagline-a2/T3.wav', 'T3.wav'], ['flagship/f13.wav', 'current-line.wav']]) {
  fs.copyFileSync(path.join(ROOT, 'public/audio-v4', src), path.join(A, dst));
}
const SOUNDS = [
  ['TN1', 'Reference: two-note, slightly longer (TN1)', 'The two-note you liked, from the last round.'],
  ['MX', 'Reference: one gliding tone (MX)', 'The single glide whose smooth fade you liked.'],
  ['L1', 'L1: two-note, second tone lingers (restrained)', 'Same two notes; the second rings a little longer and grows purer as it fades.'],
  ['L2', 'L2: two-note, second tone lingers (balanced)', 'Same two notes; the second clearly lingers, smoothly.'],
  ['L3', 'L3: two-note, second tone lingers (clearly lingering)', 'Same two notes; the longest, still one smooth fade. Its tail runs under the first spoken words.'],
];
const meas = (k) => (k.startsWith('L') ? linger[k] : linger[`ref_${k}`]);
const soundRows = SOUNDS.map(([k, name]) => {
  const m = meas(k), i = integ[k], ph = phone[k];
  return `<tr><td>${esc(name)}</td><td>${m.fallTo20dB} / ${m.fallTo40dB} / ${m.fallTo60dB}</td><td>${i.brandAboveMusicInBandFor} / ${i.endAboveMusicInBandFor}</td><td>${ph.brand.headphonesHeardFor} / ${ph.brand.phoneHeardFor}</td><td>${i.brandVoiceOverLogoTailDb} dB</td><td>${m.reRiseDb} dB</td></tr>`;
}).join('');
const take = (id) => sel.finalists.find((f) => f.id === fin.find((x) => x.id === id).src);
const takeRows = fin.map((t) => { const s = take(t.id); return `<tr><td>${esc(t.label)}</td><td>${esc(s.heard)}</td><td>${s.tuneInHz} Hz</td><td>${s.gainClarityHz} Hz (${s.gcVsTiSemitones > 0 ? '+' : ''}${s.gcVsTiSemitones} st)</td><td>+${s.brightnessHz} Hz</td><td>${s.gcSettleSemitones} st</td><td>${t.pauseAfterTuneIn} s${t.silenceAdded > 0.03 ? ` (silence lengthened to 0.65 s)` : ''}</td></tr>`; }).join('');
const lv = mixes['a2-lvl-T1-lower'];
const video = (f, label, note = '') => `<figure><figcaption><b>${esc(label)}</b>${note ? `<br><span class="muted">${esc(note)}</span>` : ''}</figcaption><video controls preload="metadata" playsinline src="${f}"></video></figure>`;
const audio = (f, label, note = '') => `<figure><figcaption><b>${esc(label)}</b>${note ? `<br><span class="muted">${esc(note)}</span>` : ''}</figcaption><audio controls preload="metadata" src="audio/${f}"></audio></figure>`;
const radio = (name, opts) => opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}"> ${esc(l)}</label>`).join('');
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wavelength films: audition 2</title>
<style>
:root{--navy:#0F1E33;--teal:#2A7F8A;--cream:#F7F5F0;--sand:#EDEAE3}
body{margin:0;background:var(--cream);color:var(--navy);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 64px}h1{font-size:30px;margin:8px 0}h2{margin:40px 0 8px;border-top:2px solid var(--sand);padding-top:24px}
.muted{color:#4b5563}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}figure{margin:0;background:#fff;border:1px solid var(--sand);border-radius:12px;padding:12px}
video{width:100%;border-radius:8px;margin-top:8px;background:#000}audio{width:100%;margin-top:8px}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;background:#fff}th,td{border:1px solid var(--sand);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--sand)}
fieldset{border:1px solid var(--sand);border-radius:12px;background:#fff;margin:12px 0;padding:12px}label{display:block;margin:4px 0}textarea{width:100%;min-height:70px;box-sizing:border-box}
button{background:var(--navy);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:15px;cursor:pointer}.note{background:#fff;border-left:4px solid var(--teal);padding:10px 14px;border-radius:6px}
</style></head><body><main>
<p class="muted">Wavelength films, version 4. Audition 2, 11 October 2026. Private review page: nothing here is published.</p>
<h1>One focused audition: the logo sound, the closing line and the voice level</h1>
<p class="note">Listen on <b>headphones</b> and on your <b>phone speaker</b>. Music Candidate A, the pictures, voice 4 and the silent website logo are unchanged. All narration in these previews is <b>2 dB quieter</b> than before (section 3 compares the two). Nothing is final until you choose; then the full films are rendered for your approval.</p>

<h2>1. The logo sound</h2>
<p>You liked the two-note movement but found the ending sharp. In L1 to L3 everything is the original two-note (both notes, their timbre and attack, the room) except the <b>second tone</b>: it rings longer and its brighter overtones fade first, so it grows purer as it fades, like MX. One smooth fade: no echo, no repeat, no second ping.</p>
<div class="grid">${SOUNDS.map(([k, n, d]) => audio(`${k}.wav`, n, d)).join('')}</div>
<h3>In the film (the end of the problem scene, the brand reveal with its first line, then the closing logo)</h3>
<div class="grid">${SOUNDS.map(([k, n]) => video(`wavelength-v4-logo-a2-${k}-1080p.mp4`, n)).join('')}</div>
<h3>Measured</h3>
<div class="tbl"><table><tr><th>Sound</th><th>Falls 20 / 40 / 60 dB (s after the peak)</th><th>Heard above the music at its pitch, brand / closing (s)</th><th>Heard above the whole music at the brand reveal: headphones / phone speaker (s)</th><th>Voice above the logo tail when speech starts</th><th>Rise after fading</th></tr>${soundRows}</table></div>
<p class="muted">L1 to L3 are genuinely longer in the film, not only on their own. MX is heard for less time than TN1: its smoothness is the glide, not length. With L3 the tail is still ringing about 22 dB under the first words; if you choose it, the narration after each logo would start about half a second later in the final films (the music would be re-timed to match).</p>

<h2>2. The closing line: "Wavelength. Tune in. Gain clarity."</h2>
<p>Three new natural performances in voice 4, each generated as one whole line (no pitch shifting or time-stretching), chosen from 24 takes for: a calm "Tune in", a natural pause, and a "Gain clarity" that is brighter and resolves gently instead of only dropping lower. Every finalist is heard by the transcriber as <b>Gain</b>, not Game.</p>
<div class="grid">${fin.map((t) => audio(`${t.id}.wav`, t.label, t.desc)).join('')}${audio('current-line.wav', 'The current closing line', 'For comparison.')}</div>
<h3>In the closing scene (with the current two-note logo)</h3>
<div class="grid">${video('wavelength-v4-closing-a2-t-current-1080p.mp4', 'The current closing line')}${fin.map((t) => video(`wavelength-v4-closing-a2-t-${t.id}-1080p.mp4`, t.label)).join('')}</div>
<h3>Measured (supporting your listening, never replacing it)</h3>
<div class="tbl"><table><tr><th>Take</th><th>Transcribed</th><th>"Tune in" pitch</th><th>"Gain clarity" pitch (vs "Tune in")</th><th>"Gain clarity" brighter by</th><th>Final settle</th><th>Pause after "Tune in"</th></tr>${takeRows}</table></div>

<h2>3. The voice level</h2>
<p>The same take (${esc(fin[0].label)}) at the current level and 2 dB lower. Only the voice moves: the music and logo stay exactly where they were and the master is not turned back up.</p>
<div class="grid">${video('wavelength-v4-closing-a2-lvl-T1-now-1080p.mp4', 'Current level', `Voice ${lv.current.voiceLUFS} LUFS; the limiter takes up to ${lv.current.limiterMaxReductionDb} dB off the loudest moments`)}${video('wavelength-v4-closing-a2-lvl-T1-lower-1080p.mp4', '2 dB lower', `Voice ${lv.lower.voiceLUFS} LUFS; limiter up to ${lv.lower.limiterMaxReductionDb} dB; voice ${lv.lower.speechToMusicDb} dB above the music (was ${lv.current.speechToMusicDb})`)}</div>
<p class="muted">At the current level the master limiter is clamping the voice's loudest moments by up to ${lv.current.limiterMaxReductionDb} dB, which can sound forceful on headphones. Lowering the voice 2 dB halves that. The voice processing itself (trim, gentle compression) does not make phrase openings more forceful: the loudest 50 ms sits 6.4 to 7.0 dB above the speech average before and after it.</p>

<h2>4. Three combined previews</h2>
<p>Chosen on the measurements: the two lingering sounds that leave room before speech, with the take that best matches the brief, and the balanced sound with the second take.</p>
<div class="grid">${video('wavelength-v4-combined-a2-c-L1-T1-1080p.mp4', 'L1 (restrained) with Take 1')}${video('wavelength-v4-combined-a2-c-L2-T1-1080p.mp4', 'L2 (balanced) with Take 1')}${video('wavelength-v4-combined-a2-c-L2-T2-1080p.mp4', 'L2 (balanced) with Take 2')}</div>

<h2>5. Your choice</h2>
<form id="choice">
<fieldset><legend><b>Logo sound</b></legend>${radio('logo', SOUNDS.map(([k, n]) => [k, n]).concat([['none', 'None of these yet']]))}</fieldset>
<fieldset><legend><b>Closing line</b></legend>${radio('take', fin.map((t) => [t.id, t.label]).concat([['current', 'Keep the current line'], ['none', 'None of these yet']]))}</fieldset>
<fieldset><legend><b>Voice level</b></legend>${radio('level', [['lower', '2 dB lower'], ['current', 'Current level'], ['other', 'Something else (say in the notes)']])}</fieldset>
<fieldset><legend><b>Notes</b></legend><textarea id="notes" placeholder="Anything you heard on headphones or the phone speaker"></textarea></fieldset>
<button type="button" id="copy">Copy my choices</button> <span id="done" class="muted"></span>
</form>
<p class="muted">Your choices stay in this browser. "Copy my choices" puts them on your clipboard to paste into ChatGPT or a message to Claude.</p>
</main><script>
(function(){var f=document.getElementById('choice'),k='wl-audition-2';try{var s=JSON.parse(localStorage.getItem(k)||'{}');Object.keys(s).forEach(function(n){var e=f.querySelector('[name="'+n+'"][value="'+s[n]+'"]');if(e)e.checked=true;});if(s.notes)document.getElementById('notes').value=s.notes;}catch(e){}
function val(n){var e=f.querySelector('[name="'+n+'"]:checked');return e?e.value:'';}
function save(){try{localStorage.setItem(k,JSON.stringify({logo:val('logo'),take:val('take'),level:val('level'),notes:document.getElementById('notes').value}));}catch(e){}}
f.addEventListener('change',save);document.getElementById('notes').addEventListener('input',save);
document.getElementById('copy').addEventListener('click',function(){var t='Wavelength films, audition 2: logo '+(val('logo')||'-')+'; closing line '+(val('take')||'-')+'; voice level '+(val('level')||'-')+'. Notes: '+(document.getElementById('notes').value||'none');
if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){document.getElementById('done').textContent='Copied.';},function(){document.getElementById('done').textContent=t;});else document.getElementById('done').textContent=t;});})();
</script></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('page', path.join(OUT, 'index.html'));
