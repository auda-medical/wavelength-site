# Wavelength 1.0.11: release notes, findings and acceptance checklist

Android 1.0.11, version code 17, package `uk.co.thewavelength.app`. Prepared on 9 October 2026 in a cloud workspace
from the verified 1.0.10 tree `877157ae7ffd7d9f47103e40a0f970990ccb351f` (cloud seed commit
`2beb2530c7da1c2f57bc7266eb1ca8de41cde005`), branch `wl-1.0.11`. Nothing was deployed, signed, published, pushed or
migrated; GitHub and production were not contacted. All test data is synthetic.

The physical-device checklist is `docs/checklist-1.0.11-android.md`. Every item there is NOT RUN.

## 1. Findings from the physical-device report

### 1.1 NordVPN with Flight mode: amber "Can't sync" instead of red "Offline"
**Cause (established from the source).** 1.0.10 read only Android's *default* network
(`registerDefaultNetworkCallback`). When NordVPN is connected, the default network is the VPN's virtual network,
which carries the INTERNET capability whether or not anything is under it. With Flight mode on and Wi-Fi off,
NordVPN (in particular with its kill switch or auto-connect) can keep that network up, so the app saw "connected,
VPN, not validated" and classified a failed request as "server unreachable" (amber).

**Fix.** `NetworkPlugin.java` now also listens, passively, for networks that are not VPNs and have internet
(`registerNetworkCallback` with `NET_CAPABILITY_NOT_VPN` and `NET_CAPABILITY_INTERNET`), seeded at start from the
networks that already exist. It reports `underlying`: true (a Wi-Fi, mobile or Ethernet network exists), false (none
does) or null (it could not tell). `netstate.js` treats a VPN with `underlying: false` as Offline (red). Unknown stays
conservative ("Can't sync"). Flight mode is never read, so Wi-Fi switched on in Flight mode counts as a real network.
A successful server answer always overrides a "nothing underneath" reading.

Nothing requests, binds to or prefers a network, and nothing touches the VPN, its kill switch, routing or settings.
No permission was added (ACCESS_NETWORK_STATE was already held).

**Needs the phone to confirm:** what Android reports to an app when NordVPN's kill switch ("Block connections without
VPN") is on: the underlying networks may be reported as present but blocked for the app. In that case the app shows
amber "Can't sync" (conservative), not Offline. Checklist items 1.4 to 1.11.

### 1.2 Retry visibly running; did closing the panel cause attempts?
**Established from the source.** Opening or closing the sync panel never started an attempt. The Retry button
changed because it was disabled during *every* attempt, including the quiet automatic ones, so it greyed and
re-enabled each time the back-off fired. Two real costs were found and fixed:
- Returning to the app (camera, share sheet, app switcher) reset the back-off and synced at once, every time. Six
  quick returns made 9 attempts on 1.0.10 (`e2e-1011` N9 run against the 1.0.10 bundle); 1.0.11 makes at most one.
- Timers kept running in the background on a long disconnection.

**1.0.11:** no retry limit (a saved scan is always retried); 2 s to 2 min with jitter, then 5 min after about 20
minutes of failures; no timer while the app is in the background; returning follows `resumePlan` (retry at once
only if the last attempt is at least 10 s old, restart the back-off after a minute away or a network change);
network events still retry within 1.5 s, rate-limited (at most one back-off reset a minute, one network-triggered
sync every 10 s). Retry sync stays usable during quiet attempts, shows "Trying…" (busy) only for an attempt the
learner asked for, and is unavailable, with the reason, when the device has no network. Recovery never depends
only on a network event: the timer, returning to the app and Retry sync all lead back.

### 1.3 Clip duration of about 21 seconds
**Established.** The selected length was always limited to 10 s, and the export stopped at Start + Length. What
showed "about 21 s" was the **Start** slider, which ranged over the whole source clip. In addition, for clips whose
files carry no duration (MediaRecorder WebM files, as many phones and the app itself produce), 1.0.10 read the
duration as Infinity: the Start slider then fell back to 0 to 100 s (screenshot `before/light-15`: "Start 50.0 s"
on a 22 s clip), and the stored duration was the slider value (10 s) even when less was recorded. Existing clips are
unchanged; their stored `dur` may overstate the length for such files, which only affects the label.

