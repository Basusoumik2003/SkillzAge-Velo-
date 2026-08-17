-- Catch-up migration: adds all document review + submission group columns
-- that may be missing if 2026-05-18_stage_document_review.sql or
-- 2026-06-16_02_stage_document_history.sql were not applied.
-- All statements use IF NOT EXISTS / DO blocks so running twice is safe.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

-- 1) project_stage_progress: review columns (from 2026-05-18)
ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_review_status    VARCHAR(20)  NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback  TEXT         NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at      TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_project_stage_progress_document_review_status'
  ) THEN
    ALTER TABLE project_stage_progress
      ADD CONSTRAINT chk_project_stage_progress_document_review_status
      CHECK (document_review_status IN ('not_submitted', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
  ON project_stage_progress(document_review_status);

-- 2) project_stage_progress: submission group column (from 2026-06-16_02)
ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS document_submission_group_id TEXT NOT NULL DEFAULT '';

-- 3) project_stage_documents: submission group + review columns (from 2026-06-16_02)
ALTER TABLE project_stage_documents
  ADD COLUMN IF NOT EXISTS submission_group_id       TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_review_status    VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback  TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at      TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
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
