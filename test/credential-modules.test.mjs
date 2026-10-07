// Credential modules in data/credentials.json must stay in step with the pathway modules in data/logbook.json:
// a FAMUS supervisor or FAMUS-accredited applicant must be able to declare every FAMUS module the logbook tracks,
// and every credential scope must point at a real pathway module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers/env.mjs';
import { verifiedAccount, idOf } from './helpers/verify.mjs';
import CREDS from '../data/credentials.json' with { type: 'json' };
import LOGBOOK from '../data/logbook.json' with { type: 'json' };

const pathway = (id) => LOGBOOK.pathways.find((p) => p.id === id);
const type = (id) => CREDS.credentialTypes.find((t) => t.id === id);

test('both FAMUS credential types list every FAMUS pathway module, and nothing else', () => {
  const famus = pathway('famus').modules.map((m) => `famus:${m.id}`).sort();
  assert.ok(famus.includes('famus:famus-lp'));
  const famusTypes = CREDS.credentialTypes.filter((t) => t.programme === 'FAMUS');
  assert.deepEqual(famusTypes.map((t) => t.id).sort(), ['famus-accredited', 'famus-supervisor']);
  for (const t of famusTypes) {
    assert.deepEqual(t.modules.map((m) => m.scope).sort(), famus, `${t.id} modules match the FAMUS pathway`);
    assert.equal(new Set(t.modules.map((m) => m.id)).size, t.modules.length, `${t.id} module ids are unique`);
  }
  const lp = type('famus-supervisor').modules.find((m) => m.scope === 'famus:famus-lp');
  assert.deepEqual(lp, { id: 'lp', label: 'Ultrasound-assisted LP', scope: 'famus:famus-lp' });
  assert.deepEqual(type('famus-accredited').modules.find((m) => m.scope === 'famus:famus-lp'), lp);
});

test('every credential scope names an existing pathway module or a whole pathway', () => {
  const modules = new Set(LOGBOOK.pathways.flatMap((p) => (p.modules || []).map((m) => `${p.id}:${m.id}`)));
  const pathways = new Set(LOGBOOK.pathways.map((p) => p.id));
  for (const t of CREDS.credentialTypes) {
    for (const m of t.modules) {
      if (m.scope == null) continue;
      const [p, mod] = m.scope.split(':');
      assert.ok(mod === '*' ? pathways.has(p) : modules.has(m.scope), `${t.id}/${m.id} scope ${m.scope} exists in data/logbook.json`);
    }
  }
});

test('a FAMUS supervisor can claim the Ultrasound-assisted LP module in the supervisor application', async () => {
  const env = makeEnv({ SUPERVISOR_APPLY: 'true' });
  const c = await verifiedAccount(env, 'famus.lp@x.co', { organisation: 'Darent Valley Hospital' });
  const cfg = (await c.call('/api/app/supervisor')).body.config;
  for (const id of ['famus-supervisor', 'famus-accredited']) {
    const t = cfg.credentialTypes.find((x) => x.id === id);
    assert.deepEqual(t.modules.map((m) => m.id), ['thoracic', 'dvt', 'abdo-renal', 'pva', 'lp'], `${id} shows five modules to the app`);
  }
  const r = await c.call('/api/app/supervisor/application', { credentials: [{ type: 'famus-supervisor', modules: ['thoracic', 'lp'] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await env.DB.prepare("SELECT modules FROM credentials WHERE learner_id = ? AND credential_type = 'famus-supervisor'").bind(await idOf(env, 'famus.lp@x.co')).first();
  assert.deepEqual(JSON.parse(row.modules).sort(), ['lp', 'thoracic']);
});
