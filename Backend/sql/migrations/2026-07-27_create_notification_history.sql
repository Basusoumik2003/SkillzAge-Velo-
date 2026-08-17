BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  github_repository_id INTEGER,
  github_review_job_id BIGINT,
  github_review_job_result_id BIGINT,
  stage_id INTEGER,
  scheduler_log_id BIGINT,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  delivery_status TEXT NOT NULL DEFAULT 'queued',
  dedupe_key VARCHAR(240) NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_notification_history_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_history_repository
    FOREIGN KEY (github_repository_id) REFERENCES github_repositories(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_history_job
    FOREIGN KEY (github_review_job_id) REFERENCES github_review_jobs(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_history_result
    FOREIGN KEY (github_review_job_result_id) REFERENCES github_review_job_results(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_history_stage
    FOREIGN KEY (stage_id) REFERENCES project_stage_progress(id) ON DELETE SET NULL,
  CONSTRAINT uq_notification_history_dedupe_key
    UNIQUE (dedupe_key),
  CONSTRAINT chk_notification_history_type
    CHECK (notification_type IN (
      'github_connect_required',
      'review_ready',
      'review_failed',
      'inactive_reminder',
      'scheduler_summary'
    )),
  CONSTRAINT chk_notification_history_channel
    CHECK (channel IN ('in_app', 'email', 'push', 'sms')),
  CONSTRAINT chk_notification_history_delivery_status
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  CONSTRAINT chk_notification_history_dedupe_key
    CHECK (btrim(dedupe_key) <> '')
);

CREATE INDEX IF NOT EXISTS ix_notification_history_user_created
  ON notification_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_history_status_created
  ON notification_history(delivery_status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_history_type_created
  ON notification_history(notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_history_unread
  ON notification_history(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notification_history_payload_gin
  ON notification_history USING GIN (payload);

COMMENT ON TABLE notification_history IS 'Append-only notification ledger for connection prompts, review outcomes, and inactivity reminders.';

COMMIT;
