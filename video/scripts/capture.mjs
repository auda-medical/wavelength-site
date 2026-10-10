// Captures the real Wavelength app and website for the films, from the local filming world (scripts/world.mjs):
// fictional people and scans, the real code. Phone screens at 390 x 844 CSS pixels and 3x density (1170 x 2532), the
// website at 1920 x 1080 and 2x. Writes PNGs and boxes.json (where each tapped control sits on its screen) to
// public/captures/, which Remotion animates. Nothing here touches production.
//   node --import ../test/helpers/register.mjs scripts/capture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startWorld, PASSWORD } from './world.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'public', 'captures');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = (k) => !only || only.has(k);
const boxes = fs.existsSync(path.join(OUT, 'boxes.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'boxes.json'), 'utf8')) : {};
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const w = await startWorld(8799);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function phone(who, { theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: true, isMobile: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem('wl-theme', t); localStorage.setItem('wl-lang', 'en'); localStorage.setItem('wl-installhint', '1'); } catch (e) { /* ignore */ } document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.setProperty('--safe-area-inset-top', '46px'); document.documentElement.style.setProperty('--safe-area-inset-bottom', '22px'); }); }, theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
  await page.goto(w.base + '/app/#/login');
  await page.waitForSelector('input[type=email]');
  await page.fill('input[type=email]', who === 'sup' ? w.SUP.email : w.LEARNER.email);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('form button[type=submit], form .btn.teal');
  await page.waitForFunction(() => /#\/?$|#\/home/.test(location.hash) || !!document.querySelector('nav.tabs'), null, { timeout: 15000 });
  await sleep(1500);
  return { ctx, page };
}
// Screenshot plus the boxes of named elements (CSS pixels within the 390 x 844 viewport, or the full page).
async function shot(page, name, marks = {}, { full = false } = {}) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => { if (!t.dataset.keep) t.remove(); }));
  await sleep(250);
  const b = {};
  for (const [k, sel] of Object.entries(marks)) {
    const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
    const r = await el.boundingBox().catch(() => null);
    if (r) b[k] = { x: r.x, y: r.y + (full ? await page.evaluate(() => window.scrollY) : 0), w: r.width, h: r.height };
  }
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: full });
  const dims = await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: Math.max(document.documentElement.scrollHeight, innerHeight) }));
  boxes[name] = { full, viewport: { w: 390, h: 844 }, page: full ? dims : { w: 390, h: 844 }, marks: b };
  console.log('captured', name, Object.keys(b).join(' '));
}
// A scrolling screen in two layers, so the film scrolls it the way the phone does: <name>-base.png (the screen as
// shown, with its fixed header and tab bar) and <name>-content.png (the scrolling content alone). page: the window
// scrolls between the fixed top and bottom bars. sheet: a bottom sheet scrolls inside its own rectangle.
async function scrollShot(page, name, { sheet = false } = {}) {
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await page.screenshot({ path: path.join(OUT, `${name}-base.png`) });
  if (sheet) {
    const rect = await page.evaluate(() => { const s = document.querySelector('.sheet'); s.scrollTop = 0; const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.evaluate(() => { const s = document.querySelector('.sheet'); s.style.maxHeight = 'none'; s.style.overflow = 'visible'; s.style.animation = 'none'; const bg = document.querySelector('.sheet-bg'); bg.style.position = 'absolute'; bg.style.alignItems = 'flex-start'; bg.style.bottom = 'auto'; bg.style.minHeight = '100%'; });
    await sleep(200);
    const el = page.locator('.sheet').first();
    const full = await el.boundingBox();
    await el.screenshot({ path: path.join(OUT, `${name}-content.png`) });
    boxes[name] = { layer: 'sheet', rect, contentH: full.height, marks: {} };
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    const chrome = await page.evaluate(() => {
      let top = 0, bottom = innerHeight;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.height < 4 || r.width < 100) continue;
        if (r.top <= 2) top = Math.max(top, r.bottom); else if (r.bottom >= innerHeight - 2) bottom = Math.min(bottom, r.top);
        el.dataset.wlHide = el.style.visibility || 'v'; el.style.visibility = 'hidden';
      }
      return { top, bottom, h: document.documentElement.scrollHeight };
    });
    await page.screenshot({ path: path.join(OUT, `${name}-content.png`), fullPage: true });
    await page.evaluate(() => document.querySelectorAll('[data-wl-hide]').forEach((el) => { el.style.visibility = el.dataset.wlHide === 'v' ? '' : el.dataset.wlHide; delete el.dataset.wlHide; }));
    boxes[name] = { layer: 'page', top: chrome.top, bottom: chrome.bottom, contentH: chrome.h, marks: {} };
  }
  console.log('captured scroll layers', name);
}
const go = async (page, hash, wait = 1400) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(wait); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200); };

