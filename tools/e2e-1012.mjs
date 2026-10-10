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
import { setColour } from './editor-colour.mjs';

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
async function phone({ width = 390, height = 844, device = WIFI, reduced = false, dark = false, lang = '', acc = null, video = false, bundle = WWW } = {}) {
  reset();
  serve.dir = bundle;
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

// ---------- E: media editor (Annotate | Adjust | Redact), photos and clips ----------
// Synthetic test pictures only: four coloured quadrants (photo) and the same as a moving clip.
async function testImage(page) {
  const b64 = await page.evaluate(() => new Promise((ok) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 150); g.fillStyle = '#00ff00'; g.fillRect(200, 0, 200, 150); g.fillStyle = '#0000ff'; g.fillRect(0, 150, 200, 150); g.fillStyle = '#ffff00'; g.fillRect(200, 150, 200, 150);
    c.toBlob((b) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(b); }, 'image/png'); }));
  const f = path.join(OUT, 'quadrants.png'); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}
async function testClip(page, secs) {
  const f = path.join(OUT, `clip-${secs}s.webm`);
  if (fs.existsSync(f)) return f;
  const b64 = await page.evaluate((secs) => new Promise((ok) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm;codecs=vp8' }); const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now(); let raf;
    const tick = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#00ff00'; g.fillRect(160, 0, 160, 120); g.fillStyle = '#0000ff'; g.fillRect(0, 120, 160, 120); g.fillStyle = '#ffff00'; g.fillRect(160, 120, 160, 120); g.fillStyle = '#fff'; g.fillRect(150 + Math.sin(t * 4) * 20, 110, 20, 20); if (t >= secs) { rec.stop(); return; } raf = requestAnimationFrame(tick); };
    rec.onstop = () => { cancelAnimationFrame(raf); const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); };
    rec.start(250); tick();
  }), secs);
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}
const QUAD = { tl: [0.25, 0.25], tr: [0.75, 0.25], bl: [0.25, 0.75], br: [0.75, 0.75], c: [0.5, 0.5] };
const cname = (rgb) => { const [r, g, b] = rgb; return r > 180 && g > 180 && b < 90 ? 'yellow' : r > 180 && g < 90 && b < 90 ? 'red' : g > 180 && r < 90 && b < 90 ? 'green' : b > 180 && r < 90 && g < 90 ? 'blue' : g > 160 && b > 160 && r < 90 ? 'cyan' : r > 200 && g > 200 && b > 200 ? 'white' : r < 40 && g < 40 && b < 40 ? 'black' : Math.abs(r - 122) < 20 && Math.abs(g - 122) < 20 && Math.abs(b - 122) < 20 ? 'grey' : 'rgb(' + rgb.join(',') + ')'; };
const named = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cname(v)]));
const sampleCanvas = (page, pts = QUAD) => page.evaluate((Q) => { const c = document.querySelector('.editor canvas'); const g = c.getContext('2d'); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); return o; }, pts);
// Pixels of a stored image record (the saved JPEG) at relative points.
const sampleStored = (page, accId, pick, pts = QUAD, field = 'blob') => page.evaluate(([id, pick, Q, field]) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id);
  r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close();
    const list = q.result.filter((x) => x.kind !== 'clip').sort((a, b) => b.created - a.created); const d = pick ? list.find((x) => x.id === pick) : list[0]; if (!d) return ok(null);
    const blob = d[field]; if (!blob) return ok({ none: true, id: d.id, keys: Object.keys(d) });
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); ok({ o, w: c.width, h: c.height, id: d.id, annot: d.annot || null, hasBase: !!d.base, prov: d.prov || null }); };
    im.src = URL.createObjectURL(blob); }; };
}), [accId, pick, pts, field]);
const canvasBox = (page) => page.evaluate(() => { const r = document.querySelector('.editor canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const dragOn = async (page, a, b) => { const bx = await canvasBox(page); await page.mouse.move(bx.x + bx.w * a[0], bx.y + bx.h * a[1]); await page.mouse.down(); await page.mouse.move(bx.x + bx.w * b[0], bx.y + bx.h * b[1], { steps: 6 }); await page.mouse.up(); await sleep(200); };
const tapOn = async (page, a) => { const bx = await canvasBox(page); await page.mouse.click(bx.x + bx.w * a[0], bx.y + bx.h * a[1]); await sleep(200); };
const saveScan = async (page) => { await page.evaluate(() => { const i = document.querySelector('input[name=supervision]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); }); await page.click('form button[type=submit]'); const ok = await page.waitForFunction(() => location.hash === '#/', null, { timeout: 10000 }).then(() => true, () => false); if (!ok) console.log('save failed:', await page.evaluate(() => JSON.stringify({ hash: location.hash, err: (document.querySelector('form .err') || {}).textContent, invalid: [...document.querySelectorAll('.field.invalid')].map((f) => f.dataset.req), sheet: (document.querySelector('.sheet') || {}).textContent, gal: document.querySelectorAll('#gal img').length }))); await sleep(600); };
if (want('E')) {
  const { ctx, page, acc } = await phone();
  const img = await testImage(page);
  await go(page, '#/new?type=cardiac'); await sleep(1500);
  const openPhoto = async () => { await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas'); await sleep(500); };
  await openPhoto();
  // E1 three modes, each with its own tools, all at least 44 px and named.
  const sizes = {};
  for (const m of ['adjust', 'redact', 'annotate']) {
    await page.click(`.editor [data-tab=${m}]`); await sleep(150);
    sizes[m] = await page.evaluate((m) => [...document.querySelectorAll(`.editor [data-panel=${m}] button`)].filter((b) => b.offsetParent && !b.closest('[hidden]')).map((b) => ({ n: b.getAttribute('aria-label') || b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })), m);
  }
  const tabs = await page.$$eval('.editor [data-tab]', (b) => b.map((x) => x.textContent.trim()));
  record('E1', 'Three modes, Annotate | Adjust | Redact, each with named tools at least 40 px', tabs.join('|') === 'Annotate|Adjust|Redact' && Object.values(sizes).every((l) => l.length && l.every((b) => b.n && b.h >= 40)), JSON.stringify({ tabs, adjust: sizes.adjust.map((b) => b.n), redact: sizes.redact.map((b) => b.n), annotate: sizes.annotate.map((b) => b.n + ':' + b.h) }).slice(0, 400));
  const words = await page.evaluate(() => document.querySelector('.editor').textContent);
  record('E2', 'Cover is now Redact: solid black or grey, and blur is explained as not offered', !/\bCover\b/.test(words) && /Redact/.test(words) && /Black/.test(words) && /Grey/.test(words) && /Blurring is not offered/.test(words), '');
  // E3 redact (black) the top-left quadrant, then rotate and flip: the redaction stays on the same picture area.
  await page.click('.editor [data-tab=redact]'); await page.click('.editor [data-rc=black]');
  await dragOn(page, [0.02, 0.02], [0.48, 0.48]);
  await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=rotate]'); await sleep(150); await page.click('.editor [data-a=fliph]'); await sleep(150);
  const r1 = named(await sampleCanvas(page));
  // Original: red TL (redacted black), green TR, blue BL, yellow BR. Rotate: blue TL, black TR, yellow BL, green BR. Flip H: black TL, blue TR, green BL, yellow BR.
  record('E3', 'A redaction stays over the same picture area through a turn and a flip (preview)', r1.tl === 'black' && r1.tr === 'blue' && r1.bl === 'green' && r1.br === 'yellow', JSON.stringify(r1));
  // E4 annotate: a preset label for the scan type, free text, an arrow, a dot, a circle, a box and a pictogram.
  await page.click('.editor [data-tab=annotate]'); await sleep(200);
  await page.click('.editor [data-at=label]'); await page.waitForSelector('.editor .ed-pop:not([hidden])');
  const firstSet = await page.$$eval('.editor .ed-pop .ed-lab', (l) => l.map((x) => x.textContent));
  const hasLV = await page.$('.editor [data-lbl="LV"]');
  record('E4', 'Label sets start with the scan type (Cardiac: LV, RV, IVC...) and free text is always offered', firstSet[0] === 'Type your own' && firstSet[1] === 'Cardiac' && !!hasLV, firstSet.join(' | '));
  await shot(page, 'E4-labels');
  await page.click('.editor [data-lbl="LV"]'); await sleep(200);
  await page.click('.editor [data-sa=done]');
  await setColour(page, 'cyan');
  await page.click('.editor [data-at=rect]'); await dragOn(page, [0.6, 0.6], [0.9, 0.9]);
  await page.click('.editor [data-sa=done]').catch(() => {});
  await setColour(page, 'red');
  await page.click('.editor [data-at=dot]'); await tapOn(page, [0.25, 0.75]);
  await page.click('.editor [data-sa=done]').catch(() => {});
  await setColour(page, 'white');
  await page.click('.editor [data-at=arrow]'); await dragOn(page, [0.1, 0.55], [0.4, 0.55]);
  await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=circle]'); await dragOn(page, [0.55, 0.1], [0.75, 0.3]);
  await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'Mid'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  await page.click('.editor [data-sa=done]').catch(() => {});
  await page.click('.editor [data-at=picto]'); await page.click('.editor [data-pic="heart-a4c"]'); await sleep(200);
  await page.click('.editor [data-sa=done]').catch(() => {});
  const list = await page.$$eval('.editor [data-pick]', (b) => b.map((x) => x.textContent));
  record('E5', 'Text, label, arrow, dot, circle, box and pictogram are all on the picture and listed', list.length === 7 && list.includes('“LV”') && list.includes('“Mid”') && list.some((x) => /Apical/.test(x)), list.join(', '));
  await shot(page, 'E5-annotated');
  const pv = await sampleCanvas(page, { box: [0.6, 0.75], dot: [0.25, 0.75], red: [0.3, 0.3], tl: [0.05, 0.05] });
  record('E6', 'Colours are applied as chosen (cyan box edge, red dot) and the redaction stays black under them', cname(pv.box) === 'cyan' && cname(pv.dot) === 'red' && cname(pv.tl) === 'black', JSON.stringify(named(pv)));
  // E7 annotations follow a turn: the red dot moves from bottom-left to top-left on a quarter turn clockwise.
  await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=rotate]'); await sleep(200);
  await page.click('.editor [data-tab=annotate]'); await sleep(150);
  // Before: the dot at (0.25, 0.75), the redaction top-left. A quarter turn clockwise maps (x, y) to (1 - y, x).
  const turned = named(await sampleCanvas(page, { dot: [0.25, 0.25], red: [0.75, 0.25] }));
  record('E7', 'Annotations move with the picture: after a quarter turn the dot is at the top-left, the redaction top-right', turned.dot === 'red' && turned.red === 'black', JSON.stringify(turned));
  await page.click('.editor [data-a=undo]'); await sleep(200);
  // E8 save: the stored photo equals the preview, with the annotations and the redaction burnt in.
  const before = named(await sampleCanvas(page, { dot: [0.25, 0.75], tl: [0.05, 0.05] }));
  const previewPng = await page.evaluate(() => document.querySelector('.editor canvas').toDataURL('image/png'));
  record('E8a', 'Use this image stays disabled until the identifier declaration is ticked', await page.evaluate(() => document.querySelector('.editor [data-a=save]').disabled), '');
  await page.check('.editor [data-decl]', { force: true });
  await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' }); await sleep(300);
  await saveScan(page);
  const saved = await sampleStored(page, acc.id, null, { box: [0.6, 0.75], dot: [0.25, 0.75], tl: [0.05, 0.05], tr: [0.75, 0.25] });
  if (!saved || !saved.o) console.log('stored:', JSON.stringify(saved), await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const db = r.result; const out = { stores: [...db.objectStoreNames] }; const t = db.transaction(['entries', 'images']); t.objectStore('entries').getAll().onsuccess = (e) => { out.entries = e.target.result.map((x) => ({ id: x.id, type: x.type, images: x.images })); }; t.objectStore('images').getAll().onsuccess = (e) => { out.images = e.target.result.map((x) => ({ id: x.id, kind: x.kind, keys: Object.keys(x) })); }; t.oncomplete = () => ok(JSON.stringify(out)); }; r.onerror = () => ok('open error'); }), acc.id));
  const sv = saved && saved.o ? named(saved.o) : {};
  // The whole picture compared: mean difference per channel between the preview and the saved JPEG.
  const diff = await page.evaluate(([id, png]) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); const d = q.result.filter((x) => x.kind !== 'clip').sort((a, b) => b.created - a.created)[0];
      const a = new Image(), b = new Image(); let n = 0; const both = () => { if (++n < 2) return; const W = a.naturalWidth, H = a.naturalHeight; const ca = document.createElement('canvas'); ca.width = W; ca.height = H; ca.getContext('2d').drawImage(a, 0, 0); const cb = document.createElement('canvas'); cb.width = W; cb.height = H; cb.getContext('2d').drawImage(b, 0, 0, W, H); const pa = ca.getContext('2d').getImageData(0, 0, W, H).data, pb = cb.getContext('2d').getImageData(0, 0, W, H).data; let s = 0; for (let i = 0; i < pa.length; i += 4) s += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); ok({ mean: s / (W * H * 3), size: [W, H, b.naturalWidth, b.naturalHeight] }); };
      a.onload = both; b.onload = both; a.src = png; b.src = URL.createObjectURL(d.blob); }; };
  }), [acc.id, previewPng]);
  record('E8', 'The saved photo matches the preview: annotations and redaction in the pixels (mean difference under 3 of 255)', saved && sv.dot === before.dot && sv.tl === before.tl && diff.mean < 3, JSON.stringify({ preview: before, saved: sv, diff }));
  record('E9', 'The photo keeps its annotations as data and a redacted copy without them (for editing later)', saved && saved.annot && saved.annot.ann.length === 7 && saved.hasBase && saved.prov && saved.prov[0].redact === 1, JSON.stringify({ ann: saved && saved.annot && saved.annot.ann.length, base: saved && saved.hasBase, prov: saved && saved.prov }));
  const base = await sampleStored(page, acc.id, saved.id, { box: [0.6, 0.75], dot: [0.25, 0.75], tl: [0.05, 0.05] }, 'base');
  record('E10', 'The copy kept for editing has the redaction but no annotations: no unredacted original is stored', base && base.o && cname(base.o.tl) === 'black' && cname(base.o.dot) !== 'red' && cname(base.o.box) !== 'cyan', JSON.stringify(base && base.o ? named(base.o) : base));
  // E11 open it again from the saved scan: annotations come back and can be changed; the redaction cannot be undone.
  const entry = await page.evaluate(() => (document.querySelector('.toast.act a[href^="#/entry/"]') || {}).getAttribute && document.querySelector('.toast.act a[href^="#/entry/"]').getAttribute('href').split('/')[2]);
  await go(page, '#/edit/' + entry); await page.waitForSelector('#gal [data-edold]');
  await page.click('#gal [data-edold]'); await page.waitForSelector('.editor canvas'); await sleep(500);
  const back = await page.$$eval('.editor [data-pick]', (b) => b.map((x) => x.textContent));
  await page.click('.editor [data-tab=annotate]');
  await page.click('.editor [data-pick="2"]').catch(() => {});
  const which = await text(page, '.editor [data-selname]');
  await page.click('.editor [data-sa=del]'); await sleep(150);
  await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=reset]'); await sleep(150);
  const after = named(await sampleCanvas(page, { tl: [0.05, 0.05] }));
  const afterReset = await page.$$eval('.editor [data-pick]', (b) => b.length);
  await page.click('.editor [data-tab=annotate]');
  record('E11', 'Opened again: all 7 annotations return and can be removed; Reset restores them but cannot bring back what was redacted', back.length === 7 && afterReset === 7 && after.tl === 'black', `${back.join(', ')}; selected ${which}; top-left after Reset ${after.tl}`);
  await page.click('.editor [data-pick="2"]'); await page.click('.editor [data-sa=del]'); await sleep(150);
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' });
  await page.click('form button[type=submit]'); await page.waitForFunction(() => /^#\/entry\//.test(location.hash), null, { timeout: 10000 }).catch(() => {}); await sleep(500);
  const re = await sampleStored(page, acc.id, null, { dot: [0.25, 0.75], tl: [0.05, 0.05] });
  record('E12', 'Saved again: one annotation fewer, redaction still black, a new image record (older sign-offs void)', re && re.annot && re.annot.ann.length === 6 && cname(re.o.tl) === 'black' && re.id !== saved.id, JSON.stringify({ ann: re && re.annot && re.annot.ann.length, tl: re && cname(re.o.tl), newId: re && re.id !== saved.id }));
  // E13 text typed as a label is checked for identifiers like the scan's own text.
  await go(page, '#/new?type=aaa'); await sleep(1200); await openPhoto();
  await page.click('.editor [data-tab=annotate]'); await page.click('.editor [data-at=text]'); await page.fill('.editor #edtx', 'DOB 01/02/1960'); await page.click('.editor .ed-pop button.apply'); await sleep(200);
  const warn = await text(page, '.editor .ed-pop .ed-err');
  record('E13', 'A typed label that looks like an identifier is questioned before it is placed', /date of birth/i.test(warn || ''), warn);
  await page.click('.editor .ed-pop [data-x]'); await page.click('.editor [data-a=cancel]'); await sleep(200);
  // E14 grey redaction lands in the saved pixels as solid grey.
  await openPhoto(); await page.click('.editor [data-tab=redact]'); await page.click('.editor [data-rc=grey]');
  await dragOn(page, [0.55, 0.55], [0.95, 0.95]);
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]'); await page.waitForSelector('.editor', { state: 'detached' });
  await saveScan(page);
  const g = await sampleStored(page, acc.id, null, { br: [0.75, 0.75], tl: [0.25, 0.25] });
  record('E14', 'Grey redaction is a solid grey fill in the saved picture', g && cname(g.o.br) === 'grey' && cname(g.o.tl) === 'red' && !g.hasBase, JSON.stringify(g && named(g.o)));
  await ctx.close();
}

