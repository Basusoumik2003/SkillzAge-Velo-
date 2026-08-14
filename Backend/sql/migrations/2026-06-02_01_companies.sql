CREATE TABLE IF NOT EXISTS companies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  industry VARCHAR(120) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_companies_is_active
  ON companies(is_active);

INSERT INTO companies (name, slug, industry, description, is_active, created_at, updated_at)
VALUES ('InternzBee Default', 'internzbee-default', '', 'Default company for existing projects.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
