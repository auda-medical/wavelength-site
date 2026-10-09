# Wavelength 1.0.12 on iPhone: Mac and Xcode setup, build and TestFlight preparation

Nothing here has been run: the cloud workspace has no Mac. The steps follow the repository as it stands (Capacitor
8.5.1, Swift Package Manager, iOS 15 minimum, iPhone only) and the existing GitHub workflow
`.github/workflows/ios.yml`. Do not paste credentials, certificates or private keys into a chat.

## 1. Check the Mac first

Run in Terminal and keep the answers with this release:

```
sw_vers                      # macOS version
xcodebuild -version          # Xcode 16 or later is needed for Capacitor 8; the workflow prefers Xcode 26
xcode-select -p              # should point inside Xcode.app, not CommandLineTools
node -v                      # 22.5 or later (the tests need it; the build needs 18+)
git --version
```

If `xcode-select -p` shows CommandLineTools: `sudo xcode-select -s /Applications/Xcode.app`. Open Xcode once and
let it install its components. In Xcode > Settings > Accounts, add the Apple ID that belongs to the Apple Developer
organisation account and check the organisation team appears. You need the Admin or App Manager role to manage
signing and App Store Connect.

## 2. Get the 1.0.12 source

Either clone your repository and check out the 1.0.12 branch once it has been pushed (by you), or apply the patch
series from the handover (`windows-patches.md` explains the same `git am` steps, which work on a Mac too). Confirm the
tree:

```
git rev-parse HEAD^{tree}    # must match the final tree in the handover manifest
```

## 3. Build the logbook bundle and sync the iOS project

```
cd mobile
npm ci
WL_APP_VERSION=1.0.12 node scripts/build-www.mjs   # builds the site and assembles mobile/www
npx cap sync ios                                   # copies www into ios/App/App/public and resolves the Swift packages
```

`npx cap sync ios` also writes `ios/App/App/capacitor.config.json` (not committed). The `ios.scheme` value that pointed
at a scheme called "Wavelength" was removed in 1.0.12: the Xcode scheme is App, as the workflow uses.

## 4. Open the project and set signing

```
npx cap open ios          # or open ios/App/App.xcodeproj
```

In Xcode, select the App project, then the App target:

1. Signing & Capabilities: tick Automatically manage signing; Team: your organisation; Bundle Identifier:
   `uk.co.thewavelength.app` (already set). No extra capabilities are needed (no push, no App Groups, no
   associated domains in 1.0.12).
2. General > Identity: Version (MARKETING_VERSION) `1.0.12`; Build (CURRENT_PROJECT_VERSION) a number higher than
   any build already uploaded to App Store Connect.
3. Check the two new files are in the App target (File inspector > Target Membership): `WLNetworkPlugin.swift` and
   `WLBridgeViewController.swift`. They are in the project file already.
4. Info.plist already holds the purpose strings: camera, microphone (clips: sound is removed), photo library and
   adding to photos, Face ID. `PrivacyInfo.xcprivacy` is in the target; 1.0.12 adds no API that needs a declared
   reason (NWPathMonitor does not).

## 5. Build and run on an iPhone

Connect an iPhone (Developer Mode on: Settings > Privacy & Security > Developer Mode), choose it as the run
destination and press Run. Then work through `checklist-iphone.md`.

From the command line, the workflow's own build (without upload) is:

```
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/Wavelength.xcarchive DEVELOPMENT_TEAM=<your team ID> CODE_SIGN_STYLE=Automatic \
  MARKETING_VERSION=1.0.12 CURRENT_PROJECT_VERSION=<build number> -allowProvisioningUpdates archive
```

## 6. TestFlight preparation (no upload without your written approval)

1. App Store Connect: the app record for `uk.co.thewavelength.app` exists or is created by you.
2. App Privacy answers: from `mobile/STORE.md`. 1.0.12 collects nothing new: annotations, redacted copies and
   pictures stay on the phone; ending supervision and the new dashboard list use existing account data.
3. Export compliance: Info.plist says `ITSAppUsesNonExemptEncryption = false`. The app uses HTTPS and also its own
   AES-GCM encryption for backups and for images shared with a supervisor (unchanged since 1.0.9). Please confirm
   this answer with Apple's current export compliance guidance before submitting; it was not reviewed here.
4. Review notes and the review account (`appreview@thewavelength.co.uk`) as in STORE.md. Mention that the app works
   offline and that photos never leave the phone unless the learner shares them encrypted.
5. Archive (Product > Archive), then in the Organizer: Validate App. **Distribute to TestFlight only after you
   approve it in writing.** The GitHub workflow "iOS app" does archive and upload in one step: run it only with
   approval.

## 7. Known iPhone limitations to check on the device

- iOS gives apps no supported way to see a VPN: the sync details say "VPN status not available on this phone".
- Clip preparation needs iOS 14.5 or later (MediaRecorder); older phones are offered still images.
- WKWebView storage for images: confirm on a device that photos survive restarts and a day away (checklist 6.1, 6.2).
- No universal links: invitation and sign-off links open in Safari on the website, as before.
