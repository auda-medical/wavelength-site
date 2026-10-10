# Supervisor directories: permission assessment, requests and data protection (11 October 2026)

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

## 3. Draft permission requests (not sent: they need your approval)

### To the Society for Acute Medicine (FAMUS)

> Subject: Request to use the FAMUS supervisors and mentors directory in the Wavelength ultrasound logbook
>
> Dear FAMUS committee,
>
> I am the Course Director of Wavelength (Auda Medical Ltd), which runs point-of-care ultrasound courses and a free logbook app for emergency and acute clinicians. Many of our learners are working towards FAMUS accreditation.
>
> Learners invite their supervisors in the app, and supervisors can apply to be recognised as Wavelength supervisors. To help them pick the right person and to help us check credentials, we would like to use the FAMUS supervisors and mentors directory. We would read it at most once a day and keep only each person's name, hospital, the modules and roles listed, and the date accredited: never contact details. It would be used only for name search inside the app and for our administrators' checks. A listing would never be presented as FAMUS or Society endorsement of Wavelength, and anyone who objects would be removed at once.
>
> Could you tell us:
> 1. whether the Society agrees to this use, and on what terms (attribution, frequency, retention);
> 2. whether a data file or feed could be provided (a suggested format is attached), rather than us reading the web page;
> 3. whether the people listed were told their entry might be reused in this way, or whether you would prefer we ask them ourselves;
> 4. who to contact about corrections and removals.
>
> We will not use the directory until we have your written agreement. I would be happy to talk this through.
>
> Yours sincerely,
> Dr Firas Abou-Auda, Course Director, Wavelength (Auda Medical Ltd, company 08487817)
> hello@thewavelength.co.uk · thewavelength.co.uk

### To the Intensive Care Society (FUSIC TMS directory)

> Subject: Request to use the FUSIC trainer, mentor and supervisor directory in the Wavelength ultrasound logbook
>
> Dear FUSIC team,
>
> I am the Course Director of Wavelength (Auda Medical Ltd), which runs point-of-care ultrasound courses and a free logbook app that supports FUSIC learners alongside other pathways.
>
> Learners invite their mentors and supervisors in the app, and supervisors can apply to be recognised as Wavelength supervisors. We would like to use the FUSIC TMS directory so that learners pick the right person, and so that our administrators can check a supervisor's listed modules. We would keep only name, hospital, roles and modules, at most once a day, never contact details. It would be used only for name search inside the app and for administrators' checks, with objections honoured at once. Nothing would suggest ICS endorsement of Wavelength.
>
> As the directory is reached through a hospital search, we have not read it automatically and will not do so without your agreement. Could you tell us:
> 1. whether the Society agrees to this use, and on what terms;
> 2. whether a data file or feed could be provided (suggested format attached);
> 3. whether listed people were told their entry might be reused, or whether you would prefer we ask them;
> 4. who to contact about corrections and removals.
>
> Yours sincerely,
> Dr Firas Abou-Auda, Course Director, Wavelength (Auda Medical Ltd, company 08487817)
> hello@thewavelength.co.uk · thewavelength.co.uk

### To the British Society of Echocardiography

> Subject: Checking BSE accreditation for Wavelength supervisors
>
> Dear BSE accreditation team,
>
> Wavelength (Auda Medical Ltd) runs point-of-care ultrasound courses and a free logbook app. Some supervisors who apply to supervise through Wavelength hold BSE accreditation, and we would like to confirm it accurately.
>
> Could you tell us how the BSE would prefer organisations to confirm a member's accreditation: a lookup the BSE permits, a confirmation by email, or evidence from the member? We will not query the accredited members list automatically without your agreement, and we keep no contact details.
>
> Yours sincerely,
> Dr Firas Abou-Auda, Course Director, Wavelength (Auda Medical Ltd, company 08487817)
> hello@thewavelength.co.uk

Attach `feed-format.md` (as a short PDF or the text) to the SAM and ICS letters.

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
