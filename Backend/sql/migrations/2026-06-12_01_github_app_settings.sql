CREATE TABLE IF NOT EXISTS github_app_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  github_token TEXT NOT NULL DEFAULT '',
  webhook_secret TEXT NOT NULL DEFAULT '',
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_github_app_settings_active_updated
  ON github_app_settings(is_active, updated_at DESC);
