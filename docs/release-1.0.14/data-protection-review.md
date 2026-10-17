# 1.0.14 (20): data-protection and draft-recovery review

Carried out on 10 October 2026 before the owner signs and installs 1.0.14 on the Galaxy Z Fold7. Everything was tested
with synthetic accounts, synthetic pictures and the emulator's synthetic camera scene. Nothing was sent to the live
server: the emulator was in airplane mode and the browser checks used a local Worker.

## 1. Where photos and clips can be on the phone

| What | Where | Who can read it | Leaves the phone? | Removed when |
|---|---|---|---|---|
| Saved scan images and clips | WebView IndexedDB `wavelength-<account>` (`app_webview/Default/IndexedDB`, blob files) | Wavelength only (internal storage, `drwx------`, own Linux user id) | Only in the learner's own encrypted backup file, or encrypted in a sign-off link they send | Scan or image deleted; account deleted; uninstall |
| Safety copies of new photos and clips (as taken, **before redaction**) and typed unfinished scans (1.0.14) | WebView IndexedDB `wavelength-<account>-drafts`, stores `media`, `state`, `forms` | Wavelength only (as above) | **Never**: not synced, not in backup files, excluded from Android backup and device transfer (proved, §3) | Scan saved; learner discards; account deleted; uninstall. Never by age |
| Camera capture in progress (1.0.14) | `files/wl-captures/WL_*.jpg|mp4` (internal storage) | Wavelength only; the camera app gets write access to that one file for that one capture | Never | As soon as the app holds its own copy (seconds); if Android ended the app meanwhile, at the next start after it is offered back |
| **Before 1.0.14:** "Take photo" originals | `Android/data/uk.co.thewavelength.app/files/Pictures/JPEG_*.jpg` (shared storage) | Wavelength; on Android 11+ not other apps, but **a computer connected by cable may see this folder**; adb | Never deleted by the app | 1.0.14 finds them at start and offers **Delete the leftover copies**, **Review them first** or **Not now** |
| **Before 1.0.14:** "Record a clip" originals | The **camera app's gallery** (`/sdcard/Movies/VID_*.mp4`, MediaStore, owned by the camera app) | Any app with photo and video access; the phone's cloud photo backup (for example Google Photos or Samsung Cloud) if switched on | Possibly, through the phone's photo backup | Only by the learner, in the gallery. 1.0.14 cannot reach them (another app's files) |

### Findings
- **Clips (serious, since clips were introduced).** "Record a clip" passed no output file to the camera app, so the
  camera app saved every recording in the phone's gallery. This is unredacted ultrasound video with possible on-screen
  identifiers, kept outside Wavelength's control. The emulator reproduced it: `/storage/emulated/0/Movies/VID_20261010_195115.mp4`,
  owned by `com.android.camera2`. **Fixed** in 1.0.14 (WLChromeClient). **Owner action:** check the Fold7's Gallery
  (Videos, and the camera folder) for clips recorded through Wavelength, and delete any that should not be there.
  Check whether Samsung Cloud or Google Photos uploaded them.
- **Photos (moderate, since 1.0.8).** "Take photo" originals stayed in the app's shared-storage folder, never deleted.
  Other apps cannot read it on Android 11+, but a computer on a cable may. **Fixed**: new captures go to internal
  storage and are removed. Leftovers are offered at the first start of 1.0.14.
- **1.0.14 wording.** The leave question said a photo or clip taken in Wavelength "is not saved anywhere else on your
  phone". Before this review that was untrue for clips. It is now true. If a camera app ignores the private file and
  keeps its own copy, Wavelength says so and tells the learner to delete it from the gallery (`wl:capture-elsewhere`).

## 2. How each risk is handled

- **Unexpected termination.** Typed scan forms are written 0.6 s after the last change, and at once when the app
  goes to the background (`wl:pause`, `visibilitychange`). Photos and clips are written when the editor opens and on
  every change. A camera capture made while Android ended the app is recovered from `wl-captures` at the next start.
