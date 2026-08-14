CREATE TABLE IF NOT EXISTS global_category_document_access_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  is_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_global_category_document_access_settings_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_global_category_document_access_settings
    UNIQUE (global_category)
);

CREATE TABLE IF NOT EXISTS global_category_document_access (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  global_document_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_category_document_access_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_global_category_document_access_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT uq_global_category_document_access
    UNIQUE (global_category, global_document_id)
);

CREATE INDEX IF NOT EXISTS ix_global_category_document_access_category
  ON global_category_document_access(global_category);
CREATE INDEX IF NOT EXISTS ix_global_category_document_access_document
  ON global_category_document_access(global_document_id);