# Wavelength 1.0.12: iPhone physical-device checklist

For the product owner, on a real iPhone, after building 1.0.12 in Xcode on your Mac (`docs/release-1.0.12/mac-xcode.md`).
No Xcode build and no iPhone test were possible in the cloud workspace: **everything here is NOT RUN**, including
whether the project builds. Use synthetic scans and pictures only.

iPhone model and iOS version: ____________________ Xcode version: ____________ Date: ____________

## 0. Build and first run

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 0.1 | Mac: follow mac-xcode.md sections 1 to 4 | `npx cap sync ios` finishes; Xcode opens `ios/App/App.xcodeproj` | NOT RUN |
| 0.2 | Product > Build for a connected iPhone, signing with your team | Builds without errors (WLNetworkPlugin.swift and WLBridgeViewController.swift compile) | NOT RUN |
| 0.3 | Run on the iPhone | The welcome screen shows; nothing loads from the website | NOT RUN |
| 0.4 | Sign in with a test account | Home shows; Settings > About shows the version and build you set | NOT RUN |
| 0.5 | Notch and home bar | Header below the status bar; tabs above the home bar; nothing hidden | NOT RUN |
| 0.6 | Rotate the phone | Stays in portrait | NOT RUN |

## 1. Upgrade (only if a TestFlight or earlier build is installed)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 1.1 | Install over the earlier build | Logbook, photos, clips, app lock and theme kept | NOT RUN |
| 1.2 | A scan saved offline in the earlier build | Syncs once | NOT RUN |

## 2. Face ID, Touch ID and passcode

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 2.1 | Settings > Security: turn app lock on | iOS asks to allow Face ID for Wavelength (the purpose text from Info.plist), then unlocks | NOT RUN |
| 2.2 | Leave for more than 90 s, return | Face ID asked; passcode offered as fallback | NOT RUN |
| 2.3 | Cancel | Stays locked; Log out offered | NOT RUN |
| 2.4 | Turn off the iPhone passcode in iOS Settings | The app does not unlock without a lock; it offers Log out | NOT RUN |

## 3. Network, VPN and Flight mode (new iPhone plugin)

iOS does not tell apps whether a VPN is on. The app should say so rather than guess.

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 3.1 | Wi-Fi, no VPN; open the sync pill | Synced; details show "Wi-Fi · VPN status not available on this phone" | NOT RUN |
| 3.2 | Flight mode on, Wi-Fi off; save a scan | Red Offline; "Saved on this device. Awaiting sync." | NOT RUN |
| 3.3 | Flight mode off | Syncs within seconds (the plugin reports the change) | NOT RUN |
| 3.4 | Mobile data only | Synced; details show Mobile data | NOT RUN |
| 3.5 | A VPN connected that blocks thewavelength.co.uk | Amber Can't sync; details say the phone does not tell apps whether a VPN is on, and advise checking it | NOT RUN |
| 3.6 | VPN connected, Flight mode on, Wi-Fi off | Record what iOS reports (expected: Offline, as iOS drops the path) | NOT RUN |
| 3.7 | Low Data Mode on | Syncs normally | NOT RUN |

## 4. Camera, photos and clips

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 4.1 | Take photo | iOS asks for camera access once (purpose text shown); photo opens in the editor | NOT RUN |
| 4.2 | Choose from photos | The iOS photo picker opens (no library permission needed for picking) | NOT RUN |
| 4.3 | Record a clip | Camera and microphone asked once; the editor says sound is removed | NOT RUN |
| 4.4 | Choose a clip of 15 s | Length read correctly; up to 10 s kept | NOT RUN |
| 4.5 | Prepare a clip with a redaction and a label | Progress to 100%; the saved clip plays with both in every frame (iOS 14.5+ needed for clip preparation) | NOT RUN |
| 4.6 | Redact, rotate, flip, annotate a photo | As in the Android checklist section 9 | NOT RUN |

## 5. Supervision, dashboard, Still to do, guides

Repeat the Android checklist sections 3, 4, 5, 6, 7 and 11 on the iPhone. Results: ____________

## 6. Storage, backup and the background

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 6.1 | Add 10 photos to scans, force-quit the app, reopen | All photos still there | NOT RUN |
| 6.2 | Leave the phone a day, reopen | Photos still there (WebKit storage is excluded from iCloud backup and must persist: check) | NOT RUN |
| 6.3 | Encrypted backup: save to Files | Saved where chosen | NOT RUN |
| 6.4 | Restore on another iPhone or Android phone | Logbook and media restored; annotated photos reopen with their annotations | NOT RUN |
| 6.5 | Background the app while Can't sync for 5 minutes | No retries while away; one on return | NOT RUN |
| 6.6 | Keyboard on the scan form | Fields stay visible above the keyboard; Save reachable | NOT RUN |

## 7. Accessibility

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 7.1 | VoiceOver: Home, the carousel, Remove supervisor, the editor modes | Names read; carousel cards read as "n of m"; the confirmation can be cancelled | NOT RUN |
| 7.2 | Larger Text at the largest size | Nothing cut off | NOT RUN |
| 7.3 | Reduce Motion on | No section animations | NOT RUN |
| 7.4 | Dark Mode | Readable throughout; sign-off and verify pages stay light | NOT RUN |

## 8. Before TestFlight

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 8.1 | App Store Connect readiness list (`store-readiness.md`) | Every item ticked | NOT RUN |
| 8.2 | The owner's written approval to upload | Recorded | NOT RUN |
