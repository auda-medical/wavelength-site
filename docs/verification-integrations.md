# External registers, portfolios, privacy and store review for verification

Researched 5 October 2026.

Direct page fetches of most regulator and society sites were blocked from the build environment. Facts therefore come from the official pages as indexed by search, not from full reads. Every entry gives its source and a confidence level. **Anything marked "confirm" must be read in a browser before anyone relies on it.** Nothing was scraped and no API was called.

## 1. Integration report

| Organisation | Profession / pathway | Authoritative source | URL | Public register | Official API | Feed / download | Fields available | Access requirements | Automated checking permitted? | Recommended integration | Action for Wavelength | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GMC | Doctors; physician associates and anaesthesia associates (since Dec 2024) | Medical Register (LRMP) | gmc-uk.org/registration-and-licensing/our-registers | Yes, free search, several numbers at once | None for third parties. GMC Connect is for designated bodies and employers | Yes: licensed Medical Register download, about £815/yr + VAT, daily full or change files, last 7 days | Search: registration and licence status, type, dates, PMQ, GP/Specialist Register, FtP history. Download: surname, given names, gender, qualification, registration and specialist dates, up to 7 specialties (full column list: confirm) | Signed licence (GMC Services International), one named user. Purpose: "validating the registration status of medical practitioners". Republication needs a separate licence. No PA/AA download | Public site terms: reuse for non-commercial purposes only. Automating the public search is not permitted without permission | **Dataset adapter** on the licensed download, matching by GMC number. Store only the matched row's minimum fields, never republish | Apply to data@gmc-uk.org for the download licence, stating the verification purpose. Ask about PA/AA coverage | High (terms, fees); medium (columns) |
| NMC | Nurses, midwives, nursing associates | NMC register | nmc.org.uk/registration/search-the-register | Yes, search by PIN | None found | None found. Employer Confirmation Service (up to 10 PINs, NMC login; secondary sources say it also needs date of birth) | Name, status (registered, not practising, conditions), location, expiry, register entry, start date, qualifications | ECS login issued by the NMC to employers | Not established. Website terms: confirm | **Manual** check of the public register now. Later a consented verification route if the NMC offers one | Ask the NMC whether a verification provider can use ECS or a confirmation service with the registrant's consent | Medium |
| HCPC | Paramedics, radiographers, physiotherapists and 12 others | HCPC register | hcpc-uk.org/check-the-register; Employer Check API: hcpc-uk.org/employers/registration/checking-your-employees-registration/ | Yes, free, real time | **Yes: the official Employer Check API**, which the HCPC describes as letting you request registrant data directly into your own application. Wavelength has no access yet | Multiple Registrant Search (up to 100 numbers at once) | API: name, profession, registration status, registration number, approximate area of work, additional entitlements (only data already public on the register; no contact details). Register: also current period, modalities and conditions | API access, credentials, eligibility of a non-employer provider, fees and terms: **confirm with the HCPC** | Yes through the API, once the HCPC grants Wavelength access on agreed terms. Not by automating the public search | **API adapter** (`hcpc-employer-check`) on the Employer Check API once access is granted. Until then, `manual` | Apply to the HCPC for Employer Check API access as a verification provider acting at the registrant's request; confirm eligibility, terms, fees and rate limits | High (API exists); low (access terms) |
| FAMUS / Society for Acute Medicine | Acute medicine PoCUS (Thoracic, DVT, Abdominal-renal, peripheral vascular access) | FAMUS directory of supervisors | acutemedicine.org.uk/famus/supervisors-and-mentors/ | Yes: HTML table, filter by module (colour-coded) | None | None | Name, position, trust or hospital, date of registration, email, all published **with the supervisor's consent**; module per row. No GMC number, no expiry. Mentors are not registered (any grade can mentor). Accredited practitioners are not published | None to view | Not addressed. Treat as **not permitted** without SAM's written agreement: personal data published on consent | **Manual** admin check against the page (name, trust, module), recorded with the date | Ask SAM for permission to check, a per-person confirmation route, and ideally a consented feed or verification endpoint | Medium (fields); low (terms) |
| FUSIC / Intensive Care Society | ICU PoCUS: Heart (mentor, supervisor), Lung, Abdomen, DVT, Vascular, Haemodynamics (trainer) | FUSIC directory | ics.ac.uk/learning/fusic.html | Yes: search by hospital | None | None | Probably name, hospital, module and role (exact columns: confirm). No public list of accredited practitioners | None to view | Not addressed; privacy policy only. Treat as not permitted without ICS agreement | **Manual** check by hospital and name | Ask ICS (learning@ics.ac.uk) for permission and a confirmation route; ask whether accredited status could be confirmed | Medium (structure); low (fields, terms) |
| British Society of Echocardiography | Echo: Level 1, adult TTE, TOE, ACCE, stress, CHD | Accredited members list | bsecho.org/Public/Public/Accreditation/Personal-accred/Accredited-members.aspx | Yes, searchable | None | None | Full name, accreditation type, accredited-until date. No hospital, no GMC number | None to view | Not addressed in the terms seen. Ask | **Manual** check with the expiry date (5-year accreditation); prompt a recheck at expiry | Ask BSE (accreditation@bsecho.org) for permission for per-name lookups or a feed of name, type and expiry, and whether a membership number could be shown | Medium-high (fields); low (terms) |
| EACVI / ESC | Cardiovascular imaging certification: TTE, TOE, CHD, CMR, CCT, nuclear | Certified healthcare professionals in imaging | escardio.org/Education/Career-Development/Certification/certified-healthcare-professionals-in-imaging | Yes, list by modality | None | None | First name, last name, country, certification expiry (5-year validity: medium confidence) | None to view | **No.** ESC terms forbid substantive extraction or reuse of the databases and automated collection of information about others | **Manual** individual lookup only | Ask the EACVI certification office for permission for individual lookups or a confirmation service | High (fields, terms) |
| RCEM | Emergency medicine PoCUS (Core ultrasound, formerly Level 1) | **No public register of ultrasound supervisors.** Supervision is a local role (senior decision maker, departmental PoCUS lead), evidenced in risr/advance | rcem.ac.uk/ultrasound-education-training-2021-curriculum/ | No | risr/advance APIs exist **for its customers (colleges)** only | None | None | RCEM as data controller would have to commission any link | Not applicable | **Evidence + GMC registration**: a letter or email from the PoCUS lead, clinical director or educational supervisor, plus GMC verification | Ask RCEM whether Wavelength evidence codes (SO-, AS-, EV-) are acceptable uploaded evidence, and whether RCEM would sponsor an import route through risr/ | High (no register); medium (API) |
| GPhC | Pharmacists (some ACPs) | Registers + data subscription | pharmacyregulation.org/registers/data-subscription-service | Yes | Possibly a RESTful web service under the subscription (confirm) | Yes: about £600/yr, daily XML/CSV, licence for "validating the registration status" | Registration details and change lists | Organisation subscription, licence | Yes, within the licence | Dataset or API adapter if pharmacist supervisors become common | Low priority | High (service); medium (REST) |
| Register of Clinical Technologists | Sonographers (PSA accredited register; took over the Public Voluntary Register of Sonographers in 2021) | RCT directory | therct.org.uk/directory/ | Yes | None found | None | Directory fields: confirm | None to view | Not addressed | Manual | Ask if sonographer supervisors join | High (history); low (fields) |
| NHSE Centre for Advancing Practice | Advanced clinical practitioners (no statutory regulator for ACP itself) | Directory of practitioners + digital badge | advanced-practice.hee.nhs.uk | Yes | None found | None | Programme and practitioner listing (confirm) | Not stated | Not addressed | Manual, as a credential, alongside the NMC or HCPC registration | Ask about badge verification | Medium |
| ESICM | Critical care echo (EDEC diploma) | No public list of diploma holders found | esicm.org/education/diploma/edec-2/ | No | None | None | None | Not applicable | Not applicable | Evidence (diploma) | Contact education@esicm.org later if needed | Medium |
| BIG-register (Netherlands) | Dutch doctors, nurses and others | BIG-register | bigregister.nl | Yes | **Yes: a public SOAP web service** (CIBG for the Ministry of Health), documented for "searching from your own system" | Not seen | Registration details | Read the manual and request the WSDL; fees and terms: confirm | Appears permitted (documented for this purpose): confirm terms | The first candidate for a **live API adapter** in Europe | Request the WSDL and terms when Dutch users appear | High (existence); low (terms) |
| Medical Council (Ireland), NMBI | Irish doctors, nurses and midwives | Public registers | medicalcouncil.ie, my.nmbi.ie | Yes | None found | None found | Status, registration number, division, specialties, conditions | None | Not addressed | Manual | Ask when Irish users appear | Medium |
| Germany (Landesärztekammern) | German doctors | 17 regional chambers; no national register; listings often consent-based | bundesaerztekammer.de/arztsuche | Partial | None | None | Varies | Varies | Not established | Evidence (Approbationsurkunde) or a chamber confirmation | None now | Medium |
| EFSUMB, BMUS, CASE, WINFOCUS, ESRA/RA-UK, EUSEM | Curricula, course accreditation, diplomas | No individual practitioner registers found (CASE accredits courses, not people) | efsumb.org, bmus.org, case-uk.org, esraeurope.org | No (CASE: course directory) | None | None | Not applicable | Not applicable | Not applicable | Evidence where a diploma exists | None now | Low-medium |

