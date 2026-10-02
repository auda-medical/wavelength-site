// Renders the PNG icons and social share image from SVG/HTML. Run: node tools/images.mjs
import { chromium } from 'playwright';
import fs from 'fs';
const fav = fs.readFileSync('src/favicon.svg','utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(()=>chromium.launch());
const p = await b.newPage();
async function shot(html, w, h, out){ await p.setViewportSize({width:w,height:h}); await p.goto('file://'+process.cwd()+'/tools/blank.html'); await p.setContent(html,{waitUntil:'networkidle'}); await p.evaluate(()=>document.fonts.ready); await p.screenshot({path:out, omitBackground:true}); }
const icon = (s,pad=0,bg='transparent') => `<html><body style="margin:0;background:${bg}"><div style="width:${s}px;height:${s}px;padding:${pad}px;box-sizing:border-box">${fav.replace('<svg','<svg width="100%" height="100%"')}</div></body></html>`;
await shot(icon(32),32,32,'src/favicon-32.png');
await shot(icon(180,0,'#0F1E33').replace('r="32"','r="40"'),180,180,'src/apple-touch-icon.png');
await shot(icon(512),512,512,'src/assets/logo-512.png');
const og = `<html><head><style>${fs.readFileSync('src/assets/style.css','utf8').split('\n').filter(l=>l.startsWith('@font-face')).join('').replace(/url\(\/assets/g,'url(file://'+process.cwd()+'/src/assets')}</style></head>
<body style="margin:0"><div style="width:1200px;height:630px;position:relative;overflow:hidden;background:#0A1526;font-family:'DM Sans';color:#F7F5F0">
<div style="position:absolute;width:900px;height:900px;left:600px;top:-300px;background:radial-gradient(circle,#2A7F8A,transparent 65%);filter:blur(40px)"></div>
<div style="position:absolute;width:900px;height:900px;left:-300px;top:200px;background:radial-gradient(circle,#1F4A7A,transparent 65%);filter:blur(40px)"></div>
<div style="position:absolute;left:90px;top:90px;display:flex;align-items:center;gap:22px">
<svg width="84" height="84" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" stroke="#F7F5F0" stroke-width="2"/><path d="M12.5 20.5 C14 31 15.5 44 19 44 C24 44 26.5 22.5 32 22.5 C37.5 22.5 40 44 45 44 C48.5 44 50 31 51.5 20.5" stroke="#7FC4CC" stroke-width="3.6" stroke-linecap="round"/></svg>
<div style="font-size:30px;font-weight:500;letter-spacing:10px">WAVELENGTH</div></div>
<div style="position:absolute;left:90px;top:250px;font-family:'Cormorant Garamond';font-size:104px;line-height:1">Tune in. <i style="color:#7FC4CC">Gain clarity.</i></div>
<div style="position:absolute;left:94px;top:420px;font-size:28px;color:#B9C3D1;max-width:900px">Point-of-care ultrasound courses for emergency and acute clinicians</div>
<div style="position:absolute;left:94px;bottom:70px;font-size:18px;letter-spacing:4px;color:#7FC4CC;font-weight:600">RCEM-MAPPED · SMALL GROUPS · CONSULTANT-LED</div>
</div></body></html>`;
await shot(og,1200,630,'src/assets/og.png');
await b.close();
console.log('images done');
