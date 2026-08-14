CREATE TABLE IF NOT EXISTS certificate_requests (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name VARCHAR(160) NOT NULL,
  experience_text TEXT NOT NULL DEFAULT '',
  overall_rating INTEGER NOT NULL DEFAULT 5,
  mentor_rating INTEGER NOT NULL DEFAULT 5,
  project_clarity_rating INTEGER NOT NULL DEFAULT 5,
  support_rating INTEGER NOT NULL DEFAULT 5,
  recommend_rating INTEGER NOT NULL DEFAULT 5,
  feedback_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_url TEXT NOT NULL DEFAULT '',
  video_public_id TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  certificate_issued_at TIMESTAMPTZ,
  certificate_emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_certificate_requests_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_certificate_requests_status
    CHECK (status IN ('submitted', 'generated', 'emailed')),
  CONSTRAINT chk_certificate_requests_overall_rating
    CHECK (overall_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_certificate_requests_mentor_rating
    CHECK (mentor_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_certificate_requests_project_clarity_rating
    CHECK (project_clarity_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_certificate_requests_support_rating
    CHECK (support_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_certificate_requests_recommend_rating
    CHECK (recommend_rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS ix_certificate_requests_user_id
  ON certificate_requests(user_id);
CREATE INDEX IF NOT EXISTS ix_certificate_requests_project_name
  ON certificate_requests(project_name);
CREATE INDEX IF NOT EXISTS ix_certificate_requests_created_at
  ON certificate_requests(created_at DESC);
