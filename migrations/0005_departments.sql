-- Department training enquiries (form at /training/). D1 database: wavelength-volunteers.
CREATE TABLE IF NOT EXISTS department_enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  organisation TEXT NOT NULL,
  setting TEXT,
  training TEXT,
  topics TEXT,
  group_size TEXT,
  timing TEXT,
  details TEXT,
  contacted INTEGER NOT NULL DEFAULT 0,
  emailed_at TEXT,
  email_error TEXT
);
