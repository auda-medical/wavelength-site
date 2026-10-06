# Wavelength app: store listings

The store apps are native Capacitor 8 apps with the logbook packaged inside them (`mobile/www`, built by `scripts/build-www.mjs` from `src/app/`). The app opens and works offline from the phone; it talks to https://thewavelength.co.uk only for its API (accounts, sync, sign-off, assessments, verification). This keeps both stores' rules on repackaged websites (Apple 4.2 minimum functionality, Google Play webview and minimum functionality policies) satisfied: nothing in the app loads the website, and website pages (privacy notice, terms, Pearls, courses) open in the in-app browser.

Native features, worth naming in review notes and the listing:
- Works offline: open the app, log scans and see progress with no connection; changes sync when the phone is back online.
- App lock with fingerprint or face (Me > Settings > Security), asked at launch and after 90 seconds in the background.
- Camera and video capture hand-off for scan images and clips, photo library picker, all images kept in on-device storage.
- Native share sheet and file saving for PDF, Excel, CSV and backup exports; certificates save and share as PDF.
- Android back button, haptic feedback, system bars in brand navy, in-app browser for website links.

Releases: web changes no longer reach store users on deploy. A change to `src/app/` reaches the apps in the next store build. Keep `/api/app/*` backwards compatible, because older app versions stay installed for weeks.

