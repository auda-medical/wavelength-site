-- Supervisor verification fix: READ-ONLY checks for after deployment (and before, as a baseline). SELECT only.
--   npx wrangler d1 execute wavelength-volunteers --remote --file docs/supervisor-verification-release/post-deploy-checks.sql
-- No names, emails or registration numbers are selected.

-- C1. Applications still open beside a current approval. Before the repair: application 1 (8 person-page approvals).
--     After "Record as approved" on /admin/supervisors/?app=1: no rows.
SELECT a.id AS application, a.kind, a.status, COUNT(x.id) AS current_approvals, SUM(x.application_id IS NULL) AS person_page_rows
FROM supervisor_applications a JOIN supervisor_approvals x ON x.learner_id = a.learner_id AND x.status = 'approved'
WHERE a.status IN ('submitted', 'more_info') GROUP BY a.id;

-- C2. Approval emails: one row per decision. sent = accepted by ZeptoMail (not proof of delivery).
SELECT key, status, attempts, last_error, substr(created_at, 1, 16) AS created, substr(sent_at, 1, 16) AS sent FROM notification_log
WHERE kind = 'app_approved' ORDER BY created_at DESC LIMIT 10;

-- C3. Decisions recorded by the new routine (route, scopes, status before and after, self-approval flag, note given).
SELECT substr(at, 1, 16) AS at, action, subject_type, subject_id, meta FROM audit_events
WHERE action IN ('approval.grant', 'application.approve', 'application.confirm_renewal', 'application.close_approved', 'approval.independent_review', 'email.resend')
ORDER BY id DESC LIMIT 10;

-- C4. No duplicate live approvals (the unique index guarantees it; this confirms).
SELECT learner_id, pathway, module, COUNT(*) AS n FROM supervisor_approvals WHERE status = 'approved' GROUP BY learner_id, pathway, module HAVING n > 1;

-- C5. The daily job still runs (it also retries failed approval emails, up to three attempts).
SELECT job, substr(started_at, 1, 16) AS started, outcome FROM job_runs ORDER BY id DESC LIMIT 3;
