# Promotional films, version 3: the rota problem

Versions 1 and 2 are preserved:
- version 1: renders in `final\`, source at Git tag `video-v1`;
- version 2: renders in `final-v2\`, source in `video/src/v2/`.

Version 3 lives in `video/src/v3/` and renders to `wavelength-video-output\final-v3\`. Nothing is published.

## 1. The message

> The scan is done. Your supervisor isn't on your shift. Your logbook shouldn't have to wait.

- **Problem:** a suitably qualified supervisor is often not on the trainee's shift (nights against days, different
  days, another site). Documentation, feedback and eligible review slip, details are forgotten and portfolios fall
  behind. It is not that the supervisor is busy in the resuscitation room.
- **Solution, as built:** the trainee logs the scan while it is fresh and sends a review request to a supervisor
  Wavelength has verified. The supervisor reviews it on their own later shift or at another site, rates, comments and
  signs. The trainee sees the outcome and their progress.
- **Limit:** direct supervision, bedside teaching and formal assessments still follow the pathway's rules. A
  retrospective review is never presented as the same as direct supervision.

## 2. Feature inventory (what the films may show)

Checked against the app in this branch (`src/app/app.js`, the Worker and the live switches in `wrangler.jsonc`).

| Area | Status | In the films |
|---|---|---|
| Accounts, email verification, one login for Academy and logbook | Live | — |
| Pathways: RCEM, FAMUS, FUSIC, EUSEM (basic and advanced), ACEM, CPoCUS, ACEP, general; editable targets | Live | Pathway chips; "counts towards" on the scan form; progress |
| Scan form: application, details, findings, interpretation, confirmation, supervision, images and clips, reflection, pathways | Live | Yes (close-ups) |
| Images and clips: kept on the phone; crop, redact, annotate; identifier confirmation; EXIF removed | Live | Image editor shown |
| Offline logging and sync | Live | Mentioned in version 2; not needed for the version 3 message |
| Supervisor links by invitation; "Wavelength Verified" status; approved areas; "What does Wavelength Verified mean?" | Live | Yes: the card, then the app's own explanation |
| Supervisor application and Wavelength approval per area (registration where it applies, credentials or evidence) | Live (`SUPERVISOR_APPLY` on) | Described by the app's explanation |
| Capacities (mentor, trainer, supervisor, local supervisor) per pathway | Built; enforcement off (`SUPERVISOR_APPROVAL_REQUIRED` false); not shown on the trainee's screens | **Not shown** (the trainee's screen lists "Approved to supervise" areas only) |
| Sign-off in person, by link (14 days, encrypted images in the link) or on the supervisor's dashboard | Live | Dashboard request and link screen ("Request ready ... waiting in your supervisor's dashboard too") |
| Supervisor review: confirm or query each scan, image quality and diagnostic accuracy ratings, basis, comment, finger signature | Live | Yes |
| Accept or decline a request with a reason | Built (needs migration 0015) | **Not shown** |
| Outcome on the trainee's record with code SO-..., verifiable at /verify | Live | Yes |
| Structured assessments (formative, summative, DOPS, final) | Live | Not shown (the "Record an assessment" button is visible on the supervisor's screen) |
| Progress per pathway, "Still to do" | Live | Yes |
| Exports (PDF, Excel, CSV), verified evidence summary EV-... with QR code | Live | Yes |
| Encrypted backups, nine languages, app lock, dark mode, guides offline | Live | Not needed for the message |
| Supervisor search, public directory, professional verification badges in public | Built, **switched off** | **Not shown** |
| Automated FAMUS, FUSIC, EDEC, BSE, EACVI or GMC checks | **Not built** (manual only; permission needed) | **Not shown or claimed** |
| Phone push notifications | Not built | Not claimed |

The only change to a real screen: the "Request ready" link showed this computer's local test address; the capture
shows the live site's address (`https://thewavelength.co.uk/app/sign/#...`), as the live app does.

## 3. Storyboard: flagship (about 2 minutes)

