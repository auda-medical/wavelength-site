# Promotional films, version 2: redesign, scripts, storyboards and quality assessment

Version 1 (`07-videos.md`) is preserved as rendered: files in `wavelength-video-output\final\`, source at Git tag
`video-v1`. Fero reviewed it and did not approve it. Version 2 is a redesign, not an edit.

Source: `video/src/v2/` (Flagship2, Short2, Ad2, kit2, art, timeline2, script.json). Output: `wavelength-video-output\final-v2\`.
Nothing is published.

## 1. What changed, and why

| Fero's finding (version 1) | Version 2 |
|---|---|
| Animated presentation, text-heavy, slow word-by-word reveals | Whole lines arrive in about 12 frames (masked slide); one short idea on screen per scene; camera moves into the app |
| Narration duplicated on screen; subtitle bars on the main film | Narration and screen copy are written separately (`script.json`: `text` vs `screen`); clean films have no subtitles; captioned versions and SRT/WebVTT files are separate |
| Overlapping headings and website text (short, about 27 s) | The website screenshots are gone from the short and the advert. Every element declares its role, and an automated check measures real rendered bounds at many frames (`scripts/collisions.mjs`) |
| Rejected female narrator (sharp, monotonous) | New synthetic British male voices designed from a written description and auditioned; provisional choice pending Fero's listening (section 4) |
| FAMUS and RCEM mispronounced | Glossary (`13-pronunciation-glossary.md`); acronyms on screen only, specialties named in words; "resus" replaced |
| Logo incomplete (last upstroke missing) | Root cause: a fixed 80-unit dash on a 102.5-unit path. Fixed with normalised path length; identical to the site's mark |
| Slow opening, empty space | Opens on an ultrasound screen at 03:12; within 3 s the "Awaiting sign-off" queue starts filling |
| App too small | Camera close-ups (1.3 to 1.75 times) on the step being described |
| Advert looked like a website | Original line-art illustration of hands-on teaching (machine, volunteer model, faculty guiding, small group); no screenshots |

## 2. Narration and screen copy

Full text in `video/src/v2/script.json`. Narration tells the story; the screen carries one memorable point.

### Flagship (about 1 min 50 s)

| Scene | Narration | On screen |
|---|---|---|
| Problem | Three in the morning. You've scanned a patient, and the finding matters. But your supervisor is in the resuscitation room, and the chance to review it slips away. | EMERGENCY DEPARTMENT · 03:12; the "Awaiting sign-off" queue fills; "Scanned. Still unsigned." |
| Brand | Wavelength is an ultrasound logbook that fits around your shifts. | Logo, WAVELENGTH, "Designed for real clinical practice"; home screen rises |
| Log | Choose the application, record your findings and how you were supervised, and add an image once you've removed any identifiers. It even works offline. | "Log it in moments."; steps Application, Findings, Supervision, Image light up as the camera moves to each |
| Pathways | Select the pathways you're working towards, in emergency medicine, acute medicine or intensive care, and every target is tracked for you. | RCEM · FAMUS · FUSIC, "+ international frameworks", acceptance note |
| Supervisors | When you need a sign-off, you can see which supervisors Wavelength has verified, and for which modules. | "Verified for named modules."; close-up of the real card, including its "not an endorsement" line |
| Review | Send the request in seconds. Your supervisor reviews it on their own phone, between cases or after the shift, and confirms each scan or asks a question. Bedside supervision and observed assessments still happen in person, where your pathway requires them. | "Reviewed when they're free."; trainee sends; camera pushes into the supervisor's sheet (ratings, basis, comment, signature); bedside note |
| Progress | Each sign-off moves your progress forward. And when it's time, you can export a portfolio that reviewers can check online, in seconds. | "Every sign-off counts."; export and verified summary |
| Free | Logging, sign-off and progress tracking are all included, at no cost to you. | YOUR ULTRASOUND LOGBOOK. FREE. |
| Education | And when you're ready to go further, our hands-on courses and tailored training bring expert teaching to individuals, groups and departments, with flexible locations by arrangement. | Teaching illustration; "Training built around you."; HANDS-ON COURSES, TAILORED TRAINING; "One instructor to every four or five delegates." |
| End | Wavelength. Tune in. Gain clarity. | Logo, wordmark, tagline, thewavelength.co.uk, START YOUR FREE LOGBOOK, EXPLORE OUR COURSES, LinkedIn and Instagram, QR |

### Free-logbook short (about 33 s, landscape and portrait)

Hook ("Scanned on shift, but no one free to sign it off?" over the scan and the queue); free (YOUR ULTRASOUND LOGBOOK.
FREE., narration on the value); log, review and progress close-ups; courses and training; end frame with START YOUR
FREE LOGBOOK only.

### Tailored training advert (about 20 s, landscape and portrait)

The teaching illustration with "Training built around you." while the narration states the position (tailored, flexible
locations by arrangement); then HANDS-ON COURSES, TAILORED TRAINING, UK & INTERNATIONAL and the approved group-size
line; end frame with EXPLORE OUR COURSES and ENQUIRE ABOUT TAILORED TRAINING.

## 3. Accuracy checks on the claims

- No accreditation, endorsement, ratings or popularity claims.
- "Free" describes the logbook's logging, sign-off and progress tracking today. Courses and training are presented as
  what Wavelength offers, without saying they are free.
- Verification is "by Wavelength, for named modules"; the app's own disclaimer is visible in the close-up.
- Remote review is limited to what the pathway permits: the bedside and observed-assessment caveat is spoken and shown.
- Group size uses the approved wording. Locations are "by arrangement"; international is "enquiries welcome", with no
  promise of travel.
- Illustrations are plainly illustrations, never presented as photographs of a Wavelength course. The scan image is
  synthetic.

## 4. Narration voice (needs Fero's listening)

The previous narrator is not reused. Candidates, all synthetic voices designed from a written description (no real
person's voice copied), auditioned with real script lines (`wavelength-video-output\v2-auditions\`, notes beside each):

| Candidate | Engine | Measured (supporting evidence only) |
|---|---|---|
| Chatterbox speaking the designed q2 voice (**provisional, used for the renders**) | Chatterbox (MIT), CPU | 100 Hz median pitch, 7.4 semitones range, 145 wpm, transcript fully correct |
| Qwen pipeline, q1 voice | Qwen3-TTS (Apache-2.0): VoiceDesign, then Base clone of that synthetic voice | 89 Hz, 6.6 semitones, 139 wpm |
| Qwen pipeline, q2 voice | Same | 98 Hz, 6.8 semitones, 139 wpm, some long pauses |
| Qwen raw designs q1, q2 | VoiceDesign (single takes, not consistent across lines) | Most expressive (9.1 and 9.5 semitones) |
| q3 | Rejected | Narrow range (4.7), and the tagline was cut off |

For comparison, the rejected version 1 voice measured 180 Hz with a 5.5-semitone range and four times as much energy
above 3 kHz (brighter, sharper).

**Limitation, stated plainly:** I cannot listen. Measurements (pitch, range, brightness, pace, pauses) and machine
transcription show register, variety, pace and garbled words. They cannot judge warmth, naturalness or rhythm. The
voice is not approved until Fero has listened. Switching the voice means regenerating the narration (`tts-lab`) and
re-rendering (about an hour on this computer).

If no candidate is acceptable to Fero, the honest route is a human voice-over recorded to the script in `script.json`.
The films are timed from the narration files, so a recording can replace them directly.

## 5. Quality control method

1. Logo, voice, glossary, overlapping text, opening, text timing, subtitles and app framing were corrected before any
   full render.
2. Layout collision check (`node scripts/collisions.mjs <out>`): every sixth frame of every composition, in landscape
   and portrait, clean and captioned, measuring the rendered bounds of copy, devices, captions, logos, calls to action
   and QR codes.
3. Stills at each scene (`scripts/stills.mjs`) reviewed by eye for composition, legibility and authenticity.
4. A 20 to 30 s sample rendered and reviewed (frames and audio measurements) before the full productions.
5. Final files measured after encoding (loudness, peaks, clipping), frames extracted from the finished MP4s, captions
   generated from the same timings (`scripts/captions-v2.mjs`).

Results: see section 6 (filled in after rendering).

## 6. Results (10 October 2026)

Files in  (captions in ):

| File | Length | Format |
|---|---|---|
| wavelength-flagship-film-v2-1080p / -4k | 1:33 | 1920 x 1080 and 3840 x 2160, clean |
| wavelength-flagship-film-v2-captioned-1080p | 1:33 | captioned |
| wavelength-free-logbook-short-v2-1080p, -vertical-1080x1920 | 0:32 | clean, landscape and portrait |
| wavelength-free-logbook-short-v2-captioned-1080p, -vertical-captioned-1080x1920 | 0:32 | captioned |
| wavelength-tailored-training-ad-v2-1080p, -vertical-1080x1920 | 0:22 | clean |
| wavelength-tailored-training-ad-v2-captioned-1080p, -vertical-captioned-1080x1920 | 0:22 | captioned |
| wavelength-v2-sample-1080p | 0:23 | review sample (brand, logging, supervisors) |
| captions/*.en.srt, *.en.vtt | | flagship 28 cues, short 9, advert 6 |

Checks on the finished files:
- Layout: zero overlaps in all ten compositions (2,016 frames checked).
- Audio: -15.1 LUFS integrated, peaks at or below -1.4 dBFS, no clipped samples (decoded after encoding).
- Narration: every line transcribed against the script.
- Frames reviewed at every fix point.

Defects found during production and fixed:
- cards over the monitor in the opening;
- the review headline under the zoomed phone;
- the bedside note during the zoom;
- text stacking during cross-dissolves;
- a static hold in the log scene;
- a ghosted double phone between scenes;
- layout jumps when text mounted (FREE. jumping);
- captions split mid-sentence;
- a truncated or misread narration line, and a swallowed and.

Not yet done (needs Fero):
- listening approval of the voice and the music balance;
- confirmed FAMUS and FUSIC pronunciation;
- a viewing on a phone and on the target platforms.

The flagship is 1:33: shorter than version 1's 2:15, inside the 90 to 120 second range asked for.
