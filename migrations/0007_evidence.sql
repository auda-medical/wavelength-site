-- Verified evidence summaries: a snapshot of a learner's logbook progress, computed by the Worker from the
-- server copy of the logbook, with a public code (EV-XXXX-XXXX) for portfolio reviewers and accrediting bodies.
CREATE TABLE IF NOT EXISTS evidence_summaries (
  id TEXT PRIMARY KEY,
  learner_id INTEGER NOT NULL,
  destination TEXT,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  withdrawn INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS evidence_learner ON evidence_summaries (learner_id, created_at);
