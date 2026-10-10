# 1.0.14 work record

Local stand-in for the issue #2 start and handoff comments (GitHub is unavailable, as for 1.0.13). Copy into issue #2
when GitHub is back.

## Start (10 October 2026)

- Task: quality refinement after Fold7 testing of 1.0.13 (19). Covers:
  - loss of photos and clips on Back;
  - annotation size slider;
  - resize dot;
  - colour control;
  - Fold7 layout;
  - Progress guide links;
  - About logo flash;
  - backup acknowledgement;
  - the slow-start sign-up defect;
  - review, regression and a new candidate.
- Worktree: `C:\Users\phira\Wavelength-Cloud\wavelength-1.0.14`, with LF line endings.
- Branch: `wavelength-1.0.14`, taken from `wavelength-1.0.13` (`8e770e6`). It is then merged into
  `wavelength-android-fixes-20261010`.
- Areas:
  - `src/app/app.js`, `src/app/editor.js`, `src/app/app.css`, `src/app/i18n/*.json`;
  - `test/editor.test.mjs`, `test/app-1011.test.mjs`;
  - `tools/e2e-1014.mjs`, `tools/e2e-1014-emulator.mjs`, `tools/emulator-kit.mjs`, `tools/editor-colour.mjs`;
  - `tools/e2e-1012.mjs`, `tools/e2e-1013.mjs`, `tools/i18n-extract.mjs`, `tools/i18n/strings.json`;
  - this folder.

## Handoff

- Status: done and tested. The unsigned release is built. Signing, installing and any upload wait for the owner.
- Commits on `wavelength-1.0.14`:
  - `844e788` (the fixes);
  - `ac424d7` (layout and wording refinements, regression updates);
  - `24c3f4f` (keyboard detection found on the emulator, emulator checks);
  - `6089ac7` (emulator check robustness);
  - the documents commit.
- Migrations, Worker, Cloudflare: none. No new API routes; nothing depends on the commercial branch. No deploy.
  Nothing pushed.
- Tests: see `test-report.md`.
- Release: 1.0.14 (20), unsigned APK and AAB, with `SHA256SUMS.txt` beside them, in:
  - `C:\WavelengthSigning\unsigned\wavelength-1.0.14\`
  - `C:\Users\phira\Wavelength-Cloud\handover-1.0.14\android\`

  The checksums:
  - APK `526fcfc6b41f310e02493ef0776c620cd1ee4903e3b1f21de2d73006d47f0763`
  - AAB `15f3a78ff525c74992e2734d5c09ee952e39950731a959b361a7dec236476939`
- Signing: `C:\WavelengthSigning\sign-wavelength-1.0.14.ps1`.
  - It uses hidden prompts and checks against the certificate of the 1.0.13 release (`ee30bfd2…a1e0`).
  - It was rehearsed with the throwaway emulator key and the rehearsal outputs were deleted.
  - The original keystore was not opened.
  - Steps: `signing-and-install.md`. Phone checks: `checklist-fold7.md`.
- Rollback: keep 1.0.13 (19). A downgrade needs an uninstall, so back up first (`signing-and-install.md`, Rollback).
  A fix would ship as 1.0.15 (21).
- Emulator-only builds are in the session scratchpad; they are never for a phone:
  - a debug build with WebView debugging;
  - 1.0.13 and 1.0.14 signed with the throwaway key "CN=Emulator test only".

## Priority before public release: closed

- **Sign-up typing cleared on a slow start** (recorded as a priority with 1.0.13). Fixed in 1.0.14:
  - the late start-up answer only replaces the start or recovery screen;
  - only one request is sent;
  - failure messages are in plain words.

  Tested by e2e-1014 R1 to R3. Still to try on the phone: `checklist-fold7.md` 5.5.

## Preserved

- These are untouched:
  - the 1.0.12 repo and the 1.0.13 branch and release files;
  - the commercial branch and the video work;
  - the recovery backups;
  - the signed files in `C:\WavelengthSigning\signed`;
  - the 93 line-ending-only files in `wavelength-android-fixes`.
- Nothing has been installed on the phone or uploaded.
