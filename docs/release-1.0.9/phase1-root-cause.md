# Wavelength 1.0.9, Phase 1: preservation and root-cause analysis

Date: 8 October 2026. Source: commit 3dbdf3f (Android 1.0.8, version code 14), branch `claude/release-1.0.9`, baseline tag `pre-1.0.9-baseline`.

## 1. Preservation

- The release source 3dbdf3f is tagged `pre-1.0.9-baseline`. `git fsck` is clean. All 1.0.9 work is on `claude/release-1.0.9`, one local commit per phase. Nothing is pushed: the `origin` remote points to GitHub and is never used.
- The signed 1.0.8 files are untouched and still match their checksums (`sha256sum -c` in `wavelength-android/1.0.8-vc14-signed/` and `1.0.8-vc14-unsigned/`).
- The repository is recoverable at every step: `git checkout pre-1.0.9-baseline` returns to the 1.0.8 source.

### What the phone holds, and what an upgrade must keep

| Data | Where it lives on the phone | Survives an ordinary upgrade when |
| --- | --- | --- |
| Login token | Biometric plugin secure store (`wavelength.session`, Android Keystore-encrypted SharedPreferences) | Same package and signing key; the plugin's storage key is unchanged |
| Cached account (for offline start) | WebView localStorage `wl-acc` | The WebView origin stays `https://localhost` (`server.androidScheme: https`, no hostname change) |
| Logbook entries, including unsynced ones (`_dirty`) | IndexedDB `wavelength-<accountId>`, store `entries` | Same origin; the IndexedDB ladder only adds stores (DB_VERSION 2 today) |
| Images and clips | IndexedDB store `images` | Same origin |
| Pending sign-off uploads | IndexedDB store `shares` | Same origin |
| Sync cursor, sign-off cache, news | IndexedDB store `kv` | Same origin |
| App lock setting | Capacitor Preferences `wl-lock` | Same package |
| Supervisor links | Server side (fetched on start) | Always; nothing local to lose |
| Language | localStorage `wl-lang` | Same origin |

Invariants 1.0.9 must keep, each checked by a test in Phase 5: package `uk.co.thewavelength.app`; the same upload key (Fero signs); `androidScheme` `https` with the default `localhost` host; no IndexedDB store removed or renamed; the secure-store key `wavelength.session` and the Preferences key `wl-lock` unchanged; nothing that clears storage on upgrade. Android backup is off (`allowBackup=false`), so a reinstall would lose unsynced entries: the upgrade must be installed over 1.0.8, never after uninstalling.

### Before installing 1.0.9 on the test phone

1. Do not uninstall 1.0.8 and do not clear its storage.
2. Note what the phone shows: the account email, the two supervisor links, the number of scans in the logbook, and which ones show "Not synced".
3. Install 1.0.9 over it (same signing key). Android refuses an update signed with a different key rather than replacing data, so a wrong key cannot wipe the logbook.

## 2. Offline start: why the app sat on the start screen

### What the phone showed

- Test 1: a long wait before the fingerprint prompt.
- Test 2 (aeroplane mode): stuck on the start screen, no fingerprint prompt.

### Code evidence

The screen that looks like a splash is not the Android splash screen. `MainActivity` is a plain `BridgeActivity` and the app has no splash-screen plugin, so the system splash goes as soon as the WebView draws. What stays is a placeholder that `boot()` draws: the Wavelength mark and wordmark at 30% height (`src/app/app.js`, `boot()`).

`boot()` then does this, in order:

1. `api('/api/app/me')`, which goes through `WLNative.net()` (`src/app/native.js`). `net()` waits for `ready` (the token read from the secure store and the `wl-lock` preference, both local), then calls `fetch()` with **no timeout**.
2. Only when that request settles does it open the logbook: `signedIn()` on success, or `offline()` on a network error or a 5xx.
3. Only after that does `lockOnStart()` ask for the fingerprint.

Nothing on screen changes until step 1 settles, and the fingerprint prompt is chained after it. Every other step on the path is local and bounded: the secure-store read (`NativeBiometric.getData` decrypts one SharedPreferences value with a Keystore key, no network), `Preferences.get`, `indexedDB.open`, and the bundled language file.

### Reproduction (tools/e2e-offline.mjs, real bundle, stand-in native bridge, local Worker)

| Check | Result on 1.0.8 code |
| --- | --- |
| S1 Cold start, server never answers: logbook within 3 s | **FAIL**: still on the start screen after 15 s |
| S2 Cold start, 6 s network, app lock on: prompt within 2 s | **FAIL**: prompt after 6153 ms (the network time, plus about 150 ms) |
| S3 Cold start, calls fail at once, app lock on | PASS: prompt at 182 ms, logbook at 186 ms |
| S4 Cold start, server never answers, app lock on: prompt within 2 s | **FAIL**: no prompt within 15 s |

