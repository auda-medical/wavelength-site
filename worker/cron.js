// Which job each Worker cron runs. Every cron in wrangler.jsonc `triggers` maps to exactly one job, and an unknown cron
// runs nothing, so the Tuesday newsletter schedule never runs supervisor work and the daily supervisor job never sends a
// newsletter. Kept out of worker/index.js because the main module may export only its default handler.
//   15 5 * * *   supervisor-daily: dailyLifecycle (expiry, grace, reminders, lapses, evidence purge, rechecks, email
//                retries, retention). 05:15 UTC is 06:15 UK time in summer and 05:15 in winter.
//   30 6-17 * * TUE  newsletter: scheduledNewsletter, every hour on Tuesdays from 06:30 to 17:30 UTC. It sends from 7am
//                London time (07:30 BST in summer, 07:30 GMT in winter) and, until that week's issue has gone out,
//                tries again at every later run. Until 3 Nov 2026 two crons (06:30 and 07:30) gave one chance a week.
//                Weekdays are always named: Cloudflare numbers them 1 = Sunday to 7 = Saturday, so the "2" used until
//                14 Oct 2026 meant MONDAY and the first issue (13 Oct) was never sent. test/cron.test.mjs rejects numbers.
//   4,14,24,34,44,54 * * * *  source-monitor: monitorRun (worker/monitor/run.js). Every ten minutes, one due source
//                each time (144 chances a day for about 40 sources, room for retries and missed runs), so every monitored source is checked once a day within the free
//                plan's 10 ms CPU per invocation.
export const DAILY_CRON = '15 5 * * *';
export const NEWSLETTER_CRONS = Object.freeze(['30 6-17 * * TUE']);
export const MONITOR_CRON = '4,14,24,34,44,54 * * * *';

// The cron string as Cloudflare hands it back, compared without regard to case or spacing (TUE, Tue, tue).
const cronKey = (c) => (typeof c === 'string' ? c.trim().replace(/\s+/g, ' ').toUpperCase() : '');
export function jobFor(cron) {
  if (cron === DAILY_CRON) return 'supervisor-daily';
  if (cron && NEWSLETTER_CRONS.includes(cronKey(cron))) return 'newsletter';
  if (cron === MONITOR_CRON) return 'source-monitor';
  return null;
}

// jobs: { dailyLifecycle, scheduledNewsletter, monitorRun }, passed in so tests can count the calls.
export function runScheduled(event, env, ctx, jobs) {
  const cron = event && event.cron;
  const job = jobFor(cron);
  if (!job) { console.warn('scheduled: no job for cron', cron); return null; }
  if (!env.DB) return null;
  if (job === 'source-monitor' && !jobs.monitorRun) return null;
  const run = job === 'supervisor-daily' ? jobs.dailyLifecycle : job === 'newsletter' ? jobs.scheduledNewsletter : (e) => jobs.monitorRun(e, ctx, { trigger: 'cron' });
  ctx.waitUntil(Promise.resolve().then(() => run(env)).catch((e) => console.warn(job, e && e.message)));
  return job;
}
