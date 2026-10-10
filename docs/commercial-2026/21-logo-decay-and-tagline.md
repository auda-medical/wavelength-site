# Wavelength logo sound: natural decay, and the closing tagline (10 October 2026)

Fero's brief:
- The reflection treatment in the previous round sounded like a glitch; the dry sounds were clearer.
- Compare only:
  - the original two-note signature and the C1 sweep, each original plus a slightly and a moderately longer natural
    decay;
  - one intermediate sound;
  - three new deliveries of the closing tagline in voice 4.
- Candidate A, the version 4 pictures, the narration and the logo stay as approved.

Status: ready for listening; **awaiting Fero's selection**.
- The full version 4 films are not rendered.
- All earlier audio, auditions, videos and code are preserved.
- Nothing is published or deployed. No money was spent. The app and website logos stay silent.

## 1. What caused the "glitch"

Measured on the previous round's mixes:
1. **Music automation (the main cause).** The mixer lowers the music by 6 dB under the narration and starts that ramp
   0.35 s before each line. The narration began 0.4 to 0.5 s after the logo settled, so the music fell 6 dB in the
   0.2 to 0.5 s after the settle, exactly while the logo tone faded. Logo and music faded together, which sounds as if
   everything stops for a moment.
2. **The "make room" treatment** (narrow cut at the logo pitch plus 1.5 dB, crossfaded with a filtered copy) deepened
   the drop to about 8 dB. It then released about 0.8 s after the settle, so the music came back up by 2 dB. That is
   the "music stopped and came back" effect. Blending an unfiltered signal with a phase-shifted filtered copy can also
   partly cancel around the cut frequency while the crossfade is in progress.
3. **The reflection itself.** It arrived while the main tone was fading, so the sound's own level rose again 120 to
   160 ms after its peak:
   - by 2.2 dB in the refined two-note;
   - by 5.7 dB in C1;
   - by 13.2 dB in the hybrid.

   Because it is the same pitch as the tone it follows, it also interacts with it in phase. This is the "fade away and
   reappear".

Also found: C1 contains a slow 0.8 Hz beating. It is harmless in the short original, but would swell back up about
0.9 s after the hit in any longer tail.

What changed:
- **No reflection.** The longer versions are the original sound continuing to resonate.
- **The music stays steady through each logo.** Where narration follows a logo, the music reaches its under-speech
  level 0.25 s before the settle, with a slow 0.8 s ramp during the camera move, then holds steady through the logo,
  its resonance and the narration (`mix-v4.mjs --protect-logo`).
- **No "make room" treatment.**
- **More space for the narration:** it now starts 0.7 s after each logo settles (it was 0.5 s at the brand reveal and
  0.4 s at the close). The closing scene stays 7.0 s; the brand scene gains 0.2 s.

Measured with the new treatment:
- **Music automation:** the curve is flat from 0.3 s before each settle to 1.2 s after (0.0 dB change). The only
  movement is a 1 dB settle that finishes before the logo.

## 2. The seven sounds

`video/scripts/decay-v4.mjs`; files in `video/public/audio-v4/decay/`.

- **Originals (TN0 and SW0):** unchanged. SW0 is the published C1 file. TN0 is the original two-note code without the
  air movement, as in the previous standalone comparison; the film previews use the original file itself.
- **Extended versions:** each is computed by the original code, with the same pitches, timbre and attack. The original
  code stops computing a tone once it is inaudible; the extended versions compute it for longer. Then:
  - once the sound has fallen 12 dB, its rate of decay is eased (over 80 ms) to a slower rate;
  - the rate change ends where the extended sound reaches -65 dB, so the whole tail falls at one even rate and nothing
    inaudible is ever brought back up;
  - the slower rate is found by search, so that the -40 dB point moves by the target.
- **Identical starts:** the extended files are sample-identical to the original until the change begins (0.15 s after
  the settle for the two-note, 0.09 s for C1). Every file in a family starts at exactly the same level.
- **C1's beating:** faded out in the extended tails only.
- **Intermediate (MX):** one continuous tone.
  - It starts softly on D5 at the moment the two-note's first note would sound, holds for 70 ms, then glides (eased)
    up to A5, arriving on the settle with a gentle swell.
  - It decays with the two-note's timbre and room.
  - No second attack, no third note.

