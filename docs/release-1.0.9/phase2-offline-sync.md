# Wavelength 1.0.9, Phase 2: offline start and durable sync

Date: 8 October 2026. Branch `claude/release-1.0.9`. Applies to Android and iPhone: both run the same logbook code (`src/app/app.js`, `src/app/native.js`).

## Start-up

| Before (1.0.8) | After (1.0.9) |
| --- | --- |
| The start screen waited for `/api/app/me` with no time limit | A phone that is signed in opens its logbook from the phone straight away. The server check runs behind it |
| Fingerprint prompt only after the server answered | The lock screen covers the app first and the fingerprint prompt comes at once (S2, S4: about 160 ms) |
| The logbook could show for a moment before the lock covered it | The lock is drawn before the logbook |
| No limit on any server call | Every call has a time limit (20 s by default, 8 s for the start-up check, 30 s per sync batch) and then fails like an offline call |
| A secure-storage read that never answered would hold start-up | Start-up carries on after 4 s. If a token cannot be read, the app shows the recovery screen and never treats it as "signed out", so the offline account cache is kept |
| Nothing ever replaced a stuck start screen | After 10 s with the start screen still up, a recovery screen appears: "Wavelength is taking longer than usual to start.", with Try again |
| Nothing recorded about slow starts | The last 10 starts are kept on the device (route, time to logbook, server result and time; no personal data). They are shown under Settings, Sync, Start-up details |

Authentication is not bypassed. Opening the logbook from the phone needs the same two things 1.0.8 already needed for its offline start: a stored login token and the cached account. The server check still runs on every start. If the server no longer accepts the login, the app signs out as before (see "Login ended" below).

## Sync

The local database was already the right base: every change is saved first in IndexedDB with an unsynced flag, and an entry has one id for life. So the queue is the entries table itself. No new store is added, nothing is migrated, and 1.0.8 data needs no conversion.

| Area | 1.0.9 behaviour |
| --- | --- |
| Acknowledgement | An entry is marked synced only when the server's answer returns it as saved. If the server refuses it, or leaves it out of its answer (as the live Worker does today), the entry stays unsynced with the reason |
| Retries | After a failure, retries run at 2, 5, 10, 20, 30, 60, 120 s, then every 5 minutes, each with ±20% jitter. They also run on reconnect, on returning to the app, after each save, and from Retry sync |
| Connectivity | Sync no longer depends on `navigator.onLine`. The status comes from what the last attempt did. Android now declares `ACCESS_NETWORK_STATE`, a normal permission with no prompt, so WebView reports going offline and coming back. iOS WKWebView already did |
| Duplicates | The id is made on the device and the server writes by id, so a resend updates the same row. A resend after a lost answer is rebased and saved once (Y7) |
| Batches | At most 50 entries or about 400 KB per call. The Worker takes at most 200 entries and 600 KB, so a large restore or a long time offline used to fail every time |
| Too-long entries | The scan form refuses to save more text than the server accepts, with a message saying what to shorten |
| Refused entries | Shown in red ("Not synced") on the entry and listed in Settings with the reason. They are not resent automatically until edited or until Retry sync |
| Login ended (expired, password changed, logged out elsewhere) | The app signs out to the login screen as before, with "Sign in again to continue synchronising. Your local entries are safe." and the number waiting. Local entries are never deleted. After the same account signs in, they sync (Y6) |
| Logging out with entries waiting | A confirmation says how many entries have not synced and that they stay on the device |
| Conflicts (unchanged) | The server keeps the newest copy. If another device or a supervisor changed an entry since this device last saw it, this device's edit is rebased on the server copy and sent again. A supervisor's sign-off stays only while the signed content is unchanged; otherwise it is voided with a record of which fields changed. A restored backup never overwrites a live server copy |
| Media | Sync covers logbook entries only. Photos and clips are never uploaded automatically. The sync panel says so and links to Back up and restore |

### Status wording

| State | Text |
| --- | --- |
| Offline | You're offline. Your entries are saved on this device and will sync when you're back online. |
| Saved locally | Saved on this device. 1 entry awaiting sync. (plural forms for other counts) |
| Syncing | Synchronising 1 entry… |
| Synced | All changes synced. (only after a full push and pull succeed with nothing waiting) |
| Sync failed | Unable to sync. Your entries remain saved on this device. |
| Authentication required | Sign in again to continue synchronising. Your local entries are safe. |

Where the status shows:
- **Header:** a dot on every screen (grey offline, amber waiting, red failed, pulsing while syncing, teal synced). It sits inside a 32 px link with the status as its accessible name, and opens the panel.
- **Logbook and Home:** a one-line status, hidden while everything is synced.
- **Settings, Sync:** the status, entries awaiting sync, last synced, any refused entries with reasons, Retry sync, the media note and start-up details. Me, Your data links to it.

Translations are added for all eight app languages. They were machine-drafted, as the rest of the app's were, and need a native speaker's review.

## Server change (local only, not deployed)

`POST /api/app/sync` now returns `rejected: [{ id, reason }]` for every entry it does not save: an invalid id, a missing application or date, over 20,000 characters, owned by another account, or past the 200-entry limit. The change only adds a field:
- 1.0.8 ignores the new field.
- 1.0.9 works against the live Worker without it, because an entry left out of the answer is treated as not accepted.

Deploying the Worker is therefore optional for 1.0.9. Plan when Fero chooses to deploy:
1. Run `npm test`.
2. Run `npx wrangler deploy` from the release commit.
3. Check that `/api/app/sync` answers with a test account.

Rollback is `npx wrangler rollback` to the previous version. There is no database migration.

## Tests

- Unit (`npm test`): 209 pass, 0 fail. That is the original 201 plus 8 new ones in `test/sync-ack.test.mjs` covering acknowledgements, refusals, the 200-entry limit, duplicate resends, the agreed wording, start-up limits, sync not using `navigator.onLine`, and the Android permission.
- Browser, with the real bundle, stand-in native bridge and local Worker (`tools/e2e-offline.mjs`): 16 of 16 pass. Results are in `phase2-e2e-offline.json`. The same checks on the 1.0.8 code failed 7 of 9 (`phase1-e2e-offline-baseline.json`).
- Existing store-app suite (`tools/e2e-native.mjs`): all checks pass.
- Screens checked at 390 px in light, dark and Arabic (right to left).

None of this ran on a phone. The physical-device checklist in Phase 5 covers that.
