// 19 Nov 2026 (owner, D-118): automatic, end-to-end encrypted backup of photos and clips.
//
// A learner removed the home screen copy of Wavelength and lost the clips of a signed-off scan: the written record
// synced, but photos and clips never left the phone. Now each photo or clip is encrypted on the phone (AES-GCM, with
// the learner's 256-bit backup key) and uploaded as soon as its scan has synced. This Worker stores only ciphertext in
// R2 (binding MEDIA) and cannot open it. The backup key is kept here only wrapped with a key the phone derives from the
// learner's password (PBKDF2-SHA256), so a new phone that signs in can unwrap it and download everything again.
//
//   GET  /api/app/media/key            the wrapped backup key (or none yet)
//   POST /api/app/media/key            store a wrapping {salt, iter, wrapped, kid, password}; the replaced one is kept
//                                      as prev_*; reset: true (a new key) first removes every backup the old key made
//   POST /api/app/media/check          is this the account's password? (before a phone wraps the key with it)
//   GET  /api/app/media/list           every backed-up photo or clip: id, scan, fingerprint, size
//   POST /api/app/media?id=&entry=&sha=&kid=  upload one (ciphertext body): only for a photo the synced scan lists,
//                                      encrypted with the current key (kid)
//   GET  /api/app/media?id=            download one (ciphertext)
//
// A photo removed from its scan, a deleted scan and a deleted account take their backups with them (dropForEntry,
// dropRemoved, dropAccount, called from worker/app.js). Off unless MEDIA_BACKUP is 'true' and the MEDIA bucket exists.
import { json, clip, checkPassword } from './app-util.js';

export const MEDIA_MAX = 32 * 1048576;               // one encrypted photo or clip, with its preview and edit base
const QUOTA = (env) => (Number(env.MEDIA_QUOTA_MB) || 2048) * 1048576; // per learner
const MID = /^[A-Za-z0-9_-]{6,40}$/;
const SHA = /^[0-9a-f]{64}$/;
const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const KID = /^[0-9a-f]{16}$/;

export const mediaOn = (env) => env.MEDIA_BACKUP === 'true' && !!env.MEDIA && !!env.DB;
const objKey = (learnerId, id) => `m/${learnerId}/${id}`;

// Migration 0020 applied? Remembered once true (it is never taken back), so a sync does not ask for every scan.
async function ready(env) {
  if (env.__mediaReady) return true;
  try { await env.DB.prepare('SELECT 1 FROM media_backups LIMIT 1').first(); env.__mediaReady = true; return true; } catch { return false; }
}

export async function handleMedia(env, l, req, url, p) {
  if (p !== 'media' && !p.startsWith('media/')) return null;
  if (!mediaOn(env) || !(await ready(env))) return json({ ok: false, off: true, error: 'Photo backup is not switched on yet.' }, 404);
  const get = req.method === 'GET';
  if (p === 'media/key') return get ? keyGet(env, l) : keyPut(env, l, req);
  if (p === 'media/check' && !get) return passwordCheck(l, req);
  if (p === 'media/list' && get) return list(env, l);
  if (p === 'media') return get ? download(env, l, url) : upload(env, l, req, url);
  return json({ ok: false }, 404);
}

async function keyGet(env, l) {
  const k = await env.DB.prepare('SELECT salt, iter, wrapped, kid, prev_salt, prev_iter, prev_wrapped FROM media_keys WHERE learner_id = ?').bind(l.id).first();
  if (!k) return json({ ok: true, key: null });
  return json({ ok: true, key: { salt: k.salt, iter: k.iter, wrapped: k.wrapped, kid: k.kid }, prev: k.prev_wrapped ? { salt: k.prev_salt, iter: k.prev_iter, wrapped: k.prev_wrapped } : null }, 200, { 'Cache-Control': 'no-store' });
}

async function passwordCheck(l, req) {
  let d; try { d = await req.json(); } catch { d = null; }
  if (!d || !(await checkPassword(String(d.password || ''), l.password_hash))) return json({ ok: false, error: 'Your password is not right.' }, 400);
  return json({ ok: true });
}