Each figure in the table is how long, after its peak, the sound takes to fall by that many dB:

| | Sound | -20 / -30 / -40 / -50 dB (s) | Rise after fading | Loudness (max momentary) | True peak | Tail colour (centroid) | Clipped |
|---|---|---|---|---|---|---|---|
| TN0 | Two-note, original | 0.26 / 0.38 / 0.51 / 0.63 | 0 dB | -16.0 LUFS | -7.1 dBTP | 882 Hz | 0 |
| TN1 | Two-note, slightly longer | 0.28 / 0.45 / 0.62 / 0.80 | 0 | -16.0 | -7.1 | 883 | 0 |
| TN2 | Two-note, moderately longer | 0.30 / 0.53 / 0.75 / 0.98 | 0 | -16.0 | -7.1 | 881 | 0 |
| SW0 | C1, original | 0.15 / 0.23 / 0.31 / 0.40 | 0 | -16.0 | -7.5 | 891 | 0 |
| SW1 | C1, slightly longer | 0.17 / 0.31 / 0.45 / 0.58 | 0 | -16.0 | -7.5 | 884 | 0 |
| SW2 | C1, moderately longer | 0.19 / 0.39 / 0.59 / 0.77 | 0 | -16.0 | -7.5 | 880 | 0 |
| MX | Intermediate | 0.28 / 0.41 / 0.55 / 0.69 | 0 | -16.0 | -10.5 | 880 | 0 |

How to read it:
- **Genuinely longer:** the extensions move the -40 dB point by:
  - two-note: +0.11 and +0.24 s;
  - C1: +0.14 and +0.28 s.

  The steps between -20, -30, -40 and -50 dB are even (for example 0.17 / 0.17 / 0.18 s for TN1): a natural
  exponential fade.
- **No change of colour:** the tail's spectral centroid stays at 880 to 890 Hz (the A5 fundamental). The longer tails
  expose no new frequencies, so the tail needed no further refinement.
- **No return:** no rise in level after fading in any of the seven.
- **Spectrograms:** `wavelength-video-output\v4-qa\decay\spectrum-*.png`. TN2 is the arrival note ringing longer; MX is
  one tone gliding from D5 to A5 and ringing.

**In context with Candidate A.** These are the logo previews, measured with `decay-measure.mjs`:
- **Above the music:** how long the logo stays above the music within its own pitch band after the settle.
- **Narration over the logo tail:** how far the voice stands above the logo during the first 0.3 s of speech.

| | Above the music, brand / closing | Narration over the logo tail | Rise after fading |
|---|---|---|---|
| Two-note original | 0.40 / 0.36 s | 60.7 / 59.8 dB | 0 |
| Two-note slightly longer | 0.66 / 0.54 s | 48.6 / 47.7 dB | 0 |
| Two-note moderately longer | 0.76 / 0.66 s | 40.8 / 39.9 dB | 0 |
| C1 original | 0.30 / 0.24 s | (finished) | 0 |
| C1 slightly longer | 0.40 / 0.24 s | 64.0 / 63.5 dB | 0 |
| C1 moderately longer | 0.66 / 0.36 s | 48.8 / 48.2 dB | 0 |
| Intermediate | 0.40 / 0.32 s | 59.1 / 58.6 dB | 0 |

- **Audible, not just present:** the longer versions are genuinely longer inside the mix, with one exception. The
  slightly longer C1 is no longer than the original at the closing logo, where the final chord masks its extra tail.
- **Narration:** no tonal tail competes with a word. The moderately longer two-note still sits about 40 dB under the
  voice when the narration begins.

## 3. The closing tagline