**Official API that exists but is not yet authorised:** the HCPC Employer Check API. It is recorded in `data/credentials.json` (`officialApi`, status `not_authorised`) and HCPC stays `manual` until Wavelength holds access and written terms.

**Undocumented endpoints are excluded.** A GMC `/api/gmc/print/doctor?no=` URL appears in search results. It is not an offered API and must not be used.

## 2. What to ask each body (drafts only: nothing has been sent)

Every request should say:
- Wavelength is an independent education provider, Auda Medical Ltd (ICO ZC265391).
- The purpose is to confirm a clinician's status **at their own request and with their consent**, so that learners and assessors can rely on supervisor sign-offs.
- Wavelength stores only the result (status, modules, date checked), never a copy of the register.
- Wavelength will show the body's name as the source and never imply that it issued or endorses anything.

| Body | Ask for, in order of preference |
|---|---|
| GMC (data@gmc-uk.org) | 1. The Medical Register download licence, for validating registration status. 2. Whether a per-number verification service exists for vendors. 3. PA/AA coverage. |
| NMC | 1. A consented verification route (ECS or similar) for a third-party provider. 2. Permission to check the public register per person at the registrant's request. |
| HCPC | 1. Access to the **Employer Check API** for a verification provider acting at the registrant's request: eligibility, credentials, terms of use, fees and rate limits. 2. Meanwhile, permission for per-person checks of the public register (or Multiple Registrant Search). |
| SAM / FAMUS (famus@acutemedicine.org.uk) | 1. Written permission to check the supervisor directory per person. 2. A confirmation route ("Is X an approved FAMUS supervisor for module Y?"). 3. A consented read-only feed or verification endpoint (name, trust, modules, registration date, status). 4. A partnership: FAMUS logbook targets are already in the Wavelength app. |
| ICS / FUSIC (learning@ics.ac.uk) | Same four asks for trainers, mentors and supervisors. Also whether accredited-practitioner status can be confirmed on request. |
| BSE (accreditation@bsecho.org) | 1. Permission for per-name checks. 2. A feed of name, accreditation type and expiry. 3. Whether a membership or accreditation number could be shown, so names are unambiguous. |
| EACVI / ESC | Permission for individual lookups, or a confirmation service. Wavelength does not and will not extract the list. |
| RCEM | 1. Whether SO-, AS- and EV- verification codes are acceptable portfolio evidence. 2. Whether RCEM would commission an import route through risr/advance. 3. Whether RCEM keeps any record of approved PoCUS supervisors it could confirm on request. |

