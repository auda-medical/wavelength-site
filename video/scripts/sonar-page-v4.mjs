// Builds the sonar logo-sound listening page: wavelength-video-output\comparison-v4\sonar\index.html (from the main
// review page: Watch the films.cmd, version 4). Stage 1: the nine isolated sounds in groups A, B and C, each with Play
// and Play three times, a description and its measurements, plus the full technical table. Stage 2: the three
// finalists and the earlier two-note reference in the real logo animation with Candidate A music. Answers stay in the
// browser until downloaded as CSV; nothing is sent anywhere and nothing is filled in for anyone.
//   node scripts/sonar-page-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'comparison-v4', 'sonar');
fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/sonar/sonar.json'), 'utf8'));
const an = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/sonar/analysis.json'), 'utf8'));
for (const id of Object.keys(meta)) fs.copyFileSync(path.join(ROOT, `public/audio-v4/sonar/${id}.wav`), path.join(OUT, 'audio', `${id}.wav`));
const FINAL = ['C3', 'A1', 'C1'];
const GROUPS = { A: 'Classic sonar', B: 'Modern precision', C: 'Wavelength signature' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ids = Object.keys(meta);
const card = (id) => { const m = meta[id], a = an[id]; return `<article class="snd" id="s-${id}">
  <h3><span class="tag">${id}</span>${esc(m.name)}${FINAL.includes(id) ? ' <span class="fin">Finalist</span>' : ''}</h3>
  <p>${esc(m.desc)}</p>
  <div class="btns"><button type="button" data-play="${id}" aria-label="Play ${id}, ${esc(m.name)}">Play</button><button type="button" class="ghost" data-play3="${id}" aria-label="Play ${id} three times">Play three times</button></div>
  <p class="meas">${esc(a.pitchAtHit)}${a.pitchAfter250ms !== a.pitchAtHit ? ' then ' + esc(a.pitchAfter250ms) : ''} · ${Math.round(m.afterHit * 1000)} ms after the hit · harshness band ${a.harsh2500to6000pct}%</p>
  <div class="q"><span>Your rating</span><span class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${id}-rating" value="${n}"><b>${n}</b></label>`).join('')}</span></div>
</article>`; };
const QS = [['premium', 'Premium quality'], ['memorable', 'Memorability'], ['pleasant', 'Pleasantness'], ['sonar', 'Sonar identity'], ['musical', 'Fits the music'], ['brand', 'Suits the Wavelength brand'], ['mobile', 'Clear on a phone speaker']];
const prev = [['C3', 'Finalist 1: C3, ping and returning echo'], ['A1', 'Finalist 2: A1, rounded rising ping'], ['C1', 'Finalist 3: C1, rising sweep'], ['signature', 'Reference: the earlier two-note signature']];
const pv = ([k, t]) => `<article class="snd"><h3>${esc(t)}</h3><video controls preload="metadata" playsinline src="wavelength-v4-logo-sound-${k}-1080p.mp4"></video>
  <p class="meas">Logo sound at the brand reveal (10.3 s) and the closing logo (19.6 s).</p>
  ${QS.map(([q, l]) => `<div class="q"><span>${l}</span><span class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${k}-${q}" value="${n}"><b>${n}</b></label>`).join('')}</span></div>`).join('')}
  <div class="q"><span>Risk of becoming irritating after many plays</span><span class="scale">${['low', 'medium', 'high'].map((v) => `<label><input type="radio" name="${k}-irritation" value="${v}"><b>${v[0].toUpperCase() + v.slice(1)}</b></label>`).join('')}</span></div>
  <label class="notes">Notes<textarea name="${k}-notes" rows="2"></textarea></label></article>`;
