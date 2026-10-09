// Wavelength 1.0.11 checks in a browser, without a phone. Runs the real bundle (mobile/www) over the stand-in native
// bridge (tools/native-harness.mjs, with its WLNetwork stand-in) against a local Worker. Synthetic data only.
//
//   N  connectivity: a VPN with nothing under it, Flight mode with Wi-Fi on or off, recovery, retry storms, pausing
//   F  the scan form: every field and answer unchanged from a reference bundle, sections, labels, selections kept,
//      validation, guided scrolling, one scan per save
//   P  presentation: Home counts, pill, short warnings, About, themes, Arabic, reduced motion, text size
//   E  the photo and clip editors: flips, transform order, undo, export matches preview, clip duration and controls
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1011.mjs <outdir> [reference bundle dir for the field inventory] [http://localhost:8787]
// These are browser simulations: they do not replace the physical-device checklist.
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, setDevice, DEVICE, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1011-out');
const REF = process.argv[3] ? path.resolve(process.argv[3]) : '';
const API = process.argv[4] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-1011.mjs');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const reset = () => Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
const shot = (page, name, opt = {}) => page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opt });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VPN_ALONE = { connected: true, validated: false, vpn: true, transports: ['vpn'], id: '7', underlying: false, underlyingTransports: [] };
const VPN_WIFI = { connected: true, validated: true, vpn: true, transports: ['vpn', 'wifi'], id: '8', underlying: true, underlyingTransports: ['wifi'] };
const VPN_CELL = { connected: true, validated: true, vpn: true, transports: ['cellular', 'vpn'], id: '9', underlying: true, underlyingTransports: ['cellular'] };
const WIFI = { ...DEVICE.wifi, underlying: true, underlyingTransports: ['wifi'] };
const NONE = { ...DEVICE.none, underlying: false, underlyingTransports: [] };

async function account() {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'Clinician', email: `v1011${t}@example.com`, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id };
}
async function serverEntries(learner) {
  const rows = await fetch(API + '/__dev/entries').then((r) => r.json());
  return rows.filter((r) => r.learner_id === learner && !r.deleted);
}
async function waitServer(learner, n, limit) {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) { if ((await serverEntries(learner)).length >= n) return Date.now() - t0; await sleep(250); }
  return null;
}
// The simulated network survives reloads: setNet() stores it, the init script reads it back.
const setNet = (page, dev) => page.evaluate((d) => { localStorage.setItem('__netdev', JSON.stringify(d)); window.__netdev = d; if (window.__fire) window.__fire('WLNetwork', 'networkStatusChange', d); }, dev);
async function phone({ width = 390, height = 844, device = WIFI, reduced = false, dark = false, lang = '', acc = null, bundle = WWW } = {}) {
  reset();
  serve.dir = bundle;
  acc = acc || await account();
  const init = [`window.__netdev = JSON.parse(localStorage.getItem('__netdev') || 'null') || ${JSON.stringify(device)};`];
  if (dark) init.push(`localStorage.setItem('wl-theme', 'dark');`);
  if (lang) init.push(`localStorage.setItem('wl-lang', ${JSON.stringify(lang)});`);
  const { ctx, page } = await newApp(width, height, { init });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  // Count every sync attempt the app makes (POST /api/app/sync), to prove there is no retry storm.
  page.__syncs = [];
  page.on('request', (r) => { if (/\/api\/app\/sync$/.test(r.url()) && r.method() === 'POST') page.__syncs.push(Date.now()); });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(700);
  return { ctx, page, acc };
}
const reload = async (page) => { await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs', { timeout: 15000 }); await sleep(500); };
const pill = (page) => page.evaluate(() => { const b = document.querySelector('button.sync-pill'); return b ? { text: b.textContent.trim(), cls: b.className } : null; });
const bannerText = (page) => page.evaluate(() => { const b = document.querySelector('[data-syncbanner]'); return b && !b.hidden ? b.textContent : ''; });
function seed(page, id, entries) {
  return page.evaluate(([id, entries]) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const tx = r.result.transaction(['entries'], 'readwrite'); entries.forEach((e) => tx.objectStore('entries').put(e)); tx.oncomplete = () => { r.result.close(); ok(); }; };
  }), [id, entries]);
}
const dirtyEntry = (acc, i) => ({ id: 'n' + i + 'x' + acc.id + Date.now(), type: 'aaa', date: new Date().toISOString().slice(0, 10), supervision: 'direct', createdAt: Date.now(), updatedAt: 0, _dirty: true, _new: true });
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);

