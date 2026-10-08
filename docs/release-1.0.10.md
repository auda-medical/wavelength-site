# Wavelength 1.0.10: release notes, findings and acceptance checklist

Android 1.0.10, version code 16, package `uk.co.thewavelength.app`. Prepared on 8 October 2026 in a cloud workspace
from the verified 1.0.9 tree `07a2db33d24c54914fcf99749b7351763ba7e6c2` (seed commit
`7477090be96bc20b811fb3f141d44e57f949f6b0`). Nothing was deployed, signed, published, pushed or migrated.

## 1. The NordVPN problem: findings

### What was seen on the phone (1.0.9)
With NordVPN on, the app kept saying it was offline after Wi-Fi and mobile data were back. With NordVPN
disconnected, the waiting scans synced almost at once and appeared in the desktop logbook.

### What the 1.0.9 code does (established from the source)
1. **Every failed request was shown as "offline".** `doSync` set `SY.fail = 'offline'` for any network error,
   time-out or aborted call (`netFail`), whatever the phone's network was doing. "Offline" in 1.0.9 meant "the last
   request to Wavelength failed", not "this phone has no network". The app could not tell the two apart, so a VPN
   path that failed looked exactly like aeroplane mode.
2. **Retries depended on events a VPN can hide.** Apart from the back-off timer (up to 5 minutes between tries after
   a run of failures), the only prompts to retry were the browser `online` event, returning to the app and Retry sync.
   Android WebView's `online`/`offline` events follow the phone's *default* network. With a VPN that stays up (NordVPN
   auto-connect or kill switch), the default network is the VPN itself, so Wi-Fi or mobile data dropping and coming
   back underneath it may produce no event. When the VPN is switched off, the default network changes, an event
   fires and the next request goes direct, which matches "synced almost immediately".
3. **The store app's requests are cross-origin.** The app runs from `https://localhost` and calls
   `https://thewavelength.co.uk/api/app/*`. The Worker answers with CORS headers, but anything else that answers
   instead (a VPN's threat-protection or DNS filter block page, a Cloudflare challenge or block page shown to a VPN
   exit address, a captive portal) has no CORS headers. The WebView then reports a bare network error, with no status
   code, which 1.0.9 also called "offline".

### Best-supported cause
The display problem is certain: 1.0.9 could only ever say "offline" when requests failed. The underlying failure is
that requests to Wavelength did not get through the NordVPN path, while the phone's own network was fine. The cloud
workspace cannot reproduce NordVPN, so which of these blocked them is **not established**:

| Candidate | How it would look in 1.0.10's sync details | How to check |
| --- | --- | --- |
| Tunnel stale or reconnecting after a network change | "No answer in time", or "Not reachable" until the VPN reconnects; syncs within seconds of the VPN reconnecting | Wait 30 s after Wi-Fi returns; watch the pill |
| NordVPN Threat Protection (DNS or web filter) blocking the domain | "Not reachable from this network" at once, every time | Turn Threat Protection off in NordVPN, Retry sync |
| Cloudflare challenging or blocking the VPN exit address | "Not reachable from this network" at once; other VPN servers may work | With the VPN on, open `https://thewavelength.co.uk/api/app/me` in the phone's browser: JSON means it got through; a "Just a moment" or "Access denied" page means Cloudflare is challenging. Cloudflare dashboard > Security > Events, filtered on `/api/app/`, shows challenges by IP and ASN (a read-only check for the account owner) |
| DNS through the VPN failing | "Not reachable" at once | Try another NordVPN server or protocol |

NordVPN itself is not assumed to be at fault; the app's wording says a VPN, firewall or network restriction *may* be
affecting the connection.

### What 1.0.10 changes
- **Real network state on Android:** a small read-only plugin (`WLNetwork`, `NetworkPlugin.java`) reads
  ConnectivityManager for the default network: internet, validated by Android, VPN, Wi-Fi, mobile data. It sends an
  event on every meaningful change, VPN ones included. It never changes the network, VPN, routing or any setting.
  It uses the existing `ACCESS_NETWORK_STATE` permission and adds none.
- **Accurate words:** "Offline" (red) only when the phone has no network. "Can't sync" (amber) when it has a network
  but Wavelength cannot be reached, including a block or challenge page or a server error. Time-outs are reported as
  such. A refusal by the server is "Sync failed" with the entries listed.
