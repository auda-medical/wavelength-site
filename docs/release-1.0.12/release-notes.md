# Wavelength 1.0.12 release notes

Release candidate for Android (1.0.12, code 18), iPhone (1.0.12) and the web logbook. Built on the verified 1.0.11
source (tree `1e40d1b338796c030632d94959398d8d26a4ae5d`).

## Store text ("What's new", under 500 characters)

> Edit images and clips in one place: label, annotate with arrows and pictograms, and redact identifiers. "Still to do"
> on Home shows every requirement left on your pathway. Supervisors can open each trainee's scans, sign-offs and
> assessments from the tiles. Either side can end supervision, and the app explains each invitation and verification
> status. Guides to RCEM, FAMUS and FUSIC accreditation are now in the app, offline.

## Learners

- **Still to do** replaces Focus next on Home.
  - One card per open requirement on your pathway: what is left, the progress bars, why it is shown, and Log one or
    Request assessment.
  - Swipe or use the arrows. It never moves by itself and remembers where you were.
  - "View all" lists every open requirement, sorted by curriculum order, fewest left or most left.
  - With two pathways chosen, a picker switches between them.
- **Your supervisors** explains each status in plain words, with the next step. The statuses are: invitation sent,
  application not yet submitted, awaiting professional verification, awaiting Wavelength approval, approved, not yet
  verified, paused, unavailable, ended.
  - Tap a supervisor for their details.
  - "What happens after I invite someone?" and the guide "How supervisor verification works" are in the app.
- **Remove supervisor** asks first and lists the consequences, then confirms with the date once the server has recorded
  it.
  - Open requests come back to you.
  - Completed sign-offs and assessments stay valid.
  - Offline, nothing changes and the app says so.
- **Media editor**, in three modes: Annotate, Adjust, Redact.
  - Annotate offers labels suggested for the scan type, your own text, arrows, dots, circles, boxes and anatomical
    pictograms (body regions, probe positions, sides and echo views), in colour and size.
  - Adjust offers crop, rotate, flip and trim top.
  - Redact draws solid black or grey boxes. Blurring is not offered, because it can leave identifiers readable.
  - Labels that look like dates, NHS numbers or names are questioned.
  - The same tools work on clips. Annotations can be timed ("from here") and are drawn into every frame.
  - Annotations stay editable: the pencil on a saved image reopens them. Redactions are permanent in the saved picture.
  - The phone's own original is never changed.
- **Guides and accreditation**: the website's RCEM, FAMUS, FUSIC and hub guides, inside the app and offline.
  - They open from Progress, from each module and from the Logbook.
  - Each guide shows its checked date and official sources.
- **Motion**: sections rise and fade in once as you scroll. This is off with Reduce motion.
- **Saving a scan** is unchanged on Android. The web logbook and iPhone now behave the same way: one tap saves and
  returns Home with a short note.

## Supervisors

- A trainee's page has four tiles: Scans, Supervised, Signed off and Assessments.
  - Each opens exactly those records, with the filter named, Clear filters and Back.
  - Requests waiting with you are listed.
- **End supervision** from the trainee's page, and **Decline** for an invitation (including one sent to your email
  before you have accepted). Both ask first and confirm.
- "Ended recently" shows links ended in the last 90 days and who ended them.

## iPhone

- New read-only network plugin (NWPathMonitor). Connection status and quick retry after a network change now match
  Android. iOS gives apps no supported way to see a VPN, and the app says so rather than guessing.
- Removed a stale `ios.scheme` setting.

## Server

- Ending supervision is enforced on the server.
  - Only the learner, the linked supervisor or the confirmed holder of the invited email can end a link.
  - It ends once, and requests are returned once.
  - An ended link opens nothing.
  - Re-inviting needs a fresh acceptance.
- New read-only route for a supervisor's filtered list of a trainee's written entries (never images).
- No migration, and no change to Worker variables.

## Backups

- Backups now carry annotations, the unedited base picture and provenance notes as optional fields.
- 1.0.11 restores a 1.0.12 backup (it shows the saved picture), and 1.0.12 restores every earlier backup. The format is
  documented in `docs/backup-format.md`.

## Accessibility and languages

- New text is in all nine languages (machine-drafted; a native speaker should review it).
- The carousel announces "n of m".
- Editor controls have names.
- Guides keep English left to right inside Arabic.
- Both themes pass the contrast checks.
