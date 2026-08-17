-- Migration: Add submission_group_id to project_stage_documents table
-- Date: 2026-06-19

BEGIN;

ALTER TABLE project_stage_documents
  ADD COLUMN IF NOT EXISTS submission_group_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_group
  ON project_stage_documents(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;
