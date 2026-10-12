# Wavelength 1.0.11: Android physical-device checklist

For the product owner, on a real Android phone, before signing and releasing the 1.0.11 APK or AAB
(version name 1.0.11, version code 17, package `uk.co.thewavelength.app`).

Every item is **NOT RUN** until you run it on the phone. Browser simulations in the cloud workspace covered the
logic (see `docs/release-1.0.11.md`), but they are not proof of behaviour on a physical device. Use synthetic
scans only. Change "NOT RUN" to PASS or FAIL and add a note with the date and phone model.

Phone and Android version: ____________________ NordVPN version: ____________ Date: ____________

## 0. Install and upgrade over 1.0.10

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 0.1 | Before upgrading, in 1.0.10: note the scan count, one scan with a photo, one with a clip, app lock on, dark theme, one scan saved offline and not yet synced | Baseline recorded | NOT RUN |
| 0.2 | Install the signed 1.0.11 over 1.0.10 (do not uninstall) | Installs as an update; no sign-in asked | NOT RUN |
| 0.3 | Open the app | App lock asks first; logbook, photos, clips, theme, supervisors and trainees all still there | NOT RUN |
| 0.4 | Settings > About Wavelength | Version 1.0.11 (17) | NOT RUN |
| 0.5 | The scan saved offline in 1.0.10 | Syncs once; appears once on the desktop logbook | NOT RUN |
| 0.6 | Rollback plan: keep the signed 1.0.10 APK to hand; do not uninstall 1.0.10 data | Rollback available | NOT RUN |

## 1. Connection status with NordVPN

