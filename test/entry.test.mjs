// The Worker's main module may export only its default handler: Cloudflare reads every named export of the main
// module as an entrypoint, and a plain value there (a string, say) stops the Worker from starting at deploy.
import test from 'node:test';
import assert from 'node:assert/strict';

test('worker/index.js has no named exports', async () => {
  const mod = await import('../worker/index.js');
  assert.deepEqual(Object.keys(mod), ['default']);
  assert.equal(typeof mod.default.fetch, 'function');
  assert.equal(typeof mod.default.scheduled, 'function');
});
