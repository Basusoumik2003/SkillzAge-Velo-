CREATE TABLE IF NOT EXISTS admin_project_drafts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  draft_key VARCHAR(120) NOT NULL DEFAULT 'project_create',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_admin_project_drafts_admin_user
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_admin_project_drafts_admin_user_key
    UNIQUE (admin_user_id, draft_key)
);

CREATE INDEX IF NOT EXISTS ix_admin_project_drafts_updated_at
  ON admin_project_drafts(updated_at DESC);
