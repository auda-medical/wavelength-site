# Supervisor directories: permission assessment, letters and data protection (11 October 2026)

**Conclusion: Wavelength may not read any supervisor directory automatically yet.** All three directories are set to `not_authorised` in `data/monitor-sources.json`, and the Worker also needs `DIRECTORY_SYNC = "true"`. Until a body gives written permission, supervisors are checked by hand, as now, on the person page of `/admin/supervisors/`. The code is built and tested with synthetic people only, so it can be switched on per directory once permission arrives.

Guidance pages and documents are different: they hold no personal data, are published for the public to read, and are read once a day with an identifying user agent. They are checked automatically from deployment. One source, EACVI's list of certified professionals, is checked by hand because the ESC's terms forbid automated collection.

## 1. What was found

| Directory | Owner | What it shows | Reuse terms, API or feed | Assessment |
|---|---|---|---|---|
| FAMUS supervisors and mentors (`acutemedicine.org.uk/famus/supervisors-and-mentors/`) | Society for Acute Medicine (SAM) | Name, position, trust or hospital, one column per module, date accredited, contact | None published | Personal data, published for SAM's own directory. Written permission needed |
| FUSIC TMS directory (`ics.ac.uk/learning/fusic/fusic-tms-directory.html`) | Intensive Care Society (ICS) | 1,173 trainers, mentors and supervisors, found through a hospital search | None published; robots.txt sets no content signal | Personal data. Written permission needed, ideally with a feed (`feed-format.md`) |
| BSE accredited members | British Society of Echocardiography | Accredited members | None published | Personal data. Ask before any automated lookup |
| EACVI certified healthcare professionals | European Society of Cardiology | Certified professionals | Terms forbid substantive extraction or automated collection | Manual checks only, never automated |

There are three reasons to ask first, even though the pages are public:
1. **Data protection.** Names with professional details are personal data even when published. The people listed agreed to appear in the body's directory, for the body's purposes. Reuse by another organisation needs its own lawful basis and must be transparent to them.
2. **Database right and copyright.** Repeated, systematic extraction from a database can infringe the maker's database right (Copyright and Rights in Databases Regulations 1997), even when each extraction is small.
3. **Website terms**, and the trust of the bodies whose courses and pathways Wavelength teaches towards.

Nothing in this work scrapes round a search form, bypasses a CAPTCHA, uses an undocumented endpoint, or stores a real directory.

## 2. What Wavelength would do with permission

- Read the directory at most once a day, from the body's feed if it offers one, otherwise from the public page, with a user agent naming Wavelength and a contact address.
- Keep only:
  - name, organisation, roles and modules, and the date accredited;
  - never contact details;
  - the current and previous list;
  - removed people for 12 months, marked removed;
  - change events for 13 months.
- Use the data for two things only:
  - **name search** in the Wavelength app, so learners pick the right person when inviting a supervisor and supervisors find their own listing when applying (at most 8 results, from three letters, never contact details);
  - **administrator checks** of a supervisor's claimed credential, with identity confirmed separately. A listing never approves anyone by itself.
- Show on screen "From official directories, checked daily. Being listed is not Wavelength approval."
- Remove a person at once when they object, or when the body asks.
- Stop and delete on request.

## 3. Permission letters: final, ready to send (not sent: each needs your approval)

### Verified contact routes (checked 11 October 2026 on each body's own pages)

| Body | Send to | Where it is published | Data protection |
|---|---|---|---|
| Society for Acute Medicine (FAMUS) | famus@acutemedicine.org.uk (the FAMUS administrator) | FAMUS FAQs page, acutemedicine.org.uk/famus/faqs/ ("please contact the administrator") | administrator@acutemedicine.org.uk, named in SAM's privacy notice (acutemedicine.org.uk/privacy/) |
| Intensive Care Society (FUSIC) | learning@ics.ac.uk (the learning team, which runs FUSIC) | Every FUSIC module page and assessment page on ics.ac.uk | info@ics.ac.uk, named in the ICS privacy policy (ics.ac.uk/policies/privacy-policy.html) |
| British Society of Echocardiography | accreditation@bsecho.org (the accreditation team; telephone 0208 065 5794 on the same page) | BSE accreditation packs, for example the Level 1 accreditation pack 2026 on bsecho.org | BSE's privacy policy page loads its text by script, so no address could be read: the letter asks the accreditation team to pass it on |

Send from hello@thewavelength.co.uk, signed by Dr Firas Abou-Auda. For SAM and ICS, attach `feed-format.md` as a one-page PDF ("Suggested data format"). Keep each reply with this file, because written permission is the first item of the checklist in section 5.

