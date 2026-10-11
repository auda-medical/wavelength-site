# Privacy notice and logbook terms for Android 1.0.14: production-line port

| | |
|---|---|
| Branch | `wavelength-privacy-1014-20261011`, from Release B `d024bf7` |
| Source | Android line commit `a89c67d` ("website text prepared, not deployed"), which does not apply to the production line because the surrounding privacy text differs |
| Status | **Prepared, not deployed.** Needed live before any public 1.0.14 release (decision D-23) |

## What changes (build.js only)

1. Privacy notice, "Wavelength app and logbook": a new passage after "Short clips you record stay on your device like
   photos." about Android camera captures going to the app's private storage, and the safety copies of unfinished
   photos, clips and typed scans (never leave the phone, excluded from backups and device transfer, removed on save,
   discard or account deletion, kept per account). The passage is word-for-word the Android line's (checked).
2. Logbook terms, "Where your data lives": "Unfinished photos, clips and scans are kept on your device until you save
   or discard them."
3. Privacy notice `updated` date: set to 11 October 2026 here. **Set it to the actual deployment date** when this ships.

## Checks

`node build.js`: the new text appears in `dist/privacy/index.html` and `dist/app-terms/index.html`. Tests 267/267.

## How it ships

On its own or together with Release B, from a clean LF export, with the owner's approval. It changes no Worker code,
no database and no app. It must not ship before the owner has reviewed the wording with DPIA Amendment 3 (Android
on-device safety copies).
