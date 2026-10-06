// End-to-end check of logbook sign-off, verified evidence export and verification. Run against `npx wrangler dev --local`.
// Usage: node tools/e2e-evidence.mjs <outdir> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { localOnly } from './local-only.mjs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
localOnly(BASE, 'tools/e2e-evidence.mjs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const H = { Origin: BASE, 'Content-Type': 'application/json' };
const post = (p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
await page.goto(BASE + '/app/');
const email = `test${Date.now()}@example.com`;
let r = await post('/api/app/signup', { title: 'Dr', firstName: 'Sam', lastName: 'Patel', email, password: 'Long-password-1', terms: true, role: 'ST4' });
if (!r.ok) throw new Error('signup ' + JSON.stringify(r));
r = await post('/api/app/profile', { declaration: true, profile: { pathways: ['famus', 'rcem'], grade: 'ST4 emergency medicine', onboarded: true }, organisation: 'Test Hospital' });
const entries = [];
for (let i = 0; i < 14; i++) entries.push({ id: 'e' + Date.now().toString(36) + 'x' + i, type: 'lung', date: `2026-0${(i % 8) + 1}-1${i % 9}`, setting: 'Acute medical unit', supervision: i < 6 ? 'direct' : 'mentored', supervisor: 'Dr Lee', findings: { consolidation: i % 3 ? 'No' : 'Yes', effusion: i % 2 ? 'Small' : 'None', blines: 'Focal' }, reflection: 'Learnt to fan through the costophrenic angle before calling an effusion.', updatedAt: Date.now() });
r = await post('/api/app/sync', { entries });
if (!r.ok) throw new Error('sync ' + JSON.stringify(r)); console.log('sync', JSON.stringify(r).slice(0, 300));
r = await post('/api/app/signoff/request', { entryIds: entries.slice(0, 5).map((e) => e.id), supervisorName: 'Dr Lee', supervisorEmail: 'lee@example.com' });
console.log('request', JSON.stringify(r)); const link = BASE + new URL(r.link).pathname + new URL(r.link).hash;
// Supervisor signs in a separate context
const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sp = await sctx.newPage();
await sp.goto(link); await sp.waitForSelector('#sf');
await sp.fill('#ro', 'Consultant in acute medicine'); await sp.fill('#rg', '1234567'); await sp.selectOption('#ac', 'FAMUS supervisor');
await sp.locator('#sig').scrollIntoViewIfNeeded(); const box = await sp.locator('#sig').boundingBox();
await sp.mouse.move(box.x + 20, box.y + 40); await sp.mouse.down(); await sp.mouse.move(box.x + 120, box.y + 70, { steps: 8 }); await sp.mouse.move(box.x + 200, box.y + 30, { steps: 8 }); await sp.mouse.up();
await sp.check('input[name=confirm]'); await sp.click('#sf button.teal');
await sp.waitForSelector('.ok', { timeout: 8000 }).catch(async () => { console.log('SIGN ERR', await sp.textContent('#sf .err')); await sp.screenshot({ path: out + '/sign-err.png', fullPage: true }); }); const soText = await sp.textContent('.ok');
const soCode = (soText.match(/SO-[A-Z0-9]{4}-[A-Z0-9]{4}/) || [])[0];
console.log('Sign-off', soCode);
// Learner exports
await page.goto(BASE + '/app/#/log'); await page.reload(); await page.waitForTimeout(3000); await page.goto(BASE + '/app/#/export'); await page.waitForSelector('#xf', { timeout: 10000 }).catch(async () => { await page.screenshot({ path: out + '/export-err.png' }); console.log('EXPORT ERR', (await page.textContent('#app')).slice(0, 300)); throw new Error('no export view'); });
await page.screenshot({ path: `${out}/export-390.png`, fullPage: true });
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), (async () => { await page.click('#xf button.teal'); await page.waitForSelector('.sheet [download]', { timeout: 20000 }).catch(async () => { console.log('XERR', await page.textContent('#xf .err'), errors); await page.screenshot({ path: out + '/xerr.png', fullPage: true }); throw new Error('export failed'); }); await page.waitForTimeout(600); await page.screenshot({ path: `${out}/ready-390.png` }); await page.click('.sheet [download]'); })()]);
if (dl) await dl.saveAs(`${out}/export.pdf`);
const evCode = await page.textContent('.sheet .card b');
console.log('Evidence', evCode);
// Excel too
await page.click('.sheet [data-close]').catch(() => {});
// Verify pages
for (const [code, name] of [[evCode, 'verify-ev'], [soCode, 'verify-so']]) {
  for (const w of [390, 1440]) {
    const vp = await ctx.newPage(); await vp.setViewportSize({ width: w, height: 900 });
    vp.on('pageerror', (e) => errors.push(String(e)));
    await vp.goto(`${BASE}/app/verify/?code=${code}`); await vp.waitForSelector('.ok, .err');
    const ov = await vp.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (ov) errors.push(`overflow ${name} ${w}`);
    await vp.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true }); await vp.close();
  }
}
// Withdraw and re-check
await page.goto(BASE + '/app/#/evidence'); await page.waitForSelector('[data-wd]');
await page.screenshot({ path: `${out}/evidence-list-390.png`, fullPage: true });
page.once('dialog', (d) => d.accept()); await page.click('[data-wd]'); await page.waitForTimeout(800);
const wd = await page.evaluate((c) => fetch('/api/app/verify?code=' + c).then((r) => r.json()), evCode);
console.log('After withdraw:', wd.error);
// Landing page
for (const w of [390, 1440]) { const lp = await ctx.newPage(); await lp.setViewportSize({ width: w, height: 900 }); await lp.goto(BASE + '/app/get/'); await lp.waitForTimeout(1500); await lp.evaluate(() => document.querySelectorAll('.reveal,.rise').forEach((e) => e.classList.add('in', 'visible', 'is-in'))); const ov = await lp.evaluate(() => document.documentElement.scrollWidth > innerWidth); if (ov) errors.push('overflow landing ' + w); await lp.screenshot({ path: `${out}/landing-${w}.png`, fullPage: true }); await lp.close(); }
console.log('Errors:', errors.length ? errors : 'none');
await browser.close();
