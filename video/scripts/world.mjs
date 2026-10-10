// A local Wavelength for filming: the real Worker (worker/index.js) and the built website (dist/) over the test
// environment (node:sqlite in memory, every migration applied). Seeds one fictional world: a trainee and a supervisor
// with made-up names, a made-up 7-digit GMC number that cannot belong to a doctor (leading zeros), fictional scans and
// sign-offs. Nothing touches production. Run through scripts/capture.mjs, which starts it.
//   node --import ../test/helpers/register.mjs scripts/world.mjs [port]   (stand-alone, for exploring)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, ctx } from '../../test/helpers/env.mjs';
import worker from '../../worker/index.js';
import { supervisorsAdminPost } from '../../worker/supervisors-admin.js';
import { ukDate } from '../../worker/time.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
const ASSETS = { fetch: async (req) => {
  const u = new URL(req.url || req);
  let f; try { f = path.join(DIST, decodeURIComponent(u.pathname)); } catch { return new Response('', { status: 400 }); }
  if (f !== DIST && !f.startsWith(DIST + path.sep)) return new Response('', { status: 403 });
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  else if (!path.extname(f) && fs.existsSync(f + '/index.html')) f = f + '/index.html';
  if (!fs.existsSync(f)) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' } });
} };

export const PASSWORD = 'Filming-password-2026';
export async function startWorld(port = 8799) {
  const env = makeEnv({ ASSETS, PROFESSIONAL_VERIFY: 'true', SUPERVISOR_APPLY: 'true', SUPERVISOR_APPROVAL_REQUIRED: 'false', EMAIL_VERIFY: 'off' });
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = `http://localhost:${port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    headers.set('CF-Connecting-IP', '127.0.0.1');
    const r = await worker.fetch(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, ctx);
    const out = {};
    r.headers.forEach((v, k) => { out[k] = v; });
    // Secure cookies work on http://localhost in Chromium; keep them as the Worker sets them.
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  const base = `http://localhost:${port}`;
  const H = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: base };
  const jar = {};
  const call = async (who, p, body) => {
    const r = await fetch(base + '/api/app/' + p, { method: body ? 'POST' : 'GET', headers: { ...H, ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie'); if (set) jar[who] = set.split(';')[0];
    return r.json();
  };
  const admin = (o) => { const f = new FormData(); for (const [k, v] of Object.entries({ reviewer: 'Filming', ...o })) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, String(x))); return supervisorsAdminPost(env, f, 'wavelength', ctx); };
  const idOf = async (email) => (await env.DB.prepare('SELECT id FROM learners WHERE email = ?').bind(email).first()).id;
  const verifyEmail = (email) => env.DB.prepare("UPDATE learners SET email_status = 'verified', email_verified_at = datetime('now') WHERE email = ?").bind(email).run();

  // Supervisor: fictional consultant, verified registration, FAMUS supervisor credential confirmed from the directory
  // (listed email = verified account email), Wavelength approval for FAMUS Thoracic and RCEM modules.
  const SUP = { email: 'j.whitfield@example.org', first: 'James', last: 'Whitfield', title: 'Dr' };
  await call('sup', 'signup', { title: 'Dr', firstName: SUP.first, lastName: SUP.last, email: SUP.email, password: PASSWORD, terms: true, role: 'Consultant in Emergency Medicine', organisation: 'Riverside General Hospital' });
  await verifyEmail(SUP.email);
  await call('sup', 'profile', { declaration: true, profile: { pathways: ['rcem', 'famus'], grade: 'Consultant', onboarded: true } });
  const sid = await idOf(SUP.email);
  const reg = await call('sup', 'professional/registration', { regulator: 'gmc', number: '0000017', profession: 'Doctor', organisation: 'Riverside General Hospital' });
  await admin({ action: 'reg_gmc_check', learner: sid, sid: reg.registration.id, register_name: 'James Whitfield', number_matched: '1', registration_current: '1', licence_current: '1', restriction: 'none', checked_on: ukDate(), notes: 'Fictional filming account' });
  const cred = await call('sup', 'professional/credential', { type: 'famus-supervisor', modules: ['thoracic'] });
  await admin({ action: 'cred_directory_check', learner: sid, sid: cred.credential.id, listed: 'yes', listed_name: 'James Whitfield', listed_org: 'Riverside General Hospital', modules: ['thoracic'], listed_email: SUP.email, checked_on: ukDate(), notes: 'Fictional' });
  await admin({ action: 'appr_add', learner: sid, scope: ['famus:famus-thoracic', 'rcem:rcem-efast', 'rcem:rcem-aaa', 'rcem:rcem-els'], basis: String(cred.credential.id), capacity: 'supervisor', notes: 'Fictional filming approval' });

  // Trainee: fictional emergency medicine trainee on RCEM and FAMUS.
  const LEARNER = { email: 'maya.okafor@example.org', first: 'Maya', last: 'Okafor', title: 'Dr' };
  await call('learner', 'signup', { title: 'Dr', firstName: LEARNER.first, lastName: LEARNER.last, email: LEARNER.email, password: PASSWORD, terms: true, role: 'ST3 Emergency Medicine', organisation: 'Riverside General Hospital' });
  await verifyEmail(LEARNER.email);
  await call('learner', 'profile', { declaration: true, profile: { pathways: ['rcem', 'famus'], grade: 'ST3', onboarded: true } });
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const plan = [['efast', 'direct'], ['aaa', 'direct'], ['lung', 'direct'], ['efast', 'indirect'], ['lung', 'indirect'], ['aaa', 'direct'], ['els', 'direct'], ['lung', 'direct'], ['efast', 'direct'], ['aaa', 'indirect'], ['lung', 'direct'], ['els', 'direct'], ['efast', 'direct'], ['lung', 'indirect']];
  const entries = plan.map(([type, supervision], i) => ({ id: `film${String(i).padStart(2, '0')}entry`, type, date: day(3 + i * 3), supervision, setting: 'Emergency department', indication: type === 'aaa' ? 'Abdominal pain, query AAA' : type === 'lung' ? 'Breathlessness' : type === 'els' ? 'Peri-arrest' : 'Blunt trauma', overall: i % 5 === 3 ? 'Abnormal' : 'Normal', quality: 'Good', interpretation: 'Concordant with formal imaging', createdAt: Date.now() - i * 1000, updatedAt: 0 }));
  await call('learner', 'sync', { entries });
  await call('learner', 'supervisors/add', { email: SUP.email });
  const inv = (await call('sup', 'supervisors')).invites[0];
  await call('sup', 'supervisors/accept', { id: inv.id });
  // Earlier sign-offs from the dashboard (the scans show green) and one structured assessment.
  for (const batch of [['film05entry', 'film06entry', 'film07entry'], ['film08entry', 'film09entry', 'film10entry', 'film11entry', 'film12entry', 'film13entry']]) {
    const req = await call('learner', 'signoff/request', { entryIds: batch, supervisorLink: inv.id });
    await call('sup', 'supervise/signoff', { code: req.code, name: 'Dr James Whitfield', role: 'Consultant in Emergency Medicine', basis: 'both', confirm: true, signature: 'data:image/png;base64,iVBORw0KGgo=', decisions: Object.fromEntries(batch.map((id) => [id, 'confirmed'])), ratings: Object.fromEntries(batch.map((id) => [id, { quality: 'g', accuracy: 'g' }])) });
  }
  return { env, server, base, call, jar, admin, inv, SUP, LEARNER, idOf };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const w = await startWorld(Number(process.argv[2]) || 8799);
  console.log(`Filming world on ${w.base}. Learner ${w.LEARNER.email}, supervisor ${w.SUP.email}, password ${PASSWORD}`);
}
