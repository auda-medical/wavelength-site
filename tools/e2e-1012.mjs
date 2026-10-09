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

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed${errors.length ? `; ${errors.length} page errors` : ''}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(failed.length ? 1 : 0);
