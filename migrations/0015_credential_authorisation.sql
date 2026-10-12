-- Pathway-specific supervision authority and directory-assisted credential verification (October 2026, commercial
-- development, Phase B). D1 database: wavelength-volunteers. NOT applied to production: needs the owner's approval.
-- Design: docs/commercial-2026/03-credential-verification.md. Policy: data/supervision-policy.json.

-- The capacity in which Wavelength approves someone for a pathway module: supervisor, trainer, mentor or
-- local_supervisor. Existing approvals were all granted as supervisors, so the default keeps their meaning.
ALTER TABLE supervisor_approvals ADD COLUMN capacity TEXT NOT NULL DEFAULT 'supervisor';

-- How identity was confirmed independently of a name match (worker/verification/directory-review.js IDENTITY), the
-- minimal fields an administrator recorded from the body's official directory (never the page itself), and when.
ALTER TABLE credentials ADD COLUMN identity_method TEXT;
ALTER TABLE credentials ADD COLUMN directory_fields TEXT;
ALTER TABLE credentials ADD COLUMN directory_checked_at TEXT;

-- Single-use confirmations sent to the email address an official directory lists. The address is stored only as a
-- hash and a masked hint. outcome: confirmed, disputed, superseded (a newer one was sent), or NULL while open.
CREATE TABLE IF NOT EXISTS credential_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id INTEGER NOT NULL,
  learner_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL,
  email_hint TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  outcome TEXT,
  actor TEXT
);
CREATE INDEX IF NOT EXISTS credential_confirmations_cred ON credential_confirmations (credential_id, sent_at);

-- Asynchronous review states on sign-off requests (Phase E): a supervisor may accept a request (under review) or
-- decline it with a reason, which returns it to the learner. Signed requests keep their per-scan decisions
-- (confirmed or queried = revision requested).
ALTER TABLE signoffs ADD COLUMN accepted_at TEXT;
ALTER TABLE signoffs ADD COLUMN declined_at TEXT;
ALTER TABLE signoffs ADD COLUMN decline_reason TEXT;
ALTER TABLE assessments ADD COLUMN accepted_at TEXT;
ALTER TABLE assessments ADD COLUMN declined_at TEXT;
ALTER TABLE assessments ADD COLUMN decline_reason TEXT;

-- Directory preferences a listed supervisor chooses (Phase E): whether they accept new requests through Wavelength.
ALTER TABLE directory_profiles ADD COLUMN accepting_requests INTEGER NOT NULL DEFAULT 1;
