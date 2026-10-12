// Builds the version 4 music comparison page: wavelength-video-output\comparison-v4\index.html (opened from the main
// review page, "Watch the films.cmd", http://localhost:5174/comparison-v4/). Three candidates on the same pictures and
// narration at equal loudness, music-only versions, full-length soundtracks for judging repetition, the two logo
// sounds, the version 3 sample for comparison, and an evaluation form. Answers stay in that browser (localStorage)
// until a reviewer downloads them as CSV; nothing is sent anywhere and nothing is filled in for anyone.
//   node scripts/comparison-page-v4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CANDIDATES } from './music-v4/score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, '..', '..', 'wavelength-video-output', 'comparison-v4');
const AUD = path.join(OUT, 'audio');
fs.mkdirSync(AUD, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const q = (s) => (process.platform === 'win32' ? `"${s}"` : s);
const m4a = (src, dst) => execFileSync(npx, ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', q(src), '-c:a', 'aac', '-b:a', '256k', '-f', 'mp4', '-movflags', '+faststart', q(dst)], { shell: process.platform === 'win32', cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
const ids = Object.keys(CANDIDATES);
for (const c of ids) {
  const mix = (f) => path.join(ROOT, `public/audio-v4/mix/${c}/${f}.wav`);
  m4a(mix('sample-music-only'), path.join(AUD, `${c}-sample-music.m4a`));
  m4a(mix('flagship'), path.join(AUD, `${c}-flagship-soundtrack.m4a`));
  m4a(mix('flagship-music-only'), path.join(AUD, `${c}-flagship-music.m4a`));
  m4a(mix('short'), path.join(AUD, `${c}-short-soundtrack.m4a`));
  m4a(mix('ad'), path.join(AUD, `${c}-ad-soundtrack.m4a`));
}
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio-v4/mix/report.json'), 'utf8'));
const DESC = {
  A: 'Clean and rhythmic: a soft synth arpeggio with echoes, a bell-like melody, short bass notes, a gentle kick and shaker. A premium technology-product feel.',
  B: 'Your preferred starting point. Fingerpicked plucked strings, a felt-piano melody, a warm pad, a light shaker and wooden tap, marimba touches at the lifts. Warm and approachable.',
  C: 'Spacious and cinematic, deliberately bright. A minimalist piano pattern that changes each section, a vibraphone melody, soft strings, gentle swells, no drums.',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const Qs = [
  ['professional', 'Feels professional'],
  ['positive', 'Feels positive'],
  ['inviting', 'Feels inviting'],
  ['narrator', 'Supports the narrator (voice stays clear)'],
  ['interest', 'Makes me want to try Wavelength'],
  ['memorable', 'Memorable'],
];
const card = (c) => {
  const r = report[`${c}/sample`] || {};
  return `<section class="cand" data-c="${c}" style="order:var(--o-${c})">
  <h2><span class="tag">${c}</span> ${esc(CANDIDATES[c].name)}</h2>
  <p>${esc(DESC[c])}</p>
  <video controls preload="metadata" playsinline src="wavelength-v4-sample-${c}-1080p.mp4"></video>
  <div class="row"><span>Music only (sample)</span><audio controls preload="none" src="audio/${c}-sample-music.m4a"></audio></div>
  <details><summary>Full-length soundtracks (to judge repetition)</summary>
    <div class="row"><span>Flagship, 1:51, with narration</span><audio controls preload="none" src="audio/${c}-flagship-soundtrack.m4a"></audio></div>
    <div class="row"><span>Flagship, music only</span><audio controls preload="none" src="audio/${c}-flagship-music.m4a"></audio></div>
    <div class="row"><span>Free-logbook short, 0:30</span><audio controls preload="none" src="audio/${c}-short-soundtrack.m4a"></audio></div>
    <div class="row"><span>Tailored-training advert, 0:21</span><audio controls preload="none" src="audio/${c}-ad-soundtrack.m4a"></audio></div>
  </details>
  <p class="meas">Measured (sample): ${r.integratedLUFS} LUFS, true peak ${r.truePeakDBTP} dBTP, music ${r.speechToMusicDb} dB under the voice while speaking.</p>
  <fieldset><legend>Your rating for ${c} (1 = not at all, 5 = very)</legend>
  ${Qs.map(([k, t]) => `<div class="q"><span>${esc(t)}</span><span class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${c}-${k}" value="${n}"><b>${n}</b></label>`).join('')}</span></div>`).join('')}
  <div class="q"><span>Becomes repetitive or irritating?</span><span class="scale"><label><input type="radio" name="${c}-irritating" value="no"><b>No</b></label><label><input type="radio" name="${c}-irritating" value="a little"><b>A little</b></label><label><input type="radio" name="${c}-irritating" value="yes"><b>Yes</b></label></span></div>
  <label class="notes">Notes (what works, what does not, where)<textarea name="${c}-notes" rows="3"></textarea></label>
  </fieldset>
</section>`;
};
const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Music comparison</title><link rel="icon" href="data:,">
<style>
:root{--bg:#F7F5F0;--card:#fff;--ink:#0F1E33;--sub:#56677A;--teal:#2A7F8A;--line:rgba(15,30,51,.12)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0A1526;--card:#0F1E33;--ink:#F7F5F0;--sub:#9FB0C2;--teal:#7FC4CC;--line:#1d2f48}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1240px;margin:0 auto;padding:24px 16px 80px}h1{font-weight:500;font-size:30px;margin:8px 0}h2{font-weight:500;font-size:21px;margin:0 0 6px}h3{font-weight:500;margin:36px 0 8px}
p{color:var(--sub);max-width:900px}.warn{border-left:3px solid #C98A2B;padding-left:12px}
.cands{display:flex;flex-direction:column;gap:22px}.cand{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
.tag{display:inline-block;min-width:34px;text-align:center;border-radius:8px;background:var(--teal);color:#fff;font-weight:600;margin-right:6px}
video{width:100%;max-width:960px;display:block;border-radius:10px;background:#000;margin:10px 0}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:8px 0}.row span{min-width:260px;color:var(--sub);font-size:14px}.row audio{flex:1;min-width:240px;max-width:560px}
details{margin:8px 0}summary{cursor:pointer;color:var(--teal)}.meas{font-size:13px}
fieldset{border:1px solid var(--line);border-radius:12px;margin:12px 0 0;padding:10px 14px}legend{padding:0 6px;font-weight:600}
.q{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 14px;padding:7px 0;border-bottom:1px solid var(--line)}.scale{display:flex;gap:6px;flex-wrap:wrap}
.scale label{display:inline-flex}.scale input{position:absolute;opacity:0}.scale b{display:inline-block;min-width:44px;padding:8px 10px;text-align:center;border:1px solid var(--line);border-radius:8px;font-weight:500;cursor:pointer}
.scale input:checked+b{background:var(--teal);border-color:var(--teal);color:#fff}.scale input:focus-visible+b{outline:2px solid var(--teal);outline-offset:2px}
.notes{display:block;margin-top:10px;font-size:14px;color:var(--sub)}textarea,input[type=text],select{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:22px}.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
button{font:inherit;padding:10px 18px;border-radius:999px;border:1px solid var(--teal);background:var(--teal);color:#fff;cursor:pointer;margin:6px 8px 0 0}button.ghost{background:transparent;color:var(--teal)}
#status{color:var(--teal);font-size:14px;min-height:1.5em}.small{font-size:13px}
</style></head><body><main>
<h1>Wavelength version 4: choose the music</h1>
<p class="warn">Private review copies on this computer. Not approved for publication. Nothing on this page is sent anywhere.</p>
<p>The three samples use the same pictures, narration and logo sound; only the music changes. Each is mastered to the same loudness, so no candidate wins by being louder. Please listen on a phone speaker, a laptop and headphones if you can. The candidates appear in a different order for each visit, to reduce order effects. Rate each one, then rank them below. More than one person can use this page: save each reviewer's answers, then download them all.</p>
<div class="cands">${ids.map(card).join('')}</div>

<section class="box"><h3 style="margin-top:0">The logo sound</h3>
<p>Short and warm, about 0.7 s, landing as the logo settles. The two-note version (D rising to A) is the last leap of the music's "W" motif, the shape of the logo's wave. The single-note version is there for comparison.</p>
<div class="grid2">
<div><b>Two notes (used in the samples)</b><video controls preload="metadata" src="wavelength-v4-logo-reveal-signature-1080p.mp4"></video><video controls preload="metadata" src="wavelength-v4-logo-reveal-short-signature-1080p.mp4"></video></div>
<div><b>Single note</b><video controls preload="metadata" src="wavelength-v4-logo-reveal-single-1080p.mp4"></video><video controls preload="metadata" src="wavelength-v4-logo-reveal-short-single-1080p.mp4"></video></div>
</div>
<div class="q"><span>Which logo sound do you prefer?</span><span class="scale"><label><input type="radio" name="logo" value="two notes"><b>Two notes</b></label><label><input type="radio" name="logo" value="single note"><b>Single note</b></label><label><input type="radio" name="logo" value="no preference"><b>No preference</b></label></span></div>
</section>

<section class="box"><h3 style="margin-top:0">Before: version 3</h3><p>The version 3 sample, for comparison of mood and brightness.</p><video controls preload="none" src="../final-v3/wavelength-v3-sample-1080p.mp4" style="max-width:640px"></video></section>

<section class="box"><h3 style="margin-top:0">Your overall choice</h3>
<div class="grid2">
<label>Your name or initials (optional)<input type="text" name="reviewer"></label>
<label>Your role (optional)<input type="text" name="role" placeholder="for example, ST4 emergency medicine"></label>
<label>Listened on<select name="device"><option value="">Choose</option><option>Phone speaker</option><option>Laptop speakers</option><option>Headphones</option><option>Several of these</option></select></label>
</div>
${['First choice', 'Second choice', 'Third choice'].map((t, i) => `<div class="q"><span>${t}</span><span class="scale">${ids.map((c) => `<label><input type="radio" name="rank${i + 1}" value="${c}"><b>${c}</b></label>`).join('')}</span></div>`).join('')}
<div class="q"><span>Which feels most memorable?</span><span class="scale">${ids.map((c) => `<label><input type="radio" name="most-memorable" value="${c}"><b>${c}</b></label>`).join('')}</span></div>
<label class="notes">Anything else (visuals, brightness, the narrator, the calls to action)<textarea name="overall-notes" rows="3"></textarea></label>
<button type="button" id="save">Save this reviewer's answers</button><button type="button" class="ghost" id="dl">Download all answers (CSV)</button><button type="button" class="ghost" id="clear">Delete saved answers on this computer</button>
<div id="status" role="status"></div><p class="small" id="count"></p>
</section>
<script>
(function(){
  // Random order per visit (order of the cards only; labels stay A, B, C).
  var ids=${JSON.stringify(ids)}, order=ids.slice().sort(function(){return Math.random()-0.5});
  order.forEach(function(c,i){document.documentElement.style.setProperty('--o-'+c,i);});
  var KEY='wl-v4-music-reviews', read=function(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){return []}};
  var write=function(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch(e){return false}};
  var status=document.getElementById('status'), count=document.getElementById('count');
  var show=function(){var n=read().length;count.textContent=n?n+' reviewer'+(n>1?'s':'')+' saved on this computer.':'No answers saved yet.';};
  var collect=function(){var o={savedAt:new Date().toISOString(),order:order.join('')};document.querySelectorAll('input[type=radio]:checked').forEach(function(i){o[i.name]=i.value});document.querySelectorAll('textarea,input[type=text],select').forEach(function(i){if(i.value)o[i.name]=i.value});return o;};
  document.getElementById('save').onclick=function(){var o=collect();var keys=Object.keys(o).filter(function(k){return k!=='savedAt'&&k!=='order'});if(!keys.length){status.textContent='Nothing to save yet: rate at least one candidate.';return;}var a=read();a.push(o);if(!write(a)){status.textContent='This browser would not save. Download the CSV instead.';return;}document.querySelectorAll('input[type=radio]').forEach(function(i){i.checked=false});document.querySelectorAll('textarea,input[type=text],select').forEach(function(i){i.value=''});status.textContent='Saved. The form is clear for the next reviewer.';show();window.scrollTo(0,0);};
  document.getElementById('dl').onclick=function(){var a=read();var cur=collect();if(Object.keys(cur).length>2)a=a.concat([cur]);if(!a.length){status.textContent='No answers to download yet.';return;}var cols=[];a.forEach(function(o){Object.keys(o).forEach(function(k){if(cols.indexOf(k)<0)cols.push(k)})});var q=function(v){v=v==null?'':String(v);return /[",\\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};var csv=[cols.join(',')].concat(a.map(function(o){return cols.map(function(k){return q(o[k])}).join(',')})).join('\\r\\n');var b=new Blob([csv],{type:'text/csv'});var l=document.createElement('a');l.href=URL.createObjectURL(b);l.download='wavelength-v4-music-reviews.csv';l.click();status.textContent='Downloaded '+a.length+' set'+(a.length>1?'s':'')+' of answers.';};
  document.getElementById('clear').onclick=function(){if(confirm('Delete all saved answers on this computer?')){write([]);status.textContent='Deleted.';show();}};
  show();
})();
</script>
</main></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('wrote', path.join(OUT, 'index.html'));
