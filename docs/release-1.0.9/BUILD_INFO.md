# Wavelength 1.0.9 (15): unsigned build information

Built 8 October 2026, 16:02 UTC, in the cloud recovery environment. **Unsigned.** Nothing was signed, uploaded or
published.

## Files

| File | Size (bytes) | SHA-256 |
| --- | --- | --- |
| `wavelength-1.0.9-vc15-release-unsigned.apk` | 7,475,649 | `c8ebd3d21dabbcf31bd7912fe249dcb206f98dba58af09e81c5d6ee42f7a3f01` |
| `wavelength-1.0.9-vc15-release-unsigned.aab` | 6,710,926 | `e08c8399b7c396c322048892076797d8bfb8f2013d88a7122c7756fdcd6f635c` |

Check them with `sha256sum -c SHA256SUMS.txt` (Windows: `certutil -hashfile <file> SHA256`).

## Source

- Repository: `wavelength-site`, branch `claude/release-1.0.9`.
- Commit `cb445c7` (`cb445c7bcb01f28914b05feab4c387d37f7430a0`).
- Starting point: tag `pre-1.0.9-baseline` = 3dbdf3f (the 1.0.8 source).
- Web bundle build id: `muzq4qd2`.

## Toolchain

- Node 22.22.0.
- Capacitor 8.5.1.
- OpenJDK 21.0.12.
- Gradle wrapper 8.14.3, Android Gradle Plugin 8.13.0.
- Android SDK platform 36, build-tools 36.1.0.
- minSdk 24 (Android 7.0), compileSdk 36, targetSdk 36.

## Steps

```
cd mobile
WL_APP_VERSION=1.0.9 WL_VERSION_CODE=15 node scripts/build-www.mjs
npx cap sync android
cd android
# WL_KEYSTORE unset, so Gradle does not sign
WL_VERSION_CODE=15 WL_VERSION_NAME=1.0.9 ./gradlew --no-daemon clean bundleRelease assembleRelease
```

`mobile/android/app/build.gradle` and its signing configuration are unchanged from 1.0.8. Signing still happens only
when `WL_KEYSTORE` and its passwords are set, on Fero's computer.

## Checks on the built files

| Check | Result |
| --- | --- |
| Package | `uk.co.thewavelength.app` (APK badging and AAB manifest) |
| Version | versionCode 15, versionName 1.0.9 (APK badging and AAB manifest) |
| SDK levels | targetSdk 36, minSdk 24 |
| Permissions | Same as 1.0.8 plus `ACCESS_NETWORK_STATE`: INTERNET, ACCESS_NETWORK_STATE, VIBRATE, USE_BIOMETRIC, USE_FINGERPRINT, and the app's own dynamic-receiver permission |
| Android backup | `allowBackup="false"` |
| Signature | APK: `apksigner verify` says "DOES NOT VERIFY" (unsigned, as intended). AAB: no `META-INF` signature |
| Alignment | `zipalign -c -p 4` passes on the APK |
| Bundled locally, no remote server | `assets/capacitor.config.json` has `server: {androidScheme: "https"}` and **no `url`**. The logbook runs from `assets/public` inside the app |
| Server address | `native-config.js`: `site` is `https://thewavelength.co.uk`, `version` 1.0.9, `versionCode` 15 |
| Same code in every copy | `app.js`, `native.js`, `backup.js`, `licences.js` and `index.html` have identical SHA-256 in the APK, the AAB and `mobile/www` |
| Review fixes present | The bundled `app.js` and `native.js` contain the Phase 5 fixes (`stale(gen)`, `BODY_WAIT`) |
| Entries | APK 995 files, AAB 1000 files |

## To sign (on Fero's computer only)

Use the same upload key as 1.0.8, whose certificate SHA-256 starts `EE:30:BF:D2` and ends `A1:E0`, and the same Windows
steps used for 1.0.8. Android installs 1.0.9 over 1.0.8 and keeps the phone's data only if the key is the same.

After signing, `apksigner verify --print-certs` on the APK should show that certificate.
