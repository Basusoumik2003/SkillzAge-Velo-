ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS global_category VARCHAR(80) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_projects_global_category
  ON projects(global_category);

DROP INDEX IF EXISTS ix_global_documents_company_category_status;
DROP INDEX IF EXISTS ix_global_documents_company_category_type;
DROP INDEX IF EXISTS ix_global_documents_company_hash;
DROP INDEX IF EXISTS ix_global_document_chunks_company_category;

ALTER TABLE IF EXISTS global_document_chunks
  DROP COLUMN IF EXISTS company_id CASCADE;

ALTER TABLE IF EXISTS global_documents
  DROP COLUMN IF EXISTS company_id CASCADE;

CREATE TABLE IF NOT EXISTS global_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_category VARCHAR(80) NOT NULL,
  title VARCHAR(240) NOT NULL,
  document_type VARCHAR(60) NOT NULL DEFAULT 'general',
  source_type VARCHAR(30) NOT NULL DEFAULT 'upload',
  storage_url TEXT NOT NULL DEFAULT '',
  storage_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  content_hash VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
  indexing_error TEXT NOT NULL DEFAULT '',
  ingestion_attempted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by UUID,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_documents_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_global_documents_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT chk_global_documents_source_type
    CHECK (source_type IN ('upload', 'url', 'legacy_text', 'manual')),
  CONSTRAINT chk_global_documents_status
    CHECK (status IN ('uploaded', 'processing', 'indexed', 'failed', 'archived')),
  CONSTRAINT chk_global_documents_version
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS ix_global_documents_category_status
  ON global_documents(global_category, status);
CREATE INDEX IF NOT EXISTS ix_global_documents_category_type
  ON global_documents(global_category, document_type);
CREATE INDEX IF NOT EXISTS ix_global_documents_active
  ON global_documents(is_active);
CREATE INDEX IF NOT EXISTS ix_global_documents_category_hash
  ON global_documents(global_category, content_hash);

CREATE TABLE IF NOT EXISTS global_document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  global_document_id INTEGER NOT NULL,
  global_category VARCHAR(80) NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_global_document_chunks_document
    FOREIGN KEY (global_document_id) REFERENCES global_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_global_document_chunks_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law')),
  CONSTRAINT chk_global_document_chunks_chunk_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_global_document_chunks_token_count
    CHECK (token_count >= 0),
  CONSTRAINT chk_global_document_chunks_embedding_dimension
    CHECK (embedding_dimension >= 0),
  CONSTRAINT uq_global_document_chunks_document_chunk
    UNIQUE (global_document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_global_document_chunks_category
  ON global_document_chunks(global_category);
CREATE INDEX IF NOT EXISTS ix_global_document_chunks_document_id
  ON global_document_chunks(global_document_id);
CREATE INDEX IF NOT EXISTS ix_global_document_chunks_metadata
  ON global_document_chunks USING GIN (document_metadata);
