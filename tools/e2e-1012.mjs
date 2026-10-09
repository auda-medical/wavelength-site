// Wavelength 1.0.12 checks in a browser, without a phone. Runs the real bundle (mobile/www) over the stand-in native
// bridge (tools/native-harness.mjs) against a local Worker. Synthetic accounts, records and media only.
//
//   S  supervision: stages and explanations, ending from either side, offline refusal, confirmation only after the
//      server answers, history kept, the guide
//   D  supervisor dashboard: every tile opens exactly its records for that learner, filters, empty states, isolation
//   H  Home: the outstanding-requirements carousel (relevance, order, completion, pathway switching)
//   M  motion: sections rise and fade in once, stay visible, nothing on form fields, reduced motion
//   E  media editor: Annotate, Adjust, Redact on photos and clips; burnt-in pixels; persistence; backup
//   G  guides: library, pathway first, offline, sources and dates
//   W  save scan: one record, Home, saved-locally versus synced
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1012.mjs <outdir> [reference bundle (unused, for the runner)] [http://localhost:8787]
//        ONLY=S,D node tools/e2e-1012.mjs out   runs some sections
// These are browser simulations: they do not replace the physical-device checklists.
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, DEVICE, serve, WWW } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = path.resolve(process.argv[2] || 'e2e-1012-out');
const API = process.argv[4] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-1012.mjs');
const SHOTS = path.join(OUT, 'shots');
const VIDS = path.join(OUT, 'video');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const reset = () => Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
const shot = async (page, name, opt = {}) => { await new Promise((r) => setTimeout(r, 450)); return page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opt }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIFI = { ...DEVICE.wifi, underlying: true, underlyingTransports: ['wifi'] };
const NONE = { ...DEVICE.none, underlying: false, underlyingTransports: [] };
const LB = JSON.parse(fs.readFileSync('data/logbook.json', 'utf8'));
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };

