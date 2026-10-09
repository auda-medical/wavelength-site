# Wavelength 1.0.12: Android physical-device checklist

For the product owner, on a real Android phone, before signing and releasing 1.0.12 (version name 1.0.12, version
code 18, package `uk.co.thewavelength.app`). The unsigned APK and AAB in the handover are for inspection: build and
sign the release with your own process and key, from the same source.

Every item is **NOT RUN** until you run it on a phone. Browser simulations in the cloud workspace covered the logic
(`docs/release-1.0.12/test-report.md`), but they are not evidence of behaviour on a device. Use synthetic scans and
synthetic pictures only (for example a photo of a test pattern), never a patient image. Change NOT RUN to PASS or FAIL
and add the date, phone model and Android version.

Phone and Android version: ____________________ VPN app and version: ____________ Date: ____________

Two accounts are needed for sections 3 to 5: a learner account and a supervisor account (another phone, or the
website on a computer). Use dummy names.

## 0. Install and upgrade over 1.0.11

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 0.1 | Before upgrading, in 1.0.11: note the scan count, one scan with a photo, one with a clip, app lock on, dark theme, one supervisor linked, one scan saved offline and not yet synced | Baseline recorded | NOT RUN |
| 0.2 | Install the signed 1.0.12 over 1.0.11 (do not uninstall) | Installs as an update (version code 18 is higher than 17); no sign-in asked | NOT RUN |
| 0.3 | Open the app | App lock asks first; logbook, photos, clips, theme, supervisors and trainees all still there | NOT RUN |
| 0.4 | Settings > About Wavelength | Version 1.0.12 (18) | NOT RUN |
| 0.5 | The scan saved offline in 1.0.11 | Syncs once; appears once on the website logbook | NOT RUN |
| 0.6 | Clean install on a second phone (or after clearing app data), sign in | Logbook downloads; no photos (they never left the first phone) | NOT RUN |
| 0.7 | Rollback plan: keep the signed 1.0.11 APK; do not clear app data | Rollback available | NOT RUN |

## 1. App lock and biometrics (unchanged in 1.0.12; regression check)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 1.1 | Me > Settings > Security: turn app lock on | System prompt (fingerprint, or PIN on Android 11+) | NOT RUN |
| 1.2 | Leave the app for more than 90 s, return | Asks again before showing anything | NOT RUN |
| 1.3 | Cancel the prompt | Logbook stays locked; Log out is offered | NOT RUN |

## 2. Connection status (regression of 1.0.11 behaviour)

| # | Network | Expected | Result |
| --- | --- | --- | --- |
| 2.1 | Wi-Fi, no VPN, save a scan | Returns Home: "Scan saved." then "Scan saved and synced." | NOT RUN |
| 2.2 | Flight mode on, save a scan | "Saved on this device. Awaiting sync."; never says synced | NOT RUN |
| 2.3 | Flight mode off | Syncs within seconds; appears once on the website | NOT RUN |
| 2.4 | VPN connected, Flight mode on, Wi-Fi off (VPN still shows Connected) | Red Offline | NOT RUN |
| 2.5 | VPN on, Wi-Fi on, server blocked by the VPN's filter | Amber Can't sync; Connection details give VPN and firewall advice; the app never switches the VPN off | NOT RUN |
| 2.6 | Background the app for 5 minutes while Can't sync, return | One retry on return, no burst | NOT RUN |

## 3. Supervision: invitation and verification statuses

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 3.1 | Learner: Me > Your supervisors | Under the email box: "They may need checks and Wavelength approval..."; a "What happens after I invite someone?" panel | NOT RUN |
| 3.2 | Invite the supervisor account | Sheet: invitation sent, pending is expected, guide link | NOT RUN |
| 3.3 | The list | "Invitation sent" with its meaning (not a bare "Unverified") | NOT RUN |
| 3.4 | Supervisor accepts (their app or the website) | Learner's list: "Not yet verified by Wavelength" with what it means (approval is not enforced on the live service at present) | NOT RUN |
| 3.5 | Tap the supervisor | Details: what this means, next step, invited and accepted dates, requests waiting, guide link | NOT RUN |
| 3.6 | Me > How supervisor verification works | The guide opens, all sections, sign-off section matches the live setting | NOT RUN |

## 4. Ending supervision

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 4.1 | Learner sends a sign-off request to the supervisor's dashboard | Shown as waiting with the supervisor | NOT RUN |
| 4.2 | Flight mode on; learner taps Remove supervisor, then the red button | "You are offline. Nothing has changed..."; the supervisor still sees the learner | NOT RUN |
| 4.3 | Flight mode off; Remove supervisor | Confirmation lists the consequences; after confirming: "Supervision ended on <date>. Wavelength has recorded the change."; 1 open request came back | NOT RUN |
| 4.4 | Supervisor's app | The learner has gone from Your learners; "Ended recently" shows it (ended by the learner); the learner's page no longer opens | NOT RUN |
| 4.5 | Learner: Your supervisors | "Ended recently"; the returned request can be sent on or cancelled | NOT RUN |
| 4.6 | Earlier completed sign-offs and assessments | Still in the logbook and still verify at thewavelength.co.uk/verify | NOT RUN |
| 4.7 | Learner invites the same supervisor again | Pending until the supervisor accepts again | NOT RUN |
| 4.8 | Supervisor: open the learner, End supervision, confirm | Same as 4.3 to 4.5 from the other side | NOT RUN |
| 4.9 | Supervisor: decline a new invitation | Asks first; the learner sees it has gone | NOT RUN |

