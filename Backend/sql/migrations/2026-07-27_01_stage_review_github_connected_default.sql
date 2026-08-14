BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

ALTER TABLE stage_document_review_audits
  ALTER COLUMN github_connected SET DEFAULT FALSE;

COMMIT;