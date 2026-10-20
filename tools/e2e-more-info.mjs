// Release M checks in a browser (19 October 2026, owner): a supervisor asks for more information from the dashboard
// without signing or ticking anything; the learner sees who asked and what for, and sends it back to the same person
// from the usual request sheet (supervisor already chosen, images can be included); the supervisor sees it again.
// Runs the real bundle (mobile/www) over the stand-in native bridge against a local Worker. Synthetic accounts only.
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-more-info.mjs [results.json] [http://localhost:8787]
import fs from 'node:fs';
import { harness, net, DEVICE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
localOnly(API, 'tools/e2e-more-info.mjs');
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', detail); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIFI = { ...DEVICE.wifi, underlying: true, underlyingTransports: ['wifi'] };
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };

async function account(first, last) {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const email = `mi${t}@example.com`;
  const r = await fetch(API + '/api/app/signup', { method: 'POST', headers: H, body: JSON.stringify({ firstName: first, lastName: last, email, password: 'Long-password-1', terms: true }) });
  const token = r.headers.get('X-Wavelength-Token');
  const p = await fetch(API + '/api/app/profile', { method: 'POST', headers: { ...H, Authorization: 'Bearer ' + token }, body: JSON.stringify({ declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } }) }).then((x) => x.json());
  return { token, id: p.account.id, email };
}
const call = (acc, p, body) => fetch(API + '/api/app/' + p, { method: body ? 'POST' : 'GET', headers: { ...H, Authorization: 'Bearer ' + acc.token }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
async function phone(acc) {
  Object.assign(net, { offline: false, hang: false, delay: 0, blocked: false, challenge: false });
  const { ctx, page } = await newApp(390, 844, { init: [`window.__netdev = ${JSON.stringify(WIFI)};`] });
  await page.goto('https://localhost/');
  await page.evaluate((tok) => { localStorage.setItem('__secure', JSON.stringify({ 'wavelength.session': tok })); }, acc.token);
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.tabs', { timeout: 15000 });
  await sleep(700);
  return { ctx, page };
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const sheetText = (page) => page.evaluate(() => (document.querySelector('.sheet') || {}).textContent || '');

const learner = await account('Ada', 'Trainee'), sup = await account('Sam', 'Supervisor');
const today = new Date().toISOString().slice(0, 10);
await call(learner, 'sync', { entries: [{ id: `e1020moreinfo${learner.id}x0`, type: 'efast', date: today, supervision: 'direct', createdAt: Date.now(), updatedAt: 0 }] });
await call(learner, 'supervisors/add', { email: sup.email });
const inv = (await call(sup, 'supervisors')).invites[0];
await call(sup, 'supervisors/accept', { id: inv.id });
const req = await call(learner, 'signoff/request', { entryIds: [`e1020moreinfo${learner.id}x0`], supervisorLink: inv.id });
if (!req.ok || !req.toDashboard) { console.log('REQUEST', JSON.stringify(req)); }

// A: the supervisor asks for more information from the sign-off sheet.
{
  const { ctx, page } = await phone(sup);
  await go(page, '#/supervise/' + learner.id + '/requests');
  await page.waitForSelector('[data-sv-so]', { timeout: 15000 }).catch(async (e) => { console.log('PAGE', (await page.evaluate(() => document.body.innerText)).slice(0, 600)); throw e; });
  await page.click('[data-sv-so]');
  await page.waitForSelector('.sheet [data-more]');
  const both = await page.evaluate(() => [!!document.querySelector('.sheet [data-more]'), !!document.querySelector('.sheet [data-decline]')]);
  record('A1', 'The sign-off sheet offers "Ask for more information" beside "Decline this request"', both[0] && both[1], JSON.stringify(both));
  await page.click('.sheet [data-more]');
  await page.waitForSelector('#mif');
  const t = await sheetText(page);
  record('A2', 'The more-information sheet asks only for a note: no signature, no confirmation tick', /What do you need/.test(t) && /Nothing is signed/.test(t) && !(await page.$('#mif input[type=checkbox], #mif canvas')), t.slice(0, 160));
  await page.fill('#mir', 'Please add the images of each view.');
  await page.click('#mif button.teal');
  await sleep(1500);
  const row = await call(sup, 'supervise/signoff?code=' + req.code);
  record('A3', 'Sent back: the request leaves the supervisor\'s dashboard', row.status === 404, 'status ' + row.status);
  await ctx.close();
}

// B: the learner sees who asked and what for, and sends it back to the same supervisor.
{
  const { ctx, page } = await phone(learner);
  // 1.0.25 (owner, 20 Oct): the trainee sees it without opening the Sign-off page: Home, Logbook, the scan.
  await page.waitForSelector('[data-resendr]', { timeout: 15000 }).catch(() => {});
  const home = await page.evaluate(() => { const b = document.querySelector('[data-resendr]'); const c = b && b.closest('.card'); return c ? c.textContent.replace(/\s+/g, ' ') : ''; });
  record('R1', 'Home shows "Sent back to you" with the supervisor\'s note and Send back to that supervisor', /Sent back to you/.test(home) && /Please add the images of each view/.test(home) && /Send back to Sam Supervisor/.test(home), home.slice(0, 200));
  await go(page, '#/log?s=waiting'); await sleep(800);
  const row = await page.evaluate(() => { const r = [...document.querySelectorAll('a.entry')].find((x) => /Sent back to you/.test(x.textContent)); return r ? { red: r.classList.contains('s-red'), chip: (r.querySelector('.chip.red') || {}).textContent } : null; });
  record('R2', 'In the logbook (Awaiting) the scan is red "Sent back to you", not amber like the others', !!row && row.red && row.chip === 'Sent back to you', row);
  await go(page, '#/entry/' + 'e1020moreinfo' + learner.id + 'x0'); await sleep(800);
  const ent = await page.evaluate(() => { const b = document.querySelector('.signbox'); return { text: b ? b.textContent : '', btn: (document.querySelector('[data-resendr]') || {}).textContent }; });
  record('R3', 'The scan itself says who sent it back and why, with Send back to that supervisor', /Sent back to you/.test(ent.text) && /Please add the images of each view/.test(ent.text) && ent.btn === 'Send back to Sam Supervisor', ent);
  await go(page, '#/signoff');
  await page.waitForSelector('[data-resend]', { timeout: 15000 });
  const card = await page.evaluate(() => document.querySelector('[data-resend]').closest('.card').textContent.replace(/\s+/g, ' '));
  record('B1', 'The learner sees who asked for more information and what for, with "Send back to" that supervisor', /Sam Supervisor asked for more information: Please add the images of each view\./.test(card) && /Sent back to you/.test(card) && /Send back to Sam Supervisor/.test(card) && /Send to someone else/.test(card), card.slice(0, 220));
  await page.click('[data-resend]');
  await page.waitForSelector('#lf');
  const sel = await page.evaluate(() => { const s = document.querySelector('#tosup'); return { title: document.querySelector('.sheet h2').textContent, chosen: s ? s.options[s.selectedIndex].textContent : null }; });
  record('B2', 'The usual request sheet opens titled "Send back to Sam Supervisor", with Sam already chosen', /Send back to Sam Supervisor/.test(sel.title) && /Sam Supervisor/.test(sel.chosen || ''), JSON.stringify(sel));
  await page.click('#lf button.teal');
  // 1.0.21: a dashboard request ends on 'Request sent' (the link is optional, folded away).
  await page.waitForFunction(() => /Request sent/.test((document.querySelector('.sheet h2') || {}).textContent || ''), null, { timeout: 15000 });
  await sleep(500);
  const list = await call(learner, 'signoffs');
  const old = list.signoffs.find((s) => s.id === req.code), fresh = list.signoffs.find((s) => s.id !== req.code && s.status === 'pending');
  record('B3', 'Sent back: the old request is closed and a new one waits in the same supervisor\'s dashboard', old && old.status === 'cancelled' && fresh && fresh.supervisor_id === sup.id, JSON.stringify({ old: old && old.status, fresh: fresh && [fresh.id, fresh.supervisor_id] }));
  await ctx.close();
  const back = fresh ? await call(sup, 'supervise/signoff?code=' + fresh.id) : { status: 0 };
  record('B4', 'The supervisor can open it again to review and sign', back.status === 200, 'status ' + back.status);
}

const errs = errors.filter((e) => !/Failed to load resource/.test(e));
record('E1', 'No page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
await browser.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
