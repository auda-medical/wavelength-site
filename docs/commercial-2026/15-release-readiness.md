# Release readiness report (10 October 2026)

Branch `wavelength-business-20261010`, local only. Nothing is deployed or published. Production data has not been
changed. No external contact has been made. No paid service has been used.

## 1. Completed and independently verified

| Item | How it was verified |
|---|---|
| Existing logbook unaffected | `npm test`: 360 tests, 359 pass, 0 fail, 1 skipped, on Windows (now runs there) and Linux line endings. App end-to-end suite (pathways, sign-off with ratings, assessments by link, in person and dashboard, supervisor links, verification, translated screens): all functional checks pass |
| Windows test failures | Root cause: LF-only regular expressions and a line-ending-sensitive seed check. Fixed to compare content. Production (Linux) was never affected |
| Business dashboard | Browser check of 12 tabs at two widths with fictional data; per-course profit checked by hand |
| Money separation | Tested: bookings taken (cash, by payment date); recognised revenue (by course date); course costs dated with their course; actual versus estimated costs; Stripe test-mode bookings never counted. Test learner accounts excluded from logbook figures |
| Analytics coverage | Free registrations, first scans, supervisor interactions (requests, turnaround, open queue), enquiries by class and region, paid bookings, training profit (ledger lines linked to an enquiry), campaign attribution (UTM, visit to enquiry and booking) |
| Tailored training website | 22 page views, real enquiry, objection switch, no overflow or console errors |
| Credential verification and supervision authority | Tests: capacities per pathway, mentor limits, a directory match never verifies alone, identity routes, single-use confirmations, nine states, GMC workflow preserved, no endorsement wording |
| Films version 2: layout | Collision check of all ten compositions, every sixth frame (2,016 frames): no text, caption, call to action or QR code overlaps a device, browser, logo or other text |
| Films version 2: logo | Root cause found (80-unit dash on a 102.5-unit path) and fixed; matches the website mark |
| Films version 2: narration text | Every line transcribed. A dropped word, a misread phrase and a swallowed "and" were found and fixed by rewording and regenerating |
| Films version 2: technical | Loudness -15 LUFS, peaks -1.5 dBFS, no clipping (measured after encoding); 30 fps H.264; caption files generated from the same timings |
| Films version 3: layout | Collision check of all ten compositions (2,280 frames, every sixth): no overlaps; the shift line is protected like a card |
| Films version 3: logo reveal | Final frame compared with the website's own SVG markup: 0 of 36,100 pixels differ |
| Films version 3: narration text | Every line transcribed against the script; the flagship soundtrack transcribes as written (one word to check by ear, below) |
| Films version 4 (comparison stage) | Three music candidates on matched samples: -15.1 LUFS, true peak at or below -1.49 dBTP after encoding, speech 15 dB over music; no layout overlaps (2,140 frames); light logo pixel-identical to the website; versions 2 and 3 still render identically (`18-videos-v4.md`) |
| Films version 3: technical | -15.2 to -15.4 LUFS, peaks at or below -1.3 dBFS, no clipping (measured after encoding); flagship 1:50, short 0:30, advert 0:21 |

## 2. Completed but awaiting human review

| Item | What Fero needs to do |
|---|---|
| **Narration voice** | Version 3 uses the voice Fero chose (audition 4, Qwen3-TTS, synthetic). Listen for warmth and rhythm: flagship lines f04 and f12 and two short-film lines are brisker than the 140 to 155 words-a-minute aim. Check "Directly supervised scans" (transcribes as "supervise") |
| FAMUS and FUSIC pronunciation | Confirm how they should be spoken (the narration avoids them until then) |
| **Films version 4: approve the logo sound** | Music chosen (Candidate A). Listen to the nine sonar sounds and the three finalists in the film (Watch the films.cmd, then the version 4 link; `19-sonar-logo-sound.md`); then the full version 4 films are rendered |
| Films version 3 overall | Watch the sample, then each film: the rota story, the logo reveal and its sound, pacing, illustrations, claims (`16-videos-v3.md` section 7). Version 2 stays as a fallback |
| Privacy notice wording | Review the new sections before the deploy |
| Translations of new home sections | A native-speaker review before promoting a language |
| Commercial strategy, scenarios, proposals | Read `08-commercial-strategy.md`; the proposals are drafts, not sent |
| Supervisor interface checks | Two pre-existing failures in the local harness (identical on 1.0.12): re-run with `wrangler dev` before the next store build |

## 3. Blocked by external access or permissions

| Item | Blocker |
|---|---|
| Pull request, issue #2 comments | GitHub account unavailable; local record in `00-execution-record.md` |
| Automated directory checks (FAMUS, FUSIC, BSE, EACVI) | Need each body's written permission; manual checks only until then |
| GMC automated checks | Licensed Medical Register agreement and fee |
| HCPC Employer Check API | Access not granted |
| FAMUS course approval, FUSIC opportunities | SAM and ICS decisions; proposals not sent |
| Real course photography for the advert | Needs a shoot with consent; the films use illustrations meanwhile |

## 4. Requires production approval

In order (detail in `10-deployment-approval.md`):
1. Back up D1 (Time Travel point and optional export).
2. Apply migrations `0014` and `0015`.
3. Deploy the Worker and website.
4. Post-deployment checks.
5. Stripe webhook: test mode first, then live.
6. DPIA screening before the first directory check.
7. Store builds for the app changes.
8. Publishing the films.

## 5. Future commercial opportunities

From `08-commercial-strategy.md` and the opportunity register (estimates, not results):
- Tailored training for departments and international groups.
- Course date expansion once occupancy passes break-even (about seven paid places).
- Institutional dashboards for departments (a possible paid tier; the logbook, sign-off and records stay free).
- A FAMUS-approved course, subject to SAM's process.
- A real-footage version of the advert.
- OneRota service analytics (specification only; OneRota unchanged).

## File locations

| What | Where |
|---|---|
| **Version 4 comparison (current)** | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\comparison-v4\` (samples A, B, C, logo previews, soundtracks, evaluation page); evidence in `v4-qa\` |
| **Version 3 films, captions** | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final-v3\` (captions in `final-v3\captions\`; start with `wavelength-v3-sample-1080p.mp4`; the logo reveal previews are there too) |
| Version 3 quality evidence | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\v3-qa\` |
| Version 2 films, captions | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final-v2\` (captions in `final-v2\captions\`) |
| Voice auditions | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\v2-auditions\` |
| Version 1 films (archived, not approved) | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final\` |
| Preview page | Double-click `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\Watch the films.cmd` (opens http://localhost:5174; close the window to stop) |
| Quality evidence | `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\v2-qa\` (collisions, sample review, frames, audio measurements) |
| Review documents | `C:\Users\phira\Wavelength-Cloud\wavelength-business-development\docs\commercial-2026\` (this report is 15; films version 3 16, logo motion and sound 17, films version 2 14; deployment plan 10; limitations 09; test report 12; glossary 13) |
