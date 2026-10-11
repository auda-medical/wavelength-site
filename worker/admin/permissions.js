// Administrator permissions (native accounts, October 2026). The single registry: every console route and every form
// action must be declared here, or the request is refused (deny by default). test/admin-registry.test.mjs fails if a
// route or action exists in the Worker without a declaration.
//
// Kinds:
//   routine    day-to-day work: the General Manager role has it
//   switchable high impact: the Owner has it; the owner can switch it on for a named administrator (off by default)
//   owner      owner only, never switchable (accounts, security, secrets, integrations, and the two actions the
//              owner reserved on 11 October 2026: revoking every approval of one supervisor, merging organisations)
export const PERMISSIONS = {
  // Everyone signed in
  'console.home': { kind: 'routine', label: 'Console home' },
  'account.self': { kind: 'routine', label: 'Own account: password, two-step, sessions' },
  // Volunteers
  'volunteers.view': { kind: 'routine', label: 'View volunteers' },
  'volunteers.contacted': { kind: 'routine', label: 'Mark volunteers contacted' },
  // Academy
  'academy.view': { kind: 'routine', label: 'View Academy learners, certificates, attempts and feedback' },
  'academy.send_certificates': { kind: 'routine', label: 'Email pending certificates to the learners who earned them' },
  'academy.export_feedback': { kind: 'routine', label: 'Download the feedback spreadsheet (no names)' },
  // Supervisor verification
  'supervisors.view': { kind: 'routine', label: 'View supervisor verification' },
  'supervisors.evidence': { kind: 'routine', label: 'Open uploaded evidence files' },
  'supervisors.decide': { kind: 'routine', label: 'Supervisor decisions: applications, registrations, credentials, approvals, reviews' },
  'supervisors.email': { kind: 'routine', label: 'Individual supervisor emails: receipts, re-send failed, mark sent' },
  'supervisors.revoke_all': { kind: 'owner', label: 'Revoke every approval of one supervisor' },
  // Organisations
  'organisations.view': { kind: 'routine', label: 'View organisations and requests' },
  'organisations.edit': { kind: 'routine', label: 'Add organisations, map requests, manage aliases' },
  'organisations.merge': { kind: 'owner', label: 'Merge two organisations' },
  // Source monitoring (Release B)
  'sources.view': { kind: 'routine', label: 'View source monitoring' },
  'sources.review': { kind: 'routine', label: 'Review changes, retry sources, directory opt-outs' },
  // Faculty applications and department enquiries
  'faculty.view': { kind: 'routine', label: 'View faculty applications' },
  'faculty.contacted': { kind: 'routine', label: 'Mark faculty applications contacted' },
  'departments.view': { kind: 'routine', label: 'View department enquiries' },
  'departments.contacted': { kind: 'routine', label: 'Mark department enquiries contacted' },
  // Newsletter
  'newsletter.view': { kind: 'routine', label: 'View the newsletter connection and send log' },
  'newsletter.test': { kind: 'routine', label: 'Test the connection and dry run (sends nothing)' },
  'newsletter.pause': { kind: 'routine', label: 'Pause or resume automatic weekly sending' },
  'newsletter.send_now': { kind: 'switchable', label: 'Send this week\'s issue now to the whole list' },
  'newsletter.integration': { kind: 'owner', label: 'Zoho client ID and secret; connect Zoho Campaigns' },
  // High impact, switchable per person
  'records.delete': { kind: 'switchable', label: 'Delete a single volunteer, faculty application or enquiry permanently' },
  'records.export_personal': { kind: 'switchable', label: 'Download spreadsheets with names or contact details' },
  'business.view': { kind: 'switchable', label: 'Business and finance dashboard' },
  // Owner only
  'admins.manage': { kind: 'owner', label: 'Administrator accounts, roles, permissions, resets, sessions, audit log' },
  'logins.manage': { kind: 'owner', label: 'Volunteer-area password and the shared login' },
};
export const SWITCHABLE = Object.keys(PERMISSIONS).filter((k) => PERMISSIONS[k].kind === 'switchable');

export const ROLES = {
  owner: { label: 'Owner', permissions: Object.keys(PERMISSIONS) },
  general_manager: { label: 'General Manager', permissions: Object.keys(PERMISSIONS).filter((k) => PERMISSIONS[k].kind === 'routine') },
};

// The permissions of an account: its role's, plus the switchable ones the owner has switched on. Nothing else.
export function permissionsOf(account) {
  if (!account || account.status !== 'active') return new Set();
  const role = ROLES[account.role];
  if (!role) return new Set();
  const out = new Set(role.permissions);
  let grants = [];
  try { grants = JSON.parse(account.grants || '[]'); } catch { grants = []; }
  for (const g of Array.isArray(grants) ? grants : []) if (SWITCHABLE.includes(g)) out.add(g);
  return out;
}
export const can = (account, perm) => !!perm && permissionsOf(account).has(perm);

