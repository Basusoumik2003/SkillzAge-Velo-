BEGIN;

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_themes_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT chk_themes_date_range CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_themes_one_active ON themes (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ix_themes_status_dates ON themes (status, start_date, end_date);

CREATE TABLE IF NOT EXISTS theme_assets (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  asset_type VARCHAR(40) NOT NULL,
  page VARCHAR(40) NOT NULL DEFAULT 'global',
  file_url TEXT NOT NULL,
  alt_text VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_theme_assets_type CHECK (asset_type IN ('banner', 'image'))
);
CREATE INDEX IF NOT EXISTS ix_theme_assets_theme_page ON theme_assets(theme_id, page, asset_type);

CREATE TABLE IF NOT EXISTS theme_decorations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  image_url TEXT NOT NULL,
  page VARCHAR(40) NOT NULL DEFAULT 'global',
  position VARCHAR(40) NOT NULL,
  width INTEGER NOT NULL DEFAULT 160,
  height INTEGER,
  z_index INTEGER NOT NULL DEFAULT 10,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_theme_decorations_position CHECK (position IN ('top', 'bottom', 'top_left', 'top_right', 'bottom_left', 'bottom_right', 'left_edge', 'right_edge', 'center_left', 'center_right', 'floating')),
  CONSTRAINT chk_theme_decorations_dimensions CHECK (width > 0 AND width <= 2400 AND (height IS NULL OR height > 0))
);
CREATE INDEX IF NOT EXISTS ix_theme_decorations_theme_page_enabled ON theme_decorations(theme_id, page, enabled);

CREATE TABLE IF NOT EXISTS theme_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  theme_id INTEGER NOT NULL UNIQUE REFERENCES themes(id) ON DELETE CASCADE,
  show_top_decoration BOOLEAN NOT NULL DEFAULT TRUE,
  show_bottom_decoration BOOLEAN NOT NULL DEFAULT TRUE,
  show_side_decorations BOOLEAN NOT NULL DEFAULT TRUE,
  show_banner BOOLEAN NOT NULL DEFAULT TRUE,
  show_popup BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_theme_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS themes_set_updated_at ON themes;
CREATE TRIGGER themes_set_updated_at BEFORE UPDATE ON themes FOR EACH ROW EXECUTE FUNCTION set_theme_updated_at();
COMMIT;

-- Rollback (run separately):
-- DROP TRIGGER IF EXISTS themes_set_updated_at ON themes;
-- DROP FUNCTION IF EXISTS set_theme_updated_at();
-- DROP TABLE IF EXISTS theme_settings, theme_decorations, theme_assets, themes;
