# Films version 4: positive, uplifting and premium (10 October 2026)

Fero's brief (10 October 2026): version 3's dark navy imagery, dark scenes and sombre, organ-like bass made the films
gloomy. Version 4 keeps the story, the narration and the real app demonstration, and redesigns the music, the logo
sound and the visual atmosphere. Versions 1, 2 and 3 are preserved (renders untouched; source still renders version 3
exactly, see section 7).

Update (10 October 2026, later):
- **Music:** Fero chose Candidate A for all three films.
- **Logo sound:** a sonar-inspired logo sound is being chosen from nine auditions (`19-sonar-logo-sound.md`).
- **Candidate A's ending:** the final chord now follows the closing logo's settle by 0.12 s, so the logo sound is heard first.
- **Final renders:** they wait for approval of the logo sound.

Status at the time of writing: **comparison stage**. Three music candidates are ready on matched samples, with an evaluation page. The full
version 4 films are rendered once a direction is chosen by people listening and watching (brief, sections 17 to 19).
Nothing is published or deployed. No money was spent.

## 1. What was wrong with version 3's sound (measured, then heard by Fero)

- 79% of the version 3 music's energy sat below 120 Hz: a sustained sine bass and long low pad partials that never
  stopped. The spectrogram (`v4-qa/music/spectrum-v3-reference.png`) shows it as a continuous band at the bottom.
- The pad was additive sine partials held for whole chords, which gives the organ-like character Fero described.
- Version 4 candidates: 3 to 9% below 120 Hz, short bass notes only, pads in the middle register, reverb return
  high-passed at 220 Hz.

## 2. Music: one identity, three arrangements

All original, synthesised in code written for this project (`video/scripts/music-v4/`). No samples, loops, presets or
sample libraries.

- **Key and harmony:** D major. The problem section never reaches the home chord (Gmaj7, Asus4, Em7, Asus4: open and
  expectant, not dark). When Wavelength appears, the music lands on D, the home chord: the arrival is the relief.
- **Motif:** the "W" motif A5, D5, F#5, D5, A5, the shape of the Wavelength wave (high, low, middle, low, high). The
  problem section plays only its first three notes; the full phrase arrives after the logo; it returns at the free
  logbook and the close.
- **Logo sound:** the motif's last leap, D5 rising to A5. One identity across the films and the logo.
- **Structure follows the pictures:**

  | Section | Where | What happens |
  |---|---|---|
  | Problem | Opening scenes | Restrained, light movement |
  | Lift | Logo settle | Home chord, fuller, clearer |
  | Develop | Review workflow | Progress and reassurance |
  | Free | "Free." appears | Second lift |
  | Warm | Courses | Warm |
  | End | Closing logo settle | Resolution on D, left to ring and fade |

  Section changes land exactly on the picture cues: each section is fitted with a whole number of beats, so the
  tempo varies by under about 2%.