// ---------- N: connectivity ----------
if (want('N')) {
  // N1: Flight mode on, Wi-Fi and mobile data off, NordVPN still shows a connected VPN network with nothing under it.
  {
    const { ctx, page, acc } = await phone();
    await seed(page, acc.id, [dirtyEntry(acc, 1)]);
    net.offline = true; await setNet(page, VPN_ALONE); await reload(page); await sleep(2500);
    const p = await pill(page), b = await bannerText(page);
    record('N1', 'VPN interface with no network under it: red Offline, not amber Can\'t sync', /Offline/.test(p.text) && /p-bad/.test(p.cls) && /You're offline/.test(b) && /1 scan saved on this device, awaiting sync/.test(b), `pill "${p.text}" ${p.cls}; banner "${b}"`);
    await shot(page, 'N1-vpn-alone-offline');
    await page.click('button.sync-pill'); await page.waitForSelector('.sheet [data-syncpanel] .sync-help');
    const det = await page.evaluate(() => ({ text: document.querySelector('.sheet [data-syncpanel]').textContent, retry: (() => { const b = document.querySelector('.sheet [data-resync]'); return b ? { disabled: b.disabled, busy: b.getAttribute('aria-busy') } : null; })() }));
    record('N1b', 'Details explain the VPN shows connected with no Wi-Fi or mobile data under it, and the VPN can stay on', /VPN on, with no Wi-Fi or mobile data under it/.test(det.text) && /VPN shows as connected, but this device has no Wi-Fi/.test(det.text) && /Your VPN can stay on/.test(det.text), det.text.slice(0, 220));
    record('N1c', 'Retry is unavailable while there is no network, with the reason given (not shown as busy)', det.retry && det.retry.disabled && det.retry.busy !== 'true' && /Available once this device has a network/.test(det.text), JSON.stringify(det.retry));
    await shot(page, 'N1b-vpn-alone-details');
    await page.keyboard.press('Escape'); await sleep(200);
    // N2: Wi-Fi switched back on while Flight mode stays on; the VPN reconnects over it.
    net.offline = false; await setNet(page, VPN_WIFI);
    const t = await waitServer(acc.id, 1, 15000);
    record('N2', 'Flight mode with Wi-Fi re-enabled under the VPN: the waiting scan syncs within 5 s of the change', t !== null && t <= 5000, t === null ? 'not synced' : `synced ${t} ms after the event`);
    await ctx.close();
  }
  // N3: Wi-Fi with VPN, server unreachable: amber.
  {
    const { ctx, page, acc } = await phone({ device: VPN_WIFI });
    await seed(page, acc.id, [dirtyEntry(acc, 2)]);
    net.blocked = true; await reload(page); await sleep(2500);
    const p = await pill(page), b = await bannerText(page);
    record('N3', 'Wi-Fi under the VPN, server unreachable: amber Can\'t sync with a short banner', /Can't sync/.test(p.text) && /p-warn/.test(p.cls) && /Can't connect to Wavelength/.test(b) && b.length < 140, `pill "${p.text}"; banner (${b.length} chars) "${b}"`);
    // N4: no retry storm. Navigate between screens 40 times and open and close the sync details 10 times in about
    // 40 s while the server stays unreachable. Only the back-off schedule may make attempts.
    page.__syncs.length = 0;
    const t0 = Date.now();
    const screens = ['#/log', '#/progress', '#/me', '#/', '#/settings'];
    for (let i = 0; i < 40; i++) { await go(page, screens[i % screens.length]); await sleep(450); if (i % 4 === 0) { await page.evaluate(() => { const b = document.querySelector('button.sync-pill'); b && b.click(); }); await sleep(250); await page.keyboard.press('Escape'); await sleep(150); } }
    const span = Date.now() - t0, n = page.__syncs.length;
    // Back-off: 2, 5, 10, 20, 30 s apart (±20%): at most 5 attempts in 40 to 45 s, plus one that may be in flight.
    record('N4', 'Repeated navigation and opening or closing the sync panel make no extra attempts (no retry storm)', n <= 6, `${n} attempts in ${Math.round(span / 1000)} s of navigation`);
    // N5: a quiet automatic retry does not disable or relabel Retry sync (the flicker seen in testing).
    await go(page, '#/'); await sleep(400);
    const samples = [];
    for (let i = 0; i < 60; i++) { samples.push(await page.evaluate(() => { const b = document.querySelector('[data-sbretry]'); return b ? (b.disabled ? 'disabled' : 'ok') : 'none'; })); await sleep(250); }
    record('N5', 'Retry sync stays usable during quiet automatic retries (never flickers to disabled)', samples.every((s) => s === 'ok'), samples.join('').replace(/ok/g, '.').replace(/disabled/g, 'D').replace(/none/g, '-'));
    // N6: Retry tapped during an automatic attempt: says Trying… while the learner's own attempt runs.
    net.delay = 1500; net.blocked = false;
    await page.click('[data-sbretry]'); await sleep(200);
    const busy = await page.evaluate(() => { const b = document.querySelector('[data-sbretry]'); return b ? { t: b.textContent, d: b.disabled, a: b.getAttribute('aria-busy') } : null; });
    record('N6', 'Retry sync shows Trying… (busy) while the attempt the learner asked for runs', busy && busy.d && busy.a === 'true' && /Trying/.test(busy.t), JSON.stringify(busy));
    const t = await waitServer(acc.id, 1, 10000);
    record('N7', 'Pending scan is acknowledged by the server after recovery, exactly once', t !== null && (await serverEntries(acc.id)).length === 1, t === null ? 'not synced' : `synced, ${(await serverEntries(acc.id)).length} copy`);
    await ctx.close();
  }
  // N8: the app in the background makes no attempts; returning soon after an attempt does not burst; a longer
  // absence retries at once.
  {
    const { ctx, page, acc } = await phone({ device: WIFI });
    await seed(page, acc.id, [dirtyEntry(acc, 3)]);
    net.blocked = true; await reload(page); await sleep(9000); // a few failures: the gaps are now 10 s and longer
    await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: false }));
    page.__syncs.length = 0;
    await sleep(35000);
    const inBg = page.__syncs.length;
    record('N8', 'No sync attempts while the app is in the background (35 s with the server unreachable)', inBg === 0, `${inBg} attempts`);
    // Quick trips (camera, share sheet) in a row: one attempt at most.
    for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: true })); await sleep(300); await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: false })); await sleep(300); }
    await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: true }));
    await sleep(800);
    const bursts = page.__syncs.length;
    record('N9', 'Six quick trips away and back in 4 s: at most one attempt, not one per return', bursts <= 1, `${bursts} attempts`);
    // Server reachable again: the scan is retried by the schedule and acknowledged (no network event needed).
    net.blocked = false;
    const t = await waitServer(acc.id, 1, 70000);
    record('N10', 'Recovery does not depend on a network event: the scheduled retry sends the scan', t !== null, t === null ? 'not synced in 70 s' : `synced ${Math.round(t / 1000)} s after the server came back`);
    await ctx.close();
  }
  // N11: rapid, repeated and flapping network callbacks (a VPN reconnect loop) are rate-limited.
  {
    const { ctx, page, acc } = await phone({ device: VPN_WIFI });
    await seed(page, acc.id, [dirtyEntry(acc, 4)]);
    net.blocked = true; await reload(page); await sleep(3000);
    page.__syncs.length = 0;
    for (let i = 0; i < 30; i++) { await setNet(page, i % 3 === 0 ? VPN_ALONE : i % 3 === 1 ? { ...VPN_WIFI, id: String(100 + i) } : VPN_CELL); await sleep(100); }
    await sleep(6000);
    record('N11', '30 network callbacks in 3 s (VPN reconnect loop): rate-limited, not one attempt each', page.__syncs.length <= 2, `${page.__syncs.length} attempts`);
    // N12: mobile data under the VPN, server reachable: synced.
    net.blocked = false; await setNet(page, { ...VPN_CELL, id: '200' });
    const t = await waitServer(acc.id, 1, 15000);
    const p = await pill(page);
    record('N12', 'Mobile data with the VPN on, server reachable: synced', t !== null && /Synced|Syncing/.test(p.text), `${t} ms; pill "${p.text}"`);
    await ctx.close();
  }
  // N13: Wi-Fi without VPN and Flight mode with Wi-Fi off (no default network).
  {
    const { ctx, page, acc } = await phone({ device: WIFI });
    await seed(page, acc.id, [dirtyEntry(acc, 5)]);
    net.offline = true; await setNet(page, NONE); await reload(page); await sleep(2000);
    const p = await pill(page);
    record('N13', 'Flight mode, Wi-Fi off, no VPN: red Offline', /Offline/.test(p.text) && /p-bad/.test(p.cls), p.text);
    net.offline = false; await setNet(page, WIFI);
    const t = await waitServer(acc.id, 1, 15000);
    record('N14', 'Wi-Fi without VPN restored: syncs within 5 s', t !== null && t <= 5000, String(t));
    await ctx.close();
  }
}

