-- Wavelength app: structured assessments (AS- codes), supervisor links (supervisor dashboard), and per-scan
-- quality ratings in sign-offs. D1 database: wavelength-volunteers.

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  pathway TEXT NOT NULL,
  module TEXT NOT NULL,
  kind TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  outcome TEXT,
  assessed_on TEXT,
  entry_ids TEXT NOT NULL DEFAULT '[]',
  snapshot TEXT NOT NULL DEFAULT '[]',
  data TEXT NOT NULL DEFAULT '{}',
  token_hash TEXT,
  expires_at INTEGER,
  supervisor_id INTEGER,
  supervisor_name TEXT,
  supervisor_role TEXT,
  supervisor_reg TEXT,
  supervisor_email TEXT,
  accreditation TEXT,
  signature TEXT,
  signed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS assessments_learner ON assessments (learner_id, status);
CREATE INDEX IF NOT EXISTS assessments_supervisor ON assessments (supervisor_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS assessments_token ON assessments (token_hash);

CREATE TABLE IF NOT EXISTS supervisor_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  supervisor_email TEXT NOT NULL,
  supervisor_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  ended_at TEXT,
  UNIQUE (learner_id, supervisor_email)
);
CREATE INDEX IF NOT EXISTS supervisor_links_sup ON supervisor_links (supervisor_id, status);
CREATE INDEX IF NOT EXISTS supervisor_links_email ON supervisor_links (supervisor_email, status);

ALTER TABLE signoffs ADD COLUMN supervisor_id INTEGER;
ALTER TABLE signoffs ADD COLUMN ratings TEXT;
CREATE INDEX IF NOT EXISTS signoffs_supervisor ON signoffs (supervisor_id, status);
