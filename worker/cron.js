// Which job each Worker cron runs. Every cron in wrangler.jsonc `triggers` maps to exactly one job, and an unknown cron
// runs nothing, so the Tuesday newsletter schedule never runs supervisor work and the daily supervisor job never sends a
// newsletter. Kept out of worker/index.js because the main module may export only its default handler.
//   15 5 * * *   supervisor-daily: dailyLifecycle (expiry, grace, reminders, lapses, evidence purge, rechecks, email
//                retries, retention). 05:15 UTC is 06:15 UK time in summer and 05:15 in winter.
//   30 6 * * 2   newsletter: scheduledNewsletter. Two Tuesday crons cover 7:30am UK time in summer (06:30 UTC) and in
//   30 7 * * 2   winter (07:30 UTC); scheduledNewsletter itself sends only when it is 7am to 8am in London.
export const DAILY_CRON = '15 5 * * *';
export const NEWSLETTER_CRONS = Object.freeze(['30 6 * * 2', '30 7 * * 2']);

export function jobFor(cron) {
  if (cron === DAILY_CRON) return 'supervisor-daily';
  if (NEWSLETTER_CRONS.includes(cron)) return 'newsletter';
  return null;
}

// jobs: { dailyLifecycle, scheduledNewsletter }, passed in so tests can count the calls.
export function runScheduled(event, env, ctx, jobs) {
  const cron = event && event.cron;
  const job = jobFor(cron);
  if (!job) { console.warn('scheduled: no job for cron', cron); return null; }
  if (!env.DB) return null;
  const run = job === 'supervisor-daily' ? jobs.dailyLifecycle : jobs.scheduledNewsletter;
  ctx.waitUntil(Promise.resolve().then(() => run(env)).catch((e) => console.warn(job, e && e.message)));
  return job;
}
