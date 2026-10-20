// 1.0.24 (owner, 20 Oct 2026): a real two-finger pinch on a touch phone zooms the photo in place (not the page), and one
// finger then moves it. Chromium with touch, CDP touch events. Run: node tools/e2e-zoom-touch.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const js = fs.readFileSync('src/app/zoom.js', 'utf8');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><div style="height:200px"></div><div id="host" style="width:360px;margin:15px"></div><div style="height:2000px"></div></body>');
await page.addScriptTag({ content: js });
await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.fillRect(100, 200, 440, 60); document.getElementById('host').appendChild(WLZoom.bind(c)); });
const r = await page.$eval('.zoombox', (e) => { const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
const cdp = await ctx.newCDPSession(page);
const tp = (pts) => pts.map(([x, y], i) => ({ x, y, id: i }));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp([[r.x - 20, r.y], [r.x + 20, r.y]]) });
for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([[r.x - 20 - i * 8, r.y], [r.x + 20 + i * 8, r.y]]) });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const z = await page.$eval('.zoombox', (e) => ({ zoom: Number(e.dataset.zoom), zoomed: e.classList.contains('zoomed') }));
// One finger now drags the zoomed photo.
const t0 = await page.$eval('.zoombox canvas', (c) => c.style.transform);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp([[r.x, r.y]]) });
for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([[r.x + i * 10, r.y + i * 6]]) });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const t1 = await page.$eval('.zoombox canvas', (c) => c.style.transform);
const pageZoom = await page.evaluate(() => window.visualViewport ? visualViewport.scale : 1);
console.log(JSON.stringify({ pinchZoom: z.zoom, zoomed: z.zoomed, dragged: t0 !== t1, pageNotZoomed: pageZoom === 1, hint: await page.evaluate(() => WLZoom.hint()) }));
await b.close();
