// Verification source adapters. The core engine (worker/professional.js) never talks to a register directly: it asks
// the adapter named in data/credentials.json. Adding a regulator or credential body means adding a config entry and,
// once a supported source exists, an adapter here. The engine does not change.
//
// Adapter contract (every method optional except id, mode and version):
//   id, mode: 'manual' | 'api' | 'dataset' | 'mock', version, label
//   available(env)                          -> true when the adapter can check right now
//   lookupRegistration(env, { regulator, number })
//     -> { outcome: 'found' | 'not_found' | 'unavailable' | 'manual', source, record?: {
//          name: 'Given Family' | { given, family }, status: 'registered' | 'not_registered' | 'suspended' | 'lapsed' | 'erased',
//          current: boolean, fields: { a few plain fields only, never the raw response } } }
//   findCredential(env, { type, modules, person })
//     -> { outcome: 'found' | 'not_found' | 'unavailable' | 'manual', source, records: [{ name, organisation, modules, role,
//          registrationNumber?, expiresOn? }] }
// 'unavailable' means the source failed (timeout, 5xx): the engine keeps the current status and retries later, and
// never treats it as a lapse. 'manual' means no supported automated source exists.
//
// No adapter may scrape a public register, bypass CAPTCHA or bot protection, or call an undocumented endpoint.
// Live adapters need a written agreement or licence from the body (see 'access' in data/credentials.json).

// No supported automated source: the claim waits for an administrator.
export const manual = {
  id: 'manual', mode: 'manual', version: 'manual-v1', label: 'Manual verification by the Wavelength team',
  available: () => false,
  async lookupRegistration() { return { outcome: 'manual', source: null }; },
  async findCredential() { return { outcome: 'manual', source: null, records: [] }; },
};

// Test double. Switched on only by VERIFY_MOCK = "true" with fixture data in VERIFY_MOCK_DATA (an object in tests).
// Never set either in wrangler.jsonc: test/verification.test.mjs fails if you do. Everything it verifies is marked
// with a 'mock:' source, which the badge and directory code hide outside tests.
export const mock = {
  id: 'mock', mode: 'mock', version: 'mock-v1', label: 'Test register',
  available: (env) => env.VERIFY_MOCK === 'true' && !!env.VERIFY_MOCK_DATA,
  async lookupRegistration(env, { regulator, number }) {
    const d = env.VERIFY_MOCK_DATA || {};
    if ((d.unavailable || []).includes(regulator)) return { outcome: 'unavailable', source: `mock:${regulator}` };
    const r = ((d.registers || {})[regulator] || {})[number];
    if (!r) return { outcome: 'not_found', source: `mock:${regulator}` };
    return { outcome: 'found', source: `mock:${regulator}`, record: { name: r.name, status: r.status || 'registered', current: r.current !== false, fields: r.fields || {} } };
  },
  async findCredential(env, { type }) {
    const d = env.VERIFY_MOCK_DATA || {};
    if ((d.unavailable || []).includes(type)) return { outcome: 'unavailable', source: `mock:${type}`, records: [] };
    const list = (d.directories || {})[type];
    if (!list) return { outcome: 'manual', source: null, records: [] };
    return { outcome: list.length ? 'found' : 'not_found', source: `mock:${type}`, records: list };
  },
};

const ADAPTERS = { manual, mock };

// The adapter for a regulator or credential type config entry. The mock replaces everything in tests only.
export function adapterFor(env, entry) {
  if (mock.available(env)) return mock;
  const a = ADAPTERS[entry && entry.adapter];
  return a && a.mode !== 'mock' && (!a.available || a.available(env)) ? a : manual;
}
export const isMockSource = (s) => /^mock:/.test(String(s || ''));
