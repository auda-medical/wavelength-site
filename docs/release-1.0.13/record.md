# 1.0.13 work record

Local stand-in for the issue #2 start and handoff comments (the GitHub account is suspended, as in
`docs/commercial-2026/00-execution-record.md` on the commercial branch). Copy into issue #2 when GitHub is back.

## Start (10 October 2026)

- Task: Annotation size slider in place of S, M and L; image zoom in the editor; Guides (and the logbook) keep their
  place, search and filters when going back; a new Android release.
- Worktree `C:\Users\phira\Wavelength-Cloud\wavelength-android-fixes`. Branch `wavelength-1.0.13` from 1.0.12
  (`90a8e6a`), merged into `wavelength-android-fixes-20261010` (which carries the commercial work).
- Areas: `src/app/app.js`, `src/app/editor.js`, `src/app/app.css`, `src/app/i18n/*.json`, `test/editor.test.mjs`,
  `tools/e2e-1013.mjs`, `tools/e2e-1013-emulator.mjs`, `tools/i18n-extract.mjs`, this folder.

## Handoff

- Status: done and tested; unsigned release built; signing, installing and any upload wait for the owner.
- Commits on `wavelength-1.0.13`: `5084ac7`, `972cb0f`, `e19d33b`, `2c2e336` (app), `9306e13`, `cff6a27` (tools), and
  the documents commit. Merged into `wavelength-android-fixes-20261010`.
- Migrations, Worker, Cloudflare: none. No deploy. Nothing pushed (GitHub unavailable; NAS remote untouched).
- Tests: `test-report.md`.
- Release: 1.0.13 (19), unsigned APK and AAB in `C:\WavelengthSigning\unsigned\wavelength-1.0.13\` and
  `C:\Users\phira\Wavelength-Cloud\handover-1.0.13\android\` (`SHA256SUMS.txt` beside them). Signing:
  `signing-and-install.md`. Phone checks: `checklist-android.md`.
- Rollback: keep 1.0.12 (18); a downgrade needs an uninstall, which deletes photos kept only on the phone, so back up
  first. A fix would ship as 1.0.14 (20).
- Tooling added to this PC for the build (free): Android SDK command-line tools, platform 36, build-tools 35 and the
  emulator under `C:\Android\sdk` (the signing tools in `C:\Android\build-tools-36.1` are unchanged), Gradle 8.14.3
  in `%USERPROFILE%\.gradle`. Norton Antivirus inspects HTTPS on this PC, so Gradle ran with
  `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` (that session only).
- Emulator-only test builds (never for a phone) are in the session scratchpad: a debug build with WebView debugging,
  and copies signed with a throwaway key "CN=Emulator test only".

## Priority before public release

- **Sign-up typing can be cleared on a slow start** (also in 1.0.12; `test-report.md`). On a slow connection, text
  typed into Create account before the app's start-up check (`/api/app/me`, `boot()` in app.js) answers is lost when
  that answer re-draws the screen. Owner's decision, 10 October 2026: fix before any public release (Google Play
  production or open testing). 1.0.13 (19) is for the owner's phone and internal testing only.

## Signing (10 October 2026)

- Owner approved local signing and verification of the tested 1.0.13 (19) files only. Script:
  `C:\WavelengthSigning\sign-wavelength-1.0.13.ps1` (the steps of `signing-and-install.md` with every check
  automated; hidden password prompts; passwords only in that PowerShell process's environment, removed at the end;
  never overwrites). Rehearsed end to end with the throwaway emulator key (outputs deleted afterwards); refuses to
  overwrite. Run by the owner, who types the password; nothing is installed or uploaded.
- Working tree status before signing: clean (0 files changed). The 93 files listed earlier differed from the committed
  files only in line endings (Windows endings in the working copy, LF in the repository) because the repository's
  shared config has `core.autocrlf=false` while the system default is `true`; contents identical. Not modified or
  reset.
