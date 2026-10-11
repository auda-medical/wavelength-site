# Native administrator accounts with two-step verification: release package

| | |
|---|---|
| Branch | `wavelength-admin-accounts-20261011` (worktree `C:\Users\phira\Wavelength-Cloud\wavelength-admin-accounts`) |
| Built on | Release B, `wavelength-source-monitor-20261010` `d024bf7` (which contains Release A, live since 11 Oct 2026) |
| Requirement | Owner, 11 Oct 2026: HQ `08-SHARED-WORKSPACE\CHATGPT-CONTRIBUTIONS\2026-10-11_1915_CHATGPT_DEFINITIVE-CONSOLIDATED-EXECUTION-INSTRUCTION.md` §2 and §3 (decision D-70), plan `D:\Wavelength-HQ\02-DEVELOPMENT\ADMIN-ACCOUNTS-PERMISSIONS-AND-PLAN.md` |
| Status | **Built and tested locally. Not deployed.** Production needs: Release B live and watched, migration 0017, three Worker secrets, and the owner's separate approval |

## 1. What it does

- Each administrator has their own username, password and authenticator app. Two roles: **Owner** (everything) and
  **General Manager** (all routine work, including all supervisor verification and independent reviews).
- **Two-step verification is mandatory for everyone**: a code from an authenticator app (TOTP, RFC 6238), set up with a
  QR code or a typed key before the console opens; ten single-use recovery codes shown once; no text-message or email
  codes.
- **Deny by default**: one registry (`worker/admin/permissions.js`) maps every console page and every form action to a
  permission; anything else answers 403 and changes nothing. A test fails the build if a page or action is missing.
- **High-impact actions** (owner decisions, 11 Oct 2026): permanent deletion, personal-data spreadsheet exports, the
  newsletter "send now" and the business dashboard are switchable per person and start **off** for the General
  Manager; **revoking every approval of one supervisor** and **merging organisations** are owner-only. Revoking a
  supervisor's *last* approval counts as revoking every approval (it ends their status and blocks one-off signing), so
  it is owner-only too. No bulk deletion exists.
- **Owner management** (needs a password and code check within the last 10 minutes): add administrators (single-use
  activation link, 72 hours, shown once), rename, change role, switch permissions, link a person's own logbook account,
  reset password (new link), reset two-step, sign out everywhere, disable, restore, and read the account and security
  audit log. Role, permission, password, two-step and status changes end that person's sessions at once.
- **Attribution**: every decision, export, deletion, sign-in and failure is recorded against the account
  (`audit_events.actor_id` `acct<id>`); supervisor decisions record the account's display name, and the typed reviewer
  box and its cookie are gone. A linked logbook account makes self-approval recognition certain, and an administrator
  can never record the independent review of their own record.
- **Sessions** live in D1 (only the SHA-256 of the cookie token is stored): `__Secure-wl_admin_session`, HttpOnly,
  Secure, SameSite=Lax (so the return from Zoho's authorisation page keeps the session; every POST still needs the
  per-session CSRF token), Path=/admin; 12 hours at most, 60 minutes idle; "last active" written at most every 5 minutes.
- **CSRF**: a per-session token is added to every console form and checked on every POST, plus a same-origin check
  (Origin, or Sec-Fetch-Site).
- **Throttling**: ten sign-in steps a minute per network address (address never stored); ten failures lock the
  account for 15 minutes; unknown usernames, wrong passwords, disabled and locked accounts all get the same answer.
- **Passwords**: at least 12 characters, not containing the username or name; PBKDF2-SHA-256, 100,000 iterations (the
  Workers maximum), over HMAC-SHA-256 with the secret pepper. Recovery codes are keyed with the pepper too.
- **Shared login**: works exactly as before until an Owner has finished two-step set-up; from then on it is refused
  for good (`settings.admin_accounts_live`), even while an owner is being recovered. The shared password stays in
  `settings` as the way back in after a rollback to the old Worker (keep it secret).
- **Lost phone**: sign in with a recovery code; re-authenticate with a recovery code; then **Your account, New phone
  or authenticator** sets up a new one (old key and codes stop working).
