BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS github_activity_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID,
  github_repository_id INTEGER,
  github_commit_history_id BIGINT,
  github_review_job_id BIGINT,
  stage_id INTEGER,
  activity_type TEXT NOT NULL,
  activity_status TEXT NOT NULL DEFAULT 'success',
  source TEXT NOT NULL DEFAULT 'system',
  correlation_id VARCHAR(120) NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_github_activity_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_github_activity_logs_repository
    FOREIGN KEY (github_repository_id) REFERENCES github_repositories(id) ON DELETE SET NULL,
  CONSTRAINT fk_github_activity_logs_commit
    FOREIGN KEY (github_commit_history_id) REFERENCES github_commit_history(id) ON DELETE SET NULL,
  CONSTRAINT fk_github_activity_logs_job
    FOREIGN KEY (github_review_job_id) REFERENCES github_review_jobs(id) ON DELETE SET NULL,
  CONSTRAINT fk_github_activity_logs_stage
    FOREIGN KEY (stage_id) REFERENCES project_stage_progress(id) ON DELETE SET NULL,
  CONSTRAINT chk_github_activity_logs_type
    CHECK (activity_type IN (
      'stage_entered',
      'repo_checked',
      'commit_compared',
      'review_job_created',
      'review_job_enqueued',
      'webhook_received',
      'webhook_processed',
      'notification_emitted',
      'scheduler_scan_started',
      'scheduler_scan_completed',
      'scheduler_reminder_sent',
      'review_completed',
      'review_failed'
    )),
  CONSTRAINT chk_github_activity_logs_status
    CHECK (activity_status IN ('success', 'failure', 'skipped')),
  CONSTRAINT chk_github_activity_logs_source
    CHECK (source IN ('system', 'stage_resolver', 'webhook', 'scheduler', 'worker', 'api')),
  CONSTRAINT chk_github_activity_logs_correlation_id
    CHECK (correlation_id = '' OR btrim(correlation_id) <> '')
);

CREATE INDEX IF NOT EXISTS ix_github_activity_logs_user_occurred
  ON github_activity_logs(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_activity_logs_repository_occurred
  ON github_activity_logs(github_repository_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_activity_logs_job_occurred
  ON github_activity_logs(github_review_job_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_activity_logs_type_occurred
  ON github_activity_logs(activity_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_activity_logs_details_gin
  ON github_activity_logs USING GIN (details);

COMMENT ON TABLE github_activity_logs IS 'Audit trail for Stage Resolver, webhook, worker, and scheduler events.';

COMMIT;
