# Wavelength sonar logo sound: nine auditions and three finalists (10 October 2026)

Fero's decisions (10 October 2026):
- **Music:** Candidate A (Uplifting modern technology) is the soundtrack for all three version 4 films.
- **Logo sound:** a new sonar-inspired logo sound is to be chosen from nine original candidates.
- **Final renders:** the full version 4 batch waits for approval of the logo sound.

Nothing is published or deployed. No money was spent. The app and website are unchanged, and the app splash screens
stay silent.

## 1. Where to listen

Double-click `C:\Users\phira\Wavelength-Cloud\wavelength-video-output\Watch the films.cmd`, then follow the version 4
link, or go to http://localhost:5174/comparison-v4/sonar/. The page has:
- **Stage 1:** the nine sounds, grouped A, B and C. Each has a Play button, a "Play three times" button (to hear how it
  wears) and a description; Escape stops playback.
- **Technical comparison:** the full measurement table.
- **Stage 2:** the three finalists and the earlier two-note reference in the real logo animation.
- **Your choice:** a form that stays in the browser until downloaded as CSV. No feedback has been invented.

Files:

| What | Where |
|---|---|
| Nine sounds (WAV, 24-bit, 48 kHz) | `wavelength-video-output\comparison-v4\sonar\audio\` (source copies in `video/public/audio-v4/sonar/`) |
| Integrated previews (25.5 s each) | `wavelength-video-output\comparison-v4\sonar\wavelength-v4-logo-sound-{C3,A1,C1,signature}-1080p.mp4` |
| Spectrograms and analysis | `wavelength-video-output\v4-qa\sonar\` (`sonar-analysis.json`, `spectrum-*.png`) |
| Code | `video/scripts/sonar-v4.mjs` (synthesis), `sonar-analyse.mjs`, `sonar-page-v4.mjs` |

## 2. The nine sounds

Every rising or resolving sound lands on a note of D major, the key of Candidate A's music, and every file is normalised
to the same short-term loudness (maximum momentary loudness -16 LUFS). Each file records its "hit": the instant that
lands on the logo settling.

| Sound | Character | How it is made |
|---|---|---|
| A1 Rounded rising ping | Classic sonar | Sine ping gliding up onto A5 in 70 ms, a slow 0.9 Hz beating for the rounded "underwater" quality, one soft echo at 190 ms |
| A2 Delicate high ping | Lighter, finer | Almost pure E6, faster decay, faint echo |
| A3 Warm full ping | Depth | D5 with a soft octave below and gentle harmonics; high-passed so there is no bass rumble; short decay |
| B1 Crisp precision ping | High definition | A6 with a 12 ms frequency-modulation transient for the crisp edge; no echo; a third of a second |
| B2 Refined rising glide | Elegant | Glides up a fifth (A5 to E6) in 110 ms, soft triangle-like partials, a faint octave shimmer at the finish |
| B3 Crystalline ping | Glass-like, warm | D6 with faint inharmonic (glass) partials over a soft D5 under-layer |
| C1 Rising sweep | Progress | An octave sweep (A4 to A5) that swells into the settle, then a short ring; no echo, so it lands once |
| C2 Ping with musical resolution | Integration | A5 ping that resolves into a soft D major colour (D5 and F#5) 110 ms later |
| C3 Ping and returning echo | Wavelength signature | A short A5 ping; 170 ms later its "echo" returns higher and warmer, gliding up to lock onto D6, with a faint second return |

## 3. Technical comparison

Measured by `node scripts/sonar-analyse.mjs`:
- **All nine:** no clipped samples, nothing meaningful above 16 kHz (at least 43 dB down), mono within 0.02 dB of
  stereo (correlation 0.996 to 1.0), and true peak -3.8 to -7.5 dBTP at -16 LUFS momentary.
- **Last column:** what is left in the speech band (300 Hz to 3.4 kHz) when the narration starts, 0.5 s after the
  settle, in dB below the sound's peak. "Ended" means the sound has already finished.

| Sound | Pitch | Centroid (Hz) | Attack (ms) | Decay to -20 / -40 dB (s) | Length after hit (ms) | 2.5 to 6 kHz (%) | True peak (dBTP) | Mono − stereo (dB) | Left at narration (dB) |
|---|---|---|---|---|---|---|---|---|---|
| A1 | A5 | 876 | 4 | 0.24 / 0.47 | 771 | 1.4 | -7.1 | -0.01 | -42.9 |
| A2 | E6 | 1315 | 4 | 0.14 / 0.29 | 472 | 6.8 | -6.5 | 0 | ended |
| A3 | D5 | 586 | 6 | 0.20 / 0.38 | 670 | 0.3 | -4.8 | -0.01 | -50.0 |
| B1 | A6 | 1859 | 2 | 0.11 / 0.21 | 336 | **22.4** | -3.8 | 0 | ended |
| B2 | A5 → E6 | 1182 | 4 | 0.18 / 0.37 | 585 | 4.4 | -6.2 | 0 | -56.1 |
| B3 | D6 | 1158 | 2 | 0.19 / 0.39 | 619 | 4.6 | -5.2 | 0 | -52.0 |
| C1 | A4 → A5 (sweep) | 848 | 202 (swell) | 0.15 / 0.31 | 530 | 1.1 | -7.5 | 0 | -63.6 |
| C2 | A5 → D5 + F#5 | 839 | 4 | 0.20 / 0.38 | 678 | 1.4 | -6.2 | -0.01 | -50.0 |
| C3 | A5 → D6 | 1107 | 4 | 0.11 / 0.53 | 748 | 3.1 | -7.2 | -0.02 | -37.7 |

Reading the measurements:
- **B1 is the outlier:** 22% of its energy sits in the 2.5 to 6 kHz band, where sounds start to feel sharp or
  piercing. That is about ten times A1, C1 or C2.
- **The other eight** are soft-edged, with a 2 to 6 ms attack (no clicks).
- **The higher sounds** (A2, B2, B3) sit in the band phones reproduce most clearly. They are also the ones most at risk
  of sounding thin.
- **A3** is the warmest. It will lose some body on a phone speaker, but nothing essential.
- **Narration masking is low for all nine.** C3 leaves the most (about 38 dB below its peak), because its echo
  returns 0.17 s after the hit.

Two corrections were made during testing:
- **A1 was out of key:** its first version rose to A#, which clashes with D major. It now rises onto A5.
- **C1 landed twice:** its echo repeated the sweep after it landed. The echo was removed.

Technically strongest:
- **Cleanest:** A1, C1, C2 and C3 have the lowest harshness, are in key and do not crowd the narration.
- **Also clean:** A3 and B3.
- **Weakest:** B1, on harshness.

Measurements do not establish appeal: this is for listening.

## 4. Stage 2: three finalists in the film

Fero gave goals rather than favourites among the nine: evoke ultrasound technology, clarity, progress and Wavelength's
identity. On those goals and the measurements:
- **C3:** identity and clarity.
- **A1:** the classic sonar.
- **C1:** progress.

**The previews.** Each is a 25.5 s excerpt of the real version 4 flagship (composition `V4LogoPreview`):
- the end of the problem scene;
- the brand reveal with its first narration line (logo settles at 10.3 s);
- the closing logo (settles at 19.6 s).

All four previews share:
- Candidate A music composed for the excerpt;
- identical pictures and narration, -15.1 LUFS, and the logo sound at the same perceived level (maximum momentary
  loudness within 0.2 dB);
- the same quiet air movement under the camera pullback.

The earlier two-note signature is the fourth, reference preview.

**Blending with the music.** The music is never ducked or silenced for the logo sound. In the first test the music's
closing chord landed on the same frame as the closing logo, leaving the sounds only 0 to 1.6 dB clear of it. Candidate
A's final chord now arrives 0.12 s after the settle, with a softer attack: the logo sound is heard first and the music
resolves beneath it. This change applies to all three films.

How far each logo sound stands above the music (first 0.5 s after the settle):

| | Brand reveal | Closing logo |
|---|---|---|
| C3 | 6.7 dB | 4.4 dB |
| A1 | 6.2 dB | 3.9 dB |
| C1 | 4.5 dB | 2.3 dB |
| Two-note reference | 4.3 dB | 2.4 dB |

Synchronisation, checked on the mixed stems:
- **A1 and C3:** the attack lands within 2 ms of both settle frames (10.30 s and 19.63 s).
- **C1:** swells into the settle by design (its peak is on the frame).

## 5. Recommendation (to be confirmed by listening)

1. **C3, ping and returning echo.**
   - **It is how ultrasound works:** a pulse goes out and an echo returns carrying information. Here the echo returns
     clearer and resolves onto D, the home note of the music: "Tune in, gain clarity". The sound tells the brand
     story.
   - **Distinctive:** a ping-and-answer gesture is ownable, which a single ping is not.
   - **Measured:**
     - in key and resolving with Candidate A;
     - low harshness (3.1%);
     - the clearest over the music at equal loudness;
     - 0.75 s long.
   - **Risk:** a two-part gesture is busier than a single ping and may wear sooner with very frequent repetition.
     Check with "Play three times". If it does wear, the echo can be made softer.
2. **A1, rounded rising ping.** The most recognisable sonar sound and the simplest. Probably the safest for repetition,
   but the least ownable: many products use a single ping.
3. **C1, rising sweep.** Mirrors the logo rising into place and leaves the narration completely clear. But it is the
   least prominent at the closing logo, and a sweep can read as an effect rather than an identity.

The previous two-note signature remains a sound, warm option. It is musical rather than sonar, so it carries less of
the ultrasound identity Fero asked for.

Not chosen for the final three:
- **A2:** pleasant, but thin.
- **A3:** warm, but the least sonar-like.
- **B1:** too sharp.
- **B2:** elegant, but closer to a notification sound.
- **B3:** refined, and a reasonable alternative if C3 proves too busy.
- **C2:** close to the two-note concept.

## 6. Rights

All nine sounds and the air movement are original procedural synthesis in this repository (`video/scripts/sonar-v4.mjs`):
- sine and frequency-modulation oscillators, envelopes, delays, filters and a Freeverb-style reverb, written from
  scratch;
- no samples, presets, sound libraries or third-party sound effects.

They are Auda Medical's own material, usable for any of the following without further licence:
- website publication;
- social media;
- paid advertising;
- international distribution;
- editing and derivatives;
- long-term use as a sonic logo.

Other notes:
- **Tools:** Node.js (MIT). The tools place no conditions on the output.
- **Trade mark:** as a sonic logo, the chosen sound could later be registered as a UK trade mark (sound marks are
  accepted when filed as an audio file). This is an option to discuss with a trade mark attorney, not something done
  here.
- **Not legal advice:** this is a summary, not legal advice.

## 7. After approval

1. Set the chosen sound in the films:
   - the mix option `--logo=<id>` for the brand reveal and the closing logo;
   - the standalone logo previews, re-rendered with it.
2. Render all final version 4 films with Candidate A to `wavelength-video-output\final-v4\`:
   - flagship 1080p, 4K and captioned;
   - short and advert, landscape and portrait, clean and captioned.
3. Deliver captions (SRT and WebVTT), audio stems and the quality report alongside the films.
4. Re-run the collision, logo and loudness checks on the finished files.
5. Recommended, outside this session: the website and app keep their logos silent (doc 17). If the sound is later used
   on the website, it should only ever play after a visitor presses play.