| Candidate | Tempo | Instruments | Character |
|---|---|---|---|
| **A** Uplifting modern technology | 112 | Synth arpeggio with ping-pong echoes, bell melody, airy pad, short bass pulses, soft kick (64 Hz, short), shaker, soft clap in the lifts | Clean, rhythmic, premium technology |
| **B** Warm acoustic-electronic (Fero's preferred starting point) | 96 | Fingerpicked plucked strings (Karplus-Strong), felt-piano melody, warm pad, plucked bass, light shaker and wooden tap, marimba touches at the lifts | Warm, approachable, refined |
| **C** Bright cinematic minimalism | 84 | Minimalist piano pattern that changes each section, vibraphone melody, soft strings, gentle swells, piano bass notes that decay, no drums | Spacious and bright |

Engine (`engine.mjs`):
- **Instruments:**
  - felt piano (inharmonic partials, two-stage decay);
  - Karplus-Strong strings with pitch-relative brightness;
  - marimba, vibraphone and bell partial models;
  - additive pads;
  - short rounded bass;
  - soft percussion.
- **Effects:** RBJ filters, a Freeverb-style reverb, a ping-pong delay.
- **Levels:** each instrument's level is set to a target while it plays, so the balance is deliberate.

Checks (`node scripts/music-v4.mjs`, report in `public/audio-v4/music/report.json`):

| | A | B | C |
|---|---|---|---|
| Energy below 120 Hz (flagship) | 8.0% | 5.4% | 3.1% |
| Energy 2.5 to 6 kHz, the harshness band (flagship) | 0.9% | 1.4% | 0.6% |
| Left-right correlation (mono safety) | 0.89 | 0.91 | 0.91 |

The first version of B measured 20% in the harshness band. The cause was the plucked-string excitation being too
bright; it was fixed in the model, not with equalisation. Spectrograms with the picture cues marked:
`wavelength-video-output\v4-qa\music\`.

## 3. Logo sound

`video/scripts/sfx-v4.mjs`. A warm, soft-edged tone that replaces the version 3 bell (about 1.6 s of sustain):
- **The tone:** fundamental plus soft second and third partials, a 4 ms attack and a faint felt tick for definition,
  with a natural decay of about 0.7 s and a short room. Nothing like a monitor beep.
- **Two notes (used):** D5, then A5 exactly on the frame the logo settles.
- **Single note (for comparison):** on the settle.
- **Air:** a quieter version of the air movement under the camera pullback.
- **Endings:** both files decay to more than 80 dB below their peak before they end, so nothing is cut off. The short
  preview's sound ends before its 2.67 s clip does.

## 4. Pictures: brighter, warmer, same brand

`video/src/v4/` (Flagship4, Short4, Ad4, End4, art4, look). The story, narration, app screens, accreditation wording,
links and QR destinations are unchanged from version 3.

| Moment | Version 4 treatment |
|---|---|
| Opening problem (scan, rota, wait) | Calm, cool early light (soft blue-grey mist), navy line art, white cards. Recognisable, not threatening |
| Wavelength introduction | The light warms from mist to daylight cream as the logo settles: the visual turn of the film |
| App demonstration and review workflow | Warm daylight cream with teal light; real app screens in a phone with a soft shadow; navy type |
| Free logbook | A teal field with white type and a slow light sweep |
| Courses and tailored training | Sunlit teaching scene (clearly an illustration, not a real course) |
| Close | Logo in the website's light-background colours, teal and outline calls to action, QR code |

- **Logo:** uses the website's own light-background colours (scrolled header: ring navy #0F1E33, wave teal #2A7F8A),
  so the artwork is not redesigned. `node scripts/logo-check.mjs --v4` compares the reveal's settled frame with the
  website's markup: **0 of 36,100 pixels differ**, at the settle frame and at the last frame.
- **Brightness:**
  - mean luminance across the flagship frames is 215 of 255 (version 3 was mostly dark navy);
  - the problem scenes sit around 208 to 222 and the daylight scenes around 216 to 237;
  - the teal moment is 128.

  Contact sheets: `v4-qa\frames\`.
- **Narration timing:** the brand narration now starts 0.5 s after the logo settles, and the closing tagline after
  the end logo settles, so the logo sound never sits on a word.

## 5. Narration

- Fero's chosen voice 4 is retained (Qwen3-TTS, a synthetic voice; no real person cloned). No pitch or speed
  processing.
- f09 was retaken (six new takes):
  - all six transcribe as "Directly supervised scans";
  - take 5 was kept: 150 words a minute, a pitch range of 12.2 semitones, and "pathway's" transcribed correctly.
- The other lines are unchanged from version 3. The brief asks for a less solemn, more encouraging delivery: that can
  only be judged by ear, and retakes are possible line by line (`video/tts/retake_v4.py`).

## 6. Mix and mastering

`video/scripts/mix-v4.mjs` mixes outside Remotion from separate stems (narration, music, logo), so the balance is
measured and the stems can be delivered:
- **Music under speech:** 15 dB below the voice while anyone speaks (inside the 12 to 18 dB range).
- **Music in pauses:** it rises by 6 dB only in pauses of a second or more, with slow cosine ramps (0.35 s down
  before speech, 0.9 s up after), so there is no pumping and no sudden silence.
- **Logo sound:** 5 LU below the voice's level.
- **Mastering:** -15 LUFS integrated, look-ahead limiter, true peak checked with 4x oversampling.

| Film (all candidates) | Loudness | True peak (after AAC) | Speech over music | Music in pauses vs speech | Mono vs stereo |
|---|---|---|---|---|---|
| Sample | -15.1 LUFS | -1.49 to -1.52 dBTP | 15 dB | -10.1 to -10.8 dB | within 0.02 LU |
| Flagship | -15.1 | -1.55 (before encoding) | 15 dB | -9.1 to -9.7 dB | within 0.01 LU |
| Short | -15.1 | -1.55 | 15 dB | -7.1 to -9.8 dB | within 0.02 LU |
| Advert | -15.1 | -1.52 to -1.53 | 15 dB | (no long pauses) | within 0.01 LU |

These are measurements, not a verdict on how the mix sounds: phone, laptop and headphone listening is still needed.

## 7. Quality checks done

- **Layout:** collision check of all ten version 4 films, every sixth frame (2,140 frames): no copy, caption, call
  to action, QR code or the shift line overlaps a phone or other copy.
- **Earlier versions unchanged:**
  - the shared components gained optional light palettes with the version 3 values as defaults;
  - 21 reference frames from versions 2 and 3 were re-rendered and compared: 19 were byte-identical at once;
  - the other two differed by a few pixels (at most 4 of 255 levels) and matched exactly when rendered again
    (rendering noise, not a change);
  - `node scripts/stills-check.mjs compare <dir>`.
- **Comparison page:** tested at 390 px and 1440 px. No console or loading errors, no horizontal overflow; save and
  CSV download work.
- **Incident:** the version 3 capture metadata (`video/public/captures/boxes.json`) had been discarded from the
  working tree by mistake. It was restored line for line from the recorded change and committed (`14cdfd8`).

## 8. Comparison and evaluation (brief, sections 17 and 18)

Open `wavelength-video-output\Watch the films.cmd`, then "Open the comparison and evaluation page"
(http://localhost:5174/comparison-v4/). It has:
- the three samples (43.7 s: problem, the logo, the app, free, the close), on the same pictures and narration at
  equal loudness;
- music-only versions;
- the full-length flagship, short and advert soundtracks for each candidate (to hear repetition over 1:51);
- the two logo sounds;
- the version 3 sample for before and after.

The form asks, per candidate:
- how professional, positive and inviting it feels;
- how well it supports the narrator;
- whether it creates interest in trying Wavelength;
- how memorable it is;
- whether it becomes repetitive or irritating, with notes.

Then a ranking, the logo preference and the listening device. The candidates appear in random order on each visit.
Answers stay in that browser until downloaded as CSV. No feedback has been invented: no one has rated these yet.

Suggested process:
1. Fero, plus three to five clinicians from the target audience (trainees and supervisors).
2. Each on their own, ideally on a phone speaker and on headphones.
3. Pool the CSVs.

## 9. Honest assessment before human review

No score is claimed. What the films should now communicate, and what still needs people:

| Aim | Where it comes from | Needs human judgement |
|---|---|---|
| Relief from administrative frustration | Cool, calm problem scenes; unresolved harmony; the home chord and warm light arrive with Wavelength | Whether the turn is felt, not just designed |
| Trust and professional credibility | Real app, verification wording from the app, the direct-supervision caveat, no endorsement claims | Whether the brighter look still reads as clinical |
| Convenience and ease of use | Shift line (Tuesday night to Thursday afternoon), clean phone close-ups | Pace of the close-ups on a phone |
| Positive progress and motivation | Lifts at the logo and at "Free", the resolution at the close | **Entirely the music choice** |
| Modern technology | Candidate A most; light, clean frames | Whether A feels premium or generic |
| Interest in courses | Sunlit teaching scene, advert's warm arrangement | Illustration versus real footage |

What could still let it down:
- **Synthesised instruments:** they are modelled, not recorded. A trained ear may hear the piano and strings as
  synthetic. If that happens, the arrangement can be kept and re-voiced by a musician, or with a library whose licence
  is checked.
- **Narration:** the voice's warmth and the brisk lines (f04, f12, s02, s04) need listening.
- **Portrait rota:** still small in the portrait short.

## 10. Music and sound rights (brief, section 14)

| Element | Source | Rights |
|---|---|---|
| Music, all three candidates | Original procedural synthesis in this repository (`video/scripts/music-v4/`), written for Auda Medical; no samples, loops, presets or sample libraries | Auda Medical's own material. The methods used (Karplus-Strong, Freeverb-style reverb, RBJ filters, BS.1770 measurement) are published techniques, implemented here from scratch |
| Logo sound and air movement | Original synthesis (`video/scripts/sfx-v4.mjs`) | As above |
| Narration | Qwen3-TTS (Apache-2.0), run locally; a designed synthetic voice, cloned only from its own audition | Apache-2.0 places no restriction on generated audio; no real person's voice is used |
| Fonts in the pictures | Cormorant Garamond, DM Sans (SIL Open Font License) | The OFL allows use in rendered video |
| App screens | Wavelength's own app, fictional data from the local test world | Auda Medical's own |
| Tools | Node.js (MIT), Remotion (free licence for companies of up to three people; Auda Medical qualifies today), ffmpeg (bundled with Remotion) | Tools only; they place no conditions on the output |

On this basis the soundtrack and films can be used for the following, with no further licence:
- website publication;
- social media;
- paid advertising;
- international distribution;
- editing and derivatives;
- long-term promotional use.

Three things to keep in mind:
1. **Remotion licence:** if the company grows beyond three people, a Remotion company licence is needed for further
   rendering. Films already rendered stay usable.
2. **Advertising platforms:** each platform's own advertising policies still apply (medical claims, for example).
3. **Legal advice:** this is a summary, not legal advice. Before a large paid international campaign, a short check
   with a solicitor on authorship of computer-generated material (UK CDPA s9(3)) would be prudent.

## 11. Commands

```
node scripts/music-v4.mjs [sample,flagship,short,ad] [A,B,C]       compose (cues from src/v4/plans.js)
node scripts/sfx-v4.mjs                                            logo sounds
node scripts/voice-v2.mjs --v4                                     narration processing (public/audio-v4)
node scripts/mix-v4.mjs [films] [A,B,C] [--logo=single]            mix, master, stems, music-only
node scripts/render-v4.mjs <Composition,...> <film> <A,B,C> [--dir=final-v4] [--name=...] [--4k]
node scripts/comparison-page-v4.mjs && node scripts/preview-page.mjs
node scripts/collisions.mjs <out> V4Flagship,...  ·  node scripts/logo-check.mjs 119 <out> --v4
node scripts/sheet-v4.mjs <out> V4Flagship,...   ·  node scripts/stills-check.mjs compare <dir>
node scripts/music-v4/spectro.mjs <in.wav> <out.png> [cue@seconds ...]
```

## 12. After the choice (brief, section 19)

1. Apply any changes from the listening notes. For example: a candidate's tempo or instrument, the logo sound, or
   narration retakes.
2. Render the finals to `wavelength-video-output\final-v4\` with the chosen candidate (X in the commands below):
   - Flagship: `node scripts/render-v4.mjs V4Flagship,V4FlagshipCaptioned flagship X --dir=final-v4 --name=wavelength-flagship-film-v4 --4k`
   - Short: `V4Short,V4ShortVertical,V4ShortCaptioned,V4ShortVerticalCaptioned`, film `short`
   - Advert: `V4Ad,V4AdVertical,V4AdCaptioned,V4AdVerticalCaptioned`, film `ad`
3. Deliver alongside the films:
   - captions: `node scripts/captions-v2.mjs` adapted for version 4 timing;
   - stems: from `public/audio-v4/mix/X/stems`;
   - a quality report.
4. Re-run the collision, logo and loudness checks on the finished files.
