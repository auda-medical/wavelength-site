// Department licence pilot (/departments/, road to #1 plan, 13 Nov 2026): enquiries land in department_enquiries
// beside tailored training, marked "Department licence pilot", with their own email subject and thanks page. The page
// promises no endorsement, keeps the logbook free for trainees, and is never linked from the store app (Apple 3.1.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeEnv, ctx, ORIGIN } from './helpers/env.mjs';
import { withMailbox } from './helpers/verify.mjs';
import worker from '../worker/index.js';
import { isPilot, PILOT } from '../worker/departments.js';
import FORM from '../worker/department-form.json' with { type: 'json' };

const send = (env, o, headers = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return worker.fetch(new Request(`${ORIGIN}/api/departments/pilot`, { method: 'POST', headers: { Origin: ORIGIN, ...headers }, body: f }), env, ctx); };
const base = { first_name: 'Sam', last_name: 'Patel', email: 'Sam.Patel@nhs.example', organisation: 'Emergency Department, Example General', country: 'United Kingdom', group_size: '26 to 50', confirm_privacy: 'yes' };

test('a pilot enquiry is stored as a department enquiry, emailed with its own subject, and thanks the sender', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  await withMailbox(async (box) => {
    const r = await send(env, { ...base, role: 'Clinical lead or consultant', setting: 'Emergency department', interests: ['A dashboard for training leads', 'Governance and audit reports', 'Made up'], timing: 'February rotation', heard: 'LinkedIn', details: 'We use paper now.' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('Location'), '/departments/thanks/');
    await box.settle();
    const row = await env.DB.prepare('SELECT * FROM department_enquiries').first();
    assert.equal(row.training, `${PILOT}; A dashboard for training leads; Governance and audit reports`, 'unknown interests dropped');
    assert.deepEqual([row.email, row.enquiry_type, row.enquiry_class, row.region, row.group_size, row.role, row.stage], ['sam.patel@nhs.example', 'A clinical team or department', 'organisation', 'uk', '26 to 50', 'Clinical lead or consultant', 'new']);
    assert.ok(isPilot(row));
    assert.ok(row.emailed_at && !row.email_error);
    const mail = box.sent.find((m) => /Department pilot enquiry/.test(m.subject));
    assert.ok(mail, 'pilot subject');
    assert.match(mail.subject, /Emergency Department, Example General \(United Kingdom, 26 to 50 clinicians who scan\)/);
    assert.equal(mail.reply_to[0].address, 'sam.patel@nhs.example');
    assert.match(mail.htmlbody, /department licence pilot enquiry/);
  });
});

test('pilot enquiries need an organisation, a size, privacy consent and a sensible phone; other origins are refused', async () => {
  const env = makeEnv();
  assert.equal((await send(env, { ...base, organisation: '' })).headers.get('Location'), '/departments/?error=1#pilot');
  assert.equal((await send(env, { ...base, group_size: '2 to 5' })).headers.get('Location'), '/departments/?error=1#pilot', 'sizes come from the pilot list');
  assert.equal((await send(env, { ...base, confirm_privacy: '' })).headers.get('Location'), '/departments/?error=1#pilot');
  assert.equal((await send(env, { ...base, phone: 'call me' })).headers.get('Location'), '/departments/?error=phone#pilot');
  assert.equal((await send(env, base, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(env, { ...base, wl_trap: 'bot' })).headers.get('Location'), '/departments/thanks/');
  const g = await worker.fetch(new Request(`${ORIGIN}/api/departments/pilot`), env, ctx);
  assert.equal(g.headers.get('Location'), '/departments/');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM department_enquiries').first()).n, 0);
});

test('tailored training enquiries keep their own wording', async () => {
  const env = makeEnv({ ZEPTOMAIL_TOKEN: 'test' });
  await withMailbox(async (box) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ first_name: 'Maya', last_name: 'Okafor', email: 'maya@example.com', enquiry_type: 'Myself, as an individual', country: 'United Kingdom', group_size: '1', confirm_privacy: 'yes' })) f.append(k, v);
    const r = await worker.fetch(new Request(`${ORIGIN}/api/training/enquire`, { method: 'POST', headers: { Origin: ORIGIN }, body: f }), env, ctx);
    assert.equal(r.headers.get('Location'), '/training/thanks/');
    await box.settle();
    assert.ok(box.sent.some((m) => /^Tailored training enquiry/.test(m.subject)));
    assert.ok(!box.sent.some((m) => /pilot/i.test(m.subject + m.htmlbody)));
  });
});

test('the pilot option lists are consistent with the stored roles', () => {
  for (const r of FORM.pilotRoles) assert.ok(FORM.roles.includes(r), r);
  for (const k of ['pilotSettings', 'pilotInterests', 'pilotSizes']) assert.ok(Array.isArray(FORM[k]) && FORM[k].length >= 4, k);
});

test('the page keeps the logbook free, claims no endorsement, and the store app never links to it', () => {
  const build = fs.readFileSync(new URL('../build.js', import.meta.url), 'utf8');
  const start = build.indexOf("pages['/departments/'] = layout(");
  const page = build.slice(start, build.indexOf("pages['/departments/thanks/']"));
  assert.ok(start > 0);
  assert.match(page, /free for every trainee, and stays free/);
  assert.match(page, /not run or endorsed by the NHS, the Royal College of Emergency Medicine, the Society for Acute Medicine, the Intensive Care Society or Regional Anaesthesia UK/);
  assert.match(page, /action="\/api\/departments\/pilot"/);
  assert.doesNotMatch(page, /endorsed by (RCEM|the Royal College)|recognised by (RCEM|the Royal College)|accredited by/i);
  assert.doesNotMatch(page, /—/, 'no em dashes');
  for (const f of fs.readdirSync(new URL('../src/app/', import.meta.url)).filter((x) => /\.(js|html)$/.test(x))) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8'), /\/departments\/|department licen[cs]e/i, `src/app/${f}`);
  }
});