## 3. Portfolio integration (future; no unofficial integrations built)

| Platform | Used by | Integration route today | Standards seen |
|---|---|---|---|
| risr/advance (formerly Kaizen) | RCEM, RCPCH, RCR, ACCS | APIs for college customers, with paid onboarding. Third parties need the college to commission it | None confirmed |
| JRCPTB ePortfolio (hosted by NHS Education for Scotland) | Physician training | None for third parties found | None confirmed |
| NES Turas | Scotland, Wales, Northern Ireland programmes | None for third parties found | None confirmed |
| FICM / RCoA Lifelong Learning Platform | Intensive care, anaesthesia | Custom build (supplier unconfirmed). None for third parties found | None confirmed |
| NHS Digital Staff Passport | NHS staff | Issues **W3C Verifiable Credentials** to wallets; publishes a direct-to-wallet integration standard | W3C VC |
| Europass / European Digital Credentials for Learning | EU | Free issuer, viewer and wallet | W3C VC (EDC) |

**Recommendation:** keep Wavelength's evidence model portable. Every sign-off, assessment and evidence summary already carries an immutable code. The snapshot added here records:
- The pathway and module scope.
- The supervisor, their verification state, credentials and timestamps.
- The method.

That is what a future transmission needs. The most likely formats are **1EdTech Open Badges 3.0 / W3C Verifiable Credentials** (the NHS Staff Passport and Europass both use VCs) and a signed JSON export for colleges. Any direct link needs the college's agreement first.