// ---------- F: the scan form ----------
// Every control of the scan form for every application: name, value and type, in order. Presentation may change;
// this must not.
async function inventory(page) {
  const types = await page.evaluate(() => [...document.querySelectorAll('input[name=type]')].map((i) => i.value));
  const out = {};
  for (const t of types) {
    await page.evaluate((t) => { const i = [...document.querySelectorAll('input[name=type]')].find((x) => x.value === t); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }, t);
    await sleep(60);
    out[t] = await page.evaluate(() => [...document.querySelectorAll('#ef input, #ef select, #ef textarea')].filter((c) => c.name && c.name !== 'type' && c.type !== 'file').map((c) => c.tagName === 'SELECT' ? c.name + '=[' + [...c.options].map((o) => o.value).join('|') + ']' : c.name + ':' + c.type + (c.type === 'radio' || c.type === 'checkbox' ? '=' + c.value : '')).sort());
  }
  return { types: types.slice().sort(), out };
}
if (want('F')) {
  if (REF) {
    const a = await phone({ bundle: REF });
    await go(a.page, '#/new'); await sleep(500);
    const before = await inventory(a.page);
    await a.ctx.close();
    const b = await phone();
    await go(b.page, '#/new'); await sleep(500);
    const after = await inventory(b.page);
    await b.ctx.close();
    const diffs = [];
    for (const t of before.types) { const x = (before.out[t] || []).join('\n'), y = (after.out[t] || []).join('\n'); if (x !== y) diffs.push(t); }
    const nControls = Object.values(after.out).reduce((n, l) => n + l.length, 0);
    record('F0', 'Every application, finding, answer and field name is identical to the reference bundle', before.types.join() === after.types.join() && !diffs.length, `${before.types.length} applications, ${nControls} controls compared; differences: ${diffs.join(', ') || 'none'}`);
    fs.writeFileSync(path.join(OUT, 'form-inventory.json'), JSON.stringify({ reference: REF, before, after }, null, 1));
  }
  const { ctx, page, acc } = await phone();
  await go(page, '#/new?type=cardiac');
  await sleep(150);
  const early = await page.evaluate(() => ({ y: scrollY, picked: !!document.querySelector('input[name=type]:checked + label.picked') }));
  await sleep(1300);
  const pos = await page.evaluate(() => { const head = document.querySelector('.top').getBoundingClientRect().bottom, row = document.getElementById('date').closest('.two').getBoundingClientRect(), ae = document.activeElement; return { y: scrollY, gap: Math.round(row.top - head), focus: ae && ae.tagName, marked: document.getElementById('date').closest('.two').classList.contains('next-up') }; });
  record('F1', 'Log one: the chosen application is shown and marked before the form moves (no instant jump)', early.y === 0 && early.picked, JSON.stringify(early));
  record('F2', 'Log one: then glides to the date, which sits in view below the header, and marks it; nothing focused', pos.y > 100 && pos.gap >= 0 && pos.gap < 160 && pos.marked && !['INPUT', 'SELECT', 'TEXTAREA'].includes(pos.focus), JSON.stringify(pos));
  // The glide is eased over several frames, not one jump.
  await go(page, '#/'); await sleep(400);
  await go(page, '#/new?type=aaa');
  const ys = [];
  for (let i = 0; i < 45; i++) { ys.push(await page.evaluate(() => Math.round(scrollY))); await sleep(30); }
  const steps = new Set(ys.filter((y) => y > 0)).size;
  record('F3', 'The scroll to the date moves through intermediate positions (eased, not a snap)', steps >= 4, `${steps} distinct positions: ${ys.join(',')}`);
  // F4: sections and labels.
  const sec = await page.evaluate(() => [...document.querySelectorAll('#ef section.fs')].filter((s) => s.offsetParent).map((s) => ({ h: s.querySelector('h2').textContent, labelled: s.getAttribute('aria-labelledby') === s.querySelector('h2').id })));
  const wantSec = ['Application', 'Scan details', 'Examination findings', 'Interpretation and quality', 'Confirmation and clinical impact', 'Supervision', 'Images and clips', 'Reflection', 'Accreditation pathways'];
  record('F4', 'Form shows the nine labelled sections in order', JSON.stringify(sec.map((s) => s.h)) === JSON.stringify(wantSec) && sec.every((s) => s.labelled), sec.map((s) => s.h).join(' > '));
  const groups = await page.evaluate(() => [...document.querySelectorAll('#ef .seg')].filter((g) => g.offsetParent).map((g) => ({ role: g.getAttribute('role'), label: (document.getElementById(g.getAttribute('aria-labelledby') || '') || {}).textContent || '' })));
  record('F5', 'Every answer group is a labelled radiogroup or group for screen readers', groups.length > 5 && groups.every((g) => /radiogroup|group/.test(g.role) && g.label), `${groups.length} groups; ${groups.filter((g) => !g.label).length} unlabelled`);
  // F6: the three levels look different: section title, question label, answer chip.
  const typo = await page.evaluate(() => { const st = (el) => { const c = getComputedStyle(el); return { size: parseFloat(c.fontSize), weight: +c.fontWeight, bg: c.backgroundColor }; }; return { h: st(document.querySelector('#fs-findings .fs-h h2')), head: st(document.querySelector('#fs-findings .fs-h')), q: st(document.querySelector('#findings .lab')), chip: st(document.querySelector('#findings .seg label')), card: st(document.querySelector('#fs-findings')) }; });
  record('F6', 'Three levels: section header band differs from the card; questions heavier than answers', typo.head.bg !== typo.card.bg && typo.q.weight > typo.chip.weight && typo.h.weight >= typo.q.weight, JSON.stringify(typo));
  // F7: selections survive a status change, offline, backgrounding and a validation error.
  const pick = (name, value) => page.evaluate(([n, v]) => { const i = [...document.querySelectorAll('input[name="' + n + '"]')].find((x) => x.value === v); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }, [name, value]);
  await go(page, '#/'); await sleep(300);
  await go(page, '#/new?type=cardiac'); await sleep(1500);
  await pick('f.lv', 'Reduced'); await pick('f.views', 'PLAX'); await pick('f.views', 'A4C'); await pick('overall', 'Abnormal'); await pick('quality', 'Limited');
  await page.fill('#interp', 'Synthetic interpretation');
  net.offline = true; await setNet(page, NONE); await sleep(1500);
  await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: false })); await sleep(500);
  await page.evaluate(() => window.__fire('App', 'appStateChange', { isActive: true })); await sleep(800);
  await page.click('form button[type=submit]'); await sleep(900); // supervision missing
  const kept = await page.evaluate(() => ({ lv: (document.querySelector('input[name="f.lv"]:checked') || {}).value, views: [...document.querySelectorAll('input[name="f.views"]:checked')].map((i) => i.value).join('+'), overall: (document.querySelector('input[name=overall]:checked') || {}).value, quality: (document.querySelector('input[name=quality]:checked') || {}).value, interp: document.getElementById('interp').value, invalid: (document.querySelector('.field.invalid') || {}).dataset?.req, inView: (() => { const f = document.querySelector('.field.invalid'); if (!f) return false; const r = f.getBoundingClientRect(); return r.top >= document.querySelector('.top').getBoundingClientRect().bottom - 2 && r.top < innerHeight; })(), secMarked: !!document.querySelector('#fs-supervision .fs-h') && getComputedStyle(document.querySelector('#fs-supervision .fs-h')).backgroundColor !== getComputedStyle(document.querySelector('#fs-interp .fs-h')).backgroundColor }));
  record('F7', 'Answers kept through offline, backgrounding and a validation error; missing supervision marked and in view', kept.lv === 'Reduced' && kept.views === 'PLAX+A4C' && kept.overall === 'Abnormal' && kept.quality === 'Limited' && kept.interp === 'Synthetic interpretation' && kept.invalid === 'supervision' && kept.inView && kept.secMarked, JSON.stringify(kept));
  await shot(page, 'F7-validation-supervision');
  // F8: one scan per save, however many taps; saved values exactly as chosen.
  await pick('supervision', 'direct');
  const before = (await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.length); }; }; }), acc.id));
  await page.evaluate(() => { const b = document.querySelector('form button[type=submit]'); for (let i = 0; i < 5; i++) b.click(); });
  await page.waitForFunction(() => location.hash === '#/', null, { timeout: 10000 }).catch(() => {});
  await sleep(600);
  const saved = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result); }; }; }), acc.id);
  const e = saved.find((x) => x.type === 'cardiac');
  record('F8', 'Five quick Save taps make exactly one scan, with every answer saved as chosen', saved.length - before === 1 && e && e.findings.lv === 'Reduced' && e.findings.views.join() === 'PLAX,A4C' && e.overall === 'Abnormal' && e.quality === 'Limited' && e.supervision === 'direct', `${saved.length - before} new; ${JSON.stringify(e && { f: e.findings, o: e.overall, q: e.quality, s: e.supervision })}`);
  const note = await page.evaluate(() => (document.querySelector('.toast.act') || {}).textContent || '');
  record('F9', 'Saved offline: the note says saved on this device, awaiting sync (never "synced")', /Saved on this device\. Awaiting sync\./.test(note) && !/synced\b/i.test(note.replace('Awaiting sync', '')), note);
  await ctx.close();
}

