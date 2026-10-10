# Wavelength logo sound: final comparison with a subtle sonar reflection (10 October 2026)

Fero's brief:
- Candidate A stays as the soundtrack, and the bright version 4 pictures and voice 4 stay approved.
- Before choosing the permanent sound signature, compare four options. Options 2 to 4 each come dry and with a subtle,
  warm, fading reflection: a wave travelling out and returning ("Tune In · Gain Clarity"), never a second ping, long
  reverberation or submarine effect.

Status: ready for listening; **awaiting Fero's final selection**.
- The full version 4 films are not rendered.
- Earlier music, logo sounds, videos and sources are preserved: the original two-note files are byte-identical,
  checked by hash.
- Nothing is published or deployed. No money was spent. The app and website logos stay silent.

## 1. Where to listen

`C:\Users\phira\Wavelength-Cloud\wavelength-video-output\Watch the films.cmd`, then "Final logo-sound comparison" (or
http://localhost:5174/comparison-v4/signature/). The page file is
`wavelength-video-output\comparison-v4\signature\index.html`. On the page:
- **Each option:** Play, Play three times and Stop.
- **Options 2 to 4:** dry and reflection side by side; "Play both in turn"; the reflection alone at its true (quiet)
  level, so the difference can be heard without anything being made louder.
- **In the film:** each option in the real logo animation (brand reveal and closing logo) with Candidate A. The
  reflection version is shown first; the dry version sits underneath.
- **Feedback:** an assessment form (warmth, professionalism, memorability, pleasantness, musical compatibility, echo
  quality, irritation risk, suitability for advertising) and the final selection. It downloads as CSV, and no answers
  have been invented.
- **Controls:** a Stop bar at the foot; Escape also stops.

Files:

| What | Where |
|---|---|
| Standalone WAVs (24-bit, 48 kHz) | `wavelength-video-output\comparison-v4\signature\audio\` (S1, S2d, S2e, S3d, S3e, S4d, S4e, and the three reflection-only layers); sources in `video/public/audio-v4/signature/` |
| Integrated previews (25.5 s) | `wavelength-video-output\comparison-v4\signature\wavelength-v4-signature-{signature,S2d,S2e,S3d,S3e,S4d,S4e}-1080p.mp4` |
| Spectrograms | `wavelength-video-output\v4-qa\signature\` |
| Measurements | `video/public/audio-v4/signature/signature.json`, `integration.json` |
| Code | `video/scripts/signature-v4.mjs`, `signature-measure.mjs`, `signature-page-v4.mjs`; mixing in `mix-v4.mjs` (`--logo=<id> --level=momentary --room`) |

## 2. The four options

1. **Original two-note signature (S1), unchanged.** D5 rising to A5 on the settle. The standalone file uses the
   original code without the air movement. The film preview uses the original file exactly.
2. **Refined two-note (S2).** The same rising D5 to A5, made:
   - warmer: the glassy 4.2x overtone is removed and the third harmonic softened;
   - cleaner: no attack tick, a 6 ms onset and half the room;
   - better handed over: the first note decays a little sooner, so it passes cleanly to the arrival note.
3. **C1 sweep (S3).** Unchanged from the sonar auditions: one rising octave onto A5.
4. **Sonar-musical hybrid (S4).** A rounded sonar ping on A5 (with the slow sonar beating), then a soft tonal
   resolution that locks onto D6, the home note of the music, on the settle.

**The reflection (options 2 to 4).** One quiet copy of the arrival tone only, never the first note and never the
sweep. It is:
- delayed 150 ms;
- low-passed (warm), with a 22 ms rounded onset so it returns as a swell rather than a second ping;
- given its own short decay (about 0.24 s).

Its loudest moment sits **18.5 to 19 dB under the main tone**. It adds no new pitch and no repeat.

## 3. Measurements

Standalone files, all at the same maximum momentary loudness (-16 LUFS):

| | Length after the settle | True peak | Reflection under the main tone | Echo version vs dry, after level matching | Left in the speech band when narration starts |
|---|---|---|---|---|---|
| S1 original | 767 ms | -7.1 dBTP | — | — | -40.8 dB |
| S2 dry / reflection | 786 / 792 ms | -8.0 / -8.2 | 18.5 dB | 0.2 dB | -40.4 / -39.4 dB |
| S3 dry / reflection | 530 / 550 ms (plus a 0.32 s rise) | -7.5 / -7.5 | 19.0 dB | 0.1 dB | -63.6 / -59.8 dB |
| S4 dry / reflection | 684 / 676 ms | -7.9 / -7.8 | 18.5 dB | 0.0 dB | -46.8 / -48.3 dB |

**Integration with Candidate A.** All seven previews share:
- identical pictures and narration;
- -15.1 LUFS overall and the logo sound at the same perceived level;
- the improved final-chord timing, with the music never dropped.

The first test showed the reflection would be masked by the music, especially at the closing logo, where the final
chord sits in the same register. The fix does not make the logo louder. Instead, for about 0.8 s around each settle,
the music makes a little room:
- a narrow -6 dB cut at the logo's arrival pitch (Q 2);
- 1.5 dB overall;
- crossfaded over 150 ms;
- applied to every option, the reference included.

| | Logo over music, brand / closing | Reflection over music within its pitch band, brand / closing | Narration over the reflection where they overlap |
|---|---|---|---|
| S1 original | 6.9 / 5.4 dB | — | — |
| S2 reflection | 7.7 / 5.9 dB | 13.8 / 8.0 dB | at least 41.6 dB |
| S3 reflection | 7.9 / 6.1 dB | 13.7 / 7.8 dB | at least 50.5 dB |
| S4 reflection | 5.9 / 4.0 dB | 18.1 / 10.3 dB | at least 43.1 dB |

Reading these:
- **Broadband:** the reflection sits 6 to 11 dB under the music.
- **Within its own pitch band** (where masking happens): it sits 8 to 18 dB above the music. So it should be
  perceptible as a subtle reflection, most clearly at the brand reveal, without being loud.
- **Narration:** it is never threatened. Narration starts 0.5 s after the brand settle and 0.4 s after the closing
  one, and it stays at least 42 dB above the reflection.

These numbers cannot say whether it is pleasant: that needs listening.

## 4. Notes before listening (not a verdict)

- **S2** keeps the melody and the sense of arrival that already worked, with a cleaner tone. Its reflection sits on the
  arrival note, so it should read as one gesture with depth, not a third note.
- **S3** is the purest "wave travels out" image. Its reflection is the quietest relative to its short ring, and it is
  the least prominent at the closing logo.
- **S4** carries the most sonar character and resolves to the home note. Its reflection is the most audible within its
  band; the risk is that ping plus resolution plus reflection becomes busy on many plays.
- **Shared risk:** with a reflection, the sound is about 0.8 s long in total. On a phone speaker the reflection will be
  felt more than heard. That is acceptable for a subtle detail, and the dry version remains a valid choice.

## 5. Rights

All the sounds are original procedural synthesis in this repository: sine oscillators, envelopes, filters, a delay and
a small reverb, written from scratch, with no samples, presets or libraries. They are Auda Medical's own material for
website, social, paid, international and long-term use, edits and derivatives included. The tools (Node.js, MIT) place
no conditions on the output. This is a summary, not legal advice.

## 6. After the selection

1. Fix the chosen sound as the permanent signature, with any small changes from the listening notes.
2. Mix all films with Candidate A using `--logo=<choice> --level=momentary --room`.
3. Re-render the standalone logo previews.
4. Render the full version 4 set to `wavelength-video-output\final-v4\`, with captions, stems and a quality report.
5. Re-run the collision, logo, loudness and synchronisation checks.
