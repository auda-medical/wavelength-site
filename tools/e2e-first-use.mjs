// End-to-end check of the first-use quick wins (road to #1, 13 Nov 2026) on a local Worker. Local only.
// Usage: node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8871 --site   then
//        node tools/e2e-first-use.mjs <outdir> http://localhost:8871
import { chromium } from 'playwright';
import fs from 'node:fs';
import { localOnly } from './local-only.mjs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
localOnly(BASE, 'tools/e2e-first-use.mjs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [], results = {};
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const post = (p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
await page.goto(BASE + '/app/#/signup'); await page.waitForSelector('#f');
results.signupHeading = await page.evaluate(() => document.body.innerText.includes('Free. Your ultrasound logbook, signed off and portfolio-ready.'));
let r = await post('/api/app/signup', { firstName: 'Amira', lastName: 'Khan', email: `fu${Date.now()}@example.com`, password: 'Long-password-1', terms: true, role: 'ST4 emergency medicine' });
if (!r.ok) throw new Error('signup ' + JSON.stringify(r));
await page.goto(BASE + '/app/'); await page.reload(); await page.waitForTimeout(2500);
results.onboard = await page.evaluate(() => ({ rcem: !!document.querySelector('input[name=p][value=rcem]:checked'), famus: !!document.querySelector('input[name=p][value=famus]:checked'), abroadFolded: !!document.querySelector('details.paths-abroad:not([open])'), hint: document.body.innerText.includes('Not sure? Choose General logbook') }));
await page.screenshot({ path: `${out}/onboard-390.png`, fullPage: true });
r = await post('/api/app/profile', { declaration: true, profile: { pathways: ['rcem'], grade: 'ST4', onboarded: true } });
await page.reload(); await page.waitForTimeout(2000);
// Invite: the sheet never says whether an account exists.
await page.goto(BASE + '/app/#/supervisors'); await page.waitForSelector('#se2', { timeout: 10000 });
results.inviteHint = await page.textContent('#se2-h');
await page.fill('#se2', 'consultant.lee@example.com'); await page.click('#addf button.teal');
await page.waitForSelector('.sheet', { timeout: 10000 });
const sheetText = await page.textContent('.sheet');
results.inviteSheetNeutral = !/No Wavelength account uses this address/.test(sheetText) && /It reaches only that exact address/.test(sheetText);
await page.screenshot({ path: `${out}/invite-sheet-390.png`, fullPage: true });
await page.click('.sheet [data-close]').catch(() => {});
// Scans, then the export count and the Logbook layout.
const entries = [0, 1, 2].map((i) => ({ id: 'q' + Date.now().toString(36) + i, type: i < 2 ? 'aaa' : 'msk', date: `2026-11-0${i + 1}`, setting: 'Emergency department', supervision: 'direct', supervisor: 'Dr Ben Lee', findings: {}, updatedAt: Date.now() }));
r = await post('/api/app/sync', { entries }); if (!r.ok) throw new Error('sync');
await page.reload(); await page.waitForTimeout(2500);
await page.goto(BASE + '/app/#/export'); await page.waitForSelector('#xf');
results.exportCount = await page.textContent('#xcount');
results.layoutOffered = await page.evaluate(() => !document.querySelector('label[for="' + document.querySelector('input[name=fmt][value=layout]').id + '"]').hidden);
await page.screenshot({ path: `${out}/export-390.png`, fullPage: true });
// Me: recommend.
await page.goto(BASE + '/app/#/me'); await page.waitForSelector('#merec', { timeout: 10000 });
results.recommend = await page.textContent('#merec');
results.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
await page.screenshot({ path: `${out}/me-390.png`, fullPage: true });
// Supervisor link page: optional fields marked; offers before the newsletter.
console.log(JSON.stringify(results, null, 1));
console.log('Errors:', errors.length ? errors : 'none');
await browser.close();
