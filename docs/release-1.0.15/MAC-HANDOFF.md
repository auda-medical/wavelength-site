# Wavelength 1.0.15 (21) on iPhone: the Mac handoff pack

One session on your Mac (about 60 to 90 minutes, most of it waiting for builds). Claude prepared everything that can be
done without a Mac; what is left needs your Apple ID, its two-factor confirmation, your team and a physical iPhone.
Nothing is submitted to the App Store; the build goes to **TestFlight internal testing** only, and only after the
device checks in section 4 pass.

## 1. What is already done (Windows, 12 October 2026)

| Item | State |
|---|---|
| Feature parity with Android 1.0.15 | The iPhone app is built from the same `src/app/` bundle: supervisor verification display, guide source status (online and offline), directory search box (hidden while directories are off), the 1.0.14 safety copies of photos, clips and unfinished scans, typed-form keeping, annotation and colour controls, Back handling (swipe-back on iPhone) |
| Android-only parts | The private-camera-folder code (`WLChromeClient`, `CapturePlugin`) is loaded on Android only (`native.js`: `PLATFORM === 'android'`). iOS needs no counterpart: the camera never saves to Photos unless the user asks |
| Backups and device transfer (Android `data_extraction_rules`) | iOS counterpart already in place: `AppDelegate.excludeWebKitFromBackup()` marks `Library/WebKit` (where images and the logbook live) as excluded from iCloud and computer backups, on every launch |
| Privacy strings (`Info.plist`) | Camera, microphone (sound removed from clips), photo library read and add, Face ID; `ITSAppUsesNonExemptEncryption` false |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | Present: no tracking; collected data (name, email, user ID, other user content, photos or videos, other data) for app functionality only; required-reason API declarations |
| Capacitor plugins | `npx cap sync ios` run on 12 Oct: the Swift Package list already matches 1.0.15's plugins (no tracked change) |
| Version | Set at archive time: `MARKETING_VERSION=1.0.15`, `CURRENT_PROJECT_VERSION=21` (or above your last TestFlight build) |

## 2. On the Mac before you start

- **Xcode:** the current release from the Mac App Store. Apple requires App Store Connect uploads to be built with a
  recent SDK (from April 2026, Xcode 26 and the iOS 26 SDK); Xcode will say so at upload if it is too old.
- **Node.js** 22.5 or later (`node -v`), and **Git**.
- Xcode > Settings > Accounts: your Apple ID, with your developer team listed. (Two-factor confirmation on your phone.)
- An iPhone with a cable, Developer Mode on (Settings > Privacy & Security > Developer Mode, then restart).

## 3. Build (Terminal, then Xcode)

1. Copy the source to the Mac: `D:\Wavelength-HQ\03-WEBSITE-AND-APP\ios-1.0.15\wavelength-1.0.15-source.tar` (the
   branch's files exactly, made with `git archive`; its SHA-256 is in `SHA256SUMS.txt` beside it; no secrets). Then:
   ```
   mkdir wavelength-1.0.15 && tar -xf wavelength-1.0.15-source.tar -C wavelength-1.0.15
   cd wavelength-1.0.15/mobile
   npm ci
   WL_APP_VERSION=1.0.15 WL_VERSION_CODE=21 node scripts/build-www.mjs
   npx cap sync ios
   open ios/App/App.xcodeproj
   ```
   (A plain archive, not a Git clone: the repository's history is shallow on this PC, and the Mac needs only the files.)
2. In Xcode: select the **App** target > Signing & Capabilities > Team: your team; **Automatically manage signing** on;
   bundle identifier `uk.co.thewavelength.app` (unchanged).
3. Select your iPhone as the run destination, press **Run**. On the phone: Settings > General > VPN & Device
   Management > trust the developer, if asked.

## 4. Device checks (before any upload)

Work through `docs/release-1.0.12/checklist-iphone.md`, then these 1.0.14 and 1.0.15 rows:

| # | Check | Pass when |
|---|---|---|
| D1 | **Durable storage**: add a scan with a photo and a clip; force-quit; reopen; then restart the phone; then wait a day without opening | Scan, photo and clip still there each time |
| D2 | **Safety copy**: start a scan, take a photo, force-quit before saving | Home offers the photo back; nothing is added by itself |
| D3 | **Unfinished typed scan**: type into a new scan, force-quit | The typed form is offered back |
| D4 | **Camera and clips**: take a photo and a 10-second clip from the app | Neither appears in the Photos app; the clip has no sound |
| D5 | **Face ID**: turn on app lock; lock the phone; reopen | Face ID asked; after a failed attempt the passcode route works |
| D6 | **Offline**: Airplane mode; open the app; add a scan; open a guide | Works; guide shows "Shown from this device's last connection"; sync waits and then completes when online |
| D7 | **Errors**: open with no connection on first launch after install | Plain message, no blank screen |
| D8 | **Supervisor display**: Me > Supervisors with an approved supervisor | Verified status and More info as on Android |
| D9 | **Accessibility**: VoiceOver on: Home, a scan, a guide; Larger Text at the largest size | Every control read out; nothing cut off or overlapping |
| D10 | **Privacy**: Settings > Wavelength | Only camera, photos, Face ID (and microphone when a clip was recorded) |
| D11 | **Backup exclusion**: Settings > [your name] > iCloud > Manage Storage > Backups > this iPhone | Wavelength is listed with a tiny size (its images are excluded) |
| D12 | **Links**: privacy notice, terms, source links in a guide | Open in the in-app browser |

Note any failure and stop: do not upload.

## 5. TestFlight (internal testing only)

1. Product > Archive (with the version numbers above). In the Organizer: **Validate App**, then **Distribute App >
   App Store Connect > Upload**. Xcode signs with your team; accept its suggestions.
2. App Store Connect > the app > TestFlight: when processing finishes, answer the export-compliance question (the build
   says no non-exempt encryption; confirm against Apple's current guidance), add yourself (and Zahra if wanted) under
   **Internal Testing**. No external testers, no App Store submission.
3. **What to Test** (paste):
   > Supervisor verification status and More info; guide source dates and the offline label; photos, clips and
   > unfinished scans kept safe if the app closes; annotation size and colour; sign-in, sync and app lock as before.
4. App Privacy answers in App Store Connect: unchanged from `mobile/STORE.md` (1.0.15 collects nothing new).

## 6. Tell Claude

Only the results: which device checks passed, the TestFlight build number, and anything that failed. Never send
passwords, codes, certificates or screenshots of account screens.
