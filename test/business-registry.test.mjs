// The business dashboard in the permission registry (commercial integration, October 2026): every tab and CSV export
// of worker/business.js is declared (read with business.view), every form action it or worker/bookings.js handles is
// declared on every tab path (business.edit), and both permissions are switchable: the Owner has them, a General
// Manager only when switched on. Without these declarations native accounts would refuse the whole dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GET_ROUTES, POST_ROUTES, PERMISSIONS, ROLES, NAV, BUSINESS_TABS, BUSINESS_EXPORTS, permissionFor, permissionsOf } from '../worker/admin/permissions.js';
import { TABS } from '../worker/business.js';

const src = (f) => readFileSync(new URL(`../worker/${f}`, import.meta.url), 'utf8');

test('every dashboard tab and export is declared, and nothing declared is stale', () => {
  assert.deepEqual(TABS.map(([k]) => k), BUSINESS_TABS);
  const exportsInCode = [...src('business.js').matchAll(/name === '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(exportsInCode)].sort(), [...BUSINESS_EXPORTS].sort());
  for (const t of BUSINESS_TABS) assert.equal(GET_ROUTES[`/admin/business/${t ? t + '/' : ''}`], 'business.view', `tab ${t || 'overview'}`);
  for (const n of BUSINESS_EXPORTS) assert.equal(permissionFor('GET', `/admin/business/export/${n}.csv`), 'business.view', n);
  assert.equal(permissionFor('GET', '/admin/business/export/nothing.csv'), null);
  assert.equal(permissionFor('GET', '/admin/business/no-such-tab/'), null);
});

test('every dashboard form action is declared on every tab, with business.edit', () => {
  const found = new Set();
  for (const re of [/\ba === '([a-z_]+)'/g, /\baction === '([a-z_]+)'/g, /name="action" value="([a-z_]+)"/g, /hidden\('action', '([a-z_]+)'\)/g]) {
    for (const f of ['business.js', 'bookings.js']) for (const m of src(f).matchAll(re)) found.add(m[1]);
  }
  assert.ok(found.size >= 10, `found ${found.size}`);
  for (const t of BUSINESS_TABS) {
    const p = `/admin/business/${t ? t + '/' : ''}`;
    for (const a of found) assert.equal(permissionFor('POST', p, a), 'business.edit', `${a} on ${p}`);
    assert.deepEqual(Object.keys(POST_ROUTES[p]).sort(), [...found].sort(), `nothing stale on ${p}`);
    assert.equal(permissionFor('POST', p, 'no_such_action'), null);
  }
});

test('business permissions are switchable: the Owner has them; a General Manager only when switched on', () => {
  for (const k of ['business.view', 'business.edit']) assert.equal(PERMISSIONS[k].kind, 'switchable', k);
  const owner = { status: 'active', role: 'owner', grants: '[]' };
  const gm = { status: 'active', role: 'general_manager', grants: '[]' };
  const gmView = { status: 'active', role: 'general_manager', grants: '["business.view"]' };
  assert.ok(permissionsOf(owner).has('business.edit') && permissionsOf(owner).has('business.view'));
  assert.ok(!permissionsOf(gm).has('business.view') && !permissionsOf(gm).has('business.edit'));
  assert.ok(permissionsOf(gmView).has('business.view') && !permissionsOf(gmView).has('business.edit'));
  assert.ok(!ROLES.general_manager.permissions.includes('business.edit'));
  assert.equal(NAV.find((n) => n.id === 'business').perm, 'business.view');
});
