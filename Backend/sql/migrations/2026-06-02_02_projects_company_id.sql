ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS company_id INTEGER;

UPDATE projects
SET company_id = (
  SELECT id
  FROM companies
  WHERE slug = 'internzbee-default'
  LIMIT 1
)
WHERE company_id IS NULL;

ALTER TABLE IF EXISTS projects
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_projects_company'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT fk_projects_company
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_projects_company_id
  ON projects(company_id);

CREATE INDEX IF NOT EXISTS ix_projects_company_active
  ON projects(company_id, is_active);
