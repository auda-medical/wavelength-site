-- Supervisor lifecycle: applications, renewal, withdrawal, expiry, revocation, returned requests, the notification
-- outbox, the audit trail, job runs, assessment amendment and code tombstones. D1 database: wavelength-volunteers.
-- Design: /mnt/project-files/plans/mobile-release-and-supervisor-verification-plan.md (sections 7 to 14, 24, 25, 28, 35).
-- Additive only: new tables and new nullable or defaulted columns. No existing row loses data.
-- NOT applied to production. Apply only with the owner's go-ahead, after recording a Time Travel recovery point.
-- The Worker tolerates this migration being absent (lifecycleReady() in worker/app-util.js): it keeps today's
-- behaviour, and the supervisor application endpoints answer "not available yet".

-- 1. Supervisor applications: one row per initial application, renewal or reapplication. A person has at most one
-- open application (draft, submitted or more_info) at a time.
CREATE TABLE IF NOT EXISTS supervisor_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'initial',            -- initial | renewal | reapplication
  status TEXT NOT NULL DEFAULT 'draft',            -- draft | submitted | more_info | approved | rejected | withdrawn
  link_id INTEGER,                                 -- the invitation that started it, if any
  previous_application_id INTEGER,                 -- renewal or reapplication chain
  full_name TEXT,
  role TEXT,
  organisation TEXT,
  organisation_id TEXT,
  registration_id INTEGER,                         -- professional_registrations.id
  no_registration INTEGER NOT NULL DEFAULT 0,      -- "I am not on a statutory register"
  no_registration_reason TEXT,
  other_regulator TEXT,                            -- an overseas or unlisted regulator, as typed
  credential_ids TEXT NOT NULL DEFAULT '[]',
  experience TEXT NOT NULL DEFAULT '{}',           -- bands and yes/no answers
  justification TEXT,                              -- written explanation of experience, up to 6000 characters
  evidence_mode TEXT,                              -- documents | explanation | both
  requested_areas TEXT NOT NULL DEFAULT '[]',
  requested_pathways TEXT NOT NULL DEFAULT '[]',
  changes_note TEXT,                               -- renewals: what changed
  nothing_changed INTEGER NOT NULL DEFAULT 0,      -- renewals: "nothing material has changed"
  declaration_version TEXT,
  declared_at TEXT,
  current_at_submit INTEGER NOT NULL DEFAULT 0,    -- renewals: fully approved and current when submitted (grace rule)
  grace_blocked INTEGER NOT NULL DEFAULT 0,        -- set by an administrator: a material change ends the grace period
  grace_note TEXT,
  submitted_at TEXT,
  more_info_at TEXT,
  more_info_note TEXT,
  decided_at TEXT,
  decided_by TEXT,
  decision_note TEXT,
  reject_grounds TEXT,                             -- insufficient_evidence | verification_or_safety
  applicant_message TEXT,                          -- what the decision email said
  may_reapply INTEGER,
  approved_scopes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sup_app_status ON supervisor_applications (status, submitted_at);
CREATE INDEX IF NOT EXISTS sup_app_learner ON supervisor_applications (learner_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_app_one_open ON supervisor_applications (learner_id) WHERE status IN ('draft', 'submitted', 'more_info');

-- 2. Approvals. review_on is the "approved until" date (12 months), a UK date: current until the end of that day.
-- Suspension is derived on every read, never stored. New statuses beside approved and revoked: expired, withdrawn.
ALTER TABLE supervisor_approvals ADD COLUMN application_id INTEGER;
ALTER TABLE supervisor_approvals ADD COLUMN registration_exempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE supervisor_approvals ADD COLUMN exempt_reason TEXT;
ALTER TABLE supervisor_approvals ADD COLUMN required_basis TEXT NOT NULL DEFAULT '[]';
ALTER TABLE supervisor_approvals ADD COLUMN last_renewed_at TEXT;

-- Administrative blocks. An administrator who revokes all of someone's supervisor status, or rejects an application on
-- verification or safety grounds, blocks that account from signing as a one-off assessor through Wavelength until the
-- block is lifted, unless the administrator records that one-off assessment remains permitted.
CREATE TABLE IF NOT EXISTS supervisor_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                              -- revoked | rejected_safety
  reason TEXT NOT NULL,
  one_off_permitted INTEGER NOT NULL DEFAULT 0,
  one_off_note TEXT,
  blocked_by TEXT NOT NULL,
  blocked_at TEXT NOT NULL,
  lifted_at TEXT,
  lifted_by TEXT,
  lift_note TEXT
);
CREATE INDEX IF NOT EXISTS sup_blocks_learner ON supervisor_blocks (learner_id, lifted_at);