| Scene | Narration (voice) | On screen | Picture |
|---|---|---|---|
| 1. Scan | You've completed an ultrasound scan, during a busy night shift. | NIGHT SHIFT · 03:12; "The scan is done." | Close on the ultrasound screen; pull back to the clinician scanning at the bedside (illustration) |
| 2. Rota | But the right supervisor isn't always there. They might be working different days, different shifts, or at another hospital. | DIFFERENT SHIFTS; "Your supervisor isn't on your shift." | A week's rota: you on nights; your supervisor on days or at another site; no shift in common |
| 3. Wait | And before you know it, another week has passed. Your scans shouldn't be forgotten, simply because your rotas don't match. | + 7 DAYS; "Your logbook shouldn't have to wait." | The unlogged scan's details fade as the days count up |
| 4. Brand | Wavelength helps you record each scan while it's fresh, and arrange the right review, without you both needing to be there at the same time. | Logo, WAVELENGTH, "Designed for real clinical practice" | The real home screen rises |
| 5. Log | Open your logbook and choose the scan. Record your findings and how you were supervised, add an image once identifiers are removed, and it can count towards your chosen pathway. | "Log your scan."; steps Application, Findings, Supervision, Image, Pathway | Real app: Log a scan, Lung and pleura, findings, supervision, image editor, "Counts towards", saved |
| 6. Verified | Then choose a supervisor Wavelength has verified. We check their registration where it applies, review their ultrasound credentials, and approve them only for specific areas. | "Verified for specific areas." | Real supervisor card (approved areas, "not accreditation or endorsement"), then the app's explanation |
| 7. Request | Send your review request in a few taps. It waits on your supervisor's dashboard. | REQUEST REVIEW; "On your shift."; shift line YOUR SHIFT · Tuesday 03:40 | Real request: choose scans, send to Dr Whitfield's dashboard, "Request ready ... waiting in your supervisor's dashboard too" |
| 8. Review | When they're next available, on another shift or at another site, they review each scan, rate the images, add feedback, and sign. | REVIEW WHEN AVAILABLE; "On their shift."; the request travels to THEIR SHIFT · Thursday 14:20 | Real supervisor dashboard: "1 request waiting", Review and sign, ratings, basis, comment, signature, signed |
| 9. Outcome | You see the outcome in your logbook, with a code anyone can verify. Directly supervised scans and formal assessments still follow your pathway's rules. | "Signed off."; the rule in small type | Real record: "Signed off · Dr James Whitfield · from their dashboard (reviewed the images) · Code SO-... · Wavelength Verified Supervisor · ratings" |
| 10. Progress | Every review moves your training forward, and your evidence stays organised, ready to export for your portfolio. | "Track your progress." | Real progress, export, verified summary |
| 11. Free | Recording scans, requesting reviews and tracking your progress are all part of the free logbook. | YOUR ULTRASOUND LOGBOOK. FREE. | Typographic |
| 12. Education | And when you're ready to build your skills, our hands-on courses and tailored training are here to help. | "Training built around you."; HANDS-ON COURSES; TAILORED TRAINING | Teaching illustration |
| 13. End | Wavelength. Tune in. Gain clarity. | Logo, tagline, thewavelength.co.uk, START YOUR FREE LOGBOOK, EXPLORE OUR COURSES, LinkedIn, Instagram, QR | End frame |

Exact timings come from the narration (`public/audio-v3/timings.json`), see section 6.

## 4. Short (about 32 s) and advert (about 22 s)

- **Short:**
  1. DIFFERENT SHIFTS rota ("Scanned on a night shift, but your supervisor works days?").
  2. LOG YOUR SCAN.
  3. REQUEST REVIEW on your shift.
  4. REVIEW WHEN AVAILABLE on their shift.
  5. FREE.
  6. START YOUR FREE LOGBOOK.
- **Advert:**
  1. Opens close on faculty guiding at the scan screen and pulls back to the small group, with "Training built around
     you." and the agreed sentence spoken.
  2. HANDS-ON COURSES, EXPERT-LED TEACHING, TAILORED TRAINING, and "One instructor to every four or five delegates".
     UK and international enquiries are welcomed in the narration, with no promise of travel.
  3. EXPLORE OUR COURSES and ENQUIRE ABOUT TAILORED TRAINING.

## 5. Narrator

- **Voice:** Fero chose audition 4 (Qwen3-TTS VoiceDesign, description q1; a synthetic voice designed from words,
  copying no real person).
- **Consistency:** every line is spoken by the Qwen3-TTS Base model in the voice of a reference cut from audition 4
  itself: three clean sentences with their exact text (`tts-lab/auditions/ref-audition4.wav`). Pitch and range of the
  generated lines match the audition (about 100 to 116 Hz against 105 Hz; 9 to 11 semitones against 9.1).
