# Proposed directory feed (adapter `feed_json`)

What Wavelength would ask a professional body to publish, or send privately, so that its directory can be reused without reading web pages. The format is deliberately small: only what is needed to tell a learner that a named person is listed for a module. Contact details are never asked for.

## Format

One JSON document over HTTPS, either public or behind a token the body issues. It is read at most once a day, with a conditional request (ETag or Last-Modified).

```json
{
  "source": "FUSIC TMS directory",
  "generated": "2026-10-11",
  "entries": [
    {
      "id": "12345",
      "name": "Dr Sam Patel",
      "organisation": "Westfield Royal Infirmary",
      "roles": [
        { "role": "mentor", "module": "fusic-heart" },
        { "role": "trainer", "module": "fusic-lung" }
      ],
      "accredited_on": "2025-03-01"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `entries` | yes | The whole list each time (not changes since last time). A bare array is also accepted |
| `id` | recommended | The body's own stable reference. It keeps a person matched when they move hospital or their name is corrected |
| `name` | yes | As the body publishes it |
| `organisation` | yes | Hospital or trust (`hospital` is also accepted) |
| `roles` | yes | One per role and module. Alternatively `role` plus a `modules` array |
| `accredited_on` | optional | `YYYY-MM-DD` |

The module identifiers are Wavelength's: `fusic-heart`, `fusic-lung`, `fusic-abdo`, `fusic-dvt`, `fusic-vasc`, `famus-thoracic`, `famus-abdo`, `famus-dvt`, `famus-pva`, `famus-lp` (as in `data/logbook.json`). A body may use its own names instead, and Wavelength maps them in the adapter.

## What Wavelength does with it

- Validation before anything is stored:
  - an empty list is refused;
  - more than 10% of entries without a name or module is refused;
  - a fall of more than 30% is held for a person to check.

  The previous list stays in use whenever a feed is held or refused.
- Stores the current and previous list only, removed people for 12 months (marked removed), and change events for 13 months.
- Uses the data for name search in the Wavelength app (at most 8 results, from three letters) and for administrators confirming a supervisor's claimed credential. It never shows contact details and never sends anyone marketing.
- Honours objections at once (`directory_optouts`), and removes a person on the body's request.
- Implementation: `parseFeed` in `worker/monitor/directory.js`; tests in `test/source-monitor.test.mjs`.
