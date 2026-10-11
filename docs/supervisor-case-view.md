# Supervisor verification: the whole case on one page (October 2026)

Branch `wavelength-case-view-20261011`, on the administrator-accounts release (`1a7bb5f`). Separately deployable after
it; never included silently in another release. Design: HQ `02-DEVELOPMENT/SUPERVISOR-CASE-VIEW-DESIGN.md`. Built
because reconciling application #1 meant moving between the application page and the person page, and a person-page
approval had left the application open.

## What it is

`/admin/supervisors/case/?id=<learner>`, linked from every queue row (applications, attention, claims, people) and from
the application and person pages ("Open the whole case"). Top to bottom:

1. **Header**: name, email status, role and organisation, test-account flag; the standing in one phrase with the
   approved scopes and the approved-until date; "This is your own record" when the signed-in administrator's linked
   logbook account (or typed name or Access email) is the person.
2. **What needs doing now**, most pressing first, each linking to its control: block; application waiting for a
   decision; waiting for the applicant; an application open beside a current approval (Record as approved); registration
   and credential checks; possible self-approval without an independent review; approval email failed or unknown;
   review date passed or within 14 days without a renewal; status paused.
3. **The application** (the open one, else the latest) with its checklist, answers, evidence, invitation and decision
   controls; earlier applications folded below.
4. **Registration, credentials, directory listings, approvals, standing**: the person page's sections and controls.
5. **One history**: verification events and audit entries merged, newest first.

## Rules kept

- **Same records, same actions, same handler.** No table, migration or form action is new. Every form on the page
  posts to `/admin/supervisors/` (with `case=<id>` so the answer comes back to the case page), so the permission
  registry, CSRF, audit, emails and lifecycle rules apply exactly as before. The page has no POST of its own.
- **Permission registry:** one new GET route, `/admin/supervisors/case/` → `supervisors.view`. With native accounts a
  control the administrator may not use is left off the page (the General Manager does not see "Revoke all supervisor
  status"); the server still refuses it if posted.
- **Own record:** said at the top; the independent-review control is not offered (the server refuses it anyway).
- **Escaping:** every applicant value is escaped; nothing submitted goes into a script or handler.
- The application and person pages stay unchanged apart from the link.

## Tests

`test/supervisor-case.test.mjs` (5): a new applicant (sections, one history, one title, escaping, every form posting to
the handler with `case`, links from both pages and the queue, not found); approved and the open-beside-approval state of
application #1; own record; controls hidden by permission; through the Worker with native accounts (General Manager
opens the case, decides from it, comes back to it; the decision is recorded as the account; a stray POST changes
nothing; the owner sees the owner-only control). Full suite: 301 tests, all pass.
