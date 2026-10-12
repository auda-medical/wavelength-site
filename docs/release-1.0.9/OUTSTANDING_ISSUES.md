# Wavelength 1.0.9: outstanding issues

Date: 8 October 2026. What is not done, not verified, or left for a later release, and why. Nothing here blocks
signing the Android build for internal testing. Items marked **before release** should be closed before the build
goes to learners.

## Not yet verified (needs equipment or a person this environment does not have)

| # | Item | Why it is open | What closes it | Before release |
| --- | --- | --- | --- | --- |
| 1 | Physical-device acceptance test (Android) | No phone here. Every check ran in Chromium with the real bundle over a stand-in native bridge, not in Android WebView | `ACCEPTANCE_CHECKLIST.md` on Fero's phone, installed over 1.0.8 | **Yes** |
| 2 | Offline scan reaching a second signed-in session, on the phone | Proven in the harness (e2e-upgrade U11, e2e-offline Y1 and Y3) but not on the phone | Checklist section C | **Yes** |
| 3 | Root cause of the aeroplane-mode freeze, as it happened on the phone | Inferred from code and reproduced in the harness. WebView debugging is off in release builds, so the phone's own behaviour was not measured | Checklist step B4: Settings, Sync, Start-up details after an aeroplane-mode start | No (the fix does not depend on it) |
| 4 | iOS build and runtime | No Mac or Xcode here. Static review only | `IOS_READINESS.md` checks on a Mac | **Yes, for iOS** |
| 5 | Translations of new text (8 languages) | Machine-drafted, like the rest of the app's translations | A native speaker's review of the strings added in 1.0.9 (`git diff pre-1.0.9-baseline -- src/app/i18n`) | Recommended |
| 6 | Argon2id time on slow phones | Measured on a desktop only. 64 MiB and 3 passes may take several seconds on an old phone | Checklist step E2 records the time | No |
| 7 | Whether the deployed Worker still matches commit 2dfd55e | Compatibility was tested against the source labelled "main 2dfd55e production" in the recovery archive. An earlier read-only check in this project (8 October, before the 1.0.9 work) found the live Worker running main-equivalent code; it was not re-checked for this report | Fero's confirmation that nothing was deployed since | No |
| 7a | One supervisor label untranslated with the live Worker (carried over from 1.0.8) | The live Worker sends "Wavelength-approved supervisor", which 1.0.8 and 1.0.9 no longer translate, so it shows in English in the other seven languages | Goes away when the 3dbdf3f Worker code is deployed | No |

## Decisions for Fero

| # | Item | Default taken | Notes |
| --- | --- | --- | --- |
| 8 | App lock when the phone's lock is missing | Stays locked and offers Log out (changed after the independent review) | 1.0.8 switched the lock off. On Android 7 to 10 with only weak face unlock and the lock already on, the learner must set up a fingerprint, or log out and log in online. Nothing is deleted. Reversible |
| 9 | iOS export compliance | `ITSAppUsesNonExemptEncryption = false` left unchanged | Backups now use AES and Argon2id. Fero to confirm the declaration before the iOS submission |
| 10 | Deploying the Worker change | Not deployed. Optional | See `BACKEND_DEPLOYMENT.md`. 1.0.9 works fully against the current Worker; the change only gives clearer reasons when the server refuses an entry |
| 11 | Website copy on /app/get/ | Not changed | It says "One tap saves your photos… Restore on a new phone in seconds". Backups now need a passphrase, and Argon2id takes a few seconds, so the wording should be updated with the release |

## Left for a later release (by design)

| # | Item | Why not in 1.0.9 |
| --- | --- | --- |
| 12 | Hide the app-switcher snapshot (`FLAG_SECURE` on Android, a cover on iOS) | `FLAG_SECURE` also blocks the learner's own screenshots. Better as a setting tied to the app lock |
| 13 | Biometric-bound key for the token or the logbook | Needs native code, and Android would sign the learner out on every fingerprint enrolment change. Today the lock gates the interface only |
| 14 | Database encryption on the phone | Relies on the phone's file-based encryption, as 1.0.8 did. An app-level key would need native storage and would not protect against someone with the unlocked phone and app |
| 15 | Recovery key for backups | None by design: Wavelength never holds the passphrase. A forgotten passphrase means the backup cannot be opened, and the app says so before the backup is made |
| 16 | Android 7 to 10: PIN as fallback in the lock prompt | Android cannot combine strong biometrics and the screen lock in one prompt below Android 11 |
| 17 | Automatic backup | Not added: the brief rules out automatic upload of clinical media |
| 18 | Supervisor search and professional verification | Untouched and still switched off (`PROFESSIONAL_VERIFY` off), as the brief requires |

## Automated test gaps

- The account-switch guard (independent review finding 7) is covered by code review only. A test needs two
  accounts and a sync answer held back across a log-out, which the harness does not yet model.
- `tools/theme-shots.mjs` (contrast checks) needs Wrangler, which this environment lacks. Light, dark and Arabic
  screens of the new pages were checked with `tools/native-shots.mjs` instead (overflow and page errors, by eye for
  contrast).
- No test ran in Android WebView or WKWebView. Chromium stands in for both.
