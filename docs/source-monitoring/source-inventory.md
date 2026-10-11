# Source inventory, checked 11 October 2026

Every source in `worker/monitor/sources.json` after this release: **51 sources**.

| | Count | Meaning |
|---|---|---|
| Cited | 36 | Listed under a guide's `## Sources`. They decide that guide's "Source checked" line and its pending-review notice |
| Tracked | 12 | Monitored for the clinical reviewer but not cited. A change appears at `/admin/sources/` with the guide it may affect, never on the guide itself |
| Directories | 3 | SAM FAMUS, ICS FUSIC and BSE: `not_authorised`, never read (`permissions.md`) |

**Modes:** 46 automatic, 2 checked by hand, 3 awaiting permission. The two checked by hand are:
- the ESC/EACVI list (ESC terms forbid automated collection);
- the 5.3 MB FUSIC HD Complete Guide (too large to fingerprint within the free plan's CPU allowance; a replacement file is still detected through the FUSIC HD page).

Every automatic source answered **HTTP 200** on 11 October 2026: one request each, with an identifying user agent. The directory pages were not parsed, and the copies fetched for status were deleted at once.

## What the check found and what was done

| Finding | Source | Action |
|---|---|---|
| **Broken link** (404) | `https://rcem.ac.uk/ultrasound/`, cited by three guides | Replaced by RCEM's Ultrasound Education and Training page, `https://rcem.ac.uk/ultrasound-education-training-2021-curriculum/`. Same document: the same title, FAQ text and links to the entrustment scales. Applies to the RCEM sign-off, logbook and hub guides, and to the RCEM one-page summary (PDF regenerated) |
| Separate authoritative source | `https://rcem.ac.uk/em-curriculum/` | Added to the RCEM sign-off guide as its own source. It holds the 2021 curriculum's 2025 update (in effect from 6 August 2025), its summary of changes and transition advice, and is where RCEM says updated SLO6 practical-skills guidance will be linked. It has no ultrasound-specific text, so it does not replace the ultrasound FAQ |
| **Outdated reference** | FUSIC HD summative assessment, November 2025 (a past event; also moved permanently, 301) | Replaced by the November 2026 assessment page. Its prerequisites, logbook rule (50 scans, 20 supervised, no more than 10 normal) and three-part assessment read word for word the same. The guide's HD text is unchanged |
| **Newer authoritative version (clinical review)** | The 2026 HD assessment page and the FUSIC HD page | A new FUSIC HD curriculum took effect on **1 February 2026**: a new reporting form, additional measurements, and new competencies in 2026 examinations. The FUSIC guide does not mention it. The HD Complete Guide, updates document and reporting form are now tracked. **Not rewritten: for clinical review** |
| Moved permanently (301) | ESC / EACVI certified professionals | Registry address updated to the new location. Still checked by hand |
| Temporary redirects (302) | Eight ICS documents (`/asset/<id>/` to a versioned file: five training packs and the three HD documents) | Kept as cited or tracked (ICS's own links). The monitor now reads the version from the file name behind the redirect (for example "V13") |
| Version check | ICS training packs (Heart v13 2025, Lung v10 2025, Abdomen v11 2025, DVT v1 2026, Vascular v1 2026) | Guide labels match the files served |
| Two copies of one document | RCEM PoCUS Appendix 3: `/2021/06/` (modified 25 May 2021) and `/2021/04/` (15 March 2021) | The guides cite the newer June copy; RCEM's own FAQ links the older one. Citation kept |
| Uncited official documents (clinical review) | FAMUS curriculum packs: DVT v1.1, abdominal/renal v1, peripheral access v1.3, LP handbook v2 and LP v1.4 | Tracked. The FAMUS guide cites only the thoracic pack. The LP page links both v2 and v1.4: the reviewer should confirm which is current |
| Uncited official documents (clinical review) | RCEM Physics, Settings, Ergonomics and Safety entrustment scale (Sept 2022); RCEM 2025 update summary of changes v1.0 | Tracked. The RCEM guide cites the SLO6 and Governance scales but not this third one, and the summary describes SLO6 assessment changes |
| Duplicates | None | No two sources serve the same content (SHA-256 of every body compared) |
| Earlier gap now closed | A page that swaps a linked document for a new version under the same link text | Page checks now compare the file names of linked documents (`Linked document:` lines, including ICS `/asset/` addresses), so a new pack version is an important change |

## Clinical review items (not changed automatically)
1. **FUSIC HD 2026 curriculum.** Read the HD updates document and decide whether the FUSIC guide, its one-page summary and the app's HD logbook fields need updating.
2. **FAMUS packs.** Decide whether to cite each module's own curriculum pack, and which LP document (v2 handbook or v1.4) is current.
3. **RCEM 2025 update.** Check the guide's SLO6 assessment statements against the summary of changes. Decide whether to cite the third entrustment scale. The 2025 news item ("changes are coming") could give way to the curriculum page now cited beside it.
4. **ACEP Ultrasound Guidelines PDF.** It carries no readable version or date, so confirm the edition at the next review.
5. After any edit, set `reviewed` only when every claim has been re-checked. Otherwise set `updated`, as was done for the citation fixes today (RCEM sign-off, logbook, hub and FUSIC guides: `updated: 2026-10-11`; review dates unchanged).

## Every source

| Body | Source | Role | Mode | 11 Oct 2026 | Size | Guides |
|---|---|---|---|---|---|---|
| ACEM | ACEM P733 Recommendations for Health Service Credentialing: EM Ultrasonography | cited | auto | 200 | 41 KB | pocus-accreditation |
| ACEP | ACEP Ultrasound Guidelines | cited | auto | 200 | 417 KB | pocus-accreditation |
| BSE | BSE accredited members | directory | not authorised | not fetched |  | - |
| CPoCUS | CPoCUS Acute Care CORE | cited | auto | 200 | 366 KB | pocus-accreditation |
| ESC | EACVI certified healthcare professionals in imaging | tracked | manual | not fetched |  | - |
| ESICM | EDEC, European Diploma in Advanced Critical Care Echocardiography | tracked | auto | 200 | 117 KB | - |
| EUSEM | EUSEM Ultrasound Section | cited | auto | 200 | 35 KB | pocus-accreditation |
| ICS | Become a FUSIC trainer or mentor | cited | auto | 200 | 42 KB | fusic-accreditation |
| ICS | FUSIC Abdomen | cited | auto | 200 | 51 KB | fusic-accreditation |
| ICS | FUSIC Abdomen: training pack (2025, v11) | cited | auto | 200 (via redirect) | 360 KB | fusic-accreditation |
| ICS | FUSIC DVT | cited | auto | 200 | 51 KB | fusic-accreditation |
| ICS | FUSIC DVT: training pack (2026, v1) | cited | auto | 200 (via redirect) | 344 KB | fusic-accreditation |
| ICS | FUSIC FAQs | cited | auto | 200 | 56 KB | ultrasound-logbook, fusic-accreditation |
| ICS | FUSIC HD Complete Guide (curriculum from 1 February 2026) | tracked | manual | 200 (via redirect) | 5269 KB | fusic-accreditation |
| ICS | FUSIC HD reporting form (2026 curriculum) | tracked | auto | 200 (via redirect) | 1066 KB | fusic-accreditation |
| ICS | FUSIC HD updates document (2026 curriculum) | tracked | auto | 200 (via redirect) | 2421 KB | fusic-accreditation |
| ICS | FUSIC HD | cited | auto | 200 | 53 KB | fusic-accreditation |
| ICS | FUSIC HD: HD summative assessment, November 2026 | cited | auto | 200 | 47 KB | fusic-accreditation |
| ICS | FUSIC Heart training pack (Intensive Care Society) | cited | auto | 200 (via redirect) | 294 KB | ultrasound-logbook, fusic-accreditation |
| ICS | FUSIC Heart | cited | auto | 200 | 51 KB | fusic-accreditation |
| ICS | FUSIC Lung training pack (Intensive Care Society) | cited | auto | 200 (via redirect) | 290 KB | ultrasound-logbook, fusic-accreditation |
| ICS | FUSIC Lung | cited | auto | 200 | 51 KB | fusic-accreditation |
| ICS | FUSIC TMS directory | directory | not authorised | not fetched |  | - |
| ICS | FUSIC Vascular | cited | auto | 200 | 51 KB | fusic-accreditation |
| ICS | FUSIC Vascular: training pack (2026, v1) | cited | auto | 200 (via redirect) | 349 KB | fusic-accreditation |
| ICS | Intensive Care Society: FUSIC | cited | auto | 200 | 57 KB | pocus-accreditation, fusic-accreditation |
| RCEM | RCEM Curriculum 2021, version 1.5, updated 6 August 2025 | cited | auto | 200 | 1654 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM Curriculum 2025 update: summary of changes (v1.0) | tracked | auto | 200 | 255 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM Governance and Administration entrustment scale (September 2022) | cited | auto | 200 | 194 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM Physics, Settings, Ergonomics and Safety entrustment scale (September 2022) | tracked | auto | 200 | 177 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM Point of Care Ultrasound Curriculum 2021, Appendix 3 | cited | auto | 200 | 124 KB | pocus-accreditation, rcem-ultrasound-sign-off, ultrasound-logbook |
| RCEM | RCEM SLO6 PoCUS Competence Entrustment Scale: guidance for education and training (August 2022) | cited | auto | 200 | 916 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM: EM curriculum, including the 2025 update effective 6 August 2025 | cited | auto | 200 | 171 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM: Training curriculum changes (2025 update) | cited | auto | 200 | 156 KB | rcem-ultrasound-sign-off |
| RCEM | RCEM: Ultrasound education and training, 2021 curriculum | cited | auto | 200 | 182 KB | pocus-accreditation, rcem-ultrasound-sign-off, ultrasound-logbook |
| RCR | BMUS and RCR: Recommendations for specialists practising ultrasound independently of radiology departments (2023) | cited | auto | 200 | 330 KB | ultrasound-logbook |
| SAM | FAMUS curriculum pack: DVT module (v1.1) | tracked | auto | 200 | 331 KB | famus-accreditation |
| SAM | FAMUS curriculum pack: abdominal/renal module (v1) | tracked | auto | 200 | 335 KB | famus-accreditation |
| SAM | FAMUS curriculum pack: thoracic module (Society for Acute Medicine) | cited | auto | 200 | 333 KB | ultrasound-logbook, famus-accreditation |
| SAM | FAMUS curriculum pack: ultrasound-guided peripheral access (v1.3) | tracked | auto | 200 | 320 KB | famus-accreditation |
| SAM | FAMUS directory of supervisors | directory | not authorised | not fetched |  | - |
| SAM | FAMUS ultrasound-assisted LP document (v1.4) | tracked | auto | 200 | 326 KB | famus-accreditation |
| SAM | FAMUS ultrasound-assisted LP handbook (v2) | tracked | auto | 200 | 568 KB | famus-accreditation |
| SAM | SAM: FAMUS DVT module | cited | auto | 200 | 210 KB | famus-accreditation |
| SAM | SAM: FAMUS abdominal/renal module | cited | auto | 200 | 211 KB | famus-accreditation |
| SAM | SAM: FAMUS frequently asked questions | cited | auto | 200 | 223 KB | famus-accreditation |
| SAM | SAM: FAMUS lumbar puncture module | cited | auto | 200 | 213 KB | famus-accreditation |
| SAM | SAM: FAMUS peripheral access module | cited | auto | 200 | 214 KB | famus-accreditation |
| SAM | SAM: FAMUS theory module | cited | auto | 200 | 209 KB | famus-accreditation |
| SAM | SAM: FAMUS thoracic module | cited | auto | 200 | 210 KB | famus-accreditation |
| SAM | SAM: FAMUS, how to accredit | cited | auto | 200 | 227 KB | pocus-accreditation, ultrasound-logbook, famus-accreditation |