-- A supervisor's registration or credential lapse, tracked by the daily job: the supervisor is emailed at once, and
-- their learners only if it lasts 14 days.
CREATE TABLE IF NOT EXISTS supervisor_watch (
  learner_id INTEGER PRIMARY KEY,
  lapse_since TEXT,
  lapse_reason TEXT,
  updated_at TEXT NOT NULL
);

-- 3. Links. claimed_at: the invited person used the invitation (or opened it in the app) but is not yet approved.
ALTER TABLE supervisor_links ADD COLUMN claimed_at TEXT;
ALTER TABLE supervisor_links ADD COLUMN ended_reason TEXT;
ALTER TABLE supervisor_links ADD COLUMN ended_by TEXT;
ALTER TABLE supervisor_links ADD COLUMN via TEXT NOT NULL DEFAULT 'email';  -- email | search

-- 4. Pending requests returned to the learner when their supervisor becomes unavailable (decision 3).
ALTER TABLE signoffs ADD COLUMN returned_at TEXT;
ALTER TABLE signoffs ADD COLUMN returned_reason TEXT;
ALTER TABLE signoffs ADD COLUMN returned_from INTEGER;
ALTER TABLE assessments ADD COLUMN returned_at TEXT;
ALTER TABLE assessments ADD COLUMN returned_reason TEXT;
ALTER TABLE assessments ADD COLUMN returned_from INTEGER;

-- 5. Assessment amendment: a new version, never an overwrite. The old one becomes 'superseded'. An administrator can
-- mark a record issued in error; it is kept and the verify page says so.
ALTER TABLE assessments ADD COLUMN amends TEXT;
ALTER TABLE assessments ADD COLUMN superseded_by TEXT;
ALTER TABLE assessments ADD COLUMN amend_reason TEXT;
ALTER TABLE assessments ADD COLUMN error_note TEXT;
ALTER TABLE assessments ADD COLUMN error_at TEXT;
ALTER TABLE signoffs ADD COLUMN error_note TEXT;
ALTER TABLE signoffs ADD COLUMN error_at TEXT;

-- 6. Notification outbox. A row is written (unique key) before the email is sent, in the same batch as the state change
-- where there is one. Statuses: pending, sending (claimed by one sender), sent, failed (the provider refused it; retried
-- up to three times), unknown (no answer from the provider: it may or may not have gone; never retried automatically).
CREATE TABLE IF NOT EXISTS notification_log (
  key TEXT PRIMARY KEY,
  learner_id INTEGER,
  kind TEXT NOT NULL,
  payload TEXT,                                    -- what the template needs; cleared once sent
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS notification_status ON notification_log (status, next_attempt_at);

-- 7. Append-only audit trail. meta holds field names, counts and scopes: never clinical text, tokens or passwords.
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL,                        -- learner | supervisor | admin | system | token
  actor_id TEXT,
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  request_ref TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_subject ON audit_events (subject_type, subject_id, id);
CREATE INDEX IF NOT EXISTS audit_actor ON audit_events (actor_type, actor_id, id);

-- 8. Background job runs, shown on the admin System page.
CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT,                                    -- ok | error
  counts TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS job_runs_job ON job_runs (job, id);

-- 9. Verify codes of deleted accounts: a hash of the code only, so verify can say "withdrawn by its owner".
CREATE TABLE IF NOT EXISTS code_tombstones (
  code_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  withdrawn_on TEXT NOT NULL
);

-- 10. Accounts: review and test accounts (excluded from search, statistics and emails to real users), and the
-- supervisor search opt-in (off by default) with its opaque reference.
ALTER TABLE learners ADD COLUMN test_account INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learners ADD COLUMN supervisor_searchable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learners ADD COLUMN searchable_at TEXT;
ALTER TABLE learners ADD COLUMN supervisor_public_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS learners_public_ref ON learners (supervisor_public_ref);

-- 11. Evidence: files attached to an application (subject_type 'application'), an upload ID against double submits,
-- and decision dates so the 30-day purge clock starts at the decision and is not reset by later edits.
ALTER TABLE credential_evidence ADD COLUMN upload_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_upload ON credential_evidence (learner_id, upload_id);
ALTER TABLE credentials ADD COLUMN decided_at TEXT;
ALTER TABLE professional_registrations ADD COLUMN decided_at TEXT;
