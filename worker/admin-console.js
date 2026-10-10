// The Wavelength admin console at /admin/ (worker/index.js routes it): its sections, the navigation shown on every
// console page, the home page, and where old /volunteer/admin/* addresses now live.
import { allowed } from './access.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const SECTIONS = [
  { id: 'business', label: 'Business performance', about: 'Website, logbook, supervision, courses, tailored training, finance, owner time, marketing and the monthly report.' },
  { id: 'volunteers', label: 'Volunteers', about: 'Scanning-model sign-ups: contact status, delete and export.' },
  { id: 'academy', label: 'Academy', about: 'Learners, certificates, attempts, feedback and exports.' },
  { id: 'supervisors', label: 'Supervisor verification', about: 'Applications, renewals, credential claims, people and the email outbox.' },
  { id: 'organisations', label: 'Organisations', about: 'The organisation directory, aliases, merges and requests.' },
  { id: 'faculty', label: 'Faculty applications', about: 'Teach with us applications.' },
  { id: 'departments', label: 'Training enquiries', about: 'Tailored training enquiries: contact details, messages, contacted status and export.' },
  { id: 'newsletter', label: 'Newsletter', about: 'Zoho Campaigns connection, the weekly send and the send log.' },
  { id: 'logins', label: 'Logins', about: 'Change the volunteer and admin passwords.' },
];

// With Cloudflare Access on, a person sees only the sections their roles open. With it off, the one admin login
// opens everything, as before.
const visible = (acc) => SECTIONS.filter((x) => !acc || !acc.on || allowed(acc.roles || [], `/admin/${x.id}/`));

export function adminNav(acc, current = '') {
  const links = [{ id: '', label: 'Console' }, ...visible(acc)].map((x) => {
    const href = x.id ? `/admin/${x.id}/` : '/admin/';
    return x.id === current ? `<b aria-current="page">${esc(x.label)}</b>` : `<a class="text-link" href="${href}">${esc(x.label)}</a>`;
  });
  return `<nav class="admin-summary admin-nav" aria-label="Admin console" style="margin:0 0 28px">${links.join(' · ')} · <a class="text-link" href="/admin/logout/">Log out</a></nav>`;
}

export function consoleHome(acc) {
  const items = visible(acc).map((x) => `<li><a class="text-link" href="/admin/${x.id}/"><b>${esc(x.label)}</b></a><br><span class="muted">${esc(x.about)}</span></li>`).join('');
  return `<h2 class="display" style="font-size:34px;margin:0 0 8px">Admin console</h2>
  <p class="admin-summary">${acc && acc.on ? `Signed in through Cloudflare Access as ${esc(acc.email)}.` : 'Private to the Wavelength team.'} Volunteers use their own login at /volunteer/ and never see this console.</p>
  ${items ? `<ul class="admin-sections" style="list-style:none;padding:0;display:grid;gap:14px">${items}</ul>` : '<p class="admin-summary">Your admin roles do not open any section yet. Ask the owner to add the role you need.</p>'}`;
}

// Old /volunteer/admin/* addresses (bookmarks, emails already sent, the Zoho redirect URI). Only known pages map to
// their new address; anything else goes to the console home, so the target is always a fixed page under /admin/.
const LEGACY = new Set(['academy/', 'academy/learners.csv', 'academy/certificates.csv', 'academy/feedback.csv', 'faculty/', 'faculty/applications.csv', 'departments/', 'departments/enquiries.csv', 'newsletter/', 'newsletter/connect/', 'newsletter/callback/', 'supervisors/', 'supervisors/evidence/', 'organisations/']);
export function legacyAdminPath(p) {
  const rest = String(p).replace(/^\/volunteer\/admin\/?/, '');
  if (rest === 'export.csv') return '/admin/volunteers/export.csv';
  return LEGACY.has(rest) ? `/admin/${rest}` : '/admin/';
}
