// Request handling for administrator accounts. worker/index.js calls:
//   preAuthRoute   /admin/activate/, /admin/two-step/, /admin/two-step/setup/ (before any console session)
//   accountsLogin  POST /admin/login/ once accounts are live
//   gate           every other console request once accounts are live: session, stage, CSRF, permission, recent
//                  re-authentication for owner security pages; returns { who } or a Response
//   accountRoutes  /admin/account/, /admin/reauth/, /admin/accounts/ (owner) for a signed-in administrator
//   bootstrapRoute /admin/accounts/ in legacy mode (first Owner account)
import {
  accountsConfigured, accountsReady, accountsLive, accountCount, getAccount, byUsername, listAccounts, activeOwners,
  createAccount, issueActivation, activationAccount, completeActivation, changePassword, createSession, readSession,
  upgradeSession, markReauth, listSessions, revokeSessions, clearSessionCookie, signInAllowed, checkPasswordStep,
  enrolled, beginEnrolment, pendingSecret, finishEnrolment, checkSecondFactor, recoveryLeft, resetTwoStepStmts,
  accountAudit, USERNAME_RE, revokeLinks,
} from './accounts.js';
import { adminPasswordProblem, checkAdminPassword, sameString, sha256Hex, otpauthUrl } from './crypto.js';
import { permissionFor, permissionsOf, can, ROLES, SWITCHABLE, REAUTH_PERMISSIONS, REAUTH_MINUTES } from './permissions.js';
import * as P from './pages.js';

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const iso = () => new Date(Date.now()).toISOString();