async function account(first = 'Test', last = 'Clinician', pathways = ['rcem']) {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const email = `v1012${t}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: first, lastName: last, email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  if (!token) throw new Error('signup gave no token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways, grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
const call = (acc, p, body) => fetch(API + '/api/app/' + p, { method: body ? 'POST' : 'GET', headers: { ...H, Authorization: 'Bearer ' + acc.token }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
// A learner with scans, linked to a supervisor who has accepted (the live setting: approval not enforced).
async function pair(nScans = 5) {
  const learner = await account('Ada', 'Trainee', ['rcem']), sup = await account('Sam', 'Supervisor', ['general']);
  const today = new Date().toISOString().slice(0, 10);
  const entries = Array.from({ length: nScans }, (_, i) => ({ id: `e1012scan${learner.id}x${i}`, type: i % 2 ? 'lung' : 'efast', date: today, supervision: i < 3 ? 'direct' : 'independent', createdAt: Date.now() - i, updatedAt: 0 }));
  await call(learner, 'sync', { entries });
  await call(learner, 'supervisors/add', { email: sup.email });
  const inv = (await call(sup, 'supervisors')).invites[0];
  await call(sup, 'supervisors/accept', { id: inv.id });
  return { learner, sup, linkId: inv.id, entries };
}
async function phone({ width = 390, height = 844, device = WIFI, reduced = false, dark = false, lang = '', acc = null, video = false } = {}) {
  reset();
  serve.dir = WWW;
  acc = acc || await account();
  const init = [`window.__netdev = JSON.parse(localStorage.getItem('__netdev') || 'null') || ${JSON.stringify(device)};`];
  if (dark) init.push(`localStorage.setItem('wl-theme', 'dark');`);
  if (lang) init.push(`localStorage.setItem('wl-lang', ${JSON.stringify(lang)});`);
  const { ctx, page } = await newApp(width, height, { init, video: video ? { dir: VIDS, size: { width, height } } : null });
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(700);
  return { ctx, page, acc };
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const setNet = (page, dev) => page.evaluate((d) => { localStorage.setItem('__netdev', JSON.stringify(d)); window.__netdev = d; if (window.__fire) window.__fire('WLNetwork', 'networkStatusChange', d); }, dev);

// ---------- S: supervision relationships ----------
if (want('S')) {
  // S1 the learner sees the stage, its meaning and the next step, on the list and in the details.
  {
    const { learner, sup, linkId } = await pair(3);
    const pending = await account('Pat', 'Pending');
    await call(learner, 'supervisors/add', { email: pending.email });
    const { ctx, page } = await phone({ acc: learner });
    await go(page, '#/supervisors'); await page.waitForSelector('.sv-link');
    const cards = await page.$$eval('.sv-link', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
    record('S1', 'Supervisor list shows each stage in words with an explanation, not a bare "Unverified"', cards.some((c) => /Invitation sent/.test(c) && /pending invitation is normal/.test(c)) && cards.some((c) => /Not yet verified by Wavelength/.test(c) && /decided by your programme/.test(c)), cards.join(' || ').slice(0, 300));
    const hint = await text(page, '#se2-h');
    record('S2', 'Before inviting: may need checks and Wavelength approval, pending is expected', /checks and Wavelength approval/.test(hint) && /pending/.test(hint), hint);
    await shot(page, 'S1-supervisors-list');
    await go(page, '#/supervisors/' + linkId); await page.waitForSelector('[data-end]');
    const det = await text(page, 'main');
    record('S3', 'Supervisor details: what the status means, dates, Remove supervisor, guide link', /What this means/.test(det) && /Accepted/.test(det) && /Remove supervisor/.test(det) && /How supervisor verification works/.test(det), det.slice(0, 200));
    await shot(page, 'S3-supervisor-details');
    // S4 offline: refused with a clear message, nothing changes on the server.
    net.offline = true; await setNet(page, NONE); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.click('[data-end]'); await page.waitForSelector('.sheet [data-go]');
    const sheetText = await text(page, '.sheet');
    record('S5', 'Confirmation explains the consequences (records kept, history kept, requests return, new invitation needed)', /No scan records are deleted/.test(sheetText) && /Completed sign-offs and assessments stay recorded/.test(sheetText) && /come back to you/.test(sheetText) && /new invitation/.test(sheetText), sheetText.slice(0, 260));
    await shot(page, 'S5-remove-confirm');
    await page.click('.sheet [data-go]'); await sleep(400);
    const off = await text(page, '.sheet .err');
    const still = await call(learner, 'supervisors');
    record('S4', 'Offline: not ended, and the learner is told nothing changed', /offline/i.test(off || '') && /Nothing has changed/.test(off || '') && still.supervisors.some((s) => s.id === linkId && s.status === 'active'), off);
    await shot(page, 'S4-remove-offline');
    // S6 back online: ended only after the server confirms; the confirmation sheet and the list agree.
    net.offline = false; await setNet(page, WIFI); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.click('.sheet [data-go]'); await page.waitForSelector('.sheet .ok', { timeout: 8000 });
    const ok = await text(page, '.sheet');
    const after = await call(learner, 'supervisors');
    const supView = await call(sup, 'supervise/learner?id=' + learner.id);
    record('S6', 'Online: server ends it, the app then says "Supervision ended" with the date', /Supervision ended on/.test(ok) && !after.supervisors.some((s) => s.id === linkId) && supView.status === 404, ok.slice(0, 160));
    await shot(page, 'S6-removed');
    await page.click('.sheet button[data-close]'); await sleep(300);
    const ended = await text(page, 'main');
    record('S7', 'The list shows the relationship ended recently, by whom, and that records are kept', /Ended recently/.test(ended) && /ended by you/.test(ended) && /scans and completed sign-offs/.test(ended), ended.slice(-260));
    await ctx.close();
  }
  // S8 the supervisor ends supervision from the trainee's page; history stays; repeated attempts are safe.
  {
    const { learner, sup, linkId } = await pair(4);
    const so = await call(learner, 'signoff/request', { entryIds: [`e1012scan${learner.id}x0`], supervisorLink: linkId });
    const { ctx, page } = await phone({ acc: sup });
    await go(page, '#/supervise/' + learner.id); await page.waitForSelector('[data-end]');
    await shot(page, 'S8-trainee-page');
    await page.click('[data-end]'); await page.waitForSelector('.sheet [data-go]');
    const t = await text(page, '.sheet');
    record('S8', 'Supervisor confirmation: access stops, nothing signed is deleted, requests go back', /stop seeing their progress/.test(t) && /Completed sign-offs and assessments stay recorded/.test(t) && /come back to them/.test(t), t.slice(0, 220));
    await page.click('.sheet [data-go]'); await page.waitForSelector('.sheet .ok', { timeout: 8000 });
    const back = await call(learner, 'signoffs');
    const r = back.signoffs.find((x) => x.id === so.code);
    record('S9', 'After the server confirms: dashboard closed, the request came back to the learner', (await call(sup, 'supervise/learner?id=' + learner.id)).status === 404 && r && r.returned, JSON.stringify(r && r.returned));
    await shot(page, 'S9-ended-supervisor');
    const again = await call(sup, 'supervisors/remove', { id: linkId });
    record('S10', 'Ending again is safe and reports it was already ended', again.ok && again.already === true, JSON.stringify({ ended: again.ended, already: again.already }));
    await page.click('.sheet button[data-close]').catch(() => {}); await sleep(300);
    record('S11', 'Supervisor dashboard lists the ended relationship', /Ended recently/.test(await text(page, 'main')) && /ended by you/.test(await text(page, 'main')), '');
    await ctx.close();
  }
  // S12 the guide reflects the live switch (approval not enforced in the dev Worker) and is reachable from Me.
  {
    const { ctx, page } = await phone();
    await go(page, '#/me'); await page.click('a[href="#/guides/supervisor-verification"]'); await page.waitForSelector('#g-signoff');
    const g = await text(page, 'main');
    record('S12', 'Guide covers every topic and describes the sign-off rule actually in force', ['Invitations', 'Acceptance', 'Professional credential review', 'Wavelength approval', 'Pending status', 'Sign-off eligibility', 'Rejection, pause or suspension', 'Ending supervision', 'Reinviting a supervisor', 'Historical evidence'].every((h) => g.includes(h)) && /At present a supervisor who has accepted/.test(g) && /not accreditation or endorsement by RCEM/.test(g), g.length + ' chars');
    await shot(page, 'S12-guide', { fullPage: true });
    await ctx.close();
  }
}

// ---------- D: supervisor dashboard drill-down ----------
if (want('D')) {
  const { learner, sup } = await pair(5);
  const other = await pair(2);
  // One signed-off scan (server-owned), through an in-person sign-off.
  await call(learner, 'signoff/inperson', { entryIds: [`e1012scan${learner.id}x0`], name: 'Dr Sam Supervisor', role: 'Consultant', confirm: true, basis: 'witnessed', signature: 'data:image/png;base64,iVBORw0KGgo=', decisions: { [`e1012scan${learner.id}x0`]: 'confirmed' } });
  const { ctx, page } = await phone({ acc: sup });
  await go(page, '#/supervise/' + learner.id); await page.waitForSelector('.stats a.stat');
  const tiles = await page.$$eval('.stats a.stat', (as) => as.map((a) => ({ n: Number(a.querySelector('b').textContent), label: a.querySelector('span').textContent, href: a.getAttribute('href') })));
  record('D1', 'Every summary tile is a link with a spoken name', tiles.length === 4 && tiles.every((t) => /^#\/supervise\/\d+\//.test(t.href)), JSON.stringify(tiles));
  await shot(page, 'D1-trainee-tiles');
  for (const t of tiles.slice(0, 3)) {
    await go(page, t.href); await page.waitForSelector('.active-f');
    const n = await page.$$eval('main .card .grow b', (b) => b.length);
    const words = await text(page, '.active-f');
    record('D2-' + t.label, `"${t.label}" opens exactly ${t.n} records with the filter named`, n === t.n && /Ada Trainee/.test(words) && /Clear filters|All scans/.test(words), `tile ${t.n}, list ${n}, "${words}"`);
    await shot(page, 'D2-' + t.label.replace(/\W+/g, '-'));
  }
  await go(page, tiles[3].href); await page.waitForSelector('.active-f');
  record('D3', 'Assessments tile with none signed: an informative empty state and a way back', /has no signed assessments yet/.test(await text(page, 'main')) && /Back to Ada Trainee/.test(await text(page, 'main')), await text(page, '.empty'));
  await go(page, `#/supervise/${learner.id}/scans?f=signed`); await page.waitForSelector('.active-f');
  await page.click('label[for=svfunsigned]'); await sleep(800);
  record('D4', 'Changing the filter in place keeps this learner and shows the matching count', /4 scans shown/.test(await text(page, '.active-f')), await text(page, '.active-f'));
  await go(page, `#/supervise/${other.learner.id}/scans?f=all`); await sleep(1200);
  record('D5', "Another supervisor's learner by address: refused, nothing shown", !/Ada Trainee|e1012scan/.test(await text(page, 'main')) && /no longer supervise|Could not load|not/i.test(await text(page, 'main')), await text(page, 'main'));
  net.offline = true; await setNet(page, NONE); await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });
  await go(page, `#/supervise/${learner.id}/scans?f=supervised`); await sleep(1200);
  record('D6', 'Offline: says records are only shown while connected (not kept on the phone)', /only shown while you are connected/.test(await text(page, 'main')), await text(page, 'main'));
  reset(); await setNet(page, WIFI);
  await ctx.close();
}

