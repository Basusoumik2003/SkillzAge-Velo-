CREATE TABLE IF NOT EXISTS agent_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  access_level VARCHAR(30) NOT NULL DEFAULT 'read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_agent_document_access_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_mentor
    FOREIGN KEY (mentor_id) REFERENCES project_mentors(id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_document_access_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_agent_document_access_level
    CHECK (access_level IN ('read', 'review', 'hidden_review')),
  CONSTRAINT uq_agent_document_access_mentor_document
    UNIQUE (mentor_id, document_id)
);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_project_mentor
  ON agent_document_access(project_id, mentor_id);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_document
  ON agent_document_access(document_id);

CREATE INDEX IF NOT EXISTS ix_agent_document_access_company_project
  ON agent_document_access(company_id, project_id);
