CREATE TABLE IF NOT EXISTS project_stage_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'undone',
  understood BOOLEAN NOT NULL DEFAULT FALSE,
  document_required BOOLEAN NOT NULL DEFAULT FALSE,
  document_url TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  document_public_id TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_stage_progress_status CHECK (status IN ('undone', 'working', 'completed')),
  CONSTRAINT chk_project_stage_progress_step CHECK (step_number >= 1),
  CONSTRAINT chk_project_stage_progress_stage CHECK (stage_index >= 0),
  CONSTRAINT uq_project_stage_progress_user_project_stage UNIQUE (user_id, project_name, step_number, stage_index)
);

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_user_project
  ON project_stage_progress(user_id, project_name);