**Aim** (Fero's brief): calmer, slightly deeper, more intimate and reassuring. Focus ("Tune in"), then understanding and
reassurance ("Gain clarity"), with a settling rather than rising inflection and a short pause between. Not
louder, theatrical, whispered, breathy, ominous or solemn.

**How the takes were made.** Voice 4 was generated naturally with `video/tts/tagline_v4.py`:
- 44 takes: three voice references taken from audition 4 itself (the whole audition, its calm ending, and its own
  tagline), different seeds and temperatures, and the phrases alone or as one line.
- **No pitch shifting or time-stretching.**
- **Measured:** `tagline_analyse.py` (pYIN pitch: register, the pitch movement across each phrase, final-vowel length,
  level, warmth).
- **Transcribed:** whisper.

Three findings shaped the choice:
- **Whole line wins:** generating "Tune in. Gain clarity." as one line gave the most natural relationship between the
  two phrases.
- **Calm reference made it flat:** the calm-ending reference tended to make "Gain clarity" level rather than resolved.
- **"Gain" vs "Game":** several otherwise good takes were heard by the transcriber as "Game clarity" (the "n" of "gain"
  merging into the "k"). The approved line transcribes correctly, so only takes heard as "Gain clarity" were used.

**Assembly** (`video/scripts/tagline-v4.mjs`):
- Each take keeps the approved "Wavelength." and its pause from the current line, then the new "Tune in. Gain
  clarity.".
- The only edit is the length of the silent pause after "Tune in." (cut or extended inside the existing silence).
- Processing is the same as every narration line (trim, gentle compression, level).
- In the mix, the tagline sits 1 dB under the other narration for a more personal close.

| | Source take | "Tune in" | "Gain clarity" | Pause after "Tune in" | Transcribed |
|---|---|---|---|---|---|
| Current (reference) | approved f13 | 113 Hz, falls | 105 Hz, settles 2.1 semitones | 0.58 s | Wavelength. Tune in. Gain clarity. |
| Take 1: Quiet confidence | full reference, line, seed 843 | 93 Hz, falls | 83 Hz, settles 5.1 semitones, 1.05 s, unhurried | 0.61 s | correct |
| Take 2: Focus and reassurance | full reference, line, seed 804 | 106 Hz, gentle fall | 96 Hz, settles 3.4 semitones, longest final vowel (0.32 s) | 0.65 s | correct |
| Take 3: Premium intimate | tagline reference, line, seed 739 | 128 Hz, more expressive | 92 Hz, settles 4.0 semitones, quieter | 0.54 s | correct |

In all three, "Gain clarity" is lower than now (83 to 96 Hz against 105 Hz) and settles more (3.4 to 5.1 semitones
against 2.1). That is the "reached understanding" ending the brief asks for.

Only listening can judge the rest: whether a take sounds natural or performed, the warmth, and whether Take 1 is deep
enough to feel calm without becoming solemn.

**Timing in the closing scene:**

| Moment | Time after the closing logo settles |
|---|---|
| Final chord arrives | 0.12 s |
| Tagline starts | 0.7 s |
| Tagline ends | about 3.9 to 4.1 s |

- **Music:** steady from 0.3 s before the settle (automation curve flat).
- **Logo tail:** about 60 dB under the voice when the tagline begins.
- **Ending:** 1.8 to 2.2 s of music after the last word, fading with the picture. The scene stays 7.0 s, so the ending
  is not longer than before.

**Previews:**
- **Closing scene:** the end of the education scene and the closing scene, with each take, the original two-note
  sound and Candidate A.
- **Combined:** Take 2 with the three strongest sounds on the measurements, one per family:
  - the two-note slightly longer: a noticeable but restrained extension, and the cleanest under the narration;
  - C1 moderately longer: the only C1 extension audible at both logo moments;
  - the intermediate.

## 4. Files

| What | Where |
|---|---|
| Comparison page | `wavelength-video-output\comparison-v4\decay\index.html` (Watch the films.cmd, then "Final logo sound and tagline") |
| Seven sounds (WAV) | `wavelength-video-output\comparison-v4\decay\audio\` (sources `video/public/audio-v4/decay/`) |
| Logo previews | `wavelength-video-output\comparison-v4\decay\wavelength-v4-logo-d-*.mp4` |
| Measurements | `video/public/audio-v4/decay/decay.json`, `integration-d.json` |
| Code | `video/scripts/decay-v4.mjs`, `decay-measure.mjs`, `decay-page-v4.mjs`; `mix-v4.mjs` (`--level=head --protect-logo --tagline=`) |