// A synthetic ultrasound-style picture (no patient, clearly labelled), made in the page and saved as a file to upload.
async function syntheticImage(page) {
  const f = path.join(OUT, 'synthetic-lung.png');
  const b64 = await page.evaluate(() => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 1200, 900);
    g.save(); g.beginPath(); g.moveTo(600, 60); g.arc(600, 60, 820, Math.PI * 0.32, Math.PI * 0.68); g.closePath(); g.clip();
    for (let i = 0; i < 26000; i++) { const x = Math.random() * 1200, y = 60 + Math.random() * 840; const v = 30 + Math.random() * 60 * (1 - y / 1100); g.fillStyle = `rgba(${v},${v},${v},0.55)`; g.fillRect(x, y, 2 + Math.random() * 3, 1 + Math.random() * 2); }
    g.fillStyle = 'rgba(235,235,235,0.9)'; g.fillRect(250, 300, 700, 7); // pleural line
    for (const x of [430, 600, 770]) { const gr = g.createLinearGradient(0, 300, 0, 900); gr.addColorStop(0, 'rgba(220,220,220,0.75)'); gr.addColorStop(1, 'rgba(220,220,220,0.05)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 10, 305); g.lineTo(x + 10, 305); g.lineTo(x + 40, 900); g.lineTo(x - 40, 900); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(160,160,160,0.6)'; for (const x of [330, 520, 690, 860]) g.fillRect(x, 120, 28, 150);
    g.restore();
    g.fillStyle = '#cfcfcf'; g.font = '28px monospace'; g.fillText('ILLUSTRATION, NOT A PATIENT', 24, 44);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png');
  }));
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}

const L = await phone('learner');
const p = L.page;

if (want('home')) { await go(p, '#/'); await shot(p, 'home', { scans: '.hero-meta, .stats, [href="#/log"]', log: 'text=Log a scan' }); }
if (want('progress')) {
  await go(p, '#/progress'); await shot(p, 'progress-rcem', { famus: 'button:has-text("FAMUS"), a:has-text("FAMUS")' });
  const famus = p.locator('button:has-text("FAMUS"), a:has-text("FAMUS")').first();
  if (await famus.count()) { await famus.click(); await sleep(900); await shot(p, 'progress-famus', {}); }
}
if (want('supervisors')) { await go(p, '#/supervisors'); await p.evaluate(() => { const h = [...document.querySelectorAll('h2,h3')].find((x) => /Linked and invited/.test(x.textContent)); if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 90); }); await sleep(500); await shot(p, 'supervisors', { verified: 'text=Wavelength Verified' }); }
if (want('newscan')) {
  await go(p, '#/new');
  await shot(p, 'new-grid', { lung: 'button:has-text("Lung and pleura"), label:has-text("Lung and pleura")' });
  await p.locator('button:has-text("Lung and pleura"), label:has-text("Lung and pleura")').first().click();
  await sleep(1600);
  await shot(p, 'new-lung', {});
  // Tick a few findings and the supervision level, then attach the synthetic image.
  for (const t of ['Present', 'Direct']) { const el = p.locator(`label:has-text("${t}")`).first(); if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.click().catch(() => {}); await sleep(300); } }
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  await shot(p, 'new-lung-full', {}, { full: true });
  await scrollShot(p, 'new-lung-scroll');
  const file = await syntheticImage(p);
  const input = p.locator('input[type=file]').first();
  if (await input.count()) {
    await input.setInputFiles(file); await sleep(2500); await shot(p, 'new-image', {});
    // Confirm identifiers are removed, use the image, then save the scan.
    const box = p.locator('label:has-text("I have removed or covered every patient identifier") input, input[type=checkbox]').last();
    await box.check({ force: true }).catch(() => {}); await sleep(300);
    await p.locator('button:has-text("Use this image")').first().click().catch(() => {}); await sleep(2200);
    await shot(p, 'new-with-image', {});
    await p.locator('button:has-text("Save scan")').first().click().catch(() => {}); await sleep(2600);
    await shot(p, 'saved', {});
  }
}
if (want('signoff')) {
  await go(p, '#/signoff', 1800);
  for (const label of ['Lung and pleura', 'eFAST or FAFF']) { const el = p.locator(`label.pathcard:has-text("${label}")`).first(); if (await el.count()) { await el.click().catch(() => {}); await sleep(250); } }
  await p.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  await shot(p, 'signoff-pick', { send: 'button:has-text("Send a request")' });
  const send = p.locator('button:has-text("Send a request")').first();
  if (await send.count()) { await send.click(); await sleep(1600); const sel = p.locator('.sheet select, dialog select, select').first(); const opt = await sel.locator('option', { hasText: 'Whitfield' }).first().getAttribute('value').catch(() => null); if (opt != null) { await sel.selectOption(opt); await sleep(500); } await shot(p, 'signoff-send', {}); }
  await p.keyboard.press('Escape').catch(() => {});
}
if (want('signed')) { await go(p, '#/log?s=signed', 1600); await shot(p, 'log-signed', {}); }
if (want('export')) {
  await go(p, '#/export', 1800); await shot(p, 'export', {}); await shot(p, 'export-full', {}, { full: true }); await scrollShot(p, 'export-scroll');
  const ev = await w.call('learner', 'evidence', { destination: 'rcem', signedOnly: false, from: new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10) });
  if (ev && ev.code) {
    await p.goto(`${w.base}/app/verify/?code=${ev.code}`); await sleep(2200);
    await shot(p, 'verify-evidence', {});
    boxes.evidenceCode = ev.code;
  }
}
await L.ctx.close();

