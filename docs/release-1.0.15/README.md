# Wavelength 1.0.15 (21): build, tests, signing, Play internal testing and TestFlight

Version name 1.0.15, version code 21, package and bundle ID `uk.co.thewavelength.app`. Branch
`wavelength-1.0.15-20261011` (LF worktree `C:\Users\phira\Wavelength-Cloud\wavelength-1.0.15`), taken from the
Android line `wavelength-android-fixes-20261010` at `5329d8d` (1.0.14 merged). Built 11 October 2026 by Claude Code.
Nothing has been signed, installed, uploaded, pushed or deployed.

## 1. What it adds to 1.0.14

| Commit | Change |
|---|---|
| `7cdc1ab` | The two tested app integrations, applied exactly as their release packages say: supervisor verification display (`docs/supervisor-verification-release/android-integration/app-ui.patch` and `app-css-block.css`), then guide source status and the official directory search box (`docs/source-monitoring/android-integration/app-source-monitoring.after-supervisor.patch`), from release C `1a7bb5f`. Translations from the three batch files (2,254 strings, 35 plurals, i18n check OK) |
| `7c45d79` | The supervisor verification fix in this line's own Worker (`worker-android-line.patch`). That Worker is **not** deployed (it carries the commercial work); production deploys from `main` |
| (docs) | This folder |

No new permission, plugin or native code. No change to what is stored on the phone or to backups.

### Store "What's new" (under 500 characters)

> Supervisor verification now shows exactly what your supervisor is approved for, with the date it was verified and
> any review due, and anything still pending listed separately. Each guide shows when it was last clinically
> reviewed and when its official sources were last checked, names any source that could not be checked, and works
> offline from your last connection.

### For the reviewer and the owner

- **Release E first for the review screens.** Beyond 1.0.14, the Android line adds the commercial "review" screens: opening a sign-off or assessment request marks it "Under review", and a supervisor can **Decline** it with a reason (`/api/app/supervise/request/accept` and `/decline`, migration 0015). On today's server the marking is skipped silently but Decline shows an error. Install on phones and start internal testing after Release E (commercial integration) is live.
- **Server first.** The guide source-check line, the pending-review notice and the directory search come from the
  server (Release B: `5de454a` with migration 0016). Against today's live Worker (Release A) the app shows only the
  two bundled dates and no directory box: it never breaks and never claims a check (proved: section 2). So private
  internal testing can start before Release B; **a public release must wait until Release B is live** (paused under
  D-74 until the Norton alert is resolved).
- The directory search box stays hidden until the server reports directory search available (`DIRECTORY_SYNC`),
  which stays off until a professional body gives permission.
- Supervisor verification: the app shows only what the server says (`verified` only for a current approval;
  pending items listed beside it, never inside an approved group). With the live Worker it falls back to the
  older fields without overclaiming.

## 2. Tests (11 October 2026, Windows, LF worktree)

| Check | Result |
|---|---|
| Unit and Worker tests after the app patches (`node --import ./test/helpers/register.mjs --test --test-concurrency=1 test/*.test.mjs`) | 381: 380 pass, 1 skipped (as documented in the source-monitoring package) |
| The same after the Worker patch (the build) | **409: 408 pass, 1 skipped**, 0 fail |
| `tools/e2e-app-guides.mjs` (release C) on this build's `dist/` | **22/22**: own dates, no check claimed before one, today's check, offline label, newer-version notice, one source failing (14 of 15, named), pending notice and link, search and claim, directories off (no box, manual entry) |
| `tools/e2e-verified.mjs` (release C), `UI=android`, on this build's `dist/` | **276/276** |
| Regression plan steps 3 and 4 (`docs/release-1.0.14/regression-plan.md`) | Steps 3 and 4, rerun on a quiet machine where noted:
  - `e2e-1014` 69/69; `e2e-1013` (Z, N) 28/28; `e2e-1012` 74/74; `e2e-1010` 44/44; `e2e-native` 30/30; `e2e-offline` 16/16; `e2e-about` 15/15; `e2e-upgrade` (1.0.14 APK assets → 1.0.15) 12/12; `theme-shots` both themes pass.
  - **Changed on purpose:** `e2e-1012` G2 now expects "Last clinically reviewed: 4 Oct 2026" instead of "Checked against official sources 4 Oct 2026": the source-status patch never claims a source check that the server has not made.
  - `e2e-1011`: 40 pass, stops at E6 by design (as for 1.0.14). **N11 and N12, investigated 12 Oct on a quiet machine:** N12 (sync over mobile data with the VPN on) always syncs; its rare failures were the check reading the pill in the instant before the app processed the server's answer (a diagnostic that waits up to 3 s found "Synced" at the first read in 4/4 runs). N11 (30 network callbacks in 3 s) sometimes counts 3 sync attempts instead of at most 2, for **both** 1.0.14 and 1.0.15 (1.0.14: 2 of 6 runs; 1.0.15: 4 of 9): the sync code is identical in both; still rate-limited (3 attempts, not 30). Not a 1.0.15 regression; the check's threshold is tight.
