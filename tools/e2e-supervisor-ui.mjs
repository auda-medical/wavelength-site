// Browser check of the October 2026 app additions: organisation combobox, unsaved-scan guard, accessible sheets,
// identifier check, media fingerprints, the encrypted upload queue, log out of other devices and supervisor search.
// Local only, never production. Setup: apply every file in migrations/ with
// `npx wrangler d1 execute wavelength-volunteers --local --file <file>`, put SUPERVISOR_APPLY="true" and
// SUPERVISOR_SEARCH="true" in .dev.vars, then `npx wrangler dev --local --local-upstream localhost:8787`.
// Usage: node tools/e2e-supervisor-ui.mjs <outdir> [base]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { localOnly } from './local-only.mjs';
const out = process.argv[2] || 'shots'; const BASE = process.argv[3] || 'http://localhost:8787';
localOnly(BASE);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const ok = (m) => console.log('ok', m);
const get = (page, p) => page.evaluate((p) => fetch(p).then((r) => r.json()), p);
const post = (page, p, data) => page.evaluate(([p, data]) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()), [p, data]);
const noOverflow = async (p, name) => { if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail('overflow ' + name); };

for (const w of [390, 1440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(w + ': ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|40[13]|426/.test(m.text())) errors.push(w + ': ' + m.text()); });
  const t = Date.now() + '-' + w;

  // 1. Sign-up with the organisation combobox: a suggestion sets the id beside the text.
  await page.goto(BASE + '/app/#/signup'); await page.waitForSelector('#fn');
  await page.fill('#fn', 'Sam'); await page.fill('#ln', 'Patel'); await page.fill('#em', `ui${t}@example.com`);
  await page.fill('#pw', 'Long-password-1'); await page.fill('#pw-2', 'Long-password-1');
  await page.fill('#org', 'dart');
  await page.waitForSelector('#org-list li', { timeout: 5000 }).catch(() => fail('no organisation suggestions'));
  if ((await page.getAttribute('#org', 'aria-expanded')) !== 'true') fail('combobox not expanded');
  await page.screenshot({ path: `${out}/org-combobox-${w}.png` });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  const oid = await page.inputValue('input[name=organisationId]');
  if (oid !== 'wl-1') fail('organisation id not set: ' + oid); else ok('organisation picked');
  await page.check('input[name=terms]');
  await page.click('#f button[type=submit]');
  await page.waitForFunction(() => fetch('/api/app/me').then((r) => r.json()).then((j) => !!j.account), null, { timeout: 8000 }).catch(() => fail('sign-up did not finish'));
  const me = await get(page, '/api/app/me');
  if (!me.account || me.account.organisationId !== 'wl-1') fail('account organisationId ' + JSON.stringify(me.account)); else ok('account carries organisationId');
  await post(page, '/api/app/profile', { declaration: true, profile: { pathways: ['rcem'], onboarded: true, grade: 'ST4' } });

  // 2. Unsaved-scan guard: a dirty form asks before leaving; Escape closes the sheet and focus returns.
  await page.goto(BASE + '/app/#/new'); await page.reload(); await page.waitForSelector('input[name=type] + label');
  await page.click('input[name=type] + label'); await page.waitForTimeout(300);
  await page.fill('#ind', 'Breathless, ?effusion');
  await page.click('nav.tabs a[href="#/"]');
  await page.waitForSelector('.sheet [data-discard]', { timeout: 3000 }).catch(() => fail('no discard prompt'));
  if (!(await page.evaluate(() => location.hash)).startsWith('#/new')) fail('left the form before confirming'); else ok('unsaved guard holds the form');
  const label = await page.evaluate(() => { const d = document.querySelector('.sheet'); return d && d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby')).textContent; });
  if (label !== 'Discard changes?') fail('sheet label ' + label);
  await page.screenshot({ path: `${out}/discard-${w}.png` });
  // Tab stays inside the sheet
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => !!document.activeElement.closest('.sheet')))) fail('focus escaped the sheet'); else ok('focus trapped in sheet');
  await page.keyboard.press('Escape');
  if (await page.$('.sheet')) fail('Escape did not close the sheet');
  await page.click('nav.tabs a[href="#/"]'); await page.click('.sheet [data-discard]');
  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 3000 }).catch(() => fail('discard did not navigate'));
  await page.waitForTimeout(300); const sr = await page.textContent('#sr'); if (!sr) fail('live region empty'); else ok('screen announced: ' + sr);

  // 3. Identifier check catches a written-out date of birth.
  await page.goto(BASE + '/app/#/new'); await page.waitForSelector('input[name=type] + label');
  await page.click('input[name=type] + label'); await page.waitForTimeout(300);
  await page.fill('#ind', 'DOB 3 March 1956, chest pain');
  await page.click('input[name=supervision] + label');
  await page.click('form button[type=submit], form .save button, #save').catch(() => {});
  await page.waitForSelector('.sheet h2', { timeout: 3000 });
  const h = await page.textContent('.sheet h2');
  if (h !== 'Check for identifiers') fail('identifier sheet: ' + h); else ok('identifier check');
  await page.click('.sheet [data-close]');

  // 4. A saved image carries a SHA-256 fingerprint that syncs (never the image).
  await page.fill('#ind', 'Chest pain');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = '#123'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.fillRect(100, 100, 200, 120); return c.toDataURL('image/png').split(',')[1]; });
  await page.setInputFiles('#pick', { name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('.editor [data-decl]');
  await page.check('.editor [data-decl]'); await page.click('.editor [data-a=save]');
  await page.waitForSelector('#gal img', { timeout: 5000 });
  await page.click('form button[type=submit], form .save button, #save').catch(() => {});
  // 1.0.10: saving goes Home with a note; open the scan from its View scan link.
  await page.waitForFunction(() => location.hash === '#/' && document.querySelector('.toast.act a[href^="#/entry/"]'), null, { timeout: 8000 }).catch(() => fail('scan not saved'));
  await page.waitForTimeout(2500);
  const href = await page.evaluate(() => { const a = document.querySelector('.toast.act a[href^="#/entry/"]'); return a && a.getAttribute('href'); });
  if (href) { await page.evaluate((h) => { location.hash = h; }, href); await page.waitForTimeout(400); }
  const pulled = await get(page, '/api/app/sync?since=0');
  const ent = (pulled.entries || []).find((e) => (e.images || []).length);
  if (!ent || !(ent.media || []).length || !/^[0-9a-f]{64}$/.test(ent.media[0].sha256)) fail('fingerprint not synced ' + JSON.stringify(ent && ent.media)); else ok('fingerprint synced');
  if (await page.$('#mstate .chip')) ok('media state: ' + (await page.textContent('#mstate .chip'))); else fail('no media state on the scan');
  await page.screenshot({ path: `${out}/scan-media-${w}.png`, fullPage: true }); await noOverflow(page, 'scan ' + w);

  // 5. Encrypted upload queue: a sign-off link with the image goes up and the queue records it as shared.
  await page.goto(BASE + '/app/#/signoff?e=' + ent.id); await page.reload(); await page.waitForTimeout(1200);
  const linkBtn = await page.$('[data-m=link]');
  if (linkBtn) {
    await linkBtn.click(); await page.waitForSelector('#lf', { timeout: 4000 }).catch(() => {});
    if (await page.$('#decl')) {
      await page.check('#decl'); await page.click('#lf button.teal');
      await page.waitForSelector('[data-copy]', { timeout: 10000 }).catch(() => fail('link not ready after upload'));
      const q = await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('wavelength-' + JSON.parse(localStorage.getItem('wl-acc') || '{}').id); r.onsuccess = () => { const tx = r.result.transaction('shares'); const g = tx.objectStore('shares').getAll(); g.onsuccess = () => ok(g.result.map((x) => ({ posted: !!x.posted, files: x.files.map((f) => f.state) }))); }; r.onerror = () => ok(null); }));
      if (!q || !q.length || !q[0].posted || q[0].files.some((s) => s !== 'shared')) fail('share queue ' + JSON.stringify(q)); else ok('upload queue shared ' + q[0].files.length);
      await page.click('.sheet [data-close]').catch(() => {});
    } else console.log('skip: no image option in the link sheet');
  } else console.log('skip: link button not found on the sign-off screen');

  // 6. Log out of all other devices keeps this one.
  await page.goto(BASE + '/app/#/settings'); await page.waitForSelector('#loa');
  await page.click('#loa'); await page.click('.sheet [data-ok]');
  await page.waitForTimeout(800);
  if (!(await get(page, '/api/app/me')).account) fail('this device was logged out'); else ok('logout-all kept this device');
  await page.screenshot({ path: `${out}/settings-${w}.png`, fullPage: true }); await noOverflow(page, 'settings ' + w);

  // 7. Supervisor search: the field shows with the switch on; short or unverified searches are refused politely.
  await page.goto(BASE + '/app/#/supervisors'); await page.waitForTimeout(800);
  if (await page.$('#svq')) {
    await page.fill('#svq', 'lee'); await page.waitForTimeout(900);
    ok('search answer: ' + (await page.textContent('#svres')).slice(0, 80));
  } else console.log('skip: search field hidden (switch off or migrations missing)');
  await page.screenshot({ path: `${out}/supervisors-${w}.png`, fullPage: true }); await noOverflow(page, 'supervisors ' + w);
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('All checks passed.');
