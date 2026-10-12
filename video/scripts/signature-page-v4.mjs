// Builds the final logo-sound comparison page: wavelength-video-output\comparison-v4\signature\index.html. Four options
// (the original two-note reference, the refined two-note, the C1 sweep, the sonar-musical hybrid); options 2 to 4 dry
// and with the subtle reflection side by side, the reflection alone at its true level, and all of them in the real logo
// animation with Candidate A. Play, Play three times and Stop everywhere. Answers stay in the browser until downloaded
// as CSV; nothing is sent anywhere and nothing is filled in for anyone. The posters (poster.png, the settled logo at
// frame 318) are rendered with: npx remotion still src/index.jsx V4LogoPreview <out>/poster.png --frame=318
//   node scripts/signature-page-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/audio-v4/signature');
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'comparison-v4', 'signature');
fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.wav'))) fs.copyFileSync(path.join(SRC, f), path.join(OUT, 'audio', f));
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'signature.json'), 'utf8'));
const integ = JSON.parse(fs.readFileSync(path.join(SRC, 'integration.json'), 'utf8')).results;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const btns = (file, label) => `<span class="btns"><button type="button" data-play="${file}" aria-label="Play ${esc(label)}">Play</button><button type="button" class="ghost" data-times="3" data-play="${file}" aria-label="Play ${esc(label)} three times">Play three times</button><button type="button" class="ghost" data-stop aria-label="Stop">Stop</button></span>`;
const OPTS = [
  { id: 'S1', n: 1, video: 'signature', title: 'Original two-note signature (reference, unchanged)', text: 'D5 rising to A5 on the settle, exactly as before.' },
  { id: 'S2', n: 2, title: 'Refined two-note signature', text: 'The same rising D5 to A5, warmer and cleaner (no glassy overtone, no attack tick, softer onset, less room). The reflection follows only the arrival note, A5.' },
  { id: 'S3', n: 3, title: 'Single rising sonar sweep (C1)', text: 'One clean sweep up an octave onto A5. The reflection is of the ring after it lands, never a repeat of the sweep.' },
  { id: 'S4', n: 4, title: 'Sonar-musical hybrid', text: 'A rounded sonar ping on A5, then a soft tonal resolution that locks onto D6, the home note of the music, on the settle. The reflection follows the resolution.' },
];
const crit = [['warmth', 'Warmth'], ['professional', 'Professionalism'], ['memorable', 'Memorability'], ['pleasant', 'Pleasantness'], ['musical', 'Musical compatibility with Candidate A'], ['echo', 'Quality of the echo (options 2 to 4)'], ['advertising', 'Suitability for future Wavelength advertising']];
const scale = (name, vals) => `<span class="scale">${vals.map((v) => `<label><input type="radio" name="${name}" value="${v}"><b>${esc(String(v)[0].toUpperCase() + String(v).slice(1))}</b></label>`).join('')}</span>`;
const card = (o) => {
  const d = meta[`${o.id}d`], e = meta[`${o.id}e`], one = meta[o.id];
  const vid = o.video || `${o.id}e`;
  const m = integ[vid] || {};
  return `<article class="opt" id="o${o.n}"><h2><span class="tag">${o.n}</span>${esc(o.title)}</h2><p>${esc(o.text)}</p>
  ${one ? `<div class="row"><span class="lab">The sound</span>${btns(`${o.id}.wav`, `option ${o.n}`)}</div>` : `
  <div class="row"><span class="lab">Dry (no echo)</span>${btns(`${o.id}d.wav`, `option ${o.n}, dry`)}</div>
  <div class="row"><span class="lab">With the reflection</span>${btns(`${o.id}e.wav`, `option ${o.n}, with the reflection`)}</div>
  <div class="row"><span class="lab">Dry, then with the reflection</span><span class="btns"><button type="button" class="ghost" data-ab="${o.id}" aria-label="Play option ${o.n} dry, then with the reflection">Play both in turn</button></span></div>
  <div class="row"><span class="lab">The reflection alone, at its true (quiet) level</span>${btns(`${o.id}-reflection-only.wav`, `option ${o.n}, the reflection alone`)}</div>
  <p class="meas">Reflection: ${e.reflectionDelayMs} ms after the arrival, ${e.reflectionBelowMainDb} dB under the main tone; the echo version is ${Math.abs(e.loudnessCostDb)} dB from the dry one after level matching. Sound lasts ${Math.round(e.afterHit * 1000)} ms after the settle.</p>`}
  <h3>In the film, with Candidate A</h3>
  <video controls preload="metadata" playsinline poster="poster.png" src="wavelength-v4-signature-${vid}-1080p.mp4"></video>
  ${one ? '' : `<details><summary>The same scene with the dry version</summary><video controls preload="none" playsinline poster="poster.png" src="wavelength-v4-signature-${o.id}d-1080p.mp4"></video></details>`}
  <p class="meas">Logo sound over the music: ${m.brandLogoOverMusic} dB at the brand reveal, ${m.endLogoOverMusic} dB at the closing logo.${m.brandReflectionOverMusicInBand != null ? ` Reflection within its own pitch band: ${m.brandReflectionOverMusicInBand} dB and ${m.endReflectionOverMusicInBand} dB above the music; the narration stays at least ${Math.min(m.brandVoiceOverReflection, m.endVoiceOverReflection)} dB above it.` : ''}</p>
  <fieldset><legend>Your assessment of option ${o.n}</legend>
  ${crit.filter(([k]) => o.n > 1 || k !== 'echo').map(([k, l]) => `<div class="q"><span>${l}</span>${scale(`${o.n}-${k}`, [1, 2, 3, 4, 5])}</div>`).join('')}
  <div class="q"><span>Risk of irritation after repeated listening</span>${scale(`${o.n}-irritation`, ['low', 'medium', 'high'])}</div>
  ${o.n > 1 ? `<div class="q"><span>Dry or with the reflection?</span>${scale(`${o.n}-version`, ['dry', 'reflection', 'no preference'])}</div>` : ''}
  <label class="notes">Notes<textarea name="${o.n}-notes" rows="2"></textarea></label></fieldset></article>`;
};
const choices = ['1 original', '2 dry', '2 reflection', '3 dry', '3 reflection', '4 dry', '4 reflection'];
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logo sound: final choice</title><link rel="icon" href="data:,">
<style>
:root{--bg:#F7F5F0;--card:#fff;--ink:#0F1E33;--sub:#56677A;--teal:#2A7F8A;--line:rgba(15,30,51,.12)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0A1526;--card:#0F1E33;--ink:#F7F5F0;--sub:#9FB0C2;--teal:#7FC4CC;--line:#1d2f48}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 96px}h1{font-weight:500;font-size:30px;margin:8px 0}h2{font-weight:500;font-size:22px;margin:0 0 6px}h3{font-weight:600;font-size:16px;margin:16px 0 4px}
p{color:var(--sub);max-width:900px}.warn{border-left:3px solid #C98A2B;padding-left:12px}
.opt,.box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:18px 0}
.tag{display:inline-block;min-width:34px;text-align:center;border-radius:8px;background:var(--teal);color:#fff;font-weight:600;margin-right:10px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:6px 0;border-top:1px solid var(--line)}.lab{min-width:260px;font-size:15px}
.btns{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--teal);background:var(--teal);color:#fff;cursor:pointer}button.ghost{background:transparent;color:var(--teal)}button:focus-visible{outline:3px solid var(--teal);outline-offset:2px}button[aria-pressed="true"]{box-shadow:0 0 0 3px rgba(42,127,138,.4)}
video{width:100%;display:block;border-radius:10px;background:#000;margin:8px 0}details summary{cursor:pointer;color:var(--teal);margin:6px 0}.meas{font-size:13px}
fieldset{border:1px solid var(--line);border-radius:12px;margin:12px 0 0;padding:10px 14px}legend{padding:0 6px;font-weight:600}
.q{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 14px;padding:6px 0;border-bottom:1px solid var(--line)}.scale{display:flex;gap:6px;flex-wrap:wrap}
.scale label{display:inline-flex}.scale input{position:absolute;opacity:0}.scale b{display:inline-block;min-width:44px;padding:7px 10px;text-align:center;border:1px solid var(--line);border-radius:8px;font-weight:500;cursor:pointer}.scale input:checked+b{background:var(--teal);border-color:var(--teal);color:#fff}.scale input:focus-visible+b{outline:2px solid var(--teal);outline-offset:2px}
.notes{display:block;margin-top:8px;font-size:14px;color:var(--sub)}textarea,input[type=text]{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:8px 16px;display:flex;justify-content:center;gap:12px;align-items:center}#now{font-size:14px;color:var(--sub)}#status{color:var(--teal);font-size:14px;min-height:1.5em}
</style></head><body><main>
<h1>Wavelength logo sound: the final choice</h1>
<p class="warn">Private review copies on this computer. Not approved for publication. Nothing on this page is sent anywhere.</p>
<p>Four options. For options 2 to 4 you can hear the sound dry and with the new reflection: a single quiet, softened return of the arrival tone, about 150 ms later and about 18 dB under it, like a wave travelling out and coming back. Every file plays at the same perceived loudness: the echo versions are not louder. To hear what the reflection adds, use "Play both in turn", or play the reflection alone at its true, quiet level. Headphones show it most clearly; then check on a phone speaker.</p>
<p>In the film the logo sound lands as the logo settles, at the brand reveal and at the closing logo, with Candidate A. For a moment around each settle the music makes a little room (a gentle, narrow dip at the logo's pitch and 1.5 dB overall, never a drop-out), the same for all options.</p>
${OPTS.map(card).join('')}
<section class="box"><h2>Your final selection</h2>
<label>Your name or initials (optional)<input type="text" name="reviewer"></label>
<div class="q"><span>The permanent Wavelength sound</span>${scale('final', choices)}</div>
<label class="notes">Anything to change before it is used (for example: echo softer, or a touch later)<textarea name="final-notes" rows="3"></textarea></label>
<button type="button" id="save">Save this reviewer's answers</button> <button type="button" class="ghost" id="dl">Download all answers (CSV)</button> <button type="button" class="ghost" id="clear">Delete saved answers on this computer</button>
<div id="status" role="status" aria-live="polite"></div></section>
</main>
<div class="bar"><span id="now" aria-live="polite">Nothing playing</span><button type="button" data-stop>Stop</button></div>
<script>
(function(){
  var a=null,timer=null,now=document.getElementById('now');
  var reset=function(){document.querySelectorAll('[data-play],[data-ab]').forEach(function(b){b.setAttribute('aria-pressed','false')});now.textContent='Nothing playing';};
  var stop=function(){if(timer){clearTimeout(timer);timer=null}if(a){a.onended=null;a.pause();a=null}reset();};
  var seq=function(files,btn,label){stop();btn.setAttribute('aria-pressed','true');var i=0;var next=function(){if(i>=files.length){reset();return}now.textContent='Playing: '+label+(files.length>1?' ('+(i+1)+' of '+files.length+')':'');a=new Audio('audio/'+files[i]);a.onended=function(){i++;timer=setTimeout(next,i<files.length?900:0)};a.play().catch(function(){});};next();};
  document.querySelectorAll('[data-play]').forEach(function(b){b.onclick=function(){var n=+(b.dataset.times||1),f=[];for(var k=0;k<n;k++)f.push(b.dataset.play);seq(f,b,b.getAttribute('aria-label').replace(/^Play /,''));}});
  document.querySelectorAll('[data-ab]').forEach(function(b){b.onclick=function(){seq([b.dataset.ab+'d.wav',b.dataset.ab+'e.wav'],b,'dry, then with the reflection');}});
  document.querySelectorAll('[data-stop]').forEach(function(b){b.onclick=stop});
  document.querySelectorAll('video').forEach(function(v){v.addEventListener('play',function(){stop();document.querySelectorAll('video').forEach(function(o){if(o!==v)o.pause()})})});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')stop()});
  reset();
  var KEY='wl-v4-signature-reviews',read=function(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return []}},write=function(x){try{localStorage.setItem(KEY,JSON.stringify(x));return true}catch(e){return false}};
  var status=document.getElementById('status');
  var collect=function(){var o={savedAt:new Date().toISOString()};document.querySelectorAll('input[type=radio]:checked').forEach(function(i){o[i.name]=i.value});document.querySelectorAll('textarea,input[type=text]').forEach(function(i){if(i.value)o[i.name]=i.value});return o;};
  document.getElementById('save').onclick=function(){var o=collect();if(Object.keys(o).length<2){status.textContent='Nothing to save yet.';return}var x=read();x.push(o);if(!write(x)){status.textContent='This browser would not save. Download the CSV instead.';return}document.querySelectorAll('input[type=radio]').forEach(function(i){i.checked=false});document.querySelectorAll('textarea,input[type=text]').forEach(function(i){i.value=''});status.textContent='Saved ('+x.length+' so far). The form is clear for the next reviewer.';};
  document.getElementById('dl').onclick=function(){var x=read();var cur=collect();if(Object.keys(cur).length>1)x=x.concat([cur]);if(!x.length){status.textContent='No answers to download yet.';return}var cols=[];x.forEach(function(o){Object.keys(o).forEach(function(k){if(cols.indexOf(k)<0)cols.push(k)})});var q=function(v){v=v==null?'':String(v);return /[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};var csv=[cols.join(',')].concat(x.map(function(o){return cols.map(function(k){return q(o[k])}).join(',')})).join('\\r\\n');var bl=new Blob([csv],{type:'text/csv'});var l=document.createElement('a');l.href=URL.createObjectURL(bl);l.download='wavelength-logo-sound-choice.csv';l.click();status.textContent='Downloaded.';};
  document.getElementById('clear').onclick=function(){if(confirm('Delete all saved answers on this computer?')){write([]);status.textContent='Deleted.'}};
})();
</script></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('wrote', path.join(OUT, 'index.html'));
