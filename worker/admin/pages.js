// HTML for administrator accounts: sign-in steps, activation, two-step enrolment, own account, owner management.
// Every value is escaped; no submitted text is placed in a script or handler (CLAUDE.md, "Admin HTML").
import qrcode from '../../src/app/vendor/qrcode.js';
import { ROLES, PERMISSIONS, SWITCHABLE } from './permissions.js';

export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const h2 = (t) => `<h2 class="display" style="font-size:34px;margin:0 0 8px">${esc(t)}</h2>`;
const note = (m, err = false) => (m ? `<p class="${err ? 'form-error' : 'form-note'}" role="${err ? 'alert' : 'status'}" style="font-weight:600">${esc(m)}</p>` : '');
const hidden = (k, v) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`;
const when = (t) => (t ? esc(String(t).slice(0, 16).replace('T', ' ')) + ' UTC' : '<span class="muted">Never</span>');

export function qrSvg(text, size = 220) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" role="img" aria-label="QR code for your authenticator app" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0F1E33"/></svg>`;
}
const groupKey = (key) => key.replace(/(.{4})/g, '$1 ').trim();

// ---------- Sign-in ----------
export const twoStepPage = ({ csrf, error = '' }) => `${h2('Two-step verification')}
<p class="admin-summary">Enter the six-digit code from your authenticator app. If you do not have your phone, enter one of your recovery codes instead.</p>
${note(error, true)}
<form class="form vol-login" method="post" action="/admin/two-step/">${hidden('_csrf', csrf)}
  <label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" autocapitalize="none" maxlength="20" required autofocus></label>
  <div><button class="btn" type="submit">Continue</button></div>
  <p class="form-note"><a class="text-link" href="/admin/logout/">Cancel and sign out</a></p>
</form>`;

export const enrolPage = ({ csrf, account, secret, url, error = '' }) => `${h2('Set up two-step verification')}
<p class="admin-summary">Every Wavelength administrator signs in with a password and a code from an authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password). There is no text-message or email code.</p>
<ol class="admin-summary">
  <li>Open your authenticator app and add an account by scanning this QR code.</li>
  <li>If you cannot scan it, choose to enter a key by hand and type the key below (account: ${esc(account.username)}).</li>
  <li>Enter the six-digit code the app shows.</li>
</ol>
<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;margin:16px 0 24px">${qrSvg(url)}
  <p class="admin-summary" style="overflow-wrap:anywhere">Key to type by hand:<br><code style="font-size:18px;letter-spacing:1px" data-key>${esc(groupKey(secret))}</code></p></div>
${note(error, true)}
<form class="form vol-login" method="post" action="/admin/two-step/setup/">${hidden('_csrf', csrf)}
  <label>Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
  <div><button class="btn" type="submit">Confirm and finish</button></div>
  <p class="form-note"><a class="text-link" href="/admin/logout/">Cancel and sign out</a></p>
</form>`;

export const recoveryCodesPage = ({ codes, next = '/admin/' }) => `${h2('Save your recovery codes')}
<p class="admin-summary"><b>These codes are shown once.</b> Each one lets you sign in once if you lose your phone. Save them in your password manager, or print them and keep them somewhere safe. Wavelength cannot show them again.</p>
<ul class="admin-summary" style="font-family:monospace;font-size:18px;columns:2;max-width:420px" data-recovery-codes>${codes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
<p><a class="btn" href="${esc(next)}">I have saved them: continue</a></p>`;

export const activatePage = ({ token, account, error = '' }) => `${h2('Choose your password')}
<p class="admin-summary">Welcome, ${esc(account.display_name)}. Your Wavelength admin username is <b>${esc(account.username)}</b>. Choose a password of at least 12 characters (a short phrase of several words works well), then set up two-step verification.</p>
${note(error, true)}
<form class="form vol-login" method="post" action="/admin/activate/">${hidden('t', token)}
  <input type="text" name="username" value="${esc(account.username)}" autocomplete="username" hidden>
  <label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label>
  <label>Same password again<input name="password2" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label>
  <div><button class="btn" type="submit">Save password</button></div>
</form>`;

