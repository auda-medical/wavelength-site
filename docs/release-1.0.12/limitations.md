# Wavelength 1.0.12: known limitations and what was not done

## Not done, by instruction

- Nothing was pushed, fetched or merged, and GitHub was not contacted. Issue #2 was not read or updated: the owner
  should post the handoff there when the work is pushed.
- Nothing was deployed, and no production database or Cloudflare setting was touched. No migration is needed.
- Nothing was signed, and nothing was uploaded to Google Play, the App Store or TestFlight.

## Not possible in the workspace

- **No iPhone build.** There was no Mac or Xcode in the workspace.
  - The Swift plugin, the bridge view controller and the project file entries were written and checked by tests that
    read the source and the project file, but they were never compiled.
  - Everything in `checklist-iphone.md` is NOT RUN.
- **No physical Android phone.** The unsigned APK and AAB were built with Gradle. Behaviour was checked in Chromium with
  a stand-in native bridge (`tools/native-harness.mjs`), not on a device.
  - The camera, the real VPN, TalkBack, system font scale, app lock with real biometrics, and clip preparation speed
    on a phone are all NOT RUN.
- **Motion** was recorded in headless Chromium. Smoothness on a mid-range phone is not proven.

## Product limitations

- **VPN on iPhone:** iOS gives apps no supported way to tell whether a VPN is on. The iPhone app says so and gives
  general advice. It never guesses and never changes network settings.
- **Clip preparation** re-encodes in real time, so a 10 s clip takes about 10 s or more. It needs MediaRecorder (iOS
  14.5+, all supported Android versions).
- **Redaction** is solid boxes only. There is no automatic detection of text on screen. Blurring is deliberately not
  offered.
- **Annotations on clips** are drawn into the saved clip. Only images keep an editable copy (the base picture plus
  annotations) and have the pencil button. To change a clip's annotations, remove it and add the clip again.
- **Pictograms** are simple schematic drawings for orientation, not anatomical illustrations. They were drawn for this
  release and need clinical review, as the pearl graphics do.
- **Guides in the app** are a snapshot taken at build time. A guide updated on the website reaches store users with the
  next store build. The in-app guide shows its checked date.
- **Translations** of the new text are machine-drafted. A native speaker should review before promoting a language.
  Guides stay in English in every language, marked as such.
- **Supervisor trainee lists** are online only, like the rest of the supervisor dashboard. Only written entries are
  shown; images still travel only in encrypted sign-off links.
- **"Ended recently"** shows 90 days. Older ended links stay in the database and the audit log.
- **Deep links:** universal links (iOS) and app links (Android) are still not configured. Invitation and sign-off links
  open in the browser.
- **Export compliance:** `ITSAppUsesNonExemptEncryption = false` is unchanged and should be confirmed by the owner.

## Test caveats

See `test-report.md`.

- `e2e-1011` N11 and N12 are timing-sensitive. A request probe showed that 1.0.11 and 1.0.12 make the same sync
  attempts.
- `e2e-1011` stops at E6, which drives the 1.0.11 Cover mode that 1.0.12 replaced. Its guarantees are checked by
  `e2e-1012`.
- `e2e-supervisor-ui` predates the 1.0.10 and 1.0.11 forms and fails on 1.0.11 too.
