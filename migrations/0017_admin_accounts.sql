-- Native administrator accounts (October 2026): personal sign-in for the admin console, roles and switchable
-- permissions (worker/admin/permissions.js), database-backed sessions, single-use activation links and two-step
-- verification (authenticator app, recovery codes). Additive only: no existing table changes. Until an Owner account
-- finishes two-step enrolment, the shared admin login keeps working exactly as before.
-- Rollback: docs/admin-accounts/0017-rollback.sql (after a fresh export). The old Worker ignores these tables.

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,                       -- owner | general_manager
  grants TEXT NOT NULL DEFAULT '[]',        -- switchable permissions the owner has switched on (JSON list)
  status TEXT NOT NULL DEFAULT 'pending',   -- pending (not yet signed in with two-step) | active | disabled
  password_hash TEXT,                       -- apbkdf2$iterations$salt$hash (peppered); NULL until activation
  password_changed_at TEXT,
  totp_secret TEXT,                         -- authenticator seed, AES-GCM sealed with the Worker secret ADMIN_TOTP_KEY
  totp_pending TEXT,                        -- a seed being enrolled, sealed the same way
  totp_enrolled_at TEXT,
  totp_last_step INTEGER NOT NULL DEFAULT 0,-- the last accepted time step: a code is never accepted twice
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  learner_id INTEGER,                       -- the person's own logbook account, so nobody decides their own case
  created_at TEXT NOT NULL,
  created_by INTEGER,
  updated_at TEXT NOT NULL,
  last_sign_in_at TEXT
);
CREATE INDEX IF NOT EXISTS admin_accounts_learner ON admin_accounts (learner_id);

-- Sessions: the cookie holds a random token; only its SHA-256 is stored here.
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  stage TEXT NOT NULL,                      -- two_step (password accepted, code needed) | enrol | full
  csrf TEXT NOT NULL,                       -- per-session form token
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  reauth_at TEXT,                           -- last password + code check, for owner security pages
  ip_hash TEXT                              -- short SHA-256 of the network address; the address is never stored
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin ON admin_sessions (admin_id);

-- Activation and password-reset links: single use, 72 hours; only the SHA-256 of the link's token is stored.
CREATE TABLE IF NOT EXISTS admin_tokens (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  purpose TEXT NOT NULL,                    -- activate
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS admin_tokens_admin ON admin_tokens (admin_id);

-- Recovery codes: ten per enrolment, shown once; only keyed hashes are stored.
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  admin_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  PRIMARY KEY (admin_id, code_hash)
);
