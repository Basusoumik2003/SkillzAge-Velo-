ALTER TABLE IF EXISTS global_documents
  DROP CONSTRAINT IF EXISTS chk_global_documents_category;
ALTER TABLE IF EXISTS global_documents
  ADD CONSTRAINT chk_global_documents_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS global_document_chunks
  DROP CONSTRAINT IF EXISTS chk_global_document_chunks_category;
ALTER TABLE IF EXISTS global_document_chunks
  ADD CONSTRAINT chk_global_document_chunks_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS project_global_document_access_settings
  DROP CONSTRAINT IF EXISTS chk_project_global_document_access_settings_category;
ALTER TABLE IF EXISTS project_global_document_access_settings
  ADD CONSTRAINT chk_project_global_document_access_settings_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS project_global_document_access
  DROP CONSTRAINT IF EXISTS chk_project_global_document_access_category;
ALTER TABLE IF EXISTS project_global_document_access
  ADD CONSTRAINT chk_project_global_document_access_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS global_category_document_access_settings
  DROP CONSTRAINT IF EXISTS chk_global_category_document_access_settings_category;
ALTER TABLE IF EXISTS global_category_document_access_settings
  ADD CONSTRAINT chk_global_category_document_access_settings_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS global_category_document_access
  DROP CONSTRAINT IF EXISTS chk_global_category_document_access_category;
ALTER TABLE IF EXISTS global_category_document_access
  ADD CONSTRAINT chk_global_category_document_access_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));

ALTER TABLE IF EXISTS project_category_icons
  DROP CONSTRAINT IF EXISTS chk_project_category_icons_category;
ALTER TABLE IF EXISTS project_category_icons
  ADD CONSTRAINT chk_project_category_icons_category
  CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'));