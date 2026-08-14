BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS stage_document_review_audits (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  submission_group_id TEXT NOT NULL DEFAULT '',
  document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  parser_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_markdown TEXT NOT NULL DEFAULT '',
  optimized_text TEXT NOT NULL DEFAULT '',
  prompt_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_prompt TEXT NOT NULL DEFAULT '',
  llm_raw_output TEXT NOT NULL DEFAULT '',
  llm_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_source TEXT NOT NULL DEFAULT '',
  review_status VARCHAR(20) NOT NULL DEFAULT 'rejected',
  review_score INTEGER NOT NULL DEFAULT 0,
  review_feedback TEXT NOT NULL DEFAULT '',
  github_required BOOLEAN NOT NULL DEFAULT FALSE,
  github_connected BOOLEAN NOT NULL DEFAULT TRUE,
  stage_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_stage_document_review_audits_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_stage_document_review_audits_stage CHECK (stage_index >= 0),
  CONSTRAINT chk_stage_document_review_audits_step CHECK (step_number >= 1),
  CONSTRAINT chk_stage_document_review_audits_status CHECK (review_status IN ('approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_user_project
  ON stage_document_review_audits(user_id, project_name, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_stage_document_review_audits_group
  ON stage_document_review_audits(user_id, project_name, step_number, stage_index, submission_group_id);

COMMIT;