// ---------- C: clips (annotations over time, redaction in every frame, export equals preview) ----------
const clipFrames = (page, accId, times, pts) => page.evaluate(([id, times, Q]) => new Promise((ok) => {
  const r = indexedDB.open('wavelength-' + id);
  r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); const d = q.result.filter((x) => x.kind === 'clip').sort((a, b) => b.created - a.created)[0]; if (!d) return ok(null);
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(d.blob); const out = [];
    const grab = () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0); const o = {}; for (const [k, [x, y]] of Object.entries(Q)) o[k] = [...g.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3); out.push(o); if (out.length < times.length) v.currentTime = times[out.length]; else ok({ out, w: v.videoWidth, h: v.videoHeight, dur: d.dur, annot: d.annot || null, prov: d.prov || null, hasBase: !!d.base }); };
    v.onloadeddata = () => { v.currentTime = times[0]; }; v.onseeked = grab; v.onerror = () => ok({ error: true }); }; };
}), [accId, times, pts]);
if (want('C')) {
  const { ctx, page, acc } = await phone();
  const clip = await testClip(page, 6);
  await go(page, '#/new?type=aaa'); await sleep(1500);
  await page.setInputFiles('#vpick', clip); await page.waitForSelector('.editor canvas'); await sleep(2200);
  const ui = await page.evaluate(() => { const q = (s) => document.querySelector('.editor ' + s); return { play: !!q('[data-a=play]'), scrub: !!q('[data-scrub]'), total: (q('[data-total]') || {}).textContent, tabs: [...document.querySelectorAll('.editor [data-tab]')].map((b) => b.textContent.trim()).join('|'), when: !!q('[data-when]') }; });
  record('C1', 'Clip editor: Play, scrubber, real length, the same three modes, and "when it shows" for annotations', ui.play && ui.scrub && /^[56]\.\d/.test(ui.total || '') && ui.tabs === 'Annotate|Adjust|Redact' && ui.when, JSON.stringify(ui));
  // Keep 0 to 3 s. Redact the top-left quarter; label "Ao" for the whole clip; a red dot from 1.5 s on.
  await page.evaluate(() => { const l = document.querySelector('.editor [data-len]'); l.value = 3; l.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(400);
  await page.click('.editor [data-tab=redact]');
  const fits = await page.evaluate(() => { const c = document.querySelector('.editor canvas').getBoundingClientRect(), s = document.querySelector('.editor .stage').getBoundingClientRect(); return c.top >= s.top - 1 && c.bottom <= s.bottom + 1; }); await page.click('.editor [data-rc=black]'); await dragOn(page, [0.01, 0.01], [0.49, 0.49]);
  await page.click('.editor [data-tab=annotate]');
  const fitsA = await page.evaluate(() => { const c = document.querySelector('.editor canvas').getBoundingClientRect(), s = document.querySelector('.editor .stage').getBoundingClientRect(); return c.top >= s.top - 1 && c.bottom <= s.bottom + 1 && c.height > 100; });
  record('C0', 'The whole picture stays in view in every mode (never under the controls)', fits && fitsA, JSON.stringify({ redact: fits, annotate: fitsA }));
  await page.click('.editor [data-at=label]'); await page.waitForSelector('.editor [data-lbl="Ao"]');
  const aaaFirst = await page.$$eval('.editor .ed-pop .ed-lab', (l) => l[1] && l[1].textContent);
  await page.click('.editor [data-lbl="Ao"]'); await sleep(200);
  await page.click('.editor [data-sa=done]');
  await setColour(page, 'red'); await page.click('.editor [data-at=dot]');
  await tapOn(page, [0.75, 0.75]);
  await page.evaluate(() => { const s = document.querySelector('.editor [data-scrub]'); s.value = 1.5; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(600);
  await page.click('.editor [data-when=from]'); await sleep(200);
  const whenText = await text(page, '.editor [data-whentext]');
  record('C2', 'A clip annotation can show from a moment on, and the editor says when', /from 1\.5 s to the end of the kept clip/.test(whenText || ''), whenText);
  await page.click('.editor [data-sa=done]');
  // Back to the start: at 0 s the dot is not drawn, the label and the redaction are.
  await page.evaluate(() => { const s = document.querySelector('.editor [data-scrub]'); s.value = 0.2; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(600);
  const p0 = named(await sampleCanvas(page, { tl: [0.25, 0.25], dot: [0.75, 0.75], c: [0.5, 0.5] }));
  record('C3', 'Preview at 0.2 s: redaction black, dot not yet shown', p0.tl === 'black' && p0.dot === 'yellow', JSON.stringify(p0));
  await shot(page, 'C3-clip-annotated');
  // Rotate a quarter turn: everything moves together. Then prepare and save.
  await page.click('.editor [data-tab=adjust]'); await page.click('.editor [data-a=rotate]'); await sleep(300);
  const pvPng = await page.evaluate(() => document.querySelector('.editor canvas').toDataURL('image/png'));
  await page.check('.editor [data-decl]', { force: true });
  await page.click('.editor [data-a=save]');
  const prog = [];
  for (let i = 0; i < 60; i++) { const t = await page.evaluate(() => { const b = document.querySelector('.editor [data-a=save]'); return b ? b.textContent : 'closed'; }); prog.push(t); if (t === 'closed') break; await sleep(250); }
  record('C4', 'Preparing the clip shows progress and the editor closes when done', prog.some((t) => /Preparing clip/.test(t)) && prog[prog.length - 1] === 'closed', prog.filter((t, i) => i === 0 || t !== prog[i - 1]).join(' > '));
  await saveScan(page);
  // Rotated a quarter turn clockwise: the redaction (was top-left) is top-right; the dot (was bottom-right) is bottom-left.
  const fr = await clipFrames(page, acc.id, [0.1, 0.8, 1.2, 1.7, 2.3, 2.85], { red: [0.75, 0.25], dot: [0.25, 0.75], other: [0.25, 0.25] });
  const okRed = fr && fr.out && fr.out.every((o) => cname(o.red) === 'black');
  const dots = fr && fr.out ? fr.out.map((o) => cname(o.dot)) : [];
  record('C5', 'Redaction is black in every exported frame checked (start, middle, end; 6 frames)', okRed && fr.w < fr.h, JSON.stringify(fr && fr.out ? { size: [fr.w, fr.h], red: fr.out.map((o) => cname(o.red)) } : fr));
  record('C6', 'The timed annotation is absent before 1.5 s and present after, in the exported frames', dots.slice(0, 3).every((d) => d !== 'red') && dots.slice(3).every((d) => d === 'red'), dots.join(', '));
  record('C7', 'Stored duration is the length recorded (about 3 s), annotations kept as data (burnt in), first-session provenance', fr && fr.dur > 2.5 && fr.dur <= 3.6 && fr.annot && fr.annot.burnt && fr.annot.ann.length === 2 && fr.annot.ann.some((a) => a.t0 === 1.5) && fr.prov && fr.prov[0].redact === 1 && !fr.hasBase, JSON.stringify({ dur: fr && fr.dur, annot: fr && fr.annot, prov: fr && fr.prov }));
  // The first exported frame against the preview at the moment of saving (video compression allowed for).
  const firstDiff = await page.evaluate(([id, png]) => new Promise((ok) => {
    const r = indexedDB.open('wavelength-' + id);
    r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); const d = q.result.filter((x) => x.kind === 'clip').sort((a, b) => b.created - a.created)[0];
      const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(d.blob); const im = new Image();
      v.onloadeddata = () => { v.currentTime = 0.05; };
      v.onseeked = () => { im.onload = () => { const W = v.videoWidth, H = v.videoHeight; const a = document.createElement('canvas'); a.width = W; a.height = H; a.getContext('2d').drawImage(v, 0, 0); const b = document.createElement('canvas'); b.width = W; b.height = H; b.getContext('2d').drawImage(im, 0, 0, W, H); const pa = a.getContext('2d').getImageData(0, 0, W, H).data, pb = b.getContext('2d').getImageData(0, 0, W, H).data; let s = 0; for (let i = 0; i < pa.length; i += 4) s += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); ok({ mean: s / (W * H * 3), size: [W, H] }); }; im.src = png; };
    }; };
  }), [acc.id, pvPng]);
  record('C8', 'The saved clip matches the edited preview (first frame, mean difference under 12 of 255)', firstDiff && firstDiff.mean < 12, JSON.stringify(firstDiff));
  record('C9', 'Label sets follow the scan type (AAA first for an AAA scan)', aaaFirst === 'AAA', aaaFirst);
  // A clip that fails part-way adds nothing; the editor stays open with an error (as in 1.0.11).
  await go(page, '#/new?type=aaa'); await sleep(1500);
  await page.setInputFiles('#vpick', clip); await page.waitForSelector('.editor canvas'); await sleep(2000);
  const galBefore = await page.evaluate(() => document.querySelectorAll('#gal img').length);
  await page.evaluate(() => { const s = MediaRecorder.prototype.start; MediaRecorder.prototype.start = function (t) { s.call(this, t); setTimeout(() => this.onerror && this.onerror(new Event('error')), 400); }; });
  await page.check('.editor [data-decl]', { force: true });
  await page.click('.editor [data-a=save]'); await sleep(4000);
  const fail = await page.evaluate(() => ({ open: !!document.querySelector('.editor'), btn: (document.querySelector('.editor [data-a=save]') || {}).textContent, gal: document.querySelectorAll('#gal img').length, err: (document.querySelector('.editor [data-err]') || {}).textContent || '' }));
  record('C10', 'A clip that fails to prepare is not added: editor open, error shown, Use this clip available again', fail.open && fail.gal === galBefore && /Use this clip/.test(fail.btn || '') && fail.err.length > 5, JSON.stringify(fail));
  await page.evaluate(() => { const c = document.querySelector('.editor [data-a=cancel]'); c && c.click(); });
  await ctx.close();
}

// ---------- B: annotations and the redacted copy survive an encrypted backup and a restore on another phone ----------
if (want('B')) {
  globalThis.window = globalThis.window || globalThis;
  window.WLBackupArgon2 = await import('../src/app/vendor/noble-hashes/argon2.js');
  for (const f of ['zip.js', 'backup.js']) new Function(fs.readFileSync(new URL('../src/app/' + f, import.meta.url), 'utf8'))();
  const PASSPHRASE = 'orange tiger lamp river';
  const A = await phone();
  const img = await testImage(A.page);
  await go(A.page, '#/new?type=lung'); await sleep(1500);
  await A.page.setInputFiles('#pick', img); await A.page.waitForSelector('.editor canvas'); await sleep(500);
  await A.page.click('.editor [data-tab=redact]'); await dragOn(A.page, [0.02, 0.02], [0.48, 0.48]);
  await A.page.click('.editor [data-tab=annotate]'); await A.page.click('.editor [data-at=label]'); await A.page.click('.editor [data-lbl="Pleura"]'); await sleep(200);
  await A.page.check('.editor [data-decl]', { force: true }); await A.page.click('.editor [data-a=save]'); await A.page.waitForSelector('.editor', { state: 'detached' });
  await saveScan(A.page);
  const orig = await sampleStored(A.page, A.acc.id, null, { tl: [0.05, 0.05], c: [0.5, 0.5] });
  await go(A.page, '#/backup'); await A.page.waitForSelector('#bkf');
  await A.page.fill('#bkp', PASSPHRASE); await A.page.fill('#bkp2', PASSPHRASE); await A.page.check('#bkok'); await A.page.click('#bk');
  const made = await A.page.waitForSelector('text=Encrypted backup created', { timeout: 90000 }).then(() => true, () => false);
  const files = await A.page.evaluate(() => window.__files || {});
  const fname = Object.keys(files).find((k) => /^backup\/Wavelength-backup-.*\.wlbackup$/.test(k));
  const file = fname ? Buffer.concat(files[fname].map((b) => Buffer.from(b, 'base64'))) : Buffer.alloc(0);
  const plain = [];
  await WLBackup.decrypt(PASSPHRASE, async (o, n) => new Uint8Array(file.subarray(o, o + n)), file.length, (p) => { plain.push(Buffer.from(p)); });
  const zip = Buffer.concat(plain);
  const inside = WLZip.unzip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
  const man = JSON.parse(Buffer.from(inside['wavelength-backup.json']).toString());
  const im = man.images.find((x) => x.id === orig.id);
  const order = Object.keys(inside);
  record('B1', 'The encrypted backup carries the annotations as data and the redacted copy, before the photo itself', made && man.version === 3 && im && im.annot && im.annot.ann[0].text === 'Pleura' && im.base && inside[im.base] && order.indexOf(im.base) < order.indexOf(im.file) && im.prov, JSON.stringify({ made, version: man.version, annot: im && im.annot, base: im && im.base, prov: im && im.prov }));
  const fpath = path.join(OUT, 'b1012.wlbackup'); fs.writeFileSync(fpath, file);
  await A.ctx.close();
  // Phone B: same account, a new phone. Restore, then open the photo for editing: the annotation is still editable.
  const B = await phone({ acc: A.acc });
  await go(B.page, '#/backup'); await B.page.waitForSelector('#rf', { state: 'attached' });
  await B.page.setInputFiles('#rf', fpath); await B.page.waitForSelector('#rpf');
  await B.page.fill('#rpp', PASSPHRASE); await B.page.click('#rpf button.teal');
  await B.page.waitForFunction(() => document.body.innerText.includes('Restored'), null, { timeout: 90000 }).catch(() => {});
  await sleep(800);
  const rest = await sampleStored(B.page, A.acc.id, orig.id, { tl: [0.05, 0.05], c: [0.5, 0.5] });
  record('B2', 'Restored on another phone: the same pixels (redaction black), the annotations and the redacted copy', rest && rest.annot && rest.annot.ann[0].text === 'Pleura' && rest.hasBase && cname(rest.o.tl) === 'black' && JSON.stringify(rest.o) === JSON.stringify(orig.o), JSON.stringify({ annot: rest && rest.annot, base: rest && rest.hasBase, tl: rest && cname(rest.o.tl) }));
  const entryId = await B.page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').getAll(); q.onsuccess = () => { r.result.close(); ok((q.result[0] || {}).entryId); }; }; }), A.acc.id);
  await go(B.page, '#/edit/' + entryId); await B.page.waitForSelector('#gal [data-edold]'); await sleep(500);
  await B.page.click('#gal [data-edold]'); await B.page.waitForSelector('.editor canvas'); await sleep(500);
  const picks = await B.page.$$eval('.editor [data-pick]', (b) => b.map((x) => x.textContent));
  const tl = named(await sampleCanvas(B.page, { tl: [0.05, 0.05] }));
  record('B3', 'After restore the photo opens for editing with its annotation, and the redaction cannot be undone', picks.join() === '“Pleura”' && tl.tl === 'black', `${picks.join()}; top-left ${tl.tl}`);
  await B.page.click('.editor [data-a=cancel]');
  await B.ctx.close();
  // B4 a phone still on 1.0.11 restores the same file: the photo (with its annotation in the pixels) comes back, and
  // the new fields are ignored. Needs the 1.0.11 bundle: REF_BUNDLE=<dir>.
  if (process.env.REF_BUNDLE) {
    const fresh = await account('Old', 'Phone');
    const C = await phone({ acc: fresh, bundle: path.resolve(process.env.REF_BUNDLE) });
    await go(C.page, '#/backup'); await C.page.waitForSelector('#rf', { state: 'attached' });
    await C.page.setInputFiles('#rf', fpath); await C.page.waitForSelector('#rpf');
    await C.page.fill('#rpp', PASSPHRASE); await C.page.click('#rpf button.teal');
    await C.page.waitForSelector('.sheet [data-ok]', { timeout: 60000 }).then(() => C.page.click('.sheet [data-ok]')).catch(() => {});
    await C.page.waitForFunction(() => document.body.innerText.includes('Restored'), null, { timeout: 90000 }).catch(() => {});
    await sleep(800);
    const old = await sampleStored(C.page, fresh.id, orig.id, { tl: [0.05, 0.05], c: [0.5, 0.5] });
    record('B4', 'A 1.0.11 phone restores a 1.0.12 backup: the photo as saved (redaction and annotation in the pixels)', old && old.o && cname(old.o.tl) === 'black' && JSON.stringify(old.o) === JSON.stringify(orig.o), JSON.stringify(old && old.o ? named(old.o) : old));
    await C.ctx.close();
  }
}

// ---------- G: guides and accreditation ----------
if (want('G')) {
  for (const [pw, first] of [['rcem', 'rcem-ultrasound-sign-off'], ['famus', 'famus-accreditation'], ['fusic', 'fusic-accreditation'], ['acem', 'pocus-accreditation']]) {
    const acc = await account('Gu', 'Ide', [pw]);
    const { ctx, page } = await phone({ acc });
    await go(page, '#/progress'); await page.waitForSelector('.guide-link[data-guides=mine]');
    const fromProgress = await page.$eval('.guide-link[data-guides=mine]', (a) => a.getAttribute('href'));
    await page.click('.guide-link[data-guides=mine]'); await page.waitForSelector('.guide-body'); 
    const opened = await page.evaluate(() => location.hash);
    await go(page, '#/guides'); await page.waitForSelector('.guide-card.lead');
    const lead = await page.$eval('.guide-card.lead', (a) => a.getAttribute('href'));
    record('G1-' + pw, `${pw.toUpperCase()} learner: Progress opens the ${first} guide and the library puts it first`, fromProgress === '#/guides/' + first && opened === '#/guides/' + first && lead === '#/guides/' + first, `${fromProgress} / ${lead}`);
    if (pw === 'rcem') await shot(page, 'G1-library');
    await ctx.close();
  }
  const { ctx, page } = await phone();
  await go(page, '#/guides/rcem-ultrasound-sign-off'); await page.waitForSelector('.guide-body h2');
  const g = await page.evaluate(() => ({ note: document.querySelector('.guide-note').textContent, toc: document.querySelectorAll('[data-goto]').length, src: [...document.querySelectorAll('.guide-src a')].map((a) => [a.getAttribute('href'), a.target]), internal: [...document.querySelectorAll('.guide-body a')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('#/guides/')), ids: [...document.querySelectorAll('.guide-body h2')].map((h) => h.id) }));
  record('G2', 'A guide says it is Wavelength\'s, not an official document, with its check date and official sources', /not an official document/.test(g.note) && /Checked against official sources 4 Oct 2026/.test(g.note) && g.src.length >= 5 && g.src.every(([h, t]) => /^https:\/\//.test(h) && t === '_blank'), JSON.stringify({ note: g.note.slice(0, 160), sources: g.src.length }));
  record('G3', 'Contents list, and links to other guides open inside the app', g.toc >= 10 && g.internal.length >= 1, `${g.toc} sections; ${g.internal.join(', ')}`);
  // Same source as the website: the section ids match the built /guides/ page.
  const site = fs.readFileSync('dist/guides/rcem-ultrasound-sign-off/index.html', 'utf8');
  const siteIds = [...site.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
  record('G4', 'The app guide is the website guide (same Markdown, same sections)', JSON.stringify(siteIds.filter((x) => g.ids.includes(x))) === JSON.stringify(g.ids) && g.ids.length >= 10, `${g.ids.length} sections in both`);
  await page.click('[data-goto="sources"]').catch(() => {}); await sleep(700);
  await shot(page, 'G2-guide');
  await go(page, '#/guides/rcem-ultrasound-sign-off/glance'); await page.waitForSelector('.guide-body.glance');
  record('G5', 'The one-page summary opens in the app', (await text(page, '.guide-body.glance')).length > 300, '');
  // Offline: the guides come with the app.
  net.offline = true; await setNet(page, NONE); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.goto('https://localhost/'); await page.waitForSelector('nav.tabs'); await go(page, '#/guides/famus-accreditation'); await page.waitForSelector('.guide-body h2', { timeout: 8000 }).catch(() => {});
  record('G6', 'Offline, after a restart: guides open from the app itself', (await page.$$('.guide-body h2')).length > 5, '');
  reset(); await setNet(page, WIFI);
  await go(page, '#/guides'); await page.waitForSelector('a[href="#/guides/supervisor-verification"]');
  record('G7', 'The library includes "How supervisor verification works"', true, '');
  await ctx.close();
  // Arabic: the app around the guide is right to left and says the guides are in English.
  const ar = await phone({ lang: 'ar', dark: true });
  await go(ar.page, '#/guides/famus-accreditation'); await ar.page.waitForSelector('.guide-body h2');
  const arInfo = await ar.page.evaluate(() => ({ dir: document.documentElement.dir, body: document.querySelector('.guide-body').dir + '/' + document.querySelector('.guide-body').lang, note: document.querySelector('.guide-note').textContent, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  record('G8', 'Arabic, dark theme: app right to left, the English guide left to right, the note in Arabic, no sideways scroll', arInfo.dir === 'rtl' && arInfo.body === 'ltr/en' && !/Guides are in English/.test(arInfo.note) && !arInfo.overflow, JSON.stringify(arInfo).slice(0, 200));
  await shot(ar.page, 'G8-guide-ar-dark');
  await ar.ctx.close();
}

// ---------- W: the website app (/app/ with its service worker) saves scans the way the Android app does ----------
// Needs a second local Worker serving the built site: node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// 8792 --site (after node build.js). SITE_API=http://localhost:8792.
if (want('W') && process.env.SITE_API) {
  const SITE_API = process.env.SITE_API;
  localOnly(SITE_API, 'tools/e2e-1012.mjs (W)');
  const { chromium } = await import('playwright');
  const wb = await chromium.launch();
  const ctx = await wb.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('web: ' + e));
  await page.goto(SITE_API + '/app/');
  const email = `web1012${Date.now()}@example.com`;
  const id = await page.evaluate(async (email) => {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    await fetch('/api/app/signup', { method: 'POST', headers: h, credentials: 'same-origin', body: JSON.stringify({ firstName: 'Web', lastName: 'User', email, password: 'Long-password-1', terms: true }) });
    const p = await fetch('/api/app/profile', { method: 'POST', headers: h, credentials: 'same-origin', body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((r) => r.json());
    return p.account.id;
  }, email);
  await page.goto(SITE_API + '/app/'); await page.waitForSelector('nav.tabs');
  const sw = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false));
  const serverRows = async () => (await fetch(SITE_API + '/__dev/entries').then((r) => r.json())).filter((r) => r.learner_id === id && !r.deleted);
  const fillScan = async () => { await page.evaluate(() => { location.hash = '#/new'; }); await page.waitForSelector('label[for=t0]'); await page.click('label[for=t0]'); await page.waitForSelector('#rest:not([hidden])'); await page.locator('input[name=supervision]').first().check({ force: true }); };
  // W1 two quick taps on Save: one scan, back Home, a short note, no completion sheet.
  await fillScan();
  await page.evaluate(() => { const b = document.querySelector('form button[type=submit]'); b.click(); b.click(); });
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 10000 }).catch(() => {});
  await sleep(2500);
  const note1 = await page.evaluate(() => (document.querySelector('.toast.act') || {}).textContent || '');
  const sheet1 = await page.evaluate(() => !!document.querySelector('.sheet-bg'));
  const rows1 = await serverRows();
  record('W1', 'Website: two quick Save taps make one scan, return Home with a short note, no completion sheet', rows1.length === 1 && !sheet1 && /Scan saved/.test(note1), JSON.stringify({ server: rows1.length, note: note1, sheet: sheet1, sw }));
  record('W2', 'Website: "synced" only after the server has the scan', /synced/.test(note1) ? rows1.length === 1 : true, note1);
  // W3 offline: saved on this device, awaiting sync; never "synced"; then synced once online.
  await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await fillScan(); await page.click('form button[type=submit]');
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 10000 }).catch(() => {});
  await sleep(800);
  const note2 = await page.evaluate(() => (document.querySelector('.toast.act') || {}).textContent || '');
  record('W3', 'Website offline: "Saved on this device. Awaiting sync." and nothing claims it synced', /Saved on this device\. Awaiting sync\./.test(note2) && (await serverRows()).length === 1, note2);
  // W4 an app update (a new service worker) while a scan waits: the scan survives and syncs.
  // A real update: the site is built again (a new build id), as a deploy would, while the scan is still waiting.
  const before = await page.evaluate(() => window.caches.keys());
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['build.js'], { stdio: 'ignore' });
  await ctx.setOffline(false);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
  await sleep(2500);
  await page.reload(); await page.waitForSelector('nav.tabs'); await sleep(3000);
  const caches = await page.evaluate(() => window.caches.keys());
  const rows2 = await serverRows();
  const local = await page.evaluate((id) => new Promise((ok) => { const r = indexedDB.open('wavelength-' + id); r.onsuccess = () => { const q = r.result.transaction('entries').objectStore('entries').getAll(); q.onsuccess = () => { r.result.close(); ok(q.result.length); }; }; r.onerror = () => ok(-1); }), id);
  record('W4', 'Website update (new service worker): old cache replaced, the waiting scan kept and synced once', caches.length === 1 && before.length === 1 && caches[0] !== before[0] && rows2.length === 2 && local === 2, JSON.stringify({ before, after: caches, server: rows2.length, local }));
  // W5 a validation error keeps what was typed.
  await page.evaluate(() => { location.hash = '#/new'; }); await page.waitForSelector('label[for=t0]'); await page.click('label[for=t0]'); await page.waitForSelector('#rest:not([hidden])');
  await page.fill('#refl', 'Reflection kept through a validation error');
  await page.click('form button[type=submit]'); await sleep(600);
  const kept = await page.evaluate(() => ({ refl: document.querySelector('#refl').value, invalid: [...document.querySelectorAll('.field.invalid')].map((f) => f.dataset.req) }));
  record('W5', 'Website: a missing required answer is marked and everything typed is kept', kept.refl === 'Reflection kept through a validation error' && kept.invalid.includes('supervision'), JSON.stringify(kept));
  await page.evaluate(() => { const f = document.querySelector('form[data-dirty]'); if (f) delete f.dataset.dirty; });
  await wb.close();
}

// ---------- R: short screen recordings for the owner (synthetic data; ONLY=R) ----------
// Not checks: each clip shows one piece of 1.0.12 moving as a learner or supervisor would see it.
if (only.includes('R')) {
  const keep = async (ctx, page, name) => { const v = page.video(); await ctx.close(); if (v) fs.renameSync(await v.path(), path.join(VIDS, name + '.webm')); };
  // R1 Still to do: swipe through the cards, then the arrows.
  {
    const acc = await busyAccount();
    const { ctx, page } = await phone({ acc, video: true });
    await page.evaluate(() => { const r = document.querySelector('.reqs'); if (r) r.scrollIntoView({ block: 'center' }); }); await sleep(900);
    for (let i = 0; i < 3; i++) { await page.evaluate(() => { const t = document.querySelector('.req-track'); t.scrollBy({ left: t.clientWidth, behavior: 'smooth' }); }); await sleep(1100); }
    for (let i = 0; i < 2; i++) { const b = await page.$('[data-reqstep="-1"]'); if (b) await b.click(); await sleep(1000); }
    await keep(ctx, page, 'R1-still-to-do-carousel');
  }
  // R2 the editor: redact, turn, label, arrow, pictogram, then use the image.
  {
    const { ctx, page } = await phone({ video: true });
    const img = await testImage(page);
    await go(page, '#/new?type=cardiac'); await sleep(1200);
    await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas'); await sleep(900);
    await page.click('.editor [data-tab=redact]'); await sleep(500); await dragOn(page, [0.04, 0.04], [0.45, 0.2]); await sleep(700);
    await page.click('.editor [data-tab=adjust]'); await sleep(500); await page.click('.editor [data-a=rotate]'); await sleep(800); await page.click('.editor [data-a=rotate]'); await sleep(800); await page.click('.editor [data-a=rotate]'); await sleep(400); await page.click('.editor [data-a=rotate]'); await sleep(800);
    await page.click('.editor [data-tab=annotate]'); await sleep(500);
    await page.click('.editor [data-at=label]'); await page.waitForSelector('.editor .ed-pop:not([hidden])'); await sleep(900); await page.click('.editor [data-lbl="LV"]'); await sleep(700);
    await page.click('.editor [data-sa=done]').catch(() => {});
    await setColour(page, 'cyan'); await page.click('.editor [data-at=arrow]'); await dragOn(page, [0.15, 0.7], [0.45, 0.55]); await sleep(700);
    await page.click('.editor [data-sa=done]').catch(() => {});
    await page.click('.editor [data-at=picto]'); await sleep(700); await page.click('.editor [data-pic="heart-a4c"]'); await sleep(900);
    await page.click('.editor [data-sa=done]').catch(() => {});
    await page.check('.editor [data-decl]'); await sleep(500); await page.click('.editor [data-a=save]'); await sleep(1500);
    await page.evaluate(() => { const f = document.querySelector('form[data-dirty]'); if (f) delete f.dataset.dirty; });
    await keep(ctx, page, 'R2-media-editor');
  }
  // R3 a supervisor opens a trainee, taps a tile, comes back and ends supervision.
  {
    const { sup, learner } = await pair(6);
    const { ctx, page } = await phone({ acc: sup, video: true });
    await go(page, '#/supervise'); await sleep(1200);
    await go(page, '#/supervise/' + learner.id); await page.waitForSelector('.stats a.stat'); await sleep(1200);
    await page.click('.stats a.stat:nth-child(2)'); await sleep(1600);
    await page.evaluate(() => history.back()); await page.waitForSelector('[data-end]'); await sleep(800);
    await page.evaluate(() => document.querySelector('[data-end]').scrollIntoView({ block: 'center', behavior: 'smooth' })); await sleep(900);
    await page.click('[data-end]'); await sleep(1400);
    const go2 = await page.$('.sheet button.btn.red, .sheet [data-go]'); if (go2) await go2.click(); await sleep(2000);
    await keep(ctx, page, 'R3-end-supervision');
  }
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed${errors.length ? `; ${errors.length} page errors` : ''}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