// POSTs must come from the site itself. Browsers send Origin on form posts; Sec-Fetch-Site covers the rest.
export function sameOrigin(req, url) {
  const origin = req.headers.get('Origin');
  if (origin) return origin === url.origin;
  const site = req.headers.get('Sec-Fetch-Site');
  return site === 'same-origin';
}
// The per-session token added to every console form (worker/index.js render) and checked on every POST.
// Any quoting of method=post is matched, so a form written in another style still gets the token.
export const withCsrf = (html, csrf) => String(html).replace(/<form\b[^>]*\bmethod\s*=\s*["']?post\b["']?[^>]*>/gi, (m) => `${m}<input type="hidden" name="_csrf" value="${csrf}">`);
const csrfOk = (f, session) => !!session && sameString(String(f.get('_csrf') || ''), session.csrf);
const safeNext = (n) => (/^\/admin\/[A-Za-z0-9/_.\-?=&%]*$/.test(String(n || '')) && !String(n).startsWith('/admin/reauth/') ? String(n) : '/admin/');
const activationUrl = (url, token) => `${url.origin}/admin/activate/?t=${token}`;

// ---------- Before a console session ----------
export async function preAuthRoute(req, env, url, p, H) {
  if (!(await accountsReady(env)) || !accountsConfigured(env)) return H.redirect('/admin/login/');
  if (req.method === 'POST' && !sameOrigin(req, url)) return H.forbidden();

  if (p === '/admin/activate/') {
    if (req.method === 'POST') {
      const f = await req.formData();
      const token = clip(f.get('t'), 100);
      const a = await activationAccount(env, token);
      if (!a) return H.bare(P.linkExpiredPage(), 410);
      const pw = String(f.get('password') || '');
      const problem = pw !== String(f.get('password2') || '') ? 'The two passwords are different.' : adminPasswordProblem(pw, { username: a.username, name: a.display_name });
      if (problem) return H.bare(P.activatePage({ token, account: a, error: problem }));
      const done = await completeActivation(env, token, pw);
      if (!done) return H.bare(P.linkExpiredPage(), 410);
      // A password reset keeps two-step: the next step asks for a code. A new account sets two-step up now.
      const s = await createSession(env, req, done.id, enrolled(done) ? 'two_step' : 'enrol');
      return H.redirect(enrolled(done) ? '/admin/two-step/' : '/admin/two-step/setup/', { 'Set-Cookie': s.cookie });
    }
    const token = clip(url.searchParams.get('t'), 100);
    const a = await activationAccount(env, token);
    return a ? H.bare(P.activatePage({ token, account: a })) : H.bare(P.linkExpiredPage(), 410);
  }

  const cur = await readSession(env, req);
  if (p === '/admin/two-step/') {
    if (!cur || cur.session.stage !== 'two_step') return H.redirect('/admin/login/');
    if (req.method === 'POST') {
      const f = await req.formData();
      if (!csrfOk(f, cur.session)) return H.forbidden();
      if (!(await signInAllowed(env, req))) return H.bare(P.twoStepPage({ csrf: cur.session.csrf, error: 'Too many attempts. Wait a minute and try again.' }), 429);
      const how = await checkSecondFactor(env, cur.account, f.get('code'));
      if (!how) {
        const again = await getAccount(env, cur.account.id);
        if (again && again.locked_until && again.locked_until > iso()) { await revokeSessions(env, again.id).run(); return H.redirect('/admin/login/?error=1', { 'Set-Cookie': clearSessionCookie() }); }
        return H.bare(P.twoStepPage({ csrf: cur.session.csrf, error: 'That code is not correct, or was already used. Try the newest code.' }));
      }
      await upgradeSession(env, cur.session.id, 'full', { reauth: true });
      await env.DB.batch([
        env.DB.prepare('UPDATE admin_accounts SET last_sign_in_at = ? WHERE id = ?').bind(iso(), cur.account.id),
        accountAudit(env, cur.account, 'admin.sign_in', { subjectId: cur.account.id, meta: { method: how } }),
      ]);
      return H.redirect(how === 'recovery' ? `/admin/account/?m=${encodeURIComponent(`Signed in with a recovery code. ${await recoveryLeft(env, cur.account.id)} left.`)}` : '/admin/');
    }
    return H.bare(P.twoStepPage({ csrf: cur.session.csrf }));
  }

  if (p === '/admin/two-step/setup/') {
    if (!cur || cur.session.stage !== 'enrol') return H.redirect('/admin/login/');
    const a = cur.account;
    if (req.method === 'POST') {
      const f = await req.formData();
      if (!csrfOk(f, cur.session)) return H.forbidden();
      if (!(await signInAllowed(env, req))) return H.redirect('/admin/two-step/setup/');
      const codes = await finishEnrolment(env, a, f.get('code'));
      if (!codes) {
        const secret = await pendingSecret(env, await getAccount(env, a.id));
        if (!secret) return H.redirect('/admin/login/?error=1', { 'Set-Cookie': clearSessionCookie() });
        return H.bare(P.enrolPage({ csrf: cur.session.csrf, account: a, secret, url: otpauthUrl({ account: a.username, secret }), error: 'That code did not match. Check the time on your phone is set automatically, then enter the newest code.' }));
      }
      await upgradeSession(env, cur.session.id, 'full', { reauth: true });
      await env.DB.prepare('UPDATE admin_accounts SET last_sign_in_at = ? WHERE id = ?').bind(iso(), a.id).run();
      return H.bare(P.recoveryCodesPage({ codes }));
    }
    const secret = (await pendingSecret(env, a)) || (await beginEnrolment(env, a));
    return H.bare(P.enrolPage({ csrf: cur.session.csrf, account: a, secret, url: otpauthUrl({ account: a.username, secret }) }));
  }
  return null;
}

// ---------- Password step once accounts are live ----------
export async function accountsLogin(req, env, url, H) {
  if (!sameOrigin(req, url)) return H.forbidden();
  if (!(await signInAllowed(env, req))) return H.refuse('/admin/login/?error=1');
  const f = await req.formData();
  const r = await checkPasswordStep(env, clip(f.get('username'), 100), f.get('password'));
  if (!r.ok) return H.refuse('/admin/login/?error=1');
  const s = await createSession(env, req, r.account.id, enrolled(r.account) ? 'two_step' : 'enrol');
  return H.redirect(enrolled(r.account) ? '/admin/two-step/' : '/admin/two-step/setup/', { 'Set-Cookie': s.cookie });
}

// ---------- Every console request once accounts are live ----------
// Returns { who: { account, session, perms } } to continue, or a Response.
export async function gate(req, env, url, p, H) {
  const cur = await readSession(env, req);
  if (!cur) return H.redirect('/admin/login/', { 'Set-Cookie': clearSessionCookie() });
  if (cur.session.stage === 'two_step') return H.redirect('/admin/two-step/');
  if (cur.session.stage === 'enrol' || !enrolled(cur.account)) return H.redirect('/admin/two-step/setup/');
  if (cur.account.status !== 'active') return H.redirect('/admin/login/', { 'Set-Cookie': clearSessionCookie() });
  let action = '';
  if (req.method === 'POST') {
    if (!sameOrigin(req, url)) return H.forbidden();
    const f = await req.clone().formData();
    if (!csrfOk(f, cur.session)) return H.forbidden();
    action = String(f.get('action') || '');
  }
  const perm = permissionFor(req.method, p, action);
  if (!perm || !can(cur.account, perm)) {
    if (req.method === 'POST') await accountAudit(env, cur.account, 'admin.denied', { subjectType: 'route', subjectId: p, meta: { action, permission: perm || 'none' } }).run();
    return H.denied(cur);
  }
  if (REAUTH_PERMISSIONS.has(perm) && !(cur.session.reauth_at && Date.parse(cur.session.reauth_at) + REAUTH_MINUTES * 60e3 > Date.now())) {
    return H.redirect(`/admin/reauth/?next=${encodeURIComponent(req.method === 'GET' ? p + url.search : p)}`);
  }
  return { who: { account: cur.account, session: cur.session, perms: permissionsOf(cur.account), perm, action } };
}

// ---------- Own account, re-authentication, owner pages ----------
export async function accountRoutes(req, env, url, p, who, H) {
  const me = who.account;
  if (p === '/admin/reauth/') {
    const next = safeNext(url.searchParams.get('next'));
    if (req.method === 'POST') {
      const f = await req.formData();
      const n = safeNext(f.get('next'));
      if (!(await signInAllowed(env, req))) return H.page(P.reauthPage({ csrf: who.session.csrf, next: n, error: 'Too many attempts. Wait a minute and try again.' }), '');
      const pwOk = await checkAdminPassword(env, String(f.get('password') || '').slice(0, 200), me.password_hash);
      // An authenticator code, or (for someone who has lost their phone) one of their recovery codes.
      const codeOk = pwOk ? await checkSecondFactor(env, me, f.get('code')) : '';
      if (!pwOk || !codeOk) {
        if (!pwOk) await accountAudit(env, me, 'admin.reauth_failed', { subjectId: me.id }).run();
        return H.page(P.reauthPage({ csrf: who.session.csrf, next: n, error: 'The password or code is not correct.' }), '');
      }
      await markReauth(env, who.session.id);
      return H.redirect(n);
    }
    return H.page(P.reauthPage({ csrf: who.session.csrf, next }), '');
  }

  if (p === '/admin/account/') {
    const back = (m) => H.redirect(`/admin/account/?m=${encodeURIComponent(m)}`);
    if (req.method === 'POST') {
      const f = await req.formData();
      const action = String(f.get('action') || '');
      if (action === 'password') {
        if (!(await checkAdminPassword(env, String(f.get('current') || '').slice(0, 200), me.password_hash))) return back('Your current password is not correct. Nothing changed.');
        const pw = String(f.get('password') || '');
        const problem = pw !== String(f.get('password2') || '') ? 'The two new passwords are different.' : adminPasswordProblem(pw, { username: me.username, name: me.display_name });
        if (problem) return back(problem);
        await changePassword(env, me, pw, who.session.id);
        return back('Password changed. Your other sessions have ended.');
      }
      // A new authenticator (a lost or replaced phone): password plus a current code or a recovery code; the old
      // authenticator and every recovery code stop working, other sessions end, and this session goes to set-up.
      if (action === 'two_step_renew') {
        if (!(await signInAllowed(env, req))) return back('Too many attempts. Wait a minute and try again.');
        const pwOk = await checkAdminPassword(env, String(f.get('current') || '').slice(0, 200), me.password_hash);
        const how = pwOk ? await checkSecondFactor(env, me, f.get('code')) : '';
        if (!pwOk || !how) return back('The password or code is not correct. Nothing changed.');
        const at = iso();
        await env.DB.batch([
          env.DB.prepare('UPDATE admin_accounts SET totp_secret = NULL, totp_pending = NULL, totp_enrolled_at = NULL, totp_last_step = 0, updated_at = ? WHERE id = ?').bind(at, me.id),
          env.DB.prepare('DELETE FROM admin_recovery_codes WHERE admin_id = ?').bind(me.id),
          env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id <> ?').bind(me.id, who.session.id),
          env.DB.prepare("UPDATE admin_sessions SET stage = 'enrol', expires_at = ? WHERE id = ?").bind(new Date(Date.now() + 30 * 60e3).toISOString(), who.session.id),
          accountAudit(env, me, 'admin.two_step_renew', { subjectId: me.id, meta: { with: how } }),
        ]);
        return H.redirect('/admin/two-step/setup/');
      }
      if (action === 'sign_out_everywhere') {
        await env.DB.batch([revokeSessions(env, me.id), accountAudit(env, me, 'admin.sign_out_everywhere', { subjectId: me.id })]);
        return H.redirect('/admin/login/', { 'Set-Cookie': clearSessionCookie() });
      }
      if (action === 'sign_out_session') {
        const prefix = clip(f.get('session'), 16);
        if (/^[0-9a-f]{16}$/.test(prefix)) await env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND substr(id, 1, 16) = ? AND id <> ?').bind(me.id, prefix, who.session.id).run();
        return back('That session has ended.');
      }
      return back('Nothing changed.');
    }
    return H.page(P.accountPage({ account: me, sessions: await listSessions(env, me.id), currentId: who.session.id, recoveryLeft: await recoveryLeft(env, me.id), perms: who.perms, msg: clip(url.searchParams.get('m'), 300) }), 'account');
  }

  if (p === '/admin/accounts/') return ownerAccounts(req, env, url, me, H);
  return null;
}

async function recentAudit(env) {
  const rows = (await env.DB.prepare("SELECT at, actor_id, action, subject_type, subject_id FROM audit_events WHERE action LIKE 'admin.%' ORDER BY id DESC LIMIT 100").all()).results || [];
  const names = Object.fromEntries((await listAccounts(env)).map((a) => [`acct${a.id}`, a.display_name]));
  return rows.map((r) => ({ ...r, actor_name: names[r.actor_id] || r.actor_id, subject_name: r.subject_type === 'admin_account' ? names[`acct${r.subject_id}`] || r.subject_id : r.subject_id }));
}

async function ownerAccounts(req, env, url, me, H) {
  const show = async (msg = '', link = null) => H.page(P.accountsPage({ me, accounts: await listAccounts(env), link, msg, audit: await recentAudit(env) }), 'accounts');
  if (req.method !== 'POST') return show(clip(url.searchParams.get('m'), 300));
  const f = await req.formData();
  const action = String(f.get('action') || '');

  if (action === 'create') {
    const username = clip(f.get('username'), 40).toLowerCase(), name = clip(f.get('display_name'), 80), role = String(f.get('role') || '');
    if (!USERNAME_RE.test(username)) return show('Usernames start with a letter and use 3 to 40 lower-case letters, numbers, dots, hyphens or underscores.');
    if (!name) return show('Enter a display name.');
    if (!ROLES[role]) return show('Choose a role.');
    if (await byUsername(env, username)) return show('That username is already taken.');
    const id = await createAccount(env, { username, displayName: name, role, createdBy: me.id });
    const token = await issueActivation(env, id, me.id);
    await accountAudit(env, me, 'admin.create', { subjectId: id, meta: { role } }).run();
    return show(`Added ${name}.`, { name, url: activationUrl(new URL(req.url), token) });
  }

  const target = await getAccount(env, f.get('id'));
  if (!target) return show('Administrator not found.');
  const self = target.id === me.id;
  const audit = (what, meta = {}) => accountAudit(env, me, what, { subjectId: target.id, meta });

  if (action === 'name') {
    const name = clip(f.get('display_name'), 80);
    if (!name) return show('Enter a display name.');
    await env.DB.batch([env.DB.prepare('UPDATE admin_accounts SET display_name = ?, updated_at = ? WHERE id = ?').bind(name, iso(), target.id), audit('admin.rename')]);
    return show('Display name saved.');
  }
  if (action === 'link') {
    // Your own link can be set once (the first owner has no one else to do it); changing it needs another owner, so
    // nobody can quietly switch off the recognition of their own supervisor record.
    if (self && target.learner_id) return show('Your logbook link is set. Another owner must change it.');
    const email = clip(f.get('learner_email'), 160).toLowerCase();
    const l = email ? await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind(email).first() : null;
    if (email && !l) return show('No logbook account has that email address. Nothing changed.');
    await env.DB.batch([env.DB.prepare('UPDATE admin_accounts SET learner_id = ?, updated_at = ? WHERE id = ?').bind(l ? l.id : null, iso(), target.id), audit('admin.link_learner', { linked: !!l })]);
    return show(l ? 'Logbook account linked: this administrator can no longer act unnoticed on their own supervisor record.' : 'Logbook link removed.');
  }
  // Everything below changes someone's access: never your own account here, and never the last active owner.
  if (self) return show('Use Your account to change your own password. Another owner must change your role, two-step or status.');
  if (action === 'role') {
    const role = String(f.get('role') || '');
    if (!ROLES[role]) return show('Choose a role.');
    if (target.role === 'owner' && role !== 'owner' && !(await activeOwners(env, target.id))) return show('There must always be at least one active owner.');
    await env.DB.batch([env.DB.prepare('UPDATE admin_accounts SET role = ?, updated_at = ? WHERE id = ?').bind(role, iso(), target.id), revokeSessions(env, target.id), audit('admin.role', { from: target.role, to: role })]);
    return show(`Role changed to ${ROLES[role].label}. They have been signed out so the change applies at once.`);
  }
  if (action === 'grants') {
    const grants = f.getAll('grant').map(String).filter((g) => SWITCHABLE.includes(g));
    await env.DB.batch([env.DB.prepare('UPDATE admin_accounts SET grants = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify([...new Set(grants)]), iso(), target.id), revokeSessions(env, target.id), audit('admin.grants', { grants })]);
    return show('Extra permissions saved. They have been signed out so the change applies at once.');
  }
  if (action === 'reset_password') {
    const token = await issueActivation(env, target.id, me.id);
    await env.DB.batch([env.DB.prepare('UPDATE admin_accounts SET password_hash = NULL, updated_at = ? WHERE id = ?').bind(iso(), target.id), revokeSessions(env, target.id), audit('admin.password_reset')]);
    return show(`Password reset for ${target.display_name}. Their old password no longer works and they are signed out.`, { name: target.display_name, url: activationUrl(new URL(req.url), token) });
  }
  if (action === 'reset_two_step') {
    await env.DB.batch(resetTwoStepStmts(env, me, target));
    return show(`Two-step verification reset for ${target.display_name}. They are signed out and must set it up again after their password.`);
  }
  if (action === 'sign_out') {
    await env.DB.batch([revokeSessions(env, target.id), audit('admin.sign_out_everywhere')]);
    return show(`${target.display_name} has been signed out everywhere.`);
  }
  if (action === 'disable') {
    if (target.role === 'owner' && !(await activeOwners(env, target.id))) return show('The last active owner cannot be disabled.');
    await env.DB.batch([env.DB.prepare("UPDATE admin_accounts SET status = 'disabled', updated_at = ? WHERE id = ?").bind(iso(), target.id), revokeSessions(env, target.id), revokeLinks(env, target.id), audit('admin.disable')]);
    return show(`${target.display_name} is disabled and signed out.`);
  }
  if (action === 'restore') {
    const status = target.password_hash && target.totp_secret ? 'active' : 'pending';
    await env.DB.batch([env.DB.prepare('UPDATE admin_accounts SET status = ?, failed_count = 0, locked_until = NULL, updated_at = ? WHERE id = ? AND status = ?').bind(status, iso(), target.id, 'disabled'), audit('admin.restore')]);
    return show(`${target.display_name} is restored. If their password or phone may have been exposed, reset them too.`);
  }
  return show('Nothing changed.');
}

// ---------- Legacy mode: the first Owner account ----------
export async function bootstrapRoute(req, env, url, H) {
  const ready = await accountsReady(env), configured = accountsConfigured(env);
  const existing = ready ? await env.DB.prepare("SELECT * FROM admin_accounts WHERE role = 'owner' ORDER BY id LIMIT 1").first() : null;
  if (ready && (await accountsLive(env))) return H.redirect('/admin/login/');
  const show = (msg = '', link = null) => H.page(P.bootstrapPage({ msg, link, configured, ready, existing }), 'accounts');
  if (req.method !== 'POST') return show();
  if (!ready || !configured) return show('Accounts cannot be set up yet.');
  const f = await req.formData();
  if (String(f.get('action') || '') !== 'bootstrap') return show();
  if (!(await signInAllowed(env, req))) return show('Too many attempts. Wait a minute and try again.');
  const expected = String(env.ADMIN_BOOTSTRAP_CODE || '');
  const given = String(f.get('code') || '').slice(0, 200);
  if (expected.length < 12 || !sameString(await sha256Hex(given), await sha256Hex(expected))) {
    await accountAudit(env, null, 'admin.bootstrap_refused', {}).run();
    return show('The set-up code is not correct.');
  }
  let id = existing && existing.id;
  if (!id) {
    const username = clip(f.get('username'), 40).toLowerCase(), name = clip(f.get('display_name'), 80);
    if (!USERNAME_RE.test(username) || !name) return show('Enter a username (3 to 40 lower-case letters, numbers, dots or hyphens, starting with a letter) and a display name.');
    if ((await accountCount(env)) > 0) return show('Accounts already exist. Ask an owner.');
    id = await createAccount(env, { username, displayName: name, role: 'owner' });
  }
  const token = await issueActivation(env, id, null);
  await accountAudit(env, null, 'admin.bootstrap', { subjectId: id }).run();
  return show('Owner account ready for activation.', activationUrl(new URL(req.url), token));
}