| Package | `aapt2 dump badging`: `uk.co.thewavelength.app`, versionCode 21, versionName 1.0.15, compile and target SDK 36, min SDK 24; unsigned (apksigner: no signature) |
| Emulator (step 5), 12 Oct, foldable `wlfold` (Android 16, rootable), airplane mode, emulator-only debug build with WebView debugging (scratch copy) | `e2e-1014-emulator.mjs` **22/22 in 5 of 6 runs, including three consecutive (runs 4 to 6); run 3 stopped at its first step because the emulator's soft keyboard did not open (screen height unchanged), the same check passing in every other run**; `e2e-1015-upgrade-emulator.mjs` (new: 1.0.13 directly to 1.0.15, the owner's real route) **5/5**: same install, still signed in, a 1.0.13 scan with its photo (same bytes) and unsynced state unchanged, a 1.0.13 setting kept, the unfinished-scan protection working on top |
| Fold7 (step 6) | The owner's rows: `HQ 03-WEBSITE-AND-APPandroid-1.0.15-owner-packOWNER-SESSION-1.0.15.md` (one direct 1.0.13 to 1.0.15 session; 1.0.14 is not signed) |

## 3. Unsigned files

`C:\WavelengthSigning\unsigned\wavelength-1.0.15\` (read-only) and `C:\Users\phira\Wavelength-Cloud\handover-1.0.15\android\`:

```
154132de5c2e15a29033ccf45eb78849ca8e191a501897e0401f968f14928881  wavelength-1.0.15-21-unsigned.apk
822c8ef235af7d96b316affb8e4df716c79f7ec88f17ad4580a37147a7611626  wavelength-1.0.15-21-unsigned.aab
```

Built with `WL_APP_VERSION=1.0.15 WL_VERSION_CODE=21 node mobile/scripts/build-www.mjs`, `npx cap sync android`,
then `gradlew.bat --no-daemon bundleRelease assembleRelease` with `WL_VERSION_NAME=1.0.15 WL_VERSION_CODE=21`, JDK
21.0.12, no keystore. `mobile/node_modules` was copied from the 1.0.14 worktree (identical `package-lock.json`).

## 4. Signing (owner, this PC)

Double-click `C:\WavelengthSigning\SIGN-1.0.15.cmd`. It runs `wl-sign-android.mjs 1.0.15` with Node.js: **no
PowerShell and no `-ExecutionPolicy Bypass`** (HQ decision D-74). It checks the unsigned checksums above and the
package line, confirms the keystore holds the original identity (certificate `ee30bfd2…a1e0`, as 1.0.8 to 1.0.13)
**before** signing, signs and verifies the APK (v2 and v3) and AAB, proves every file inside is unchanged, and writes
`C:\WavelengthSigning\signed\SHA256SUMS-1.0.15-signed.txt`. Passwords only at its hidden prompts; it stops at the
first mismatch and never overwrites. Rehearsed with the throwaway emulator key (`--rehearsal`, 11 Oct 22:39): every check passed; a wrong password is refused before anything is signed.

Order: sign 1.0.14 first if it is still to be installed on the Fold7 (its owner session), then 1.0.15.

## 5. Google Play internal testing (private; authorised under D-73)

Not done by Claude: the built-in browser is not signed in to Play Console, and Claude never enters passwords.
Status of the Play account (app record, Play App Signing enrolment, earlier uploads) is **unknown**: the 8 October
record says no Play upload has ever been made.

1. Play Console > Wavelength (`uk.co.thewavelength.app`) > Testing > **Internal testing** > Create new release.
2. **Play App Signing (a lasting decision; take it before the first upload).** On the first AAB upload Play asks
   which **app signing key** it should use to sign what it delivers to phones:
   - *Google-generated key* (Play's default): simplest; your original key (`ee30bfd2…a1e0`) becomes only the
     **upload key**. But Play-installed builds then carry Google's certificate, so a phone with the side-loaded
     1.0.13 or 1.0.14 cannot take the Play build as an update (Android refuses; uninstalling loses local data unless
     backed up first).
   - *Your original key as the app signing key* ("export and upload a key from Java keystore", with Google's PEPK
     tool, which encrypts the key for Google on this PC): Play builds then match the side-loaded ones and update
     them in place. This sends the private key (encrypted) to Google: owner's decision.
   Claude has not chosen. Until it is decided, keep the Fold7 on side-loaded builds; internal testers on fresh
   installs are unaffected either way.
3. Upload `C:\WavelengthSigning\signed\wavelength-1.0.15-21-release.aab`. Release name `1.0.15 (21)`; release notes
   from section 1.
4. Testers: an email list containing only you (and Zahra if wanted). Do not add public testers or roll out to
   production, closed or open tracks (not authorised).
5. App content declarations, if Play asks for them: Data safety answers in `mobile/STORE.md` stay true (1.0.15
   collects nothing new: the source-status endpoint is public and read-only; directory search uses the existing
   login and stays off). Target API 36.
6. Install from the internal-testing link on the Fold7 only if 1.0.15 should replace the side-loaded build; an
   install from Play over a side-loaded build works only when the signing certificate matches (step 2).

## 6. iPhone and TestFlight (owner, on a Mac; authorised under D-73)

iOS builds from the same `src/app/`, so the guide source status and the supervisor display are already in the iOS
web bundle; the Android-only 1.0.14 camera work (`WLChromeClient`, `CapturePlugin`) has no iOS counterpart and needs
none (iOS keeps captures in the app sandbox). Claude cannot operate a Mac.

1. On the Mac: `docs/release-1.0.12/mac-xcode.md` sections 1 to 5 (Xcode 16+, Node 22.5+, team, signing), using
   this branch (bring it across as a bundle: `git bundle create wl-1.0.15.bundle wavelength-1.0.15-20261011`, or
   push it yourself).
2. In `mobile/`: `npm ci`, then `WL_APP_VERSION=1.0.15 WL_VERSION_CODE=21 node scripts/build-www.mjs`, then
   `npx cap sync ios`.
3. Archive with `MARKETING_VERSION=1.0.15 CURRENT_PROJECT_VERSION=<above the last upload; 21 if none>`.
4. Validate App, then **Distribute to TestFlight, internal testers only**. No App Store submission (not
   authorised). Export compliance: `ITSAppUsesNonExemptEncryption = false` unchanged; confirm against Apple's
   current guidance.
5. Device checks: `docs/release-1.0.12/checklist-iphone.md`, plus: a guide online, then in Airplane mode (offline
   label); links in the notices open in the in-app browser; Me > Supervisors shows the verification panel.

## 7. Phone checks before any release (Android and iPhone)

- Open a guide online, then in Flight mode: the offline label "Shown from this device's last connection" appears.
- Links in the notices open in the in-app browser.
- Settings > About shows 1.0.15 (21); logbook, photos and clips survive the update from 1.0.14.
- Supervisor screens: the verification panel matches the website's admin view for the same account.
