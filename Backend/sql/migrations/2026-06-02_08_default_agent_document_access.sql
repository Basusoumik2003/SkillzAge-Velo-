INSERT INTO agent_document_access (
  company_id,
  project_id,
  mentor_id,
  document_id,
  access_level,
  created_at,
  updated_at
)
SELECT
  d.company_id,
  d.project_id,
  m.id,
  d.id,
  CASE
    WHEN m.is_hidden = TRUE THEN 'hidden_review'
    WHEN d.document_type = 'private_brd' THEN 'review'
    ELSE 'read'
  END,
  NOW(),
  NOW()
FROM project_documents d
CROSS JOIN project_mentors m
WHERE d.is_active = TRUE
  AND (
    m.is_hidden = TRUE
    OR d.document_type <> 'solution'
  )
ON CONFLICT (mentor_id, document_id) DO NOTHING;
