-- Track mentor review status for required stage documents.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_project_stage_progress_document_review_status'
  ) THEN
    ALTER TABLE project_stage_progress
      ADD CONSTRAINT chk_project_stage_progress_document_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
  ON project_stage_progress(document_review_status);

COMMIT;
