# Wavelength app: store listings

The store apps are native Capacitor 8 apps with the logbook packaged inside them (`mobile/www`, built by `scripts/build-www.mjs` from `src/app/`). The app opens and works offline from the phone; it talks to https://thewavelength.co.uk only for its API (accounts, sync, sign-off, assessments, verification). This keeps both stores' rules on repackaged websites (Apple 4.2 minimum functionality, Google Play webview and minimum functionality policies) satisfied: nothing in the app loads the website, and website pages (privacy notice, terms, Pearls, courses) open in the in-app browser.

Native features, worth naming in review notes and the listing:
- Works offline: open the app, log scans and see progress with no connection; changes sync when the phone is back online.
- App lock with fingerprint or face (Me > Security), asked at launch and after 90 seconds in the background.
- Camera and video capture hand-off for scan images and clips, photo library picker, all images kept in on-device storage.
- Native share sheet and file saving for PDF, Excel, CSV and backup exports; certificates save and share as PDF.
- Android back button, haptic feedback, system bars in brand navy, in-app browser for website links.

Releases: web changes no longer reach store users on deploy. A change to `src/app/` reaches the apps in the next store build. Keep `/api/app/*` backwards compatible, because older app versions stay installed for weeks.

- Bundle ID / package name: `uk.co.thewavelength.app`
- Builds: GitHub Actions, workflows "Android app" and "iOS app" (`.github/workflows/`). Secrets are listed at the top of each workflow. The Android run also attaches a signed `.apk` for installing on a test phone.
- After `npx cap add` or a Capacitor upgrade, run `python3 scripts/patch-native.py` (portrait, permissions text, Face ID text, camera hand-off visibility on Android, no Android cloud backup, release signing, navy system bar background) and `npm run assets` (icons and splash from `assets/`).
- Capacitor is pinned to 8.5.1: 8.5.2 injects wrong safe-area values on Android (ionic-team/capacitor#8623). Upgrade only to a release that fixes it.
- Account deletion page for both stores: https://thewavelength.co.uk/app/delete-account/
- Privacy policy: https://thewavelength.co.uk/privacy/ · Terms: https://thewavelength.co.uk/app-terms/ · Support: https://thewavelength.co.uk/contact/
- Review account: appreview@thewavelength.co.uk (password kept outside the repo, given to Firas). Keep it in the live D1 `learners` table, onboarded, with a few sample scans.
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

`mobile/store/`: six phone screenshots (1080x1920, captioned, from the real app with an invented sample logbook), the Google Play feature graphic (1024x500) and the 512 px icon. Regenerate after visible app changes: build the bundle, run the local Worker, then `node tools/store-shots.mjs <outdir>` and copy the `play-*.png` files here as RGB PNGs.

## Listing text (English)

Name: Wavelength: Ultrasound Logbook
Subtitle (Apple, 30 characters): POCUS logbook and sign-off
Short description (Google, 80 characters): Log ultrasound scans, get signed off and track RCEM, FAMUS, EUSEM and ACEM targets.
Category: Medical (Apple primary), Education (Apple secondary). Google: Medical.
Keywords (Apple, 100 characters): pocus,ultrasound,logbook,emergency,rcem,famus,fusic,eusem,acem,echo,efast,sign-off,portfolio,cpd

Description:
Wavelength is a free point-of-care ultrasound logbook for doctors, advanced practitioners and other clinicians who scan.

Log a scan in seconds. Pick the scan type, tick the findings and add images or short clips from your camera or photos. The built-in editor crops, rotates and blacks out identifiers before anything is saved, and saving strips hidden photo data.

Track every target. Choose the pathways you are working towards: RCEM, FAMUS, FUSIC, the EUSEM core compendium (basic and advanced), ACEM, CPoCUS, ACEP, or your own targets. One scan counts towards every pathway it fits, and progress bars show what is left.

Get signed off the same day. Your supervisor signs on your phone, from a secure link on their own phone, or from their supervisor dashboard, and rates image quality and diagnostic accuracy. Record DOPS, formative and summative assessments, scored across six domains.

Evidence anyone can check. Every sign-off, assessment and verified summary carries a code and QR code. Reviewers scan it and see the record as it was signed.

Ready for your portfolio. Export PDF, Excel or CSV with a verified summary for your e-portfolio, college or appraisal.

Your images stay with you. Photos and clips stay on your phone and in backups you save to your own cloud. Only the written record syncs, and it must never contain patient identifiers.

Works anywhere. Log scans with no signal, in the department or the basement, and Wavelength syncs when you are back online. Lock your logbook with your fingerprint or face.

In nine languages: English, French, Spanish, German, Italian, Polish, Arabic, Russian and Chinese.

Wavelength is independent of RCEM, FAMUS, the Intensive Care Society, EUSEM, ACEM, CPoCUS and ACEP. Your supervisor and accrediting body decide what evidence they accept. Wavelength is a logbook and education tool. It does not diagnose, and it is not a medical device.

## Apple App Privacy (nutrition label)

Data used to track you: none. No third-party advertising or analytics SDKs.

Data linked to you:
- Contact info: name, email address (app functionality).
- User content: other user content, the written logbook entries, sign-offs and assessments (app functionality).
- Identifiers: user ID (app functionality).

Not collected: photos and videos (they stay on the device; images shared in a sign-off link are end-to-end encrypted and the server cannot read them, which Apple treats as not collected), location, health data, financial info, browsing history, diagnostics, contacts.

## Google Play Data safety

- Data collected: Personal info (name, email address, other info: role and organisation), App activity (other user-generated content: logbook text entries). Purpose: app functionality, account management. Not shared with third parties. Optional fields: role and organisation.
- Photos and videos: not collected (owner's decision, 5 October 2026). Images and clips stay on the phone. When a learner chooses to share them in a sign-off link, the phone encrypts them (AES-GCM) and the key travels only in the link, so neither Auda Medical nor any intermediary can read what the server holds; it is deleted at sign-off, cancel or 14 days. Google exempts end-to-end encrypted data from collection, and Apple counts only data readable by the developer or a third party. The privacy notice explains the encrypted sharing. Answer "collected" instead if the server ever holds a key, a readable copy, or a thumbnail. Apple App Privacy: same answer.
- Data encrypted in transit: yes.
- Fingerprint and face unlock: handled by the phone; the app receives only pass or fail. Not collected.
- Users can request deletion: yes, in the app and at https://thewavelength.co.uk/app/delete-account/
- Content rating questionnaire (Google) and age rating (Apple): reference and education app, no public user-to-user content, no violence or mature content. Declare the medical and treatment information for professionals where the questionnaire asks, and accept the rating it gives.
- Health apps declaration (Google): choose "Medical: clinical reference and education tools" and "not a medical device".

## App Review notes (Apple) and access instructions (Google)

Wavelength is a training logbook for clinicians who use point-of-care ultrasound. Log in with the review account below. To see the main features: tap + to log a scan (any image works), open Progress to see pathway targets, tap a scan and choose Sign off to see in-person sign-off, and open Me to change language or delete the account. The logbook is built into the app and works offline; it connects to our server only to sync the written record, sign-offs and assessments, so clinicians on the web and in the app share one logbook. Try Me > Security to lock the app with fingerprint or face, and Me > Export your logbook to save or share a PDF through the share sheet. The app uses the camera and photo library only when the user adds an image, and images stay on the phone. There are no purchases.

## Pending: professional verification (not live yet)

Email verification (built October 2026) needs no change to these answers. Professional and credential verification is off until `PROFESSIONAL_VERIFY = "true"` (see `docs/verification-architecture.md`). Before switching it on:
- Apple App Privacy: add Other Data (professional registration number, credential evidence), linked to the user, for app functionality.
- Google Data safety: add Personal info > Other info (registration number, credential evidence), collected, not shared, for app functionality and account management.
- Review notes: mark the review account's email as verified, and say that Professional verification is optional and reviewed by the Wavelength team.
- The iOS privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) is in place: add the new data types there too. Scan findings stay declared as user content (they describe anonymous patients, not the user's own health), and encrypted image sharing stays not collected, as above.

