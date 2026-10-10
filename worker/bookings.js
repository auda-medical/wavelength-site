// Course bookings (migration 0014): the authoritative record of paid places for business reporting.
//   POST /api/stripe/webhook   Stripe events, verified with STRIPE_WEBHOOK_SECRET. Off (404) until the owner adds that
//                              secret in Cloudflare and creates the webhook endpoint in Stripe: both need approval.
//   Admin (worker/business.js) records manual and invoice bookings, refunds, cancellations and attendance.
// No names or emails are stored: the customer record stays in Stripe or on the invoice. Amounts are integers in pence.
// Idempotent: each Stripe event id is processed once (stripe_events), and a Checkout Session maps to one booking
// (UNIQUE stripe_session), so a repeated or replayed webhook never double-counts revenue.
import SITE from './site-data.json';

const enc = new TextEncoder();
const TOLERANCE = 300; // seconds, as Stripe recommends
export const STATUSES = ['pending', 'paid', 'part_refunded', 'refunded', 'cancelled'];
export const PAID = ['paid', 'part_refunded', 'refunded'];
// Stripe's published standard UK card price (1.5% + 20p), used only when the real fee is unknown and marked as an estimate.
export const estimateFee = (gross) => (gross > 0 ? Math.round(gross * 0.015) + 20 : 0);

const READY = new WeakMap();
export async function bookingsReady(env) {
  if (!env || !env.DB) return false;
  const c = READY.get(env.DB);
  if (c && (c.ok || Date.now() - c.at < 60e3)) return c.ok;
  let ok = true;
  try { await env.DB.prepare('SELECT id FROM bookings LIMIT 0').all(); await env.DB.prepare('SELECT id FROM stripe_events LIMIT 0').all(); } catch { ok = false; }
  READY.set(env.DB, { ok, at: Date.now() });
  return ok;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
}
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]. The signed text is `${t}.${rawBody}`.
export async function verifyStripe(secret, header, raw, now = Date.now()) {
  const parts = String(header || '').split(',').map((x) => x.trim().split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v || '');
  if (!t || !sigs.length) return { ok: false, reason: 'header' };
  if (Math.abs(now / 1000 - t) > TOLERANCE) return { ok: false, reason: 'stale' };
  const want = await hmacHex(secret, `${t}.${raw}`);
  return sigs.some((s) => sameText(s, want)) ? { ok: true } : { ok: false, reason: 'signature' };
}
// For tests and tools: a header Stripe would send for this body.
export async function signStripe(secret, raw, t = Math.floor(Date.now() / 1000)) { return `t=${t},v1=${await hmacHex(secret, `${t}.${raw}`)}`; }

// Which course date a Checkout Session paid for: by Payment Link id (stripePaymentLink in data/courses.json), otherwise
// only when exactly one date with a Stripe link has that price. Unmatched sessions are recorded unassigned for the
// owner to assign; nothing is guessed beyond that.
export function courseFor(session, courses = SITE.courses || []) {
  const dates = courses.flatMap((c) => (c.dates || []).map((d) => ({ slug: c.slug, ...d })));
  const link = session.payment_link || '';
  const byLink = link && dates.find((d) => d.stripePaymentLink && d.stripePaymentLink === link);
  if (byLink) return { slug: byLink.slug, date: byLink.date, how: 'payment_link' };
  const paidBefore = (session.amount_total || 0) + ((session.total_details && session.total_details.amount_discount) || 0);
  const priced = dates.filter((d) => d.stripeLink && d.price != null && Math.round(d.price * 100) === paidBefore);
  if (priced.length === 1) return { slug: priced[0].slug, date: priced[0].date, how: 'price' };
  return { slug: '', date: '', how: 'unassigned' };
}
export const campaignOf = (ref) => String(ref || '').replace(/^wl[-_]/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60);

async function onSession(env, s, paid) {
  const c = courseFor(s);
  const gross = Number(s.amount_total) || 0;
  const discount = (s.total_details && Number(s.total_details.amount_discount)) || 0;
  const status = paid ? 'paid' : 'pending';
  const note = c.how === 'price' ? 'Course matched by price' : c.how === 'unassigned' ? 'Assign the course date' : '';
  await env.DB.prepare(`INSERT INTO bookings (course_slug, course_date, source, status, places, currency, gross_pence, discount_pence, fee_pence, fee_estimated, stripe_session, stripe_payment_intent, stripe_payment_link, campaign, paid_at, note)
    VALUES (?, ?, 'stripe', ?, 1, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (stripe_session) DO UPDATE SET status = CASE WHEN bookings.status IN ('refunded','part_refunded','cancelled') THEN bookings.status WHEN excluded.status = 'paid' THEN 'paid' ELSE bookings.status END,
      paid_at = COALESCE(bookings.paid_at, excluded.paid_at), stripe_payment_intent = COALESCE(bookings.stripe_payment_intent, excluded.stripe_payment_intent), updated_at = datetime('now')`)
    .bind(c.slug, c.date, status, String(s.currency || 'gbp').toLowerCase(), gross, discount, estimateFee(gross), String(s.id), s.payment_intent ? String(s.payment_intent) : null, s.payment_link ? String(s.payment_link) : null, campaignOf(s.client_reference_id), paid ? new Date().toISOString() : null, note).run();
  return paid ? 'paid' : 'pending';
}

