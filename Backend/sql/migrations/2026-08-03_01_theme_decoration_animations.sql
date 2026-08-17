BEGIN;

ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS animation_type VARCHAR(40) NOT NULL DEFAULT 'none';
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS animation_duration_ms INTEGER NOT NULL DEFAULT 2800;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS animation_amplitude INTEGER NOT NULL DEFAULT 10;
ALTER TABLE theme_decorations ADD COLUMN IF NOT EXISTS blend_light_background BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE theme_decorations DROP CONSTRAINT IF EXISTS chk_theme_decorations_animation_type;
ALTER TABLE theme_decorations ADD CONSTRAINT chk_theme_decorations_animation_type CHECK (animation_type IN ('none', 'pendulum'));

COMMIT;

-- Rollback (run separately):
-- ALTER TABLE theme_decorations DROP CONSTRAINT IF EXISTS chk_theme_decorations_animation_type;
-- ALTER TABLE theme_decorations DROP COLUMN IF EXISTS blend_light_background, DROP COLUMN IF EXISTS animation_amplitude, DROP COLUMN IF EXISTS animation_duration_ms, DROP COLUMN IF EXISTS animation_type;