**1.0.11:** the real length is found for such files (`clipDuration`); the editor shows position and total, Start,
Length, the selected range (start to end) and "Keeps a s to b s (n s) of a t s clip. Clips can be up to 10 seconds:
nothing outside the selection is saved." The stored duration is the length actually recorded.

## 2. Changes in 1.0.11

| Area | Change |
| --- | --- |
| Scan form | Numbered sections with a tinted header band: Application, Scan details, Examination findings (with the application's name), Interpretation and quality, Confirmation and clinical impact, Supervision, Images and clips, Reflection, Accreditation pathways. Question labels 15 px semibold; answers 14.5 px with a firmer border; selected answers filled, bold and ticked (never colour alone); a fine rule between questions; each supervision level shows what it means; "Required" tags; multi-choice questions say "Choose all that apply". Groups are labelled radiogroups. Nothing collapsed, nothing new sticky. Presentation only: all 21 applications and 745 controls are identical to 1.0.10 (`e2e-1011` F0) |
| Guided motion | Log one marks the chosen application, holds about 0.4 s, then glides (eased, 260 to 460 ms) to the date; choosing an application by hand does the same after 0.26 s. Validation glides to the first missing field and marks its section. The learner's touch, wheel or key stops a glide; a pending glide never overrides a validation scroll; reduced motion jumps. No keyboard or date picker opens |
| Interaction | Chips and tool buttons have pressed states (opacity and transform, 120 to 180 ms); sheets open on a softer curve and close with a 160 ms fade and slide; no blur, parallax or continuous animation; native scrolling throughout |
| Home | Count tiles have a raised surface, a small arrow, a pressed state and a spoken name ("Scans: 6. Show these records."); counts and filters unchanged. The sync pill has a firmer surface and pressed state |
| Warnings | Home: "Can't connect to Wavelength / 1 scan saved on this device, awaiting sync. / Retry sync / Connection details". With nothing waiting, a one-line note. The details panel keeps the full explanation, VPN and firewall advice and the last 12 attempts (time, result, network kind; nothing else) |
| About | One entry, at the end of Settings. Me no longer repeats it. Version and build still come from the installed app |
| Photo editor | Crop, Cover, Trim top, Rotate, Flip H, Flip V (icons, labels, full spoken names), Undo per step, Reset, the orientation in force stated in words. Every change is in the pixels in the order made; quarter turns and flips do not resample; one JPEG encode. Tools locked while saving. The declaration stays mandatory. "Your original stays where it is on your phone. Wavelength keeps only this edited copy." |
| Clip editor | As above plus Play/Pause of the selection, scrubber, position and total, Start, Length, selected range, and a summary. Rotate and flips supported: one drawing function makes the preview and every recorded frame (checked pixel by pixel on exported frames, covers included). Progress, Cancel, stall detection, nothing kept from a failed run, editor stays open with the error |
| Fixes found on the way | The "Scan saved" note could sit over the editor and block the declaration (also in 1.0.10); Escape now closes a sheet that has only just opened; the Android back button cancels an open editor; a retry the learner asks for keeps its warning on screen |
| Languages | 47 strings and 3 plurals added in fr, de, es, it, pl, ar, ru, zh (one plural was missing before). **Machine-drafted, not professionally validated**: each language file says so in `_meta.review` |

No changes to `worker/`, `migrations/`, `wrangler.jsonc`, `data/`, `build.js`, the Android manifest, permissions,
Gradle files, Capacitor or plugins. The backup format is unchanged. Sync, acknowledgement, idempotent ids, supervisor
relationships, app lock and local media storage are untouched.

## 3. Tests

Baseline first: on the 1.0.10 seed, `npm test` passed 260 of 260 and `tools/e2e-1010.mjs` 44 of 44. Every browser tool
below was then run on both versions against identical local servers (`tools/dev-worker.mjs`, synthetic accounts):
1.0.10 from a clean worktree of the seed commit, 1.0.11 from this branch after the review fixes.

| Suite | 1.0.10 | 1.0.11 |
| --- | --- | --- |
| `npm test` (Node, Worker on node:sqlite) | 260 / 260 | **286 / 286** (26 new: netstate, native network, `app-1011.test.mjs` incl. translation completeness and review fixes) |
| `tools/e2e-1011.mjs` (new: connectivity N, form F, presentation P, editors E) | 11 pass, 10 fail, then stops (the issues 1.0.11 fixes: VPN-only shown amber, 9 attempts from 6 quick returns, background attempts, no sections or labelled groups) | **57 / 57** |
| `tools/e2e-1010.mjs` | 44 / 44 | 44 / 44 (C1/C4, F2 updated for the short banner and section header) |
| `tools/e2e-native.mjs` | 30 / 30 | 30 / 30 (date-row distance updated for the section header) |
| `tools/e2e-offline.mjs` | 16 / 16 | 16 / 16 |
| `tools/e2e-backup.mjs` (encrypted backup and restore) | 11 / 11 | 11 / 11 |
| `tools/e2e-resilience.mjs` | 12 / 12 | 12 / 12 |
| `tools/e2e-about.mjs` | 15 / 15 | 15 / 15 (A1/A2 updated: About only in Settings) |
| `tools/e2e-upgrade.mjs`, real 1.0.10 bundle then 1.0.11 on the same storage | | **12 / 12**: login, app lock, dark theme, entries, photos, sign-off, assessment, two supervisors and two trainees kept; the scan saved offline in 1.0.10 syncs once; Settings shows 1.0.11 (17) |
| `tools/theme-shots.mjs` (both themes: contrast, overflow, console) | pass | pass |
| `tools/e2e-supervisor-ui.mjs` | 20 ok, "account organisationId" fails | identical: 20 ok, the same check fails. **Existing** (documented in 1.0.10 as intermittent; deterministic with the in-memory dev Worker) |
| `tools/e2e-app.mjs`, `e2e-evidence.mjs`, `e2e-verification.mjs` | stop at the same step | stop at the same step on both. **Existing**: the tools predate email verification and the admin console |

Selected 1.0.11 evidence (`e2e-1011`): N1 a VPN with nothing under it is red Offline; N2 Wi-Fi back in Flight mode
syncs 1.5 s after the event; N4 40 screen changes and 10 opens of the sync panel in 22 s: 2 attempts (the back-off
schedule only); N5 Retry sync never flickers during quiet retries; N8 no attempts in 35 s in the background; N9 six
quick returns: 1 attempt (1.0.10: 9); N10 recovery by the timer alone; N11 30 network callbacks in 3 s: 2 attempts;
F0 21 applications and 745 controls identical to 1.0.10; F3 the move to the date passes through 12 positions; F7
answers kept through offline, backgrounding and a validation error; F8 five Save taps make one scan; E2 to E8 flips,
undo, transform order, cover moving with the image, saved photo equals preview; E11 a 14 s clip without a duration
is read as 14.0 s; E15 exported clip frames equal the preview; E16 stored duration is what was recorded; E17 a
failed preparation adds nothing; E19 a cover drawn before rotating is black in every exported frame checked.

The independent review (a separate reviewer given only the diff) found no critical or high-severity defects. Its 3
medium and 8 low findings were fixed in "1.0.11: review fixes, notes, tests and the device checklist", and every suite
above was run again afterwards. One low finding is accepted and documented: the orientation note (`edits`) on an
image record is kept on the phone only and is not in backups (the backup format is permanent; the orientation is in
the pixels themselves, so nothing is lost).

All browser results are simulations on desktop Chromium with a stand-in native bridge. **None of them is a
physical-device test.**

## 4. Performance and accessibility

- 600-scan logbook, CPU slowed 4x: drawn in 1.05 s (1.0.10: 0.88 s on the same run); scrolling frame gaps median
  16.7 ms on both; typing 10 characters with 600 scans stored: 34 ms (1.0.10: 35 ms).
- The cardiac form is about 17% longer at 390 px (3,631 px against 3,111 px), from eight section headers and the
  supervision explanations. Spacing was tightened to hold it there.
- Motion: opacity and transform only, 120 to 250 ms; the only programmatic scrolls are the deliberate glides; no
  blur, parallax or continuous animation; all off with reduced motion (checked, P7).
- Text contrast in the form meets WCAG AA in both themes (P2: section titles 15:1 light, 13.5:1 dark; hints 5.7:1 and
  6.8:1). Selected answers carry a tick, not colour alone. No overflow at 320 px or with text at 130%. Arabic is right
  to left with the new sections translated (P6). Every target in the form is at least 24 px; answers 40 px; editor
  tools 54 px.

## 5. iOS readiness (source level only)

Every change except the Android plugin is in the shared bundle. On iPhone there is no `WLNetwork` plugin, so
`underlying` is unknown and the 1.0.10 behaviour (navigator.onLine plus request results) applies. Editors use
canvas, `captureStream` and MediaRecorder as before (iOS 14.5 or later). `:has()` (section error colour) needs
iOS 15.4; older versions simply keep the field-level marks. **No Xcode build or iPhone test was done.** An
NWPathMonitor plugin would give iPhone the same VPN reading.

## 6. Backend compatibility

No changes to `worker/`, `migrations/`, `wrangler.jsonc`, `data/` or `build.js`. Only existing `/api/app/*` routes are
used, so no migration or Cloudflare change is needed, and 1.0.10 and 1.0.11 work against the current live Worker.
The website's `/app/` gets the new interface on the next deploy of `main` (not done).

## 7. Build

Built in the cloud workspace from this branch with the repository's own steps (`build-www.mjs`, `npx cap sync
android`, Gradle 8.14.3 `clean bundleRelease assembleRelease`), Android SDK platform 36, build-tools 36.0.0, JDK 21,
`WL_APP_VERSION=1.0.11`, `WL_VERSION_NAME=1.0.11`, `WL_VERSION_CODE=17` and no keystore. Maven Central returned HTTP
429 to the workspace, so the build read the same artifacts from Google's public Maven Central mirror through a Gradle
init script outside the repository (as for 1.0.10).

| Output | Size | SHA-256 |
| --- | --- | --- |
| `app-release-unsigned.apk` | 7,527,316 bytes | `8f46af534db85693768c14ce303c9a4620fd8de8608684cb7fecc5f360ec4c81` |
| `app-release.aab` (unsigned) | 6,762,650 bytes | `16af432239e9d0e4373780b601098b8306228e20befadffd5e49f11991270126` |

Checked with `aapt2 dump badging`: package `uk.co.thewavelength.app`, versionCode 17, versionName 1.0.11, targetSdk 36.
Permissions unchanged from 1.0.10: INTERNET, ACCESS_NETWORK_STATE, VIBRATE, USE_BIOMETRIC, USE_FINGERPRINT and the
dynamic-receiver permission. `apksigner verify` reports the APK as not signed. The bundled `native-config.js` says
1.0.11, code 17, and the new `NetworkPlugin` code is in the dex. Version code 17 is higher than 1.0.10's 16, so the
signed build installs as an update over 1.0.10 when it is signed with the same key. The GitHub workflow takes the
version code from its run number: set it to 17 (or higher) when building there.

These files are for inspection; the release should be built and signed from the same source by your own process.

## 8. Physical-device checklist

`docs/checklist-1.0.11-android.md`. Every item is NOT RUN.

## 9. Outstanding and known limitations

- Physical-device confirmation of the NordVPN behaviour (sections 1.1 and 1.2), clip preparation time on a mid-range
  phone, and smoothness on the device.
- What Android reports with NordVPN's kill switch on in Flight mode is not established; the app is conservative
  (amber) when it cannot be sure.
- Clips whose files carry no duration, saved in earlier versions, may show a stored length longer than their real
  length (label only).
- Undo in the photo editor keeps up to 12 steps within about 60 megapixels; a very large photo keeps fewer steps.
- Translations are machine-drafted and need native-speaker review.
- `tools/e2e-app.mjs`, `e2e-evidence.mjs`, `e2e-verification.mjs` and the organisation check in
  `e2e-supervisor-ui.mjs` still need updating (existing, unrelated to 1.0.11).
- iOS: build and test in Xcode.
