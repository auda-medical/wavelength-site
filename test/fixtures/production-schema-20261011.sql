-- Schema of the live D1 database wavelength-volunteers (1d2a5805-b54f-4969-b0dc-8decaa5319cf), read on 11 October 2026
-- with a read-only query of sqlite_master (definitions only: no rows, no personal data). Used by
-- test/monitor-migration.test.mjs to rehearse migration 0016 and its rollback against the real production shape.
CREATE TABLE assessments (id TEXT PRIMARY KEY, learner_id INTEGER NOT NULL, pathway TEXT NOT NULL, module TEXT NOT NULL, kind TEXT NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', outcome TEXT, assessed_on TEXT, entry_ids TEXT NOT NULL DEFAULT '[]', snapshot TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}', token_hash TEXT, expires_at INTEGER, supervisor_id INTEGER, supervisor_name TEXT, supervisor_role TEXT, supervisor_reg TEXT, supervisor_email TEXT, accreditation TEXT, signature TEXT, signed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), supervisor_snapshot TEXT, returned_at TEXT, returned_reason TEXT, returned_from INTEGER, amends TEXT, superseded_by TEXT, amend_reason TEXT, error_note TEXT, error_at TEXT);
CREATE TABLE attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), learner_id INTEGER NOT NULL, module TEXT NOT NULL, score INTEGER NOT NULL, right_count INTEGER NOT NULL, total INTEGER NOT NULL, passed INTEGER NOT NULL, answers TEXT);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  request_ref TEXT,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE certificates (code TEXT PRIMARY KEY, learner_id INTEGER NOT NULL, module TEXT NOT NULL, module_title TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, cpd_hours REAL NOT NULL, issued_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), emailed_at TEXT, email_error TEXT, UNIQUE (learner_id, module));
CREATE TABLE code_tombstones (
  code_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  withdrawn_on TEXT NOT NULL
);
CREATE TABLE credential_evidence (
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
, upload_id TEXT);
CREATE TABLE credentials (
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
, decided_at TEXT);
CREATE TABLE department_enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, role TEXT, organisation TEXT NOT NULL, setting TEXT, training TEXT, topics TEXT, group_size TEXT, timing TEXT, details TEXT, contacted INTEGER NOT NULL DEFAULT 0, emailed_at TEXT, email_error TEXT);
CREATE TABLE directory_profiles (
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
, organisation_id TEXT);
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  pending TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE evidence_summaries (id TEXT PRIMARY KEY, learner_id INTEGER NOT NULL, destination TEXT, period_from TEXT NOT NULL, period_to TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), withdrawn INTEGER NOT NULL DEFAULT 0);
CREATE TABLE faculty_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, profession TEXT, specialty TEXT, organisation TEXT, registration TEXT, experience TEXT, credentials TEXT, applications TEXT, interests TEXT, details TEXT, contacted INTEGER NOT NULL DEFAULT 0, emailed_at TEXT, email_error TEXT);
CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), learner_id INTEGER, module TEXT NOT NULL, useful INTEGER, practice INTEGER, comment TEXT);
CREATE TABLE job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT,
  counts TEXT,
  error TEXT
);
CREATE TABLE learners (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT, email TEXT NOT NULL UNIQUE, title TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, role TEXT, organisation TEXT, newsletter INTEGER NOT NULL DEFAULT 0, password_hash TEXT, profile TEXT, declaration_at TEXT, failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, sessions_after INTEGER, email_status TEXT NOT NULL DEFAULT 'legacy_unverified', email_verified_at TEXT, test_account INTEGER NOT NULL DEFAULT 0, supervisor_searchable INTEGER NOT NULL DEFAULT 0, searchable_at TEXT, supervisor_public_ref TEXT, organisation_id TEXT);
CREATE TABLE logbook_entries (id TEXT PRIMARY KEY, learner_id INTEGER NOT NULL, scan_type TEXT NOT NULL, scan_date TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE newsletter_sends (slug TEXT PRIMARY KEY, status TEXT NOT NULL, detail TEXT, campaign_key TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE notification_log (
  key TEXT PRIMARY KEY,
  learner_id INTEGER,
  kind TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE organisation_aliases (
  organisation_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  alias_norm TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (organisation_id, alias_norm)
);
CREATE TABLE organisation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  typed TEXT NOT NULL,
  typed_norm TEXT NOT NULL,
  learner_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  organisation_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_id TEXT,
  country TEXT NOT NULL DEFAULT 'GB',
  status TEXT NOT NULL DEFAULT 'active',
  merged_into TEXT,
  source TEXT NOT NULL,
  ods_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE password_resets (token_hash TEXT PRIMARY KEY, learner_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE professional_registrations (
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
, decided_at TEXT, organisation_id TEXT);
CREATE TABLE rate_counters (
  bucket TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE search_counts (
  learner_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  searches INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (learner_id, day)
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE signoffs (id TEXT PRIMARY KEY, learner_id INTEGER NOT NULL, method TEXT NOT NULL, token_hash TEXT, entry_ids TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', supervisor_name TEXT, supervisor_role TEXT, supervisor_reg TEXT, supervisor_email TEXT, accreditation TEXT, basis TEXT, comment TEXT, decisions TEXT, signature TEXT, signed_at TEXT, supervisor_id INTEGER, ratings TEXT, supervisor_snapshot TEXT, returned_at TEXT, returned_reason TEXT, returned_from INTEGER, error_note TEXT, error_at TEXT);
CREATE TABLE supervisor_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'initial',
  status TEXT NOT NULL DEFAULT 'draft',
  link_id INTEGER,
  previous_application_id INTEGER,
  full_name TEXT,
  role TEXT,
  organisation TEXT,
  organisation_id TEXT,
  registration_id INTEGER,
  no_registration INTEGER NOT NULL DEFAULT 0,
  no_registration_reason TEXT,
  other_regulator TEXT,
  credential_ids TEXT NOT NULL DEFAULT '[]',
  experience TEXT NOT NULL DEFAULT '{}',
  justification TEXT,
  evidence_mode TEXT,
  requested_areas TEXT NOT NULL DEFAULT '[]',
  requested_pathways TEXT NOT NULL DEFAULT '[]',
  changes_note TEXT,
  nothing_changed INTEGER NOT NULL DEFAULT 0,
  declaration_version TEXT,
  declared_at TEXT,
  current_at_submit INTEGER NOT NULL DEFAULT 0,
  grace_blocked INTEGER NOT NULL DEFAULT 0,
  grace_note TEXT,
  submitted_at TEXT,
  more_info_at TEXT,
  more_info_note TEXT,
  decided_at TEXT,
  decided_by TEXT,
  decision_note TEXT,
  reject_grounds TEXT,
  applicant_message TEXT,
  may_reapply INTEGER,
  approved_scopes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE supervisor_approvals (
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
, application_id INTEGER, registration_exempt INTEGER NOT NULL DEFAULT 0, exempt_reason TEXT, required_basis TEXT NOT NULL DEFAULT '[]', last_renewed_at TEXT);
CREATE TABLE supervisor_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  one_off_permitted INTEGER NOT NULL DEFAULT 0,
  one_off_note TEXT,
  blocked_by TEXT NOT NULL,
  blocked_at TEXT NOT NULL,
  lifted_at TEXT,
  lifted_by TEXT,
  lift_note TEXT
);
CREATE TABLE supervisor_links (id INTEGER PRIMARY KEY AUTOINCREMENT, learner_id INTEGER NOT NULL, supervisor_email TEXT NOT NULL, supervisor_id INTEGER, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')), accepted_at TEXT, ended_at TEXT, invite_hash TEXT, invite_expires INTEGER, claimed_at TEXT, ended_reason TEXT, ended_by TEXT, via TEXT NOT NULL DEFAULT 'email', UNIQUE (learner_id, supervisor_email));
CREATE TABLE supervisor_watch (
  learner_id INTEGER PRIMARY KEY,
  lapse_since TEXT,
  lapse_reason TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE verification_events (
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
CREATE TABLE volunteers (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT (datetime('now')), first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, status TEXT, organisation TEXT, year TEXT, dates TEXT, notes TEXT, future_contact INTEGER NOT NULL DEFAULT 0, contacted INTEGER NOT NULL DEFAULT 0, newsletter INTEGER NOT NULL DEFAULT 0);
CREATE INDEX approvals_learner ON supervisor_approvals (learner_id, status);
CREATE UNIQUE INDEX approvals_one_live ON supervisor_approvals (learner_id, pathway, module) WHERE status = 'approved';
CREATE INDEX assessments_learner ON assessments (learner_id, status);
CREATE INDEX assessments_supervisor ON assessments (supervisor_id, status);
CREATE UNIQUE INDEX assessments_token ON assessments (token_hash);
CREATE INDEX attempts_learner ON attempts (learner_id, module);
CREATE INDEX audit_actor ON audit_events (actor_type, actor_id, id);
CREATE INDEX audit_subject ON audit_events (subject_type, subject_id, id);
CREATE INDEX credentials_learner ON credentials (learner_id, active);
CREATE INDEX credentials_status ON credentials (status, active);
CREATE INDEX email_tokens_learner ON email_tokens (learner_id, purpose, created_at);
CREATE INDEX events_learner ON verification_events (learner_id, at);
CREATE INDEX events_subject ON verification_events (subject_type, subject_id);
CREATE INDEX evidence_learner ON evidence_summaries (learner_id, created_at);
CREATE INDEX evidence_subject ON credential_evidence (subject_type, subject_id);
CREATE UNIQUE INDEX evidence_upload ON credential_evidence (learner_id, upload_id);
CREATE INDEX job_runs_job ON job_runs (job, id);
CREATE UNIQUE INDEX learners_public_ref ON learners (supervisor_public_ref);
CREATE INDEX logbook_learner ON logbook_entries (learner_id, updated_at);
CREATE INDEX notification_status ON notification_log (status, next_attempt_at);
CREATE INDEX org_alias_norm ON organisation_aliases (alias_norm);
CREATE INDEX org_name_norm ON organisations (name_norm);
CREATE INDEX org_requests_learner ON organisation_requests (learner_id, status);
CREATE INDEX org_requests_status ON organisation_requests (status, id);
CREATE INDEX org_status ON organisations (status);
CREATE INDEX prof_reg_due ON professional_registrations (next_check_at);
CREATE INDEX prof_reg_learner ON professional_registrations (learner_id, active);
CREATE UNIQUE INDEX prof_reg_one_per_regulator ON professional_registrations (learner_id, regulator) WHERE active = 1;
CREATE UNIQUE INDEX prof_reg_one_verified_holder ON professional_registrations (regulator, registration_number) WHERE status = 'verified' AND active = 1;
CREATE INDEX rate_counters_expiry ON rate_counters (expires_at);
CREATE INDEX signoffs_learner ON signoffs (learner_id);
CREATE INDEX signoffs_supervisor ON signoffs (supervisor_id, status);
CREATE UNIQUE INDEX signoffs_token ON signoffs (token_hash);
CREATE INDEX sup_app_learner ON supervisor_applications (learner_id, id);
CREATE UNIQUE INDEX sup_app_one_open ON supervisor_applications (learner_id) WHERE status IN ('draft', 'submitted', 'more_info');
CREATE INDEX sup_app_status ON supervisor_applications (status, submitted_at);
CREATE INDEX sup_blocks_learner ON supervisor_blocks (learner_id, lifted_at);
CREATE INDEX supervisor_links_email ON supervisor_links (supervisor_email, status);
CREATE UNIQUE INDEX supervisor_links_invite ON supervisor_links (invite_hash);
CREATE INDEX supervisor_links_sup ON supervisor_links (supervisor_id, status);
