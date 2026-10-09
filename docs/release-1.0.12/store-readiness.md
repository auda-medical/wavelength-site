# Wavelength 1.0.12: App Store and Google Play readiness

Nothing has been submitted, uploaded or signed. Every upload needs the owner's written approval.

## Shared

| Item | State |
| --- | --- |
| Version | 1.0.12. Android version code 18 (1.0.11 was 17). On iOS, set the build number above the last upload. |
| Package / bundle ID | `uk.co.thewavelength.app` (unchanged) |
| New permissions | **None.** Android still asks only for INTERNET and ACCESS_NETWORK_STATE. On iPhone, the purpose strings are unchanged and no new capability is added. |
| New data collected | **None.** Annotations, the unedited base picture, provenance notes and redactions stay on the phone, in IndexedDB and in the learner's own encrypted backups. Ending supervision and the trainee record lists use account data the server already holds. Privacy labels (App Store) and Data safety (Play) answers in `mobile/STORE.md` stay correct. |
| Third-party services | None added. Guides ship inside the app; their official source links open in the in-app browser. |
| Encryption | Unchanged: HTTPS, plus AES-GCM for backups and for shared images. `ITSAppUsesNonExemptEncryption` is false. **Owner to confirm** against Apple's current export-compliance guidance (not reviewed here). |
| Account deletion | Unchanged: /app/delete-account/ and in the app. |
| Review account | `appreview@thewavelength.co.uk`. Before review, check it still signs in on the live service. To show the new supervisor screens, link it as supervisor to a second dummy account. |
| Content | Clinical education logbook. No patient data is requested. The editor tells users to redact identifiers and needs a declaration before an image is used. |
| Listing text | Optional: add to the description "Label and annotate images and clips, with pictograms, and redact identifiers." The current text ("crops, rotates and blacks out identifiers") is still true. |
| Screenshots | The `mobile/store/` images are still accurate. New candidates are in the handover gallery: Still to do, the editor, trainee tiles. These are synthetic and show no real people. |
| What's new (both stores) | See `release-notes.md`, "Store text". |

## Google Play

| Item | State |
| --- | --- |
| Target API | 36 (compile 36, min 24). This meets Play's current target API requirement. |
| Unsigned build | `app-release-unsigned.apk` and `app-release.aab` (unsigned) in the handover, for inspection and comparison only. |
| Signing | Owner's own process and upload key, never in the cloud. Build the release from the same tree (the hash is in the manifest) with `WL_VERSION_NAME=1.0.12 WL_VERSION_CODE=18`, or through the "Android app" workflow. |
| Testing track | Internal testing first. Work through `checklist-android.md` on a phone, then promote. |
| App links | Not configured (unchanged). Invitation links open in the browser. Adding them later needs `assetlinks.json` on the website with the release key's SHA-256 fingerprint. |

## Apple App Store

| Item | State |
| --- | --- |
| Build | Not built: there was no Mac in the workspace. Follow `mac-xcode.md`. |
| New native code | `WLNetworkPlugin.swift` (NWPathMonitor, read only) and `WLBridgeViewController.swift` (registers it). Neither uses an API that needs a privacy-manifest reason. |
| `PrivacyInfo.xcprivacy` | No change needed. |
| Universal links | Not configured (unchanged). Adding them later needs `apple-app-site-association` on the website and the Associated Domains capability. |
| Guideline 4.2 | The app works offline and stands alone. 1.0.12 adds more native-quality features (editor, carousel, guides offline) and loads nothing from the website. |
| Device test | `checklist-iphone.md`: everything is NOT RUN until done on an iPhone. In particular, check that photos survive restarts in WKWebView storage. |
| TestFlight | Only after the owner's written approval. |
