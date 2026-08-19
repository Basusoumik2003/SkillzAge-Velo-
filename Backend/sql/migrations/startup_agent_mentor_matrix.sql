CREATE TABLE IF NOT EXISTS startup_agent_document_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES startup_mentors(id) ON DELETE CASCADE,
  document_kind VARCHAR(30) NOT NULL,
  document_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (document_kind IN ('stage', 'global')),
  UNIQUE (agent_id, document_kind, document_id)
);