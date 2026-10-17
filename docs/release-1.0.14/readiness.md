# 1.0.14 (20): release gate after the data-protection review

## Gate

| Question | Answer | Evidence |
|---|---|---|
| Does incomplete scan-form information survive app termination? | **Yes.** It is kept 0.6 s after typing, and at once when the app is left; Home and the form offer it back; it saves as one scan; it is never applied over a newer saved version | e2e-1014 F1 to F11; emulator T1 (real keyboard, `am kill`); upgrade U3 |
| Do unfinished images and clips remain recoverable? | **Yes.** This covers the editor open, Keep for later, a prepared but unsaved item, and the camera still open when Android ends the app | e2e-1014 P; emulator X1, X2, M3 |
| Is unredacted media excluded from unintended backups? | **Yes, proved.** Cloud backup is refused. Device-to-device transfer copies nothing; a control build without the rules did copy the photos. Camera captures no longer reach the gallery or shared storage | emulator Y1, Y2, M1, M2; `data-protection-review.md` §3 |
| Is account isolation correct? | **Yes.** There is a drafts database per account, and another account's database is closed before one is opened. After log out the items stay hidden and come back only for the same account. Sync works after logging out and in (a defect in the first candidate, fixed) | e2e-1014 I1 to I3; emulator O1 |
| Do saved scans and attachments remain intact? | **Yes.** All 745 scan-form controls are unchanged. A 1.0.13 scan with its photo (same SHA-256) and unsynced state survives the in-place update | e2e-1011 F0; upgrade U2; e2e-upgrade 12/12 |
| Do all existing regression tests pass? | **Yes.** Two intended exceptions, as before: e2e-1013 A (the old slider) and e2e-1011 from E6 (the old Cover mode) | `test-report.md` |
| Is the unsigned release ready for signing? | **Yes, for your Fold7 and internal testing** | Checksums and rehearsal in `signing-and-install.md` |

**Recommendation.** Sign and install 1.0.14 (20) on the Fold7, over 1.0.13 and after a backup. Do **checklist 1.19
first** (clips recorded through Wavelength may be in your gallery), then the rest of `checklist-fold7.md`.

**Not yet for public release** (Play production or open testing) until:

1. the phone-only checklist rows pass;
2. the privacy notice and terms text is deployed to the website;
3. you have added and signed DPIA Amendment 2.

## Security and privacy findings

1. **Clips recorded through Wavelength were in the phone's gallery** (from the start of clips to 1.0.13).
   - **Severity:** high.
   - **Status:** fixed for new clips. Existing ones need your check (checklist 1.19); Wavelength cannot delete another
     app's files.
2. **"Take photo" originals left in the app's shared-storage folder** (1.0.8 to 1.0.13).
   - **Severity:** moderate. Other apps can't read the folder on Android 11+, but a cable-connected computer may.
   - **Status:** fixed. Leftovers are offered at the first start.
3. **Safety copies hold unredacted originals on the phone** until the item is saved or discarded.
   - **Severity:** low, mitigated: private storage, excluded from every backup and transfer, per account.
   - **Status:** the privacy notice text and the DPIA amendment are prepared for you.
4. **Sync answers dropped after logging out and in** (first 1.0.14 candidate only, never installed).
   - **Severity:** moderate, an integrity issue.
   - **Status:** fixed and tested.
5. **Discarded files are erased lazily** by the WebView: at the latest at the next start, as observed on the emulator.
   - **Severity:** low. Until then they stay in private storage and are excluded from backup.
   - **Status:** documented.
6. **No new permissions, server routes, libraries or analytics.** The signing material was never opened.

## Score (out of 10)

| Area | Score | Why not 10 |
|---|---|---|
| Prevention of data loss (media and typed scans) | 9.5 | Everything is proved on the emulator and in the browser. A Recents swipe and the Samsung keyboard need the phone |
| Protection of patient information on the device | 9 | Gallery and shared-storage leaks are closed and backup exclusion is proved. Samsung Camera and Smart Switch are not tested; existing gallery clips need your action |
| Account isolation and sync integrity | 9.5 | Proved in the browser. A shared real device with two accounts is not tested |
| Completed 1.0.14 refinements (keyboard Back, slider, colour, Fold layout, guides, About, backup tick, sign-up) | 9 | Unchanged and retested; feel and hinge need the phone |
| Whole app as a busy clinician | 9 | Translations are machine-drafted; pictograms need clinical review |

**Overall: 9 / 10, honestly.** The remaining point is the phone itself: the checklist's phone-only rows, Samsung
Camera's behaviour with the private file, and the website and DPIA paperwork. I would not call it 10 / 10 before
those are done.
