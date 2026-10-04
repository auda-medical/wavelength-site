-- Weekly newsletter sends through the Zoho Campaigns API (worker/newsletter.js).
CREATE TABLE IF NOT EXISTS newsletter_sends (
  slug TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  detail TEXT,
  campaign_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Volunteers who tick the optional newsletter box.
ALTER TABLE volunteers ADD COLUMN newsletter INTEGER NOT NULL DEFAULT 0;