export const linkExpiredPage = () => `${h2('This link has expired or was already used')}
<p class="admin-summary">Activation links work once and expire after 72 hours. Ask the owner for a new link.</p>`;

export const reauthPage = ({ csrf, next, error = '' }) => `${h2('Confirm it is you')}
<p class="admin-summary">Account and security pages need your password and a fresh authenticator code (every 10 minutes). Without your phone, use one of your recovery codes.</p>
${note(error, true)}
<form class="form vol-login" method="post" action="/admin/reauth/">${hidden('_csrf', csrf)}${hidden('action', 'reauth')}${hidden('next', next)}
  <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
  <label>Authenticator code or recovery code<input name="code" autocomplete="one-time-code" autocapitalize="none" maxlength="20" required></label>
  <div><button class="btn" type="submit">Confirm</button></div>
</form>`;

export const deniedPage = () => `${h2('Not available to your account')}
<p class="admin-summary">Your administrator role does not include this page or action. Nothing was changed. Ask the owner if you need it.</p>
<p><a class="text-link" href="/admin/">Back to the console</a></p>`;

// ---------- Own account ----------
export const accountPage = ({ account, sessions, currentId, recoveryLeft, perms, msg = '' }) => `${h2('Your account')}
${note(msg)}
<p class="admin-summary">Signed in as <b>${esc(account.display_name)}</b> (${esc(account.username)}), ${esc((ROLES[account.role] || {}).label || account.role)}. Two-step verification is on. Recovery codes left: ${recoveryLeft}.</p>
<h3 style="margin:28px 0 10px">What your account can do</h3>
<ul class="admin-summary">${[...perms].filter((k) => PERMISSIONS[k]).map((k) => `<li>${esc(PERMISSIONS[k].label)}</li>`).join('')}</ul>
<h3 style="margin:28px 0 10px">Change your password</h3>
<form class="form pw-form" method="post" style="max-width:520px">${hidden('action', 'password')}
  <input type="text" name="username" value="${esc(account.username)}" autocomplete="username" hidden>
  <label>Current password<input name="current" type="password" autocomplete="current-password" required></label>
  <label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label>
  <label>Same new password again<input name="password2" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></label>
  <button class="btn btn-ghost small" type="submit">Change password</button>
  <p class="form-note">Your other sessions end when you change your password.</p>
</form>
<h3 style="margin:28px 0 10px">New phone or authenticator</h3>
<form class="form pw-form" method="post" style="max-width:520px">${hidden('action', 'two_step_renew')}
  <input type="text" name="username" value="${esc(account.username)}" autocomplete="username" hidden>
  <label>Current password<input name="current" type="password" autocomplete="current-password" required></label>
  <label>A code from your current app, or a recovery code<input name="code" autocomplete="one-time-code" autocapitalize="none" maxlength="20" required></label>
  <button class="btn btn-ghost small" type="submit">Set up a new authenticator</button>
  <p class="form-note">Your old authenticator and all recovery codes stop working; you get new ones. Your other sessions end.</p>
</form>
<h3 style="margin:28px 0 10px">Where you are signed in</h3>
<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Signed in</th><th scope="col">Last active</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>
${sessions.map((x) => `<tr><td>${when(x.created_at)}</td><td>${when(x.last_seen_at)}${x.id === currentId ? ' (this session)' : ''}</td><td>${x.id === currentId ? '' : `<form method="post">${hidden('action', 'sign_out_session')}${hidden('session', x.id.slice(0, 16))}<button class="btn btn-ghost small" type="submit">Sign out</button></form>`}</td></tr>`).join('')}
</tbody></table></div>
<form method="post" style="margin-top:12px">${hidden('action', 'sign_out_everywhere')}<button class="btn btn-ghost small" type="submit">Sign out everywhere, including here</button></form>`;

