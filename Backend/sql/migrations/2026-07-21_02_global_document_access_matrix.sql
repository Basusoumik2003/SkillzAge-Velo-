CREATE TABLE IF NOT EXISTS project_global_document_access_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_global_document_access_settings_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_global_document_access_settings_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_project_global_document_access_settings
    UNIQUE (project_id, global_category)
);

CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_project
  ON project_global_document_access_settings(project_id);
CREATE INDEX IF NOT EXISTS ix_project_global_document_access_settings_category
  ON project_global_document_access_settings(global_category);

CREATE TABLE IF NOT EXISTS project_global_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  global_document_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_global_document_access_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_global_document_access_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_project_global_document_access_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_project_global_document_access
    UNIQUE (project_id, global_document_id)
);

CREATE INDEX IF NOT EXISTS ix_project_global_document_access_project_category
  ON project_global_document_access(project_id, global_category);
CREATE INDEX IF NOT EXISTS ix_project_global_document_access_document
  ON project_global_document_access(global_document_id);