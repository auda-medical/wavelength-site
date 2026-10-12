-- Business analytics, bookings, finance and tailored training pipeline (October 2026, commercial development).
-- D1 database: wavelength-volunteers. NOT applied to production: needs the owner's approval first.
-- Design and definitions: docs/commercial-2026/02-analytics-architecture.md. Nothing clinical is stored here.

-- Aggregate counters by UTC day. No personal data: metric and dim are fixed labels, page paths or campaign labels.
CREATE TABLE IF NOT EXISTS metric_daily (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  dim TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric, dim)
);
CREATE INDEX IF NOT EXISTS metric_daily_metric ON metric_daily (metric, day);

-- One row per app account per UTC day it made an authenticated request. Kept 13 months (worker/metrics.js rolls the
-- daily totals into metric_daily first) and deleted with the account.
CREATE TABLE IF NOT EXISTS analytics_learner_days (
  learner_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (learner_id, day)
);
CREATE INDEX IF NOT EXISTS analytics_learner_days_day ON analytics_learner_days (day);

-- Course bookings. No names or emails: the customer record stays in Stripe (or the invoice). Amounts in pence.
-- status: pending (invoice requested or payment not confirmed), paid, part_refunded, refunded, cancelled.
-- source: stripe (verified webhook), manual (entered by the owner), invoice.
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  course_slug TEXT NOT NULL DEFAULT '',
  course_date TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  places INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'gbp',
  gross_pence INTEGER NOT NULL DEFAULT 0,
  refund_pence INTEGER NOT NULL DEFAULT 0,
  discount_pence INTEGER NOT NULL DEFAULT 0,
  fee_pence INTEGER,
  fee_estimated INTEGER NOT NULL DEFAULT 0,
  vat_pence INTEGER NOT NULL DEFAULT 0,
  stripe_session TEXT UNIQUE,
  stripe_payment_intent TEXT,
  stripe_payment_link TEXT,
  campaign TEXT NOT NULL DEFAULT '',
  attended INTEGER,
  paid_at TEXT,
  refunded_at TEXT,
  cancelled_at TEXT,
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  -- 0 for a Stripe test-mode event (evt.livemode false): kept for checking the set-up, never counted as revenue.
  livemode INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS bookings_course ON bookings (course_slug, course_date);
CREATE INDEX IF NOT EXISTS bookings_pi ON bookings (stripe_payment_intent);

-- Every Stripe event processed once (webhook idempotency).
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  outcome TEXT NOT NULL
);

-- Income and expense lines entered by the owner. amount_pence is the total paid or received including any VAT;
-- vat_pence the VAT within it when known. basis: actual or estimate. Lines are voided, never deleted.
-- service: course:<slug>@<YYYY-MM-DD>, training:<enquiry id>, app, academy, general.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  entry_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'general',
  service TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  amount_pence INTEGER NOT NULL,
  vat_pence INTEGER NOT NULL DEFAULT 0,
  vat_treatment TEXT NOT NULL DEFAULT 'not_recorded',
  basis TEXT NOT NULL DEFAULT 'actual' CHECK (basis IN ('actual', 'estimate')),
  reference TEXT NOT NULL DEFAULT '',
  voided_at TEXT,
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS ledger_date ON ledger (entry_date);
CREATE INDEX IF NOT EXISTS ledger_service ON ledger (service);

-- Optional owner time, for the indicative profit-per-owner-hour measure.
CREATE TABLE IF NOT EXISTS owner_time (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  work_date TEXT NOT NULL,
  activity TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'general',
  service TEXT NOT NULL DEFAULT 'general',
  minutes INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  voided_at TEXT
);
CREATE INDEX IF NOT EXISTS owner_time_date ON owner_time (work_date);

-- Business settings (measurement start, VAT registration status, targets). Kept apart from `settings`, which holds
-- login hashes and signing secrets.
CREATE TABLE IF NOT EXISTS business_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Private commercial opportunity register (owner only). Figures are estimates unless basis = 'evidence'.
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  title TEXT NOT NULL,
  stream TEXT NOT NULL,
  customer TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  value_pence INTEGER,
  cost_pence INTEGER,
  owner_hours INTEGER,
  evidence TEXT NOT NULL DEFAULT '',
  development TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT 'medium',
  score_value INTEGER NOT NULL DEFAULT 3,
  score_profit INTEGER NOT NULL DEFAULT 3,
  score_scale INTEGER NOT NULL DEFAULT 3,
  score_feasible INTEGER NOT NULL DEFAULT 3,
  score_strategic INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'idea',
  next_action TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0
);

-- Tailored training enquiries: wider form (individuals, groups, organisations; UK and international) and pipeline.
-- enquiry_class: individual, group, organisation. region: uk, international. stage: new, qualified, proposal,
-- accepted, declined, booked, lost. quote_pence: the quotation issued, when known.
ALTER TABLE department_enquiries ADD COLUMN enquiry_type TEXT;
ALTER TABLE department_enquiries ADD COLUMN enquiry_class TEXT;
ALTER TABLE department_enquiries ADD COLUMN country TEXT;
ALTER TABLE department_enquiries ADD COLUMN region TEXT;
ALTER TABLE department_enquiries ADD COLUMN location TEXT;
ALTER TABLE department_enquiries ADD COLUMN budget TEXT;
ALTER TABLE department_enquiries ADD COLUMN heard TEXT;
ALTER TABLE department_enquiries ADD COLUMN campaign TEXT;
ALTER TABLE department_enquiries ADD COLUMN stage TEXT NOT NULL DEFAULT 'new';
ALTER TABLE department_enquiries ADD COLUMN stage_at TEXT;
ALTER TABLE department_enquiries ADD COLUMN quote_pence INTEGER;
