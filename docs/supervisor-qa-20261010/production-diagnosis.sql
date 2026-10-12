-- Supervisor verification QA (10 October 2026): READ-ONLY diagnosis of the two reported defects in production.
-- Every statement is a SELECT. Nothing here changes data. Run by the owner, for example:
--   npx wrangler d1 execute wavelength-volunteers --remote --file docs/supervisor-qa-20261010/production-diagnosis.sql
-- or paste one query at a time into the Cloudflare dashboard (D1, wavelength-volunteers, Console).
-- Each query is small (a few dozen rows at most), well inside the D1 free-tier daily read limit.
-- How to read the results: README.md in this folder, section 2.

-- Q1. Applications still open for people who already hold a current approval. A row here is the contradiction the
--     app showed ("Wavelength Verified Supervisor" and "Your supervisor application is being reviewed").
--     direct_rows > 0 means an approval was granted from the person page (application_id empty).
SELECT a.id AS application, a.learner_id, a.kind, a.status, a.submitted_at,
       COUNT(x.id) AS current_approvals,
       SUM(x.application_id IS NULL) AS direct_rows,
       MIN(x.approved_at) AS first_approved_at,
       GROUP_CONCAT(x.pathway || ':' || x.module, ', ') AS scopes
FROM supervisor_applications a
JOIN supervisor_approvals x ON x.learner_id = a.learner_id AND x.status = 'approved'
WHERE a.status IN ('submitted', 'more_info')
GROUP BY a.id;

-- Q2. The most recent approvals and how each was made: application_id empty = person page ("Approve as Wavelength
--     supervisor for these scopes"), which before this fix sent no email to the supervisor.
SELECT id, learner_id, pathway, module, capacity, application_id, approved_by, approved_at, review_on
FROM supervisor_approvals WHERE status = 'approved' ORDER BY approved_at DESC LIMIT 20;

-- Q3. Approval emails in the outbox. No row for a person approved in Q2 = never generated. pending = queued, not yet
--     handed to ZeptoMail. sent = ZeptoMail accepted it (not proof of delivery). failed + 'email sending is not set
--     up' = no ZEPTOMAIL_TOKEN. failed + 'refused by the email provider' = ZeptoMail refused. unknown = no answer.
SELECT key, learner_id, status, attempts, last_error, created_at, sent_at
FROM notification_log WHERE kind = 'app_approved' ORDER BY created_at DESC LIMIT 20;

-- Q4. Every outbox status, to see whether supervisor emails in general reach ZeptoMail.
SELECT kind, status, COUNT(*) AS n, MAX(created_at) AS latest FROM notification_log GROUP BY kind, status ORDER BY kind, status;

-- Q5. Decisions recorded in the audit trail (who, when, which route). approval.grant = person page;
--     application.approve = the application's Approve button.
SELECT at, actor_id, action, subject_type, subject_id, meta FROM audit_events
WHERE action IN ('approval.grant', 'application.approve', 'application.confirm_renewal', 'email.resend', 'email.mark_sent')
ORDER BY id DESC LIMIT 20;

-- Q6. Credential and registration approvals (these never send an email: they are steps before supervisor approval).
SELECT at, learner_id, subject_type, subject_id, action, outcome, actor FROM verification_events
WHERE action IN ('admin_approved', 'admin_verified', 'admin_verified_after_consideration') ORDER BY id DESC LIMIT 20;

-- Q7. The daily job (it retries failed emails, up to three attempts).
SELECT job, started_at, finished_at, outcome, error FROM job_runs ORDER BY id DESC LIMIT 5;
