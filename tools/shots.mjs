import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='dist';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);let f=path.join(root,p);if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!fs.existsSync(f)){r.writeHead(404);return r.end(fs.readFileSync(path.join(root,'404.html')));}const ext=path.extname(f);r.writeHead(200,{'content-type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}[ext]||'application/octet-stream'});r.end(fs.readFileSync(f));}).listen(4173);
const b=await chromium.launch();const out=process.argv[2]||'shots';fs.mkdirSync(out,{recursive:true});
const errs=[];
for (const [name,w,h] of [['desk',1440,900],['phone',390,844]]){
  const p=await b.newPage({viewport:{width:w,height:h}});
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  for (const u of (process.argv[3]||'/,/courses/core-emergency-ultrasound/,/faculty/,/contact/').split(',')){
    await p.goto('http://localhost:4173'+u,{waitUntil:'networkidle'});await p.waitForTimeout(2600);
    await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,60));}window.scrollTo({top:0,behavior:'instant'});});
    await p.waitForTimeout(1300);
    const sw=await p.evaluate(()=>document.documentElement.scrollWidth);
    if(sw>w) errs.push(`${name} ${u} horizontal overflow ${sw}`);
    await p.screenshot({path:`${out}/${name}${u.replace(/\//g,'_')}.png`,fullPage:true});
  }
}
console.log(errs.join('\n')||'no errors');await b.close();srv.close();