### 1. Society for Acute Medicine

> **To:** famus@acutemedicine.org.uk
> **Subject:** FAMUS supervisor directory: request for permission to use listings in the Wavelength ultrasound logbook
>
> Dear FAMUS Committee,
>
> I am writing from Wavelength (Auda Medical Ltd), a UK provider of point-of-care ultrasound education. We are developing an ultrasound education and logbook platform that many FAMUS candidates use to record their scans and arrange supervisor sign-off.
>
> We would like to ask the Society's permission to use the FAMUS directory of supervisors and mentors, in a limited and regularly refreshed way, to help clinicians identify appropriately listed supervisors. In practice:
>
> - **What we would use:** each listed person's name, hospital or trust, the roles and modules shown, and the date accredited. We would never collect contact details.
> - **How it would appear:** when a trainee types a supervisor's name, the app would suggest matching listings, each attributed to the FAMUS directory of the Society for Acute Medicine. Being listed would not be presented as Wavelength approval, or as the Society endorsing Wavelength.
> - **What it would not do:** appearing in the directory would not create a Wavelength account for anyone, and would not mean the person has agreed to receive supervision requests. A trainee who wants to invite a supervisor still enters that supervisor's own email address, and Wavelength never contacts listed people.
> - **Freshness, corrections and objections:** we would refresh the data no more than once a day, so corrections made by the Society reach us within a day. Anyone listed may ask us to correct their entry or to leave them out, and an objection takes effect at once. We would stop and delete the data whenever the Society asks.
>
> Could you let us know:
> 1. whether the Society is willing to grant this permission, and on what terms (attribution wording, refresh frequency, retention);
> 2. whether an official API, an approved data export, a feed or a formal data-sharing arrangement is available, rather than our reading the public page (a suggested format is attached);
> 3. whether listed supervisors were told their entries might be reused in this way, or whether you would prefer us to inform them;
> 4. the right contact for corrections, removals and any data protection questions.
>
> We will not use the directory until we have the Society's written agreement. We would value a long-term working relationship with the FAMUS programme, and I would be glad to discuss this by phone or video call at your convenience.
>
> Yours sincerely,
>
> Dr Firas Abou-Auda
> Course Director, Wavelength
> Auda Medical Ltd (company number 08487817)
> hello@thewavelength.co.uk · thewavelength.co.uk

### 2. Intensive Care Society

> **To:** learning@ics.ac.uk
> **Subject:** FUSIC trainer, mentor and supervisor directory: request for permission to use listings in the Wavelength ultrasound logbook
>
> Dear FUSIC team,
>
> I am writing from Wavelength (Auda Medical Ltd), a UK provider of point-of-care ultrasound education. We are developing an ultrasound education and logbook platform that supports FUSIC learners alongside other accreditation pathways.
>
> We would like to ask the Society's permission to use the FUSIC TMS directory, in a limited and regularly refreshed way, to help clinicians identify appropriately listed trainers, mentors and supervisors:
>
> - **What we would use:** each listed person's name, hospital, and the FUSIC roles and modules shown. We would never collect contact details.
> - **How it would appear:** name suggestions in the app, each attributed to the Intensive Care Society's FUSIC directory. Nothing would suggest that the Society endorses Wavelength, or that a listing is a Wavelength approval.
> - **What it would not do:** a listing would not create a Wavelength account, and would not mean the person has agreed to receive supervision requests. Trainees still invite a supervisor using that supervisor's own email address, and Wavelength never contacts listed people.
> - **Freshness, corrections and objections:** we would refresh at most once a day, so the Society's own corrections reach us promptly. Anyone listed could ask us to correct or remove their entry, and an objection takes effect immediately. We would stop and delete the data on request.
>
> Because the directory is reached through a hospital search, we have not read it automatically and will not do so without your agreement. Could you tell us:
> 1. whether the Society would grant permission, and on what terms;
> 2. whether an official API, an approved data export, a feed or a formal data-sharing arrangement is available (a suggested format is attached);
> 3. whether listed people were told their entries might be reused, or whether you would prefer us to inform them;
> 4. the right contact for corrections, removals and data protection.
>
> We would welcome a long-term collaboration that supports FUSIC training, and would be happy to talk this through.
>
> Yours sincerely,
>
> Dr Firas Abou-Auda
> Course Director, Wavelength
> Auda Medical Ltd (company number 08487817)
> hello@thewavelength.co.uk · thewavelength.co.uk

### 3. British Society of Echocardiography

