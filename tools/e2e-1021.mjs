// 1.0.21 checks in a browser (19 October 2026, owner): a trainee logs a scan with a photo, chooses "Independent,
// reviewed by mentor" and the linked supervisor from cards, taps "Save and send to ..."; the request goes to the
// supervisor's dashboard with the photo; the supervisor opens it in the app and sees the photo; Cancel on "Ask for more
// information" goes back to the request; Log out is on Me. Runs the real bundle (mobile/www) over the stand-in native
// bridge against a local Worker. Synthetic accounts only.
//
// Setup: node mobile/scripts/build-www.mjs, then in another terminal
//   node --import ./test/helpers/register.mjs tools/dev-worker.mjs
// Run:   node tools/e2e-1021.mjs [results.json] [http://localhost:8787] [shots folder]
import fs from 'node:fs';
import path from 'node:path';
import { harness, net, DEVICE } from './native-harness.mjs';
import { localOnly } from './local-only.mjs';

const OUT = process.argv[2] || '';
const API = process.argv[3] || 'http://localhost:8787';
const SHOTS = process.argv[4] || '';
localOnly(API, 'tools/e2e-1021.mjs');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const record = (id, name, pass, detail) => { results.push({ id, name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', id, name, '-', typeof detail === 'string' ? detail : JSON.stringify(detail)); };
const errors = [];
const { browser, newApp } = await harness({ api: API, errors });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => { if (SHOTS) { await sleep(300); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const WIFI = { ...DEVICE.wifi, underlying: true, underlyingTransports: ['wifi'] };
const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://localhost', 'X-Wavelength-Client': 'app' };

async function account(first, last) {
  const t = Date.now() + '' + Math.floor(Math.random() * 1e4);
  const email = `i21${t}@example.com`;
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
  await sleep(1500);
  return { ctx, page };
}
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const sheetText = (page) => page.evaluate(() => (document.querySelector('.sheet') || {}).textContent || '');

const learner = await account('Ada', 'Trainee'), sup = await account('Sam', 'Supervisor');
await call(learner, 'supervisors/add', { email: sup.email });
const inv = (await call(sup, 'supervisors')).invites[0];
await call(sup, 'supervisors/accept', { id: inv.id });

// A test photo (a grey frame with a white bar), as a file to pick.
const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'wl1021-'));
const img = path.join(tmp, 'scan-photo.png');

let code = null;
// L: the trainee logs a scan with a photo and sends it in one go.
{
  const { ctx, page } = await phone(learner);
  if (!fs.existsSync(img)) { const b = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = '#333'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.fillRect(100, 200, 440, 60); return c.toDataURL('image/png').split(',')[1]; }); fs.writeFileSync(img, Buffer.from(b, 'base64')); }
  await go(page, '#/new');
  await page.waitForSelector('#ef');
  await page.click('label[for=t0]'); await page.waitForSelector('#rest:not([hidden])'); await sleep(500);
  const cards = await page.$$eval('input[name=suppick] + label', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  record('L1', 'Supervisor or mentor shows cards (the linked supervisor first, then Someone else), not a plain list', cards.length === 2 && /Sam Supervisor/.test(cards[0]) && /Linked supervisor/.test(cards[0]) && /Someone else/.test(cards[1]) && !(await page.$('datalist')), cards);
  const before = await page.$eval('#sv1', (b) => b.textContent);
  await page.click('label[for=supervision1]'); await sleep(200); // Independent, reviewed by mentor
  await page.click('label[for=sp0]'); await sleep(300);
  const btns = await page.evaluate(() => ({ b1: document.querySelector('#sv1').textContent, b2: document.querySelector('#sv2').hidden ? null : document.querySelector('#sv2').textContent, hint: document.querySelector('#savehint').textContent, name: document.querySelector('#supv').value, boxHidden: document.querySelector('#supv').hidden }));
  record('L2', 'The buttons follow the choice: "Save and send to Sam Supervisor" and "Save as draft", with a hint', before === 'Save scan' && btns.b1 === 'Save and send to Sam Supervisor' && btns.b2 === 'Save as draft' && /Sam Supervisor sees it in their app/.test(btns.hint) && btns.name === 'Sam Supervisor' && btns.boxHidden, btns);
  await page.click('label[for=supervision0]'); await sleep(200);
  const direct = await page.evaluate(() => [document.querySelector('#sv1').textContent, document.querySelector('#sv2').textContent]);
  record('L3', 'Directly supervised offers "Save and sign now: supervisor is with me" or "Save as draft"', direct[0] === 'Save and sign now: supervisor is with me' && direct[1] === 'Save as draft', direct);
  await page.click('label[for=supervision1]'); await sleep(200);
  await shot(page, 'L-form-supervision');
  // The photo.
  await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas', { timeout: 15000 }); await sleep(600);
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]');
  await page.waitForSelector('.editor', { state: 'detached', timeout: 15000 }); await sleep(600);
  await page.click('#sv1');
  await page.waitForSelector('#lf', { timeout: 30000 });
  const sheet = await page.evaluate(() => { const s = document.querySelector('#tosup'); return { chosen: s ? s.options[s.selectedIndex].textContent : null, incl: !!document.querySelector('#incl') && document.querySelector('#incl').checked, text: document.querySelector('.sheet').textContent.replace(/\s+/g, ' ') }; });
  record('L4', 'After saving, the request sheet opens with Sam already chosen and the photo included', /Sam Supervisor/.test(sheet.chosen || '') && sheet.incl && /only the supervisor you send them to can open them/.test(sheet.text), { chosen: sheet.chosen, incl: sheet.incl });
  await shot(page, 'L-request-sheet');
  await page.evaluate(() => { const d = document.querySelector('#decl'); d.checked = true; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#lf button.teal');
  await page.waitForFunction(() => /Request sent/.test((document.querySelector('.sheet h2') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const done = await sheetText(page);
  record('L5', 'Sent: "Request sent", your supervisor sees it in their app now with 1 image; no link to send', /Request sent/.test(done) && /with 1 image/.test(done), done.slice(0, 200));
  await shot(page, 'L-request-sent');
  const list = await call(learner, 'signoffs');
  const so = list.signoffs.find((x) => x.status === 'pending');
  code = so && so.id;
  record('L6', 'The request waits in Sam\'s dashboard', so && so.supervisor_id === sup.id, so ? [so.id, so.supervisor_id === sup.id] : 'none');
  // Log out on Me.
  await go(page, '#/me'); await page.waitForSelector('#melo', { timeout: 10000 }).catch(() => {});
  record('L7', 'Log out is on Me (as well as Settings)', !!(await page.$('#melo')) && (await page.$eval('#melo', (b) => b.textContent)) === 'Log out', 'button ' + !!(await page.$('#melo')));
  await ctx.close();
}

// S: the supervisor opens the request in the app and sees the photo.
{
  const { ctx, page } = await phone(sup);
  await go(page, '#/supervise/' + learner.id + '/requests');
  await page.waitForSelector('[data-sv-so]', { timeout: 15000 });
  await page.click('[data-sv-so]');
  await page.waitForSelector('.sheet [data-more]');
  await page.waitForSelector('.sheet canvas.review-img', { timeout: 30000 }).catch(() => {});
  const seen = await page.evaluate(() => { const c = document.querySelector('.sheet canvas.review-img'); return c ? { w: c.width, h: c.height } : null; });
  record('S1', 'The supervisor sees the photo in the app, marked as a review copy', !!seen && seen.w > 100 && seen.h > 100, seen || (await sheetText(page)).slice(0, 300));
  const noWarn = await page.evaluate(() => !/link only|No images were attached/.test(document.querySelector('.sheet').textContent));
  record('S2', 'No "link only" or "no images" warning when the photo is there', noWarn, '');
  await shot(page, 'S-review-with-photo');
  await page.click('.sheet [data-more]');
  await page.waitForSelector('#mif');
  await page.click('#mif .btn.ghost');
  await page.waitForSelector('.sheet [data-sv-so], .sheet #pf', { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const back = await page.evaluate(() => ({ review: !!document.querySelector('.sheet #pf') && /Sign off for/.test(document.querySelector('.sheet h2').textContent), photo: !!document.querySelector('.sheet canvas.review-img') }));
  record('S3', 'Cancel on "Ask for more information" goes back to the same request, photo included', back.review && back.photo, back);
  await ctx.close();
}

// K: signing deletes the shared photo and its key from the server.
{
  const sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const entry = (await call(sup, 'supervise/signoff?code=' + code)).entries[0].id;
  const s = await call(sup, 'supervise/signoff', { code, name: 'Sam Supervisor', role: 'Consultant', basis: 'reviewed', confirm: true, signature: sig, decisions: { [entry]: 'confirmed' } });
  const after = await fetch(API + `/api/app/supervise/signoff/image?code=${code}&entry=${entry}&n=0`, { headers: { ...H, Authorization: 'Bearer ' + sup.token } });
  record('K1', 'After signing, the photo can no longer be fetched', s.ok && after.status === 410, { signed: s.ok, image: after.status });
}

const errs = errors.filter((e) => !/Failed to load resource/.test(e));
record('E1', 'No page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
