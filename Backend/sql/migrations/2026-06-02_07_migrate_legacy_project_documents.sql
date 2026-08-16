INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Company Overview',
  'introduction',
  CASE
    WHEN COALESCE(p.introduction_document, '') <> '' THEN 'legacy_text'
    ELSE 'url'
  END,
  COALESCE(p.introduction_document_url, ''),
  '',
  COALESCE(p.introduction_document, ''),
  CASE
    WHEN COALESCE(p.introduction_document, '') <> '' THEN 'uploaded'
    ELSE 'uploaded'
  END,
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE (COALESCE(p.introduction_document, '') <> '' OR COALESCE(p.introduction_document_url, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'introduction'
      AND d.source_type IN ('legacy_text', 'url')
  );

INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Company Profile',
  'company_profile',
  'legacy_text',
  '',
  '',
  COALESCE(p.company_profile_text, ''),
  'uploaded',
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE COALESCE(p.company_profile_text, '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'company_profile'
      AND d.source_type = 'legacy_text'
  );

INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Private BRD',
  'private_brd',
  CASE
    WHEN COALESCE(p.private_brd_document, '') <> '' THEN 'legacy_text'
    ELSE 'url'
  END,
  COALESCE(p.private_brd_document_url, ''),
  '',
  COALESCE(p.private_brd_document, ''),
  'uploaded',
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE (COALESCE(p.private_brd_document, '') <> '' OR COALESCE(p.private_brd_document_url, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'private_brd'
      AND d.source_type IN ('legacy_text', 'url')
  );

INSERT INTO project_documents (
  company_id,
  project_id,
  title,
  document_type,
  source_type,
  storage_url,
  original_filename,
  raw_text,
  status,
  version,
  is_active,
  indexed_at,
  created_at,
  updated_at
)
SELECT
  p.company_id,
  p.id,
  'Solution Document',
  'solution',
  CASE
    WHEN COALESCE(p.solution_document, '') <> '' THEN 'legacy_text'
    ELSE 'url'
  END,
  COALESCE(p.solution_document_url, ''),
  '',
  COALESCE(p.solution_document, ''),
  'uploaded',
  1,
  TRUE,
  NULL,
  NOW(),
  NOW()
FROM projects p
WHERE (COALESCE(p.solution_document, '') <> '' OR COALESCE(p.solution_document_url, '') <> '')
  AND NOT EXISTS (
    SELECT 1
    FROM project_documents d
    WHERE d.project_id = p.id
      AND d.document_type = 'solution'
      AND d.source_type IN ('legacy_text', 'url')
  );
