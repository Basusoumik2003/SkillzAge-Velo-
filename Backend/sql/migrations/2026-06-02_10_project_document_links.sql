ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'project';

ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(80) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_project_documents_scope'
  ) THEN
    ALTER TABLE project_documents
      ADD CONSTRAINT chk_project_documents_scope
      CHECK (scope IN ('project', 'company'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_project_documents_company_scope_type
  ON project_documents(company_id, scope, document_type);

CREATE INDEX IF NOT EXISTS ix_project_documents_company_scope_hash
  ON project_documents(company_id, scope, content_hash);

CREATE TABLE IF NOT EXISTS project_document_links (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  link_type VARCHAR(30) NOT NULL DEFAULT 'attached',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_document_links_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_document_links_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_document_links_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_document_links_type
    CHECK (link_type IN ('attached', 'owner', 'inherited')),
  CONSTRAINT uq_project_document_links_project_document
    UNIQUE (project_id, document_id)
);

CREATE INDEX IF NOT EXISTS ix_project_document_links_company_project
  ON project_document_links(company_id, project_id);

CREATE INDEX IF NOT EXISTS ix_project_document_links_document
  ON project_document_links(document_id);

INSERT INTO project_document_links (company_id, project_id, document_id, link_type, created_at, updated_at)
SELECT company_id, project_id, id, 'owner', NOW(), NOW()
FROM project_documents
ON CONFLICT (project_id, document_id) DO NOTHING;

ALTER TABLE agent_document_access
  DROP CONSTRAINT IF EXISTS uq_agent_document_access_mentor_document;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_document_access_mentor_project_document
  ON agent_document_access(mentor_id, project_id, document_id);
