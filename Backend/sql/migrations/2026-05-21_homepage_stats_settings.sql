-- Homepage highlight numbers managed from the admin panel.

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value TEXT NOT NULL,
  value_type VARCHAR(30) NOT NULL DEFAULT 'string',
  description TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value, value_type, description, created_at, updated_at)
VALUES
  ('home_stats_learners_suffix', '', 'string', 'Homepage active learners stat suffix. The value comes from users count.', NOW(), NOW()),
  ('home_stats_projects_suffix', '', 'string', 'Homepage real projects stat suffix. The value comes from projects count.', NOW(), NOW()),
  ('home_stats_satisfaction_value', '98', 'integer', 'Homepage satisfaction stat value.', NOW(), NOW()),
  ('home_stats_satisfaction_suffix', '%', 'string', 'Homepage satisfaction stat suffix.', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