async function keyPut(env, l, req) {
  let d; try { d = await req.json(); } catch { d = null; }
  const salt = clip(d && d.salt, 64), wrapped = clip(d && d.wrapped, 200), iter = Number(d && d.iter), kid = String((d && d.kid) || '');
  if (!B64.test(salt) || !B64.test(wrapped) || !KID.test(kid) || !Number.isInteger(iter) || iter < 100000 || iter > 5000000) return json({ ok: false, error: 'That backup key is not valid.' }, 400);
  // The key is wrapped with the password the phone was given: it must be this account's password, or no other phone
  // could ever unwrap it.
  if (!(await checkPassword(String(d.password || ''), l.password_hash))) return json({ ok: false, error: 'Your password is not right.' }, 400);
  const cur = await env.DB.prepare('SELECT kid FROM media_keys WHERE learner_id = ?').bind(l.id).first();
  // A different key replaces the current one only when the phone says so (Start a new backup): the backups the old
  // key made could no longer be opened, so they are removed and every phone uploads what it holds again.
  if (cur && cur.kid !== kid) {
    if (d.reset !== true) return json({ ok: false, rekey: true, error: 'This phone holds an older backup key.' }, 409);
    await dropMedia(env, l.id);
  }
  const now = Date.now();
  // The wrapping being replaced is kept once (prev_*): the same backup key under the old password.
  await env.DB.prepare(`INSERT INTO media_keys (learner_id, salt, iter, wrapped, kid, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(learner_id) DO UPDATE SET prev_salt = CASE WHEN media_keys.wrapped = excluded.wrapped THEN media_keys.prev_salt ELSE media_keys.salt END,
      prev_iter = CASE WHEN media_keys.wrapped = excluded.wrapped THEN media_keys.prev_iter ELSE media_keys.iter END,
      prev_wrapped = CASE WHEN media_keys.wrapped = excluded.wrapped THEN media_keys.prev_wrapped ELSE media_keys.wrapped END,
      salt = excluded.salt, iter = excluded.iter, wrapped = excluded.wrapped, kid = excluded.kid, updated_at = excluded.updated_at`).bind(l.id, salt, iter, wrapped, kid, now).run();
  return json({ ok: true });
}

async function list(env, l) {
  const { results = [] } = await env.DB.prepare('SELECT media_id AS id, entry_id AS entry, sha256 AS sha, bytes FROM media_backups WHERE learner_id = ? ORDER BY created_at').bind(l.id).all();
  const used = results.reduce((n, r) => n + (r.bytes || 0), 0);
  return json({ ok: true, items: results, used, quota: QUOTA(env) }, 200, { 'Cache-Control': 'no-store' });
}

