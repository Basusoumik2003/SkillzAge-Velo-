-- Admin-managed project catalog
-- Date: 2026-04-30

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  timeline_weeks INTEGER NOT NULL DEFAULT 4,
  category VARCHAR(40) NOT NULL DEFAULT 'normal',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS ix_projects_category ON projects(category);

CREATE TABLE IF NOT EXISTS project_steps (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  title VARCHAR(140) NOT NULL,
  agent_key VARCHAR(60) NOT NULL DEFAULT 'pm_agent',
  step_context TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_steps_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_steps_project_order ON project_steps(project_id, step_order);
CREATE INDEX IF NOT EXISTS ix_project_steps_project_id ON project_steps(project_id);

