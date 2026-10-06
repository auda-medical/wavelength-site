// Time helpers. Day-based rules (approval review dates, renewal reminders, grace periods) are UK days
// (Europe/London), so an approval "until 1 June" lasts until the end of 1 June in the UK, across clock changes.
// Stored timestamps come in three shapes: SQLite datetime('now') ("YYYY-MM-DD HH:MM:SS", UTC, no zone marker),
// ISO 8601 with Z, and epoch milliseconds. parseTs() reads all three. New columns store ISO 8601 UTC with Z.

const UK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const nowIso = () => new Date().toISOString();

// Milliseconds since the epoch, or NaN.
export function parseTs(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (/^\d{10,}$/.test(s)) return Number(s);
  if (ISO_DAY.test(s)) return Date.parse(s + 'T00:00:00Z');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z');
  return Date.parse(s);
}

// The UK calendar date (YYYY-MM-DD) of a moment. Defaults to now.
export function ukDate(at = Date.now()) {
  const t = typeof at === 'number' ? at : parseTs(at);
  return UK.format(new Date(Number.isFinite(t) ? t : Date.now()));
}

// Calendar arithmetic on YYYY-MM-DD dates, done at noon UTC so no clock change can move the day.
export function addDays(day, n) {
  if (!ISO_DAY.test(String(day || ''))) return null;
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(day, n) {
  if (!ISO_DAY.test(String(day || ''))) return null;
  const [y, m, dd] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(dd, last));
  return target.toISOString().slice(0, 10);
}
// Whole days from a to b (both YYYY-MM-DD). Positive when b is later.
export function daysBetween(a, b) {
  if (!ISO_DAY.test(String(a || '')) || !ISO_DAY.test(String(b || ''))) return NaN;
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
}
// True while a "valid until" UK date has not passed. A missing date never expires.
export const inDate = (until, today = ukDate()) => !until || String(until) >= today;

// Business days (Monday to Friday) from a timestamp to now, for the admin queue's waiting colours.
export function businessDaysSince(ts, now = Date.now()) {
  const start = parseTs(ts);
  if (!Number.isFinite(start)) return 0;
  let day = ukDate(start), n = 0;
  const today = ukDate(now);
  while (day < today) {
    day = addDays(day, 1);
    const wd = new Date(day + 'T12:00:00Z').getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

// "6 October 2026" for emails and admin pages.
const LONG = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
export const longDate = (day) => (ISO_DAY.test(String(day || '')) ? LONG.format(new Date(day + 'T12:00:00Z')) : '');
