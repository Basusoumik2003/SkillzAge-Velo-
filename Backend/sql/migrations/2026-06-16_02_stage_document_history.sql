-- Preserve every stage document upload and store review results per submission batch.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_submission_group_id TEXT NOT NULL DEFAULT '';

ALTER TABLE project_stage_documents
  ADD COLUMN IF NOT EXISTS submission_group_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_project_stage_documents_review_status'
  ) THEN
    ALTER TABLE project_stage_documents
      ADD CONSTRAINT chk_project_stage_documents_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
  ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;
