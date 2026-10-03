-- Wavelength app: password accounts, scan logbook and supervisor sign-off. D1 database: wavelength-volunteers.
-- Learner accounts extend the Academy learners table. Images never reach the server: they stay on the learner's device.
ALTER TABLE learners ADD COLUMN password_hash TEXT;
ALTER TABLE learners ADD COLUMN profile TEXT;
ALTER TABLE learners ADD COLUMN declaration_at TEXT;
ALTER TABLE learners ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learners ADD COLUMN locked_until INTEGER;

CREATE TABLE IF NOT EXISTS logbook_entries (
  id TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  scan_type TEXT NOT NULL,
  scan_date TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS logbook_learner ON logbook_entries (learner_id, updated_at);

CREATE TABLE IF NOT EXISTS signoffs (
  id TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  token_hash TEXT,
  entry_ids TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  supervisor_name TEXT,
  supervisor_role TEXT,
  supervisor_reg TEXT,
  supervisor_email TEXT,
  accreditation TEXT,
  basis TEXT,
  comment TEXT,
  decisions TEXT,
  signature TEXT,
  signed_at TEXT
);
CREATE INDEX IF NOT EXISTS signoffs_learner ON signoffs (learner_id);
CREATE UNIQUE INDEX IF NOT EXISTS signoffs_token ON signoffs (token_hash);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