- **Retry when it can work:** any network change (VPN connected, reconnected or switched off, Wi-Fi back while
  aeroplane mode stays on, mobile data back, Android validating the network) restarts the back-off and retries after
  1.5 s. Returning to the app does the same. Back-off is now 2 s to 2 min with ±20% jitter (was up to 5 min).
- No hidden bypass: requests still go through whatever route the phone uses, the VPN included. TLS validation is
  unchanged and there is no HTTP fallback. If Wavelength cannot be reached, scans stay on the phone and the app
  says so.

## 2. Changes in 1.0.10 (by phase)

| Phase | Change |
| --- | --- |
| A, B | `netstate.js` status rules; Android `WLNetwork` plugin; failures classified with the phone's network; network-change and resume retries; capped back-off with jitter. The 1.0.9 queue is unchanged: stable ids, acknowledgement before "synced", refused entries listed, batches of 50, conflict rebase, account isolation (`SESSION` guard), auth expiry keeps local entries |
| C | Header status pill: icon, short label, chevron, tinted background and border, press, hover and focus states, accessible name. Opens "Sync on this device": network, Wavelength server, waiting entries, last attempt, last success, last error, what to check, Retry sync, and a reminder that each device shows its own status |
| D | Banners under the header: red "You're offline", amber "Can't connect to Wavelength" (VPN, firewall or restriction hint, Retry sync, Details), amber "Scans awaiting sync" (after 3 s), "Synchronising your scans…" (only while uploading, after 0.8 s), and a 3-second "All changes synced." after a warning. Not shown on the scan form or in Settings |
| E | Home counts are links: Scans to the logbook, This month to the logbook filtered by scan date, Signed off to signed-off scans, Assessments to signed assessments first. Filters are shown with Clear filter, and empty months say so |
| F | Log one (any pathway, AAA included): the application is confirmed ("Abdominal aorta (AAA) selected", with Change), and the form scrolls so that line and the date row sit just below the header. The date row is outlined briefly. No input is focused, so no keyboard or date picker opens. Log a scan without a type is unchanged |
| G | Required fields (unchanged: application, a date not in the future, supervision): red border on the control or choice group, a line of help under it, the first one scrolled into view and focused (the group, not a control), `aria-invalid` and `aria-describedby`, cleared as soon as it is fixed. Entered data is kept |
| H | Save: double taps make one scan; a new scan returns Home with a note: "Scan saved.", "Saved on this device. Awaiting sync." or "Scan saved and synced." (only after the server acknowledges it), with View scan and Same patient. An edit returns to the scan. If the phone cannot save, the form stays with everything kept and the error shown |
| I | One 180 ms fade on a new screen, press feedback on buttons, cards and counts, banner fade, no motion while typing, all off with reduced motion. The tab bar's backdrop blur was removed (it re-blurred on every scroll frame). Native scrolling only |

## 3. Tests

| Suite | Result |
| --- | --- |
| `npm test` (Node, Worker with node:sqlite) | 260 of 260 pass (238 from 1.0.9 plus 22 new: `netstate.test.mjs`, `native-network.test.mjs`, `app-1010.test.mjs`) |
| `tools/e2e-1010.mjs` (new, stand-in phone) | 44 of 44 pass: offline, VPN with the server blocked, stale VPN reconnecting, Wi-Fi back in aeroplane mode, mobile data, block page, Retry sync, no duplicates, pill by touch and keyboard, banners, Home counts and filters, AAA Log one, required fields, save flow (double tap, offline note, storage failure), reduced motion, 600-scan logbook, Arabic |
| `tools/e2e-offline.mjs` | 16 of 16 pass |
| `tools/e2e-native.mjs` | 30 of 30 pass |
| `tools/e2e-backup.mjs` (encrypted backup and restore) | 11 of 11 pass |
| `tools/e2e-about.mjs` | 15 of 15 pass |
| `tools/e2e-resilience.mjs` | 12 of 12 pass |
| `tools/e2e-upgrade.mjs`, real 1.0.9 bundle to 1.0.10 | 12 of 12 pass: login, app lock, dark theme, entries, photos, sign-off, assessment, two supervisors and two trainees kept; the scan saved offline in 1.0.9 syncs once |
| `tools/e2e-supervisor-ui.mjs` (local Wrangler) | 22 of 22 pass in most runs. One sign-up check ("account organisationId") fails intermittently on 1.0.10 and on the 1.0.9 baseline alike (2 of 6 baseline runs): an existing test flake |
| `tools/theme-shots.mjs` | Both themes pass: contrast, overflow, console |
| `tools/e2e-app.mjs`, `e2e-evidence.mjs`, `e2e-verification.mjs` | Stop at the same step on the 1.0.9 baseline and on 1.0.10 (the tools predate email verification and an admin console change). Not caused by 1.0.10; worth updating separately |

