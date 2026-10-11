-- Rollback of migration 0017_admin_accounts.sql. Run only after a fresh encrypted export, and only after the Worker
-- has been rolled back to a version without native accounts (the old Worker ignores these tables, so dropping them is
-- rarely needed). This deletes every administrator account, session, activation link and recovery code.
--   npx wrangler d1 execute wavelength-volunteers --remote --file docs/admin-accounts/0017-rollback.sql
DROP TABLE IF EXISTS admin_recovery_codes;
DROP TABLE IF EXISTS admin_tokens;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_accounts;