// ---------- Routes ----------
// GET routes by exact path. A path may be both GET and POST.
export const GET_ROUTES = {
  '/admin/': 'console.home',
  '/admin/account/': 'account.self',
  '/admin/reauth/': 'account.self',
  '/admin/accounts/': 'admins.manage',
  '/admin/volunteers/': 'volunteers.view',
  '/admin/volunteers/export.csv': 'records.export_personal',
  '/admin/logins/': 'logins.manage',
  '/admin/academy/': 'academy.view',
  '/admin/academy/learners.csv': 'records.export_personal',
  '/admin/academy/certificates.csv': 'records.export_personal',
  '/admin/academy/feedback.csv': 'academy.export_feedback',
  '/admin/faculty/': 'faculty.view',
  '/admin/faculty/applications.csv': 'records.export_personal',
  '/admin/departments/': 'departments.view',
  '/admin/departments/enquiries.csv': 'records.export_personal',
  '/admin/newsletter/': 'newsletter.view',
  '/admin/newsletter/connect/': 'newsletter.integration',
  '/admin/newsletter/callback/': 'newsletter.integration',
  '/admin/sources/': 'sources.view',
  '/admin/supervisors/': 'supervisors.view',
  '/admin/supervisors/evidence/': 'supervisors.evidence',
  '/admin/organisations/': 'organisations.view',
  '/admin/business/': 'business.view',
};
// POST routes: path -> { action -> permission }. An action that is not listed is refused.
const SUPERVISOR_ACTIONS = {
  app_approve: 'supervisors.decide', app_confirm_renewal: 'supervisors.decide', app_reject: 'supervisors.decide',
  app_more: 'supervisors.decide', app_close_approved: 'supervisors.decide', grace_block: 'supervisors.decide',
  app_receipt: 'supervisors.email',
  reg_verify: 'supervisors.decide', reg_reject: 'supervisors.decide', reg_not_current: 'supervisors.decide', reg_recheck: 'supervisors.decide',
  cred_approve: 'supervisors.decide', cred_more: 'supervisors.decide', cred_reject: 'supervisors.decide', cred_revoke: 'supervisors.decide', cred_reinstate: 'supervisors.decide',
  appr_add: 'supervisors.decide', appr_revoke: 'supervisors.decide', appr_reinstate: 'supervisors.decide', appr_independent_review: 'supervisors.decide',
  appr_revoke_all: 'supervisors.revoke_all',
  block_lift: 'supervisors.decide', test_account: 'supervisors.decide',
  listing_confirm: 'supervisors.decide', listing_reject: 'supervisors.decide', listing_flag_clear: 'supervisors.decide',
  notif_resend: 'supervisors.email', notif_mark_sent: 'supervisors.email',
};
export const POST_ROUTES = {
  '/admin/account/': { password: 'account.self', sign_out_everywhere: 'account.self', sign_out_session: 'account.self' },
  '/admin/reauth/': { reauth: 'account.self' },
  '/admin/accounts/': {
    create: 'admins.manage', name: 'admins.manage', role: 'admins.manage', grants: 'admins.manage', link: 'admins.manage',
    reset_password: 'admins.manage', reset_two_step: 'admins.manage', disable: 'admins.manage', restore: 'admins.manage', sign_out: 'admins.manage',
  },
  '/admin/volunteers/': { contacted: 'volunteers.contacted', delete: 'records.delete' },
  '/admin/logins/': { password_volunteer: 'logins.manage', password_admin: 'logins.manage' },
  '/admin/academy/': { send_pending: 'academy.send_certificates' },
  '/admin/faculty/': { contacted: 'faculty.contacted', delete: 'records.delete' },
  '/admin/departments/': { contacted: 'departments.contacted', delete: 'records.delete' },
  '/admin/newsletter/': { test: 'newsletter.test', dryrun: 'newsletter.test', toggle: 'newsletter.pause', send: 'newsletter.send_now', client: 'newsletter.integration' },
  '/admin/sources/': { retry: 'sources.review', review: 'sources.review', accept_drop: 'sources.review', optout: 'sources.review', optout_remove: 'sources.review' },
  '/admin/supervisors/': SUPERVISOR_ACTIONS,
  '/admin/organisations/': {
    req_dismiss: 'organisations.edit', req_map: 'organisations.edit', req_add: 'organisations.edit',
    alias_add: 'organisations.edit', alias_remove: 'organisations.edit', legacy_confirm: 'organisations.edit',
    merge: 'organisations.merge',
  },
};
// Owner security pages need a recent password and authenticator check (10 minutes).
export const REAUTH_PERMISSIONS = new Set(['admins.manage', 'logins.manage', 'newsletter.integration']);
export const REAUTH_MINUTES = 10;

// The permission a request needs, or null (refused). action: the form's `action` field for a POST.
export function permissionFor(method, path, action = '') {
  if (method === 'GET' || method === 'HEAD') return GET_ROUTES[path] || null;
  if (method === 'POST') {
    const actions = POST_ROUTES[path];
    if (!actions) return null;
    return Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
  }
  return null;
}

// Console sections in navigation order, and the permission that shows each.
export const NAV = [
  { id: 'volunteers', perm: 'volunteers.view' },
  { id: 'academy', perm: 'academy.view' },
  { id: 'supervisors', perm: 'supervisors.view' },
  { id: 'organisations', perm: 'organisations.view' },
  { id: 'sources', perm: 'sources.view' },
  { id: 'faculty', perm: 'faculty.view' },
  { id: 'departments', perm: 'departments.view' },
  { id: 'newsletter', perm: 'newsletter.view' },
  { id: 'accounts', perm: 'admins.manage' },
  { id: 'logins', perm: 'logins.manage' },
];
