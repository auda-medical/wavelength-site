// First-use quick wins (road to #1, 13 Nov 2026; road-to-number-one report 03, "Quick wins" Q1 to Q16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv } from './helpers/env.mjs';
import { withMailbox, signup } from './helpers/verify.mjs';

const MAIL = { ZEPTOMAIL_TOKEN: 'test', ZEPTOMAIL_API: 'https://mail.test/' };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const APP = read('src/app/app.js');

test('Q15: inviting a supervisor never reveals whether an account uses the address', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const learner = await signup(env, 'trainee@x.co');
    await signup(env, 'has-account@x.co');
    const a = await learner.call('/api/app/supervisors/add', { email: 'has-account@x.co' });
    const b = await learner.call('/api/app/supervisors/add', { email: 'no-account@x.co' });
    await box.settle();
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.deepEqual(Object.keys(a.body).sort(), Object.keys(b.body).sort());
    assert.equal(a.body.hasAccount, true); assert.equal(b.body.hasAccount, true, 'kept, always true, for app versions up to 1.0.27');
    const again = await learner.call('/api/app/supervisors/add', { email: 'no-account@x.co' });
    assert.equal(again.body.hasAccount, true, 'a quick resend says the same');
  });
  assert.doesNotMatch(APP, /No Wavelength account uses this address/);
  assert.doesNotMatch(APP, /res\.hasAccount/);
});

test('Q12: a supervisor signing up from an invitation gets no separate "Confirm your email" message', async () => {
  const env = makeEnv(MAIL);
  await withMailbox(async (box) => {
    const learner = await signup(env, 'trainee@x.co');
    await learner.call('/api/app/supervisors/add', { email: 'boss@x.co' });
    await box.settle();
    const t = box.invites().pop();
    assert.ok(t);
    const before = box.sent.length;
    const sup = await signup(env, 'boss@x.co', { invite: t });
    await box.settle();
    assert.equal(box.sent.length, before, 'no confirmation email');
    const ok = await sup.call('/api/app/supervisors/accept-invite', { token: t });
    assert.equal(ok.status, 200);
    assert.equal((await sup.call('/api/app/me')).body.account.emailStatus, 'verified', 'accepting the invitation confirms the address');
    // A token for someone else's address, or none, changes nothing: the usual confirmation goes.
    const n = box.sent.length;
    await signup(env, 'other@x.co', { invite: t });
    await signup(env, 'plain@x.co');
    await box.settle();
    assert.equal(box.sent.length, n + 2);
  });
  assert.match(APP, /sessionStorage\.getItem\('wl-invite'\); if \(inv\) d\.invite = inv;/);
});