| # | Network | Expected pill / Home warning | Result |
| --- | --- | --- | --- |
| 1.1 | Wi-Fi on, VPN off, server reachable | Synced (teal); no warning | NOT RUN |
| 1.2 | Wi-Fi on, NordVPN connected | Synced; save a scan, it syncs | NOT RUN |
| 1.3 | Mobile data only, NordVPN connected | Synced | NOT RUN |
| 1.4 | **Flight mode on, Wi-Fi off, mobile off, NordVPN still shows Connected** (the 1.0.10 case) | **Red Offline** (1.0.10 showed amber Can't sync). Connection details: "VPN on, with no Wi-Fi or mobile data under it" | NOT RUN |
| 1.5 | Same as 1.4, save a scan | "Saved on this device. Awaiting sync."; Home: "You're offline / 1 scan saved on this device, awaiting sync." | NOT RUN |
| 1.6 | Flight mode stays on, switch Wi-Fi back on (NordVPN reconnects) | Within seconds: Syncing, then Synced; the scan appears once on the desktop | NOT RUN |
| 1.7 | Flight mode on, Wi-Fi off, NordVPN off | Red Offline | NOT RUN |
| 1.8 | Wi-Fi on but Wavelength blocked (e.g. NordVPN Threat Protection, or a network that blocks the site) | Amber Can't sync; short Home warning with Retry sync and Connection details | NOT RUN |
| 1.9 | Disconnect and reconnect NordVPN repeatedly for 1 minute | Status follows; no repeated flicker of Retry sync; scans sync when the route works | NOT RUN |
| 1.10 | Background the app for 5 minutes while Can't sync, then return | Retries on return; no battery drain noticed while away | NOT RUN |
| 1.11 | Note what Android reports if NordVPN's kill switch ("Block connections without VPN") is on with Flight mode | Record what the app shows; it must never bypass the VPN | NOT RUN |

## 2. Retry behaviour

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 2.1 | Can't sync with 1 scan waiting: watch Retry sync for 1 minute without touching it | Stays enabled; does not keep greying out | NOT RUN |
| 2.2 | Tap Retry sync | Shows "Trying…" while it runs, then the result | NOT RUN |
| 2.3 | Open and close Connection details 10 times | No extra attempts listed under "Recent sync attempts" | NOT RUN |
| 2.4 | Offline: open Connection details | Retry sync greyed with "Available once this device has a network." | NOT RUN |

## 3. Home

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 3.1 | Look at the four count tiles | Raised surface, small arrow; each obviously tappable | NOT RUN |
| 3.2 | Tap each tile | Opens exactly the records counted, with the filter shown and Clear filter | NOT RUN |
| 3.3 | Tap the sync pill | Pressed feedback; Connection details open | NOT RUN |
| 3.4 | Me screen | No About entry; Settings (gear) ends with Wavelength, version, About Wavelength | NOT RUN |

## 4. Scan form (cardiac example)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 4.1 | Progress > AAA > Log one | The form opens with AAA ticked, pauses briefly, then glides to the date; no keyboard or date picker opens | NOT RUN |
| 4.2 | Choose Focused cardiac ultrasound by hand | Same guided glide to the date | NOT RUN |
| 4.3 | Scroll quickly through the whole form | Each numbered section is recognisable without reading the fields | NOT RUN |
| 4.4 | Fill LV, RV, effusion, IVC, Overall, Image quality | Selected answers filled, bold and ticked; clear in light and dark | NOT RUN |
| 4.5 | Save without supervision | Glides to Supervision, section header turns red, help shown; nothing cleared | NOT RUN |
| 4.6 | Switch to another app and back mid-form; toggle Flight mode mid-form | All answers still selected | NOT RUN |
| 4.7 | Tap Save several times quickly | Exactly one scan; Home with the note | NOT RUN |
| 4.8 | Scrolling the form and a long logbook | Smooth; no stutter compared with 1.0.10 | NOT RUN |
| 4.9 | Phone set to remove animations (Settings > Accessibility) | Form jumps straight to the date; nothing animates | NOT RUN |
| 4.10 | Large font size (Settings > Display) | No clipped or overlapping text | NOT RUN |

## 5. Photo editor

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 5.1 | Add a photo of a synthetic test pattern with an "R" marker | Editor opens; six tools: Crop, Cover, Trim top, Rotate, Flip H, Flip V | NOT RUN |
| 5.2 | Flip H, then Flip V | Preview mirrors, then turns upside down; the line under the tools says what is applied | NOT RUN |
| 5.3 | Undo twice; Reset | Back step by step; Reset returns to the original | NOT RUN |
| 5.4 | Cover a label, rotate, flip, Use this image | Saved image matches the preview exactly, cover burnt in | NOT RUN |
| 5.5 | Close and reopen the scan | Orientation unchanged | NOT RUN |
| 5.6 | Check the phone's gallery | The original photo is untouched (Wavelength keeps only its edited copy) | NOT RUN |

## 6. Clip editor

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 6.1 | Record a 20 s synthetic clip and open it | Total length about 20 s shown; selection up to 10 s; message that nothing outside the selection is saved | NOT RUN |
| 6.2 | Play / Pause, scrub | Plays the selection; scrubber moves; Pause stops | NOT RUN |
| 6.3 | Move Start and Length | Selected range and end point shown correctly; never past the end | NOT RUN |
| 6.4 | Cover a label, Rotate, Flip H, Use this clip | Progress shown; the saved clip matches the preview in every frame, cover in place throughout | NOT RUN |
| 6.5 | Cancel during "Preparing clip…" | Stops; nothing added | NOT RUN |
| 6.6 | Phone back button while the editor is open | Editor closes; nothing added | NOT RUN |
| 6.7 | Note the time to prepare a 10 s clip | Record seconds: ______ | NOT RUN |

## 7. Backup, sign-off, app lock

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 7.1 | Make an encrypted backup with flipped photo and clip | Backup completes | NOT RUN |
| 7.2 | Restore it (test account) | Media restored with the same orientation | NOT RUN |
| 7.3 | Send a sign-off link with a flipped image | Supervisor sees the same orientation | NOT RUN |
| 7.4 | App lock after 90 s in the background | Asks for fingerprint or PIN | NOT RUN |

## 8. Languages and dark theme

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 8.1 | Arabic: form, editors, warnings | Right to left, no overflow | NOT RUN |
| 8.2 | Dark theme: form and Home | Headings, answers and selected answers clearly readable | NOT RUN |

Sign-off to release: ____________________ (product owner) Date: ____________
