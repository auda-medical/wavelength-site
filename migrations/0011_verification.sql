-- Verified professional and supervisor network (docs/verification-architecture.md). D1 database: wavelength-volunteers.
-- Additive only: new tables and new nullable or defaulted columns. No existing row loses data.
-- NOT applied to production. Apply with a recorded Time Travel recovery point, then merge.
-- The Worker tolerates this migration being absent: email, sign-off and assessment flows fall back to the old behaviour,
-- and the professional verification endpoints answer "not available yet".

-- 1. Email ownership. Every existing account becomes 'legacy_unverified' (keeps full access, is asked to verify).
-- New accounts are written as 'unverified' by the Worker and become 'verified' when a link is used.
ALTER TABLE learners ADD COLUMN email_status TEXT NOT NULL DEFAULT 'legacy_unverified';
ALTER TABLE learners ADD COLUMN email_verified_at TEXT;

-- Single-use email tokens. Only a SHA-256 hash of the token is stored. purpose: verify (mark the email verified),
-- claim (an Academy-only learner sets their first app password; pending holds the password hash),
-- signin (an Academy-only learner logs in by email link; pending holds the registration details they typed).
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  pending TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS email_tokens_learner ON email_tokens (learner_id, purpose, created_at);

-- Supervisor invitations carry their own single-use token, so accepting one also proves the invited email.
ALTER TABLE supervisor_links ADD COLUMN invite_hash TEXT;
ALTER TABLE supervisor_links ADD COLUMN invite_expires INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS supervisor_links_invite ON supervisor_links (invite_hash);

-- 2. Professional registrations (regulator-neutral). One row per regulator per person. claimed_* is what the person
-- typed; register_* is the minimum the authoritative source returned (never the raw response).
CREATE TABLE IF NOT EXISTS professional_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  regulator TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  profession TEXT,
  claimed_name TEXT NOT NULL,
  organisation TEXT,
  role TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  register_name TEXT,
  register_status TEXT,
  register_fields TEXT,
  verification_source TEXT,
  verification_method TEXT,
  match_method TEXT,
  match_version TEXT,
  match_result TEXT,
  verified_at TEXT,
  last_checked_at TEXT,
  next_check_at INTEGER,
  failure_state TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS prof_reg_learner ON professional_registrations (learner_id, active);
CREATE INDEX IF NOT EXISTS prof_reg_due ON professional_registrations (next_check_at);
-- One active registration per regulator per person, and one verified holder of any registration number.
CREATE UNIQUE INDEX IF NOT EXISTS prof_reg_one_per_regulator ON professional_registrations (learner_id, regulator) WHERE active = 1;
CREATE UNIQUE INDEX IF NOT EXISTS prof_reg_one_verified_holder ON professional_registrations (regulator, registration_number) WHERE status = 'verified' AND active = 1;

-- 3. External credentials (FAMUS supervisor, FUSIC trainer, BSE accreditation, EACVI certification...). Each is
-- independently verified and revocable. Wavelength never issues these: issuer is the external body.
CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  credential_type TEXT NOT NULL,
  issuer TEXT NOT NULL,
  programme TEXT,
  role TEXT,
  modules TEXT NOT NULL DEFAULT '[]',
  level TEXT,
  reference TEXT,
  issued_on TEXT,
  expires_on TEXT,
  review_on TEXT,
  status TEXT NOT NULL DEFAULT 'claimed',
  verification_source TEXT,
  verification_method TEXT,
  match_method TEXT,
  match_version TEXT,
  match_result TEXT,
  verified_at TEXT,
  verified_by TEXT,
  registration_id INTEGER,
  claim_note TEXT,
  last_checked_at TEXT,
  next_check_at INTEGER,
  failure_state TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS credentials_learner ON credentials (learner_id, active);
CREATE INDEX IF NOT EXISTS credentials_status ON credentials (status, active);

-- Evidence for manual verification. Files are capped at 1 MB (PDF, JPEG, PNG) and the bytes are purged after the
-- decision (see PURGE_EVIDENCE_DAYS in worker/professional.js); the SHA-256 and description stay as the reference.
CREATE TABLE IF NOT EXISTS credential_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  description TEXT,
  url TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  file_sha256 TEXT,
  file_data BLOB,
  purged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS evidence_subject ON credential_evidence (subject_type, subject_id);

-- 4. Wavelength supervisor approvals: scoped to one pathway and one module ('*' = every module of that pathway,
-- recorded explicitly). There is no universal supervisor permission.
CREATE TABLE IF NOT EXISTS supervisor_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  pathway TEXT NOT NULL,
  module TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  basis TEXT NOT NULL DEFAULT '[]',
  review_on TEXT,
  approved_by TEXT,
  approved_at TEXT,
  notes TEXT,
  ended_by TEXT,
  ended_at TEXT,
  ended_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS approvals_learner ON supervisor_approvals (learner_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_live ON supervisor_approvals (learner_id, pathway, module) WHERE status = 'approved';

-- 5. Append-only audit trail of every verification decision (automatic, scheduled or by an administrator).
CREATE TABLE IF NOT EXISTS verification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  learner_id INTEGER,
  subject_type TEXT NOT NULL,
  subject_id INTEGER,
  action TEXT NOT NULL,
  outcome TEXT,
  actor TEXT NOT NULL,
  source TEXT,
  method TEXT,
  match_method TEXT,
  match_version TEXT,
  match_result TEXT,
  scope TEXT,
  evidence_id INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS events_learner ON verification_events (learner_id, at);
CREATE INDEX IF NOT EXISTS events_subject ON verification_events (subject_type, subject_id);

-- 6. Public supervisor directory preferences. Nothing is public unless listed = 1 and the Worker finds the person
-- eligible at read time. Contact details are shown only when the person chooses them.
CREATE TABLE IF NOT EXISTS directory_profiles (
  learner_id INTEGER PRIMARY KEY,
  listed INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  profession TEXT,
  specialty TEXT,
  organisation TEXT,
  region TEXT,
  country TEXT,
  contact_email TEXT,
  show_contact INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  listed_at TEXT
);

-- 7. Supervisor status at the moment of signing. Written once, in the same statement that signs, never updated.
ALTER TABLE signoffs ADD COLUMN supervisor_snapshot TEXT;
ALTER TABLE assessments ADD COLUMN supervisor_snapshot TEXT;