export async function handleStripe(req, env) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Not found', { status: 404 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await bookingsReady(env))) return new Response('Not ready', { status: 503 }); // Stripe retries later
  const raw = await req.text();
  const v = await verifyStripe(secret, req.headers.get('Stripe-Signature'), raw);
  if (!v.ok) return new Response('Bad signature', { status: 400 });
  let evt;
  try { evt = JSON.parse(raw); } catch { return new Response('Bad body', { status: 400 }); }
  if (!evt || !evt.id || !evt.type) return new Response('Bad body', { status: 400 });
  const seen = await env.DB.prepare('SELECT outcome FROM stripe_events WHERE id = ?').bind(String(evt.id)).first();
  if (seen) return Response.json({ received: true, duplicate: true });
  const o = (evt.data && evt.data.object) || {};
  let outcome = 'ignored';
  if (evt.type === 'checkout.session.completed' && o.mode !== 'subscription') outcome = await onSession(env, o, o.payment_status === 'paid' || o.payment_status === 'no_payment_required');
  else if (evt.type === 'checkout.session.async_payment_succeeded') outcome = await onSession(env, o, true);
  else if (evt.type === 'checkout.session.async_payment_failed' || evt.type === 'checkout.session.expired') {
    const r = await env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE stripe_session = ? AND status = 'pending'").bind(String(o.id)).run();
    outcome = r.meta && r.meta.changes ? 'cancelled' : 'ignored';
  } else if (evt.type === 'charge.refunded' && o.payment_intent) {
    const b = await env.DB.prepare('SELECT id, gross_pence FROM bookings WHERE stripe_payment_intent = ?').bind(String(o.payment_intent)).first();
    if (b) {
      const refunded = Math.min(Number(o.amount_refunded) || 0, b.gross_pence || Number(o.amount) || 0);
      await env.DB.prepare("UPDATE bookings SET refund_pence = ?, status = ?, refunded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(refunded, refunded >= b.gross_pence ? 'refunded' : 'part_refunded', b.id).run();
      outcome = 'refund';
    } else outcome = 'refund_unmatched';
  }
  await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, outcome) VALUES (?, ?, ?)').bind(String(evt.id), String(evt.type).slice(0, 80), outcome).run();
  return Response.json({ received: true, outcome });
}

// ---------- Admin edits (owner only, through worker/business.js) ----------
const pence = (v) => { const n = Math.round(Number(String(v ?? '').replace(/[£,\s]/g, '')) * 100); return Number.isFinite(n) && n >= 0 ? n : null; };
export { pence };
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function bookingAdminPost(env, f) {
  if (!(await bookingsReady(env))) return 'Bookings need migration 0014.';
  const action = String(f.get('action') || '');
  if (action === 'booking_add') {
    const [slug, date] = String(f.get('course') || '').split('@');
    const status = STATUSES.includes(f.get('status')) ? f.get('status') : 'paid';
    const gross = pence(f.get('gross'));
    if (!slug || !dateOk(date || '') || gross == null) return 'Choose a course date and enter the amount paid.';
    const places = Math.max(1, Math.min(50, Number(f.get('places')) || 1));
    const fee = clip(f.get('fee'), 20) === '' ? null : pence(f.get('fee'));
    const source = f.get('source') === 'invoice' ? 'invoice' : 'manual';
    await env.DB.prepare('INSERT INTO bookings (course_slug, course_date, source, status, places, gross_pence, fee_pence, fee_estimated, campaign, reference, note, paid_at) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)')
      .bind(slug, date, source, status, places, gross, fee, clip(f.get('campaign'), 60).toLowerCase().replace(/[^a-z0-9_-]/g, ''), clip(f.get('reference'), 80), clip(f.get('note'), 300), PAID.includes(status) ? new Date().toISOString() : null).run();
    return 'Booking recorded.';
  }
  const id = Number(f.get('id'));
  if (!id) return '';
  if (action === 'booking_update') {
    const b = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
    if (!b) return 'Booking not found.';
    const status = STATUSES.includes(f.get('status')) ? f.get('status') : b.status;
    const refund = clip(f.get('refund'), 20) === '' ? b.refund_pence : pence(f.get('refund'));
    const fee = clip(f.get('fee'), 20) === '' ? b.fee_pence : pence(f.get('fee'));
    const att = f.get('attended') === '1' ? 1 : f.get('attended') === '0' ? 0 : null;
    const [slug, date] = String(f.get('course') || `${b.course_slug}@${b.course_date}`).split('@');
    if (refund == null || refund > b.gross_pence) return 'A refund cannot be more than the amount paid.';
    const finalStatus = status === 'cancelled' ? 'cancelled' : refund > 0 ? (refund >= b.gross_pence ? 'refunded' : 'part_refunded') : status;
    await env.DB.prepare("UPDATE bookings SET status = ?, refund_pence = ?, fee_pence = ?, fee_estimated = CASE WHEN ? THEN 0 ELSE fee_estimated END, attended = ?, course_slug = ?, course_date = ?, reference = ?, note = ?, paid_at = COALESCE(paid_at, CASE WHEN ? IN ('paid','part_refunded','refunded') THEN datetime('now') END), refunded_at = CASE WHEN ? > 0 THEN COALESCE(refunded_at, datetime('now')) ELSE refunded_at END, cancelled_at = CASE WHEN ? = 'cancelled' THEN COALESCE(cancelled_at, datetime('now')) ELSE cancelled_at END, updated_at = datetime('now') WHERE id = ?")
      .bind(finalStatus, refund, fee, fee !== b.fee_pence ? 1 : 0, att, slug || b.course_slug, dateOk(date || '') ? date : b.course_date, clip(f.get('reference') ?? b.reference, 80), clip(f.get('note') ?? b.note, 300), finalStatus, refund, finalStatus, id).run();
    return 'Booking updated.';
  }
  return '';
}
