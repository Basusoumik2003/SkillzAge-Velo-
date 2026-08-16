BEGIN;

ALTER TABLE themes ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'Seasonal';
ALTER TABLE themes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';
ALTER TABLE themes ADD COLUMN IF NOT EXISTS tokens JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE themes DROP CONSTRAINT IF EXISTS chk_themes_status;
ALTER TABLE themes ADD CONSTRAINT chk_themes_status CHECK (status IN ('draft', 'scheduled', 'published', 'archived'));

ALTER TABLE theme_asset_library ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE theme_asset_library DROP CONSTRAINT IF EXISTS chk_theme_asset_library_type;
ALTER TABLE theme_asset_library ADD CONSTRAINT chk_theme_asset_library_type CHECK (asset_type IN ('banner','decoration','logo','background','icon','animation','image'));

CREATE INDEX IF NOT EXISTS ix_theme_asset_library_tags ON theme_asset_library USING GIN(tags);

COMMIT;

-- Rollback (run separately):
-- DROP INDEX IF EXISTS ix_theme_asset_library_tags;
-- ALTER TABLE theme_asset_library DROP COLUMN IF EXISTS tags;
-- ALTER TABLE themes DROP COLUMN IF EXISTS tokens, DROP COLUMN IF EXISTS thumbnail_url, DROP COLUMN IF EXISTS category;
-- ALTER TABLE themes DROP CONSTRAINT IF EXISTS chk_themes_status;
-- ALTER TABLE themes ADD CONSTRAINT chk_themes_status CHECK (status IN ('draft', 'published', 'archived'));
