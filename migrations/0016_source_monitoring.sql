-- Source monitoring (October 2026): daily checks of the official guidance behind Wavelength's guides and of
-- authorised supervisor directories. New tables only: nothing existing changes, so applying this is safe at any time
-- and the current Worker ignores it. Numbered 0016 so it follows the commercial branch's 0014 and 0015 (not applied
-- to production) without colliding with them.

-- One row per monitored source: a guidance page or document, or a supervisor directory. Seeded and updated from
-- worker/monitor/sources.json (built from the guides' Sources sections and data/monitor-sources.json).
CREATE TABLE IF NOT EXISTS monitor_sources (
  id TEXT PRIMARY KEY,                    -- stable id, e.g. 'g:rcem.ac.uk/ultrasound' or 'dir:famus'
  kind TEXT NOT NULL,                     -- guidance | directory
  name TEXT NOT NULL,
  body TEXT,                              -- issuing body, e.g. RCEM, ICS, SAM
  url TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'auto',      -- auto | manual (automated checks not permitted or not possible) | not_authorised
  adapter TEXT,                           -- html | pdf | famus_html | feed_json | fixture
  guides TEXT NOT NULL DEFAULT '[]',      -- Wavelength guide slugs that rely on this source
  status TEXT NOT NULL DEFAULT 'never',   -- never | ok | changed | unavailable | format_changed | unsupported | not_authorised
  last_attempt_at TEXT,
  last_success_at TEXT,                   -- advanced only by a check that genuinely succeeded
  last_change_at TEXT,                    -- the last check that found a meaningful change
  next_check_at TEXT,
  last_outcome TEXT,                      -- outcome of the latest check (as monitor_runs.outcome), so a guide view never scans the runs
  failures INTEGER NOT NULL DEFAULT 0,    -- consecutive failed checks
  lease_until TEXT,                       -- a run holding this source; stops two runs checking it at once
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,                      -- SHA-256 of the normalised relevant text (or of the bytes for a PDF)
  doc_version TEXT,                       -- version found in the document or its address, e.g. 'v1.5'
  published_on TEXT,                      -- publication or revision date found in the source, YYYY-MM-DD
  snapshot TEXT,                          -- normalised relevant text of the last good check (HTML only, capped)
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS monitor_sources_due ON monitor_sources (mode, next_check_at);

-- Every check, for the dashboard and for diagnosis. Kept 90 days.
CREATE TABLE IF NOT EXISTS monitor_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  trigger TEXT NOT NULL,                  -- cron | manual | on_demand
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT,                           -- no_change | minor | meaningful | important | unavailable | format_changed | unsupported | not_authorised | busy
  http_status INTEGER,
  error TEXT,
  counts TEXT
);
CREATE INDEX IF NOT EXISTS monitor_runs_source ON monitor_runs (source_id, id);

-- What changed, with evidence, and whether a person has looked at it. Clinical and accreditation content is never
-- rewritten from here: a reviewer decides, and approved changes ship through the normal release.
CREATE TABLE IF NOT EXISTS monitor_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  classification TEXT NOT NULL,           -- minor | meaningful | important | format_changed | directory
  summary TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '{}',    -- hashes, header changes, changed lines (capped), versions, dates
  guides TEXT NOT NULL DEFAULT '[]',      -- affected Wavelength guides
  review_status TEXT NOT NULL DEFAULT 'open', -- open | acknowledged | approved | dismissed | none (minor, recorded only)
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  notified_at TEXT
);
CREATE INDEX IF NOT EXISTS monitor_changes_open ON monitor_changes (review_status, detected_at);

-- Directory snapshots: the whole validated list of one directory as one JSON document, so a sync replaces it in a
-- single write (never half applied). The current and the previous snapshot are both kept.
CREATE TABLE IF NOT EXISTS directory_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  entries TEXT NOT NULL,                  -- [{ key, name, organisation, roles: [{ role, module }], accredited_on, status, first_seen, last_seen, removed_on }]
  current INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS directory_snapshots_current ON directory_snapshots (source_id, current, id);

-- Directory changes, one row per person and kind (added, removed, organisation_changed, modules_added,
-- modules_removed, role_changed, name_corrected, relisted, ambiguous). Larger syncs are summarised in monitor_changes.
CREATE TABLE IF NOT EXISTS directory_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  before TEXT,
  after TEXT,
  review_status TEXT NOT NULL DEFAULT 'none' -- none | open | resolved
);
CREATE INDEX IF NOT EXISTS directory_events_source ON directory_events (source_id, id);

-- A Wavelength account's claim to be a listed person. Listing, identity, membership and supervisor approval stay
-- separate: a link is only a claim until a person confirms identity, and approval is still decided by an administrator.
CREATE TABLE IF NOT EXISTS directory_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  credential_id INTEGER,                  -- the credential claimed from the listing, if any
  status TEXT NOT NULL DEFAULT 'claimed', -- claimed | confirmed | rejected | withdrawn
  identity_method TEXT,                   -- how an administrator confirmed it is the same person
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT,
  flag TEXT                               -- listing_removed | modules_changed | null: the listing changed since
);
CREATE UNIQUE INDEX IF NOT EXISTS directory_links_one ON directory_links (learner_id, source_id, entry_key) WHERE status IN ('claimed', 'confirmed');
CREATE INDEX IF NOT EXISTS directory_links_entry ON directory_links (source_id, entry_key);
