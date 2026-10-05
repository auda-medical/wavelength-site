-- Session revocation: a password change or reset sets sessions_after (milliseconds since 1970), and the Worker
-- refuses login cookies issued before it (worker/academy.js learner()). Additive only: no data changes.
ALTER TABLE learners ADD COLUMN sessions_after INTEGER;
