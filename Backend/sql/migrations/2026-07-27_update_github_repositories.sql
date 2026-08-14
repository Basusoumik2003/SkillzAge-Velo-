BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

ALTER TABLE IF EXISTS github_repositories
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS webhook_id BIGINT,
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS last_reviewed_commit VARCHAR(120),
  ADD COLUMN IF NOT EXISTS last_pull_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_scheduler_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_branch VARCHAR(120) NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS connection_verified_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS github_repositories
  ALTER COLUMN branch_name SET DEFAULT 'main';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'github_repositories_user_id_key'
      AND conrelid = 'github_repositories'::regclass
  ) THEN
    ALTER TABLE github_repositories
      DROP CONSTRAINT github_repositories_user_id_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_github_repositories_connection_status'
      AND conrelid = 'github_repositories'::regclass
  ) THEN
    ALTER TABLE github_repositories
      ADD CONSTRAINT chk_github_repositories_connection_status
      CHECK (
        connection_status IN (
          'disconnected',
          'connecting',
          'connected',
          'invalid_repository',
          'invalid_branch',
          'revoked',
          'error'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_github_repositories_default_branch'
      AND conrelid = 'github_repositories'::regclass
  ) THEN
    ALTER TABLE github_repositories
      ADD CONSTRAINT chk_github_repositories_default_branch
      CHECK (btrim(default_branch) <> '');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_github_repositories_project_name
  ON github_repositories(project_name);

CREATE INDEX IF NOT EXISTS ix_github_repositories_webhook_id
  ON github_repositories(webhook_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_github_repositories_user_project'
      AND conrelid = 'github_repositories'::regclass
  ) THEN
    ALTER TABLE github_repositories
      ADD CONSTRAINT uq_github_repositories_user_project UNIQUE (user_id, project_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_github_repositories_connection_status
  ON github_repositories(connection_status);

CREATE INDEX IF NOT EXISTS ix_github_repositories_webhook_enabled
  ON github_repositories(webhook_enabled);

CREATE INDEX IF NOT EXISTS ix_github_repositories_last_pull_at
  ON github_repositories(last_pull_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_repositories_last_scheduler_check
  ON github_repositories(last_scheduler_check DESC);

CREATE INDEX IF NOT EXISTS ix_github_repositories_last_reviewed_commit
  ON github_repositories(last_reviewed_commit);

COMMENT ON COLUMN github_repositories.connection_status IS 'Lifecycle state for the repository connection used by Stage Resolver and webhook handling.';
COMMENT ON COLUMN github_repositories.last_reviewed_commit IS 'Last commit hash that was successfully reviewed.';
COMMENT ON COLUMN github_repositories.last_scheduler_check IS 'Last timestamp when the activity scheduler inspected this repository.';
COMMENT ON COLUMN github_repositories.webhook_enabled IS 'True when the repository is registered for instant webhook-based reviews.';
COMMENT ON COLUMN github_repositories.default_branch IS 'Default branch used when validating repository health and pulling commit heads.';

COMMIT;
