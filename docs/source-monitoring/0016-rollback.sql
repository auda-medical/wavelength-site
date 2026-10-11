-- Rollback of migrations/0016_source_monitoring.sql (source monitoring), for use ONLY after the Worker has been
-- returned to a version without source monitoring, and only if the tables themselves must go. Reverting the Worker
-- alone is enough to stop all monitoring: earlier Workers never read or write these tables, so they can stay.
-- Drops only the seven tables 0016 created (their indexes go with them) and the two settings rows the monitor wrote.
-- Nothing else is touched: learners, verification records, applications and every other table are left as they are.
-- Rehearsed against the production schema in test/monitor-migration.test.mjs.
-- Before running: export the database (npx wrangler d1 export wavelength-volunteers --remote --output <file>.sql)
-- and note a Time Travel bookmark (npx wrangler d1 time-travel info wavelength-volunteers).
DROP TABLE IF EXISTS directory_optouts;
DROP TABLE IF EXISTS directory_links;
DROP TABLE IF EXISTS directory_events;
DROP TABLE IF EXISTS directory_snapshots;
DROP TABLE IF EXISTS monitor_changes;
DROP TABLE IF EXISTS monitor_runs;
DROP TABLE IF EXISTS monitor_sources;
DELETE FROM settings WHERE key IN ('monitor_sources_version', 'monitor_retention_day');