> **To:** accreditation@bsecho.org
> **Subject:** Confirming BSE accreditation for supervisors on the Wavelength ultrasound logbook
>
> Dear BSE accreditation team,
>
> I am writing from Wavelength (Auda Medical Ltd), a UK provider of point-of-care ultrasound education. We are developing an ultrasound education and logbook platform. Some of the clinicians who apply to supervise learners through it hold BSE accreditation, which several training pathways recognise.
>
> To confirm that accreditation accurately, we would like to ask how the Society would prefer organisations to do so:
> - by limited, regularly refreshed use of your accredited members listing, under a written permission;
> - through an official API, an approved data export or feed, or a formal data-sharing arrangement;
> - by a confirmation from your team on request;
> - or from evidence the member provides.
>
> If a listing were used, we would keep only the member's name, organisation and the accreditation shown, with the source attributed to the BSE, and never contact details. Appearing in the listing would not create a Wavelength account or mean the member has agreed to receive supervision requests. Members could ask us to correct their entry or to leave them out at any time, and we would stop and delete the data on request. We will not query the listing automatically without your agreement.
>
> I would also be grateful if you could pass this to the Society's data protection contact, or let me know who that is.
>
> Yours sincerely,
>
> Dr Firas Abou-Auda
> Course Director, Wavelength
> Auda Medical Ltd (company number 08487817)
> hello@thewavelength.co.uk · thewavelength.co.uk

## 4. Data protection, before any directory is switched on

- **Controller.** Auda Medical Ltd, for its copy of the directory data and everything derived from it.
- **Lawful basis.** Legitimate interests (UK GDPR Article 6(1)(f)): helping learners identify the right supervisor, and checking supervisors' credentials so that sign-offs carry accurate information. Write a short legitimate interests assessment covering:
  - **purpose:** as above;
  - **necessity:** manual checks remain possible but are slower and more error-prone, and name search cannot work without a list;
  - **balancing:** professional data already published by the body; limited fields; no contact details; no marketing; objection honoured at once; the body's agreement and notice to listed people.
- **DPIA.** Matching data from another source and processing that people may not expect are both on the ICO's list of indicators. Do a short DPIA, or record a screening, before switching on. It can build on the existing Wavelength DPIA.
- **Transparency (Article 14).** Add the paragraph below to the privacy notice, and ask the body to mention the reuse in its own directory notice, or agree that Wavelength will tell listed people.
- **Minimisation.**
  - Fields: name, organisation, roles and modules, date accredited. Contact columns are never read: the FAMUS adapter skips them by heading, and the feed format does not ask for them.
- **Retention.**
  - Current and previous list.
  - Removed people for 12 months.
  - Directory events for 13 months.
  - Run records for 90 days.
  - A confirmed claim stays with the supervisor's verification record, under the existing supervisor verification retention.
- **Rights.**
  - **Access and rectification:** through hello@. Corrections at source come in with the next sync.
  - **Objection:** recorded at `/admin/sources/?tab=directories`. It removes the person from both stored lists and the history at once, and keeps them out of later syncs, search and claims.
  - **Erasure:** the same route.
  - The audit trail records only that an objection was made, never the name.
- **Security.** Same D1 database and admin controls as supervisor verification. The listing search needs a signed-in, email-verified account.

### Privacy notice paragraph (draft, for when a directory is switched on)

> **Official supervisor directories.** With the permission of the body that publishes it, Wavelength uses [the FAMUS directory of the Society for Acute Medicine / the FUSIC directory of the Intensive Care Society] to help learners find their supervisor in the app and to help our team check supervisors' credentials. We keep each listed person's name, hospital, roles and modules, and the date accredited, never contact details. We check the directory once a day, keep people who leave it for 12 months, and do not use it for marketing. Being listed does not make anyone a Wavelength-approved supervisor. If you are listed and do not want to appear in Wavelength, email hello@thewavelength.co.uk and we will remove you at once. Our lawful basis is legitimate interests.

## 5. Checklist before switching a directory on

1. Written permission from the body, filed, with any terms (frequency, attribution, retention).
2. Legitimate interests assessment and DPIA screening recorded.
3. Privacy notice paragraph live. Store privacy answers checked (the apps show directory results).
4. `data/monitor-sources.json`: that directory's `mode` set to `auto`, `why` citing the permission, and the adapter matching what the body provides (`feed_json` for a feed, `famus_html` for the SAM table).
5. `DIRECTORY_SYNC = "true"` in `wrangler.jsonc`, then deploy.
6. First sync watched at `/admin/sources/?tab=directories`: count, sample of names against the source, no contact details stored.