- Bundle ID / package name: `uk.co.thewavelength.app`
- Builds: GitHub Actions, workflows "Android app" and "iOS app" (`.github/workflows/`). Secrets are listed at the top of each workflow. The Android run also attaches a signed `.apk` for installing on a test phone.
- After `npx cap add` or a Capacitor upgrade, run `python3 scripts/patch-native.py` (iPhone only, portrait, permissions text, Face ID text, camera hand-off visibility on Android, no iCloud backup of `Library/WebKit` on iOS, no Android cloud backup or device-to-device transfer, release signing, navy system bar background) and `npm run assets` (icons and splash from `assets/`, then `../tools/app-icons.mjs` redraws the Android launcher icons full size with a themed-icon layer; needs Playwright).
- Capacitor is pinned to 8.5.1: 8.5.2 injects wrong safe-area values on Android (ionic-team/capacitor#8623). Upgrade only to a release that fixes it.
- Account deletion page for both stores: https://thewavelength.co.uk/app/delete-account/
- Privacy policy: https://thewavelength.co.uk/privacy/ · Terms: https://thewavelength.co.uk/app-terms/ · Support: https://thewavelength.co.uk/contact/
- Review accounts: see "Review accounts" below. Passwords are kept outside the repository.
- Test without a phone: `node tools/e2e-native.mjs <outdir>` runs the real bundle with a stand-in native bridge against a local Worker.

## Before submitting: real phone checks

The automated harness (`tools/e2e-native.mjs`) does not replace real phones. On one Android phone (signed .apk from the Android workflow, then the internal testing track) and, before TestFlight, one iPhone, check:
- Fresh install, sign up, log in, and the review account.
- Cold start with flight mode on, log a scan offline, reconnect, and confirm it syncs.
- Take photo and record clip (camera hand-off), choose from gallery, crop and cover editor.
- App lock: turn on, close the app, reopen, background for over 90 seconds.
- Export PDF, Excel and CSV through the share sheet; certificate PDF; backup and restore.
- Website links open in the in-app browser; Android back button on every screen.
- Log out, log back in; delete account; reinstall.
- iPhone only: images and clips still present after force-closing the app, restarting the phone, low storage and an app update. If any are lost, move images to native file storage on iOS before release.

## Listing images

`mobile/store/`: six phone screenshots (1080x1920, captioned, from the real app with an invented sample logbook; upload them in their numbered order: what it is, logging speed, progress, sign-off, verifiable evidence, privacy), the Google Play feature graphic (1024x500) and the 512 px icon. `mobile/store/ios/`: the same six screens at iPhone 6.9 inch size (1320x2868), which App Store Connect requires. Regenerate both sets after visible app changes: build the bundle, run the local Worker, then `node tools/store-shots.mjs <outdir>`, copy the `play-*.png` files here and the `ios/ios-*.png` files to `mobile/store/ios/`, all as RGB PNGs.

The app is iPhone only (`TARGETED_DEVICE_FAMILY = 1`), so no iPad screenshots are needed.

## Listing text (English)

Name: Wavelength: Ultrasound Logbook
Subtitle (Apple, 30 characters): POCUS logbook and sign-off
Short description (Google, 80 characters): Log ultrasound scans, get signed off and track RCEM, FAMUS and FUSIC targets.
Category: Medical (Apple primary), Education (Apple secondary). Google: Medical.
Keywords (Apple, 100 characters): pocus,ultrasound,logbook,emergency,rcem,famus,fusic,echo,efast,sign-off,portfolio,cpd,supervisor

Description:
Wavelength is a free point-of-care ultrasound logbook for doctors, advanced practitioners and other clinicians who scan.

Log a scan in seconds. Pick the scan type, tick the findings and add images or short clips from your camera or photos. The built-in editor crops, rotates and blacks out identifiers before anything is saved, and saving strips hidden photo data.

Track your pathway. Follow the verified UK pathways, RCEM, FAMUS and FUSIC, or build your own targets. Editable trackers for international pathways and frameworks (EUSEM, ACEM, CPoCUS and ACEP) let you organise your evidence; each organisation and your supervisor decide what counts. One scan can count towards several trackers when it meets their criteria.

Get signed off the same day. Your supervisor signs on your phone, from a secure link on their own phone, or from their supervisor dashboard, and rates image quality and diagnostic accuracy. Record DOPS, formative and summative assessments, scored across six domains.

Evidence anyone can check. Every sign-off, assessment and verified summary carries a code and QR code. Reviewers scan it and see the record as it was signed.

Ready for your portfolio. Export PDF, Excel or CSV with a verified summary for your e-portfolio, college or appraisal.

Your images stay with you. Photos and clips stay on your phone and in backups you save to your own cloud. They are left out of iCloud backups and Android phone-to-phone transfer. If you choose to share them with a supervisor for sign-off, they are encrypted on your phone before upload; Wavelength stores only the encrypted copy and never receives the key, and the copy is deleted after sign-off or when the link expires. Only the written record syncs, and it must never contain patient identifiers.

Works anywhere. Log scans with no signal, in the department or the basement, and Wavelength syncs when you are back online. Lock your logbook with your fingerprint or face.

In nine languages: English, French, Spanish, German, Italian, Polish, Arabic, Russian and Chinese.

Wavelength is independent of RCEM, FAMUS, the Intensive Care Society, EUSEM, ACEM, CPoCUS and ACEP. Your supervisor and accrediting body decide what evidence they accept. Wavelength is a logbook and education tool. It does not diagnose, and it is not a medical device.

## Apple App Privacy (nutrition label)

Data used to track you: none. No third-party advertising or analytics SDKs.

Data linked to you, all for app functionality only, none used for tracking, all deletable in the app (Me > Settings > Account > Delete account):
- Contact info: name, email address (learners and supervisors).
- User content, other user content: the written logbook entries, sign-offs and assessments, and supervisor verification evidence (evidence documents and the supervisor's written explanation).
- User content, photos or videos: images and clips a learner chooses to share with a supervisor in a sign-off link. Optional. Encrypted on your phone before upload; Wavelength stores only the encrypted copy and never receives the key. Deleted after sign-off, on cancel, or when the link expires (14 days).
- Identifiers: user ID.
- Other data: professional registration number (supervisor verification).

Not collected: location, health data, financial info, browsing history, search history, diagnostics, contacts, purchases.

The iOS privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) declares the same data types: Name, Email Address, User ID, Other User Content, Other Data Types and Photos or Videos, each linked to the user, not used for tracking, purpose App Functionality. Keep the two in step.

Device backups: images and clips are excluded from iCloud and iTunes backups (the app marks `Library/WebKit`, where WKWebView keeps them, as excluded on every launch) and from Android cloud backup and device-to-device transfer (`allowBackup="false"` and `res/xml/data_extraction_rules.xml`). The written logbook comes back on a new phone through the Wavelength account sync; images come back only from the learner's own backup file.

## Google Play Data safety

- Data collected, all for app functionality and account management, not shared with third parties, not used for advertising or tracking:
  - Personal info: name, email address; other info: role and organisation (optional), professional registration number and supervisor verification evidence (evidence documents and written explanation).
  - App activity: other user-generated content (written logbook entries, sign-offs and assessments).
  - Photos and videos: photos, videos. Optional: only images and clips a learner chooses to share with a supervisor in a sign-off link. Encrypted on your phone before upload; Wavelength stores only the encrypted copy and never receives the key. Deleted after sign-off, on cancel, or when the link expires (14 days).
- Photos and videos are declared as collected (owner's decision, October 2026, replacing the earlier "not collected" answer). The supervisor's page that decrypts them is served by Wavelength, so the strict end-to-end exemption does not clearly apply. Images and clips otherwise stay on the phone and never sync. The privacy notice explains the encrypted sharing. Apple App Privacy: same answer.
- Data encrypted in transit: yes.
- Fingerprint and face unlock: handled by the phone; the app receives only pass or fail. Not collected.
- Users can request deletion: yes, in the app and at https://thewavelength.co.uk/app/delete-account/ (covers supervisor verification data too).
- Content rating questionnaire (Google) and age rating (Apple): reference and education app, no public user-to-user content, no violence or mature content. Declare the medical and treatment information for professionals where the questionnaire asks, and accept the rating it gives.
- Health apps declaration (Google): choose "Medical: clinical reference and education tools" and "not a medical device".

## Review accounts

Two review accounts, both in the live database, both flagged as test accounts (once the `test_account` flag exists: left out of search, the supervisor directory, statistics, newsletter lists and any email to real users). Passwords are kept outside the repository, given to Firas, and entered only in App Store Connect and Play Console.
- Review learner: appreview@thewavelength.co.uk, onboarded, with a few sample scans using synthetic images only.
- Review supervisor: a second account, to be created before submission, approved for one limited scope (for example Lung) by a normal, recorded admin decision labelled as a review account, and linked only to the review learner. It shows the supervisor dashboard, sign-off requests and assessments.

Never give reviewers production admin credentials. The admin console is not reachable from the app.

## App Review notes (Apple) and access instructions (Google)

Wavelength is a training logbook for clinicians who use point-of-care ultrasound. We provide two test accounts: a learner, and a supervisor approved for one limited area (Lung) and linked to that learner. Log in as the learner to see the main features: tap + to log a scan (any image works), open Progress to see pathway targets, tap a scan and choose Sign off to see in-person sign-off, and open Me > Settings (gear, top right) to change appearance or language, or delete the account. Then log out and log in as the supervisor: the Supervising card on Home (also Me > Learners you supervise) shows the learner's progress and written entries, and any sign-off or assessment requests. The logbook is built into the app and works offline; it connects to our server only to sync the written record, sign-offs and assessments, so clinicians on the web and in the app share one logbook. Website pages such as the privacy notice open in the in-app browser. Try Me > Settings (gear, top right) > Security to lock the app with fingerprint or face, and Me > Export your logbook to save or share a PDF through the share sheet. The app uses the camera and photo library only when the user adds an image. Images stay on the phone unless the learner chooses to share them with a supervisor in a sign-off link: they are then encrypted on the phone before upload and deleted after sign-off. There are no purchases.

## Pending: professional verification (not live yet)

Email verification (built October 2026) needs no change to these answers. Professional and credential verification is off until `PROFESSIONAL_VERIFY = "true"` (see `docs/verification-architecture.md`). Supervisor verification is planned for the first store release, so the privacy answers above and the iOS privacy manifest already declare its data (registration number, evidence documents and written explanation). Before switching it on:
- Privacy notice: the supervisor verification section is drafted on the build branch (6 October 2026). DPIA: "Wavelength DPIA Amendment 2: supervisor verification, search and organisations" is drafted in Claude Docs for Firas to sign.
- Supervisor search (`SUPERVISOR_SEARCH`) shows an opted-in supervisor's name, role, organisation and approved areas to logged-in learners. That is shown to other users of the app, not shared with a third party, so the answers above stand; add a search paragraph to the privacy notice before switching it on.
- Store builds send `X-Wavelength-App` (set from the workflow's version input); `APP_MIN_VERSION` and `APP_RECOMMENDED_VERSION` drive the in-app update banner.
- Review notes: mark the review learner's email as verified, and say that Professional verification is optional and reviewed by the Wavelength team.
- Scan findings stay declared as user content (they describe anonymous patients, not the user's own health).
