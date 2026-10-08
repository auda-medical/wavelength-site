# Wavelength 1.0.9 (15): physical-device acceptance checklist (Android)

**Status of every check below: NOT RUN.** None of them can run without the phone. Mark each one PASS or FAIL with the
date, and keep the notes. Use dummy scans only, never real patient details.

## Before you start

- Phone: the Android phone that has 1.0.8 (14) with the test account, two trainee supervisor links and at least one
  scan saved but possibly not synced.
- Build: the 1.0.9 (15) APK or AAB from `1.0.9-vc15-unsigned/`, **signed by you on your own computer with the same
  upload key as 1.0.8** (certificate SHA-256 `EE:30:BF:D2…A1:E0`), using the same Windows steps as for 1.0.8.
- A second way to see the account: the website (thewavelength.co.uk/app/, logged in as the same account) or a second
  phone. This is the "second authenticated session".
- **Do not uninstall 1.0.8 and do not clear its storage at any point.** Android keeps the app's data only when the
  new version is installed over the old one with the same key.

## A. Before the upgrade (on 1.0.8)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| A1 | Open Wavelength 1.0.8. Write down the account email | Logged in | NOT RUN |
| A2 | Logbook: count the scans. Note which show "Not synced" | At least one test scan | NOT RUN |
| A3 | Supervisors: note the two linked supervisors | Two links | NOT RUN |
| A4 | Note whether app lock is on (Me, gear, Security), the language and the theme | Noted | NOT RUN |
| A5 | Note any photos or clips on the test scans, any sign-offs and any assessments | Noted | NOT RUN |
| A6 | On the website, check whether the unsynced scan is missing there | Missing (expected for an unsynced scan) | NOT RUN |

## B. Install over 1.0.8, then start-up (the earlier failures)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| B1 | Install the signed 1.0.9 over 1.0.8 (`adb install -r`, or open the APK). Do not uninstall | Installs as an update; no data warning | NOT RUN |
| B2 | Open Wavelength, online | Still logged in as the same account. If app lock is on, the lock screen shows first, then the logbook | NOT RUN |
| B3 | **Test 1 again:** close Wavelength fully, open it again with app lock on | Fingerprint or PIN prompt within about a second, no long wait | NOT RUN |
| B4 | **Test 2 again:** aeroplane mode on (also try with Wi-Fi left on). Close Wavelength fully and open it | Lock prompt within about a second (if on), then the logbook from the phone, all scans present. Header dot grey ("You're offline…"). Never stuck on the start screen | NOT RUN |
| B5 | Still offline: Me, gear, Settings, Sync, Start-up details | Shows the last starts. Note the route and timings shown for B4 | NOT RUN |

## C. The offline scan reaches a second session (required)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| C1 | Still in aeroplane mode, save a new dummy scan (e.g. "1.0.9 acceptance offline scan" and today's date) | Saved. Status says it is saved on this device and waiting to sync | NOT RUN |
| C2 | Turn aeroplane mode off. Do not touch the app for 30 s | The header dot turns teal; Settings, Sync shows "All changes synced." and a last-synced time | NOT RUN |
| C3 | On the website or the second phone (same account), open the logbook and refresh | **The C1 scan is there**, with the same details | NOT RUN |
| C4 | Also check the scan that was unsynced before the upgrade (A2) | Now on the website too | NOT RUN |
| C5 | Repeat C1 to C3 but reconnect by returning from Android Settings to the app | Same result | NOT RUN |

C3 is the check the brief asks for. Only record PASS if the scan is actually seen in the second session after the
phone reconnected and synced.

## D. Data kept by the upgrade

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| D1 | Account | Same email as A1, no log-in asked | NOT RUN |
| D2 | Logbook | Same count as A2 (plus C1), every scan's text and date unchanged | NOT RUN |
| D3 | Photos and clips | Still on each scan from A5; open one of each | NOT RUN |
| D4 | Supervisors | Both links from A3 still listed (online; offline it shows "Checking…" until the first sync) | NOT RUN |
| D5 | Sign-offs and assessments | Same as A5 | NOT RUN |
| D6 | Preferences | App lock, language and theme as in A4 | NOT RUN |

## E. Security and backup

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| E1 | App lock: turn it on (Me, gear, Security). Close and open. Try a fingerprint, then cancel and use the PIN | Fingerprint works; PIN or pattern also works (Android 11+). Weak camera face unlock is not offered | NOT RUN |
| E2 | Me, Your data, Back up and restore: make an encrypted backup with a dummy passphrase of 10 or more characters. Save it to Files | Backup created; note how long it took | NOT RUN |
| E3 | Restore that backup with a wrong passphrase | Refused with a clear message; nothing changes | NOT RUN |
| E4 | Restore it with the right passphrase | "Restored", with counts; nothing duplicated | NOT RUN |
| E5 | Leave the app for more than 90 s and return (lock on) | Asks again | NOT RUN |
| E6 | Optional: remove the phone's fingerprints and screen lock, open the app | Stays locked and explains; Log out is offered. Restore the phone's lock afterwards | NOT RUN |

## F. About and version

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| F1 | Me (or Settings), bottom: About Wavelength | Version 1.0.9 (15) | NOT RUN |
| F2 | Contact support | Mail app opens; the body has only version, platform and language | NOT RUN |
| F3 | Open-source licences | List opens and scrolls | NOT RUN |
| F4 | Android Settings, Apps, Wavelength | Version 1.0.9 | NOT RUN |

## G. If anything fails

- Do not uninstall. Note the step, then send a screenshot of Settings, Sync, Start-up details.
- The signed 1.0.8 APK and AAB are unchanged in `1.0.8-vc14-signed/`. Installing 1.0.8 over 1.0.9 needs a downgrade,
  which Android refuses without uninstalling, so do not try it with the test data on the phone: ask first.
