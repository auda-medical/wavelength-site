// Builds the focused final comparison page: wavelength-video-output\comparison-v4\decay\index.html.
// Seven logo sounds (two-note and C1, each original plus two longer natural decays, and one intermediate), each family
// with one-click switching, "original then longer", Play three times and Stop, and decay graphs drawn from the files;
// the seven logo previews in the film; the tagline takes (standalone and in the closing scene) beside the current line;
// and the combined previews. Answers stay in the browser until downloaded as CSV; nothing is sent anywhere.
//   node scripts/decay-page-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav } from './music-v4/engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'comparison-v4', 'decay');
const A = path.join(OUT, 'audio'); fs.mkdirSync(A, { recursive: true });
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/decay/decay.json'), 'utf8'));
const integ = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/decay/integration-d.json'), 'utf8')).results;
const tag = fs.existsSync(path.join(ROOT, 'public/audio-v4/tagline/tagline.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/tagline/tagline.json'), 'utf8')) : null;
for (const id of Object.keys(meta)) fs.copyFileSync(path.join(ROOT, `public/audio-v4/decay/${id}.wav`), path.join(A, `${id}.wav`));
if (tag) for (const t of tag.takes) fs.copyFileSync(path.join(ROOT, 'public', t.file), path.join(A, path.basename(t.file)));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const exists = (f) => fs.existsSync(path.join(OUT, f));

