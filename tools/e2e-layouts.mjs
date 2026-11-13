// End-to-end check of the logbook layouts (src/app/formats.js): sign up on a local Worker, log FUSIC scans, export the
// FUSIC logbook layout and read the Excel file back. Local only.
// Usage: node --import ./test/helpers/register.mjs tools/dev-worker.mjs 8861 --site   then
//        node tools/e2e-layouts.mjs <outdir> http://localhost:8861
import { chromium } from 'playwright';
import fs from 'node:fs';
import { localOnly } from './local-only.mjs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
localOnly(BASE, 'tools/e2e-layouts.mjs');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const post = (p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
await page.goto(BASE + '/app/');
let r = await post('/api/app/signup', { title: 'Dr', firstName: 'Layout', lastName: 'Tester', email: `layout${Date.now()}@example.com`, password: 'Long-password-1', terms: true, role: 'ST4' });
if (!r.ok) throw new Error('signup ' + JSON.stringify(r));
r = await post('/api/app/profile', { declaration: true, profile: { pathways: ['fusic'], grade: 'ICM trainee', onboarded: true }, organisation: 'Test Hospital' });
const entries = [];
for (let i = 0; i < 6; i++) entries.push({ id: 'h' + Date.now().toString(36) + i, type: 'cardiac', date: `2026-10-1${i}`, setting: i === 5 ? 'Healthy volunteer' : 'Intensive care', supervision: i < 3 ? 'direct' : 'mentored', supervisor: 'Dr Mentor', indication: 'Shock, LV function?', findings: { views: ['PLAX', 'PSAX', 'A4C'], lv: 'Normal' }, reflection: 'Subcostal view needed more depth.', updatedAt: Date.now() });
for (let i = 0; i < 3; i++) entries.push({ id: 'l' + Date.now().toString(36) + i, type: 'lung', date: `2026-10-2${i}`, setting: 'Intensive care', supervision: i ? 'mentored' : 'independent', supervisor: 'Dr Mentor', findings: { sliding: 'Present' }, updatedAt: Date.now() });
r = await post('/api/app/sync', { entries }); if (!r.ok) throw new Error('sync ' + JSON.stringify(r));
await page.reload(); await page.waitForTimeout(2500);
await page.goto(BASE + '/app/#/export?to=fusic'); await page.waitForSelector('#xf', { timeout: 10000 });
const visible = async (dest) => { await page.selectOption('#ds', dest); return page.evaluate(() => !document.querySelector('label[for="' + document.querySelector('input[name=fmt][value=layout]').id + '"]').hidden); };
const offered = { fusic: await visible('fusic'), other: await visible('other'), famus: await visible('famus') };
await page.selectOption('#ds', 'fusic');
await page.click('label[for="' + "fmt3" + '"]');
await page.uncheck('input[name=verified]');
const hint = await page.textContent('#layhint');
await page.screenshot({ path: `${out}/export-layout-390.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (async () => { await page.click('#xf button.teal'); await page.waitForSelector('.sheet [download]', { timeout: 20000 }); await page.screenshot({ path: `${out}/ready-390.png` }); await page.click('.sheet [download]'); })()]);
const file = `${out}/${dl.suggestedFilename()}`; await dl.saveAs(file);
// Read the workbook back with the app's own unzip.
const parts = await page.evaluate(async (b64) => { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const files = await WLZip.unzip(bytes.buffer); const dec = new TextDecoder(); const o = {}; for (const [k, v] of Object.entries(files)) if (/workbook\.xml$|sheet\d+\.xml$|sharedStrings/.test(k)) o[k] = dec.decode(v).slice(0, 4000); return o; }, fs.readFileSync(file).toString('base64')).catch((e) => ({ error: String(e) }));
console.log(JSON.stringify({ offered, hint, overflow, file: dl.suggestedFilename(), size: fs.statSync(file).size, sheets: (Object.entries(parts).find(([k]) => /workbook\.xml$/.test(k)) || [, ''])[1].match(/name="[^"]+"/g) }, null, 1));
fs.writeFileSync(`${out}/parts.json`, JSON.stringify(parts, null, 1));
console.log('Errors:', errors.length ? errors : 'none');
await browser.close();
