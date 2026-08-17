BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_working_lookup
  ON project_stage_progress(user_id, project_name, step_number, stage_index)
  WHERE status = 'working';

CREATE INDEX IF NOT EXISTS ix_project_stage_progress_completed_lookup
  ON project_stage_progress(user_id, project_name, step_number, stage_index)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_active_lookup
  ON github_review_jobs(github_repository_id, job_status, queued_at DESC)
  WHERE job_status IN ('queued', 'dispatched', 'running', 'retry_wait');

CREATE INDEX IF NOT EXISTS ix_github_review_jobs_stage_commit
  ON github_review_jobs(stage_id, commit_hash);

CREATE INDEX IF NOT EXISTS ix_github_review_job_results_payload_gin
  ON github_review_job_results USING GIN (review_payload);

CREATE INDEX IF NOT EXISTS ix_notification_history_pending_delivery
  ON notification_history(delivery_status, created_at DESC)
  WHERE delivery_status IN ('queued', 'sent');

CREATE INDEX IF NOT EXISTS ix_notification_history_scheduler_log_id
  ON notification_history(scheduler_log_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_notification_history_scheduler_log'
      AND conrelid = 'notification_history'::regclass
  ) THEN
    ALTER TABLE notification_history
      ADD CONSTRAINT fk_notification_history_scheduler_log
      FOREIGN KEY (scheduler_log_id) REFERENCES scheduler_logs(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_github_activity_logs_correlation_id
  ON github_activity_logs(correlation_id)
  WHERE correlation_id <> '';

CREATE INDEX IF NOT EXISTS ix_github_commit_history_changed_files_gin
  ON github_commit_history USING GIN (changed_files);

CREATE INDEX IF NOT EXISTS ix_scheduler_logs_status_completed
  ON scheduler_logs(run_status, completed_at DESC);

CREATE INDEX IF NOT EXISTS ix_code_reviews_job_id
  ON code_reviews(github_review_job_id);

CREATE INDEX IF NOT EXISTS ix_code_reviews_result_id
  ON code_reviews(github_review_job_result_id)
  WHERE github_review_job_result_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_code_reviews_repository_stage_commit
  ON code_reviews(github_repository_id, stage_id, commit_hash)
  WHERE github_repository_id IS NOT NULL AND stage_id IS NOT NULL AND commit_hash IS NOT NULL;

COMMENT ON INDEX uq_github_activity_logs_correlation_id IS 'Prevents duplicate activity traces when the same correlation id is replayed.';
COMMENT ON INDEX uq_code_reviews_repository_stage_commit IS 'Compatibility-layer duplicate protection for legacy review summary reads.';

COMMIT;
