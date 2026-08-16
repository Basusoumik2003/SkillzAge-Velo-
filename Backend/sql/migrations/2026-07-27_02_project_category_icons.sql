CREATE TABLE IF NOT EXISTS project_category_icons (
  global_category VARCHAR(80) PRIMARY KEY,
  image_url TEXT NOT NULL DEFAULT '',
  image_public_id TEXT NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_category_icons_category
    CHECK (global_category IN ('business_commerce', 'technology_engineering', 'science_research', 'human_social_science', 'media_communication', 'law'))
);