// The app's reading of supervisor verification (src/app/verified.js, October 2026 supervisor QA): it shows what the
// server says, maps an older Worker's fields onto the same shape without ever claiming more, and never puts a
// pending item inside the approved groups. Also where More info opens on phones, a folded or unfolded Galaxy Z Fold7
// and desktops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/app/verified.js', import.meta.url), 'utf8');
const win = {};
new Function('window', SRC.replace(/\}\)\(typeof window[^;]*;\s*$/, '})(window);'))(win);
const V = win.WLVerified;

const server = {
  v: 1, state: 'verified', verified: true, reviewOn: '2027-10-10',
  approved: [{ pathway: 'famus', pathwayLabel: 'FAMUS', role: 'supervisor', roleLabel: 'Supervisor', allModules: false, modules: [{ id: 'famus-thoracic', label: 'Thoracic' }], verifiedOn: '2026-10-10', reviewOn: '2027-10-10' }],
  pending: [{ kind: 'renewal', status: 'submitted', since: '2026-10-09' }], credentials: [{ label: 'FAMUS supervisor', issuer: 'Society for Acute Medicine', expiresOn: '2030-01-01' }],
};

test('the server\'s verification is used as it is', () => {
  const v = V.fromSupervisor({ verification: server, standing: 'none' });
  assert.equal(v.verified, true, 'the server wins over a stale standing field');
  assert.equal(v.approved[0].modules[0].label, 'Thoracic');
  assert.equal(v.pending[0].kind, 'renewal');
  assert.equal(v.credentials.length, 1);
});

test('nothing is verified unless the server says a current approval exists', () => {
  assert.equal(V.clean({ state: 'verified', verified: false }).verified, false);
  assert.equal(V.clean({ state: 'pending', verified: true, approved: server.approved }).verified, false);
  assert.deepEqual(V.clean({ state: 'pending', verified: true, approved: server.approved }).approved, [], 'no approved groups without verification');
  assert.equal(V.clean({ state: 'something-new' }), null, 'an unknown state is not guessed at');
});

test('an older Worker (no verification field): standing and areas, mapped without overclaiming', () => {
  // The production record behind the reported contradiction: approved from the person page, application still open.
  const P = { standing: 'active', areas: ['Thoracic (FAMUS pathway)', 'Heart (FUSIC pathway)'], reviewOn: '2027-10-10', approvals: [{ current: true, approvedAt: '2026-10-08T10:00:00Z' }], application: { status: 'submitted', kind: 'initial', submittedAt: '2026-10-07T09:00:00Z' } };
  const v = V.fromSupervisor(P);
  assert.equal(v.state, 'verified');
  assert.deepEqual(v.approved.map((g) => [g.pathwayLabel, g.modules.map((m) => m.label), g.role]), [['FAMUS', ['Thoracic'], null], ['FUSIC', ['Heart'], null]], 'the role is not in those labels, so none is invented');
  assert.deepEqual(v.pending.map((p) => p.kind), ['application'], 'the open application is listed beside the approval, never as the status');
  assert.equal(V.fromSupervisor({ standing: 'applying', application: { status: 'submitted', kind: 'initial' } }).state, 'pending');
  assert.equal(V.fromSupervisor({ standing: 'applying', application: { status: 'more_info', kind: 'initial' } }).state, 'more_info');
  assert.equal(V.fromSupervisor({ standing: 'applying', application: { status: 'draft', kind: 'initial' } }).state, 'none');
  assert.equal(V.fromSupervisor({ standing: 'paused', approvals: [{ current: false }] }).verified, false);
  assert.deepEqual(V.groupsFromAreas(['All modules (RCEM pathway)']), [{ pathway: 'RCEM', pathwayLabel: 'RCEM', role: null, roleLabel: null, allModules: true, modules: [], verifiedOn: null, reviewOn: null }]);
});

test('a linked supervisor: verified only at the approved stage, for whatever the learner is allowed to see', () => {
  assert.equal(V.fromLink({ stage: 'approved', verification: { ...server, pending: undefined, credentials: undefined } }).verified, true);
  assert.equal(V.fromLink({ stage: 'approved', verification: { state: 'not_verified', verified: false } }).verified, false);
  for (const stage of ['awaiting_acceptance', 'awaiting_approval', 'awaiting_professional_verification', 'not_verified', 'unavailable', 'ended']) assert.equal(V.fromLink({ stage, areas: ['Thoracic (FAMUS pathway)'] }).verified, false, stage);
  const old = V.fromLink({ stage: 'approved', areas: ['Thoracic (FAMUS pathway)'], renewal: true });
  assert.equal(old.state, 'renewal_review');
  assert.equal(old.approved[0].modules[0].label, 'Thoracic');
  assert.deepEqual(V.fromLink({ state: 'active', areas: [] }).approved, [], '1.0.11 state names still map');
});

test('pending items shown to a verified supervisor; never a credential for someone not verified', () => {
  const v = V.clean({ ...server, pending: [{ kind: 'credential', label: 'FUSIC trainer' }, { kind: 'renewal' }] });
  assert.deepEqual(V.pendingShown(v).map((p) => p.kind), ['credential', 'renewal']);
  assert.deepEqual(V.pendingShown(V.clean({ state: 'pending', verified: false, pending: [{ kind: 'credential' }, { kind: 'application' }] })).map((p) => p.kind), ['application']);
});

test('More info opens as a bottom sheet on phones and a folded Fold7, beside the button on an unfolded Fold7 and desktops', () => {
  assert.equal(V.placement(390, 844), 'sheet', 'phone');
  assert.equal(V.placement(344, 882), 'sheet', 'Fold7 folded (cover screen)');
  assert.equal(V.placement(884, 1104), 'popover', 'Fold7 unfolded, portrait');
  assert.equal(V.placement(1104, 884), 'popover', 'Fold7 unfolded, landscape');
  assert.equal(V.placement(844, 390), 'sheet', 'phone landscape: too little height');
  assert.equal(V.placement(1440, 900), 'popover', 'desktop');
});

test('the pop-up stays inside the screen: below the button when it fits, above it otherwise', () => {
  const view = { w: 1000, h: 700 }, size = { w: 380, h: 300 };
  assert.deepEqual(V.popoverAt({ left: 100, top: 100, bottom: 140 }, size, view), { left: 100, top: 148, side: 'below' });
  assert.deepEqual(V.popoverAt({ left: 100, top: 600, bottom: 640 }, size, view), { left: 100, top: 292, side: 'above' });
  assert.equal(V.popoverAt({ left: 900, top: 100, bottom: 140 }, size, view).left, 1000 - 380 - 12, 'pulled in from the right edge');
  const tall = V.popoverAt({ left: 10, top: 300, bottom: 340 }, { w: 380, h: 680 }, view);
  assert.ok(tall.top >= 12 && tall.top + 680 <= 700 - 12 || tall.top === 12, 'never above the top edge');
});
