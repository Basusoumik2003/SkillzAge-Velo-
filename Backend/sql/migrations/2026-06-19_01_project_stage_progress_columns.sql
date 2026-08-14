-- Migration: Add missing columns to project_stage_progress table
-- Date: 2026-06-19

BEGIN;

ALTER TABLE project_stage_progress
  ADD COLUMN IF NOT EXISTS submission_group_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS document_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_public_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_review_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS document_review_feedback TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_document_review_status
  ON project_stage_progress(document_review_status);

COMMIT;
