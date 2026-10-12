# Pronunciation glossary for narration (version 2)

Rule: a specialist term is spoken only when its pronunciation is confirmed. Otherwise the narration uses plain words and
the acronym appears on screen only. Machine transcription can show that a word came out garbled, but it cannot show
that a pronunciation is right. Every spoken term below still needs Fero's listening check.

| Term | Meaning | Spoken form | Status | In the version 2 narration |
|---|---|---|---|---|
| RCEM | Royal College of Emergency Medicine | The letters "R, C, E, M" (ar, see, ee, em), or the full name | Letters are the standard spoken form for a college initialism | Not spoken. Narration says "emergency medicine"; RCEM is on screen |
| FAMUS | Focused Acute Medicine Ultrasound (Society for Acute Medicine) | Not confirmed. Version 1's "FAY-mus" was rejected. No authoritative spoken form was found in public sources | **Awaiting Fero's approved pronunciation** | Not spoken. Narration says "acute medicine"; FAMUS is on screen |
| FUSIC | Focused Ultrasound in Intensive Care (Intensive Care Society) | Not confirmed. No authoritative spoken form was found | **Awaiting Fero's approved pronunciation** | Not spoken. Narration says "intensive care"; FUSIC is on screen |
| GMC | General Medical Council | The letters "G, M, C" | Standard | Not spoken |
| POCUS | Point-of-care ultrasound | Commonly "POH-kus" in UK practice; not confirmed for Wavelength's own voice | Not needed | Not spoken; "ultrasound" is used |
| Wavelength | Brand name | "WAYV-length", one word, stress on the first syllable | Transcribed correctly in every audition ("wavelength") | Spoken in the brand scene and the tagline |
| Tune In · Gain Clarity | Tagline | "Tune in." (short pause) "Gain clarity." Two calm phrases, not shouted | One audition (q3) dropped "Gain clarity" entirely: that voice was rejected | Spoken at the end of the flagship and the advert |
| resus | Resuscitation room | Clinicians say "REE-sus" | The model said it in a way transcribed as "recess" and "rhesus": **not used** | "the resuscitation room" |
| eFAST, AAA, DVT, ELS | Scan names in the app | — | On screen only (they are app labels) | Not spoken |

How to change a spoken form: edit `say` for that line in `video/src/v2/script.json` (the text the voice model reads),
regenerate the line with `tts-lab/narrate_v2.py film <voice> <film> <line-id>`, run `node scripts/voice-v2.mjs`, and
listen.

If Fero confirms how FAMUS and FUSIC should be spoken, they can go into the pathways line. For example: "...in
emergency medicine, acute medicine with FAMUS, or intensive care with FUSIC...", with `say` spelling out the approved
sounds.