- **Pacing:** lines that came out rushed are retaken (natural takes with different seeds, the best kept by measured
  pace and range). There is no time-stretching or pitch processing.
- **Backup:** voice 3 (`3-qwen-pipeline-q2-voice.wav`) if needed. The Chatterbox voice is not used.

## 6. Results (10 October 2026)

Files: `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final-v3\`. Captions are in `final-v3\captions\`
(flagship 30 cues, short 7, advert 6).

| File | Length | Notes |
|---|---|---|
| wavelength-flagship-film-v3-1080p, -4k, -captioned-1080p | 1:50 | Target 105 to 125 s |
| wavelength-free-logbook-short-v3-1080p, -vertical-1080x1920, -captioned-1080p, -vertical-captioned-1080x1920 | 0:30 | Target 30 to 40 s |
| wavelength-tailored-training-ad-v3-1080p, -vertical-1080x1920, -captioned-1080p, -vertical-captioned-1080x1920 | 0:21 | Target 20 to 25 s |
| wavelength-v3-sample-1080p | 0:31 | Review sample: scan, rota, logo reveal, request |
| wavelength-v3-logo-reveal-preview-1080p, -short-preview-1080p | 0:04, 0:03 | Standalone logo reveals with their sound |

Checks on the finished files:

- **Layout:** no copy, caption, call to action, QR code or the shift line overlaps a phone or other copy in any of the
  ten compositions (2,280 frames checked, every sixth frame).
- **Logo:** the reveal's final frame is pixel-identical to the website's own SVG (0 of 36,100 pixels differ).
- **Audio:** -15.2 to -15.4 LUFS integrated, peaks at or below -1.3 dBFS, no clipping (measured after encoding).
- **Narration:** every line transcribed against the script; the full flagship soundtrack transcribes as written. To
  check by ear: "Directly supervised scans" transcribes as "supervise"; a dropped final "d" cannot be ruled out.
- **Pace** (words a minute, natural takes, no processing):
  - flagship mostly 142 to 166;
  - f04 180 and f12 167 (brisker than the 140 to 155 aim even after retakes and rephrasing);
  - short lines 144 to 207 (short punchy phrases);
  - advert 128 to 133.
- **Voice consistency:** pitch 94 to 119 Hz across lines (audition 4: 105 Hz).

## 7. Marketing assessment (honest, before human review)

No score is claimed: the 9.5 target can only be judged by people watching and listening.

| Criterion | Assessment | Depends on human review |
|---|---|---|
| Clarity of the clinical problem | The rota mismatch is explicit by 12 s (night scan, "DIFFERENT SHIFTS", your scan on Tuesday, their next shift on Thursday, the week passing) | Whether clinicians recognise themselves in it |
| Immediate engagement | Opens on the scan screen with a clock; no logo first | Whether the first 3 s hold a scrolling viewer |
| Accuracy of the solution | Only live features; real captures; the direct-supervision caveat spoken and shown | — |
| Supervision workflow demonstration | The strongest sequence: request on "Your shift · Tuesday 03:40", reviewed on "Their shift · Thursday 14:20", then the signed record with its code | Pace of the phone close-ups on a small screen |
| User understanding | One idea per scene; step labels; shift line | Comprehension by someone new to Wavelength |
| Free-logbook value | Narration says what is free (recording, requests, progress); the screen says FREE.; the call to action repeats it | — |
| Narration quality | Fero's chosen voice 4, consistent across lines; some lines brisker than ideal | **Entirely**: warmth, naturalness and rhythm need listening |
| Visual sophistication | Cinematic logo reveal, camera moves, consistent dark brand palette, no clutter | Taste; the illustration style versus real footage |
| Professional credibility | No endorsement or accreditation claims; the verification wording comes from the app | — |
| Commercial persuasion | Problem, solution, proof (the code), free, courses | Real-world response (use the campaign links) |
| Call-to-action clarity | START YOUR FREE LOGBOOK first, then EXPLORE OUR COURSES; website and QR | — |

Known weaknesses I would still improve:
1. Real course footage (with consent) for the advert and the education scene.
2. Calmer takes or a human voice-over if the brisker lines bother listeners.
3. The portrait rota is small on a phone (consider a two-day close-up instead of a full week).
4. A separate instructional walkthrough could reuse these captures (not made).
