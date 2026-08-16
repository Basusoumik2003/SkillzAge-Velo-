ALTER TABLE IF EXISTS project_documents
  ADD COLUMN IF NOT EXISTS indexing_error TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS project_documents
  ADD COLUMN IF NOT EXISTS ingestion_attempted_at TIMESTAMPTZ;
