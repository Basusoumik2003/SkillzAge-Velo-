CREATE TABLE IF NOT EXISTS project_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'general',
  source_type VARCHAR(30) NOT NULL DEFAULT 'upload',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_documents_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_documents_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_project_documents_source_type
    CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
  CONSTRAINT chk_project_documents_status
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
  CONSTRAINT chk_project_documents_version
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS ix_project_documents_company_project
  ON project_documents(company_id, project_id);

CREATE INDEX IF NOT EXISTS ix_project_documents_project_status
  ON project_documents(project_id, status);

CREATE INDEX IF NOT EXISTS ix_project_documents_project_type
  ON project_documents(project_id, document_type);

CREATE INDEX IF NOT EXISTS ix_project_documents_active
  ON project_documents(is_active);
