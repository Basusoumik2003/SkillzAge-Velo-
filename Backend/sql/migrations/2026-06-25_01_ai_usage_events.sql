CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(160) NOT NULL,
  feature VARCHAR(80) NOT NULL,
  route VARCHAR(160) NOT NULL DEFAULT '',
  user_id UUID,
  project_name VARCHAR(160) NOT NULL DEFAULT '',
  related_table VARCHAR(120) NOT NULL DEFAULT '',
  related_id INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  billable_units INTEGER NOT NULL DEFAULT 0,
  raw_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_ai_usage_events_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_ai_usage_events_prompt_tokens CHECK (prompt_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_completion_tokens CHECK (completion_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_total_tokens CHECK (total_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_input_tokens CHECK (input_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_output_tokens CHECK (output_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_cached_tokens CHECK (cached_tokens >= 0),
  CONSTRAINT chk_ai_usage_events_billable_units CHECK (billable_units >= 0)
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_events_created_at
  ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_provider_model
  ON ai_usage_events(provider, model);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_feature_created
  ON ai_usage_events(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ai_usage_events_user_created
  ON ai_usage_events(user_id, created_at DESC);