## 5. Supervisor dashboard

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 5.1 | Supervisor opens a learner | Four tiles (Scans, Supervised, Signed off, Assessments), each with an arrow | NOT RUN |
| 5.2 | Tap each tile | Exactly that many records, filter named, Clear filters, Back to <name> | NOT RUN |
| 5.3 | A tile with zero | A clear empty message | NOT RUN |
| 5.4 | Flight mode on, open a tile | "Your learners' records are only shown while you are connected" | NOT RUN |

## 6. Home: Still to do

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 6.1 | Home | "Still to do" shows every open requirement of the pathway as cards with dots; it does not move by itself | NOT RUN |
| 6.2 | Swipe left and right; use the arrows | One card at a time; smooth; the page does not jump | NOT RUN |
| 6.3 | Log a scan of another type, return Home | Opens at the card you last looked at | NOT RUN |
| 6.4 | View all | Every open requirement; orders: curriculum, fewest, most | NOT RUN |
| 6.5 | Two pathways chosen | A pathway picker above the cards | NOT RUN |

## 7. Saving a scan (must be unchanged from 1.0.11)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 7.1 | Fill a scan, tap Save twice quickly | One scan; back to Home; short note; no sheet with New scan or Next patient | NOT RUN |
| 7.2 | Leave out supervision, Save | The field is marked; everything typed stays | NOT RUN |
| 7.3 | Log one from a card | The application is chosen and the form glides to the date | NOT RUN |

## 8. Motion and appearance

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 8.1 | Scroll Home and Progress slowly | Sections below rise a little and fade in once; nothing flickers; scrolling stays smooth | NOT RUN |
| 8.2 | Scroll back up | Nothing animates again | NOT RUN |
| 8.3 | Android Settings > Accessibility > Remove animations, reopen | No movement at all | NOT RUN |
| 8.4 | Dark theme, light theme | Both readable, including the editor and guides | NOT RUN |
| 8.5 | Largest system font size | No text cut off on Home, the scan form, the editor or the guides | NOT RUN |
| 8.6 | TalkBack on: Home cards, the carousel, the editor modes | Each control is announced with its name; carousel cards read as "n of m" | NOT RUN |

## 9. Photo editor (synthetic pictures only)

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 9.1 | Add a photo of a test pattern | Editor opens on Adjust; tabs Annotate, Adjust, Redact | NOT RUN |
| 9.2 | Redact two areas (black, then grey) | Solid fills; the note says blurring is not offered | NOT RUN |
| 9.3 | Rotate, flip horizontally, flip vertically, crop | The redactions stay on the same content | NOT RUN |
| 9.4 | Annotate: a label from the set for the scan type, your own text, an arrow, a dot, a circle, a box, a pictogram | All placed, movable with a finger, resizable with the handle, deletable; colours apply | NOT RUN |
| 9.5 | Type a date of birth as a label | Questioned before it is placed | NOT RUN |
| 9.6 | Use this image is disabled until the declaration is ticked | Yes | NOT RUN |
| 9.7 | Save the scan, open it, tap the image | The saved image matches the editor, with redactions and annotations | NOT RUN |
| 9.8 | Edit the scan, tap the pencil on the photo | Annotations return and can be changed; redactions cannot be undone | NOT RUN |
| 9.9 | Check the phone's own gallery | The original photo is still there, unchanged (Wavelength never alters it) | NOT RUN |

## 10. Clip editor

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 10.1 | Record a 15 s clip of a moving test pattern | Length shown about 15 s; up to 10 s can be kept | NOT RUN |
| 10.2 | Redact an area, add a label for the whole clip, add a dot "From here" at 3 s | Preview shows the dot only after 3 s | NOT RUN |
| 10.3 | Rotate, then Use this clip | Progress up to 100%; the editor closes | NOT RUN |
| 10.4 | Play the saved clip from the scan | Redaction in every frame; label throughout; dot from 3 s; turned as previewed | NOT RUN |
| 10.5 | Note how long preparation took on this phone | ____ s for ____ s of clip | NOT RUN |

## 11. Guides

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 11.1 | Progress > Guides and accreditation | Your pathway's guide opens; the note says it is Wavelength's guide; checked date; official sources | NOT RUN |
| 11.2 | Flight mode on, open Guides | Opens (guides ship with the app) | NOT RUN |
| 11.3 | Tap an official source | Opens outside the logbook | NOT RUN |

## 12. Backup and restore

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 12.1 | Make an encrypted backup with an annotated photo | Created | NOT RUN |
| 12.2 | Restore on a second phone (same account) | Photo restored as saved; the pencil reopens it with its annotations | NOT RUN |
| 12.3 | Restore the same file in 1.0.11 (if a phone still has it) | Restores the photo as saved | NOT RUN |
