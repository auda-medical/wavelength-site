// The whole-case page (/admin/supervisors/case/?id=<learner>, October 2026): one page per supervisor with what needs
// doing now, the application and its decision, registration, credentials, approvals and one merged history. Its forms
// post to the existing handler and come back; nothing new is decided. Every person, number and address is fictional;
// email goes to a captured stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctx } from './helpers/env.mjs';
import { verifiedAccount, idOf, adminForm } from './helpers/verify.mjs';
import { setupEnv, bootstrapOwner, activateAndEnrol, addAdmin, advance } from './helpers/admin-accounts.mjs';
import { supervisorsAdminPost, supervisorsAdminHtml, supervisorCaseHtml } from '../worker/supervisors-admin.js';

globalThis.fetch = async () => new Response('{}');
const ON = { SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', ZEPTOMAIL_TOKEN: 'test' };
const admin = (env, o, reviewer = 'Alex Reviewer') => supervisorsAdminPost(env, adminForm({ reviewer, ...o }), 'wavelength', ctx);
const casePage = (env, id, opts = {}) => supervisorCaseHtml(env, new URL(`https://x/admin/supervisors/case/?id=${id}`), 'wavelength', opts);
const EXPLAIN = 'I lead the ultrasound programme <img src=x onerror=alert(1)> and supervise lung and cardiac scans weekly, every week of the year.';
let gmc = 7300001;

async function applicant(env, email = 'jordan.case@example.test') {
  const sup = await verifiedAccount(env, email, { firstName: 'Jordan', lastName: 'Example', organisation: 'Example General Hospital' });
  const d = await sup.call('/api/app/supervisor/application', {
    role: 'Consultant in Emergency Medicine', organisation: 'Example General Hospital',
    registration: { regulator: 'gmc', number: String(gmc++), profession: 'Doctor', organisation: 'Example General Hospital' },
    experience: { years: 'More than 10 years', scans: 'More than 1,000', teaching: true, supervision: true },
    justification: EXPLAIN, evidenceMode: 'explanation', areas: ['lung'], pathways: ['famus'],
  });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal((await sup.call('/api/app/supervisor/submit', { declaration: true })).status, 200);
  const sid = await idOf(env, email);
  const reg = await env.DB.prepare('SELECT id FROM professional_registrations WHERE learner_id = ?').bind(sid).first();
  assert.equal((await admin(env, { action: 'reg_verify', learner: sid, sid: reg.id, register_name: 'Jordan Example', checked: '1' })).m, 'Registration verified.');
  const app = await env.DB.prepare('SELECT * FROM supervisor_applications WHERE learner_id = ? ORDER BY id DESC').bind(sid).first();
  return { sid, app };
}
const forms = (html) => html.match(/<form class="form sv-form"[\s\S]*?<\/form>/g) || [];
const actions = (html) => forms(html).map((f) => (/name="action" value="([a-z_]+)"/.exec(f) || [])[1]);

test('a new applicant: one page with the state, what needs doing, the decision, the sections and one history', async () => {
  const env = makeEnv(ON);
  const { sid, app } = await applicant(env);
  const html = await casePage(env, sid);
  assert.match(html, /<h2 class="display"[^>]*>Jordan Example<\/h2>/);
  assert.match(html, /data-case-state="applying"/);
  assert.match(html, new RegExp(`New application #${app.id} is waiting for a decision`));
  for (const id of ['case-application', 'case-registration', 'case-credentials', 'case-approvals', 'case-standing', 'case-history']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(actions(html).includes('app_approve') && actions(html).includes('reg_verify') && actions(html).includes('appr_add'), actions(html).join(','));
  // One history (the application page's and the person page's are merged), and one title.
  assert.equal((html.match(/>History</g) || []).length, 1);
  assert.equal((html.match(/<h2 /g) || []).length, 1);
  assert.match(html, /application\.submit|verification|reg_verify|registration #/);
  // Applicant text is escaped everywhere.
  assert.ok(!html.includes('<img src=x'), 'unescaped applicant text');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  // Every form posts to the one handler and says where to come back to.
  assert.ok(forms(html).length >= 5);
  for (const f of forms(html)) {
    assert.match(f, /^<form class="form sv-form" method="post" action="\/admin\/supervisors\/"/);
    assert.ok(f.includes(`<input type="hidden" name="case" value="${sid}">`), f.slice(0, 160));
  }
  // The application and person pages link here; queue rows too.
  assert.ok((await supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/?app=${app.id}`))).includes(`href="/admin/supervisors/case/?id=${sid}"`));
  assert.ok((await supervisorsAdminHtml(env, new URL(`https://x/admin/supervisors/?id=${sid}`))).includes(`href="/admin/supervisors/case/?id=${sid}"`));
  assert.ok((await supervisorsAdminHtml(env, new URL('https://x/admin/supervisors/?tab=new'))).includes(`href="/admin/supervisors/case/?id=${sid}"`));
  assert.match(await casePage(env, 999999), /Not found/);
});

test('approved: active, approved until, nothing to do; an application left open beside the approval is flagged with its control', async () => {
  const env = makeEnv(ON);
  const { sid, app } = await applicant(env);
  assert.match((await admin(env, { action: 'app_approve', app: app.id, scope: ['famus:famus-thoracic'] })).m, /^Approved/);
  let html = await casePage(env, sid);
  assert.match(html, /data-case-state="active"/);
  assert.match(html, /Approved until /);
  assert.match(html, /Nothing needs doing now/);
  assert.match(html, /\(the latest; none is open\)/);
  // The October 2026 state of application #1: approved on the person page while the application stayed open.
  await env.DB.prepare("UPDATE supervisor_applications SET status = 'submitted', decided_at = NULL, decided_by = NULL WHERE id = ?").bind(app.id).run();
  html = await casePage(env, sid);
  assert.match(html, new RegExp(`Application #${app.id} is still open beside a current approval`));
  assert.ok(actions(html).includes('app_close_approved'));
});

test('your own record: said at the top, and the independent review is left for another administrator', async () => {
  const env = makeEnv(ON);
  const { sid, app } = await applicant(env);
  // Approved by someone who appears to be the supervisor (typed name), with the acknowledgement.
  const r = await admin(env, { action: 'app_approve', app: app.id, scope: ['famus:famus-thoracic'], self_ack: '1', self_reason: 'Checked against the hospital consultant list and GMC register.' }, 'Jordan Example');
  assert.match(r.m, /^Approved/);
  const own = await casePage(env, sid, { account: { name: 'Jordan Example', learnerId: sid } });
  assert.match(own, /This is your own record/);
  assert.ok(!actions(own).includes('appr_independent_review'));
  assert.match(own, /Another administrator records the independent review/);
  assert.match(own, /another administrator should record an independent review/);
  const other = await casePage(env, sid, { account: { name: 'Alex Reviewer', learnerId: 0 } });
  assert.doesNotMatch(other, /This is your own record/);
  assert.ok(actions(other).includes('appr_independent_review'));
  assert.match(other, /record an independent review/);
  // Native accounts: decisions are recorded as the account, so no name field is shown.
  assert.match(other, /Recorded as Alex Reviewer \(your administrator account\)/);
  assert.ok(!other.includes('name="reviewer" autocomplete'));
});

test('controls the administrator may not use are left off the page', async () => {
  const env = makeEnv(ON);
  const { sid, app } = await applicant(env);
  await admin(env, { action: 'app_approve', app: app.id, scope: ['famus:famus-thoracic'] });
  const all = await casePage(env, sid);
  assert.ok(actions(all).includes('appr_revoke_all'));
  const gm = await casePage(env, sid, { can: (a) => a !== 'appr_revoke_all' });
  assert.ok(!actions(gm).includes('appr_revoke_all'));
  assert.ok(actions(gm).includes('appr_revoke'));
});

test('through the Worker with native accounts: the General Manager opens the case, decides from it and comes back to it', async () => {
  const env = await setupEnv(ON);
  const { owner } = await bootstrapOwner(env);
  const link = await (async () => { await owner.b.go('/admin/accounts/'); const r = await owner.b.go('/admin/accounts/', { form: { action: 'create', username: 'zara', display_name: 'Zara Manager', role: 'general_manager' } }); return (r.text.match(/https:\/\/thewavelength\.co\.uk(\/admin\/activate\/\?t=[A-Za-z0-9_-]+)/) || [])[1]; })();
  assert.ok(link);
  advance(31e3);
  const gm = await activateAndEnrol(env, link, 'Quiet harbour evening 2026');
  const { sid, app } = await applicant(env);
  const page = await gm.b.go(`/admin/supervisors/case/?id=${sid}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Jordan Example/);
  assert.ok(!page.text.includes('value="appr_revoke_all"'), 'owner-only control hidden from the General Manager');
  assert.match(page.text, /name="_csrf"/);
  const post = await gm.b.go('/admin/supervisors/', { form: { action: 'app_approve', app: app.id, case: sid, scope: ['famus:famus-thoracic'], reviewer: 'typed name is ignored' } });
  assert.equal(post.status, 303);
  assert.match(post.to, new RegExp(`^/admin/supervisors/case/\\?id=${sid}&m=Approved`));
  const approval = await env.DB.prepare("SELECT approved_by FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(sid).first();
  assert.match(approval.approved_by, /Zara Manager|acct/);
  const back = await gm.b.go(post.to);
  assert.match(back.text, /data-case-state="active"/);
  // The case page has no POST of its own: a stray post changes nothing and is refused or sent back.
  const stray = await gm.b.go(`/admin/supervisors/case/?id=${sid}`, { form: { action: 'appr_revoke', learner: sid } });
  assert.ok([303, 403].includes(stray.status), String(stray.status));
  assert.ok(await env.DB.prepare("SELECT 1 FROM supervisor_approvals WHERE learner_id = ? AND status = 'approved'").bind(sid).first());
  // The owner sees the owner-only control.
  const o = await owner.b.go(`/admin/supervisors/case/?id=${sid}`);
  assert.ok(o.text.includes('value="appr_revoke_all"'));
});