- **Emergency recovery**: `node tools/admin-recover.mjs <owner> [--reset-two-step]` prints one SQL command (run with the
  owner's own Cloudflare login) and a two-hour, single-use owner link.
- Cloudflare Access stays off and untouched.

## 2. Files

| Area | Files |
|---|---|
| New | `test/admin-review-fixes.test.mjs`, `worker/admin/crypto.js`, `accounts.js`, `permissions.js`, `routes.js`, `pages.js`; `migrations/0017_admin_accounts.sql`; `tools/admin-recover.mjs`, `tools/e2e-admin-accounts.mjs`; `test/admin-accounts.test.mjs`, `admin-permissions.test.mjs`, `admin-registry.test.mjs`, `admin-recovery.test.mjs`, `test/helpers/admin-accounts.mjs`; this folder |
| Changed | `worker/index.js` (accounts mode, gate, attribution, CSRF in `render`), `worker/admin-console.js` (navigation by permission, Administrators section, Your account), `worker/supervisors-admin.js` (account attribution, linked-account self-recognition, last-approval rule), `CLAUDE.md` |

## 3. Tests (11 October 2026)

| Run | Result |
|---|---|
| Full suite (`node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`) | **296/296** (Release B's 267, unchanged, plus 29 new) |
| Browser, accounts journey (`tools/e2e-admin-accounts.mjs`) | **31/31**: bootstrap, activation, QR and key, recovery codes, adding the General Manager, her set-up, refused delete, two-step sign-in; ten pages at 390 and 1440 px without overflow; no console errors |
| Browser, existing checks (shared login) | `e2e-verified` 274/274; `e2e-monitor` 46/46 |
| Dry run | 1,041.93 KiB (gzip 291.19 KiB) |

New tests cover: bootstrap only with the set-up code; secrets unreadable at rest; shared login refused once live;
password plus code; code replay refused; clock window (±1 step); recovery codes once; same answer for unknown users;
lock-out after ten failures and release after 15 minutes; per-address limit; cookie flags; idle and absolute expiry;
CSRF (missing, other session's, forged token; foreign or missing origin); 10-minute re-authentication and a safe
`next`; owner management with immediate session revocation; own password change; logout; no secrets in pages, logs or
audit; fail-closed without secrets; every GET route and every POST action for both roles (each refusal 403 with an
unchanged database); switchable permissions on and off; account attribution ignoring a typed name; owner-only revoke
all (including the last approval) and merge; linked-account self-approval and independent review; emergency recovery
with and without two-step reset, owner-only, input checked. After the code review: accounts mode stays on through an
owner recovery; recovery codes for re-authentication and a new authenticator; disabling ends activation links; your own
logbook link cannot be changed by yourself once set; the same failure records for known and unknown usernames; CSRF
token in any form quoting style.

## 4. Deployment runbook (only after a separate owner approval)

Order: Release B deployed and watched first. Then, in one session with the owner present:

1. **Owner changes the shared admin password** (Logins page) and keeps it in the password manager. It becomes the
   rollback key and must not be known to anyone else.
2. Fresh encrypted D1 export (`RUN-Critical-Backups.cmd -DatabaseOnly`) and a Time Travel bookmark; note the Worker
   version (`npx wrangler deployments list`).
3. Clean LF export of the approved commit (`git archive <commit> | tar -x -C <new folder>`); tests; `node build.js`;
   `npx wrangler deploy --dry-run`; record the bundle hash.
4. Apply the migration: `npx wrangler d1 execute wavelength-volunteers --remote --file migrations/0017_admin_accounts.sql`.
5. Set the secrets (owner; values never written down in HQ or chat):
   - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put ADMIN_PEPPER`
   - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put ADMIN_TOTP_KEY`
   - `npx wrangler secret put ADMIN_BOOTSTRAP_CODE` (type a long one-time code you will use in step 7; at least 12
     characters)
   Losing ADMIN_PEPPER or ADMIN_TOTP_KEY later is recoverable (step 9's tool resets owner access), but every
   administrator would need new passwords or two-step. Never change them casually.
6. Deploy; check the deployed bundle hash; smoke test (public pages, `/admin/login/`, shared login still works because
   no Owner exists yet).
7. Owner: sign in with the shared login, open **Administrators**, enter the set-up code, username and display name;
   open the activation link; choose a password; set up the authenticator; **save the recovery codes**. The shared login
   now stops working.
8. `npx wrangler secret delete ADMIN_BOOTSTRAP_CODE` (it is no longer needed).
9. Rehearse recovery knowledge: keep `tools/admin-recover.mjs` instructions with the password manager entry.
10. Owner adds Zahra (General Manager), hands her the link privately, and links her and the owner's logbook accounts.
11. Zahra signs in, sets up two-step, and records the independent review of the 8 existing approvals.
12. Watch 48 hours: sign-in failures and `admin.denied` in the audit log; no lock-outs.

**Rollback**: `npx wrangler rollback <previous version>`; the old Worker ignores the new tables and the shared login
(step 1's password) works again. `docs/admin-accounts/0017-rollback.sql` only if the tables must go.

## 5. Known limits and choices

- PBKDF2 is capped at 100,000 iterations in Workers (below OWASP's current PBKDF2 guidance); the pepper compensates
  against a stolen database. Argon2 would exceed the Workers Free CPU limit per request.
- TOTP uses SHA-1, six digits, 30 seconds: what every authenticator app supports. Passkeys can be added later.
- An attacker who knows a username can lock that account for 15 minutes by failing ten times (standard trade-off; the
  per-address limit slows it). The owner can clear it with Restore.
- Logging out is a GET link (a forced logout is harmless).
- Activation links travel in the URL; the Worker logs no query strings and Workers Logs are not enabled. Links are
  single use and expire.
