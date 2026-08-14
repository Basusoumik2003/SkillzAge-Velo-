ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_demo_project BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_projects_demo_active
  ON projects(is_demo_project, is_active);

CREATE TABLE IF NOT EXISTS demo_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(240) NOT NULL,
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_demo_documents_active_updated
  ON demo_documents(is_active, updated_at DESC);
