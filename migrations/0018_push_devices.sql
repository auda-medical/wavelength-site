-- Phone notifications (October 2026, 1.0.20): the devices on which a person allowed Wavelength's notifications, so a
-- sign-off or assessment request, or its outcome, can appear on their phone (worker/push.js, through Firebase Cloud
-- Messaging, which reaches iPhones through Apple's APNs). One row per device token; nothing about the person beyond
-- the account it belongs to. Removed when the person turns notifications off, signs out on that device, deletes their
-- account, or when Firebase says the token no longer exists. Additive only: no existing table changes; the old Worker
-- ignores this table. Rollback: DROP TABLE push_devices (after a fresh export).

CREATE TABLE IF NOT EXISTS push_devices (
  token TEXT PRIMARY KEY,                 -- the Firebase registration token of one app install
  learner_id INTEGER NOT NULL,            -- the account it belongs to (learners.id)
  platform TEXT NOT NULL,                 -- android | ios
  app_version TEXT,                       -- for support only, e.g. 1.0.20
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS push_devices_learner ON push_devices (learner_id);
