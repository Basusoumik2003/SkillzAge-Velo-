BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS github_commit_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  github_repository_id INTEGER NOT NULL,
  commit_hash VARCHAR(120) NOT NULL,
  parent_commit_hash VARCHAR(120),
  branch_name VARCHAR(120) NOT NULL DEFAULT 'main',
  commit_message TEXT NOT NULL DEFAULT '',
  author_name VARCHAR(160) NOT NULL DEFAULT '',
  author_email VARCHAR(255) NOT NULL DEFAULT '',
  committer_name VARCHAR(160) NOT NULL DEFAULT '',
  committer_email VARCHAR(255) NOT NULL DEFAULT '',
  commit_url TEXT NOT NULL DEFAULT '',
  changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  commit_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  committed_at TIMESTAMPTZ NOT NULL,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_github_commit_history_repository
    FOREIGN KEY (github_repository_id) REFERENCES github_repositories(id) ON DELETE CASCADE,
  CONSTRAINT uq_github_commit_history_repo_commit
    UNIQUE (github_repository_id, commit_hash),
  CONSTRAINT chk_github_commit_history_commit_hash
    CHECK (btrim(commit_hash) <> ''),
  CONSTRAINT chk_github_commit_history_branch
    CHECK (btrim(branch_name) <> '')
);

CREATE INDEX IF NOT EXISTS ix_github_commit_history_repository_committed_at
  ON github_commit_history(github_repository_id, committed_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_commit_history_repository_branch_committed_at
  ON github_commit_history(github_repository_id, branch_name, committed_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_commit_history_commit_hash
  ON github_commit_history(commit_hash);

CREATE INDEX IF NOT EXISTS ix_github_commit_history_committed_at
  ON github_commit_history(committed_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_commit_history_payload_gin
  ON github_commit_history USING GIN (commit_payload);

COMMENT ON TABLE github_commit_history IS 'Append-only commit ledger used to compare the latest commit with the last reviewed commit.';
COMMENT ON COLUMN github_commit_history.changed_files IS 'JSONB array of files and per-file diff metadata.';
COMMENT ON COLUMN github_commit_history.commit_payload IS 'Raw commit payload captured from GitHub API or webhook events.';

COMMIT;