- **Restore.**
  - Home shows "Kept on this phone", with what is kept, since when and how much space it takes.
  - The scan form offers each item with Continue (or Add to this scan) and Discard. Discard asks first.
  - Nothing is added to a scan by itself, so nothing lands on the wrong patient's scan unnoticed.
- **Never overwrite a newer saved entry.** An unfinished edit records a stamp of the scan's content when the edit
  began. The edit is offered to continue only if the scan still has that stamp. If the scan changed in the meantime
  (another device, a sign-off, a later save), the edit is never applied: its text can be read and copied, and it
  stays kept until discarded.
- **No duplicate scans.** A new scan's id is fixed when its form opens. A continued form saves under that id, so it can
  make only one scan. A kept form whose scan was already saved (Wavelength closed between the save and the clean-up)
  is recognised and removed, not offered.
- **Account isolation.**
  - Each account has its own drafts database. The module closes another account's database before opening one.
  - Logging out keeps the drafts on the phone, hidden, and shows them again only when the same account logs in.
- **Retention.** Nothing is deleted by age, so clinically valuable work is never lost silently. Home shows the date
  of the oldest kept item and its size. After 14 days it adds "Finish or discard them when you can: nothing is
  deleted by itself."
- **Storage limits.** Up to 12 images or clips per scan (unchanged), and clips up to 10 s. If the phone cannot write
  a safety copy (short of space), the learner is told at once. No hard cap on kept items, because a cap would mean
  silent loss.
- **Deletion.** Discard, save and account deletion remove the records at once. The WebView erases the underlying
  files once nothing references them; the emulator showed this by the next start at the latest. Until then they stay
  in internal storage, unreadable to other apps and excluded from backup. Flash storage is not overwritten (normal for
  Android); the phone's file-based encryption protects it.

## 3. Evidence

All of it is from the emulator: Pixel 9 Pro Fold profile, Android 16, `google_apis` image, rootable for inspection.
The checks are `tools/e2e-1014-emulator.mjs` sections T, M, L, Y and O, and `tools/e2e-1014.mjs` sections F and I.

- **Manifest:** `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules="@xml/data_extraction_rules"`.
  The rules exclude all nine storage domains (root, file, database, sharedpref, external and their device-protected
  forms) from both cloud backup and device transfer. `test/storage-privacy.test.mjs` keeps them so.
- **`allowBackup="false"` alone is not enough on Android 12+.** In device-transfer mode Android started Wavelength's
  backup agent ("Initiating full-data transport backup … agentConnected"). The exclusion rules are what stops the copy.
- **A/B test with the system's own test transport.** The same phone held three kept synthetic photos. I ran it as
  cloud backup and as device-to-device transfer (`backup_local_transport_parameters` `is_device_transfer=true`):

  | Build | Cloud backup | Device-to-device transfer |
  |---|---|---|
  | Emulator-only control, rules removed | not run | **4.6 MB archive containing the IndexedDB blob files of the three photos** (33,813, 33,813 and 75,094 bytes) |
  | 1.0.14 as shipped | "Backup is not allowed" | Nothing stored ("Transport rejected package"); the photos were still on the phone |

  This proves the rules matter and work. Samsung Smart Switch uses Android's device-transfer path on Android 12+.
  Its own tool was not tested.
- **Other apps.** Under another user id (shell, 2000) listing `/data/data/uk.co.thewavelength.app` and
  `files/wl-captures` gives "Permission denied". `app_webview` and `wl-captures` are `drwx------`.
- **Camera.** "Take photo" (M1) and "Record a clip" (M2): the file exists only in `files/wl-captures` while the
  camera returns, and is gone once the editor has it. There are no files in the shared folder and no new gallery rows.
  M3: Android ended Wavelength while the camera was open; the photo came back as kept, and the folder was emptied.
- **Typed forms.**
  - F1 to F11 (browser) and T1 (emulator, real keyboard, `am kill`) cover keeping, offering, restoring every answer,
    one scan only, the stale-copy case, the older-edit case, reading the text, discarding, two kept forms, and
    switching between forms.
