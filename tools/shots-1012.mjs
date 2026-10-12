// Visual evidence for 1.0.12: the new and changed screens, light and dark, at Android and iPhone sizes, and the same
// screens from a 1.0.11 bundle where they exist ("before"). Synthetic accounts, records and pictures only.
//
// Setup: node mobile/scripts/build-www.mjs; node --import ./test/helpers/register.mjs tools/dev-worker.mjs [port]
// Run:   node tools/shots-1012.mjs <outdir> [1.0.11 bundle dir] [http://localhost:8787]
// iPhone sizes are Chromium with the iPhone's screen size and simulated safe areas (notch and home bar), not Safari:
// they show layout, not WebKit rendering. Writes <outdir>/index.html, a page to look through them all.
import fs from 'node:fs';
import path from 'node:path';
import { harness, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'shots-1012');
const OLD = process.argv[3] ? path.resolve(process.argv[3]) : '';
const API = process.argv[4] || 'http://localhost:8787';
localOnly(API, 'tools/shots-1012.mjs');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
const DEVICES = {
  android: { w: 390, h: 844, label: 'Android, 390 x 844 (Pixel 7 size)', init: '' },
  'android-small': { w: 360, h: 640, label: 'Android, 360 x 640 (small phone)', init: '' },
  iphone: { w: 393, h: 852, label: 'iPhone 15 size with notch and home bar (simulated in Chromium)', init: "document.documentElement.style.setProperty('--safe-area-inset-top','59px');document.documentElement.style.setProperty('--safe-area-inset-bottom','34px');" },
};