// The supervisor reviews from their own dashboard.
const S = await phone('sup');
const sp = S.page;
if (want('supervise')) {
  // A new request from the trainee, to review.
  await w.call('learner', 'signoff/request', { entryIds: ['film00entry', 'film01entry', 'film02entry'], supervisorLink: w.inv.id });
  await go(sp, '#/supervise', 1800); await shot(sp, 'supervise-home', {});
  const lid = await w.idOf(w.LEARNER.email);
  await go(sp, `#/supervise/${lid}`, 2000); await shot(sp, 'supervise-learner', { review: 'button:has-text("Review and sign")' });
  const rev = sp.locator('button:has-text("Review and sign")').first();
  if (await rev.count()) { await rev.click(); await sleep(2000); await shot(sp, 'supervise-sheet', {}); await shot(sp, 'supervise-sheet-full', {}, { full: true });
    // Review as a supervisor would: rate each scan, say how they know, comment, sign and confirm.
    await sp.evaluate(() => { document.querySelectorAll('.sheet label, .sheet button').forEach((el) => { if (/^s*Goods*$/.test(el.textContent)) el.click(); }); });
    await sleep(200);
    await sp.locator('.sheet :text("I reviewed the images")').first().click().catch(() => {});
    await sp.locator('.sheet textarea').first().fill('Good views and a clear interpretation. Well done.').catch(() => {});
    const cv = sp.locator('.sheet canvas').first();
    if (await cv.count()) { await cv.scrollIntoViewIfNeeded(); const b = await cv.boundingBox(); await sp.mouse.move(b.x + 30, b.y + b.height * 0.6); await sp.mouse.down(); for (let i = 0; i <= 70; i++) { const t = i / 70; const x = b.x + 30 + t * (b.width * 0.75) + Math.sin(t * 19) * 14; const y = b.y + b.height * (0.62 - 0.22 * Math.sin(t * 9.5) * Math.exp(-t * 1.2) - 0.08 * Math.cos(t * 23)); await sp.mouse.move(x, y); } await sp.mouse.up(); }
    await sp.locator('.sheet input[type=checkbox]').last().check({ force: true }).catch(() => {});
    await sleep(300);
    await scrollShot(sp, 'supervise-sheet-scroll', { sheet: true }); }
}
await S.ctx.close();

// The website, desktop and phone.
if (want('web')) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: 'reduce', locale: 'en-GB' });
  await ctx.addInitScript(() => { try { localStorage.setItem('wl-measure', 'off'); localStorage.setItem('wl-lang-offer', '1'); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  for (const [name, url] of [['web-home', '/'], ['web-training', '/training/'], ['web-courses', '/courses/'], ['web-logbook', '/pocus-logbook/']]) {
    await page.goto(w.base + url); await sleep(1500);
    await page.evaluate(() => { document.documentElement.classList.remove('js'); document.querySelectorAll('.reveal,.rise').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); });
    // Lazy images below the fold are never fetched in a still capture (they showed as grey blocks): load them all.
    await page.evaluate(async () => { const imgs = [...document.images]; imgs.forEach((i) => { i.loading = 'eager'; }); await Promise.all(imgs.map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); })))); });
    await sleep(400);
    await shot(page, name, {});
  }
  await page.goto(w.base + '/training/#international'); await sleep(1200);
  await page.evaluate(() => { document.querySelectorAll('.reveal,.rise').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); const s = document.getElementById('international'); if (s) window.scrollTo(0, s.offsetTop - 80); });
  await sleep(600); await shot(page, 'web-training-intl', {});
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(boxes, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
w.server.close();
process.exit(0);
