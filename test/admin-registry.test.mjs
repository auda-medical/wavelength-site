// The permission registry (worker/admin/permissions.js) covers every console route and every form action in the
// Worker source: a new page or action without a declaration fails this test (deny by default would refuse it in
// production anyway, but the build must say so first). Stale declarations fail too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET_ROUTES, POST_ROUTES, PERMISSIONS, permissionFor } from '../worker/admin/permissions.js';

const src = (f) => readFileSync(new URL(`../worker/${f}`, import.meta.url), 'utf8');
// Pages before a console session, and the legacy-only first-owner set-up: not permission-checked by design.
const PRE_AUTH = new Set(['/admin/login/', '/admin/logout/', '/admin/activate/', '/admin/two-step/', '/admin/two-step/setup/']);
const LEGACY_ONLY_ACTIONS = new Set(['bootstrap']);

// Form actions a module handles or renders.
function actionsIn(text) {
  const out = new Set();
  for (const re of [/\b(?:action|a) === '([a-z_]+)'/g, /\baction !== '([a-z_]+)'/g, /name="action" value="([a-z_]+)"/g, /hidden\('action', '([a-z_]+)'\)/g, /\bform\((?:access, )?'([a-z_]+)'/g, /\bact\('([a-z_]+)'/g]) {
    for (const m of text.matchAll(re)) out.add(m[1]);
  }
  return out;
}
const MODULES = {
  '/admin/supervisors/': ['supervisors-admin.js', 'monitor/claims-admin.js'],
  '/admin/organisations/': ['organisations.js'],
  '/admin/faculty/': ['faculty.js'],
  '/admin/departments/': ['departments.js'],
  '/admin/newsletter/': ['newsletter.js'],
  '/admin/sources/': ['monitor/admin.js'],
};

test('every /admin/ path in the Worker is declared (or is a sign-in page)', () => {
  const paths = new Set([...src('index.js').matchAll(/p === '(\/admin\/[^']*)'/g)].map((m) => m[1]));
  for (const p of [...src('admin/routes.js').matchAll(/p === '(\/admin\/[^']*)'/g)].map((m) => m[1])) paths.add(p);
  assert.ok(paths.size >= 25, `found ${paths.size} paths`);
  for (const p of paths) assert.ok(PRE_AUTH.has(p) || GET_ROUTES[p] || POST_ROUTES[p], `undeclared admin path ${p}`);
});

test('every form action of every section is declared under that section, and nothing declared is stale', () => {
  for (const [path, files] of Object.entries(MODULES)) {
    const found = new Set(files.flatMap((f) => [...actionsIn(src(f))]));
    for (const a of found) assert.ok(a in POST_ROUTES[path], `undeclared action ${a} on ${path}`);
    for (const a of Object.keys(POST_ROUTES[path])) assert.ok(found.has(a), `declared action ${a} on ${path} is not in the code`);
  }
  // index.js: volunteers, logins and Academy forms.
  const idx = actionsIn(src('index.js'));
  const idxRoutes = ['/admin/volunteers/', '/admin/logins/', '/admin/academy/'];
  for (const a of idx) assert.ok(idxRoutes.some((r) => a in POST_ROUTES[r]), `undeclared index.js action ${a}`);
  for (const r of idxRoutes) for (const a of Object.keys(POST_ROUTES[r])) assert.ok(idx.has(a), `stale ${r} ${a}`);
  // Accounts pages.
  const acct = new Set([...actionsIn(src('admin/routes.js')), ...actionsIn(src('admin/pages.js'))]);
  const acctRoutes = ['/admin/account/', '/admin/accounts/', '/admin/reauth/'];
  for (const a of acct) assert.ok(LEGACY_ONLY_ACTIONS.has(a) || acctRoutes.some((r) => a in POST_ROUTES[r]), `undeclared account action ${a}`);
  for (const r of acctRoutes) for (const a of Object.keys(POST_ROUTES[r])) assert.ok(acct.has(a), `stale ${r} ${a}`);
});

test('every declared route and action names a real permission; anything else is refused', () => {
  for (const [p, perm] of Object.entries(GET_ROUTES)) assert.ok(PERMISSIONS[perm], `${p} -> ${perm}`);
  for (const [p, actions] of Object.entries(POST_ROUTES)) for (const [a, perm] of Object.entries(actions)) assert.ok(PERMISSIONS[perm], `${p} ${a} -> ${perm}`);
  assert.equal(permissionFor('GET', '/admin/not-a-page/'), null);
  assert.equal(permissionFor('POST', '/admin/volunteers/', 'drop_everything'), null);
  assert.equal(permissionFor('POST', '/admin/volunteers/', 'constructor'), null, 'no inherited object keys');
  assert.equal(permissionFor('POST', '/admin/volunteers/', ''), null);
  assert.equal(permissionFor('PUT', '/admin/volunteers/', 'delete'), null);
  assert.equal(permissionFor('DELETE', '/admin/'), null);
});
