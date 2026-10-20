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
  // 1.0.24 (owner, 20 Oct): two separate questions; a chosen supervisor can be cleared; independent goes in one step.
  const secs = await page.evaluate(() => ({ lvl: (document.querySelector('#fsh-supervision') || {}).textContent, sup: (document.querySelector('#fsh-supmentor') || {}).textContent, apart: !!document.querySelector('#fs-supervision') && !!document.querySelector('#fs-supmentor') && document.querySelector('#fs-supervision') !== document.querySelector('#fs-supmentor') }));
  record('F1', 'Level of supervision and Supervisor or mentor are two separate numbered questions', secs.lvl === 'Level of supervision' && secs.sup === 'Supervisor or mentor' && secs.apart, secs);
  await page.click('label[for=sp0]'); await sleep(300);
  const cleared = await page.evaluate(() => ({ any: !!document.querySelector('input[name=suppick]:checked'), name: document.querySelector('#supv').value }));
  record('F2', 'Tapping the chosen supervisor again clears it (the choice is optional)', !cleared.any && cleared.name === '', cleared);
  await page.click('label[for=supervision2]'); await sleep(200); // Independent
  await page.click('label[for=sp0]'); await sleep(300);
  const indep = await page.evaluate(() => ({ b1: document.querySelector('#sv1').textContent, b2: document.querySelector('#sv2').hidden ? null : document.querySelector('#sv2').textContent, decl: !document.querySelector('#senddeclf').hidden }));
  record('F3', 'Independent + Sam: "Save and send to Sam Supervisor" with the image declaration ready at the bottom', indep.b1 === 'Save and send to Sam Supervisor' && indep.b2 === 'Save as draft' && indep.decl, indep);
  await shot(page, 'L-form-supervision');
  // The photo.
  await page.setInputFiles('#pick', img); await page.waitForSelector('.editor canvas', { timeout: 15000 }); await sleep(600);
  await page.check('.editor [data-decl]', { force: true }); await page.click('.editor [data-a=save]');
  await page.waitForSelector('.editor', { state: 'detached', timeout: 15000 }); await sleep(600);
  // 1.0.21 (owner, 20 Oct): one step. The image declaration is on the form; without it, Save and send stops and says so.
  const decl = await page.evaluate(() => { const b = document.querySelector('#senddeclf'); return { shown: b && !b.hidden, text: b ? b.textContent : '' }; });
  await page.click('#sv1'); await sleep(600);
  const blocked = await page.evaluate(() => { const r = document.querySelector('#senddecl').getBoundingClientRect(); return { hash: location.hash, invalid: !!document.querySelector('#senddeclf.invalid'), sheet: !!document.querySelector('.sheet'), inView: r.top > 0 && r.bottom < innerHeight }; });
  record('L4', 'With a photo, the declaration is on the form; Save and send without the tick stays on the form and says why', decl.shown && /sharing them with Sam Supervisor/.test(decl.text) && blocked.invalid && blocked.inView && !blocked.sheet && blocked.hash.indexOf('#/new') === 0, { decl: decl.shown, blocked });
  await shot(page, 'L-form-declaration');
  await page.evaluate(() => { const d = document.querySelector('#senddecl'); d.checked = true; d.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#sv1');
  const noSheet = await page.waitForSelector('#lf', { timeout: 8000 }).then(() => false, () => true);
  record('L4b', 'Ticked: Save and send goes straight to Sam, with no second page to choose scans or tick again', noSheet, noSheet ? 'no request sheet' : 'request sheet opened');
  await page.waitForFunction(() => /Request sent/.test((document.querySelector('.sheet h2') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const done = await sheetText(page);
  record('L5', 'Sent: "Request sent", your supervisor sees it in their app now with 1 image; no link to send', /Request sent/.test(done) && /with 1 image/.test(done), done.slice(0, 200));
  await shot(page, 'L-request-sent');
  const list = await call(learner, 'signoffs');
  const so = list.signoffs.find((x) => x.status === 'pending');
  code = so && so.id;
  record('L6', 'The request waits in Sam\'s dashboard', so && so.supervisor_id === sup.id, so ? [so.id, so.supervisor_id === sup.id] : 'none');
  // 1.0.25 (owner, 20 Oct): export with no images, all images or chosen scans; images need the declaration first.
  await page.evaluate(() => { const c = document.querySelector('.sheet [data-close]'); if (c) c.click(); }); await sleep(600);
  await go(page, '#/export'); await page.waitForSelector('#xf'); await sleep(400);
  const modes = await page.evaluate(() => [...document.querySelectorAll('input[name=imgmode] + label')].map((x) => x.textContent));
  await page.click('input[name=imgmode][value=pick] + label'); await sleep(300);
  const pick = await page.evaluate(() => ({ list: [...document.querySelectorAll('input[name=imgpick]')].length, decl: !document.querySelector('#imgdeclf').hidden }));
  await page.click('#xf button.teal'); await sleep(400);
  const noTick = await page.evaluate(() => !!document.querySelector('#imgopt.invalid'));
  await page.evaluate(() => { const i = document.querySelector('input[name=imgpick]'); i.checked = true; });
  await page.click('#xf button.teal'); await sleep(400);
  const noDecl = await page.evaluate(() => { const r = document.querySelector('#imgdecl').getBoundingClientRect(); return !!document.querySelector('#imgdeclf.invalid') && r.top > 0 && r.bottom < innerHeight; });
  record('X1', 'Export offers No images / All images / Choose scans; choosing needs a ticked scan and the declaration, and stops at the declaration', modes.join('|') === 'No images|All images|Choose scans' && pick.list >= 1 && pick.decl && noTick && noDecl, { modes, pick, noTick, noDecl });
  await shot(page, 'X-export-images');
  // Log out on Me.
  await go(page, '#/me'); await page.waitForSelector('#melo', { timeout: 10000 }).catch(() => {});
  record('L7', 'Log out is on Me (as well as Settings), as a solid dark button', !!(await page.$('#melo')) && (await page.$eval('#melo', (b) => b.textContent + '|' + b.className)) === 'Log out|btn block', 'button ' + !!(await page.$('#melo')));
  await ctx.close();
}

// S: the supervisor opens the request in the app and sees the photo.
{
  const { ctx, page } = await phone(sup);
  // 1.0.26 (owner, 20 Oct): the learner's scans show which one waits for this supervisor, with Review and sign.
  await go(page, '#/supervise/' + learner.id + '/scans?f=waiting');
  await page.waitForSelector('.chip.amber', { timeout: 15000 }).catch(() => {});
  const wt = await page.evaluate(() => ({ chip: (document.querySelector('.chip.amber') || {}).textContent, btn: !!document.querySelector('[data-sv-so]'), tab: (document.querySelector('input[name=svf]:checked + label') || {}).textContent, hash: location.hash, text: document.querySelector('main, #app, body').innerText.slice(0, 300) }));
  record('W1', 'Waiting for you lists the scan, marked Waiting for your sign-off, with Review and sign', wt.chip === 'Waiting for your sign-off' && wt.btn && wt.tab === 'Waiting for you', wt);
  await go(page, '#/supervise/' + learner.id + '/requests');
  await page.waitForSelector('[data-sv-so]', { timeout: 15000 });
  await page.click('[data-sv-so]');
  await page.waitForSelector('.sheet [data-more]');
  await page.waitForSelector('.sheet canvas.review-img', { timeout: 30000 }).catch(() => {});
  const seen = await page.evaluate(() => { const c = document.querySelector('.sheet canvas.review-img'); return c ? { w: c.width, h: c.height } : null; });
  record('S1', 'The supervisor sees the photo in the app, marked as a review copy', !!seen && seen.w > 100 && seen.h > 100, seen || (await sheetText(page)).slice(0, 300));
  const noWarn = await page.evaluate(() => !/link only|No images were attached/.test(document.querySelector('.sheet').textContent));
  record('S2', 'No "link only" or "no images" warning when the photo is there', noWarn, '');
  const order = await page.evaluate(() => { const sh = document.querySelector('.sheet'), all = [...sh.querySelectorAll('.card, canvas.review-img, [data-more], #pf')]; const i = (sel) => all.findIndex((x) => x.matches(sel)); return { card: i('.card'), img: i('canvas.review-img'), more: i('[data-more]'), form: i('#pf'), moreGhost: sh.querySelector('[data-more]').classList.contains('ghost') }; });
  record('S2b', 'Ask for more information and Decline come after the scan and its photo, as plain outline buttons', order.card >= 0 && order.card < order.more && order.img < order.more && order.more < order.form && order.moreGhost, order);
  const photoFirst = await page.evaluate(() => { const c = document.querySelector('.sheet .card'), img = c && c.querySelector('canvas.review-img'), rate = c && c.querySelector('.rate, [data-rate], fieldset, .seg'); return { inCard: !!img, before: !!(img && rate && (img.compareDocumentPosition(rate) & Node.DOCUMENT_POSITION_FOLLOWING)) }; });
  record('S2c', 'The photo is inside the scan card, under its title and before Image quality', photoFirst.inCard && photoFirst.before, photoFirst);
  // 1.0.24 (owner): zoom in place. Computer: scroll over the photo to zoom, drag with the hand to move.
  const hintTx = await page.evaluate(() => { const box = document.querySelector('.sheet .zoombox'); const p = box && box.closest('.card').querySelector('.review-imgs').previousElementSibling; return p ? p.textContent : ''; });
  const zb = await page.$eval('.sheet .zoombox', (el) => { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await sleep(300);
  const zb2 = await page.$eval('.sheet .zoombox', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(zb2.x, zb2.y); await page.mouse.wheel(0, -400); await sleep(250);
  const z1 = await page.$eval('.sheet .zoombox', (el) => ({ zoom: Number(el.dataset.zoom), t: el.firstChild.style.transform, cls: el.className }));
  await page.mouse.down(); await page.mouse.move(zb2.x - 60, zb2.y - 40, { steps: 5 }); await page.mouse.up(); await sleep(150);
  const z2 = await page.$eval('.sheet .zoombox', (el) => el.firstChild.style.transform);
  const noScreen = await page.evaluate(() => !document.querySelector('.wlz') && !document.querySelector('.sheet [data-z]'));
  await shot(page, 'S-zoomed');
  record('Z1', 'Note above the photo; scrolling over it zooms in place, dragging moves it; no extra screen or buttons', /^(Scroll over a photo to zoom in, then drag with the hand to move around|Pinch with two fingers to zoom in, then drag to move).$/.test(hintTx) && z1.zoom > 1.5 && /scale/.test(z1.t) && /zoomed/.test(z1.cls) && z2 !== z1.t && noScreen, { hint: hintTx.slice(0, 60), zoom: z1.zoom, moved: z2 !== z1.t, noScreen });
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