// ---------- H: outstanding requirements carousel ----------
const scansOf = (acc, type, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `h1012${type}${acc.id}x${i}x${Math.floor(Math.random() * 1e6)}`, type, date: new Date(Date.now() - (n - i) * 864e5).toISOString().slice(0, 10), supervision: 'direct', reflection: 'A reflection longer than twenty characters about this scan.', createdAt: Date.now() - (n - i), updatedAt: 0, ...extra }));
const carousel = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-reqs]');
  const cards = [...document.querySelectorAll('.req-track .req')];
  const cur = cards.findIndex((c) => c.getAttribute('aria-hidden') === 'false');
  return { pid: box && box.dataset.reqs, n: cards.length, mods: cards.map((c) => c.dataset.mod), cur, curMod: cur >= 0 ? cards[cur].dataset.mod : null, dots: document.querySelectorAll('[data-reqdot]').length, viewAll: (document.querySelector('h2.sec a[href^="#/outstanding/"]') || {}).textContent || '', done: !!document.querySelector('.req-done'), scrollX: (document.querySelector('.req-track') || {}).scrollLeft };
});
if (want('H')) {
  // H1 a new RCEM learner: every RCEM module is open, in curriculum order; no autoplay.
  {
    const { ctx, page } = await phone();
    const c = await carousel(page);
    record('H1', 'New RCEM learner: all six modules listed in curriculum order, with dots and View all', c.n === 6 && c.dots === 6 && /View all \(6\)/.test(c.viewAll) && c.mods[0] === 'rcem-aaa', JSON.stringify(c));
    await shot(page, 'H1-carousel-new');
    await sleep(6000);
    const c2 = await carousel(page);
    record('H2', 'It never moves on its own (6 s, same card, same scroll position)', c2.cur === c.cur && c2.scrollX === c.scrollX, `${c.cur}/${c.scrollX} -> ${c2.cur}/${c2.scrollX}`);
    await page.click('[data-reqstep="1"]'); await sleep(700);
    const c3 = await carousel(page);
    await page.goto('https://localhost/#/'); await page.waitForSelector('[data-reqs]'); await sleep(600);
    const c4 = await carousel(page);
    record('H3', 'Next moves one card; after a reload it opens where the learner left it', c3.cur === 1 && c4.curMod === c3.curMod, `${c3.curMod} then ${c4.curMod}`);
    await ctx.close();
  }
  // H4 activity on eFAST: the carousel opens at eFAST, not AAA; a completed AAA module is left out.
  {
    const acc = await account();
    await call(acc, 'sync', { entries: scansOf(acc, 'aaa', 25) });
    await call(acc, 'assessment/inperson', { pathway: 'rcem', module: 'rcem-aaa', kind: 'dops', outcome: 'competent', domains: { [LB.assessmentDomains[0].id]: LB.assessmentScale[0] }, name: 'Dr A', role: 'Consultant', confirm: true, signature: 'data:image/png;base64,iVBORw0KGgo=' });
    await call(acc, 'sync', { entries: scansOf(acc, 'efast', 3).map((e) => ({ ...e, date: new Date().toISOString().slice(0, 10) })) });
    const { ctx, page } = await phone({ acc });
    const c = await carousel(page);
    const asm = await call(acc, 'assessments');
    const aaaDone = (asm.assessments || []).some((a) => a.module === 'rcem-aaa' && a.status === 'signed');
    const pageY = await page.evaluate(() => window.scrollY);
    record('H4', 'Opens at the requirement most recently logged (eFAST), not the first in the list, without scrolling the page', c.curMod === 'rcem-efast' && pageY === 0, JSON.stringify({ cur: c.curMod, mods: c.mods, pageY }));
    record('H5', 'A completed module (AAA: 25 scans, 5 reflections, DOPS competent) is not listed', aaaDone ? !c.mods.includes('rcem-aaa') && c.n === 5 : false, `assessment signed: ${aaaDone}; ${c.mods.join(', ')}`);
    await shot(page, 'H4-carousel-efast');
    await go(page, '#/outstanding/rcem'); await page.waitForSelector('input[name=osort]');
    const order = await page.$$eval('main .req', (r) => r.map((x) => x.dataset.mod));
    await page.click('label[for=osleast]'); await sleep(300);
    const least = await page.$$eval('main .req', (r) => r.map((x) => x.dataset.mod));
    record('H6', 'View all: every open requirement, curriculum order by default, other orders on request', order.length === c.n && order.join() === c.mods.join() && least[0] !== undefined && least.join() !== '' , `${order.join(',')} | least first: ${least.join(',')}`);
    await shot(page, 'H6-view-all', { fullPage: true });
    await ctx.close();
  }
  // H7 pathway switching, and a pathway whose own targets are all met.
  {
    const acc = await account('Fay', 'Famus', ['famus', 'general']);
    await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + acc.token }, body: JSON.stringify({ profile: { pathways: ['famus', 'general'], grade: 'ST4', onboarded: true, targets: { 'gen-lung': { total: 2 } } } }) });
    await call(acc, 'sync', { entries: scansOf(acc, 'lung', 2) });
    const { ctx, page } = await phone({ acc });
    const a = await carousel(page);
    await page.click('[data-fpw="general"]'); await sleep(500);
    const b = await carousel(page);
    record('H7', 'Pathway picker switches the list; a pathway with every target met says so', a.pid === 'famus' && a.n === 5 && b.done, `famus ${a.n} cards; general done ${b.done}`);
    await shot(page, 'H7-all-met');
    await ctx.close();
  }
}