test('Q2: supervisors are told they can sign today when approval is optional; the honest label stays', () => {
  assert.match(APP, /function svRequired\(\)/);
  assert.match(APP, /T\('You can review and sign straight away\.'\)/);
  assert.match(APP, /svRequired\(\) \? T\('They may need checks and Wavelength approval/);
  assert.match(APP, /learners see you labelled "Not yet verified by Wavelength"/);
});

test('Q4: no "draft" for a finished scan, and no "Scans" tab named', () => {
  assert.doesNotMatch(APP, /Save as draft|from Scans/);
  assert.match(APP, /T\('Save, sign later'\)/);
});

test('Q6 and Q7: the request sheet starts with the scan\'s supervisor; the saved note gives way to the sheet', () => {
  assert.match(APP, /signByLink\(\[id\], \{ sup: null, prefillName: en\.supervisor \|\| '' \}\)/);
  assert.match(APP, /id="ln2" name="supervisorName" type="text" value="' \+ esc\(opts\.prefillName \|\| ''\) \+ '">/);
  const runAfter = APP.slice(APP.indexOf('var runAfter = function'), APP.indexOf('var drawFindings'));
  assert.match(runAfter, /\$\$\('\.toast\.act'\)\.forEach\(function \(x\) \{ x\.remove\(\); \}\);\n      if \(act === 'person'\)/);
});

test('Q8: one statement about images and supervisors everywhere', () => {
  for (const f of ['src/app/app.js', 'worker/supervise.js', 'build.js']) assert.doesNotMatch(read(f), /never (your|their) images|You see written records only/, f);
  assert.match(APP, /Images go only with a sign-off request you choose to send, encrypted, and are deleted when the request is closed, or after 14 days at most\./);
  assert.match(read('worker/supervise.js'), /Images reach you only with a sign-off request they choose to send, encrypted/);
});

test('Q5 and Q11: optional fields say so; after signing, the supervisor offers come before the newsletter', () => {
  const forms = read('src/app/forms.js');
  assert.match(forms, /T\('Registration number \(optional\)'\)/);
  assert.match(forms, /T\('Accreditation \(optional\)'\)/);
  const sign = read('src/app/sign.js');
  const cta = sign.slice(sign.indexOf('function pearlCta'), sign.indexOf('function evidenceHtml'));
  assert.ok(cta.indexOf('Do you supervise scanning?') < cta.indexOf('One ultrasound Pearl a week'));
});

test('Q9 and Q10: the sign-up leads with the logbook; the likely UK pathway is ticked; international pathways fold away', () => {
  assert.match(APP, /T\('Free\. Your ultrasound logbook, signed off and portfolio-ready\.'\)/);
  const src = APP.slice(APP.indexOf('  function likelyPathways'), APP.indexOf('  function viewOnboard'));
  const PATHS = { rcem: 1, famus: 1, fusic: 1 };
  const likely = new Function('PATHS', src + '\nreturn likelyPathways;')(PATHS);
  assert.deepEqual(likely('ST4 emergency medicine'), ['rcem']);
  assert.deepEqual(likely('Acute medicine registrar'), ['famus']);
  assert.deepEqual(likely('ICM trainee'), ['fusic']);
  assert.deepEqual(likely('Anaesthetics CT2'), ['fusic']);
  assert.deepEqual(likely('GP'), []);
  assert.match(APP, /T\('Training outside the UK'\)/);
  assert.match(APP, /pathwayPicker\(\(profile\(\)\.pathways \|\| \[\]\)\.length \? profile\(\)\.pathways : likelyPathways\(profile\(\)\.grade \|\| S\.account\.role\)\)/);
});

test('Q13: the export says how many scans it holds; acronyms keep their capitals; the code column is wide enough', () => {
  assert.match(APP, /T\('\{n\} of your \{all\} scans are in this export\./);
  assert.match(APP, /columnStyles: \{ 0: \{ cellWidth: 26 \}/);
  const win = {}; new Function('window', read('src/app/progress.js').replace(/\}\)\(typeof window[^;]*;\s*$/, '})(window);'))(win);
  const mod = { id: 'm', types: ['aaa'], total: 0, assessments: [{ kind: 'dops', label: 'DOPS judged competent', min: 1, outcomes: ['competent'] }], rules: [{ label: 'Healthy volunteers', min: 1, match: { setting: ['Healthy volunteer'] } }] };
  const s = win.WLProgress.moduleStats(mod, [{ type: 'aaa', date: '2026-11-01' }], {}, []);
  assert.ok(s.needs.includes('1 more DOPS judged competent'), s.needs.join(' | '));
  assert.ok(s.needs.includes('1 more healthy volunteers'), s.needs.join(' | '));
});

test('Q14: no "2021 curriculum" wording for RCEM on the verify page or in help', () => {
  assert.doesNotMatch(read('data/logbook.json'), /2021 curriculum/);
  assert.doesNotMatch(read('build.js'), /RCEM PoCUS curriculum \(2021/);
});

test('Q3, Q16 and Q1: iPhone steps scroll into view; recommend to a colleague; POCUS in the store listing', () => {
  assert.match(read('build.js'), /s\.hidden=false;s\.scrollIntoView\(\{behavior:'smooth',block:'center'\}\)/);
  assert.match(APP, /T\('Recommend to a colleague'\)/);
  const rec = APP.slice(APP.indexOf('  function recommendApp'), APP.indexOf('  function viewMe'));
  assert.doesNotMatch(rec, /licen[cs]e|department|subscri|pro\b|premium|price|£/i, 'nothing about paid features in the app (Apple 3.1.1)');
  const store = read('mobile/STORE.md');
  assert.match(store, /^Name: Wavelength: POCUS Logbook$/m);
  const short = (store.match(/^Short description \(Google, 80 characters\): (.*)$/m) || [])[1];
  assert.ok(short && short.length <= 80 && /POCUS/.test(short), short);
});
