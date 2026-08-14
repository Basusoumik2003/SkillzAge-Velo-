BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

UPDATE github_repositories
SET
  connection_status = COALESCE(connection_status, 'disconnected'),
  default_branch = COALESCE(NULLIF(btrim(default_branch), ''), 'main'),
  webhook_enabled = COALESCE(webhook_enabled, FALSE),
  last_scheduler_check = COALESCE(last_scheduler_check, last_pull_at, connected_at),
  connection_verified_at = COALESCE(connection_verified_at, CASE WHEN connection_status = 'connected' THEN connected_at ELSE NULL END)
WHERE
  connection_status IS NULL
  OR default_branch IS NULL
  OR webhook_enabled IS NULL
  OR last_scheduler_check IS NULL
  OR connection_verified_at IS NULL;

UPDATE github_review_jobs
SET
  review_source = COALESCE(NULLIF(btrim(review_source), ''), 'stage_resolver'),
  triggered_by = COALESCE(NULLIF(btrim(triggered_by), ''), 'system'),
  queue_name = COALESCE(NULLIF(btrim(queue_name), ''), 'github_review_queue'),
  job_status = COALESCE(NULLIF(btrim(job_status), ''), 'queued'),
  retry_count = COALESCE(retry_count, 0),
  priority = COALESCE(priority, 100),
  error_message = COALESCE(error_message, ''),
  job_payload = COALESCE(job_payload, '{}'::jsonb)
WHERE
  review_source IS NULL
  OR triggered_by IS NULL
  OR queue_name IS NULL
  OR job_status IS NULL
  OR retry_count IS NULL
  OR priority IS NULL
  OR error_message IS NULL
  OR job_payload IS NULL;

UPDATE github_review_job_results
SET
  result_status = COALESCE(NULLIF(btrim(result_status), ''), 'succeeded'),
  review_version = COALESCE(review_version, 1),
  model_used = COALESCE(model_used, ''),
  token_usage = COALESCE(token_usage, '{}'::jsonb),
  findings = COALESCE(findings, '[]'::jsonb),
  recommendations = COALESCE(recommendations, '[]'::jsonb),
  review_payload = COALESCE(review_payload, '{}'::jsonb)
WHERE
  result_status IS NULL
  OR review_version IS NULL
  OR model_used IS NULL
  OR token_usage IS NULL
  OR findings IS NULL
  OR recommendations IS NULL
  OR review_payload IS NULL;

UPDATE code_reviews
SET
  review_source = COALESCE(NULLIF(btrim(review_source), ''), 'legacy'),
  review_status = COALESCE(NULLIF(btrim(review_status), ''), 'completed'),
  review_version = COALESCE(review_version, 1),
  overall_score = COALESCE(overall_score, 0),
  reviewed_at = COALESCE(reviewed_at, created_at),
  updated_at = COALESCE(updated_at, NOW())
WHERE
  review_source IS NULL
  OR review_status IS NULL
  OR review_version IS NULL
  OR overall_score IS NULL
  OR reviewed_at IS NULL
  OR updated_at IS NULL;

UPDATE notification_history
SET
  channel = COALESCE(NULLIF(btrim(channel), ''), 'in_app'),
  delivery_status = COALESCE(NULLIF(btrim(delivery_status), ''), 'queued'),
  payload = COALESCE(payload, '{}'::jsonb),
  error_message = COALESCE(error_message, '')
WHERE
  channel IS NULL
  OR delivery_status IS NULL
  OR payload IS NULL
  OR error_message IS NULL;

UPDATE github_activity_logs
SET
  activity_status = COALESCE(NULLIF(btrim(activity_status), ''), 'success'),
  source = COALESCE(NULLIF(btrim(source), ''), 'system'),
  correlation_id = COALESCE(correlation_id, ''),
  details = COALESCE(details, '{}'::jsonb)
WHERE
  activity_status IS NULL
  OR source IS NULL
  OR correlation_id IS NULL
  OR details IS NULL;

UPDATE scheduler_logs
SET
  scheduler_name = COALESCE(NULLIF(btrim(scheduler_name), ''), 'inactive_student_scheduler'),
  run_type = COALESCE(NULLIF(btrim(run_type), ''), 'inactive_student_scan'),
  run_status = COALESCE(NULLIF(btrim(run_status), ''), 'running'),
  payload = COALESCE(payload, '{}'::jsonb),
  error_message = COALESCE(error_message, '')
WHERE
  scheduler_name IS NULL
  OR run_type IS NULL
  OR run_status IS NULL
  OR payload IS NULL
  OR error_message IS NULL;

COMMIT;