An independent review of the networking, sync, persistence and accessibility changes found no high-severity
defects and confirmed that entries are marked synced only from the server's answer and that accounts stay
separate. Its ten medium and low findings were all fixed (commit "Review fixes: ...") and the suites above were
run again afterwards.

All browser results are simulations on a desktop Chromium with a stand-in native bridge. **None of them is a
physical-device test.**

## 4. Performance and accessibility

- 600-scan logbook, CPU slowed 4x: drawn in about 1.8 s (1.0.9 measured 1.3 to 4.2 s on the same set-up); scrolling
  frame gaps median 16.7 ms (60 fps), the same as 1.0.9. Typing in the form with 600 scans stored: 42 ms for 10
  characters.
- `content-visibility` on logbook rows was tried: it drew the list sooner but halved the frame rate while scrolling
  (median 33 ms). It was removed.
- No scroll handlers, scroll libraries, snapping or continuous animations, apart from the syncing icon, which turns
  only while a sync is running. Banner and panel redraw only when their content changes.
- Reduced motion: screen fades, banner fade, press scaling, the date outline animation and the syncing spinner are
  off; content shows at once.
- Pill and count cards are real buttons and links with focus rings; the banner is a polite live region; required
  fields are announced through `aria-describedby`; Log one announces "<application> selected. Next: the date of the
  scan."

## 5. iOS readiness

Shared web changes (pill, banners, Home counts, Log one, validation, save, motion) are in the bundle the iPhone app
uses. On iPhone there is no `WLNetwork` plugin, so the app uses `navigator.onLine` for the device state and the
request results for everything else. That is safe: a VPN problem shows as "Can't sync", and real offline shows as
"Offline" when WKWebView reports it. Not checked: nothing was built or run with Xcode. Before an iOS release: build
in Xcode, run on an iPhone with and without a VPN, and consider an NWPathMonitor plugin to match Android.

## 6. Backend compatibility

No changes to `worker/`, `migrations/`, `wrangler.jsonc`, `data/`, `build.js` or the Android manifest. The app uses
only existing `/api/app/*` routes, so 1.0.9 and 1.0.10 work against the current live Worker, and no migration or
Cloudflare change is needed. The website's `/app/` gets the same interface on the next deploy of `main` (not done).

## 7. Build

Built in the cloud workspace from commit "Review fixes: ..." with the repository's own steps
(`build-www.mjs`, `npx cap sync android`, `./gradlew clean bundleRelease assembleRelease`), Android SDK platform 36,
build-tools 36.0.0, JDK 21, `WL_APP_VERSION=1.0.10`, `WL_VERSION_NAME=1.0.10`, `WL_VERSION_CODE=16` and no keystore.
Maven Central rate-limited the workspace, so this build read the same artifacts from Google's public Maven Central
mirror through a Gradle init script outside the repository.

| Output | Size | SHA-256 |
| --- | --- | --- |
| `app-release-unsigned.apk` | 7,503,656 bytes | `f4d3a8c85d88d73472a672984a702d3e8f16144a8d46dea69f022d38544ac655` |
| `app-release.aab` (unsigned) | 6,739,021 bytes | `288d479cca5f66007840c0669e808f932ce71ae4f35bd620613e41c7d658a928` |

Checked with `aapt2 dump badging`: package `uk.co.thewavelength.app`, versionCode 16, versionName 1.0.10,
targetSdk 36. Permissions unchanged from 1.0.9: INTERNET, ACCESS_NETWORK_STATE, VIBRATE, USE_BIOMETRIC,
USE_FINGERPRINT and the dynamic-receiver permission. `apksigner verify` reports the APK as not signed and the AAB
holds no signature files. The bundled `native-config.js` says version 1.0.10, code 16, and `NetworkPlugin` is in
the dex. These cloud-built files are for inspection and testing; the release itself should come from the signed
GitHub workflow or your own signing, from the same source.
The repository's Android workflow sets `WL_VERSION_CODE` from `github.run_number`; to ship as version code 16, make
sure the run number is 16, or set the code another way, before signing.

