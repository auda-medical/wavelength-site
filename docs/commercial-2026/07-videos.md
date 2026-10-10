# Promotional films: scripts, storyboards, production and quality assessment

Source: `video/` (Remotion 4.0.534 compositions, Playwright captures of the real app, local narration and original
music). Rendered files are never committed. They go to
`C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final\`, with a `render-report.json` beside them. The
render report and the final MP4 list are the record of what exists; this document describes how the films were made.

## 1. What the films show

Every phone and browser screen is a screenshot of the working app and website in this branch. They were captured in
Chrome against a local Worker filled with fictional data (`video/scripts/world.mjs`):

- trainee "Dr Maya Okafor", with 14 scans, 9 of them signed off;
- supervisor "Dr James Whitfield", with directory-verified FAMUS supervisor status and approvals for FAMUS thoracic
  and three RCEM modules;
- only `example.org` addresses and a GMC-style number that cannot belong to a real doctor (`0000017`).

No real learner, patient or clinician appears. The ultrasound picture in the image editor is a drawn illustration,
not a patient scan.

Long screens are captured in layers (`scrollShot` in `scripts/capture.mjs`):

- the scrolling content is one capture;
- the fixed header and tab bar, or the page around a modal sheet, are another.

The film scrolls only the content, so headers stay where they are on a real phone.

Nothing in the films claims a feature the app does not have:

- the sign-off sheet, verified badges, export with QR code and evidence verify page are all live features of this
  branch's app;
- no ratings, user numbers, endorsements or accreditation claims appear.

## 2. Scripts (as narrated)

Pronunciation re-spellings are in `src/script.json` as `say`; the on-screen text uses the normal spelling.

### Video 1: flagship film (`Flagship`, about 2 min 15 s, 16:9)

| Scene | Narration | Picture |
|---|---|---|
| Open | (music) | Wavelength mark draws, wordmark and tagline |
| Problem | On a busy shift, you scan when the patient needs it. But your supervisor is in the resuscitation room, on nights, or at another site. The review never quite happens, and the logbook falls behind. | "EMERGENCY DEPARTMENT · 03:12" with a running clock; the lines appear as kinetic type ("Your supervisor is in resus.") |
| Intro | Wavelength is an ultrasound logbook designed for real clinical practice. | "Introducing Wavelength" title; the app home screen rises in a phone |
| Pathways | Choose the pathways you're working towards, from RCEM and FAMUS to FUSIC and international frameworks. | Progress screens, RCEM then FAMUS. The footnote says that UK pathways follow each body's published requirements, international frameworks are editable trackers, and supervisors and accrediting bodies decide what they accept |
| Log | Log a scan in moments: the application, your findings, how you were supervised, and an image if you have one. It works offline, and you remove identifiers before anything is saved. | Tap "Lung and pleura"; the form scrolls to findings, supervision and images in time with the words; the image editor with the identifier confirmation; saved |
| Supervisors | Link the supervisors you work with, and see who is verified by Wavelength, and for which modules. | Supervisors screen, zoom to the "Wavelength Verified" badge and approved modules |
| Review | Send scans for review. Your supervisor opens them on their own phone when they're free, confirms or queries each one, and signs. Required bedside supervision and assessments still happen in person. | Two phones: the trainee sends the request; the supervisor's sheet scrolls through ratings, the "I reviewed the images" basis, a comment and a finger signature. On-screen note on bedside supervision |
| Progress | Every sign-off and assessment updates your progress. When you're ready, export a portfolio with a QR code that reviewers can check online. | Logbook with signed scans, progress, export screen, verified summary page |
| Free | And the best part? Your Wavelength ultrasound logbook is free to use. | "Your ultrasound logbook." then a large "Free." and "FREE TO USE · DESIGNED FOR REAL CLINICAL PRACTICE" |
| Education | Your ultrasound journey doesn't end with your logbook. Explore our hands-on courses and expert-led training, tailored to your needs, with flexible locations by arrangement. | Website in browser frames: courses page, Tailored Training page, then its UK and International section; captions HANDS-ON ULTRASOUND COURSES, EXPERT-LED TEACHING, TAILORED ULTRASOUND TRAINING, FLEXIBLE LOCATIONS BY ARRANGEMENT |
| End | Wavelength. Tune in. Gain clarity. | End frame |

### Video 2: free logbook short (`Short` 16:9 and `ShortVertical` 9:16, about 39 s)

| Scene | Narration |
|---|---|
| Hook | Scanned on a busy shift, but your supervisor is nowhere to be seen? |
| Free | Meet Wavelength: your ultrasound logbook, free to use. ("YOUR ULTRASOUND LOGBOOK. FREE.") |
| Log | Log a scan in moments. |
| Review | Send it to a verified supervisor to review when they're free. |
| Progress | Watch your progress build towards your targets. |
| Education | Hands-on courses and tailored training, too. |
| End | Start your free logbook at thewavelength.co.uk ("START YOUR FREE LOGBOOK") |

### Video 3: tailored training advert (`Ad` 16:9 and `AdVertical` 9:16, about 19 s)

| Scene | Narration |
|---|---|
| Headline | Ultrasound training tailored to your needs, with flexible locations by arrangement. |
| Offer | Hands-on courses and expert-led teaching, for individuals, groups and organisations. |
| End | Wavelength. Tune in. Gain clarity. |

### End frame (all films)

- WAVELENGTH, "Tune In · Gain Clarity" and thewavelength.co.uk.
- The CTAs "EXPLORE OUR COURSES" and "ENQUIRE ABOUT TAILORED TRAINING" ("START YOUR FREE LOGBOOK" on the short).
- LinkedIn (linkedin.com/company/the-wavelength) and Instagram (@thewavelength.co.uk): the two accounts listed in
  `data/site.json`. No Facebook icon, because there is no verified Wavelength Facebook page in the site data.
- A QR code carrying the film's campaign link (`06-campaign-links.md`).

## 3. Production

| Element | How |
|---|---|
| Screens | Playwright 1.56 in Chrome; phone at 390 × 844 CSS px, device pixel ratio 3, with safe-area insets; website at 1920 × 1080 at 2× |
| Narration | kokoro-js 1.2.1 (Apache 2.0, runs locally, free), voice `bf_emma` (British English), speed 0.87. Whole lines, compressed and limited |
| Music and effects | Original, synthesised in Node by `scripts/music.mjs` (no samples, no licensing). Ducked under speech |
| Animation | Remotion compositions in `src/`; phone frame with perspective, taps, kinetic type |
| Mastering | `scripts/render.mjs`: decode, measure integrated loudness (ITU-R BS.1770, own meter, because Remotion's ffmpeg has no `ebur128`), gain to -15 LUFS, sample-peak limiter at -1.5 dBFS (5 ms look-ahead), re-mux with the video stream copied |
| Formats | H.264 MP4, AAC 48 kHz stereo, 30 fps; 1920 × 1080 and 1080 × 1920; 3840 × 2160 for the three 16:9 films |
| Cost | £0: every tool is free and local; no paid API or subscription was used |

Licences:

- Remotion is free for individuals and companies of up to three people (Remotion licence). Auda Medical Ltd qualifies
  today; a larger team would need a company licence.
- kokoro-js and its model are Apache 2.0.
- The fonts are the site's own OFL fonts.

## 4. Rebuilding

```
cd video
npm install
node --import ../test/helpers/register.mjs scripts/capture.mjs        # screens (local world, fictional data)
node scripts/narrate.mjs && node scripts/music.mjs && node scripts/qr.mjs
node scripts/transcribe.mjs                                            # pronunciation check
node scripts/stills.mjs Flagship <outdir> log:100,vreview:150          # spot frames
node scripts/render.mjs [Flagship,Short,...] [--no4k]                  # MP4s and render-report.json
npx remotion studio src/index.jsx                                      # edit interactively
```

Generated captures (`public/captures/*.png`) and audio (`public/audio/**/*.wav`) are ignored by Git, and so are the
renders. The small JSON files they produce (`boxes.json`, `timings.json`, `transcripts.json`) are committed, so the
compositions open in Remotion Studio before the media are regenerated.

## 5. Quality assessment

### Checked objectively

| Check | Method | Result |
|---|---|---|
| Pronunciation | whisper.cpp base.en transcribes each narration line; character error rate against the script | Every line 0 to 4%. The remaining differences: "R C E M" and "FAY-mus" spelt out in the transcript, and "they are" for "they're". Earlier problems were fixed: "resus" heard as "reviews", "Gain clarity" as "game", "free to use" as "afraid to use" |
| Loudness | BS.1770 integrated loudness and sample peak of each final file (`render-report.json`) | Target -15 LUFS integrated, peaks at or below -1.5 dBFS, no clipped samples |
| Timing | Scenes are sized from the measured narration (`src/timeline.js`); voice never overlaps the next scene's line | Flagship about 134.6 s, Short about 39.3 s, Ad about 19.0 s |
| Picture | Stills at every scene change and scroll, as contact sheets (`scripts/stills.mjs`, `scripts/contact-sheet.mjs`), checked for overlap, cut-off text, legibility at phone scale, safe areas in 9:16 | Issues found and fixed: footnote over phones, camera cut-out over the app header, flattened fixed bars in scrolling screens, modal sheet showing the page behind, scroll running ahead of the words |
| Claims | Each line checked against `CLAUDE.md` compliance wording and the app's real behaviour | No accreditation, endorsement, ratings or popularity claims; "free to use" describes the logbook as it is today; the bedside-supervision caveat is spoken and shown |

### Not checked

- No person has listened to the films yet. The audio was checked by measurement and machine transcription only.
  Voice warmth, the music mix and pacing need a human judgement before publishing.
- Not viewed on a real phone, on LinkedIn or on Instagram. Platforms re-encode uploads; check one upload privately
  before posting.
- The short and the vertical advert have burnt-in subtitles for muted playback; the flagship and the 16:9 advert do
  not. No `.srt` file yet: make one from `script.json` before posting the flagship on LinkedIn or YouTube.

## 6. Delivered files and where to find them

Rendered on 10 October 2026 from commit `60fdf92`. Folder:
`C:\Users\phira\Wavelength-Cloud\wavelength-video-output\final\` (outside the repository, not committed, not
uploaded anywhere).

| File | Size | Length | Use |
|---|---|---|---|
| `wavelength-flagship-film-1080p.mp4` | 1920 × 1080 | 2:14.6 | LinkedIn, website, YouTube |
| `wavelength-flagship-film-4k.mp4` | 3840 × 2160 | 2:14.6 | YouTube, presentations, archive |
| `wavelength-free-logbook-short-1080p.mp4` | 1920 × 1080 | 0:39.3 | LinkedIn feed |
| `wavelength-free-logbook-short-4k.mp4` | 3840 × 2160 | 0:39.3 | Archive, large screens |
| `wavelength-free-logbook-short-vertical-1080x1920.mp4` | 1080 × 1920 | 0:39.3 | Instagram Reels and Stories, LinkedIn mobile |
| `wavelength-tailored-training-ad-1080p.mp4` | 1920 × 1080 | 0:19.1 | LinkedIn feed, conference screens |
| `wavelength-tailored-training-ad-4k.mp4` | 3840 × 2160 | 0:19.1 | Archive, large screens |
| `wavelength-tailored-training-ad-vertical-1080x1920.mp4` | 1080 × 1920 | 0:19.1 | Instagram Reels and Stories |
| `wavelength-sample-1080p.mp4` | 1920 × 1080 | 0:19.3 | Review sample only (two scenes); not for posting |
| `render-report.json` | | | Per-file loudness before and after mastering, peak, length, render time, bytes |

All files are H.264 video at 30 fps with AAC 48 kHz stereo audio.

Measured from the finished files (decoded again after encoding, `scripts/qa-audio.mjs`; results and loudness graphs in
`..\wavelength-video-output\qa\final-audio\`):

- -15 LUFS integrated;
- -1.5 dBFS sample peak, about -1.5 dBTP true peak;
- no clipped samples.

Frames from the 4K encode are in `..\wavelength-video-output\qa\final-frames\`. They show sharp text, no visible
banding, and layered scrolling working.

To copy them elsewhere, copy the whole `final` folder. To rebuild them from the source, see section 4. Nothing has
been posted.

## 7. Before publishing (owner's decisions)

1. Watch and listen to each film; approve or ask for changes (voice, music level, pacing, any line).
2. Confirm the fictional names and the drawn scan image are acceptable on screen.
3. Post with the campaign links in `06-campaign-links.md`, so the Marketing tab can attribute visits.
4. Publishing is outward-facing, so nothing has been posted.
