-- 19 Nov 2026 (owner, D-118): automatic backup of photos and clips. The phone encrypts each photo or clip with the
-- learner's backup key before it is uploaded; Wavelength stores only ciphertext (R2 bucket, binding MEDIA) and cannot
-- open it. The backup key itself is stored only wrapped (encrypted) with a key derived on the phone from the learner's
-- password, so a new phone signing in can unwrap it and bring the photos back. prev_* keeps the wrapping that was
-- replaced last, for a learner who reset a forgotten password on a phone that never held the key. kid is a short
-- fingerprint of the backup key (sha256 of the key, first 16 hex): every upload names it, so a phone still holding a
-- replaced key can never store photos the current key cannot open.
CREATE TABLE IF NOT EXISTS media_keys (
  learner_id INTEGER PRIMARY KEY,
  salt TEXT NOT NULL,
  iter INTEGER NOT NULL,
  wrapped TEXT NOT NULL,
  kid TEXT NOT NULL,
  prev_salt TEXT,
  prev_iter INTEGER,
  prev_wrapped TEXT,
  updated_at INTEGER NOT NULL
);

-- One row per backed-up photo or clip: which scan it belongs to, the fingerprint of the original (sha256 of the
-- unencrypted photo, so a phone can tell whether its copy is the same) and the stored size, for the quota.
CREATE TABLE IF NOT EXISTS media_backups (
  learner_id INTEGER NOT NULL,
  media_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (learner_id, media_id)
);
CREATE INDEX IF NOT EXISTS media_backups_entry ON media_backups (learner_id, entry_id);
