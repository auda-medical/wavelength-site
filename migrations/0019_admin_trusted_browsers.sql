-- Trusted browsers for the admin console (November 2026, worker/admin/trust.js): after the password and a two-step
-- code, an administrator may tick "Trust this browser for 30 days". The browser then gets its own cookie
-- (__Host-wl_admin_trust) holding 32 random bytes; only the SHA-256 of that token is stored here, bound to the account.
-- In a trusted browser the sign-in still needs the password; only the code step is skipped. Removed by "Forget this
-- browser", "Forget all browsers", a password change or reset, a two-step reset or new authenticator, and disabling the
-- account; at most ten per account (the oldest goes). Additive only: no existing table changes; the old Worker ignores
-- this table. Rollback: DROP TABLE admin_trusted_browsers (after a fresh export).

CREATE TABLE IF NOT EXISTS admin_trusted_browsers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,                 -- SHA-256 of the cookie's token; the token itself is never stored
  admin_id INTEGER NOT NULL,                -- admin_accounts.id: the only account this browser is trusted for
  label TEXT NOT NULL,                      -- browser and system from the User-Agent, e.g. "Chrome on Windows" (60 characters at most)
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,                 -- created_at + 30 days; never extended
  last_used_at TEXT                         -- the last sign-in that skipped the code step
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_trusted_browsers_hash ON admin_trusted_browsers (token_hash);
CREATE INDEX IF NOT EXISTS admin_trusted_browsers_admin ON admin_trusted_browsers (admin_id);