const cols = [['pitchAtHit', 'Pitch at hit'], ['pitchAfter250ms', 'Pitch 0.25 s later'], ['centroidHz', 'Spectral centroid (Hz)'], ['attackMs', 'Attack (ms)'], ['decayTo20dB', 'Decay to -20 dB (s)'], ['decayTo40dB', 'Decay to -40 dB (s)'], ['harsh2500to6000pct', 'Energy 2.5 to 6 kHz (%)'], ['above6000pct', 'Above 6 kHz (%)'], ['below200pct', 'Below 200 Hz (%)'], ['momentaryMaxLUFS', 'Loudness (max momentary, LUFS)'], ['truePeakDBTP', 'True peak (dBTP)'], ['clippedSamples', 'Clipped samples'], ['above16kHzDb', 'Above 16 kHz (dB, aliasing check)'], ['stereoCorrelation', 'Stereo correlation'], ['monoMinusStereoDb', 'Mono minus stereo (dB)'], ['tailAtNarrationDb', 'Left in the speech band when narration starts (dB below peak)']];
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sonar logo sounds</title><link rel="icon" href="data:,">
<style>
:root{--bg:#F7F5F0;--card:#fff;--ink:#0F1E33;--sub:#56677A;--teal:#2A7F8A;--line:rgba(15,30,51,.12)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0A1526;--card:#0F1E33;--ink:#F7F5F0;--sub:#9FB0C2;--teal:#7FC4CC;--line:#1d2f48}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1240px;margin:0 auto;padding:24px 16px 80px}h1{font-weight:500;font-size:30px;margin:8px 0}h2{font-weight:500;font-size:23px;margin:34px 0 6px}h3{font-weight:600;font-size:17px;margin:0 0 4px}
p{color:var(--sub);max-width:900px}.warn{border-left:3px solid #C98A2B;padding-left:12px}
.grp{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.snd{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.tag{display:inline-block;min-width:36px;text-align:center;border-radius:8px;background:var(--teal);color:#fff;font-weight:600;margin-right:8px;padding:0 4px}.fin{font-size:12px;border:1px solid var(--teal);color:var(--teal);border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:2px}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}button{font:inherit;min-height:44px;padding:8px 18px;border-radius:999px;border:1px solid var(--teal);background:var(--teal);color:#fff;cursor:pointer}button.ghost{background:transparent;color:var(--teal)}button:focus-visible{outline:3px solid var(--teal);outline-offset:2px}button[aria-pressed="true"]{box-shadow:0 0 0 3px rgba(42,127,138,.35)}
.meas{font-size:13px;margin:4px 0}.q{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 12px;padding:6px 0;border-top:1px solid var(--line)}.scale{display:flex;gap:6px;flex-wrap:wrap}
.scale label{display:inline-flex}.scale input{position:absolute;opacity:0}.scale b{display:inline-block;min-width:44px;padding:7px 10px;text-align:center;border:1px solid var(--line);border-radius:8px;font-weight:500;cursor:pointer}.scale input:checked+b{background:var(--teal);border-color:var(--teal);color:#fff}.scale input:focus-visible+b{outline:2px solid var(--teal);outline-offset:2px}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}table{border-collapse:collapse;font-size:13px;min-width:900px}th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:var(--card)}
video{width:100%;display:block;border-radius:10px;background:#000;margin:8px 0}.pv{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px}@media (max-width:480px){.pv{grid-template-columns:1fr}}
.notes{display:block;margin-top:8px;font-size:14px;color:var(--sub)}textarea,input[type=text]{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:16px}#status{color:var(--teal);font-size:14px;min-height:1.5em}.rec li{margin:6px 0;color:var(--ink)}
</style></head><body><main>
<h1>Wavelength sonar logo sounds</h1>
<p class="warn">Private review copies on this computer. Not approved for publication. Nothing on this page is sent anywhere.</p>
<p>Nine original sounds, each made from scratch for Wavelength. All play at the same perceived loudness, so none wins by being louder. Use Play three times to judge how a sound wears with repetition. Keyboard: Tab to a button, then Enter or Space; Escape stops playback.</p>
${Object.entries(GROUPS).map(([g, t]) => `<h2>Group ${g}: ${esc(t)}</h2><div class="grp">${ids.filter((i) => meta[i].group === g).map(card).join('')}</div>`).join('')}
<h2>Technical comparison</h2>
<p>Measurements support listening; they do not decide what sounds best. All nine have no clipping, nothing meaningful above 16 kHz and full mono compatibility. B1 carries far more energy in the 2.5 to 6 kHz band, where sounds start to feel sharp. The narration starts 0.5 s after the logo settles; the last column shows how little of each sound is left by then.</p>
<div class="tbl"><table><thead><tr><th>Sound</th>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${ids.map((id) => `<tr><td><b>${id}</b> ${esc(meta[id].name)}</td>${cols.map(([k]) => `<td>${an[id][k] == null ? 'ended' : esc(an[id][k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<h2>Stage 2: the finalists in the film</h2>
<p>The actual version 4 logo animation (the end of the problem, the brand reveal and its first narration line, then the closing logo), with Candidate A music, identical pictures and narration, and the same overall loudness. Each sound lands as the logo settles. The music is never silenced for it: the final chord simply arrives a moment after the closing logo. The earlier two-note signature is included for reference.</p>
<div class="pv">${prev.map(pv).join('')}</div>
<section class="box"><h3>Recommendation (before your listening)</h3><ol class="rec">
<li><b>C3, ping and returning echo.</b> It is literally how ultrasound works: a pulse goes out, and the echo comes back as information. Here the echo returns clearer and resolves onto D, the home note of the music: "tune in, gain clarity". It is in the music's key, has low harshness, and stands clearest over the music at the same loudness. The risk: a two-part gesture may feel busier than a single ping when heard often.</li>
<li><b>A1, rounded rising ping.</b> The most classic sonar character and the simplest: likely the safest for very frequent repetition, but the least distinctive as a brand.</li>
<li><b>C1, rising sweep.</b> Matches the logo's upward movement and leaves the narration completely clear, but it is the least prominent at the closing logo, and sweeps can read as an effect rather than an identity.</li></ol>
<p>The choice should rest on listening, ideally by several people on phone speakers and headphones.</p></section>
<section class="box"><h3>Your choice</h3>
<label>Your name or initials (optional)<input type="text" name="reviewer"></label>
${['First choice', 'Second choice'].map((t, i) => `<div class="q"><span>${t}</span><span class="scale">${['C3', 'A1', 'C1', 'two-note', ...ids.filter((x) => !FINAL.includes(x))].map((c) => `<label><input type="radio" name="choice${i + 1}" value="${c}"><b>${c}</b></label>`).join('')}</span></div>`).join('')}
<label class="notes">Anything else<textarea name="overall-notes" rows="3"></textarea></label>
<button type="button" id="save">Save this reviewer's answers</button> <button type="button" class="ghost" id="dl">Download all answers (CSV)</button> <button type="button" class="ghost" id="clear">Delete saved answers on this computer</button>
<div id="status" role="status" aria-live="polite"></div></section>
<script>
(function(){
  var current=null, timer=null, buttons=document.querySelectorAll('[data-play],[data-play3]');
  var reset=function(){buttons.forEach(function(b){b.setAttribute('aria-pressed','false')});};
  var stop=function(){if(timer){clearTimeout(timer);timer=null;}if(current){current.pause();current.currentTime=0;}reset();};
  var play=function(id,times,btn){stop();btn.setAttribute('aria-pressed','true');var n=0;var a=new Audio('audio/'+id+'.wav');current=a;var go=function(){a.currentTime=0;a.play().catch(function(){});};a.onended=function(){n++;if(n<times){timer=setTimeout(go,900);}else reset();};go();};
  document.querySelectorAll('[data-play]').forEach(function(b){b.onclick=function(){play(b.dataset.play,1,b)}});
  document.querySelectorAll('[data-play3]').forEach(function(b){b.onclick=function(){play(b.dataset.play3,3,b)}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')stop();});
  reset();
  var KEY='wl-v4-sonar-reviews',read=function(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return []}},write=function(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch(e){return false}};
  var status=document.getElementById('status');
  var collect=function(){var o={savedAt:new Date().toISOString()};document.querySelectorAll('input[type=radio]:checked').forEach(function(i){o[i.name]=i.value});document.querySelectorAll('textarea,input[type=text]').forEach(function(i){if(i.value)o[i.name]=i.value});return o;};
  document.getElementById('save').onclick=function(){var o=collect();if(Object.keys(o).length<2){status.textContent='Nothing to save yet.';return;}var a=read();a.push(o);if(!write(a)){status.textContent='This browser would not save. Download the CSV instead.';return;}document.querySelectorAll('input[type=radio]').forEach(function(i){i.checked=false});document.querySelectorAll('textarea,input[type=text]').forEach(function(i){i.value=''});status.textContent='Saved ('+a.length+' so far). The form is clear for the next reviewer.';};
  document.getElementById('dl').onclick=function(){var a=read();var cur=collect();if(Object.keys(cur).length>1)a=a.concat([cur]);if(!a.length){status.textContent='No answers to download yet.';return;}var cols=[];a.forEach(function(o){Object.keys(o).forEach(function(k){if(cols.indexOf(k)<0)cols.push(k)})});var q=function(v){v=v==null?'':String(v);return /[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};var csv=[cols.join(',')].concat(a.map(function(o){return cols.map(function(k){return q(o[k])}).join(',')})).join('\\r\\n');var b=new Blob([csv],{type:'text/csv'});var l=document.createElement('a');l.href=URL.createObjectURL(b);l.download='wavelength-sonar-reviews.csv';l.click();status.textContent='Downloaded.';};
  document.getElementById('clear').onclick=function(){if(confirm('Delete all saved answers on this computer?')){write([]);status.textContent='Deleted.';}};
})();
</script>
</main></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('wrote', path.join(OUT, 'index.html'));