## 4. Privacy and GDPR review

New processing once `PROFESSIONAL_VERIFY` is on:
- Registration numbers and regulator-returned names and status.
- Credential claims and evidence documents.
- Admin decisions.
- Periodic rechecks.
- The opt-in directory.

| Area | Position taken | Needs formal review |
|---|---|---|
| Email verification | Token hashes and timestamps only. Covered by the existing account processing | No change needed |
| Regulator lookups | Only at the person's request, for the number they enter. Store a few fields, never the raw response. Manual checks by admins use public registers | Lawful basis (likely legitimate interests, or contract for supervisors who ask to be verified): **legal review** |
| Licensed datasets (GMC download) | If licensed, store only matched rows' minimum fields. The licence forbids republication | Licence terms and retention: **legal review** before signing |
| Evidence documents | 1 MB cap, no identity documents, purged 30 days after a decision; hash kept | Retention period and special-category risk (letters may mention health): **DPIA** |
| Audit trail | Kept for the life of the account; deleted with the account | Whether verification decisions should outlive account deletion (for sign-offs others rely on): **DPIA and legal review** |
| Sign-off snapshots | Part of the learner's record. They hold the supervisor's name and registration number as they stood when signing (the number already appears in sign-offs today when typed) | Notice to supervisors that their verified status is stored with sign-offs they make: **privacy notice** |
| Rechecks | Monthly for regulators, at expiry for credentials | Purpose limitation and frequency: **DPIA** |
| Directory | Opt-in only, eligible at read time, contact details only if chosen. Never imports external registers | Public profile notice and objection route: **privacy notice + DPIA** |
| External registers | Used as verification sources only, per person, never bulk copied. EACVI terms forbid extraction | Agreements with each body before automation |

### Privacy notice draft

This is a draft for owner and legal approval before `PROFESSIONAL_VERIFY` is switched on. It is **not** published.