## 8. Physical-device acceptance checklist (Android)

Every item is **NOT RUN** until done on the phone. Use dummy scans only.

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 1 | Record the installed 1.0.9 state: number of scans, waiting scans, supervisors, trainees, app lock on/off | Written down | NOT RUN |
| 2 | Install signed 1.0.10 over 1.0.9, without uninstalling | Installs as an update | NOT RUN |
| 3 | Open the logbook | Same scans, supervisor relationships and trainees | NOT RUN |
| 4 | Close fully, reopen offline | Opens quickly; fingerprint, face or PIN prompt as before | NOT RUN |
| 5 | Aeroplane mode on; save a dummy scan | Returns Home: "Saved on this device. Awaiting sync." | NOT RUN |
| 6 | Look at the pill and logbook | Red "Offline" pill; scan marked Not synced | NOT RUN |
| 7 | Read the banner | Red "You're offline", "1 scan waiting to sync." | NOT RUN |
| 8 | Turn Wi-Fi on while aeroplane mode stays on (NordVPN off) | Within a few seconds: "Syncing", then "All changes synced." briefly, pill "Synced" | NOT RUN |
| 9 | Tap the pill | Sync on this device: Network Wi-Fi, server Reachable, 0 waiting, last attempt and last synced times | NOT RUN |
| 10 | NordVPN disconnected: save another dummy scan online | "Scan saved and synced." | NOT RUN |
| 11 | Open the desktop logbook | Both dummy scans present | NOT RUN |
| 12 | NordVPN on; aeroplane mode on, save a dummy scan; aeroplane mode off | Pill and banner follow what happens; sync details show "VPN on" | NOT RUN |
| 13 | If it does not sync with NordVPN on | Amber "Can't sync" and "Can't connect to Wavelength" (not "Offline"); details say "Not reachable from this network" or "No answer in time". Note which | NOT RUN |
| 14 | Retry sync from the banner (and, separately, after turning NordVPN Threat Protection off, or another server) | Syncs if the route works; otherwise stays amber, with the scan kept | NOT RUN |
| 15 | Desktop logbook and the phone's logbook | Each dummy scan appears once (no duplicates) | NOT RUN |
| 16 | Tap the pill in each state seen | Opens sync details every time; readable with TalkBack | NOT RUN |
| 17 | Tap each Home count: Scans, This month, Signed off, Assessments | Each opens its records | NOT RUN |
| 18 | Compare counts with the lists | Same numbers; filter shown with Clear filter | NOT RUN |
| 19 | Progress or Home: AAA, Log one | Form opens with "Abdominal aorta (AAA) selected" | NOT RUN |
| 20 | Same | Date row just below the header, no keyboard or date picker opened | NOT RUN |
| 21 | Save without a supervision level | Supervision outlined in red with "Choose the level of supervision." | NOT RUN |
| 22 | Same | Scrolled to the field, entered text kept; choosing a level clears the mark | NOT RUN |
| 23 | Save a complete dummy scan, tapping Save twice quickly | One scan saved | NOT RUN |
| 24 | After saving | Back on Home with the short note; View scan opens it | NOT RUN |
| 25 | Scroll a long logbook (restore a backup with many dummy scans if needed) | Smooth, no stutter | NOT RUN |
| 26 | Move between tabs and screens; type in the form | Subtle fade, no delay when typing | NOT RUN |
| 27 | Android Settings > Accessibility > Remove animations; reopen | No fades or spinners; everything shown at once | NOT RUN |
| 28 | Make an encrypted backup and check app lock after 90 s away | Backup completes; lock asks again | NOT RUN |
| 29 | Me > About Wavelength | Version 1.0.10, build 16 | NOT RUN |

## 9. Outstanding

- Physical-device tests (section 8) and the NordVPN cause (section 1) need the phone.
- iOS: build and test in Xcode (section 5).
- Translations of the new strings were machine-drafted: a native speaker should review before promoting a language.
  The plural "{n} suggestions" was already untranslated in 1.0.9.
- `tools/e2e-app.mjs`, `tools/e2e-evidence.mjs` and `tools/e2e-verification.mjs` need updating for email
  verification and the admin console (they fail the same way on 1.0.9).
- The website is not deployed. Pushing to `main` publishes the new `/app/` interface on the website.