async function upload(env, l, req, url) {
  const id = clip(url.searchParams.get('id'), 40), entry = clip(url.searchParams.get('entry'), 40), sha = String(url.searchParams.get('sha') || '').toLowerCase();
  if (!MID.test(id) || !MID.test(entry) || !SHA.test(sha)) return json({ ok: false, error: 'That photo is not valid.' }, 400);
  const key = await env.DB.prepare('SELECT kid FROM media_keys WHERE learner_id = ?').bind(l.id).first();
  if (!key || key.kid !== url.searchParams.get('kid')) return json({ ok: false, rekey: true, error: 'This phone holds an older backup key.' }, 409);
  // Only a photo or clip that the synced scan lists, so nothing is stored that the logbook does not point to.
  const row = await env.DB.prepare('SELECT data FROM logbook_entries WHERE id = ? AND learner_id = ? AND deleted = 0').bind(entry, l.id).first();
  if (!row) return json({ ok: false, retry: true, error: 'The scan has not synced yet.' }, 409);
  let images = []; try { images = JSON.parse(row.data || '{}').images || []; } catch { images = []; }
  if (!images.some((i) => i && i.id === id)) return json({ ok: false, error: 'That photo is not part of this scan.' }, 409);
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MEDIA_MAX) return json({ ok: false, error: 'This photo or clip is too large to back up.' }, 413);
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 29 || buf.byteLength > MEDIA_MAX) return json({ ok: false, error: 'This photo or clip is too large to back up, or empty.' }, 413);
  const had = await env.DB.prepare('SELECT bytes FROM media_backups WHERE learner_id = ? AND media_id = ?').bind(l.id, id).first();
  const used = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM media_backups WHERE learner_id = ?').bind(l.id).first('n');
  if (used - (had ? had.bytes : 0) + buf.byteLength > QUOTA(env)) return json({ ok: false, full: true, error: 'Your photo backup space is full. Export older scans with their images, then delete them from Wavelength to make room.' }, 413);
  await env.MEDIA.put(objKey(l.id, id), buf);
  await env.DB.prepare(`INSERT INTO media_backups (learner_id, media_id, entry_id, sha256, bytes, created_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(learner_id, media_id) DO UPDATE SET entry_id = excluded.entry_id, sha256 = excluded.sha256, bytes = excluded.bytes, created_at = excluded.created_at`).bind(l.id, id, entry, sha, buf.byteLength, Date.now()).run();
  return json({ ok: true });
}

async function download(env, l, url) {
  const id = clip(url.searchParams.get('id'), 40);
  if (!MID.test(id)) return json({ ok: false }, 400);
  const row = await env.DB.prepare('SELECT 1 AS y FROM media_backups WHERE learner_id = ? AND media_id = ?').bind(l.id, id).first();
  const obj = row ? await env.MEDIA.get(objKey(l.id, id)) : null;
  if (!obj) return json({ ok: false, error: 'Not backed up.' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

async function drop(env, learnerId, ids) {
  if (!ids.length) return;
  await Promise.all(ids.map((id) => env.MEDIA.delete(objKey(learnerId, id)).catch(() => null)));
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    await env.DB.prepare(`DELETE FROM media_backups WHERE learner_id = ? AND media_id IN (${part.map(() => '?').join(',')})`).bind(learnerId, ...part).run();
  }
}

// A scan was deleted: its photos and clips go too.
export async function dropForEntry(env, learnerId, entryId) {
  if (!env.MEDIA || !(await ready(env))) return;
  const { results = [] } = await env.DB.prepare('SELECT media_id FROM media_backups WHERE learner_id = ? AND entry_id = ?').bind(learnerId, entryId).all();
  await drop(env, learnerId, results.map((r) => r.media_id));
}

// A scan was saved: any backed-up photo it no longer lists was removed from it.
export async function dropRemoved(env, learnerId, entryId, images) {
  if (!env.MEDIA || !(await ready(env))) return;
  const keep = new Set((images || []).map((i) => i && i.id));
  const { results = [] } = await env.DB.prepare('SELECT media_id FROM media_backups WHERE learner_id = ? AND entry_id = ?').bind(learnerId, entryId).all();
  await drop(env, learnerId, results.map((r) => r.media_id).filter((id) => !keep.has(id)));
}

// Every backup of an account (a new key, or the account deleted), including anything stored but never recorded.
async function dropMedia(env, learnerId) {
  const { results = [] } = await env.DB.prepare('SELECT media_id FROM media_backups WHERE learner_id = ?').bind(learnerId).all();
  await drop(env, learnerId, results.map((r) => r.media_id));
  // Anything stored but never recorded (an upload cut off between the two writes).
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: `m/${learnerId}/`, cursor });
    await Promise.all((page.objects || []).map((o) => env.MEDIA.delete(o.key)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

// The account was deleted: every backup and the wrapped key.
export async function dropAccount(env, learnerId) {
  if (!env.MEDIA || !(await ready(env))) return;
  await dropMedia(env, learnerId);
  await env.DB.prepare('DELETE FROM media_keys WHERE learner_id = ?').bind(learnerId).run();
}