// ---------- Owner: administrators ----------
const roleOptions = (current) => Object.entries(ROLES).map(([k, r]) => `<option value="${k}"${k === current ? ' selected' : ''}>${esc(r.label)}</option>`).join('');
const statusText = (a) => (a.status === 'disabled' ? 'Disabled' : a.status === 'pending' ? (a.password_hash ? 'Waiting for two-step set-up' : 'Waiting for activation') : a.totp_secret ? 'Active' : 'Two-step reset: set-up needed');

export function accountsPage({ me, accounts, link = null, msg = '', audit = [] }) {
  const rows = accounts.map((a) => {
    let grants = [];
    try { grants = JSON.parse(a.grants || '[]'); } catch { grants = []; }
    const self = a.id === me.id;
    const act = (action, label, extra = '', confirmText = '') => `<form method="post"${confirmText ? ` onsubmit="return confirm(this.dataset.confirm)" data-confirm="${esc(confirmText)}"` : ''} style="margin:0 0 14px">${hidden('action', action)}${hidden('id', a.id)}${extra}<button class="btn btn-ghost small" type="submit">${esc(label)}</button></form>`;
    const row = `<tr data-account="${a.id}">
      <td><b>${esc(a.display_name)}</b><br>${esc(a.username)}${self ? ' (you)' : ''}</td>
      <td>${esc((ROLES[a.role] || {}).label || a.role)}${a.role === 'owner' ? '' : `<br><span class="muted">${grants.length ? grants.map((g) => esc((PERMISSIONS[g] || {}).label || g)).join('<br>') : 'No extra permissions'}</span>`}</td>
      <td>${esc(statusText(a))}${a.locked_until && a.locked_until > new Date(Date.now()).toISOString() ? '<br><span class="muted">Locked after failed attempts</span>' : ''}</td>
      <td>${when(a.last_sign_in_at)}</td></tr>`;
    const manage = `<details class="admin-manage" style="border-top:1px solid #EDEAE3;padding:12px 0"><summary style="cursor:pointer;font-weight:600">Manage ${esc(a.display_name)}${self ? ' (you)' : ''}</summary><div style="padding:12px 0 0;max-width:560px">
        ${act('name', 'Rename', `<label class="sr" for="n${a.id}">New display name</label><input id="n${a.id}" name="display_name" value="${esc(a.display_name)}" maxlength="80" required style="max-width:100%">`)}
        ${self ? '' : act('role', 'Change role', `<select name="role" aria-label="Role">${roleOptions(a.role)}</select>`)}
        ${self || a.role === 'owner' ? '' : act('grants', 'Save extra permissions', SWITCHABLE.map((g) => `<label style="display:block;font-weight:400"><input type="checkbox" name="grant" value="${g}"${grants.includes(g) ? ' checked' : ''}> ${esc(PERMISSIONS[g].label)}</label>`).join(''))}
        ${act('link', 'Link logbook account', `<label class="sr" for="l${a.id}">Their logbook account email</label><input id="l${a.id}" name="learner_email" type="email" placeholder="Their logbook email" maxlength="160" style="max-width:100%">`)}
        ${self ? '' : act('reset_password', 'New activation link (resets password)', '', `Reset the password of ${a.display_name}? Their current password stops working and they are signed out everywhere.`)}
        ${self ? '' : act('reset_two_step', 'Reset two-step', '', `Reset two-step verification for ${a.display_name}? They are signed out and must set it up again at their next sign-in.`)}
        ${self ? '' : act('sign_out', 'Sign out everywhere')}
        ${self ? '' : a.status === 'disabled' ? act('restore', 'Restore') : act('disable', 'Disable', '', `Disable ${a.display_name}? They are signed out at once and cannot sign in until restored.`)}
      </div></details>`;
    return { row, manage };
  });
  return `${h2('Administrators')}
${note(msg)}
${link ? `<div class="sv-banner" style="padding:16px;border:2px solid #2A7F8A;margin:0 0 24px" data-activation-link><p class="admin-summary"><b>Activation link for ${esc(link.name)}</b>, shown once. Send it privately (not in a shared channel). It works once and expires in 72 hours.</p><p style="overflow-wrap:anywhere;font-family:monospace">${esc(link.url)}</p></div>` : ''}
<p class="admin-summary">Each administrator signs in with their own username, password and authenticator app. Every action is recorded against their account. Changes here need a recent password and code check.</p>
<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">Administrator</th><th scope="col">Role and extra permissions</th><th scope="col">Status</th><th scope="col">Last sign-in</th></tr></thead><tbody>${rows.map((r) => r.row).join('')}</tbody></table></div>
<div style="margin:16px 0 0">${rows.map((r) => r.manage).join('')}</div>
<h3 style="margin:36px 0 10px">Add an administrator</h3>
<form class="form" method="post" style="max-width:560px">${hidden('action', 'create')}
  <label>Username (lower case letters, numbers, dots or hyphens)<input name="username" pattern="[a-z][a-z0-9._\\-]{2,39}" maxlength="40" autocapitalize="none" required></label>
  <label>Display name (shown in decisions and the audit trail)<input name="display_name" maxlength="80" required></label>
  <label>Role<select name="role">${roleOptions('general_manager')}</select></label>
  <button class="btn btn-ghost small" type="submit">Add and create activation link</button>
</form>
<h3 style="margin:36px 0 10px">Recent account and security events</h3>
${audit.length ? `<div class="table-wrap"><table class="table admin-table"><thead><tr><th scope="col">When</th><th scope="col">By</th><th scope="col">What</th><th scope="col">Account</th></tr></thead><tbody>${audit.map((e) => `<tr><td>${when(e.at)}</td><td>${esc(e.actor_name || e.actor_id || '')}</td><td>${esc(e.action)}</td><td>${esc(e.subject_name || e.subject_id || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-summary">No events yet.</p>'}`;
}

export const bootstrapPage = ({ msg = '', link = null, configured, ready, existing }) => `${h2('Set up personal administrator accounts')}
${note(msg)}
${link ? `<div class="sv-banner" style="padding:16px;border:2px solid #2A7F8A;margin:0 0 24px" data-activation-link><p class="admin-summary"><b>Owner activation link</b>, shown once. Open it yourself now. It works once and expires in 72 hours.</p><p style="overflow-wrap:anywhere;font-family:monospace">${esc(link)}</p></div>` : ''}
${!ready ? '<p class="admin-summary">Migration 0017 is not applied yet.</p>' : !configured ? '<p class="admin-summary">The Worker secrets ADMIN_PEPPER and ADMIN_TOTP_KEY are not set yet.</p>' : `
<p class="admin-summary">This creates the first Owner account. Until it has a password and two-step verification, the shared login keeps working; after that, only personal accounts can sign in. You need the one-time set-up code (the Worker secret ADMIN_BOOTSTRAP_CODE).</p>
<form class="form" method="post" style="max-width:560px">${hidden('action', 'bootstrap')}
  <label>Set-up code<input name="code" type="password" autocomplete="off" required></label>
  ${existing ? `<p class="form-note">An Owner account (${esc(existing.username)}) was started but is not finished. Submitting creates a new activation link for it.</p>${hidden('username', existing.username)}` : `
  <label>Your username<input name="username" pattern="[a-z][a-z0-9._\\-]{2,39}" maxlength="40" autocapitalize="none" required></label>
  <label>Your display name<input name="display_name" maxlength="80" required></label>`}
  <button class="btn btn-ghost small" type="submit">Create the Owner activation link</button>
</form>`}`;
