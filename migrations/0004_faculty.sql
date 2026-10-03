-- Faculty applications ("Teach with us" form at /faculty/join/). D1 database: wavelength-volunteers.
CREATE TABLE IF NOT EXISTS faculty_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  profession TEXT,
  specialty TEXT,
  organisation TEXT,
  registration TEXT,
  experience TEXT,
  credentials TEXT,
  applications TEXT,
  interests TEXT,
  details TEXT,
  contacted INTEGER NOT NULL DEFAULT 0,
  emailed_at TEXT,
  email_error TEXT
);