### Root cause (confirmed in the reproduction)

Startup is gated on a network request that has no timeout. The local logbook and the fingerprint prompt wait for `/api/app/me` to settle. When the request is slow, the prompt is late by exactly that time (Test 1). When it never settles, the app stays on the placeholder indefinitely and never asks for the fingerprint (Test 2). When the request fails at once, startup is fast (S3), so a plain offline error is not the problem: the problem is a request that hangs.

### What is inferred, not yet confirmed on the phone

Whether aeroplane mode on Fero's phone makes the request hang, rather than fail at once, cannot be measured here: release builds have WebView debugging off. Two things make a hang likely. The app lacks the `ACCESS_NETWORK_STATE` permission, so Chromium inside WebView cannot tell it is offline and will not fail fast with "internet disconnected". Also, aeroplane mode often leaves Wi-Fi on with no working connection. The 1.0.9 fix does not depend on which of these happened: startup will no longer wait for the network at all. 1.0.9 also keeps a short on-device startup timing record (no personal data) so the physical-device test can confirm the cause.

## 3. Sync: why the offline scan never reached the website

### Code evidence

- `sync()` runs only when something calls it: after a save, on app resume (`wl:resume`, `visibilitychange`), at sign-in, and on the browser `online` event. **Nothing retries a failed sync.**
- `doSync()` ends with `.catch(function () { /* offline or server error: try again later */ })`. Every failure, whether network, server or validation, is swallowed. No retry is scheduled, no state is recorded and nothing is shown.
- The sync indicator reads `navigator.onLine`, not the result of the last sync. It shows "Synced" whenever the browser thinks it is online, even when the last push failed.
- The Android manifest declares only `INTERNET`. Without `ACCESS_NETWORK_STATE`, Android WebView does not track connectivity, so `navigator.onLine` stays `true` and the `online` and `offline` events do not fire. Chromium code reviews tie WebView's network-state tracking (the Network Information API) to that permission. No official document states the same for `navigator.onLine`, so this is strong but indirect evidence, to be confirmed on the phone.
- Server side, `POST /api/app/sync` silently skips an entry it refuses (bad id, missing type or date, more than 20,000 characters, or an id owned by another account). It still answers `ok: true`. The app leaves that entry marked unsynced and retries it on every sync, failing silently each time.

### Reproduction

| Check | Result on 1.0.8 code |
| --- | --- |
| Y1 Saved offline, reconnect with no connectivity event (WebView without the permission): on the server within 25 s | **FAIL**: not on the server |
| Y2 While sync is failing, the indicator does not say "Synced" | **FAIL**: indicator said "Synced" |
| Y3 App resumed while still offline, network back 1 s later: on the server within 25 s | **FAIL**: not on the server |
| Y4 Control: reconnect event fires (desktop Chrome) | PASS: synced at once |
| Y5 Server refuses an entry: the answer names it and gives a reason | **FAIL**: `ok: true`, entry missing from `saved`, no reason |

### Root cause (confirmed in the reproduction)

The app relies on a one-shot trigger to sync, and it has no retry. On the phone, the reconnect trigger (`online`) most likely never fires. The resume trigger fires as the app returns from Settings, while the radio is still reconnecting, so that one attempt fails, is swallowed, and is never retried. The scan stays on the phone, marked "Not synced" only on its own card, while the indicator says "Synced". It goes up only at the next save or the next return to the app with a working connection. Separately, an entry the server refuses is never reported, so it would stay unsynced for ever without anyone knowing.

The scan saved on Fero's phone is still in the phone's IndexedDB with its unsynced flag. Nothing in 1.0.8 deletes an unsynced entry. 1.0.9 will push it on its first successful sync after the upgrade.

## 4. Other findings for later phases

- The logbook draws before the lock screen covers it. On a cold start with app lock on, `lockOnStart()` runs after `signedIn()` has rendered the logbook, so content can show briefly before the lock. 1.0.9 shows the lock first.
- Sync status: no pending count, no last-sync time, no retry action, and no separate media status.
- GitHub issue #2, the usual work log in CLAUDE.md, cannot be updated while GitHub is suspended. These reports stand in for it.

## 5. Test tools added in this phase

- `tools/dev-worker.mjs`: the real Worker over the test environment (node:sqlite with every migration), on localhost, for when Wrangler is not available. In-memory data, dummy accounts only.
- `tools/native-harness.mjs`: network modes (offline, never answers, delay), a model of WebView without connectivity events, and timestamps on native calls.
- `tools/e2e-offline.mjs`: the checks above, written as the behaviour 1.0.9 must have. On the 1.0.8 code, 7 of 9 fail, and the two controls pass.