> **Professional and supervisor verification (Wavelength app).** If you ask us to verify your professional registration, we use the regulator and registration number you give us to check the regulator's public register or a data service we are licensed to use. We keep the result (your name as the register shows it, whether your registration is current, and the date we checked), not a copy of the register. If you ask us to verify a credential from another body, such as a FAMUS or FUSIC supervisor role, we check that body's published list where we are allowed to, or the evidence you upload. We delete uploaded files 30 days after we decide, keeping a fingerprint of the file and our decision. We record each decision, who made it and why. We recheck registrations about monthly and credentials when they expire. When you sign off a learner's scan from your Wavelength account, the sign-off records what we had verified about you at that moment, and that record does not change later. If you choose to appear in the supervisor directory, we show your name, profession, organisation, region, verified credentials and supervisor modules, and a contact email only if you add one. You can leave the directory, withdraw a claim or delete your account at any time.

## 5. App Store and Google Play review

Sources (official; some read from search extracts, as marked in the research notes):
- Apple App Review Guidelines.
- Apple Upcoming Requirements.
- Apple account deletion and privacy details pages.
- Android target SDK requirements.
- Google Play Data safety, account deletion, health apps and minimum functionality pages.

| Requirement | Current state in this repo | Effect of this change |
|---|---|---|
| Apple 4.2 minimum functionality (repackaged websites) | Since PR #13 the logbook ships inside the app (no `server.url`): offline logbook, on-device images, signatures, app lock, native share and filesystem, exports | None. New screens add app-like workflow. Keep this utility visible in review notes |
| Apple 2.5.2 (code that changes features) | The app runs bundled code; the server provides data only | New features arrive in store builds. Do not change the app's purpose after review |
| Apple 5.1.1(v) / Google account deletion | In-app deletion plus /app/delete-account/ | Deletion now also removes registrations, credentials, evidence, approvals, directory data, tokens and events |
| Apple 4.8 Sign in with Apple | Own email and password only (exempt) | No third-party login added |
| Apple 2.1 demo account | appreview@thewavelength.co.uk | Mark the review account's email as verified before submission. If Professional verification is switched on, say in review notes that it is optional and works by admin review |
| Xcode 26 / iOS 26 SDK uploads (from 28 April 2026); deployment target | iOS 15.0 (Capacitor 8) | No change |
| Privacy manifest (PrivacyInfo.xcprivacy) | Added 5 October 2026 in `mobile/ios/App/App/` and the app target (no tracking; name, email, user ID, user content; UserDefaults CA92.1, file timestamps C617.1) | Add professional registration and credential evidence before `PROFESSIONAL_VERIFY` goes live |
| Google Play target API | targetSdk 36 and compileSdk 36 (meets the 31 August 2026 requirement for API 36) | No change |
| Google health apps declaration | STORE.md: "Medical: clinical reference and education tools" | No change |
| Apple App Privacy / Google Data safety | STORE.md declares name, email, user content, user ID; photos not collected; no health | **Before `PROFESSIONAL_VERIFY` goes live:** add "Other data / Other info: professional registration number and credential evidence (app functionality, linked to user)". Also review the separate, existing question of whether scan findings should be declared as health data and whether encrypted image sharing counts as collection (research suggests declaring both is the safer reading; owner decision) |
| Universal Links / App Links | Not configured | Recommended later (native build: AASA with the Team ID, assetlinks with the Play signing key, entitlement, intent filter, `@capacitor/app`). Verification works without them |
| Permissions | Camera, photos, microphone (iOS strings); INTERNET (Android) | None added. Evidence upload uses the standard file picker |

## 6. Pre-existing issues noticed (not changed here)

- **Cold start offline:** fixed in PR #13. The account is cached on the device, so the logbook opens with no connection.
- **Account enumeration:**
  - App sign-up still answers 409 "account exists" for password accounts. App login still says an email "is registered for Academy modules". Academy registration answers differently for new and existing emails.
  - Closing these fully needs verify-before-login for every sign-up. That is an owner decision on friction.
  - The Cloudflare rate-limiting rules recommended in issue #2 remain the main mitigation.
- **Shared admin login:** one admin login means the audit trail relies on the reviewer's typed name. Individual admin accounts are recommended.
