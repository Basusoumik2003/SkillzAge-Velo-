ALTER TABLE IF EXISTS project_category_icons
  ADD COLUMN IF NOT EXISTS background_image_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_image_public_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_original_filename VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_mime_type VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_file_size_bytes BIGINT NOT NULL DEFAULT 0;
