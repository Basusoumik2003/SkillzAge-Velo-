CREATE TABLE IF NOT EXISTS self_intro_submissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  video_s3_key TEXT NOT NULL DEFAULT '',
  video_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  analysis_provider VARCHAR(60) NOT NULL DEFAULT 'gemini',
  analysis_model VARCHAR(120) NOT NULL DEFAULT '',
  job_id VARCHAR(160) NOT NULL DEFAULT '',
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_self_intro_submissions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_self_intro_submissions_status
    CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chk_self_intro_submissions_file_size
    CHECK (file_size_bytes >= 0),
  CONSTRAINT chk_self_intro_submissions_duration
    CHECK (duration_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS ix_self_intro_submissions_user_created
  ON self_intro_submissions(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_self_intro_submissions_status_created
  ON self_intro_submissions(status, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS ix_self_intro_submissions_job_id
  ON self_intro_submissions(job_id);

CREATE TABLE IF NOT EXISTS self_intro_reports (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  transcript TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  overall_score INTEGER NOT NULL DEFAULT 0,
  clarity_score INTEGER NOT NULL DEFAULT 0,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  communication_score INTEGER NOT NULL DEFAULT 0,
  body_language_score INTEGER NOT NULL DEFAULT 0,
  structure_score INTEGER NOT NULL DEFAULT 0,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvements JSONB NOT NULL DEFAULT '[]'::jsonb,
  filler_words JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_intro TEXT NOT NULL DEFAULT '',
  interview_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_self_intro_reports_submission
    FOREIGN KEY (submission_id) REFERENCES self_intro_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_self_intro_reports_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_self_intro_reports_overall_score
    CHECK (overall_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_clarity_score
    CHECK (clarity_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_confidence_score
    CHECK (confidence_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_communication_score
    CHECK (communication_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_body_language_score
    CHECK (body_language_score BETWEEN 0 AND 100),
  CONSTRAINT chk_self_intro_reports_structure_score
    CHECK (structure_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS ix_self_intro_reports_user_created
  ON self_intro_reports(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS self_intro_analysis_jobs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  user_id UUID NOT NULL,
  queue_provider VARCHAR(40) NOT NULL DEFAULT 'local',
  external_job_id VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT NOT NULL DEFAULT '',
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_self_intro_analysis_jobs_submission
    FOREIGN KEY (submission_id) REFERENCES self_intro_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_self_intro_analysis_jobs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_self_intro_analysis_jobs_status
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chk_self_intro_analysis_jobs_attempts
    CHECK (attempts >= 0),
  CONSTRAINT chk_self_intro_analysis_jobs_max_attempts
    CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS ix_self_intro_analysis_jobs_status_available
  ON self_intro_analysis_jobs(status, available_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS ix_self_intro_analysis_jobs_submission
  ON self_intro_analysis_jobs(submission_id);

CREATE INDEX IF NOT EXISTS ix_self_intro_analysis_jobs_user_created
  ON self_intro_analysis_jobs(user_id, created_at DESC, id DESC);
