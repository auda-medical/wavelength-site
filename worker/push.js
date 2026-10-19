// Phone notifications (1.0.20, October 2026): a sign-off or assessment request, or its outcome, appears on the phone of
// the person concerned, as well as by email (alerts.js). Sent through Firebase Cloud Messaging (HTTP v1), which also
// reaches iPhones through Apple's APNs (the APNs key is held by Firebase, not here).
//
// Switched off unless PUSH_NOTIFY is 'true' and the secret FCM_SERVICE_ACCOUNT (the Firebase service account JSON) is
// set: until then every call does nothing. What a notification carries: a title and one line (names and counts only,
// never findings, images or reasons) and the logbook screen to open. The device tokens (push_devices, migration 0018)
// are deleted when Firebase reports them gone, when the person turns notifications off or signs out on that device,
// and when the account is deleted. A notification never breaks the request that caused it: failures are swallowed.

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s) => b64url(new TextEncoder().encode(s));

export function pushOn(env) {
  return env.PUSH_NOTIFY === 'true' && !!env.FCM_SERVICE_ACCOUNT;
}
// Migration 0018 applied? Until then registering does nothing and account deletion skips the table.
export async function pushReady(env) {
  try { await env.DB.prepare('SELECT token FROM push_devices LIMIT 0').all(); return true; } catch { return false; }
}
function account(env) {
  try { const a = JSON.parse(env.FCM_SERVICE_ACCOUNT); return a && a.client_email && a.private_key && a.project_id ? a : null; } catch { return null; }
}

// An OAuth access token for FCM, from a JWT signed with the service account key (RS256). Cached for this isolate.
let cached = { token: '', exp: 0, who: '' };
async function accessToken(env, now = Date.now()) {
  const a = account(env);
  if (!a) return null;
  if (cached.token && cached.who === a.client_email && cached.exp - 60e3 > now) return cached.token;
  const iat = Math.floor(now / 1000);
  const head = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlText(JSON.stringify({ iss: a.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const pem = a.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${b64url(sig)}` });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) return null;
  cached = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000, who: a.client_email };
  return cached.token;
}

// The one line each notice shows on a phone. Names and counts only.
export function pushText(kind, d) {
  const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
  const sv = d.lid ? `/supervise/${Number(d.lid)}` : '/supervise'; // the learner's page, as from Home (owner, 20 Oct 2026)
  const T = {
    req_signoff: ['Sign-off request', `${d.learner} sent you ${d.count === 1 ? 'a scan' : n(d.count, 'scan')} to sign off.`, sv],
    req_assess: ['Assessment request', `${d.learner} asked you to complete an assessment.`, sv],
    rem_signoff: ['Still waiting for you', `${d.learner} is waiting for your sign-off.`, sv],
    rem_assess: ['Still waiting for you', `${d.learner} is waiting for an assessment.`, sv],
    req_resent: ['Sent back to you', `${d.learner} added what you asked for.`, sv],
    as_signed: ['Assessment signed', `${d.supervisor} signed your ${String(d.kind || 'assessment').toLowerCase()}.`, '/assess'],
    req_declined: ['Request declined', `${d.supervisor} could not take your ${d.what}. Open the app to read why.`, `/${d.where || 'signoff'}`],
    req_more: ['More information requested', `${d.supervisor} asked for more before signing.`, `/${d.what === 'as' ? 'assess' : 'signoff'}`],
    so_done: [d.queried ? 'Scan queried' : 'Scans signed off', d.queried ? `${d.supervisor} queried ${d.queried === 1 ? 'a scan' : n(d.queried, 'scan')}.` : `${d.supervisor} signed off ${d.count === 1 ? 'a scan' : n(d.count, 'scan')}.`, d.queried ? '/log?s=todo' : '/log?s=signed'],
  };
  const t = T[kind];
  return t ? { title: t[0], body: t[1], url: `/app/#${t[2]}` } : null;
}

// Sends one notice to every device of a person. Returns the number delivered.
export async function pushPerson(env, personId, kind, data) {
  try {
    if (!pushOn(env) || !personId || !(await pushReady(env))) return 0;
    const msg = pushText(kind, data || {});
    if (!msg) return 0;
    const p = await env.DB.prepare('SELECT profile FROM learners WHERE id = ?').bind(personId).first();
    let prof = {}; try { prof = JSON.parse((p && p.profile) || '{}') || {}; } catch { prof = {}; }
    if (prof.notifyPush === false) return 0;
    const { results: devices = [] } = await env.DB.prepare('SELECT token, platform FROM push_devices WHERE learner_id = ? ORDER BY last_seen_at DESC LIMIT 10').bind(personId).all();
    if (!devices.length) return 0;
    const at = await accessToken(env);
    if (!at) return 0;
    const project = account(env).project_id;
    let sent = 0;
    for (const dv of devices) {
      const body = { message: {
        token: dv.token,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url, kind },
        android: { priority: 'HIGH', notification: { channel_id: 'requests', icon: 'ic_stat_wavelength', color: '#0A1526' } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      } };
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`, { method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      if (res && res.ok) { sent++; continue; }
      // A token Firebase no longer knows (app removed, data cleared): forget it.
      const err = res ? await res.json().catch(() => ({})) : {};
      const code = JSON.stringify(err).match(/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/);
      if (res && (res.status === 404 || (res.status === 400 && code))) await env.DB.prepare('DELETE FROM push_devices WHERE token = ?').bind(dv.token).run();
    }
    return sent;
  } catch { return 0; }
}

// POST push/register { token, platform, version }: this device may receive notifications for this account.
export async function registerDevice(env, l, d) {
  if (!(await pushReady(env))) return { ok: false, error: 'Phone notifications are not available yet.' };
  const token = String((d && d.token) || '').trim();
  const platform = d && (d.platform === 'ios' || d.platform === 'android') ? d.platform : null;
  if (!token || token.length > 4096 || !/^[A-Za-z0-9_:.\-]+$/.test(token) || !platform) return { ok: false, error: 'Not a notification token.' };
  // One account per device: a token moves to whoever signed in on that phone last.
  await env.DB.prepare("INSERT INTO push_devices (token, learner_id, platform, app_version) VALUES (?,?,?,?) ON CONFLICT(token) DO UPDATE SET learner_id = excluded.learner_id, platform = excluded.platform, app_version = excluded.app_version, last_seen_at = datetime('now')")
    .bind(token, l.id, platform, String((d && d.version) || '').slice(0, 20) || null).run();
  return { ok: true };
}
// POST push/unregister { token }: notifications off on this device, or signing out.
export async function unregisterDevice(env, l, d) {
  if (!(await pushReady(env))) return { ok: true };
  const token = String((d && d.token) || '').trim();
  if (token) await env.DB.prepare('DELETE FROM push_devices WHERE token = ? AND learner_id = ?').bind(token, l.id).run();
  return { ok: true };
}
