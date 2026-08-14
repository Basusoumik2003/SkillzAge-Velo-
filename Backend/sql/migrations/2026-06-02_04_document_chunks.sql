CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_document_chunks_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_chunks_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_chunks_document
    FOREIGN KEY (document_id) REFERENCES project_documents(id) ON DELETE CASCADE,
  CONSTRAINT chk_document_chunks_chunk_index
    CHECK (chunk_index >= 0),
  CONSTRAINT chk_document_chunks_token_count
    CHECK (token_count >= 0),
  CONSTRAINT chk_document_chunks_embedding_dimension
    CHECK (embedding_dimension >= 0),
  CONSTRAINT uq_document_chunks_document_chunk
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_document_chunks_company_project
  ON document_chunks(company_id, project_id);

CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id
  ON document_chunks(document_id);

CREATE INDEX IF NOT EXISTS ix_document_chunks_metadata
  ON document_chunks USING GIN (document_metadata);
