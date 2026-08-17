-- Project documents and private reference material for catalog projects
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS introduction_document TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS introduction_document_url TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS private_brd_document TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS private_brd_document_url TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS solution_document TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS solution_document_url TEXT NOT NULL DEFAULT '';
