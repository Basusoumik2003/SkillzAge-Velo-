BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS scheduler_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheduler_name TEXT NOT NULL DEFAULT 'inactive_student_scheduler',
  run_type TEXT NOT NULL DEFAULT 'inactive_student_scan',
  run_status TEXT NOT NULL DEFAULT 'running',
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processed_count INTEGER NOT NULL DEFAULT 0,
  inactive_count INTEGER NOT NULL DEFAULT 0,
  notification_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  initiated_by_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_scheduler_logs_initiated_by_user
    FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_scheduler_logs_name_scheduled_for
    UNIQUE (scheduler_name, scheduled_for),
  CONSTRAINT chk_scheduler_logs_status
    CHECK (run_status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT chk_scheduler_logs_processed_count
    CHECK (processed_count >= 0 AND inactive_count >= 0 AND notification_count >= 0 AND error_count >= 0)
);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_status_started
  ON scheduler_logs(run_status, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_name_started
  ON scheduler_logs(scheduler_name, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_scheduled_for
  ON scheduler_logs(scheduled_for DESC);

COMMENT ON TABLE scheduler_logs IS 'Execution history for the 3-day inactivity scheduler and reminder dispatches.';

COMMIT;