// ---------- P: presentation ----------
if (want('P')) {
  for (const dark of [false, true]) {
    const { ctx, page } = await phone({ dark });
    const tiles = await page.evaluate(() => [...document.querySelectorAll('.hero a.stat')].map((a) => { const c = getComputedStyle(a); return { label: a.getAttribute('aria-label'), arrow: !!a.querySelector('.stat-go'), shadow: c.boxShadow !== 'none', h: a.getBoundingClientRect().height }; }));
    record('P1' + (dark ? 'd' : ''), `Home counts are raised links with an arrow and a spoken name (${dark ? 'dark' : 'light'})`, tiles.length === 4 && tiles.every((t) => t.arrow && t.shadow && /Show these records/.test(t.label) && t.h >= 48), JSON.stringify(tiles[0]));
    const contrast = await page.evaluate(() => {
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      // The first background behind the text that is mostly opaque (a faint tint is skipped: what shows is beneath it).
      const bg = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; const a = /rgba/.test(c) ? +c.match(/[\d.]+/g)[3] : 1; if (c && c !== 'transparent' && a >= 0.5) return c; el = el.parentElement; } return 'rgb(255,255,255)'; };
      location.hash = '#/new?type=cardiac';
      return new Promise((ok) => setTimeout(() => {
        const i = document.querySelector('#findings .seg input'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true }));
        const pairs = { section: document.querySelector('#fs-findings .fs-h h2'), question: document.querySelector('#findings .lab'), chip: document.querySelector('#findings .seg input:not(:checked) + label'), selected: document.querySelector('#findings .seg input:checked + label'), hint: document.querySelector('#fs-media .hint') };
        const out = {}; for (const [k, el] of Object.entries(pairs)) out[k] = el ? +ratio(getComputedStyle(el).color, bg(el)).toFixed(2) : 0;
        ok(out);
      }, 900));
    });
    record('P2' + (dark ? 'd' : ''), `Text contrast in the form meets WCAG AA (4.5:1) (${dark ? 'dark' : 'light'})`, Object.values(contrast).every((v) => v >= 4.5), JSON.stringify(contrast));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('P3' + (dark ? 'd' : ''), `No horizontal overflow on the form (${dark ? 'dark' : 'light'})`, overflow <= 1, String(overflow));
    await ctx.close();
  }
  // Touch targets on the form's answers.
  {
    const { ctx, page } = await phone({ width: 320, height: 640 });
    await go(page, '#/new?type=cardiac'); await sleep(1500);
    const smallList = await page.evaluate(() => [...document.querySelectorAll('#ef .seg label, #ef button, #ef label.check')].filter((x) => x.offsetParent).filter((x) => { const r = x.getBoundingClientRect(); return r.height < 24 || r.width < 24; }).map((x) => x.outerHTML.slice(0, 60) + ' ' + Math.round(x.getBoundingClientRect().height))); const small = smallList.length; 
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('P4', 'Small phone (320 px): every answer, button and tick box row at least 24 px, no horizontal overflow', !small && over <= 1, `${small} small targets ${smallList.join('; ')}, overflow ${over}`);
    await shot(page, 'P4-320px-form', { fullPage: false });
    await ctx.close();
  }
  // Text enlarged to 130%: no overflow.
  {
    const { ctx, page } = await phone();
    await page.addStyleTag({ content: 'html{font-size:130%} body{font-size:20.8px}' });
    await go(page, '#/new?type=cardiac'); await sleep(1500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record('P5', 'Larger text: no horizontal overflow on the form', over <= 1, String(over));
    await ctx.close();
  }
  // Arabic, right to left.
  {
    const { ctx, page } = await phone({ lang: 'ar' });
    await go(page, '#/new?type=cardiac'); await sleep(1500);
    const r = await page.evaluate(() => ({ dir: document.documentElement.dir, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, h: document.querySelector('#fs-findings h2').textContent, en: /Examination findings|Scan details|Accreditation pathways/.test(document.querySelector('#ef').textContent) }));
    record('P6', 'Arabic: right to left, sections translated, no overflow', r.dir === 'rtl' && r.over <= 1 && !r.en, JSON.stringify(r));
    await shot(page, 'P6-arabic-form');
    await ctx.close();
  }
  // Reduced motion: the Log one move happens at once, nothing animates.
  {
    const { ctx, page } = await phone({ reduced: true });
    await go(page, '#/new?type=aaa');
    const ys = [];
    for (let i = 0; i < 20; i++) { ys.push(await page.evaluate(() => Math.round(scrollY))); await sleep(30); }
    const steps = new Set(ys.filter((y) => y > 0)).size;
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('main')).animationName);
    record('P7', 'Reduced motion: Log one goes straight to the date (no glide), no screen animation', steps <= 1 && ys[ys.length - 1] > 100 && anim === 'none', `positions ${[...new Set(ys)].join(',')}; animation ${anim}`);
    await ctx.close();
  }
  // Me has no About entry; Settings has one.
  {
    const { ctx, page } = await phone();
    await go(page, '#/me'); await sleep(400);
    const me = await page.evaluate(() => document.querySelectorAll('[data-about]').length);
    await go(page, '#/settings'); await sleep(400);
    const st = await page.evaluate(() => document.querySelectorAll('[data-about]').length);
    record('P8', 'About Wavelength appears once, in Settings, not on Me', me === 0 && st === 1, `Me ${me}, Settings ${st}`);
    await ctx.close();
  }
}

