BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS github_review_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  github_repository_id INTEGER NOT NULL,
  github_commit_history_id BIGINT NOT NULL,
  stage_id INTEGER NOT NULL,
  commit_hash VARCHAR(120) NOT NULL,
  branch_name VARCHAR(120) NOT NULL DEFAULT 'main',
  review_source TEXT NOT NULL DEFAULT 'stage_resolver',
  triggered_by TEXT NOT NULL DEFAULT 'system',
  worker_id VARCHAR(120),
  queue_name VARCHAR(120) NOT NULL DEFAULT 'github_review_queue',
  queue_message_id VARCHAR(120),
  job_status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  priority SMALLINT NOT NULL DEFAULT 100,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  error_code VARCHAR(120),
  error_message TEXT NOT NULL DEFAULT '',
  job_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_github_review_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_github_review_jobs_repository
    FOREIGN KEY (github_repository_id) REFERENCES github_repositories(id) ON DELETE CASCADE,
  CONSTRAINT fk_github_review_jobs_commit
    FOREIGN KEY (github_commit_history_id) REFERENCES github_commit_history(id) ON DELETE CASCADE,
  CONSTRAINT fk_github_review_jobs_stage
    FOREIGN KEY (stage_id) REFERENCES project_stage_progress(id) ON DELETE CASCADE,
  CONSTRAINT uq_github_review_jobs_repo_stage_commit
    UNIQUE (github_repository_id, stage_id, commit_hash),
  CONSTRAINT chk_github_review_jobs_review_source
    CHECK (review_source IN ('stage_resolver', 'webhook', 'scheduler', 'backfill')),
  CONSTRAINT chk_github_review_jobs_triggered_by
    CHECK (triggered_by IN ('system', 'student', 'webhook', 'scheduler', 'admin', 'worker')),
  CONSTRAINT chk_github_review_jobs_status
    CHECK (job_status IN ('queued', 'dispatched', 'running', 'succeeded', 'failed', 'retry_wait', 'cancelled')),
  CONSTRAINT chk_github_review_jobs_retry_count
    CHECK (retry_count >= 0),
  CONSTRAINT chk_github_review_jobs_priority
    CHECK (priority >= 0 AND priority <= 1000),
  CONSTRAINT chk_github_review_jobs_commit_hash
    CHECK (btrim(commit_hash) <> ''),
  CONSTRAINT chk_github_review_jobs_branch
    CHECK (btrim(branch_name) <> ''),
  CONSTRAINT chk_github_review_jobs_queue_name
    CHECK (btrim(queue_name) <> '')
);

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_user_status_created
  ON github_review_jobs(user_id, job_status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_repository_commit
  ON github_review_jobs(github_repository_id, commit_hash);

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_stage_status
  ON github_review_jobs(stage_id, job_status, queued_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_queue_status
  ON github_review_jobs(queue_name, job_status, queued_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_commit_history
  ON github_review_jobs(github_commit_history_id);

COMMENT ON TABLE github_review_jobs IS 'Stage-driven asynchronous GitHub review work item created by Stage Resolver or webhook processing.';
COMMENT ON COLUMN github_review_jobs.review_source IS 'Origin of the review request, used for analytics and deduplication.';
COMMENT ON COLUMN github_review_jobs.triggered_by IS 'Actor category that caused the job to be created.';
COMMENT ON COLUMN github_review_jobs.queue_name IS 'Logical queue name used by the review worker.';

COMMIT;
