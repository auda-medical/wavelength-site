// Wavelength 1.0.10 checks in a browser, without a phone: connection status (VPN, filters, reconnection), the status
// pill and banners, Retry sync, Home counts, Log one, required-field marks, saving, reduced motion and a long logbook.
// Runs the real bundle (mobile/www) over the stand-in native bridge (tools/native-harness.mjs, with its WLNetwork
// stand-in) against a local Worker. Synthetic data only. Screenshots go to <outdir>/shots.
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1010.mjs <outdir> [http://localhost:8787]
// These are browser simulations: they do not replace the physical-device checklist.
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, setDevice, DEVICE, SITE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || 'e2e-1010-out';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-1010.mjs');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const reset = () => Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function account(pathways = ['rcem']) {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };
  const email = `v1010${t}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: h, body: JSON.stringify({ firstName: 'Test', lastName: 'Clinician', email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...h, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways, grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  if (!p.ok) throw new Error('profile: ' + JSON.stringify(p));
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
async function phone({ width = 390, height = 844, device = DEVICE.wifi, reduced = false, dark = false, acc = null } = {}) {
  reset();
  acc = acc || await account();
  const init = [`window.__netdev = ${JSON.stringify(device)};`];
  if (dark) init.push(`localStorage.setItem('wl-theme', 'dark');`);
  const { ctx, page } = await newApp(width, height, { init });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await page.waitForTimeout(700);
  return { ctx, page, acc };
}
const pill = (page) => page.evaluate(() => { const b = document.querySelector('button.sync-pill'); return b ? { text: b.textContent.trim(), cls: b.className, label: b.getAttribute('aria-label') } : null; });
const bannerText = (page) => page.evaluate(() => { const b = document.querySelector('[data-syncbanner]'); return b && !b.hidden ? b.textContent : ''; });
async function fillScan(page, { type = 't0', supervision = true } = {}) {
  await page.evaluate(() => { location.hash = '#/new'; });
  await page.waitForSelector('label[for=' + type + ']');
  await page.click('label[for=' + type + ']');
  await page.waitForSelector('#rest:not([hidden])');
  if (supervision) await page.locator('input[name=supervision]').first().check({ force: true });
}
async function saveScan(page) {
  await fillScan(page);
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => location.hash === '#/' || document.querySelector('.err:not([hidden]), .field.invalid'), null, { timeout: 15000 });
}
function local(page, id) {
  return page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const t = r.result.transaction('entries').objectStore('entries').getAll(); t.onsuccess = () => { r.result.close(); ok(t.result); }; }; r.onerror = () => ok(null); }), id);
}
function seed(page, id, entries, kv = {}) {
  return page.evaluate(([id, entries, kv]) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const tx = r.result.transaction(['entries', 'kv'], 'readwrite'); entries.forEach((e) => tx.objectStore('entries').put(e)); Object.entries(kv).forEach(([k, v]) => tx.objectStore('kv').put({ k, v })); tx.oncomplete = () => { r.result.close(); ok(); }; };
  }), [id, entries, kv]);
}

// ---------- Connection status ----------
{
  // C1: aeroplane mode. The phone reports no network: red "You're offline" banner and red "Offline" pill.
  const { ctx, page, acc } = await phone();
  await shot(page, '01-pill-synced-home');
  const p0 = await pill(page);
  record('C0', 'Signed in and synced: pill says Synced (teal) and is a button with an accessible name', p0 && /Synced/.test(p0.text) && /p-ok/.test(p0.cls) && /Open sync details/.test(p0.label), JSON.stringify(p0));
  net.offline = true; await setDevice(page, DEVICE.none);
  await saveScan(page);
  await page.waitForTimeout(1200);
  const p = await pill(page), b = await bannerText(page);
  record('C1', 'Offline: red Offline pill and red "You\'re offline" banner with the waiting count', /Offline/.test(p.text) && /p-bad/.test(p.cls) && /You're offline/.test(b) && /1 scan waiting to sync/.test(b) && /saved on this device/.test(b), `pill "${p.text}" ${p.cls}; banner "${b.slice(0, 160)}"`);
  await shot(page, '02-offline-banner');
  // C2: Wi-Fi comes back while aeroplane mode stays on. The network-change event syncs at once, even after a
  // run of failures has stretched the back-off.
  await page.waitForTimeout(16000);
  net.offline = false; await setDevice(page, DEVICE.wifi);
  const t = await waitServer(acc.id, 1, 15000);
  record('C2', 'Wi-Fi restored while aeroplane mode stays on: scan reaches the server within 5 s of the network event', t !== null && t <= 5000, t === null ? 'not synced in 15 s' : `synced ${t} ms after the event`);
  await page.waitForTimeout(400);
  const b2 = await bannerText(page);
  await shot(page, '03-synced-brief');
  record('C3', 'After reconnecting: "All changes synced." shows briefly, then the banner goes and the pill stays Synced', /All changes synced/.test(b2), `banner "${b2}"`);
  await page.waitForTimeout(3600);
  const b3 = await bannerText(page), p3 = await pill(page);
  record('C3b', 'Brief synced banner removed after about 3 s; pill Synced', !b3 && /Synced/.test(p3.text), `banner "${b3}", pill "${p3.text}"`);
  await ctx.close();
}
{
  // C4: VPN on, the phone has a validated network, but requests to Wavelength fail (VPN or filter drops them).
  const { ctx, page, acc } = await phone({ device: DEVICE.vpn });
  net.blocked = true;
  await saveScan(page);
  await page.waitForTimeout(1500);
  const p = await pill(page), b = await bannerText(page);
  record('C4', 'VPN up, server blocked: amber "Can\'t sync" pill and amber "Can\'t connect to Wavelength" banner, not "offline"', /Can't sync/.test(p.text) && /p-warn/.test(p.cls) && /Can't connect to Wavelength/.test(b) && /appears connected/.test(b) && /VPN, firewall or network restriction/.test(b) && !/You're offline/.test(b), `pill "${p.text}"; banner "${b.slice(0, 200)}"`);
  record('C4b', 'The banner never tells the learner to switch the VPN off', !/disable|turn off/i.test(b), b.slice(0, 120));
  await shot(page, '04-cant-connect-banner');
  // C5: manual Retry sync from the banner once the route works again.
  net.blocked = false;
  await page.click('[data-syncbanner] [data-sbretry]');
  const t = await waitServer(acc.id, 1, 8000);
  record('C5', 'Retry sync in the banner sends the waiting scan', t !== null, t === null ? 'not synced' : `synced ${t} ms after Retry`);
  const rows = await serverEntries(acc.id);
  record('C5b', 'No duplicate after failed attempts and a manual retry', rows.length === 1, `${rows.length} copies on the server`);
  await ctx.close();
}
{
  // C6: VPN reconnects (stale tunnel, then a new validated VPN network). The change event retries straight away.
  const { ctx, page, acc } = await phone({ device: DEVICE.vpn });
  net.blocked = true; await setDevice(page, DEVICE.vpnStale);
  await saveScan(page);
  await page.waitForTimeout(16000);
  const b = await bannerText(page);
  net.blocked = false; await setDevice(page, { ...DEVICE.vpn, id: '9' });
  const t = await waitServer(acc.id, 1, 15000);
  record('C6', 'VPN tunnel stale, then reconnected: amber while stale, scan syncs within 5 s of the VPN coming back', /Can't connect/.test(b) && t !== null && t <= 5000, `while stale "${b.slice(0, 40)}"; ${t === null ? 'not synced' : 'synced after ' + t + ' ms'}`);
  await ctx.close();
}
{
  // C7: mobile data comes back (no Wi-Fi).
  const { ctx, page, acc } = await phone({ device: DEVICE.none });
  net.offline = true;
  await saveScan(page);
  await page.waitForTimeout(8000);
  net.offline = false; await setDevice(page, DEVICE.cellular);
  const t = await waitServer(acc.id, 1, 15000);
  record('C7', 'Mobile data restored: scan syncs within 5 s of the network event', t !== null && t <= 5000, t === null ? 'not synced' : `synced after ${t} ms`);
  await ctx.close();
}
{
  // C8: something on the way answers with its own page (403, no CORS): amber, not offline, not "refused".
  const { ctx, page } = await phone();
  net.challenge = true;
  await saveScan(page);
  await page.waitForTimeout(1500);
  const p = await pill(page);
  record('C8', 'A block or challenge page instead of the API: "Can\'t sync" (amber)', /Can't sync/.test(p.text), `pill "${p.text}"`);
  // C9: the pill opens this device's sync details: network, server, waiting, last attempt, last success, last error.
  await page.click('button.sync-pill');
  await page.waitForSelector('.sheet [data-syncpanel] [data-resync]');
  const panel = await page.evaluate(() => document.querySelector('.sheet [data-syncpanel]').textContent);
  await page.waitForTimeout(350);
  await shot(page, '05-sync-details-sheet');
  const want = ['Network on this device', 'Wi-Fi', 'Wavelength server', 'Not reachable from this network', 'Entries awaiting sync', 'Last attempt', 'Last synced', 'Last error', 'What to check', 'Retry sync', 'This status is for this device only'];
  const miss = want.filter((w) => !panel.includes(w));
  record('C9', 'Tapping the pill opens sync details with network, server, waiting, attempts, error, guidance and Retry', !miss.length, miss.length ? 'missing: ' + miss.join(', ') : 'all present');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((s) => s.remove()));
  // C10: keyboard: Tab to the pill and press Enter.
  await page.evaluate(() => document.querySelector('button.sync-pill').focus());
  await page.keyboard.press('Enter');
  const opened = await page.waitForSelector('.sheet [data-syncpanel]', { timeout: 3000 }).then(() => true, () => false);
  record('C10', 'The pill works from the keyboard (focus, Enter)', opened, opened ? 'sheet opened' : 'no sheet');
  await ctx.close();
}
{
  // C11: waiting scans with no failure yet (the app has not tried): "2 waiting" pill. Seeded straight into the
  // phone's database with the sync timer held, as after a restore.
  const { ctx, page, acc } = await phone();
  net.hang = true; // every sync stays in flight: the pill shows Syncing, then the waiting count once settled
  await seed(page, acc.id, [1, 2].map((i) => ({ id: 'wait' + i + String(acc.id), type: 'efast', date: '2026-10-01', supervision: 'direct', createdAt: Date.now(), updatedAt: 0, _dirty: true, _new: true })));
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs');
  await page.waitForTimeout(1500);
  const p = await pill(page), b = await bannerText(page);
  await shot(page, '06-syncing');
  record('C11', 'Sync in progress with 2 scans: pill "Syncing" and "Synchronising your scans…" banner', /Syncing/.test(p.text) && /p-busy/.test(p.cls) && /Synchronising your scans/.test(b), `pill "${p.text}", banner "${b}"`);
  await page.evaluate(() => { window.__netdev = null; });
  await ctx.close();
}
{
  // C12: dark theme and a wide screen: pill and banner screenshots.
  const { ctx, page } = await phone({ dark: true, device: DEVICE.vpn });
  net.blocked = true;
  await saveScan(page);
  await page.waitForTimeout(1500);
  await shot(page, '07-cant-connect-dark');
  await ctx.close();
  const w = await phone({ width: 1440, height: 900 });
  net.offline = true; await setDevice(w.page, DEVICE.none);
  await saveScan(w.page);
  await w.page.waitForTimeout(1200);
  await shot(w.page, '08-offline-desktop');
  const over = await w.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  record('C12', 'Desktop width: banner and pill fit, no horizontal overflow', !over, over ? 'overflow' : 'no overflow');
  await w.ctx.close();
}

// ---------- Home counts ----------
{
  const { ctx, page, acc } = await phone();
  net.offline = true; await setDevice(page, DEVICE.none); // keep the seeded logbook as it is
  const d = new Date(), month = d.toISOString().slice(0, 7), prev = new Date(d.getFullYear(), d.getMonth() - 1, 15).toISOString().slice(0, 10);
  const today = d.toISOString().slice(0, 10);
  const mk = (i, date, signed) => ({ id: 'home' + i + 'x' + String(acc.id), type: i % 2 ? 'aaa' : 'efast', date, supervision: 'direct', createdAt: Date.now() - i, updatedAt: 1000 + i, ...(signed ? { signoff: { status: 'confirmed', code: 'SO-TEST-000' + i, name: 'Dr Synthetic', method: 'link' } } : {}) });
  const ents = [mk(1, today, true), mk(2, month + '-01', false), mk(3, prev, true), mk(4, prev, false), mk(5, prev, false)];
  const asm = [{ id: 'as1', status: 'signed', kind: 'formative', outcome: 'competent', assessed_on: today, pathway: 'rcem', module: 'rcem-aaa' }, { id: 'as2', status: 'pending', kind: 'dops', pathway: 'rcem', module: 'rcem-aaa', created_at: today }, { id: 'as3', status: 'signed', kind: 'summative', outcome: 'competent', assessed_on: prev, pathway: 'rcem', module: 'rcem-efast' }];
  await seed(page, acc.id, ents, { assessments: asm });
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs'); await page.waitForTimeout(600);
  await shot(page, '09-home-counts');
  const cards = await page.evaluate(() => [...document.querySelectorAll('.hero a.stat')].map((a) => ({ n: +a.querySelector('b').textContent, label: a.querySelector('span').textContent, href: a.getAttribute('href') })));
  record('H0', 'Home shows four count cards, each a link', cards.length === 4 && cards.every((c) => c.href), JSON.stringify(cards));
  const expect = { Scans: 5, 'This month': 2, 'Signed off': 2, Assessments: 2 };
  for (const c of cards) {
    await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('.hero a.stat');
    await page.click(`.hero a.stat[href="${c.href}"]`);
    await page.waitForTimeout(400);
    const shown = await page.evaluate((assess) => assess ? document.querySelectorAll('[data-asm]').length : document.querySelectorAll('main a.entry').length, c.label === 'Assessments');
    const filt = await page.evaluate(() => { const f = document.querySelector('.active-f'); return f ? f.textContent : ''; });
    const ok = c.n === expect[c.label] && shown === c.n && (c.label === 'Scans' || /Clear filter/.test(filt));
    record('H-' + c.label.replace(/\s/g, ''), `"${c.label}" opens exactly the ${c.n} records it counts, filter shown with Clear`, ok, `card ${c.n} (expected ${expect[c.label]}), destination shows ${shown}; filter "${filt}"`);
    if (c.label === 'This month') await shot(page, '10-logbook-this-month');
    if (c.label === 'Assessments') await shot(page, '11-assessments-signed');
  }
  // H5: Clear filter from the month view shows the whole logbook.
  await page.evaluate((m) => { location.hash = '#/log?m=' + m; }, month); await page.waitForTimeout(300);
  await page.click('.active-f a.link');
  await page.waitForTimeout(300);
  const all = await page.evaluate(() => document.querySelectorAll('main a.entry').length);
  record('H5', 'Clear filter returns to the whole logbook', all === 5, `${all} scans shown`);
  // H6: empty month.
  await page.evaluate(() => { location.hash = '#/log?m=2020-01'; }); await page.waitForTimeout(300);
  const empty = await page.evaluate(() => document.querySelector('.empty') && document.querySelector('.empty').textContent);
  record('H6', 'A month with no scans says so and offers Clear filters', /No scans logged in January 2020/.test(empty || '') && /Clear filters/.test(empty || ''), empty);
  // H7: keyboard and focus: the count cards are focusable links.
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector('.hero a.stat');
  const focusable = await page.evaluate(() => { const a = document.querySelector('.hero a.stat'); a.focus(); return document.activeElement === a; });
  record('H7', 'Count cards take keyboard focus', focusable, String(focusable));
  await ctx.close();
}

// ---------- Log one, required fields, saving ----------
{
  const { ctx, page, acc } = await phone();
  // F1: Log one from the AAA module on Progress.
  await page.evaluate(() => { location.hash = '#/progress/rcem'; }); await page.waitForTimeout(500);
  const btn = page.locator('a.btn[href="#/new?type=aaa"]').first();
  const has = await btn.count();
  if (has) await btn.click(); else await page.evaluate(() => { location.hash = '#/new?type=aaa'; });
  await page.waitForTimeout(900);
  const pos = await page.evaluate(() => {
    const head = document.querySelector('.top').getBoundingClientRect().bottom, row = document.getElementById('date').closest('.two').getBoundingClientRect();
    const typeOk = document.getElementById('typeok').textContent, checked = (document.querySelector('input[name=type]:checked') || {}).value;
    const okr = document.getElementById('typeok').getBoundingClientRect(); const ae = document.activeElement; return { okVisible: okr.top >= head - 1 && okr.bottom <= innerHeight, gap: Math.round(row.top - head), typeOk, checked, scrolled: scrollY, focusTag: ae && ae.tagName, focusType: ae && ae.type, marked: document.getElementById('date').closest('.two').classList.contains('next-up') };
  });
  await shot(page, '12-aaa-log-one');
  record('F1', 'AAA Log one: Abdominal aorta preselected and confirmed', pos.checked === 'aaa' && /Abdominal aorta \(AAA\) selected/.test(pos.typeOk), `${has ? 'from Progress' : 'direct link'}; checked ${pos.checked}; "${pos.typeOk}"`);
  record('F2', 'AAA Log one: the confirmation and the date row sit just below the fixed header, date briefly marked', pos.scrolled > 100 && pos.gap >= 0 && pos.gap <= 90 && pos.okVisible && pos.marked, `scrollY ${pos.scrolled}, date row ${pos.gap}px below header, confirmation visible ${pos.okVisible}, marked ${pos.marked}`);
  record('F3', 'AAA Log one: no keyboard or date picker opened (no input focused)', !(pos.focusTag === 'INPUT' || pos.focusTag === 'SELECT' || pos.focusTag === 'TEXTAREA'), `focus on ${pos.focusTag} ${pos.focusType || ''}`);
  // F4: the general Log a scan still starts at the application choice.
  await page.evaluate(() => { location.hash = '#/'; }); await page.waitForTimeout(200);
  await page.evaluate(() => { location.hash = '#/new'; }); await page.waitForTimeout(600);
  const gen = await page.evaluate(() => ({ y: scrollY, rest: document.getElementById('rest').hidden }));
  record('F4', 'Log a scan without a type still starts at the application choice', gen.y === 0 && gen.rest, JSON.stringify(gen));

  // G1: save without supervision: field marked, scrolled to, focused; typed text kept.
  await page.click('label[for=t0]'); await page.waitForTimeout(200);
  await page.fill('#ind', 'Synthetic indication text');
  await page.click('form button[type=submit]');
  await page.waitForTimeout(700);
  const g = await page.evaluate(() => {
    const f = document.querySelector('.field.invalid'), r = f && f.getBoundingClientRect(), head = document.querySelector('.top').getBoundingClientRect().bottom;
    return f && { req: f.dataset.req, msg: (f.querySelector('.ferr') || {}).textContent, inView: r.top >= head - 2 && r.top < innerHeight, focused: document.activeElement === f, desc: f.getAttribute('aria-describedby'), kept: document.getElementById('ind').value, hash: location.hash };
  });
  await shot(page, '13-validation-supervision');
  record('G1', 'Missing supervision: group marked red with inline help, scrolled into view below the header, focused', g && g.req === 'supervision' && /level of supervision/.test(g.msg) && g.inView && g.focused && g.desc === 'err-supervision', JSON.stringify(g));
  record('G2', 'Missing supervision: everything typed is kept and the form stays open', g && g.kept === 'Synthetic indication text' && /#\/new/.test(g.hash), g && `indication "${g.kept}", ${g.hash}`);
  await page.locator('input[name=supervision]').first().check({ force: true });
  await page.waitForTimeout(200);
  const cleared = await page.evaluate(() => !document.querySelector('.field.invalid') && !document.querySelector('.ferr'));
  record('G3', 'Choosing a supervision level clears the mark at once', cleared, String(cleared));
  // G4: a missing date is marked the same way.
  await page.fill('#date', '');
  await page.click('form button[type=submit]');
  await page.waitForTimeout(500);
  const gd = await page.evaluate(() => { const f = document.querySelector('.field.invalid'); return f && { req: f.dataset.req, msg: f.querySelector('.ferr').textContent, inv: document.getElementById('date').getAttribute('aria-invalid') }; });
  await shot(page, '14-validation-date');
  record('G4', 'Missing date: marked inline with aria-invalid', gd && gd.req === 'date' && /date of the scan/.test(gd.msg) && gd.inv === 'true', JSON.stringify(gd));
  await page.fill('#date', new Date().toISOString().slice(0, 10));

  // S1: two quick taps on Save make one scan, and the app goes Home with a short note.
  const before = (await local(page, acc.id)).length;
  await page.evaluate(() => { const b = document.querySelector('form button[type=submit]'); b.click(); b.click(); document.getElementById('ef').requestSubmit(); });
  await page.waitForFunction(() => location.hash === '#/', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const after = (await local(page, acc.id)).length;
  const toast = await page.evaluate(() => { const t = document.querySelector('.toast.act'); return t ? t.textContent : ''; });
  await shot(page, '15-saved-home-toast');
  record('S1', 'Save returns to Home with a short note and View scan', (await page.evaluate(() => location.hash)) === '#/' && /Scan saved/.test(toast) && /View scan/.test(toast), `hash ${await page.evaluate(() => location.hash)}; note "${toast}"`);
  record('S2', 'Repeated Save taps make exactly one scan', after - before === 1, `${after - before} new scans`);
  await page.waitForTimeout(1500);
  const toast2 = await page.evaluate(() => { const t = document.querySelector('.toast.act [data-msg]'); return t ? t.textContent : ''; });
  const srv = await serverEntries(acc.id);
  record('S3', 'The note says "synced" only once the server has acknowledged the scan', /synced/.test(toast2) ? srv.length >= 1 : true, `note "${toast2}", server copies ${srv.length}`);
  // S4: offline save says so.
  net.offline = true; await setDevice(page, DEVICE.none);
  await fillScan(page);
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => location.hash === '#/', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const off = await page.evaluate(() => { const t = document.querySelector('.toast.act [data-msg]'); return t ? t.textContent : ''; });
  await shot(page, '16-saved-offline-toast');
  record('S4', 'Saved while offline: "Saved on this device. Awaiting sync."', /Saved on this device\. Awaiting sync\./.test(off), `note "${off}"`);
  // S5: the phone cannot save (storage error): the form stays, with everything kept and a useful error.
  await fillScan(page);
  await page.fill('#ind', 'Kept after a failed save');
  await page.evaluate(() => { const orig = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v) { if (this.name === 'entries') { IDBObjectStore.prototype.put = orig; throw new DOMException('Simulated storage failure', 'QuotaExceededError'); } return orig.apply(this, arguments); }; });
  await page.click('form button[type=submit]');
  await page.waitForTimeout(800);
  const fail = await page.evaluate(() => ({ hash: location.hash, err: (document.querySelector('form .err:not([hidden])') || {}).textContent || '', kept: document.getElementById('ind').value, btn: document.querySelector('form button[type=submit]').disabled }));
  await shot(page, '17-save-failed');
  record('S5', 'Local save fails: stays on the form, data kept, error shown, Save usable again', /#\/new/.test(fail.hash) && /Could not save on this device/.test(fail.err) && fail.kept === 'Kept after a failed save' && !fail.btn, JSON.stringify(fail));
  await ctx.close();
}

// ---------- Motion, reduced motion, long logbook ----------
{
  const { ctx, page } = await phone({ reduced: true });
  await page.evaluate(() => { location.hash = '#/log'; }); await page.waitForTimeout(200);
  const anim = await page.evaluate(() => ({ main: getComputedStyle(document.querySelector('main')).animationName, cls: document.querySelector('main').className }));
  record('M1', 'Reduced motion: no screen animation (content shown at once)', anim.main === 'none', JSON.stringify(anim));
  await ctx.close();
  const n = await phone();
  await n.page.evaluate(() => { location.hash = '#/log'; }); await n.page.waitForTimeout(50);
  const a2 = await n.page.evaluate(() => getComputedStyle(document.querySelector('main')).animationName);
  const dur = await n.page.evaluate(() => getComputedStyle(document.querySelector('main')).animationDuration);
  record('M2', 'Normal motion: a single short fade on a new screen (opacity and transform only)', a2 === 'screenIn' && parseFloat(dur) <= 0.2, `${a2} ${dur}`);
  await n.ctx.close();
}
{
  // L1: 600 scans with 4x CPU slowdown (a mid-range phone): time to draw the logbook and frame gaps while scrolling.
  const { ctx, page, acc } = await phone();
  net.offline = true; await setDevice(page, DEVICE.none);
  const ents = Array.from({ length: 600 }, (_, i) => ({ id: 'long' + String(i).padStart(4, '0') + String(acc.id), type: ['aaa', 'efast', 'lung', 'cardiac'][i % 4], date: new Date(Date.now() - i * 36e5 * 12).toISOString().slice(0, 10), supervision: 'direct', indication: 'Synthetic ' + i, createdAt: Date.now() - i, updatedAt: 1 }));
  await seed(page, acc.id, ents);
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.evaluate(() => { location.hash = '#/log'; });
  await page.waitForFunction(() => document.querySelectorAll('main a.entry').length >= 600);
  const drawMs = Date.now() - t0;
  const frames = await page.evaluate(() => new Promise((ok) => {
    const gaps = []; let last = performance.now(), y = 0;
    const step = (t) => { gaps.push(t - last); last = t; y += 40; window.scrollTo(0, y); if (gaps.length < 150) requestAnimationFrame(step); else ok(gaps.slice(5)); };
    requestAnimationFrame(step);
  }));
  frames.sort((a, b) => a - b);
  const p50 = frames[Math.floor(frames.length / 2)], p95 = frames[Math.floor(frames.length * 0.95)];
  record('L1', '600 scans at 4x CPU slowdown: logbook drawn within 3 s (1.0.9 measured 1.3 to 4.2 s)', drawMs < 3000, `${drawMs} ms`);
  record('L2', '600 scans at 4x CPU slowdown: scrolling frame gaps p50 under 25 ms (informative: headless timing)', p50 < 25, `p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await shot(page, '18-long-logbook');
  // L3: typing in the form is not slowed by the logbook size.
  await page.evaluate(() => { location.hash = '#/new?type=efast'; }); await page.waitForTimeout(600);
  const tt = Date.now(); await page.type('#ind', 'abcdefghij', { delay: 0 }); const typeMs = Date.now() - tt;
  record('L3', 'Typing 10 characters in the form with 600 scans stored: under 600 ms', typeMs < 600, `${typeMs} ms`);
  await ctx.close();
}

