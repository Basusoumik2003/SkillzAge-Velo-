DO $$
DECLARE
  default_company_id INTEGER;
BEGIN
  INSERT INTO companies (name, slug, industry, description, is_active, created_at, updated_at)
  VALUES ('InternzBee Default', 'internzbee-default', '', 'Default company for existing projects.', TRUE, NOW(), NOW())
  ON CONFLICT (slug) DO UPDATE SET updated_at = companies.updated_at
  RETURNING id INTO default_company_id;

  IF default_company_id IS NULL THEN
    SELECT id INTO default_company_id
    FROM companies
    WHERE slug = 'internzbee-default'
    LIMIT 1;
  END IF;

  IF default_company_id IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects ALTER COLUMN company_id SET DEFAULT %s', default_company_id);
  END IF;
END $$;