async function account(first, last, pathways = ['rcem']) {
  const email = `shot${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: first, lastName: last, email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways, grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
const call = (acc, p, body) => fetch(API + '/api/app/' + p, { method: body ? 'POST' : 'GET', headers: { ...H, Authorization: 'Bearer ' + acc.token }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const types = ['efast', 'aaa', 'lung', 'cardiac', 'dvt', 'shock'];
async function world() {
  const learner = await account('Ada', 'Trainee', ['rcem', 'famus']), sup = await account('Sam', 'Supervisor', ['general']), pend = await account('Pat', 'Pending');
  await call(learner, 'sync', { entries: Array.from({ length: 14 }, (_, i) => ({ id: `shot${learner.id}x${i}xxxx`, type: types[i % types.length], date: new Date(Date.now() - i * 2 * 864e5).toISOString().slice(0, 10), supervision: i % 3 ? 'direct' : 'independent', overall: i % 4 ? 'Normal' : 'Abnormal', createdAt: Date.now() - i, updatedAt: 0 })) });
  await call(learner, 'supervisors/add', { email: sup.email });
  await call(learner, 'supervisors/add', { email: pend.email });
  const inv = (await call(sup, 'supervisors')).invites[0];
  await call(sup, 'supervisors/accept', { id: inv.id });
  await call(learner, 'signoff/request', { entryIds: [`shot${learner.id}x0xxxx`], supervisorLink: inv.id });
  return { learner, sup, linkId: inv.id };
}
async function quadrants(page) {
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 800, 600); const gr = g.createRadialGradient(400, 340, 20, 400, 340, 320); gr.addColorStop(0, '#a9a9a9'); gr.addColorStop(0.6, '#3a3a3a'); gr.addColorStop(1, '#0d0d0d'); g.fillStyle = gr; g.beginPath(); g.moveTo(400, 70); g.arc(400, 70, 520, Math.PI * 0.3, Math.PI * 0.7); g.closePath(); g.fill(); g.fillStyle = '#ddd'; g.font = '26px monospace'; g.fillText('SYNTHETIC TEST, NOT A PATIENT 0000000000', 18, 34); g.fillText('ID 000-000-0000', 560, 586); c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png'); }));
  const f = path.join(OUT, 'synthetic-ultrasound.png'); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
async function clipFile(page) {
  const f = path.join(OUT, 'synthetic-clip.webm'); if (fs.existsSync(f)) return f;
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 480; c.height = 360; const g = c.getContext('2d'); const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const ch = []; rec.ondataavailable = (e) => e.data.size && ch.push(e.data); const t0 = performance.now(); let raf; const tick = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#000'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#555'; g.beginPath(); g.ellipse(240, 200, 120 + Math.sin(t * 3) * 25, 90, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ccc'; g.font = '16px monospace'; g.fillText('SYNTHETIC CLIP, NOT A PATIENT', 10, 22); if (t >= 4) { rec.stop(); return; } raf = requestAnimationFrame(tick); }; rec.onstop = () => { cancelAnimationFrame(raf); const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(ch, { type: 'video/webm' })); }; rec.start(250); tick(); }));
  fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
async function open(acc, dev, theme, bundle, reduced = true) {
  serve.dir = bundle;
  const init = [`localStorage.setItem('wl-theme', ${JSON.stringify(theme)});`];
  if (DEVICES[dev].init) init.push(`addEventListener('DOMContentLoaded', () => { ${DEVICES[dev].init} });`);
  const { ctx, page } = await newApp(DEVICES[dev].w, DEVICES[dev].h, { init });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('https://localhost/'); await page.evaluate((t) => localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': t })), acc.token);
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs', { timeout: 15000 }); await sleep(900);
  return { ctx, page };
}
const go = (page, h) => page.evaluate((x) => { location.hash = x; }, h);
const list = [];
const snap = async (page, file, title, opt = {}) => { await sleep(400); await page.screenshot({ path: path.join(OUT, file + '.png'), ...opt }); list.push({ file: file + '.png', title }); };

const W = await world();
const scenes = [
  ['home', 'Home: counts and the outstanding requirements carousel', async (p) => { await go(p, '#/'); await sleep(800); }, { learner: true }],
  ['carousel', 'Still to do: a requirement card, arrows and dots', async (p) => { await go(p, '#/'); await p.waitForSelector('[data-reqs]'); await p.evaluate(() => document.querySelector('[data-reqs]').scrollIntoView({ block: 'center' })); }, { learner: true, new: true }],
  ['outstanding', 'View all outstanding requirements', async (p) => { await go(p, '#/outstanding/rcem'); await p.waitForSelector('main .req'); }, { learner: true, new: true }],
  ['supervisors', 'Your supervisors: stages in words', async (p) => { await go(p, '#/supervisors'); await p.waitForSelector('.card'); await sleep(800); await p.evaluate(() => { const c = document.querySelector('.sv-link'); if (c) c.scrollIntoView({ block: 'center' }); }); }, { learner: true }],
  ['supervisor-detail', 'Supervisor details: what the status means, Remove supervisor', async (p) => { await go(p, '#/supervisors/' + W.linkId); await p.waitForSelector('[data-end]'); }, { learner: true, new: true }],
  ['remove-confirm', 'Remove supervisor: the consequences, before anything changes', async (p) => { await go(p, '#/supervisors/' + W.linkId); await p.waitForSelector('[data-end]'); await p.click('[data-end]'); await p.waitForSelector('.sheet [data-go]'); await sleep(300); }, { learner: true, new: true }],
  ['trainee', 'Supervisor dashboard: trainee tiles open their records', async (p) => { await go(p, '#/supervise/' + W.learner.id); await p.waitForSelector('.stats a.stat'); }, { sup: true }],
  ['trainee-filter', 'A tile opened: supervised scans for this trainee only', async (p) => { await go(p, `#/supervise/${W.learner.id}/scans?f=supervised`); await p.waitForSelector('.active-f'); }, { sup: true, new: true }],
  ['end-confirm', 'End supervision (supervisor side)', async (p) => { await go(p, '#/supervise/' + W.learner.id); await p.waitForSelector('[data-end]'); await p.click('[data-end]'); await p.waitForSelector('.sheet [data-go]'); await sleep(300); }, { sup: true, new: true }],
  ['guide-supervision', 'How supervisor verification works', async (p) => { await go(p, '#/guides/supervisor-verification'); await p.waitForSelector('#g-signoff'); }, { learner: true, new: true }],
  ['findings', 'Scan form: examination findings (cardiac)', async (p) => { await go(p, '#/new?type=cardiac'); await sleep(1500); await p.evaluate(() => { const h = [...document.querySelectorAll('h2, .sec-h, legend, .section-title')].find((x) => /Examination findings/.test(x.textContent)); (h || document.querySelector('#rest')).scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }); }, { learner: true }],
  ['editor-adjust', 'Photo editor: Adjust', async (p, img) => { await go(p, '#/new?type=cardiac'); await sleep(1200); await p.setInputFiles('#pick', img); await p.waitForSelector('.editor canvas'); await sleep(500); }, { learner: true, editor: true }],
  ['editor-redact', 'Photo editor: Redact (identifiers covered, solid black)', async (p, img) => { await go(p, '#/new?type=cardiac'); await sleep(1200); await p.setInputFiles('#pick', img); await p.waitForSelector('.editor canvas'); await sleep(400); await p.click('.editor [data-tab=redact]'); const b = await p.evaluate(() => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); const drag = async (a, z) => { await p.mouse.move(b.x + b.w * a[0], b.y + b.h * a[1]); await p.mouse.down(); await p.mouse.move(b.x + b.w * z[0], b.y + b.h * z[1], { steps: 4 }); await p.mouse.up(); }; await drag([0.01, 0.01], [0.75, 0.08]); await drag([0.68, 0.94], [0.99, 0.99]); }, { learner: true, editor: true, new: true }],
  ['editor-labels', 'Annotate: clinical labels for the scan type, and free text', async (p, img) => { await go(p, '#/new?type=cardiac'); await sleep(1200); await p.setInputFiles('#pick', img); await p.waitForSelector('.editor canvas'); await p.click('.editor [data-tab=annotate]'); await p.click('.editor [data-at=label]'); await p.waitForSelector('.editor .ed-pop:not([hidden])'); }, { learner: true, editor: true, new: true }],
  ['editor-annotated', 'Annotate: label, arrow and pictogram on a redacted picture', async (p, img) => { await go(p, '#/new?type=cardiac'); await sleep(1200); await p.setInputFiles('#pick', img); await p.waitForSelector('.editor canvas'); await p.click('.editor [data-tab=redact]'); const b0 = await p.evaluate(() => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); await p.mouse.move(b0.x + 2, b0.y + 2); await p.mouse.down(); await p.mouse.move(b0.x + b0.w * 0.75, b0.y + b0.h * 0.08, { steps: 4 }); await p.mouse.up(); await p.click('.editor [data-tab=annotate]'); await p.click('.editor [data-at=label]'); await p.click('.editor [data-lbl="LV"]'); await p.click('.editor [data-sa=done]'); await p.click('.editor [data-at=arrow]'); const b = await p.evaluate(() => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); await p.mouse.move(b.x + b.w * 0.25, b.y + b.h * 0.75); await p.mouse.down(); await p.mouse.move(b.x + b.w * 0.45, b.y + b.h * 0.56, { steps: 5 }); await p.mouse.up(); await p.click('.editor [data-sa=done]').catch(() => {}); await p.click('.editor [data-at=picto]'); await p.click('.editor [data-pic="heart-a4c"]'); }, { learner: true, editor: true, new: true }],
  ['editor-pictos', 'Pictograms: body regions, probe, side markers, cardiac views', async (p, img) => { await go(p, '#/new?type=efast'); await sleep(1200); await p.setInputFiles('#pick', img); await p.waitForSelector('.editor canvas'); await p.click('.editor [data-tab=annotate]'); await p.click('.editor [data-at=picto]'); await p.waitForSelector('.editor .ed-pictos'); }, { learner: true, editor: true, new: true }],
  ['clip-editor', 'Clip editor: Annotate, with "when it shows"', async (p, img, clip) => { await go(p, '#/new?type=aaa'); await sleep(1200); await p.setInputFiles('#vpick', clip); await p.waitForSelector('.editor canvas'); await sleep(1800); await p.click('.editor [data-tab=annotate]'); await p.click('.editor [data-at=label]'); await p.click('.editor [data-lbl="Ao"]'); await sleep(300); }, { learner: true, editor: true, new: true }],
  ['guides', 'Guides and accreditation: your pathway first', async (p) => { await go(p, '#/guides'); await p.waitForSelector('.guide-card.lead'); }, { learner: true, new: true }],
  ['guide', 'A guide: the note, dates and official sources', async (p) => { await go(p, '#/guides/rcem-ultrasound-sign-off'); await p.waitForSelector('.guide-body h2'); }, { learner: true, new: true }],
  ['progress', 'Progress: the guide for this pathway one tap away', async (p) => { await go(p, '#/progress/rcem'); await p.waitForSelector('.mod'); }, { learner: true }],
];
const img = path.join(OUT, 'synthetic-ultrasound.png');
for (const [dev, themes] of [['android', ['light', 'dark']], ['iphone', ['light', 'dark']], ['android-small', ['light']]]) {
  for (const theme of themes) {
    for (const [name, title, act, o] of scenes) {
      const who = o.sup ? W.sup : W.learner;
      const { ctx, page } = await open(who, dev, theme, WWW);
      const pic = fs.existsSync(img) ? img : await quadrants(page);
      const clip = o.editor ? await clipFile(page) : null;
      try { await act(page, pic, clip); await snap(page, `after-${dev}-${theme}-${name}`, `${title} (1.0.12, ${DEVICES[dev].label}, ${theme})`); } catch (e) { errors.push(`${name} ${dev} ${theme}: ${e.message.split('\n')[0]}`); }
      await page.evaluate(() => { document.querySelectorAll('form[data-dirty]').forEach((f) => delete f.dataset.dirty); const c = document.querySelector('.editor [data-a=cancel]'); if (c) c.click(); }).catch(() => {});
      await ctx.close();
      // Before: the same screen from the 1.0.11 bundle, where it exists.
      if (OLD && !o.new && dev === 'android') {
        const b = await open(who, dev, theme, OLD);
        try {
          if (o.editor) { await go(b.page, '#/new?type=cardiac'); await sleep(1200); await b.page.setInputFiles('#pick', pic); await b.page.waitForSelector('.editor canvas'); await sleep(500); }
          else await act(b.page, pic, clip);
          await snap(b.page, `before-${dev}-${theme}-${name}`, `${title} (1.0.11, ${DEVICES[dev].label}, ${theme})`);
        } catch (e) { errors.push(`before ${name} ${theme}: ${e.message.split('\n')[0]}`); }
        await b.ctx.close();
      }
    }
  }
}
// The 1.0.11 Home "Focus next" card, for comparison with the carousel.
if (OLD) {
  const b = await open(W.learner, 'android', 'light', OLD);
  await b.page.evaluate(() => { const h = [...document.querySelectorAll('h2.sec')].find((x) => /Focus next/.test(x.textContent)); if (h) h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
  await snap(b.page, 'before-android-light-focus-next', 'Home: "Focus next" (1.0.11, always the first unmet module)');
  await b.ctx.close();
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wavelength 1.0.12 screens</title><style>body{font:15px system-ui;margin:16px;background:#F7F5F0;color:#0F1E33}figure{display:inline-block;margin:0 12px 22px 0;vertical-align:top;width:220px}img{width:220px;border:1px solid #ccc;border-radius:10px}figcaption{font-size:12px;margin-top:4px}</style><h1>Wavelength 1.0.12: screens (synthetic data)</h1><p>Browser renderings: Android sizes in Chromium with a stand-in phone, iPhone sizes in Chromium with simulated safe areas. Not physical-device or Safari screenshots.</p>${list.map((x) => `<figure><a href="${x.file}"><img src="${x.file}" alt="" loading="lazy"></a><figcaption>${esc(x.title)}</figcaption></figure>`).join('')}`);
console.log(`${list.length} screenshots; ${errors.length} problems`);
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
await browser.close();