// ---------- Preserved behaviour ----------
{
  // P1: Arabic, right to left: pill and banner mirror and fit.
  const acc = await account();
  const { ctx, page } = await phone({ acc });
  await page.evaluate(() => localStorage.setItem('wl-lang', 'ar'));
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs'); await page.waitForTimeout(500);
  net.offline = true; await setDevice(page, DEVICE.none); await page.waitForTimeout(1500);
  const rtl = await page.evaluate(() => ({ dir: document.documentElement.dir, over: document.documentElement.scrollWidth > innerWidth + 1 }));
  await shot(page, '19-arabic-offline');
  record('P1', 'Arabic: right to left, no overflow with the pill and banner', rtl.dir === 'rtl' && !rtl.over, JSON.stringify(rtl));
  await ctx.close();
}

await browser.close();
const real = errors.filter((e) => !/Simulated storage failure|net::ERR|Failed to fetch|Access-Control|CORS|status of 403/.test(e));
record('Z1', 'No unexpected page errors', !real.length, real.slice(0, 5).join(' | ') || 'none');
fs.writeFileSync(path.join(OUT, 'e2e-1010.json'), JSON.stringify({ at: new Date().toISOString(), api: API, site: SITE, note: 'Browser simulation of the store app; not a physical-device test.', results, errors }, null, 2));
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