// ---------- M: motion ----------
const rvState = (page) => page.evaluate(() => ({ rv: document.querySelectorAll('.rv').length, hidden: [...document.querySelectorAll('.rv')].filter((e) => getComputedStyle(e).opacity === '0').length, inView: [...document.querySelectorAll('main > *')].filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).filter((e) => e.classList.contains('rv')).length }));
// A long Home: many scans, supervising learners, a pathway with modules, so there is plenty below the fold.
async function busyAccount() {
  const acc = await account('Mo', 'Tion', ['rcem', 'famus']);
  const types = ['aaa', 'efast', 'lung', 'cardiac', 'dvt'];
  await call(acc, 'sync', { entries: Array.from({ length: 40 }, (_, i) => ({ id: `m1012${acc.id}x${i}xx`, type: types[i % 5], date: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), supervision: i % 3 ? 'direct' : 'independent', createdAt: Date.now() - i, updatedAt: 0 })) });
  return acc;
}
if (want('M')) {
  const acc = await busyAccount();
  {
    const { ctx, page } = await phone({ acc });
    const s0 = await rvState(page);
    record('M1', 'On arrival nothing on screen is held back; sections below are waiting', s0.inView === 0 && s0.rv > 0 && s0.hidden === s0.rv, JSON.stringify(s0));
    // Scroll a little and sample one element's opacity and offset over the transition.
    const samples = await page.evaluate(async () => {
      const el = document.querySelector('.rv'); if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const out = [], t0 = performance.now();
      await new Promise((ok) => { const f = () => { const cs = getComputedStyle(el); const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform); out.push([Math.round(performance.now() - t0), Number(cs.opacity).toFixed(2), m.m42.toFixed(1)]); if (performance.now() - t0 < 700) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
      return out;
    });
    const rising = samples && samples.some((x) => Number(x[1]) > 0 && Number(x[1]) < 1 && Number(x[2]) > 0 && Number(x[2]) < 14) && samples[samples.length - 1][1] === '1.00' && samples[samples.length - 1][2] === '0.0';
    record('M2', 'A section rises (under 14 px) and fades in, then settles fully visible', rising, samples ? samples.filter((_, i) => i % 4 === 0).map((x) => x.join('/')).join(' ') : 'none');
    // Down to the bottom and back up: everything ends visible, nothing is hidden again.
    await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } await new Promise((r) => setTimeout(r, 700)); for (let y = document.body.scrollHeight; y >= 0; y -= 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
    await sleep(700);
    const s1 = await rvState(page);
    record('M3', 'After scrolling down and back up every section is visible and none animates again', s1.rv === 0, JSON.stringify(s1));
    // A soft redraw (sync) does not replay it.
    await page.evaluate(() => scrollTo(0, 0)); await page.click('button.sync-pill'); await sleep(300); await page.keyboard.press('Escape');
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(2500);
    record('M4', 'Sync updates redraw without replaying the motion', (await rvState(page)).rv === 0, JSON.stringify(await rvState(page)));
    await go(page, '#/new'); await page.waitForSelector('form'); await sleep(400);
    await page.evaluate(() => scrollTo(0, 3000)); await sleep(300);
    record('M5', 'The scan form never animates its sections or fields', (await rvState(page)).rv === 0 && (await page.$$eval('form .rv', (x) => x.length)) === 0, '');
    await page.evaluate(() => { const f = document.querySelector('form[data-dirty]'); if (f) delete f.dataset.dirty; });
    await ctx.close();
  }
  {
    const { ctx, page } = await phone({ acc, reduced: true });
    await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } });
    record('M6', 'Reduced motion: no section is ever held back or moved', (await rvState(page)).rv === 0, '');
    await ctx.close();
  }
  // M7 frame timing while scrolling Home and a long Progress page, CPU slowed 4x, with and without the motion.
  {
    const measure = async (reduced) => {
      const { ctx, page } = await phone({ acc, reduced });
      const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const out = {};
      for (const h of ['#/', '#/progress/famus']) {
        await go(page, h); await sleep(900);
        out[h] = await page.evaluate(async () => {
          scrollTo(0, 0); await new Promise((r) => setTimeout(r, 200));
          const gaps = []; let last = performance.now(), y = 0, run = true;
          const f = (t) => { gaps.push(t - last); last = t; if (run) requestAnimationFrame(f); };
          requestAnimationFrame(f);
          while (y < document.body.scrollHeight - innerHeight) { y += 24; scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); }
          await new Promise((r) => setTimeout(r, 400)); run = false;
          gaps.sort((a, b) => a - b);
          return { frames: gaps.length, median: +gaps[Math.floor(gaps.length / 2)].toFixed(1), p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1), over50: gaps.filter((g) => g > 50).length };
        });
      }
      await ctx.close();
      return out;
    };
    const on = await measure(false), off = await measure(true);
    const ok = Object.keys(on).every((h) => on[h].p95 <= off[h].p95 * 1.25 + 4 && on[h].over50 <= off[h].over50 + 2);
    record('M7', 'Scrolling with the motion is as smooth as without it (CPU 4x slower; p95 frame gap within 25%)', ok, JSON.stringify({ motion: on, reduced: off }));
  }
  // A short recording of Home scrolling, for the owner to watch.
  {
    const { ctx, page } = await phone({ acc, video: true });
    await sleep(600);
    await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 6) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); } });
    await sleep(800);
    const v = page.video(); await ctx.close();
    if (v) { const f = await v.path(); fs.renameSync(f, path.join(VIDS, 'M-home-scroll-reveal.webm')); }
  }
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed${errors.length ? `; ${errors.length} page errors` : ''}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
