// Admin pages and public forms: text from the public must never run as script in the admin's browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx, ORIGIN } from './helpers/env.mjs';
import { applyFaculty, facultyAdminHtml } from '../worker/faculty.js';
import { enquireTraining, departmentsAdminHtml } from '../worker/departments.js';
import FACULTY from '../worker/faculty-form.json' with { type: 'json' };
import DEPT from '../worker/department-form.json' with { type: 'json' };

const EVIL = "x');fetch('/volunteer/admin/',{method:'POST'});('\"><img src=x onerror=alert(1)>";
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return new Request(ORIGIN + '/api/x', { method: 'POST', body: f }); };
function noScriptBreakout(html) {
  assert.ok(!/confirm\('/.test(html), 'no inline confirm() with interpolated text');
  assert.ok(!html.includes('<img src=x'), 'markup is escaped');
  assert.ok(!html.includes("x');fetch"), 'single quotes are escaped');
}

test('faculty applications are validated and escaped in the admin list', async () => {
  const env = makeEnv();
  assert.equal(await applyFaculty(env, form({ first_name: 'A' }), ctx), '/faculty/join/?error=1');
  const ok = await applyFaculty(env, form({ first_name: EVIL, last_name: EVIL, email: 'a@b.co', profession: FACULTY.professions[0], experience: FACULTY.experience[0], details: 'Hello', confirm_privacy: 'on' }), ctx);
  assert.equal(ok, '/faculty/join/thanks/');
  noScriptBreakout(await facultyAdminHtml(env));
});

test('department enquiries are validated and escaped in the admin list', async () => {
  const env = makeEnv();
  assert.equal(await enquireTraining(env, form({ first_name: 'A' }), ctx), '/training/?error=1#enquire');
  const ok = await enquireTraining(env, form({ first_name: EVIL, last_name: EVIL, email: 'a@b.co', organisation: EVIL, group_size: DEPT.sizes[0], confirm_privacy: 'on' }), ctx);
  assert.equal(ok, '/training/thanks/');
  noScriptBreakout(await departmentsAdminHtml(env));
});

test('the honeypot field drops bot submissions silently', async () => {
  const env = makeEnv();
  assert.equal(await applyFaculty(env, form({ website: 'http://spam' }), ctx), '/faculty/join/thanks/');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM faculty_applications').first()).n, 0);
});
