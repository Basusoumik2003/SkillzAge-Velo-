BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TABLE IF NOT EXISTS github_review_job_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  github_review_job_id BIGINT NOT NULL,
  result_status TEXT NOT NULL DEFAULT 'succeeded',
  overall_score SMALLINT NOT NULL DEFAULT 0,
  security_score SMALLINT NOT NULL DEFAULT 0,
  architecture_score SMALLINT NOT NULL DEFAULT 0,
  performance_score SMALLINT NOT NULL DEFAULT 0,
  documentation_score SMALLINT NOT NULL DEFAULT 0,
  code_quality_score SMALLINT NOT NULL DEFAULT 0,
  test_score SMALLINT NOT NULL DEFAULT 0,
  risk_score SMALLINT NOT NULL DEFAULT 0,
  policy_score SMALLINT NOT NULL DEFAULT 0,
  review_duration INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
  model_used TEXT NOT NULL DEFAULT '',
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_version INTEGER NOT NULL DEFAULT 1,
  summary TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '',
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_github_review_job_results_job
    FOREIGN KEY (github_review_job_id) REFERENCES github_review_jobs(id) ON DELETE CASCADE,
  CONSTRAINT uq_github_review_job_results_job
    UNIQUE (github_review_job_id),
  CONSTRAINT chk_github_review_job_results_status
    CHECK (result_status IN ('succeeded', 'failed', 'partial')),
  CONSTRAINT chk_github_review_job_results_review_version
    CHECK (review_version >= 1),
  CONSTRAINT chk_github_review_job_results_score_range
    CHECK (
      overall_score BETWEEN 0 AND 100
      AND security_score BETWEEN 0 AND 100
      AND architecture_score BETWEEN 0 AND 100
      AND performance_score BETWEEN 0 AND 100
      AND documentation_score BETWEEN 0 AND 100
      AND code_quality_score BETWEEN 0 AND 100
      AND test_score BETWEEN 0 AND 100
      AND risk_score BETWEEN 0 AND 100
      AND policy_score BETWEEN 0 AND 100
    )
);

ALTER TABLE IF EXISTS code_reviews
  ADD COLUMN IF NOT EXISTS github_repository_id INTEGER,
  ADD COLUMN IF NOT EXISTS stage_id INTEGER,
  ADD COLUMN IF NOT EXISTS github_review_job_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_review_job_result_id BIGINT,
  ADD COLUMN IF NOT EXISTS review_source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS overall_score SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_code_reviews_repository'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT fk_code_reviews_repository
      FOREIGN KEY (github_repository_id) REFERENCES github_repositories(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_code_reviews_stage'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT fk_code_reviews_stage
      FOREIGN KEY (stage_id) REFERENCES project_stage_progress(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_code_reviews_review_job'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT fk_code_reviews_review_job
      FOREIGN KEY (github_review_job_id) REFERENCES github_review_jobs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_code_reviews_review_result'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT fk_code_reviews_review_result
      FOREIGN KEY (github_review_job_result_id) REFERENCES github_review_job_results(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_code_reviews_review_status'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT chk_code_reviews_review_status
      CHECK (review_status IN ('pending', 'completed', 'failed', 'partial', 'legacy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_code_reviews_overall_score'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT chk_code_reviews_overall_score
      CHECK (overall_score BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_code_reviews_review_version'
      AND conrelid = 'code_reviews'::regclass
  ) THEN
    ALTER TABLE code_reviews
      ADD CONSTRAINT chk_code_reviews_review_version
      CHECK (review_version >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_github_review_job_results_job_id
  ON github_review_job_results(github_review_job_id);

CREATE INDEX IF NOT EXISTS ix_github_review_job_results_review_version
  ON github_review_job_results(review_version);

CREATE INDEX IF NOT EXISTS ix_github_review_job_results_created_at
  ON github_review_job_results(created_at DESC);

CREATE INDEX IF NOT EXISTS ix_github_review_job_results_token_usage_gin
  ON github_review_job_results USING GIN (token_usage);

CREATE INDEX IF NOT EXISTS ix_code_reviews_user_commit
  ON code_reviews(user_id, commit_hash);

CREATE INDEX IF NOT EXISTS ix_code_reviews_stage_id
  ON code_reviews(stage_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_code_reviews_result_id
  ON code_reviews(github_review_job_result_id)
  WHERE github_review_job_result_id IS NOT NULL;

COMMENT ON TABLE github_review_job_results IS 'Normalized AI review output for each asynchronous GitHub review job.';
COMMENT ON TABLE code_reviews IS 'Compatibility read model for legacy dashboard queries and review history screens.';

COMMIT;
