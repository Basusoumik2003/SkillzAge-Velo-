ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS complexity VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills_required TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills_gained TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_branch TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_year TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tech_stack TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS short_summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS domain VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prerequisites TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS learning_outcomes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty_score INTEGER NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS ix_projects_domain ON projects(domain);
CREATE INDEX IF NOT EXISTS ix_projects_complexity ON projects(complexity);

CREATE TABLE IF NOT EXISTS project_recommendation_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id INTEGER,
  project_title VARCHAR(160) NOT NULL DEFAULT '',
  rank INTEGER NOT NULL DEFAULT 1,
  match_percent INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  source VARCHAR(60) NOT NULL DEFAULT '',
  resume_url TEXT NOT NULL DEFAULT '',
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_recommendation_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_recommendation_logs_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_user_shown
  ON project_recommendation_logs(user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS ix_project_recommendation_logs_shown
  ON project_recommendation_logs(shown_at DESC);
