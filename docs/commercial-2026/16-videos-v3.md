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

## 6. Timings, checks and assessment

To be completed after rendering.