- **Isolation.**
  - I1 to I3: log out of A and log in as B in the same run; none of A's items show. Back to A, A's items are there.
  - I2 also covers the defect below.

## 4. Defects found by this review (fixed)

1. **Sign-out counter overwritten (1.0.14 regression, introduced by the first candidate).** The drafts module
   declared `var SESSION = uid()` in the same scope as the sync's sign-out counter. After logging out and in again
   without restarting the app, every sync answer was dropped as if from the earlier login. Scans reached the server,
   but the phone never marked them synced and stopped pulling changes until Wavelength restarted. The first candidate
   fails I2 ("dirty": true); this build passes. The module's id is now `RUN`, and a unit test keeps one `SESSION`.
2. **Kept items missing after login.** Home is drawn under `#/login` straight after logging in, and the kept card
   checked the route name, so it did not appear until the next visit to Home. The card now follows the Home screen
   that asked for it.
3. The camera findings in §1.

## 5. Privacy notice, terms, store answers and DPIA

- **Privacy notice** (website, `build.js` `/privacy/`, "Wavelength app and logbook"). Added on the branch: camera
  captures go to private storage, not the gallery; the safety copies (what they are, never leave the phone, excluded
  from backups and transfer, when they are removed, never by age, kept across log out for the same account only).
  Date 10 October 2026. **Not deployed:** the website goes live from `main`, with the owner's approval. Deploy it
  before or with the 1.0.14 release.
- **Logbook terms** ("Where your data lives"): one sentence on unfinished items. Same deployment note.
- **Store answers** (`mobile/STORE.md`). Data safety and the App Store labels need no change: the safety copies are
  stored on the device only and never collected. Added a line on capture storage.
- **DPIA.** The signed DPIA ("Wavelength DPIA: encrypted image and clip sharing for supervisor sign-off", Claude Docs,
  with Amendment 1 for clips) covers sharing in sign-off links. The safety copies do not change what is shared. They
  are local processing of the same personal data, for a new purpose (preventing loss). **Proposed Amendment 2 for the
  owner to add and sign** (not added by Claude; the signed document was not edited):

  > **Amendment 2 (October 2026): on-device safety copies and camera storage (app 1.0.14).**
  >
  > **Processing.** To prevent loss of clinical training records, the app keeps, on the learner's device only:
  > - new photos and clips as taken (before redaction);
  > - their edits;
  > - text typed into unfinished scan forms.
  >
  > These copies are kept until the scan is saved or the learner discards them. They are stored in the app's private
  > storage, per account. Camera captures are written to the app's private storage and removed once copied.
  >
  > **Not processed by Wavelength.** Nothing is synced, uploaded, shared or included in backups. Android cloud backup
  > and device-to-device transfer are excluded by configuration, verified on 10 October 2026.
  >
  > **Risks and measures.**
  > - Lost or stolen phone: the phone's own encryption and screen lock, and the optional Wavelength app lock.
  > - Shared phone with several accounts: separate storage per account; hidden after log out.
  > - Unredacted media held longer than before: a Home reminder with age and size, and discard on request. No silent
  >   deletion, because losing clinical work is itself a harm.
  > - Camera apps keeping their own copy: the learner is told and directed to delete it.
  > - Media that earlier versions left in the gallery or shared storage: leftovers offered for deletion; the owner
  >   checks the gallery.
  >
  > **Residual risk:** low.
  >
  > **Review:** with the DPIA's October 2027 review.

## 6. Not proved without the phone

- **Samsung Camera:** whether it honours the private output file for video, as the emulator's camera does. If it does
  not, the "camera app kept a copy" message appears. Checklist 1.13.
- **Leftover photos on the owner's Fold7:** the JPEG leftovers from 1.0.8 to 1.0.13 should be offered at the first
  start. Checklist 1.15.
- **Samsung Smart Switch:** its own tool was not tested; only Android's device-transfer path was.