// ---------- E: editors ----------
// A synthetic test image: four coloured quadrants and an R marker, so every flip and rotation is measurable.
async function testImage(ctxPage) {
  const page = await ctxPage.context().newPage();
  await page.goto('about:blank');
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#00ff00'; g.fillRect(200, 0, 200, 150); g.fillStyle = '#0000ff'; g.fillRect(0, 150, 200, 150); g.fillStyle = '#ffff00'; g.fillRect(200, 150, 200, 150);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png'); }));
  await page.close();
  const f = path.join(OUT, 'quadrants.png'); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
async function testClip(ctxPage, secs, noDuration) {
  const f = path.join(OUT, `clip-${secs}s.webm`);
  if (fs.existsSync(f)) return f;
  const page = await ctxPage.context().newPage();
  await page.goto('about:blank');
  const b64 = await page.evaluate((secs) => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now(); let raf;
    const tick = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#00ff00'; g.fillRect(160, 0, 160, 120); g.fillStyle = '#0000ff'; g.fillRect(0, 120, 160, 120); g.fillStyle = '#ffff00'; g.fillRect(160, 120, 160, 120); g.fillStyle = '#fff'; g.fillRect(150 + Math.sin(t * 4) * 20, 110, 20, 20); if (t >= secs) { rec.stop(); return; } raf = requestAnimationFrame(tick); };
    rec.onstop = () => { cancelAnimationFrame(raf); const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); };
    rec.start(250); tick();
  }), secs);
  await page.close();
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}
// The colour at a relative point of a blob (image) or of the first frame of a clip, read in a page.
const QUAD = { tl: [0.25, 0.25], tr: [0.75, 0.25], bl: [0.25, 0.75], br: [0.75, 0.75] };
const name = (rgb) => { const [r, g, b] = rgb; return r > 180 && g > 180 && b < 90 ? 'yellow' : r > 180 && g < 90 ? 'red' : g > 180 && r < 90 ? 'green' : b > 180 && r < 90 ? 'blue' : r > 200 && g > 200 && b > 200 ? 'white' : r < 40 && g < 40 && b < 40 ? 'black' : 'rgb(' + rgb.join(',') + ')'; };
async function sampleCanvas(page, sel) {
  return page.evaluate(([sel, Q]) => { const c = document.querySelector(sel); const g = c.getContext('2d'); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); return o; }, [sel, QUAD]);
}
if (want('E')) {
  const { ctx, page } = await phone();
  const img = await testImage(page);
  await go(page, '#/new?type=aaa'); await sleep(1500);
  const openEditor = async () => { await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas'); await sleep(400); };
  await openEditor();
  const tools = await page.evaluate(() => [...document.querySelectorAll('.editor [data-m], .editor [data-a]')].map((b) => ({ a: b.dataset.m || b.dataset.a, label: b.getAttribute('aria-label') || b.textContent.trim(), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })));
  const need = ['crop', 'cover', 'trim', 'rotate', 'fliph', 'flipv'];
  record('E1', 'Photo editor offers Crop, Cover, Trim top, Rotate, Flip horizontally, Flip vertically, each at least 44 px tall', need.every((k) => tools.some((t) => t.a === k && t.h >= 44)) && tools.some((t) => t.a === 'fliph' && /Flip horizontally/.test(t.label)) && tools.some((t) => t.a === 'flipv' && /Flip vertically/.test(t.label)), tools.map((t) => t.a + '(' + Math.round(t.h) + ')').join(' '));
  await shot(page, 'E1-photo-editor');
  const q0 = await sampleCanvas(page, '.editor canvas');
  await page.click('.editor [data-a=fliph]'); await sleep(150);
  const qh = await sampleCanvas(page, '.editor canvas');
  record('E2', 'Flip horizontally mirrors the preview left to right', name(qh.tl) === 'green' && name(qh.tr) === 'red' && name(qh.bl) === 'yellow', JSON.stringify(Object.fromEntries(Object.entries(qh).map(([k, v]) => [k, name(v)]))));
  await page.click('.editor [data-a=flipv]'); await sleep(150);
  const qhv = await sampleCanvas(page, '.editor canvas');
  record('E3', 'Flip vertically then turns it top to bottom; both together equal a half turn', name(qhv.tl) === 'yellow' && name(qhv.br) === 'red', JSON.stringify(Object.fromEntries(Object.entries(qhv).map(([k, v]) => [k, name(v)]))));
  await page.click('.editor [data-a=undo]'); await sleep(120); await page.click('.editor [data-a=undo]'); await sleep(120);
  const qu = await sampleCanvas(page, '.editor canvas');
  record('E4', 'Undo reverses each flip in turn, back to the original', JSON.stringify(qu) === JSON.stringify(q0), JSON.stringify(Object.fromEntries(Object.entries(qu).map(([k, v]) => [k, name(v)]))));
  // Rotate then flip horizontally: the order shown is the order applied.
  await page.click('.editor [data-a=rotate]'); await sleep(120); await page.click('.editor [data-a=fliph]'); await sleep(150);
  const rf = await sampleCanvas(page, '.editor canvas');
  const dims = await page.evaluate(() => { const c = document.querySelector('.editor canvas'); return [c.width, c.height]; });
  // Rotated a quarter turn clockwise: blue top-left, red top-right; then mirrored: red top-left, blue top-right.
  record('E5', 'Rotate then flip: applied in the order shown (red top-left, blue top-right), size swapped', name(rf.tl) === 'red' && name(rf.tr) === 'blue' && dims[0] < dims[1], JSON.stringify({ dims, tl: name(rf.tl), tr: name(rf.tr) }));
  // Cover then flip: the cover moves with the image (it is in the pixels, not an overlay).
  await page.click('.editor [data-m=cover]');
  const box = await page.evaluate(() => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + box.w * 0.05, box.y + box.h * 0.05); await page.mouse.down(); await page.mouse.move(box.x + box.w * 0.45, box.y + box.h * 0.4, { steps: 5 }); await page.mouse.up(); await sleep(150);
  await page.click('.editor [data-a=flipv]'); await sleep(150);
  const cov = await sampleCanvas(page, '.editor canvas');
  record('E6', 'Cover then flip: the black cover is part of the image and moves with it (now bottom left)', name(cov.bl) === 'black' && name(cov.tl) !== 'black', JSON.stringify(Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, name(v)]))));
  const transforms = await page.evaluate(() => document.querySelector('.editor [data-applied]') ? document.querySelector('.editor [data-applied]').textContent : '');
  record('E7', 'The editor states which orientation changes are applied', /Rotated|Flipped/.test(transforms), transforms);
  // Save: the saved JPEG equals the preview (same orientation and cover).
  await page.check('.editor [data-decl]', { force: true });
  await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' }); await sleep(300);
  const savedQ = await page.evaluate((Q) => new Promise((ok) => { const im = document.querySelector('#gal img'); const done = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); ok({ o, w: im.naturalWidth, h: im.naturalHeight }); }; if (im.complete && im.naturalWidth) done(); else im.onload = done; }), QUAD);
  record('E8', 'Saved image (thumbnail) matches the edited preview: same orientation, cover burnt in', name(savedQ.o.bl) === 'black' && Object.keys(cov).every((k) => name(cov[k]) === name(savedQ.o[k])) && savedQ.w < savedQ.h, JSON.stringify({ w: savedQ.w, h: savedQ.h, q: Object.fromEntries(Object.entries(savedQ.o).map(([k, v]) => [k, name(v)])) }));
  // The declaration stays mandatory.
  await openEditor();
  const blocked = await page.evaluate(() => document.querySelector('.editor [data-a=save]').disabled);
  record('E9', 'Use this image stays disabled until the identifier declaration is ticked', blocked, String(blocked));
  await page.click('.editor [data-a=cancel]'); await sleep(200);

  // Clip editor: a 14 s clip whose file has no duration (as MediaRecorder files often do).
  const clip = await testClip(page, 14);
  await page.setInputFiles('#vpick', clip); await page.waitForSelector('.editor video, .editor canvas'); await sleep(2500);
  const ui = await page.evaluate(() => { const q = (s) => document.querySelector('.editor ' + s); return { play: !!q('[data-a=play]'), scrub: !!q('[data-scrub]'), start: (q('[data-st]') || {}).textContent, end: (q('[data-en]') || {}).textContent, len: (q('[data-ln]') || {}).textContent, total: (q('[data-total]') || {}).textContent, fliph: !!q('[data-a=fliph]'), flipv: !!q('[data-a=flipv]'), rotate: !!q('[data-a=rotate]') }; });
  record('E10', 'Clip editor: Play/Pause, scrubber, start, end, selected length and total duration shown', ui.play && ui.scrub && ui.start && ui.end && ui.len && ui.total, JSON.stringify(ui));
  record('E11', 'Clip of unknown duration in its file: real length found (about 14 s), selection limited to 10 s', /^1[34]\.\d/.test(ui.total || '') && parseFloat(ui.len) <= 10, `total "${ui.total}", selected "${ui.len}"`);
  await shot(page, 'E10-clip-editor');
  // Move the start near the end: the end and length follow, never past the clip.
  await page.evaluate(() => { const s = document.querySelector('.editor [data-start]'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(800);
  const late = await page.evaluate(() => ({ st: parseFloat(document.querySelector('.editor [data-st]').textContent), en: parseFloat(document.querySelector('.editor [data-en]').textContent), ln: parseFloat(document.querySelector('.editor [data-ln]').textContent), total: parseFloat(document.querySelector('.editor [data-total]').textContent) }));
  record('E12', 'Start moved to the end: end never passes the clip, length = end − start, at least 1 s', late.en <= late.total + 0.05 && Math.abs(late.en - late.st - late.ln) < 0.11 && late.ln >= 1, JSON.stringify(late));
  // Play/pause.
  await page.evaluate(() => { const s = document.querySelector('.editor [data-start]'); s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(500);
  await page.click('.editor [data-a=play]'); await sleep(1200);
  const playing = await page.evaluate(() => { const v = document.querySelector('.editor video'); return { paused: v.paused, t: v.currentTime, label: document.querySelector('.editor [data-a=play]').getAttribute('aria-label') }; });
  await page.click('.editor [data-a=play]'); await sleep(200);
  const paused = await page.evaluate(() => document.querySelector('.editor video').paused);
  record('E13', 'Play previews the selection and Pause stops it', !playing.paused && playing.t > 0.5 && /Pause/.test(playing.label) && paused, JSON.stringify({ playing, paused }));
  // Flip horizontally on the clip, then save: the exported first frame is mirrored like the preview.
  await page.click('.editor [data-a=fliph]'); await sleep(300);
  const pv = await sampleCanvas(page, '.editor canvas');
  await page.evaluate(() => { const l = document.querySelector('.editor [data-len]'); l.value = 2; l.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(200);
  await page.check('.editor [data-decl]', { force: true });
  await page.click('.editor [data-a=save]');
  const prog = [];
  for (let i = 0; i < 30; i++) { const t = await page.evaluate(() => { const b = document.querySelector('.editor [data-a=save]'); return b ? b.textContent : 'closed'; }); prog.push(t); if (t === 'closed') break; await sleep(250); }
  await page.waitForSelector('.editor', { state: 'detached', timeout: 20000 }).catch(() => {});
  record('E14', 'Preparing a clip shows progress and the editor closes when done', prog.some((t) => /Preparing clip/.test(t)) && prog[prog.length - 1] === 'closed', prog.filter((t, i) => i === 0 || t !== prog[i - 1]).join(' > '));
  const exp = await page.evaluate((Q) => new Promise((ok) => {
    const d = window.__lastClip; if (!d) return ok(null);
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(d.blob);
    v.onloadeddata = () => { v.currentTime = 0.2; };
    v.onseeked = () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); ok({ o, dur: d.dur, flips: d.edits }); };
    v.onerror = () => ok({ error: true });
  }), QUAD).catch((e) => ({ error: String(e) }));
  record('E15', 'Exported clip frames match the edited preview (mirrored: green top-left, red top-right)', exp && exp.o && name(exp.o.tl) === name(pv.tl) && name(exp.o.tr) === name(pv.tr) && name(exp.o.tl) === 'green', JSON.stringify(exp && exp.o ? { preview: { tl: name(pv.tl), tr: name(pv.tr) }, exported: { tl: name(exp.o.tl), tr: name(exp.o.tr) }, dur: exp.dur, edits: exp.edits } : exp));
  record('E16', 'Stored clip duration is the length actually recorded (about 2 s), not the slider value of a longer clip', exp && exp.dur > 1.5 && exp.dur <= 2.6, String(exp && exp.dur));
  // Failure: the recorder fails part-way. Nothing is added to the scan, the editor stays open with an error.
  await page.setInputFiles('#vpick', clip); await page.waitForSelector('.editor canvas'); await sleep(2000);
  const galBefore = await page.evaluate(() => document.querySelectorAll('#gal img').length);
  await page.evaluate(() => { window.__failClip = true; });
  await page.check('.editor [data-decl]', { force: true });
  await page.click('.editor [data-a=save]'); await sleep(4000);
  const fail = await page.evaluate(() => ({ open: !!document.querySelector('.editor'), btn: (document.querySelector('.editor [data-a=save]') || {}).textContent, gal: document.querySelectorAll('#gal img').length, err: (document.querySelector('.editor [data-err]') || {}).textContent || '' }));
  record('E17', 'A clip that fails to prepare is not added: editor stays open, error shown, Use this clip available again', fail.open && fail.gal === galBefore && /Use this clip/.test(fail.btn || '') && fail.err.length > 5, JSON.stringify(fail));
  await page.evaluate(() => { window.__failClip = false; const c = document.querySelector('.editor [data-a=cancel]'); c && c.click(); });
  await ctx.close();
}

await browser.close();
const bad = errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to fetch|internetdisconnected|connectionrefused|403/i.test(e));
record('Z1', 'No unexpected page errors', !bad.length, bad.slice(0, 3).join(' | ') || 'none');
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ run: new Date().toISOString(), bundle: WWW, reference: REF, results }, null, 2) + '\n');
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
