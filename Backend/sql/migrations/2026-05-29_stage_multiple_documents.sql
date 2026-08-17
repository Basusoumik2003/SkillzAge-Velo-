CREATE TABLE IF NOT EXISTS project_stage_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  stage_index INTEGER NOT NULL,
  document_url TEXT NOT NULL DEFAULT '',
  document_name TEXT NOT NULL DEFAULT '',
  document_public_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_stage_documents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_stage_documents_step CHECK (step_number >= 1),
  CONSTRAINT chk_project_stage_documents_stage CHECK (stage_index >= 0)
);

CREATE INDEX IF NOT EXISTS ix_project_stage_documents_user_project_stage
  ON project_stage_documents(user_id, project_name, step_number, stage_index);

INSERT INTO project_stage_documents (
  user_id,
  project_name,
  step_number,
  stage_index,
  document_url,
  document_name,
  document_public_id,
  created_at,
  updated_at
)
SELECT
  psp.user_id,
  psp.project_name,
  psp.step_number,
  psp.stage_index,
  psp.document_url,
  psp.document_name,
  psp.document_public_id,
  COALESCE(psp.updated_at, NOW()),
  COALESCE(psp.updated_at, NOW())
FROM project_stage_progress psp
WHERE COALESCE(psp.document_url, '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM project_stage_documents psd
    WHERE psd.user_id = psp.user_id
      AND psd.project_name = psp.project_name
      AND psd.step_number = psp.step_number
      AND psd.stage_index = psp.stage_index
      AND psd.document_url = psp.document_url
  );