// Decay graph: 10 ms envelopes (dB below each family's peak) from 0.35 s before to 1.25 s after the settle.
function graph(ids, colours) {
  const W = 640, H = 210, x0 = 44, y0 = 12, w = W - x0 - 12, h = H - y0 - 30, t0 = -0.35, t1 = 1.25, dmin = -60;
  const env = ids.map((id) => { const { L, R } = readWav(path.join(ROOT, `public/audio-v4/decay/${id}.wav`)); const o = []; for (let s = 0; s + 480 <= L.length; s += 480) { let a = 0; for (let i = s; i < s + 480; i++) a += L[i] * L[i] + R[i] * R[i]; o.push(10 * Math.log10(a / 960 + 1e-30)); } return o; });
  const pk = Math.max(...env.flat());
  const X = (t) => x0 + (t - t0) / (t1 - t0) * w, Y = (d) => y0 + Math.min(1, Math.max(0, -d / -dmin)) * h;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Decay of ${ids.join(', ')}: level in dB against time from the settle" class="graph">`;
  for (const d of [0, -20, -40, -60]) svg += `<line x1="${x0}" x2="${x0 + w}" y1="${Y(d)}" y2="${Y(d)}" class="grid"/><text x="${x0 - 6}" y="${Y(d) + 4}" text-anchor="end">${d}</text>`;
  for (let t = 0; t <= 1.2; t += 0.2) svg += `<line x1="${X(t)}" x2="${X(t)}" y1="${y0}" y2="${y0 + h}" class="grid"/><text x="${X(t)}" y="${H - 10}" text-anchor="middle">${t.toFixed(1)} s</text>`;
  svg += `<line x1="${X(0)}" x2="${X(0)}" y1="${y0}" y2="${y0 + h}" class="settle"/>`;
  env.forEach((e, j) => { const pts = e.map((d, i) => { const t = i / 100 - 0.35; return t >= t0 && t <= t1 ? `${X(t).toFixed(1)},${Y(d - pk).toFixed(1)}` : null; }).filter(Boolean).join(' '); svg += `<polyline points="${pts}" fill="none" stroke="${colours[j]}" stroke-width="2"/>`; });
  return svg + '</svg>';
}
const COL = ['#56677A', '#2A7F8A', '#C98A2B'];
const btn = (file, label, extra = '') => `<button type="button" data-play="${file}" ${extra} aria-label="Play ${esc(label)}">${esc(label)}</button>`;
const fam = (title, ids, labels, text) => `<article class="fam"><h3>${esc(title)}</h3><p>${esc(text)}</p>
  ${graph(ids, COL)}
  <p class="legend">${ids.map((id, j) => `<span><i style="background:${COL[j]}"></i>${esc(labels[j])}: falls to -40 dB ${meta[id].fallTo40dB} s after its peak</span>`).join('')}</p>
  <div class="row"><span class="lab">Play</span><span class="btns">${ids.map((id, j) => btn(`${id}.wav`, labels[j])).join('')}</span></div>
  <div class="row"><span class="lab">Compare</span><span class="btns">${ids.slice(1).map((id, j) => `<button type="button" class="ghost" data-seq="${ids[0]}.wav,${id}.wav" aria-label="Play the original, then ${esc(labels[j + 1])}">Original, then ${esc(labels[j + 1].toLowerCase())}</button>`).join('')}${ids.map((id, j) => `<button type="button" class="ghost" data-play="${id}.wav" data-times="3" aria-label="Play ${esc(labels[j])} three times">${esc(labels[j])} three times</button>`).join('')}<button type="button" class="ghost" data-stop>Stop</button></span></div>
</article>`;
const vid = (file, label, note = '') => exists(file) ? `<figure><figcaption><b>${esc(label)}</b>${note ? `<span>${esc(note)}</span>` : ''}</figcaption><video controls preload="none" playsinline poster="poster.png" src="${file}"></video></figure>` : '';
const inCtx = (k) => { const r = integ[k]; return r ? `above the music for ${r.brandAboveMusicInBandFor} s (brand) and ${r.endAboveMusicInBandFor} s (closing)` : ''; };
const TL = tag ? tag.takes : [];
const crit = [['pleasant', 'Immediately pleasant'], ['recognisable', 'Recognisable'], ['premium', 'Premium'], ['natural', 'The decay feels natural and continuous'], ['music', 'Flows into Candidate A']];
const scale = (name, vals) => `<span class="scale">${vals.map((v) => `<label><input type="radio" name="${name}" value="${v}"><b>${esc(String(v)[0].toUpperCase() + String(v).slice(1))}</b></label>`).join('')}</span>`;
const SOUNDS = [['TN0', 'Two-note, original'], ['TN1', 'Two-note, slightly longer'], ['TN2', 'Two-note, moderately longer'], ['SW0', 'C1, original'], ['SW1', 'C1, slightly longer'], ['SW2', 'C1, moderately longer'], ['MX', 'Intermediate']];
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logo sound and tagline</title><link rel="icon" href="data:,">
<style>
:root{--bg:#F7F5F0;--card:#fff;--ink:#0F1E33;--sub:#56677A;--teal:#2A7F8A;--line:rgba(15,30,51,.12)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0A1526;--card:#0F1E33;--ink:#F7F5F0;--sub:#9FB0C2;--teal:#7FC4CC;--line:#1d2f48}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 96px}h1{font-weight:500;font-size:30px;margin:8px 0}h2{font-weight:500;font-size:24px;margin:36px 0 6px}h3{font-weight:600;font-size:18px;margin:0 0 4px}
p{color:var(--sub);max-width:900px}.warn{border-left:3px solid #C98A2B;padding-left:12px}
.fam,.box,figure{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:14px 0}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:6px 0;border-top:1px solid var(--line)}.lab{min-width:90px;font-size:15px;color:var(--sub)}
.btns{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--teal);background:var(--teal);color:#fff;cursor:pointer}button.ghost{background:transparent;color:var(--teal)}button:focus-visible{outline:3px solid var(--teal);outline-offset:2px}button[aria-pressed="true"]{box-shadow:0 0 0 3px rgba(42,127,138,.45)}
.graph{width:100%;max-width:640px;display:block;margin:6px 0}.graph text{font-size:11px;fill:var(--sub)}.graph .grid{stroke:var(--line)}.graph .settle{stroke:var(--teal);stroke-dasharray:4 3}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px}.legend i{display:inline-block;width:14px;height:4px;margin-right:6px;vertical-align:middle;border-radius:2px}
figure{margin:12px 0}figcaption{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 12px;margin-bottom:6px}figcaption span{font-size:13px;color:var(--sub)}video{width:100%;display:block;border-radius:10px;background:#000}
.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.q{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 14px;padding:6px 0;border-bottom:1px solid var(--line)}.scale{display:flex;gap:6px;flex-wrap:wrap}
.scale label{display:inline-flex}.scale input{position:absolute;opacity:0}.scale b{display:inline-block;min-width:44px;padding:7px 10px;text-align:center;border:1px solid var(--line);border-radius:8px;font-weight:500;cursor:pointer}.scale input:checked+b{background:var(--teal);border-color:var(--teal);color:#fff}.scale input:focus-visible+b{outline:2px solid var(--teal);outline-offset:2px}
textarea,input[type=text]{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.notes{display:block;margin-top:8px;font-size:14px;color:var(--sub)}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:8px 16px;display:flex;justify-content:center;gap:12px;align-items:center}#now{font-size:14px;color:var(--sub)}#status{color:var(--teal);font-size:14px;min-height:1.5em}
</style></head><body><main>
<h1>Wavelength: final logo sound and closing tagline</h1>
<p class="warn">Private review copies on this computer. Not approved for publication. Nothing on this page is sent anywhere.</p>
<p>The echo is gone. The longer versions are the original sounds, unchanged through their attack, whose resonance simply continues a little longer and fades evenly to silence: no second ping, no gap, nothing returning. Every file in a family starts at exactly the same level, so only the length of the decay differs. The graphs show each version's actual fade. Headphones show the difference most clearly; then try a laptop and a phone speaker.</p>

<h2>1. The seven sounds</h2>
${fam('Two-note signature', ['TN0', 'TN1', 'TN2'], ['Original', 'Slightly longer', 'Moderately longer'], 'D5 rising to A5, the arrival on the settle. The extensions slow the fade after the sound has dropped 12 dB.')}
${fam('C1 rising sweep', ['SW0', 'SW1', 'SW2'], ['Original', 'Slightly longer', 'Moderately longer'], 'One sweep up an octave onto A5. Its slow inner beating is faded out in the longer tails so they never swell back up.')}
<article class="fam"><h3>Intermediate</h3><p>${esc('C1\'s fluid motion with the two-note\'s arrival: one continuous tone that starts softly on D5 when the two-note\'s first note would, glides up to arrive on A5 on the settle, and decays with the two-note\'s timbre. No third note, no second attack.')}</p>
  ${graph(['TN0', 'MX', 'SW0'], ['#56677A', '#2A7F8A', '#C98A2B'])}
  <p class="legend"><span><i style="background:#56677A"></i>Two-note original</span><span><i style="background:#2A7F8A"></i>Intermediate: falls to -40 dB ${meta.MX.fallTo40dB} s after its peak</span><span><i style="background:#C98A2B"></i>C1 original</span></p>
  <div class="row"><span class="lab">Play</span><span class="btns">${btn('MX.wav', 'Intermediate')}<button type="button" class="ghost" data-play="MX.wav" data-times="3" aria-label="Play the intermediate three times">Three times</button><button type="button" class="ghost" data-seq="TN0.wav,MX.wav,SW0.wav" aria-label="Play the two-note, the intermediate, then C1">Two-note, intermediate, C1</button><button type="button" class="ghost" data-stop>Stop</button></span></div></article>

<h2>2. In the logo animation, with Candidate A</h2>
<p>The end of the problem scene, the brand reveal and its first narration line, then the closing logo with the current closing line. The music now stays steady while the logo sounds: any level change for the narration happens earlier, during the camera move. The narration now begins 0.7 s after each logo settles, so the resonance has room.</p>
<div class="grid2">${SOUNDS.map(([k, l]) => vid(`wavelength-v4-logo-d-${k === 'TN0' ? 'signature' : k === 'SW0' ? 'C1' : k}-1080p.mp4`, l, inCtx(k === 'TN0' ? 'signature' : k === 'SW0' ? 'C1' : k))).join('')}</div>

<h2>3. The closing tagline</h2>
${TL.length ? `<p>Voice 4, generated naturally: no pitch shifting or time-stretching. Each take keeps the approved "Wavelength." and replaces "Tune in." and "Gain clarity." with new performances, with a short pause after "Tune in." The takes are mixed about 1 dB quieter than the other narration for a more personal close.</p>
<div class="grid2">${TL.map((t) => `<article class="fam"><h3>${esc(t.label)}</h3><p>${esc(t.desc)}</p><div class="btns">${btn(path.basename(t.file), 'Play')}<button type="button" class="ghost" data-play="${path.basename(t.file)}" data-times="3" aria-label="Play ${esc(t.label)} three times">Three times</button><button type="button" class="ghost" data-stop>Stop</button></div><p class="legend">${esc(t.measure || '')}</p></article>`).join('')}</div>
<div class="grid2">${TL.map((t) => vid(`wavelength-v4-closing-${t.id}-1080p.mp4`, `Closing scene: ${t.label}`)).join('')}</div>` : '<p>The tagline takes are still being generated.</p>'}

<h2>4. Combined previews</h2>
<p>The strongest technical sound candidates with the preferred tagline take.</p>
<div class="grid2">${fs.readdirSync(OUT).filter((f) => /^wavelength-v4-combined-.*\.mp4$/.test(f)).map((f) => vid(f, f.replace('wavelength-v4-combined-', '').replace('-1080p.mp4', '').replace(/-/g, ' + '))).join('') || '<p>Not rendered yet.</p>'}</div>

<section class="box"><h2 style="margin-top:0">Your choice</h2>
<label>Your name or initials (optional)<input type="text" name="reviewer"></label>
${crit.map(([k, l]) => `<div class="q"><span>${l}: best sound</span>${scale(`best-${k}`, SOUNDS.map(([id]) => id))}</div>`).join('')}
<div class="q"><span>The final logo sound</span>${scale('final-sound', SOUNDS.map(([id]) => id))}</div>
<div class="q"><span>The final tagline take</span>${scale('final-tagline', TL.map((t) => t.id))}</div>
<label class="notes">Notes (for example: a little less decay, or a longer pause after "Tune in")<textarea name="notes" rows="3"></textarea></label>
<button type="button" id="save">Save this reviewer's answers</button> <button type="button" class="ghost" id="dl">Download all answers (CSV)</button> <button type="button" class="ghost" id="clear">Delete saved answers on this computer</button>
<div id="status" role="status" aria-live="polite"></div></section>
<p class="legend">Sound codes: TN0 to TN2 two-note (original, slightly, moderately longer); SW0 to SW2 C1 sweep (the same); MX intermediate.</p>
</main>
<div class="bar"><span id="now" aria-live="polite">Nothing playing</span><button type="button" data-stop>Stop</button></div>
<script>
(function(){
  var a=null,timer=null,now=document.getElementById('now');
  var reset=function(){document.querySelectorAll('[data-play],[data-seq]').forEach(function(b){b.setAttribute('aria-pressed','false')});now.textContent='Nothing playing';};
  var stop=function(){if(timer){clearTimeout(timer);timer=null}if(a){a.onended=null;a.pause();a=null}reset();};
  var seq=function(files,btn,label){stop();btn.setAttribute('aria-pressed','true');var i=0;var next=function(){if(i>=files.length){reset();return}now.textContent='Playing: '+label+(files.length>1?' ('+(i+1)+' of '+files.length+')':'');a=new Audio('audio/'+files[i]);a.onended=function(){i++;timer=setTimeout(next,i<files.length?800:0)};a.play().catch(function(){});};next();};
  document.querySelectorAll('[data-play]').forEach(function(b){b.onclick=function(){var n=+(b.dataset.times||1),f=[];for(var k=0;k<n;k++)f.push(b.dataset.play);seq(f,b,b.getAttribute('aria-label').replace(/^Play /,''));}});
  document.querySelectorAll('[data-seq]').forEach(function(b){b.onclick=function(){seq(b.dataset.seq.split(','),b,b.getAttribute('aria-label').replace(/^Play /,''));}});
  document.querySelectorAll('[data-stop]').forEach(function(b){b.onclick=stop});
  document.querySelectorAll('video').forEach(function(v){v.addEventListener('play',function(){stop();document.querySelectorAll('video').forEach(function(o){if(o!==v)o.pause()})})});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')stop()});
  reset();
  var KEY='wl-v4-decay-reviews',read=function(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return []}},write=function(x){try{localStorage.setItem(KEY,JSON.stringify(x));return true}catch(e){return false}};
  var status=document.getElementById('status');
  var collect=function(){var o={savedAt:new Date().toISOString()};document.querySelectorAll('input[type=radio]:checked').forEach(function(i){o[i.name]=i.value});document.querySelectorAll('textarea,input[type=text]').forEach(function(i){if(i.value)o[i.name]=i.value});return o;};
  document.getElementById('save').onclick=function(){var o=collect();if(Object.keys(o).length<2){status.textContent='Nothing to save yet.';return}var x=read();x.push(o);if(!write(x)){status.textContent='This browser would not save. Download the CSV instead.';return}document.querySelectorAll('input[type=radio]').forEach(function(i){i.checked=false});document.querySelectorAll('textarea,input[type=text]').forEach(function(i){i.value=''});status.textContent='Saved ('+x.length+' so far).';};
  document.getElementById('dl').onclick=function(){var x=read();var cur=collect();if(Object.keys(cur).length>1)x=x.concat([cur]);if(!x.length){status.textContent='No answers to download yet.';return}var cols=[];x.forEach(function(o){Object.keys(o).forEach(function(k){if(cols.indexOf(k)<0)cols.push(k)})});var q=function(v){v=v==null?'':String(v);return /[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};var csv=[cols.join(',')].concat(x.map(function(o){return cols.map(function(k){return q(o[k])}).join(',')})).join('\\r\\n');var bl=new Blob([csv],{type:'text/csv'});var l=document.createElement('a');l.href=URL.createObjectURL(bl);l.download='wavelength-final-sound-and-tagline.csv';l.click();status.textContent='Downloaded.';};
  document.getElementById('clear').onclick=function(){if(confirm('Delete all saved answers on this computer?')){write([]);status.textContent='Deleted.'}};
})();
</script></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('wrote', path.join(OUT, 'index.html'));
