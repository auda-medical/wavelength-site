-- Wavelength Academy (D1 database: wavelength-volunteers).
CREATE TABLE IF NOT EXISTS learners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT,
  email TEXT NOT NULL UNIQUE,
  title TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT,
  organisation TEXT,
  newsletter INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  learner_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  score INTEGER NOT NULL,
  right_count INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  answers TEXT
);
CREATE INDEX IF NOT EXISTS attempts_learner ON attempts (learner_id, module);
CREATE TABLE IF NOT EXISTS certificates (
  code TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  module_title TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  cpd_hours REAL NOT NULL,
  issued_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  emailed_at TEXT,
  email_error TEXT,
  UNIQUE (learner_id, module)
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  learner_id INTEGER,
  module TEXT NOT NULL,
  useful INTEGER,
  practice INTEGER,
  comment TEXT
);
