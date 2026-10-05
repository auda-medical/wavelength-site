# Wavelength app: store listings

The store apps are thin native shells (Capacitor 8) around the live web app at https://thewavelength.co.uk/app/. Every change to the web app reaches store users at once. Rebuild the shells only for native changes (icons, permissions, Capacitor upgrades) or when a store asks for a newer SDK.

- Bundle ID / package name: `uk.co.thewavelength.app`
- Builds: GitHub Actions, workflows "Android app" and "iOS app" (`.github/workflows/`). Secrets are listed at the top of each workflow.
- After `npx cap add` or a Capacitor upgrade, run `python3 scripts/patch-native.py` (portrait, permissions text, app-bound domains, no Android cloud backup, release signing) and `npm run assets` (icons and splash from `assets/`).
- The web app treats the shell as installed through the `WavelengthApp` user agent suffix, so install prompts disappear.
- Account deletion page for both stores: https://thewavelength.co.uk/app/delete-account/
- Privacy policy: https://thewavelength.co.uk/privacy/ · Terms: https://thewavelength.co.uk/app-terms/ · Support: https://thewavelength.co.uk/contact/
- Review account: appreview@thewavelength.co.uk (password kept outside the repo, given to Firas). Keep it in the live D1 `learners` table.

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
- Photos and videos: not collected (processed on device; shared images are end-to-end encrypted).
- Data encrypted in transit: yes.
- Users can request deletion: yes, in the app and at https://thewavelength.co.uk/app/delete-account/
- Content rating questionnaire (Google) and age rating (Apple): reference and education app, no public user-to-user content, no violence or mature content. Declare the medical and treatment information for professionals where the questionnaire asks, and accept the rating it gives.
- Health apps declaration (Google): choose "Medical: clinical reference and education tools" and "not a medical device".

## App Review notes (Apple) and access instructions (Google)

Wavelength is a training logbook for clinicians who use point-of-care ultrasound. Log in with the review account below. To see the main features: tap + to log a scan (any image works), open Progress to see pathway targets, tap a scan and choose Sign off to see in-person sign-off, and open Me to change language or delete the account. The app loads its interface from our website so that clinicians on the web and in the app share one logbook. It uses the camera and photo library only when the user adds an image. There are no purchases.

## Pending: professional verification (not live yet)

Email verification (built October 2026) needs no change to these answers. Professional and credential verification is off until `PROFESSIONAL_VERIFY = "true"` (see `docs/verification-architecture.md`). Before switching it on:
- Apple App Privacy: add Other Data (professional registration number, credential evidence), linked to the user, for app functionality.
- Google Data safety: add Personal info > Other info (registration number, credential evidence), collected, not shared, for app functionality and account management.
- Review notes: mark the review account's email as verified, and say that Professional verification is optional and reviewed by the Wavelength team.
- Separately, see the flags in `docs/verification-integrations.md` section 5: no app-level `PrivacyInfo.xcprivacy` in the iOS project, and whether scan findings and encrypted image sharing should be declared.

