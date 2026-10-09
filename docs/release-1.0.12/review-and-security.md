# Wavelength 1.0.12: independent review and security findings

An independent reviewer read the whole 1.0.12 change set against the 1.0.11 seed without the developer's notes. It
covered Worker authorisation, data exposure, the editor's redaction guarantees, backup compatibility, escaping, iOS
native code and performance. It changed no files. Every finding was then fixed or explained here, and the fixes are in
commit "1.0.12: fixes from the independent review". The suite now has 315 tests, all passing.

**Severity summary:** no critical, no high, 4 medium, 11 low or informational.

## Medium

| # | Finding | Status |
| --- | --- | --- |
| 1 | The supervisor's cached view of a learner (kept 15 s for moving between tiles) could be shown to the next account on a shared phone. The same happened just after ending supervision. | **Fixed.** The cache is tied to the login, and cleared on sign-out and when supervision ends. |
| 2 | Ending a link committed before its audit row. If the second write failed, a retry answered "already ended" and the audit row was never written. | **Fixed.** The guarded update, the audit row (`INSERT … SELECT … WHERE changes() > 0`) and the returned requests are one D1 batch. Test: a forced batch failure leaves the link active; the retry ends it with exactly one audit row. |
| 3 | The new dashboard tiles call a new route. Against the current production Worker they would open "Update needed on the server". | **Fixed in the app:** without the new `counts` field, the scan tiles and module rows are not links. **Release order:** deploy the Worker before the store builds (`backend-and-web.md`). |
| 4 | The finer relationship stage told a learner that a supervisor's approval had lapsed ("paused"), where 1.0.11 said "not yet verified". | **Fixed.** A lapse now reads as 1.0.11 showed it: not verified, or unavailable when approval is enforced. Application progress (awaiting professional verification, awaiting approval) is still shown, as the specification asks: it is a status, not a private reason. **Owner to confirm** this line. |

## Low and informational

| # | Finding | Status |
| --- | --- | --- |
| 5 | "Requests waiting with them" counted expired requests. | Fixed (`expires_at > now`). Test added. |
| 6 | A supervisor's own withdrawal (`ended_by = 'self'`) read as "ended by Wavelength". | Fixed: it reads "you" for the supervisor and "them" for the learner. Test added. |
| 7 | Re-inviting changed an open search request into an email invitation. | Fixed: `via` changes only on an ended link. Test added. |
| 8 | A crafted pathway id (`constructor`, `__proto__`) in the module filter gave a 500, and `#/outstanding/constructor` broke the app view. | Fixed on both sides with own-property checks. Test added. |
| 9 | Annotation data from a damaged backup could throw, or draw at a huge size. | Fixed: `cleanAnn` skips non-objects and clamps every number. Test added. |
| 10 | After one "Add again" on an identifier warning, later different text skipped the check. | Fixed: the override applies only to the exact text confirmed, and resets when the panel opens. |
| 11 | Undo or Reset could remove a redaction while the declaration stayed ticked. This was also true in 1.0.11. | Fixed: undo, redo and reset untick the declaration, so it must be given again. |
| 12 | Re-editing lost the earlier orientation record. | Fixed: earlier turns are composed with new ones (`composeOrient`). Test covers all 64 combinations. |
| 13 | If a backup lost the base picture, re-editing drew the annotations a second time. | Fixed: without a base, re-editing starts from the saved picture and offers no separate annotations. |
| 14 | Every pointer move repainted the full picture, and the carousel observer was never disconnected. | Fixed: at most one repaint per frame, and one observer at a time. |
| 15 | The iOS plugin reports any usable path as "validated", so a captive portal looks validated. | Accepted. iOS has no separate check for apps. With `vpnKnown` false and the server-reachability test, the app still shows "Can't sync" correctly. Documented in the plugin header. |

## Checked and sound (reviewer's summary)

- **Ending supervision**
  - Only the learner, the linked supervisor, or the confirmed holder of the invited email can end a link.
  - Anyone else gets the same 404 as an unknown id.
  - Under a race it ends exactly once, and repeats are idempotent.
  - Returned requests are limited to that pair.
  - Completed sign-offs and assessments are untouched and still verify.
- **Re-invitation** clears the old acceptance and claim, so the supervisor must accept again.
- **Trainee record lists**
  - They use the same access check as the dashboard.
  - Deleted entries are excluded.
  - They return written summaries only, never images or reflections.
- **Media editor**
  - Redactions are drawn in source pixels in the same transform as the picture, and before annotations.
  - The preview, the saved image and every clip frame use the same drawing function.
  - The stored base picture is already redacted, so no unredacted copy is kept.
  - The declaration is mandatory, and the tools are locked while saving.
- **No new server data**
  - Annotations, base pictures and provenance stay on the phone and in the learner's own encrypted backups.
  - The editor makes no network calls.
- **Backups:** 1.0.11 ignores the new fields and files, and 1.0.12 reads every older backup.
- **Guides**
  - The HTML is first-party build output with no scripts or handlers.
  - Text is escaped, and only http and https source links are allowed.
  - In the store apps, links open outside the logbook.
- **Escaping:** every new string that carries a name, email, label or annotation text goes through `esc()` or
  `textContent`.
- **Motion** is off under reduced motion and in print.

## Security notes for the owner

- No secret, key, keystore or credential was added to the repository or the handover. The unsigned Android artefacts
  contain no signing material.
- No production system was contacted. Every test ran against a local Worker with node:sqlite standing in for D1.
- `changes()` inside a D1 batch was tested on node:sqlite. D1 runs a batch as one SQLite transaction on one connection,
  so the behaviour is the same. Confirm it once on a preview deployment before relying on it in production.
- Clinical safety:
  - Pictograms and label sets are orientation aids drawn for this release.
  - They need clinical review before release, as the pearl graphics do.
  - The editor never claims an image is anonymous. It asks the learner to declare it.
