BEGIN;

CREATE TABLE IF NOT EXISTS theme_asset_library (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  asset_type VARCHAR(40) NOT NULL,
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum CHAR(64) NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_theme_asset_library_type CHECK (asset_type IN ('banner','decoration','logo','background','image'))
);
CREATE INDEX IF NOT EXISTS ix_theme_asset_library_type_name ON theme_asset_library(asset_type, name);

ALTER TABLE theme_assets ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES theme_asset_library(id) ON DELETE SET NULL;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES theme_asset_library(id) ON DELETE SET NULL;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS placement_slot VARCHAR(40) NOT NULL DEFAULT 'floating';
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS offset_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS offset_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS desktop_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS tablet_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS mobile_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_theme_decorations_asset_id ON theme_decorations(asset_id);
CREATE INDEX IF NOT EXISTS ix_theme_decorations_slot_page ON theme_decorations(theme_id, page, placement_slot, enabled);

CREATE OR REPLACE FUNCTION set_theme_decoration_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS theme_decorations_set_updated_at ON theme_decorations;
CREATE TRIGGER theme_decorations_set_updated_at BEFORE UPDATE ON theme_decorations FOR EACH ROW EXECUTE FUNCTION set_theme_decoration_updated_at();

COMMIT;

-- Rollback (run separately):
-- DROP TRIGGER IF EXISTS theme_decorations_set_updated_at ON theme_decorations;
-- DROP FUNCTION IF EXISTS set_theme_decoration_updated_at();
-- ALTER TABLE theme_decorations DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS mobile_visible, DROP COLUMN IF EXISTS tablet_visible, DROP COLUMN IF EXISTS desktop_visible, DROP COLUMN IF EXISTS offset_y, DROP COLUMN IF EXISTS offset_x, DROP COLUMN IF EXISTS placement_slot, DROP COLUMN IF EXISTS asset_id;
-- ALTER TABLE theme_assets DROP COLUMN IF EXISTS asset_id;
-- DROP TABLE IF EXISTS theme_asset_library;
