# Wavelength 1.0.9: iOS readiness

Date: 8 October 2026. **This is a static review only.** This environment has no Mac, no Xcode and no iPhone. Nothing
here was compiled, signed or run on iOS. No claim is made that the iOS app builds or works.

## What iOS shares with Android

All 1.0.9 changes to behaviour are in the shared logbook code that both apps carry (`src/app/*.js`, bundled into
`mobile/www` by `mobile/scripts/build-www.mjs`):
- the offline start;
- sync with retries and acknowledgements;
- status wording;
- encrypted backups;
- the app lock rules;
- About Wavelength;
- the recovery screen;
- the review fixes.

No Swift or Objective-C file changed in 1.0.9 (`git diff pre-1.0.9-baseline -- mobile/ios` is empty). The browser
tests ran this shared code in Chromium. iOS runs it in WKWebView, which is a different engine (WebKit).

## Static checks done

| Item | Finding |
| --- | --- |
| Bundle ID | `uk.co.thewavelength.app` (`mobile/capacitor.config.json`), same as Android |
| Version fields | `Info.plist` reads `$(MARKETING_VERSION)` and `$(CURRENT_PROJECT_VERSION)`. The project defaults are `1.0` and `1`, so archive with `MARKETING_VERSION=1.0.9 CURRENT_PROJECT_VERSION=15` (or set them in Xcode). About reads these through `App.getInfo()` |
| Deployment target | iOS 15.0. Module `import()` (used to load Argon2 only when needed), `AbortController`, `crypto.subtle` AES-GCM and HKDF are all in WebKit on iOS 15 |
| Face ID text | `NSFaceIDUsageDescription` present: "Wavelength uses Face ID to unlock your logbook when you turn on app lock." |
| App lock | iOS uses `deviceOwnerAuthentication` (Face ID or Touch ID, passcode fallback). `pinFallback` is true on iOS, so the "no screen lock" wording applies |
| Plugins | `CapApp-SPM/Package.swift` lists all 7 plugins (App, Browser, Filesystem, Haptics, Preferences, Share, NativeBiometric), the same set as Android |
| Backups of WebKit data | `AppDelegate.excludeWebKitFromBackup()` keeps the logbook out of iCloud and computer backups, unchanged |
| Privacy manifest | `PrivacyInfo.xcprivacy` present, unchanged. 1.0.9 collects nothing new |
| Content Security Policy | `script-src 'self'`; Argon2 is plain JavaScript from the app bundle, no WebAssembly or `eval`, so the policy allows it |
| Web assets | `mobile/ios/App/App/public` is git-ignored, so `npx cap sync ios` must run on the Mac after building `www` |
| Export compliance | `ITSAppUsesNonExemptEncryption = false`. 1.0.9 adds AES-256-GCM and Argon2id for the learner's own backups. **Fero to confirm this declaration** before submitting |

## Checks that need a Mac (none done)

Build:
1. `cd mobile && WL_APP_VERSION=1.0.9 WL_VERSION_CODE=15 node scripts/build-www.mjs && npx cap sync ios`.
2. Open `ios/App/App.xcodeproj`, set the version to 1.0.9 and the build to 15, and build for a device and for the
   simulator with no warnings that matter.

Runtime, on an iPhone (Face ID) and ideally a Touch ID device:
1. Upgrade over the current App Store or TestFlight build: same account, logbook, photos, clips and supervisor
   links kept (the same idea as Android checklist sections A and D).
2. Offline start in aeroplane mode: lock prompt first, then the logbook, never stuck.
3. An offline scan syncs after reconnecting and appears on the website (Android checklist section C).
4. App lock: Face ID, then cancel and use the passcode. Return after 90 s: asks again.
5. Encrypted backup:
   - `crypto.subtle` is available under `capacitor://localhost`;
   - the Argon2 module loads with dynamic `import()`;
   - note how long a backup takes on an older iPhone.
6. The backup file goes to Files through the share sheet. Restore it with the file picker, including a 50 MB+
   backup.
7. About shows 1.0.9 (15). The support email opens Mail.
8. WKWebView storage survives an app update and a phone restart.
9. Light, dark and Arabic (right to left) screens, and the Dynamic Island and home indicator insets.

## Known differences to watch

- Whether WKWebView ever clears an app's own IndexedDB under storage pressure was not checked here. Worth confirming
  with a large logbook (check 8).
- iOS suspends the app soon after it goes to the background, so a sync started just before leaving may finish only
  on return. The retry schedule covers this.
