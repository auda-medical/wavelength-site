// Owner emergency recovery for native administrator accounts. Run by the owner only, on their own computer, when no
// owner can sign in (forgotten password, or lost phone and recovery codes). It needs the owner's Cloudflare login,
// which is the real authority here: nothing in the website can do this.
//
//   node tools/admin-recover.mjs <owner-username> [--reset-two-step]
//
// It prints one SQL command and a link. Run the command, then open the link within two hours:
//   npx wrangler d1 execute wavelength-volunteers --remote --command "<the printed SQL>"
// The link sets a new password. With --reset-two-step the authenticator and recovery codes are cleared too, and the
// next step is a fresh two-step set-up. Every session of the account ends. Only an Owner account can be recovered.
// The token is printed once and never stored; the database keeps only its SHA-256.
import { newToken, tokenId } from '../worker/admin/crypto.js';

export async function buildRecovery(username, { resetTwoStep = false, now = Date.now(), origin = 'https://thewavelength.co.uk' } = {}) {
  const u = String(username || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,39}$/.test(u)) throw new Error('Give the owner username (lower case).');
  const token = newToken();
  const id = await tokenId(token);
  const at = new Date(now).toISOString(), until = new Date(now + 2 * 3600e3).toISOString();
  const owner = `(SELECT id FROM admin_accounts WHERE username = '${u}' AND role = 'owner')`;
  const sql = [
    `UPDATE admin_tokens SET used_at = '${at}' WHERE admin_id = ${owner} AND used_at IS NULL`,
    `INSERT INTO admin_tokens (id, admin_id, purpose, created_at, expires_at, created_by) SELECT '${id}', id, 'activate', '${at}', '${until}', NULL FROM admin_accounts WHERE username = '${u}' AND role = 'owner'`,
    `UPDATE admin_accounts SET password_hash = NULL, failed_count = 0, locked_until = NULL, status = CASE WHEN status = 'disabled' THEN (CASE WHEN totp_secret IS NULL THEN 'pending' ELSE 'active' END) ELSE status END, updated_at = '${at}' WHERE username = '${u}' AND role = 'owner'`,
    ...(resetTwoStep ? [
      `UPDATE admin_accounts SET totp_secret = NULL, totp_pending = NULL, totp_enrolled_at = NULL, totp_last_step = 0 WHERE username = '${u}' AND role = 'owner'`,
      `DELETE FROM admin_recovery_codes WHERE admin_id = ${owner}`,
    ] : []),
    `DELETE FROM admin_sessions WHERE admin_id = ${owner}`,
    `INSERT INTO audit_events (at, actor_type, actor_id, action, subject_type, subject_id, meta) SELECT '${at}', 'owner_console', 'wrangler', 'admin.emergency_recovery', 'admin_account', id, '${JSON.stringify({ resetTwoStep })}' FROM admin_accounts WHERE username = '${u}' AND role = 'owner'`,
  ].join('; ');
  return { token, sql, link: `${origin}/admin/activate/?t=${token}` };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1].endsWith('admin-recover.mjs')) {
  const [, , username, flag] = process.argv;
  if (!username) { console.error('Usage: node tools/admin-recover.mjs <owner-username> [--reset-two-step]'); process.exit(2); }
  const r = await buildRecovery(username, { resetTwoStep: flag === '--reset-two-step' });
  console.log('1. Run this (it needs your Cloudflare login):\n');
  console.log(`npx wrangler d1 execute wavelength-volunteers --remote --command "${r.sql.replace(/"/g, '\\"')}"\n`);
  console.log(`2. Then open this link within two hours (it works once):\n\n${r.link}\n`);
  console.log('Check the output of step 1 says rows were written. If it wrote none, the username is not an owner.');
}
