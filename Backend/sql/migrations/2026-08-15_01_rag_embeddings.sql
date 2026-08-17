BEGIN;

-- Real vector storage for knowledge_sources chunks (was schema-only before).
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding DOUBLE PRECISION[];
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER NOT NULL DEFAULT 0;

-- Mirrors knowledge_chunks, but for stage_documents (which had no chunk table at all).
CREATE TABLE IF NOT EXISTS stage_document_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_document_id BIGINT NOT NULL REFERENCES stage_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding_model VARCHAR(120) NOT NULL DEFAULT '',
  embedding DOUBLE PRECISION[],
  embedding_dimension INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stage_document_chunks_doc_index UNIQUE (stage_document_id, chunk_index),
  CONSTRAINT chk_stage_document_chunks_chunk_index CHECK (chunk_index >= 0),
  CONSTRAINT chk_stage_document_chunks_token_count CHECK (token_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_stage_document_chunks_stage_document_id ON stage_document_chunks(stage_document_id);

COMMIT;

-- Rollback (run separately):
-- DROP TABLE IF EXISTS stage_document_chunks;
-- ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS embedding_dimension, DROP COLUMN IF EXISTS embedding;
